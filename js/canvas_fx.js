/**
 * Design Intelligence Hub - small canvas animations
 *
 * Laid over the canvas as HTML (the canvas itself is never redrawn for them):
 *  · blank space — the empty part of the ordered size fills with a sweeping hatch (report.blankSpace)
 *  · the safe-zone line draws itself round the trim, then hands over to the canvas's own dashed line
 *  · issue markers (safe-zone marks, stray-mark / spelling markers) drop onto their spots
 * They play once per artwork, when the canvas comes into view, and only move with transform / opacity (drawn by
 * the graphics card), so they never hold up a check. "Reduce motion" in Windows shows the end state at once.
 * place() runs after every canvas redraw (CanvasInspector.redraw) and puts the layer back without animating.
 */
const CanvasFx = {
  _key: null,
  _played: null,

  _still() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  },

  place() {
    const canvas = document.getElementById('artwork-canvas');
    const ci = typeof CanvasInspector !== 'undefined' ? CanvasInspector : null;
    const report = typeof appState !== 'undefined' ? appState.report : null;
    let ov = document.getElementById('canvas-fx');
    const trim = ci && ci.trimRect, art = ci && ci.artRect;
    if (!canvas || !trim || !report || (ci.inspectorMode && ci.inspectorMode !== 'artwork')) { if (ov) ov.style.display = 'none'; return; }
    if (!ov || ov.parentElement !== canvas.parentElement) {
      if (ov) ov.remove();
      ov = document.createElement('div');
      ov.id = 'canvas-fx';
      ov.className = 'canvas-fx';
      canvas.parentElement.appendChild(ov);
      if (window.ResizeObserver) { this._ro && this._ro.disconnect(); this._ro = new ResizeObserver(() => this._fit(ov, canvas)); this._ro.observe(canvas); }
    }
    this._fit(ov, canvas);
    const pct = (v, of) => (v / of * 100).toFixed(3) + '%';
    let html = '';
    // blank space: the trim minus the artwork placed whole — bands left / right or above / below
    const b = report.blankSpace;
    const sizeCheck = report.checks && report.checks.find(c => c.id === 'sizeTransform' || c.id === 'pc-size');
    if (b && art && !ci.artRot && !(sizeCheck && sizeCheck.isOverridden)) {
      const bands = b.axis === 'w'
        ? [{ x: 0, w: art.x - trim.x, s: 'left' }, { x: art.x + art.w - trim.x, w: trim.x + trim.w - art.x - art.w, s: 'right' }].map(r => Object.assign(r, { y: 0, h: trim.h }))
        : [{ y: 0, h: art.y - trim.y, s: 'top' }, { y: art.y + art.h - trim.y, h: trim.y + trim.h - art.y - art.h, s: 'bottom' }].map(r => Object.assign(r, { x: 0, w: trim.w }));
      html += bands.filter(r => r.w > 2 && r.h > 2).map(r =>
        `<div class="fx-blank fx-${r.s}" style="left:${pct(r.x, trim.w)};top:${pct(r.y, trim.h)};width:${pct(r.w, trim.w)};height:${pct(r.h, trim.h)}"><span>Blank ${typeof SopRules !== 'undefined' ? SopRules.lenText(b.eachIn) : b.eachIn + '"'}</span></div>`).join('');
    }
    // the safe-zone line (banner templates, where the canvas knows its inset)
    if (ci.safeInset > 0 && (!ci.guides || ci.guides.safeArea !== false)) {
      const si = ci.safeInset;
      html += `<div class="fx-safe" style="left:${pct(si, trim.w)};top:${pct(si, trim.h)};right:${pct(si, trim.w)};bottom:${pct(si, trim.h)}"><i class="t"></i><i class="r"></i><i class="b"></i><i class="l"></i></div>`;
    }
    if (ov._html !== html) { ov.innerHTML = html; ov._html = html; }

    // once per artwork and order size, when the canvas is on screen
    const d = report.dimensions || {};
    const key = `${(report.analysis && report.analysis.previewDataUrl || '').length}|${d.widthIn}x${d.heightIn}`;
    if (this._played === key) { ov.classList.add('fx-done'); return; }
    // already waiting for this canvas to come into view (the results redraw makes a new canvas: watch that one)
    if (this._key === key && this._io && this._ioCanvas === canvas) return;
    this._key = key;
    ov.classList.remove('fx-done', 'fx-play');
    if (this._still()) { this._played = key; ov.classList.add('fx-done'); return; }
    if (this._io) this._io.disconnect();
    if (!window.IntersectionObserver) { this.play(); return; }
    this._ioCanvas = canvas;
    this._io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { this._io.disconnect(); this._io = null; this.play(); }
    }, { threshold: 0.35 });
    this._io.observe(canvas);
  },

  _fit(ov, canvas) {
    const trim = typeof CanvasInspector !== 'undefined' && CanvasInspector.trimRect;
    if (!trim || !ov.isConnected) return;
    const sx = canvas.width ? canvas.offsetWidth / canvas.width : 1, sy = canvas.height ? canvas.offsetHeight / canvas.height : 1;
    Object.assign(ov.style, { display: 'block', left: (canvas.offsetLeft + trim.x * sx) + 'px', top: (canvas.offsetTop + trim.y * sy) + 'px',
      width: (trim.w * sx) + 'px', height: (trim.h * sy) + 'px' });
  },

  /** Play the animations now (also the blank-space alert's Show button) */
  play() {
    const ov = document.getElementById('canvas-fx');
    this._played = this._key;
    if (this._still()) { if (ov) ov.classList.add('fx-done'); return; }
    if (ov) {
      ov.classList.remove('fx-done', 'fx-play');
      void ov.offsetWidth;
      ov.classList.add('fx-play');
      clearTimeout(this._done);
      this._done = setTimeout(() => { ov.classList.remove('fx-play'); ov.classList.add('fx-done'); }, 2800);
    }
    // the issue markers drop onto their spots, one after another (Web Animations: their own blinking keeps going)
    const marks = [...document.querySelectorAll('#safe-zone-overlay .sz-mark, #ai-defect-overlay .ai-highlight-item')].slice(0, 30);
    marks.forEach((m, i) => {
      if (m.animate) m.animate([{ opacity: 0, translate: '0 -16px' }, { opacity: 1, translate: '0 0' }],
        { duration: 420, delay: 250 + i * 60, easing: 'cubic-bezier(.2,.9,.3,1.25)', fill: 'backwards' });
    });
  }
};

if (typeof window !== 'undefined') window.CanvasFx = CanvasFx;
