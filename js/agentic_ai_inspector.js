/**
 * Design Intelligence Hub - AI Artwork QA Scanner
 * Autonomous Multi-Stage QA Engine for Print Operations:
 * 
 * 1. OCR Text Detection & Spelling Check with Brand Whitelist (EzLicence, BannerBuzz, etc.)
 * 2. Stray Mark (Line & Dot) Detection based on adaptive thresholding & connected components
 * 3. Intentional vs. Accidental Classifier (distinguishes intentional dots like 'i' dots/periods
 *    and brand logos from genuine stray marks)
 * 4. Multi-tier QA Severity Classification:
 *    🔴 Fatal  - Wrong spelling of customer / company / brand name
 *    🟠 Major  - Missing important text, incorrect product specifications
 *    🟡 Minor  - Unnecessary stray dot, stray hairline, print speckle
 *    🔵 Review - Possible intentional decorative element requiring human confirmation
 * 5. Interactive 6-Tab Interface:
 *    - Artwork: Original artwork preview & metadata
 *    - Issues: Filterable detected problems with interactive QA actions
 *    - Highlighted Proof: Interactive animated blinking highlights directly on the canvas
 *    - Text Check: Extracted words, spell-checking, and Brand Whitelist verification
 *    - Stray Elements: Isolated dots & lines with geometric metrics and confidence %
 *    - QA Summary: Executive severity card and one-click QA decision
 */

/**
 * Content-aware stray mark detector (lines & dots).
 *
 * A stray mark is a small mark sitting alone on a FLAT area of the design (solid colour or a smooth
 * gradient), different from the colour right around it. Photos, illustrations and textured
 * backgrounds are full of small details that belong to the image, so marks are never searched for
 * inside them; the tool reports how much of the artwork it could check instead of guessing.
 *
 * Steps:
 *  1. Split the artwork into 8 px blocks and measure each block's local spread (MAD) and tone count:
 *     flat (solid / gradient), edge (text, logo or shape edge) or detail (photo / texture).
 *  2. Busy area = edge + detail blocks, grown by an isolation margin. Nothing is searched there
 *     (this also protects i-dots, full stops and fine parts of letters next to text).
 *  3. In the remaining flat area, a pixel is "ink" when it differs from ITS OWN block's background
 *     colour (not one global background, which is what made every photo detail a "stray mark").
 *  4. Ink pixels are grouped; a group is kept only when it is small (dot) or thin (line), touches
 *     nothing else, and the ring of pixels around it is one clean colour.
 *  5. Five or more look-alike small marks are a pattern (stars, confetti), not strays.
 *  6. Thin lines running along an outer edge (white/grey slivers after cropping) are checked separately.
 */
