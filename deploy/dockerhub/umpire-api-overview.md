# UMPIRE API

**Universal Monitoring Plugin & Incident Reporter** — the required runtime for UMPIRE. Runs HTTP checks on a schedule, stores results in SQLite, and delivers alerts through pluggable notifiers (webhook, Slack, FCM, and more).

This image is **enough on its own** for headless monitoring. Add [`nitroxstudios/umpire-web`](https://hub.docker.com/r/nitroxstudios/umpire-web) for the dashboard.

- **Source:** https://github.com/khkwan0/umpire
- **Deployment guide:** https://github.com/khkwan0/umpire/blob/master/docs/deployment.md
- **API reference (Swagger):** `http://<host>:3000/documentation/` when the container is running

## Pull

```bash
docker pull nitroxstudios/umpire-api:latest
```

Pin a version: `docker pull nitroxstudios/umpire-api:1.0.0`

## Quick run (API only)

```bash
mkdir -p data
docker run -d \
  --name umpire-api \
  -p 3000:3000 \
  -v "$(pwd)/data:/data" \
  -e DATABASE_PATH=/data/monitor.sqlite \
  -e BASE_PATH=/ \
  nitroxstudios/umpire-api:latest
```

Health: `curl http://localhost:3000/api/health`

## Recommended: API + web (Docker Compose)

Pull both images and start the full stack — see the **deployment guide** for `docker-compose.hub.yml`, `.env`, reverse proxies, and `BASE_PATH`:

https://github.com/khkwan0/umpire/blob/master/docs/deployment.md

```bash
docker pull nitroxstudios/umpire-api:latest
docker pull nitroxstudios/umpire-web:latest
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP listen port |
| `DATABASE_PATH` | `/data/monitor.sqlite` | SQLite file (mount `/data`) |
| `BASE_PATH` | `/` | Public URL prefix when behind a subpath (e.g. `/umpire`) |
| `CHECK_TIMEOUT_MS` | `10000` | HTTP check timeout |

## Companion image

| Image | Role |
|-------|------|
| [`nitroxstudios/umpire-web`](https://hub.docker.com/r/nitroxstudios/umpire-web) | Dashboard UI (optional) |

## Links

- Deployment: https://github.com/khkwan0/umpire/blob/master/docs/deployment.md
- HTTP API guide: https://github.com/khkwan0/umpire/blob/master/docs/api.md
- MCP / agents: https://github.com/khkwan0/umpire/blob/master/docs/agents.md
