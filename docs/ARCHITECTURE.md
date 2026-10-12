# ChaosOps OS — Architecture Contract

A single-purpose, locked-down Linux appliance whose **only** job is to boot straight
into the ChaosOps kiosk display. Target hardware: **generic x86-64 mini-PC / NUC** (UEFI) and **Raspberry Pi 4**.
Base OS: **Arch Linux** (Arch Linux ARM on the Pi) — ChaosOps OS is Arch plus a
thin, declarative layer (`os/`). Deliverable: a **raw, `dd`-able disk image** per
board, built reproducibly from this repo.

The device must be un-escapable by a normal user: no desktop, no shell, no window
chrome, no VT switching, no browser UI. Two global hotkeys are the only affordances.

---

## Boot → run flow (what the user sees)

1. **Power on** → systemd-boot with no menu/editor (Pi: firmware), quiet boot (no kernel text).
2. **Plymouth splash** → animated ChaosOps boot (logo pop-in, progress bar with a hopping gremlin) in the light palette the kiosk UI uses; sleeping-gremlin animation on shutdown. No console.
3. **Auto-login** to an unprivileged, restricted user → a Wayland kiosk compositor
   (`cage`) launches Chromium (kiosk flags) full-screen. Nothing else runs.
4. Chromium opens the **local kiosk-shell** at `http://127.0.0.1:8080/`.
5. kiosk-shell decides:
   - **Offline / no WiFi** → WiFi-onboarding screen: branded, shows a **QR code + a
     short human code** to connect, plus an on-device network picker.
   - **Online** → the ChaosOps **web display** (`/register-display` on the configured
     ChaosOps host) which itself handles product-level display pairing (QR/code).
6. Hotkeys (see below) let an operator open the WiFi menu or reset the kiosk.

---

## Components & directory ownership (parallel-safe boundaries)

Each top-level dir is owned by one workstream. Do NOT edit another workstream's dir;
communicate across the boundary only through the contracts below.

### `kiosk-shell/`  — branded local web UI  (workstream B)
- Vite + React + **`@chaos-ops-de/design`** (react-native-web target). All branding,
  fonts, colors, gremlin mascots come from the design package — no bespoke styling.
- Screens: (a) **WiFi onboarding** (QR + short code + network list + connect form),
  (b) **connecting/error** states (use design gremlins), (c) **online →** navigate the
  top-level browser to the ChaosOps display URL.
- Served locally as static files by the wifi-agent (see contract). Talks to the
  wifi-agent HTTP API on `127.0.0.1:8080` for all network state/actions.
- Config injected at runtime: `CHAOSOPS_DISPLAY_URL` (default
  `https://app.chaos-ops.de/register-display`), served via `/api/config`.
- Design pkg source lives at `../chaosops-design` (workspace) — reference the existing
  ChaosOps client kiosk pages under `../ChaosOps/src/pages/Display/*` for UX parity.

### `wifi-agent/`  — local network+control service  (workstream C)
- Small service (Node 20, no heavy deps) run by systemd as a hardened unit. Owns:
  - **HTTP API on `127.0.0.1:8080`** (also serves kiosk-shell static build):
    - `GET  /api/status` → `{ online: bool, connected: bool, ssid, ip, deviceCode }`
    - `GET  /api/networks` → `[{ ssid, signal, secured }]` (nmcli scan)
    - `POST /api/connect` `{ ssid, psk }` → connect via NetworkManager
    - `POST /api/forget` → drop saved connections (used by reset)
    - `GET  /api/onboarding` → `{ qrPayload, humanCode }` for the QR + code shown offline
    - `GET  /api/config` → `{ displayUrl }`
    - `GET  /api/display-check` → `{ displayUrl, ok, reason?, detail? }` — can the shell
      frame the display right now? (`reason`: `unreachable` | `http-error` | `frame-blocked`).
      The shell only mounts the display iframe when `ok`, else shows a branded screen.
  - **NetworkManager** control via `nmcli` (device has NM installed; no AP/captive
    portal in v1 — on-device picker + QR that opens the same onboarding UX; keep the
    `qrPayload` field so an AP-onboarding flow can be added later without a UI change).
  - **Hotkey daemon**: listens for the two global chords and acts:
    - **WiFi menu chord** → tell kiosk-shell to show the WiFi menu (e.g. localhost
      signal / navigate Chromium to `/#wifi`).
    - **Reset chord** → `POST /api/forget` + return kiosk to onboarding (clear Chromium
      state, reload to `/`). "Reset" = back to the connect-via-QR/code screen.
  - Define the exact chords in `wifi-agent/README.md` and keep them consistent with
    what the onboarding UI tells the user. Suggested: `Ctrl+Alt+W` (WiFi), `Ctrl+Alt+R`
    (reset) — must work under cage/Wayland (libinput). Document the mechanism.

### `image/` + `os/`  — Arch-based image build + session/lockdown  (workstream A)
- `os/` is the ChaosOps layer on top of Arch — nothing else is custom:
  - `os/packages/{common,<board>}.txt` — the only packages installed (from the
    official Arch / Arch Linux ARM repos): `cage`, `chromium`, `plymouth`,
    `networkmanager`, `nodejs`, `mesa`, kernel + firmware.
  - `os/rootfs/` — overlay copied verbatim onto `/`: systemd units, logind /
    sysctl / modprobe / polkit lockdown, PAM stack for the kiosk session, sysusers,
    mkinitcpio config, Plymouth theme, cage/Chromium launcher + managed policy, and
    the prebuilt kiosk-shell snapshot.
  - `os/customize.sh` — runs in the target chroot: users, enable/mask units, lock
    root, Plymouth theme, initramfs.
- `image/build.sh <board>` — base tarball (Arch bootstrap → `pacstrap`, or the
  Arch Linux ARM Pi tarball) → packages → overlay → customize → raw disk image
  (`mkfs.ext4 -d`/mtools/sfdisk; no loop devices). Board specifics (partition
  layout, bootloader, kernel cmdline) live in `image/boards/<board>.sh`.
  `make image-<board>` wraps it in a privileged Docker container so it runs on any
  Docker host; CI builds both boards natively.
- Lockdown checklist lives in `os/README.md`: no TTYs, no Ctrl-Alt-Fn, no Chromium
  address bar, no right-click, USB storage off, no SSH, root locked, only the two
  hotkeys reach the agent.

---

## Cross-component contracts (freeze these; don't drift)
- kiosk-shell ⇄ wifi-agent: the HTTP API above on `127.0.0.1:8080`. wifi-agent serves
  the built kiosk-shell as static files at `/`.
- Display URL: `CHAOSOPS_DISPLAY_URL` env on the agent → `/api/config.displayUrl`
  (default `https://app.chaos-ops.de/register-display`; overridable per-image).
- Hotkeys: defined once in `wifi-agent/README.md`, surfaced to the user by kiosk-shell.
- "Reset kiosk" = forget WiFi + return to the connect (QR/code) screen. It does NOT
  wipe the OS.

## Out of scope for v1
- No extra apps, no updates UI, no telemetry, no captive-portal AP mode (keep the
  `qrPayload` seam for it), no user accounts beyond the single restricted kiosk user.

## Non-negotiables
- Branding is 100% from `@chaos-ops-de/design`. No ad-hoc colors/fonts.
- The user cannot escape the kiosk. Verify the lockdown explicitly.
- Everything reproducible from this repo: `make image` produces the bootable artifact.
