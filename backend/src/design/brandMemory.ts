import fs from 'node:fs/promises';
import path from 'node:path';
import { BACKEND_ROOT } from '../config/env.js';

export interface BrandScoreHistoryPoint {
  timestamp: string;
  tasteScore: number;
  conversionScore?: number;
  geometryScore?: number;
  runLabel: string;
}

export interface BrandTypographyLock {
  displayFont: string;
  bodyFont: string;
  monoFont: string;
}

export interface BrandMemoryProfile {
  workspaceId: string;
  brandName: string;
  mode: 'light' | 'dark';
  lockedPalette?: Record<string, string>;
  lockedTypography?: BrandTypographyLock;
  activeSkillIds: string[];
  bannedTropes: string[];
  notes?: string;
  updatedAt: string;
  history: BrandScoreHistoryPoint[];
}

interface PersistedBrandMemoryFile {
  version: number;
  profiles: Record<string, BrandMemoryProfile>;
}

const DEFAULT_ACTIVE_SKILL_IDS: readonly string[] = [
  'antislop-design-craft',
  'google-m3e-baseline-craft',
];

const DEFAULT_BANNED_TROPES: readonly string[] = [
  'neon purple-to-cyan gradients',
  'unmotivated glassmorphism cards',
  'generic 3-column bento feature grids with glowing icons',
  'floating decorative sparkles or AI-wand emojis',
  'oversized pill badges above every heading',
  'low-contrast gray-on-dark-gray body text',
];

const MAX_HISTORY_POINTS = 30;

