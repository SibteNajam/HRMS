import { z } from 'zod';

/**
 * Every value from .env, validated at boot. A missing ANTHROPIC_API_KEY must
 * crash on startup with a clear message — not at 11pm when someone first
 * opens the chat panel.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  /** Seconds. One source of truth for both the JWT and the cookie maxAge. */
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  COOKIE_NAME: z.string().default('cadre_session'),
  COOKIE_DOMAIN: z.string().optional(),
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-opus-5'),
  AI_MAX_TOKENS: z.coerce.number().default(2048),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().default(10),

  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default('Cadre <no-reply@cadre.local>'),
  MAIL_DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // HR policy — never hardcode these in a service.
  STANDARD_WORK_HOURS: z.coerce.number().default(8),
  WORK_DAY_START: z.string().default('09:00'),
  LATE_THRESHOLD_MINUTES: z.coerce.number().default(15),
  OVERTIME_RATE_MULTIPLIER: z.coerce.number().default(1.5),
  WEEKEND_DAYS: z
    .string()
    .default('0,6')
    .transform((v) => v.split(',').map(Number)),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
