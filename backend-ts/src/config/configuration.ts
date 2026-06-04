import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(14607),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_ENDPOINT: z.string().url().optional(),
  // LLM providers - support OpenAI, Anthropic, OpenRouter
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_BASE_URL: z.string().url().optional(),
  OPENAI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_MODEL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  OPENROUTER_BASE_URL: z.string().url().optional().default('https://openrouter.ai/api/v1'),
  OPENROUTER_MODEL: z.string().optional(),
  // Provider preference: openai | anthropic | openrouter
  LLM_PROVIDER: z.enum(['openai', 'anthropic', 'openrouter']).default('openai'),
  // Fallback provider when primary fails
  LLM_FALLBACK_PROVIDER: z.enum(['openai', 'anthropic', 'openrouter', 'none']).default('anthropic'),
  // Embedding provider (always OpenAI for now)
  EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_JWKS_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  SVIX_SIGNING_SECRET: z.string().min(1),
  SENTRY_DSN: z.string().optional(),
  CRYPTO_KEK: z.string().min(1),
  CRYPTO_DEK_CIPHERTEXT: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:14606'),
  ADMIN_SECRET: z.string().min(32),
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
  llm: {
    provider: 'openai' | 'anthropic' | 'openrouter';
    fallbackProvider: 'openai' | 'anthropic' | 'openrouter' | 'none';
    openai: { apiKey?: string; baseUrl?: string; model?: string };
    anthropic: { apiKey?: string; baseUrl?: string; model?: string };
    openrouter: { apiKey?: string; baseUrl: string; model?: string };
    embeddingModel: string;
  };
  clerk: { secretKey: string; jwksUrl: string };
  stripe: { secretKey: string; webhookSecret: string };
  svix: { signingSecret: string };
  sentry: { dsn?: string };
  crypto: { kek: string; dekCiphertext: string };
  cors: { origins: string[] };
  admin: { secret: string };
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
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
      provider: env.LLM_PROVIDER,
      fallbackProvider: env.LLM_FALLBACK_PROVIDER,
      openai: {
        apiKey: env.OPENAI_API_KEY,
        baseUrl: env.OPENAI_BASE_URL,
        model: env.OPENAI_MODEL,
      },
      anthropic: {
        apiKey: env.ANTHROPIC_API_KEY,
        baseUrl: env.ANTHROPIC_BASE_URL,
        model: env.ANTHROPIC_MODEL,
      },
      openrouter: {
        apiKey: env.OPENROUTER_API_KEY,
        baseUrl: env.OPENROUTER_BASE_URL,
        model: env.OPENROUTER_MODEL,
      },
      embeddingModel: env.EMBEDDING_MODEL,
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
    admin: {
      secret: env.ADMIN_SECRET,
    },
  };
};
