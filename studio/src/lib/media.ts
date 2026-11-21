import type { InputModality, MediaAssetInput } from '@shared/types';

export interface LocalMediaAsset extends MediaAssetInput {
  /** Local preview data URI or object URL for instant rendering in the Taste Tray */
  previewUrl: string;
  sizeBytes?: number;
  /** Optional captured live website metadata for domain badge + extracted CSS DNA tooltip */
  sourceUrl?: string;
  sourceDomain?: string;
  extractedCssSummary?: string;
}

export function extractDomainFromUrl(rawUrl: string): string {
  try {
    const normalized = /^https?:\/\//i.test(rawUrl.trim())
      ? rawUrl.trim()
      : `https://${rawUrl.trim()}`;
    const parsed = new URL(normalized);
    return parsed.hostname.replace(/^www\./i, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || rawUrl;
  }
}

export function createAssetId(prefix = 'asset'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function fileToLocalAsset(
  file: File,
  modality: InputModality
): Promise<LocalMediaAsset> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });

  const commaIdx = dataUrl.indexOf(',');
  const dataBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const mimeType = file.type || (modality === 'motion_video' ? 'video/mp4' : 'image/png');

  return {
    id: createAssetId(modality),
    modality,
    mimeType,
    dataBase64,
    filename: file.name,
    label: file.name.replace(/\.[^/.]+$/, ''),
    previewUrl: dataUrl,
    sizeBytes: file.size,
  };
}

export function stripToMediaAssetInput(asset: LocalMediaAsset): MediaAssetInput {
  return {
    id: asset.id,
    modality: asset.modality,
    mimeType: asset.mimeType,
    dataBase64: asset.dataBase64,
    fileUrl: asset.fileUrl,
    filename: asset.filename,
    label: asset.label,
    regionBox: asset.regionBox,
  };
}

export interface QuickTasteStarter {
  id: 'swiss_atelier' | 'kyoto_ceramic' | 'braun_hardware';
  title: string;
  subtitle: string;
  swatches: [string, string, string, string];
  voiceHint: string;
}

export const QUICK_TASTE_STARTERS: QuickTasteStarter[] = [
  {
    id: 'swiss_atelier',
    title: 'Swiss Editorial Print',
    subtitle: 'Archival newsprint · Vermilion rule · Serif tension',
    swatches: ['#F6F2EA', '#141413', '#DF3A2B', '#D8D1C4'],
    voiceHint:
      'Transform into a tactile Swiss print editorial magazine layout: warm archival paper, razor-sharp 1px hairlines, oversized high-contrast serif display typography, generous breathing room, and a single vermilion ink accent.',
  },
  {
    id: 'kyoto_ceramic',
    title: 'Kyoto Wabi-Sabi Craft',
    subtitle: 'Raw linen · Sumi ink · Moss patina · Slow cadence',
    swatches: ['#EFECE4', '#1F201D', '#4A5D4E', '#B9A88F'],
    voiceHint:
      'Channel quiet Kyoto ceramic studio craft: warm unbleached linen surfaces, soft sumi charcoal typography, restrained moss-green accents, asymmetrical gallery whitespace, and calm unhurried hover motion.',
  },
  {
    id: 'braun_hardware',
    title: 'Dieter Rams Atelier',
    subtitle: 'Anodized alabaster · Graphite grid · Safety orange',
    swatches: ['#E9E9E6', '#1B1C1E', '#E85D22', '#BFC2BD'],
    voiceHint:
      'Design like a tactile 1968 Braun Hi-Fi instrument panel: matte warm aluminum stone surfaces, crisp tabular monospace readouts, precision grid subdivisions, flat physical buttons, and a single functional safety-orange indicator.',
  },
];

/**
 * Procedurally renders a rich 960x640 real visual moodboard PNG on HTML5 canvas
 * so clicking an optional Quick-Start sends genuine high-resolution visual pixels
 * to Gemini 4 Carbon, Decisions API, and Embedding-2 (zero text-only shortcuts).
 */
