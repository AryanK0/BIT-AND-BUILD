# Production Backend Design

## Purpose and scope

Replace direct browser-to-Supabase access with a Node/Express API and Supabase-managed PostgreSQL persistence layer. Preserve the existing React routes, dashboard workflows, and visual UI while moving authentication, authorization, validation, score calculation, uploads, and audit logging to the server.

This scope covers participants, judges, organizers, teams, team members, submissions, announcements, scoring, secure file uploads, and the minimum operational configuration needed for production deployment.

## Architecture

```text
React/Vite client -- HTTPS, same-site secure cookie --> Express API -- parameterized queries --> Supabase PostgreSQL
                                                     |
                                                     +--> non-public upload storage
```

The client has no database SDK, database credentials, privileged secrets, or role assertion authority. It calls `/api` with `credentials: 'include'`. The API identifies the requesting user from the server-verified session, then authorizes every protected operation before querying or modifying data. Supabase provides the managed PostgreSQL database and backups; it is never called directly from the browser.

The server consists of route modules, Zod request schemas, authentication/role middleware, service modules, a PostgreSQL data-access layer, and centralized safe error handling. Database access uses a server-only `DATABASE_URL` and parameterized queries through `pg`.

## Authentication and sessions

- User records store an Argon2id password hash only; plaintext passwords are never persisted or logged.
- The initial organizer is bootstrapped by a server-only seed command using `INITIAL_ORGANIZER_EMAIL` and `INITIAL_ORGANIZER_PASSWORD`.
- Organizers create judge and participant accounts; participants are associated with one team at creation.
- Login accepts email and password, has per-IP and per-account rate limits, and returns a generic invalid-credentials response.
- On successful login, the API creates an opaque random session token, stores only its SHA-256 hash in `sessions`, and sends the raw token in an HttpOnly cookie. The cookie is `Secure` in production, `SameSite=Lax`, scoped to `/api`, and has a configured lifetime.
- Sessions have absolute expiration and are deleted on logout. A user may have a bounded number of active sessions; expired sessions are rejected.
- State-changing cookie-authenticated requests must provide a CSRF token returned by `GET /api/auth/csrf`; the server compares it to the session-bound stored value. Login is exempt but rate limited.

## Authorization model

Roles are stored in PostgreSQL as `PARTICIPANT`, `JUDGE`, or `ORGANIZER`. `requireAuth` reads the session; `requireRole(...roles)` checks the server-side role. No role, user ID, or team ID supplied by the browser is trusted for authorization.

- Participants derive their team from `users.team_id`; all participant routes use `/me` and never accept an arbitrary target team ID for private data.
- Judges may view and score only teams assigned in `judge_assignments`. The organizer may assign judges; an assignment is required before a judge can fetch a submission or create/update its score.
- Organizers manage users, teams, assignments, announcements, problem statements, submissions, and scores.
- Every unauthorized protected request returns a safe `401` or `403`; nonexistent and inaccessible resources are not differentiated where that would reveal data.

## Data model

PostgreSQL migrations create the following tables:

- `users`: UUID, email (unique, normalized), display name, role enum, password hash, optional participant `team_id`, enabled status, timestamps.
- `teams`: UUID, name, leader user ID, college, selected problem statement, timestamps.
- `team_members`: UUID, team ID, name, email, role, timestamps.
- `submissions`: one current submission per team with title, description, tech stack, GitHub/demo URLs, status, timestamps.
- `submission_files`: UUID, submission ID, opaque storage key, original safe display name, validated MIME type, byte size, checksum, timestamps.
- `judge_assignments`: unique judge/team pairs.
- `scores`: unique judge/submission pair, eight validated component scores, backend-calculated `final_score`, comments, submitted/updated timestamps.
- `announcements`: organizer author ID, title, plain-text content, priority, timestamps.
- `problem_statements`: organizer-managed participant-visible challenges.
- `sessions`: hashed token, user ID, expiry, CSRF secret, timestamps.
- `audit_logs`: actor ID where available, action, target type/ID, timestamp, IP metadata; it never stores passwords, session values, or request bodies containing secrets.

Foreign keys, uniqueness constraints, check constraints, indexes, and transactions protect integrity. The database login used by the server receives only schema-level rights needed by the API.

## API contract

