'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type LiveVoiceStatus = 'idle' | 'connecting' | 'live' | 'error';

export interface UseLiveVoiceSessionOptions {
  onLiveRunStarted?: (runId: string, instruction: string) => void;
}

export interface LiveVoiceSessionState {
  status: LiveVoiceStatus;
  error: string | null;
  isGeminiSpeaking: boolean;
  inputLevel: number;
  outputLevel: number;
  userTranscript: string;
  geminiTranscript: string;
  startSession: () => Promise<void>;
  stopSession: () => void;
  toggleSession: () => void;
  sendTextMessage: (text: string) => boolean;
}

interface IncomingLiveMessage {
  type?: string;
  data?: string;
  text?: string;
  runId?: string;
  instruction?: string;
  message?: string;
  error?: string;
}

const TARGET_INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const INPUT_BUFFER_FRAMES = 2048;

function buildLiveWsUrl(): string {
  const rawBase = (
    process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'
  ).replace(/\/+$/, '');

  if (/^wss?:\/\//i.test(rawBase)) {
    return `${rawBase}/api/live/ws`;
  }
  if (/^https?:\/\//i.test(rawBase)) {
    const wsBase = rawBase
      .replace(/^https:\/\//i, 'wss://')
      .replace(/^http:\/\//i, 'ws://');
    return `${wsBase}/api/live/ws`;
  }
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
    return `${proto}//${window.location.host}${path}/api/live/ws`;
  }
  return `ws://localhost:4000/api/live/ws`;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ||
    null
  );
}

function resampleTo16kInt16(input: Float32Array, srcRate: number): Int16Array {
  if (srcRate === TARGET_INPUT_SAMPLE_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const clamped = Math.max(-1, Math.min(1, input[i]));
      out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    return out;
  }

  const ratio = srcRate / TARGET_INPUT_SAMPLE_RATE;
  const outLength = Math.max(1, Math.round(input.length / ratio));
  const out = new Int16Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const start = i * ratio;
    const end = Math.min(input.length, (i + 1) * ratio);

    let sample = 0;
    if (ratio > 1) {
      // Box-average downsampling reduces aliasing from 44.1kHz / 48kHz hardware rates
      const startIdx = Math.floor(start);
      const endIdx = Math.max(startIdx + 1, Math.ceil(end));
      let sum = 0;
      let count = 0;
      for (let j = startIdx; j < endIdx && j < input.length; j++) {
        sum += input[j];
        count++;
      }
      sample = count > 0 ? sum / count : 0;
    } else {
      const idx = Math.floor(start);
      const frac = start - idx;
      const s0 = input[idx] ?? 0;
      const s1 = input[Math.min(input.length - 1, idx + 1)] ?? s0;
      sample = s0 + (s1 - s0) * frac;
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return out;
}

function int16ToLittleEndianBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(i * 2, samples[i], true);
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodePcm24kBase64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const sampleCount = Math.floor(bytes.byteLength / 2);
  const floats = new Float32Array(sampleCount);
  const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2);
  for (let i = 0; i < sampleCount; i++) {
    floats[i] = view.getInt16(i * 2, true) / 32768;
  }
  return floats;
}

