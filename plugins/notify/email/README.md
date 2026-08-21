# `email` (notifier plugin)

Sends alerts by email using **sendmail** or **SMTP**.

## Usage

### Enable

1. Listed in [`api/plugins.json`](../../../api/plugins.json) (loaded, **disabled** by default).
2. **Settings → Plugin manager** → enable **email**.

### Configure

**Global defaults:**

| Where | Path |
|-------|------|
| UI | **Notifiers → Email** (`/plugins/notify/email`) |
| Sidecar | `data/email.json` |
| API | `GET/PUT /api/plugins/notify/email/config` |
| Test | `POST /api/plugins/notify/email/test` |

Fields:

| Field | Notes |
|-------|-------|
| `mode` | `sendmail` or `smtp` |
| `from` | Sender address |
| `to` | Array of recipient addresses |
| `sendmailPath` | Path to sendmail binary (sendmail mode; default from env) |
| `smtp` | `host`, `port`, `secure`, `username`, `password` (smtp mode) |

**Per-target override:** **Targets → email settings** or API `…/targets/:targetId/config`.

**Ready:**

- **sendmail:** valid `from` and non-empty `to[]`
- **smtp:** above plus complete `smtp.host`, `smtp.port`, `smtp.username`, `smtp.password`

### Sendmail mode

Uses `SENDMAIL_PATH` (default `sendmail`) to pipe the message. The API container/host must have sendmail or compatible MTA installed.

### SMTP mode

Connects directly to your SMTP server (TLS optional via `smtp.secure`).

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins/notify/email/config` | Global config |
| PUT | `/api/plugins/notify/email/config` | Save global config |
| POST | `/api/plugins/notify/email/test` | Test global config |
| GET | `/api/plugins/notify/email/overrides` | Target ids with overrides |
| GET | `/api/plugins/notify/email/targets/:targetId/config` | Effective + override |
| PUT | `/api/plugins/notify/email/targets/:targetId/config` | Save override |
| DELETE | `/api/plugins/notify/email/targets/:targetId/config` | Clear override |
| POST | `/api/plugins/notify/email/targets/:targetId/test` | Test effective config |

Core check allowlist: `GET/PUT /api/targets/:id/notifiers/email/check-ids`.

## Storage

| File / env | Purpose |
|------------|---------|
| `data/email.json` | Global email settings |
| `SENDMAIL_PATH` | Sendmail binary (default `sendmail`) |

## For developers

```text
plugins/notify/email/
  index.ts
  config.ts
  send.ts      # sendmail pipe or nodemailer-style SMTP
  routes.ts
  ui/
```

See also: [Plugin developer guide](../../../docs/plugins.md).
