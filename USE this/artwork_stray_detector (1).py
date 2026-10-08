#!/usr/bin/env python3
"""
Artwork Stray Line / Dot Detector & AI Artwork QA Scanner
---------------------------------------------------------
Detects thin isolated lines and small isolated dots/marks in artwork,
with Intentional vs. Accidental classification and Brand Whitelist.

Usage:
    python artwork_stray_detector.py input.jpg
    python artwork_stray_detector.py input.png --out-dir results

Dependencies:
    pip install opencv-python numpy
"""

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import cv2
import numpy as np

# Whitelisted Brand & Industry Vocabulary (Never flagged as spelling typos)
BRAND_WHITELIST = {
    "ezlicence", "ezlicense", "bannerbuzz", "bestofsigns", "qpex", "syntopic",
    "pcos", "caterpillar", "book", "australia", "com.au", "corflute", "vinyl",
    "grommets", "grommet", "die-cut", "polypropylene", "knitted", "polyester",
    "retractable", "teardrop", "feather", "mesh", "substrate", "adhesive",
    "wind-resistant", "anti-peel", "ultraviolet", "cmyk", "rgb", "pantone"
}

TYPO_DICTIONARY = {
    "ezlicnce": {"suggestion": "EzLicence", "is_brand": True},
    "ezlisence": {"suggestion": "EzLicence", "is_brand": True},
    "oppening": {"suggestion": "Opening", "is_brand": False},
    "oppen": {"suggestion": "Open", "is_brand": False},
    "welcom": {"suggestion": "Welcome", "is_brand": False},
    "wellcome": {"suggestion": "Welcome", "is_brand": False},
    "northumberlad": {"suggestion": "Northumberland", "is_brand": False},
    "contrator": {"suggestion": "Contractor", "is_brand": False},
    "contarctor": {"suggestion": "Contractor", "is_brand": False},
    "buisness": {"suggestion": "Business", "is_brand": False},
    "busness": {"suggestion": "Business", "is_brand": False},
    "phne": {"suggestion": "Phone", "is_brand": False},
    "telephne": {"suggestion": "Telephone", "is_brand": False},
    "discout": {"suggestion": "Discount", "is_brand": False},
    "discont": {"suggestion": "Discount", "is_brand": False},
    "gromets": {"suggestion": "Grommets", "is_brand": False},
    "gromet": {"suggestion": "Grommet", "is_brand": False},
    "specal": {"suggestion": "Special", "is_brand": False},
    "speciall": {"suggestion": "Special", "is_brand": False},
    "resturant": {"suggestion": "Restaurant", "is_brand": False},
    "restarant": {"suggestion": "Restaurant", "is_brand": False},
    "offfice": {"suggestion": "Office", "is_brand": False},
    "emegency": {"suggestion": "Emergency", "is_brand": False},
    "emergancy": {"suggestion": "Emergency", "is_brand": False},
    "addres": {"suggestion": "Address", "is_brand": False},
    "tommorow": {"suggestion": "Tomorrow", "is_brand": False},
    "servise": {"suggestion": "Service", "is_brand": False},
    "garuantee": {"suggestion": "Guarantee", "is_brand": False},
    "garantee": {"suggestion": "Guarantee", "is_brand": False},
    "custum": {"suggestion": "Custom", "is_brand": False},
    "custome": {"suggestion": "Custom", "is_brand": False},
    "bannar": {"suggestion": "Banner", "is_brand": False},
    "bannner": {"suggestion": "Banner", "is_brand": False},
    "qualty": {"suggestion": "Quality", "is_brand": False},
    "licenced": {"suggestion": "Licensed", "is_brand": False},
    "insurrance": {"suggestion": "Insurance", "is_brand": False}
}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def json_serializer(o):
    if isinstance(o, (np.integer, np.int32, np.int64)):
        return int(o)
    if isinstance(o, (np.floating, np.float32, np.float64)):
        return float(o)
    if isinstance(o, np.ndarray):
        return o.tolist()
    return str(o)


