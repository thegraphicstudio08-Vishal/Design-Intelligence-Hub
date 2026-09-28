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

    // Resolve official BannerBuzz template & mockup from QNAP registry (using spec AND dimensions)
    this.officialTemplate = (typeof getOfficialProductTemplate === 'function')
      ? getOfficialProductTemplate(spec?.slug || spec?.name, dims)
      : null;
    this.officialMockup = (typeof getOfficialProductMockup === 'function')
      ? getOfficialProductMockup(spec?.slug || spec?.name, dims)
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

    // Update the contextual toolbar options in the DOM
    this.renderContextualToolbar();

    if (!imgSrc) {
      // Create clean high-resolution demonstration artwork if none provided
      imgSrc = this._createDemoArtwork(spec, dims);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.currentImg = img;
      this.redraw();
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
          <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()" style="font-size:11px;">🔄 Rotate 90°</button>
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
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'yard-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Finished Trim</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.stakes ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('stakes', this.checked)"> 🔩 Metal Step Stakes</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.flutes ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('flutes', this.checked)"> || Corflute Flutes</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'flag-rectangle') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Left Pole Sleeve</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ Sleeve Clips / Grommets</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (1.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Hem Stitch Lines</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'magnet-rounded') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Rounded Cutline (R 0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🧲 30-Mil Magnetic Backing</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'x-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (1.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ 4 Corner Eyelets</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> ✖️ X-Frame Tension Arms</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'l-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 Top & Bottom Clamp Bars</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'canvas-wrap') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🖼️ Face Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Canvas Fold Lines</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 1.5" Gallery Wrap Border</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'perforated-window') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🪟 Micro-Perforation Mesh (60/40)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'desk-flags-blade' || tType === 'desk-flags-teardrop') {
      const isBlade = tType === 'desk-flags-blade';
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Desk ${isBlade ? 'Blade' : 'Teardrop'} Cutline</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.25")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Desk Pole Sleeve</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'teardrop-flag') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (1.0")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Teardrop Cutline</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Pole Sleeve (Left)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'feather-flag' || tType === 'blade-flag') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (1.0")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Feather Contour</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.sleeve ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('sleeve', this.checked)"> 🚩 Pole Sleeve (Left)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'roll-up') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Finished Trim</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 📦 Cassette Margin (>6" Base)</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'table-cover') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Hem Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.seams ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('seams', this.checked)"> 🧵 Panel Seams</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'circle') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Circle</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Circle Cutline</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'aluminum-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ 0.5" Rounded Corners</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 4 Pre-Drilled Holes (3/8")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'acrylic-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Polished Acrylic Trim</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.75")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 Standoff Hardware Mounts</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'mesh-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (1.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim & Reinforced Webbing</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ Brass Grommets @ 24"</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🌬️ 70/30 Mesh Airflow</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'safety-parking-sign') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ 0.5" Rounded Corners</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.5")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🔩 Top & Bottom Post Holes</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'a-frame') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ 24" × 36" Board Insert</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.75")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.hardware ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('hardware', this.checked)"> 🪝 Handle & Hinge Clearance</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'decal-sticker') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Kiss-Cut Contour Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'apparel') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> 👕 Chest Print Zone (12" × 14")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Margin</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.seams ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('seams', this.checked)"> 🧵 Collar Reference Arc</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'marketing-flyer') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line (8.5" × 11")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Zone (0.25")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else if (tType === 'pole-banner') {
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.polePockets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('polePockets', this.checked)"> 🎗️ Top & Bottom Pockets (3")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    } else {
      // Standard Vinyl / Fabric Banner
      const hasPolePockets = this.currentDims?.hasPolePockets || this.currentDims?.pocketType?.includes('Top Pole Pocket') || this.currentDims?.pocketType?.includes('Pocket');
      const hasGrommets = this.currentDims?.hasGrommets !== false && this.currentDims?.grommetType !== 'None' && !hasPolePockets;
      controlsHtml = `
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.safeArea ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('safeArea', this.checked)"> 🛡️ Safe Area (1.25")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.cutLine ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('cutLine', this.checked)"> ✂️ Trim Line</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.bleed ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('bleed', this.checked)"> 📐 Bleed (0.125")</label>
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.seams ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('seams', this.checked)"> 🧵 1.25" Hem Fold Lines</label>
        ${hasPolePockets ? `<label class="vi-toggle active"><input type="checkbox" ${this.guides.polePockets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('polePockets', this.checked)"> 🎗️ 3" Top Pole Pocket</label>` : ''}
        ${hasGrommets ? `<label class="vi-toggle active"><input type="checkbox" ${this.guides.grommets ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('grommets', this.checked)"> ⭕ Brass Grommets @ 24"</label>` : ''}
        <label class="vi-toggle active"><input type="checkbox" ${this.guides.loupe ? 'checked' : ''} onchange="CanvasInspector.toggleGuide('loupe', this.checked)"> 🔍 Zoom Loupe</label>
        <button class="btn btn-outline btn-sm" onclick="CanvasInspector.rotate90()">🔄 Rotate 90°</button>
      `;
    }

    container.innerHTML = modeSwitcherHtml + qnapToggleHtml + controlsHtml;
  },

  _drawTemplateMode(w, h, spec, dims) {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const isRotated = (this.currentRotation === 90 || this.currentRotation === 270);

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
        let drawW, drawH, drawX, drawY;
        if (naturalAspect > canvasAspect) {
          drawW = w - 8;
          drawH = drawW / naturalAspect;
          drawX = 4;
          drawY = (h - drawH) / 2;
        } else {
          drawH = h - 8;
          drawW = drawH * naturalAspect;
          drawY = 4;
          drawX = (w - drawW) / 2;
        }
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      }
      ctx.restore();
    } else {
      // No real template supplied for this product yet — never draw an invented shape
      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Real template not added yet', w / 2, h / 2);
      ctx.textAlign = 'start';
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

    const isQnap = this.officialTemplate?.real || (this.officialTemplate?.templateFile && !this.officialTemplate.templateFile.includes('placeholder'));
    ctx.fillStyle = isQnap ? '#22c55e' : '#f97316';
    ctx.font = 'bold 11.5px Inter, sans-serif';
    ctx.fillText(isQnap ? '🏛️ OFFICIAL BANNERBUZZ TEMPLATE (QNAP)' : '🏛️ REFERENCE TEMPLATE', 20, 26);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 10px Inter, sans-serif';
    const tName = this.officialTemplate?.name || spec?.name || 'Production Template';
    const tDims = this.officialTemplate?.dims || `${dims?.widthIn || spec?.defaultW || 36}" × ${dims?.heightIn || spec?.defaultH || 24}"`;
    ctx.fillText(`${tName} · ${tDims} · Official Production Die-Line`, 20, 42);
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
   * Rotate artwork by 90 degrees
   */
  rotate90() {
    this.currentRotation = (this.currentRotation + 90) % 360;
    this.redraw();
  },

  /**
   * Banner production layout per SOP + real print files (Desktop/Print):
   *  - canvas = order + 1.25" hem each side when grommets / stitched edges (US2382447 4x3 ft, US2395381 8x3 ft)
   *  - top pole pocket: +5.25" band on top, no side hem (US2382836 36x136 in)
   *  - grommet centres 1" inside the finished edge, at every corner, evenly spaced ≤ 48" apart
   *    (4 ft edge = corners only, 8 ft edge = corners + middle; exact rule lives in "Banners finishing.xls")
   *  - safe area 1.25" inside the finished edge (SOP 1_Banners · Important design checks)
   * Returns null for non-banners or when finishing is unknown to the SOP data.
   */
  _bannerSop(spec, dims) {
    if (typeof SopRules === 'undefined' || !dims?.widthIn || !dims?.heightIn) return null;
    if (this.inspectorMode !== 'artwork' && this.inspectorMode) return null;
    const st = (typeof appState !== 'undefined') ? appState : {};
    const fd = st.userDims?.finishingDetails || st.finishingDetails || {};
    const fin = [st.parsedFilename?.finishing, st.finishingDetailsSummary, fd.grommets, fd.pockets, fd.edges]
      .filter(v => v && v !== 'None').join(' ');
    if (SopRules.family(spec, st.parsedFilename) !== 'banner') return null;
    const c = SopRules.canvas(spec, dims, { finishing: fin });
    if (!c) return null;
    const W = dims.widthIn, H = dims.heightIn;
    const pocket = /pole pocket/i.test(fin) && c.confirmed && c.hIn > H && c.wIn === W;
    const grommets = /grommet/i.test(fin);
    return {
      orderW: W, orderH: H, canvasW: c.wIn, canvasH: c.hIn, confirmed: c.confirmed, note: c.note,
      hemX: pocket ? 0 : (c.wIn - W) / 2, hemTop: pocket ? (c.hIn - H) : (c.hIn - H) / 2, hemBottom: pocket ? 0 : (c.hIn - H) / 2,
      pocket, grommets, safeIn: 1.25
    };
  },

  _drawBannerSop(img, w, h, b) {
    const ctx = this.ctx;
    const isRotated = (this.currentRotation === 90 || this.currentRotation === 270);
    const s = w / b.canvasW; // px per inch
    const tx = b.hemX * s, ty = b.hemTop * s, tw = b.orderW * s, th = b.orderH * s;

    // Artwork fitted into the finished (order) size — never stretched
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    if (this.currentRotation !== 0) {
      ctx.translate(tx + tw / 2, ty + th / 2);
      ctx.rotate((this.currentRotation * Math.PI) / 180);
      const boxW = isRotated ? th : tw;
      const boxH = isRotated ? tw : th;
      const r = this._fitRect(img.naturalWidth || boxW, img.naturalHeight || boxH, boxW, boxH);
      ctx.drawImage(img, r.x - boxW / 2, r.y - boxH / 2, r.w, r.h);
    } else {
      const r = this._fitRect(img.naturalWidth || tw, img.naturalHeight || th, tw, th);
      ctx.drawImage(img, tx + r.x, ty + r.y, r.w, r.h);
    }
    ctx.restore();

    // Hem / pole-pocket band (production area outside the finished size)
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(tx, ty, tw, th);
    ctx.fill('evenodd');
    ctx.restore();

    // Finished size (trim / fold line)
    if (this.guides.cutLine !== false) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2;
      ctx.strokeRect(tx, ty, tw, th);
      ctx.restore();
    }

    // Safe area 1.25" inside the finished edge
    if (this.guides.safeArea !== false) {
      const si = b.safeIn * s;
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([7, 5]);
      ctx.strokeRect(tx + si, ty + si, tw - 2 * si, th - 2 * si);
      ctx.restore();
    }

    // Grommet marks: 1" inside the finished edge, corners + evenly spaced ≤ 48"
    if (b.grommets && this.guides.grommets !== false) {
      const inset = 1 * s;
      const pts = [];
      const along = (lenIn) => {
        const run = lenIn - 2; // between corner grommet centres
        const n = Math.max(1, Math.ceil(run / 48));
        return Array.from({ length: n + 1 }, (_, i) => 1 + (run * i) / n);
      };
      along(b.orderW).forEach(x => { pts.push([tx + x * s, ty + inset]); pts.push([tx + x * s, ty + th - inset]); });
      along(b.orderH).forEach(y => { pts.push([tx + inset, ty + y * s]); pts.push([tx + tw - inset, ty + y * s]); });
      const seen = new Set();
      const rad = Math.max(3, 0.5 * s);
      pts.forEach(([x, y]) => {
        const k = Math.round(x) + ',' + Math.round(y);
        if (seen.has(k)) return;
        seen.add(k);
        ctx.save();
        ctx.fillStyle = '#e5e7eb';
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = Math.max(1.5, rad * 0.45);
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.restore();
      });
      b.grommetCount = seen.size;
    }

    // Labels
    ctx.save();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(4, 4, Math.min(w - 8, 420), 34);
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.fillText(`SOP BANNER · finished ${b.orderW}" × ${b.orderH}" · canvas ${b.canvasW}" × ${b.canvasH}"`, 10, 17);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '9.5px Inter, sans-serif';
    const parts = [b.pocket ? 'Top pole pocket 5.25"' : (b.hemX ? 'Hem 1.25" each side' : 'No hem allowance confirmed'),
      'Safe 1.25"', b.grommets ? `Grommets 1" in, ≤48" apart (${b.grommetCount || 0})` : 'No grommets'];
    ctx.fillText(parts.join(' · '), 10, 31);
    ctx.restore();
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
   * Redraw the canvas, artwork, and product template overlays
   */
  redraw() {
    this.init('artwork-canvas');
    if (!this.canvas || !this.currentImg) return;

    const img = this.currentImg;
    const spec = this.currentSpec || {};
    const dims = this.currentDims || {};
    let printW = parseFloat(dims.widthIn) || spec.defaultW || 36;
    let printH = parseFloat(dims.heightIn) || spec.defaultH || 24;

    const isRotated = (this.currentRotation === 90 || this.currentRotation === 270);
    // Real template: the canvas is the template's own bleed size
    if (this.officialTemplate?.real && Array.isArray(this.officialTemplate.bleedIn)) {
      printW = this.officialTemplate.bleedIn[0];
      printH = this.officialTemplate.bleedIn[1];
    }
    // Banner: the canvas is the SOP production canvas (order + hem / pole pocket), as in the real print files
    let bannerSop = this._bannerSop(spec, { widthIn: printW, heightIn: printH });
    if (bannerSop && isRotated) {
      bannerSop = {
        ...bannerSop,
        orderW: bannerSop.orderH,
        orderH: bannerSop.orderW,
        canvasW: bannerSop.canvasH,
        canvasH: bannerSop.canvasW,
        hemX: bannerSop.hemTop,
        hemTop: bannerSop.hemX,
        hemBottom: bannerSop.hemX
      };
    }
    if (bannerSop) {
      printW = bannerSop.canvasW;
      printH = bannerSop.canvasH;
    }
    const viewW = bannerSop ? printW : (isRotated ? printH : printW);
    const viewH = bannerSop ? printH : (isRotated ? printW : printH);

    // Viewport scaling strictly preserving physical product aspect ratio (never squeeze or stretch!)
    const maxViewportW = 860;
    const maxViewportH = 480;
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

    this.canvas.width = w;
    this.canvas.height = h;

    if (this.inspectorMode === 'template') {
      this._drawTemplateMode(w, h, spec, dims);
      return;
    }
    if (this.inspectorMode === 'mockup') {
      this._drawMockupMode(w, h, spec, dims);
      return;
    }

    if (bannerSop) {
      this._drawBannerSop(img, w, h, bannerSop);
      return;
    }

    // 1. Draw solid white substrate
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, w, h);

    // 2. Draw artwork image with aspect ratio preservation (never distorted or stretched)
    // Always fit (never stretch): any gap left over is the real area the artwork does not cover at order size
    this.ctx.save();
    if (this.currentRotation !== 0) {
      this.ctx.translate(w / 2, h / 2);
      this.ctx.rotate((this.currentRotation * Math.PI) / 180);
      const boxW = isRotated ? h : w;
      const boxH = isRotated ? w : h;
      const r = this._fitRect(img.naturalWidth || boxW, img.naturalHeight || boxH, boxW, boxH);
      this.ctx.drawImage(img, r.x - boxW / 2, r.y - boxH / 2, r.w, r.h);
    } else {
      const r = this._fitRect(img.naturalWidth || w, img.naturalHeight || h, w, h);
      this.ctx.drawImage(img, r.x, r.y, r.w, r.h);
    }
    this.ctx.restore();

    // 2.4 Official QNAP Template Overlay when enabled via toolbar toggle or in template mode
    if (this.guides.officialOverlay && this.officialTemplateImg && this.officialTemplateImg.complete && this.officialTemplateImg.naturalWidth > 0) {
      const t = this.officialTemplateImg;
      const r = this._fitRect(t.naturalWidth, t.naturalHeight, w, h);
      this.ctx.save();
      this.ctx.globalAlpha = 0.65;
      this.ctx.drawImage(t, r.x, r.y, r.w, r.h);
      this.ctx.restore();
    }

    // 3. Draw Product-Specific Die-Line Template and SOP Overlays
    const tType = this.getTemplateType(this.currentSpec, this.currentDims);
    this._drawProductTemplate(w, h, tType);
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

    const safeMarginIn = parseFloat(spec.safeArea) || 1.25;
    const safePxX = Math.max(12, safeMarginIn * ppiX);
    const safePxY = Math.max(12, safeMarginIn * ppiY);

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
      this._drawMagneticSignTemplate(w, h, printW, printH, safePxX, safePxY);
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
      ctx.fillText('|| 4mm Vertical Flute Direction', 14, 20);
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
      ctx.fillText(`✂️ YARD SIGN TRIM: ${printW}" × ${printH}" (4mm Corflute)`, 14, 38);
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
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside trim (No grommets on yard signs)`, safeX + 6, safeY + 16);
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
      const drawSleeveEyelet = (gy) => {
        const gx = sleeveW / 2;
        ctx.beginPath();
        ctx.arc(gx, gy, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      };

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
  _drawMagneticSignTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
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

    // 2. Rounded Cutline (Orange solid 3px)
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      traceRoundedRect(ctx, 2, 2, w - 4, h - 4, r);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ VEHICLE MAGNET DIE-CUT: ${printW}" × ${printH}" (0.5" Rounded Corners)`, 16, 26);
      ctx.restore();
    }

    // 3. 30-Mil Magnetic Backing & Bevel Shadow
    if (this.guides.hardware) {
      ctx.save();
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2.5;
      traceRoundedRect(ctx, 6, 6, w - 12, h - 12, r - 3);
      ctx.stroke();

      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.fillText('🧲 30-MIL HEAVY-DUTY VEHICLE MAGNETIC SUBSTRATE (Wind-Resistant)', 16, h - 12);
      ctx.restore();
    }

    // 4. Safe Area (0.5" inside rounded cutline)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      traceRoundedRect(ctx, safeX, safeY, w - safeX * 2, h - safeY * 2, Math.max(6, r - 6));
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside rounded cutline`, safeX + 8, safeY + 16);
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
      ctx.fillText(`✂️ X-BANNER TRIM: ${printW}" × ${printH}"`, 14, 24);
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
      ctx.fillText(`🛡️ SAFE ZONE: 1.50" inside trim (Keep clear of 4 corner hooks)`, safeX + 6, safeY + 16);
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
        ctx.beginPath();
        ctx.arc(gx, gy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#d97706';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

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
      ctx.fillText(`✂️ WINDOW GRAPHICS TRIM: ${printW}" × ${printH}" (60/40 Perforated Vinyl)`, 14, 24);
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
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside trim (No grommets on window film)`, safeX + 6, safeY + 16);
      ctx.restore();
    }
  },

  /**
   * 🚩 DESK FLAGS BLADE TEMPLATE (Tabletop Mini Blade Flag ~5.51" x 17.71")
   * Sourced directly from official BannerBuzz Desktop Blade Flag SF.psdt
   * Smooth rounded dome top arch, straight pole spine on left with sleeve, straight right edge,
   * and completely flat horizontal bottom base cutline.
   */
  _drawDeskBladeTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const sleeveW = Math.max(16, Math.min(26, Math.round(w * 0.08)));
    const padTop = 14;
    const padBottom = 12;
    const padRight = 8;

    // Single-sided desk blade (real proof US2395878): curve at TOP-LEFT, pole sleeve on the RIGHT.
    // Outline spans from the left edge to the sleeve: rounded corner away from the pole.
    const labelX = padRight + 6;

    // 1. High-contrast waste mask outside desk blade flag contour
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    this._traceDeskBladePath(ctx, padRight, padTop, w - sleeveW, h - padBottom);
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
      this._traceDeskBladePath(ctx, padRight, padTop, w - sleeveW, h - padBottom);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ DESK BLADE CUTLINE: ${printW}" × ${printH}"`, labelX, padTop + 24);
      ctx.restore();
    }

    // 3. Safe Area (Dashed green line inside contour, 0.50" margin)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceDeskBladeSafePath(ctx, padRight, padTop, w - sleeveW, h - padBottom, safeX, safeY);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside cutline`, labelX, padTop + 42);
      ctx.restore();
    }

    // 4. Bleed (0.25" / 0.50" boundary)
    if (this.guides.bleed) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#3b82f6';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`📐 Bleed: 0.25" on all sides`, labelX, h - 6);
      ctx.restore();
    }

    // 5. Right Pole Sleeve (Fabric sleeve channel for mini tabletop desk flag pole)
    if (this.guides.sleeve) {
      ctx.save();
      ctx.fillStyle = 'rgba(26, 32, 44, 0.88)';
      ctx.fillRect(w - sleeveW, 0, sleeveW, h);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(w - sleeveW + 3, 0);
      ctx.lineTo(w - sleeveW + 3, h);
      ctx.stroke();

      ctx.save();
      ctx.translate(w - sleeveW / 2 - 2, h / 2);
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 DESK POLE SLEEVE', 0, 0);
      ctx.restore();
      ctx.restore();
    }
  },

  _traceDeskBladePath(ctx, x1, y1, x2, y2) {
    const w = x2 - x1;
    const h = y2 - y1;

    // Start at bottom-left corner
    ctx.moveTo(x1, y1 + h);
    // Vertical left edge along pole spine
    ctx.lineTo(x1, y1 + h * 0.32);
    // Smooth dome arch curving to top-right
    ctx.bezierCurveTo(x1, y1 + h * 0.06, x1 + w * 0.45, y1, x2, y1);
    // Straight vertical right edge all the way to bottom
    ctx.lineTo(x2, y1 + h);
    // Flat horizontal bottom cutline
    ctx.lineTo(x1, y1 + h);
    ctx.closePath();
  },

  _traceDeskBladeSafePath(ctx, x1, y1, x2, y2, safeX, safeY) {
    const origW = x2 - x1;
    const origH = y2 - y1;
    const sx = Math.min(safeX, origW * 0.16);
    const sy = Math.min(safeY, origH * 0.08);

    const nx1 = x1 + sx;
    const ny1 = y1 + sy;
    const nx2 = x2 - sx;
    const ny2 = y2 - sy;
    const nw = nx2 - nx1;
    const nh = ny2 - ny1;

    ctx.moveTo(nx1, ny1 + nh);
    ctx.lineTo(nx1, ny1 + nh * 0.32);
    ctx.bezierCurveTo(nx1, ny1 + nh * 0.06, nx1 + nw * 0.45, ny1, nx2, ny1);
    ctx.lineTo(nx2, ny1 + nh);
    ctx.lineTo(nx1, ny1 + nh);
    ctx.closePath();
  },

  /**
   * 🚩 DESK FLAGS TEARDROP TEMPLATE (~5.51" x 17.71")
   * Matches official BannerBuzz Desktop Teardrop Flag SF.psdt
   */
  _drawDeskTeardropTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const sleeveW = Math.max(16, Math.min(26, Math.round(w * 0.08)));
    const padTop = 14;
    const padBottom = 12;
    const padRight = 8;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    this._traceTeardropPath(ctx, sleeveW, padTop, w - padRight, h - padBottom);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.fill('evenodd');
    ctx.restore();

    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 3;
      ctx.beginPath();
      this._traceTeardropPath(ctx, sleeveW, padTop, w - padRight, h - padBottom);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ DESK TEARDROP CUTLINE: ${printW}" × ${printH}"`, sleeveW + 10, padTop + 24);
      ctx.restore();
    }

    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceTeardropSafePath(ctx, sleeveW, padTop, w - padRight, h - padBottom, safeX, safeY);
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 0.50" inside curve`, sleeveW + 12, padTop + 42);
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
      ctx.fillText(`📐 Bleed: 0.25" on all sides`, sleeveW + 10, h - 6);
      ctx.restore();
    }

    if (this.guides.sleeve) {
      ctx.save();
      ctx.fillStyle = 'rgba(26, 32, 44, 0.88)';
      ctx.fillRect(0, 0, sleeveW, h);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 3, 0);
      ctx.lineTo(sleeveW - 3, h);
      ctx.stroke();

      ctx.save();
      ctx.translate(sleeveW / 2 + 2, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9.5px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 DESK POLE SLEEVE', 0, 0);
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
    const padTop = 16;
    const padBottom = 14;
    const padRight = 8;

    // Outer waste mask outside teardrop
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);

    // Teardrop cut path (counter-clockwise to carve out hole)
    this._traceTeardropPath(ctx, sleeveW, padTop, w - padRight, h - padBottom);
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
      this._traceTeardropPath(ctx, sleeveW, padTop, w - padRight, h - padBottom);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ TEARDROP CUTLINE: ${printW}" × ${printH}"`, sleeveW + 12, padTop + 24);
      ctx.restore();
    }

    // 2. Safe Area (Dashed green curve inside)
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceTeardropSafePath(ctx, sleeveW, padTop, w - padRight, h - padBottom, safeX, safeY);
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 1.00" inside curve`, sleeveW + 14, padTop + 42);
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
      ctx.fillText(`📐 Bleed: 0.50" on all sides`, sleeveW + 10, h - 6);
      ctx.restore();
    }

    // 4. Pole Sleeve Channel on Left Side
    if (this.guides.sleeve) {
      ctx.save();
      // Sleeve fabric background
      ctx.fillStyle = 'rgba(26, 32, 44, 0.88)';
      ctx.fillRect(0, 0, sleeveW, h);

      // Double stitched line
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 4, 0);
      ctx.lineTo(sleeveW - 4, h);
      ctx.stroke();

      // Sleeve text rotated
      ctx.save();
      ctx.translate(sleeveW / 2 + 4, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 REINFORCED POLE SLEEVE', 0, 0);
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
    const padTop = 16;
    const padBottom = 14;
    const padRight = 8;

    // Outer waste mask
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    this._traceFeatherPath(ctx, sleeveW, padTop, w - padRight, h - padBottom, tType);
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
      this._traceFeatherPath(ctx, sleeveW, padTop, w - padRight, h - padBottom, tType);
      ctx.stroke();

      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ ${tType.toUpperCase()} CUTLINE: ${printW}" × ${printH}"`, sleeveW + 12, padTop + 24);
      ctx.restore();
    }

    // 2. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      this._traceFeatherSafePath(ctx, sleeveW, padTop, w - padRight, h - padBottom, safeX, safeY, tType);
      ctx.stroke();

      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.fillText(`🛡️ SAFE ZONE: 1.00" inside cutline`, sleeveW + 14, padTop + 42);
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
      ctx.fillText(`📐 Bleed: 0.50" required`, sleeveW + 10, h - 6);
      ctx.restore();
    }

    // 4. Pole Sleeve
    if (this.guides.sleeve) {
      ctx.save();
      ctx.fillStyle = 'rgba(26, 32, 44, 0.88)';
      ctx.fillRect(0, 0, sleeveW, h);

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(sleeveW - 4, 0);
      ctx.lineTo(sleeveW - 4, h);
      ctx.stroke();

      ctx.save();
      ctx.translate(sleeveW / 2 + 4, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🚩 POLE SLEEVE', 0, 0);
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
    ctx.lineTo(x2, y1 + h * 0.82);
    // Concave bottom scoop
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
    ctx.lineTo(innerX2, innerY1 + h * 0.82);
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
   * 🪑 TABLE COVER TEMPLATE
   */
  _drawTableCoverTemplate(w, h, printW, printH, safeX, safeY) {
    const ctx = this.ctx;
    const topPanelH = h * 0.35;
    const sideW = w * 0.22;

    // 1. Cutline
    if (this.guides.cutLine) {
      ctx.save();
      ctx.strokeStyle = '#fb7b48';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = '#fb7b48';
      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.fillText(`✂️ TABLE COVER FLAT TRIM: ${printW}" × ${printH}"`, 12, 20);
      ctx.restore();
    }

    // 2. Seam Lines & Panel Separation
    if (this.guides.seams) {
      ctx.save();
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);

      // Table Top Surface boundary
      ctx.strokeRect(sideW, 0, w - sideW * 2, topPanelH);

      ctx.fillStyle = 'rgba(139, 92, 246, 0.08)';
      ctx.fillRect(sideW, 0, w - sideW * 2, topPanelH);

      ctx.fillStyle = '#6d28d9';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('TABLE TOP SURFACE (Flat)', w / 2, topPanelH / 2);
      ctx.fillText('FRONT DRAPE PANEL (Visible Front Display)', w / 2, topPanelH + (h - topPanelH) / 2);

      // Left & Right Drapes
      ctx.fillText('LEFT DRAPE', sideW / 2, h / 2);
      ctx.fillText('RIGHT DRAPE', w - sideW / 2, h / 2);
      ctx.restore();
    }

    // 3. Safe Area
    if (this.guides.safeArea) {
      ctx.save();
      ctx.strokeStyle = '#16a34a';
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(sideW + safeX, topPanelH + safeY, w - sideW * 2 - safeX * 2, h - topPanelH - safeY * 2);
      ctx.fillStyle = '#16a34a';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ FRONT SAFE ZONE', w / 2, topPanelH + safeY + 16);
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
      ctx.fillText(`🛡️ SAFE ZONE: ${spec?.safeArea || '1.25"'} inside trim`, safeX + 6, safeY + 14);
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

      const drawGrommet = (gx, gy) => {
        ctx.beginPath();
        ctx.arc(gx, gy, grommetRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#d97706';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, grommetRadius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      };

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

      const drawGrommet = (gx, gy) => {
        ctx.beginPath();
        ctx.arc(gx, gy, grommetRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#d97706';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(gx, gy, grommetRadius * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
      };

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

    this.canvas.onmousemove = (e) => {
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

      const zoomRatio = 3;
      loupe.style.backgroundImage = `url(${this.currentImg.src})`;
      loupe.style.backgroundSize = `${rect.width * zoomRatio}px ${rect.height * zoomRatio}px`;
      loupe.style.backgroundPosition = `-${mouseX * zoomRatio - 80}px -${mouseY * zoomRatio - 80}px`;
    };

    this.canvas.onmouseleave = () => {
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
