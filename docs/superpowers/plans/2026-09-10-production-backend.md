# Production Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace direct client-to-Supabase access with a secure Express API backed by Supabase-managed PostgreSQL.

**Architecture:** The React app makes credentialed `/api` requests only. Express validates every request, resolves the caller from an opaque HttpOnly session, enforces role/resource authorization, and uses parameterized `pg` queries against Supabase PostgreSQL. Private uploads are stored outside public web roots.

**Tech Stack:** Node 20+, Express, pg, argon2, Zod, express-rate-limit, helmet, cors, cookie-parser, multer, Vitest, Supertest.

**Spec:** `docs/superpowers/specs/2026-09-10-production-backend-design.md`

## Global Constraints

- Supabase is the managed PostgreSQL provider; the browser must never directly use Supabase or database credentials.
- Passwords use Argon2id; sessions are opaque tokens stored only in an HttpOnly secure cookie.
- All role/resource enforcement is backend-only; never trust browser role or team identifiers.
- Validate all input with Zod and calculate score totals only on the server.
- Never return internal error details, secrets, database errors, or storage paths to clients.
- Use a separate test database and run migrations before integration tests.

---

### Task 1: Create the server foundation and production configuration

**Files:**
- Create: `server/package.json`, `server/src/app.js`, `server/src/server.js`, `server/src/config.js`, `server/.env.example`, `server/.gitignore`
- Create: `server/test/app.test.js`

**Interfaces:**
- Produces `createApp({ pool, config })` for tests and `startServer()` for deployment.
- `config` exposes validated server-only environment values.

- [ ] **Step 1: Write the failing health endpoint test**

```js
import request from 'supertest';
import { createApp } from '../src/app.js';

test('GET /api/health returns a safe health payload', async () => {
  const response = await request(createApp({ pool: {}, config: testConfig }))
    .get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
});
```

- [ ] **Step 2: Run the test and verify it fails because `createApp` is missing**

Run: `cd server && npm test -- app.test.js`

- [ ] **Step 3: Implement minimal secure application setup**

Install `express`, `helmet`, `cors`, `cookie-parser`, `express-rate-limit`, `zod`, `pg`, `argon2`, `multer`; configure JSON body limit `100kb`, CORS from `FRONTEND_ORIGIN` with `credentials: true`, Helmet, `/api/health`, and a centralized generic error response.

- [ ] **Step 4: Add strict configuration validation**

```js
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url(),
  SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24),
  UPLOAD_DIR: z.string().min(1),
});
```

- [ ] **Step 5: Run tests and lint-style syntax checks**

Run: `cd server && npm test -- app.test.js && node --check src/app.js`

### Task 2: Create secure Supabase PostgreSQL migrations and seed command

**Files:**
- Create: `server/migrations/001_initial_schema.sql`, `server/src/db/pool.js`, `server/src/db/migrate.js`, `server/src/scripts/seed-organizer.js`
- Create: `server/test/migrations.test.js`

**Interfaces:**
- Produces `pool.query(text, values)` and a one-time initial organizer seeding command.
- Creates `users`, `teams`, `team_members`, `submissions`, `submission_files`, `judge_assignments`, `scores`, `sessions`, `announcements`, `problem_statements`, and `audit_logs`.

- [ ] **Step 1: Write a migration test that verifies score constraints and session tables exist**

```js
test('database rejects a technical score greater than 20', async () => {
  await expect(testPool.query(
    'INSERT INTO scores (judge_id, submission_id, technical_execution) VALUES ($1,$2,$3)',
    [judgeId, submissionId, 21],
  )).rejects.toThrow();
});
```

- [ ] **Step 2: Run the test against the isolated test database and verify it fails before migrations**

Run: `cd server && DATABASE_URL=$TEST_DATABASE_URL npm test -- migrations.test.js`

- [ ] **Step 3: Implement idempotent SQL migrations**

Use UUID primary keys, case-insensitive unique normalized email, `user_role` enum, foreign keys, check constraints for all eight score ranges, unique `(judge_id, submission_id)`, indexes on authorization lookup columns, and transaction-safe migration tracking. Store `sessions.token_hash`, never raw tokens.

- [ ] **Step 4: Implement organizer seeding with Argon2id**

`seed-organizer.js` reads `INITIAL_ORGANIZER_EMAIL` and `INITIAL_ORGANIZER_PASSWORD`, refuses absent/weak values, normalizes the email, uses `argon2.hash(password, { type: argon2.argon2id })`, and upserts only an organizer account.

- [ ] **Step 5: Run migration and seed tests**

Run: `cd server && npm run migrate:test && npm test -- migrations.test.js`

### Task 3: Implement authentication, CSRF, session expiry, and rate limits

