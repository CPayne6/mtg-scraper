# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY apps/scheduler/package.json ./apps/scheduler/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Copy all files from deps stage (includes node_modules with correct structure)
COPY --from=deps /app ./

# Copy source code (overwrites placeholder package.json files with full source)
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY apps/scheduler ./apps/scheduler
COPY tsconfig.json ./

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build Scheduler
WORKDIR /app/apps/scheduler
RUN pnpm build

# Stage 3: Runner
FROM node:20-alpine AS runner
ARG BUILDTIME=default
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Copy package files for production install
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/scheduler/package.json ./apps/scheduler/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/scheduler/dist ./apps/scheduler/dist

# Set working directory to Scheduler app
WORKDIR /app/apps/scheduler

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 scheduler && \
    chown -R scheduler:nodejs /app

USER scheduler

# No port exposure needed (scheduler doesn't listen on any port)

# Health check (checks if process is running)
HEALTHCHECK --interval=60s --timeout=3s --start-period=30s --retries=3 \
  CMD pgrep -f "node dist/main.js" || exit 1

# Start the application
CMD ["node", "dist/main.js"]
