#!/bin/bash
# ChaosOps OS — in-image configuration. Runs INSIDE the target rootfs (via
# arch-chroot) after packages are installed and os/rootfs/ is overlaid, as the
# last step before image/build.sh packs the disk image. Board-agnostic: board
# specifics (bootloader, fstab, cmdline) are handled by image/boards/*.sh.
#
# Env from build.sh: CHAOSOPS_VERSION, CHAOSOPS_BOARD.
set -euo pipefail
log() { echo "[customize] $*"; }

# --- Identity --------------------------------------------------------------
log "branding /etc/os-release"
# Arch ships /etc/os-release -> ../usr/lib/os-release. Replace the link with
# our own file so pacman upgrades of `filesystem` can't re-brand the box.
rm -f /etc/os-release
cat > /etc/os-release <<OSR
NAME="ChaosOps OS"
PRETTY_NAME="ChaosOps OS ${CHAOSOPS_VERSION}"
ID=chaosops
ID_LIKE=arch
VERSION_ID=${CHAOSOPS_VERSION}
BUILD_ID=${CHAOSOPS_VERSION}
VARIANT_ID=${CHAOSOPS_BOARD}
HOME_URL="https://chaos-ops.de"
LOGO=chaosops
OSR
echo chaosops > /etc/hostname
echo 'LANG=C.UTF-8' > /etc/locale.conf
ln -sf /usr/share/zoneinfo/UTC /etc/localtime
# Every flashed device must get its own machine-id (and thus DHCP client id).
echo uninitialized > /etc/machine-id

# --- Users -----------------------------------------------------------------
log "creating service users (sysusers.d/chaosops.conf)"
systemd-sysusers
install -d -o chaosops-agent -g chaosops-agent -m 0750 /var/lib/chaosops
install -d -o kiosk -g kiosk -m 0750 /var/lib/chaosops-kiosk
# Nobody logs in interactively: lock root, drop any vendor default user
# (Arch Linux ARM ships alarm/alarm + root/root).
if getent passwd alarm >/dev/null; then userdel -r alarm 2>/dev/null || userdel alarm; fi
usermod -p '!' root
usermod -s /usr/bin/nologin root

# --- Payload permissions -----------------------------------------------------
chmod 0755 /usr/local/bin/chaosops-kiosk /usr/local/bin/chaosops-growroot
chown -R root:root /opt/chaosops
chmod -R u=rwX,go=rX /opt/chaosops
chmod 0644 /etc/chromium/policies/managed/chaosops.json

# --- systemd wiring --------------------------------------------------------
log "enabling services"
systemctl enable NetworkManager.service systemd-timesyncd.service \
  wifi-agent.service chaosops-hotkeyd.service chaosops-kiosk.service \
  chaosops-growroot.service
# (= systemctl set-default; a plain symlink also works under Rosetta emulation)
ln -sf /usr/lib/systemd/system/graphical.target /etc/systemd/system/default.target
# NetworkManager is the only network stack (ALARM enables networkd/resolved).
systemctl disable systemd-networkd.service systemd-networkd.socket \
  systemd-resolved.service 2>/dev/null || true

# tty1 belongs to the kiosk session, never a login prompt. logind.conf.d
# already sets NAutoVTs=0/ReserveVT=0; mask every getty explicitly too.
# (autovt@ is normally an alias symlink to getty@; replace it, mask refuses.)
GETTYS="getty@.service serial-getty@.service console-getty.service autovt@.service"
for u in $GETTYS; do rm -f "/etc/systemd/system/$u"; done
systemctl mask $GETTYS
# No remote entry into the appliance (ALARM enables sshd out of the box).
systemctl disable sshd.service 2>/dev/null || true
systemctl mask sshd.service

# --- Boot splash + initramfs -------------------------------------------------
log "plymouth theme + initramfs"
plymouth-set-default-theme chaosops
# Only build the default initramfs: the fallback image is an autodetect-free
# duplicate (ours already is) and would just double the boot partition usage.
for preset in /etc/mkinitcpio.d/*.preset; do
  sed -i "s/^PRESETS=.*/PRESETS=('default')/" "$preset"
done
rm -f /boot/initramfs-*-fallback.img
mkinitcpio -P

# (Package cache / log trimming happens in build.sh after it unmounts the
# shared pacman cache, so we never wipe the host's cache from in here.)
log "done"
