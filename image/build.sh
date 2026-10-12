#!/bin/bash
# ChaosOps OS image builder — Arch Linux based.
#
#   sudo image/build.sh <board>        # board = x86_64 | rpi4-aarch64
#
# Pipeline (identical for every board; per-board hooks in image/boards/<b>.sh):
#   1. board_rootfs    Arch / Arch Linux ARM base + os/packages/{common,<b>}.txt
#                      installed into $ROOTFS
#   2. overlay         os/rootfs/ + wifi-agent/src copied onto $ROOTFS
#   3. customize       os/customize.sh run inside $ROOTFS via arch-chroot
#                      (users, services, lockdown, plymouth, initramfs)
#   4. board_finalize  fstab, kernel cmdline, bootloader files -> $BOOTFS
#   5. board_image     $BOOTFS + $ROOTFS packed into a raw, dd-able disk image
#                      (no loop devices: mkfs.ext4 -d / mtools / sfdisk)
#
# Needs root on a Linux host (arch-chroot bind-mounts /proc,/sys,/dev) and:
# arch-chroot (arch-install-scripts), bsdtar, curl, zstd, sfdisk, mkfs.ext4,
# mkfs.fat, mcopy. The target arch must be executable on the host (native, or
# the whole build in an emulated container — that's what `make image-<b>` does).
#
# Env:
#   WORK             scratch dir (default: <repo>/.work/<board>); needs a real
#                    Linux fs (not a macOS bind mount) — the Makefile uses a
#                    Docker volume
#   OUT              output dir (default: <repo>/out)
#   PKGCACHE         persistent pacman package cache (default: $WORK/../pkg-<board>)
#   CHAOSOPS_VERSION baked into /etc/os-release (default: UTC date)
#   ARCH_SNAPSHOT    x86_64 only: YYYY/MM/DD to install from the Arch Linux
#                    Archive instead of the live mirrors (reproducible builds)
set -euo pipefail

BOARD="${1:-}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_DIR="$REPO/image"
OS_DIR="$REPO/os"

usage() { echo "usage: $0 <$(cd "$IMAGE_DIR/boards" && ls *.sh | sed 's/\.sh$//' | paste -sd'|')>" >&2; exit 2; }
[ -n "$BOARD" ] && [ -f "$IMAGE_DIR/boards/$BOARD.sh" ] || usage
[ "$(id -u)" -eq 0 ] || { echo "ERROR: must run as root (arch-chroot needs mounts)" >&2; exit 1; }

WORK="${WORK:-$REPO/.work/$BOARD}"
OUT="${OUT:-$REPO/out}"
PKGCACHE="${PKGCACHE:-$(dirname "$WORK")/pkg-$BOARD}"
DL="$(dirname "$WORK")/downloads"
CHAOSOPS_VERSION="${CHAOSOPS_VERSION:-$(date -u +%Y.%m.%d)}"
ROOTFS="$WORK/rootfs"
BOOTFS="$WORK/bootfs"
export CHAOSOPS_VERSION BOARD

log()  { echo "==> [$BOARD] $*"; }

# stage <title>: a timed, collapsible build step (a log group on GitHub
# Actions). Each stage's duration is printed when the next one starts.
STAGE_START=""
stage_end() {
  [ -n "$STAGE_START" ] || return 0
  log "   took $(( $(date +%s) - STAGE_START ))s"
  [ -z "${GITHUB_ACTIONS:-}" ] || echo "::endgroup::"
  STAGE_START=""
}
stage() {
  stage_end
  [ -z "${GITHUB_ACTIONS:-}" ] || echo "::group::$BOARD: $*"
  log "$*"
  STAGE_START=$(date +%s)
}
die()  { echo "ERROR: $*" >&2; exit 1; }

for tool in arch-chroot bsdtar curl zstd sfdisk mkfs.ext4 mkfs.fat mcopy; do
  command -v "$tool" >/dev/null || die "missing host tool: $tool"
done

# --- Mount bookkeeping ---------------------------------------------------------
# Everything we mount lives under $WORK; tear it all down (deepest first) on any
# exit so a failed build never leaves the host with dangling bind mounts.
unmount_work() {
  local m
  for m in $(awk -v w="$WORK" '$2 == w || index($2, w "/") == 1 { print $2 }' /proc/mounts | sort -r); do
    umount -l "$m" 2>/dev/null || true
  done
}
trap unmount_work EXIT

# pacman refuses to compute free space on a path that isn't a mountpoint, so
# every root we install into is bind-mounted onto itself (Arch wiki "Install
# Arch Linux from existing Linux").
self_bind() { mountpoint -q "$1" || mount --bind "$1" "$1"; }

# Share the host-side package cache with the target while installing.
bind_pkgcache() {
  mkdir -p "$PKGCACHE" "$1/var/cache/pacman/pkg"
  mount --bind "$PKGCACHE" "$1/var/cache/pacman/pkg"
}

# Package list for this board: common + board-specific, comments stripped.
packages() {
  cat "$OS_DIR/packages/common.txt" "$OS_DIR/packages/$BOARD.txt" \
    | sed -e 's/#.*//' -e 's/[[:space:]]//g' | grep -v '^$' | sort -u
}

# Fetch $1 into $DL (cached across builds) and echo its local path.
fetch() {
  local url="$1" dst="$DL/$(basename "$1")" cond=()
  mkdir -p "$DL"
  # Only re-download when the server copy is newer ("-latest" tarballs).
  [ -f "$dst" ] && cond=(-z "$dst")
  if curl -fL --retry 3 "${cond[@]}" -o "$dst.part" "$url" >&2 && [ -s "$dst.part" ]; then
    mv "$dst.part" "$dst"
  else
    rm -f "$dst.part"
  fi
  [ -s "$dst" ] || die "download failed: $url"
  echo "$dst"
}

