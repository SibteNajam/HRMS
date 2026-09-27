import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.use(cookieParser());

  // credentials: true is required for the session cookie to travel.
  // The origin is an exact match, never '*'.
  app.enableCors({
    origin: config.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist is a security control, not tidiness: it strips properties
      // that are not on the DTO, so a client cannot smuggle `status: APPROVED`
      // into a request body.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const port = config.getOrThrow<number>('PORT');
  await app.listen(port);
  logger.log(`Cadre API listening on http://localhost:${port}/api`);
}

await bootstrap();
