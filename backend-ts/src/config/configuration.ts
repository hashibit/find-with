import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().url().optional(),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_JWKS_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  SVIX_SIGNING_SECRET: z.string().min(1),
  SENTRY_DSN: z.string().optional(),
  CRYPTO_KEK: z.string().min(1),
  CRYPTO_DEK_CIPHERTEXT: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

type Env = z.infer<typeof envSchema>;

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

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${messages}`);
  }
  return result.data;
}

export const configuration = (): AppConfig => {
  const env = envSchema.parse(process.env);
  return {
    port: env.PORT,
    env: env.NODE_ENV,
    database: { url: env.DATABASE_URL },
    redis: { url: env.REDIS_URL },
    s3: {
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
    },
    llm: {
      openaiApiKey: env.OPENAI_API_KEY,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
    },
    clerk: {
      secretKey: env.CLERK_SECRET_KEY,
      jwksUrl: env.CLERK_JWKS_URL,
    },
    stripe: {
      secretKey: env.STRIPE_SECRET_KEY,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    },
    svix: { signingSecret: env.SVIX_SIGNING_SECRET },
    sentry: { dsn: env.SENTRY_DSN },
    crypto: {
      kek: env.CRYPTO_KEK,
      dekCiphertext: env.CRYPTO_DEK_CIPHERTEXT,
    },
    cors: {
      origins: env.CORS_ORIGINS.split(','),
    },
  };
};
