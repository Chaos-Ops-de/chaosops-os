# ChaosOps kiosk runtime — merged ONTO real-hardware targets only (x86_64,
# rpi4-64) on top of the base defconfig + chaosops.frag. NOT applied to the
# lean i686 v86/legacy ISO. Per-arch GPU drivers live in each board's own
# defconfig/fragment (x86 gallium in chaosops_x86_64_defconfig; the Pi BSP
# already ships vc4/v3d).

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
