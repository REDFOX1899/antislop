import fs from 'node:fs/promises';
import path from 'node:path';
import { REPO_ROOT } from '../config/env.js';

export interface DesignSkillSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  path: string;
  charCount: number;
  lineCount: number;
}

export interface DesignSkillBundle extends DesignSkillSummary {
  content: string;
}

interface ParsedFrontmatter {
  name?: string;
  version?: string;
  description?: string;
  body: string;
}

const SKILLS_ROOT = path.join(REPO_ROOT, 'skills');
const SKILL_FILENAME = 'SKILL.md';
const SAFE_SKILL_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function stripMatchingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseSkillMarkdown(raw: string): ParsedFrontmatter {
  const normalized = raw.replace(/\r\n/g, '\n');
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!fmMatch) {
    return { body: normalized.trim() };
  }

  const frontmatterBlock = fmMatch[1];
  const body = normalized.slice(fmMatch[0].length).trim();
  const fields: Record<string, string> = {};
  const lines = frontmatterBlock.split('\n');

  let activeKey: string | null = null;
  let blockLines: string[] = [];

  const flushBlock = (): void => {
    if (activeKey !== null) {
      fields[activeKey] = blockLines.join(' ').replace(/\s+/g, ' ').trim();
      activeKey = null;
      blockLines = [];
    }
  };

  for (const line of lines) {
    if (activeKey !== null) {
      if (/^[ \t]+/.test(line) || line.trim() === '') {
        if (line.trim() !== '') {
          blockLines.push(line.trim());
        }
        continue;
      }
      flushBlock();
    }

    const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].toLowerCase();
    const rawValue = kvMatch[2].trim();

    if (rawValue === '|' || rawValue === '>' || rawValue === '|-' || rawValue === '>-') {
      activeKey = key;
      blockLines = [];
    } else {
      fields[key] = stripMatchingQuotes(rawValue);
    }
  }

  flushBlock();

  return {
    name: fields.name,
    version: fields.version,
    description: fields.description,
    body,
  };
}

function buildSkillBundle(id: string, absoluteFilePath: string, raw: string): DesignSkillBundle {
  const parsed = parseSkillMarkdown(raw);
  const relativePath = path.relative(REPO_ROOT, absoluteFilePath).split(path.sep).join('/');
  const lineCount = raw.length === 0 ? 0 : raw.replace(/\r\n/g, '\n').split('\n').length;

  return {
    id,
    name: parsed.name || id,
    version: parsed.version || '1.0.0',
    description: parsed.description || '',
    path: relativePath,
    charCount: raw.length,
    lineCount,
    content: parsed.body || raw.trim(),
  };
}

function toSummary(bundle: DesignSkillBundle): DesignSkillSummary {
  const { content: _content, ...summary } = bundle;
  return summary;
}

function resolveSafeSkillFile(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed || !SAFE_SKILL_ID_PATTERN.test(trimmed)) {
    return null;
  }

  const candidate = path.resolve(SKILLS_ROOT, trimmed, SKILL_FILENAME);
  const rootWithSep = SKILLS_ROOT.endsWith(path.sep) ? SKILLS_ROOT : `${SKILLS_ROOT}${path.sep}`;
  if (!candidate.startsWith(rootWithSep)) {
    return null;
  }
  return candidate;
}

function truncateCleanly(text: string, maxLength: number): string {
  if (maxLength <= 0) return '';
  if (text.length <= maxLength) return text;

  const marker = '\n... [truncated to fit skill prompt budget]';
  if (maxLength <= marker.length + 16) {
    return text.slice(0, maxLength).trimEnd();
  }

  const sliceLimit = maxLength - marker.length;
  const candidate = text.slice(0, sliceLimit);
  const lastBreak = candidate.lastIndexOf('\n');
  const cut = lastBreak >= Math.floor(sliceLimit * 0.6) ? candidate.slice(0, lastBreak) : candidate;
  return `${cut.trimEnd()}${marker}`;
}

export async function listInstalledSkills(): Promise<DesignSkillSummary[]> {
  let entries;
  try {
    entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const summaries: DesignSkillSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const skillFile = resolveSafeSkillFile(id);
    if (!skillFile) continue;

    try {
      const raw = await fs.readFile(skillFile, 'utf8');
      summaries.push(toSummary(buildSkillBundle(id, skillFile, raw)));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'EISDIR') {
        continue;
      }
      throw error;
    }
  }

  summaries.sort((a, b) => a.id.localeCompare(b.id));
  return summaries;
}

