import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Delivery, DELIVERY_STATUS } from '../models/delivery.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { Notification } from '../models/notification.js';
import { AppError } from '../utils/app-error.js';
import { recordAudit } from './audit.service.js';
import { emitAdminAlert, emitDeliveryUpdate, emitLocationUpdate, emitUserAlert } from './realtime.service.js';
import { scheduleDelayCheck } from './queue.service.js';

const transitionRules = {
  [DELIVERY_STATUS.PENDING]: { cancelled: ['customer', 'admin'] },
  [DELIVERY_STATUS.ASSIGNED]: { accepted: ['driver'], cancelled: ['admin'], rescheduled: ['admin'] },
  [DELIVERY_STATUS.ACCEPTED]: { picked_up: ['driver'], cancelled: ['admin'], rescheduled: ['admin'] },
  [DELIVERY_STATUS.PICKED_UP]: { in_transit: ['driver'], failed: ['driver', 'admin'] },
  [DELIVERY_STATUS.IN_TRANSIT]: { failed: ['driver', 'admin'] },
  [DELIVERY_STATUS.RESCHEDULED]: { cancelled: ['admin'] },
  [DELIVERY_STATUS.DELIVERED]: {},
  [DELIVERY_STATUS.CANCELLED]: {},
  [DELIVERY_STATUS.FAILED]: { rescheduled: ['admin'] }
};

