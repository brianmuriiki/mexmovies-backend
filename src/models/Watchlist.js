import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const watchlistSchema = new mongoose.Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    movie: { type: ObjectId, ref: 'Movie', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

watchlistSchema.index({ user: 1, movie: 1 }, { unique: true });

export default mongoose.model('Watchlist', watchlistSchema);
