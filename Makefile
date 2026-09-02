# ChaosOps OS — build entrypoints.
#
#   make shell   # build the branded kiosk-shell UI -> kiosk-shell/dist (host node)
#   make image   # build the bootable x86-64 ISO   -> image/out/chaosops-os-amd64.iso
#   make agent-test  # run the wifi-agent smoke tests
#   make clean
#
# `make image` runs live-build inside a privileged Debian container so it works
# on any Docker host. It consumes kiosk-shell/dist, so it depends on `shell`.

SHELL := /bin/bash
ROOT  := $(CURDIR)
BUILDER_IMAGE := chaosops-os-builder

.PHONY: image shell agent-test clean

shell:
	cd kiosk-shell && npm install && npm run build

agent-test:
	cd wifi-agent && npm test

image: shell
	docker build --platform linux/amd64 -t $(BUILDER_IMAGE) image
	docker run --rm --platform linux/amd64 --privileged -v "$(ROOT)":/repo $(BUILDER_IMAGE)
	@echo "Artifact: image/out/chaosops-os-amd64.iso"

clean:
	rm -rf kiosk-shell/dist image/.build image/config/includes.chroot image/out
