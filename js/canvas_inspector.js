/**
 * Design Intelligence Hub - Product-Specific Interactive Canvas Inspector & SOP Template Engine
 * Renders artwork with exact product die-lines, templates, and contextual SOP guides:
 * - Teardrop Flags (Curved dome top, aerodynamic tapered contour, left pole sleeve)
 * - Feather / Swooper Flags (Arch top, straight spine with pole sleeve, concave bottom scoop)
 * - Blade Flags (Angled blade cutline, left pole sleeve)
 * - Roll-Up / Retractable Banner Stands (Top clamp bar + 6" bottom cassette clearance)
 * - Table Covers & Throws (Front display panel, top table flat, draped wings with seam lines)
 * - Circle Yard Signs & Stickers (Circular cutline and circular safe zone)
 * - Vinyl / Mesh Banners (Hem lines, 1.25" safe area, standard 24" brass grommets)
 * - Pole Banners (Top & bottom 3" pole pockets with double stitch lines)
 * - Perforated Window Signs (One-way vision micro-mesh dot pattern)
 * - 100% Zoom Loupe & 90° Rotation Tool
 */

const CanvasInspector = {
  canvas: null,
  ctx: null,
  currentImg: null,
  currentSpec: null,
  currentDims: null,
  currentRotation: 0,
  inspectorMode: 'artwork', // 'artwork' | 'template' | 'mockup'
  officialTemplate: null,
  officialMockup: null,
  officialTemplateImg: null,
  officialMockupImg: null,

  guides: {
    officialOverlay: false,
    safeArea: true,
    cutLine: true,
    bleed: true,
    grommets: true,
    sleeve: true,
    hardware: true,
    seams: true,
    polePockets: true,
    stakes: true,
    flutes: true,
    dims: true,
    loupe: true
  },

  /**
   * Determine exact product template type based on spec slug, name, category, or file dimensions
   */
  getTemplateType(spec, dims) {
    if (!spec) return 'banner';
    const slug = (spec.slug || '').toLowerCase();
    const cat = (spec._catKey || '').toLowerCase();
    const name = (spec.name || '').toLowerCase();

    let widthIn = 0, heightIn = 0;
    if (dims) {
      if (typeof dims === 'object') {
        widthIn = parseFloat(dims.widthIn) || 0;
        heightIn = parseFloat(dims.heightIn) || 0;
      } else if (typeof dims === 'string') {
        const match = dims.match(/(\d+(?:\.\d+)?)\s*[xX*_]\s*(\d+(?:\.\d+)?)/);
        if (match) {
          widthIn = parseFloat(match[1]);
          heightIn = parseFloat(match[2]);
        }
      }
    }

    // 1. Desk Flags (Tabletop flags ~5.51" x 17.71", or dimensions <= 10" x 25")
    const isDeskSize = (widthIn > 0 && widthIn <= 10 && heightIn > 0 && heightIn <= 25 && heightIn > widthIn);
    if (slug.includes('desk') || name.includes('desk') || (isDeskSize && (slug.includes('flag') || name.includes('flag') || cat === 'flags'))) {
      if (slug.includes('teardrop') || name.includes('teardrop')) return 'desk-flags-teardrop';
      return 'desk-flags-blade';
    }

    // 2. Outdoor & Hand Flags
    if (slug.includes('hand-flag') || name.includes('hand flag')) return 'hand-flag';
    if (slug.includes('teardrop')) return 'teardrop-flag';
    if (slug.includes('feather') || slug.includes('swooper')) return 'feather-flag';
    if (slug.includes('blade')) return 'blade-flag';
    if (cat === 'flags' || slug.includes('flag') || name.includes('flag')) return 'flag-rectangle';

    // 3. Stands & Displays (Check L-banner and X-banner BEFORE generic roll-up)
    if (/(\b|[-_])x[-_\s]?banner/i.test(slug) || /(\b|[-_])x[-_\s]?banner/i.test(name)) return 'x-banner';
    if (/(\b|[-_])l[-_\s]?banner/i.test(slug) || /(\b|[-_])l[-_\s]?banner/i.test(name)) return 'l-banner';
    if (slug.includes('counter') || slug.includes('pop-up-counter') || name.includes('counter')) return 'popup-counter';
    if (slug.includes('roll-up') || slug.includes('retractable') || (spec.sopFamily === 'stands-rollup' && !slug.includes('vinyl') && !slug.includes('banner')) || name.includes('roll-up') || name.includes('retractable')) return 'roll-up';

    // 4. Marketing Materials (Cards, Posters, Flyers, Brochures)
    if (slug.includes('business-card') || name.includes('business card') || slug.includes('card')) return 'business-card';
    if (slug.includes('flyer') || slug.includes('brochure') || slug.includes('leaflet') || slug.includes('pamphlet') || name.includes('flyer') || name.includes('brochure')) return 'marketing-flyer';

    // 5. Table Covers
    if (cat === 'table-covers' || slug.includes('table') || name.includes('table cover') || name.includes('table throw') || name.includes('table runner')) return 'table-cover';

    // 6. Signs, Decals, Displays & Banners
    if (slug.includes('a-frame') || slug.includes('sandwich') || name.includes('a-frame') || name.includes('sandwich') || name.includes('sidewalk')) return 'a-frame';
    if (slug.includes('circle') || slug.includes('round') || name.includes('circle')) return 'circle';
    if (slug.includes('die-cut') || slug.includes('die_cut') || name.includes('die cut') || slug.includes('arrow') || name.includes('contour')) return 'die-cut';
    if (slug.includes('yard') || slug.includes('corflute') || slug.includes('real-estate') || slug.includes('lawn') || name.includes('yard sign')) return 'yard-sign';
    if (slug.includes('magnet') || name.includes('magnet')) return 'magnet-rounded';
    if (slug.includes('canvas') || slug.includes('framed') || name.includes('canvas')) return 'canvas-wrap';
    if (slug.includes('acrylic') || name.includes('acrylic') || slug.includes('plexiglass')) return 'acrylic-sign';
    if (slug.includes('safety') || slug.includes('parking') || name.includes('safety') || name.includes('parking') || name.includes('osha') || name.includes('traffic')) return 'safety-parking-sign';
    if (slug.includes('aluminum') || name.includes('aluminum') || slug.includes('metal-sign') || name.includes('metal sign') || cat === 'metal-signs') return 'aluminum-sign';
    if (slug.includes('decal') || slug.includes('sticker') || slug.includes('lettering') || slug.includes('cling') || slug.includes('label') || cat === 'decals') return 'decal-sticker';
    if (slug.includes('mesh') || name.includes('mesh')) return 'mesh-banner';
    if (slug.includes('pole-banner') || name.includes('pole banner') || name.includes('street banner')) return 'pole-banner';
    if (slug.includes('perforated') || slug.includes('one-way') || name.includes('perforated') || name.includes('window film')) return 'perforated-window';
    if (cat === 'apparel' || slug.includes('shirt') || slug.includes('hoodie') || slug.includes('polo') || slug.includes('sweatshirt') || name.includes('t-shirt')) return 'apparel';

    return 'banner';
  },

  /**
   * Initialize or re-bind to the canvas element in the DOM
   */
  init(canvasId) {
    this.canvas = document.getElementById(canvasId || 'artwork-canvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this._setupLoupeEvents();
  },

  /**
   * Set and render new artwork
   */
  renderArtwork(imgSrc, spec, dims) {
    this.init('artwork-canvas');
    if (!this.canvas) return;

    this.currentSpec = spec;
    this.currentDims = dims;
    this.currentRotation = 0;
    this.previewOrderTurned = false;

    // Resolve official BannerBuzz template & mockup from QNAP registry (using spec AND dimensions)
    const lookupSlug = (typeof appState !== 'undefined' && appState.parsedFilename && appState.parsedFilename.productSlug) || spec?.slug || spec?.name;
    this.officialTemplate = (typeof getOfficialProductTemplate === 'function')
      ? getOfficialProductTemplate(lookupSlug, dims)
      : null;
    this.officialMockup = (typeof getOfficialProductMockup === 'function')
      ? getOfficialProductMockup(lookupSlug, dims)
      : null;

    if (this.officialTemplate && this.officialTemplate.templateFile) {
      this.officialTemplateImg = new Image();
      this.officialTemplateImg.onload = () => {
        if (this.inspectorMode === 'template' || this.guides.officialOverlay || this.officialTemplate?.real) this.redraw();
      };
      this.officialTemplateImg.src = this.officialTemplate.templateFile;
    } else {
      this.officialTemplateImg = null;
    }

    if (this.officialMockup && this.officialMockup.mockupFile) {
      this.officialMockupImg = new Image();
      this.officialMockupImg.onload = () => {
        if (this.inspectorMode === 'mockup') this.redraw();
      };
      this.officialMockupImg.src = this.officialMockup.mockupFile;
    } else {
      this.officialMockupImg = null;
    }

    if (!imgSrc) {
      // Create clean high-resolution demonstration artwork if none provided
      imgSrc = this._createDemoArtwork(spec, dims);
    }

    // Product template (production standard, website design template or QNAP template: table covers, flags, canopy walls,
    // stands…): matched to the order — and a shaped artwork to its outline — once the artwork is read; the designer
    // can choose another one (or none) on the canvas toolbar
    this.productTemplate = null;
    this.templateMatch = null;
    this.templateMatching = false;
    this.templateView = 'art';
    this.artOpacity = 1;
    this.layoutBg = null;
    this._fitOv = null;
    this._matchToken = null;
    if (typeof ProductTemplates !== 'undefined') {
      const st = (typeof appState !== 'undefined') ? appState : {};
      const fname = (st.parsedFilename && st.parsedFilename.fname) || (st.file && st.file.name) || '';
      const ready = ProductTemplates.cachedMatch(spec, dims, st.parsedFilename, fname, imgSrc);
      if (ready) {
        this._useMatch(ready, true);
      } else if (ProductTemplates.rank(spec, dims, st.parsedFilename, fname).length) {
        const token = this._matchToken = {};
        this.templateMatching = true;
        ProductTemplates.autoMatch(spec, dims, st.parsedFilename, fname, imgSrc).then(m => {
          if (this._matchToken === token) this._useMatch(m);
        });
      }
    }

    // Update the contextual toolbar options in the DOM
    this.renderContextualToolbar();

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.currentImg = img;
      this.redraw();
      if (this.productTemplate) this.renderContextualToolbar();   // fit chips need the artwork
    };
    img.onerror = () => {
      // Fallback to synthesized demo artwork
      const fallbackSrc = this._createDemoArtwork(spec, dims);
      const fImg = new Image();
      fImg.onload = () => {
        this.currentImg = fImg;
        this.redraw();
      };
      fImg.src = fallbackSrc;
    };
    img.src = imgSrc;
  },

  /**
   * Synthesize clean demo artwork when needed
   */
  _createDemoArtwork(spec, dims) {
    const printW = Math.max(1, parseFloat(dims?.widthIn) || spec?.defaultW || 36);
    const printH = Math.max(1, parseFloat(dims?.heightIn) || spec?.defaultH || 24);
    const aspect = printW / printH;
    const isPortrait = printH > printW;
    let cleanWPx, cleanHPx;
    if (aspect >= 1) {
      cleanWPx = 840;
      cleanHPx = Math.max(20, Math.round(840 / aspect));
    } else {
      cleanHPx = 760;
      cleanWPx = Math.max(20, Math.round(760 * aspect));
    }

    const tType = this.getTemplateType(spec, dims);
    const prodTitle = (spec?.name || 'BANNERBUZZ PRINT').toUpperCase();

    // 1. Die-Cut Yard Sign Demo (Directional Arrow only if arrow, else standard rectangular flute sign)
    if (tType === 'die-cut' || tType === 'yard-sign') {
      const isArrow = (spec?.slug || '').includes('arrow') || (spec?.name || '').toLowerCase().includes('arrow');
      if (isArrow) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
          <defs>
            <linearGradient id="yardG" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stop-color="#0e2246"/>
              <stop offset="100%" stop-color="#1d4ed8"/>
            </linearGradient>
          </defs>
          <rect width="${cleanWPx}" height="${cleanHPx}" fill="#ffffff"/>
          
          <!-- Directional Arrow Badge -->
          <path d="M 30 ${cleanHPx*0.12} L ${cleanWPx*0.72} ${cleanHPx*0.12} L ${cleanWPx*0.72} ${cleanHPx*0.04} L ${cleanWPx-20} ${cleanHPx*0.5} L ${cleanWPx*0.72} ${cleanHPx*0.96} L ${cleanWPx*0.72} ${cleanHPx*0.88} L 30 ${cleanHPx*0.88} Z" fill="url(#yardG)"/>
          
          <!-- White Inner Panel -->
          <path d="M 40 ${cleanHPx*0.18} L ${cleanWPx*0.70} ${cleanHPx*0.18} L ${cleanWPx*0.70} ${cleanHPx*0.12} L ${cleanWPx-35} ${cleanHPx*0.5} L ${cleanWPx*0.70} ${cleanHPx*0.88} L ${cleanWPx*0.70} ${cleanHPx*0.82} L 40 ${cleanHPx*0.82} Z" fill="#ffffff"/>
          
          <!-- Typography -->
          <g transform="translate(${cleanWPx * 0.42}, ${cleanHPx * 0.42})">
            <text x="0" y="-12" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(28, Math.round(cleanWPx / 20)))}" font-weight="900" fill="#0e2246" text-anchor="middle" letter-spacing="1">NORTHUMBERLAND</text>
            <text x="0" y="16" font-family="'Inter', sans-serif" font-size="${Math.max(13, Math.min(22, Math.round(cleanWPx / 25)))}" font-weight="800" fill="#ff5f1f" text-anchor="middle" letter-spacing="0.5">ARCHIVES &amp; MUSEUM</text>
            <text x="0" y="38" font-family="'Inter', sans-serif" font-size="${Math.max(10, Math.round(cleanWPx / 38))}" font-weight="700" fill="#475569" text-anchor="middle">PARKING &amp; MAIN ENTRANCE →</text>
            <rect x="-100" y="48" width="200" height="2" fill="#cbd5e1"/>
            <text x="0" y="64" font-family="'Inter', sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">4mm Weatherproof Corflute · Precision Die-Cut</text>
          </g>
        </svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      } else {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
          <rect width="${cleanWPx}" height="${cleanHPx}" fill="#ffffff"/>
          <rect x="12" y="12" width="${cleanWPx - 24}" height="${cleanHPx - 24}" rx="4" fill="#0e2246" stroke="#fb7b48" stroke-width="3"/>
          <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.45})">
            <text x="0" y="-12" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(28, Math.round(cleanWPx / 20)))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">NORTHUMBERLAND</text>
            <text x="0" y="16" font-family="'Inter', sans-serif" font-size="${Math.max(13, Math.min(22, Math.round(cleanWPx / 25)))}" font-weight="800" fill="#ff5f1f" text-anchor="middle" letter-spacing="0.5">ARCHIVES &amp; MUSEUM</text>
            <text x="0" y="38" font-family="'Inter', sans-serif" font-size="${Math.max(10, Math.round(cleanWPx / 38))}" font-weight="700" fill="#93c5fd" text-anchor="middle">PARKING &amp; MAIN ENTRANCE</text>
            <rect x="-100" y="48" width="200" height="2" fill="#38bdf8"/>
            <text x="0" y="64" font-family="'Inter', sans-serif" font-size="10" font-weight="600" fill="#cbd5e1" text-anchor="middle">4mm Fluted Weatherproof Corflute · Precision Die-Cut</text>
          </g>
        </svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      }
    }

    // 1.5 Desk Flags Demo Artwork (Tabletop Mini Flags with craft/logo artwork)
    if (tType === 'desk-flags-blade' || tType === 'desk-flags-teardrop') {
      const isBlade = tType === 'desk-flags-blade';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="deskG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4a044e"/>
            <stop offset="50%" stop-color="#701a75"/>
            <stop offset="100%" stop-color="#c026d3"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#deskG)"/>
        
        <!-- Glitter & sparkle background accents -->
        <circle cx="${cleanWPx * 0.28}" cy="${cleanHPx * 0.12}" r="3" fill="#ffffff" opacity="0.8"/>
        <circle cx="${cleanWPx * 0.72}" cy="${cleanHPx * 0.15}" r="2" fill="#fde047" opacity="0.9"/>
        <circle cx="${cleanWPx * 0.22}" cy="${cleanHPx * 0.25}" r="2.5" fill="#ffffff" opacity="0.7"/>
        <circle cx="${cleanWPx * 0.80}" cy="${cleanHPx * 0.32}" r="3.5" fill="#fde047" opacity="0.85"/>
        <circle cx="${cleanWPx * 0.50}" cy="${cleanHPx * 0.78}" r="2.5" fill="#ffffff" opacity="0.6"/>

        <!-- Craft Insignia Badge -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.24})">
          <circle cx="0" cy="0" r="${Math.min(cleanWPx * 0.28, 48)}" fill="#ffffff" opacity="0.15"/>
          <circle cx="0" cy="0" r="${Math.min(cleanWPx * 0.24, 40)}" fill="none" stroke="#fde047" stroke-width="2" stroke-dasharray="4,3"/>
          <text x="0" y="6" font-family="'Inter', cursive, sans-serif" font-size="${Math.max(15, Math.round(cleanWPx / 13))}" font-weight="900" fill="#ffffff" text-anchor="middle">Rositas</text>
          <text x="0" y="22" font-family="'Inter', sans-serif" font-size="${Math.max(9, Math.round(cleanWPx / 22))}" font-weight="700" fill="#fde047" text-anchor="middle" letter-spacing="1">CRAFTS</text>
        </g>

        <!-- Social Handles & Details -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.50})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${Math.max(11, Math.round(cleanWPx / 18))}" font-weight="800" fill="#ffffff" text-anchor="middle">@rositascraftz</text>
          <text x="0" y="18" font-family="'Inter', sans-serif" font-size="${Math.max(9, Math.round(cleanWPx / 24))}" font-weight="600" fill="#fbcfe8" text-anchor="middle">rositascraftz@gmail.com</text>
          <text x="0" y="34" font-family="'Inter', sans-serif" font-size="${Math.max(10, Math.round(cleanWPx / 20))}" font-weight="800" fill="#fde047" text-anchor="middle">956-621-7913</text>
          <line x1="-${cleanWPx * 0.3}" y1="46" x2="${cleanWPx * 0.3}" y2="46" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
        </g>

        <!-- Product Features Text -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.72})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${Math.max(12, Math.round(cleanWPx / 17))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="0.5">HANDCRAFTED</text>
          <text x="0" y="16" font-family="'Inter', sans-serif" font-size="${Math.max(10, Math.round(cleanWPx / 19))}" font-weight="800" fill="#fde047" text-anchor="middle">TUMBLERS · SHIRTS</text>
          <text x="0" y="30" font-family="'Inter', sans-serif" font-size="${Math.max(10, Math.round(cleanWPx / 21))}" font-weight="700" fill="#ffffff" text-anchor="middle">&amp; MORE!</text>
          <text x="0" y="52" font-family="'Inter', sans-serif" font-size="9.5" font-weight="600" fill="#e9d5ff" text-anchor="middle">5.51" × 17.71" Tabletop Flag</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 2. Flags (Vertical flutter layout)
    if (tType === 'flag-rectangle' || tType === 'teardrop-flag' || tType === 'feather-flag' || tType === 'blade-flag') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="flagG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b"/>
            <stop offset="40%" stop-color="#312e81"/>
            <stop offset="100%" stop-color="#ea580c"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#flagG)"/>
        
        <!-- Star Insignia -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.22})">
          <circle cx="0" cy="0" r="32" fill="#ffffff" opacity="0.15"/>
          <polygon points="0,-22 6,-6 22,-6 9,4 14,20 0,10 -14,20 -9,4 -22,-6 -6,-6" fill="#fbbf24"/>
        </g>

        <!-- Bold Vertical Flag Typography -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.48})">
          <text x="0" y="-10" font-family="'Inter', sans-serif" font-size="${Math.max(20, Math.min(36, Math.round(cleanWPx / 14)))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">OPEN</text>
          <text x="0" y="24" font-family="'Inter', sans-serif" font-size="${Math.max(14, Math.min(22, Math.round(cleanWPx / 22)))}" font-weight="800" fill="#fbbf24" text-anchor="middle" letter-spacing="1">NOW</text>
          <rect x="-60" y="38" width="120" height="3" fill="#ffffff" opacity="0.8"/>
          <text x="0" y="62" font-family="'Inter', sans-serif" font-size="${Math.max(11, Math.round(cleanWPx / 28))}" font-weight="700" fill="#ffffff" text-anchor="middle">WELCOME</text>
          <text x="0" y="84" font-family="'Inter', sans-serif" font-size="10.5" font-weight="500" fill="#cbd5e1" text-anchor="middle">90 GSM Knitted Poly</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 3. Roll-Up Stands (Vertical trade-show layout)
    if (tType === 'roll-up' || tType === 'x-banner' || tType === 'l-banner') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="standG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#091e3a"/>
            <stop offset="60%" stop-color="#0f2b5c"/>
            <stop offset="100%" stop-color="#1e3a8a"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#standG)"/>
        
        <!-- Header Banner -->
        <rect x="0" y="0" width="${cleanWPx}" height="14" fill="#ff5f1f"/>
        
        <!-- Logo Area -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.18})">
          <circle cx="0" cy="-18" r="26" fill="#ff5f1f"/>
          <text x="0" y="-10" font-family="'Inter', sans-serif" font-size="20" font-weight="900" fill="#ffffff" text-anchor="middle">★</text>
          <text x="0" y="24" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(26, Math.round(cleanWPx / 16)))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">BANNERBUZZ</text>
          <text x="0" y="44" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#fdba74" text-anchor="middle">RETRACTABLE DISPLAYS</text>
        </g>

        <!-- Eye-Level Bullet Points -->
        <g transform="translate(${cleanWPx * 0.22}, ${cleanHPx * 0.44})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="13" font-weight="700" fill="#ffffff">✔ High-Resolution UV Print</text>
          <text x="0" y="28" font-family="'Inter', sans-serif" font-size="13" font-weight="700" fill="#ffffff">✔ Anti-Curl Polypropylene</text>
          <text x="0" y="56" font-family="'Inter', sans-serif" font-size="13" font-weight="700" fill="#ffffff">✔ Anodized Aluminum Stand</text>
        </g>

        <!-- Contact Box (Safely above bottom 6" cassette margin) -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.76})">
          <rect x="-140" y="-22" width="280" height="44" rx="22" fill="#ff5f1f"/>
          <text x="0" y="5" font-family="'Inter', sans-serif" font-size="13" font-weight="800" fill="#ffffff" text-anchor="middle">WWW.BANNERBUZZ.COM</text>
          <text x="0" y="38" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#93c5fd" text-anchor="middle">📞 1-800-580-4489</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 4. Vehicle Magnetic Signs (Automotive layout)
    if (tType === 'magnet-rounded') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="#ffffff"/>
        <rect x="12" y="12" width="${cleanWPx - 24}" height="${cleanHPx - 24}" rx="18" fill="#0f172a" stroke="#f59e0b" stroke-width="4"/>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.45})">
          <text x="0" y="-20" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(28, Math.round(cleanWPx / 18)))}" font-weight="900" fill="#f59e0b" text-anchor="middle" letter-spacing="1">PREMIUM CONTRACTOR</text>
          <text x="0" y="12" font-family="'Inter', sans-serif" font-size="${Math.max(13, Math.round(cleanWPx / 26))}" font-weight="800" fill="#ffffff" text-anchor="middle">LICENSED &amp; FULLY INSURED</text>
          <text x="0" y="38" font-family="'Inter', sans-serif" font-size="${Math.max(14, Math.round(cleanWPx / 24))}" font-weight="900" fill="#38bdf8" text-anchor="middle">24/7 CALL: (800) 580-4489</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 5. Table Covers (Draped Trade Show layout)
    if (tType === 'table-cover') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="tblG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e293b"/>
            <stop offset="100%" stop-color="#0f172a"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#tblG)"/>
        
        <!-- Table Top Flat Guideline -->
        <rect x="${cleanWPx * 0.15}" y="${cleanHPx * 0.08}" width="${cleanWPx * 0.7}" height="${cleanHPx * 0.28}" fill="rgba(255,255,255,0.06)" stroke="#475569" stroke-dasharray="4,4"/>
        <text x="${cleanWPx / 2}" y="${cleanHPx * 0.22}" font-family="'Inter', sans-serif" font-size="11" font-weight="700" fill="#94a3b8" text-anchor="middle">TABLE TOP SURFACE (6 FT / 8 FT)</text>
        
        <!-- Front Draped Drop Graphic -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.65})">
          <circle cx="0" cy="-16" r="22" fill="#ff5f1f"/>
          <text x="0" y="-9" font-family="'Inter', sans-serif" font-size="18" font-weight="900" fill="#ffffff" text-anchor="middle">★</text>
          <text x="0" y="20" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(26, Math.round(cleanWPx / 20)))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">BANNERBUZZ</text>
          <text x="0" y="40" font-family="'Inter', sans-serif" font-size="11.5" font-weight="600" fill="#cbd5e1" text-anchor="middle">CUSTOM TABLE THROWS &amp; COVERS</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 6. Canvas Wrap (Fine Art Gallery Wrap layout)
    if (tType === 'canvas-wrap') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="artG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b"/>
            <stop offset="50%" stop-color="#4338ca"/>
            <stop offset="100%" stop-color="#f59e0b"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#artG)"/>
        
        <!-- Mountain Silhouette Artwork -->
        <polygon points="0,${cleanHPx} ${cleanWPx*0.25},${cleanHPx*0.48} ${cleanWPx*0.5},${cleanHPx} " fill="#0f172a" opacity="0.8"/>
        <polygon points="${cleanWPx*0.3},${cleanHPx} ${cleanWPx*0.65},${cleanHPx*0.36} ${cleanWPx},${cleanHPx} " fill="#020617"/>
        <polygon points="${cleanWPx*0.1},${cleanHPx} ${cleanWPx*0.45},${cleanHPx*0.42} ${cleanWPx*0.8},${cleanHPx} " fill="#1e293b" opacity="0.6"/>

        <!-- Sun -->
        <circle cx="${cleanWPx*0.75}" cy="${cleanHPx*0.25}" r="${Math.min(cleanWPx, cleanHPx)*0.14}" fill="#fde047" opacity="0.85"/>

        <!-- Typography -->
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.72})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(28, Math.round(cleanWPx / 18)))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="2">GALLERY CANVAS PRINT</text>
          <text x="0" y="24" font-family="'Inter', sans-serif" font-size="12" font-weight="600" fill="#cbd5e1" text-anchor="middle">1.5" Solid Wood Stretcher Frame · Acid-Free Cotton</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 7. Perforated Window Film (Storefront graphic)
    if (tType === 'perforated-window') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="winG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0284c7"/>
            <stop offset="100%" stop-color="#0369a1"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#winG)"/>
        
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.42})">
          <rect x="-160" y="-45" width="320" height="90" rx="10" fill="#ffffff"/>
          <text x="0" y="-12" font-family="'Inter', sans-serif" font-size="${Math.max(18, Math.min(32, Math.round(cleanWPx / 16)))}" font-weight="900" fill="#dc2626" text-anchor="middle" letter-spacing="1">GRAND OPENING</text>
          <text x="0" y="16" font-family="'Inter', sans-serif" font-size="${Math.max(12, Math.round(cleanWPx / 28))}" font-weight="800" fill="#0369a1" text-anchor="middle">UP TO 50% OFF EVERYTHING</text>
          <text x="0" y="32" font-family="'Inter', sans-serif" font-size="10" font-weight="600" fill="#64748b" text-anchor="middle">60/40 One-Way Vision Perforated Window Film</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 8. Circular Decal / Sign
    if (tType === 'circle') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="#ffffff"/>
        <circle cx="${cleanWPx/2}" cy="${cleanHPx/2}" r="${Math.min(cleanWPx, cleanHPx)*0.46}" fill="#1e293b" stroke="#f59e0b" stroke-width="6"/>
        <circle cx="${cleanWPx/2}" cy="${cleanHPx/2}" r="${Math.min(cleanWPx, cleanHPx)*0.41}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="6,4"/>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx / 2})">
          <text x="0" y="-22" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(26, Math.round(cleanWPx / 18)))}" font-weight="900" fill="#f59e0b" text-anchor="middle">★ ARTISAN ★</text>
          <text x="0" y="10" font-family="'Inter', sans-serif" font-size="${Math.max(18, Math.min(30, Math.round(cleanWPx / 15)))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">ROASTERY</text>
          <text x="0" y="32" font-family="'Inter', sans-serif" font-size="11" font-weight="700" fill="#94a3b8" text-anchor="middle">ESTD. 2024</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 9. Aluminum Signs (Brushed metal finish with 4 pre-drilled holes)
    if (tType === 'aluminum-sign') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="alumG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f1f5f9"/>
            <stop offset="50%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#alumG)"/>
        <rect x="8" y="8" width="${cleanWPx - 16}" height="${cleanHPx - 16}" rx="12" fill="#ffffff" stroke="#0284c7" stroke-width="3"/>
        
        <!-- 4 Corner Drilled Holes -->
        <circle cx="24" cy="24" r="6" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
        <circle cx="${cleanWPx - 24}" cy="24" r="6" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
        <circle cx="24" cy="${cleanHPx - 24}" r="6" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>
        <circle cx="${cleanWPx - 24}" cy="${cleanHPx - 24}" r="6" fill="#94a3b8" stroke="#475569" stroke-width="1.5"/>

        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.45})">
          <rect x="-120" y="-36" width="240" height="30" rx="4" fill="#0284c7"/>
          <text x="0" y="-16" font-family="'Inter', sans-serif" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">NOTICE</text>
          <text x="0" y="24" font-family="'Inter', sans-serif" font-size="${Math.max(15, Math.min(26, Math.round(cleanWPx / 20)))}" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="0.5">PROPERTY MONITORED</text>
          <text x="0" y="46" font-family="'Inter', sans-serif" font-size="${Math.max(11, Math.round(cleanWPx / 32))}" font-weight="700" fill="#475569" text-anchor="middle">24 HOUR SURVEILLANCE · AUTHORIZED ONLY</text>
          <text x="0" y="66" font-family="'Inter', sans-serif" font-size="10" font-weight="600" fill="#0284c7" text-anchor="middle">0.040" Heavy-Duty Rustproof Aluminum</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 10. Acrylic Signs (High-gloss executive clear/frosted acrylic with standoffs)
    if (tType === 'acrylic-sign') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <linearGradient id="acrG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0f172a"/>
            <stop offset="100%" stop-color="#1e293b"/>
          </linearGradient>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#acrG)"/>
        <rect x="12" y="12" width="${cleanWPx - 24}" height="${cleanHPx - 24}" rx="6" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
        
        <!-- 4 Standoff Chrome Hardware Mounts -->
        <g fill="#e2e8f0" stroke="#475569" stroke-width="2">
          <circle cx="28" cy="28" r="10"/>
          <circle cx="${cleanWPx - 28}" cy="28" r="10"/>
          <circle cx="28" cy="${cleanHPx - 28}" r="10"/>
          <circle cx="${cleanWPx - 28}" cy="${cleanHPx - 28}" r="10"/>
          <circle cx="28" cy="28" r="3" fill="#475569"/>
          <circle cx="${cleanWPx - 28}" cy="28" r="3" fill="#475569"/>
          <circle cx="28" cy="${cleanHPx - 28}" r="3" fill="#475569"/>
          <circle cx="${cleanWPx - 28}" cy="${cleanHPx - 28}" r="3" fill="#475569"/>
        </g>

        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.46})">
          <text x="0" y="-12" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(28, Math.round(cleanWPx / 18)))}" font-weight="900" fill="#f8fafc" text-anchor="middle" letter-spacing="2">EXECUTIVE SUITE</text>
          <text x="0" y="14" font-family="'Inter', sans-serif" font-size="${Math.max(11, Math.round(cleanWPx / 28))}" font-weight="700" fill="#38bdf8" text-anchor="middle" letter-spacing="1">BOARDROOM &amp; LEGAL COUNSEL</text>
          <rect x="-90" y="28" width="180" height="1.5" fill="rgba(255,255,255,0.3)"/>
          <text x="0" y="46" font-family="'Inter', sans-serif" font-size="10" font-weight="500" fill="#94a3b8" text-anchor="middle">1/4" Cast Acrylic · Diamond Polished Edge</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 11. Mesh Banners (Perforated airflow pattern)
    if (tType === 'mesh-banner') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <defs>
          <pattern id="meshDots" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.5" fill="#0f172a" opacity="0.35"/>
          </pattern>
        </defs>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="#ea580c"/>
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#meshDots)"/>
        <rect x="6" y="6" width="${cleanWPx - 12}" height="${cleanHPx - 12}" fill="none" stroke="#ffffff" stroke-width="2" stroke-dasharray="8,4"/>
        
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.48})">
          <text x="0" y="-12" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(32, Math.round(cleanWPx / 16)))}" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">CONSTRUCTION ZONE</text>
          <text x="0" y="20" font-family="'Inter', sans-serif" font-size="${Math.max(12, Math.round(cleanWPx / 26))}" font-weight="800" fill="#fef08a" text-anchor="middle">FUTURE HOME OF INNOVATION CENTER</text>
          <text x="0" y="42" font-family="'Inter', sans-serif" font-size="10.5" font-weight="600" fill="#ffffff" text-anchor="middle">70/30 Airflow Perforated Mesh · Heavy Duty Perimeter Webbing</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 12. Safety & Parking Signs (12" x 18" reflective aluminum with top & bottom center holes)
    if (tType === 'safety-parking-sign') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <rect width="${cleanWPx}" height="${cleanHPx}" rx="12" fill="#ffffff" stroke="#15803d" stroke-width="4"/>
        <rect x="8" y="8" width="${cleanWPx - 16}" height="${cleanHPx * 0.3}" rx="6" fill="#15803d"/>
        
        <!-- Top and Bottom Center Mounting Holes -->
        <circle cx="${cleanWPx / 2}" cy="20" r="5.5" fill="#94a3b8" stroke="#334155" stroke-width="1.5"/>
        <circle cx="${cleanWPx / 2}" cy="${cleanHPx - 20}" r="5.5" fill="#94a3b8" stroke="#334155" stroke-width="1.5"/>

        <text x="${cleanWPx / 2}" y="${cleanHPx * 0.20}" font-family="'Inter', sans-serif" font-size="${Math.max(14, Math.round(cleanWPx / 14))}" font-weight="900" fill="#ffffff" text-anchor="middle">RESERVED</text>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.58})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.round(cleanWPx / 12))}" font-weight="900" fill="#0f172a" text-anchor="middle">PARKING</text>
          <text x="0" y="24" font-family="'Inter', sans-serif" font-size="${Math.max(10, Math.round(cleanWPx / 22))}" font-weight="700" fill="#15803d" text-anchor="middle">VISITOR PERMIT ONLY</text>
          <text x="0" y="44" font-family="'Inter', sans-serif" font-size="${Math.max(9, Math.round(cleanWPx / 26))}" font-weight="600" fill="#dc2626" text-anchor="middle">TOW-AWAY ZONE</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 13. A-Frame Sidewalk Signs
    if (tType === 'a-frame') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="#0f172a"/>
        <rect x="14" y="14" width="${cleanWPx - 28}" height="${cleanHPx - 28}" rx="4" fill="#ffffff"/>
        
        <!-- Top Handle Notch -->
        <rect x="${cleanWPx/2 - 40}" y="4" width="80" height="12" rx="6" fill="#475569"/>

        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.45})">
          <text x="0" y="-30" font-family="'Inter', sans-serif" font-size="${Math.max(15, Math.round(cleanWPx / 16))}" font-weight="900" fill="#ea580c" text-anchor="middle">TODAY'S SPECIAL</text>
          <text x="0" y="6" font-family="'Inter', sans-serif" font-size="${Math.max(20, Math.round(cleanWPx / 11))}" font-weight="900" fill="#0f172a" text-anchor="middle">FARM FRESH</text>
          <text x="0" y="32" font-family="'Inter', sans-serif" font-size="${Math.max(12, Math.round(cleanWPx / 20))}" font-weight="700" fill="#16a34a" text-anchor="middle">ARTISAN COFFEE &amp; BAKERY</text>
          <rect x="-80" y="46" width="160" height="2" fill="#e2e8f0"/>
          <text x="0" y="64" font-family="'Inter', sans-serif" font-size="10.5" font-weight="600" fill="#64748b" text-anchor="middle">24" × 36" Sidewalk Board Insert</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 14. Decals & Stickers (Kiss-cut contour)
    if (tType === 'decal-sticker') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="#f8fafc"/>
        <rect x="10" y="10" width="${cleanWPx - 20}" height="${cleanHPx - 20}" rx="14" fill="#2563eb" stroke="#ffffff" stroke-width="6"/>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.48})">
          <circle cx="0" cy="-18" r="22" fill="#ffffff"/>
          <text x="0" y="-11" font-family="'Inter', sans-serif" font-size="18" font-weight="900" fill="#2563eb" text-anchor="middle">★</text>
          <text x="0" y="18" font-family="'Inter', sans-serif" font-size="${Math.max(14, Math.round(cleanWPx / 16))}" font-weight="900" fill="#ffffff" text-anchor="middle">STICKER &amp; DECAL</text>
          <text x="0" y="38" font-family="'Inter', sans-serif" font-size="11" font-weight="700" fill="#93c5fd" text-anchor="middle">Weatherproof Vinyl · Kiss-Cut</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 15. Custom Apparel (Direct to Film T-Shirt Graphic)
    if (tType === 'apparel') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="#18181b"/>
        <!-- Collar Reference Arc -->
        <path d="M ${cleanWPx * 0.35} 0 Q ${cleanWPx * 0.5} 32 ${cleanWPx * 0.65} 0" fill="none" stroke="#3f3f46" stroke-width="2"/>
        <!-- Chest Print Box (12" x 14") -->
        <rect x="${cleanWPx * 0.2}" y="${cleanHPx * 0.22}" width="${cleanWPx * 0.6}" height="${cleanHPx * 0.62}" rx="6" fill="#27272a" stroke="#e4e4e7" stroke-dasharray="4,4"/>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.50})">
          <text x="0" y="-12" font-family="'Inter', sans-serif" font-size="${Math.max(14, Math.round(cleanWPx / 18))}" font-weight="900" fill="#fafafa" text-anchor="middle" letter-spacing="1">ATHLETIC CREW</text>
          <text x="0" y="16" font-family="'Inter', sans-serif" font-size="${Math.max(11, Math.round(cleanWPx / 24))}" font-weight="800" fill="#fb923c" text-anchor="middle">ORIGINAL APPAREL</text>
          <text x="0" y="38" font-family="'Inter', sans-serif" font-size="10" font-weight="600" fill="#a1a1aa" text-anchor="middle">Direct-To-Film High Elasticity Print</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 16. Marketing Flyers & Brochures
    if (tType === 'marketing-flyer') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
        <rect width="${cleanWPx}" height="${cleanHPx}" fill="#ffffff"/>
        <rect x="0" y="0" width="${cleanWPx}" height="${cleanHPx * 0.28}" fill="#1e40af"/>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.16})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.round(cleanWPx / 16))}" font-weight="900" fill="#ffffff" text-anchor="middle">ANNUAL EXPO 2026</text>
          <text x="0" y="20" font-family="'Inter', sans-serif" font-size="11" font-weight="700" fill="#93c5fd" text-anchor="middle">DESIGN &amp; PRINT INNOVATION</text>
        </g>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.58})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${Math.max(13, Math.round(cleanWPx / 22))}" font-weight="800" fill="#0f172a" text-anchor="middle">DISCOVER THE FUTURE OF PRINT</text>
          <text x="0" y="22" font-family="'Inter', sans-serif" font-size="11" font-weight="600" fill="#475569" text-anchor="middle">Keynotes · Workshops · Live Demos</text>
          <rect x="-100" y="38" width="200" height="30" rx="15" fill="#ea580c"/>
          <text x="0" y="58" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle">REGISTER TODAY</text>
          <text x="0" y="90" font-family="'Inter', sans-serif" font-size="10" font-weight="500" fill="#94a3b8" text-anchor="middle">100 lb Gloss Book · Aqueous Coating</text>
        </g>
      </svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // 17. Default Vinyl Banner Demo (Responsive layout for wide panoramic, tall vertical, and standard)
    const isPanoramic = aspect > 2.2;
    const isTall = aspect < 0.6;
    let bannerContent = '';
    if (isPanoramic) {
      bannerContent = `
        <g transform="translate(${cleanWPx * 0.12}, ${cleanHPx * 0.5})">
          <circle cx="0" cy="0" r="${Math.min(cleanHPx * 0.32, 28)}" fill="#ffedd5" stroke="#fb923c" stroke-width="2.5"/>
          <text x="0" y="8" font-family="'Inter', sans-serif" font-size="${Math.min(cleanHPx * 0.32, 20)}" font-weight="900" fill="#c2410c" text-anchor="middle">★</text>
        </g>
        <g transform="translate(${cleanWPx * 0.52}, ${cleanHPx * 0.5})">
          <text x="0" y="-8" font-family="'Inter', sans-serif" font-size="${Math.max(13, Math.min(26, Math.round(cleanHPx * 0.26)))}" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">${prodTitle}</text>
          <text x="0" y="${Math.max(12, Math.round(cleanHPx * 0.22)) + 2}" font-family="'Inter', sans-serif" font-size="${Math.max(10, Math.min(15, Math.round(cleanHPx * 0.15)))}" font-weight="700" fill="#ea580c" text-anchor="middle">${printW}" W × ${printH}" H · ${(spec?.resolution || '150 DPI')}</text>
          <text x="0" y="${Math.max(12, Math.round(cleanHPx * 0.22)) * 2 + 4}" font-family="'Inter', sans-serif" font-size="${Math.max(9, Math.min(12, Math.round(cleanHPx * 0.12)))}" font-weight="500" fill="#64748b" text-anchor="middle">${spec?.material || 'Official BannerBuzz SOP Template'}</text>
        </g>
      `;
    } else if (isTall) {
      bannerContent = `
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.18})">
          <circle cx="0" cy="0" r="${Math.min(cleanWPx * 0.25, 32)}" fill="#ffedd5" stroke="#fb923c" stroke-width="2.5"/>
          <text x="0" y="8" font-family="'Inter', sans-serif" font-size="22" font-weight="900" fill="#c2410c" text-anchor="middle">★</text>
        </g>
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * 0.50})">
          <text x="0" y="-12" font-family="'Inter', sans-serif" font-size="${Math.max(14, Math.min(28, Math.round(cleanWPx / 14)))}" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">${prodTitle}</text>
          <text x="0" y="18" font-family="'Inter', sans-serif" font-size="${Math.max(11, Math.min(18, Math.round(cleanWPx / 20)))}" font-weight="700" fill="#ea580c" text-anchor="middle">${printW}" W × ${printH}" H</text>
          <text x="0" y="38" font-family="'Inter', sans-serif" font-size="${Math.max(9.5, Math.min(14, Math.round(cleanWPx / 24)))}" font-weight="500" fill="#64748b" text-anchor="middle">${spec?.resolution || '150 DPI'}</text>
          <text x="0" y="56" font-family="'Inter', sans-serif" font-size="${Math.max(9, Math.min(13, Math.round(cleanWPx / 26)))}" font-weight="500" fill="#94a3b8" text-anchor="middle">${spec?.material || 'Official BannerBuzz SOP'}</text>
        </g>
      `;
    } else {
      bannerContent = `
        <g transform="translate(${cleanWPx / 2}, ${cleanHPx * (isPortrait ? 0.38 : 0.44)})">
          <circle cx="0" cy="-35" r="28" fill="#ffedd5" stroke="#fb923c" stroke-width="2.5"/>
          <text x="0" y="-27" font-family="'Inter', sans-serif" font-size="22" font-weight="900" fill="#c2410c" text-anchor="middle">★</text>
          <text x="0" y="10" font-family="'Inter', sans-serif" font-size="${Math.max(16, Math.min(26, Math.round(cleanWPx / 18)))}" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">${prodTitle}</text>
          <text x="0" y="32" font-family="'Inter', sans-serif" font-size="${Math.max(12, Math.round(cleanWPx / 30))}" font-weight="700" fill="#ea580c" text-anchor="middle">${printW}" W × ${printH}" H · ${(spec?.resolution || '150 DPI')}</text>
          <text x="0" y="52" font-family="'Inter', sans-serif" font-size="11" font-weight="500" fill="#64748b" text-anchor="middle">${spec?.material || 'Official BannerBuzz SOP Template'}</text>
        </g>
      `;
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cleanWPx} ${cleanHPx}" width="${cleanWPx}" height="${cleanHPx}">
      <defs>
        <linearGradient id="bgG" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="100%" stop-color="#f8fafc"/>
        </linearGradient>
        <linearGradient id="brandG" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ea580c"/>
          <stop offset="100%" stop-color="#f97316"/>
        </linearGradient>
      </defs>
      <rect width="${cleanWPx}" height="${cleanHPx}" fill="url(#bgG)"/>
      <rect x="0" y="0" width="${cleanWPx}" height="12" fill="url(#brandG)"/>
      ${bannerContent}
    </svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  },

  setInspectorMode(mode) {
    this.inspectorMode = mode || 'artwork';
    this.redraw();
    this.renderContextualToolbar();
  },

  /**
   * Render dynamic contextual toolbar options for the active product
   */
  renderContextualToolbar() {
    const container = document.getElementById('vi-controls-container');
    if (!container) return;

    const tType = this.getTemplateType(this.currentSpec, this.currentDims);
    let controlsHtml = '';
    let qnapToggleHtml = '';

    const modeSwitcherHtml = `
      <div class="vi-mode-switcher">
        <button type="button" class="btn-vi-mode ${this.inspectorMode === 'artwork' ? 'active' : ''}" onclick="CanvasInspector.setInspectorMode('artwork')">
          🎨 Artwork &amp; SOP Guides
        </button>
        <button type="button" class="btn-vi-mode ${this.inspectorMode === 'template' ? 'active' : ''}" onclick="CanvasInspector.setInspectorMode('template')" title="View Authentic BannerBuzz Production Template">
          🏛️ Real Production Template
        </button>
        <button type="button" class="btn-vi-mode ${this.inspectorMode === 'mockup' ? 'active' : ''}" onclick="CanvasInspector.setInspectorMode('mockup')" title="View Authentic 3D Product Mockup">
          🖼️ Real 3D Mockup
        </button>
      </div>
    `;

    if (this.inspectorMode === 'template') {
      const tName = this.officialTemplate?.name || this.currentSpec?.name || 'Standard Production Template';
      container.innerHTML = modeSwitcherHtml + `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; background:#f0fdf4; border:1px solid #86efac; border-radius:6px; padding:6px 12px; font-size:12px; color:#15803d; font-weight:700;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>🏛️</span>
            <span>${tName} · Reference template (not from QNAP)</span>
          </div>
          <span style="display:inline-flex; gap:6px;">${this._rotateButtons()}</span>
        </div>
      `;
      return;
    }

    if (this.inspectorMode === 'mockup') {
      const mName = this.officialMockup?.name || this.currentSpec?.name || 'Finished 3D Product Assembly';
      container.innerHTML = modeSwitcherHtml + `
        <div style="display:flex; align-items:center; justify-content:space-between; width:100%; background:#eff6ff; border:1px solid #93c5fd; border-radius:6px; padding:6px 12px; font-size:12px; color:#1d4ed8; font-weight:700;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span>🖼️</span>
            <span>${mName} · Real 3D Mockup</span>
          </div>
          <button class="btn btn-outline btn-sm" onclick="switchTab('proof')" style="font-size:11px; background:#1d4ed8; color:#fff; border:none; padding:4px 10px;">Review Full Proof Studio →</button>
        </div>
      `;
      return;
    }

    if (this.officialTemplate) {
      qnapToggleHtml = `
        <label class="vi-toggle ${this.guides.officialOverlay ? 'active' : ''}" style="background:#f0fdf4; border-color:#86efac; color:#15803d; font-weight:700;" title="Overlay official BannerBuzz production template from \\\\192.168.0.250\\qnap\\Template_Mockups">
          <input type="checkbox" ${this.guides.officialOverlay ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('officialOverlay', this.checked)">
          🏛️ QNAP Official Template Overlay
        </label>
      `;
    }

    if (tType === 'die-cut') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Contour Cutline</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.stakes ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('stakes', this.checked)"> 🔩 Metal Step Stakes</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.flutes ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('flutes', this.checked)"> || Flute Direction</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'yard-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Finished Trim</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.stakes ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('stakes', this.checked)"> 🔩 Metal Step Stakes</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.flutes ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('flutes', this.checked)"> || Corflute Flutes</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'flag-rectangle') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Left Pole Sleeve</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ Sleeve Clips / Grommets</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (1.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Hem Stitch Lines</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'magnet-rounded') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Rounded Cutline (R 0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🧲 30-Mil Magnetic Backing</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'x-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (1.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ 4 Corner Eyelets</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> ✖️ X-Frame Tension Arms</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'l-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 Top & Bottom Clamp Bars</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'canvas-wrap') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🖼️ Face Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Canvas Fold Lines</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 1.5" Gallery Wrap Border</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'perforated-window') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🪟 Micro-Perforation Mesh (60/40)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'desk-flags-blade' || tType === 'desk-flags-teardrop') {
      const isBlade = tType === 'desk-flags-blade';
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Desk ${isBlade ? 'Blade' : 'Teardrop'} Cutline</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.25")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Desk Pole Sleeve</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'teardrop-flag') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (1.0")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Teardrop Cutline</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Pole Sleeve (Left)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'feather-flag' || tType === 'blade-flag') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (1.0")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Feather Contour</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Pole Sleeve (Left)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'roll-up') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Finished Trim</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 📦 Cassette Margin (>6" Base)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'table-cover') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Hem Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.seams ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('seams', this.checked)"> 🧵 Panel Seams</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'circle') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Circle</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Circle Cutline</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'aluminum-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ 0.5" Rounded Corners</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 4 Pre-Drilled Holes (3/8")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'acrylic-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Polished Acrylic Trim</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.75")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 Standoff Hardware Mounts</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'mesh-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (1.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim & Reinforced Webbing</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ Grommets (SOP table)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🌬️ 70/30 Mesh Airflow</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'safety-parking-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ 0.5" Rounded Corners</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 Top & Bottom Post Holes</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'a-frame') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ 24" × 36" Board Insert</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.75")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🪝 Handle & Hinge Clearance</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'decal-sticker') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Kiss-Cut Contour Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'apparel') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> 👕 Chest Print Zone (12" × 14")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Margin</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.seams ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('seams', this.checked)"> 🧵 Collar Reference Arc</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'marketing-flyer') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line (8.5" × 11")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.25")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (tType === 'pole-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.polePockets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('polePockets', this.checked)"> 🎗️ Top & Bottom Pockets (3")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    } else if (this._bannerSop(this.currentSpec || {}, this.currentDims || {})) {
      // SOP banner template: only the guides this order really has (finishing read from the file name)
      const b = this._bannerSop(this.currentSpec || {}, this.currentDims || {});
      const lay = b.layout;
      const chip = (txt, title) => `<span class="vi-chip" title="${title}">${txt}</span>`;
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim (finished size)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (${b.safeIn}")</label>
        ${lay && lay.grommets ? `<label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ Grommets (${lay.grommets.total})</label>` : ''}
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.dims ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('dims', this.checked)"> 📏 Dimensions</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${lay && lay.hemOn ? chip(`🧵 Hem ${SopRules.HEM_IN}"`, 'Hem stated in the file name') : ''}
        ${lay && lay.pocketSides.length ? chip(`🎗️ Pole pocket ${lay.pocketSides.join(' & ')}`, 'Pole pocket stated in the file name') : ''}
        ${this._rotateButtons()}
      `;
    } else {
      // Standard Vinyl / Fabric Banner
      const hasPolePockets = this.currentDims?.hasPolePockets || this.currentDims?.pocketType?.includes('Top Pole Pocket') || this.currentDims?.pocketType?.includes('Pocket');
      const hasGrommets = this.currentDims?.hasGrommets !== false && this.currentDims?.grommetType !== 'None' && !hasPolePockets;
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (${typeof SopRules !== 'undefined' ? SopRules.BANNER_SAFE_IN : 1}")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.seams ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('seams', this.checked)"> 🧵 1.25" Hem Fold Lines</label>
        ${hasPolePockets ? `<label class="vi-toggle active"><input type="checkbox" ${this.guides.polePockets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('polePockets', this.checked)"> 🎗️ 3" Top Pole Pocket</label>` : ''}
        ${hasGrommets ? `<label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ Grommets (SOP table)</label>` : ''}
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    }

    const activeDefects = (typeof AgenticAiInspector !== 'undefined') ? AgenticAiInspector.getDefects() : [];
    const aiBtnHtml = `
      <button type="button" class="btn-vi-mode" onclick="AgenticAiInspector.toggleBlinking()" style="background:#fff7ed; border:1px solid #fed7aa; color:#c2410c; font-weight:800; font-size:11px;" title="Agentic AI: Click to toggle blinking animated boxes and circles">
        🤖 Agentic AI QA <span id="ai-defect-count-badge" style="background:#ea580c; color:#fff; border-radius:10px; padding:1px 6px; font-size:9.5px;${activeDefects.length ? '' : ' display:none;'}">${activeDefects.length}</span>
      </button>
    `;

    // QNAP product template on the canvas: its own outlines replace the drawn SOP guides
    const qnapBar = this._qnapBar();
    if (this.productTemplate) {
      qnapToggleHtml = '';
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Template outlines (safe / visible)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.dims ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('dims', this.checked)"> 📏 Dimensions</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        ${this._rotateButtons()}
      `;
    }

    container.innerHTML = modeSwitcherHtml + qnapBar + qnapToggleHtml + controlsHtml + aiBtnHtml;
  },

  _drawTemplateMode(w, h, spec, dims) {
    const ctx = this.ctx;
    const isRotated = (this.currentRotation === 90 || this.currentRotation === 270);
    const tType = this.getTemplateType(spec, dims);
    const printW = dims?.widthIn || spec?.defaultW || 36;
    const printH = dims?.heightIn || spec?.defaultH || 24;

    // 1. Clean print substrate background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    // Subtle substrate measurement grid
    ctx.save();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    const gridStep = Math.max(20, Math.round(w / 12));
    for (let gx = gridStep; gx < w; gx += gridStep) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = gridStep; gy < h; gy += gridStep) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }
    ctx.restore();

    // 2. Draw official template image if loaded
    if (this.officialTemplateImg && this.officialTemplateImg.complete && this.officialTemplateImg.naturalWidth > 0) {
      const img = this.officialTemplateImg;
      ctx.save();
      if (this.currentRotation !== 0) {
        ctx.translate(w / 2, h / 2);
        ctx.rotate((this.currentRotation * Math.PI) / 180);
        const boxW = isRotated ? h : w;
        const boxH = isRotated ? w : h;
        const r = this._fitRect(img.naturalWidth, img.naturalHeight, boxW, boxH);
        ctx.drawImage(img, r.x - boxW / 2, r.y - boxH / 2, r.w, r.h);
      } else {
        const naturalAspect = img.naturalWidth / img.naturalHeight;
        const canvasAspect = w / h;
        // For solid template silhouettes (e.g. 61x160 flags), fill canvas to eliminate bottom gaps!
        const isSilhouette = img.naturalWidth <= 120 && img.naturalHeight <= 300;
        if (isSilhouette) {
          ctx.drawImage(img, 0, 0, w, h);
        } else {
          const r = this._fitRect(img.naturalWidth, img.naturalHeight, w, h);
          ctx.drawImage(img, r.x, r.y, r.w, r.h);
        }
      }
      ctx.restore();
    }

    // 3. Render exact official die-line guides: Cutline (orange), Safe Zone (green), Bleed (blue)
    this._drawProductTemplate(w, h, tType);

    // 4. Official BannerBuzz Production Die-Line Legend Card
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    const cardW = Math.min(w - 20, 520);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(10, 10, cardW, 44, 6);
      ctx.fill();
    } else {
      ctx.fillRect(10, 10, cardW, 44);
    }

    const isQnap = this.officialTemplate?.real || (this.officialTemplate?.templateFile && !this.officialTemplate.templateFile.includes('placeholder'));
    ctx.fillStyle = isQnap ? '#22c55e' : '#f97316';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillText(isQnap ? '🏛️ OFFICIAL BANNERBUZZ PRODUCTION DIE-LINE TEMPLATE' : '🏛️ REFERENCE TEMPLATE', 20, 26);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 10px Inter, sans-serif';
    const tName = this.officialTemplate?.name || spec?.name || 'Production Template';
    const tDims = this._sizeLabel(+printW, +printH, `${printW}" × ${printH}"`);
    const safeTxt = spec?.safeArea || '0.50"';
    const bleedTxt = spec?.bleed || '0.25"';
    ctx.fillText(`${tName} · Order: ${tDims} · Bleed: ${bleedTxt} · Safe Zone: ${safeTxt}`, 20, 42);
    ctx.restore();
  },

  _drawMockupMode(w, h, spec, dims) {
    const ctx = this.ctx;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    if (this.officialMockupImg && this.officialMockupImg.complete && this.officialMockupImg.naturalWidth > 0) {
      const img = this.officialMockupImg;
      const naturalAspect = img.naturalWidth / img.naturalHeight;
      const canvasAspect = w / h;
      let drawW, drawH, drawX, drawY;
      if (naturalAspect > canvasAspect) {
        drawW = w - 16;
        drawH = drawW / naturalAspect;
        drawX = 8;
        drawY = (h - drawH) / 2;
      } else {
        drawH = h - 16;
        drawW = drawH * naturalAspect;
        drawY = 8;
        drawX = (w - drawW) / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(12, 12, w - 24, h - 24);
      if (this.currentImg) {
        const ci = this.currentImg;
        const r = this._fitRect(ci.naturalWidth || w, ci.naturalHeight || h, Math.max(1, w - 48), Math.max(1, h - 48));
        ctx.drawImage(ci, 24 + r.x, 24 + r.y, r.w, r.h);
      }
    }

    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(10, 10, Math.min(w - 20, 520), 40, 6);
      ctx.fill();
    } else {
      ctx.fillRect(10, 10, Math.min(w - 20, 520), 40);
    }

    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 11.5px Inter, sans-serif';
    ctx.fillText('🖼️ REAL 3D FINISHED PRODUCT MOCKUP', 20, 26);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 10px Inter, sans-serif';
    const mName = this.officialMockup?.name || spec?.name || 'Finished Product Mockup';
    const mHardware = this.officialMockup?.dims || 'Standard Hardware & Assembly';
    ctx.fillText(`${mName} · ${mHardware}`, 20, 42);
    ctx.restore();
  },

  /**
   * Two separate orientation tools (preview only — the order size in the admin never changes here):
   *  · Rotate Artwork  — turns the customer's artwork 90° on the template board (artboard) as it is
   *  · Rotate Artboard — turns the template board itself (W × H → H × W) and keeps the artwork as supplied;
   *                      PR-DPO-03 cases 5–10: ordered size turned → proof in the artwork's orientation
   * Both can be combined; "Reset" puts both back.
   */
  rotate90() {
    this.setRotation(this.currentRotation + 90);
  },

  /** Turn the artwork to a given angle (0 / 90 / 180 / 270) on the current artboard */
  setRotation(angle) {
    this.currentRotation = ((angle % 360) + 360) % 360;
    this._afterOrientationChange();
  },

  /** Turn the template board (artboard) — the ordered W × H shown as H × W — or back to the ordered size */
  setOrderTurned(on) {
    this.previewOrderTurned = !!on;
    this._afterOrientationChange();
  },

  rotateArtboard() {
    this.setOrderTurned(!this.previewOrderTurned);
  },

  /** Artwork and artboard back as ordered / supplied */
  resetOrientation() {
    this.currentRotation = 0;
    this.previewOrderTurned = false;
    this._afterOrientationChange();
  },

  _afterOrientationChange() {
    this.redraw();
    this.renderContextualToolbar();
    if (typeof AgenticAiInspector !== 'undefined' && AgenticAiInspector._renderOrientationAlert) AgenticAiInspector._renderOrientationAlert();
    if (typeof SafeZoneCheck !== 'undefined') SafeZoneCheck.refresh();   // the safe zone is measured on the turned artwork
  },

  // ── sizes as the order states them: a mm / cm / m order in its own unit with the inches beside it ──────────
  _metricUnit() {
    if (typeof SopRules === 'undefined') return null;
    const u = SopRules.orderUnit(this.currentDims);
    return SopRules.isMetric(u) ? u : null;
  },

  /** Dimension-line label: "300 cm W (118.11")" on a metric order, else `inchLabel` as before */
  _dimLabel(inches, axis, inchLabel) {
    const u = this._metricUnit();
    return u ? `${SopRules.toUnit(inches, u)} ${u} ${axis} (${+(+inches).toFixed(2)}")` : inchLabel;
  },

  /** A length: "10.2 cm (4")" on a metric order, else `inchText` */
  _lenLabel(inches, inchText) {
    return this._metricUnit() ? SopRules.lenText(inches, this.currentDims) : inchText;
  },

  /** A size: "300 × 60 cm (118.11" × 23.62")" on a metric order, else `inchText` */
  _sizeLabel(wIn, hIn, inchText) {
    return this._metricUnit() ? SopRules.sizeText(wIn, hIn, this.currentDims) : inchText;
  },

  /** Toolbar buttons: Rotate Artwork · Rotate Artboard (template board) · Reset, with the current state */
  _rotateButtons() {
    const d = this.currentDims || {};
    const fmt = v => +(+v).toFixed(2);
    const [bw, bh] = this.previewOrderTurned ? [d.heightIn, d.widthIn] : [d.widthIn, d.heightIn];
    const board = d.widthIn && d.heightIn ? this._sizeLabel(bw, bh, `${fmt(bw)}" × ${fmt(bh)}"`) : '';
    const on = 'background:#fff7ed; border-color:#fb923c; color:#c2410c;';
    return `
        <span class="vi-rotate-group">
          <button type="button" class="btn btn-outline btn-sm" style="${this.currentRotation ? on : ''}" onclick="CanvasInspector.rotate90()" title="Turn the customer's artwork 90° clockwise on the template board">↻ Rotate Artwork${this.currentRotation ? ` (${this.currentRotation}°)` : ''}</button>
          <button type="button" class="btn btn-outline btn-sm" style="${this.previewOrderTurned ? on : ''}" onclick="CanvasInspector.rotateArtboard()" title="Turn the template board (artboard) W × H → H × W; the artwork stays as supplied">⤾ Rotate Artboard${board ? ` (${board})` : ''}</button>
          ${this.currentRotation || this.previewOrderTurned ? `<button type="button" class="btn btn-outline btn-sm" onclick="CanvasInspector.resetOrientation()" title="Artwork and artboard back as supplied / ordered">↺ Reset</button>` : ''}
        </span>`;
  },

  /** A turned artwork / order is a preview: say so on the canvas, so nobody takes it for the customer's file */
  _drawRotationNote() {
    if (!this.canvas || !this.ctx || !this.currentImg || !(this.currentRotation || this.previewOrderTurned)) return;
    if (this.inspectorMode && this.inspectorMode !== 'artwork') return;
    const ctx = this.ctx, w = this.viewW || this.canvas.width, h = this.viewH || this.canvas.height;
    const d = this.currentDims || {};
    const parts = [];
    if (this.previewOrderTurned) parts.push(`⤾ Artboard turned to ${+(+d.heightIn).toFixed(2)}" × ${+(+d.widthIn).toFixed(2)}"`);
    if (this.currentRotation) parts.push(`↻ Artwork turned ${this.currentRotation}°`);
    const txt = parts.join(' · ') + ' — preview only, order unchanged';
    ctx.save();
    ctx.font = 'bold 10.5px Inter, sans-serif';
    const tw = Math.min(w - 8, ctx.measureText(txt).width + 16);
    ctx.fillStyle = 'rgba(180, 83, 9, 0.92)';
    ctx.fillRect(4, h - 24, tw, 20);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(txt, 12, h - 10, tw - 16);
    ctx.restore();
  },

  /**
   * Banner production layout per SOP + real print files (Desktop/Print):
   *  - canvas = order + 1.25" hem each side ONLY when the file name states hemmed / stitched / welded edges
   *  - top pole pocket: +5.25" band on top, no side hem (US2382836 36x136 in)
   *  - grommet centres 1" inside the finished edge, count per side from the SOP grommet table
   *  - safe area 1" inside the finished edge (SOP Banner ISO 2026)
   * Returns null for non-banners or when finishing is unknown to the SOP data.
   */
  _bannerSop(spec, dims) {
    if (typeof SopRules === 'undefined' || !dims?.widthIn || !dims?.heightIn) return null;
    if (this.inspectorMode !== 'artwork' && this.inspectorMode) return null;
    const st = (typeof appState !== 'undefined') ? appState : {};
    if (SopRules.family(spec, st.parsedFilename) !== 'banner') return null;
    // Finishing exactly as the production file name states it (the form's Finishing options only when the
    // name says nothing): grommets per the SOP grommet table, pole pockets / hems on the stated sides
    const fd = st.finishingDetails || {};
    const formTxt = [fd.grommets, fd.pockets, fd.edges].filter(v => v && v !== 'None' && v !== 'Clean Cut').join(' ');
    const parsed = Object.assign({}, st.parsedFilename || {}, {
      finishing: [st.parsedFilename?.finishing, st.finishingDetailsSummary, formTxt].filter(Boolean).join(' ')
    });
    const c = SopRules.canvas(spec, dims, parsed);
    if (!c) return null;
    const W = dims.widthIn, H = dims.heightIn;
    const lay = c.layout || null;
    const a = lay ? lay.allow : { left: (c.wIn - W) / 2, right: (c.wIn - W) / 2, top: (c.hIn - H) / 2, bottom: (c.hIn - H) / 2 };
    return {
      orderW: W, orderH: H, canvasW: c.wIn, canvasH: c.hIn, confirmed: c.confirmed, note: c.note,
      allow: a, hemX: a.left, hemTop: a.top, hemBottom: a.bottom,
      finishing: c.finishing || null, layout: lay,
      safeIn: (SopRules.safeArea(spec, st.parsedFilename) || {}).inches || SopRules.BANNER_SAFE_IN
    };
  },

  /**
   * SOP banner template, drawn like a production template sheet:
   *  pasteboard · artboard (= production canvas) · hatched pole pocket / hem allowance (only what the file
   *  name states), named on the pasteboard beside it · artwork fitted into the finished size · trim line ·
   *  safe area · metal grommets per the SOP grommet table · dimension lines with the grommet count of each side ·
   *  crop marks. Sizes and finishing are written outside the template (pasteboard + legend), never on it.
   */
  _drawBannerSop(img, w, h, b, pad) {
    const ctx = this.ctx;
    pad = pad || { l: 0, r: 0, t: 0, b: 0 };
    const CW = w + pad.l + pad.r, CH = h + pad.t + pad.b;
    const ox = pad.l, oy = pad.t;                         // artboard origin on the canvas
    const isRotated = (this.currentRotation === 90 || this.currentRotation === 270);
    const s = w / b.canvasW;                              // px per inch
    const a = b.allow || { left: b.hemX, right: b.hemX, top: b.hemTop, bottom: b.hemBottom };
    const tx = ox + a.left * s, ty = oy + a.top * s, tw = b.orderW * s, th = b.orderH * s;
    const pocketSides = (b.layout && b.layout.pocketSides) || [];
    const fmt = v => +(+v).toFixed(2);

    // 1. Pasteboard and the artboard sheet on it
    this._drawPasteboard(CW, CH);
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, w, h);
    ctx.restore();

    // 2. Production allowance outside the finished size: pole pocket (blue) / hem (grey), hatched. Its name and
    //    size are called out on the pasteboard beside it (right for top / bottom, below for left / right)
    const bands = {
      top: [ox, oy, w, ty - oy], bottom: [ox, ty + th, w, oy + h - ty - th],
      left: [ox, ty, tx - ox, th], right: [tx + tw, ty, ox + w - tx - tw, th]
    };
    Object.entries(bands).forEach(([side, r]) => {
      if (!(a[side] > 0) || r[2] <= 0.5 || r[3] <= 0.5) return;
      const pocket = pocketSides.includes(side);
      ctx.save();
      ctx.beginPath(); ctx.rect(r[0], r[1], r[2], r[3]); ctx.clip();
      ctx.fillStyle = pocket ? '#dbeafe' : '#eef2f6';
      ctx.fillRect(r[0], r[1], r[2], r[3]);
      ctx.strokeStyle = pocket ? 'rgba(37, 99, 235, 0.32)' : 'rgba(100, 116, 139, 0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -r[3]; k < r[2] + r[3]; k += 7) { ctx.moveTo(r[0] + k, r[1] + r[3]); ctx.lineTo(r[0] + k + r[3], r[1]); }
      ctx.stroke();
      ctx.restore();
      this._bandCallout(side, r, `${pocket ? 'Pole pocket' : 'Hem'}`, this._lenLabel(a[side], `${fmt(a[side])}"`), pocket ? '#1d4ed8' : '#475569', ox + w, oy + h);
    });

    // 3. Artwork fitted into the finished (order) size — never stretched; the part it does not cover stays grey
    ctx.save();
    ctx.beginPath(); ctx.rect(tx, ty, tw, th); ctx.clip();
    ctx.fillStyle = '#f4f6f9';
    ctx.fillRect(tx, ty, tw, th);
    if (this.currentRotation !== 0) {
      ctx.translate(tx + tw / 2, ty + th / 2);
      ctx.rotate((this.currentRotation * Math.PI) / 180);
      const boxW = isRotated ? th : tw;
      const boxH = isRotated ? tw : th;
      const r = this._fitRect(img.naturalWidth || boxW, img.naturalHeight || boxH, boxW, boxH);
      ctx.drawImage(img, r.x - boxW / 2, r.y - boxH / 2, r.w, r.h);
      this._setTurnedArtRect(tx + tw / 2, ty + th / 2, r);
    } else {
      const r = this._fitRect(img.naturalWidth || tw, img.naturalHeight || th, tw, th);
      ctx.drawImage(img, tx + r.x, ty + r.y, r.w, r.h);
      this.artRect = { x: tx + r.x, y: ty + r.y, w: r.w, h: r.h };
    }
    ctx.restore();
    this.trimRect = { x: tx, y: ty, w: tw, h: th };
    this.safeInset = b.safeIn * s;

    // 4. Artboard edge, trim (finished size / fold line), safe area
    ctx.save();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
    ctx.restore();
    if (this.guides.cutLine !== false) {
      ctx.save();
      ctx.strokeStyle = this.GUIDE.trim;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(tx, ty, tw, th);
      ctx.restore();
    }
    if (this.guides.safeArea !== false) {
      const si = b.safeIn * s;
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(tx + si, ty + si, tw - 2 * si, th - 2 * si);
      ctx.restore();
    }
    // double-sided pole pocket: the stitch line 3" in from the trim on each pocket side (SOP slides 10, 18, 25)
    const stitchIn = b.layout && b.layout.pocketMaterial && b.layout.pocketMaterial.stitchIn;
    if (stitchIn && pocketSides.length && this.guides.cutLine !== false) {
      const k = stitchIn * s;
      ctx.save();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      pocketSides.forEach(sd => {
        if (sd === 'top') { ctx.moveTo(tx, ty + k); ctx.lineTo(tx + tw, ty + k); }
        if (sd === 'bottom') { ctx.moveTo(tx, ty + th - k); ctx.lineTo(tx + tw, ty + th - k); }
        if (sd === 'left') { ctx.moveTo(tx + k, ty); ctx.lineTo(tx + k, ty + th); }
        if (sd === 'right') { ctx.moveTo(tx + tw - k, ty); ctx.lineTo(tx + tw - k, ty + th); }
      });
      ctx.stroke();
      ctx.restore();
    }

    // 5. Grommets: SOP Standard Grommets Placement — count per side from that side's length (corners
    //    included), centres 1" inside the finished edge, evenly spaced; none through a pole pocket
    const g = b.layout && b.layout.grommets;
    if (g && this.guides.grommets !== false) {
      const size = Math.max(10, Math.min(18, 0.75 * s));   // ~3/4" grommet, never smaller than 10 px on screen
      g.points.forEach(([x, y]) => this.drawGrommetMark(ctx, tx + x * s, ty + y * s, size));
    }

    // 6. Crop marks at the artboard corners
    ctx.save();
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    [[ox, oy, -1, -1], [ox + w, oy, 1, -1], [ox, oy + h, -1, 1], [ox + w, oy + h, 1, 1]].forEach(([x, y, dx, dy]) => {
      ctx.moveTo(x + dx * 3, y); ctx.lineTo(x + dx * 11, y);
      ctx.moveTo(x, y + dy * 3); ctx.lineTo(x, y + dy * 11);
    });
    ctx.stroke();
    ctx.restore();

    // 7. Dimension lines on the pasteboard: finished size, canvas size, and the grommets on those sides
    const ps = g ? g.perSide : null;
    const countTxt = (n1, n2, s1, s2) => {
      if (!g) return '';
      if (n1 && n1 === n2) return `${n1} grommets ${s1} & ${s2}`;
      return [n1 ? `${n1} ${s1}` : '', n2 ? `${n2} ${s2}` : ''].filter(Boolean).join(' · ') + (n1 || n2 ? ' grommets' : '');
    };
    const gW = g ? (g.where === 'corners' ? '4 corner grommets' : countTxt(ps.top, ps.bottom, 'top', 'bottom')) : '';
    const gH = g && g.where !== 'corners' ? countTxt(ps.left, ps.right, 'left', 'right') : '';
    const ft = v => +(v / 12).toFixed(2);
    const labelW = [this._dimLabel(b.orderW, 'W', `${fmt(b.orderW)}" W (${ft(b.orderW)} ft)`),
      b.canvasW !== b.orderW ? `canvas ${this._lenLabel(b.canvasW, `${fmt(b.canvasW)}"`)}` : '', gW];
    const labelH = [this._dimLabel(b.orderH, 'H', `${fmt(b.orderH)}" H (${ft(b.orderH)} ft)`),
      b.canvasH !== b.orderH ? `canvas ${this._lenLabel(b.canvasH, `${fmt(b.canvasH)}"`)}` : '', gH];
    if (this.guides.dims !== false && pad.t >= 30 && pad.l >= 30) {
      const yTop = Math.round(pad.t / 2) - 6, xLeft = Math.round(pad.l / 2) - 6;
      this._dimLine(tx, yTop, tw, labelW, false, oy - yTop - 2);
      this._dimLine(xLeft, ty, th, labelH, true, ox - xLeft - 2);
    }

    // 8. Caption on the pasteboard (the rotation note takes this place when the artwork / artboard is turned)
    if (pad.b >= 20 && !(this.currentRotation || this.previewOrderTurned) && CW > 420) {
      ctx.save();
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(`SOP BANNER TEMPLATE · production canvas ${this._sizeLabel(b.canvasW, b.canvasH, `${fmt(b.canvasW)}" × ${fmt(b.canvasH)}"`)} · safe ${fmt(b.safeIn)}"`, CW - pad.r, CH - Math.max(12, pad.b / 2 - 4));
      ctx.restore();
    }

    // Legend card under the canvas (not on it), so it never covers grommet marks or the artwork
    const fin = b.finishing;
    const lay = b.layout;
    const hemSides = ['top', 'bottom', 'left', 'right'].filter(sd => !pocketSides.includes(sd) && a[sd] > 0);
    const sideList = list => list.length === 4 ? 'each side' : list.join(' & ');
    const cards = [
      { key: 'trim', title: 'Trim line (finished size)', value: this._sizeLabel(b.orderW, b.orderH, `${fmt(b.orderW)}" × ${fmt(b.orderH)}" (${ft(b.orderW)} × ${ft(b.orderH)} ft)`),
        desc: 'The size you ordered — where the banner is cut or folded.' },
      { key: 'safe', title: 'Safe area', value: `${this._lenLabel(b.safeIn, `${fmt(b.safeIn)}"`)} inside the trim`, desc: 'Keep all text, logos and important graphics inside this line.' },
      { key: 'canvas', title: 'Production canvas', value: this._sizeLabel(b.canvasW, b.canvasH, `${fmt(b.canvasW)}" × ${fmt(b.canvasH)}"`),
        desc: b.canvasW !== b.orderW || b.canvasH !== b.orderH ? 'Finished size plus the hem / pole pocket allowance — the print file size.' : 'Same as the finished size (no hem or pole pocket in the file name).' },
      { key: 'grommet', title: 'Grommets', value: g ? (g.where === 'corners' ? `${g.kind} · 4 corners` : `${g.kind} · ${g.total} total`)
        : fin && fin.grommets && !fin.grommets.on ? 'No grommets' : 'Not in file name',
        desc: g && g.where !== 'corners' ? `Top ${ps.top} · bottom ${ps.bottom} · left ${ps.left} · right ${ps.right} — SOP grommet table, 1" inside the edge.` : 'SOP grommet table, centres 1" inside the edge.' },
      { key: 'hem', title: 'Hem', value: lay && lay.hemOn && hemSides.length ? `${fin.hem.kind} +${this._lenLabel(a[hemSides[0]], `${fmt(a[hemSides[0]])}"`)} ${sideList(hemSides)}` : 'No hem (not in file name)',
        desc: lay && lay.hemOn && hemSides.length ? 'Folded and welded / stitched — no important content here.' : 'Only added when the file name states hemmed / stitched / welded edges.' },
      { key: 'pocket', title: 'Pole pocket', value: pocketSides.length ? `${pocketSides.join(' & ')} +${this._lenLabel(a[pocketSides[0]], `${fmt(a[pocketSides[0]])}"`)}${stitchIn ? ' (double-sided)' : ''}` : fin && fin.pockets ? 'Side NOT in file name' : 'None',
        desc: !pocketSides.length ? 'Only on the sides the file name states.'
          : stitchIn ? `Double-sided banner: ${fmt(a[pocketSides[0]])}" band each pocket side — SOP slides 10, 18, 25.`
          : 'Folded back for the pole — the artwork is not visible here.', warn: !pocketSides.length && fin && fin.pockets }
    ];
    // the red dashed line on the canvas (drawn above for a double-sided pole pocket) gets its own card
    if (stitchIn && pocketSides.length) {
      cards.push({ key: 'stitch', title: 'Stitch line', value: `${this._lenLabel(stitchIn, `${fmt(stitchIn)}"`)} in from the trim · ${pocketSides.join(' & ')}`,
        desc: 'Red dashed line: where the pole pocket is stitched — keep text and logos clear of it. SOP slides 10, 18, 25.' });
    }
    const notes = [];
    if (this.currentRotation || this.previewOrderTurned) notes.push({ text: 'Preview turned — order unchanged', color: '#b45309' });
    this.legend = {
      title: 'SOP Banner Template', product: (this.currentSpec && this.currentSpec.name) || '',
      source: fin && fin.found ? (fin.source === 'filename' ? 'File name' : 'Finishing options') : null,
      words: fin && fin.found ? fin.words.join(' · ') : '',
      warn: fin && fin.found ? null : 'No grommets / pole pockets / hems in the file name — confirm the finishing from the order',
      cards, notes,
      tip: 'Backgrounds run to the edge of the production canvas; text and logos stay inside the safe area, clear of hems, pockets and grommets.'
    };
  },

  /** Name and size of a hem / pole pocket band, called out on the pasteboard beside the artboard */
  _bandCallout(side, r, name, size, color, artRight, artBottom) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.font = '700 10px Inter, sans-serif';
    ctx.textBaseline = 'middle';
    if (side === 'top' || side === 'bottom') {
      const x = artRight + 10, y0 = r[1], y1 = r[1] + r[3];
      ctx.beginPath();
      ctx.moveTo(x - 4, y0); ctx.lineTo(x, y0); ctx.lineTo(x, y1); ctx.lineTo(x - 4, y1);
      ctx.stroke();
      const ym = (y0 + y1) / 2;
      ctx.textAlign = 'left';
      ctx.fillText(name, x + 6, ym - (r[3] >= 22 ? 6 : 0));
      if (r[3] >= 22) { ctx.font = '600 10px Inter, sans-serif'; ctx.fillText(size, x + 6, ym + 7); }
      else { const nw = ctx.measureText(name + ' ').width; ctx.font = '600 10px Inter, sans-serif'; ctx.fillText(size, x + 6 + nw, ym); }
    } else {
      const y = artBottom + 10, x0 = r[0], x1 = r[0] + r[2];
      ctx.beginPath();
      ctx.moveTo(x0, y - 4); ctx.lineTo(x0, y); ctx.lineTo(x1, y); ctx.lineTo(x1, y - 4);
      ctx.stroke();
      ctx.textAlign = side === 'left' ? 'left' : 'right';
      ctx.fillText(`${name} ${size}`, side === 'left' ? x0 : x1, y + 11);
    }
    ctx.restore();
  },

  /** Template legend under the canvas: bleed / trim / safe (and finishing) cards with their values, notes, tip */
  _renderLegend() {
    const wrap = this.canvas && this.canvas.parentElement;
    if (!wrap) return;
    let el = document.getElementById('canvas-sop-legend');
    const L = this.inspectorMode && this.inspectorMode !== 'artwork' ? null : this.legend;
    if (!L) { if (el) el.style.display = 'none'; return; }
    if (!el || el.previousElementSibling !== wrap) {
      if (el) el.remove();
      el = document.createElement('div');
      el.id = 'canvas-sop-legend';
      wrap.insertAdjacentElement('afterend', el);
    }
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    el.className = 'canvas-sop-legend tpl-legend';
    el.style.cssText = '';
    el.innerHTML = `
      <div class="csl-head">
        <span class="csl-title">${esc(L.title)}</span>
        ${L.product ? `<span class="tl-product">${esc(L.product)}</span>` : ''}
        ${L.source ? `<span class="csl-src">${L.source}: <q>${esc(L.words)}</q></span>` : L.warn ? `<span class="csl-src csl-warn">${esc(L.warn)}</span>` : ''}
      </div>
      <div class="tl-cards">${L.cards.map(c => `
        <div class="tl-card tl-${c.key}${c.warn ? ' warn' : ''}">
          <i class="tl-sw tl-sw-${c.key}"${c.color ? ` style="background:${esc(c.color)};"` : ''}></i>
          <div class="tl-txt"><span class="tl-title">${esc(c.title)}</span><strong>${esc(c.value)}</strong><em>${esc(c.desc || '')}</em></div>
        </div>`).join('')}</div>
      ${L.notes && L.notes.length ? `<div class="tl-notes">${L.notes.map(n => `<span><i style="background:${esc(n.color)};"></i>${esc(n.text)}</span>`).join('')}</div>` : ''}
      ${L.tip ? `<div class="tl-tip"><b>PRO TIP</b>${esc(L.tip)}</div>` : ''}`;
  },

  /**
   * Centre-fit a source of srcW×srcH inside a box, keeping its proportions
   */
  _fitRect(srcW, srcH, boxW, boxH) {
    const s = Math.min(boxW / srcW, boxH / srcH);
    const w = srcW * s, h = srcH * s;
    return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
  },

  /**
   * Where the turned artwork lies on the canvas (px), from the centre it is drawn around and its fitted size before
   * the turn. artRot tells the overlays (markers, safe-zone marks) to turn their positions the same way.
   */
  _setTurnedArtRect(cx, cy, r) {
    const side = this.currentRotation % 180 !== 0;
    const w = side ? r.h : r.w, h = side ? r.w : r.h;
    this.artRect = { x: cx - w / 2, y: cy - h / 2, w, h };
    this.artRot = this.currentRotation;
  },

  /**
   * Redraw the canvas, artwork, and product template overlays
   */
  redraw() {
    this.artRect = null;
    this.artRot = 0;
    this.trimRect = null;          // the ordered (finished) size on the canvas, px — set by the layouts that know it
    this.safeInset = 0;            // the safe area inside it, px (banner templates)
    this._loupeCanvasUrl = null;   // the zoom loupe's picture of the canvas is out of date
    this.legend = null;            // set again by the print sheet / banner layout when it draws
    this._redrawCanvas();
    this._drawRotationNote();
    this._renderLegend();
    if (typeof SafeZoneCheck !== 'undefined') SafeZoneCheck.placeOverlay();   // safe-zone marks follow the artwork
    if (typeof CanvasFx !== 'undefined') CanvasFx.place();                    // blank space / safe line animations
    // Stray line & dot scan + markers: always on the real artwork image, whichever layout drew it
    if (typeof AgenticAiInspector !== 'undefined' && this.canvas && this.currentImg) {
      AgenticAiInspector.onCanvasRedraw(this.canvas, this.currentImg, this.currentSpec, this.currentDims);
    }
  },

  _redrawCanvas() {
    this.init('artwork-canvas');
    if (!this.canvas || !this.currentImg) return;

    const img = this.currentImg;
    const spec = this.currentSpec || {};
    const dims = this.currentDims || {};
    let printW = parseFloat(dims.widthIn) || spec.defaultW || 36;
    let printH = parseFloat(dims.heightIn) || spec.defaultH || 24;
    // Orientation preview: the order shown turned (e.g. 36" × 72" as 72" × 36") for the customer mockup —
    // SOP 1_Banners slide 26; the order size itself is changed on admin only after approval
    if (this.previewOrderTurned) [printW, printH] = [printH, printW];

    const isRotated = (this.currentRotation === 90 || this.currentRotation === 270);
    // QNAP product template chosen: the canvas is the template's own size (with bleed)
    const qnap = this._activeQnap();
    if (qnap) {
      [printW, printH] = qnap.t.fullIn;
    } else if (this.officialTemplate?.real && Array.isArray(this.officialTemplate.bleedIn)) {
      // Real template: the canvas is the template's own bleed size
      printW = this.officialTemplate.bleedIn[0];
      printH = this.officialTemplate.bleedIn[1];
    } else if (img && img.naturalWidth && img.naturalHeight) {
      const tType = this.getTemplateType(spec, dims);
      if (tType.startsWith('desk-flag') || tType.includes('blade') || tType.includes('teardrop') || tType.includes('feather')) {
        const artAspect = img.naturalWidth / img.naturalHeight;
        const nominalAspect = printW / printH;
        // If artwork includes template bleed artboard (e.g. 0.380 vs nominal 0.311), align canvas
        if (Math.abs(artAspect - nominalAspect) / nominalAspect > 0.05 && artAspect < 1.0) {
          printW = +(printH * artAspect).toFixed(2);
        }
      } else if (tType === 'table-cover' || spec?.isShapedTemplate || (typeof appState !== 'undefined' && appState.parsedFilename?.isShapedTemplate)) {
        // Table covers: nominal order size is e.g. 72" x 30" (aspect 2.4), but the flat print template is ~1.397
        const artAspect = img.naturalWidth / img.naturalHeight;
        const targetAspect = this.officialTemplate?.aspect || spec?.templateAspect || (typeof appState !== 'undefined' && appState.parsedFilename?.templateAspect) || 1.3974;
        if (artAspect > 1.05 && artAspect < 1.95) {
          printW = +(printH * artAspect).toFixed(2);
        } else {
          printW = +(printH * targetAspect).toFixed(2);
        }
      }
    }
    // Banner: the canvas is the SOP production canvas (order + hem / pole pocket), as in the real print files
    const bannerSop = qnap ? null : this._bannerSop(spec, { widthIn: printW, heightIn: printH });
    if (bannerSop) {
      printW = bannerSop.canvasW;
      printH = bannerSop.canvasH;
    }
    // Rotate 90° turns the ARTWORK on the ordered size (landscape artwork → vertical order): the canvas
    // always keeps the order's own width × height, so the designer sees how it fits the product bought
    const viewW = printW;
    const viewH = printH;

    // Artwork view: a pasteboard around the artboard carries the dimension lines, crop marks and bleed —
    // size and format information sits outside the template, never on the artwork
    const framed = this.inspectorMode !== 'template' && this.inspectorMode !== 'mockup';
    const pad = !framed ? { l: 0, r: 0, t: 0, b: 0 }
      : Object.assign({}, this.SHEET_PAD, bannerSop ? this._bannerPadExtra(bannerSop) : {});

    // Viewport scaling strictly preserving physical product aspect ratio (never squeeze or stretch!)
    const maxViewportW = 860 - pad.l - pad.r;
    const maxViewportH = (qnap ? 520 : 480) - pad.t - pad.b;   // the template sheet uses the full viewport height
    // Real banner proportions go well past 8:1 (e.g. 20' x 2' = 10:1), so only guard against absurd values
    const targetAspect = Math.max(0.02, Math.min(50.0, viewW / viewH));

    let w, h;
    if (targetAspect >= maxViewportW / maxViewportH) {
      w = maxViewportW;
      h = Math.round(maxViewportW / targetAspect);
    } else {
      h = maxViewportH;
      w = Math.round(maxViewportH * targetAspect);
    }

    // Minimum physical visibility constraints while maintaining EXACT aspect ratio
    if (w < 110) {
      w = 110;
      h = Math.round(w / targetAspect);
    }
    if (h < 75) {
      h = 75;
      w = Math.round(h * targetAspect);
    }

    // Product template sheet: drawn at 2× (sharp template, outlines and text on every screen); viewW / viewH stay
    // the layout size, artRect is in canvas pixels as the overlays expect
    const k = qnap ? 2 : 1;
    this.pxScale = k;
    this.viewW = w + pad.l + pad.r;
    this.viewH = h + pad.t + pad.b;
    this.canvas.width = this.viewW * k;
    this.canvas.height = this.viewH * k;
    this.canvas.style.width = k > 1 ? Math.round(this.viewW * Math.min(1, 520 / this.viewH)) + 'px' : '';
    if (k > 1) {
      this.ctx.setTransform(k, 0, 0, k, 0, 0);
      this.ctx.imageSmoothingQuality = 'high';
    }

    if (this.inspectorMode === 'template') {
      this._drawTemplateMode(w, h, spec, dims);
      return;
    }
    if (this.inspectorMode === 'mockup') {
      this._drawMockupMode(w, h, spec, dims);
      return;
    }

    if (qnap) {
      this._drawQnapSheet(img, w, h, pad, qnap.t, qnap.c);
      return;
    }

    if (bannerSop) {
      this._drawBannerSop(img, w, h, bannerSop, pad);
      return;
    }

    const ctx = this.ctx;
    const ox = pad.l, oy = pad.t;
    const tType = this.getTemplateType(this.currentSpec, this.currentDims);
    const sheet = this._sheetInfo(spec, tType, printW, printH, w, h);

    // 0. Pasteboard, bleed band outside the trim, artboard with a soft shadow
    this._drawPasteboard(this.canvas.width, this.canvas.height);
    if (sheet.bleedPx && this.guides.bleed !== false) this._drawBleedBand(ox, oy, w, h, sheet.bleedPx);
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    // 1. Draw solid white substrate
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, w, h);
    ctx.restore();

    ctx.save();
    ctx.translate(ox, oy);
    // 2. Draw artwork image with aspect ratio preservation (never distorted or stretched)
    // Always fit (never stretch): any gap left over is the real area the artwork does not cover at order size
    ctx.save();
    if (this.currentRotation !== 0) {
      ctx.translate(w / 2, h / 2);
      ctx.rotate((this.currentRotation * Math.PI) / 180);
      const boxW = isRotated ? h : w;
      const boxH = isRotated ? w : h;
      const r = this._fitRect(img.naturalWidth || boxW, img.naturalHeight || boxH, boxW, boxH);
      ctx.drawImage(img, r.x - boxW / 2, r.y - boxH / 2, r.w, r.h);
      this._setTurnedArtRect(ox + w / 2, oy + h / 2, r);
    } else {
      const r = this._fitRect(img.naturalWidth || w, img.naturalHeight || h, w, h);
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
      this.artRect = { x: ox + r.x, y: oy + r.y, w: r.w, h: r.h };   // where the artwork sits on the canvas (px)
    }
    ctx.restore();
    this.trimRect = { x: ox, y: oy, w, h };

    // 2.4 Official QNAP Template Overlay when enabled via toolbar toggle or in template mode
    if (this.guides.officialOverlay && this.officialTemplateImg && this.officialTemplateImg.complete && this.officialTemplateImg.naturalWidth > 0) {
      const t = this.officialTemplateImg;
      const r = this._fitRect(t.naturalWidth, t.naturalHeight, w, h);
      ctx.save();
      ctx.globalAlpha = 0.65;
      ctx.drawImage(t, r.x, r.y, r.w, r.h);
      ctx.restore();
    }

    // 3. Product die-line and SOP guides. Flyers and business cards: exact trim / safe lines; other products keep
    //    their own template drawing, its size / safe / bleed / hardware labels go to the legend under the canvas
    let labels = [];
    if (sheet.ownGuides) this._drawSheetGuides(w, h, sheet);
    else labels = this._captureLabels(() => this._drawProductTemplate(w, h, tType));
    ctx.restore();

    // 4. Crop marks, dimension lines and the caption on the pasteboard; legend card under the canvas
    this._drawCropMarks(ox, oy, w, h, sheet.bleedPx + 4);
    this._drawSheetDims(ox, oy, w, h, sheet, pad);
    this.legend = this._sheetLegend(sheet, labels);
  },

  // ── Print sheet (pasteboard, bleed, trim, safe, dimensions, legend) ─────────────────────────────────────

  /** Pasteboard around the artboard (canvas px): dimension lines top / left, caption underneath */
  SHEET_PAD: { l: 66, r: 30, t: 56, b: 40 },

  /** One colour language for the print guides — canvas, legend and the reference sheet the team uses */
  GUIDE: {
    trim: '#1d4ed8', safe: '#16a34a', bleed: '#e11d48', bleedFill: 'rgba(244, 63, 94, 0.15)',
    board: '#e9eef5', dot: '#d2dae6', ink: '#0f172a', muted: '#475569'
  },

  /** Template labels that carry size / format information: listed in the legend, never written over the artwork */
  INFO_LABEL: /^\s*(✂|🛡|📐|🧵|🎗|🔩|⭕|⚠|🪝|👕|🧲|\|\|)/u,
  TRIM_STROKES: ['#fb7b48', '#f97316'],
  RECT_TYPES: ['banner', 'mesh-banner', 'yard-sign', 'marketing-flyer', 'business-card', 'aluminum-sign', 'acrylic-sign',
    'safety-parking-sign', 'magnet-rounded', 'perforated-window', 'a-frame', 'decal-sticker'],

  // ── QNAP product templates (ProductTemplates) ──────────────────────────────────────────────────────────

  productTemplate: null,   // QNAP_TEMPLATES record (website or QNAP template) shown under the artwork, or null
  templateMatch: null,     // ProductTemplates.autoMatch result for this order + artwork
  templateMatching: false, // the artwork outline is being matched
  templateView: 'art',     // 'art' artwork · 'blend' artwork 50% · 'tpl' template only · 'fit' fit check
  artOpacity: 1,           // 0.5 in the 'blend' view (kept for older callers)
  pxScale: 1,              // canvas pixels per layout pixel (2 on the template sheet)
  layoutBg: null,          // background colour the designer chose for a Front panel layout (null = automatic)

  /** Background of a Front panel layout: the designer's colour, else the artwork's own background, else white */
  _layoutColor() {
    return this.layoutBg || (typeof ProductTemplates !== 'undefined' ? ProductTemplates.background().color : '#ffffff');
  },

  /** Toolbar colour picker: the layout background ('' = automatic again) */
  setLayoutBg(v) {
    this.layoutBg = /^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : null;
    this._qnapComp = null;
    this.redraw();
    this.renderContextualToolbar();
  },

  /** The chosen template when its pictures are loaded and the artwork view is showing */
  _activeQnap() {
    if (!this.productTemplate || typeof ProductTemplates === 'undefined') return null;
    if (this.inspectorMode && this.inspectorMode !== 'artwork') return null;
    const c = ProductTemplates.load(this.productTemplate, () => this._afterTemplateLoad());
    return c ? { t: this.productTemplate, c } : null;
  },

  /** Template matched to the order / artwork outline: show it (sync = before the first draw) */
  _useMatch(m, sync) {
    this.templateMatch = m || null;
    this.templateMatching = false;
    this.productTemplate = (m && m.t) || null;
    this._fitOv = null;
    if (sync) {
      if (this.productTemplate) ProductTemplates.load(this.productTemplate, () => this._afterTemplateLoad());
      return;
    }
    if (this.productTemplate && !ProductTemplates.load(this.productTemplate, () => this._afterTemplateLoad())) {
      this.renderContextualToolbar();
      return;
    }
    this._afterTemplateLoad();
  },

  _afterTemplateLoad() {
    this.redraw();
    this.renderContextualToolbar();
    if (typeof SafeZoneCheck !== 'undefined') SafeZoneCheck.refresh();
  },

  /** Canvas toolbar: choose the template ('' = none, SOP guides) */
  setProductTemplate(id) {
    this.productTemplate = id && typeof ProductTemplates !== 'undefined' ? ProductTemplates.get(id) : null;
    this._fitOv = null;
    this._qnapComp = null;
    if (this.productTemplate && !ProductTemplates.load(this.productTemplate, () => this._afterTemplateLoad())) {
      this.renderContextualToolbar();
      return;
    }
    this._afterTemplateLoad();
  },

  /** Template view: 'art' artwork · 'blend' artwork at 50% · 'tpl' template only · 'fit' fit check */
  setTemplateView(v) {
    this.templateView = ['art', 'blend', 'tpl', 'fit'].includes(v) ? v : 'art';
    this.artOpacity = this.templateView === 'blend' ? 0.5 : 1;
    this.redraw();
    this.renderContextualToolbar();
  },

  /** Artwork at 50%: the template's bleed, visible and safe areas show through */
  toggleArtOpacity() {
    this.setTemplateView(this.templateView === 'blend' ? 'art' : 'blend');
  },

  /** Fit numbers of the artwork on the chosen template (ProductTemplates.stats), or null */
  _templateStats() {
    const t = this.productTemplate, img = this.currentImg;
    if (!t || !img || !img.naturalWidth || typeof ProductTemplates === 'undefined') return null;
    const turned = this.currentRotation === 90 || this.currentRotation === 270;
    return ProductTemplates.stats(t, turned ? img.naturalHeight : img.naturalWidth, turned ? img.naturalWidth : img.naturalHeight, this.currentRotation);
  },

  /** The template is for another size than the order ("8 x 2.5 Ft" template, 6 ft order): a warning, else '' */
  _templateSizeNote(t) {
    const d = this.currentDims || {}, W = parseFloat(d.widthIn), H = parseFloat(d.heightIn);
    if (!t || !t.stated || !t.stated[0] || !(W > 0 && H > 0)) return '';
    if (ProductTemplates._sizeErr([W, H], [t.stated[0], t.stated[1]]) <= 0.08) return '';
    const f = v => +(+v).toFixed(2);
    return `⚠ Template is for ${f(t.stated[0])}" × ${f(t.stated[1])}" — order is ${f(W)}" × ${f(H)}"`;
  },

  /**
   * The order names another variant than the layout the artwork is made for (artwork outline = 3 Sided Open Back,
   * order = 4 Sided Closed Back): a warning, else ''
   */
  _templateVariantNote(t) {
    const m = this.templateMatch;
    if (!t || !m || !m.shaped || m.t !== t || typeof ProductTemplates === 'undefined') return '';
    const st = (typeof appState !== 'undefined') ? appState : {};
    const fname = (st.parsedFilename && st.parsedFilename.fname) || (st.file && st.file.name) || '';
    const rows = ProductTemplates.rank(this.currentSpec || {}, this.currentDims || {}, st.parsedFilename, fname);
    const cur = rows.find(r => r.t === t);
    if (!cur) return '';
    const alt = rows.filter(r => r.t.product === t.product && ProductTemplates.isLayout(r.t) && r.size >= cur.size && r.panel > cur.panel + 0.2)
      .sort((a, b) => b.panel - a.panel)[0];
    if (!alt) return '';
    const variant = x => String(x.name).split('·').pop().trim();
    return `⚠ Order says “${variant(alt.t)}” — the artwork is laid out for “${variant(t)}”`;
  },

  /** Fit chips for the toolbar: outline match / proportions, variant and size checks */
  _fitChips(s) {
    const t = this.productTemplate;
    if (!t || !s) return '';
    const esc = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const m = this.templateMatch, pc = v => `${Math.round(v * 100)}%`;
    let cls = 'ok', text, title = '';
    if (s.on === 'shape') {
      const top = m && m.shapeRank && m.shapeRank[0];
      const better = top && top.t.id !== t.id && top.score > s.score + 0.03 ? top : null;
      if (s.score >= 0.9) text = `✓ Artwork outline matches this template · ${pc(s.score)}`;
      else if (s.score >= 0.8) text = `✓ Outline matches · ${pc(s.score)} — check the edges in Fit check`;
      else { cls = 'bad'; text = `⚠ Artwork outline differs from this template · ${pc(s.score)}${better ? ` — best: ${better.t.name} (${pc(better.score)})` : ''}`; }
      title = 'The artwork outline was matched to the template outline (open / closed back, length, flag shape) and placed where it lies on the template.';
    } else if (s.on === 'front') {
      const bg = ProductTemplates.background(), col = this._layoutColor();
      const area = ProductTemplates.logoArea(t);
      text = `✓ Artwork centred on the ${area} · background ${this.layoutBg ? 'chosen' : bg.from === 'artwork' ? 'from the artwork' : 'white (default)'}`;
      title = `Not a laid-out file for this product (a logo or a design of another shape): it is centred on the ${area} inside the safe line, and the background colour fills the whole product including the bleed.`;
      const warns = [this._templateSizeNote(t)].filter(Boolean);
      return `<span class="vqb-fit ok" title="${esc(title)}">${esc(text)}</span>
        <label class="vqb-bg" title="Background colour of the cover"><span>Background</span><input type="color" value="${esc(col)}" onchange="CanvasInspector.setLayoutBg(this.value)"></label>
        ${this.layoutBg ? `<button type="button" class="vqb-view" onclick="CanvasInspector.setLayoutBg('')" title="Back to the artwork's own background (or white)">Auto</button>` : ''}`
        + warns.map(w => `<span class="vqb-fit warn">${esc(w)}</span>`).join('');
    } else if (s.on === 'fit') {
      cls = 'warn'; text = '⚠ Proportions differ from the template — fitted into the visible area';
    } else {
      text = `✓ Proportions match the ${s.on === 'full' ? 'full template size with bleed' : s.on + ' area'}`;
    }
    const warns = [this._templateVariantNote(t), this._templateSizeNote(t)].filter(Boolean);
    return `<span class="vqb-fit ${cls}" title="${esc(title)}">${esc(text)}</span>` + warns.map(w => `<span class="vqb-fit warn">${esc(w)}</span>`).join('');
  },

  /**
   * Proof 02 picture: the customer's artwork on the QNAP template (as placed on the canvas) with the template's safe /
   * visible outlines — JPEG data URL, cached; null when no template is chosen or loaded.
   */
  qnapComposite() {
    const q = this.productTemplate && typeof ProductTemplates !== 'undefined' ? ProductTemplates.load(this.productTemplate) : null;
    const img = this.currentImg;
    if (!q || !img || !img.naturalWidth) return null;
    const t = this.productTemplate;
    const turned = this.currentRotation === 90 || this.currentRotation === 270;
    const p = ProductTemplates.placement(t, turned ? img.naturalHeight : img.naturalWidth, turned ? img.naturalWidth : img.naturalHeight, this.currentRotation);
    const key = [t.id, img.src.length, img.src.slice(-40), this.currentRotation, p.x, p.y, p.w, this._layoutColor()].join('|');
    if (this._qnapComp && this._qnapComp.key === key) return this._qnapComp.url;
    // at least 2000 px across: the proof page is printed / zoomed
    const k = Math.max(1, 2000 / q.img.naturalWidth);
    const W = Math.round(q.img.naturalWidth * k), H = Math.round(q.img.naturalHeight * k), s = W / t.fullIn[0];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(q.img, 0, 0, W, H);
    if (p.on === 'front') ProductTemplates.fillProduct(ctx, q, t, 0, 0, W, H, this._layoutColor());
    const art = p.on === 'shape' ? ProductTemplates.clippedArt(img) : img;
    const px = p.x * s, py = p.y * s, pw = p.w * s, ph = p.h * s;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    if (this.currentRotation) {
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate((this.currentRotation * Math.PI) / 180);
      const bw = turned ? ph : pw, bh = turned ? pw : ph;
      ctx.drawImage(art, -bw / 2, -bh / 2, bw, bh);
    } else {
      ctx.drawImage(art, px, py, pw, ph);
      ProductTemplates.logoCopies(t, p).forEach(c => ctx.drawImage(art, c.x * s, c.y * s, c.w * s, c.h * s));
    }
    ctx.restore();
    ProductTemplates.drawOutlines(ctx, q, t, 0, 0, W, H, { width: Math.max(2, W / 700) });
    let url = null;
    try { url = cv.toDataURL('image/jpeg', 0.88); } catch (e) { return null; }
    this._qnapComp = { key, url };
    return url;
  },

  /**
   * Toolbar: template picker (best outline matches · production standard · website design templates · QNAP templates, with the
   * outline match in %), the view switch (Artwork · 50% · Template · Fit check) and the fit chips
   */
  _qnapBar() {
    if (typeof ProductTemplates === 'undefined' || !ProductTemplates.list().length) return '';
    const st = (typeof appState !== 'undefined') ? appState : {};
    const fname = (st.parsedFilename && st.parsedFilename.fname) || (st.file && st.file.name) || '';
    const ranked = ProductTemplates.rank(this.currentSpec || {}, this.currentDims || {}, st.parsedFilename, fname).map(r => r.t);
    const cur = this.productTemplate;
    if (!ranked.length && !cur) return '';
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const m = this.templateMatch, fits = m && m.shaped ? m.fits : null;
    const pct = t => fits && fits.get(t.id) ? ` · ${Math.round(fits.get(t.id).score * 100)}% outline match` : '';
    const opt = t => `<option value="${esc(t.id)}" ${cur && cur.id === t.id ? 'selected' : ''}>${esc(ProductTemplates.label(t) + pct(t))}</option>`;
    const best = m && m.shaped ? m.shapeRank.slice(0, 3).map(x => x.t) : [];
    const rest = ranked.filter(t => !best.includes(t));
    const std = rest.filter(t => ProductTemplates.isProduction(t));
    const web = rest.filter(t => ProductTemplates.isWebsite(t));
    const qnap = rest.filter(t => !ProductTemplates.isLayout(t)).slice(0, 40);
    const group = (label, list) => list.length ? `<optgroup label="${esc(label)}">${list.map(opt).join('')}</optgroup>` : '';
    const listed = best.concat(std, web, qnap);
    const loading = cur && !ProductTemplates.load(cur);
    const views = [['art', 'Artwork', 'The artwork on the template'], ['blend', '◐ 50%', 'Artwork at 50% — the template shows through'],
      ['tpl', 'Template', 'The template alone'], ['fit', 'Fit check', 'Red = visible area not covered · pink = bleed not covered · amber = artwork cut off']];
    const view = this.templateView || 'art';
    const kind = cur ? ProductTemplates.kindName(cur) : '';
    return `
      <div class="vi-qnap-bar">
        <div class="vqb-row">
          <span class="vqb-label">🧩 Product template</span>
          <select class="vqb-select" onchange="CanvasInspector.setProductTemplate(this.value)" title="Production standard templates, website design templates (what customers design on) and QNAP production templates (\\\\192.168.0.250\\qnap\\Template_Mockups)">
            <option value="">— None (SOP guides) —</option>
            ${group('Best match for this artwork', best)}
            ${group('Production standard (BannerBuzz)', std)}
            ${group('Website design templates', web)}
            ${group('QNAP production templates', qnap)}
            ${cur && !listed.includes(cur) ? opt(cur) : ''}
          </select>
          ${kind ? `<span class="vqb-kind ${ProductTemplates.isProduction(cur) ? 'std' : ProductTemplates.isWebsite(cur) ? 'web' : 'qnap'}">${kind}</span>` : ''}
          ${this.templateMatching ? '<span class="vqb-note"><i class="vqb-spin"></i>Matching the artwork outline…</span>' : ''}
          ${loading ? '<span class="vqb-note"><i class="vqb-spin"></i>Loading template…</span>' : ''}
        </div>
        ${cur ? `
        <div class="vqb-row">
          <div class="vqb-views" role="group" aria-label="Template view">${views.map(([k, l, tip]) => `<button type="button" class="vqb-view${k === 'blend' ? ' vqb-opacity' : ''}${view === k ? ' on' : ''}" aria-pressed="${view === k}" title="${esc(tip)}" onclick="CanvasInspector.setTemplateView('${k}')">${l}</button>`).join('')}</div>
          ${this._fitChips(this._templateStats())}
        </div>` : ''}
      </div>`;
  },

  /**
   * Template sheet: the production standard, website design template or QNAP template is the artboard (drawn at 2×). A shaped
   * artwork sits where its outline matches the template (without the white page around it); a rectangle on the full
   * size with bleed, visible area or safe area, whichever its proportions match, else fitted into the visible area.
   * Views: artwork · 50% · template only · fit check (gaps red, uncovered bleed pink, cut-off artwork amber). The
   * template's outlines (cut line red, visible blue, safe green dashed) are smooth vector lines on top. Sizes are on
   * the pasteboard and in the legend, never on the artwork.
   */
  _drawQnapSheet(img, w, h, pad, t, c) {
    const ctx = this.ctx, k = this.pxScale || 1;
    const ox = pad.l, oy = pad.t, s = w / t.fullIn[0];
    const fmt = v => +(+v).toFixed(2);
    const pc = v => `${Math.round(v * 1000) / 10}%`;
    const isRotated = (this.currentRotation === 90 || this.currentRotation === 270);
    const web = ProductTemplates.isLayout(t);   // a product layout on a white page (production standard / website)
    const view = this.templateView || 'art';
    const CW = this.viewW || this.canvas.width, CH = this.viewH || this.canvas.height;
    this._drawPasteboard(CW, CH);
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, w, h);
    ctx.restore();
    ctx.save();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.img, ox, oy, w, h);
    ctx.restore();

    // artwork on the template: a shaped artwork where its outline matches (without the white page around it),
    // a rectangle by its proportions; nothing beyond the template picture is drawn
    const aw = img.naturalWidth || 1, ah = img.naturalHeight || 1;
    const p = ProductTemplates.placement(t, isRotated ? ah : aw, isRotated ? aw : ah, this.currentRotation);
    this.qnapPlacement = p;
    const px = ox + p.x * s, py = oy + p.y * s, pw = p.w * s, ph = p.h * s;
    if (view !== 'tpl') {
      const art = p.on === 'shape' ? ProductTemplates.clippedArt(img) : img;
      // logo / front design: the background colour fills the whole cover (bleed included) under it
      if (p.on === 'front') {
        ctx.save();
        ctx.globalAlpha = view === 'blend' ? 0.5 : 1;
        ProductTemplates.fillProduct(ctx, c, t, ox, oy, w, h, this._layoutColor());
        ctx.restore();
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(ox, oy, w, h); ctx.clip();
      ctx.globalAlpha = view === 'blend' ? 0.5 : view === 'fit' && p.on !== 'front' ? 0.35 : 1;
      ctx.imageSmoothingQuality = 'high';
      if (this.currentRotation) {
        ctx.translate(px + pw / 2, py + ph / 2);
        ctx.rotate((this.currentRotation * Math.PI) / 180);
        const bw = isRotated ? ph : pw, bh = isRotated ? pw : ph;
        ctx.drawImage(art, -bw / 2, -bh / 2, bw, bh);
      } else {
        ctx.drawImage(art, px, py, pw, ph);
        // a double-sided flag: the same logo on the other side
        ProductTemplates.logoCopies(t, p).forEach(c => ctx.drawImage(art, ox + c.x * s, oy + c.y * s, c.w * s, c.h * s));
      }
      ctx.restore();
    }
    this.artRect = { x: px * k, y: py * k, w: pw * k, h: ph * k };   // canvas px (the turned artwork fills the placement too)
    this.artRot = this.currentRotation || 0;

    // fit check on the Front panel layout: the panel's safe area the logo is centred in
    if (view === 'fit' && p.on === 'front' && t.frontSafe) {
      const fb = t.frontSafe;
      ctx.save();
      ctx.fillStyle = 'rgba(22, 163, 74, 0.12)';
      ctx.strokeStyle = '#16a34a';
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1.5;
      ctx.fillRect(ox + fb[0] * s, oy + fb[1] * s, (fb[2] - fb[0]) * s, (fb[3] - fb[1]) * s);
      ctx.strokeRect(ox + fb[0] * s, oy + fb[1] * s, (fb[2] - fb[0]) * s, (fb[3] - fb[1]) * s);
      ctx.restore();
    }
    // fit check: red = visible area not covered, pink = bleed not covered, amber = artwork outside the product
    if (view === 'fit' && p.on !== 'front') {
      const m = ProductTemplates._match;
      const sil = p.on === 'shape' && m && m.sil ? m.sil : ProductTemplates._rectSil(isRotated ? ah : aw, isRotated ? aw : ah);
      const key = [t.id, p.x, p.y, p.w, p.h, sil.w, sil.h].join('|');
      if (!this._fitOv || this._fitOv.key !== key) this._fitOv = { key, cv: ProductTemplates.fitOverlay(t, c, p, sil) };
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this._fitOv.cv, ox, oy, w, h);
      ctx.restore();
    }

    // the template's outlines: cut line (red), visible area (blue), safe area (green dashed) — smooth vector lines
    if (this.guides.safeArea !== false) ProductTemplates.drawOutlines(ctx, c, t, ox, oy, w, h);
    ctx.save();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
    ctx.restore();
    this._drawCropMarks(ox, oy, w, h, 4);

    // sizes on the pasteboard: the product (with bleed) for a product layout, the template sheet for QNAP
    const vis = t.visIn || [0, 0, t.fullIn[0], t.fullIn[1]], safe = t.safeIn || vis;
    const prod = web && t.prodIn ? t.prodIn : [0, 0, t.fullIn[0], t.fullIn[1]];
    const R = c.mask ? ProductTemplates._regions(c, t) : null;
    const bleedBars = !!(R && R.full.area && (R.full.area - R.visible.area) / R.full.area > 0.005);
    if (this.guides.dims !== false) {
      const yTop = Math.round(pad.t / 2) - 6, xLeft = Math.round(pad.l / 2) - 6;
      if (web) {
        const with_ = bleedBars ? 'with bleed' : 'flat layout';
        this._dimLine(ox + prod[0] * s, yTop, (prod[2] - prod[0]) * s, [`${fmt(prod[2] - prod[0])}" W`, with_], false, oy + prod[1] * s - yTop - 2);
        this._dimLine(xLeft, oy + prod[1] * s, (prod[3] - prod[1]) * s, [`${fmt(prod[3] - prod[1])}" H`, with_], true, ox + prod[0] * s - xLeft - 2);
      } else {
        this._dimLine(ox, yTop, w, [`${fmt(t.fullIn[0])}" W with bleed`, `visible ${fmt(vis[2] - vis[0])}"`], false, oy - yTop - 2);
        this._dimLine(xLeft, oy, h, [`${fmt(t.fullIn[1])}" H with bleed`, `visible ${fmt(vis[3] - vis[1])}"`], true, ox - xLeft - 2);
      }
    }
    if (pad.b >= 20 && !this.currentRotation && CW > 420) {
      ctx.save();
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const cap = `${ProductTemplates.kindName(t).toUpperCase()} · ${t.product} · ${t.name}`;
      ctx.fillText(cap.length > 110 ? cap.slice(0, 108) + '…' : cap, CW - pad.r, CH - Math.max(12, pad.b / 2 - 4));
      ctx.restore();
    }

    // legend: areas of the template, how the artwork fits
    const st = this._templateStats();
    const ON = { shape: 'by its outline — registered on the template', full: 'the full template size (with bleed)', visible: 'the visible area', safe: 'the safe area', fit: 'fitted into the visible area (its proportions differ from the template)',
      front: t.logoArea ? `centred in the ${t.logoArea}` : 'centred on the Front panel, inside its safe area' };
    const notes = [{ text: `Artwork placed ${p.on === 'shape' || p.on === 'front' ? '' : 'on '}${ON[p.on]}`, color: '#334155' }];
    const bg = ProductTemplates.background(), bgColor = this._layoutColor();
    if (p.on === 'front') {
      notes.push({ text: this.layoutBg ? `Background ${bgColor.toUpperCase()} — chosen by the designer` : bg.from === 'artwork' ? `Background ${bgColor.toUpperCase()} — the artwork's own background colour, over the whole cover and bleed` : 'Background white — the artwork has no background colour (default)', color: bgColor === '#ffffff' ? '#94a3b8' : bgColor });
    } else if (p.on === 'shape' && p.region === 'visible' && bleedBars) notes.push({ text: 'Artwork stops at the visible edge — extend the background into the bleed', color: '#b45309' });
    else if (p.on !== 'full' && p.on !== 'shape') notes.push({ text: 'Background does not run into the bleed — extend it to the full template size', color: '#b45309' });
    [this._templateVariantNote(t), this._templateSizeNote(t)].filter(Boolean).forEach(w => notes.push({ text: w.replace(/^⚠\s*/, ''), color: '#b45309' }));
    if (view === 'blend') notes.push({ text: 'Artwork shown at 50% — the template shows through', color: '#4739d2' });
    if (view === 'tpl') notes.push({ text: 'Template only — the artwork is hidden', color: '#4739d2' });
    if (view === 'fit') notes.push(p.on === 'front'
      ? { text: `Fit check: green box = the ${t.logoArea || 'Front panel safe area'} the artwork is centred in`, color: '#16a34a' }
      : { text: 'Fit check: red = visible area not covered · pink = bleed not covered · amber = artwork cut off', color: '#dc2626' });
    if (this.currentRotation) notes.push({ text: 'Preview turned — order unchanged', color: '#b45309' });
    const cards = web ? [
      bleedBars
        ? { key: 'bleed', title: 'Bleed (red)', value: `${fmt(prod[2] - prod[0])}" × ${fmt(prod[3] - prod[1])}" with bleed`, desc: 'Red bars / band: cut off or pulled under — backgrounds must run into them.' }
        : { key: 'bleed', title: 'Cut line (red)', value: `${fmt(prod[2] - prod[0])}" × ${fmt(prod[3] - prod[1])}" flat layout`, desc: 'The product outline — the artwork must fill it to the line.' },
      { key: 'trim', title: 'Visible area (blue line)', value: t.stated && t.stated[0] ? `Fits a ${fmt(t.stated[0] / 12)} × ${fmt(t.stated[1] / 12)} ft table (${fmt(t.stated[0])}" × ${fmt(t.stated[1])}")` : `${fmt(vis[2] - vis[0])}" × ${fmt(vis[3] - vis[1])}" outline`, desc: 'What shows on the finished product.' },
      { key: 'safe', title: 'Safe area (green dashed)', value: t.safeNote || 'Lavender area of the template', desc: 'Keep all important text, logos and graphics inside this line.' },
      { key: 'canvas', title: 'Template', value: t.name, desc: ProductTemplates.isProduction(t) ? 'BannerBuzz production standard — the layout the print file is made on.' : 'Website design template — the layout the customer designs on.' }
    ] : [
      { key: 'bleed', title: 'Bleed (red)', value: `${fmt(t.fullIn[0])}" × ${fmt(t.fullIn[1])}" with bleed`, desc: 'Cut off after printing — backgrounds and photos must run to here.' },
      { key: 'trim', title: 'Visible area (blue line)', value: `${fmt(vis[2] - vis[0])}" × ${fmt(vis[3] - vis[1])}"`, desc: 'What shows on the finished product.' },
      { key: 'safe', title: 'Safe area (green dashed)', value: `${fmt(safe[2] - safe[0])}" × ${fmt(safe[3] - safe[1])}"`, desc: 'Keep all important text, logos and graphics inside this line.' },
      { key: 'canvas', title: 'Template', value: t.name, desc: t.path || t.product }
    ];
    if (st && st.on === 'front') {
      cards.push({ key: 'layout', color: bgColor, title: `Layout · ${ProductTemplates.logoArea(t)}`, value: `Artwork ${fmt(p.w)}" × ${fmt(p.h)}" centred in the ${t.logoArea ? 'safe area' : 'Front'}`,
        desc: `Background ${bgColor.toUpperCase()} fills the product and bleed${this.layoutBg ? ' (designer)' : bg.from === 'artwork' ? ' (from the artwork)' : ' (default white)'}.` });
    } else if (st) {
      const bad = st.cover < 0.985 || st.spill > 0.01 || (st.score != null && st.score < 0.8);
      const parts = [`${pc(st.spill)} of the artwork outside the product`];
      if (bleedBars || !web) parts.push(`bleed ${pc(st.bleed)} covered`);
      cards.push({ key: 'fit', title: st.score != null ? `Artwork fit · outline ${Math.round(st.score * 100)}%` : 'Artwork fit',
        value: `${pc(st.cover)} of the visible area covered`, desc: parts.join(' · '), warn: bad });
    }
    this.legend = {
      title: ProductTemplates.kindName(t).replace(/\b\w/g, ch => ch.toUpperCase()), product: t.product,
      source: ProductTemplates.isProduction(t) ? 'Production' : web ? 'Website' : 'QNAP', words: ProductTemplates.isProduction(t) ? t.path : t.src,
      cards, notes,
      tip: 'Switch the view: ◐ 50% shows the template through the artwork, Template shows it alone, Fit check marks gaps and cut-off areas. The Safe Area check measures text and logos against this template.'
    };
  },

  /** Room for the hem / pole pocket callouts beside the banner artboard */
  _bannerPadExtra(b) {
    const a = b.allow || {};
    const out = {};
    if (a.top > 0 || a.bottom > 0) out.r = 104;
    if (a.left > 0 || a.right > 0) out.b = 60;
    return out;
  },

  /** Trim / safe / bleed of the product shown, in inches and canvas px */
  _sheetInfo(spec, tType, printW, printH, w, h) {
    const st = (typeof appState !== 'undefined') ? appState : {};
    const ppi = w / printW;
    const rect = this.RECT_TYPES.includes(tType) && !(this.officialTemplate && this.officialTemplate.real && Array.isArray(this.officialTemplate.bleedIn));
    const bleedIn = parseFloat(spec.bleed) > 0 ? parseFloat(spec.bleed) : 0;
    let safeIn = (typeof SopRules !== 'undefined' && SopRules.safeArea) ? SopRules.safeArea(spec, st.parsedFilename).inches : null;
    if (!(safeIn > 0)) safeIn = parseFloat(spec.safeArea) > 0 ? parseFloat(spec.safeArea) : 0;
    const truePx = bleedIn * ppi;
    return {
      rect, tType, W: printW, H: printH, ppi, bleedIn, safeIn,
      bleedPx: rect && bleedIn > 0 ? Math.max(7, Math.min(14, truePx)) : 0,
      bleedEnlarged: rect && bleedIn > 0 && truePx < 7,
      ownGuides: ['marketing-flyer', 'business-card'].includes(tType),
      name: spec.name || ''
    };
  },

  /** Run a template drawing with its info labels collected instead of drawn, and its cut line in the trim colour */
  _captureLabels(fn) {
    const ctx = this.ctx, out = [];
    const proto = Object.getPrototypeOf(ctx);
    const fill = proto.fillText;
    const stroke = Object.getOwnPropertyDescriptor(proto, 'strokeStyle');
    const re = this.INFO_LABEL, trims = this.TRIM_STROKES, blue = this.GUIDE.trim;
    ctx.fillText = function (t, x, y, m) {
      const s = String(t);
      if (re.test(s)) {
        const color = String(this.fillStyle).toLowerCase();
        if (!out.some(o => o.text === s.trim())) out.push({ text: s.trim(), color: trims.includes(color) ? blue : color });
        return;
      }
      return m === undefined ? fill.call(this, t, x, y) : fill.call(this, t, x, y, m);
    };
    if (stroke && stroke.set) {
      Object.defineProperty(ctx, 'strokeStyle', {
        configurable: true,
        get() { return stroke.get.call(this); },
        set(v) { stroke.set.call(this, typeof v === 'string' && trims.includes(v.toLowerCase()) ? blue : v); }
      });
    }
    try { fn(); } finally { delete ctx.fillText; delete ctx.strokeStyle; }
    return out;
  },

  /**
   * BannerBuzz grommet mark (CMYK Grommet.svg): square with a white → grey border and cyan · magenta / black · yellow
   * quarters, centred on the grommet position. Same proportions and colours as the SVG (outer square 187.14 units,
   * quarters 83.74, inset 9.83, 4-unit #231f20 outline). size = width of the mark in px.
   */
  drawGrommetMark(ctx, cx, cy, size) {
    const s = Math.max(6, size), k = s / 187.14;
    const x0 = cx - s / 2, y0 = cy - s / 2;
    ctx.save();
    ctx.setLineDash([]);
    const grad = ctx.createLinearGradient(x0, y0 + s, x0 + s, y0);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#d1d3d4');
    ctx.fillStyle = grad;
    ctx.fillRect(x0, y0, s, s);
    const q = 83.74 * k, ix = x0 + 9.83 * k, iy = y0 + 9.83 * k;
    ctx.fillStyle = '#00aeef'; ctx.fillRect(ix, iy, q, q);
    ctx.fillStyle = '#ec008c'; ctx.fillRect(ix + q, iy, q, q);
    ctx.fillStyle = '#231f20'; ctx.fillRect(ix, iy + q, q, q);
    ctx.fillStyle = '#fdee00'; ctx.fillRect(ix + q, iy + q, q, q);
    ctx.lineWidth = Math.max(0.7, 4 * k);
    ctx.strokeStyle = '#231f20';
    ctx.strokeRect(x0, y0, s, s);
    ctx.restore();
  },

  /** Soft grey pasteboard with a dot grid, like a design app */
  _drawPasteboard(CW, CH) {
    const ctx = this.ctx, G = this.GUIDE;
    ctx.save();
    ctx.fillStyle = G.board;
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = G.dot;
    for (let y = 7; y < CH; y += 14) for (let x = 7; x < CW; x += 14) ctx.fillRect(x, y, 1.2, 1.2);
    ctx.restore();
  },

  /** Bleed: the band outside the trim, where backgrounds must extend (trimmed off after printing) */
  _drawBleedBand(ox, oy, w, h, b) {
    const ctx = this.ctx, G = this.GUIDE;
    ctx.save();
    ctx.fillStyle = G.bleedFill;
    ctx.beginPath();
    ctx.rect(ox - b, oy - b, w + 2 * b, h + 2 * b);
    ctx.rect(ox, oy, w, h);
    ctx.fill('evenodd');
    ctx.strokeStyle = G.bleed;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(ox - b + 0.5, oy - b + 0.5, w + 2 * b - 1, h + 2 * b - 1);
    ctx.restore();
  },

  /** Flyers / business cards: exact trim line and safe area (the safe line is where the Safe Area check measures) */
  _drawSheetGuides(w, h, s) {
    const ctx = this.ctx, G = this.GUIDE;
    if (this.guides.cutLine !== false) {
      ctx.save();
      ctx.strokeStyle = G.trim;
      ctx.lineWidth = 1.6;
      ctx.strokeRect(0.8, 0.8, w - 1.6, h - 1.6);
      ctx.restore();
    }
    const sp = s.safeIn * s.ppi;
    if (this.guides.safeArea !== false && sp > 0 && sp * 2 < w && sp * 2 < h) {
      ctx.save();
      ctx.strokeStyle = G.safe;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(sp, sp, w - 2 * sp, h - 2 * sp);
      ctx.restore();
    }
  },

  /** Printer's crop marks at the trim corners, outside the bleed */
  _drawCropMarks(ox, oy, w, h, gap) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    [[ox, oy, -1, -1], [ox + w, oy, 1, -1], [ox, oy + h, -1, 1], [ox + w, oy + h, 1, 1]].forEach(([x, y, dx, dy]) => {
      ctx.moveTo(x + dx * gap, y); ctx.lineTo(x + dx * (gap + 9), y);
      ctx.moveTo(x, y + dy * gap); ctx.lineTo(x, y + dy * (gap + 9));
    });
    ctx.stroke();
    ctx.restore();
  },

  /**
   * Dimension line on the pasteboard: arrows, extension lines to the artboard, label in the middle.
   * parts: label parts, most important first — dropped from the end when the side is too short.
   */
  _dimLine(x, y, len, parts, vertical, extTo) {
    const ctx = this.ctx;
    ctx.save();
    if (vertical) { ctx.translate(x, y + len); ctx.rotate(-Math.PI / 2); }
    else ctx.translate(x, y);
    ctx.strokeStyle = '#475569';
    ctx.fillStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(0, extTo);
    ctx.moveTo(len, -5); ctx.lineTo(len, extTo);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke();
    [[0, 1], [len, -1]].forEach(([px, d]) => {
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px + d * 6, -3); ctx.lineTo(px + d * 6, 3); ctx.closePath(); ctx.fill();
    });
    ctx.font = '600 10.5px Inter, sans-serif';
    let t = '';
    for (let n = parts.length; n >= 1; n--) {
      const c = parts.slice(0, n).filter(Boolean).join('  ·  ');
      if (ctx.measureText(c).width + 16 <= len) { t = c; break; }
    }
    if (t) {
      const lw = ctx.measureText(t).width + 12;
      ctx.fillStyle = this.GUIDE.board;
      ctx.fillRect(len / 2 - lw / 2, -8, lw, 16);
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t, len / 2, 0.5);
    }
    ctx.restore();
  },

  /** Finished-size dimension lines (top: width, left: height) and the caption under the artboard */
  _drawSheetDims(ox, oy, w, h, s, pad) {
    const fmt = v => +(+v).toFixed(3);
    const ft = v => +(v / 12).toFixed(2);
    const big = Math.max(s.W, s.H) >= 24;
    if (this.guides.dims !== false) {
      const yTop = Math.round(pad.t / 2) - 6, xLeft = Math.round(pad.l / 2) - 6;
      this._dimLine(ox, yTop, w, [this._dimLabel(s.W, 'W', `${fmt(s.W)}" W${big ? ` (${ft(s.W)} ft)` : ''}`), 'finished size'], false, oy - yTop - 2);
      this._dimLine(xLeft, oy, h, [this._dimLabel(s.H, 'H', `${fmt(s.H)}" H${big ? ` (${ft(s.H)} ft)` : ''}`), 'finished size'], true, ox - xLeft - 2);
    }
    const CW = this.canvas.width, CH = this.canvas.height;
    if (pad.b >= 20 && !(this.currentRotation || this.previewOrderTurned) && CW > 420) {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '600 10px Inter, sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const parts = [s.rect ? 'PRINT TEMPLATE' : 'PRODUCT TEMPLATE', `trim ${this._sizeLabel(s.W, s.H, `${fmt(s.W)}" × ${fmt(s.H)}"`)}`];
      if (s.bleedPx) parts.push(`bleed ${fmt(s.bleedIn)}"`);
      if (s.rect && s.safeIn) parts.push(`safe ${fmt(s.safeIn)}"`);
      ctx.fillText(parts.join(' · '), CW - pad.r, CH - Math.max(12, pad.b / 2 - 4));
      ctx.restore();
    }
  },

  /** Legend card for the print sheet: bleed / trim / safe cards with the values, then the template's own notes */
  _sheetLegend(s, labels) {
    const fmt = v => +(+v).toFixed(3);
    const pick = re => labels.find(l => re.test(l.text));
    const strip = t => t.replace(this.INFO_LABEL, '').replace(/^[\s️:]+/, '').trim();
    const extra = l => { const m = l && l.text.match(/\(([^)]+)\)|·\s*(.+)$/); return m ? ' · ' + (m[1] || m[2]).trim() : ''; };
    const cards = [];
    if (s.rect) {
      const tr = pick(/^\s*✂/), sf = pick(/^\s*🛡/), bl = pick(/^\s*📐/);
      if (s.bleedIn > 0) cards.push({ key: 'bleed', title: 'Bleed area', value: `${this._lenLabel(s.bleedIn, `${fmt(s.bleedIn)}"`)} on all sides`,
        desc: 'Extend background colours and photos to here — trimmed off after printing.' + extra(bl) + (s.bleedEnlarged ? ' (Drawn wider so it shows at this zoom.)' : '') });
      cards.push({ key: 'trim', title: 'Trim line (final size)', value: this._sizeLabel(s.W, s.H, `${+(+s.W).toFixed(2)}" × ${+(+s.H).toFixed(2)}"`),
        desc: 'The finished size of the printed piece — where the product is cut.' + extra(tr).replace(/Standard 8\.5" × 11"/, '').replace(/ · $/, '') });
      if (s.safeIn > 0) cards.push({ key: 'safe', title: 'Safe area', value: `${this._lenLabel(s.safeIn, `${fmt(s.safeIn)}"`)} inside the trim`,
        desc: 'Keep all important text, logos and elements inside this line.' + extra(sf) });
    } else {
      // shaped products: the template's own wording, with the SOP / catalog values where they exist
      const tr = pick(/^\s*✂/), sf = pick(/^\s*🛡/), bl = pick(/^\s*📐/);
      const after = l => { const t = strip(l.text); return t.includes(':') ? t.slice(t.indexOf(':') + 1).trim() : t; };
      const shape = tr ? strip(tr.text).split(':')[0].trim() : '';
      cards.push({ key: 'trim', title: 'Cut line (final shape)', value: this._sizeLabel(s.W, s.H, `${+(+s.W).toFixed(2)}" × ${+(+s.H).toFixed(2)}"`),
        desc: (shape ? shape.charAt(0) + shape.slice(1).toLowerCase() + ' — ' : '') + 'the finished shape of the product, where it is cut or sewn.' });
      if (s.safeIn > 0 || sf) cards.push({ key: 'safe', title: 'Safe area', value: s.safeIn > 0 ? `${fmt(s.safeIn)}" inside the cut line` : after(sf),
        desc: 'Keep all important text, logos and elements inside this line.' });
      if (s.bleedIn > 0 || bl) cards.push({ key: 'bleed', title: 'Bleed', value: s.bleedIn > 0 ? `${fmt(s.bleedIn)}" past the cut line` : after(bl),
        desc: 'Extend backgrounds past the cut line — trimmed off after printing.' });
    }
    // everything else the template states (hems, sleeves, hardware, stock) — kept, just not over the artwork
    const core = /^\s*(✂|🛡|📐)/u;
    const notes = labels.filter(l => !core.test(l.text)).map(l => ({ text: strip(l.text), color: l.color }));
    if (this.currentRotation || this.previewOrderTurned) notes.push({ text: 'Preview turned — order unchanged', color: '#b45309' });
    return {
      title: s.rect ? 'Print Template Guide' : 'Product Template Guide',
      product: s.name, source: null, warn: null, cards, notes,
      tip: s.rect ? 'Set up the file with bleed before designing: backgrounds to the bleed edge, text and logos inside the safe area.' : ''
    };
  },

  /**
   * Draw product-specific template shapes and guide lines
   */
  _drawProductTemplate(w, h, tType) {
    const spec = this.currentSpec || {};
    const dims = this.currentDims || {};
    const printW = dims.widthIn || spec.defaultW || 36;
    const printH = dims.heightIn || spec.defaultH || 24;

    const ppiX = w / printW;
    const ppiY = h / printH;

    // Safe margin: the SOP value (same one the Safe Area check measures with), else the catalog value
    const sopSafe = (typeof SopRules !== 'undefined' && SopRules.safeArea)
      ? SopRules.safeArea(spec, (typeof appState !== 'undefined' ? appState.parsedFilename : null)).inches : null;
    const safeMarginIn = sopSafe > 0 ? sopSafe : (parseFloat(spec.safeArea) || 1.25);
    const safePxX = Math.max(4, safeMarginIn * ppiX);
    const safePxY = Math.max(4, safeMarginIn * ppiY);

    if (tType === 'desk-flags-blade') {
      this._drawDeskBladeTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'desk-flags-teardrop') {
      this._drawDeskTeardropTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'die-cut') {
      const isArrow = (spec.slug || '').includes('arrow') || (spec.name || '').toLowerCase().includes('arrow');
      if (isArrow) {
        this._drawDieCutYardSignTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY);
      } else {
        this._drawRectangleYardSignTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY);
      }
    } else if (tType === 'yard-sign') {
      this._drawRectangleYardSignTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY);
    } else if (tType === 'flag-rectangle') {
      this._drawFlagRectangleTemplate(w, h, printW, printH, safePxX, safePxY, ppiX);
    } else if (tType === 'magnet-rounded') {
      this._drawMagneticSignTemplate(w, h, printW, printH, safePxX, safePxY, spec);
    } else if (tType === 'x-banner') {
      this._drawXBannerTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'l-banner') {
      this._drawLBannerTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'canvas-wrap') {
      this._drawCanvasWrapTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'perforated-window') {
      this._drawPerforatedWindowTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'teardrop-flag') {
      this._drawTeardropTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'feather-flag' || tType === 'blade-flag') {
      this._drawFeatherTemplate(w, h, printW, printH, safePxX, safePxY, tType);
    } else if (tType === 'roll-up') {
      this._drawRollUpTemplate(w, h, printW, printH, safePxX, safePxY, ppiY);
    } else if (tType === 'table-cover') {
      this._drawTableCoverTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'circle') {
      this._drawCircleTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'pole-banner') {
      this._drawPoleBannerTemplate(w, h, printW, printH, safePxX, safePxY, ppiY);
    } else if (tType === 'business-card') {
      this._drawBusinessCardTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'popup-counter') {
      this._drawPopupCounterTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'hand-flag') {
      this._drawHandFlagTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'aluminum-sign') {
      this._drawAluminumSignTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY);
    } else if (tType === 'acrylic-sign') {
      this._drawAcrylicSignTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY);
    } else if (tType === 'mesh-banner') {
      this._drawMeshBannerTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY, spec);
    } else if (tType === 'safety-parking-sign') {
      this._drawSafetyParkingSignTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY);
    } else if (tType === 'a-frame') {
      this._drawAFrameTemplate(w, h, printW, printH, safePxX, safePxY, ppiX, ppiY);
    } else if (tType === 'decal-sticker') {
      this._drawDecalStickerTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'apparel') {
      this._drawApparelTemplate(w, h, printW, printH, safePxX, safePxY);
    } else if (tType === 'marketing-flyer') {
      this._drawMarketingFlyerTemplate(w, h, printW, printH, safePxX, safePxY);
    } else {
      this._drawBannerTemplate(w, h, printW, printH, safePxX, safePxY, spec);
    }

  },

  /**
   * ✂️ DIE-CUT YARD SIGN TEMPLATE (Custom Contour / Arrow with Metal Wire Step Stakes)
   */
  _drawDieCutYardSignTemplate(w, h, printW, printH, safeX, safeY, ppiX, ppiY) {
    const ctx = this.ctx;
    const pad = 12;
    const arrowHeadW = Math.min(110, w * 0.25);
    const arrowShaftH = Math.min(h * 0.72, h - 36);
    const shaftTop = (h - arrowShaftH) / 2;
    const shaftBottom = shaftTop + arrowShaftH;

    // Arrow contour path helper
    const traceArrow = (c, inset) => {
      const x1 = pad + inset;
      const x2 = w - pad - arrowHeadW - inset;
      const xTip = w - pad - inset;
      const y1 = shaftTop + inset;
      const y2 = shaftBottom - inset;
      const yMid = h / 2;
      const yHeadTop = pad + inset;
      const yHeadBottom = h - pad - inset;

      c.moveTo(x1, y1);
      c.lineTo(x2, y1);
      c.lineTo(x2, yHeadTop);
      c.lineTo(xTip, yMid);
      c.lineTo(x2, yHeadBottom);
      c.lineTo(x2, y2);
      c.lineTo(x1, y2);
      c.closePath();
    };

    // 1. Waste Mask outside die-cut contour
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    traceArrow(ctx, 0);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill('evenodd');
    ctx.restore();

    // 2. Corflute Flutes (Vertical lines inside sign)
    if (this.guides.flutes) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      for (let x = pad + 14; x < w - pad; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, pad);
        ctx.lineTo(x, h - pad);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. Contour Cutline (Orange solid 3px)
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      traceArrow(ctx, 0);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ DIE-CUT CONTOUR CUTLINE: ${printW}" × ${printH}" (4mm Corflute)`, pad + 10, shaftTop + 20);
      ctx.restore();
    }

    // 4. Safe Area (0.5" inside contour)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([7, 4]);
      ctx.beginPath();
      traceArrow(ctx, Math.max(12, safeX * 0.7));
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside contour`, pad + 14, shaftTop + 36);
      ctx.restore();
    }

    // 5. Bleed Boundary
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.125" on all outer edges`, pad + 10, h - 8);
      ctx.restore();
    }

    // 6. Metal Wire Step Stakes (H-Stakes inserted into bottom flutes)
    if (this.guides.stakes) {
      ctx.save();
      const stakeX1 = w * 0.28;
      const stakeX2 = w * 0.55;
      const stakeTopY = shaftBottom - 18;
      const stakeBottomY = h - 2;

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([]);

      // Left Prong
      ctx.beginPath();
      ctx.moveTo(stakeX1, stakeTopY);
      ctx.lineTo(stakeX1, stakeBottomY);
      ctx.stroke();

      // Right Prong
      ctx.beginPath();
      ctx.moveTo(stakeX2, stakeTopY);
      ctx.lineTo(stakeX2, stakeBottomY);
      ctx.stroke();

      // Crossbar
      ctx.beginPath();
      ctx.moveTo(stakeX1 - 8, stakeBottomY - 8);
      ctx.lineTo(stakeX2 + 8, stakeBottomY - 8);
      ctx.stroke();

      // Stake Callout Tag
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(stakeX1 + 10, stakeBottomY - 24, 185, 20);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔩 9-GAUGE WIRE STEP STAKE (H-STAKE)', stakeX1 + 102, stakeBottomY - 10);
      ctx.restore();
    }
  },

  /**
   * 🪧 RECTANGLE YARD SIGN TEMPLATE (4mm Corflute with H-Stakes, NO Grommets)
   */
  _drawRectangleYardSignTemplate(w, h, printW, printH, safeX, safeY, ppiX, ppiY) {
    const ctx = this.ctx;

    // 1. Corflute Vertical Flutes
    if (this.guides.flutes) {
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
      ctx.lineWidth = 1;
      for (let x = 12; x < w - 8; x += 14) {
        ctx.beginPath();
        ctx.moveTo(x, 4);
        ctx.lineTo(x, h - 4);
        ctx.stroke();
      }
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.fillText('|| 4mm Vertical Flute Direction', Math.max(200, w - 180), 20);
      ctx.restore();
    }

    // 2. Finished Trim Line (Orange solid)
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ YARD SIGN TRIM: ${printW}" × ${printH}" (4mm Corflute)`, 14, 20);
      ctx.restore();
    }

    // 3. Safe Zone (0.5" inside trim)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, safeY, w - safeX * 2, h - safeY * 2);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside trim (No grommets on yard signs)`, Math.max(14, safeX + 6), Math.max(38, safeY + 14));
      ctx.restore();
    }

    // 4. Bleed (0.125")
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.125" on all 4 sides`, 14, h - 10);
      ctx.restore();
    }

    // 5. Metal Wire Step Stakes (H-Stakes inserted from bottom)
    if (this.guides.stakes) {
      ctx.save();
      const stakeX1 = w * 0.3;
      const stakeX2 = w * 0.7;
      const stakeTopY = h - 28;
      const stakeBottomY = h - 2;

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([]);

      // Left Prong
      ctx.beginPath();
      ctx.moveTo(stakeX1, stakeTopY);
      ctx.lineTo(stakeX1, stakeBottomY);
      ctx.stroke();

      // Right Prong
      ctx.beginPath();
      ctx.moveTo(stakeX2, stakeTopY);
      ctx.lineTo(stakeX2, stakeBottomY);
      ctx.stroke();

      // Horizontal Step Bar
      ctx.beginPath();
      ctx.moveTo(stakeX1 - 10, stakeBottomY - 8);
      ctx.lineTo(stakeX2 + 10, stakeBottomY - 8);
      ctx.stroke();

      // Badge
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(w / 2 - 95, stakeBottomY - 24, 190, 20);
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔩 METAL WIRE H-STAKE (Inserted into bottom flutes)', w / 2, stakeBottomY - 10);
      ctx.restore();
    }
  },

  /**
   * 🚩 RECTANGLE CUSTOM FLAG TEMPLATE (Left Pole Sleeve, Sleeve Clips, NO perimeter grommets)
   */
  _drawFlagRectangleTemplate(w, h, printW, printH, safeX, safeY, ppiX) {
    const ctx = this.ctx;
    const sleeveW = Math.max(26, Math.min(44, w * 0.09));

    // 1. Left Reinforced Pole Sleeve
    if (this.guides.sleeve) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(0, 0, sleeveW, h);

      // Double Stitched yellow seam
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 4, 0);
      ctx.lineTo(sleeveW - 4, h);
      ctx.stroke();

      // Sleeve text
      ctx.save();
      ctx.translate(sleeveW / 2 + 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 REINFORCED POLE SLEEVE (Left)', 0, 0);
      ctx.restore();

      ctx.restore();
    }

    // 2. Sleeve Grommets / Clips (Strictly on sleeve, NOT on perimeter)
    if (this.guides.grommets) {
      ctx.save();
      const drawSleeveEyelet = (gy) => this.drawGrommetMark(ctx, sleeveW / 2, gy, 14);

      // Top and Bottom Sleeve Eyelets
      drawSleeveEyelet(18);
      drawSleeveEyelet(h - 18);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.fillText('⭕ Sleeve Eyelet (Top)', sleeveW + 8, 22);
      ctx.fillText('⭕ Sleeve Eyelet (Bottom)', sleeveW + 8, h - 16);
      ctx.restore();
    }

    // 3. Trim / Hem Stitch Line (Orange solid & dashed hem)
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      // Folded double-hem representation
      ctx.strokeStyle = '#fdba74';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(sleeveW + 4, 6, w - sleeveW - 10, h - 12);

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ FINISHED FLAG SIZE: ${printW}" × ${printH}" (90 GSM Knitted Poly)`, sleeveW + 12, 40);
      ctx.restore();
    }

    // 4. Safe Area (1.5" inside hem and sleeve)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      const flagSafeX = sleeveW + safeX;
      ctx.strokeRect(flagSafeX, safeY, w - flagSafeX - safeX, h - safeY * 2);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE AREA: 1.50" clear of pole sleeve & hem stitches`, flagSafeX + 8, safeY + 16);
      ctx.restore();
    }

    // 5. Bleed (0.5")
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.50" all sides`, sleeveW + 12, h - 30);
      ctx.restore();
    }
  },

  /**
   * 🧲 VEHICLE MAGNETIC SIGN TEMPLATE (Rounded Anti-Peel Corners, 30-Mil Bevel, NO Grommets)
   */
  _drawMagneticSignTemplate(w, h, printW, printH, safeX, safeY, spec) {
    const ctx = this.ctx;
    const currentSpec = spec || this.currentSpec || {};
    const safeTxt = currentSpec.safeArea || '0.25"';
    const r = Math.min(26, Math.max(14, w * 0.05)); // 0.5" - 1.0" rounded corner radius

    const traceRoundedRect = (c, x, y, rw, rh, rad) => {
      c.beginPath();
      c.moveTo(x + rad, y);
      c.lineTo(x + rw - rad, y);
      c.arcTo(x + rw, y, x + rw, y + rad, rad);
      c.lineTo(x + rw, y + rh - rad);
      c.arcTo(x + rw, y + rh, x + rw - rad, y + rh, rad);
      c.lineTo(x + rad, y + rh);
      c.arcTo(x, y + rh, x, y + rh - rad, rad);
      c.lineTo(x, y + rad);
      c.arcTo(x, y, x + rad, y, rad);
      c.closePath();
    };

    // 1. Waste Mask on sharp corners outside rounded die-cut
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    traceRoundedRect(ctx, 2, 2, w - 4, h - 4, r);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill('evenodd');
    ctx.restore();

    // 2. Rounded Cutline (Orange solid 3px) - Clean top row
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      traceRoundedRect(ctx, 2, 2, w - 4, h - 4, r);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ VEHICLE MAGNET DIE-CUT: ${printW}" × ${printH}" (0.5" Rounded Corners)`, 16, 20);
      ctx.restore();
    }

    // 3. 30-Mil Magnetic Backing & Bevel Shadow with protected pill badge
    if (this.guides.hardware) {
      ctx.save();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.5;
      traceRoundedRect(ctx, 6, 6, w - 12, h - 12, r - 3);
      ctx.stroke();

      // Substrate note: listed in the legend under the canvas (never written over the artwork)
      ctx.fillStyle = '#334155';
      ctx.fillText('🧲 30-MIL HEAVY-DUTY VEHICLE MAGNETIC SUBSTRATE (Wind-Resistant)', 20, h - 16);
      ctx.restore();
    }

    // 4. Safe Area - Second row, dynamically referencing spec.safeArea (default 0.25")
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      traceRoundedRect(ctx, safeX, safeY, w - safeX * 2, h - safeY * 2, Math.max(6, r - 6));
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: ${safeTxt} inside rounded cutline`, Math.max(16, safeX + 8), Math.max(38, safeY + 14));
      ctx.restore();
    }

    // 5. Bleed (0.125")
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.restore();
    }
  },

  /**
   * ✖️ X-BANNER STAND TEMPLATE (4 Corner Eyelets ONLY, X-Tension Arms, NO Edge Grommets)
   */
  _drawXBannerTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const cornerInset = 20;

    // 1. Trim line
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ X-BANNER TRIM: ${printW}" × ${printH}"`, 14, 20);
      ctx.restore();
    }

    // 2. Safe Area (1.5" inside trim)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, safeY, w - safeX * 2, h - safeY * 2);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 1.50" inside trim (Keep clear of 4 corner hooks)`, Math.max(14, safeX + 6), Math.max(38, safeY + 14));
      ctx.restore();
    }

    // 3. X-Frame Tension Arms Guideline
    if (this.guides.hardware) {
      ctx.save();
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);

      const cx = w / 2;
      const cy = h / 2;

      // X-Cross arms
      ctx.beginPath();
      ctx.moveTo(cornerInset, cornerInset);
      ctx.lineTo(w - cornerInset, h - cornerInset);
      ctx.moveTo(w - cornerInset, cornerInset);
      ctx.lineTo(cornerInset, h - cornerInset);
      ctx.stroke();

      // Center Hub
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✖', cx, cy + 3.5);
      ctx.fillText('X-FRAME TENSION HUB', cx, cy + 26);
      ctx.restore();
    }

    // 4. Exactly 4 Corner Eyelets (Strictly corners, NO intermediate grommets)
    if (this.guides.grommets) {
      ctx.save();
      const drawEyelet = (gx, gy, label) => {
        this.drawGrommetMark(ctx, gx, gy, 16);

        ctx.fillStyle = '#b45309';
        ctx.font = 'bold 8.5px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, gx, gy > h / 2 ? gy + 16 : gy - 10);
      };

      drawEyelet(cornerInset, cornerInset, 'Eyelet 1');
      drawEyelet(w - cornerInset, cornerInset, 'Eyelet 2');
      drawEyelet(cornerInset, h - cornerInset, 'Eyelet 3');
      drawEyelet(w - cornerInset, h - cornerInset, 'Eyelet 4');

      ctx.fillStyle = '#d97706';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⭕ 4 CORNER EYELETS ONLY (X-Stand Hook Points)', w / 2, h - 14);
      ctx.restore();
    }
  },

  /**
   * 🔩 L-BANNER STAND TEMPLATE (Top & Bottom Clamp Bars, NO Grommets)
   */
  _drawLBannerTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const barH = 18;

    // 1. Trim line
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ L-BANNER TRIM: ${printW}" × ${printH}"`, 14, barH + 20);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, barH + safeY, w - safeX * 2, h - barH * 2 - safeY * 2);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: Clear of top & bottom clamp bars`, safeX + 6, barH + safeY + 16);
      ctx.restore();
    }

    // 3. Top and Bottom Anodized Aluminum Clamp Bars
    if (this.guides.hardware) {
      ctx.save();
      const drawClampBar = (y, label) => {
        const grad = ctx.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, '#94a3b8');
        grad.addColorStop(0.5, '#cbd5e1');
        grad.addColorStop(1, '#64748b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, y, w, barH);

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 9.5px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, w / 2, y + barH - 5);
      };

      drawClampBar(0, 'TOP ALUMINUM CLAMP BAR (0.75")');
      drawClampBar(h - barH, 'BOTTOM ALUMINUM CLAMP BAR (0.75")');
      ctx.restore();
    }
  },

  /**
   * 🖼️ GALLERY CANVAS WRAP TEMPLATE (Face Display, 1.5" Side Wrap Border, Corner Notches)
   */
  _drawCanvasWrapTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const wrapBorder = Math.min(42, Math.max(22, w * 0.1)); // 1.5" gallery wrap border

    // 1. Fold Cutlines & Margins
    if (this.guides.cutLine) {
      ctx.save();
      // Outer canvas trim
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      // Fold lines (where canvas wraps around wooden frame)
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(wrapBorder, wrapBorder, w - wrapBorder * 2, h - wrapBorder * 2);

      // 45-degree corner fold notches
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(wrapBorder, wrapBorder);
      ctx.moveTo(w, 0); ctx.lineTo(w - wrapBorder, wrapBorder);
      ctx.moveTo(0, h); ctx.lineTo(wrapBorder, h - wrapBorder);
      ctx.moveTo(w, h); ctx.lineTo(w - wrapBorder, h - wrapBorder);
      ctx.stroke();

      ctx.fillStyle = '#ea580c';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`✂️ 1.5" GALLERY WRAP FOLD LINES: ${printW}" × ${printH}" Front Face`, wrapBorder + 8, wrapBorder - 6);
      ctx.restore();
    }

    // 2. Safe Face Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      const faceSafe = wrapBorder + safeX;
      ctx.strokeRect(faceSafe, faceSafe, w - faceSafe * 2, h - faceSafe * 2);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🛡️ VISIBLE FRONT FACE (All critical content must stay inside)`, w / 2, faceSafe + 18);
      ctx.restore();
    }

    // 3. Bleed & Stretcher Margins
    if (this.guides.bleed) {
      ctx.save();
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.fillText('WOODEN STRETCHER BAR WRAP EDGE', 10, h / 2);
      ctx.fillText('WOODEN STRETCHER BAR WRAP EDGE', w - 180, h / 2);
      ctx.restore();
    }
  },

  /**
   * 🪟 PERFORATED WINDOW FILM TEMPLATE (60/40 Micro-Perforation Mesh Pattern)
   */
  _drawPerforatedWindowTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;

    // 1. 60/40 Micro-perforation mesh pattern
    if (this.guides.hardware) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      for (let x = 8; x < w - 6; x += 10) {
        for (let y = 8; y < h - 6; y += 10) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 2. Trim Line
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ WINDOW GRAPHICS TRIM: ${printW}" × ${printH}" (60/40 Perforated Vinyl)`, 14, 20);
      ctx.restore();
    }

    // 3. Safe Zone
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, safeY, w - safeX * 2, h - safeY * 2);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside trim (No grommets on window film)`, Math.max(14, safeX + 6), Math.max(38, safeY + 14));
      ctx.restore();
    }
  },

  /**
   * Helper to detect flag sleeve side (left vs right)
   */
  _detectFlagSleeveSide(img, dims, spec) {
    const fname = ((typeof appState !== 'undefined' && appState.parsedFilename?.fname) || '').toLowerCase();
    if (fname.includes('sleeve_right') || fname.includes('sleeve-right') || fname.includes('right_sleeve')) return 'right';
    if (fname.includes('sleeve_left') || fname.includes('sleeve-left') || fname.includes('left_sleeve')) return 'left';

    // If single-sided desk blade flag (like US2395878): sleeve is on the right
    const isSingleSided = fname.includes('single_sided') || fname.includes('single-sided') || fname.includes('sf');
    const isDeskFlag = fname.includes('desk') || (dims?.widthIn <= 10 && dims?.heightIn <= 25);
    if (isSingleSided && isDeskFlag) return 'right';

    // Image inspection fallback if in browser DOM
    if (img && img.naturalWidth && img.naturalHeight && typeof document !== 'undefined') {
      try {
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const cx = c.getContext('2d');
        if (cx) {
          cx.drawImage(img, 0, 0, 32, 32);
          const leftPix = cx.getImageData(1, 16, 2, 2).data;
          const rightPix = cx.getImageData(29, 16, 2, 2).data;
          const leftLuma = (leftPix[0] + leftPix[1] + leftPix[2]) / 3;
          const rightLuma = (rightPix[0] + rightPix[1] + rightPix[2]) / 3;
          if (rightLuma < 40 && leftLuma > 65) return 'right';
          if (leftLuma < 40 && rightLuma > 65) return 'left';
        }
      } catch (e) {}
    }
    return isDeskFlag ? 'right' : 'left';
  },

  /**
   * 🚩 DESK FLAGS BLADE TEMPLATE (Tabletop Mini Blade Flag ~5.51" x 17.71")
   * Sourced directly from official BannerBuzz Desktop Blade Flag SF.psdt
   * Flat horizontal bottom base, straight vertical fly edge, smooth top curve spanning only top ~16%,
   * and clean semi-transparent pole sleeve guide with stitch line.
   */
  _drawDeskBladeTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const sleeveW = Math.max(16, Math.min(26, Math.round(w * 0.08)));
    const dims = this.currentDims || {};
    const spec = this.currentSpec || {};
    const sleeveSide = this._detectFlagSleeveSide(this.currentImg, dims, spec);

    // 1. High-contrast waste mask outside desk blade flag contour
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    this._traceDeskBladePath(ctx, 0, 0, w, h, sleeveSide);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fill('evenodd');
    ctx.restore();

    // 2. Cutline Contour (Orange solid 3px) - Matches Desktop Blade Flag SF.psdt
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      this._traceDeskBladePath(ctx, 0, 0, w, h, sleeveSide);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      const labelX = sleeveSide === 'right' ? 14 : sleeveW + 14;
      ctx.fillText(`✂️ DESK BLADE CUTLINE: ${printW}" × ${printH}"`, labelX, 24);
      ctx.restore();
    }

    // 3. Safe Area (Dashed green line inside contour, 0.50" margin)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceDeskBladeSafePath(ctx, 0, 0, w, h, safeX, safeY, sleeveSide, sleeveW);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      const labelX = sleeveSide === 'right' ? 14 : sleeveW + 14;
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside cutline`, labelX, 42);
      ctx.restore();
    }

    // 4. Bleed (0.25" boundary)
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      const labelX = sleeveSide === 'right' ? 14 : sleeveW + 14;
      ctx.fillText(`📐 Bleed: 0.25" on all sides`, labelX, h - 10);
      ctx.restore();
    }

    // 5. Pole Sleeve Channel (Clean semi-transparent guide with stitch line, NOT opaque black)
    if (this.guides.sleeve) {
      ctx.save();
      const slX = sleeveSide === 'right' ? w - sleeveW : 0;
      const stitchX = sleeveSide === 'right' ? w - sleeveW + 2 : sleeveW - 2;

      // Soft semi-transparent sleeve overlay so artwork remains 100% visible
      ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      ctx.fillRect(slX, 0, sleeveW, h);

      // Gold dashed stitch line
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(stitchX, 0);
      ctx.lineTo(stitchX, h);
      ctx.stroke();

      // Vertical text
      ctx.save();
      ctx.translate(slX + sleeveW / 2, h / 2);
      ctx.rotate(sleeveSide === 'right' ? Math.PI / 2 : -Math.PI / 2);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 DESK POLE SLEEVE', 0, 3.5);
      ctx.restore();

      ctx.restore();
    }
  },

  _traceDeskBladePath(ctx, x1, y1, x2, y2, sleeveSide = 'right') {
    const w = x2 - x1;
    const h = y2 - y1;

    if (sleeveSide === 'right') {
      // Sleeve on right: curve at top-left, flat bottom, straight right pole edge
      // Verified mathematical curve matching BannerBuzz Desktop Blade Flag SF.psdt
      ctx.moveTo(x1, y1 + h);
      ctx.lineTo(x1, y1 + h * 0.298);
      ctx.bezierCurveTo(x1, y1 + h * 0.125, x1 + w * 0.515, y1, x1 + w * 0.780, y1);
      ctx.lineTo(x2, y1);
      ctx.lineTo(x2, y1 + h);
      ctx.lineTo(x1, y1 + h);
    } else {
      // Sleeve on left: curve at top-right, flat bottom, straight left pole edge
      ctx.moveTo(x1, y1 + h);
      ctx.lineTo(x1, y1);
      ctx.lineTo(x1 + w * 0.220, y1);
      ctx.bezierCurveTo(x1 + w * 0.485, y1, x2, y1 + h * 0.125, x2, y1 + h * 0.298);
      ctx.lineTo(x2, y1 + h);
      ctx.lineTo(x1, y1 + h);
    }
    ctx.closePath();
  },

  _traceDeskBladeSafePath(ctx, x1, y1, x2, y2, safeX, safeY, sleeveSide = 'right', sleeveW = 20) {
    const sx = Math.min(safeX, (x2 - x1) * 0.14);
    const sy = Math.min(safeY, (y2 - y1) * 0.08);

    // Extra margin on sleeve side so critical content does not get sewn into sleeve
    const leftMargin = sleeveSide === 'right' ? sx : Math.max(sx, sleeveW + 4);
    const rightMargin = sleeveSide === 'right' ? Math.max(sx, sleeveW + 4) : sx;

    const nx1 = x1 + leftMargin;
    const ny1 = y1 + sy;
    const nx2 = x2 - rightMargin;
    const ny2 = y2 - sy;
    const nw = nx2 - nx1;
    const nh = ny2 - ny1;

    if (sleeveSide === 'right') {
      ctx.moveTo(nx1, ny1 + nh);
      ctx.lineTo(nx1, ny1 + nh * 0.298);
      ctx.bezierCurveTo(nx1, ny1 + nh * 0.125, nx1 + nw * 0.515, ny1, nx1 + nw * 0.780, ny1);
      ctx.lineTo(nx2, ny1);
      ctx.lineTo(nx2, ny1 + nh);
      ctx.lineTo(nx1, ny1 + nh);
    } else {
      ctx.moveTo(nx1, ny1 + nh);
      ctx.lineTo(nx1, ny1);
      ctx.lineTo(nx1 + nw * 0.220, ny1);
      ctx.bezierCurveTo(nx1 + nw * 0.485, ny1, nx2, ny1 + nh * 0.125, nx2, ny1 + nh * 0.298);
      ctx.lineTo(nx2, ny1 + nh);
      ctx.lineTo(nx1, ny1 + nh);
    }
    ctx.closePath();
  },

  /**
   * 🚩 DESK FLAGS TEARDROP TEMPLATE (~5.51" x 17.71")
   * Matches official BannerBuzz Desktop Teardrop Flag SF.psdt
   */
  _drawDeskTeardropTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const sleeveW = Math.max(16, Math.min(26, Math.round(w * 0.08)));

    // Edge-to-edge contour: 0 to w and 0 to h (NO arbitrary paddings!)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    this._traceTeardropPath(ctx, 0, 0, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fill('evenodd');
    ctx.restore();

    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      this._traceTeardropPath(ctx, 0, 0, w, h);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ DESK TEARDROP CUTLINE: ${printW}" × ${printH}"`, sleeveW + 10, 24);
      ctx.restore();
    }

    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceTeardropSafePath(ctx, 0, 0, w, h, safeX, safeY);
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside curve`, sleeveW + 12, 42);
      ctx.restore();
    }

    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.25" on all sides`, sleeveW + 10, h - 10);
      ctx.restore();
    }

    if (this.guides.sleeve) {
      ctx.save();
      // Semi-transparent sleeve guide so artwork remains 100% visible
      ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      ctx.fillRect(0, 0, sleeveW, h);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 2, 0);
      ctx.lineTo(sleeveW - 2, h);
      ctx.stroke();

      ctx.save();
      ctx.translate(sleeveW / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 DESK POLE SLEEVE', 0, 3.5);
      ctx.restore();
      ctx.restore();
    }
  },

  /**
   * 🚩 TEARDROP FLAG TEMPLATE
   * Aerodynamic dome top, curved body tapering inward to bottom pole point, with left pole sleeve
   */
  _drawTeardropTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const sleeveW = Math.max(22, Math.min(36, w * 0.08));

    // Outer waste mask outside teardrop (edge-to-edge 0, 0, w, h)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    this._traceTeardropPath(ctx, 0, 0, w, h);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill('evenodd');
    ctx.restore();

    // 1. Cutline Contour (Orange solid)
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      this._traceTeardropPath(ctx, 0, 0, w, h);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ TEARDROP CUTLINE: ${printW}" × ${printH}"`, sleeveW + 12, 24);
      ctx.restore();
    }

    // 2. Safe Area (Dashed green curve inside)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceTeardropSafePath(ctx, 0, 0, w, h, safeX, safeY);
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 1.00" inside curve`, sleeveW + 14, 42);
      ctx.restore();
    }

    // 3. Bleed Boundary
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.50" on all sides`, sleeveW + 10, h - 10);
      ctx.restore();
    }

    // 4. Pole Sleeve Channel on Left Side (Semi-transparent with stitch line)
    if (this.guides.sleeve) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      ctx.fillRect(0, 0, sleeveW, h);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 2, 0);
      ctx.lineTo(sleeveW - 2, h);
      ctx.stroke();

      ctx.save();
      ctx.translate(sleeveW / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 REINFORCED POLE SLEEVE', 0, 3.5);
      ctx.restore();

      ctx.restore();
    }
  },

  _traceTeardropPath(ctx, x1, y1, x2, y2) {
    const w = x2 - x1;
    const h = y2 - y1;
    const cx = x1 + w * 0.5;

    // Start at bottom pole corner
    ctx.moveTo(x1, y1 + h);
    // Spine up left side
    ctx.lineTo(x1, y1 + h * 0.28);
    // Dome top arch
    ctx.bezierCurveTo(x1, y1, cx - w * 0.1, y1, cx + w * 0.1, y1);
    ctx.bezierCurveTo(x2, y1, x2, y1 + h * 0.18, x2, y1 + h * 0.32);
    // Swoop down right edge tapering toward pole base
    ctx.bezierCurveTo(x2, y1 + h * 0.65, x1 + w * 0.6, y1 + h * 0.85, x1 + w * 0.2, y1 + h);
    ctx.closePath();
  },

  _traceTeardropSafePath(ctx, x1, y1, x2, y2, safeX, safeY) {
    const origW = x2 - x1;
    const origH = y2 - y1;
    const sx = Math.min(safeX, origW * 0.18);
    const sy = Math.min(safeY, origH * 0.12);

    const nx1 = x1 + sx;
    const ny1 = y1 + sy;
    const nx2 = x2 - sx;
    const ny2 = y2 - sy;
    const nw = nx2 - nx1;
    const nh = ny2 - ny1;
    const ncx = nx1 + nw * 0.5;

    ctx.moveTo(nx1, ny1 + nh);
    ctx.lineTo(nx1, ny1 + nh * 0.28);
    ctx.bezierCurveTo(nx1, ny1, ncx - nw * 0.1, ny1, ncx + nw * 0.1, ny1);
    ctx.bezierCurveTo(nx2, ny1, nx2, ny1 + nh * 0.18, nx2, ny1 + nh * 0.32);
    ctx.bezierCurveTo(nx2, ny1 + nh * 0.65, nx1 + nw * 0.6, ny1 + nh * 0.85, nx1 + nw * 0.2, ny1 + nh);
    ctx.closePath();
  },

  /**
   * 🚩 FEATHER & BLADE FLAG TEMPLATE
   */
  _drawFeatherTemplate(w, h, printW, printH, safeX, safeY, tType) {
    const ctx = this.ctx;
    const sleeveW = Math.max(22, Math.min(36, w * 0.08));

    // Outer waste mask (edge-to-edge 0, 0, w, h)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    this._traceFeatherPath(ctx, 0, 0, w, h, tType);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill('evenodd');
    ctx.restore();

    // 1. Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.beginPath();
      this._traceFeatherPath(ctx, 0, 0, w, h, tType);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ ${tType.toUpperCase()} CUTLINE: ${printW}" × ${printH}"`, sleeveW + 12, 24);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceFeatherSafePath(ctx, 0, 0, w, h, safeX, safeY, tType);
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 1.00" inside cutline`, sleeveW + 14, 42);
      ctx.restore();
    }

    // 3. Bleed
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.50" required`, sleeveW + 10, h - 10);
      ctx.restore();
    }

    // 4. Pole Sleeve (Semi-transparent with stitch line)
    if (this.guides.sleeve) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      ctx.fillRect(0, 0, sleeveW, h);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 2, 0);
      ctx.lineTo(sleeveW - 2, h);
      ctx.stroke();

      ctx.save();
      ctx.translate(sleeveW / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 POLE SLEEVE', 0, 3.5);
      ctx.restore();
      ctx.restore();
    }
  },

  _traceFeatherPath(ctx, x1, y1, x2, y2, tType) {
    const w = x2 - x1;
    const h = y2 - y1;

    ctx.moveTo(x1, y1 + h);
    ctx.lineTo(x1, y1 + h * 0.15);
    // Rounded arch top
    ctx.quadraticCurveTo(x1 + w * 0.3, y1, x2, y1 + h * 0.12);
    // Straight vertical side
    ctx.lineTo(x2, y1 + (tType === 'blade-flag' ? h : h * 0.82));
    // Bottom cutline
    if (tType === 'blade-flag') {
      ctx.lineTo(x1, y1 + h);
    } else {
      ctx.quadraticCurveTo(x1 + w * 0.5, y1 + h * 0.72, x1, y1 + h);
    }
    ctx.closePath();
  },

  _traceFeatherSafePath(ctx, x1, y1, x2, y2, safeX, safeY, tType) {
    const sx = Math.max(12, (safeX || 16) * 0.7);
    const sy = Math.max(12, (safeY || 16) * 0.7);
    const innerX1 = x1 + sx;
    const innerY1 = y1 + sy;
    const innerX2 = Math.max(innerX1 + 20, x2 - sx);
    const innerY2 = Math.max(innerY1 + 40, y2 - sy);
    const w = innerX2 - innerX1;
    const h = innerY2 - innerY1;

    ctx.moveTo(innerX1, innerY1 + h);
    ctx.lineTo(innerX1, innerY1 + h * 0.15);
    ctx.quadraticCurveTo(innerX1 + w * 0.3, innerY1, innerX2, innerY1 + h * 0.12);
    ctx.lineTo(innerX2, innerY1 + (tType === 'blade-flag' ? h : h * 0.82));
    if (tType === 'blade-flag') {
      ctx.lineTo(innerX1, innerY1 + h);
    } else {
      ctx.quadraticCurveTo(innerX1 + w * 0.5, innerY1 + h * 0.72, innerX1, innerY1 + h);
    }
    ctx.closePath();
  },

  /**
   * 🖼️ ROLL-UP / RETRACTABLE STAND TEMPLATE
   */
  _drawRollUpTemplate(w, h, printW, printH, safeX, safeY, ppiY) {
    const ctx = this.ctx;
    const cassetteH = Math.max(38, Math.min(80, 6 * ppiY));
    const clampBarH = Math.max(16, 0.5 * ppiY);

    // 1. Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ ROLL-UP STAND: ${printW}" × ${printH}"`, 10, clampBarH + 20);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, clampBarH + safeY, w - safeX * 2, h - cassetteH - clampBarH - safeY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: Keep logos >6" above base`, safeX + 8, clampBarH + safeY + 16);
      ctx.restore();
    }

    // 3. Bleed
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.restore();
    }

    // 4. Hardware details (Top Clamp Bar & Bottom Cassette)
    if (this.guides.hardware) {
      ctx.save();
      // Top Clamp Bar
      const topGrad = ctx.createLinearGradient(0, 0, 0, clampBarH);
      topGrad.addColorStop(0, '#94a3b8');
      topGrad.addColorStop(0.5, '#cbd5e1');
      topGrad.addColorStop(1, '#64748b');
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, w, clampBarH);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TOP ALUMINUM CLAMP BAR (0.5")', w / 2, clampBarH - 4);

      // Bottom Cassette Lead-in Zone (>6" base margin)
      ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
      ctx.fillRect(0, h - cassetteH, w, cassetteH);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 3]);
      ctx.strokeRect(0, h - cassetteH, w, cassetteH);

      ctx.fillStyle = '#b91c1c';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText('⚠️ CASSETTE LEAD-IN (>6" base clearance - rolls into aluminum stand)', w / 2, h - cassetteH / 2 + 4);
      ctx.restore();
    }
  },

  /**
   * 🪑 TABLE COVER DIE-LINE & SILHOUETTE ENGINE
   * Exact CAD contours extracted from BannerBuzz QNAP Template_Mockups (6ft / 4ft / 8ft)
   */
  _trace3SidedTableCover(ctx, w, h) {
    ctx.moveTo(0.73497 * w, 0.00634 * h);
    ctx.lineTo(0.72925 * w, 0.00634 * h);
    ctx.bezierCurveTo(0.69386 * w, 0.18136 * h, 0.6453 * w, 0.27872 * h, 0.49988 * w, 0.27872 * h);
    ctx.bezierCurveTo(0.36281 * w, 0.27872 * h, 0.30334 * w, 0.18342 * h, 0.26945 * w, 0.00634 * h);
    ctx.lineTo(0.26373 * w, 0.00634 * h);
    ctx.lineTo(0.25374 * w, 0.31916 * h);
    ctx.lineTo(0.02952 * w, 0.36053 * h);
    ctx.lineTo(0.02952 * w, 0.60295 * h);
    ctx.lineTo(0.25374 * w, 0.64433 * h);
    ctx.lineTo(0.26373 * w, 0.95752 * h);
    ctx.lineTo(0.73497 * w, 0.95752 * h);
    ctx.lineTo(0.74496 * w, 0.64433 * h);
    ctx.lineTo(0.97047 * w, 0.60295 * h);
    ctx.lineTo(0.97047 * w, 0.36053 * h);
    ctx.lineTo(0.74495 * w, 0.31916 * h);
    ctx.closePath();
  },

  _trace4SidedTableCover(ctx, w, h) {
    ctx.moveTo(0.73497 * w, 0.04099 * h);
    ctx.lineTo(0.26373 * w, 0.04099 * h);
    ctx.lineTo(0.25374 * w, 0.3429 * h);
    ctx.lineTo(0.02952 * w, 0.38283 * h);
    ctx.lineTo(0.02952 * w, 0.6168 * h);
    ctx.lineTo(0.25374 * w, 0.65673 * h);
    ctx.lineTo(0.26373 * w, 0.959 * h);
    ctx.lineTo(0.73497 * w, 0.959 * h);
    ctx.lineTo(0.74496 * w, 0.65673 * h);
    ctx.lineTo(0.97047 * w, 0.6168 * h);
    ctx.lineTo(0.97047 * w, 0.38283 * h);
    ctx.lineTo(0.74495 * w, 0.3429 * h);
    ctx.closePath();
  },

  _traceFittedTableCover(ctx, w, h, is3Sided) {
    if (is3Sided) {
      // 3-Sided Fitted with open back cutout
      ctx.moveTo(0.745 * w, 0.02 * h);
      ctx.lineTo(0.68 * w, 0.02 * h);
      ctx.lineTo(0.68 * w, 0.30 * h);
      ctx.lineTo(0.32 * w, 0.30 * h);
      ctx.lineTo(0.32 * w, 0.02 * h);
      ctx.lineTo(0.255 * w, 0.02 * h);
      ctx.lineTo(0.255 * w, 0.34 * h);
      ctx.lineTo(0.03 * w, 0.34 * h);
      ctx.lineTo(0.03 * w, 0.68 * h);
      ctx.lineTo(0.255 * w, 0.68 * h);
      ctx.lineTo(0.255 * w, 0.98 * h);
      ctx.lineTo(0.745 * w, 0.98 * h);
      ctx.lineTo(0.745 * w, 0.68 * h);
      ctx.lineTo(0.97 * w, 0.68 * h);
      ctx.lineTo(0.97 * w, 0.34 * h);
      ctx.lineTo(0.745 * w, 0.34 * h);
      ctx.closePath();
    } else {
      // 4-Sided Fitted full cross
      ctx.moveTo(0.745 * w, 0.02 * h);
      ctx.lineTo(0.255 * w, 0.02 * h);
      ctx.lineTo(0.255 * w, 0.34 * h);
      ctx.lineTo(0.03 * w, 0.34 * h);
      ctx.lineTo(0.03 * w, 0.68 * h);
      ctx.lineTo(0.255 * w, 0.68 * h);
      ctx.lineTo(0.255 * w, 0.98 * h);
      ctx.lineTo(0.745 * w, 0.98 * h);
      ctx.lineTo(0.745 * w, 0.68 * h);
      ctx.lineTo(0.97 * w, 0.68 * h);
      ctx.lineTo(0.97 * w, 0.34 * h);
      ctx.lineTo(0.745 * w, 0.34 * h);
      ctx.closePath();
    }
  },

  _drawTableCoverTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const spec = this.currentSpec || {};
    const official = this.officialTemplate || {};
    const fname = (typeof appState !== 'undefined' && appState.parsedFilename && appState.parsedFilename.fname) || '';
    const combined = (String(spec.slug || '') + ' ' + (spec.name || '') + ' ' + (official.slug || '') + ' ' + (official.name || '') + ' ' + fname).toLowerCase();

    const isFitted = combined.includes('fitted');
    const isZipper = combined.includes('zipper');
    const is4Sided = isZipper || combined.includes('4-side') || combined.includes('closed-back') || combined.includes('4sided');
    const is3Sided = !is4Sided || combined.includes('3-side') || combined.includes('open-back') || combined.includes('3side');

    const traceFn = (c) => {
      if (isFitted) {
        this._traceFittedTableCover(c, w, h, is3Sided);
      } else if (is4Sided) {
        this._trace4SidedTableCover(c, w, h);
      } else {
        this._trace3SidedTableCover(c, w, h);
      }
    };

    // 1. Authentic Gray Shape Waste Mask outside die-cut contour
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    traceFn(ctx);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill('evenodd');
    ctx.restore();

    // 2. Cutline (Orange solid 2.5px along contour)
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      traceFn(ctx);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      const label = isFitted
        ? `✂️ FITTED TABLE COVER DIE-LINE (${is3Sided ? '3-SIDED OPEN BACK' : '4-SIDED CLOSED BACK'})`
        : (isZipper
          ? `✂️ STRETCH TABLE COVER DIE-LINE: 4-SIDED WITH ZIPPER BACK`
          : (is4Sided
            ? `✂️ STRETCH TABLE COVER DIE-LINE: 4-SIDED CLOSED BACK`
            : `✂️ STRETCH TABLE COVER DIE-LINE: 3-SIDED OPEN BACK (TOP ARCH CUTOUT)`));
      ctx.fillText(label, 12, 22);
      ctx.restore();
    }

    // 3. Panel Seams & Fold Lines (Purple dashed)
    if (this.guides.seams) {
      ctx.save();
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);

      const topX = 0.254 * w;
      const topY = (is4Sided ? 0.343 : 0.319) * h;
      const topW = (0.745 - 0.254) * w;
      const topH = ((is4Sided ? 0.657 : 0.644) - topY) * h;

      ctx.strokeRect(topX, topY, topW, topH);
      ctx.fillStyle = 'rgba(139, 92, 246, 0.06)';
      ctx.fillRect(topX, topY, topW, topH);

      ctx.fillStyle = '#6d28d9';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TABLE TOP SURFACE (6 FT × 2.5 FT)', topX + topW / 2, topY + topH / 2);
      ctx.fillText('FRONT DRAPE (Visible Display)', topX + topW / 2, topY + topH + 35);
      if (isZipper) {
        ctx.fillText('BACK DRAPE (Zipper Closure)', topX + topW / 2, topY - 20);
      } else if (is4Sided) {
        ctx.fillText('BACK DRAPE', topX + topW / 2, topY - 20);
      } else {
        ctx.fillText('OPEN BACK (Arched Cutout)', topX + topW / 2, topY - 20);
      }
      ctx.fillText('LEFT DRAPE', topX / 2, topY + topH / 2);
      ctx.fillText('RIGHT DRAPE', topX + topW + (w - (topX + topW)) / 2, topY + topH / 2);

      // Zipper line indicator if zipper back
      if (isZipper) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(w / 2, 0.041 * h);
        ctx.lineTo(w / 2, topY);
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.fillText('16" ZIPPER SLIT', w / 2, (0.041 * h + topY) / 2);
      }
      ctx.restore();
    }

    // 4. Safe Area (Green dashed & safe zone box on front display)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);

      const safeBoxW = 0.28 * w;
      const safeBoxH = 0.22 * h;
      const safeBoxX = (w - safeBoxW) / 2;
      const safeBoxY = (is4Sided ? 0.68 : 0.67) * h;

      ctx.strokeRect(safeBoxX, safeBoxY, safeBoxW, safeBoxH);
      ctx.fillStyle = 'rgba(22, 163, 74, 0.08)';
      ctx.fillRect(safeBoxX, safeBoxY, safeBoxW, safeBoxH);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ FRONT SAFE ZONE (Main Graphics / Logo)', w / 2, safeBoxY + 16);
      ctx.restore();
    }

    // 5. Bleed Area (3" Bleed strips)
    if (this.guides.bleed) {
      ctx.save();
      ctx.fillStyle = 'rgba(249, 115, 22, 0.35)';
      const btmY = (is4Sided ? 0.959 : 0.9575) * h;
      ctx.fillRect(0.264 * w, btmY, (0.735 - 0.264) * w, h - btmY);
      ctx.fillRect(0, 0.36 * h, 0.03 * w, 0.24 * h);
      ctx.fillRect(0.97 * w, 0.36 * h, 0.03 * w, 0.24 * h);
      ctx.fillStyle = '#ea580c';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('3" BLEED', w / 2, h - 3);
      ctx.restore();
    }
  },

  /**
   * ⭕ CIRCLE / ROUND CUT TEMPLATE
   */
  _drawCircleTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 4;

    // Mask outside circle
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.fill();
    ctx.restore();

    // 1. Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ CIRCLE CUTLINE: ${printW}" DIAMETER`, 12, 20);
      ctx.restore();
    }

    // 2. Safe Circle
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(cx, cy, radius - safeX, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🛡️ CIRCLE SAFE ZONE (${safeX.toFixed(0)}px inside)`, cx, cy - radius + safeX + 16);
      ctx.restore();
    }
  },

  /**
   * 🎗️ POLE BANNER TEMPLATE (Top & Bottom Pockets)
   */
  _drawPoleBannerTemplate(w, h, printW, printH, safeX, safeY, ppiY) {
    const ctx = this.ctx;
    const pocketH = Math.max(28, 3.0 * ppiY);

    // 1. Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ POLE BANNER: ${printW}" × ${printH}"`, 10, pocketH + 18);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, pocketH + safeY, w - safeX * 2, h - pocketH * 2 - safeY * 2);
      ctx.restore();
    }

    // 3. Top and Bottom Pole Pockets
    if (this.guides.polePockets) {
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.fillRect(0, 0, w, pocketH);
      ctx.fillRect(0, h - pocketH, w, pocketH);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, pocketH);
      ctx.lineTo(w, pocketH);
      ctx.moveTo(0, h - pocketH);
      ctx.lineTo(w, h - pocketH);
      ctx.stroke();

      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🎗️ TOP 3" POLE POCKET STITCH LINE', w / 2, pocketH - 8);
      ctx.fillText('🎗️ BOTTOM 3" POLE POCKET STITCH LINE', w / 2, h - 8);
      ctx.restore();
    }
  },

  /**
   * 🎌 VINYL & FABRIC BANNER TEMPLATE (Standard)
   */
  _drawBannerTemplate(w, h, printW, printH, safeX, safeY, spec) {
    const ctx = this.ctx;
    const dims = this.currentDims || {};

    // 1. Cutline / Trim Line
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.strokeRect(1, 1, w - 2, h - 2);

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ TRIM LINE: ${printW}" × ${printH}"`, 10, 16);
      ctx.restore();
    }

    // 1.5 1.25" Hem Fold Lines
    if (this.guides.seams !== false) {
      const hemMarginIn = 1.25;
      const hemPxX = (hemMarginIn / printW) * w;
      const hemPxY = (hemMarginIn / printH) * h;
      if (hemPxX * 2 < w && hemPxY * 2 < h) {
        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(hemPxX, hemPxY, w - hemPxX * 2, h - hemPxY * 2);

        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 9.5px Inter, sans-serif';
        ctx.fillText('🧵 1.25" Hem Fold Line', hemPxX + 4, hemPxY - 3);
        ctx.restore();
      }
    }

    // 1.8 3" Top Pole Pocket (if requested by order/file finishing)
    const hasTopPocket = dims.hasPolePockets || dims.pocketType?.includes('Top Pole Pocket') || dims.pocketType?.includes('Pocket');
    if (hasTopPocket && this.guides.polePockets !== false) {
      const pocketH = Math.min(h * 0.35, Math.max(18, (3.0 / printH) * h));
      ctx.save();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
      ctx.fillRect(0, 0, w, pocketH);
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, pocketH);
      ctx.lineTo(w, pocketH);
      ctx.moveTo(0, pocketH - 3);
      ctx.lineTo(w, pocketH - 3);
      ctx.stroke();

      ctx.fillStyle = '#b45309';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🎗️ 3" TOP POLE POCKET (DOUBLE STITCHED)', 12, pocketH - 8);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea && safeX * 2 < w && safeY * 2 < h) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, safeY, w - safeX * 2, h - safeY * 2);

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: ${spec?.safeArea || '1.25"'} inside trim`, Math.max(10, safeX + 6), Math.max(36, safeY + 14));
      ctx.restore();
    }

    // 3. Bleed Line
    if (this.guides.bleed) {
      ctx.save();
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: ${spec?.bleed || '0.125"'} required on all 4 sides`, 10, h - 10);
      ctx.restore();
    }

    // 4. Grommets (Only when finishing requires grommets, never if grommets === 'None' or pole pocket without grommets)
    const isNoGrommets = dims.grommetType === 'None' || dims.hasGrommets === false || (hasTopPocket && !dims.hasGrommets);
    const hasGrommetFinishing = this.guides.grommets && !isNoGrommets &&
      spec?.hasGrommets !== false &&
      !spec?.slug?.includes('card') && !spec?.name?.toLowerCase().includes('card') &&
      !spec?.slug?.includes('poster') && !spec?.name?.toLowerCase().includes('poster') &&
      !spec?.slug?.includes('magnet') && !spec?.name?.toLowerCase().includes('magnet');

    if (hasGrommetFinishing) {
      ctx.save();
      const grommetSpacingIn = 24;
      const grommetInsetPx = Math.min(safeX * 0.7, 18);
      const grommetRadius = 6;

      const drawGrommet = (gx, gy) => this.drawGrommetMark(ctx, gx, gy, grommetRadius * 2);

      if (dims.grommetType === 'Left Side Grommets (Flags)') {
        // Left side grommets
        drawGrommet(grommetInsetPx, grommetInsetPx);
        drawGrommet(grommetInsetPx, h - grommetInsetPx);
        const numGrommetsY = Math.floor(printH / grommetSpacingIn);
        if (numGrommetsY > 1) {
          const stepY = (h - grommetInsetPx * 2) / numGrommetsY;
          for (let i = 1; i < numGrommetsY; i++) {
            drawGrommet(grommetInsetPx, grommetInsetPx + i * stepY);
          }
        }
      } else {
        // Standard Perimeter Grommets (4 Corners + 24" spacing along all edges)
        drawGrommet(grommetInsetPx, grommetInsetPx);
        drawGrommet(w - grommetInsetPx, grommetInsetPx);
        drawGrommet(grommetInsetPx, h - grommetInsetPx);
        drawGrommet(w - grommetInsetPx, h - grommetInsetPx);

        // Intermediate along width
        const numGrommetsX = Math.floor(printW / grommetSpacingIn);
        if (numGrommetsX > 1) {
          const stepX = (w - grommetInsetPx * 2) / numGrommetsX;
          for (let i = 1; i < numGrommetsX; i++) {
            drawGrommet(grommetInsetPx + i * stepX, grommetInsetPx);
            drawGrommet(grommetInsetPx + i * stepX, h - grommetInsetPx);
          }
        }

        // Intermediate along height
        const numGrommetsY = Math.floor(printH / grommetSpacingIn);
        if (numGrommetsY > 1) {
          const stepY = (h - grommetInsetPx * 2) / numGrommetsY;
          for (let j = 1; j < numGrommetsY; j++) {
            drawGrommet(grommetInsetPx, grommetInsetPx + j * stepY);
            drawGrommet(w - grommetInsetPx, grommetInsetPx + j * stepY);
          }
        }
      }
      ctx.restore();
    }
  },

  /**
   * 🛡️ ALUMINUM SIGNS TEMPLATE (Pre-drilled 3/8" holes, 0.5" radius rounded corners, 0.5" safe area)
   */
  _drawAluminumSignTemplate(w, h, printW, printH, safeX, safeY, ppiX, ppiY) {
    const ctx = this.ctx;
    const holeInsetIn = 0.75;
    const holeRadiusPx = Math.max(5, (0.1875 * Math.min(ppiX, ppiY)));
    const holeInsetPxX = Math.max(16, holeInsetIn * ppiX);
    const holeInsetPxY = Math.max(16, holeInsetIn * ppiY);
    const cornerRadiusPx = Math.max(8, 0.5 * Math.min(ppiX, ppiY));

    // 1. Finished Cutline with Rounded Corners
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(1, 1, w - 2, h - 2, cornerRadiusPx);
        ctx.stroke();
      } else {
        ctx.strokeRect(1, 1, w - 2, h - 2);
      }
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ ALUMINUM TRIM: ${printW}" × ${printH}" (0.5" Radius Rounded Corners)`, 12, 18);
      ctx.restore();
    }

    // 2. Safe Area (0.5" inside trim)
    if (this.guides.safeArea && safeX * 2 < w && safeY * 2 < h) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const sX = Math.max(12, safeX);
      const sY = Math.max(12, safeY);
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(sX, sY, w - sX * 2, h - sY * 2, Math.max(4, cornerRadiusPx - 4));
        ctx.stroke();
      } else {
        ctx.strokeRect(sX, sY, w - sX * 2, h - sY * 2);
      }
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 0.50" inside aluminum edges', sX + 6, sY + 14);
      ctx.restore();
    }

    // 3. Bleed Line
    if (this.guides.bleed) {
      ctx.save();
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('📐 Bleed: 0.125" required on all 4 sides', 12, h - 8);
      ctx.restore();
    }

    // 4. Pre-Drilled Mounting Holes (4 Corners, 3/8" dia @ 0.75" inset)
    if (this.guides.hardware !== false) {
      ctx.save();
      const drawMountHole = (hx, hy) => {
        ctx.beginPath();
        ctx.arc(hx, hy, holeRadiusPx, 0, Math.PI * 2);
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Crosshairs
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx - holeRadiusPx - 4, hy);
        ctx.lineTo(hx + holeRadiusPx + 4, hy);
        ctx.moveTo(hx, hy - holeRadiusPx - 4);
        ctx.lineTo(hx, hy + holeRadiusPx + 4);
        ctx.stroke();
      };

      drawMountHole(holeInsetPxX, holeInsetPxY);
      drawMountHole(w - holeInsetPxX, holeInsetPxY);
      drawMountHole(holeInsetPxX, h - holeInsetPxY);
      drawMountHole(w - holeInsetPxX, h - holeInsetPxY);

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.fillText('🔩 3/8" Pre-Drilled Holes (0.75" Inset)', holeInsetPxX + 10, holeInsetPxY + 4);
      ctx.restore();
    }
  },

  /**
   * 💎 ACRYLIC SIGNS TEMPLATE (1/4" cast acrylic, standoff hardware mounts, 0.75" safe area)
   */
  _drawAcrylicSignTemplate(w, h, printW, printH, safeX, safeY, ppiX, ppiY) {
    const ctx = this.ctx;
    const standoffInsetIn = 1.0;
    const standoffRadiusPx = Math.max(8, (0.375 * Math.min(ppiX, ppiY)));
    const standoffInsetPxX = Math.max(20, standoffInsetIn * ppiX);
    const standoffInsetPxY = Math.max(20, standoffInsetIn * ppiY);

    // 1. Polished Diamond Edge Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ ACRYLIC TRIM: ${printW}" × ${printH}" (Diamond Polished Edge)`, 12, 18);
      ctx.restore();
    }

    // 2. Safe Area (0.75" inside trim)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const sX = Math.max(16, safeX * 0.9);
      const sY = Math.max(16, safeY * 0.9);
      ctx.strokeRect(sX, sY, w - sX * 2, h - sY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 0.75" inside acrylic perimeter', sX + 6, sY + 14);
      ctx.restore();
    }

    // 3. Bleed Line
    if (this.guides.bleed) {
      ctx.save();
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('📐 Bleed: 0.125" required for full-bleed acrylic prints', 12, h - 8);
      ctx.restore();
    }

    // 4. Standoff Hardware Mounts
    if (this.guides.hardware !== false) {
      ctx.save();
      const drawStandoff = (sx, sy) => {
        ctx.beginPath();
        ctx.arc(sx, sy, standoffRadiusPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(sx, sy, standoffRadiusPx * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = '#334155';
        ctx.fill();
      };

      drawStandoff(standoffInsetPxX, standoffInsetPxY);
      drawStandoff(w - standoffInsetPxX, standoffInsetPxY);
      drawStandoff(standoffInsetPxX, h - standoffInsetPxY);
      drawStandoff(w - standoffInsetPxX, h - standoffInsetPxY);

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.fillText('🔩 Standoff Hardware Holes (0.5" Dia)', standoffInsetPxX + 12, standoffInsetPxY + 4);
      ctx.restore();
    }
  },

  /**
   * 🌬️ MESH BANNER TEMPLATE (70/30 airflow weave pattern, perimeter webbing, brass grommets @ 24")
   */
  _drawMeshBannerTemplate(w, h, printW, printH, safeX, safeY, ppiX, ppiY, spec) {
    const ctx = this.ctx;

    // 1. Mesh Airflow Dot Overlay
    if (this.guides.hardware !== false) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.08)';
      for (let x = 8; x < w; x += 12) {
        for (let y = 8; y < h; y += 12) {
          ctx.beginPath();
          ctx.arc(x, y, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 2. Cutline & Reinforced Perimeter Webbing
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      // Webbing border
      const webPx = Math.max(10, 1.5 * Math.min(ppiX, ppiY));
      ctx.strokeStyle = 'rgba(234, 88, 12, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(webPx, webPx, w - webPx * 2, h - webPx * 2);

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ MESH TRIM: ${printW}" × ${printH}" (70/30 Airflow Perforated)`, 12, 18);
      ctx.restore();
    }

    // 3. Safe Area
    if (this.guides.safeArea && safeX * 2 < w && safeY * 2 < h) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(safeX, safeY, w - safeX * 2, h - safeY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 1.50" inside perimeter webbing', safeX + 6, safeY + 14);
      ctx.restore();
    }

    // 4. Brass Grommets (Corners + 24" perimeter)
    if (this.guides.grommets !== false) {
      ctx.save();
      const grommetSpacingIn = 24;
      const grommetInsetPx = Math.min(safeX * 0.7, 18);
      const grommetRadius = 6.5;

      const drawGrommet = (gx, gy) => this.drawGrommetMark(ctx, gx, gy, grommetRadius * 2);

      drawGrommet(grommetInsetPx, grommetInsetPx);
      drawGrommet(w - grommetInsetPx, grommetInsetPx);
      drawGrommet(grommetInsetPx, h - grommetInsetPx);
      drawGrommet(w - grommetInsetPx, h - grommetInsetPx);

      const numGrommetsX = Math.floor(printW / grommetSpacingIn);
      if (numGrommetsX > 1) {
        const stepX = (w - grommetInsetPx * 2) / numGrommetsX;
        for (let i = 1; i < numGrommetsX; i++) {
          drawGrommet(grommetInsetPx + i * stepX, grommetInsetPx);
          drawGrommet(grommetInsetPx + i * stepX, h - grommetInsetPx);
        }
      }
      ctx.restore();
    }
  },

  /**
   * 🚦 SAFETY & PARKING SIGN TEMPLATE (12" x 18" reflective aluminum with top & bottom center holes)
   */
  _drawSafetyParkingSignTemplate(w, h, printW, printH, safeX, safeY, ppiX, ppiY) {
    const ctx = this.ctx;
    const cornerRadiusPx = Math.max(8, 0.5 * Math.min(ppiX, ppiY));
    const holeRadiusPx = Math.max(5, (0.1875 * Math.min(ppiX, ppiY)));
    const holeInsetY = Math.max(16, 0.75 * ppiY);

    // 1. Cutline with rounded corners
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#15803d';
      ctx.lineWidth = 2.5;
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(1, 1, w - 2, h - 2, cornerRadiusPx);
        ctx.stroke();
      } else {
        ctx.strokeRect(1, 1, w - 2, h - 2);
      }
      ctx.fillStyle = '#15803d';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ SAFETY SIGN TRIM: ${printW}" × ${printH}" (0.5" Radius Rounded Corners)`, 12, 18);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const sX = Math.max(12, safeX);
      const sY = Math.max(12, safeY);
      if (ctx.roundRect) {
        ctx.beginPath();
        ctx.roundRect(sX, sY, w - sX * 2, h - sY * 2, Math.max(4, cornerRadiusPx - 4));
        ctx.stroke();
      } else {
        ctx.strokeRect(sX, sY, w - sX * 2, h - sY * 2);
      }
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 0.50" inside perimeter', sX + 6, sY + 14);
      ctx.restore();
    }

    // 3. Top and Bottom Center Post Mounting Holes
    if (this.guides.hardware !== false) {
      ctx.save();
      const drawCenterHole = (hy) => {
        ctx.beginPath();
        ctx.arc(w / 2, hy, holeRadiusPx, 0, Math.PI * 2);
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w / 2 - holeRadiusPx - 4, hy);
        ctx.lineTo(w / 2 + holeRadiusPx + 4, hy);
        ctx.moveTo(w / 2, hy - holeRadiusPx - 4);
        ctx.lineTo(w / 2, hy + holeRadiusPx + 4);
        ctx.stroke();
      };

      drawCenterHole(holeInsetY);
      drawCenterHole(h - holeInsetY);

      ctx.fillStyle = '#334155';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🔩 3/8" Center Post Mounting Hole', w / 2, holeInsetY + 18);
      ctx.restore();
    }
  },

  /**
   * 🚪 A-FRAME SIDEWALK SIGN TEMPLATE (24" x 36" insert area, top handle clearance, bottom latch line)
   */
  _drawAFrameTemplate(w, h, printW, printH, safeX, safeY, ppiX, ppiY) {
    const ctx = this.ctx;
    const handleW = Math.min(100, w * 0.3);
    const handleH = Math.min(24, h * 0.08);

    // 1. Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ A-FRAME INSERT TRIM: ${printW}" × ${printH}" (Coroplast Sidewalk Board)`, 12, 18);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      const sX = Math.max(14, safeX);
      const sY = Math.max(14, safeY);
      ctx.strokeRect(sX, sY, w - sX * 2, h - sY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 0.75" inside frame insert', sX + 6, sY + 14);
      ctx.restore();
    }

    // 3. Top Handle Notch Clearance
    if (this.guides.hardware !== false) {
      ctx.save();
      ctx.fillStyle = 'rgba(71, 85, 105, 0.15)';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect((w - handleW) / 2, 2, handleW, handleH);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🪝 Top Grab Handle Clearance (Stay Clear)', w / 2, handleH + 12);
      ctx.restore();
    }
  },

  /**
   * 🏷️ DECALS & STICKERS TEMPLATE (Kiss-cut contour line, 0.125" bleed, split-back liner)
   */
  _drawDecalStickerTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;

    // 1. Kiss-cut Contour Line
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#2563eb';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ KISS-CUT CONTOUR: ${printW}" × ${printH}"`, 10, 16);
      ctx.restore();
    }

    // 2. Safe Area (0.125")
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      const s = Math.max(8, safeX * 0.4);
      ctx.strokeRect(s, s, w - s * 2, h - s * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 0.125" inside cutline', s + 4, s + 12);
      ctx.restore();
    }

    // 3. Bleed Line
    if (this.guides.bleed) {
      ctx.save();
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('📐 Bleed: 0.125" required for full color background', 10, h - 10);
      ctx.restore();
    }
  },

  /**
   * 👕 APPAREL TEMPLATE (12" x 14" center chest print zone, collar reference arc)
   */
  _drawApparelTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;

    // 1. Collar reference
    if (this.guides.seams !== false) {
      ctx.save();
      ctx.strokeStyle = '#71717a';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(w * 0.35, 0);
      ctx.quadraticCurveTo(w * 0.5, 36, w * 0.65, 0);
      ctx.stroke();
      ctx.fillStyle = '#71717a';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🧵 Collar Line Reference', w / 2, 48);
      ctx.restore();
    }

    // 2. Chest Print Zone (12" x 14")
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 2.5;
      const bX = w * 0.15;
      const bY = h * 0.22;
      const bW = w * 0.70;
      const bH = h * 0.68;
      ctx.strokeRect(bX, bY, bW, bH);
      ctx.fillStyle = '#ea580c';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText('👕 MAX CHEST PRINT ZONE: 12" × 14"', bX + 6, bY - 8);
      ctx.restore();
    }

    // 3. Safe Zone
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      const sX = w * 0.18;
      const sY = h * 0.25;
      ctx.strokeRect(sX, sY, w * 0.64, h * 0.62);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 0.50" inside print box', sX + 6, sY + 14);
      ctx.restore();
    }
  },

  /**
   * 📄 MARKETING FLYER TEMPLATE (8.5" x 11", 0.25" safe area, 0.125" bleed)
   */
  _drawMarketingFlyerTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;

    // 1. Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ TRIM LINE: ${printW}" × ${printH}" (Standard 8.5" × 11")`, 10, 16);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const sX = Math.max(12, safeX * 0.4);
      const sY = Math.max(12, safeY * 0.4);
      ctx.strokeRect(sX, sY, w - sX * 2, h - sY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('🛡️ SAFE ZONE: 0.25" inside trim', sX + 6, sY + 14);
      ctx.restore();
    }

    // 3. Bleed Line
    if (this.guides.bleed) {
      ctx.save();
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText('📐 Bleed: 0.125" required on all 4 sides', 10, h - 10);
      ctx.restore();
    }
  },

  /**
   * 100% Zoom Loupe Setup
   */
  _setupLoupeEvents() {
    const loupe = document.getElementById('zoom-loupe');
    if (!loupe || !this.canvas) return;
    // Listen on the canvas frame, not the canvas: spelling / stray-mark markers lie on top of the canvas and
    // would otherwise swallow the mouse exactly where the designer wants to zoom in
    const area = this.canvas.parentElement || this.canvas;
    if (area !== this.canvas) { this.canvas.onmousemove = null; this.canvas.onmouseleave = null; }

    area.onmousemove = (e) => {
      if (!this.guides.loupe || !this.currentImg) {
        loupe.style.display = 'none';
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      if (mouseX < 0 || mouseY < 0 || mouseX > rect.width || mouseY > rect.height) {
        loupe.style.display = 'none';
        return;
      }

      // Calculate position relative to container (.canvas-viewport-wrap)
      const wrap = this.canvas.parentElement;
      const wrapRect = wrap ? wrap.getBoundingClientRect() : rect;
      const curXInWrap = e.clientX - wrapRect.left;
      const curYInWrap = e.clientY - wrapRect.top;

      // Position loupe exact next to the cursor pointer
      // Default: +20px to the right of cursor point, centered vertically (-80px for 160px diameter)
      let loupeLeft = curXInWrap + 20;
      let loupeTop = curYInWrap - 80;

      // If loupe would overflow the right boundary of the viewport, flip to the left side of cursor (-180px)
      if (loupeLeft + 165 > wrapRect.width) {
        loupeLeft = curXInWrap - 160 - 20;
      }
      // Ensure loupe stays within vertical viewport bounds
      loupeTop = Math.max(6, Math.min(wrapRect.height - 166, loupeTop));

      loupe.style.display = 'block';
      loupe.style.left = `${loupeLeft}px`;
      loupe.style.top = `${loupeTop}px`;

      const HALF = 80;                                    // loupe is 160 px across
      const kx = this.canvas.width / rect.width, ky = this.canvas.height / rect.height;   // canvas px per screen px
      // What the canvas shows, magnified: the frame, hems and guides around the artwork (and the whole
      // picture in template / mockup / rotated views, where the artwork is not drawn 1:1)
      if (this._loupeCanvasUrl === null || this._loupeCanvasUrl === undefined) {
        try { this._loupeCanvasUrl = this.canvas.toDataURL('image/png'); } catch (err) { this._loupeCanvasUrl = ''; }
        this._loupeCanvasVer = (this._loupeCanvasVer || 0) + 1;
      }
      const hasCanvas = !!this._loupeCanvasUrl;
      const canvasLayer = (z) => ({ size: `${rect.width * z}px ${rect.height * z}px`, pos: `${HALF - mouseX * z}px ${HALF - mouseY * z}px` });

      const img = this.currentImg, art = this.artRect;
      let mode, sizes, positions, label;
      if (art && !this.artRot && img.naturalWidth > 0 && img.naturalHeight > 0) {
        // Artwork view: the real artwork pixels, in their own proportions (never stretched to the canvas).
        // A turned artwork is magnified from the canvas picture instead (the file's pixels are not turned).
        // 100% = one artwork pixel per screen pixel, as in Photoshop; low-resolution artwork is shown 2×.
        const artX = art.x / kx, artY = art.y / ky, artW = art.w / kx, artH = art.h / ky;
        const actual = img.naturalWidth / artW;
        const z = Math.max(actual, 2);
        mode = hasCanvas ? 'art+canvas' : 'art';
        sizes = [`${artW * z}px ${artH * z}px`];
        positions = [`${HALF - (mouseX - artX) * z}px ${HALF - (mouseY - artY) * z}px`];
        if (hasCanvas) { const c = canvasLayer(z); sizes.push(c.size); positions.push(c.pos); }
        label = z === actual ? '🔍 100% SOP Zoom' : '🔍 2× Zoom (low-res artwork)';
      } else {
        if (!hasCanvas) { loupe.style.display = 'none'; return; }
        const c = canvasLayer(3);
        mode = 'canvas';
        sizes = [c.size];
        positions = [c.pos];
        label = '🔍 3× Zoom';
      }
      // The pictures only change with the artwork / a redraw — not on every mouse move (they can be MBs)
      const key = `${mode}|${this._loupeCanvasVer}`;
      if (this._loupeBgKey !== key || this._loupeBgImg !== img) {
        const pics = mode === 'canvas' ? [this._loupeCanvasUrl] : mode === 'art' ? [img.src] : [img.src, this._loupeCanvasUrl];
        loupe.style.backgroundImage = pics.map(u => `url("${u}")`).join(', ');
        this._loupeBgKey = key;
        this._loupeBgImg = img;
      }
      loupe.style.backgroundSize = sizes.join(', ');
      loupe.style.backgroundPosition = positions.join(', ');
      if (loupe.dataset.label !== label) loupe.dataset.label = label;
    };

    area.onmouseleave = () => {
      loupe.style.display = 'none';
    };
  },

  /**
   * 💳 BUSINESS CARD TEMPLATE (Clean cutline, 0.125" safe area, bleed, crop marks, NO grommets)
   */
  _drawBusinessCardTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    // 1. Trim line
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ CARD TRIM LINE: ${printW}" × ${printH}"`, 14, 22);
      ctx.restore();
    }
    // 2. Safe zone
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      const sX = Math.max(14, safeX);
      const sY = Math.max(14, safeY);
      ctx.strokeRect(sX, sY, w - sX * 2, h - sY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.125" inside trim`, sX + 6, sY + 14);
      ctx.restore();
    }
    // 3. Bleed line
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.125" on all 4 sides · 14 pt Gloss Stock`, 14, h - 10);
      ctx.restore();
    }
  },

  /**
   * 🎪 FABRIC POP UP COUNTER DISPLAY TEMPLATE (Wrap-around graphic with front & side panel guides)
   */
  _drawPopupCounterTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const colW = Math.round(w * 0.26);

    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.restore();
    }

    // Panel curves / fold guides
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(colW, 2); ctx.lineTo(colW, h - 2);
    ctx.moveTo(w - colW, 2); ctx.lineTo(w - colW, h - 2);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LEFT CURVE', colW / 2, 24);
    ctx.fillText('RIGHT CURVE', w - colW / 2, 24);
    ctx.fillStyle = '#ff5f1f';
    ctx.fillText('FRONT DISPLAY PANEL (MAIN VISUAL)', w / 2, 24);
    ctx.restore();

    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(safeX, safeY, w - safeX * 2, h - safeY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside graphic`, colW + 8, safeY + 14);
      ctx.restore();
    }
  },

  /**
   * 🎌 HAND FLAG TEMPLATE (Handheld stick sleeve, hem lines, NO grommets)
   */
  _drawHandFlagTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const sleeveW = Math.max(24, Math.round(w * 0.12));

    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(sleeveW, 4, w - sleeveW - 6, h - 8);
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ FLAG TRIM: ${printW}" × ${printH}"`, sleeveW + 10, 20);
      ctx.restore();
    }

    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(sleeveW + safeX, safeY, w - sleeveW - safeX * 2, h - safeY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside hem`, sleeveW + safeX + 6, safeY + 14);
      ctx.restore();
    }

    if (this.guides.sleeve) {
      ctx.save();
      ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
      ctx.fillRect(0, 0, sleeveW, h);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(0, 0, sleeveW, h);

      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 2, 0); ctx.lineTo(sleeveW - 2, h);
      ctx.stroke();

      ctx.save();
      ctx.translate(sleeveW / 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('STICK SLEEVE', 0, 3);
      ctx.restore();
      ctx.restore();
    }
  },

  toggleGuide(name, enabled) {
    if (this.guides[name] !== undefined) {
      this.guides[name] = enabled;
      this.renderContextualToolbar();
      this.redraw();
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CanvasInspector;
}
