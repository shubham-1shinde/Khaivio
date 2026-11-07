import express from 'express';
import { getOutlets, getOutlet, getNearestOutlet, getNearbyOutlets, getDashboard } from '../controllers/outlet.controller.js';
import { authenticate, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get('/', getOutlets);
router.get('/nearest', getNearestOutlet);
router.get('/nearby', getNearbyOutlets);
router.get('/admin/dashboard', authenticate, authorize('admin'), getDashboard);
router.get('/:id', getOutlet);

export default router;
