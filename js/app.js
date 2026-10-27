/**
 * Design Intelligence Hub - Application Controller
 * Coordinates File Upload, SOP Pre-Check, Visual Inspector, Previous Orders, and Proof Studio.
 */

// Application State
const appState = {
  currentTab: 'precheck',
  file: null,
  analysis: null,
  product: null,
  category: null,
  userDims: { widthIn: 36, heightIn: 24, unit: 'in' },
  overrides: {},
  report: null,
  previousOrders: [],
  customerName: '',
  orderNum: '',
  designerNotes: '',
  messageToCustomer: '',
  history: []
};

// ── Global Upload and Drag-Drop Handlers ──
function triggerArtworkUpload() {
  const fileInput = document.getElementById('file-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}
window.triggerArtworkUpload = triggerArtworkUpload;

function handleDragOver(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const dropZone = document.getElementById('upload-zone');
  if (dropZone) dropZone.classList.add('drag-over');
}
window.handleDragOver = handleDragOver;

function handleDragLeave(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const dropZone = document.getElementById('upload-zone');
  if (dropZone) dropZone.classList.remove('drag-over');
}
window.handleDragLeave = handleDragLeave;

function handleDrop(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const dropZone = document.getElementById('upload-zone');
  if (dropZone) dropZone.classList.remove('drag-over');
  if (e && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
}
window.handleDrop = handleDrop;

function onFileInputChange(e) {
  if (e && e.target && e.target.files && e.target.files.length) {
    handleFile(e.target.files[0]);
  }
}
window.onFileInputChange = onFileInputChange;

// ── Application Initialization (Runs immediately if DOM is ready, or on DOMContentLoaded) ──
function initApp() {
  initCategories();
  initProofProductDropdown();
  setupEventListeners();
  if (typeof CanvasInspector !== 'undefined' && CanvasInspector.init) {
    CanvasInspector.init('artwork-canvas');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/**
 * Initialize Category and Product Dropdowns
 */
function initCategories() {
  const catSel = document.getElementById('cat-select');
  if (!catSel) return;

  catSel.innerHTML = '<option value="">— Select Category —</option>';
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = cat.label;
    catSel.appendChild(opt);
  });
}

function onCategoryChange() {
  const catKey = document.getElementById('cat-select').value;
  const prodRow = document.getElementById('product-row');
  const prodSel = document.getElementById('product-select');
  prodSel.innerHTML = '<option value="">— Select Product —</option>';

  if (!catKey || !CATEGORIES[catKey]) {
    prodRow.style.display = 'none';
    appState.category = null;
    appState.product = null;
    hideSpecBox();
    updateRunButtonState();
    return;
  }

  appState.category = catKey;
  const prods = CATEGORIES[catKey].products;
  Object.entries(prods).forEach(([slug, pr]) => {
    const opt = document.createElement('option');
    opt.value = slug;
    opt.textContent = pr.name;
    prodSel.appendChild(opt);
  });

  prodRow.style.display = 'block';
  updateRunButtonState();
}

function onProductChange() {
  const slug = document.getElementById('product-select').value;
  const catKey = appState.category || (document.getElementById('cat-select') ? document.getElementById('cat-select').value : null);
  const spec = (catKey && CATEGORIES[catKey]?.products?.[slug]) || SPECS[slug];
  if (!slug || !spec) {
    appState.product = null;
    hideSpecBox();
    updateRunButtonState();
    return;
  }

  appState.product = spec;

  // Sync Proof Studio product dropdown
  const proofProdSel = document.getElementById('proof-product-select');
  if (proofProdSel && proofProdSel.value !== slug) {
    proofProdSel.value = slug;
  }

  // Set default dimensions only if no custom dimensions exist
  const wInput = document.getElementById('print-w');
  const hInput = document.getElementById('print-h');
  if (wInput && hInput && (!wInput.value || parseFloat(wInput.value) === 0) && (!appState.userDims || !appState.userDims.widthIn)) {
    wInput.value = spec.defaultW;
    hInput.value = spec.defaultH;
    appState.userDims = {
      widthIn: spec.defaultW,
      heightIn: spec.defaultH,
      unit: 'in'
    };
  }

  // Sync Proof Studio dimension inputs
  const proofW = document.getElementById('proof-w');
  const proofH = document.getElementById('proof-h');
  if (proofW && appState.userDims?.widthIn) proofW.value = appState.userDims.widthIn;
  if (proofH && appState.userDims?.heightIn) proofH.value = appState.userDims.heightIn;

  // Auto-update Proof Studio Slots 2 (Template) & 3 (Mockup) if not custom user upload
  if (typeof getOfficialProductTemplate === 'function') {
    const offT = getOfficialProductTemplate(spec.slug, appState.userDims);
    const offM = (typeof getOfficialProductMockup === 'function')
      ? getOfficialProductMockup(spec.slug, appState.userDims)
      : null;

    if (offT && (!ProofStudio.slots.template || !ProofStudio.slots.template.isCustom)) {
      ProofStudio.setSlot('template', offT.templateFile, offT.name);
      const cardEl = document.getElementById('prev-template');
      const dropEl = document.getElementById('drop-template');
      const imgEl = document.getElementById('prev-img-template');
      const nameEl = document.getElementById('prev-name-template');
      if (imgEl) imgEl.src = offT.templateFile;
      if (nameEl) nameEl.textContent = `${offT.name} (Official Template)`;
      if (cardEl) cardEl.style.display = 'flex';
      if (dropEl) dropEl.style.display = 'none';
    }

    if (offM && (!ProofStudio.slots.mockup || !ProofStudio.slots.mockup.isCustom)) {
      ProofStudio.setSlot('mockup', offM.mockupFile, offM.name);
      const cardEl = document.getElementById('prev-mockup');
      const dropEl = document.getElementById('drop-mockup');
      const imgEl = document.getElementById('prev-img-mockup');
      const nameEl = document.getElementById('prev-name-mockup');
      if (imgEl) imgEl.src = offM.mockupFile;
      if (nameEl) nameEl.textContent = `${offM.name} (Official 3D Mockup)`;
      if (cardEl) cardEl.style.display = 'flex';
      if (dropEl) dropEl.style.display = 'none';
    }
  }

  renderSpecBox(spec);
  updateRunButtonState();
  updateBreadcrumbs();

  // If canvas is visible in the DOM, immediately update the product template shape
  if (document.getElementById('artwork-canvas')) {
    CanvasInspector.renderArtwork(
      appState.analysis?.previewDataUrl || appState.previewDataUrl,
      appState.product,
      appState.userDims
    );
  }

  // If proof view is active, refresh proof output
  if (document.getElementById('proof-output')?.style.display === 'block') {
    generateProofView();
  }
}

function renderSpecBox(spec) {
  const box = document.getElementById('spec-box');
  if (!box) return;

  // Values come from the SOP rules for this exact order (size + finishing); catalog values only as fallback
  const req = (typeof SopRules !== 'undefined')
    ? SopRules.requirements(spec, appState.userDims, Object.assign({}, appState.parsedFilename || {}, {
        finishing: appState.parsedFilename?.finishing || appState.finishingDetailsSummary || ''
      }))
    : null;
  const resTxt = req ? `${req.resolution.target} ppi (min ${req.resolution.min})` : spec.resolution;
  const safeTxt = req && req.safeArea.inches != null ? `${req.safeArea.inches}"${req.safeArea.confirmed ? '' : ' (catalog)'}` : spec.safeArea;
  const canvasTxt = req && req.canvas
    ? `${req.canvas.wIn}" × ${req.canvas.hIn}"${req.canvas.confirmed ? '' : ' + template'}`
    : spec.bleed;

  box.innerHTML = `
    <div class="spec-grid">
      <div class="spec-item">
        <span class="spec-label">SOP Resolution</span>
        <span class="spec-value" title="${req ? req.resolution.source.replace(/"/g, '') : ''}">${resTxt}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Safe Zone</span>
        <span class="spec-value" title="${req ? req.safeArea.source.replace(/"/g, '') : ''}">${safeTxt}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">${req ? 'Print Canvas' : 'Bleed Margin'}</span>
        <span class="spec-value" title="${req && req.canvas ? req.canvas.note.replace(/"/g, '') : ''}">${canvasTxt}</span>
      </div>
      <div class="spec-item">
        <span class="spec-label">Min Font Size</span>
        <span class="spec-value">${spec.minFont}</span>
      </div>
    </div>
    <div style="margin-top:8px; font-size:11px; color:#8b4513; border-top:1px dashed var(--bb-orange-mid); padding-top:6px;">
      <strong>Material:</strong> ${spec.material} · ${req && req.family === 'banner' && req.canvas ? 'Finishing: ' + req.canvas.note.replace(/"/g, '&quot;') + ' · grommets 1&quot; inside the finished edge (SOP table)' : spec.finishing}
    </div>
  `;
  box.classList.add('visible');
}

function hideSpecBox() {
  const box = document.getElementById('spec-box');
  if (box) box.classList.remove('visible');
}

/**
 * Handle Dimension Unit Changes
 */
function onUnitChange() {
  const unit = document.getElementById('dim-unit').value;
  const wEl = document.getElementById('print-w');
  const hEl = document.getElementById('print-h');
  let w = parseFloat(wEl.value) || 36;
  let h = parseFloat(hEl.value) || 24;

  // Convert to Inches for storage
  if (unit === 'ft') {
    appState.userDims.widthIn = w * 12;
    appState.userDims.heightIn = h * 12;
  } else if (unit === 'cm') {
    appState.userDims.widthIn = w / 2.54;
    appState.userDims.heightIn = h / 2.54;
  } else if (unit === 'mm') {
    appState.userDims.widthIn = w / 25.4;
    appState.userDims.heightIn = h / 25.4;
  } else {
    appState.userDims.widthIn = w;
    appState.userDims.heightIn = h;
  }
}

/**
 * The ordered size decides orientation, canvas, safe area and grommets: when the designer changes it after
 * the artwork is loaded, the pre-check runs again (once typing pauses) so nothing shows the old size.
 * Runs only when the size really changed — runPreCheck() itself calls onDimensionInput().
 */
function scheduleRecheckAfterSizeChange(before) {
  setTimeout(() => {   // after onDimensionInput has stored the new size
    const after = [appState.userDims && appState.userDims.widthIn, appState.userDims && appState.userDims.heightIn].join('x');
    if (after === before) return;
    clearTimeout(scheduleRecheckAfterSizeChange._timer);
    if (!appState.file || !appState.product || !appState.report) return;
    scheduleRecheckAfterSizeChange._timer = setTimeout(() => runPreCheck(), 700);
  }, 0);
}

/**
 * One-line SOP requirement for the filename banner (resolution, safe area, production canvas)
 */
function sopSummaryText(spec, parsed) {
  if (typeof SopRules === 'undefined') {
    return `SOP Requirement: ${spec.resolution} · Safe Area: ${spec.safeArea} · Bleed: ${spec.bleed}`;
  }
  const dims = parsed?.hasSize ? { widthIn: parsed.widthIn, heightIn: parsed.heightIn } : appState.userDims;
  const req = SopRules.requirements(spec, dims, parsed);
  const safe = req.safeArea.inches != null ? `${req.safeArea.inches}"${req.safeArea.confirmed ? '' : ' (catalog)'}` : 'per template';
  const canvas = req.canvas
    ? (req.canvas.confirmed ? `${req.canvas.wIn}" × ${req.canvas.hIn}" (${req.canvas.note})` : `${req.canvas.wIn}" × ${req.canvas.hIn}" + template allowance`)
    : '—';
  return `SOP: ${req.resolution.target} ppi (min ${req.resolution.min}) · Safe area ${safe} · Print canvas ${canvas}`;
}

function onDimensionInput() {
  const w = parseFloat(document.getElementById('print-w').value) || 36;
  const h = parseFloat(document.getElementById('print-h').value) || 24;
  const unit = document.getElementById('dim-unit').value;
  if (!appState.userDims) appState.userDims = { unit: 'in' };
  const before = [appState.userDims.widthIn, appState.userDims.heightIn].join('x');
  scheduleRecheckAfterSizeChange(before);

  if (unit === 'ft') {
    appState.userDims.widthIn = +(w * 12).toFixed(2);
    appState.userDims.heightIn = +(h * 12).toFixed(2);
  } else if (unit === 'cm') {
    appState.userDims.widthIn = +(w / 2.54).toFixed(2);
    appState.userDims.heightIn = +(h / 2.54).toFixed(2);
  } else if (unit === 'mm') {
    appState.userDims.widthIn = +(w / 25.4).toFixed(2);
    appState.userDims.heightIn = +(h / 25.4).toFixed(2);
  } else {
    appState.userDims.widthIn = w;
    appState.userDims.heightIn = h;
  }
}

/**
 * Setup File Drag & Drop and Event Handlers
 */
function setupEventListeners() {
  const dropZone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', (e) => {
      // Prevent double trigger if clicked directly
      triggerArtworkUpload();
    });
    dropZone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        triggerArtworkUpload();
      }
    });
    dropZone.addEventListener('dragover', (e) => {
      handleDragOver(e);
    });
    dropZone.addEventListener('dragleave', (e) => {
      handleDragLeave(e);
    });
    dropZone.addEventListener('drop', (e) => {
      handleDrop(e);
    });
    fileInput.addEventListener('change', (e) => {
      onFileInputChange(e);
    });
  }

  // Proof Studio slots: drag & drop onto the whole slot, also when it already shows a proof (replace it)
  ['overall', 'template', 'mockup', 'crop'].forEach(key => {
    const box = document.getElementById(`drop-${key}`);
    const zone = (box && box.closest('.proof-slot')) || box;
    if (!zone) return;
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length) handleProofSlotFile(key, { target: { files: e.dataTransfer.files } });
    });
  });

  // Inputs for order info
  const ordInput = document.getElementById('order-num');
  if (ordInput) ordInput.addEventListener('input', (e) => {
    appState.orderNum = e.target.value;
    updateBreadcrumbs();
  });

  const custInput = document.getElementById('customer-name');
  if (custInput) custInput.addEventListener('input', (e) => {
    appState.customerName = e.target.value;
  });
}

