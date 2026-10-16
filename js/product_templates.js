/**
 * Design Intelligence Hub - Product Templates (website design templates + QNAP production templates)
 *
 * Website templates (assets/templates/real) are the layouts customers design on: stretch / fitted table covers
 * (3 sided open back · 4 sided · zipper) and backpack flags. QNAP templates are the official production templates of
 * \\192.168.0.250\qnap\Template_Mockups (Table Covers & Displays, Stands & Displays, Banners). Both are built by
 * tools/build_qnap_templates.py into js/qnap_templates.js (QNAP_TEMPLATES) + assets/qnap/ (preview + area mask:
 * 0 outside · 64 bleed bars · 128 visible area · 255 safe area).
 *
 * Matching: the order's product, size and panel words pick the candidates; a shaped artwork (a table cover cross,
 * a flag outline…) is then matched by its OUTLINE — its silhouette is registered on each candidate's product /
 * visible area and the best overlap wins (open back vs closed back, 6 ft vs 8 ft). The artwork is placed exactly where
 * its outline lies on that template; rectangles are placed by proportions (full size / visible / safe area). On a table
 * cover layout, an artwork that is not laid out on it (most orders: a logo or a front design) is centred on the Front
 * panel inside its safe area, and its own background colour (else white) fills the whole cover and bleed.
 */
