'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SSTV_MODES } from '@/lib/sstv/constants';
import type { SSTVMode } from '@/hooks/useAudioProcessor';
import { encodeSstvToPcm } from '@/lib/sstv/sstv-encode';
import { float32MonoToWavBlob } from '@/lib/float32-mono-wav';
import {
  clearSpectrogramCanvas,
  drawSpectrumFromAnalyser,
  drawSpectrogramLine,
  drawWaveformFromAnalyser,
} from '@/lib/audio-analyser-viz';
import {
  IconPlay,
  IconStop,
  IconReset,
  IconSaveDownload,
  IconPhoto,
} from '@/components/action-icons';

interface SSTVEncoderPanelProps {
  /** Same mode key as Settings / decoder (VIS + line format match). */
  encodeMode: SSTVMode;
}

function drawImageCover(ctx: CanvasRenderingContext2D, img: CanvasImageSource, cw: number, ch: number) {
  let iw: number;
  let ih: number;
  if (img instanceof HTMLImageElement) {
    iw = img.naturalWidth || img.width;
    ih = img.naturalHeight || img.height;
  } else if (img instanceof ImageBitmap) {
    iw = img.width;
    ih = img.height;
  } else if (img instanceof HTMLCanvasElement) {
    iw = img.width;
    ih = img.height;
  } else {
    iw = (img as HTMLVideoElement).videoWidth || (img as HTMLVideoElement).width;
    ih = (img as HTMLVideoElement).videoHeight || (img as HTMLVideoElement).height;
  }
  const scale = Math.max(cw / iw, ch / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const ox = (cw - dw) / 2;
  const oy = (ch - dh) / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, ox, oy, dw, dh);
}

