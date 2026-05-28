import { Module } from '@nestjs/common';
import { WebBotAuthService } from './web-bot-auth.service';

@Module({
  providers: [WebBotAuthService],
  exports: [WebBotAuthService],
})
export class WebBotAuthModule {}
