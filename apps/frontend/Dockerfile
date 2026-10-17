# Build stage — install deps, generate backend types, build Next.js
# next build runs on Node: under Bun it logs bogus CLIENT_HOOK_DYNAMIC errors (vercel/next.js#99755),
# and TypeScript 7 (run by next build) ships no musl binary, so the builder must be glibc.
FROM node:26-bookworm-slim AS build
COPY --from=oven/bun:1 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY bun.lock package.json tsconfig.json ./
COPY patches/ patches/

COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/docs/package.json apps/docs/package.json
COPY apps/demo-video/package.json apps/demo-video/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/crypto/package.json packages/crypto/package.json

RUN bun install --frozen-lockfile --ignore-scripts

COPY packages/shared/ packages/shared/
COPY packages/crypto/ packages/crypto/
COPY apps/backend/ apps/backend/
COPY apps/frontend/ apps/frontend/

# Generate the backend type declarations consumed by Eden Treaty (@depvault/backend)
WORKDIR /app/apps/backend
RUN bun db:generate
RUN bun build:types

WORKDIR /app/apps/frontend
# Persist the Turbopack build cache (on by default since Next 16.3) across image builds.
RUN --mount=type=cache,target=/app/apps/frontend/.next/cache bun run build

# Production — Next.js standalone output
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache curl

COPY --from=build /app/apps/frontend/.next/standalone ./
COPY --from=build /app/apps/frontend/.next/static apps/frontend/.next/static
COPY --from=build /app/apps/frontend/public apps/frontend/public

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4001 || exit 1

EXPOSE 4001

CMD ["node", "apps/frontend/server.js"]
