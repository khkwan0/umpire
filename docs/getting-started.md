# Getting started

Stand up UMPIRE, sign in, and watch a URL. Docker and Compose are enough — no Node, no git clone.

Full production notes (tags, reverse proxy, subpaths): [deployment.md](deployment.md). Building from source: [README — Run locally](../README.md#run-locally-from-source).

## 1. Install

Save the [example Compose file](../deploy/dockerhub/docker-compose.yml) and start both images:

```bash
mkdir umpire && cd umpire
curl -fsSLO https://raw.githubusercontent.com/khkwan0/umpire/master/deploy/dockerhub/docker-compose.yml
docker compose pull
docker compose up -d
```

Wait until the API is healthy (the web container starts after that):

```bash
curl -fsS http://localhost:8089/api/health
```

You should see `{"ok":true}`. Open **http://localhost:8089**.

From a git clone, `docker compose -f docker-compose.hub.yml up -d` is the same stack.

## 2. Environment variables

The example Compose file sets these on the **api** service. Leave the defaults unless you know you need to change them.

### Required on first start (auth)

Auth is on by default. A **fresh** database creates the first admin from these two. Without them (or if the password is under 8 characters) the API container **exits**.

```yaml
environment:
  UMPIRE_ADMIN_USERNAME: admin
  UMPIRE_ADMIN_PASSWORD: change-me-on-first-login
```

Or in a `.env` next to Compose (used by [`docker-compose.hub.yml`](../docker-compose.hub.yml)):

```bash
UMPIRE_ADMIN_USERNAME=admin
UMPIRE_ADMIN_PASSWORD=change-me-on-first-login
```

| Variable | Why it is there |
|---|---|
| `UMPIRE_ADMIN_USERNAME` | Bootstrap admin username. Only used when the database has **no users yet**. |
| `UMPIRE_ADMIN_PASSWORD` | Bootstrap password (min 8 characters). Same first-boot-only rule. |

Set your own values **before the first `up`**. After the admin exists, changing these env vars does nothing — use **Settings → Change password** instead.

### Always set in the example Compose (API)

These tell the API how to listen, where to store data, and how checks behave. The example file already includes working values.

| Variable | Example | Why it is there |
|---|---|---|
| `PORT` | `3000` | Port the API process binds **inside** the container. Compose does not publish this to the host; the **web** container reaches `api:3000` on the internal network. Change this only if you run the API image alone and map a different host port. |
| `DATABASE_PATH` | `/data/monitor.sqlite` | SQLite file (and the directory plugin JSON sits next to). Must live on the mounted volume so targets, history, and login survive `docker compose down`. |
| `BASE_PATH` | `/` | Public URL prefix. `/` means you open `http://host:8089/`. Set `/umpire` only if a reverse proxy serves the UI under a subdirectory — and you must use a **web** image built with that same path. Details: [deployment.md](deployment.md#hosting-at-a-subpath-base_path). |
| `CHECK_TIMEOUT_MS` | `10000` | How long HTTP (and other) checks wait before recording a timeout. Raise this if slow sites are marked down; 10s matches the Node connect timeout. |

### Compose-only (not inside the API process)

These are interpolated by Compose when you use [`docker-compose.hub.yml`](../docker-compose.hub.yml) or a `.env` file. The copy-paste Hub Compose hard-codes the same choices.

| Variable | Example | Why it is there |
|---|---|---|
| Host port `8089:80` / `WEB_PORT` | `8089` | Browser port on **your machine**. `80` inside the web container is nginx. 8089 avoids colliding with local 80/8080. |
| Volume `./data:/data` / `UMPIRE_DATA_DIR` | `./data` | Host folder for SQLite and plugin config. Delete this directory only if you intend to wipe the install (including the admin user). |
| `UMPIRE_IMAGE_REGISTRY` / `UMPIRE_IMAGE_TAG` | `nitroxstudios`, `latest` | Which Hub images to pull. Pin a tag (for example `1.0.8`) on a production host so `latest` cannot surprise you. |
| `UMPIRE_WEB_IMAGE_TAG` | unset = same as API | Separate web tag when it differs (subdirectory builds such as `umpire-web:umpire`). |

`FCM_ANDROID_CHANNEL_ID` appears on the Hub Compose file only. Leave it empty unless you use the FCM notifier and your Android app created a named notification channel.

Optional LLM / MCP variables (`AGENT_*`, `UMPIRE_API_TOKEN`, `UMPIRE_BASE_URL`) are not required to run the dashboard. Set them later for [agents](agents.md).

## 3. First login

Sign in at http://localhost:8089 with the same username and password you set above.

| | Example (if you used the stock Compose file) |
|---|---|
| Username | `admin` |
| Password | `change-me-on-first-login` |

Then **Settings → Change password** (current password, then a new one of at least 8 characters). Do not expose port 8089 to the internet until you have changed it.

If the API exited on first boot, fix the env vars and start again with an empty `./data` directory.

## 4. Add a target

1. Open **Targets**.
2. Add a URL or hostname (for example `https://example.com`).
3. Set the check interval (seconds) and save.

The default **HTTP** check and **interval** scheduler are already enabled. The dashboard should show the target as up, down, or pending after the first check.

## 5. Alerts (optional)

The default notifier is **webhook**. It stays not-ready until you set a URL:

1. Open **Notifiers → Webhook**.
2. Paste an HTTPS endpoint that accepts a JSON POST.
3. Save, then use **Test** if you want a one-shot delivery.

Leave notifier/check boxes unchecked on a target to use **all enabled** plugins. Slack, Discord, email, FCM, and others stay off until you enable them in **Settings → Plugin manager**.

## 6. Next

- Pause a target from **Targets** (`enabled` off) without deleting it.
- Groups live under **Groups**.
- API tokens for scripts or [MCP](agents.md) are created in **Settings → API tokens** after you are signed in.
- Browser toolbar companion: [Chrome Web Store](https://chromewebstore.google.com/detail/umpire/lhhafgjninkefjakefhmeepfehfpcmhl).

Headless (API only, no dashboard): [deployment.md — API only](deployment.md#api-only-no-dashboard) and [docs/api.md](api.md).
