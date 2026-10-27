import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const voteSchema = new mongoose.Schema(
  {
    poll: { type: ObjectId, ref: 'Poll', required: true },
    option: { type: ObjectId, required: true },
    user: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

voteSchema.index({ poll: 1, user: 1 }, { unique: true }); // one vote per viewer per poll
voteSchema.index({ poll: 1, option: 1 });

export default mongoose.model('Vote', voteSchema);
