# ChaosOps kiosk runtime — merged ONTO real-hardware targets only (x86_64,
# rpi4-64) on top of the base defconfig + chaosops.frag. NOT applied to the
# lean i686 v86/legacy ISO. Per-arch GPU drivers live in each board's own
# defconfig/fragment (x86 gallium in chaosops_x86_64_defconfig; the Pi BSP
# already ships vc4/v3d).

# --- Init: systemd (replaces BusyBox init; gives us logind/udev/units) -------
BR2_ROOTFS_MERGED_USR=y
BR2_INIT_SYSTEMD=y

# --- Rootfs size: the full kiosk stack (systemd + Mesa + WPE WebKit + cog) is
#     ~0.5-0.7 GB. The Pi base defconfig hardcodes a 120M ext2 which overflows
#     at mkfs. 1300M gives headroom for the full stack incl. Node + Network-
#     Manager + WiFi firmware, on every board (frag merged last, applies to Pi).
BR2_TARGET_ROOTFS_EXT2_SIZE="1300M"

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
#     on DRM/GBM/GLES. Kept as a tiny built-in debug tool. -------------------
BR2_PACKAGE_KMSCUBE=y

# --- Stage 2A-2: the kiosk browser — cog on WPE WebKit, DRM platform.
#     COG_PLATFORM_DRM runs cog fullscreen straight on KMS with NO separate
#     compositor (uses Mesa GBM/EGL/GLES + libdrm + libinput, all above).
#     wpebackend-fdo is WPE's rendering backend. This is the heavy compile
#     (WebKit + icu/harfbuzz/cairo/libsoup3/…). ------------------------------
BR2_PACKAGE_WPEWEBKIT=y
BR2_PACKAGE_WPEBACKEND_FDO=y
BR2_PACKAGE_COG=y
BR2_PACKAGE_COG_PLATFORM_DRM=y

# --- Stage 2B: the kiosk application + connectivity -------------------------
# Node runtime for the zero-dependency wifi-agent (serves kiosk-shell on
# 127.0.0.1:8080 + wraps NetworkManager via nmcli) and the hotkey daemon.
BR2_PACKAGE_NODEJS=y
# NetworkManager (+ nmcli) drives WiFi; wpa_supplicant does the WPA handshake.
BR2_PACKAGE_NETWORK_MANAGER=y
BR2_PACKAGE_NETWORK_MANAGER_CLI=y
BR2_PACKAGE_WPA_SUPPLICANT=y
BR2_PACKAGE_WPA_SUPPLICANT_NL80211=y
BR2_PACKAGE_WPA_SUPPLICANT_CLI=y
# WiFi firmware. Intel iwlwifi has no "all" symbol — enable the modern
# generations that cover most ThinkCentre/NUC/Intel mini-PCs from ~2014 on.
# The Pi's brcmfmac firmware comes from its own BSP. Add more per-chip symbols
# once exact WiFi hardware is known.
BR2_PACKAGE_LINUX_FIRMWARE=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_7260=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_7265=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_7265D=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_8000C=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_8265=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_9XXX=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_22000=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_22260=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_QUZ=y
BR2_PACKAGE_LINUX_FIRMWARE_IWLWIFI_6E=y
