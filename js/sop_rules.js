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
    hem: 'Production print files: hemmed / stitched / welded edges stated in the file name = order size + 1.25" each side (grommets alone add no hem)',
    polePocket: 'Production print file US2382836 (Top Pole Pocket): height + 5.25", width unchanged',
    resolutionChart: 'SOP Banner (ISO 2026) slide 2 + PR-DPO-03 Rev 15 · resolution chart: up to 12" 600 ppi · 12–24" 300 · 24–120" 125 · over 120" 72',
    vendorGiant: 'PR-DPO-03 Rev 15 · Giant Media vendor files at 100 ppi',
    bannerSafe: 'SOP Banner (ISO 2026) slide 6 · safe area 1" inside the visible (finished) edge',
    proof: 'PR-DPO-03 Rev 15 (23.7.2026) · 2. Proof Process',
    placement: 'PR-DPO-03 Rev 15 · Artwork placement process (custom size products, cases 1–14)',
    fileReq: 'PR-DPO-04 File requirement (Process, Proof, Print)',
    grommets: 'SOP Standard Grommets Placement table (banner height / width in ft → grommets per side, corners included)',
    hangingOptions: 'SOP 1_Banners slides 3, 9–10 · hanging options: no grommet, adhesive tabs, metal grommets, top / top & bottom / left & right pole pockets',
    pocketTable: 'SOP 1_Banners slide 7 · Custom pole pocket size (pole diameter or pole in inch → material to leave)',
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
    // "Step and Repeat Banners" (vinyl / fabric banners) are banners; the step-and-repeat stands and backdrops are displays
    if (/roll-up|banner-stand|pop-up|backdrop|tension|trade-show-display|straight-display/.test(t)
      || (/step-and-repeat/.test(t) && /stand|backdrop|tension|frame|display|adjustable/.test(t))) return 'display';
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
    // Vendor files: Giant Media 100 ppi (vendor code in the file name, e.g. "Flag_Fabric_Gian_US2396245_…")
    if (/(^|[_\-])gian([_\-]|$)/i.test(parsed?.fname || '')) {
      return { target: 100, min: 72, confirmed: true, source: this.SOURCES.vendorGiant };
    }
    // SOP resolution chart by banner size (longest side)
    const chart = !(longest > 0) ? 125 : longest <= 12 ? 600 : longest <= 24 ? 300 : longest <= 120 ? 125 : 72;
    const min = { 600: 300, 300: 150, 125: 72, 72: 54 }[chart];
    if (/die-cut|die cut|white ink|cutout|cut-out/.test(t) && chart < 300) {
      return { target: 300, min: 150, confirmed: true, source: this.SOURCES.dieCut300 };
    }
    return { target: chart, min, confirmed: true, source: this.SOURCES.resolutionChart };
  },

  /** Zoom for inspecting / the print preview screenshot: 100% for 72 ppi files (over 120"), "Print size" for the rest */
  inspectZoom(dims) {
    const longest = Math.max(dims?.widthIn || 0, dims?.heightIn || 0);
    return longest > 120 ? { mode: '100%', label: '100% zoom (72 ppi file)' } : { mode: 'print', label: 'Photoshop "Print Size"' };
  },

  safeArea(spec, parsed) {
    const t = this._text(spec, parsed);
    const fam = this.family(spec, parsed);
    if (/clamp/.test(t)) return { inches: 1.0, confirmed: true, source: this.SOURCES.clampBar };
    if (/fabric-mesh|fabric mesh/.test(t)) return { inches: 1.5, confirmed: true, source: this.SOURCES.fabricMesh };
    if (fam === 'banner') return { inches: this.BANNER_SAFE_IN, confirmed: true, source: this.SOURCES.bannerSafe };
    if (/trade-show|straight/.test(t)) return { inches: 1.25, confirmed: true, source: this.SOURCES.tradeShow };
    if (fam === 'flag') return { inches: 0.5, confirmed: true, source: this.SOURCES.flags };
    const catalog = parseFloat(spec?.safeArea);
    return { inches: isNaN(catalog) ? null : catalog, confirmed: false, source: 'Catalog value (sop_data.js) — not stated in the SOP decks; use the product template' };
  },

  // ── Banner finishing: grommets, pole pockets, hems ─────────────────────────
  // SOP Standard Grommets Placement — grommets on ONE side of that length (corners included):
  // up to 4.00 ft → 2 · 4.01–8.99 → 3 · 9.00–11.99 → 4 · … · 27.00–29.99 → 10
  GROMMET_TABLE: [[4.00, 2], [8.99, 3], [11.99, 4], [14.99, 5], [17.99, 6], [20.99, 7], [23.99, 8], [26.99, 9], [29.99, 10]],
  BANNER_SAFE_IN: 1,        // SOP Banner (ISO 2026) slide 6: safe area 1" inside the visible edge
  POCKET_IN: 5.25,          // pole pocket allowance per side (production print file US2382836)
  HEM_IN: 1.25,             // hem allowance per side, only when the file name states hemmed / stitched / welded edges
  GROMMET_INSET_IN: 1,      // grommet centre 1" inside the finished edge
  // SOP 1_Banners slide 7: pole diameter / pole in inch → material to leave (inches)
  POCKET_SIZE_TABLE: [[1, 2.25, 2.75], [1.5, 3.25, 3.75], [2, 4.25, 4.75], [2.5, 5.25, 5.75], [3, 6.25, 6.75],
    [3.5, 7.25, 7.75], [4, 8.25, 8.75], [4.5, 9.25, 9.75], [5, 10.25, 10.75], [5.5, 11.25, 11.75]],

  /**
   * This product's row of PR-DPO-04 File requirement (Process, Proof, Print): template-based or not, in-house /
   * vendor, process & print file format, whether a mockup goes with the proof. Matched by product name.
   */
  fileRequirement(spec, parsed) {
    if (typeof SOP_FILE_REQUIREMENTS === 'undefined') return null;
    const norm = t => String(t || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();
    const names = [spec?.name, parsed?.productName, spec?.slug && spec.slug.replace(/-/g, ' ')].filter(Boolean).map(norm);
    if (!this._fileReqIndex) {
      this._fileReqIndex = new Map();
      SOP_FILE_REQUIREMENTS.forEach(r => { const k = norm(r.product); if (!this._fileReqIndex.has(k)) this._fileReqIndex.set(k, r); });
    }
    for (const n of names) {
      if (this._fileReqIndex.has(n)) return this._fileReqIndex.get(n);
      const plural = n.endsWith('s') ? n.slice(0, -1) : n + 's';
      if (this._fileReqIndex.has(plural)) return this._fileReqIndex.get(plural);
    }
    return null;
  },

  /** Template-based product (Proof 02 · Template based proof): from the file requirement sheet, else the product family */
  isTemplateBased(spec, parsed) {
    const r = this.fileRequirement(spec, parsed);
    if (r) return /^yes$/i.test(r.template);
    return ['display', 'flag'].includes(this.family(spec, parsed)) || !!spec?.isShapedTemplate;
  },

  /**
   * PR-DPO-03 Artwork placement process (custom size products). Compares the artwork with the ordered size:
   *  · proper     — same size and orientation (cases 1–4): no changes
   *  · turned     — the ordered size turned (cases 5–10): update the admin to the artwork size; if the finishing
   *                 depends on the orientation (pole pockets, wind flaps) confirm it with the customer
   *  · otherSize  — not the ordered size (cases 11–14): adjust (open file) or stretch (flattened file) the artwork
   *                 to the ordered size; customer approval, Design Review
   * @param artW, artH artwork width / height (any unit); dims order size; fin bannerFinishing(); ext file extension
   */
  placement(artW, artH, dims, fin, ext) {
    const W = dims?.widthIn, H = dims?.heightIn;
    if (!(artW > 0 && artH > 0 && W > 0 && H > 0)) return null;
    const a = artW / artH, o = W / H;
    const same = Math.abs(a - o) / o <= 0.02;
    const turned = !same && Math.abs(a - 1 / o) / (1 / o) <= 0.02 && Math.abs(o - 1) > 0.02;
    const flatten = /^(jpe?g|png|gif|bmp|webp|tiff?)$/i.test(ext || '');
    const finishingConcern = !!(fin && ((fin.pockets && (fin.pockets.sides.length || fin.pocketSidesUnknown)) || fin.windFlaps));
    const fmt = v => +(+v).toFixed(2);
    if (same) {
      return { kind: 'proper', cases: '1–4', action: 'No changes required.', approval: false,
        status: 'Design Review if proof requested · V - Production if not' };
    }
    if (turned) {
      return finishingConcern
        ? { kind: 'turned', cases: '7 / 10', finishingConcern: true, approval: true, status: 'Designer Comment',
            action: `Update the admin to the artwork size (${fmt(H)}" × ${fmt(W)}") and confirm the finishing with the customer — pole pockets / wind flaps change with the orientation.` }
        : { kind: 'turned', cases: '5–6 / 8–9', finishingConcern: false, approval: false,
            status: 'Proof requested: Design Review (communicate with customer) · not requested: V - Production',
            action: `Update the admin to the artwork size (${fmt(H)}" × ${fmt(W)}"); send the proof in the artwork's orientation and notify the customer.` };
    }
    return { kind: 'otherSize', cases: flatten ? '12 / 14' : '11 / 13', flatten, approval: true, status: 'Design Review',
      action: `${flatten ? 'Stretch the artwork (flattened file)' : 'Adjust the artwork (open file)'} to the ordered size ${fmt(W)}" × ${fmt(H)}"; send the proof in the ordered orientation and notify the customer — customer approval required.` };
  },

  /** SOP reference (HTML): proof files, when to send the print preview screenshot, artwork placement, resolution */
  renderProofReference() {
    const th = 'style="text-align:left; padding:5px 8px; background:#1e3a8a; color:#fff; font-size:11px;"';
    const td = 'style="padding:4px 8px; border-bottom:1px solid #e2e8f0; vertical-align:top;"';
    return `
      <div class="sop-section" style="margin-top:14px;">
        <div class="sop-section-title">Proof process &amp; artwork placement (PR-DPO-03 Rev 15)</div>
        <div style="font-size:11.5px; color:#64748b; margin-bottom:10px;">Sources: ${this.SOURCES.proof}; ${this.SOURCES.placement}; SOP Banner (ISO 2026) slide 8; ${this.SOURCES.resolutionChart}.</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:14px; font-size:12px;">
          <div>
            <div style="font-weight:800; margin-bottom:6px;">Proof files — JPG, RGB</div>
            <ul style="margin:0; padding-left:18px; line-height:1.6; color:#334155;">
              <li><strong>Proof 01 · Small size proof</strong> — the whole artwork (every proof)</li>
              <li><strong>Proof 02 · Template based proof</strong> — template-based products only</li>
              <li><strong>Proof 03 · Print preview screenshot</strong> — ONLY for low-resolution artwork ("Low Resolution File" status) or a print-quality concern ("Design Review": slight blur, grainy, good from distance). Highlight the low-resolution area.</li>
              <li>Screenshot at 100% zoom for 72 ppi files, "Print size" for the rest</li>
              <li>Highlight custom requirements (custom grommets, pole pockets) on the proof</li>
            </ul>
            <div style="margin-top:6px; color:#b91c1c; font-weight:600;">Designer errors: "Low Resolution File" status or a print-quality comment without the print preview screenshot.</div>
          </div>
          <div>
            <div style="font-weight:800; margin-bottom:6px;">Artwork placement (custom size products)</div>
            <table style="width:100%; border-collapse:collapse;">
              <tr><th ${th}>Artwork</th><th ${th}>Action</th><th ${th}>Status</th></tr>
              <tr><td ${td}>Ordered size &amp; orientation</td><td ${td}>No changes</td><td ${td}>Design Review / V - Production</td></tr>
              <tr><td ${td}>Ordered size turned (opposite orientation)</td><td ${td}>Update admin to the artwork size; proof in artwork orientation, notify customer</td><td ${td}>Design Review / V - Production</td></tr>
              <tr><td ${td}>Turned + pole pockets / wind flaps</td><td ${td}>Update admin, confirm the finishing with the customer (approval)</td><td ${td}>Designer Comment</td></tr>
              <tr><td ${td}>Other than ordered size</td><td ${td}>Adjust (open) / stretch (flattened) to the ordered size, proof in ordered orientation (approval)</td><td ${td}>Design Review</td></tr>
            </table>
            <div style="font-weight:800; margin:10px 0 6px;">Resolution chart</div>
            <div style="color:#334155;">Up to 12": 600 ppi · 12–24": 300 · 24–120": 125 · over 120": 72 · Giant Media vendor: 100 ppi</div>
          </div>
        </div>
      </div>`;
  },

  /** Grommets on one side of this length (inches) — SOP table; past 29.99 ft one more every 3 ft, as the table runs */
  grommetsPerSide(lengthIn) {
    const ft = Math.round((lengthIn / 12) * 100) / 100;            // the table works in feet with 2 decimals
    for (const [upTo, n] of this.GROMMET_TABLE) if (ft <= upTo) return { count: n, ft, inTable: true };
    return { count: Math.floor(ft / 3) + 1, ft, inTable: false };
  },

  /**
   * Finishing exactly as the production FILE NAME states it — grommets (and where), pole pockets (which
   * sides), hems — with the words it was read from, so the designer can check it against the name.
   * Only when the name says nothing about finishing are the Finishing options of the form used.
   */
  bannerFinishing(parsed) {
    const name = ((parsed && parsed.fname) || '').replace(/\.[a-z0-9]+$/i, '');
    const norm = t => ' ' + String(t || '').replace(/[_\-()]+/g, ' ').replace(/\s+/g, ' ').toLowerCase() + ' ';
    const fromName = name ? this._readFinishing(norm(name)) : null;
    if (fromName && fromName.found) return Object.assign(fromName, { source: 'filename' });
    const fromForm = this._readFinishing(norm(parsed && parsed.finishing));
    return Object.assign(fromForm, { source: fromForm.found ? 'form' : 'none' });
  },

  _readFinishing(t) {
    const words = [];
    const hit = re => { const m = t.match(re); if (m) words.push(m[0].trim()); return !!m; };
    const f = { found: false, grommets: null, pockets: null, hem: null, adhesiveTabs: false, windFlaps: false, words };
    // Grommets / eyelets (AU orders say "eyelets") and where they go
    if (hit(/ (no|without) (grommets?|eyelets?) /)) {
      f.grommets = { on: false, kind: 'No grommets' };
    } else if (hit(/ (?:(?:metal|brass|nickel|standard|perimeter|4|four) )*(?:corner )?(?:grommets?|eyelets?)(?: (?:at|on) (?:the )?(?:left side|top|corners?))?/)) {
      const kind = / brass /.test(t) ? 'Brass grommets' : / eyelets? /.test(t) ? 'Metal eyelets' : 'Metal grommets';
      let where = 'all';
      if (/ (4|four|all) corners? | corners? only | corner (grommets?|eyelets?) /.test(t)) where = 'corners';
      else if (/ top corners? /.test(t)) where = 'top-corners';
      else if (/ (grommets?|eyelets?) (at|on) (the )?left side | left side (grommets?|eyelets?) /.test(t)) where = 'left';
      else if (/ (grommets?|eyelets?) (at|on) (the )?top | top (grommets?|eyelets?) /.test(t)) where = 'top';
      f.grommets = { on: true, kind, where };
    }
    // Pole pockets: which sides (SOP: top · top & bottom · left & right)
    const sides = [];
    // (the side may come before or after the words: "Top & Bottom Pole Pockets", "Pole_Pockets_Top_Bottom")
    if (hit(/ top (and|&|n) bottom pole pockets?| top bottom pole pockets?| pole pockets? (?:(at|on) (the )?)?top (?:(and|&|n) )?bottom/)) sides.push('top', 'bottom');
    else if (hit(/ left (and|&|n) right pole pockets?| left right pole pockets?| pole pockets? (?:(at|on) (the )?)?left (?:(and|&|n) )?right/)) sides.push('left', 'right');
    else if (hit(/ 3 pole pockets at left side| pole sleeve( at left side)?/)) { f.flagSleeve = true; sides.push('left'); }
    else if (hit(/ top pole pockets?| pole pockets? (?:(at|on) (the )?)?top /)) sides.push('top');
    else if (hit(/ bottom pole pockets?| pole pockets? (?:(at|on) (the )?)?bottom /)) sides.push('bottom');
    else if (hit(/ pole pockets?/)) f.pocketSidesUnknown = true;
    if (sides.length || f.pocketSidesUnknown) {
      const m = t.match(/ (\d+(?:\.\d+)?) ?(?:in|inch|inches|") (?:top |bottom |left |right )?pole pockets?| pole pockets? (\d+(?:\.\d+)?) ?(?:in|inch|inches|") /);
      f.pockets = { sides, sizeIn: m ? parseFloat(m[1] || m[2]) : null };
    }
    // Hems / edges
    if (hit(/ stitched( edges?| hems?)?/)) f.hem = { kind: 'Stitched edges' };
    else if (hit(/ welded( hems?| edges?)?/)) f.hem = { kind: 'Welded hem' };
    else if (hit(/ hemmed( edges?)?| hems? /)) f.hem = { kind: 'Hemmed edges' };
    f.adhesiveTabs = hit(/ adhesive tabs?/);
    f.windFlaps = hit(/ wind ?flaps?/);
    f.found = !!(f.grommets || f.pockets || f.hem || f.adhesiveTabs);
    return f;
  },

  /**
   * Where the finishing goes on a banner of the ordered size. Inches; origin = top-left corner of the
   * FINISHED size. Pole pocket bands (+5.25" on each pocket side), hem bands (+1.25" on the other sides,
   * only when the file name states hemmed / stitched / welded edges — grommets alone add no hem), grommet
   * centres 1" inside the finished edge — per-side counts from the SOP grommet table, evenly spaced,
   * corners included — and the canvas.
   */
  bannerLayout(dims, fin) {
    const W = dims.widthIn, H = dims.heightIn;
    const pocketSides = (fin.pockets && fin.pockets.sides) || [];
    const pocketMat = this.pocketMaterial(fin.pockets);             // custom size from the name → SOP slide 7 value
    const hemOn = !!fin.hem;
    const allow = {};
    ['top', 'bottom', 'left', 'right'].forEach(s => { allow[s] = pocketSides.includes(s) ? pocketMat.inches : hemOn ? this.HEM_IN : 0; });

    const g = fin.grommets && fin.grommets.on ? fin.grommets : null;
    const perSide = { top: 0, bottom: 0, left: 0, right: 0 };
    const points = [];
    let wSide = null, hSide = null;
    if (g) {
      const i0 = this.GROMMET_INSET_IN;
      wSide = this.grommetsPerSide(W);
      hSide = this.grommetsPerSide(H);
      const along = (len, n) => Array.from({ length: n }, (_, k) => i0 + (len - 2 * i0) * (n > 1 ? k / (n - 1) : 0.5));
      const add = (x, y) => { if (!points.some(p => Math.abs(p[0] - x) < 0.01 && Math.abs(p[1] - y) < 0.01)) points.push([x, y]); };
      const side = s => {
        if (pocketSides.includes(s)) return;                      // no grommets through a pole pocket
        const horizontal = s === 'top' || s === 'bottom';
        const n = horizontal ? wSide.count : hSide.count;
        perSide[s] = n;
        along(horizontal ? W : H, n).forEach(v => horizontal ? add(v, s === 'top' ? i0 : H - i0) : add(s === 'left' ? i0 : W - i0, v));
      };
      if (g.where === 'corners') { [[i0, i0], [W - i0, i0], [i0, H - i0], [W - i0, H - i0]].forEach(p => add(p[0], p[1])); perSide.top = perSide.bottom = perSide.left = perSide.right = 2; }
      else if (g.where === 'top-corners') { add(i0, i0); add(W - i0, i0); perSide.top = 2; }
      else if (g.where === 'top') side('top');
      else if (g.where === 'left') side('left');
      else ['top', 'bottom', 'left', 'right'].forEach(side);
    }
    return {
      allow,
      pocketSides,
      hemOn,
      canvas: { wIn: +(W + allow.left + allow.right).toFixed(2), hIn: +(H + allow.top + allow.bottom).toFixed(2) },
      grommets: g ? {
        kind: g.kind, where: g.where, points, perSide, total: points.length,
        widthSide: wSide, heightSide: hSide,
        spacingWIn: perSide.top > 1 ? +((W - 2 * this.GROMMET_INSET_IN) / (perSide.top - 1)).toFixed(2) : null,
        spacingHIn: perSide.left > 1 ? +((H - 2 * this.GROMMET_INSET_IN) / (perSide.left - 1)).toFixed(2) : null
      } : null,
      pocketMaterial: pocketMat
    };
  },

  /** Material to leave for a custom pole pocket size given in the file name (SOP slide 7), else the standard 5.25" */
  pocketMaterial(pockets) {
    if (!pockets || pockets.sizeIn == null) return { inches: this.POCKET_IN, custom: false };
    const row = this.POCKET_SIZE_TABLE.find(r => r[1] === pockets.sizeIn) || this.POCKET_SIZE_TABLE.find(r => r[0] === pockets.sizeIn);
    return row ? { inches: row[2], custom: true, size: pockets.sizeIn } : { inches: this.POCKET_IN, custom: true, size: pockets.sizeIn, unmatched: true };
  },

  /** One-line description of the finishing for labels and the report */
  describeFinishing(fin, lay) {
    const parts = [];
    if (fin.grommets) {
      if (!fin.grommets.on) parts.push('No grommets');
      else if (lay && lay.grommets) {
        const g = lay.grommets;
        const where = { corners: '4 corners', 'top-corners': 'top corners', top: 'top edge', left: 'left edge', all: 'all edges' }[g.where];
        parts.push(`${fin.grommets.kind} on ${where}: ${g.total} total`);
      }
    }
    if (fin.pockets) parts.push(fin.pockets.sides.length ? `Pole pocket ${fin.pockets.sides.join(' & ')}` : 'Pole pocket (side not stated)');
    if (fin.hem) parts.push(fin.hem.kind);
    if (fin.adhesiveTabs) parts.push('Adhesive tabs');
    if (fin.windFlaps) parts.push('Wind flaps');
    return parts.join(' · ') || 'No finishing stated';
  },

  /** SOP reference (HTML): grommet table + pole pocket sizes + hanging options — for the SOP pages */
  renderFinishingReference() {
    const rows = this.GROMMET_TABLE.map(([upTo, n], k) => {
      const from = k === 0 ? 0.01 : +(this.GROMMET_TABLE[k - 1][0] + 0.01).toFixed(2);
      return `<tr><td>${from.toFixed(2)} – ${upTo.toFixed(2)} ft</td><td style="text-align:center; font-weight:800;">${n}</td></tr>`;
    }).join('');
    const pocketRows = this.POCKET_SIZE_TABLE.map(r => `<tr><td>${r[0]}"</td><td>${r[1]}"</td><td style="font-weight:700;">${r[2]}"</td></tr>`).join('');
    const th = 'style="text-align:left; padding:5px 8px; background:#1e3a8a; color:#fff; font-size:11px;"';
    return `
      <div class="sop-section" style="margin-top:14px;">
        <div class="sop-section-title">Banner finishing — grommets, pole pockets, hems</div>
        <div style="font-size:11.5px; color:#64748b; margin-bottom:10px;">Read from the production file name and drawn on the canvas. Sources: ${this.SOURCES.grommets}; ${this.SOURCES.hangingOptions}; ${this.SOURCES.polePocket}; ${this.SOURCES.hem}.</div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:14px; font-size:12px;">
          <div>
            <div style="font-weight:800; margin-bottom:6px;">Standard grommets placement</div>
            <table class="sop-mini-table" style="width:100%; border-collapse:collapse;">
              <tr><th ${th}>Side length (height or width)</th><th ${th}>Grommets on that side</th></tr>${rows}
              <tr><td>30.00 ft and over</td><td style="text-align:center; font-weight:800;">+1 every 3 ft</td></tr>
            </table>
            <div style="margin-top:6px; color:#475569;">Counts include the corner grommets. Centres 1" inside the finished edge, evenly spaced. Example 6 × 3 ft: 3 on top, 3 on bottom, 2 on each side = 8.</div>
          </div>
          <div>
            <div style="font-weight:800; margin-bottom:6px;">Pole pockets &amp; hems (production canvas)</div>
            <ul style="margin:0; padding-left:18px; line-height:1.6; color:#334155;">
              <li>Pole pocket: <strong>+${this.POCKET_IN}"</strong> on each pocket side (top · top &amp; bottom · left &amp; right), no grommets on that side</li>
              <li>Hemmed / stitched / welded edges stated in the file name: <strong>+${this.HEM_IN}"</strong> hem on each other side</li>
              <li>Grommets without a hem in the file name, no grommet, adhesive tabs: no hem allowance (order size on those sides)</li>
              <li>Safe area ${this.BANNER_SAFE_IN}" inside the finished (visible) edge</li>
            </ul>
            <div style="font-weight:800; margin:10px 0 6px;">Custom pole pocket size (slide 7)</div>
            <table class="sop-mini-table" style="width:100%; border-collapse:collapse;">
              <tr><th ${th}>Pole diameter</th><th ${th}>Pole in inch</th><th ${th}>Material to leave</th></tr>${pocketRows}
            </table>
          </div>
        </div>
      </div>`;
  },

  /**
   * Production canvas = order size + finishing allowance.
   */
  canvas(spec, dims, parsed) {
    const w = dims?.widthIn, h = dims?.heightIn;
    if (!(w > 0 && h > 0)) return null;
    const fam = this.family(spec, parsed);
    const t = this._text(spec, parsed);

    if (fam === 'banner') {
      if (/fence/.test(t) && /mesh/.test(t)) {
        return { wIn: w + 4, hIn: h + 4, confirmed: true, note: '+2" each side, full-colour bleed', source: this.SOURCES.meshFence };
      }
      // Exactly what the file name says: pockets on the stated sides, hems on the others
      const fin = this.bannerFinishing(parsed);
      if (fin.found) {
        const lay = this.bannerLayout({ widthIn: w, heightIn: h }, fin);
        const a = lay.allow, parts = [];
        if (lay.pocketSides.length) parts.push(`pole pocket +${lay.pocketMaterial.inches}" ${lay.pocketSides.join(' & ')}`);
        const hemSides = ['top', 'bottom', 'left', 'right'].filter(s => !lay.pocketSides.includes(s) && a[s] === this.HEM_IN);
        if (hemSides.length) parts.push(`+${this.HEM_IN}" hem ${hemSides.length === 4 ? 'each side' : hemSides.join(' & ')}`);
        if (!parts.length) parts.push('no allowance (order size)');
        const unsure = fin.pockets && fin.pockets.sides.length === 0;
        return {
          wIn: lay.canvas.wIn, hIn: lay.canvas.hIn, confirmed: !unsure,
          note: unsure ? 'Pole pocket side not stated in the file name — confirm top / top & bottom / left & right' : parts.join(', '),
          source: [lay.pocketSides.length ? this.SOURCES.polePocket : '', hemSides.length ? this.SOURCES.hem : '', this.SOURCES.hangingOptions].filter(Boolean).join(' · '),
          finishing: fin, layout: lay
        };
      }
      return { wIn: w, hIn: h, confirmed: false, note: 'No finishing in the file name — confirm grommets / pole pockets / hems from the order', source: 'Not confirmed' };
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
