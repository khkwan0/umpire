# UMPIRE extension — store listing copy

Use this file when submitting to the **Chrome Web Store**, **Firefox Add-ons (AMO)**, and **Edge Add-ons**.

## URLs

| Field | URL |
|-------|-----|
| Chrome Web Store | https://chromewebstore.google.com/detail/umpire/lhhafgjninkefjakefhmeepfehfpcmhl |
| Homepage | https://github.com/khkwan0/umpire |
| Support | https://github.com/khkwan0/umpire/issues |
| Privacy policy | https://github.com/khkwan0/umpire/blob/master/extensions/store/PRIVACY.md |
| Source | https://github.com/khkwan0/umpire/tree/master/extensions |

## Short description

**Chrome / Edge** (max 132 characters):

```text
Companion for self-hosted UMPIRE. Requires your own UMPIRE API server. Toolbar health badge and desktop outage alerts.
```

**Firefox** (max ~250 characters):

```text
Browser companion for UMPIRE monitoring. Requires UMPIRE API and web UI running on your own server (not bundled). Toolbar badge, popup health, and desktop notifications when targets fail or recover.
```

## Long description

```text
REQUIRES A UMPIRE SERVER

This is a companion browser extension — not a standalone monitoring product. You must deploy and run UMPIRE yourself (API + web UI on your own host, Docker, or local machine). The extension connects to that server’s HTTP API; it does not include monitoring, targets, or alerts on its own.

If you do not already run UMPIRE, start here: https://github.com/khkwan0/umpire

WHAT IT DOES

UMPIRE (Universal Monitoring Plugin & Incident Reporter) is open-source monitoring you run on your own infrastructure. This extension is a lightweight companion for operators who already use the UMPIRE dashboard and API.

Point the extension at your UMPIRE base URL — the same address you use for the web UI (for example https://monitor.example.com or https://host/umpire). After you grant access to that host, the extension keeps you informed without keeping a dashboard tab open.

FEATURES

• Toolbar badge — live count of unhealthy targets (down + partial)
• Popup dashboard — target list with status, last-check age, and open incidents
• Desktop notifications — optional alerts when a target goes down/partial or recovers
• Live updates — listens to the UMPIRE event stream, with polling fallback

AUTHENTICATION

Yes. If your UMPIRE server requires login, the extension shows a sign-in form in the popup (same username/password as the web UI). It uses the standard UMPIRE session cookie (`umpire_session`) and supports log out from the popup. If your server allows read-only access without auth, the extension works without signing in. API tokens are not used — session login only.

SELF-HOSTED BY DESIGN

This extension does not connect to a vendor cloud. It only talks to the UMPIRE server URL you configure. No analytics, no third-party telemetry, no account with us.

PERMISSIONS

• Storage — save your server URL and notification preferences locally
• Alarms — poll your server when the live stream is unavailable
• Notifications — show local OS alerts for outages and recovery
• Site access (optional) — requested only for the UMPIRE origin you enter in Options, so the extension can call your server's API

GETTING STARTED

1. Deploy UMPIRE (API + web UI) on a server you control
2. Install this extension
3. Open Options and set your UMPIRE base URL (use https:// if your server redirects HTTP)
4. Allow site access when prompted
5. Sign in from the popup if your server requires authentication
6. Pin the extension and optionally send a test notification from Options

Learn more about UMPIRE: https://github.com/khkwan0/umpire
```

## Chrome detailed description (max 16000 characters)

