"""Generate public/og-default.jpg — the 1200x630 fallback Open Graph card.

Run from the Frontend/ directory:

    python scripts/generate-og-image.py

Regenerate this whenever public/logo.png changes. The output is committed, so
the build and the deploy stay a plain static-file copy with no image step.

Pillow is the only dependency and it is not part of the npm project; this is a
one-off asset script, deliberately kept out of the front-end dependency tree.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
LOGO = ROOT / "public" / "logo.png"
OUT = ROOT / "public" / "og-default.jpg"

WIDTH, HEIGHT = 1200, 630
BG = (255, 255, 255)
ACCENT = (220, 38, 38)          # --color-accent from src/index.css
MUTED = (107, 114, 128)         # --color-text-muted

TAGLINE = "Wholesale Denim Manufacturer  ·  Ahmedabad, India"

# Facebook and LinkedIn crop toward the centre, so the logo never gets closer
# to an edge than this.
LOGO_MAX_WIDTH = 720
TAGLINE_GAP = 44

FONT_CANDIDATES = [
    "C:/Windows/Fonts/segoeuisb.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return None


def main():
    logo = Image.open(LOGO).convert("RGBA")

    # logo.png is a wordmark on a transparent canvas with generous padding.
    # Trimming to the inked pixels first means the scale below is driven by the
    # mark itself, not by whitespace that happens to be baked into the file.
    bbox = logo.getchannel("A").getbbox()
    if bbox:
        logo = logo.crop(bbox)

    scale = min(LOGO_MAX_WIDTH / logo.width, 1.0)
    logo = logo.resize(
        (round(logo.width * scale), round(logo.height * scale)),
        Image.LANCZOS,
    )

    card = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(card)

    tagline_font = load_font(30)
    tagline_height = 30 if tagline_font is not None else 0

    # Centre the logo and tagline as one block, then lift it slightly: optical
    # centre sits above geometric centre, and the accent rule weights the foot
    # of the card.
    block_height = logo.height + (TAGLINE_GAP + tagline_height if tagline_font else 0)
    logo_top = round((HEIGHT - block_height) / 2) - 24

    card.paste(logo, ((WIDTH - logo.width) // 2, logo_top), logo)

    if tagline_font is not None:
        text_w = draw.textlength(TAGLINE, font=tagline_font)
        draw.text(
            ((WIDTH - text_w) / 2, logo_top + logo.height + TAGLINE_GAP),
            TAGLINE,
            font=tagline_font,
            fill=MUTED,
        )

    # Brand rule along the bottom edge — reads as intentional at thumbnail size
    # and keeps the card from looking like a bare logo on white.
    draw.rectangle([0, HEIGHT - 12, WIDTH, HEIGHT], fill=ACCENT)

    card.save(OUT, "JPEG", quality=88, optimize=True, progressive=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({card.width}x{card.height})")


if __name__ == "__main__":
    main()
