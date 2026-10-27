// Movies that everyone may see: published, and past their early-access period (if any).
export const publicFilter = (now = new Date()) => ({
  status: 'published',
  $or: [{ publicAt: null }, { publicAt: { $lte: now } }],
});
