'use strict';

const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    mobile: { type: String, required: true, index: true },
    hashedOtp: { type: String, required: true },
    attempts: { type: Number, default: 0, max: 5 },
    verified: { type: Boolean, default: false },
    expiresAt: { type: Date, required: true },
    lastSentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// TTL index — MongoDB auto-removes doc ~60s after expiresAt
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });
otpSchema.index({ mobile: 1, verified: 1 });

otpSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

otpSchema.methods.canResend = function () {
  const cooldown = parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10) * 1000;
  return Date.now() - this.lastSentAt.getTime() >= cooldown;
};

module.exports = mongoose.model('OTP', otpSchema);