const trackingNumber = () => `FF-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

export function deliveryScope(user) {
  if (user.role === 'admin') return {};
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
  await recordAudit({ actor: actor._id, action: 'delivery.created', entityType: 'Delivery', entityId: delivery._id, metadata: { oldValues: null, newValues: { status: delivery.status, trackingNumber: delivery.trackingNumber } }, requestId });
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
  if (query.driver && user.role === 'admin') filter.assignedDriver = query.driver;
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
      const previousStatus = delivery.status;
      delivery.assignedDriver = driver._id;
      delivery.assignedVehicle = vehicle._id;
      delivery.liveLocation = undefined;
      delivery.status = DELIVERY_STATUS.ASSIGNED;
      delivery.history.push({ status: DELIVERY_STATUS.ASSIGNED, actor: actor._id, note: 'Driver and vehicle assigned' });
      assigned = await delivery.save({ session });
      await recordAudit({ actor: actor._id, action: 'delivery.assigned', entityType: 'Delivery', entityId: delivery._id, metadata: { oldValues: { status: previousStatus, driverId: null, vehicleId: null }, newValues: { status: DELIVERY_STATUS.ASSIGNED, driverId: driver._id, vehicleId: vehicle._id } }, requestId, session });
    });
  } finally { await session.endSession(); }
  await emitDeliveryUpdate(assigned);
  return assigned;
}

export async function rejectAssignment(deliveryId, input, actor, requestId) {
  const session = await mongoose.startSession();
  let rejected;
  let notification;
  let previousDriverId;
  try {
    await session.withTransaction(async () => {
      const driver = await Driver.findOne({ user: actor._id }).session(session);
      if (!driver) throw new AppError(403, 'DRIVER_PROFILE_REQUIRED', 'A driver profile is required to reject an assignment');

      const delivery = await Delivery.findOne({
        _id: deliveryId,
        status: DELIVERY_STATUS.ASSIGNED,
        assignedDriver: driver._id
      }).session(session);
      if (!delivery) throw new AppError(409, 'ASSIGNMENT_NOT_REJECTABLE', 'This assignment is no longer available to reject');

      previousDriverId = delivery.assignedDriver;
      const previousVehicleId = delivery.assignedVehicle;
      const releasedDriver = await Driver.findOneAndUpdate(
        { _id: previousDriverId, currentDelivery: delivery._id },
        { status: 'available', currentDelivery: null },
        { new: true, session }
      );
      const releasedVehicle = await Vehicle.findOneAndUpdate(
        { _id: previousVehicleId, currentDelivery: delivery._id },
        { status: 'available', currentDelivery: null },
        { new: true, session }
      );
      if (!releasedDriver || !releasedVehicle) {
        throw new AppError(409, 'ASSIGNMENT_RESOURCE_CONFLICT', 'The assigned resources changed. Refresh and try again');
      }

      delivery.status = DELIVERY_STATUS.PENDING;
      delivery.assignedDriver = null;
      delivery.assignedVehicle = null;
      delivery.liveLocation = undefined;
      delivery.history.push({
        status: DELIVERY_STATUS.PENDING,
        actor: actor._id,
        note: `Assignment rejected by driver: ${input.reason}`
      });
      rejected = await delivery.save({ session });

      await recordAudit({
        actor: actor._id,
        action: 'delivery.assignment_rejected',
        entityType: 'Delivery',
        entityId: delivery._id,
        metadata: {
          reason: input.reason,
          previousDriverId,
          previousVehicleId,
          oldValues: { status: DELIVERY_STATUS.ASSIGNED, driverId: previousDriverId, vehicleId: previousVehicleId },
          newValues: { status: DELIVERY_STATUS.PENDING, driverId: null, vehicleId: null }
        },
        requestId,
        session
      });

      [notification] = await Notification.create([{
        key: `delivery-rejected:${delivery._id}:${crypto.randomUUID()}`,
        audienceRole: 'admin',
        type: 'delivery_rejected',
        delivery: delivery._id,
        message: `${delivery.trackingNumber} was rejected by the assigned driver: ${input.reason}`
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  await emitDeliveryUpdate(rejected, previousDriverId);
  emitAdminAlert(notification);
  return rejected;
}

export async function reassignDelivery(deliveryId, input, actor, requestId) {
  const session = await mongoose.startSession();
  let reassigned;
  let previousDriverId;
  let newDriverId;
  let previousDriverUserId;
  let newDriverUserId;
  let previousNotification;
  let newNotification;
  try {
    await session.withTransaction(async () => {
      const delivery = await Delivery.findOne({
        _id: deliveryId,
        status: { $in: [DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.ACCEPTED] },
        assignedDriver: input.expectedDriverId,
        assignedVehicle: input.expectedVehicleId
      }).session(session);
      if (!delivery) throw new AppError(409, 'DELIVERY_NOT_REASSIGNABLE', 'Only an assigned delivery that has not been picked up can be reassigned');

      previousDriverId = delivery.assignedDriver;
      const previousVehicleId = delivery.assignedVehicle;
      newDriverId = new mongoose.Types.ObjectId(input.driverId);
      const newVehicleId = new mongoose.Types.ObjectId(input.vehicleId);
      if (previousDriverId.toString() === newDriverId.toString()) {
        throw new AppError(422, 'DIFFERENT_DRIVER_REQUIRED', 'Select a different driver for reassignment');
      }

      const previousDriver = await Driver.findOneAndUpdate(
        { _id: previousDriverId, currentDelivery: delivery._id },
        { status: 'available', currentDelivery: null },
        { new: true, session }
      );
      const previousVehicle = await Vehicle.findOneAndUpdate(
        { _id: previousVehicleId, currentDelivery: delivery._id },
        { status: 'available', currentDelivery: null },
        { new: true, session }
      );
      if (!previousDriver || !previousVehicle) {
        throw new AppError(409, 'ASSIGNMENT_RESOURCE_CONFLICT', 'The current assignment changed. Refresh and try again');
      }

      const newDriver = await Driver.findOneAndUpdate(
        { _id: newDriverId, isActive: true, status: 'available', currentDelivery: null, licenseExpiresAt: { $gt: new Date() } },
        { status: 'busy', currentDelivery: delivery._id },
        { new: true, session }
      );
      if (!newDriver) throw new AppError(409, 'DRIVER_UNAVAILABLE', 'The selected replacement driver is no longer available');

      const newVehicle = await Vehicle.findOneAndUpdate(
        { _id: newVehicleId, isActive: true, status: 'available', currentDelivery: null, capacityKg: { $gte: delivery.packageWeightKg } },
        { status: 'in_use', currentDelivery: delivery._id },
        { new: true, session }
      );
      if (!newVehicle) throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'The replacement vehicle is unavailable or does not have enough capacity');

      previousDriverUserId = previousDriver.user;
      newDriverUserId = newDriver.user;
      const previousStatus = delivery.status;
      delivery.assignedDriver = newDriver._id;
      delivery.assignedVehicle = newVehicle._id;
      delivery.status = DELIVERY_STATUS.ASSIGNED;
      delivery.liveLocation = undefined;
      delivery.history.push({
        status: DELIVERY_STATUS.ASSIGNED,
        actor: actor._id,
        note: `Resources reassigned by admin: ${input.reason}`
      });
      reassigned = await delivery.save({ session });

      await recordAudit({
        actor: actor._id,
        action: 'delivery.reassigned',
        entityType: 'Delivery',
        entityId: delivery._id,
        metadata: {
          reason: input.reason,
          previousStatus,
          previousDriverId,
          previousVehicleId,
          newDriverId: newDriver._id,
          newVehicleId: newVehicle._id,
          oldValues: { status: previousStatus, driverId: previousDriverId, vehicleId: previousVehicleId },
          newValues: { status: DELIVERY_STATUS.ASSIGNED, driverId: newDriver._id, vehicleId: newVehicle._id }
        },
        requestId,
        session
      });

      [previousNotification] = await Notification.create([{
        key: `delivery-reassigned-away:${delivery._id}:${crypto.randomUUID()}`,
        recipient: previousDriver.user,
        type: 'delivery_reassigned',
        delivery: delivery._id,
        message: `${delivery.trackingNumber} was reassigned to another driver: ${input.reason}`
      }], { session });
      [newNotification] = await Notification.create([{
        key: `delivery-reassigned-to:${delivery._id}:${crypto.randomUUID()}`,
        recipient: newDriver.user,
        type: 'delivery_reassigned',
        delivery: delivery._id,
        message: `${delivery.trackingNumber} has been assigned to you: ${input.reason}`
      }], { session });
    });
  } finally {
    await session.endSession();
  }

  await emitDeliveryUpdate(reassigned, [previousDriverId, newDriverId]);
  emitUserAlert(previousNotification, previousDriverUserId);
  emitUserAlert(newNotification, newDriverUserId);
  return reassigned;
}

export async function transitionDelivery(deliveryId, input, actor, requestId) {
  const delivery = await getAuthorizedDelivery(deliveryId, actor);
  const assignedDriver = delivery.assignedDriver;
  const previousStatus = delivery.status;
  const roles = transitionRules[delivery.status]?.[input.status];
  if (!roles?.includes(actor.role)) throw new AppError(409, 'INVALID_STATUS_TRANSITION', `Cannot move a delivery from ${delivery.status} to ${input.status}`);
  delivery.status = input.status;
  if (['delivered', 'failed', 'cancelled', 'rescheduled'].includes(input.status) && delivery.liveLocation) {
    delivery.liveLocation.sharing = false;
    delivery.liveLocation.updatedAt = new Date();
  }
  delivery.history.push({ status: input.status, actor: actor._id, note: input.note });
  await delivery.save();
  if (['delivered', 'failed', 'cancelled', 'rescheduled'].includes(input.status)) await releaseResources(delivery);
  if (input.status === DELIVERY_STATUS.RESCHEDULED) {
    delivery.assignedDriver = null;
    delivery.assignedVehicle = null;
    await delivery.save();
  }
  await recordAudit({ actor: actor._id, action: input.status === 'cancelled' ? 'delivery.cancelled' : 'delivery.status_changed', entityType: 'Delivery', entityId: delivery._id, metadata: { oldValues: { status: previousStatus }, newValues: { status: input.status }, note: input.note }, requestId });
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
  if (delivery.liveLocation) {
    delivery.liveLocation.sharing = false;
    delivery.liveLocation.updatedAt = new Date();
  }
  delivery.proof = { recipientName: input.recipientName, deliveredAt: new Date(), driverNotes: input.driverNotes, imagePath: input.imagePath };
  delivery.history.push({ status: DELIVERY_STATUS.DELIVERED, actor: actor._id, note: `Received by ${input.recipientName}` });
  await delivery.save();
  await releaseResources(delivery);
  await recordAudit({ actor: actor._id, action: 'delivery.proof_submitted', entityType: 'Delivery', entityId: delivery._id, metadata: { oldValues: { status: DELIVERY_STATUS.IN_TRANSIT }, newValues: { status: DELIVERY_STATUS.DELIVERED, recipientName: input.recipientName } }, requestId });
  await emitDeliveryUpdate(delivery);
  return delivery;
}

export async function updateLiveLocation(deliveryId, input, actor) {
  const delivery = await getAuthorizedDelivery(deliveryId, actor);
  if (![DELIVERY_STATUS.ACCEPTED, DELIVERY_STATUS.PICKED_UP, DELIVERY_STATUS.IN_TRANSIT].includes(delivery.status)) {
    throw new AppError(409, 'TRACKING_NOT_ACTIVE', 'Live tracking is available only after the driver accepts the delivery');
  }

  const updatedAt = new Date();
  if (input.sharing === false) {
    if (delivery.liveLocation) {
      delivery.liveLocation.sharing = false;
      delivery.liveLocation.updatedAt = updatedAt;
      await delivery.save();
      await emitLocationUpdate(delivery);
    }
    return delivery.liveLocation ?? { sharing: false, updatedAt };
  }

  delivery.liveLocation = {
    latitude: input.latitude,
    longitude: input.longitude,
    accuracyMeters: input.accuracyMeters,
    speedKph: input.speedKph,
    headingDegrees: input.headingDegrees,
    sharing: true,
    updatedAt
  };
  await delivery.save();
  await emitLocationUpdate(delivery);
  return delivery.liveLocation;
}

export const validTransitions = transitionRules;
