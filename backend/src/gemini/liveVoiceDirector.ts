import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  Behavior,
  GoogleGenAI,
  Modality,
  Type,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { ENV } from '../config/env.js';
import { summarizeSourceFiles, transformOrchestrator } from '../orchestrator/transformOrchestrator.js';
import { puppeteerAuditor } from '../sandbox/puppeteerAuditor.js';
import { snapshotManager } from '../sandbox/snapshotManager.js';
import { viteManager } from '../sandbox/viteManager.js';

interface BrowserLiveInboundMessage {
  type?: string;
  data?: string;
  mimeType?: string;
  text?: string;
}

const liveWss = new WebSocketServer({ noServer: true });

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    // Socket closed mid-send
  }
}

async function captureQuickJpegSnapshot(previewUrl: string): Promise<string | null> {
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof puppeteerAuditor.ensureBrowser>>['newPage']>> | null =
    null;
  try {
    const browser = await puppeteerAuditor.ensureBrowser();
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page
      .goto(previewUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 5000,
      })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const jpegRaw = await page.screenshot({
      type: 'jpeg',
      quality: 75,
      fullPage: false,
    });
    return Buffer.from(jpegRaw).toString('base64');
  } catch {
    return null;
  } finally {
    if (page) {
      await page.close().catch(() => undefined);
    }
  }
}

async function buildLiveDirectorSystemInstruction(): Promise<{
  workspaceId: string;
  workspaceName: string;
  domainSummary: string;
  systemInstruction: string;
}> {
  const activeWs = viteManager.getActiveWorkspace();
  if (!activeWs) {
    return {
      workspaceId: 'none',
      workspaceName: 'Active Preview',
      domainSummary: 'No active workspace loaded yet.',
      systemInstruction:
        'You are the AntiSlop Live Design Director — a sharp, warm, authoritative creative director speaking in real time with a designer. Keep spoken replies concise (1-3 sentences). Whenever the user asks to redesign, restyle, add 3D depth, change typography/colors, or generate bespoke art, immediately call the apply_ui_transformation tool.',
    };
  }

  let domainSummary = `Workspace: ${activeWs.name} (${activeWs.framework})`;
  try {
    const files = await snapshotManager.readEditableFiles(activeWs.localPath);
    domainSummary = summarizeSourceFiles(files);
  } catch {
    // Fallback to basic workspace metadata
  }

  const systemInstruction = [
    `You are the AntiSlop Live Design Director — a world-class editorial, Swiss architectural, and 3D web design director conversing in real time over voice with the user.`,
    `You can see the live target website screenshot and hear the user.`,
    ``,
    `ACTIVE WEBSITE CONTEXT:`,
    `Workspace: ${activeWs.name} (id: ${activeWs.id}, framework: ${activeWs.framework})`,
    domainSummary,
    ``,
    `HOW TO BEHAVE:`,
    `- Speak naturally, concisely (1-3 crisp sentences), and with high design taste — never robotic filler.`,
    `- When the user asks for visual changes, critiques, 3D depth, typography upgrades, color palette shifts, or bespoke generated imagery, IMMEDIATELY invoke the non-blocking tool \`apply_ui_transformation\` with a concrete, domain-grounded instruction!`,
    `- Set \`generateArt: true\` if they request new photography, illustrations, hero art, or Nano Banana imagery.`,
    `- Set \`mode: "circle_tweak"\` for small localized edits (e.g. "change that button", "swap the hero illustration"), or \`mode: "antislop"\` for full-page redesigns.`,
    `- Keep all suggestions faithful to the website's real brand/domain and AntiSlop Design Craft (zero purple AI slop gradients, strong >= 4.5:1 WCAG AA contrast, perspective(1200px) 3D depth, expressive Display + Body + Mono fonts).`,
  ].join('\n');

  return {
    workspaceId: activeWs.id,
    workspaceName: activeWs.name,
    domainSummary,
    systemInstruction,
  };
}