Public/auth routes:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/csrf`

Participant routes:

- `GET /api/participant/me/team`
- `PATCH /api/participant/me/team`
- `POST /api/participant/me/members`
- `DELETE /api/participant/me/members/:memberId`
- `GET /api/participant/me/submission`
- `PUT /api/participant/me/submission`
- `POST /api/participant/me/submission/files`
- `GET /api/participant/announcements`
- `GET /api/participant/problem-statements`

Judge routes:

- `GET /api/judge/assignments`
- `GET /api/judge/assignments/:teamId/submission`
- `PUT /api/judge/assignments/:teamId/score`

Organizer routes:

- `GET|POST /api/organizer/teams`
- `PATCH /api/organizer/teams/:teamId`
- `POST|DELETE /api/organizer/teams/:teamId/members`
- `GET|POST|PATCH /api/organizer/users`
- `GET|POST|DELETE /api/organizer/assignments`
- `GET /api/organizer/submissions`
- `GET /api/organizer/scores`
- `GET|POST|PATCH|DELETE /api/organizer/announcements`
- `GET|POST|PATCH|DELETE /api/organizer/problem-statements`

Every request body, route parameter, query parameter, and multipart field is validated by Zod before service execution. Responses omit password hashes, session values, internal file paths, database errors, and other sensitive fields.

## Scoring

The backend accepts only the following component values and validates each independently:

| Criterion | Range |
| --- | --- |
| Completeness | 0–20 |
| Technical execution | 0–20 |
| Innovation & creativity | 0–15 |
| Applicability & scalability | 0–15 |
| UI/UX | 0–10 |
| Bonus features | 0–10 |
| Presentation | 0–5 |
| Work distribution | 0–5 |

The server calculates `final_score` as the sum (0–100); it ignores a client-provided total. A judge can only create or update their own score for an assigned submitted team. Organizer score management is explicitly audited.

## Upload handling

Multer accepts multipart uploads into a non-public storage directory (or an S3-compatible private bucket in deployment). The server enforces a 20 MB per-file limit, a small bounded file count, extension allowlist (`.zip`, `.pdf`, `.ppt`, `.pptx`, `.png`, `.jpg`, `.jpeg`), MIME allowlist, filename sanitization, generated opaque storage keys, and checksum calculation. Executable files are rejected and uploads are never served from a web-executable public directory. Downloads are authorized through a protected API route.

## HTTP, error, and operational security

- Helmet sets security headers, with a tested CSP appropriate for the Vite frontend.
- CORS accepts only `FRONTEND_ORIGIN` and enables credentials; production never uses `*`.
- Express body limits, JSON parser limits, and rate limits cover global and authentication paths.
- The app trusts a configured reverse proxy only in production, supports HTTPS termination, and sets HSTS only over production HTTPS.
- A centralized error handler logs internal details server-side and sends stable generic client errors. It never returns stack traces, database details, filesystem paths, secrets, or tokens.
- Production disables debug logging. Structured audit events cover login success/failure, logout, user/team creation, submission mutations, score mutations, assignments, and organizer administrative changes.

## Frontend migration

Replace `src/lib/supabase.js` with an API client that uses `fetch`, includes credentials, reads the CSRF token for mutations, and surfaces safe API errors. Replace hardcoded special credentials and `sessionStorage` authentication with `GET /api/auth/me` session restoration. Existing role route guards remain only as UX behavior; API authorization is the security boundary. Dashboard workflows map to their role-specific API endpoints without UI redesign.

## Required server environment variables

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
FRONTEND_ORIGIN=https://portal.example.edu
SESSION_COOKIE_NAME=bb_session
SESSION_TTL_HOURS=8
INITIAL_ORGANIZER_EMAIL=...
INITIAL_ORGANIZER_PASSWORD=...
UPLOAD_DIR=/private/uploads
```

`DATABASE_URL`, initial organizer credentials, and any storage credentials are server-only. The frontend has no secret environment variables. `.env` files are ignored; `.env.example` documents keys without values.

## Verification plan

Automated integration tests use an isolated test database and cover login, expiry, logout, rate limiting, CSRF, role enforcement, participant cross-team access, score range checks and server calculation, assignment checks, upload rejection, safe errors, and audit events. The frontend production build and server test suite run in CI. A deployment checklist verifies HTTPS, CORS origin, cookie flags, database migrations/backups, monitoring, non-public upload storage, and the removal of legacy direct-Supabase client access.
