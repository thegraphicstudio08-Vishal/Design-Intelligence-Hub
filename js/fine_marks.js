/**
 * Design Intelligence Hub - small stray marks at full size
 *
 * Team requests, Oct 2026. US2425331: two hairlines, 0.12" × 0.016", under the "M" of a 57" × 88.5" banner. AU2430882
 * (57 × 88 in JPG): 0.4 mm light dots inside the navy letters of "RECOGNIZING". The Lines & Dots check reads the
 * artwork at 2000 px — a 7125 × 11000 px picture shrinks ×5.5 and both are gone — and keeps away from the edges of
 * letters and shapes (that protects i-dots and fine letter parts).
 * This pass reads the picture near its own size, tile by tile (the tiles are analysed in a background worker, the
 * page keeps running), the way a designer looks at it zoomed in. Two kinds of stray mark:
 *  1. odd colour — a small mark in a colour the design does not use, standing alone on a plain area
 *     · design colours = the colours the picture is made of (a 4-bit colour covering ≥ 0.15 % of it), and every blend
 *       of two of them — the soft edge between a letter and its background, a gradient
 *     · a colour that covers more than 0.05 sq in elsewhere is the design's own (a small word in a spot colour)
 *  2. speck in a solid area — a tiny dot (any colour, the design's own too) inside a solid fill: a letter, a shape, a
 *     plain background. A font or a flat fill never has one. Clear solid colour all round for 2× its size, so an
 *     i-dot, a full stop or a bullet (the letter stem / the next letter is close) is not one.
 * Both: a crisp edge (the core of a soft glow fades out), touching nothing else (a serif tip / a feather quill in
 * another shade touches its shape), not splatter (3 other groups within 0.3"), not a pattern (6 look-alikes within 2"),
 * at most 24 marks (more → texture / photo detail: none reported).
 * Marks come back in the source's own pixels, in the Lines & Dots mark format.
 */