def detect_stray_marks(image, min_line_length=30, max_dot_area=80):
    original = image.copy()
    h, w = image.shape[:2]

    # Convert to grayscale and adaptive threshold
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV, 31, 8
    )

    kernel = np.ones((2, 2), np.uint8)
    clean = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    # Cluster major artwork regions (Text, Logos, Graphic Shapes)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(clean, connectivity=8)
    significant_mask = np.zeros_like(clean)
    for i in range(1, num_labels):
        x, y, bw, bh, area = stats[i]
        if area > 100 or bw > 16 or bh > 16:
            significant_mask[labels == i] = 255

    inv_sig = cv2.bitwise_not(significant_mask)
    dist_map = cv2.distanceTransform(inv_sig, cv2.DIST_L2, 5)

    detections = []

    # 1. Detect thin straight lines
    edges = cv2.Canny(clean, 50, 150)
    lines = cv2.HoughLinesP(
        edges, rho=1, theta=np.pi / 180,
        threshold=max(20, int(min(w, h) * 0.05)),
        minLineLength=min_line_length, maxLineGap=3
    )

    if lines is not None:
        for line_entry in lines:
            x1, y1, x2, y2 = map(int, line_entry.reshape(-1)[:4])
            dx = x2 - x1
            dy = y2 - y1
            length = float(np.hypot(dx, dy))
            if length < min_line_length:
                continue

            angle = abs(np.degrees(np.arctan2(dy, dx)))
            is_horizontal = angle <= 3 or angle >= 177
            is_vertical = abs(angle - 90) <= 3
            if not (is_horizontal or is_vertical):
                continue

            # Ignore image borders
            if (min(x1, x2) <= 3 or max(x1, x2) >= w - 4 or
                min(y1, y2) <= 3 or max(y1, y2) >= h - 4):
                continue

            mid_x = int((x1 + x2) / 2)
            mid_y = int((y1 + y2) / 2)
            dist_to_art = float(dist_map[mid_y, mid_x]) if 0 <= mid_y < h and 0 <= mid_x < w else 0.0

            # Thickness
            thickness = 1
            if is_horizontal:
                y = int((y1 + y2) / 2)
                strip = clean[clamp(y - 3, 0, h):clamp(y + 4, 0, h), clamp(min(x1, x2), 0, w):clamp(max(x1, x2) + 1, 0, w)]
                if strip.size:
                    ys, _ = np.where(strip > 0)
                    if len(ys): thickness = int(max(1, ys.max() - ys.min() + 1))
            else:
                x = int((x1 + x2) / 2)
                strip = clean[clamp(min(y1, y2), 0, h):clamp(max(y1, y2) + 1, 0, h), clamp(x - 3, 0, w):clamp(x + 4, 0, w)]
                if strip.size:
                    _, xs = np.where(strip > 0)
                    if len(xs): thickness = int(max(1, xs.max() - xs.min() + 1))

            # Isolated line
            if thickness <= 4 and dist_to_art > 14.0:
                pad = 6
                bx1 = clamp(min(x1, x2) - pad, 0, w - 1)
                by1 = clamp(min(y1, y2) - pad, 0, h - 1)
                bx2 = clamp(max(x1, x2) + pad, 0, w - 1)
                by2 = clamp(max(y1, y2) + pad, 0, h - 1)

                detections.append({
                    "type": "possible_stray_line",
                    "severity": "Minor",
                    "bbox": [int(bx1), int(by1), int(bx2), int(by2)],
                    "length_px": round(length, 1),
                    "thickness_px": int(thickness),
                    "angle_deg": round(angle, 1),
                    "isolation_distance_px": round(dist_to_art, 1),
                    "confidence": round(min(0.99, 0.85 + min(dist_to_art / 100.0, 0.14)), 2)
                })

    # 2. Detect tiny isolated dots with intentionality filter
    for i in range(1, num_labels):
        x, y, bw, bh, area = stats[i]
        cx, cy = centroids[i]

        if area <= max_dot_area and bw <= 15 and bh <= 15:
            if x <= 2 or y <= 2 or x + bw >= w - 2 or y + bh >= h - 2:
                continue

            dist_to_art = float(dist_map[clamp(int(cy), 0, h - 1), clamp(int(cx), 0, w - 1)])

            # Intentionality Filter: if within 18px of text/logo, it's intentional (i-dot, period, etc.)
            if dist_to_art <= 18.0:
                continue

            aspect = bw / max(bh, 1)
            compact = area / max(bw * bh, 1)
            if 0.25 <= aspect <= 4 and compact >= 0.20:
                confidence = 0.98 if area <= 10 else 0.95 if area <= 25 else 0.90
                pad = 8
                bx1 = clamp(x - pad, 0, w - 1)
                by1 = clamp(y - pad, 0, h - 1)
                bx2 = clamp(x + bw + pad, 0, w - 1)
                by2 = clamp(y + bh + pad, 0, h - 1)

                detections.append({
                    "type": "possible_stray_dot",
                    "severity": "Minor",
                    "bbox": [int(bx1), int(by1), int(bx2), int(by2)],
                    "component_area_px": int(area),
                    "component_size_px": [int(bw), int(bh)],
                    "center_px": [round(float(cx), 1), round(float(cy), 1)],
                    "isolation_distance_px": round(dist_to_art, 1),
                    "confidence": confidence
                })

    # 3. Non-Maximum Suppression (Deduplication)
    final = []
    for d in sorted(detections, key=lambda x: x["confidence"], reverse=True):
        x1, y1, x2, y2 = d["bbox"]
        duplicate = False
        for existing in final:
            a1, b1, a2, b2 = existing["bbox"]
            ix1, iy1 = max(x1, a1), max(y1, b1)
            ix2, iy2 = min(x2, a2), min(y2, b2)
            if ix2 > ix1 and iy2 > iy1:
                inter = (ix2 - ix1) * (iy2 - iy1)
                area1 = max(1, (x2 - x1) * (y2 - y1))
                area2 = max(1, (a2 - a1) * (b2 - b1))
                iou = inter / float(area1 + area2 - inter)
                if iou > 0.30:
                    duplicate = True
                    break
        if not duplicate:
            final.append(d)

    return original, final


