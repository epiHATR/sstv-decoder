import { useEffect, useRef, useState } from 'react';
import { SSTVDecoder, DecoderStats } from '@/lib/sstv/decoder';
import { SSTV_MODES } from '@/lib/sstv/constants';

export type SSTVMode = keyof typeof SSTV_MODES;

export interface AudioProcessorState {
  isRecording: boolean;
  isSupported: boolean;
  canUseMicrophone: boolean;
  canDecodeFromFile: boolean;
  error: string | null;
  stats: DecoderStats | null;
}

export function useAudioProcessor(mode: SSTVMode = 'ROBOT36') {
  const [state, setState] = useState<AudioProcessorState>({
    isRecording: false,
    isSupported: false,
    canUseMicrophone: false,
    canDecodeFromFile: false,
    error: null,
    stats: null,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const decoderRef = useRef<SSTVDecoder | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Float32Array[]>([]);

  // Check browser support on mount
  useEffect(() => {
    const checkSupport = () => {
      const hasAudioContext = typeof window !== 'undefined' && 'AudioContext' in window;
      const AC = hasAudioContext ? window.AudioContext : null;
      const canDecodeFromFile = !!(
        AC &&
        typeof AC.prototype.decodeAudioData === 'function'
      );
      const canUseMicrophone = !!(
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
      );
      const isSupported = hasAudioContext && (canDecodeFromFile || canUseMicrophone);

      setState(prev => ({
        ...prev,
        isSupported,
        canDecodeFromFile,
        canUseMicrophone,
      }));
    };

    checkSupport();
  }, []);

  function mixDecodedToMono(audioContext: AudioContext, audioBuffer: AudioBuffer): AudioBuffer {
    const n = audioBuffer.length;
    const mono = audioContext.createBuffer(1, n, audioContext.sampleRate);
    const out = mono.getChannelData(0);
    const ch = audioBuffer.numberOfChannels;
    if (ch === 1) {
      out.set(audioBuffer.getChannelData(0));
      return mono;
    }
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let c = 0; c < ch; c++) {
        sum += audioBuffer.getChannelData(c)[i];
      }
      out[i] = sum / ch;
    }
    return mono;
  }

  /**
   * Calculate Signal-to-Noise Ratio (SNR) in dB
   * Uses AnalyserNode to measure signal power in SSTV band vs noise floor
   */
  const calculateSNR = (): number | null => {
    const analyser = analyserRef.current;
    const audioContext = audioContextRef.current;
    if (!analyser || !audioContext) return null;

    // Get frequency data
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    const sampleRate = audioContext.sampleRate;
    const nyquist = sampleRate / 2;

    // SSTV signal band: 1200-2300 Hz (sync to white)
    const signalBandStart = 1200;
    const signalBandEnd = 2300;

    // Noise bands (outside SSTV signal)
    // Lower band: 300-1000 Hz (below SSTV)
    // Upper band: 2500-4000 Hz (above SSTV)
    const noiseBandLow1 = 300;
    const noiseBandLow2 = 1000;
    const noiseBandHigh1 = 2500;
    const noiseBandHigh2 = 4000;

    // Convert frequencies to bin indices
    const freqToBin = (freq: number) => Math.floor((freq / nyquist) * bufferLength);

    const signalBinStart = freqToBin(signalBandStart);
    const signalBinEnd = freqToBin(signalBandEnd);
    const noiseBinLow1 = freqToBin(noiseBandLow1);
    const noiseBinLow2 = freqToBin(noiseBandLow2);
    const noiseBinHigh1 = freqToBin(noiseBandHigh1);
    const noiseBinHigh2 = freqToBin(noiseBandHigh2);

    // Calculate average power in signal band
    let signalPower = 0;
    let signalCount = 0;
    for (let i = signalBinStart; i <= signalBinEnd; i++) {
      // Convert byte value (0-255) to linear power (squaring approximates power)
      signalPower += dataArray[i] * dataArray[i];
      signalCount++;
    }
    signalPower = signalPower / signalCount;

    // Calculate average power in noise bands
    let noisePower = 0;
    let noiseCount = 0;

    // Lower noise band
    for (let i = noiseBinLow1; i <= noiseBinLow2; i++) {
      noisePower += dataArray[i] * dataArray[i];
      noiseCount++;
    }

    // Upper noise band
    for (let i = noiseBinHigh1; i <= noiseBinHigh2; i++) {
      noisePower += dataArray[i] * dataArray[i];
      noiseCount++;
    }

    noisePower = noisePower / noiseCount;

    // Avoid division by zero and log of zero
    if (noisePower < 1) noisePower = 1;
    if (signalPower < 1) signalPower = 1;

    // Calculate SNR in dB: SNR = 10 * log10(signal_power / noise_power)
    const snrDb = 10 * Math.log10(signalPower / noisePower);

    return snrDb;
  };

  function beginAudioPipeline(audioContext: AudioContext, source: AudioNode): void {
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;
    source.connect(analyser);

    let useScriptProcessor = false;
    try {
      if (typeof audioContext.createScriptProcessor === 'function') {
        const bufferSize = 4096;
        const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
        processorNodeRef.current = processor;

        processor.onaudioprocess = (event) => {
          const inputData = event.inputBuffer.getChannelData(0);

          if (decoderRef.current) {
            decoderRef.current.processSamples(inputData);

            const stats = decoderRef.current.getStats();
            const snr = calculateSNR();
            setState(prev => ({ ...prev, stats: { ...stats, snr } }));
          }
        };

        analyser.connect(processor);
        processor.connect(audioContext.destination);
        useScriptProcessor = true;
        console.log('Using ScriptProcessorNode for audio processing');
      }
    } catch (e) {
      console.warn('ScriptProcessorNode not available, using polling fallback');
    }

    if (!useScriptProcessor) {
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0.001;
      silentGainRef.current = silentGain;
      analyser.connect(silentGain);
      silentGain.connect(audioContext.destination);

      const pollAudio = () => {
        if (!analyserRef.current || !decoderRef.current) {
          return;
        }

        const bufferLength = analyser.fftSize;
        const dataArray = new Float32Array(bufferLength);
        analyser.getFloatTimeDomainData(dataArray);

        decoderRef.current.processSamples(dataArray);

        const stats = decoderRef.current.getStats();
        const snr = calculateSNR();
        setState(prev => ({ ...prev, stats: { ...stats, snr } }));

        animationFrameRef.current = requestAnimationFrame(pollAudio);
      };

      console.log('Using requestAnimationFrame polling for audio processing (Safari-compatible)');
      animationFrameRef.current = requestAnimationFrame(pollAudio);
    }

    decoderRef.current = new SSTVDecoder(audioContext.sampleRate, mode);
    decoderRef.current.start();
  }

  const startRecording = async () => {
    try {
      const hasAudioContext = typeof window !== 'undefined' && 'AudioContext' in window;
      const hasMediaDevices = typeof navigator !== 'undefined' &&
                              navigator.mediaDevices &&
                              typeof navigator.mediaDevices.getUserMedia === 'function';

      if (!hasAudioContext || !hasMediaDevices) {
        throw new Error('Microphone capture is not available in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      console.log(`AudioContext created with sample rate: ${audioContext.sampleRate} Hz`);

      await audioContext.resume();

      const source = audioContext.createMediaStreamSource(stream);
      beginAudioPipeline(audioContext, source);

      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
      }));

    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to access microphone';
      setState(prev => ({
        ...prev,
        error,
        isRecording: false,
      }));
    }
  };

  const startDecodingFromFile = async (file: File) => {
    try {
      const hasAudioContext = typeof window !== 'undefined' && 'AudioContext' in window;
      if (!hasAudioContext) {
        throw new Error('Web Audio API is not available in this browser');
      }
      const Ctx = window.AudioContext;
      if (typeof Ctx.prototype.decodeAudioData !== 'function') {
        throw new Error('This browser cannot decode audio files for playback');
      }

      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      await audioContext.resume();

      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      } catch {
        throw new Error(
          'Could not decode this file. Try WAV or MP3, or re-encode the file.'
        );
      }

      const mono = mixDecodedToMono(audioContext, audioBuffer);

      const bufferSource = audioContext.createBufferSource();
      bufferSource.buffer = mono;
      bufferSourceRef.current = bufferSource;

      beginAudioPipeline(audioContext, bufferSource);

      let ended = false;
      bufferSource.onended = () => {
        if (ended) return;
        ended = true;
        stopRecording();
      };

      bufferSource.start(0);

      setState(prev => ({
        ...prev,
        isRecording: true,
        error: null,
      }));
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to decode audio file';
      setState(prev => ({
        ...prev,
        error,
        isRecording: false,
      }));
      stopRecording();
    }
  };

  const stopRecording = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (bufferSourceRef.current) {
      bufferSourceRef.current.onended = null;
      try {
        bufferSourceRef.current.stop(0);
      } catch {
        // already stopped
      }
      try {
        bufferSourceRef.current.disconnect();
      } catch {
        /* ignore */
      }
      bufferSourceRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current = null;
    }

    if (silentGainRef.current) {
      try {
        silentGainRef.current.disconnect();
      } catch {
        /* ignore */
      }
      silentGainRef.current = null;
    }

    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (decoderRef.current) {
      decoderRef.current.stop();
    }

    setState(prev => ({
      ...prev,
      isRecording: false,
    }));
  };

  const resetDecoder = () => {
    if (decoderRef.current) {
      decoderRef.current.reset();
      if (state.isRecording) {
        decoderRef.current.start();
      }
      // Clear stats when explicitly resetting
      setState(prev => ({
        ...prev,
        stats: null,
      }));
    }
  };

  const getImageData = (): Uint8ClampedArray | null => {
    return decoderRef.current ? decoderRef.current.getImageData() : null;
  };

  const getDimensions = () => {
    if (decoderRef.current) {
      return decoderRef.current.getDimensions();
    }
    // Return dimensions based on current mode
    const modeConfig = SSTV_MODES[mode];
    return { width: modeConfig.width, height: modeConfig.height };
  };

  const getAnalyser = (): AnalyserNode | null => {
    return analyserRef.current;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, []);

  return {
    state,
    startRecording,
    startDecodingFromFile,
    stopRecording,
    resetDecoder,
    getImageData,
    getDimensions,
    getAnalyser,
  };
}
