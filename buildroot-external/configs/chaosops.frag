# Shared ChaosOps userspace + branding. Merged onto each board's base defconfig
# (x86_64 = ours, Raspberry Pi = Buildroot's reference BSP) so the OS layer is
# identical across all hardware while the kernel/bootloader stays per-board.
BR2_ROOTFS_OVERLAY="$(BR2_EXTERNAL_CHAOSOPS_PATH)/board/common/rootfs-overlay"
BR2_TARGET_GENERIC_HOSTNAME="chaosops"
BR2_TARGET_GENERIC_ISSUE="ChaosOps OS"
BR2_SYSTEM_BIN_SH_BASH=y
BR2_PACKAGE_BASH=y
BR2_PACKAGE_UTIL_LINUX=y
BR2_CCACHE=y