/**
 * BannerBuzz SOP Slide 26 Auto-Orientation Rule:
 * "Admin order size: Vertical orientation & Customer artwork: horizontal orientation ->
 * We will change the orientation on the admin and make the file horizontal orientation after the customer's approval."
 * Automatically aligns width/height inputs and appState when orientation mismatch is detected.
 */
function checkAndApplyAutoOrientation(artW, artH) {
  // The order size is what the customer bought — it is never changed automatically.
  // SOP 1_Banners slide 26: an orientation change is made on admin only after the customer approves
  // a mockup. A mismatch is shown here and judged by the Orientation check of the pre-check report.
  // Shown under the upload (always visible), not inside the filename banner — that banner is hidden when the
  // file does not have a BannerBuzz production filename, and the order details are folded away
  const old = document.getElementById('fn-orient-badge');
  // only against a real order size (from the file name or typed in), not the empty form's default
  const wIn = document.getElementById('print-w'), hIn = document.getElementById('print-h');
  const sizeGiven = !wIn || !hIn || (wIn.value && hIn.value);
  if (!artW || !artH || !appState.userDims || !sizeGiven) { if (old) old.remove(); return false; }
  const curW = appState.userDims.widthIn || 0;
  const curH = appState.userDims.heightIn || 0;
  const isArtLandscape = artW > artH * 1.05, isArtPortrait = artH > artW * 1.05;
  const isOrderLandscape = curW > curH * 1.05, isOrderPortrait = curH > curW * 1.05;
  const mismatch = (isArtLandscape && isOrderPortrait) || (isArtPortrait && isOrderLandscape);
  if (!mismatch) { if (old) old.remove(); return false; }
  const host = document.getElementById('fn-orient-host') || (document.querySelector('.dim-input-group') || {}).parentElement;
  if (host) {
    let badge = old;
    if (!badge || badge.parentElement !== host) {
      if (badge) badge.remove();
      badge = document.createElement('div');
      badge.id = 'fn-orient-badge';
      host.appendChild(badge);
    }
    badge.style.cssText = 'margin-top:8px; background:#fffbeb; border:1px solid #f59e0b; border-left:4px solid #d97706; border-radius:6px; padding:7px 10px; font-size:11.5px; color:#92400e; font-weight:700; display:flex; align-items:flex-start; gap:6px; line-height:1.4;';
    const fmt = v => +(+v).toFixed(2);
    badge.innerHTML = `<span>⚠️</span> <span>Orientation mismatch: artwork is <u>${isArtLandscape ? 'landscape' : 'portrait'}</u>, ordered size is <u>${isOrderLandscape ? 'landscape' : 'portrait'}</u> (${fmt(curW)}&quot; W × ${fmt(curH)}&quot; H). Order size kept — compare with <b>↻ Rotate Artwork</b> or <b>⤾ Rotate Artboard</b> on the canvas (see the Orientation check).</span>`;
  }
  return false;
}

/**
 * Handle Uploaded File
 */
function handleFile(file) {
  // This phase reads JPG, PNG and PDF: customer artwork, and the designer's PDF design file
  const fileExt = (file.name.split('.').pop() || '').toLowerCase();
  if (!['jpg', 'jpeg', 'png', 'pdf'].includes(fileExt)) {
    alert(`"${file.name}" is a .${fileExt.toUpperCase()} file. OPS-Intel reads JPG, PNG and PDF files in this phase — save the artwork as PDF (or JPG / PNG) and upload it again.`);
    return;
  }
  appState.file = file;
  const ext = (file.name.split('.').pop() || '').toUpperCase();
  const sizeKB = (file.size / 1024).toFixed(1);

  // 1. Filename metadata parser FIRST
  const parsed = FileAnalyzer.parseFilename(file.name);
  appState.parsedFilename = parsed;
  const banner = document.getElementById('fn-banner');

  if (parsed) {
    applyParsedMetadata(parsed);

    const spec = parsed.spec || (parsed.productSlug && SPECS[parsed.productSlug]);
    if (banner && spec) {
      banner.innerHTML = `
        <div style="font-weight:800; font-size:12px; margin-bottom:6px; color:#c2410c; display:flex; align-items:center; gap:6px;">
          <span>⚡</span> <span>BannerBuzz Production Filename Auto-Identified</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 10px; font-size:11.5px; background:#fff; padding:10px; border-radius:6px; border:1px solid #fed7aa;">
          <div><span style="color:#64748b;">Product Name:</span> <strong style="color:#111c38;">${parsed.productName}</strong></div>
          <div><span style="color:#64748b;">Order No:</span> <strong style="color:#111c38;">${parsed.orderNum || 'N/A'}</strong></div>
          <div><span style="color:#64748b;">Parsed Size:</span> <strong style="color:#111c38;">${parsed.hasSize ? `${parsed.rawDim} (${parsed.widthIn}" × ${parsed.heightIn}")` : 'Not in filename — using entered size'}</strong></div>
          <div><span style="color:#64748b;">Side:</span> <strong style="color:#111c38;">${parsed.side}</strong></div>
          <div><span style="color:#64748b;">Material:</span> <strong style="color:#111c38;">${parsed.material || '—'}${parsed.location ? ' · ' + parsed.location : ''}</strong></div>
          <div><span style="color:#64748b;">Line / Qty:</span> <strong style="color:#111c38;">${parsed.lineItem || '—'} / ${parsed.qty}${parsed.designerCode ? ' · (' + parsed.designerCode + ')' : ''}</strong></div>
          <div style="grid-column:span 2;"><span style="color:#64748b;">Finishing Details:</span> <strong style="color:#111c38;">${parsed.finishing}</strong></div>
          <div style="grid-column:span 2; color:#1d4ed8; font-weight:700; background:#eff6ff; padding:4px 8px; border-radius:4px; margin-top:2px;">
            ${sopSummaryText(spec, parsed)}
          </div>
        </div>
      `;
      banner.classList.add('show');
    }

    const proofNote = document.getElementById('fn-proof-note');
    if (proofNote) proofNote.classList.toggle('show', !!parsed.isProof);
  }

  // 2. Update preview card and artwork
  const previewCard = document.getElementById('preview-card');
  const previewName = document.getElementById('preview-name');
  const previewSize = document.getElementById('preview-size');
  const previewImg = document.getElementById('preview-img');

  if (previewCard) {
    if (previewName) previewName.textContent = file.name;
    if (previewSize) previewSize.textContent = `${sizeKB} KB · ${file.type || ext}`;

    if (file.type.startsWith('image/') || ext === 'SVG') {
      const r = new FileReader();
      r.onload = (e) => {
        if (previewImg) previewImg.src = e.target.result;
        appState.previewDataUrl = e.target.result;
        if (!ProofStudio.slots.overall || !ProofStudio.slots.overall.isCustom) {
          ProofStudio.setSlot('overall', e.target.result, file.name);
          const prevImg = document.getElementById('prev-img-overall');
          const prevName = document.getElementById('prev-name-overall');
          const prevCard = document.getElementById('prev-overall');
          const dropZone = document.getElementById('drop-overall');
          if (prevImg) prevImg.src = e.target.result;
          if (prevName) prevName.textContent = file.name;
          if (prevCard) prevCard.style.display = 'flex';
          if (dropZone) dropZone.style.display = 'none';
        }

        const img = new Image();
        img.onload = () => {
          checkAndApplyAutoOrientation(img.naturalWidth, img.naturalHeight);
          if (document.getElementById('artwork-canvas') && appState.product) {
            CanvasInspector.renderArtwork(e.target.result, appState.product, appState.userDims);
          }
          if (appState.product) {
            runPreCheck();
          } else if (typeof AgenticAiInspector !== 'undefined') {
            // No product chosen yet: spelling (and stray marks) do not depend on it — start reading the
            // artwork now, so the spelling alert appears straight away; the pre-check reuses this result
            AgenticAiInspector.scanArtwork(null, img, null, null, { early: true });
          }
        };
        img.onerror = () => {
          if (document.getElementById('artwork-canvas') && appState.product) {
            CanvasInspector.renderArtwork(e.target.result, appState.product, appState.userDims);
          }
          if (appState.product) {
            runPreCheck();
          }
        };
        img.src = e.target.result;
      };
      r.readAsDataURL(file);
    } else {
      // Vector or PDF file preview SVG using parsed dimensions
      const previewSvg = FileAnalyzer._generateVectorPreviewSvg(
        { fileExt: ext },
        file.name,
        appState.userDims?.widthIn || 36,
        appState.userDims?.heightIn || 24
      );
      if (previewImg) previewImg.src = previewSvg;
      appState.previewDataUrl = previewSvg;
      if (!ProofStudio.slots.overall || !ProofStudio.slots.overall.isCustom) {
        ProofStudio.setSlot('overall', previewSvg, file.name);
        const prevImg = document.getElementById('prev-img-overall');
        const prevName = document.getElementById('prev-name-overall');
        const prevCard = document.getElementById('prev-overall');
        const dropZone = document.getElementById('drop-overall');
        if (prevImg) prevImg.src = previewSvg;
        if (prevName) prevName.textContent = file.name;
        if (prevCard) prevCard.style.display = 'flex';
        if (dropZone) dropZone.style.display = 'none';
      }
      if (document.getElementById('artwork-canvas') && appState.product) {
        CanvasInspector.renderArtwork(previewSvg, appState.product, appState.userDims);
      }
      if (appState.product) {
        runPreCheck();
      }
    }
    previewCard.classList.add('show');
  }

  updateRunButtonState();
}

/**
 * Automatically synchronize Order Info, Product Selection, Exact Dimensions, Unit,
 * Finishing Options, and Proof Studio Slots from parsed production filename metadata
 */
