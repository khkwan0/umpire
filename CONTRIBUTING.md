# Contributing to UMPIRE

Thanks for contributing.

## Development setup

- From repo root:
  - `cp .env.example .env`
  - `cp firebase-service-account.json.example firebase-service-account.json` (optional for local; required for real FCM delivery)

Run API:

```bash
cd api && npm install && \
  DATABASE_PATH=../data/monitor.sqlite \
  GOOGLE_APPLICATION_CREDENTIALS=../firebase-service-account.json \
  npm run dev
```

Run web UI (second terminal):

```bash
cd web && npm install && npm run dev
```

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

## Pull request guidelines

- Keep PRs focused and small when possible.
- Include a short summary of:
  - what changed
  - why it changed
  - how you tested it
- If UI behavior changes, include screenshots or short notes of before/after behavior.
- If API behavior changes, update relevant docs in `README.md` and/or `docs/plugins.md`.

## Plugin and core boundaries

- Source of truth for plugin contracts: `api/src/plugins/types.ts`.
- Plugins should not mutate core SQLite tables (`groups`, `targets`, `settings`, `check_results`, `target_state`).
- Keep core/plugin boundaries explicit:
  - core owns pipeline, state, policy, and host APIs
  - plugins own probe/schedule/notify implementations

## Security and secrets

- Never commit secrets, service account files, or `.env`.
- Use example files as templates (`.env.example`, `firebase-service-account.json.example`).

## Reporting issues

When filing a bug, include:

- steps to reproduce
- expected behavior
- actual behavior
- relevant logs/errors
- environment details (OS, Node version, Docker if applicable)
