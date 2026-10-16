"""Builds the product templates shown on the canvas from the BannerBuzz QNAP share (\\\\192.168.0.250\\qnap\\Template_Mockups).

Reads the official Photoshop templates (.psdt / .psd) and template PDFs of the product groups below, keeps only the
standard colour-coded templates — red bleed band around the edge, white visible area, lavender safe area — and writes:
  assets/tpl/<group>-NN/<id>.jpg     preview (max 1800 px; --previews PX re-renders them) · at most 99 files per folder
  assets/tpl/<group>-NN/<id>.m.png   area mask (max 500 px; website / flags 1000 px): 0 = outside / bleed, 64 = bleed bars,
                           128 = visible area, 255 = safe area
  js/qnap_templates.js     QNAP_TEMPLATES: product, panel, sides, sizes in inches, visible / safe boxes, source path

Print files, mockups, vendor files and old versions are skipped (folder / file name), and any file whose picture does not
show the colour-coded areas is left out — the report lists every file with the reason.

Usage: python tools/build_qnap_templates.py [--root \\\\server\\share\\Template_Mockups] [--limit N] [--workers 4]
Needs Pillow, numpy, pymupdf; CMYK templates are converted with Adobe's U.S. Web Coated (SWOP) v2 profile when installed.
"""
import argparse, io, json, os, re, shutil, sys, hashlib
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
PREVIEW_PX, MASK_PX, WORK_PX = 1800, 500, 2000   # preview behind the artwork on the canvas; mask for the safe-area check
CUST_MASK_PX = 1000                              # website (customer) template masks
# Template files per group in their own folder (GitHub lists at most 1,000 files per folder); the QNAP Stands & Displays /
# Table Covers files stay in assets/qnap
GROUP_DIR = {"Custom Flags": "assets/tpl/flags", "Website templates": "assets/tpl/website",
             "Production standard templates": "assets/tpl/production"}


def asset_dir(repo, group):
    """→ (folder on disk, path used in the records) where a builder writes a group's new files (finalize then files them
    into the numbered folders, see layout_assets)"""
    rel = GROUP_DIR.get(group, "assets/qnap")
    full = os.path.join(repo, *rel.split("/"))
    os.makedirs(full, exist_ok=True)
    return full, rel


# Final place of every template's files: assets/tpl/<group>-NN/ with at most 99 files per folder (one GitHub upload of
# up to 100 files per folder, and no folder near GitHub's 1,000-file listing limit). A template's files stay together;
# templates keep their folder when others are added — new ones go to the last folder with room, or a new one.
TPL_ROOT = "assets/tpl"
FOLDER_FILES = 99
GROUP_SLUG = {"Stands & Displays": "stands", "Table Covers & Displays": "tables", "Banners": "banners", "Custom Flags": "flags",
              "Website templates": "website", "Production standard templates": "production"}
_NUMBERED = re.compile(r"^assets/tpl/([a-z]+)-(\d\d)/")


def layout_assets(repo, recs, old):
    """Move each record's files (img in assets/qnap|tpl, mask, outline) into its numbered folder and fix the paths"""
    before = {r["id"]: r for r in old}
    files_of = lambda r: [k for k in ("img", "mask", "outline") if r.get(k, "").startswith(("assets/qnap/", "assets/tpl/"))]
    count = {}                                   # folder → files in it (templates already placed)
    plan = []
    for r in recs:
        slug = GROUP_SLUG.get(r.get("group"), "other")
        prev = before.get(r["id"])
        m = _NUMBERED.match((prev or {}).get("mask", "") or "") or _NUMBERED.match(r.get("mask", "") or "")
        folder = m.group(0).rstrip("/") if m and m.group(1) == slug else None
        plan.append((r, slug, folder))
        if folder:
            count[folder] = count.get(folder, 0) + len(files_of(r))
    moved = 0
    for r, slug, folder in plan:
        need = len(files_of(r))
        if not folder:
            n = 1
            while True:
                folder = f"{TPL_ROOT}/{slug}-{n:02d}"
                if count.get(folder, 0) + need <= FOLDER_FILES:
                    break
                n += 1
            count[folder] = count.get(folder, 0) + need
        os.makedirs(os.path.join(repo, *folder.split("/")), exist_ok=True)
        for k in files_of(r):
            new = folder + "/" + r[k].split("/")[-1]
            if new == r[k]:
                continue
            src, dst = os.path.join(repo, *r[k].split("/")), os.path.join(repo, *new.split("/"))
            if os.path.isfile(src):
                os.replace(src, dst); moved += 1
            r[k] = new
    big = {f: c for f, c in count.items() if c > FOLDER_FILES}
    print(f"template files in {len(count)} folders (max {max(count.values()) if count else 0} files per folder), moved {moved}"
          + (f" — OVER LIMIT: {big}" if big else ""))
    return recs


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


def load(path, px=None):
    """→ (RGB picture at most px (WORK_PX), width in inches, height in inches)"""
    px = px or WORK_PX
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        import pymupdf
        doc = pymupdf.open(path)
        page = doc[0]
        wi, hi = page.rect.width / 72, page.rect.height / 72
        zoom = px / max(page.rect.width, page.rect.height)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        return im, wi, hi
    im = Image.open(path)
    res = im.info.get("dpi", (None,))[0] if isinstance(im.info.get("dpi"), tuple) else None
    res = res or psd_resolution(path) or 72
    W, H = im.size
    im.load()
    k = px / max(W, H)
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


