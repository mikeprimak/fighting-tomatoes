"""Builds the fighter head cutouts used on the Round Numbers #1 banner.

Downloads the source photos, crops the head region, removes the background
with rembg (u2net), trims to content, drops everything below the chin and
fades the last stretch of neck so the cutout ends cleanly.

Both sources are US-government works (no attribution required on our read):
  McGregor:  File:Conor McGregor 2025.jpeg — official U.S. Secretary of
             Defense photo, tagged Public domain on Commons.
  Holloway:  File:Max Holloway 180428-D-SW162-1532 (27918239868).jpg —
             official DoD photo (the 180428-D-SW162 ID is DoD naming).
             NOTE: Commons carries the CJCS Flickr CC BY 2.0 tag, but as a
             work of a US military photographer on duty it is public domain
             under 17 USC 105; the CC tag cannot attach. Flagged to Mike
             2026-07-20 and accepted.

DO NOT REGENERATE max-head.png WITH THIS SCRIPT. The committed max-head.png
is Mike's manual GIMP cut of that DoD photo (max-edited-face.xcf on his
machine), finished with a defringe pass (largest-component keep, red/white
edge fringe removal, 1px erode + feather). Re-running the automated rembg
path here would clobber it with a worse cut, so 'max' is excluded from
SOURCES below.

Usage (needs Python with rembg + Pillow, both present on the dev machine):
  python scripts/cropLetdownsFaces.py
Writes: scripts/banner-assets/conor-head.png, max-head.png
"""
import io
import os
import subprocess

from PIL import Image
from rembg import remove

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(HERE, 'banner-assets')

SOURCES = {
    'conor': {
        'url': 'https://upload.wikimedia.org/wikipedia/commons/e/e5/Conor_McGregor_2025.jpeg',
        'crop': (250, 40, 1450, 1700),  # head box in the 1622x2321 original
        'neck_frac': 0.90,  # keep this fraction of the trimmed cutout's height
        'max_size': 500,
    },
}


def head_cut(url, box, neck_frac):
    """Segment, trim, then soft-mask the lower region with an ellipse centred
    on the face: the chin stays fully opaque while clothing at the bottom
    corners dissolves smoothly (no hard horizontal fade line)."""
    # curl instead of urllib: the system Python's cert store is stale
    raw = subprocess.run(['curl', '-sL', '-A', 'good-fights-banner/1.0', url],
                         capture_output=True, check=True).stdout
    img = Image.open(io.BytesIO(raw))
    cut = remove(img.crop(box))
    cut = cut.crop(cut.getchannel('A').getbbox())
    w, h = cut.size
    keep_h = int(h * neck_frac)
    cut = cut.crop((0, 0, w, keep_h))
    px = cut.load()
    cx, cy = w / 2.0, keep_h * 0.45
    rx, ry = w * 0.55, keep_h * 0.52
    D0, D1 = 0.88, 1.12  # soft edge band of the elliptical mask
    for y in range(int(cy), keep_h):
        for x in range(w):
            d = (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) ** 0.5
            if d <= D0:
                continue
            r_, g, b, a = px[x, y]
            if d >= D1:
                px[x, y] = (r_, g, b, 0)
            else:
                t = (d - D0) / (D1 - D0)
                f = (1 - t) * (1 - t) * (3 - 2 * (1 - t))  # smoothstep down
                px[x, y] = (r_, g, b, int(a * f))
    return cut


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, s in SOURCES.items():
        cut = head_cut(s['url'], s['crop'], s['neck_frac'])
        if s['max_size']:
            cut.thumbnail((s['max_size'], s['max_size']))
        out = os.path.join(OUT_DIR, f'{name}-head.png')
        cut.save(out)
        print(f'wrote {out} {cut.size}')


if __name__ == '__main__':
    main()
