/**
 * Design Intelligence Hub - Product Templates from the QNAP share
 *
 * The official BannerBuzz product templates of \\192.168.0.250\qnap\Template_Mockups (Table Covers & Displays,
 * Stands & Displays, Banners): red = bleed (cut off), white = visible area, lavender = safe area. Built by
 * tools/build_qnap_templates.py into js/qnap_templates.js (QNAP_TEMPLATES) + assets/qnap/ (preview + area mask).
 *
 * The order is matched to its template by product name, size (also sizes in the folder names, e.g. "Canopy_10 Ft")
 * and panel words (full / half, front / back / side, inside / outside, single / double sided). The designer can pick
 * another template on the canvas. The customer's artwork is placed on the template; the Safe Area check measures text
 * and logos against the template's own safe area (any shape — rounded canopy walls, table cover panels…).
 */
const ProductTemplates = {
  STOP: new Set(['custom', 'the', 'and', 'with', 'for', 'of', 'a', 'an', 'ft', 'feet', 'foot', 'inch', 'inches', 'in', 'mm', 'cm',
    'x', 'size', 'template', 'templates', 'psdt', 'psd', 'pdf', 'new', 'final', 'file', 'qty', 'overall', 'script', 'print',
    'bann', 'atla', 'us', 'uk', 'ca', 'au', 'bs', 'inhouse', 'only', 'pex', 'use', 'w', 'h', 'e', 'p', 'pc', 'ss', 'po', 'graphic', 'graphics']),
  PANEL: new Set(['full', 'half', 'front', 'back', 'side', 'left', 'right', 'wall', 'walls', 'topper', 'top', 'bottom', 'inside', 'outside',
    'single', 'double', 'sided', 'open', 'closed', 'zipper', 'sewn', 'hot', 'knife', 'header', 'panel', 'base', 'part']),

  list() { return (typeof QNAP_TEMPLATES !== 'undefined' && Array.isArray(QNAP_TEMPLATES)) ? QNAP_TEMPLATES : []; },
  get(id) { return this.list().find(t => t.id === id) || null; },

  /** Words of a text: lower case, singular, without filler words and plain numbers */
  words(s) {
    return String(s || '').toLowerCase().replace(/[_\-–›/\\.,()']+/g, ' ').split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .map(w => (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) ? w.slice(0, -1) : w)
      .filter(w => w && !this.STOP.has(w) && !/^\d+$/.test(w));
  },

  /** Every size a text mentions, in inches: [[w, h]] pairs and single lengths ("10 Ft") */
  sizes(s) {
    const t = String(s || '').replace(/_/g, ' ');
    const unit = u => /^(ft|feet|foot|')$/i.test(u || '') ? 12 : /^cm$/i.test(u || '') ? 1 / 2.54 : /^mm$/i.test(u || '') ? 1 / 25.4 : 1;
    const pairs = [], singles = [];
    const re2 = /(\d+(?:\.\d+)?)\s*(?:\(w\))?\s*(ft|feet|in|inch|inches|cm|mm|"|')?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:\(h\))?\s*(ft|feet|foot|in|inch|inches|cm|mm|"|')?/gi;
    let m;
    while ((m = re2.exec(t))) {
      const k = unit(m[4] || m[2]);
      pairs.push([+m[1] * k, +m[3] * k]);
    }
    const re1 = /(\d+(?:\.\d+)?)\s*(ft|feet|foot)\b/gi;
    while ((m = re1.exec(t))) singles.push(+m[1] * 12);
    return { pairs, singles };
  },

  /** How close two sizes are (either way round): 0 = the same */
  _sizeErr(a, b) {
    const e = (p, q) => Math.max(Math.abs(p[0] - q[0]) / Math.max(q[0], 1), Math.abs(p[1] - q[1]) / Math.max(q[1], 1));
    return Math.min(e(a, b), e(a, [b[1], b[0]]));
  },

  /**
   * Templates ranked for this order. Returns [{ t, score, product, size, panel }] best first (product match only).
   */
  rank(spec, dims, parsed, fileName) {
    const order = [spec && spec.name, parsed && (parsed.productName || parsed.rawProdName), fileName].filter(Boolean).join(' ');
    const O = new Set(this.words(order));
    const W = parseFloat(dims && dims.widthIn), H = parseFloat(dims && dims.heightIn);
    const out = [];
    this.list().forEach(t => {
      const prodW = [...new Set(this.words(t.product))];
      if (!prodW.length) return;
      // every word of the product folder ("Banner Stands" needs banner AND stand — a vinyl banner is not a stand);
      // long names may miss one ("Sky Tube Hanging Banners")
      const product = prodW.filter(w => O.has(w)).length / prodW.length;
      if (product < (prodW.length >= 4 ? 0.74 : 0.99)) return;
      const pathW = [...new Set(this.words(t.path))].filter(w => !prodW.includes(w) && !this.PANEL.has(w));
      const bonus = Math.min(1, pathW.filter(w => O.has(w)).length * 0.25);
      const nameAll = [...new Set(this.words(t.name))];
      const nameW = nameAll.filter(w => this.PANEL.has(w));
      const panel = nameW.length ? nameW.filter(w => O.has(w)).length / nameW.length : 0;
      // distinctive words of the template name ("Roll Up", "LT", "Silverstep"): which stand / display it is
      const distinct = nameAll.filter(w => !this.PANEL.has(w) && !prodW.includes(w) && !/\d/.test(w));
      const named = distinct.length ? distinct.filter(w => O.has(w)).length / distinct.length : 0;
      let size = 0;
      if (W > 0 && H > 0) {
        const z = this.sizes(t.path + ' ' + t.name);
        const pairs = z.pairs.slice();
        if (t.stated && t.stated[0] && t.stated[1]) pairs.push([t.stated[0], t.stated[1]]);
        if (t.visIn) pairs.push([t.visIn[2] - t.visIn[0], t.visIn[3] - t.visIn[1]]);
        if (t.fullIn) pairs.push(t.fullIn);
        const best = Math.min(...pairs.map(p => this._sizeErr([W, H], p)), 9);
        size = best <= 0.03 ? 1 : best <= 0.08 ? 0.75 : 0;
        if (!size && z.singles.some(L => [W, H, Math.max(W, H)].some(v => Math.abs(v - L) / L <= 0.03))) size = 0.7;
      }
      out.push({ t, product, size, panel, named, distinct: distinct.length, score: product * 3 + size * 2 + panel + bonus + named * 1.5 });
    });
    return out.sort((a, b) => b.score - a.score);
  },

  /**
   * The template for this order when the match is clear: the product, and its W × H size — or a single length
   * ("Canopy_10 Ft") together with the panel / name words ("Half Front Wall"). Otherwise null; the designer can
   * still pick one of the ranked templates on the canvas.
   */
  best(spec, dims, parsed, fileName) {
    const r = this.rank(spec, dims, parsed, fileName)[0];
    if (!r) return null;
    // a template named for a particular stand / display ("Economy EZ Extend…") needs those words in the order too
    if (r.distinct && r.named < 0.5) return null;
    return r.size >= 0.75 || (r.size >= 0.7 && (r.panel >= 0.5 || r.named >= 0.6)) ? r.t : null;
  },

  /**
   * The print panel to measure size, resolution and orientation on, when the matched template is not the ordered
   * product size (a canopy wall 117" × 42" on a 10 × 10 ft tent): { w, h, t, on } in inches, else null.
   * The panel is the template box the artwork is made for (full size with bleed, visible area or safe area).
   */
  panelFor(spec, dims, parsed, fileName, artW, artH) {
    const t = this.best(spec, dims, parsed, fileName);
    const W = parseFloat(dims && dims.widthIn), H = parseFloat(dims && dims.heightIn);
    if (!t || !(W > 0 && H > 0) || !(artW > 0 && artH > 0)) return null;
    const box = b => b ? [b[2] - b[0], b[3] - b[1]] : null;
    const A = artW / artH, orderErr = Math.min(Math.abs(A / (W / H) - 1), Math.abs(A / (H / W) - 1));
    if (orderErr <= 0.04) return null;                                       // made for the ordered size: measured on it
    const p = this.placement(t, artW, artH);
    const pairs = [t.fullIn, box(t.visIn), t.stated && t.stated[0] ? [t.stated[0], t.stated[1]] : null]
      .concat(this.sizes(t.path + ' ' + t.name).pairs).filter(Boolean);
    const orderIsPanel = pairs.some(q => this._sizeErr([W, H], q) <= 0.08);
    // made for the template (fitted table cover layout) — or the order is the product, not the panel (canopy wall)
    if (p.on === 'fit' && orderIsPanel) return null;
    const b = p.on === 'visible' ? box(t.visIn) : p.on === 'safe' ? box(t.safeIn) : t.fullIn;
    return { w: +b[0].toFixed(2), h: +b[1].toFixed(2), t, on: p.on };
  },

  // ── pictures ──────────────────────────────────────────────────────────
  _cache: new Map(),

  /** Preview + area mask of a template; null while loading (onReady is called when ready) */
  load(t, onReady) {
    if (!t) return null;
    let c = this._cache.get(t.id);
    if (c) {
      if (c.ready) return c;
      if (onReady) c.waiting.push(onReady);
      return null;
    }
    c = { ready: false, waiting: onReady ? [onReady] : [] };
    this._cache.set(t.id, c);
    let n = 2;
    const done = () => {
      if (--n) return;
      try { this._prepare(c); } catch (e) { c.failed = true; }
      c.ready = !c.failed;
      c.waiting.splice(0).forEach(f => f());
    };
    c.img = new Image(); c.img.onload = done; c.img.onerror = () => { c.failed = true; done(); }; c.img.src = t.img;
    c.maskImg = new Image(); c.maskImg.onload = done; c.maskImg.onerror = () => { c.failed = true; done(); }; c.maskImg.src = t.mask;
    return null;
  },

  /** Mask values (0 bleed / 128 visible / 255 safe) and a picture of the area outlines */
  _prepare(c) {
    if (c.failed) return;
    const w = c.maskImg.naturalWidth, h = c.maskImg.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(c.maskImg, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) { const v = d[i * 4]; m[i] = v > 190 ? 255 : v > 64 ? 128 : 0; }
    c.mask = { w, h, data: m };
    // outlines: safe area (green) and visible area (blue), 1 mask pixel wide
    const e = ctx.createImageData(w, h), ed = e.data;
    const paint = (i, r, g, b) => { ed[i * 4] = r; ed[i * 4 + 1] = g; ed[i * 4 + 2] = b; ed[i * 4 + 3] = 255; };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, v = m[i];
        const nb = [x > 0 ? m[i - 1] : 0, x < w - 1 ? m[i + 1] : 0, y > 0 ? m[i - w] : 0, y < h - 1 ? m[i + w] : 0];
        if (v === 255 && nb.some(n => n < 255)) paint(i, 22, 163, 74);
        else if (v >= 128 && nb.some(n => n === 0)) paint(i, 29, 78, 216);
      }
    }
    const ec = document.createElement('canvas'); ec.width = w; ec.height = h;
    ec.getContext('2d').putImageData(e, 0, 0);
    c.edges = ec;
  },

  /** Mask value at a point given as fractions of the full template (0 outside) */
  maskAt(c, fx, fy) {
    if (!c || !c.mask || fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return 0;
    const { w, h, data } = c.mask;
    return data[Math.min(h - 1, Math.floor(fy * h)) * w + Math.min(w - 1, Math.floor(fx * w))];
  },

  /**
   * Where the artwork goes on the template (inches on the full template): the box its proportions match — the full
   * size with bleed, the visible area or the safe area (within 4%) — else fitted into the visible area, centred.
   */
  placement(t, artW, artH) {
    const A = artW / artH;
    const F = [0, 0, t.fullIn[0], t.fullIn[1]];
    const boxes = [['full', F], ['visible', t.visIn || F], ['safe', t.safeIn || F]];
    let best = null;
    boxes.forEach(([on, b]) => {
      const a = (b[2] - b[0]) / (b[3] - b[1]);
      const err = Math.abs(A / a - 1);
      if (!best || err < best.err) best = { on, b, err };
    });
    const b = best.err <= 0.04 ? best.b : (t.visIn || F);
    const bw = b[2] - b[0], bh = b[3] - b[1];
    const w = Math.min(bw, bh * A), h = w / A;
    return { x: b[0] + (bw - w) / 2, y: b[1] + (bh - h) / 2, w, h, on: best.err <= 0.04 ? best.on : 'fit' };
  },

  /** Short label for a template in lists */
  label(t) {
    const s = t.stated && t.stated[0] ? ` · ${+t.stated[0].toFixed(2)}" × ${+t.stated[1].toFixed(2)}"` : '';
    return `${t.product} › ${t.name}${s}`;
  }
};

if (typeof window !== 'undefined') window.ProductTemplates = ProductTemplates;
if (typeof module !== 'undefined' && module.exports) module.exports = ProductTemplates;
