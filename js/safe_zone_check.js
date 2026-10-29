/**
 * Design Intelligence Hub - Safe Zone Check
 *
 * Team request, Oct 2026: alert the designer when important text or design sits outside the safe zone — too close
 * to the trim, where it can be cut off, folded into a hem or punched by a grommet.
 *  · Text: every word the text reader (OCR) found on the artwork, with its position
 *  · Design elements: logos / shapes standing on a plain background near the edge. Shapes that run along the edge
 *    or fill a large part of it are background / bleed on purpose and are not flagged.
 * Positions are measured in inches on the ordered size exactly as the canvas places the artwork (fitted, never
 * stretched; Rotate Artwork / Rotate Artboard included). Rectangular products only — shaped products (flags,
 * die-cut, circles, table covers…) keep the look-by-eye check.
 */
const SafeZoneCheck = {
  RECT_TYPES: ['banner', 'mesh-banner', 'yard-sign', 'marketing-flyer', 'business-card', 'aluminum-sign', 'acrylic-sign',
    'safety-parking-sign', 'magnet-rounded', 'perforated-window', 'a-frame', 'decal-sticker'],
  ANALYSE_PX: 700,          // longest side of the picture used to find design elements
  MIN_CONF: 75,             // OCR certainty a word needs to count as text
  COLOUR: '#dc2626',

  _obj: null,               // { src, res } design elements of the last artwork
  _objLoading: null,
  _last: null,              // last result (for the overlay and the alert)
  _alertShownKey: null,
  _alertClosedKey: null,

  // ── geometry ───────────────────────────────────────────────────────────
  /** Board size (inches), safe margin and the artwork turn, as the canvas shows them */
  geometry(report) {
    // QNAP product template on the canvas: its own safe area (any shape) is the measure
    const cq = (typeof CanvasInspector !== 'undefined' && CanvasInspector._activeQnap) ? CanvasInspector._activeQnap() : null;
    if (cq) return { ok: true, qnap: cq, W: cq.t.fullIn[0], H: cq.t.fullIn[1], safeIn: null, rot: CanvasInspector.currentRotation || 0, tType: 'qnap' };
    const spec = (report && report.spec) || {};
    const d = (report && report.dimensions) || {};
    let W = parseFloat(d.widthIn), H = parseFloat(d.heightIn);
    if (!(W > 0 && H > 0)) return { ok: false, reason: 'The ordered size is not known, so the safe zone cannot be measured.' };
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector : null;
    const st = (typeof appState !== 'undefined') ? appState : {};
    const tType = ci && ci.getTemplateType ? ci.getTemplateType(spec, d) : 'banner';
    // a real die-line template with its own bleed size (table covers…) is a shaped layout, not a plain rectangle
    if (ci && ci.officialTemplate && ci.officialTemplate.real && Array.isArray(ci.officialTemplate.bleedIn)) {
      return { ok: false, reason: 'Shaped product template — check the safe zone on the template by eye.' };
    }
    if (!this.RECT_TYPES.includes(tType)) return { ok: false, reason: 'Shaped product (' + tType.replace(/-/g, ' ') + ') — check the safe zone on the template by eye.' };
    let safeIn = null;
    if (typeof SopRules !== 'undefined' && SopRules.safeArea) safeIn = SopRules.safeArea(spec, st.parsedFilename).inches;
    if (!(safeIn > 0)) safeIn = parseFloat(spec.safeArea);
    if (!(safeIn > 0)) return { ok: false, reason: 'No safe-zone size for this product — check it on the template by eye.' };
    if (ci && ci.previewOrderTurned) [W, H] = [H, W];
    const rot = ci ? (ci.currentRotation || 0) : 0;
    return { ok: true, W, H, safeIn, rot, tType };
  },

  /** A box in fractions of the upright artwork → fractions of the artwork turned clockwise by rot */
  _rotBox(b, rot) {
    const x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
    switch (rot) {
      case 90: return { x: 1 - y1, y: x0, w: b.h, h: b.w };
      case 180: return { x: 1 - x1, y: 1 - y1, w: b.w, h: b.h };
      case 270: return { x: y0, y: 1 - x1, w: b.h, h: b.w };
      default: return b;
    }
  },

  /** Where the artwork lies on the board (inches): fitted, never stretched */
  _placement(g, artW, artH) {
    const turned = g.rot % 180 !== 0;
    const aw = turned ? artH : artW, ah = turned ? artW : artH;
    const k = Math.min(g.W / aw, g.H / ah);
    return { x: (g.W - aw * k) / 2, y: (g.H - ah * k) / 2, w: aw * k, h: ah * k };
  },

  /** Distance of a box (fractions of the upright artwork) to the trim on each side, in inches */
  _measure(b, g, place) {
    const r = this._rotBox(b, g.rot);
    const x0 = place.x + r.x * place.w, y0 = place.y + r.y * place.h;
    const x1 = x0 + r.w * place.w, y1 = y0 + r.h * place.h;
    const d = { left: x0, top: y0, right: g.W - x1, bottom: g.H - y1 };
    const side = Object.keys(d).reduce((a, s) => d[s] < d[a] ? s : a, 'left');
    return { dist: Math.max(0, d[side]), side, sides: Object.keys(d).filter(s => d[s] < g.safeIn), d };
  },

  /**
   * QNAP template: sample a box (fractions of the upright artwork) on the template's area mask. Any point outside
   * the safe area flags it; points in the bleed mean it will be cut off. side = where the outside part lies.
   * ink: points where the shape really has ink (fractions of the upright artwork) — sampled instead of the whole box,
   * so a round logo under a curved template edge is not flagged by the empty corners of its box.
   */
  _measureQnap(b, g, place, ink) {
    const r = this._rotBox(b, g.rot);
    const t = g.qnap.t, c = g.qnap.c, FW = t.fullIn[0], FH = t.fullIn[1];
    const x0 = place.x + r.x * place.w, y0 = place.y + r.y * place.h, bw = r.w * place.w, bh = r.h * place.h;
    const at = [];
    if (ink && ink.length) {
      ink.forEach(p => { const q = this._rotBox({ x: p.x, y: p.y, w: 0, h: 0 }, g.rot); at.push([place.x + q.x * place.w, place.y + q.y * place.h]); });
    } else {
      for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) at.push([x0 + bw * (0.04 + 0.92 * i / 8), y0 + bh * (0.04 + 0.92 * j / 8)]);
    }
    let out = 0, bleed = 0, n = 0, sx = 0, sy = 0;
    at.forEach(([X, Y]) => {
      const fx = X / FW, fy = Y / FH;
      const v = ProductTemplates.maskAt(c, fx, fy);
      n++;
      if (v < 255) { out++; sx += fx; sy += fy; if (v < 128) bleed++; }   // 64 = bleed bars, 0 = outside / bleed
    });
    // side: the template edge nearest to the part that lies outside the safe area
    let side = '';
    if (out) {
      const cx = sx / out, cy = sy / out;
      const d = { left: cx, right: 1 - cx, top: cy, bottom: 1 - cy };
      side = Object.keys(d).reduce((a, k) => d[k] < d[a] ? k : a, 'left');
    }
    return { out: out / n, intoBleed: bleed > 0, side, dist: bleed ? 0 : 1 - out / n };
  },

  /** "0.25" safe zone" or "template safe area" */
  _zone(g) {
    return g && g.qnap ? 'template safe area' : g && g.safeIn ? `${this._len(g.safeIn)} safe zone` : 'safe zone';
  },

  /** A length as the order states its size: "3.2 mm (0.125")" on a mm / cm / m order, else 0.125" */
  _len(v) {
    return typeof SopRules !== 'undefined' && SopRules.isMetric && SopRules.isMetric(SopRules.orderUnit()) ? SopRules.lenText(v) : this._fmt(v);
  },

  /** The product template measured on: 'production standard template “…”', 'website design template “…”' or 'QNAP … “…”' */
  _tplName(g, esc) {
    const t = g.qnap.t, kind = typeof ProductTemplates !== 'undefined' ? ProductTemplates.kindName(t).toLowerCase() : 'template';
    return `${kind} “${esc ? esc(t.name) : t.name}”`;
  },

  /** Measuring tolerance: OCR / pixel boxes are a pixel or two off, more on very large banners */
  _tolerance(g) {
    return Math.max(0.015, 0.06 * g.safeIn, 0.0015 * Math.max(g.W, g.H));
  },

  // ── text ───────────────────────────────────────────────────────────────
  /**
   * OCR words → text lines (words side by side on one row joined), boxes in fractions of the upright artwork.
   * Misreads are left out: stray "|" marks, short words read with low certainty, and boxes whose shape cannot hold
   * the letters read (e.g. "THE" in a box taller than it is wide — a logo or picture read as text).
   * angle: the turn the text was read at (sideways / upside-down artwork). The words are grouped the way the text
   * runs, and the line boxes turned back to the artwork as supplied.
   */
  _textLines(words, size, angle) {
    const a = (((angle || 0) % 360) + 360) % 360;
    const turnIn = b => a ? this._rotBox(b, a) : b, turnBack = b => a ? this._rotBox(b, (360 - a) % 360) : b;
    const aw = ((a % 180 ? size && size.h : size && size.w)) || 1, ah = ((a % 180 ? size && size.w : size && size.h)) || 1;
    const good = (words || []).map(w => w && Object.assign({}, w, { text: String(w.text || '').replace(/[|¦]+/g, '').trim(),
      box: w.box && turnIn(w.box) }))
      .filter(w => {
        if (!w || !w.box || !(w.box.w > 0 && w.box.h > 0)) return false;
        const letters = (w.text.match(/[A-Za-z0-9]/g) || []).length;
        if (letters < 2) return false;
        if (w.conf < (letters <= 3 ? 80 : this.MIN_CONF)) return false;
        const perLetter = (w.box.w * aw) / (w.box.h * ah) / w.text.length;
        return perLetter >= 0.3;
      })
      .map(w => ({ text: w.text, x0: w.box.x, y0: w.box.y, x1: w.box.x + w.box.w, y1: w.box.y + w.box.h }))
      .sort((a, b) => a.x0 - b.x0);
    const lines = [];
    good.forEach(w => {
      const h = w.y1 - w.y0;
      const ln = lines.find(l => {
        const lh = l.h0, ov = Math.min(l.y1, w.y1) - Math.max(l.y0, w.y0);
        return Math.max(lh, h) / Math.min(lh, h) <= 1.6 && ov >= 0.5 * Math.min(lh, h) && w.x0 - l.x1 <= 1.4 * Math.max(lh, h) && w.x0 >= l.x0 - 0.5 * h;
      });
      if (ln) { ln.words.push(w.text); ln.ws.push(w); ln.x1 = Math.max(ln.x1, w.x1); ln.y0 = Math.min(ln.y0, w.y0); ln.y1 = Math.max(ln.y1, w.y1); }
      else lines.push({ words: [w.text], ws: [w], x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, h0: h });
    });
    // a word box that reaches far above / below all the others of its line took in an ornament next to it (the reader
    // boxed "CRISTIANA" together with a frame diamond 1.4" above the letters): that side is cut back to the line
    lines.forEach(l => {
      if (l.ws.length < 3) return;
      const hs = l.ws.map(w => w.y1 - w.y0).sort((a, b) => a - b), mh = hs[hs.length >> 1];
      const tops = l.ws.map(w => w.y0).sort((a, b) => a - b), bots = l.ws.map(w => w.y1).sort((a, b) => b - a);
      if (tops[1] - tops[0] > 0.5 * mh) l.y0 = tops[1];
      if (bots[0] - bots[1] > 0.5 * mh) l.y1 = bots[1];
    });
    return lines.map(l => ({ text: l.words.join(' '), box: turnBack({ x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 }) }));
  },

  // ── design elements ────────────────────────────────────────────────────
  /** Find design elements (logos, shapes, letters the reader could not read) on a plain background. Cached. */
  _objects(src, onReady) {
    if (!src) return null;
    if (this._obj && this._obj.src === src) return this._obj.res;
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector : null;
    const use = img => {
      let res;
      try { res = this._findObjects(img); } catch (e) { res = { ok: false, reason: 'The artwork pixels could not be read in the browser.' }; }
      this._obj = { src, res };
      return res;
    };
    if (ci && ci.currentImg && ci.currentImg.src === src && ci.currentImg.naturalWidth > 0) return use(ci.currentImg);
    if (this._objLoading !== src) {
      this._objLoading = src;
      const im = new Image();
      im.onload = () => { this._objLoading = null; use(im); if (onReady) onReady(); };
      im.onerror = () => { this._objLoading = null; this._obj = { src, res: { ok: false, reason: 'The artwork could not be displayed in the browser.' } }; if (onReady) onReady(); };
      im.src = src;
    }
    return null;
  },

  _findObjects(img) {
    const W0 = img.naturalWidth || img.width, H0 = img.naturalHeight || img.height;
    if (!W0 || !H0) return { ok: false, reason: 'The artwork has no readable pixels.' };
    const k = Math.min(1, this.ANALYSE_PX / Math.max(W0, H0));
    const w = Math.max(8, Math.round(W0 * k)), h = Math.max(8, Math.round(H0 * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const n = w * h;

    // Background colours: the colours that cover the artwork's outer ring
    const ring = Math.max(2, Math.round(Math.min(w, h) * 0.025));
    const bins = new Map();
    let ringN = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x >= ring && x < w - ring && y >= ring && y < h - ring) { x = w - ring - 1; continue; }
        const o = (y * w + x) * 4;
        if (px[o + 3] < 30) continue;
        const key = ((px[o] >> 4) << 8) | ((px[o + 1] >> 4) << 4) | (px[o + 2] >> 4);
        const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += px[o]; b.g += px[o + 1]; b.b += px[o + 2];
        bins.set(key, b);
        ringN++;
      }
    }
    const bg = [];
    let covered = 0;
    [...bins.values()].sort((a, b) => b.n - a.n).forEach(b => {
      if (bg.length >= 6 || covered >= 0.85 * ringN || b.n < 0.04 * ringN) return;
      bg.push([b.r / b.n, b.g / b.n, b.b / b.n]); covered += b.n;
    });
    const plain = ringN === 0 || covered >= 0.6 * ringN;   // a busy (photo) background: design elements cannot be told apart
    if (!plain) return { ok: true, plain: false, items: [], size: { w: W0, h: H0 } };

    const fg = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      const o = p * 4;
      if (px[o + 3] < 30) continue;
      let best = 1e9;
      for (const c of bg) {
        const dr = px[o] - c[0], dg = px[o + 1] - c[1], db = px[o + 2] - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < best) best = d;
      }
      if (best > 34 * 34) fg[p] = 1;
    }

    // Thin straight rules (frame / divider lines) are decoration: taken out first, so a logo standing on a rule is
    // found as itself — not as one wide shape together with the rule
    const LONG = Math.max(12, Math.round(0.06 * Math.max(w, h))), THIN = Math.max(2, Math.round(0.005 * Math.max(w, h)));
    const hrun = new Uint16Array(n), vrun = new Uint16Array(n);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w;) {
        if (!fg[y * w + x]) { x++; continue; }
        let e = x; while (e < w && fg[y * w + e]) e++;
        for (let i = x; i < e; i++) hrun[y * w + i] = Math.min(65535, e - x);
        x = e;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h;) {
        if (!fg[y * w + x]) { y++; continue; }
        let e = y; while (e < h && fg[e * w + x]) e++;
        for (let i = y; i < e; i++) vrun[i * w + x] = Math.min(65535, e - y);
        y = e;
      }
    }
    for (let p = 0; p < n; p++) {
      if (fg[p] && ((hrun[p] >= LONG && vrun[p] <= THIN) || (vrun[p] >= LONG && hrun[p] <= THIN))) fg[p] = 0;
    }

    // Connected shapes, then nearby shapes joined (letters into words, parts of a logo)
    const label = mask => {
      const lab = new Int32Array(n), comps = [], stack = [];
      for (let i = 0; i < n; i++) {
        if (!mask[i] || lab[i]) continue;
        const id = comps.length + 1;
        let x0 = w, y0 = h, x1 = 0, y1 = 0, cnt = 0;
        lab[i] = id; stack.push(i);
        while (stack.length) {
          const q = stack.pop(), x = q % w, y = (q / w) | 0;
          cnt++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (x > 0 && mask[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack.push(q - 1); }
          if (x < w - 1 && mask[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack.push(q + 1); }
          if (y > 0 && mask[q - w] && !lab[q - w]) { lab[q - w] = id; stack.push(q - w); }
          if (y < h - 1 && mask[q + w] && !lab[q + w]) { lab[q + w] = id; stack.push(q + w); }
        }
        comps.push({ x0, y0, x1, y1, n: cnt });
      }
      return { lab, comps };
    };
    const { lab, comps } = label(fg);
    const edgeTol = Math.max(1, Math.round(Math.min(w, h) * 0.004));
    const minN = Math.max(10, n * 0.00015);
    const isBig = c => c.n > n * 0.12 || c.x1 - c.x0 + 1 > w * 0.6 || c.y1 - c.y0 + 1 > h * 0.6;
    const touches = c => c.x0 <= edgeTol || c.y0 <= edgeTol || c.x1 >= w - 1 - edgeTol || c.y1 >= h - 1 - edgeTol;
    // printed ink or a photo: the spread of brightness inside each shape (flat ink ≈ 0) and its share of pure ink —
    // full white or a strong colour, which photo pieces seldom are
    const pureInk = o => { const mx = Math.max(px[o], px[o + 1], px[o + 2]), mn = Math.min(px[o], px[o + 1], px[o + 2]); return mn >= 242 || (mx - mn >= 150 && mx >= 190); };
    const lum = new Float64Array(comps.length + 1), lum2 = new Float64Array(comps.length + 1), pureN = new Int32Array(comps.length + 1);
    const rgb = new Float64Array((comps.length + 1) * 3);
    for (let p = 0; p < n; p++) {
      const id = lab[p];
      if (!id) continue;
      const o = p * 4, l = 0.3 * px[o] + 0.59 * px[o + 1] + 0.11 * px[o + 2];
      lum[id] += l; lum2[id] += l * l;
      rgb[id * 3] += px[o]; rgb[id * 3 + 1] += px[o + 1]; rgb[id * 3 + 2] += px[o + 2];
      if (pureInk(o)) pureN[id]++;
    }
    // how sharply each shape stands off its surroundings: the colour step from its border pixels to the background
    // beside them — printed ink jumps, a patch of background shading (a gradient a shade off the edge colours) fades
    const step = new Float64Array(comps.length + 1), stepN = new Int32Array(comps.length + 1);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x, id = lab[p];
        if (!id) continue;
        for (const q of [p - 1, p + 1, p - w, p + w]) {
          if (fg[q]) continue;
          const o = p * 4, r = q * 4;
          step[id] += Math.abs(px[o] - px[r]) + Math.abs(px[o + 1] - px[r + 1]) + Math.abs(px[o + 2] - px[r + 2]);
          stepN[id]++;
        }
      }
    }
    comps.forEach((c, i) => {
      c.id = i + 1;
      c.step = stepN[i + 1] ? step[i + 1] / stepN[i + 1] : null;
      const m = lum[i + 1] / c.n;
      c.texture = Math.sqrt(Math.max(0, lum2[i + 1] / c.n - m * m)); c.pure = pureN[i + 1] / c.n;
      c.rgb = [rgb[(i + 1) * 3] / c.n, rgb[(i + 1) * 3 + 1] / c.n, rgb[(i + 1) * 3 + 2] / c.n];
    });
    const inkLike = c => c.pure >= 0.5 || c.texture <= 8;
    // share of plain background in a ring around a shape: a logo or a word stands on the background, a piece of a
    // photo does not
    const bgAround = c => {
      const m = Math.max(3, Math.round(0.3 * Math.min(c.x1 - c.x0 + 1, c.y1 - c.y0 + 1)));
      const X0 = Math.max(0, c.x0 - m), Y0 = Math.max(0, c.y0 - m), X1 = Math.min(w - 1, c.x1 + m), Y1 = Math.min(h - 1, c.y1 + m);
      let tot = 0, bgN = 0;
      for (let y = Y0; y <= Y1; y += 2) {
        for (let x = X0; x <= X1; x += 2) {
          if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) continue;
          tot++; if (!fg[y * w + x]) bgN++;
        }
      }
      return tot ? bgN / tot : 1;
    };
    // share of a shape's own side that lies on the artwork edge: a background band or a photo running off sits on the
    // edge along its whole side, a figure the trim cuts (hair, a foot, a barbell) only at a point
    const onEdge = (c, id) => {
      const cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
      const rows = (xa, xb) => { let k = 0; for (let y = c.y0; y <= c.y1; y++) for (let x = xa; x <= xb; x++) if (lab[y * w + x] === id) { k++; break; } return k / chh; };
      const cols = (ya, yb) => { let k = 0; for (let x = c.x0; x <= c.x1; x++) for (let y = ya; y <= yb; y++) if (lab[y * w + x] === id) { k++; break; } return k / cw; };
      let f = 0;
      if (c.x0 <= edgeTol) f = Math.max(f, rows(0, edgeTol));
      if (c.x1 >= w - 1 - edgeTol) f = Math.max(f, rows(w - 1 - edgeTol, w - 1));
      if (c.y0 <= edgeTol) f = Math.max(f, cols(0, edgeTol));
      if (c.y1 >= h - 1 - edgeTol) f = Math.max(f, cols(h - 1 - edgeTol, h - 1));
      c.onEdge = f;
      return f;
    };
    let keep = comps.filter((c, i) => {
      if (c.n < minN) return false;                                       // specks: the Lines & Dots check
      const cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
      if (isBig(c)) return false;                                         // big shapes / frames / panels / the photo
      // a soft border (colour step under 20 to the background beside it): background shading, not printed ink
      // (letters / logos step 45–290; a patch of a pale gradient ≈ 8)
      if (c.step !== null && c.step < 20) return false;
      // touching the artwork edge: a background / bleed shape or a photo running off — unless it is a compact shape
      // of flat ink (a logo or graphic the trim cuts through) or a large solid figure that only grazes the edge (a
      // runner's hair: fills 55 % of its box, 4 % of its side on the edge — a curved background swoosh fills about 20 %;
      // small photo slivers and frame corners stay out)
      c.edge = touches(c);
      if (c.edge && (cw > w * 0.25 || chh > h * 0.25 || c.n < 0.2 * cw * chh || !inkLike(c))
        && !((cw > w * 0.25 || chh > h * 0.25) && cw <= w * 0.5 && chh <= h * 0.5 && c.n >= 0.35 * cw * chh
          && onEdge(c, i + 1) <= 0.25)) return false;
      // thin lines (frame / border rules, curves) are decoration
      if (Math.max(cw, chh) >= 8 * Math.min(cw, chh) && Math.min(cw, chh) <= Math.max(3, Math.max(w, h) * 0.012)) return false;
      return true;
    });

    // Logos standing on a photo (a team logo over the picture): the photo is one big shape, so near the edges a logo
    // is looked for inside it by its colours — pure white or a strong ink colour, which a photo seldom has in a
    // compact solid shape
    const bigId = new Uint8Array(comps.length + 1);
    comps.forEach((c, i) => { if (isBig(c)) bigId[i + 1] = 1; });
    const BAND = 0.15, gm = new Uint8Array(n);
    let onPic = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x > w * BAND && x < w * (1 - BAND) && y > h * BAND && y < h * (1 - BAND)) { x = Math.floor(w * (1 - BAND)); continue; }
        const p = y * w + x;
        if (!bigId[lab[p]]) continue;
        const o = p * 4, mx = Math.max(px[o], px[o + 1], px[o + 2]), mn = Math.min(px[o], px[o + 1], px[o + 2]);
        if (mn >= 225 || (mx - mn >= 110 && mx >= 150)) { gm[p] = 1; onPic++; }
      }
    }
    if (onPic) {
      const L = label(gm);
      // printed ink is pure: most of a logo is full white or full colour, photo highlights / sparkles are not
      const pure = new Int32Array(L.comps.length + 1);
      for (let p = 0; p < n; p++) if (L.lab[p] && pureInk(p * 4)) pure[L.lab[p]]++;
      L.comps.forEach((c, i) => {
        const cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
        if (c.n < 2 * minN || cw > w * 0.2 || chh > h * 0.2 || touches(c)) return;
        if (c.n < 0.15 * cw * chh || Math.min(cw, chh) < 0.25 * Math.max(cw, chh)) return;   // thin / stripy: part of the photo
        if (pure[i + 1] < 0.5 * c.n) return;
        keep.push(Object.assign(c, { edge: false, onPicture: true }));
      });
    }
    if (keep.length > 1500) keep = keep.sort((a, b) => b.n - a.n).slice(0, 1500);

    // Background pattern: 8+ identical shapes spread over the artwork (bricks, tiles, polka dots) — a background
    // that runs into the bleed on purpose, together with its pieces cut by the trim
    const near = (a, b, t, abs) => Math.abs(a - b) <= Math.max(abs, t * Math.max(a, b));
    const dims = c => [c.x1 - c.x0 + 1, c.y1 - c.y0 + 1];
    const same = (a, b) => { const [aw, ah] = dims(a), [bw, bh] = dims(b); return near(aw, bw, 0.1, 1.5) && near(ah, bh, 0.1, 1.5) && near(a.n, b.n, 0.12, 8); };
    const members = [];
    keep.forEach(c => {
      if (c.onPicture) return;
      let k = 0, x0 = w, x1 = 0, y0 = h, y1 = 0;
      for (const o of keep) {
        if (o.onPicture || !same(c, o)) continue;
        k++; x0 = Math.min(x0, o.x0); x1 = Math.max(x1, o.x1); y0 = Math.min(y0, o.y0); y1 = Math.max(y1, o.y1);
      }
      if (k >= 8 && x1 - x0 >= 0.3 * w && y1 - y0 >= 0.3 * h) { c.pattern = true; members.push(c); }
    });
    if (members.length) {
      const sameInk = (a, b) => Math.hypot(a.rgb[0] - b.rgb[0], a.rgb[1] - b.rgb[1], a.rgb[2] - b.rgb[2]) <= 30;
      // pieces of tiles cut by the trim or by the artwork's shape (curves, slanted edges), single or run together into
      // up to three in a row: the pattern's colour and no bigger than that
      keep.forEach(c => {
        if (c.pattern || c.onPicture) return;
        const [cw, chh] = dims(c);
        if (members.some(m => {
          const [mw, mh] = dims(m);
          return sameInk(c, m) && c.n <= 3.3 * m.n
            && ((cw <= 1.15 * mw + 2 && chh <= 3.3 * mh + 2) || (cw <= 3.3 * mw + 2 && chh <= 1.15 * mh + 2));
        })) c.pattern = true;
      });
    }

    // Join shapes that belong together: boxes that touch (one shape), letters side by side on one row (a word / a
    // line of text), a small mark over or under a bigger shape (the dot of an i, an accent, a small logo part)
    const par = keep.map((_, i) => i);
    const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < keep.length; i++) {
      const a = keep[i], aw = a.x1 - a.x0 + 1, ah = a.y1 - a.y0 + 1;
      for (let j = i + 1; j < keep.length; j++) {
        const b = keep[j], bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
        const gx = Math.max(a.x0 - b.x1, b.x0 - a.x1) - 1, gy = Math.max(a.y0 - b.y1, b.y0 - a.y1) - 1;
        if (gx > 1.2 * Math.max(ah, bh) + 3 || gy > 0.7 * Math.max(ah, bh) + 3) continue;
        if (!a.onPicture !== !b.onPicture) continue;                       // a logo on the photo stays apart from photo pieces
        const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1, oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) + 1;
        const [big, small, sw, sh, bigH] = a.n >= b.n ? [a, b, bw, bh, ah] : [b, a, aw, ah, bh];
        const join = (gx <= 1 && gy <= 1)
          || (oy >= 0.5 * Math.min(ah, bh) && Math.max(ah, bh) <= 2.5 * Math.min(ah, bh) && gx <= Math.max(3, 0.8 * Math.max(ah, bh)))
          || (small.n <= 0.2 * big.n && sw <= 0.22 * bigH && sh <= 0.22 * bigH && ox >= 0.5 * sw && gy <= 0.4 * bigH);
        if (join) par[find(i)] = find(j);
      }
    }
    const groups = new Map();
    keep.forEach((c, i) => {
      const r = find(i);
      const t = groups.get(r) || { x0: w, y0: h, x1: 0, y1: 0, n: 0, parts: [], edge: false, onPicture: false, patternN: 0 };
      t.x0 = Math.min(t.x0, c.x0); t.y0 = Math.min(t.y0, c.y0); t.x1 = Math.max(t.x1, c.x1); t.y1 = Math.max(t.y1, c.y1);
      t.n += c.n; t.parts.push(c); t.edge = t.edge || c.edge; t.onPicture = t.onPicture || !!c.onPicture;
      if (c.pattern) t.patternN++;
      groups.set(r, t);
    });

    // Lettering: a row of 3+ shapes of a similar height side by side — a word the text reader may have missed
    // (distressed / script fonts) or not read at all. Rows of identical shapes (dots, stars, a pattern) are graphics.
    const spread = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return m ? Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length) / m : 0; };
    const lettering = t => {
      const big = Math.max(...t.parts.map(q => q.n));
      const ps = t.parts.filter(p => p.n >= 0.03 * big).map(p => ({ x0: p.x0, x1: p.x1, w: p.x1 - p.x0 + 1, h: p.y1 - p.y0 + 1, cy: (p.y0 + p.y1) / 2, n: p.n,
        fill: p.n / ((p.x1 - p.x0 + 1) * (p.y1 - p.y0 + 1)) }));
      if (ps.length < 3) return false;
      // a row grows only by close neighbours (letters of a word, words of a line) — scattered shapes (notes, stars,
      // splashes) at the same height are not lettering
      const rows = [];
      ps.sort((a, b) => a.x0 - b.x0).forEach(p => {
        const r = rows.find(r => Math.abs(r.cy - p.cy) <= 0.35 * Math.max(r.h, p.h) && Math.max(r.h, p.h) <= 2 * Math.min(r.h, p.h)
          && p.x0 - r.x1 <= 0.9 * Math.max(r.h, p.h));
        // letters stand side by side: a shape lying over the previous one (parts of one glyph / ornament) is not a
        // new letter
        if (r) { if (p.x0 >= r.x1 - 0.3 * p.w) { r.ps.push(p); r.ink += p.w; } r.x1 = Math.max(r.x1, p.x1); }
        else rows.push({ cy: p.cy, h: p.h, x0: p.x0, x1: p.x1, ps: [p], ink: p.w });
      });
      return rows.some(r => {
        if (r.ps.length < 3 || r.x1 - r.x0 + 1 < 1.5 * r.h || r.ink < 0.45 * (r.x1 - r.x0 + 1)) return false;
        const fills = r.ps.map(p => p.fill).sort((a, b) => a - b);
        if (fills[fills.length >> 1] > 0.8) return false;                  // solid blocks / tiles, not letters
        const ws = r.ps.map(p => p.w), hs = r.ps.map(p => p.h), ns = r.ps.map(p => p.n);
        return !(r.ps.length >= 6 && spread(ws) < 0.12 && spread(hs) < 0.12 && spread(ns) < 0.12);
      });
    };
    // where a shape really has ink: the centre of its pixels in each cell of a 9 × 9 grid over its box (shapes found
    // on a photo by their colours have no label here → their box is measured)
    const inkPoints = (parts, x0, y0, x1, y1) => {
      if (parts.some(p => !p.id)) return null;
      const ids = new Set(parts.map(p => p.id)), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      const sx = new Float64Array(81), sy = new Float64Array(81), cnt = new Int32Array(81);
      for (let y = y0; y <= y1; y++) {
        const j = Math.min(8, ((y - y0) * 9 / bh) | 0);
        for (let x = x0; x <= x1; x++) {
          if (!ids.has(lab[y * w + x])) continue;
          const k = Math.min(8, ((x - x0) * 9 / bw) | 0) * 9 + j;
          sx[k] += x; sy[k] += y; cnt[k]++;
        }
      }
      const pts = [];
      for (let k = 0; k < 81; k++) if (cnt[k]) pts.push({ x: (sx[k] / cnt[k] + 0.5) / w, y: (sy[k] / cnt[k] + 0.5) / h });
      return pts;
    };
    // a shape standing on the plain background (a logo on a photo was found by its colours)
    const items = [...groups.values()].filter(t => t.patternN < 0.6 * t.parts.length && (t.onPicture || bgAround(t) >= 0.55))
      .sort((a, b) => b.n - a.n).slice(0, 80);
    return {
      ok: true, plain: true, size: { w: W0, h: H0 },
      items: items.map(t => ({ box: { x: t.x0 / w, y: t.y0 / h, w: (t.x1 - t.x0 + 1) / w, h: (t.y1 - t.y0 + 1) / h },
        parts: t.parts.length, lettering: lettering(t), edge: t.edge, onPicture: t.onPicture,
        ink: inkPoints(t.parts, t.x0, t.y0, t.x1, t.y1),
        // the shapes of a group one by one: a graphic joined with the lettering beside it is still measured itself
        pieces: t.parts.length > 1 ? t.parts.map(p => ({ x: p.x0 / w, y: p.y0 / h, w: (p.x1 - p.x0 + 1) / w, h: (p.y1 - p.y0 + 1) / h, edge: !!p.edge,
          ink: inkPoints([p], p.x0, p.y0, p.x1, p.y1) })) : null,
        _parts: this._debug ? t.parts.map(p => [p.x0, p.y0, p.x1, p.y1, p.n, Math.round(p.texture || 0), p.pattern ? 'P' : '', p.edge ? 'E' : '', Math.round(p.step || 0), p.onEdge === undefined ? '' : +p.onEdge.toFixed(2)]) : undefined })),
      // the background pattern's shapes: the text reader sometimes "reads" a word in a pattern (bricks → "Jd")
      pattern: keep.filter(c => c.pattern).slice(0, 600).map(c => ({ x: c.x0 / w, y: c.y0 / h, w: (c.x1 - c.x0 + 1) / w, h: (c.y1 - c.y0 + 1) / h }))
    };
  },

  // ── result ─────────────────────────────────────────────────────────────
  _readable(analysis) {
    const src = analysis && analysis.previewDataUrl;
    const ext = ((analysis && analysis.fileExt) || '').toLowerCase();
    return !!src && !src.includes('PDF VECTOR') && (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext) || !!analysis.renderedFromPdf);
  },

  /** Everything the check knows now: { state: 'na' | 'waiting' | 'done', items, g, text, objects } */
  evaluate(report) {
    const g = this.geometry(report);
    if (!g.ok) return { state: 'na', reason: g.reason, items: [] };
    const analysis = report.analysis || {};
    if (!this._readable(analysis)) return { state: 'na', reason: 'The real pixels of this file are not shown in the browser.', items: [], g };
    const src = analysis.previewDataUrl;
    const ai = (typeof AgenticAiInspector !== 'undefined') ? AgenticAiInspector : null;
    const tState = ai && ai.textState ? ai.textState.status : 'unavailable';
    const textWords = ai && ai.textResult ? ai.textResult.words : null;
    const textPending = !textWords && (tState === 'loading' || tState === 'reading' || tState === 'idle');
    const obj = this._objects(src, () => this.refresh());
    if (!obj || textPending) return { state: 'waiting', items: [], g };

    if (!obj.ok && !textWords) return { state: 'na', reason: obj.reason || 'The artwork could not be read.', items: [], g };
    const size = obj.size || { w: 1, h: 1 };
    const turned = g.rot % 180 !== 0;
    const place = g.qnap
      ? ProductTemplates.placement(g.qnap.t, turned ? (size.h || 1) : (size.w || 1), turned ? (size.w || 1) : (size.h || 1), g.rot)
      : this._placement(g, size.w || 1, size.h || 1);
    const tol = g.qnap ? 0 : this._tolerance(g);
    const measure = (b, ink) => g.qnap ? this._measureQnap(b, g, place, ink) : this._measure(b, g, place);
    const outside = m => g.qnap ? m.out > 0 : m.dist < g.safeIn - tol;
    // near = on the safe line, within the measuring tolerance: listed in the details, not counted
    const items = [], near = [];
    // a short "word" read inside a background pattern is the pattern misread (bricks → "Jd"), not text
    const pat = (obj.ok && obj.pattern) || [];
    const onPattern = b => {
      let a = 0;
      pat.forEach(p => {
        const ix = Math.min(b.x + b.w, p.x + p.w) - Math.max(b.x, p.x), iy = Math.min(b.y + b.h, p.y + p.h) - Math.max(b.y, p.y);
        if (ix > 0 && iy > 0) a += ix * iy;
      });
      return a >= 0.5 * b.w * b.h;
    };
    const readAt = ai && ai.textResult && ai.textResult.orientation ? ai.textResult.orientation.angle : 0;
    const lines = (textWords ? this._textLines(textWords, size, readAt) : [])
      .filter(l => !(pat.length && (l.text.match(/[A-Za-z0-9]/g) || []).length <= 4 && onPattern(l.box)));
    // The reader's word boxes can take in an ornament or a frame line next to the text (US2428792: "027" boxed down to
    // the gold frame line, 0.29" from the bottom, the digits 2.7" up): a line found outside is measured again on its
    // letters — the shapes inside its box at the letters' height (the ornament sits above / below them)
    const pieces = obj.ok && obj.items ? obj.items.flatMap(o => o.pieces || [o.box]) : [];
    const letters = b => {
      const ps = pieces.filter(p => {
        const ix = Math.min(b.x + b.w, p.x + p.w) - Math.max(b.x, p.x), iy = Math.min(b.y + b.h, p.y + p.h) - Math.max(b.y, p.y);
        return ix > 0 && iy > 0 && ix * iy >= 0.6 * p.w * p.h;
      });
      if (ps.length < 2) return null;
      const mid = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
      const cy = mid(ps.map(p => p.y + p.h / 2)), ph = mid(ps.map(p => p.h));
      const ls = ps.filter(p => Math.abs(p.y + p.h / 2 - cy) <= 0.6 * ph);
      if (ls.length < 2) return null;
      const x0 = Math.min(...ls.map(p => p.x)), y0 = Math.min(...ls.map(p => p.y));
      return { x: x0, y: y0, w: Math.max(...ls.map(p => p.x + p.w)) - x0, h: Math.max(...ls.map(p => p.y + p.h)) - y0 };
    };
    lines.forEach(l => {
      let m = measure(l.box);
      if (outside(m) && !g.qnap) {
        const lb = letters(l.box);
        if (lb) { l.box = lb; m = measure(lb); }
      }
      const it = Object.assign({ kind: 'text', text: l.text, box: l.box }, m);
      if (outside(m)) items.push(it);
      else if (!g.qnap && m.dist < g.safeIn) near.push(it);
    });
    const overlapsText = b => lines.some(l => {
      const ix = Math.min(b.x + b.w, l.box.x + l.box.w) - Math.max(b.x, l.box.x);
      const iy = Math.min(b.y + b.h, l.box.y + l.box.h) - Math.max(b.y, l.box.y);
      return ix > 0 && iy > 0 && ix * iy >= 0.3 * Math.min(b.w * b.h, l.box.w * l.box.h);
    });
    // a shape the read text covers (a letter of a read word, padded a little for the reader's tight boxes)
    const inText = b => lines.some(l => {
      const py = 0.15 * l.box.h, pxl = py * (size.h || 1) / (size.w || 1);
      const ix = Math.min(b.x + b.w, l.box.x + l.box.w + pxl) - Math.max(b.x, l.box.x - pxl);
      const iy = Math.min(b.y + b.h, l.box.y + l.box.h + py) - Math.max(b.y, l.box.y - py);
      return ix > 0 && iy > 0 && ix * iy >= 0.5 * b.w * b.h;
    });
    if (obj.ok && obj.items) {
      obj.items.forEach(o => {
        if (overlapsText(o.box)) {
          // a group joined with read text (bolts beside a word, a mascot next to a name): the text is measured as text
          // above — its other shapes are measured one by one, one mark per side they cross
          const bySide = {};
          (o.pieces || []).forEach(p => {
            if (inText(p)) return;
            const m = measure(p, p.ink);
            if (!outside(m)) return;
            const s = bySide[m.side] || (bySide[m.side] = { x0: 1, y0: 1, x1: 0, y1: 0, edge: false, m });
            s.x0 = Math.min(s.x0, p.x); s.y0 = Math.min(s.y0, p.y); s.x1 = Math.max(s.x1, p.x + p.w); s.y1 = Math.max(s.y1, p.y + p.h);
            s.edge = s.edge || p.edge;
            if (m.dist < s.m.dist) s.m = m;
          });
          // on a template the shapes' own ink was measured — the box around them would add empty corners
          Object.values(bySide).forEach(s => {
            const box = { x: s.x0, y: s.y0, w: s.x1 - s.x0, h: s.y1 - s.y0 }, m = g.qnap ? s.m : measure(box);
            if (outside(m)) items.push(Object.assign({ kind: 'object', text: '', box, edge: s.edge }, m));
          });
          return;
        }
        // lettering = a word read from its shapes (the text reader missed it or did not run): counted like text
        const m = measure(o.box, o.ink), it = Object.assign({ kind: o.lettering ? 'lettering' : 'object', text: '', box: o.box, edge: !!o.edge }, m);
        if (outside(m)) items.push(it);
        else if (o.lettering && !g.qnap && m.dist < g.safeIn) near.push(it);
      });
    }
    const order = { text: 0, lettering: 1, object: 2 };
    items.sort((a, b) => (order[a.kind] - order[b.kind]) || a.dist - b.dist);
    const counts = { text: 0, lettering: 0, object: 0 };
    items.forEach(it => counts[it.kind]++);
    return { state: 'done', items: items.slice(0, 8), more: Math.max(0, items.length - 8), counts, near, tol, g, place,
      textRead: !!textWords, textLines: lines.length, objectsChecked: !!(obj.ok && obj.plain), objReason: obj.ok ? '' : obj.reason };
  },

  _fmt(v) { return (+v).toFixed(v < 1 ? 3 : 2).replace(/\.?0+$/, '') + '"'; },

  /** One line per item, for the card and the alert */
  describe(it, g) {
    return `${this.what(it)} ${this.where(it, g)}`;
  },

  what(it) {
    return it.kind === 'text' ? `Text “${it.text.length > 40 ? it.text.slice(0, 38) + '…' : it.text}”`
      : it.kind === 'lettering' ? 'Lettering / logo (read from its shapes)' : 'Graphic';
  },

  /** Where an item lies, in words — every side it is too close to */
  where(it, g) {
    if (g && g.qnap) return it.intoBleed ? `runs into the bleed on the ${it.side} (it will be cut off)` : `crosses the template safe area on the ${it.side}`;
    if (it.dist <= 0.005) return it.kind === 'object' ? `runs off the ${it.side} edge — fine only if it is background / bleed` : `touches the ${it.side} edge (it will be cut)`;
    const also = (it.sides || []).filter(s => s !== it.side && it.d).map(s => `${this._len(Math.max(0, it.d[s]))} from the ${s}`);
    return `is ${this._len(it.dist)} from the ${it.side} edge${also.length ? ` and ${also.join(', ')}` : ''}`;
  },

  /** The pre-check card */
  check(report) {
    const base = { id: 'safeArea', name: 'Safe Area Margins', icon: '🛡️' };
    const r = this.evaluate(report || {});
    this._last = Object.assign({ key: this._key(report) }, r);
    const spec = (report && report.spec) || {};
    const safeTxt = r.g && r.g.safeIn ? this._len(r.g.safeIn) : (spec.safeArea || '');
    const zone = r.g ? this._zone(r.g) : `${safeTxt} safe zone`;
    const onWhat = r.g && r.g.qnap ? `the ${this._tplName(r.g)}` : r.g ? `the ordered size ${typeof SopRules !== 'undefined' && SopRules.isMetric(SopRules.orderUnit()) ? SopRules.sizeText(r.g.W, r.g.H) : this._fmt(r.g.W) + ' × ' + this._fmt(r.g.H)}` : '';
    base.required = r.g && r.g.qnap ? 'Text, logos and important graphics inside the template safe area (green dashed line)'
      : `Text, logos and important graphics at least ${safeTxt} inside the trim`;
    if (r.state === 'na') {
      return Object.assign(base, { status: 'WARNING', manual: true, found: 'Check by eye on the canvas',
        detail: `${r.reason} SOP: all logos, text and critical graphics stay at least ${safeTxt} inside the trim line so nothing is cut, hemmed or grommeted.`,
        action: `Use the canvas guides to check that all text and logos sit inside the ${safeTxt} safe zone.` });
    }
    if (r.state === 'waiting') {
      return Object.assign(base, { status: 'WARNING', manual: true, found: 'Checking text and logo positions…',
        detail: `Every word the text reader finds and every logo / graphic near the edge is measured against the ${zone}.`, action: '' });
    }
    const g = r.g;
    const scope = [r.textRead ? `${r.textLines} text line${r.textLines === 1 ? '' : 's'} read` : 'the text reader did not run — lettering measured from its shapes',
      r.objectsChecked ? 'logos & graphics on the plain background' : 'graphics on a busy / photo background not measured'].join(' · ');
    const nearTxt = r.near && r.near.length
      ? ` On the safe line (within the ${this._fmt(r.tol)} measuring tolerance, not counted): ${r.near.map(it => this.describe(it, g)).join(' · ')}.` : '';
    const notRead = r.textRead ? '' : ' · text not read automatically, check it by eye';
    if (!r.items.length) {
      if (!r.textRead && !r.objectsChecked) {
        return Object.assign(base, { status: 'WARNING', manual: true, found: 'Not measured automatically',
          detail: `The text could not be read and the background is too busy to find logos. Check that everything important is ${safeTxt} inside the trim.`,
          action: `Use the canvas guides (${safeTxt} safe zone).` });
      }
      return Object.assign(base, { status: 'PASS', manual: false,
        found: `Text and graphics are inside the ${zone}${r.near && r.near.length ? ` · ${r.near.length} on the safe line` : ''}`,
        detail: `Measured on ${onWhat} (${scope}).${nearTxt}${r.textRead ? '' : ' The text could not be read automatically — confirm it by eye.'}`,
        action: '', safeZone: r });
    }
    const c = r.counts || { text: 0, lettering: 0, object: r.items.length };
    const crit = c.text + c.lettering, gfx = c.object;
    // the items themselves are listed in the card (each with a "Show" button) — the details explain how it was measured
    const moveTo = g.qnap ? 'inside the safe area of the template (green dashed line)' : `at least ${safeTxt} inside the trim`;
    // Text (read, or lettering found from its shapes) is certain → Critical. Graphics alone may be decoration
    // (ornaments, bleed shapes) → marked, and confirmed by eye
    if (!crit) {
      return Object.assign(base, { status: 'WARNING', manual: true,
        found: `${gfx} graphic${gfx > 1 ? 's' : ''} outside the ${zone} — check by eye${notRead}`,
        detail: `Decoration and background may run there; logos and important graphics must not — they can be cut off, hemmed or grommeted. Measured on ${onWhat} (${scope}).${nearTxt}`,
        action: `Look at the marked graphics: move logos / important graphics ${moveTo}.`, safeZone: r });
    }
    return Object.assign(base, { status: 'FAIL', manual: false,
      found: `${crit} text / logo item${crit > 1 ? 's' : ''} outside the ${zone}${gfx ? ` · ${gfx} graphic${gfx > 1 ? 's' : ''} to check` : ''}`,
      detail: `Content outside the safe area can be cut off, folded into a hem or punched by a grommet. Measured on ${onWhat} (${scope}).${nearTxt}`,
      action: `Move the marked text / logos ${moveTo}, or confirm with the customer that they may be cut.`,
      safeZone: r });
  },

  _key(report) {
    const a = report && report.analysis;
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector : null;
    return [(a && a.previewDataUrl || '').length, report && report.dimensions && report.dimensions.widthIn, report && report.dimensions && report.dimensions.heightIn,
      ci ? ci.currentRotation : 0, ci ? !!ci.previewOrderTurned : false, ci && ci.productTemplate ? ci.productTemplate.id : ''].join('|');
  },

  /** Recompute for the current report (text reading finished, artwork turned, pixels loaded) */
  refresh() {
    if (typeof appState === 'undefined' || !appState.report || !Array.isArray(appState.report.checks)) return;
    const report = appState.report;
    const i = report.checks.findIndex(c => c.id === 'safeArea');
    if (i < 0) return;
    const keep = report.checks[i];
    report.checks[i] = Object.assign(this.check(report), keep.isOverridden ? { isOverridden: true, overrideReason: keep.overrideReason } : {});
    if (typeof refreshPrecheckView === 'function') refreshPrecheckView(report);
    else if (typeof PrecheckEngine !== 'undefined' && PrecheckEngine.tally) PrecheckEngine.tally(report);
    this.afterUpdate();
  },

  /** Marks on the canvas and the pop-up alert follow the latest result */
  afterUpdate() {
    this.placeOverlay();
    this._renderAlert();
  },

  // ── canvas marks ───────────────────────────────────────────────────────
  placeOverlay() {
    const canvas = document.getElementById('artwork-canvas');
    let ov = document.getElementById('safe-zone-overlay');
    const r = this._last;
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector : null;
    const art = ci ? ci.artRect : null;
    const report = (typeof appState !== 'undefined') ? appState.report : null;
    const card = report && report.checks ? report.checks.find(c => c.id === 'safeArea') : null;
    const show = canvas && r && r.state === 'done' && r.items.length && art && !(card && card.isOverridden) && (!ci.inspectorMode || ci.inspectorMode === 'artwork');
    if (!show) { if (ov) ov.style.display = 'none'; return; }
    if (!ov || ov.parentElement !== canvas.parentElement) {
      if (ov) ov.remove();
      ov = document.createElement('div');
      ov.id = 'safe-zone-overlay';
      ov.className = 'safe-zone-overlay';
      canvas.parentElement.appendChild(ov);
      if (window.ResizeObserver) { this._ro && this._ro.disconnect(); this._ro = new ResizeObserver(() => this.placeOverlay()); this._ro.observe(canvas); }
    }
    const sx = canvas.width ? canvas.offsetWidth / canvas.width : 1, sy = canvas.height ? canvas.offsetHeight / canvas.height : 1;
    Object.assign(ov.style, { display: 'block', left: (canvas.offsetLeft + art.x * sx) + 'px', top: (canvas.offsetTop + art.y * sy) + 'px',
      width: (art.w * sx) + 'px', height: (art.h * sy) + 'px' });
    const pct = v => (v * 100).toFixed(2) + '%';
    const tag = { text: 'TEXT OUTSIDE SAFE ZONE', lettering: 'TEXT / LOGO OUTSIDE SAFE ZONE', object: 'GRAPHIC IN THE MARGIN — CHECK' };
    const rot = (ci && ci.artRot) || 0;               // artwork turned on the canvas: the marks turn with it
    ov.innerHTML = r.items.map((it, i) => {
      const b = this._rotBox(it.box, rot);
      return `
      <div class="sz-mark${it.kind === 'object' ? ' sz-obj' : ''}" id="sz-mark-${i}" style="left:${pct(b.x)}; top:${pct(b.y)}; width:${pct(b.w)}; height:${pct(b.h)};">
        <span class="sz-tag">${tag[it.kind] || tag.object}</span></div>`;
    }).join('');
  },

  /** Scroll to the canvas and flash one mark */
  show(i) {
    const m = document.getElementById('sz-mark-' + i);
    const canvas = document.getElementById('artwork-canvas');
    const wrap = document.querySelector('.canvas-viewport-wrap') || canvas;
    if (wrap && typeof rHighlight === 'function') rHighlight(wrap);
    else (canvas || m || document.body).scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (m) { m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); }
  },

  // ── pop-up alert ───────────────────────────────────────────────────────
  _renderAlert() {
    const r = this._last;
    let box = document.getElementById('safe-zone-alert');
    const report = (typeof appState !== 'undefined') ? appState.report : null;
    const card = report && report.checks ? report.checks.find(c => c.id === 'safeArea') : null;
    const open = r && r.state === 'done' && r.items.length && !(card && card.isOverridden);
    if (!open || this._alertClosedKey === r.key) { if (box) box.remove(); return; }
    if (!box) {
      if (typeof AgenticAiInspector === 'undefined' || !AgenticAiInspector._alertStack) return;
      box = document.createElement('div');
      box.id = 'safe-zone-alert';
      box.className = 'spell-alert safe-zone-alert';
      box.setAttribute('role', 'alert');
      AgenticAiInspector._alertStack().appendChild(box);
    }
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const c = r.counts || { text: 0, lettering: 0, object: r.items.length };
    const crit = c.text + c.lettering, gfx = c.object;
    box.classList.toggle('is-warn', !crit);
    const zone = this._zone(r.g);
    const kindLabel = { text: 'Text', lettering: 'Lettering', object: 'Graphic' };
    const dist = it => r.g.qnap ? this.where(it, r.g)
      : it.dist <= 0.005 ? (it.kind === 'object' ? 'runs off the ' : 'touches the ') + it.side + ' edge' : this._len(it.dist) + ' from the ' + it.side + ' edge';
    box.innerHTML = `
      <div class="spell-alert-head">⚠️ <span>${crit ? `${crit} text / logo item${crit > 1 ? 's' : ''} outside the ${zone}${gfx ? ` · ${gfx} graphic${gfx > 1 ? 's' : ''}` : ''}`
        : `${gfx} graphic${gfx > 1 ? 's' : ''} outside the ${zone} — check by eye`}</span>
        <button class="spell-alert-close" title="Close" onclick="SafeZoneCheck.closeAlert()">×</button></div>
      <div class="spell-alert-note">${r.g.qnap
        ? `Measured on the ${this._tplName(r.g, esc)}: important text and logos must stay inside its safe area (green dashed line) — outside it they can be cut off, hemmed, folded under or hidden by the hardware.`
        : `Important text and logos must stay ${this._len(r.g.safeIn)} inside the trim — closer to the edge they can be cut off, hemmed or grommeted.`}${r.textRead ? ''
        : ' <strong>The text reader did not run on this file</strong> — lettering was measured from its shapes; check the text by eye.'}</div>
      ${r.items.slice(0, 6).map((it, i) => `
        <div class="spell-alert-row">
          <div class="spell-alert-words"><span class="spell-alert-kind">${kindLabel[it.kind] || 'Graphic'}</span>
            ${it.kind === 'text' ? `<span class="spell-alert-wrong" style="text-decoration:none;">${esc(it.text.length > 32 ? it.text.slice(0, 30) + '…' : it.text)}</span>` : ''}
            <span class="sz-dist">${dist(it)}</span></div>
          <button class="spell-alert-show" onclick="SafeZoneCheck.show(${i})">Show</button>
        </div>`).join('')}${r.items.length + (r.more || 0) > 6 ? `<div class="spell-alert-note">+ ${r.items.length + (r.more || 0) - 6} more marked on the canvas</div>` : ''}`;
    if (AgenticAiInspector._compact) AgenticAiInspector._compact(box);    // opens short, "Review more" for the rest
  },

  closeAlert() {
    if (this._last) this._alertClosedKey = this._last.key;
    const box = document.getElementById('safe-zone-alert');
    if (box && typeof rDismiss === 'function') rDismiss(box); else if (box) box.remove();   // slides out
  }
};

if (typeof window !== 'undefined') window.SafeZoneCheck = SafeZoneCheck;
if (typeof module !== 'undefined' && module.exports) module.exports = SafeZoneCheck;
