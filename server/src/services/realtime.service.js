let io;

export const setRealtimeServer = (server) => { io = server; };

export function emitDeliveryUpdate(delivery) {
  if (!io) return;
  const payload = { deliveryId: delivery._id, status: delivery.status, updatedAt: delivery.updatedAt };
  io.to('role:admin').to('role:manager').to(`user:${delivery.customer}`).to(`delivery:${delivery._id}`).emit('delivery:updated', payload);
}

export function emitManagerAlert(notification) {
  io?.to('role:admin').to('role:manager').emit('notification:created', notification);
}

