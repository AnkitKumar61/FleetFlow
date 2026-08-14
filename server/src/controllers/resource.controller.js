import mongoose from 'mongoose';
import { User } from '../models/user.js';
import { Driver } from '../models/driver.js';
import { Vehicle } from '../models/vehicle.js';
import { AuditLog } from '../models/audit-log.js';
import { Notification } from '../models/notification.js';
import { AppError } from '../utils/app-error.js';
import { ok } from '../utils/api-response.js';
import { recordAudit } from '../services/audit.service.js';

export async function listUsers(req, res) {
  const filter = req.query.role ? { role: req.query.role } : {};
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(100);
  return ok(res, users);
}
export async function createUser(req, res) {
  const session = await mongoose.startSession();
  let created;
  try {
    await session.withTransaction(async () => {
      const email = req.body.email.toLowerCase();
      if (await User.exists({ email }).session(session)) throw new AppError(409, 'EMAIL_IN_USE', 'An account already exists for this email');
      const [user] = await User.create([{
        name: req.body.name,
        email,
        phone: req.body.phone || undefined,
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
      await recordAudit({ actor: req.user._id, action: 'user.created', entityType: 'User', entityId: user._id, metadata: { role: user.role }, requestId: req.id, session });
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
  if (req.body.role === 'driver' && !(await Driver.exists({ user: req.params.id }))) throw new AppError(409, 'DRIVER_PROFILE_REQUIRED', 'Create a driver account with licence details');
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
  if (req.body.role) await recordAudit({ actor: req.user._id, action: 'user.role_changed', entityType: 'User', entityId: user._id, metadata: { role: user.role }, requestId: req.id });
  return ok(res, user);
}
export async function listDrivers(_req, res) {
  return ok(res, await Driver.find().populate('user', 'name email phone').populate('currentDelivery', 'trackingNumber status').sort({ createdAt: -1 }));
}
export async function createDriver(req, res) {
  const user = await User.findById(req.body.userId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
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
  if (req.body.isActive === false) await recordAudit({ actor: req.user._id, action: 'vehicle.deactivated', entityType: 'Vehicle', entityId: vehicle._id, requestId: req.id });
  return ok(res, vehicle);
}
export async function listAudits(_req, res) { return ok(res, await AuditLog.find().populate('actor', 'name role').sort({ createdAt: -1 }).limit(100)); }
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
