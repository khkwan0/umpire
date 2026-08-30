# Store screenshots

## Included mockups

HTML templates in [`mockups/`](mockups/) mirror the extension UI at **1280×800** (Chrome Web Store / Firefox recommended size).

## Generate PNGs

From the `extensions/` directory (run **`npm install` first** so scripts and the local Playwright version are available):

```bash
cd extensions
npm install
npm run store:screenshots:all
```

Or in two steps:

```bash
npm run playwright:install   # once per machine (downloads Chromium)
npm run store:screenshots    # render mockups → PNGs
```

Do **not** use bare `npx playwright install` before `npm install` — that can pull a different Playwright version than the project and skip the npm scripts.

Optional system deps (Linux, first time only): `npx playwright install-deps chromium` (may prompt for sudo).

Output:

- `01-popup-dashboard.png`
- `02-options.png`
- `03-notification.png`

## Manual capture (recommended before release)

Mockups are close to the real UI but stores prefer **actual extension screenshots**:

1. `npm run build` and load unpacked in Chrome
2. Configure a demo UMPIRE server with a few targets
3. Capture popup, options, and a real desktop notification at **1280×800**

Use OS screenshot tools or a browser window sized to 1280×800.
