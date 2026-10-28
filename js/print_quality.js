/**
 * Design Intelligence Hub - Print quality status (zoomed print preview)
 *
 * Every order gets one of three statuses, judged the way the designer judges the print preview (PR-DPO-03:
 * Photoshop "Print Size", 100 % zoom for 72 ppi files over 120"): Good to Go · Bit Fuzzy · Low Resolution.
 * The status follows what the artwork looks like at print size — its real detail per inch, read from how sharp its
 * edges are (DetailCheck) — not the PPI number alone: a small picture enlarged to 300 PPI still looks like ~65 PPI.
 * The PPI is shown for reference.
 *   real detail ≥ SOP target              → Good to Go
 *   SOP minimum ≤ real detail < target    → Bit Fuzzy
 *   real detail < SOP minimum             → Low Resolution
 * Edges up to 2 px wide (sharpest quarter) count as made at size: anti-aliased vector art and JPEG files measure
 * 1.2–2.0 px (US2392880 pop-out banner, crisp at 1:1, 1.76 px); a picture enlarged 2× measures about 2.1 px.
 */
const PrintQuality = {
  SHARP_UPTO: 2.0,
  PRINT_SIZE_PX_PER_IN: 96 * 1.144,      // Photoshop "Print Size" on the 143 PPI screen (Proof Studio, SOP slide 8)
  LABEL: { good: 'Good to Go', fuzzy: 'Bit Fuzzy', low: 'Low Resolution' },
  RANK: { good: 0, fuzzy: 1, low: 2 },

  /** How much the picture was enlarged, from its edges: overall (all) and in its enlarged areas when only part is */
  enlargement(det) {
    if (!det || det.verdict === 'unknown' || !(det.p25 > 0)) return null;
    const k = p => Math.max(1, Math.round((p - 0.7) / 0.75 * 10) / 10);
    const all = det.p25 <= this.SHARP_UPTO ? 1 : k(det.p25);
    let part = null;
    if (det.partly) {
      const ps = (det.tiles || []).filter(t => t.state === 'enlarged').map(t => t.p25).sort((a, b) => a - b);
      if (ps.length) part = k(ps[ps.length >> 1]);
    }
    return { all, part: part && part > all ? part : null };
  },

  /**
   * The status for one picture (or the whole raster artwork) at its print size.
   * @param o { ppi, det, target, min } — ppi = pixels per inch at the printed size, det = DetailCheck result
   */
  assess(o) {
    const ppi = Math.round(o.ppi || 0), target = o.target, min = o.min;
    if (!(ppi > 0) || !(target > 0)) return null;
    const e = this.enlargement(o.det);
    const k = e ? e.all : 1, kPart = e ? e.part : null;
    const real = Math.round(ppi / k), realPart = kPart ? Math.round(ppi / kPart) : null;
    const worst = Math.min(real, realPart || real);
    // soft areas on an otherwise sharp artwork can be soft by nature (a gradient, a blurred photo background): they
    // make it Bit Fuzzy at most — the designer confirms them in the zoomed preview
    const status = real < min ? 'low' : real < target || (realPart && realPart < target) ? 'fuzzy' : 'good';
    const p25 = o.det && o.det.p25;
    let why;
    if (k > 1) {
      why = `The picture was enlarged about ${k}× from a smaller one: at print size it shows the detail of about ${real} PPI, although the file has ${ppi} PPI`;
    } else if (kPart) {
      why = `Sharp overall, but part of the artwork (an enlarged photo or logo, or an area soft by design such as a gradient — confirm it in the zoomed preview) shows only about ${realPart} PPI of detail at print size (file: ${ppi} PPI)`;
    } else {
      why = e ? `Sharp edges (${p25} px): the artwork has the ${ppi} PPI of detail its pixels promise at print size` : `${ppi} PPI at print size`;
    }
    why += status === 'low' ? ` — under the SOP minimum ${min} PPI: it prints pixelated / blurry.`
      : status === 'fuzzy' ? ` — under the SOP ${target} PPI (minimum ${min}): it looks a bit soft up close.`
      : ` — meets the SOP ${target} PPI.`;
    if (!e) why += ' Judged on the PPI: the artwork has too few clear edges (flat colours) to measure its sharpness.';
    return { status, label: this.LABEL[status], ppi, real: worst, k, kPart, target, min, basis: e ? 'visual' : 'ppi', why, p25 };
  },

  /** Vector artwork: sharp at any size */
  vector() {
    return { status: 'good', label: this.LABEL.good, basis: 'vector', why: 'Vector artwork — lines and text print sharp at any size; there are no pixels to enlarge.' };
  },

  /** The worst of several assessments (pictures of a design file) */
  worst(list) {
    return list.filter(Boolean).sort((a, b) => (this.RANK[b.status] - this.RANK[a.status]) || (a.real - b.real))[0] || null;
  },

  /** Print-preview zoom per the SOP for this print size: CSS px per picture pixel */
  zoomFor(q, dims) {
    const z = typeof SopRules !== 'undefined' ? SopRules.inspectZoom(dims) : { mode: 'print', label: 'Photoshop "Print Size"' };
    const scale = z.mode === '100%' ? 1 : this.PRINT_SIZE_PX_PER_IN / Math.max(1, q.ppi);
    return { label: z.mode === '100%' ? '100% zoom (72 ppi file, over 120")' : 'Photoshop "Print Size"', scale };
  },

  /** Strip for the top of the results: status, the numbers, and the zoomed print preview of the measured area */
  html(q, dims) {
    if (!q) return '';
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const facts = q.basis === 'vector' ? '<span>Vector · no pixels</span>' : [
      `<span>File: <strong>${q.ppi} PPI</strong> at print size</span>`,
      q.basis === 'visual' ? `<span>Looks like: <strong>≈ ${q.real} PPI</strong> zoomed in${q.k > 1 ? ` (enlarged ×${q.k})` : q.kPart ? ` in part (×${q.kPart})` : ''}</span>` : '<span>Sharpness: not measurable (flat colours)</span>',
      `<span>SOP: <strong>${q.target} PPI</strong> (minimum ${q.min})</span>`
    ].join('');
    // The zoomed print preview: the whole artwork (or the whole picture of a design PDF) at print size, moved around by
    // hand; it opens on the least sharp area the check measured. Without the whole artwork, that area alone.
    const s = q.sample, f = q.full && q.full.url && q.full.w > 0 ? q.full : null;
    const src = f ? { url: f.url, w: f.w, h: f.h, fx: s && s.cx != null ? s.cx : f.w / 2, fy: s && s.cy != null ? s.cy : f.h / 2 }
      : s && s.url ? { url: s.url, w: s.w, h: s.h, fx: s.fx, fy: s.fy } : null;
    let view = '';
    if (src && q.ppi) {
      const z = this.zoomFor(q, dims);
      const MAX = 16000;                                    // the browser draws an image up to about this many pixels
      const fits = sc => Math.max(src.w, src.h) * sc <= MAX;
      const btn = (sc, label, on) => fits(sc) ? `<button type="button"${on ? ' class="on"' : ''} data-scale="${sc}" onclick="PrintQuality.zoom(this)">${label}</button>` : '';
      const start = fits(z.scale) ? z.scale : MAX / Math.max(src.w, src.h);
      view = `
        <div class="pq-view">
          <div class="pq-view-head"><span>Zoomed print preview</span>
            <span class="pq-zoom">${btn(start, z.scale === 1 ? '100%' : 'Print size', true)}${z.scale === 1 ? '' : btn(1, '100%')}${btn(2 * z.scale, z.scale === 1 ? '200%' : '2× print size')}</span></div>
          <div class="pq-view-frame">
            <div class="pq-view-box" data-w="${src.w}" data-h="${src.h}" data-fx="${src.fx}" data-fy="${src.fy}" onpointerdown="PrintQuality.drag(event, this)" title="Drag to move around the artwork">
              <img src="${src.url}" alt="Artwork at print size" draggable="false" style="width:${Math.round(src.w * start)}px; height:${Math.round(src.h * start)}px;" onload="PrintQuality.ready(this)">
            </div>
            <span class="pq-hand"><span class="pq-hand-ico"><svg class="r-ico"><use href="#ri-hand"/></svg></span>Drag to move</span>
          </div>
          <div class="pq-view-note">${esc(z.label)} — ${f ? `the whole ${s && s.pic ? `picture ${s.pic}` : 'artwork'}, opened on the least sharp area the check measured` : 'the least sharp area the check measured'}</div>
        </div>`;
    }
    return `
      <div class="pq-strip pq-${q.status}" id="pq-strip">
        <div class="pq-main">
          <div class="pq-label">Print quality · status to set</div>
          <div class="pq-status"><span class="pq-dot"></span>${q.label}</div>
          <div class="pq-why">${esc(q.why)}</div>
          <div class="pq-facts">${facts}</div>
          <div class="pq-note">Judged mainly on how the artwork looks zoomed in at print size (the sharpness of its edges); the PPI is shown for reference.</div>
        </div>${view}
      </div>`;
  },

  /** Zoom buttons of the print preview: the point in the middle of the view stays in the middle */
  zoom(btn) {
    const box = btn.closest('.pq-view').querySelector('.pq-view-box'), img = box.querySelector('img');
    const old = img.clientWidth / Math.max(1, box.dataset.w), sc = parseFloat(btn.dataset.scale);
    const cx = (box.scrollLeft + box.clientWidth / 2) / old, cy = (box.scrollTop + box.clientHeight / 2) / old;
    img.style.width = Math.round(box.dataset.w * sc) + 'px';
    img.style.height = Math.round(box.dataset.h * sc) + 'px';
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    this.center(box, cx, cy);
  },

  /** Scroll the preview so (x, y) — by default the measured area — sits in the middle */
  center(box, x, y) {
    const img = box.querySelector('img');
    if (!img) return;
    const sc = img.clientWidth / Math.max(1, box.dataset.w);
    box.scrollLeft = Math.max(0, (x != null ? x : +box.dataset.fx) * sc - box.clientWidth / 2);
    box.scrollTop = Math.max(0, (y != null ? y : +box.dataset.fy) * sc - box.clientHeight / 2);
  },

  _still() {
    return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  /**
   * The preview's picture is in: centre it on the measured area, then — once per artwork — a short "peek" pan shows
   * that it can be moved. The animated hand hint stays until the first drag.
   */
  ready(img) {
    const box = img.parentElement, frame = box.parentElement;
    this.center(box);
    if (this._used) frame.classList.add('used');
    if (this._peeked === img.src || this._still()) return;
    // the peek plays when the preview is on screen (a design file's preview sits further down the page)
    const peek = () => {
      if (this._peeked === img.src || !box.isConnected) return;
      this._peeked = img.src;
      const room = box.scrollWidth - box.clientWidth;
      if (room < 20) return;
      const l0 = box.scrollLeft, A = (room - l0 >= 70 ? 1 : -1) * Math.min(70, Math.max(room - l0, l0)), t0 = performance.now(), D = 1300;
      const step = now => {
        const k = Math.min(1, (now - t0) / D);
        box.scrollLeft = l0 + A * Math.sin(Math.PI * k);         // out and back
        if (k < 1 && !box.classList.contains('grabbing')) requestAnimationFrame(step);
      };
      setTimeout(() => requestAnimationFrame(step), 400);
    };
    if (typeof IntersectionObserver === 'undefined') { peek(); return; }
    const io = new IntersectionObserver(entries => {
      if (entries.some(en => en.isIntersecting)) { io.disconnect(); peek(); }
    }, { threshold: .6 });
    io.observe(box);
  },

  /** Hand tool: drag the artwork around inside the preview; let go and it glides on and slows down */
  drag(e, box) {
    if (e.button !== 0) return;
    e.preventDefault();
    cancelAnimationFrame(this._glide);
    box.parentElement.classList.add('used');
    this._used = true;
    let lx = e.clientX, ly = e.clientY, lt = performance.now(), vx = 0, vy = 0;
    box.classList.add('grabbing');
    const move = ev => {
      const now = performance.now(), dt = Math.max(1, now - lt), dx = ev.clientX - lx, dy = ev.clientY - ly;
      box.scrollLeft -= dx;
      box.scrollTop -= dy;
      vx = .8 * (dx / dt) + .2 * vx;                               // px per ms, smoothed
      vy = .8 * (dy / dt) + .2 * vy;
      lx = ev.clientX; ly = ev.clientY; lt = now;
    };
    const up = () => {
      box.classList.remove('grabbing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (performance.now() - lt > 80 || this._still()) return;   // held still before letting go: no glide
      let px = vx * 16, py = vy * 16;                              // px per frame
      const glide = () => {
        px *= .92; py *= .92;
        box.scrollLeft -= px; box.scrollTop -= py;
        if (Math.abs(px) + Math.abs(py) > .4) this._glide = requestAnimationFrame(glide);
      };
      this._glide = requestAnimationFrame(glide);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
};

if (typeof window !== 'undefined') window.PrintQuality = PrintQuality;
if (typeof module !== 'undefined' && module.exports) module.exports = PrintQuality;
