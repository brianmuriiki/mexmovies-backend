import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const TRANSACTION_TYPES = ['earn_watch', 'bonus_level', 'redeem', 'adjust', 'expire'];

// Append-only history: a balance can always be explained by adding these up.
const transactionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TRANSACTION_TYPES, required: true },
    amount: { type: Number, required: true }, // positive = earned, negative = spent
    balanceAfter: Number,
    reference: String, // level key, redemption item, or admin reason
    day: String, // only for earn_watch: one combined entry per user per day
    createdAt: { type: Date },
  },
  { versionKey: false }
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index(
  { user: 1, day: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'earn_watch' } }
);

export default mongoose.model('PointsTransaction', transactionSchema);
