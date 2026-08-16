# Field Service Work Order Management — Technical Specification

**Version:** 1.2
**Status:** Implementation contract
**Last Updated:** 2026-08-16

Incorporates findings from two adversarial reviews and two design reviews of v1.0 Draft. v1.2 rebrands the generic item model as work orders for field service and maintenance teams.

## 1. Overview

### 1.1 Purpose

A production-oriented MERN (MongoDB, Express, React, Node.js) application purpose-built as a **work-order management system** for field service and maintenance teams. Technicians log jobs, track them through status and priority, and close them out; a dispatcher (admin) oversees every work order and the team. It keeps the production-grade baseline — layered architecture, cookie-based auth, typed data layer — and is not the smallest possible todo app.

### 1.2 Goals

- Working, deployable app out of the box (seeded admin + user).
- Domain-shaped work-order model: status/priority lifecycle instead of generic items.
- Layered backend and feature-sliced frontend.
- JWT in httpOnly cookies, refresh rotation with family reuse detection.
- Typed frontend data layer (wrapped `fetch` + TanStack Query).
- Unit + integration tests with coverage gates.
- Reproducible local + Docker setup.
- Structured logging, validation, and a closed error catalog.

### 1.3 Non-Goals (v1)

- Real-time (WebSockets).
- Multi-tenant / org isolation.
- Payments.
- File uploads / object storage (no stub interface).
- Internationalization (en-US only).
- Audit-log product UI (removed from admin persona).
- Work-order reassignment or scheduling: the creator owns a work order in v1 (dispatcher reassignment is a v2 concern).
- Multi-document Mongo transactions (standalone Mongo).
- CSRF tokens (same-origin deployment; see §8.5).

### 1.4 Personas

| Persona | Role | Primary needs |
|---|---|---|
| Dispatcher (admin) | Full access | Manage users and roles, oversee and search all work orders, view metrics |
| Technician (user) | Standard user | Log, update, and close own work orders; manage profile |
| Anonymous visitor | Unauthenticated | Register, login, request/complete password reset |

## 2. Key Decisions

| Decision | Options considered | Choice | Why |
|---|---|---|---|
| Auth transport | Bearer in memory vs httpOnly cookies | httpOnly cookies + SameSite=Lax | XSS cannot read tokens; see ADR-0001 |
| Deploy topology | Split origins vs reverse-proxy same origin | Same origin: Vite proxy (dev), nginx (prod/compose) | Lax cookies work; CSRF tokens out of scope |
| HTTP client | fetch vs axios | Wrapped `fetch` | No extra dep; tests mock `fetch` |
| Lockfile | npm vs yarn | `package-lock.json` only | npm workspaces default |
| Monorepo | workspaces vs turborepo | npm workspaces | Simpler for two packages + `packages/shared` |
| Schemas | duplicate vs shared package | `packages/shared` zod + types | Prevents envelope/DTO drift |
| Pagination | cursor everywhere vs mixed | Cursor on `/work-orders` and `/admin/work-orders`; offset on `/admin/users` | Users table is small; work orders follow NFR-2 |
| Admin all work orders | `scope=` vs dedicated route | No `scope`. `/work-orders` is owner-only. `/admin/work-orders` is global | Removes list IDOR |
| Refresh storage | embed on User vs collection | `RefreshSession` collection + `familyId` | Multi-device + reuse ⇒ revoke family |
| Refresh signing | opaque vs JWT | Opaque 32-byte, SHA-256 at rest | Drop `REFRESH_SECRET` |
| First admin | first-register vs seed | Idempotent `npm run seed` | Deterministic local/CI credentials |
| User disable | `isActive` vs `deletedAt` vs both | `isActive` only on User | One state machine |
| Work order delete | hard vs soft | Soft `deletedAt`; GET 404; lists exclude | Matches WO-7 |
| Mongo txns | replica set vs none | None in v1 | Compose Mongo is standalone |
| Perf SLO | p95 < 200 ms @ 1k conc. | Dropped from v1 DoD | bcrypt 12 cannot meet it; untestable |
| Register enumeration | hide vs 409 | `409 EMAIL_TAKEN` | Starter documents this leak |
| Lockout status | 423 vs 429 vs generic 401 | Generic `401 AUTH_GENERIC` | Avoids lockout oracle |
| HTTP access JWT role | trust JWT role vs DB | Load user every request; authorize from DB | Demotion/deactivation take effect immediately |

