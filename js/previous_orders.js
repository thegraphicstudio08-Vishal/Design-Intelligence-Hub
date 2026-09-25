/**
 * Design Intelligence Hub - Customer Previous Orders Engine
 * Sourced directly from Design Projects brief: "Customer Previous Orders with Same Products"
 * Facilitates product consistency, recreation reuse, sample-to-bulk matching, and proofing reduction.
 */

const PreviousOrdersEngine = {
  // Mock customer order history repository
  _database: [
    {
      orderNum: 'US948210',
      customerId: 'CUST-8841',
      customerName: 'Acme Corporation',
      customerEmail: 'orders@acmeco.com',
      date: '14 May 2026',
      productSlug: 'custom-vinyl-banner',
      productName: 'Custom Vinyl Banners',
      widthIn: 36,
      heightIn: 24,
      material: '13oz Vinyl',
      finishing: 'Metal grommets every 24", 1" hem',
      artworkSimilarity: 98,
      productSimilarity: 100,
      wasApproved: true,
      approvalType: 'Same Product + Same Artwork',
      customerApprovedDate: '15 May 2026',
      approvedNotes: 'Customer approved vibrant CMYK conversion and grommet spacing. No proofing needed if re-ordering identical artwork.',
      sampleToBulk: false
    },
    {
      orderNum: 'US892110',
      customerId: 'CUST-7219',
      customerName: 'Nexus Marketing',
      customerEmail: 'design@nexus.org',
      date: '28 Jan 2026',
      productSlug: 'step-repeat-banner',
      productName: 'Step and Repeat Banners',
      widthIn: 96,
      heightIn: 96,
      material: '13oz Vinyl',
      finishing: 'Pole pockets top and bottom',
      artworkSimilarity: 91,
      productSimilarity: 100,
      wasApproved: true,
      approvalType: 'Previously Recreated Vector Artwork',
      customerApprovedDate: '30 Jan 2026',
      approvedNotes: 'Low-res logo was redrawn into vector by Design Team in US892110. Recreated vector file saved in admin.',
      sampleToBulk: false
    },
    {
      orderNum: 'US841029',
      customerId: 'CUST-3312',
      customerName: 'Summit Athletics',
      customerEmail: 'sports@summit.edu',
      date: '05 Mar 2026',
      productSlug: 'feather-flag',
      productName: 'Feather Flags',
      widthIn: 24,
      heightIn: 118,
      material: 'Knitted Polyester (90 GSM)',
      finishing: 'Left black pole sleeve',
      artworkSimilarity: 88,
      productSimilarity: 100,
      wasApproved: true,
      approvalType: 'Previous Sample → Current Bulk Order',
      customerApprovedDate: '09 Mar 2026',
      approvedNotes: 'Customer ordered 1 sample flag. Approved exact color match (#003366 Navy). Replicate exact settings for bulk.',
      sampleToBulk: true
    }
  ],

  /**
   * Search previous orders matching customer or product
   * @param {string} customerSearch - Customer Name, ID, or Email
   * @param {string} productSlug - Current selected product slug
   * @returns {Array<Object>} List of relevant matching previous orders
   */
  findMatches(customerSearch, productSlug) {
    const q = (customerSearch || '').trim().toLowerCase();
    
    // First try matching customer + product
    let matches = this._database.filter(ord => {
      const matchCust = q && (
        ord.customerName.toLowerCase().includes(q) ||
        ord.customerId.toLowerCase().includes(q) ||
        ord.customerEmail.toLowerCase().includes(q)
      );
      const matchProd = ord.productSlug === productSlug;
      return matchCust || matchProd;
    });

    // If no direct query match, provide mock similar historical record for testing
    if (matches.length === 0 && productSlug) {
      const randomOrder = 'US' + Math.floor(Math.random() * 800000 + 100000);
      matches = [{
        orderNum: randomOrder,
        customerId: 'CUST-AUTO',
        customerName: customerSearch || 'Corporate Client',
        customerEmail: 'contact@client.com',
        date: '12 Feb 2026',
        productSlug: productSlug,
        productName: (SPECS && SPECS[productSlug]?.name) || 'Matching Product',
        widthIn: (SPECS && SPECS[productSlug]?.defaultW) || 36,
        heightIn: (SPECS && SPECS[productSlug]?.defaultH) || 24,
        material: (SPECS && SPECS[productSlug]?.material) || 'Standard Production Material',
        finishing: (SPECS && SPECS[productSlug]?.finishing) || 'Standard Finishing',
        artworkSimilarity: 84,
        productSimilarity: 95,
        wasApproved: true,
        approvalType: 'Previous Customer Approval Available',
        customerApprovedDate: '14 Feb 2026',
        approvedNotes: 'Customer approved template safe area margins and SWOP v2 color profile.',
        sampleToBulk: false
      }];
    }

    return matches;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PreviousOrdersEngine;
}
