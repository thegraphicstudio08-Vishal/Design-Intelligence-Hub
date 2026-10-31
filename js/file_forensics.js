/**
 * Design Intelligence Hub - Technical File Forensics (PDF · JPG · PNG)
 *
 * Reads technical pre-press facts directly from uploaded artwork files:
 * - PDF: layers (name, hidden by default, print / view usage; what each holds — counted only for a layered file),
 *   spot colours (/Separation, /DeviceN: cut lines, white ink, varnish), overprint and transparency settings
 *   (ExtGState), the trim / bleed box of a one-page file, metadata (Producer, Creator, PDF/X, OutputIntents,
 *   encryption), pictures (filter, bits, masks), comments set to print, invisible text (render mode 3).
 *   Built by Antigravity, audited and corrected by Design Quality (30-10-2026): layer names / hidden state / print
 *   usage were not read; overprint per object cannot be read from pdf.js (reported per ExtGState); the operator
 *   list (which decodes every picture again) runs only for layered files.
 * - JPG: SOF frame (type, dimensions, components, color model, chroma subsampling),
 *   ICC profile (desc name, color space, multi-segment APP2), declared resolutions
 *   (JFIF vs EXIF vs Photoshop ResolutionInfo), EXIF orientation (rotation trap),
 *   Photoshop APP13 (clipping paths 8BIM 2000-2997/2999, alpha channels), XMP CreatorTool,
 *   IJG DQT quality estimate, integrity (EOI marker, trailing data, MPF).
 * - PNG: IHDR (dimensions, bit depth, 16-bit, color type, indexed, interlace), transparency
 *   (tRNS, alpha channel, worker-measured alpha % and opaque bounding box), color metadata
 *   (iCCP with inflated desc, sRGB intent, gAMA, cHRM), pHYs declared DPI, text/animation
 *   (tEXt, iTXt, zTXt, acTL APNG), integrity (IEND, CRC32 verification, trailing data).
 *
 * Guarantees:
 * - Never throws: returns { ok: false, error, ... } on any failure or corrupt input.
 * - Non-blocking: heavy tasks run in Web Worker or yield with chunked awaits.
 * - Minimal memory: reads slices, closes pdf.js documents, revokes URLs, keeps no raw buffers.
 * - Early exit: aborts promptly if opts.alive() returns false.
 * - No card of its own: findings / applyTo put what matters into the cards the Hub already shows (Pages, Colour,
 *   Orientation, Print suitability) in a designer's words; the facts go into those cards' details.
 */

