import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env.js';
import * as controller from '../controllers/delivery.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';
import { assignBody, createDeliveryBody, deliveryIdParams, listDeliveryQuery, proofBody, transitionBody } from '../validation/delivery.validation.js';
import { AppError } from '../utils/app-error.js';

const upload = multer({ dest: env.UPLOAD_DIR, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (_req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new AppError(422, 'INVALID_FILE', 'Proof attachment must be an image')) });
export const deliveryRouter = Router();
deliveryRouter.use(authenticate);
deliveryRouter.get('/', validate({ query: listDeliveryQuery }), asyncHandler(controller.list));
deliveryRouter.post('/', authorize('customer', 'manager', 'admin'), validate({ body: createDeliveryBody }), asyncHandler(controller.create));
deliveryRouter.get('/:id', validate({ params: deliveryIdParams }), asyncHandler(controller.get));
deliveryRouter.post('/:id/assign', authorize('manager', 'admin'), validate({ params: deliveryIdParams, body: assignBody }), asyncHandler(controller.assign));
deliveryRouter.patch('/:id/status', authorize('driver', 'manager', 'admin'), validate({ params: deliveryIdParams, body: transitionBody }), asyncHandler(controller.transition));
deliveryRouter.post('/:id/proof', authorize('driver'), upload.single('image'), validate({ params: deliveryIdParams, body: proofBody }), asyncHandler(controller.proof));

