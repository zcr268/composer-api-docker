FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

# Install Cursor agent CLI
RUN curl https://cursor.com/install -fsS | bash

# Clone upstream source at build time
ARG UPSTREAM_REPO=anyrobert/cursor-api-proxy
ARG UPSTREAM_REF=main
RUN git clone --depth 1 --branch ${UPSTREAM_REF} \
    https://github.com/${UPSTREAM_REPO}.git /app-src

WORKDIR /app-src
RUN npm ci && npm run build && npm prune --omit=dev

# ── Runtime ──
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    curl https://cursor.com/install -fsS | bash

COPY --from=builder /app-src/dist ./dist
COPY --from=builder /app-src/package.json ./
COPY --from=builder /app-src/node_modules ./node_modules
COPY --from=builder /app-src/public ./public

ENV CURSOR_BRIDGE_HOST=0.0.0.0
ENV CURSOR_BRIDGE_PORT=8765
ENV CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=true
ENV CURSOR_BRIDGE_MODE=ask

EXPOSE 8765
CMD ["node", "dist/cli.js"]
