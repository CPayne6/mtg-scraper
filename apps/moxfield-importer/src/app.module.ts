import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QueueModule } from '@scoutlgs/core';
import { MoxfieldBrowserService } from './moxfield-browser.service';
import { MoxfieldImportProcessor } from './moxfield-import.processor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), QueueModule],
  providers: [MoxfieldBrowserService, MoxfieldImportProcessor],
})
export class AppModule {}
