import mongoose from 'mongoose';

const operatingHoursSchema = new mongoose.Schema(
  {
    day: {
      type: Number,
      min: 0,
      max: 6,
    }, // 0=Sun, 6=Sat

    open: {
      type: String,
    }, // "HH:MM"

    close: {
      type: String,
    },

    isClosed: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const outletSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },

    type: {
      type: String,
      enum: ['outlet', 'cloud_kitchen'],
      default: 'outlet',
    },

    city: {
      type: String,
      default: 'Hyderabad',
      trim: true,
    },

    address: {
      type: String,
      required: true,
    },

    fssaiNumber: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
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

    deliveryRadius: {
      type: Number,
      default: 5,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    operatingHours: [operatingHoursSchema],

    minimumPrepTime: {
      type: Number,
      default: 20,
    }, // minutes

    currentLoad: {
      type: Number,
      default: 0,
    }, // active orders count
  },
  { timestamps: true }
);

outletSchema.index({
  'coordinates.lat': 1,
  'coordinates.lng': 1,
});

export default mongoose.model('Outlet', outletSchema);
