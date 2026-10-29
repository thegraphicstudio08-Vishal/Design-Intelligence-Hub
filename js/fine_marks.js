/**
 * Design Intelligence Hub - small stray marks at full size
 *
 * Team request, Oct 2026 (US2425331): two hairlines, 0.12" × 0.016", under the "M" of a 57" × 88.5" banner were not
 * found. The Lines & Dots check reads the artwork at 2000 px — a 7125 × 11063 px picture shrinks ×5.5 and the lines
 * are gone — and keeps away from the edges of letters and shapes (that protects i-dots and fine letter parts), while
 * this mark sits 0.07" below a letter.
 * This pass reads the picture near its own size, tile by tile (the tiles are analysed in a background worker, the
 * page keeps running), and looks for small marks in a colour the design does not use:
 *  · design colours = the colours the picture is made of (a 4-bit colour covering ≥ 0.15 % of it), and every blend
 *    of two of them — the soft edge between a letter and its background, a gradient
 *  · a mark = a small group of pixels of another colour (at most 0.5"), standing on ONE plain design colour (its ring
 *    of pixels is one colour, nothing else foreign around) — a colour fringe along a letter edge touches two colours
 *  · a colour that covers more than 0.05 sq in elsewhere is the design's own (a small word in a spot colour), and
 *    six or more look-alike marks are a pattern (stars, confetti); more than 24 → a texture / photo: none reported
 * Marks come back in the source's own pixels, in the Lines & Dots mark format.
 */
