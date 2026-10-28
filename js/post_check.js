/**
 * Design Intelligence Hub - Design file reader (PDF) for OPS-Intel
 *
 * A PDF uploaded to OPS-Intel is read once with pdf.js (page 1, the file read in 1 MB parts so large print files open
 * without loading them whole). The page drawn in that pass is the artwork every other OPS-Intel check works on
 * (spelling, safe zone, lines & dots, colour); this module adds what only a design file has:
 *  · what the page is made of — vector shapes, live text, pictures — vector, raster (one flattened picture) or
 *    partly raster
 *  · every picture where it is placed: its PPI at the placed size and its real detail (DetailCheck: a small picture
 *    enlarged to 125 PPI has the pixels but not the detail); designs made at 1:N scale are judged at the order size
 *  · page size against the order and the SOP production canvas, colour mode (SOP PS settings: CMYK) and fonts
 *    (embedded or outlined)
 * These checks replace the artwork size / resolution cards for a PDF in the OPS-Intel report.
 */
const PostCheck = {
  // ── Reading the PDF ─────────────────────────────────────────────────────────
  async analyze(file, step, alive = () => true) {
    const pdfjs = await FileAnalyzer._loadPdfJs();
    const dictsP = this._scanDicts(file);
    const stop = () => { if (!alive()) throw new Error('Stopped: a newer file was uploaded.'); };
    const doc = await pdfjs.getDocument(this._source(pdfjs, file)).promise;
    try {
      stop();
      const pg = await doc.getPage(1);
      const vp = pg.getViewport({ scale: 1 });
      // One pass over the page: drawing the preview fetches the drawing operations and decodes every picture once;
      // they are read from that pass (a second pass would decode the pictures again — too much memory on big files)
      const pre = await dictsP;
      const mp = Object.keys(pre.cs).reduce((a, k) => { const [w, h] = k.split('x').map(Number); return a + w * h * pre.cs[k].length; }, 0) / 1e6;
      step(mp > 300
        ? `Reading the page — ${Object.values(pre.cs).reduce((a, l) => a + l.length, 0)} pictures, ${Math.round(mp).toLocaleString()} megapixels: a large file takes about a minute…`
        : 'Reading the page — vector, text and pictures…');
      const scale = Math.min(4, 2400 / Math.max(vp.width, vp.height));   // the artwork size every other check reads
      const pv = pg.getViewport({ scale });
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(pv.width)); cv.height = Math.max(1, Math.round(pv.height));
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
      const task = pg.render({ canvasContext: ctx, viewport: pv });
      const drawn = await Promise.race([task.promise.then(() => true), new Promise(r => {
        const t0 = Date.now(), iv = setInterval(() => { if (!alive() || Date.now() - t0 > 90000) { clearInterval(iv); r(false); } }, 400);
        task.promise.then(() => clearInterval(iv), () => clearInterval(iv));
      })]);
      if (!drawn) task.cancel();
      stop();
      const preview = drawn ? cv.toDataURL('image/jpeg', 0.92) : '';
      const ol = (drawn && this._renderedOps(pg)) || await pg.getOperatorList();
      const dicts = await dictsP;
      stop();
      // Pages over 200" use /UserUnit (one unit = several points); pdf.js draws them in points
      const uu = (pg.userUnit > 0 ? pg.userUnit : 0) || dicts.userUnit || 1;
      const w = this._walk(pdfjs.OPS, ol, vp, uu);
      const pageIn = { w: +(vp.width * uu / 72).toFixed(2), h: +(vp.height * uu / 72).toFixed(2) };

      // Pictures: one entry per picture (copies drawn twice in the same place count once)
      const pics = [];
      for (const pl of w.places) {
        const twin = pics.find(p => (pl.id && p.ids.includes(pl.id))
          || (p.w === pl.w && p.h === pl.h && p.box.every((v, i) => Math.abs(v - pl.box[i]) < 1)));
        if (twin) {
          if (pl.id && !twin.ids.includes(pl.id)) twin.ids.push(pl.id);
          if (pl.ppi < twin.ppi) Object.assign(twin, { ppi: pl.ppi, inW: pl.inW, inH: pl.inH, box: pl.box, ctm: pl.ctm });
          twin.copies++;
          continue;
        }
        pics.push(Object.assign({ ids: pl.id ? [pl.id] : [], copies: 1 }, pl));
      }
      const pageArea = vp.width * vp.height;
      pics.forEach(p => {
        const bw = Math.max(0, Math.min(p.box[2], vp.width) - Math.max(p.box[0], 0));
        const bh = Math.max(0, Math.min(p.box[3], vp.height) - Math.max(p.box[1], 0));
        p.coverPct = +(bw * bh / pageArea * 100).toFixed(1);
        p.areaIn = p.inW * p.inH;
        p.cs = p.kind === 'mask' ? 'Mask' : this._colourOf(dicts, p.w, p.h);
      });
      pics.sort((a, b) => (b.kind !== 'mask') - (a.kind !== 'mask') || b.areaIn - a.areaIn);
      pics.forEach((p, i) => { p.n = i + 1; });

      // Real detail of each picture (largest first), measured on its own pixels
      const measured = pics.filter(p => p.kind !== 'mask' && p.areaIn >= 1).slice(0, 10);
      for (let i = 0; i < measured.length; i++) {
        const p = measured[i];
        stop();
        step(`Measuring the detail of picture ${p.n} of ${pics.length} (${p.w.toLocaleString()} × ${p.h.toLocaleString()} px)…`);
        const data = p.inline || await this._obj(pg, p.ids[0]);
        const src = data && (data.bitmap || this._canvasFrom(data));
        p.detail = src ? await DetailCheck.measure(src) : { verdict: 'unknown', reason: 'The picture could not be read for the detail check.', tiles: [], edges: 0 };
        p.detail.tiles = (p.detail.tiles || []).filter(t => t.state !== 'sharp').map(t => Object.assign(t, { vbox: this._tileBox(p, t, vp) }));
        // the whole picture for the zoomed print preview (moved around by hand)
        if (src) p.full = await this._fullCopy(src);
      }

      step('Checking the fonts…');
      const fonts = [];
      for (const name of w.fonts) {
        const f = await this._obj(pg, name, true);
        if (f) fonts.push({ name: String(f.name || name).replace(/^[A-Z]{6}\+/, ''), embedded: !f.missingFile || !!f.isType3Font, type: f.type || '' });
      }

      const cover = this._coverage(pics.filter(p => p.kind !== 'mask'), vp);
      const marks = w.paths + w.shadings;
      const kind = !pics.some(p => p.kind !== 'mask') ? (marks || w.texts ? 'vector' : 'empty')
        : cover >= 97 && marks <= 2 && !w.texts ? 'raster' : 'mixed';
      return {
        name: file.name, sizeMB: +(file.size / 1048576).toFixed(1), pages: doc.numPages, userUnit: uu,
        pageIn, rotate: pg.rotate || 0, vpW: vp.width, vpH: vp.height,
        preview, previewW: cv.width, previewH: cv.height,
        kind, cover, paths: w.paths, shadings: w.shadings, texts: w.texts, masks: pics.filter(p => p.kind === 'mask').length,
        pics, fonts, colourPartial: !!dicts.partial
      };
    } finally {
      doc.destroy();
    }
  },

  /** The drawing operations pdf.js fetched for the render (pdf.js 3.11 keeps them per rendering intent) */
  _renderedOps(pg) {
    let best = null;
    (pg._intentStates || new Map()).forEach(s => {
      const o = s && s.operatorList;
      if (o && o.lastChunk && o.fnArray && (!best || o.fnArray.length > best.fnArray.length)) best = o;
    });
    return best;
  },

  /** pdf.js reads the local file in 1 MB parts, only where it needs them */
  _source(pdfjs, file) {
    if (!this._Range || this._rangeLib !== pdfjs) {
      this._rangeLib = pdfjs;
      this._Range = class extends pdfjs.PDFDataRangeTransport {
        constructor(f) { super(f.size, null); this.f = f; }
        requestDataRange(b, e) { this.f.slice(b, e).arrayBuffer().then(buf => this.onDataRange(b, new Uint8Array(buf))); }
      };
    }
    return { range: new this._Range(file), rangeChunkSize: 1 << 20, disableAutoFetch: true, disableStream: true };
  },

  /**
   * One pass over the page's drawing operations: the current transformation (save / restore / transform / form
   * XObjects) gives every picture's placed size and position; painted paths, gradients and text are counted.
   */
  _walk(O, ol, vp, uu) {
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3],
      m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const PAINT = new Set([O.fill, O.eoFill, O.stroke, O.closeStroke, O.fillStroke, O.eoFillStroke, O.closeFillStroke, O.closeEOFillStroke]);
    const TEXT = new Set([O.showText, O.showSpacedText, O.nextLineShowText, O.nextLineSetSpacingShowText]);
    let ctm = [1, 0, 0, 1, 0, 0], open = false;
    const stack = [], places = [], fonts = new Set();
    let paths = 0, shadings = 0, texts = 0;
    const place = (m, kind, id, w, h, inline) => {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => vp.convertToViewportPoint(m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]));
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const inW = Math.hypot(m[0], m[1]) * uu / 72, inH = Math.hypot(m[2], m[3]) * uu / 72;
      if (!(inW > 0 && inH > 0 && w > 0 && h > 0)) return;
      places.push({ kind, id, w, h, inline, ctm: m.slice(), inW: +inW.toFixed(2), inH: +inH.toFixed(2),
        ppi: Math.round(Math.min(w / inW, h / inH)),
        box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
    };
    for (let i = 0; i < ol.fnArray.length; i++) {
      const fn = ol.fnArray[i], a = ol.argsArray[i];
      if (fn === O.save || fn === O.beginGroup) stack.push(ctm);
      else if (fn === O.restore || fn === O.endGroup) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mul(ctm, a);
      else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); if (a && a[0]) ctm = mul(ctm, a[0]); }
      else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm;
      else if (fn === O.constructPath) open = true;
      else if (PAINT.has(fn)) { if (open) paths++; open = false; }
      else if (fn === O.endPath) open = false;                       // a clipping path, not drawn
      else if (fn === O.shadingFill) shadings++;
      else if (TEXT.has(fn)) texts++;
      else if (fn === O.setFont) fonts.add(a[0]);
      else if (fn === O.paintImageXObject) place(ctm, 'picture', a[0], a[1], a[2]);
      else if (fn === O.paintInlineImageXObject) place(ctm, 'picture', null, a[0].width, a[0].height, a[0]);
      else if (fn === O.paintImageXObjectRepeat) {
        for (let k = 0; k + 1 < (a[3] || []).length; k += 2) place(mul(ctm, [a[1], 0, 0, a[2], a[3][k], a[3][k + 1]]), 'picture', a[0], 0, 0);
      } else if (fn === O.paintImageMaskXObject) place(ctm, 'mask', null, a[0].width, a[0].height);
    }
    // a repeated picture's size comes from its first normal placement, if any
    places.filter(p => !p.w).forEach(p => { const o = places.find(q => q.id === p.id && q.w); if (o) Object.assign(p, { w: o.w, h: o.h }); });
    return { places: places.filter(p => p.w > 0), paths, shadings, texts, fonts: [...fonts] };
  },

  _obj(pg, id, font) {
    const store = font || String(id).startsWith('g_') ? pg.commonObjs : pg.objs;
    return Promise.race([
      new Promise(res => { try { store.get(id, res); } catch (e) { res(null); } }),
      new Promise(res => setTimeout(() => res(null), 20000))
    ]);
  },

  /**
   * A copy of a whole picture for the zoomed print preview: a JPEG blob URL at the picture's own pixels, so 100 % /
   * Print size show the real pixels (a 6000 px copy stretched back up made the US2421709 banner — 13824 px — look
   * soft). Only beyond what the preview can show (16000 px, about 120 MP) is it scaled down; the preview still sizes
   * it by the picture's own pixels. { url, w, h } = native size.
   */
  async _fullCopy(src) {
    try {
      const W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
      const k = Math.min(1, 16000 / Math.max(W, H), Math.sqrt(120e6 / (W * H)));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W * k)); c.height = Math.max(1, Math.round(H * k));
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(src, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      return blob ? { url: URL.createObjectURL(blob), w: W, h: H } : null;
    } catch (e) {
      return null;
    }
  },

  /** pdf.js picture data without a bitmap (RGB / RGBA bytes) as a canvas; 1-bit pictures are not measured */
  _canvasFrom(d) {
    if (!d || !d.data || !d.width || !d.height || d.width * d.height > 40e6 || !(d.kind === 2 || d.kind === 3)) return null;
    const c = document.createElement('canvas');
    c.width = d.width; c.height = d.height;
    const ctx = c.getContext('2d'), img = ctx.createImageData(d.width, d.height), o = img.data, s = d.data;
    if (d.kind === 3) o.set(s.subarray(0, o.length));
    else for (let i = 0, j = 0; i < o.length; i += 4, j += 3) { o[i] = s[j]; o[i + 1] = s[j + 1]; o[i + 2] = s[j + 2]; o[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    return c;
  },

  /** A measured tile of a picture on the page [x0, y0, x1, y1] (viewport points; the picture's first row is the top of its unit square) */
  _tileBox(p, t, vp) {
    const m = p.ctm;
    const pts = [[t.x, t.y], [t.x + t.w, t.y], [t.x, t.y + t.h], [t.x + t.w, t.y + t.h]].map(([x, y]) => {
      const u = x / p.w, v = 1 - y / p.h;
      return vp.convertToViewportPoint(m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]);
    });
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  },

  /** Share of the page (%) covered by pictures, on a 120 × 120 grid */
  _coverage(pics, vp) {
    const N = 120, cell = new Uint8Array(N * N);
    pics.forEach(p => {
      const x0 = Math.max(0, Math.floor(p.box[0] / vp.width * N)), x1 = Math.min(N, Math.ceil(p.box[2] / vp.width * N));
      const y0 = Math.max(0, Math.floor(p.box[1] / vp.height * N)), y1 = Math.min(N, Math.ceil(p.box[3] / vp.height * N));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) cell[y * N + x] = 1;
    });
    let n = 0; for (const c of cell) n += c;
    return Math.round(n / (N * N) * 100);
  },

  /**
   * Picture colour spaces and /UserUnit from the file's own dictionaries (pdf.js turns every picture into screen
   * RGB, so the colour mode is read here). Read in 4 MB parts up to 160 MB.
   */
  async _scanDicts(file) {
    const out = { userUnit: 0, cs: {} }, dec = new TextDecoder('latin1'), CH = 4 << 20, LIMIT = 160 << 20;
    const objs = new Map(), imgs = [];          // object number → its first characters; picture size → its /ColorSpace text
    for (let off = 0; off < Math.min(file.size, LIMIT); off += CH) {
      const start = Math.max(0, off - 512);
      const txt = dec.decode(await file.slice(start, Math.min(file.size, off + CH)).arrayBuffer());
      const uu = !out.userUnit && txt.match(/\/UserUnit\s+([\d.]+)/);
      if (uu) out.userUnit = parseFloat(uu[1]) || 0;
      const ro = /(\d+)\s+\d+\s+obj\b/g;
      let m;
      while ((m = ro.exec(txt)) !== null) if (!objs.has(m[1])) objs.set(m[1], txt.substr(m.index + m[0].length, 240));
      const re = /\/Subtype\s*\/Image/g;
      while ((m = re.exec(txt)) !== null) {
        const ctx = txt.slice(Math.max(0, m.index - 300), m.index + 400);
        const w = ctx.match(/\/Width\s+(\d+)/), h = ctx.match(/\/Height\s+(\d+)/);
        if (!w || !h) continue;
        const c = ctx.match(/\/ColorSpace\s*([\s\S]{0,120})/);
        imgs.push({ key: `${w[1]}x${h[1]}`, raw: c ? c[1] : null, mask: /\/ImageMask\s+true/.test(ctx) });
      }
    }
    imgs.forEach(i => (out.cs[i.key] = out.cs[i.key] || []).push(i.raw ? this._csName(i.raw, objs) : i.mask ? 'Mask' : 'not stated'));
    if (file.size > LIMIT) out.partial = true;
    return out;
  },

  /** A /ColorSpace entry in plain words, following references (… 0 R) and ICC profiles (/N 1, 3 or 4 channels) */
  _csName(raw, objs, depth = 0) {
    const s = String(raw || '').trim();
    let m;
    if (depth > 3) return 'not stated';
    if ((m = s.match(/^\/(\w+)/))) return m[1];
    if ((m = s.match(/^(\d+)\s+\d+\s+R/))) return objs.has(m[1]) ? this._csName(objs.get(m[1]), objs, depth + 1) : 'not stated';
    if ((m = s.match(/^\[\s*\/ICCBased\s+(\d+)\s+\d+\s+R/))) {
      const n = (objs.get(m[1]) || '').match(/\/N\s+(\d)/);
      return n ? ({ 1: 'ICC Gray', 3: 'ICC RGB', 4: 'ICC CMYK' }[n[1]] || 'ICCBased') : 'ICCBased';
    }
    if ((m = s.match(/^\[\s*\/Indexed\s*([\s\S]*)/))) return `Indexed ${this._csName(m[1], objs, depth + 1)}`;
    if ((m = s.match(/^\[\s*\/(\w+)/))) return m[1];
    return 'not stated';
  },

  /** A picture's colour space; its soft mask (same size, DeviceGray) is not the picture */
  _colourOf(dicts, w, h) {
    const list = dicts.cs[`${w}x${h}`] || [];
    return list.find(c => c !== 'DeviceGray' && c !== 'Mask') || list[0] || (dicts.partial ? 'not read (large file)' : 'not stated');
  },

  // ── The checks ──────────────────────────────────────────────────────────────
  /**
   * The design-file checks for the OPS-Intel report. ctx: { spec, dims (order size, inches), parsed (file name), req
   * (SopRules.requirements) }. Returns { r, checks, resConcern, scale } — resConcern feeds the proof plan (Proof 03).
   */
  checksFor(r, ctx = {}) {
    const p = ctx.parsed || {}, dims = ctx.dims && ctx.dims.widthIn > 0 && ctx.dims.heightIn > 0 ? ctx.dims : null;
    const sopDims = dims || { widthIn: r.pageIn.w, heightIn: r.pageIn.h };
    const req = ctx.req || (typeof SopRules !== 'undefined'
      ? SopRules.requirements(ctx.spec, sopDims, Object.assign({}, p, { finishing: p.finishing || '' })) : null);
    // Large designs are sometimes made at 1:N scale (the page is the order ÷ N): PPI counts at the full order size
    const scale = dims ? this._scaleOf(r.pageIn, dims) : 1;
    // The SOP resolution chart goes by the printed size: the design page itself (a stand / cover template can be larger
    // than the nominal order size — a 10 ft pop-up prints 147.5" wide, 72 PPI like its production file), or the order
    // size for a 1:N scaled design
    const printDims = scale > 1 ? dims : { widthIn: r.pageIn.w, heightIn: r.pageIn.h };
    const res = typeof SopRules !== 'undefined' ? SopRules.resolution(ctx.spec, printDims, p)
      : req ? req.resolution : { target: 125, min: 72, source: 'Default 125 PPI' };
    r.pics.forEach(q => { q.at = Math.round(q.ppi / scale); });
    const pics = r.pics.filter(q => q.kind !== 'mask' && q.areaIn >= 1);
    const f1 = v => (+v).toFixed(1).replace(/\.0$/, '');
    const pagePx = `${f1(r.pageIn.w)}" × ${f1(r.pageIn.h)}"`;
    const order = dims ? `${f1(dims.widthIn)}" × ${f1(dims.heightIn)}"` : '';
    const checks = [];
    const show = q => `<button type="button" class="cc-show" onclick="PostCheck.showPic(${q.n})">Show</button>`;
    const picName = q => `Picture ${q.n} (${q.w.toLocaleString()} × ${q.h.toLocaleString()} px, placed ${f1(q.inW)}" × ${f1(q.inH)}")`;

    // 1. Pages
    checks.push({ id: 'pc-pages', name: 'Pages in the design file', icon: '📄',
      status: r.pages === 1 ? 'PASS' : 'INFO',
      found: r.pages === 1 ? '1 page' : `${r.pages} pages — page 1 checked`,
      required: 'One page per design file (front / back as separate files or pages as the order needs)',
      detail: r.pages === 1 ? 'The file has one page.' : `Only page 1 is checked here. ${r.pages === 2 ? 'Two pages are normal for a double-sided order (front and back).' : ''}`,
      action: r.pages === 1 ? '' : 'Check the other pages by eye, or save each page as its own PDF and check it here.' });

    // 2. Page size against the order and the SOP production canvas
    if (!dims) {
      checks.push({ id: 'pc-size', name: 'Page size against the order', icon: '📐', status: 'INFO',
        found: `Page ${pagePx} — the order size is not in the file name`,
        required: 'The order size (+ the SOP finishing allowance)',
        detail: `The file name does not carry the order size, so the page cannot be compared with the order.${r.userUnit !== 1 ? ` (Page scale /UserUnit ${r.userUnit} applied.)` : ''}`,
        action: 'Enter the order size in Order Details on the left — the checks update at once.' });
    } else {
      checks.push(this._sizeCheck(r, dims, req && req.canvas, pagePx, order, f1, scale));
    }

    // 4. Picture resolution where it is placed
    if (!pics.length) {
      checks.push({ id: 'pc-ppi', name: 'Picture resolution (placed size)', icon: '🖼️', status: 'PASS',
        found: r.kind === 'vector' ? 'No pictures — vector only' : 'No pictures over 1 square inch',
        required: `${res.target} PPI at the placed size (minimum ${res.min}) · ${res.source}`,
        detail: 'Vector shapes and text print sharp at any size; there is no picture to check.', action: '' });
    } else {
      const low = pics.filter(q => q.at < res.target);
      const worst = pics.reduce((a, b) => (b.at < a.at ? b : a));
      checks.push({ id: 'pc-ppi', name: 'Picture resolution (placed size)', icon: '🖼️',
        status: low.length ? 'FAIL' : 'PASS',
        found: pics.map(q => `Picture ${q.n}: ${q.at} PPI${scale > 1 ? ` (${q.ppi} on the 1:${scale} page)` : ''}`).join(' · '),
        error: low.length ? `${low.length === 1 ? picName(low[0]) + ' is' : low.length + ' pictures are'} under the SOP ${res.target} PPI — lowest ${worst.at} PPI${worst.at < res.min ? ` (minimum ${res.min})` : ''}` : '',
        items: low.map(q => `${picName(q)}: <strong>${q.at} PPI</strong> ${show(q)}`),
        required: `${res.target} PPI at the placed size (minimum ${res.min}) · ${res.source}`,
        detail: `PPI = picture pixels ÷ placed inches, for each picture where it sits on the page${scale > 1 ? `, at the full order size (the page is drawn at 1:${scale}, so the page PPI ÷ ${scale})` : ''}${r.userUnit !== 1 ? ` (page scale /UserUnit ${r.userUnit} applied)` : ''}. ${pics.map(q => `${picName(q)} → ${q.at} PPI`).join('; ')}.`,
        action: low.length ? `Replace the picture with a larger original, or rebuild it as vector. If the customer has nothing better, use the "${worst.at < res.min ? 'Low Resolution' : 'Bit Fuzzy'}" status with the Print preview screenshot (Proof 03) — PR-DPO-03.` : '' });
    }

    // 5. Real detail: enlarged / blurry pictures
    const measured = pics.filter(q => q.detail && q.detail.verdict !== 'unknown');
    if (pics.length) {
      // same rule as the print-quality status: edges up to 2 px count as made at size
      const judge = q => {
        const e = typeof PrintQuality !== 'undefined' ? PrintQuality.enlargement(q.detail) : null;
        if (!e) return 'none';
        const real = Math.round(q.at / e.all), realPart = e.part ? Math.round(q.at / e.part) : null;
        // the least sharp part decides, like the print-quality status (an enlarged part fails too)
        if ((e.all > 1 && real < res.min) || PrintQuality.partLow(realPart, res.min)) return 'fail';
        return (e.all > 1 && real < res.target) || (realPart && realPart < res.target) ? 'look' : 'ok';
      };
      const bad = pics.filter(q => judge(q) === 'fail'), look = pics.filter(q => judge(q) === 'look');
      const line = q => `${picName(q)}: ${DetailCheck.describe(q.detail, q.at)} ${show(q)}`;
      const qa = q => PrintQuality.assess({ ppi: q.at, det: q.detail, target: res.target, min: res.min });
      checks.push({ id: 'pc-detail', name: 'Real detail (enlarged / blurry pictures)', icon: '🔬',
        status: bad.length ? 'FAIL' : look.length || !measured.length ? 'INFO' : 'PASS',
        found: measured.length
          ? measured.map(q => { const a = qa(q); return `Picture ${q.n}: ${a ? a.label : q.detail.verdict} (edges ${q.detail.p25} px${a && a.real < q.at ? `, looks like ≈ ${a.real} PPI zoomed in` : ''})`; }).join(' · ')
          : 'Not enough clear edges to judge (flat colours)',
        error: bad.length ? `${bad.length === 1 ? 'Picture ' + bad[0].n + ' was' : bad.length + ' pictures were'} enlarged from a smaller picture: ${bad.map(q => `${q.at} PPI in the file, looks like ≈ ${qa(q).real} PPI zoomed in`).join('; ')} — SOP needs ${res.target} PPI` : '',
        items: [...bad, ...look].map(line),
        required: `Real detail at least ${res.min} PPI (target ${res.target}) — a picture made at its size has edges 1–1.6 px wide`,
        detail: `Measured on each picture's own pixels: how wide its sharpest edges are. A picture enlarged k× from a smaller one has edges about k× wider, whatever the PPI number says — its real detail is the PPI ÷ k. ${pics.map(q => `${picName(q)}: ${DetailCheck.describe(q.detail, q.at)}`).join(' ')}`,
        action: bad.length ? 'Ask the customer for the original (larger) picture or a vector logo, or rebuild the artwork. If there is nothing better, use the "Low Resolution" status with the Print preview screenshot (Proof 03) showing the soft area.'
          : look.length ? 'Look at the marked areas at print size (Photoshop "Print Size", 100% for 72 PPI files). If they look soft, use the "Bit Fuzzy" status with the Print preview screenshot (Proof 03).'
          : !measured.length ? 'The pictures have too few clear edges for the tool to judge (flat colours, soft gradients) — look at them at print size.' : '' });
    }

    // 6. Colour mode (SOP PS settings: CMYK 8-bit)
    const colPics = r.pics.filter(q => q.kind !== 'mask');
    if (!colPics.length) {
      checks.push({ id: 'pc-colour', name: 'Colour mode (CMYK)', icon: '🎨', status: 'INFO',
        found: 'Vector only — the colour mode of vector shapes is not read', required: 'CMYK (8-bit) · U.S. Web Coated (SWOP) v2 — SOP PS settings',
        detail: 'pdf.js turns vector colours into screen colours, so whether they were made in CMYK cannot be read here.',
        action: 'In Illustrator: File › Document Color Mode › CMYK (or Acrobat › Output Preview) before saving the PDF.' });
    } else {
      const rgb = colPics.filter(q => /RGB/i.test(q.cs)), unk = colPics.filter(q => !/RGB|CMYK|Gray|DeviceN|Separation/i.test(q.cs));
      checks.push({ id: 'pc-colour', name: 'Colour mode (CMYK)', icon: '🎨',
        status: rgb.length ? 'FAIL' : unk.length ? 'INFO' : 'PASS',
        found: colPics.map(q => `Picture ${q.n}: ${q.cs}`).join(' · '),
        error: rgb.length ? `${rgb.length === 1 ? 'Picture ' + rgb[0].n + ' is' : rgb.length + ' pictures are'} RGB — the SOP print colour mode is CMYK` : '',
        items: [...rgb, ...unk].map(q => `${picName(q)}: <strong>${this._esc(q.cs)}</strong> ${show(q)}`),
        required: 'CMYK (8-bit) · U.S. Web Coated (SWOP) v2 — SOP PS settings',
        detail: `Colour space written in the PDF for each picture.${unk.length ? ' "ICCBased" / "not stated" means the file uses a colour profile the tool cannot open here, so RGB or CMYK cannot be told apart.' : ''}${r.colourPartial ? ' Large file: only the first 160 MB were read for colour spaces.' : ''} Vector colours are not read.`,
        action: rgb.length ? 'Convert to CMYK (Edit › Convert to Profile › U.S. Web Coated (SWOP) v2) and save the PDF again — bright RGB greens and blues print duller in CMYK.'
          : unk.length ? 'Confirm the pictures are CMYK in Acrobat (Tools › Print Production › Output Preview).' : '' });
    }

    // 7. Fonts
    const missing = r.fonts.filter(f => !f.embedded);
    checks.push({ id: 'pc-fonts', name: 'Fonts (embedded or outlined)', icon: '🔤',
      status: missing.length ? 'FAIL' : 'PASS',
      found: !r.texts ? 'No live text — text is outlined or part of the picture'
        : `${r.fonts.length} font${r.fonts.length === 1 ? '' : 's'}: ${r.fonts.map(f => `${f.name} (${f.embedded ? 'embedded' : 'NOT embedded'})`).join(' · ')}`,
      error: missing.length ? `Font${missing.length > 1 ? 's' : ''} not embedded: ${missing.map(f => f.name).join(', ')} — the print RIP will swap ${missing.length > 1 ? 'them' : 'it'} for another font` : '',
      required: 'Text outlined (Create Outlines) or every font embedded in the PDF',
      detail: !r.texts ? 'The page has no live text, so no font can go missing at print.' : 'A font that is not embedded is replaced by a default font on the printing PC — spacing and letter shapes change.',
      action: missing.length ? 'Select all text › Type › Create Outlines (Illustrator), or save the PDF with fonts embedded (High Quality Print / PDF/X).' : '' });

    // 8. Pictures drawn more than once in the same place: only the top copy shows (layers / old versions kept when
    // saving) — a transparent top copy lets an older layer show through, and every copy makes the file heavier
    const stacked = r.pics.filter(q => q.kind !== 'mask' && q.copies > 1);
    if (stacked.length) {
      checks.push({ id: 'pc-stack', name: 'Hidden copies of pictures', icon: '🗂️', status: 'INFO',
        found: stacked.map(q => `Picture ${q.n} is drawn ${q.copies}× in the same place`).join(' · '),
        items: stacked.map(q => `${picName(q)}: <strong>${q.copies} copies</strong> on top of each other ${show(q)}`),
        required: 'Each picture once — hidden layers removed or the artwork flattened before saving the PDF',
        detail: `The PDF (${r.sizeMB} MB) carries the same picture ${stacked.length === 1 ? `${stacked[0].copies} times` : 'several times'} at the same place — usually layers or older versions kept when saving. Only the top copy shows; if it has transparency, an older layer can show through in print.`,
        action: 'Flatten the artwork (or delete the hidden layers) and save the PDF again.' });
    }

    // The status to set (Good to Go / Bit Fuzzy / Low Resolution): the worst picture as it looks at print size;
    // vector only → Good to Go. Proof 03 (print preview screenshot) unless Good to Go.
    let resConcern = null, quality = null;
    if (typeof PrintQuality !== 'undefined') {
      quality = pics.length ? PrintQuality.worst(pics.map(q => {
        const a = PrintQuality.assess({ ppi: q.at, det: q.detail, target: res.target, min: res.min });
        if (a) { a.pic = q.n; a.sample = q.detail && q.detail.sample ? Object.assign({ pic: q.n }, q.detail.sample) : null; a.full = q.full || null; }
        q.quality = a;                       // the pictures table shows each picture's status
        return a;
      })) : PrintQuality.vector();
      if (quality && quality.pic && pics.length > 1) quality.why = `Picture ${quality.pic}: ${quality.why}`;
      if (quality && quality.status !== 'good') resConcern = { ppi: quality.real, target: res.target, status: quality.status, blur: quality.real < quality.ppi, filePpi: quality.ppi };
    } else {
      const lowPic = pics.filter(q => q.at < res.target).sort((x, y) => x.at - y.at)[0];
      if (lowPic) resConcern = { ppi: lowPic.at, target: res.target };
    }
    this._picStates(r, checks);
    return { r, checks, resConcern, scale, quality };
  },

  /** 1:N when the page has the order's proportion (±1.5 %) at a fraction of its size (N ≥ 1.5), else 1 */
  _scaleOf(page, dims) {
    const turned = (page.w > page.h) !== (dims.widthIn > dims.heightIn);
    const ow = turned ? dims.heightIn : dims.widthIn, oh = turned ? dims.widthIn : dims.heightIn;
    const sw = ow / page.w, sh = oh / page.h;
    if (!(sw >= 1.5 && Math.abs(sw - sh) / sw < 0.015)) return 1;
    return [2, 3, 4, 5, 8, 10].find(n => Math.abs(sw - n) / n < 0.02) || +sw.toFixed(2);
  },

  /** Page size: the SOP production canvas when the file name states the finishing (banners), otherwise the order size + bleed */
  _sizeCheck(r, dims, canvas, pagePx, order, f1, scale) {
    const W = r.pageIn.w, H = r.pageIn.h, tol = 0.5;
    const turned = (W > H) !== (dims.widthIn > dims.heightIn);
    const [ow, oh] = turned ? [dims.heightIn, dims.widthIn] : [dims.widthIn, dims.heightIn];
    const cv = canvas && canvas.confirmed ? (turned ? { w: canvas.hIn, h: canvas.wIn } : { w: canvas.wIn, h: canvas.hIn }) : null;
    const near = (a, b) => Math.abs(a - b) <= tol;
    const base = { id: 'pc-size', name: 'Page size against the order', icon: '📐',
      required: cv ? `SOP production canvas ${f1(canvas.wIn)}" × ${f1(canvas.hIn)}" (${canvas.note}) · ±${tol}"`
        : `Order ${order} (+ bleed / template allowance) · ±${tol}"`,
      found: `Page ${pagePx}${r.userUnit !== 1 ? ` (page scale /UserUnit ${r.userUnit})` : ''} · order ${order}${cv ? ` · canvas ${f1(canvas.wIn)}" × ${f1(canvas.hIn)}"` : ''}` };
    const extraW = W - ow, extraH = H - oh;
    if (scale > 1) {
      return Object.assign(base, { status: 'INFO',
        found: base.found + ` · designed at 1:${scale}`,
        detail: `The page has the order's proportion at 1:${scale} scale (${pagePx} × ${scale} = ${f1(W * scale)}" × ${f1(H * scale)}"). Large prints are sometimes designed at scale; the picture resolution is judged at the full order size.`,
        action: `Confirm the print file is enlarged ×${scale} to the order size (or save it at full size).` });
    }
    if (cv && near(W, cv.w) && near(H, cv.h)) {
      return Object.assign(base, { status: 'PASS', detail: `The page matches the SOP production canvas (${canvas.note}). ${canvas.source}.`, action: '' });
    }
    // A design file is made at the order size; the finishing allowance (pole pocket, hem) is added when the print
    // file is made (production print files: e.g. top pole pocket +5.25") — so the order size passes here
    if (near(W, ow) && near(H, oh)) {
      const later = cv && (cv.w - ow > tol || cv.h - oh > tol);
      return Object.assign(base, { status: 'PASS',
        detail: `The page is the order size.${later ? ` The SOP finishing allowance (${canvas.note}) is added when the print file is made (production canvas ${f1(canvas.wIn)}" × ${f1(canvas.hIn)}").` : ''}`, action: '' });
    }
    // No SOP canvas for this product (template products: stands, flags, table covers…): a larger page is normally the
    // template's bleed / sleeve / stand allowance — the tool cannot confirm it, so it is a look by eye, never Critical
    if (!cv && extraW >= -tol && extraH >= -tol) {
      const big = extraW > 4.5 || extraH > 4.5;
      return Object.assign(base, { status: 'INFO',
        found: base.found + ` · ${f1(Math.max(0, extraW))}" wider, ${f1(Math.max(0, extraH))}" taller`,
        detail: `The page is ${big ? 'larger' : 'a little larger'} than the order — normally bleed or the product template's allowance (pole sleeve, stand base, hem). ${canvas ? canvas.note + '.' : ''}`,
        action: 'Confirm the page matches the product template (bleed / pole sleeve / stand allowance).' });
    }
    if (W < ow - tol || H < oh - tol) {
      return Object.assign(base, { status: 'FAIL',
        error: `The page ${pagePx} is smaller than the order ${order}`,
        detail: 'A page smaller than the order is stretched at print, or prints short.',
        action: `Make the page the order size${cv ? ` + allowance (${f1(canvas.wIn)}" × ${f1(canvas.hIn)}")` : ''} and save the PDF again.` });
    }
    // Larger than the SOP canvas on both sides: extra bleed (seen in real UK print files: +1.25" each side) — a look by eye
    if (cv && W >= cv.w - tol && H >= cv.h - tol) {
      return Object.assign(base, { status: 'INFO',
        found: base.found + ` · ${f1(W - cv.w)}" wider, ${f1(H - cv.h)}" taller than the canvas`,
        detail: `The page is larger than the SOP production canvas (${canvas.note}) — usually extra bleed. ${canvas.source}.`,
        action: `Confirm the extra ${f1((W - cv.w) / 2)}" / ${f1((H - cv.h) / 2)}" per side is bleed the printer expects.` });
    }
    return Object.assign(base, { status: 'FAIL',
      error: `The page ${pagePx} does not match the order ${order}${cv ? ` or the SOP canvas ${f1(canvas.wIn)}" × ${f1(canvas.hIn)}"` : ''}`,
      detail: `Width ${extraW >= 0 ? '+' : ''}${f1(extraW)}", height ${extraH >= 0 ? '+' : ''}${f1(extraH)}" against the order.`,
      action: 'Set the page to the order size (+ the SOP finishing allowance) and save the PDF again.' });
  },

  // ── In the OPS-Intel report ─────────────────────────────────────────────────
  /** Each picture's worst result across the resolution, detail and colour checks (page outline + table) */
  _picStates(r, checks) {
    const st = (id, n) => {
      const c = checks.find(k => k.id === id);
      if (!c || c.status === 'PASS') return 'pass';
      const hit = (c.items || []).some(t => t.includes(`PostCheck.showPic(${n})`));
      return hit ? (c.status === 'FAIL' ? 'fail' : 'info') : 'pass';
    };
    const rank = { pass: 0, info: 1, fail: 2 };
    r.pics.forEach(q => {
      q.state = ['pc-ppi', 'pc-detail', 'pc-colour'].map(id => st(id, q.n)).reduce((x, y) => (rank[y] > rank[x] ? y : x), 'pass');
    });
  },

  /** The design-file panel at the top of the report: what the page is made of, the page with every picture outlined, the pictures */
  panelHtml(d) {
    const r = d.r, nPics = r.pics.filter(q => q.kind !== 'mask').length;
    const kindTxt = {
      raster: ['Raster', 'One flattened picture covers the page', 'The print quality is the quality of this picture — its resolution and real detail are checked below.'],
      vector: ['Vector', 'Vector shapes and live text, no pictures', 'Vector prints sharp at any size; page size, colour and fonts are checked.'],
      mixed: ['Partly raster', `Vector${r.texts ? ' + text' : ''} + ${nPics} picture${nPics === 1 ? '' : 's'}`, `Vector parts print sharp; the pictures cover ${r.cover}% of the page and are checked one by one.`],
      empty: ['Empty', 'Nothing is drawn on page 1', 'The page has no shapes, text or pictures.']
    }[r.kind];
    // a picture placed larger than the page (its edges cut off by the page) is outlined where it shows on the page —
    // its whole box ran off the drawing, over the panel and the cards below
    const onPage = b => {
      const x0 = Math.max(0, b[0]), y0 = Math.max(0, b[1]), x1 = Math.min(r.vpW, b[2]), y1 = Math.min(r.vpH, b[3]);
      return x1 - x0 > 0.5 && y1 - y0 > 0.5 ? [x0, y0, x1, y1] : null;
    };
    const boxes = r.pics.filter(q => q.kind !== 'mask').map(q => {
      const b = onPage(q.box), st = q.state || 'pass';
      if (!b) return '';
      const L = b[0] / r.vpW * 100, T = b[1] / r.vpH * 100, W = (b[2] - b[0]) / r.vpW * 100, H = (b[3] - b[1]) / r.vpH * 100;
      const dv = q.detail && q.detail.verdict !== 'unknown' ? ` · ${q.detail.verdict === 'sharp' ? (q.detail.partly ? 'partly enlarged' : 'sharp') : q.detail.verdict}` : '';
      return `<div class="pc-box ${st}${T < 8 ? ' tag-in' : ''}" id="pc-box-${q.n}" style="left:${L}%; top:${T}%; width:${W}%; height:${H}%"><span class="pc-box-tag">${q.n} · ${q.at} PPI${dv}</span></div>`;
    }).join('');
    // enlarged areas are marked only when part of a picture is enlarged (a wholly enlarged picture is outlined in red)
    const blur = r.pics.filter(q => q.detail && q.detail.partly && q.state && q.state !== 'pass').map(q => (q.detail.tiles || []).filter(t => t.state === 'enlarged' && t.vbox).map(t => {
      const v = onPage(t.vbox);
      if (!v) return '';
      const [x0, y0, x1, y1] = v;
      return `<div class="pc-blur" style="left:${x0 / r.vpW * 100}%; top:${y0 / r.vpH * 100}%; width:${(x1 - x0) / r.vpW * 100}%; height:${(y1 - y0) / r.vpH * 100}%" title="Enlarged area (edges ${t.p25} px)"></div>`;
    }).join('')).join('');
    const rows = r.pics.filter(q => q.kind !== 'mask').map(q => {
      const dt = q.detail, a = q.quality;
      const dTxt = !dt ? (q.areaIn < 1 ? 'small — not measured' : 'not measured') : dt.verdict === 'unknown' ? 'too few edges'
        : a ? `${a.label}${a.real < q.at ? ` · looks like ≈ ${a.real} PPI` : ''} (${dt.p25} px)`
        : dt.verdict === 'sharp' ? (dt.partly ? `partly enlarged (${dt.p25} px)` : `sharp (${dt.p25} px)`) : `${dt.verdict} (${dt.p25} px)`;
      const st = q.state || 'pass';
      return `<tr><td><button type="button" class="pc-num" onclick="PostCheck.showPic(${q.n})">${q.n}</button></td><td>${q.w.toLocaleString()} × ${q.h.toLocaleString()}</td><td>${(+q.inW).toFixed(1)}" × ${(+q.inH).toFixed(1)}"</td><td><strong>${q.at}</strong>${d.scale > 1 ? ` <span class="pc-sub">(${q.ppi} on the 1:${d.scale} page)</span>` : ''}</td><td>${dTxt}</td><td>${this._esc(q.cs)}</td><td>${q.coverPct}%${q.copies > 1 ? ` · ${q.copies}×` : ''}</td><td><span class="pc-res ${st}">${{ pass: 'OK', info: 'Confirm', fail: 'Critical' }[st]}</span></td></tr>`;
    }).join('');
    const issues = r.pics.some(q => q.state && q.state !== 'pass');
    const page = r.preview ? `<img src="${r.preview}" alt="Page 1 of ${this._esc(r.name)}">`
      : `<div class="pc-nopreview" style="aspect-ratio:${r.vpW} / ${r.vpH}">The page took too long to draw — the checks still ran on the file.</div>`;
    return `
      <div class="pc-hero pc-kind-${r.kind}" id="pc-panel">
        <div class="pc-hero-main">
          <div class="pc-hero-kicker">Design file (PDF) · what the page is made of</div>
          <div class="pc-hero-title">${kindTxt[0]} <span>· ${kindTxt[1]}</span></div>
          <div class="pc-hero-desc">${kindTxt[2]}</div>
          <div class="pc-mix" title="Share of the page covered by pictures"><span class="pc-mix-raster" style="width:${r.cover}%"></span></div>
          <div class="pc-mix-legend"><span><i class="r"></i>Pictures ${r.cover}% of the page</span><span><i class="v"></i>Vector / empty ${100 - r.cover}%</span></div>
        </div>
        <div class="pc-tags">
          <span class="pc-tag">🖼️ ${nPics} picture${nPics === 1 ? '' : 's'}</span>
          <span class="pc-tag">✏️ ${r.paths + r.shadings} vector shape${r.paths + r.shadings === 1 ? '' : 's'}</span>
          <span class="pc-tag">🔤 ${r.texts ? `${r.texts} live text run${r.texts === 1 ? '' : 's'}` : 'No live text'}</span>
          <span class="pc-tag">📄 ${r.pages} page${r.pages === 1 ? '' : 's'} · ${(+r.pageIn.w).toFixed(2)}" × ${(+r.pageIn.h).toFixed(2)}" · ${r.sizeMB} MB</span>
        </div>
        ${nPics ? `
        <details class="pc-more" id="pc-more"${issues ? ' open' : ''}>
          <summary>Pictures in the design file (${nPics}) — where each sits, its PPI and real detail</summary>
          <div class="pc-more-grid">
            <div>
              <div class="pc-page">${page}${boxes}${blur}</div>
              <div class="pc-legend"><span><i class="pass"></i>Picture OK</span><span><i class="info"></i>Confirm by eye</span><span><i class="fail"></i>Critical</span>${blur ? '<span><i class="blur"></i>Enlarged area</span>' : ''}</div>
            </div>
            <div class="pc-table-wrap"><table class="pc-table">
              <thead><tr><th>#</th><th>Pixels</th><th>Placed size</th><th>PPI${d.scale > 1 ? ' (order size)' : ''}</th><th>Real detail</th><th>Colour</th><th>Page</th><th>Result</th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </div>
        </details>` : ''}
      </div>`;
  },

  /** Jump to a picture on the page in the design-file panel */
  showPic(n) {
    const more = document.getElementById('pc-more');
    if (more) more.open = true;
    const b = document.getElementById(`pc-box-${n}`);
    if (!b) return;
    b.scrollIntoView({ behavior: 'smooth', block: 'center' });
    b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
  },

  _esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
};
