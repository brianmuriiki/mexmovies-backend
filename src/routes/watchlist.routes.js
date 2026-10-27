import { Router } from 'express';
import { listWatchlist, addToWatchlist, removeFromWatchlist } from '../controllers/watchlist.controller.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import { movieIdParam } from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate);

router.get('/', listWatchlist);
router.post('/:movieId', validate(movieIdParam, 'params'), addToWatchlist);
router.delete('/:movieId', validate(movieIdParam, 'params'), removeFromWatchlist);

export default router;
