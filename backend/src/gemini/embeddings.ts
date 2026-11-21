import type { MediaAssetInput } from '../../../shared/types.js';
import { ENV } from '../config/env.js';
import { traceSpan, withV1Client } from './clientPool.js';
import { normalizeMimeType, resolveAssetBinary, stripDataUriPrefix } from './mediaUtils.js';

export interface TasteEmbeddingParams {
  referenceImages: MediaAssetInput[];
  renderedScreenshotBase64: string;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < len; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom <= 1e-12) return 0;

  // Clamp into [0, 1] since multimodal cosine similarities can occasionally dip slightly below 0
  return Math.max(0, Math.min(1, dot / denom));
}

async function embedSingleImage(base64: string, mimeType: string): Promise<number[] | null> {
  const response = await withV1Client((client) =>
    client.models.embedContent({
      model: ENV.GEMINI_MODEL_EMBEDDING,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
    })
  );

  const values = response.embeddings?.[0]?.values;
  return Array.isArray(values) && values.length > 0 ? values : null;
}

/**
 * Computes multimodal taste embedding cosine similarity (`0..1`) between the rendered
 * UI screenshot and up to 3 reference moodboard images using `gemini-embedding-2`.
 * Gracefully returns `undefined` if no reference images exist or embedding fails.
 */
export async function computeTasteEmbeddingSimilarity(
  params: TasteEmbeddingParams
): Promise<number | undefined> {
  const { base64: renderedBase64, detectedMime } = stripDataUriPrefix(
    params.renderedScreenshotBase64
  );
  if (!renderedBase64 || renderedBase64.length < 32) {
    return undefined;
  }

  const resolvedRefs: Array<{ base64: string; mimeType: string }> = [];
  for (const asset of params.referenceImages) {
    if (resolvedRefs.length >= 3) break;
    if (asset.modality === 'motion_video' || asset.modality === 'voice_audio') continue;
    const binary = await resolveAssetBinary(asset);
    if (binary && binary.mimeType.startsWith('image/')) {
      resolvedRefs.push(binary);
    }
  }

  if (resolvedRefs.length === 0) {
    return undefined;
  }

  return traceSpan(
    'antislop.embeddings.tasteSimilarity',
    'embedding',
    {
      model: ENV.GEMINI_MODEL_EMBEDDING,
      referenceImageCount: resolvedRefs.length,
    },
    async () => {
      try {
        const renderedMime = normalizeMimeType(detectedMime, 'image/png');
        const [renderedVec, ...refVecs] = await Promise.all([
          embedSingleImage(renderedBase64, renderedMime),
          ...resolvedRefs.map((ref) => embedSingleImage(ref.base64, ref.mimeType)),
        ]);

        if (!renderedVec) return undefined;

        const validSims: number[] = [];
        for (const refVec of refVecs) {
          if (refVec) {
            validSims.push(cosineSimilarity(renderedVec, refVec));
          }
        }

        if (validSims.length === 0) return undefined;

        const avg = validSims.reduce((sum, v) => sum + v, 0) / validSims.length;
        return Number(avg.toFixed(4));
      } catch {
        // Non-fatal metric — never block the critic loop
        return undefined;
      }
    }
  );
}