async function connectGeminiLiveSession(params: {
  apiKey: string;
  systemInstruction: string;
  ws: WebSocket;
  onServerMessage: (msg: LiveServerMessage) => void;
  onSessionClosed: () => void;
}): Promise<Session> {
  const ai = new GoogleGenAI({
    apiKey: params.apiKey,
    apiVersion: 'v1beta',
  });

  return ai.live.connect({
    model: ENV.GEMINI_MODEL_LIVE,
    config: {
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: params.systemInstruction }],
      },
      tools: [
        {
          functionDeclarations: [
            {
              name: 'apply_ui_transformation',
              description:
                'Triggers a live AntiSlop UI transformation or surgical edit on the active target website preview.',
              behavior: Behavior.NON_BLOCKING,
              parameters: {
                type: Type.OBJECT,
                properties: {
                  instruction: {
                    type: Type.STRING,
                    description:
                      'Detailed visual, typographic, CSS 3D spatial depth, palette, or bespoke artwork transformation directive grounded in the target website.',
                  },
                  mode: {
                    type: Type.STRING,
                    enum: ['antislop', 'circle_tweak'],
                    description:
                      'Use "antislop" for full-page editorial/3D redesigns, or "circle_tweak" for small targeted local edits.',
                  },
                  generateArt: {
                    type: Type.BOOLEAN,
                    description:
                      'Set true when the user asks for bespoke hero photography, illustrations, or Nano Banana imagery.',
                  },
                },
                required: ['instruction'],
              },
            },
          ],
        },
      ],
    },
    callbacks: {
      onopen: () => {
        sendJson(params.ws, { type: 'live_connected', model: ENV.GEMINI_MODEL_LIVE });
      },
      onmessage: (msg: LiveServerMessage) => {
        params.onServerMessage(msg);
      },
      onerror: (err: unknown) => {
        const message = err instanceof Error ? err.message : 'Gemini Live connection error';
        sendJson(params.ws, { type: 'error', message });
      },
      onclose: () => {
        params.onSessionClosed();
      },
    },
  });
}

