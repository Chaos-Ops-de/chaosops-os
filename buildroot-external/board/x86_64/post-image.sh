#!/bin/sh
# Assemble the bootable ChaosOps OS disk image (ESP + ext4 root) with genimage.
set -e
BOARD_DIR="$(dirname "$0")"
GENIMAGE_CFG="${BOARD_DIR}/genimage-efi.cfg"

# Stage our branded grub.cfg onto the EFI partition tree Buildroot produced.
# Buildroot builds the GRUB EFI image with prefix=/EFI/BOOT, so at boot GRUB
# reads exactly ${prefix}/grub.cfg = /EFI/BOOT/grub.cfg and NOTHING else. It
# ships its own default stub there ("Buildroot" menuentry, /boot/bzImage,
# root=/dev/sda1) which does not match our layout (kernel at /bzImage on the
# ESP, ext4 root on partition 2). We MUST overwrite that exact file, otherwise
# the branded config is ignored and the machine drops to a dead GRUB stub.
mkdir -p "${BINARIES_DIR}/efi-part/EFI/BOOT"
cp -f "${BOARD_DIR}/grub.cfg" "${BINARIES_DIR}/efi-part/EFI/BOOT/grub.cfg"

GENIMAGE_TMP="${BUILD_DIR}/genimage.tmp"
rm -rf "${GENIMAGE_TMP}"
genimage \
	--rootpath "${TARGET_DIR}" \
	--tmppath "${GENIMAGE_TMP}" \
	--inputpath "${BINARIES_DIR}" \
	--outputpath "${BINARIES_DIR}" \
	--config "${GENIMAGE_CFG}"
echo "==> image: output/images/chaosops-os-x86_64.img"