export async function loadSkillById(id: string): Promise<DesignSkillBundle | null> {
  const skillFile = resolveSafeSkillFile(id);
  if (!skillFile) return null;

  try {
    const raw = await fs.readFile(skillFile, 'utf8');
    return buildSkillBundle(id.trim(), skillFile, raw);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') {
      return null;
    }
    throw error;
  }
}

export async function composeActiveSkillsPrompt(
  skillIds: string[],
  maxChars = 14000,
): Promise<{ combinedPrompt: string; loadedSkills: DesignSkillSummary[] }> {
  const budget = Math.max(0, Math.floor(maxChars));
  if (budget === 0 || skillIds.length === 0) {
    return { combinedPrompt: '', loadedSkills: [] };
  }

  const seen = new Set<string>();
  const orderedUniqueIds: string[] = [];
  for (const rawId of skillIds) {
    const id = rawId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    orderedUniqueIds.push(id);
  }

  const loadedBundles: DesignSkillBundle[] = [];
  for (const id of orderedUniqueIds) {
    const bundle = await loadSkillById(id);
    if (bundle) {
      loadedBundles.push(bundle);
    }
  }

  if (loadedBundles.length === 0) {
    return { combinedPrompt: '', loadedSkills: [] };
  }

  const separator = '\n\n---\n\n';
  const sections = loadedBundles.map((bundle) => {
    const headerLines = [`## ACTIVE DESIGN SKILL: ${bundle.name} (v${bundle.version})`];
    if (bundle.description) {
      headerLines.push(`> ${bundle.description}`);
    }
    const header = `${headerLines.join('\n')}\n\n`;
    return { bundle, header, full: `${header}${bundle.content}` };
  });

  const fullCombined = sections.map((s) => s.full).join(separator);
  if (fullCombined.length <= budget) {
    return {
      combinedPrompt: fullCombined,
      loadedSkills: loadedBundles.map(toSummary),
    };
  }

  // Fair length budgeting: allocate remaining space equally across remaining sections,
  // preserving full text for shorter skills and cleanly truncating longer ones.
  const totalSeparatorChars = separator.length * (sections.length - 1);
  const availableForSections = Math.max(0, budget - totalSeparatorChars);

  const allocations = new Array<number>(sections.length).fill(0);
  let remainingBudget = availableForSections;
  let unresolvedIndices = sections.map((_, index) => index);

  while (unresolvedIndices.length > 0 && remainingBudget > 0) {
    const share = Math.floor(remainingBudget / unresolvedIndices.length);
    if (share <= 0) break;

    const nextUnresolved: number[] = [];
    let progress = false;

    for (const idx of unresolvedIndices) {
      const needed = sections[idx].full.length;
      if (needed <= share) {
        allocations[idx] = needed;
        remainingBudget -= needed;
        progress = true;
      } else {
        nextUnresolved.push(idx);
      }
    }

    if (!progress) {
      for (let i = 0; i < nextUnresolved.length; i++) {
        const idx = nextUnresolved[i];
        const extra = i < remainingBudget % nextUnresolved.length ? 1 : 0;
        allocations[idx] = share + extra;
      }
      remainingBudget = 0;
      break;
    }

    unresolvedIndices = nextUnresolved;
  }

  const fittedParts: string[] = [];
  const includedSummaries: DesignSkillSummary[] = [];

  for (let i = 0; i < sections.length; i++) {
    const allowed = allocations[i];
    if (allowed <= 0) continue;

    const { bundle, header, full } = sections[i];
    if (full.length <= allowed) {
      fittedParts.push(full);
    } else if (allowed > header.length + 24) {
      const bodyAllowed = allowed - header.length;
      fittedParts.push(`${header}${truncateCleanly(bundle.content, bodyAllowed)}`);
    } else {
      fittedParts.push(truncateCleanly(full, allowed));
    }
    includedSummaries.push(toSummary(bundle));
  }

  const combinedPrompt = fittedParts.join(separator).slice(0, budget);
  return {
    combinedPrompt,
    loadedSkills: includedSummaries,
  };
}