export default function SSTVEncoderPanel({
  encodeMode,
}: SSTVEncoderPanelProps) {
  const M = SSTV_MODES[encodeMode];
  const W = M.width;
  const H = M.height;

  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [hasEncodeStarted, setHasEncodeStarted] = useState(false);
  /** True after a successful `encodeSstvToPcm` (download WAV of last encode). */
  const [canSaveAudio, setCanSaveAudio] = useState(false);
  const lastEncodedAudioRef = useRef<{ pcm: Float32Array; sampleRate: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  /** Reused for each encode playback; stays connected to destination. */
  const encodeAnalyserRef = useRef<AnalyserNode | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformHistoryRef = useRef<Float32Array[]>([]);
  const encodeVizRafRef = useRef<number | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = imageRef.current;
    if (img) {
      drawImageCover(ctx, img, W, H);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    }
  }, [encodeMode, W, H, fileName]);

  useEffect(() => {
    lastEncodedAudioRef.current = null;
    setCanSaveAudio(false);
  }, [encodeMode]);

  const onFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      setError(null);
      if (!file || !file.type.startsWith('image/')) {
        setFileName(null);
        imageRef.current = null;
        if (!file) return;
        setError('Please choose an image file (PNG, JPEG, WebP, etc.).');
        return;
      }

      const mw = SSTV_MODES[encodeMode].width;
      const mh = SSTV_MODES[encodeMode].height;

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        imageRef.current = img;
        setFileName(file.name);
        lastEncodedAudioRef.current = null;
        setCanSaveAudio(false);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        drawImageCover(ctx, img, mw, mh);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        imageRef.current = null;
        setFileName(null);
        setError('Could not load that image.');
      };
      img.src = url;
    },
    [encodeMode]
  );

  const cancelEncodeVisualization = useCallback(() => {
    if (encodeVizRafRef.current != null) {
      cancelAnimationFrame(encodeVizRafRef.current);
      encodeVizRafRef.current = null;
    }
  }, []);

  const stopPlayback = useCallback(() => {
    cancelEncodeVisualization();
    try {
      sourceRef.current?.stop();
    } catch {
      /* already stopped */
    }
    sourceRef.current = null;
    setPlaying(false);
  }, [cancelEncodeVisualization]);

  const resetEncoder = useCallback(() => {
    stopPlayback();
    setHasEncodeStarted(false);
    setError(null);
    setFileName(null);
    lastEncodedAudioRef.current = null;
    setCanSaveAudio(false);
    imageRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    waveformHistoryRef.current = [];
    const waveformCanvas = waveformCanvasRef.current;
    if (waveformCanvas) {
      const waveformCtx = waveformCanvas.getContext('2d');
      if (waveformCtx) {
        waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
      }
    }
    const spectrumCanvas = spectrumCanvasRef.current;
    if (spectrumCanvas) {
      const spectrumCtx = spectrumCanvas.getContext('2d');
      if (spectrumCtx) {
        spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
      }
    }
    const specCanvas = spectrogramCanvasRef.current;
    if (specCanvas) {
      clearSpectrogramCanvas(specCanvas);
    }
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }
    }
  }, [stopPlayback, W, H]);

  const saveEncodedWav = useCallback(() => {
    const last = lastEncodedAudioRef.current;
    if (!last) return;
    const blob = float32MonoToWavBlob(last.pcm, last.sampleRate);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    link.download = `sstv-${encodeMode.toLowerCase()}-${last.sampleRate}hz-${ts}.wav`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [encodeMode]);

  const encodeAndPlay = useCallback(async () => {
    setError(null);
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) {
      setError('Choose an image first.');
      return;
    }

    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) {
      setError('Canvas is not available.');
      return;
    }

    drawImageCover(ctx2d, img, W, H);
    const imageData = ctx2d.getImageData(0, 0, W, H);

    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      setError('Web Audio API is not supported in this browser.');
      return;
    }

    stopPlayback();

    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContextClass();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const specCanvas = spectrogramCanvasRef.current;
    if (specCanvas) {
      clearSpectrogramCanvas(specCanvas);
    }
    waveformHistoryRef.current = [];

    let analyser = encodeAnalyserRef.current;
    if (!analyser) {
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.connect(ctx.destination);
      encodeAnalyserRef.current = analyser;
    }

    try {
      const pcm = encodeSstvToPcm(imageData.data, W, H, ctx.sampleRate, encodeMode);
      lastEncodedAudioRef.current = {
        pcm: new Float32Array(pcm),
        sampleRate: ctx.sampleRate,
      };
      setHasEncodeStarted(true);
      setCanSaveAudio(true);

      const buffer = ctx.createBuffer(1, pcm.length, ctx.sampleRate);
      buffer.getChannelData(0).set(pcm);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      source.onended = () => {
        sourceRef.current = null;
        cancelEncodeVisualization();
        setPlaying(false);
      };
      sourceRef.current = source;
      setPlaying(true);
      source.start(0);
    } catch (err) {
      lastEncodedAudioRef.current = null;
      setCanSaveAudio(false);
      const message = err instanceof Error ? err.message : 'Encoding failed.';
      setError(message);
    }
  }, [stopPlayback, cancelEncodeVisualization, W, H, encodeMode]);

  useEffect(() => {
    if (!playing) return;

    const tick = () => {
      const analyser = encodeAnalyserRef.current;
      const spectrumEl = spectrumCanvasRef.current;
      const spectrogramEl = spectrogramCanvasRef.current;
      const waveformEl = waveformCanvasRef.current;

      if (analyser && spectrumEl) {
        const frequencyData = drawSpectrumFromAnalyser(spectrumEl, analyser);
        if (spectrogramEl && frequencyData) {
          drawSpectrogramLine(spectrogramEl, frequencyData);
        }
      }
      if (analyser && waveformEl) {
        drawWaveformFromAnalyser(waveformEl, analyser, waveformHistoryRef.current);
      }

      encodeVizRafRef.current = requestAnimationFrame(tick);
    };

    encodeVizRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (encodeVizRafRef.current != null) {
        cancelAnimationFrame(encodeVizRafRef.current);
        encodeVizRafRef.current = null;
      }
    };
  }, [playing]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-col gap-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={onFile}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="relative flex h-[220px] w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl bg-surface-inset text-center transition-colors hover:bg-surface-button/30"
          aria-label="Select image to encode"
        >
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="pointer-events-none absolute inset-0 m-auto max-h-full max-w-full object-contain opacity-90"
          />
          {!fileName && (
            <div className="pointer-events-none relative z-10 flex flex-col items-center gap-3 px-4 py-8">
              <div className="relative text-muted">
                <IconPhoto className="h-16 w-16 opacity-60" aria-hidden />
                <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-border bg-surface text-lg font-light text-foreground">
                  +
                </span>
              </div>
              <span className="text-sm text-muted">Tap to select image</span>
            </div>
          )}
        </button>

        <div className="grid grid-cols-3 gap-2">
          {!playing ? (
            <button
              type="button"
              onClick={() => void encodeAndPlay()}
              disabled={!fileName}
              className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-button px-1 py-2 transition-colors hover:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-40"
            >
              <IconPlay className={`h-7 w-7 ${fileName ? 'text-info' : 'text-muted'}`} aria-hidden />
              <span className={`text-[11px] font-semibold leading-tight ${fileName ? 'text-info' : 'text-muted'}`}>
                Start Encoding
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={stopPlayback}
              className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-danger/15 px-1 py-2 text-danger transition-colors hover:bg-danger/25"
            >
              <IconStop className="h-7 w-7" aria-hidden />
              <span className="text-[11px] font-semibold leading-tight">Stop</span>
            </button>
          )}
          <button
            type="button"
            onClick={saveEncodedWav}
            disabled={!hasEncodeStarted || !canSaveAudio}
            className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-button px-1 py-2 transition-colors hover:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconSaveDownload
              className={`h-7 w-7 ${canSaveAudio ? 'text-info' : 'text-muted'}`}
              aria-hidden
            />
            <span
              className={`text-[11px] font-semibold leading-tight ${canSaveAudio ? 'text-info' : 'text-muted'}`}
            >
              Export
            </span>
          </button>
          <button
            type="button"
            onClick={resetEncoder}
            disabled={!hasEncodeStarted}
            className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-button px-1 py-2 text-info transition-colors hover:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconReset className="h-7 w-7" aria-hidden />
            <span className="text-[11px] font-semibold leading-tight">Reset</span>
          </button>
        </div>

        <p className="text-center text-xs text-muted">
          {fileName ? fileName : 'Load an image to encode'}
        </p>

        {error && (
          <div className="bg-err-bg border border-err-border rounded-md p-3 text-err-text text-sm sm:text-base">
            {error}
          </div>
        )}
      </div>

      <details className="bg-surface border border-border rounded-lg">
        <summary className="list-none cursor-pointer p-3 sm:p-4 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-lg sm:text-xl font-semibold">Audio Analysis</h2>
            <span className={`text-xs sm:text-sm font-mono ${playing ? 'text-snr-good' : 'text-muted'}`}>
              {playing ? 'Playing' : 'Idle'}
            </span>
          </div>
        </summary>
        <div className="px-3 pb-3 sm:px-4 sm:pb-4">
          <div className="space-y-2">
            <h3 className="text-sm sm:text-base font-medium text-muted">Waveform</h3>
            <canvas
              ref={waveformCanvasRef}
              width={640}
              height={180}
              className="w-full border border-border rounded bg-surface-inset touch-manipulation"
            />
          </div>

          <div className="space-y-2 mt-3 sm:mt-4">
            <h3 className="text-sm sm:text-base font-medium text-muted">Spectrum</h3>
            <canvas
              ref={spectrumCanvasRef}
              width={640}
              height={200}
              className="w-full border border-border rounded bg-surface-inset touch-manipulation"
            />
          </div>

          <div className="space-y-2 mt-3 sm:mt-4">
            <h3 className="text-sm sm:text-base font-medium text-muted">Spectrogram</h3>
            <canvas
              ref={spectrogramCanvasRef}
              width={640}
              height={240}
              className="w-full border border-border rounded bg-surface-inset touch-manipulation"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
