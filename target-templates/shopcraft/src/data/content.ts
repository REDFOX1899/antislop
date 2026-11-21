export type ProductCategory = 'All' | 'Coffee Gear' | 'Tableware' | 'Objects';

export interface NavItem {
  label: string;
  href: string;
}

export interface ProductItem {
  id: string;
  name: string;
  category: Exclude<ProductCategory, 'All'>;
  price: number;
  rating: number;
  reviews: number;
  badge?: string;
  description: string;
  material: string;
  imageUrl: string;
}

export interface CollectionItem {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  filterCategory: ProductCategory;
  imageUrl: string;
}

export interface ValuePropItem {
  id: string;
  index: string;
  title: string;
  description: string;
}

export interface ReviewItem {
  id: string;
  quote: string;
  author: string;
  location: string;
  product: string;
}

function makeProductSvg(label: string, shape: 'kettle' | 'dripper' | 'cup' | 'tray' | 'carafe' | 'incense'): string {
  const artwork: Record<typeof shape, string> = {
    kettle: `
      <rect x="195" y="135" width="130" height="145" rx="6" fill="#141413"/>
      <rect x="218" y="118" width="84" height="17" rx="3" fill="#2E2D2A"/>
      <circle cx="260" cy="111" r="9" fill="#D13224"/>
      <path d="M195 245 C140 245, 145 160, 118 145" stroke="#141413" stroke-width="14" stroke-linecap="round" fill="none"/>
      <path d="M325 160 C370 160, 370 250, 325 250" stroke="#141413" stroke-width="14" stroke-linecap="round" fill="none"/>`,
    dripper: `
      <polygon points="180,125 340,125 292,245 228,245" fill="#FAF7F2" stroke="#141413" stroke-width="3"/>
      <line x1="210" y1="142" x2="240" y2="232" stroke="#D13224" stroke-width="3"/>
      <line x1="260" y1="142" x2="260" y2="232" stroke="#141413" stroke-width="3"/>
      <line x1="310" y1="142" x2="280" y2="232" stroke="#141413" stroke-width="3"/>
      <rect x="200" y="245" width="120" height="18" rx="2" fill="#141413"/>`,
    cup: `
      <rect x="152" y="168" width="94" height="106" rx="4" fill="#4A4843"/>
      <rect x="274" y="150" width="94" height="124" rx="4" fill="#141413"/>
      <ellipse cx="199" cy="168" rx="47" ry="10" fill="#D8D1C4"/>
      <ellipse cx="321" cy="150" rx="47" ry="10" fill="#4A4843"/>`,
    tray: `
      <rect x="115" y="175" width="290" height="84" rx="4" fill="#141413"/>
      <rect x="132" y="187" width="256" height="58" rx="2" fill="#EDE7DC"/>
      <circle cx="332" cy="216" r="18" fill="#D13224"/>`,
    carafe: `
      <path d="M215 110 L305 110 L328 275 L192 275 Z" fill="#FAF7F2" stroke="#141413" stroke-width="3"/>
      <rect x="205" y="175" width="110" height="68" rx="2" fill="#D8D1C4"/>
      <line x1="215" y1="195" x2="305" y2="195" stroke="#141413" stroke-width="2"/>`,
    incense: `
      <ellipse cx="260" cy="245" rx="115" ry="24" fill="#141413"/>
      <ellipse cx="260" cy="240" rx="92" ry="16" fill="#EDE7DC"/>
      <circle cx="260" cy="236" r="14" fill="#D13224"/>
      <line x1="264" y1="228" x2="338" y2="128" stroke="#141413" stroke-width="4" stroke-linecap="round"/>`,
  };

  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="520" height="380" viewBox="0 0 520 380" fill="none">
    <rect width="520" height="380" fill="#EDE7DC"/>
    <line x1="24" y1="24" x2="496" y2="24" stroke="#141413" stroke-opacity="0.2"/>
    ${artwork[shape]}
    <text x="260" y="340" text-anchor="middle" fill="#141413" font-family="monospace" font-size="12">${label}</text>
  </svg>`)}`;
}

