"""Generate public/hero-fallback.jpg — the always-present LCP candidate.

Run from the Frontend/ directory:

    python scripts/generate-hero-fallback.py

The homepage hero normally comes from the hero-slides API. This is what shows
when it cannot: a client-side navigation to / that arrives before the API
answers, an empty slide list, or a cold Render instance. Without it the hero is
a grey pulse, which is not an LCP candidate at all — the browser has nothing to
paint and LCP waits for the network round trip.

Regenerate when the first hero slide changes. The output is committed so the
build stays a static file copy.
"""

import io
import json
import os
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "hero-fallback.jpg"

API = os.environ.get("VITE_API_URL", "https://pronoun-jeans.onrender.com/api/")
# The hero is full-bleed; 1600px covers a desktop viewport at 1x and a phone at
# 3x without shipping the multi-megabyte original.
TARGET_WIDTH = 1600
QUALITY = 78


def first_slide_url():
    with urllib.request.urlopen(f"{API.rstrip('/')}/products/hero-slides/", timeout=60) as r:
        slides = json.load(r)
    if not slides:
        raise SystemExit("hero-slides returned nothing — cannot build a fallback")
    return slides[0]["image"], slides[0].get("caption") or ""


def main():
    url, caption = first_slide_url()
    print(f"source slide: {caption or '(no caption)'}\n  {url}")

    with urllib.request.urlopen(url, timeout=120) as r:
        img = Image.open(io.BytesIO(r.read()))

    img = img.convert("RGB")
    if img.width > TARGET_WIDTH:
        height = round(img.height * TARGET_WIDTH / img.width)
        img = img.resize((TARGET_WIDTH, height), Image.LANCZOS)

    img.save(OUT, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({img.width}x{img.height}, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
