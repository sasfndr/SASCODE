#!/usr/bin/env python3
"""Build the comparison artefacts for a SASCODE visual checkpoint.

Produces, from a design source and an implementation capture at the same size:

  * ``*-side-by-side.png`` — source left, implementation right, labelled.
  * ``*-overlay.png``      — implementation composited over the source at 50%,
                             which is where drift in anchor position and
                             proportion becomes obvious.
  * ``*-diff.png``         — absolute per-pixel difference, brightened, for
                             spotting structural rather than tonal differences.

Development tooling only; nothing in the app imports it.

Usage:
  python3 scripts/visual-compare.py SOURCE.png AFTER.png OUT_PREFIX [--before BEFORE.png]
"""

from __future__ import annotations

import argparse
import pathlib

from PIL import Image, ImageChops, ImageDraw, ImageEnhance

LABEL_HEIGHT = 34
GUTTER = 16
BACKDROP = (14, 16, 20)
LABEL_INK = (232, 236, 242)


def load_matched(path: pathlib.Path, size: tuple[int, int]) -> Image.Image:
    """Loads an image as RGB, resized to `size` only when it differs."""
    image = Image.open(path).convert("RGB")
    return image if image.size == size else image.resize(size, Image.LANCZOS)


def label_strip(width: int, text: str) -> Image.Image:
    strip = Image.new("RGB", (width, LABEL_HEIGHT), BACKDROP)
    draw = ImageDraw.Draw(strip)
    draw.text((10, 10), text, fill=LABEL_INK)
    return strip


def stack_labelled(panels: list[tuple[str, Image.Image]]) -> Image.Image:
    width = sum(panel.width for _, panel in panels) + GUTTER * (len(panels) - 1)
    height = max(panel.height for _, panel in panels) + LABEL_HEIGHT
    sheet = Image.new("RGB", (width, height), BACKDROP)
    x = 0
    for title, panel in panels:
        sheet.paste(label_strip(panel.width, title), (x, 0))
        sheet.paste(panel, (x, LABEL_HEIGHT))
        x += panel.width + GUTTER
    return sheet


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("after")
    parser.add_argument("out_prefix")
    parser.add_argument("--before", default=None)
    arguments = parser.parse_args()

    source_path = pathlib.Path(arguments.source)
    after_path = pathlib.Path(arguments.after)
    prefix = pathlib.Path(arguments.out_prefix)
    prefix.parent.mkdir(parents=True, exist_ok=True)

    source = Image.open(source_path).convert("RGB")
    size = source.size
    after = load_matched(after_path, size)

    panels = [("REFERENCE  01-dusk-workspace-foundation.png", source)]
    if arguments.before:
        panels.insert(0, ("BEFORE  current implementation", load_matched(pathlib.Path(arguments.before), size)))
    panels.append(("AFTER  rebuilt implementation", after))

    side_by_side = stack_labelled(panels)
    side_by_side.save(f"{prefix}-side-by-side.png")

    overlay = Image.blend(source, after, 0.5)
    stack_labelled([("OVERLAY  reference + rebuilt at 50%", overlay)]).save(f"{prefix}-overlay.png")

    difference = ImageChops.difference(source, after)
    difference = ImageEnhance.Brightness(difference).enhance(3.0)
    stack_labelled([("DIFF  absolute difference, brightened 3x", difference)]).save(
        f"{prefix}-diff.png"
    )

    # A single scalar makes iteration measurable between passes.
    histogram = ImageChops.difference(source, after).convert("L").histogram()
    total = sum(histogram)
    mean = sum(value * count for value, count in enumerate(histogram)) / max(total, 1)
    print(f"visual-compare: size={size[0]}x{size[1]} mean_abs_diff={mean:.2f}/255")
    print(f"visual-compare: wrote {prefix}-side-by-side.png, -overlay.png, -diff.png")


if __name__ == "__main__":
    main()