function handleLiveWebSocketConnection(ws: WebSocket): void {
  let closed = false;
  let session: Session | null = null;
  const pendingMessages: BrowserLiveInboundMessage[] = [];

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (session) {
      try {
        session.close();
      } catch {
        // Ignore close errors
      }
      session = null;
    }
  };

  const forwardMessageToGemini = (msg: BrowserLiveInboundMessage) => {
    if (!session || closed) return;
    const type = msg.type;
    if (type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
      session.sendRealtimeInput({
        audio: {
          data: msg.data,
          mimeType: msg.mimeType || 'audio/pcm;rate=16000',
        },
      });
    } else if (type === 'audio_end') {
      session.sendRealtimeInput({ audioStreamEnd: true });
    } else if (type === 'text' && typeof msg.text === 'string' && msg.text.trim().length > 0) {
      session.sendRealtimeInput({ text: msg.text.trim() });
    } else if (type === 'video' && typeof msg.data === 'string' && msg.data.length > 0) {
      session.sendRealtimeInput({
        video: {
          data: msg.data,
          mimeType: msg.mimeType || 'image/jpeg',
        },
      });
    }
  };

  ws.on('message', (raw: RawData) => {
    if (closed) return;
    let parsed: BrowserLiveInboundMessage;
    try {
      const text = typeof raw === 'string' ? raw : raw.toString('utf8');
      parsed = JSON.parse(text) as BrowserLiveInboundMessage;
    } catch {
      return;
    }

    if (!session) {
      if (pendingMessages.length < 64) {
        pendingMessages.push(parsed);
      }
      return;
    }
    forwardMessageToGemini(parsed);
  });

  ws.on('close', () => {
    cleanup();
  });

  ws.on('error', () => {
    cleanup();
  });

  const handleServerMessage = (msg: LiveServerMessage): void => {
    if (closed || ws.readyState !== WebSocket.OPEN) return;

    const serverContent = msg.serverContent;
    if (serverContent) {
      if (serverContent.modelTurn?.parts && Array.isArray(serverContent.modelTurn.parts)) {
        for (const part of serverContent.modelTurn.parts) {
          if (part?.inlineData?.data) {
            sendJson(ws, {
              type: 'audio',
              data: part.inlineData.data,
              mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
            });
          }
        }
      }

      if (serverContent.interimInputTranscription?.text) {
        sendJson(ws, {
          type: 'input_transcript',
          text: serverContent.interimInputTranscription.text,
          interim: true,
        });
      }

      if (serverContent.inputTranscription?.text) {
        sendJson(ws, {
          type: 'input_transcript',
          text: serverContent.inputTranscription.text,
        });
      }

      if (serverContent.outputTranscription?.text) {
        sendJson(ws, {
          type: 'output_transcript',
          text: serverContent.outputTranscription.text,
        });
      }

      if (serverContent.interrupted) {
        sendJson(ws, { type: 'interrupted' });
      }

      if (serverContent.turnComplete) {
        sendJson(ws, { type: 'turn_complete' });
      }
    }

    if (msg.toolCall?.functionCalls && Array.isArray(msg.toolCall.functionCalls)) {
      for (const call of msg.toolCall.functionCalls) {
        if (!call || call.name !== 'apply_ui_transformation') continue;
        const args = (call.args ?? {}) as Record<string, unknown>;
        const instruction =
          typeof args.instruction === 'string' && args.instruction.trim().length > 0
            ? args.instruction.trim()
            : 'Elevate this UI using AntiSlop Design Craft with CSS 3D spatial depth and crisp WCAG AA typography.';
        const mode: 'antislop' | 'circle_tweak' =
          args.mode === 'circle_tweak' ? 'circle_tweak' : 'antislop';
        const generateArt = Boolean(args.generateArt);

        try {
          const { runId } = transformOrchestrator.startTransformRun({
            mode,
            speedMode: 'fast_demo',
            assets: [],
            voiceTranscript: instruction,
            textPrompt: instruction,
            generateBespokeAssets: generateArt,
          });

          sendJson(ws, {
            type: 'run_started',
            runId,
            instruction,
            mode,
            generateArt,
          });

          session?.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: { status: 'started', runId },
              },
            ],
          });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          session?.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: { status: 'error', error: errMsg },
              },
            ],
          });
        }
      }
    }
  };

  // Boot context + screenshot + Gemini Live session asynchronously without blocking upgrade
  void (async () => {
    const apiKey = ENV.GEMINI_API_KEY || ENV.GEMINI_API_KEY_SECONDARY;
    if (!apiKey) {
      sendJson(ws, { type: 'error', message: 'No GEMINI_API_KEY configured on backend.' });
      ws.close(1011, 'Missing API key');
      return;
    }

    const context = await buildLiveDirectorSystemInstruction();
    const previewUrl = viteManager.getProxiedPreviewUrl();
    const snapshotPromise = viteManager.isReady()
      ? captureQuickJpegSnapshot(previewUrl)
      : Promise.resolve(null);

    try {
      const connectWithFallbackKey = async (): Promise<Session> => {
        try {
          return await connectGeminiLiveSession({
            apiKey,
            systemInstruction: context.systemInstruction,
            ws,
            onServerMessage: handleServerMessage,
            onSessionClosed: () => {
              if (!closed && ws.readyState === WebSocket.OPEN) {
                ws.close();
              }
            },
          });
        } catch (primaryErr) {
          if (
            ENV.GEMINI_API_KEY_SECONDARY &&
            ENV.GEMINI_API_KEY_SECONDARY !== apiKey
          ) {
            return await connectGeminiLiveSession({
              apiKey: ENV.GEMINI_API_KEY_SECONDARY,
              systemInstruction: context.systemInstruction,
              ws,
              onServerMessage: handleServerMessage,
              onSessionClosed: () => {
                if (!closed && ws.readyState === WebSocket.OPEN) {
                  ws.close();
                }
              },
            });
          }
          throw primaryErr;
        }
      };

      const liveSession = await connectWithFallbackKey();
      if (closed || ws.readyState !== WebSocket.OPEN) {
        liveSession.close();
        return;
      }
      session = liveSession;

      // Flush any early queued messages from browser
      while (pendingMessages.length > 0) {
        const nextMsg = pendingMessages.shift();
        if (nextMsg) forwardMessageToGemini(nextMsg);
      }

      sendJson(ws, {
        type: 'session_ready',
        workspaceId: context.workspaceId,
        workspaceName: context.workspaceName,
      });

      // Best-effort initial screenshot so Gemini Live sees the live app immediately
      void snapshotPromise.then((jpegBase64) => {
        if (jpegBase64 && session && !closed) {
          try {
            session.sendRealtimeInput({
              video: {
                data: jpegBase64,
                mimeType: 'image/jpeg',
              },
            });
          } catch {
            // Session already closed
          }
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(ws, { type: 'error', message });
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, message.slice(0, 120));
      }
    }
  })();
}

liveWss.on('connection', (ws: WebSocket) => {
  handleLiveWebSocketConnection(ws);
});

export function liveVoiceUpgradeHandler(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer
): void {
  liveWss.handleUpgrade(req, socket, head, (ws) => {
    liveWss.emit('connection', ws, req);
  });
}