ADRs: `docs/adr/0001-jwt-httpOnly-cookies.md`, `docs/adr/0002-npm-workspaces.md`.

## 3. Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20 LTS |
| Language | TypeScript | 5.x |
| API | Express | 4.x |
| Database | MongoDB | 7.x |
| ODM | Mongoose | 8.x |
| Frontend | React | 18.x |
| Build | Vite | 5.x |
| Routing | React Router | 6.x |
| Server state | TanStack Query | 5.x |
| HTTP | wrapped `fetch` | — |
| CSS | Tailwind CSS | 3.x |
| Validation | zod (in `packages/shared`) | 3.x |
| Auth | JWT HS256 + httpOnly cookies | — |
| Passwords | bcrypt cost 12 | 5.x |
| Tests | Vitest + Supertest + Testing Library | 2.x / 7.x / 14.x |
| Logs | pino | 9.x |
| Containers | Docker + compose | 24.x / 2.x |
| Lint / format | ESLint 9 flat + Prettier 3 | |

Pin exact versions in the root `package-lock.json`. Do not commit `yarn.lock`.

## 4. Architecture

```
Browser (one origin)
  Vite :5173  ──proxy /api,/health,/ready──►  Express :4000  ──►  MongoDB :27017
  nginx :80   ──same paths──────────────────►  Express :4000  ──►  MongoDB
```

### 4.1 Backend dependency direction

`routes → middleware → controllers → services → repositories → models`

- Controllers map HTTP ↔ DTO. No business rules, no Mongoose.
- Services take an `Actor { id, role }` (never `req`/`res`).
- Repositories own queries. Default work-order reads add `deletedAt: null`.
- Models export schemas + TS types. Only repositories import `mongoose` at runtime.
- `import/no-cycle` is required. v1 does **not** use multi-document transactions.

### 4.2 Middleware order (`app.ts`)

1. `trust proxy` from `TRUST_PROXY_HOPS` (default 0)
2. request-id (`X-Request-Id`, generate UUIDv4 if missing/invalid)
3. pino-http (redact cookies/passwords/hashes)
4. helmet (API JSON CSP: `default-src 'none'`)
5. compression
6. cors (`origin` = `CORS_ORIGIN` list, `credentials: true`; reject `*` if credentials)
7. cookie-parser (`COOKIE_SECRET`)
8. json (`limit: 32kb`) — no `urlencoded` (blocks HTML-form CSRF)
9. hpp
10. recursive `$` / `__proto__` / `constructor` rejection on body + query
11. global rate limit
12. routes
13. 404 handler
14. error middleware

### 4.3 Frontend layering

`pages → features/{auth,workOrders,admin,profile} → components (primitives) → api/client → lib`

- Query hooks live in `features/*/queries.ts`, not in `api/`.
- React Router loaders are not used. TanStack Query owns server state.
- `ProtectedRoute` / `AdminRoute` are UX only; API is the authority.
- Bootstrap: `GET /users/me`; 401 → anonymous. 401 interceptor single-flights `POST /auth/refresh` then retries once.

## 5. Functional Requirements

### 5.1 Authentication & authorization

