# Yet Another Monitoring Tool

Standalone HTTP uptime monitor with a config UI and FCM push alerts. Runs on its own host via Docker Compose — not part of any other app.

## What it does

- Periodically `GET`s each configured URL
- Treats **HTTP 200** as healthy; anything else (or network/timeout) is failure
- Sends Firebase Cloud Messaging alerts according to a configurable policy
- Stores targets, tokens, settings, and check history in **SQLite** (`./data/monitor.sqlite`)

## Services

| Service | Role |
|---------|------|
| `api` | Fastify API + in-process checker + FCM |
| `web` | Vite/React UI behind nginx (`/api` proxied to `api`) |

UI default: [http://localhost:8089](http://localhost:8089)

## Quick start

```bash
cp .env.example .env
cp firebase-service-account.json.example firebase-service-account.json
# edit firebase-service-account.json with a real Firebase Admin service account

docker compose up --build -d
```

Open the UI, add a target URL + interval, add an FCM device token, pick an alert policy.

Without valid Firebase credentials the API still runs and checks URLs; alerts are skipped (`fcm_ready: false` on the dashboard).

## Alert policies

- **state_change** (default) — notify once when a target goes down, once when it recovers
- **every_fail** — notify on every failed check
- **throttle** — notify on first failure, then at most once per N minutes while still down (and once on recover)

## Local development (without Docker)

Terminal 1 — API:

```bash
cd api
npm install
DATABASE_PATH=../data/monitor.sqlite \
GOOGLE_APPLICATION_CREDENTIALS=../firebase-service-account.json \
npm run dev
```

Terminal 2 — UI (proxies `/api` to `:3000`):

```bash
cd web
npm install
npm run dev
```

## API

- `GET/POST/PATCH/DELETE /api/targets`
- `GET /api/targets/:id/results`
- `GET/POST/DELETE /api/tokens`
- `GET/PUT /api/settings`
- `GET /api/status`
- `GET /api/health`

## Data

SQLite file lives on the host at `./data/monitor.sqlite` (bind-mounted into the API container at `/data/monitor.sqlite`).

## Notes

- No auth on the UI — bind to localhost or put it behind a VPN/firewall
- Default branch for this repo is `master`
