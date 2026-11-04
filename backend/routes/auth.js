import { Router } from 'express';

import {
  sendOTPHandler,
  verifyOTPHandler,
  adminLogin,
  refresh,
  logout
} from '../controllers/authController.js';

import { authenticate } from '../middleware/auth.js';
import User from '../models/User.js';

const router = Router();

router.post('/send-otp', sendOTPHandler);
router.post('/verify-otp', verifyOTPHandler);
router.post('/admin/login', adminLogin);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);

router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('outlet', 'name slug _id')
            .select('-refreshToken -adminPassword')
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.json({
            success: true,
            user
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

export default router;
