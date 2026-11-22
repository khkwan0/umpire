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

From a git clone, `docker compose -f docker-compose.hub.yml up -d` is the same stack (override the example admin in `.env` if you want).

## 2. First login

Auth is on by default. A fresh database creates the admin from the Compose environment.

| | Example value |
|---|---|
| Username | `admin` |
| Password | `change-me-on-first-login` |

Sign in on the login page. Change that password immediately: **Settings** → **Change password** (current password, then a new one of at least 8 characters).

The example password is public. Do not expose port 8089 to the internet until you have changed it.

To pick your own bootstrap user, set `UMPIRE_ADMIN_USERNAME` and `UMPIRE_ADMIN_PASSWORD` **before the first start** (empty data directory). After the admin exists, those env vars are ignored.

If the API container exits on first boot, the password was missing or shorter than 8 characters. Fix Compose/env and start again on an empty `./data` directory.

## 3. Add a target

1. Open **Targets**.
2. Add a URL or hostname (for example `https://example.com`).
3. Set the check interval (seconds) and save.

The default **HTTP** check and **interval** scheduler are already enabled. The dashboard should show the target as up, down, or pending after the first check.

## 4. Alerts (optional)

The default notifier is **webhook**. It stays not-ready until you set a URL:

1. Open **Notifiers → Webhook**.
2. Paste an HTTPS endpoint that accepts a JSON POST.
3. Save, then use **Test** if you want a one-shot delivery.

Leave notifier/check boxes unchecked on a target to use **all enabled** plugins. Slack, Discord, email, FCM, and others stay off until you enable them in **Settings → Plugin manager**.

## 5. Next

- Pause a target from **Targets** (`enabled` off) without deleting it.
- Groups live under **Groups**.
- API tokens for scripts or [MCP](agents.md) are created in **Settings → API tokens** after you are signed in.
- Browser toolbar companion: [Chrome Web Store](https://chromewebstore.google.com/detail/umpire/lhhafgjninkefjakefhmeepfehfpcmhl).

Headless (API only, no dashboard): [deployment.md — API only](deployment.md#api-only-no-dashboard) and [docs/api.md](api.md).
