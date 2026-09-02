# ChaosOps OS — the baked-in OS layer & lockdown

Everything in `os/` is copied onto the image by `image/build.sh`. This is the
appliance's confinement: a normal person standing at the kiosk with a keyboard
and mouse cannot escape to a shell, another app, or the OS.

## Boot → session
1. **GRUB** (`grub/99-chaosops.cfg`, installed-to-disk case) — hidden, `timeout 0`,
   `quiet splash loglevel=0`, no recovery, no os-prober, no menu edit. The live
   ISO/USB menu is zeroed separately by `image/config/hooks/normal/0200-hide-boot-menu.hook.binary`.
2. **Plymouth** (`plymouth/chaosops/`) — branded ChaosOps splash owns the screen
   from kernel hand-off until the kiosk paints. Set as the default theme by the
   chroot hook.
3. **Kiosk session** (`systemd/chaosops-kiosk.service` → `cage/chaosops-kiosk`) —
   the unprivileged `kiosk` user auto-owns `tty1` via a PAM/TTY systemd service
   (no getty, no display manager). It launches **cage** (single-window Wayland
   compositor) running **Chromium `--kiosk`** pointed at `http://127.0.0.1:8080/`.
4. **wifi-agent** (`systemd/wifi-agent.service`) starts first; the launcher waits
   for `:8080` to answer before Chromium loads, so a broken page never shows.

## Lockdown checklist — why the user can't break out
| Escape vector | Blocked by |
|---------------|-----------|
| Drop to a TTY (Ctrl-Alt-F1…F6) | `logind-chaosops.conf`: `NAutoVTs=0`, `ReserveVT=0`; hook masks `getty@tty1` and all gettys. No spare VTs exist to switch to. |
| Magic SysRq (Alt-SysRq-*) | `sysctl-99-chaosops.conf`: `kernel.sysrq = 0`. |
| Chromium address bar / new tab / other URLs | `cage --kiosk` has no browser chrome; `chromium-policy.json` `URLAllowlist` = only `127.0.0.1:8080` + `*.chaos-ops.de`, everything else blocked, `chrome://`/`file://`/`view-source:` blocked. |
| DevTools (F12) | policy `DeveloperToolsAvailability: 2` (disabled). |
| Right-click / context menu, downloads, printing, file dialogs | Chromium policy: downloads blocked (`DownloadRestrictions: 3`), `AllowFileSelectionDialogs:false`, `PrintingEnabled:false`; the shell also suppresses the context menu. |
| Incognito / guest / add-person / extensions | Chromium policy all disabled/blocklisted. |
| History back/forward swipe out of the app | cage launcher passes `--overscroll-history-navigation=0` + disables the gesture features. |
| Boot a USB stick to exfiltrate / mount storage | `modprobe-chaosops.conf` blacklists `usb_storage` + `uas` (USB **HID** keyboards still work for the operator chords). |
| Remote entry (SSH / serial) | hook masks `ssh.service` + `serial-getty@ttyS0`; SSH isn't even installed. |
| Kernel info leak to the kiosk user | `sysctl`: `dmesg_restrict=1`, `kptr_restrict=2`. |
| Take network control / reconfigure WiFi from the UI | `polkit-50-chaosops-nm.rules`: **only** the `chaosops-agent` service user may drive NetworkManager. The `kiosk` user has no network privileges. |
| Physical power/lid/suspend keys | `logind-chaosops.conf`: power = clean poweroff, suspend/hibernate/lid = ignore. |
| Privilege escalation from a compromised agent | `wifi-agent.service` / `chaosops-hotkeyd.service` run as an unprivileged system user with `NoNewPrivileges`, `ProtectSystem=strict`, empty `CapabilityBoundingSet`, `SystemCallFilter=@system-service`, and a narrow `RestrictAddressFamilies`. |

## The two operator hotkeys (the only affordances)
Handled by `chaosops-hotkeyd.service` (reads evdev via libinput as the agent
user) — see `wifi-agent/README.md` for the exact chords and mechanism:
- **Ctrl+Alt+W** → open the WiFi menu (agent broadcasts `open-wifi-menu`; the
  kiosk-shell shows the onboarding/network screen over the display).
- **Ctrl+Alt+R** → reset the kiosk (agent forgets saved WiFi and broadcasts
  `reset`; the shell returns to the connect-via-QR/code screen).

## Note on the online display + hotkeys
So the hotkeys keep working while the ChaosOps display is showing, the kiosk-shell
keeps the top browser frame and embeds the display in an `<iframe>` rather than
navigating away. That requires the display route to permit framing from the
kiosk origin — see the "Known follow-up" in `image/README.md`.