| ID | Requirement |
|---|---|
| AUTH-1 | Register `{ email, password, name }`. Email trim+lowercase. Name 1–80 chars. Password 8–72 chars, ≥1 letter, ≥1 number. Default `role=user`, `isActive=true`. Duplicate email → `409 EMAIL_TAKEN`. Success `201` + set session cookies (auto-login). |
| AUTH-2 | Login `{ email, password }`. Unknown email, bad password, inactive user → `401 AUTH_GENERIC` after dummy bcrypt. Success `200` + cookies, set `lastLoginAt`, reset `failedLoginCount`. |
| AUTH-3 | Access cookie `access_token`: JWT HS256, claims `sub`, `role`, `sid`, `iss`, `aud`, `iat`, `exp` (15m). httpOnly, SameSite=Lax, Secure iff `NODE_ENV=production`, `Path=/`, `Max-Age=900`. |
| AUTH-4 | Refresh cookie `refresh_token`: opaque 32 bytes, SHA-256 stored on `RefreshSession`, 7-day TTL, `Path=/api/v1/auth`, same flags as access, `Max-Age=604800`. Rotation keeps `familyId`. Reuse of a used/revoked token outside a 10s grace window revokes the **family** and returns `401 REFRESH_REUSE`. Multi-device = many families. |
| AUTH-5 | `authenticate` verifies JWT, loads user by `sub`, rejects missing/inactive, attaches `Actor` from **DB** (`id`, `role`). Invalid ObjectId params → `400 VALIDATION_ERROR`. |
| AUTH-6 | `POST /auth/logout` revokes the current session (`sid` or presented refresh). Clears both cookies (`Max-Age=0`). `POST /auth/logout-all` revokes every family for the user. |
| AUTH-7 | Forgot-password always `200` + generic message. Token: 32 random bytes, SHA-256 at rest, TTL 1h, replaces previous. MVP mailer logs a **redacted** URL (token replaced with `[redacted]`). Reset page `/reset-password?token=`. Successful reset revokes all families, clears reset fields, sets cookies. |
| AUTH-8 | Profile name via PROFILE-2. Password change via PROFILE-3 (same password rules). |
| AUTH-9 | Roles `admin` \| `user`. Only admin can change roles. Cannot target self. Cannot demote the last remaining admin (count admins, reject). Reload DB role (AUTH-5). Demotion revokes that user’s refresh families. |
| AUTH-10 | Owner/ids come from `Actor`, never from the body. Write schemas `.strict()`. |
| AUTH-11 | After **5** failed logins for an **existing** user within 15 minutes, set `lockedUntil = now+15m`. Unknown emails do not increment. Reset counter on success. Locked users still receive `401 AUTH_GENERIC`. IP limiter is separate (`429 RATE_LIMITED`). |

### 5.2 Work orders

A work order is a job logged by a technician and tracked from request to completion. The creator is the owner; dispatchers see everything via `/admin/work-orders`.

| ID | Requirement |
|---|---|
| WO-1 | Fields: `title` (job summary) 3–100, `description` optional ≤2000 (job details/notes), `priority` `low`\|`medium`\|`high` (default `medium`), `status` `pending`\|`in_progress`\|`done` (default `pending`), `owner`, `version` (starts at 1), `createdAt`, `updatedAt`, `deletedAt?`. |
| WO-2 | `GET /work-orders` returns **only** `owner = actor.id`. No `scope` param. |
| WO-3 | Cursor pagination: default `limit=20`, max `100`. Sort `createdAt desc, _id desc`. Cursor = HMAC-SHA256(payload, `COOKIE_SECRET`) + payload `{ createdAt, id }`. Tamper → `400`. Last page: `nextCursor: null`. |
| WO-4 | Filter `status` and `priority`. Search `title` regex-escaped, case-insensitive, max 64 chars. |
| WO-5 | Create → `201` full `WorkOrderPublic`. `version=1`. Owner = actor. |
| WO-6 | Update owner or admin. `version` **required**. Stale → `409 CONFLICT_VERSION`. Predicate `{ _id, version, deletedAt: null }` then `$inc.version`. |
| WO-7 | Soft delete owner or admin. `version` **required**. `204` empty body. Already deleted → `204` (idempotent). GET-by-id and lists hide `deletedAt != null`. No undelete. |
| WO-8 | Zod `.strict()` on writes before services. |
| WO-9 | See WO-6/7. Create `version=1`. Custom field, mongoose `versionKey: false`. |
| WO-10 | `GET /work-orders/:id` owner or admin; anyone else or deleted → `404`. Invalid id → `400`. |

