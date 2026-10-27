import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// One document per viewer: watch time, level, and points.
const rewardSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true, unique: true },
    totalSeconds: { type: Number, default: 0 }, // lifetime watch time that was credited
    level: { type: String, default: 'none' }, // none | bronze | silver | gold | platinum
    todaySeconds: { type: Number, default: 0 },
    todayDate: { type: String, default: '' }, // YYYY-MM-DD (UTC)
    pointsBalance: { type: Number, default: 0 }, // goes down when points are spent
    lifetimePoints: { type: Number, default: 0 }, // only goes up
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export default mongoose.model('Reward', rewardSchema);
