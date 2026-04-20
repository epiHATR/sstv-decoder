'use client';

import { useEffect, useRef, useCallback, useState, type ChangeEvent } from 'react';
import { useAudioProcessor, SSTVMode } from '@/hooks/useAudioProcessor';
import { DecoderState } from '@/lib/sstv/decoder';
import {
  clearSpectrogramCanvas,
  drawSpectrumFromAnalyser,
  drawSpectrogramLine,
  drawWaveformFromAnalyser,
} from '@/lib/audio-analyser-viz';
import SSTVEncoderPanel from './SSTVEncoderPanel';
import {
  IconPlay,
  IconStop,
  IconReset,
  IconSaveDownload,
  IconDecodeTab,
  IconEncodeTab,
} from '@/components/action-icons';

export type WorkspaceTab = 'encode' | 'decode';

type DecodeInputSource = 'mic' | 'file';

interface SSTVDecoderProps {
  selectedMode: SSTVMode;
  workspaceTab: WorkspaceTab;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
  onOpenSettings: () => void;
  /** When live/file decoding is active (microphone or file playback). Used to disable the page settings control. */
  onDecodeRecordingChange?: (recording: boolean) => void;
}

export default function SSTVDecoder({
  selectedMode,
  workspaceTab,
  onWorkspaceTabChange,
  onOpenSettings,
  onDecodeRecordingChange,
}: SSTVDecoderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement>(null);
  const spectrogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const waveformHistoryRef = useRef<Float32Array[]>([]);
  const decodeFileInputRef = useRef<HTMLInputElement>(null);

  const [decodeInputSource, setDecodeInputSource] = useState<DecodeInputSource>('mic');
  const [decodeAudioFile, setDecodeAudioFile] = useState<File | null>(null);
  const [hasDecodeStarted, setHasDecodeStarted] = useState(false);
  const prevSelectedModeRef = useRef(selectedMode);

  const {
    state,
    startRecording,
    startDecodingFromFile,
    stopRecording,
    resetDecoder,
    getImageData,
    getDimensions,
    getAnalyser,
  } = useAudioProcessor(selectedMode);

  const canStartDecode =
    state.isSupported &&
    !state.isRecording &&
    (decodeInputSource === 'mic'
      ? state.canUseMicrophone
      : state.canDecodeFromFile && decodeAudioFile !== null);

  useEffect(() => {
    if (prevSelectedModeRef.current !== selectedMode) {
      prevSelectedModeRef.current = selectedMode;
      if (state.isRecording) {
        stopRecording();
      }
    }
  }, [selectedMode, state.isRecording, stopRecording]);

  useEffect(() => {
    onDecodeRecordingChange?.(state.isRecording);
  }, [state.isRecording, onDecodeRecordingChange]);

  const selectDecodeTab = useCallback(() => {
    if (state.isRecording) {
      stopRecording();
    }
    onWorkspaceTabChange('decode');
  }, [state.isRecording, stopRecording, onWorkspaceTabChange]);

  const selectEncodeTab = useCallback(() => {
    if (state.isRecording) {
      stopRecording();
    }
    onWorkspaceTabChange('encode');
  }, [state.isRecording, stopRecording, onWorkspaceTabChange]);

  // Update canvas with decoded image
  useEffect(() => {
    if (workspaceTab !== 'decode') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dimensions = getDimensions();

    // Create an offscreen canvas that matches SSTV dimensions
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = dimensions.width;
    offscreenCanvas.height = dimensions.height;
    const offscreenCtx = offscreenCanvas.getContext('2d');

    if (!offscreenCtx) return;

    // Disable image smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false;
    offscreenCtx.imageSmoothingEnabled = false;

    // Clear both canvases initially
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    offscreenCtx.fillStyle = 'black';
    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);

    let lastRenderedLine = -1;

    const updateCanvas = () => {
      const imageData = getImageData();
      const currentLine = state.stats?.currentLine ?? 0;

      // Always update to see the progressive image (even when paused)
      if (imageData && offscreenCtx) {
        // Debug: Check if we have any non-black pixels
        if (state.isRecording && currentLine > lastRenderedLine && currentLine % 10 === 0) {
          let nonBlackPixels = 0;
          for (let i = 0; i < imageData.length; i += 4) {
            if (imageData[i] > 0 || imageData[i+1] > 0 || imageData[i+2] > 0) {
              nonBlackPixels++;
            }
          }
          console.log(`Line ${currentLine}: ${nonBlackPixels} non-black pixels in imageData`);
        }

        // Create ImageData from a copy of the decoder's buffer
        const imgData = new ImageData(
          new Uint8ClampedArray(imageData),
          dimensions.width,
          dimensions.height
        );

        // Put the complete image data on the offscreen canvas
        offscreenCtx.putImageData(imgData, 0, 0);

        // Draw to main canvas without clearing (preserve all previous lines)
        ctx.drawImage(offscreenCanvas, 0, 0, canvas.width, canvas.height);

        lastRenderedLine = currentLine;
      }

      // Draw spectrum, spectrogram, and waveform only when recording
      if (state.isRecording) {
        const analyser = getAnalyser();
        const spectrumCanvas = spectrumCanvasRef.current;
        const spectrogramCanvas = spectrogramCanvasRef.current;
        const waveformCanvas = waveformCanvasRef.current;

        if (analyser && spectrumCanvas) {
          const frequencyData = drawSpectrumFromAnalyser(spectrumCanvas, analyser);

          if (spectrogramCanvas && frequencyData) {
            drawSpectrogramLine(spectrogramCanvas, frequencyData);
          }
        }

        if (analyser && waveformCanvas) {
          drawWaveformFromAnalyser(waveformCanvas, analyser, waveformHistoryRef.current);
        }
      }

      animationFrameRef.current = requestAnimationFrame(updateCanvas);
    };

    animationFrameRef.current = requestAnimationFrame(updateCanvas);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [workspaceTab, state.isRecording, state.stats?.currentLine, getImageData, getDimensions, getAnalyser]);

  const handleStart = async () => {
    if (decodeInputSource === 'file') {
      if (!decodeAudioFile) return;
      setHasDecodeStarted(true);
      await startDecodingFromFile(decodeAudioFile);
      return;
    }
    setHasDecodeStarted(true);
    await startRecording();
  };

  const handleDecodeFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setDecodeAudioFile(file ?? null);
  };

  const handleStop = () => {
    stopRecording();
  };

  const handleReset = () => {
    resetDecoder();
    setHasDecodeStarted(false);
    setDecodeAudioFile(null);
    if (decodeFileInputRef.current) {
      decodeFileInputRef.current.value = '';
    }
    waveformHistoryRef.current = [];
    const decodeCanvas = canvasRef.current;
    if (decodeCanvas) {
      const decodeCtx = decodeCanvas.getContext('2d');
      if (decodeCtx) {
        decodeCtx.fillStyle = '#000';
        decodeCtx.fillRect(0, 0, decodeCanvas.width, decodeCanvas.height);
      }
    }
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
    const spectrogramCanvas = spectrogramCanvasRef.current;
    if (spectrogramCanvas) {
      clearSpectrogramCanvas(spectrogramCanvas);
    }
  };

  const handleSaveImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create a download link
    canvas.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `sstv-decode-robot36-${timestamp}.png`;
      link.href = url;
      link.click();

      // Clean up
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const getStateColor = () => {
    if (!state.stats) return 'text-muted';
    switch (state.stats.state) {
      case DecoderState.IDLE:
        return 'text-muted';
      case DecoderState.DECODING_IMAGE:
        return 'text-snr-good';
      default:
        return 'text-muted';
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:gap-5">
        <div
          className="rounded-xl bg-surface p-1.5 shadow-sm sm:p-2"
          role="tablist"
          aria-label="SSTV workspace"
        >
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface-button p-0.5">
              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'encode'}
                id="tab-encode"
                aria-controls="panel-encode"
                onClick={selectEncodeTab}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-1.5 sm:text-sm ${
                  workspaceTab === 'encode'
                    ? 'bg-surface-inset text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <IconEncodeTab className="h-5 w-5 shrink-0 sm:h-5 sm:w-5" aria-hidden />
                <span>Encode</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={workspaceTab === 'decode'}
                id="tab-decode"
                aria-controls="panel-decode"
                onClick={selectDecodeTab}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-md px-1 py-2 text-[11px] font-semibold transition-colors sm:flex-row sm:gap-1.5 sm:text-sm ${
                  workspaceTab === 'decode'
                    ? 'bg-surface-inset text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground'
                }`}
              >
                <IconDecodeTab className="h-5 w-5 shrink-0 sm:h-5 sm:w-5" aria-hidden />
                <span>Decode</span>
              </button>
            </div>
        </div>

        {workspaceTab === 'decode' && (
          <div
            id="panel-decode"
            role="tabpanel"
            aria-labelledby="tab-decode"
            className="flex flex-col gap-4 rounded-xl bg-surface-inset p-3 sm:gap-6 sm:p-4"
          >
              <input
                ref={decodeFileInputRef}
                type="file"
                accept=".wav,.wave,.mp3,audio/wav,audio/x-wav,audio/mpeg"
                onChange={handleDecodeFilePick}
                className="hidden"
                tabIndex={-1}
                aria-hidden={decodeInputSource !== 'file'}
                aria-label="Choose WAV or MP3 file to decode"
              />

              <div
                className={`relative flex h-[220px] w-full flex-col items-center justify-center overflow-hidden rounded-2xl bg-surface-inset text-center ${
                  decodeInputSource === 'file' ? 'cursor-pointer' : ''
                }`}
                onClick={() => {
                  if (decodeInputSource === 'file') {
                    decodeFileInputRef.current?.click();
                  }
                }}
              >
                <span className="absolute right-2 top-2 z-10 font-mono text-[10px] text-muted sm:text-xs">
                  {getDimensions().width}×{getDimensions().height}
                </span>
                <canvas
                  ref={canvasRef}
                  width={getDimensions().width}
                  height={getDimensions().height}
                  className="pointer-events-none m-auto max-h-full max-w-full object-contain opacity-90 touch-manipulation"
                />
                {decodeInputSource === 'file' && !decodeAudioFile && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4">
                    <span className="rounded-md bg-surface/80 px-3 py-2 text-sm font-medium text-muted">
                      Tap to select audio file
                    </span>
                  </div>
                )}
              </div>

              <fieldset
                disabled={state.isRecording}
                className="space-y-3 rounded-lg border border-border bg-surface p-3 sm:p-4"
              >
                <legend className="px-1 text-sm font-semibold text-foreground">Audio source</legend>
                <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="decode-source"
                      checked={decodeInputSource === 'mic'}
                      onChange={() => setDecodeInputSource('mic')}
                      className="accent-primary"
                    />
                    Microphone
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="decode-source"
                      checked={decodeInputSource === 'file'}
                      onChange={() => setDecodeInputSource('file')}
                      className="accent-primary"
                    />
                    Audio file (WAV, MP3)
                    {decodeAudioFile && (
                      <span className="text-xs text-muted">
                        {decodeAudioFile.name}
                      </span>
                    )}
                  </label>
                </div>
              </fieldset>

              <div className="grid grid-cols-3 gap-2">
                {!state.isRecording ? (
                  <button
                    type="button"
                    onClick={() => void handleStart()}
                    disabled={!canStartDecode}
                    className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-button px-1 py-2 transition-colors hover:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconPlay
                      className={`h-7 w-7 ${canStartDecode ? 'text-info' : 'text-muted'}`}
                      aria-hidden
                    />
                    <span
                      className={`text-[11px] font-semibold leading-tight ${canStartDecode ? 'text-info' : 'text-muted'}`}
                    >
                      Start Decoding
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStop}
                    className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-danger/15 px-1 py-2 text-danger transition-colors hover:bg-danger/25"
                  >
                    <IconStop className="h-7 w-7" aria-hidden />
                    <span className="text-[11px] font-semibold leading-tight">Stop</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={!hasDecodeStarted}
                  className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-button px-1 py-2 text-info transition-colors hover:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconReset className="h-7 w-7" aria-hidden />
                  <span className="text-[11px] font-semibold leading-tight">Reset</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveImage}
                  disabled={!hasDecodeStarted}
                  className="flex min-h-[5.25rem] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface-button px-1 py-2 transition-colors hover:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <IconSaveDownload className="h-7 w-7 text-info" aria-hidden />
                  <span className="text-[11px] font-semibold leading-tight text-info">Export</span>
                </button>
              </div>

              <p className="text-center text-xs text-muted">
                {decodeInputSource === 'file' && !decodeAudioFile
                  ? 'Choose an audio file to decode'
                  : decodeInputSource === 'mic' && !state.canUseMicrophone
                    ? 'Microphone not available'
                    : !state.isRecording
                      ? 'Tap Start to begin'
                      : 'Decoding in progress'}
              </p>

              {state.error && (
                <div className="rounded-md border border-err-border bg-err-bg p-3 text-sm text-err-text sm:text-base">
                  {state.error}
                </div>
              )}

              {!state.isSupported && (
                <div className="rounded-md border border-warn-border bg-warn-bg p-3 text-sm text-warn-text sm:text-base">
                  Web Audio is not available in this browser, or neither microphone nor file decoding is
                  supported.
                </div>
              )}

              {state.isSupported && decodeInputSource === 'mic' && !state.canUseMicrophone && (
                <div className="rounded-md border border-warn-border bg-warn-bg p-3 text-sm text-warn-text sm:text-base">
                  Microphone access is not available (for example non-secure HTTP or blocked permissions). Select
                  &quot;Audio file&quot; above if your browser supports file decoding.
                </div>
              )}

              {state.isSupported && decodeInputSource === 'file' && !state.canDecodeFromFile && (
                <div className="rounded-md border border-warn-border bg-warn-bg p-3 text-sm text-warn-text sm:text-base">
                  Decoding from a file is not supported in this browser.
                </div>
              )}

              {state.stats && (
                <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="mb-1 text-xs text-muted sm:text-sm">State</div>
                    <div className={`font-mono text-sm font-semibold sm:text-base ${getStateColor()}`}>
                      {state.stats.state}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="mb-1 text-xs text-muted sm:text-sm">Mode</div>
                    <div className="truncate font-mono text-sm font-semibold sm:text-base">
                      {state.stats.mode}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="mb-1 text-xs text-muted sm:text-sm">Line</div>
                    <div className="font-mono text-sm font-semibold sm:text-base">
                      {state.stats.currentLine} / {state.stats.totalLines}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-3">
                    <div className="mb-1 text-xs text-muted sm:text-sm">SNR</div>
                    <div
                      className={`font-mono text-sm font-semibold sm:text-base ${
                        state.stats.snr === null
                          ? 'text-muted'
                          : state.stats.snr < 10
                            ? 'text-snr-bad'
                            : state.stats.snr < 18
                              ? 'text-snr-warn'
                              : 'text-snr-good'
                      }`}
                    >
                      {state.stats.snr !== null ? `${state.stats.snr.toFixed(1)} dB` : '-- dB'}
                    </div>
                  </div>
                </div>
              )}

              {state.stats && state.stats.progress > 0 && (
                <div className="h-2 w-full overflow-hidden rounded-full border border-border bg-surface-button">
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, state.stats.progress)}%` }}
                  />
                </div>
              )}

              <details className="rounded-lg border border-border bg-surface">
                <summary className="list-none cursor-pointer p-3 sm:p-4 [&::-webkit-details-marker]:hidden">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold sm:text-lg">Audio Analysis</h2>
                    {state.stats && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted sm:text-sm">Signal</span>
                        <div className="flex items-center gap-1">
                          {[0, 1, 2, 3, 4].map((bar) => {
                            const threshold = bar * 20;
                            const isActive = state.stats!.signalStrength > threshold;
                            const barHeight = 8 + bar * 3;
                            let barColor = 'bg-surface-button';

                            if (isActive) {
                              if (state.stats!.signalStrength < 30) {
                                barColor = 'bg-danger';
                              } else if (state.stats!.signalStrength < 60) {
                                barColor = 'bg-snr-warn';
                              } else {
                                barColor = 'bg-snr-good';
                              }
                            }

                            return (
                              <div
                                key={bar}
                                className={`w-1.5 rounded-sm transition-colors sm:w-2 ${barColor}`}
                                style={{ height: `${barHeight}px` }}
                              />
                            );
                          })}
                        </div>
                        <span className="min-w-[3ch] font-mono text-xs text-foreground sm:text-sm">
                          {state.stats.signalStrength}%
                        </span>
                      </div>
                    )}
                  </div>
                </summary>

                <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted sm:text-base">Waveform</h3>
                    <canvas
                      ref={waveformCanvasRef}
                      width={640}
                      height={180}
                      className="w-full touch-manipulation rounded border border-border bg-surface-inset"
                    />
                  </div>

                  <div className="mt-3 space-y-2 sm:mt-4">
                    <h3 className="text-sm font-medium text-muted sm:text-base">Spectrum</h3>
                    <canvas
                      ref={spectrumCanvasRef}
                      width={640}
                      height={200}
                      className="w-full touch-manipulation rounded border border-border bg-surface-inset"
                    />
                  </div>

                  <div className="mt-3 space-y-2 sm:mt-4">
                    <h3 className="text-sm font-medium text-muted sm:text-base">Spectrogram</h3>
                    <canvas
                      ref={spectrogramCanvasRef}
                      width={640}
                      height={240}
                      className="w-full touch-manipulation rounded border border-border bg-surface-inset"
                    />
                  </div>
                </div>
              </details>
          </div>
        )}

        {workspaceTab === 'encode' && (
          <div
            id="panel-encode"
            role="tabpanel"
            aria-labelledby="tab-encode"
            className="flex flex-col gap-4 rounded-xl bg-surface-inset p-3 sm:gap-6 sm:p-4"
          >
            <SSTVEncoderPanel
              encodeMode={selectedMode}
            />
          </div>
        )}

      </div>
    </div>
  );
}
