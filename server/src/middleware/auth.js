import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/user.js';
import { AppError } from '../utils/app-error.js';

export async function authenticate(req, _res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!token) return next(new AppError(401, 'AUTH_REQUIRED', 'Sign in to continue'));

  try {
    const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
    const user = await User.findById(payload.sub).select('_id name email role isActive');
    if (!user?.isActive) throw new Error('inactive');
    req.user = user;
    next();
  } catch {
    next(new AppError(401, 'INVALID_TOKEN', 'Your session is invalid or has expired'));
  }
}

export const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action'));
  }
  next();
};

