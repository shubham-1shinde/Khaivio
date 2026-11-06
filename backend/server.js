import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import mongoSanitize from 'mongo-sanitize';
import connectDB from './config/db.js';
import { initSocket } from './services/socket.service.js';
import errorHandler from './middleware/errorHandler.middleware.js';
import authRoutes from './routes/auth.route.js';
import menuRoutes from './routes/menu.route.js';
import orderRoutes from './routes/order.route.js';
import outletRoutes from './routes/outlet.route.js';

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

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`\nCompany A API Server running on port ${PORT}`);
});

export { app, server };
