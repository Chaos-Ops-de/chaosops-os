# Builder image for ChaosOps OS. live-build needs a Debian host; this container
# provides one so `make image` works on any Docker host (Linux, or macOS/Windows
# via Docker Desktop). The build itself must run --privileged (live-build uses
# debootstrap, loop mounts and mknod) — the Makefile passes that flag.
FROM debian:12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      live-build \
      debootstrap \
      squashfs-tools \
      xorriso \
      isolinux \
      syslinux-common \
      grub-pc-bin \
      grub-efi-amd64-bin \
      mtools \
      dosfstools \
      ca-certificates \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
ENTRYPOINT ["/repo/image/build.sh"]