const FineMarks = {
  MIN_SIDE: 2000,          // pictures up to 2000 px: the Lines & Dots check reads them whole already
  SIDE: 12000,             // read at most 12000 px on the long side …
  MP: 80e6,                // … and 80 megapixels (a 7125 × 11000 px print file is read at its own size)
  TILE: 1024,              // tile size (px at the read size)
  SHARE: 0.0015,           // a colour covering 0.15 % of the picture is a design colour
  NEAR: 40,                // RGB distance: within it of a colour = that colour
  BLEND: 26,               // within it of a blend of two colours = a soft edge / gradient
  RING_IN: 0.03,           // ring around a mark: 0.03" (3 px at least; the pixels touching it are its border)
  SOFT: 0.6,               // the pixels touching a mark at more than 60 % of its contrast: a soft glow, not a mark
  SPREAD_IN: 0.3,          // three other odd groups within 0.3": splatter / a distressed texture
  PATTERN: 6,              // look-alike marks within PATTERN_IN of each other: a pattern of the design
  PATTERN_IN: 2,
  TOO_MANY: 24,            // more marks than this: texture / photo detail, nothing reported
  // 1. odd colour
  MAX_IN: 0.5,             // at most 0.5" across …
  MIN_IN: 0.04,            // … at least 0.04" (1 mm) long
  MIN_PX: 3,               // (and 3 px at the read size, 4 px in all)
  CONTRAST: 45,            // RGB distance between the mark and its ring
  DESIGN_SQIN: 0.05,       // a colour covering 0.05 sq in elsewhere on the picture is the design's own
  // 2. speck in a solid area
  SPECK_MAX_IN: 0.06,      // at most 0.06" (1.5 mm) across — an eye / a bullet of a design is larger
  SPECK_STEP: 40,          // a pixel this far from its 8 px block's solid colour stands out
  SPECK_CONTRAST: 60,      // and the speck as a whole this far from the solid colour around it
  SPECK_CLEAR: 2,          // solid colour all round for 2× its size (an i-dot / a full stop is closer to its letter
                           // than its own size) …
  SPECK_CLEAR_IN: 0.03,    // … and at least 0.03"
  SPECK_FLAT: 16,          // "flat": the pixels around within 16 of the solid colour (a vector fill; grain is more)
  SPECK_MIN_IN: 0.016,     // at least 0.016" (0.4 mm) across
  TEXTURE: 3,              // 3 other real specks within PATTERN_IN: the design has a texture (distressed print,
                           // grain), its specks are not reported
  TEXTURE_ALL: 10,         // … or 10 real specks over the whole picture: its style, not strays

  // the tile analysis, in the worker: odd pixels → groups → the tests; the tile's colour counts come back too
  WORKER: `
let pal = [], memo = null;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function isDesign(c, near, blend) {
  for (const p of pal) if (dist(c, p) <= near) return true;
  for (let i = 0; i < pal.length; i++) for (let j = i + 1; j < pal.length; j++) {
    const a = pal[i], b = pal[j], ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    if (!L) continue;
    const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / L));
    if (dist(c, [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]]) <= blend) return true;
  }
  return false;
}
// groups of marked pixels (8-connected): labels + bounding box, pixel count and colour sums
function label(fg, d, w, h) {
  const N = w * h, lab = new Int32Array(N), st = new Int32Array(N), groups = [];
  for (let i = 0; i < N; i++) {
    if (!fg[i] || lab[i]) continue;
    const gid = groups.length + 1;
    let sp = 0, n = 0, x0 = w, y0 = h, x1 = -1, y1 = -1, sr = 0, sg = 0, sb = 0;
    st[sp++] = i; lab[i] = gid;
    while (sp) {
      const q = st[--sp], x = q % w, y = (q / w) | 0, o = q * 4;
      n++; sr += d[o]; sg += d[o + 1]; sb += d[o + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((!dx && !dy) || xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const r = yy * w + xx;
        if (fg[r] && !lab[r]) { lab[r] = gid; st[sp++] = r; }
      }
    }
    groups.push({ gid, n, x0, y0, x1, y1, col: [sr / n, sg / n, sb / n] });
  }
  return { lab, groups };
}
// the tests every mark passes: a ring of one plain colour, nothing else odd in it, contrast, a crisp edge, touching
// nothing else, not splatter. Returns { ring, uniform, contrast } or null
function judge(g, lab, fg, d, w, h, cfg, minUniform, minContrast, splatter = true) {
  const { gid, x0, y0, x1, y1, col } = g, R = cfg.ring;
  const rx0 = Math.max(0, x0 - R), ry0 = Math.max(0, y0 - R), rx1 = Math.min(w - 1, x1 + R), ry1 = Math.min(h - 1, y1 + R);
  const touches = (x, y) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && lab[yy * w + xx] === gid) return true;
    }
    return false;
  };
  let rn = 0, rf = 0, rr = 0, rg = 0, rb = 0, bn = 0, br = 0, bg = 0, bb = 0;
  const ringPx = [], borderPx = [];
  for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
    const r = y * w + x, o = r * 4;
    if (lab[r] === gid) continue;
    if (touches(x, y)) { bn++; br += d[o]; bg += d[o + 1]; bb += d[o + 2]; borderPx.push(o); continue; }
    rn++;
    if (fg[r]) { rf++; continue; }
    rr += d[o]; rg += d[o + 1]; rb += d[o + 2]; ringPx.push(o);
  }
  if (!ringPx.length || rf > 0.08 * rn) return cfg.debug ? { fail: 'ring' } : null;
  const ring = [rr / ringPx.length, rg / ringPx.length, rb / ringPx.length];
  let same = 0;
  ringPx.forEach(o => { if (dist([d[o], d[o + 1], d[o + 2]], ring) <= cfg.near) same++; });
  const uniform = same / rn, contrast = dist(col, ring);
  if (uniform < minUniform || contrast < minContrast) return cfg.debug ? { fail: 'uniform/contrast' } : null;
  // a crisp edge: the pixels touching it are already close to the background (a soft glow fades out)
  if (bn && dist([br / bn, bg / bn, bb / bn], ring) > cfg.soft * contrast) return cfg.debug ? { fail: 'soft' } : null;
  // alone: every pixel touching it is a blend of the mark and the background (a piece of a shape touches the rest)
  const cr = [ring[0] - col[0], ring[1] - col[1], ring[2] - col[2]], L = cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2] || 1;
  let off = 0;
  borderPx.forEach(o => {
    const t = Math.max(0, Math.min(1, ((d[o] - col[0]) * cr[0] + (d[o + 1] - col[1]) * cr[1] + (d[o + 2] - col[2]) * cr[2]) / L));
    if (dist([d[o], d[o + 1], d[o + 2]], [col[0] + t * cr[0], col[1] + t * cr[1], col[2] + t * cr[2]]) > cfg.blend) off++;
  });
  if (off > 0.1 * borderPx.length) return cfg.debug ? { fail: 'touches' } : null;
  if (!splatter) return { ring, uniform, contrast };
  // three or more other odd groups close by: splatter / a distressed texture of the design
  const S = cfg.spread, others = new Set();
  for (let y = Math.max(0, y0 - S); y <= Math.min(h - 1, y1 + S); y++) for (let x = Math.max(0, x0 - S); x <= Math.min(w - 1, x1 + S); x++) {
    const l = lab[y * w + x];
    if (l && l !== gid) others.add(l);
  }
  if (others.size >= 3) return cfg.debug ? { fail: 'splatter' } : null;
  return { ring, uniform, contrast };
}
onmessage = e => {
  const m = e.data;
  if (m.palette) { pal = m.palette; memo = new Uint8Array(32768); return; }
  const { id, w, h, cfg } = m, d = new Uint8ClampedArray(m.buf), N = w * h;
  const own = g => { const cx = (g.x0 + g.x1) / 2, cy = (g.y0 + g.y1) / 2; return cx >= cfg.own[0] && cy >= cfg.own[1] && cx < cfg.own[2] && cy < cfg.own[3]; };
  const size = g => Math.max(g.x1 - g.x0, g.y1 - g.y0) + 1;
  const hist = new Uint32Array(32768), odd = new Uint8Array(N), out = [];
  // 1. odd colour: pixels in no design colour and no blend of two
  for (let p = 0, o = 0; p < N; p++, o += 4) {
    if (d[o + 3] < 128) continue;
    const k = ((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3);
    hist[k]++;
    let v = memo[k];
    if (!v) v = memo[k] = isDesign([(d[o] & 248) + 4, (d[o + 1] & 248) + 4, (d[o + 2] & 248) + 4], cfg.near, cfg.blend) ? 2 : 1;
    if (v === 1) odd[p] = 1;
  }
  const A = label(odd, d, w, h);
  for (const g of A.groups) {
    if (g.n < 3 || size(g) > cfg.maxPx || !own(g)) continue;
    const small = { kind: 'odd', x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, n: g.n, col: g.col, ok: false };
    if (out.length < 6000) out.push(small);
    if (g.n < 4 || size(g) < cfg.minPx) continue;
    const j = judge(g, A.lab, odd, d, w, h, cfg, 0.85, cfg.contrast);
    if (j && j.fail) small.why = j.fail;
    else if (j) Object.assign(small, j, { ok: true });
  }
  // 2. speck in a solid area: pixels unlike the solid colour of their own 8 px block (plain arithmetic: this runs on
  // every pixel)
  const B = 8, bw = Math.ceil(w / B), bh = Math.ceil(h / B), ref = new Float32Array(bw * bh * 3), flat = new Uint8Array(bw * bh);
  const T2 = 24 * 24, S2 = cfg.speckStep * cfg.speckStep;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const xa = bx * B, ya = by * B, xb = Math.min(w, xa + B), yb = Math.min(h, ya + B);
    let n = 0, r = 0, g = 0, b = 0;
    for (let y = ya; y < yb; y++) for (let o = (y * w + xa) * 4, oe = (y * w + xb) * 4; o < oe; o += 4) { n++; r += d[o]; g += d[o + 1]; b += d[o + 2]; }
    const mr = r / n, mg = g / n, mb = b / n;
    let k = 0; r = g = b = 0;
    for (let y = ya; y < yb; y++) for (let o = (y * w + xa) * 4, oe = (y * w + xb) * 4; o < oe; o += 4) {
      const er = d[o] - mr, eg = d[o + 1] - mg, eb = d[o + 2] - mb;
      if (er * er + eg * eg + eb * eb <= T2) { k++; r += d[o]; g += d[o + 1]; b += d[o + 2]; }
    }
    const i = by * bw + bx;
    if (k >= 0.8 * n) { flat[i] = 1; ref[i * 3] = r / k; ref[i * 3 + 1] = g / k; ref[i * 3 + 2] = b / k; }
  }
  const sp = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    const row = ((y / B) | 0) * bw;
    for (let x = 0; x < w; x++) {
      const i = row + ((x / B) | 0);
      if (!flat[i]) continue;
      const o = (y * w + x) * 4, er = d[o] - ref[i * 3], eg = d[o + 1] - ref[i * 3 + 1], eb = d[o + 2] - ref[i * 3 + 2];
      if (er * er + eg * eg + eb * eb >= S2) sp[y * w + x] = 1;
    }
  }
  // the slivers a letter edge leaves in a mostly solid block are groups too, but no specks: only real specks (alone,
  // crisp, on one solid colour) count as neighbours — for splatter here, for a pattern later (p1)
  const S = label(sp, d, w, h), real = [];
  for (const g of S.groups) {
    if (g.n < 3 || size(g) > cfg.speckMax) continue;
    const j = judge(g, S.lab, sp, d, w, h, cfg, 0.9, cfg.speckContrast, false);
    if (j && !j.fail) real.push([g, j]);
    else if (own(g) && out.length < 6000) out.push({ kind: 'speck', x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, n: g.n, col: g.col, ok: false, why: j && j.fail });
  }
  for (const [g, j] of real) {
    if (!own(g)) continue;
    const small = { kind: 'speck', x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, n: g.n, col: g.col, ok: false, p1: true };
    if (out.length < 6000) out.push(small);
    const sx = cfg.spread;
    if (real.filter(([o]) => o !== g && o.x1 >= g.x0 - sx && o.x0 <= g.x1 + sx && o.y1 >= g.y0 - sx && o.y0 <= g.y1 + sx).length >= 3) { small.why = 'splatter'; continue; }
    if (size(g) < cfg.speckMin) { small.why = 'too small'; continue; }
    // a truly flat, solid colour all round for 2× its size, nothing else in it: an i-dot / a full stop has its letter
    // close by, a colon its other dot; an illustration or a photo has grain
    const C = Math.max(cfg.speckClear, cfg.speckClearX * size(g)), F2 = cfg.flat * cfg.flat, K2 = cfg.speckContrast * cfg.speckContrast;
    let tot = 0, ok = 0, ink = 0, other = false;
    for (let y = Math.max(0, g.y0 - C); y <= Math.min(h - 1, g.y1 + C) && !other; y++) for (let x = Math.max(0, g.x0 - C); x <= Math.min(w - 1, g.x1 + C); x++) {
      if (x >= g.x0 - 1 && x <= g.x1 + 1 && y >= g.y0 - 1 && y <= g.y1 + 1) continue;   // the speck and its border
      const r = y * w + x, l = S.lab[r];
      if (l && l !== g.gid) { other = true; break; }
      const o = r * 4, er = d[o] - j.ring[0], eg = d[o + 1] - j.ring[1], eb = d[o + 2] - j.ring[2], e2 = er * er + eg * eg + eb * eb;
      tot++;
      if (e2 <= F2) ok++;
      if (e2 > K2) ink++;                                    // real ink (a stroke running on, a letter edge), not noise
    }
    if (ink > 2) other = true;                               // the fading tip of a thin stroke has its stroke beside it
    if (!other && tot && ok >= 0.95 * tot) Object.assign(small, j, { ok: true });
    else small.why = other ? 'something else close by' : 'not a flat solid colour all round';
  }
  postMessage({ id, marks: out, hist }, [hist.buffer]);
};`,

  /** Design colours: 4-bit colours covering SHARE of a small copy, merged when close */
  _palette(source) {
    const W0 = source.naturalWidth || source.width, H0 = source.naturalHeight || source.height;
    const k = Math.min(1, 800 / Math.max(W0, H0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W0 * k)); c.height = Math.max(1, Math.round(H0 * k));
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(source, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const bins = new Map();
    let total = 0;
    for (let o = 0; o < d.length; o += 4) {
      if (d[o + 3] < 128) continue;
      const key = ((d[o] >> 4) << 8) | ((d[o + 1] >> 4) << 4) | (d[o + 2] >> 4);
      const b = bins.get(key) || [0, 0, 0, 0];
      b[0]++; b[1] += d[o]; b[2] += d[o + 1]; b[3] += d[o + 2];
      bins.set(key, b);
      total++;
    }
    const pal = [];
    [...bins.values()].filter(b => b[0] >= this.SHARE * total).sort((a, b) => b[0] - a[0]).forEach(b => {
      const col = [b[1] / b[0], b[2] / b[0], b[3] / b[0]];
      if (!pal.some(p => Math.hypot(p[0] - col[0], p[1] - col[1], p[2] - col[2]) < 12)) pal.push(col);
    });
    return pal.slice(0, 40);
  },

  /**
   * Small stray marks of a picture at (near) its own size.
   * @param source image / canvas / ImageBitmap
   * @param opts { pxPerIn: the picture's pixels per printed inch, alive(): false stops it }
   * @returns {Promise<{marks, scale, tooMany}|null>} marks in the source's own pixels (Lines & Dots mark format)
   */
  async scan(source, opts = {}) {
    if (typeof Worker === 'undefined') return null;
    const W0 = source.naturalWidth || source.width, H0 = source.naturalHeight || source.height;
    if (!(W0 >= 40 && H0 >= 40)) return null;
    // up to 2000 px the Lines & Dots check reads every pixel itself (a small preview has nothing finer to show)
    if (Math.max(W0, H0) <= this.MIN_SIDE) return { marks: [], scale: 1, small: true };
    const k = Math.min(1, this.SIDE / Math.max(W0, H0), Math.sqrt(this.MP / (W0 * H0)));
    const W = Math.round(W0 * k), H = Math.round(H0 * k);
    const ppi = (opts.pxPerIn > 0 ? opts.pxPerIn : Math.max(W0, H0) / 48) * k;   // read-size pixels per inch
    const px = v => Math.round(v * ppi);
    const maxPx = Math.max(8, px(this.MAX_IN)), ring = Math.max(3, px(this.RING_IN)), spread = Math.max(6, px(this.SPREAD_IN));
    const speckMax = Math.max(4, px(this.SPECK_MAX_IN)), speckClear = Math.max(4, px(this.SPECK_CLEAR_IN));
    const pad = Math.max(maxPx + ring, spread, speckMax + this.SPECK_CLEAR * speckMax) + 2, T = this.TILE;
    const cfg = { debug: !!opts.debug, near: this.NEAR, blend: this.BLEND, ring, soft: this.SOFT, spread,
      minPx: Math.max(this.MIN_PX, px(this.MIN_IN)), maxPx, contrast: this.CONTRAST,
      speckMax, speckStep: this.SPECK_STEP, speckContrast: this.SPECK_CONTRAST, speckClear, speckClearX: this.SPECK_CLEAR,
      speckMin: Math.max(2, px(this.SPECK_MIN_IN)), flat: this.SPECK_FLAT };
    const palette = this._palette(source);
    // our own copy at the reading size, made first: a JPEG / PNG drawn tile by tile is decoded again for every tile
    // (25 s for a 7762 × 28150 px feather flag), and pdf.js may release its picture bitmap while the tiles are read
    let bmp = null;
    const isCanvas = typeof HTMLCanvasElement !== 'undefined' && source instanceof HTMLCanvasElement;
    if ((k < 1 || !isCanvas) && typeof createImageBitmap === 'function') {
      bmp = await createImageBitmap(source, { resizeWidth: W, resizeHeight: H, resizeQuality: 'high' }).catch(() => null);
    }
    const from = bmp || source, f = bmp ? 1 : 1 / k;
    const url = URL.createObjectURL(new Blob([this.WORKER], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    const found = [], hist = new Float64Array(32768);
    try {
      worker.postMessage({ palette });
      let seq = 0;
      for (let ty = 0; ty < H; ty += T) {
        for (let tx = 0; tx < W; tx += T) {
          if (opts.alive && !opts.alive()) return null;
          const x0 = Math.max(0, tx - pad), y0 = Math.max(0, ty - pad);
          const x1 = Math.min(W, tx + T + pad), y1 = Math.min(H, ty + T + pad), w = x1 - x0, h = y1 - y0;
          cv.width = w; cv.height = h;
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.drawImage(from, x0 * f, y0 * f, w * f, h * f, 0, 0, w, h);
          const buf = g.getImageData(0, 0, w, h).data.buffer;
          const id = ++seq;
          const res = await new Promise((resolve, reject) => {
            worker.onmessage = e => { if (e.data.id === id) resolve(e.data); };
            worker.onerror = e => reject(new Error(e.message || 'worker error'));
            worker.postMessage({ id, w, h, buf, cfg: Object.assign({ own: [tx - x0, ty - y0, tx - x0 + T, ty - y0 + T] }, cfg) }, [buf]);
          });
          // the tile's own part only, for the colour counts (the overlap is counted by its neighbour)
          const share = (Math.min(T, W - tx) * Math.min(T, H - ty)) / (w * h);
          for (let i = 0; i < 32768; i++) if (res.hist[i]) hist[i] += res.hist[i] * share;
          res.marks.forEach(m => found.push(Object.assign(m, { x0: m.x0 + x0, y0: m.y0 + y0, x1: m.x1 + x0, y1: m.y1 + y0 })));
        }
      }
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
      if (bmp) bmp.close();
    }
    // odd colour: a colour covering DESIGN_SQIN elsewhere on the picture is the design's own (a word in a spot colour)
    const key = c => ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    const around = c => {
      let s = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
        const r = (c[0] >> 3) + dr, gg = (c[1] >> 3) + dg, b = (c[2] >> 3) + db;
        if (r >= 0 && gg >= 0 && b >= 0 && r < 32 && gg < 32 && b < 32) s += hist[(r << 10) | (gg << 5) | b];
      }
      return s;
    };
    const odd = found.filter(m => m.kind === 'odd'), own = new Map();
    odd.forEach(m => { const kk = key(m.col); own.set(kk, (own.get(kk) || 0) + m.n); });
    const designPx = this.DESIGN_SQIN * ppi * ppi;
    let marks = found.filter(m => m.ok && (m.kind === 'speck' || around(m.col) - (own.get(key(m.col)) || 0) < designPx));
    // the same spot found as both kinds: once
    marks = marks.filter((m, i) => !(m.kind === 'speck' && marks.some((o, j) => j !== i && o.kind === 'odd'
      && m.x0 <= o.x1 && o.x0 <= m.x1 && m.y0 <= o.y1 && o.y0 <= m.y1)));
    // look-alike groups (colour and size, among ALL the small groups of that kind) close together: a pattern /
    // texture of the design (confetti, polka dots, a distressed print), not strays
    const size = m => Math.max(m.x1 - m.x0, m.y1 - m.y0) + 1, near = this.PATTERN_IN * ppi;
    const alike = (a, b) => a.kind === b.kind && Math.hypot(a.col[0] - b.col[0], a.col[1] - b.col[1], a.col[2] - b.col[2]) <= 30
      && Math.max(size(a), size(b)) <= 2.5 * Math.min(size(a), size(b))
      && Math.abs((a.x0 + a.x1) - (b.x0 + b.x1)) / 2 <= near && Math.abs((a.y0 + a.y1) - (b.y0 + b.y1)) / 2 <= near;
    // (specks: only real ones count — not the slivers letter edges leave)
    marks = marks.filter(m => found.filter(o => alike(m, o) && (o.kind !== 'speck' || o.p1)).length < this.PATTERN);
    // specks: real specks of any colour close together — the design has a texture (a distressed print, grain), a
    // designer does not count its specks
    const close = (a, b) => Math.abs((a.x0 + a.x1) - (b.x0 + b.x1)) / 2 <= near && Math.abs((a.y0 + a.y1) - (b.y0 + b.y1)) / 2 <= near;
    const realSpecks = found.filter(o => o.kind === 'speck' && o.p1);
    marks = marks.filter(m => m.kind !== 'speck' || realSpecks.filter(o => o !== m && close(m, o)).length < this.TEXTURE);
    // and many of them over the whole picture: its style (distressed lettering, a photo's highlights), not strays
    if (realSpecks.length >= this.TEXTURE_ALL) marks = marks.filter(m => m.kind !== 'speck');
    if (opts.debug) return { scale: k, found, marks };
    if (marks.length > this.TOO_MANY) return { marks: [], scale: k, tooMany: marks.length };
    const r1 = v => Math.round(v / k);
    return {
      scale: k,
      marks: marks.map(m => {
        const bw = m.x1 - m.x0 + 1, bh = m.y1 - m.y0 + 1, len = Math.max(bw, bh), thick = m.n / len;
        return {
          kind: len >= 3 * Math.min(bw, bh) && len >= 3 * thick ? 'line' : 'dot', fine: true, speck: m.kind === 'speck',
          x: r1(m.x0), y: r1(m.y0), w: Math.max(1, r1(bw)), h: Math.max(1, r1(bh)), cx: r1((m.x0 + m.x1) / 2), cy: r1((m.y0 + m.y1) / 2),
          lengthPx: Math.max(1, r1(len)), thicknessPx: Math.max(1, r1(thick)), isolationPx: r1(ring), orientation: bw >= bh ? 'horizontal' : 'vertical',
          color: m.col.map(Math.round), contrast: Math.round(m.contrast), confidence: 0.85, onSolidColour: m.uniform >= 0.95, nearPhoto: false,
          inches: { len: +(len / ppi).toFixed(3), thick: +(thick / ppi).toFixed(3) }
        };
      })
    };
  }
};

if (typeof window !== 'undefined') window.FineMarks = FineMarks;
