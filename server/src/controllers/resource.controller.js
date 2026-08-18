import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { AuditLog } from '../models/audit-log.js';
import { Notification } from '../models/notification.js';
import { Delivery } from '../models/delivery.js';
import { AppError } from '../utils/app-error.js';
import { ok } from '../utils/api-response.js';
import { recordAudit } from '../services/audit.service.js';
import { consumePhoneVerification } from '../services/phone-verification.service.js';

export async function listUsers(req, res) {
  const { search, role, status, page, limit } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.isActive = status === 'active';
  if (search) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(escapedSearch, 'i');
    filter.$or = [{ name: match }, { email: match }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter)
  ]);
  return ok(res, {
    items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  });
}
export async function getUserDetails(req, res) {
  const account = await User.findById(req.params.id).select('name email phone phoneVerifiedAt role isActive createdAt updatedAt');
  if (!account) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

  const [driver, totalDeliveries, activeDeliveries] = await Promise.all([
    Driver.findOne({ user: account._id })
      .select('licenseNumber licenseExpiresAt status currentDelivery isActive createdAt updatedAt')
      .populate('currentDelivery', 'trackingNumber status'),
    account.role === 'customer' ? Delivery.countDocuments({ customer: account._id }) : 0,
    account.role === 'customer'
      ? Delivery.countDocuments({ customer: account._id, status: { $in: ['pending', 'assigned', 'accepted', 'picked_up', 'in_transit', 'rescheduled'] } })
      : 0
  ]);

  return ok(res, {
    account: {
      _id: account._id,
      name: account.name,
      email: account.email,
      phone: account.phone ?? null,
      phoneVerified: Boolean(account.phoneVerifiedAt),
      role: account.role,
      isActive: account.isActive,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    },
    driver: driver ? {
      _id: driver._id,
      licenseNumber: driver.licenseNumber,
      licenseExpiresAt: driver.licenseExpiresAt,
      status: driver.status,
      isActive: driver.isActive,
      currentDelivery: driver.currentDelivery ?? null
    } : null,
    deliverySummary: account.role === 'customer' ? { total: totalDeliveries, active: activeDeliveries } : null
  });
}
export async function createUser(req, res) {
  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const email = req.body.email.toLowerCase();
      if (await User.exists({ email }).session(session)) throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email');
      if (req.body.role === 'driver') {
        await consumePhoneVerification({
          phone: req.body.phone,
          verificationToken: req.body.phoneVerificationToken,
          purpose: 'staff_creation',
          requestedBy: req.user._id,
          session
        });
      }
      const [user] = await User.create([{
        name: req.body.name,
        email,
        phone: req.body.phone || undefined,
        phoneVerifiedAt: req.body.role === 'driver' ? new Date() : null,
        role: req.body.role,
        passwordHash: await User.hashPassword(req.body.password)
      }], { session });
      let driver = null;
      if (req.body.role === 'driver') {
        [driver] = await Driver.create([{
          user: user._id,
          licenseNumber: req.body.licenseNumber,
          licenseExpiresAt: req.body.licenseExpiresAt,
          status: req.body.driverStatus ?? 'offline'
        }], { session });
      }
      await recordAudit({ actor: req.user._id, action: 'user.created', entityType: 'User', entityId: user._id, metadata: { oldValues: null, newValues: { name: user.name, email: user.email, role: user.role } }, requestId: req.id, session });
      created = { user, driver };
    });
  } finally {
    await session.endSession();
  }
  return ok(res, created, null, 201);
}
export async function updateUser(req, res) {
  if (req.params.id === req.user._id.toString() && req.body.isActive === false) throw new AppError(409, 'SELF_DEACTIVATION', 'You cannot deactivate your own account');
  if (req.params.id === req.user._id.toString() && req.body.role) throw new AppError(409, 'SELF_ROLE_CHANGE', 'You cannot change your own role');
  const session = await mongoose.startSession();
  let updatedUser;
  try {
    await session.withTransaction(async () => {
      const user = await User.findById(req.params.id).session(session);
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

      const previousRole = user.role;
      const nextRole = req.body.role ?? previousRole;
      const previousAccountActive = user.isActive;
      let driver = null;
      let oldDriverValues = null;
      let newDriverValues = null;

      if (nextRole !== previousRole && (previousRole === 'driver' || nextRole === 'driver')) {
        driver = await Driver.findOne({ user: user._id }).session(session);
        if (!driver) throw new AppError(409, 'DRIVER_PROFILE_REQUIRED', 'A driver profile with licence details is required');
        oldDriverValues = { driverStatus: driver.status, driverIsActive: driver.isActive };

        if (driver.currentDelivery || ['reserved', 'busy'].includes(driver.status)) {
          throw new AppError(409, 'DRIVER_ACTIVE_DELIVERY', 'Complete or reassign the active delivery before changing this role');
        }

        if (previousRole === 'driver') {
          driver.status = 'offline';
          driver.isActive = false;
        } else {
          if (!user.phone || !user.phoneVerifiedAt) throw new AppError(409, 'VERIFIED_PHONE_REQUIRED', 'Verify the user phone number before changing the role to Driver');
          if (driver.licenseExpiresAt <= new Date()) throw new AppError(409, 'DRIVER_LICENCE_EXPIRED', 'Renew the driver licence before changing the role to Driver');
          driver.status = 'offline';
          driver.isActive = true;
        }
        await driver.save({ session });
        newDriverValues = { driverStatus: driver.status, driverIsActive: driver.isActive };
      }

      if (Object.hasOwn(req.body, 'isActive') && req.body.isActive !== previousAccountActive && nextRole === 'driver') {
        driver ??= await Driver.findOne({ user: user._id }).session(session);
        if (!driver) throw new AppError(409, 'DRIVER_PROFILE_REQUIRED', 'A driver profile with licence details is required');
        oldDriverValues ??= { driverStatus: driver.status, driverIsActive: driver.isActive };

        if (!req.body.isActive) {
          if (driver.currentDelivery || ['reserved', 'busy'].includes(driver.status)) {
            throw new AppError(409, 'DRIVER_ACTIVE_DELIVERY', 'Reassign or complete the active delivery before deactivating this driver');
          }
          driver.status = 'offline';
          driver.isActive = false;
        } else {
          if (!user.phone || !user.phoneVerifiedAt) throw new AppError(409, 'VERIFIED_PHONE_REQUIRED', 'Verify the driver phone number before activating this account');
          if (driver.licenseExpiresAt <= new Date()) throw new AppError(409, 'DRIVER_LICENCE_EXPIRED', 'Renew the driver licence before activating this account');
          driver.isActive = true;
          if (driver.currentDelivery) {
            const activeDelivery = await Delivery.findById(driver.currentDelivery).select('status').session(session);
            driver.status = activeDelivery?.status === 'assigned' ? 'reserved' : 'busy';
          } else {
            driver.status = 'offline';
          }
        }
        await driver.save({ session });
        newDriverValues = { driverStatus: driver.status, driverIsActive: driver.isActive };
      }

      if (Object.hasOwn(req.body, 'role')) user.role = req.body.role;
      if (Object.hasOwn(req.body, 'isActive')) user.isActive = req.body.isActive;
      updatedUser = await user.save({ session });

      if (nextRole !== previousRole) {
        await recordAudit({
          actor: req.user._id,
          action: 'user.role_changed',
          entityType: 'User',
          entityId: user._id,
          metadata: {
            oldValues: { role: previousRole, ...oldDriverValues },
            newValues: { role: nextRole, ...newDriverValues }
          },
          requestId: req.id,
          session
        });
      }
      if (Object.hasOwn(req.body, 'isActive') && req.body.isActive !== previousAccountActive) {
        await recordAudit({
          actor: req.user._id,
          action: req.body.isActive ? 'user.activated' : 'user.deactivated',
          entityType: 'User',
          entityId: user._id,
          metadata: {
            oldValues: { isActive: previousAccountActive, ...(nextRole === 'driver' ? oldDriverValues : {}) },
            newValues: { isActive: user.isActive, ...(nextRole === 'driver' ? newDriverValues : {}) }
          },
          requestId: req.id,
          session
        });
      }
    });
  } finally {
    await session.endSession();
  }
  return ok(res, updatedUser);
}
export async function listDrivers(_req, res) {
  return ok(res, await Driver.find().populate('user', 'name email phone role isActive').populate('currentDelivery', 'trackingNumber status').sort({ createdAt: -1 }));
}
export async function getMyDriver(req, res) {
  const driver = await Driver.findOne({ user: req.user._id })
    .populate('user', 'name email phone role')
    .populate('currentDelivery', 'trackingNumber status');
  if (!driver) throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile not found');
  return ok(res, driver);
}
export async function updateMyAvailability(req, res) {
  const current = await Driver.findOne({ user: req.user._id });
  if (!current) throw new AppError(404, 'DRIVER_PROFILE_NOT_FOUND', 'Driver profile not found');
  if (!current.isActive) throw new AppError(409, 'DRIVER_PROFILE_INACTIVE', 'Ask an admin to activate your driver profile');
  if (current.currentDelivery || current.status === 'busy') {
    throw new AppError(409, 'DRIVER_ASSIGNED', 'Availability cannot be changed while you have an active delivery');
  }
  if (req.body.status === 'available' && current.licenseExpiresAt <= new Date()) {
    throw new AppError(409, 'DRIVER_LICENCE_EXPIRED', 'Renew your driver licence before becoming available');
  }
  if (current.status === req.body.status) {
    await current.populate('user', 'name email phone role');
    await current.populate('currentDelivery', 'trackingNumber status');
    return ok(res, current);
  }

  const driver = await Driver.findOneAndUpdate(
    { _id: current._id, isActive: true, currentDelivery: null, status: current.status },
    { $set: { status: req.body.status } },
    { new: true, runValidators: true }
  ).populate('user', 'name email phone role').populate('currentDelivery', 'trackingNumber status');
  if (!driver) throw new AppError(409, 'DRIVER_STATUS_CHANGED', 'Your delivery or availability changed. Refresh and try again');

  await recordAudit({
    actor: req.user._id,
    action: 'driver.availability_changed',
    entityType: 'Driver',
    entityId: driver._id,
    metadata: { oldValues: { status: current.status }, newValues: { status: driver.status } },
    requestId: req.id
  });
  return ok(res, driver);
}
export async function createDriver(req, res) {
  const user = await User.findById(req.body.userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  if (!user.phone || !user.phoneVerifiedAt) throw new AppError(409, 'VERIFIED_PHONE_REQUIRED', 'Verify the user phone number before creating a driver profile');
  user.role = 'driver'; await user.save();
  const driver = await Driver.create({ user: user._id, licenseNumber: req.body.licenseNumber, licenseExpiresAt: req.body.licenseExpiresAt, status: req.body.status });
  return ok(res, await driver.populate('user', 'name email phone'), null, 201);
}
export async function updateDriver(req, res) {
  if (Object.hasOwn(req.body, 'isActive') && req.user.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Only an admin can activate or deactivate a driver');
  const current = await Driver.findById(req.params.id);
  if (!current) throw new AppError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
  const account = await User.findById(current.user).select('role isActive phone phoneVerifiedAt');
  if (!account || account.role !== 'driver') throw new AppError(409, 'DRIVER_ROLE_INVALID', 'This profile does not belong to a Driver account');
  if ((current.currentDelivery || ['reserved', 'busy'].includes(current.status)) && (Object.hasOwn(req.body, 'status') || req.body.isActive === false)) {
    throw new AppError(409, 'DRIVER_ASSIGNED', 'Availability and activation are locked while the driver has an assignment');
  }
  if (req.body.isActive === true && !account.isActive) throw new AppError(409, 'DRIVER_ACCOUNT_INACTIVE', 'Activate the driver account before enabling assignments');
  if (Object.hasOwn(req.body, 'status') && (!current.isActive || !account.isActive)) throw new AppError(409, 'DRIVER_INACTIVE', 'Activate the driver account and profile before changing availability');
  if ((req.body.isActive === true || req.body.status === 'available') && (!account.phone || !account.phoneVerifiedAt)) {
    throw new AppError(409, 'VERIFIED_PHONE_REQUIRED', 'Verify the driver phone number before enabling assignments');
  }
  if ((req.body.isActive === true || req.body.status === 'available') && current.licenseExpiresAt <= new Date()) {
    throw new AppError(409, 'DRIVER_LICENCE_EXPIRED', 'Renew the driver licence before enabling assignments');
  }

  const changes = { ...req.body };
  if (req.body.isActive === false || (req.body.isActive === true && !current.isActive)) changes.status = 'offline';
  const driver = await Driver.findOneAndUpdate(
    { _id: current._id, currentDelivery: null, status: current.status, isActive: current.isActive },
    { $set: changes },
    { new: true, runValidators: true }
  ).populate('user', 'name email phone role isActive').populate('currentDelivery', 'trackingNumber status');
  if (!driver) throw new AppError(409, 'DRIVER_STATUS_CHANGED', 'The driver assignment or status changed. Refresh and try again');
  await recordAudit({
    actor: req.user._id,
    action: Object.hasOwn(req.body, 'isActive') ? (driver.isActive ? 'driver.activated' : 'driver.deactivated') : 'driver.availability_changed',
    entityType: 'Driver',
    entityId: driver._id,
    metadata: { oldValues: { status: current.status, isActive: current.isActive }, newValues: { status: driver.status, isActive: driver.isActive } },
    requestId: req.id
  });
  return ok(res, driver);
}
export async function listVehicles(_req, res) { return ok(res, await Vehicle.find().sort({ createdAt: -1 })); }
export async function createVehicle(req, res) { return ok(res, await Vehicle.create(req.body), null, 201); }
export async function updateVehicle(req, res) {
  const current = await Vehicle.findById(req.params.id);
  if (!current) throw new AppError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
  if (current.currentDelivery && (req.body.isActive === false || (req.body.status && req.body.status !== 'in_use'))) {
    throw new AppError(409, 'VEHICLE_ASSIGNED', 'An assigned vehicle cannot be deactivated or made available');
  }
  const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (req.body.isActive === false) await recordAudit({ actor: req.user._id, action: 'vehicle.deactivated', entityType: 'Vehicle', entityId: vehicle._id, metadata: { oldValues: { isActive: current.isActive }, newValues: { isActive: vehicle.isActive } }, requestId: req.id });
  return ok(res, vehicle);
}
export async function listAudits(req, res) {
  const { actor, action, from, to, page, limit } = req.query;
  const filter = {};
  if (actor) filter.actor = actor;
  if (action) filter.action = action;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const [items, total, actions] = await Promise.all([
    AuditLog.find(filter).populate('actor', 'name role').sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('action')
  ]);
  return ok(res, {
    items,
    actions: actions.sort(),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
  });
}
function notificationScope(user) {
  return user.role === 'admin'
    ? { $or: [{ audienceRole: 'admin' }, { recipient: user._id }] }
    : { recipient: user._id };
}

export async function listNotifications(req, res) {
  const scope = notificationScope(req.user);
  const [items, unreadCount] = await Promise.all([
    Notification.find(scope).populate('delivery', 'trackingNumber status').sort({ createdAt: -1 }).limit(50),
    Notification.countDocuments({ ...scope, readAt: null })
  ]);
  return ok(res, { items, unreadCount });
}

export async function markNotificationRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, ...notificationScope(req.user) },
    { $set: { readAt: new Date() } },
    { new: true }
  ).populate('delivery', 'trackingNumber status');
  if (!notification) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
  return ok(res, notification);
}

export async function markAllNotificationsRead(req, res) {
  const result = await Notification.updateMany(
    { ...notificationScope(req.user), readAt: null },
    { $set: { readAt: new Date() } }
  );
  return ok(res, { updatedCount: result.modifiedCount });
}
