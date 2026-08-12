import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Delivery, DELIVERY_STATUS } from '../models/delivery.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { AppError } from '../utils/app-error.js';
import { recordAudit } from './audit.service.js';
import { emitDeliveryUpdate } from './realtime.service.js';
import { scheduleDelayCheck } from './queue.service.js';

const transitionRules = {
  [DELIVERY_STATUS.PENDING]: { cancelled: ['customer', 'manager', 'admin'] },
  [DELIVERY_STATUS.ASSIGNED]: { accepted: ['driver'], cancelled: ['manager', 'admin'], rescheduled: ['manager', 'admin'] },
  [DELIVERY_STATUS.ACCEPTED]: { picked_up: ['driver'], cancelled: ['manager', 'admin'], rescheduled: ['manager', 'admin'] },
  [DELIVERY_STATUS.PICKED_UP]: { in_transit: ['driver'], failed: ['driver', 'manager', 'admin'] },
  [DELIVERY_STATUS.IN_TRANSIT]: { failed: ['driver', 'manager', 'admin'] },
  [DELIVERY_STATUS.RESCHEDULED]: { cancelled: ['manager', 'admin'] },
  [DELIVERY_STATUS.DELIVERED]: {},
  [DELIVERY_STATUS.CANCELLED]: {},
  [DELIVERY_STATUS.FAILED]: { rescheduled: ['manager', 'admin'] }
};

const trackingNumber = () => `FF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

export function deliveryScope(user) {
  if (['admin', 'manager'].includes(user.role)) return {};
  if (user.role === 'customer') return { customer: user._id };
  return { assignedDriver: { $in: [] } };
}

export async function createDelivery(input, actor, requestId) {
  const customer = actor.role === 'customer' ? actor._id : input.customer;
  if (!customer) throw new AppError(422, 'CUSTOMER_REQUIRED', 'A customer is required');
  const { deliveryOtp, ...deliveryInput } = input;
  const delivery = await Delivery.create({
    ...deliveryInput,
    customer,
    trackingNumber: trackingNumber(),
    status: DELIVERY_STATUS.PENDING,
    proof: { otpHash: await bcrypt.hash(deliveryOtp, 10) },
    history: [{ status: DELIVERY_STATUS.PENDING, note: 'Delivery request created', actor: actor._id }]
  });
  await recordAudit({ actor: actor._id, action: 'delivery.created', entityType: 'Delivery', entityId: delivery._id, requestId });
  scheduleDelayCheck(delivery).catch(() => {});
  await emitDeliveryUpdate(delivery);
  return delivery;
}

export async function listDeliveries(query, user) {
  const filter = { ...deliveryScope(user) };
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ user: user._id });
    filter.assignedDriver = driver?._id ?? new mongoose.Types.ObjectId();
  }
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.driver && ['admin', 'manager'].includes(user.role)) filter.assignedDriver = query.driver;
  if (query.from || query.to) filter.createdAt = { ...(query.from && { $gte: new Date(query.from) }), ...(query.to && { $lte: new Date(query.to) }) };
  if (query.search) {
    const escapedSearch = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = new RegExp(escapedSearch, 'i');
    filter.$or = [{ trackingNumber: search }, { packageDescription: search }];
  }
  if (query.cursor) filter._id = { [query.sort === 'oldest' ? '$gt' : '$lt']: query.cursor };
  const limit = query.limit ?? 20;
  const items = await Delivery.find(filter)
    .populate('customer', 'name email')
    .populate({ path: 'assignedDriver', populate: { path: 'user', select: 'name phone' } })
    .populate('assignedVehicle', 'registrationNumber type')
    .sort(query.sort === 'oldest' ? { _id: 1 } : { _id: -1 })
    .limit(limit + 1);
  const hasMore = items.length > limit;
  if (hasMore) items.pop();
  return { items, nextCursor: hasMore ? items.at(-1)._id : null };
}

export async function getAuthorizedDelivery(id, user, options = {}) {
  let query = Delivery.findById(id);
  if (options.populate) {
    query = query
      .populate('customer', 'name email')
      .populate({ path: 'assignedDriver', populate: { path: 'user', select: 'name phone' } })
      .populate('assignedVehicle');
  }
  const delivery = await query;
  if (!delivery) throw new AppError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found');
  if (user.role === 'customer' && (delivery.customer._id ?? delivery.customer).toString() !== user._id.toString()) throw new AppError(403, 'FORBIDDEN', 'You cannot access this delivery');
  if (user.role === 'driver') {
    const driver = await Driver.findOne({ user: user._id });
    if (!driver || (delivery.assignedDriver?._id ?? delivery.assignedDriver)?.toString() !== driver._id.toString()) throw new AppError(403, 'FORBIDDEN', 'You cannot access this delivery');
  }
  return delivery;
}

export async function assignDelivery(deliveryId, input, actor, requestId) {
  const session = await mongoose.startSession();
  let assigned;
  try {
    await session.withTransaction(async () => {
      const delivery = await Delivery.findOne({ _id: deliveryId, status: { $in: [DELIVERY_STATUS.PENDING, DELIVERY_STATUS.RESCHEDULED] } }).session(session);
      if (!delivery) throw new AppError(409, 'DELIVERY_NOT_ASSIGNABLE', 'Delivery is no longer available for assignment');
      const driver = await Driver.findOneAndUpdate(
        { _id: input.driverId, isActive: true, status: 'available', currentDelivery: null, licenseExpiresAt: { $gt: new Date() } },
        { status: 'busy', currentDelivery: delivery._id }, { new: true, session }
      );
      if (!driver) throw new AppError(409, 'DRIVER_UNAVAILABLE', 'The selected driver is no longer available');
      const vehicle = await Vehicle.findOneAndUpdate(
        { _id: input.vehicleId, isActive: true, status: 'available', currentDelivery: null, capacityKg: { $gte: delivery.packageWeightKg } },
        { status: 'in_use', currentDelivery: delivery._id }, { new: true, session }
      );
      if (!vehicle) throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'The vehicle is unavailable or does not have enough capacity');
      delivery.assignedDriver = driver._id;
      delivery.assignedVehicle = vehicle._id;
      delivery.status = DELIVERY_STATUS.ASSIGNED;
      delivery.history.push({ status: DELIVERY_STATUS.ASSIGNED, actor: actor._id, note: 'Driver and vehicle assigned' });
      assigned = await delivery.save({ session });
      await recordAudit({ actor: actor._id, action: 'delivery.assigned', entityType: 'Delivery', entityId: delivery._id, metadata: { driverId: driver._id, vehicleId: vehicle._id }, requestId, session });
    });
  } finally { await session.endSession(); }
  await emitDeliveryUpdate(assigned);
  return assigned;
}

export async function transitionDelivery(deliveryId, input, actor, requestId) {
  const delivery = await getAuthorizedDelivery(deliveryId, actor);
  const assignedDriver = delivery.assignedDriver;
  const roles = transitionRules[delivery.status]?.[input.status];
  if (!roles?.includes(actor.role)) throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot move a delivery from ${delivery.status} to ${input.status}`);
  delivery.status = input.status;
  delivery.history.push({ status: input.status, actor: actor._id, note: input.note });
  await delivery.save();
  if (['delivered', 'failed', 'cancelled', 'rescheduled'].includes(input.status)) await releaseResources(delivery);
  if (input.status === DELIVERY_STATUS.RESCHEDULED) {
    delivery.assignedDriver = null;
    delivery.assignedVehicle = null;
    await delivery.save();
  }
  await recordAudit({ actor: actor._id, action: input.status === 'cancelled' ? 'delivery.cancelled' : 'delivery.status_changed', entityType: 'Delivery', entityId: delivery._id, metadata: { status: input.status }, requestId });
  await emitDeliveryUpdate(delivery, assignedDriver);
  return delivery;
}

