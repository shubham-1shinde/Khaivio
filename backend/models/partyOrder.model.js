import mongoose from 'mongoose';

const partyOrderItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: true,
    },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true },
  },
  { _id: false }
);

const partyOrderSchema = new mongoose.Schema(
  {
    partyOrderId: {
      type: String,
      unique: true,
      required: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    outlet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Outlet',
      required: true,
    },

    // Event information
    eventType: {
      type: String,
      enum: ['Birthday', 'Wedding', 'Corporate Event', 'Anniversary', 'Other'],
      required: true,
    },

    eventDateTime: {
      type: Date,
      required: true,
    },

    guestCount: {
      type: Number,
      required: true,
      min: 1,
    },

    foodPreference: {
      type: String,
      enum: ['Veg', 'Non-Veg', 'Both'],
      required: true,
    },

    // Food items
    items: [partyOrderItemSchema],

    // Delivery details
    deliveryAddress: {
      street: { type: String, trim: true },
      area: { type: String, trim: true },
      city: { type: String, trim: true, default: 'Hyderabad' },
      pincode: {
        type: String,
        trim: true,
        match: [/^\d{6}$/, 'Invalid pincode'],
      },
    },

    // Contact details
    customerName: {
      type: String,
      trim: true,
      required: true,
      maxLength: 100,
    },

    contactNumber: {
      type: String,
      trim: true,
      required: true,
      match: [/^[6-9]\d{9}$/, 'Invalid Indian mobile number'],
    },

    specialInstructions: {
      type: String,
      trim: true,
      maxLength: 1000,
    },

    additionalRequirements: {
      type: String,
      trim: true,
      maxLength: 1000,
    },

    // Status management
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected', 'preparing', 'completed', 'cancelled'],
      default: 'pending',
    },

    statusHistory: [statusHistorySchema],

    // Review fields
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    reviewedAt: { type: Date },

    rejectionReason: {
      type: String,
      trim: true,
      maxLength: 500,
    },

    managerRemarks: {
      type: String,
      trim: true,
      maxLength: 500,
    },

    // Pricing
    estimatedTotal: {
      type: Number,
      min: 0,
      default: 0,
    },

    placedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

partyOrderSchema.index({ customer: 1, placedAt: -1 });
partyOrderSchema.index({ outlet: 1, status: 1 });
partyOrderSchema.index({ status: 1, eventDateTime: 1 });
// Note: partyOrderId already has unique:true which creates an index; no need for schema.index()

export default mongoose.model('PartyOrder', partyOrderSchema);
