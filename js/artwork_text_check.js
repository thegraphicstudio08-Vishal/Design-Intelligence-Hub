/**
 * Design Intelligence Hub - Artwork Text Check (spelling + content orientation)
 *
 * Reads the words that are really printed on the artwork and checks them:
 *  1. OCR (Tesseract.js, runs in the browser) on the artwork pixels — JPG/PNG and rendered PDF/AI pages.
 *     Signage mixes small print with huge display lettering over coloured shapes, which no single OCR
 *     setting reads well, so three readings are combined: sparse-text at full detail, normal page layout,
 *     and a black-and-white reading that removes coloured tiles / panels behind letters.
 *     Every word keeps its real position, so findings are marked on the word itself.
 *  2. Direction of the text: if the upright reading finds few real words, the artwork is also read
 *     turned 90°, 180° and 270°. When one of those reads clearly better, the content is sideways /
 *     upside down (e.g. a portrait roll-up supplied rotated on a landscape page).
 *  3. Spelling against US + UK English dictionaries (Hunspell via Typo.js), the brand whitelist and
 *     the words of the order file name; brand names are matched fuzzily (EzLicnse → EzLicence);
 *     web / e-mail endings are checked (.com.auu → .com.au).
 *
 * Only words read with high OCR confidence are judged, so an unclear reading never becomes a "typo".
 * Capitalised / ALL-CAPS words that look like names are listed for the designer to verify instead.
 * Libraries load from the approved CDNs the first time the check runs (~7 MB, then cached).
 */
