import Movie from '../models/Movie.js';
import Report from '../models/Report.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { pageResult } from '../utils/pagination.js';
import { publicFilter } from '../services/visibility.js';
import { logActivity } from '../services/activityLogger.js';

export const createReport = asyncHandler(async (req, res) => {
  const movie = await Movie.findOne({ _id: req.params.id, ...publicFilter() }).select('_id').lean();
  if (!movie) throw new ApiError(404, 'Movie not found');

  await Report.create({
    movie: movie._id,
    user: req.user?._id,
    reason: req.body.reason,
    message: req.body.message,
    reporterEmail: req.body.email,
  });
  res.status(201).json({ message: 'Thank you. Your report has been sent for review.' });
});

export const listReports = asyncHandler(async (req, res) => {
  const { page, limit, status } = req.query;
  const filter = status ? { status } : {};
  const [reports, total] = await Promise.all([
    Report.find(filter)
      .populate('movie', 'title status')
      .populate('user', 'name email')
      .populate('handledBy', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Report.countDocuments(filter),
  ]);
  res.json(pageResult(reports, total, page, limit));
});

export const updateReport = asyncHandler(async (req, res) => {
  const report = await Report.findById(req.params.id);
  if (!report) throw new ApiError(404, 'Report not found');

  report.status = req.body.status;
  report.note = req.body.note || undefined;
  report.handledBy = req.user._id;
  await report.save();
  await logActivity({
    actor: req.user._id,
    action: 'report.update',
    targetType: 'report',
    targetId: report._id,
    details: { status: report.status },
  });
  await report.populate([
    { path: 'movie', select: 'title status' },
    { path: 'user', select: 'name email' },
    { path: 'handledBy', select: 'name' },
  ]);
  res.json({ data: report });
});
