# UMPIRE browser extension — privacy policy

Last updated: 2026-08-30

## Summary

The UMPIRE browser extension is a client for **your own** UMPIRE monitoring server. It does not send data to Nitrox Studios, the extension author, or any other third-party service.

## Data the extension stores locally

On your device, the extension saves:

- Your configured UMPIRE **base URL**
- Notification preferences (outage/recovery toggles, poll interval)
- A small cache of target health used for badge updates and transition detection

This data stays in browser extension storage (`chrome.storage.local` / equivalent). It is not uploaded elsewhere.

## Data the extension transmits

The extension makes HTTP requests **only** to the UMPIRE server URL you configure, using the same APIs as the UMPIRE web dashboard (status, incidents, auth, event stream).

If you enable authentication on your server, the extension uses session cookies for your login, the same as the web UI.

The extension does **not**:

- Collect analytics or telemetry
- Sell or share personal data
- Read or modify content on websites other than API calls to your configured UMPIRE origin

## Notifications

Outage and recovery alerts are shown through your operating system's notification system. Notification content includes target hostnames and error messages from your UMPIRE server.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save settings and health cache locally |
| `alarms` | Refresh when the live stream is unavailable |
| `notifications` | Show desktop alerts (optional) |
| Host access (optional) | Call your UMPIRE server's API at the URL you provide |

## Contact

Questions or issues: [GitHub Issues](https://github.com/khkwan0/umpire/issues)

Source code: [github.com/khkwan0/umpire](https://github.com/khkwan0/umpire)
