# Habit Tracker with Streaks

Track daily habits, see current and best streaks, and get real-time milestone notifications at 3, 7 and 30
days. Sign-in is SSO only (Google or GitHub). Every user sees only their own data.

| Layer | Tech |
|---|---|
| Frontend | Angular 22 (standalone components, signals, zoneless), plain SCSS, light theme |
| Backend | Node + Fastify 5 + TypeScript |
| Database | SQLite via Prisma |
| Realtime | WebSocket (`@fastify/websocket`) |
| Tests | Vitest (backend), Angular unit tests (frontend) |

## Run locally

Requires Node ≥ 22.13 and Yarn 4 (`corepack enable` picks the pinned version).

```bash
# 1. Backend
cd backend
cp .env.example .env          # then fill in OAuth credentials (see below)
yarn install
yarn db:migrate               # creates SQLite DB
yarn dev                      # http://localhost:3300

# 2. Frontend (second terminal)
cd frontend
yarn install
yarn start                    # http://localhost:4300 (proxies /api and /ws to :3300)
```

If `.env` is incomplete, `yarn dev` prints `Invalid or missing environment variables: …` and keeps watching
instead of exiting — fix `.env` and it restarts.

Open **http://localhost:4300**. Always use this origin — OAuth redirect URIs and cookie/origin checks are
bound to it.

Sign in locally with **Chrome or Firefox**. The OAuth cookies use the `__Host-` prefix, which requires
`Secure`; Chrome and Firefox treat `http://localhost` as secure, but Safari may reject these cookies over plain
HTTP, so sign-in fails there.

## Run tests

```bash
cd backend && yarn test
cd frontend && yarn test
```

Tests use a temporary SQLite DB, a fixed clock and stubbed OAuth providers. They make no network calls to
Google or GitHub and need no credentials.

## Environment variables (`backend/.env`)

| Var | Example | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` enables `Secure` cookies (requires HTTPS) |
| `PORT` | `3300` | Backend port |
| `APP_ORIGIN` | `http://localhost:4300` | Public origin; used for OAuth redirect URIs and Origin checks |
| `DATABASE_URL` | `file:./dev.db` | SQLite file |
| `SESSION_SECRET` | 32+ random chars | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | | Google OAuth client |
| `GOOGLE_CLIENT_SECRET` | | Google OAuth client |
| `GITHUB_CLIENT_ID` | | GitHub OAuth App |
| `GITHUB_CLIENT_SECRET` | | GitHub OAuth App |

`.env` is git-ignored. Never commit real credentials; `.env.example` contains placeholders only.

### Configure Google OAuth

1. Google Cloud Console → **APIs & Services → OAuth consent screen**: configure (External, testing mode is
   fine) and add yourself as a test user.
2. **Credentials → Create credentials → OAuth client ID** → type **Web application**.
3. Authorized JavaScript origin: `http://localhost:4300`
4. Authorized redirect URI: `http://localhost:4300/api/auth/google/callback`
5. Copy client ID/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

Scopes requested: `openid email profile`.

### Configure GitHub OAuth

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Homepage URL: `http://localhost:4300`
3. Authorization callback URL: `http://localhost:4300/api/auth/github/callback`
4. Generate a client secret; copy ID/secret into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

Scopes requested: `read:user user:email`. GitHub may not return an email; the account still works because
identity is `provider + provider_user_id`.

## Accounts

- On first successful SSO sign-in the backend creates a local user with `provider`, `provider_user_id`,
  `email` (if provided and verified), `display_name`, `avatar_url`.
- **No account linking:** signing in with Google and with GitHub creates two separate accounts, even for the
  same person.
- Sessions are server-side (httpOnly cookie, 30 days), so login persists across refresh. Logout deletes the
  session.
- At startup only a `401` from `/api/auth/me` counts as signed out. A network error or `5xx` shows a "Cannot
  reach the server" banner with Retry instead of redirecting to `/login`.

## Habits and check-ins

