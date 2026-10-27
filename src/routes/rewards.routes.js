import { Router } from 'express';
import {
  listLevels,
  myRewards,
  myPoints,
  redemptionCatalog,
  redeem,
} from '../controllers/rewards.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { noStore, publicCache } from '../middleware/cache.js';
import { redeemSchema } from '../validators/schemas.js';

const router = Router();

router.get('/levels', publicCache(3600), listLevels); // public

router.use(noStore, authenticate);
router.get('/me', myRewards);
router.get('/points', myPoints);
router.get('/catalog', redemptionCatalog);
router.post('/redeem', validate(redeemSchema), redeem);

export default router;
