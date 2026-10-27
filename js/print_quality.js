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
    const status = worst < min ? 'low' : worst < target ? 'fuzzy' : 'good';
    const p25 = o.det && o.det.p25;
    let why;
    if (k > 1) {
      why = `The picture was enlarged about ${k}× from a smaller one: at print size it shows the detail of about ${real} PPI, although the file has ${ppi} PPI`;
    } else if (kPart) {
      why = `Sharp overall, but part of the artwork (an enlarged photo or logo) shows only about ${realPart} PPI of detail at print size (file: ${ppi} PPI)`;
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
    const s = q.sample;
    let view = '';
    if (s && s.url && q.ppi) {
      const z = this.zoomFor(q, dims);
      view = `
        <div class="pq-view">
          <div class="pq-view-head"><span>Zoomed print preview</span>
            <span class="pq-zoom"><button type="button" class="on" data-scale="${z.scale}" onclick="PrintQuality.zoom(this)">${z.scale === 1 ? '100%' : 'Print size'}</button>${z.scale === 1 ? '' : '<button type="button" data-scale="1" onclick="PrintQuality.zoom(this)">100%</button>'}<button type="button" data-scale="${2 * z.scale}" onclick="PrintQuality.zoom(this)">${z.scale === 1 ? '200%' : '2× print size'}</button></span></div>
          <div class="pq-view-box" data-w="${s.w}" data-h="${s.h}" data-fx="${s.fx}" data-fy="${s.fy}">
            <img src="${s.url}" alt="Artwork area at print size" style="width:${Math.round(s.w * z.scale)}px; height:${Math.round(s.h * z.scale)}px;" onload="PrintQuality.center(this.parentElement)">
          </div>
          <div class="pq-view-note">${esc(z.label)} — the least sharp area the check measured${s.pic ? ` (picture ${s.pic})` : ''}</div>
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

  /** Zoom buttons of the print preview */
  zoom(btn) {
    const box = btn.closest('.pq-view').querySelector('.pq-view-box'), img = box.querySelector('img');
    const sc = parseFloat(btn.dataset.scale);
    img.style.width = Math.round(box.dataset.w * sc) + 'px';
    img.style.height = Math.round(box.dataset.h * sc) + 'px';
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
    this.center(box);
  },

  /** Scroll the preview so the measured area sits in the middle */
  center(box) {
    const img = box.querySelector('img');
    if (!img) return;
    const sc = img.clientWidth / Math.max(1, box.dataset.w);
    box.scrollLeft = Math.max(0, box.dataset.fx * sc - box.clientWidth / 2);
    box.scrollTop = Math.max(0, box.dataset.fy * sc - box.clientHeight / 2);
  }
};

if (typeof window !== 'undefined') window.PrintQuality = PrintQuality;
if (typeof module !== 'undefined' && module.exports) module.exports = PrintQuality;
