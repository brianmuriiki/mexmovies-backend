import mongoose from 'mongoose';

const levelSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  hours: { type: Number, required: true, min: 0 },
  perk: { type: String, default: '' },
  bonusPoints: { type: Number, default: 0, min: 0 },
  order: { type: Number, default: 0 },
});

export default mongoose.model('Level', levelSchema);
