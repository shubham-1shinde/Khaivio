import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import User from '../models/user.model.js';
import OTP from '../models/otp.model.js';
import LoyaltyAccount from '../models/loyaltyAccount.model.js';
import {
  generateOTP,
  hashOTP,
  verifyOTP,
  sendOTP
} from '../services/smsService.js';

const signTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
  });

  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });

  return { accessToken, refreshToken };
};

const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip + ':' + (req.body?.mobile || ''),
  message: {
    success: false,
    message: 'Too many OTP requests. Please wait before trying again.'
  },
});

const validateSendOTP = [
  body('mobile')
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Enter a valid 10-digit Indian mobile number'),
];

const validateVerifyOTP = [
  body('mobile')
    .trim()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Invalid mobile number'),

  body('otp')
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be 6 digits'),

  body('name').optional().trim().isLength({ max: 100 }),
];

const validateAdminLogin = [
  body('email').trim().isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

const sendOTPHandler = [
  otpLimiter,
  ...validateSendOTP,

  async (req, res, next) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { mobile } = req.body;

      const existingOTP = await OTP.findOne({
        mobile,
        verified: false,
        expiresAt: { $gt: new Date() },
      });

      let otpPlain;
      let otpDoc;

      if (existingOTP) {
        if (!existingOTP.canResend()) {
          const waitSec = Math.ceil(
            (
              parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10) * 1000 -
              (Date.now() - existingOTP.lastSentAt.getTime())
            ) / 1000
          );

          return res.status(429).json({
            success: false,
            message: `Please wait ${waitSec} seconds before requesting a new OTP`,
            waitSeconds: waitSec,
          });
        }

        otpPlain = generateOTP();
        existingOTP.hashedOtp = await hashOTP(otpPlain);
        existingOTP.lastSentAt = new Date();
        existingOTP.attempts = 0;

        otpDoc = await existingOTP.save();

      } else {
        otpPlain = generateOTP();

        const expiry = parseInt(
          process.env.OTP_EXPIRY_MINUTES || '10',
          10
        );

        otpDoc = await OTP.create({
          mobile,
          hashedOtp: await hashOTP(otpPlain),
          expiresAt: new Date(Date.now() + expiry * 60 * 1000),
        });
      }

      const smsResult = await sendOTP(mobile, otpPlain);

      if (!smsResult.success && process.env.NODE_ENV === 'production') {
        await OTP.deleteOne({ _id: otpDoc._id });

        return res.status(503).json({
          success: false,
          message: 'SMS delivery failed. Please try again.',
        });
      }

      return res.json({
        success: true,
        message: 'OTP sent successfully',
        ...(smsResult.mock && { dev_otp: otpPlain }),
        expiresIn: parseInt(process.env.OTP_EXPIRY_MINUTES || '10', 10) * 60,
      });

    } catch (err) {
      next(err);
    }
  },
];

const verifyOTPHandler = [
  ...validateVerifyOTP,

  async (req, res, next) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { mobile, otp, name, marketingOptIn } = req.body;

      const otpDoc = await OTP.findOne({
        mobile,
        verified: false,
        expiresAt: { $gt: new Date() },
      }).sort({ createdAt: -1 });

      if (!otpDoc) {
        return res.status(400).json({
          success: false,
          message: 'OTP expired or not found. Please request a new OTP.',
        });
      }

      const maxAttempts = parseInt(
        process.env.OTP_MAX_ATTEMPTS || '5',
        10
      );

      if (otpDoc.attempts >= maxAttempts) {
        await OTP.deleteOne({ _id: otpDoc._id });

        return res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Please request a new OTP.',
        });
      }

      const isValid = await verifyOTP(otp, otpDoc.hashedOtp);

      if (!isValid) {
        otpDoc.attempts += 1;
        await otpDoc.save();

        const remaining = maxAttempts - otpDoc.attempts;

        return res.status(400).json({
          success: false,
          message: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
          attemptsLeft: remaining,
        });
      }

      otpDoc.verified = true;
      await otpDoc.save();

      let user = await User.findOne({ mobile });
      const isNewUser = !user;

      if (!user) {
        user = await User.create({
          mobile,
          name: name || null,
          role: 'customer',
          marketingOptIn: !!marketingOptIn,
        });

        await LoyaltyAccount.create({ user: user._id });

      } else {
        if (name && !user.name) user.name = name;

        if (marketingOptIn !== undefined) {
          user.marketingOptIn = !!marketingOptIn;
        }
      }

      const { accessToken, refreshToken } = signTokens(user._id);

      user.refreshToken = refreshToken;
      await user.save();

      return res.json({
        success: true,
        message: isNewUser ? 'Account created successfully' : 'Login successful',
        isNewUser,
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          mobile: user.mobile,
          name: user.name,
          role: user.role,
          loyaltyPoints: user.loyaltyPoints,
        },
      });

    } catch (err) {
      next(err);
    }
  },
];

const adminLogin = [
  ...validateAdminLogin,

  async (req, res, next) => {
    try {
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { email, password } = req.body;

      const user = await User.findOne({email, role: { $in: ['admin', 'kitchen'] }})
        .select('+adminPassword +refreshToken')
        .populate('outlet', 'name slug _id');

      if (!user || !user.adminPassword) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const match = await bcrypt.compare(password, user.adminPassword);

      if (!match) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const { accessToken, refreshToken } = signTokens(user._id);

      user.refreshToken = refreshToken;
      await user.save();

      return res.json({
        success: true,
        message: 'Login successful',
        accessToken,
        refreshToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          outlet: user.outlet,
        },
      });

    } catch (err) {
      next(err);
    }
  },
];

const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET
      );

    } catch {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired refresh token'
      });
    }

    const user = await User.findById(decoded.id).select('+refreshToken');

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token revoked'
      });
    }

    const { accessToken, refreshToken: newRefresh } = signTokens(user._id);

    user.refreshToken = newRefresh;
    await user.save();

    return res.json({
      success: true,
      accessToken,
      refreshToken: newRefresh
    });

  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    if (req.user) {
      await User.findByIdAndUpdate(req.user._id, {
        refreshToken: null
      });
    }

    return res.json({
      success: true,
      message: 'Logged out'
    });

  } catch (err) {
    next(err);
  }
};

export {
  sendOTPHandler,
  verifyOTPHandler,
  adminLogin,
  refresh,
  logout,
};
