// lib/categories.js
// Canonical list of project categories, in a fixed order, used for the WhatsApp
// tappable list message AND for the "reply with a number" fallback - row 1 in the
// list message must always match "1" typed in plain text, and so on.

module.exports = [
  { id: 'architecture_residence', title: 'Architecture - Home', description: 'New home or villa construction' },
  { id: 'interior_residence', title: 'Interior - Home', description: 'Flat, villa, or penthouse interiors' },
  { id: 'architecture_hospital', title: 'Architecture - Hospital', description: 'Hospital building design' },
  { id: 'interior_hospital', title: 'Interior - Hospital', description: 'Hospital interior fit-out' },
  { id: 'architecture_temple_public', title: 'Architecture - Public', description: 'Temple or government/public building' },
  { id: 'interior_office', title: 'Interior - Office', description: 'Office interior design' },
  { id: 'interior_spa', title: 'Interior - Spa', description: 'Spa or wellness space' },
  { id: 'other', title: 'Something else', description: 'Not listed above' },
];
