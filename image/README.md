# Building ChaosOps OS images

ChaosOps OS = Arch Linux + the `os/` layer. `image/build.sh <board>` produces a
raw, `dd`-able disk image:

1. **Base** — x86_64: official Arch bootstrap tarball (checksum-verified), used
   as a build chroot to `pacstrap` a clean rootfs. Pi: the Arch Linux ARM
   `rpi-aarch64` root tarball (md5-verified) as the target.
2. **Packages** — `os/packages/common.txt` + `os/packages/<board>.txt`.
3. **Overlay** — `os/rootfs/` + `wifi-agent/src` (+ `kiosk-shell/dist` if built).
4. **Customize** — `os/customize.sh` inside the target (users, units, lockdown,
   Plymouth, initramfs).
5. **Pack** — `mkfs.ext4 -d` / `mkfs.fat` + `mcopy` / `sfdisk`. No loop devices
   or mounts of the image; `board_finalize`/`board_image` in `boards/<board>.sh`
   own the layout and bootloader.

| Board | Layout | Boot |
|-------|--------|------|
| `x86_64` | GPT: 512 MiB ESP (`/boot`) + ext4 root | systemd-boot as `EFI/BOOT/BOOTX64.EFI` — UEFI only, no NVRAM entry needed |
| `rpi4-aarch64` | MBR: 512 MiB FAT (`/boot`) + ext4 root | Pi firmware → mainline `linux-aarch64` directly (no U-Boot text); ALARM's U-Boot path kept as fallback |

The root partition is sized to its contents; `chaosops-growroot.service` grows
it to fill the disk on first boot.

## Build
Any Docker host (macOS included):
```sh
make image-x86_64          # -> out/chaosops-os-x86_64.img
make image-rpi4-aarch64    # -> out/chaosops-os-rpi4-aarch64.img
```
The container runs as the **target** platform (`linux/amd64` / `linux/arm64`),
so on Apple Silicon the Pi image builds natively and x86_64 is emulated
(slower). Scratch space and the pacman cache live in the `chaosops-os-work`
Docker volume.

On a Linux host (needs `arch-install-scripts libarchive-tools zstd fdisk
e2fsprogs dosfstools mtools`) and a CPU matching the board:
```sh
sudo image/build.sh x86_64
```

### Reproducible x86_64 builds
Pin every package to an [Arch Linux Archive](https://archive.archlinux.org/)
snapshot:
```sh
make image-x86_64 ARCH_SNAPSHOT=2026/10/01
```
(Arch Linux ARM has no archive, so the Pi build always tracks its live mirror.)

## Test / flash
```sh
make run-x86_64                       # boot in QEMU (UEFI), throwaway overlay
sudo dd if=out/chaosops-os-x86_64.img of=/dev/sdX bs=4M status=progress oflag=sync
```
For the Pi, flash `out/chaosops-os-rpi4-aarch64.img` with `dd` or Raspberry Pi
Imager ("Use custom"). CI attaches both as `.img.zst` to each `main` build (Raspberry Pi Imager
reads it directly; otherwise `zstd -dc chaosops-os-<board>.img.zst | sudo dd of=/dev/sdX bs=4M`).

## Per-device configuration
Override the display URL (or any agent env) via `/etc/chaosops/wifi-agent.env`:
```
CHAOSOPS_DISPLAY_URL=https://dev.app.chaos-ops.de/register-display
```

## Updating a device
The image keeps pacman's database, so a device can be updated in place in a
maintenance chroot, but the pacman keyring is stripped from the image (it
would otherwise be identical on every device). Run `pacman-key --init &&
pacman-key --populate` first. The supported update path is reflashing a newer
image.
