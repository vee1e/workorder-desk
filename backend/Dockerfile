# syntax=docker/dockerfile:1
# =============================================================================
# Work Order Management — backend image
#
# Build context: MONOREPO ROOT (this is required: npm workspaces resolve the
# whole graph from the root package.json + package-lock.json).
#
# Targets (select with `--target`, used by docker-compose files):
#   dev  — full dependency tree + source, `tsx watch` for hot reload (dev).
#   prod — production-only dependencies + compiled dist, `node dist/server.js`.
#   build — intermediate stage shared by dev/prod compilation.
#
# The default target is `prod` (last stage), so `docker build -f backend/Dockerfile .`
# builds the production image.
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: base — install the full workspace dependency tree (dev + prod).
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

WORKDIR /app

# Copy workspace manifests + lockfile first. `npm ci` requires EVERY workspace
# declared in the root package.json, so all three manifests are copied even
# though this service only builds backend + shared.
COPY package.json package-lock.json tsconfig.base.json eslint.config.js prettier.config.js ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: build — compile shared then backend, then strip devDependencies.
# -----------------------------------------------------------------------------
FROM base AS build

# Shared package (zod schemas + types) must be built first so the backend can
# import its `dist` output.
COPY packages/shared/ ./packages/shared/
RUN npm run build -w @workorders/shared

COPY backend/ ./backend/
RUN npm run build -w backend

# Reinstall with production-only dependencies so the runtime image ships no
# dev tooling (tsx, typescript, test runners, ...).
RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
# Stage 3: prod (DEFAULT) — minimal runtime image.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS prod

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist

WORKDIR /app/backend
EXPOSE 4000

# Run as a non-root user (node is predefined on node:*-alpine images).
RUN chown -R node:node /app
USER node

# Healthcheck hits the public health endpoint (no DB required, excluded from
# rate limiting per SPEC §4.2/ADM-4).
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]

# -----------------------------------------------------------------------------
# Stage 4: dev — full deps + source, `tsx watch` hot reload.
# -----------------------------------------------------------------------------
FROM base AS dev

ENV NODE_ENV=development
WORKDIR /app

# Initial shared `dist` (kept fresh in dev by a tsc --watch process started
# from docker-compose, so edits to packages/shared/src hot-apply).
COPY packages/shared/ ./packages/shared/
RUN npm run build -w @workorders/shared

COPY backend/ ./backend/
WORKDIR /app/backend

EXPOSE 4000

CMD ["npx", "tsx", "watch", "src/server.ts"]
