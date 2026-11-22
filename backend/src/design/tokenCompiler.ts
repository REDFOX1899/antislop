/**
 * W3C DTCG, CSS Custom Properties (OKLCH + Display P3), and Tailwind v4 Theme Compiler
 * for AntiSlop v2.
 */

import {
  calcAPCA,
  enforceApcaPalette,
  generate12StepScale,
  hexToOklch,
  normalizeHex,
  oklchToCss,
  oklchToP3Css,
  type ColorScale12,
  type PaletteAuditReport,
  type PaletteTokensInput,
} from './colorKernel.js';
import { PALETTE_ARCHETYPES } from './paletteArchetypes.js';

export interface DesignTypographyInput {
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  googleFontsUrl?: string;
}

export interface CompileDesignTokensInput {
  name: string;
  mode: 'light' | 'dark';
  palette?: PaletteTokensInput;
  seedAccentHex?: string;
  seedNeutralHex?: string;
  typography?: DesignTypographyInput;
}

export interface CompiledDesignSystem {
  name: string;
  mode: 'light' | 'dark';
  palette: PaletteTokensInput;
  audit: PaletteAuditReport;
  neutralScale12: ColorScale12;
  accentScale12: ColorScale12;
  typography: DesignTypographyInput;
  cssVariables: string;
  tailwindV4Theme: string;
  w3cDtcgJson: Record<string, unknown>;
}

const FLUID_TYPE_SCALE: ReadonlyArray<{
  token: string;
  clamp: string;
  description: string;
}> = [
  { token: 'xs', clamp: 'clamp(0.75rem, 0.72rem + 0.12vw, 0.8125rem)', description: 'Micro telemetry & metadata' },
  { token: 'sm', clamp: 'clamp(0.875rem, 0.84rem + 0.16vw, 0.9375rem)', description: 'Secondary labels & captions' },
  { token: 'base', clamp: 'clamp(1rem, 0.96rem + 0.2vw, 1.0625rem)', description: 'Primary editorial body copy' },
  { token: 'lg', clamp: 'clamp(1.125rem, 1.05rem + 0.35vw, 1.25rem)', description: 'Lead paragraphs & subheads' },
  { token: 'xl', clamp: 'clamp(1.375rem, 1.22rem + 0.7vw, 1.625rem)', description: 'Section headings' },
  { token: '2xl', clamp: 'clamp(1.75rem, 1.48rem + 1.2vw, 2.25rem)', description: 'Feature titles' },
  { token: '3xl', clamp: 'clamp(2.25rem, 1.8rem + 2vw, 3.25rem)', description: 'Editorial display headline' },
  { token: 'display', clamp: 'clamp(3rem, 2.2rem + 3.6vw, 4.75rem)', description: 'Hero architectural display' },
];

const SPACING_LADDER: ReadonlyArray<{
  token: string;
  px: number;
  rem: string;
}> = [
  { token: '1', px: 4, rem: '0.25rem' },
  { token: '2', px: 8, rem: '0.5rem' },
  { token: '4', px: 16, rem: '1rem' },
  { token: '6', px: 24, rem: '1.5rem' },
  { token: '12', px: 48, rem: '3rem' },
  { token: '24', px: 96, rem: '6rem' },
];

const PALETTE_KEYS: ReadonlyArray<{
  key: keyof PaletteTokensInput;
  cssName: string;
  description: string;
}> = [
  { key: 'canvas', cssName: 'canvas', description: 'Primary application canvas background' },
  { key: 'surface', cssName: 'surface', description: 'Elevated card and panel surface' },
  { key: 'surfaceMuted', cssName: 'surface-muted', description: 'Recessed or secondary container surface' },
  { key: 'inkPrimary', cssName: 'ink-primary', description: 'High-contrast primary foreground ink' },
  { key: 'inkSecondary', cssName: 'ink-secondary', description: 'Secondary descriptive foreground ink' },
  { key: 'accent', cssName: 'accent', description: 'Primary brand and interactive accent' },
  { key: 'accentContrast', cssName: 'accent-contrast', description: 'Foreground ink rendered atop accent fills' },
  { key: 'borderSubtle', cssName: 'border-subtle', description: 'Hairline structural divider and frame border' },
];

function pickDefaultTypography(mode: 'light' | 'dark'): DesignTypographyInput {
  const match = PALETTE_ARCHETYPES.find((arch) => arch.mode === mode) ?? PALETTE_ARCHETYPES[0];
  return {
    displayFont: match.typography.displayFont,
    bodyFont: match.typography.bodyFont,
    monoFont: match.typography.monoFont,
    googleFontsUrl: match.typography.googleFontsUrl,
  };
}

function pickOptimalContrastHex(bgHex: string): string {
  const lightLc = Math.abs(calcAPCA('#FFFFFF', bgHex));
  const darkLc = Math.abs(calcAPCA('#0D0E10', bgHex));
  return lightLc >= darkLc ? '#FFFFFF' : '#0D0E10';
}

