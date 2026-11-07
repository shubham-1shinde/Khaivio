import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'mongo-sanitize';
import connectDB from './config/db.js';
import { initSocket } from './services/socket.service.js';
import errorHandler from './middleware/errorHandler.middleware.js';
import authRoutes from './routes/auth.route.js';
import menuRoutes from './routes/menu.route.js';
import orderRoutes from './routes/order.route.js';
import outletRoutes from './routes/outlet.route.js';
import adminRoutes from './routes/admin.route.js';
import aiRoutes from './routes/ai.route.js';
import userRoutes from './routes/user.route.js';
import partyOrderRoutes from './routes/partyOrder.route.js';

const app = express();
const server = http.createServer(app);

connectDB();
initSocket(server);
app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeader: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.'
  },
});

app.use(generalLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use((req, _res, next) => {
  req.body = mongoSanitize(req.body);
  req.query = mongoSanitize(req.query);
  req.params = mongoSanitize(req.params);
  next();
});

app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Company A Biryani API is running',
    env: process.env.NODE_ENV
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/outlets', outletRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/party-orders', partyOrderRoutes);
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`\nCompany A Biryani API Server running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   SMS Mode    : ${process.env.SMS_MOCK_MODE === 'true' ? 'MOCK' : 'LIVE'}`);
  console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err.message);
  server.close(() => process.exit(1));
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
  process.exit(1);
});

export { app, server };
