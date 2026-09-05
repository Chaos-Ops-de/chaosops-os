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

# ============================================================================
# Kiosk runtime — Stage 2A (graphics bring-up). Shared, arch-neutral layer.
# Per-arch GPU drivers live in each board's defconfig/fragment (x86 gallium in
# chaosops_x86_64_defconfig; the Pi BSP already ships vc4/v3d).
# ============================================================================

# --- Init: systemd (replaces BusyBox init; gives us logind/udev/units) -------
BR2_ROOTFS_MERGED_USR=y
BR2_INIT_SYSTEMD=y

# --- Wayland / DRM / Mesa (GBM+EGL+GLES = exactly what cog COG_PLATFORM_DRM
#     and kmscube need). SWRAST is the always-available software fallback so a
#     machine with no accelerated gallium driver still renders. -------------
BR2_PACKAGE_MESA3D=y
BR2_PACKAGE_MESA3D_OPENGL_EGL=y
BR2_PACKAGE_MESA3D_OPENGL_ES=y
BR2_PACKAGE_MESA3D_GBM=y
BR2_PACKAGE_MESA3D_GALLIUM_DRIVER_SWRAST=y
BR2_PACKAGE_MESA3D_VULKAN_DRIVER_SWRAST=y
BR2_PACKAGE_LIBDRM=y
BR2_PACKAGE_WAYLAND=y
BR2_PACKAGE_WAYLAND_PROTOCOLS=y
BR2_PACKAGE_LIBINPUT=y
BR2_PACKAGE_LIBXKBCOMMON=y
BR2_PACKAGE_DBUS=y

# --- Fonts + TLS roots (the browser stage needs both) -----------------------
BR2_PACKAGE_DEJAVU=y
BR2_PACKAGE_CA_CERTIFICATES=y

# --- Stage 2A-1 graphics smoke test: kmscube draws a spinning cube straight
#     on DRM/GBM/GLES. If this renders on boot, the whole cog-drm stack is
#     proven; Stage 2A-2 then swaps kmscube for cog + WPE WebKit. -----------
BR2_PACKAGE_KMSCUBE=y
