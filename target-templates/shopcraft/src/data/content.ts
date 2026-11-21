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
  icon: 'truck' | 'refresh' | 'shield';
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

export interface FooterColumn {
  heading: string;
  links: Array<{ label: string; href: string }>;
}

function makeProductSvg(label: string, shape: 'kettle' | 'dripper' | 'cup' | 'tray' | 'carafe' | 'incense'): string {
  const artwork: Record<typeof shape, string> = {
    kettle: `
      <rect x="195" y="135" width="130" height="145" rx="14" fill="#374151"/>
      <rect x="218" y="118" width="84" height="17" rx="6" fill="#4b5563"/>
      <circle cx="260" cy="111" r="9" fill="#1f2937"/>
      <path d="M195 245 C140 245, 145 160, 118 145" stroke="#374151" stroke-width="14" stroke-linecap="round" fill="none"/>
      <path d="M325 160 C370 160, 370 250, 325 250" stroke="#1f2937" stroke-width="14" stroke-linecap="round" fill="none"/>
      <ellipse cx="260" cy="292" rx="95" ry="12" fill="#d1d5db"/>`,
    dripper: `
      <polygon points="180,125 340,125 292,245 228,245" fill="#e5e7eb" stroke="#9ca3af" stroke-width="3"/>
      <line x1="210" y1="142" x2="240" y2="232" stroke="#cbd5e1" stroke-width="4"/>
      <line x1="260" y1="142" x2="260" y2="232" stroke="#cbd5e1" stroke-width="4"/>
      <line x1="310" y1="142" x2="280" y2="232" stroke="#cbd5e1" stroke-width="4"/>
      <rect x="200" y="245" width="120" height="18" rx="9" fill="#9ca3af"/>
      <ellipse cx="260" cy="285" rx="88" ry="11" fill="#d1d5db"/>`,
    cup: `
      <rect x="152" y="168" width="94" height="106" rx="18" fill="#6b7280"/>
      <rect x="274" y="150" width="94" height="124" rx="18" fill="#374151"/>
      <ellipse cx="199" cy="168" rx="47" ry="11" fill="#9ca3af"/>
      <ellipse cx="321" cy="150" rx="47" ry="11" fill="#4b5563"/>
      <ellipse cx="260" cy="290" rx="125" ry="12" fill="#d1d5db"/>`,
    tray: `
      <rect x="115" y="175" width="290" height="84" rx="20" fill="#9ca3af"/>
      <rect x="132" y="187" width="256" height="58" rx="14" fill="#d1d5db"/>
      <rect x="160" y="205" width="110" height="22" rx="6" fill="#6b7280" fill-opacity="0.35"/>
      <circle cx="332" cy="216" r="18" fill="#374151" fill-opacity="0.4"/>
      <ellipse cx="260" cy="282" rx="145" ry="12" fill="#d1d5db"/>`,
    carafe: `
      <path d="M215 110 L305 110 L328 275 L192 275 Z" fill="#dbeafe" fill-opacity="0.7" stroke="#93c5fd" stroke-width="3"/>
      <rect x="205" y="175" width="110" height="68" rx="8" fill="#9ca3af"/>
      <line x1="215" y1="195" x2="305" y2="195" stroke="#d1d5db" stroke-width="2"/>
      <line x1="215" y1="222" x2="305" y2="222" stroke="#d1d5db" stroke-width="2"/>
      <ellipse cx="260" cy="290" rx="88" ry="11" fill="#d1d5db"/>`,
    incense: `
      <ellipse cx="260" cy="245" rx="115" ry="26" fill="#9ca3af"/>
      <ellipse cx="260" cy="240" rx="92" ry="18" fill="#d1d5db"/>
      <circle cx="260" cy="236" r="16" fill="#4b5563"/>
      <line x1="264" y1="228" x2="338" y2="128" stroke="#6b7280" stroke-width="4" stroke-linecap="round"/>
      <path d="M338 118 C345 102, 326 95, 336 78" stroke="#93c5fd" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  };

  return `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 380" fill="none">
    <rect width="520" height="380" fill="#f3f4f6"/>
    <rect x="24" y="24" width="472" height="332" rx="12" fill="#e5e7eb" fill-opacity="0.55"/>
    ${artwork[shape]}
    <text x="260" y="340" text-anchor="middle" fill="#6b7280" font-family="Inter, sans-serif" font-size="13" font-weight="500">${label}</text>
  </svg>`)}`;
}

const DEFAULT_HERO_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 640" fill="none">
  <rect width="960" height="640" fill="#e5e7eb"/>
  <rect x="0" y="450" width="960" height="190" fill="#d1d5db"/>
  <!-- Minimalist kettle -->
  <rect x="230" y="230" width="190" height="230" rx="18" fill="#374151"/>
  <rect x="262" y="205" width="126" height="25" rx="8" fill="#4b5563"/>
  <circle cx="325" cy="194" r="14" fill="#1f2937"/>
  <path d="M230 398 C150 398, 165 268, 118 240" stroke="#374151" stroke-width="20" stroke-linecap="round" fill="none"/>
  <path d="M420 268 C482 268, 482 405, 420 405" stroke="#1f2937" stroke-width="20" stroke-linecap="round" fill="none"/>
  <!-- Ceramic mug -->
  <rect x="520" y="328" width="136" height="132" rx="18" fill="#f9fafb" stroke="#9ca3af" stroke-width="4"/>
  <path d="M656 356 C696 356, 696 426, 656 426" stroke="#9ca3af" stroke-width="12" fill="none"/>
  <!-- Carafe -->
  <path d="M718 250 L812 250 L835 460 L695 460 Z" fill="#dbeafe" fill-opacity="0.75" stroke="#93c5fd" stroke-width="4"/>
  <rect x="708" y="330" width="114" height="72" rx="8" fill="#9ca3af"/>
  <!-- Generic blue corner label -->
  <rect x="44" y="44" width="210" height="36" rx="6" fill="#2563eb"/>
  <text x="149" y="67" text-anchor="middle" fill="#ffffff" font-family="Inter, sans-serif" font-size="13" font-weight="600">AUTUMN CATALOG 2026</text>
</svg>`)}`;

const COLLECTION_COFFEE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" fill="none">
  <rect width="800" height="480" fill="#e5e7eb"/>
  <rect x="0" y="340" width="800" height="140" fill="#d1d5db"/>
  <polygon points="240,145 390,145 344,280 286,280" fill="#f9fafb" stroke="#9ca3af" stroke-width="4"/>
  <rect x="262" y="280" width="106" height="20" rx="8" fill="#9ca3af"/>
  <rect x="255" y="300" width="120" height="70" rx="10" fill="#dbeafe" stroke="#93c5fd" stroke-width="3"/>
  <rect x="445" y="185" width="135" height="185" rx="14" fill="#374151"/>
  <path d="M580 218 C628 218, 628 332, 580 332" stroke="#1f2937" stroke-width="16" fill="none"/>
  <text x="400" y="430" text-anchor="middle" fill="#4b5563" font-family="Inter, sans-serif" font-size="16" font-weight="600">Pour-Over & Morning Ritual Collection</text>
</svg>`)}`;

const COLLECTION_WORKSPACE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" fill="none">
  <rect width="800" height="480" fill="#eff6ff"/>
  <rect x="0" y="340" width="800" height="140" fill="#dbeafe"/>
  <rect x="170" y="260" width="280" height="90" rx="18" fill="#9ca3af"/>
  <rect x="190" y="275" width="240" height="60" rx="12" fill="#e5e7eb"/>
  <rect x="495" y="165" width="128" height="185" rx="14" fill="#4b5563"/>
  <rect x="520" y="195" width="78" height="105" rx="8" fill="#d1d5db"/>
  <text x="400" y="430" text-anchor="middle" fill="#374151" font-family="Inter, sans-serif" font-size="16" font-weight="600">Desk & Everyday Homeware Objects</text>
</svg>`)}`;

export const STORE_CONTENT = {
  brand: {
    name: 'Kova Goods',
    tagline: 'Minimalist homeware, coffee equipment, and functional everyday objects.',
    promoBanner: 'Free standard shipping on orders over $75 · Use code WELCOME10 for 10% off',
    copyright: '© 2026 Kova Goods LLC. All rights reserved.',
  },
  nav: [
    { label: 'Shop All', href: '#catalog' },
    { label: 'Collections', href: '#collections' },
    { label: 'Why Kova', href: '#benefits' },
    { label: 'Reviews', href: '#reviews' },
  ] as NavItem[],
  hero: {
    badge: 'New Season Arrivals',
    title: 'Modern Essentials for Everyday Living',
    subtitle:
      'Discover our curated catalog of minimalist pour-over coffee gear, stoneware tableware, and aluminum desk objects built for daily utility.',
    primaryCta: 'Shop Collection',
    secondaryCta: 'Explore Lookbook',
    /** Swap to '/generated/hero.jpg' to render bespoke generated editorial photography */
    imageUrl: DEFAULT_HERO_SVG,
    imageAlt: 'Kova Goods minimalist coffee kettle, ceramic mug, and glass carafe on table',
  },
  categories: ['All', 'Coffee Gear', 'Tableware', 'Objects'] as ProductCategory[],
  catalogSection: {
    title: 'Featured Products',
    subtitle: 'Browse our best-selling homeware and coffee tools, in stock and ready to ship.',
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
      imageUrl: makeProductSvg('Kova Gooseneck Kettle · 900ml', 'kettle'),
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
      imageUrl: makeProductSvg('Ceramic Dripper 02 · Stoneware', 'dripper'),
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
      imageUrl: makeProductSvg('Stacking Espresso Set · Pair', 'cup'),
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
      imageUrl: makeProductSvg('Brushed Aluminum Desk Tray', 'tray'),
    },
    {
      id: 'linen-carafe',
      name: 'Linen Sleeve Glass Carafe',
      category: 'Tableware',
      price: 76,
      rating: 4.8,
      reviews: 71,
      material: 'Borosilicate Glass & Belgian Linen',
      description: 'Thermal serving carafe paired with a removable washable woven collar.',
      imageUrl: makeProductSvg('Linen Sleeve Glass Carafe · 600ml', 'carafe'),
    },
    {
      id: 'brass-incense-holder',
      name: 'Weighted Brass Incense Dish',
      category: 'Objects',
      price: 48,
      rating: 4.9,
      reviews: 56,
      material: 'Solid Turned Brass',
      description: 'Heavyweight minimal dish machined from solid brass that patinas naturally.',
      imageUrl: makeProductSvg('Weighted Brass Incense Dish', 'incense'),
    },
  ] as ProductItem[],
  valueProps: [
    {
      id: 'shipping',
      icon: 'truck',
      title: 'Free Shipping Over $75',
      description: 'Fast carbon-neutral ground delivery on all qualifying domestic orders.',
    },
    {
      id: 'returns',
      icon: 'refresh',
      title: '30-Day Easy Returns',
      description: 'Try any object in your home and return it hassle-free within 30 days.',
    },
    {
      id: 'warranty',
      icon: 'shield',
      title: '2-Year Quality Warranty',
      description: 'Every piece is backed by our straightforward repair or replacement guarantee.',
    },
  ] as ValuePropItem[],
  collectionsSection: {
    title: 'Shop by Collection',
    subtitle: 'Curated pairings designed to bring order to your kitchen counter and workspace.',
  },
  collections: [
    {
      id: 'morning-ritual',
      eyebrow: 'Collection 01',
      title: 'The Morning Ritual Edit',
      description:
        'Precision kettles, stoneware drippers, and borosilicate carafes calibrated for quiet weekday pour-overs.',
      ctaLabel: 'Explore Coffee Gear',
      filterCategory: 'Coffee Gear',
      imageUrl: COLLECTION_COFFEE_SVG,
    },
    {
      id: 'quiet-workspace',
      eyebrow: 'Collection 02',
      title: 'Quiet Workspace Objects',
      description:
        'CNC-milled aluminum trays and turned brass accents that organize daily clutter without visual noise.',
      ctaLabel: 'Explore Objects',
      filterCategory: 'Objects',
      imageUrl: COLLECTION_WORKSPACE_SVG,
    },
  ] as CollectionItem[],
  reviewsSection: {
    title: 'Customer Reviews',
    subtitle: 'Verified feedback from thousands of daily Kova Goods customers.',
  },
  reviews: [
    {
      id: 'r1',
      quote:
        'The gooseneck kettle has a remarkably smooth pour rate and feels much sturdier than kettles twice the price.',
      author: 'Hannah L.',
      location: 'Brooklyn, NY',
      product: 'Kova Gooseneck Kettle',
    },
    {
      id: 'r2',
      quote:
        'Clean proportions and solid weight. The aluminum desk tray immediately made my home office feel organized.',
      author: 'David K.',
      location: 'Seattle, WA',
      product: 'Brushed Aluminum Desk Tray',
    },
    {
      id: 'r3',
      quote:
        'Arrived well packaged in two days. The stacking espresso cups hold heat well and feel great in hand.',
      author: 'Claire M.',
      location: 'Chicago, IL',
      product: 'Stacking Espresso Set',
    },
  ] as ReviewItem[],
  newsletter: {
    title: 'Subscribe to our newsletter',
    subtitle: 'Get early access to seasonal restocks, new object drops, and 10% off your first order.',
    placeholder: 'Enter your email address',
    buttonLabel: 'Subscribe',
  },
  footer: [
    {
      heading: 'Shop',
      links: [
        { label: 'All Products', href: '#catalog' },
        { label: 'Coffee Gear', href: '#catalog' },
        { label: 'Tableware', href: '#catalog' },
        { label: 'Objects', href: '#catalog' },
      ],
    },
    {
      heading: 'Support',
      links: [
        { label: 'Shipping & Delivery', href: '#benefits' },
        { label: 'Returns & Exchanges', href: '#benefits' },
        { label: 'Warranty', href: '#benefits' },
        { label: 'Contact Us', href: '#newsletter' },
      ],
    },
    {
      heading: 'Company',
      links: [
        { label: 'About Kova Goods', href: '#collections' },
        { label: 'Customer Reviews', href: '#reviews' },
        { label: 'Trade Program', href: '#newsletter' },
        { label: 'Privacy Policy', href: '#footer' },
      ],
    },
  ] as FooterColumn[],
};
