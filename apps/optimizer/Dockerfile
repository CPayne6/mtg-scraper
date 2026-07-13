FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/core/package.json ./packages/core/
COPY apps/optimizer/package.json ./apps/optimizer/
RUN pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY packages/core ./packages/core
COPY apps/optimizer ./apps/optimizer
COPY tsconfig.json nx.json ./
RUN pnpm nx build optimizer
FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
COPY --from=build /app ./
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
WORKDIR /app/apps/optimizer
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
