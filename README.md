# ChaosOps OS

A single-purpose, locked-down Linux appliance (x86-64) that boots straight into the
ChaosOps kiosk display. Branded end-to-end with the ChaosOps design system. Its only
job: connect to WiFi (QR / code) and then show the ChaosOps display — nothing else.

- **Architecture & contracts:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Build the image:** `make image` (see [`image/README.md`](image/README.md))

## Layout
| Dir | What |
|-----|------|
| `kiosk-shell/` | Branded local web UI: WiFi onboarding (QR + code) → ChaosOps display. |
| `wifi-agent/`  | Local Node service: NetworkManager control, HTTP API, hotkey daemon. |
| `image/`       | Reproducible x86-64 bootable image builder (Debian minimal). |
| `os/`          | Everything baked in: Plymouth splash, GRUB, cage/Chromium session, systemd, lockdown. |
| `docs/`        | Architecture and design docs. |