const ProductTemplates = {
  STOP: new Set(['custom', 'the', 'and', 'with', 'for', 'of', 'a', 'an', 'ft', 'feet', 'foot', 'inch', 'inches', 'in', 'mm', 'cm',
    'x', 'size', 'template', 'templates', 'psdt', 'psd', 'pdf', 'new', 'final', 'file', 'qty', 'overall', 'script', 'print',
    'bann', 'atla', 'us', 'uk', 'ca', 'au', 'bs', 'inhouse', 'only', 'pex', 'use', 'w', 'h', 'e', 'p', 'pc', 'ss', 'po', 'graphic', 'graphics',
    'website', 'customer']),
  PANEL: new Set(['full', 'half', 'front', 'back', 'side', 'left', 'right', 'wall', 'walls', 'topper', 'top', 'bottom', 'inside', 'outside',
    'single', 'double', 'sided', 'open', 'closed', 'zipper', 'sewn', 'hot', 'knife', 'header', 'panel', 'base', 'part']),
  SHAPES: new Set(['round', 'circle', 'circular', 'oval', 'square', 'kite', 'moon', 'teardrop', 'feather', 'blade', 'arch', 'curved',
    'wave', 'triangle', 'triangular', 'hexagon', 'octagon', 'pillow', 'cube', 'cylinder', 'tower', 'tree', 'serpentine']),

  list() { return (typeof QNAP_TEMPLATES !== 'undefined' && Array.isArray(QNAP_TEMPLATES)) ? QNAP_TEMPLATES : []; },
  get(id) { return this.list().find(t => t.id === id) || null; },
  isWebsite(t) { return !!(t && t.source === 'customer'); },
  isProduction(t) { return !!(t && t.source === 'production'); },
  /** A product layout on a white page (production standard or website template): the product shape is the cut line */
  isLayout(t) { return this.isWebsite(t) || this.isProduction(t) || !!(t && t.layout); },
  /** Where a logo-only artwork goes: 'Front panel' (table covers) or 'safe area' (flags) */
  logoArea(t) { return (t && t.logoArea) || 'Front panel'; },
  /** 'Production standard template' · 'Website design template' · 'QNAP production template' */
  kindName(t) { return this.isProduction(t) ? 'Production standard template' : this.isWebsite(t) ? 'Website design template' : 'QNAP production template'; },

  /** Spellings that mean the same in order names and template files */
  // ("SF" / "DF" = single / double face in template names; "(SS)" in order names is a team code, not a side)
  ALIAS: { pinpoint: 'pin point', sharkfin: 'shark fin', desktop: 'desk', sf: 'single', df: 'double' },

  /** Words of a text: lower case, singular, without filler words and plain numbers */
  words(s) {
    return String(s || '').toLowerCase().replace(/[_\-–›·/\\.,()']+/g, ' ').split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .flatMap(w => (this.ALIAS[w] || w).split(' '))
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
   * Website templates (what customers design on) come before the production layouts of the same product and size.
   */
  rank(spec, dims, parsed, fileName) {
    const order = [spec && spec.name, parsed && (parsed.productName || parsed.rawProdName), fileName].filter(Boolean).join(' ');
    const O = new Set(this.words(order));
    // the product's own name words ("Clip Flags Blade", "Golf Flags Triangle"): a template missing one of them is for
    // another product ("Blade Flags", "Triangle Flag")
    const specW = [...new Set(this.words(spec && spec.name))].filter(w => !this.PANEL.has(w));
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
      const distinct = nameAll.filter(w => !this.PANEL.has(w) && !prodW.includes(w) && !/\d/.test(w)
        && !(this.isLayout(t) && prodW.some(p => p.startsWith(w) || w.startsWith(p))));
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
      // the production standard first, then the website template customers design on, then the QNAP layouts
      const web = this.isProduction(t) ? 0.6 : this.isWebsite(t) ? 0.3 : 0;
      const tw = new Set(this.words(t.product + ' ' + t.path + ' ' + t.name));
      const missing = specW.filter(w => !tw.has(w)).length;
      out.push({ t, product, size, panel, named, distinct: distinct.length, missing,
        score: product * 3 + size * 2 + panel + bonus + named * 1.5 + web - missing });
    });
    return out.sort((a, b) => b.score - a.score);
  },

  /**
   * The template for this order when the words make it clear: the product, and its W × H size — or a single length
   * ("Canopy_10 Ft") together with the panel / name words ("Half Front Wall"). Otherwise null. A shaped artwork is
   * matched by its outline instead (autoMatch).
   */
  best(spec, dims, parsed, fileName) {
    const r = this.rank(spec, dims, parsed, fileName)[0];
    if (!r) return null;
    // a template named for a particular stand / display ("Economy EZ Extend…") needs those words in the order too
    if (r.distinct && r.named < 0.5) return null;
    // a shape the order names must be the template's shape (a round table cover is not the rectangular layout,
    // a moon backdrop not the kite one)
    const order = new Set(this.words([spec && spec.name, parsed && (parsed.productName || parsed.rawProdName), fileName].filter(Boolean).join(' ')));
    const tw = new Set(this.words(r.t.path + ' ' + r.t.name + ' ' + r.t.product));
    if ([...order].some(w => this.SHAPES.has(w) && !tw.has(w))) return null;
    return r.size >= 0.75 || (r.size >= 0.7 && (r.panel >= 0.5 || r.named >= 0.6)) ? r.t : null;
  },

  /**
   * The print panel to measure size, resolution and orientation on, when the matched template is not the ordered
   * product size (a canopy wall 117" × 42" on a 10 × 10 ft tent; a stretch table cover laid out flat): { w, h, t, on }
   * in inches, else null. With an outline match it is the artwork's own size on the template.
   */
  panelFor(spec, dims, parsed, fileName, artW, artH, match) {
    const t = match && match.t !== undefined ? match.t : this.best(spec, dims, parsed, fileName);
    const W = parseFloat(dims && dims.widthIn), H = parseFloat(dims && dims.heightIn);
    if (!t || !(W > 0 && H > 0) || !(artW > 0 && artH > 0)) return null;
    const box = b => b ? [b[2] - b[0], b[3] - b[1]] : null;
    const A = artW / artH, orderErr = Math.min(Math.abs(A / (W / H) - 1), Math.abs(A / (H / W) - 1));
    if (orderErr <= 0.04) return null;                                       // made for the ordered size: measured on it
    const f = match && match.shaped ? this.fitFor(t) : null;
    if (f) return { w: +f.w.toFixed(2), h: +f.h.toFixed(2), t, on: 'shape' };
    const p = this.placement(t, artW, artH);
    if (p.on === 'front') return { w: +p.w.toFixed(2), h: +p.h.toFixed(2), t, on: 'front' };   // the logo's print size on the Front panel
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
  _masks: new Map(),      // id → Promise of { mask } (mask only, for outline matching)
  _maskReady: new Map(),  // id → { mask } once loaded

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
    let n = t.outline ? 3 : 2;
    const done = () => {
      if (--n) return;
      try { this._prepare(c); } catch (e) { c.failed = true; }
      c.ready = !c.failed;
      c.waiting.splice(0).forEach(f => f());
    };
    c.img = new Image(); c.img.onload = done; c.img.onerror = () => { c.failed = true; done(); }; c.img.src = t.img;
    c.maskImg = new Image(); c.maskImg.onload = done; c.maskImg.onerror = () => { c.failed = true; done(); }; c.maskImg.src = t.mask;
    // exact vector outlines of a website template (traced from the full-size layout); without them the outlines
    // are traced from the mask
    if (t.outline) {
      fetch(t.outline).then(r => (r.ok ? r.json() : null)).catch(() => null).then(v => { c.vector = v; done(); });
    }
    return null;
  },

  /** Only the area mask of a template (outline matching of many candidates): Promise of { mask } or null */
  loadMask(t) {
    const c = this._cache.get(t.id);
    if (c && c.ready) return Promise.resolve(c);
    if (this._masks.has(t.id)) return this._masks.get(t.id);
    const p = new Promise(resolve => {
      const m = { maskImg: new Image() };
      m.maskImg.onload = () => {
        try { this._prepare(m); this._maskReady.set(t.id, m); resolve(m); } catch (e) { resolve(null); }
      };
      m.maskImg.onerror = () => resolve(null);
      m.maskImg.src = t.mask;
    });
    this._masks.set(t.id, p);
    return p;
  },

  /** The loaded mask of a template, or null */
  _maskOf(t) {
    const c = t && this._cache.get(t.id);
    if (c && c.ready) return c;
    return (t && this._maskReady.get(t.id)) || null;
  },

  /** Mask values: 0 outside · 64 bleed bars · 128 visible area · 255 safe area */
  _prepare(c) {
    if (c.failed) return;
    const w = c.maskImg.naturalWidth, h = c.maskImg.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(c.maskImg, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) { const v = d[i * 4]; m[i] = v > 190 ? 255 : v > 96 ? 128 : v > 32 ? 64 : 0; }
    c.mask = { w, h, data: m };
  },

  /** Mask value at a point given as fractions of the full template (0 outside) */
  maskAt(c, fx, fy) {
    if (!c || !c.mask || fx < 0 || fy < 0 || fx >= 1 || fy >= 1) return 0;
    const { w, h, data } = c.mask;
    return data[Math.min(h - 1, Math.floor(fy * h)) * w + Math.min(w - 1, Math.floor(fx * w))];
  },

  // ── areas of a template (mask pixels) ─────────────────────────────────

  /** Grow a 0/1 mask by r pixels (square) */
  _grow(src, w, h, r) {
    const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = Math.max(0, x - r), e = Math.min(w - 1, x + r); k <= e && !v; k++) v = src[o + k];
        tmp[o + x] = v;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let v = 0;
        for (let k = Math.max(0, y - r), e = Math.min(h - 1, y + r); k <= e && !v; k++) v = tmp[k * w + x];
        out[y * w + x] = v;
      }
    }
    return out;
  },

  /** Product (with bleed), visible and safe area of a template: { bits, band, box, area } each — cached */
  _regions(c, t) {
    if (c.regions) return c.regions;
    const { w, h, data } = c.mask, N = w * h;
    const make = test => {
      const bits = new Uint8Array(N);
      let area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!test(data[i])) continue;
          bits[i] = 1; area++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      // a band 2 px either side of the outline: matching ignores it (the outline is drawn, measured and scanned
      // a pixel or two differently in every file)
      const band = new Uint8Array(N);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x, v = bits[i];
          const edge = (x < w - 1 && bits[i + 1] !== v) || (y < h - 1 && bits[i + w] !== v)
            || (v && (x === 0 || y === 0 || x === w - 1 || y === h - 1));
          if (!edge) continue;
          for (let yy = Math.max(0, y - 2), ye = Math.min(h - 1, y + 2); yy <= ye; yy++) {
            for (let xx = Math.max(0, x - 2), xe = Math.min(w - 1, x + 2); xx <= xe; xx++) band[yy * w + xx] = 1;
          }
        }
      }
      return { bits, band, area, box: area ? [x0, y0, x1 + 1, y1 + 1] : null };
    };
    c.regions = {
      // website templates: the product shape on a white page; QNAP: the whole picture (red bleed around it)
      full: this.isLayout(t) ? make(v => v > 0) : make(() => true),
      visible: make(v => v >= 128),
      safe: make(v => v === 255)
    };
    return c.regions;
  },

  // ── the artwork's outline ─────────────────────────────────────────────
  SIL_PX: 480,
  PAGE_PX: 1200,

  /**
   * Silhouette of the artwork: everything but the white / transparent page around it. White lines inside the
   * artwork (mortar between bricks, gaps between letters) do not let the page in; a thin frame line round the
   * picture and stray specks are dropped. { w, h, data, box, area, fill, iw, ih } — fill = share of its box.
   */
  silhouette(img) {
    const iw = img && (img.naturalWidth || img.width), ih = img && (img.naturalHeight || img.height);
    if (!(iw > 0 && ih > 0)) return null;
    // the page is found at up to 1200 px (a 1-px grey cut line round a white artwork must not fade into the page),
    // the outline is then reduced to SIL_PX for matching
    const k = Math.min(1, this.PAGE_PX / Math.max(iw, ih));
    const w = Math.max(16, Math.round(iw * k)), h = Math.max(16, Math.round(ih * k)), N = w * h;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    let d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }
    const page = new Uint8Array(N);
    // page = clean white (≥ 246): a faint grey cut line (221–244, round a white teardrop) still bounds the artwork
    for (let i = 0; i < N; i++) {
      const j = i * 4;
      page[i] = d[j + 3] < 24 || (d[j] > 245 && d[j + 1] > 245 && d[j + 2] > 245) ? 1 : 0;
    }
    // a thin frame line drawn round the picture is page wherever the page lies just inside it (also when the artwork
    // runs to the frame elsewhere — a desk flag's white corner beside its curved top)
    const F = 2;
    for (let x = 0; x < w; x++) {
      if (page[(F + 1) * w + x]) for (let y = 0; y <= F; y++) page[y * w + x] = 1;
      if (page[(h - F - 2) * w + x]) for (let y = h - F - 1; y < h; y++) page[y * w + x] = 1;
    }
    for (let y = 0; y < h; y++) {
      if (page[y * w + F + 1]) for (let x = 0; x <= F; x++) page[y * w + x] = 1;
      if (page[y * w + w - F - 2]) for (let x = w - F - 1; x < w; x++) page[y * w + x] = 1;
    }
    // the page reaches in from the border through white wider than ~0.8% of the picture only
    const R = Math.max(2, Math.round(Math.max(w, h) / 240)), art = new Uint8Array(N);
    for (let i = 0; i < N; i++) art[i] = page[i] ? 0 : 1;
    const solid = this._grow(art, w, h, R);
    const reach = new Uint8Array(N), stack = [];
    const seed = i => { if (!solid[i] && !reach[i]) { reach[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop(), x = i % w;
      if (x > 0) seed(i - 1); if (x < w - 1) seed(i + 1); if (i >= w) seed(i - w); if (i < N - w) seed(i + w);
    }
    const near = this._grow(reach, w, h, R), prod = new Uint8Array(N);
    for (let i = 0; i < N; i++) prod[i] = near[i] && page[i] ? 0 : 1;
    // keep the large parts (two flag sides stay; a frame line or a speck goes)
    const lab = new Int32Array(N), sizes = [0];
    for (let i = 0; i < N; i++) {
      if (!prod[i] || lab[i]) continue;
      const id = sizes.length; let n = 0;
      lab[i] = id; stack.push(i);
      while (stack.length) {
        const j = stack.pop(), x = j % w; n++;
        const nb = [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, j >= w ? j - w : -1, j < N - w ? j + w : -1];
        for (const q of nb) if (q >= 0 && prod[q] && !lab[q]) { lab[q] = id; stack.push(q); }
      }
      sizes.push(n);
    }
    const top = Math.max(0, ...sizes);
    if (!top) return null;
    const big = new Uint8Array(N);
    for (let i = 0; i < N; i++) big[i] = lab[i] && sizes[lab[i]] >= 0.05 * top ? 1 : 0;
    // reduce to SIL_PX (area share ≥ ½)
    const r = Math.max(1, Math.ceil(Math.max(w, h) / this.SIL_PX));
    const sw = Math.ceil(w / r), sh = Math.ceil(h / r), data = new Uint8Array(sw * sh);
    let area = 0, x0 = sw, y0 = sh, x1 = -1, y1 = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let n = 0, on = 0;
        for (let yy = y * r; yy < Math.min(h, y * r + r); yy++) for (let xx = x * r; xx < Math.min(w, x * r + r); xx++) { n++; on += big[yy * w + xx]; }
        if (on * 2 < n) continue;
        data[y * sw + x] = 1; area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (!area) return null;
    const box = [x0, y0, x1 + 1, y1 + 1];
    return { w: sw, h: sh, data, box, area, fill: area / ((box[2] - box[0]) * (box[3] - box[1])), iw, ih };
  },

  /** A plain rectangle artwork (no outline to match) as a silhouette */
  _rectSil(iw, ih) {
    const w = 32, h = Math.max(1, Math.round(32 * ih / iw)), data = new Uint8Array(w * h).fill(1);
    return { w, h, data, box: [0, 0, w, h], area: w * h, fill: 1, iw, ih, rect: true };
  },

  /**
   * How the artwork lies on the template (silhouette `sil` placed at p = {x, y, w, h} inches). With a region:
   * its overlap score (intersection / union, outline band ignored). Without: the full numbers —
   * { cover: visible area covered, spill: artwork outside the product (cut off), bleed: bleed covered }.
   */
  _overlap(t, c, sil, p, reg, step) {
    const { w: mw, h: mh } = c.mask, FW = t.fullIn[0], FH = t.fullIn[1];
    const kx = (FW / mw) / p.w * sil.w, ky = (FH / mh) / p.h * sil.h;     // silhouette px per mask px
    const ox = -p.x / p.w * sil.w, oy = -p.y / p.h * sil.h;
    const R = this._regions(c, t);
    let inter = 0, uni = 0, aAll = 0, visN = 0, cov = 0, spill = 0, bleedN = 0, bleedCov = 0;
    for (let my = step / 2; my < mh; my += step) {
      const sy = Math.floor(my * ky + oy), row = (my | 0) * mw, inY = sy >= 0 && sy < sil.h;
      for (let mx = step / 2; mx < mw; mx += step) {
        const i = row + (mx | 0), sx = Math.floor(mx * kx + ox);
        const A = inY && sx >= 0 && sx < sil.w ? sil.data[sy * sil.w + sx] : 0;
        if (A) aAll++;
        if (reg) {
          if (reg.band[i]) continue;
          const T = reg.bits[i];
          if (A | T) { uni++; if (A & T) inter++; }
        } else {
          if (R.visible.bits[i] && !R.visible.band[i]) { visN++; if (A) cov++; }
          else if (R.full.bits[i] && !R.full.band[i] && !R.visible.bits[i] && !R.visible.band[i]) { bleedN++; if (A) bleedCov++; }
          if (A && !R.full.bits[i] && !R.full.band[i]) spill++;
        }
      }
    }
    // artwork beyond the template picture
    const total = sil.area / (kx * ky) / (step * step), beyond = Math.max(0, total - aAll);
    if (reg) return uni + beyond ? inter / (uni + beyond) : 0;
    return { cover: visN ? cov / visN : 0, spill: total ? (spill + beyond) / total : 0, bleed: bleedN ? bleedCov / bleedN : 1 };
  },

  /** The artwork's outline box laid on a template area's box: same centre, same size (uniform scale) — inches */
  _register(t, c, sil, on) {
    const R = this._regions(c, t)[on];
    if (!R || !R.box) return null;
    const { w: mw, h: mh } = c.mask, FW = t.fullIn[0], FH = t.fullIn[1];
    const rb = [R.box[0] * FW / mw, R.box[1] * FH / mh, R.box[2] * FW / mw, R.box[3] * FH / mh];
    const ab = sil.box;
    const s = Math.sqrt(((rb[2] - rb[0]) / (ab[2] - ab[0])) * ((rb[3] - rb[1]) / (ab[3] - ab[1])));   // inches per silhouette px
    const pw = sil.w * s, ph = pw * sil.ih / sil.iw;
    const sy = ph / sil.h;
    return { x: (rb[0] + rb[2]) / 2 - (ab[0] + ab[2]) / 2 * s, y: (rb[1] + rb[3]) / 2 - (ab[1] + ab[3]) / 2 * sy, w: pw, h: ph };
  },

  /** Fine registration: nudge and scale the artwork while the overlap improves */
  _refine(t, c, sil, p, reg) {
    const px = t.fullIn[0] / c.mask.w;
    let best = { p, s: this._overlap(t, c, sil, p, reg, 2) };
    const moves = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [0, 0, 1.006], [0, 0, 1 / 1.006]];
    for (let it = 0; it < 14; it++) {
      let next = null;
      moves.forEach(([dx, dy, k]) => {
        const q = best.p, w = q.w * k, h = q.h * k;
        const cand = { x: q.x + (q.w - w) / 2 + dx * px, y: q.y + (q.h - h) / 2 + dy * px, w, h };
        const s = this._overlap(t, c, sil, cand, reg, 2);
        if (s > (next ? next.s : best.s) + 1e-4) next = { p: cand, s };
      });
      if (!next) break;
      best = next;
    }
    return best.p;
  },

  /** Best registration of the artwork's outline on a template: { on, x, y, w, h, score } (inches, 0–1) */
  fit(t, c, sil, refine) {
    let best = null;
    ['full', 'visible'].forEach(on => {
      const reg = this._regions(c, t)[on];
      let p = this._register(t, c, sil, on);
      if (!p) return;
      if (refine) p = this._refine(t, c, sil, p, reg);
      const score = this._overlap(t, c, sil, p, reg, refine ? 1 : 2);
      if (!best || score > best.score) best = { on, x: p.x, y: p.y, w: p.w, h: p.h, score, refined: !!refine };
    });
    return best;
  },

  // ── matching the order and its artwork ────────────────────────────────
  _match: null,      // { key, t, by, shaped, sil, fits, ranked, shapeRank }

  _image(src) {
    return new Promise(resolve => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  },

  _key(spec, dims, fileName, src) {
    const s = String(src || '');
    return [spec && spec.name, dims && dims.widthIn, dims && dims.heightIn, fileName, s.length, s.slice(-48)].join('|');
  },

  /** The finished match for this order + artwork, if it was made already */
  cachedMatch(spec, dims, parsed, fileName, src) {
    const m = this._match;
    return m && !m.pending && m.key === this._key(spec, dims, fileName, src) ? m : null;
  },

  /**
   * Template for this order and artwork. Candidates are the templates of the ordered product; a shaped artwork is
   * matched by its outline (overlap with each candidate's product / visible area — website templates first, the
   * order's size and panel words as tie-breakers). Rectangles and unclear outlines keep the word match.
   * Promise of { t, by: 'shape' | 'words' | '', shaped, fits, shapeRank, ranked }.
   */
  autoMatch(spec, dims, parsed, fileName, src) {
    const key = this._key(spec, dims, fileName, src);
    if (this._match && this._match.key === key) return this._match.promise;
    const ranked = this.rank(spec, dims, parsed, fileName);
    const words = this.best(spec, dims, parsed, fileName);
    const res = { key, ranked, t: words, by: words ? 'words' : '', shaped: false, sil: null, fits: new Map(), shapeRank: [], pending: true };
    this._match = res;
    res.promise = (async () => {
      try {
        if (!ranked.length || !src) return res;
        const img = await this._image(src);
        if (img) res.bg = this.artBackground(img);
        const sil = img ? this.silhouette(img) : null;
        // a rectangle is placed by proportions; anything else (a desk blade is a rectangle with one curved corner,
        // 94% of its box) is matched by its outline
        if (!sil || sil.fill >= 0.985 || sil.area < 200) return res;
        const cands = ranked.slice(0, 40);
        const masks = await Promise.all(cands.map(r => this.loadMask(r.t)));
        const rows = [];
        cands.forEach((r, i) => {
          const c = masks[i] && masks[i].mask ? masks[i] : null;
          if (c) rows.push({ r, c, fit: this.fit(r.t, c, sil, false) });
        });
        const value = x => x.fit ? x.fit.score * 10 + x.r.score * 0.4 + (this.isProduction(x.r.t) ? 1.2 : this.isWebsite(x.r.t) ? 0.5 : 0) : -1;
        rows.sort((a, b) => value(b) - value(a));
        rows.slice(0, 4).forEach(x => { x.fit = this.fit(x.r.t, x.c, sil, true); });
        rows.sort((a, b) => value(b) - value(a));
        rows.forEach(x => { if (x.fit) res.fits.set(x.r.t.id, x.fit); });
        const top = rows[0];
        if (top && top.fit && top.fit.score >= 0.8) {
          Object.assign(res, { t: top.r.t, by: 'shape', shaped: true, sil });
          res.shapeRank = rows.filter(x => x.fit).map(x => ({ t: x.r.t, score: x.fit.score, size: x.r.size }));
        }
      } catch (e) { /* keep the word match */ }
      return res;
    })().then(r => { r.pending = false; return r; });
    return res.promise;
  },

  /** Registration of the current artwork on template t (computed once its mask is loaded), or null */
  fitFor(t) {
    const m = this._match;
    if (!m || !m.shaped || !m.sil || !t) return null;
    const have = m.fits.get(t.id);
    if (have && have.refined) return have;
    const c = this._maskOf(t);
    if (!c || !c.mask) {
      this.loadMask(t);
      return have || null;
    }
    const f = this.fit(t, c, m.sil, true);
    if (f) m.fits.set(t.id, f);
    return f;
  },

  /**
   * Where the artwork goes on the template (inches on the full template). A shaped artwork sits where its outline
   * matches the template ('shape'); otherwise the box its proportions match — the full size with bleed, the visible
   * area or the safe area (within 4%) — else fitted into the visible area, centred ('fit').
   */
  placement(t, artW, artH, rot) {
    const A = artW / artH, m = this._match;
    if (!rot && m && m.shaped && m.sil && Math.abs(A / (m.sil.iw / m.sil.ih) - 1) < 0.02) {
      const f = this.fitFor(t);
      if (f) return { x: f.x, y: f.y, w: f.w, h: f.h, on: 'shape', region: f.on, score: f.score };
    }
    const F = [0, 0, t.fullIn[0], t.fullIn[1]];
    const boxes = [['full', this.isLayout(t) && t.prodIn ? t.prodIn : F], ['visible', t.visIn || F], ['safe', t.safeIn || F]];
    let best = null;
    boxes.forEach(([on, b]) => {
      const a = (b[2] - b[0]) / (b[3] - b[1]);
      const err = Math.abs(A / a - 1);
      if (!best || err < best.err) best = { on, b, err };
    });
    // a table cover layout and an artwork not laid out on it (a logo, a front design): centred on the Front panel,
    // inside its safe area — the background colour fills the rest of the cover
    if (t.front && !(best.err <= 0.04 && best.on === 'full')) {
      const fb = t.frontSafe || t.front, mw = (fb[2] - fb[0]) * 0.84, mh = (fb[3] - fb[1]) * 0.8;
      const w = Math.min(mw, mh * A), h = w / A;
      return { x: (fb[0] + fb[2]) / 2 - w / 2, y: (fb[1] + fb[3]) / 2 - h / 2, w, h, on: 'front' };
    }
    const b = best.err <= 0.04 ? best.b : (t.visIn || F);
    const bw = b[2] - b[0], bh = b[3] - b[1];
    const w = Math.min(bw, bh * A), h = w / A;
    return { x: b[0] + (bw - w) / 2, y: b[1] + (bh - h) / 2, w, h, on: best.err <= 0.04 ? best.on : 'fit' };
  },

  /** A double-sided flag layout repeats a logo-only artwork in the logo box of the other side (same size) */
  logoCopies(t, p) {
    if (!p || p.on !== 'front' || !Array.isArray(t.logoBoxes) || t.logoBoxes.length < 2) return [];
    return t.logoBoxes.slice(1).map(b => ({ x: (b[0] + b[2]) / 2 - p.w / 2, y: (b[1] + b[3]) / 2 - p.h / 2, w: p.w, h: p.h, on: 'front' }));
  },

  /**
   * Fit numbers for the artwork as placed: { on, score (outline match, shaped artwork), cover (visible area covered),
   * spill (artwork outside the product), bleed (bleed covered) } — null until the template mask is loaded.
   */
  stats(t, artW, artH, rot) {
    const c = this._maskOf(t);
    if (!c || !c.mask) return null;
    const p = this.placement(t, artW, artH, rot);
    if (p.on === 'front') return { on: 'front', region: 'front', score: null, cover: 1, spill: 0, bleed: 1 };   // background fills the cover
    const m = this._match;
    const sil = p.on === 'shape' && m && m.sil ? m.sil : this._rectSil(artW, artH);
    return Object.assign({ on: p.on, region: p.region || p.on, score: p.score == null ? null : p.score }, this._overlap(t, c, sil, p, null, 1));
  },

  // ── drawing ───────────────────────────────────────────────────────────

  /**
   * Closed outlines of a 0/1 mask, simplified — mask px. The area is smoothed a little and its half level traced with
   * sub-pixel crossings (marching squares), so straight edges stay straight instead of following the pixel steps.
   */
  _contours(bits, w, h) {
    let f = Float32Array.from(bits);
    for (let pass = 0; pass < 2; pass++) {
      const g = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy;
            if (yy < 0 || yy >= h) continue;
            for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < w) s += f[yy * w + xx]; }
          }
          g[y * w + x] = s / 9;
        }
      }
      f = g;
    }
    const val = (x, y) => (x >= 0 && y >= 0 && x < w && y < h) ? f[y * w + x] : 0;
    const at = (x, y) => (val(x, y) > 0.5 ? 1 : 0);
    // where the half level crosses the edge between two pixel centres
    const cross = (x0, y0, x1, y1) => {
      const a = val(x0, y0), b = val(x1, y1), t = b !== a ? Math.min(1, Math.max(0, (0.5 - a) / (b - a))) : 0.5;
      return [x0 + 0.5 + (x1 - x0) * t, y0 + 0.5 + (y1 - y0) * t];
    };
    const W2 = 2 * w + 8, key = (X, Y) => (Y + 4) * W2 + X + 4;
    const segs = [], ends = new Map(), pos = new Map();
    const add = (a, b) => {
      const s = segs.length;
      segs.push([a, b]);
      [a, b].forEach(p => { const k = key(p[0], p[1]); const l = ends.get(k); l ? l.push(s) : ends.set(k, [s]); });
    };
    for (let y = -1; y < h; y++) {
      for (let x = -1; x < w; x++) {
        const code = at(x, y) * 8 + at(x + 1, y) * 4 + at(x + 1, y + 1) * 2 + at(x, y + 1);
        if (!code || code === 15) continue;
        [[2 * x + 2, 2 * y + 1, x, y, x + 1, y], [2 * x + 3, 2 * y + 2, x + 1, y, x + 1, y + 1],
          [2 * x + 2, 2 * y + 3, x, y + 1, x + 1, y + 1], [2 * x + 1, 2 * y + 2, x, y, x, y + 1]].forEach(([X, Y, a, b, c2, d2]) => {
          const k = key(X, Y);
          if (!pos.has(k)) pos.set(k, cross(a, b, c2, d2));
        });
        // edge midpoints, doubled coordinates
        const T = [2 * x + 2, 2 * y + 1], Rr = [2 * x + 3, 2 * y + 2], B = [2 * x + 2, 2 * y + 3], L = [2 * x + 1, 2 * y + 2];
        switch (code) {
          case 1: case 14: add(L, B); break;
          case 2: case 13: add(B, Rr); break;
          case 3: case 12: add(L, Rr); break;
          case 4: case 11: add(T, Rr); break;
          case 6: case 9: add(T, B); break;
          case 7: case 8: add(L, T); break;
          case 5: add(L, T); add(B, Rr); break;
          case 10: add(L, B); add(T, Rr); break;
        }
      }
    }
    const used = new Uint8Array(segs.length), out = [];
    for (let s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue;
      used[s0] = 1;
      const pts = [segs[s0][0], segs[s0][1]];
      let cur = segs[s0][1];
      for (;;) {
        const l = ends.get(key(cur[0], cur[1])) || [];
        const s = l.find(i => !used[i]);
        if (s === undefined) break;
        used[s] = 1;
        const [a, b] = segs[s];
        cur = (a[0] === cur[0] && a[1] === cur[1]) ? b : a;
        pts.push(cur);
      }
      if (pts.length < 8) continue;
      const poly = this._simplify(pts.map(p => pos.get(key(p[0], p[1])) || [p[0] / 2, p[1] / 2]), 0.45);
      if (poly.length >= 3) out.push(poly);
    }
    return out;
  },

  /** Ramer–Douglas–Peucker */
  _simplify(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      let far = -1, fd = eps;
      for (let i = a + 1; i < b; i++) {
        // a closed outline starts and ends on the same point: distance to that point
        const d = L ? Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        if (d > fd) { fd = d; far = i; }
      }
      if (far > 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
    }
    return pts.filter((p, i) => keep[i]);
  },

  /** Outlines of a template's areas (mask px), cached: product cut line, visible area, safe area */
  outlines(c, t) {
    if (c.paths) return c.paths;
    const V = c.vector;
    if (V && V.w && Array.isArray(V.visible)) {
      // vector outlines of the full-size layout, in mask px
      const kx = c.mask.w / V.w, ky = c.mask.h / V.h;
      const conv = list => (list || []).map(fl => { const out = []; for (let i = 0; i + 1 < fl.length; i += 2) out.push([fl[i] * kx, fl[i + 1] * ky]); return out; });
      c.paths = { product: conv(V.product), visible: conv(V.visible), safe: conv(V.safe) };
      return c.paths;
    }
    const R = this._regions(c, t), { w, h } = c.mask;
    c.paths = {
      product: this.isLayout(t) ? this._contours(R.full.bits, w, h) : [],
      visible: this._contours(R.visible.bits, w, h),
      safe: this._contours(R.safe.bits, w, h)
    };
    return c.paths;
  },

  /** Fill the product (cut line, bleed included) of a website template with a colour — the layout background */
  fillProduct(ctx, c, t, x, y, w, h, color) {
    if (!c || !c.mask) return false;
    const P = this.outlines(c, t), polys = P.product.length ? P.product : P.visible;
    if (!polys.length) return false;
    const kx = w / c.mask.w, ky = h / c.mask.h;
    ctx.save();
    ctx.beginPath();
    polys.forEach(pl => {
      pl.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * kx, y + py * ky) : ctx.moveTo(x + px * kx, y + py * ky)));
      ctx.closePath();
    });
    ctx.fillStyle = color;
    ctx.fill('evenodd');
    ctx.restore();
    return true;
  },

  /**
   * Background colour for the product around a logo: the artwork's own background (a logo on a coloured panel —
   * its edge is one even colour) or white when it has none (transparent, white or a busy picture edge).
   * { color: '#rrggbb', from: 'artwork' | 'default' }
   */
  artBackground(img) {
    const white = { color: '#ffffff', from: 'default' };
    const iw = img && (img.naturalWidth || img.width), ih = img && (img.naturalHeight || img.height);
    if (!(iw > 0 && ih > 0)) return white;
    const k = Math.min(1, 160 / Math.max(iw, ih)), w = Math.max(4, Math.round(iw * k)), h = Math.max(4, Math.round(ih * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    let d;
    try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return white; }
    const px = [];
    let clear = 0, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (x > 1 && y > 1 && x < w - 2 && y < h - 2) continue;          // the 2 px edge of the artwork
        const j = (y * w + x) * 4;
        n++;
        if (d[j + 3] < 24) { clear++; continue; }
        px.push([d[j], d[j + 1], d[j + 2]]);
      }
    }
    if (!px.length || clear > 0.4 * n) return white;
    const med = [0, 1, 2].map(ch => px.map(p => p[ch]).sort((a, b) => a - b)[px.length >> 1]);
    const even = px.filter(p => Math.abs(p[0] - med[0]) + Math.abs(p[1] - med[1]) + Math.abs(p[2] - med[2]) < 48).length / px.length;
    if (even < 0.8 || med.every(v => v > 240)) return white;
    return { color: '#' + med.map(v => v.toString(16).padStart(2, '0')).join(''), from: 'artwork' };
  },

  /** Layout background of the current artwork (autoMatch), white until it is known */
  background() {
    return (this._match && this._match.bg) || { color: '#ffffff', from: 'default' };
  },

  /** Draw the template's outlines over a box (x, y, w, h px): cut line red, visible area blue, safe area green dashed */
  drawOutlines(ctx, c, t, x, y, w, h, opt) {
    if (!c || !c.mask) return;
    const P = this.outlines(c, t), kx = w / c.mask.w, ky = h / c.mask.h, o = opt || {};
    const lw = o.width || Math.max(1.4, Math.min(3, w / 420));
    const trace = polys => {
      ctx.beginPath();
      polys.forEach(pl => {
        pl.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * kx, y + py * ky) : ctx.moveTo(x + px * kx, y + py * ky)));
        ctx.closePath();
      });
    };
    const stroke = (polys, color, dash, width) => {
      if (!polys.length) return;
      trace(polys);
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = width + 2.2;
      ctx.stroke();
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (o.product !== false) stroke(P.product, '#e11d48', [], lw * 0.85);
    stroke(P.visible, '#1d4ed8', [], lw);
    if (o.safe !== false) stroke(P.safe, '#16a34a', [lw * 4, lw * 2.6], lw);
    ctx.restore();
  },

  /**
   * Fit check picture (mask px, transparent where all is well): red = visible area the artwork does not cover,
   * pink = bleed not covered, amber = artwork outside the product (cut off).
   */
  fitOverlay(t, c, p, sil) {
    const { w: mw, h: mh } = c.mask, FW = t.fullIn[0], FH = t.fullIn[1], R = this._regions(c, t);
    const kx = (FW / mw) / p.w * sil.w, ky = (FH / mh) / p.h * sil.h, ox = -p.x / p.w * sil.w, oy = -p.y / p.h * sil.h;
    const cv = document.createElement('canvas'); cv.width = mw; cv.height = mh;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(mw, mh), d = img.data;
    // the artwork outline sampled smoothly (bilinear), not in silhouette-pixel steps
    const g = (x, y) => (x >= 0 && y >= 0 && x < sil.w && y < sil.h) ? sil.data[y * sil.w + x] : 0;
    const inside = (fx, fy) => {
      const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5), tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
      return ((g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty) >= 0.5;
    };
    for (let my = 0; my < mh; my++) {
      const fy = (my + 0.5) * ky + oy;
      for (let mx = 0; mx < mw; mx++) {
        const i = my * mw + mx;
        const A = inside((mx + 0.5) * kx + ox, fy);
        let col = null;
        if (A && !R.full.bits[i] && !R.full.band[i]) col = [245, 158, 11, 225];
        else if (!A && R.visible.bits[i] && !R.visible.band[i]) col = [220, 38, 38, 200];
        else if (!A && R.full.bits[i] && !R.visible.bits[i] && !R.full.band[i]) col = [244, 114, 182, 170];
        if (col) { d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = col[3]; }
      }
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  },

  /**
   * The artwork without the white page around its outline (shaped artwork), so the template's own page, labels and
   * bleed bars show where the artwork does not reach — else the image itself
   */
  clippedArt(img) {
    const m = this._match;
    if (!img || !m || !m.shaped || !m.sil) return img;
    if (m.clip && m.clip.src === img.src) return m.clip.cv;
    const sil = m.sil, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (Math.abs((iw / ih) / (sil.iw / sil.ih) - 1) > 0.02) return img;
    const k = Math.min(1, 1800 / Math.max(iw, ih)), W = Math.round(iw * k), H = Math.round(ih * k);
    const sc = document.createElement('canvas'); sc.width = sil.w; sc.height = sil.h;
    const sctx = sc.getContext('2d'), sd = sctx.createImageData(sil.w, sil.h);
    for (let i = 0; i < sil.data.length; i++) { sd.data[i * 4 + 3] = sil.data[i] ? 255 : 0; }
    sctx.putImageData(sd, 0, 0);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(sc, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-in';
    ctx.drawImage(img, 0, 0, W, H);
    m.clip = { src: img.src, cv };
    return cv;
  },

  /** Short label for a template in lists */
  label(t) {
    if (this.isLayout(t)) return t.name;
    const s = t.stated && t.stated[0] ? ` · ${+t.stated[0].toFixed(2)}" × ${+t.stated[1].toFixed(2)}"` : '';
    return `${t.product} › ${t.name}${s}`;
  }
};

if (typeof window !== 'undefined') window.ProductTemplates = ProductTemplates;
if (typeof module !== 'undefined' && module.exports) module.exports = ProductTemplates;