### 5.3 Admin

| ID | Requirement |
|---|---|
| ADM-1 | `GET /admin/users` admin only. Offset page, default 1, limit 20 max 100. Search name+email, escaped, max 64. Filter `role`. |
| ADM-2 | `PATCH /admin/users/:id/role` `{ role }` strict enum. Not self. Not last admin. |
| ADM-3 | `GET /admin/work-orders` all non-deleted work orders, cursor pagination. |
| ADM-4 | `GET /health` public `{ status: "ok" }`, no internals, excluded from rate limit. `GET /ready` public, pings Mongo, `503` if down. `GET /admin/metrics` admin `{ users, workOrders, uptimeSeconds }`. |
| ADM-5 | `PATCH /admin/users/:id/status` `{ isActive }`. Not self. Deactivate revokes that user’s families. |

### 5.4 Profile

| ID | Requirement |
|---|---|
| PROFILE-1 | `GET /users/me` → `UserPublic`. |
| PROFILE-2 | `PATCH /users/me` `{ name }` only. |
| PROFILE-3 | `POST /users/me/password` `{ currentPassword, newPassword }`. Wrong current → `401 AUTH_GENERIC`. Success revokes other families, rotates current session, sets cookies. |

### 5.5 Frontend routes

| Route | Access | Notes |
|---|---|---|
| `/` | Public | Landing |
| `/login`, `/register` | Public | Redirect to `/app` if already authed |
| `/forgot-password` | Public | Request form |
| `/reset-password` | Public | Token from `?token=` |
| `/app` | Protected | Redirects to `/app/work-orders` |
| `/app/work-orders` | Protected | List + filter (status/priority) + search + cursor |
| `/app/work-orders/new` | Protected | Create |
| `/app/work-orders/:id` | Protected | Detail / edit / delete; 409 reload |
| `/app/profile` | Protected | Name + password |
| `/app/admin` | Admin | Users, role, status |
| `*` | — | 404 page |

UI gates are not authorization.

## 6. API Contract

**Public (unversioned):** `GET /health`, `GET /ready`

**App base:** `/api/v1`

Auth cookies: `access_token`, `refresh_token` (see AUTH-3/4).

### 6.1 Envelopes

```ts
type SuccessEnvelope<T> = { success: true; data: T };
type ErrorEnvelope = {
  success: false;
  error: { code: ErrorCode; message: string; details?: { field: string; message: string }[] };
  requestId: string;
};
type ErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'CONFLICT_VERSION' | 'RATE_LIMITED' | 'ACCOUNT_LOCKED'
  | 'AUTH_GENERIC' | 'EMAIL_TAKEN' | 'REFRESH_REUSE' | 'INTERNAL';
```

`204` has no body. Auth failures that must not distinguish cause use `AUTH_GENERIC` + 401. `ACCOUNT_LOCKED` is reserved but unused on the wire in v1 (lockout still enforced).

### 6.2 Status map

| HTTP | Code | When |
|---|---|---|
| 200/201 | — | Success envelope |
| 204 | — | Soft delete |
| 400 | VALIDATION_ERROR | Zod, bad ObjectId, bad cursor, search too long |
| 401 | UNAUTHORIZED | Missing/invalid/expired access token |
| 401 | AUTH_GENERIC | Login/password failures, inactive, locked |
| 401 | REFRESH_REUSE | Reused refresh family revoked |
| 403 | FORBIDDEN | Authenticated but not permitted (incl. last-admin, self-role) |
| 404 | NOT_FOUND | Missing or hidden work order/user |
| 409 | CONFLICT_VERSION | Stale work order `version` |
| 409 | EMAIL_TAKEN | Register duplicate |
| 429 | RATE_LIMITED | IP / route limiter |
| 500 | INTERNAL | Unexpected; no stack unless `DEBUG_ERRORS=true` |
| 503 | INTERNAL | `/ready` when Mongo down (body `{ status: "degraded" }`) |