```text
REQUIRES YOUR OWN UMPIRE SERVER

UMPIRE is a self-hosted monitoring platform you deploy on infrastructure you control. This extension is a companion client — not a standalone monitoring product. It does not monitor websites, run checks, or send alerts on its own.

You must already run UMPIRE (API + web UI) on your own server, Docker host, or local machine. The extension connects to your server's HTTP API using the same base URL you use for the web dashboard.

If you do not run UMPIRE yet, start here: https://github.com/khkwan0/umpire

WHAT THIS EXTENSION DOES

UMPIRE (Universal Monitoring Plugin & Incident Reporter) is open-source uptime and incident monitoring for operators who want full control over their data and infrastructure. This browser extension keeps you informed without keeping a dashboard tab open.

After you point it at your UMPIRE base URL (for example https://monitor.example.com or https://host/umpire), the extension:

• Shows a toolbar badge with the live count of unhealthy targets (down + partial)
• Opens a popup dashboard listing targets, status, last-check age, and open incidents
• Sends desktop notifications when targets go down, become partial, or recover (optional)
• Stays up to date via the UMPIRE live event stream, with automatic polling fallback

Click Open UI in the popup to jump straight to the full UMPIRE web dashboard for deeper management — targets, groups, checks, notifiers, settings, and the monitoring assistant.

FEATURES

Toolbar badge
See at a glance how many targets need attention. The badge updates as your server reports changes.

Popup health view
• Summary counts: up, down, partial
• Per-target status with last-check age
• Open incidents when outages are active
• Refresh on demand
• Quick link to extension settings and test notifications

Desktop notifications
Optional OS-level alerts when a target transitions between healthy and unhealthy states. Configure outage and recovery notifications separately. Send a test notification anytime to verify your browser and OS settings.

Live updates
The extension listens to your server's event stream (SSE) for near-real-time updates. If the stream is unavailable, a background poll keeps the badge and popup current.

Authentication
If your UMPIRE server requires login, sign in from the popup with the same username and password as the web UI. The extension uses the standard UMPIRE session cookie. Log out from the popup when done. If your server allows read-only access without signing in, the extension works without a login. API tokens are not used in the extension — session login only.

SELF-HOSTED BY DESIGN

This extension does not connect to a vendor cloud, analytics service, or third-party telemetry endpoint. It only communicates with the UMPIRE server URL you configure. No account with the extension author is required. No data is sold or shared.

Privacy policy: https://github.com/khkwan0/umpire/blob/master/extensions/store/PRIVACY.md

PERMISSIONS EXPLAINED

• Storage — Saves your server URL, notification preferences, and a small health cache locally on your device
• Alarms — Schedules periodic refresh when the live event stream is unavailable
• Notifications — Shows local desktop alerts for outages and recovery (when enabled)
• Site access (optional) — Requested only for the UMPIRE origin you enter in extension settings, so the extension can call your server's API. It does not read or modify content on other websites.

GETTING STARTED

1. Deploy UMPIRE (API + web UI) on a server you control
2. Install this extension
3. Open Extension settings from the popup footer (or right-click the toolbar icon → Options)
4. Set your UMPIRE base URL — use https:// if your server redirects HTTP
5. Allow site access when prompted
6. Sign in from the popup if your server requires authentication
7. Pin the extension to your toolbar and optionally send a test notification

WHO IT'S FOR

• Homelab and self-hosted operators running UMPIRE
• Small teams monitoring their own infrastructure
• Developers who want outage alerts without a dashboard tab always open
• Anyone who prefers open-source, self-hosted monitoring over SaaS uptime tools

SUPPORT & SOURCE

Homepage: https://github.com/khkwan0/umpire
Support / issues: https://github.com/khkwan0/umpire/issues
Extension source: https://github.com/khkwan0/umpire/tree/master/extensions
```

Paste manually into the Chrome Web Store listing — this file is not synced automatically.

## Category

Productivity (Chrome) / Developer Tools (alternative)

## Permission justifications (Chrome Web Store)

Paste into the **Privacy practices** / reviewer notes fields as needed.

### storage

Save the user's configured UMPIRE server URL, notification preferences, and cached health snapshot locally on the device.

### alarms

Schedule periodic refresh when the UMPIRE live event stream (SSE) is unavailable, so the toolbar badge stays current.

### notifications

Display local desktop notifications when a monitored target transitions between healthy and unhealthy states (if enabled in Options).

### host permissions (optional)

The user enters their self-hosted UMPIRE server URL in Options. The extension requests access only to that origin so it can call UMPIRE HTTP APIs (`/api/status`, `/api/incidents`, `/api/stream`, auth endpoints). It does not browse arbitrary websites or read page content. HTTPS covers production deployments; localhost patterns support local development.

## Single purpose description (Chrome)

Companion client for a user-deployed UMPIRE monitoring server (API required). Displays target health from that server with optional desktop outage notifications.

## Firefox add-on ID

`umpire@nitroxstudios.com` (set in `wxt.config.ts` — do not change after publishing)

## Screenshots

Store-ready PNGs are in [`screenshots/`](screenshots/). Re-capture from a live install if you change the UI:

```bash
cd extensions
npm run store:screenshots:all
```

Chrome and Firefox accept **1280×800** or **640×400** screenshots. Include at least:

1. Popup with target list (`01-popup-dashboard.png`)
2. Options / configuration (`02-options.png`)
3. Notification example (`03-notifications.png`)

Optional extras (web UI opened from the popup): `04-web-dashboard.png`, `05-web-agent.png`, `06-web-settings.png`.

To prep from raw captures placed in `store/screenshots/source/`:

```bash
cd extensions
npm run store:screenshots:prep:all
```

## Release checklist

1. `npm run store:release` — auto-bumps patch version in `package.json` + `wxt.config.ts`, then builds both store zips
2. Upload zips from `.output/` to each store dashboard
3. Paste listing copy and permission justifications from this file
4. Attach screenshots from `store/screenshots/`
5. Link privacy policy URL

Optional: `npm run version:bump -- --minor` (or `--major`, `--dry-run`) before a manual build.
