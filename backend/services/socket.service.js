import { Server } from 'socket.io';

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join-outlet', (outletId) => {
      socket.join(`outlet:${outletId}`);
      console.log(`Kitchen socket ${socket.id} joined outlet:${outletId}`);
    });

    socket.on('join-order', (orderId) => {
      socket.join(`order:${orderId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
};

const emitNewOrder = (outletId, order) => {
  try {
    getIO().to(`outlet:${outletId}`).emit('new-order', order);
  } catch (e) {
    console.error('Socket emit error (new-order):', e.message);
  }
};

const emitOrderStatusUpdate = (outletId, orderId, data) => {
  try {
    getIO().to(`outlet:${outletId}`).to(`order:${orderId}`).emit('order-status-update', data);
  } catch (e) {
    console.error('Socket emit error (order-status-update):', e.message);
  }
};

const emitLateAlert = (outletId, data) => {
  try {
    getIO().to(`outlet:${outletId}`).emit('order-late-alert', data);
  } catch (e) {
    console.error('Socket emit error (order-late-alert):', e.message);
  }
};

export { initSocket, getIO, emitNewOrder, emitOrderStatusUpdate, emitLateAlert };
