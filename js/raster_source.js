/**
 * Design Intelligence Hub - the picture every check reads
 *
 * A CMYK JPEG (most print files) is not kept decoded by the browser: every check that draws it decodes it again, on
 * the page's own thread. A 100 MP CMYK print file froze the page 4–12 s per draw — about 4 minutes per check, with
 * the page not answering clicks. The same picture in RGB draws in 0.1–0.3 s.
 * So a CMYK JPEG is converted ONCE, in a background worker (the page keeps running), to an RGB JPEG. Every check, the
 * canvas and the previews read that copy; the file itself (name, size, bytes) is still read from the original. Any
 * other file is read as it is.
 *
 * The copy has Photoshop's colours. With the file's profile the browser folds black into the three inks (K = 0)
 * before it uses the profile: blacks showed dark grey and dark colours washed out (navy C100 M88 Y42 K52 showed
 * 48, 60, 83 — Photoshop 15, 33, 64). A U.S. Web Coated (SWOP) v2 file, or one without a profile (Photoshop then uses
 * SWOP v2), is decoded without its profile — the plain mix 255·(1−C)(1−K) … — and mapped to Photoshop's view (SWOP v2,
 * Relative Colorimetric + Black Point Compensation) by a 33³ table (tools/build_swop_view_lut.py). A file with another
 * CMYK profile (FOGRA, GRACoL…) keeps the browser's own colours.
 */