function buildCssVariables(
  name: string,
  mode: 'light' | 'dark',
  palette: PaletteTokensInput,
  neutralScale12: ColorScale12,
  accentScale12: ColorScale12,
  typography: DesignTypographyInput,
): string {
  const lines: string[] = [
    `/* AntiSlop v2 Compiled Design Tokens — ${name} (${mode}) */`,
    ':root {',
    `  color-scheme: ${mode};`,
    '',
    '  /* Semantic Palette (sRGB Hex) */',
  ];

  for (const item of PALETTE_KEYS) {
    lines.push(`  --color-${item.cssName}: ${palette[item.key]};`);
  }

  lines.push('', '  /* Semantic Palette (OKLCH) */');
  for (const item of PALETTE_KEYS) {
    const oklch = hexToOklch(palette[item.key]);
    lines.push(`  --oklch-${item.cssName}: ${oklchToCss(oklch)};`);
  }

  lines.push('', '  /* Semantic Palette (Display P3) */');
  for (const item of PALETTE_KEYS) {
    const oklch = hexToOklch(palette[item.key]);
    lines.push(`  --p3-${item.cssName}: ${oklchToP3Css(oklch)};`);
  }

  lines.push('', '  /* 12-Step Neutral Scale (Hex / OKLCH / Display P3) */');
  for (const step of neutralScale12.steps) {
    lines.push(`  --color-neutral-${step.step}: ${step.hex};`);
    lines.push(`  --oklch-neutral-${step.step}: ${step.oklchCss};`);
    lines.push(`  --p3-neutral-${step.step}: ${step.p3Css};`);
  }

  lines.push('', '  /* 12-Step Accent Scale (Hex / OKLCH / Display P3) */');
  for (const step of accentScale12.steps) {
    lines.push(`  --color-accent-${step.step}: ${step.hex};`);
    lines.push(`  --oklch-accent-${step.step}: ${step.oklchCss};`);
    lines.push(`  --p3-accent-${step.step}: ${step.p3Css};`);
  }

  lines.push(
    '',
    '  /* Typography Families */',
    `  --font-display: ${typography.displayFont};`,
    `  --font-body: ${typography.bodyFont};`,
    `  --font-mono: ${typography.monoFont};`,
    '',
    '  /* Fluid Editorial Type Scale */',
  );
  for (const entry of FLUID_TYPE_SCALE) {
    lines.push(`  --text-${entry.token}: ${entry.clamp};`);
  }

  lines.push('', '  /* Architectural Spacing Ladder (4 / 8 / 16 / 24 / 48 / 96) */');
  for (const space of SPACING_LADDER) {
    lines.push(`  --space-${space.token}: ${space.px}px;`);
  }

  lines.push('}');
  return lines.join('\n');
}

function buildTailwindV4Theme(
  name: string,
  palette: PaletteTokensInput,
  neutralScale12: ColorScale12,
  accentScale12: ColorScale12,
  typography: DesignTypographyInput,
): string {
  const lines: string[] = [
    `/* Tailwind v4 @theme — ${name} */`,
    '@theme {',
    '  /* Semantic Colors */',
  ];

  for (const item of PALETTE_KEYS) {
    const oklch = hexToOklch(palette[item.key]);
    lines.push(`  --color-${item.cssName}: ${oklchToCss(oklch)};`);
  }

  lines.push('', '  /* Neutral 12-Step Scale */');
  for (const step of neutralScale12.steps) {
    lines.push(`  --color-neutral-${step.step}: ${step.oklchCss};`);
  }

  lines.push('', '  /* Accent 12-Step Scale */');
  for (const step of accentScale12.steps) {
    lines.push(`  --color-accent-${step.step}: ${step.oklchCss};`);
  }

  lines.push(
    '',
    '  /* Typography */',
    `  --font-display: ${typography.displayFont};`,
    `  --font-sans: ${typography.bodyFont};`,
    `  --font-mono: ${typography.monoFont};`,
    '',
    '  /* Fluid Type Scale */',
  );
  for (const entry of FLUID_TYPE_SCALE) {
    lines.push(`  --text-${entry.token}: ${entry.clamp};`);
  }

  lines.push('', '  /* Spacing Ladder */');
  for (const space of SPACING_LADDER) {
    lines.push(`  --spacing-${space.token}: ${space.px}px;`);
  }

  lines.push('}');
  return lines.join('\n');
}

