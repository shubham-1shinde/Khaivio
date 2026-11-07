import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    portionOption: String,
    addOns: [{ name: String, price: Number }],
    unitPrice: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
  },
  { _id: false }
);

const statusHistorySchema = new mongoose.Schema(
  {
    status: String,
    timestamp: { type: Date, default: Date.now },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    outlet: { type: mongoose.Schema.Types.ObjectId, ref: 'Outlet', required: true },
    items: [orderItemSchema],
    subtotal: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    discountAmount: { type: Number, default: 0 },
    loyaltyPointsUsed: { type: Number, default: 0 },
    loyaltyPointsEarned: { type: Number, default: 0 },
    couponCode: String,
    total: { type: Number, required: true },
    payment: {
      method: { type: String, enum: ['upi', 'card', 'cod'], required: true },
      status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
      transactionId: String,
      paidAt: Date,
    },
    deliveryType: { type: String, enum: ['pickup', 'delivery'], default: 'pickup' },
    deliveryAddress: {
      street: String,
      city: String,
      pincode: String,
    },
    status: {
      type: String,
      enum: ['placed', 'confirmed', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled'],
      default: 'placed',
    },
    prepTimeEstimate: { type: Number }, // final used value (max of AI + min)
    aiEstimatedPrepTime: { type: Number }, // raw AI prediction
    kitchenNotes: String,
    statusHistory: [statusHistorySchema],
    placedAt: { type: Date, default: Date.now },
    promisedAt: Date,
    actualReadyAt: Date,
    isLate: { type: Boolean, default: false },
    alertSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

orderSchema.index({ orderId: 1 });
orderSchema.index({ customer: 1, placedAt: -1 });
orderSchema.index({ outlet: 1, status: 1, placedAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ isLate: 1, alertSent: 1 });

orderSchema.pre('validate', async function (next) {
  if (!this.orderId) {
    let unique = false;
    while (!unique) {
      const id = 'WEB-' + Math.floor(100000 + Math.random() * 900000);
      const exists = await mongoose.model('Order').findOne({ orderId: id });
      if (!exists) {
        this.orderId = id;
        unique = true;
      }
    }
  }
  next();
});

export default mongoose.model('Order', orderSchema);