import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// One document per subscriber. `source` records how it was obtained.
// A paid checkout (when you add one) would call grantSubscription with source "payment".
const subscriptionSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    plan: String,
    source: { type: String, enum: ['points', 'admin', 'payment'], required: true },
    startsAt: Date,
    endsAt: { type: Date, required: true },
    updatedAt: Date,
  },
  { versionKey: false }
);

export default mongoose.model('Subscription', subscriptionSchema);
