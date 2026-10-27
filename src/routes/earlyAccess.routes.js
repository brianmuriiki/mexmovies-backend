import { Router } from 'express';
import { requireEarlyAccess, listEarlyAccess, getEarlyAccess } from '../controllers/earlyAccess.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { slugParam } from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate, requireEarlyAccess);

router.get('/', listEarlyAccess);
router.get('/:slug', validate(slugParam, 'params'), getEarlyAccess);

export default router;