const ArtworkMarkDetector = {
  MAX_SCAN_SIDE: 2000,
  BLOCK: 8,

  /**
   * Scan a loaded image (or canvas). Large artwork is scanned at up to MAX_SCAN_SIDE px on the long
   * side; every result is mapped back to the artwork's own pixel size.
   */
  scanImage(source) {
    const origW = source.naturalWidth || source.width;
    const origH = source.naturalHeight || source.height;
    if (!origW || !origH || origW < 40 || origH < 40) return null;
    const scale = Math.min(1, this.MAX_SCAN_SIDE / Math.max(origW, origH));
    const W = Math.max(1, Math.round(origW * scale)), H = Math.max(1, Math.round(origH * scale));
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, W, H);
    const res = this.analyze(ctx.getImageData(0, 0, W, H).data, W, H);
    const k = 1 / scale;
    res.marks.forEach(m => {
      ['x', 'y', 'w', 'h', 'cx', 'cy', 'lengthPx', 'isolationPx'].forEach(f => { m[f] = Math.round(m[f] * k); });
      m.thicknessPx = Math.max(1, Math.round(m.thicknessPx * k));
    });
    (res.textRowMarks || []).forEach(m => {
      ['x', 'y', 'w', 'h', 'cx', 'cy', 'lengthPx', 'isolationPx', 'textRowReach'].forEach(f => { m[f] = Math.round(m[f] * k); });
      m.thicknessPx = Math.max(1, Math.round(m.thicknessPx * k));
    });
    res.edgeLines.forEach(e => { e.thicknessPx = Math.max(1, Math.round(e.thicknessPx * k)); });
    res.width = origW; res.height = origH; res.scanScale = +scale.toFixed(3);
    return res;
  },

  /**
   * @param {Uint8ClampedArray} data RGBA pixels
   * @param {number} W width of the scanned copy
   * @param {number} H height of the scanned copy
   * @returns {{artworkType, detailPct, flatPct, checkedPct, marks: Array, edgeLines: Array, patterns: Array}}
   */
  analyze(data, W, H) {
    const B = this.BLOCK;
    const N = W * H;
    const short = Math.min(W, H);
    const lum = new Float32Array(N);
    const opaque = new Uint8Array(N);
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      lum[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
      opaque[i] = data[p + 3] >= 128 ? 1 : 0;
    }

    // ── 1. Block statistics ──────────────────────────────────────────────
    const bw = Math.ceil(W / B), bh = Math.ceil(H / B), NB = bw * bh;
    const bType = new Uint8Array(NB);        // 0 transparent, 1 flat, 2 edge, 3 detail
    const bPure = new Uint8Array(NB);        // 1 = solid colour (MAD <= 1)
    const bRef = new Float32Array(NB * 3);   // background colour of the block (inlier mean)
    const vals = new Float32Array(B * B);
    const bins = new Uint8Array(32);

    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        const b = by * bw + bx;
        const x0 = bx * B, y0 = by * B, x1 = Math.min(W, x0 + B), y1 = Math.min(H, y0 + B);
        let n = 0, total = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          total++;
          const i = y * W + x;
          if (opaque[i]) vals[n++] = lum[i];
        }
        if (n < total * 0.5) { bType[b] = 0; continue; }
        const sorted = Array.prototype.slice.call(vals, 0, n).sort((a, c) => a - c);
        const med = sorted[n >> 1];
        const dev = sorted.map(v => Math.abs(v - med)).sort((a, c) => a - c);
        const mad = dev[n >> 1];
        bins.fill(0);
        for (let k = 0; k < n; k++) { const q = Math.min(31, sorted[k] >> 3); if (bins[q] < 255) bins[q]++; }
        let tones = 0;
        for (let k = 0; k < 32; k++) if (bins[k] >= 2) tones++;

        bType[b] = mad <= 3 ? 1 : tones >= 6 ? 3 : 2;
        bPure[b] = mad <= 1 ? 1 : 0;

        // Block background colour = mean of pixels close to the median tone
        const tol = Math.max(4, mad * 2);
        let r = 0, g = 0, bl = 0, c = 0;
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
          const i = y * W + x;
          if (!opaque[i] || Math.abs(lum[i] - med) > tol) continue;
          const p = i * 4; r += data[p]; g += data[p + 1]; bl += data[p + 2]; c++;
        }
        bRef[b * 3] = r / Math.max(1, c); bRef[b * 3 + 1] = g / Math.max(1, c); bRef[b * 3 + 2] = bl / Math.max(1, c);
      }
    }

    // A mark bigger than half a block makes its own block non-flat. A small cluster of non-flat
    // blocks fully surrounded by flat blocks of one colour is such a mark: give it the surrounding
    // background so it can be checked, instead of hiding it inside the busy area.
    const markMax = Math.max(16, Math.round(short * 0.12));
    const dotMax = Math.max(6, Math.round(short * 0.02));
    const lineMin = Math.max(12, Math.round(short * 0.02));
    const maxClusterBlocks = Math.ceil(markMax / B) + 1;
    const seenB = new Uint8Array(NB);
    for (let s = 0; s < NB; s++) {
      if (seenB[s] || (bType[s] !== 2 && bType[s] !== 3)) continue;
      const cluster = [s]; seenB[s] = 1;
      let cx0 = s % bw, cx1 = cx0, cy0 = (s / bw) | 0, cy1 = cy0, big = false;
      for (let q = 0; q < cluster.length; q++) {
        const cb = cluster[q], x = cb % bw, y = (cb / bw) | 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([dx, dy]) => {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) return;
          const nb = yy * bw + xx;
          if (seenB[nb] || (bType[nb] !== 2 && bType[nb] !== 3)) return;
          seenB[nb] = 1; cluster.push(nb);
          if (xx < cx0) cx0 = xx; if (xx > cx1) cx1 = xx; if (yy < cy0) cy0 = yy; if (yy > cy1) cy1 = yy;
        });
        if (cx1 - cx0 + 1 > maxClusterBlocks || cy1 - cy0 + 1 > maxClusterBlocks) big = true;
      }
      if (big || cx0 === 0 || cy0 === 0 || cx1 === bw - 1 || cy1 === bh - 1) continue;
      const ring = [];
      for (let x = cx0 - 1; x <= cx1 + 1; x++) { ring.push((cy0 - 1) * bw + x, (cy1 + 1) * bw + x); }
      for (let y = cy0; y <= cy1; y++) { ring.push(y * bw + cx0 - 1, y * bw + cx1 + 1); }
      if (ring.some(rb => bType[rb] !== 1)) continue;
      const mean = [0, 1, 2].map(k => ring.reduce((a, rb) => a + bRef[rb * 3 + k], 0) / ring.length);
      if (ring.some(rb => Math.hypot(bRef[rb * 3] - mean[0], bRef[rb * 3 + 1] - mean[1], bRef[rb * 3 + 2] - mean[2]) > 20)) continue;
      const pure = ring.every(rb => bPure[rb]);
      cluster.forEach(cb => { bType[cb] = 1; bPure[cb] = pure ? 1 : 0; bRef[cb * 3] = mean[0]; bRef[cb * 3 + 1] = mean[1]; bRef[cb * 3 + 2] = mean[2]; });
    }

    let opaqueBlocks = 0, detailBlocks = 0, flatBlocks = 0, solidBlocks = 0;
    for (let b = 0; b < NB; b++) {
      if (bType[b] === 0) continue;
      opaqueBlocks++;
      if (bType[b] === 1) { flatBlocks++; if (bPure[b]) solidBlocks++; } else if (bType[b] === 3) detailBlocks++;
    }

    // ── 2. Busy area: edge + detail blocks grown by the isolation margin ───
    const isoPx = Math.max(10, Math.round(short * 0.012));
    const grow = Math.ceil(isoPx / B);
    const busy = new Uint8Array(NB);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const t = bType[by * bw + bx];
      if (t !== 2 && t !== 3) continue;
      for (let yy = Math.max(0, by - grow); yy <= Math.min(bh - 1, by + grow); yy++)
        for (let xx = Math.max(0, bx - grow); xx <= Math.min(bw - 1, bx + grow); xx++) busy[yy * bw + xx] = 1;
    }
    let checkedBlocks = 0;
    for (let b = 0; b < NB; b++) if (bType[b] === 1 && !busy[b]) checkedBlocks++;

    // ── 3. Ink pixels inside the checked flat area ──────────────────────
    const ink = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      const rowB = ((y / B) | 0) * bw;
      for (let x = 0; x < W; x++) {
        const b = rowB + ((x / B) | 0);
        if (bType[b] !== 1 || busy[b]) continue;
        const i = y * W + x;
        if (!opaque[i]) continue;
        const p = i * 4;
        const dr = data[p] - bRef[b * 3], dg = data[p + 1] - bRef[b * 3 + 1], db = data[p + 2] - bRef[b * 3 + 2];
        if (Math.sqrt(dr * dr + dg * dg + db * db) > 30) ink[i] = 1;
      }
    }

    // ── 4. Group ink pixels (8-connected) ───────────────────────────────
    const label = new Int32Array(N);
    const comps = [];
    const stack = [];
    for (let i = 0; i < N; i++) {
      if (!ink[i] || label[i]) continue;
      const id = comps.length + 1;
      const c = { id, minX: W, minY: H, maxX: 0, maxY: 0, area: 0, r: 0, g: 0, b: 0, sx: 0, sy: 0 };
      label[i] = id; stack.push(i);
      while (stack.length) {
        const j = stack.pop();
        const x = j % W, y = (j / W) | 0;
        c.area++; c.sx += x; c.sy += y;
        if (x < c.minX) c.minX = x; if (x > c.maxX) c.maxX = x;
        if (y < c.minY) c.minY = y; if (y > c.maxY) c.maxY = y;
        const p = j * 4; c.r += data[p]; c.g += data[p + 1]; c.b += data[p + 2];
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= W) continue;
            const k = yy * W + xx;
            if (ink[k] && !label[k]) { label[k] = id; stack.push(k); }
          }
        }
      }
      comps.push(c);
    }

    // Distance (px) from a mark to the nearest ink pixel of anything else, searched up to maxD.
    // Pixel based, so a large frame or shape around the mark does not count as "touching" it.
    const nearestOther = (c, maxD) => {
      let best = Infinity;
      const x0 = Math.max(0, c.minX - maxD), x1 = Math.min(W - 1, c.maxX + maxD);
      const y0 = Math.max(0, c.minY - maxD), y1 = Math.min(H - 1, c.maxY + maxD);
      for (let y = y0; y <= y1; y++) {
        const dy = Math.max(0, c.minY - y, y - c.maxY);
        if (dy >= best) continue;
        for (let x = x0; x <= x1; x++) {
          const l = label[y * W + x];
          if (!l || l === c.id || touchesEdge(comps[l - 1])) continue;   // a frame round the artwork is not "artwork nearby"
          const d = Math.hypot(Math.max(0, c.minX - x, x - c.maxX), dy);
          if (d < best) best = d;
        }
      }
      return best;
    };
    // Distance (px) from a box to the nearest busy block, searched up to maxD
    const busyDist = (c, maxD) => {
      const bx0 = Math.max(0, ((c.minX - maxD) / B) | 0), bx1 = Math.min(bw - 1, ((c.maxX + maxD) / B) | 0);
      const by0 = Math.max(0, ((c.minY - maxD) / B) | 0), by1 = Math.min(bh - 1, ((c.maxY + maxD) / B) | 0);
      let best = Infinity;
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
        const t = bType[by * bw + bx]; if (t !== 2 && t !== 3) continue;
        const dx = Math.max(0, bx * B - c.maxX, c.minX - (bx * B + B - 1));
        const dy = Math.max(0, by * B - c.maxY, c.minY - (by * B + B - 1));
        const d = Math.hypot(dx, dy); if (d < best) best = d;
      }
      return best;
    };
    // Ring of pixels around the mark: must be one clean colour
    const ringTest = (c, pad) => {
      const x0 = c.minX - pad, x1 = c.maxX + pad, y0 = c.minY - pad, y1 = c.maxY + pad;
      const px = [];
      const take = (x, y) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = y * W + x;
        if (!opaque[i]) return;
        const l = label[i];
        if (l && l !== c.id && touchesEdge(comps[l - 1])) return;   // the image frame is not the mark's surround
        px.push(i);
      };
      for (let x = x0; x <= x1; x++) { take(x, y0); take(x, y1); }
      for (let y = y0 + 1; y < y1; y++) { take(x0, y); take(x1, y); }
      if (px.length < 8) return null;
      const ls = px.map(i => lum[i]).sort((a, b) => a - b);
      const med = ls[ls.length >> 1];
      const mad = ls.map(v => Math.abs(v - med)).sort((a, b) => a - b)[ls.length >> 1];
      let r = 0, g = 0, b = 0, n = 0;
      px.forEach(i => { if (Math.abs(lum[i] - med) <= 6) { const p = i * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; n++; } });
      return { clean: mad <= 3 && n / px.length >= 0.9, r: r / Math.max(1, n), g: g / Math.max(1, n), b: b / Math.max(1, n) };
    };

    // Text or graphics on the same row, left or right of the mark => punctuation, divider or rule
    const touchesEdge = c => c.minX <= 1 || c.minY <= 1 || c.maxX >= W - 2 || c.maxY >= H - 2;
    const inTextRow = (c, rowReach) => {
      const y0 = Math.max(0, c.minY - 1), y1 = Math.min(H - 1, c.maxY + 1);
      const sides = [[c.maxX + 1, Math.min(W - 1, c.maxX + rowReach)], [Math.max(0, c.minX - rowReach), c.minX - 1]];
      for (const [xa, xb] of sides) {
        for (let y = y0; y <= y1; y++) {
          const rowB = ((y / B) | 0) * bw;
          for (let x = xa; x <= xb; x++) {
            const t = bType[rowB + ((x / B) | 0)];
            if (t === 2 || t === 3) return true;
            const l = label[y * W + x];
            if (!l || l === c.id) continue;
            const o = comps[l - 1];   // only text- or shape-sized neighbours count, not another speck
            if (!touchesEdge(o) && Math.max(o.maxX - o.minX, o.maxY - o.minY) + 1 > dotMax) return true;
          }
        }
      }
      return false;
    };
    // A line whose end runs into other artwork is an edge of a frame, box or shape
    const endJoinsArtwork = (c) => {
      const horiz = (c.maxX - c.minX) >= (c.maxY - c.minY);
      const r = isoPx * 2, cy = Math.round((c.minY + c.maxY) / 2), cx = Math.round((c.minX + c.maxX) / 2);
      // search areas just beyond each end (in the line's direction, and r to either side for corners)
      const areas = horiz
        ? [[c.minX - r, c.minX + 2, cy - r, cy + r], [c.maxX - 2, c.maxX + r, cy - r, cy + r]]
        : [[cx - r, cx + r, c.minY - r, c.minY + 2], [cx - r, cx + r, c.maxY - 2, c.maxY + r]];
      for (const [xa, xb, ya, yb] of areas) {
        for (let y = Math.max(0, ya); y <= Math.min(H - 1, yb); y++) {
          const rowB = ((y / B) | 0) * bw;
          for (let x = Math.max(0, xa); x <= Math.min(W - 1, xb); x++) {
            const t = bType[rowB + ((x / B) | 0)];
            if (t === 2 || t === 3) return true;
            const l = label[y * W + x];
            if (!l || l === c.id) continue;
            const o = comps[l - 1];
            if (!touchesEdge(o) && Math.max(o.maxX - o.minX, o.maxY - o.minY) + 1 > dotMax) return true;
          }
        }
      }
      return false;
    };
    // Many other free-standing specks around it => sparkle / speckle texture of the design.
    // Fragments hugging text or graphics edges are not counted (they belong to that artwork).
    const crowded = (c) => {
      const cx = (c.minX + c.maxX) / 2, cy = (c.minY + c.maxY) / 2, R = isoPx * 8;
      let n = 0;
      for (const o of comps) {
        if (o === c || touchesEdge(o)) continue;
        if (Math.abs((o.minX + o.maxX) / 2 - cx) > R || Math.abs((o.minY + o.maxY) / 2 - cy) > R) continue;
        if (Math.max(o.maxX - o.minX, o.maxY - o.minY) + 1 > dotMax) continue;
        if (busyDist(o, isoPx) < isoPx) continue;
        if (++n >= 4) return true;
      }
      return false;
    };
    // Mirror symmetry in both directions => a designed shape (star, icon), not a smudge
    const symmetric = (c) => {
      const cw = c.maxX - c.minX + 1, ch = c.maxY - c.minY + 1;
      let inter = 0, interV = 0, n = 0;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (label[(c.minY + y) * W + c.minX + x] !== c.id) continue;
        n++;
        if (label[(c.minY + y) * W + c.minX + (cw - 1 - x)] === c.id) inter++;
        if (label[(c.minY + (ch - 1 - y)) * W + c.minX + x] === c.id) interV++;
      }
      return n > 0 && inter / n >= 0.8 && interV / n >= 0.8;
    };

    // ── 5. Keep small / thin, isolated marks on a clean surround ────────
    const raw = [];
    const textRow = [];
    const rejected = [];
    comps.forEach(c => {
      const drop = (why) => { if (this.DEBUG) rejected.push({ x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1, why }); };
      if (touchesEdge(c)) return;                                 // handled by the edge check
      const cw = c.maxX - c.minX + 1, ch = c.maxY - c.minY + 1;
      const len = Math.hypot(cw, ch);
      const thick = c.area / Math.max(cw, ch);
      let kind = null;
      if (Math.max(cw, ch) >= lineMin && thick <= 3.2 && Math.max(cw, ch) / Math.max(1, Math.min(cw, ch)) >= 4) kind = 'line';
      else if (cw <= dotMax && ch <= dotMax && c.area >= 2) kind = 'dot';
      else if (cw <= markMax && ch <= markMax) kind = 'mark';
      if (!kind) return;                                          // larger shape = part of the design

      const iso = Math.min(nearestOther(c, isoPx * 3), busyDist(c, isoPx * 3));
      if (iso < isoPx || (kind === 'dot' && iso < isoPx + 2)) return drop('touches artwork'); // i-dot, texture, fragment of a shape
      if (kind !== 'dot' && iso < isoPx * 1.5) return drop('close to artwork'); // lines / bigger marks stand well apart
      if (kind === 'line' && endJoinsArtwork(c)) return drop('line joins artwork'); // frame / box / shape edge
      if (crowded(c)) return drop('crowded');                      // sparkle / speckle texture
      if (kind === 'mark' && Math.min(cw, ch) >= dotMax && symmetric(c)) return drop('symmetric shape'); // star, icon
      const ring = ringTest(c, Math.max(3, Math.ceil(Math.min(cw, ch) / 2) + 2));
      if (!ring || !ring.clean) return drop('surround not clean'); // surround is not one clean colour
      const mr = c.r / c.area, mg = c.g / c.area, mb = c.b / c.area;
      const contrast = Math.hypot(mr - ring.r, mg - ring.g, mb - ring.b);
      const pure = bPure[((c.minY / B) | 0) * bw + ((c.minX / B) | 0)] === 1;
      if (contrast < (pure ? 30 : 50) || (c.area <= 4 && contrast < 45) || (c.area <= 2 && contrast < 60)) return drop('faint ' + Math.round(contrast)); // too faint to print visibly

      const conf = Math.min(0.95, 0.55
        + 0.20 * Math.min(1, (contrast - 30) / 90)
        + 0.12 * Math.min(1, (iso - isoPx) / (2 * isoPx))
        + (pure ? 0.08 : 0));
      const mark = {
        kind, x: c.minX, y: c.minY, w: cw, h: ch, cx: c.sx / c.area, cy: c.sy / c.area,
        area: c.area, lengthPx: Math.round(len), thicknessPx: Math.max(1, Math.round(thick)),
        orientation: cw >= ch ? 'Horizontal' : 'Vertical',
        color: [Math.round(mr), Math.round(mg), Math.round(mb)], contrast: Math.round(contrast),
        isolationPx: Math.round(iso === Infinity ? isoPx * 3 : iso), onSolidColour: pure, confidence: +conf.toFixed(2)
      };
      // Something on the same row (left / right): punctuation beside a word or a divider beside text?
      // That needs real words beside it, which only the text reader knows — so the mark waits for OCR.
      const rowReach = kind === 'dot' ? isoPx * 5 : isoPx * 8;
      if (inTextRow(c, rowReach)) {
        mark.textRowReach = rowReach;
        textRow.push(mark);
        return drop('text row (decided after text reading)');
      }
      raw.push(mark);
    });

    // Pattern filter: look-alike marks repeated across the design are a design element
    // (4+ dots, 3+ lines in the same direction, 3+ larger marks)
    const patterns = [];
    const used = new Set();
    raw.forEach((m, i) => {
      if (used.has(i)) return;
      const group = [i];
      raw.forEach((o, j) => {
        if (j === i || used.has(j) || o.kind !== m.kind) return;
        if (m.kind === 'line' && o.orientation !== m.orientation) return;
        const sizeOk = Math.max(o.area, m.area) / Math.max(1, Math.min(o.area, m.area)) <= 2.5;
        const colOk = Math.hypot(o.color[0] - m.color[0], o.color[1] - m.color[1], o.color[2] - m.color[2]) <= 40;
        if (sizeOk && colOk) group.push(j);
      });
      // Dust specks look alike too, so a dot pattern (confetti, stars) needs 6+ dots of real size
      const avgArea = group.reduce((a, k) => a + raw[k].area, 0) / group.length;
      if (m.kind === 'dot' ? (group.length >= 6 && avgArea >= 9) : group.length >= 3) {
        group.forEach(k => used.add(k));
        patterns.push({ kind: m.kind, count: group.length, color: m.color });
      }
    });
    const marks = raw.filter((m, i) => !used.has(i));
    if (this.DEBUG) this._debug = { W, H, bw, bh, bType, busy, bRef, comps, label, isoPx, dotMax, lineMin, markMax, rejected };

    // ── 6. Thin lines along the outer edges ──────────────────────────────
    const edgeLines = this._edgeLines(data, lum, opaque, W, H);

    // Vector / flat-colour artwork is mostly SOLID colour (no grain at all). Photos and painted
    // backgrounds are detailed, and even their smooth parts (sky, fog, skin) carry slight grain.
    const detailPct = opaqueBlocks ? detailBlocks / opaqueBlocks : 0;
    const solidPct = opaqueBlocks ? solidBlocks / opaqueBlocks : 0;
    return {
      artworkType: solidPct >= 0.6 ? 'flat' : solidPct < 0.3 ? 'detailed' : 'mixed',
      detailPct: Math.round(detailPct * 100),
      solidPct: Math.round(solidPct * 100),
      flatPct: Math.round((opaqueBlocks ? flatBlocks / opaqueBlocks : 0) * 100),
      checkedPct: Math.round((opaqueBlocks ? checkedBlocks / opaqueBlocks : 0) * 100),
      transparentPct: Math.round((1 - opaqueBlocks / Math.max(1, NB)) * 100),
      isolationPx: isoPx,
      marks, edgeLines, patterns, textRowMarks: textRow
    };
  },

  /**
   * A 1–3 px line that runs along most of an outer edge and differs from the artwork just inside it.
   */
  _edgeLines(data, lum, opaque, W, H) {
    const out = [];
    const sides = [
      { name: 'top', len: W, at: (k, t) => t * W + k },
      { name: 'bottom', len: W, at: (k, t) => (H - 1 - t) * W + k },
      { name: 'left', len: H, at: (k, t) => k * W + t },
      { name: 'right', len: H, at: (k, t) => k * W + (W - 1 - t) }
    ];
    const depthLimit = Math.min(W, H);
    const lineStats = (s, t) => {
      const a = Math.round(s.len * 0.03), b = Math.round(s.len * 0.97);
      const ls = [];
      let r = 0, g = 0, bl = 0, n = 0;
      for (let k = a; k < b; k++) {
        const i = s.at(k, t); if (!opaque[i]) continue;
        ls.push(lum[i]); const p = i * 4; r += data[p]; g += data[p + 1]; bl += data[p + 2]; n++;
      }
      if (n < (b - a) * 0.8) return null;
      ls.sort((x, y) => x - y);
      const med = ls[ls.length >> 1];
      const close = ls.filter(v => Math.abs(v - med) <= 12).length / ls.length;
      return { color: [r / n, g / n, bl / n], uniform: close >= 0.9 };
    };
    // Share of pixels along the edge where row `t` differs from the artwork at depth `ref`
    const differShare = (s, t, ref) => {
      const a = Math.round(s.len * 0.03), b = Math.round(s.len * 0.97);
      let differ = 0, n = 0;
      for (let k = a; k < b; k++) {
        const i = s.at(k, t), j = s.at(k, ref);
        if (!opaque[i] || !opaque[j]) continue;
        const p = i * 4, q = j * 4;
        if (Math.hypot(data[p] - data[q], data[p + 1] - data[q + 1], data[p + 2] - data[q + 2]) > 40) differ++;
        n++;
      }
      return n ? differ / n : 0;
    };
    const REF = 10;                                  // artwork reference depth, safely inside any sliver
    sides.forEach(s => {
      if (depthLimit < 60) return;
      const outer = lineStats(s, 0);
      if (!outer || !outer.uniform) return;
      // Band = consecutive uniform rows from the edge that differ from the artwork inside.
      // Frames with a tone change (outer dark row + lighter rows) count as one band.
      // Only the outermost row has to be one even colour; inner rows of a frame may shade.
      if (differShare(s, 0, REF) < 0.85) return;
      let thick = 1;
      while (thick < 8 && differShare(s, thick, REF) >= 0.85) thick++;
      if (thick > 2) return;                         // a wider band is a design border, not a sliver
      out.push({ side: s.name, thicknessPx: thick, color: outer.color.map(Math.round) });
    });
    return out;
  }
};