async function releaseResources(delivery) {
  await Promise.all([
    delivery.assignedDriver && Driver.updateOne({ _id: delivery.assignedDriver, currentDelivery: delivery._id }, { status: 'available', currentDelivery: null }),
    delivery.assignedVehicle && Vehicle.updateOne({ _id: delivery.assignedVehicle, currentDelivery: delivery._id }, { status: 'available', currentDelivery: null })
  ]);
}

export async function submitProof(deliveryId, input, actor, requestId) {
  const delivery = await getAuthorizedDelivery(deliveryId, actor);
  if (delivery.status !== DELIVERY_STATUS.IN_TRANSIT) throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Proof can only be submitted for an in-transit delivery');
  const full = await Delivery.findById(deliveryId).select('+proof.otpHash');
  if (!full.proof?.otpHash) throw new AppError(409, 'DELIVERY_OTP_NOT_CONFIGURED', 'This delivery does not have a verification code');
  if (!(await bcrypt.compare(input.otp, full.proof.otpHash))) throw new AppError(422, 'INVALID_DELIVERY_OTP', 'The delivery verification code is incorrect');
  delivery.status = DELIVERY_STATUS.DELIVERED;
  delivery.proof = { recipientName: input.recipientName, deliveredAt: new Date(), driverNotes: input.driverNotes, imagePath: input.imagePath };
  delivery.history.push({ status: DELIVERY_STATUS.DELIVERED, actor: actor._id, note: `Received by ${input.recipientName}` });
  await delivery.save();
  await releaseResources(delivery);
  await recordAudit({ actor: actor._id, action: 'delivery.proof_submitted', entityType: 'Delivery', entityId: delivery._id, requestId });
  await emitDeliveryUpdate(delivery);
  return delivery;
}

export const validTransitions = transitionRules;
