# Stage 1: Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Copy workspace configuration
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/ui/package.json ./apps/ui/

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
COPY apps/ui ./apps/ui
COPY tsconfig.json ./

# Build shared package first
WORKDIR /app/packages/shared
RUN pnpm build

# Build UI
WORKDIR /app/apps/ui
RUN pnpm build

# Stage 3: Runner (Nginx)
FROM nginx:alpine AS runner

# Copy custom nginx config (full config, not just server block)
COPY apps/ui/nginx.conf /etc/nginx/nginx.conf

# Copy built static files
COPY --from=builder /app/apps/ui/dist /usr/share/nginx/html

# Create non-root user and set permissions for nginx
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 react && \
    chown -R react:nodejs /usr/share/nginx/html && \
    chown -R react:nodejs /var/cache/nginx && \
    chown -R react:nodejs /var/log/nginx && \
    chown -R react:nodejs /etc/nginx/conf.d

USER react

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
