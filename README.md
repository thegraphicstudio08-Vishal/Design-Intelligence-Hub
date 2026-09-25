# Design Intelligence Hub — BannerBuzz Design Operations

[![Status](https://img.shields.io/badge/status-production--ready-brightgreen.svg)]()
[![Platform](https://img.shields.io/badge/platform-web--browser-orange.svg)]()
[![SOP Compliant](https://img.shields.io/badge/SOP-Caterpillar%20Signs%20%2F%20BannerBuzz-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

> **AI-Powered Design File Pre-Check & Consolidated Customer Proof Studio**  
> An automated pre-flight quality system built according to BannerBuzz Standard Operating Procedures (SOP) and Design Projects specifications.

---

## 📌 Executive Summary

Currently, design teams manually verify multiple technical checkpoints across customer artwork files before sending them to production. This manual process can lead to design file errors, production holds, and replacements/refunds (RRR). Additionally, providing customer proofs via multiple separate JPG files creates confusion and approval delays.

**Design Intelligence Hub** addresses these challenges by delivering:
1. **Universal Artwork Pre-Check**: Accepts any customer file format (`SVG`, `AI`, `EPS`, `PDF`, `JPG`, `PNG`, `TIFF`, `PSD`).
2. **"Good for Print" Vector Protocol**: Automatically detects scale-independent vector artwork and confirms infinite print resolution.
3. **10 Automated SOP Quality Checkpoints**: Validates resolution, size measurements, orientation, lines & dots artifacts, safe zones, bleed, SWOP v2 CMYK color mode, and font legibility.
4. **Interactive Canvas Inspector**: Live visual overlays for Safe Areas (1.25" for vinyl banners), Cut Lines, Bleed, Grommet Spacing (every 24"), and an interactive **100% Zoom Loupe**.
5. **Previous Orders Verification**: Automatically identifies prior orders for the same customer to eliminate artwork recreation touchpoints and leverage past customer approvals.
6. **Consolidated Proof Studio**: Merges entire artwork flat views, 100% scale print crops, product specifications, mockups, and customer sign-off blocks into a single consolidated proof PDF.

---

## 🚀 Key Features

### 1. Universal Artwork Format & Vector Identification
* **Vector Formats (`.SVG`, `.AI`, `.EPS`, `.PDF`)**:
  * Evaluated as **Scale-Independent (Infinite Resolution)**.
  * Displays prominent **"🌟 GOOD FOR PRINT"** badge.
  * In-browser DOM parsing inspects vector curves, paths, viewBox, and detects embedded raster photos.
* **Raster Formats (`.JPG`, `.PNG`, `.WEBP`, `.TIFF`, `.PSD`)**:
  * Calculates exact **Effective DPI** at ordered physical dimensions:
    $$\text{Effective DPI} = \min\left(\frac{W_{px}}{W_{in}}, \frac{H_{px}}{H_{in}}\right)$$
  * Evaluated against product SOP thresholds:
    * Standard Banners: **150 DPI** (100 DPI for billboards >120").
    * Stands & Displays: **150 DPI**.
    * Table Covers & Flags: **150 DPI** (1440 DPI dye-sub output).
    * Signs, Decals, & Marketing Materials: **200–300 DPI**.

### 2. The 10 Automated SOP Checkpoints

| # | Checkpoint | AI & SOP Validation Rule | Output Status |
|---|---|---|---|
| **1** | **Print Suitability ("Good for Print")** | Identifies vector scalability vs raster resolution suitability. | `PASS` / `WARN` / `FAIL` |
| **2** | **Resolution (DPI)** | Verifies effective pixel density against SOP product specification. | `PASS` / `WARN` / `FAIL` |
| **3** | **Size & Physical Measurements** | Compares aspect ratio and dimensions with $\pm 0.5''$ SOP tolerance. | `PASS` / `WARN` / `FAIL` |
| **4** | **Orientation Match** | Verifies Landscape vs Portrait vs Square orientation. | `PASS` / `FAIL` (with 90° rotate tool) |
| **5** | **Lines & Dots Artifacts** | Canvas edge analysis scans for scanner lines, dust spots, or rogue border marks. | `PASS` / `WARN` |
| **6** | **Safe Area Margins** | Verifies critical content remains inside safe zone (1.25" for banners, 1.0" for flags, 0.5" for stands). | `PASS` / `WARN` |
| **7** | **Bleed Allowance** | Checks for required full-color bleed (0.125", 0.5", or 2.0" for mesh fence). | `PASS` / `WARN` |
| **8** | **Color Mode & Profile** | Confirms CMYK (8-bit) `Working CMYK: U.S. Web Coated (SWOP) v2`. Flags RGB gamut shifts. | `PASS` / `WARN` |
| **9** | **Font Size & Legibility** | Validates text point size meets minimum thresholds (6pt–72pt) and avoids 3" stitch lines. | `PASS` / `WARN` |
| **10** | **Spelling & Copy Proofing** | Flags critical text (company names, telephone numbers, URLs, dates) for review. | `PASS` / `WARN` |

### 3. Interactive Canvas Inspector
* **Safe Area Guide**: Visual green dashed line indicating product-specific safe margins.
* **Cut / Trim Line**: Solid perimeter guide displaying exact finished dimensions.
* **Bleed Line**: Visual border ensuring background graphics extend past trim lines.
* **Grommet Spacing**: Renders brass grommet ring markers at standard 24" spacing.
* **100% Zoom Loupe**: Hover magnification tool allowing designers to inspect pixel sharpness and fine text.
* **1-Click 90° Rotation**: Corrects orientation mismatch without leaving the browser.

### 4. Customer Previous Orders Verification
* Automatic lookup by Customer Name, Customer ID, Email, or Order #.
* **Scenario A: Same Product + Same Artwork**: Reuses approved artwork to maintain consistency.
* **Scenario B: Previously Recreated Artwork**: Reuses vectorized artwork and eliminates recreation touchpoints.
* **Scenario C: Sample Order $\rightarrow$ Bulk Order**: Ensures alignment with previously approved sample specifications.
* **Scenario D: Customer Special Approvals**: Reuses confirmed customer approvals (colors, template offsets) to reduce proofing turnaround.

### 5. Single Consolidated Customer Proof Studio
* Solves the fragmented JPG proof issue by merging:
  1. **Original Artwork Proof (Flat Cut View)**
  2. **100% Print-Quality Crop Zoom**
  3. **Product Specifications Matrix**
  4. **Product Template & 3D Real-World Mockup**
  5. **Customer Sign-Off & Approval Block**
* High-definition Print & PDF export via browser print dialog.

### 6. Entire BannerBuzz Product Line (11 Categories, 626 Products)
Sourced directly from `https://www.bannerbuzz.com/` and Caterpillar Signs SOPs:

| Category | Icon | Products | Key Under-Listed Products | Standard SOP Resolution & Bleed |
|---|:---:|:---:|---|---|
| **Banners** | 🎌 | 64 | Custom Vinyl Banners, Mesh Banners, Fabric Banners, Canvas Banners, Step & Repeat Banners, Pole Banners, Birthday/Holiday Banners | 150 DPI · 0.125" Bleed · 1.25" Safe Area |
| **Stands & Displays** | 🖼️ | 65 | Roll Up Banner Stands, X-Banner Stands, Retractable Displays, L-Banner Stands, Outdoor Banner Stands, Tabletop Banner Stands | 150 DPI · 0.50" Bleed · 0.50" Safe Area |
| **Table Covers** | 🪑 | 45 | Custom Table Throws, Stretch Table Covers, Fitted Table Covers, Open Back Covers, Round Table Covers, Table Runners | 150 DPI (1440 DPI dye-sub) · 0.50" Bleed |
| **Custom Flags** | 🚩 | 65 | Feather Flags, Teardrop Flags, Blade Flags, Rectangular Flags, Burgee Flags, Car Flags, Backpack Flags, Giant Pole Flags | 150 DPI · 0.50" Bleed · 1.00" Safe Margin |
| **Custom Signs & Decals** | 🪟 | 63 | Acrylic Signs, Aluminum Signs, Yard Signs, Coroplast Signs, Car Decals, Window Graphics, Perforated One-Way Vision Decals | 200–300 DPI · 0.125" Bleed · 0.25" Safe Area |
| **Trade Show Displays** | 🏪 | 64 | Pop Up Displays, Tension Fabric Displays, EZ Extend Displays, Modular Trade Show Booths, Podium Displays, Backlit Booths | 150 DPI · 0.50" Bleed · 1.00" Safe Area |
| **Marketing Materials** | 📄 | 63 | Business Cards, Flyers, Brochures, Postcards, Bookmarks, Hang Tags, Rack Cards, Folders, Custom Menus | 300 DPI mandatory · 0.125" Bleed · 0.125" Safe |
| **LED Signs & Letters** | 💡 | 37 | Custom Neon LED Signs, Acrylic LED Lettering, Backlit Channel Letters, Edge-Lit Signs, Illuminated Logo Signs | Vector Only (SVG/AI/EPS/PDF) · Cut Contour |
| **Compliance Signs** | ⚠️ | 64 | OSHA Safety Signs, ANSI Warning Signs, ADA Braille Signs, Parking Signs, Fire Exit Signs, Construction Safety Signs | 300 DPI · 0.125" Bleed · Rigid Aluminum/PVC |
| **Boxes & Packaging** | 📦 | 31 | Custom Mailer Boxes, Shipping Boxes, Product Display Boxes, Gable Boxes, Kraft Packaging, Rigid Gift Boxes | 300 DPI · 0.125" Bleed · Die-Cut Crease Line |
| **Clothing & Apparel** | 👕 | 65 | Custom T-Shirts, Polos, Hoodies, Sweatshirts, Aprons, Hats & Caps, Tote Bags, High-Vis Vests, Embroidered Apparel | 300 DPI · 0.00" Bleed · Chest/Back Print Areas |

---

## 📁 Repository Structure

```
├── index.html               # Main application entry point (GitHub Pages ready)
├── package.json             # NPM project configuration & scripts
├── LICENSE                  # MIT License
├── README.md                # Comprehensive documentation
├── css/
│   └── style.css            # Design system, BannerBuzz theme & print styles
├── js/
│   ├── sop_data.js          # Authoritative product catalog & SOP specifications
│   ├── file_analyzer.js     # Universal parser (Vector, PDF, AI, EPS, Raster DPI)
│   ├── precheck_engine.js   # 10 SOP Checkpoint evaluation & scoring engine
│   ├── previous_orders.js   # Customer order matching & consistency engine
│   ├── canvas_inspector.js  # Interactive canvas with SOP overlays & 100% Loupe
│   ├── proof_studio.js      # Consolidated customer proof generator
│   └── app.js               # Application coordinator & UI state manager
└── docs/
    ├── SOP_GUIDELINES.md    # Detailed SOP rules from Caterpillar Signs / BannerBuzz
    └── PRECHECK_PROTOCOL.md # Workflow and business rules from Design Projects brief
```

---

## 🛠️ Getting Started

### Local Setup
The application is entirely client-side with zero external dependencies.

1. **Clone the repository**:
   ```bash
   git clone https://github.com/bannerbuzz/design-intelligence-hub.git
   cd design-intelligence-hub
   ```

2. **Launch with any local web server**:
   ```bash
   # Using Node (npx)
   npx serve .

   # Using Python 3
   python -m http.server 3000
   ```

3. **Open in browser**:
   Navigate to `http://localhost:3000` (or double click `index.html` directly).

---

## 🌐 Deploying to GitHub Pages

1. Push this repository to your GitHub account:
   ```bash
   git remote add origin https://github.com/<your-username>/design-intelligence-hub.git
   git branch -M main
   git push -u origin main
   ```
2. In your GitHub repository, navigate to **Settings** $\rightarrow$ **Pages**.
3. Under **Build and deployment** $\rightarrow$ **Branch**, select `main` and root `/`.
4. Click **Save**. Your tool is instantly live on GitHub Pages!

---

## 📜 Standard Operating Procedure References

* **Banners**: `SOP 1_Banners.pptx` (Vinyl, Mesh, Fabric, Step & Repeat, Backlit, Billboard).
* **Stands & Displays**: `SOP 2_Stands & Displays.pptx` (Roll-ups, Retractable, Pop-Ups, A-Frames).
* **Table Covers**: `SOP 3_Table Covers & Displays.pptx` (Throws, Runners, Fitted).
* **Custom Flags**: `SOP 4_Custom Flags.pptx` (Feather, Teardrop, Blade, Rectangle).
* **Compliance Signs**: `SOP 5_Compliance Signs.pptx` (Safety, Caution, Road, Parking).
* **Signs & Decals**: `SOP 6_Signs & Decals.pptx` (Magnets, Window Clings, Stickers).
* **Marketing Materials**: `SOP 8_Marketing Materials.pptx` (Business Cards, Flyers, Brochures).
* **Outdoor & Trade Show**: `Outdoor Displays_All_Products.pptx` & `Trade Show Displays_All_Products.pptx`.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