function applyParsedMetadata(parsed) {
  if (!parsed) return;

  // 1. Order Number
  if (parsed.orderNum) {
    const ordInput = document.getElementById('order-num');
    if (ordInput) ordInput.value = parsed.orderNum;
    const proofOrd = document.getElementById('proof-order-num');
    if (proofOrd) proofOrd.value = parsed.orderNum;
    appState.orderNum = parsed.orderNum;
    updateBreadcrumbs();
  }

  // 2. Exact Dimensions & Unit Synchronization (SET BEFORE onProductChange to avoid default overwrite)
  // Only when the filename really carries a size — otherwise keep the order size the designer entered.
  if (parsed.hasSize) {
    const unit = parsed.detectedUnit || 'in';
    const uSel = document.getElementById('dim-unit');
    if (uSel) uSel.value = unit;

    const wInput = document.getElementById('print-w');
    const hInput = document.getElementById('print-h');
    const proofW = document.getElementById('proof-w');
    const proofH = document.getElementById('proof-h');

    const displayW = parsed.rawW != null ? parsed.rawW : parsed.widthIn;
    const displayH = parsed.rawH != null ? parsed.rawH : parsed.heightIn;

    if (wInput) wInput.value = displayW;
    if (hInput) hInput.value = displayH;
    if (proofW) proofW.value = parsed.widthIn;
    if (proofH) proofH.value = parsed.heightIn;

    appState.userDims = {
      widthIn: parsed.widthIn,
      heightIn: parsed.heightIn,
      unit: unit,
      rawW: displayW,
      rawH: displayH
    };
  }

  // 3. Category & Product Selection
  const spec = parsed.spec || (parsed.productSlug && SPECS[parsed.productSlug]);
  if (spec) {
    appState.product = spec;
    const catSel = document.getElementById('cat-select');
    if (catSel && spec._catKey) {
      catSel.value = spec._catKey;
      onCategoryChange();
    }
    const prodSel = document.getElementById('product-select');
    if (prodSel) {
      prodSel.value = spec.slug || parsed.productSlug;
      onProductChange();
    }
    const proofProdSel = document.getElementById('proof-product-select');
    if (proofProdSel) proofProdSel.value = spec.slug || parsed.productSlug;
  }

  // 4. Finishing Options Synchronization
  if (parsed.finishingDetails) {
    const fd = parsed.finishingDetails;
    const gSel = document.getElementById('finishing-grommets');
    const pSel = document.getElementById('finishing-pockets');
    const eSel = document.getElementById('finishing-edges');
    const sSel = document.getElementById('finishing-sides');
    const badge = document.getElementById('finishing-detected-badge');

    if (gSel && fd.grommets) gSel.value = fd.grommets;
    if (pSel && fd.pockets) pSel.value = fd.pockets;
    if (eSel) {
      if (fd.stakes && fd.stakes !== 'None') {
        eSel.value = fd.stakes;
      } else if (fd.edges) {
        eSel.value = fd.edges;
      }
    }
    if (sSel && fd.side) sSel.value = fd.side;
    if (badge) badge.style.display = 'inline-block';

    appState.finishingDetails = fd;
    appState.finishingDetailsSummary = parsed.finishing || '';
  }

  // 5. Proof Studio Slots 2 & 3 Auto-population with Real QNAP Assets
  if (typeof getOfficialProductTemplate === 'function') {
    const activeSpec = spec || appState.product;
    const officialTemplate = getOfficialProductTemplate(activeSpec?.slug || activeSpec?.name, appState.userDims);
    const officialMockup = (typeof getOfficialProductMockup === 'function')
      ? getOfficialProductMockup(activeSpec?.slug || activeSpec?.name, appState.userDims)
      : null;

    if (officialTemplate && officialTemplate.templateFile && (!ProofStudio.slots.template || !ProofStudio.slots.template.isCustom)) {
      ProofStudio.setSlot('template', officialTemplate.templateFile, officialTemplate.name);
      const cardEl = document.getElementById('prev-template');
      const dropEl = document.getElementById('drop-template');
      const imgEl = document.getElementById('prev-img-template');
      const nameEl = document.getElementById('prev-name-template');
      if (imgEl) imgEl.src = officialTemplate.templateFile;
      if (nameEl) nameEl.textContent = `${officialTemplate.name} (Official Template)`;
      if (cardEl) cardEl.style.display = 'flex';
      if (dropEl) dropEl.style.display = 'none';
    }

    if (officialMockup && officialMockup.mockupFile && (!ProofStudio.slots.mockup || !ProofStudio.slots.mockup.isCustom)) {
      ProofStudio.setSlot('mockup', officialMockup.mockupFile, officialMockup.name);
      const cardEl = document.getElementById('prev-mockup');
      const dropEl = document.getElementById('drop-mockup');
      const imgEl = document.getElementById('prev-img-mockup');
      const nameEl = document.getElementById('prev-name-mockup');
      if (imgEl) imgEl.src = officialMockup.mockupFile;
      if (nameEl) nameEl.textContent = `${officialMockup.name} (Official 3D Mockup)`;
      if (cardEl) cardEl.style.display = 'flex';
      if (dropEl) dropEl.style.display = 'none';
    }
  }

  // 6. Re-render Canvas Inspector if canvas exists
  if (document.getElementById('artwork-canvas') && appState.product) {
    CanvasInspector.renderArtwork(
      appState.analysis?.previewDataUrl || appState.previewDataUrl,
      appState.product,
      appState.userDims
    );
  }
}

/**
 * Handle manual or auto changes to Finishing dropdowns
 */
function onFinishingOptionChange() {
  const gVal = document.getElementById('finishing-grommets')?.value || 'None';
  const pVal = document.getElementById('finishing-pockets')?.value || 'None';
  const eVal = document.getElementById('finishing-edges')?.value || 'Clean Cut';
  const sVal = document.getElementById('finishing-sides')?.value || 'Single-Sided';

  const parts = [];
  if (sVal) parts.push(sVal);
  if (gVal && gVal !== 'None') parts.push(gVal);
  if (pVal && pVal !== 'None') parts.push(pVal);
  if (eVal && eVal !== 'Clean Cut') parts.push(eVal);

  const summary = parts.length > 0 ? parts.join(' · ') : 'Standard Trim & Finishing';

  appState.finishingDetails = {
    grommets: gVal,
    pockets: pVal,
    edges: eVal,
    side: sVal,
    summary: summary
  };
  appState.finishingDetailsSummary = summary;

  if (appState.parsedFilename) {
    appState.parsedFilename.finishing = summary;
    appState.parsedFilename.side = sVal;
  }

  // If proof view is active in DOM, re-render proof with updated finishing
  if (document.getElementById('proof-output')?.style.display === 'block') {
    generateProofView();
  }
}

/**
 * Interactive Real Production File Loader
 * Supports all 30 real files from EXAMPLE OF FILE NAME THAT WE USE FOR PRE CHECK
 */
