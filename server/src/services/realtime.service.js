import { Driver } from '../models/driver.js';

let io;

export const setRealtimeServer = (server) => { io = server; };

export async function emitDeliveryUpdate(delivery, assignedDriver = delivery.assignedDriver) {
  if (!io) return;
  const payload = { deliveryId: delivery._id, status: delivery.status, updatedAt: delivery.updatedAt };
  let audience = io.to('role:admin').to(`user:${delivery.customer}`).to(`delivery:${delivery._id}`);
  const driverIds = (Array.isArray(assignedDriver) ? assignedDriver : [assignedDriver]).filter(Boolean);
  for (const driverId of driverIds) {
    const driver = await Driver.findById(driverId).select('user');
    if (driver?.user) audience = audience.to(`user:${driver.user}`);
  }
  audience.emit('delivery:updated', payload);
}

export async function emitLocationUpdate(delivery) {
  if (!io || !delivery.liveLocation) return;
  const payload = { deliveryId: delivery._id, location: delivery.liveLocation.toObject?.() ?? delivery.liveLocation };
  let audience = io.to('role:admin').to(`user:${delivery.customer}`).to(`delivery:${delivery._id}`);
  if (delivery.assignedDriver) {
    const driver = await Driver.findById(delivery.assignedDriver).select('user');
    if (driver?.user) audience = audience.to(`user:${driver.user}`);
  }
  audience.emit('delivery:location', payload);
}

export function emitAdminAlert(notification) {
  io?.to('role:admin').emit('notification:created', notification);
}

export function emitUserAlert(notification, userId) {
  io?.to(`user:${userId}`).emit('notification:created', notification);
}