export function buildQuickStarterVisualAsset(starter: QuickTasteStarter): LocalMediaAsset {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  const [bg, ink, accent] = starter.swatches;

  // Base archival surface
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 960, 640);

  // Subtle organic paper grain
  for (let i = 0; i < 1800; i++) {
    const x = (i * 197) % 960;
    const y = (i * 353) % 640;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(20,20,19,0.03)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(x, y, 2, 2);
  }

  if (starter.id === 'swiss_atelier') {
    // Swiss 12-column hairline grid
    ctx.strokeStyle = 'rgba(20,20,19,0.14)';
    ctx.lineWidth = 1;
    for (let x = 48; x <= 912; x += 72) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, 600);
      ctx.stroke();
    }
    // Top editorial rule
    ctx.fillStyle = ink;
    ctx.fillRect(48, 44, 864, 3);
    ctx.font = '600 13px monospace';
    ctx.fillText('SPECIMEN 01 — SWISS EDITORIAL ARCHIVE · ZÜRICH / NYC', 48, 72);
    ctx.fillStyle = accent;
    ctx.fillRect(48, 92, 132, 10);

    // Oversized editorial headline block
    ctx.fillStyle = ink;
    ctx.font = '400 102px Georgia, serif';
    ctx.fillText('Form &', 48, 224);
    ctx.font = 'italic 400 102px Georgia, serif';
    ctx.fillText('Clarity.', 48, 322);

    // Right geometric print plate
    ctx.fillStyle = accent;
    ctx.fillRect(540, 128, 372, 260);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(726, 258, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillRect(584, 332, 284, 2);

    // Bottom typographic specimen columns
    ctx.strokeStyle = ink;
    ctx.beginPath();
    ctx.moveTo(48, 424);
    ctx.lineTo(912, 424);
    ctx.stroke();

    ctx.fillStyle = ink;
    ctx.font = '500 15px sans-serif';
    ctx.fillText('01 / Hairline Grid Discipline', 48, 464);
    ctx.fillText('02 / High-Contrast Serif Display', 356, 464);
    ctx.fillText('03 / Decisive Vermilion Accent', 664, 464);

    ctx.fillStyle = 'rgba(20,20,19,0.62)';
    ctx.font = '400 13px sans-serif';
    ctx.fillText('Flat tactile print surfaces. Zero gradients.', 48, 492);
    ctx.fillText('Generous margins & editorial cadence.', 356, 492);
    ctx.fillText('One crisp ink focal point per fold.', 664, 492);

    // Swatch footer
    starter.swatches.forEach((hex, idx) => {
      const sx = 48 + idx * 116;
      ctx.fillStyle = hex;
      ctx.fillRect(sx, 536, 98, 42);
      ctx.strokeStyle = 'rgba(20,20,19,0.25)';
      ctx.strokeRect(sx, 536, 98, 42);
      ctx.fillStyle = ink;
      ctx.font = '500 11px monospace';
      ctx.fillText(hex, sx, 594);
    });
  } else if (starter.id === 'kyoto_ceramic') {
    // Organic stoneware composition
    ctx.fillStyle = '#E6E1D6';
    ctx.fillRect(52, 52, 420, 536);

    // Sculptural ceramic vessel silhouette
    ctx.fillStyle = '#2B2C28';
    ctx.beginPath();
    ctx.ellipse(262, 340, 126, 152, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#B9A88F';
    ctx.beginPath();
    ctx.ellipse(262, 212, 62, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4A5D4E';
    ctx.fillRect(156, 468, 212, 16);

    // Quiet asymmetrical gallery typography
    ctx.fillStyle = ink;
    ctx.font = '400 13px monospace';
    ctx.fillText('KYOTO STUDIO · EDITION IV', 524, 96);

    ctx.strokeStyle = 'rgba(31,32,29,0.22)';
    ctx.beginPath();
    ctx.moveTo(524, 118);
    ctx.lineTo(896, 118);
    ctx.stroke();

    ctx.font = '400 72px Georgia, serif';
    ctx.fillText('Quiet', 524, 224);
    ctx.font = 'italic 400 72px Georgia, serif';
    ctx.fillText('Materiality', 524, 298);

    ctx.fillStyle = '#53554E';
    ctx.font = '400 16px sans-serif';
    ctx.fillText('Unbleached linen, raw stoneware, deliberate', 524, 360);
    ctx.fillText('negative space, and unhurried typographic', 524, 386);
    ctx.fillText('proportion without visual noise.', 524, 412);

    // Tactile material strips
    starter.swatches.forEach((hex, idx) => {
      const sx = 524 + idx * 92;
      ctx.fillStyle = hex;
      ctx.fillRect(sx, 488, 76, 76);
      ctx.strokeStyle = 'rgba(31,32,29,0.2)';
      ctx.strokeRect(sx, 488, 76, 76);
      ctx.fillStyle = ink;
      ctx.font = '500 11px monospace';
      ctx.fillText(hex, sx, 584);
    });
  } else {
    // Braun / Dieter Rams Industrial Spec Sheet
    ctx.strokeStyle = '#C9CBC6';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(36, 36, 888, 568);

    // Matte control deck module
    ctx.fillStyle = '#F7F7F5';
    ctx.fillRect(60, 64, 520, 340);
    ctx.strokeStyle = '#C9CBC6';
    ctx.strokeRect(60, 64, 520, 340);

    // Precision speaker perforation grid
    ctx.fillStyle = '#252629';
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 14; c++) {
        ctx.beginPath();
        ctx.arc(96 + c * 22, 108 + r * 22, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Precision rotary dial
    ctx.strokeStyle = ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(486, 206, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#D8DAD5';
    ctx.beginPath();
    ctx.arc(486, 206, 44, 0, Math.PI * 2);
    ctx.fill();
    // Safety orange indicator tick
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(486, 206);
    ctx.lineTo(516, 174);
    ctx.stroke();

    // Tactile rectangular hardware keys
    const keyColors = ['#1B1C1E', '#3A3C40', '#D4D6D1', accent];
    keyColors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(426 + i * 32, 316, 24, 48);
    });

    // Right industrial typography column
    ctx.fillStyle = ink;
    ctx.font = '600 12px monospace';
    ctx.fillText('MODEL TP-01 / FUNCTIONAL PRECISION', 616, 88);
    ctx.font = '700 44px sans-serif';
    ctx.fillText('Less, but', 616, 160);
    ctx.fillText('better.', 616, 210);

    ctx.fillStyle = '#55575A';
    ctx.font = '400 14px monospace';
    ctx.fillText('GRID    8px modular', 616, 272);
    ctx.fillText('BORDER  1px crisp anodized', 616, 298);
    ctx.fillText('ACCENT  #E85D22 signal only', 616, 324);
    ctx.fillText('MOTION  120ms mechanical snap', 616, 350);

    // Bottom horizontal ruler & swatches
    ctx.strokeStyle = '#C9CBC6';
    ctx.beginPath();
    ctx.moveTo(60, 440);
    ctx.lineTo(900, 440);
    ctx.stroke();

    starter.swatches.forEach((hex, idx) => {
      const sx = 60 + idx * 140;
      ctx.fillStyle = hex;
      ctx.fillRect(sx, 468, 120, 74);
      ctx.strokeStyle = '#B2B5AF';
      ctx.strokeRect(sx, 468, 120, 74);
      ctx.fillStyle = ink;
      ctx.font = '600 12px monospace';
      ctx.fillText(hex, sx, 566);
    });
  }

  const dataUrl = canvas.toDataURL('image/png');
  const commaIdx = dataUrl.indexOf(',');
  const dataBase64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;

  return {
    id: createAssetId('starter'),
    modality: 'moodboard_image',
    mimeType: 'image/png',
    dataBase64,
    filename: `${starter.id}-specimen.png`,
    label: starter.title,
    previewUrl: dataUrl,
  };
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      const idx = res.indexOf(',');
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error('Failed to encode audio blob'));
    reader.readAsDataURL(blob);
  });
}
