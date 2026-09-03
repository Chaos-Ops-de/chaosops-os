#!/bin/sh
# Assemble the bootable ChaosOps OS disk image (ESP + ext4 root) with genimage.
set -e
BOARD_DIR="$(dirname "$0")"
GENIMAGE_CFG="${BOARD_DIR}/genimage-efi.cfg"

# Stage our branded grub.cfg onto the EFI partition tree Buildroot produced.
mkdir -p "${BINARIES_DIR}/efi-part/boot/grub"
cp -f "${BOARD_DIR}/grub.cfg" "${BINARIES_DIR}/efi-part/boot/grub/grub.cfg"

GENIMAGE_TMP="${BUILD_DIR}/genimage.tmp"
rm -rf "${GENIMAGE_TMP}"
genimage \
	--rootpath "${TARGET_DIR}" \
	--tmppath "${GENIMAGE_TMP}" \
	--inputpath "${BINARIES_DIR}" \
	--outputpath "${BINARIES_DIR}" \
	--config "${GENIMAGE_CFG}"
echo "==> image: output/images/chaosops-os-x86_64.img"
