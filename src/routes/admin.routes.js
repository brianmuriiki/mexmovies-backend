import { Router } from 'express';
import * as admin from '../controllers/admin.controller.js';
import * as adminRewards from '../controllers/adminRewards.controller.js';
import { createGenre, deleteGenre } from '../controllers/genre.controller.js';
import { deleteUpload, storage } from '../controllers/upload.controller.js';
import { rebuildCatalog } from '../controllers/catalog.controller.js';
import * as polls from '../controllers/poll.controller.js';
import { adminGrant } from '../controllers/subscription.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { noStore } from '../middleware/cache.js';
import {
  idParam,
  movieIdParam,
  listQuery,
  userListQuery,
  logListQuery,
  transactionListQuery,
  adminMovieCreate,
  adminMovieUpdate,
  approveSchema,
  createPollSchema,
  grantSubscriptionSchema,
  rejectSchema,
  createManagerSchema,
  updateUserSchema,
  genreSchema,
  levelsUpdateSchema,
  redemptionItemCreate,
  redemptionItemUpdate,
  adjustPointsSchema,
} from '../validators/schemas.js';

const router = Router();
router.use(noStore, authenticate, requireRole('admin'));

// Movies
router.get('/movies', validate(listQuery, 'query'), admin.listMovies);
router.post('/movies', validate(adminMovieCreate), admin.createMovie);
router.get('/movies/:id', validate(idParam, 'params'), admin.getMovie);
router.put('/movies/:id', validate(idParam, 'params'), validate(adminMovieUpdate), admin.updateMovie);
router.patch('/movies/:id/approve', validate(idParam, 'params'), validate(approveSchema), admin.approveMovie);
router.patch('/movies/:id/reject', validate(idParam, 'params'), validate(rejectSchema), admin.rejectMovie);
router.patch('/movies/:id/unpublish', validate(idParam, 'params'), admin.unpublishMovie);
router.delete('/movies/:id', validate(idParam, 'params'), admin.deleteMovie);

// Uploads and storage
router.delete('/uploads/:movieId', validate(movieIdParam, 'params'), deleteUpload);
router.get('/storage', storage);

// Catalog snapshot
router.post('/catalog/rebuild', rebuildCatalog);

// Managers and viewers
router.get('/users', validate(userListQuery, 'query'), admin.listUsers);
router.post('/users', validate(createManagerSchema), admin.createManager);
router.patch('/users/:id', validate(idParam, 'params'), validate(updateUserSchema), admin.updateUser);

// Genres
router.post('/genres', validate(genreSchema), createGenre);
router.delete('/genres/:id', validate(idParam, 'params'), deleteGenre);

// Rewards and points
router.get('/rewards/stats', adminRewards.rewardStats);
router.patch('/rewards/levels', validate(levelsUpdateSchema), adminRewards.updateLevels);
router.post('/rewards/catalog', validate(redemptionItemCreate), adminRewards.createRedemptionItem);
router.patch('/rewards/catalog/:id', validate(idParam, 'params'), validate(redemptionItemUpdate), adminRewards.updateRedemptionItem);
router.post('/points/adjust', validate(adjustPointsSchema), adminRewards.adjustPoints);
router.get('/points/transactions', validate(transactionListQuery, 'query'), adminRewards.listTransactions);

// Gold voting polls
router.post('/polls', validate(createPollSchema), polls.createPoll);
router.get('/polls', polls.listAllPolls);
router.patch('/polls/:id/close', validate(idParam, 'params'), polls.closePoll);
router.delete('/polls/:id', validate(idParam, 'params'), polls.deletePoll);

// Subscriptions
router.post('/subscriptions', validate(grantSubscriptionSchema), adminGrant);

// Logs and stats
router.get('/logs', validate(logListQuery, 'query'), admin.listLogs);
router.get('/stats', admin.stats);

export default router;
