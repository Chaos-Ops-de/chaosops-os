# wifi-agent

The ChaosOps OS local control service. Two processes, both plain Node (**zero npm
dependencies** — only Node built-ins), run as the unprivileged `chaosops-agent`
user:

- **`src/server.js`** — HTTP API + static file server on `127.0.0.1:8080`.
- **`src/hotkeyd.js`** — global hotkey daemon (reads evdev directly).

Deployed to `/opt/chaosops/wifi-agent/` on the image; started by
`wifi-agent.service` and `chaosops-hotkeyd.service` (see `../os/`).

## HTTP API (frozen contract — `docs/ARCHITECTURE.md`)
Served on `127.0.0.1:8080`; also serves the built kiosk-shell (`KIOSK_SHELL_DIR`)
as static files at `/`.

| Method + path | Returns / does |
|---|---|
| `GET /api/status` | `{ online, connected, ssid, ip, deviceCode }` |
| `GET /api/networks` | `[{ ssid, signal, secured }]` (nmcli scan) |
| `POST /api/connect` `{ ssid, psk }` | join a network via NetworkManager |
| `POST /api/forget` | drop saved connections |
| `GET /api/onboarding` | `{ qrPayload, humanCode }` for the offline QR + code |
| `GET /api/config` | `{ displayUrl }` (from `CHAOSOPS_DISPLAY_URL`) |
| `GET /api/events` | **SSE** stream; frames `{"type":"open-wifi-menu"}` / `{"type":"reset"}` |
| `POST /api/hotkey` `{ chord }` | internal — the hotkey daemon calls this; `wifi`→broadcast `open-wifi-menu`, `reset`→forget WiFi + broadcast `reset` |

Networking goes through a thin backend abstraction (`src/nm/`): `nmcli.js` (real
NetworkManager) or `mock.js` (in-memory, for macOS dev + tests). Select with
`CHAOSOPS_NM_BACKEND=mock|nmcli` (defaults to `nmcli` on Linux, `mock` elsewhere).

## The two operator hotkeys
Defined once, here, and surfaced to the user by the kiosk-shell:

| Chord | Action |
|-------|--------|
| **Ctrl + Alt + W** | Open the WiFi menu (agent broadcasts `open-wifi-menu`; the shell overlays the onboarding/network screen). |
| **Ctrl + Alt + R** | Reset the kiosk — agent forgets saved WiFi and broadcasts `reset`; the shell returns to the connect-via-QR/code screen. |

**Mechanism:** under cage/Wayland there is no global-hotkey API and Chromium would
swallow key events, so `hotkeyd` reads the kernel evdev devices
(`/dev/input/event*`) directly — one layer *below* the compositor — which makes
the chords global and un-swallowable. It needs read access to `/dev/input`
(granted by membership in the `input` group; the unit also sets
`DeviceAllow=char-input r`). It hot-plugs devices (5 s rescan) and debounces.

## Environment
| Var | Default | Meaning |
|-----|---------|---------|
| `PORT` | `8080` | API/static port (loopback only) |
| `CHAOSOPS_DISPLAY_URL` | `https://app.chaos-ops.de/register-display` | display URL surfaced via `/api/config` |
| `KIOSK_SHELL_DIR` | `/opt/chaosops/kiosk-shell` | static build to serve at `/` |
| `CHAOSOPS_NM_BACKEND` | `nmcli` (Linux) / `mock` | NetworkManager backend |
| `CHAOSOPS_AGENT_URL` | `http://127.0.0.1:8080` | where `hotkeyd` posts chords |
| `CHAOSOPS_HOTKEY_BACKEND` | `evdev` (Linux) / `stdin` | hotkey input source (`stdin` mock types `wifi`/`reset`) |

Per-image overrides go in `/etc/chaosops/wifi-agent.env` (both units load it via
`EnvironmentFile=-`).

## Develop / test
```sh
npm test                 # smoke tests (mock NM backend)          → 9/9
npm run start:mock       # server on :8080 with the mock backend
CHAOSOPS_HOTKEY_BACKEND=stdin npm run hotkeyd   # type wifi/reset + Enter
```
