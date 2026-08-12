import { Worker } from 'bullmq';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { getRedis, closeRedis } from './config/redis.js';
import { logger } from './config/logger.js';
import { processDelayCheck } from './services/delay-worker.service.js';

await connectDatabase();
const worker = new Worker('delivery-delays', (job) => processDelayCheck(job.data.deliveryId), { connection: getRedis(), concurrency: 5 });
worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Delay check complete'));
worker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Delay check failed'));
async function shutdown() { await worker.close(); await closeRedis(); await disconnectDatabase(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

