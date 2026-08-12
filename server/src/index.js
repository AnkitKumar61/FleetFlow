import { createServer } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { closeQueue } from './services/queue.service.js';
import { closeRedis } from './config/redis.js';
import { attachSocketServer } from './socket.js';
import { startDelayWorker, closeDelayWorker } from './services/delay-worker-runner.service.js';

await connectDatabase();
if (env.EMBEDDED_WORKER === 'true') startDelayWorker();
const httpServer = createServer(createApp());
attachSocketServer(httpServer);
httpServer.listen(env.PORT, () => logger.info({ port: env.PORT }, 'FleetFlow API listening'));

async function shutdown(signal) {
  logger.info({ signal }, 'Graceful shutdown started');
  httpServer.close(async () => {
    await closeDelayWorker();
    await Promise.allSettled([closeQueue(), closeRedis(), disconnectDatabase()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