### 6.3 DTOs

```ts
type UserPublic = { id: string; email: string; name: string; role: 'admin' | 'user'; createdAt: string; updatedAt: string };
type UserAdmin = UserPublic & { isActive: boolean; lastLoginAt: string | null };
type WorkOrderPublic = {
  id: string; title: string; description: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'done';
  owner: { id: string; name: string; email: string };
  version: number; createdAt: string; updatedAt: string;
};
type CursorPage<T> = { items: T[]; nextCursor: string | null };
type OffsetPage<T> = { items: T[]; page: number; limit: number; total: number };
```

Never return `passwordHash`, reset/session hashes, `failedLoginCount`, or `lockedUntil`.

### 6.4 Endpoints

```
POST /api/v1/auth/register          { email, password, name }          → 201 UserPublic
POST /api/v1/auth/login             { email, password }                → 200 UserPublic
POST /api/v1/auth/logout            (auth or refresh cookie)           → 204
POST /api/v1/auth/logout-all        (auth)                             → 204
POST /api/v1/auth/refresh           (refresh cookie)                   → 200 UserPublic
POST /api/v1/auth/forgot-password   { email }                          → 200 { ok: true }
POST /api/v1/auth/reset-password    { token, password }                → 200 UserPublic

GET  /api/v1/users/me                                                  → 200 UserPublic
PATCH /api/v1/users/me              { name }                           → 200 UserPublic
POST /api/v1/users/me/password      { currentPassword, newPassword }   → 200 UserPublic

GET  /api/v1/work-orders          ?cursor&limit&status&priority&search  → 200 CursorPage<WorkOrderPublic>
POST /api/v1/work-orders          { title, description?, priority?, status? } → 201 WorkOrderPublic
GET  /api/v1/work-orders/:id                                                  → 200 WorkOrderPublic
PATCH /api/v1/work-orders/:id     { title?, description?, priority?, status?, version }
DELETE /api/v1/work-orders/:id    { version }  (JSON body)                   → 204

GET  /api/v1/admin/users            ?page&limit&role&search            → 200 OffsetPage<UserAdmin>
PATCH /api/v1/admin/users/:id/role  { role }                           → 200 UserAdmin
PATCH /api/v1/admin/users/:id/status { isActive }                      → 200 UserAdmin
GET  /api/v1/admin/work-orders     ?cursor&limit&status&priority&search  → 200 CursorPage<WorkOrderPublic>
GET  /api/v1/admin/metrics                                             → 200 { users, workOrders, uptimeSeconds }

GET  /health   → 200 { status: "ok" }
GET  /ready    → 200 { status: "ok" } | 503 { status: "degraded" }
```

## 7. Data Model

### User

```
email            string   unique, lowercase, indexed
passwordHash     string
name             string
role             'admin' | 'user'
isActive         boolean
lastLoginAt      Date?
failedLoginCount number
lockedUntil      Date?
passwordReset    { tokenHash?: string, expiresAt?: Date }
createdAt        Date
updatedAt        Date
```

No `deletedAt` on User.

### WorkOrder

```
title, description?, priority, status, owner, version, createdAt, updatedAt, deletedAt?
```

### RefreshSession

```
userId, familyId, tokenHash, usedAt?, revokedAt?, expiresAt, createdAt, userAgent?, ip?
```

Indexes:

