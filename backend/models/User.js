'use strict';

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'],
    },
    name: { type: String, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, sparse: true },
    adminPassword: { type: String, select: false }, // bcrypt hash, admin/kitchen only
    role: {
      type: String,
      enum: ['customer', 'admin', 'kitchen'],
      default: 'customer',
    },
    outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet' }, // kitchen role
    loyaltyPoints: { type: Number, default: 0 },
    marketingOptIn: { type: Boolean, default: false },
    refreshToken: { type: String, select: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.index({ mobile: 1 });
userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
