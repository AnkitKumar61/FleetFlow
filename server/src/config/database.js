import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export async function connectDatabase(uri = env.MONGODB_URI) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  const users = mongoose.connection.collection('users');
  await users.updateMany({ role: 'manager' }, { $set: { role: 'admin' } });
  await users.updateOne({ email: 'manager@fleetflow.demo' }, { $set: { name: 'Meera Admin' } });
  await mongoose.connection.collection('notifications').updateMany({ audienceRole: 'manager' }, { $set: { audienceRole: 'admin' } });
  logger.info('MongoDB connected');
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
