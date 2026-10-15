"""Builds the product templates shown on the canvas from the BannerBuzz QNAP share (\\\\192.168.0.250\\qnap\\Template_Mockups).

Reads the official Photoshop templates (.psdt / .psd) and template PDFs of the product groups below, keeps only the
standard colour-coded templates — red bleed band around the edge, white visible area, lavender safe area — and writes:
  assets/qnap/<id>.jpg     preview of the template (screen colours, max 1400 px)
  assets/qnap/<id>.m.png   area mask (max 600 px): 0 = bleed (cut off), 128 = visible area, 255 = safe area
  js/qnap_templates.js     QNAP_TEMPLATES: product, panel, sides, sizes in inches, visible / safe boxes, source path

Print files, mockups, vendor files and old versions are skipped (folder / file name), and any file whose picture does not
show the colour-coded areas is left out — the report lists every file with the reason.

Usage: python tools/build_qnap_templates.py [--root \\\\server\\share\\Template_Mockups] [--limit N] [--workers 4]
Needs Pillow, numpy, pymupdf; CMYK templates are converted with Adobe's U.S. Web Coated (SWOP) v2 profile when installed.
"""
import argparse, io, json, os, re, sys, hashlib
from concurrent.futures import ProcessPoolExecutor, as_completed

import numpy as np
from PIL import Image, ImageCms, ImageDraw

Image.MAX_IMAGE_PIXELS = None
GROUPS = ["Table Covers & Displays", "Stands & Displays", "Banners"]
# folders that hold production-only copies (".For Pex Use Only"), old versions, vendor / print files and mockups
SKIP_DIR = re.compile(r"(?i)^(\..*|.*(?:^|[\s_.\-])old(?:$|[\s_.\-]).*|vendor|data|_?mock-?ups?.*|blank.*|print ?files?|reference|archive|backup.*|preview|temp|tmp)$")
SKIP_NAME = re.compile(r"(?i)mock-?up|blank|preview|_print_file|thumbnail|(?:^|[\s_.\-])old(?:$|[\s_.\-])")
MAX_MB = 120
SWOP = r"C:\Program Files (x86)\Common Files\Adobe\Color\Profiles\Recommended\USWebCoatedSWOP.icc"
PREVIEW_PX, MASK_PX, WORK_PX = 1000, 500, 1400   # preview behind the artwork on the canvas; mask for the safe-area check


def to_rgb(im):
    """CMYK → screen RGB with the SWOP profile (as Photoshop shows it), plain conversion otherwise"""
    if im.mode == "CMYK" and os.path.isfile(SWOP):
        try:
            t = ImageCms.buildTransform(ImageCms.getOpenProfile(SWOP), ImageCms.createProfile("sRGB"), "CMYK", "RGB",
                                        ImageCms.Intent.RELATIVE_COLORIMETRIC, flags=ImageCms.Flags.BLACKPOINTCOMPENSATION)
            return ImageCms.applyTransform(im, t)
        except Exception:
            pass
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[-1]); return bg
    return im.convert("RGB")


def load(path):
    """→ (RGB picture at most WORK_PX, width in inches, height in inches)"""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        import pymupdf
        doc = pymupdf.open(path)
        page = doc[0]
        wi, hi = page.rect.width / 72, page.rect.height / 72
        zoom = WORK_PX / max(page.rect.width, page.rect.height)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        return im, wi, hi
    im = Image.open(path)
    res = im.info.get("dpi", (None,))[0] if isinstance(im.info.get("dpi"), tuple) else None
    res = res or psd_resolution(path) or 72
    W, H = im.size
    im.load()
    k = WORK_PX / max(W, H)
    if k < 1:
        im = im.resize((max(1, round(W * k)), max(1, round(H * k))), Image.BOX)
    return to_rgb(im), W / res, H / res


def psd_resolution(path):
    """Resolution (ppi) from the PSD image resources (ResolutionInfo 0x03ED)"""
    import struct
    with open(path, "rb") as f:
        f.seek(26)
        f.seek(struct.unpack(">I", f.read(4))[0], 1)
        ir = f.read(struct.unpack(">I", f.read(4))[0])
    i = 0
    while i < len(ir) - 12 and ir[i:i + 4] == b"8BIM":
        rid = struct.unpack(">H", ir[i + 4:i + 6])[0]
        nl = ir[i + 6]; j = i + 6 + nl + 1 + ((nl + 1) % 2)
        size = struct.unpack(">I", ir[j:j + 4])[0]
        if rid == 1005:
            return struct.unpack(">I", ir[j + 4:j + 8])[0] / 65536
        i = j + 4 + size + (size % 2)
    return None