const RasterSource = {
  QUALITY: 0.97,
  LUT_URL: 'assets/color/swop-view-33.bin?v=20261031b', LUT_N: 33,
  _file: null,
  _job: null,

  /** Data URL of the picture the checks read (one reading per file, shared by every caller) */
  dataUrl(file) {
    if (this._file === file && this._job) return this._job;
    this._file = file;
    this._job = (async () => {
      if (await this.isCmykJpeg(file)) {
        const copy = await this._rgbCopy(file).catch(e => { console.warn('RGB copy not made, the checks read the CMYK file:', e); return null; });
        if (copy) return copy;
      }
      return this._read(file);
    })();
    return this._job;
  },

  /** A JPEG with 4 colour components (CMYK / YCCK), read from its frame header; its profile: 'swop' / 'other' / 'none' */
  async isCmykJpeg(file) {
    if (!/\.jpe?g$/i.test(file.name || '') && file.type !== 'image/jpeg') return false;
    if (this._cmykFile === file) return this._cmyk;
    const b = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
    let cmyk = false, icc = 'none';
    if (b[0] === 0xFF && b[1] === 0xD8) {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xFF) { i++; continue; }                                     // fill byte
        if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { i += 2; continue; }      // markers without a length
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { cmyk = b[i + 9] === 4; break; }   // SOFn: Nf
        if (m === 0xDA || m === 0xD9) break;                                   // image data before a frame header
        const len = (b[i + 2] << 8) | b[i + 3];
        // APP2 "ICC_PROFILE", first part: the profile's name is near its start (SWOP v2: byte 264)
        if (m === 0xE2 && len > 18 && b[i + 16] === 1 && new TextDecoder('latin1').decode(b.subarray(i + 4, i + 15)) === 'ICC_PROFILE') {
          icc = new TextDecoder('latin1').decode(b.subarray(i + 18, Math.min(i + 2 + len, i + 18 + 4096))).includes('U.S. Web Coated (SWOP) v2') ? 'swop' : 'other';
        }
        i += 2 + len;
      }
    }
    this._cmykFile = file; this._cmyk = cmyk; this._icc = icc;
    return cmyk;
  },

  /** The 33³ table plain ink mix → Photoshop's view (fetched once) */
  _lut() {
    if (!this._lutJob) {
      const n = this.LUT_N ** 3 * 3;
      this._lutJob = fetch(this.LUT_URL).then(r => r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status)))
        .then(b => b.byteLength === n ? b : Promise.reject(new Error('table size ' + b.byteLength)))
        .catch(e => { this._lutJob = null; throw e; });
    }
    return this._lutJob;
  },

  _read(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  },

  // decode, draw and encode, all inside the worker. With the table (lut): the file without its profile (drop) is
  // decoded to the plain ink mix and each pixel mapped to Photoshop's view (tetrahedral, in strips of 256 rows);
  // without it: decoded colour-managed, like <img>
  WORKER: `onmessage = async e => {
    try {
      const { file, q, lut, n, drop } = e.data;
      const src = lut && drop ? noProfile(new Uint8Array(await file.arrayBuffer())) : file;
      const bmp = await createImageBitmap(src);
      const W = bmp.width, H = bmp.height, cv = new OffscreenCanvas(W, H), g = cv.getContext('2d', { willReadFrequently: !!lut });
      g.drawImage(bmp, 0, 0);
      bmp.close();
      if (lut) {
        const L = new Uint8Array(lut);
        for (let y = 0; y < H; y += 256) { const d = g.getImageData(0, y, W, Math.min(256, H - y)); view(d.data, L, n); g.putImageData(d, 0, y); }
      }
      postMessage({ blob: await cv.convertToBlob({ type: 'image/jpeg', quality: q }) });
    } catch (err) { postMessage({ error: String(err) }); }
  };
  // the JPEG without its APP2 ICC_PROFILE parts (image data untouched)
  function noProfile(b) {
    const parts = [b.subarray(0, 2)];
    for (let i = 2; i + 4 <= b.length;) {
      if (b[i] !== 0xFF) return new Blob([b], { type: 'image/jpeg' });
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0xDA || m === 0xD9) { parts.push(b.subarray(i)); break; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { parts.push(b.subarray(i, i + 2)); i += 2; continue; }
      const len = (b[i + 2] << 8) | b[i + 3];
      const icc = m === 0xE2 && len > 16 && String.fromCharCode.apply(null, b.subarray(i + 4, i + 15)) === 'ICC_PROFILE';
      if (!icc) parts.push(b.subarray(i, i + 2 + len));
      i += 2 + len;
    }
    return new Blob(parts, { type: 'image/jpeg' });
  }
  // plain ink mix -> Photoshop's view: 3D table, n nodes per side, tetrahedral interpolation
  function view(p, L, n) {
    const s = (n - 1) / 255, dR = n * n * 3, dG = n * 3, dB = 3, top = n - 2, o3 = dR + dG + dB;
    for (let i = 0; i < p.length; i += 4) {
      let fr = p[i] * s, fg = p[i + 1] * s, fb = p[i + 2] * s;
      let ir = fr | 0, ig = fg | 0, ib = fb | 0;
      if (ir > top) ir = top; if (ig > top) ig = top; if (ib > top) ib = top;
      fr -= ir; fg -= ig; fb -= ib;
      let o1, o2, w1, w2, w3;
      if (fr >= fg) {
        if (fg >= fb) { o1 = dR; o2 = dR + dG; w1 = fr; w2 = fg; w3 = fb; }
        else if (fr >= fb) { o1 = dR; o2 = dR + dB; w1 = fr; w2 = fb; w3 = fg; }
        else { o1 = dB; o2 = dR + dB; w1 = fb; w2 = fr; w3 = fg; }
      } else if (fr >= fb) { o1 = dG; o2 = dR + dG; w1 = fg; w2 = fr; w3 = fb; }
      else if (fg >= fb) { o1 = dG; o2 = dG + dB; w1 = fg; w2 = fb; w3 = fr; }
      else { o1 = dB; o2 = dG + dB; w1 = fb; w2 = fg; w3 = fr; }
      const o = ir * dR + ig * dG + ib * dB;
      for (let c = 0; c < 3; c++) {
        const v0 = L[o + c], v1 = L[o + o1 + c], v2 = L[o + o2 + c];
        p[i + c] = v0 + w1 * (v1 - v0) + w2 * (v2 - v1) + w3 * (L[o + o3 + c] - v2);
      }
    }
  }`,

  /** RGB JPEG copy of the file, made off the page's thread; null where the browser cannot do it */
  async _rgbCopy(file) {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
    // SWOP v2 or no profile: Photoshop's view; another profile (or the table not loaded): the browser's own colours
    const lut = this._icc !== 'other' ? await this._lut().catch(e => { console.warn('CMYK colour table not loaded:', e); return null; }) : null;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([this.WORKER], { type: 'text/javascript' }));
      const w = new Worker(url);
      const end = () => { w.terminate(); URL.revokeObjectURL(url); };
      w.onmessage = e => { end(); e.data.error ? reject(new Error(e.data.error)) : this._read(e.data.blob).then(resolve, reject); };
      w.onerror = e => { end(); reject(e.message || e); };
      w.postMessage({ file, q: this.QUALITY, lut, n: this.LUT_N, drop: this._icc === 'swop' });
    });
  }
};