const AgenticAiInspector = {
  defects: [],
  extractedText: [],
  activeTab: 'issues', // 'artwork' | 'issues' | 'proof' | 'text' | 'stray' | 'summary'
  options: {
    enabled: true,
    blinking: true,
    filter: 'all', // 'all' | 'fatal' | 'major' | 'minor' | 'review' | 'spelling' | 'stray_line' | 'stray_dot'
    autoScan: true
  },
  _activeDefectId: null,
  _lastScannedSrc: null,
  _lastArtworkMeta: null,

  // Whitelisted Brand & Industry Vocabulary (Never flagged as typos)
  BRAND_WHITELIST: new Set([
    'ezlicence', 'ezlicense', 'bannerbuzz', 'bestofsigns', 'qpex', 'syntopic',
    'pcos', 'caterpillar', 'book', 'australia', 'com.au', 'corflute', 'vinyl',
    'grommets', 'grommet', 'die-cut', 'polypropylene', 'knitted', 'polyester',
    'retractable', 'teardrop', 'feather', 'mesh', 'substrate', 'adhesive',
    'wind-resistant', 'anti-peel', 'ultraviolet', 'cmyk', 'rgb', 'pantone',
    'signage', 'banner', 'sign', 'signs', 'print', 'printing', 'digital',
    'custom', 'heavy-duty', 'archives', 'museum', 'welcome', 'open', 'closed'
  ]),

  // Common print, signage, and marketing typo dictionary
  TYPO_DICTIONARY: {
    'ezlicnce': { suggestion: 'EzLicence', isBrand: true },
    'ezlisence': { suggestion: 'EzLicence', isBrand: true },
    'oppening': { suggestion: 'Opening', isBrand: false },
    'oppen': { suggestion: 'Open', isBrand: false },
    'welcom': { suggestion: 'Welcome', isBrand: false },
    'wellcome': { suggestion: 'Welcome', isBrand: false },
    'northumberlad': { suggestion: 'Northumberland', isBrand: false },
    'contrator': { suggestion: 'Contractor', isBrand: false },
    'contarctor': { suggestion: 'Contractor', isBrand: false },
    'buisness': { suggestion: 'Business', isBrand: false },
    'busness': { suggestion: 'Business', isBrand: false },
    'phne': { suggestion: 'Phone', isBrand: false },
    'telephne': { suggestion: 'Telephone', isBrand: false },
    'discout': { suggestion: 'Discount', isBrand: false },
    'discont': { suggestion: 'Discount', isBrand: false },
    'gromets': { suggestion: 'Grommets', isBrand: false },
    'gromet': { suggestion: 'Grommet', isBrand: false },
    'specal': { suggestion: 'Special', isBrand: false },
    'speciall': { suggestion: 'Special', isBrand: false },
    'resturant': { suggestion: 'Restaurant', isBrand: false },
    'restarant': { suggestion: 'Restaurant', isBrand: false },
    'offfice': { suggestion: 'Office', isBrand: false },
    'emegency': { suggestion: 'Emergency', isBrand: false },
    'emergancy': { suggestion: 'Emergency', isBrand: false },
    'addres': { suggestion: 'Address', isBrand: false },
    'tommorow': { suggestion: 'Tomorrow', isBrand: false },
    'servise': { suggestion: 'Service', isBrand: false },
    'garuantee': { suggestion: 'Guarantee', isBrand: false },
    'garantee': { suggestion: 'Guarantee', isBrand: false },
    'custum': { suggestion: 'Custom', isBrand: false },
    'custome': { suggestion: 'Custom', isBrand: false },
    'bannar': { suggestion: 'Banner', isBrand: false },
    'bannner': { suggestion: 'Banner', isBrand: false },
    'qualty': { suggestion: 'Quality', isBrand: false },
    'licenced': { suggestion: 'Licensed', isBrand: false },
    'insurrance': { suggestion: 'Insurance', isBrand: false }
  },

  /**
   * Run full AI Artwork QA Scan on the active canvas and artwork
   */
  // Result of the last pixel scan (artwork type, checked area, marks) — null until the artwork is scanned
  scanResult: null,
  // Why the artwork could not be scanned (e.g. PDF/AI shown as a generated preview), or null
  scanSkipReason: null,
  // Text read from the artwork (ArtworkTextCheck): words, spelling issues, which way the text runs
  textResult: null,
  textState: { status: 'idle', text: '' },
  textVerify: [],
  _textRun: 0,
  MIN_TEXT_CONF: 80,

  /** Read the artwork text (OCR) in the background; findings arrive a few seconds after the pixel scan */
  _startTextCheck(img) {
    const run = ++this._textRun;
    this.textResult = null;
    this.textVerify = [];
    if (typeof ArtworkTextCheck === 'undefined' || !img) {
      this.textState = { status: 'unavailable', text: 'The text reader is not loaded — proofread the text manually.' };
      return;
    }
    this.textState = { status: 'loading', text: 'Starting the text reader…' };
    const fname = (typeof appState !== 'undefined' && ((appState.parsedFilename && appState.parsedFilename.fname) || (appState.file && appState.file.name))) || '';
    const fileWords = fname.replace(/\.[a-z0-9]+$/i, '').split(/[^A-Za-z]+/).filter(t => t.length >= 3);
    const refresh = () => { this.updateControlsUI(); this.syncPrecheckReport(); };
    // The customer / company name typed in Order Information is checked like a brand name
    const customer = (typeof appState !== 'undefined' && appState.customerName) || (document.getElementById('customer-name') || {}).value || '';
    ArtworkTextCheck.run(img, {
      fileWords,
      brands: customer && !/^customer$/i.test(customer.trim()) ? [customer.trim()] : [],
      onStatus: (st, text) => { if (run === this._textRun) { this.textState = { status: st, text }; refresh(); } }
    }).then(res => {
      if (run === this._textRun) this._applyTextResult(res);
    }).catch(err => {
      if (run !== this._textRun) return;
      console.warn('Text check failed:', err);
      this.textState = { status: 'unavailable', text: 'The text check could not run (' + err.message + '). Proofread the text manually.' };
      refresh();
    });
  },

  _applyTextResult(res) {
    this.textResult = res && res.available ? res : null;
    this.textState = res && res.available
      ? { status: 'done', text: '' }
      : { status: 'unavailable', text: (typeof ArtworkTextCheck !== 'undefined' && ArtworkTextCheck.statusText) || 'The text reader is unavailable — proofread the text manually.' };
    this.defects = this.defects.filter(d => d.type !== 'spelling');
    if (this.textResult) this._restoreTextRowMarks(res.words);
    if (this.textResult) this._dropMarksInWords(res.words);
    if (this.textResult) {
      const pct = v => +(v * 100).toFixed(2);
      const LABEL = { brand: 'Brand name', web: 'Web / e-mail address', word: 'Spelling' };
      res.issues.filter(it => it.kind !== 'verify').forEach((it, n) => {
        const desc = it.kind === 'brand'
          ? `The artwork reads "${it.text}", which is close to the brand name "${it.suggestion}" but not the same. A wrong brand / company name means a reprint — confirm with the customer.`
          : it.kind === 'web'
            ? `"${it.text}" does not end with a real web / e-mail ending. Did the customer mean "${it.suggestion}"?`
            : `"${it.text}" is not in the US or UK English dictionary. Did the customer mean "${it.suggestion}"?`;
        this.defects.push({
          id: `typo_${n + 1}`,
          type: 'spelling',
          kind: it.kind,
          category: 'Text Check',
          shape: 'box',
          severity: it.kind === 'brand' ? 'Fatal' : 'Major',
          title: `${LABEL[it.kind]}: "${it.text}" → "${it.suggestion}"`,
          confidence: null,
          xPercent: pct(it.box.x), yPercent: pct(it.box.y),
          wPercent: Math.max(pct(it.box.w), 1.2), hPercent: Math.max(pct(it.box.h), 1.2),
          details: { word: it.text, suggestion: it.suggestion, source: 'artwork',
            description: `${desc} (Read by OCR with ${Math.round(it.conf)}% certainty — check the word on the artwork.)` },
          intentional: false,
          dismissed: false
        });
      });
      this.textVerify = res.issues.filter(it => it.kind === 'verify');
      const byText = t => res.issues.find(it => it.text === t);
      this.extractedText = res.words
        .filter(w => w.conf >= 60 && /[A-Za-z]{2,}/.test(w.text))
        .map(w => {
          const it = byText(w.text);
          return { word: w.text, conf: Math.round(w.conf), kind: it ? it.kind : null, suggestion: it ? it.suggestion : null };
        });
    }
    this._lastBulk = null;
    this.renderOverlay();
    this.updateControlsUI();
    this.syncPrecheckReport();
  },

  /** Spelling card of the pre-check report: what was read, what looks wrong, what a person must still check */
  getSpellingSummary() {
    const st = this.textState || {};
    if (this.scanSkipReason) {
      return { status: 'WARNING', found: 'Manual proofreading needed',
        detail: 'The artwork pixels could not be read in the browser, so its text was not checked automatically.',
        action: 'Proofread names, phone numbers, web addresses and dates before creating the design file.' };
    }
    if (!this.textResult) {
      if (st.status === 'unavailable') {
        return { status: 'WARNING', found: 'Text reader unavailable — proofread manually', detail: st.text,
          action: 'Proofread names, phone numbers, web addresses and dates.' };
      }
      return { status: 'WARNING', found: st.text || 'Waiting for the artwork…',
        detail: 'The text on the artwork is read automatically (OCR) and checked against US and UK English dictionaries, brand names and web-address endings.',
        action: '' };
    }
    const open = this.getDefects().filter(d => d.type === 'spelling' && !d.intentional);
    const reviewed = this.defects.filter(d => d.type === 'spelling' && (d.dismissed || d.intentional)).length;
    const nWords = this.textResult.words.filter(w => w.conf >= this.MIN_TEXT_CONF && /[A-Za-z]{2,}/.test(w.text)).length;
    const verify = this.textVerify.length;
    const verifyNote = verify
      ? ` ${verify} name${verify > 1 ? 's' : ''} / uncommon word${verify > 1 ? 's' : ''} listed under Text Check to verify (e.g. ${this.textVerify.slice(0, 3).map(v => v.text).join(', ')}).`
      : '';
    const base = `Read ${nWords} word${nWords !== 1 ? 's' : ''} on the artwork (OCR) and checked them against US + UK English dictionaries, brand names and web-address endings.${verifyNote} Phone numbers and dates cannot be verified automatically.`;
    if (open.length) {
      const list = open.slice(0, 3).map(d => `"${d.details.word}" → "${d.details.suggestion}"`).join(', ') + (open.length > 3 ? ` +${open.length - 3} more` : '');
      // A word that is not in the dictionary but one or two letters from a real word is a spelling
      // mistake the customer must fix or confirm — the check fails until it is resolved
      return { status: 'FAIL',
        found: `${open.length} spelling mistake${open.length > 1 ? 's' : ''} found: ${list}`, detail: base,
        action: 'Click the marked words on the canvas. Ask the customer to confirm or correct them before creating the design file.' };
    }
    if (nWords < 3) {
      const readWords = this.textResult.words.filter(w => w.conf >= this.MIN_TEXT_CONF && /[A-Za-z]{2,}/.test(w.text)).map(w => w.text);
      return { status: 'WARNING',
        found: readWords.length ? `Only ${readWords.length} word${readWords.length > 1 ? 's' : ''} could be read clearly (${readWords.join(', ')}) — proofread the rest by eye` : 'No text could be read clearly — proofread manually',
        detail: base,
        action: 'Arched, script, very large/small or photo lettering cannot be read reliably by OCR. Proofread the artwork by eye.' };
    }
    return { status: verify ? 'WARNING' : 'PASS',
      found: `No spelling mistakes found${reviewed ? ` · ${reviewed} reviewed by designer` : ''}${verify ? ` · ${verify} name${verify > 1 ? 's' : ''} to verify` : ''}`,
      detail: base, action: verify ? 'Check the spelling of the listed names against the order / customer details.' : '' };
  },

  /**
   * Run the QA scan. Called once when the pre-check starts (image may not be loaded yet) and again
   * by CanvasInspector every time it draws the artwork. The pixel scan runs once per artwork, only
   * on the customer's real pixels — never on a generated preview or demo image.
   */
  scanArtwork(canvas, img, spec, dims) {
    const analysis = (typeof appState !== 'undefined') ? appState.analysis : null;
    const ext = ((analysis && analysis.fileExt) || '').toLowerCase();
    const realSrc = analysis ? analysis.previewDataUrl : null;
    const loaded = !!(img && img.naturalWidth > 0);
    const src = (img && img.src) || realSrc || '';

    if (this._lastScannedSrc === src && (this.scanResult || this.scanSkipReason)) {
      this.renderOverlay();
      this.updateControlsUI();
      return this.defects;
    }

    // Only formats whose real pixels the browser shows can be scanned
    const scannableExt = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext) || !!(analysis && analysis.renderedFromPdf);
    let skip = null;
    if (!scannableExt) {
      skip = `.${(ext || 'file').toUpperCase()} artwork is shown as a generated preview in the browser, not its real pixels, so lines and dots cannot be checked automatically. Open it in Illustrator / Acrobat and inspect at 100%.`;
    } else if (loaded && realSrc && img.src !== realSrc) {
      skip = 'The browser could not display this artwork file, so lines and dots were not checked automatically. Inspect it in Photoshop / Illustrator at 100%.';
    }

    if (!skip && !loaded) {
      // First call happens before the image has loaded: show "scanning" until the canvas draws it
      if (this._lastScannedSrc !== src) {
        this.defects = []; this.extractedText = []; this.scanResult = null; this.scanSkipReason = null;
        this.textResult = null; this.textVerify = []; this.textState = { status: 'idle', text: '' }; this._textRun++;
      }
      this.renderOverlay();
      this.updateControlsUI();
      return this.defects;
    }

    this._lastScannedSrc = src;
    this.defects = [];
    this.extractedText = [];
    this.scanResult = null;
    this.scanSkipReason = skip;

    const w = loaded ? img.naturalWidth : (analysis && analysis.pixelWidth) || 0;
    const h = loaded ? img.naturalHeight : (analysis && analysis.pixelHeight) || 0;
    this._lastArtworkMeta = {
      width: w,
      height: h,
      aspect: h ? +(w / h).toFixed(2) : 0,
      specName: spec ? spec.name : 'Standard Print',
      orderDims: dims ? `${dims.widthIn}" × ${dims.heightIn}"` : 'N/A'
    };

    // 1. Text Extraction & Spell-Check with Brand Whitelist
    this._scanSpellingTypos(canvas, img, spec, dims);

    // 2. Stray lines & dots on the real artwork pixels
    if (!skip) this._scanArtworkMarksWithIntentionality(canvas, img, spec, dims, w, h);

    // 3. Spelling + direction of the text (OCR, runs in the background)
    if (!skip) this._startTextCheck(img);
    else { this._textRun++; this.textResult = null; this.textVerify = []; this.textState = { status: 'skipped', text: '' }; }

    // Render overlay and update controls
    this.renderOverlay();
    this.updateControlsUI();
    this.syncPrecheckReport();

    return this.defects;
  },

  ARTWORK_TYPE_LABELS: {
    flat: 'Flat-colour / vector-style design',
    mixed: 'Mixed design (flat colour + photo / illustration)',
    detailed: 'Photo or detailed full-background design'
  },

  /**
   * One honest summary of the Lines & Dots / spelling check, used by the pre-check report and by the
   * live update after the scan. Says what was checked, what was found, and what still needs a human.
   */
  getCheckSummary() {
    const marks = this.defects.filter(d => d.type !== 'spelling');
    const active = marks.filter(d => !d.dismissed && !d.intentional);
    const lines = active.filter(d => d.type === 'stray_line');
    const dots = active.filter(d => d.type === 'stray_dot');
    const edges = active.filter(d => d.type === 'edge_line');
    const typos = [];
    const r = this.scanResult;
    const plural = (n, w) => `${n} ${w}${n !== 1 ? 's' : ''}`;

    const closed = marks.filter(d => d.dismissed).length;
    const intentional = marks.filter(d => !d.dismissed && d.intentional).length;
    // Findings the designer closed or confirmed are reported as such — never as "nothing found"
    const reviewed = [closed ? `${closed} closed` : '', intentional ? `${intentional} marked intentional` : ''].filter(Boolean).join(', ');
    const closedNote = reviewed ? ` · ${reviewed} by designer` : '';
    const parts = [];
    if (dots.length) parts.push(plural(dots.length, 'stray dot/mark'));
    if (lines.length) parts.push(plural(lines.length, 'stray line'));
    if (edges.length) parts.push('thin edge line');
    if (typos.length) parts.push(plural(typos.length, 'spelling note'));

    if (!r && !this.scanSkipReason) {
      return {
        status: 'WARNING',
        found: 'Scanning artwork…',
        detail: 'The stray line & dot scan runs as soon as the artwork is drawn on the canvas.',
        action: ''
      };
    }
    if (this.scanSkipReason) {
      return {
        status: 'WARNING',
        found: `Manual check needed${typos.length ? ' · ' + parts.join(', ') : ''}`,
        detail: this.scanSkipReason,
        action: 'Inspect the artwork at 100% zoom for stray lines, dots and smudges before creating the design file.'
      };
    }

    const typeLabel = this.ARTWORK_TYPE_LABELS[r.artworkType] || 'Artwork';
    const coverage = `${typeLabel}. ${r.checkedPct}% of the artwork is clear flat colour and was scanned for stray lines and dots; the rest is photo, illustration, text or graphics, where small details belong to the design and are not flagged.`;
    const patternNote = r.patterns.length
      ? ` ${r.patterns.reduce((a, p) => a + p.count, 0)} repeated small elements (stars, dots or stripes) were treated as part of the design.`
      : '';
    const hasFatal = active.some(d => d.severity === 'Fatal');

    if (parts.length) {
      return {
        status: hasFatal ? 'FAIL' : 'WARNING',
        found: `${parts.join(', ')} · checked ${r.checkedPct}% of the artwork${closedNote}`,
        detail: coverage + patternNote,
        action: 'Click a marker on the canvas (or 🎯 Locate) to zoom in. Remove real marks, or mark them intentional.'
          + (r.artworkType !== 'flat' ? ' Photo and illustration areas are not auto-checked — look over them at 100% zoom.' : '')
      };
    }
    if (r.checkedPct < 40) {
      return {
        status: 'WARNING',
        found: reviewed
          ? `All findings reviewed by designer (${reviewed}) · photo areas need a visual check`
          : `No stray marks in the checked area (${r.checkedPct}%) · photo areas need a visual check`,
        detail: coverage + patternNote,
        action: 'Most of this artwork is photo / illustration. Look over it at 100% zoom for dust, scratches or scanner marks.'
      };
    }
    return {
      status: 'PASS',
      found: reviewed
        ? `All findings reviewed by designer (${reviewed}) · checked ${r.checkedPct}% of the artwork`
        : `No stray lines or dots found · checked ${r.checkedPct}% of the artwork`,
      detail: coverage + patternNote,
      action: ''
    };
  },

  syncPrecheckReport() {
    if (typeof appState === 'undefined') return;
    const activeDefects = this.getDefects();
    if (appState.analysis) appState.analysis.aiDefects = activeDefects;
    const report = appState.report;
    if (!report || !Array.isArray(report.checks)) return;
    const updates = {
      linesAndDots: Object.assign(this.getCheckSummary(), { aiDefects: activeDefects }),
      spelling: this.getSpellingSummary()
    };
    if (typeof PrecheckEngine !== 'undefined' && PrecheckEngine.orientationCheck && report.analysis) {
      updates.orientation = PrecheckEngine.orientationCheck(report.analysis, report.spec, report.dimensions);
    }
    Object.entries(updates).forEach(([id, summary]) => {
      const check = report.checks.find(c => c.id === id);
      if (!check) return;
      Object.assign(check, summary);
      // Re-render the card with the app's own template, keeping it open if the designer opened it
      const cardEl = document.getElementById(`cc-${id}`);
      if (cardEl && typeof renderCheckCard === 'function') {
        const wasOpen = cardEl.classList.contains('open');
        cardEl.outerHTML = renderCheckCard(check);
        if (wasOpen) { const again = document.getElementById(`cc-${id}`); if (again) again.classList.add('open'); }
      }
    });
    this._refreshSummaryCard(report);
  },

  /** Recount pass / warning / fail after the scan (same scoring as PrecheckEngine.evaluate). */
  _refreshSummaryCard(report) {
    const checks = report.checks;
    const fails = checks.filter(c => c.status === 'FAIL' && !c.isOverridden).length;
    const warns = checks.filter(c => c.status === 'WARNING' && !c.isOverridden).length;
    const passes = checks.filter(c => c.status === 'PASS' || c.isOverridden).length;
    let score = Math.max(0, 100 - fails * 20 - warns * 5);
    if (report.analysis && report.analysis.isVector) score = Math.min(100, score + 5);
    const overall = fails > 0 ? 'FAIL' : warns > 3 ? 'WARNING' : 'PASS';
    Object.assign(report, { score, overall });

    const card = document.getElementById('summary-card');
    if (!card) return;
    const scoreEl = card.querySelector('.score-num');
    if (scoreEl) { scoreEl.textContent = score; scoreEl.className = `score-num ${overall.toLowerCase()}`; }
    const chips = card.querySelector('.summary-chips');
    if (chips) {
      chips.innerHTML = `
        <div class="chip chip-pass"><span class="chip-dot"></span>${passes} Passed</div>
        <div class="chip chip-warn"><span class="chip-dot"></span>${warns} Warning${warns !== 1 ? 's' : ''}</div>
        <div class="chip chip-fail"><span class="chip-dot"></span>${fails} Critical</div>`;
    }
    const verdict = card.querySelector('.summary-verdict');
    if (verdict) {
      verdict.textContent = overall;
      verdict.className = `summary-verdict ${overall === 'PASS' ? 'verd-pass' : overall === 'WARNING' ? 'verd-warning' : 'verd-fail'}`;
    }
  },

  /**
   * 1. SPELL CHECK & TYPOGRAPHY QA with Brand Whitelist
   */
  _scanSpellingTypos(canvas, img, spec, dims) {
    const textSnippets = [];

    // Extract text from SVG if present
    if (img && img.src && (img.src.startsWith('data:image/svg') || img.src.includes('<svg'))) {
      try {
        let svgStr = '';
        if (img.src.startsWith('data:image/svg+xml;charset=utf-8,')) {
          svgStr = decodeURIComponent(img.src.replace('data:image/svg+xml;charset=utf-8,', ''));
        } else if (img.src.startsWith('data:image/svg+xml;base64,')) {
          svgStr = atob(img.src.replace('data:image/svg+xml;base64,', ''));
        }
        if (svgStr) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(svgStr, 'image/svg+xml');
          const textNodes = doc.querySelectorAll('text, tspan');
          textNodes.forEach((node, idx) => {
            const rawText = (node.textContent || '').trim();
            if (rawText) {
              const xAttr = parseFloat(node.getAttribute('x')) || 0;
              const yAttr = parseFloat(node.getAttribute('y')) || 0;
              textSnippets.push({
                text: rawText,
                x: xAttr,
                y: yAttr,
                nodeIdx: idx,
                source: 'artwork'
              });
            }
          });
        }
      } catch (err) {
        console.warn('SVG text parse warning:', err);
      }
    }

    // Extract text from PDF metadata if available in appState
    if (typeof appState !== 'undefined' && appState.parsedFilename) {
      const fname = appState.parsedFilename.fname || '';
      if (fname) {
        // The file name is not printed on the product, so it is not spell-checked as artwork text
      }
    }

    const seenWords = new Set();

    textSnippets.forEach(snippet => {
      const words = snippet.text.split(/[^a-zA-Z0-9'-]+/);
      words.forEach(word => {
        const clean = word.toLowerCase().trim();
        if (!clean || clean.length < 2 || seenWords.has(clean)) return;
        seenWords.add(clean);

        const isBrandWhitelisted = this.BRAND_WHITELIST.has(clean);

        this.extractedText.push({
          word: word,
          clean: clean,
          isWhitelisted: isBrandWhitelisted,
          isTypo: !!this.TYPO_DICTIONARY[clean],
          suggestion: this.TYPO_DICTIONARY[clean] ? this.TYPO_DICTIONARY[clean].suggestion : null
        });

        // If in Brand Whitelist -> Never flag as typo
        if (isBrandWhitelisted) return;

        // Check if word is a known typo
        if (this.TYPO_DICTIONARY[clean]) {
          const typoInfo = this.TYPO_DICTIONARY[clean];
          const suggestion = typoInfo.suggestion;
          const isBrand = typoInfo.isBrand;
          const inFileName = snippet.source === 'filename';
          // A word in the file name is not printed, so it is a note for the designer, not an artwork error
          const severity = inFileName ? 'Review' : isBrand ? 'Fatal' : 'Major';

          this.defects.push({
            id: `typo_${this.defects.length + 1}`,
            type: 'spelling',
            category: 'Text Check',
            // No position is known for the word, so no marker is drawn on the artwork
            shape: 'none',
            severity: severity,
            title: `${inFileName ? 'File name' : 'Spelling'}: "${word}" → "${suggestion}"`,
            confidence: null,
            details: {
              word: word,
              suggestion: suggestion,
              isBrand: isBrand,
              source: snippet.source,
              description: inFileName
                ? `"${word}" in the file name looks like a typo of "${suggestion}". The file name is not printed — check the same word in the artwork.`
                : isBrand
                  ? `Spelling mistake on a customer/brand name in the artwork text: "${word}". Correction: "${suggestion}". Must be fixed before printing.`
                  : `Possible spelling mistake in the artwork text: "${word}". Suggested: "${suggestion}".`
            },
            intentional: false,
            dismissed: false
          });
        }
      });
    });
  },

  /**
   * 2. STRAY LINES & DOTS — content-aware scan of the real artwork pixels (see ArtworkMarkDetector).
   * Each finding carries its real position, size, contrast and an evidence-based confidence.
   */
  _scanArtworkMarksWithIntentionality(canvas, img, spec, dims, w, h) {
    let res = null;
    try {
      res = ArtworkMarkDetector.scanImage(img);
    } catch (e) {
      console.warn('Stray mark scan failed:', e);
    }
    if (!res) {
      this.scanSkipReason = 'The artwork could not be read for the stray mark check. Inspect it at 100% zoom.';
      return;
    }
    this.scanResult = res;
    const W = res.width, H = res.height;
    const pct = v => +(v * 100).toFixed(2);

    this._textRowMarks = res.textRowMarks || [];
    res.marks.forEach((m, i) => this.defects.push(this._markDefect(m, `${i + 1}`, W, H)));

    if (res.edgeLines.length) {
      const sides = res.edgeLines.map(e => e.side);
      const thick = Math.max(...res.edgeLines.map(e => e.thicknessPx));
      this.defects.push({
        id: 'edge_1',
        type: 'edge_line',
        category: 'Stray Elements',
        shape: 'edges',
        sides,
        severity: 'Review',
        title: `Thin line along the ${sides.length === 4 ? 'whole border' : sides.join(', ') + ' edge' + (sides.length > 1 ? 's' : '')}`,
        confidence: null,
        details: {
          description: `A ${thick} px line runs along the ${sides.join(', ')} edge${sides.length > 1 ? 's' : ''} and differs from the artwork next to it. If it is not a planned border (e.g. a white or grey sliver left after cropping), remove it or extend the background — after trimming it can show unevenly.`
        },
        intentional: false,
        dismissed: false
      });
    }
  },

  /** One stray-mark finding (dot, line or smudge) in the defect format used by the panel and overlay */
  _markDefect(m, idSuffix, W, H, note) {
    const pct = v => +(v * 100).toFixed(2);
    const likely = m.confidence >= 0.8;
    const where = m.onSolidColour ? 'on a solid-colour area' : 'on a smooth / gradient area';
    const sizeTxt = m.kind === 'line' ? `${m.lengthPx} px long, ${m.thicknessPx} px thick` : `${m.w} × ${m.h} px`;
    const name = m.kind === 'line' ? 'stray line' : m.kind === 'mark' ? 'stray mark / smudge' : 'stray dot';
    const isLine = m.kind === 'line';
    return {
      id: `${isLine ? 'line' : 'dot'}_${idSuffix}`,
      type: isLine ? 'stray_line' : 'stray_dot',
      kind: m.kind,
      category: 'Stray Elements',
      shape: m.kind === 'dot' ? 'circle' : 'box',
      // A mark on solid colour is almost always unwanted; on a gradient it may be part of the image
      severity: m.onSolidColour ? 'Minor' : 'Review',
      title: `${likely ? 'Likely' : 'Possible'} ${name}`,
      confidence: m.confidence,
      cxPercent: pct(m.cx / W),
      cyPercent: pct(m.cy / H),
      xPercent: pct(m.x / W),
      yPercent: pct(m.y / H),
      wPercent: Math.max(pct(m.w / W), 1.2),
      hPercent: Math.max(pct(m.h / H), 1.2),
      metrics: {
        sizePx: [m.w, m.h], lengthPx: m.lengthPx, thicknessPx: m.thicknessPx, orientation: m.orientation,
        contrast: m.contrast, isolationDistPx: m.isolationPx, color: m.color
      },
      details: {
        description: `${sizeTxt} at (${m.x}, ${m.y}) px, ${where}. Nothing else within ${m.isolationPx} px; colour rgb(${m.color.join(', ')}) stands out from its surround (contrast ${m.contrast}).${note ? ' ' + note : ''} Zoom in to confirm, then remove it or mark it intentional.`
      },
      intentional: false,
      dismissed: false
    };
  },

  /**
   * Marks held back because something sits on the same row: they are punctuation / dividers only
   * when real words are beside them. Once OCR has read the text, the others are reported.
   */
  _restoreTextRowMarks(words) {
    const r = this.scanResult;
    this.defects = this.defects.filter(d => !/_r\d+$/.test(d.id));
    if (!r || !this._textRowMarks || !this._textRowMarks.length) return;
    const W = r.width, H = r.height;
    const boxes = words
      .filter(w => w.conf >= 60 && /[A-Za-z0-9]{2,}/.test(w.text))
      .map(w => ({ x0: w.box.x * W, y0: w.box.y * H, x1: (w.box.x + w.box.w) * W, y1: (w.box.y + w.box.h) * H }));
    this._textRowMarks.forEach((m, i) => {
      if (m.kind === 'mark' || m.confidence < 0.75) return;
      const y0 = m.y - 2, y1 = m.y + m.h + 2;
      const besideText = boxes.some(b => {
        if (Math.min(b.y1, y1) - Math.max(b.y0, y0) <= 0) return false;           // not on this row
        const gap = Math.max(b.x0 - (m.x + m.w), m.x - b.x1, 0);
        return gap <= m.textRowReach;
      });
      if (!besideText) this.defects.push(this._markDefect(m, `r${i + 1}`, W, H, 'No words beside it, so it is not punctuation or a divider.'));
    });
  },

  /**
   * A dot or line lying inside a word that was read clearly is part of a letter (the dot of an "i",
   * the tail of a "y"), not a stray mark. Called once the text reading has finished.
   */
  _dropMarksInWords(words) {
    const r = this.scanResult;
    if (!r) return;
    const boxes = words
      .filter(w => w.conf >= 70 && /[A-Za-z]{2,}/.test(w.text) && w.box.w * w.box.h < 0.1)
      .map(w => {
        const mx = w.box.h * 0.05, my = w.box.h * 0.1;
        return { x0: (w.box.x - mx) * 100, x1: (w.box.x + w.box.w + mx) * 100, y0: (w.box.y - my) * 100, y1: (w.box.y + w.box.h + my) * 100 };
      });
    if (!boxes.length) return;
    this.defects = this.defects.filter(d => {
      if (d.type !== 'stray_dot' && d.type !== 'stray_line') return true;
      const x0 = d.xPercent, y0 = d.yPercent;
      const x1 = x0 + d.metrics.sizePx[0] / r.width * 100, y1 = y0 + d.metrics.sizePx[1] / r.height * 100;
      return !boxes.some(b => x0 >= b.x0 && x1 <= b.x1 && y0 >= b.y0 && y1 <= b.y1);
    });
  },

  /**
   * Render interactive animated blinking highlights directly over the artwork canvas
   */
  renderOverlay(containerEl, canvasEl) {
    const wrap = containerEl || document.querySelector('.canvas-viewport-wrap');
    const canvas = canvasEl || document.getElementById('artwork-canvas');
    if (!wrap || !canvas) return;

    let overlay = document.getElementById('ai-defect-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ai-defect-overlay';
      overlay.className = 'ai-defect-overlay';
      wrap.appendChild(overlay);
    }

    // Markers are placed in artwork coordinates, so the overlay covers exactly the rectangle where the
    // artwork is drawn (inside hem / bleed / letterbox). In template or mockup view, or when rotated,
    // the artwork is not drawn 1:1, so markers are hidden rather than shown in the wrong place.
    // artRect undefined = an older canvas_inspector.js (no artwork rectangle): fall back to the whole canvas
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector : null;
    const art = ci && ci.artRect === undefined ? { x: 0, y: 0, w: canvas.width, h: canvas.height } : (ci ? ci.artRect : null);
    const sx = canvas.width ? canvas.offsetWidth / canvas.width : 1;
    const sy = canvas.height ? canvas.offsetHeight / canvas.height : 1;
    overlay.style.position = 'absolute';
    overlay.style.left = (canvas.offsetLeft + (art ? art.x * sx : 0)) + 'px';
    overlay.style.top = (canvas.offsetTop + (art ? art.y * sy : 0)) + 'px';
    overlay.style.width = (art ? art.w * sx : canvas.offsetWidth) + 'px';
    overlay.style.height = (art ? art.h * sy : canvas.offsetHeight) + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'visible';
    overlay.style.zIndex = '15';
    overlay.style.display = (this.options.enabled && art) ? 'block' : 'none';

    const visibleDefects = this.defects.filter(d => {
      if (d.dismissed || d.shape === 'none') return false;   // no real position → listed only, never drawn
      if (this.options.filter === 'all') return true;
      if (this.options.filter === 'fatal') return d.severity === 'Fatal';
      if (this.options.filter === 'major') return d.severity === 'Major';
      if (this.options.filter === 'minor') return d.severity === 'Minor';
      if (this.options.filter === 'review') return d.severity === 'Review';
      return d.type === this.options.filter;
    });

    if (visibleDefects.length === 0) {
      overlay.innerHTML = '';
      return;
    }

    const isBlinking = this.options.blinking;
    // Labels only where they help: the selected marker, or every marker when there are only a few
    const showAllTags = visibleDefects.length <= 6;
    let html = '';

    visibleDefects.forEach(defect => {
      const isActive = (this._activeDefectId === defect.id);
      const isIntentional = defect.intentional;
      const showTag = showAllTags || isActive;
      const confTxt = defect.confidence ? ` · ${Math.round(defect.confidence * 100)}%` : '';
      const tip = `${defect.title}: ${defect.details.description}`.replace(/"/g, '&quot;');

      if (defect.shape === 'edges') {
        const col = isIntentional ? '#22c55e' : '#0ea5e9';
        (defect.sides || []).forEach(side => {
          const pos = side === 'top' ? 'left:0; top:0; width:100%; height:6px;'
            : side === 'bottom' ? 'left:0; bottom:0; width:100%; height:6px;'
            : side === 'left' ? 'left:0; top:0; width:6px; height:100%;'
            : 'right:0; top:0; width:6px; height:100%;';
          html += `<div class="ai-highlight-item ${isActive ? 'ai-pulse-active' : ''}" style="${pos} background:${col}; opacity:0.55; border-radius:2px;"
                     onclick="AgenticAiInspector.handleMarkerClick('${defect.id}', event)" title="${tip}"></div>`;
        });
        if (showTag) {
          // Put the label next to the edge it describes
          const first = (defect.sides || ['top'])[0];
          const at = first === 'bottom' ? 'left:50%; top:calc(100% - 34px);'
            : first === 'left' ? 'left:16px; top:50%;'
            : first === 'right' ? 'left:calc(100% - 16px); top:50%;'
            : 'left:50%; top:10px;';
          const shift = first === 'left' ? 'left:0; transform:none;' : first === 'right' ? 'left:auto; right:0; transform:none;' : '';
          html += `<div class="ai-highlight-item" style="${at} width:0; height:0;">
                     <div class="ai-marker-tag" style="background:${isIntentional ? '#15803d' : '#0369a1'}; color:#ffffff; bottom:auto; top:0; ${shift}">${isIntentional ? '🟢 Marked as planned border' : '🔵 ' + defect.title}</div>
                   </div>`;
        }
      } else if (defect.shape === 'circle') {
        const blinkClass = isBlinking && !isIntentional ? 'ai-blink-circle' : '';
        const activeClass = isActive ? 'ai-pulse-active' : '';
        const tagColor = isIntentional ? '#15803d' : defect.severity === 'Review' ? '#475569' : '#b91c1c';

        html += `
          <div class="ai-highlight-item ai-highlight-circle ${blinkClass} ${activeClass}" 
               id="marker-${defect.id}"
               style="left:${defect.cxPercent}%; top:${defect.cyPercent}%; transform:translate(-50%, -50%); border-color:${isIntentional ? '#22c55e' : '#ef4444'};"
               onclick="AgenticAiInspector.handleMarkerClick('${defect.id}', event)"
               title="${tip}">
            <div class="ai-circle-core" style="background:${isIntentional ? '#22c55e' : '#ef4444'};"></div>
            ${showTag ? `<div class="ai-marker-tag" style="background:${tagColor}; color:#ffffff;">
              ${isIntentional ? '🟢 Marked intentional' : `${defect.title}${confTxt}`}
            </div>` : ''}
          </div>
        `;
      } else {
        const isTypo = (defect.type === 'spelling');
        const isFatal = (defect.severity === 'Fatal');
        const blinkClass = isBlinking && !isIntentional ? (isTypo ? 'ai-blink-typo-box' : 'ai-blink-line-box') : '';
        const activeClass = isActive ? 'ai-pulse-active' : '';
        const boxBorderColor = isIntentional ? '#22c55e' : isFatal ? '#ef4444' : isTypo ? '#f59e0b' : '#ea580c';
        const tagBg = isIntentional ? '#15803d' : isFatal ? '#991b1b' : isTypo ? '#b45309' : defect.severity === 'Review' ? '#475569' : '#c2410c';
        const tagText = isIntentional ? '🟢 Marked intentional' : `${defect.title}${confTxt}`;
        // Pad the box so a 1 px line is still easy to see
        const padX = 0.6, padY = 0.8;

        html += `
          <div class="ai-highlight-item ${blinkClass} ${activeClass}"
               id="marker-${defect.id}"
               style="left:${Math.max(0, defect.xPercent - padX)}%; top:${Math.max(0, defect.yPercent - padY)}%; width:${defect.wPercent + 2 * padX}%; height:${defect.hPercent + 2 * padY}%; border:2.5px solid ${boxBorderColor}; background:rgba(0,0,0,0.05); border-radius:4px;"
               onclick="AgenticAiInspector.handleMarkerClick('${defect.id}', event)"
               title="${tip}">
            ${showTag ? `<div class="ai-marker-tag" style="background:${tagBg}; color:#ffffff;">${tagText}</div>` : ''}
          </div>
        `;
      }
    });

    overlay.innerHTML = html;
  },

  handleMarkerClick(defectId, evt) {
    if (evt) evt.stopPropagation();
    this.locateDefect(defectId);
  },

  locateDefect(defectId) {
    this._activeDefectId = defectId;
    this.renderOverlay();
    this.activeTab = 'issues';
    this.updateControlsUI();

    const row = document.getElementById(`row-${defectId}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.background = '#fef3c7';
      row.style.borderColor = '#f59e0b';
      setTimeout(() => {
        row.style.background = '#f8fafc';
        row.style.borderColor = '#e2e8f0';
      }, 1800);
    }
  },

  markIntentional(defectId) {
    const d = this.defects.find(item => item.id === defectId);
    if (d) {
      d.intentional = true;
      d.severity = 'Review';
      this.renderOverlay();
      this.updateControlsUI();
      this.syncPrecheckReport();
    }
  },

  dismissDefect(defectId) {
    const d = this.defects.find(item => item.id === defectId);
    if (d) {
      d.dismissed = true;
      this.renderOverlay();
      this.updateControlsUI();
      this.syncPrecheckReport();
    }
  },

  // ── Bulk actions: close / mark intentional all open findings at once (one-step undo) ──
  _lastBulk: null,

  _refreshAfterBulk() {
    this._activeDefectId = null;
    this.renderOverlay();
    this.updateControlsUI();
    this.syncPrecheckReport();
  },

  closeAll() {
    const ids = this.defects.filter(d => !d.dismissed).map(d => d.id);
    if (!ids.length) return;
    this.defects.forEach(d => { if (ids.includes(d.id)) d.dismissed = true; });
    this._lastBulk = { type: 'close', ids };
    this._refreshAfterBulk();
  },

  markAllIntentional() {
    const targets = this.defects.filter(d => !d.dismissed && !d.intentional);
    if (!targets.length) return;
    targets.forEach(d => { d._severityBefore = d.severity; d.intentional = true; d.severity = 'Review'; });
    this._lastBulk = { type: 'intentional', ids: targets.map(d => d.id) };
    this._refreshAfterBulk();
  },

  undoBulk() {
    const b = this._lastBulk;
    if (!b) return;
    this.defects.forEach(d => {
      if (!b.ids.includes(d.id)) return;
      if (b.type === 'close') d.dismissed = false;
      if (b.type === 'intentional') { d.intentional = false; d.severity = d._severityBefore || d.severity; }
    });
    this._lastBulk = null;
    this._refreshAfterBulk();
  },

  restoreClosed() {
    this.defects.forEach(d => { d.dismissed = false; });
    this._lastBulk = null;
    this._refreshAfterBulk();
  },

  /** Bar above the findings list: counts + Close all / Mark all intentional / Undo / Restore */
  _renderBulkBar() {
    const open = this.defects.filter(d => !d.dismissed && !d.intentional).length;
    const intentional = this.defects.filter(d => !d.dismissed && d.intentional).length;
    const closed = this.defects.filter(d => d.dismissed).length;
    if (!open && !intentional && !closed) return '';
    const btn = 'border-radius:6px; padding:6px 12px; font-size:11.5px; font-weight:800; cursor:pointer;';
    const undoLabel = this._lastBulk ? (this._lastBulk.type === 'close' ? `↺ Undo close all (${this._lastBulk.ids.length})` : `↺ Undo mark all intentional (${this._lastBulk.ids.length})`) : '';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:10px; padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
        <div style="font-size:12px; color:#334155; font-weight:700;">
          ${open} open${intentional ? ` · ${intentional} marked intentional` : ''}${closed ? ` · ${closed} closed` : ''}
        </div>
        <div style="display:flex; gap:6px; flex-wrap:wrap;">
          ${open ? `<button type="button" onclick="AgenticAiInspector.markAllIntentional()" title="Confirm every open finding is part of the design" style="${btn} background:#ffffff; color:#16a34a; border:1px solid #86efac;">🟢 Mark all intentional</button>` : ''}
          ${(open || intentional) ? `<button type="button" onclick="AgenticAiInspector.closeAll()" title="Close every finding in this list" style="${btn} background:#334155; color:#ffffff; border:1px solid #334155;">✕ Close all (${open + intentional})</button>` : ''}
          ${this._lastBulk ? `<button type="button" onclick="AgenticAiInspector.undoBulk()" style="${btn} background:#ffffff; color:#c2410c; border:1px solid #fed7aa;">${undoLabel}</button>`
            : closed ? `<button type="button" onclick="AgenticAiInspector.restoreClosed()" style="${btn} background:#ffffff; color:#475569; border:1px solid #cbd5e1;">↺ Restore closed (${closed})</button>` : ''}
        </div>
      </div>`;
  },

  toggleBlinking() {
    this.options.blinking = !this.options.blinking;
    this.renderOverlay();
    this.updateControlsUI();
  },

  toggleOverlay() {
    this.options.enabled = !this.options.enabled;
    this.renderOverlay();
    this.updateControlsUI();
  },

  switchScannerTab(tabName) {
    this.activeTab = tabName;
    this.updateControlsUI();
  },

  setFilter(filterName) {
    this.options.filter = filterName;
    this.renderOverlay();
    this.updateControlsUI();
  },

  updateControlsUI() {
    const activeCount = this.defects.filter(d => !d.dismissed && !d.intentional).length;
    const countBadge = document.getElementById('ai-defect-count-badge');
    if (countBadge) {
      countBadge.textContent = activeCount;
      countBadge.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }

    const panelContainer = document.getElementById('ai-inspector-panel-container');
    if (panelContainer) {
      panelContainer.innerHTML = this.renderAuditPanel();
    }
  },

  /**
   * Render the comprehensive 6-Tab AI Artwork QA Scanner UI
   */
  renderAuditPanel() {
    const activeDefects = this.defects.filter(d => !d.dismissed);
    const fatal = activeDefects.filter(d => d.severity === 'Fatal' && !d.intentional);
    const major = activeDefects.filter(d => d.severity === 'Major' && !d.intentional);
    const minor = activeDefects.filter(d => d.severity === 'Minor' && !d.intentional);
    const review = activeDefects.filter(d => d.severity === 'Review' || d.intentional);
    const isClean = (activeDefects.length === 0 || activeDefects.every(d => d.intentional));

    const meta = this._lastArtworkMeta || { width: 800, height: 600, specName: 'Standard Print', orderDims: '36" × 24"' };

    return `
      <div class="agentic-ai-card" style="margin-top:14px; background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px 20px; box-shadow:0 3px 12px rgba(0,0,0,0.05); font-family:'Inter', sans-serif;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg, #2563eb, #ff5f1f); color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:900; box-shadow:0 2px 6px rgba(37,99,235,0.3);">
              🤖
            </div>
            <div>
              <div style="font-size:15px; font-weight:800; color:#0e2246; display:flex; align-items:center; gap:8px;">
                <span>AI Artwork QA Scanner</span>
                <span style="font-size:10px; font-weight:800; background:#f1f5f9; color:#3b82f6; padding:2px 8px; border-radius:12px; border:1px solid #bfdbfe;">AUTONOMOUS AUDIT</span>
              </div>
              <div style="font-size:11px; color:#64748b; margin-top:2px;">
                Dual-channel inspection: Unnecessary artwork marks (lines/dots) &amp; spelling mistakes with Brand Whitelist.
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.toggleBlinking()" style="background:#f8fafc; border:1px solid #cbd5e1; font-size:11px; font-weight:700; padding:5px 12px; border-radius:6px; cursor:pointer;">
              ⚡ Pulsing: <strong style="color:${this.options.blinking ? '#16a34a' : '#94a3b8'};">${this.options.blinking ? 'ON' : 'PAUSED'}</strong>
            </button>
            <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.toggleOverlay()" style="background:${this.options.enabled ? '#eff6ff' : '#f1f5f9'}; color:${this.options.enabled ? '#2563eb' : '#64748b'}; border:1px solid ${this.options.enabled ? '#bfdbfe' : '#cbd5e1'}; font-size:11px; font-weight:700; padding:5px 12px; border-radius:6px; cursor:pointer;">
              👁️ Markers: ${this.options.enabled ? 'Visible' : 'Hidden'}
            </button>
          </div>
        </div>

        <!-- 6 Specialized Workflow Tabs -->
        <div style="display:flex; gap:6px; margin-bottom:14px; border-bottom:2px solid #e2e8f0; padding-bottom:2px; overflow-x:auto;">
          ${this._renderTabButton('artwork', '🖼️ Artwork', '')}
          ${this._renderTabButton('issues', '⚠️ Issues', activeDefects.length > 0 ? activeDefects.length : '')}
          ${this._renderTabButton('proof', '🔲 Highlighted Proof', '')}
          ${this._renderTabButton('text', '📝 Text Check', this.extractedText.length > 0 ? this.extractedText.length : '')}
          ${this._renderTabButton('stray', '⚡ Stray Elements', (activeDefects.filter(d => d.type !== 'spelling')).length || '')}
          ${this._renderTabButton('summary', '📊 QA Summary', fatal.length > 0 ? '🔴' : major.length > 0 ? '🟠' : '')}
        </div>

        <!-- Tab Body Content -->
        ${this._renderActiveTabContent(activeDefects, fatal, major, minor, review, isClean, meta)}
      </div>
    `;
  },

  _renderTabButton(tabKey, label, badge) {
    const isActive = (this.activeTab === tabKey);
    const activeStyle = isActive
      ? 'border-bottom:3px solid #ff5f1f; color:#ff5f1f; font-weight:800; background:#fff7ed;'
      : 'color:#64748b; font-weight:600; background:transparent; border-bottom:3px solid transparent;';

    return `
      <button type="button" onclick="AgenticAiInspector.switchScannerTab('${tabKey}')" style="border:none; outline:none; padding:8px 14px; font-size:12px; cursor:pointer; border-radius:6px 6px 0 0; display:flex; align-items:center; gap:6px; transition:all 0.15s ease; ${activeStyle}">
        <span>${label}</span>
        ${badge !== '' ? `<span style="font-size:9.5px; font-weight:800; background:${isActive ? '#ff5f1f' : '#e2e8f0'}; color:${isActive ? '#fff' : '#475569'}; padding:1px 6px; border-radius:10px;">${badge}</span>` : ''}
      </button>
    `;
  },

  _renderActiveTabContent(activeDefects, fatal, major, minor, review, isClean, meta) {
    switch (this.activeTab) {
      case 'artwork':
        return this._renderArtworkTab(meta);
      case 'proof':
        return this._renderProofTab(activeDefects);
      case 'text':
        return this._renderTextCheckTab();
      case 'stray':
        return this._renderStrayElementsTab(activeDefects);
      case 'summary':
        return this._renderSummaryTab(fatal, major, minor, review, isClean);
      case 'issues':
      default:
        return this._renderIssuesTab(activeDefects, isClean);
    }
  },

  _renderArtworkTab(meta) {
    return `
      <div style="padding:12px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:12px;">
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Artwork Dimensions</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.width} × ${meta.height} px</div>
          </div>
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Order Target Size</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.orderDims}</div>
          </div>
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Product Specification</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.specName}</div>
          </div>
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Aspect Ratio</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.aspect}:1</div>
          </div>
          ${this.scanResult ? `
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Artwork Type (estimated)</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${this.ARTWORK_TYPE_LABELS[this.scanResult.artworkType]}</div>
          </div>
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Area Checked for Stray Marks</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${this.scanResult.checkedPct}% (flat colour)</div>
          </div>` : ''}
        </div>
        <div style="font-size:11.5px; color:#475569; line-height:1.5;">
          ${this.scanSkipReason
            ? 'ℹ️ ' + this.scanSkipReason
            : this.scanResult
              ? `ℹ️ ${this.scanResult.solidPct}% of the artwork is solid colour and ${this.scanResult.detailPct}% is photo / texture detail. Stray marks are only searched for on clear flat-colour areas (away from text, logos and photos), where a lone dot or line cannot be part of the picture. Photo and illustration areas need a visual check at 100% zoom.`
              : 'ℹ️ Waiting for the artwork to load…'}
        </div>
      </div>
    `;
  },

  _renderIssuesTab(activeDefects, isClean) {
    if (isClean) {
      return `
        ${this._renderBulkBar()}
        <div style="padding:22px; text-align:center; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">
          <div style="font-size:24px; margin-bottom:6px;">✨</div>
          <div style="font-size:14px; font-weight:800; color:#166534;">${this.getCheckSummary().found}</div>
          <div style="font-size:11.5px; color:#15803d; margin-top:4px;">
            ${this.getCheckSummary().detail}
          </div>
        </div>
      `;
    }

    return `
      ${this._renderBulkBar()}
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${activeDefects.map(d => {
          const isTypo = (d.type === 'spelling');
          const isFatal = (d.severity === 'Fatal');
          const isMajor = (d.severity === 'Major');
          const isReview = (d.severity === 'Review' || d.intentional);

          const badgeBg = isFatal ? '#fee2e2' : isMajor ? '#ffedd5' : isReview ? '#f1f5f9' : '#fef3c7';
          const badgeColor = isFatal ? '#991b1b' : isMajor ? '#c2410c' : isReview ? '#475569' : '#b45309';
          const icon = isFatal ? '🔴' : isMajor ? '🟠' : isReview ? '🔵' : isTypo ? '📝' : '⚡';

          return `
            <div class="ai-defect-row" id="row-${d.id}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:${d.intentional ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${d.intentional ? '#bbf7d0' : '#e2e8f0'}; border-radius:8px; transition:all 0.15s ease;">
              <div style="display:flex; align-items:center; gap:12px; flex:1;">
                <span style="font-size:20px;">${icon}</span>
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12.5px; font-weight:800; color:#0e2246;">${d.title}</span>
                    <span style="font-size:10px; font-weight:800; background:${badgeBg}; color:${badgeColor}; padding:2px 8px; border-radius:4px; text-transform:uppercase;">
                      ${d.severity}
                    </span>
                    ${d.confidence ? `<span style="font-size:10px; font-weight:700; color:#64748b;">Confidence: ${Math.round(d.confidence * 100)}%</span>` : ''}
                  </div>
                  <div style="font-size:11px; color:#475569; margin-top:3px;">
                    ${d.details.description}
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.locateDefect('${d.id}')" style="background:#ff5f1f; color:#ffffff; border:none; padding:5px 12px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer;">
                  🎯 Locate
                </button>
                ${!d.intentional ? `
                  <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.markIntentional('${d.id}')" title="Confirm as intentional design element" style="background:#ffffff; color:#16a34a; border:1px solid #86efac; padding:5px 10px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer;">
                    🟢 Intentional
                  </button>
                ` : `
                  <span style="font-size:11px; font-weight:700; color:#16a34a; padding:4px 8px; background:#dcfce7; border-radius:4px;">✓ Verified</span>
                `}
                <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.dismissDefect('${d.id}')" title="Dismiss finding" style="background:#ffffff; color:#64748b; border:1px solid #cbd5e1; padding:5px 8px; font-size:11px; border-radius:5px; cursor:pointer;">
                  ✕
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  _renderProofTab(activeDefects) {
    return `
      <div style="padding:14px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:12.5px; font-weight:800; color:#1e293b;">Annotated Visual Proof Legend</div>
          <div style="display:flex; gap:12px; font-size:11px;">
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#ef4444; border-radius:2px;"></span> 🔴 Fatal / Stray Line</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#f59e0b; border-radius:2px;"></span> 🟠 Major Typo</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#06b6d4; border-radius:50%;"></span> 🔴 Stray Dot</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#22c55e; border-radius:2px;"></span> 🟢 Verified Intentional</span>
          </div>
        </div>
        <div style="font-size:11.5px; color:#475569; line-height:1.5;">
          All detected issues are actively mapped onto the primary artwork canvas above with interactive pulsing markers. Click any marker tag or the "🎯 Locate" button to center and spotlight the artifact.
        </div>
      </div>
    `;
  },

  _renderTextCheckTab() {
    const st = this.textState || {};
    const box = (inner, bg = '#f8fafc', bd = '#e2e8f0') => `<div style="padding:12px 14px; background:${bg}; border:1px solid ${bd}; border-radius:8px; font-size:11.5px; color:#475569; line-height:1.5;">${inner}</div>`;
    if (this.scanSkipReason) return box('ℹ️ The artwork pixels could not be read in the browser, so its text was not checked. Proofread the artwork manually.');
    if (!this.textResult) {
      if (st.status === 'unavailable') return box(`⚠️ ${st.text}`, '#fffbeb', '#fde68a');
      return box(`<span class="spinner" style="display:inline-block; width:12px; height:12px; vertical-align:middle; margin-right:6px;"></span>${st.text || 'Waiting for the artwork…'}`);
    }
    const r = this.textResult;
    const dir = r.orientation && r.orientation.angle
      ? `<div style="margin-bottom:10px;">${box(`🔄 <strong>The text reads ${r.orientation.angle === 180 ? 'upside down' : 'sideways'}</strong> — it was read with the artwork turned ${r.orientation.angle}° clockwise. See the Orientation check.`, '#fef2f2', '#fecaca')}</div>`
      : '';
    const chip = (t) => {
      const map = { word: ['#fee2e2', '#991b1b', `⚠️ → ${t.suggestion}`], web: ['#fee2e2', '#991b1b', `⚠️ → ${t.suggestion}`],
        brand: ['#fee2e2', '#991b1b', `🔴 brand → ${t.suggestion}`], verify: ['#fef9c3', '#854d0e', `❓ verify (${t.suggestion}?)`] };
      const [bg, col, label] = map[t.kind] || (t.conf >= this.MIN_TEXT_CONF ? ['#f0fdf4', '#166534', '✓'] : ['#f1f5f9', '#64748b', `unclear ${t.conf}%`]);
      return `<span style="display:inline-flex; align-items:center; gap:6px; background:#fff; border:1px solid #e2e8f0; border-radius:6px; padding:4px 8px; margin:0 6px 6px 0;">
        <span style="font-size:12px; font-weight:800; color:#0e2246;">${t.word}</span>
        <span style="font-size:9.5px; font-weight:800; background:${bg}; color:${col}; padding:1px 6px; border-radius:4px;">${label}</span></span>`;
    };
    const verify = this.textVerify.length
      ? `<div style="margin-top:10px;">${box(`❓ <strong>Names / uncommon words to verify:</strong> ${this.textVerify.map(v => `${v.text}`).join(', ')}. These are not in the dictionary but look like names, so they are not marked as mistakes — check them against the order.`, '#fefce8', '#fde68a')}</div>`
      : '';
    return `
      <div>
        ${dir}
        <div style="font-size:12px; font-weight:800; color:#1e293b; margin-bottom:8px;">Text read on the artwork (OCR — machine reading, confirm by eye):</div>
        <div>${this.extractedText.length ? this.extractedText.map(chip).join('') : '<span style="font-size:11.5px; color:#64748b;">No readable text found.</span>'}</div>
        ${verify}
        <div style="margin-top:10px; font-size:10.5px; color:#64748b;">Checked against US + UK English dictionaries, brand names and web / e-mail endings. Words read with less than ${this.MIN_TEXT_CONF}% certainty are not judged. Phone numbers and dates are not verified automatically.</div>
      </div>
    `;
  },

  _renderStrayElementsTab(activeDefects) {
    const strayItems = activeDefects.filter(d => d.type !== 'spelling');
    const closedStray = this.defects.filter(d => d.dismissed && d.type !== 'spelling').length;
    if (strayItems.length === 0) {
      return `
        ${this._renderBulkBar()}
        <div style="padding:18px; text-align:center; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px;">
          <div style="font-size:13px; font-weight:800; color:#166534;">${closedStray ? `All ${closedStray} stray findings closed by the designer` : 'No stray lines or dots found'}</div>
          <div style="font-size:11px; color:#15803d; margin-top:2px;">
            ${this.scanSkipReason || (this.scanResult ? `Checked ${this.scanResult.checkedPct}% of the artwork (clear flat-colour areas). Photo and illustration areas are not auto-checked.` : 'Waiting for the artwork to load…')}
          </div>
        </div>
      `;
    }

    return `
      ${this._renderBulkBar()}
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${strayItems.map(s => `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:12px; font-weight:800; color:#1e293b;">${s.title}</div>
              <div style="font-size:10.5px; color:#64748b; margin-top:2px;">${s.details.description}</div>
            </div>
            ${s.confidence ? `<span style="font-size:11px; font-weight:800; color:#ff5f1f; background:#fff7ed; padding:3px 8px; border-radius:4px; border:1px solid #ffedd5;">
              Confidence: ${Math.round(s.confidence * 100)}%
            </span>` : ''}
          </div>
        `).join('')}
      </div>
    `;
  },

  _renderSummaryTab(fatal, major, minor, review, isClean) {
    const qaSummary = this.getCheckSummary();
    const qaDecision = fatal.length > 0 ? 'Fix required: spelling error on a brand / customer name' :
                       major.length > 0 ? 'Action required: major issues flagged' :
                       minor.length > 0 ? 'Review: possible stray marks found' :
                       qaSummary.status === 'PASS' ? 'No stray marks found in the checked area' :
                       'Manual check: ' + qaSummary.found;

    const needsLook = minor.length > 0 || qaSummary.status !== 'PASS';
    const decisionColor = fatal.length > 0 ? '#b91c1c' : major.length > 0 ? '#c2410c' : needsLook ? '#b45309' : '#15803d';
    const decisionBg = fatal.length > 0 ? '#fef2f2' : major.length > 0 ? '#fff7ed' : needsLook ? '#fffbeb' : '#f0fdf4';

    return `
      <div>
        <!-- Metric Cards -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:14px;">
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#b91c1c;">${fatal.length}</div>
            <div style="font-size:10px; font-weight:800; color:#991b1b; text-transform:uppercase;">🔴 Fatal</div>
          </div>
          <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#c2410c;">${major.length}</div>
            <div style="font-size:10px; font-weight:800; color:#9a3412; text-transform:uppercase;">🟠 Major</div>
          </div>
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#b45309;">${minor.length}</div>
            <div style="font-size:10px; font-weight:800; color:#92400e; text-transform:uppercase;">🟡 Minor</div>
          </div>
          <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#475569;">${review.length}</div>
            <div style="font-size:10px; font-weight:800; color:#334155; text-transform:uppercase;">🔵 Review</div>
          </div>
        </div>

        <!-- QA Decision Banner -->
        <div style="padding:14px; background:${decisionBg}; border:1px solid ${decisionColor}; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Scanner result (designer decides)</div>
            <div style="font-size:14px; font-weight:900; color:${decisionColor}; margin-top:2px;">${qaDecision}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-sm" onclick="alert('QA Sign-Off Confirmed for Production.')" style="background:#15803d; color:#ffffff; border:none; padding:6px 14px; font-size:11px; font-weight:800; border-radius:5px; cursor:pointer;">
              ✓ Sign-Off PASS
            </button>
            <button type="button" class="btn btn-sm" onclick="alert('Sent to pre-press retouching queue.')" style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding:6px 12px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer;">
              ✏️ Retouch Queue
            </button>
          </div>
        </div>
      </div>
    `;
  },

  onCanvasRedraw(canvas, img, spec, dims) {
    if (!this.options.autoScan) return;
    this.scanArtwork(canvas, img, spec, dims);
  },

  getDefects() {
    return this.defects.filter(d => !d.dismissed);
  }
};

// Expose globally
if (typeof window !== 'undefined') {
  window.AgenticAiInspector = AgenticAiInspector;
}
