'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Fingerprint,
  Layers,
  Loader2,
  Lock,
  Moon,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Sun,
  TrendingUp,
  Type,
} from 'lucide-react';
import { BACKEND_URL } from '@/lib/api';
import { NativeDialog } from './NativeDialog';

export type BrandPolarity = 'dark' | 'light';

export interface InstalledDesignSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  lineCount: number;
  filePath?: string;
}

export interface LockedTypography {
  displayFont: string;
  bodyFont: string;
  monoFont: string;
}

export interface BrandMemoryHistoryPoint {
  id: string;
  timestamp: string;
  label?: string;
  tasteScore: number;
  conversionScore?: number;
}

export interface BrandMemoryProfile {
  workspaceId: string;
  brandName: string;
  polarity: BrandPolarity;
  lockedTypography: LockedTypography;
  bannedSlopTropes: string[];
  activeSkills: string[];
  history: BrandMemoryHistoryPoint[];
  updatedAt?: string;
}

export interface BrandMemoryModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  workspaceName?: string;
  onNotify?: (msg: string) => void;
}

interface BrandFormState {
  brandName: string;
  polarity: BrandPolarity;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  bannedTropesText: string;
  activeSkills: string[];
}

const DEFAULT_TYPOGRAPHY: LockedTypography = {
  displayFont: 'Instrument Serif',
  bodyFont: 'Plus Jakarta Sans',
  monoFont: 'JetBrains Mono',
};

const DEFAULT_BANNED_TROPES: readonly string[] = [
  'generic purple-to-cyan gradients',
  'floating 3D glass blobs',
  'fake stock testimonial avatars',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }
  return result;
}

function parseTropesInput(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

function normalizeSkillsResponse(payload: unknown): InstalledDesignSkill[] {
  const rawList: unknown[] = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.skills)
      ? payload.skills
      : isRecord(payload) && Array.isArray(payload.items)
        ? payload.items
        : [];

  const skills: InstalledDesignSkill[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const entry = rawList[i];
    if (!isRecord(entry)) continue;
    const rawName = readString(entry.name).trim();
    const rawId = readString(entry.id || entry.slug || rawName).trim();
    const id = rawId || `skill-${i + 1}`;
    const name = rawName || id;
    const version = readString(entry.version, '1.0.0').trim() || '1.0.0';
    const description =
      readString(entry.description).trim() ||
      'Mounted SKILL.md craft specification for Gemini design direction.';
    const lineCount = Math.max(0, Math.round(readFiniteNumber(entry.lineCount ?? entry.lines) ?? 0));
    const filePath = readString(entry.filePath || entry.path).trim() || undefined;

    skills.push({
      id,
      name,
      version,
      description,
      lineCount,
      filePath,
    });
  }
  return skills;
}

function normalizeHistoryPoint(entry: unknown, index: number): BrandMemoryHistoryPoint | null {
  if (!isRecord(entry)) return null;
  const tasteRaw = readFiniteNumber(
    entry.tasteScore ??
      entry.overallTasteScore ??
      entry.taste ??
      entry.score ??
      entry.overallScore
  );
  if (tasteRaw === undefined) return null;

  const conversionRaw = readFiniteNumber(
    entry.conversionScore ?? entry.conversion ?? entry.conversionReadiness
  );

  const timestamp =
    readString(entry.timestamp || entry.recordedAt || entry.createdAt || entry.date).trim() ||
    `Run ${index + 1}`;
  const label = readString(entry.label || entry.mode || entry.runId).trim() || undefined;
  const id = readString(entry.id || entry.runId).trim() || `hist-${index}`;

  return {
    id,
    timestamp,
    label,
    tasteScore: clampScore(tasteRaw),
    conversionScore: conversionRaw !== undefined ? clampScore(conversionRaw) : undefined,
  };
}

