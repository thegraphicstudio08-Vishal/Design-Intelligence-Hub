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
      return { status: 'WARNING', manual: true, found, required,
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
    // PR-DPO-03 Rev 15 · Artwork placement process: the ordered size turned → update the admin to the artwork
    // size (proof in the artwork's orientation); any other size → adjust / stretch to the ordered size (approval)
    const pl = (typeof SopRules !== 'undefined')
      ? SopRules.placement(analysis.detectedInchesW || analysis.pixelWidth, analysis.detectedInchesH || analysis.pixelHeight,
          { widthIn: printW, heightIn: printH }, sop && sop.canvas && sop.canvas.finishing, analysis.fileExt)
      : null;
    if (pl && pl.kind === 'turned') {
      return { status: 'WARNING', manual: false, scenario: 'turned', found, required,
        detail: `The artwork is the ordered size turned: artwork ${art.toLowerCase()}, order ${order.toLowerCase()} ${printW}" W × ${printH}" H. ${SopRules.SOURCES.placement}, case ${pl.cases}${pl.finishingConcern ? ' — the pole pocket / wind flap position changes with the orientation, so the customer must confirm the finishing' : ''}. Status: ${pl.status}.`,
        action: pl.action };
    }
    if (pl) {
      return { status: 'WARNING', manual: false, scenario: 'otherSize', found, required,
        detail: `Orientation mismatch: the artwork is ${art.toLowerCase()} but the order is ${order.toLowerCase()} (${printW}" W × ${printH}" H), and the artwork is not the ordered size turned. ${SopRules.SOURCES.placement}, case ${pl.cases}: proof in the ordered orientation, customer approval required. Status: ${pl.status}.`,
        action: pl.action };
    }
    return { status: 'FAIL', found, required,
      detail: `Orientation mismatch: the artwork is ${art.toLowerCase()} but the order is ${order.toLowerCase()} (${printW}" W × ${printH}" H).`,
      action: 'Confirm with the customer whether the order size is the wrong way round, or ask for artwork in the ordered orientation.' };
  },

  /**
   * Finishing card for banners: what the file name says (grommets, pole pockets, hems), where it goes on this
   * size and the production canvas it needs. Grommet counts per side come from the SOP grommet table.
   */
  finishingCheck(sop, printW, printH) {
    if (!sop || sop.family !== 'banner' || typeof SopRules === 'undefined') return null;
    const c = sop.canvas || {};
    const fin = c.finishing, lay = c.layout;
    const base = { id: 'finishing', name: 'Finishing (grommets · pole pockets · hems)', icon: '🪢',
      required: 'As the file name states — SOP grommet table (count per side by length), pole pocket +5.25" on the stated side(s), hem +1.25" only when the name says hemmed / stitched / welded edges' };
    if (!fin || !fin.found) {
      return Object.assign(base, { status: 'WARNING', manual: true,
        found: 'No grommets / pole pockets / hems in the file name',
        detail: 'The production file name does not say how this banner is finished, so grommet marks, pole pockets and hems cannot be placed automatically.',
        action: 'Confirm the finishing from the order (admin) and set it in Finishing & Hardware Details.' });
    }
    const fmt = v => +(+v).toFixed(2);
    const rows = [];
    if (lay && lay.grommets) {
      const g = lay.grommets, ps = g.perSide;
      if (g.where === 'corners') rows.push(`${g.kind}: 4 corners only.`);
      else {
        const wFt = g.widthSide ? g.widthSide.ft : fmt(printW / 12), hFt = g.heightSide ? g.heightSide.ft : fmt(printH / 12);
        rows.push(`${g.kind}: ${g.total} in total — top ${ps.top}, bottom ${ps.bottom} (width ${wFt} ft), left ${ps.left}, right ${ps.right} (height ${hFt} ft), per the SOP grommet table; centres 1" inside the finished edge`
          + `${g.spacingWIn ? `, ${g.spacingWIn}" apart across` : ''}${g.spacingHIn ? `, ${g.spacingHIn}" apart down` : ''}.`
          + `${(g.widthSide && !g.widthSide.inTable) || (g.heightSide && !g.heightSide.inTable) ? ' (Over 29.99 ft: one more every 3 ft, continuing the table.)' : ''}`);
      }
    } else if (fin.grommets && !fin.grommets.on) rows.push('No grommets.');
    if (fin.pockets) {
      rows.push(fin.pockets.sides.length
        ? `Pole pocket on the ${fin.pockets.sides.join(' & ')}: +${lay.pocketMaterial.inches}" each${lay.pocketMaterial.custom ? ` (custom ${lay.pocketMaterial.size}" in the file name${lay.pocketMaterial.unmatched ? ' — not in the SOP pocket table, check the order' : ', SOP slide 7 table'})` : ''}; no grommets on that side.`
        : 'Pole pocket — the file name does not say which side (top / top & bottom / left & right).');
    }
    const hemSides = lay ? ['top', 'bottom', 'left', 'right'].filter(s => !lay.pocketSides.includes(s) && lay.allow[s] > 0) : [];
    if (hemSides.length) rows.push(`${fin.hem ? fin.hem.kind : 'Hem'}: +${lay.allow[hemSides[0]]}" on ${hemSides.length === 4 ? 'each side' : hemSides.join(' & ')}.`);
    else if (!fin.hem) rows.push('No hem in the file name — no hem allowance added.');
    if (fin.adhesiveTabs) rows.push('Adhesive tabs: print at the order size.');
    rows.push(`Production canvas ${c.wIn}" × ${c.hIn}" (finished ${printW}" × ${printH}").`);
    const unsure = fin.pockets && fin.pockets.sides.length === 0;
    const fromName = fin.source === 'filename';
    return Object.assign(base, {
      status: unsure || !fromName ? 'WARNING' : 'PASS', manual: true,   // confirm the finishing from the order
      found: `${fromName ? 'File name' : 'Finishing options (not in file name)'}: "${fin.words.join(' · ')}" → ${SopRules.describeFinishing(fin, lay)}`,
      detail: rows.join(' '),
      action: unsure ? 'Check the order for the pole pocket side before creating the file.'
        : !fromName ? 'The file name does not state the finishing — confirm it with the order before creating the file.'
        : 'Check the grommet marks, pocket and hem on the canvas match the file name before creating the design file.'
    });
  },

  /**
   * Which proofs to send, per PR-DPO-03 Rev 15 · 2. Proof Process and PR-DPO-04 File requirement:
   * Proof 01 small size proof (always) · Proof 02 template based proof (template products) · Proof 03 print
   * preview screenshot ONLY for low resolution / print-quality concerns · mockup when the product needs one.
   */
  proofPlanCheck(analysis, spec, sop, printW, printH, resConcern) {
    if (typeof SopRules === 'undefined') return null;
    const parsed = analysis.parsedFilename || {};
    const req = SopRules.fileRequirement(spec, parsed);
    const templateBased = SopRules.isTemplateBased(spec, parsed);
    const fin = sop && sop.canvas && sop.canvas.finishing;
    const lay = sop && sop.canvas && sop.canvas.layout;
    const customFinishing = !!(fin && ((fin.pockets && fin.pockets.sides.length) || (lay && lay.grommets && lay.grommets.where !== 'all')));
    const zoom = SopRules.inspectZoom({ widthIn: printW, heightIn: printH });
    const proofs = ['Proof 01 · Small size proof'];
    if (templateBased) proofs.push('Proof 02 · Template based proof');
    if (resConcern) proofs.push('Proof 03 · Print preview screenshot');
    const mockup = req && /^yes$/i.test(req.mockupSend) ? 'Send a mockup with the proof (file requirement sheet).'
      : req && /^yes$/i.test(req.mockupIfInsist) ? 'Mockup only if the customer insists.' : '';
    const notes = [];
    notes.push(resConcern
      ? `Artwork gives ${resConcern.ppi} PPI at the ordered size; SOP asks ${resConcern.target} PPI. Send the Print preview screenshot (${zoom.label}) and highlight the low-resolution area.`
      : 'No resolution concern — the Print preview screenshot is not needed (send it only for low resolution or a print-quality concern; customers misread it otherwise).');
    if (customFinishing) notes.push(`Custom finishing (${SopRules.describeFinishing(fin, lay)}) — highlight it on the proof.`);
    if (mockup) notes.push(mockup);
    if (req) notes.push(`File requirement: ${req.vendor || '—'} · process file ${req.processFormat || '—'} (.pdf) · print file ${req.printFormat || '—'} (${req.printExt || '.pdf'})${req.differentProcess ? ' · different process — see the product SOP' : ''}.`);
    notes.push('Proof files: JPG, RGB.');
    return {
      id: 'proofPlan', name: 'Proof to send (PR-DPO-03)', icon: '🖼️',
      resConcern, templateBased, customFinishing,          // read by Proof Studio
      status: resConcern ? 'WARNING' : 'PASS',
      found: proofs.join(' · ') + (mockup ? ' · Mockup' : ''),
      required: 'Proof 01 always · Proof 02 for template products · Proof 03 only for low resolution / print-quality concern · JPG, RGB',
      detail: notes.join(' '),
      action: resConcern ? 'Use the "Low Resolution File" status and attach the Print preview screenshot — sending this status (or a print-quality comment) without it is a designer error.' : ''
    };
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
    let resConcern = null;     // { ppi, target } when the artwork is below the SOP resolution → Proof 03 needed
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
      if (t.ppiAtOrder < target) resConcern = { ppi: t.ppiAtOrder, target };

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
      // PR-DPO-03 artwork placement: not the ordered size → adjust (open) / stretch (flattened) with approval
      const plS = (typeof SopRules !== 'undefined' && !t.rotated)
        ? SopRules.placement(analysis.pixelWidth, analysis.pixelHeight, { widthIn: printW, heightIn: printH }, sop && sop.canvas && sop.canvas.finishing, ext)
        : null;
      const placementAction = plS && plS.kind === 'otherSize' ? `${plS.action} Status: ${plS.status} (SOP placement case ${plS.cases}).` : '';
      checks.push({
        id: 'sizeTransform',
        name: 'Size Transform to Order',
        icon: '📐',
        status: st,
        found: `${hybridLabel}${analysis.pixelWidth} × ${analysis.pixelHeight} px (${analysis.aspectRatioArtwork}:1) → ${printW}" × ${printH}" = ${t.ppiAtOrder} PPI${t.rotated ? ' (artwork rotated vs order)' : ''}`,
        required: `${reqTol} · Target ${target} PPI (min ${minResolution}) · Canvas ${canvasTxt}`,
        detail: `${fitTxt}${sop?.resolution?.source ? ` ${sop.resolution.source}.` : ''}`,
        action: st === 'PASS' ? '' : [
          t.ppiAtOrder < target
            ? `Artwork gives ${t.ppiAtOrder} PPI at order size; SOP asks ${target} PPI. Use the "Low Resolution File" status and attach the Print preview screenshot proof (Proof 03) highlighting the low-resolution area — PR-DPO-03.`
            : '',
          actualDiff > 1.5 ? (placementAction || 'Confirm with customer: extend background to fill the order size, or crop edge allowance.') : ''
        ].filter(Boolean).join(' ')
      });
    } else {
      checks.push({
        id: 'sizeTransform',
        name: 'Size Transform to Order',
        icon: '📐',
        status: 'WARNING', manual: true,
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
    let vStatus = 'PASS', vFound = '', vDetail = '', vAction = '', vManual = false;
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
        vStatus = 'WARNING'; vManual = true;
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
      manual: vManual,
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
      : { status: 'WARNING', manual: true, found: 'Not checked', detail: 'Artwork QA scanner not loaded.', action: 'Inspect the artwork at 100% zoom.' };

    checks.push({
      id: 'linesAndDots',
      name: 'Lines & Dots (stray marks) · Spelling',
      icon: '🔍',
      status: qa.status,
      manual: !!qa.manual,
      found: qa.found,
      required: 'No unwanted lines, dots or smudges on the artwork',
      detail: qa.detail,
      action: qa.action,
      aiDefects: aiDefects
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 6: Safe Area — text (OCR) and logos measured against the safe zone (SafeZoneCheck); updated
    // when the text reading finishes. Shaped products / unreadable files stay a look by eye.
    // ──────────────────────────────────────────────────────────────────────────
    checks.push((typeof SafeZoneCheck !== 'undefined')
      ? SafeZoneCheck.check({ analysis, spec, dimensions: { widthIn: printW, heightIn: printH } })
      : {
      id: 'safeArea',
      name: 'Safe Area Margins',
      icon: '🛡️',
      status: 'WARNING',
      manual: true,
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
    // CHECKPOINT 7.5: Banner finishing exactly as the production file name states it
    // (grommets per the SOP Standard Grommets Placement table, pole pockets / hems on the stated sides)
    // ──────────────────────────────────────────────────────────────────────────
    const fc = this.finishingCheck(sop, printW, printH);
    if (fc) checks.push(fc);
    const pp = this.proofPlanCheck(analysis, spec, sop, printW, printH, resConcern);
    if (pp) checks.push(pp);

    // ──────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 8: Colour — RGB → CMYK (neon / bright colours), colours merging in print, opacity
    // ──────────────────────────────────────────────────────────────────────────
    // The pixel analysis runs in the background (ColorCheck.run); until it is done the card says "checking"
    checks.push((typeof ColorCheck !== 'undefined') ? ColorCheck.check(analysis) : {
      id: 'colorMode', name: 'Colour: RGB → CMYK · Merge · Opacity', icon: '🎨', status: 'WARNING', manual: true,
      found: 'Not checked automatically', required: 'CMYK (8-bit) · U.S. Web Coated (SWOP) v2',
      detail: `SOP PS Settings: print production requires CMYK (8-bit) with colour profile 'Working CMYK: U.S. Web Coated (SWOP) v2'.`,
      action: 'In Photoshop / Illustrator: View › Gamut Warning with SWOP v2 — bright RGB greens and blues print duller in CMYK.'
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
      : { status: 'WARNING', manual: true, found: 'Manual review required', detail: 'Proofread names, phone numbers, web addresses and dates.', action: '' }));

    // Apply designer overrides
    checks.forEach(c => {
      if (overrides[c.id]) {
        c.isOverridden = true;
        c.overrideReason = overrides[c.id];
      }
    });

    const report = {
      productName: spec.name,
      checks,
      analysis,
      spec,
      dimensions: { widthIn: printW, heightIn: printH }
    };
    this.tally(report);
    return report;
  },

  /**
   * The SOP Quality Score has two results only (team request, Oct 2026): Passed or Critical.
   *  · an issue the tool found → Critical
   *  · something the tool cannot decide alone — a look by eye (safe area, bleed, font size), a reading still
   *    running, a reminder, the proof guide — → "Confirm by eye": listed separately, never scored
   */
  MANUAL_ALWAYS: ['bleed', 'fontSizes', 'proofPlan'],

  settle(check) {
    if (this.MANUAL_ALWAYS.includes(check.id)) check.status = 'INFO';
    else if (check.status === 'WARNING') check.status = check.manual ? 'INFO' : 'FAIL';
    return check;
  },

  /** Settle every check and (re)compute the score, verdict and counts of a report */
  tally(report) {
    const checks = report.checks || [];
    checks.forEach(c => this.settle(c));
    const fails = checks.filter(c => c.status === 'FAIL' && !c.isOverridden).length;
    const passes = checks.filter(c => c.status === 'PASS' || c.isOverridden).length;
    const manual = checks.filter(c => c.status === 'INFO' && !c.isOverridden).length;
    let score = Math.max(0, 100 - fails * 20);
    if (report.analysis && report.analysis.isVector) score = Math.min(100, score + 5);
    const overall = fails > 0 ? 'FAIL' : 'PASS';
    const summary = fails > 0
      ? `${fails} critical issue${fails > 1 ? 's' : ''} to fix before proofing.`
      : 'All automated SOP checks passed. Artwork is ready for customer proofing.';
    return Object.assign(report, { score, overall, summary, counts: { passes, fails, manual } });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PrecheckEngine;
}
