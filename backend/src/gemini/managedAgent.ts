import crypto from 'node:crypto';
import type { GoogleGenAI, Interactions } from '@google/genai';
import type { ManagedAgentEvent, ManagedAgentShipRequest } from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import {
  ANTISLOP_DESIGN_CRAFT_DISTILLED,
  getDesignCraftSkillHash,
  loadFullDesignCraftSkill,
} from './designSkill.js';

const AGENT_ID_PREFIX = 'antislop-surgeon';
const AGENT_SCHEMA_VERSION = 'v2';

const MANAGED_AGENT_PLAYBOOK_MD = `# AntiSlop Repo Surgeon Playbook

You operate inside Google's sandboxed remote Linux environment with:
- Target repository mounted at \`/workspace/repo\`
- Full UI Design Craft specification mounted at \`.agents/skills/antislop-design-craft/SKILL.md\`

## Execution Rules
1. Never run \`git push\`, never modify git remotes, and never exfiltrate credentials.
2. Inspect \`/workspace/repo\` first (\`ls\`, \`package.json\`, entry HTML/CSS/TSX/JS files) to detect the exact repository stack:
   - **React / Vite / Next.js / TypeScript repo** (root or frontend workspace like \`target-repo/\`, \`studio/\`, \`frontend/\`, \`web/\`, \`app/\`): edit its existing UI entrypoints cleanly without adding uninstalled npm packages.
   - **Vanilla HTML / CSS / JS static repo** (no bundler build script): edit \`index.html\`, \`styles.css\`, \`app.js\` (or existing static files) directly in vanilla syntax — NEVER introduce React/TSX files into a vanilla static repo.
3. Read \`.agents/skills/antislop-design-craft/SKILL.md\` and enforce every rule: Swiss grid discipline, fluid \`clamp()\` type scales, WCAG AA >= 4.5:1 text contrast, 4/8/16/24/48/96px spacing rhythm, native HTML primitives (\`<dialog>\`, \`<details>\`), compositor-only motion with \`prefers-reduced-motion\`, Canvas/WebGL/Shader preservation, and the Anti-Slop Ban List.
4. Run deterministic verification inside the target project directory:
   - **JS/TS bundler project**: install dependencies only if \`node_modules\` is missing, run \`npx tsc --noEmit\` (when \`tsconfig.json\` exists) and \`npm run build\`. Fix any errors and re-run until exit code is \`0\`.
   - **Vanilla static project**: run \`node --check <file.js>\` on every modified \`.js\` file and verify all local \`<script src>\` / \`<link href>\` paths exist.
5. Run \`git status --short\` and \`git diff --stat\` inside \`/workspace/repo\`, then output the required structured verification block.
`;

const MANAGED_AGENT_SYSTEM_INSTRUCTION = `You are the AntiSlop Repo Surgeon — an autonomous frontend design-engineering agent executing inside Google's sandboxed remote Linux environment with the target repository mounted at /workspace/repo.

Your complete open-source craft rubric is mounted at .agents/skills/antislop-design-craft/SKILL.md (and workspace instructions at .agents/AGENTS.md). Consult it before editing files.

${ANTISLOP_DESIGN_CRAFT_DISTILLED}

DISCIPLINED WORKFLOW:
1. Inspect /workspace/repo structure (root files, package.json, or primary frontend app directory such as target-repo/, frontend/, web/, app/, or vanilla index.html/styles.css/app.js).
2. Faithfully apply the verified AntiSlop DesignManifest tokens (palette, Google Fonts CSS2 URL, geometry, motion, layout directives, and strict anti-slop ban list) directly into the repo's styling and root UI files without inventing uninstalled npm packages or breaking any existing <canvas>/WebGL/shader runtime.
3. Never run \`git push\`. Keep all changes strictly inside the remote sandbox for diff inspection and deterministic build verification.
4. Run deterministic verification inside the edited project directory:
   - For TS/JS bundler repos (Vite/Next/React): install deps if node_modules is missing, run \`npx tsc --noEmit\` (when tsconfig.json exists) and \`npm run build\`. If it fails, fix every error immediately and re-run until exit code is 0.
   - For vanilla HTML/CSS/JS repos: run \`node --check <file.js>\` on every modified JS file and verify local asset/stylesheet/script links resolve cleanly.
5. Run \`git diff --stat\` in /workspace/repo and end your response with this EXACT structured report block:
   BUILD_STATUS: PASSED (or BUILD_STATUS: FAILED)
   VERIFICATION_COMMAND: <exact shell command executed and exit status>
   FILES_MODIFIED:
   - <relative file path>
   GIT_DIFF_SUMMARY: <concise 2-4 sentence summary of visual upgrades, git diff --stat, and build verification output>`;

function normalizeGitHubUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed.replace(/\.git$/i, '');
  }
  // Support `owner/repo` shorthand
  return `https://github.com/${trimmed.replace(/^\/+/, '').replace(/\.git$/i, '')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Produces a deterministic, spec-safe agent ID scoped to the exact repository URL,
 * optional branch, and Design Craft SKILL.md digest so switching repositories NEVER
 * mounts a stale or cross-repo `base_environment`.
 */
function buildRepoScopedAgentId(repoUrl: string, branch?: string, skillHash?: string): string {
  let slugRaw = 'repo';
  try {
    const parsed = new URL(repoUrl);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      slugRaw = `${parts[0]}-${parts[1]}`;
    } else if (parts.length === 1) {
      slugRaw = parts[0];
    }
  } catch {
    slugRaw = repoUrl;
  }

  const slug =
    slugRaw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 22)
      .replace(/-+$/, '') || 'repo';

  const digest = crypto
    .createHash('sha256')
    .update(`${repoUrl.toLowerCase()}#${(branch || 'default').toLowerCase()}#${skillHash || 'v1'}#${AGENT_SCHEMA_VERSION}`)
    .digest('hex')
    .slice(0, 8);

  return `${AGENT_ID_PREFIX}-${slug}-${digest}`;
}

interface MountedSourcesSummary {
  repository?: string;
  inlineTargets: string[];
}

function inspectBaseEnvironmentSources(baseEnvironment: unknown): MountedSourcesSummary {
  const summary: MountedSourcesSummary = { inlineTargets: [] };
  if (!baseEnvironment || typeof baseEnvironment !== 'object') return summary;
  const envObj = baseEnvironment as {
    sources?: Array<{ type?: string; source?: string; target?: string }>;
  };
  for (const src of envObj.sources ?? []) {
    if (src.type === 'repository' && src.source) {
      summary.repository = src.source;
    } else if (src.type === 'inline' && src.target) {
      summary.inlineTargets.push(src.target);
    }
  }
  return summary;
}

function stringifyStepResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) {
    return result
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item && typeof (item as { text?: unknown }).text === 'string') {
          return (item as { text: string }).text;
        }
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .join('\n');
  }
  if (result && typeof result === 'object') {
    try {
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  }
  return '';
}

function looksLikeBuildSuccess(output: string): boolean {
  const lower = output.toLowerCase();
  return (
    lower.includes('built in') ||
    lower.includes('compiled successfully') ||
    lower.includes('dist/index.html') ||
    lower.includes('build succeeded') ||
    lower.includes('tsc --noemit') && !lower.includes('error ts') ||
    lower.includes('node --check') && !lower.includes('syntaxerror')
  );
}

function looksLikeBuildFailure(output: string, isError?: boolean): boolean {
  if (isError) return true;
  const lower = output.toLowerCase();
  return (
    lower.includes('error ts') ||
    lower.includes('syntaxerror') ||
    lower.includes('build failed') ||
    lower.includes('npm error') ||
    lower.includes('exited with code 1') ||
    lower.includes('exited with status 1')
  );
}

interface ParsedVerificationReport {
  explicitBuildStatus?: boolean;
  verificationCommand?: string;
  filesModified: string[];
  diffSummary?: string;
}