const FileForensics = {
  VERSION: 1,

  // Cut-line, white ink, and varnish spot colour naming conventions
  CUTTER_REGEX: /^(cut[\s_-]?contour|thru[\s_-]?cut|through[\s_-]?cut|kiss[\s_-]?cut|die([-\s]?cut)?|dieline|crease|perf(oration)?)$/i,
  WHITE_REGEX: /^(white|w1|spot[\s_-]?white)$/i,
  VARNISH_REGEX: /^(varnish|gloss|spot[\s_-]?varnish|spot[\s_-]?gloss)$/i,

  // Standard IJG luminance quantization table at 50% quality
  IJG_LUM_TABLE: [
    16, 11, 10, 16, 24, 40, 51, 61,
    12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56,
    14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77,
    24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101,
    72, 92, 95, 98, 112, 100, 103, 99
  ],

  // Inline worker for measuring PNG alpha distribution without locking the UI
  ALPHA_WORKER_CODE: `onmessage = async e => {
    try {
      const file = e.data.file;
      const origW = e.data.w;
      const origH = e.data.h;
      const maxSide = 2000;
      let targetW = origW;
      let targetH = origH;
      let scaled = false;
      if (Math.max(origW, origH) > maxSide) {
        const s = maxSide / Math.max(origW, origH);
        targetW = Math.max(1, Math.round(origW * s));
        targetH = Math.max(1, Math.round(origH * s));
        scaled = true;
      }

      let bmp;
      try {
        bmp = await createImageBitmap(file, { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: 'low' });
      } catch (err) {
        bmp = await createImageBitmap(file);
      }

      const w = bmp.width;
      const h = bmp.height;
      const cv = new OffscreenCanvas(w, h);
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0, w, h);
      bmp.close();

      const imgData = ctx.getImageData(0, 0, w, h).data;
      const total = w * h;
      let alphaLt255 = 0;
      let alphaZero = 0;
      let minX = w, minY = h, maxX = -1, maxY = -1;

      for (let y = 0; y < h; y++) {
        const row = y * w;
        for (let x = 0; x < w; x++) {
          const a = imgData[(row + x) * 4 + 3];
          if (a < 255) {
            alphaLt255++;
            if (a === 0) alphaZero++;
          }
          if (a > 5) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const hasContent = maxX >= minX && maxY >= minY;
      const bounds = hasContent ? {
        x: Math.round((minX / w) * 1000) / 1000,
        y: Math.round((minY / h) * 1000) / 1000,
        width: Math.round(((maxX - minX + 1) / w) * 1000) / 1000,
        height: Math.round(((maxY - minY + 1) / h) * 1000) / 1000
      } : { x: 0, y: 0, width: 0, height: 0 };

      postMessage({
        ok: true,
        total,
        alphaLt255,
        alphaZero,
        percent: Math.round((alphaLt255 / total) * 1000) / 10,
        zeroPercent: Math.round((alphaZero / total) * 1000) / 10,
        bounds,
        measuredSize: { w, h, reduced: scaled }
      });
    } catch (err) {
      postMessage({ ok: false, error: String(err) });
    }
  };`,

  _cache: typeof WeakMap !== 'undefined' ? new WeakMap() : null,

  /**
   * Technical facts of one file — read once per file (a re-check of the same file reuses them). Never throws: on any
   * error returns { ok: false, error, ... } with what was read.
   * @param {File} file
   * @param {{ alive?: () => boolean }} [opts] alive() === false -> stop early (the designer uploaded another file)
   * @returns {Promise<object>}
   */
  inspect(file, opts = {}) {
    if (file && this._cache && this._cache.has(file)) return this._cache.get(file);
    const p = this._inspectOnce(file, opts).then(r => {
      if (r && /^Aborted/.test(r.error || '') && this._cache) this._cache.delete(file);   // read it again next time
      return r;
    });
    if (file && this._cache) this._cache.set(file, p);
    return p;
  },

  async _inspectOnce(file, opts = {}) {
    const t0 = performance.now();
    if (!file) {
      return {
        version: this.VERSION,
        ok: false,
        type: 'other',
        ms: 0,
        error: 'No file provided',
        facts: {},
        flags: [],
        limits: ['File is null or undefined']
      };
    }

    if (file.size === 0) {
      return {
        version: this.VERSION,
        ok: false,
        type: 'other',
        ms: Math.round(performance.now() - t0),
        error: 'File is empty (0 bytes)',
        facts: { fileSize: 0 },
        flags: [],
        limits: ['0-byte file']
      };
    }

    try {
      const type = await this._detectType(file);
      if (opts.alive && !opts.alive()) {
        return this._aborted(t0, type);
      }

      let res;
      if (type === 'pdf') {
        res = await this._inspectPdf(file, opts);
      } else if (type === 'jpeg') {
        res = await this._inspectJpeg(file, opts);
      } else if (type === 'png') {
        res = await this._inspectPng(file, opts);
      } else {
        res = {
          ok: true,
          type: 'other',
          facts: {
            name: file.name,
            size: file.size,
            mime: file.type || 'unknown'
          },
          flags: [],
          limits: ['Unsupported file format for deep pre-press forensics']
        };
      }

      return {
        version: this.VERSION,
        ok: res.ok,
        type,
        ms: Math.round(performance.now() - t0),
        error: res.error || null,
        facts: res.facts || {},
        flags: res.flags || [],
        limits: res.limits || []
      };
    } catch (err) {
      console.warn('FileForensics.inspect error:', err);
      return {
        version: this.VERSION,
        ok: false,
        type: 'other',
        ms: Math.round(performance.now() - t0),
        error: String(err.message || err),
        facts: {},
        flags: [],
        limits: ['Unexpected error during file inspection']
      };
    }
  },

  // ── File Type Detection ──────────────────────────────────────────────────
  async _detectType(file) {
    try {
      const headerBuf = await file.slice(0, 16).arrayBuffer();
      const u8 = new Uint8Array(headerBuf);
      if (u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {
        return 'pdf'; // %PDF
      }
      if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xD8) {
        return 'jpeg'; // SOI
      }
      if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47 &&
          u8[4] === 0x0D && u8[5] === 0x0A && u8[6] === 0x1A && u8[7] === 0x0A) {
        return 'png'; // PNG signature
      }
    } catch (e) {}

    // Fall back to filename extension for corrupted/truncated files
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'pdf' || ext === 'ai') return 'pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
    if (ext === 'png') return 'png';
    return 'other';
  },

  _aborted(t0, type) {
    return {
      version: this.VERSION,
      ok: false,
      type: type || 'other',
      ms: Math.round(performance.now() - t0),
      error: 'Aborted: new file uploaded',
      facts: {},
      flags: [],
      limits: ['Inspection aborted by caller']
    };
  },

  _yield() {
    return new Promise(r => setTimeout(r, 0));
  },

  // ── JPEG Forensics (Markers only, zero full bitmap decode) ────────────────
  async _inspectJpeg(file, opts) {
    const facts = {
      fileSize: file.size,
      sof: null,
      colorModel: 'unknown',
      subsampling: null,
      icc: null,
      resolutions: { jfif: null, exif: null, photoshop: null },
      exifOrientation: null,
      clippingPaths: [],
      alphaChannels: [],
      xmp: null,
      qualityEstimate: null,
      integrity: { hasEoi: false, trailingDataBytes: 0, multiPicture: false }
    };
    const flags = [];
    const limits = [];

    // 1. Verify EOI at end of file
    const tailSize = Math.min(file.size, 4096);
    const tailBuf = await file.slice(file.size - tailSize, file.size).arrayBuffer();
    const tail = new Uint8Array(tailBuf);
    let eoiPos = -1;
    for (let i = tail.length - 2; i >= 0; i--) {
      if (tail[i] === 0xFF && tail[i + 1] === 0xD9) {
        eoiPos = file.size - tailSize + i;
        break;
      }
    }

    if (eoiPos === -1) {
      facts.integrity.hasEoi = false;
      flags.push({ code: 'JPG_TRUNCATED', evidence: { size: file.size, reason: 'Missing EOI marker (FFD9)' } });
    } else {
      facts.integrity.hasEoi = true;
      const trailing = file.size - (eoiPos + 2);
      facts.integrity.trailingDataBytes = trailing;
      if (trailing > 32) {
        facts.integrity.hasTrailingData = true;
      }
    }

    // 2. Read marker segments from header slice (expand up to 8 MB if needed)
    let sliceLen = Math.min(file.size, 2 * 1024 * 1024);
    let headBuf = await file.slice(0, sliceLen).arrayBuffer();
    let bytes = new Uint8Array(headBuf);

    if (bytes.length < 2 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      return {
        ok: false,
        error: 'Invalid JPEG: missing SOI marker (FFD8)',
        facts,
        flags: [{ code: 'JPG_TRUNCATED', evidence: { error: 'Invalid SOI' } }],
        limits
      };
    }

    let pos = 2;
    const iccChunks = new Map();
    let adobeTransform = null;
    let dqtLuminance = null;

    while (pos < bytes.length - 4) {
      if (opts.alive && !opts.alive()) return { ok: false, error: 'Aborted', facts, flags, limits };

      // Markers start with 0xFF (skip padding 0xFF bytes)
      while (pos < bytes.length && bytes[pos] === 0xFF) pos++;
      if (pos >= bytes.length) break;
      const marker = bytes[pos];
      pos++;

      // Standalone markers without length
      if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) continue;
      // Start of Scan (SOS): image data begins, stop reading markers
      if (marker === 0xDA) break;

      if (pos + 2 > bytes.length) break;
      const segLen = (bytes[pos] << 8) | bytes[pos + 1];
      if (segLen < 2) break;

      // Expand slice if a large marker (like ICC profile) exceeds current buffer
      if (pos + segLen > bytes.length && sliceLen < file.size) {
        sliceLen = Math.min(file.size, pos + segLen + 1024 * 1024);
        headBuf = await file.slice(0, sliceLen).arrayBuffer();
        bytes = new Uint8Array(headBuf);
      }
      if (pos + segLen > bytes.length) {
        limits.push(`Truncated marker segment 0x${marker.toString(16)}`);
        break;
      }

      const segData = bytes.subarray(pos + 2, pos + segLen);

      // SOF (Start of Frame)
      if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC9 && marker <= 0xCB)) {
        const sofNames = {
          0xC0: 'Baseline DCT (SOF0)',
          0xC1: 'Extended Sequential DCT (SOF1)',
          0xC2: 'Progressive DCT (SOF2)',
          0xC3: 'Lossless (SOF3)',
          0xC9: 'Extended Sequential Arithmetic (SOF9)',
          0xCA: 'Progressive Arithmetic (SOF10)'
        };
        const precision = segData[0];
        const height = (segData[1] << 8) | segData[2];
        const width = (segData[3] << 8) | segData[4];
        const compCount = segData[5];
        const components = [];
        let p = 6;
        for (let c = 0; c < compCount && p + 3 <= segData.length; c++) {
          components.push({
            id: segData[p],
            hSamp: segData[p + 1] >> 4,
            vSamp: segData[p + 1] & 0x0F,
            qTable: segData[p + 2]
          });
          p += 3;
        }

        // Derive chroma subsampling
        let subsamp = 'unknown';
        if (compCount === 1) {
          subsamp = 'grayscale';
        } else if (compCount >= 3 && components[0] && components[1] && components[2]) {
          const y = components[0];
          const cb = components[1];
          const cr = components[2];
          if (cb.hSamp === 1 && cb.vSamp === 1 && cr.hSamp === 1 && cr.vSamp === 1) {
            if (y.hSamp === 2 && y.vSamp === 2) subsamp = '4:2:0';
            else if (y.hSamp === 2 && y.vSamp === 1) subsamp = '4:2:2';
            else if (y.hSamp === 1 && y.vSamp === 1) subsamp = '4:4:4';
            else if (y.hSamp === 1 && y.vSamp === 2) subsamp = '4:4:0';
            else subsamp = `${y.hSamp}:${y.vSamp}`;
          } else {
            subsamp = `${y.hSamp}x${y.vSamp}`;
          }
        }

        facts.sof = {
          type: sofNames[marker] || `SOF(0x${marker.toString(16)})`,
          bitsPerSample: precision,
          width,
          height,
          components: compCount,
          subsampling: subsamp
        };
      }

      // DQT (Quantization Table) -> Quality Estimate
      else if (marker === 0xDB) {
        let p = 0;
        while (p < segData.length) {
          const info = segData[p++];
          const qPrec = info >> 4; // 0 = 8-bit, 1 = 16-bit
          const qId = info & 0x0F;
          const tableLen = qPrec === 0 ? 64 : 128;
          if (p + tableLen <= segData.length) {
            if (qId === 0 && !dqtLuminance) {
              const table = [];
              for (let i = 0; i < 64; i++) {
                table.push(qPrec === 0 ? segData[p + i] : (segData[p + i * 2] << 8) | segData[p + i * 2 + 1]);
              }
              dqtLuminance = table;
            }
            p += tableLen;
          } else {
            break;
          }
        }
      }

      // APP0 (JFIF)
      else if (marker === 0xE0) {
        if (segData.length >= 14 && segData[0] === 0x4A && segData[1] === 0x46 && segData[2] === 0x49 && segData[3] === 0x46 && segData[4] === 0x00) {
          const unit = segData[7]; // 1 = dots/inch, 2 = dots/cm
          const xDens = (segData[8] << 8) | segData[9];
          const yDens = (segData[10] << 8) | segData[11];
          if (xDens > 0 && yDens > 0) {
            facts.resolutions.jfif = {
              unit: unit === 1 ? 'inches' : unit === 2 ? 'cm' : 'aspect',
              x: unit === 2 ? Math.round(xDens * 2.54) : xDens,
              y: unit === 2 ? Math.round(yDens * 2.54) : yDens
            };
          }
        }
      }

      // APP1 (EXIF / XMP)
      else if (marker === 0xE1) {
        // EXIF
        if (segData.length >= 14 && segData[0] === 0x45 && segData[1] === 0x78 && segData[2] === 0x69 && segData[3] === 0x66 && segData[4] === 0x00) {
          this._parseExif(segData.subarray(6), facts);
        }
        // XMP
        else if (segData.length >= 29 && this._ascii(segData.subarray(0, 28)).includes('http://ns.adobe.com/xap/1.0/')) {
          this._parseXmp(segData.subarray(29), facts);
        }
      }

      // APP2 (ICC Profile / MPF)
      else if (marker === 0xE2) {
        if (segData.length >= 14 && this._ascii(segData.subarray(0, 11)) === 'ICC_PROFILE') {
          const chunkNum = segData[12];
          const totalChunks = segData[13];
          iccChunks.set(chunkNum, { total: totalChunks, bytes: segData.subarray(14) });
        } else if (segData.length >= 4 && this._ascii(segData.subarray(0, 4)) === 'MPF\0') {
          facts.integrity.multiPicture = true;
        }
      }

      // APP13 (Photoshop 3.0 / 8BIM)
      else if (marker === 0xED) {
        if (segData.length >= 14 && this._ascii(segData.subarray(0, 13)) === 'Photoshop 3.0') {
          this._parsePhotoshopApp13(segData.subarray(14), facts);
        }
      }

      // APP14 (Adobe color transform)
      else if (marker === 0xEE) {
        if (segData.length >= 12 && this._ascii(segData.subarray(0, 5)) === 'Adobe') {
          adobeTransform = segData[11]; // 0 = CMYK/RGB, 1 = YCbCr, 2 = YCCK
        }
      }

      pos += segLen;
    }

    // Determine colour model from components + Adobe transform
    if (facts.sof) {
      const n = facts.sof.components;
      if (n === 1) {
        facts.colorModel = 'Gray';
      } else if (n === 3) {
        facts.colorModel = adobeTransform === 0 ? 'RGB' : 'YCbCr';
      } else if (n === 4) {
        facts.colorModel = adobeTransform === 2 ? 'YCCK' : 'CMYK';
      }
    }

    // Reassemble multi-part ICC profile
    if (iccChunks.size > 0) {
      let totalLen = 0;
      for (const c of iccChunks.values()) totalLen += c.bytes.length;
      const iccBytes = new Uint8Array(totalLen);
      let offset = 0;
      for (let i = 1; i <= iccChunks.size; i++) {
        const chunk = iccChunks.get(i);
        if (chunk) {
          iccBytes.set(chunk.bytes, offset);
          offset += chunk.bytes.length;
        }
      }
      facts.icc = this._parseIcc(iccBytes);
    }

    // Quality estimation from luminance table
    if (dqtLuminance) {
      let ratioSum = 0;
      for (let i = 0; i < 64; i++) {
        ratioSum += (dqtLuminance[i] * 100) / this.IJG_LUM_TABLE[i];
      }
      const avg = ratioSum / 64;
      let qEst = avg <= 100 ? Math.round((200 - avg) / 2) : Math.round(5000 / avg);
      qEst = Math.max(1, Math.min(100, qEst));
      facts.qualityEstimate = qEst;
      if (qEst < 60) {
        flags.push({ code: 'JPG_LOW_QUALITY', evidence: { estimatedQuality: qEst } });
      }
    }

    // Flags: Profile presence & color model
    if (facts.icc && facts.icc.desc) {
      if (facts.icc.colorSpace === 'CMYK') {
        flags.push({ code: 'JPG_CMYK_PROFILE', evidence: { name: facts.icc.desc, size: facts.icc.size } });
      } else if (facts.icc.colorSpace === 'RGB') {
        flags.push({ code: 'JPG_RGB_PROFILE', evidence: { name: facts.icc.desc, size: facts.icc.size } });
      }
    } else {
      flags.push({ code: 'JPG_NO_PROFILE', evidence: { reason: 'No embedded ICC profile in APP2 segments' } });
    }

    // Flags: EXIF Orientation
    if (facts.exifOrientation && facts.exifOrientation !== 1) {
      flags.push({
        code: 'JPG_EXIF_ROTATED',
        evidence: { orientation: facts.exifOrientation, note: 'Values 2-8 display differently across software' }
      });
    }

    // Flags: Clipping paths
    if (facts.clippingPaths && facts.clippingPaths.length > 0) {
      flags.push({
        code: 'JPG_CLIPPING_PATH',
        evidence: { paths: facts.clippingPaths, active: facts.activeClippingPath || null }
      });
    }

    // Flags: Declared resolution mismatch
    const dpis = [];
    if (facts.resolutions.jfif && facts.resolutions.jfif.x > 0) dpis.push({ src: 'JFIF', x: facts.resolutions.jfif.x });
    if (facts.resolutions.exif && facts.resolutions.exif.x > 0) dpis.push({ src: 'EXIF', x: facts.resolutions.exif.x });
    if (facts.resolutions.photoshop && facts.resolutions.photoshop.x > 0) dpis.push({ src: 'Photoshop', x: facts.resolutions.photoshop.x });
    if (dpis.length >= 2) {
      const vals = dpis.map(d => d.x);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (max - min > 1.5) {
        flags.push({
          code: 'JPG_DPI_MISMATCH',
          evidence: {
            jfif: facts.resolutions.jfif ? facts.resolutions.jfif.x : null,
            exif: facts.resolutions.exif ? facts.resolutions.exif.x : null,
            photoshop: facts.resolutions.photoshop ? facts.resolutions.photoshop.x : null
          }
        });
      }
    }

    return { ok: true, facts, flags, limits };
  },

  _parseExif(data, facts) {
    if (data.length < 8) return;
    const isLe = data[0] === 0x49 && data[1] === 0x49; // 'II' little-endian vs 'MM' big-endian
    const u16 = (off) => isLe ? data[off] | (data[off + 1] << 8) : (data[off] << 8) | data[off + 1];
    const u32 = (off) => isLe ? (data[off] | (data[off + 1] << 8) | (data[off + 2] << 16) | (data[off + 3] << 24)) >>> 0
                              : ((data[off] << 24) | (data[off + 1] << 16) | (data[off + 2] << 8) | data[off + 3]) >>> 0;

    const ifdOffset = u32(4);
    if (ifdOffset + 2 > data.length) return;
    const tagCount = u16(ifdOffset);
    let p = ifdOffset + 2;

    let xRes = null, yRes = null, resUnit = 2; // default inches

    for (let i = 0; i < tagCount && p + 12 <= data.length; i++) {
      const tag = u16(p);
      const type = u16(p + 2);
      const count = u32(p + 4);
      const valOff = p + 8;

      if (tag === 0x0112) { // Orientation
        facts.exifOrientation = u16(valOff);
      } else if (tag === 0x0128) { // ResolutionUnit: 2 = in, 3 = cm
        resUnit = u16(valOff);
      } else if (tag === 0x011A) { // XResolution (Rational)
        const off = u32(valOff);
        if (off + 8 <= data.length) {
          const num = u32(off);
          const den = u32(off + 4);
          if (den > 0) xRes = num / den;
        }
      } else if (tag === 0x011B) { // YResolution
        const off = u32(valOff);
        if (off + 8 <= data.length) {
          const num = u32(off);
          const den = u32(off + 4);
          if (den > 0) yRes = num / den;
        }
      } else if (tag === 0x0131) { // Software
        const off = count > 4 ? u32(valOff) : valOff;
        if (off + count <= data.length) {
          facts.creatorTool = this._ascii(data.subarray(off, off + count)).replace(/\0+$/, '');
        }
      }
      p += 12;
    }

    if (xRes && yRes) {
      facts.resolutions.exif = {
        unit: resUnit === 3 ? 'cm' : 'inches',
        x: resUnit === 3 ? Math.round(xRes * 2.54) : Math.round(xRes),
        y: resUnit === 3 ? Math.round(yRes * 2.54) : Math.round(yRes)
      };
    }
  },

  _parsePhotoshopApp13(data, facts) {
    let p = 0;
    while (p < data.length - 12) {
      if (data[p] === 0x38 && data[p + 1] === 0x42 && data[p + 2] === 0x49 && data[p + 3] === 0x4D) { // '8BIM'
        const rid = (data[p + 4] << 8) | data[p + 5];
        const nLen = data[p + 6];
        let name = '';
        if (nLen > 0 && p + 7 + nLen <= data.length) {
          name = this._ascii(data.subarray(p + 7, p + 7 + nLen));
        }
        let skip = 7 + nLen;
        if (skip % 2 !== 0) skip++;
        if (p + skip + 4 > data.length) break;
        const dLen = ((data[p + skip] << 24) | (data[p + skip + 1] << 16) | (data[p + skip + 2] << 8) | data[p + skip + 3]) >>> 0;
        p = p + skip + 4;
        if (p + dLen > data.length) break;

        const block = data.subarray(p, p + dLen);

        // 1005 (0x03ED): ResolutionInfo
        if (rid === 0x03ED && block.length >= 16) {
          const hRes = ((block[0] << 24) | (block[1] << 16) | (block[2] << 8) | block[3]) / 65536.0;
          const hUnit = (block[4] << 8) | block[5]; // 1 = in, 2 = cm
          const vRes = ((block[8] << 24) | (block[9] << 16) | (block[10] << 8) | block[11]) / 65536.0;
          facts.resolutions.photoshop = {
            unit: hUnit === 2 ? 'cm' : 'inches',
            x: hUnit === 2 ? Math.round(hRes * 2.54) : Math.round(hRes),
            y: hUnit === 2 ? Math.round(vRes * 2.54) : Math.round(vRes)
          };
        }
        // 2000-2997 (0x07D0-0x0BB5): Path info (clipping path)
        else if (rid >= 2000 && rid <= 2997) {
          const pathName = name || `Path ${rid - 1999}`;
          if (!facts.clippingPaths.includes(pathName)) facts.clippingPaths.push(pathName);
        }
        // 2999 (0x0BB7): Name of clipping path
        else if (rid === 2999 && block.length > 0) {
          facts.activeClippingPath = this._ascii(block).replace(/\0+$/, '').trim();
          if (facts.activeClippingPath && !facts.clippingPaths.includes(facts.activeClippingPath)) {
            facts.clippingPaths.push(facts.activeClippingPath);
          }
        }
        // 1006 (0x03EE): Alpha names
        else if (rid === 0x03EE && block.length > 0) {
          const raw = this._ascii(block);
          const parts = raw.split('\0').filter(s => s.trim().length > 0);
          facts.alphaChannels.push(...parts);
        }

        p += dLen;
        if (p % 2 !== 0) p++;
      } else {
        p++;
      }
    }
  },

  _parseXmp(data, facts) {
    try {
      const txt = this._ascii(data);
      const mCreator = txt.match(/<xmp:CreatorTool>([^<]+)<\/xmp:CreatorTool>/i);
      if (mCreator && !facts.creatorTool) facts.creatorTool = mCreator[1].trim();

      const mMode = txt.match(/photoshop:ColorMode=["']?(\d+)["']?/i);
      if (mMode) {
        const modeMap = { 0: 'Bitmap', 1: 'Grayscale', 2: 'Indexed', 3: 'RGB', 4: 'CMYK', 7: 'Multichannel', 8: 'Duotone', 9: 'LAB' };
        facts.xmp = { colorMode: modeMap[mMode[1]] || mMode[1] };
      }
    } catch (e) {}
  },

  _parseIcc(bytes) {
    if (bytes.length < 132) return null;
    const u32 = (off) => ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;
    const size = u32(0);
    const colorSpace = this._ascii(bytes.subarray(16, 20)).trim();
    const tagCount = u32(128);

    let desc = '';
    let p = 132;
    for (let i = 0; i < tagCount && p + 12 <= bytes.length; i++) {
      const sig = this._ascii(bytes.subarray(p, p + 4));
      const off = u32(p + 4);
      const len = u32(p + 8);
      if (sig === 'desc' && off + len <= bytes.length) {
        const tag = bytes.subarray(off, off + len);
        const tagType = this._ascii(tag.subarray(0, 4));
        if (tagType === 'desc') {
          const asciiLen = u32(off + 8);
          if (asciiLen > 1 && off + 12 + asciiLen <= bytes.length) {
            desc = this._ascii(bytes.subarray(off + 12, off + 12 + asciiLen - 1));
          }
        } else if (tagType === 'mluc') {
          const recCount = u32(off + 8);
          if (recCount > 0 && off + 28 <= bytes.length) {
            const recLen = u32(off + 20);
            const recOff = u32(off + 24);
            if (off + recOff + recLen <= bytes.length) {
              const u16b = bytes.subarray(off + recOff, off + recOff + recLen);
              let s = '';
              for (let k = 0; k < u16b.length - 1; k += 2) {
                s += String.fromCharCode((u16b[k] << 8) | u16b[k + 1]);
              }
              desc = s;
            }
          }
        }
        break;
      }
      p += 12;
    }

    return {
      size: Math.min(size, bytes.length),
      colorSpace,
      desc: desc.trim() || colorSpace
    };
  },

  // ── PNG Forensics (Chunk scanner + Worker alpha measure) ──────────────────
  async _inspectPng(file, opts) {
    const facts = {
      fileSize: file.size,
      ihdr: null,
      transparency: { hasAlphaChannel: false, hasTrns: false, alphaPercent: 0, opaqueBounds: null },
      color: { profileName: null, srgbIntent: null, gamma: null, chrm: null },
      declaredDpi: null,
      text: {},
      isAnimated: false,
      integrity: { hasIend: false, crcErrors: [], trailingDataBytes: 0 }
    };
    const flags = [];
    const limits = [];

    // Check PNG signature
    const sigBuf = await file.slice(0, 8).arrayBuffer();
    const sig = new Uint8Array(sigBuf);
    const validSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    for (let i = 0; i < 8; i++) {
      if (sig[i] !== validSig[i]) {
        return {
          ok: false,
          error: 'Corrupt or invalid PNG signature',
          facts,
          flags: [{ code: 'PNG_CRC_ERROR', evidence: { error: 'Bad signature' } }],
          limits
        };
      }
    }

    // Read chunks (stream slices to protect memory on 30 MB PNGs)
    let offset = 8;
    const chunkSize = 2 * 1024 * 1024;
    let buf = await file.slice(offset, Math.min(file.size, offset + chunkSize)).arrayBuffer();
    let bytes = new Uint8Array(buf);
    let bufStart = offset;

    const ensureBytes = async (neededLen) => {
      if (offset + neededLen > bufStart + bytes.length && offset + neededLen <= file.size) {
        bufStart = offset;
        const readTo = Math.min(file.size, offset + Math.max(neededLen, chunkSize));
        buf = await file.slice(bufStart, readTo).arrayBuffer();
        bytes = new Uint8Array(buf);
      }
    };

    while (offset < file.size - 4) {
      if (opts.alive && !opts.alive()) return { ok: false, error: 'Aborted', facts, flags, limits };

      await ensureBytes(12);
      const localOff = offset - bufStart;
      if (localOff + 12 > bytes.length) break;

      const len = ((bytes[localOff] << 24) | (bytes[localOff + 1] << 16) | (bytes[localOff + 2] << 8) | bytes[localOff + 3]) >>> 0;
      const type = this._ascii(bytes.subarray(localOff + 4, localOff + 8));

      // Check CRC on key chunks (IHDR, IEND, etc.)
      await ensureBytes(12 + len);
      const chunkDataOff = offset - bufStart + 8;
      const chunkEndOff = chunkDataOff + len;
      if (chunkEndOff + 4 <= bytes.length) {
        const storedCrc = ((bytes[chunkEndOff] << 24) | (bytes[chunkEndOff + 1] << 16) | (bytes[chunkEndOff + 2] << 8) | bytes[chunkEndOff + 3]) >>> 0;
        const computedCrc = this._crc32(bytes.subarray(offset - bufStart + 4, chunkEndOff));
        if (storedCrc !== computedCrc) {
          facts.integrity.crcErrors.push({ chunk: type, stored: storedCrc, computed: computedCrc });
          flags.push({ code: 'PNG_CRC_ERROR', evidence: { chunk: type, stored: storedCrc, computed: computedCrc } });
        }
      }

      // IHDR
      if (type === 'IHDR') {
        const d = bytes.subarray(chunkDataOff, chunkDataOff + len);
        const w = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
        const h = ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]) >>> 0;
        const bitDepth = d[8];
        const colorType = d[9];
        const colorMap = { 0: 'Grayscale', 2: 'RGB', 3: 'Indexed', 4: 'Grayscale + Alpha', 6: 'RGBA' };
        facts.ihdr = {
          width: w,
          height: h,
          bitDepth,
          colorType: colorMap[colorType] || colorType,
          compression: d[10],
          filter: d[11],
          interlace: d[12] === 1 ? 'Adam7' : 'None'
        };

        if (colorType === 4 || colorType === 6) {
          facts.transparency.hasAlphaChannel = true;
        }
        if (bitDepth === 16) flags.push({ code: 'PNG_16BIT', evidence: { bitDepth: 16 } });
        if (colorType === 3) flags.push({ code: 'PNG_INDEXED', evidence: { colorType: 'Indexed' } });
      }

      // tRNS
      else if (type === 'tRNS') {
        facts.transparency.hasTrns = true;
      }

      // pHYs
      else if (type === 'pHYs' && len >= 9) {
        const d = bytes.subarray(chunkDataOff, chunkDataOff + len);
        const ppuX = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
        const ppuY = ((d[4] << 24) | (d[5] << 16) | (d[6] << 8) | d[7]) >>> 0;
        const unit = d[8]; // 1 = metre
        if (unit === 1) {
          facts.declaredDpi = {
            unit: 'inches',
            x: Math.round(ppuX * 0.0254 * 10) / 10,
            y: Math.round(ppuY * 0.0254 * 10) / 10
          };
        }
      }

      // iCCP
      else if (type === 'iCCP') {
        const d = bytes.subarray(chunkDataOff, chunkDataOff + len);
        let nullIdx = -1;
        for (let k = 0; k < d.length; k++) {
          if (d[k] === 0) { nullIdx = k; break; }
        }
        if (nullIdx > 0) {
          const profileName = this._ascii(d.subarray(0, nullIdx));
          facts.color.profileName = profileName;
          const compressed = d.subarray(nullIdx + 2); // null + 1 byte comp method
          const decompressed = await this._inflate(compressed);
          if (decompressed) {
            const parsed = this._parseIcc(decompressed);
            if (parsed) {
              facts.color.icc = parsed;
              facts.color.profileName = parsed.desc || profileName;
            }
          }
        }
      }

      // sRGB
      else if (type === 'sRGB' && len >= 1) {
        const intents = ['Perceptual', 'Relative colorimetric', 'Saturation', 'Absolute colorimetric'];
        facts.color.srgbIntent = intents[bytes[chunkDataOff]] || 'Unknown';
      }

      // gAMA
      else if (type === 'gAMA' && len >= 4) {
        const d = bytes.subarray(chunkDataOff, chunkDataOff + len);
        const g = ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
        facts.color.gamma = Math.round((g / 100000) * 100) / 100;
      }

      // acTL (APNG Animation)
      else if (type === 'acTL') {
        facts.isAnimated = true;
        flags.push({ code: 'PNG_ANIMATED', evidence: { note: 'APNG animated: only the first frame prints' } });
      }

      // tEXt
      else if (type === 'tEXt') {
        const d = bytes.subarray(chunkDataOff, chunkDataOff + len);
        let nullIdx = -1;
        for (let k = 0; k < d.length; k++) {
          if (d[k] === 0) { nullIdx = k; break; }
        }
        if (nullIdx > 0) {
          const key = this._ascii(d.subarray(0, nullIdx));
          const val = this._ascii(d.subarray(nullIdx + 1));
          facts.text[key] = val;
        }
      }

      // IEND
      else if (type === 'IEND') {
        facts.integrity.hasIend = true;
        const trailing = file.size - (offset + 12);
        facts.integrity.trailingDataBytes = Math.max(0, trailing);
        break;
      }

      offset += 12 + len;
    }

    if (!facts.integrity.hasIend) {
      flags.push({ code: 'PNG_TRUNCATED', evidence: { size: file.size, reason: 'Missing IEND chunk' } });
    }

    // Alpha measure in worker
    if (facts.transparency.hasAlphaChannel || facts.transparency.hasTrns) {
      if (facts.ihdr && facts.ihdr.width > 0 && facts.ihdr.height > 0) {
        const alphaRes = await this._measurePngAlpha(file, facts.ihdr.width, facts.ihdr.height);
        if (alphaRes.ok) {
          facts.transparency.alphaPercent = alphaRes.percent;
          facts.transparency.zeroPercent = alphaRes.zeroPercent;
          facts.transparency.opaqueBounds = alphaRes.bounds;
          facts.transparency.measuredSize = alphaRes.measuredSize;
          if (alphaRes.percent >= 1.0) {
            flags.push({
              code: 'PNG_TRANSPARENT_AREA',
              evidence: {
                alphaPercent: alphaRes.percent,
                zeroPercent: alphaRes.zeroPercent,
                bounds: alphaRes.bounds
              }
            });
          }
        } else {
          limits.push(`Alpha measurement skipped: ${alphaRes.error}`);
        }
      }
    }

    return { ok: facts.integrity.hasIend && facts.integrity.crcErrors.length === 0, facts, flags, limits };
  },

  _measurePngAlpha(file, w, h) {
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      return Promise.resolve({ ok: false, error: 'Worker/OffscreenCanvas not available' });
    }
    return new Promise((resolve) => {
      let worker = null;
      let url = null;
      const timer = setTimeout(() => {
        if (worker) worker.terminate();
        if (url) URL.revokeObjectURL(url);
        resolve({ ok: false, error: 'Alpha worker timed out (1.5s)' });
      }, 1500);

      try {
        url = URL.createObjectURL(new Blob([this.ALPHA_WORKER_CODE], { type: 'text/javascript' }));
        worker = new Worker(url);
        worker.onmessage = (e) => {
          clearTimeout(timer);
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve(e.data);
        };
        worker.onerror = (e) => {
          clearTimeout(timer);
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve({ ok: false, error: e.message || 'Worker error' });
        };
        worker.postMessage({ file, w, h });
      } catch (err) {
        clearTimeout(timer);
        if (url) URL.revokeObjectURL(url);
        resolve({ ok: false, error: String(err) });
      }
    });
  },

  // ── PDF Forensics (raw dictionaries first, then pdf.js 3.11.174 for structure) ──────────────
  // Audit 30-10-2026 (Design Quality): pdf.js leaves overprint out of its operator list and gives colours as
  // 0–255, so "which object overprints" cannot be read from it — overprint is reported per ExtGState only. The
  // operator list makes pdf.js decode every picture again (5–15 s and hundreds of MB on a print PDF, after
  // PostCheck already did it): it is built only for a file with layers, to count what each layer holds.
  LAYER_SCAN_MB: 80,                 // larger layered files: layers listed, their contents not counted
  LAYER_SCAN_PAGES: 4,

  async _inspectPdf(file, opts) {
    const facts = {
      fileSize: file.size,
      version: null,
      pageCount: 0,
      encrypted: false,
      creator: null,
      producer: null,
      creatorTool: null,
      standard: null,
      outputIntents: [],
      pages: [],
      layers: [],
      layersCounted: false,
      spotColours: [],
      overprint: { extGStates: 0 },
      transparency: { blendModes: [], softMasks: 0, alphaCount: 0 },
      pictures: [],
      annotations: { total: 0, printingCount: 0, byType: {} },
      invisibleText: { mode3Count: null }
    };
    const flags = [];
    const limits = [];
    const alive = () => !opts.alive || opts.alive();

    const headStr = this._latin1(await file.slice(0, 1024).arrayBuffer());
    const mVer = headStr.match(/%PDF-([\d.]+)/);
    if (mVer) facts.version = mVer[1];
    // /Encrypt sits in the trailer, at the end of the file
    const tailStr = this._latin1(await file.slice(Math.max(0, file.size - 65536), file.size).arrayBuffer());
    if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(tailStr) || /\/Encrypt\s*<</.test(tailStr)) facts.encrypted = true;

    // 1. The raw dictionaries (cheap, in chunks): spot colours, ExtGState, page boxes, pictures, OutputIntents and
    //    the layers' own dictionaries (name, print / view usage)
    const raw = await this._scanPdfDicts(file, facts, limits, opts);
    if (!alive()) return { ok: false, error: 'Aborted', facts, flags, limits };

    // 2. pdf.js: pages, metadata, layers and their default visibility, comments
    let pdfjs = null;
    try { pdfjs = (typeof FileAnalyzer !== 'undefined' && FileAnalyzer._loadPdfJs) ? await FileAnalyzer._loadPdfJs() : window.pdfjsLib; } catch (e) { pdfjs = window.pdfjsLib; }
    if (!pdfjs) {
      limits.push('pdf.js not available: pages, layers and comments not read');
      return this._pdfFlags(facts, flags, limits, true);
    }
    let doc = null, opened = false;
    try {
      doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), stopAtErrors: false }).promise;
      opened = true;
      facts.pageCount = doc.numPages;
      const meta = await doc.getMetadata().catch(() => null);
      if (meta && meta.info) {
        facts.creator = meta.info.Creator || null;
        facts.producer = meta.info.Producer || null;
        if (meta.info.IsEncrypted !== undefined) facts.encrypted = facts.encrypted || !!meta.info.IsEncrypted;
      }
      const xmp = meta && meta.metadata && typeof meta.metadata.getRaw === 'function' ? meta.metadata.getRaw() : '';
      if (xmp) {
        const mTool = xmp.match(/<xmp:CreatorTool>([^<]+)<\/xmp:CreatorTool>/i) || xmp.match(/xmp:CreatorTool="([^"]+)"/i);
        if (mTool) facts.creatorTool = mTool[1].trim();
        const mX = xmp.match(/<pdfx:GTS_PDFXVersion>([^<]+)</i) || xmp.match(/pdfx:GTS_PDFXVersion="([^"]+)"/i);
        if (mX && !facts.standard) facts.standard = mX[1].trim();
      }

      // layers: pdf.js keys them by object ("6R"); the raw dictionary of the same object has the print / view usage
      const ocMap = new Map();
      const cfg = doc.getOptionalContentConfig ? await doc.getOptionalContentConfig().catch(() => null) : null;
      const groups = cfg && cfg.getGroups ? cfg.getGroups() : null;
      Object.entries(groups || {}).forEach(([id, g]) => {
        const on = typeof (g && g.visible) === 'boolean' ? g.visible : cfg.isVisible({ type: 'OCG', id });
        const r = raw.ocgs.get(parseInt(id, 10)) || {};
        ocMap.set(id, {
          name: (g && g.name) || r.name || id,
          defaultState: on ? 'ON' : 'OFF',
          printState: r.print || 'not set',
          viewState: r.view || 'not set',
          artworkCount: null,
          pages: []
        });
      });
      if (ocMap.size && !raw.ocgs.size) limits.push('Layer print / view settings are in a compressed part of the file: not read');
      if (raw.printEvent) facts.layerPrintUsageApplied = true;

      // what each layer holds: the operator list, only for a layered file of reasonable size (see LAYER_SCAN_MB)
      const countLayers = ocMap.size > 0 && file.size <= this.LAYER_SCAN_MB * 1048576;
      if (ocMap.size && !countLayers) limits.push(`Layered file over ${this.LAYER_SCAN_MB} MB: layers listed, their contents not counted`);
      if (countLayers) {
        ocMap.forEach(l => { l.artworkCount = 0; });
        facts.layersCounted = true;
        facts.invisibleText.mode3Count = 0;
      }

      const O = pdfjs.OPS;
      const PAINT = new Set(['fill', 'eoFill', 'stroke', 'fillStroke', 'eoFillStroke', 'closeStroke', 'closeFillStroke',
        'closeEOFillStroke', 'paintImageXObject', 'paintInlineImageXObject', 'paintImageMaskXObject', 'paintImageXObjectRepeat',
        'paintSolidColorImageMask', 'showText', 'showSpacedText', 'nextLineShowText', 'nextLineSetSpacingShowText',
        'shadingFill'].map(n => O[n]).filter(v => v !== undefined));
      const BEGIN = new Set([O.beginMarkedContent, O.beginMarkedContentProps]);
      for (let pNum = 1; pNum <= doc.numPages; pNum++) {
        if (!alive()) return { ok: false, error: 'Aborted', facts, flags, limits };
        const page = await doc.getPage(pNum);
        const uu = page.userUnit || 1;
        const inch = pt => Math.round(pt / 72 * uu * 1000) / 1000;
        const view = page.view || [0, 0, 0, 0];
        facts.pages.push({ pageNumber: pNum, rotation: page.rotate || 0, userUnit: uu,
          cropBox: { pts: view, widthIn: inch(view[2] - view[0]), heightIn: inch(view[3] - view[1]) },
          trimBox: null, bleedBox: null, bleed: null });
        try {
          (await page.getAnnotations()).forEach(a => {
            facts.annotations.total++;
            const sub = a.subtype || 'Unknown';
            facts.annotations.byType[sub] = (facts.annotations.byType[sub] || 0) + 1;
            // a comment, stamp or drawing markup with the Print flag (bit 3) prints with the page in Acrobat;
            // links, form fields and pop-ups have nothing to print
            if ((a.annotationFlags & 4) && !['Link', 'Widget', 'Popup'].includes(sub)) facts.annotations.printingCount++;
          });
        } catch (e) {}
        if (countLayers && pNum <= this.LAYER_SCAN_PAGES) {
          try {
            const ol = await page.getOperatorList();
            const stack = [];                               // one entry per open marked-content block (null = not a layer)
            const layerOf = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i]) return stack[i]; return null; };
            for (let i = 0; i < ol.fnArray.length; i++) {
              const fn = ol.fnArray[i], a = ol.argsArray[i];
              if (BEGIN.has(fn)) {
                const props = fn === O.beginMarkedContentProps && a && a[0] === 'OC' ? a[1] : null;
                const ids = props ? (props.type === 'OCMD' ? (props.ids || []) : [props.id]) : [];
                stack.push(ids.filter(id => ocMap.has(id)).map(id => ocMap.get(id))[0] || null);
              } else if (fn === O.endMarkedContent) stack.pop();
              else if (fn === O.setTextRenderingMode && a && a[0] === 3) facts.invisibleText.mode3Count++;
              else if (PAINT.has(fn)) {
                const l = layerOf();
                if (l) { l.artworkCount++; if (!l.pages.includes(pNum)) l.pages.push(pNum); }
              }
            }
          } catch (e) { limits.push(`Page ${pNum}: layer contents not read (${e.message || e})`); }
        }
        page.cleanup();
        await this._yield();
      }
      if (countLayers && doc.numPages > this.LAYER_SCAN_PAGES) limits.push(`Layer contents counted on the first ${this.LAYER_SCAN_PAGES} pages`);
      facts.layers = [...ocMap.values()];
    } catch (err) {
      if (err && (err.name === 'PasswordException' || /password/i.test(String(err)))) {
        facts.encrypted = true;
        limits.push('Password-protected PDF: pages, layers and comments not readable');
      } else {
        limits.push(`The PDF could not be opened completely: ${err && err.message || err}`);
      }
    } finally {
      if (doc) { try { doc.destroy(); } catch (e) {} }
    }

    // page boxes from the raw page dictionary: exact for a one-page file only
    if (facts.pages.length === 1 && raw.boxes) {
      const p = facts.pages[0], inch = pt => Math.round(pt / 72 * (p.userUnit || 1) * 1000) / 1000;
      const box = n => n && { pts: n, widthIn: inch(Math.abs(n[2] - n[0])), heightIn: inch(Math.abs(n[3] - n[1])) };
      p.trimBox = box(raw.boxes.TrimBox);
      p.bleedBox = box(raw.boxes.BleedBox);
      if (raw.boxes.TrimBox && raw.boxes.BleedBox) {
        const t = raw.boxes.TrimBox, b = raw.boxes.BleedBox;
        p.bleed = { leftIn: inch(Math.max(0, t[0] - b[0])), bottomIn: inch(Math.max(0, t[1] - b[1])),
          rightIn: inch(Math.max(0, b[2] - t[2])), topIn: inch(Math.max(0, b[3] - t[3])) };
      }
    } else if (facts.pages.length > 1) limits.push('Trim / bleed boxes are not read per page on a multi-page file');

    return this._pdfFlags(facts, flags, limits, opened);
  },

  /** The flags of a PDF from its facts (objective conditions only — the card decides what a designer sees) */
  _pdfFlags(facts, flags, limits, opened) {
    if (facts.encrypted) flags.push({ code: 'PDF_ENCRYPTED', evidence: {} });
    facts.layers.forEach(l => {
      const holds = l.artworkCount === null ? null : l.artworkCount;
      if (l.defaultState === 'OFF' && holds !== 0) flags.push({ code: 'PDF_HIDDEN_LAYER', evidence: { layer: l.name, objects: holds, pages: l.pages } });
      if (l.printState === 'OFF' && holds !== 0) flags.push({ code: 'PDF_NONPRINT_LAYER', evidence: { layer: l.name, objects: holds, view: l.viewState } });
    });
    facts.spotColours.forEach(s => {
      const code = { cutline: 'PDF_SPOT_CUTLINE', white: 'PDF_SPOT_WHITE', varnish: 'PDF_SPOT_VARNISH' }[s.kind] || 'PDF_SPOT_OTHER';
      flags.push({ code, evidence: { name: s.name } });
    });
    if (facts.overprint.extGStates > 0) flags.push({ code: 'PDF_OVERPRINT', evidence: { extGStates: facts.overprint.extGStates } });
    const t = facts.transparency;
    if (t.blendModes.length || t.softMasks || t.alphaCount) flags.push({ code: 'PDF_TRANSPARENCY', evidence: { blendModes: t.blendModes, softMasks: t.softMasks, alphaCount: t.alphaCount } });
    if (facts.pages.length > 1) {
      const p1 = facts.pages[0].cropBox;
      if (facts.pages.some(p => Math.abs(p.cropBox.widthIn - p1.widthIn) > 0.05 || Math.abs(p.cropBox.heightIn - p1.heightIn) > 0.05)) {
        flags.push({ code: 'PDF_MIXED_PAGE_SIZES', evidence: { pages: facts.pages.map(p => [p.pageNumber, p.cropBox.widthIn, p.cropBox.heightIn]) } });
      }
    }
    const p0 = facts.pages[0];
    if (p0 && p0.bleed) flags.push({ code: 'PDF_BLEED', evidence: p0.bleed });
    else if (p0 && facts.pages.length === 1 && !p0.bleedBox) flags.push({ code: 'PDF_NO_BLEEDBOX', evidence: {} });
    if (facts.annotations.printingCount > 0) flags.push({ code: 'PDF_PRINTING_ANNOTS', evidence: { count: facts.annotations.printingCount, byType: facts.annotations.byType } });
    if (facts.invisibleText.mode3Count > 0) flags.push({ code: 'PDF_INVISIBLE_TEXT', evidence: { mode3Count: facts.invisibleText.mode3Count } });
    if (facts.overprint.extGStates > 0) limits.push('which objects overprint (e.g. white set to overprint) — pdf.js does not report overprint per object');
    return { ok: opened, facts, flags, limits };
  },

  /**
   * Raw PDF dictionaries, read in 4 MB chunks (up to 160 MB) with a 512-byte overlap: spot colours (/Separation,
   * /DeviceN), ExtGState (overprint, blend modes, soft masks, opacity), the first page's boxes, pictures, OutputIntents
   * and the layers' own dictionaries. Dictionaries inside compressed object streams are not visible here.
   * @returns {{ ocgs: Map<number, {name, print, view}>, printEvent: boolean, boxes: object|null }}
   */
  async _scanPdfDicts(file, facts, limits, opts) {
    const CH = 4 << 20, LIMIT = 160 << 20, total = Math.min(file.size, LIMIT);
    const spots = new Map(), ocgs = new Map(), boxes = {}, seenGs = new Set(), seenImg = new Set();
    let printEvent = false;
    const kindOf = name => this.CUTTER_REGEX.test(name) ? 'cutline' : this.WHITE_REGEX.test(name) ? 'white'
      : this.VARNISH_REGEX.test(name) ? 'varnish' : 'other';
    const addSpot = (raw, type) => {
      const name = this._unescapePdfName(raw);
      if (name && !['All', 'None'].includes(name) && !spots.has(name)) spots.set(name, { name, type, kind: kindOf(name) });
    };
    const pdfStr = s => s && s[0] === '<' ? s.slice(1, -1).replace(/\s+/g, '').replace(/^FEFF/i, '').match(/../g)
      .map(h => String.fromCharCode(parseInt(h, 16))).join('').replace(/\0/g, '') : (s || '').slice(1, -1);
    // every object whose dictionary holds the marker (/Type /OCG, /Subtype /Image… anywhere in it — Illustrator
    // writes /Type last): its number and its text up to endobj (or up to its stream)
    const objectsOf = (txt, value, key = 'Type', until = 'endobj') => {
      const out = [], re = new RegExp('\\/' + key + '\\s*\\/' + value + '(?![A-Za-z])', 'g');
      let m;
      while ((m = re.exec(txt)) !== null) {
        const head = txt.lastIndexOf('obj', m.index), end = txt.indexOf(until, m.index);
        if (head < 0 || m.index - head > 4000 || end < 0 || end - m.index > 4000) continue;
        const num = txt.slice(Math.max(0, head - 24), head).match(/(\d+)\s+\d+\s*$/);
        if (num) out.push({ num: +num[1], body: txt.slice(head, end) });
      }
      return out;
    };
    for (let off = 0; off < total; off += CH) {
      if (opts.alive && !opts.alive()) break;
      const start = Math.max(0, off - 512);
      const txt = this._latin1(await file.slice(start, Math.min(file.size, off + CH)).arrayBuffer());
      let m;
      if (!facts.standard) { const mX = txt.match(/\/GTS_PDFXVersion\s*\(([^)]+)\)/); if (mX) facts.standard = mX[1].trim(); }
      const reIntent = /\/OutputConditionIdentifier\s*\(([^)]+)\)/g;
      while ((m = reIntent.exec(txt)) !== null) if (!facts.outputIntents.includes(m[1])) facts.outputIntents.push(m[1]);

      // ExtGState (each object once — the overlap reads its first 512 bytes twice)
      objectsOf(txt, 'ExtGState').forEach(o => {
        if (seenGs.has(o.num)) return;
        seenGs.add(o.num);
        const block = o.body;
        if (/\/OP\s+true/.test(block) || /\/op\s+true/.test(block)) facts.overprint.extGStates++;
        const bm = block.match(/\/BM\s*\/(\w+)/);
        if (bm && bm[1] !== 'Normal' && bm[1] !== 'Compatible' && !facts.transparency.blendModes.includes(bm[1])) facts.transparency.blendModes.push(bm[1]);
        if (/\/SMask\s*(<<|\d+\s+\d+\s+R)/.test(block)) facts.transparency.softMasks++;
        const ca = block.match(/\/(?:CA|ca)\s+([\d.]+)/);
        if (ca && parseFloat(ca[1]) < 1) facts.transparency.alphaCount++;
      });

      const reSep = /\/Separation\s*\/([^\s\/\[\]<>()]+)/g;
      while ((m = reSep.exec(txt)) !== null) addSpot(m[1], 'separation');
      const reDevN = /\/DeviceN\s*\[\s*([^\]]+)\]/g;
      while ((m = reDevN.exec(txt)) !== null) (m[1].match(/\/[^\s\/\[\]<>()]+/g) || []).forEach(n => addSpot(n.slice(1), 'devicen'));

      // the layers' own dictionaries: name and /Usage print / view states; the print event that applies them
      objectsOf(txt, 'OCG').forEach(o => {
        const b = o.body, nm = b.match(/\/Name\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>)/);
        const pr = b.match(/\/PrintState\s*\/(ON|OFF)/), vw = b.match(/\/ViewState\s*\/(ON|OFF)/);
        ocgs.set(o.num, { name: nm ? pdfStr(nm[1]) : null, print: pr ? pr[1] : null, view: vw ? vw[1] : null });
      });
      if (/\/AS\s*\[[\s\S]{0,300}?\/Event\s*\/Print/.test(txt)) printEvent = true;

      // the first page's boxes (used for a one-page file)
      if (!boxes.done) {
        const pg = objectsOf(txt, 'Page')[0];
        if (pg) {
          ['TrimBox', 'BleedBox', 'MediaBox'].forEach(k => {
            const b = pg.body.match(new RegExp('\\/' + k + '\\s*\\[\\s*([\\d.\\s-]+)\\]'));
            if (b) { const n = b[1].trim().split(/\s+/).map(Number); if (n.length === 4) boxes[k] = n; }
          });
          boxes.done = true;
        }
      }

      objectsOf(txt, 'Image', 'Subtype', 'stream').forEach(o => {
        if (seenImg.has(o.num)) return;
        seenImg.add(o.num);
        const b = o.body, w = b.match(/\/Width\s+(\d+)/), h = b.match(/\/Height\s+(\d+)/);
        if (!w || !h) return;
        const bpc = b.match(/\/BitsPerComponent\s+(\d+)/), flt = b.match(/\/Filter\s*(\/\w+|\[[^\]]*\])/);
        facts.pictures.push({ width: +w[1], height: +h[1], bitsPerComponent: bpc ? +bpc[1] : null,
          filter: flt ? flt[1].replace(/[\[\]\/]/g, ' ').trim().replace(/\s+/g, ' ') : 'none',
          isMask: /\/ImageMask\s+true/.test(b), hasSoftMask: /\/SMask\s+\d+\s+\d+\s+R/.test(b) });
      });
      await this._yield();
    }
    if (file.size > LIMIT) limits.push(`Only the first 160 MB of the ${Math.round(file.size / 1048576)} MB file were scanned`);
    facts.spotColours = [...spots.values()];
    return { ocgs, printEvent, boxes: boxes.done ? boxes : null };
  },

  // ── Into the existing check cards (no card of its own) ───────────────────
  /**
   * What the reading means for the order, as notes for the check cards the Hub already shows: each note names the
   * cards it belongs to, the first one in the report takes it. Critical only for a damaged PNG; a look by eye for
   * what may not print as it is seen (a hidden or non-printing layer, comments set to print, an EXIF turn,
   * transparent areas, a cut line on a product that is not die-cut, a JPG without its end marker); the plain facts
   * go into the details ("Analysis") of the colour / pages card. Names read from the file never carry HTML — the
   * cards show their text as HTML.
   * @returns {{notes: object[], facts: object[]}|null}
   */
  findings(analysis, ctx = {}) {
    const f = analysis && analysis.forensics;
    if (!f || !f.ok) return null;
    const F = f.facts || {}, flag = c => (f.flags || []).filter(x => x.code === c);
    const st = typeof appState !== 'undefined' ? appState : {};
    const name = [(st.parsedFilename && st.parsedFilename.fname) || '', (st.file && st.file.name) || '', (ctx.spec && ctx.spec.name) || ''].join(' ');
    const dieCut = typeof FineMarks !== 'undefined' && FineMarks.isDieCut ? FineMarks.isDieCut(name) : /die[\s_-]?cut|decal|sticker/i.test(name);
    // a name from the file can never be HTML: < > & " become look-alikes (not entities — the closed card escapes
    // its one-line result again, "&amp;" would show)
    const esc = t => String(t == null ? '' : t).replace(/</g, '‹').replace(/>/g, '›').replace(/&/g, '＆').replace(/"/g, '”');
    const inch = v => `${+(+v).toFixed(3)}"`;
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    // the cards each note can go to, in order (a PDF design file has the "pc-" cards, a picture the pre-check ones;
    // "Print suitability" is folded into the size card on a low-resolution picture — then the colour card, which
    // says how the picture will print, takes the note; a damaged file stays with the size card)
    const PAGES = ['pc-pages', 'goodForPrint'], COLOUR = ['pc-colour', 'colorMode'], PRINT = ['goodForPrint', 'colorMode'];
    const notes = [], facts = [];
    const note = (to, short, long, critical) => notes.push({ to, short, long, critical: !!critical });
    const fact = (to, list) => { if (list.length) facts.push({ to, text: `In the file: ${list.join(' · ')}.` }); };

    if (f.type === 'pdf') {
      const file = [`PDF ${F.version || ''} · ${plural(F.pageCount || 0, 'page')}`.replace('PDF  ·', 'PDF ·')];
      const app = F.creatorTool || F.creator;
      if (app) file.push(`made in ${esc(app)}`);
      if (F.standard) file.push(esc(F.standard));
      const L = F.layers || [];
      file.push(L.length ? `${plural(L.length, 'layer')}: ${L.map(l => `“${esc(l.name)}”${l.defaultState === 'OFF' ? ' (hidden)' : ''}${l.printState === 'OFF' ? ' (does not print)' : ''}`).join(', ')}` : 'no layers');
      const p0 = (F.pages || [])[0];
      if (p0 && p0.bleed) {
        const b = p0.bleed, v = [b.topIn, b.rightIn, b.bottomIn, b.leftIn];
        file.push(v.every(x => Math.abs(x - v[0]) < 0.005) ? `bleed box ${inch(v[0])} all round` : `bleed box ${v.map(inch).join(' / ')} (top / right / bottom / left)`);
      }
      fact(PAGES, file);
      const objs = n => n ? ` holds ${plural(n, 'object')}` : '';
      flag('PDF_HIDDEN_LAYER').forEach(x => note(PAGES, `hidden layer “${esc(x.evidence.layer)}”`,
        `Hidden layer “${esc(x.evidence.layer)}”${objs(x.evidence.objects)} — it does not print. Make sure nothing on it is needed (an older version, a customer note).`));
      flag('PDF_NONPRINT_LAYER').forEach(x => note(PAGES, `layer “${esc(x.evidence.layer)}” does not print`,
        `Layer “${esc(x.evidence.layer)}”${x.evidence.objects ? ` (${plural(x.evidence.objects, 'object')})` : ''} is set not to print — it shows on screen but not on the print.`));
      const A = F.annotations || {};
      if (A.printingCount) {
        const types = Object.keys(A.byType || {}).filter(t => !['Link', 'Widget', 'Popup'].includes(t)).map(esc).join(', ');
        note(PAGES, `${plural(A.printingCount, 'comment')} set to print`,
          `${plural(A.printingCount, 'comment / markup')} (${types}) ${A.printingCount === 1 ? 'is' : 'are'} set to print — Acrobat prints them with the artwork. Delete them unless they belong to the design.`);
      }
      if (F.encrypted) note(PAGES, 'password-protected PDF', 'The PDF is password-protected — some of its contents may not be read; ask for an unprotected file if anything looks missing.');

      const S = F.spotColours || [], kind = { cutline: 'cut line', white: 'white ink', varnish: 'varnish' }, colour = [];
      if (S.length) colour.push(`spot colour${S.length > 1 ? 's' : ''}: ${S.map(s => esc(s.name) + (kind[s.kind] ? ` (${kind[s.kind]})` : '')).join(', ')}`);
      if (F.overprint && F.overprint.extGStates) colour.push('overprint used');
      const T = F.transparency || {}, tr = [...(T.blendModes || []).map(esc), T.softMasks ? 'soft masks' : '', T.alphaCount ? 'opacity' : ''].filter(Boolean);
      if (tr.length) colour.push(`transparency (${tr.join(', ')})`);
      fact(COLOUR, colour);
      const cut = S.find(s => s.kind === 'cutline');
      if (cut && !dieCut) note(COLOUR, `cut line “${esc(cut.name)}” on a product that is not die-cut`,
        `The file has a cut-line spot colour “${esc(cut.name)}”, but the product is not die-cut — check it is not printed, or that the order should be die-cut.`);
    } else if (f.type === 'jpeg') {
      const model = { YCbCr: 'RGB', YCCK: 'CMYK' }[F.colorModel] || F.colorModel || '', list = [`JPG ${esc(model)}`];
      list.push(F.icc && F.icc.desc ? `profile “${esc(F.icc.desc)}”` : 'no colour profile');
      if (F.qualityEstimate) list.push(`saved at quality ≈ ${F.qualityEstimate}`);
      const r = F.resolutions || {}, d = r.photoshop || r.exif || r.jfif;
      if (d && d.x > 1) list.push(`${d.x} ppi written in the file`);
      if ((F.clippingPaths || []).length) list.push(`clipping path: ${F.clippingPaths.map(esc).join(', ')}`);
      fact(COLOUR, list);
      if (flag('JPG_EXIF_ROTATED').length) note(['orientation'], 'EXIF turn',
        `The JPG carries an EXIF turn (orientation ${esc(F.exifOrientation)}) — it shows turned in some programs and upright in others. Check it is the right way up in Photoshop / Illustrator.`);
      // (a phone may add data after the end marker — so this is a look, not Critical)
      if (flag('JPG_TRUNCATED').length) note(PRINT, 'JPG may be cut short',
        'The JPG has no end marker — it may be cut short (the bottom grey or missing). Look at the bottom of the picture; if it is grey, ask for the file again.');
    } else if (f.type === 'png') {
      const ih = F.ihdr || {}, c = F.color || {}, list = [`PNG ${esc(ih.colorType || '')}${ih.bitDepth ? ` ${ih.bitDepth}-bit` : ''}`];
      list.push(c.profileName ? `profile “${esc(c.profileName)}”` : c.srgbIntent ? 'sRGB' : 'no colour profile');
      if (F.declaredDpi && F.declaredDpi.x > 1) list.push(`${Math.round(F.declaredDpi.x)} ppi written in the file`);
      const t = F.transparency || {};
      if (t.alphaPercent >= 1) {
        const txt = `${t.alphaPercent}% of the picture is transparent`;
        if (dieCut) list.push(`${txt} (the cut-out shape)`);
        else note(PRINT, `${t.alphaPercent}% transparent`, `${txt} — transparent areas print as nothing: the material shows through (white on most). Check that is meant, or fill the background.`);
      }
      fact(COLOUR, list);
      if (F.isAnimated) note(PRINT, 'animated PNG', 'Animated PNG — only its first frame prints.');
      if (flag('PNG_CRC_ERROR').length || flag('PNG_TRUNCATED').length) note(['goodForPrint', 'sizeTransform'], 'damaged PNG',
        'The PNG is damaged (checksum error or cut short) — parts of the picture can be missing or wrong. Ask the customer to send the file again.', true);
    }
    return { notes, facts };
  },

  /**
   * Put the findings into the report's cards (PrecheckEngine.tally calls this every time it re-scores, so a card
   * another check rebuilds or rewrites gets them back). A card is changed only where its own text does not carry
   * the finding yet: a Passed card becomes a look by eye, Critical only for a damaged file.
   * @param {Function} [settle] PrecheckEngine.settle — the status of a changed card
   */
  applyTo(report, settle) {
    const r = report && Array.isArray(report.checks) && this.findings(report.analysis, { spec: report.spec });
    if (!r) return;
    const card = to => to.map(id => report.checks.find(c => c.id === id && !c.duplicateOf)).find(Boolean);
    const has = (s, t) => String(s || '').includes(t);
    r.facts.forEach(x => {
      const c = card(x.to);
      if (c && !has(c.detail, x.text)) c.detail = `${c.detail ? c.detail + ' ' : ''}${x.text}`;
    });
    r.notes.forEach(n => {
      const c = card(n.to);
      if (!c) return;
      const passed = c.status === 'PASS';
      if (!has(c.found, n.short)) c.found = `${c.found ? c.found + ' · ' : ''}${n.short}`;
      if (passed) c.action = n.long;                       // a Passed card's action is only a remark
      else if (!has(c.action, n.long)) c.action = `${c.action ? c.action + ' ' : ''}${n.long}`;
      if (n.critical) {
        if (c.error && !has(c.error, n.short)) c.error = `${c.error} · ${n.short}`;
        if (c.status !== 'FAIL') { c.status = 'FAIL'; c.manual = false; }
      } else if (passed) { c.status = 'WARNING'; c.manual = true; }
      if (settle) settle(c);
    });
  },

  /** The reading of the current file is in (after the report was built): re-score and redraw — tally() adds it */
  syncReport() {
    if (typeof appState === 'undefined' || !appState.report || !appState.analysis) return;
    const report = appState.report;
    if (report.analysis !== appState.analysis) return;              // the report of an earlier file
    if (typeof refreshPrecheckView === 'function') refreshPrecheckView(report);
    else if (typeof PrecheckEngine !== 'undefined' && PrecheckEngine.tally) PrecheckEngine.tally(report);
  },

  _unescapePdfName(name) {
    if (!name) return '';
    return name.replace(/#([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  },

  // ── Byte & String Helpers ────────────────────────────────────────────────
  _latin1(buf) {
    return new TextDecoder('latin1').decode(buf);
  },

  _ascii(u8) {
    // long segments (XMP, Photoshop resources) decoded in one go — a string built char by char blocks the page
    if (u8.length > 256) return new TextDecoder('latin1').decode(u8);
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return s;
  },

  _crc32(bytes) {
    if (!this._crcTable) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[i] = c;
      }
      this._crcTable = table;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ this._crcTable[(crc ^ bytes[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  },

  async _inflate(bytes) {
    if (typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks = [];
        let total = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          total += value.length;
        }
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) { out.set(c, off); off += c.length; }
        return out;
      } catch (e) {
        try {
          const dsRaw = new DecompressionStream('deflate-raw');
          const writer = dsRaw.writable.getWriter();
          writer.write(bytes);
          writer.close();
          const reader = dsRaw.readable.getReader();
          const chunks = [];
          let total = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            total += value.length;
          }
          const out = new Uint8Array(total);
          let off = 0;
          for (const c of chunks) { out.set(c, off); off += c.length; }
          return out;
        } catch (e2) {}
      }
    }
    return null;
  }
};

if (typeof window !== 'undefined') {
  window.FileForensics = FileForensics;
}
