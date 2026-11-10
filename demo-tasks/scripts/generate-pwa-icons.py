#!/usr/bin/env python3
"""Generate the DEMO PWA icons.

Black field (#0B0B0D), Inter Black wordmark in #FF5A1F. The letters take most
of the width and stay inside the maskable safe zone (circle, diameter 80%).

Requires Pillow and fontTools, plus an Inter Black (weight 900) TTF:

    pip install pillow fonttools
    curl -fsSL -o /tmp/Inter-Black.ttf \\
      https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.8/latin-900-normal.ttf
    python3 scripts/generate-pwa-icons.py /tmp/Inter-Black.ttf
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "frontend" / "public"

BG = (0x0B, 0x0B, 0x0D)
BG_HEX = "#0B0B0D"
FG = (0xFF, 0x5A, 0x1F)
FG_HEX = "#FF5A1F"
TEXT = "DEMO"
TRACKING_EM = -0.05
# Maskable safe zone is a circle of radius 0.40. Stay a little inside it so
# antialiased edges are not clipped by circular or squircle masks.
MAX_RADIUS_RATIO = 0.394


def render(font_path: str, size: int, font_size: float) -> Image.Image:
    font = ImageFont.truetype(font_path, font_size)
    widths = [font.getlength(ch) for ch in TEXT]
    boxes = [font.getbbox(ch) for ch in TEXT]
    tracking = TRACKING_EM * font_size
    ink_left = boxes[0][0]
    ink_right = sum(widths[:-1]) + tracking * (len(TEXT) - 1) + boxes[-1][2]
    ink_w = ink_right - ink_left
    ink_top = min(box[1] for box in boxes)
    ink_bot = max(box[3] for box in boxes)
    ink_h = ink_bot - ink_top
    image = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(image)
    x = (size - ink_w) / 2 - ink_left
    y = (size - ink_h) / 2 - ink_top
    cursor = x
    for ch, width in zip(TEXT, widths):
        draw.text((cursor, y), ch, font=font, fill=FG)
        cursor += width + tracking
    return image


def measure(image: Image.Image) -> tuple[float, float, float, int]:
    pixels = image.load()
    size = image.width
    center = (size - 1) / 2
    limit = 0.40 * size
    xs: list[int] = []
    ys: list[int] = []
    max_distance = 0.0
    outside = 0
    for y in range(size):
        for x in range(size):
            if pixels[x, y] == BG:
                continue
            distance = math.hypot(x - center, y - center)
            max_distance = max(max_distance, distance)
            if distance > limit:
                outside += 1
            xs.append(x)
            ys.append(y)
    if not xs:
        return 0.0, 0.0, 0.0, 0
    width = (max(xs) - min(xs) + 1) / size
    height = (max(ys) - min(ys) + 1) / size
    return width, height, max_distance / size, outside


def fit(font_path: str, size: int) -> tuple[float, Image.Image]:
    low = 1.0
    high = size * 0.85
    best_size = 0.0
    best: Image.Image | None = None
    for _ in range(20):
        font_size = (low + high) / 2
        image = render(font_path, size, font_size)
        _width, _height, radius, outside = measure(image)
        if outside == 0 and radius <= MAX_RADIUS_RATIO and _width > 0:
            best_size = font_size
            best = image
            low = font_size
        else:
            high = font_size
    if best is None:
        raise SystemExit(f"could not fit DEMO into {size}px")
    return best_size, best


def assert_icon(path: Path, size: int) -> None:
    image = Image.open(path)
    if image.size != (size, size):
        raise SystemExit(f"{path} is {image.size}, expected {size}x{size}")
    if image.mode != "RGB":
        raise SystemExit(f"{path} mode is {image.mode}, expected opaque RGB")
    header = path.read_bytes()
    # PNG color type sits at byte 25 of a standard IHDR. 2 = truecolor, no alpha.
    if header[:8] == b"\x89PNG\r\n\x1a\n" and header[25] != 2:
        raise SystemExit(f"{path} PNG color type {header[25]} is not opaque truecolor")
    width, height, radius, outside = measure(image)
    if outside or radius > 0.40:
        raise SystemExit(f"{path} leaves the maskable safe zone (radius {radius:.3f})")
    if size >= 32 and width < 0.62:
        raise SystemExit(f"{path} wordmark is only {width:.0%} of the width")
    print(f"{path.name:32} {size:3}px  width {width:.1%}  height {height:.1%}  radius {radius:.3f}")


def write_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True)


def wordmark_svg(font_path: str, font_size: float) -> str:
    """Outline the same layout as the 512 PNG so the favicon does not need a webfont."""
    font = ImageFont.truetype(font_path, font_size)
    widths = [font.getlength(ch) for ch in TEXT]
    boxes = [font.getbbox(ch) for ch in TEXT]
    tracking = TRACKING_EM * font_size
    ink_left = boxes[0][0]
    ink_right = sum(widths[:-1]) + tracking * (len(TEXT) - 1) + boxes[-1][2]
    ink_w = ink_right - ink_left
    ink_top = min(box[1] for box in boxes)
    ink_bot = max(box[3] for box in boxes)
    ink_h = ink_bot - ink_top
    size = 512
    x = (size - ink_w) / 2 - ink_left
    ascent, _descent = font.getmetrics()
    baseline = (size - ink_h) / 2 - ink_top + ascent

    tt = TTFont(font_path)
    glyph_set = tt.getGlyphSet()
    cmap = tt.getBestCmap()
    scale = font_size / tt["head"].unitsPerEm
    groups: list[str] = []
    cursor = x
    for ch, width in zip(TEXT, widths):
        pen = SVGPathPen(glyph_set)
        glyph_set[cmap[ord(ch)]].draw(pen)
        groups.append(
            f'<g transform="translate({cursor:.3f} {baseline:.3f}) scale({scale:.6f} {-scale:.6f})">'
            f'<path d="{pen.getCommands()}"/></g>'
        )
        cursor += width + tracking
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<rect width="{size}" height="{size}" fill="{BG_HEX}"/>'
        f'<g fill="{FG_HEX}">{"".join(groups)}</g>'
        f"</svg>\n"
    )


def main() -> None:
    font_path = sys.argv[1] if len(sys.argv) > 1 else ""
    if not font_path or not Path(font_path).is_file():
        raise SystemExit("pass a path to Inter Black (weight 900) .ttf")

    icons = OUT / "pwa-icons"
    masters: dict[int, Image.Image] = {}
    for size in (16, 32, 48, 180, 192, 512):
        _font_size, image = fit(font_path, size)
        masters[size] = image

    write_png(masters[192], icons / "icon-192-v2.png")
    write_png(masters[512], icons / "icon-512-v2.png")
    write_png(masters[192], icons / "icon-192-maskable-v2.png")
    write_png(masters[512], icons / "icon-512-maskable-v2.png")
    write_png(masters[180], OUT / "apple-touch-icon-v2.png")
    write_png(masters[32], OUT / "favicon-32-v2.png")
    # Pillow skips ICO frames larger than the primary image, so 48px leads.
    masters[48].save(
        OUT / "favicon-v2.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[masters[16], masters[32]],
    )
    font_size_512, _image = fit(font_path, 512)
    (OUT / "favicon-v2.svg").write_text(wordmark_svg(font_path, font_size_512), encoding="utf-8")

    ico = Image.open(OUT / "favicon-v2.ico")
    ico_sizes = set(ico.info.get("sizes", []))
    if ico_sizes != {(16, 16), (32, 32), (48, 48)}:
        raise SystemExit(f"favicon-v2.ico sizes are {ico_sizes}")
    print(f"{'favicon-v2.ico':32} sizes {sorted(ico_sizes)}")

    for path, size in (
        (icons / "icon-192-v2.png", 192),
        (icons / "icon-512-v2.png", 512),
        (icons / "icon-192-maskable-v2.png", 192),
        (icons / "icon-512-maskable-v2.png", 512),
        (OUT / "apple-touch-icon-v2.png", 180),
        (OUT / "favicon-32-v2.png", 32),
    ):
        assert_icon(path, size)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
