#!/bin/bash
# Assemble the ChaosOps OS payload from the repo and build the bootable image
# with live-build. Runs as root inside the Debian builder container (see
# image/Dockerfile); the repo is mounted at /repo. Not meant to run on the host
# directly — use `make image`, which wraps this in Docker.
set -euo pipefail

REPO="${REPO:-/repo}"
IMAGE_DIR="$REPO/image"
OUT_DIR="$IMAGE_DIR/out"
INC="$IMAGE_DIR/config/includes.chroot"

echo "==> ChaosOps OS image build"

# --- Preconditions -------------------------------------------------------
if [ ! -d "$REPO/kiosk-shell/dist" ]; then
  echo "ERROR: kiosk-shell/dist not found. Build the UI first: 'make shell'." >&2
  exit 1
fi
if [ ! -f "$REPO/wifi-agent/src/server.js" ]; then
  echo "ERROR: wifi-agent/src/server.js not found." >&2
  exit 1
fi

# --- Assemble config/includes.chroot from the canonical os/ + app payloads
# (kept out of git; os/ is the single source of truth). --------------------
echo "==> assembling includes.chroot"
rm -rf "$INC"
install -d \
  "$INC/etc/systemd/system" \
  "$INC/etc/systemd/logind.conf.d" \
  "$INC/etc/sysctl.d" \
  "$INC/etc/modprobe.d" \
  "$INC/etc/polkit-1/rules.d" \
  "$INC/etc/default/grub.d" \
  "$INC/etc/chromium/policies/managed" \
  "$INC/usr/local/bin" \
  "$INC/usr/share/plymouth/themes" \
  "$INC/opt/chaosops/kiosk-shell" \
  "$INC/opt/chaosops/wifi-agent"

O="$REPO/os"
cp "$O/systemd/wifi-agent.service"          "$INC/etc/systemd/system/"
cp "$O/systemd/chaosops-kiosk.service"      "$INC/etc/systemd/system/"
cp "$O/systemd/chaosops-hotkeyd.service"    "$INC/etc/systemd/system/"
cp "$O/systemd/logind-chaosops.conf"        "$INC/etc/systemd/logind.conf.d/chaosops.conf"
cp "$O/systemd/sysctl-99-chaosops.conf"     "$INC/etc/sysctl.d/99-chaosops.conf"
cp "$O/systemd/modprobe-chaosops.conf"      "$INC/etc/modprobe.d/chaosops.conf"
cp "$O/systemd/polkit-50-chaosops-nm.rules" "$INC/etc/polkit-1/rules.d/50-chaosops-nm.rules"
cp "$O/grub/99-chaosops.cfg"                "$INC/etc/default/grub.d/99-chaosops.cfg"
cp "$O/cage/chaosops-kiosk"                 "$INC/usr/local/bin/chaosops-kiosk"
cp "$O/cage/chromium-policy.json"           "$INC/etc/chromium/policies/managed/chaosops.json"
cp -r "$O/plymouth/chaosops"                "$INC/usr/share/plymouth/themes/chaosops"

# App payloads. wifi-agent has zero npm deps, so its src/ IS the deployable —
# copy it flat to /opt/chaosops/wifi-agent so the unit ExecStart paths
# (/opt/chaosops/wifi-agent/server.js, hotkeyd.js) resolve.
cp -r "$REPO/kiosk-shell/dist/."   "$INC/opt/chaosops/kiosk-shell/"
cp -r "$REPO/wifi-agent/src/."     "$INC/opt/chaosops/wifi-agent/"
cp    "$REPO/wifi-agent/README.md" "$INC/opt/chaosops/wifi-agent/README.md" 2>/dev/null || true

# --- Run live-build ------------------------------------------------------
BUILD="$IMAGE_DIR/.build"
rm -rf "$BUILD"
mkdir -p "$BUILD"
cp -r "$IMAGE_DIR/auto" "$IMAGE_DIR/config" "$BUILD/"
cd "$BUILD"

echo "==> lb config"
lb config
echo "==> lb build (this downloads a Debian base and can take 15-40 min)"
lb build

# --- Collect artifact ----------------------------------------------------
mkdir -p "$OUT_DIR"
ISO="$(ls -1 live-image-amd64.hybrid.iso 2>/dev/null || true)"
if [ -z "$ISO" ]; then
  echo "ERROR: live-build produced no live-image-amd64.hybrid.iso" >&2
  exit 1
fi
cp "$ISO" "$OUT_DIR/chaosops-os-amd64.iso"
echo "==> DONE: image/out/chaosops-os-amd64.iso"
echo "    Write to a USB stick with:  sudo dd if=image/out/chaosops-os-amd64.iso of=/dev/sdX bs=4M status=progress oflag=sync"
