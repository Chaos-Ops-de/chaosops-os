# ChaosOps OS — build entrypoints (Arch Linux based).
#
#   make shell               build the kiosk-shell UI and refresh the snapshot
#                            baked into the image (os/rootfs/opt/chaosops/kiosk-shell)
#   make image-x86_64        UEFI disk image  -> out/chaosops-os-x86_64.img
#   make image-rpi4-aarch64  Pi 4 SD image    -> out/chaosops-os-rpi4-aarch64.img
#   make run-x86_64          boot the x86_64 image in QEMU (UEFI)
#   make agent-test          wifi-agent smoke tests
#   make clean
#
# Images build inside a privileged Docker container (image/Dockerfile) so this
# works on any Docker host. On a Linux host you can also run the builder
# directly: sudo image/build.sh <board>

SHELL := /bin/bash
ROOT  := $(CURDIR)
BUILDER := chaosops-os-builder
VERSION ?= $(shell date -u +%Y.%m.%d)-$(shell git rev-parse --short HEAD 2>/dev/null || echo dev)

platform_x86_64       := linux/amd64
platform_rpi4-aarch64 := linux/arm64
BOARDS := x86_64 rpi4-aarch64

.PHONY: shell agent-test clean run-x86_64 $(addprefix image-,$(BOARDS))

shell:
	cd kiosk-shell && npm install && npm run build
	rm -rf os/rootfs/opt/chaosops/kiosk-shell
	cp -a kiosk-shell/dist os/rootfs/opt/chaosops/kiosk-shell

agent-test:
	cd wifi-agent && npm test

# Scratch work + pacman cache live in a Docker volume (needs a real Linux fs);
# only the finished image lands in ./out.
$(addprefix image-,$(BOARDS)): image-%:
	docker build --platform $(platform_$*) -t $(BUILDER):$* image
	docker run --rm --privileged --platform $(platform_$*) \
	  -v "$(ROOT)":/repo -v chaosops-os-work:/work \
	  -e WORK=/work/$* -e OUT=/repo/out -e CHAOSOPS_VERSION=$(VERSION) \
	  -e ARCH_SNAPSHOT \
	  $(BUILDER):$* $*

run-x86_64:
	scripts/run-qemu.sh out/chaosops-os-x86_64.img

clean:
	rm -rf kiosk-shell/dist out .work
	-docker volume rm chaosops-os-work
