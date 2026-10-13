# ChaosOps OS — the layer on top of Arch Linux

ChaosOps OS is stock Arch Linux (Arch Linux ARM on the Pi) plus exactly what's
in this directory. `image/build.sh` installs the packages, copies `rootfs/` onto
`/`, then runs `customize.sh` inside the target.

| Path | What |
|------|------|
| `packages/common.txt`, `packages/<board>.txt` | Every package on the image (official repos only). |
| `rootfs/` | Overlay copied verbatim onto `/` (see map below). |
| `customize.sh` | In-chroot config: users, units, lockdown, Plymouth, initramfs. |

## Overlay map
| `rootfs/…` | Purpose |
|------------|---------|
| `etc/systemd/system/chaosops-kiosk.service` + `etc/pam.d/chaosops-kiosk` | Kiosk session: `kiosk` user owns tty1 with a logind seat session. |
| `usr/local/bin/chaosops-kiosk` | Waits for the agent, then `cage` → Chromium `--kiosk`. |
| `etc/chromium/policies/managed/chaosops.json` | Chromium managed lockdown policy. |
| `etc/systemd/system/{wifi-agent,chaosops-hotkeyd}.service` | Agent + hotkey daemon (unprivileged, sandboxed). |
| `etc/systemd/system/chaosops-growroot.service` | First boot: grow root partition + ext4 to fill the disk. |
| `usr/lib/sysusers.d/chaosops.conf` | `chaosops-agent` and `kiosk` system users. |
| `etc/systemd/logind.conf.d/`, `etc/sysctl.d/`, `etc/modprobe.d/`, `etc/polkit-1/rules.d/` | Lockdown (table below). |
| `etc/NetworkManager/conf.d/chaosops.conf` | NM owns networking; keyfile profiles persist WiFi. |
| `etc/conf.d/wireless-regdom` | WiFi regulatory domain (`DE`). |
| `usr/lib/systemd/system-preset/10-chaosops.preset` | Keeps systemd's first-boot preset pass consistent with `customize.sh`. |
| `etc/mkinitcpio.conf.d/chaosops.conf` | Generic systemd initramfs with the `plymouth` hook. |
| `usr/share/plymouth/themes/chaosops/` | Animated boot/shutdown splash (`chaosops.script`); images regenerated from the design package by `scripts/make-splash-assets.py`. |
| `opt/chaosops/kiosk-shell/` | Prebuilt kiosk-shell (refresh with `make shell`). `wifi-agent/src` is copied in at build time. |

## Boot → session
1. **Bootloader** — x86_64: systemd-boot, `timeout 0`, `editor no`, no
   auto-entries (no menu, no cmdline editing, no firmware/EFI-shell entries).
   Pi: the firmware boots the mainline kernel directly (no U-Boot text),
   with `disable_splash=1`. The x86 vendor logo in the UEFI firmware is
   outside the OS's reach (some vendors let you flash a custom one).
2. **Plymouth** — the `plymouth` mkinitcpio hook starts the animated ChaosOps
   splash from the initramfs: the logo pops in, then a pill progress bar fills
   with real boot progress while the loading gremlin hops along it. Same cream
   background as the kiosk UI. Shutdown/reboot shows a sleeping gremlin.
3. **Kiosk session** — `chaosops-kiosk.service` runs as the unprivileged `kiosk`
   user on tty1 (PAM session → logind seat), launching **cage** with **Chromium
   `--kiosk`** at `http://127.0.0.1:8080/`.
4. **Hand-off:** the kiosk unit takes the screen over from Plymouth like a
   display manager does (`Conflicts=plymouth-quit.service`). The splash keeps
   animating while it waits for wifi-agent on `:8080`, then
   `plymouth quit --retain-splash` freezes the last splash frame on screen
   until cage modesets. The kiosk-shell's first paint is already the brand
   background. Only Chromium's own startup (about a second on real hardware) shows
   cage's black clear color.
5. **Display:** when online, the shell asks the agent (`/api/display-check`)
   whether the display can be framed and reached. If not, it shows a branded
   "Display unavailable" screen instead of Chromium's grey error page.

## Lockdown checklist — why the user can't break out
| Escape vector | Blocked by |
|---------------|-----------|
| Drop to a TTY (Ctrl-Alt-F1…F6) | `logind.conf.d`: `NAutoVTs=0`, `ReserveVT=0`; `customize.sh` masks `getty@`, `autovt@`, `serial-getty@`, `console-getty`. |
| Boot menu / kernel cmdline edit | systemd-boot `timeout 0`, `editor no`, `auto-entries no`, `auto-firmware no`. |
| Log in anywhere | root password locked + `nologin` shell; service users have no password/shell; ALARM's default `alarm` user is deleted. |
| Magic SysRq (Alt-SysRq-*) | `sysctl`: `kernel.sysrq = 0`. |
| Chromium address bar / new tab / other URLs | `cage` + `--kiosk` has no browser chrome; policy `URLAllowlist` = only `127.0.0.1:8080` + `chaos-ops.de` (incl. subdomains), everything else blocked. |
| DevTools (F12) | policy `DeveloperToolsAvailability: 2`. |
| Downloads, printing, file dialogs, incognito, guest, extensions | Chromium policy. |
| History swipe out of the app | launcher disables overscroll history navigation. |
| USB storage | `modprobe.d` blacklists `usb_storage` + `uas` (HID keyboards still work for the operator chords). |
| Remote entry (SSH / serial) | `sshd` not installed on x86_64; disabled + masked on the Pi; serial gettys masked. |
| Kernel info leak | `sysctl`: `dmesg_restrict=1`, `kptr_restrict=2`. |
| Network control from the UI | polkit: **only** `chaosops-agent` may drive NetworkManager. |
| Power/suspend/lid keys | `logind.conf.d`: power = clean poweroff, everything else ignored. |
| Privilege escalation from a compromised agent | agent units run unprivileged with `NoNewPrivileges`, `ProtectSystem=strict`, empty `CapabilityBoundingSet`, `SystemCallFilter=@system-service`. |

## The two operator hotkeys (the only affordances)
Handled by `chaosops-hotkeyd.service` (reads evdev directly as `chaosops-agent`
in the `input` group) — see `wifi-agent/README.md`:
- **Ctrl+Alt+W** → open the WiFi menu.
- **Ctrl+Alt+R** → reset the kiosk (forget WiFi, back to the QR/code screen).

## Note on the online display + hotkeys
The kiosk-shell keeps the top frame and embeds the display in an `<iframe>` so
the hotkeys keep working. The display routes allow framing from
`http://127.0.0.1:8080` (ChaosOps repo, PR #48).
