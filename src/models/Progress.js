import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// "Continue watching": where a viewer stopped in each movie.
const progressSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    movie: { type: ObjectId, ref: 'Movie', required: true },
    positionSeconds: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

progressSchema.index({ user: 1, movie: 1 }, { unique: true });
progressSchema.index({ user: 1, updatedAt: -1 });

export default mongoose.model('Progress', progressSchema);
