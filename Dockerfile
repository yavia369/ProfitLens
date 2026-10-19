# syntax=docker/dockerfile:1.7
# One image, three roles (ARCHITECTURE §7, D-019): `web` (Next.js standalone server), `worker` (pg-boss jobs)
# and `migrate` (release step). `cli …` runs the operator CLI. No secrets are baked in: everything comes from the
# platform's environment at run time (see docs/DEPLOYMENT.md).

ARG NODE_IMAGE=node:22.22.0-bookworm-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Optional build secret `ca` (an extra CA bundle) for builds behind a TLS-intercepting proxy; unused otherwise.
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; corepack enable && corepack prepare pnpm@10.28.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/finance/package.json packages/finance/
COPY packages/google-ads/package.json packages/google-ads/
COPY packages/meta-ads/package.json packages/meta-ads/
COPY packages/payments/package.json packages/payments/
COPY packages/shopify/package.json packages/shopify/
RUN --mount=type=secret,id=ca,required=false --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 pnpm install --frozen-lockfile
COPY . .
ARG APP_VERSION=dev
RUN pnpm --filter @profitlens/web build && pnpm --filter @profitlens/worker bundle

FROM ${NODE_IMAGE} AS runtime
ARG APP_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    MIGRATIONS_DIR=/app/migrations APP_VERSION=${APP_VERSION} WORKER_BEAT_FILE=/tmp/profitlens-worker-beat
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./web
COPY --from=build --chown=node:node /app/apps/web/.next/static ./web/apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/worker/dist ./worker
COPY --from=build --chown=node:node /app/packages/db/migrations ./migrations
COPY --chown=node:node docker-entrypoint.sh ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD ["/app/docker-entrypoint.sh", "healthcheck"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["web"]
