import type { GoogleGenAI } from '@google/genai';
import type { ManagedAgentEvent, ManagedAgentShipRequest } from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';

const MANAGED_AGENT_ID = 'antislop-repo-surgeon';

const MANAGED_AGENT_SYSTEM_INSTRUCTION = `You are the AntiSlop Repo Surgeon — an autonomous frontend design-engineering agent executing inside a sandboxed Linux environment with the target repository mounted at /workspace/repo.

Your disciplined workflow:
1. Inspect /workspace/repo structure (package.json, index.html, src/index.css, src/App.tsx, or equivalent Next.js/Vite UI entrypoints).
2. Faithfully apply the verified AntiSlop DesignManifest tokens (palette, Google Fonts typography, geometry, layout directives, and strict anti-slop ban list) directly into the repo's styling and root UI files without inventing uninstalled npm dependencies.
3. Run deterministic verification inside /workspace/repo:
   - Run \`npm install\` (if node_modules is missing)
   - Run \`npm run build\` (or \`npx tsc --noEmit && npm run build\`)
   - If the build fails, inspect compiler errors, fix them immediately, and re-run \`npm run build\` until exit code is 0!
4. Finish with a concise structured report containing:
   - \`BUILD_STATUS: PASSED\` or \`BUILD_STATUS: FAILED\`
   - \`FILES_MODIFIED:\` bullet list
   - \`GIT_DIFF_SUMMARY:\` concise summary of aesthetic upgrades and build verification output.`;

function normalizeGitHubUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed.replace(/\.git$/i, '');
  }
  // Support `owner/repo` shorthand
  return `https://github.com/${trimmed.replace(/^\/+/, '').replace(/\.git$/i, '')}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function getMountedRepoSource(baseEnvironment: unknown): string | undefined {
  if (!baseEnvironment || typeof baseEnvironment !== 'object') return undefined;
  const envObj = baseEnvironment as { sources?: Array<{ type?: string; source?: string }> };
  const repoSource = envObj.sources?.find((s) => s.type === 'repository');
  return repoSource?.source;
}

async function ensureCustomRepoSurgeonAgent(
  client: GoogleGenAI,
  repoUrl: string,
  onEvent: (ev: ManagedAgentEvent) => void
): Promise<string> {
  const createPayload = {
    id: MANAGED_AGENT_ID,
    base_agent: ENV.GEMINI_MANAGED_AGENT_BASE,
    description:
      'AntiSlop autonomous remote repository visual transformation & deterministic build verification agent.',
    system_instruction: MANAGED_AGENT_SYSTEM_INSTRUCTION,
    base_environment: {
      type: 'remote' as const,
      sources: [
        {
          type: 'repository' as const,
          source: repoUrl,
          target: '/workspace/repo',
        },
      ],
    },
  };

  try {
    const existing = await client.agents.get(MANAGED_AGENT_ID);
    const mountedSource = getMountedRepoSource(existing.base_environment);
    if (mountedSource === repoUrl) {
      onEvent({
        type: 'agent_created',
        timestamp: nowIso(),
        message: `Reusing registered Managed Agent "${MANAGED_AGENT_ID}" (${ENV.GEMINI_MANAGED_AGENT_BASE}) mounted on ${repoUrl}`,
        detail: { agentId: MANAGED_AGENT_ID, reused: true, repoUrl },
      });
      return existing.id || MANAGED_AGENT_ID;
    }

    // Repository URL changed — refresh custom agent mount cleanly
    try {
      await client.agents.delete(MANAGED_AGENT_ID);
    } catch {
      // Ignore delete race; create below will handle
    }
  } catch {
    // Agent does not exist yet — create fresh below
  }

  try {
    const created = await client.agents.create(createPayload);
    onEvent({
      type: 'agent_created',
      timestamp: nowIso(),
      message: `Registered custom Managed Agent "${MANAGED_AGENT_ID}" based on ${ENV.GEMINI_MANAGED_AGENT_BASE} for ${repoUrl}`,
      detail: { agentId: created.id || MANAGED_AGENT_ID, reused: false, repoUrl },
    });
    return created.id || MANAGED_AGENT_ID;
  } catch (err) {
    // Handle 409 ALREADY_EXISTS race safely
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('409') || msg.toLowerCase().includes('already exists')) {
      onEvent({
        type: 'agent_created',
        timestamp: nowIso(),
        message: `Connected to existing Managed Agent "${MANAGED_AGENT_ID}"`,
        detail: { agentId: MANAGED_AGENT_ID, reused: true, repoUrl },
      });
      return MANAGED_AGENT_ID;
    }
    throw err;
  }
}

/**
 * Ships a verified AntiSlop `DesignManifest` to a remote GitHub repository inside a
 * Google-hosted Linux sandbox using Managed Agents (`antigravity-preview-09-2026` on `v1beta`),
 * streaming real-time tool execution and `npm run build` verification events.
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

  return traceSpan(
    'antislop.managedAgent.shipToRemoteRepo',
    'chain',
    {
      agentId: MANAGED_AGENT_ID,
      baseAgent: ENV.GEMINI_MANAGED_AGENT_BASE,
      repoUrl,
      branch: params.branch,
      vibeTitle: params.manifest.vibeTitle,
      tasteScore: params.scorecard.overallTasteScore,
      runBuildGate,
    },
    async () => {
      // Pin a single v1beta client for both agent registration and streaming invocation
      // so the custom agent lives in the exact same API key project!
      return withV1BetaClient(async (client) => {
        const agentId = await ensureCustomRepoSurgeonAgent(client, repoUrl, onEvent);

        const inputPrompt = [
          `TARGET REPOSITORY: ${repoUrl}${params.branch ? ` (branch: ${params.branch})` : ''} mounted at /workspace/repo.`,
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
          `1. Inspect /workspace/repo (list files, check package.json and entry UI files).`,
          `2. Apply the DesignManifest palette, typography (Google Fonts), geometry, and anti-slop editorial layout upgrades cleanly into the repository's UI files.`,
          runBuildGate
            ? `3. DETERMINISTIC VERIFICATION GATE: Inside /workspace/repo, run \`npm install && npm run build\`. Fix any TypeScript or bundler errors until \`npm run build\` exits 0.`
            : `3. Run \`git status\` and \`git diff --stat\` to verify clean modifications.`,
          `4. Print \`git diff --stat\` and conclude with a structured report including \`BUILD_STATUS: PASSED\` (or \`BUILD_STATUS: FAILED\`), \`FILES_MODIFIED\`, and \`GIT_DIFF_SUMMARY\`.`,
        ].join('\n\n');

        let environmentId: string | undefined;
        let interactionId: string | undefined;
        let sawBuildError = false;
        let sawBuildSuccess = false;
        const outputChunks: string[] = [];

        try {
          const stream = await client.interactions.create({
            agent: agentId,
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
                detail: { agentId, status: event.interaction.status },
              });
            } else if (event.event_type === 'step.start') {
              const stepType = event.step.type;
              if (
                stepType === 'code_execution_call' ||
                stepType === 'function_call' ||
                stepType === 'mcp_server_tool_call'
              ) {
                onEvent({
                  type: 'tool_call',
                  timestamp: nowIso(),
                  environmentId,
                  interactionId,
                  message: `Managed agent invoked sandbox tool: ${stepType}`,
                  detail: { stepIndex: event.index, stepType },
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
                const codeSnippet = (delta.arguments?.code || '').slice(0, 260);
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
                const lower = resPreview.toLowerCase();
                if (delta.is_error) {
                  sawBuildError = true;
                } else if (
                  lower.includes('built in') ||
                  lower.includes('dist/') ||
                  lower.includes('compiled successfully')
                ) {
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

          // Retrieve final full Interaction metadata to guarantee we have environment_id
          if (interactionId && !environmentId) {
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
          const upperReport = fullReport.toUpperCase();
          const buildPassed = upperReport.includes('BUILD_STATUS: PASSED')
            ? true
            : upperReport.includes('BUILD_STATUS: FAILED')
              ? false
              : sawBuildSuccess || !sawBuildError;

          const summary =
            fullReport ||
            `Managed Agent "${agentId}" completed visual transformation on ${repoUrl} (buildPassed=${buildPassed}).`;

          onEvent({
            type: 'completed',
            timestamp: nowIso(),
            environmentId,
            interactionId,
            message: buildPassed
              ? `Remote build verification passed inside sandbox${environmentId ? ` (${environmentId})` : ''}.`
              : `Managed Agent finished with build warnings; inspect diff report.`,
            detail: { buildPassed, repoUrl, agentId },
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
