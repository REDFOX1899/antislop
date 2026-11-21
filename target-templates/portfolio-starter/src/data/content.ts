export type PortfolioSectionId = 'about' | 'timeline' | 'reading' | 'design' | 'writing';

export type ReadingCategory = 'All' | 'Design' | 'Systems' | 'Philosophy';

export interface NavItem {
  id: PortfolioSectionId;
  label: string;
  href: string;
}

export interface StatChip {
  value: string;
  label: string;
}

export interface TimelineEntry {
  id: string;
  period: string;
  role: string;
  organization: string;
  location: string;
  summary: string;
  highlights: string[];
}

export interface ReadingEntry {
  id: string;
  title: string;
  author: string;
  year: string;
  category: Exclude<ReadingCategory, 'All'>;
  status: 'Finished' | 'Re-reading' | 'In Progress';
  note: string;
  url: string;
}

export interface DesignProject {
  id: string;
  title: string;
  year: string;
  category: string;
  tagline: string;
  description: string;
  stack: string[];
  liveUrl: string;
  repoUrl: string;
  thumbnailUrl: string;
}

export interface EssayEntry {
  id: string;
  date: string;
  title: string;
  readTime: string;
  tag: string;
  summary: string;
  excerpt: string[];
}

function makeProjectThumb(title: string, subtitle: string, accentA: string, accentB: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" fill="none">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="640" y2="380" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="100%" stop-color="#1e1b4b"/>
      </linearGradient>
      <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${accentA}"/>
        <stop offset="100%" stop-color="${accentB}"/>
      </linearGradient>
    </defs>
    <rect width="640" height="380" fill="url(#bg)"/>
    <circle cx="515" cy="86" r="128" fill="${accentA}" fill-opacity="0.22"/>
    <circle cx="140" cy="320" r="110" fill="${accentB}" fill-opacity="0.18"/>
    <rect x="42" y="42" width="556" height="296" rx="18" fill="#111827" fill-opacity="0.72" stroke="url(#accent)" stroke-opacity="0.55" stroke-width="2"/>
    <circle cx="72" cy="68" r="5" fill="#f87171"/>
    <circle cx="90" cy="68" r="5" fill="#fbbf24"/>
    <circle cx="108" cy="68" r="5" fill="#34d399"/>
    <rect x="72" y="102" width="220" height="16" rx="8" fill="url(#accent)" fill-opacity="0.9"/>
    <rect x="72" y="132" width="380" height="10" rx="5" fill="#64748b" fill-opacity="0.45"/>
    <rect x="72" y="168" width="160" height="110" rx="12" fill="#1e293b" stroke="#6366f1" stroke-opacity="0.4"/>
    <rect x="248" y="168" width="160" height="110" rx="12" fill="#1e293b" stroke="#a855f7" stroke-opacity="0.4"/>
    <rect x="424" y="168" width="144" height="110" rx="12" fill="#1e293b" stroke="#38bdf8" stroke-opacity="0.4"/>
    <text x="72" y="312" fill="#e2e8f0" font-family="Inter, sans-serif" font-size="16" font-weight="700">${title}</text>
    <text x="568" y="312" text-anchor="end" fill="#94a3b8" font-family="Inter, sans-serif" font-size="12" font-weight="500">${subtitle}</text>
  </svg>`)}`;
}