def border_connected(mask):
    """Pixels of `mask` connected to the picture border (flood fill)"""
    h, w = mask.shape
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L").copy()   # own, writable pixels
    seeds = [(x, y) for x in range(0, w, max(1, w // 64)) for y in (0, h - 1)] + [(x, y) for y in range(0, h, max(1, h // 64)) for x in (0, w - 1)]
    for s in seeds:
        if img.getpixel(s) == 255:
            ImageDraw.floodfill(img, s, 128)
    return np.asarray(img) == 128


def dilate(mask, r):
    """Grow a mask by r pixels (square)"""
    out = mask.copy()
    for _ in range(r):
        g = out.copy()
        g[1:] |= out[:-1]; g[:-1] |= out[1:]; g[:, 1:] |= out[:, :-1]; g[:, :-1] |= out[:, 1:]
        out = g
    return out


def classify(rgb):
    """
    → (mask uint8 0/128/255, stats) or (None, reason).
    BannerBuzz template colours: red = bleed (cut off), white = visible area, lavender = safe area.
      · red band / outline: the visible area is what it encloses (bands along the edge, or the outline of a shaped
        product such as a fitted table cover on a white page)
      · no red (hot-knife cut, no bleed): the white + lavender product area, without stand drawings at the edge
      · safe area: the lavender with the text / logos written on it filled in
    """
    a = np.asarray(rgb).astype(np.int16)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    red = (R > 170) & (G < 130) & (B < 130) & (R - G > 90)
    lav = (R >= 172) & (R <= 228) & (np.abs(R - G) < 18) & (B - R >= 12) & (B - R <= 48) & (B >= 205)
    white = (R > 235) & (G > 235) & (B > 235)
    if lav.mean() < 0.10:
        return None, "no lavender safe area"
    h, w = red.shape
    # the red outline, with the small gaps where fold / dimension lines cross it closed
    red_c = dilate(red, 2)
    outside = border_connected(~red_c)          # everything outside the red outline (nothing when the band runs along the edge)
    inside = ~border_connected(red_c | outside) # red text written inside the safe area stays inside
    if red.mean() >= 0.002 and inside.mean() >= 0.2:
        visible, kind = dilate(inside, 2) & ~outside, "bleed"
    else:
        product = white | lav
        visible = ~border_connected(~product) if (~product).any() else np.ones_like(product)
        kind = "no-bleed"
    safe = ~border_connected(~lav) & visible
    if visible.mean() < 0.2 or safe.mean() < 0.08:
        return None, "areas too small for a template"
    if (safe & ~lav).mean() > 0.6 * safe.mean():
        return None, "safe area mostly not lavender (picture, not a template)"
    m = np.zeros((h, w), np.uint8)
    m[visible] = 128
    m[safe] = 255
    return m, dict(kind=kind, bleed=float((~visible).mean()), safe=float(safe.mean()), visible=float(visible.mean()))


def bbox(mask_bool, wi, hi):
    ys, xs = np.nonzero(mask_bool)
    if not len(xs):
        return None
    h, w = mask_bool.shape
    return [round(xs.min() / w * wi, 3), round(ys.min() / h * hi, 3), round((xs.max() + 1) / w * wi, 3), round((ys.max() + 1) / h * hi, 3)]


def describe(rel):
    """Product, panel and stated size from the folder / file name"""
    parts = rel.replace("/", "\\").split("\\")
    group = parts[0]
    stem = re.sub(r"(?i)\.(psdt|psd|pdf)$", "", parts[-1])
    folders = [p for p in parts[1:-1] if not re.match(r"(?i)^(inhouse|in-house|templates?|single sided|double sided|psd|pdf)$", p)]
    product = folders[0] if folders else stem
    text = " ".join(parts[1:-1] + [stem]).replace("_", " ")
    size = None
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:\(W\))?\s*[x×X]\s*(\d+(?:\.\d+)?)\s*(?:\(H\))?\s*(ft|feet|foot|inch|in|\"|'|cm|mm)?", text, re.I)
    if m:
        u = (m.group(3) or "").lower()
        k = 12 if u in ("ft", "feet", "foot", "'") else 1 / 2.54 if u == "cm" else 1 / 25.4 if u == "mm" else 1
        size = [round(float(m.group(1)) * k, 2), round(float(m.group(2)) * k, 2), u or "?"]
    sides = "double" if re.search(r"(?i)double", text) else "single" if re.search(r"(?i)single", text) else ""
    panel = " ".join(dict.fromkeys(w for w in re.findall(r"[A-Za-z]+", stem.replace("_", " ")) if w.lower() not in ("ft", "inch", "in", "x", "psdt", "psd")))
    return dict(group=group, product=product, path=" › ".join(folders), name=stem, panel=panel, sides=sides, stated=size)


def process(job):
    try:
        return _process(job)
    except Exception as e:                       # one bad file never stops the build
        return job[1], None, f"failed ({type(e).__name__}: {str(e)[:80]})"


def _process(job):
    root, rel, out_dir = job
    path = os.path.join(root, rel)
    try:
        rgb, wi, hi = load(path)
    except Exception as e:
        return rel, None, f"cannot read ({type(e).__name__}: {str(e)[:80]})"
    m, info = classify(rgb)
    if m is None:
        return rel, None, info
    # short ids: Windows paths stay under 260 characters
    tid = re.sub(r"[^a-z0-9]+", "-", os.path.splitext(os.path.basename(rel))[0].lower()).strip("-")[:36].strip("-") + "-" + hashlib.md5(rel.encode()).hexdigest()[:6]
    pv = rgb.copy(); pv.thumbnail((PREVIEW_PX, PREVIEW_PX), Image.LANCZOS)
    pv.save(os.path.join(out_dir, tid + ".jpg"), quality=74, optimize=True, progressive=True)
    mk = Image.fromarray(m, "L"); mk = mk.resize((max(1, round(mk.width * min(1, MASK_PX / max(mk.size)))), max(1, round(mk.height * min(1, MASK_PX / max(mk.size))))), Image.NEAREST)
    mk.save(os.path.join(out_dir, tid + ".m.png"), optimize=True)
    rec = describe(rel)
    rec.update(id=tid, src=rel, img=f"assets/qnap/{tid}.jpg", mask=f"assets/qnap/{tid}.m.png",
               fullIn=[round(wi, 2), round(hi, 2)], visIn=bbox(m >= 128, wi, hi), safeIn=bbox(m == 255, wi, hi),
               kind=info["kind"], areas={k: round(v, 3) for k, v in info.items() if isinstance(v, float)})
    return rel, rec, "ok"


def candidates(root):
    out = []
    for g in GROUPS:
        for dp, dn, fn in os.walk(os.path.join(root, g)):
            dn[:] = [d for d in dn if not SKIP_DIR.match(d)]
            for f in fn:
                if not re.search(r"(?i)\.(psdt|psd|pdf)$", f):
                    continue
                full = os.path.join(dp, f)
                rel = os.path.relpath(full, root)
                if SKIP_NAME.search(os.path.splitext(f)[0]):
                    continue
                try:
                    if os.path.getsize(full) > MAX_MB * 1e6:
                        continue
                except OSError:
                    continue
                out.append(rel)
    return sorted(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=r"\\192.168.0.250\qnap\Template_Mockups")
    ap.add_argument("--repo", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--sample", type=int, default=0, help="every Nth candidate (quick look)")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--report", default="")
    ap.add_argument("--only", action="append", default=[], help="keep files whose path contains this text (repeatable)")
    ap.add_argument("--write-js", action="store_true", help="write js/qnap_templates.js also for a partial build")
    a = ap.parse_args()
    out_dir = os.path.join(a.repo, "assets", "qnap"); os.makedirs(out_dir, exist_ok=True)
    files = candidates(a.root)
    if a.only: files = [f for f in files if any(o.lower() in f.lower() for o in a.only)]
    if a.sample: files = files[::a.sample]
    if a.limit: files = files[:a.limit]
    print(f"{len(files)} candidate files", flush=True)
    recs, report = [], []
    with ProcessPoolExecutor(max_workers=a.workers) as ex:
        futs = [ex.submit(process, (a.root, rel, out_dir)) for rel in files]
        for n, f in enumerate(as_completed(futs), 1):
            rel, rec, why = f.result()
            report.append((rel, why))
            if rec: recs.append(rec)
            if n % 20 == 0 or n == len(files):
                print(f"  {n}/{len(files)} done, {len(recs)} templates", flush=True)
    recs.sort(key=lambda r: r["src"].lower())
    js = ("/**\n * BannerBuzz product templates from the QNAP share (\\\\192.168.0.250\\qnap\\Template_Mockups) — generated by\n"
          " * tools/build_qnap_templates.py. Do not edit by hand. Mask: 0 = bleed, 128 = visible area, 255 = safe area.\n */\n"
          "const QNAP_TEMPLATES = " + json.dumps(recs, ensure_ascii=False, separators=(",", ":")) + ";\n"
          "if (typeof module !== 'undefined' && module.exports) module.exports = QNAP_TEMPLATES;\n")
    if a.write_js or not (a.sample or a.limit or a.only):
        os.makedirs(os.path.join(a.repo, "js"), exist_ok=True)
        open(os.path.join(a.repo, "js", "qnap_templates.js"), "w", encoding="utf-8", newline="\n").write(js)
    else:
        open(os.path.join(out_dir, "_records.json"), "w", encoding="utf-8").write(json.dumps(recs, ensure_ascii=False, indent=1))
    rep = a.report or os.path.join(out_dir, "_build_report.txt")
    with open(rep, "w", encoding="utf-8") as fh:
        for rel, why in sorted(report):
            fh.write(f"{why:<55} {rel}\n")
    print(f"templates: {len(recs)} of {len(files)} · report: {rep}")
    return recs


if __name__ == "__main__":
    main()
