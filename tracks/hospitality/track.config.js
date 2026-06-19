// tracks/hospitality/track.config.js
// "Hospitality and Public Services" track: 5 hands-on AAS programs grouped into 4 worlds.
// Program data vendored in this folder (sheets.json etc.), sourced from the CPCC catalog.
export default {
  id: 'hospitality',
  title: 'Central Piedmont — Hospitality & Public Services',
  fleet: 'cpcc-hospitality-kiosk',
  pagesBase: 'https://centralpiedmont.github.io/degree-explorer/hospitality/sheets',
  // TODO: replace with a real hospitality info-session / advising registration URL.
  infoSessionUrl: 'https://www.cpcc.edu/',
  theme: { /* track colors are supplied by world entries + styles.css vars; reserved for future overrides */ },
  features: { worldTilePhotos: true, admissions: false, specializations: false },
  copy: {
    topbarLabel: 'Hospitality & Public Services',
    attractSub: 'Explore 5 hands-on programs and find yours in three taps.',
    infoButton: 'Sign up for an information session',
    ceHeading: 'Certifications &amp; Short Courses',
    resultEyebrow: 'YOUR MATCH',
  },
  tileTint: {
    'culinary-arts': { color: '#A4262C', text: '#FFFFFF' },
    'baking-pastry': { color: '#7A1F23', text: '#FFFFFF' },
  },
  tileDesc: {
    'culinary-arts': 'Cook professionally in restaurants and resorts',
    'baking-pastry': 'Craft breads, pastries, cakes, and chocolate',
    'hospitality-management': 'Manage hotels, events, and guest services',
    'cosmetology': 'Hair, skin, and nail artistry for the salon',
    'horticulture-technology': 'Grow plants, design and manage landscapes',
  },
  worlds: [
    { id: 'food', name: 'Culinary & Baking',
      desc: 'Cook, bake, and create in professional kitchens',
      color: '#A4262C', text: '#FFFFFF',
      programIds: ['culinary-arts', 'baking-pastry'] },
    { id: 'hospitality', name: 'Hotels, Events & Tourism',
      desc: 'Lead the businesses built on great guest experiences',
      color: '#005D83', text: '#FFFFFF',
      programIds: ['hospitality-management'] },
    { id: 'beauty', name: 'Cosmetology & Salon',
      desc: 'Hair, skin, and nail artistry behind the chair',
      color: '#672666', text: '#FFFFFF',
      programIds: ['cosmetology'] },
    { id: 'green', name: 'Horticulture & Landscaping',
      desc: 'Work with plants, gardens, and the green industry',
      color: '#B4A269', text: '#1A1A1A',
      programIds: ['horticulture-technology'] },
  ],
};
