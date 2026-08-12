import { Queue } from 'bullmq';
import { getRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';

let queue;

export function getDelayQueue() {
  queue ??= new Queue('delivery-delays', { connection: getRedis(), defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 200, removeOnFail: 500 } });
  return queue;
}

export async function scheduleDelayCheck(delivery) {
  if (process.env.NODE_ENV === 'test') return;
  try {
    const delay = Math.max(0, new Date(delivery.expectedDeliveryAt).getTime() - Date.now());
    await getDelayQueue().add('check-delivery', { deliveryId: delivery._id.toString() }, { jobId: `delay-${delivery._id}`, delay });
  } catch (error) {
    logger.warn({ err: error, deliveryId: delivery._id }, 'Could not schedule delay check; delivery remains persisted');
  }
}

export async function closeQueue() {
  if (queue) await queue.close();
}

