# Store screenshots

Chrome and Firefox accept **1280×800** or **640×400** PNGs.

## Store-ready outputs

| File | Description |
|------|-------------|
| `01-popup-dashboard.png` | Extension popup (from your capture) |
| `02-options.png` | Extension options page (mockup until you capture the real page) |
| `03-notifications.png` | Desktop notification example (mockup until you capture a real toast) |
| `04-web-dashboard.png` | UMPIRE web dashboard (optional extra) |
| `05-web-agent.png` | Monitoring assistant chat (optional extra) |
| `06-web-settings.png` | Server settings page (optional extra) |

Minimum for upload: **01–03**. Attach **04–06** as additional gallery images if the store allows.

## Prep from your captures

1. Drop raw PNG/JPEG captures into [`source/`](source/):
   - `popup.png` — extension toolbar popup
   - `web-dashboard.jpg` — full dashboard (from **Open UI**)
   - `web-agent.jpg` — Agent tab with chat sidebar
   - `web-settings.jpg` — Settings tab
2. From `extensions/`:

```bash
npm install
npm run store:screenshots:prep:all
```

This crops dark margins, redacts the nav username, composites marketing copy, and writes PNGs here.

## Mockups only (no raw captures)

HTML templates in [`mockups/`](mockups/) mirror the extension UI. Regenerate placeholder PNGs:

```bash
cd extensions
npm install
npm run store:screenshots:all
```

Do **not** use bare `npx playwright install` before `npm install` — that can pull a different Playwright version than the project.

Optional system deps (Linux, first time only): `npx playwright install-deps chromium` (may prompt for sudo).

## Manual capture tips

Before release, replace mockups **02** and **03** with real extension screenshots:

1. `npm run build` and load unpacked in Chrome
2. Configure a demo UMPIRE server with a few targets
3. Capture popup, **extension options** (`chrome-extension://…/options.html`), and a real desktop notification at **1280×800** (or drop raw captures in `source/` and rerun prep)
