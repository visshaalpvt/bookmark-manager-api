# Multi-stage Dockerfile for Bookmark Manager GraphQL API
FROM oven/bun:1.1-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS dependencies
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile
RUN bunx prisma generate

# Build stage
FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production runtime
FROM base AS release
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/prisma ./prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/schema ./src/schema
COPY package.json ./

EXPOSE 4000
ENV NODE_ENV=production

CMD ["bun", "dist/index.js"]
