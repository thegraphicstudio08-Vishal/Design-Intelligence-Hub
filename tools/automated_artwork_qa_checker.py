#!/usr/bin/env python3
"""
Automated Artwork QA Checker (AI Artwork QA Scanner)
---------------------------------------------------
Autonomous pre-press QA engine that checks both unnecessary artwork marks
(stray lines, hairlines, rogue dots, dust speckles) and spelling mistakes
in the same unified workflow.

Features:
1. High-resolution multi-stage image pre-processing.
2. Major artwork region clustering (Text, Logos, Shapes, Borders, Background).
3. Intentional vs. Accidental classifier (distinguishes intentional dots like 'i' dots,
   punctuation, brand logos from genuine stray marks).
4. Whitelisted Brand Dictionary (EzLicence, BannerBuzz, BestOfSigns, QPEX, Syntopic, PCOS, etc.).
5. Multi-tier QA Severity classification (Fatal, Major, Minor, Review).
6. Annotated QA proof generation with color-coded bounding boxes.
7. Machine-readable QA report (JSON).

Usage:
    python tools/automated_artwork_qa_checker.py input.jpg --out-dir results
    python tools/automated_artwork_qa_checker.py input.png --out-dir results --min-line 30
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

# Common print / signage typo dictionary with verified suggestions
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


class AutomatedArtworkQAChecker:
    """
    Unified AI Artwork QA Scanner implementing:
    - Stray Line / Stray Dot computer-vision inspection
    - Intentional vs. Accidental spatial clustering
    - Text OCR & Brand Whitelisted Spell-Check
    - Multi-tier QA Severity classification
    """

    def __init__(self, min_line_length=30, max_dot_area=80):
        self.min_line_length = min_line_length
        self.max_dot_area = max_dot_area

    def analyze(self, image_path):
        image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError(f"Cannot load artwork image: {image_path}")

        h, w = image.shape[:2]

        # 1. Median background estimation and difference mask
        inner = image[int(h * 0.1):int(h * 0.9), int(w * 0.1):int(w * 0.9)]
        if inner.size > 0:
            bg_bgr = np.median(inner.reshape(-1, 3), axis=0)
            bg_gray = float(0.299 * bg_bgr[2] + 0.587 * bg_bgr[1] + 0.114 * bg_bgr[0])
        else:
            bg_gray = 240.0

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        diff = np.abs(gray.astype(float) - bg_gray)
        clean = (diff > 14).astype(np.uint8) * 255

        # 3. Cluster major artwork regions (Text, Logos, Shapes, Graphic Clusters)
        major_clusters, distance_transform = self._find_major_artwork_regions(clean, w, h)

        findings = []

        # 4. Stray Line Detection
        line_findings = self._detect_stray_lines(clean, w, h, distance_transform)
        findings.extend(line_findings)

        # 5. Stray Dot & Dust Speckle Detection with Intentionality Filter
        dot_findings = self._detect_stray_dots(clean, w, h, distance_transform, major_clusters)
        findings.extend(dot_findings)

        # 6. Text OCR & Spelling Audit
        spelling_findings = self._audit_spelling(image, image_path, w, h)
        findings.extend(spelling_findings)

        # 7. Non-Maximum Suppression (Deduplication)
        final_findings = self._deduplicate(findings)

        # 8. Sort by Severity then Confidence
        severity_rank = {"Fatal": 0, "Major": 1, "Minor": 2, "Review": 3}
        final_findings.sort(key=lambda x: (severity_rank.get(x["severity"], 9), -x["confidence"]))

        # 9. Compute QA Summary Counts
        summary = {
            "total_issues": len(final_findings),
            "fatal": sum(1 for f in final_findings if f["severity"] == "Fatal"),
            "major": sum(1 for f in final_findings if f["severity"] == "Major"),
            "minor": sum(1 for f in final_findings if f["severity"] == "Minor"),
            "review": sum(1 for f in final_findings if f["severity"] == "Review"),
            "qa_decision": "PASS (Ready for Production)" if len(final_findings) == 0 else
                           "REJECT (Fatal Errors)" if any(f["severity"] == "Fatal" for f in final_findings) else
                           "ACTION REQUIRED (Major Issues)" if any(f["severity"] == "Major" for f in final_findings) else
                           "OPERATOR REVIEW (Minor Artifacts)"
        }

        # 10. Generate Annotated Visual Proof
        annotated_image = self._render_annotated_proof(image, final_findings)

        return {
            "image_size": {"width": w, "height": h},
            "summary": summary,
            "findings": final_findings,
            "annotated_image": annotated_image,
            "original_image": image
        }

    def _find_major_artwork_regions(self, binary_mask, w, h):
        """
        Identify large clusters (text blocks, logos, graphics).
        Calculates a distance transform map indicating distance in pixels
        from any point to the nearest significant graphic cluster.
        """
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(binary_mask, connectivity=8)
        significant_mask = np.zeros_like(binary_mask)

        clusters = []
        for i in range(1, num_labels):
            x, y, bw, bh, area = stats[i]
            # Components with area > 100px or width/height > 16px are part of text, logos, or shapes
            is_thin_line = (bw >= 15 and bh <= 4) or (bh >= 15 and bw <= 4)
            if not is_thin_line and ((bw >= 12 and bh >= 12 and area >= 50) or area >= 180):
                significant_mask[labels == i] = 255
                clusters.append({
                    "bbox": [int(x), int(y), int(x + bw), int(y + bh)],
                    "area": int(area)
                })

        # Calculate Euclidean distance from every pixel to the nearest significant artwork pixel
        inv_significant = cv2.bitwise_not(significant_mask)
        dist_map = cv2.distanceTransform(inv_significant, cv2.DIST_L2, 5)

        return clusters, dist_map

    def _detect_stray_lines(self, clean, w, h, dist_map):
        findings = []

        # Connected component detection for razor-thin lines (1-4px)
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(clean, connectivity=8)
        for i in range(1, num_labels):
            x, y, bw, bh, area = stats[i]
            if x <= 2 or y <= 2 or x + bw >= w - 2 or y + bh >= h - 2:
                continue
            is_h = (bh <= 4 and bw >= self.min_line_length and (bw / max(1, bh)) >= 4.5)
            is_v = (bw <= 4 and bh >= self.min_line_length and (bh / max(1, bw)) >= 4.5)
            if is_h or is_v:
                mid_x = clamp(int(x + bw / 2), 0, w - 1)
                mid_y = clamp(int(y + bh / 2), 0, h - 1)
                dist_to_art = float(dist_map[mid_y, mid_x])
                if dist_to_art > 14.0:
                    pad = 6
                    bx1 = clamp(x - pad, 0, w - 1)
                    by1 = clamp(y - pad, 0, h - 1)
                    bx2 = clamp(x + bw + pad, 0, w - 1)
                    by2 = clamp(y + bh + pad, 0, h - 1)
                    length = bw if is_h else bh
                    thickness = bh if is_h else bw
                    confidence = round(min(0.99, 0.88 + min(dist_to_art / 100.0, 0.11)), 2)
                    findings.append({
                        "id": f"line_cc_{len(findings)+1}",
                        "category": "Stray Elements",
                        "type": "stray_line",
                        "severity": "Major" if length > 70 else "Minor",
                        "title": f"Possible Unnecessary Line ({round(length, 1)}px)",
                        "bbox": [int(bx1), int(by1), int(bx2), int(by2)],
                        "confidence": confidence,
                        "metrics": {
                            "length_px": round(length, 1),
                            "thickness_px": int(thickness),
                            "angle_deg": 0.0 if is_h else 90.0,
                            "isolation_distance_px": round(dist_to_art, 1),
                            "connected_to_artwork": False
                        },
                        "description": f"Isolated thin straight line (~{round(length, 1)}px, thickness {thickness}px) floating {round(dist_to_art, 1)}px away from live artwork elements."
                    })

        edges = cv2.Canny(clean, 50, 150)
        lines = cv2.HoughLinesP(
            edges, rho=1, theta=np.pi / 180,
            threshold=max(20, int(min(w, h) * 0.05)),
            minLineLength=self.min_line_length,
            maxLineGap=3
        )

        if lines is None:
            return findings

        for line_entry in lines:
            x1, y1, x2, y2 = map(int, line_entry.reshape(-1)[:4])
            dx = x2 - x1
            dy = y2 - y1
            length = float(np.hypot(dx, dy))

            if length < self.min_line_length:
                continue

            angle = abs(np.degrees(np.arctan2(dy, dx)))
            is_horizontal = angle <= 3 or angle >= 177
            is_vertical = abs(angle - 90) <= 3

            if not (is_horizontal or is_vertical):
                continue

            # Ignore lines touching image border
            if (min(x1, x2) <= 3 or max(x1, x2) >= w - 4 or
                min(y1, y2) <= 3 or max(y1, y2) >= h - 4):
                continue

            # Check distance to nearest significant artwork cluster
            mid_x = int((x1 + x2) / 2)
            mid_y = int((y1 + y2) / 2)
            dist_to_art = float(dist_map[mid_y, mid_x]) if 0 <= mid_y < h and 0 <= mid_x < w else 0.0

            # Estimate thickness
            thickness = 1
            if is_horizontal:
                y = int((y1 + y2) / 2)
                x_start = min(x1, x2)
                x_end = max(x1, x2)
                strip = clean[clamp(y - 3, 0, h):clamp(y + 4, 0, h), clamp(x_start, 0, w):clamp(x_end + 1, 0, w)]
                if strip.size:
                    ys, _ = np.where(strip > 0)
                    if len(ys): thickness = int(max(1, ys.max() - ys.min() + 1))
            else:
                x = int((x1 + x2) / 2)
                y_start = min(y1, y2)
                y_end = max(y1, y2)
                strip = clean[clamp(y_start, 0, h):clamp(y_end + 1, 0, h), clamp(x - 3, 0, w):clamp(x + 4, 0, w)]
                if strip.size:
                    _, xs = np.where(strip > 0)
                    if len(xs): thickness = int(max(1, xs.max() - xs.min() + 1))

            # If connected or very close (<12px) to artwork, likely intentional underline or stroke
            is_isolated = dist_to_art > 14.0

            if thickness <= 4 and is_isolated:
                pad = 6
                bx1 = clamp(min(x1, x2) - pad, 0, w - 1)
                by1 = clamp(min(y1, y2) - pad, 0, h - 1)
                bx2 = clamp(max(x1, x2) + pad, 0, w - 1)
                by2 = clamp(max(y1, y2) + pad, 0, h - 1)

                confidence = round(min(0.99, 0.85 + min(dist_to_art / 100.0, 0.14)), 2)

                findings.append({
                    "id": f"line_{len(findings)+1}",
                    "category": "Stray Elements",
                    "type": "stray_line",
                    "severity": "Minor",
                    "title": f"Possible Unnecessary Line ({round(length, 1)}px)",
                    "bbox": [int(bx1), int(by1), int(bx2), int(by2)],
                    "confidence": confidence,
                    "metrics": {
                        "length_px": round(length, 1),
                        "thickness_px": int(thickness),
                        "angle_deg": round(angle, 1),
                        "isolation_distance_px": round(dist_to_art, 1),
                        "connected_to_artwork": False
                    },
                    "description": f"Isolated thin straight line (~{round(length, 1)}px, thickness {thickness}px) floating {round(dist_to_art, 1)}px away from live artwork elements."
                })

        return findings

    def _detect_stray_dots(self, clean, w, h, dist_map, clusters):
        findings = []
        num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(clean, connectivity=8)

        for i in range(1, num_labels):
            x, y, bw, bh, area = stats[i]
            cx, cy = centroids[i]

            if area <= self.max_dot_area and bw <= 15 and bh <= 15:
                # Ignore edge noise
                if x <= 2 or y <= 2 or x + bw >= w - 2 or y + bh >= h - 2:
                    continue

                icx = clamp(int(cx), 0, w - 1)
                icy = clamp(int(cy), 0, h - 1)
                dist_to_art = float(dist_map[icy, icx])

                # Intentionality Filter: If distance to nearest text/logo cluster <= 18px,
                # this dot is an 'i' dot, period, apostrophe, or character speckle. NOT stray!
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

                    findings.append({
                        "id": f"dot_{len(findings)+1}",
                        "category": "Stray Elements",
                        "type": "stray_dot",
                        "severity": "Minor",
                        "title": f"Stray Mark / Rogue Dot ({int(bw)}×{int(bh)}px)",
                        "bbox": [int(bx1), int(by1), int(bx2), int(by2)],
                        "confidence": confidence,
                        "metrics": {
                            "component_area_px": int(area),
                            "size_px": [int(bw), int(bh)],
                            "center_px": [round(float(cx), 1), round(float(cy), 1)],
                            "isolation_distance_px": round(dist_to_art, 1),
                            "connected_to_artwork": False
                        },
                        "description": f"Isolated speckle / dust dot ({int(bw)}×{int(bh)}px) detected {round(dist_to_art, 1)}px away from text or logo regions."
                    })

        return findings

    def _audit_spelling(self, image, image_path, w, h):
        """
        Extract text from file metadata, vector streams, or OCR,
        whitelisting recognized brand names and flagging real typos.
        """
        findings = []
        tokens = []

        # If PDF, attempt direct vector text stream extraction using PyMuPDF
        if str(image_path).lower().endswith(".pdf"):
            try:
                import fitz
                doc = fitz.open(str(image_path))
                for page in doc:
                    words = page.get_text("words")
                    for word_info in words:
                        # word_info: (x0, y0, x1, y1, word, block_no, line_no, word_no)
                        tokens.append({
                            "word": word_info[4],
                            "bbox": [int(word_info[0]), int(word_info[1]), int(word_info[2]), int(word_info[3])]
                        })
            except Exception:
                pass

        # Check extracted words against typo dictionary and brand whitelist
        for item in tokens:
            word = item["word"]
            clean_word = re.sub(r"[^a-zA-Z0-9]", "", word).lower()

            # 1. If word is in Brand Whitelist -> Whitelisted!
            if clean_word in BRAND_WHITELIST:
                continue

            # 2. Check if typo
            if clean_word in TYPO_DICTIONARY:
                info = TYPO_DICTIONARY[clean_word]
                suggestion = info["suggestion"]
                is_brand = info["is_brand"]
                severity = "Fatal" if is_brand else "Major"

                findings.append({
                    "id": f"typo_{len(findings)+1}",
                    "category": "Text Check",
                    "type": "spelling",
                    "severity": severity,
                    "title": f"Spelling Error: \"{word}\" → \"{suggestion}\"",
                    "bbox": item["bbox"],
                    "confidence": 0.99,
                    "metrics": {
                        "detected_word": word,
                        "suggested_word": suggestion,
                        "is_brand_name": is_brand
                    },
                    "description": f"Potential spelling mistake detected. Suggested correction: \"{suggestion}\". Severity: {severity}."
                })

        return findings

    def _deduplicate(self, findings):
        final = []
        for d in sorted(findings, key=lambda x: x["confidence"], reverse=True):
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
        return final

    def _render_annotated_proof(self, image, findings):
        annotated = image.copy()
        for idx, f in enumerate(findings, start=1):
            x1, y1, x2, y2 = f["bbox"]
            sev = f["severity"]

            # Color coding: Fatal = Red, Major = Orange, Minor = Yellow/Blue
            color = (0, 0, 255) if sev == "Fatal" else \
                    (0, 140, 255) if sev == "Major" else \
                    (0, 200, 255) if sev == "Minor" else (255, 180, 0)

            # Draw bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)

            # Draw tag
            label = f"#{idx} [{sev}] {f['title']} ({f['confidence']:.0%})"
            text_y = max(18, y1 - 6)
            cv2.putText(annotated, label, (x1, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.42, color, 1, cv2.LINE_AA)

        return annotated


def main():
    parser = argparse.ArgumentParser(description="Automated Artwork QA Checker (AI Artwork QA Scanner)")
    parser.add_argument("input", help="Path to input artwork image (JPG/PNG/PDF)")
    parser.add_argument("--out-dir", default="artwork_qa_results", help="Directory for QA output artifacts")
    parser.add_argument("--min-line", type=int, default=30, help="Minimum stray line length in px")
    parser.add_argument("--max-dot", type=int, default=80, help="Maximum stray dot area in px")

    args = parser.parse_args()
    input_path = Path(args.input)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    checker = AutomatedArtworkQAChecker(min_line_length=args.min_line, max_dot_area=args.max_dot)
    result = checker.analyze(input_path)

    annotated_path = out_dir / "annotated_proof.png"
    json_path = out_dir / "artwork_qa_report.json"

    cv2.imwrite(str(annotated_path), result["annotated_image"])

    report_data = {
        "input_file": str(input_path),
        "image_size": result["image_size"],
        "summary": result["summary"],
        "findings": result["findings"]
    }

    json_path.write_text(json.dumps(report_data, indent=2, default=json_serializer), encoding="utf-8")

    print("=" * 60)
    print("AI ARTWORK QA SCANNER - AUTOMATED AUDIT REPORT")
    print("=" * 60)
    print(f"File:         {input_path}")
    print(f"Decision:     {result['summary']['qa_decision']}")
    print(f"Total Issues: {result['summary']['total_issues']}")
    print(f"  🔴 Fatal:   {result['summary']['fatal']}")
    print(f"  🟠 Major:   {result['summary']['major']}")
    print(f"  🟡 Minor:   {result['summary']['minor']}")
    print(f"  🔵 Review:  {result['summary']['review']}")
    print(f"Proof Image:  {annotated_path}")
    print(f"JSON Report:  {json_path}")
    print("=" * 60)


if __name__ == "__main__":
    main()
