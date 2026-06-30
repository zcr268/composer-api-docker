# ── Builder: clone source & compile TypeScript ──────────────────────
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

ARG UPSTREAM_REPO=anyrobert/cursor-api-proxy
ARG UPSTREAM_REF=main
RUN git clone --depth 1 --branch ${UPSTREAM_REF} \
    https://github.com/${UPSTREAM_REPO}.git /app-src

WORKDIR /app-src
RUN npm ci && npm run build && npm prune --omit=dev

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:22-slim

# Install agent CLI — direct download, no interactive installer
ARG AGENT_VERSION=2026.06.26-7079533
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/* && \
    mkdir -p /usr/local/share/cursor-agent/versions/${AGENT_VERSION} && \
    curl -fSL "https://downloads.cursor.com/lab/${AGENT_VERSION}/linux/x64/agent-cli-package.tar.gz" \
      | tar --strip-components=1 -xzf - -C /usr/local/share/cursor-agent/versions/${AGENT_VERSION} && \
    ln -sf /usr/local/share/cursor-agent/versions/${AGENT_VERSION}/cursor-agent /usr/local/bin/agent && \
    ln -sf /usr/local/share/cursor-agent/versions/${AGENT_VERSION}/cursor-agent /usr/local/bin/cursor-agent && \
    agent --version

# Copy built proxy
COPY --from=builder /app-src/dist ./dist
COPY --from=builder /app-src/package.json ./
COPY --from=builder /app-src/node_modules ./node_modules
COPY --from=builder /app-src/public ./public

# Default configuration
ENV CURSOR_BRIDGE_HOST=0.0.0.0
ENV CURSOR_BRIDGE_PORT=8765
ENV CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE=true
ENV CURSOR_BRIDGE_MODE=ask

EXPOSE 8765
CMD ["node", "dist/cli.js"]
