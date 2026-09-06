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
# CI builds Buildroot's own cross-toolchain fresh every run; with ccache's
# default compiler_check=mtime the "new" compiler invalidates every cached
# object, so WebKit recompiles cold (~5h) each time. compiler_check=content
# hashes the compiler binary instead — a byte-identical rebuilt toolchain then
# reuses the cache, so WebKit object files hit on subsequent runs.
BR2_CCACHE_INITIAL_SETUP="--set-config=compiler_check=content --max-size=5G"

# NOTE: the kiosk runtime (systemd + Wayland/DRM/Mesa + cog/WPE WebKit) is NOT
# here — it lives in chaosops-kiosk.frag, merged only onto the real-hardware
# targets (x86_64, rpi4-64). The lean i686 v86/legacy ISO gets ONLY this
# universal branding layer so it stays tiny.
