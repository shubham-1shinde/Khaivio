import mongoose from 'mongoose';

const portionOptionSchema = new mongoose.Schema(
  { name: String, price: Number },
  { _id: false }
);

const addOnSchema = new mongoose.Schema(
  { name: String, price: Number, isVeg: { type: Boolean, default: true } },
  { _id: false }
);

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: String, required: true }, // Biryani, Haleem, Sides, Desserts, Beverages
    subcategory: String,
    // Price includes 5% GST as mandated by Indian GST rules
    price: { type: Number, required: true, min: 0 },
    images: [String],
    isVeg: { type: Boolean, required: true, default: false },
    spiceLevel: {
      type: String,
      enum: ['mild', 'medium', 'hot', 'extra_hot'],
      default: 'medium',
    },
    allergens: [String],
    portionOptions: [portionOptionSchema],
    addOns: [addOnSchema],
    isAvailable: { type: Boolean, default: true },
    outlets: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Outlet' }],
    outletAvailability: [
      {
        outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet' },
        isAvailable: { type: Boolean, default: true },
        _id: false,
      },
    ],
    availableFrom: { type: String, default: '09:00' }, // HH:MM
    availableTo: { type: String, default: '23:00' },
    sortOrder: { type: Number, default: 0 },
    tags: [String],
    avgPrepTime: { type: Number, default: 15 }, // minutes, used by AI
  },
  { timestamps: true }
);

menuItemSchema.index({ category: 1 });
menuItemSchema.index({ isVeg: 1 });
menuItemSchema.index({ outlets: 1 });
menuItemSchema.index({ name: 'text', description: 'text', tags: 'text' });

export default mongoose.model('MenuItem', menuItemSchema);
