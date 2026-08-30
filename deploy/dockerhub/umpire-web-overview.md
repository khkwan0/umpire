# UMPIRE Web

Dashboard UI for **UMPIRE** — React app behind nginx. Proxies `/api`, `/documentation`, and WebSockets to the API container.

**Not required for monitoring** — checks and alerts run in [`nitroxstudios/umpire-api`](https://hub.docker.com/r/nitroxstudios/umpire-api). This image is for day-to-day use: targets, history, plugin settings, and the built-in agent chat page.

- **Source:** https://github.com/khkwan0/umpire
- **Deployment guide:** https://github.com/khkwan0/umpire/blob/master/docs/deployment.md

## Pull

```bash
docker pull nitroxstudios/umpire-web:latest
```

Default `latest` is built for **root** hosting (`BASE_PATH=/`). For subdirectory hosting (e.g. `https://example.com/umpire`), use a web image tag built with that path — see the deployment guide.

## Run with the API (Docker Compose)

Do **not** run this image alone in production. Use Compose with the API service:

https://github.com/khkwan0/umpire/blob/master/docs/deployment.md

```bash
docker pull nitroxstudios/umpire-api:latest
docker pull nitroxstudios/umpire-web:latest

# From the deployment guide — docker-compose.hub.yml + .env
docker compose -f docker-compose.hub.yml up -d
```

Default UI: http://localhost:8089

## `BASE_PATH` (important)

The public URL path is **baked into this image at build time**. It must match how users open the app in the browser:

| Users open | Web image |
|------------|-----------|
| `https://example.com/` | `umpire-web:latest` (default) |
| `https://example.com/umpire` | Tag built with `BASE_PATH=/umpire` (e.g. `umpire-web:umpire`) |

Set `BASE_PATH` in `.env` to the same value at runtime (API + Swagger). Details:

https://github.com/khkwan0/umpire/blob/master/docs/deployment.md#hosting-at-a-subpath-base_path

## Companion image

| Image | Role |
|-------|------|
| [`nitroxstudios/umpire-api`](https://hub.docker.com/r/nitroxstudios/umpire-api) | API — **required** |

## Links

- Deployment: https://github.com/khkwan0/umpire/blob/master/docs/deployment.md
- HTTP API / Swagger: https://github.com/khkwan0/umpire/blob/master/docs/api.md
