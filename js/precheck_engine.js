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
    let orientStatus = 'PASS', orientFound = '', orientDetail = '', orientAction = '';
    orientFound = `Artwork: ${analysis.orientationArtwork} · Order: ${analysis.orientationOrder}`;
    if (analysis.orientationArtwork === 'Unknown') {
      orientStatus = 'WARNING';
      orientDetail = 'Artwork size could not be read, so orientation cannot be compared automatically.';
      orientAction = `Confirm artwork orientation matches ${printW}"W × ${printH}"H.`;
    } else if (analysis.orientationMatch) {
      orientStatus = 'PASS';
      orientDetail = `Artwork orientation (${analysis.orientationArtwork}) matches ordered product orientation (${printW}"×${printH}").`;
    } else if (sop?.orientationSwapAllowed) {
      // SOP 1_Banners · Mockup guideline: change orientation on admin after customer approval
      orientStatus = 'WARNING';
      orientDetail = `Artwork is ${analysis.orientationArtwork}, order is ${analysis.orientationOrder} (${printW}"W × ${printH}"H). ${SopRules.SOURCES.mockup}: change the orientation on admin after the customer's approval and communicate with a mockup.`;
      orientAction = 'Send mockup to customer; after approval change admin orientation. If pole pocket or wind flaps are selected, place them for the new orientation.';
    } else {
      orientStatus = 'FAIL';
      orientDetail = `Orientation Mismatch: Artwork is ${analysis.orientationArtwork}, but product order is ${analysis.orientationOrder} (${printW}"W × ${printH}"H).`;
      orientAction = 'Rotate artwork 90 degrees or confirm with customer whether order dimensions were inverted.';
    }
    checks.push({
      id: 'orientation',
      name: 'Orientation',
      icon: '📐',
      status: orientStatus,
      found: orientFound,
      required: `Match ${analysis.orientationOrder} (${printW}"×${printH}")`,
      detail: orientDetail,
      action: orientAction
    });

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
    checks.push({
      id: 'spelling',
      name: 'Spelling & Copy Proofing',
      icon: '📝',
      status: 'WARNING',
      found: 'Manual review required',
      required: 'Zero spelling/grammar errors',
      detail: 'Customer artwork copy (company names, phone numbers, website URLs, addresses, dates) must be proofread by the designer.',
      action: 'Carefully cross-check phone numbers, dates, and names before proceeding to customer proof.'
    });

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