const FineMarks = {
  SIDE: 8000,              // read at most 8000 px on the long side …
  MP: 48e6,                // … and 48 megapixels
  TILE: 1024,              // tile size (px at the read size)
  SHARE: 0.0015,           // a colour covering 0.15 % of the picture is a design colour
  NEAR: 40,                // RGB distance: within it of a design colour = that colour
  BLEND: 26,               // within it of a blend of two design colours = a soft edge / gradient
  MAX_IN: 0.5,             // a mark is at most 0.5" across …
  MIN_IN: 0.04,            // … and at least 0.04" (1 mm) long — a smaller speck does not show at print size
  MIN_PX: 3,               // (and 3 px at the read size, 4 px in all)
  RING_IN: 0.03,           // ring around a mark: 0.03" (3 px at least; the pixels touching it are its border)
  CONTRAST: 45,            // RGB distance between a mark and its ring (a shade in a photo / gradient is less)
  SOFT: 0.6,               // the pixels touching a mark at more than 60 % of its contrast: a soft glow, not a mark
  SPREAD_IN: 0.3,          // three other odd-coloured groups within 0.3": splatter / a distressed texture
  DESIGN_SQIN: 0.05,       // a colour covering 0.05 sq in elsewhere on the picture is the design's own
  PATTERN: 6,              // look-alike marks from which they are a pattern of the design
  TOO_MANY: 24,            // more marks than this: texture / photo detail, nothing reported

  // the tile analysis, in the worker: foreign pixels → groups → the ring test; the tile's colour counts come back too
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
onmessage = e => {
  const m = e.data;
  if (m.palette) { pal = m.palette; memo = new Uint8Array(32768); return; }
  const { id, w, h, cfg } = m, d = new Uint8ClampedArray(m.buf), N = w * h;
  const hist = new Uint32Array(32768), fg = new Uint8Array(N);
  for (let p = 0, o = 0; p < N; p++, o += 4) {
    if (d[o + 3] < 128) continue;
    const k = ((d[o] >> 3) << 10) | ((d[o + 1] >> 3) << 5) | (d[o + 2] >> 3);
    hist[k]++;
    let v = memo[k];
    if (!v) v = memo[k] = isDesign([(d[o] & 248) + 4, (d[o + 1] & 248) + 4, (d[o + 2] & 248) + 4], cfg.near, cfg.blend) ? 2 : 1;
    if (v === 1) fg[p] = 1;
  }
  // every group of foreign pixels first (8-connected), then each small one judged with all its neighbours known
  const lab = new Int32Array(N), st = new Int32Array(N), groups = [], out = [];
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
    groups.push({ gid, n, x0, y0, x1, y1, sr, sg, sb });
  }
  for (const gr of groups) {
    const { gid, n, x0, y0, x1, y1 } = gr;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (n < 3 || Math.max(bw, bh) > cfg.maxPx) continue;
    if (cx < cfg.own[0] || cy < cfg.own[1] || cx >= cfg.own[2] || cy >= cfg.own[3]) continue;   // the neighbour tile's
    // every small group goes back (for the pattern count: look-alikes among ALL of them); "ok" = a mark
    const small = { x0, y0, x1, y1, n, col: [gr.sr / n, gr.sg / n, gr.sb / n], ok: false };
    if (out.length < 6000) out.push(small);
    if (n < 4 || Math.max(bw, bh) < cfg.minPx) continue;
    // around it: the border (pixels touching it) and the ring beyond — the ring one plain design colour, nothing else
    // foreign in it
    const R = cfg.ring, rx0 = Math.max(0, x0 - R), ry0 = Math.max(0, y0 - R), rx1 = Math.min(w - 1, x1 + R), ry1 = Math.min(h - 1, y1 + R);
    const touches = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && lab[yy * w + xx] === gid) return true;
      }
      return false;
    };
    let rn = 0, rf = 0, rr = 0, rg = 0, rb = 0, bn = 0, br = 0, bg2 = 0, bb = 0;
    const ringPx = [], borderPx = [];
    for (let y = ry0; y <= ry1; y++) for (let x = rx0; x <= rx1; x++) {
      const r = y * w + x, o = r * 4;
      if (lab[r] === gid) continue;
      if (touches(x, y)) { bn++; br += d[o]; bg2 += d[o + 1]; bb += d[o + 2]; borderPx.push(o); continue; }
      rn++;
      if (fg[r]) { rf++; continue; }
      rr += d[o]; rg += d[o + 1]; rb += d[o + 2]; ringPx.push(o);
    }
    if (!ringPx.length || rf > 0.08 * rn) continue;
    const ring = [rr / ringPx.length, rg / ringPx.length, rb / ringPx.length];
    let same = 0;
    ringPx.forEach(o => { if (dist([d[o], d[o + 1], d[o + 2]], ring) <= cfg.near) same++; });
    const uniform = same / rn;
    if (uniform < 0.85) continue;
    const col = small.col;
    if (dist(col, ring) < cfg.contrast) continue;              // a shade in a picture / gradient, not a mark
    // a crisp edge: the pixels touching it are already close to the background — the core of a soft glow / shading
    // fades out over several pixels
    if (bn && dist([br / bn, bg2 / bn, bb / bn], ring) > cfg.soft * dist(col, ring)) continue;
    // alone on the background: every pixel touching it is a blend of the mark and the background — a piece of the
    // artwork (a letter's serif tip, a feather's quill in another shade) touches the rest of its shape
    const cr = [ring[0] - col[0], ring[1] - col[1], ring[2] - col[2]], L = cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2] || 1;
    let off = 0;
    borderPx.forEach(o => {
      const t = Math.max(0, Math.min(1, ((d[o] - col[0]) * cr[0] + (d[o + 1] - col[1]) * cr[1] + (d[o + 2] - col[2]) * cr[2]) / L));
      if (dist([d[o], d[o + 1], d[o + 2]], [col[0] + t * cr[0], col[1] + t * cr[1], col[2] + t * cr[2]]) > cfg.blend) off++;
    });
    if (off > 0.1 * borderPx.length) continue;
    // three or more other odd-coloured groups close by: splatter / a distressed texture of the design
    const S = cfg.spread, others = new Set();
    for (let y = Math.max(0, y0 - S); y <= Math.min(h - 1, y1 + S); y++) for (let x = Math.max(0, x0 - S); x <= Math.min(w - 1, x1 + S); x++) {
      const l = lab[y * w + x];
      if (l && l !== gid) others.add(l);
    }
    if (others.size >= 3) continue;
    Object.assign(small, { ring, uniform, ok: true });
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
    const k = Math.min(1, this.SIDE / Math.max(W0, H0), Math.sqrt(this.MP / (W0 * H0)));
    const W = Math.round(W0 * k), H = Math.round(H0 * k);
    const ppi = (opts.pxPerIn > 0 ? opts.pxPerIn : Math.max(W0, H0) / 48) * k;   // read-size pixels per inch
    const maxPx = Math.max(8, Math.round(this.MAX_IN * ppi)), ring = Math.max(3, Math.round(this.RING_IN * ppi));
    const spread = Math.max(6, Math.round(this.SPREAD_IN * ppi));
    const pad = Math.max(maxPx + ring, spread) + 2, T = this.TILE;
    const minPx = Math.max(this.MIN_PX, Math.round(this.MIN_IN * ppi));
    const cfg = { near: this.NEAR, blend: this.BLEND, minPx, maxPx, ring, contrast: this.CONTRAST, soft: this.SOFT, spread };
    const palette = this._palette(source);
    // decoded once at the reading size: a large JPEG drawn tile by tile is decoded again for every tile (25 s for a
    // 7762 × 28150 px feather flag)
    let bmp = null;
    if (typeof createImageBitmap === 'function') {
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
    // a colour covering DESIGN_SQIN elsewhere on the picture is the design's own (a small word in a spot colour)
    const key = c => ((c[0] >> 3) << 10) | ((c[1] >> 3) << 5) | (c[2] >> 3);
    const around = c => {
      let s = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
        const r = (c[0] >> 3) + dr, gg = (c[1] >> 3) + dg, b = (c[2] >> 3) + db;
        if (r >= 0 && gg >= 0 && b >= 0 && r < 32 && gg < 32 && b < 32) s += hist[(r << 10) | (gg << 5) | b];
      }
      return s;
    };
    const own = new Map();
    found.forEach(m => { const kk = key(m.col); own.set(kk, (own.get(kk) || 0) + m.n); });
    const designPx = this.DESIGN_SQIN * ppi * ppi;
    let marks = found.filter(m => m.ok && around(m.col) - (own.get(key(m.col)) || 0) < designPx);
    // look-alike specks (colour and size) — counted among ALL the small odd-coloured groups, marks or not: six or
    // more are a pattern / texture of the design (confetti, a distressed print), not strays
    const size = m => Math.max(m.x1 - m.x0, m.y1 - m.y0) + 1;
    const alike = (a, b) => Math.hypot(a.col[0] - b.col[0], a.col[1] - b.col[1], a.col[2] - b.col[2]) <= 30
      && Math.max(size(a), size(b)) <= 2.5 * Math.min(size(a), size(b));
    marks = marks.filter(m => found.filter(o => alike(m, o)).length < this.PATTERN);
    if (marks.length > this.TOO_MANY) return { marks: [], scale: k, tooMany: marks.length };
    const r1 = v => Math.round(v / k);
    return {
      scale: k,
      marks: marks.map(m => {
        const bw = m.x1 - m.x0 + 1, bh = m.y1 - m.y0 + 1, len = Math.max(bw, bh), thick = m.n / len;
        const col = m.col.map(Math.round), contrast = Math.round(Math.hypot(m.col[0] - m.ring[0], m.col[1] - m.ring[1], m.col[2] - m.ring[2]));
        return {
          kind: len >= 3 * Math.min(bw, bh) && len >= 3 * thick ? 'line' : 'dot', fine: true,
          x: r1(m.x0), y: r1(m.y0), w: Math.max(1, r1(bw)), h: Math.max(1, r1(bh)), cx: r1((m.x0 + m.x1) / 2), cy: r1((m.y0 + m.y1) / 2),
          lengthPx: r1(len), thicknessPx: Math.max(1, r1(thick)), isolationPx: r1(ring), orientation: bw >= bh ? 'horizontal' : 'vertical',
          color: col, contrast, confidence: 0.85, onSolidColour: m.uniform >= 0.95, nearPhoto: false,
          inches: { len: +(len / ppi).toFixed(2), thick: +(thick / ppi).toFixed(3) }
        };
      })
    };
  }
};

if (typeof window !== 'undefined') window.FineMarks = FineMarks;
