import { setDefaultResultOrder } from 'node:dns';
import { setDefaultAutoSelectFamily } from 'node:net';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

/**
 * Prefer IPv4 when a hostname resolves to both.
 *
 * Node 17 changed the default to `verbatim`, which follows whatever order
 * DNS returned. Gmail publishes A and AAAA records for both smtp. and
 * imap., so on a host with no IPv6 route the connection fails with
 * EHOSTUNREACH — intermittently, because the order varies between
 * resolutions. A mail server that works four times in five is worse than
 * one that plainly does not, because nobody investigates it.
 *
 * Safe where IPv6 does work: an A record is still a route to the same
 * service. Remove this only if the deployment is IPv6-only.
 */
setDefaultResultOrder('ipv4first');

/**
 * ...and actually use that order.
 *
 * Node 20 turned on Happy Eyeballs by default: `net.connect` races both
 * address families in parallel, so `ipv4first` only decides which one
 * starts a few milliseconds earlier. On a host with no IPv6 route the v6
 * attempt does not fail fast — it sits until the socket times out, which
 * is how an IMAP poll took the whole process down.
 *
 * Turning the race off makes the resolver order binding: first address
 * wins, and with ipv4first that is the one this host can actually reach.
 */
setDefaultAutoSelectFamily(false);

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
  logger.log(`AI-HRMS API listening on http://localhost:${port}/api`);
}

await bootstrap();
