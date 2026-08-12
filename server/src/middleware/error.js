import { ZodError } from 'zod';
import { AppError } from '../utils/app-error.js';
import { logger } from '../config/logger.js';

export function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found`));
}

export function errorHandler(error, req, res, _next) {
  if (error instanceof ZodError) {
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.flatten() },
      requestId: req.id
    });
  }

  if (error?.name === 'CastError') {
    return res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid resource identifier' }, requestId: req.id });
  }

  if (error?.code === 11000) {
    return res.status(409).json({ success: false, error: { code: 'DUPLICATE_RESOURCE', message: 'A resource with that value already exists' }, requestId: req.id });
  }

  const known = error instanceof AppError;
  const statusCode = known ? error.statusCode : 500;
  if (!known) logger.error({ err: error, requestId: req.id }, 'Unhandled request error');

  return res.status(statusCode).json({
    success: false,
    error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'An unexpected error occurred',
      ...(known && error.details ? { details: error.details } : {})
    },
    requestId: req.id
  });
}

