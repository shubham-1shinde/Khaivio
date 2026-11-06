import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware.js';
import { getDashboard } from '../controllers/outlet.controller.js';
import { getAllMenuItemsAdmin } from '../controllers/menu.controller.js';
import { getAllOrders } from '../controllers/order.controller.js';
import LoyaltyAccount from '../models/loyaltyAccount.model.js';
import User from '../models/user.model.js';
import Order from '../models/order.model.js';

const router = express.Router();

router.use(authenticate, authorize('admin'));

router.get('/dashboard', getDashboard);
router.get('/menu', getAllMenuItemsAdmin);
router.get('/orders', getAllOrders);

router.get('/repeat-customers', async (req, res, next) => {
  try {
    const { outletId, days = 30 } = req.query;
    const since = new Date(Date.now() - parseInt(days, 10) * 24 * 60 * 60 * 1000);
    const filter = { placedAt: { $gte: since }, status: { $nin: ['cancelled'] } };
    if (outletId) filter.outlet = outletId;

    const repeatData = await Order.aggregate([
      { $match: filter },
      { $group: { _id: '$customer', orderCount: { $sum: 1 } } },
      { $group: { _id: null, total: { $sum: 1 }, repeat: { $sum: { $cond: [{ $gt: ['$orderCount', 1] }, 1, 0] } } } },
    ]);

    const { total = 0, repeat = 0 } = repeatData[0] || {};
    return res.json({
      success: true,
      data: { totalCustomers: total, repeatCustomers: repeat, repeatRate: total ? Math.round((repeat / total) * 100) : 0 },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/seed', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Not allowed in production' });
  }
  try {
    import('../seed/seed.js');
    return res.json({ success: true, message: 'Seed started' });
  } catch (err) {
    next(err);
  }
});

export default router;
