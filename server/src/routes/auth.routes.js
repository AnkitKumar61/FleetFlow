import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as controller from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { loginBody, registerBody } from '../validation/auth.validation.js';
import { env } from '../config/env.js';

export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, skip: () => env.NODE_ENV === 'test', standardHeaders: true, legacyHeaders: false, message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } } });
authRouter.post('/register', limiter, validate({ body: registerBody }), asyncHandler(controller.register));
authRouter.post('/login', limiter, validate({ body: loginBody }), asyncHandler(controller.login));
authRouter.post('/refresh', limiter, asyncHandler(controller.refresh));
authRouter.post('/logout', asyncHandler(controller.logout));
authRouter.get('/me', authenticate, asyncHandler(controller.me));
