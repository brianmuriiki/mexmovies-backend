import mongoose from 'mongoose';

// Stays empty until subscriptions launch.
const redemptionItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 300 },
    type: { type: String, enum: ['subscription'], default: 'subscription' },
    durationDays: { type: Number, default: 30, min: 1 }, // how long the subscription lasts
    costPoints: { type: Number, required: true, min: 1 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('RedemptionItem', redemptionItemSchema);