function loadExampleFilename(fname) {
  if (!fname) return;

  const parsed = FileAnalyzer.parseFilename(fname);
  if (!parsed) return;

  // Apply all parsed order info, product, unit, dimensions, and finishing options
  applyParsedMetadata(parsed);

  const spec = parsed.spec || (parsed.productSlug && SPECS[parsed.productSlug]);

  // 4. Update preview card
  const previewCard = document.getElementById('preview-card');
  const previewName = document.getElementById('preview-name');
  const previewSize = document.getElementById('preview-size');
  const previewImg = document.getElementById('preview-img');

  if (previewCard && previewName) {
    previewName.textContent = fname;
    previewSize.textContent = `Production PDF · Real SOP Sample`;
    previewImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52"><rect width="52" height="52" rx="6" fill="%23f1f5f9"/><text x="26" y="32" font-size="13" font-weight="900" fill="%234739d2" text-anchor="middle" font-family="sans-serif">PDF</text></svg>';
    previewCard.classList.add('show');
  }

  // 5. Display comprehensive production banner
  const banner = document.getElementById('fn-banner');
  if (banner && spec) {
    banner.innerHTML = `
      <div style="font-weight:800; font-size:12px; margin-bottom:6px; color:#c2410c; display:flex; align-items:center; gap:6px;">
        <span>⚡</span> <span>BannerBuzz Production Filename Auto-Identified</span>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px 10px; font-size:11.5px; background:#fff; padding:10px; border-radius:6px; border:1px solid #fed7aa;">
        <div><span style="color:#64748b;">Product Name:</span> <strong style="color:#111c38;">${parsed.productName}</strong></div>
        <div><span style="color:#64748b;">Order No:</span> <strong style="color:#111c38;">${parsed.orderNum || 'N/A'}</strong></div>
        <div><span style="color:#64748b;">Parsed Size:</span> <strong style="color:#111c38;">${parsed.rawDim} &rarr; ${parsed.widthIn}" × ${parsed.heightIn}"</strong></div>
        <div><span style="color:#64748b;">Side:</span> <strong style="color:#111c38;">${parsed.side}</strong></div>
        <div style="grid-column:span 2;"><span style="color:#64748b;">Finishing Details:</span> <strong style="color:#111c38;">${parsed.finishing}</strong></div>
        <div style="grid-column:span 2; color:#1d4ed8; font-weight:700; background:#eff6ff; padding:4px 8px; border-radius:4px; margin-top:2px;">
          ${sopSummaryText(spec, parsed)}
        </div>
      </div>
    `;
    banner.classList.add('show');
  }

  // 6. Create realistic production vector artwork tailored to the product
  let demoArtUrl = null;
  if (fname.includes('PRAU2366057')) {
    demoArtUrl = 'assets/test_magnet.png';
  } else if (typeof CanvasInspector !== 'undefined' && CanvasInspector._createDemoArtwork) {
    demoArtUrl = CanvasInspector._createDemoArtwork(spec, appState.userDims);
  }

  if (!demoArtUrl) {
    demoArtUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="#ffffff"/><text x="300" y="200" font-family="sans-serif" font-size="28" font-weight="900" fill="#0f172a" text-anchor="middle">${spec ? spec.name : 'BANNERBUZZ'}</text></svg>`);
  }

  const isRasterImg = demoArtUrl.startsWith('assets/') || demoArtUrl.startsWith('http') || demoArtUrl.startsWith('data:image/png');
  const blob = isRasterImg ? new Blob(['mock-raster'], { type: 'image/png' }) : new Blob([demoArtUrl], { type: 'image/svg+xml' });
  const mockFile = new File([blob], fname, { type: isRasterImg ? 'image/png' : 'application/pdf', lastModified: Date.now() });
  appState.file = mockFile;
  appState.parsedFilename = parsed;
  appState.previewDataUrl = demoArtUrl;

  // Sync Slot 1 for Proof Studio
  if (!ProofStudio.slots.overall || !ProofStudio.slots.overall.isCustom) {
    ProofStudio.setSlot('overall', demoArtUrl, fname);
    const prevImg1 = document.getElementById('prev-img-overall');
    const prevName1 = document.getElementById('prev-name-overall');
    const prevCard1 = document.getElementById('prev-overall');
    const dropZone1 = document.getElementById('drop-overall');
    if (prevImg1) prevImg1.src = demoArtUrl;
    if (prevName1) prevName1.textContent = fname;
    if (prevCard1) prevCard1.style.display = 'flex';
    if (dropZone1) dropZone1.style.display = 'none';
  }

  updateRunButtonState();
  runPreCheck();
}

function openBBProofRefModal() {
  const m = document.getElementById('bb-proof-modal');
  if (m) m.classList.add('open');
}

function closeBBProofRefModal() {
  const m = document.getElementById('bb-proof-modal');
  if (m) m.classList.remove('open');
}

function removeFile() {
  appState.file = null;
  appState.analysis = null;
  const previewCard = document.getElementById('preview-card');
  if (previewCard) previewCard.classList.remove('show');
  document.getElementById('file-input').value = '';
  document.getElementById('fn-banner').classList.remove('show');
  document.getElementById('fn-proof-note').classList.remove('show');
  updateRunButtonState();
}

function updateRunButtonState() {
  const btn = document.getElementById('run-btn');
  if (btn) btn.disabled = !(appState.file && appState.product);
  // The order details are folded away: they open by themselves when the file name did not give the product
  const od = document.getElementById('order-details');
  if (od && appState.file && !appState.product) od.open = true;
}

function updateBreadcrumbs() {
  const ordEl = document.getElementById('crumb-order');
  const prodEl = document.getElementById('crumb-product');
  if (ordEl) ordEl.textContent = appState.orderNum || 'New Order';
  if (prodEl) prodEl.textContent = appState.product ? appState.product.name : 'Select Product';
}

/**
 * Execute the AI SOP Pre-Check
 */
/** DetailCheck on the uploaded raster artwork (null when it cannot be read) */
async function measureArtworkDetail(src) {
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    return await DetailCheck.measure(img);
  } catch (e) {
    console.warn('Detail check skipped:', e);
    return null;
  }
}

/** A PDF design file read by PostCheck, once per file (null for other files, or when the PDF cannot be read) */
function designAnalysisFor(file, step) {
  if (!file || !/\.pdf$/i.test(file.name) || typeof PostCheck === 'undefined') return Promise.resolve(null);
  const cache = appState.designCache || (appState.designCache = new WeakMap());
  if (!cache.has(file)) {
    cache.set(file, PostCheck.analyze(file, step).catch(e => {
      console.warn('Design file could not be read:', e);
      return null;
    }));
  }
  return cache.get(file);
}

async function runPreCheck() {
  if (!appState.file || !appState.product) return;
  clearTimeout(scheduleRecheckAfterSizeChange._timer);   // this run already uses the latest size

  const btn = document.getElementById('run-btn');
  const btnIcon = document.getElementById('run-icon');
  const btnText = document.getElementById('run-text');

  btn.disabled = true;
  btnIcon.innerHTML = '<div class="spinner"></div>';
  btnText.textContent = 'Inspecting SOP…';

  onDimensionInput();

  try {
    // 0. SOP requirements for this exact order (size + finishing + product)
    const sopContext = Object.assign({}, appState.parsedFilename || {}, {
      finishing: appState.parsedFilename?.finishing || appState.finishingDetailsSummary || ''
    });
    const sopReq = (typeof SopRules !== 'undefined')
      ? SopRules.requirements(appState.product, appState.userDims, sopContext)
      : null;
    renderSpecBox(appState.product);
    const effectiveSpec = sopReq
      ? Object.assign({}, appState.product, {
          resolution: `${sopReq.resolution.target} PPI`,
          safeArea: sopReq.safeArea.inches != null ? `${sopReq.safeArea.inches}"` : appState.product.safeArea,
          _sop: sopReq
        })
      : appState.product;

    // 1. Analyze File
    // A PDF design file is read once (PostCheck): what the page is made of, every picture's placed PPI and real
    // detail, colour mode, fonts — and the page drawn in that pass is the artwork every other check works on
    const design = await designAnalysisFor(appState.file, t => { btnText.textContent = t; });
    let analysis = await FileAnalyzer.analyze(appState.file, effectiveSpec, appState.userDims, design);
    if (analysis && analysis.pixelWidth && analysis.pixelHeight) {
      const swapped = checkAndApplyAutoOrientation(analysis.pixelWidth, analysis.pixelHeight);
      if (swapped) {
        analysis = await FileAnalyzer.analyze(appState.file, effectiveSpec, appState.userDims, design);
      }
    }
    appState.analysis = analysis;

    // PDF / AI: the real page rendered by pdf.js replaces the generated stand-in picture everywhere
    if (analysis && analysis.renderedFromPdf && analysis.previewDataUrl) {
      appState.previewDataUrl = analysis.previewDataUrl;
      const pImg = document.getElementById('preview-img');
      if (pImg) pImg.src = analysis.previewDataUrl;
      if (typeof ProofStudio !== 'undefined' && (!ProofStudio.slots.overall || !ProofStudio.slots.overall.isCustom)) {
        ProofStudio.setSlot('overall', analysis.previewDataUrl, appState.file ? appState.file.name : 'artwork.pdf');
        const prevImg = document.getElementById('prev-img-overall');
        if (prevImg) prevImg.src = analysis.previewDataUrl;
      }
      checkAndApplyAutoOrientation(analysis.renderPxW, analysis.renderPxH);
    }

    if (analysis?.parsedFilename) {
      if (!appState.userDims) appState.userDims = {};
      Object.assign(appState.userDims, {
        hasGrommets: analysis.parsedFilename.hasGrommets,
        hasPolePockets: analysis.parsedFilename.hasPolePockets,
        finishingDetails: analysis.parsedFilename.finishingDetails,
        pocketType: analysis.parsedFilename.finishingDetails?.pockets,
        grommetType: analysis.parsedFilename.finishingDetails?.grommets
      });
    }

    // 1.5 Scan with Agentic AI Quality Inspector (Spelling, Stray Lines & Dots)
    const artSrc = (appState.previewDataUrl && !appState.previewDataUrl.includes('PDF VECTOR'))
      ? appState.previewDataUrl
      : (analysis?.previewDataUrl || appState.previewDataUrl);

    if (analysis) analysis.previewDataUrl = artSrc;

    if (typeof AgenticAiInspector !== 'undefined') {
      const dummyCanvas = document.createElement('canvas');
      dummyCanvas.width = analysis?.pixelWidth || 800;
      dummyCanvas.height = analysis?.pixelHeight || 600;
      AgenticAiInspector.scanArtwork(dummyCanvas, { src: artSrc }, effectiveSpec, appState.userDims);
      analysis.aiDefects = AgenticAiInspector.getDefects();
    }

    // QNAP product template whose panel is not the ordered product size (a canopy wall 117" × 42" on a 10 × 10 ft
    // tent): size, resolution and orientation are measured on the template panel the artwork is made for
    // A shaped artwork (table cover cross, flag outline…) is matched to its template by its outline first
    let checkDims = appState.userDims;
    if (typeof ProductTemplates !== 'undefined' && analysis && analysis.pixelWidth && appState.userDims) {
      const pf = appState.parsedFilename;
      const fname = (pf && pf.fname) || (appState.file && appState.file.name) || '';
      let match = null;
      try {
        match = await Promise.race([
          ProductTemplates.autoMatch(appState.product, appState.userDims, pf, fname, artSrc),
          new Promise(res => setTimeout(() => res(null), 6000))
        ]);
      } catch (e) { match = null; }
      const panel = ProductTemplates.panelFor(effectiveSpec, appState.userDims, pf, fname, analysis.pixelWidth, analysis.pixelHeight, match);
      if (panel) {
        checkDims = Object.assign({}, appState.userDims, { widthIn: panel.w, heightIn: panel.h });
        FileAnalyzer._evaluateMeasurementsAndOrientation(analysis, panel.w, panel.h);
        analysis.templatePanel = { w: panel.w, h: panel.h, on: panel.on, name: panel.t.name, product: panel.t.product, web: ProductTemplates.isWebsite(panel.t), kind: ProductTemplates.kindName(panel.t).toLowerCase(), area: ProductTemplates.logoArea(panel.t) };
      }
    }

    // 1.9 Real detail of a raster artwork (a small picture enlarged to a high PPI still prints soft) — measured once
    // per file on its own pixels; the size / resolution check reads it
    if (analysis && !analysis.isVector && typeof DetailCheck !== 'undefined' && artSrc && !String(artSrc).includes('PDF VECTOR')) {
      const cache = appState.detailCache || (appState.detailCache = new WeakMap());
      if (!cache.has(appState.file)) cache.set(appState.file, measureArtworkDetail(artSrc));
      analysis.detail = await cache.get(appState.file);
    }

    // 1.95 Design file (PDF): page size, picture resolution and real detail, colour mode, fonts — these cards replace
    // the artwork size / resolution cards in the report
    if (design && analysis && typeof PostCheck !== 'undefined') {
      analysis.design = PostCheck.checksFor(design, { spec: effectiveSpec, dims: checkDims, parsed: appState.parsedFilename, req: sopReq });
    }

    // 2. Evaluate SOP Checkpoints
    const report = PrecheckEngine.evaluate(analysis, effectiveSpec, checkDims, appState.overrides);
    appState.report = report;

    // 3. Search Previous Orders
    const previousOrders = PreviousOrdersEngine.findMatches(appState.customerName, appState.product.slug);
    appState.previousOrders = previousOrders;

    // 4. Render Pre-Check Results
    renderResults(report, previousOrders);

    // 5. Render Interactive Canvas with Product Die-Line Template
    CanvasInspector.renderArtwork(
      artSrc,
      appState.product,
      appState.userDims
    );

    // 6. Mount Agentic AI blinking overlay on active canvas
    if (typeof AgenticAiInspector !== 'undefined') {
      AgenticAiInspector.renderOverlay();
      AgenticAiInspector.updateControlsUI();
      // the new report's live cards + pop-up alerts (orientation for this size, spelling)
      AgenticAiInspector.syncPrecheckReport();
    }

    // 7. Colour check (RGB → CMYK, merge, opacity) on the real artwork pixels — updates its card when done
    if (typeof ColorCheck !== 'undefined') ColorCheck.run(analysis && analysis.previewDataUrl);
  } catch (err) {
    console.error('Pre-check error:', err);
    alert('An error occurred during pre-check analysis: ' + err.message);
  } finally {
    btn.disabled = false;
    btnIcon.textContent = '⚡';
    btnText.textContent = 'Run OPS-Intel Check';
  }
}

/**
 * Render the Pre-Check UI Report
 */
