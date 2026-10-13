#!/bin/bash
# Boot a ChaosOps OS x86_64 disk image in QEMU with UEFI firmware, on a
# throwaway copy-on-write overlay so the built image stays pristine.
#   scripts/run-qemu.sh out/chaosops-os-x86_64.img
# Needs qemu-system-x86_64 (macOS: brew install qemu; Linux: qemu + ovmf).
set -euo pipefail
IMG="${1:?usage: $0 <image.img>}"

for fw in \
  /opt/homebrew/share/qemu/edk2-x86_64-code.fd \
  /usr/local/share/qemu/edk2-x86_64-code.fd \
  /usr/share/OVMF/OVMF_CODE.fd \
  /usr/share/edk2/x64/OVMF_CODE.fd \
  /usr/share/qemu/OVMF.fd; do
  [ -f "$fw" ] && FIRMWARE="$fw" && break
done
[ -n "${FIRMWARE:-}" ] || { echo "no x86_64 UEFI firmware (OVMF/edk2) found" >&2; exit 1; }

ACCEL=tcg
[ "$(uname -s)" = Linux ] && [ -w /dev/kvm ] && [ "$(uname -m)" = x86_64 ] && ACCEL=kvm

OVERLAY="$(mktemp -d)/chaosops-run.qcow2"
qemu-img create -q -f qcow2 -F raw -b "$(realpath "$IMG")" "$OVERLAY" 8G
trap 'rm -rf "$(dirname "$OVERLAY")"' EXIT

qemu-system-x86_64 \
  -machine q35,accel="$ACCEL" -m 2048 -smp 2 \
  -drive if=pflash,format=raw,readonly=on,file="$FIRMWARE" \
  -drive file="$OVERLAY",if=virtio,format=qcow2 \
  -device virtio-vga \
  -nic user,model=virtio-net-pci \
  -device qemu-xhci -device usb-kbd -device usb-tablet
