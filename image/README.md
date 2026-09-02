# Building the ChaosOps OS image

Produces a bootable **x86-64 hybrid ISO** (`image/out/chaosops-os-amd64.iso`) you
can `dd` to a USB stick and boot on any Intel/AMD mini-PC or NUC. Built with
Debian `live-build` inside a privileged Docker container, so the build runs on
any Docker host (Linux natively, or macOS/Windows via Docker Desktop).

## Prerequisites
- **Docker** (Desktop on macOS/Windows, or engine on Linux).
- The build must run **`--privileged`** — `live-build` uses `debootstrap`, loop
  mounts and `mknod`. `make image` already passes the flag.
- Node.js on the host (only for the `make shell` step, which builds the UI; it
  needs the sibling `../chaosops-design` package present — the normal monorepo
  layout).
- ~10 GB free disk and a network connection (the build downloads a Debian base).

## Build
```sh
make image
```
This runs, in order:
1. `make shell` — `npm install && npm run build` in `kiosk-shell/` → `kiosk-shell/dist/`.
2. `docker build` the live-build container (`image/Dockerfile`).
3. `docker run --privileged` it → `image/build.sh` assembles the payload from
   `os/` + `kiosk-shell/dist` + `wifi-agent/src` and runs `lb config && lb build`.
4. Copies the ISO to `image/out/chaosops-os-amd64.iso`.

Expect **15–40 min** on the first run (Debian download + squashfs).

## Write to USB
```sh
sudo dd if=image/out/chaosops-os-amd64.iso of=/dev/sdX bs=4M status=progress oflag=sync
```
(replace `/dev/sdX` with the target stick — double-check, this erases it.)

## What it bakes in
| Repo source | On the image | Purpose |
|-------------|--------------|---------|
| `os/plymouth/chaosops/` | `/usr/share/plymouth/themes/chaosops` | Branded boot animation (default theme) |
| `os/grub/99-chaosops.cfg` | `/etc/default/grub.d/` | Hidden, quiet GRUB (installed-to-disk case) |
| `os/systemd/*.service` | `/etc/systemd/system/` | wifi-agent, hotkeyd, kiosk session |
| `os/systemd/*.conf` / `*.rules` | `/etc/{systemd/logind.conf.d,sysctl.d,modprobe.d,polkit-1/rules.d}` | Lockdown (see `os/README.md`) |
| `os/cage/chaosops-kiosk` | `/usr/local/bin/` | cage + Chromium kiosk launcher |
| `os/cage/chromium-policy.json` | `/etc/chromium/policies/managed/` | Chromium managed lockdown policy |
| `kiosk-shell/dist/` | `/opt/chaosops/kiosk-shell` | Branded UI (served by the agent) |
| `wifi-agent/src/` | `/opt/chaosops/wifi-agent` | NM API + hotkey daemon (zero npm deps) |

The chroot hook (`config/hooks/normal/0100-chaosops.hook.chroot`) creates the
`kiosk` and `chaosops-agent` users, enables the services, sets the Plymouth
theme, and masks every getty. The binary hook (`0200-…`) hides the live boot
menu.

## Per-image configuration
Override the display URL (or any agent env) without rebuilding the app by
dropping `/etc/chaosops/wifi-agent.env` on the image:
```
CHAOSOPS_DISPLAY_URL=https://dev.app.chaos-ops.de/register-display
```

## Validation status (honest)
- ✅ **Validated on this machine:** payload assembly logic, all referenced
  `os/` files exist and map to real target paths, `kiosk-shell` builds cleanly
  (`tsc --noEmit` + vite), `wifi-agent` smoke tests pass, all build scripts pass
  `bash -n` / `sh -n`.
- ⏳ **Needs a Docker/Linux host to run:** the actual `lb build` (produces the
  multi-GB ISO) was not executed here (this dev box is macOS without the Docker
  daemon available in-session). The recipe is complete and standard; run
  `make image` on a machine with Docker to produce the artifact.
- 🔎 **Known follow-up:** when online, the kiosk-shell embeds
  `app.chaos-ops.de/register-display` in an `<iframe>` (so the shell keeps the
  top frame and the hotkeys keep working). The display route must therefore
  allow framing from the kiosk origin — i.e. send
  `Content-Security-Policy: frame-ancestors 'self' http://127.0.0.1:8080` (or
  drop `X-Frame-Options: DENY`) for `/register-display`. If the product refuses
  framing, switch the online branch in `kiosk-shell/src/App.tsx` to a full
  `window.location` navigation — but then a "back to WiFi" hotkey needs the
  agent to relaunch Chromium at `http://127.0.0.1:8080/` instead of relying on
  the in-page SSE listener.
