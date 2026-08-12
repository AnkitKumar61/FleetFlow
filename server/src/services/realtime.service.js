import { Driver } from '../models/driver.js';

let io;

export const setRealtimeServer = (server) => { io = server; };

export async function emitDeliveryUpdate(delivery, assignedDriver = delivery.assignedDriver) {
  if (!io) return;
  const payload = { deliveryId: delivery._id, status: delivery.status, updatedAt: delivery.updatedAt };
  let audience = io.to('role:admin').to('role:manager').to(`user:${delivery.customer}`).to(`delivery:${delivery._id}`);
  if (assignedDriver) {
    const driver = await Driver.findById(assignedDriver).select('user');
    if (driver?.user) audience = audience.to(`user:${driver.user}`);
  }
  audience.emit('delivery:updated', payload);
}

export function emitManagerAlert(notification) {
  io?.to('role:admin').to('role:manager').emit('notification:created', notification);
}
