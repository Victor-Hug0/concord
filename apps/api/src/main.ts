import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

const config = app.get(ConfigService);
  const configuredOrigins = config
    .get<string>('CORS_ORIGIN', 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const isDev = config.get<string>('NODE_ENV', 'development') !== 'production';

  /** Em dev, aceita Vite em localhost e IPs privados (WSL ↔ Electron Windows). */
  const privateDevOrigin =
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i;

  app.enableCors({
    origin: (requestOrigin, callback) => {
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      if (configuredOrigins.includes(requestOrigin) || configuredOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      if (isDev && privateDevOrigin.test(requestOrigin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  const port = config.get<number>('API_PORT', 3000);
  await app.listen(port, '0.0.0.0');
  app.get(Logger).log(`Concord API listening on 0.0.0.0:${port}`);
}

bootstrap();
