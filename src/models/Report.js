import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema(
  {
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, enum: ['broken', 'infringement', 'inappropriate', 'other'], required: true },
    message: { type: String, trim: true, maxlength: 1000 },
    reporterEmail: { type: String, trim: true, lowercase: true, maxlength: 120 },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open', index: true },
    note: { type: String, trim: true, maxlength: 500 },
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Report', reportSchema);
