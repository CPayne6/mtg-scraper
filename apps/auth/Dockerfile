# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY apps/auth/package.json ./apps/auth/

RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

COPY --from=deps /app ./
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY apps/auth ./apps/auth
COPY tsconfig.json nx.json ./

RUN pnpm nx build auth

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/auth/package.json ./apps/auth/

RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/auth/dist ./apps/auth/dist

WORKDIR /app/apps/auth

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 auth && \
    chown -R auth:nodejs /app

USER auth

EXPOSE 5002

CMD ["node", "dist/main.js"]
