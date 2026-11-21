import fs from 'node:fs/promises';
import path from 'node:path';
import type { Interactions } from '@google/genai';
import type { BespokeAssetPrompt, DesignManifest, MediaAssetInput } from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import type { BespokeAssetsResult } from './contracts.js';
import { traceSpan, withV1BetaClient } from './clientPool.js';
import { resolveAssetBinary } from './mediaUtils.js';

export interface GenerateBespokeAssetsParams {
  manifest: DesignManifest;
  referenceImages: MediaAssetInput[];
  outputDir: string;
}

const PER_ASSET_TIMEOUT_MS = 28_000;

function extensionForMime(mimeType: string | undefined): string {
  const lower = (mimeType || '').toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  return '.jpg';
}

function extractImageFromInteraction(interaction: {
  output_image?: { data?: string; mime_type?: string };
  steps?: Array<{
    type?: string;
    content?: Array<{ type?: string; data?: string; mime_type?: string }>;
  }>;
}): { data: string; mimeType: string } | null {
  if (interaction.output_image?.data) {
    return {
      data: interaction.output_image.data,
      mimeType: interaction.output_image.mime_type || 'image/jpeg',
    };
  }
  if (Array.isArray(interaction.steps)) {
    for (const step of interaction.steps) {
      if (step?.type === 'model_output' && Array.isArray(step.content)) {
        for (const block of step.content) {
          if (block?.type === 'image' && typeof block.data === 'string' && block.data.length > 32) {
            return {
              data: block.data,
              mimeType: block.mime_type || 'image/jpeg',
            };
          }
        }
      }
    }
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms (${label})`)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function generateSingleAsset(
  slot: BespokeAssetPrompt,
  manifest: DesignManifest,
  refBlocks: Interactions.ImageContent[],
  outputDir: string
): Promise<{ filePath: string; publicUrl: string } | null> {
  const promptText = [
    `Create a bespoke, gallery-grade editorial visual for the UI hero/surface slot "${slot.slotId}" matching the aesthetic "${manifest.vibeTitle}".`,
    `Art Direction Prompt: ${slot.prompt}`,
    `Color & Material Harmony: ground=${manifest.tokens.palette.canvas}, surface=${manifest.tokens.palette.surface}, primary ink=${manifest.tokens.palette.inkPrimary}, accent=${manifest.tokens.palette.accent}.`,
    `Aspect Ratio target: ${slot.aspectRatio}.`,
    `Strict Constraints: Harmonize lighting, palette, and tactile texture directly with the provided moodboard reference images. ABSOLUTELY ZERO text, typography, watermarks, UI buttons, or logos inside the image. Pure museum-grade editorial art direction.`,
  ].join('\n');

  const inputBlocks: Interactions.Content[] = [
    ...refBlocks,
    { type: 'text', text: promptText },
  ];

  const userInputStep: Interactions.Step[] = [
    {
      type: 'user_input',
      content: inputBlocks,
    },
  ];

  const callModel = async (withImageConfig: boolean) => {
    return withV1BetaClient((client) =>
      client.interactions.create({
        model: ENV.GEMINI_MODEL_IMAGE_GEN,
        input: userInputStep,
        response_modalities: ['image'],
        ...(withImageConfig
          ? {
              generation_config: {
                image_config: {
                  aspect_ratio: slot.aspectRatio,
                  image_size: '1K',
                },
              },
            }
          : {}),
        store: false,
      })
    );
  };

  let interaction;
  try {
    interaction = await withTimeout(
      callModel(true),
      PER_ASSET_TIMEOUT_MS,
      `nano-banana-${slot.slotId}`
    );
  } catch {
    // Fallback without image_config in case aspect_ratio/image_size constraints reject
    try {
      interaction = await withTimeout(
        callModel(false),
        PER_ASSET_TIMEOUT_MS,
        `nano-banana-fallback-${slot.slotId}`
      );
    } catch {
      return null;
    }
  }

  const generated = extractImageFromInteraction(interaction);
  if (!generated) return null;

  const baseName = path
    .basename(slot.targetPublicPath || `${slot.slotId}.jpg`)
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  const ext = extensionForMime(generated.mimeType);
  const fileName = `${baseName || slot.slotId}${ext}`;
  const fullPath = path.join(outputDir, fileName);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(fullPath, Buffer.from(generated.data, 'base64'));

  // Derive clean public URL relative to `public/` (defaults to `/generated/<fileName>`)
  const dirName = path.basename(outputDir);
  const publicUrl = `/${dirName}/${fileName}`;

  return { filePath: fullPath, publicUrl };
}

/**
 * Generates a single studio-isolated bespoke artwork image for targeted Circle & Speak
 * visual replacements (e.g., "transform this butterfly into a tiger") using `gemini-nano-banana-2.1`.
 */
export async function generateTargetedArtwork(params: {
  instruction: string;
  outputDir: string;
  publicPrefix: string;
  referenceImages?: MediaAssetInput[];
}): Promise<{ filePath: string; publicUrl: string; latencyMs: number } | null> {
  const start = Date.now();
  return traceSpan(
    'antislop.assets.generateTargetedArtwork',
    'llm',
    { model: ENV.GEMINI_MODEL_IMAGE_GEN, instruction: params.instruction.slice(0, 140) },
    async () => {
      const refBlocks: Interactions.ImageContent[] = [];
      for (const ref of (params.referenceImages || []).slice(0, 3)) {
        const bin = await resolveAssetBinary(ref);
        if (!bin || !bin.mimeType.startsWith('image/')) continue;
        refBlocks.push({ type: 'image', data: bin.base64, mime_type: bin.mimeType });
      }

      const promptText = [
        `Generate a single striking, museum-grade studio artwork fulfilling this user visual change request: "${params.instruction}".`,
        `Composition: Center the single main subject prominently with a dramatic, unmistakable silhouette against a PURE SOLID WHITE (#FFFFFF) background.`,
        `Style: High-contrast artistic editorial photography/illustration with deep luminous cobalt blue and crisp charcoal ink shading so it looks extraordinary both directly and when sampled by a halftone dot-matrix canvas shader.`,
        `Strict Rules: ABSOLUTELY ZERO text, letters, numbers, UI chrome, borders, or watermarks.`,
      ].join('\n');

      const userInputStep: Interactions.Step[] = [
        {
          type: 'user_input',
          content: [...refBlocks, { type: 'text', text: promptText }],
        },
      ];

      let interaction;
      try {
        interaction = await withTimeout(
          withV1BetaClient((client) =>
            client.interactions.create({
              model: ENV.GEMINI_MODEL_IMAGE_GEN,
              input: userInputStep,
              response_modalities: ['image'],
              generation_config: {
                image_config: {
                  aspect_ratio: '3:4',
                  image_size: '1K',
                },
              },
              store: false,
            })
          ),
          PER_ASSET_TIMEOUT_MS,
          'nano-banana-targeted'
        );
      } catch {
        try {
          interaction = await withTimeout(
            withV1BetaClient((client) =>
              client.interactions.create({
                model: ENV.GEMINI_MODEL_IMAGE_GEN,
                input: userInputStep,
                response_modalities: ['image'],
                store: false,
              })
            ),
            PER_ASSET_TIMEOUT_MS,
            'nano-banana-targeted-fallback'
          );
        } catch {
          return null;
        }
      }

      const generated = extractImageFromInteraction(interaction);
      if (!generated) return null;

      const ext = extensionForMime(generated.mimeType);
      const fileName = `antislop-art-${Date.now().toString(36)}${ext}`;
      const fullPath = path.join(params.outputDir, fileName);

      await fs.mkdir(params.outputDir, { recursive: true });
      await fs.writeFile(fullPath, Buffer.from(generated.data, 'base64'));

      const prefix = params.publicPrefix.replace(/\/+$/, '');
      const publicUrl = `${prefix}/${fileName}`;
      return { filePath: fullPath, publicUrl, latencyMs: Date.now() - start };
    }
  );
}

