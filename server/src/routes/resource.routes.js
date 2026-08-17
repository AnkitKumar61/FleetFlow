import { Router } from 'express';
import { z } from 'zod';
import * as controller from '../controllers/resource.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/async-handler.js';

const id = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i) });
const auditQuery = z.object({
  actor: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  action: z.string().trim().min(1).max(80).regex(/^[a-z][a-z0-9_.-]*$/).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().refine((value) => [10, 20].includes(value), 'Limit must be 10 or 20').default(10)
}).superRefine((value, context) => {
  if (value.from && value.to && new Date(value.from) > new Date(value.to)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'To date must be on or after From date' });
  }
});
const userQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['admin', 'driver', 'customer']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
const createUserBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(24).optional(),
  password: z.string().min(8).max(128).regex(/[A-Z]/, 'Include an uppercase letter').regex(/[0-9]/, 'Include a number'),
  role: z.enum(['admin', 'driver']),
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
resourceRouter.get('/users', authorize('admin'), validate({ query: userQuery }), asyncHandler(controller.listUsers));
resourceRouter.post('/users', authorize('admin'), validate({ body: createUserBody }), asyncHandler(controller.createUser));
resourceRouter.patch('/users/:id', authorize('admin'), validate({ params: id, body: z.object({ role: z.enum(['admin', 'driver', 'customer']).optional(), isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length) }), asyncHandler(controller.updateUser));
resourceRouter.get('/drivers', authorize('admin'), asyncHandler(controller.listDrivers));
resourceRouter.post('/drivers', authorize('admin'), validate({ body: z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i), licenseNumber: z.string().min(3).max(30), licenseExpiresAt: z.coerce.date(), status: z.enum(['available', 'busy', 'offline']).default('offline') }) }), asyncHandler(controller.createDriver));
resourceRouter.patch('/drivers/:id', authorize('admin'), validate({ params: id, body: z.object({ status: z.enum(['available', 'busy', 'offline']).optional(), isActive: z.boolean().optional(), licenseExpiresAt: z.coerce.date().optional() }) }), asyncHandler(controller.updateDriver));
resourceRouter.get('/vehicles', authorize('admin'), asyncHandler(controller.listVehicles));
resourceRouter.post('/vehicles', authorize('admin'), validate({ body: z.object({ registrationNumber: z.string().min(3).max(30), type: z.enum(['bike', 'van', 'truck']), capacityKg: z.coerce.number().positive(), status: z.enum(['available', 'in_use', 'maintenance']).default('available') }) }), asyncHandler(controller.createVehicle));
resourceRouter.patch('/vehicles/:id', authorize('admin'), validate({ params: id, body: z.object({ status: z.enum(['available', 'in_use', 'maintenance']).optional(), isActive: z.boolean().optional(), capacityKg: z.coerce.number().positive().optional() }) }), asyncHandler(controller.updateVehicle));
resourceRouter.get('/audit-logs', authorize('admin'), validate({ query: auditQuery }), asyncHandler(controller.listAudits));
resourceRouter.get('/notifications', asyncHandler(controller.listNotifications));
resourceRouter.patch('/notifications/read-all', asyncHandler(controller.markAllNotificationsRead));
resourceRouter.patch('/notifications/:id/read', validate({ params: id }), asyncHandler(controller.markNotificationRead));