export const STORE_CONTENT = {
  brand: {
    name: 'Kova Goods',
    specimen: 'SPECIMEN 01 — SWISS EDITORIAL ARCHIVE · ZÜRICH / NYC',
    promoBanner: 'Complimentary shipping over $75 · Code WELCOME10 for 10% off',
    copyright: '© 2026 Kova Goods LLC. All rights reserved.',
  },
  nav: [
    { label: 'Catalog', href: '#catalog' },
    { label: 'Collections', href: '#collections' },
    { label: 'Principles', href: '#benefits' },
    { label: 'Reviews', href: '#reviews' },
  ] as NavItem[],
  hero: {
    badge: 'Edition 04 / Autumn–Winter',
    title: 'Form & Utility.',
    subtitle:
      'Curated pour-over coffee gear, stoneware tableware, and machined aluminum desk objects built for daily ritual.',
    primaryCta: 'Shop Catalog',
    secondaryCta: 'View Collections',
    imageUrl: '/generated/hero-primary.jpg',
    imageAlt: 'Kova Goods minimalist coffee kettle, ceramic mug, and glass carafe on table',
  },
  categories: ['All', 'Coffee Gear', 'Tableware', 'Objects'] as ProductCategory[],
  catalogSection: {
    title: 'Featured Objects',
    subtitle: 'Precision-made homeware and coffee tools, in stock and ready to ship.',
  },
  products: [
    {
      id: 'kova-kettle',
      name: 'Kova Gooseneck Kettle',
      category: 'Coffee Gear',
      price: 98,
      rating: 4.9,
      reviews: 128,
      badge: 'Best Seller',
      material: 'Matte 304 Stainless Steel · 900ml',
      description: 'Counterbalanced pour-over kettle engineered for slow, steady extraction.',
      imageUrl: makeProductSvg('KOVA KETTLE · 900ML', 'kettle'),
    },
    {
      id: 'ceramic-dripper-02',
      name: 'Ceramic Dripper 02',
      category: 'Coffee Gear',
      price: 42,
      rating: 4.8,
      reviews: 84,
      material: 'Glazed Stoneware · Size 02',
      description: 'Internal spiral ribs regulate airflow and draw-down rate for clean cups.',
      imageUrl: makeProductSvg('CERAMIC DRIPPER · 02', 'dripper'),
    },
    {
      id: 'stacking-espresso-set',
      name: 'Stacking Espresso Set',
      category: 'Tableware',
      price: 54,
      rating: 4.9,
      reviews: 63,
      badge: 'New',
      material: 'Double-Walled Porcelain · Set of 2',
      description: 'Nesting matte ceramic espresso cups with heat-retaining walls.',
      imageUrl: makeProductSvg('ESPRESSO SET · PAIR', 'cup'),
    },
    {
      id: 'aluminum-desk-tray',
      name: 'Brushed Aluminum Desk Tray',
      category: 'Objects',
      price: 65,
      rating: 4.7,
      reviews: 49,
      material: 'Bead-Blasted 6061 Aluminum',
      description: 'Precision CNC-milled valet tray with cork base for keys, pens, and tools.',
      imageUrl: makeProductSvg('ALUMINUM TRAY · 6061', 'tray'),
    },
    {
      id: 'linen-carafe',
      name: 'Linen Sleeve Glass Carafe',
      category: 'Tableware',
      price: 58,
      rating: 4.8,
      reviews: 71,
      material: 'Borosilicate Glass & Belgian Linen',
      description: 'Hand-blown 600ml carafe wrapped in a removable, washable linen collar.',
      imageUrl: makeProductSvg('GLASS CARAFE · 600ML', 'carafe'),
    },
    {
      id: 'stone-incense-holder',
      name: 'Basalt Incense Dish',
      category: 'Objects',
      price: 38,
      rating: 4.9,
      reviews: 54,
      material: 'Honed Natural Basalt',
      description: 'Heavyweight stone dish with brass insert for standard stick incense.',
      imageUrl: makeProductSvg('BASALT DISH · HONED', 'incense'),
    },
  ] as ProductItem[],
  valueProps: [
    {
      id: 'ship',
      index: '01',
      title: 'Hairline Grid Discipline',
      description: 'Flat tactile print surfaces and complimentary shipping on orders over $75.',
    },
    {
      id: 'return',
      index: '02',
      title: '30-Day Trial Guarantee',
      description: 'Live with your objects at home. Effortless returns within 30 days.',
    },
    {
      id: 'warranty',
      index: '03',
      title: 'Two-Year Craft Warranty',
      description: 'Every kettle, ceramic, and milled object is backed for two full years.',
    },
  ] as ValuePropItem[],
  collectionsSection: {
    title: 'Curated Editions',
    subtitle: 'Focused pairings for morning extraction and quiet workspaces.',
  },
  collections: [
    {
      id: 'morning-ritual',
      eyebrow: 'Edition A / Extraction',
      title: 'Pour-Over & Morning Ritual',
      description: 'Thermal stability, counterbalanced spouts, and stoneware built for daily brewing.',
      ctaLabel: 'Filter Coffee Gear',
      filterCategory: 'Coffee Gear',
      imageUrl: makeProductSvg('EDITION A · COFFEE GEAR', 'kettle'),
    },
    {
      id: 'desk-objects',
      eyebrow: 'Edition B / Workspace',
      title: 'Desk & Everyday Objects',
      description: 'Machined aluminum trays and honed basalt dishes for uncluttered surfaces.',
      ctaLabel: 'Filter Objects',
      filterCategory: 'Objects',
      imageUrl: makeProductSvg('EDITION B · OBJECTS', 'tray'),
    },
  ] as CollectionItem[],
  reviews: [
    {
      id: 'r1',
      quote: 'The gooseneck kettle pours with zero splash. It feels like a studio instrument.',
      author: 'claire_m',
      location: 'Zürich',
      product: 'Kova Gooseneck Kettle',
    },
    {
      id: 'r2',
      quote: 'Heavy, quiet, and exact. The aluminum tray anchored my entire desk setup.',
      author: 'daniel_k',
      location: 'Brooklyn',
      product: 'Brushed Aluminum Desk Tray',
    },
    {
      id: 'r3',
      quote: 'Double-walled porcelain keeps espresso hot without burning your fingers.',
      author: 'hana_s',
      location: 'Kyoto',
      product: 'Stacking Espresso Set',
    },
  ] as ReviewItem[],
};