- Status: `ACTIVE`, `PAUSED`, `ARCHIVED`. Allowed: Active ↔ Paused, Active/Paused → Archived. Archived is
  read-only.
- Only Active habits accept check-ins (and undo).
- One check-in per habit per day, **today only** — no backfill, no future dates.
- **Delete policy:** a habit can be deleted only after it is archived. Deleting removes the habit **and its
  entire check-in history** (and milestone records). The UI asks for confirmation.

## Streaks and timezone

- **Today** is the current date in the **user's timezone**. The browser reports its IANA zone
  (e.g. `Europe/Kyiv`) on every app load; the server stores it on the user and computes "today" from it.
  The client never decides the check-in date.
- Check-in dates are stored as timezone-free `YYYY-MM-DD` strings; timestamps are stored in UTC.
- **Current streak:** consecutive days ending today — or ending yesterday if today is not checked in yet
  (today stays open until local midnight). Any gap resets it to 0.
- **Best streak:** longest consecutive run ever; never decreases when the current streak resets.
- **Total:** number of check-ins.
- Pausing does **not** preserve a streak — missed days while paused break it.
- Stats are computed from check-ins on every read, so undoing today's check-in recalculates immediately.
- Edge: changing timezone can shift "today" by ±1 day; already stored dates are not rewritten.

## API

All endpoints are under `/api`, JSON, and require a session unless noted.

| Method & path | Description |
|---|---|
| `GET /health` | Liveness (public) |
| `GET /auth/{google\|github}/start` | Start SSO (public) |
| `GET /auth/{google\|github}/callback` | OAuth callback (public) |
| `GET /auth/me` | Current user |
| `POST /auth/logout` | Log out |
| `PUT /me/timezone` | `{ "timezone": "Europe/Kyiv" }` |
| `GET /habits?q=&status=&today=` | List with stats. `status`: `ACTIVE\|PAUSED\|ARCHIVED`; `today`: `done\|not_done` (Active only) |
| `POST /habits` | Create `{ name, description?, startDate }` |
| `GET /habits/:id` | Habit + stats |
| `PATCH /habits/:id` | Edit fields and/or `status` |
| `DELETE /habits/:id` | Delete (archived only) |
| `GET /habits/:id/check-ins?month=YYYY-MM` | `{ month, today, dates }` for a month (default: current) |
| `POST /habits/:id/check-ins` | Check in today |
| `DELETE /habits/:id/check-ins/today` | Undo today's check-in |

Errors: `{ "error": { "code": "CHECKIN_EXISTS", "message": "…", "details": [] } }`. Another user's habit
returns `404` (existence is not revealed).

| Status | Codes |
|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_REQUEST` |
| 401 | `UNAUTHENTICATED` |
| 403 | `FORBIDDEN_ORIGIN` |
| 404 | `NOT_FOUND` |
| 409 | `HABIT_ARCHIVED`, `HABIT_NOT_ARCHIVED`, `HABIT_NOT_ACTIVE`, `CHECKIN_EXISTS` |
| 413 / 415 | `BAD_REQUEST` (body too large), `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `DATE_IN_FUTURE`, `BACKFILL_NOT_SUPPORTED`, `BEFORE_START_DATE`, `START_DATE_AFTER_CHECKINS` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL` |

## WebSocket

Endpoint: `ws://localhost:4300/ws`. Requires `Origin: http://localhost:4300`; otherwise the upgrade is rejected
with HTTP 403. An upgrade without a valid session cookie (missing, forged or expired) is accepted and immediately
closed with code `4401`, with no frames sent, so the client signs out instead of retrying.

Client → server:

```json
{ "type": "subscribe", "topics": ["milestones"] }
{ "type": "ack", "id": "<notificationId>" }
```

- `subscribe` — the server sends nothing until it receives this. It registers the socket for the user,
  evaluates milestones immediately, sends any pending `milestone` frames, then replies `subscribed`. A repeated
  `subscribe` on the same socket only gets `subscribed` back; it does not evaluate again.
