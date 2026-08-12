import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { getRedis } from './config/redis.js';
import { authRouter } from './routes/auth.routes.js';
import { deliveryRouter } from './routes/delivery.routes.js';
import { resourceRouter } from './routes/resource.routes.js';
import { authenticate, authorize } from './middleware/auth.js';
import { asyncHandler } from './utils/async-handler.js';
import { overview } from './controllers/analytics.controller.js';
import { notFound, errorHandler } from './middleware/error.js';

export function createApp() {
  const app = express();
  if (env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN.split(','), credentials: true }));
  app.use(express.json({ limit: '200kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, genReqId: (req, res) => { const id = req.headers['x-request-id'] || crypto.randomUUID(); res.setHeader('x-request-id', id); return id; } }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.get('/ready', async (_req, res) => {
    const mongo = mongoose.connection.readyState === 1;
    let redis = false;
    try { redis = (await getRedis().ping()) === 'PONG'; } catch { redis = false; }
    res.status(mongo && redis ? 200 : 503).json({ status: mongo && redis ? 'ready' : 'degraded', dependencies: { mongo, redis } });
  });
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/deliveries', deliveryRouter);
  app.use('/api/v1', resourceRouter);
  app.get('/api/v1/analytics/overview', authenticate, authorize('admin', 'manager'), asyncHandler(overview));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

