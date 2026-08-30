#!/usr/bin/env python3
"""Normalize and crop raw extension / web UI captures for store compositing."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'store/screenshots/source'


def load_rgb(path: Path) -> Image.Image:
    with Image.open(path) as img:
        return img.convert('RGB')


def crop_to_content(img: Image.Image, *, threshold: int = 28) -> Image.Image:
    """Trim uniform dark margins around a centered UI capture."""
    px = img.load()
    w, h = img.size
    min_x, min_y = w, h
    max_x, max_y = 0, 0

    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if r > threshold or g > threshold or b > threshold:
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)

    if max_x <= min_x or max_y <= min_y:
        return img

    pad = 8
    left = max(0, min_x - pad)
    top = max(0, min_y - pad)
    right = min(w, max_x + pad + 1)
    bottom = min(h, max_y + pad + 1)
    return img.crop((left, top, right, bottom))


def redact_sign_out(img: Image.Image) -> Image.Image:
    """Cover the username in the web UI nav bar."""
    out = img.copy()
    draw = ImageDraw.Draw(out)
    w, _ = out.size
    # Nav "Sign out (...)" sits on the far right of the header row.
    draw.rectangle((w - 132, 0, w, 34), fill=(15, 18, 28))
    return out


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, format='PNG', optimize=True)


def main() -> None:
    popup = load_rgb(SOURCE / 'popup.png')
    save_png(popup, SOURCE / 'popup-cropped.png')

    web_jobs = [
        ('web-dashboard.jpg', 'web-dashboard-cropped.png'),
        ('web-agent.jpg', 'web-agent-cropped.png'),
        ('web-settings.jpg', 'web-settings-cropped.png'),
    ]

    for src_name, out_name in web_jobs:
        src = SOURCE / src_name
        if not src.exists():
            continue
        cropped = crop_to_content(load_rgb(src))
        cropped = redact_sign_out(cropped)
        save_png(cropped, SOURCE / out_name)
        print(f'source/{out_name}')


if __name__ == '__main__':
    main()