- `ack` — marks a notification as read (`ackedAt`); sent when the user dismisses a milestone toast. Milestone
  toasts stay on screen until dismissed.

Server → client:

```json
{ "type": "subscribed", "topics": ["milestones"] }
{ "type": "milestone", "id": "…", "habitId": "…", "habitName": "Read", "milestone": 7, "currentStreak": 7, "sentAt": "2026-10-15T09:00:00.000Z" }
{ "type": "acked", "id": "…" }
{ "type": "error", "code": "INVALID_MESSAGE", "message": "…" }
```

`error` codes: `INVALID_MESSAGE`, `NOT_FOUND` (unknown or foreign notification id), `RATE_LIMITED`, `INTERNAL`.

Inbound frames are rate-limited per socket: a burst of 20, refilling at 5 frames per second. Each frame over
the limit is answered with `RATE_LIMITED` and otherwise ignored; 10 limited frames in a row close the socket
with code `1008` (policy violation). Frames are capped at 4 KB; a larger frame closes the socket with `1009`.

Milestone rules:

- Milestones: **3, 7, 30** days of current streak.
- Evaluated when a socket subscribes and after every check-in while that user has a subscribed socket
  (a check-in with no app open does not consume the milestone — it is delivered on the next connect).
- Sent **once per habit per milestone, ever** — recorded in `MilestoneNotification` (unique per habit +
  milestone) before sending. Reconnecting never resends; rebuilding a broken streak does not resend. If the
  last subscribed socket closes during evaluation, the undelivered record is removed so the next connect delivers it;
  if another socket subscribed meanwhile, evaluation runs once more so that socket gets it now.
- No milestone reached → nothing is sent.
- Logout closes that session's sockets, and a socket whose session has expired is closed instead of receiving
  milestones or acks; both use close code `4401`.

Client behavior (`frontend/src/app/core/milestone-socket.ts`):

- On close code `4401` the client clears the signed-in user, navigates to `/login` and does not reconnect.
- On any other close (including `1008` after rate limiting) it reconnects with exponential backoff (1 s doubling
  to a 30 s cap), each delay randomized to 50–100% of its step; the backoff resets once the server replies
  `subscribed`.
- Acks are sent at most 4 per second (dismissed while offline, they are queued and flushed after `subscribed`
  at the same pace), which stays under the 5 frames/s refill however many toasts are dismissed at once.
- Malformed frames and `error` frames are ignored; milestone frames are shape-checked before a toast is shown.
- Signing out or switching user drops the previous user's milestone toasts and queued acks.

## Security notes

- OAuth authorization-code flow with `state` and PKCE; provider tokens are not stored.
- Session token stored only as a SHA-256 hash; cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- A successful sign-in revokes the browser's previous session (and closes its sockets), whichever user it belonged to.
- Mutating requests and WS upgrades require `Origin == APP_ORIGIN` (CSRF / cross-site WebSocket protection).
- Every habit/check-in query is scoped to the session user.
- zod validation on all inputs, 16 KB body limit, `helmet` headers, rate limiting on SSO and logout routes.
- Local run is plain HTTP; production must use HTTPS with `NODE_ENV=production`.

## Demo data

The API has no backfill. To demo milestones locally:

```bash
cd backend && yarn seed:demo --user-id <your user id>
```

Run it without `--user-id` (or with an unknown id) to print the known users' ids, providers and creation times.

Creates four habits for that user: three with 2, 6 and 29 check-ins ending yesterday, so checking in today
reaches the 3-, 7- and 30-day milestones live; and one with 7 check-ins ending yesterday, already at a 7-day
streak, so its 3- and 7-day milestones arrive as soon as the app connects. Refuses to run with
`NODE_ENV=production`.

The seed is deliberately **not idempotent**: every run adds another four habits with the same names and no
milestone history, so you can replay the milestone demo without resetting the database. Archive and delete the
old demo habits in the app if the list gets crowded.

## Containerization

Skipped by choice to keep the MVP scope tight — not blocked on this machine.
