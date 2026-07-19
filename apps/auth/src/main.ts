import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { parseLogLevel } from '@scoutlgs/core';
import { AppModule } from './app.module';

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
  const logger = new Logger('AuthBootstrap');
  const configService = app.get(ConfigService);

  const trustProxy = configService.get<string>('trustProxy');
  if (trustProxy?.trim()) {
    app.set('trust proxy', parseTrustProxy(trustProxy));
  }

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const frontendUrl = configService.get<string>('frontendUrl') ?? '';
  const allowedOrigins = frontendUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins.length > 1 ? allowedOrigins : allowedOrigins[0],
    credentials: true,
  });

  app.setGlobalPrefix('auth');

  const port = configService.get<number>('port') ?? 5002;
  await app.listen(port);
  logger.log(`Auth service is running on: http://localhost:${port}`);
}

void bootstrap();