**Files:**
- Create: `server/src/auth/passwords.js`, `server/src/auth/sessions.js`, `server/src/middleware/auth.js`, `server/src/middleware/csrf.js`, `server/src/routes/auth.js`
- Test: `server/test/auth.test.js`

**Interfaces:**
- `requireAuth(req,res,next)` assigns `{ id, role, teamId }` to `req.auth` from the server-side session.
- `requireRole(...roles)` rejects unauthorized roles with 403.
- `csrfProtection` validates `X-CSRF-Token` on state-changing requests.

- [ ] **Step 1: Write failing tests for login, logout, expired session, bad password, and rate limiting**

```js
test('expired session cannot fetch /api/auth/me', async () => {
  const response = await request(app).get('/api/auth/me').set('Cookie', expiredCookie);
  expect(response.status).toBe(401);
});
test('login is rate limited after repeated failures', async () => {
  for (let i = 0; i < 10; i += 1) await request(app).post('/api/auth/login').send(badLogin);
  expect((await request(app).post('/api/auth/login').send(badLogin)).status).toBe(429);
});
```

- [ ] **Step 2: Verify tests fail before route implementation**

Run: `cd server && npm test -- auth.test.js`

- [ ] **Step 3: Implement opaque sessions and safe login responses**

Generate 32-byte random tokens; persist SHA-256 hashes and expiry; set `HttpOnly`, `SameSite=Lax`, `path=/api`, and production `Secure` cookies. Verify Argon2id passwords, delete sessions on logout, return generic invalid-login errors, and log only audit metadata.

- [ ] **Step 4: Implement CSRF and auth middleware**

`GET /api/auth/csrf` returns a session-bound token. Mutations require matching `X-CSRF-Token`; login is covered by its own strict rate limiter. `GET /api/auth/me` returns only safe user fields.

- [ ] **Step 5: Run auth tests**

Run: `cd server && npm test -- auth.test.js`

### Task 4: Implement participant routes with team isolation and secure uploads

**Files:**
- Create: `server/src/validation/participant.js`, `server/src/routes/participant.js`, `server/src/services/participant.js`, `server/src/middleware/uploads.js`
- Test: `server/test/participant.test.js`

**Interfaces:**
- Participant routes derive `teamId` solely from `req.auth.teamId`.
- `submissionSchema` validates title, text lengths, and optional HTTPS GitHub/demo URLs.

- [ ] **Step 1: Write failing IDOR and validation tests**

```js
test('participant cannot retrieve another teams submission', async () => {
  const response = await participantA.get(`/api/participant/submissions/${teamBSubmissionId}`);
  expect(response.status).toBe(404);
});
test('participant update ignores a body teamId and updates only their team', async () => {
  const response = await participantA.put('/api/participant/me/submission')
    .send({ teamId: teamBId, title: 'Safe title', description: 'x'.repeat(20) });
  expect(response.status).toBe(200);
  expect(await teamBSubmission()).not.toMatchObject({ title: 'Safe title' });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd server && npm test -- participant.test.js`

- [ ] **Step 3: Implement `/me` participant routes**

Use `requireRole('PARTICIPANT')`; query only `req.auth.teamId`; enforce max three non-leader members; use transactions for team/member updates; return safe DTOs.

- [ ] **Step 4: Implement private upload handling**

Configure Multer memory storage with 20 MB file limit and five-file limit. Accept only zip, PDF, PowerPoint, PNG, JPEG after extension plus MIME checks; generate opaque UUID filenames under `UPLOAD_DIR`; reject executable/unrecognized content; add a protected download route.

- [ ] **Step 5: Run participant tests**

Run: `cd server && npm test -- participant.test.js`

### Task 5: Implement judge assignment and server-calculated scoring

**Files:**
- Create: `server/src/validation/scores.js`, `server/src/routes/judge.js`, `server/src/services/scores.js`
- Test: `server/test/judge.test.js`

**Interfaces:**
- `scoreSchema` accepts component scores only; it has no `finalScore` input.
- `calculateFinalScore(scores)` returns the integer sum of eight validated values.

- [ ] **Step 1: Write failing authorization and score tests**

```js
test('judge cannot score an unassigned team', async () => {
  expect((await judge.put(`/api/judge/assignments/${unassignedTeamId}/score`).send(validScore)).status).toBe(403);
});
test('server rejects an invalid component and ignores client total', async () => {
  const response = await assignedJudge.put(`/api/judge/assignments/${teamId}/score`)
    .send({ ...validScore, completeness: 21, finalScore: 100 });
  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd server && npm test -- judge.test.js`

- [ ] **Step 3: Implement assignment-gated scoring**

Require `JUDGE`, verify the team is assigned and submitted, parse all values using Zod ranges `20,20,15,15,10,10,5,5`, calculate server total, upsert only `(req.auth.id, submissionId)`, and audit create/update actions.

