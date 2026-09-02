# Deployment guide

UMPIRE ships as two Docker images. Use this guide to run published images from Docker Hub without cloning or building the repo.

**Developers** building from source: see [README — Run locally](../README.md#run-locally).

## Docker Hub images

| Image | Role | Required? |
|-------|------|-----------|
| [`nitroxstudios/umpire-api`](https://hub.docker.com/r/nitroxstudios/umpire-api) | API, checks, storage, alerts | **Yes** |
| [`nitroxstudios/umpire-web`](https://hub.docker.com/r/nitroxstudios/umpire-web) | Dashboard UI | No (recommended) |

Docker Hub overview text (paste into each repo on hub.docker.com): [`deploy/dockerhub/`](../deploy/dockerhub/).

Pull manually:

```bash
docker pull nitroxstudios/umpire-api:latest
docker pull nitroxstudios/umpire-web:latest
```

Pin a version instead of `latest` when you want reproducible deploys:

```bash
export UMPIRE_IMAGE_TAG=1.0.0
docker pull nitroxstudios/umpire-api:${UMPIRE_IMAGE_TAG}
docker pull nitroxstudios/umpire-web:${UMPIRE_IMAGE_TAG}
```

## Quick start (Docker Compose)

The repo includes [`docker-compose.hub.yml`](../docker-compose.hub.yml) — Compose file that **pulls** images (no `build:`).

```bash
mkdir umpire && cd umpire
curl -fsSLO https://raw.githubusercontent.com/khkwan0/umpire/master/docker-compose.hub.yml
curl -fsSLO https://raw.githubusercontent.com/khkwan0/umpire/master/deploy/env.example
cp env.example .env

docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

Or from a git clone:

```bash
cp deploy/env.example .env
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

Open [http://localhost:8089](http://localhost:8089), add a target, configure a webhook under **Notifiers → Webhook**.

Health check:

```bash
curl -fsS http://localhost:8089/api/health
```

## Configuration

Environment variables (set in `.env` next to the compose file):

| Variable | Default | Purpose |
|----------|---------|---------|
| `UMPIRE_IMAGE_REGISTRY` | `nitroxstudios` | Docker Hub user/org |
| `UMPIRE_IMAGE_TAG` | `latest` | Tag for `umpire-api` (and `umpire-web` unless overridden) |
| `UMPIRE_WEB_IMAGE_TAG` | same as `UMPIRE_IMAGE_TAG` | Web image tag when it differs (see BASE_PATH below) |
| `WEB_PORT` | `8089` | Host port published by the web container |
| `BASE_PATH` | `/` | Public URL prefix — must match the **web image** build |
| `UMPIRE_DATA_DIR` | `./data` | Host directory for SQLite + plugin config |
| `CHECK_TIMEOUT_MS` | `10000` | HTTP check timeout |
| `UMPIRE_ADMIN_USERNAME` | *(empty)* | Bootstrap admin username — required on fresh install when rbac auth plugin is enabled |
| `UMPIRE_ADMIN_PASSWORD` | *(empty)* | Bootstrap admin password — required on fresh install when rbac auth plugin is enabled |

Example `.env` for a custom registry mirror:

```bash
UMPIRE_IMAGE_REGISTRY=myregistry.example/umpire
UMPIRE_IMAGE_TAG=1.0.0
WEB_PORT=8089
```

## Hosting at a subpath (`BASE_PATH`)

If users open the UI at `https://example.com/umpire` (not the domain root), two things must align:

1. **`BASE_PATH=/umpire`** in `.env` (runtime — API + Swagger)
2. **Web image** built with that same path at **publish** time (`BASE_PATH` is baked into the web image)

Default `nitroxstudios/umpire-web:latest` assumes root hosting (`BASE_PATH=/`).

For subdirectory hosting, use a web image tag published with `BASE_PATH=/umpire`, for example:

```bash
# Publisher (maintainer)
BASE_PATH=/umpire VERSION=umpire ./scripts/publish-docker.sh --web-only

# Deployer
UMPIRE_WEB_IMAGE_TAG=umpire
BASE_PATH=/umpire
```

Then `docker compose -f docker-compose.hub.yml pull && docker compose -f docker-compose.hub.yml up -d`.

See [README — BASE_PATH](../README.md#public-url-path-base_path) for reverse-proxy examples.

## API only (no dashboard)

Monitoring works with the API image alone. Example `docker-compose.api.yml` snippet:

```yaml
services:
  api:
    image: nitroxstudios/umpire-api:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./data:/data
    environment:
      DATABASE_PATH: /data/monitor.sqlite
      BASE_PATH: /
      UMPIRE_ADMIN_USERNAME: ${UMPIRE_ADMIN_USERNAME:-}
      UMPIRE_ADMIN_PASSWORD: ${UMPIRE_ADMIN_PASSWORD:-}
```

Configure via REST ([docs/api.md](api.md)) or [MCP](../mcp/README.md). With rbac enabled (default), log in using bootstrap credentials on a fresh install, then use session cookies or API tokens. With auth disabled, no login is required. Swagger: `http://localhost:3000/documentation/`.

## Reverse proxy

Typical production setup:

```text
Internet → TLS terminator (nginx, Caddy, Traefik) → UMPIRE web :8089 → API :3000 (internal)
```

The **web** container proxies `/api`, `/documentation`, and WebSockets to **api**. Your front proxy only needs to reach **web** on `WEB_PORT`.

Example (preserve path, `BASE_PATH=/umpire`):

```nginx
location /umpire/ {
  proxy_pass http://127.0.0.1:8089/umpire/;
  proxy_http_version 1.1;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_read_timeout 1d;
}
```

Both **preserve-path** and **strip-path** proxy styles are supported when `BASE_PATH` is set — see [README](../README.md#public-url-path-base_path).

## Data and upgrades

- **Data** lives in `UMPIRE_DATA_DIR` (default `./data`): SQLite, `plugin-manager.json`, webhook/FCM sidecars, etc. Back up this directory.
- **Upgrade:** set `UMPIRE_IMAGE_TAG` (and `UMPIRE_WEB_IMAGE_TAG` if used), then:

```bash
docker compose -f docker-compose.hub.yml pull
docker compose -f docker-compose.hub.yml up -d
```

- **Downgrade:** pin an older tag; data is usually forward-compatible, but test in staging first.

## Publishing images (maintainers)

From a repo clone with Docker Hub credentials in `.env.dockerhub`:

```bash
./scripts/publish-docker.sh                  # both images → :latest
VERSION=1.0.0 ./scripts/publish-docker.sh    # versioned + :latest
BASE_PATH=/umpire VERSION=umpire ./scripts/publish-docker.sh --web-only
./scripts/publish-dockerhub-metadata.sh      # descriptions, overviews, categories on Hub
```

Hub copy lives in [`deploy/dockerhub/`](../deploy/dockerhub/).

## See also

- [API guide](api.md) — Swagger, curl, headless setup
- [Agents](agents.md) — MCP, API tokens, WebSockets
- [Jenkins on-host CD](jenkins.md) — optional CI/CD from source
