# Docker Hub repository copy

Paste these into each image repo on [hub.docker.com](https://hub.docker.com), **or** push automatically:

```bash
./scripts/publish-dockerhub-metadata.sh
```

Uses `.env.dockerhub` (same credentials as `publish-docker.sh`).

## Files

| File | Docker Hub repo | Field |
|------|-----------------|-------|
| [`umpire-api-short.txt`](umpire-api-short.txt) | `nitroxstudios/umpire-api` | Short description (manual paste) |
| [`umpire-api-overview.md`](umpire-api-overview.md) | `nitroxstudios/umpire-api` | Full overview |
| [`umpire-api.meta.json`](umpire-api.meta.json) | `nitroxstudios/umpire-api` | Description + categories (used by script) |
| [`umpire-web-short.txt`](umpire-web-short.txt) | `nitroxstudios/umpire-web` | Short description |
| [`umpire-web-overview.md`](umpire-web-overview.md) | `nitroxstudios/umpire-web` | Full overview |
| [`umpire-web.meta.json`](umpire-web.meta.json) | `nitroxstudios/umpire-web` | Description + categories |

## Categories

| Repo | Categories |
|------|------------|
| `umpire-api` | Monitoring & observability, Developer tools, Integration & delivery |
| `umpire-web` | Web servers, Monitoring & observability, Developer tools |

Slugs are in each `*.meta.json` file (`monitoring-and-observability`, etc.).

## Manual paste

Canonical deployment guide (linked from both overviews):

https://github.com/khkwan0/umpire/blob/master/docs/deployment.md

After publishing a new image tag, run `./scripts/publish-dockerhub-metadata.sh` again only if overview text changed.
