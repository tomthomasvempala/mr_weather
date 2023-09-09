import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
import { TelegramService } from './telegram/telegram.service';

@Module({
  imports: [TelegramModule],
  controllers: [AppController],
  providers: [AppService,TelegramService],
})
export class AppModule {}
