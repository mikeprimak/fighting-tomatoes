#!/usr/bin/env python3
"""Rebuild the card-placement social banner (1200x630).

  python banner.py --names "Ilia Topuria|Sean Strickland|..." --out /path/to/thumb.png

Arena photo (assets/bg.jpg) cover-fit + darkened, Chael Sonnen cutout
(assets/subject_cut.png, pre-cut with rembg) on the right, gold title, and the
top-5 Big Card pound-for-pound names down the left. The names are passed in by
the generator so the banner stays in sync with the leaderboard.
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
W, H = 1200, 630
GOLD = (245, 197, 24, 255)


def font(sz, bold=True):
    name = "arialbd.ttf" if bold else "arial.ttf"
    for p in (os.path.join("C:/Windows/Fonts", name),
              f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",
              f"/usr/share/fonts/truetype/liberation/LiberationSans{'-Bold' if bold else '-Regular'}.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", required=True, help="pipe-separated top-5 names")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    names = [n.strip() for n in a.names.split("|") if n.strip()][:5]

    bg = Image.open(os.path.join(ASSETS, "bg.jpg")).convert("RGBA")
    s = max(W / bg.width, H / bg.height)
    bg = bg.resize((int(bg.width * s), int(bg.height * s)), Image.LANCZOS)
    bx, by = (bg.width - W) // 2, (bg.height - H) // 2
    bg = bg.crop((bx, by, bx + W, by + H))

    canvas = Image.alpha_composite(bg, Image.new("RGBA", (W, H), (6, 6, 6, 200)))
    grad = Image.new("L", (W, 1), 0)
    for x in range(W):
        grad.putpixel((x, 0), int(180 * max(0.0, 1 - x / 760)))
    grad = grad.resize((W, H))
    black = Image.new("RGBA", (W, H), (0, 0, 0, 255)); black.putalpha(grad)
    canvas = Image.alpha_composite(canvas, black)

    cut = Image.open(os.path.join(ASSETS, "subject_cut.png")).convert("RGBA")
    cut = cut.crop(cut.getbbox())
    target_h = 860
    sc = target_h / cut.height
    sw, sh = int(cut.width * sc), int(cut.height * sc)
    canvas.alpha_composite(cut.resize((sw, sh), Image.LANCZOS), (W - sw + 70, -40))

    draw = ImageDraw.Draw(canvas)
    ty, tf = 58, font(98)
    for ln in ["Placement", "on the Card"]:
        draw.text((58, ty), ln, font=tf, fill=GOLD); ty += 106

    ly = ty + 44
    for i, n in enumerate(names, 1):
        draw.text((58, ly), str(i), font=font(36), fill=GOLD)
        draw.text((108, ly), n, font=font(36, bold=False), fill=(245, 245, 245, 255))
        ly += 54

    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    canvas.convert("RGB").save(a.out, quality=92)
    print(f"banner saved: {a.out}  names={names}")


if __name__ == "__main__":
    main()
