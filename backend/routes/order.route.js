import express from 'express';
import {
  placeOrder,
  getMyOrders,
  getOrder,
  getOutletOrders,
  updateOrderStatus,
  getAllOrders,
} from '../controllers/order.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/', authenticate, authorize('customer'), placeOrder);
router.get('/my', authenticate, authorize('customer'), getMyOrders);
router.get('/admin/all', authenticate, authorize('admin'), getAllOrders);
router.get('/outlet/:outletId', authenticate, authorize('admin', 'kitchen'), getOutletOrders);
router.get('/:orderId', authenticate, getOrder);
router.patch('/:orderId/status', authenticate, authorize('admin', 'kitchen'), updateOrderStatus);

export default router;
