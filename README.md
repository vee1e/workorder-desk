<div align="center">

### Work Order Desk

[![codecov](https://codecov.io/gh/vee1e/workorder-desk/branch/master/graph/badge.svg)](https://codecov.io/gh/vee1e/workorder-desk)

</div>

A web application for field service teams. A technician logs a job, tracks it, and closes it. A dispatcher sees every job on the team. The application is built with MongoDB, Express, React, and Node.js.

A work order is a job to do in the field. Each work order has a title, a description, a status, and a priority. The status is `pending`, `in_progress`, or `done`. The priority is `low`, `medium`, or `high`.

## Roles

- A technician is a user. A technician owns their work orders.
- A dispatcher is an admin. An admin manages users and sees every work order.
- A visitor can register, log in, and reset a password.

## Auth and security

- The app uses cookies for login. The cookies are httpOnly. JavaScript cannot read them.
- The app rotates refresh tokens. It detects reused tokens and revokes the token family.
- The app stores passwords with bcrypt at cost 12.
- The API uses a closed error catalog.
- Every request has a request ID.

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Language | TypeScript 5.x |
| API | Express 4.x |
| Database | MongoDB 7.x with Mongoose 8.x |
| Frontend | React 18 with Vite 5 and Tailwind CSS 3 |
| Server state | TanStack Query 5 |
| Validation | zod 3 |
| Tests | Vitest, Supertest, Testing Library |
| Containers | Docker and Compose |
| Tooling | ESLint 9, Prettier 3, npm workspaces |

## AI features

AI is opt-in and off by default: without `AI_ENABLED=true` (plus `AI_BASE_URL` and `AI_API_KEY`) the AI surfaces below are inert and the app behaves exactly as before.

- **Copilot** (M1): an assistant embedded in the SPA (open with `Cmd+K`). It answers questions about your own work orders and drafts or updates them on your behalf. Writes are staged: the app shows a server-rendered before/after diff and nothing changes until you approve (human-in-the-loop). Approvals expire after `AI_APPROVAL_TTL_MS`. Streams over SSE; all tool calls are validated server-side against a per-role allowlist.
- **Autonomous triage agent** (M2): a background worker watches newly created work orders and produces a summary + priority suggestion. In `suggest` mode it writes a `TriageSuggestion` (flagged items appear in the dispatcher's attention list); in `auto-apply` mode it can apply the suggested priority directly. It runs under a bounded policy (step caps, per-agent/global spend ledgers, working hours, kill switch).
- **Admin**: `/app/admin/agents` exposes the triage policy, run history, and a kill switch; everything is audited. Runs and costs are recorded (`AgentRun`, `AgentToolCall`, `AgentSpend`); `AI_API_KEY` never leaves the backend.

## Run with Docker

1. Copy the environment template. Run `cp .env.example .env`.
2. Start the stack. Run `docker compose up --build`.
3. Open http://localhost:5173.
4. Log in as `admin@example.com` with `Admin1234`.

You can also log in as `user@example.com` with `User1234`.

## Run without Docker

1. Copy the environment template. Run `cp .env.example .env`.
2. Install packages. Run `npm install`.
3. Create the seed users. Run `npm run seed`.
4. Add demo data. Run `npm run seed:demo`.
5. Start the app. Run `npm run dev`.

The backend runs on port 4000. The frontend runs on port 5173.

The seed command creates an admin user and a user. The demo command adds technicians and work orders. The demo data makes the app look lived in.

To try the Copilot after `npm run seed:demo`, the triage worker is a separate process: run `npm run worker` in a second terminal (or `docker compose up`, which runs it as a container). The worker needs no extra setup — it reads the same `.env` as the backend.

## Checks

Run these commands before you push a change.

```
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs these checks on every push. CI also runs coverage gates. `npm run worker` is a separate long-running process (the autonomous triage agent); it is not part of the checks. Start it locally with `npm run worker` (or `npm run worker:dev` for watch mode).

## Production notes

- The demo accounts are public and shown on the login page. Change the admin password before you use the app in public.
- Render's free tier sleeps after about 15 minutes without traffic. The first request then takes 30 to 60 seconds to start. Use a paid plan or a warm-up ping for production.
- Password reset emails use Resend. Set `RESEND_API_KEY` and verify a sender domain before real users sign up.
- Work-order search uses a case-insensitive regex. It is correct but does a full scan. It is fine at starter scale.
- The triage worker must be deployed alongside the API (both compose files ship a `worker` service). Run exactly one API instance: approvals are held in the in-process approval registry, so scaling the API horizontally would split pending approvals across processes.

## Project structure

- `backend`: the Express API. It uses a layered architecture.
- `backend/src/agent`: the agentic AI runtime (runtime loop, tool registry, OpenAI-compatible provider, injection policy).
- `backend/src/worker.ts`: the autonomous triage worker — a separate process (outbox poller + policy enforcement).
- `frontend`: the React application.
- `frontend/src/features/copilot`: the Copilot UI (dockable panel, SSE stream hook, approval modal).
- `frontend/src/features/admin`: the admin agent settings and run-history pages.
- `packages/shared`: the shared zod schemas and TypeScript types.
- `SPEC.md`: the technical specification.
- `AGENTIC-AI-SPEC.md`: the agentic AI conversion specification (copilot + autonomous triage).

## Environment variables

Copy `.env.example` to `.env`. The `.env` file is ignored by git. Never commit real secrets. Generate secrets with `openssl rand -hex 32`.

The app reads the `.env` file from the backend workspace or from the repo root. Docker Compose reads the root `.env` file.

The AI keys (`AI_ENABLED`, `AI_BASE_URL`, `AI_API_KEY`, model/budget/worker tunables) are all documented in `.env.example` under the "Agentic AI" section. AI is off by default; see [AI features](#ai-features).
