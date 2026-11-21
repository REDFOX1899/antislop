import type {
  DecisionsScorecard,
  DesignManifest,
  DrawnCircleAnnotation,
  ExecutionSpeedMode,
  ManagedAgentEvent,
  ManagedAgentShipRequest,
  MediaAssetInput,
  TransformRunRequest,
} from '../../../shared/types.js';

export interface GeneratedCandidateCode {
  candidateId: string;
  strategyLabel: string;
  modelUsed: string;
  files: Record<string, string>;
  diffSummary: string;
  changedSections?: string[];
  latencyMs: number;
}

export interface FastSinglePassResult {
  manifest: DesignManifest;
  candidate: GeneratedCandidateCode;
  changedSections: string[];
  latencyMs: number;
}

export interface SurgicalPatchResult {
  modelUsed: string;
  files: Record<string, string>;
  diffSummary: string;
  changedSections?: string[];
  latencyMs: number;
}

export interface BespokeAssetsResult {
  generatedPaths: string[];
  publicUrls: string[];
  latencyMs: number;
}

export interface GeminiCoreEngine {
  getPoolStatus(): { primaryConfigured: boolean; secondaryConfigured: boolean; totalCalls: number };
  transcribeVoice(audioBase64: string, mimeType: string): Promise<{ transcript: string; latencyMs: number; model: string }>;
  synthesizeDesignManifest(params: {
    assets: MediaAssetInput[];
    voiceTranscript?: string;
    textPrompt?: string;
    mode: TransformRunRequest['mode'];
    speedMode: ExecutionSpeedMode;
    currentCodeSummary?: string;
    annotatedScreenshotBase64?: string;
    drawnCircles?: DrawnCircleAnnotation[];
    onThinking?: (delta: string) => void;
  }): Promise<DesignManifest>;
  generateBespokeAssets(params: {
    manifest: DesignManifest;
    referenceImages: MediaAssetInput[];
    outputDir: string;
  }): Promise<BespokeAssetsResult>;
  runFastSinglePass(params: {
    assets: MediaAssetInput[];
    sourceFiles: Record<string, string>;
    voiceTranscript?: string;
    textPrompt?: string;
    annotatedScreenshotBase64?: string;
    drawnCircles?: DrawnCircleAnnotation[];
    generatedPublicPaths?: string[];
  }): Promise<FastSinglePassResult>;
  generateCodeCandidates(params: {
    manifest?: DesignManifest;
    sourceFiles: Record<string, string>;
    parallelCount: number;
    generatedPublicPaths: string[];
    mode: TransformRunRequest['mode'];
    speedMode: ExecutionSpeedMode;
    textPrompt?: string;
  }): Promise<GeneratedCandidateCode[]>;
  applySurgicalPatch(params: {
    manifest?: DesignManifest;
    sourceFiles: Record<string, string>;
    scorecard?: DecisionsScorecard;
    currentScreenshotBase64?: string;
    annotatedScreenshotBase64?: string;
    drawnCircles?: DrawnCircleAnnotation[];
    referenceAssets?: MediaAssetInput[];
    targetRegion?: TransformRunRequest['targetRegion'];
    instruction?: string;
    errorContext?: string;
    speedMode?: ExecutionSpeedMode;
  }): Promise<SurgicalPatchResult>;
  evaluateVisualCandidate(params: {
    renderedDesktopBase64: string;
    renderedMobileBase64?: string;
    referenceAssets: MediaAssetInput[];
    manifest?: DesignManifest;
    domAudit: DecisionsScorecard['domAudit'];
  }): Promise<DecisionsScorecard>;
  computeTasteEmbeddingSimilarity(params: {
    referenceImages: MediaAssetInput[];
    renderedScreenshotBase64: string;
  }): Promise<number | undefined>;
  shipToRemoteRepoViaManagedAgent(
    params: ManagedAgentShipRequest,
    onEvent: (ev: ManagedAgentEvent) => void
  ): Promise<{ environmentId?: string; interactionId?: string; summary: string; buildPassed: boolean }>;
}
