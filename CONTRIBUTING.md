# Contributing to UMPIRE

Thanks for contributing.

## Docs

Read these before changing code:

- **[Plugin developer guide](docs/plugins.md)** — how to write check, scheduler, and notifier plugins (contracts, HTTP, UI, cookbooks).
- **[Core developer guide](docs/core.md)** — how the host works (pipeline, frozen schema, alert policy, plugin host, UI shell) and what belongs in core vs a plugin.
- **[`plugins/README.md`](plugins/README.md)** — implementations live in `plugins/<kind>/<id>/`; the host stays in `api/src/plugins/`.

Operator setup and the HTTP API list live in [`README.md`](README.md).

## Development setup

To **run the packaged stack** locally (Docker), use [`./scripts/deploy.sh`](scripts/deploy.sh) or `docker compose up --build -d` — see [`README.md`](README.md). The commands below are the two-process watch path for changing code.

- From repo root:
  - `cp .env.example .env`
  - Optional, only if you enable FCM: `cp plugins/notify/fcm/fcm-service-account.json.example data/fcm-service-account.json`

Run API:

```bash
cd api && npm install && \
  DATABASE_PATH=../data/monitor.sqlite \
  npm run dev
```

Run web UI (second terminal):

```bash
cd web && npm install && npm run dev
```

UI: [http://localhost:8089](http://localhost:8089) (`web/vite.config.ts` `server.port`). That is the same host port Compose publishes (`WEB_PORT` in `.env`, default 8089). Do not run `npm run dev` and `docker compose` together — only one process can bind 8089.

### Browser extensions

Chrome + Firefox extensions live in [`extensions/`](extensions/) (WXT). They talk to the same HTTP API as the web UI (login, status, incidents, SSE). See [`extensions/README.md`](extensions/README.md).

```bash
cd extensions && npm install && npm run build && npm run build:firefox
```

### MCP server (AI agents)

```bash
cd mcp && npm install && npm run build
```

See [`mcp/README.md`](mcp/README.md). Requires an API token when auth is enabled.

### Agent CLI and web chat

```bash
cd agent && npm install && npm run build
OPENAI_API_KEY=sk-… UMPIRE_API_TOKEN=umpire_… npm start   # terminal chat
```

Web UI: **Agent** tab at `/agent` (WebSocket `/api/agent/ws`). The API server needs `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. See [`agent/README.md`](agent/README.md).

## Testing and CI expectations

Before opening a pull request, run the same checks as CI:

```bash
cd api && npm ci && npm run lint && npm run format:check && npm run test:ci && npm run build
cd ../web && npm ci && npm run lint && npm run format:check && npm run build
```

Deploy from repo root:

```bash
./scripts/deploy.sh
```

Quick API test loop:

```bash
cd api && npm test
```

GitHub Actions (`.github/workflows/ci.yml`) is the source of truth for PR CI.
Dependabot (`.github/dependabot.yml`) keeps npm, Docker, and GitHub Actions dependencies fresh.

`cd api && npm run format` / `format:check` and `npm test` include `plugins/**/*.ts`. `npm run lint` covers `api/src` only (ESLint stays inside the API package). Docker image builds must run from the **repo root** so `api/Dockerfile` and `web/Dockerfile` can copy `plugins/`.

## Pull request guidelines

- Keep PRs focused and small when possible.
- Include a short summary of:
  - what changed
  - why it changed
  - how you tested it
- If UI behavior changes, include screenshots or short notes of before/after behavior.
- If API behavior changes, update relevant docs in `README.md`, [`docs/core.md`](docs/core.md), and/or [`docs/plugins.md`](docs/plugins.md).

## Plugin and core boundaries

Full rules: [plugin guide](docs/plugins.md) and [core guide](docs/core.md).

- Source of truth for plugin contracts: `api/src/plugins/types.ts`.
- Plugin implementations live in `plugins/<kind>/<id>/` (not under `api/`).
- Plugins should not mutate core SQLite tables (`groups`, `targets`, `settings`, `check_results`, `target_state`).
- Keep core/plugin boundaries explicit:
  - core owns pipeline, state, policy, and host APIs
  - plugins own probe/schedule/notify implementations

## Security and secrets

- Never commit secrets, service account files, or `.env`.
- Use example files as templates (`.env.example`, `plugins/notify/fcm/fcm-service-account.json.example`).

## Reporting issues

When filing a bug, include:

- steps to reproduce
- expected behavior
- actual behavior
- relevant logs/errors
- environment details (OS, Node version, Docker if applicable)
