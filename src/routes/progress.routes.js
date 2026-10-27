import { Router } from 'express';
import { listProgress, saveProgress } from '../controllers/progress.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { heartbeatLimiter } from '../middleware/rateLimit.js';
import { movieIdParam, progressBody } from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate);

router.get('/', listProgress);
router.put('/:movieId', heartbeatLimiter, validate(movieIdParam, 'params'), validate(progressBody), saveProgress);

export default router;