const ArtworkTextCheck = {
  LIBS: {
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
    typo: 'https://cdn.jsdelivr.net/npm/typo-js@1.2.4/typo.js',
    dicts: [
      { lang: 'en_US', aff: 'https://cdn.jsdelivr.net/npm/typo-js@1.2.4/dictionaries/en_US/en_US.aff', dic: 'https://cdn.jsdelivr.net/npm/typo-js@1.2.4/dictionaries/en_US/en_US.dic' },
      { lang: 'en_GB', aff: 'https://cdn.jsdelivr.net/npm/dictionary-en-gb@2.4.0/index.aff', dic: 'https://cdn.jsdelivr.net/npm/dictionary-en-gb@2.4.0/index.dic' }
    ]
  },
  // Combined readings (page-segmentation mode, long side in px, black & white)
  READINGS: [
    { psm: '11', side: 2000, bw: false, pad: 0.06 },   // sparse text, full detail (small print, scattered words)
    { psm: '3', side: 1200, bw: false, pad: 0.06 },    // normal page layout (paragraphs, lines)
    { psm: '3', side: 2000, bw: false, pad: 0.12 },    // wide margin: very large display lettering
    { psm: '11', side: 1000, bw: true, pad: 0.06 }     // black & white: letters on coloured tiles / panels
  ],
  ORIENT_READINGS: [
    { psm: '3', side: 1200, bw: false, pad: 0.06 },
    { psm: '11', side: 1400, bw: false, pad: 0.06 }
  ],
  MIN_CONF: 80,            // OCR confidence needed before a word is judged
  // Distinctive brand names matched fuzzily (a near miss is a brand misspelling)
  BRANDS: ['EzLicence', 'BannerBuzz', 'BestOfSigns', 'Caterpillar', 'Syntopic', 'Qpex'],
  // Words accepted although not in the dictionaries (print / signage / web vocabulary)
  EXTRA_WORDS: ['coroplast', 'corflute', 'grommet', 'grommets', 'hemmed', 'diecut', 'signage', 'lamination', 'laminated',
    'retractable', 'backdrop', 'teardrop', 'pvc', 'cmyk', 'rgb', 'pantone', 'qr', 'llc', 'ltd', 'inc', 'pty', 'usa', 'aus',
    'facebook', 'instagram', 'tiktok', 'youtube', 'linkedin', 'whatsapp', 'gmail', 'hotmail', 'outlook', 'yahoo', 'www', 'http', 'https',
    'online', 'ok', 'wifi', 'covid', 'cafe', 'barbecue', 'bbq', 'diy', 'ezlicence', 'bannerbuzz', 'email', 'website', 'ebay', 'paypal'],
  TLDS: ['com', 'net', 'org', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'io', 'co', 'us', 'ca', 'au', 'uk', 'nz', 'in', 'ie', 'de',
    'fr', 'es', 'it', 'nl', 'be', 'ch', 'at', 'se', 'no', 'dk', 'fi', 'pl', 'pt', 'sg', 'hk', 'my', 'ph', 'za', 'ae', 'mx', 'br', 'jp',
    'cn', 'kr', 'store', 'shop', 'online', 'site', 'app', 'dev', 'me', 'tv', 'ai', 'xyz', 'club', 'pro', 'agency', 'design', 'studio',
    'events', 'church', 'school', 'academy', 'health', 'law', 'realty', 'homes', 'build', 'auto', 'cafe', 'bar', 'pizza', 'travel',
    'golf', 'fitness', 'art', 'media', 'news', 'blog', 'tech'],
  // Characters OCR mixes up; treated as equal when matching brand names
  LOOKALIKE: { '0': 'o', '1': 'l', '2': 'z', '5': 's', '8': 'b', '6': 'g', '|': 'l', '!': 'l' },

  _loading: null,
  _worker: null,
  _psm: null,
  _dicts: [],
  status: 'idle',          // idle | loading | reading | done | unavailable
  statusText: '',

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true; s.dataset.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  },

  /** Load OCR engine + dictionaries once */
  ensureReady() {
    if (this._loading) return this._loading;
    this._loading = (async () => {
      await Promise.all([this._loadScript(this.LIBS.tesseract), this._loadScript(this.LIBS.typo)]);
      const dictJobs = this.LIBS.dicts.map(async d => {
        const [aff, dic] = await Promise.all([fetch(d.aff).then(r => r.text()), fetch(d.dic).then(r => r.text())]);
        return new Typo(d.lang, aff, dic);
      });
      const workerJob = Tesseract.createWorker('eng', 1, {
        workerPath: this.LIBS.workerPath,
        corePath: this.LIBS.corePath,
        langPath: this.LIBS.langPath
      });
      const [dicts, worker] = await Promise.all([Promise.all(dictJobs), workerJob]);
      this._dicts = dicts;
      this._worker = worker;
      this._extra = new Set(this.EXTRA_WORDS);
    })();
    this._loading.catch(() => { this._loading = null; });
    return this._loading;
  },

  // ── image preparation ─────────────────────────────────────────────────
  _canvasFrom(source, cfg, angle) {
    const w0 = source.naturalWidth || source.width, h0 = source.naturalHeight || source.height;
    const k = Math.min(3, cfg.side / Math.max(w0, h0));     // small artwork is enlarged (up to 3×)
    const w = Math.round(w0 * k), h = Math.round(h0 * k);
    const rot = ((angle % 360) + 360) % 360;
    // A white margin around the artwork helps the reader find large lettering near the edges
    const pad = Math.round(Math.max(w, h) * (cfg.pad != null ? cfg.pad : 0.06));
    const cv = document.createElement('canvas');
    cv.width = (rot % 180 ? h : w) + 2 * pad; cv.height = (rot % 180 ? w : h) + 2 * pad;
    const ctx = cv.getContext('2d', { willReadFrequently: !!cfg.bw });
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);   // transparent PNGs read on white
    ctx.save();
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(source, -w / 2, -h / 2, w, h);
    ctx.restore();
    if (cfg.bw) this._binarize(ctx, cv.width, cv.height);
    return { canvas: cv, w, h, pad, angle: rot };
  },

  /** Otsu black & white: dark letters stay, coloured tiles / light panels drop out */
  _binarize(ctx, W, H) {
    const img = ctx.getImageData(0, 0, W, H), a = img.data;
    const L = new Uint8Array(W * H), hist = new Array(256).fill(0);
    for (let i = 0, j = 0; i < a.length; i += 4, j++) { L[j] = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) | 0; hist[L[j]]++; }
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = L.length - wB; if (!wF) break;
      sB += t * hist[t];
      const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
      if (v > best) { best = v; th = t; }
    }
    for (let i = 0, j = 0; i < a.length; i += 4, j++) { const v = L[j] > th ? 255 : 0; a[i] = a[i + 1] = a[i + 2] = v; }
    ctx.putImageData(img, 0, 0);
  },

  /** Map a box from a (rotated, padded) reading back to fractions of the upright artwork */
  _boxToArtwork(b, view) {
    const W = view.canvas.width - 2 * view.pad, H = view.canvas.height - 2 * view.pad;   // rotated artwork size
    const pts = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]].map(([px, py]) => {
      const x = px - view.pad, y = py - view.pad;
      // undo the clockwise rotation: rotated artwork (W × H) → upright artwork (view.w × view.h)
      switch (view.angle) {
        case 90: return [y, W - x];
        case 180: return [W - x, H - y];
        case 270: return [H - y, x];
        default: return [x, y];
      }
    });
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const cl = v => Math.max(0, Math.min(1, v));
    const x0 = cl(Math.min(...xs) / view.w), y0 = cl(Math.min(...ys) / view.h);
    return { x: x0, y: y0, w: cl(Math.max(...xs) / view.w) - x0, h: cl(Math.max(...ys) / view.h) - y0 };
  },

  // ── words & dictionaries ──────────────────────────────────────────────
  /** Edit distance with adjacent transpositions (Damerau / OSA) */
  _lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase();
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev2 = null, prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] || b[j - 1] === '\u0000' ? 0 : 1));
        if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      }
      prev2 = prev; prev = cur;
    }
    return prev[n];
  },

  _lookalike(t) {
    return t.toLowerCase().replace(/[0125861|!]/g, c => this.LOOKALIKE[c] || c);
  },

  _known(word, extraWords) {
    const w = word.replace(/[’']s$/i, '').replace(/[’']/g, "'");
    const lw = w.toLowerCase();
    if (this._extra.has(lw) || (extraWords && extraWords.has(lw))) return true;
    return this._dicts.some(d => d.check(w) || d.check(lw) || d.check(lw.charAt(0).toUpperCase() + lw.slice(1)));
  },

  /**
   * Corrections one letter away (missing, extra, swapped or wrong letter), ranked by how people
   * actually mistype: doubled letter, swapped pair, missing letter, sound-alike letter.
   * Returns [{ word, proper }] — proper = only exists as a name (e.g. "Cher"), not an ordinary word.
   * Much faster than Typo.js suggest(), which tries every two-letter change.
   */
  _suggest(word) {
    this._sugCache = this._sugCache || new Map();
    if (this._sugCache.has(word)) return this._sugCache.get(word);
    const lw = word.toLowerCase();
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const SIMILAR = { s: 'cz', c: 'sk', k: 'c', z: 's', a: 'eiou', e: 'aiou', i: 'aeoy', o: 'aeiu', u: 'aeio', y: 'i', m: 'n', n: 'm', v: 'w', w: 'v', f: 'v', g: 'j', j: 'g' };
    const cands = new Map();   // candidate -> rank (lower = more likely)
    const add = (c, rank) => { if (c && c !== lw && (!cands.has(c) || cands.get(c) > rank)) cands.set(c, rank); };
    for (let i = 0; i <= lw.length; i++) {
      const a = lw.slice(0, i), b = lw.slice(i);
      if (b) add(a + b.slice(1), b[0] === a.slice(-1) || b[0] === b[1] ? 0 : 5);          // extra letter (doubled = most likely)
      if (b.length > 1) add(a + b[1] + b[0] + b.slice(2), 1);                             // two letters swapped
      for (const ch of letters) {
        add(a + ch + b, i === 0 ? 4 : 2);                                                 // missing letter
        if (b) add(a + ch + b.slice(1), (SIMILAR[b[0]] || '').includes(ch) ? 3 : 4);      // wrong letter
      }
    }
    const style = t => (word === word.toUpperCase() ? t.toUpperCase() : /^[A-Z]/.test(word) ? t[0].toUpperCase() + t.slice(1) : t);
    const out = [];
    cands.forEach((rank, c) => {
      if (c.length < 2) return;
      const common = this._dicts.some(d => d.check(c)) || this._extra.has(c);
      const proper = !common && this._dicts.some(d => d.check(c[0].toUpperCase() + c.slice(1)));
      if (common || proper) out.push({ word: proper ? c[0].toUpperCase() + c.slice(1) : style(c), proper, rank: rank + (proper ? 10 : 0) });
    });
    if (!out.length && lw.length >= 7 && /^[a-z]+$/.test(lw)) {
      // Two changes of the kinds people really make (sound-alike letter, swapped pair, doubled /
      // single letter, missing vowel): LISENCED → LICENSED, tommorow → tomorrow
      const likely = (t, emit) => {
        for (let i = 0; i <= t.length; i++) {
          const a = t.slice(0, i), b = t.slice(i);
          if (b) emit(a + b.slice(1), b[0] === a.slice(-1) || b[0] === b[1] ? 0 : 5);
          if (b.length > 1 && b[0] !== b[1]) emit(a + b[1] + b[0] + b.slice(2), 1);
          if (b && i > 0) emit(a + b[0] + b, 0);
          if (i > 0) for (const v of 'aeiou') emit(a + v + b, 2);
          if (b) for (const ch of (SIMILAR[b[0]] || '')) emit(a + ch + b.slice(1), 3);
        }
      };
      const first = new Map();
      likely(lw, (c, r) => { if (c !== lw && (!first.has(c) || first.get(c) > r)) first.set(c, r); });
      const seen = new Set(), found = new Map();
      first.forEach((r1, c1) => likely(c1, (c2, r2) => {
        if (c2 === lw || c2.length < 5 || first.has(c2)) return;
        const r = 20 + r1 + r2;
        if (found.has(c2)) { if (found.get(c2).rank > r) found.get(c2).rank = r; return; }
        if (seen.has(c2)) return;
        seen.add(c2);
        if (this._dicts.some(d => d.check(c2)) || this._extra.has(c2)) {
          found.set(c2, { word: style(c2), proper: false, rank: r, sound: r1 !== 2 && r1 !== 5 && r2 !== 2 && r2 !== 5 });
        }
      }));
      found.forEach(v => out.push(v));
    }
    out.sort((p, q) => p.rank - q.rank || Math.abs(p.word.length - word.length) - Math.abs(q.word.length - word.length));
    this._sugCache.set(word, out);
    return out;
  },

  _isGood(w) {
    const t = w.text.replace(/[.,:;!?]+$/, '');
    return w.conf >= this.MIN_CONF && /^[A-Za-z][A-Za-z'’-]{2,}$/.test(t) && this._known(t);
  },

  // ── reading ───────────────────────────────────────────────────────────
  async _readOnce(source, cfg, angle) {
    if (this._psm !== cfg.psm) { await this._worker.setParameters({ tessedit_pageseg_mode: cfg.psm }); this._psm = cfg.psm; }
    const view = this._canvasFrom(source, cfg, angle);
    const { data } = await this._worker.recognize(view.canvas);
    let words = data.words;
    if (!words && data.blocks) {
      words = [];
      data.blocks.forEach(b => (b.paragraphs || []).forEach(p => (p.lines || []).forEach(l => (l.words || []).forEach(w => words.push(w)))));
    }
    return (words || []).map(w => ({ text: (w.text || '').trim(), conf: w.confidence, box: this._boxToArtwork(w.bbox, view) }))
      .filter(w => w.text && w.box.w > 0 && w.box.h > 0);
  },

  /** Combine several readings; where they overlap keep the better word (a real word beats a misread) */
  async _read(source, angle, cfgs) {
    const iou = (p, q) => {
      const ix = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
      const iy = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
      const inter = ix * iy;
      return inter / Math.max(1e-9, p.w * p.h + q.w * q.h - inter);
    };
    const list = [];
    const all = [];
    for (const cfg of cfgs) {
      const words = await this._readOnce(source, cfg, angle);
      all.push(words);
      this._mergeInto(list, words);
    }
    const W0 = source.naturalWidth || source.width, H0 = source.naturalHeight || source.height, M = Math.max(W0, H0) || 1;
    const rot = ((angle % 360) + 360) % 360;
    const across = w => { const f = this._frameBox(w.box, rot, W0 / M, H0 / M); return f.w >= f.h * 0.9; };
    return { angle: rot, words: list, all, good: list.filter(w => this._isGood(w) && across(w)).length };
  },

  _iou(p, q) {
    const ix = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
    const iy = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
    const inter = ix * iy;
    return inter / Math.max(1e-9, p.w * p.h + q.w * q.h - inter);
  },

  /** Add words to a combined list; where two readings overlap keep the better word (a real word beats a misread) */
  _mergeInto(list, words) {
    const score = w => w.conf + (this._isGood(w) ? 25 : 0);
    const inside = (p, q) => {   // share of p that lies inside q
      const ix = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
      const iy = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
      return (ix * iy) / Math.max(1e-12, p.w * p.h);
    };
    const letters = t => t.replace(/[^A-Za-z0-9]/g, '').length;
    words.forEach(w => {
      const k = list.findIndex(o => this._iou(o.box, w.box) > 0.3);
      if (k < 0 && list.some(o => o.conf >= 60 && letters(o.text) > letters(w.text) && inside(w.box, o.box) > 0.7)) return;
      if (k < 0) list.push(w);
      else if (score(w) > score(list[k])) list[k] = w;
    });
  },

  /**
   * Find text lines: rows of letter-sized shapes (dark-on-light and light-on-dark), so that each line
   * can be read on its own at the size the reader handles best. Large display lettering next to
   * logos and shapes is often skipped when the whole artwork is read at once.
   */
  _findTextLines(canvas) {
    const W0 = canvas.width, H0 = canvas.height;
    const k = Math.min(1, 1000 / Math.max(W0, H0));
    const W = Math.max(1, Math.round(W0 * k)), H = Math.max(1, Math.round(H0 * k));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, W, H);
    const a = ctx.getImageData(0, 0, W, H).data;
    const L = new Uint8Array(W * H), hist = new Array(256).fill(0);
    for (let i = 0, j = 0; i < a.length; i += 4, j++) { L[j] = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) | 0; hist[L[j]]++; }
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = L.length - wB; if (!wF) break;
      sB += t * hist[t];
      const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
      if (v > best) { best = v; th = t; }
    }
    const lines = [];
    const minH = Math.max(6, H * 0.012), maxH = H * 0.5;
    for (const dark of [true, false]) {
      const ink = new Uint8Array(W * H);
      for (let j = 0; j < L.length; j++) ink[j] = dark ? (L[j] < th ? 1 : 0) : (L[j] > th ? 1 : 0);
      const lab = new Int32Array(W * H);
      const glyphs = [];
      const stack = [];
      let id = 0;
      for (let i = 0; i < ink.length; i++) {
        if (!ink[i] || lab[i]) continue;
        id++;
        let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0;
        lab[i] = id; stack.push(i);
        while (stack.length) {
          const q = stack.pop(), x = q % W, y = (q / W) | 0;
          n++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = y + dy; if (yy < 0 || yy >= H) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = x + dx; if (xx < 0 || xx >= W) continue;
              const r = yy * W + xx;
              if (ink[r] && !lab[r]) { lab[r] = id; stack.push(r); }
            }
          }
        }
        const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
        if (gh >= minH && gh <= maxH && gw <= gh * 2.5 && x0 > 0 && y0 > 0 && x1 < W - 1 && y1 < H - 1 && n / (gw * gh) >= 0.08) {
          glyphs.push({ x0, y0, x1, y1, h: gh });
        }
      }
      if (glyphs.length < 2 || glyphs.length > 4000) continue;   // nothing letter-like, or a texture
      glyphs.sort((p, q) => p.x0 - q.x0);
      const parent = glyphs.map((_, i) => i);
      const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
      for (let i = 0; i < glyphs.length; i++) {
        const p = glyphs[i];
        for (let j = i + 1; j < glyphs.length; j++) {
          const q = glyphs[j];
          if (q.x0 > p.x1 + 1.5 * Math.max(p.h, q.h)) { if (q.x0 > p.x1 + 1.5 * maxH) break; continue; }
          if (Math.max(p.h, q.h) / Math.min(p.h, q.h) > 2.2) continue;
          if (Math.min(p.y1, q.y1) - Math.max(p.y0, q.y0) < 0.5 * Math.min(p.h, q.h)) continue;
          parent[find(j)] = find(i);
        }
      }
      const groups = new Map();
      glyphs.forEach((g, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(g); });
      groups.forEach(gs => {
        if (gs.length < 2) return;
        lines.push({
          x0: Math.min(...gs.map(g => g.x0)) / k, y0: Math.min(...gs.map(g => g.y0)) / k,
          x1: (Math.max(...gs.map(g => g.x1)) + 1) / k, y1: (Math.max(...gs.map(g => g.y1)) + 1) / k,
          n: gs.length, dark
        });
      });
    }
    // drop duplicates, keep the 40 biggest lines
    const box = l => ({ x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 });
    lines.sort((p, q) => (q.x1 - q.x0) * (q.y1 - q.y0) - (p.x1 - p.x0) * (p.y1 - p.y0));
    const kept = [];
    lines.forEach(l => { if (!kept.some(o => this._iou(box(o), box(l)) > 0.5)) kept.push(l); });
    return kept.slice(0, 40);
  },

  /** Read each text line on its own: crop, scale to ~64 px tall, black & white, single-line reading */
  async _readLines(source, angle, lineH = 64) {
    const view = this._canvasFrom(source, { side: 2000, pad: 0 }, angle);
    const lines = this._findTextLines(view.canvas);
    const out = [];
    if (!lines.length) return out;
    if (this._psm !== '7') { await this._worker.setParameters({ tessedit_pageseg_mode: '7' }); this._psm = '7'; }
    for (const ln of lines) {
      const h = ln.y1 - ln.y0, pad = Math.round(h * 0.35);
      const sx = Math.max(0, Math.round(ln.x0 - pad)), sy = Math.max(0, Math.round(ln.y0 - pad));
      const sw = Math.min(view.canvas.width, Math.round(ln.x1 + pad)) - sx, sh = Math.min(view.canvas.height, Math.round(ln.y1 + pad)) - sy;
      const k = Math.max(0.2, Math.min(4, lineH / h));
      const cw = Math.round(sw * k), ch = Math.round(sh * k);
      if (cw < 8 || ch < 8 || cw > 6000) continue;
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(view.canvas, sx, sy, sw, sh, 0, 0, cw, ch);
      this._binarize(c, cw, ch);
      if (!ln.dark) {   // light lettering on a dark background → black on white for the reader
        const im = c.getImageData(0, 0, cw, ch), d = im.data;
        for (let i = 0; i < d.length; i += 4) { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
        c.putImageData(im, 0, 0);
      }
      const { data } = await this._worker.recognize(cv);
      (data.words || []).forEach(w => {
        const t = (w.text || '').trim(); if (!t) return;
        const b = { x0: sx + w.bbox.x0 / k, y0: sy + w.bbox.y0 / k, x1: sx + w.bbox.x1 / k, y1: sy + w.bbox.y1 / k };
        const box = this._boxToArtwork(b, view);
        if (box.w > 0 && box.h > 0) out.push({ text: t, conf: w.confidence, box });
      });
    }
    return out;
  },

  /**
   * Read the artwork and check its text.
   * @param {HTMLImageElement|HTMLCanvasElement} source loaded artwork image
   * @param {{fileWords: string[], onStatus?: Function}} ctx
   */
  async run(source, ctx = {}) {
    const say = (s, t) => { this.status = s; this.statusText = t; if (ctx.onStatus) ctx.onStatus(s, t); };
    try {
      say('loading', 'Loading the text reader (first time ≈ 7 MB, then cached)…');
      await this.ensureReady();
    } catch (e) {
      say('unavailable', 'The text reader could not be loaded (no internet access to the CDN?). Proofread the text manually.');
      return { available: false };
    }

    say('reading', 'Reading the text on the artwork…');
    const upright = await this._read(source, 0, this.READINGS);
    let reading = upright;
    const tried = { 0: upright.good };
    let angle = 0;
    // Few real words upright → read the artwork turned (sideways / upside-down content)
    if (upright.good < 4) {
      say('reading', 'Checking which way the text runs…');
      let best = { angle: 0, good: (await this._read(source, 0, this.ORIENT_READINGS)).good };
      tried[0] = best.good;
      for (const a of [90, 270, 180]) {
        const r = await this._read(source, a, this.ORIENT_READINGS);
        tried[a] = r.good;
        if (r.good > best.good) best = r;
      }
      const runnerUp = Math.max(...Object.entries(tried).filter(([k]) => +k !== best.angle).map(([, v]) => v));
      if (best.angle !== 0 && best.good >= 4 && best.good >= 2 * (Math.max(upright.good, tried[0]) + 1) && best.good >= runnerUp + 2) {
        angle = best.angle;
        reading = await this._read(source, angle, this.READINGS);   // full reading in the right direction
      }
    }
    say('reading', 'Reading each line of text…');
    const lineSmall = await this._readLines(source, angle, 56);
    const lineLarge = await this._readLines(source, angle, 100);
    this._mergeInto(reading.words, lineSmall);
    this._mergeInto(reading.words, lineLarge);
    const allReadings = (reading.all || []).concat([lineSmall, lineLarge]);
    reading.good = reading.words.filter(w => this._isGood(w)).length;
    const orientation = { angle, readable: reading.good >= 2, goodWords: reading.good, tried };
    const W0 = source.naturalWidth || source.width, H0 = source.naturalHeight || source.height, M = Math.max(W0, H0) || 1;
    const frame = b => this._frameBox(b, angle, W0 / M, H0 / M);
    let issues = this._checkWords(reading.words, ctx.fileWords || [], allReadings, ctx.brands || [], frame);
    if (issues.some(it => it.kind === 'word' || it.kind === 'verify')) {
      const view = this._canvasFrom(source, { side: 2000, pad: 0 }, angle);
      issues = issues.filter(it => !((it.kind === 'word' || it.kind === 'verify') && this._isCutOff(view, this._frameBox(it.box, angle, 1, 1))));
    }
    say('done', '');
    return { available: true, orientation, words: reading.words, issues };
  },

  // ── checks ────────────────────────────────────────────────────────────
  /**
   * A word box (fractions of the upright artwork) seen the way the text runs: for sideways or
   * upside-down text, "left → right" and "same line" must follow the reading direction.
   * Units are the same on both axes (fractions of the longer artwork side).
   */
  _frameBox(b, angle, ax, ay) {
    let x = b.x, y = b.y, w = b.w, h = b.h, sx = ax, sy = ay;
    if (angle === 90) { x = 1 - b.y - b.h; y = b.x; w = b.h; h = b.w; sx = ay; sy = ax; }
    else if (angle === 180) { x = 1 - b.x - b.w; y = 1 - b.y - b.h; }
    else if (angle === 270) { x = b.y; y = 1 - b.x - b.w; w = b.h; h = b.w; sx = ay; sy = ax; }
    return { x: x * sx, y: y * sy, w: w * sx, h: h * sy };
  },

  /** Group words into text lines by position (left → right in the reading direction) */
  _lines(words, frame = b => b) {
    const B = words.map(w => frame(w.box));
    const order = words.map((w, i) => i).sort((a, b) => (B[a].y + B[a].h / 2) - (B[b].y + B[b].h / 2));
    const lines = [];
    order.forEach(i => {
      const cy = B[i].y + B[i].h / 2;
      const y0 = B[i].y, y1 = B[i].y + B[i].h;
      const line = lines.find(l => (Math.min(l.y1, y1) - Math.max(l.y0, y0)) >= 0.4 * Math.min(l.y1 - l.y0, y1 - y0));
      if (line) { line.idx.push(i); line.y0 = Math.min(line.y0, y0); line.y1 = Math.max(line.y1, y1); }
      else lines.push({ cy, y0, y1, idx: [i] });
    });
    lines.forEach(l => l.idx.sort((a, b) => B[a].x - B[b].x));
    return lines.map(l => l.idx);
  },

  /**
   * Is this word only a piece of a longer word? Stylised lettering is often read in pieces
   * ("Toge" + "ther,", "Athl" + "etes.") or the piece is read in full elsewhere ("tal" in
   * "Hospital"). Every reading of that spot is checked; a piece is not a spelling mistake.
   */
  _isFragment(w, word, words, allReadings, extra, frame) {
    const lw = word.toLowerCase();
    const letters = t => t.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
    const area = b => Math.max(1e-12, b.w * b.h);
    const inter = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x))
      * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
    const lists = [words].concat(allReadings || []);
    for (const list of lists) {
      // the same spot read as a longer real word that contains this one
      for (const t of list) {
        if (t === w || t.conf < 15) continue;
        const ct = letters(t.text).toLowerCase();
        if (ct.length > lw.length && ct.includes(lw) && inter(t.box, w.box) >= 0.5 * area(w.box)
            && (this._known(ct, extra) || (t.conf >= 60 && ct.length >= lw.length + 2))) return true;
      }
      // neighbours on the same line with (almost) no gap: joined they make a real word
      const me = list.find(t => letters(t.text).toLowerCase() === lw && inter(t.box, w.box) >= 0.5 * Math.min(area(t.box), area(w.box)));
      if (!me) continue;
      const fm = frame(me.box);
      const side = list.filter(t => t !== me && t.conf >= 30 && /[A-Za-z]/.test(t.text)).map(t => ({ t, f: frame(t.box) }))
        .filter(o => (Math.min(o.f.y + o.f.h, fm.y + fm.h) - Math.max(o.f.y, fm.y)) >= 0.5 * Math.min(o.f.h, fm.h));
      const tight = Math.max(fm.h, 1e-9) * 0.3;
      const left = side.filter(o => Math.abs(fm.x - (o.f.x + o.f.w)) <= tight).map(o => letters(o.t.text));
      const right = side.filter(o => Math.abs(o.f.x - (fm.x + fm.w)) <= tight).map(o => letters(o.t.text));
      const joins = [];
      left.forEach(a => { joins.push(a + lw); right.forEach(b => joins.push(a + lw + b)); });
      right.forEach(b => joins.push(lw + b));
      if (joins.some(j => j.length >= 5 && /^[A-Za-z]+$/.test(j) && this._known(j, extra))) return true;
    }
    return false;
  },

  /** Spelling, brand-name and web-address checks on the words that were read */
  /** Distance to a brand name, allowing one letter that the reader could not read (missing or misread) */
  _brandDist(joined, brand) {
    const b = brand.toLowerCase();
    let d = this._lev(joined, b);
    for (let k = 0; k < b.length && d > 0; k++) {
      d = Math.min(d, this._lev(joined, b.slice(0, k) + b.slice(k + 1)), this._lev(joined, b.slice(0, k) + '\u0000' + b.slice(k + 1)));
    }
    return d;
  },

  /** Spelling, brand-name and web-address checks on the words that were read */
  _checkWords(words, fileWords, allReadings, extraBrands, frame = b => b) {
    const extra = new Set(fileWords.map(w => w.toLowerCase()));
    const issues = [];
    const used = new Set();
    const clean = t => t.replace(/^[^A-Za-z0-9@]+|[^A-Za-z0-9]+$/g, '');
    const lines = this._lines(words, frame);

    // 1. Brand names. Every reading is compared, because a stylised logo word reads differently each
    //    time ("Ez\.icence", "E2 icence", "EzVicence"). A brand is wrong only when NO reading of that
    //    spot matches it and at least one comes within 1–2 letters (one unreadable letter is allowed).
    // The customer name from the order is compared too (not an e-mail / account number)
    const brands = this.BRANDS.concat((extraBrands || []).filter(b => /[A-Za-z]{5,}/.test(b) && !/[@\d]/.test(b)));
    const cands = [];
    (allReadings && allReadings.length ? allReadings : [words]).forEach(list => {
      this._lines(list, frame).forEach(idx => {
        for (let s0 = 0; s0 < idx.length; s0++) {
          for (let len = 1; len <= 3 && s0 + len <= idx.length; len++) {
            const part = idx.slice(s0, s0 + len).map(i => list[i]);
            const conf = Math.min(...part.map(w => w.conf));
            if (conf < 25) continue;
            const joined = this._lookalike(part.map(w => w.text).join('')).replace(/[^a-z0-9]/g, '');
            if (joined.length < 5) continue;
            brands.forEach(brand => {
              const bl = brand.replace(/[^A-Za-z0-9]/g, '');
              const d = this._brandDist(joined, bl);
              if (d <= (bl.length >= 8 ? 2 : 1) && Math.abs(joined.length - bl.length) <= 2) {
                cands.push({ brand, d, conf, text: part.map(w => w.text).join(' '), box: this._union(part.map(w => w.box)) });
              }
            });
          }
        }
      });
    });
    const near = (p, q) => this._iou(p, q) > 0.2
      || (q.x + q.w / 2 > p.x && q.x + q.w / 2 < p.x + p.w && q.y + q.h / 2 > p.y && q.y + q.h / 2 < p.y + p.h);
    const groups = [];
    cands.forEach(c => {
      const g = groups.find(gr => gr.brand === c.brand && gr.items.some(o => near(o.box, c.box) || near(c.box, o.box)));
      if (g) g.items.push(c); else groups.push({ brand: c.brand, items: [c] });
    });
    groups.forEach(g => {
      const area = this._union(g.items.map(c => c.box));
      words.forEach((w, i) => { if (near(area, w.box)) used.add(i); });     // brand words are not spell-checked as words
      if (g.items.some(c => c.d === 0)) return;                            // read correctly at least once
      const bestC = g.items.slice().sort((p, q) => p.d - q.d || q.conf - p.conf)[0];
      if (bestC.conf < 30) return;
      // A known brand spelt wrong is a mistake; a near-miss of the customer name is listed to verify
      // (the order name may differ slightly from the name printed on the artwork)
      issues.push({ kind: this.BRANDS.includes(g.brand) ? 'brand' : 'verify', text: bestC.text, suggestion: g.brand, box: area, conf: bestC.conf });
    });

    // A stylised first letter is often read on its own ("H" + "earts", "L" + "ittle"): join it back
    const joinedWith = new Map(), joinedBox = new Map();
    lines.forEach(idx => {
      for (let k = 0; k + 1 < idx.length; k++) {
        const a = words[idx[k]], b = words[idx[k + 1]];
        const fa = frame(a.box), fb = frame(b.box);
        const gap = fb.x - (fa.x + fa.w);
        if (/^[A-Z]$/.test(clean(a.text)) && /^[a-z]/.test(clean(b.text)) && gap < Math.max(fa.h, fb.h) * 0.6) {
          joinedWith.set(idx[k + 1], clean(a.text) + clean(b.text));
          joinedBox.set(idx[k + 1], this._union([a.box, b.box]));
          used.add(idx[k]);
        }
      }
    });

    words.forEach((w, i) => {
      if (used.has(i)) return;
      const raw = w.text;
      // Web addresses read with lower confidence (dots, small letters); words need a clear reading
      const looksWeb = raw.includes('@') || /^(www\.|https?:|\.)/i.test(raw) || /[a-z0-9]\.[a-z]{2,}/i.test(raw);
      if (w.conf < (looksWeb ? 45 : this.MIN_CONF)) return;

      // 2. Web / e-mail addresses: the ending must be a real domain ending (.com.auu, .con → wrong)
      const trimmed = raw.replace(/[,;:!?)]+$/, '').replace(/\.$/, '');
      if (looksWeb) {
        const host = trimmed.toLowerCase().replace(/^.*@/, '').replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
        const labels = host.split('.').filter(Boolean);
        const last = labels[labels.length - 1] || '';
        if (labels.length && /^[a-z]+$/.test(last) && !this.TLDS.includes(last) && (labels.length > 1 || trimmed.startsWith('.'))) {
          const fix = this.TLDS.map(t => [t, this._lev(last, t)]).sort((a, b) => a[1] - b[1])[0];
          if (fix && fix[1] <= 1) {
            const at = trimmed.toLowerCase().lastIndexOf(last);
            issues.push({ kind: 'web', text: trimmed, suggestion: trimmed.slice(0, at) + fix[0], box: w.box, conf: w.conf });
          }
        }
        return;
      }

      // 3. Ordinary words
      let word = joinedWith.get(i) || clean(raw);
      if (word.length < 3 || /\d/.test(word) || !/^[A-Za-z][A-Za-z'’-]*$/.test(word)) return;
      if (word.length <= 3 && word === word.toUpperCase()) return;   // acronyms (HBC, LLC)
      if (this._known(word, extra)) return;
      if (word.includes('-') && word.split('-').every(p => p.length < 2 || this._known(p, extra))) return;
      // "Childrens" → OCR often drops the apostrophe of a possessive
      if (/s$/i.test(word) && this._known(word.slice(0, -1), extra)) return;
      if (!/[aeiouy]/i.test(word)) return;                       // no vowel → abbreviation or a cut-off piece ("rts")
      if (!joinedWith.has(i) && this._isFragment(w, word, words, allReadings, extra, frame)) return;
      let sugg = this._suggest(word)[0];
      let text = raw;
      if (!sugg && !joinedWith.has(i)) {
        // Another reading of the same spot may have read the letters better (Impact "BRITHDRY" in one
        // reading, "BRITHDAY" in another): use the reading that is a recognisable misspelling
        (allReadings || []).forEach(list => list.forEach(t => {
          if (t.conf < 60 || this._iou(t.box, w.box) < 0.5) return;
          const alt = clean(t.text);
          if (alt === word || alt.length !== word.length || !/^[A-Za-z][A-Za-z'’-]*$/.test(alt) || this._known(alt, extra)) return;
          const s = this._suggest(alt)[0];
          if (s && (!sugg || s.rank < sugg.rank)) { sugg = s; word = alt; text = t.text; }
        }));
      }
      if (!sugg) return;                                        // nothing one letter away → a name or brand
      const top = sugg.word;
      const dist = this._lev(word, top);
      if (dist > (word.length <= 4 ? 1 : 2)) return;
      const lower = word === word.toLowerCase();
      // A cut-off piece of a stylised word ("ratory" → "Oratory", "rts" → "Arts"): the fix only adds
      // letters at the start / end, or is a proper name — that is a reading fragment, not a typo
      const lt = top.toLowerCase(), lw = word.toLowerCase();
      if (lt.length > lw.length && (lt.endsWith(lw) || lt.startsWith(lw))) return;
      if (lower && sugg.proper) return;                       // "ther" → "Cher" is a fragment, not a typo
      // Lower-case words are ordinary words: a close dictionary match means a typo.
      // Capitalised / ALL-CAPS words are often names, so they count as typos only when the
      // difference is a typing slip; otherwise they are listed for the designer to verify.
      const soundAlike = !sugg.proper && (sugg.rank === 3 || sugg.sound) && lt[0] === lw[0];
      // a long word (GUARENTEED, LISENCED) that close to an ordinary word is a typo, not a name
      const slip = this._isTypingSlip(word, top) || (soundAlike && word.length >= 7);
      // A shorter capitalised word that is not a slip is most likely a name (CAIDEN, KADE, MOWEN): list it
      // only when it differs from an ordinary word by a sound-alike letter inside the word (SERVISE → SERVICE)
      if (!(lower || slip) && (word.length < 5 || !soundAlike)) return;
      issues.push({ kind: (lower || slip) ? 'word' : 'verify', text, word, suggestion: top, box: joinedBox.get(i) || w.box, conf: w.conf });
    });
    return issues;
  },

  /** Typical keyboard slips: doubled / undoubled letter, two letters swapped, a letter missing in a long word */
  _isTypingSlip(word, sug) {
    const a = word.toLowerCase(), b = sug.toLowerCase();
    const d = this._lev(a, b);
    const undouble = t => t.replace(/(.)\1+/g, '$1');
    if (d <= 2 && undouble(a) === undouble(b)) return true;
    if (d !== 1) return false;
    if (a.length === b.length) {
      const diff = [...a].map((c, i) => (c !== b[i] ? i : -1)).filter(i => i >= 0);
      if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true;
    }
    return Math.abs(a.length - b.length) === 1 && a[0] === b[0] && Math.min(a.length, b.length) >= 7;
  },

  /**
   * Do the letters carry on right beside this word (closer than a word space)? Then the reader only
   * got a piece of a longer word ("tal" of "Hospital") and it is not a spelling mistake.
   * @param view reading canvas (text upright); fb word box as fractions of that canvas
   */
  _isCutOff(view, fb) {
    const cv = view.canvas, W = cv.width, H = cv.height;
    const x0 = Math.round(fb.x * W), x1 = Math.round((fb.x + fb.w) * W);
    const y0 = Math.max(0, Math.round(fb.y * H)), y1 = Math.min(H, Math.round((fb.y + fb.h) * H));
    const h = y1 - y0;
    if (h < 8 || x1 - x0 < 6) return false;
    const reach = Math.max(4, Math.round(h * 0.35));                  // search window beside the word
    const sx0 = Math.max(0, x0 - reach), sx1 = Math.min(W, x1 + reach), rw = sx1 - sx0;
    const m = Math.max(2, Math.round(h * 0.1));                          // rows just above / below the word
    const top = Math.max(0, y0 - m), bot = Math.min(H, y1 + m);
    let data;
    try { data = cv.getContext('2d').getImageData(sx0, top, rw, bot - top).data; } catch (e) { return false; }
    const lum = (x, y) => { const i = ((y + y0 - top) * rw + (x - sx0)) * 4; return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114; };
    // letters vs background inside the word box (Otsu)
    const hist = new Array(256).fill(0); let n = 0;
    for (let y = 0; y < h; y++) for (let x = x0; x < x1; x++) { hist[lum(x, y) | 0]++; n++; }
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sB = 0, wB = 0, best = 0, th = 128, mDark = 0, mLight = 0;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = n - wB; if (!wF) break;
      sB += t * hist[t];
      const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
      if (v > best) { best = v; th = t; mDark = sB / wB; mLight = (sum - sB) / wF; }
    }
    if (mLight - mDark < 50) return false;                             // too little contrast to tell
    // Background = what lies just above and below the word (bold letters can fill the whole box);
    // without room there, what the box edge mostly is
    let ringDark = 0, ringN = 0;
    for (let y = top - y0; y < bot - y0; y++) {
      if (y >= 0 && y < h) continue;
      for (let x = x0; x < x1; x++) { ringDark += lum(x, y) <= th; ringN++; }
    }
    if (ringN < 20) {
      for (let x = x0; x < x1; x++) { ringDark += (lum(x, 0) <= th) + (lum(x, h - 1) <= th); ringN += 2; }
      for (let y = 0; y < h; y++) { ringDark += (lum(x0, y) <= th) + (lum(x1 - 1, y) <= th); ringN += 2; }
    }
    const inkDark = ringDark < ringN / 2;
    const isInk = v => (inkDark ? v <= th : v > th);
    const b0 = Math.round(h * 0.2), b1 = Math.round(h * 0.8), need = Math.max(2, Math.round((b1 - b0) * 0.2));
    const colInk = x => { let c = 0; for (let y = b0; y < b1; y++) c += isInk(lum(x, y)); return c; };
    // The box edge can cut through its own first / last letter: walk past that ink, then look for a
    // clear gap followed by another letter within letter-spacing distance
    // Spacing between the letters of this word (fonts differ: Impact is tight, Georgia is loose)
    const gaps = []; let run = 0, inked = false;
    for (let x = x0; x < x1; x++) {
      if (colInk(x) > 0) { if (inked && run > 0) gaps.push(run); run = 0; inked = true; } else if (inked) run++;
    }
    gaps.sort((p, q) => p - q);
    const g = gaps.length ? gaps[Math.floor(gaps.length / 2)] : Math.round(h * 0.06);
    const limit = Math.min(Math.max(2, Math.ceil(g * 1.8)), Math.max(2, Math.round(h * 0.22)));   // wider = a word space
    const slop = Math.max(2, Math.round(h * 0.04));
    const nextLetter = (start, step, end) => {
      let x = start, k = 0;
      while (x !== end && k < slop && colInk(x) > 0) { x += step; k++; }
      for (let empty = 0; x !== end && empty <= limit; x += step) {
        const c = colInk(x);
        if (c >= need) return true;
        if (c === 0) empty++;
      }
      return false;
    };
    return nextLetter(x0 - 1, -1, sx0 - 1) || nextLetter(x1, 1, sx1);
  },

  _union(boxes) {
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
    const x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
};

if (typeof window !== 'undefined') {
  window.ArtworkTextCheck = ArtworkTextCheck;
}
