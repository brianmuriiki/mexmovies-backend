import Poll from '../models/Poll.js';
import Vote from '../models/Vote.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { hasLevel } from '../services/rewardsService.js';
import { logActivity } from '../services/activityLogger.js';

const isOpen = (poll) => poll.status === 'open' && (!poll.closesAt || poll.closesAt > new Date());

// Builds the response for polls: options with vote counts, and the viewer's own vote.
async function present(polls, userId, canVote) {
  if (!polls.length) return [];
  const ids = polls.map((p) => p._id);
  const [counts, mine] = await Promise.all([
    Vote.aggregate([{ $match: { poll: { $in: ids } } }, { $group: { _id: { poll: '$poll', option: '$option' }, votes: { $sum: 1 } } }]),
    userId ? Vote.find({ user: userId, poll: { $in: ids } }).lean() : [],
  ]);
  const countOf = (pollId, optionId) =>
    counts.find((c) => String(c._id.poll) === String(pollId) && String(c._id.option) === String(optionId))?.votes || 0;

  return polls.map((p) => {
    const options = p.options.map((o) => ({ id: o._id, title: o.title, description: o.description, votes: countOf(p._id, o._id) }));
    return {
      id: p._id,
      title: p.title,
      description: p.description,
      status: p.status,
      isOpen: isOpen(p),
      closesAt: p.closesAt || null,
      totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
      options,
      myVoteOptionId: mine.find((v) => String(v.poll) === String(p._id))?.option || null,
      canVote: Boolean(canVote) && isOpen(p),
    };
  });
}

// GET /api/polls  (logged in: open polls)
export const listOpenPolls = asyncHandler(async (req, res) => {
  const polls = await Poll.find({ status: 'open', $or: [{ closesAt: null }, { closesAt: { $gt: new Date() } }] })
    .sort({ createdAt: -1 })
    .lean();
  const canVote = await hasLevel(req.user._id, 'gold');
  res.json({ data: await present(polls, req.user._id, canVote) });
});

// POST /api/polls/:id/vote  { optionId }  (Gold or Platinum; changing your vote is allowed)
export const vote = asyncHandler(async (req, res) => {
  if (!(await hasLevel(req.user._id, 'gold'))) {
    throw new ApiError(403, 'Voting is for Gold and Platinum members');
  }
  const poll = await Poll.findById(req.params.id).lean();
  if (!poll) throw new ApiError(404, 'Poll not found');
  if (!isOpen(poll)) throw new ApiError(409, 'This poll is closed');
  if (!poll.options.some((o) => String(o._id) === req.body.optionId)) {
    throw new ApiError(400, 'That option does not belong to this poll');
  }
  await Vote.findOneAndUpdate({ poll: poll._id, user: req.user._id }, { $set: { option: req.body.optionId } }, { upsert: true });
  const [result] = await present([poll], req.user._id, true);
  res.json({ data: result });
});

// ---------- admin ----------

// POST /api/admin/polls
export const createPoll = asyncHandler(async (req, res) => {
  const poll = await Poll.create({ ...req.body, createdBy: req.user._id });
  await logActivity({ actor: req.user._id, action: 'poll.create', targetId: poll._id, details: { title: poll.title } });
  res.status(201).json({ data: (await present([poll.toObject()], null, false))[0] });
});

// GET /api/admin/polls  (all polls with results)
export const listAllPolls = asyncHandler(async (_req, res) => {
  const polls = await Poll.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data: await present(polls, null, false) });
});

// PATCH /api/admin/polls/:id/close
export const closePoll = asyncHandler(async (req, res) => {
  const poll = await Poll.findByIdAndUpdate(req.params.id, { $set: { status: 'closed' } }, { new: true }).lean();
  if (!poll) throw new ApiError(404, 'Poll not found');
  await logActivity({ actor: req.user._id, action: 'poll.close', targetId: poll._id, details: { title: poll.title } });
  res.json({ data: (await present([poll], null, false))[0] });
});

// DELETE /api/admin/polls/:id
export const deletePoll = asyncHandler(async (req, res) => {
  const poll = await Poll.findByIdAndDelete(req.params.id);
  if (!poll) throw new ApiError(404, 'Poll not found');
  await Vote.deleteMany({ poll: poll._id });
  await logActivity({ actor: req.user._id, action: 'poll.delete', targetId: poll._id, details: { title: poll.title } });
  res.status(204).end();
});
