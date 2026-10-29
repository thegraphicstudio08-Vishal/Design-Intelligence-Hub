/**
 * Design Intelligence Hub - SOP Pre-Check Engine
 * Evaluates the 10 automated checkpoints defined in BannerBuzz SOPs & Design Projects brief.
 */

/** A size as the order states it: '300 × 60 cm (118.11" × 23.62")' for a mm / cm / m order, '24" × 48"' otherwise */
function orderSizeText(w, h) {
  return typeof SopRules !== 'undefined' && SopRules.sizeText ? SopRules.sizeText(w, h) : `${w}" × ${h}"`;
}

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
    const r = this._orientationCheck(analysis, spec, dims);
    const tp = analysis && analysis.templatePanel;
    if (tp && r && r.detail) r.detail = this._templatePanelNote(tp) + ' ' + r.detail;
    return r;
  },

  /** Where size / orientation were measured when the artwork is made for a template layout */
  _templatePanelNote(tp) {
    const kind = tp.kind || (tp.web ? 'website design template' : 'QNAP template');
    return tp.on === 'shape'
      ? `Matched by its outline to the ${kind} “${tp.name}” — the artwork measures ${tp.w}" × ${tp.h}" on it.`
      : tp.on === 'front'
        ? `Placed centred on the ${tp.area || 'Front panel'} of the ${kind} “${tp.name}” — the artwork prints at ${tp.w}" × ${tp.h}".`
        : `Measured on the ${kind} panel “${tp.name}” (${tp.w}" × ${tp.h}"${tp.product ? ' — ' + tp.product : ''}).`;
  },

  _orientationCheck(analysis, spec, dims) {
    const printW = dims.widthIn, printH = dims.heightIn;
    const sop = spec && spec._sop;
    const insp = (typeof AgenticAiInspector !== 'undefined') ? AgenticAiInspector : null;
    const text = insp ? insp.textResult : null;
    const textBusy = insp && ['loading', 'reading', 'idle'].includes((insp.textState || {}).status) && !insp.scanSkipReason;
    const turn = text && text.orientation ? text.orientation.angle : 0;
    const order = analysis.orientationOrder;
    const art = analysis.orientationArtwork;
    const size = analysis.detectedInchesW
      ? ` ${orderSizeText(analysis.detectedInchesW, analysis.detectedInchesH)}`
      : (analysis.pixelWidth ? ` ${analysis.pixelWidth} × ${analysis.pixelHeight} px` : '');
    const textTxt = turn
      ? (turn === 180 ? 'text reads upside down' : 'text reads sideways')
      : text && text.orientation && text.orientation.readable ? 'text reads upright'
        : textBusy ? 'checking text direction…' : text ? 'too little text to confirm its direction' : 'text direction not checked';
    const found = `Artwork page: ${art || 'Unknown'}${size} · Order: ${order} ${orderSizeText(printW, printH)} · ${textTxt}`;
    const required = `${order} artwork, text upright`;
    const slugName = `${(spec && spec.slug) || ''} ${(spec && spec.name) || ''}`.toLowerCase();
    const bothWays = /flag/.test(slugName) && /clip|suction/.test(slugName);
    const pageMismatch = art && art !== 'Unknown' && !analysis.orientationMatch;

    if (turn) {
      const howTo = turn === 90 ? '90° clockwise' : turn === 270 ? '90° anticlockwise' : '180°';
      const pageNote = pageMismatch
        ? ` The page is ${art.toLowerCase()} while the order is ${order.toLowerCase()} (${orderSizeText(printW, printH)}).`
        : '';
      return {
        status: 'FAIL', found, required,
        detail: `The text on the artwork ${turn === 180 ? 'is upside down' : 'runs sideways'}: it only reads correctly when the artwork is turned ${howTo}.${pageNote}`,
        action: `Rotate the artwork ${howTo}${pageMismatch || turn !== 180 ? ` and place it on the ${orderSizeText(printW, printH)} ${order.toLowerCase()} canvas` : ''} before creating the design file, or confirm with the customer.`
      };
    }
    if (!art || art === 'Unknown') {
      return { status: 'WARNING', manual: true, found, required,
        detail: 'The artwork size could not be read, so its orientation cannot be compared with the order automatically.',
        action: `Confirm the artwork is ${order.toLowerCase()} (${printW}" W × ${printH}" H) and the text is upright.` };
    }
    if (!pageMismatch) {
      return { status: 'PASS', found, required,
        detail: `Artwork orientation (${art}) matches the order (${orderSizeText(printW, printH)})${text && text.orientation && text.orientation.readable ? ' and the text reads upright' : ''}.`,
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
      required: 'As the file name states — SOP grommet table (count per side by length), pole pocket on the stated side(s) +5.25" single-sided / +4" double-sided (stitch 3" in), hem +1.25" only when the name says hemmed / stitched / welded edges' };
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
        ? `Pole pocket on the ${fin.pockets.sides.join(' & ')}: +${lay.pocketMaterial.inches}" each${lay.pocketMaterial.custom ? ` (custom ${lay.pocketMaterial.size}" in the file name${lay.pocketMaterial.unmatched ? ' — not in the SOP pocket table, check the order' : ', SOP slide 7 table'})` : ''}${lay.pocketMaterial.doubleSided && !lay.pocketMaterial.custom ? ` — double-sided banner, stitch ${lay.pocketMaterial.stitchIn}" in from the trim (SOP 1_Banners slides 10, 18, 25), front and back files` : ''}; no grommets on that side.`
        : 'Pole pocket — the file name does not say which side (top / top & bottom / left & right).');
    }
    const hemSides = lay ? ['top', 'bottom', 'left', 'right'].filter(s => !lay.pocketSides.includes(s) && lay.allow[s] > 0) : [];
    if (hemSides.length) rows.push(`${fin.hem ? fin.hem.kind : 'Hem'}: +${lay.allow[hemSides[0]]}" on ${hemSides.length === 4 ? 'each side' : hemSides.join(' & ')}.`);
    else if (!fin.hem) rows.push('No hem in the file name — no hem allowance added.');
    if (fin.adhesiveTabs) rows.push('Adhesive tabs: print at the order size.');
    rows.push(`Production canvas ${orderSizeText(c.wIn, c.hIn)} (finished ${orderSizeText(printW, printH)}).`);
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
    const statusName = resConcern && resConcern.status === 'fuzzy' ? 'Bit Fuzzy' : 'Low Resolution';
    notes.push(resConcern
      ? `Status: ${statusName}. ${resConcern.blur ? `Artwork has ${resConcern.filePpi} PPI by pixel count but looks like about ${resConcern.ppi} PPI zoomed in at print size` : `Artwork gives ${resConcern.ppi} PPI at the ordered size`}; SOP asks ${resConcern.target} PPI. Send the Print preview screenshot (${zoom.label}) and highlight the soft area.`
      : 'Status: Good to Go — no resolution concern; the Print preview screenshot is not needed (send it only for low resolution or a print-quality concern; customers misread it otherwise).');
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
      action: resConcern ? `Use the "${statusName}" status and attach the Print preview screenshot — sending this status (or a print-quality comment) without it is a designer error.` : ''
    };
  },

  /**
   * Real detail of a raster artwork (DetailCheck, measured in app.js before the evaluation): 'critical' when an
   * enlarged picture's real detail is under the SOP minimum; 'look' (confirm by eye) when its real detail — or that
   * of its enlarged part — is under the target; null when it is sharp at print size or not measured. Same rule as
   * the print-quality status (PrintQuality: edges up to 2 px count as made at size).
   */
  _blur(analysis, ppi, target, min) {
    const det = analysis && analysis.detail;
    if (!det || det.verdict === 'unknown' || typeof PrintQuality === 'undefined' || !(ppi > 0)) return null;
    const e = PrintQuality.enlargement(det);
    if (!e) return null;
    const real = Math.round(ppi / e.all), realPart = e.part ? Math.round(ppi / e.part) : null;
    // the least sharp part decides, like the print-quality status (an enlarged logo beside sharp text fails too)
    const level = (e.all > 1 && real < min) || PrintQuality.partLow(realPart, min) ? 'critical'
      : (e.all > 1 && real < target) || (realPart && realPart < target) ? 'look' : null;
    return { det, real: realPart && e.all === 1 ? realPart : real, enlarge: e.part && e.all === 1 ? e.part : e.all, level };
  },

  BLANK_MIN: 10,          // % of the ordered size left empty from which the blank space is an error (alert)
  BLANK_NO_STRETCH: 25,   // % empty from which stretching would distort the artwork too much (more than ×1.33)

  /**
   * Blank space when the artwork is placed whole (not distorted) on the ordered size — SopRules.transform's
   * letterbox. Null below BLANK_MIN, or when the artwork is the ordered size turned (the orientation alert).
   */
  _blankSpace(t, W, H) {
    if (!t || !(t.blankPct >= this.BLANK_MIN) || t.rotated) return null;
    const lr = t.gapIn.w >= t.gapIn.h;
    const gap = lr ? t.gapIn.w : t.gapIn.h;
    return { pct: t.blankPct, coverPct: +(100 - t.blankPct).toFixed(1), artIn: t.fitSizeIn, orderIn: { w: W, h: H },
      gapIn: gap, eachIn: +(gap / 2).toFixed(2), sides: lr ? 'left and right' : 'above and below', axis: lr ? 'w' : 'h',
      stretch: t.stretch, noStretch: t.blankPct >= this.BLANK_NO_STRETCH, ppiWhole: t.ppiIfFitted, ppiStretched: t.ppiAtOrder,
      cropPct: t.cropPctIfFilled };
  },

  /**
   * Blank space on a PDF design file: a page in another proportion than the order (AU2430882: page 100 × 50 cm on a
   * 300 × 60 cm order) placed whole leaves part of the ordered size empty. Only when the page does not fit the order
   * (the page-size check failed): a larger page is bleed or a template allowance, a 1:N page has the order's
   * proportion, and a page in the production canvas's proportion (pole pockets / hems) is not blank. No PPI — the
   * page's pictures are measured where they are placed (pc-ppi).
   */
  _pageBlankSpace(analysis, design, W, H, sop) {
    const size = design.checks.find(c => c.id === 'pc-size');
    const pw = analysis.detectedInchesW, ph = analysis.detectedInchesH;
    if (!size || size.status !== 'FAIL' || !(pw > 0 && ph > 0) || typeof SopRules === 'undefined') return null;
    const cv = sop && sop.canvas && sop.canvas.confirmed ? sop.canvas : null;
    if (cv && SopRules.transform(pw, ph, { widthIn: cv.wIn, heightIn: cv.hIn }, sop).blankPct < this.BLANK_MIN) return null;
    const b = this._blankSpace(SopRules.transform(pw, ph, { widthIn: W, heightIn: H }, sop), W, H);
    if (!b) return null;
    Object.assign(b, { pdfPage: true, pageIn: { w: pw, h: ph }, ppiWhole: null, ppiStretched: null });
    // (the design result is kept per file and the report is made again on every re-check: said once)
    const say = `Placed whole on the order, the page covers ${b.coverPct}% of it — ${SopRules.lenText(b.gapIn)} (${b.pct}%) would print empty ${b.sides}${b.noStretch ? `; stretched to fill it would be distorted ×${b.stretch}` : ''}.`;
    if (!String(size.detail || '').includes('Placed whole on the order')) size.detail = `${size.detail || ''} ${say}`.trim();
    return b;
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
      ? `${orderSizeText(canvas.wIn, canvas.hIn)}${canvas.confirmed ? ` (${canvas.note})` : ' (finishing allowance not confirmed — use template)'}`
      : '—';
    const diffPct = analysis.aspectRatioMismatchPercent || 0;
    let resConcern = null;     // { ppi, target } when the artwork is below the SOP resolution → Proof 03 needed
    let printQuality = null;   // PrintQuality status: Good to Go / Bit Fuzzy / Low Resolution
    let blankSpace = null;     // the artwork placed whole leaves part of the ordered size empty (_blankSpace)
    const reqTol = `${orderSizeText(printW, printH)} (±0.5" SOP tolerance)`;
    // A PDF design file read by PostCheck: its page size, per-picture resolution and real detail, colour mode and
    // fonts replace the artwork size / resolution cards (it measures every picture where it is placed)
    const design = analysis.design && analysis.design.checks ? analysis.design : null;

    if (design) {
      design.checks.forEach(c => checks.push(c));
      resConcern = design.resConcern;
      printQuality = design.quality || null;
      blankSpace = this._pageBlankSpace(analysis, design, printW, printH, sop);
    } else if (analysis.isVector && !analysis.embeddedRasterFound) {
      if (typeof PrintQuality !== 'undefined') printQuality = PrintQuality.vector();
      const art = analysis.detectedInchesW ? `${orderSizeText(analysis.detectedInchesW, analysis.detectedInchesH)} artboard` : 'Vector artwork';
      const aspectInfo = analysis.aspectRatioArtwork ? ` (Ratio: ${analysis.aspectRatioArtwork}:1)` : '';
      checks.push({
        id: 'sizeTransform',
        name: 'Size Transform to Order',
        icon: '📐',
        status: (diffPct > 5.0) ? 'FAIL' : (diffPct > 1.5) ? 'WARNING' : 'PASS',
        found: `${art}${aspectInfo} → Order: ${orderSizeText(printW, printH)}`,
        required: `${reqTol} · Print canvas ${canvasTxt}`,
        detail: `Vector artwork scales to the ordered size without resolution loss.${diffPct > 1.5 ? ` Aspect ratio difference: Δ ${diffPct}%.` : ' Aspect ratio matches order dimensions.'}`,
        action: canvas && canvas.confirmed ? `Create production canvas at ${orderSizeText(canvas.wIn, canvas.hIn)} (${canvas.source}).` : ''
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
      // Blank space: placed whole (not distorted) the artwork leaves part of the ordered size empty. A small
      // difference is stretched to the size (SOP placement 12 / 14) — its PPI is the stretched one; a large one
      // cannot be stretched, so the resolution is the artwork's placed whole and the blank space is the error
      const blank = this._blankSpace(t, printW, printH);
      const ppiAt = blank && blank.noStretch ? t.ppiIfFitted : t.ppiAtOrder;
      // The pixel count against the detail in the pixels: a small picture enlarged to the PPI still prints soft
      const blur = analysis.isVector ? null : this._blur(analysis, ppiAt, target, minResolution);
      const blurCrit = !!(blur && blur.level === 'critical');
      // the status to set (Good to Go / Bit Fuzzy / Low Resolution): what the artwork looks like at print size
      if (!analysis.isVector && typeof PrintQuality !== 'undefined') {
        printQuality = PrintQuality.assess({ ppi: ppiAt, det: analysis.detail, target, min: minResolution });
        if (printQuality) printQuality.sample = analysis.detail && analysis.detail.sample;
        // the whole artwork for the zoomed print preview (moved around by hand): the uploaded picture itself
        if (printQuality && !analysis.renderedFromPdf && analysis.previewDataUrl && !String(analysis.previewDataUrl).includes('PDF VECTOR')) {
          printQuality.full = { url: analysis.previewDataUrl, w: analysis.pixelWidth, h: analysis.pixelHeight };
        }
      }
      if (printQuality && printQuality.status !== 'good') {
        resConcern = { ppi: printQuality.real, target, status: printQuality.status, blur: printQuality.real < ppiAt, filePpi: ppiAt };
      } else if (!printQuality && ppiAt < target) resConcern = { ppi: ppiAt, target };
      else if (!printQuality && blurCrit) resConcern = { ppi: blur.real, target, blur: true, filePpi: ppiAt };

      let st = ppiAt >= target ? 'PASS' : ppiAt >= minResolution ? 'WARNING' : 'FAIL';
      if (st === 'PASS' && (t.ratioDiffPct > 1.5 || diffPct > 1.5)) st = 'WARNING';
      if (diffPct > 5.0 || t.ratioDiffPct > 5.0) st = 'FAIL';
      let manual = false;
      if (blurCrit) st = 'FAIL';
      else if (blur && blur.level === 'look' && st === 'PASS') { st = 'WARNING'; manual = true; }
      const blurWord = blur && (blur.det.verdict === 'sharp' ? 'partly enlarged' : blur.det.verdict);

      const actualDiff = t.ratioDiffPct || diffPct;
      const isHybrid = analysis.isVector && analysis.embeddedRasterFound;
      const fitTxt = actualDiff <= 1.5
        ? (isHybrid
            ? `Hybrid Design: Vector contours scale infinitely; embedded raster (${analysis.pixelWidth}×${analysis.pixelHeight} px) matches order aspect ratio within tolerance.`
            : 'Artwork aspect ratio and dimensions match the order within tolerance.')
        : `Proportion differs by ${actualDiff}% (Artwork ${analysis.aspectRatioArtwork || 'custom'}:1 vs Order ${analysis.aspectRatioOrder || +(printW/printH).toFixed(2)}:1): placed whole it covers ${t.fitSizeIn.w}" × ${t.fitSizeIn.h}"${t.blankPct != null ? ` of ${orderSizeText(printW, printH)} (blank ${t.gapIn.w ? t.gapIn.w + '" W' : t.gapIn.h + '" H'} = ${t.blankPct}% of the size, to extend with background) at ${t.ppiIfFitted} PPI` : ''}; stretched to fill it is distorted ×${t.stretch || '—'} at ${t.ppiAtOrder} PPI; filled without distortion it crops ${t.cropPctIfFilled}% of the artwork.`;

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
        manual,
        lowPpi: ppiAt < target || blurCrit,
        blank,
        // the real error in plain words (the card shows it first; the pixel maths is in "More details")
        error: st === 'PASS' ? '' : [
          blank ? `Blank space: placed whole the artwork covers ${blank.artIn.w}" × ${blank.artIn.h}" of the ${orderSizeText(printW, printH)} order — ${blank.gapIn}" (${blank.pct}% of the size) would print empty ${blank.sides}` : '',
          ppiAt < target ? `${ppiAt < minResolution ? 'Low Resolution' : 'Bit Fuzzy'}: ${ppiAt} PPI at the ordered size ${orderSizeText(printW, printH)}${blank && blank.noStretch ? ' (artwork placed whole)' : ''} — SOP needs ${target} PPI (minimum ${minResolution})` : '',
          blurCrit ? `Enlarged / blurry picture: ${ppiAt} PPI by pixel count, but the real detail is about ${blur.real} PPI — enlarged about ${blur.enlarge}× from a smaller picture${ppiAt >= target ? ` (SOP needs ${target} PPI)` : ''}` : '',
          !blank && actualDiff > 1.5 ? `Artwork proportion differs ${actualDiff}% from the order` : ''
        ].filter(Boolean).join(' · '),
        found: `${hybridLabel}${analysis.pixelWidth} × ${analysis.pixelHeight} px (${analysis.aspectRatioArtwork}:1) → ${orderSizeText(printW, printH)} = ${ppiAt} PPI${blank && blank.noStretch ? ` placed whole (${blank.coverPct}% of the size)` : ''}${t.rotated ? ' (artwork rotated vs order)' : ''}${blur && blur.level ? ` · picture looks ${blurWord}: real detail ≈ ${blur.real} PPI` : ''}`,
        required: `${reqTol} · Target ${target} PPI (min ${minResolution}) · Canvas ${canvasTxt}`,
        detail: `${fitTxt}${sop?.resolution?.source ? ` ${sop.resolution.source}.` : ''}${analysis.detail && typeof DetailCheck !== 'undefined' ? ` Real detail: ${DetailCheck.describe(analysis.detail, ppiAt)}` : ''}`,
        action: st === 'PASS' ? '' : [
          blank ? (blank.noStretch
            ? `Do not stretch it (it would be distorted ×${blank.stretch}): extend the background or rearrange the design to fill ${orderSizeText(printW, printH)}, or ask the customer for artwork made at that size — customer approval, Design Review (PR-DPO-03 artwork placement).`
            : `Extend the background to fill ${orderSizeText(printW, printH)} (stretching would distort the artwork ×${blank.stretch}) — customer approval, Design Review (PR-DPO-03 artwork placement).`) : '',
          ppiAt < target || blurCrit
            ? `${blurCrit ? 'Ask the customer for the original (larger) picture or a vector logo; if there is nothing better, use' : 'Use'} the "${printQuality && printQuality.status !== 'good' ? printQuality.label : 'Low Resolution'}" status and attach the Print preview screenshot proof (Proof 03) highlighting the soft area — PR-DPO-03.`
            : '',
          manual ? 'Look at the artwork at print size (Photoshop "Print Size"); if it looks soft, use the "Bit Fuzzy" status with the Print preview screenshot (Proof 03).' : '',
          !blank && actualDiff > 1.5 ? (placementAction || 'Confirm with customer: extend background to fill the order size, or crop edge allowance.') : ''
        ].filter(Boolean).join(' ')
      });
      if (blank) blankSpace = blank;
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
          : `Target print size: ${orderSizeText(printW, printH)}. Ensure document artboard matches ordered dimensions.`,
        action: `Verify artboard size matches order size (${orderSizeText(printW, printH)}) and effective resolution ≥ ${sop?.resolution?.target || reqDpi} PPI in Adobe software.`
      });
    }

    // Canopy walls & co.: the size is checked on the QNAP template panel, not the product's nominal size
    if (analysis.templatePanel) {
      const tp = analysis.templatePanel, sz = checks.find(c => c.id === 'sizeTransform');
      if (sz) sz.detail = this._templatePanelNote(tp) + ' ' + sz.detail;
    }
    // Front and back in one print file: measured on the two-face sheet (app.js twoFaceSheet)
    if (analysis.twoFaces) {
      const tf = analysis.twoFaces, sz = checks.find(c => c.id === (design ? 'pc-size' : 'sizeTransform'));
      if (sz) {
        sz.found = `2 faces in one file (${tf.layout === 'stacked' ? 'front and back stacked' : 'side by side'}) · ${sz.found}`;
        sz.detail = `The file holds both faces of the order (each ${tf.faceW}" × ${tf.faceH}"), ${tf.layout === 'stacked' ? 'one above the other' : 'side by side'}${tf.alike ? ' — the two faces carry the same design' : ''}: size, resolution and orientation are measured on the whole sheet, ${tf.w}" × ${tf.h}". ${sz.detail || ''}`;
      }
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
      // blank space too large to stretch: judged with the artwork placed whole, like the size card
      const whole = !!(blankSpace && blankSpace.noStretch);
      const dpi = whole ? blankSpace.ppiWhole : analysis.effectiveDpi;
      const good = whole ? dpi >= reqDpi : analysis.isGoodForPrint;
      const wholeTxt = whole ? ` with the artwork placed whole at ${printW}"×${printH}" (it covers ${blankSpace.coverPct}% of the size — see Size & resolution)` : '';
      const gBlur = this._blur(analysis, dpi, reqDpi, minDpi);
      if (gBlur && gBlur.level === 'critical') {
        vStatus = 'FAIL';
        vFound = `Raster (${dpi} DPI) · enlarged picture, real detail ≈ ${gBlur.real} PPI`;
        vDetail = `NOT GOOD FOR PRINT: ${DetailCheck.describe(gBlur.det, dpi)}`;
        vAction = `Request the original (larger) picture or vector artwork from the customer (minimum ${reqDpi} DPI of real detail at ${printW}"×${printH}").`;
      } else if (gBlur && gBlur.level === 'look' && good) {
        vStatus = 'WARNING'; vManual = true;
        vFound = `Raster (${dpi} DPI) · looks ${gBlur.det.verdict === 'sharp' ? 'partly enlarged' : gBlur.det.verdict}, real detail ≈ ${gBlur.real} PPI`;
        vDetail = DetailCheck.describe(gBlur.det, dpi);
        vAction = 'Look at the artwork at print size; if it looks soft, treat it as a low-resolution file.';
      } else if (good) {
        vStatus = 'PASS';
        vFound = `Raster (${dpi} DPI)`;
        vDetail = whole ? `GOOD FOR PRINT: ${dpi} PPI${wholeTxt}; SOP ${reqDpi} PPI.` : `GOOD FOR PRINT: ${analysis.goodForPrintReason}`;
      } else if (whole) {
        vStatus = dpi >= minDpi ? 'WARNING' : 'FAIL';
        vFound = `Raster (${dpi} DPI)`;
        vDetail = `${dpi >= minDpi ? 'Borderline' : 'Low'} resolution: ${dpi} PPI${wholeTxt}; SOP ${reqDpi} PPI (minimum ${minDpi}).`;
        vAction = `Request higher resolution artwork from the customer (minimum ${reqDpi} DPI at ${printW}"×${printH}") or vector format.`;
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
    if (!design) checks.push({
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
      dimensions: { widthIn: printW, heightIn: printH },
      printQuality,
      blankSpace
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
    // One cause, one issue: a raster file too small for the order fails "Print Suitability" for the same reason as
    // "Size Transform" — shown once (in the size card), not scored twice; it follows the size card when corrected
    const size = checks.find(c => c.id === 'sizeTransform'), gfp = checks.find(c => c.id === 'goodForPrint');
    if (gfp) delete gfp.duplicateOf;
    if (size && gfp && size.status === 'FAIL' && size.lowPpi && gfp.status === 'FAIL' && !(report.analysis && report.analysis.isVector)) {
      gfp.duplicateOf = 'sizeTransform';
      if (size.isOverridden && !gfp.isOverridden) { gfp.isOverridden = true; gfp.overrideReason = size.overrideReason; gfp._followed = true; }
    }
    const real = checks.filter(c => !c.duplicateOf);
    const fails = real.filter(c => c.status === 'FAIL' && !c.isOverridden).length;
    const passes = real.filter(c => c.status === 'PASS' || c.isOverridden).length;
    const manual = real.filter(c => c.status === 'INFO' && !c.isOverridden).length;
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
