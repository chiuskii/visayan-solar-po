# syntax=docker/dockerfile:1
# One Dockerfile, two targets: "dev" (hot reload) and "prod" (optimized build).

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ---- all dependencies (dev + prod) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- development: source is bind-mounted by docker-compose.dev.yml ----
FROM base AS dev
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "node scripts/wait-for-db.mjs && node scripts/migrate.mjs && node scripts/seed.mjs && npm run dev"]

# ---- production build ----
FROM base AS build
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- production-only dependencies ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- production runtime ----
FROM base AS prod
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --chown=node:node public ./public
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node package.json next.config.mjs ./
USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/wait-for-db.mjs && node scripts/migrate.mjs && node scripts/seed.mjs && node_modules/.bin/next start -H 0.0.0.0 -p 3000"]