function appendTranscriptChunk(prev: string, chunk: string): string {
  if (!chunk) return prev;
  if (!prev) return chunk.trimStart();
  const endsWithSpace = /\s$/.test(prev);
  const startsWithSpaceOrPunct = /^[\s.,!?;:'")\]}]/.test(chunk);
  if (endsWithSpace || startsWithSpaceOrPunct) {
    return `${prev}${chunk}`;
  }
  return `${prev}${chunk}`;
}

export function useLiveVoiceSession(
  options: UseLiveVoiceSessionOptions = {}
): LiveVoiceSessionState {
  const { onLiveRunStarted } = options;

  const [status, setStatus] = useState<LiveVoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isGeminiSpeaking, setIsGeminiSpeaking] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [userTranscript, setUserTranscript] = useState('');
  const [geminiTranscript, setGeminiTranscript] = useState('');

  const onLiveRunStartedRef = useRef(onLiveRunStarted);
  useEffect(() => {
    onLiveRunStartedRef.current = onLiveRunStarted;
  }, [onLiveRunStarted]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);

  const outputCtxRef = useRef<AudioContext | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputMeterRafRef = useRef<number | null>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextPlayTimeRef = useRef<number>(0);

  const smoothedInputRef = useRef(0);
  const smoothedOutputRef = useRef(0);
  const isClosingRef = useRef(false);
  const resetUserOnNextRef = useRef(false);
  const resetGeminiOnNextRef = useRef(false);
  const sessionNonceRef = useRef(0);

  const stopOutputMeter = useCallback(() => {
    if (outputMeterRafRef.current !== null) {
      cancelAnimationFrame(outputMeterRafRef.current);
      outputMeterRafRef.current = null;
    }
    smoothedOutputRef.current = 0;
    setOutputLevel(0);
  }, []);

  const stopAllQueuedOutput = useCallback(() => {
    const active = activeSourcesRef.current;
    if (active.size > 0) {
      for (const node of active) {
        node.onended = null;
        try {
          node.stop();
        } catch {
          // Node may already have finished
        }
        try {
          node.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      }
      active.clear();
    }
    nextPlayTimeRef.current = 0;
    setIsGeminiSpeaking(false);
    stopOutputMeter();
  }, [stopOutputMeter]);

  const ensureOutputMeterRunning = useCallback(() => {
    if (outputMeterRafRef.current !== null) return;
    const analyser = outputAnalyserRef.current;
    if (!analyser) return;

    const timeData = new Float32Array(analyser.fftSize);
    const tick = () => {
      if (activeSourcesRef.current.size === 0 || !outputAnalyserRef.current) {
        outputMeterRafRef.current = null;
        smoothedOutputRef.current = 0;
        setOutputLevel(0);
        return;
      }

      outputAnalyserRef.current.getFloatTimeDomainData(timeData);
      let sumSq = 0;
      for (let i = 0; i < timeData.length; i++) {
        sumSq += timeData[i] * timeData[i];
      }
      const rms = Math.sqrt(sumSq / timeData.length);
      const target = Math.min(1, rms * 4.8);
      const next = smoothedOutputRef.current * 0.5 + target * 0.5;
      smoothedOutputRef.current = next;
      setOutputLevel(next < 0.01 ? 0 : next);

      outputMeterRafRef.current = requestAnimationFrame(tick);
    };

    outputMeterRafRef.current = requestAnimationFrame(tick);
  }, []);

  const teardownResources = useCallback(() => {
    stopAllQueuedOutput();

    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      try {
        processorRef.current.disconnect();
      } catch {
        // Ignore
      }
      processorRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore
      }
      sourceNodeRef.current = null;
    }

    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {
        // Ignore
      }
      silentGainRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputAnalyserRef.current) {
      try {
        outputAnalyserRef.current.disconnect();
      } catch {
        // Ignore
      }
      outputAnalyserRef.current = null;
    }

    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'audio_end' }));
        } catch {
          // Ignore send failure on close
        }
      }
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        try {
          ws.close(1000, 'Client ended live session');
        } catch {
          // Ignore
        }
      }
    }

    smoothedInputRef.current = 0;
    setInputLevel(0);
  }, [stopAllQueuedOutput]);

  useEffect(() => {
    return () => {
      isClosingRef.current = true;
      sessionNonceRef.current += 1;
      teardownResources();
    };
  }, [teardownResources]);

  const schedulePcmAudioChunk = useCallback(
    (base64Pcm: string) => {
      const ctx = outputCtxRef.current;
      const analyser = outputAnalyserRef.current;
      if (!ctx || !analyser || !base64Pcm) return;

      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      }

      const samples = decodePcm24kBase64ToFloat32(base64Pcm);
      if (samples.length === 0) return;

      const audioBuffer = ctx.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
      audioBuffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);

      const startAt = Math.max(ctx.currentTime + 0.02, nextPlayTimeRef.current);
      nextPlayTimeRef.current = startAt + audioBuffer.duration;

      activeSourcesRef.current.add(source);
      setIsGeminiSpeaking(true);

      source.onended = () => {
        activeSourcesRef.current.delete(source);
        try {
          source.disconnect();
        } catch {
          // Ignore
        }
        if (activeSourcesRef.current.size === 0) {
          setIsGeminiSpeaking(false);
          stopOutputMeter();
        }
      };

      source.start(startAt);
      ensureOutputMeterRunning();
    },
    [ensureOutputMeterRunning, stopOutputMeter]
  );

  const stopSession = useCallback(() => {
    isClosingRef.current = true;
    sessionNonceRef.current += 1;
    teardownResources();
    setStatus('idle');
  }, [teardownResources]);

  const startSession = useCallback(async () => {
    if (status === 'connecting' || status === 'live') return;

    const myNonce = ++sessionNonceRef.current;
    isClosingRef.current = false;
    setError(null);
    setUserTranscript('');
    setGeminiTranscript('');
    resetUserOnNextRef.current = false;
    resetGeminiOnNextRef.current = false;
    setStatus('connecting');

    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError('Microphone capture is unavailable in this browser.');
      setStatus('error');
      return;
    }

    const AudioContextCtor = getAudioContextConstructor();
    if (!AudioContextCtor) {
      setError('Web Audio API is unavailable in this browser.');
      setStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      if (isClosingRef.current || myNonce !== sessionNonceRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      // Setup 24kHz output AudioContext + analyser for synchronized waveform
      let outputCtx: AudioContext;
      try {
        outputCtx = new AudioContextCtor({ sampleRate: OUTPUT_SAMPLE_RATE });
      } catch {
        outputCtx = new AudioContextCtor();
      }
      outputCtxRef.current = outputCtx;
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume().catch(() => {});
      }

      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      analyser.connect(outputCtx.destination);
      outputAnalyserRef.current = analyser;

      // Setup capture AudioContext at native hardware rate and downsample cleanly to 16kHz
      const inputCtx = new AudioContextCtor();
      inputCtxRef.current = inputCtx;
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume().catch(() => {});
      }

      const sourceNode = inputCtx.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const processor = inputCtx.createScriptProcessor(
        INPUT_BUFFER_FRAMES,
        1,
        1
      );
      processorRef.current = processor;

      const silentGain = inputCtx.createGain();
      silentGain.gain.value = 0;
      silentGainRef.current = silentGain;

      processor.onaudioprocess = (event) => {
        if (isClosingRef.current || myNonce !== sessionNonceRef.current) return;
        const channelData = event.inputBuffer.getChannelData(0);

        let sumSq = 0;
        for (let i = 0; i < channelData.length; i++) {
          sumSq += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sumSq / Math.max(1, channelData.length));
        const target = Math.min(1, rms * 5.2);
        const smoothed = smoothedInputRef.current * 0.55 + target * 0.45;
        smoothedInputRef.current = smoothed;
        setInputLevel(smoothed < 0.008 ? 0 : smoothed);

        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const pcm16k = resampleTo16kInt16(channelData, inputCtx.sampleRate);
        const base64 = int16ToLittleEndianBase64(pcm16k);
        try {
          ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        } catch {
          // Ignore transient send errors while closing
        }
      };

      sourceNode.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(inputCtx.destination);

      // Connect WebSocket to Gemini 3.8 Live proxy
      const wsUrl = buildLiveWsUrl();
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isClosingRef.current || myNonce !== sessionNonceRef.current) {
          ws.close();
          return;
        }
        setStatus('live');
      };

      ws.onmessage = (ev) => {
        if (isClosingRef.current || myNonce !== sessionNonceRef.current) return;
        if (typeof ev.data !== 'string') return;

        let msg: IncomingLiveMessage;
        try {
          msg = JSON.parse(ev.data) as IncomingLiveMessage;
        } catch {
          return;
        }

        switch (msg.type) {
          case 'ready':
          case 'connected':
            setStatus('live');
            break;

          case 'audio':
            if (typeof msg.data === 'string' && msg.data.length > 0) {
              schedulePcmAudioChunk(msg.data);
            }
            break;

          case 'interrupted':
            // Critical barge-in: cut off every queued Gemini audio buffer immediately
            stopAllQueuedOutput();
            resetGeminiOnNextRef.current = true;
            resetUserOnNextRef.current = true;
            break;

          case 'turn_complete':
            resetGeminiOnNextRef.current = true;
            resetUserOnNextRef.current = true;
            break;

          case 'input_transcript':
            if (typeof msg.text === 'string' && msg.text.length > 0) {
              const incoming = msg.text;
              setUserTranscript((prev) => {
                if (resetUserOnNextRef.current) {
                  resetUserOnNextRef.current = false;
                  return incoming.trimStart();
                }
                return appendTranscriptChunk(prev, incoming);
              });
            }
            break;

          case 'output_transcript':
            if (typeof msg.text === 'string' && msg.text.length > 0) {
              const incoming = msg.text;
              setGeminiTranscript((prev) => {
                if (resetGeminiOnNextRef.current) {
                  resetGeminiOnNextRef.current = false;
                  return incoming.trimStart();
                }
                return appendTranscriptChunk(prev, incoming);
              });
            }
            break;

          case 'run_started':
            if (typeof msg.runId === 'string') {
              onLiveRunStartedRef.current?.(
                msg.runId,
                typeof msg.instruction === 'string' ? msg.instruction : ''
              );
            }
            break;

          case 'error': {
            const errMsg =
              msg.message || msg.error || 'Gemini Live voice session error.';
            setError(errMsg);
            teardownResources();
            setStatus('error');
            break;
          }

          default:
            break;
        }
      };

      ws.onerror = () => {
        if (isClosingRef.current || myNonce !== sessionNonceRef.current) return;
        setError('Unable to reach Live Voice WebSocket (/api/live/ws).');
        teardownResources();
        setStatus('error');
      };

      ws.onclose = (closeEv) => {
        if (isClosingRef.current || myNonce !== sessionNonceRef.current) return;
        teardownResources();
        if (closeEv.code !== 1000 && closeEv.code !== 1005) {
          setError(
            closeEv.reason ||
              `Live voice connection closed (${closeEv.code}).`
          );
          setStatus('error');
        } else {
          setStatus('idle');
        }
      };
    } catch (err) {
      teardownResources();
      setError(
        err instanceof Error
          ? err.message
          : 'Microphone permission denied or Live Voice failed to start.'
      );
      setStatus('error');
    }
  }, [
    schedulePcmAudioChunk,
    status,
    stopAllQueuedOutput,
    teardownResources,
  ]);

  const toggleSession = useCallback(() => {
    if (status === 'connecting' || status === 'live') {
      stopSession();
    } else {
      void startSession();
    }
  }, [startSession, status, stopSession]);

  const sendTextMessage = useCallback((text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;

    try {
      ws.send(JSON.stringify({ type: 'text', text: trimmed }));
      resetUserOnNextRef.current = false;
      setUserTranscript(trimmed);
      resetGeminiOnNextRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    status,
    error,
    isGeminiSpeaking,
    inputLevel,
    outputLevel,
    userTranscript,
    geminiTranscript,
    startSession,
    stopSession,
    toggleSession,
    sendTextMessage,
  };
}
