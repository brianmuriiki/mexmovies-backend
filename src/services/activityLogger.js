import ActivityLog from '../models/ActivityLog.js';

// Never lets a logging problem break the request.
export async function logActivity({ actor, action, targetType, targetId, details }) {
  try {
    await ActivityLog.create({ actor, action, targetType, targetId, details });
  } catch (err) {
    console.error('Activity log failed:', err.message);
  }
}