function renderResults(report, previousOrders) {
  document.getElementById('empty-state').style.display = 'none';
  const content = document.getElementById('results-content');
  content.style.display = 'flex';

  const { spec, dimensions } = report;
  appState.previousOrders = previousOrders;
  if (typeof PrecheckEngine !== 'undefined' && PrecheckEngine.tally) PrecheckEngine.tally(report);

  // 1. SUMMARY CARD — score, Passed / Critical, the issues to fix
  renderSummaryCard(report);

  // Resolve official BannerBuzz template & mockup from QNAP registry (using product name and dimensions)
  const officialTemplate = (typeof getOfficialProductTemplate === 'function')
    ? getOfficialProductTemplate(spec?.slug || spec?.name, dimensions || appState.userDims)
    : null;
  const officialMockup = (typeof getOfficialProductMockup === 'function')
    ? getOfficialProductMockup(spec?.slug || spec?.name, dimensions || appState.userDims)
    : null;

  // 2. CHECKS (results first: Critical · Passed · Confirm by eye), then the canvas and the AI scanner
  document.getElementById('rt-checks').innerHTML = `
    <!-- SOP Pre-Check Evaluation Cards -->
    <div class="checks-list" id="checks-list">${checksListHtml(report)}</div>

    <!-- Interactive Canvas Visual Inspector Card -->
    <div class="visual-inspector-card">
      <div class="vi-toolbar">
        <div class="vi-title">
          <span>🎨 Interactive SOP Canvas & Guide Overlay</span>
          <span style="font-size:11px; color:#8896a8; font-weight:500;">(Move mouse over artwork to activate 100% Zoom Loupe)</span>
        </div>
        <div class="vi-controls" id="vi-controls-container">
          <!-- Dynamically populated based on product template by CanvasInspector.renderContextualToolbar() -->
        </div>
      </div>
      <div class="canvas-viewport-wrap">
        <canvas id="artwork-canvas"></canvas>
        <div id="zoom-loupe" class="zoom-loupe"></div>
      </div>

      ${(officialTemplate || officialMockup) ? `
        <!-- Official QNAP Production Asset Bar -->
        <div class="official-qnap-strip" style="margin-top:12px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:10px 14px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:12px; font-weight:800; color:#0e2246;">🏛️ Official BannerBuzz Production Specifications</span>
              <span style="font-size:9.5px; font-weight:800; background:#fef3c7; color:#b45309; padding:2px 7px; border-radius:4px; border:1px solid #fde68a;" title="Generated reference images, not the real QNAP templates">
                ${officialTemplate && officialTemplate.real ? "REAL TEMPLATE · TEMPLATE_MOCKUPS" : "REFERENCE ONLY · NOT FROM QNAP"}
              </span>
            </div>
            <span style="font-size:10.5px; color:#64748b; font-weight:600;">
              Lightweight JPG (${officialTemplate?.dims || spec.name})
            </span>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            ${officialTemplate ? `
              <div style="display:flex; align-items:center; gap:10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; cursor:pointer;" onclick="openAssetLightbox('${officialTemplate.templateFile}', '${officialTemplate.name} (Production Template)', 'Sourced from \\\\\\\\192.168.0.250\\\\qnap\\\\Template_Mockups')">
                <img src="${officialTemplate.templateFile}" alt="Official Template" style="width:52px; height:52px; object-fit:contain; border-radius:4px; background:#f1f5f9; border:1px solid #cbd5e1;" />
                <div style="flex:1;">
                  <div style="font-size:11.5px; font-weight:800; color:#1e293b;">Official Production Template</div>
                  <div style="font-size:10px; color:#475569;">${officialTemplate.dims || officialTemplate.name}</div>
                  <div style="font-size:9.5px; color:#ff5f1f; font-weight:700; margin-top:2px;">🔍 Click to inspect exact die-line</div>
                </div>
              </div>
            ` : ''}
            ${officialMockup ? `
              <div style="display:flex; align-items:center; gap:10px; background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:8px 12px; cursor:pointer;" onclick="openAssetLightbox('${officialMockup.mockupFile}', '${officialMockup.name} (3D Mockup)', 'Sourced from \\\\\\\\192.168.0.250\\\\qnap\\\\Template_Mockups')">
                <img src="${officialMockup.mockupFile}" alt="Official 3D Mockup" style="width:52px; height:52px; object-fit:contain; border-radius:4px; background:#f1f5f9; border:1px solid #cbd5e1;" />
                <div style="flex:1;">
                  <div style="font-size:11.5px; font-weight:800; color:#1e293b;">Official 3D Hardware Mockup</div>
                  <div style="font-size:10px; color:#475569;">${officialMockup.dims || officialMockup.name}</div>
                  <div style="font-size:9.5px; color:#ff5f1f; font-weight:700; margin-top:2px;">🔍 Click to inspect finished assembly</div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- Agentic AI Quality Audit Panel (Spelling Typos, Stray Lines & Dots with Blinking Highlights) -->
    <div id="ai-inspector-panel-container">
      ${(typeof AgenticAiInspector !== 'undefined') ? AgenticAiInspector.renderAuditPanel() : ''}
    </div>
  `;

  // 5. PREVIOUS ORDERS TAB
  document.getElementById('rt-previous').innerHTML = renderPreviousOrdersTab(previousOrders);

  // 6. SOP GUIDE TAB
  document.getElementById('rt-sop').innerHTML = renderSopGuideTab(spec);

  document.getElementById('gen-proof-btn').disabled = false;
  switchTab('checks');
}

/** Re-score and redraw the summary and the check list (after a background check finishes) */
function refreshPrecheckView(report) {
  if (!report) return;
  if (typeof PrecheckEngine !== 'undefined' && PrecheckEngine.tally) PrecheckEngine.tally(report);
  renderSummaryCard(report);
  renderChecksList(report);
}

function updateFailBadges(fails) {
  const failBadge = document.getElementById('fail-badge');
  const failTabBadge = document.getElementById('fail-tab-badge');
  [failBadge, failTabBadge].forEach(b => {
    if (!b) return;
    b.textContent = fails;
    b.style.display = fails > 0 ? 'inline-block' : 'none';
  });
}

/**
 * Summary card: SOP Quality Score with two results only — Passed and Critical (team request, Oct 2026) — the
 * critical issues as a "fix before proofing" list that jumps to each card, and the next step.
 */
function renderSummaryCard(report) {
  const card = document.getElementById('summary-card');
  if (!card) return;
  const { overall, score, checks, analysis, spec, dimensions } = report;
  const counts = report.counts || { passes: 0, fails: 0, manual: 0 };
  updateFailBadges(counts.fails);
  // enlarged / blurry picture: pop-up alert beside the canvas, like spelling and the safe zone
  if (typeof AgenticAiInspector !== 'undefined' && AgenticAiInspector._renderDetailAlert) AgenticAiInspector._renderDetailAlert();

  // VECTOR "GOOD FOR PRINT" HERO BANNER — a PDF design file shows what its page is made of instead
  let vectorBannerHtml = '';
  if (analysis.design && typeof PostCheck !== 'undefined') {
    vectorBannerHtml = PostCheck.panelHtml(analysis.design);
  } else if (analysis.isVector) {
    const isHybrid = !!analysis.embeddedRasterFound;
    const heroTitle = isHybrid
      ? 'Hybrid Vector + Raster Artwork Identified'
      : 'Pure Vector Artwork Identified — Resolution Independent';
    const heroDesc = isHybrid
      ? `File format <strong>.${analysis.fileExt.toUpperCase()}</strong> contains scale-independent vector curves & text alongside ${analysis.embeddedRasterCount || 1} embedded raster graphic(s). Primary raster component is <strong>${analysis.pixelWidth}×${analysis.pixelHeight} px</strong> delivering <strong>${analysis.effectiveDpi} DPI</strong> (${analysis.colorSpace || 'DeviceCMYK'}).`
      : `File format <strong>.${analysis.fileExt.toUpperCase()}</strong> is composed of mathematical geometric paths and curves. It will print 100% razor sharp at any scale with zero pixelation or degradation.`;
    const heroSpecs = isHybrid
      ? `
        <span class="v-tag">✓ Vector Contours: Infinitely Scalable</span>
        <span class="v-tag" style="background:#fff7ed; border-color:#fdba74; color:#c2410c; font-weight:700;">🖼️ Embedded Raster: ${analysis.pixelWidth}×${analysis.pixelHeight} px · ${analysis.effectiveDpi} DPI</span>
        <span class="v-tag" style="background:#f1f5f9; border-color:#cbd5e1; color:#334155;">🎨 ${analysis.colorSpace || 'DeviceCMYK'} (${analysis.bitsPerComponent || 8}-bit)</span>
      `
      : `
        <span class="v-tag">✓ Scale-Independent (Infinite DPI)</span>
        <span class="v-tag">✓ Clean Contours</span>
        <span class="v-tag">✓ Pure Vector Graphics</span>
      `;
    vectorBannerHtml = `
      <div class="vector-hero-banner" style="${isHybrid ? 'border-left: 4px solid #ea580c;' : ''}">
        <div class="vector-hero-icon">${isHybrid ? '⚡' : '⭐'}</div>
        <div class="vector-hero-content">
          <div class="vector-hero-badge">${isHybrid ? '⚡ Hybrid Vector & Raster Inspection' : '🌟 Good for Print Protocol'}</div>
          <div class="vector-hero-title">${heroTitle}</div>
          <div class="vector-hero-desc">${heroDesc}</div>
          <div class="vector-hero-specs">${heroSpecs}</div>
        </div>
      </div>
    `;
  }

  // PREVIOUS ORDERS ALERT BANNER
  const previousOrders = appState.previousOrders;
  let prevAlertHtml = '';
  if (previousOrders && previousOrders.length > 0) {
    const po = previousOrders[0];
    prevAlertHtml = `
      <div class="prev-alert-banner">
        <div class="prev-alert-left">
          <div class="prev-alert-icon">🔍</div>
          <div>
            <div class="prev-alert-title">Previous Relevant Order Found (${po.orderNum})</div>
            <div class="prev-alert-desc">${po.approvalType} · Approved ${po.customerApprovedDate || po.date} · Match: ${po.artworkSimilarity}% Artwork, ${po.productSimilarity}% Product</div>
          </div>
        </div>
        <button class="btn btn-sm btn-orange" onclick="switchTab('previous')">Review Previous Order →</button>
      </div>
    `;
  }

  // The critical issues, each jumping to its card
  const plain = html => String(html || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const short = t => (t.length > 120 ? t.slice(0, 117) + '…' : t);
  const crit = checks.filter(c => c.status === 'FAIL' && !c.isOverridden && !c.duplicateOf);
  const issuesHtml = crit.length ? `
    <div class="summary-issues">
      <div class="si-head">Fix before proofing</div>
      ${crit.map(c => `
        <button type="button" class="si-item" onclick="focusCheck('${c.id}')">
          <span class="si-icon">${c.icon}</span>
          <span class="si-text"><strong>${c.name}</strong><span>${esc(short(plain(c.error || c.found)))}</span></span>
          <span class="si-go">View ›</span>
        </button>`).join('')}
    </div>` : `
    <div class="summary-ready">✓ No critical issues — the artwork is ready for the customer proof.</div>`;

  card.innerHTML = `
    ${vectorBannerHtml}
    ${prevAlertHtml}
    <div class="summary-top">
      <div class="summary-score-block">
        <div class="score-num ${overall.toLowerCase()}">${score}</div>
        <div class="score-label">SOP Quality Score</div>
      </div>
      <div class="summary-chips">
        <div class="chip chip-pass"><span class="chip-dot"></span>${counts.passes} Passed</div>
        <div class="chip chip-fail"><span class="chip-dot"></span>${counts.fails} Critical</div>
      </div>
      <div class="summary-verdict ${overall === 'PASS' ? 'verd-pass' : 'verd-fail'}">${overall}</div>
    </div>
    ${issuesHtml}
    <div class="summary-meta">
      <span>Order <strong>#${appState.orderNum || 'US-DRAFT'}</strong> · Customer: <strong>${appState.customerName || 'Customer'}</strong> · Product: <strong>${spec.name}</strong> · Size: <strong>${dimensions.widthIn}" × ${dimensions.heightIn}"</strong> · Checked: <strong>${new Date().toLocaleTimeString()}</strong></span>
      <span class="summary-actions">
        ${counts.manual ? `<button type="button" class="summary-link" onclick="focusCheck('manual-group')">${counts.manual} to confirm by eye ›</button>` : ''}
        <button type="button" class="btn btn-orange btn-sm" onclick="setSubnav(document.querySelector('.subnav-item[data-view=proof]'), 'proof')">Create proof ›</button>
      </span>
    </div>
  `;
}

/**
 * The check cards: only the real issues are open on the page — Critical (fix first). "Confirm by eye" and "Passed"
 * are folded lines that open on a click. A check failing for the same cause as another is shown inside that card.
 */
function checksListHtml(report) {
  const checks = (report.checks || []).filter(c => !c.duplicateOf);
  const crit = checks.filter(c => c.status === 'FAIL' && !c.isOverridden);
  const passed = checks.filter(c => c.status === 'PASS' || c.isOverridden);
  const manual = checks.filter(c => c.status === 'INFO' && !c.isOverridden);
  const card = c => renderCheckCard(c, report);
  const fold = (id, cls, title, list, note, key) => list.length ? `
    <details class="checks-group ${cls}" id="cg-${id}"${appState[key] ? ' open' : ''} ontoggle="appState.${key} = this.open">
      <summary class="checks-group-head"><span class="cg-dot"></span>${title}<span class="cg-count">${list.length}</span><span class="cg-note">${note}</span></summary>
      ${list.map(card).join('')}
    </details>` : '';
  const critical = crit.length ? `
    <div class="checks-group critical">
      <div class="checks-group-head"><span class="cg-dot"></span>Critical<span class="cg-count">${crit.length}</span><span class="cg-note">fix before proofing</span></div>
      ${crit.map(card).join('')}
    </div>` : `
    <div class="checks-allclear">✓ No critical issues — nothing to fix before the proof.</div>`;
  return critical
    + fold('manual-group', 'manual', 'Confirm by eye', manual, 'not scored — the tool cannot decide these alone', 'manualGroupOpen')
    + fold('passed-group', 'passed', 'Passed', passed, 'no action needed', 'passedGroupOpen');
}

function renderChecksList(report) {
  const el = document.getElementById('checks-list');
  if (!el) return;
  const open = [...el.querySelectorAll('.check-card.open')].map(c => c.id);
  const more = [...el.querySelectorAll('.check-card.more')].map(c => c.id);
  el.innerHTML = checksListHtml(report);
  open.forEach(id => { const c = document.getElementById(id); if (c) c.classList.add('open'); });
  more.forEach(id => { const c = document.getElementById(id); if (c) c.classList.add('more'); });
}

/** Jump to a check card (from the summary), open it and flash it */
function focusCheck(id) {
  switchTab('checks');
  if (id === 'manual-group') {
    const g = document.getElementById('cg-manual-group');
    if (g) { g.open = true; g.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  const card = document.getElementById(`cc-${id}`);
  if (!card) return;
  const group = card.closest('details');
  if (group) group.open = true;
  card.classList.add('open', 'flash');
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => card.classList.remove('flash'), 1600);
}

/**
 * One check, in three steps so nothing confuses:
 *  1. closed: the check name and its result (CRITICAL / CONFIRM / PASSED)
 *  2. opened: only the real error — what is wrong (the items, for the safe zone), how to fix it, the buttons
 *  3. "More details" inside it: the SOP target, the analysis and the pictures
 */
function renderCheckCard(c, report) {
  const st = c.isOverridden ? 'overridden' : ({ PASS: 'pass', FAIL: 'fail', INFO: 'info' }[c.status] || 'info');
  const pillLabel = c.isOverridden ? 'OVERRIDDEN' : ({ PASS: 'PASSED', FAIL: 'CRITICAL', INFO: 'CONFIRM' }[c.status] || c.status);
  const issue = c.status === 'FAIL' && !c.isOverridden;
  const manual = c.status === 'INFO' && !c.isOverridden;
  const same = ((report && report.checks) || []).filter(d => d.duplicateOf === c.id);
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // c.error = the real error in plain words, when the check gives one; the raw measurement then goes to the details
  const headline = (issue && c.error) || c.found;
  const detected = issue && c.error ? c.found : '';
  const hasMore = !!(detected || c.required || c.detail || c.visual || c.isOverridden || (!issue && !manual && c.action));

  // the safe-zone items, one line each, with a jump to the mark on the canvas
  const sz = c.id === 'safeArea' && c.safeZone && c.safeZone.items && c.safeZone.items.length && typeof SafeZoneCheck !== 'undefined' ? c.safeZone : null;
  const kind = { text: 'Text', lettering: 'Lettering', object: 'Graphic' };
  const items = sz ? `
        <ul class="cc-items">
          ${sz.items.slice(0, 6).map((it, i) => `
            <li class="cc-item ${it.kind === 'object' ? 'is-gfx' : ''}"><span class="cc-kind">${kind[it.kind] || 'Graphic'}</span>
              <span class="cc-item-text">${it.text ? `<strong>${esc(it.text.length > 32 ? it.text.slice(0, 30) + '…' : it.text)}</strong> · ` : ''}${SafeZoneCheck.where(it, sz.g)}</span>
              <button type="button" class="cc-show" onclick="SafeZoneCheck.show(${i})">Show</button></li>`).join('')}
          ${sz.items.length + (sz.more || 0) > 6 ? `<li class="cc-item cc-item-more">+ ${sz.items.length + (sz.more || 0) - 6} more marked on the canvas</li>` : ''}
        </ul>` : (issue || manual) && c.items && c.items.length ? `
        <ul class="cc-items">${c.items.map(t => `<li class="cc-item"><span class="cc-item-text">${t}</span></li>`).join('')}</ul>` : '';

  return `
    <div class="check-card ${st}" id="cc-${c.id}">
      <div class="check-header" onclick="toggleCheckCard('${c.id}')" role="button" tabindex="0" aria-expanded="false"
           onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleCheckCard('${c.id}'); }">
        <span class="check-icon">${c.icon}</span>
        <span class="check-name">${c.name}${c.isOverridden ? '<span class="override-tag">OVERRIDDEN</span>' : ''}</span>
        <span class="check-pill pill-${st}">${pillLabel}</span>
        <span class="check-chevron" id="chev-${c.id}">▾</span>
      </div>
      <div class="check-body" id="cb-${c.id}">
        ${headline ? `<div class="cc-row cc-wrong"><span class="cc-label">${issue ? 'Error' : manual ? 'Check' : 'Result'}</span><span class="cc-text">${headline}</span></div>` : ''}
        ${items}
        ${(issue || manual) && c.action ? `<div class="cc-row cc-fix"><span class="cc-label">${issue ? 'How to fix' : 'What to do'}</span><span class="cc-text">${c.action}</span></div>` : ''}
        ${same.length ? `<div class="check-same">${same.map(d => `Same cause: <strong>${d.name}</strong> — ${d.found}. Fixing this fixes both.`).join('<br>')}</div>` : ''}
        ${issue ? `
          <div class="check-actions">
            <button class="cta-btn cta-fixed" onclick="markCheckFixed('${c.id}')">✓ Mark Corrected</button>
            <button class="cta-btn cta-override" onclick="openOverrideModal('${c.id}', '${c.name.replace(/'/g, '')}')">Override with Reason…</button>
          </div>` : ''}
        ${manual ? `
          <div class="check-actions">
            <button class="cta-btn cta-fixed" onclick="confirmCheck('${c.id}')">✓ Checked by eye</button>
          </div>` : ''}
        ${hasMore ? `
          <button type="button" class="cc-more" onclick="toggleCheckMore('${c.id}')" aria-expanded="false">
            <span class="cm-open">More details ▾</span><span class="cm-close">Hide details ▴</span></button>
          <div class="cc-detail">
            ${detected ? `<div class="check-detail-row"><span class="cdl">Detected</span><span class="cdv">${detected}</span></div>` : ''}
            ${c.required ? `<div class="check-detail-row"><span class="cdl">SOP target</span><span class="cdv">${c.required}</span></div>` : ''}
            ${c.detail ? `<div class="check-detail-row"><span class="cdl">Analysis</span><span class="cdv detail">${c.detail}</span></div>` : ''}
            ${!issue && !manual && c.action ? `<div class="check-detail-row"><span class="cdl">Action</span><span class="cdv action">→ ${c.action}</span></div>` : ''}
            ${c.visual ? `<div class="check-visual">${c.visual}</div>` : ''}
            ${c.isOverridden ? `<div class="check-detail-row"><span class="cdl">Reason</span><span class="cdv" style="color:#7048e8;">${c.overrideReason}</span></div>` : ''}
          </div>` : ''}
      </div>
    </div>
  `;
}

function toggleCheckCard(id) {
  const card = document.getElementById(`cc-${id}`);
  if (!card) return;
  card.classList.toggle('open');
  const head = card.querySelector('.check-header');
  if (head) head.setAttribute('aria-expanded', card.classList.contains('open') ? 'true' : 'false');
}

/** The second step inside an opened card: SOP target, analysis, pictures */
function toggleCheckMore(id) {
  const card = document.getElementById(`cc-${id}`);
  if (!card) return;
  card.classList.toggle('more');
  const b = card.querySelector('.cc-more');
  if (b) b.setAttribute('aria-expanded', card.classList.contains('more') ? 'true' : 'false');
}

function markCheckFixed(id) {
  appState.overrides[id] = 'Designer confirmed file was corrected and validated.';
  runPreCheck();
}

/** A "Confirm by eye" item the designer has looked at: counted as passed, with the reason logged */
function confirmCheck(id) {
  appState.overrides[id] = 'Designer checked this by eye and confirmed it.';
  runPreCheck();
}

/**
 * Override Modal Handling
 */
let pendingOverrideId = null;
function openOverrideModal(checkId, checkName) {
  pendingOverrideId = checkId;
  const modal = document.getElementById('override-modal');
  const sub = document.getElementById('override-subtitle');
  const txt = document.getElementById('override-reason');

  sub.textContent = `Provide logged reason for overriding: ${checkName}`;
  txt.value = '';
  modal.classList.add('open');
}

function closeOverrideModal() {
  document.getElementById('override-modal').classList.remove('open');
  pendingOverrideId = null;
}

function submitOverride() {
  const txt = document.getElementById('override-reason');
  const reason = (txt.value || '').trim();
  if (!reason) {
    alert('Please enter a valid rationale for overriding this check.');
    return;
  }

  if (pendingOverrideId) {
    appState.overrides[pendingOverrideId] = reason;
    closeOverrideModal();
    runPreCheck();
  }
}

/**
 * Tab Navigation in Results
 */
function switchTab(tabId) {
  ['checks', 'previous', 'sop'].forEach(t => {
    const tabEl = document.getElementById(`tab-${t}`);
    const resEl = document.getElementById(`rt-${t}`);
    if (tabEl) tabEl.classList.toggle('active', t === tabId);
    if (resEl) resEl.classList.toggle('active', t === tabId);
  });
}

/**
 * Subnav (View Switching)
 */
function setSubnav(el, viewName) {
  document.querySelectorAll('.subnav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  ['precheck', 'proof', 'dashboard', 'rules'].forEach(v => {
    const viewEl = document.getElementById(`view-${v}`);
    if (viewEl) viewEl.classList.toggle('active', v === viewName);
  });

  const isProof = (viewName === 'proof');
  document.getElementById('lp-precheck').classList.toggle('active', !isProof);
  document.getElementById('lp-proof').classList.toggle('active', isProof);
  document.getElementById('actions-precheck').style.display = !isProof ? 'flex' : 'none';
  document.getElementById('actions-proof').style.display = isProof ? 'flex' : 'none';

  // The pre-check pop-up alerts (orientation, spelling) belong to the pre-check page only
  const alerts = document.getElementById('precheck-alerts');
  if (alerts) alerts.style.display = viewName === 'precheck' ? '' : 'none';

  if (isProof) generateProofView();
  if (viewName === 'rules') renderRulesCatalog();
}

/**
 * Render Previous Orders Tab
 */
function renderPreviousOrdersTab(orders) {
  if (!orders || orders.length === 0) {
    return '<div class="no-result">No prior order history found for this customer.</div>';
  }

  return orders.map(o => `
    <div class="prev-card">
      <div class="prev-header">
        <div class="prev-indicator"></div>
        <div class="prev-title">Relevant Previous Order Identified (${o.approvalType})</div>
        <div class="prev-order-id">#${o.orderNum}</div>
      </div>
      <div class="prev-stats">
        <div class="ps"><div class="ps-val">${o.artworkSimilarity}%</div><div class="ps-label">Artwork Match</div></div>
        <div class="ps"><div class="ps-val">${o.productSimilarity}%</div><div class="ps-label">Product Match</div></div>
        <div class="ps"><div class="ps-val" style="color:var(--pass);">Approved ✓</div><div class="ps-label">${o.customerApprovedDate}</div></div>
      </div>
      <div style="font-size:12.5px; color:#4a5568;">
        <div>Customer: <strong>${o.customerName}</strong> · Product: <strong>${o.productName}</strong> (${o.widthIn}" × ${o.heightIn}")</div>
        <div style="margin-top:6px; color:#1a2340; background:#fff4ef; padding:10px; border-radius:6px; border:1px solid #fde8dc;">
          <strong>Approved Historical Notes:</strong> ${o.approvedNotes}
        </div>
      </div>
      <div class="prev-actions">
        <button class="btn btn-outline btn-sm" onclick="alert('Viewing artwork from order #${o.orderNum}')">View Artwork</button>
        <button class="btn btn-orange btn-sm" onclick="applyPreviousSettings('${o.orderNum}')">Use Approved Previous Settings</button>
      </div>
      <div class="prev-warning">⚠ Designer validation rule: Confirm whether previous customer approvals (colors, template offsets) apply to current order.</div>
    </div>
  `).join('');
}

function applyPreviousSettings(orderNum) {
  const match = appState.previousOrders.find(o => o.orderNum === orderNum);
  if (match) {
    document.getElementById('notes').value = `Reusing approved settings from #${match.orderNum}: ${match.approvedNotes}`;
    alert(`Applied approved settings from #${orderNum} to current order.`);
  }
}

/**
 * Render SOP Guide Tab
 */
function renderSopGuideTab(spec) {
  const famKey = spec.sopFamily;
  const fam = SOP_FAMILIES[famKey];
  if (!fam) return '<div style="padding:20px;">No SOP family mapping found for this product.</div>';

  const g = fam.guide;
  return `
    <div class="sop-section">
      <div class="sop-section-title">Standard Operating Procedure: ${fam.label}</div>
      <div style="font-size:11.5px; color:#8896a8; margin-bottom:12px;">Source: ${fam.source}</div>
      
      ${g.processing ? `
        <div style="font-weight:700; margin-bottom:8px; color:#1a2340;">1. Processing Steps:</div>
        ${g.processing.map((step, i) => `
          <div class="sop-step">
            <div class="sop-step-num">${i + 1}</div>
            <div>${step}</div>
          </div>
        `).join('')}
      ` : ''}

      ${g.checks ? `
        <div style="font-weight:700; margin:14px 0 8px 0; color:#1a2340;">2. Design Checkpoints:</div>
        ${g.checks.map((c, i) => `
          <div class="sop-step">
            <div class="sop-step-num">${i + 1}</div>
            <div>${c}</div>
          </div>
        `).join('')}
      ` : ''}

      ${g.watchouts ? `
        <div style="font-weight:700; margin:14px 0 8px 0; color:#c92a2a;">3. Critical Watch-outs:</div>
        ${g.watchouts.map(w => `
          <div style="font-size:12px; color:#c92a2a; margin-bottom:6px;">⚠ ${w}</div>
        `).join('')}
      ` : ''}
    </div>
    ${(typeof SopRules !== 'undefined' && SopRules.family(spec, appState.parsedFilename) === 'banner') ? SopRules.renderFinishingReference() : ''}
    ${typeof SopRules !== 'undefined' ? SopRules.renderProofReference() : ''}
  `;
}

/**
 * Proof Studio Functions & Sidebar Metadata Controls
 */
function initProofProductDropdown() {
  const sel = document.getElementById('proof-product-select');
  if (!sel || sel.options.length > 1) return;

  if (typeof CATEGORIES !== 'undefined') {
    Object.entries(CATEGORIES).forEach(([catKey, cat]) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = cat.label;
      Object.entries(cat.products).forEach(([slug, pr]) => {
        const opt = document.createElement('option');
        opt.value = slug;
        opt.textContent = pr.name;
        optgroup.appendChild(opt);
      });
      sel.appendChild(optgroup);
    });
  } else if (typeof SPECS !== 'undefined') {
    Object.entries(SPECS).forEach(([slug, pr]) => {
      const opt = document.createElement('option');
      opt.value = slug;
      opt.textContent = pr.name;
      sel.appendChild(opt);
    });
  }
}

function onProofOrderNumChange(val) {
  appState.orderNum = (val || '').trim();
  const preCheckOrder = document.getElementById('order-num');
  if (preCheckOrder) preCheckOrder.value = appState.orderNum;
  updateBreadcrumbs();
  generateProofView();
}

function onProofProductSelect(slug) {
  if (!slug) return;
  const spec = (typeof SPECS !== 'undefined' && SPECS[slug]) || null;
  if (!spec) return;

  appState.product = spec;

  // Sync Pre-Check Category & Product dropdowns
  if (spec._catKey) {
    const catSel = document.getElementById('cat-select');
    if (catSel && catSel.value !== spec._catKey) {
      catSel.value = spec._catKey;
      onCategoryChange();
    }
  }
  const mainProd = document.getElementById('product-select');
  if (mainProd) mainProd.value = slug;

  const proofW = document.getElementById('proof-w');
  const proofH = document.getElementById('proof-h');
  const printW = document.getElementById('print-w');
  const printH = document.getElementById('print-h');

  // If dimensions were not set or default applies
  if (!appState.userDims || !appState.userDims.widthIn) {
    appState.userDims = {
      widthIn: spec.defaultW || 36,
      heightIn: spec.defaultH || 24,
      unit: 'in'
    };
    if (proofW) proofW.value = appState.userDims.widthIn;
    if (proofH) proofH.value = appState.userDims.heightIn;
    if (printW) printW.value = appState.userDims.widthIn;
    if (printH) printH.value = appState.userDims.heightIn;
  }

  // Update Proof Studio Slots 2 (Template) & Slot 3 (Mockup) to new product's official assets
  if (typeof getOfficialProductTemplate === 'function') {
    const offT = getOfficialProductTemplate(spec.slug, appState.userDims);
    const offM = typeof getOfficialProductMockup === 'function' ? getOfficialProductMockup(spec.slug, appState.userDims) : null;
    if (offT && (!ProofStudio.slots.template || !ProofStudio.slots.template.isCustom)) {
      ProofStudio.setSlot('template', offT.templateFile, offT.name);
      const cardEl = document.getElementById('prev-template');
      const dropEl = document.getElementById('drop-template');
      const imgEl = document.getElementById('prev-img-template');
      const nameEl = document.getElementById('prev-name-template');
      if (imgEl) imgEl.src = offT.templateFile;
      if (nameEl) nameEl.textContent = `${offT.name} (Official Template)`;
      if (cardEl) cardEl.style.display = 'flex';
      if (dropEl) dropEl.style.display = 'none';
    }
    if (offM && (!ProofStudio.slots.mockup || !ProofStudio.slots.mockup.isCustom)) {
      ProofStudio.setSlot('mockup', offM.mockupFile, offM.name);
      const cardEl = document.getElementById('prev-mockup');
      const dropEl = document.getElementById('drop-mockup');
      const imgEl = document.getElementById('prev-img-mockup');
      const nameEl = document.getElementById('prev-name-mockup');
      if (imgEl) imgEl.src = offM.mockupFile;
      if (nameEl) nameEl.textContent = `${offM.name} (Official 3D Mockup)`;
      if (cardEl) cardEl.style.display = 'flex';
      if (dropEl) dropEl.style.display = 'none';
    }
  }

  // Re-render Canvas Inspector if canvas exists
  if (document.getElementById('artwork-canvas')) {
    CanvasInspector.renderArtwork(
      appState.analysis?.previewDataUrl || appState.previewDataUrl,
      appState.product,
      appState.userDims
    );
  }

  renderSpecBox(spec);
  updateBreadcrumbs();
  generateProofView();
}

function onProofDimsChange() {
  const w = parseFloat(document.getElementById('proof-w')?.value);
  const h = parseFloat(document.getElementById('proof-h')?.value);
  if (!isNaN(w) && w > 0 && !isNaN(h) && h > 0) {
    appState.userDims = {
      widthIn: w,
      heightIn: h,
      unit: 'in'
    };
    const printW = document.getElementById('print-w');
    const printH = document.getElementById('print-h');
    if (printW) printW.value = w;
    if (printH) printH.value = h;
    generateProofView();
  }
}

function generateProofView() {
  const currentArt = appState.analysis?.previewDataUrl || appState.previewDataUrl;
  if (currentArt && (!ProofStudio.slots.overall || !ProofStudio.slots.overall.isCustom)) {
    ProofStudio.setSlot('overall', currentArt, appState.file?.name || 'Customer Artwork');
    const prevImg = document.getElementById('prev-img-overall');
    const prevName = document.getElementById('prev-name-overall');
    const prevCard = document.getElementById('prev-overall');
    const dropZone = document.getElementById('drop-overall');
    if (prevImg) prevImg.src = currentArt;
    if (prevName) prevName.textContent = appState.file?.name || 'Customer Artwork';
    if (prevCard) prevCard.style.display = 'flex';
    if (dropZone) dropZone.style.display = 'none';
  }

  // Auto-populate Slot 2 (Template) with official QNAP template if no custom upload is active
  const qnapTemplate = (typeof getOfficialProductTemplate === 'function')
    ? getOfficialProductTemplate(appState.product?.slug || appState.product?.name, appState.userDims)
    : null;
  if (qnapTemplate && (!ProofStudio.slots.template || !ProofStudio.slots.template.isCustom)) {
    ProofStudio.setSlot('template', qnapTemplate.templateFile, qnapTemplate.name);
    const prevImg = document.getElementById('prev-img-template');
    const prevName = document.getElementById('prev-name-template');
    const prevCard = document.getElementById('prev-template');
    const dropZone = document.getElementById('drop-template');
    if (prevImg) prevImg.src = qnapTemplate.templateFile;
    if (prevName) prevName.innerHTML = `<span style="color:#16a34a; font-weight:700;">QNAP:</span> ${qnapTemplate.name}`;
    if (prevCard) prevCard.style.display = 'flex';
    if (dropZone) dropZone.style.display = 'none';
  }

  // Auto-populate Slot 3 (Mockup) with official QNAP 3D mockup if no custom upload is active
  const qnapMockup = (typeof getOfficialProductMockup === 'function')
    ? getOfficialProductMockup(appState.product?.slug || appState.product?.name, appState.userDims)
    : null;
  if (qnapMockup && (!ProofStudio.slots.mockup || !ProofStudio.slots.mockup.isCustom)) {
    ProofStudio.setSlot('mockup', qnapMockup.mockupFile, qnapMockup.name);
    const prevImg = document.getElementById('prev-img-mockup');
    const prevName = document.getElementById('prev-name-mockup');
    const prevCard = document.getElementById('prev-mockup');
    const dropZone = document.getElementById('drop-mockup');
    if (prevImg) prevImg.src = qnapMockup.mockupFile;
    if (prevName) prevName.innerHTML = `<span style="color:#16a34a; font-weight:700;">QNAP:</span> ${qnapMockup.name}`;
    if (prevCard) prevCard.style.display = 'flex';
    if (dropZone) dropZone.style.display = 'none';
  }

  // Sync inputs with state
  const proofOrdInput = document.getElementById('proof-order-num');
  if (proofOrdInput) {
    if (appState.orderNum) proofOrdInput.value = appState.orderNum;
    else if (proofOrdInput.value) appState.orderNum = proofOrdInput.value;
  }

  const proofProdSelect = document.getElementById('proof-product-select');
  if (proofProdSelect && appState.product?.slug) {
    proofProdSelect.value = appState.product.slug;
  }

  const proofWInput = document.getElementById('proof-w');
  const proofHInput = document.getElementById('proof-h');
  if (proofWInput && proofHInput && appState.userDims?.widthIn) {
    proofWInput.value = appState.userDims.widthIn;
    proofHInput.value = appState.userDims.heightIn;
  }

  const spec = appState.product || (typeof SPECS !== 'undefined' && SPECS['custom-vinyl-banners']) || {
    name: 'Custom Vinyl Banners',
    material: '13 oz. Premium Vinyl',
    finishing: 'HP, Full Color, Eco Solvent Printing (for Single-Sided)',
    defaultW: 36,
    defaultH: 24
  };

  const orderNum = appState.orderNum || appState.parsedFilename?.orderNum || (appState.file ? 'ORD-' + Math.abs(appState.file.name.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)).toString().slice(0, 7) : 'CA2384567');

  const finishingSummary = appState.finishingDetailsSummary 
    || appState.parsedFilename?.finishing 
    || spec.finishing 
    || 'Standard Trim & Edge Finishing';

  const orderData = {
    orderNum: orderNum,
    customer: appState.customerName || (appState.parsedFilename?.customer || 'Customer'),
    spec: spec,
    dims: (appState.userDims?.widthIn ? appState.userDims : { widthIn: spec.defaultW || 36, heightIn: spec.defaultH || 24, unit: 'in' }),
    analysis: {
      ...(appState.analysis || {}),
      ...(appState.parsedFilename || {}),
      orderNum: orderNum,
      productName: spec.name,
      finishing: finishingSummary
    },
    designerNotes: document.getElementById('notes')?.value || '',
    messageToCustomer: document.getElementById('proof-note')?.value || ''
  };

  // Ensure ProofStudio slots 1, 2, and 3 are initialized with artwork, official template & 3D mockup
  if (!ProofStudio.slots.overall?.dataUrl && currentArt) {
    ProofStudio.setSlot('overall', currentArt, appState.file?.name || 'Artwork');
  }
  if ((!ProofStudio.slots.template?.dataUrl || !ProofStudio.slots.template.isCustom) && typeof getOfficialProductTemplate === 'function') {
    const offT = getOfficialProductTemplate(spec?.slug || spec?.name, orderData.dims);
    if (offT && offT.templateFile) {
      ProofStudio.setSlot('template', offT.templateFile, offT.name);
    }
  }
  if ((!ProofStudio.slots.mockup?.dataUrl || !ProofStudio.slots.mockup.isCustom) && typeof getOfficialProductMockup === 'function') {
    const offM = getOfficialProductMockup(spec?.slug || spec?.name, orderData.dims);
    if (offM && offM.mockupFile) {
      ProofStudio.setSlot('mockup', offM.mockupFile, offM.name);
    }
  }

  const proofEmpty = document.getElementById('proof-empty');
  if (proofEmpty) proofEmpty.style.display = 'none';

  const proofOut = document.getElementById('proof-output');
  if (proofOut) {
    proofOut.style.display = 'block';
    ProofStudio.renderProof(orderData, 'proof-output');
  }
  syncProofSlotCards();

  updateBreadcrumbs();

  const printBtn = document.getElementById('proof-print-btn');
  if (printBtn) printBtn.disabled = false;
  const shareBtn = document.getElementById('proof-share-btn');
  if (shareBtn) shareBtn.disabled = false;
}

