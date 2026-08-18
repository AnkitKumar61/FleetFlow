import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { User } from './models/user.js';
import { Driver } from './models/driver.js';
import { Delivery } from './models/delivery.js';
import { setRealtimeServer } from './services/realtime.service.js';

export function attachSocketServer(httpServer) {
  const io = new Server(httpServer, { cors: { origin: env.CLIENT_ORIGIN.split(','), credentials: true } });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const payload = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
      const user = await User.findById(payload.sub).select('_id role isActive');
      if (!user?.isActive) throw new Error('inactive');
      socket.user = user;
      next();
    } catch { next(new Error('Authentication failed')); }
  });
  io.on('connection', async (socket) => {
    socket.join(`user:${socket.user._id}`);
    socket.join(`role:${socket.user.role}`);
    if (socket.user.role === 'driver') {
      socket.driver = await Driver.findOne({ user: socket.user._id }).select('_id');
    }
    socket.on('delivery:watch', async (id, acknowledge = () => {}) => {
      try {
        const delivery = await Delivery.findById(id).select('customer assignedDriver');
        const canWatch = delivery && (
          socket.user.role === 'admin'
          || (socket.user.role === 'customer' && delivery.customer.toString() === socket.user._id.toString())
          || (socket.user.role === 'driver' && socket.driver && delivery.assignedDriver?.toString() === socket.driver._id.toString())
        );
        if (!canWatch) return acknowledge({ ok: false, error: 'FORBIDDEN' });
        await socket.join(`delivery:${delivery._id}`);
        return acknowledge({ ok: true });
      } catch { return acknowledge({ ok: false, error: 'INVALID_DELIVERY' }); }
    });
  });
  setRealtimeServer(io);
  return io;
}
