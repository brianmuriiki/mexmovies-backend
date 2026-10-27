import { Router } from 'express';
import { listOpenPolls, vote } from '../controllers/poll.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { idParam, voteSchema } from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate);

router.get('/', listOpenPolls);
router.post('/:id/vote', validate(idParam, 'params'), validate(voteSchema), vote);

export default router;
