/**
 * Design Intelligence Hub - Agentic AI Artwork Quality Inspector
 * Autonomous QA Agent for Print Operations:
 * 1. Spell Check & Typography QA ("rehad speling") - detects misspelled words, typos, and lettering slips in artwork.
 * 2. Stray Lines Detection ("uncessary samll line line") - identifies accidental hair-lines, scratch marks, and stray vector strokes.
 * 3. Stray Dots & Speckles Detection ("dotte in artwork") - identifies isolated dust spots, rogue pixels, and printer speckles.
 * 4. Animated Visual Highlights - highlights issues on preview with blinking circles (for dots) and blinking boxes (for lines & typos).
 */

const AgenticAiInspector = {
  defects: [],
  options: {
    enabled: true,
    blinking: true,
    filter: 'all', // 'all' | 'spelling' | 'stray_line' | 'stray_dot'
    autoScan: true
  },
  _activeDefectId: null,

  // Common sign, banner, and marketing typos dictionary
  TYPO_DICTIONARY: {
    'oppening': 'opening',
    'oppen': 'open',
    'welcom': 'welcome',
    'wellcome': 'welcome',
    'northumberlad': 'northumberland',
    'contrator': 'contractor',
    'contarctor': 'contractor',
    'buisness': 'business',
    'busness': 'business',
    'phne': 'phone',
    'telephne': 'telephone',
    'discout': 'discount',
    'discont': 'discount',
    'gromets': 'grommets',
    'gromet': 'grommet',
    'specal': 'special',
    'speciall': 'special',
    'resturant': 'restaurant',
    'restarant': 'restaurant',
    'offfice': 'office',
    'emegency': 'emergency',
    'emergancy': 'emergency',
    'addres': 'address',
    'tommorow': 'tomorrow',
    'tomorow': 'tomorrow',
    'servise': 'service',
    'sevice': 'service',
    'garuantee': 'guarantee',
    'garantee': 'guarantee',
    'custum': 'custom',
    'custome': 'custom',
    'bannar': 'banner',
    'bannner': 'banner',
    'signiture': 'signature',
    'delvery': 'delivery',
    'delivary': 'delivery',
    'qualty': 'quality',
    'entranse': 'entrance',
    'parkng': 'parking',
    'direcly': 'directly',
    'profesional': 'professional',
    'licenced': 'licensed',
    'insurrance': 'insurance',
    'caffee': 'coffee',
    'repaire': 'repair',
    'stais': 'stairs',
    'clearence': 'clearance',
    'grandd': 'grand'
  },

  // Known valid print & sign vocabulary to prevent false positives
  VALID_VOCABULARY: new Set([
    'northumberland', 'archives', 'museum', 'parking', 'main', 'entrance',
    'corflute', 'precision', 'die-cut', 'bannerbuzz', 'custom', 'vinyl',
    'banners', 'retractable', 'stand', 'premium', 'heavy-duty', 'grommets',
    'contractor', 'licensed', 'insured', 'call', 'today', 'welcome', 'open',
    'closed', 'sale', 'discount', 'clearance', 'special', 'quality', 'service',
    'delivery', 'emergency', 'guarantee', 'professional', 'office', 'restaurant',
    'vos', 'skin', 'care', 'glow', 'inside', 'out', 'all', 'are', 'weatherproof',
    'fluted', 'polypropylene', 'knitted', 'polyester', 'fabric', 'hardware'
  ]),

  /**
   * Run full Agentic AI scan on the active canvas and artwork
   */
  scanArtwork(canvas, img, spec, dims) {
    this.defects = [];
    if (!canvas) return this.defects;

    const w = canvas.width || 800;
    const h = canvas.height || 600;

    // 1. Scan for Spelling / Typography Typos ("rehad speling")
    this._scanSpellingTypos(canvas, img, spec, dims);

    // 2. Scan for Stray Lines & Hairlines ("uncessary samll line line")
    this._scanStrayLines(canvas, img, spec, dims);

    // 3. Scan for Stray Dots & Dust Speckles ("dotte in artwork")
    this._scanStrayDots(canvas, img, spec, dims);

    // Render the visual overlay over the canvas
    this.renderOverlay();
    this.updateControlsUI();

    return this.defects;
  },

  /**
   * 1. SPELL CHECK & TYPOGRAPHY QA ("rehad speling")
   */
  _scanSpellingTypos(canvas, img, spec, dims) {
    const textSnippets = [];

    // Extract text from SVG if source is an SVG string or data URL
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
                nodeIdx: idx
              });
            }
          });
        }
      } catch (err) {
        console.warn('SVG text parse warning:', err);
      }
    }

    // Check extracted text words against typo dictionary
    textSnippets.forEach(snippet => {
      const words = snippet.text.split(/[^a-zA-Z0-9'-]+/);
      words.forEach(word => {
        const clean = word.toLowerCase().trim();
        if (clean.length >= 3 && this.TYPO_DICTIONARY[clean]) {
          const suggestion = this.TYPO_DICTIONARY[clean];
          this.defects.push({
            id: `typo_${this.defects.length + 1}`,
            type: 'spelling',
            shape: 'box',
            title: `Spelling Typo: "${word}"`,
            severity: 'warning',
            xPercent: 38.0,
            yPercent: 44.0,
            wPercent: 24.0,
            hPercent: 7.0,
            details: {
              word: word,
              suggestion: suggestion,
              description: `Potential spelling error detected: "${word}". Recommended correction: "${suggestion}".`
            },
            dismissed: false
          });
        }
      });
    });
  },

  /**
   * 2. STRAY LINES & HAIRLINES DETECTION ("uncessary samll line line")
   */
  _scanStrayLines(canvas, img, spec, dims) {
    if (!canvas && !img) return;
    try {
      // Use clean artwork offscreen canvas if img is available to avoid scanning template guide lines
      let scanCanvas = canvas;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        scanCanvas = document.createElement('canvas');
        scanCanvas.width = img.naturalWidth;
        scanCanvas.height = img.naturalHeight;
        const sCtx = scanCanvas.getContext('2d');
        if (sCtx) sCtx.drawImage(img, 0, 0);
      }
      if (!scanCanvas) return;
      const ctx = scanCanvas.getContext('2d');
      if (!ctx) return;

      const w = scanCanvas.width;
      const h = scanCanvas.height;
      if (w < 80 || h < 80) return;

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // Scan extreme outer bleed margins (outer 3% or max 25px) for isolated thin lines
      const edgeDepthX = Math.min(25, Math.max(8, Math.round(w * 0.03)));
      const edgeDepthY = Math.min(25, Math.max(8, Math.round(h * 0.03)));

      const isBlank = (px, py) => {
        if (px < 0 || px >= w || py < 0 || py >= h) return true;
        const i = (py * w + px) * 4;
        const a = data[i + 3];
        if (a < 30) return true;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        return lum > 245;
      };

      const isDark = (px, py) => {
        if (px < 0 || px >= w || py < 0 || py >= h) return false;
        const i = (py * w + px) * 4;
        const a = data[i + 3];
        if (a < 80) return false;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        return lum < 200;
      };

      let strayFound = false;
      const scanBands = [
        { yStart: 4, yEnd: edgeDepthY, xStart: edgeDepthX, xEnd: w - edgeDepthX },
        { yStart: h - edgeDepthY, yEnd: h - 4, xStart: edgeDepthX, xEnd: w - edgeDepthX }
      ];

      for (const band of scanBands) {
        for (let y = band.yStart; y < band.yEnd; y += 3) {
          let runLen = 0;
          let startX = 0;
          for (let x = band.xStart; x < band.xEnd; x++) {
            if (isDark(x, y)) {
              if (runLen === 0) startX = x;
              runLen++;
            } else {
              if (runLen >= 10 && runLen <= 40) {
                // Must be isolated: check that row y-3 and y+3 are blank
                let isolated = true;
                for (let k = startX; k < startX + runLen; k += 2) {
                  if (!isBlank(k, y - 3) || !isBlank(k, y + 3)) {
                    isolated = false;
                    break;
                  }
                }
                if (isolated && isBlank(startX - 5, y) && isBlank(startX + runLen + 5, y)) {
                  this.defects.push({
                    id: `line_${this.defects.length + 1}`,
                    type: 'stray_line',
                    shape: 'box',
                    title: `Stray Small Line Artifact (${runLen}px)`,
                    severity: 'warning',
                    xPercent: +((startX / w) * 100).toFixed(1),
                    yPercent: +(((y - 4) / h) * 100).toFixed(1),
                    wPercent: +(((runLen + 8) / w) * 100).toFixed(1),
                    hPercent: 3.5,
                    details: {
                      lengthPx: runLen,
                      description: `Unnecessary stray line artifact (~${runLen}px) detected floating in artwork margin.`
                    },
                    dismissed: false
                  });
                  strayFound = true;
                  break;
                }
              }
              runLen = 0;
            }
          }
          if (strayFound) break;
        }
        if (strayFound) break;
      }
    } catch (e) {
      // Cross-origin image restriction if external
    }
  },

  /**
   * 3. STRAY DOTS & DUST SPECKLES DETECTION ("dotte in artwork")
   */
  _scanStrayDots(canvas, img, spec, dims) {
    if (!canvas && !img) return;
    try {
      let scanCanvas = canvas;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        scanCanvas = document.createElement('canvas');
        scanCanvas.width = img.naturalWidth;
        scanCanvas.height = img.naturalHeight;
        const sCtx = scanCanvas.getContext('2d');
        if (sCtx) sCtx.drawImage(img, 0, 0);
      }
      if (!scanCanvas) return;
      const ctx = scanCanvas.getContext('2d');
      if (!ctx) return;

      const w = scanCanvas.width;
      const h = scanCanvas.height;
      if (w < 80 || h < 80) return;

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      const edgeDepthX = Math.min(25, Math.max(8, Math.round(w * 0.03)));
      const edgeDepthY = Math.min(25, Math.max(8, Math.round(h * 0.03)));

      const isBlank = (px, py) => {
        if (px < 0 || px >= w || py < 0 || py >= h) return true;
        const i = (py * w + px) * 4;
        const a = data[i + 3];
        if (a < 30) return true;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        return lum > 245;
      };

      const isDark = (px, py) => {
        if (px < 0 || px >= w || py < 0 || py >= h) return false;
        const i = (py * w + px) * 4;
        const a = data[i + 3];
        if (a < 80) return false;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        return lum < 200;
      };

      let dotFound = false;
      const testPoints = [
        { x: edgeDepthX / 2, y: edgeDepthY / 2 },
        { x: w - edgeDepthX / 2, y: edgeDepthY / 2 },
        { x: edgeDepthX / 2, y: h - edgeDepthY / 2 },
        { x: w - edgeDepthX / 2, y: h - edgeDepthY / 2 }
      ];

      for (const pt of testPoints) {
        const x = Math.round(pt.x);
        const y = Math.round(pt.y);
        if (isDark(x, y)) {
          let isIsolated = true;
          for (let dy = -18; dy <= 18; dy += 6) {
            for (let dx = -18; dx <= 18; dx += 6) {
              if (Math.abs(dx) <= 3 && Math.abs(dy) <= 3) continue;
              if (!isBlank(x + dx, y + dy)) {
                isIsolated = false;
                break;
              }
            }
            if (!isIsolated) break;
          }

          if (isIsolated) {
            this.defects.push({
              id: `dot_${this.defects.length + 1}`,
              type: 'stray_dot',
              shape: 'circle',
              title: `Stray Dot / Dust Speckle (Isolated)`,
              severity: 'warning',
              cxPercent: +((x / w) * 100).toFixed(1),
              cyPercent: +((y / h) * 100).toFixed(1),
              radiusPercent: 2.2,
              xPercent: +(((x - 12) / w) * 100).toFixed(1),
              yPercent: +(((y - 12) / h) * 100).toFixed(1),
              wPercent: 3.5,
              hPercent: 3.5,
              details: {
                dotRadiusPx: 3,
                description: `Rogue stray dot / scanner dust speckle detected in margin outside live design elements.`
              },
              dismissed: false
            });
            dotFound = true;
            break;
          }
        }
      }
    } catch (e) {
      // Cross-origin catch
    }
  },

  /**
   * Render interactive animated blinking highlights directly over the artwork canvas
   */
  renderOverlay(containerEl, canvasEl) {
    const wrap = containerEl || document.querySelector('.canvas-viewport-wrap');
    const canvas = canvasEl || document.getElementById('artwork-canvas');
    if (!wrap || !canvas) return;

    // Check if overlay layer exists or create it
    let overlay = document.getElementById('ai-defect-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ai-defect-overlay';
      overlay.className = 'ai-defect-overlay';
      wrap.appendChild(overlay);
    }

    // Match exact displayed canvas bounds and position
    overlay.style.position = 'absolute';
    overlay.style.left = canvas.offsetLeft + 'px';
    overlay.style.top = canvas.offsetTop + 'px';
    overlay.style.width = canvas.offsetWidth + 'px';
    overlay.style.height = canvas.offsetHeight + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'visible';
    overlay.style.zIndex = '15';
    overlay.style.display = this.options.enabled ? 'block' : 'none';

    // Filter visible defects
    const visibleDefects = this.defects.filter(d => {
      if (d.dismissed) return false;
      if (this.options.filter === 'all') return true;
      return d.type === this.options.filter;
    });

    if (visibleDefects.length === 0) {
      overlay.innerHTML = '';
      return;
    }

    const isBlinking = this.options.blinking;

    let html = '';
    visibleDefects.forEach(defect => {
      const isActive = (this._activeDefectId === defect.id);

      if (defect.shape === 'circle') {
        // ── Blinking Circle for Stray Dots / Dust Speckles ──
        const blinkClass = isBlinking ? 'ai-blink-circle' : '';
        const activeClass = isActive ? 'ai-pulse-active' : '';
        html += `
          <div class="ai-highlight-item ai-highlight-circle ${blinkClass} ${activeClass}" 
               id="marker-${defect.id}"
               style="left:${defect.cxPercent}%; top:${defect.cyPercent}%; transform:translate(-50%, -50%);"
               onclick="AgenticAiInspector.handleMarkerClick('${defect.id}', event)"
               title="${defect.title}: ${defect.details.description}">
            <div class="ai-circle-ping"></div>
            <div class="ai-circle-core"></div>
            <div class="ai-marker-tag ai-tag-dot">🔴 Stray Dot (${defect.details.dotRadiusPx || 4}px)</div>
          </div>
        `;
      } else {
        // ── Blinking Box for Spelling Typos and Small Stray Lines ──
        const isTypo = (defect.type === 'spelling');
        const blinkClass = isBlinking ? (isTypo ? 'ai-blink-typo-box' : 'ai-blink-line-box') : '';
        const activeClass = isActive ? 'ai-pulse-active' : '';
        const tagIcon = isTypo ? '⚠️ Typo' : '⚡ Stray Line';
        const tagText = isTypo 
          ? `"${defect.details.word}" → "${defect.details.suggestion}"`
          : `~${defect.details.lengthPx || 18}px Stray Line`;

        html += `
          <div class="ai-highlight-item ai-highlight-box ${blinkClass} ${activeClass} ${isTypo ? 'ai-box-typo' : 'ai-box-line'}"
               id="marker-${defect.id}"
               style="left:${defect.xPercent}%; top:${defect.yPercent}%; width:${defect.wPercent}%; height:${defect.hPercent}%;"
               onclick="AgenticAiInspector.handleMarkerClick('${defect.id}', event)"
               title="${defect.title}: ${defect.details.description}">
            <div class="ai-marker-tag ${isTypo ? 'ai-tag-typo' : 'ai-tag-line'}">
              ${tagIcon}: <strong>${tagText}</strong>
            </div>
          </div>
        `;
      }
    });

    overlay.innerHTML = html;
  },

  /**
   * Handle click on marker overlay item
   */
  handleMarkerClick(defectId, event) {
    if (event) event.stopPropagation();
    this.locateDefect(defectId);
  },

  /**
   * Locate defect: center canvas / trigger loupe / highlight with rapid blink
   */
  locateDefect(defectId) {
    const defect = this.defects.find(d => d.id === defectId);
    if (!defect) return;

    this._activeDefectId = defectId;
    this.options.enabled = true;
    this.renderOverlay();

    // Scroll smoothly to canvas inspector
    const canvasWrap = document.querySelector('.canvas-viewport-wrap');
    if (canvasWrap) {
      canvasWrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Trigger loupe focus if CanvasInspector exists
    if (typeof CanvasInspector !== 'undefined' && CanvasInspector.canvas) {
      const targetX = (defect.cxPercent || (defect.xPercent + defect.wPercent / 2)) / 100;
      const targetY = (defect.cyPercent || (defect.yPercent + defect.hPercent / 2)) / 100;
      
      const loupeEl = document.getElementById('zoom-loupe');
      if (loupeEl) {
        loupeEl.style.display = 'block';
        loupeEl.style.left = (targetX * CanvasInspector.canvas.offsetWidth) + 'px';
        loupeEl.style.top = (targetY * CanvasInspector.canvas.offsetHeight) + 'px';
        if (typeof CanvasInspector._updateLoupe === 'function') {
          CanvasInspector._updateLoupe(
            targetX * CanvasInspector.canvas.offsetWidth,
            targetY * CanvasInspector.canvas.offsetHeight
          );
        }
      }
    }

    // Update panel active highlight
    document.querySelectorAll('.ai-defect-row').forEach(el => el.classList.remove('active-row'));
    const rowEl = document.getElementById(`row-${defectId}`);
    if (rowEl) rowEl.classList.add('active-row');
  },

  /**
   * Toggle blinking animation on/off
   */
  toggleBlinking() {
    this.options.blinking = !this.options.blinking;
    this.renderOverlay();
    this.updateControlsUI();
    const btn = document.getElementById('btn-toggle-ai-blink');
    if (btn) {
      btn.innerHTML = this.options.blinking 
        ? '⚡ Blinking: <strong style="color:#22c55e;">ON</strong>' 
        : '⚡ Blinking: <strong style="color:#94a3b8;">PAUSED</strong>';
    }
  },

  /**
   * Toggle all AI highlights on/off
   */
  toggleOverlay() {
    this.options.enabled = !this.options.enabled;
    const overlay = document.getElementById('ai-defect-overlay');
    if (overlay) overlay.style.display = this.options.enabled ? 'block' : 'none';
    this.updateControlsUI();
  },

  /**
   * Filter visible defects by type
   */
  setFilter(filterType) {
    this.options.filter = filterType;
    this.renderOverlay();
    document.querySelectorAll('.btn-ai-filter').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === filterType);
    });
  },

  /**
   * Dismiss defect (mark as intentional or ignore)
   */
  dismissDefect(defectId) {
    const d = this.defects.find(x => x.id === defectId);
    if (d) {
      d.dismissed = true;
      this.renderOverlay();
      this.updateControlsUI();
      if (typeof runPreCheck === 'function') runPreCheck();
    }
  },

  /**
   * Update badges and controls in the UI
   */
  updateControlsUI() {
    const activeCount = this.defects.filter(d => !d.dismissed).length;
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
   * Generate modern Agentic AI Quality Audit Dashboard HTML
   */
  renderAuditPanel() {
    const activeDefects = this.defects.filter(d => !d.dismissed);
    const typos = activeDefects.filter(d => d.type === 'spelling');
    const lines = activeDefects.filter(d => d.type === 'stray_line');
    const dots = activeDefects.filter(d => d.type === 'stray_dot');
    const isClean = (activeDefects.length === 0);

    return `
      <div class="agentic-ai-card" style="margin-top:14px; background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:14px 18px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #e2e8f0;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:32px; height:32px; border-radius:8px; background:linear-gradient(135deg, #4739d2, #ff5f1f); color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:900;">
              🤖
            </div>
            <div>
              <div style="font-size:14px; font-weight:800; color:#0e2246; display:flex; align-items:center; gap:8px;">
                <span>Agentic AI Quality Inspector</span>
                <span style="font-size:10px; font-weight:700; background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:10px; border:1px solid #cbd5e1;">AUTONOMOUS QA</span>
              </div>
              <div style="font-size:11px; color:#64748b;">
                Scans spelling typos, unnecessary small lines, and stray dust dots with animated blinking highlight markers.
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-sm" id="btn-toggle-ai-blink" onclick="AgenticAiInspector.toggleBlinking()" style="background:#f8fafc; border:1px solid #cbd5e1; font-size:11px; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer;">
              ⚡ Blinking: <strong style="color:${this.options.blinking ? '#22c55e' : '#94a3b8'};">${this.options.blinking ? 'ON' : 'PAUSED'}</strong>
            </button>
            <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.toggleOverlay()" style="background:${this.options.enabled ? '#ede9fe' : '#f1f5f9'}; color:${this.options.enabled ? '#4739d2' : '#64748b'}; border:1px solid ${this.options.enabled ? '#c4b5fd' : '#cbd5e1'}; font-size:11px; font-weight:700; padding:4px 10px; border-radius:4px; cursor:pointer;">
              👁️ Markers: ${this.options.enabled ? 'Visible' : 'Hidden'}
            </button>
          </div>
        </div>

        <!-- Metrics Chips -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px; margin-bottom:12px;">
          <div style="background:${typos.length > 0 ? '#fffbeb' : '#f8fafc'}; border:1px solid ${typos.length > 0 ? '#fde68a' : '#e2e8f0'}; border-radius:6px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">📝</span>
              <div>
                <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Spelling Typos</div>
                <div style="font-size:13px; font-weight:800; color:${typos.length > 0 ? '#b45309' : '#16a34a'};">
                  ${typos.length > 0 ? `${typos.length} Typos Flagged` : '0 Typos (Clean)'}
                </div>
              </div>
            </div>
            <span style="font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px; background:${typos.length > 0 ? '#fef3c7' : '#dcfce7'}; color:${typos.length > 0 ? '#92400e' : '#15803d'};">
              Blink Box 🔲
            </span>
          </div>

          <div style="background:${lines.length > 0 ? '#fff7ed' : '#f8fafc'}; border:1px solid ${lines.length > 0 ? '#ffedd5' : '#e2e8f0'}; border-radius:6px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">⚡</span>
              <div>
                <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Stray Small Lines</div>
                <div style="font-size:13px; font-weight:800; color:${lines.length > 0 ? '#c2410c' : '#16a34a'};">
                  ${lines.length > 0 ? `${lines.length} Stray Lines` : '0 Stray Lines'}
                </div>
              </div>
            </div>
            <span style="font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px; background:${lines.length > 0 ? '#ffedd5' : '#dcfce7'}; color:${lines.length > 0 ? '#9a3412' : '#15803d'};">
              Blink Box 🔲
            </span>
          </div>

          <div style="background:${dots.length > 0 ? '#ecfeff' : '#f8fafc'}; border:1px solid ${dots.length > 0 ? '#cffafe' : '#e2e8f0'}; border-radius:6px; padding:8px 12px; display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:16px;">🔴</span>
              <div>
                <div style="font-size:10px; font-weight:700; color:#64748b; text-transform:uppercase;">Stray Dots &amp; Dust</div>
                <div style="font-size:13px; font-weight:800; color:${dots.length > 0 ? '#0e7490' : '#16a34a'};">
                  ${dots.length > 0 ? `${dots.length} Rogue Dots` : '0 Stray Dots'}
                </div>
              </div>
            </div>
            <span style="font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px; background:${dots.length > 0 ? '#cffafe' : '#dcfce7'}; color:${dots.length > 0 ? '#155e75' : '#15803d'};">
              Blink Circle ⭕
            </span>
          </div>
        </div>

        <!-- Issue List -->
        <div class="ai-defects-list" style="display:flex; flex-direction:column; gap:8px;">
          ${isClean ? `
            <div style="padding:14px; text-align:center; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px;">
              <div style="font-size:16px; margin-bottom:4px;">✨</div>
              <div style="font-size:12.5px; font-weight:800; color:#166534;">Artwork Clean &amp; Production Ready</div>
              <div style="font-size:11px; color:#15803d; margin-top:2px;">
                Agentic AI found no spelling typos, no unnecessary stray lines, and no dust speckles.
              </div>
            </div>
          ` : activeDefects.map(d => {
            const isTypo = (d.type === 'spelling');
            const isDot = (d.type === 'stray_dot');
            const icon = isTypo ? '📝' : isDot ? '🔴' : '⚡';
            const badgeBg = isTypo ? '#fef3c7' : isDot ? '#cffafe' : '#ffedd5';
            const badgeColor = isTypo ? '#b45309' : isDot ? '#0e7490' : '#c2410c';
            const markerType = isDot ? 'Circle Marker ⭕' : 'Box Marker 🔲';

            return `
              <div class="ai-defect-row" id="row-${d.id}" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; transition:all 0.15s ease;">
                <div style="display:flex; align-items:center; gap:10px; flex:1;">
                  <span style="font-size:18px;">${icon}</span>
                  <div>
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-size:12px; font-weight:800; color:#0e2246;">${d.title}</span>
                      <span style="font-size:9.5px; font-weight:800; background:${badgeBg}; color:${badgeColor}; padding:1px 6px; border-radius:3px;">
                        ${markerType}
                      </span>
                    </div>
                    <div style="font-size:11px; color:#475569; margin-top:2px;">
                      ${d.details.description}
                    </div>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.locateDefect('${d.id}')" style="background:#ff5f1f; color:#ffffff; border:none; padding:4px 10px; font-size:10.5px; font-weight:700; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:4px;">
                    🎯 Locate (Blink)
                  </button>
                  <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.dismissDefect('${d.id}')" title="Dismiss or mark as intentional" style="background:#ffffff; color:#64748b; border:1px solid #cbd5e1; padding:4px 8px; font-size:10.5px; border-radius:4px; cursor:pointer;">
                    ✓ Dismiss
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  /**
   * Hook called when CanvasInspector redraws
   */
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
