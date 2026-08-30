# UMPIRE extension — store listing copy

Use this file when submitting to the **Chrome Web Store**, **Firefox Add-ons (AMO)**, and **Edge Add-ons**.

## URLs

| Field | URL |
|-------|-----|
| Homepage | https://github.com/khkwan0/umpire |
| Support | https://github.com/khkwan0/umpire/issues |
| Privacy policy | https://github.com/khkwan0/umpire/blob/main/extensions/store/PRIVACY.md |
| Source | https://github.com/khkwan0/umpire/tree/main/extensions |

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
3. Notification example (`03-notification.png`)

## Release checklist

1. Bump `version` in `extensions/package.json` and `extensions/wxt.config.ts`
2. `npm run icons && npm run compile && npm run zip && npm run zip:firefox`
3. Upload zips to each store dashboard
4. Paste listing copy and permission justifications from this file
5. Attach screenshots from `store/screenshots/`
6. Link privacy policy URL