- User: unique `{ email: 1 }`, `{ role: 1 }`
- WorkOrder: `{ owner: 1, deletedAt: 1, createdAt: -1, _id: -1 }`, `{ owner: 1, status: 1, deletedAt: 1 }`, `{ owner: 1, priority: 1, deletedAt: 1 }`
- RefreshSession: unique `{ tokenHash: 1 }`, `{ familyId: 1 }`, `{ userId: 1 }`, TTL on `expiresAt`

## 8. Security

### 8.1 Passwords

bcrypt cost 12 via `bcrypt.compare`. Dummy hash for unknown emails. Cap length 72 in zod. Never log passwords or raw tokens.

### 8.2 Tokens

Access JWT: HS256, `iss=mern-starter`, `aud=mern-starter-api`, `JWT_SECRET` min 32 chars, reject placeholders (`secret`, `changeme`, `replace-me`). Rotation of `JWT_SECRET` invalidates access tokens; refresh sessions remain valid.

### 8.3 Cookies

| Name | Path | Max-Age | Flags |
|---|---|---|---|
| `access_token` | `/` | 900 | httpOnly, SameSite=Lax, Secure in prod, host-only |
| `refresh_token` | `/api/v1/auth` | 604800 | same |

`COOKIE_SECRET` signs cookie-parser cookies (integrity only). It is not authentication.

### 8.4 Rate limits

| Scope | Key | Window | Max | Env |
|---|---|---|---|---|
| Global (except /health /ready) | IP | 60s | 300 | `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` |
| `/auth/login` | IP | 15m | 10 | `RATE_LIMIT_LOGIN_MAX` |
| `/auth/forgot-password` | IP + email | 15m | 3 | `RATE_LIMIT_FORGOT_MAX` |
| `/auth/register` | IP | 15m | 10 | (login max) |

`trust proxy` hops from `TRUST_PROXY_HOPS`. In-process store (single instance).

### 8.5 CSRF / CORS / fetch

Same-origin only. CORS allowlist = `CORS_ORIGIN` (comma-separated), `credentials: true`. Frontend `credentials: 'include'`. CSRF tokens **out of scope**. Do not set cookie `Domain`. Do not enable `urlencoded`.

### 8.6 Injection

Recursive reject `$`/`__proto__`/`constructor` on body and query. Escape regex. HMAC cursors (never trust `owner` from cursor). Validate ObjectIds. Mongoose `sanitizeFilter` on user filters.

## 9. Project Structure

```
mern-starter-app/
├── package.json                 # workspaces: backend, frontend, packages/shared
├── package-lock.json
├── eslint.config.js
├── prettier.config.js
├── docker-compose.yml           # dev: mongo + api + vite
├── docker-compose.prod.yml      # mongo + api + nginx
├── nginx/nginx.conf
├── .github/workflows/ci.yml
├── .env.example
├── docs/SPEC.md
├── docs/GETTING_STARTED.md
├── docs/adr/
├── packages/shared/
├── backend/
│   ├── Dockerfile
│   ├── src/{config,models,repositories,services,controllers,routes,middleware,utils,schemas,app.ts,server.ts}
│   ├── src/scripts/seed.ts
│   └── tests/
└── frontend/
    ├── Dockerfile
    └── src/{api,components,features,hooks,lib,pages,main.tsx}
```

## 10. Environment

Validated at boot with zod; exit 1 on failure.

| Key | Required | Notes |
|---|---|---|
| `PORT` | no | default 4000 |
| `NODE_ENV` | no | development \| test \| production |
| `MONGODB_URI` | yes | |
| `JWT_SECRET` | yes | min 32, not a placeholder |
| `COOKIE_SECRET` | yes | min 32 |
| `CORS_ORIGIN` | yes | comma-separated origins |
| `APP_URL` | yes | public SPA origin (reset links) |
| `SMTP_URL` | no | unused in MVP mailer |
| `TRUST_PROXY_HOPS` | no | default 0 |
| `DEBUG_ERRORS` | no | default false |
| `LOG_LEVEL` | no | default info |
| `RATE_LIMIT_*` | no | see §8.4 |
| `SEED_ADMIN_EMAIL` | no | default admin@example.com |
| `SEED_ADMIN_PASSWORD` | no | default Admin1234 |
| `SEED_USER_EMAIL` | no | default user@example.com |
| `SEED_USER_PASSWORD` | no | default User1234 |
| `VITE_APP_URL` | frontend | same as APP_URL |
| `VITE_API_URL` | frontend | empty in dev (relative `/api/v1`); prod may set origin |

