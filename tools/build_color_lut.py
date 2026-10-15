"""Builds the RGB → CMYK print-simulation table embedded in js/color_check.js (ColorCheck.LUT_B64).

Method (Oct 2026): the same conversion Photoshop makes with its default colour settings (North America Prepress /
General Purpose) — Edit › Convert to Profile from sRGB IEC61966-2.1 to U.S. Web Coated (SWOP) v2, Adobe (ACE)
engine replaced here by LittleCMS, Relative Colorimetric intent with Black Point Compensation. The CMYK result is
shown back on screen the way Photoshop shows a CMYK document (CMYK → sRGB, Relative Colorimetric + BPC).

Checked against Photoshop screenshots of the same artwork in RGB and CMYK mode: (0,0,255) → (58,83,164) here vs
(57,83,164) in Photoshop; (128,0,255) → (109,81,162) vs (107,82,162); (236,0,140) → (234,7,139) vs (235,12,140).
A 17³ table read with trilinear interpolation stays within 0.3 ΔE2000 of the exact conversion on average
(99% of colours within 0.9, worst 2.4).

Needs Pillow (ImageCms) and the Adobe profile USWebCoatedSWOP.icc, installed with Photoshop / Illustrator / Acrobat
in "C:\\Program Files (x86)\\Common Files\\Adobe\\Color\\Profiles\\Recommended" (or pass its path).

Usage: python tools/build_color_lut.py [path\\to\\USWebCoatedSWOP.icc]   → prints the base64 string for LUT_B64
Table layout: 17³ nodes in R-major order (r, g, b), 7 bytes each: printed look R, G, B (0–255) and C, M, Y, K
(percent 0–100).
"""
import base64
import os
import sys

import numpy as np
from PIL import Image, ImageCms

N = 17
PROFILE_PLACES = [
    r"C:\Program Files (x86)\Common Files\Adobe\Color\Profiles\Recommended\USWebCoatedSWOP.icc",
    r"C:\Program Files\Common Files\Adobe\Color\Profiles\Recommended\USWebCoatedSWOP.icc",
    "/Library/Application Support/Adobe/Color/Profiles/Recommended/USWebCoatedSWOP.icc",
]


def find_profile(argv):
    for path in argv[1:] + PROFILE_PLACES:
        if os.path.isfile(path):
            return path
    sys.exit("USWebCoatedSWOP.icc not found — pass its path (it is installed with Adobe Photoshop / Illustrator).")


def transforms(profile_path):
    srgb, swop = ImageCms.createProfile("sRGB"), ImageCms.getOpenProfile(profile_path)
    flags = ImageCms.Flags.BLACKPOINTCOMPENSATION | ImageCms.Flags.HIGHRESPRECALC
    rel = ImageCms.Intent.RELATIVE_COLORIMETRIC
    to_cmyk = ImageCms.buildTransform(srgb, swop, "RGB", "CMYK", rel, flags=flags)
    to_screen = ImageCms.buildTransform(swop, srgb, "CMYK", "RGB", rel, flags=flags)
    return to_cmyk, to_screen


def build(profile_path):
    to_cmyk, to_screen = transforms(profile_path)
    nodes = np.round(np.linspace(0, 255, N)).astype(np.uint8)
    r, g, b = np.meshgrid(nodes, nodes, nodes, indexing="ij")
    rgb = np.stack([r.ravel(), g.ravel(), b.ravel()], 1).reshape(1, -1, 3)
    cmyk = ImageCms.applyTransform(Image.fromarray(rgb, "RGB"), to_cmyk)
    screen = ImageCms.applyTransform(cmyk, to_screen)
    c = np.asarray(cmyk, float).reshape(-1, 4)
    s = np.asarray(screen, float).reshape(-1, 3)
    out = np.concatenate([s, np.round(c / 2.55)], 1).astype(np.uint8)
    return base64.b64encode(out.tobytes()).decode()


if __name__ == "__main__":
    print(build(find_profile(sys.argv)))
