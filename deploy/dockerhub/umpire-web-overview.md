# UMPIRE Web

Dashboard UI for **UMPIRE** — React app behind nginx. Proxies `/api`, `/documentation`, and WebSockets to the API container.

**Do not run this image alone.** Checks and alerts run in [`nitroxstudios/umpire-api`](https://hub.docker.com/r/nitroxstudios/umpire-api). This image is the UI: targets, history, plugin settings, and the built-in agent chat.

- **Source:** https://github.com/khkwan0/umpire
- **Deployment guide:** https://github.com/khkwan0/umpire/blob/master/docs/deployment.md

## Quick start (API + dashboard)

Save the compose file below as `docker-compose.yml`, then:

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

Default `latest` is built for **root** hosting (`BASE_PATH=/`). For subdirectory hosting (e.g. `https://example.com/umpire`), use a web image tag built with that path — see the deployment guide.

## `BASE_PATH` (important)

The public URL path is **baked into this image at build time**. It must match how users open the app in the browser:

| Users open | Web image |
|------------|-----------|
| `https://example.com/` | `umpire-web:latest` (default) |
| `https://example.com/umpire` | Tag built with `BASE_PATH=/umpire` (e.g. `umpire-web:umpire`) |

Set `BASE_PATH` on the API to the same value at runtime. Details:

https://github.com/khkwan0/umpire/blob/master/docs/deployment.md#hosting-at-a-subpath-base_path

## Companion image

| Image | Role |
|-------|------|
| [`nitroxstudios/umpire-api`](https://hub.docker.com/r/nitroxstudios/umpire-api) | API — **required** |

## Links

- Deployment: https://github.com/khkwan0/umpire/blob/master/docs/deployment.md
- HTTP API / Swagger: https://github.com/khkwan0/umpire/blob/master/docs/api.md
