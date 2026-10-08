/**
 * Design Intelligence Hub - SOP Pre-Check Engine
 * Evaluates the 10 automated checkpoints defined in BannerBuzz SOPs & Design Projects brief.
 */

const PrecheckEngine = {
  /**
   * Run the complete pre-check evaluation
   * @param {Object} analysis - Output from FileAnalyzer
   * @param {Object} spec - Product specification from SPECS
   * @param {Object} userDims - { widthIn, heightIn, unit }
   * @param {Object} overrides - Designer override log { [checkId]: reason }
   * @returns {Object} Comprehensive evaluation report
   */
  /**
   * Orientation: the artwork page against the ordered size, and the direction of the text on it.
   * SOP 1_Banners slide 26: when the order is vertical and the artwork horizontal, the orientation is
   * changed on admin only AFTER the customer approves a mockup — so a mismatch is reported, never
   * silently "fixed". SOP 4_Custom Flags: clip / suction-cup flags can be used both ways.
   */
  orientationCheck(analysis, spec, dims) {
    const printW = dims.widthIn, printH = dims.heightIn;
    const sop = spec && spec._sop;
    const insp = (typeof AgenticAiInspector !== 'undefined') ? AgenticAiInspector : null;
    const text = insp ? insp.textResult : null;
    const textBusy = insp && ['loading', 'reading', 'idle'].includes((insp.textState || {}).status) && !insp.scanSkipReason;
    const turn = text && text.orientation ? text.orientation.angle : 0;
    const order = analysis.orientationOrder;
    const art = analysis.orientationArtwork;
    const size = analysis.detectedInchesW
      ? ` ${analysis.detectedInchesW}" × ${analysis.detectedInchesH}"`
      : (analysis.pixelWidth ? ` ${analysis.pixelWidth} × ${analysis.pixelHeight} px` : '');
    const textTxt = turn
      ? (turn === 180 ? 'text reads upside down' : 'text reads sideways')
      : text && text.orientation && text.orientation.readable ? 'text reads upright'
        : textBusy ? 'checking text direction…' : text ? 'too little text to confirm its direction' : 'text direction not checked';
    const found = `Artwork page: ${art || 'Unknown'}${size} · Order: ${order} ${printW}" × ${printH}" · ${textTxt}`;
    const required = `${order} artwork, text upright`;
    const slugName = `${(spec && spec.slug) || ''} ${(spec && spec.name) || ''}`.toLowerCase();
    const bothWays = /flag/.test(slugName) && /clip|suction/.test(slugName);
    const pageMismatch = art && art !== 'Unknown' && !analysis.orientationMatch;

    if (turn) {
      const howTo = turn === 90 ? '90° clockwise' : turn === 270 ? '90° anticlockwise' : '180°';
      const pageNote = pageMismatch
        ? ` The page is ${art.toLowerCase()} while the order is ${order.toLowerCase()} (${printW}" × ${printH}").`
        : '';
      return {
        status: 'FAIL', found, required,
        detail: `The text on the artwork ${turn === 180 ? 'is upside down' : 'runs sideways'}: it only reads correctly when the artwork is turned ${howTo}.${pageNote}`,
        action: `Rotate the artwork ${howTo}${pageMismatch || turn !== 180 ? ` and place it on the ${printW}" × ${printH}" ${order.toLowerCase()} canvas` : ''} before creating the design file, or confirm with the customer.`
      };
    }
    if (!art || art === 'Unknown') {
      return { status: 'WARNING', found, required,
        detail: 'The artwork size could not be read, so its orientation cannot be compared with the order automatically.',
        action: `Confirm the artwork is ${order.toLowerCase()} (${printW}" W × ${printH}" H) and the text is upright.` };
    }
    if (!pageMismatch) {
      return { status: 'PASS', found, required,
        detail: `Artwork orientation (${art}) matches the order (${printW}" × ${printH}")${text && text.orientation && text.orientation.readable ? ' and the text reads upright' : ''}.`,
        action: '' };
    }
    if (bothWays) {
      return { status: 'PASS', found, required,
        detail: `Artwork is ${art.toLowerCase()}, order is ${order.toLowerCase()}. SOP 4_Custom Flags: this flag can be used vertically and horizontally.`,
        action: 'Confirm with the customer which way the flag will hang.' };
    }
    if (sop && sop.orientationSwapAllowed) {
      return { status: 'WARNING', found, required,
        detail: `Artwork is ${art.toLowerCase()}, order is ${order.toLowerCase()} (${printW}" W × ${printH}" H). SOP 1_Banners slide 26: send a mockup; after the customer approves, change the orientation on admin. If a pole pocket is selected, place it for the new orientation.`,
        action: 'Send a mockup to the customer and wait for approval before changing the admin orientation.' };
    }
    return { status: 'FAIL', found, required,
      detail: `Orientation mismatch: the artwork is ${art.toLowerCase()} but the order is ${order.toLowerCase()} (${printW}" W × ${printH}" H). The text reads upright, so the artwork was made for the other orientation — it cannot simply be rotated.`,
      action: 'Confirm with the customer whether the order size is the wrong way round, or ask for artwork in the ordered orientation.' };
  },

  evaluate(analysis, spec, userDims, overrides = {}) {
    const checks = [];
    const printW = userDims?.widthIn || spec.defaultW || 36;
    const printH = userDims?.heightIn || spec.defaultH || 24;
    const reqDpi = parseInt(spec.resolution) || 150;
    const sop = spec._sop || null;
    // Lowest acceptable resolution: SOP minimum when known, otherwise 75% of target
    const minDpi = sop?.resolution?.min || Math.round(reqDpi * 0.75);
    const ext = (analysis.fileExt || '').toUpperCase();

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 0: Size Transform to Order (Incorporating Physical Measurements & Aspect Ratio)
    // ──────────────────────────────────────────────────────────────────────────
    const canvas = sop?.canvas;
    const canvasTxt = canvas
      ? `${canvas.wIn}" × ${canvas.hIn}"${canvas.confirmed ? ` (${canvas.note})` : ' (finishing allowance not confirmed — use template)'}`
      : '—';
    const diffPct = analysis.aspectRatioMismatchPercent || 0;
    const reqTol = `${printW}" × ${printH}" (±0.5" SOP tolerance)`;

    if (analysis.isVector && !analysis.embeddedRasterFound) {
      const art = analysis.detectedInchesW ? `${analysis.detectedInchesW}" × ${analysis.detectedInchesH}" artboard` : 'Vector artwork';
      const aspectInfo = analysis.aspectRatioArtwork ? ` (Ratio: ${analysis.aspectRatioArtwork}:1)` : '';
      checks.push({
        id: 'sizeTransform',
        name: 'Size Transform to Order',
        icon: '📐',
        status: (diffPct > 5.0) ? 'FAIL' : (diffPct > 1.5) ? 'WARNING' : 'PASS',
        found: `${art}${aspectInfo} → Order: ${printW}" × ${printH}"`,
        required: `${reqTol} · Print canvas ${canvasTxt}`,
        detail: `Vector artwork scales to the ordered size without resolution loss.${diffPct > 1.5 ? ` Aspect ratio difference: Δ ${diffPct}%.` : ' Aspect ratio matches order dimensions.'}`,
        action: canvas && canvas.confirmed ? `Create production canvas at ${canvas.wIn}" × ${canvas.hIn}" (${canvas.source}).` : ''
      });
    } else if (analysis.pixelWidth && analysis.pixelHeight) {
      const t = (typeof SopRules !== 'undefined' && sop)
        ? SopRules.transform(analysis.pixelWidth, analysis.pixelHeight, { widthIn: printW, heightIn: printH }, sop)
        : {
            ppiAtOrder: analysis.effectiveDpi || Math.round(Math.min(analysis.pixelWidth / printW, analysis.pixelHeight / printH)),
            ratioDiffPct: diffPct,
            fitSizeIn: { w: printW, h: printH },
            gapIn: { w: 0, h: 0 },
            cropPctIfFilled: 0,
            requiredPx: { w: Math.round(printW * reqDpi), h: Math.round(printH * reqDpi) },
            rotated: false
          };
      const target = sop?.resolution?.target || reqDpi;
      const minResolution = sop?.resolution?.min || minDpi;

      let st = t.ppiAtOrder >= target ? 'PASS' : t.ppiAtOrder >= minResolution ? 'WARNING' : 'FAIL';
      if (st === 'PASS' && (t.ratioDiffPct > 1.5 || diffPct > 1.5)) st = 'WARNING';
      if (diffPct > 5.0 || t.ratioDiffPct > 5.0) st = 'FAIL';

      const actualDiff = t.ratioDiffPct || diffPct;
      const isHybrid = analysis.isVector && analysis.embeddedRasterFound;
      const fitTxt = actualDiff <= 1.5
        ? (isHybrid
            ? `Hybrid Design: Vector contours scale infinitely; embedded raster (${analysis.pixelWidth}×${analysis.pixelHeight} px) matches order aspect ratio within tolerance.`
            : 'Artwork aspect ratio and dimensions match the order within tolerance.')
        : `Proportion differs by ${actualDiff}% (Artwork ${analysis.aspectRatioArtwork || 'custom'}:1 vs Order ${analysis.aspectRatioOrder || +(printW/printH).toFixed(2)}:1): fitted whole it covers ${t.fitSizeIn.w}" × ${t.fitSizeIn.h}" (gap ${t.gapIn.w}" W / ${t.gapIn.h}" H to extend with background), or filled it crops ${t.cropPctIfFilled}% of the artwork.`;

      const hybridLabel = isHybrid ? 'Hybrid Vector + Raster: ' : '';
      checks.push({
        id: 'sizeTransform',
        name: 'Size Transform to Order',
        icon: '📐',
        status: st,
        found: `${hybridLabel}${analysis.pixelWidth} × ${analysis.pixelHeight} px (${analysis.aspectRatioArtwork}:1) → ${printW}" × ${printH}" = ${t.ppiAtOrder} PPI${t.rotated ? ' (artwork rotated vs order)' : ''}`,
        required: `${reqTol} · Target ${target} PPI (min ${minResolution}) · Canvas ${canvasTxt}`,
        detail: `${fitTxt}${sop?.resolution?.source ? ` ${sop.resolution.source}.` : ''}`,
        action: st === 'PASS' ? '' : (actualDiff > 5.0
          ? 'Contact customer to confirm correct ordered dimensions or request artwork sized to fit aspect ratio without distortion.'
          : t.ppiAtOrder < target
          ? `Artwork gives ${t.ppiAtOrder} PPI at order size; SOP asks ${target} PPI. Request higher-resolution/vector artwork, or show low-resolution area in the crop shot proof.`
          : 'Confirm with customer: extend background to fill the order size, or crop edge allowance.')
      });
    } else {
      checks.push({
        id: 'sizeTransform',
        name: 'Size Transform to Order',
        icon: '📐',
        status: 'WARNING',
        found: `${ext} Document — resolution not measurable in browser`,
        required: `${reqTol} · Target ${sop?.resolution?.target || reqDpi} PPI · Canvas ${canvasTxt}`,
        detail: analysis.embeddedRasterFound
          ? 'File contains raster images; their resolution at print size cannot be measured directly in browser. Ensure artboard matches order size.'
          : `Target print size: ${printW}" × ${printH}". Ensure document artboard matches ordered dimensions.`,
        action: `Verify artboard size matches order size (${printW}" × ${printH}") and effective resolution ≥ ${sop?.resolution?.target || reqDpi} PPI in Adobe software.`
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 1: Vector Artwork & "Good for Print" Protocol
    // ──────────────────────────────────────────────────────────────────────────
    let vStatus = 'PASS', vFound = '', vDetail = '', vAction = '';
    if (analysis.isVector) {
      if (analysis.embeddedRasterFound) {
        // Hybrid Vector Artwork with embedded inside raster graphics
        const rDpi = analysis.effectiveDpi || 0;
        if (rDpi >= reqDpi) {
          vStatus = 'PASS';
          vFound = `Hybrid Vector + Raster (${rDpi} DPI)`;
          vDetail = `🌟 GOOD FOR PRINT: Scale-independent vector contours with embedded raster design (${analysis.pixelWidth}×${analysis.pixelHeight} px, ${analysis.colorSpace || 'DeviceCMYK'}). Effective raster resolution of ${rDpi} DPI meets SOP target (${spec.resolution}) at ${printW}"×${printH}".`;
          vAction = 'Vector curves and embedded raster elements are production-ready.';
        } else if (rDpi >= minDpi) {
          vStatus = 'WARNING';
          vFound = `Hybrid Vector + Raster (${rDpi} DPI)`;
          vDetail = `Borderline Raster Resolution: Scale-independent vector paths, but inside raster graphic delivers ${rDpi} DPI (SOP standard: ${spec.resolution} at ${printW}"×${printH}").`;
          vAction = 'Inspect embedded photo elements at 100% zoom. Flag potential softness to customer.';
        } else {
          vStatus = 'WARNING';
          vFound = `Hybrid Vector + Low-Res Raster (${rDpi || 'Low'} DPI)`;
          vDetail = `Low-Res Raster Warning: Vector curves will print razor sharp, but embedded raster element (${analysis.pixelWidth}×${analysis.pixelHeight} px) is only ${rDpi} DPI at ${printW}"×${printH}" (required ${spec.resolution}).`;
          vAction = `Notify customer: vector lines are sharp, but embedded photos will appear pixelated. Request higher-resolution source image (min ${reqDpi} DPI).`;
        }
      } else {
        // Pure Vector
        vStatus = 'PASS';
        vFound = `Pure Vector · .${ext.toUpperCase()}`;
        vDetail = `🌟 GOOD FOR PRINT: ${analysis.goodForPrintReason || 'Scale-independent mathematical vector curves. 100% razor sharp at any print dimensions.'}`;
        vAction = 'File is resolution-independent vector. Ready for high-definition production at any scale.';
      }
    } else {
      if (analysis.isGoodForPrint) {
        vStatus = 'PASS';
        vFound = `Raster (${analysis.effectiveDpi} DPI)`;
        vDetail = `GOOD FOR PRINT: ${analysis.goodForPrintReason}`;
      } else if (!analysis.effectiveDpi) {
        vStatus = 'WARNING';
        vFound = `${ext} — resolution not readable`;
        vDetail = analysis.goodForPrintReason || 'Pixel size could not be read in the browser.';
        vAction = `Check the image size in Photoshop: needs ${reqDpi} ppi at ${printW}"×${printH}".`;
      } else if (analysis.effectiveDpi >= minDpi) {
        vStatus = 'WARNING';
        vFound = `Raster (${analysis.effectiveDpi} DPI)`;
        vDetail = `Borderline Print Resolution: File has ${analysis.effectiveDpi} DPI. SOP standard for ${spec.name} is ${spec.resolution} at ${printW}"×${printH}".`;
        vAction = 'Confirm print viewing distance with customer, or request higher resolution artwork / vector source.';
      } else {
        vStatus = 'FAIL';
        vFound = `Raster (${analysis.effectiveDpi || 'Unknown'} DPI)`;
        vDetail = `LOW RESOLUTION ALERT: ${analysis.goodForPrintReason}`;
        vAction = `Request higher resolution artwork from customer (minimum ${reqDpi} DPI at ${printW}"×${printH}") or request vector format (.AI / .EPS / .SVG / .PDF).`;
      }
    }
    checks.push({
      id: 'goodForPrint',
      name: 'Print Suitability ("Good for Print")',
      icon: analysis.isVector ? '⭐' : '🖨️',
      status: vStatus,
      found: vFound,
      required: analysis.isVector ? 'Vector Format (Preferred)' : `${spec.resolution} @ ${printW}"×${printH}"`,
      detail: vDetail,
      action: vAction
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 2: Orientation Check
    // ──────────────────────────────────────────────────────────────────────────
    // Page orientation vs the order, plus the direction of the text read on the artwork.
    // The text direction arrives a few seconds later (OCR); AgenticAiInspector then re-runs this check.
    checks.push(Object.assign({ id: 'orientation', name: 'Orientation', icon: '📐' },
      this.orientationCheck(analysis, spec, { widthIn: printW, heightIn: printH })));

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 4: Agentic AI Quality Audit: Spelling, Stray Lines & Dots
    // ──────────────────────────────────────────────────────────────────────────
    // The scanner states what it checked, what it found and what still needs a human look.
    // The scan may finish after this report is built; AgenticAiInspector.syncPrecheckReport() then updates it.
    const aiDefects = (typeof AgenticAiInspector !== 'undefined')
      ? AgenticAiInspector.getDefects()
      : (analysis.aiDefects || []);
    const qa = (typeof AgenticAiInspector !== 'undefined')
      ? AgenticAiInspector.getCheckSummary()
      : { status: 'WARNING', found: 'Not checked', detail: 'Artwork QA scanner not loaded.', action: 'Inspect the artwork at 100% zoom.' };

    checks.push({
      id: 'linesAndDots',
      name: 'Lines & Dots (stray marks) · Spelling',
      icon: '🔍',
      status: qa.status,
      found: qa.found,
      required: 'No unwanted lines, dots or smudges on the artwork',
      detail: qa.detail,
      action: qa.action,
      aiDefects: aiDefects
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 6: Safe Area Verification
    // ──────────────────────────────────────────────────────────────────────────
    checks.push({
      id: 'safeArea',
      name: 'Safe Area Margins',
      icon: '🛡️',
      status: 'WARNING',
      found: `${spec.safeArea} guide boundary`,
      required: `${spec.safeArea} inner safe zone`,
      detail: `SOP standard for ${spec.name} requires all logos, text, and critical graphics to remain at least ${spec.safeArea} inside the trim line to prevent being cut or grommeted.${sop?.safeArea ? ` Source: ${sop.safeArea.source}.` : ''}`,
      action: `Use the visual canvas overlay to inspect that all text and logos sit inside the ${spec.safeArea} safe boundary.`
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 7: Bleed Allowance
    // ──────────────────────────────────────────────────────────────────────────
    checks.push({
      id: 'bleed',
      name: 'Bleed Allowance',
      icon: '✂️',
      status: 'WARNING',
      found: `${spec.bleed} required bleed`,
      required: spec.bleed,
      detail: `Background colors, textures, and photos must extend ${spec.bleed} past the cut line on all sides to prevent white border gaps after cutting/hemming.`,
      action: `Verify artwork extends ${spec.bleed} past trim line. For mesh fence banners, verify 2" full color bleed.`
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 8: Color Mode & Profile (SWOP v2)
    // ──────────────────────────────────────────────────────────────────────────
    checks.push({
      id: 'colorMode',
      name: 'Color Mode & Profile',
      icon: '🎨',
      status: 'WARNING',
      found: 'Browser Upload (RGB Preview)',
      required: spec.colorMode || 'CMYK (8-bit) · Working SWOP v2',
      detail: `SOP PS Settings: Print production requires CMYK (8-bit) with color profile 'Working CMYK: U.S. Web Coated (SWOP) v2'.`,
      action: 'Confirm document is in CMYK mode in Photoshop/Illustrator. Note that vibrant RGB neon greens or electric blues may shift darker in CMYK.'
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 9: Font Size & Legibility
    // ──────────────────────────────────────────────────────────────────────────
    checks.push({
      id: 'fontSizes',
      name: 'Font Size & Legibility',
      icon: '🔤',
      status: 'PASS',
      found: `Minimum requirement: ${spec.minFont}`,
      required: `${spec.minFont} minimum`,
      detail: `Product minimum text size is ${spec.minFont} for print legibility. For fabric banners, text must also remain clear of the 3" perimeter stitch line.`,
      action: `Inspect all disclaimer/contact copy at 100% zoom to verify font size meets ${spec.minFont}.`
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 10: Spelling & Content Review
    // ──────────────────────────────────────────────────────────────────────────
    // Text read on the artwork (OCR) and checked; updated live when the reading finishes
    checks.push(Object.assign({
      id: 'spelling',
      name: 'Spelling & Copy Proofing',
      icon: '📝',
      required: 'No spelling mistakes; correct brand names and web / e-mail addresses'
    }, (typeof AgenticAiInspector !== 'undefined' && AgenticAiInspector.getSpellingSummary)
      ? AgenticAiInspector.getSpellingSummary()
      : { status: 'WARNING', found: 'Manual review required', detail: 'Proofread names, phone numbers, web addresses and dates.', action: '' }));

    // Apply designer overrides
    checks.forEach(c => {
      if (overrides[c.id]) {
        c.isOverridden = true;
        c.overrideReason = overrides[c.id];
      }
    });

    // Calculate score
    const fails = checks.filter(c => c.status === 'FAIL' && !c.isOverridden).length;
    const warns = checks.filter(c => c.status === 'WARNING' && !c.isOverridden).length;
    const passes = checks.filter(c => c.status === 'PASS' || c.isOverridden).length;

    let score = Math.max(0, 100 - (fails * 20) - (warns * 5));
    if (analysis.isVector) score = Math.min(100, score + 5);

    const overall = fails > 0 ? 'FAIL' : warns > 3 ? 'WARNING' : 'PASS';
    const summary = fails > 0
      ? `${fails} critical issue(s) detected. Artwork must be corrected before production.`
      : warns > 0
        ? `${warns} item(s) flagged for designer verification before production.`
        : 'All automated SOP checkpoints passed. Artwork is ready for customer proofing and production.';

    return {
      productName: spec.name,
      overall,
      score,
      summary,
      checks,
      analysis,
      spec,
      dimensions: { widthIn: printW, heightIn: printH }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrecheckEngine;
}
