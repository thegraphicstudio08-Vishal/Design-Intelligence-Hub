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
    const pad = Math.round(Math.max(w, h) * (cfg.pad || 0.06));
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
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
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

  _suggest(word) {
    const out = [];
    this._dicts.forEach(d => (d.suggest(word, 4) || []).forEach(s => {
      if (/^[A-Za-z][A-Za-z'’-]*$/.test(s) && !out.includes(s)) out.push(s);   // real words only
    }));
    return out.sort((a, b) => this._lev(word, a) - this._lev(word, b));
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
    const score = w => w.conf + (this._isGood(w) ? 25 : 0);
    const list = [];
    for (const cfg of cfgs) {
      (await this._readOnce(source, cfg, angle)).forEach(w => {
        const k = list.findIndex(o => iou(o.box, w.box) > 0.3);
        if (k < 0) list.push(w);
        else if (score(w) > score(list[k])) list[k] = w;
      });
    }
    return { angle: ((angle % 360) + 360) % 360, words: list, good: list.filter(w => this._isGood(w)).length };
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
    const orientation = { angle, readable: reading.good >= 2, goodWords: reading.good, tried };
    const issues = this._checkWords(reading.words, ctx.fileWords || []);
    say('done', '');
    return { available: true, orientation, words: reading.words, issues };
  },

  // ── checks ────────────────────────────────────────────────────────────
  /** Group words into text lines by position (left → right) */
  _lines(words) {
    const order = words.map((w, i) => i).sort((a, b) => (words[a].box.y + words[a].box.h / 2) - (words[b].box.y + words[b].box.h / 2));
    const lines = [];
    order.forEach(i => {
      const w = words[i], cy = w.box.y + w.box.h / 2;
      const y0 = w.box.y, y1 = w.box.y + w.box.h;
      const line = lines.find(l => (Math.min(l.y1, y1) - Math.max(l.y0, y0)) >= 0.4 * Math.min(l.y1 - l.y0, y1 - y0));
      if (line) { line.idx.push(i); line.y0 = Math.min(line.y0, y0); line.y1 = Math.max(line.y1, y1); }
      else lines.push({ cy, y0, y1, idx: [i] });
    });
    lines.forEach(l => l.idx.sort((a, b) => words[a].box.x - words[b].box.x));
    return lines.map(l => l.idx);
  },

  /** Spelling, brand-name and web-address checks on the words that were read */
  _checkWords(words, fileWords) {
    const extra = new Set(fileWords.map(w => w.toLowerCase()));
    const issues = [];
    const used = new Set();
    const clean = t => t.replace(/^[^A-Za-z0-9@]+|[^A-Za-z0-9]+$/g, '');
    const lines = this._lines(words);

    // 1. Brand names (also when OCR splits them: "Ez" + "Licnse", or misses a stylised letter)
    lines.forEach(idx => {
      for (let s = 0; s < idx.length; s++) {
        for (let len = 3; len >= 1; len--) {
          if (s + len > idx.length) continue;
          const part = idx.slice(s, s + len);
          if (part.some(i => used.has(i) || words[i].conf < this.MIN_CONF - 10)) continue;
          const joined = this._lookalike(part.map(i => words[i].text).join('')).replace(/[^a-z0-9]/g, '');
          if (joined.length < 5) continue;
          for (const brand of this.BRANDS) {
            const b = brand.toLowerCase();
            const variants = [b].concat([...b].map((_, k) => b.slice(0, k) + b.slice(k + 1)));
            const d = Math.min(...variants.map(v => this._lev(joined, v)));
            if (d === 0) { part.forEach(i => used.add(i)); break; }
            if (d <= (b.length >= 8 ? 2 : 1) && Math.abs(joined.length - b.length) <= 2) {
              part.forEach(i => used.add(i));
              issues.push({ kind: 'brand', text: part.map(i => words[i].text).join(' '), suggestion: brand,
                box: this._union(part.map(i => words[i].box)), conf: Math.min(...part.map(i => words[i].conf)) });
              break;
            }
          }
        }
      }
    });

    // A stylised first letter is often read on its own ("H" + "earts", "L" + "ittle"): join it back
    const joinedWith = new Map();
    lines.forEach(idx => {
      for (let k = 0; k + 1 < idx.length; k++) {
        const a = words[idx[k]], b = words[idx[k + 1]];
        const gap = b.box.x - (a.box.x + a.box.w);
        if (/^[A-Za-z]$/.test(clean(a.text)) && /^[a-z]/.test(clean(b.text)) && gap < Math.max(a.box.h, b.box.h) * 0.6) {
          joinedWith.set(idx[k + 1], clean(a.text) + clean(b.text));
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
      const word = joinedWith.get(i) || clean(raw);
      if (word.length < 3 || /\d/.test(word) || !/^[A-Za-z][A-Za-z'’-]*$/.test(word)) return;
      if (word.length <= 3 && word === word.toUpperCase()) return;   // acronyms (HBC, LLC)
      if (this._known(word, extra)) return;
      if (word.includes('-') && word.split('-').every(p => p.length < 2 || this._known(p, extra))) return;
      // "Childrens" → OCR often drops the apostrophe of a possessive
      if (/s$/i.test(word) && this._known(word.slice(0, -1), extra)) return;
      const top = this._suggest(word)[0];
      if (!top) return;                                         // nothing close → a name or brand
      const dist = this._lev(word, top);
      if (dist > (word.length <= 4 ? 1 : 2)) return;
      const lower = word === word.toLowerCase();
      // A cut-off piece of a stylised word ("ratory" → "Oratory", "rts" → "Arts"): the fix only adds
      // letters at the start / end, or is a proper name — that is a reading fragment, not a typo
      const lt = top.toLowerCase(), lw = word.toLowerCase();
      if (lt.length > lw.length && (lt.endsWith(lw) || lt.startsWith(lw))) return;
      if (lower && /^[A-Z]/.test(top)) return;
      // Lower-case words are ordinary words: a close dictionary match means a typo.
      // Capitalised / ALL-CAPS words are often names, so they count as typos only when the
      // difference is a typing slip; otherwise they are listed for the designer to verify.
      const slip = this._isTypingSlip(word, top);
      if (!(lower || slip) && word.length <= 3) return;          // too short to tell a name from a fragment
      issues.push({ kind: (lower || slip) ? 'word' : 'verify', text: raw, word, suggestion: top, box: w.box, conf: w.conf });
    });
    return issues;
  },

  /** Typical keyboard slips: doubled / undoubled letter, two letters swapped, a letter missing in a long word */
  _isTypingSlip(word, sug) {
    const a = word.toLowerCase(), b = sug.toLowerCase();
    if (this._lev(a, b) !== 1) return false;
    const undouble = t => t.replace(/(.)\1+/g, '$1');
    if (undouble(a) === undouble(b)) return true;
    if (a.length === b.length) {
      const diff = [...a].map((c, i) => (c !== b[i] ? i : -1)).filter(i => i >= 0);
      if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) return true;
    }
    return Math.abs(a.length - b.length) === 1 && a[0] === b[0] && Math.min(a.length, b.length) >= 7;
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