# Make sure binaries from an extracted root actually execute here.
assert_runnable() {
  chroot "$1" /usr/bin/true 2>/dev/null || die "can't execute $BOARD binaries on this $(uname -m) host. Build inside a matching container (make image-$BOARD) or register qemu-user binfmt."
}

# pacman 7 sandboxes downloads with Landlock, which many container runtimes
# don't expose. Builds are throwaway, so just turn the sandbox off.
tune_pacman_conf() {
  sed -i -e 's/^#\?ParallelDownloads.*/ParallelDownloads = 8/' "$1"
  grep -q '^DisableSandbox' "$1" || sed -i '/^\[options\]/a DisableSandbox' "$1"
}

# --- Disk image helpers ----------------------------------------------------------
new_uuid() { cat /proc/sys/kernel/random/uuid; }

# mkfs_ext4 <out> <size-MiB> <fs-uuid> <dir>: ext4 populated from <dir>, no mount.
mkfs_ext4() {
  rm -f "$1"
  mkfs.ext4 -q -F -L chaosops-root -U "$3" -m 1 -d "$4" "$1" "${2}M"
}

# mkfs_vfat <out> <size-MiB> <label> <dir>: FAT32 populated from <dir>, no mount.
mkfs_vfat() {
  rm -f "$1"
  mkfs.fat -F 32 -n "$3" -C "$1" $(( $2 * 1024 )) >/dev/null
  MTOOLS_SKIP_CHECK=1 mcopy -s -p -m -i "$1" "$4"/* ::/
}

# Root partition size: content + 25% + 256 MiB slack (growroot fills the rest
# of the real disk on first boot).
rootfs_size_mib() {
  local used; used=$(du -sm --exclude="$ROOTFS/boot" "$ROOTFS" | cut -f1)
  echo $(( used * 125 / 100 + 256 ))
}

# write_disk <out> <sfdisk-script> <boot.img> <boot-MiB> <root.img> <root-MiB>
# Layout: 1 MiB gap | boot | root | 1 MiB tail (room for the GPT backup header).
write_disk() {
  local out="$1" script="$2" boot="$3" boot_mib="$4" root="$5" root_mib="$6"
  rm -f "$out"
  truncate -s $(( (1 + boot_mib + root_mib + 1) * 1024 * 1024 )) "$out"
  printf '%s\n' "$script" | sfdisk --quiet --no-reread --no-tell-kernel "$out"
  dd if="$boot" of="$out" bs=1M seek=1 conv=notrunc,sparse status=none
  dd if="$root" of="$out" bs=1M seek=$(( 1 + boot_mib )) conv=notrunc,sparse status=none
}

# --- Build -------------------------------------------------------------------------
# shellcheck source=/dev/null
. "$IMAGE_DIR/boards/$BOARD.sh"

log "ChaosOps OS $CHAOSOPS_VERSION (work: $WORK)"
unmount_work
rm -rf "$WORK"
mkdir -p "$WORK" "$ROOTFS" "$BOOTFS" "$OUT"

stage "1/5 base system + packages"
board_rootfs

stage "2/5 overlay (os/rootfs + wifi-agent)"
cp -a "$OS_DIR/rootfs/." "$ROOTFS/"
install -d "$ROOTFS/opt/chaosops/wifi-agent"
cp -a "$REPO/wifi-agent/src/." "$ROOTFS/opt/chaosops/wifi-agent/"
cp "$REPO/wifi-agent/README.md" "$ROOTFS/opt/chaosops/wifi-agent/"
# A fresh `make shell` build wins over the committed kiosk-shell snapshot.
if [ -f "$REPO/kiosk-shell/dist/index.html" ]; then
  rm -rf "$ROOTFS/opt/chaosops/kiosk-shell"
  cp -a "$REPO/kiosk-shell/dist" "$ROOTFS/opt/chaosops/kiosk-shell"
fi
[ -f "$ROOTFS/opt/chaosops/kiosk-shell/index.html" ] || die "no kiosk-shell build (run 'make shell')"

stage "3/5 customize (in chroot)"
install -m 0755 "$OS_DIR/customize.sh" "$ROOTFS/root/chaosops-customize.sh"
arch-chroot "$ROOTFS" /usr/bin/env CHAOSOPS_VERSION="$CHAOSOPS_VERSION" \
  CHAOSOPS_BOARD="$BOARD" /root/chaosops-customize.sh
rm -f "$ROOTFS/root/chaosops-customize.sh"

# Everything below works on the plain directory tree.
unmount_work
stage "trimming"
rm -rf "$ROOTFS"/var/cache/pacman/pkg/* "$ROOTFS"/var/lib/systemd/random-seed \
  "$ROOTFS"/root/.bash_history "$ROOTFS"/etc/pacman.d/gnupg
find "$ROOTFS/var/log" -type f -delete
# arch-chroot bind-mounts the host's resolv.conf over the target's; now that
# it's gone, hand the file to NetworkManager (a plain file, not a symlink to
# the systemd-resolved stub some base tarballs ship).
rm -f "$ROOTFS/etc/resolv.conf" && : > "$ROOTFS/etc/resolv.conf"

stage "4/5 boot files"
board_finalize

stage "5/5 disk image"
board_image
stage_end
log "done: $OUT/chaosops-os-$BOARD.img ($(du -h --apparent-size "$OUT/chaosops-os-$BOARD.img" | cut -f1))"
