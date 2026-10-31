// All site content lives here. Edit this file to update the website —
// no HTML changes needed.

module.exports = {
  name: 'Umit Bozdag',
  firstName: 'Umit',
  title: 'Senior Operations Manager',
  company: 'Media10',
  location: 'London, United Kingdom',
  email: 'UmitBozdag@live.com',
  // phone: '+44 (0)7704 050921', // uncomment to show phone number publicly
  linkedin: 'https://www.linkedin.com/in/umit-bozdag/',
  website: 'https://www.umitbozdag.com',

  tagline: 'I build the operational frameworks that make complex events run smoothly.',
  intro:
    'Over a decade delivering large-scale international exhibitions and conferences across the UK, Europe, Asia and the Americas. I manage tight budgets, negotiate with global suppliers and keep cross-functional teams aligned under pressure — and I pair that operational backbone with hands-on technical execution, using generative AI and rapid prototyping to build scalable tools in house.',

  languages: ['English', 'Turkish'],

  stats: [
    { value: 14, suffix: '+', label: 'Years in events' },
    { value: 50000, suffix: '+', label: 'Visitors at a single show' },
    { value: 1000, suffix: '+', label: 'Exhibitors per event' },
    { value: 100, suffix: '+', label: 'Countries represented' },
  ],

  experience: [
    {
      hall: 'Hall 05',
      role: 'Senior Operations Manager',
      company: 'Media10',
      place: 'London',
      period: '2026 — Present',
      current: true,
      summary:
        'Leading operations on Media10’s built-environment portfolio — the UK’s largest construction, sustainability and surfaces events, in London and Birmingham.',
      points: [
        'Senior operational lead across multiple shows, from venue contracting to build-up and breakdown.',
        'Owning operational budgets, supplier strategy and onsite health & safety.',
        'Building in-house digital tools and AI-assisted workflows to make delivery faster and leaner.',
      ],
      events: [
        { name: 'UK Construction Week London', note: 'ExCeL London' },
        { name: 'Future Build', note: 'London' },
        { name: 'Stone & Surfaces Show', note: 'London' },
        { name: 'UK Construction Week Birmingham', note: 'NEC Birmingham' },
      ],
    },
    {
      hall: 'Hall 04',
      role: 'Operations Manager',
      company: 'DMG Events',
      place: 'London',
      period: '2025 — 2026',
      summary:
        'One of three operations managers on Gastech — a show that moves every year between Europe, Asia and the Americas, attracting 50,000 visitors and 1,000+ exhibitors from over 100 countries.',
      points: [
        'Led catering, signage, security, staffing and onsite services (internet, electricity, cleaning).',
        'Partnered with the Director of Operations on operational budgeting.',
        'Pre- and post-event site visits with venues and suppliers; negotiated favourable rates.',
        'Managed design and construction of feature areas within specification and budget.',
        'Health & safety control and monitoring; exceptional exhibitor customer service.',
      ],
      events: [
        { name: 'Gastech Milan 2025', note: 'Operational lead — sponsorship, signage, temp staff, internet, venue liaison, meeting rooms, catering' },
        { name: 'World LNG Istanbul 2025', note: 'Operational support — signage, temp staff, venue liaison, meeting rooms, catering' },
        { name: 'Bharat Electricity Summit, New Delhi 2025', note: 'Operational support' },
      ],
    },
    {
      hall: 'Hall 03',
      role: 'Operations Manager',
      company: 'Hyve Group',
      place: 'London',
      period: '2023 — 2025',
      summary:
        'Ran two industry-leading events in the global cargo industry — Breakbulk Europe and Breakbulk Americas — with 18,000+ visitors and 1,000 exhibitors, managed end to end.',
      points: [
        'Led catering, cleaning, signage, security and staffing projects.',
        'Ensured floorplan compliance with venue and local regulations.',
        'Operational budgeting with the Head of Operations.',
        'Sponsorship management: trackers, new opportunities, sponsor point of contact.',
        'Designed and built feature areas within specification and budget.',
      ],
      events: [
        { name: 'Breakbulk Europe 2023 & 2024', note: 'Operational lead — sponsorship, signage, temp staff, internet, venue liaison, catering' },
        { name: 'Breakbulk Americas 2023 & 2024', note: 'Operational support — signage, temp staff, venue, meeting rooms, catering, exhibitor party' },
        { name: 'Pure London 2023 & 2024', note: 'Operational support' },
      ],
    },
    {
      hall: 'Hall 02',
      role: 'Exhibitions & Marketing Officer',
      company: 'Turkish Culture & Information Office — Turkish Embassy in London',
      place: 'London',
      period: '2014 — 2022',
      summary:
        'Promoted Turkish culture and tourism across the UK, Ireland and South Africa, delivering strategic initiatives with the Ministry of Culture and Tourism in Ankara.',
      points: [
        'Prepared tender documents under Turkish law for stand builds at B2B and B2C events.',
        'Negotiated with all suppliers on behalf of the office.',
        'Led joint marketing campaigns with tour operators including TUI and Jet2holidays.',
        'Hosted VIPs — ministers, MPs and senior diplomats — for events and business visits.',
      ],
      events: [
        { name: 'World Travel Market London & Africa', note: '' },
        { name: 'London Fashion Week', note: 'Lead on sponsorship for Turkish designer Bora Aksu; lead contact for Zeynep Kartal at Somerset House' },
        { name: 'London Book Fair · London Boat Show', note: '' },
        { name: 'International Confex · The Meetings Show · Destinations', note: '' },
        { name: 'Taste of London · Hampton Court Palace Garden Festival', note: '' },
        { name: 'Roadshows across the UK, Ireland & South Africa', note: '' },
      ],
    },
    {
      hall: 'Hall 01',
      role: 'Information Officer',
      company: 'Turkish Culture & Information Office — Turkish Embassy in London',
      place: 'London',
      period: '2012 — 2014',
      summary:
        'The public face of Turkish tourism in the UK — advising travellers on everything from local bus timetables to translating prescriptions.',
      points: [
        'Advised visitors on travel plans and distributed brochures and maps.',
        'Represented the office at B2B and B2C shows.',
        'Office management: suppliers, building agents and director support.',
      ],
      events: [],
    },
  ],

  // Cities shown on the "world tour" map. `label` nudges the caption
  // ('left', 'below' or 'left below') to avoid overlaps in dense clusters.
  cities: [
    { name: 'London', lat: 51.5, lon: -0.12, hq: true, label: 'left' },
    { name: 'Rotterdam', lat: 51.92, lon: 4.48 },
    { name: 'Milan', lat: 45.46, lon: 9.19, label: 'below' },
    { name: 'Istanbul', lat: 41.01, lon: 28.98 },
    { name: 'Dublin', lat: 53.35, lon: -6.26, label: 'left below' },
    { name: 'New Delhi', lat: 28.61, lon: 77.21 },
    { name: 'Houston', lat: 29.76, lon: -95.37 },
    { name: 'Cape Town', lat: -33.92, lon: 18.42 },
  ],

  ticker: [
    'UK Construction Week', 'Future Build', 'Stone & Surfaces', 'Gastech', 'Breakbulk Europe', 'Breakbulk Americas', 'World LNG', 'Pure London',
    'World Travel Market', 'London Fashion Week', 'London Book Fair', 'London Boat Show',
    'The Meetings Show', 'International Confex', 'Taste of London', 'Bharat Electricity Summit',
    'Hampton Court Palace Garden Festival',
  ],

  expertise: [
    { icon: 'plan', title: 'Strategic Event Planning', text: 'End-to-end delivery from site visits and floorplans to build-up, live days and breakdown.' },
    { icon: 'deal', title: 'Supplier Negotiation', text: 'Long-standing supplier relationships and favourable rates across catering, AV, staffing and stand build.' },
    { icon: 'budget', title: 'Operational Budgeting', text: 'Building and managing ops budgets alongside directors — no surprises on the final reconciliation.' },
    { icon: 'shield', title: 'Health & Safety', text: 'IOSH Safe Management at Live Events. Compliance, risk control and monitoring on the show floor.' },
    { icon: 'star', title: 'Sponsorship & Features', text: 'Sponsorship trackers, new revenue ideas and feature areas designed and built on spec.' },
    { icon: 'ai', title: 'AI & Digital Tools', text: 'Generative AI, coding and rapid prototyping to build in-house platforms. Cisco CCNA background.' },
  ],

  credentials: [
    { title: 'IOSH', text: 'Safe Management at Live Events' },
    { title: 'Cisco CCNA', text: 'Cisco Certified Network Associate' },
    { title: 'Kingston University', text: 'Information Systems BSc · Computing HND' },
    { title: 'Creative toolkit', text: 'Photoshop · Illustrator · WordPress · Microsoft Office' },
    { title: 'Off duty', text: 'Amateur drone pilot' },
  ],
};
