import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/resource.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

const id = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const createUserBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(24).optional(),
  password: z.string().min(8).max(128).regex(/[A-Z]/, 'Include an uppercase letter').regex(/[0-9]/, 'Include a number'),
  role: z.enum(['admin', 'manager', 'driver', 'customer']),
  licenseNumber: z.string().trim().min(3).max(30).optional(),
  licenseExpiresAt: z.coerce.date().optional(),
  driverStatus: z.enum(['available', 'offline']).optional()
}).superRefine((value, context) => {
  if (value.role !== 'driver') return;
  if (!value.licenseNumber) context.addIssue({ code: z.ZodIssueCode.custom, path: ['licenseNumber'], message: 'Licence number is required for a driver' });
  if (!value.licenseExpiresAt) context.addIssue({ code: z.ZodIssueCode.custom, path: ['licenseExpiresAt'], message: 'Licence expiry date is required for a driver' });
});
export const resourceRouter = Router();
resourceRouter.use(authenticate);
resourceRouter.get('/users', authorize('admin'), asyncHandler(controller.listUsers));
resourceRouter.post('/users', authorize('admin'), validate({ body: createUserBody }), asyncHandler(controller.createUser));
resourceRouter.patch('/users/:id', authorize('admin'), validate({ params: id, body: z.object({ role: z.enum(['admin', 'manager', 'driver', 'customer']).optional(), isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length) }), asyncHandler(controller.updateUser));
resourceRouter.get('/drivers', authorize('admin', 'manager'), asyncHandler(controller.listDrivers));
resourceRouter.post('/drivers', authorize('admin'), validate({ body: z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i), licenseNumber: z.string().min(3).max(30), licenseExpiresAt: z.coerce.date(), status: z.enum(['available', 'busy', 'offline']).default('offline') }) }), asyncHandler(controller.createDriver));
resourceRouter.patch('/drivers/:id', authorize('admin', 'manager'), validate({ params: id, body: z.object({ status: z.enum(['available', 'busy', 'offline']).optional(), isActive: z.boolean().optional(), licenseExpiresAt: z.coerce.date().optional() }) }), asyncHandler(controller.updateDriver));
resourceRouter.get('/vehicles', authorize('admin', 'manager'), asyncHandler(controller.listVehicles));
resourceRouter.post('/vehicles', authorize('admin'), validate({ body: z.object({ registrationNumber: z.string().min(3).max(30), type: z.enum(['bike', 'van', 'truck']), capacityKg: z.coerce.number().positive(), status: z.enum(['available', 'in_use', 'maintenance']).default('available') }) }), asyncHandler(controller.createVehicle));
resourceRouter.patch('/vehicles/:id', authorize('admin'), validate({ params: id, body: z.object({ status: z.enum(['available', 'in_use', 'maintenance']).optional(), isActive: z.boolean().optional(), capacityKg: z.coerce.number().positive().optional() }) }), asyncHandler(controller.updateVehicle));
resourceRouter.get('/audit-logs', authorize('admin'), asyncHandler(controller.listAudits));
resourceRouter.get('/notifications', authorize('admin', 'manager'), asyncHandler(controller.listNotifications));
