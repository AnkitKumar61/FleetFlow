import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { AuditLog } from '../models/audit-log.js';
import { Notification } from '../models/notification.js';
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
      let driver = null;
      let oldDriverValues = null;
      let newDriverValues = null;

      if (nextRole !== previousRole && (previousRole === 'driver' || nextRole === 'driver')) {
        driver = await Driver.findOne({ user: user._id }).session(session);
        if (!driver) throw new AppError(409, 'DRIVER_PROFILE_REQUIRED', 'A driver profile with licence details is required');
        oldDriverValues = { driverStatus: driver.status, driverIsActive: driver.isActive };

        if (driver.currentDelivery || driver.status === 'busy') {
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
    });
  } finally {
    await session.endSession();
  }
  return ok(res, updatedUser);
}
export async function listDrivers(_req, res) {
  return ok(res, await Driver.find().populate('user', 'name email phone role').populate('currentDelivery', 'trackingNumber status').sort({ createdAt: -1 }));
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
  if (current.currentDelivery && (req.body.isActive === false || (req.body.status && req.body.status !== 'busy'))) {
    throw new AppError(409, 'DRIVER_ASSIGNED', 'An assigned driver cannot be deactivated or made available');
  }
  const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }).populate('user', 'name email phone');
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