/**
 * Generates bespoke editorial imagery using `gemini-nano-banana-2.1` on `v1beta`,
 * conditioning on up to 6 moodboard reference images. Always degrades gracefully on failure.
 */
export async function generateBespokeAssets(
  params: GenerateBespokeAssetsParams
): Promise<BespokeAssetsResult> {
  const startedAt = Date.now();

  return traceSpan(
    'antislop.assets.generateBespoke',
    'llm',
    {
      model: ENV.GEMINI_MODEL_IMAGE_GEN,
      vibeTitle: params.manifest.vibeTitle,
      slotCount: params.manifest.bespokeAssets.length,
      refCount: Math.min(6, params.referenceImages.length),
      outputDir: params.outputDir,
    },
    async () => {
      // Resolve up to 6 moodboard/webcam reference images
      const refBlocks: Interactions.ImageContent[] = [];
      for (const asset of params.referenceImages) {
        if (refBlocks.length >= 6) break;
        if (asset.modality === 'motion_video' || asset.modality === 'voice_audio') continue;
        const binary = await resolveAssetBinary(asset);
        if (!binary || !binary.mimeType.startsWith('image/')) continue;
        refBlocks.push({
          type: 'image',
          data: binary.base64,
          mime_type: binary.mimeType,
        });
      }

      const slots: BespokeAssetPrompt[] =
        params.manifest.bespokeAssets.length > 0
          ? params.manifest.bespokeAssets.slice(0, 2)
          : [
              {
                slotId: 'hero_primary',
                targetPublicPath: '/generated/hero-primary.jpg',
                prompt: `Tactile museum-grade editorial hero artwork matching "${params.manifest.vibeTitle}", palette ${params.manifest.tokens.palette.canvas} and ${params.manifest.tokens.palette.accent}, zero text.`,
                aspectRatio: '16:9',
              },
            ];

      const settled = await Promise.allSettled(
        slots.map((slot) => generateSingleAsset(slot, params.manifest, refBlocks, params.outputDir))
      );

      const generatedPaths: string[] = [];
      const publicUrls: string[] = [];

      for (const outcome of settled) {
        if (outcome.status === 'fulfilled' && outcome.value) {
          generatedPaths.push(outcome.value.filePath);
          publicUrls.push(outcome.value.publicUrl);
        }
      }

      return {
        generatedPaths,
        publicUrls,
        latencyMs: Date.now() - startedAt,
      };
    }
  );
}
