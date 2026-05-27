import * as Joi from 'joi';

export interface AppConfig {
  port: number;
  env: 'development' | 'production' | 'test';
  database: { url: string };
  redis: { url: string };
  s3: {
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    endpoint?: string;
  };
  llm: { openaiApiKey: string; anthropicApiKey: string };
  clerk: { secretKey: string; jwksUrl: string };
  stripe: { secretKey: string; webhookSecret: string };
  svix: { signingSecret: string };
  sentry: { dsn?: string };
  crypto: { kek: string; dekCiphertext: string };
  cors: { origins: string[] };
}

export const configuration = (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  env: (process.env.NODE_ENV as AppConfig['env']) ?? 'development',
  database: { url: process.env.DATABASE_URL! },
  redis: { url: process.env.REDIS_URL! },
  s3: {
    bucket: process.env.S3_BUCKET!,
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT,
  },
  llm: {
    openaiApiKey: process.env.OPENAI_API_KEY!,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
  },
  clerk: {
    secretKey: process.env.CLERK_SECRET_KEY!,
    jwksUrl: process.env.CLERK_JWKS_URL!,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY!,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  },
  svix: { signingSecret: process.env.SVIX_SIGNING_SECRET! },
  sentry: { dsn: process.env.SENTRY_DSN },
  crypto: {
    kek: process.env.CRYPTO_KEK!,
    dekCiphertext: process.env.CRYPTO_DEK_CIPHERTEXT!,
  },
  cors: {
    origins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
  },
});

export const validationSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  DATABASE_URL: Joi.string().uri().required(),
  REDIS_URL: Joi.string().uri().required(),
  S3_BUCKET: Joi.string().required(),
  S3_ACCESS_KEY_ID: Joi.string().required(),
  S3_SECRET_ACCESS_KEY: Joi.string().required(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_ENDPOINT: Joi.string().uri().optional(),
  OPENAI_API_KEY: Joi.string().required(),
  ANTHROPIC_API_KEY: Joi.string().required(),
  CLERK_SECRET_KEY: Joi.string().required(),
  CLERK_JWKS_URL: Joi.string().uri().required(),
  STRIPE_SECRET_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  SVIX_SIGNING_SECRET: Joi.string().required(),
  SENTRY_DSN: Joi.string().optional().allow(''),
  CRYPTO_KEK: Joi.string().required(),
  CRYPTO_DEK_CIPHERTEXT: Joi.string().required(),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
});
