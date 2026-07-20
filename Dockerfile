# syntax=docker/dockerfile:1
#
# Headout AI Storefront — single service.
# One Express server serves the JSON API at /api AND the built Vite SPA
# (single origin, so the frontend's root-relative /api calls just work).
#
# Base MUST be glibc/Debian (not Alpine/musl): the pnpm workspace `overrides`
# keep only the linux-x64-gnu native binaries (esbuild/rollup/tailwind-oxide),
# which matches Railway's amd64 glibc runtime.

FROM node:24-bookworm-slim

# Native runtime libs: libgomp1 for onnxruntime-node (local embeddings),
# ca-certificates for HTTPS (Anthropic API + one-time HF model download).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# Pin pnpm 10 — the lockfile is v9 and pnpm 11 gates build scripts more strictly.
RUN npm install -g pnpm@10.15.1

WORKDIR /app

# Build-time env required and validated by the Vite build (vite.config.ts).
# NODE_ENV=production also makes Vite skip the Replit-only dev plugins.
# VITE_ORY_SDK_URL is baked into the SPA at build time (Guardian/Ory SSO).
ARG VITE_ORY_SDK_URL=https://auth.headout.com
ENV NODE_ENV=production \
    PORT=8080 \
    BASE_PATH=/ \
    VITE_ORY_SDK_URL=$VITE_ORY_SDK_URL

# Copy the whole monorepo (node_modules excluded via .dockerignore) and install
# every dependency — the build steps need dev deps (vite, esbuild, drizzle-kit).
COPY . .
RUN pnpm install --frozen-lockfile --prod=false

# Build the frontend (static → artifacts/storefront/dist/public) and the API
# server (esbuild bundle → artifacts/api-server/dist/index.mjs).
RUN pnpm --filter @workspace/storefront run build \
 && pnpm --filter @workspace/api-server run build

EXPOSE 8080

# The API server serves the SPA it finds at artifacts/storefront/dist/public.
CMD ["node", "artifacts/api-server/dist/index.mjs"]
