import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { initCryptoKeys } from './crypto/crypto-keys.js';

async function bootstrap() {
  // Initialize the at-rest encryption keys from the environment before the Nest
  // app (and its entity transformers) come up. Fails fast on a missing/invalid
  // key so a misconfiguration never starts serving with weakened security.
  initCryptoKeys((name) => process.env[name]);
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  // CORS: allow the configured frontend origin(s) to call the API from the
  // browser. `CORS_ORIGIN` is a comma-separated allowlist; it defaults to the
  // local dev frontend so the documented setup works out of the box. The app
  // uses bearer tokens in the `Authorization` header (not cookies), so
  // credentials stay disabled and no wildcard origin is used.
  const corsOrigin = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  });
  await app.listen(process.env.PORT ?? 8000);
}
await bootstrap();