function buildW3cDtcgJson(
  name: string,
  mode: 'light' | 'dark',
  palette: PaletteTokensInput,
  audit: PaletteAuditReport,
  neutralScale12: ColorScale12,
  accentScale12: ColorScale12,
  typography: DesignTypographyInput,
): Record<string, unknown> {
  const semanticColors: Record<string, unknown> = {};
  for (const item of PALETTE_KEYS) {
    const hex = palette[item.key];
    const oklch = hexToOklch(hex);
    semanticColors[item.key] = {
      $value: hex,
      $type: 'color',
      $description: item.description,
      $extensions: {
        'com.antislop.color': {
          oklch: oklchToCss(oklch),
          p3: oklchToP3Css(oklch),
        },
      },
    };
  }

  const neutralSteps: Record<string, unknown> = {};
  for (const step of neutralScale12.steps) {
    neutralSteps[String(step.step)] = {
      $value: step.hex,
      $type: 'color',
      $description: step.role,
      $extensions: {
        'com.antislop.color': {
          oklch: step.oklchCss,
          p3: step.p3Css,
          apcaOnCanvas: step.apcaOnCanvas,
          wcagOnCanvas: step.wcagOnCanvas,
        },
      },
    };
  }

  const accentSteps: Record<string, unknown> = {};
  for (const step of accentScale12.steps) {
    accentSteps[String(step.step)] = {
      $value: step.hex,
      $type: 'color',
      $description: step.role,
      $extensions: {
        'com.antislop.color': {
          oklch: step.oklchCss,
          p3: step.p3Css,
          apcaOnCanvas: step.apcaOnCanvas,
          wcagOnCanvas: step.wcagOnCanvas,
        },
      },
    };
  }

  const fontSizeTokens: Record<string, unknown> = {};
  for (const entry of FLUID_TYPE_SCALE) {
    fontSizeTokens[entry.token] = {
      $value: entry.clamp,
      $type: 'dimension',
      $description: entry.description,
    };
  }

  const spacingTokens: Record<string, unknown> = {};
  for (const space of SPACING_LADDER) {
    spacingTokens[space.token] = {
      $value: `${space.px}px`,
      $type: 'dimension',
      $description: `Architectural spacing step (${space.rem})`,
    };
  }

  return {
    $schema: 'https://tr.designtokens.org/format/',
    $description: `AntiSlop v2 W3C DTCG Design System: ${name} (${mode})`,
    color: {
      semantic: semanticColors,
      neutral: neutralSteps,
      accent: accentSteps,
    },
    typography: {
      fontFamily: {
        display: {
          $value: typography.displayFont,
          $type: 'fontFamily',
          $description: 'Editorial display font stack',
        },
        body: {
          $value: typography.bodyFont,
          $type: 'fontFamily',
          $description: 'Primary reading and UI body font stack',
        },
        mono: {
          $value: typography.monoFont,
          $type: 'fontFamily',
          $description: 'Technical telemetry and code monospace stack',
        },
      },
      fontSize: fontSizeTokens,
    },
    spacing: spacingTokens,
    $extensions: {
      'com.antislop.metadata': {
        name,
        mode,
        googleFontsUrl: typography.googleFontsUrl ?? null,
        apcaAudit: audit,
      },
    },
  };
}

export function compileDesignTokens(input: CompileDesignTokensInput): CompiledDesignSystem {
  const mode = input.mode;
  const typography = input.typography ?? pickDefaultTypography(mode);

  const defaultNeutralSeed = mode === 'dark' ? '#111318' : '#F7F5F0';
  const defaultAccentSeed = mode === 'dark' ? '#4C8DFF' : '#C9301A';

  const neutralSeedHex = normalizeHex(
    input.seedNeutralHex ?? input.palette?.canvas ?? defaultNeutralSeed,
  );
  const accentSeedHex = normalizeHex(
    input.seedAccentHex ?? input.palette?.accent ?? defaultAccentSeed,
  );

  const neutralScale12 = generate12StepScale(neutralSeedHex, mode, 0.25);
  const accentScale12 = generate12StepScale(accentSeedHex, mode);

  const rawPalette: PaletteTokensInput = input.palette
    ? { ...input.palette }
    : {
        canvas: neutralScale12.steps[0].hex,
        surface: neutralScale12.steps[1].hex,
        surfaceMuted: neutralScale12.steps[2].hex,
        inkPrimary: neutralScale12.steps[11].hex,
        inkSecondary: neutralScale12.steps[10].hex,
        accent: accentScale12.steps[8].hex,
        accentContrast: pickOptimalContrastHex(accentScale12.steps[8].hex),
        borderSubtle: neutralScale12.steps[5].hex,
      };

  const { repaired: palette, report: audit } = enforceApcaPalette(rawPalette);

  const cssVariables = buildCssVariables(
    input.name,
    mode,
    palette,
    neutralScale12,
    accentScale12,
    typography,
  );

  const tailwindV4Theme = buildTailwindV4Theme(
    input.name,
    palette,
    neutralScale12,
    accentScale12,
    typography,
  );

  const w3cDtcgJson = buildW3cDtcgJson(
    input.name,
    mode,
    palette,
    audit,
    neutralScale12,
    accentScale12,
    typography,
  );

  return {
    name: input.name,
    mode,
    palette,
    audit,
    neutralScale12,
    accentScale12,
    typography,
    cssVariables,
    tailwindV4Theme,
    w3cDtcgJson,
  };
}
