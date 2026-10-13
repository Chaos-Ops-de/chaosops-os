# Builder for ChaosOps OS (Arch-based). image/build.sh only needs a Linux host
# with arch-install-scripts + filesystem tools; this container provides one so
# `make image-<board>` works on any Docker host (incl. macOS).
#
# The Makefile runs it with --platform matching the TARGET (linux/amd64 for
# x86_64, linux/arm64 for rpi4-aarch64), so the Arch userland we chroot into
# runs natively inside the container (emulated by Docker when the host CPU
# differs). It must run --privileged: arch-chroot/pacstrap bind-mount
# /proc, /sys and /dev.
FROM ubuntu:24.04

RUN apt-get update && apt-get install -y --no-install-recommends \
      arch-install-scripts \
      libarchive-tools \
      ca-certificates \
      curl \
      zstd \
      fdisk \
      e2fsprogs \
      dosfstools \
      mtools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /repo
ENTRYPOINT ["/repo/image/build.sh"]
