import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseLogLevel } from '@scoutlgs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: parseLogLevel(process.env.LOG_LEVEL),
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Enable CORS for the frontend
  const frontendUrl = configService.get<string>('frontendUrl');
  app.enableCors({
    origin: frontendUrl,
    credentials: true,
  });

  // Add global prefix for Cloudflare Tunnel path-based routing
  // All API routes will be accessible under /api (e.g., /api/cards, /api/health)
  app.setGlobalPrefix('api');

  const port = configService.get<number>('port') ?? 5000;
  await app.listen(port);
  logger.log(`API is running on: http://localhost:${port}`);
  logger.log(`CORS enabled for: ${frontendUrl}`);
}
bootstrap();
