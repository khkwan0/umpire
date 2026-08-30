# UMPIRE browser extensions

Chrome (MV3) and Firefox (MV3) **companion** extensions that connect to a **UMPIRE server you host** (API + web UI). This extension does not monitor anything by itself — you must run UMPIRE separately.

Once connected, the extension can:

- Sign in when the server requires authentication (session cookie, same as the web UI)
- Show target health in a popup and on the toolbar badge
- Fire desktop notifications when a target goes down/partial or recovers

One TypeScript codebase, built with [WXT](https://wxt.dev/).

## Setup

```bash
cd extensions
npm install
```

### Development

```bash
npm run dev            # Chrome
npm run dev:firefox    # Firefox MV3
```

### Production builds

```bash
npm run build          # → .output/chrome-mv3/
npm run build:firefox  # → .output/firefox-mv3/
```

Load unpacked:

- **Chrome:** `chrome://extensions` → Developer mode → Load unpacked → `.output/chrome-mv3`
- **Firefox:** `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `.output/firefox-mv3/manifest.json`

## Configure

1. Open the extension **Options** page.
2. Set **UMPIRE base URL** to the same URL you use for the web UI (for example `http://localhost:8089`, or `https://host/umpire` if you deploy with `BASE_PATH`).
3. Grant site access when prompted.
4. Optionally enable/disable outage and recovery notifications and adjust the poll interval (backup when the SSE stream is asleep).

## How it works

| Piece | Behavior |
|-------|----------|
| Auth | `GET /api/auth/policy` → login form when `login_required`; session cookie `umpire_session` via `credentials: 'include'` |
| Health | `GET /api/status` for the popup list and badge counts |
| Incidents | `GET /api/incidents` for open outages in the popup |
| Live updates | Best-effort `EventSource` on `/api/stream`; `chrome.alarms` / `browser.alarms` poll as fallback |
| Notifications | Local OS notifications on healthy→unhealthy and unhealthy→healthy transitions |

The extension does **not** use the `/api/ws` HTTP bridge (that is RPC, not a push channel). It does not register FCM tokens; server-side notifiers stay separate.

## Permissions

- `storage`, `alarms`, `notifications`
- Optional host access to the UMPIRE origin you configure (requested when you save Options). Production servers use HTTPS; localhost is supported for development.

## Publishing

Store listing copy, privacy policy, permission justifications, and screenshots live in [`store/`](store/).

```bash
npm run zip          # Chrome upload zip
npm run zip:firefox  # Firefox upload zip
npm run store:screenshots  # regenerate 1280×800 PNGs from mockups
npm run store:screenshots:prep  # composite raw captures in store/screenshots/source/
```

See [`store/LISTING.md`](store/LISTING.md) for short/long descriptions, support URLs, and the release checklist.

## Layout

```text
extensions/
  src/
    entrypoints/
      background.ts   # badge, SSE/poll, notifications
      popup.html      # login + health UI
      options.html    # base URL + notification prefs
    utils/            # API client, storage, health helpers
  public/icon/
    icon.svg          # source artwork (brand #225a80 + umpire mark)
    16.png … 128.png  # generated via npm run icons
  scripts/build-icons.mjs
  wxt.config.ts
```

Icons use the same umpire mark as the web UI (`web/public/umpire_logo.svg`). Edit `public/icon/icon.svg`, then run `npm run icons` before building.