/** Open the file picker of a proof slot (sidebar buttons and the Replace buttons on the proof itself) */
function proofSlotUpload(key) {
  const input = document.getElementById(`in-${key}`);
  if (input) { input.value = ''; input.click(); }
}

/**
 * Sidebar slot cards follow the slot state: picture, file name, where it came from (auto / uploaded by the
 * designer) and a revert button only for uploads. Called after every proof render.
 */
function syncProofSlotCards() {
  if (typeof ProofStudio === 'undefined') return;
  ['overall', 'template', 'mockup', 'crop'].forEach(key => {
    const s = ProofStudio.slots[key];
    const has = !!(s && s.dataUrl);
    const card = document.getElementById(`prev-${key}`);
    const drop = document.getElementById(`drop-${key}`);
    if (card) card.style.display = has ? 'flex' : 'none';
    if (drop) drop.style.display = has ? 'none' : 'block';
    if (!has) return;
    const img = document.getElementById(`prev-img-${key}`);
    const name = document.getElementById(`prev-name-${key}`);
    const src = document.getElementById(`prev-src-${key}`);
    const rm = document.getElementById(`rm-${key}`);
    if (img && img.getAttribute('src') !== s.dataUrl) img.src = s.dataUrl;
    if (name) { name.textContent = s.name || key; name.title = s.name || ''; }
    if (src) {
      src.textContent = s.isCustom ? '✔ Uploaded' : key === 'overall' ? 'Auto · pre-check artwork' : 'Auto · QNAP library';
      src.title = s.isCustom ? 'Uploaded by the designer — ↺ goes back to the automatic one' : 'Filled automatically — Replace it if it is wrong';
      src.className = 'preview-src' + (s.isCustom ? ' custom' : '');
    }
    if (rm) rm.style.display = s.isCustom ? 'flex' : 'none';
  });
}

