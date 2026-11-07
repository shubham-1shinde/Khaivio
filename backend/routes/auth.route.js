import express from 'express';
import {
  sendOTPHandler,
  verifyOTPHandler,
  adminLogin,
  refresh,
  logout
} from '../controllers/auth.controller.js';

import { authenticate } from '../middleware/auth.middleware.js';
import User from '../models/user.model.js';

const router = express.Router();

router.post('/send-otp', sendOTPHandler);
router.post('/verify-otp', verifyOTPHandler);

router.post('/admin/login', adminLogin);

router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);

// GET /api/auth/me — returns current user from JWT
router.get('/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .populate('outlet', 'name slug _id')
            .select('-refreshToken -adminPassword')
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        return res.json({
            success: true,
            user,
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message,
        });
    }
});

export default router;