def annotate(image, detections):
    output = image.copy()
    for idx, d in enumerate(detections, start=1):
        x1, y1, x2, y2 = d["bbox"]
        color = (0, 0, 255) if d.get("severity") == "Fatal" else (0, 140, 255) if d.get("severity") == "Major" else (0, 200, 255)
        cv2.rectangle(output, (x1, y1), (x2, y2), color, 2)
        label = f"{idx}: {d['type']} {d['confidence']:.0%}"
        text_y = max(18, y1 - 6)
        cv2.putText(output, label, (x1, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1, cv2.LINE_AA)
    return output


def main():
    parser = argparse.ArgumentParser(description="Detect suspicious stray lines and dots in artwork.")
    parser.add_argument("input", help="Input artwork JPG/PNG")
    parser.add_argument("--out-dir", default="artwork_qa_results", help="Output directory")
    parser.add_argument("--min-line-length", type=int, default=30, help="Minimum line length in pixels")
    parser.add_argument("--max-dot-area", type=int, default=80, help="Maximum connected-component area")

    args = parser.parse_args()
    input_path = Path(args.input)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    image = cv2.imread(str(input_path), cv2.IMREAD_COLOR)
    if image is None:
        raise SystemExit(f"ERROR: Cannot read image: {input_path}")

    original, detections = detect_stray_marks(
        image,
        min_line_length=args.min_line_length,
        max_dot_area=args.max_dot_area
    )

    annotated = annotate(original, detections)
    annotated_path = out_dir / "annotated.png"
    json_path = out_dir / "detections.json"

    cv2.imwrite(str(annotated_path), annotated)

    report = {
        "input_file": str(input_path),
        "image_size": {"width": int(image.shape[1]), "height": int(image.shape[0])},
        "total_detections": len(detections),
        "detections": detections
    }

    json_path.write_text(json.dumps(report, indent=2, default=json_serializer), encoding="utf-8")

    print("=" * 60)
    print("ARTWORK STRAY MARK QA")
    print("=" * 60)
    print(f"Input:       {input_path}")
    print(f"Detections:  {len(detections)}")
    print(f"Annotated:   {annotated_path}")
    print(f"JSON report: {json_path}")
    print()


if __name__ == "__main__":
    main()
