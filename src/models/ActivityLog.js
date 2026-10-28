import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const activityLogSchema = new mongoose.Schema(
  {
    actor: { type: ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true }, // e.g. movie.create, movie.approve, user.create
    targetType: { type: String, enum: ['movie', 'user', 'genre', 'report'] },
    targetId: ObjectId,
    details: Object,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Logs are deleted automatically after 90 days to save free database storage.
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model('ActivityLog', activityLogSchema);
