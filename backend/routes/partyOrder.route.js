import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import {
  submitPartyOrder,
  getMyPartyOrders,
  getPartyOrderById,
  getAllPartyOrders,
  getCateringManagerOrders,
  reviewPartyOrder,
  updatePartyOrderStatus,
  cancelPartyOrder,
} from '../controllers/partyOrder.controller.js';

const router = express.Router();

// Customer routes
router.post('/', authenticate, authorize('customer'), submitPartyOrder);
router.get('/my', authenticate, authorize('customer'), getMyPartyOrders);
router.patch('/:id/cancel', authenticate, authorize('customer'), cancelPartyOrder);

// Catering manager routes
router.get('/catering', authenticate, authorize('catering_manager'), getCateringManagerOrders);

// Admin routes — also accessible by kitchen (read-only via outletId filter)
router.get('/admin', authenticate, authorize('admin', 'kitchen'), getAllPartyOrders);

// Shared routes — catering_manager + admin
router.patch('/:id/review', authenticate, authorize('catering_manager', 'admin'), reviewPartyOrder);
router.patch('/:id/status', authenticate, authorize('admin', 'catering_manager'), updatePartyOrderStatus);

// Authenticated – access controlled inside controller
router.get('/:id', authenticate, getPartyOrderById);

export default router;
