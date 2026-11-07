import mongoose from 'mongoose';

const loyaltyTransactionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['earned', 'redeemed'], required: true },
    points: { type: Number, required: true },
    orderId: String,
    description: String,
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const loyaltyAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    totalEarned: { type: Number, default: 0 },
    totalRedeemed: { type: Number, default: 0 },
    currentBalance: { type: Number, default: 0 },
    transactions: [loyaltyTransactionSchema],
  },
  { timestamps: true }
);

loyaltyAccountSchema.statics.EARN_RATE = 10; // ₹ per point
loyaltyAccountSchema.statics.REDEEM_RATE = 0.25; // ₹ per point
loyaltyAccountSchema.statics.MIN_REDEEM = 40; // points

loyaltyAccountSchema.methods.addPoints = async function (points, orderId, desc) {
  this.totalEarned += points;
  this.currentBalance += points;
  this.transactions.push({ type: 'earned', points, orderId, description: desc });
  return this.save();
};

loyaltyAccountSchema.methods.redeemPoints = async function (points, orderId, desc) {
  if (points > this.currentBalance) throw new Error('Insufficient loyalty points');
  this.totalRedeemed += points;
  this.currentBalance -= points;
  this.transactions.push({ type: 'redeemed', points, orderId, description: desc });
  return this.save();
};

export default mongoose.model('LoyaltyAccount', loyaltyAccountSchema);