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
    return { dist: Math.max(0, d[side]), side, sides: Object.keys(d).filter(s => d[s] < g.safeIn) };
  },

  /**
   * QNAP template: sample a box (fractions of the upright artwork) on the template's area mask. Any point outside
   * the safe area flags it; points in the bleed mean it will be cut off. side = where the outside part lies.
   */
  _measureQnap(b, g, place) {
    const r = this._rotBox(b, g.rot);
    const t = g.qnap.t, c = g.qnap.c, FW = t.fullIn[0], FH = t.fullIn[1];
    const x0 = place.x + r.x * place.w, y0 = place.y + r.y * place.h, bw = r.w * place.w, bh = r.h * place.h;
    let out = 0, bleed = 0, n = 0, sx = 0, sy = 0;
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        const fx = (x0 + bw * (0.04 + 0.92 * i / 8)) / FW, fy = (y0 + bh * (0.04 + 0.92 * j / 8)) / FH;
        const v = ProductTemplates.maskAt(c, fx, fy);
        n++;
        if (v < 255) { out++; sx += fx; sy += fy; if (v < 128) bleed++; }   // 64 = bleed bars, 0 = outside / bleed
      }
    }
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
    return g && g.qnap ? 'template safe area' : g && g.safeIn ? `${this._fmt(g.safeIn)} safe zone` : 'safe zone';
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
   */
  _textLines(words, size) {
    const aw = (size && size.w) || 1, ah = (size && size.h) || 1;
    const good = (words || []).map(w => w && Object.assign({}, w, { text: String(w.text || '').replace(/[|¦]+/g, '').trim() }))
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
      if (ln) { ln.words.push(w.text); ln.x1 = Math.max(ln.x1, w.x1); ln.y0 = Math.min(ln.y0, w.y0); ln.y1 = Math.max(ln.y1, w.y1); }
      else lines.push({ words: [w.text], x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, h0: h });
    });
    return lines.map(l => ({ text: l.words.join(' '), box: { x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 } }));
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

    // Connected shapes, then nearby shapes joined (letters into words, parts of a logo)
    const lab = new Int32Array(n);
    const comps = [];
    const stack = [];
    const edgeTol = Math.max(1, Math.round(Math.min(w, h) * 0.004));
    for (let i = 0; i < n; i++) {
      if (!fg[i] || lab[i]) continue;
      const id = comps.length + 1;
      let x0 = w, y0 = h, x1 = 0, y1 = 0, cnt = 0;
      lab[i] = id; stack.push(i);
      while (stack.length) {
        const q = stack.pop(), x = q % w, y = (q / w) | 0;
        cnt++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && fg[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack.push(q - 1); }
        if (x < w - 1 && fg[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack.push(q + 1); }
        if (y > 0 && fg[q - w] && !lab[q - w]) { lab[q - w] = id; stack.push(q - w); }
        if (y < h - 1 && fg[q + w] && !lab[q + w]) { lab[q + w] = id; stack.push(q + w); }
      }
      comps.push({ x0, y0, x1, y1, n: cnt });
    }
    const minN = Math.max(10, n * 0.00015);
    // share of plain background around a shape: a logo stands on the background, a piece of a photo does not
    const bgAround = c => {
      const m = Math.max(4, Math.round(0.4 * Math.max(c.x1 - c.x0, c.y1 - c.y0)));
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
    const keep = comps.filter(c => {
      if (c.n < minN) return false;                                       // specks: the Lines & Dots check
      const cw = c.x1 - c.x0 + 1, chh = c.y1 - c.y0 + 1;
      if (c.n > n * 0.12 || cw > w * 0.6 || chh > h * 0.6) return false;    // big shapes / frames / panels
      // touching the artwork edge: a bleed shape or part of a full-bleed picture (text there is caught by the reader)
      if (c.x0 <= edgeTol || c.y0 <= edgeTol || c.x1 >= w - 1 - edgeTol || c.y1 >= h - 1 - edgeTol) return false;
      // thin lines (frame / border rules) are decoration
      if (Math.max(cw, chh) >= 8 * Math.min(cw, chh) && Math.min(cw, chh) <= Math.max(3, Math.max(w, h) * 0.012)) return false;
      return true;
    }).filter(c => bgAround(c) >= 0.6);
    // join shapes that sit close together (letters of a word, parts of a logo)
    const items = [];
    keep.sort((a, b) => a.x0 - b.x0).forEach(c => {
      const ch = c.y1 - c.y0 + 1;
      const it = items.find(t => {
        const gap = Math.max(c.x0 - t.x1, t.x0 - c.x1, c.y0 - t.y1, t.y0 - c.y1);
        return gap <= Math.max(3, 0.6 * Math.min(ch, t.y1 - t.y0 + 1));
      });
      if (it) { it.x0 = Math.min(it.x0, c.x0); it.y0 = Math.min(it.y0, c.y0); it.x1 = Math.max(it.x1, c.x1); it.y1 = Math.max(it.y1, c.y1); it.n += c.n; it.parts++; }
      else items.push(Object.assign({ parts: 1 }, c));
    });
    return {
      ok: true, plain: true, size: { w: W0, h: H0 },
      items: items.filter(t => (t.x1 - t.x0 + 1) <= w * 0.6 && (t.y1 - t.y0 + 1) <= h * 0.6)
        .map(t => ({ box: { x: t.x0 / w, y: t.y0 / h, w: (t.x1 - t.x0 + 1) / w, h: (t.y1 - t.y0 + 1) / h }, parts: t.parts }))
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
    const measure = b => g.qnap ? this._measureQnap(b, g, place) : this._measure(b, g, place);
    const outside = m => g.qnap ? m.out > 0 : m.dist < g.safeIn - tol;
    const items = [];
    const lines = textWords ? this._textLines(textWords, size) : [];
    lines.forEach(l => {
      const m = measure(l.box);
      if (outside(m)) items.push(Object.assign({ kind: 'text', text: l.text, box: l.box }, m));
    });
    const overlapsText = b => lines.some(l => {
      const ix = Math.min(b.x + b.w, l.box.x + l.box.w) - Math.max(b.x, l.box.x);
      const iy = Math.min(b.y + b.h, l.box.y + l.box.h) - Math.max(b.y, l.box.y);
      return ix > 0 && iy > 0 && ix * iy >= 0.3 * Math.min(b.w * b.h, l.box.w * l.box.h);
    });
    if (obj.ok && obj.items) {
      obj.items.forEach(o => {
        if (overlapsText(o.box)) return;
        const m = measure(o.box);
        if (outside(m)) items.push(Object.assign({ kind: 'object', text: '', box: o.box }, m));
      });
    }
    items.sort((a, b) => a.dist - b.dist);
    return { state: 'done', items: items.slice(0, 8), more: Math.max(0, items.length - 8), g, place,
      textRead: !!textWords, textLines: lines.length, objectsChecked: !!(obj.ok && obj.plain), objReason: obj.ok ? '' : obj.reason };
  },

  _fmt(v) { return (+v).toFixed(v < 1 ? 3 : 2).replace(/\.?0+$/, '') + '"'; },

  /** One line per item, for the card and the alert */
  describe(it, g) {
    const what = it.kind === 'text' ? `Text “${it.text.length > 40 ? it.text.slice(0, 38) + '…' : it.text}”` : 'Design element (logo / graphic)';
    return `${what} ${this.where(it, g)}`;
  },

  /** Where an item lies, in words */
  where(it, g) {
    if (g && g.qnap) return it.intoBleed ? `runs into the bleed on the ${it.side} (it will be cut off)` : `crosses the template safe area on the ${it.side}`;
    return it.dist <= 0.005 ? `touches the ${it.side} edge (it will be cut)` : `is ${this._fmt(it.dist)} from the ${it.side} edge`;
  },

  /** The pre-check card */
  check(report) {
    const base = { id: 'safeArea', name: 'Safe Area Margins', icon: '🛡️' };
    const r = this.evaluate(report || {});
    this._last = Object.assign({ key: this._key(report) }, r);
    const spec = (report && report.spec) || {};
    const safeTxt = r.g && r.g.safeIn ? this._fmt(r.g.safeIn) : (spec.safeArea || '');
    const zone = r.g ? this._zone(r.g) : `${safeTxt} safe zone`;
    const onWhat = r.g && r.g.qnap ? `the ${this._tplName(r.g)}` : r.g ? `the ordered size ${this._fmt(r.g.W)} × ${this._fmt(r.g.H)}` : '';
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
    const scope = [r.textRead ? `${r.textLines} text line${r.textLines === 1 ? '' : 's'}` : 'text not readable automatically',
      r.objectsChecked ? 'logos & graphics on the plain background' : 'graphics on a busy / photo background not measured'].join(' · ');
    if (!r.items.length) {
      if (!r.textRead && !r.objectsChecked) {
        return Object.assign(base, { status: 'WARNING', manual: true, found: 'Not measured automatically',
          detail: `The text could not be read and the background is too busy to find logos. Check that everything important is ${safeTxt} inside the trim.`,
          action: `Use the canvas guides (${safeTxt} safe zone).` });
      }
      return Object.assign(base, { status: 'PASS', manual: false,
        found: `Text and graphics are inside the ${zone}`,
        detail: `Measured on ${onWhat} (${scope}).${r.textRead ? '' : ' The text could not be read automatically — confirm it by eye.'}`,
        action: '', safeZone: r });
    }
    const n = r.items.length + (r.more || 0);
    const list = r.items.map(it => this.describe(it, g)).join(' · ') + (r.more ? ` · and ${r.more} more` : '');
    const moveTo = g.qnap ? 'inside the safe area of the template (green dashed line)' : `at least ${safeTxt} inside the trim`;
    // Text read on the artwork is certain → Critical. Graphics alone may be decoration (frames, ornaments) → marked,
    // and confirmed by eye
    if (!r.items.some(it => it.kind === 'text')) {
      return Object.assign(base, { status: 'WARNING', manual: true,
        found: `${n} graphic${n > 1 ? 's' : ''} outside the ${zone} — check by eye`,
        detail: `${list}. Decoration (frames, ornaments, patterns) may sit there; logos and important graphics must not — they can be cut off, hemmed or grommeted (measured on ${onWhat}; ${scope}).`,
        action: `Look at the marked graphics: move logos / important graphics ${moveTo}.`, safeZone: r });
    }
    return Object.assign(base, { status: 'FAIL', manual: false,
      found: `${n} item${n > 1 ? 's' : ''} outside the ${zone}`,
      detail: list + `. Content outside the safe area can be cut off, folded into a hem or punched by a grommet (measured on ${onWhat}; ${scope}).`,
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
    ov.innerHTML = r.items.map((it, i) => `
      <div class="sz-mark${it.kind === 'text' ? '' : ' sz-obj'}" id="sz-mark-${i}" style="left:${pct(it.box.x)}; top:${pct(it.box.y)}; width:${pct(it.box.w)}; height:${pct(it.box.h)};">
        <span class="sz-tag">${it.kind === 'text' ? 'TEXT OUTSIDE SAFE ZONE' : 'GRAPHIC IN THE MARGIN — CHECK'}</span></div>`).join('');
  },

  /** Scroll to the canvas and flash one mark */
  show(i) {
    const m = document.getElementById('sz-mark-' + i);
    const canvas = document.getElementById('artwork-canvas');
    (canvas || m || document.body).scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    const n = r.items.length + (r.more || 0);
    const textN = r.items.filter(it => it.kind === 'text').length;
    box.classList.toggle('is-warn', !textN);
    const zone = this._zone(r.g);
    box.innerHTML = `
      <div class="spell-alert-head">⚠️ <span>${textN ? `${n} item${n > 1 ? 's' : ''} outside the ${zone}`
        : `${n} graphic${n > 1 ? 's' : ''} outside the ${zone} — check by eye`}</span>
        <button class="spell-alert-close" title="Close" onclick="SafeZoneCheck.closeAlert()">×</button></div>
      <div class="spell-alert-note">${r.g.qnap
        ? `Measured on the ${this._tplName(r.g, esc)}: important text and logos must stay inside its safe area (green dashed line) — outside it they can be cut off, hemmed, folded under or hidden by the hardware.`
        : `Important text and logos must stay ${this._fmt(r.g.safeIn)} inside the trim — closer to the edge they can be cut off, hemmed or grommeted.`}</div>
      ${r.items.slice(0, 5).map((it, i) => `
        <div class="spell-alert-row">
          <div class="spell-alert-words"><span class="spell-alert-kind">${it.kind === 'text' ? 'Text' : 'Logo / graphic'}</span>
            ${it.kind === 'text' ? `<span class="spell-alert-wrong" style="text-decoration:none;">${esc(it.text.length > 32 ? it.text.slice(0, 30) + '…' : it.text)}</span>` : ''}
            <span class="sz-dist">${r.g.qnap ? this.where(it, r.g) : it.dist <= 0.005 ? 'touches the ' + it.side + ' edge' : this._fmt(it.dist) + ' from the ' + it.side + ' edge'}</span></div>
          <button class="spell-alert-show" onclick="SafeZoneCheck.show(${i})">Show</button>
        </div>`).join('')}`;
  },

  closeAlert() {
    if (this._last) this._alertClosedKey = this._last.key;
    const box = document.getElementById('safe-zone-alert');
    if (box) box.remove();
  }
};

if (typeof window !== 'undefined') window.SafeZoneCheck = SafeZoneCheck;
if (typeof module !== 'undefined' && module.exports) module.exports = SafeZoneCheck;
