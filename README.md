# ChaosOps OS

A single-purpose, locked-down Linux appliance that boots straight into the
ChaosOps kiosk display. **Built on Arch Linux** (Arch Linux ARM on the Pi) and
branded end-to-end with the ChaosOps design system. Its only job: connect to
WiFi (QR / code) and then show the ChaosOps display — nothing else.

- **Architecture & contracts:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Build an image:** `make image-x86_64` / `make image-rpi4-aarch64` (see [`image/README.md`](image/README.md))
- **Lockdown:** [`os/README.md`](os/README.md)

## Layout
| Dir | What |
|-----|------|
| `kiosk-shell/` | Branded local web UI: WiFi onboarding (QR + code) → ChaosOps display. |
| `wifi-agent/`  | Local Node service: NetworkManager control, HTTP API, hotkey daemon. |
| `os/`          | The ChaosOps layer on top of Arch: package lists, the `rootfs/` overlay (units, lockdown, Plymouth, cage/Chromium session) and the in-chroot `customize.sh`. |
| `image/`       | Builder: Arch base → packages → overlay → customize → raw disk image, per board. |
| `scripts/`     | Dev helpers (`run-qemu.sh`). |

## Boards
| Board | Base | Output |
|-------|------|--------|
| `x86_64` | Arch Linux (`linux`, systemd-boot, UEFI) | `out/chaosops-os-x86_64.img` (GPT, `dd` to SSD/USB) |
| `rpi4-aarch64` | Arch Linux ARM (mainline `linux-aarch64`) | `out/chaosops-os-rpi4-aarch64.img` (SD card) |