- [ ] **Step 4: Run judge tests**

Run: `cd server && npm test -- judge.test.js`

### Task 6: Implement organizer administration and audit logging

**Files:**
- Create: `server/src/validation/organizer.js`, `server/src/routes/organizer.js`, `server/src/services/audit.js`
- Test: `server/test/organizer.test.js`

**Interfaces:**
- `audit({ actorId, action, targetType, targetId, ip })` never accepts credentials or raw request bodies.
- All organizer routes require `ORGANIZER` server role.

- [ ] **Step 1: Write failing RBAC and audit tests**

```js
test.each(['participant', 'judge'])('%s receives 403 from organizer team creation', async (role) => {
  expect((await clients[role].post('/api/organizer/teams').send(teamPayload)).status).toBe(403);
});
test('creating a team creates an audit event without a password', async () => {
  await organizer.post('/api/organizer/teams').send(teamPayload);
  expect(await latestAudit()).toMatchObject({ action: 'TEAM_CREATED' });
  expect(JSON.stringify(await latestAudit())).not.toContain(teamPayload.password);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd server && npm test -- organizer.test.js`

- [ ] **Step 3: Implement organizer routes**

Implement validated management of teams, users, judge assignments, announcements, problem statements, submissions, and score views. Hash newly issued passwords with Argon2id, avoid password values in responses, and audit every privileged mutation.

- [ ] **Step 4: Run organizer tests**

Run: `cd server && npm test -- organizer.test.js`

### Task 7: Replace direct Supabase browser access with the API client

**Files:**
- Create: `client/src/lib/api.js`
- Modify: `client/src/context/AuthContext.jsx`, `client/src/lib/supabase.js`, `client/src/pages/ParticipantDashboard.jsx`, `client/src/pages/JudgeDashboard.jsx`, `client/src/pages/OrganizerDashboard.jsx`, `client/.env`, `client/.gitignore`
- Test: `client/src/lib/api.test.js`

**Interfaces:**
- `api.get(path)`, `api.post(path, body)`, `api.put(path, body)`, `api.del(path)` use `/api`, include credentials, and attach CSRF to mutations.
- `AuthContext` restores auth only through `api.get('/auth/me')`.

- [ ] **Step 1: Write failing API client tests**

```js
test('mutation sends credentials and CSRF header', async () => {
  await api.put('/participant/me/submission', { title: 'Demo', description: 'x'.repeat(20) });
  expect(fetch).toHaveBeenCalledWith('/api/participant/me/submission', expect.objectContaining({
    credentials: 'include', headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-value' }),
  }));
});
```

- [ ] **Step 2: Run tests and verify failure**

Run: `cd client && npm test -- api.test.js`

- [ ] **Step 3: Implement the API client and migrate dashboards**

Remove `@supabase/supabase-js` usage, direct `supabase.from` calls, hardcoded judge/organizer credentials, and browser session authority. Map each existing dashboard workflow to its role API endpoint while retaining component structure and UI copy. Remove frontend Supabase secrets and ensure Vite variables are public-only.

- [ ] **Step 4: Run client tests and production build**

Run: `cd client && npm test -- api.test.js && npm run build`

### Task 8: Add deployment controls, security regression suite, and documentation

**Files:**
- Create: `server/test/security-regression.test.js`, `server/README.md`, `server/Dockerfile`, `docker-compose.yml`, `.env.example`
- Modify: `README.md`, `.gitignore`

**Interfaces:**
- `npm run test:security` executes the production security scenarios against the test database.

- [ ] **Step 1: Write the security regression scenarios before final hardening**

```js
test('unauthenticated protected request returns 401', async () => expect((await request(app).get('/api/organizer/teams')).status).toBe(401));
test('tampered frontend role cannot grant organizer access', async () => expect((await participant.get('/api/organizer/teams')).status).toBe(403));
test('invalid upload is rejected', async () => expect((await participant.post('/api/participant/me/submission/files').attach('files', executableFixture)).status).toBe(400));
```

- [ ] **Step 2: Run the security suite and verify it fails until all routes exist**

Run: `cd server && npm run test:security`

- [ ] **Step 3: Add production configuration and documentation**

Document Supabase `DATABASE_URL` server configuration, migration/seed commands, private storage volume, HTTPS reverse proxy, CORS origin, backups, log retention, test database use, and required environment variables. Configure Docker to run as a non-root user and expose only the API port.

- [ ] **Step 4: Execute full verification**

Run: `cd server && npm test && npm run test:security && cd ../client && npm run build`

- [ ] **Step 5: Produce the security audit report**

Document critical/high/medium/low findings, changed files, controls, remaining risks, required production environment variables, deployment checklist, and actual test results. Do not claim absolute security.