/**
 * Designer upload into a proof slot — the auto-filled proof / template / mockup / screenshot is wrong.
 * JPG / PNG / WEBP / GIF as they are; PDF (and PDF-compatible AI) page 1 rendered to JPG with pdf.js.
 */
function handleProofSlotFile(key, event) {
  const f = event.target.files && event.target.files[0];
  if (!f) return;
  const isPdf = f.type === 'application/pdf' || /\.(pdf|ai)$/i.test(f.name);
  const isImage = /^image\/(jpeg|png|webp|gif)$/i.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name);
  if (!isPdf && !isImage) {
    alert(`"${f.name}" cannot be shown on the proof. Please upload the proof as JPG, PNG or PDF.`);
    return;
  }
  if (isPdf) {
    FileAnalyzer._renderPdfPage(f, 3000).then(out => {
      if (out && out.dataUrl) applyProofSlotFile(key, f, out.dataUrl);
      else alert(`"${f.name}" could not be read. Please save the proof as JPG or PNG and upload it again.`);
    });
    return;
  }
  const r = new FileReader();
  r.onload = (e) => applyProofSlotFile(key, f, e.target.result);
  r.readAsDataURL(f);
}

function applyProofSlotFile(key, f, dataUrl) {
  ProofStudio.setSlot(key, dataUrl, f.name);
  if (ProofStudio.slots[key]) {
    ProofStudio.slots[key].isCustom = true;
  }

  if (key === 'crop') {
    const badge = document.getElementById('crop-status-badge');
    if (badge) {
      badge.textContent = 'CUSTOM CROP';
      badge.style.background = '#dcfce7';
      badge.style.color = '#16a34a';
    }
  }

  // Parse filename to auto-detect order, product, dimensions, and finishing (for overall proof) — only for a
  // production file name; a plain "proof.jpg" must not wipe the order already loaded by the pre-check
  if (key === 'overall') {
    const parsed = FileAnalyzer.parseFilename(f.name);
    if (parsed && parsed.orderNum) {
      appState.orderNum = parsed.orderNum;
      const ordInput = document.getElementById('order-num');
      if (ordInput) ordInput.value = parsed.orderNum;
      const proofOrdInput = document.getElementById('proof-order-num');
      if (proofOrdInput) proofOrdInput.value = parsed.orderNum;
      const spec = parsed.spec || (parsed.productSlug && SPECS[parsed.productSlug]);
      if (spec) {
        appState.product = spec;
        if (spec._catKey) {
          const catSel = document.getElementById('cat-select');
          if (catSel) catSel.value = spec._catKey;
          onCategoryChange();
        }
        const prodSel = document.getElementById('product-select');
        if (prodSel) prodSel.value = spec.slug || parsed.productSlug;
        const proofProdSel = document.getElementById('proof-product-select');
        if (proofProdSel) proofProdSel.value = spec.slug || parsed.productSlug;
      }
      if (parsed.widthIn && parsed.heightIn) {
        appState.userDims = {
          widthIn: parsed.widthIn,
          heightIn: parsed.heightIn,
          unit: 'in',
          hasGrommets: parsed.hasGrommets,
          hasPolePockets: parsed.hasPolePockets,
          finishingDetails: parsed.finishingDetails,
          pocketType: parsed.finishingDetails?.pockets,
          grommetType: parsed.finishingDetails?.grommets
        };
        const wInput = document.getElementById('print-w');
        const hInput = document.getElementById('print-h');
        if (wInput) wInput.value = parsed.widthIn;
        if (hInput) hInput.value = parsed.heightIn;
        const proofW = document.getElementById('proof-w');
        const proofH = document.getElementById('proof-h');
        if (proofW) proofW.value = parsed.widthIn;
        if (proofH) proofH.value = parsed.heightIn;
      }
      appState.parsedFilename = parsed;
      updateBreadcrumbs();
    }
  }

  generateProofView();
}

