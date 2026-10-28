/**
 * Design Intelligence Hub - the picture every check reads
 *
 * A CMYK JPEG (most print files) is not kept decoded by the browser: every check that draws it decodes it again, on
 * the page's own thread. A 100 MP CMYK print file froze the page 4–12 s per draw — about 4 minutes per check, with
 * the page not answering clicks. The same picture in RGB draws in 0.1–0.3 s.
 * So a CMYK JPEG is converted ONCE, in a background worker (the page keeps running), to an RGB JPEG with the same
 * pixels — the RGB the browser shows for it anyway. Every check, the canvas and the previews read that copy; the
 * file itself (name, size, bytes) is still read from the original. Any other file is read as it is.
 */
const RasterSource = {
  QUALITY: 0.97,
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

  /** A JPEG with 4 colour components (CMYK / YCCK), read from its frame header */
  async isCmykJpeg(file) {
    if (!/\.jpe?g$/i.test(file.name || '') && file.type !== 'image/jpeg') return false;
    if (this._cmykFile === file) return this._cmyk;
    const b = new Uint8Array(await file.slice(0, 1 << 20).arrayBuffer());
    let cmyk = false;
    if (b[0] === 0xFF && b[1] === 0xD8) {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xFF) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xFF) { i++; continue; }                                     // fill byte
        if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { i += 2; continue; }      // markers without a length
        if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) { cmyk = b[i + 9] === 4; break; }   // SOFn: Nf
        if (m === 0xDA || m === 0xD9) break;                                   // image data before a frame header
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    }
    this._cmykFile = file; this._cmyk = cmyk;
    return cmyk;
  },

  _read(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  },

  // decode (colour-managed, like <img>), draw and encode, all inside the worker
  WORKER: `onmessage = async e => {
    try {
      const bmp = await createImageBitmap(e.data.file);
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      cv.getContext('2d').drawImage(bmp, 0, 0);
      bmp.close();
      postMessage({ blob: await cv.convertToBlob({ type: 'image/jpeg', quality: e.data.q }) });
    } catch (err) { postMessage({ error: String(err) }); }
  };`,

  /** RGB JPEG copy of the file, made off the page's thread; null where the browser cannot do it */
  _rgbCopy(file) {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([this.WORKER], { type: 'text/javascript' }));
      const w = new Worker(url);
      const end = () => { w.terminate(); URL.revokeObjectURL(url); };
      w.onmessage = e => { end(); e.data.error ? reject(new Error(e.data.error)) : this._read(e.data.blob).then(resolve, reject); };
      w.onerror = e => { end(); reject(e.message || e); };
      w.postMessage({ file, q: this.QUALITY });
    });
  }
};
