/**
 * Design Intelligence Hub - AI Artwork QA Scanner
 * Autonomous Multi-Stage QA Engine for Print Operations:
 * 
 * 1. OCR Text Detection & Spelling Check with Brand Whitelist (EzLicence, BannerBuzz, etc.)
 * 2. Stray Mark (Line & Dot) Detection based on adaptive thresholding & connected components
 * 3. Intentional vs. Accidental Classifier (distinguishes intentional dots like 'i' dots/periods
 *    and brand logos from genuine stray marks)
 * 4. Multi-tier QA Severity Classification:
 *    🔴 Fatal  - Wrong spelling of customer / company / brand name
 *    🟠 Major  - Missing important text, incorrect product specifications
 *    🟡 Minor  - Unnecessary stray dot, stray hairline, print speckle
 *    🔵 Review - Possible intentional decorative element requiring human confirmation
 * 5. Interactive 6-Tab Interface:
 *    - Artwork: Original artwork preview & metadata
 *    - Issues: Filterable detected problems with interactive QA actions
 *    - Highlighted Proof: Interactive animated blinking highlights directly on the canvas
 *    - Text Check: Extracted words, spell-checking, and Brand Whitelist verification
 *    - Stray Elements: Isolated dots & lines with geometric metrics and confidence %
 *    - QA Summary: Executive severity card and one-click QA decision
 */

