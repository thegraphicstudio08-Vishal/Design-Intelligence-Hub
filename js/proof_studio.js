/**
 * Design Intelligence Hub - Single Consolidated Customer Proof Studio
 * Replicates the exact visual layout and components of BannerBuzz official proof: "BB Proof.png"
 * Sourced directly from Design Projects brief & BB Proof.png:
 * 1. Top Brand Header with BannerBuzz Logo + 4 Trust Badges (Custom Printed, Premium Quality, Fast Shipping, Dedicated Support)
 * 2. Customer Artwork Proof Banner (Order No., Product Name, Confirmation Badge)
 * 3. Section 1: Entire Artwork Proof (Numbered Circle 1)
 * 4. Section 2: Dynamic Multi-Slot Proofing (Template Overlay / 3D Mockup / 100% Zoom Crop, Numbered Circle 2)
 * 5. Section 3: Product Specifications Matrix (Numbered Circle 3)
 * 6. Bottom Review & Approval Callout with "Approve Artwork" Button
 * 7. Official Customer Service Footer (Phone, Email, Web, Page 1 of 1, Order No., Date)
 */

const ProofStudio = {
  slots: {
    overall: null,   // Artwork flat view
    template: null,  // Optional template / die-line
    mockup: null,    // 3D physical mockup
    crop: null       // Optional custom uploaded crop shot
  },

  options: {
    printPreview: 'auto', // Proof 03 print preview screenshot: 'auto' (SOP: only for low resolution) / true / false
    showTemplate: 'auto', // Proof 02 template section: 'auto' (template-based products) / true / false
    colourSection: 'auto', // Colour preview screen vs print: 'auto' (bright RGB / merge / opacity found) / true / false
    cropX: null,          // Default null -> dynamically centered based on product orientation
    cropY: null,          // Default null -> dynamically centered based on product orientation
    cropZoomManual: null, // Optional manual override, default null (uses SOP auto calculation)
    includeSpecs: true,
    includeApproval: true
  },

  _lastOrderData: null,
  _lastTargetId: null,
  _boundCropMouseMove: null,
  _boundCropMouseUp: null,

  setSlot(key, fileOrDataUrl, name) {
    if (this.slots[key] !== undefined) {
      this.slots[key] = {
        dataUrl: fileOrDataUrl,
        name: name || key
      };
    }
  },

  clearSlot(key) {
    if (this.slots[key] !== undefined) {
      this.slots[key] = null;
    }
  },

  // Kept for older buttons / callers: 'crop' adds the print preview screenshot, 'mockup' the template section
  setSection2View(mode) {
    if (mode === 'crop') this.setPrintPreview(true);
    else this.setTemplateSection(true);
  },

  setLayoutMode(mode) {
    this.setPrintPreview(mode !== 'multislot');
  },

  setCropZoom(zoom) {
    this.options.cropZoomManual = zoom ? parseFloat(zoom) : null;
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  setCropFocus(xPercent, yPercent) {
    this.options.cropX = Math.max(0, Math.min(100, xPercent));
    this.options.cropY = Math.max(0, Math.min(100, yPercent));
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  /**
   * Calculate exact Photoshop Print Size zoom scale per BannerBuzz SOP:
   * Calibrated with Photoshop Preferences (Screen Resolution = 143 PPI, Print SOP = 125 PPI)
   * Rule (SOP Banner ISO 2026 slide 8 · PR-DPO-03 Rev 15):
   * - Longest side over 120" (72 ppi files): 100% zoom (scale ratio 1.0)
   * - Otherwise: Photoshop "Print size" — 114.4% (scale ratio 143/125 = 1.144)
   * Converts physical print inches to screen CSS pixels at standard 96 PPI.
   */
  calculateCropScale(printW, printH, spec) {
    let w = parseFloat(printW) || 36;
    let h = parseFloat(printH) || 24;

    // If template has specific bleed dimensions (e.g. Desk Flags Blade [6.74, 17.71]):
    if (spec?.bleed && Array.isArray(spec.bleed) && spec.bleed.length >= 2) {
      w = spec.bleed[0];
      h = spec.bleed[1];
    }

    // SOP Banner (ISO 2026) slide 8 / PR-DPO-03: screenshot at 100% zoom for 72 ppi files (over 120"),
    // Photoshop "Print size" for the rest (114.4% = 143 PPI laptop screen / 125 PPI print)
    const isLarge = Math.max(w, h) > 120;
    const isBoth72 = isLarge;                     // kept for older callers
    let sopScale = isLarge ? 1.0 : 1.144;
    let percentText = isLarge ? '100%' : '114.4%';
    let badgeText = isLarge ? '100% ZOOM · 72 PPI FILE' : 'PRINT SIZE · 114.4%';
    let buttonText = isLarge ? '🔍 Print preview (100%)' : '🔍 Print preview (print size)';
    let subtitleDetail = isLarge ? '100% zoom' : 'actual print size';
    let modeText = isLarge
      ? 'Screenshot at 100% zoom (72 ppi file, over 120")'
      : 'Screenshot at Photoshop Print Size (114.4% at 143 PPI screen)';
    let ruleText = isLarge ? 'Over 120": 100% zoom' : 'Up to 120": print size';

    if (this.options.cropZoomManual) {
      sopScale = this.options.cropZoomManual;
      percentText = `${Math.round(sopScale * 100)}%`;
      badgeText = `MANUAL ${percentText} CROP`;
      buttonText = `🔍 Crop Shot (${percentText})`;
      subtitleDetail = `Manual Scale Inspection (${percentText})`;
      modeText = `Manual Scale Inspection (${percentText}) · SOP Verified`;
      ruleText = `Manual: ${percentText}`;
    }

    // 96 CSS pixels per inch
    const physicalW = Math.round(w * 96 * sopScale);
    const physicalH = Math.round(h * 96 * sopScale);

    return {
      sopScale,
      percentText,
      badgeText,
      buttonText,
      subtitleDetail,
      modeText,
      ruleText,
      isBoth72,
      isLarge,
      physicalW,
      physicalH,
      minDim: Math.min(w, h),
      maxDim: Math.max(w, h),
      w,
      h
    };
  },

  /**
   * Pixel size of the artwork image (cached per image). The crop shot must keep the artwork's own
   * proportions — sizing it to the order's width × height stretches it whenever the two differ.
   * Returns null while an image is still loading; onReady is called once its size is known.
   */
  _artworkSize(src, onReady) {
    if (!src) return null;
    const key = src.length + ':' + src.slice(0, 80) + src.slice(-80);
    this._sizeCache = this._sizeCache || {};
    if (this._sizeCache[key]) return this._sizeCache[key];
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector.currentImg : null;
    if (ci && ci.src === src && ci.naturalWidth > 0) {
      return (this._sizeCache[key] = { w: ci.naturalWidth, h: ci.naturalHeight, img: ci });
    }
    if (this._sizeLoading !== key) {
      this._sizeLoading = key;
      const im = new Image();
      im.onload = () => {
        this._sizeLoading = null;
        if (im.naturalWidth > 0 && im.naturalHeight > 0) {
          this._sizeCache[key] = { w: im.naturalWidth, h: im.naturalHeight, img: im };
          if (onReady) onReady();
        }
      };
      im.onerror = () => { this._sizeLoading = null; };
      im.src = src;
    }
    return null;
  },

  /**
   * The artwork turned the way the designer turned it on the canvas (preview for the customer), cached.
   * Only for the customer's own artwork shown on the canvas — never for a designer-uploaded custom slot.
   */
  _turnedArtwork(src) {
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector : null;
    const angle = ci ? ci.currentRotation : 0;
    const img = ci ? ci.currentImg : null;
    if (!angle || !src || this.slots.overall?.isCustom || !img || img.src !== src || !img.naturalWidth) return { src, angle: 0 };
    const key = src.length + ':' + src.slice(-64) + ':' + angle;
    if (this._turnCache && this._turnCache.key === key) return { src: this._turnCache.url, angle };
    const k = Math.min(1, 6000 / Math.max(img.naturalWidth, img.naturalHeight));   // keep it quick for huge files
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const side = angle % 180 !== 0;
    const cv = document.createElement('canvas');
    cv.width = side ? h : w;
    cv.height = side ? w : h;
    const ctx = cv.getContext('2d');
    ctx.translate(cv.width / 2, cv.height / 2);
    ctx.rotate(angle * Math.PI / 180);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    let url;
    try { url = cv.toDataURL(/^data:image\/(png|svg)/i.test(src) ? 'image/png' : 'image/jpeg', 0.92); } catch (e) { return { src, angle: 0 }; }
    this._turnCache = { key, url };
    return { src: url, angle };
  },

  /**
   * Which proofs this order needs — PR-DPO-03 Rev 15 · 2. Proof Process:
   *  Proof 01 small size proof (always) · Proof 02 template based proof (template products) ·
   *  Proof 03 print preview screenshot ONLY for low-resolution artwork or a print-quality concern.
   * The designer can still switch the print preview / template section on or off; a new artwork resets that.
   */
  _proofPlan(spec, analysis, artworkSrc) {
    const key = (artworkSrc || '').length + ':' + (artworkSrc || '').slice(-40);
    if (this._planKey !== key) { this._planKey = key; this.options.printPreview = 'auto'; this.options.showTemplate = 'auto'; this.options.colourSection = 'auto'; }
    const rep = (typeof appState !== 'undefined' && appState.report) ? appState.report : null;
    const pp = rep && Array.isArray(rep.checks) ? rep.checks.find(c => c.id === 'proofPlan') : null;
    const resConcern = pp && pp.resConcern ? pp.resConcern : null;
    const pv = this.options.printPreview;
    const templateBased = typeof SopRules !== 'undefined' ? SopRules.isTemplateBased(spec, analysis) : false;
    const tv = this.options.showTemplate;
    const plan = {
      resConcern,
      autoPreview: !!resConcern,
      showPrintPreview: pv === 'auto' || pv === undefined ? !!resConcern : !!pv,
      previewOverride: !(pv === 'auto' || pv === undefined),
      templateBased,
      // auto: template products, or whenever the designer uploaded a template / mockup of their own
      showTemplate: tv === 'auto' || tv === undefined
        ? templateBased || !!(this.slots.template?.isCustom || this.slots.mockup?.isCustom) : !!tv
    };
    this._lastPlan = plan;
    return plan;
  },

  /** Designer switch for Proof 03 (sidebar check box): on / off; 'auto' follows the SOP rule */
  setPrintPreview(on) {
    this.options.printPreview = on;
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  setTemplateSection(on) {
    this.options.showTemplate = on;
    this.refreshCurrentProof();
  },

  /** Designer switch for the colour preview section (screen RGB vs print CMYK); 'auto' follows the colour check */
  setColourSection(on) {
    this.options.colourSection = on;
    this.refreshCurrentProof();
  },

  /**
   * Proof 01 artwork with the customer's custom finishing marked (SOP Banner slide 8: "If any custom requirement
   * — custom grommet, pole pocket — highlight it to the customer"): pole pocket bands and custom grommet positions.
   * Standard all-round grommets and hems are not customer choices and are not drawn. RGB JPEG, cached.
   */
  _finishingHighlight(src, spec, analysis, W, H, onReady) {
    if (typeof SopRules === 'undefined' || !src || SopRules.family(spec, analysis) !== 'banner') return null;
    const fin = SopRules.bannerFinishing(analysis);
    if (!fin.found) return null;
    const lay = SopRules.bannerLayout({ widthIn: W, heightIn: H }, fin);
    const pockets = lay.pocketSides;
    const g = lay.grommets && lay.grommets.where !== 'all' ? lay.grommets : null;
    if (!pockets.length && !g) return null;
    const key = [src.length, src.slice(-40), W, H, pockets.join(','), g ? g.where : ''].join('|');
    if (this._hlCache && this._hlCache.key === key) return this._hlCache;
    const size = this._artworkSize(src, onReady);
    if (!size || !size.img) return null;
    const k = 1400 / Math.max(W, H);                                  // px per inch
    const a = lay.allow, aL = pockets.includes('left') ? a.left : 0, aR = pockets.includes('right') ? a.right : 0;
    const aT = pockets.includes('top') ? a.top : 0, aB = pockets.includes('bottom') ? a.bottom : 0;
    const cv = document.createElement('canvas');
    cv.width = Math.round((W + aL + aR) * k);
    cv.height = Math.round((H + aT + aB) * k);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    const fx = aL * k, fy = aT * k, fw = W * k, fh = H * k;
    const s = Math.min(fw / size.w, fh / size.h);
    ctx.drawImage(size.img, fx + (fw - size.w * s) / 2, fy + (fh - size.h * s) / 2, size.w * s, size.h * s);
    const font = px => `bold ${Math.round(px)}px Inter, Arial, sans-serif`;
    pockets.forEach(side => {
      const r = side === 'top' ? [0, 0, cv.width, fy] : side === 'bottom' ? [0, fy + fh, cv.width, cv.height - fy - fh]
        : side === 'left' ? [0, fy, fx, fh] : [fx + fw, fy, cv.width - fx - fw, fh];
      ctx.fillStyle = '#dbeafe'; ctx.fillRect(r[0], r[1], r[2], r[3]);
      ctx.setLineDash([12, 8]); ctx.lineWidth = 3; ctx.strokeStyle = '#2563eb';
      ctx.beginPath();
      if (side === 'top') { ctx.moveTo(fx, fy); ctx.lineTo(fx + fw, fy); }
      if (side === 'bottom') { ctx.moveTo(fx, fy + fh); ctx.lineTo(fx + fw, fy + fh); }
      if (side === 'left') { ctx.moveTo(fx, fy); ctx.lineTo(fx, fy + fh); }
      if (side === 'right') { ctx.moveTo(fx + fw, fy); ctx.lineTo(fx + fw, fy + fh); }
      ctx.stroke(); ctx.setLineDash([]);
      const thick = side === 'top' || side === 'bottom' ? r[3] : r[2];
      ctx.save();
      ctx.fillStyle = '#1e40af'; ctx.font = font(Math.max(14, thick * 0.42)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(r[0] + r[2] / 2, r[1] + r[3] / 2);
      if (side === 'left' || side === 'right') ctx.rotate(side === 'left' ? -Math.PI / 2 : Math.PI / 2);
      ctx.fillText('POLE POCKET', 0, 0);
      ctx.restore();
    });
    // custom grommet positions: the BannerBuzz CMYK grommet mark (CMYK Grommet.svg)
    const mark = typeof CanvasInspector !== 'undefined' && CanvasInspector.drawGrommetMark;
    if (g) {
      const rad = Math.max(10, 0.7 * k);
      g.points.forEach(([x, y]) => {
        if (mark) { CanvasInspector.drawGrommetMark(ctx, fx + x * k, fy + y * k, rad * 2); return; }
        ctx.beginPath(); ctx.arc(fx + x * k, fy + y * k, rad, 0, Math.PI * 2);
        ctx.fillStyle = '#f1f5f9'; ctx.fill(); ctx.lineWidth = Math.max(3, rad * 0.35); ctx.strokeStyle = '#dc2626'; ctx.stroke();
      });
    }
    let url;
    try { url = cv.toDataURL('image/jpeg', 0.92); } catch (e) { return null; }
    const where = { corners: 'on the 4 corners', 'top-corners': 'on the top corners', top: 'along the top edge', left: 'along the left edge' };
    const note = [pockets.length ? `Pole pocket on the ${pockets.join(' & ')} (shown in blue)` : '',
      g ? `${g.kind.replace(/^Metal /, '')} ${where[g.where] || ''} (${mark ? 'grommet marks' : 'red circles'})` : ''].filter(Boolean).join(' · ');
    this._hlCache = { key, url, note };
    return this._hlCache;
  },

  /** SOP proof file name (PR-DPO-03): the order's file name without process suffixes */
  _proofBaseName(analysis) {
    const n = (analysis && analysis.fname) || (typeof appState !== 'undefined' && appState.file && appState.file.name) || 'proof';
    return n.replace(/\.[a-z0-9]+$/i, '').replace(/(_script)?(_(overall|print_file|print|crop[^_]*))+$/i, '').replace(/_script$/i, '');
  },

  /**
   * Download a proof as JPG (RGB) the way PR-DPO-03 names them:
   *  1 → Proof 01 small size proof  "<order file name>.jpg"
   *  3 → Proof 03 print preview screenshot  "<order number>.jpg" (what the print preview box shows)
   */
  downloadProofJpg(which) {
    const st = this._lastRender;
    if (!st) return;
    const save = (cv, name) => cv.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/jpeg', 0.92);
    const withImage = (src, cb) => { const im = new Image(); im.onload = () => cb(im); im.src = src; };
    if (which === 1) {
      withImage(st.artworkProofSrc, im => {
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(im, 0, 0, cv.width, cv.height);
        save(cv, `${st.baseName}.jpg`);
      });
    } else if (which === 3) {
      if (!st.showPrintPreview) { alert('No print preview screenshot in this proof — SOP: only for low-resolution artwork or a print-quality concern.'); return; }
      if (this.slots.crop?.dataUrl) {
        withImage(this.slots.crop.dataUrl, im => {
          const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
          cv.getContext('2d').drawImage(im, 0, 0); save(cv, `${st.orderNum}.jpg`);
        });
        return;
      }
      const vp = document.getElementById('proof-crop-viewport');
      const vw = vp ? vp.clientWidth : 800, vh = vp ? vp.clientHeight : 240;
      const cx = this.options.cropX != null ? this.options.cropX : st.cropX, cy = this.options.cropY != null ? this.options.cropY : st.cropY;
      withImage(st.artworkSrc, im => {
        const sc = 2;
        const cv = document.createElement('canvas'); cv.width = vw * sc; cv.height = vh * sc;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(im, (vw / 2 - st.cropImg.w * cx / 100) * sc, (vh / 2 - st.cropImg.h * cy / 100) * sc, st.cropImg.w * sc, st.cropImg.h * sc);
        // Label as in the SOP proof slide
        ctx.font = `bold ${15 * sc}px Inter, Arial, sans-serif`;
        const label = 'Print preview screenshot', tw = ctx.measureText(label).width + 24 * sc;
        ctx.fillStyle = 'rgba(229, 231, 235, 0.95)'; ctx.fillRect(10 * sc, 10 * sc, tw, 30 * sc);
        ctx.fillStyle = '#dc2626'; ctx.textBaseline = 'middle'; ctx.fillText(label, 22 * sc, 25 * sc);
        save(cv, `${st.orderNum}.jpg`);
      });
    }
  },

  /** Crop-shot image size: the artwork fitted inside its print size (same rule as the canvas — never stretched) */
  _cropImageSize(cropScaleInfo, artSize) {
    const boxW = cropScaleInfo.physicalW, boxH = cropScaleInfo.physicalH;
    if (!artSize || !artSize.w || !artSize.h) return { w: boxW, h: boxH };
    const k = Math.min(boxW / artSize.w, boxH / artSize.h);
    return { w: Math.round(artSize.w * k), h: Math.round(artSize.h * k) };
  },

  handleArtworkClick(e) {
    if (!(this._lastPlan && this._lastPlan.showPrintPreview) || this.slots.crop?.dataUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    this.options.cropX = Math.round(x);
    this.options.cropY = Math.round(y);
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  initCropPan(viewportEl, physicalW, physicalH) {
    if (!viewportEl || this.slots.crop?.dataUrl) return;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startCropX = (this.options.cropX !== null && this.options.cropX !== undefined) ? this.options.cropX : 50;
    let startCropY = (this.options.cropY !== null && this.options.cropY !== undefined) ? this.options.cropY : 50;

    viewportEl.onmousedown = (e) => {
      if (this.slots.crop?.dataUrl) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startCropX = (this.options.cropX !== null && this.options.cropX !== undefined) ? this.options.cropX : 50;
      startCropY = (this.options.cropY !== null && this.options.cropY !== undefined) ? this.options.cropY : 50;
      viewportEl.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const deltaXPercent = (dx / physicalW) * 100;
      const deltaYPercent = (dy / physicalH) * 100;
      const newX = Math.max(0, Math.min(100, Math.round(startCropX - deltaXPercent)));
      const newY = Math.max(0, Math.min(100, Math.round(startCropY - deltaYPercent)));
      this.options.cropX = newX;
      this.options.cropY = newY;
      const img = document.getElementById('proof-crop-img');
      if (img) {
        img.style.left = `calc(50% - ${Math.round(physicalW * (newX / 100))}px)`;
        img.style.top = `calc(50% - ${Math.round(physicalH * (newY / 100))}px)`;
      }
      const reticle = document.querySelector('.crop-reticle');
      if (reticle) {
        reticle.style.left = `${newX}%`;
        reticle.style.top = `${newY}%`;
      }
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        viewportEl.style.cursor = 'grab';
      }
    };

    if (this._boundCropMouseMove) window.removeEventListener('mousemove', this._boundCropMouseMove);
    if (this._boundCropMouseUp) window.removeEventListener('mouseup', this._boundCropMouseUp);
    this._boundCropMouseMove = onMouseMove;
    this._boundCropMouseUp = onMouseUp;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  },

  updateSidebarControls() {
    const plan = this._lastPlan || { showPrintPreview: false, autoPreview: false, previewOverride: false };
    const chk = document.getElementById('check-crop-shot');
    if (chk) chk.checked = !!plan.showPrintPreview;
    const badge = document.getElementById('crop-status-badge');
    if (badge) {
      // Why the print preview screenshot is in (or out of) the proof — PR-DPO-03 Rev 15
      const t = this.slots.crop?.dataUrl ? ['DESIGNER SCREENSHOT', '#dcfce7', '#16a34a']
        : plan.previewOverride ? [plan.showPrintPreview ? 'ON · BY DESIGNER' : 'OFF · BY DESIGNER', '#f1f5f9', '#334155']
        : plan.autoPreview ? ['AUTO ON · LOW RESOLUTION', '#fee2e2', '#b91c1c']
        : ['AUTO OFF · NO RES. CONCERN', '#dcfce7', '#15803d'];
      badge.textContent = t[0];
      badge.style.background = t[1];
      badge.style.color = t[2];
      badge.style.display = 'inline-block';
    }
    const panel = document.getElementById('crop-shot-panel');
    if (panel) panel.style.display = plan.showPrintPreview ? 'block' : 'none';
  },

  refreshCurrentProof() {
    if (this._lastOrderData && this._lastTargetId) {
      this.renderProof(this._lastOrderData, this._lastTargetId);
    } else if (typeof generateProofView === 'function') {
      generateProofView();
    }
  },

  /**
   * Return high-definition default artwork SVG matching BB Proof.png ("VOS Skin care" + Wildflowers)
   */
  getDefaultArtworkSvg() {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 600" width="1000" height="600">
      <rect width="1000" height="600" fill="#ffffff"/>
      <!-- Brand Logo VOS -->
      <text x="620" y="150" font-family="'Inter', sans-serif, Arial" font-size="82" font-weight="900" fill="#0b0b0b" letter-spacing="4">VOS</text>
      <text x="620" y="185" font-family="'Inter', sans-serif, Arial" font-size="17" font-weight="500" fill="#222222">Skin care that helps you glow inside out.</text>
      
      <!-- Wildflower Line Art Field -->
      <g stroke="#3a3a3a" stroke-width="2" fill="none" opacity="0.85">
        <!-- Botanical Stems and Queen Anne's lace flowers -->
        <path d="M 120 600 Q 140 400 160 300 Q 180 200 200 180"/>
        <circle cx="200" cy="180" r="16" stroke="#3a3a3a" stroke-width="2"/>
        <path d="M 190 170 L 210 190 M 210 170 L 190 190 M 200 162 L 200 198"/>
        
        <path d="M 280 600 Q 290 420 310 260 Q 320 200 350 170"/>
        <circle cx="350" cy="170" r="24" stroke="#3a3a3a" stroke-width="2"/>
        <path d="M 335 155 L 365 185 M 365 155 L 335 185 M 350 145 L 350 195"/>

        <path d="M 450 600 Q 440 380 470 240 Q 490 170 520 150"/>
        <circle cx="520" cy="150" r="28" stroke="#3a3a3a" stroke-width="2.5"/>
        <path d="M 505 135 L 535 165 M 535 135 L 505 165 M 520 120 L 520 180 M 495 150 L 545 150"/>

        <!-- Grass & Delicate Wild Herbs -->
        <path d="M 80 600 Q 90 450 110 320"/>
        <path d="M 210 600 Q 230 460 250 330"/>
        <path d="M 380 600 Q 395 440 410 290"/>
        <path d="M 580 600 Q 600 480 620 340"/>
        <path d="M 680 600 Q 700 450 720 300 Q 730 240 750 200"/>
        <circle cx="750" cy="200" r="18" stroke="#3a3a3a" stroke-width="2"/>
        <path d="M 820 600 Q 830 480 840 360"/>
        <path d="M 910 600 Q 915 470 920 330"/>

        <!-- Daisy / Coneflower sketches -->
        <path d="M 230 480 Q 245 400 260 370"/>
        <ellipse cx="260" cy="370" rx="14" ry="7" transform="rotate(-20 260 370)"/>
        <path d="M 390 460 Q 405 390 420 360"/>
        <ellipse cx="420" cy="360" rx="16" ry="8" transform="rotate(15 420 360)"/>
        <path d="M 640 470 Q 650 410 660 380"/>
        <ellipse cx="660" cy="380" rx="14" ry="7" transform="rotate(-10 660 380)"/>
        <path d="M 860 480 Q 870 420 880 390"/>
        <ellipse cx="880" cy="390" rx="16" ry="8" transform="rotate(25 880 390)"/>
      </g>
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  /**
   * Return dynamic product-specific die-line template SVG matching physical specs
   */
  generateProductTemplateSvg(spec, dims) {
    if (typeof getOfficialProductTemplate === 'function') {
      const official = getOfficialProductTemplate(spec?.slug || spec?.name, dims);
      if (official && official.templateFile) {
        return official.templateFile;
      }
    }
    const slug = (spec?.slug || '').toLowerCase();
    const name = (spec?.name || '').toLowerCase();
    const printW = dims?.widthIn || spec?.defaultW || 36;
    const printH = dims?.heightIn || spec?.defaultH || 24;

    // 1. Die-cut Yard Signs
    if (slug.includes('die-cut') || slug.includes('die_cut') || name.includes('die cut')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <rect width="400" height="240" fill="#f8fafc"/>
          <!-- Directional Arrow Contour -->
          <path d="M 30 50 L 290 50 L 290 20 L 375 120 L 290 220 L 290 190 L 30 190 Z" fill="#ffffff" stroke="#ff5f1f" stroke-width="3"/>
          <!-- Safe Zone -->
          <path d="M 45 65 L 280 65 L 280 42 L 350 120 L 280 198 L 280 175 L 45 175 Z" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,4"/>
          <!-- Flute lines -->
          <line x1="100" y1="52" x2="100" y2="188" stroke="#cbd5e1" stroke-dasharray="4,4"/>
          <line x1="160" y1="52" x2="160" y2="188" stroke="#cbd5e1" stroke-dasharray="4,4"/>
          <line x1="220" y1="52" x2="220" y2="188" stroke="#cbd5e1" stroke-dasharray="4,4"/>
          <!-- Metal wire step stakes -->
          <line x1="120" y1="180" x2="120" y2="236" stroke="#64748b" stroke-width="3"/>
          <line x1="200" y1="180" x2="200" y2="236" stroke="#64748b" stroke-width="3"/>
          <line x1="110" y1="220" x2="210" y2="220" stroke="#64748b" stroke-width="2.5"/>
          <text x="160" y="234" font-family="'Inter', sans-serif" font-size="9" font-weight="700" fill="#0284c7" text-anchor="middle">WIRE STEP STAKE</text>
          <!-- Annotation labels -->
          <text x="160" y="110" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#0f172a" text-anchor="middle">✂️ CONTOUR CUTLINE: ${printW}" × ${printH}"</text>
          <text x="160" y="128" font-family="'Inter', sans-serif" font-size="9.5" font-weight="600" fill="#16a34a" text-anchor="middle">🛡️ 0.50" Safe Zone Inside Contour</text>
          <text x="160" y="144" font-family="'Inter', sans-serif" font-size="9" font-weight="500" fill="#64748b" text-anchor="middle">4mm Fluted Corflute Substrate</text>
        </svg>
      `);
    }

    // 2. Rectangle Yard Signs
    if (slug.includes('yard') || slug.includes('corflute') || name.includes('yard sign')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <rect width="400" height="240" fill="#f8fafc"/>
          <!-- Sign Panel -->
          <rect x="30" y="30" width="340" height="150" fill="#ffffff" stroke="#ff5f1f" stroke-width="2.5"/>
          <rect x="44" y="44" width="312" height="122" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,4"/>
          <!-- Flutes -->
          <line x1="90" y1="32" x2="90" y2="178" stroke="#e2e8f0"/>
          <line x1="150" y1="32" x2="150" y2="178" stroke="#e2e8f0"/>
          <line x1="210" y1="32" x2="210" y2="178" stroke="#e2e8f0"/>
          <line x1="270" y1="32" x2="270" y2="178" stroke="#e2e8f0"/>
          <line x1="330" y1="32" x2="330" y2="178" stroke="#e2e8f0"/>
          <!-- Metal wire step stakes -->
          <line x1="130" y1="160" x2="130" y2="236" stroke="#64748b" stroke-width="3"/>
          <line x1="270" y1="160" x2="270" y2="236" stroke="#64748b" stroke-width="3"/>
          <line x1="118" y1="215" x2="282" y2="215" stroke="#64748b" stroke-width="2.5"/>
          <text x="200" y="232" font-family="'Inter', sans-serif" font-size="9" font-weight="700" fill="#0284c7" text-anchor="middle">9-GAUGE WIRE H-STAKE (BOTTOM INSERT)</text>
          <!-- Labels -->
          <text x="200" y="95" font-family="'Inter', sans-serif" font-size="12" font-weight="800" fill="#0f172a" text-anchor="middle">✂️ FINISHED TRIM: ${printW}" × ${printH}"</text>
          <text x="200" y="115" font-family="'Inter', sans-serif" font-size="9.5" font-weight="600" fill="#16a34a" text-anchor="middle">🛡️ 0.50" Safe Zone Inside Trim</text>
          <text x="200" y="132" font-family="'Inter', sans-serif" font-size="9" font-weight="500" fill="#64748b" text-anchor="middle">4mm Fluted Weatherproof Polypropylene · NO GROMMETS</text>
        </svg>
      `);
    }

    // 3. Flags (Teardrop, Feather, Blade, Rectangle Flag)
    if (slug.includes('flag') || name.includes('flag')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <rect width="400" height="240" fill="#f8fafc"/>
          <!-- Flag Shape with Left Sleeve -->
          <rect x="40" y="25" width="320" height="190" fill="#ffffff" stroke="#ff5f1f" stroke-width="2.5"/>
          <!-- Left Pole Sleeve -->
          <rect x="40" y="25" width="34" height="190" fill="#1e293b"/>
          <line x1="72" y1="25" x2="72" y2="215" stroke="#fbbf24" stroke-width="1.8" stroke-dasharray="4,3"/>
          <circle cx="57" cy="42" r="6" fill="#f59e0b"/>
          <circle cx="57" cy="42" r="2.5" fill="#0f172a"/>
          <circle cx="57" cy="198" r="6" fill="#f59e0b"/>
          <circle cx="57" cy="198" r="2.5" fill="#0f172a"/>
          <!-- Safe Zone -->
          <rect x="88" y="38" width="260" height="164" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,4"/>
          <!-- Text -->
          <text x="220" y="100" font-family="'Inter', sans-serif" font-size="12" font-weight="800" fill="#0f172a" text-anchor="middle">✂️ FLAG CUTLINE: ${printW}" × ${printH}"</text>
          <text x="220" y="120" font-family="'Inter', sans-serif" font-size="9.5" font-weight="600" fill="#16a34a" text-anchor="middle">🛡️ 1.50" Safe Zone Inside Hem &amp; Sleeve</text>
          <text x="220" y="138" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="#d97706" text-anchor="middle">🚩 Reinforced Left Pole Sleeve with 2 Eyelets</text>
        </svg>
      `);
    }

    // 4. Roll-Up Stands
    if (slug.includes('roll-up') || slug.includes('retractable') || name.includes('roll-up')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <rect width="400" height="240" fill="#f8fafc"/>
          <!-- Stand Body -->
          <rect x="80" y="20" width="240" height="200" fill="#ffffff" stroke="#ff5f1f" stroke-width="2.5"/>
          <!-- Top clamp bar -->
          <rect x="80" y="20" width="240" height="14" fill="#94a3b8"/>
          <text x="200" y="31" font-family="'Inter', sans-serif" font-size="8" font-weight="700" fill="#0f172a" text-anchor="middle">TOP ALUMINUM CLAMP BAR</text>
          <!-- Safe Zone -->
          <rect x="94" y="44" width="212" height="130" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,4"/>
          <!-- Bottom Cassette Leader -->
          <rect x="80" y="185" width="240" height="35" fill="rgba(239, 68, 68, 0.15)" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="4,3"/>
          <text x="200" y="206" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#b91c1c" text-anchor="middle">⚠️ CASSETTE CLEARANCE (&gt;6" Base Margin)</text>
          <!-- Labels -->
          <text x="200" y="95" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#0f172a" text-anchor="middle">✂️ ROLL-UP TRIM: ${printW}" × ${printH}"</text>
          <text x="200" y="115" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="#16a34a" text-anchor="middle">🛡️ Safe Zone (Eye-Level Content Above 6" Base)</text>
        </svg>
      `);
    }

    // 5. Vehicle Magnetic Signs
    if (slug.includes('magnet') || name.includes('magnet')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <rect width="400" height="240" fill="#f8fafc"/>
          <!-- Rounded Rectangle -->
          <rect x="40" y="30" width="320" height="180" rx="20" fill="#ffffff" stroke="#ff5f1f" stroke-width="3"/>
          <rect x="52" y="42" width="296" height="156" rx="14" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,4"/>
          <!-- Bevel Inner Stroke -->
          <rect x="43" y="33" width="314" height="174" rx="18" fill="none" stroke="#334155" stroke-width="1.5"/>
          <!-- Labels -->
          <text x="200" y="105" font-family="'Inter', sans-serif" font-size="12" font-weight="800" fill="#0f172a" text-anchor="middle">✂️ DIE-CUT VEHICLE MAGNET: ${printW}" × ${printH}"</text>
          <text x="200" y="125" font-family="'Inter', sans-serif" font-size="10" font-weight="700" fill="#ff5f1f" text-anchor="middle">0.50" Rounded Corners (Anti-Wind Lift at Highway Speeds)</text>
          <text x="200" y="145" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="#16a34a" text-anchor="middle">🛡️ 0.50" Safe Zone · 30-Mil Heavy Duty Magnetic Sheet</text>
        </svg>
      `);
    }

    // 6. Default Vinyl Banners
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
        <rect width="400" height="240" fill="#f8fafc"/>
        <rect x="30" y="30" width="340" height="180" fill="#ffffff" stroke="#ff5f1f" stroke-width="2.5"/>
        <rect x="44" y="44" width="312" height="152" fill="none" stroke="#16a34a" stroke-width="2" stroke-dasharray="6,4"/>
        <!-- Brass grommets at corners -->
        <circle cx="38" cy="38" r="6" fill="#d97706"/><circle cx="38" cy="38" r="2.5" fill="#0f172a"/>
        <circle cx="362" cy="38" r="6" fill="#d97706"/><circle cx="362" cy="38" r="2.5" fill="#0f172a"/>
        <circle cx="38" cy="202" r="6" fill="#d97706"/><circle cx="38" cy="202" r="2.5" fill="#0f172a"/>
        <circle cx="362" cy="202" r="6" fill="#d97706"/><circle cx="362" cy="202" r="2.5" fill="#0f172a"/>
        <circle cx="200" cy="38" r="6" fill="#d97706"/><circle cx="200" cy="38" r="2.5" fill="#0f172a"/>
        <circle cx="200" cy="202" r="6" fill="#d97706"/><circle cx="200" cy="202" r="2.5" fill="#0f172a"/>
        <!-- Text -->
        <text x="200" y="110" font-family="'Inter', sans-serif" font-size="12" font-weight="800" fill="#0f172a" text-anchor="middle">✂️ BANNER TRIM: ${printW}" × ${printH}"</text>
        <text x="200" y="130" font-family="'Inter', sans-serif" font-size="9.5" font-weight="600" fill="#16a34a" text-anchor="middle">🛡️ 1.25" Safe Zone Inside Trim</text>
        <text x="200" y="148" font-family="'Inter', sans-serif" font-size="9" font-weight="600" fill="#d97706" text-anchor="middle">⭕ Brass Grommets Spaced Every 24"</text>
      </svg>
    `);
  },

  /**
   * Return dynamic 3D physical product mockup SVG matching product family
   */
  generateProductMockupSvg(spec, dims, artworkSrc) {
    if (typeof getOfficialProductMockup === 'function') {
      const official = getOfficialProductMockup(spec?.slug || spec?.name, dims);
      if (official && official.mockupFile) {
        return official.mockupFile;
      }
    }
    const slug = (spec?.slug || '').toLowerCase();
    const name = (spec?.name || '').toLowerCase();
    const printW = dims?.widthIn || spec?.defaultW || 36;
    const printH = dims?.heightIn || spec?.defaultH || 24;

    // 1. Yard Signs (Lawn Mockup with Wire H-Stakes)
    if (slug.includes('yard') || slug.includes('corflute') || name.includes('yard sign')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <defs>
            <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#bae6fd"/>
              <stop offset="100%" stop-color="#e0f2fe"/>
            </linearGradient>
            <linearGradient id="grassG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#22c55e"/>
              <stop offset="60%" stop-color="#15803d"/>
              <stop offset="100%" stop-color="#14532d"/>
            </linearGradient>
            <filter id="yardDropShadow" x="-10%" y="-10%" width="130%" height="140%">
              <feDropShadow dx="3" dy="10" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.32"/>
            </filter>
          </defs>
          <rect width="400" height="175" fill="url(#skyG)"/>
          <rect y="175" width="400" height="65" fill="url(#grassG)"/>
          <!-- Metal Step Stakes in Grass -->
          <line x1="140" y1="120" x2="140" y2="195" stroke="#94a3b8" stroke-width="4"/>
          <line x1="260" y1="120" x2="260" y2="195" stroke="#94a3b8" stroke-width="4"/>
          <line x1="130" y1="175" x2="270" y2="175" stroke="#94a3b8" stroke-width="3"/>
          <!-- Lawn Blades -->
          <path d="M 0 185 Q 20 165 40 185 Q 60 168 80 185 Q 100 165 120 185 Q 140 168 160 185 Q 180 165 200 185 Q 220 168 240 185 Q 260 165 280 185 Q 300 168 320 185 Q 340 165 360 185 Q 380 168 400 185 Z" fill="#16a34a"/>
          <!-- Yard Sign Board with Shadow -->
          <g filter="url(#yardDropShadow)">
            <rect x="80" y="32" width="240" height="125" rx="3" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
            <rect x="86" y="38" width="228" height="113" rx="2" fill="#0e2246"/>
            <text x="200" y="85" font-family="'Inter', sans-serif" font-size="16" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">NORTHUMBERLAND</text>
            <text x="200" y="105" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#ff5f1f" text-anchor="middle">PARKING &amp; MAIN ENTRANCE →</text>
            <text x="200" y="125" font-family="'Inter', sans-serif" font-size="8.5" font-weight="600" fill="#93c5fd" text-anchor="middle">4mm Weatherproof Corflute</text>
          </g>
          <rect x="110" y="215" width="180" height="18" rx="9" fill="rgba(15,23,42,0.85)"/>
          <text x="200" y="227.5" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#ffffff" text-anchor="middle">3D YARD SIGN ON WIRE STAKE</text>
        </svg>
      `);
    }

    // 2. Flags (Flagpole Mockup)
    if (slug.includes('flag') || name.includes('flag')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <defs>
            <linearGradient id="skyF" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#38bdf8"/>
              <stop offset="100%" stop-color="#bae6fd"/>
            </linearGradient>
            <filter id="flagShadow">
              <feDropShadow dx="4" dy="8" stdDeviation="5" flood-color="#0f172a" flood-opacity="0.3"/>
            </filter>
          </defs>
          <rect width="400" height="240" fill="url(#skyF)"/>
          <line x1="75" y1="10" x2="75" y2="235" stroke="#cbd5e1" stroke-width="6"/>
          <circle cx="75" cy="10" r="7" fill="#f59e0b"/>
          <rect x="55" y="230" width="40" height="8" rx="2" fill="#334155"/>
          <g filter="url(#flagShadow)">
            <path d="M 78 24 Q 180 18 250 28 Q 320 38 350 24 L 350 150 Q 320 164 250 154 Q 180 144 78 150 Z" fill="#1e1b4b"/>
            <path d="M 180 20 Q 220 22 250 28 L 250 154 Q 220 148 180 144 Z" fill="rgba(255,255,255,0.12)"/>
            <text x="210" y="80" font-family="'Inter', sans-serif" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">OPEN NOW</text>
            <text x="210" y="105" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#fbbf24" text-anchor="middle">★ ALL ARE WELCOME ★</text>
            <text x="210" y="125" font-family="'Inter', sans-serif" font-size="8.5" font-weight="600" fill="#cbd5e1" text-anchor="middle">Knitted Polyester Fabric</text>
          </g>
          <rect x="73" y="24" width="7" height="126" fill="#0f172a"/>
          <circle cx="75" cy="30" r="4" fill="#fbbf24"/>
          <circle cx="75" cy="144" r="4" fill="#fbbf24"/>
          <rect x="110" y="215" width="180" height="18" rx="9" fill="rgba(15,23,42,0.85)"/>
          <text x="200" y="227.5" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#ffffff" text-anchor="middle">3D FLUTTERING FLAG ON POLE</text>
        </svg>
      `);
    }

    // 3. Roll-Up Stands (Trade Show Mockup)
    if (slug.includes('roll-up') || slug.includes('retractable') || name.includes('roll-up')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <defs>
            <linearGradient id="floorG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#cbd5e1"/>
              <stop offset="100%" stop-color="#94a3b8"/>
            </linearGradient>
            <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f8fafc"/>
              <stop offset="100%" stop-color="#e2e8f0"/>
            </linearGradient>
            <filter id="standShadow">
              <feDropShadow dx="0" dy="10" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.3"/>
            </filter>
          </defs>
          <rect width="400" height="180" fill="url(#wallG)"/>
          <rect y="180" width="400" height="60" fill="url(#floorG)"/>
          <line x1="200" y1="18" x2="200" y2="190" stroke="#64748b" stroke-width="4"/>
          <g filter="url(#standShadow)">
            <rect x="120" y="18" width="160" height="174" fill="#091e3a"/>
            <rect x="120" y="18" width="160" height="8" fill="#ea580c"/>
            <rect x="116" y="14" width="168" height="7" rx="1.5" fill="#cbd5e1" stroke="#64748b" stroke-width="1"/>
            <text x="200" y="65" font-family="'Inter', sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">BANNERBUZZ</text>
            <text x="200" y="82" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#fdba74" text-anchor="middle">PREMIUM RETRACTABLE STAND</text>
            <circle cx="200" cy="115" r="16" fill="#ea580c"/>
            <text x="200" y="121" font-family="'Inter', sans-serif" font-size="15" font-weight="900" fill="#ffffff" text-anchor="middle">★</text>
            <text x="200" y="150" font-family="'Inter', sans-serif" font-size="8" font-weight="600" fill="#cbd5e1" text-anchor="middle">Anti-Curl Blockout Polypropylene</text>
          </g>
          <ellipse cx="200" cy="195" rx="95" ry="8" fill="rgba(15,23,42,0.3)"/>
          <rect x="108" y="188" width="184" height="12" rx="3" fill="#cbd5e1" stroke="#64748b" stroke-width="1.5"/>
          <rect x="118" y="196" width="30" height="4" rx="1" fill="#475569"/>
          <rect x="252" y="196" width="30" height="4" rx="1" fill="#475569"/>
          <rect x="110" y="215" width="180" height="18" rx="9" fill="rgba(15,23,42,0.85)"/>
          <text x="200" y="227.5" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#ffffff" text-anchor="middle">3D RETRACTABLE STAND DISPLAY</text>
        </svg>
      `);
    }

    // 4. Vehicle Magnetic Signs (Car Door Mockup)
    if (slug.includes('magnet') || name.includes('magnet')) {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
          <defs>
            <linearGradient id="carBodyG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#e2e8f0"/>
              <stop offset="50%" stop-color="#cbd5e1"/>
              <stop offset="100%" stop-color="#94a3b8"/>
            </linearGradient>
            <filter id="magShadow">
              <feDropShadow dx="2" dy="5" stdDeviation="4" flood-color="#0f172a" flood-opacity="0.25"/>
            </filter>
          </defs>
          <rect width="400" height="240" fill="url(#carBodyG)"/>
          <line x1="30" y1="0" x2="30" y2="240" stroke="#64748b" stroke-width="2"/>
          <line x1="370" y1="0" x2="370" y2="240" stroke="#64748b" stroke-width="2"/>
          <rect x="290" y="35" width="60" height="14" rx="7" fill="#475569" stroke="#334155" stroke-width="1.5"/>
          <rect x="296" y="38" width="48" height="8" rx="4" fill="#64748b"/>
          <g filter="url(#magShadow)">
            <rect x="75" y="65" width="250" height="120" rx="16" fill="#0f172a" stroke="#f59e0b" stroke-width="2.5"/>
            <text x="200" y="105" font-family="'Inter', sans-serif" font-size="14" font-weight="900" fill="#f59e0b" text-anchor="middle">PREMIUM CONTRACTOR</text>
            <text x="200" y="126" font-family="'Inter', sans-serif" font-size="10.5" font-weight="800" fill="#ffffff" text-anchor="middle">LICENSED &amp; FULLY INSURED</text>
            <text x="200" y="148" font-family="'Inter', sans-serif" font-size="11" font-weight="900" fill="#38bdf8" text-anchor="middle">📞 (800) 580-4489</text>
            <text x="200" y="168" font-family="'Inter', sans-serif" font-size="7.5" font-weight="600" fill="#94a3b8" text-anchor="middle">30-Mil Magnetic Sheet · 0.5" Rounded Anti-Peel Corners</text>
          </g>
          <rect x="110" y="215" width="180" height="18" rx="9" fill="rgba(15,23,42,0.85)"/>
          <text x="200" y="227.5" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#ffffff" text-anchor="middle">3D VEHICLE MAGNETIC ON DOOR</text>
        </svg>
      `);
    }

    // 5. Default Vinyl Banners (Hanging Banner Mockup)
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240" width="400" height="240">
        <defs>
          <linearGradient id="brickWall" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f1f5f9"/>
            <stop offset="100%" stop-color="#e2e8f0"/>
          </linearGradient>
          <filter id="bannerShadow">
            <feDropShadow dx="3" dy="8" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.3"/>
          </filter>
        </defs>
        <rect width="400" height="240" fill="url(#brickWall)"/>
        <line x1="20" y1="10" x2="60" y2="45" stroke="#94a3b8" stroke-width="2.5"/>
        <line x1="380" y1="10" x2="340" y2="45" stroke="#94a3b8" stroke-width="2.5"/>
        <line x1="20" y1="210" x2="60" y2="175" stroke="#94a3b8" stroke-width="2.5"/>
        <line x1="380" y1="210" x2="340" y2="175" stroke="#94a3b8" stroke-width="2.5"/>
        <circle cx="20" cy="10" r="5" fill="#475569"/>
        <circle cx="380" cy="10" r="5" fill="#475569"/>
        <circle cx="20" cy="210" r="5" fill="#475569"/>
        <circle cx="380" cy="210" r="5" fill="#475569"/>
        <g filter="url(#bannerShadow)">
          <rect x="55" y="40" width="290" height="140" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5"/>
          <rect x="55" y="40" width="290" height="10" fill="#ea580c"/>
          <circle cx="63" cy="48" r="5" fill="#d97706"/><circle cx="63" cy="48" r="2" fill="#0f172a"/>
          <circle cx="337" cy="48" r="5" fill="#d97706"/><circle cx="337" cy="48" r="2" fill="#0f172a"/>
          <circle cx="63" cy="172" r="5" fill="#d97706"/><circle cx="63" cy="172" r="2" fill="#0f172a"/>
          <circle cx="337" cy="172" r="5" fill="#d97706"/><circle cx="337" cy="172" r="2" fill="#0f172a"/>
          <text x="200" y="95" font-family="'Inter', sans-serif" font-size="16" font-weight="900" fill="#0e2246" text-anchor="middle" letter-spacing="1">${(spec?.name || 'CUSTOM VINYL BANNER').toUpperCase()}</text>
          <text x="200" y="120" font-family="'Inter', sans-serif" font-size="11" font-weight="700" fill="#ea580c" text-anchor="middle">${printW}" W × ${printH}" H · ${(spec?.resolution || '150 DPI')}</text>
          <text x="200" y="142" font-family="'Inter', sans-serif" font-size="9" font-weight="500" fill="#64748b" text-anchor="middle">Heavy-Duty 13 oz. Vinyl · Welded Hems &amp; Grommets</text>
        </g>
        <rect x="110" y="215" width="180" height="18" rx="9" fill="rgba(15,23,42,0.85)"/>
        <text x="200" y="227.5" font-family="'Inter', sans-serif" font-size="8.5" font-weight="700" fill="#ffffff" text-anchor="middle">3D HANGING VINYL BANNER</text>
      </svg>
    `);
  },

  /**
   * Generate and render the consolidated proof HTML matching official BannerBuzz proof layout (BB Proof.png)
   */
  renderProof(orderData, targetElementId) {
    const el = document.getElementById(targetElementId);
    if (!el) return;

    const {
      orderNum,
      customer,
      spec = {},
      dims = {},
      analysis = {},
      designerNotes = '',
      messageToCustomer = ''
    } = orderData || {};

    const finalOrderNum = orderNum || analysis?.orderNum || 'ORD-2395441';
    const finalProdName = (spec && spec.name) || analysis?.productName || 'Custom Vinyl Banners';
    let printW = dims?.widthIn || spec.defaultW || 36;
    let printH = dims?.heightIn || spec.defaultH || 24;
    // Orientation preview from the canvas (SOP 1_Banners slide 26 mockup): the order shown turned
    const ci = (typeof CanvasInspector !== 'undefined') ? CanvasInspector : null;
    const orderTurned = !!(ci && ci.previewOrderTurned);
    if (orderTurned) [printW, printH] = [printH, printW];

    // Format human-friendly dimensions (e.g. 5 ft x 3 ft or 36" x 24")
    let dimsDisplay = `${printW}" W × ${printH}" H`;
    if (analysis?.rawDim && !orderTurned) {
      dimsDisplay = `${analysis.rawDim.replace(/_/g, ' ')} (${printW}" × ${printH}")`;
    }

    const today = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

    // Choose artwork source: user uploaded > analysis preview > default BB Proof illustration
    const baseArtworkSrc = this.slots.overall?.dataUrl || analysis?.previewDataUrl || this.getDefaultArtworkSvg();
    // Artwork turned on the canvas (Rotate 90° / orientation alert): the customer proof shows it the same way
    const turned = this._turnedArtwork(baseArtworkSrc);
    const artworkSrc = turned.src;
    // Canvas "Rotate Artboard" (order shown turned) and "Rotate Artwork" can be combined
    const orientParts = [];
    if (orderTurned) orientParts.push(`Shown at ${printW}" W × ${printH}" H to match your artwork's orientation`);
    if (turned.angle) orientParts.push(`${orderTurned ? 'artwork' : 'Shown'} turned ${turned.angle}° to fit the ${orderTurned ? '' : 'ordered '}${printW}" × ${printH}" size`);
    const orientNote = orientParts.length ? orientParts.join(', ') + ' — please confirm the size and orientation.' : '';
    
    // Resolve official BannerBuzz template & mockup from QNAP registry
    const officialTemplate = (typeof getOfficialProductTemplate === 'function')
      ? getOfficialProductTemplate(spec?.slug || spec?.name || analysis?.productName, dims)
      : null;
    const officialMockup = (typeof getOfficialProductMockup === 'function')
      ? getOfficialProductMockup(spec?.slug || spec?.name || analysis?.productName, dims)
      : null;

    // Only real or designer-uploaded files; generated pictures are no longer shown as templates/mockups
    const placeholder = (label) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><rect width="320" height="180" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="6 4"/><text x="160" y="86" font-family="Arial" font-size="14" font-weight="700" fill="#64748b" text-anchor="middle">${label}</text><text x="160" y="108" font-family="Arial" font-size="11" fill="#94a3b8" text-anchor="middle">Upload it in the Proof Studio slot</text></svg>`);
    const templateSrc = this.slots.template?.dataUrl
      || (officialTemplate ? officialTemplate.templateFile : null)
      || placeholder('Real template not added yet');

    const mockupSrc = this.slots.mockup?.dataUrl
      || (officialMockup ? officialMockup.mockupFile : null)
      || placeholder('Real mockup not added yet');

    // Material & Finishing Resolution
    let graphicMaterial = spec.material || '13 oz. Premium Vinyl';
    // Weight / thickness from the material name ("13oz Premium Vinyl" → 13 oz), not the material repeated
    const weightInName = (spec.material || '').match(/(\d+(?:\.\d+)?)\s?(oz|gsm|mil|micron|mm|pt)\b/i);
    let graphicWeight = spec.weight || (weightInName ? `${weightInName[1]} ${weightInName[2].toLowerCase()}` : 'Standard print grade');
    // (spec.finishing is the catalog's finishing — e.g. "Hemmed + Metal Grommets" — not a print technology)
    let printTech = 'High-Definition Full-Color Digital Print';
    let finishingDetail = analysis?.finishing || spec.finishing || 'Standard Trim & Edge Finishing';

    // Tailor specifications dynamically to product family
    const slug = (spec.slug || '').toLowerCase();
    const prodLower = finalProdName.toLowerCase();

    if (slug.includes('yard') || slug.includes('corflute') || prodLower.includes('yard sign')) {
      graphicMaterial = 'Corrugated Plastic (Corflute) - 4mm Fluted Sheet';
      graphicWeight = '4mm Polypropylene Fluted Sheet (Weatherproof)';
      printTech = 'Direct UV Flatbed Printing (Fade-Resistant Inks)';
      finishingDetail = analysis?.finishing || 'Precision Contour Die-Cut · Metal Stakes Compatible';
    } else if (slug.includes('flag') || prodLower.includes('flag')) {
      graphicMaterial = 'Knitted Polyester (90 GSM)';
      graphicWeight = '90 GSM High-Tensile Flag Fabric';
      printTech = '1440 DPI Dye-Sublimation (Direct-to-Fabric Transfer)';
      finishingDetail = analysis?.finishing || 'Reinforced Pole Sleeve & Double-Stitched Edges';
    } else if (slug.includes('roll-up') || slug.includes('retractable') || prodLower.includes('roll-up')) {
      graphicMaterial = '280 Micron Anti-Curl Polypropylene Blockout Film';
      graphicWeight = '280 Micron Premium Smooth Opaque Banner Film';
      printTech = 'High-Resolution UV Print · Anodized Aluminum Stand';
      finishingDetail = 'Top Clamp Bar & Retractable Spring-Loaded Cassette';
    } else if (slug.includes('table') || prodLower.includes('table')) {
      graphicMaterial = '230 GSM Premium Polyester Fabric';
      graphicWeight = '230 GSM Flame-Retardant Wrinkle-Resistant Poly';
      printTech = 'Full-Color All-Over Dye-Sublimation Heat-Set';
      finishingDetail = 'Precision Hemmed Border Stitching';
    } else if (slug.includes('magnet') || prodLower.includes('magnet')) {
      graphicMaterial = '30 Mil Heavy-Duty Magnetic Sheeting';
      graphicWeight = '30 Mil Outdoor Vehicle-Grade Magnetic Material';
      printTech = 'Direct High-Definition UV Print with Rounded Corners';
      finishingDetail = 'Rounded Corners (Prevents Wind Lift on Vehicles)';
    }

    // Banners: finishing exactly as the production file name states it, with the SOP grommet count per side
    if (typeof SopRules !== 'undefined' && SopRules.family(spec, analysis) === 'banner') {
      const bf = SopRules.bannerFinishing(analysis);
      if (bf.found) {
        const lay = SopRules.bannerLayout({ widthIn: printW, heightIn: printH }, bf);
        const g = lay.grommets;
        // per-side counts right after the grommets (describeFinishing lists the grommets first)
        const parts = SopRules.describeFinishing(bf, lay).split(' · ');
        if (g && g.where === 'all') parts[0] += ` (top ${g.perSide.top} · bottom ${g.perSide.bottom} · left ${g.perSide.left} · right ${g.perSide.right})`;
        finishingDetail = parts.join(' · ');
      }
    }

    const graphicColor = (analysis?.isDoubleSided || spec.isDoubleSided)
      ? 'Four/Four (Full-Color, Double-Sided)'
      : 'Four/0 (Full-Color, Single-Sided)';
    const sizeTolerance = 'Up to +/- 0.5"';

    // ── PR-DPO-03 Rev 15 · 2. Proof Process ──
    //  Proof 01 · Small size proof — always (custom finishing such as pole pockets marked for the customer)
    //  Proof 02 · Template based proof — template-based products (PR-DPO-04 file requirement sheet)
    //  Proof 03 · Print preview screenshot — ONLY for low-resolution artwork or a print-quality concern
    //             (customers misread it otherwise — SOP purpose note)
    // A proof the designer uploaded in slot 1 (the auto one was wrong) is shown exactly as uploaded — no finishing
    // marks drawn on it — while the print preview screenshot (Proof 03) still uses the customer's real artwork pixels
    const overallCustom = !!this.slots.overall?.isCustom;
    const realArtSrc = overallCustom ? (analysis?.previewDataUrl || artworkSrc) : artworkSrc;
    const plan = this._proofPlan(spec, analysis, realArtSrc);
    const hasCustomCrop = Boolean(this.slots.crop?.dataUrl);
    const rerender = () => { if (document.getElementById(targetElementId)) this.renderProof(orderData, targetElementId); };

    // Print size of the screenshot: 100% zoom for 72 ppi files (over 120"), Photoshop "Print size" otherwise.
    // The artwork keeps its own proportions inside that print size (never stretched)
    const cropScaleInfo = this.calculateCropScale(printW, printH, spec);
    const artSize = this._artworkSize(realArtSrc, rerender);
    const cropImg = this._cropImageSize(cropScaleInfo, artSize);
    let cropX = (this.options.cropX !== null && this.options.cropX !== undefined) ? this.options.cropX : 50;
    let cropY = (this.options.cropY !== null && this.options.cropY !== undefined) ? this.options.cropY : 50;
    if (this.options.cropY === null || this.options.cropY === undefined) {
      // Tall items (flags, roll-ups, vertical banners): default focus on the upper third (face / main logo)
      cropY = (cropScaleInfo.h > cropScaleInfo.w * 1.2) ? 34 : 50;
    }
    // Print preview screenshot in the printed colours (CMYK, U.S. Web Coated SWOP v2 — as Photoshop's CMYK mode
    // shows it), at full resolution so low-resolution pixels still show; the RGB file while the copy is being made
    const printColourSrc = plan.showPrintPreview && !hasCustomCrop && typeof ColorCheck !== 'undefined' && ColorCheck.printVersion
      ? ColorCheck.printVersion(realArtSrc, rerender) : null;
    const cropSrc = printColourSrc || realArtSrc;
    const reticleW = Math.max(8, Math.min(100, Math.round((750 / cropImg.w) * 100)));
    const reticleH = Math.max(8, Math.min(100, Math.round((240 / cropImg.h) * 100)));
    const isMockupView = !plan.showPrintPreview;

    // Proof 01 artwork with custom finishing marked (pole pockets, custom grommet positions)
    const hl = overallCustom ? null : this._finishingHighlight(artworkSrc, spec, analysis, printW, printH, rerender);
    const artworkProofSrc = hl ? hl.url : artworkSrc;
    const pickArea = plan.showPrintPreview && !hasCustomCrop && !hl && !overallCustom;
    this._lastRender = { artworkSrc: cropSrc, artworkProofSrc, cropImg, cropX, cropY, showPrintPreview: plan.showPrintPreview,
      printColours: !!printColourSrc, baseName: this._proofBaseName(analysis), orderNum: finalOrderNum || 'Proof03' };

    // ── Proof sheet building blocks ──
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const NAVY = '#0e2246', ORANGE = '#ff5f1f', INK = '#111c38', MUTED = '#64748b', LINE = '#dbe2ea';
    const proofTag = id => `<span style="display:inline-block; background:${/^\d+$/.test(id) ? NAVY : '#EC008C'}; color:#ffffff; font-size:9.5px; font-weight:800; letter-spacing:0.08em; padding:4px 8px; border-radius:3px; white-space:nowrap; flex-shrink:0;">${/^\d+$/.test(id) ? 'PROOF ' + id : id}</span>`;
    const sub = (t, color, bold) => t ? `<div style="font-size:10.5px; color:${color || MUTED};${bold ? ' font-weight:700;' : ''} margin-top:1px; line-height:1.35;">${t}</div>` : '';
    const card = (id, title, subtitle, right, body) => `
        <div class="proof-card" style="border:1px solid ${LINE}; border-radius:6px; margin-bottom:12px; background:#ffffff; page-break-inside:avoid; break-inside:avoid; overflow:hidden;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 14px; background:#f7f9fc; border-bottom:1px solid #e5eaf1;">
            <div style="display:flex; align-items:center; gap:10px; min-width:0;">${proofTag(id)}<div style="min-width:0;">
              <h2 style="font-size:13px; font-weight:800; color:${INK}; margin:0;">${title}</h2>${subtitle}
            </div></div>
            ${right || ''}
          </div>
          <div style="padding:10px 14px 12px;">${body}</div>
        </div>`;
    const sectionHead = (title, note) => `
          <div style="display:flex; align-items:baseline; gap:10px; margin:0 0 8px;">
            <div style="font-size:11px; font-weight:900; color:${NAVY}; letter-spacing:0.08em; text-transform:uppercase; border-left:3px solid ${ORANGE}; padding-left:8px;">${title}</div>
            ${note ? `<div style="font-size:10px; color:${MUTED};">${note}</div>` : ''}
          </div>`;
    const smallBtn = (label, call) => `<button type="button" class="no-print" onclick="${call}" style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; border-radius:4px; padding:3px 9px; font-size:10px; font-weight:700; cursor:pointer; white-space:nowrap;">${label}</button>`;
    // Designer only (never printed): upload the correct file when the automatic one is wrong, or go back to auto
    const slotBtns = (key, label) => `<span class="no-print" style="display:inline-flex; gap:6px; flex-shrink:0;">${smallBtn('⬆ ' + label, `proofSlotUpload('${key}')`)}${this.slots[key]?.isCustom ? smallBtn('↺ Auto', `clearProofSlot('${key}')`) : ''}</span>`;
    const uploadedTag = key => this.slots[key]?.isCustom ? `<span class="no-print" style="font-size:9px; font-weight:800; letter-spacing:0.04em; color:#15803d; background:#dcfce7; border:1px solid #bbf7d0; padding:2px 6px; border-radius:3px; white-space:nowrap;">UPLOADED</span>` : '';
    const rightGroup = (...parts) => `<div style="display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:6px; flex-shrink:0; max-width:55%;">${parts.filter(Boolean).join('')}</div>`;
    const icon = (path, color) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${color || 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${path}</svg>`;
    const IC = {
      phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
      mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 6-10 7L2 6"/>',
      web: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
      check: '<polyline points="20 6 9 17 4 12"/>',
      gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      truck: '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
      users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
    };
    const logo = (size, dark) => `<span style="display:inline-flex; align-items:center; font-family:'Inter', sans-serif; line-height:1;">
        <span style="font-size:${size}px; font-weight:900; color:${dark ? '#ffffff' : NAVY}; letter-spacing:-0.5px;">Banner</span><span style="background:${ORANGE}; color:#ffffff; font-size:${size - 2}px; font-weight:900; padding:2px ${Math.round(size / 4)}px; border-radius:4px; margin-left:2px; letter-spacing:-0.3px;">Buzz</span></span>`;

    const sections = [];

    // ── Proof 01 · Small size proof (entire artwork) ──
    sections.push(card('01', 'Entire Artwork Proof',
      sub('This is the complete artwork that will be printed on your product.')
        + (orientNote ? sub('↻ ' + orientNote, '#b45309', true) : '')
        + (hl ? sub('Please check: ' + hl.note + '.', '#1d4ed8', true) : ''),
      rightGroup(
        pickArea ? `<div class="no-print" style="font-size:10px; font-weight:600; color:#4739d2; background:#f5f3ff; border:1px solid #ddd6fe; padding:3px 8px; border-radius:4px;">💡 Click the artwork to choose the print preview area</div>` : '',
        uploadedTag('overall'), slotBtns('overall', 'Replace proof')),
      `<div class="proof01-box" style="border:1px solid #e2e8f0; border-radius:4px; padding:10px; background:repeating-conic-gradient(#f8fafc 0% 25%, #ffffff 0% 50%) 50% / 16px 16px; text-align:center; height:${hl ? 225 : 200}px; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <div style="position:relative; max-width:100%; max-height:100%; display:inline-flex; align-items:center; justify-content:center; ${pickArea ? 'cursor:crosshair;' : ''}" ${pickArea ? 'onclick="ProofStudio.handleArtworkClick(event)" title="Click to move the print preview area"' : ''}>
              <img src="${artworkProofSrc}" alt="Entire Artwork Proof" class="proof-slot-img" style="max-width:100%; max-height:${hl ? 205 : 180}px; object-fit:contain; display:block; box-shadow:0 1px 4px rgba(15,23,42,0.18);" />
              ${pickArea ? `<div class="crop-reticle no-print" style="position:absolute; left:${cropX}%; top:${cropY}%; width:${reticleW}%; height:${reticleH}%; transform:translate(-50%, -50%); border:2px dashed #dc2626; background:rgba(220,38,38,0.12); box-shadow:0 0 0 1px rgba(0,0,0,0.25); pointer-events:none; box-sizing:border-box; transition:left 0.12s ease, top 0.12s ease;"></div>` : ''}
            </div>
            <div style="position:absolute; right:8px; bottom:6px; font-size:9.5px; font-weight:700; color:${MUTED}; background:rgba(255,255,255,0.9); padding:2px 6px; border-radius:3px;">${esc(dimsDisplay)}</div>
          </div>`));

    // ── Colour preview · screen (RGB) vs print (CMYK) — bright RGB colours, colours merging, opacity ──
    const colourSrc = analysis?.previewDataUrl || realArtSrc;
    const colourRes = (typeof ColorCheck !== 'undefined') ? ColorCheck.resultFor(colourSrc) : null;
    const cv = this.options.colourSection;
    const showColour = !!(colourRes && colourRes.ok) && (cv === 'auto' || cv === undefined ? colourRes.any : !!cv);
    if (showColour) {
      const notes = [];
      if (colourRes.issues.gamut) notes.push('Some bright colours in your artwork (marked in pink) are brighter than printing inks can reproduce — they will print slightly duller, as shown on the right.');
      if (colourRes.issues.merge) notes.push('The colours marked in orange become very similar in print and may blend into each other.');
      if (colourRes.issues.opacity) notes.push('The areas marked in blue are semi-transparent — they print lighter and the material may show through.');
      if (colourRes.issues.transparent) notes.push('Transparent areas of your artwork print as the white material.');
      if (!notes.length) notes.push('Your colours print close to how they look on screen.');
      sections.push(card('COLOUR', 'Colour Preview — Screen vs Print',
        sub(notes.join(' '), colourRes.any ? '#9d174d' : MUTED, colourRes.any) + sub('Print colours show the CMYK conversion used for printing (U.S. Web Coated SWOP v2). Printed colours may vary slightly with the material and your screen.'),
        rightGroup(smallBtn('Hide', 'ProofStudio.setColourSection(false)')),
        ColorCheck.compareHtml(colourRes, colourSrc, { height: 190 }) + ColorCheck.swatchesHtml(colourRes)));
    }

    // ── Proof 02 · Template based proof (template products) ──
    if (plan.showTemplate) {
      sections.push(card('02', 'Template Based Proof',
        sub("Your product's official template and finished look, for reference."),
        rightGroup(smallBtn('Hide', 'ProofStudio.setTemplateSection(false)')),
        `<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; background:#f8fafc; text-align:center;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px; min-height:20px;">
                <div style="font-size:11px; font-weight:800; color:${INK}; text-align:left;">Product Template / Die-Line</div>
                <span style="display:inline-flex; gap:6px; align-items:center;">${uploadedTag('template')}${slotBtns('template', 'Replace')}</span>
              </div>
              <div style="height:125px; display:flex; align-items:center; justify-content:center; background:#ffffff; border:1px solid #cbd5e1; border-radius:4px; padding:4px; overflow:hidden; cursor:pointer;" onclick="if(typeof openAssetLightbox==='function') openAssetLightbox('${templateSrc}', 'Official BannerBuzz Template', '${officialTemplate ? officialTemplate.name : spec.name}')" title="Click to enlarge">
                <img src="${templateSrc}" alt="Official Product Template" style="max-width:100%; max-height:100%; object-fit:contain;" />
              </div>
              <div style="margin-top:5px; font-size:9.5px; color:#475569; font-weight:600; text-align:left;">${esc(!this.slots.template?.isCustom && officialTemplate ? officialTemplate.dims : dimsDisplay)}</div>
            </div>
            <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; background:#f8fafc; text-align:center;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px; min-height:20px;">
                <div style="font-size:11px; font-weight:800; color:${INK}; text-align:left;">Finished Product Mockup</div>
                <span style="display:inline-flex; gap:6px; align-items:center;">${uploadedTag('mockup')}${slotBtns('mockup', 'Replace')}</span>
              </div>
              <div style="height:125px; display:flex; align-items:center; justify-content:center; background:#ffffff; border:1px solid #cbd5e1; border-radius:4px; padding:4px; overflow:hidden; cursor:pointer;" onclick="if(typeof openAssetLightbox==='function') openAssetLightbox('${mockupSrc}', 'Official BannerBuzz 3D Mockup', '${officialMockup ? officialMockup.name : spec.name}')" title="Click to enlarge">
                <img src="${mockupSrc}" alt="Official 3D Mockup" style="max-width:100%; max-height:100%; object-fit:contain;" />
              </div>
              <div style="margin-top:5px; font-size:9.5px; color:#475569; font-weight:600; text-align:left;">${esc(!this.slots.mockup?.isCustom && officialMockup ? officialMockup.dims : 'Finished product')}</div>
            </div>
          </div>`));
    }

    // ── Proof 03 · Print preview screenshot (only for low resolution / print-quality concern) ──
    if (plan.showPrintPreview) {
      const why = plan.resConcern
        ? `Your artwork is ${plan.resConcern.ppi} PPI at the ordered size (${plan.resConcern.target} PPI recommended), so some areas may look soft or pixelated when printed. The marked area is shown below at actual print size.`
        : 'This shows part of your artwork at actual print size — please check the print quality before you approve.';
      sections.push(card('03', 'Print Preview Screenshot',
        sub(why, plan.resConcern ? '#b45309' : MUTED, !!plan.resConcern),
        rightGroup(`<span class="no-print" style="font-size:9.5px; font-weight:800; color:#4739d2; background:#ede9fe; padding:3px 8px; border-radius:4px; border:1px solid #ddd6fe; white-space:nowrap;">${hasCustomCrop ? 'DESIGNER SCREENSHOT' : cropScaleInfo.badgeText}</span>`,
          slotBtns('crop', hasCustomCrop ? 'Replace' : 'Upload screenshot')),
        `<div id="proof-crop-viewport" style="border:2px dashed ${plan.resConcern ? '#dc2626' : '#cbd5e1'}; border-radius:4px; height:240px; overflow:hidden; position:relative; background:#f8fafc; display:flex; align-items:center; justify-content:center; cursor:${!hasCustomCrop ? 'grab' : 'default'}; user-select:none;">
            ${hasCustomCrop ? `<img src="${this.slots.crop.dataUrl}" alt="Print preview screenshot" class="proof-zoom-img" style="max-width:100%; max-height:100%; object-fit:contain;" />` : `
              <div style="position:relative; width:100%; height:100%; overflow:hidden; pointer-events:none;">
                <img id="proof-crop-img" src="${cropSrc}" alt="Print preview screenshot" class="proof-zoom-img" style="position:absolute; width:${cropImg.w}px; height:${cropImg.h}px; max-width:none !important; max-height:none !important; left:calc(50% - ${Math.round(cropImg.w * (cropX / 100))}px); top:calc(50% - ${Math.round(cropImg.h * (cropY / 100))}px); transition:left 0.12s ease, top 0.12s ease; display:block;" />
              </div>
              <div style="position:absolute; top:8px; left:10px; display:flex; gap:6px; pointer-events:none;">
                <span style="background:rgba(229,231,235,0.95); color:#dc2626; font-size:11px; font-weight:800; padding:3px 10px; border-radius:3px;">Print preview screenshot</span>
                ${printColourSrc ? `<span style="background:rgba(14,34,70,0.9); color:#ffffff; font-size:10px; font-weight:800; padding:3px 8px; border-radius:3px; letter-spacing:0.03em;">CMYK PRINT COLOURS</span>`
                  : `<span class="no-print" style="background:rgba(255,255,255,0.9); color:#64748b; font-size:10px; font-weight:700; padding:3px 8px; border-radius:3px;">converting to print colours…</span>`}
              </div>
              <div class="no-print" style="position:absolute; bottom:8px; right:10px; background:rgba(15,23,42,0.88); color:#ffffff; font-size:10px; font-weight:700; padding:4px 12px; border-radius:4px; pointer-events:none;">🔍 ${cropScaleInfo.modeText} · ✋ drag to pan</div>`}
          </div>`));
    }

    // Designer shortcuts (never printed)
    const tools = [
      !plan.showTemplate ? smallBtn('+ Template &amp; mockup section', 'ProofStudio.setTemplateSection(true)') : '',
      !showColour && colourRes && colourRes.ok ? smallBtn('+ Colour preview (screen vs print)', 'ProofStudio.setColourSection(true)') : '',
      !plan.showPrintPreview ? smallBtn('+ Print preview screenshot (print-quality concern)', 'ProofStudio.setPrintPreview(true)') : ''
    ].filter(Boolean).join('');
    const visualSectionsHtml = sections.join('') + (tools ? `<div class="no-print" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; margin:-4px 0 10px;">${tools}</div>` : '');

    // ── Order details (header band) ──
    const qty = analysis?.qty || 1;
    const sidesTxt = (analysis?.isDoubleSided || spec.isDoubleSided) ? 'Double-sided (4/4)' : 'Single-sided (4/0)';
    const customerTxt = customer && customer !== 'Customer' ? customer : '';
    const cell = (label, value, opts = {}) => `
            <div style="padding:9px 14px; ${opts.span ? `grid-column:span ${opts.span};` : ''} ${opts.border === false ? '' : `border-right:1px solid ${opts.dark ? 'rgba(255,255,255,0.12)' : LINE};`} min-width:0;">
              <div style="font-size:8.5px; font-weight:800; letter-spacing:0.08em; text-transform:uppercase; color:${opts.dark ? '#9fb3d1' : MUTED};">${label}</div>
              <div style="font-size:${opts.big ? 15 : 11.5}px; font-weight:800; color:${opts.dark ? '#ffffff' : INK}; margin-top:2px; line-height:1.3; ${opts.mono ? "font-family:'JetBrains Mono', 'Roboto Mono', monospace;" : ''} overflow-wrap:anywhere;">${value}</div>
            </div>`;

    // ── Specifications table ──
    const specRows = [
      ['Graphic Material', graphicMaterial], ['Finished Dimensions', dimsDisplay],
      ['Graphic Weight', graphicWeight], ['Size Tolerance', sizeTolerance],
      ['Print Technology', printTech], ['Graphic Color', graphicColor],
      ['Finishing Details', finishingDetail, true]
    ];
    const specHtml = specRows.map(([k, v, wide], i) => `
            <div style="display:flex; gap:10px; padding:6px 12px; ${wide ? 'grid-column:span 2;' : ''} background:${Math.floor(i / 2) % 2 ? '#ffffff' : '#f7f9fc'}; border-bottom:1px solid #edf1f6; font-size:11px; line-height:1.4;">
              <span style="font-weight:700; color:${MUTED}; min-width:128px; flex-shrink:0;">${k}:</span>
              <span style="color:${INK}; font-weight:600;">${esc(v)}</span>
            </div>`).join('');

    const checks = ['Spelling &amp; grammar', 'Phone numbers, emails &amp; web addresses', 'Names, dates &amp; prices',
      'Logos &amp; images', 'Colors (screen colors can differ from print)', 'Size, orientation &amp; finishing'];

    el.innerHTML = `
      <div class="bb-official-proof-wrap" id="printable-proof-sheet" style="font-family:'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background:#ffffff; color:${INK}; max-width:860px; margin:0 auto; padding:0; border:1px solid ${LINE}; border-radius:8px; box-shadow:0 8px 24px rgba(17,28,56,0.06); box-sizing:border-box; overflow:hidden;">

        <!-- ── 1. HEADER ── -->
        <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; padding:18px 26px 14px; page-break-inside:avoid; break-inside:avoid;">
          <div>
            ${logo(24)}
            <div style="font-size:10.5px; font-weight:700; color:#15284f; margin-top:5px;">More Than Products. A Brighter Way to Brand.</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:21px; font-weight:900; color:${NAVY}; letter-spacing:0.06em; line-height:1.1;">ARTWORK PROOF</div>
            <div style="font-size:10.5px; color:${MUTED}; font-weight:600; margin-top:3px;">Proof date <strong style="color:${INK};">${today}</strong>${customerTxt ? ` · Prepared for <strong style="color:${INK};">${esc(customerTxt)}</strong>` : ''}</div>
          </div>
        </div>
        <div style="height:4px; background:linear-gradient(90deg, ${ORANGE} 0 28%, ${NAVY} 28% 100%);"></div>

        <!-- ── 2. ORDER DETAILS ── -->
        <div style="display:grid; grid-template-columns:1.15fr 1.7fr 1.35fr 0.6fr; background:${NAVY}; page-break-inside:avoid; break-inside:avoid;">
          ${cell('Order No.', esc(finalOrderNum) + (analysis?.lineItem ? `<span style="font-size:10px; color:#9fb3d1; font-weight:700;"> · Item ${esc(analysis.lineItem)}</span>` : ''), { dark: true, big: true, mono: true })}
          ${cell('Product', esc(finalProdName), { dark: true })}
          ${cell('Finished Size', esc(dimsDisplay), { dark: true })}
          ${cell('Quantity', esc(qty), { dark: true, border: false, big: true })}
        </div>
        <div style="display:grid; grid-template-columns:1.15fr 1.7fr 1.95fr; background:#f4f7fb; border-bottom:1px solid ${LINE}; page-break-inside:avoid; break-inside:avoid;">
          ${cell('Material', esc(graphicMaterial))}
          ${cell('Printed Sides', esc(sidesTxt))}
          ${cell('Finishing', esc(finishingDetail), { border: false })}
        </div>

        <div style="padding:16px 26px 6px;">
          ${messageToCustomer ? `
          <div style="display:flex; gap:10px; align-items:flex-start; background:#eff6ff; border:1px solid #bfdbfe; border-left:4px solid #2563eb; border-radius:6px; padding:9px 12px; margin-bottom:12px; page-break-inside:avoid; break-inside:avoid;">
            <div style="font-size:10px; font-weight:900; color:#1d4ed8; letter-spacing:0.06em; text-transform:uppercase; white-space:nowrap; padding-top:1px;">Designer note</div>
            <div style="font-size:11.5px; color:#1e3a8a; font-weight:600; line-height:1.4;">${esc(messageToCustomer)}</div>
          </div>` : ''}

          <!-- ── 3. PROOFS (PR-DPO-03: Proof 01 · 02 · 03) ── -->
          ${visualSectionsHtml}

          <!-- ── 4. PRODUCT SPECIFICATIONS ── -->
          <div style="margin-bottom:12px; page-break-inside:avoid; break-inside:avoid;">
            ${sectionHead('Product Specifications', 'Your selected product details, for reference.')}
            <div style="display:grid; grid-template-columns:1fr 1fr; border:1px solid ${LINE}; border-radius:6px; overflow:hidden;">${specHtml}</div>
          </div>

          <!-- ── 5. BEFORE YOU APPROVE ── -->
          <div style="margin-bottom:12px; page-break-inside:avoid; break-inside:avoid;">
            ${sectionHead('Before you approve, please check')}
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px 14px;">
              ${checks.map(c => `<div style="display:flex; align-items:center; gap:7px; font-size:10.5px; color:#334155; font-weight:600;">
                <span style="width:16px; height:16px; border-radius:50%; background:#dcfce7; color:#15803d; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">${icon(IC.check, '#15803d')}</span>${c}</div>`).join('')}
            </div>
          </div>

          <!-- ── 6. CUSTOMER APPROVAL ── -->
          <div style="display:grid; grid-template-columns:1.35fr 1fr; border:1.5px solid ${NAVY}; border-radius:8px; overflow:hidden; margin-bottom:10px; page-break-inside:avoid; break-inside:avoid;">
            <div style="padding:12px 16px; background:#f7f9fc;">
              <div style="font-size:13px; font-weight:900; color:${NAVY};">Customer Approval</div>
              <div style="font-size:10.5px; color:#475569; line-height:1.4; margin-top:3px;">Once approved, your order goes to production exactly as shown in this proof. Changes after approval may delay your order.</div>
              <div class="no-print" style="display:flex; align-items:center; gap:10px; margin-top:9px; flex-wrap:wrap;">
                <button onclick="ProofStudio.approveProof()" style="background:${ORANGE}; color:#ffffff; border:none; padding:8px 18px; border-radius:5px; font-size:12.5px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(255,95,31,0.3);">
                  ${icon(IC.check, '#ffffff')}<span>Approve Artwork</span>
                </button>
                <span style="font-size:10px; color:${MUTED};">or reply to this proof to request changes.</span>
              </div>
            </div>
            <div style="padding:12px 16px; border-left:1px solid ${LINE}; font-size:10.5px; color:#334155; line-height:1.9;">
              <div>☐ Approved as shown</div>
              <div>☐ Approved with the changes noted</div>
              <div>☐ Please revise and send a new proof</div>
              <div style="display:flex; gap:12px; margin-top:6px; font-size:9.5px; color:${MUTED};">
                <span style="flex:1.4; border-top:1px solid #94a3b8; padding-top:2px;">Signature</span>
                <span style="flex:1; border-top:1px solid #94a3b8; padding-top:2px;">Date</span>
              </div>
            </div>
          </div>

          <div style="font-size:9px; color:#94a3b8; line-height:1.45; margin-bottom:12px;">
            Colors shown on screen (RGB) may vary slightly from the printed product (CMYK). Finishing marks on this proof (pole pockets, grommet positions) show placement only and are not printed. Size tolerance up to ±0.5". BannerBuzz is not responsible for spelling, content or layout errors approved on this proof.
          </div>
        </div>

        <!-- ── 7. FOOTER ── -->
        <div style="page-break-inside:avoid; break-inside:avoid;">
          <div style="display:flex; justify-content:space-around; gap:10px; padding:8px 26px; border-top:1px solid ${LINE}; background:#f7f9fc; font-size:9px; font-weight:800; letter-spacing:0.05em; color:#475569;">
            <span style="display:inline-flex; align-items:center; gap:5px;">${icon(IC.gift, '#1e293b')}CUSTOM PRINTED PRODUCTS</span>
            <span style="display:inline-flex; align-items:center; gap:5px;">${icon(IC.shield, '#1e293b')}PREMIUM QUALITY</span>
            <span style="display:inline-flex; align-items:center; gap:5px;">${icon(IC.truck, '#1e293b')}FAST SHIPPING</span>
            <span style="display:inline-flex; align-items:center; gap:5px;">${icon(IC.users, '#1e293b')}DEDICATED SUPPORT</span>
          </div>
          <div style="display:grid; grid-template-columns:auto 1fr auto; gap:18px; align-items:center; background:${NAVY}; color:#cbd5e1; padding:12px 26px; font-size:10px;">
            <div>
              ${logo(15, true)}
              <div style="font-size:8.5px; color:#9fb3d1; margin-top:4px; font-weight:600;">More Than Products. A Brighter Way to Brand.</div>
            </div>
            <div style="display:flex; justify-content:center; gap:16px; flex-wrap:wrap; font-weight:600;">
              <span style="display:inline-flex; align-items:center; gap:5px;">${icon(IC.phone, ORANGE)}1-800-580-4489</span>
              <span style="display:inline-flex; align-items:center; gap:5px;">${icon(IC.mail, ORANGE)}support@bannerbuzz.com</span>
              <span style="display:inline-flex; align-items:center; gap:5px;">${icon(IC.web, ORANGE)}www.bannerbuzz.com</span>
            </div>
            <div style="text-align:right; line-height:1.45; font-weight:600;">
              Order No. <strong style="color:#ffffff;">${esc(finalOrderNum)}</strong><br/>
              Page 1 of 1 · ${today}
            </div>
          </div>
        </div>

      </div>
    `;

    setTimeout(() => {
      this.updateSidebarControls();
      if (!isMockupView && !hasCustomCrop) {
        this.initCropPan(document.getElementById('proof-crop-viewport'), cropImg.w, cropImg.h);
      }
    }, 10);
  },

  /**
   * Action when customer or designer approves
   */
  approveProof() {
    alert('✅ Artwork Approved! Status updated to Print-Ready Production.');
  },

  /**
   * Trigger print dialog for the proof sheet
   */
  /**
   * Fit the whole proof sheet — header to footer — on one Letter page for Print / Export PDF. The sheet is laid
   * out at (at least) its on-screen design width, so the PDF looks exactly like the proof on screen (no squeezed
   * footer or wrapped phone numbers), then zoomed down to the page. Designer-only buttons are left out.
   */
  fitForPrint(on) {
    const sheet = document.getElementById('printable-proof-sheet');
    if (!sheet) return;
    ['width', 'max-width', 'zoom'].forEach(p => sheet.style.removeProperty(p));
    sheet.classList.toggle('print-fit', !!on);
    if (!on) return;
    const PAGE_W = 748, PAGE_H = 985, DESIGN_W = 860;   // Letter portrait minus the @page margins; sheet width on screen (CSS px)
    sheet.style.setProperty('width', DESIGN_W + 'px', 'important');
    sheet.style.setProperty('max-width', 'none', 'important');
    const h = sheet.scrollHeight;
    if (!(h > 0)) { ['width', 'max-width'].forEach(p => sheet.style.removeProperty(p)); return; }
    const k = Math.min(PAGE_W / DESIGN_W, PAGE_H / h);
    sheet.style.setProperty('width', Math.floor(PAGE_W / k) + 'px', 'important');
    sheet.style.setProperty('zoom', k.toFixed(4), 'important');
  },

  print() {
    this.fitForPrint(true);
    window.print();
    this.fitForPrint(false);
  },

  // ── Web proof (.html) ──────────────────────────────────────────────────────────────────────────────────

  /**
   * Web proof: one self-contained .html page with the same layout as the PDF proof, to share by e-mail, Google Drive,
   * the CRM… — no server needed. The print preview screenshot can be dragged across the whole product at print size
   * (with an overview map), pictures open larger on click, and the page prints / saves as a one-page PDF.
   */
  async downloadWebProof() {
    if (!document.getElementById('printable-proof-sheet')) { alert('Create the proof first (Proof Studio).'); return; }
    const btns = [...document.querySelectorAll('.web-proof-btn')];
    btns.forEach(b => { b.disabled = true; b.dataset.label = b.innerHTML; b.innerHTML = 'Preparing web proof…'; });
    try {
      // the print preview screenshot in print colours first — it may still be converting
      const st = this._lastRender || {};
      if (st.showPrintPreview && !this.slots.crop?.dataUrl && !st.printColours && typeof ColorCheck !== 'undefined') {
        const t0 = Date.now();
        while (!(this._lastRender && this._lastRender.printColours) && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 250));
      }
      const html = await this._buildWebProof();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${String((this._lastRender && this._lastRender.orderNum) || 'proof').replace(/[^\w.-]+/g, '_')}_web_proof.html`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    } catch (e) {
      console.warn('Web proof failed:', e);
      alert('The web proof could not be made: ' + (e && e.message ? e.message : e));
    } finally {
      btns.forEach(b => { b.disabled = false; if (b.dataset.label) b.innerHTML = b.dataset.label; });
    }
  },

  /** Any image source → data URL (relative asset files are read and embedded) */
  async _toDataUrl(src) {
    if (!src || src.startsWith('data:')) return src;
    const blob = await (await fetch(src)).blob();
    return await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  },

  /** Pictures shown small on the proof are embedded at a sensible size (vector SVGs as they are) */
  async _shrinkForWeb(src, maxPx) {
    if (!src || /^data:image\/svg/i.test(src)) return src;
    const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    if (!img || !img.naturalWidth) return this._toDataUrl(src).catch(() => src);
    const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && src.startsWith('data:') && src.length < 600000) return src;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    let alpha = false;
    try {
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) { alpha = true; break; }
      return cv.toDataURL(alpha ? 'image/png' : 'image/jpeg', 0.9);
    } catch (e) { return this._toDataUrl(src).catch(() => src); }
  },

  async _buildWebProof() {
    const sheet = document.getElementById('printable-proof-sheet');
    const st = this._lastRender || {};
    const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const clone = sheet.cloneNode(true);
    clone.classList.remove('print-fit');
    ['width', 'max-width', 'zoom'].forEach(p => clone.style.removeProperty(p));
    clone.style.maxWidth = '860px';            // the PDF's design width
    clone.style.margin = '0 auto';
    // designer-only parts and the tool's code stay in the tool
    clone.querySelectorAll('.no-print').forEach(n => n.remove());
    clone.querySelectorAll('*').forEach(n => {
      [...n.attributes].forEach(a => { if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
      if (n.style && (n.style.cursor === 'crosshair' || n.style.cursor === 'pointer')) n.style.cursor = '';
    });
    // approval: the customer replies to the message the proof came with
    const apr = [...clone.querySelectorAll('div')].find(d => d.textContent.trim() === 'Customer Approval');
    if (apr && apr.parentElement) {
      apr.parentElement.insertAdjacentHTML('beforeend', '<div style="margin-top:8px; font-size:11px; font-weight:700; color:#0e2246;">To approve, reply to the message this proof came with: “Approved”, or tell us what to change.</div>');
    }
    // print preview screenshot: drag across the whole product at print size, with an overview map
    const vp = clone.querySelector('#proof-crop-viewport');
    const cropImg = clone.querySelector('#proof-crop-img');
    let mapSrc = '';
    if (vp && cropImg && st.cropImg) {
      const cx = this.options.cropX != null ? this.options.cropX : st.cropX, cy = this.options.cropY != null ? this.options.cropY : st.cropY;
      Object.assign(vp.dataset, { w: Math.round(st.cropImg.w), h: Math.round(st.cropImg.h), x: cx, y: cy });
      vp.insertAdjacentHTML('beforeend', '<div class="wp-hint wp-screen">✋ Drag to look around your whole product at print size</div>');
      cropImg.setAttribute('src', await this._toDataUrl(cropImg.getAttribute('src')));
      mapSrc = await this._shrinkForWeb(cropImg.getAttribute('src'), 700);
      vp.insertAdjacentHTML('afterend', `
        <div class="wp-map wp-screen">
          <div class="wp-map-frame"><img src="${mapSrc}" alt="Your whole product"><i class="wp-reticle"></i></div>
          <div class="wp-map-txt"><b>Your whole product</b>The box shows the part you see above at print size. Drag the picture above, or click / drag here, to check every area before you approve.</div>
        </div>`);
    }
    for (const im of [...clone.querySelectorAll('img')]) {
      if (im === cropImg || im.closest('.wp-map')) continue;
      im.setAttribute('src', await this._shrinkForWeb(im.getAttribute('src'), 1600));
    }
    const order = st.orderNum || '';
    const script = `
(function () {
  var fit = document.getElementById('wp-fit'), sheet = document.getElementById('printable-proof-sheet');
  function screenFit() { fit.style.zoom = Math.min(1, (window.innerWidth - 24) / 860); }
  function zoomK() { return parseFloat(fit.style.zoom) || 1; }
  window.addEventListener('resize', screenFit); screenFit();
  window.addEventListener('beforeprint', function () { fit.style.zoom = 1; var k = Math.min(748 / 860, 985 / sheet.scrollHeight); fit.style.zoom = k; });
  window.addEventListener('afterprint', screenFit);
  var vp = document.getElementById('proof-crop-viewport'), img = document.getElementById('proof-crop-img');
  if (vp && img && vp.dataset.w) {
    var W = +vp.dataset.w, H = +vp.dataset.h, x = +vp.dataset.x, y = +vp.dataset.y, drag = null;
    var ret = document.querySelector('.wp-reticle'), map = document.querySelector('.wp-map-frame');
    function place(nx, ny) {
      x = Math.max(0, Math.min(100, nx)); y = Math.max(0, Math.min(100, ny));
      img.style.transition = 'none';
      img.style.left = 'calc(50% - ' + Math.round(W * x / 100) + 'px)';
      img.style.top = 'calc(50% - ' + Math.round(H * y / 100) + 'px)';
      if (ret) {
        ret.style.width = Math.min(100, vp.clientWidth / W * 100) + '%'; ret.style.height = Math.min(100, vp.clientHeight / H * 100) + '%';
        ret.style.left = x + '%'; ret.style.top = y + '%';
      }
    }
    function capture(el, e) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ } }
    vp.addEventListener('pointerdown', function (e) { drag = { sx: e.clientX, sy: e.clientY, x: x, y: y }; capture(vp, e); vp.classList.add('dragging'); e.preventDefault(); });
    vp.addEventListener('pointermove', function (e) { if (!drag) return; var k = zoomK(); place(drag.x - (e.clientX - drag.sx) / k / W * 100, drag.y - (e.clientY - drag.sy) / k / H * 100); });
    ['pointerup', 'pointercancel'].forEach(function (t) { vp.addEventListener(t, function () { drag = null; vp.classList.remove('dragging'); }); });
    if (map) {
      var md = false;
      function mp(e) { var r = map.getBoundingClientRect(); place((e.clientX - r.left) / r.width * 100, (e.clientY - r.top) / r.height * 100); }
      map.addEventListener('pointerdown', function (e) { md = true; capture(map, e); mp(e); e.preventDefault(); });
      map.addEventListener('pointermove', function (e) { if (md) mp(e); });
      map.addEventListener('pointerup', function () { md = false; });
    }
    place(x, y);
  }
  var lb = document.getElementById('wp-lightbox');
  document.querySelectorAll('#printable-proof-sheet img').forEach(function (im) {
    if (im.id === 'proof-crop-img' || (im.closest && im.closest('.wp-map'))) return;
    im.style.cursor = 'zoom-in';
    im.addEventListener('click', function () { lb.querySelector('img').src = im.src; lb.style.display = 'flex'; });
  });
  lb.addEventListener('click', function () { lb.style.display = 'none'; });
})();`;
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Artwork Proof${order ? ' · Order ' + esc(order) : ''} · BannerBuzz</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; background: #eef2f7; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111c38; }
  *, *::before, *::after { box-sizing: border-box; }
  .wp-bar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 18px; background: #0e2246; color: #ffffff; font-size: 13px; }
  .wp-bar b { font-weight: 800; }
  .wp-bar button { background: #ff5f1f; color: #ffffff; border: 0; border-radius: 6px; padding: 8px 14px; font: 800 12.5px 'Inter', sans-serif; cursor: pointer; }
  .wp-stage { padding: 22px 12px 40px; }
  @media (max-width: 600px) {
    .wp-bar { font-size: 11.5px; padding: 8px 12px; }
    .wp-bar button { padding: 6px 10px; font-size: 11px; white-space: nowrap; }
    .wp-stage { padding: 12px 8px 28px; }
  }
  #printable-proof-sheet { box-shadow: 0 10px 30px rgba(17, 28, 56, 0.12); }
  #proof-crop-viewport { cursor: grab; touch-action: none; }
  #proof-crop-viewport.dragging { cursor: grabbing; }
  .wp-hint { position: absolute; bottom: 8px; right: 10px; background: rgba(15, 23, 42, 0.88); color: #ffffff; font-size: 10.5px; font-weight: 700; padding: 4px 12px; border-radius: 4px; pointer-events: none; }
  .wp-map { display: flex; gap: 14px; align-items: center; margin-top: 10px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; }
  .wp-map-frame { position: relative; flex-shrink: 0; line-height: 0; cursor: crosshair; touch-action: none; box-shadow: 0 1px 4px rgba(15, 23, 42, 0.2); }
  .wp-map-frame img { display: block; max-height: 150px; max-width: 360px; user-select: none; -webkit-user-drag: none; }
  .wp-reticle { position: absolute; transform: translate(-50%, -50%); border: 2px solid #dc2626; background: rgba(220, 38, 38, 0.14); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.85); pointer-events: none; }
  .wp-map-txt { font-size: 11px; color: #475569; line-height: 1.45; }
  .wp-map-txt b { display: block; font-size: 12px; color: #0e2246; margin-bottom: 2px; }
  .wp-lightbox { position: fixed; inset: 0; z-index: 20; display: none; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.86); cursor: zoom-out; }
  .wp-lightbox img { max-width: 94vw; max-height: 92vh; background: #ffffff; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5); }
  @media print {
    @page { size: letter; margin: 0.35in; }
    html, body { background: #ffffff; }
    .wp-bar, .wp-screen, .wp-lightbox { display: none !important; }
    .wp-stage { padding: 0; }
    #printable-proof-sheet { box-shadow: none; border: 0 !important; width: 860px !important; max-width: none !important; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="wp-bar"><div>BannerBuzz · <b>Artwork proof</b>${order ? ' · Order ' + esc(order) : ''}</div><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
<div class="wp-stage"><div id="wp-fit">${clone.outerHTML}</div></div>
<div class="wp-lightbox" id="wp-lightbox"><img alt=""></div>
<script>${script}</script>
</body>
</html>`;
  }
};

// Browser print (Ctrl+P) gets the same one-page fit as the Print / Export PDF button
if (typeof window !== 'undefined' && window.addEventListener) {
  window.addEventListener('beforeprint', () => ProofStudio.fitForPrint(true));
  window.addEventListener('afterprint', () => ProofStudio.fitForPrint(false));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProofStudio;
}
