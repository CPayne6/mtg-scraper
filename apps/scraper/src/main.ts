import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { parseLogLevel } from '@scoutlgs/core';

async function bootstrap() {
  const logger = new Logger('ScraperMicroservice');

  const app = await NestFactory.create(AppModule, {
    logger: parseLogLevel(process.env.LOG_LEVEL),
  });

  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );

  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  logger.log(`🚀 Scraper microservice is running on port ${port}`);
  logger.log(`📦 Processing jobs from Redis queue`);
}
bootstrap();
