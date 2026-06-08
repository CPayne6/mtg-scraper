import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { parseLogLevel } from '@scoutlgs/core';

function parseTrustProxy(value: string): boolean | number | string {
  const trimmed = value.trim();
  if (trimmed === 'true') return 1;
  if (trimmed === 'false') return false;
  const asNumber = Number(trimmed);
  return Number.isFinite(asNumber) ? asNumber : trimmed;
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: parseLogLevel(process.env.LOG_LEVEL),
  });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  const trustProxy = configService.get<string>('trustProxy');
  if (trustProxy?.trim()) {
    app.set('trust proxy', parseTrustProxy(trustProxy));
  }

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

  // Enable CORS for the frontend. FRONTEND_URL is a comma-separated list so
  // dev can serve the UI from multiple ports (and prod can stay single-origin).
  // Nest's enableCors `origin` accepts string | string[]; a literal comma-string
  // would only match a request Origin equal to that exact comma-string.
  const frontendUrl = configService.get<string>('frontendUrl') ?? '';
  const allowedOrigins = frontendUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length > 1 ? allowedOrigins : allowedOrigins[0],
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
