import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from './config/configuration.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });

  const config = app.get(ConfigService<AppConfig>);
  const port = config.get('port', { infer: true })!;
  const corsOrigins = config.get('cors', { infer: true })!.origins;
  const env = config.get('env', { infer: true })!;

  // Pino logger
  app.useLogger(app.get(Logger));

  // CORS
  app.enableCors({ origin: corsOrigins, credentials: true });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global RFC 7807 exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // API prefix
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready', 'webhooks/:path*', 'ingest/:path*'] });

  // Swagger (non-production)
  if (env !== 'production') {
    const docConfig = new DocumentBuilder()
      .setTitle('FindWith API')
      .setDescription('Quinn AI job search companion backend')
      .setVersion('0.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Health endpoints
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req, res) => res.json({ status: 'ok' }));
  httpAdapter.get('/ready', (_req, res) => res.json({ status: 'ok' }));

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`FindWith backend listening on :${port} [${env}]`);
}

bootstrap().catch(console.error);