function parseStructuredVerificationReport(report: string): ParsedVerificationReport {
  const parsed: ParsedVerificationReport = { filesModified: [] };
  if (!report.trim()) return parsed;

  const upper = report.toUpperCase();
  if (/BUILD_STATUS\s*:\s*PASSED/.test(upper)) {
    parsed.explicitBuildStatus = true;
  } else if (/BUILD_STATUS\s*:\s*FAILED/.test(upper)) {
    parsed.explicitBuildStatus = false;
  }

  const cmdMatch = report.match(/VERIFICATION_COMMAND\s*:\s*(.+)/i);
  if (cmdMatch?.[1]) {
    parsed.verificationCommand = cmdMatch[1].trim().slice(0, 240);
  }

  const filesSection = report.match(/FILES_MODIFIED\s*:([\s\S]*?)(?=GIT_DIFF_SUMMARY\s*:|$)/i);
  if (filesSection?.[1]) {
    const lines = filesSection[1]
      .split('\n')
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').replace(/^`|`$/g, '').trim())
      .filter((l) => l.length > 0 && !/^none$/i.test(l) && l.length < 160);
    parsed.filesModified = Array.from(new Set(lines)).slice(0, 30);
  }

  const diffMatch = report.match(/GIT_DIFF_SUMMARY\s*:\s*([\s\S]+)$/i);
  if (diffMatch?.[1]) {
    parsed.diffSummary = diffMatch[1].trim().slice(0, 1200);
  }

  return parsed;
}

interface RegisteredAgentInfo {
  agentId: string;
  reused: boolean;
  mountedInlineSkill: boolean;
  mountedSources: string[];
}