function normalizeWorkspaceId(workspaceId: string): string {
  const trimmed = workspaceId.trim();
  return trimmed.length > 0 ? trimmed : 'default';
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function deriveDefaultBrandName(workspaceId: string): string {
  if (workspaceId === 'default') return 'Default Brand';
  return workspaceId
    .split(/[-_\s]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function cloneHistoryPoint(point: BrandScoreHistoryPoint): BrandScoreHistoryPoint {
  const cloned: BrandScoreHistoryPoint = {
    timestamp: point.timestamp,
    tasteScore: point.tasteScore,
    runLabel: point.runLabel,
  };
  if (typeof point.conversionScore === 'number') {
    cloned.conversionScore = point.conversionScore;
  }
  if (typeof point.geometryScore === 'number') {
    cloned.geometryScore = point.geometryScore;
  }
  return cloned;
}

function cloneProfile(profile: BrandMemoryProfile): BrandMemoryProfile {
  const cloned: BrandMemoryProfile = {
    workspaceId: profile.workspaceId,
    brandName: profile.brandName,
    mode: profile.mode,
    activeSkillIds: [...profile.activeSkillIds],
    bannedTropes: [...profile.bannedTropes],
    updatedAt: profile.updatedAt,
    history: profile.history.map(cloneHistoryPoint),
  };
  if (profile.lockedPalette) {
    cloned.lockedPalette = { ...profile.lockedPalette };
  }
  if (profile.lockedTypography) {
    cloned.lockedTypography = { ...profile.lockedTypography };
  }
  if (typeof profile.notes === 'string') {
    cloned.notes = profile.notes;
  }
  return cloned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseHistoryPoint(raw: unknown): BrandScoreHistoryPoint | null {
  if (!isRecord(raw)) return null;
  if (
    typeof raw.timestamp !== 'string' ||
    typeof raw.tasteScore !== 'number' ||
    !Number.isFinite(raw.tasteScore) ||
    typeof raw.runLabel !== 'string'
  ) {
    return null;
  }
  const point: BrandScoreHistoryPoint = {
    timestamp: raw.timestamp,
    tasteScore: raw.tasteScore,
    runLabel: raw.runLabel,
  };
  if (typeof raw.conversionScore === 'number' && Number.isFinite(raw.conversionScore)) {
    point.conversionScore = raw.conversionScore;
  }
  if (typeof raw.geometryScore === 'number' && Number.isFinite(raw.geometryScore)) {
    point.geometryScore = raw.geometryScore;
  }
  return point;
}

function parseProfile(workspaceId: string, raw: unknown): BrandMemoryProfile | null {
  if (!isRecord(raw)) return null;
  const normalizedId = normalizeWorkspaceId(
    typeof raw.workspaceId === 'string' ? raw.workspaceId : workspaceId,
  );
  const mode: 'light' | 'dark' = raw.mode === 'dark' ? 'dark' : 'light';
  const brandName =
    typeof raw.brandName === 'string' && raw.brandName.trim().length > 0
      ? raw.brandName.trim()
      : deriveDefaultBrandName(normalizedId);

  const activeSkillIds = Array.isArray(raw.activeSkillIds)
    ? dedupeStrings(raw.activeSkillIds.filter((item): item is string => typeof item === 'string'))
    : [...DEFAULT_ACTIVE_SKILL_IDS];

  const bannedTropes = Array.isArray(raw.bannedTropes)
    ? dedupeStrings(raw.bannedTropes.filter((item): item is string => typeof item === 'string'))
    : [...DEFAULT_BANNED_TROPES];

  const history = Array.isArray(raw.history)
    ? raw.history
        .map(parseHistoryPoint)
        .filter((point): point is BrandScoreHistoryPoint => point !== null)
        .slice(-MAX_HISTORY_POINTS)
    : [];

  const profile: BrandMemoryProfile = {
    workspaceId: normalizedId,
    brandName,
    mode,
    activeSkillIds: activeSkillIds.length > 0 ? activeSkillIds : [...DEFAULT_ACTIVE_SKILL_IDS],
    bannedTropes,
    updatedAt:
      typeof raw.updatedAt === 'string' && raw.updatedAt.trim().length > 0
        ? raw.updatedAt
        : new Date().toISOString(),
    history,
  };

  if (isRecord(raw.lockedPalette)) {
    const palette: Record<string, string> = {};
    for (const [token, value] of Object.entries(raw.lockedPalette)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        palette[token] = value.trim();
      }
    }
    if (Object.keys(palette).length > 0) {
      profile.lockedPalette = palette;
    }
  }

  if (
    isRecord(raw.lockedTypography) &&
    typeof raw.lockedTypography.displayFont === 'string' &&
    typeof raw.lockedTypography.bodyFont === 'string' &&
    typeof raw.lockedTypography.monoFont === 'string'
  ) {
    profile.lockedTypography = {
      displayFont: raw.lockedTypography.displayFont.trim(),
      bodyFont: raw.lockedTypography.bodyFont.trim(),
      monoFont: raw.lockedTypography.monoFont.trim(),
    };
  }

  if (typeof raw.notes === 'string' && raw.notes.trim().length > 0) {
    profile.notes = raw.notes.trim();
  }

  return profile;
}

export class BrandMemoryStore {
  private readonly filePath: string;
  private cache: Map<string, BrandMemoryProfile> | null = null;
  private loadPromise: Promise<Map<string, BrandMemoryProfile>> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string = path.join(BACKEND_ROOT, '.antislop-brand-memory.json')) {
    this.filePath = filePath;
  }

  private createDefaultProfile(workspaceId: string): BrandMemoryProfile {
    const normalizedId = normalizeWorkspaceId(workspaceId);
    return {
      workspaceId: normalizedId,
      brandName: deriveDefaultBrandName(normalizedId),
      mode: 'light',
      activeSkillIds: [...DEFAULT_ACTIVE_SKILL_IDS],
      bannedTropes: [...DEFAULT_BANNED_TROPES],
      updatedAt: new Date().toISOString(),
      history: [],
    };
  }

  private async ensureLoaded(): Promise<Map<string, BrandMemoryProfile>> {
    if (this.cache) return this.cache;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      const profiles = new Map<string, BrandMemoryProfile>();
      try {
        const rawText = await fs.readFile(this.filePath, 'utf8');
        const parsed: unknown = JSON.parse(rawText);
        if (isRecord(parsed)) {
          const sourceRecord = isRecord(parsed.profiles) ? parsed.profiles : parsed;
          for (const [key, value] of Object.entries(sourceRecord)) {
            const profile = parseProfile(key, value);
            if (profile) {
              profiles.set(profile.workspaceId, profile);
            }
          }
        }
      } catch (error: unknown) {
        const errCode =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined;
        if (errCode !== 'ENOENT') {
          console.warn(
            `[BrandMemoryStore] Failed to load ${this.filePath}; starting with empty cache.`,
            error,
          );
        }
      }
      this.cache = profiles;
      return profiles;
    })();

    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async persistAtomic(profiles: Map<string, BrandMemoryProfile>): Promise<void> {
    const payload: PersistedBrandMemoryFile = {
      version: 1,
      profiles: Object.fromEntries(
        Array.from(profiles.entries()).map(([id, profile]) => [id, cloneProfile(profile)]),
      ),
    };
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    const dir = path.dirname(this.filePath);
    const tmpPath = path.join(
      dir,
      `.${path.basename(this.filePath)}.${process.pid}.${Date.now()}.${Math.random()
        .toString(36)
        .slice(2, 8)}.tmp`,
    );

    const runWrite = async (): Promise<void> => {
      await fs.mkdir(dir, { recursive: true });
      try {
        await fs.writeFile(tmpPath, serialized, 'utf8');
        await fs.rename(tmpPath, this.filePath);
      } catch (error) {
        await fs.unlink(tmpPath).catch(() => undefined);
        throw error;
      }
    };

    const next = this.writeQueue.then(runWrite, runWrite);
    this.writeQueue = next.catch(() => undefined);
    await next;
  }

  async getProfile(workspaceId: string): Promise<BrandMemoryProfile> {
    const normalizedId = normalizeWorkspaceId(workspaceId);
    const profiles = await this.ensureLoaded();
    const existing = profiles.get(normalizedId);
    if (existing) {
      return cloneProfile(existing);
    }
    return this.createDefaultProfile(normalizedId);
  }

  async saveProfile(
    workspaceId: string,
    patch: Partial<BrandMemoryProfile>,
  ): Promise<BrandMemoryProfile> {
    const normalizedId = normalizeWorkspaceId(workspaceId);
    const profiles = await this.ensureLoaded();
    const base = profiles.get(normalizedId) ?? this.createDefaultProfile(normalizedId);

    const merged: BrandMemoryProfile = {
      workspaceId: normalizedId,
      brandName:
        typeof patch.brandName === 'string' && patch.brandName.trim().length > 0
          ? patch.brandName.trim()
          : base.brandName,
      mode: patch.mode === 'light' || patch.mode === 'dark' ? patch.mode : base.mode,
      activeSkillIds: Array.isArray(patch.activeSkillIds)
        ? dedupeStrings(patch.activeSkillIds)
        : [...base.activeSkillIds],
      bannedTropes: Array.isArray(patch.bannedTropes)
        ? dedupeStrings(patch.bannedTropes)
        : [...base.bannedTropes],
      updatedAt: new Date().toISOString(),
      history: Array.isArray(patch.history)
        ? patch.history.map(cloneHistoryPoint).slice(-MAX_HISTORY_POINTS)
        : base.history.map(cloneHistoryPoint),
    };

    if ('lockedPalette' in patch) {
      if (patch.lockedPalette && Object.keys(patch.lockedPalette).length > 0) {
        const sanitizedPalette: Record<string, string> = {};
        for (const [token, value] of Object.entries(patch.lockedPalette)) {
          if (typeof value === 'string' && value.trim().length > 0) {
            sanitizedPalette[token] = value.trim();
          }
        }
        if (Object.keys(sanitizedPalette).length > 0) {
          merged.lockedPalette = sanitizedPalette;
        }
      }
    } else if (base.lockedPalette) {
      merged.lockedPalette = { ...base.lockedPalette };
    }

    if ('lockedTypography' in patch) {
      if (patch.lockedTypography) {
        merged.lockedTypography = {
          displayFont: patch.lockedTypography.displayFont.trim(),
          bodyFont: patch.lockedTypography.bodyFont.trim(),
          monoFont: patch.lockedTypography.monoFont.trim(),
        };
      }
    } else if (base.lockedTypography) {
      merged.lockedTypography = { ...base.lockedTypography };
    }

    if ('notes' in patch) {
      if (typeof patch.notes === 'string' && patch.notes.trim().length > 0) {
        merged.notes = patch.notes.trim();
      }
    } else if (typeof base.notes === 'string') {
      merged.notes = base.notes;
    }

    profiles.set(normalizedId, merged);
    await this.persistAtomic(profiles);
    return cloneProfile(merged);
  }

  async recordScorePoint(
    workspaceId: string,
    point: Omit<BrandScoreHistoryPoint, 'timestamp'>,
  ): Promise<BrandMemoryProfile> {
    const normalizedId = normalizeWorkspaceId(workspaceId);
    const profiles = await this.ensureLoaded();
    const base = profiles.get(normalizedId) ?? this.createDefaultProfile(normalizedId);

    const newPoint: BrandScoreHistoryPoint = {
      timestamp: new Date().toISOString(),
      tasteScore: point.tasteScore,
      runLabel: point.runLabel,
    };
    if (typeof point.conversionScore === 'number') {
      newPoint.conversionScore = point.conversionScore;
    }
    if (typeof point.geometryScore === 'number') {
      newPoint.geometryScore = point.geometryScore;
    }

    const updated: BrandMemoryProfile = {
      ...cloneProfile(base),
      updatedAt: newPoint.timestamp,
      history: [...base.history.map(cloneHistoryPoint), newPoint].slice(-MAX_HISTORY_POINTS),
    };

    profiles.set(normalizedId, updated);
    await this.persistAtomic(profiles);
    return cloneProfile(updated);
  }

  async listProfiles(): Promise<BrandMemoryProfile[]> {
    const profiles = await this.ensureLoaded();
    return Array.from(profiles.values())
      .map(cloneProfile)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async formatBrandPromptConstraints(workspaceId: string): Promise<string> {
    const profile = await this.getProfile(workspaceId);
    const lines: string[] = [
      `[BRAND MEMORY CONSTRAINTS — ${profile.brandName} (${profile.workspaceId})]`,
      `- Mode: ${profile.mode} (strictly preserve ${profile.mode}-mode surface contrast)`,
    ];

    if (profile.activeSkillIds.length > 0) {
      lines.push(`- Active Design Skills: ${profile.activeSkillIds.join(', ')}`);
    }

    if (profile.lockedPalette && Object.keys(profile.lockedPalette).length > 0) {
      const palettePairs = Object.entries(profile.lockedPalette)
        .map(([token, value]) => `${token}=${value}`)
        .join(', ');
      lines.push(`- Locked Palette (DO NOT deviate): ${palettePairs}`);
    }

    if (profile.lockedTypography) {
      const { displayFont, bodyFont, monoFont } = profile.lockedTypography;
      lines.push(
        `- Locked Typography (DO NOT substitute): display="${displayFont}", body="${bodyFont}", mono="${monoFont}"`,
      );
    }

    if (profile.bannedTropes.length > 0) {
      lines.push(`- Banned UI Tropes (FORBIDDEN): ${profile.bannedTropes.join('; ')}`);
    }

    if (profile.notes) {
      lines.push(`- Brand Notes: ${profile.notes}`);
    }

    const latest = profile.history[profile.history.length - 1];
    if (latest) {
      const scoreParts = [`taste=${latest.tasteScore}`];
      if (typeof latest.conversionScore === 'number') {
        scoreParts.push(`conversion=${latest.conversionScore}`);
      }
      if (typeof latest.geometryScore === 'number') {
        scoreParts.push(`geometry=${latest.geometryScore}`);
      }
      lines.push(`- Latest Benchmark (${latest.runLabel}): ${scoreParts.join(', ')}`);
    }

    return lines.join('\n');
  }
}

export const brandMemoryStore = new BrandMemoryStore();
