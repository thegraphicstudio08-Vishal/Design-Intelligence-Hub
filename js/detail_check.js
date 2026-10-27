/**
 * Design Intelligence Hub - True Detail Check (enlarged / blurry pictures)
 *
 * The pixel count only says how many pixels a picture has, not how much detail is in them: a small picture enlarged
 * ("upscaled") to 125 PPI has the pixels but still prints soft. This check measures the picture at its own pixels:
 * the 10–90 % rise width of its sharpest strong edges. A picture made at its size has edges about 1–1.6 px wide; one
 * enlarged k× has edges about k× wider, whatever the PPI number says.
 *
 * Calibrated on the 139 real proofs in C:\Proof and the same files shrunk and enlarged 2×, 3× and 4× (bicubic,
 * Lanczos, JPEG 70): made-at-size files 0.8–1.6 px (sharpest quarter of the edges), 2× ≈ 2.1, 3× ≈ 2.9, 4× ≈ 3.7.
 * Every real file above 1.75 px was a print-preview crop shot (an enlarged screenshot) or a visibly soft photo.
 */
const DetailCheck = {
  TILE: 192,            // native pixels per measured tile
  MAX_TILES: 48,        // tiles with the most edges are measured
  PER_TILE: 400,        // edge points per tile
  CAND: 40,             // gradient (0–255 per 2 px) to start an edge
  MIN_CONTRAST: 48,     // levels between the flat sides of an edge
  REACH: 14,            // px walked each way to the flat sides
  SHARP_MAX: 1.75,      // sharpest-quarter edge width up to this: made at its size
  SOFT_MAX: 2.25,       // above this: enlarged about 2× or more
  MIN_EDGES: 60,        // fewer clean edges than this: not enough detail to judge
  TILE_MIN_EDGES: 12,

  /**
   * @param source HTMLImageElement | ImageBitmap | HTMLCanvasElement, measured at its own (natural) size
   * @returns {{verdict:'sharp'|'soft'|'enlarged'|'unknown', edges:number, p25:number, p50:number, enlarge:number,
   *            w:number, h:number, tiles:Array, partly:boolean, reason?:string}}
   */
  async measure(source) {
    const W = source.naturalWidth || source.width, H = source.naturalHeight || source.height;
    if (!(W >= 64 && H >= 64)) return { verdict: 'unknown', reason: 'The picture is too small to judge its detail.', w: W, h: H, edges: 0, tiles: [] };
    await new Promise(r => setTimeout(r, 0));          // let the page paint "checking…" first

    // 1. Where the detail is: edge energy per tile on a small overview
    const T = Math.min(this.TILE, W, H);
    const cols = Math.max(1, Math.floor(W / T)), rows = Math.max(1, Math.floor(H / T));
    const s = Math.min(1, 768 / Math.max(W, H));
    const ow = Math.max(8, Math.round(W * s)), oh = Math.max(8, Math.round(H * s));
    const ov = this._lum(source, 0, 0, W, H, ow, oh);
    const score = new Float32Array(cols * rows);
    for (let y = 1; y < oh - 1; y++) {
      const cy = Math.min(rows - 1, Math.floor(y / s / T));
      for (let x = 1; x < ow - 1; x++) {
        const i = y * ow + x;
        if (Math.abs(ov[i + 1] - ov[i - 1]) + Math.abs(ov[i + ow] - ov[i - ow]) > 60) score[cy * cols + Math.min(cols - 1, Math.floor(x / s / T))]++;
      }
    }
    const order = [...score.keys()].filter(k => score[k] > 0).sort((a, b) => score[b] - score[a]).slice(0, this.MAX_TILES);

    // 2. The edges, at native pixels
    const all = [], tiles = [];
    for (const k of order) {
      const tx = (k % cols) * T, ty = Math.floor(k / cols) * T;
      const widths = this._tileWidths(this._lum(source, tx, ty, T, T, T, T), T);
      for (const w of widths) all.push(w);
      if (widths.length >= this.TILE_MIN_EDGES) {
        const p = this._pct(widths, 25);
        tiles.push({ x: tx, y: ty, w: T, h: T, p25: +p.toFixed(2), n: widths.length,
          state: p > this.SOFT_MAX ? 'enlarged' : p > this.SHARP_MAX ? 'soft' : 'sharp' });
      }
    }
    if (all.length < this.MIN_EDGES) {
      return { verdict: 'unknown', reason: 'Too few clear edges (flat colours, soft gradients) to judge the detail.', w: W, h: H, edges: all.length, tiles };
    }
    const p25 = this._pct(all, 25), p50 = this._pct(all, 50);
    const verdict = p25 > this.SOFT_MAX ? 'enlarged' : p25 > this.SHARP_MAX ? 'soft' : 'sharp';
    const enlarge = Math.max(1, Math.round((p25 - 0.7) / 0.75 * 10) / 10);
    // sharp text over an enlarged photo: the photo areas still read as enlarged
    const blurTiles = tiles.filter(t => t.state === 'enlarged').length;
    const partly = verdict === 'sharp' && tiles.length >= 6 && blurTiles / tiles.length >= 0.3;
    return { verdict, partly, edges: all.length, p25: +p25.toFixed(2), p50: +p50.toFixed(2), enlarge, w: W, h: H, tiles };
  },

  /** Real detail in PPI: the file's PPI divided by how much the picture was enlarged */
  truePpi(ppi, r) {
    return r && r.verdict !== 'unknown' && ppi ? Math.round(ppi / Math.max(1, r.enlarge)) : null;
  },

  /** One line for a card: what the edges say */
  describe(r, ppi) {
    if (!r || r.verdict === 'unknown') return (r && r.reason) || 'Detail not measured.';
    const real = this.truePpi(ppi, r);
    if (r.verdict === 'enlarged') {
      return `Enlarged picture: the edges are ${r.p25} px wide (a picture made at its size: 1–1.6 px) — it was enlarged about ${r.enlarge}× from a smaller picture${real ? `, so its real detail is about ${real} PPI, not ${Math.round(ppi)}` : ''}.`;
    }
    if (r.verdict === 'soft') {
      return `Soft picture: the edges are ${r.p25} px wide (made at its size: 1–1.6 px) — possibly enlarged about ${r.enlarge}×${real ? ` (real detail about ${real} PPI)` : ''}.`;
    }
    return r.partly
      ? `Sharp edges overall (${r.p25} px), but ${r.tiles.filter(t => t.state === 'enlarged').length} of ${r.tiles.length} detailed areas look enlarged (a sharp text layer over an enlarged photo?).`
      : `Sharp: the edges are ${r.p25} px wide — the picture has the detail its pixels promise.`;
  },

  _pct(arr, p) {
    const a = Float64Array.from(arr).sort();
    const i = (a.length - 1) * p / 100, lo = Math.floor(i), hi = Math.ceil(i);
    return a[lo] + (a[hi] - a[lo]) * (i - lo);
  },

  /** Luminance of a region drawn at dw × dh; transparent parts over mid grey, so white and black artwork both show edges */
  _lum(source, sx, sy, sw, sh, dw, dh) {
    const c = this._cv || (this._cv = document.createElement('canvas'));
    c.width = dw; c.height = dh;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#808080'; x.fillRect(0, 0, dw, dh);
    x.imageSmoothingEnabled = dw !== sw || dh !== sh;
    x.imageSmoothingQuality = 'high';
    x.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
    const d = x.getImageData(0, 0, dw, dh).data, L = new Float32Array(dw * dh);
    for (let i = 0, j = 0; i < L.length; i++, j += 4) L[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return L;
  },

  /** 10–90 % rise widths of the clean, strong edges in one T × T luminance tile */
  _tileWidths(g, T) {
    const R = this.REACH, M = R + 1, prof = new Float32Array(2 * R + 3), out = [];
    const gx = i => g[i + 1] - g[i - 1], gy = i => g[i + T] - g[i - T];
    const cand = [];
    for (let y = 1; y < T - 1; y++) for (let x = 1; x < T - 1; x++) {
      const i = y * T + x;
      if (Math.abs(gx(i)) + Math.abs(gy(i)) > this.CAND) cand.push(i);
    }
    const step = Math.max(1, cand.length / this.PER_TILE);
    for (let k = 0; k < cand.length; k += step) {
      const i = cand[Math.floor(k)], x = i % T, y = (i - x) / T;
      const ax = Math.abs(gx(i)), ay = Math.abs(gy(i));
      if (ax > 2.5 * ay) {                                   // mostly vertical edge: profile across the row
        if (x - M < 1 || x + M >= T - 1) continue;
        if (ax < Math.abs(gx(i - 1)) || ax < Math.abs(gx(i + 1))) continue;       // gradient peak only
        for (let t = 0; t < prof.length; t++) prof[t] = g[i - M + t];
      } else if (ay > 2.5 * ax) {
        if (y - M < 1 || y + M >= T - 1) continue;
        if (ay < Math.abs(gy(i - T)) || ay < Math.abs(gy(i + T))) continue;
        for (let t = 0; t < prof.length; t++) prof[t] = g[i + (t - M) * T];
      } else continue;
      const w = this._rise(prof, M);
      if (w) out.push(w);
    }
    return out;
  },

  _rise(p, c) {
    const n = p.length, R = this.REACH;
    const sg = p[Math.min(n - 1, c + 1)] >= p[Math.max(0, c - 1)] ? 1 : -1, q = i => sg * p[i];
    let lo = c, hi = c;
    while (lo > 0 && q(lo - 1) < q(lo) - 0.5 && c - lo < R) lo--;
    while (hi < n - 1 && q(hi + 1) > q(hi) + 0.5 && hi - c < R) hi++;
    const a = q(lo), b = q(hi);
    if (b - a < this.MIN_CONTRAST || lo === 0 || hi === n - 1) return 0;
    const cross = t => {
      for (let i = lo; i < hi; i++) if (q(i) <= t && t <= q(i + 1)) return i + (t - q(i)) / Math.max(1e-6, q(i + 1) - q(i));
      return null;
    };
    const x10 = cross(a + 0.1 * (b - a)), x90 = cross(a + 0.9 * (b - a));
    return x10 === null || x90 === null ? 0 : x90 - x10;
  }
};