async function ensureCustomRepoSurgeonAgent(
  client: GoogleGenAI,
  repoUrl: string,
  branch: string | undefined,
  onEvent: (ev: ManagedAgentEvent) => void
): Promise<RegisteredAgentInfo> {
  const fullDesignCraftSkill = loadFullDesignCraftSkill();
  const skillHash = getDesignCraftSkillHash();
  const agentId = buildRepoScopedAgentId(repoUrl, branch, skillHash);

  const inlineSources: Interactions.Environment.Source[] = [
    {
      type: 'inline',
      target: '.agents/AGENTS.md',
      content: MANAGED_AGENT_PLAYBOOK_MD,
    },
    {
      type: 'inline',
      target: '.agents/skills/antislop-design-craft/SKILL.md',
      content: fullDesignCraftSkill,
    },
  ];

  const repoSource: Interactions.Environment.Source = {
    type: 'repository',
    source: repoUrl,
    target: '/workspace/repo',
  };

  // Check if this repo-scoped custom agent already exists with matching mount
  try {
    const existing = await client.agents.get(agentId);
    const inspected = inspectBaseEnvironmentSources(existing.base_environment);
    if (inspected.repository === repoUrl) {
      const hasInlineSkill = inspected.inlineTargets.some((t) => t.includes('SKILL.md'));
      const mountedSources = [
        `repository:${repoUrl} -> /workspace/repo`,
        ...inspected.inlineTargets.map((t) => `inline:${t}`),
      ];
      onEvent({
        type: 'agent_created',
        timestamp: nowIso(),
        message: `Reusing repo-scoped Managed Agent "${agentId}" (${ENV.GEMINI_MANAGED_AGENT_BASE}) mounted on ${repoUrl}`,
        detail: {
          agentId: existing.id || agentId,
          reused: true,
          repoUrl,
          mountedInlineSkill: hasInlineSkill,
          mountedSources,
        },
      });
      return {
        agentId: existing.id || agentId,
        reused: true,
        mountedInlineSkill: hasInlineSkill,
        mountedSources,
      };
    }

    // Safety guard: mount mismatch — delete stale registration before recreating
    try {
      await client.agents.delete(agentId);
    } catch {
      // Ignore delete race; create below handles conflict cleanly
    }
  } catch {
    // Agent does not exist yet — register fresh below
  }

  // Primary registration: repository mount + inline AGENTS.md + inline SKILL.md
  const createWithInlinePayload = {
    id: agentId,
    base_agent: ENV.GEMINI_MANAGED_AGENT_BASE,
    agent_config: {
      type: 'antigravity' as const,
      model: ENV.GEMINI_MODEL_PATCHER,
    },
    description: `AntiSlop Repo Surgeon (${repoUrl}) — autonomous UI craft transformation & deterministic sandbox build verification.`,
    system_instruction: MANAGED_AGENT_SYSTEM_INSTRUCTION,
    base_environment: {
      type: 'remote' as const,
      sources: [repoSource, ...inlineSources],
    },
  };

  try {
    const created = await client.agents.create(createWithInlinePayload);
    const resolvedId = created.id || agentId;
    const mountedSources = [
      `repository:${repoUrl} -> /workspace/repo`,
      'inline:.agents/AGENTS.md',
      'inline:.agents/skills/antislop-design-craft/SKILL.md',
    ];
    onEvent({
      type: 'agent_created',
      timestamp: nowIso(),
      message: `Registered Managed Agent "${resolvedId}" (${ENV.GEMINI_MANAGED_AGENT_BASE} / ${ENV.GEMINI_MODEL_PATCHER}) with repo + inline Design Craft SKILL.md`,
      detail: {
        agentId: resolvedId,
        reused: false,
        repoUrl,
        mountedInlineSkill: true,
        mountedSources,
      },
    });
    return {
      agentId: resolvedId,
      reused: false,
      mountedInlineSkill: true,
      mountedSources,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // Handle 409 ALREADY_EXISTS race safely ONLY if existing agent matches this exact repoUrl
    if (msg.includes('409') || msg.toLowerCase().includes('already exists')) {
      try {
        const existing = await client.agents.get(agentId);
        const inspected = inspectBaseEnvironmentSources(existing.base_environment);
        if (inspected.repository === repoUrl) {
          const hasInlineSkill = inspected.inlineTargets.some((t) => t.includes('SKILL.md'));
          const mountedSources = [
            `repository:${repoUrl} -> /workspace/repo`,
            ...inspected.inlineTargets.map((t) => `inline:${t}`),
          ];
          onEvent({
            type: 'agent_created',
            timestamp: nowIso(),
            message: `Connected to existing repo-scoped Managed Agent "${agentId}"`,
            detail: {
              agentId,
              reused: true,
              repoUrl,
              mountedInlineSkill: hasInlineSkill,
              mountedSources,
            },
          });
          return {
            agentId,
            reused: true,
            mountedInlineSkill: hasInlineSkill,
            mountedSources,
          };
        }
      } catch {
        // Fall through to fresh fallback registration
      }
    }

    // Fallback: if inline sources were rejected by server validation, register repo-only agent
    // and embed the full SKILL.md directly in system_instruction
    const fallbackAgentId = `${agentId.slice(0, 48)}-r${crypto.randomBytes(2).toString('hex')}`;
    const fallbackSystemInstruction = `${MANAGED_AGENT_SYSTEM_INSTRUCTION}\n\nFULL DESIGN CRAFT SKILL RUBRIC (write to /workspace/repo/.antislop/DESIGN_CRAFT_SKILL.md as your verification checklist if needed):\n\n${fullDesignCraftSkill}`;

    const createdFallback = await client.agents.create({
      id: fallbackAgentId,
      base_agent: ENV.GEMINI_MANAGED_AGENT_BASE,
      agent_config: {
        type: 'antigravity' as const,
        model: ENV.GEMINI_MODEL_PATCHER,
      },
      description: `AntiSlop Repo Surgeon (${repoUrl}) — autonomous remote visual transformation & build verification.`,
      system_instruction: fallbackSystemInstruction,
      base_environment: {
        type: 'remote' as const,
        sources: [repoSource],
      },
    });

    const resolvedFallbackId = createdFallback.id || fallbackAgentId;
    const mountedSources = [`repository:${repoUrl} -> /workspace/repo`];
    onEvent({
      type: 'agent_created',
      timestamp: nowIso(),
      message: `Registered Managed Agent "${resolvedFallbackId}" (${ENV.GEMINI_MANAGED_AGENT_BASE}) with repo mount + embedded Design Craft rubric`,
      detail: {
        agentId: resolvedFallbackId,
        reused: false,
        repoUrl,
        mountedInlineSkill: false,
        mountedSources,
      },
    });
    return {
      agentId: resolvedFallbackId,
      reused: false,
      mountedInlineSkill: false,
      mountedSources,
    };
  }
}

/**
 * Ships a verified AntiSlop `DesignManifest` to a remote GitHub repository inside a
 * Google-hosted Linux sandbox using Managed Agents (`antigravity-preview-09-2026` on `v1beta`),
 * mounting both the GitHub repository and the AntiSlop Design Craft SKILL.md, and streaming
 * real-time tool execution plus deterministic build/syntax verification events.
 */
export async function shipToRemoteRepoViaManagedAgent(
  params: ManagedAgentShipRequest,
  onEvent: (ev: ManagedAgentEvent) => void
): Promise<{
  environmentId?: string;
  interactionId?: string;
  summary: string;
  buildPassed: boolean;
}> {
  const repoUrl = normalizeGitHubUrl(params.repoUrl);
  const runBuildGate = params.runBuildHook !== false;
  const skillHash = getDesignCraftSkillHash();
  const expectedAgentId = buildRepoScopedAgentId(repoUrl, params.branch, skillHash);

  return traceSpan(
    'antislop.managedAgent.shipToRemoteRepo',
    'chain',
    {
      agentId: expectedAgentId,
      baseAgent: ENV.GEMINI_MANAGED_AGENT_BASE,
      agentModel: ENV.GEMINI_MODEL_PATCHER,
      repoUrl,
      branch: params.branch,
      vibeTitle: params.manifest.vibeTitle,
      tasteScore: params.scorecard.overallTasteScore,
      runBuildGate,
      skillHash,
    },
    async () => {
      // Pin a single v1beta client for both agent registration and streaming invocation
      // so the repo-scoped custom agent lives in the exact same API key project!
      return withV1BetaClient(async (client) => {
        const registered = await ensureCustomRepoSurgeonAgent(
          client,
          repoUrl,
          params.branch,
          onEvent
        );

        const skillDirective = registered.mountedInlineSkill
          ? `DESIGN CRAFT SKILL: Mounted in your sandbox at \`.agents/skills/antislop-design-craft/SKILL.md\` (with playbook at \`.agents/AGENTS.md\`). Consult it and enforce every contrast, typography, spacing, Modern Web Guidance, Canvas/Shader preservation, and Anti-Slop rule.`
          : `DESIGN CRAFT SKILL: Embedded in your system instructions. Save a copy to \`/workspace/repo/.antislop/DESIGN_CRAFT_SKILL.md\` if helpful as your verification checklist and enforce every rule strictly.`;

        const verificationStep = runBuildGate
          ? [
              `3. DETERMINISTIC VERIFICATION GATE (MANDATORY):`,
              `   - If the edited frontend project has a \`package.json\` with a \`build\` script (root or workspace subfolder such as \`target-repo/\`, \`studio/\`, \`frontend/\`, \`web/\`): install dependencies only if \`node_modules\` is missing, run \`npx tsc --noEmit\` (when \`tsconfig.json\` exists), and run \`npm run build\`. Fix any TypeScript/bundler errors and re-run until exit code is \`0\`.`,
              `   - If the repository is a vanilla HTML/CSS/JS static site without a bundler build script: run \`node --check <file.js>\` on every modified \`.js\` file and verify every local \`<script src>\` and \`<link href>\` resolves to an existing file.`,
            ].join('\n')
          : `3. Run \`git status --short\` and \`git diff --stat\` in /workspace/repo to verify clean modifications.`;

        const inputPrompt = [
          `TARGET REPOSITORY: ${repoUrl}${params.branch ? ` (branch: ${params.branch})` : ''} mounted at /workspace/repo.`,
          skillDirective,
          `VERIFIED ANTISLOP DESIGN MANIFEST (Decisions API Score: ${params.scorecard.overallTasteScore.toFixed(1)}/100):`,
          JSON.stringify(
            {
              vibeTitle: params.manifest.vibeTitle,
              editorialRationale: params.manifest.editorialRationale,
              conflictResolutionNotes: params.manifest.conflictResolutionNotes,
              tokens: params.manifest.tokens,
            },
            null,
            2
          ),
          `EXECUTION CHECKLIST:`,
          `1. Inspect /workspace/repo (list top-level files, detect whether it is a single Vite/Next/React app, a monorepo with a primary target frontend like target-repo/, or a vanilla HTML/CSS/JS site).${params.branch ? ` Checkout branch "${params.branch}" if it exists.` : ''}`,
          `2. Faithfully apply the DesignManifest palette, Google Fonts typography, geometry, fluid spacing, WCAG AA >= 4.5:1 contrast, and anti-slop upgrades into the primary frontend UI files without inventing uninstalled npm packages or breaking any existing <canvas>/WebGL/shader logic. NEVER run \`git push\`.`,
          verificationStep,
          `4. Run \`git diff --stat\` inside /workspace/repo and conclude with this EXACT structured report block:\nBUILD_STATUS: PASSED (or BUILD_STATUS: FAILED)\nVERIFICATION_COMMAND: <exact command executed and exit status>\nFILES_MODIFIED:\n- <path>\nGIT_DIFF_SUMMARY: <concise summary of visual upgrades, git diff --stat, and build output>`,
        ].join('\n\n');

        let environmentId: string | undefined;
        let interactionId: string | undefined;
        let sawBuildError = false;
        let sawBuildSuccess = false;
        let toolCallCount = 0;
        const outputChunks: string[] = [];

        try {
          const stream = await client.interactions.create({
            agent: registered.agentId,
            environment: 'remote',
            stream: true,
            input: inputPrompt,
          });

          for await (const event of stream) {
            if (event.event_type === 'interaction.created') {
              interactionId = event.interaction.id;
              const maybeEnvId = (event.interaction as Record<string, unknown>).environment_id;
              if (typeof maybeEnvId === 'string' && maybeEnvId.length > 0) {
                environmentId = maybeEnvId;
              }
              onEvent({
                type: 'sandbox_ready',
                timestamp: nowIso(),
                environmentId,
                interactionId,
                message: `Remote Linux sandbox provisioned for ${repoUrl}`,
                detail: {
                  agentId: registered.agentId,
                  status: event.interaction.status,
                  mountedSources: registered.mountedSources,
                },
              });
            } else if (event.event_type === 'interaction.status_update') {
              const status = (event as { status?: string }).status;
              if (status && status !== 'in_progress') {
                onEvent({
                  type: 'step_delta',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: `[Sandbox Status] ${status}`,
                });
              }
            } else if (event.event_type === 'step.start') {
              const step = event.step;
              if (step.type === 'function_call') {
                toolCallCount += 1;
                const argsPreview = stringifyStepResult(step.arguments).slice(0, 280);
                onEvent({
                  type: 'tool_call',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: `Sandbox tool invoked: ${step.name}`,
                  detail: {
                    stepIndex: event.index,
                    stepType: step.type,
                    toolName: step.name,
                    arguments: argsPreview,
                  },
                });
              } else if (step.type === 'code_execution_call') {
                toolCallCount += 1;
                const codePreview = (step.arguments?.code || '').slice(0, 280);
                onEvent({
                  type: 'tool_call',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: `Running ${step.arguments?.language || 'shell'} command in remote sandbox`,
                  detail: {
                    stepIndex: event.index,
                    stepType: step.type,
                    code: codePreview,
                  },
                });
              } else if (
                step.type === 'mcp_server_tool_call' ||
                step.type === 'google_search_call' ||
                step.type === 'url_context_call'
              ) {
                toolCallCount += 1;
                onEvent({
                  type: 'tool_call',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: `Managed agent invoked tool: ${step.type}`,
                  detail: { stepIndex: event.index, stepType: step.type },
                });
              } else if (step.type === 'function_result' || step.type === 'code_execution_result') {
                const resPreview = stringifyStepResult(step.result).slice(0, 600);
                const failed = looksLikeBuildFailure(resPreview, step.is_error);
                if (failed) {
                  sawBuildError = true;
                } else if (looksLikeBuildSuccess(resPreview)) {
                  sawBuildSuccess = true;
                  sawBuildError = false;
                }
                const toolName = step.type === 'function_result' ? step.name : 'code_execution';
                onEvent({
                  type: 'hook_verify',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: step.is_error
                    ? `Sandbox ${toolName || 'command'} reported an error (agent self-correcting)`
                    : `Sandbox ${toolName || 'step'} completed`,
                  detail: {
                    toolName,
                    isError: Boolean(step.is_error),
                    output: resPreview,
                  },
                });
              }
            } else if (event.event_type === 'step.delta') {
              const delta = event.delta;
              if (delta.type === 'text' && delta.text) {
                outputChunks.push(delta.text);
                onEvent({
                  type: 'step_delta',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: delta.text,
                });
              } else if (delta.type === 'thought_summary') {
                const content = delta.content;
                if (content && content.type === 'text' && content.text) {
                  onEvent({
                    type: 'step_delta',
                    timestamp: nowIso(),
                    environmentId,
                    interactionId,
                    message: `[Agent Reasoning] ${content.text}`,
                  });
                }
              } else if (delta.type === 'code_execution_call') {
                const codeSnippet = (delta.arguments?.code || '').slice(0, 280);
                onEvent({
                  type: 'tool_call',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: `Running ${delta.arguments?.language || 'shell'} command in remote sandbox`,
                  detail: { code: codeSnippet },
                });
              } else if (delta.type === 'code_execution_result') {
                const resPreview = (delta.result || '').slice(0, 600);
                if (looksLikeBuildFailure(resPreview, delta.is_error)) {
                  sawBuildError = true;
                } else if (looksLikeBuildSuccess(resPreview)) {
                  sawBuildSuccess = true;
                  sawBuildError = false;
                }
                onEvent({
                  type: 'hook_verify',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: delta.is_error
                    ? 'Sandbox command exited with error (agent self-correcting)'
                    : 'Sandbox execution step verified',
                  detail: { isError: Boolean(delta.is_error), output: resPreview },
                });
              } else if (delta.type === 'function_result') {
                const resPreview = stringifyStepResult(delta.result).slice(0, 600);
                if (looksLikeBuildFailure(resPreview, delta.is_error)) {
                  sawBuildError = true;
                } else if (looksLikeBuildSuccess(resPreview)) {
                  sawBuildSuccess = true;
                  sawBuildError = false;
                }
                onEvent({
                  type: 'hook_verify',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: delta.is_error
                    ? `Sandbox tool ${delta.name || ''} returned error (agent self-correcting)`
                    : `Sandbox tool ${delta.name || ''} verified`,
                  detail: {
                    toolName: delta.name,
                    isError: Boolean(delta.is_error),
                    output: resPreview,
                  },
                });
              }
            } else if (event.event_type === 'interaction.completed') {
              if (!interactionId && event.interaction?.id) {
                interactionId = event.interaction.id;
              }
              const maybeEnvId = (event.interaction as Record<string, unknown>)?.environment_id;
              if (typeof maybeEnvId === 'string' && maybeEnvId.length > 0) {
                environmentId = maybeEnvId;
              }
            } else if (event.event_type === 'error') {
              const errMsg = event.error?.message || 'Managed Agent streaming error';
              onEvent({
                type: 'error',
                timestamp: nowIso(),
                environmentId,
                interactionId,
                message: errMsg,
              });
              throw new Error(errMsg);
            }
          }

          // Retrieve final full Interaction metadata to guarantee environment_id & output_text
          if (interactionId && (!environmentId || outputChunks.length === 0)) {
            try {
              const finalInteraction = await client.interactions.get(interactionId);
              if (finalInteraction.environment_id) {
                environmentId = finalInteraction.environment_id;
              }
              if (outputChunks.length === 0 && finalInteraction.output_text) {
                outputChunks.push(finalInteraction.output_text);
              }
            } catch {
              // Non-fatal metadata fetch
            }
          }

          const fullReport = outputChunks.join('').trim();
          const parsedReport = parseStructuredVerificationReport(fullReport);
          const buildPassed =
            parsedReport.explicitBuildStatus !== undefined
              ? parsedReport.explicitBuildStatus
              : sawBuildSuccess || !sawBuildError;

          const summary =
            fullReport ||
            `Managed Agent "${registered.agentId}" completed visual transformation on ${repoUrl} (buildPassed=${buildPassed}).`;

          onEvent({
            type: 'completed',
            timestamp: nowIso(),
            environmentId,
            interactionId,
            message: buildPassed
              ? `Remote sandbox build verification passed${environmentId ? ` (${environmentId})` : ''}.`
              : `Managed Agent finished with build warnings; inspect diff report.`,
            detail: {
              buildPassed,
              repoUrl,
              branch: params.branch,
              agentId: registered.agentId,
              environmentId,
              interactionId,
              mountedInlineSkill: registered.mountedInlineSkill,
              mountedSources: registered.mountedSources,
              toolCallCount,
              verificationCommand: parsedReport.verificationCommand,
              filesModified: parsedReport.filesModified,
              diffSummary: parsedReport.diffSummary,
            },
          });

          return {
            environmentId,
            interactionId,
            summary,
            buildPassed,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          onEvent({
            type: 'error',
            timestamp: nowIso(),
            environmentId,
            interactionId,
            message: `Managed Agent execution failed: ${message}`,
          });
          throw err;
        }
      });
    }
  );
}