function clearProofSlot(key) {
  ProofStudio.clearSlot(key);
  const cardEl = document.getElementById(`prev-${key}`);
  const dropEl = document.getElementById(`drop-${key}`);
  const inEl = document.getElementById(`in-${key}`);
  if (cardEl) cardEl.style.display = 'none';
  if (dropEl) dropEl.style.display = 'block';
  if (inEl) inEl.value = '';

  if (key === 'crop') {
    const badge = document.getElementById('crop-status-badge');
    if (badge) {
      const w = parseFloat(appState.userDims?.widthIn) || 36;
      const h = parseFloat(appState.userDims?.heightIn) || 24;
      const pText = Math.max(w, h) > 72 ? '100%' : '114.4%';
      badge.textContent = `AUTO ${pText} CROP`;
      badge.style.background = '#ede9fe';
      badge.style.color = '#4739d2';
    }
  }

  generateProofView();
}

// Proof 03 print preview screenshot: the SOP decides automatically (low resolution only); this box overrides it
function onCropShotToggle(checked) {
  if (typeof ProofStudio !== 'undefined' && ProofStudio.setPrintPreview) ProofStudio.setPrintPreview(checked);
}

// Colour concern proof: only the designer adds it (box shown when the colour check found a colour issue)
function onColourProofToggle(checked) {
  if (typeof ProofStudio !== 'undefined' && ProofStudio.setColourSection) ProofStudio.setColourSection(checked);
}

/**
 * Product Rules Catalog Table
 */
/**
 * Product Rules Catalog Table with Category Filter & Live Search
 */
let _rulesCatInitialized = false;

function renderRulesCatalog() {
  const filterSel = document.getElementById('rules-cat-filter');
  if (filterSel && !_rulesCatInitialized) {
    filterSel.innerHTML = '<option value="">All Categories (626 products)</option>';
    Object.entries(CATEGORIES).forEach(([key, cat]) => {
      const opt = document.createElement('option');
      opt.value = key;
      const count = Object.keys(cat.products || {}).length;
      opt.textContent = `${cat.label} (${count})`;
      filterSel.appendChild(opt);
    });
    _rulesCatInitialized = true;
  }
  // Banner finishing SOP (grommet table, pole pockets, hems) above the product list
  const finRef = document.getElementById('rules-finishing-sop');
  if (finRef && typeof SopRules !== 'undefined' && !finRef.innerHTML) {
    finRef.innerHTML = `<div style="background:#fff; border:1px solid var(--border); border-radius:8px; padding:14px 16px; margin-bottom:14px;">${SopRules.renderProofReference()}${SopRules.renderFinishingReference()}</div>`;
  }
  filterRulesTable();
}

function filterRulesTable() {
  const container = document.getElementById('rules-table-container');
  if (!container) return;

  const catFilter = document.getElementById('rules-cat-filter')?.value || '';
  const search = (document.getElementById('rules-search-input')?.value || '').trim().toLowerCase();
  const countBadge = document.getElementById('rules-count-badge');

  let list = [];
  if (catFilter && CATEGORIES[catFilter]) {
    const cat = CATEGORIES[catFilter];
    Object.entries(cat.products).forEach(([slug, pr]) => {
      list.push({ ...pr, _catKey: catFilter, _catLabel: cat.label });
    });
  } else {
    Object.entries(CATEGORIES).forEach(([ck, cat]) => {
      Object.entries(cat.products).forEach(([slug, pr]) => {
        list.push({ ...pr, _catKey: ck, _catLabel: cat.label });
      });
    });
  }

  if (search) {
    list = list.filter(item => {
      const q = `${item.name} ${item.slug} ${item.material || ''} ${item.finishing || ''} ${item._catLabel || ''}`.toLowerCase();
      return q.includes(search);
    });
  }

  if (countBadge) {
    countBadge.textContent = `Showing ${list.length} Products`;
  }

  if (list.length === 0) {
    container.innerHTML = `
      <div style="background:#fff; border-radius:8px; padding:40px; text-align:center; border:1px solid var(--border);">
        <div style="font-size:32px; margin-bottom:8px;">🔍</div>
        <div style="font-weight:700; color:var(--bb-navy); font-size:15px;">No products match your search</div>
        <div style="color:var(--text-muted); font-size:13px; margin-top:4px;">Try clearing filters or searching for terms like "vinyl", "mesh", "acrylic", or "flag".</div>
      </div>
    `;
    return;
  }

  // Display top 150 items to keep DOM performant, with notice if truncated
  const displayList = list.slice(0, 150);
  let rows = '';
  displayList.forEach(s => {
    rows += `
      <tr style="border-bottom:1px solid #e8ecf2; font-size:12px;">
        <td style="padding:10px; font-weight:700; color:#1a2340;">
          <div>${s.name}</div>
          <div style="font-size:10.5px; color:#64748b; font-family:monospace; margin-top:2px;">${s.slug}</div>
        </td>
        <td style="padding:10px;"><span class="v-tag" style="background:#f1f5f9; color:#334155; font-size:11px;">${s._catLabel || ''}</span></td>
        <td style="padding:10px;"><span class="v-tag" style="background:#eef2ff; color:#3b82f6; font-weight:700;">${s.resolution}</span></td>
        <td style="padding:10px; font-weight:600;">${s.safeArea}</td>
        <td style="padding:10px;">${s.bleed}</td>
        <td style="padding:10px;">${s.minFont}</td>
        <td style="padding:10px; color:#4a5568; max-width:180px;">${s.material || 'Standard Production Material'}</td>
        <td style="padding:10px; color:#4a5568; max-width:200px;">${s.finishing || 'Standard Finishing'}</td>
      </tr>
    `;
  });

  const truncateNotice = list.length > 150
    ? `<div style="padding:10px 14px; background:#fff8e6; border-top:1px solid #fed7aa; color:#92400e; font-size:11.5px; font-weight:600;">
         Showing first 150 of ${list.length} results. Use the Category selector or Search box above to narrow down products.
       </div>`
    : '';

  container.innerHTML = `
    <div style="background:#fff; border-radius:8px; overflow:hidden; box-shadow:var(--shadow-sm); border:1px solid var(--border);">
      <div style="overflow-x:auto;">
        <table style="width:100%; border-collapse:collapse; text-align:left;">
          <thead>
            <tr style="background:#1a2340; color:#fff; font-size:11px; text-transform:uppercase; letter-spacing:0.06em;">
              <th style="padding:12px 10px;">Product Name &amp; Slug</th>
              <th style="padding:12px 10px;">Category</th>
              <th style="padding:12px 10px;">Resolution</th>
              <th style="padding:12px 10px;">Safe Area</th>
              <th style="padding:12px 10px;">Bleed</th>
              <th style="padding:12px 10px;">Min Font</th>
              <th style="padding:12px 10px;">Material</th>
              <th style="padding:12px 10px;">Finishing Details</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${truncateNotice}
    </div>
  `;
}

/**
 * Open high-resolution asset preview lightbox
 */
function openAssetLightbox(src, title, sub) {
  const modal = document.getElementById('asset-lightbox-modal');
  const img = document.getElementById('asset-modal-img');
  const titleEl = document.getElementById('asset-modal-title');
  const subEl = document.getElementById('asset-modal-sub');
  if (img) img.src = src;
  if (titleEl) titleEl.textContent = title || 'Official BannerBuzz Asset';
  if (subEl && sub) subEl.textContent = sub;
  if (modal) modal.classList.add('active');
}

/**
 * Close high-resolution asset preview lightbox
 */
function closeAssetLightbox() {
  const modal = document.getElementById('asset-lightbox-modal');
  if (modal) modal.classList.remove('active');
}
