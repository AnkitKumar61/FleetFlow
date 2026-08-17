import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1).default('mongodb://localhost:27017/fleetflow'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  ACCESS_TOKEN_SECRET: z.string().min(32).default('development-access-secret-change-me-now'),
  REFRESH_TOKEN_SECRET: z.string().min(32).default('development-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  LOG_LEVEL: z.string().default('info'),
  IMAGEKIT_PRIVATE_KEY: z.string().min(1).optional(),
  IMAGEKIT_URL_ENDPOINT: z.string().url().optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  EMBEDDED_WORKER: z.enum(['true', 'false']).default('false'),
  PHONE_VERIFICATION_MODE: z.enum(['test']).default('test')
}).superRefine((value, context) => {
  if (Boolean(value.IMAGEKIT_PRIVATE_KEY) !== Boolean(value.IMAGEKIT_URL_ENDPOINT)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT must be configured together' });
  }
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

export const env = parsed.data;
