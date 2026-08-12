import IORedis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

let redis;

export function getRedis() {
  if (!redis) {
    redis = new IORedis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true
    });
    redis.on('error', (error) => logger.warn({ err: error }, 'Redis unavailable'));
  }
  return redis;
}

export async function closeRedis() {
  if (redis) await redis.quit().catch(() => redis.disconnect());
}