export const PORTFOLIO_CONTENT = {
  person: {
    name: 'Alex Rivera',
    handle: '@alexrivera',
    role: 'AI Systems & Design Engineer',
    location: 'Brooklyn, New York',
    email: 'alex@alexrivera.dev',
    githubUrl: 'https://github.com/alexrivera-dev',
    xUrl: 'https://x.com/alexrivera_dev',
    linkedinUrl: 'https://linkedin.com/in/alexrivera-dev',
    tagline:
      'Building multimodal AI interfaces, calm creative tools, and low-latency frontends with obsessive attention to craft.',
    copyright: '© 2026 Alex Rivera. Built with React + Tailwind.',
  },
  nav: [
    { id: 'about', label: 'About', href: '#about' },
    { id: 'timeline', label: 'Timeline', href: '#timeline' },
    { id: 'reading', label: 'Reading', href: '#reading' },
    { id: 'design', label: 'Design', href: '#design' },
    { id: 'writing', label: 'Writing', href: '#writing' },
  ] as NavItem[],
  hero: {
    badges: [
      'Open to Staff Design Eng Roles',
      'Multimodal AI & Interfaces',
      'New York City',
    ],
    headline: 'Crafting Next-Gen AI Products & Expressive Web Interfaces',
    subheadline:
      'I bridge frontier language models and human visual craft — shipping fast interactive tools, generative canvases, and resilient TypeScript architectures from zero to scale.',
    primaryCta: 'Download CV',
    secondaryCta: 'Explore Design Work',
    artworkCaption: 'Interactive Hero Emblem · Morpho-04 (Floating SVG)',
    /** Optional override if AntiSlop generates a bespoke editorial image at /generated/hero.jpg */
    customArtworkUrl: '' as string,
    stats: [
      { value: '6+ yrs', label: 'Shipping Production UI' },
      { value: '18+', label: 'Open-Source Tools' },
      { value: '2.4M', label: 'Monthly Canvas Runs' },
    ] as StatChip[],
  },
  about: {
    eyebrow: '01 · ABOUT ME',
    title: 'Engineering meets visual direction',
    paragraphs: [
      'I am a software engineer and interface designer based in Brooklyn. Over the last six years I have worked across machine learning tooling, collaborative canvases, and design systems — focusing on the gap between raw model intelligence and interfaces that feel quiet, legible, and deeply human.',
      'Most days I prototype in TypeScript, React, WebGL, and multimodal model APIs. Outside of code, I collect Swiss print monographs, test espresso recipes, and walk around Lower Manhattan taking photographs of architectural typography.',
    ],
    currentFocus: {
      badge: 'Currently Exploring',
      title: 'Direct Manipulation for Multimodal Models',
      description:
        'Replacing brittle text-only prompt boxes with spatial gestures, visual reference boards, and continuous real-time feedback loops.',
    },
    skills: [
      'TypeScript',
      'React 19',
      'Design Systems',
      'Multimodal AI',
      'Canvas & SVG',
      'Tailwind CSS',
      'Node.js',
      'Web Audio',
      'Typography',
      'Motion Craft',
    ],
  },
  timeline: {
    eyebrow: '02 · TIMELINE',
    title: 'Experience & Milestones',
    subtitle: 'Roles, teams, and foundational studies from 2020 to today.',
    entries: [
      {
        id: 't-2025',
        period: '2025 — Present',
        role: 'Staff Design Engineer',
        organization: 'Lumen Studio Labs',
        location: 'New York, NY',
        summary:
          'Leading interactive canvas architecture and multimodal evaluation interfaces for creative engineering workflows.',
        highlights: [
          'Architected sub-50ms freehand annotation & live preview pipeline used by 45k designers.',
          'Cut frontend visual regression escapes by 68% using automated rubric audits.',
        ],
      },
      {
        id: 't-2023',
        period: '2023 — 2025',
        role: 'Senior Frontend Engineer',
        organization: 'VectorField AI',
        location: 'San Francisco, CA',
        summary:
          'Owned the core developer studio, real-time streaming inspector, and cross-product design token system.',
        highlights: [
          'Designed and shipped a unified token architecture across 4 web applications.',
          'Built real-time WebSocket trace visualizers handling 10k+ concurrent telemetry events.',
        ],
      },
      {
        id: 't-2021',
        period: '2021 — 2023',
        role: 'Product Engineer',
        organization: 'Cinder Interactive',
        location: 'New York, NY',
        summary:
          'Built collaborative editorial publishing tools, custom typography controls, and high-DPI export pipelines.',
        highlights: [
          'Engineered zero-jank print layout previewer supporting custom variable fonts.',
          'Partnered directly with brand directors to ship 12 flagship customer storefronts.',
        ],
      },
      {
        id: 't-2020',
        period: '2016 — 2020',
        role: 'B.S. in Computer Science & Visual Studies',
        organization: 'New York University',
        location: 'New York, NY',
        summary:
          'Focused on human-computer interaction, graphics programming, and modernist graphic design history.',
        highlights: [
          'Undergraduate research in spatial hypertext and direct-manipulation editors.',
        ],
      },
    ] as TimelineEntry[],
  },
  reading: {
    eyebrow: '03 · READING',
    title: 'Bookshelf & Reference Library',
    subtitle: 'Books and essays that continually shape how I think about software, craft, and proportion.',
    categories: ['All', 'Design', 'Systems', 'Philosophy'] as ReadingCategory[],
    entries: [
      {
        id: 'r-grid',
        title: 'Grid Systems in Graphic Design',
        author: 'Josef Müller-Brockmann',
        year: '1981',
        category: 'Design',
        status: 'Re-reading',
        note: 'The definitive manual on typographic discipline, proportion, and calm negative space.',
        url: 'https://en.wikipedia.org/wiki/Josef_M%C3%BCller-Brockmann',
      },
      {
        id: 'r-elements',
        title: 'The Elements of Typographic Style',
        author: 'Robert Bringhurst',
        year: '1992',
        category: 'Design',
        status: 'Finished',
        note: 'Treats letterforms and measure with the rigor of architecture and chamber music.',
        url: 'https://en.wikipedia.org/wiki/The_Elements_of_Typographic_Style',
      },
      {
        id: 'r-ddia',
        title: 'Designing Data-Intensive Applications',
        author: 'Martin Kleppmann',
        year: '2017',
        category: 'Systems',
        status: 'Finished',
        note: 'Clarity on distributed state, event streams, and reliability under real failure modes.',
        url: 'https://dataintensive.net/',
      },
      {
        id: 'r-timeless',
        title: 'The Timeless Way of Building',
        author: 'Christopher Alexander',
        year: '1979',
        category: 'Philosophy',
        status: 'In Progress',
        note: 'Why living spaces and software tools emerge from small, humane, composable patterns.',
        url: 'https://en.wikipedia.org/wiki/The_Timeless_Way_of_Building',
      },
      {
        id: 'r-tools',
        title: 'Tools for Thought & Spatial Interfaces',
        author: 'Bret Victor & Alan Kay',
        year: '2012',
        category: 'Systems',
        status: 'Re-reading',
        note: 'Direct visual feedback loops should make invisible state immediately seeable and editable.',
        url: 'https://worrydream.com/',
      },
      {
        id: 'r-shadow',
        title: 'In Praise of Shadows',
        author: 'Jun’ichirō Tanizaki',
        year: '1933',
        category: 'Philosophy',
        status: 'Finished',
        note: 'A quiet manifesto against harsh over-lit glare — equally relevant to dark UIs and paper.',
        url: 'https://en.wikipedia.org/wiki/In_Praise_of_Shadows',
      },
    ] as ReadingEntry[],
  },
  design: {
    eyebrow: '04 · DESIGN & WORK',
    title: 'Selected Projects',
    subtitle: 'Interactive experiments, production interfaces, and design engineering tools.',
    projects: [
      {
        id: 'p-meridian',
        title: 'Meridian Canvas',
        year: '2026',
        category: 'Creative Tooling',
        tagline: 'Spatial moodboard & real-time design token synthesizer.',
        description:
          'An infinite tactile workspace where designers drag editorial references, annotate regions by hand, and inspect live CSS token diffs without leaving the browser.',
        stack: ['React 19', 'Canvas 2D', 'TypeScript', 'WebSockets'],
        liveUrl: 'https://meridian.alexrivera.dev',
        repoUrl: 'https://github.com/alexrivera-dev/meridian-canvas',
        thumbnailUrl: makeProjectThumb('Meridian Canvas', 'Spatial Design Tool · 2026', '#6366f1', '#ec4899'),
      },
      {
        id: 'p-typescale',
        title: 'TypeScale Lab',
        year: '2025',
        category: 'Typography',
        tagline: 'Optical sizing & vertical rhythm workbench for editorial web apps.',
        description:
          'Pairs Google Fonts and variable typefaces with live print-inspired measure guides, baseline grids, and automatic WCAG contrast auditing.',
        stack: ['Vite', 'CSS Custom Props', 'OpenType', 'Tailwind v4'],
        liveUrl: 'https://typescale.alexrivera.dev',
        repoUrl: 'https://github.com/alexrivera-dev/typescale-lab',
        thumbnailUrl: makeProjectThumb('TypeScale Lab', 'Editorial Grid Bench · 2025', '#8b5cf6', '#38bdf8'),
      },
      {
        id: 'p-kinetix',
        title: 'Kinetix Motion Inspector',
        year: '2025',
        category: 'Motion Craft',
        tagline: 'Spring-curve visualizer and compositor-safe animation profiler.',
        description:
          'Lets engineers tune cubic-bezier curves and duration ratios side by side while catching layout-thrashing keyframes before code review.',
        stack: ['TypeScript', 'Web Animations API', 'SVG', 'React'],
        liveUrl: 'https://kinetix.alexrivera.dev',
        repoUrl: 'https://github.com/alexrivera-dev/kinetix-motion',
        thumbnailUrl: makeProjectThumb('Kinetix Motion', 'Curve Profiler · 2025', '#a855f7', '#22d3ee'),
      },
      {
        id: 'p-chronicle',
        title: 'Chronicle Reader',
        year: '2024',
        category: 'Publishing',
        tagline: 'Distraction-free archival monograph & marginalia reader.',
        description:
          'Turns technical essays and longform markdown into calm, paginated spreads with keyboard navigation and margin annotations.',
        stack: ['Next.js', 'MDX', 'Tailwind', 'Local-First'],
        liveUrl: 'https://chronicle.alexrivera.dev',
        repoUrl: 'https://github.com/alexrivera-dev/chronicle-reader',
        thumbnailUrl: makeProjectThumb('Chronicle Reader', 'Archival Monograph · 2024', '#4f46e5', '#34d399'),
      },
    ] as DesignProject[],
  },
  writing: {
    eyebrow: '05 · WRITING',
    title: 'Notes & Essays',
    subtitle: 'Short reflections on interfaces, taste, motion, and building software with restraint.',
    entries: [
      {
        id: 'w-slop',
        date: 'Nov 2026',
        title: 'Why Text Prompts Collapse Visual Taste into Purple Gradients',
        readTime: '5 min read',
        tag: 'Design Engineering',
        summary:
          'Describing typography, whitespace cadence, and motion speed in English prose loses 90% of the visual signal.',
        excerpt: [
          'Ask any text-only coding assistant to make a personal portfolio feel “minimalist and refined,” and watch what happens: dark indigo glass cards, glowing pill badges, and frantic hover animations appear almost deterministically.',
          'The bottleneck is not code generation — it is the lossy translation layer between what our eyes notice on a reference site and what we can cram into a two-sentence prompt. Showing the reference directly and pointing at the exact element you want calmed down closes that gap immediately.',
        ],
      },
      {
        id: 'w-motion',
        date: 'Aug 2026',
        title: 'Slowing Down Motion Until It Feels Like Paper, Not Neon',
        readTime: '4 min read',
        tag: 'Motion',
        summary:
          'Most generated hero illustrations oscillate twice as fast as human eyes enjoy resting on them.',
        excerpt: [
          'When an ambient graphic in a hero section bobs every 1.7 seconds, it steals cognitive bandwidth from the words right beside it. Calm personal websites treat motion like breath — subtle, peripheral, and immediately pausable.',
          'Separating semantic timing tokens (`--butterfly-float-duration`) from component markup lets designers adjust atmosphere in seconds without rewriting SVG geometry.',
        ],
      },
      {
        id: 'w-five-links',
        date: 'May 2026',
        title: 'The Discipline of a Five-Link Personal Website',
        readTime: '3 min read',
        tag: 'Information Architecture',
        summary:
          'About, Timeline, Reading, Design, Writing — why five honest nouns outlast every mega-menu.',
        excerpt: [
          'A great personal website does not resemble a SaaS pricing funnel. Five clear destinations give a visitor everything they need to understand your taste, your history, and your curiosity in under thirty seconds.',
          'Removing promotional banners, vanity stat chips, and redundant CTA cards makes every remaining word carry twice the weight.',
        ],
      },
    ] as EssayEntry[],
  },
};

export function buildCvDocument(): string {
  const { person, timeline, about } = PORTFOLIO_CONTENT;
  const lines = [
    `${person.name.toUpperCase()} — ${person.role}`,
    `${person.location} | ${person.email} | ${person.githubUrl}`,
    '',
    'SUMMARY',
    person.tagline,
    '',
    'EXPERIENCE & EDUCATION',
    ...timeline.entries.flatMap((entry) => [
      `${entry.period} · ${entry.role} — ${entry.organization} (${entry.location})`,
      `  ${entry.summary}`,
      ...entry.highlights.map((h) => `  - ${h}`),
      '',
    ]),
    'CORE SKILLS',
    about.skills.join(' · '),
    '',
  ];
  return lines.join('\n');
}
