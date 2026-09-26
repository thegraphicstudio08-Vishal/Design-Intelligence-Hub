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
    const ext = analysis.fileExt.toUpperCase();

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 0: Size Transform — customer artwork scaled to the customer-selected size
    // ──────────────────────────────────────────────────────────────────────────
    if (sop && typeof SopRules !== 'undefined') {
      const canvas = sop.canvas;
      const canvasTxt = canvas
        ? `${canvas.wIn}" × ${canvas.hIn}"${canvas.confirmed ? ` (${canvas.note})` : ' (finishing allowance not confirmed — use template)'}`
        : '—';
      if (analysis.isVector && !analysis.embeddedRasterFound) {
        const art = analysis.detectedInchesW ? `${analysis.detectedInchesW}" × ${analysis.detectedInchesH}" artboard` : 'Vector artwork';
        checks.push({
          id: 'sizeTransform',
          name: 'Size Transform to Order',
          icon: '📐',
          status: 'PASS',
          found: `${art} → ${printW}" × ${printH}"`,
          required: `Order ${printW}" × ${printH}" · Print canvas ${canvasTxt}`,
          detail: 'Vector artwork scales to the ordered size without resolution loss.',
          action: canvas && canvas.confirmed ? `Create production canvas at ${canvas.wIn}" × ${canvas.hIn}" (${canvas.source}).` : ''
        });
      } else if (analysis.pixelWidth && analysis.pixelHeight && !analysis.isVector) {
        const t = SopRules.transform(analysis.pixelWidth, analysis.pixelHeight, { widthIn: printW, heightIn: printH }, sop);
        const target = sop.resolution.target;
        let st = t.ppiAtOrder >= target ? 'PASS' : t.ppiAtOrder >= sop.resolution.min ? 'WARNING' : 'FAIL';
        if (st === 'PASS' && t.ratioDiffPct > 1.5) st = 'WARNING';
        const fitTxt = t.ratioDiffPct <= 1.5
          ? 'Artwork proportion matches the order.'
          : `Proportion differs by ${t.ratioDiffPct}%: fitted whole it covers ${t.fitSizeIn.w}" × ${t.fitSizeIn.h}" (gap ${t.gapIn.w}" W / ${t.gapIn.h}" H to extend with background), or filled it crops ${t.cropPctIfFilled}% of the artwork.`;
        checks.push({
          id: 'sizeTransform',
          name: 'Size Transform to Order',
          icon: '📐',
          status: st,
          found: `${analysis.pixelWidth} × ${analysis.pixelHeight} px → ${printW}" × ${printH}" = ${t.ppiAtOrder} ppi${t.rotated ? ' (artwork rotated vs order)' : ''}`,
          required: `SOP ${target} ppi (min ${sop.resolution.min}) · canvas ${canvasTxt} = ${t.requiredPx.w} × ${t.requiredPx.h} px`,
          detail: `${fitTxt} ${sop.resolution.source}.`,
          action: st === 'PASS' ? '' : (t.ppiAtOrder < target
            ? `Artwork gives ${t.ppiAtOrder} ppi at order size; SOP asks ${target} ppi. Request higher-resolution/vector artwork, or show the low-resolution area in the crop shot proof.`
            : 'Confirm with customer: extend background to fill the order size, or crop.')
        });
      } else {
        checks.push({
          id: 'sizeTransform',
          name: 'Size Transform to Order',
          icon: '📐',
          status: 'WARNING',
          found: `${ext} — resolution not measurable in browser`,
          required: `Order ${printW}" × ${printH}" · SOP ${sop.resolution.target} ppi · canvas ${canvasTxt}`,
          detail: analysis.embeddedRasterFound
            ? 'File contains raster images; their resolution at print size cannot be measured here.'
            : 'Open the file in Photoshop/Illustrator and check the image size at print size.',
          action: `Verify effective resolution ≥ ${sop.resolution.target} ppi at ${printW}" × ${printH}".`
        });
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 1: Vector Artwork & "Good for Print" Protocol
    // ──────────────────────────────────────────────────────────────────────────
    let vStatus = 'PASS', vFound = '', vDetail = '', vAction = '';
    if (analysis.isVector) {
      // A PDF/AI holding placed photos is only as sharp as those photos
      vStatus = analysis.embeddedRasterFound ? 'WARNING' : 'PASS';
      vFound = `Vector · ${ext} Format`;
      vDetail = `🌟 GOOD FOR PRINT: ${analysis.goodForPrintReason}`;
      vAction = analysis.embeddedRasterFound
        ? 'Vector artwork contains embedded raster images (photos/textures). Verify those embedded elements meet resolution requirements.'
        : 'File is resolution-independent vector. Ready for high-definition production at any scale.';
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
    // CHECKPOINT 2: Resolution (DPI) Check
    // ──────────────────────────────────────────────────────────────────────────
    let resStatus = 'PASS', resFound = '', resDetail = '', resAction = '';
    if (analysis.isVector) {
      resStatus = 'PASS';
      resFound = 'Infinite (Vector)';
      resDetail = 'Scale-independent vector graphics. Zero pixelation regardless of output dimensions.';
    } else if (analysis.effectiveDpi) {
      if (analysis.effectiveDpi >= reqDpi) {
        resStatus = 'PASS';
        resFound = `${analysis.effectiveDpi} DPI`;
        resDetail = `Pixel density meets or exceeds SOP requirement (${analysis.effectiveDpi} DPI vs required ${spec.resolution} at ${printW}"×${printH}").`;
      } else if (analysis.effectiveDpi >= minDpi) {
        resStatus = 'WARNING';
        resFound = `${analysis.effectiveDpi} DPI`;
        resDetail = `Resolution is slightly below SOP target (${analysis.effectiveDpi} DPI vs required ${spec.resolution}).`;
        resAction = 'Inspect artwork at 100% zoom. Flag potential softness to customer if viewed closely.';
      } else {
        resStatus = 'FAIL';
        resFound = `${analysis.effectiveDpi} DPI`;
        resDetail = `Critical low resolution: ${analysis.effectiveDpi} DPI at ${printW}"×${printH}". Severe pixelation will occur.`;
        resAction = `Provide 100% crop proof to customer illustrating blurriness, and request replacement file (min ${reqDpi} DPI).`;
      }
    } else {
      resStatus = 'WARNING';
      resFound = `${ext} file`;
      resDetail = 'Pixel dimensions could not be extracted directly in browser. Manual verification required.';
      resAction = 'Open in Adobe Photoshop/Illustrator and verify resolution at print size.';
    }
    checks.push({
      id: 'resolution',
      name: 'Resolution (DPI)',
      icon: '🖼️',
      status: resStatus,
      found: resFound,
      required: spec.resolution,
      detail: resDetail,
      action: resAction
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 3: Size & Physical Measurement Check
    // ──────────────────────────────────────────────────────────────────────────
    let sizeStatus = 'PASS', sizeFound = '', sizeDetail = '', sizeAction = '';
    const diffPct = analysis.aspectRatioMismatchPercent || 0;
    if (analysis.pixelWidth && analysis.pixelHeight) {
      sizeFound = `${analysis.pixelWidth} × ${analysis.pixelHeight} px (Aspect Ratio: ${analysis.aspectRatioArtwork}:1)`;
      if (diffPct <= 1.5) {
        sizeStatus = 'PASS';
        sizeDetail = `Artwork aspect ratio matches ordered print dimensions (${printW}"×${printH}", Ratio: ${analysis.aspectRatioOrder}:1) within tolerance (Δ ${diffPct}%).`;
      } else if (diffPct <= 5.0) {
        sizeStatus = 'WARNING';
        sizeDetail = `Minor aspect ratio mismatch (Δ ${diffPct}%). Artwork will undergo minor stretching or slight edge cropping to fit ${printW}"×${printH}".`;
        sizeAction = 'Verify whether customer allows proportional fit with background extension or minor crop.';
      } else {
        sizeStatus = 'FAIL';
        sizeDetail = `Significant aspect ratio mismatch (Δ ${diffPct}%). Artwork ratio is ${analysis.aspectRatioArtwork}:1, but order requires ${analysis.aspectRatioOrder}:1 (${printW}"×${printH}"). Artwork will be distorted if stretched.`;
        sizeAction = 'Contact customer to confirm correct ordered dimensions or request artwork sized to fit aspect ratio.';
      }
    } else {
      sizeStatus = 'WARNING';
      sizeFound = `${ext} Document`;
      sizeDetail = `Target print size: ${printW}" × ${printH}". Ensure document artboard matches these dimensions.`;
      sizeAction = 'Verify artboard size matches order size in design software.';
    }
    checks.push({
      id: 'sizeMeasurement',
      name: 'Size & Measurements',
      icon: '📏',
      status: sizeStatus,
      found: sizeFound,
      required: `${printW}" × ${printH}" (±0.5" SOP tolerance)`,
      detail: sizeDetail,
      action: sizeAction
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 4: Orientation Check
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
    // CHECKPOINT 5: Lines & Dots / Artifact Detection
    // ──────────────────────────────────────────────────────────────────────────
    let artStatus = 'PASS', artFound = 'Clean margins', artDetail = '', artAction = '';
    if (analysis.hasLinesOrDots) {
      artStatus = 'WARNING';
      artFound = 'Edge Artifacts Detected';
      artDetail = 'Pixel analysis detected potential dark scanning lines, scanner dust, or dirty borders along edge margins.';
      artAction = 'Inspect artwork at 100% zoom using the Interactive Canvas Inspector to clean stray pixels or lines before printing.';
    } else {
      artStatus = 'PASS';
      artFound = 'No unwanted lines or dots detected';
      artDetail = 'Edge margins appear clean with no scanner lines or rogue border artifacts.';
    }
    checks.push({
      id: 'linesAndDots',
      name: 'Lines & Dots Artifacts',
      icon: '🔍',
      status: artStatus,
      found: artFound,
      required: 'Clean artwork, no scanner lines or dust spots',
      detail: artDetail,
      action: artAction
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
