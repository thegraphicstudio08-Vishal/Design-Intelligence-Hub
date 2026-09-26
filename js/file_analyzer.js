/**
 * Design Intelligence Hub - Universal Artwork File Analyzer
 * Analyzes any file format (Vector: SVG, PDF, AI, EPS; Raster: JPG, PNG, WEBP, TIFF, PSD)
 * Detects Vector "Good for Print" status, Effective DPI, Measurements, Orientation, and Lines & Dots artifacts.
 */

const FileAnalyzer = {
  /**
   * Main entrypoint to inspect any file
   * @param {File} file 
   * @param {Object} targetSpec - Product SOP specification { defaultW, defaultH, resolution, safeArea, bleed }
   * @param {Object} userDims - { widthIn, heightIn, unit }
   * @returns {Promise<Object>} Analysis result
   */
  async analyze(file, targetSpec, userDims) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const sizeMB = file.size / (1024 * 1024);
    const targetW = userDims?.widthIn || targetSpec?.defaultW || 36;
    const targetH = userDims?.heightIn || targetSpec?.defaultH || 24;

    const baseResult = {
      filename: file.name,
      fileExt: ext,
      fileSizeBytes: file.size,
      fileSizeMB: +sizeMB.toFixed(2),
      isVector: false,
      isGoodForPrint: false,
      goodForPrintReason: '',
      pixelWidth: null,
      pixelHeight: null,
      effectiveDpi: null,
      requiredDpi: parseInt(targetSpec?.resolution) || 150,
      aspectRatioArtwork: null,
      aspectRatioOrder: targetW / targetH,
      aspectRatioMismatchPercent: 0,
      orientationArtwork: 'Unknown',
      orientationOrder: targetW >= targetH ? 'Landscape' : 'Portrait',
      orientationMatch: false,
      artifactsDetected: [],
      hasLinesOrDots: false,
      embeddedRasterFound: false,
      colorGamutWarning: false,
      previewDataUrl: null,
      svgPathsCount: 0,
      pdfPages: 0
    };

    // Branch by file family
    if (['svg'].includes(ext)) {
      return await this._analyzeSvg(file, baseResult, targetW, targetH);
    } else if (['pdf', 'ai'].includes(ext)) {
      return await this._analyzePdfOrAi(file, baseResult, targetW, targetH);
    } else if (['eps'].includes(ext)) {
      return await this._analyzeEps(file, baseResult, targetW, targetH);
    } else if (file.type.startsWith('image/') || ['jpg','jpeg','png','webp','tif','tiff','bmp','gif'].includes(ext)) {
      return await this._analyzeRaster(file, baseResult, targetW, targetH);
    } else {
      // Other formats (e.g. PSD, TIFF, CDR)
      return this._analyzeGeneric(file, baseResult, targetW, targetH);
    }
  },

  /**
   * Analyze SVG Vector Files
   */
  async _analyzeSvg(file, res, targetW, targetH) {
    res.isVector = true;
    res.isGoodForPrint = true;
    res.goodForPrintReason = 'Pure SVG Vector Format. Infinitely scalable with zero resolution loss. Sharp at 100% scale at any print dimension.';

    const text = await file.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');

    if (svgEl) {
      // Count vector elements
      const paths = doc.querySelectorAll('path, polygon, polyline, circle, rect, line, ellipse');
      const texts = doc.querySelectorAll('text');
      const rasterImages = doc.querySelectorAll('image');

      res.svgPathsCount = paths.length;
      res.hasText = texts.length > 0;
      res.embeddedRasterFound = rasterImages.length > 0;

      if (res.embeddedRasterFound) {
        res.isGoodForPrint = true;
        res.goodForPrintReason = 'Vector SVG Artwork with embedded raster elements. Vector curves will print razor sharp; verify embedded photo elements meet required DPI.';
      }

      // Check viewBox or width/height
      let vb = svgEl.getAttribute('viewBox');
      let w = parseFloat(svgEl.getAttribute('width'));
      let h = parseFloat(svgEl.getAttribute('height'));

      if (vb) {
        const parts = vb.trim().split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] && parts[3]) {
          res.pixelWidth = Math.round(parts[2]);
          res.pixelHeight = Math.round(parts[3]);
        }
      } else if (w && h) {
        res.pixelWidth = Math.round(w);
        res.pixelHeight = Math.round(h);
      } else {
        res.pixelWidth = 1200;
        res.pixelHeight = 800;
      }
    }

    // Convert SVG to data URL for preview and canvas inspection
    const blob = new Blob([text], { type: 'image/svg+xml' });
    res.previewDataUrl = URL.createObjectURL(blob);

    this._evaluateMeasurementsAndOrientation(res, targetW, targetH);
    return res;
  },

  /**
   * Analyze PDF or Adobe Illustrator (.AI) Files
   */
  async _analyzePdfOrAi(file, res, targetW, targetH) {
    res.isVector = true;
    res.isGoodForPrint = true;
    const isAi = res.fileExt === 'ai';
    res.goodForPrintReason = isAi
      ? 'Adobe Illustrator Vector Artwork. Scale-independent vector anchors and Bézier curves. Suitable for high-definition print production.'
      : 'Print-Ready PDF (Vector Stream). Vector objects scale infinitely without pixelation. Excellent for print production.';

    try {
      const buffer = await file.slice(0, 100000).arrayBuffer();
      const textDecoder = new TextDecoder('latin1');
      const headerStr = textDecoder.decode(buffer);

      // Search for MediaBox [llx lly urx ury] in PDF header
      const mediaBoxMatch = headerStr.match(/\/MediaBox\s*\[\s*([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s*\]/);
      if (mediaBoxMatch) {
        const [, x1, y1, x2, y2] = mediaBoxMatch.map(Number);
        const ptWidth = Math.abs(x2 - x1);
        const ptHeight = Math.abs(y2 - y1);
        // 72 points = 1 inch
        res.detectedInchesW = +(ptWidth / 72).toFixed(2);
        res.detectedInchesH = +(ptHeight / 72).toFixed(2);
        res.pixelWidth = Math.round(ptWidth * 4.16); // ~300 DPI preview representation
        res.pixelHeight = Math.round(ptHeight * 4.16);
      }

      // Check if raster images are declared inside PDF
      if (headerStr.includes('/Subtype /Image') || headerStr.includes('/DCTDecode') || headerStr.includes('/JPXDecode')) {
        res.embeddedRasterFound = true;
      }

      res.pdfPages = 1;
    } catch (e) {
      console.warn('PDF header parse exception:', e);
    }

    // No page size found → leave dimensions unknown (never assume the order size, that would fake a PASS)
    this._evaluateMeasurementsAndOrientation(res, targetW, targetH);
    res.previewDataUrl = this._generateVectorPreviewSvg(res, file.name, targetW, targetH);
    return res;
  },

  /**
   * Analyze Encapsulated PostScript (.EPS) Files
   */
  async _analyzeEps(file, res, targetW, targetH) {
    res.isVector = true;
    res.isGoodForPrint = true;
    res.goodForPrintReason = 'Encapsulated PostScript (EPS) Vector Artwork. Resolution-independent vector paths and postscript curves.';

    try {
      const slice = await file.slice(0, 8000).text();
      const bbMatch = slice.match(/%%BoundingBox:\s*([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)\s+([\d\.\-]+)/);
      if (bbMatch) {
        const [, x1, y1, x2, y2] = bbMatch.map(Number);
        const ptW = Math.abs(x2 - x1);
        const ptH = Math.abs(y2 - y1);
        res.detectedInchesW = +(ptW / 72).toFixed(2);
        res.detectedInchesH = +(ptH / 72).toFixed(2);
        res.pixelWidth = Math.round(ptW * 4.16);
        res.pixelHeight = Math.round(ptH * 4.16);
      }
    } catch (e) {
      console.warn('EPS parse exception:', e);
    }

    this._evaluateMeasurementsAndOrientation(res, targetW, targetH);
    res.previewDataUrl = this._generateVectorPreviewSvg(res, file.name, targetW, targetH);
    return res;
  },

  /**
   * Analyze Raster Images (JPG, PNG, WEBP, TIFF, BMP)
   */
  async _analyzeRaster(file, res, targetW, targetH) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        res.previewDataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          res.pixelWidth = img.naturalWidth || img.width;
          res.pixelHeight = img.naturalHeight || img.height;

          // Compute Effective DPI
          // Match short/long axes to handle rotated orientation gracefully
          const imgShortPx = Math.min(res.pixelWidth, res.pixelHeight);
          const imgLongPx = Math.max(res.pixelWidth, res.pixelHeight);
          const printShortIn = Math.min(targetW, targetH);
          const printLongIn = Math.max(targetW, targetH);

          const dpiFromShort = imgShortPx / printShortIn;
          const dpiFromLong = imgLongPx / printLongIn;
          res.effectiveDpi = Math.round(Math.min(dpiFromShort, dpiFromLong));

          // Evaluate "Good for Print" status for raster
          if (res.effectiveDpi >= res.requiredDpi) {
            res.isGoodForPrint = true;
            res.goodForPrintReason = `High-Resolution Raster (${res.effectiveDpi} DPI). Exceeds minimum required ${res.requiredDpi} DPI at ${targetW}"×${targetH}" print size. Sharp and suitable for production.`;
          } else if (res.effectiveDpi >= res.requiredDpi * 0.75) {
            res.isGoodForPrint = false;
            res.goodForPrintReason = `Borderline Resolution (${res.effectiveDpi} DPI vs ${res.requiredDpi} DPI required). May appear slightly soft under close examination.`;
          } else {
            res.isGoodForPrint = false;
            res.goodForPrintReason = `Low Resolution (${res.effectiveDpi} DPI vs ${res.requiredDpi} DPI required at ${targetW}"×${targetH}"). File is at risk of visible pixelation or blurriness.`;
          }

          FileAnalyzer._evaluateMeasurementsAndOrientation(res, targetW, targetH);
          FileAnalyzer._detectLinesAndDots(img, res);
          resolve(res);
        };
        img.onerror = () => {
          res.goodForPrintReason = 'Could not decode image pixel buffer.';
          resolve(res);
        };
        img.src = res.previewDataUrl;
      };
      reader.readAsDataURL(file);
    });
  },

  /**
   * Generic analyzer fallback
   */
  _analyzeGeneric(file, res, targetW, targetH) {
    res.goodForPrintReason = `Format .${res.fileExt.toUpperCase()} detected. Requires desktop pre-press inspection.`;
    this._evaluateMeasurementsAndOrientation(res, targetW, targetH);
    return res;
  },

  /**
   * Calculate Measurements, Aspect Ratios, and Orientation match
   */
  _evaluateMeasurementsAndOrientation(res, targetW, targetH) {
    if (!res.pixelWidth || !res.pixelHeight) return;

    res.aspectRatioArtwork = +(res.pixelWidth / res.pixelHeight).toFixed(3);
    res.aspectRatioOrder = +(targetW / targetH).toFixed(3);

    // Orientation
    if (Math.abs(res.pixelWidth - res.pixelHeight) < 10) {
      res.orientationArtwork = 'Square';
    } else {
      res.orientationArtwork = res.pixelWidth > res.pixelHeight ? 'Landscape' : 'Portrait';
    }

    res.orientationOrder = Math.abs(targetW - targetH) < 0.1
      ? 'Square'
      : targetW > targetH ? 'Landscape' : 'Portrait';

    res.orientationMatch = (res.orientationArtwork === res.orientationOrder) || (res.orientationArtwork === 'Square' && res.orientationOrder === 'Square');

    // Calculate Aspect Ratio Mismatch
    // Check both standard and rotated orientation to see if user uploaded rotated file
    const arStandardDiff = Math.abs(res.aspectRatioArtwork - res.aspectRatioOrder) / res.aspectRatioOrder;
    const rotatedOrderAr = targetH / targetW;
    const arRotatedDiff = Math.abs(res.aspectRatioArtwork - rotatedOrderAr) / rotatedOrderAr;

    const bestDiff = Math.min(arStandardDiff, arRotatedDiff);
    res.aspectRatioMismatchPercent = +(bestDiff * 100).toFixed(1);
  },

  /**
   * Canvas pixel inspection for unwanted lines, border marks, and dots
   */
  _detectLinesAndDots(img, res) {
    try {
      const canvas = document.createElement('canvas');
      const maxDim = 400; // downsample for fast client analysis
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      const w = canvas.width;
      const h = canvas.height;
      const marginPx = Math.max(2, Math.round(Math.min(w, h) * 0.04)); // 4% edge strip

      let edgeContrastCount = 0;
      let borderLineDetected = false;

      // Check Top and Bottom edge row for dark scanning line
      for (let x = 0; x < w; x++) {
        const topIdx = (marginPx * w + x) * 4;
        const botIdx = ((h - marginPx) * w + x) * 4;
        const topLuma = 0.299 * data[topIdx] + 0.587 * data[topIdx+1] + 0.114 * data[topIdx+2];
        const botLuma = 0.299 * data[botIdx] + 0.587 * data[botIdx+1] + 0.114 * data[botIdx+2];

        if (topLuma < 30 || botLuma < 30) {
          edgeContrastCount++;
        }
      }

      if (edgeContrastCount > w * 0.4) {
        borderLineDetected = true;
        res.artifactsDetected.push('Potential border line or dark scanning artifact detected along artwork edges.');
      }

      res.hasLinesOrDots = borderLineDetected;
    } catch (e) {
      // Cross-origin canvas limitation or memory
      console.warn('Canvas pixel analysis skipped:', e);
    }
  },

  /**
   * Generic / PSD / TIFF / Production file fallback analyzer
   */
  _analyzeGeneric(file, res, targetW, targetH) {
    // The browser cannot read PSD/CDR pixels — report "manual check", never an assumed resolution
    res.isVector = false;
    res.isGoodForPrint = false;
    res.goodForPrintReason = `${res.fileExt.toUpperCase()} file: pixel size cannot be read in the browser. Check image size at print size in Photoshop.`;
    res.pixelWidth = null;
    res.pixelHeight = null;
    res.effectiveDpi = null;
    res.previewDataUrl = this._generateVectorPreviewSvg(res, file.name, targetW, targetH);
    return res;
  },

  /**
   * Synthesize crisp vector preview representation for vector and PDF files
   */
  _generateVectorPreviewSvg(res, fileName, targetW, targetH) {
    const ext = (res.fileExt || 'PDF').toUpperCase();
    const cleanW = Math.max(1, parseFloat(targetW) || 36);
    const cleanH = Math.max(1, parseFloat(targetH) || 24);
    const aspect = cleanW / cleanH;

    let w, h;
    if (aspect >= 1) {
      w = 900;
      h = Math.max(20, Math.round(900 / aspect));
    } else {
      h = 800;
      w = Math.max(20, Math.round(800 * aspect));
    }

    const isAi = ext === 'AI';
    const isEps = ext === 'EPS';
    const badgeColor = isAi ? '#ea580c' : isEps ? '#7c3aed' : '#2563eb';
    const cleanName = (fileName || 'production_artwork.pdf').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const isPanoramic = aspect > 2.5;
    const isTall = aspect < 0.6;
    const titleSize = Math.max(10, Math.min(20, Math.round(Math.min(w / 28, h / 8))));
    const subSize = Math.max(9, Math.min(13, Math.round(Math.min(w / 38, h / 12))));

    let innerContent = '';
    if (isPanoramic) {
      // Horizontal panoramic banner layout
      innerContent = `
        <rect x="${w * 0.04}" y="${h * 0.15}" width="${w * 0.92}" height="${h * 0.70}" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
        <g transform="translate(${w * 0.12}, ${h * 0.5})">
          <rect x="-55" y="-14" width="110" height="28" rx="14" fill="${badgeColor}"/>
          <text x="0" y="4" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle">★ ${ext} VECTOR</text>
        </g>
        <g transform="translate(${w * 0.52}, ${h * 0.5})">
          <text x="0" y="-4" font-family="'Inter', sans-serif" font-size="${titleSize}" font-weight="700" fill="#0f172a" text-anchor="middle">${cleanName}</text>
          <text x="0" y="${titleSize + 4}" font-family="'Inter', sans-serif" font-size="${subSize}" font-weight="600" fill="#64748b" text-anchor="middle">Print Size: ${cleanW}" × ${cleanH}" · Good for Print (Infinite DPI)</text>
        </g>
      `;
    } else if (isTall) {
      // Vertical banner layout (e.g. 36" x 136")
      innerContent = `
        <rect x="${w * 0.08}" y="${h * 0.04}" width="${w * 0.84}" height="${h * 0.92}" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
        <g transform="translate(${w / 2}, ${h * 0.12})">
          <rect x="-55" y="-14" width="110" height="28" rx="14" fill="${badgeColor}"/>
          <text x="0" y="4" font-family="'Inter', sans-serif" font-size="11" font-weight="800" fill="#ffffff" text-anchor="middle">★ ${ext} VECTOR</text>
        </g>
        <g stroke="${badgeColor}" stroke-width="2" fill="none" opacity="0.8">
          <path d="M ${w * 0.25} ${h * 0.32} C ${w * 0.75} ${h * 0.38}, ${w * 0.25} ${h * 0.44}, ${w * 0.75} ${h * 0.50}"/>
          <circle cx="${w * 0.25}" cy="${h * 0.32}" r="4" fill="#ffffff" stroke="${badgeColor}" stroke-width="2"/>
          <circle cx="${w * 0.75}" cy="${h * 0.50}" r="4" fill="#ffffff" stroke="${badgeColor}" stroke-width="2"/>
        </g>
        <g transform="translate(${w / 2}, ${h * 0.65})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${titleSize}" font-weight="700" fill="#0f172a" text-anchor="middle">${cleanName}</text>
          <text x="0" y="${titleSize + 6}" font-family="'Inter', sans-serif" font-size="${subSize}" font-weight="600" fill="#64748b" text-anchor="middle">${cleanW}" × ${cleanH}"</text>
          <text x="0" y="${titleSize + subSize + 12}" font-family="'Inter', sans-serif" font-size="${Math.max(8, subSize - 1)}" font-weight="500" fill="#94a3b8" text-anchor="middle">Infinite Vector DPI</text>
        </g>
      `;
    } else {
      // Standard balanced layout
      innerContent = `
        <rect x="${w * 0.08}" y="${h * 0.10}" width="${w * 0.84}" height="${h * 0.80}" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
        <g transform="translate(${w / 2}, ${h * 0.22})">
          <rect x="-65" y="-14" width="130" height="28" rx="14" fill="${badgeColor}"/>
          <text x="0" y="4" font-family="'Inter', sans-serif" font-size="12" font-weight="800" fill="#ffffff" text-anchor="middle">★ ${ext} VECTOR</text>
        </g>
        <g stroke="${badgeColor}" stroke-width="2.5" fill="none" opacity="0.85">
          <path d="M ${w * 0.25} ${h * 0.48} C ${w * 0.35} ${h * 0.35}, ${w * 0.45} ${h * 0.60}, ${w * 0.55} ${h * 0.42} S ${w * 0.7} ${h * 0.55}, ${w * 0.75} ${h * 0.44}"/>
          <circle cx="${w * 0.25}" cy="${h * 0.48}" r="5" fill="#ffffff" stroke="${badgeColor}" stroke-width="2"/>
          <circle cx="${w * 0.55}" cy="${h * 0.42}" r="5" fill="#ffffff" stroke="${badgeColor}" stroke-width="2"/>
          <circle cx="${w * 0.75}" cy="${h * 0.44}" r="5" fill="#ffffff" stroke="${badgeColor}" stroke-width="2"/>
        </g>
        <g transform="translate(${w / 2}, ${h * 0.68})">
          <text x="0" y="0" font-family="'Inter', sans-serif" font-size="${titleSize}" font-weight="700" fill="#0f172a" text-anchor="middle">${cleanName}</text>
          <text x="0" y="${titleSize + 6}" font-family="'Inter', sans-serif" font-size="${subSize}" font-weight="600" fill="#64748b" text-anchor="middle">Print Size: ${cleanW}" × ${cleanH}" · Good for Print (Infinite DPI)</text>
        </g>
      `;
    }

    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
        <defs>
          <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff"/>
            <stop offset="100%" stop-color="#f8fafc"/>
          </linearGradient>
          <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#f1f5f9" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="${w}" height="${h}" fill="url(#bgGrad)"/>
        <rect width="${w}" height="${h}" fill="url(#grid)"/>
        ${innerContent}
      </svg>
    `);
  },

  /**
   * Parse order, product, dimensions, and finishing metadata from real BannerBuzz production file names
   * Sourced from EXAMPLE OF FILE NAME THAT WE USE FOR PRE CHECK
   * e.g. "Flag_Fabric_Gian_US2396245_2_1_qty_Personalized_Flags_5_x_3_(FT)_Personalized_Flags_Metal_Grommets_at_Left_Side_Double_Sided_(PO)_script_Front_print_file.pdf"
   * e.g. "Canvas_Bann-US2392457_1_1_qty_Canvas_Banners_2_x_3_(FT)_Metal_Grommets_(SS)_script_print_file.pdf"
   */
  parseFilename(fname) {
    if (!fname) return null;
    const clean = fname.replace(/\.[^/.]+$/, '');

    // 1. Order Number: US2396245, BS2310454, AU2396585, CA..., UK...
    const orderMatch = fname.match(/(?:PR)?(US|BS|AU|CA|UK|ORD)[\-_]?\d{6,8}/i);
    const orderNum = orderMatch ? orderMatch[0].toUpperCase() : null;

    // Quantity extraction: _1_50_qty_, _3_2_qty_, _1_1_qty_, 300_piece_, 1pc
    let qty = 1;
    const qtyMatch = clean.match(/_(\d+)_qty_/i) || clean.match(/_(\d+)_piece_/i) || clean.match(/_(\d+)pc\b/i);
    if (qtyMatch) qty = parseInt(qtyMatch[1], 10);

    // 1b. Internal production prefix: MATERIAL_Loc-ORDER_line_qty_qty_...
    // e.g. "POLYESTER_FABRIC_Atla-US2382836_3_2_qty_..." → material POLYESTER FABRIC, location Atla, line 3, qty 2
    let material = null, location = null, lineItem = null;
    const prefixMatch = clean.match(/^(.*?)[_\-]([A-Za-z]{3,5})[_\-](?:PR)?(?:US|BS|AU|CA|UK)\d{6,8}/i);
    if (prefixMatch) {
      material = prefixMatch[1].replace(/_+/g, ' ').trim();
      location = prefixMatch[2];
    }
    const lineQtyMatch = clean.match(/(?:US|BS|AU|CA|UK)\d{6,8}_(\d+)(?:\(\d+\))?_(\d+)_qty_/i);
    if (lineQtyMatch) {
      lineItem = parseInt(lineQtyMatch[1], 10);
      qty = parseInt(lineQtyMatch[2], 10);
    }
    // Designer code is the last "(XX)" token that is not a unit, e.g. (PO), (SS), (ES), (4E)
    const designerCode = [...clean.matchAll(/_\(([A-Z0-9]{1,3})\)(?=_|\s|$)/g)]
      .map(m => m[1])
      .filter(c => !/^(FT|MM|CM|IN)$/i.test(c))
      .pop() || null;
    const fileRole = /print_file/i.test(clean) ? 'Print File'
      : /cropshot|crop_shot|_cop\b|cop$/i.test(clean) ? 'Crop Shot Proof'
      : /overall/i.test(clean) ? 'Overall Proof'
      : /mockup/i.test(clean) ? 'Mockup'
      : 'Artwork';

    // 2. Extract dimensions: (FT), (MM), (Inch)
    // No size in the filename → dimensions stay null so the designer's entered order size is never overwritten.
    let rawW = null, rawH = null, widthIn = null, heightIn = null, rawDim = '', detectedUnit = 'in';

    // (FT)
    const ftMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:_Ft)?_x_(\d+(?:\.\d+)?)\s*(?:_Ft)?_\(FT\)/i) ||
                    clean.match(/(\d+(?:\.\d+)?)\s*(?:ft|feet)\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*(?:ft|feet)/i);
    if (ftMatch) {
      rawW = parseFloat(ftMatch[1]);
      rawH = parseFloat(ftMatch[2]);
      widthIn = +(rawW * 12).toFixed(2);
      heightIn = +(rawH * 12).toFixed(2);
      rawDim = `${rawW}_x_${rawH}_(FT)`;
      detectedUnit = 'ft';
    }

    // (MM)
    if (!ftMatch) {
      const mmMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:_mm)?_x_(\d+(?:\.\d+)?)\s*(?:_mm)?_\(MM\)/i) ||
                      clean.match(/(\d+(?:\.\d+)?)\s*mm\s*(?:x|by)\s*(\d+(?:\.\d+)?)\s*mm/i);
      if (mmMatch) {
        rawW = parseFloat(mmMatch[1]);
        rawH = parseFloat(mmMatch[2]);
        widthIn = +(rawW / 25.4).toFixed(2);
        heightIn = +(rawH / 25.4).toFixed(2);
        rawDim = `${rawW}_mm_x_${rawH}_mm_(MM)`;
        detectedUnit = 'mm';
      }
    }

    // (CM)  e.g. "Teardrop_Flags_-_Graphic_61_cm_x_152_cm_(CM)"
    const cmMatch = !ftMatch && clean.match(/(\d+(?:\.\d+)?)\s*(?:_cm)?_x_(\d+(?:\.\d+)?)\s*(?:_cm)?_\(CM\)/i);
    if (cmMatch) {
      rawW = parseFloat(cmMatch[1]);
      rawH = parseFloat(cmMatch[2]);
      widthIn = +(rawW / 2.54).toFixed(2);
      heightIn = +(rawH / 2.54).toFixed(2);
      rawDim = `${rawW}_cm_x_${rawH}_cm_(CM)`;
      detectedUnit = 'cm';
    }

    // (Inch)
    if (!ftMatch && !cmMatch && !clean.match(/\(MM\)/i)) {
      const inMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:_Inch)?_x_(\d+(?:\.\d+)?)\s*(?:_Inch)?_\(Inch\)/i) ||
                      // Loose "W_x_H" only for real production names (with an order number):
                      // a stray "3x5" in a customer's filename must never become the order size.
                      (orderNum && clean.match(/(\d+(?:\.\d+)?)\s*(?:_x_)\s*(\d+(?:\.\d+)?)/i));
      if (inMatch) {
        rawW = parseFloat(inMatch[1]);
        rawH = parseFloat(inMatch[2]);
        widthIn = rawW;
        heightIn = rawH;
        rawDim = `${rawW}_x_${rawH}_(Inch)`;
        detectedUnit = 'in';
      }
    }

    // 3. Product Name extraction:
    let rawProdName = null;
    const prodQtyMatch = clean.match(/_qty_(.*?)(?=_\d+(?:\.\d+)?(?:_Ft|_mm|_Inch)?_x_)/i);
    if (prodQtyMatch) {
      rawProdName = prodQtyMatch[1].replace(/^\d+_piece_/i, '');
    }

    if (!rawProdName && orderNum) {
      const orderEscaped = orderNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const orderPrefixMatch = clean.match(new RegExp('^' + orderEscaped + '_(.*?)(?=_[0-9]+(?:\\.[0-9]+)?(?:_Ft|_mm|_Inch)?_x_)', 'i'));
      if (orderPrefixMatch) {
        rawProdName = orderPrefixMatch[1].replace(/^\d+_piece_/i, '').replace(/^_qty_/i, '');
      }
    }

    if (!rawProdName) {
      const commonNames = [
        'Personalized_Flags', 'Custom_Vinyl_Banners', 'Vinyl_Banners', 'Outdoor_Banners',
        'Canvas_Banners', 'Rectangle_Flags', 'Hand_Flags', 'Feather_Flags', 'Teardrop_Flags',
        'Blade_Flags', 'Desk_Flags_Blade', 'Desk_Flags_Teardrop', 'Desk_Flags',
        'Die-Cut_Yard_Signs', 'Yard_Signs', 'Truck_Magnetic_Signs', 'Square_Business_Cards',
        'Polyester_Fabric_Banners', 'Fabric_Pop_Up_Counter_Display', 'L_Banner_Stands',
        'Poster_Paper', 'Roll_Up_Banner_Stands'
      ];
      for (const name of commonNames) {
        if (clean.toLowerCase().includes(name.toLowerCase())) {
          rawProdName = name;
          break;
        }
      }
    }

    const humanProductName = rawProdName ? rawProdName.replace(/_/g, ' ') : null;
    let slug = rawProdName ? rawProdName.toLowerCase().replace(/_/g, '-').replace(/[^\w\-]/g, '') : null;
    if (slug) {
      slug = slug.replace(/-(?:graphic|display-graphic)$/, '').replace(/-+$/, '');
    }

    // Size-based refinement: If small tabletop size (<= 10" x 25"), accurately classify flag as desk flag
    const isDeskSize = (widthIn && widthIn <= 10 && heightIn && heightIn <= 25 && heightIn > widthIn);
    if (isDeskSize) {
      if (slug === 'blade-flags' || slug === 'blade-flag' || slug === 'flags' || slug === 'flag' || !slug) {
        slug = 'desk-flags-blade';
      } else if (slug === 'teardrop-flags' || slug === 'teardrop-flag') {
        slug = 'desk-flags-teardrop';
      }
    }

    // Production alias mapping
    const PRODUCTION_ALIASES = {
      'desk-flags-blade': 'desk-flags-blade',
      'desk-flag-blade': 'desk-flags-blade',
      'desk-flags-teardrop': 'desk-flags-teardrop',
      'desk-flag-teardrop': 'desk-flags-teardrop',
      'desk-flags': 'desk-flags-blade',
      'desk-flag': 'desk-flags-blade',
      'truck-magnetic-signs': 'vehicle-magnetic-signs',
      'car-magnetic-signs': 'vehicle-magnetic-signs',
      'backpack-flags---blade': 'backpack-flags',
      'backpack-flags---rectangle': 'backpack-flags',
      'backpack-flags---u-shape': 'backpack-flags',
      'backpack-flags---teardrop': 'backpack-flags-teardrop',
      'arrow-yard-signs': 'die-cut-yard-signs',
      'magnetic-signs': 'vehicle-magnetic-signs',
      'truck-magnetic': 'vehicle-magnetic-signs',
      'car-magnets': 'vehicle-magnetic-signs',
      'poster-paper': 'vinyl-posters',
      'vinyl-posters': 'vinyl-posters',
      'vinyl-banners': 'custom-vinyl-banners',
      'l-banner-stands-graphic': 'l-banner-stands',
      'fabric-pop-up-counter-display---graphic': 'fabric-pop-up-counter-display',
      'fabric-pop-up-counter-display-graphic': 'fabric-pop-up-counter-display',
      'hand-flags-single': 'hand-flags',
      'square-business-cards': 'square-business-cards',
      'die-cut-yard-signs': 'die-cut-yard-signs',
      'yard-signs': 'yard-signs',
      'personalized-flags': 'personalized-flags',
      'rectangle-flags': 'rectangle-flags',
      'teardrop-flags': 'teardrop-flags',
      'teardrop-flag': 'teardrop-flags',
      'feather-flags': 'feather-flags',
      'feather-flag': 'feather-flags',
      'blade-flags': 'blade-flags',
      'blade-flag': 'blade-flags',
      'custom-table-covers': 'fitted-table-covers',
      'table-covers': 'fitted-table-covers',
      'table-cover': 'fitted-table-covers',
      'roll-up-banner-stands': 'roll-up-banner-stands',
      'roll-up-stands': 'roll-up-banner-stands',
      'circle-yard-signs': 'circle-yard-signs',
      'circle-stickers': 'circle-stickers',
      'canvas-banners': 'canvas-banners',
      'outdoor-banners': 'outdoor-banners',
      'custom-vinyl-banners': 'custom-vinyl-banners',
      'polyester-fabric-banners': 'polyester-fabric-banners'
    };

    let matchedSpec = null;
    let matchedSlug = null;

    if (typeof SPECS !== 'undefined') {
      const aliasTarget = slug && PRODUCTION_ALIASES[slug];
      if (aliasTarget && SPECS[aliasTarget]) {
        matchedSlug = aliasTarget;
        matchedSpec = SPECS[aliasTarget];
      } else if (slug && SPECS[slug]) {
        matchedSlug = slug;
        matchedSpec = SPECS[slug];
      } else if (slug) {
        if (SPECS[slug + 's']) {
          matchedSlug = slug + 's';
          matchedSpec = SPECS[slug + 's'];
        } else if (slug.endsWith('s') && SPECS[slug.slice(0, -1)]) {
          matchedSlug = slug.slice(0, -1);
          matchedSpec = SPECS[slug.slice(0, -1)];
        } else if (SPECS['custom-' + slug]) {
          matchedSlug = 'custom-' + slug;
          matchedSpec = SPECS['custom-' + slug];
        }
      }
    }

    // 4. Finishing details
    const finishingTokens = [];
    let grommetType = 'None';
    let pocketType = 'None';
    let stakeType = 'None';
    let edgeType = 'Clean Cut';
    let printTreatment = 'Standard Production Print';

    // Grommets
    if (/metal_grommets_at_left_side/i.test(clean)) {
      finishingTokens.push('Metal Grommets at Left Side');
      grommetType = 'Left Side Grommets (Flags)';
    } else if (/metal_grommets_with_stitched_edges/i.test(clean)) {
      finishingTokens.push('Metal Grommets with Stitched Edges');
      grommetType = 'Perimeter Metal Grommets';
      edgeType = 'Stitched Edges';
    } else if (/brass_grommets/i.test(clean)) {
      finishingTokens.push('Brass Grommets');
      grommetType = 'Brass Grommets';
    } else if (/metal_grommets/i.test(clean)) {
      finishingTokens.push('Standard Metal Grommets');
      grommetType = 'Standard Metal Grommets';
    } else if (/grommets/i.test(clean)) {
      finishingTokens.push('Grommets');
      grommetType = 'Grommets';
    }

    // Pockets / Sleeves
    if (/3_pole_pockets_at_left_side/i.test(clean)) {
      finishingTokens.push('3 Pole Pockets at Left Side');
      pocketType = '3 Pole Pockets (Left)';
    } else if (/pole_sleeve_at_left_side|pole_sleeve/i.test(clean)) {
      finishingTokens.push('Pole Sleeve at Left Side');
      pocketType = 'Pole Sleeve (Left)';
    } else if (/top_pole_pocket/i.test(clean)) {
      finishingTokens.push('Top Pole Pocket');
      pocketType = 'Top Pole Pocket (3 in)';
    } else if (/pole_pocket/i.test(clean)) {
      finishingTokens.push('Pole Pockets');
      pocketType = 'Pole Pockets';
    }

    // Stakes & Mounting
    if (/metal_stakes/i.test(clean)) {
      finishingTokens.push('Metal Stakes (H-Stakes)');
      stakeType = 'Metal Step Stakes (9-Gauge H-Stake)';
    }

    if (/adhesive_tabs/i.test(clean)) {
      finishingTokens.push('Adhesive Tabs');
    }
    if (/wind_?flaps?/i.test(clean)) {
      finishingTokens.push('Wind Flaps');
    }
    if (/die[_\-]cut/i.test(clean)) {
      finishingTokens.push('Die-Cut');
    }
    if (/white_ink/i.test(clean)) {
      finishingTokens.push(/no_white_ink/i.test(clean) ? 'No White Ink' : 'White Ink Layer');
    }

    // Edges / Finish
    if (/stitched_edges/i.test(clean) && edgeType !== 'Stitched Edges') {
      finishingTokens.push('Stitched Edges');
      edgeType = 'Stitched Edges';
    }
    if (/lamination/i.test(clean)) {
      finishingTokens.push('Protective Lamination');
      printTreatment = 'Lamination';
    }
    if (/uv_print/i.test(clean)) {
      finishingTokens.push('UV Cured Direct Print');
      printTreatment = 'UV Print';
    }
    if (/gloss_finish/i.test(clean)) {
      finishingTokens.push('14 pt Gloss Finish');
      printTreatment = 'Gloss Finish';
    }

    const hasSize = widthIn > 0 && heightIn > 0;
    // Not a production filename at all (no order number, no size, no known product) → nothing to apply.
    if (!orderNum && !hasSize && !matchedSpec) return null;

    // Sides
    let side = 'Single-Sided';
    const isDoubleSided = /double_sided|front_and_back/i.test(clean);
    if (isDoubleSided) side = 'Double-Sided';
    const isFrontSide = /script_front|front_print/i.test(clean);
    const isBackSide = /script_back|back_print/i.test(clean);
    if (isFrontSide) side += ' (Front File)';
    else if (isBackSide) side += ' (Back File)';

    return {
      fname,
      orderNum,
      qty,
      lineItem,
      material,
      location,
      designerCode,
      fileRole,
      hasSize,
      productName: humanProductName || (matchedSpec ? matchedSpec.name : null),
      productSlug: matchedSlug || slug,
      spec: matchedSpec,
      rawDim,
      rawW,
      rawH,
      widthIn,
      heightIn,
      detectedUnit,
      finishing: finishingTokens.length > 0 ? finishingTokens.join(' · ') : 'Standard Production Finishing',
      finishingDetails: {
        grommets: grommetType,
        pockets: pocketType,
        stakes: stakeType,
        edges: edgeType,
        treatment: printTreatment,
        side
      },
      side,
      isDoubleSided,
      isFrontSide,
      isBackSide,
      hasGrommets: grommetType !== 'None' || /grommet/i.test(clean),
      hasPolePockets: pocketType !== 'None' || /pole_pocket|pole_sleeve/i.test(clean),
      isProof: /script_overall|crop|mockup|render/i.test(clean)
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileAnalyzer;
}
