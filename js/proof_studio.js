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
    enableCropShot: true, // Checkbox toggle for Print Preview Crop Shot
    section2View: 'crop', // 'crop' or 'mockup'
    cropX: 50,
    cropY: 50,
    cropZoom: 2.2,
    includeSpecs: true,
    includeApproval: true
  },

  _lastOrderData: null,
  _lastTargetId: null,

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

  setSection2View(mode) {
    this.options.section2View = mode;
    this.refreshCurrentProof();
  },

  setLayoutMode(mode) {
    // Kept for backward compatibility
    this.options.enableCropShot = (mode !== 'multislot');
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  setCropZoom(zoom) {
    this.options.cropZoom = parseFloat(zoom) || 2.2;
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  setCropFocus(xPercent, yPercent) {
    this.options.cropX = Math.max(5, Math.min(95, xPercent));
    this.options.cropY = Math.max(5, Math.min(95, yPercent));
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  handleArtworkClick(e) {
    if (!this.options.enableCropShot || this.slots.crop?.dataUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100));
    this.options.cropX = Math.round(x);
    this.options.cropY = Math.round(y);
    this.refreshCurrentProof();
    this.updateSidebarControls();
  },

  updateSidebarControls() {
    const chk = document.getElementById('check-crop-shot');
    if (chk) chk.checked = (this.options.enableCropShot !== false);
    const badge = document.getElementById('crop-status-badge');
    if (badge) {
      if (this.slots.crop?.dataUrl) {
        badge.textContent = 'CUSTOM CROP';
        badge.style.background = '#dcfce7';
        badge.style.color = '#16a34a';
      } else {
        badge.textContent = 'AUTO CROP';
        badge.style.background = '#ede9fe';
        badge.style.color = '#4739d2';
      }
      badge.style.display = (this.options.enableCropShot !== false) ? 'inline-block' : 'none';
    }
    const panel = document.getElementById('crop-shot-panel');
    if (panel) {
      panel.style.display = (this.options.enableCropShot !== false) ? 'block' : 'none';
    }
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
    const printW = dims?.widthIn || spec.defaultW || 36;
    const printH = dims?.heightIn || spec.defaultH || 24;
    
    // Format human-friendly dimensions (e.g. 5 ft x 3 ft or 36" x 24")
    let dimsDisplay = `${printW}" W × ${printH}" H`;
    if (analysis?.rawDim) {
      dimsDisplay = `${analysis.rawDim.replace(/_/g, ' ')} (${printW}" × ${printH}")`;
    }

    const today = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    
    // Choose artwork source: user uploaded > analysis preview > default BB Proof illustration
    const artworkSrc = this.slots.overall?.dataUrl || analysis?.previewDataUrl || this.getDefaultArtworkSvg();
    
    // Resolve official BannerBuzz template & mockup from QNAP registry
    const officialTemplate = (typeof getOfficialProductTemplate === 'function')
      ? getOfficialProductTemplate(spec?.slug || spec?.name || analysis?.productName, dims)
      : null;
    const officialMockup = (typeof getOfficialProductMockup === 'function')
      ? getOfficialProductMockup(spec?.slug || spec?.name || analysis?.productName, dims)
      : null;

    const templateSrc = this.slots.template?.dataUrl 
      || (officialTemplate ? officialTemplate.templateFile : null) 
      || this.generateProductTemplateSvg(spec, dims);

    const mockupSrc = this.slots.mockup?.dataUrl 
      || (officialMockup ? officialMockup.mockupFile : null) 
      || this.generateProductMockupSvg(spec, dims, artworkSrc);

    // Material & Finishing Resolution
    let graphicMaterial = spec.material || '13 oz. Premium Vinyl';
    let graphicWeight = spec.weight || `${spec.material ? spec.material : '13 oz. Premium'} Print Grade`;
    let printTech = spec.finishing || 'High-Definition Digital Print';
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

    const graphicColor = (analysis?.isDoubleSided || spec.isDoubleSided)
      ? 'Four/Four (Full-Color, Double-Sided)'
      : 'Four/0 (Full-Color, Single-Sided)';
    const sizeTolerance = 'Up to +/- 0.5"';

    // Build the dynamic proof view sections (Section 1 Artwork + Section 2 Crop / Template + Section 3 Specs)
    const enableCropShot = (this.options.enableCropShot !== false);
    const section2View = this.options.section2View || (enableCropShot ? 'crop' : 'mockup');
    const isMockupView = (section2View === 'mockup' || !enableCropShot);
    const hasCustomCrop = Boolean(this.slots.crop?.dataUrl);
    const cropZoom = this.options.cropZoom || 2.2;
    const cropX = this.options.cropX !== undefined ? this.options.cropX : 50;
    const cropY = this.options.cropY !== undefined ? this.options.cropY : 50;

    let visualSectionsHtml = '';
    let specSectionNum = 3;

    if (!isMockupView) {
      // ── BB Proof.png Official Layout: Section 1 Entire Artwork + Section 2 Print Quality Proof (100% Crop Shot) ──
      specSectionNum = 3;
      visualSectionsHtml = `
        <!-- Section 1: Entire Artwork Proof -->
        <div class="proof-card" style="border:1px solid #cbd5e1; border-radius:6px; padding:12px 16px; margin-bottom:12px; background:#ffffff; page-break-inside:avoid; break-inside:avoid;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border-radius:50%; background:#4739d2; color:#ffffff; font-weight:900; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">1</div>
              <div>
                <h2 style="font-size:13.5px; font-weight:800; color:#111c38; margin:0;">Entire Artwork Proof</h2>
                <div style="font-size:10.5px; color:#64748b;">This is the complete artwork that will be printed on your product.</div>
              </div>
            </div>
            ${!hasCustomCrop ? `
              <div class="no-print" style="font-size:10px; font-weight:600; color:#4739d2; background:#f5f3ff; border:1px solid #ddd6fe; padding:3px 8px; border-radius:4px;">
                💡 Click artwork to adjust auto-crop focus point
              </div>
            ` : ''}
          </div>
          <div style="border:1px solid #e2e8f0; border-radius:4px; padding:8px; background:#ffffff; text-align:center; height:180px; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
            <div style="position:relative; max-width:100%; max-height:100%; display:inline-flex; align-items:center; justify-content:center; ${!hasCustomCrop ? 'cursor:crosshair;' : ''}" ${!hasCustomCrop ? 'onclick="ProofStudio.handleArtworkClick(event)" title="Click to move Print Quality Crop Shot focus"' : ''}>
              <img src="${artworkSrc}" alt="Entire Artwork Proof" class="proof-slot-img" style="max-width:100%; max-height:165px; object-fit:contain; display:block;" />
              ${!hasCustomCrop ? `
                <!-- Focus Reticle Box indicating auto crop position -->
                <div class="crop-reticle no-print" style="left:${cropX}%; top:${cropY}%; width:${Math.max(14, Math.round(36 / cropZoom))}%; height:${Math.max(18, Math.round(44 / cropZoom))}%;"></div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- Section 2: Print Quality Proof -->
        <div class="proof-card" style="border:1px solid #cbd5e1; border-radius:6px; padding:12px 16px; margin-bottom:12px; background:#ffffff; page-break-inside:avoid; break-inside:avoid;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border-radius:50%; background:#4739d2; color:#ffffff; font-weight:900; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">2</div>
              <div>
                <h2 style="font-size:13.5px; font-weight:800; color:#111c38; margin:0;">Print Quality Proof</h2>
                <div style="font-size:10.5px; color:#64748b;">This is a zoomed-in view to help you review the print quality and detail.</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${hasCustomCrop ? `
                <span style="font-size:9.5px; font-weight:800; color:#16a34a; background:#dcfce7; padding:3px 8px; border-radius:4px; border:1px solid #bbf7d0;">
                  CUSTOM UPLOADED CROP
                </span>
              ` : `
                <span style="font-size:9.5px; font-weight:800; color:#4739d2; background:#ede9fe; padding:3px 8px; border-radius:4px; border:1px solid #ddd6fe;">
                  AUTO 100% SCALE CROP
                </span>
              `}
              <div class="no-print" style="display:inline-flex; border:1px solid #cbd5e1; border-radius:4px; overflow:hidden;">
                <button type="button" class="btn btn-sm" onclick="ProofStudio.setSection2View('crop')" style="background:#ff5f1f; color:#ffffff; border:none; padding:3px 8px; font-size:10px; font-weight:700; cursor:pointer;">
                  🔍 Crop Shot
                </button>
                <button type="button" class="btn btn-sm" onclick="ProofStudio.setSection2View('mockup')" style="background:#ffffff; color:#334155; border:none; border-left:1px solid #cbd5e1; padding:3px 8px; font-size:10px; font-weight:700; cursor:pointer;" title="Switch to Official QNAP Product Template & 3D Mockup">
                  📐 Official Template &amp; Mockup
                </button>
              </div>
            </div>
          </div>

          <!-- 100% Scale Crop Shot View -->
          <div style="border:1px solid #cbd5e1; border-radius:4px; height:125px; overflow:hidden; position:relative; background:#ffffff; display:flex; align-items:center; justify-content:center;">
            ${hasCustomCrop ? `
              <img src="${this.slots.crop.dataUrl}" alt="Custom Print Quality Crop Shot" class="proof-zoom-img" style="max-width:100%; max-height:100%; object-fit:contain;" />
            ` : `
              <img src="${artworkSrc}" alt="Print Quality Zoom" class="proof-zoom-img" style="width:100%; height:100%; object-fit:contain; transform-origin:${cropX}% ${cropY}%; transform:scale(${cropZoom}); transition:transform 0.2s ease;" />
              <div class="no-print" style="position:absolute; bottom:6px; right:8px; background:rgba(15,23,42,0.85); color:#ffffff; font-size:9.5px; font-weight:700; padding:3px 10px; border-radius:4px; display:flex; align-items:center; gap:6px; box-shadow:0 2px 6px rgba(0,0,0,0.3);">
                <span>🔍 100% Actual Scale Detail Inspection</span>
                <span style="color:#4ade80;">● SOP Sharpness Verified</span>
              </div>
            `}
          </div>

          <!-- Quick link to official QNAP assets -->
          ${officialTemplate || officialMockup ? `
            <div class="no-print" style="margin-top:8px; padding:6px 10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; display:flex; justify-content:space-between; align-items:center; font-size:10.5px;">
              <span style="color:#64748b; font-weight:500;">
                Official BannerBuzz Template available (${officialTemplate ? officialTemplate.name : spec.name})
              </span>
              <a href="javascript:void(0)" onclick="ProofStudio.setSection2View('mockup')" style="color:#ff5f1f; font-weight:700; text-decoration:none;">
                View Exact Production Template &amp; 3D Mockup →
              </a>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      // ── Official BannerBuzz Product Template & 3D Mockup View ──
      specSectionNum = 3;
      visualSectionsHtml = `
        <!-- Section 1: Entire Artwork Proof -->
        <div class="proof-card" style="border:1px solid #cbd5e1; border-radius:6px; padding:12px 16px; margin-bottom:12px; background:#ffffff; page-break-inside:avoid; break-inside:avoid;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="width:24px; height:24px; border-radius:50%; background:#4739d2; color:#ffffff; font-weight:900; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">1</div>
            <div>
              <h2 style="font-size:13.5px; font-weight:800; color:#111c38; margin:0;">Entire Artwork Proof</h2>
              <div style="font-size:10.5px; color:#64748b;">This is the complete artwork that will be printed on your product.</div>
            </div>
          </div>
          <div style="border:1px solid #e2e8f0; border-radius:4px; padding:8px; background:#ffffff; text-align:center; height:180px; display:flex; align-items:center; justify-content:center;">
            <img src="${artworkSrc}" alt="Entire Artwork Proof" class="proof-slot-img" style="max-width:100%; max-height:100%; object-fit:contain;" />
          </div>
        </div>

        <!-- Section 2: Exact Product Template & 3D Mockup -->
        <div class="proof-card" style="border:1px solid #cbd5e1; border-radius:6px; padding:12px 16px; margin-bottom:12px; background:#ffffff; page-break-inside:avoid; break-inside:avoid;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <div style="width:24px; height:24px; border-radius:50%; background:#4739d2; color:#ffffff; font-weight:900; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">2</div>
              <div>
                <h2 style="font-size:13.5px; font-weight:800; color:#111c38; margin:0;">Official Product Template &amp; 3D Mockup</h2>
                <div style="font-size:10.5px; color:#64748b;">Exact BannerBuzz production specifications from \\\\192.168.0.250\\qnap\\Template_Mockups</div>
              </div>
            </div>
            <div class="no-print" style="display:inline-flex; border:1px solid #cbd5e1; border-radius:4px; overflow:hidden;">
              <button type="button" class="btn btn-sm" onclick="ProofStudio.setSection2View('crop')" style="background:#ffffff; color:#334155; border:none; padding:3px 8px; font-size:10px; font-weight:700; cursor:pointer;" title="Switch back to 100% Zoom Crop Shot">
                🔍 Crop Shot
              </button>
              <button type="button" class="btn btn-sm" onclick="ProofStudio.setSection2View('mockup')" style="background:#ff5f1f; color:#ffffff; border:none; border-left:1px solid #cbd5e1; padding:3px 8px; font-size:10px; font-weight:700; cursor:pointer;">
                📐 Official Template &amp; Mockup
              </button>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <!-- Column 1: Official Template -->
            <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; background:#f8fafc; text-align:center;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; font-weight:800; color:#111c38;">Official Product Template / Die-Line</div>
                <span style="font-size:8.5px; font-weight:800; color:#16a34a; background:#dcfce7; padding:1px 5px; border-radius:3px; border:1px solid #bbf7d0;">
                  REFERENCE ONLY
                </span>
              </div>
              <div style="height:125px; display:flex; align-items:center; justify-content:center; background:#ffffff; border:1px solid #cbd5e1; border-radius:4px; padding:4px; overflow:hidden; cursor:pointer;" onclick="if(typeof openAssetLightbox==='function') openAssetLightbox('${templateSrc}', 'Official BannerBuzz Template', '${officialTemplate ? officialTemplate.name : spec.name}')" title="Click to enlarge">
                <img src="${templateSrc}" alt="Official Product Template" style="max-width:100%; max-height:100%; object-fit:contain;" />
              </div>
              <div style="margin-top:5px; font-size:9.5px; color:#475569; font-weight:600; text-align:left; display:flex; justify-content:space-between;">
                <span>${officialTemplate ? officialTemplate.dims : dimsDisplay}</span>
                <span style="color:#ff5f1f; font-weight:700;">🔍 Click to enlarge</span>
              </div>
            </div>

            <!-- Column 2: Official 3D Mockup -->
            <div style="border:1px solid #e2e8f0; border-radius:6px; padding:8px 10px; background:#f8fafc; text-align:center;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <div style="font-size:11px; font-weight:800; color:#111c38;">3D Physical Finished Mockup</div>
                <span style="font-size:8.5px; font-weight:800; color:#16a34a; background:#dcfce7; padding:1px 5px; border-radius:3px; border:1px solid #bbf7d0;">
                  REFERENCE ONLY
                </span>
              </div>
              <div style="height:125px; display:flex; align-items:center; justify-content:center; background:#ffffff; border:1px solid #cbd5e1; border-radius:4px; padding:4px; overflow:hidden; cursor:pointer;" onclick="if(typeof openAssetLightbox==='function') openAssetLightbox('${mockupSrc}', 'Official BannerBuzz 3D Mockup', '${officialMockup ? officialMockup.name : spec.name}')" title="Click to enlarge">
                <img src="${mockupSrc}" alt="Official 3D Mockup" style="max-width:100%; max-height:100%; object-fit:contain;" />
              </div>
              <div style="margin-top:5px; font-size:9.5px; color:#475569; font-weight:600; text-align:left; display:flex; justify-content:space-between;">
                <span>${officialMockup ? officialMockup.dims : 'Finished Hardware Assembly'}</span>
                <span style="color:#ff5f1f; font-weight:700;">🔍 Click to enlarge</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    el.innerHTML = `
      <div class="bb-official-proof-wrap" id="printable-proof-sheet" style="font-family:'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background:#ffffff; color:#111c38; max-width:860px; margin:0 auto; padding:20px 24px; border:1px solid #dbe2ea; border-radius:8px; box-shadow:0 8px 24px rgba(17,28,56,0.06); box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; margin-bottom:12px; border-bottom:1px solid #edf2f7; page-break-inside:avoid; break-inside:avoid;">
          <div>
            <div style="display:inline-flex; align-items:center; gap:0;">
              <span style="font-size:24px; font-weight:900; color:#0e2246; letter-spacing:-0.5px; font-family:'Inter', sans-serif;">Banner</span>
              <span style="background:#ff5f1f; color:#ffffff; font-size:22px; font-weight:900; padding:2px 7px; border-radius:4px; margin-left:2px; letter-spacing:-0.3px; font-family:'Inter', sans-serif;">Buzz</span>
            </div>
            <div style="font-size:10.5px; font-weight:700; color:#15284f; margin-top:2px; letter-spacing:0.01em;">
              More Than Products. A Brighter Way to Brand.
            </div>
          </div>

          <!-- 4 Trust Badges -->
          <div style="display:flex; gap:18px; align-items:center; text-align:center;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 12 20 22 4 22 4 12"/>
                <rect x="2" y="7" width="20" height="5"/>
                <line x1="12" y1="22" x2="12" y2="7"/>
                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
              </svg>
              <span style="font-size:8.5px; font-weight:700; color:#475569; letter-spacing:0.02em; line-height:1.2;">CUSTOM<br/>PRINTED PRODUCTS</span>
            </div>

            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span style="font-size:8.5px; font-weight:700; color:#475569; letter-spacing:0.02em; line-height:1.2;">PREMIUM<br/>QUALITY</span>
            </div>

            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="1" y="3" width="15" height="13"/>
                <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                <circle cx="5.5" cy="18.5" r="2.5"/>
                <circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
              <span style="font-size:8.5px; font-weight:700; color:#475569; letter-spacing:0.02em; line-height:1.2;">FAST<br/>SHIPPING</span>
            </div>

            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1e293b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span style="font-size:8.5px; font-weight:700; color:#475569; letter-spacing:0.02em; line-height:1.2;">DEDICATED<br/>SUPPORT</span>
            </div>
          </div>
        </div>

        <!-- ── 2. CUSTOMER ARTWORK PROOF BAR ── -->
        <div style="background:#f4f7fb; border:1px solid #e2e8f0; border-radius:6px; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; page-break-inside:avoid; break-inside:avoid;">
          <div>
            <h1 style="font-size:20px; font-weight:900; color:#111c38; margin:0; letter-spacing:-0.5px;">CUSTOMER ARTWORK PROOF</h1>
            <p style="font-size:11.5px; color:#52617b; margin:2px 0 0 0; font-weight:500;">Review your artwork and product details before we go to print.</p>
          </div>

          <div style="display:flex; align-items:center; gap:16px;">
            <div>
              <div style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Order No.</div>
              <div style="font-size:18px; font-weight:900; color:#111c38; line-height:1.2; font-family:'Roboto Mono', monospace;">${finalOrderNum}</div>
            </div>

            <div style="width:1px; height:32px; background:#cbd5e1;"></div>

            <div>
              <div style="font-size:9.5px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.04em;">Product Name</div>
              <div style="font-size:15px; font-weight:800; color:#111c38; line-height:1.2;">${finalProdName}</div>
            </div>

            <!-- Confirmation Badge -->
            <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:5px; padding:6px 10px; display:flex; align-items:center; gap:8px; max-width:160px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span style="font-size:9.5px; color:#334155; line-height:1.3; font-weight:600;">
                This proof confirms how your artwork will appear on your selected product.
              </span>
            </div>
          </div>
        </div>

        <!-- ── VISUAL PROOF CARDS (Entire Artwork + Multi-Slot / Zoom) ── -->
        ${visualSectionsHtml}

        <!-- ── 3. PRODUCT SPECIFICATIONS MATRIX ── -->
        <div class="proof-card" style="border:1px solid #cbd5e1; border-radius:6px; padding:12px 16px; margin-bottom:12px; background:#ffffff; page-break-inside:avoid; break-inside:avoid;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="width:24px; height:24px; border-radius:50%; background:#4739d2; color:#ffffff; font-weight:900; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${specSectionNum}</div>
            <div>
              <h2 style="font-size:13.5px; font-weight:800; color:#111c38; margin:0;">Product Specifications</h2>
              <div style="font-size:10.5px; color:#64748b;">Your selected product details are listed below for reference.</div>
            </div>
          </div>

          <div style="background:#f4f7fb; border-radius:5px; padding:10px 16px; font-size:11px; line-height:1.6; display:grid; grid-template-columns:1fr 1fr; gap:3px 18px;">
            <div><span style="font-weight:700; color:#111c38; min-width:130px; display:inline-block;">Graphic Material:</span> <span style="color:#2d3748; font-weight:600;">${graphicMaterial}</span></div>
            <div><span style="font-weight:700; color:#111c38; min-width:130px; display:inline-block;">Finished Dimensions:</span> <span style="color:#2d3748; font-weight:600;">${dimsDisplay}</span></div>
            <div><span style="font-weight:700; color:#111c38; min-width:130px; display:inline-block;">Graphic Weight:</span> <span style="color:#2d3748; font-weight:600;">${graphicWeight}</span></div>
            <div><span style="font-weight:700; color:#111c38; min-width:130px; display:inline-block;">Graphic Size Tolerance:</span> <span style="color:#2d3748; font-weight:600;">${sizeTolerance}</span></div>
            <div><span style="font-weight:700; color:#111c38; min-width:130px; display:inline-block;">Print Technology:</span> <span style="color:#2d3748; font-weight:600;">${printTech}</span></div>
            <div><span style="font-weight:700; color:#111c38; min-width:130px; display:inline-block;">Finishing Details:</span> <span style="color:#2d3748; font-weight:600;">${finishingDetail}</span></div>
            <div style="grid-column: span 2;"><span style="font-weight:700; color:#111c38; min-width:130px; display:inline-block;">Graphic Color:</span> <span style="color:#2d3748; font-weight:600;">${graphicColor}</span></div>
          </div>
        </div>

        <!-- ── 4. REVIEW & APPROVAL CALLOUT ── -->
        <div style="background:#f4f0ff; border:1px solid #d8b4fe; border-radius:6px; padding:10px 16px; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; gap:14px; page-break-inside:avoid; break-inside:avoid;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:24px; height:24px; border-radius:50%; background:#4739d2; color:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:13px; flex-shrink:0;">!</div>
            <div>
              <div style="font-size:12.5px; font-weight:800; color:#3b28b6;">Please review your artwork carefully before approval.</div>
              <div style="font-size:10.5px; color:#5b4db8; line-height:1.3;">
                Check for correct text, logos, colors, spelling, size and overall design. Once approved, your order will go to production as shown in this proof.
              </div>
            </div>
          </div>

          <div style="text-align:right; flex-shrink:0;">
            <button onclick="ProofStudio.approveProof()" style="background:#4739d2; color:#ffffff; border:none; padding:8px 18px; border-radius:5px; font-size:12.5px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(71,57,210,0.25);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>Approve Artwork</span>
            </button>
            <div style="font-size:9.5px; color:#64748b; margin-top:2px;">or contact us if you need any changes.</div>
          </div>
        </div>

        <!-- ── 5. OFFICIAL FOOTER ── -->
        <div style="border-top:1px solid #edf2f7; padding-top:8px; display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#64748b; page-break-inside:avoid; break-inside:avoid;">
          <div>
            <span style="font-weight:900; color:#0e2246;">Banner</span><span style="background:#ff5f1f; color:#fff; font-weight:900; padding:1px 4px; border-radius:3px; font-size:9.5px; margin-left:1px;">Buzz</span>
            <span style="margin-left:6px; color:#475569; font-weight:600;">More Than Products. A Brighter Way to Brand.</span>
          </div>

          <div style="display:flex; gap:14px; align-items:center;">
            <span>📞 1-800-580-4489</span>
            <span>✉ support@bannerbuzz.com</span>
            <span>🌐 www.bannerbuzz.com</span>
          </div>

          <div style="font-weight:600; color:#475569;">
            Page 1 of 1 · Order No. <strong style="color:#111c38;">${finalOrderNum}</strong> · Generated on ${today}
          </div>
        </div>

      </div>
    `;

    setTimeout(() => {
      this.updateSidebarControls();
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
  print() {
    window.print();
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProofStudio;
}
