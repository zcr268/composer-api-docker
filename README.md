# cursor-api-proxy (Docker)

Docker deployment for [anyrobert/cursor-api-proxy](https://github.com/anyrobert/cursor-api-proxy) — OpenAI-compatible proxy for Cursor CLI.

Source code is cloned at **build time** from upstream, so this repo only contains Docker configuration.

## Quick start

```bash
cp .env.example .env   # edit: set CURSOR_BRIDGE_API_KEY + CURSOR_API_KEY
docker compose up -d --build
```

## Endpoints

| Endpoint | Method |
|----------|--------|
| `/healthz` | GET |
| `/v1/models` | GET |
| `/v1/chat/completions` | POST |
| `/v1/responses` | POST |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CURSOR_BRIDGE_API_KEY` | — | Bearer auth key |
| `CURSOR_API_KEY` | — | Cursor auth token |
| `CURSOR_BRIDGE_PORT` | `8765` | Listen port |
| `CURSOR_BRIDGE_MODE` | `ask` | ask / agent / plan |
| `CURSOR_BRIDGE_DEFAULT_MODEL` | `auto` | Default model |
| `CURSOR_BRIDGE_CHAT_ONLY_WORKSPACE` | `true` | Isolated workspace |

## Build args

| Arg | Default |
|-----|---------|
| `UPSTREAM_REPO` | `anyrobert/cursor-api-proxy` |
| `UPSTREAM_REF` | `main` |
