import { ENV } from '../config/env.js';
import { traceSpan, withV1Client } from './clientPool.js';
import { extractInteractionText, normalizeMimeType, stripDataUriPrefix } from './mediaUtils.js';

export interface VoiceTranscriptionResult {
  transcript: string;
  latencyMs: number;
  model: string;
}

/**
 * Transcribes spoken creative direction via `gemini-3.5-transcribe` on the v1 Interactions API,
 * falling back cleanly to `gemini-4-hydrogen` if transcription hits an audio format or model error.
 */
export async function transcribeVoice(
  audioBase64: string,
  mimeType: string
): Promise<VoiceTranscriptionResult> {
  const startedAt = Date.now();
  const { base64, detectedMime } = stripDataUriPrefix(audioBase64);
  const cleanMime = normalizeMimeType(mimeType || detectedMime, 'audio/webm');

  if (!base64 || base64.length < 16) {
    return {
      transcript: '',
      latencyMs: Date.now() - startedAt,
      model: ENV.GEMINI_MODEL_TRANSCRIBE,
    };
  }

  return traceSpan(
    'antislop.voice.transcribe',
    'llm',
    {
      model: ENV.GEMINI_MODEL_TRANSCRIBE,
      mimeType: cleanMime,
      audioChars: base64.length,
    },
    async () => {
      const promptText =
        'Transcribe this spoken UI design direction accurately and concisely. Preserve design terms, typography names, color references, and spatial references verbatim. Output only the clean transcript text with no preamble.';

      const userInputStep = [
        {
          type: 'user_input' as const,
          content: [
            {
              type: 'audio' as const,
              data: base64,
              mime_type: cleanMime,
            },
            {
              type: 'text' as const,
              text: promptText,
            },
          ],
        },
      ];

      // Primary path: gemini-3.5-transcribe
      try {
        const model = ENV.GEMINI_MODEL_TRANSCRIBE;
        const interaction = await withV1Client((client) =>
          client.interactions.create({
            model,
            input: userInputStep,
            store: false,
          })
        );

        const transcript = extractInteractionText(interaction).replace(/^["']|["']$/g, '').trim();
        if (transcript.length > 0) {
          return {
            transcript,
            latencyMs: Date.now() - startedAt,
            model,
          };
        }
      } catch {
        // Fall through to gemini-4-hydrogen
      }

      // Fallback path: gemini-4-hydrogen (v1 Interactions, low thinking)
      const fallbackModel = ENV.GEMINI_MODEL_PATCHER;
      const interaction = await withV1Client((client) =>
        client.interactions.create({
          model: fallbackModel,
          input: userInputStep,
          generation_config: {
            thinking_level: 'low',
          },
          store: false,
        })
      );

      const transcript = extractInteractionText(interaction).replace(/^["']|["']$/g, '').trim();
      return {
        transcript,
        latencyMs: Date.now() - startedAt,
        model: fallbackModel,
      };
    }
  );
}
