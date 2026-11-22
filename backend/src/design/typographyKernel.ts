export type TypographyCategory =
  | 'editorial_serif'
  | 'swiss_grotesk'
  | 'luxury_fashion'
  | 'technical_mono'
  | 'expressive_brutalist';

export interface VerifiedTypographyPairing {
  id: string;
  name: string;
  category: TypographyCategory;
  tagline: string;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  stylesheetUrls: string[];
  primaryGoogleFontsUrl: string;
  h1Tracking: string;
  h1LineHeight: number;
  bodyLineHeight: number;
  bodyMeasureCh: number;
  scaleRatio: number;
  opticalSizing: boolean;
}

export interface ResolveTypographyInput {
  pairingId?: string;
  displayFont?: string;
  bodyFont?: string;
  monoFont?: string;
  mood?: string;
}

const GOOGLE_CSS2_BASE = 'https://fonts.googleapis.com/css2';
const FONTSHARE_CSS2_BASE = 'https://api.fontshare.com/v2/css';

function googleFontsUrl(...families: string[]): string {
  const uniqueFamilies = Array.from(new Set(families));
  const query = uniqueFamilies.map((family) => `family=${family}`).join('&');
  return `${GOOGLE_CSS2_BASE}?${query}&display=swap`;
}

function fontshareUrl(...families: string[]): string {
  const query = families.map((family) => `f[]=${family}`).join('&');
  return `${FONTSHARE_CSS2_BASE}?${query}&display=swap`;
}

// Verified exact Google Fonts CSS2 axis specifications (guaranteed HTTP 200)
const GF = {
  instrumentSerif: 'Instrument+Serif:ital@0;1',
  syne: 'Syne:wght@500;600;700;800',
  fraunces: 'Fraunces:ital,opsz,wght@0,9..144,400..800;1,9..144,400..600',
  cormorantGaramond: 'Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400',
  playfairDisplay: 'Playfair+Display:ital,wght@0,500;0,600;0,700;1,400',
  bodoniModa: 'Bodoni+Moda:ital,opsz,wght@0,6..96,500;0,6..96,700;1,6..96,400',
  bricolageGrotesque: 'Bricolage+Grotesque:opsz,wght@12..96,400..800',
  spaceGrotesk: 'Space+Grotesk:wght@400;500;600;700',
  plusJakartaSans: 'Plus+Jakarta+Sans:wght@400;500;600;700',
  dmSans: 'DM+Sans:ital,opsz,wght@0,9..40,400..700',
  manrope: 'Manrope:wght@400;500;600;700',
  newsreader: 'Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600',
  archivo: 'Archivo:wght@400;500;600;700;800',
  outfit: 'Outfit:wght@400;500;600;700',
  sora: 'Sora:wght@400;500;600;700',
  unbounded: 'Unbounded:wght@400;500;600;700',
  inter: 'Inter:wght@400;500;600;700',
  ibmPlexMono: 'IBM+Plex+Mono:wght@400;500;600',
  jetbrainsMono: 'JetBrains+Mono:wght@400;500;600',
  spaceMono: 'Space+Mono:wght@400;700',
} as const;

