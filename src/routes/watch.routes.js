import { Router } from 'express';
import { heartbeat } from '../controllers/rewards.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { heartbeatLimiter } from '../middleware/rateLimit.js';
import { heartbeatSchema } from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate, heartbeatLimiter);

router.post('/heartbeat', validate(heartbeatSchema), heartbeat);

export default router;