No `REFRESH_SECRET`. Never commit real secrets.

## 11. Testing

**CI Mongo:** GitHub Actions `services: mongo:7`. Local: `mongodb-memory-server` when `MONGODB_URI` unset.

**Mandatory backend integration**

- AUTH-1/2 register+login cookies; duplicate email 409; inactive 401
- AUTH-4/6 refresh rotation; reuse revokes family; logout
- AUTH-7 forgot always 200; reset; token single-use
- AUTH-9/ADM-2 self-demote 403; last admin 403
- AUTH-11 five failures then lock (still 401)
- WO-2 owner isolation; WO-10 404 for others
- WO-6/9 stale version 409; omitted version 400
- WO-7 soft delete 204 then GET 404
- WO-4 regex escaped
- Envelope shape 400/401/403/404/409/429
- Extra fields on POST /work-orders do not persist

**Frontend:** auth forms (zod), protected route redirect, 409 conflict UI. Coverage thresholds in vitest config (backend 80%, frontend 60% of included files). Excludes: `server.ts`, Docker, generated.

## 12. CI/CD

`.github/workflows/ci.yml` on Node 20:

1. lint
2. typecheck
3. test + coverage (fail on threshold)
4. build
5. docker build (PRs and main)

## 13. Definition of Done

- §5 IDs implemented and covered by the test matrix.
- Lint, typecheck, tests pass with configured thresholds.
- README + GETTING_STARTED document setup, env, seed credentials.
- `docker compose up --build` serves the SPA and API on one browser origin.
- Seed produces admin + user.
- `/health` 200; register → login → create a work order works.
- No secrets committed.

## 14. Open Questions (resolved)

1. Mailer → log-only, redacted token. Real SMTP later.
2. Users → `isActive` only; no user hard/soft delete.
3. npm workspaces + Vite/nginx same-origin proxy.
4. React Query + auth context (`useMe`). No zustand.
5. i18n deferred; en-US.

Remaining: none for v1.

## 15. Risks

| Risk | Sev | Mitigation |
|---|---|---|
| JWT secret leak | critical | min length, reject placeholders, 15m access TTL |
| Cookie CSRF on split origin | major | Same-origin only; no `urlencoded`; documented in ADR-0001 |
| Register email enumeration | minor | Accepted (`EMAIL_TAKEN`); forgot-password does not leak |
| Account lockout DoS | major | IP limiter first; lockout hidden behind AUTH_GENERIC |
| Refresh reuse vs parallel refresh | major | Client single-flight + 10s grace |
| NoSQL injection | major | Recursive key reject + zod + ObjectId + HMAC cursor |
| In-process rate limits | minor | Single-instance assumption |
| Last-admin race | major | Count admins in service before write; DB role on each request |
| bcrypt vs load SLO | minor | SLO removed from DoD |

## 16. Glossary

- **Cursor** — HMAC-protected token of `{ createdAt, id }`.
- **Family** — lineage of rotated refresh sessions; reuse revokes the lineage.
- **httpOnly cookie** — not readable from JS.
- **Soft delete** — `deletedAt` set; hidden from default reads.
- **Work order** — a job owned by a technician, tracked `pending → in_progress → done`.
- **Actor** — `{ id, role }` loaded from the database after JWT verify.

*End of specification. v1.1 is the implementation contract.*
