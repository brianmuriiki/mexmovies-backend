import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// "Which movie should we add next?" Gold and Platinum viewers vote.
const pollSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, trim: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    closesAt: Date,
    options: [
      {
        title: { type: String, required: true, trim: true, maxlength: 100 },
        description: { type: String, trim: true, maxlength: 200 },
      },
    ],
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

pollSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Poll', pollSchema);
