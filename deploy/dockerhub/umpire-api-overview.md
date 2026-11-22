# UMPIRE API

**Universal Monitoring Plugin & Incident Reporter** — the required runtime. Runs HTTP checks on a schedule, stores results in SQLite, and delivers alerts through notifiers (webhook, Slack, FCM, and more).

Add [`nitroxstudios/umpire-web`](https://hub.docker.com/r/nitroxstudios/umpire-web) for the dashboard (recommended). The API image alone is enough for headless monitoring.

- **Source:** https://github.com/khkwan0/umpire
- **Deployment guide:** https://github.com/khkwan0/umpire/blob/master/docs/deployment.md

## Quick start (API + dashboard)

You need **both** images. Save the compose file below as `docker-compose.yml`, then:

```bash
docker compose pull
docker compose up -d
```

Open **http://localhost:8089** and sign in:

| | |
|---|---|
| Username | `admin` |
| Password | `change-me-on-first-login` |

Then change that password under **Settings**, add a target (for example `https://example.com`), and point **Notifiers → Webhook** at an endpoint if you want alerts.

Health: `curl -fsS http://localhost:8089/api/health`

A first boot **without** `UMPIRE_ADMIN_USERNAME` and `UMPIRE_ADMIN_PASSWORD` (8+ characters) exits. The example compose sets both.

## docker-compose.yml (copy-paste)

```yaml
# UMPIRE — copy this file as docker-compose.yml and run:
#   docker compose pull
#   docker compose up -d
# Then open http://localhost:8089 and sign in (see comments below).
#
# Change UMPIRE_ADMIN_PASSWORD before exposing this to a network.
# Pin tags instead of :latest for a production host, e.g. umpire-api:1.0.8

services:
  api:
    image: nitroxstudios/umpire-api:latest
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://127.0.0.1:3000/api/health']
      interval: 5s
      timeout: 5s
      retries: 30
      start_period: 120s
    volumes:
      - ./data:/data
    environment:
      PORT: '3000'
      DATABASE_PATH: /data/monitor.sqlite
      BASE_PATH: /
      CHECK_TIMEOUT_MS: '10000'
      # Fresh install creates this admin (password must be at least 8 characters).
      UMPIRE_ADMIN_USERNAME: admin
      UMPIRE_ADMIN_PASSWORD: change-me-on-first-login
    networks:
      - monitor

  web:
    image: nitroxstudios/umpire-web:latest
    restart: unless-stopped
    ports:
      - '8089:80'
    depends_on:
      api:
        condition: service_healthy
    networks:
      - monitor

networks:
  monitor:
    driver: bridge
```

Same file in git: [`deploy/dockerhub/docker-compose.yml`](https://github.com/khkwan0/umpire/blob/master/deploy/dockerhub/docker-compose.yml)

```bash
curl -fsSLO https://raw.githubusercontent.com/khkwan0/umpire/master/deploy/dockerhub/docker-compose.yml
docker compose pull
docker compose up -d
```

## Pull only

```bash
docker pull nitroxstudios/umpire-api:latest
docker pull nitroxstudios/umpire-web:latest
```

Pin a version: `docker pull nitroxstudios/umpire-api:1.0.8`

## API only (no dashboard)

```bash
mkdir -p data
docker run -d \
  --name umpire-api \
  -p 3000:3000 \
  -v "$(pwd)/data:/data" \
  -e DATABASE_PATH=/data/monitor.sqlite \
  -e UMPIRE_ADMIN_USERNAME=admin \
  -e UMPIRE_ADMIN_PASSWORD=change-me-on-first-login \
  nitroxstudios/umpire-api:latest
```

Health: `curl http://localhost:3000/api/health`  
Swagger: `http://localhost:3000/documentation/`

Configure via the [HTTP API](https://github.com/khkwan0/umpire/blob/master/docs/api.md). Sign in with the same example admin, then create a token if you use scripts or MCP.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_PATH` | `/data/monitor.sqlite` | SQLite file (mount `/data`) |
| `BASE_PATH` | `/` | Public URL prefix when behind a subpath (e.g. `/umpire`) |
| `CHECK_TIMEOUT_MS` | `10000` | HTTP check timeout |
| `UMPIRE_ADMIN_USERNAME` | *(required on first boot)* | Bootstrap admin |
| `UMPIRE_ADMIN_PASSWORD` | *(required, min 8 chars)* | Bootstrap password |

## Companion image

| Image | Role |
|-------|------|
| [`nitroxstudios/umpire-web`](https://hub.docker.com/r/nitroxstudios/umpire-web) | Dashboard UI (optional, recommended) |

## Links

- Deployment: https://github.com/khkwan0/umpire/blob/master/docs/deployment.md
- HTTP API guide: https://github.com/khkwan0/umpire/blob/master/docs/api.md
- MCP / agents: https://github.com/khkwan0/umpire/blob/master/docs/agents.md