def big_parts(mask, frac=0.03):
    """The large connected parts of a mask: drops labels, arrows and frame lines beside the product"""
    img = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), "L").copy()
    parts = []
    while True:
        a = np.asarray(img)
        i = int(np.argmax(a == 255))
        if a.flat[i] != 255:
            break
        seed = (i % a.shape[1], i // a.shape[1])
        ImageDraw.floodfill(img, seed, 100)
        parts.append((int((np.asarray(img) == 100).sum()), seed))
        ImageDraw.floodfill(img, seed, 50)
    if not parts:
        return mask & False
    top = max(p[0] for p in parts)
    for area, seed in parts:
        if area >= frac * top:
            ImageDraw.floodfill(img, seed, 200)
    return np.asarray(img) == 200


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
    pv.save(os.path.join(out_dir, tid + ".jpg"), quality=82, optimize=True, progressive=True)
    mk = Image.fromarray(m, "L"); mk = mk.resize((max(1, round(mk.width * min(1, MASK_PX / max(mk.size)))), max(1, round(mk.height * min(1, MASK_PX / max(mk.size))))), Image.NEAREST)
    mk.save(os.path.join(out_dir, tid + ".m.png"), optimize=True)
    rec = describe(rel)
    rec.update(id=tid, src=rel, img=f"assets/qnap/{tid}.jpg", mask=f"assets/qnap/{tid}.m.png",
               fullIn=[round(wi, 2), round(hi, 2)], visIn=bbox(m >= 128, wi, hi), safeIn=bbox(m == 255, wi, hi),
               kind=info["kind"], areas={k: round(v, 3) for k, v in info.items() if isinstance(v, float)})
    return rel, rec, "ok"


# ── quality check + customer (website) templates ───────────────────────────────────────────────────────────

def far_white_share(rgb, mask):
    """
    Share of the 'visible' area that is plain white page far from any lavender — high when the white page around a
    production layout was taken for visible area (the areas of that template are not reliable).
    """
    m = np.asarray(mask)
    a = np.asarray(rgb.resize((m.shape[1], m.shape[0]), Image.BOX)).astype(np.int16)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    lav = (R >= 172) & (R <= 228) & (np.abs(R - G) < 18) & (B - R >= 12) & (B - R <= 48) & (B >= 205)
    white = (R > 235) & (G > 235) & (B > 235)
    near = dilate(lav, max(3, round(0.03 * max(m.shape))))
    vis = m >= 128
    return float((white & vis & ~near).sum() / max(1, vis.sum()))


# The website templates customers design on (assets/templates/real): full size with bleed from the 6 ft sheets of
# REAL_TEMPLATES (template_registry.js); other lengths keep that height, width from the picture's proportions
CUSTOMER = {
    "stretch-table-covers": dict(product="Stretch Table Covers", H={"3sided": 83.0, "4sided": 86.0, "zipper": 86.0}, safe=0.5),
    "fitted-table-covers": dict(product="Fitted Table Covers", H={"3sided": 89.0, "4sided": 88.0, "zipper": 88.0}, safe=0.5),
    "backpack-flags": dict(product="Backpack Flags", H={"blade": 48.0315, "rectangle": 31.4961, "teardrop": 38.3295, "u-shape": 41.4691}, safe=1.0),
}
VARIANT_NAME = {"3sided": "3 Sided Open Back", "4sided": "4 Sided Closed Back", "zipper": "4 Sided Closed Back with Zipper"}


def customer_mask(rgb, safe_px, bars=False):
    """
    Website templates (a product shape drawn with a thin grey cut outline on a white page):
      product = everything inside the outline · bleed = the red / orange "3\" BLEED" bars (with their white text)
      visible = product without the bleed · safe = the lavender area (text on it filled in), or the SOP inset when
      the template has no safe area drawn.  Mask: 0 outside, 64 bleed, 128 visible, 255 safe.
    """
    a = np.asarray(rgb).astype(np.int16)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    page = (R > 232) & (G > 232) & (B > 232)
    # a thin grey frame line around the picture is page (only where an edge really is such a line)
    if page[0, :].mean() < 0.5: page[:3, :] = True
    if page[-1, :].mean() < 0.5: page[-3:, :] = True
    if page[:, 0].mean() < 0.5: page[:, :3] = True
    if page[:, -1].mean() < 0.5: page[:, -3:] = True
    product = big_parts(~border_connected(page))         # without the "Back" / "Drape" / title labels around it
    if product.mean() < 0.2:
        return None, None
    red = (R > 170) & (G < 130) & (B < 130) & (R - G > 90)
    # bleed bars / bands, with the white "3\" BLEED" lettering on them closed (≈ 0.5") — never the panels they surround;
    # the thin red dimension arrows and their heads are not bleed
    bleed = np.zeros_like(product)
    if red.any():
        r = max(2, round(rgb.width / 200))
        closed = ~dilate(~dilate(red, r), r)
        # table covers: the bars are solid blocks ≥ 1" thick — arrowheads ending on them are not bar
        ro = 7 if bars else 3
        opened = dilate(~dilate(~closed, ro), ro)
        if opened.any():
            bleed = big_parts(opened & product, 0.05)
    visible = product & ~bleed
    if bleed.any():
        # thin slivers of the cut line left beside a bleed bar belong to the bar (no hook in the visible outline)
        opened = dilate(~dilate(~visible, 2), 2) & visible
        bleed |= visible & ~opened & dilate(bleed, 4)
        # arrowheads ending on a bar leave small islands: they are bar too
        bleed |= product & ~bleed & ~big_parts(product & ~bleed, 0.02)
        visible = product & ~bleed
    lav = (R >= 172) & (R <= 228) & (np.abs(R - G) < 18) & (B - R >= 12) & (B - R <= 48) & (B >= 205)
    if lav.mean() > 0.05:
        # the red dimension arrows drawn across the panels ("26\"", "57\"") are part of the safe area
        rc = max(2, round(rgb.width / 350))
        lav = ~dilate(~dilate(lav, rc), rc)
        safe, how = ~border_connected(~lav) & visible, "drawn"
    else:
        safe, how = ~dilate(~visible, max(1, int(round(safe_px)))) & visible, "sop"
    m = np.zeros(product.shape, np.uint8)
    m[bleed] = 64; m[visible] = 128; m[safe] = 255
    return m, how


def iso_contours(field, level=0.5):
    """
    Closed outlines of a smooth field at `level` (marching squares, edge crossings interpolated) → polylines of (x, y)
    in picture pixels (pixel centres at +0.5). Sub-pixel exact: straight template edges come out straight.
    """
    f = np.pad(field.astype(np.float32), 1)
    up = f > level
    code = up[:-1, :-1] * 8 + up[:-1, 1:] * 4 + up[1:, 1:] * 2 + up[1:, :-1] * 1
    ys, xs = np.nonzero((code > 0) & (code < 15))

    def pt(e):
        kind, x, y = e
        if kind == "h":                       # corners (x, y) – (x + 1, y)
            a, b = f[y, x], f[y, x + 1]; t = (level - a) / (b - a) if b != a else 0.5
            return (x + t - 0.5, y - 0.5)
        a, b = f[y, x], f[y + 1, x]; t = (level - a) / (b - a) if b != a else 0.5
        return (x - 0.5, y + t - 0.5)

    table = {1: [("L", "B")], 14: [("L", "B")], 2: [("B", "R")], 13: [("B", "R")], 3: [("L", "R")], 12: [("L", "R")],
             4: [("T", "R")], 11: [("T", "R")], 6: [("T", "B")], 9: [("T", "B")], 7: [("L", "T")], 8: [("L", "T")],
             5: [("L", "T"), ("B", "R")], 10: [("L", "B"), ("T", "R")]}
    segs, ends = [], {}
    for y, x in zip(ys.tolist(), xs.tolist()):
        E = {"T": ("h", x, y), "B": ("h", x, y + 1), "L": ("v", x, y), "R": ("v", x + 1, y)}
        for a, b in table[int(code[y, x])]:
            s = len(segs); segs.append((E[a], E[b]))
            ends.setdefault(E[a], []).append(s); ends.setdefault(E[b], []).append(s)
    used = [False] * len(segs); out = []
    for s0 in range(len(segs)):
        if used[s0]:
            continue
        used[s0] = True
        chain = [segs[s0][0], segs[s0][1]]; cur = segs[s0][1]
        while True:
            nxt = next((s for s in ends.get(cur, []) if not used[s]), None)
            if nxt is None:
                break
            used[nxt] = True
            a, b = segs[nxt]; cur = b if a == cur else a
            chain.append(cur)
        if len(chain) >= 8:
            out.append([pt(e) for e in chain])
    return out


def simplify(pts, eps):
    """Ramer–Douglas–Peucker for a closed polyline (first point = last point)"""
    P = np.asarray(pts, np.float64)
    keep = np.zeros(len(P), bool); keep[0] = keep[-1] = True
    stack = [(0, len(P) - 1)]
    while stack:
        a, b = stack.pop()
        if b <= a + 1:
            continue
        d = P[b] - P[a]; L = np.hypot(*d); seg = P[a + 1:b] - P[a]
        dist = np.abs(d[1] * seg[:, 0] - d[0] * seg[:, 1]) / L if L > 0 else np.hypot(seg[:, 0], seg[:, 1])
        i = int(np.argmax(dist))
        if dist[i] > eps:
            k = a + 1 + i; keep[k] = True; stack += [(a, k), (k, b)]
    return P[keep]


def vector_outlines(m):
    """Cut line (product), visible area and safe area of a full-resolution mask as vector outlines (picture px)"""
    from PIL import ImageFilter
    res = {"w": int(m.shape[1]), "h": int(m.shape[0])}
    for key, region in (("product", m >= 64), ("visible", m >= 128), ("safe", m == 255)):
        field = np.asarray(Image.fromarray(np.where(region, 255, 0).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.1))) / 255.0
        polys = []
        for c in iso_contours(field):
            p = simplify(c, 0.45)
            if len(p) >= 4 and np.ptp(p[:, 0]) + np.ptp(p[:, 1]) > 6:
                polys.append([round(float(v), 1) for xy in p for v in xy])
        res[key] = polys
    return res


