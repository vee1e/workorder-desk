# syntax=docker/dockerfile:1
# =============================================================================
# Work Order Management — frontend image
#
# Build context: MONOREPO ROOT (required for npm workspaces, same as backend).
#
# Targets (select with `--target`, used by docker-compose files):
#   dev  — full dependency tree + source, `vite dev` for hot reload (dev).
#   prod — nginx:1.27 serving the built SPA (default; nginx.conf is mounted
#          read-only by docker-compose.prod.yml, it is NOT baked in).
#   build — intermediate stage that compiles the SPA.
#
# The default target is `prod` (last stage).
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: base — install the full workspace dependency tree.
# -----------------------------------------------------------------------------
FROM node:20-alpine AS base

WORKDIR /app

# All three workspace manifests are required by `npm ci`.
COPY package.json package-lock.json tsconfig.base.json eslint.config.js prettier.config.js ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json

RUN npm ci

# -----------------------------------------------------------------------------
# Stage 2: build — build shared, then the Vite SPA.
# -----------------------------------------------------------------------------
FROM base AS build

# Vite bakes VITE_* env into the bundle at build time. Pass them as build args
# (see docker-compose.prod.yml) — empty defaults keep the same-origin layout
# (relative /api/v1).
ARG VITE_APP_URL=""
ARG VITE_API_URL=""
ENV VITE_APP_URL=$VITE_APP_URL \
    VITE_API_URL=$VITE_API_URL

COPY packages/shared/ ./packages/shared/
RUN npm run build -w @workorders/shared

COPY frontend/ ./frontend/
RUN npm run build -w frontend

# -----------------------------------------------------------------------------
# Stage 3: prod (DEFAULT) — nginx serving the static SPA.
# -----------------------------------------------------------------------------
FROM nginx:1.27-alpine AS prod

COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

# -----------------------------------------------------------------------------
# Stage 4: dev — full deps + source, Vite dev server with hot reload.
# -----------------------------------------------------------------------------
FROM base AS dev

ENV NODE_ENV=development
WORKDIR /app

# Initial shared `dist` (kept fresh by a tsc --watch process started from
# docker-compose, mirroring the backend dev flow).
COPY packages/shared/ ./packages/shared/
RUN npm run build -w @workorders/shared

COPY frontend/ ./frontend/
WORKDIR /app/frontend

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
