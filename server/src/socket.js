import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { User } from './models/user.js';
import { Driver } from './models/driver.js';
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
    if (socket.user.role === 'driver') await Driver.updateOne({ user: socket.user._id, status: 'offline' }, { status: 'available' });
    socket.on('delivery:watch', (id) => socket.join(`delivery:${id}`));
    socket.on('disconnect', async () => {
      if (socket.user.role === 'driver') await Driver.updateOne({ user: socket.user._id, status: 'available' }, { status: 'offline' });
    });
  });
  setRealtimeServer(io);
  return io;
}

