FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY apps/moxfield-importer/package.json ./apps/moxfield-importer/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY apps/moxfield-importer ./apps/moxfield-importer
COPY tsconfig.json nx.json ./
RUN pnpm --filter @scoutlgs/shared build && pnpm --filter @scoutlgs/core build && pnpm --filter moxfield-importer build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable && corepack prepare pnpm@10.26.2 --activate
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/apps/moxfield-importer/package.json ./apps/moxfield-importer/
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/apps/moxfield-importer/dist ./apps/moxfield-importer/dist
RUN chown -R node:node /app
USER node
WORKDIR /app/apps/moxfield-importer
ENV MOXFIELD_CHROMIUM_EXECUTABLE=/usr/bin/chromium
CMD ["node", "dist/main.js"]
