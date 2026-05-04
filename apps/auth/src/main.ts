import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { parseLogLevel } from '@scoutlgs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: parseLogLevel(process.env.LOG_LEVEL),
  });
  const logger = new Logger('AuthBootstrap');
  const configService = app.get(ConfigService);

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: configService.get<string>('frontendUrl'),
    credentials: true,
  });

  app.setGlobalPrefix('auth');

  const port = configService.get<number>('port') ?? 5002;
  await app.listen(port);
  logger.log(`Auth service is running on: http://localhost:${port}`);
}

void bootstrap();
