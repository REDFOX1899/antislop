/**
 * Shared Interface Contract for AntiSlop
 * Single source of truth consumed by /backend, /studio, and /benchmarks.
 * Locked before parallel agent fan-out so all subsystems integrate cleanly.
 */

export type InputModality = 'moodboard_image' | 'motion_video' | 'webcam_frame' | 'voice_audio' | 'region_annotation';

export interface MediaAssetInput {
  id: string;
  modality: InputModality;
  mimeType: string;
  /** Base64 payload (without data: URI prefix) or server-relative upload path */
  dataBase64?: string;
  fileUrl?: string;
  filename?: string;
  label?: string;
  /** Optional normalized region box [0..1] when user circles a region on the live canvas */
  regionBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DesignTokens {
  palette: {
    canvas: string;
    surface: string;
    surfaceMuted: string;
    inkPrimary: string;
    inkSecondary: string;
    accent: string;
    accentContrast: string;
    borderSubtle: string;
  };
  typography: {
    displayFont: string;
    bodyFont: string;
    monoFont: string;
    googleFontsUrl: string;
    headlineTracking: string;
    editorialScaleRatio: number;
    bodyLineHeight: number;
  };
  geometry: {
    borderRadiusSm: string;
    borderRadiusMd: string;
    borderRadiusLg: string;
    borderStyle: string;
    elevationPhilosophy: 'flat-editorial' | 'tactile-print' | 'soft-architectural' | 'brutalist-crisp';
  };
  motion: {
    easingCurve: string;
    hoverDurationMs: number;
    entranceStyle: string;
    microInteractionNotes: string;
  };
  layoutDirectives: string[];
  antiSlopBanList: string[];
}

export interface BespokeAssetPrompt {
  slotId: 'hero_primary' | 'editorial_secondary' | 'surface_texture';
  targetPublicPath: string;
  prompt: string;
  aspectRatio: '16:9' | '4:3' | '1:1' | '3:4';
}

export interface DesignManifest {
  manifestId: string;
  vibeTitle: string;
  editorialRationale: string;
  extractedFromModalities: InputModality[];
  tokens: DesignTokens;
  bespokeAssets: BespokeAssetPrompt[];
  conflictResolutionNotes?: string;
  modelUsed: string;
  thinkingSummary?: string;
  latencyMs: number;
}

export interface DecisionMetric {
  id: string;
  label: string;
  type: 'score' | 'noul' | 'choice';
  /** Normalized 0..10 for score, 0..1 probability for noul */
  value: number;
  confidence: number;
  choiceLabel?: string;
  passed: boolean;
  thresholdDescription: string;
}

export interface DecisionsScorecard {
  scorecardId: string;
  model: string;
  latencyMs: number;
  /** Composite 0..100 AntiSlop Taste Index */
  overallTasteScore: number;
  passedAllGates: boolean;
  metrics: {
    aestheticMatch: DecisionMetric;
    slopPenalty: DecisionMetric;
    typographyCraft: DecisionMetric;
    visualRhythm: DecisionMetric;
    colorHarmony: DecisionMetric;
    motionCohesion: DecisionMetric;
    layoutBroken: DecisionMetric;
    contrastFailing: DecisionMetric;
    genericAiCliché: DecisionMetric;
    productionReady: DecisionMetric;
    dominantAestheticClass: DecisionMetric;
    primaryDefectClass: DecisionMetric;
  };
  /** Multimodal cosine similarity (0..1) via gemini-embedding-2 */
  embeddingSimilarity?: number;
  /** Deterministic Puppeteer DOM/layout audit */
  domAudit: {
    horizontalOverflowPx: number;
    overlappingTextNodes: number;
    brokenImageCount: number;
    consoleErrorCount: number;
    viewportWidth: number;
    viewportHeight: number;
  };
  criticActionDirective: string;
}

export interface CandidateResult {
  candidateId: string;
  strategyLabel: string;
  modelUsed: string;
  filesModified: string[];
  screenshotUrl: string;
  mobileScreenshotUrl?: string;
  scorecard: DecisionsScorecard;
  selectedAsWinner: boolean;
  latencyMs: number;
}

export interface CriticIteration {
  iteration: number;
  phase: 'baseline_capture' | 'parallel_race' | 'refinement' | 'circle_tweak';
  candidates: CandidateResult[];
  winnerCandidateId: string;
  scorecard: DecisionsScorecard;
  screenshotUrl: string;
  generatedAssetUrls: string[];
  diffSummary: string;
  timestamp: string;
}

export interface TransformRunRequest {
  mode: 'antislop' | 'text_baseline' | 'stress_test' | 'circle_tweak';
  assets: MediaAssetInput[];
  voiceTranscript?: string;
  textPrompt?: string;
  /** Number of parallel candidate variants (1..4) using Tier 3 quota */
  parallelCandidates?: number;
  /** Max autonomous refinement loops driven by Decisions API */
  maxIterations?: number;
  /** Whether to generate bespoke hero/texture imagery via gemini-nano-banana-2.1 */
  generateBespokeAssets?: boolean;
  /** Optional region annotation for surgical circle-to-tweak */
  targetRegion?: {
    x: number;
    y: number;
    width: number;
    height: number;
    instruction: string;
  };
}

export interface TransformRunResult {
  runId: string;
  mode: TransformRunRequest['mode'];
  status: 'running' | 'passed' | 'max_iterations_reached' | 'failed';
  startedAt: string;
  completedAt?: string;
  baselineScreenshotUrl: string;
  finalScreenshotUrl?: string;
  manifest?: DesignManifest;
  iterations: CriticIteration[];
  modelsInvoked: string[];
  totalLatencyMs: number;
}

export interface ManagedAgentShipRequest {
  repoUrl: string;
  branch?: string;
  manifest: DesignManifest;
  scorecard: DecisionsScorecard;
  runBuildHook?: boolean;
}

export interface ManagedAgentEvent {
  type: 'agent_created' | 'sandbox_ready' | 'step_delta' | 'tool_call' | 'hook_verify' | 'completed' | 'error';
  timestamp: string;
  environmentId?: string;
  interactionId?: string;
  message: string;
  detail?: Record<string, unknown>;
}

export type StreamEventType =
  | 'run_started'
  | 'snapshot_captured'
  | 'voice_transcribed'
  | 'director_thinking'
  | 'manifest_ready'
  | 'asset_generated'
  | 'candidate_started'
  | 'candidate_written'
  | 'candidate_scored'
  | 'iteration_complete'
  | 'refinement_triggered'
  | 'hmr_reloaded'
  | 'run_completed'
  | 'run_error';

export interface StreamEvent {
  runId: string;
  type: StreamEventType;
  timestamp: string;
  iteration?: number;
  model?: string;
  message: string;
  payload?: unknown;
}
