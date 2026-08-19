# Getting Started

This guide takes you from a fresh checkout to a running Work Order Desk with the
AI features (Copilot + autonomous triage agent). Everything AI is **opt-in** —
skip the "Enable AI" step to run the plain app.

## Prerequisites

- Node.js 20 LTS and npm (workspaces).
- MongoDB 7 running locally, or Docker with Compose (for the compose path).
- (Optional, for AI) access to an OpenAI-compatible chat/completions endpoint
  with an API key.

## 1. Configure environment

Copy the template and fill in secrets:

```sh
cp .env.example .env
```

At minimum set `JWT_SECRET` and `COOKIE_SECRET` (each ≥ 32 chars):

```sh
openssl rand -hex 32
```

## 2. Install and build

```sh
npm install
```

The `packages/shared` dist is built automatically by the run scripts.

## 3. Seed data

```sh
npm run seed        # admin@example.com / Admin1234, user@example.com / User1234
npm run seed:demo   # demo technicians and work orders
```

## 4. Run the app

```sh
npm run dev
```

- Backend: http://localhost:4000 (`/health`, `/api/v1`)
- Frontend: http://localhost:5173

Log in as `admin@example.com` with `Admin1234` (or `user@example.com` /
`User1234`).

## 5. Enable AI (optional)

Add to `.env`:

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
```

`AI_BASE_URL` must be **https** and not a private/loopback host. `AI_API_KEY` is
a server-side secret — never commit it. Leave `AI_ENABLED=false` (the default)
to run without AI.

## 6. Run the triage worker

The worker is a separate process:

```sh
npm run worker        # production-style run
npm run worker:dev    # watch mode (hot reload)
```

It reads the same `.env` and needs no extra configuration. With AI enabled it
watches new work orders and produces triage suggestions; with AI disabled it
starts but takes no action.

## 7. Try the AI features

1. Open http://localhost:5173/app.
2. Press `Cmd+K` (or click the Copilot button) to open the Copilot drawer.
3. Ask a question about your work orders, or ask it to draft/update one — writes
   appear as an approval modal with a before/after diff. Approve to execute,
   dismiss to leave it pending (it expires after `AI_APPROVAL_TTL_MS`).
4. As an admin, open `/app/admin/agents` to view/edit the triage policy, see run
   history, and use the kill switch.

## Docker variant

With Compose, step 2–4 collapse into:

```sh
cp .env.example .env
docker compose up --build
```

The `worker` service runs automatically alongside Mongo, the API, and Vite. For
AI, set `AI_ENABLED`, `AI_BASE_URL`, and `AI_API_KEY` in your host `.env`, or
uncomment them in the worker service's environment block.

Production is the same shape:

```sh
docker compose -f docker-compose.prod.yml up --build -d
```

## Troubleshooting

- `AI_ENABLED=true` but the app won't boot: check `AI_BASE_URL` (https, public
  host) and that `AI_API_KEY` is set.
- Copilot is unresponsive: confirm the worker is running and `AI_ENABLED=true`,
  then check the backend logs for `AI_UNAVAILABLE` (provider unreachable).
- Approvals vanish: they expire after `AI_APPROVAL_TTL_MS` (default 10 minutes);
  re-ask the Copilot to re-stage the change.