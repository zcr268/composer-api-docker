# ── Builder: install deps & compile TypeScript ─────────────────────
FROM node:22-slim AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────────
FROM node:22-slim

# Install Cursor agent CLI
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

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV BRIDGE_HOST=0.0.0.0
ENV BRIDGE_PORT=8791
ENV BRIDGE_WORKSPACE=/workspace

EXPOSE 8791
CMD ["node", "dist/server.js"]
