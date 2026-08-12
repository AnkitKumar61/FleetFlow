import { connectDatabase, disconnectDatabase } from './config/database.js';
import { closeRedis } from './config/redis.js';
import { startDelayWorker, closeDelayWorker } from './services/delay-worker-runner.service.js';

await connectDatabase();
startDelayWorker();
async function shutdown() { await closeDelayWorker(); await closeRedis(); await disconnectDatabase(); process.exit(0); }
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
