/**
 * Curated Palette Archetype Library for AntiSlop v2
 *
 * Ten world-class architectural, editorial, and industrial design archetypes.
 * Every archetype is passed through `enforceApcaPalette()` at module initialization
 * so all exported palettes are mathematically verified to pass APCA-W3 contrast targets.
 */

import {
  enforceApcaPalette,
  type PaletteAuditReport,
  type PaletteTokensInput,
} from './colorKernel.js';

export interface PaletteArchetypeTypography {
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  googleFontsUrl: string;
}

export interface PaletteArchetype {
  id: string;
  name: string;
  tagline: string;
  mode: 'light' | 'dark';
  seedAccentHex: string;
  seedNeutralHex: string;
  palette: PaletteTokensInput;
  typography: PaletteArchetypeTypography;
  principles: string[];
}

export interface VerifiedPaletteArchetype extends PaletteArchetype {
  audit: PaletteAuditReport;
}

const RAW_ARCHETYPES: readonly PaletteArchetype[] = [
  {
    id: 'swiss-paper-vermilion',
    name: 'Swiss Architectural Paper + Vermilion',
    tagline: 'International Typographic Style grounded on warm cotton rag and Josef Müller-Brockmann signal red.',
    mode: 'light',
    seedAccentHex: '#C9301A',
    seedNeutralHex: '#F7F5F0',
    palette: {
      canvas: '#F7F5F0',
      surface: '#FFFFFF',
      surfaceMuted: '#EDEAE2',
      inkPrimary: '#141311',
      inkSecondary: '#545049',
      accent: '#C9301A',
      accentContrast: '#FFFFFF',
      borderSubtle: '#DDD8CE',
    },
    typography: {
      displayFont: '"Instrument Serif", Georgia, serif',
      bodyFont: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
      monoFont: '"JetBrains Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
    },
    principles: [
      'Strict 12-column mathematical grid with exposed hairline rules',
      'Generous negative space (>40%) around primary editorial statements',
      'Vermilion reserved exclusively for primary actions and active telemetry',
    ],
  },
  {
    id: 'obsidian-cobalt-atelier',
    name: 'Obsidian + Electric Cobalt Telemetry',
    tagline: 'Precision instrument-panel dark mode with calibrated cobalt luminous accents and zero neon bloom.',
    mode: 'dark',
    seedAccentHex: '#4C8DFF',
    seedNeutralHex: '#0D1017',
    palette: {
      canvas: '#0B0E14',
      surface: '#121722',
      surfaceMuted: '#1A2130',
      inkPrimary: '#F2F5FA',
      inkSecondary: '#9AA6BC',
      accent: '#4C8DFF',
      accentContrast: '#08101F',
      borderSubtle: '#252F42',
    },
    typography: {
      displayFont: '"Space Grotesk", sans-serif',
      bodyFont: '"IBM Plex Sans", sans-serif',
      monoFont: '"IBM Plex Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap',
    },
    principles: [
      'Layered matte obsidian elevations without heavy drop shadows',
      'Monospace tabular numerals for all metrics, timestamps, and coordinates',
      'High-legibility cobalt focus states calibrated for dark-room contrast',
    ],
  },
  {
    id: 'braun-industrial-amber',
    name: 'Dieter Rams Braun Neutral + Signal Amber',
    tagline: 'Less, but better: anodized warm gray aluminum paired with tactile mechanical amber indicators.',
    mode: 'light',
    seedAccentHex: '#B85A00',
    seedNeutralHex: '#ECEBE6',
    palette: {
      canvas: '#ECEBE6',
      surface: '#F6F5F1',
      surfaceMuted: '#E0DED7',
      inkPrimary: '#1A1A18',
      inkSecondary: '#54534E',
      accent: '#B85A00',
      accentContrast: '#FFFFFF',
      borderSubtle: '#CFCBC2',
    },
    typography: {
      displayFont: '"Plus Jakarta Sans", sans-serif',
      bodyFont: '"Inter", sans-serif',
      monoFont: '"Roboto Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600;700&family=Roboto+Mono:wght@400;500&display=swap',
    },
    principles: [
      'Honest functional geometry with crisp 2px–4px industrial chamfer radii',
      'Tactile hardware control affordances and restrained color coding',
      'Signal amber acts strictly as status detent or primary confirmation',
    ],
  },
  {
    id: 'japanese-washi-indigo',
    name: 'Japanese Washi Paper + Aizome Indigo',
    tagline: 'Quiet handcrafted warmth inspired by natural mulberry paper and deep fermented Tokushima indigo.',
    mode: 'light',
    seedAccentHex: '#1F3A68',
    seedNeutralHex: '#F4F1EA',
    palette: {
      canvas: '#F4F1EA',
      surface: '#FBF9F4',
      surfaceMuted: '#E8E3D8',
      inkPrimary: '#1C1B18',
      inkSecondary: '#555148',
      accent: '#1F3A68',
      accentContrast: '#FBF9F4',
      borderSubtle: '#D8D1C3',
    },
    typography: {
      displayFont: '"Cormorant Garamond", Georgia, serif',
      bodyFont: '"Noto Sans", sans-serif',
      monoFont: '"JetBrains Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=JetBrains+Mono:wght@400;500&family=Noto+Sans:wght@400;500;600&display=swap',
    },
    principles: [
      'Ma (intentional breathing room) separating every typographic cluster',
      'Delicate 1px ink hairlines echoing woodblock registration marks',
      'Deep aizome indigo provides serene authority without harsh saturation',
    ],
  },
  {
    id: 'editorial-stone-terracotta',
    name: 'Warm Editorial Limestone + Terracotta',
    tagline: 'Architectural magazine aesthetic blending sun-baked travertine neutrals with kiln-fired terracotta.',
    mode: 'light',
    seedAccentHex: '#A64228',
    seedNeutralHex: '#F3EFE9',
    palette: {
      canvas: '#F3EFE9',
      surface: '#FAF8F4',
      surfaceMuted: '#E7E0D6',
      inkPrimary: '#211C17',
      inkSecondary: '#5C5248',
      accent: '#A64228',
      accentContrast: '#FAF8F4',
      borderSubtle: '#D7CEC2',
    },
    typography: {
      displayFont: '"Fraunces", Georgia, serif',
      bodyFont: '"DM Sans", sans-serif',
      monoFont: '"IBM Plex Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&display=swap',
    },
    principles: [
      'High-contrast serif headlines with tight editorial display tracking',
      'Warm limestone surface hierarchy replacing sterile pure white',
      'Earthy terracotta accent anchored in organic mineral pigments',
    ],
  },
  {
    id: 'tokyo-brutalist-acid',
    name: 'Tokyo Brutalist Ink + Acid Lime',
    tagline: 'Razor-sharp nocturnal poster typography with electric chartreuse-lime index markers.',
    mode: 'dark',
    seedAccentHex: '#B8F226',
    seedNeutralHex: '#0E0F0E',
    palette: {
      canvas: '#0D0E0D',
      surface: '#161816',
      surfaceMuted: '#202320',
      inkPrimary: '#F4F6F0',
      inkSecondary: '#A4ABA0',
      accent: '#B8F226',
      accentContrast: '#0D0E0D',
      borderSubtle: '#2D312C',
    },
    typography: {
      displayFont: '"Syne", sans-serif',
      bodyFont: '"Space Grotesk", sans-serif',
      monoFont: '"Space Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=Space+Mono:wght@400;700&family=Syne:wght@600;700;800&display=swap',
    },
    principles: [
      'Zero-radius brutalist framing with stark 1px structural borders',
      'Oversized display typography anchored by technical monospace labels',
      'Acid lime paired strictly with deep carbon ink for extreme legibility',
    ],
  },
  {
    id: 'nordic-alabaster-pine',
    name: 'Nordic Alabaster + Deep Forest Pine',
    tagline: 'Scandinavian architectural clarity pairing cool winter alabaster with boreal spruce green.',
    mode: 'light',
    seedAccentHex: '#1C5440',
    seedNeutralHex: '#F5F7F5',
    palette: {
      canvas: '#F5F7F5',
      surface: '#FFFFFF',
      surfaceMuted: '#E7ECE8',
      inkPrimary: '#131C18',
      inkSecondary: '#475750',
      accent: '#1C5440',
      accentContrast: '#FFFFFF',
      borderSubtle: '#D2DDD6',
    },
    typography: {
      displayFont: '"Newsreader", Georgia, serif',
      bodyFont: '"Inter", sans-serif',
      monoFont: '"JetBrains Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap',
    },
    principles: [
      'Airy daylight luminance with crisp botanical green focal points',
      'Subtle tonal card separation rather than decorative gradients',
      'Calm typographic rhythm prioritizing long-form readability',
    ],
  },
  {
    id: 'midnight-champagne',
    name: 'Midnight Velvet + Champagne Brass',
    tagline: 'Haute horlogerie dark editorial palette with brushed champagne gold and deep nocturnal plum-black.',
    mode: 'dark',
    seedAccentHex: '#D8B46C',
    seedNeutralHex: '#111014',
    palette: {
      canvas: '#100F14',
      surface: '#18161E',
      surfaceMuted: '#22202B',
      inkPrimary: '#F6F3EC',
      inkSecondary: '#ADA69B',
      accent: '#D8B46C',
      accentContrast: '#14110B',
      borderSubtle: '#302D3B',
    },
    typography: {
      displayFont: '"Playfair Display", Georgia, serif',
      bodyFont: '"Manrope", sans-serif',
      monoFont: '"IBM Plex Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Manrope:wght@400;500;600&family=Playfair+Display:wght@500;600;700&display=swap',
    },
    principles: [
      'Low-glare nocturnal surfaces evoking museum exhibition lighting',
      'Refined champagne brass hairline dividers and editorial numerals',
      'Classic high-contrast serif display balanced by geometric body sans',
    ],
  },
  {
    id: 'monograph-klein',
    name: 'Gallery Monograph + International Klein Blue',
    tagline: 'Contemporary museum exhibition catalog anchored in crisp archival white and saturated ultramarine.',
    mode: 'light',
    seedAccentHex: '#002FA7',
    seedNeutralHex: '#FAFAFA',
    palette: {
      canvas: '#FAFAFA',
      surface: '#FFFFFF',
      surfaceMuted: '#EFEFF2',
      inkPrimary: '#0E0F14',
      inkSecondary: '#4F5260',
      accent: '#002FA7',
      accentContrast: '#FFFFFF',
      borderSubtle: '#DCDDE4',
    },
    typography: {
      displayFont: '"Archivo", sans-serif',
      bodyFont: '"Inter", sans-serif',
      monoFont: '"JetBrains Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
    },
    principles: [
      'Archival gallery white canvas maximizing photographic & artwork fidelity',
      'Unapologetic International Klein Blue for primary typographic anchors',
      'Catalog-index numbering and razor-clean baseline alignment',
    ],
  },
  {
    id: 'concrete-safety-orange',
    name: 'Raw Concrete + Safety Orange',
    tagline: 'Architectural brutalist concrete slabs paired with utilitarian industrial safety orange.',
    mode: 'dark',
    seedAccentHex: '#FF5E1A',
    seedNeutralHex: '#18191B',
    palette: {
      canvas: '#161719',
      surface: '#1F2124',
      surfaceMuted: '#2A2C30',
      inkPrimary: '#F2F3F5',
      inkSecondary: '#A4A7AE',
      accent: '#FF5E1A',
      accentContrast: '#140903',
      borderSubtle: '#36393F',
    },
    typography: {
      displayFont: '"Space Grotesk", sans-serif',
      bodyFont: '"Inter", sans-serif',
      monoFont: '"JetBrains Mono", ui-monospace, monospace',
      googleFontsUrl:
        'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;600;700&display=swap',
    },
    principles: [
      'Architectural poured-concrete surface tones with stark tonal steps',
      'High-visibility safety orange for critical controls and live states',
      'Utilitarian technical labeling inspired by industrial wayfinding',
    ],
  },
];

const VERIFIED_ARCHETYPES: VerifiedPaletteArchetype[] = RAW_ARCHETYPES.map((arch) => {
  const { repaired, report } = enforceApcaPalette(arch.palette);
  return {
    ...arch,
    palette: repaired,
    audit: report,
  };
});

/**
 * All 10 curated design archetypes with APCA-verified palettes.
 */
export const PALETTE_ARCHETYPES: PaletteArchetype[] = VERIFIED_ARCHETYPES.map(
  ({ audit: _audit, ...archetype }) => archetype,
);

/**
 * Returns all 10 curated archetypes along with their full APCA-W3 audit reports.
 */
export function getVerifiedArchetypes(): VerifiedPaletteArchetype[] {
  return VERIFIED_ARCHETYPES.map((entry) => ({
    ...entry,
    palette: { ...entry.palette },
    typography: { ...entry.typography },
    principles: [...entry.principles],
    audit: {
      ...entry.audit,
      pairs: entry.audit.pairs.map((p) => ({ ...p })),
    },
  }));
}

export function getArchetypeById(id: string): VerifiedPaletteArchetype | undefined {
  return VERIFIED_ARCHETYPES.find((entry) => entry.id === id);
}
