import { z } from 'zod';
import { DELIVERY_STATUS } from '../models/delivery.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const address = z.object({
  label: z.string().trim().max(100).optional(), line1: z.string().trim().min(3).max(160), line2: z.string().trim().max(160).optional(),
  city: z.string().trim().min(2).max(80), state: z.string().trim().min(2).max(80), postalCode: z.string().trim().min(4).max(12),
  contactName: z.string().trim().max(80).optional(), contactPhone: z.string().trim().max(24).optional()
});

export const createDeliveryBody = z.object({
  customer: objectId.optional(), pickupAddress: address, deliveryAddress: address,
  packageDescription: z.string().trim().min(3).max(300), packageWeightKg: z.coerce.number().positive().max(50000),
  priority: z.enum(['standard', 'express', 'urgent']).default('standard'),
  expectedDeliveryAt: z.coerce.date().refine((date) => date > new Date(), 'Expected delivery must be in the future')
});

export const deliveryIdParams = z.object({ id: objectId });
export const assignBody = z.object({ driverId: objectId, vehicleId: objectId });
export const transitionBody = z.object({ status: z.enum(Object.values(DELIVERY_STATUS)), note: z.string().trim().max(500).optional() });
export const proofBody = z.object({ recipientName: z.string().trim().min(2).max(80), otp: z.string().trim().regex(/^\d{4,8}$/), driverNotes: z.string().trim().max(500).optional() });
export const listDeliveryQuery = z.object({
  status: z.enum(Object.values(DELIVERY_STATUS)).optional(), priority: z.enum(['standard', 'express', 'urgent']).optional(),
  driver: objectId.optional(), from: z.string().date().optional(), to: z.string().date().optional(), search: z.string().trim().max(100).optional(),
  cursor: objectId.optional(), limit: z.coerce.number().int().min(1).max(100).default(20), sort: z.enum(['newest', 'oldest']).default('newest')
});

