import { Worker } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { processDelayCheck } from './delay-worker.service.js';

let worker;

export function startDelayWorker() {
  if (worker) return worker;
  worker = new Worker(
    'delivery-delays',
    (job) => processDelayCheck(job.data.deliveryId),
    { connection: getRedis(), concurrency: 5 }
  );
  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Delay check complete'));
  worker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Delay check failed'));
  return worker;
}

export async function closeDelayWorker() {
  if (!worker) return;
  await worker.close();
  worker = undefined;
}
