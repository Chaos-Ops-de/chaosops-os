#!/usr/bin/env python3
"""Regenerate the ChaosOps Plymouth splash assets.

    python3 scripts/make-splash-assets.py [path/to/chaosops-design]

Gremlins/logo are copied (downscaled) from @chaos-ops-de/design; the progress
bar pieces are drawn here in the design's sticker style — white pill, 2px ink
outline, amber fill — as 3-slice images (left cap, 1px stretchable middle,
right cap) so the splash script can size the bar to any screen without
distorting the outline. Colors are the design's light palette (tokens/colors.ts).
Output: os/rootfs/usr/share/plymouth/themes/chaosops/. Needs Pillow.
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
DESIGN = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / "chaosops-design"
OUT = REPO / "os/rootfs/usr/share/plymouth/themes/chaosops"

INK = (0x18, 0x18, 0x18, 255)       # palette.light.ink / border
CARD = (0xFF, 0xFF, 0xFF, 255)      # palette.light.cardBg
AMBER = (0xFB, 0xBF, 0x24, 255)     # palette.light.amber
CLEAR = (0, 0, 0, 0)

H = 48            # bar height the pieces are drawn at (the script rescales)
BORDER = 4        # outline at H=48 ≈ the design's 2px at typical on-screen size
PAD = 3           # gap between outline and amber fill
SS = 4            # supersampling for smooth edges


def pill(width, height, fill=None, outline=None, outline_w=0):
    """A fully rounded pill, antialiased via supersampling."""
    img = Image.new("RGBA", (width * SS, height * SS), CLEAR)
    d = ImageDraw.Draw(img)
    box = (0, 0, width * SS - 1, height * SS - 1)
    d.rounded_rectangle(box, radius=height * SS // 2, fill=fill, outline=outline, width=outline_w * SS)
    return img.resize((width, height), Image.LANCZOS)


def three_slice(img, cap):
    w, h = img.size
    return (img.crop((0, 0, cap, h)), img.crop((w // 2, 0, w // 2 + 1, h)), img.crop((w - cap, 0, w, h)))


def save_slices(name, img, cap):
    for part, piece in zip("lmr", three_slice(img, cap)):
        piece.save(OUT / f"{name}-{part}.png")


def fit(src, max_side):
    img = Image.open(src).convert("RGBA")
    img.thumbnail((max_side, max_side), Image.LANCZOS)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # Track (white pill) under the fill, outline ring on top of it.
    save_slices("bar-track", pill(H * 3, H, fill=CARD), H // 2)
    save_slices("bar-ring", pill(H * 3, H, outline=INK, outline_w=BORDER), H // 2)
    # Amber fill: its own pill, inset inside the outline.
    fh = H - 2 * (BORDER + PAD)
    save_slices("bar-fill", pill(fh * 3, fh, fill=AMBER), fh // 2)
    # Small amber dot (the "z"s of the shutdown gremlin).
    pill(24, 24, fill=AMBER).save(OUT / "dot.png")

    assets = DESIGN / "src/assets"
    fit(assets / "logo.png", 512).save(OUT / "logo.png", optimize=True)
    fit(assets / "gremlins/loadingbar.png", 256).save(OUT / "gremlin-loading.png", optimize=True)
    fit(assets / "gremlins/sleep.png", 320).save(OUT / "gremlin-sleep.png", optimize=True)
    print(f"wrote splash assets to {OUT.relative_to(REPO)}")


if __name__ == "__main__":
    main()
