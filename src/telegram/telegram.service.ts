import { Injectable, Logger } from '@nestjs/common';
const axios = require('axios');
import * as cron from 'node-cron';
import { firebaseAdmin } from './firebase.config';
import { firestore } from 'firebase-admin';
require('dotenv').config();



const TelegramBot = require('node-telegram-bot-api');

@Injectable()
export class TelegramService {
    private readonly bot;
    private logger = new Logger(TelegramService.name)
    private token = process.env.BOT_TOKEN;
    private db;
    private scheduledTask: cron.ScheduledTask | null = null;
    private chatState = {};
    constructor() {
        console.log(process.env.BOT_TOKEN)
        this.db = firebaseAdmin.firestore();
        this.bot = new TelegramBot(this.token, { polling: true });
        this.handleMessages()
        this.scheduleMessage();
        this.db.collection('metadata').doc('scheduledTime')
            .onSnapshot((snapshot) => {
                const data = snapshot.data();
                if (data) {
                    const cronExpression = data.minute + " " + data.hour + " * * *"
                    console.log(cronExpression)
                    this.scheduleMessage(cronExpression);
                }
            });
    }

    async handleSubscribeCommand(msg) {
        const chatID = msg.chat.id;
        const collectionRef = this.db.collection('subscribers');
        let currentUsers = [];
        await collectionRef.get()
            .then(async (querySnapshot) => {
                await querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    currentUsers.push(data)
                });
            })
            .catch((error: any) => {
                console.error('Error getting documents:', error);
            });
        console.log(currentUsers)
        if (currentUsers.some((e) => { return e.user == chatID })) {
            this.bot.sendMessage(chatID, 'Already registed')
        }
        else {
            this.bot.sendMessage(chatID, 'Welcome to Mr. Weather! 🌦️ You are now subscribed to our weather updates. You will receive daily weather forecasts for your location.')
            this.bot.sendMessage(chatID, 'Please enter your location:')
            this.chatState[msg.chat.id] = 'locationReq'
        }
    }

    async handleUnsubscribeCommand(msg) {
        
        this.chatState[msg.chat.id] = ''
        this.db.collection('subscribers').where('user', '==', msg.chat.id).get().then((snap) => {
            snap.forEach((doc) => {
                doc.ref.delete()
            })
        })
        this.bot.sendMessage(msg.chat.id, "We're sorry to see you go! 😢 You have been unsubscribed from Mr. Weather's updates. Feel free to subscribe again anytime by using the /sub command.")

    }

    async handleOtherMessages(msg) {
        if (this.chatState[msg.chat.id] === 'locationReq') {

            const collectionRef = this.db.collection('subscribers');
            await collectionRef.add({ user: msg.chat.id, location: msg.text })
            console.log('added ' + msg.text)
            const timeRef = await this.db.collection('metadata').doc('scheduledTime').get()
            const time = timeRef.data()
            this.bot.sendMessage(msg.chat.id, 'Subscription succesful. You will get updated regarding weather at ' + msg.text + ' at ' + time.hour + ':' + time.minute + ' everyday.')
            
            this.chatState[msg.chat.id] = ''
        }
        else {
            this.bot.sendMessage(msg.chat.id, 'Didnt quite get it. Enter /help for command manual')
        }
    }
    async handleNowCommand(msg) {
        
        this.chatState[msg.chat.id] = ''
        const data = await this.getUserData()
        const subscriber = data.find((e) => e.user == msg.chat.id)
        console.log(subscriber)
        if (subscriber) {
            const weatherData = this.parseWeather(await this.getWeather(subscriber.location))
            this.bot.sendMessage(subscriber.user, weatherData)
        }
        else {

            this.bot.sendMessage(msg.chat.id, "Subscribe to our service first")
        }
    }

    async handleHelpCommand(msg) {
        this.chatState[msg.chat.id] = ''
        this.bot.sendMessage(msg.chat.id, `
        Welcome to Mr. Weather! Here are the available commands:
        
        /sub - Subscribe to daily weather updates.
        /unsub - Unsubscribe from weather updates.
        /now - Get the current weather conditions.
        /help - Display this help message.
        
        Feel free to use these commands anytime to stay updated on the weather!
        `)

    }

    // Set up command handlers
    handleMessages() {
        this.bot.onText(/\/sub/, (msg) =>this.handleSubscribeCommand(msg));
        this.bot.onText(/\/unsub/, (msg) => this.handleUnsubscribeCommand(msg));
        this.bot.onText(/\/now/, (msg) => this.handleNowCommand(msg));
        this.bot.onText(/\/help/, (msg) => this.handleHelpCommand(msg));
        this.bot.onText(/^(?!\/)\S+/, (msg) => this.handleOtherMessages(msg))
    }

    private scheduleMessage(cronExpression?: string) {
        if (this.scheduledTask) {
            this.scheduledTask.stop();
        }
        this.scheduledTask = cron.schedule(cronExpression || '0 0 * * *', () => {
            this.broadcastToSubscribers()
        });
    }

    async getUserData(): Promise<Array<any>> {
        const collectionRef = this.db.collection('subscribers');
        let users = [];
        await collectionRef.get()
            .then(async (querySnapshot) => {
                await querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    users.push(data)
                });
            })
            .catch((error: any) => {
                console.error('Error getting documents:', error);
            });
        return users;
    }

    async broadcastToSubscribers() {
        const currentSubscribers = await this.getUserData();
        currentSubscribers.forEach(async (subscriber: any) => {
            const weatherData = this.parseWeather(await this.getWeather(subscriber.location))
            this.bot.sendMessage(subscriber.chatID, weatherData)
        })
    }


    async getWeather(city: string) {
        try {
            const response = await axios.get(
                'http://api.weatherstack.com/current?access_key=a210b34c8ff6bacb28af38f914608efd&query=$' + city
            );
            console.log(response.data)
            return response.data;
        } catch (error) {
            console.error('Error fetching weather data:', error);
            throw error;
        }
    }

    parseWeather(weatherData) {
        try {
            const location = weatherData.location;
            const current = weatherData.current;

            const weatherDescription = current.weather_descriptions[0];
            const temperature = current.temperature;
            const humidity = current.humidity;
            const windSpeed = current.wind_speed;
            const observationTime = current.observation_time;

            const formattedWeather = `
          Weather in ${location.name}, ${location.region}, ${location.country}:
\n🌡️ Temperature: ${temperature}°C
\n🌫️ Conditions: ${weatherDescription}
\n💧 Humidity: ${humidity}%
\n🌬️ Wind Speed: ${windSpeed} km/h
        `;

            return formattedWeather;
        }
        catch {
            return 'Internal error. Try resubscribing'
        }
    }
}