function normalizeProfileResponse(
  payload: unknown,
  workspaceId: string,
  workspaceName?: string
): BrandMemoryProfile {
  const source =
    isRecord(payload) && isRecord(payload.profile)
      ? payload.profile
      : isRecord(payload) && isRecord(payload.memory)
        ? payload.memory
        : isRecord(payload)
          ? payload
          : {};

  const brandName =
    readString(source.brandName || source.name).trim() ||
    workspaceName?.trim() ||
    workspaceId;

  const polarityRaw = readString(source.polarity || source.theme || source.colorPolarity)
    .trim()
    .toLowerCase();
  const polarity: BrandPolarity = polarityRaw === 'light' ? 'light' : 'dark';

  const typoSource = isRecord(source.lockedTypography)
    ? source.lockedTypography
    : isRecord(source.typography)
      ? source.typography
      : {};

  const lockedTypography: LockedTypography = {
    displayFont:
      readString(typoSource.displayFont ?? source.displayFont).trim() ||
      DEFAULT_TYPOGRAPHY.displayFont,
    bodyFont:
      readString(typoSource.bodyFont ?? source.bodyFont).trim() ||
      DEFAULT_TYPOGRAPHY.bodyFont,
    monoFont:
      readString(typoSource.monoFont ?? source.monoFont).trim() ||
      DEFAULT_TYPOGRAPHY.monoFont,
  };

  const bannedRaw =
    source.bannedSlopTropes ?? source.bannedTropes ?? source.slopBans;
  const hasExplicitBanned = Array.isArray(bannedRaw);
  const bannedSlopTropes = hasExplicitBanned
    ? readStringArray(bannedRaw)
    : [...DEFAULT_BANNED_TROPES];

  const activeSkills = readStringArray(
    source.activeSkills ?? source.activeSkillIds ?? source.mountedSkills
  );

  const rawHistory = Array.isArray(source.history)
    ? source.history
    : Array.isArray(source.tasteHistory)
      ? source.tasteHistory
      : Array.isArray(source.scoreHistory)
        ? source.scoreHistory
        : [];

  const history: BrandMemoryHistoryPoint[] = [];
  for (let i = 0; i < rawHistory.length; i += 1) {
    const point = normalizeHistoryPoint(rawHistory[i], i);
    if (point) history.push(point);
  }

  const updatedAt = readString(source.updatedAt || source.lastSavedAt).trim() || undefined;

  return {
    workspaceId,
    brandName,
    polarity,
    lockedTypography,
    bannedSlopTropes,
    activeSkills,
    history,
    updatedAt,
  };
}

function formatShortTimestamp(raw: string, index: number): string {
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) {
    return raw.length > 10 ? `R${index + 1}` : raw;
  }
  const date = new Date(parsed);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatUpdatedAt(raw?: string): string | null {
  if (!raw) return null;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) return raw;
  return new Date(parsed).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface SparklineProps {
  history: BrandMemoryHistoryPoint[];
}

