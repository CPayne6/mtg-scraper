import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
  new Logger('OptimizerWorker').log('Card optimizer worker started (concurrency=1)');
}
void bootstrap();
