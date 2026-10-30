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
  // 3. stray line in a solid area (read on a copy of at most LINE_SIDE px, in large tiles: a long stroke fits whole)
  LINE_SIDE: 4000,
  LINE_MIN_IN: 0.12,       // 0.12" – 4" long …
  LINE_MAX_IN: 4,
  LINE_THICK_IN: 0.12,     // … and at most 0.12" thick (3 mm: a short smudged stroke too)
  RULE_MIN_IN: 0.75,       // a ruler-straight horizontal / vertical line from 0.75" long is a design rule / underline

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
  const T2 = 24 * 24, S2 = cfg.speckStep * cfg.speckStep;
  // the lines pass (a smaller copy, larger tiles: a long stroke fits whole) runs kind 3 only, the full-size pass 1 + 2
  if (cfg.mode !== 'lines') {
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
  } else {
  // 3. stray line in a solid area: a thin stroke of any colour across a flat fill (a scratch, a stray pen line) —
  // pixels unlike the solid colour of their 32 px block. The block's colour is its MAJORITY (the median of 64 samples,
  // refined), not its average: a stroke near a shape's edge still has the fill it crosses as its block's colour
  const B2 = 32, bw2 = Math.ceil(w / B2), bh2 = Math.ceil(h / B2), ref2 = new Float32Array(bw2 * bh2 * 3), flat2 = new Uint8Array(bw2 * bh2);
  const med = a => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
  for (let by = 0; by < bh2; by++) for (let bx = 0; bx < bw2; bx++) {
    const xa = bx * B2, ya = by * B2, xb = Math.min(w, xa + B2), yb = Math.min(h, ya + B2);
    const sr = [], sg = [], sb = [], sx = Math.max(1, (xb - xa) >> 3), sy = Math.max(1, (yb - ya) >> 3);
    for (let y = ya; y < yb; y += sy) for (let x = xa; x < xb; x += sx) { const o = (y * w + x) * 4; sr.push(d[o]); sg.push(d[o + 1]); sb.push(d[o + 2]); }
    const mr = med(sr), mg = med(sg), mb = med(sb);
    let n = 0, k = 0, r = 0, g = 0, b = 0;
    for (let y = ya; y < yb; y++) for (let o = (y * w + xa) * 4, oe = (y * w + xb) * 4; o < oe; o += 4) {
      n++;
      const er = d[o] - mr, eg = d[o + 1] - mg, eb = d[o + 2] - mb;
      if (er * er + eg * eg + eb * eb <= T2) { k++; r += d[o]; g += d[o + 1]; b += d[o + 2]; }
    }
    const i = by * bw2 + bx;
    if (k >= 0.6 * n) { flat2[i] = 1; ref2[i * 3] = r / k; ref2[i * 3 + 1] = g / k; ref2[i * 3 + 2] = b / k; }
  }
  const ln = new Uint8Array(N);
  for (let y = 0; y < h; y++) {
    const row = ((y / B2) | 0) * bw2;
    for (let x = 0; x < w; x++) {
      const i = row + ((x / B2) | 0);
      if (!flat2[i]) continue;
      const o = (y * w + x) * 4, er = d[o] - ref2[i * 3], eg = d[o + 1] - ref2[i * 3 + 1], eb = d[o + 2] - ref2[i * 3 + 2];
      if (er * er + eg * eg + eb * eb >= S2) ln[y * w + x] = 1;
    }
  }
  const Lg = label(ln, d, w, h), dmin = new Uint8Array(N), stamp = new Int32Array(N);
  for (const g of Lg.groups) {
    if (!own(g) || g.n < 12) continue;
    const gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1, len = Math.hypot(gw, gh), thick = g.n / len;
    // a line: at least 4× longer than it is thick (a round blob — an i-dot, a photo highlight — is not one)
    if (len < cfg.lineMin || len > cfg.lineMax || thick > cfg.lineThick || size(g) <= cfg.speckMax || len < 4 * thick) continue;
    // its shape: the principal axis of its pixels — a straight horizontal / vertical rule is the design's (an
    // underline, a divider); a stray stroke is curved or at an odd angle
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) {
      if (Lg.lab[y * w + x] !== g.gid) continue;
      sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
    }
    const mx = sx / g.n, my = sy / g.n, cxx = sxx / g.n - mx * mx, cyy = syy / g.n - my * my, cxy = sxy / g.n - mx * my;
    const tr = cxx + cyy, det = cxx * cyy - cxy * cxy, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const minorSd = Math.sqrt(Math.max(0, tr / 2 - disc)), ang = Math.abs(Math.atan2(2 * cxy, cxx - cyy) / 2 * 180 / Math.PI);
    // (a design's rule is long and ruler-straight; a short stroke is a stroke even when it stands upright)
    const straight = minorSd <= 0.4 * thick + 0.5 && len >= cfg.ruleMin, onAxis = ang <= 3 || ang >= 87;
    const majorSd = Math.sqrt(Math.max(0, tr / 2 + disc)), spread2 = majorSd ? minorSd / majorSd : 1;
    // how freehand it is: its pixels against the smooth curve (a parabola along its axis) that fits them best —
    // a design's arc / swoosh follows one smoothly (≈ 1), a hand stroke wobbles and hooks (more)
    const th = Math.atan2(2 * cxy, cxx - cyy) / 2, cs = Math.cos(th), sn = Math.sin(th);
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    const us = [], vs = [];
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) {
      if (Lg.lab[y * w + x] !== g.gid) continue;
      const u = (x - mx) * cs + (y - my) * sn, v = -(x - mx) * sn + (y - my) * cs;
      us.push(u); vs.push(v);
      s0++; s1 += u; s2 += u * u; s3 += u * u * u; s4 += u * u * u * u; t0 += v; t1 += u * v; t2 += u * u * v;
    }
    // normal equations for v = a·u² + b·u + c
    const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]], Y = [t2, t1, t0];
    const det3 = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det3(M);
    let fit = 99;
    if (Math.abs(D) > 1e-9) {
      const col = (m, c) => m.map((r, i) => r.map((v, j) => j === c ? Y[i] : v));
      const A2 = det3(col(M, 0)) / D, B1 = det3(col(M, 1)) / D, C0 = det3(col(M, 2)) / D;
      let se = 0;
      for (let i = 0; i < us.length; i++) { const e = vs[i] - (A2 * us[i] * us[i] + B1 * us[i] + C0); se += e * e; }
      fit = Math.sqrt(se / us.length) / Math.max(0.5, thick / Math.sqrt(12));
    }
    const small = { kind: 'line', x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, n: g.n, col: g.col, len, thick, ang, fit, ok: false };
    if (out.length < 6000) out.push(small);
    if (straight && onAxis) { small.why = 'straight rule'; continue; }
    // one line runs one way: a cross / star / sparkle / loop spreads both ways (its pixels' minor spread is large)
    if (spread2 >= 0.35) { small.why = 'a cross / star / loop shape, not a line'; continue; }
    // around it, pixel by pixel along the stroke (not its box — a diagonal stroke's box holds other artwork): the
    // border (touching) and the ring up to R
    const R = cfg.ring, border = [], ring = [];
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) {
      if (Lg.lab[y * w + x] !== g.gid) continue;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const r = yy * w + xx;
        if (Lg.lab[r] === g.gid) continue;
        const dd = Math.max(Math.abs(dx), Math.abs(dy));
        if (stamp[r] !== g.gid) { stamp[r] = g.gid; dmin[r] = dd; (dd <= 1 ? border : ring).push(r); }
        else if (dd < dmin[r]) dmin[r] = dd;
      }
    }
    const bord = border.concat(ring.filter(r => dmin[r] <= 1)), rng = ring.filter(r => dmin[r] > 1);
    let rf = 0, rr = 0, rg = 0, rb = 0, rk = 0;
    rng.forEach(r => { if (ln[r]) { rf++; return; } const o = r * 4; rr += d[o]; rg += d[o + 1]; rb += d[o + 2]; rk++; });
    if (!rk || rf > 0.08 * rng.length) { small.why = 'something odd around it'; continue; }
    const rc = [rr / rk, rg / rk, rb / rk];
    let same = 0;
    rng.forEach(r => { if (ln[r]) return; const o = r * 4; if (dist([d[o], d[o + 1], d[o + 2]], rc) <= cfg.near) same++; });
    const uniform = same / rng.length, contrast = dist(g.col, rc);
    if (uniform < 0.85 || contrast < cfg.lineContrast) { small.why = 'not on one plain colour / low contrast'; continue; }
    let br = 0, bg2 = 0, bb = 0, off = 0;
    const col = g.col, cr = [rc[0] - col[0], rc[1] - col[1], rc[2] - col[2]], L = cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2] || 1;
    bord.forEach(r => {
      const o = r * 4; br += d[o]; bg2 += d[o + 1]; bb += d[o + 2];
      const t = Math.max(0, Math.min(1, ((d[o] - col[0]) * cr[0] + (d[o + 1] - col[1]) * cr[1] + (d[o + 2] - col[2]) * cr[2]) / L));
      if (dist([d[o], d[o + 1], d[o + 2]], [col[0] + t * cr[0], col[1] + t * cr[1], col[2] + t * cr[2]]) > cfg.blend) off++;
    });
    if (bord.length && dist([br / bord.length, bg2 / bord.length, bb / bord.length], rc) > cfg.soft * contrast) { small.why = 'soft'; continue; }
    if (off > 0.1 * bord.length) { small.why = 'touches other artwork'; continue; }
    // the colour of a large area right next to it (within 0.5"): a gap / counter of a letter or shape showing the fill
    // beyond (the slit of a "G"), not a stroke of its own
    const Wn = cfg.gapWin, wx0 = Math.max(0, g.x0 - Wn), wy0 = Math.max(0, g.y0 - Wn), wx1 = Math.min(w - 1, g.x1 + Wn), wy1 = Math.min(h - 1, g.y1 + Wn);
    let wt = 0, ws = 0;
    for (let y = wy0; y <= wy1; y += 2) for (let x = wx0; x <= wx1; x += 2) {
      const r = y * w + x;
      if (Lg.lab[r] === g.gid || (stamp[r] === g.gid && dmin[r] <= 1)) continue;
      wt++;
      const o = r * 4; if (dist([d[o], d[o + 1], d[o + 2]], col) <= 30) ws++;
    }
    if (wt && ws >= 0.2 * wt) { small.why = 'a gap showing the fill next to it'; continue; }
    // a thin outline / keyline of a nearby shape: its colour is a half-way blend of the background and that shape's
    // colour (the soft edge of a thin outline) — a stroke of its own has a full-strength colour
    const near5 = new Map();
    for (let y = wy0; y <= wy1; y += 2) for (let x = wx0; x <= wx1; x += 2) {
      const r = y * w + x;
      if (Lg.lab[r] === g.gid || (stamp[r] === g.gid && dmin[r] <= 1)) continue;
      const o = r * 4, kq = ((d[o] >> 4) << 8) | ((d[o + 1] >> 4) << 4) | (d[o + 2] >> 4), e = near5.get(kq) || [0, 0, 0, 0];
      e[0]++; e[1] += d[o]; e[2] += d[o + 1]; e[3] += d[o + 2]; near5.set(kq, e);
    }
    let outline = false;
    near5.forEach(e => {
      if (outline || e[0] < 0.05 * wt) return;
      const q = [e[1] / e[0], e[2] / e[0], e[3] / e[0]];
      if (dist(q, rc) <= cfg.near) return;
      const ab = [q[0] - rc[0], q[1] - rc[1], q[2] - rc[2]], LL = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      const t = ((col[0] - rc[0]) * ab[0] + (col[1] - rc[1]) * ab[1] + (col[2] - rc[2]) * ab[2]) / LL;
      if (t >= 0.15 && t <= 0.85 && dist(col, [rc[0] + t * ab[0], rc[1] + t * ab[1], rc[2] + t * ab[2]]) <= cfg.blend) outline = true;
    });
    if (outline) { small.why = 'a thin outline of a nearby shape'; continue; }
    // a flat fill around it (a vector fill, not a photo / painted area): ring pixels within 16 of its colour
    const F2L = cfg.flat * cfg.flat;
    let fl = 0;
    rng.forEach(r => { const o = r * 4, er = d[o] - rc[0], eg = d[o + 1] - rc[1], eb = d[o + 2] - rc[2]; if (er * er + eg * eg + eb * eb <= F2L) fl++; });
    if (fl < 0.9 * rng.length) { small.why = 'not a flat fill around it (photo / painted)'; continue; }
    // it follows a shape's edge at a steady distance (an outline, an inline, a pinstripe, an arc along circular text):
    // the design's — a stray stroke crosses open space. Distance from points along it to the nearest other artwork
    const px = [];
    for (let y = g.y0; y <= g.y1; y++) for (let x = g.x0; x <= g.x1; x++) if (Lg.lab[y * w + x] === g.gid) px.push([x, y, (x - mx) * cs + (y - my) * sn]);
    px.sort((p, q) => p[2] - q[2]);
    const DW = cfg.contourWin, N2 = cfg.near * cfg.near, dists = [];
    const reach = (qx, qy) => {
      for (let rr = 2; rr <= DW; rr++) {
        for (let k = -rr; k <= rr; k++) for (const [ex, ey] of [[qx + k, qy - rr], [qx + k, qy + rr], [qx - rr, qy + k], [qx + rr, qy + k]]) {
          if (ex < 0 || ey < 0 || ex >= w || ey >= h) continue;
          const r = ey * w + ex;
          if (Lg.lab[r] === g.gid || (stamp[r] === g.gid && dmin[r] <= 1)) continue;
          const o = r * 4, er = d[o] - rc[0], eg = d[o + 1] - rc[1], eb = d[o + 2] - rc[2];
          if (er * er + eg * eg + eb * eb > N2) return rr;
        }
      }
      return -1;
    };
    // where it goes, as a designer looks at it: a design's line belongs to something — it runs on into the artwork
    // (the arc lettering sits on, a keyline that carries on round a letter) or hugs it (a keyline beside an outline,
    // a sliver in a letter's counter); a stray stroke floats in the open fill with nothing at its ends or sides
    const e0 = reach(px[0][0], px[0][1]), e1 = reach(px[px.length - 1][0], px[px.length - 1][1]);
    // (still a line the design draws: it counts with the others for motifs and the design's style)
    if ((e0 > 0 && e0 <= cfg.endWin) || (e1 > 0 && e1 <= cfg.endWin)) { small.why = 'runs on into the artwork (part of the design)'; small.design = true; continue; }
    for (let s = 1; s <= 16; s++) {
      const hit = reach(...px[Math.min(px.length - 1, Math.floor(s * px.length / 17))]);
      if (hit > 0) dists.push(hit);
    }
    if (dists.filter(v => v <= cfg.sideWin).length >= 4) { small.why = 'runs close beside the artwork (keyline / inline)'; small.design = true; continue; }
    if (dists.length >= 12) {
      const lo = Math.min(...dists), hi = Math.max(...dists), mean = dists.reduce((a, b) => a + b, 0) / dists.length;
      if (hi - lo <= Math.max(3, 0.5 * mean)) { small.why = 'follows the edge of a shape (outline / pinstripe)'; continue; }
    }
    Object.assign(small, { ring: rc, uniform, contrast, ok: true });
  }
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

  /** Cut-line magenta (CMYK 0/100/0/0 ≈ 236, 0, 140) or its blend with the colour under it: hue 295°–340° */
  cutColour(c) {
    const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), ch = mx - mn;
    return ch >= 50 && r >= 120 && g === mn && b - g >= 0.33 * (r - g) && b <= r + 0.15 * ch;
  },

  /** A die-cut product (decal, sticker, cut-out, contour cut) by its file / product name */
  isDieCut(name) {
    return /die[\s_-]?cut|decal|sticker|cut[\s_-]?out|contour|kiss[\s_-]?cut/i.test(name || '');
  },

  /**
   * Small stray marks of a picture at (near) its own size.
   * @param source image / canvas / ImageBitmap
   * @param opts { pxPerIn: the picture's pixels per printed inch, alive(): false stops it, dieCut: a die-cut product
   *   (its magenta cut line is not a mark) }
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
    // one pass: the picture (src drawn ×sf) read in TT px tiles with PP px of overlap; finds in this pass's pixels
    let seq = 0;
    const pass = async (src, sf, PW, PH, TT, PP, pcfg, onRes) => {
      for (let ty = 0; ty < PH; ty += TT) {
        for (let tx = 0; tx < PW; tx += TT) {
          if (opts.alive && !opts.alive()) return false;
          const x0 = Math.max(0, tx - PP), y0 = Math.max(0, ty - PP);
          const x1 = Math.min(PW, tx + TT + PP), y1 = Math.min(PH, ty + TT + PP), w = x1 - x0, h = y1 - y0;
          cv.width = w; cv.height = h;
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.drawImage(src, x0 * sf, y0 * sf, w * sf, h * sf, 0, 0, w, h);
          const buf = g.getImageData(0, 0, w, h).data.buffer;
          const id = ++seq;
          const res = await new Promise((resolve, reject) => {
            worker.onmessage = e => { if (e.data.id === id) resolve(e.data); };
            worker.onerror = e => reject(new Error(e.message || 'worker error'));
            worker.postMessage({ id, w, h, buf, cfg: Object.assign({ own: [tx - x0, ty - y0, tx - x0 + TT, ty - y0 + TT] }, pcfg) }, [buf]);
          });
          onRes(res, x0, y0, (Math.min(TT, PW - tx) * Math.min(TT, PH - ty)) / (w * h));
          res.marks.forEach(m => Object.assign(m, { x0: m.x0 + x0, y0: m.y0 + y0, x1: m.x1 + x0, y1: m.y1 + y0 }));
        }
      }
      return true;
    };
    try {
      worker.postMessage({ palette });
      // 1 + 2 at the reading size (odd colour, specks)
      const done = await pass(from, f, W, H, T, pad, cfg, (res, x0, y0, share) => {
        // the tile's own part only, for the colour counts (the overlap is counted by its neighbour)
        for (let i = 0; i < 32768; i++) if (res.hist[i]) hist[i] += res.hist[i] * share;
        res.marks.forEach(m => found.push(m));
      });
      if (!done) return null;
      // 3 stray lines in a solid area: a smaller copy (≤ LINE_SIDE px) in larger tiles, so a long stroke fits whole
      const kL = Math.min(k, this.LINE_SIDE / Math.max(W0, H0)), WL = Math.round(W0 * kL), HL = Math.round(H0 * kL);
      const ppiL = ppi * kL / k, pxL = v => Math.round(v * ppiL);
      const lineMax = Math.max(20, pxL(this.LINE_MAX_IN)), ringL = Math.max(2, pxL(this.RING_IN));
      const lcfg = { mode: 'lines', near: this.NEAR, blend: this.BLEND, ring: ringL, soft: this.SOFT, contrast: this.CONTRAST,
        speckStep: this.SPECK_STEP, speckMax: Math.max(2, pxL(this.SPECK_MAX_IN)),
        lineMin: Math.max(6, pxL(this.LINE_MIN_IN)), lineMax, lineThick: Math.max(2, pxL(this.LINE_THICK_IN)),
        ruleMin: Math.max(12, pxL(this.RULE_MIN_IN)), gapWin: Math.max(8, pxL(0.5)), flat: this.SPECK_FLAT,
        contourWin: Math.max(6, pxL(0.3)), endWin: Math.max(4, pxL(0.2)), sideWin: Math.max(3, pxL(0.1)), lineContrast: 60 };
      let lbmp = null;
      if (typeof createImageBitmap === 'function') lbmp = await createImageBitmap(from, { resizeWidth: WL, resizeHeight: HL, resizeQuality: 'high' }).catch(() => null);
      const toRead = k / kL;                                   // lines-pass pixels → reading-size pixels
      const lines = [];
      const okL = await pass(lbmp || from, lbmp ? 1 : (bmp ? W / WL : 1 / kL), WL, HL, 2048, lineMax + ringL + 2, lcfg,
        res => res.marks.forEach(m => lines.push(m)));
      if (lbmp) lbmp.close();
      if (!okL) return null;
      lines.forEach(m => found.push(Object.assign(m, { x0: m.x0 * toRead, y0: m.y0 * toRead, x1: m.x1 * toRead, y1: m.y1 * toRead,
        n: m.n * toRead * toRead, len: m.len * toRead, thick: m.thick * toRead })));
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
    let marks = found.filter(m => m.ok && (m.kind !== 'odd' || around(m.col) - (own.get(key(m.col)) || 0) < designPx));
    // lines: a design draws its lines in pairs and copies — one mirrored across the middle, or the same line in the
    // other half of a two-up layout, is the design's; a stray stroke has no twin
    const tol = Math.max(0.5 * ppi, 0.02 * Math.max(W, H)), cxOf = m => (m.x0 + m.x1) / 2, cyOf = m => (m.y0 + m.y1) / 2;
    const twin = (a, b) => b !== a && b.kind === 'line' && Math.max(a.len, b.len) <= 1.25 * Math.min(a.len, b.len)
      && Math.hypot(a.col[0] - b.col[0], a.col[1] - b.col[1], a.col[2] - b.col[2]) <= 30 && (
        (Math.abs(cxOf(b) - (W - cxOf(a))) <= tol && Math.abs(cyOf(b) - cyOf(a)) <= tol)
        || (Math.abs(cyOf(b) - (H - cyOf(a))) <= tol && Math.abs(cxOf(b) - cxOf(a)) <= tol)
        || (Math.abs(Math.abs(cxOf(b) - cxOf(a)) - W / 2) <= tol && Math.abs(cyOf(b) - cyOf(a)) <= tol)
        || (Math.abs(Math.abs(cyOf(b) - cyOf(a)) - H / 2) <= tol && Math.abs(cxOf(b) - cxOf(a)) <= tol));
    const allLines = found.filter(o => o.kind === 'line');
    marks = marks.filter(m => m.kind !== 'line' || !allLines.some(o => twin(m, o)));
    // a motif: three or more look-alike lines anywhere (colour, length and thickness — sparkles, dashes, rays)
    const okLines = allLines.filter(o => o.ok || o.design);
    const lookAlike = (a, b) => b !== a && Math.hypot(a.col[0] - b.col[0], a.col[1] - b.col[1], a.col[2] - b.col[2]) <= 30
      && Math.max(a.len, b.len) <= 1.3 * Math.min(a.len, b.len) && Math.max(a.thick, b.thick) <= 1.4 * Math.min(a.thick, b.thick);
    marks = marks.filter(m => m.kind !== 'line' || okLines.filter(o => lookAlike(m, o)).length < 2);
    // the outer 0.25" is bleed / the cut edge (a cut corner, an edge line — the edge check's); and three or more
    // strokes of one colour side by side on one row are lettering (small print, a slug line), not strays
    const edge = 0.25 * ppi, hOf = m => m.y1 - m.y0 + 1;
    const rowMate = (a, b) => b !== a && Math.hypot(a.col[0] - b.col[0], a.col[1] - b.col[1], a.col[2] - b.col[2]) <= 30
      && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= 0.5 * Math.min(hOf(a), hOf(b))
      && Math.max(a.x0 - b.x1, b.x0 - a.x1) <= 4 * Math.max(hOf(a), hOf(b));
    marks = marks.filter(m => m.kind !== 'line' || (m.x0 > edge && m.y0 > edge && m.x1 < W - edge && m.y1 < H - edge
      && allLines.filter(o => rowMate(m, o)).length < 2));
    // and many real ones over the whole picture: hatching, an illustration's strokes — its style
    if (okLines.length >= this.TEXTURE_ALL) marks = marks.filter(m => m.kind !== 'line');
    // a stroke found as a line and as odd colour / specks (its ends): once, as the line
    const overlaps = (a, b) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
    marks = marks.filter(m => m.kind === 'line' || !marks.some(o => o.kind === 'line' && overlaps(m, o)));
    // … and not at all when that line is the design's (it runs on into / beside the artwork): a sliver of it in its
    // colour is the same line
    const designLines = allLines.filter(o => o.design);
    marks = marks.filter(m => m.kind === 'line' || !designLines.some(o => overlaps(m, o)
      && Math.hypot(m.col[0] - o.col[0], m.col[1] - o.col[1], m.col[2] - o.col[2]) <= 40));
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
    // a die-cut product (decal, sticker, cut-out): its magenta line is the cut line — the cutter follows it, it is not
    // printed — wherever a piece of it shows between the letters / shapes
    if (opts.dieCut) marks = marks.filter(m => !this.cutColour(m.col));
    if (opts.debug) return { scale: k, found, marks };
    if (marks.length > this.TOO_MANY) return { marks: [], scale: k, tooMany: marks.length };
    const r1 = v => Math.round(v / k);
    return {
      scale: k,
      marks: marks.map(m => {
        const bw = m.x1 - m.x0 + 1, bh = m.y1 - m.y0 + 1, isLine = m.kind === 'line';
        const len = isLine ? m.len : Math.max(bw, bh), thick = isLine ? m.thick : m.n / len;
        return {
          kind: isLine || (len >= 3 * Math.min(bw, bh) && len >= 3 * thick) ? 'line' : 'dot', fine: true, speck: m.kind === 'speck',
          solidLine: isLine,
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
