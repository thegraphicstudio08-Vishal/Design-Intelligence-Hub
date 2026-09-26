/**
 * Design Intelligence Hub - SOP Rules
 * Production requirements taken from the BannerBuzz SOP decks (AI TOOL/SOP) and from real
 * production print files (Desktop/Print). Every value carries its source so the designer can
 * see WHY the tool asks for it. Anything not covered by the SOP or the print files is marked
 * `confirmed: false` instead of being guessed.
 */

const SopRules = {
  SOURCES: {
    banners: 'SOP 1_Banners · Important design checks',
    fabricMesh: 'SOP 1_Banners · Fabric Mesh Banners (artwork inside 1.5")',
    meshFence: 'SOP 1_Banners · Mesh Fence (increase canvas 2" each side, full-colour bleed)',
    clampBar: 'SOP 1_Banners · Hanging Clamp Bar (main content 1" inside edge)',
    tradeShow: 'SOP Trade Show Displays · Checklist for Designer (safe area 1.25")',
    flags: 'SOP 4_Custom Flags · safe area -0.5" / bleed +0.5" from visible part',
    dieCut300: 'SOP 6_Signs & Decals · Die cut / clear material: standard 300 ppi',
    chart125: 'Production print files (Desktop/Print): banners, flags, magnets, posters, stands printed at 125 ppi',
    chart72: 'Production print file US2382836 (36x136 in vinyl) printed at 72 ppi; SOP 1_Banners inspects at 72 ppi 100% zoom',
    small300: 'Production print files: hand flags 6x4 in and business cards printed at 300 ppi',
    hem: 'Production print files: vinyl/canvas/fabric banners with grommets or stitched edges = order size + 1.25" each side',
    polePocket: 'Production print file US2382836 (Top Pole Pocket): height + 5.25", width unchanged',
    mockup: 'SOP 1_Banners · 5) Mockup guideline (orientation change after customer approval)',
    colour: 'SOP PS Settings · CMYK 8-bit, Working CMYK U.S. Web Coated (SWOP) v2, square pixels',
    format: 'SOP · final print file saved as .PDF (die-cut artwork as .AI)'
  },

  _text(spec, parsed) {
    return [spec?.slug, spec?.name, spec?.sopFamily, parsed?.productSlug, parsed?.material]
      .filter(Boolean).join(' ').toLowerCase();
  },

  family(spec, parsed) {
    const t = this._text(spec, parsed);
    // Note: match "l-banner-stand", never bare "l-banner" (it is inside "vinyl-banners")
    if (/roll-up|banner-stand|pop-up|backdrop|step-and-repeat|tension|trade-show-display|straight-display/.test(t)) return 'display';
    if (/flag/.test(t)) return 'flag';
    if (/banner/.test(t)) return 'banner';
    if (/magnet|poster|a-frame/.test(t)) return 'sign';
    if (/decal|sticker|cling|window/.test(t)) return 'decal';
    if (/sign|magnet|a-frame|plate/.test(t)) return 'sign';
    return 'other';
  },

  /**
   * Resolution the SOP expects for this order.
   */
  resolution(spec, dims, parsed) {
    const t = this._text(spec, parsed) + ' ' + (parsed?.finishing || '').toLowerCase();
    const longest = Math.max(dims?.widthIn || 0, dims?.heightIn || 0);
    if (/die-cut|die cut|white ink|cutout|cut-out/.test(t)) {
      return { target: 300, min: 150, confirmed: true, source: this.SOURCES.dieCut300 };
    }
    if (longest > 0 && longest <= 12) {
      return { target: 300, min: 150, confirmed: true, source: this.SOURCES.small300 };
    }
    return { target: 125, min: 72, confirmed: true, source: this.SOURCES.chart125 + ' · minimum: ' + this.SOURCES.chart72 };
  },

  safeArea(spec, parsed) {
    const t = this._text(spec, parsed);
    const fam = this.family(spec, parsed);
    if (/clamp/.test(t)) return { inches: 1.0, confirmed: true, source: this.SOURCES.clampBar };
    if (/fabric-mesh|fabric mesh/.test(t)) return { inches: 1.5, confirmed: true, source: this.SOURCES.fabricMesh };
    if (fam === 'banner') return { inches: 1.25, confirmed: true, source: this.SOURCES.banners };
    if (/trade-show|straight/.test(t)) return { inches: 1.25, confirmed: true, source: this.SOURCES.tradeShow };
    if (fam === 'flag') return { inches: 0.5, confirmed: true, source: this.SOURCES.flags };
    const catalog = parseFloat(spec?.safeArea);
    return { inches: isNaN(catalog) ? null : catalog, confirmed: false, source: 'Catalog value (sop_data.js) — not stated in the SOP decks; use the product template' };
  },

  /**
   * Production canvas = order size + finishing allowance.
   */
  canvas(spec, dims, parsed) {
    const w = dims?.widthIn, h = dims?.heightIn;
    if (!(w > 0 && h > 0)) return null;
    const fam = this.family(spec, parsed);
    const t = this._text(spec, parsed);
    const fin = ((parsed?.finishing || '') + ' ' + (parsed?.fname || '')).toLowerCase();

    if (fam === 'banner') {
      if (/fence/.test(t) && /mesh/.test(t)) {
        return { wIn: w + 4, hIn: h + 4, confirmed: true, note: '+2" each side, full-colour bleed', source: this.SOURCES.meshFence };
      }
      if (/top pole pocket|top_pole_pocket/.test(fin)) {
        return { wIn: w, hIn: +(h + 5.25).toFixed(2), confirmed: true, note: 'Top pole pocket: +5.25" on height, width unchanged', source: this.SOURCES.polePocket };
      }
      if (/grommet|stitched/.test(fin)) {
        return { wIn: w + 2.5, hIn: h + 2.5, confirmed: true, note: '+1.25" hem each side', source: this.SOURCES.hem };
      }
      return { wIn: w, hIn: h, confirmed: false, note: 'Allowance for this finishing is not in the SOP decks or sample print files (see Banners finishing.xls)', source: 'Not confirmed' };
    }
    return { wIn: w, hIn: h, confirmed: false, note: 'Use the product template for bleed / finishing allowance', source: 'Template-based product' };
  },

  requirements(spec, dims, parsed) {
    return {
      family: this.family(spec, parsed),
      resolution: this.resolution(spec, dims, parsed),
      safeArea: this.safeArea(spec, parsed),
      canvas: this.canvas(spec, dims, parsed),
      orientationSwapAllowed: this.family(spec, parsed) === 'banner',
      colour: this.SOURCES.colour,
      fileFormat: this.SOURCES.format
    };
  },

  /**
   * Transform the customer's artwork to the customer-selected size and report the real result.
   * @param {number} pxW artwork pixel width
   * @param {number} pxH artwork pixel height
   * @param {Object} dims order size in inches { widthIn, heightIn }
   * @param {Object} req output of requirements()
   */
  transform(pxW, pxH, dims, req) {
    const W = dims?.widthIn, H = dims?.heightIn;
    if (!(pxW > 0 && pxH > 0 && W > 0 && H > 0)) return null;

    const artRatio = pxW / pxH;
    const orderRatio = W / H;
    const rotatedDiff = Math.abs(artRatio - 1 / orderRatio) / (1 / orderRatio);
    const straightDiff = Math.abs(artRatio - orderRatio) / orderRatio;
    const rotated = rotatedDiff + 0.001 < straightDiff && Math.abs(orderRatio - 1) > 0.02;
    // Target box the artwork has to fill, in the artwork's own orientation
    const boxW = rotated ? H : W;
    const boxH = rotated ? W : H;
    const diff = rotated ? rotatedDiff : straightDiff;

    // "Fit" = whole artwork visible (letterbox), "Fill" = cover the size (crop)
    const fitPpi = Math.min(pxW / boxW, pxH / boxH);
    const fillPpi = Math.max(pxW / boxW, pxH / boxH);
    const fitW = pxW / fitPpi, fitH = pxH / fitPpi;
    const gapW = +(boxW - fitW).toFixed(2), gapH = +(boxH - fitH).toFixed(2);
    const cropPct = +((1 - (boxW * boxH) / ((pxW / fillPpi) * (pxH / fillPpi))) * 100).toFixed(1);

    const target = req?.resolution?.target || 125;
    const canvas = req?.canvas;
    const canvasW = canvas ? (rotated ? canvas.hIn : canvas.wIn) : boxW;
    const canvasH = canvas ? (rotated ? canvas.wIn : canvas.hIn) : boxH;

    return {
      rotated,
      ratioDiffPct: +(diff * 100).toFixed(1),
      artRatio: +artRatio.toFixed(3),
      orderRatio: +orderRatio.toFixed(3),
      ppiAtOrder: Math.round(fitPpi),
      ppiIfFilled: Math.round(fillPpi),
      fitSizeIn: { w: +fitW.toFixed(2), h: +fitH.toFixed(2) },
      gapIn: { w: Math.max(0, gapW), h: Math.max(0, gapH) },
      cropPctIfFilled: Math.max(0, cropPct),
      requiredPx: { w: Math.round(canvasW * target), h: Math.round(canvasH * target) },
      canvasIn: { w: canvasW, h: canvasH }
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SopRules;
}
