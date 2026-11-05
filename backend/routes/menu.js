import express from 'express';
import {
  getMenuItems,
  getCategories,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  toggleOutletAvailability,
  getAllMenuItemsAdmin,
} from '../controllers/menuController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getMenuItems);
router.get('/categories', getCategories);
router.get('/admin/all', authenticate, authorize('admin'), getAllMenuItemsAdmin);
router.get('/:id', getMenuItem);
router.post('/', authenticate, authorize('admin'), createMenuItem);
router.put('/:id', authenticate, authorize('admin'), updateMenuItem);
router.delete('/:id', authenticate, authorize('admin'), deleteMenuItem);
router.patch('/:id/availability', authenticate, authorize('admin', 'kitchen'), toggleOutletAvailability);

export default router;