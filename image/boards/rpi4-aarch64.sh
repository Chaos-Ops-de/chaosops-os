# ChaosOps OS board: Raspberry Pi 4 / 400 (aarch64, Arch Linux ARM).
# Sourced by image/build.sh. Output: MBR SD-card image, FAT boot (Pi firmware,
# mainline kernel, initramfs, DTBs; mounted at /boot) + ext4 root.
#
# Boot chain: the Pi firmware loads the mainline kernel (/Image) directly —
# no U-Boot, so no U-Boot text on screen between the (disabled) rainbow splash
# and Plymouth. Arch Linux ARM's own default is firmware -> U-Boot ->
# boot.scr; that path stays installed (and patched) as a fallback: delete the
# "ChaosOps direct boot" block from config.txt to go back to it.

ALARM_MIRROR="${ALARM_MIRROR:-http://os.archlinuxarm.org}"
BOOT_MIB=512

KERNEL_CMDLINE="rw rootwait fsck.repair=yes console=tty3 quiet splash loglevel=0 rd.udev.log_level=0 rd.systemd.show_status=false systemd.show_status=false vt.global_cursor_default=0 consoleblank=0 plymouth.ignore-serial-consoles"

# Arch Linux ARM ships the Pi as a complete root tarball (no bootstrap), so we
# unpack it as the target and pacman the ChaosOps packages on top.
board_rootfs() {
  local tarball sums
  tarball=$(fetch "$ALARM_MIRROR/os/ArchLinuxARM-rpi-aarch64-latest.tar.gz")
  sums=$(fetch "$ALARM_MIRROR/os/ArchLinuxARM-rpi-aarch64-latest.tar.gz.md5")
  (cd "$(dirname "$tarball")" && md5sum -c --quiet "$sums") || die "ALARM tarball checksum mismatch"

  bsdtar -xpf "$tarball" --numeric-owner -C "$ROOTFS"
  assert_runnable "$ROOTFS"
  tune_pacman_conf "$ROOTFS/etc/pacman.conf"

  self_bind "$ROOTFS"
  bind_pkgcache "$ROOTFS"
  arch-chroot "$ROOTFS" /bin/bash -euo pipefail -c '
    pacman-key --init >/dev/null
    pacman-key --populate archlinuxarm >/dev/null
    pacman -Syu --noconfirm --needed "$@"
    # The tarball pulls in all of linux-firmware (~1 GB). A Pi never needs the
    # PC GPU / Intel blobs; keep Broadcom (onboard WiFi) and the Realtek /
    # Atheros / MediaTek sets that common USB WiFi dongles use.
    unneeded=$(pacman -Qq linux-firmware linux-firmware-amdgpu linux-firmware-nvidia \
      linux-firmware-radeon linux-firmware-intel linux-firmware-cirrus 2>/dev/null || true)
    # Plain -R (no -s): the kept subpackages must not be swept up as orphans.
    [ -z "$unneeded" ] || pacman -R --noconfirm $unneeded
  ' _ $(packages)

  # Fallback U-Boot path: same quiet cmdline as cmdline.txt, so it stays
  # branded if someone switches back. U-Boot fills ${uuid} with the root
  # partition's PARTUUID at boot.
  sed -i "s|^setenv bootargs .*|setenv bootargs root=PARTUUID=\${uuid} $KERNEL_CMDLINE|" "$ROOTFS/boot/boot.txt"
  grep -q 'splash' "$ROOTFS/boot/boot.txt" || die "failed to patch /boot/boot.txt"
  arch-chroot "$ROOTFS" /bin/bash -c 'cd /boot && ./mkscr'
}

board_finalize() {
  DISK_ID=$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')
  ROOT_FSUUID=$(new_uuid)
  local root="PARTUUID=$DISK_ID-02" boot="PARTUUID=$DISK_ID-01"

  cat > "$ROOTFS/etc/fstab" <<FSTAB
# ChaosOps OS ($BOARD). /boot is the Pi firmware partition.
$root  /      ext4  rw,relatime                       0 1
$boot  /boot  vfat  rw,relatime,fmask=0077,dmask=0077  0 2
FSTAB

  local dtb
  for dtb in bcm2711-rpi-4-b bcm2711-rpi-400; do
    [ -f "$ROOTFS/boot/dtbs/broadcom/$dtb.dtb" ] || die "missing mainline DTB dtbs/broadcom/$dtb.dtb"
  done
  echo "root=$root $KERNEL_CMDLINE" > "$ROOTFS/boot/cmdline.txt"
  # Replace ALARM's config.txt (just enable_uart=1 for U-Boot's serial).
  cat > "$ROOTFS/boot/config.txt" <<CFG
# ChaosOps OS — Raspberry Pi firmware config.

# --- ChaosOps direct boot: firmware -> mainline kernel, no U-Boot ---
arm_64bit=1
kernel=Image
initramfs initramfs-linux.img followkernel
# Mainline device trees (shipped and updated by linux-aarch64).
[pi4]
device_tree=dtbs/broadcom/bcm2711-rpi-4-b.dtb
[pi400]
device_tree=dtbs/broadcom/bcm2711-rpi-400.dtb
[all]
# --- end direct boot ---

# No rainbow test screen before the kernel's Plymouth splash.
disable_splash=1
boot_delay=0
CFG

  cp -a "$ROOTFS/boot/." "$BOOTFS/"
  find "$ROOTFS/boot" -mindepth 1 -delete
}

board_image() {
  local root_mib; root_mib=$(rootfs_size_mib)
  mkfs_vfat "$WORK/boot.img" "$BOOT_MIB" CHAOSOPS "$BOOTFS"
  mkfs_ext4 "$WORK/root.img" "$root_mib" "$ROOT_FSUUID" "$ROOTFS"
  write_disk "$OUT/chaosops-os-$BOARD.img" "label: dos
label-id: 0x$DISK_ID
start=1MiB, size=${BOOT_MIB}MiB, type=c, bootable
start=$((1 + BOOT_MIB))MiB, size=${root_mib}MiB, type=83" \
    "$WORK/boot.img" "$BOOT_MIB" "$WORK/root.img" "$root_mib"
}