export const VERIFIED_TYPOGRAPHY_PAIRINGS: VerifiedTypographyPairing[] = [
  // =========================================================================
  // 1. EDITORIAL SERIF (5 pairings)
  // =========================================================================
  {
    id: 'editorial-instrument-jakarta',
    name: 'NYC Editorial Modern',
    category: 'editorial_serif',
    tagline: 'Condensed high-contrast editorial serif paired with crisp geometric UI sans.',
    displayFont: 'Instrument Serif',
    bodyFont: 'Plus Jakarta Sans',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [
      googleFontsUrl(GF.instrumentSerif, GF.plusJakartaSans, GF.jetbrainsMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(
      GF.instrumentSerif,
      GF.plusJakartaSans,
      GF.jetbrainsMono,
    ),
    h1Tracking: '-0.025em',
    h1LineHeight: 1.02,
    bodyLineHeight: 1.62,
    bodyMeasureCh: 64,
    scaleRatio: 1.333,
    opticalSizing: false,
  },
  {
    id: 'editorial-newsreader-dm',
    name: 'Literary Review',
    category: 'editorial_serif',
    tagline: 'Optical-size literary serif built for essays, publishing, and thoughtful digital stories.',
    displayFont: 'Newsreader',
    bodyFont: 'DM Sans',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [googleFontsUrl(GF.newsreader, GF.dmSans, GF.ibmPlexMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.newsreader, GF.dmSans, GF.ibmPlexMono),
    h1Tracking: '-0.03em',
    h1LineHeight: 1.06,
    bodyLineHeight: 1.65,
    bodyMeasureCh: 66,
    scaleRatio: 1.333,
    opticalSizing: true,
  },
  {
    id: 'editorial-fraunces-manrope',
    name: 'Tactile Craft Press',
    category: 'editorial_serif',
    tagline: 'Warm soft-serif display with optical sizing paired with poised humanist grotesk.',
    displayFont: 'Fraunces',
    bodyFont: 'Manrope',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [googleFontsUrl(GF.fraunces, GF.manrope, GF.jetbrainsMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.fraunces, GF.manrope, GF.jetbrainsMono),
    h1Tracking: '-0.03em',
    h1LineHeight: 1.04,
    bodyLineHeight: 1.64,
    bodyMeasureCh: 62,
    scaleRatio: 1.333,
    opticalSizing: true,
  },
  {
    id: 'editorial-zodiak-ranade',
    name: 'Continental Folio',
    category: 'editorial_serif',
    tagline: 'Sharp-cut European editorial serif paired with low-contrast contemporary sans.',
    displayFont: 'Zodiak',
    bodyFont: 'Ranade',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [
      fontshareUrl('zodiak@400,700', 'ranade@400,500,700'),
      googleFontsUrl(GF.ibmPlexMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(GF.ibmPlexMono),
    h1Tracking: '-0.02em',
    h1LineHeight: 1.06,
    bodyLineHeight: 1.65,
    bodyMeasureCh: 64,
    scaleRatio: 1.333,
    opticalSizing: false,
  },
  {
    id: 'editorial-instrument-inter',
    name: 'Monograph Portfolio',
    category: 'editorial_serif',
    tagline: 'Razor-sharp editorial display headlines grounded by neutral UI legibility.',
    displayFont: 'Instrument Serif',
    bodyFont: 'Inter',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [googleFontsUrl(GF.instrumentSerif, GF.inter, GF.ibmPlexMono)],
    primaryGoogleFontsUrl: googleFontsUrl(
      GF.instrumentSerif,
      GF.inter,
      GF.ibmPlexMono,
    ),
    h1Tracking: '-0.02em',
    h1LineHeight: 1.02,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 65,
    scaleRatio: 1.333,
    opticalSizing: false,
  },

  // =========================================================================
  // 2. SWISS GROTESK (5 pairings)
  // =========================================================================
  {
    id: 'swiss-jakarta-inter',
    name: 'Zurich Product System',
    category: 'swiss_grotesk',
    tagline: 'Clean modern SaaS display geometry with ultra-legible interface body copy.',
    displayFont: 'Plus Jakarta Sans',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [googleFontsUrl(GF.plusJakartaSans, GF.inter, GF.jetbrainsMono)],
    primaryGoogleFontsUrl: googleFontsUrl(
      GF.plusJakartaSans,
      GF.inter,
      GF.jetbrainsMono,
    ),
    h1Tracking: '-0.035em',
    h1LineHeight: 1.06,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 65,
    scaleRatio: 1.25,
    opticalSizing: false,
  },
  {
    id: 'swiss-archivo-inter',
    name: 'Basel Architectural Grid',
    category: 'swiss_grotesk',
    tagline: 'High-impact neo-grotesque headlines engineered for tight Swiss grids and architecture.',
    displayFont: 'Archivo',
    bodyFont: 'Inter',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [googleFontsUrl(GF.archivo, GF.inter, GF.ibmPlexMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.archivo, GF.inter, GF.ibmPlexMono),
    h1Tracking: '-0.035em',
    h1LineHeight: 1.04,
    bodyLineHeight: 1.58,
    bodyMeasureCh: 66,
    scaleRatio: 1.25,
    opticalSizing: false,
  },
  {
    id: 'swiss-dm-sans-mono',
    name: 'Minimalist Commerce',
    category: 'swiss_grotesk',
    tagline: 'Low-contrast optical geometric sans unified across display and product UI.',
    displayFont: 'DM Sans',
    bodyFont: 'DM Sans',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [googleFontsUrl(GF.dmSans, GF.ibmPlexMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.dmSans, GF.ibmPlexMono),
    h1Tracking: '-0.03em',
    h1LineHeight: 1.08,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 64,
    scaleRatio: 1.25,
    opticalSizing: true,
  },
  {
    id: 'swiss-cabinet-general',
    name: 'Studio Grotesk',
    category: 'swiss_grotesk',
    tagline: 'Characterful Fontshare grotesk headlines paired with disciplined neutral body sans.',
    displayFont: 'Cabinet Grotesk',
    bodyFont: 'General Sans',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [
      fontshareUrl('cabinet-grotesk@500,700,800', 'general-sans@400,500,600,700'),
      googleFontsUrl(GF.jetbrainsMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(GF.jetbrainsMono),
    h1Tracking: '-0.035em',
    h1LineHeight: 1.04,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 64,
    scaleRatio: 1.28,
    opticalSizing: false,
  },
  {
    id: 'swiss-manrope-inter',
    name: 'Precision Enterprise',
    category: 'swiss_grotesk',
    tagline: 'Crisp semi-geometric display sans built for dashboards, analytics, and B2B platforms.',
    displayFont: 'Manrope',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [googleFontsUrl(GF.manrope, GF.inter, GF.jetbrainsMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.manrope, GF.inter, GF.jetbrainsMono),
    h1Tracking: '-0.03em',
    h1LineHeight: 1.08,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 66,
    scaleRatio: 1.25,
    opticalSizing: false,
  },

  // =========================================================================
  // 3. LUXURY FASHION (5 pairings)
  // =========================================================================
  {
    id: 'luxury-cormorant-dm',
    name: 'Atelier Couture',
    category: 'luxury_fashion',
    tagline: 'Delicate Garamond display proportions paired with airy minimalist sans.',
    displayFont: 'Cormorant Garamond',
    bodyFont: 'DM Sans',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [googleFontsUrl(GF.cormorantGaramond, GF.dmSans, GF.ibmPlexMono)],
    primaryGoogleFontsUrl: googleFontsUrl(
      GF.cormorantGaramond,
      GF.dmSans,
      GF.ibmPlexMono,
    ),
    h1Tracking: '-0.02em',
    h1LineHeight: 1.02,
    bodyLineHeight: 1.66,
    bodyMeasureCh: 60,
    scaleRatio: 1.414,
    opticalSizing: true,
  },
  {
    id: 'luxury-bodoni-manrope',
    name: 'Milan Runway',
    category: 'luxury_fashion',
    tagline: 'Razor-contrast optical Didone display balanced by poised modern grotesk.',
    displayFont: 'Bodoni Moda',
    bodyFont: 'Manrope',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [googleFontsUrl(GF.bodoniModa, GF.manrope, GF.ibmPlexMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.bodoniModa, GF.manrope, GF.ibmPlexMono),
    h1Tracking: '-0.02em',
    h1LineHeight: 1.04,
    bodyLineHeight: 1.65,
    bodyMeasureCh: 60,
    scaleRatio: 1.414,
    opticalSizing: true,
  },
  {
    id: 'luxury-playfair-jakarta',
    name: 'Heritage Maison',
    category: 'luxury_fashion',
    tagline: 'Transitional high-fashion serif paired with refined geometric product typography.',
    displayFont: 'Playfair Display',
    bodyFont: 'Plus Jakarta Sans',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [
      googleFontsUrl(GF.playfairDisplay, GF.plusJakartaSans, GF.ibmPlexMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(
      GF.playfairDisplay,
      GF.plusJakartaSans,
      GF.ibmPlexMono,
    ),
    h1Tracking: '-0.02em',
    h1LineHeight: 1.06,
    bodyLineHeight: 1.64,
    bodyMeasureCh: 62,
    scaleRatio: 1.333,
    opticalSizing: false,
  },
  {
    id: 'luxury-boska-switzer',
    name: 'Gallery Sculptural',
    category: 'luxury_fashion',
    tagline: 'Wedge-serif Fontshare luxury display paired with neo-grotesk Switzer precision.',
    displayFont: 'Boska',
    bodyFont: 'Switzer',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [
      fontshareUrl('boska@500,700', 'switzer@400,500,600,700'),
      googleFontsUrl(GF.ibmPlexMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(GF.ibmPlexMono),
    h1Tracking: '-0.025em',
    h1LineHeight: 1.04,
    bodyLineHeight: 1.64,
    bodyMeasureCh: 62,
    scaleRatio: 1.38,
    opticalSizing: false,
  },
  {
    id: 'luxury-melodrama-satoshi',
    name: 'Avant-Garde Lookbook',
    category: 'luxury_fashion',
    tagline: 'Expressive high-contrast fashion serif paired with modernist Satoshi sans.',
    displayFont: 'Melodrama',
    bodyFont: 'Satoshi',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [
      fontshareUrl('melodrama@500,600,700', 'satoshi@400,500,700'),
      googleFontsUrl(GF.ibmPlexMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(GF.ibmPlexMono),
    h1Tracking: '-0.02em',
    h1LineHeight: 1.02,
    bodyLineHeight: 1.62,
    bodyMeasureCh: 60,
    scaleRatio: 1.414,
    opticalSizing: false,
  },

  // =========================================================================
  // 4. TECHNICAL MONO (4 pairings)
  // =========================================================================
  {
    id: 'tech-space-grotesk-mono',
    name: 'Hardware Lab',
    category: 'technical_mono',
    tagline: 'Engineered proportional grotesk headlines with crisp monospace telemetry accents.',
    displayFont: 'Space Grotesk',
    bodyFont: 'Inter',
    monoFont: 'Space Mono',
    stylesheetUrls: [googleFontsUrl(GF.spaceGrotesk, GF.inter, GF.spaceMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.spaceGrotesk, GF.inter, GF.spaceMono),
    h1Tracking: '-0.04em',
    h1LineHeight: 1.04,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 68,
    scaleRatio: 1.25,
    opticalSizing: false,
  },
  {
    id: 'tech-sora-inter',
    name: 'AI Research Lab',
    category: 'technical_mono',
    tagline: 'Futuristic low-x-height geometric headlines built for frontier AI and quant products.',
    displayFont: 'Sora',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [googleFontsUrl(GF.sora, GF.inter, GF.jetbrainsMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.sora, GF.inter, GF.jetbrainsMono),
    h1Tracking: '-0.035em',
    h1LineHeight: 1.06,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 68,
    scaleRatio: 1.25,
    opticalSizing: false,
  },
  {
    id: 'tech-outfit-dm',
    name: 'Industrial Telemetry',
    category: 'technical_mono',
    tagline: 'Clean geometric precision for robotics, climate tech, and developer platforms.',
    displayFont: 'Outfit',
    bodyFont: 'DM Sans',
    monoFont: 'IBM Plex Mono',
    stylesheetUrls: [googleFontsUrl(GF.outfit, GF.dmSans, GF.ibmPlexMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.outfit, GF.dmSans, GF.ibmPlexMono),
    h1Tracking: '-0.03em',
    h1LineHeight: 1.06,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 66,
    scaleRatio: 1.25,
    opticalSizing: true,
  },
  {
    id: 'tech-jetbrains-inter',
    name: 'Terminal First',
    category: 'technical_mono',
    tagline: 'Code-native monospace display headings paired with serene documentation sans.',
    displayFont: 'JetBrains Mono',
    bodyFont: 'Inter',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [googleFontsUrl(GF.jetbrainsMono, GF.inter)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.jetbrainsMono, GF.inter),
    h1Tracking: '-0.04em',
    h1LineHeight: 1.1,
    bodyLineHeight: 1.62,
    bodyMeasureCh: 68,
    scaleRatio: 1.22,
    opticalSizing: false,
  },

  // =========================================================================
  // 5. EXPRESSIVE BRUTALIST (5 pairings)
  // =========================================================================
  {
    id: 'brutalist-syne-dm',
    name: 'Avant-Garde Studio',
    category: 'expressive_brutalist',
    tagline: 'Extended sculptural Syne headlines paired with calm geometric body copy.',
    displayFont: 'Syne',
    bodyFont: 'DM Sans',
    monoFont: 'Space Mono',
    stylesheetUrls: [googleFontsUrl(GF.syne, GF.dmSans, GF.spaceMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.syne, GF.dmSans, GF.spaceMono),
    h1Tracking: '-0.04em',
    h1LineHeight: 0.98,
    bodyLineHeight: 1.58,
    bodyMeasureCh: 62,
    scaleRatio: 1.38,
    opticalSizing: true,
  },
  {
    id: 'brutalist-bricolage-jakarta',
    name: 'Neo-Brutalist Identity',
    category: 'expressive_brutalist',
    tagline: 'Expressive optical grotesk with playful ink-trap energy and crisp UI copy.',
    displayFont: 'Bricolage Grotesque',
    bodyFont: 'Plus Jakarta Sans',
    monoFont: 'JetBrains Mono',
    stylesheetUrls: [
      googleFontsUrl(GF.bricolageGrotesque, GF.plusJakartaSans, GF.jetbrainsMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(
      GF.bricolageGrotesque,
      GF.plusJakartaSans,
      GF.jetbrainsMono,
    ),
    h1Tracking: '-0.035em',
    h1LineHeight: 1.02,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 64,
    scaleRatio: 1.333,
    opticalSizing: true,
  },
  {
    id: 'brutalist-unbounded-manrope',
    name: 'Kinetic Wide',
    category: 'expressive_brutalist',
    tagline: 'Ultra-wide brutalist display stance for audio, streetwear, and kinetic experiences.',
    displayFont: 'Unbounded',
    bodyFont: 'Manrope',
    monoFont: 'Space Mono',
    stylesheetUrls: [googleFontsUrl(GF.unbounded, GF.manrope, GF.spaceMono)],
    primaryGoogleFontsUrl: googleFontsUrl(GF.unbounded, GF.manrope, GF.spaceMono),
    h1Tracking: '-0.03em',
    h1LineHeight: 1.02,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 64,
    scaleRatio: 1.333,
    opticalSizing: false,
  },
  {
    id: 'brutalist-clash-satoshi',
    name: 'Launch Impact',
    category: 'expressive_brutalist',
    tagline: 'Signature Fontshare Clash Display headlines anchored by modernist Satoshi sans.',
    displayFont: 'Clash Display',
    bodyFont: 'Satoshi',
    monoFont: 'Space Mono',
    stylesheetUrls: [
      fontshareUrl('clash-display@500,600,700', 'satoshi@400,500,700'),
      googleFontsUrl(GF.spaceMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(GF.spaceMono),
    h1Tracking: '-0.03em',
    h1LineHeight: 1.0,
    bodyLineHeight: 1.6,
    bodyMeasureCh: 64,
    scaleRatio: 1.35,
    opticalSizing: false,
  },
  {
    id: 'brutalist-tanker-general',
    name: 'Poster Brutalism',
    category: 'expressive_brutalist',
    tagline: 'Condensed poster-weight display lettering built for bold cultural and music brands.',
    displayFont: 'Tanker',
    bodyFont: 'General Sans',
    monoFont: 'Space Mono',
    stylesheetUrls: [
      fontshareUrl('tanker@400', 'general-sans@400,500,600,700'),
      googleFontsUrl(GF.spaceMono),
    ],
    primaryGoogleFontsUrl: googleFontsUrl(GF.spaceMono),
    h1Tracking: '-0.015em',
    h1LineHeight: 0.96,
    bodyLineHeight: 1.58,
    bodyMeasureCh: 62,
    scaleRatio: 1.4,
    opticalSizing: false,
  },
];

const DEFAULT_PAIRING_ID = 'swiss-jakarta-inter';

function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getPairingById(id: string): VerifiedTypographyPairing | undefined {
  return VERIFIED_TYPOGRAPHY_PAIRINGS.find((p) => p.id === id);
}

// Paid / proprietary / non-Google font hallucination map -> verified pairing IDs
const PAID_FONT_HALLUCINATION_MAP: ReadonlyArray<{
  patterns: string[];
  pairingId: string;
}> = [
  {
    patterns: ['sohne', 'soehne', 'klim sohne'],
    pairingId: 'swiss-jakarta-inter',
  },
  {
    patterns: [
      'neue haas grotesk',
      'neue haas',
      'helvetica neue',
      'helvetica',
      'suisse intl',
      'suisse international',
      'maison neue',
    ],
    pairingId: 'swiss-archivo-inter',
  },
  {
    patterns: ['gt america', 'gt walsheim', 'neue montreal', 'pp neue montreal'],
    pairingId: 'swiss-dm-sans-mono',
  },
  {
    patterns: ['pp editorial new', 'editorial new', 'pp editorial'],
    pairingId: 'editorial-instrument-jakarta',
  },
  {
    patterns: ['tiempos', 'reckless', 'lyon display', 'lyon text'],
    pairingId: 'editorial-newsreader-dm',
  },
  {
    patterns: ['gt super', 'recife', 'cooper'],
    pairingId: 'editorial-fraunces-manrope',
  },
  {
    patterns: ['canela', 'garamond premier', 'adobe garamond', 'sabon'],
    pairingId: 'luxury-cormorant-dm',
  },
  {
    patterns: ['didot', 'bodoni', 'linotype didot'],
    pairingId: 'luxury-bodoni-manrope',
  },
  {
    patterns: ['druk', 'druk wide', 'monument extended', 'pp monument'],
    pairingId: 'brutalist-unbounded-manrope',
  },
  {
    patterns: ['akzidenz grotesk', 'founders grotesk', 'fk grotesk'],
    pairingId: 'swiss-cabinet-general',
  },
  {
    patterns: [
      'sf pro',
      'sf pro display',
      'sf pro text',
      'san francisco',
      'circular',
      'proxima nova',
      'avenir',
    ],
    pairingId: 'swiss-jakarta-inter',
  },
  {
    patterns: ['graphik', 'sailec', 'euclid circular'],
    pairingId: 'swiss-manrope-inter',
  },
  {
    patterns: ['apercu', 'berkeley mono', 'input mono'],
    pairingId: 'tech-space-grotesk-mono',
  },
  {
    patterns: ['futura', 'gilroy', 'gotham'],
    pairingId: 'tech-outfit-dm',
  },
];

// Mood / industry keyword map -> verified pairing IDs
const MOOD_KEYWORD_MAP: ReadonlyArray<{
  keywords: string[];
  pairingId: string;
}> = [
  {
    keywords: ['editorial', 'magazine', 'publishing', 'journal', 'press', 'essay'],
    pairingId: 'editorial-instrument-jakarta',
  },
  {
    keywords: ['literary', 'book', 'news', 'article', 'blog'],
    pairingId: 'editorial-newsreader-dm',
  },
  {
    keywords: ['craft', 'bakery', 'coffee', 'hospitality', 'restaurant', 'warm'],
    pairingId: 'editorial-fraunces-manrope',
  },
  {
    keywords: ['luxury', 'fashion', 'couture', 'fragrance', 'jewelry', 'atelier'],
    pairingId: 'luxury-cormorant-dm',
  },
  {
    keywords: ['runway', 'high fashion', 'maison', 'boutique'],
    pairingId: 'luxury-bodoni-manrope',
  },
  {
    keywords: ['gallery', 'museum', 'sculpture', 'curated'],
    pairingId: 'luxury-boska-switzer',
  },
  {
    keywords: ['swiss', 'architecture', 'architectural', 'grid', 'industrial'],
    pairingId: 'swiss-archivo-inter',
  },
  {
    keywords: ['minimal', 'minimalist', 'ecommerce', 'commerce', 'shop', 'store', 'dtc'],
    pairingId: 'swiss-dm-sans-mono',
  },
  {
    keywords: ['saas', 'product', 'startup', 'fintech', 'dashboard', 'enterprise', 'b2b'],
    pairingId: 'swiss-jakarta-inter',
  },
  {
    keywords: ['agency', 'brand', 'design studio'],
    pairingId: 'swiss-cabinet-general',
  },
  {
    keywords: ['tech', 'developer', 'devtools', 'hardware', 'engineering', 'api', 'cli'],
    pairingId: 'tech-space-grotesk-mono',
  },
  {
    keywords: ['ai', 'ml', 'research', 'quantum', 'cyber', 'robotics'],
    pairingId: 'tech-sora-inter',
  },
  {
    keywords: ['terminal', 'docs', 'documentation', 'code', 'infra'],
    pairingId: 'tech-jetbrains-inter',
  },
  {
    keywords: ['brutalist', 'experimental', 'avant garde', 'festival', 'cultural'],
    pairingId: 'brutalist-syne-dm',
  },
  {
    keywords: ['playful', 'creative', 'neo brutalist', 'expressive'],
    pairingId: 'brutalist-bricolage-jakarta',
  },
  {
    keywords: ['portfolio', 'showcase', 'launch', 'bold'],
    pairingId: 'brutalist-clash-satoshi',
  },
  {
    keywords: ['streetwear', 'audio', 'web3', 'kinetic', 'gaming'],
    pairingId: 'brutalist-unbounded-manrope',
  },
  {
    keywords: ['music', 'poster', 'event', 'concert', 'record'],
    pairingId: 'brutalist-tanker-general',
  },
];

function findHallucinationMatch(fontName: string): VerifiedTypographyPairing | undefined {
  const normalized = normalizeToken(fontName);
  if (!normalized) return undefined;

  for (const entry of PAID_FONT_HALLUCINATION_MAP) {
    if (
      entry.patterns.some(
        (pattern) =>
          normalized === pattern ||
          normalized.includes(pattern) ||
          pattern.includes(normalized),
      )
    ) {
      return getPairingById(entry.pairingId);
    }
  }
  return undefined;
}

function findDirectFontMatch(
  displayFont?: string,
  bodyFont?: string,
  monoFont?: string,
): VerifiedTypographyPairing | undefined {
  const normDisplay = displayFont ? normalizeToken(displayFont) : '';
  const normBody = bodyFont ? normalizeToken(bodyFont) : '';
  const normMono = monoFont ? normalizeToken(monoFont) : '';

  if (normDisplay) {
    const candidates = VERIFIED_TYPOGRAPHY_PAIRINGS.filter((pairing) => {
      const pairingDisplay = normalizeToken(pairing.displayFont);
      return (
        pairingDisplay === normDisplay ||
        pairingDisplay.includes(normDisplay) ||
        normDisplay.includes(pairingDisplay)
      );
    });

    if (candidates.length === 1) {
      return candidates[0];
    }

    if (candidates.length > 1) {
      // Tie-break with bodyFont and monoFont when multiple pairings share a displayFont
      const best = candidates.find((pairing) => {
        const pairingBody = normalizeToken(pairing.bodyFont);
        const pairingMono = normalizeToken(pairing.monoFont);
        const bodyMatch =
          normBody.length > 0 &&
          (pairingBody === normBody || pairingBody.includes(normBody));
        const monoMatch =
          normMono.length > 0 &&
          (pairingMono === normMono || pairingMono.includes(normMono));
        return bodyMatch || monoMatch;
      });
      return best ?? candidates[0];
    }
  }

  return undefined;
}

export function resolveVerifiedTypography(
  input: ResolveTypographyInput,
): VerifiedTypographyPairing {
  // 1. Exact pairingId match
  if (input.pairingId) {
    const targetId = input.pairingId.trim().toLowerCase();
    const byId = VERIFIED_TYPOGRAPHY_PAIRINGS.find(
      (pairing) => pairing.id.toLowerCase() === targetId,
    );
    if (byId) return byId;
  }

  // 2. Direct match on requested displayFont (with bodyFont/monoFont tie-breaking)
  const directDisplay = findDirectFontMatch(
    input.displayFont,
    input.bodyFont,
    input.monoFont,
  );
  if (directDisplay) return directDisplay;

  // 3. Map common paid / non-Google font hallucinations on displayFont
  if (input.displayFont) {
    const hallucinationDisplay = findHallucinationMatch(input.displayFont);
    if (hallucinationDisplay) return hallucinationDisplay;
  }

  // 4. Match by mood / category keywords
  if (input.mood) {
    const normalizedMood = normalizeToken(input.mood);
    if (normalizedMood) {
      // Exact category match first
      const byCategory = VERIFIED_TYPOGRAPHY_PAIRINGS.find(
        (pairing) => normalizeToken(pairing.category) === normalizedMood,
      );
      if (byCategory) return byCategory;

      for (const entry of MOOD_KEYWORD_MAP) {
        if (entry.keywords.some((keyword) => normalizedMood.includes(keyword))) {
          const match = getPairingById(entry.pairingId);
          if (match) return match;
        }
      }
    }
  }

  // 5. Fallback matching on bodyFont or monoFont
  if (input.bodyFont) {
    const normBody = normalizeToken(input.bodyFont);
    const byBody = VERIFIED_TYPOGRAPHY_PAIRINGS.find(
      (pairing) =>
        normalizeToken(pairing.bodyFont) === normBody ||
        normalizeToken(pairing.bodyFont).includes(normBody),
    );
    if (byBody) return byBody;

    const hallucinationBody = findHallucinationMatch(input.bodyFont);
    if (hallucinationBody) return hallucinationBody;
  }

  if (input.monoFont) {
    const normMono = normalizeToken(input.monoFont);
    const byMono = VERIFIED_TYPOGRAPHY_PAIRINGS.find(
      (pairing) =>
        normalizeToken(pairing.monoFont) === normMono ||
        normalizeToken(pairing.monoFont).includes(normMono),
    );
    if (byMono) return byMono;
  }

  // 6. Guaranteed-valid default pairing
  return getPairingById(DEFAULT_PAIRING_ID) ?? VERIFIED_TYPOGRAPHY_PAIRINGS[0];
}

function getDisplayFallbackStack(category: TypographyCategory): string {
  switch (category) {
    case 'editorial_serif':
    case 'luxury_fashion':
      return "Georgia, 'Times New Roman', serif";
    case 'technical_mono':
      return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    case 'swiss_grotesk':
    case 'expressive_brutalist':
      return "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  }
}

function formatRem(value: number): string {
  return `${Number(value.toFixed(3))}rem`;
}

export function buildTypographyCssBlock(pairing: VerifiedTypographyPairing): string {
  const ratio = pairing.scaleRatio;
  const displayFallback = getDisplayFallbackStack(pairing.category);
  const bodyFallback =
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const monoFallback = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  // Fluid clamp() scale steps derived from pairing.scaleRatio
  const step1 = ratio;
  const step2 = ratio * ratio;
  const step3 = step2 * ratio;
  const step4 = step3 * ratio;
  const step5 = step4 * ratio;

  const textSm = `clamp(0.8125rem, 0.78rem + 0.15vw, 0.875rem)`;
  const textBase = `clamp(0.95rem, 0.92rem + 0.2vw, 1.0625rem)`;
  const textLg = `clamp(${formatRem(Math.max(1.0625, step1 * 0.88))}, 1rem + 0.35vw, ${formatRem(Math.min(1.5, step1 * 1.05))})`;
  const textXl = `clamp(${formatRem(Math.max(1.25, step2 * 0.78))}, 1.15rem + 0.8vw, ${formatRem(Math.min(2.25, step2 * 1.12))})`;
  const text2xl = `clamp(${formatRem(Math.max(1.5, step3 * 0.68))}, 1.35rem + 1.5vw, ${formatRem(Math.min(3.25, step3 * 1.15))})`;
  const text3xl = `clamp(${formatRem(Math.max(1.875, step4 * 0.6))}, 1.6rem + 2.4vw, ${formatRem(Math.min(4.5, step4 * 1.12))})`;
  const textDisplay = `clamp(${formatRem(Math.max(2.25, step5 * 0.52))}, 1.85rem + 3.6vw, ${formatRem(Math.min(6.25, step5 * 1.1))})`;

  return `/* Verified Typography Pairing: ${pairing.name} (${pairing.id}) */
:root {
  --font-display: '${pairing.displayFont}', ${displayFallback};
  --font-body: '${pairing.bodyFont}', ${bodyFallback};
  --font-mono: '${pairing.monoFont}', ${monoFallback};

  --type-scale-ratio: ${pairing.scaleRatio};
  --type-h1-tracking: ${pairing.h1Tracking};
  --type-h1-leading: ${pairing.h1LineHeight};
  --type-body-leading: ${pairing.bodyLineHeight};
  --type-measure: ${pairing.bodyMeasureCh}ch;

  --text-xs: clamp(0.72rem, 0.7rem + 0.1vw, 0.78rem);
  --text-sm: ${textSm};
  --text-base: ${textBase};
  --text-lg: ${textLg};
  --text-xl: ${textXl};
  --text-2xl: ${text2xl};
  --text-3xl: ${text3xl};
  --text-display: ${textDisplay};
}

html {
  font-family: var(--font-body);
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

body {
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--type-body-leading);
  font-optical-sizing: auto;
}

h1, h2, h3, h4, .font-display {
  font-family: var(--font-display);
  font-optical-sizing: auto;
  text-wrap: balance;
}

h1 {
  font-size: var(--text-display);
  line-height: var(--type-h1-leading);
  letter-spacing: var(--type-h1-tracking);
}

h2 {
  font-size: var(--text-3xl);
  line-height: calc(var(--type-h1-leading) + 0.06);
  letter-spacing: calc(var(--type-h1-tracking) * 0.75);
}

h3 {
  font-size: var(--text-2xl);
  line-height: 1.18;
}

h4 {
  font-size: var(--text-xl);
  line-height: 1.25;
}

p, li {
  max-width: var(--type-measure);
  text-wrap: pretty;
}

code, pre, kbd, samp, .font-mono {
  font-family: var(--font-mono);
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}`;
}
