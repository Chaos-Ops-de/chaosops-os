# ChaosOps OS board: generic x86-64 (UEFI) — NUC / ThinkCentre / mini-PCs.
# Sourced by image/build.sh. Output: GPT disk image, ESP (systemd-boot, kernel,
# initramfs, microcode; mounted at /boot) + ext4 root.

ARCH_MIRROR="${ARCH_MIRROR:-https://geo.mirror.pkgbuild.com}"
BOOT_MIB=512

KERNEL_CMDLINE="rw quiet splash loglevel=0 rd.udev.log_level=0 rd.systemd.show_status=false systemd.show_status=false vt.global_cursor_default=0 consoleblank=0"

# Official Arch bootstrap tarball = a minimal Arch userland we chroot into to
# run pacstrap, which then installs a clean ChaosOps rootfs into /mnt.
board_rootfs() {
  local tarball sums bootstrap="$WORK/bootstrap"
  tarball=$(fetch "$ARCH_MIRROR/iso/latest/archlinux-bootstrap-x86_64.tar.zst")
  sums=$(fetch "$ARCH_MIRROR/iso/latest/sha256sums.txt")
  (cd "$(dirname "$tarball")" && grep " archlinux-bootstrap-x86_64.tar.zst\$" "$sums" | sha256sum -c --quiet -) \
    || die "bootstrap tarball checksum mismatch"

  mkdir -p "$bootstrap"
  bsdtar -xpf "$tarball" --numeric-owner -C "$bootstrap" --strip-components 1
  assert_runnable "$bootstrap"

  if [ -n "${ARCH_SNAPSHOT:-}" ]; then
    echo "Server = https://archive.archlinux.org/repos/$ARCH_SNAPSHOT/\$repo/os/\$arch" > "$bootstrap/etc/pacman.d/mirrorlist"
  else
    echo "Server = $ARCH_MIRROR/\$repo/os/\$arch" > "$bootstrap/etc/pacman.d/mirrorlist"
  fi
  tune_pacman_conf "$bootstrap/etc/pacman.conf"

  self_bind "$bootstrap"
  bind_pkgcache "$ROOTFS"
  mount --rbind "$ROOTFS" "$bootstrap/mnt"

  arch-chroot "$bootstrap" /bin/bash -euo pipefail -c '
    pacman-key --init >/dev/null
    pacman-key --populate archlinux >/dev/null
    pacstrap -K /mnt "$@"
  ' _ $(packages)
  # pacstrap copies the bootstrap mirrorlist; keep pacman.conf tuning too.
  cp "$bootstrap/etc/pacman.conf" "$ROOTFS/etc/pacman.conf"
}

board_finalize() {
  ROOT_PARTUUID=$(new_uuid); ESP_PARTUUID=$(new_uuid); ROOT_FSUUID=$(new_uuid)

  cat > "$ROOTFS/etc/fstab" <<FSTAB
# ChaosOps OS ($BOARD). The ESP is /boot so kernel updates land where
# systemd-boot looks for them.
PARTUUID=$ROOT_PARTUUID  /      ext4  rw,relatime                       0 1
PARTUUID=$ESP_PARTUUID   /boot  vfat  rw,relatime,fmask=0077,dmask=0077  0 2
FSTAB

  # ESP contents: everything pacman/mkinitcpio put in /boot + systemd-boot as
  # the removable-media fallback loader (no NVRAM entry needed on any machine).
  cp -a "$ROOTFS/boot/." "$BOOTFS/"
  install -D -m 0644 "$ROOTFS/usr/lib/systemd/boot/efi/systemd-bootx64.efi" "$BOOTFS/EFI/BOOT/BOOTX64.EFI"
  install -d "$BOOTFS/loader/entries"
  # Lockdown: no menu, no cmdline editor, no auto-added entries (Windows,
  # EFI shell, firmware setup) that could be picked at boot.
  cat > "$BOOTFS/loader/loader.conf" <<LOADER
default chaosops.conf
timeout 0
editor no
auto-entries no
auto-firmware no
console-mode keep
LOADER
  cat > "$BOOTFS/loader/entries/chaosops.conf" <<ENTRY
title   ChaosOps OS
linux   /vmlinuz-linux
initrd  /intel-ucode.img
initrd  /amd-ucode.img
initrd  /initramfs-linux.img
options root=PARTUUID=$ROOT_PARTUUID $KERNEL_CMDLINE
ENTRY
  # /boot on the root fs is just the ESP mountpoint.
  find "$ROOTFS/boot" -mindepth 1 -delete
}

board_image() {
  local root_mib; root_mib=$(rootfs_size_mib)
  mkfs_vfat "$WORK/esp.img" "$BOOT_MIB" CHAOSOPS "$BOOTFS"
  mkfs_ext4 "$WORK/root.img" "$root_mib" "$ROOT_FSUUID" "$ROOTFS"
  # Root uses the Discoverable Partitions x86-64 root type GUID.
  write_disk "$OUT/chaosops-os-$BOARD.img" "label: gpt
start=1MiB, size=${BOOT_MIB}MiB, type=C12A7328-F81F-11D2-BA4B-00A0C93EC93B, uuid=$ESP_PARTUUID, name=\"ESP\"
start=$((1 + BOOT_MIB))MiB, size=${root_mib}MiB, type=4F68BCE3-E8CD-4DB1-96E7-FBCAF984B709, uuid=$ROOT_PARTUUID, name=\"chaosops-root\"" \
    "$WORK/esp.img" "$BOOT_MIB" "$WORK/root.img" "$root_mib"
}
