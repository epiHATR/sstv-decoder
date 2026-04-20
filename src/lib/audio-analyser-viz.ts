/**
 * Spectrum, spectrogram, and waveform drawing for AnalyserNode (decode + encode paths).
 */

const DEFAULT_WAVEFORM_HISTORY = 300;

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function drawSpectrumFromAnalyser(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode
): Uint8Array | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  const sampleRate = analyser.context.sampleRate;
  const nyquist = sampleRate / 2;

  const axisHeight = 25;
  const plotHeight = canvas.height - axisHeight;

  ctx.fillStyle = cssVar('--viz-canvas', 'rgb(10, 10, 10)');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = cssVar('--viz-line', '#2ea043');
  ctx.lineWidth = 2;
  ctx.beginPath();

  const barWidth = canvas.width / bufferLength;
  for (let i = 0; i < bufferLength; i++) {
    const barHeight = (dataArray[i] / 255) * plotHeight;
    const x = i * barWidth;
    const y = plotHeight - barHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();

  ctx.fillStyle = cssVar('--viz-muted', '#8b949e');
  ctx.strokeStyle = cssVar('--viz-grid', '#30363d');
  ctx.lineWidth = 1;
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';

  ctx.beginPath();
  ctx.moveTo(0, plotHeight);
  ctx.lineTo(canvas.width, plotHeight);
  ctx.stroke();

  const pixelsPerLabel = 90;
  const numLabels = Math.floor(canvas.width / pixelsPerLabel);
  const freqStep = Math.ceil(nyquist / numLabels / 1000) * 1000;

  for (let freq = 0; freq <= nyquist; freq += freqStep) {
    const binIndex = Math.floor((freq / nyquist) * bufferLength);
    const xPos = (binIndex / bufferLength) * canvas.width;

    ctx.beginPath();
    ctx.moveTo(xPos, plotHeight);
    ctx.lineTo(xPos, plotHeight + 5);
    ctx.stroke();

    let label: string;
    if (freq >= 1000) {
      label = `${(freq / 1000).toFixed(1)}k`;
    } else {
      label = `${freq}`;
    }
    ctx.fillText(label, xPos, plotHeight + 18);
  }

  ctx.textAlign = 'right';
  ctx.fillText('Hz', canvas.width - 5, plotHeight + 18);

  return new Uint8Array(dataArray);
}

export function drawSpectrogramLine(canvas: HTMLCanvasElement, frequencyData: Uint8Array): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height - 1);
  ctx.putImageData(imageData, 0, 1);

  const barWidth = canvas.width / frequencyData.length;

  for (let i = 0; i < frequencyData.length; i++) {
    const value = frequencyData[i];

    let r: number;
    let g: number;
    let b: number;
    if (value < 85) {
      r = 0;
      g = 0;
      b = value * 3;
    } else if (value < 170) {
      r = 0;
      g = (value - 85) * 3;
      b = 255 - (value - 85) * 3;
    } else {
      r = (value - 170) * 3;
      g = 255;
      b = 0;
    }

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(i * barWidth, 0, Math.ceil(barWidth), 1);
  }
}

export function clearSpectrogramCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = cssVar('--viz-canvas', 'rgb(10, 10, 10)');
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function drawWaveformFromAnalyser(
  canvas: HTMLCanvasElement,
  analyser: AnalyserNode,
  history: Float32Array[],
  maxHistory: number = DEFAULT_WAVEFORM_HISTORY
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bufferLength = analyser.fftSize;
  const dataArray = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(dataArray);

  history.push(dataArray.slice());
  while (history.length > maxHistory) {
    history.shift();
  }

  if (history.length === 0) return;

  const axisHeight = 25;
  const plotHeight = canvas.height - axisHeight;

  ctx.fillStyle = cssVar('--viz-canvas', 'rgb(10, 10, 10)');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = cssVar('--viz-grid', '#30363d');
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, plotHeight / 2);
  ctx.lineTo(canvas.width, plotHeight / 2);
  ctx.stroke();

  const pixelsPerFrame = canvas.width / maxHistory;

  ctx.strokeStyle = cssVar('--viz-line', '#2ea043');
  ctx.fillStyle = cssVar('--viz-fill', 'rgba(46, 160, 67, 0.3)');
  ctx.lineWidth = 1.5;

  for (let frameIdx = 0; frameIdx < history.length; frameIdx++) {
    const frame = history[frameIdx];
    const x = frameIdx * pixelsPerFrame;
    const samplesPerPixel = Math.max(1, Math.floor(frame.length / pixelsPerFrame));

    ctx.beginPath();
    ctx.moveTo(x, plotHeight / 2);

    for (let px = 0; px < pixelsPerFrame; px++) {
      const sampleStart = Math.floor(px * samplesPerPixel);
      const sampleEnd = Math.min(sampleStart + samplesPerPixel, frame.length);

      let min = 1;
      let max = -1;

      for (let i = sampleStart; i < sampleEnd; i++) {
        const sample = frame[i];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      const xPos = x + px;
      const yMin = plotHeight / 2 - (min * plotHeight) / 2;
      const yMax = plotHeight / 2 - (max * plotHeight) / 2;

      ctx.moveTo(xPos, yMin);
      ctx.lineTo(xPos, yMax);
    }

    ctx.stroke();
  }

  ctx.fillStyle = cssVar('--viz-muted', '#8b949e');
  ctx.strokeStyle = cssVar('--viz-grid', '#30363d');
  ctx.lineWidth = 1;
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';

  ctx.beginPath();
  ctx.moveTo(0, plotHeight);
  ctx.lineTo(canvas.width, plotHeight);
  ctx.stroke();

  const fps = 30;
  const totalSeconds = maxHistory / fps;
  const secondsVisible = (history.length / maxHistory) * totalSeconds;

  const labelInterval = 2;
  const pixelsPerSecond = canvas.width / totalSeconds;
  for (let sec = 0; sec <= Math.ceil(secondsVisible); sec += labelInterval) {
    const xPos = (totalSeconds - secondsVisible + sec) * pixelsPerSecond;

    if (xPos >= 0 && xPos <= canvas.width) {
      ctx.beginPath();
      ctx.moveTo(xPos, plotHeight);
      ctx.lineTo(xPos, plotHeight + 5);
      ctx.stroke();

      const timeLabel = `-${Math.floor(secondsVisible - sec)}s`;
      ctx.fillText(timeLabel, xPos, plotHeight + 18);
    }
  }

  ctx.fillStyle = cssVar('--viz-line', '#2ea043');
  ctx.fillText('now', canvas.width - 20, plotHeight + 18);
}