def front_panel(m, W, H):
    """
    Front panel of a table cover layout (the bottom arm of the cross, under the side panels): its visible box and safe
    box in inches — where a logo goes when the customer sends a logo instead of a laid-out file. None if not found.
    """
    vis, safe = m >= 128, m == 255
    rows = np.where(vis.any(axis=1))[0]
    if len(rows) < 20:
        return None, None
    wid = np.array([np.ptp(np.where(vis[y])[0]) + 1 for y in rows])
    tail = max(5, len(rows) // 12)
    arm_w = np.median(wid[-tail:])
    if arm_w > 0.8 * wid.max():
        return None, None                                  # no side panels: not a cross layout
    # up from the bottom while the width stays the arm's (a stretch cover's front tapers ~16%; the sloped lower edges of
    # the side panels reach 1.4×, the side panels themselves twice as wide)
    i = len(rows) - 1
    while i > 0 and wid[i - 1] <= arm_w * 1.25:
        i -= 1
    y0 = rows[i]
    if (rows[-1] - y0) < 0.12 * len(rows):
        return None, None
    sub = np.zeros_like(vis); sub[y0:] = True
    hi, wi = m.shape
    # where a logo may go: the largest box inside the safe area along the whole front (its narrowest rows rule)
    srows = [y for y in range(y0, hi) if safe[y].any()]
    if len(srows) < 10:
        return bbox(vis & sub, W, H), None
    core = srows[len(srows) // 20: len(srows) - len(srows) // 20] or srows
    xl = max(int(np.argmax(safe[y])) for y in core)
    xr = min(wi - int(np.argmax(safe[y][::-1])) for y in core)
    fs = [round(xl / wi * W, 3), round(srows[0] / hi * H, 3), round(xr / wi * W, 3), round((srows[-1] + 1) / hi * H, 3)]
    return bbox(vis & sub, W, H), fs


def customer_templates(repo):
    out = []
    folder = os.path.join(repo, "assets", "templates", "real")
    if not os.path.isdir(folder):
        return out
    qdir, qrel = asset_dir(repo, "Website templates")
    for f in sorted(os.listdir(folder)):
        mt = re.match(r"(stretch-table-covers|fitted-table-covers|backpack-flags)-(.+)\.jpg$", f)
        if not mt:
            continue
        fam, rest = mt.group(1), mt.group(2)
        cfg = CUSTOMER[fam]
        rgb = Image.open(os.path.join(folder, f)).convert("RGB")
        if fam == "backpack-flags":
            shape = re.sub(r"-(single|double)-side$", "", rest)
            H = cfg["H"].get(shape); sides = "double" if "double" in rest else "single"; length = None
            name = f"Backpack Flag · {shape.replace('-', ' ').title()} · {sides.title()} Sided"
        else:
            ml = re.match(r"(\d+)ft-(3sided|4sided|zipper)$", rest)
            if not ml:
                continue
            length, var = int(ml.group(1)), ml.group(2)
            H = cfg["H"][var]; sides = ""
            name = f"{length} x 2.5 Ft {cfg['product'][:-1]} · {VARIANT_NAME[var]}"
        if not H:
            continue
        bars = fam != "backpack-flags"
        m, how = customer_mask(rgb, 1, bars)
        if m is None:
            print("  customer template not readable:", f)
            continue
        # H is the product's height with bleed (the same table height for every length): the picture is scaled by it,
        # page margins and the title above some layouts are not part of the product
        ys = np.where((m >= 64).any(axis=1))[0]
        ppi = (ys[-1] + 1 - ys[0]) / H
        W, H = rgb.width / ppi, rgb.height / ppi
        m, how = customer_mask(rgb, cfg["safe"] * ppi, bars)
        kind = "outline"
        tid = "web-" + os.path.splitext(f)[0]
        mk = Image.fromarray(m, "L")
        k = min(1, CUST_MASK_PX / max(mk.size))        # finer than QNAP masks: smooth outlines of the shaped layouts
        mk.resize((max(1, round(mk.width * k)), max(1, round(mk.height * k))), Image.NEAREST).save(os.path.join(qdir, tid + ".m.png"), optimize=True)
        # exact vector outlines from the full-resolution layout (drawn on the canvas and the proofs)
        with open(os.path.join(qdir, tid + ".o.json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(vector_outlines(m), fh, separators=(",", ":"))
        front, front_safe = front_panel(m, W, H) if fam != "backpack-flags" else (None, None)
        stated = [length * 12.0, 30.0, "ft"] if length else None
        rec = dict(group="Website templates", product=cfg["product"], path="Customer template (website)", name=name,
                   panel=name, sides=sides, stated=stated, id=tid, src="assets/templates/real/" + f,
                   img="assets/templates/real/" + f, mask=f"{qrel}/{tid}.m.png", outline=f"{qrel}/{tid}.o.json",
                   fullIn=[round(W, 2), round(H, 2)],
                   visIn=bbox(m >= 128, W, H), safeIn=bbox(m == 255, W, H), prodIn=bbox(m >= 64, W, H), kind=kind, source="customer",
                   safeNote=("SOP %.2g\" inside the cut line (the template has no safe area drawn)" % cfg["safe"]) if how == "sop" else "",
                   areas={})
        if front:
            rec.update(front=front, frontSafe=front_safe or front)
        out.append(rec)
    return out


def production_templates(repo):
    """
    BannerBuzz production standard templates: tools/production_templates/<product>/<variant>/ holds the exports the
    design team makes from the production file — template.jpg (the template), safe.jpg (safe zone selection in blue),
    overall.jpg (overall product selection in dark, bleed bars included; orange = bleed in the template) — and info.json
    (product, name, stated order size, picture size in inches). The areas are taken exactly from those selections.
    """
    out = []
    root = os.path.join(repo, "tools", "production_templates")
    if not os.path.isdir(root):
        return out
    qdir, qrel = asset_dir(repo, "Production standard templates")
    pdir = os.path.join(repo, "assets", "templates", "production"); os.makedirs(pdir, exist_ok=True)
    for prod in sorted(os.listdir(root)):
        for var in sorted(os.listdir(os.path.join(root, prod))):
            d = os.path.join(root, prod, var)
            need = [os.path.join(d, f) for f in ("template.jpg", "safe.jpg", "overall.jpg", "info.json")]
            if not all(os.path.isfile(f) for f in need):
                continue
            info = json.load(open(need[3], encoding="utf-8"))
            tpl = Image.open(need[0]).convert("RGB")
            size = tpl.size
            a_t = np.asarray(tpl).astype(np.int16)
            a_s = np.asarray(Image.open(need[1]).convert("RGB").resize(size, Image.LANCZOS)).astype(np.int16)
            a_o = np.asarray(Image.open(need[2]).convert("RGB").resize(size, Image.LANCZOS)).astype(np.int16)
            # overall selection: the dark product shape (bleed bars included), holes filled
            product = big_parts(~border_connected(~(a_o.max(axis=2) < 128)), 0.02)
            # bleed: the orange bars of the template (their "3\" BLEED" lettering closed), solid blocks only
            R, G, B = a_t[..., 0], a_t[..., 1], a_t[..., 2]
            orange = (R > 190) & (G > 50) & (G < 150) & (B < 100) & (R - G > 80)
            r = max(2, round(size[0] / 200))
            bleed = ~dilate(~dilate(orange, r), r)
            bleed = dilate(~dilate(~bleed, 6), 6) & product
            bleed = big_parts(bleed, 0.05) if bleed.any() else bleed
            visible = product & ~bleed
            if bleed.any():
                # the overall selection runs a pixel or two past the bars: those slivers are bar
                opened = dilate(~dilate(~visible, 2), 2) & visible
                bleed |= visible & ~opened & dilate(bleed, 4)
                bleed |= product & ~bleed & ~big_parts(product & ~bleed, 0.02)
                visible = product & ~bleed
            # safe zone selection: the blue area, holes filled
            Rs, Gs, Bs = a_s[..., 0], a_s[..., 1], a_s[..., 2]
            blue = (Bs > 120) & (Bs - Rs > 50) & (Bs - Gs > 25)
            safe = ~border_connected(~blue) & visible
            m = np.zeros(product.shape, np.uint8)
            m[bleed] = 64; m[visible] = 128; m[safe] = 255
            W, H = info["inches"]
            tid = "std-" + prod + "-" + var
            shutil.copyfile(need[0], os.path.join(pdir, prod + "-" + var + ".jpg"))
            mk = Image.fromarray(m, "L")
            k = min(1, CUST_MASK_PX / max(mk.size))
            mk.resize((max(1, round(mk.width * k)), max(1, round(mk.height * k))), Image.NEAREST).save(os.path.join(qdir, tid + ".m.png"), optimize=True)
            with open(os.path.join(qdir, tid + ".o.json"), "w", encoding="utf-8", newline="\n") as fh:
                json.dump(vector_outlines(m), fh, separators=(",", ":"))
            front, front_safe = front_panel(m, W, H)
            st = info.get("stated")
            rec = dict(group="Production standard templates", product=info["product"], path="Production standard (BannerBuzz)",
                       name=info["name"], panel=info["name"], sides="", stated=[float(st[0]), float(st[1]), "in"] if st else None,
                       id=tid, src=info.get("source", ""), img=f"assets/templates/production/{prod}-{var}.jpg",
                       mask=f"{qrel}/{tid}.m.png", outline=f"{qrel}/{tid}.o.json", fullIn=[round(W, 2), round(H, 2)],
                       visIn=bbox(m >= 128, W, H), safeIn=bbox(m == 255, W, H), prodIn=bbox(m >= 64, W, H), kind="production",
                       source="production", safeNote="Blue safe zone of the production template", areas={})
            if front:
                rec.update(front=front, frontSafe=front_safe or front)
            out.append(rec)
            print(f"  production standard: {info['name']} · {W} x {H} in · product {rec['prodIn']}")
    return out


def finalize(repo, recheck=True, customer=True):
    """Quality-check the QNAP templates already built (local files only), add the production standard and the customer
    templates (recheck=False: the QNAP records stay as they are; customer=False: the customer records too)"""
    path = os.path.join(repo, "js", "qnap_templates.js")
    src = open(path, encoding="utf-8").read()
    recs = json.loads(src.split("const QNAP_TEMPLATES = ", 1)[1].split(";\nif (typeof module", 1)[0])
    keep, dropped = [], []
    old_cust = [r for r in recs if r.get("source") == "customer"]
    flag_file = os.path.join(repo, "tools", "qnap_flag_records.json")
    flag_recs = json.load(open(flag_file, encoding="utf-8")) if os.path.isfile(flag_file) else []
    good = []
    for r in flag_recs:                                  # folder names → the product names orders use
        r["product"] = FLAG_PRODUCT.get(r["product"], r["product"])
        if not os.path.isfile(os.path.join(repo, *r["mask"].split("/"))):
            dropped.append((r["src"], "files missing")); continue
        flag_logo_boxes(repo, r)
        n, ratio = r.pop("_pieces", (0, 0))
        # a double-sided layout shows both sides whole and alike (some PSDs keep the back as a smart object off the canvas)
        double = r.get("sides") == "double" or re.search(r"(?i)\b(df|dual)\b|double", r["name"])
        if double and (n != 2 or ratio < 0.6):
            dropped.append((r["src"], f"double-sided layout not whole ({n} sides, {ratio:.0%} alike)"))
            continue
        good.append(r)
    flag_recs = good
    for r in recs:
        if r.get("source") in ("customer", "production") or r.get("group") == FLAG_GROUP:
            continue
        if not recheck:
            keep.append(r); continue
        try:
            fw = far_white_share(Image.open(os.path.join(repo, r["img"])).convert("RGB"), Image.open(os.path.join(repo, r["mask"])).convert("L"))
        except Exception as e:
            dropped.append((r["src"], f"unreadable ({e})")); continue
        if fw > 0.12:
            dropped.append((r["src"], f"areas not reliable (white page {fw:.0%} of the visible area)"))
            for k in ("img", "mask"):
                try: os.remove(os.path.join(repo, r[k]))
                except OSError: pass
            continue
        r["source"] = "qnap"
        keep.append(r)
    prod = production_templates(repo)
    cust = customer_templates(repo) if customer else old_cust
    allr = layout_assets(repo, prod + cust + flag_recs + keep, recs)
    json.dump(flag_recs, open(flag_file, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=0)   # their new paths
    for d in ("assets/qnap",) + tuple(GROUP_DIR.values()):             # staging folders left empty
        full = os.path.join(repo, *d.split("/"))
        if os.path.isdir(full) and not os.listdir(full):
            os.rmdir(full)
    js = ("/**\n * BannerBuzz product templates — generated by tools/build_qnap_templates.py. Do not edit by hand.\n"
          " * source 'production' = production standard (tools/production_templates); 'customer' = website template customers\n"
          " * design on (assets/templates/real); 'qnap' = official template from \\\\192.168.0.250\\qnap\\Template_Mockups.\n"
          " * Mask: 0 = outside / bleed, 64 = bleed bars, 128 = visible area, 255 = safe area.\n */\n"
          "const QNAP_TEMPLATES = " + json.dumps(allr, ensure_ascii=False, separators=(",", ":")) + ";\n"
          "if (typeof module !== 'undefined' && module.exports) module.exports = QNAP_TEMPLATES;\n")
    open(path, "w", encoding="utf-8", newline="\n").write(js)
    rep = os.path.join(repo, "tools", "qnap_build_report.txt")
    with open(rep, "a", encoding="utf-8") as fh:
        fh.write("\n# quality check (finalize)\n")
        for s, why in dropped:
            fh.write(f"{why:<55} {s}\n")
    print(f"kept {len(keep)} QNAP templates, dropped {len(dropped)}, {len(cust)} customer templates, {len(prod)} production standard, {len(flag_recs)} flag templates")
    for s, why in dropped[:40]:
        print("  dropped:", why, "|", s[:110])


# ── Custom Flags: read from the PSD LAYERS ──────────────────────────────────────────────────────────────────
# The flag templates hold the colour-coded template (red / orange bleed band · white visible · lavender safe) and a
# black / grey CLIPPING MASK layer = the artwork area ("Shape", "Layer 1", "Clip Mask Your Artwork", "Clipping mask",
# a smart object…). The flattened preview often shows that black layer on top, so the layers are read one by one.
FLAG_GROUP = "Custom Flags"
FLAG_SKIP = re.compile(r"(?i)^(country flag|pre-printed flags|crowd flags)$")   # finished designs · > 250 MB files
FLAG_WORK_PX = 2400
FLAG_PRODUCT = {"Suction Cup Banner": "Suction Cup Flags", "L FLAG": "L Flags", "Pin Point Flag": "Pinpoint Flags"}


def _lav(a):
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    return (R >= 172) & (R <= 228) & (np.abs(R - G) < 18) & (B - R >= 12) & (B - R <= 48) & (B >= 205)


def _redband(a):
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    return (R > 170) & (G < 150) & (B < 120) & (R - G > 70)


def _layer_rgba(layer, size, k):
    """One layer alone on the (scaled) canvas → RGBA numpy array, None when it has no pixels"""
    im = layer.topil()
    if im is None:
        return None
    if im.mode == "CMYK":
        im = to_rgb(im).convert("RGBA")
    elif im.mode != "RGBA":
        alpha = im.getchannel("A") if "A" in im.getbands() else None
        im = to_rgb(im).convert("RGBA")
        if alpha is not None:
            im.putalpha(alpha)
    x0, y0, x1, y1 = layer.bbox
    w, h = max(1, round(im.width * k)), max(1, round(im.height * k))
    im = im.resize((w, h), Image.LANCZOS)
    canvas = Image.new("RGBA", (max(1, round(size[0] * k)), max(1, round(size[1] * k))), (255, 255, 255, 0))
    canvas.alpha_composite(im, (max(0, round(x0 * k)), max(0, round(y0 * k))), (max(0, -round(x0 * k)), max(0, -round(y0 * k))))
    return np.asarray(canvas)


def layered_template(path):
    """
    → (template picture RGB, mask 0/64/128/255, info) from the layers of a flag PSD, or (None, None, reason).
    Template = the layers holding the lavender safe area (composited in order); artwork area = the solid clipping
    mask layer(s), else the template's own outline (transparent around it), else the cut line on the white page.
    """
    from psd_tools import PSDImage
    psd = PSDImage.open(path)
    W, H = psd.size
    k = min(1, FLAG_WORK_PX / max(W, H))
    tpl, shapes = [], []
    for layer in psd.descendants():
        if layer.is_group() or layer.kind == "type":
            continue
        try:
            a = _layer_rgba(layer, (W, H), k)
        except Exception:
            continue
        if a is None:
            continue
        op = a[..., 3] > 128
        cover = op.mean()
        if cover < 0.02:
            continue
        rgb = a[..., :3].astype(np.int16)
        if (_lav(rgb) & op).sum() > 0.03 * op.sum():
            tpl.append(a)
            continue
        # a solid one-colour layer = the clipping mask of the artwork
        px = rgb[op]
        med = np.median(px, axis=0)
        even = (np.abs(px - med).sum(axis=1) < 60).mean()
        if cover >= 0.08 and even >= 0.9 and op.mean() < 0.97:
            shapes.append(op)
    if not tpl:
        return None, None, "no template layer (no lavender safe area in any layer)"
    comp = Image.new("RGBA", (tpl[0].shape[1], tpl[0].shape[0]), (255, 255, 255, 255))
    talpha = np.zeros(tpl[0].shape[:2], bool)
    for a in tpl:
        comp.alpha_composite(Image.fromarray(a, "RGBA"))
        talpha |= a[..., 3] > 128
    rgb_img = comp.convert("RGB")
    rgb = np.asarray(rgb_img).astype(np.int16)
    page = (rgb.min(axis=2) > 232)
    if shapes:
        product, how = np.logical_or.reduce(shapes), "clipping mask layer"
    elif talpha.mean() < 0.95:
        product, how = talpha, "template outline"
    else:
        product, how = ~border_connected(page), "cut line on the page"
    product = big_parts(~border_connected(~product), 0.02)            # holes filled, specks dropped
    if how != "clipping mask layer":                                    # thin guide lines stuck to the outline
        product = big_parts(dilate(~dilate(~product, 3), 3) & product, 0.02)
    if product.mean() < 0.05:
        return None, None, "artwork area not found"
    red = _redband(rgb) & product
    r = max(2, round(max(rgb.shape) / 400))
    bleed = ~dilate(~dilate(red, r), r)                                 # the band's lettering closed
    bleed = dilate(~dilate(~bleed, 2), 2) & product                    # thin red text / lines are not band
    bleed = big_parts(bleed, 0.05) if bleed.any() else bleed
    visible = product & ~bleed
    if bleed.any():
        opened = dilate(~dilate(~visible, 2), 2) & visible
        bleed |= visible & ~opened & dilate(bleed, 4)
        bleed |= product & ~bleed & ~big_parts(product & ~bleed, 0.02)
        visible = product & ~bleed
    lav = _lav(rgb)
    rc = max(2, round(max(rgb.shape) / 500))
    lav = ~dilate(~dilate(lav, rc), rc)
    safe = ~border_connected(~lav) & visible
    if safe.sum() < 0.3 * max(1, visible.sum()):
        return None, None, f"safe area not readable ({how})"
    m = np.zeros(product.shape, np.uint8)
    m[bleed] = 64; m[visible] = 128; m[safe] = 255
    return rgb_img, m, {"how": how, "W": W, "H": H, "bleed": float(bleed.sum() / product.sum())}


def logo_box(m, W, H):
    """Where a logo goes on a one-piece flag: the tallest wide box inside its safe area (inches), else None"""
    safe = m == 255
    ys = np.where(safe.any(axis=1))[0]
    if len(ys) < 20:
        return None
    hi, wi = m.shape
    lefts = np.array([np.argmax(safe[y]) for y in ys]); rights = np.array([wi - np.argmax(safe[y][::-1]) for y in ys])
    width = rights - lefts
    good = width >= 0.75 * width.max()
    best, run, start = (0, 0), 0, 0
    for i, g in enumerate(good):
        if g:
            if run == 0: start = i
            run += 1
            if run > best[1] - best[0]: best = (start, i + 1)
        else:
            run = 0
    a, b = best
    if b - a < 10:
        return None
    xl, xr = lefts[a:b].max(), rights[a:b].min()
    return [round(xl / wi * W, 3), round(ys[a] / hi * H, 3), round(xr / wi * W, 3), round((ys[b - 1] + 1) / hi * H, 3)]


def flag_logo_boxes(repo, rec):
    """
    Where a logo-only artwork goes on a flag: one box per flag piece (front and back of a double-sided layout), each the
    tallest wide box inside that piece's safe area — rec.front / frontSafe (first piece) and rec.logoBoxes (all), inches
    """
    for k in ("front", "frontSafe", "logoBoxes", "logoArea"):
        rec.pop(k, None)
    m = np.asarray(Image.open(os.path.join(repo, rec["mask"])))
    safe = m == 255
    pieces = []
    img = Image.fromarray(np.where(safe, 255, 0).astype(np.uint8), "L").copy()
    while True:
        a = np.asarray(img)
        i = int(np.argmax(a == 255))
        if a.flat[i] != 255:
            break
        ImageDraw.floodfill(img, (i % a.shape[1], i // a.shape[1]), 100)
        part = np.asarray(img) == 100
        ImageDraw.floodfill(img, (i % a.shape[1], i // a.shape[1]), 50)
        if part.sum() >= 0.15 * safe.sum():
            pieces.append(part)
    sizes = sorted(p.sum() for p in pieces)
    rec["_pieces"] = (len(pieces), float(sizes[0] / sizes[-1]) if pieces else 0)
    if not pieces or len(pieces) > 2:
        return
    W, H = rec["fullIn"]
    boxes = []
    for part in sorted(pieces, key=lambda p: np.where(p.any(axis=0))[0][0]):   # left piece first
        mm = np.where(part, 255, np.where(m >= 128, 128, 0)).astype(np.uint8)
        b = logo_box(mm, W, H)
        if b:
            boxes.append(b)
    if boxes:
        rec.update(front=boxes[0], frontSafe=boxes[0], logoBoxes=boxes, logoArea="safe area")


def flag_job(job):
    root, rel, qdir, qrel = job
    try:
        path = os.path.join(root, rel)
        rgb, m, info = layered_template(path)
        if m is None:
            return rel, None, info
        res = psd_resolution(path) or 72
        W, H = info["W"] / res, info["H"] / res
        tid = re.sub(r"[^a-z0-9]+", "-", os.path.splitext(os.path.basename(rel))[0].lower()).strip("-")[:36].strip("-") + "-" + hashlib.md5(rel.encode()).hexdigest()[:6]
        pv = rgb.copy(); pv.thumbnail((PREVIEW_PX, PREVIEW_PX), Image.LANCZOS)
        pv.save(os.path.join(qdir, tid + ".jpg"), quality=84, optimize=True, progressive=True)
        mk = Image.fromarray(m, "L")
        kk = min(1, CUST_MASK_PX / max(mk.size))
        mk.resize((max(1, round(mk.width * kk)), max(1, round(mk.height * kk))), Image.NEAREST).save(os.path.join(qdir, tid + ".m.png"), optimize=True)
        with open(os.path.join(qdir, tid + ".o.json"), "w", encoding="utf-8", newline="\n") as fh:
            json.dump(vector_outlines(m), fh, separators=(",", ":"))
        rec = describe(rel)
        rec.update(id=tid, src=rel, img=f"{qrel}/{tid}.jpg", mask=f"{qrel}/{tid}.m.png", outline=f"{qrel}/{tid}.o.json",
                   fullIn=[round(W, 2), round(H, 2)], visIn=bbox(m >= 128, W, H), safeIn=bbox(m == 255, W, H), prodIn=bbox(m >= 64, W, H),
                   kind="layers", source="qnap", layout=True, areas={"bleed": round(info["bleed"], 3)}, layersFrom=info["how"])
        return rel, rec, "ok (" + info["how"] + ")"                    # logo boxes: flag_logo_boxes (finalize)
    except Exception as e:
        return rel, None, f"failed ({type(e).__name__}: {str(e)[:80]})"


def flags(repo, root, workers=3, only=None):
    """Build the Custom Flags templates from their PSD layers → tools/qnap_flag_records.json, then finalize"""
    base = os.path.join(root, FLAG_GROUP)
    files = []
    for dp, dn, fn in os.walk(base):
        rel = os.path.relpath(dp, root)
        parts = rel.split(os.sep)
        if len(parts) > 1 and FLAG_SKIP.match(parts[1]):
            dn[:] = []
            continue
        dn[:] = [d for d in dn if not SKIP_DIR.match(d) and not re.search(r"(?i)mock", d)]
        for f in fn:
            full = os.path.join(dp, f)
            if re.search(r"(?i)\.(psdt|psd)$", f) and not SKIP_NAME.search(os.path.splitext(f)[0]) and os.path.getsize(full) < MAX_MB * 1e6:
                files.append(os.path.join(rel, f))
    files.sort()
    if only:
        files = [f for f in files if any(o.lower() in f.lower() for o in only)]
    qdir, qrel = asset_dir(repo, FLAG_GROUP)
    print(f"{len(files)} flag templates", flush=True)
    recs, report = [], []
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for n, (rel, rec, why) in enumerate(ex.map(flag_job, [(root, f, qdir, qrel) for f in files]), 1):
            report.append((rel, why))
            if rec:
                recs.append(rec)
            print(f"  {n}/{len(files)} {why[:60]:<60} {rel[len(FLAG_GROUP) + 1:][:90]}", flush=True)
    recs.sort(key=lambda r: r["src"].lower())
    out = os.path.join(repo, "tools", "qnap_flag_records.json")
    old = json.load(open(out, encoding="utf-8")) if only and os.path.isfile(out) else []
    keep = [r for r in old if r["src"] not in {x["src"] for x in recs}]
    json.dump(sorted(keep + recs, key=lambda r: r["src"].lower()), open(out, "w", encoding="utf-8", newline="\n"), ensure_ascii=False, indent=0)
    with open(os.path.join(repo, "tools", "qnap_flag_report.txt"), "w", encoding="utf-8", newline="\n") as fh:
        for rel, why in sorted(report):
            fh.write(f"{why:<60} {rel}\n")
    print(f"flag templates: {len(recs)} of {len(files)}")
    finalize(repo, recheck=False, customer=False)


def _preview(job):
    root, rec, repo, px, q = job
    try:
        rgb, _, _ = load(os.path.join(root, rec["src"]), px)
        rgb.thumbnail((px, px), Image.LANCZOS)
        rgb.save(os.path.join(repo, *rec["img"].split("/")), quality=q, optimize=True, progressive=True, subsampling=0 if q >= 85 else 2)
        return rec["id"], rgb.size
    except Exception as e:
        return rec["id"], f"failed ({type(e).__name__}: {str(e)[:80]})"


def previews(repo, root, px, q, workers, only=None):
    """Sharper template pictures for the canvas: re-render the previews of the built QNAP templates (masks unchanged)"""
    src = open(os.path.join(repo, "js", "qnap_templates.js"), encoding="utf-8").read()
    recs = json.loads(src.split("const QNAP_TEMPLATES = ", 1)[1].split(";\nif (typeof module", 1)[0])
    recs = [r for r in recs if r.get("source") == "qnap" and r.get("kind") != "layers" and (not only or any(o.lower() in r["src"].lower() for o in only))]

    def done(r):             # already at this size (a stopped run goes on where it was)
        try:
            with Image.open(os.path.join(repo, *r["img"].split("/"))) as im:
                return max(im.size) >= px * 0.98
        except Exception:
            return False
    todo = [r for r in recs if not done(r)]
    print(f"{len(recs)} templates, {len(recs) - len(todo)} already at {px} px", flush=True)
    recs = todo
    print(f"{len(recs)} previews at {px} px", flush=True)
    bad = 0
    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_preview, (root, r, repo, px, q)) for r in recs]
        for n, f in enumerate(as_completed(futs), 1):
            tid, res = f.result()
            if isinstance(res, str):
                bad += 1; print("  ", tid, res, flush=True)
            if n % 25 == 0 or n == len(futs):
                print(f"  {n}/{len(futs)} done", flush=True)
    print(f"previews done, {bad} failed")


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
    ap.add_argument("--finalize", action="store_true", help="only quality-check the built templates and add the customer templates")
    ap.add_argument("--customer", action="store_true", help="only rebuild the customer (website) templates")
    ap.add_argument("--production", action="store_true", help="only rebuild the production standard templates")
    ap.add_argument("--flags", action="store_true", help="build the Custom Flags templates from their PSD layers")
    ap.add_argument("--previews", type=int, default=0, help="only re-render the template pictures at this size (px)")
    ap.add_argument("--quality", type=int, default=82)
    a = ap.parse_args()
    if a.flags:
        return flags(a.repo, a.root, min(a.workers, 3), a.only)
    if a.finalize or a.customer or a.production:
        return finalize(a.repo, recheck=a.finalize, customer=not a.production)
    if a.previews:
        return previews(a.repo, a.root, a.previews, a.quality, a.workers, a.only)
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
        if not (a.sample or a.limit or a.only):
            finalize(a.repo)          # quality check + the customer (website) templates
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
