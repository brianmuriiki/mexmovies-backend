import { Router } from 'express';
import {
  listMine,
  getMine,
  createMovie,
  updateMovie,
  submitMovie,
  deleteMovie,
} from '../controllers/manager.controller.js';
import { signUpload, completeUpload } from '../controllers/upload.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import {
  idParam,
  listQuery,
  managerMovieCreate,
  managerMovieUpdate,
  signUploadSchema,
  completeUploadSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate, requireRole('manager', 'admin'));

router.get('/movies', validate(listQuery, 'query'), listMine);
router.post('/movies', validate(managerMovieCreate), createMovie);
router.get('/movies/:id', validate(idParam, 'params'), getMine);
router.put('/movies/:id', validate(idParam, 'params'), validate(managerMovieUpdate), updateMovie);
router.patch('/movies/:id/submit', validate(idParam, 'params'), submitMovie);
router.delete('/movies/:id', validate(idParam, 'params'), deleteMovie);

// Own-movie uploads: 1) sign, 2) browser uploads straight to storage, 3) complete
router.post('/uploads/sign', validate(signUploadSchema), signUpload);
router.post('/uploads/complete', validate(completeUploadSchema), completeUpload);

export default router;
