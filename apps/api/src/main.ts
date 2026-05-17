import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseLogLevel } from '@scoutlgs/core';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: parseLogLevel(process.env.LOG_LEVEL),
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  // Cookie parser
  app.use(cookieParser());

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

  // Global path prefix (Cloudflare Tunnel routes /api/* to this service).
  app.setGlobalPrefix('api');

  // URI-based API versioning. Controllers default to v1 unless they opt out
  // via `VERSION_NEUTRAL` (used by /api/card and /api/health). Adding v2 of
  // a resource later is just a second controller with `version: '2'`.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  const port = configService.get<number>('port') ?? 5000;
  await app.listen(port);
  logger.log(`API is running on: http://localhost:${port}`);
  logger.log(`CORS enabled for: ${frontendUrl}`);
}
bootstrap();