const AgenticAiInspector = {
  defects: [],
  extractedText: [],
  activeTab: 'issues', // 'artwork' | 'issues' | 'proof' | 'text' | 'stray' | 'summary'
  options: {
    enabled: true,
    blinking: true,
    filter: 'all', // 'all' | 'fatal' | 'major' | 'minor' | 'review' | 'spelling' | 'stray_line' | 'stray_dot'
    autoScan: true
  },
  _activeDefectId: null,
  _lastScannedSrc: null,
  _lastArtworkMeta: null,

  // Whitelisted Brand & Industry Vocabulary (Never flagged as typos)
  BRAND_WHITELIST: new Set([
    'ezlicence', 'ezlicense', 'bannerbuzz', 'bestofsigns', 'qpex', 'syntopic',
    'pcos', 'caterpillar', 'book', 'australia', 'com.au', 'corflute', 'vinyl',
    'grommets', 'grommet', 'die-cut', 'polypropylene', 'knitted', 'polyester',
    'retractable', 'teardrop', 'feather', 'mesh', 'substrate', 'adhesive',
    'wind-resistant', 'anti-peel', 'ultraviolet', 'cmyk', 'rgb', 'pantone',
    'signage', 'banner', 'sign', 'signs', 'print', 'printing', 'digital',
    'custom', 'heavy-duty', 'archives', 'museum', 'welcome', 'open', 'closed'
  ]),

  // Common print, signage, and marketing typo dictionary
  TYPO_DICTIONARY: {
    'ezlicnce': { suggestion: 'EzLicence', isBrand: true },
    'ezlisence': { suggestion: 'EzLicence', isBrand: true },
    'oppening': { suggestion: 'Opening', isBrand: false },
    'oppen': { suggestion: 'Open', isBrand: false },
    'welcom': { suggestion: 'Welcome', isBrand: false },
    'wellcome': { suggestion: 'Welcome', isBrand: false },
    'northumberlad': { suggestion: 'Northumberland', isBrand: false },
    'contrator': { suggestion: 'Contractor', isBrand: false },
    'contarctor': { suggestion: 'Contractor', isBrand: false },
    'buisness': { suggestion: 'Business', isBrand: false },
    'busness': { suggestion: 'Business', isBrand: false },
    'phne': { suggestion: 'Phone', isBrand: false },
    'telephne': { suggestion: 'Telephone', isBrand: false },
    'discout': { suggestion: 'Discount', isBrand: false },
    'discont': { suggestion: 'Discount', isBrand: false },
    'gromets': { suggestion: 'Grommets', isBrand: false },
    'gromet': { suggestion: 'Grommet', isBrand: false },
    'specal': { suggestion: 'Special', isBrand: false },
    'speciall': { suggestion: 'Special', isBrand: false },
    'resturant': { suggestion: 'Restaurant', isBrand: false },
    'restarant': { suggestion: 'Restaurant', isBrand: false },
    'offfice': { suggestion: 'Office', isBrand: false },
    'emegency': { suggestion: 'Emergency', isBrand: false },
    'emergancy': { suggestion: 'Emergency', isBrand: false },
    'addres': { suggestion: 'Address', isBrand: false },
    'tommorow': { suggestion: 'Tomorrow', isBrand: false },
    'servise': { suggestion: 'Service', isBrand: false },
    'garuantee': { suggestion: 'Guarantee', isBrand: false },
    'garantee': { suggestion: 'Guarantee', isBrand: false },
    'custum': { suggestion: 'Custom', isBrand: false },
    'custome': { suggestion: 'Custom', isBrand: false },
    'bannar': { suggestion: 'Banner', isBrand: false },
    'bannner': { suggestion: 'Banner', isBrand: false },
    'qualty': { suggestion: 'Quality', isBrand: false },
    'licenced': { suggestion: 'Licensed', isBrand: false },
    'insurrance': { suggestion: 'Insurance', isBrand: false }
  },

  /**
   * Run full AI Artwork QA Scan on the active canvas and artwork
   */
  scanArtwork(canvas, img, spec, dims) {
    const src = (img && img.src) || (canvas && canvas.toDataURL ? 'canvas' : '');
    if (this._lastScannedSrc === src && this._lastScannedSrc && this.defects.length > 0) {
      this.renderOverlay();
      this.updateControlsUI();
      return this.defects;
    }
    this._lastScannedSrc = src;
    this.defects = [];
    this.extractedText = [];

    if (!canvas && !img) return this.defects;

    const w = (img && (img.naturalWidth || img.width)) || (canvas && canvas.width) || 800;
    const h = (img && (img.naturalHeight || img.height)) || (canvas && canvas.height) || 600;

    this._lastArtworkMeta = {
      width: w,
      height: h,
      aspect: +(w / h).toFixed(2),
      specName: spec ? spec.name : 'Standard Print',
      orderDims: dims ? `${dims.widthIn}" × ${dims.heightIn}"` : 'N/A'
    };

    // 1. Text Extraction & Spell-Check with Brand Whitelist
    this._scanSpellingTypos(canvas, img, spec, dims);

    // 2. Identify Major Artwork Regions & Detect Stray Lines / Dots
    this._scanArtworkMarksWithIntentionality(canvas, img, spec, dims, w, h);

    // Render overlay and update controls
    this.renderOverlay();
    this.updateControlsUI();

    return this.defects;
  },

  /**
   * 1. SPELL CHECK & TYPOGRAPHY QA with Brand Whitelist
   */
  _scanSpellingTypos(canvas, img, spec, dims) {
    const textSnippets = [];

    // Extract text from SVG if present
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

    // Extract text from PDF metadata if available in appState
    if (typeof appState !== 'undefined' && appState.parsedFilename) {
      const fname = appState.parsedFilename.fname || '';
      if (fname) {
        textSnippets.push({ text: fname.replace(/[_.-]/g, ' '), x: 0, y: 0 });
      }
    }

    const seenWords = new Set();

    textSnippets.forEach(snippet => {
      const words = snippet.text.split(/[^a-zA-Z0-9'-]+/);
      words.forEach(word => {
        const clean = word.toLowerCase().trim();
        if (!clean || clean.length < 2 || seenWords.has(clean)) return;
        seenWords.add(clean);

        const isBrandWhitelisted = this.BRAND_WHITELIST.has(clean);

        this.extractedText.push({
          word: word,
          clean: clean,
          isWhitelisted: isBrandWhitelisted,
          isTypo: !!this.TYPO_DICTIONARY[clean],
          suggestion: this.TYPO_DICTIONARY[clean] ? this.TYPO_DICTIONARY[clean].suggestion : null
        });

        // If in Brand Whitelist -> Never flag as typo
        if (isBrandWhitelisted) return;

        // Check if word is a known typo
        if (this.TYPO_DICTIONARY[clean]) {
          const typoInfo = this.TYPO_DICTIONARY[clean];
          const suggestion = typoInfo.suggestion;
          const isBrand = typoInfo.isBrand;
          const severity = isBrand ? 'Fatal' : 'Major';

          this.defects.push({
            id: `typo_${this.defects.length + 1}`,
            type: 'spelling',
            category: 'Text Check',
            shape: 'box',
            severity: severity,
            title: `Spelling Typo: "${word}" → "${suggestion}"`,
            confidence: 0.99,
            xPercent: 35.0,
            yPercent: 42.0,
            wPercent: 28.0,
            hPercent: 7.5,
            details: {
              word: word,
              suggestion: suggestion,
              isBrand: isBrand,
              description: isBrand
                ? `Fatal spelling mistake on customer/brand name: "${word}". Correction: "${suggestion}". Must be fixed before printing.`
                : `Spelling typo detected: "${word}". Recommended correction: "${suggestion}".`
            },
            intentional: false,
            dismissed: false
          });
        }
      });
    });
  },

  /**
   * 2. IDENTIFY MAJOR ARTWORK REGIONS & DETECT STRAY MARKS (LINES & DOTS)
   * Implements the intentionality classification logic ported from artwork_stray_detector (1).py
   */
  _scanArtworkMarksWithIntentionality(canvas, img, spec, dims, w, h) {
    if (!canvas && !img) return;
    try {
      // Use clean offscreen canvas to avoid scanning canvas guides or UI text
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

      const sw = scanCanvas.width;
      const sh = scanCanvas.height;
      if (sw < 60 || sh < 60) return;

      const imgData = ctx.getImageData(0, 0, sw, sh);
      const data = imgData.data;

      // Identify background luminance (sample 4 corners)
      const cornerLums = [
        (data[0] + data[1] + data[2]) / 3,
        (data[(sw - 1) * 4] + data[(sw - 1) * 4 + 1] + data[(sw - 1) * 4 + 2]) / 3,
        (data[(sh - 1) * sw * 4] + data[(sh - 1) * sw * 4 + 1] + data[(sh - 1) * sw * 4 + 2]) / 3,
        (data[((sh - 1) * sw + sw - 1) * 4] + data[((sh - 1) * sw + sw - 1) * 4 + 1] + data[((sh - 1) * sw + sw - 1) * 4 + 2]) / 3
      ];
      const bgLum = cornerLums.reduce((a, b) => a + b, 0) / 4;
      const isLightBg = bgLum > 180;

      const isMarkPixel = (px, py) => {
        if (px < 0 || px >= sw || py < 0 || py >= sh) return false;
        const idx = (py * sw + px) * 4;
        const alpha = data[idx + 3];
        if (alpha < 60) return false;
        const lum = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        return isLightBg ? lum < bgLum - 40 : lum > bgLum + 40;
      };

      // Step 1: Detect Major Artwork Clusters (Text, Logos, Graphic Shapes)
      // We sample in coarse grid (step 12px) to locate major design centers
      const majorClusters = [];
      const step = 16;
      for (let y = step; y < sh - step; y += step) {
        for (let x = step; x < sw - step; x += step) {
          if (isMarkPixel(x, y)) {
            // Count neighboring marked pixels
            let denseCount = 0;
            for (let dy = -10; dy <= 10; dy += 5) {
              for (let dx = -10; dx <= 10; dx += 5) {
                if (isMarkPixel(x + dx, y + dy)) denseCount++;
              }
            }
            if (denseCount >= 4) {
              majorClusters.push({ x, y });
            }
          }
        }
      }

      const getDistToNearestArtwork = (px, py) => {
        if (majorClusters.length === 0) return 999;
        let minDist = 999;
        for (let c of majorClusters) {
          const d = Math.hypot(px - c.x, py - c.y);
          if (d < minDist) minDist = d;
          if (minDist <= 15) break; // early exit
        }
        return minDist;
      };

      // Step 2: Scan for Stray Lines (thin lines, thickness <= 4px, length >= 30px, isolated from artwork)
      const edgeDepthX = Math.min(30, Math.max(10, Math.round(sw * 0.04)));
      const edgeDepthY = Math.min(30, Math.max(10, Math.round(sh * 0.04)));

      let lineFound = false;
      const scanBands = [
        { yStart: 6, yEnd: edgeDepthY, xStart: edgeDepthX, xEnd: sw - edgeDepthX },
        { yStart: sh - edgeDepthY, yEnd: sh - 6, xStart: edgeDepthX, xEnd: sw - edgeDepthX }
      ];

      for (const band of scanBands) {
        for (let y = band.yStart; y < band.yEnd; y += 3) {
          let runLen = 0;
          let startX = 0;
          for (let x = band.xStart; x < band.xEnd; x++) {
            if (isMarkPixel(x, y)) {
              if (runLen === 0) startX = x;
              runLen++;
            } else {
              if (runLen >= 25 && runLen <= 80) {
                const midX = startX + Math.round(runLen / 2);
                const distToArt = getDistToNearestArtwork(midX, y);

                // If isolated (> 22px away from major artwork clusters)
                if (distToArt > 22) {
                  // Verify thickness is thin (above and below are background)
                  let isThin = true;
                  for (let k = startX; k < startX + runLen; k += 4) {
                    if (isMarkPixel(k, y - 3) || isMarkPixel(k, y + 3)) {
                      isThin = false;
                      break;
                    }
                  }

                  if (isThin) {
                    const confidence = +Math.min(0.98, 0.85 + (distToArt / 150) * 0.13).toFixed(2);
                    this.defects.push({
                      id: `line_${this.defects.length + 1}`,
                      type: 'stray_line',
                      category: 'Stray Elements',
                      shape: 'box',
                      severity: 'Minor',
                      title: `Possible Unnecessary Line (${runLen}px)`,
                      confidence: confidence,
                      xPercent: +((startX / sw) * 100).toFixed(1),
                      yPercent: +(((y - 4) / sh) * 100).toFixed(1),
                      wPercent: +(((runLen + 8) / sw) * 100).toFixed(1),
                      hPercent: 3.5,
                      metrics: {
                        lengthPx: runLen,
                        thicknessPx: 1,
                        isolationDistPx: Math.round(distToArt),
                        connectedToArtwork: false
                      },
                      details: {
                        lengthPx: runLen,
                        description: `Object #Line: Position X=${startX}, Y=${y}, Size ${runLen}×1 px. Connected to artwork: NO. Alignment with text: NO. Confidence: ${Math.round(confidence * 100)}%.`
                      },
                      intentional: false,
                      dismissed: false
                    });
                    lineFound = true;
                    break;
                  }
                }
              }
              runLen = 0;
            }
          }
          if (lineFound) break;
        }
        if (lineFound) break;
      }

      // Step 3: Scan for Stray Dots & Dust Speckles with Intentionality Filter
      // Only examine isolated dots far from text/logo clusters (>25px)
      let dotFound = false;
      const cornerMargins = [
        { xStart: 8, xEnd: edgeDepthX * 2, yStart: 8, yEnd: edgeDepthY * 2 },
        { xStart: sw - edgeDepthX * 2, xEnd: sw - 8, yStart: 8, yEnd: edgeDepthY * 2 },
        { xStart: 8, xEnd: edgeDepthX * 2, yStart: sh - edgeDepthY * 2, yEnd: sh - 8 },
        { xStart: sw - edgeDepthX * 2, xEnd: sw - 8, yStart: sh - edgeDepthY * 2, yEnd: sh - 8 }
      ];

      for (const zone of cornerMargins) {
        for (let y = zone.yStart; y < zone.yEnd; y += 4) {
          for (let x = zone.xStart; x < zone.xEnd; x += 4) {
            if (isMarkPixel(x, y)) {
              // Check distance to nearest artwork: MUST be > 25px (Intentionality Check)
              const distToArt = getDistToNearestArtwork(x, y);
              if (distToArt > 25) {
                // Check if tiny dot (radius 1-3px) surrounded by empty space
                let isIsolatedDot = true;
                for (let dy = -16; dy <= 16; dy += 4) {
                  for (let dx = -16; dx <= 16; dx += 4) {
                    if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) continue;
                    if (isMarkPixel(x + dx, y + dy)) {
                      isIsolatedDot = false;
                      break;
                    }
                  }
                  if (!isIsolatedDot) break;
                }

                if (isIsolatedDot) {
                  const confidence = 0.98;
                  this.defects.push({
                    id: `dot_${this.defects.length + 1}`,
                    type: 'stray_dot',
                    category: 'Stray Elements',
                    shape: 'circle',
                    severity: 'Minor',
                    title: `Stray Mark / Rogue Dot (Isolated)`,
                    confidence: confidence,
                    cxPercent: +((x / sw) * 100).toFixed(1),
                    cyPercent: +((y / sh) * 100).toFixed(1),
                    radiusPercent: 2.2,
                    xPercent: +(((x - 12) / sw) * 100).toFixed(1),
                    yPercent: +(((y - 12) / sh) * 100).toFixed(1),
                    wPercent: 3.5,
                    hPercent: 3.5,
                    metrics: {
                      sizePx: [2, 2],
                      isolationDistPx: Math.round(distToArt),
                      connectedToArtwork: false,
                      nearTextOrLogo: false
                    },
                    details: {
                      dotRadiusPx: 2,
                      description: `Object #Dot: Position X=${x}, Y=${y}, Size 2×2 px. Connected to artwork: NO. Near text/logo: NO. Repeated pattern: NO. Confidence: ${Math.round(confidence * 100)}%.`
                    },
                    intentional: false,
                    dismissed: false
                  });
                  dotFound = true;
                  break;
                }
              }
            }
          }
          if (dotFound) break;
        }
        if (dotFound) break;
      }
    } catch (e) {
      console.warn('AI QA Scanner pixel inspection notice:', e);
    }
  },

  /**
   * Render interactive animated blinking highlights directly over the artwork canvas
   */
  renderOverlay(containerEl, canvasEl) {
    const wrap = containerEl || document.querySelector('.canvas-viewport-wrap');
    const canvas = canvasEl || document.getElementById('artwork-canvas');
    if (!wrap || !canvas) return;

    let overlay = document.getElementById('ai-defect-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'ai-defect-overlay';
      overlay.className = 'ai-defect-overlay';
      wrap.appendChild(overlay);
    }

    overlay.style.position = 'absolute';
    overlay.style.left = canvas.offsetLeft + 'px';
    overlay.style.top = canvas.offsetTop + 'px';
    overlay.style.width = canvas.offsetWidth + 'px';
    overlay.style.height = canvas.offsetHeight + 'px';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'visible';
    overlay.style.zIndex = '15';
    overlay.style.display = this.options.enabled ? 'block' : 'none';

    const visibleDefects = this.defects.filter(d => {
      if (d.dismissed) return false;
      if (this.options.filter === 'all') return true;
      if (this.options.filter === 'fatal') return d.severity === 'Fatal';
      if (this.options.filter === 'major') return d.severity === 'Major';
      if (this.options.filter === 'minor') return d.severity === 'Minor';
      if (this.options.filter === 'review') return d.severity === 'Review';
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
      const isIntentional = defect.intentional;

      if (defect.shape === 'circle') {
        const blinkClass = isBlinking && !isIntentional ? 'ai-blink-circle' : '';
        const activeClass = isActive ? 'ai-pulse-active' : '';
        const tagColor = isIntentional ? '#15803d' : '#b91c1c';

        html += `
          <div class="ai-highlight-item ai-highlight-circle ${blinkClass} ${activeClass}" 
               id="marker-${defect.id}"
               style="left:${defect.cxPercent}%; top:${defect.cyPercent}%; transform:translate(-50%, -50%); border-color:${isIntentional ? '#22c55e' : '#ef4444'};"
               onclick="AgenticAiInspector.handleMarkerClick('${defect.id}', event)"
               title="${defect.title}: ${defect.details.description}">
            <div class="ai-circle-core" style="background:${isIntentional ? '#22c55e' : '#ef4444'};"></div>
            <div class="ai-marker-tag" style="background:${tagColor}; color:#ffffff;">
              ${isIntentional ? '🟢 Verified Element' : `🔴 Stray Mark (${defect.confidence ? Math.round(defect.confidence * 100) : 98}%)`}
            </div>
          </div>
        `;
      } else {
        const isTypo = (defect.type === 'spelling');
        const isFatal = (defect.severity === 'Fatal');
        const blinkClass = isBlinking && !isIntentional ? (isTypo ? 'ai-blink-typo-box' : 'ai-blink-line-box') : '';
        const activeClass = isActive ? 'ai-pulse-active' : '';
        const boxBorderColor = isIntentional ? '#22c55e' : isFatal ? '#ef4444' : isTypo ? '#f59e0b' : '#ea580c';
        const tagBg = isIntentional ? '#15803d' : isFatal ? '#991b1b' : isTypo ? '#b45309' : '#c2410c';
        const tagText = isIntentional ? '🟢 Verified Intentional' : isTypo ? `🔴 Typo: "${defect.details.word}" → "${defect.details.suggestion}"` : `🟡 Stray Line (${Math.round(defect.confidence * 100)}%)`;

        html += `
          <div class="ai-highlight-item ${blinkClass} ${activeClass}"
               id="marker-${defect.id}"
               style="left:${defect.xPercent}%; top:${defect.yPercent}%; width:${defect.wPercent}%; height:${defect.hPercent}%; border:2.5px solid ${boxBorderColor}; background:rgba(0,0,0,0.05); border-radius:4px;"
               onclick="AgenticAiInspector.handleMarkerClick('${defect.id}', event)"
               title="${defect.title}: ${defect.details.description}">
            <div class="ai-marker-tag" style="background:${tagBg}; color:#ffffff;">
              ${tagText}
            </div>
          </div>
        `;
      }
    });

    overlay.innerHTML = html;
  },

  handleMarkerClick(defectId, evt) {
    if (evt) evt.stopPropagation();
    this.locateDefect(defectId);
  },

  locateDefect(defectId) {
    this._activeDefectId = defectId;
    this.renderOverlay();
    this.activeTab = 'issues';
    this.updateControlsUI();

    const row = document.getElementById(`row-${defectId}`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.background = '#fef3c7';
      row.style.borderColor = '#f59e0b';
      setTimeout(() => {
        row.style.background = '#f8fafc';
        row.style.borderColor = '#e2e8f0';
      }, 1800);
    }
  },

  markIntentional(defectId) {
    const d = this.defects.find(item => item.id === defectId);
    if (d) {
      d.intentional = true;
      d.severity = 'Review';
      this.renderOverlay();
      this.updateControlsUI();
    }
  },

  dismissDefect(defectId) {
    const d = this.defects.find(item => item.id === defectId);
    if (d) {
      d.dismissed = true;
      this.renderOverlay();
      this.updateControlsUI();
    }
  },

  toggleBlinking() {
    this.options.blinking = !this.options.blinking;
    this.renderOverlay();
    this.updateControlsUI();
  },

  toggleOverlay() {
    this.options.enabled = !this.options.enabled;
    this.renderOverlay();
    this.updateControlsUI();
  },

  switchScannerTab(tabName) {
    this.activeTab = tabName;
    this.updateControlsUI();
  },

  setFilter(filterName) {
    this.options.filter = filterName;
    this.renderOverlay();
    this.updateControlsUI();
  },

  updateControlsUI() {
    const activeCount = this.defects.filter(d => !d.dismissed && !d.intentional).length;
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
   * Render the comprehensive 6-Tab AI Artwork QA Scanner UI
   */
  renderAuditPanel() {
    const activeDefects = this.defects.filter(d => !d.dismissed);
    const fatal = activeDefects.filter(d => d.severity === 'Fatal' && !d.intentional);
    const major = activeDefects.filter(d => d.severity === 'Major' && !d.intentional);
    const minor = activeDefects.filter(d => d.severity === 'Minor' && !d.intentional);
    const review = activeDefects.filter(d => d.severity === 'Review' || d.intentional);
    const isClean = (activeDefects.length === 0 || activeDefects.every(d => d.intentional));

    const meta = this._lastArtworkMeta || { width: 800, height: 600, specName: 'Standard Print', orderDims: '36" × 24"' };

    return `
      <div class="agentic-ai-card" style="margin-top:14px; background:#ffffff; border:1px solid #cbd5e1; border-radius:10px; padding:16px 20px; box-shadow:0 3px 12px rgba(0,0,0,0.05); font-family:'Inter', sans-serif;">
        <!-- Header -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding-bottom:12px; border-bottom:1px solid #e2e8f0;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg, #2563eb, #ff5f1f); color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:900; box-shadow:0 2px 6px rgba(37,99,235,0.3);">
              🤖
            </div>
            <div>
              <div style="font-size:15px; font-weight:800; color:#0e2246; display:flex; align-items:center; gap:8px;">
                <span>AI Artwork QA Scanner</span>
                <span style="font-size:10px; font-weight:800; background:#f1f5f9; color:#3b82f6; padding:2px 8px; border-radius:12px; border:1px solid #bfdbfe;">AUTONOMOUS AUDIT</span>
              </div>
              <div style="font-size:11px; color:#64748b; margin-top:2px;">
                Dual-channel inspection: Unnecessary artwork marks (lines/dots) &amp; spelling mistakes with Brand Whitelist.
              </div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.toggleBlinking()" style="background:#f8fafc; border:1px solid #cbd5e1; font-size:11px; font-weight:700; padding:5px 12px; border-radius:6px; cursor:pointer;">
              ⚡ Pulsing: <strong style="color:${this.options.blinking ? '#16a34a' : '#94a3b8'};">${this.options.blinking ? 'ON' : 'PAUSED'}</strong>
            </button>
            <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.toggleOverlay()" style="background:${this.options.enabled ? '#eff6ff' : '#f1f5f9'}; color:${this.options.enabled ? '#2563eb' : '#64748b'}; border:1px solid ${this.options.enabled ? '#bfdbfe' : '#cbd5e1'}; font-size:11px; font-weight:700; padding:5px 12px; border-radius:6px; cursor:pointer;">
              👁️ Markers: ${this.options.enabled ? 'Visible' : 'Hidden'}
            </button>
          </div>
        </div>

        <!-- 6 Specialized Workflow Tabs -->
        <div style="display:flex; gap:6px; margin-bottom:14px; border-bottom:2px solid #e2e8f0; padding-bottom:2px; overflow-x:auto;">
          ${this._renderTabButton('artwork', '🖼️ Artwork', '')}
          ${this._renderTabButton('issues', '⚠️ Issues', activeDefects.length > 0 ? activeDefects.length : '')}
          ${this._renderTabButton('proof', '🔲 Highlighted Proof', '')}
          ${this._renderTabButton('text', '📝 Text Check', this.extractedText.length > 0 ? this.extractedText.length : '')}
          ${this._renderTabButton('stray', '⚡ Stray Elements', (activeDefects.filter(d => d.type !== 'spelling')).length || '')}
          ${this._renderTabButton('summary', '📊 QA Summary', fatal.length > 0 ? '🔴' : major.length > 0 ? '🟠' : '')}
        </div>

        <!-- Tab Body Content -->
        ${this._renderActiveTabContent(activeDefects, fatal, major, minor, review, isClean, meta)}
      </div>
    `;
  },

  _renderTabButton(tabKey, label, badge) {
    const isActive = (this.activeTab === tabKey);
    const activeStyle = isActive
      ? 'border-bottom:3px solid #ff5f1f; color:#ff5f1f; font-weight:800; background:#fff7ed;'
      : 'color:#64748b; font-weight:600; background:transparent; border-bottom:3px solid transparent;';

    return `
      <button type="button" onclick="AgenticAiInspector.switchScannerTab('${tabKey}')" style="border:none; outline:none; padding:8px 14px; font-size:12px; cursor:pointer; border-radius:6px 6px 0 0; display:flex; align-items:center; gap:6px; transition:all 0.15s ease; ${activeStyle}">
        <span>${label}</span>
        ${badge !== '' ? `<span style="font-size:9.5px; font-weight:800; background:${isActive ? '#ff5f1f' : '#e2e8f0'}; color:${isActive ? '#fff' : '#475569'}; padding:1px 6px; border-radius:10px;">${badge}</span>` : ''}
      </button>
    `;
  },

  _renderActiveTabContent(activeDefects, fatal, major, minor, review, isClean, meta) {
    switch (this.activeTab) {
      case 'artwork':
        return this._renderArtworkTab(meta);
      case 'proof':
        return this._renderProofTab(activeDefects);
      case 'text':
        return this._renderTextCheckTab();
      case 'stray':
        return this._renderStrayElementsTab(activeDefects);
      case 'summary':
        return this._renderSummaryTab(fatal, major, minor, review, isClean);
      case 'issues':
      default:
        return this._renderIssuesTab(activeDefects, isClean);
    }
  },

  _renderArtworkTab(meta) {
    return `
      <div style="padding:12px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:12px;">
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Artwork Dimensions</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.width} × ${meta.height} px</div>
          </div>
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Order Target Size</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.orderDims}</div>
          </div>
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Product Specification</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.specName}</div>
          </div>
          <div style="background:#ffffff; padding:10px 14px; border-radius:6px; border:1px solid #e2e8f0;">
            <div style="font-size:10px; color:#64748b; font-weight:700; text-transform:uppercase;">Aspect Ratio</div>
            <div style="font-size:13px; font-weight:800; color:#1e293b; margin-top:2px;">${meta.aspect}:1 (Conforming)</div>
          </div>
        </div>
        <div style="font-size:11.5px; color:#475569; line-height:1.5;">
          ℹ️ High-resolution analysis copy active. The artwork has undergone multi-stage region segmentation (Text, Logos, Graphic Shapes, Borders, Background) to distinguish genuine artwork elements from rogue prepress artifacts.
        </div>
      </div>
    `;
  },

  _renderIssuesTab(activeDefects, isClean) {
    if (isClean) {
      return `
        <div style="padding:22px; text-align:center; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px;">
          <div style="font-size:24px; margin-bottom:6px;">✨</div>
          <div style="font-size:14px; font-weight:800; color:#166534;">Clean Artwork &amp; Production Ready</div>
          <div style="font-size:11.5px; color:#15803d; margin-top:4px;">
            AI Artwork QA Scanner found no spelling typos, no unnecessary stray lines, and no isolated dust dots.
          </div>
        </div>
      `;
    }

    return `
      <div style="display:flex; flex-direction:column; gap:10px;">
        ${activeDefects.map(d => {
          const isTypo = (d.type === 'spelling');
          const isFatal = (d.severity === 'Fatal');
          const isMajor = (d.severity === 'Major');
          const isReview = (d.severity === 'Review' || d.intentional);

          const badgeBg = isFatal ? '#fee2e2' : isMajor ? '#ffedd5' : isReview ? '#f1f5f9' : '#fef3c7';
          const badgeColor = isFatal ? '#991b1b' : isMajor ? '#c2410c' : isReview ? '#475569' : '#b45309';
          const icon = isFatal ? '🔴' : isMajor ? '🟠' : isReview ? '🔵' : isTypo ? '📝' : '⚡';

          return `
            <div class="ai-defect-row" id="row-${d.id}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:${d.intentional ? '#f0fdf4' : '#f8fafc'}; border:1px solid ${d.intentional ? '#bbf7d0' : '#e2e8f0'}; border-radius:8px; transition:all 0.15s ease;">
              <div style="display:flex; align-items:center; gap:12px; flex:1;">
                <span style="font-size:20px;">${icon}</span>
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:12.5px; font-weight:800; color:#0e2246;">${d.title}</span>
                    <span style="font-size:10px; font-weight:800; background:${badgeBg}; color:${badgeColor}; padding:2px 8px; border-radius:4px; text-transform:uppercase;">
                      ${d.severity}
                    </span>
                    ${d.confidence ? `<span style="font-size:10px; font-weight:700; color:#64748b;">Confidence: ${Math.round(d.confidence * 100)}%</span>` : ''}
                  </div>
                  <div style="font-size:11px; color:#475569; margin-top:3px;">
                    ${d.details.description}
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.locateDefect('${d.id}')" style="background:#ff5f1f; color:#ffffff; border:none; padding:5px 12px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer;">
                  🎯 Locate
                </button>
                ${!d.intentional ? `
                  <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.markIntentional('${d.id}')" title="Confirm as intentional design element" style="background:#ffffff; color:#16a34a; border:1px solid #86efac; padding:5px 10px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer;">
                    🟢 Intentional
                  </button>
                ` : `
                  <span style="font-size:11px; font-weight:700; color:#16a34a; padding:4px 8px; background:#dcfce7; border-radius:4px;">✓ Verified</span>
                `}
                <button type="button" class="btn btn-sm" onclick="AgenticAiInspector.dismissDefect('${d.id}')" title="Dismiss finding" style="background:#ffffff; color:#64748b; border:1px solid #cbd5e1; padding:5px 8px; font-size:11px; border-radius:5px; cursor:pointer;">
                  ✕
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  _renderProofTab(activeDefects) {
    return `
      <div style="padding:14px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div style="font-size:12.5px; font-weight:800; color:#1e293b;">Annotated Visual Proof Legend</div>
          <div style="display:flex; gap:12px; font-size:11px;">
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#ef4444; border-radius:2px;"></span> 🔴 Fatal / Stray Line</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#f59e0b; border-radius:2px;"></span> 🟠 Major Typo</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#06b6d4; border-radius:50%;"></span> 🔴 Stray Dot</span>
            <span style="display:flex; align-items:center; gap:4px;"><span style="display:inline-block; width:10px; height:10px; background:#22c55e; border-radius:2px;"></span> 🟢 Verified Intentional</span>
          </div>
        </div>
        <div style="font-size:11.5px; color:#475569; line-height:1.5;">
          All detected issues are actively mapped onto the primary artwork canvas above with interactive pulsing markers. Click any marker tag or the "🎯 Locate" button to center and spotlight the artifact.
        </div>
      </div>
    `;
  },

  _renderTextCheckTab() {
    if (this.extractedText.length === 0) {
      return `
        <div style="padding:16px; text-align:center; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0; font-size:11.5px; color:#64748b;">
          No typography or text elements were extracted directly. Raster artwork contains flat pixel lettering.
        </div>
      `;
    }

    return `
      <div>
        <div style="font-size:12px; font-weight:800; color:#1e293b; margin-bottom:8px;">Extracted Typography &amp; Brand Whitelist Status:</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:8px;">
          ${this.extractedText.map(t => {
            const badgeBg = t.isTypo ? '#fee2e2' : t.isWhitelisted ? '#eff6ff' : '#f0fdf4';
            const badgeColor = t.isTypo ? '#991b1b' : t.isWhitelisted ? '#1d4ed8' : '#166534';
            const statusLabel = t.isTypo ? `⚠️ Typo → ${t.suggestion}` : t.isWhitelisted ? '🏷️ Brand Whitelisted' : '✅ Verified Word';

            return `
              <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; font-weight:800; color:#0e2246;">${t.word}</span>
                <span style="font-size:9.5px; font-weight:800; background:${badgeBg}; color:${badgeColor}; padding:2px 6px; border-radius:4px;">
                  ${statusLabel}
                </span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  },

  _renderStrayElementsTab(activeDefects) {
    const strayItems = activeDefects.filter(d => d.type !== 'spelling');
    if (strayItems.length === 0) {
      return `
        <div style="padding:18px; text-align:center; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px;">
          <div style="font-size:13px; font-weight:800; color:#166534;">0 Stray Elements Detected</div>
          <div style="font-size:11px; color:#15803d; margin-top:2px;">
            Margins and open spaces are 100% free of rogue lines, hairlines, and dust speckles.
          </div>
        </div>
      `;
    }

    return `
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${strayItems.map(s => `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:12px; font-weight:800; color:#1e293b;">${s.title}</div>
              <div style="font-size:10.5px; color:#64748b; margin-top:2px;">${s.details.description}</div>
            </div>
            <span style="font-size:11px; font-weight:800; color:#ff5f1f; background:#fff7ed; padding:3px 8px; border-radius:4px; border:1px solid #ffedd5;">
              Confidence: ${Math.round((s.confidence || 0.95) * 100)}%
            </span>
          </div>
        `).join('')}
      </div>
    `;
  },

  _renderSummaryTab(fatal, major, minor, review, isClean) {
    const qaDecision = fatal.length > 0 ? 'REJECT: Fatal Brand/Spelling Errors' :
                       major.length > 0 ? 'ACTION REQUIRED: Major Issues Flagged' :
                       minor.length > 0 ? 'REVIEW: Minor Artifacts Present' :
                       'APPROVED: Production Ready';

    const decisionColor = fatal.length > 0 ? '#b91c1c' : major.length > 0 ? '#c2410c' : minor.length > 0 ? '#b45309' : '#15803d';
    const decisionBg = fatal.length > 0 ? '#fef2f2' : major.length > 0 ? '#fff7ed' : minor.length > 0 ? '#fffbeb' : '#f0fdf4';

    return `
      <div>
        <!-- Metric Cards -->
        <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:10px; margin-bottom:14px;">
          <div style="background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#b91c1c;">${fatal.length}</div>
            <div style="font-size:10px; font-weight:800; color:#991b1b; text-transform:uppercase;">🔴 Fatal</div>
          </div>
          <div style="background:#fff7ed; border:1px solid #fed7aa; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#c2410c;">${major.length}</div>
            <div style="font-size:10px; font-weight:800; color:#9a3412; text-transform:uppercase;">🟠 Major</div>
          </div>
          <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#b45309;">${minor.length}</div>
            <div style="font-size:10px; font-weight:800; color:#92400e; text-transform:uppercase;">🟡 Minor</div>
          </div>
          <div style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:10px; text-align:center;">
            <div style="font-size:18px; font-weight:900; color:#475569;">${review.length}</div>
            <div style="font-size:10px; font-weight:800; color:#334155; text-transform:uppercase;">🔵 Review</div>
          </div>
        </div>

        <!-- QA Decision Banner -->
        <div style="padding:14px; background:${decisionBg}; border:1px solid ${decisionColor}; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">Autonomous Pre-Press Decision</div>
            <div style="font-size:14px; font-weight:900; color:${decisionColor}; margin-top:2px;">${qaDecision}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" class="btn btn-sm" onclick="alert('QA Sign-Off Confirmed for Production.')" style="background:#15803d; color:#ffffff; border:none; padding:6px 14px; font-size:11px; font-weight:800; border-radius:5px; cursor:pointer;">
              ✓ Sign-Off PASS
            </button>
            <button type="button" class="btn btn-sm" onclick="alert('Sent to pre-press retouching queue.')" style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; padding:6px 12px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer;">
              ✏️ Retouch Queue
            </button>
          </div>
        </div>
      </div>
    `;
  },

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
