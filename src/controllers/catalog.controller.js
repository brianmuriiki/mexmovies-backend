import { asyncHandler } from '../utils/asyncHandler.js';
import { getCatalog, publishSnapshot } from '../services/catalogSnapshot.js';
import { logActivity } from '../services/activityLogger.js';

// GET /api/catalog  (public, cached by the CDN)
export const catalog = asyncHandler(async (_req, res) => {
  res.json(await getCatalog());
});

// POST /api/admin/catalog/rebuild  (admin: force a rebuild and upload now)
export const rebuildCatalog = asyncHandler(async (req, res) => {
  const data = await publishSnapshot();
  await logActivity({ actor: req.user._id, action: 'catalog.rebuild', details: { count: data.count } });
  res.json({ data: { count: data.count, generatedAt: data.generatedAt } });
});
