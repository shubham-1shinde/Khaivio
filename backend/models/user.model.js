
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      sparse: true,
      unique: true,
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'],
    },

    name: {
      type: String,
      trim: true,
      maxLength: 100,
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
    },

    address: {
      area: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      pincode: {
        type: String,
        trim: true,
        match: [/^\d{6}$/, 'Invalid Indian pincode'],
      },
      coordinates: {
        lat: {
          type: Number,
          min: -90,
          max: 90,
        },
        lng: {
          type: Number,
          min: -180,
          max: 180,
        },
      },
    },

    isProfileComplete: {
      type: Boolean,
      default: false,
    },

    adminPassword: {
      type: String,
      select: false,
    },

    role: {
      type: String,
      enum: ['customer', 'admin', 'kitchen', 'catering_manager'],
      default: 'customer',
    },

    outlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Outlet',
    }, // kitchen role

    loyaltyPoints: {
      type: Number,
      default: 0,
    },

    marketingOptIn: {
      type: Boolean,
      default: false,
    },

    refreshToken: {
      type: String,
      select: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

userSchema.index({ mobile: 1 });
userSchema.index({ role: 1 });

export default mongoose.model('User', userSchema);