function TasteConversionSparkline({ history }: SparklineProps) {
  const gradientId = useId();

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card-elevated)]/60 px-5 py-7 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] text-[var(--cobalt-ice)]">
          <TrendingUp className="h-4 w-4" />
        </div>
        <p className="mt-2.5 text-[13px] font-medium text-[var(--ink-primary)]">
          No Taste &amp; Conversion history recorded yet
        </p>
        <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--ink-secondary)]">
          Run an AntiSlop craft pass on this workspace to begin logging Taste and Conversion telemetry across iterations.
        </p>
      </div>
    );
  }

  const width = 560;
  const height = 136;
  const padLeft = 34;
  const padRight = 18;
  const padTop = 14;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (index: number): number => {
    if (history.length === 1) return padLeft + plotW / 2;
    return padLeft + (index / (history.length - 1)) * plotW;
  };

  const getY = (score: number): number => {
    const clamped = Math.max(0, Math.min(100, score));
    return padTop + plotH - (clamped / 100) * plotH;
  };

  const tasteCoords = history.map((pt, idx) => ({
    x: getX(idx),
    y: getY(pt.tasteScore),
    point: pt,
    index: idx,
  }));

  const tastePolyline = tasteCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  const baselineY = padTop + plotH;
  const areaPath =
    tasteCoords.length > 1
      ? `M ${tasteCoords[0].x.toFixed(1)} ${baselineY.toFixed(1)} ` +
        tasteCoords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ') +
        ` L ${tasteCoords[tasteCoords.length - 1].x.toFixed(1)} ${baselineY.toFixed(1)} Z`
      : '';

  const conversionCoords = history
    .map((pt, idx) =>
      pt.conversionScore !== undefined
        ? {
            x: getX(idx),
            y: getY(pt.conversionScore),
            score: pt.conversionScore,
            point: pt,
          }
        : null
    )
    .filter((item): item is NonNullable<typeof item> => item !== null);

  const conversionPolyline = conversionCoords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  const latest = history[history.length - 1];
  const first = history[0];
  const tasteDelta = latest.tasteScore - first.tasteScore;
  const latestConversion = conversionCoords.length > 0
    ? conversionCoords[conversionCoords.length - 1].score
    : undefined;

  const gridTicks = [0, 50, 100] as const;

  return (
    <div className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-primary)]">
            <span className="h-2 w-2 rounded-full bg-[var(--cobalt-bright)]" />
            Taste Score
            <span className="font-mono text-[var(--cobalt-ice)]">{latest.tasteScore}</span>
          </span>
          {latestConversion !== undefined && (
            <span className="inline-flex items-center gap-1.5 font-medium text-[var(--ink-primary)]">
              <span className="h-2 w-2 rounded-full bg-[var(--emerald)]" />
              Conversion
              <span className="font-mono text-[var(--emerald)]">{latestConversion}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-pill)] px-2 py-0.5 font-mono text-[var(--ink-secondary)]">
            {history.length} {history.length === 1 ? 'run' : 'runs'}
          </span>
          {history.length > 1 && (
            <span
              className={`rounded-full border px-2 py-0.5 font-mono ${
                tasteDelta >= 0
                  ? 'border-[var(--emerald-border)] bg-[var(--emerald-bg)] text-[var(--emerald)]'
                  : 'border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] text-[var(--vermilion)]'
              }`}
            >
              {tasteDelta >= 0 ? `+${tasteDelta}` : tasteDelta} pts
            </span>
          )}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[136px] w-full overflow-visible"
        role="img"
        aria-label={`Taste and conversion score history across ${history.length} runs. Latest taste score ${latest.tasteScore}.`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cobalt-bright)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--cobalt-bright)" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridTicks.map((tick) => {
          const y = getY(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="var(--border-subtle)"
                strokeDasharray={tick === 50 ? '3 3' : undefined}
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-[var(--ink-muted)] font-mono text-[9px]"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

        {conversionCoords.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--emerald)"
            strokeWidth="1.75"
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={conversionPolyline}
          />
        )}

        {tasteCoords.length > 1 && (
          <polyline
            fill="none"
            stroke="var(--cobalt-bright)"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={tastePolyline}
          />
        )}

        {conversionCoords.map((c, idx) => (
          <circle
            key={`conv-${c.point.id}-${idx}`}
            cx={c.x}
            cy={c.y}
            r={3}
            fill="var(--bg-card-elevated)"
            stroke="var(--emerald)"
            strokeWidth="1.75"
          >
            <title>
              {`${formatShortTimestamp(c.point.timestamp, idx)} — Conversion: ${c.score}/100`}
            </title>
          </circle>
        ))}

        {tasteCoords.map((c, idx) => {
          const isLatest = idx === tasteCoords.length - 1;
          return (
            <g key={`taste-${c.point.id}-${idx}`}>
              {isLatest && (
                <circle
                  cx={c.x}
                  cy={c.y}
                  r={7}
                  fill="var(--cobalt-bright)"
                  fillOpacity="0.2"
                />
              )}
              <circle
                cx={c.x}
                cy={c.y}
                r={isLatest ? 4 : 3}
                fill={isLatest ? 'var(--cobalt-ice)' : 'var(--bg-card-elevated)'}
                stroke="var(--cobalt-bright)"
                strokeWidth="2"
              >
                <title>
                  {`${formatShortTimestamp(c.point.timestamp, idx)} — Taste: ${c.point.tasteScore}/100${
                    c.point.conversionScore !== undefined
                      ? ` · Conversion: ${c.point.conversionScore}/100`
                      : ''
                  }`}
                </title>
              </circle>
            </g>
          );
        })}

        {tasteCoords.length > 0 && (
          <>
            <text
              x={tasteCoords[0].x}
              y={height - 5}
              textAnchor={tasteCoords.length === 1 ? 'middle' : 'start'}
              className="fill-[var(--ink-muted)] font-mono text-[9px]"
            >
              {formatShortTimestamp(tasteCoords[0].point.timestamp, 0)}
            </text>
            {tasteCoords.length > 1 && (
              <text
                x={tasteCoords[tasteCoords.length - 1].x}
                y={height - 5}
                textAnchor="end"
                className="fill-[var(--ink-muted)] font-mono text-[9px]"
              >
                {formatShortTimestamp(
                  tasteCoords[tasteCoords.length - 1].point.timestamp,
                  tasteCoords.length - 1
                )}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  );
}

export function BrandMemoryModal({
  open,
  onClose,
  workspaceId,
  workspaceName,
  onNotify,
}: BrandMemoryModalProps) {
  const [skills, setSkills] = useState<InstalledDesignSkill[]>([]);
  const [profile, setProfile] = useState<BrandMemoryProfile | null>(null);
  const [form, setForm] = useState<BrandFormState>({
    brandName: workspaceName || workspaceId,
    polarity: 'dark',
    displayFont: DEFAULT_TYPOGRAPHY.displayFont,
    bodyFont: DEFAULT_TYPOGRAPHY.bodyFont,
    monoFont: DEFAULT_TYPOGRAPHY.monoFont,
    bannedTropesText: DEFAULT_BANNED_TROPES.join(', '),
    activeSkills: [],
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const brandNameId = useId();
  const displayFontId = useId();
  const bodyFontId = useId();
  const monoFontId = useId();
  const bannedTropesId = useId();

  const loadData = useCallback(
    async (signal?: AbortSignal) => {
      if (!workspaceId) return;
      setLoading(true);
      setError(null);
      setSaveSuccess(null);

      try {
        const [skillsRes, memoryRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/skills`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal,
          }),
          fetch(
            `${BACKEND_URL}/api/brand-memory/${encodeURIComponent(workspaceId)}`,
            {
              method: 'GET',
              headers: { Accept: 'application/json' },
              signal,
            }
          ),
        ]);

        const errors: string[] = [];
        let loadedSkills: InstalledDesignSkill[] = [];
        let loadedProfile: BrandMemoryProfile = normalizeProfileResponse(
          null,
          workspaceId,
          workspaceName
        );

        if (skillsRes.ok) {
          const skillsJson: unknown = await skillsRes.json();
          loadedSkills = normalizeSkillsResponse(skillsJson);
        } else {
          errors.push(`Skills registry unavailable (${skillsRes.status})`);
        }

        if (memoryRes.ok) {
          const memoryJson: unknown = await memoryRes.json();
          loadedProfile = normalizeProfileResponse(
            memoryJson,
            workspaceId,
            workspaceName
          );
        } else if (memoryRes.status !== 404) {
          errors.push(`Brand memory unavailable (${memoryRes.status})`);
        }

        if (signal?.aborted) return;

        const hydratedActiveSkills =
          loadedProfile.activeSkills.length > 0
            ? loadedProfile.activeSkills
            : loadedSkills.map((s) => s.id);

        setSkills(loadedSkills);
        setProfile({
          ...loadedProfile,
          activeSkills: hydratedActiveSkills,
        });
        setForm({
          brandName: loadedProfile.brandName,
          polarity: loadedProfile.polarity,
          displayFont: loadedProfile.lockedTypography.displayFont,
          bodyFont: loadedProfile.lockedTypography.bodyFont,
          monoFont: loadedProfile.lockedTypography.monoFont,
          bannedTropesText: loadedProfile.bannedSlopTropes.join(', '),
          activeSkills: hydratedActiveSkills,
        });

        if (errors.length > 0) {
          setError(errors.join(' · '));
        }
      } catch (err: unknown) {
        if (signal?.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load Brand Memory & Design Skills.';
        setError(message);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [workspaceId, workspaceName]
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [open, loadData]);

  const parsedBannedTropes = useMemo(
    () => parseTropesInput(form.bannedTropesText),
    [form.bannedTropesText]
  );

  const activeSkillSet = useMemo(
    () => new Set(form.activeSkills),
    [form.activeSkills]
  );

  const toggleSkill = useCallback((skillId: string) => {
    setSaveSuccess(null);
    setForm((prev) => {
      const exists = prev.activeSkills.includes(skillId);
      const next = exists
        ? prev.activeSkills.filter((id) => id !== skillId)
        : [...prev.activeSkills, skillId];
      return { ...prev, activeSkills: next };
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!workspaceId || saving) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(null);

    const lockedTypography: LockedTypography = {
      displayFont: form.displayFont.trim() || DEFAULT_TYPOGRAPHY.displayFont,
      bodyFont: form.bodyFont.trim() || DEFAULT_TYPOGRAPHY.bodyFont,
      monoFont: form.monoFont.trim() || DEFAULT_TYPOGRAPHY.monoFont,
    };

    const payload = {
      workspaceId,
      brandName: form.brandName.trim() || workspaceName || workspaceId,
      polarity: form.polarity,
      lockedTypography,
      typography: lockedTypography,
      bannedSlopTropes: parsedBannedTropes,
      activeSkills: form.activeSkills,
    };

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/brand-memory/${encodeURIComponent(workspaceId)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        let message = `Failed to save Brand DNA Profile (${res.status})`;
        try {
          const errJson: unknown = await res.json();
          if (isRecord(errJson)) {
            const errText = readString(errJson.error || errJson.message).trim();
            if (errText) message = errText;
          }
        } catch {
          // ignore non-JSON error body
        }
        throw new Error(message);
      }

      const savedJson: unknown = await res.json().catch(() => null);
      const savedProfile = normalizeProfileResponse(
        savedJson ?? payload,
        workspaceId,
        workspaceName
      );

      setProfile((prev) => ({
        ...savedProfile,
        history: savedProfile.history.length > 0 ? savedProfile.history : prev?.history ?? [],
        updatedAt: savedProfile.updatedAt ?? new Date().toISOString(),
      }));

      const confirmation = `Saved Brand DNA Profile for ${payload.brandName}`;
      setSaveSuccess(confirmation);
      onNotify?.(confirmation);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Unable to save Brand DNA Profile.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }, [
    form.activeSkills,
    form.bodyFont,
    form.brandName,
    form.displayFont,
    form.monoFont,
    form.polarity,
    onNotify,
    parsedBannedTropes,
    saving,
    workspaceId,
    workspaceName,
  ]);

  const mountedCount = skills.filter((s) => activeSkillSet.has(s.id)).length;
  const formattedUpdatedAt = formatUpdatedAt(profile?.updatedAt);

  return (
    <NativeDialog
      open={open}
      onClose={onClose}
      widthClass="w-[min(95vw,920px)]"
      title="Brand Memory & Active Design Skills"
      subtitle="Lock persistent brand DNA tokens, toggle mounted SKILL.md craft standards (AntiSlop v2 + Google M3E Baseline 2026), and track Taste history."
    >
      <div className="space-y-6">
        {/* Top Workspace Context Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cobalt-border)] bg-[var(--cobalt-tint)] px-2.5 py-1 text-[11px] font-medium text-[var(--cobalt-ice)]">
              <Fingerprint className="h-3.5 w-3.5" />
              Workspace: <span className="font-mono">{workspaceId}</span>
            </span>
            {formattedUpdatedAt && (
              <span className="text-[11px] text-[var(--ink-muted)]">
                Last locked {formattedUpdatedAt}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || saving}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-pill)] bg-[var(--bg-pill)] px-3 py-1.5 text-[12px] font-medium text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-pill-hover)] hover:text-[var(--ink-primary)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>

        {/* Status Banners */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-[var(--vermilion-border)] bg-[var(--vermilion-bg)] px-4 py-3 text-[12.5px] text-[var(--vermilion)]"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {saveSuccess && (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-xl border border-[var(--emerald-border)] bg-[var(--emerald-bg)] px-4 py-3 text-[12.5px] text-[var(--emerald)]"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{saveSuccess}</span>
          </div>
        )}

        {loading && skills.length === 0 && !profile ? (
          <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--cobalt-ice)]" />
            <p className="text-[12.5px] text-[var(--ink-secondary)]">
              Loading mounted SKILL.md craft specs &amp; workspace Brand DNA...
            </p>
          </div>
        ) : (
          <>
            {/* Section 1: Mounted Design Skills Switcher */}
            <section aria-label="Mounted Design Skills">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-[var(--cobalt-ice)]" />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
                    Mounted Design Skills
                  </h3>
                </div>
                <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-pill)] px-2.5 py-0.5 font-mono text-[11px] text-[var(--ink-secondary)]">
                  {mountedCount} / {skills.length} active
                </span>
              </div>

              {skills.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[var(--border-card)] bg-[var(--bg-card-elevated)]/60 px-4 py-5 text-center text-[12.5px] text-[var(--ink-secondary)]">
                  No installed <code className="font-mono text-[var(--ink-primary)]">SKILL.md</code> craft packs detected on the backend.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {skills.map((skill) => {
                    const isActive = activeSkillSet.has(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        onClick={() => toggleSkill(skill.id)}
                        className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition-all ${
                          isActive
                            ? 'border-[var(--cobalt-border-strong)] bg-[var(--cobalt-tint)] shadow-[0_0_0_1px_rgba(66,133,244,0.16)]'
                            : 'border-[var(--border-card)] bg-[var(--bg-card-elevated)] hover:border-[var(--border-strong)]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[13.5px] font-semibold text-[var(--ink-primary)]">
                                {skill.name}
                              </span>
                              <span className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-pill)] px-2 py-0.5 font-mono text-[10px] text-[var(--ink-secondary)]">
                                v{skill.version}
                              </span>
                            </div>
                            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-[var(--ink-secondary)]">
                              {skill.description}
                            </p>
                          </div>

                          <span
                            aria-hidden="true"
                            className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                              isActive
                                ? 'bg-[var(--cobalt-core)] justify-end'
                                : 'bg-[var(--bg-subtle-hover)] border border-[var(--border-strong)] justify-start'
                            }`}
                          >
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-sm">
                              {isActive && <Check className="h-2.5 w-2.5 text-[var(--cobalt-deep)]" />}
                            </span>
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2.5 text-[11px]">
                          <span className="inline-flex items-center gap-1.5 font-mono text-[var(--ink-muted)]">
                            <BookOpen className="h-3 w-3" />
                            {skill.lineCount > 0 ? `${skill.lineCount} lines` : 'SKILL.md'}
                          </span>
                          <span
                            className={`font-medium ${
                              isActive ? 'text-[var(--cobalt-ice)]' : 'text-[var(--ink-muted)]'
                            }`}
                          >
                            {isActive ? 'Mounted in prompt' : 'Disabled'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 2: Persistent Brand DNA Lock */}
            <section
              aria-label="Persistent Brand DNA Lock"
              className="rounded-xl border border-[var(--border-card)] bg-[var(--bg-card-elevated)] p-5"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-[var(--cobalt-ice)]" />
                  <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
                    Persistent Brand DNA Lock
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--ink-muted)]">
                  <Sparkles className="h-3 w-3 text-[var(--cobalt-ice)]" />
                  Injected into every AntiSlop &amp; Circle-Tweak pass
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                {/* Brand Name */}
                <div className="md:col-span-7">
                  <label
                    htmlFor={brandNameId}
                    className="mb-1.5 block text-[11.5px] font-medium text-[var(--ink-secondary)]"
                  >
                    Brand Name
                  </label>
                  <input
                    id={brandNameId}
                    type="text"
                    value={form.brandName}
                    onChange={(e) => {
                      setSaveSuccess(null);
                      setForm((prev) => ({ ...prev, brandName: e.target.value }));
                    }}
                    placeholder="e.g. Meridian Labs"
                    className="w-full rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] px-3 py-2 text-[13px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--border-pill-focus)] focus:outline-none"
                  />
                </div>

                {/* Polarity */}
                <div className="md:col-span-5">
                  <span className="mb-1.5 block text-[11.5px] font-medium text-[var(--ink-secondary)]">
                    Surface Polarity
                  </span>
                  <div
                    role="radiogroup"
                    aria-label="Brand polarity"
                    className="grid grid-cols-2 gap-1.5 rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] p-1"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.polarity === 'dark'}
                      onClick={() => {
                        setSaveSuccess(null);
                        setForm((prev) => ({ ...prev, polarity: 'dark' }));
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        form.polarity === 'dark'
                          ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]'
                          : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] border border-transparent'
                      }`}
                    >
                      <Moon className="h-3.5 w-3.5" />
                      Dark
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.polarity === 'light'}
                      onClick={() => {
                        setSaveSuccess(null);
                        setForm((prev) => ({ ...prev, polarity: 'light' }));
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors ${
                        form.polarity === 'light'
                          ? 'bg-[var(--cobalt-tint-strong)] text-[var(--cobalt-ice)] border border-[var(--cobalt-border)]'
                          : 'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] border border-transparent'
                      }`}
                    >
                      <Sun className="h-3.5 w-3.5" />
                      Light
                    </button>
                  </div>
                </div>

                {/* Locked Typography */}
                <div className="md:col-span-12">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ink-secondary)]">
                    <Type className="h-3.5 w-3.5 text-[var(--ink-muted)]" />
                    Locked Typography Stack
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label
                        htmlFor={displayFontId}
                        className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-[var(--ink-muted)]"
                      >
                        Display Font
                      </label>
                      <input
                        id={displayFontId}
                        type="text"
                        value={form.displayFont}
                        onChange={(e) => {
                          setSaveSuccess(null);
                          setForm((prev) => ({ ...prev, displayFont: e.target.value }));
                        }}
                        placeholder="Instrument Serif"
                        className="w-full rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] px-3 py-2 text-[12.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--border-pill-focus)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={bodyFontId}
                        className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-[var(--ink-muted)]"
                      >
                        Body Font
                      </label>
                      <input
                        id={bodyFontId}
                        type="text"
                        value={form.bodyFont}
                        onChange={(e) => {
                          setSaveSuccess(null);
                          setForm((prev) => ({ ...prev, bodyFont: e.target.value }));
                        }}
                        placeholder="Plus Jakarta Sans"
                        className="w-full rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] px-3 py-2 text-[12.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--border-pill-focus)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={monoFontId}
                        className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-[var(--ink-muted)]"
                      >
                        Mono Font
                      </label>
                      <input
                        id={monoFontId}
                        type="text"
                        value={form.monoFont}
                        onChange={(e) => {
                          setSaveSuccess(null);
                          setForm((prev) => ({ ...prev, monoFont: e.target.value }));
                        }}
                        placeholder="JetBrains Mono"
                        className="w-full rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] px-3 py-2 font-mono text-[12px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--border-pill-focus)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Banned Slop Tropes */}
                <div className="md:col-span-12">
                  <label
                    htmlFor={bannedTropesId}
                    className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--ink-secondary)]"
                  >
                    <ShieldAlert className="h-3.5 w-3.5 text-[var(--amber)]" />
                    Banned Slop Tropes
                    <span className="font-normal text-[var(--ink-muted)]">
                      (comma-separated)
                    </span>
                  </label>
                  <textarea
                    id={bannedTropesId}
                    rows={2}
                    value={form.bannedTropesText}
                    onChange={(e) => {
                      setSaveSuccess(null);
                      setForm((prev) => ({ ...prev, bannedTropesText: e.target.value }));
                    }}
                    placeholder="generic purple gradients, floating 3D blobs, fake testimonials"
                    className="w-full resize-none rounded-lg border border-[var(--border-composer)] bg-[var(--bg-composer)] px-3 py-2 text-[12.5px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:border-[var(--border-pill-focus)] focus:outline-none"
                  />
                  {parsedBannedTropes.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {parsedBannedTropes.map((trope) => (
                        <span
                          key={trope}
                          className="inline-flex items-center rounded-full border border-[var(--amber-border)] bg-[var(--amber-bg)] px-2.5 py-0.5 text-[11px] text-[var(--amber)]"
                        >
                          {trope}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Save Action Row */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
                <p className="text-[11.5px] text-[var(--ink-muted)]">
                  Saves brand tokens, banned tropes, and {form.activeSkills.length} active{' '}
                  {form.activeSkills.length === 1 ? 'skill' : 'skills'} to workspace memory.
                </p>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || loading}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--btn-primary-bg)] px-4 py-2 text-[12.5px] font-semibold text-[var(--btn-primary-ink)] transition-colors hover:bg-[var(--btn-primary-hover)] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {saving ? 'Saving...' : 'Save Brand DNA Profile'}
                </button>
              </div>
            </section>

            {/* Section 3: Taste & Conversion History Sparkline */}
            <section aria-label="Taste and Conversion History">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[var(--cobalt-ice)]" />
                <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
                  Taste &amp; Conversion History
                </h3>
              </div>
              <TasteConversionSparkline history={profile?.history ?? []} />
            </section>
          </>
        )}
      </div>
    </NativeDialog>
  );
}
