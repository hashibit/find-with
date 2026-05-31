import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ConfigService } from '@nestjs/config';
import { type AppConfig } from './config/configuration.js';
import { RedisService } from './redis/redis.module.js';
import { type LlmProvider } from './llm/llm-provider.interface.js';
import { LLM_PROVIDER } from './llm/llm-provider.interface.js';
import { DatabaseService } from './database/database.service.js';

// Initialize Sentry for production
if (process.env.SENTRY_DSN) {
  import('@sentry/nestjs').then((Sentry) => {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [
        Sentry.nestIntegration(),
        Sentry.redisIntegration(),
      ],
      tracesSampleRate: 0.1,
      profilesSampleRate: 0.1,
      enabled: process.env.NODE_ENV === 'production',
    });
    console.log('[Sentry] initialized');
  });
}

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
  app.useGlobalPipes(new ZodValidationPipe());

  // Global RFC 7807 exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // API prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'ready', 'webhooks/:path*', 'ingest/:path*'],
  });

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

  httpAdapter.get('/health', async (_req, res) => {
    try {
      const dbService = app.get(DatabaseService);
      const redisService = app.get(RedisService);
      const llmProvider = app.get<LlmProvider>(LLM_PROVIDER);

      await dbService.testConnection();
      await redisService.testConnection();
      await llmProvider.ready();

      res.json({ status: 'ok', checks: { db: 'ok', redis: 'ok', llm: 'ok' } });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'unknown error'
      });
    }
  });

  httpAdapter.get('/ready', async (_req, res) => {
    try {
      // Ready check: DB connection must work
      const dbService = app.get(DatabaseService);
      await dbService.testConnection();

      // Redis should be available (non-critical for startup)
      try {
        const redisService = app.get(RedisService);
        await redisService.testConnection();
      } catch {
        // Ignore redis errors for ready check
      }
      res.json({ status: 'ok' });
    } catch (error) {
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'unknown error'
      });
    }
  });

  // Graceful shutdown
  app.enableShutdownHooks();

  await app.listen(port);
  console.log(`FindWith backend listening on :${port} [${env}]`);
}

bootstrap().catch(console.error);
