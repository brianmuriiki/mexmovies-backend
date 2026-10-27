# mexMovies API (server)

Express + MongoDB backend for mexMovies. It covers every phase of the plan that belongs to the server: foundation, auth and roles, movie management with approval, uploads of your own movies to Cloudflare R2, the catalog snapshot, viewer accounts with email and a bot check, watch-time rewards and points, subscriptions (activated with points or by the admin), Platinum early access, Gold voting polls, tests, a load-test script, and deployment files.

## Run it

```bash
cd server
npm install
cp .env.example .env        # edit: MONGODB_URI, JWT_SECRET, ADMIN_*
npm run seed                # genres, reward levels, first admin
npm run dev                 # http://localhost:5000/api/health
npm test                    # runs the test suite (downloads an in-memory MongoDB the first time)
```

MongoDB: a free Atlas M0 connection string, or a local MongoDB. Node 18 or newer.
Deployment: see `../DEPLOY.md` (Atlas, R2, Render, Cloudflare Pages, cache rules).

## Folder structure

```
src/
  config/       env.js, db.js, levels.js (default reward levels)
  models/       User, Movie, Genre, Watchlist, ActivityLog, Reward, Level, PointsTransaction,
                RedemptionItem, Progress, Subscription, Poll, Vote
  middleware/   auth, requireRole, validate, cache, rateLimit, originGuard, errorHandler
  validators/   schemas.js (all Zod rules)
  controllers/  auth, account, movie (public), manager, admin, genre, watchlist, upload,
                catalog, rewards, progress, adminRewards, subscription, earlyAccess, poll
  routes/       one file per area
  services/     r2, catalogSnapshot, rewardsService, subscriptionService, visibility, email,
                emailTemplates, tokens, session, activityLogger, videoValidator, moviePresenter,
                movieService
  scripts/      seedGenres.js, seedLevels.js, seedAdmin.js
  app.js, server.js
tests/          auth, movies, uploads, rewards, subscriptions, early access, polls, turnstile
                (Jest + Supertest, in-memory MongoDB)
../loadtest/    k6 script and notes for testing the cached public routes
```

## Endpoints

Responses look like `{ "data": ... }`; lists add `page, limit, total, pages`. Errors look like `{ "error": "...", "details": [...] }`.

**Public (cached)**
- `GET /api/catalog` the whole published catalog in one file (the public site searches and filters it in the browser)
- `GET /api/movies?page=&limit=&genre=<slug>&q=&year=&sort=new|popular|title`, `GET /api/movies/featured`, `GET /api/movies/:slug`, `POST /api/movies/:id/view`
- `GET /api/genres`, `GET /api/rewards/levels`

**Auth and account**
- `POST /api/auth/register`, `login`, `logout`, `GET /api/auth/me`
- `POST /api/auth/verify-email`, `resend-verification`, `forgot-password`, `reset-password`
- `PATCH /api/account`, `PATCH /api/account/password`, `DELETE /api/account` (viewers only)

**Viewer features** (logged in)
- Watchlist: `GET /api/watchlist`, `POST` and `DELETE /api/watchlist/:movieId`
- Continue watching: `GET /api/progress`, `PUT /api/progress/:movieId`
- Rewards: `POST /api/watch/heartbeat`, `GET /api/rewards/me`, `GET /api/rewards/points`, `GET /api/rewards/catalog`, `POST /api/rewards/redeem` (off until launch)
- Subscription: `GET /api/subscription`
- Gold voting: `GET /api/polls`, `POST /api/polls/:id/vote` (Gold and Platinum only)
- Platinum early access: `GET /api/early-access`, `GET /api/early-access/:slug` (Platinum viewers and staff)

**Manager** (manager or admin)
- `GET/POST /api/manager/movies`, `GET/PUT/DELETE /api/manager/movies/:id`, `PATCH /api/manager/movies/:id/submit`
- Uploads: `POST /api/manager/uploads/sign`, `POST /api/manager/uploads/complete`

**Admin**
- Movies: `GET/POST /api/admin/movies`, `GET/PUT/DELETE /api/admin/movies/:id`, `PATCH .../approve | reject | unpublish`
- Uploads: `DELETE /api/admin/uploads/:movieId`, `GET /api/admin/storage`; catalog: `POST /api/admin/catalog/rebuild`
- Users: `GET/POST /api/admin/users` (POST creates a manager), `PATCH /api/admin/users/:id`
- Genres: `POST /api/admin/genres`, `DELETE /api/admin/genres/:id`
- Approve with early access: `PATCH /api/admin/movies/:id/approve` accepts `{ "earlyAccessDays": 0-30 }`
- Polls: `POST/GET /api/admin/polls`, `PATCH /api/admin/polls/:id/close`, `DELETE /api/admin/polls/:id`
- Subscriptions: `POST /api/admin/subscriptions` (grant days with a reason)
- Rewards: `GET /api/admin/rewards/stats`, `PATCH /api/admin/rewards/levels`, `POST` and `PATCH /api/admin/rewards/catalog`, `POST /api/admin/points/adjust`, `GET /api/admin/points/transactions`
- `GET /api/admin/logs`, `GET /api/admin/stats`

