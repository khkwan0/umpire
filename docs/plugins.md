# Plugin developer guide

Multi-chapter guide for writing UMPIRE **check**, **scheduler**, **notifier**, and **auth** plugins.

**Start here:** **[docs/plugins/README.md](plugins/README.md)**

## Chapters

| # | Chapter |
|---|---------|
| 1 | [Framework overview](plugins/01-framework.md) — core vs plugins, pipeline, lifecycle |
| 2 | [Contracts reference](plugins/02-contracts.md) — hard vs soft contracts |
| 3 | [Check plugins](plugins/03-check-plugins.md) — hello world → HTTP/keyword examples |
| 4 | [Notifier plugins](plugins/04-notifier-plugins.md) — hello world → webhook/FCM patterns |
| 5 | [Scheduler plugins](plugins/05-scheduler-plugins.md) — when to replace `interval` |
| 6 | [HTTP routes & UI](plugins/06-routes-and-ui.md) — `registerRoutes`, React pages, widgets |
| 7 | [Registration & testing](plugins/07-registration-and-testing.md) — wiring, verify, tests |
| 8 | [Auth plugins](plugins/08-auth-plugins.md) — rbac reference, `AuthPlugin` contract, open mode |

Operator setup lives in [`README.md`](../README.md). Changing the host: **[Core developer guide](core.md)**.

Shipped plugin index: [`plugins/README.md`](../plugins/README.md).
