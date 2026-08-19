# Jenkins CI/CD

Pull-request CI runs on **GitHub Actions** ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)): API tests + build, web production build, current Node LTS. That is the status check on GitHub.

This Jenkins pipeline is optional **on-host** CD. The repo ships a Declarative Pipeline in [`Jenkinsfile`](../Jenkinsfile). CI always installs, tests, and builds. Docker image builds run on `master`. Compose deploy is opt-in (`DEPLOY`).

## What the pipeline does

| Stage | When | What |
|-------|------|------|
| **API** | every build | `npm ci`, Jest (`npm run test:ci`), `tsc` inside `node:lts-bookworm` |
| **Web** | every build | `npm ci`, Vite production build (same image, parallel with API) |
| **Docker images** | `master`, or `DEPLOY` | `docker compose build` |
| **Deploy** | `DEPLOY=true` | `docker compose up -d --build`, then poll `GET /api/health` |

Jest writes `api/junit.xml`. The **JUnit** publisher shows pass/fail history on the job.

Deploy copies `firebase-service-account.json.example` when the real file is missing so Compose can start; FCM stays `ready: false` until you mount a real service account on the agent.

## Jenkins plugins

Install at **Manage Jenkins → Plugins**:

- **Pipeline** (`workflow-aggregator`)
- **Docker** and **Docker Pipeline** (`docker-plugin`, `docker-workflow`) — required for `agent { docker { … } }`
- **JUnit**
- **Timestamper** (`timestamps()`)
- **Git**

The agent that runs the job needs a Docker engine (the Node stages pull `node:lts-bookworm`; image/deploy stages call `docker compose`).

## Create the job

**Multibranch Pipeline** (preferred — `branch 'master'` works, PRs get their own jobs):

1. **New Item → Multibranch Pipeline**
2. Branch source: this Git remote
3. Build configuration: **by Jenkinsfile**, script path `Jenkinsfile`
4. Scan. `master` should build on the next change (and on first scan if you enable “Build new branches”)

**Single Pipeline** (one branch, manual SCM):

1. **New Item → Pipeline**
2. **Pipeline script from SCM** → Git → this remote → script path `Jenkinsfile`
3. For `master`-only Docker builds, set the branch to `master`. `BRANCH_NAME` is often empty here; the Jenkinsfile also treats `GIT_BRANCH=origin/master` as master.

Run **Build with Parameters** and check **DEPLOY** only on an agent that should host the stack (ports, `./data`, Firebase file).

## Agent notes

- Use a Linux agent with Docker, not the built-in controller if you can avoid it.
- `node:lts-bookworm` includes `python3` / `make` / `g++`, so `better-sqlite3` compiles and the SQLite store tests run.
- The Node stages run as root in the container (`-u root:root`) so `npm ci` can write `node_modules` in the workspace.
- Compose publish port defaults to **8089** (`WEB_PORT` in `.env`). Health check uses `http://127.0.0.1:${WEB_PORT:-8089}/api/health`.

## Local equivalent

```bash
cd api && npm ci && npm run test:ci && npm run build
cd ../web && npm ci && npm run build
docker compose build
```