## How uploads work

1. The manager saves a draft with `videoSource: "r2"` (no link needed).
2. `POST /api/manager/uploads/sign` with `{ movieId, fileName, contentType: "video/mp4", sizeBytes }` checks the type, the size limit, and the free storage left, then returns a signed `uploadUrl` (valid 15 minutes).
3. The browser sends the file straight to that address with `PUT` and the same `Content-Type`. The API never carries the video.
4. `POST /api/manager/uploads/complete` with `{ movieId }` checks the file exists in storage and records its key and size.
5. The movie can now be submitted. Public responses build the video address from `R2_PUBLIC_BASE_URL` + the key; the key itself is never exposed.

Convert files first: `ffmpeg -i movie.mov -c:v libx264 -preset slow -crf 23 -vf scale=-2:720 -c:a aac -b:a 128k -movflags +faststart movie.mp4`

## How rewards work

- The watch page sends `POST /api/watch/heartbeat { movieId, sessionId, seconds, position }` about every 5 minutes, when the viewer pauses, and when they leave (`seconds` is the time watched since the last heartbeat, at most 330).
- The server credits at most the real time that passed since the last heartbeat, stops at the daily cap (6 hours by default), and lets only one session per account earn time.
- Credits wait in memory and are saved in bulk every minute (and on shutdown), so many watchers do not mean many database writes.
- Points: 1 per full minute credited, plus a bonus when a level is reached. Every change is recorded in `pointsTransactions`, so a balance always equals the sum of its history.
- Redeeming points is disabled until you set `REDEMPTION_ENABLED=true`. When enabled, spending uses one conditional update, so points cannot be spent twice.

## Subscriptions, early access, and voting

- **Subscriptions:** redeeming points (when `REDEMPTION_ENABLED=true`) activates a subscription for the item's `durationDays`; redeeming again extends it, and an expired one restarts today. If activation fails, the points are refunded. The admin can also grant days. `GET /api/subscription` tells the frontend whether a viewer is subscribed. **Paid checkout is not included:** it needs a payment provider that is not free. When you add one, call `grantSubscription({ source: 'payment' })` after a confirmed payment.
- **Early access:** when approving, the admin can set `earlyAccessDays`. Until that date the movie is hidden from the public routes and the catalog, and Platinum viewers (and staff) see it through `/api/early-access`. The catalog is rebuilt automatically when the date passes.
- **Voting:** the admin creates a poll with 2 to 10 options. Gold and Platinum viewers get one vote per poll and may change it until the poll closes. Results are visible to logged-in viewers.
- **Bot check:** set `TURNSTILE_SECRET` (free Cloudflare Turnstile) and sign-up and forgot-password require the widget's token as `turnstileToken`. Leave it empty in development.

## Rules built in

- Public sign-up always creates a `viewer`. Managers are created only by the admin; the admin only by the seed script.
- Managers edit only their own movies while `draft`, `pending`, or `rejected`, and delete only drafts. Clients can never set `status`, `featured`, or file fields.
- Only `published` movies appear on public routes. License type and proof are required and hidden from the public.
- Movies with an uploaded file cannot be submitted or published until the file is uploaded.
- Gold voting and Platinum early access are checked on the server against the viewer's saved level.
- YouTube and Archive links are checked against their real hosts; links must use https.
- Passwords: 8 to 72 characters, bcrypt-hashed. A password change or reset signs out older sessions. Login and reset answers never reveal whether an email exists.
- Email links and reset tokens are random, stored only as hashes, and expire (24 hours for verification, 1 hour for reset).
- Rate limits on login, sign-up, email, password reset, view counting, and heartbeats.
- In production the cookie is `Secure`, and state-changing requests must come from `CLIENT_ORIGIN`.
- Activity logs are deleted automatically after 90 days to save free database storage.

## Status

Every server feature in the plan is written. All files pass a syntax check, but the code and tests have **not been run** yet, because the environment they were written in had no database or internet. Expect a few small bugs on the first run.

To finish and verify it:
1. `npm install && npm test`, and fix or report any failures.
2. Follow `../DEPLOY.md` and tick its final checklist with your real Atlas, R2, email, and Render accounts.
3. Run the load test in `../loadtest/` against your deployment.

Deliberately left out:
- **Paid subscription checkout** (needs a payment provider, which is not free). The hook is described above.
- **The React client**, which is the next project.
