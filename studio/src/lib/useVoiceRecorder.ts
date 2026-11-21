'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { transcribeVoiceAudio } from './api';
import { blobToBase64 } from './media';

export interface VoiceRecordingOutput {
  audioBase64: string;
  mimeType: string;
  transcript: string;
  latencyMs?: number;
  model?: string;
}

export function useVoiceRecorder(onRecorded?: (output: VoiceRecordingOutput) => void) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [levels, setLevels] = useState<number[]>(() => Array(14).fill(0.14));
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRecordedRef = useRef(onRecorded);

  useEffect(() => {
    onRecordedRef.current = onRecorded;
  }, [onRecorded]);

  const cleanupAudioGraph = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLevels(Array(14).fill(0.14));
  }, []);

  useEffect(() => cleanupAudioGraph, [cleanupAudioGraph]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone API unavailable in this browser context.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];
      const chosenType =
        preferredTypes.find(
          (t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)
        ) || 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType: chosenType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const mimeType = recorder.mimeType || chosenType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanupAudioGraph();
        setIsRecording(false);

        if (blob.size < 200) {
          return;
        }

        try {
          setIsTranscribing(true);
          const audioBase64 = await blobToBase64(blob);
          let transcript = '';
          let latencyMs: number | undefined;
          let model: string | undefined;

          try {
            const res = await transcribeVoiceAudio(audioBase64, mimeType);
            transcript = res.transcript?.trim() || '';
            latencyMs = res.latencyMs;
            model = res.model;
          } catch {
            // Backend will still accept raw voiceAudioBase64 inside POST /api/transform!
            transcript = '';
          }

          onRecordedRef.current?.({
            audioBase64,
            mimeType,
            transcript,
            latencyMs,
            model,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process recording');
        } finally {
          setIsTranscribing(false);
        }
      };

      // Real-time Web Audio API waveform metering
      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const ctx = new AudioContextCtor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const bars: number[] = [];
          const step = Math.max(1, Math.floor(data.length / 14));
          for (let i = 0; i < 14; i++) {
            const val = data[Math.min(data.length - 1, i * step)] / 255;
            bars.push(Math.max(0.14, Math.min(1, val * 1.35)));
          }
          setLevels(bars);
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }

      setDurationSec(0);
      timerRef.current = setInterval(() => {
        setDurationSec((s) => s + 1);
      }, 1000);

      recorder.start(120);
      setIsRecording(true);
    } catch (err) {
      cleanupAudioGraph();
      setError(
        err instanceof Error ? err.message : 'Microphone permission denied.'
      );
    }
  }, [cleanupAudioGraph]);

  const stopRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop();
    } else {
      cleanupAudioGraph();
      setIsRecording(false);
    }
  }, [cleanupAudioGraph]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    levels,
    durationSec,
    error,
    startRecording,
    stopRecording,
    toggleRecording,
  };
}
