/**
 * Multi-mode SSTV encoder: RGBA image → mono PCM (same timing families as line decoders).
 */

import {
  FREQ_SYNC,
  FREQ_BLACK,
  FREQ_WHITE,
  FREQ_VIS_BIT0,
  FREQ_VIS_BIT1,
  FREQ_VIS_START,
  FREQ_VIS_STOP,
  SSTV_MODES,
} from './constants';

export type SstvEncodeMode = keyof typeof SSTV_MODES;

const SEPARATOR_HZ = 1900;
const PORCH_SHORT_MS = 1.5;
const VIS_MS =
  300 + 10 + 30 + 7 * 30 + 30 + 30;

function rgbToYuv(r: number, g: number, b: number): { y: number; cb: number; cr: number } {
  const y = ((66 * r + 129 * g + 25 * b + 128) >> 8) + 16;
  const cb = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
  const cr = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
  return {
    y: Math.max(16, Math.min(235, y)),
    cb: Math.max(0, Math.min(255, cb)),
    cr: Math.max(0, Math.min(255, cr)),
  };
}

function yToLevel(y: number): number {
  return Math.max(0, Math.min(255, ((y - 16) / 219) * 255));
}

function chromaToLevel(c: number): number {
  return Math.max(0, Math.min(255, c));
}

function levelToFreq(level: number): number {
  return FREQ_BLACK + (level / 255) * (FREQ_WHITE - FREQ_BLACK);
}

function rgbLevel(c: number): number {
  return Math.max(0, Math.min(255, Math.round(c)));
}

function visParity7(code: number): number {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    if ((code >> i) & 1) n++;
  }
  return n & 1;
}

function writeTone(
  out: Float32Array,
  offset: number,
  durationMs: number,
  freq: number,
  sampleRate: number,
  phase: { p: number },
  amplitude: number
): number {
  const n = Math.round((durationMs / 1000) * sampleRate);
  const w = (2 * Math.PI * freq) / sampleRate;
  for (let i = 0; i < n; i++) {
    out[offset + i] = amplitude * Math.sin(phase.p);
    phase.p += w;
  }
  return n;
}

function writePixelRun(
  out: Float32Array,
  offset: number,
  durationMs: number,
  levels: Uint8Array,
  sampleRate: number,
  phase: { p: number },
  amplitude: number
): number {
  const totalSamples = Math.round((durationMs / 1000) * sampleRate);
  const pixels = levels.length;
  if (pixels === 0) return 0;
  let written = 0;
  for (let px = 0; px < pixels; px++) {
    const freq = levelToFreq(levels[px]);
    const segEnd = Math.round(((px + 1) / pixels) * totalSamples);
    const segStart = Math.round((px / pixels) * totalSamples);
    const segLen = Math.max(1, segEnd - segStart);
    const w = (2 * Math.PI * freq) / sampleRate;
    for (let i = 0; i < segLen; i++) {
      out[offset + written + i] = amplitude * Math.sin(phase.p);
      phase.p += w;
    }
    written += segLen;
  }
  const pad = totalSamples - written;
  if (pad > 0) {
    const freq = levelToFreq(levels[pixels - 1]);
    const w = (2 * Math.PI * freq) / sampleRate;
    for (let i = 0; i < pad; i++) {
      out[offset + written + i] = amplitude * Math.sin(phase.p);
      phase.p += w;
    }
    written += pad;
  }
  return written;
}

/** Standard SSTV VIS preamble (leader, break, start, 7 bits, parity, stop). */
export function appendVisHeader(
  out: Float32Array,
  startOffset: number,
  sampleRate: number,
  visCode: number,
  phase: { p: number },
  amplitude = 0.35
): number {
  let o = startOffset;
  o += writeTone(out, o, 300, 1900, sampleRate, phase, amplitude);
  o += writeTone(out, o, 10, FREQ_SYNC, sampleRate, phase, amplitude);
  o += writeTone(out, o, 30, FREQ_VIS_START, sampleRate, phase, amplitude);
  for (let i = 0; i < 7; i++) {
    const bit = (visCode >> i) & 1;
    o += writeTone(out, o, 30, bit ? FREQ_VIS_BIT1 : FREQ_VIS_BIT0, sampleRate, phase, amplitude);
  }
  const pbit = visParity7(visCode);
  o += writeTone(out, o, 30, pbit ? FREQ_VIS_BIT1 : FREQ_VIS_BIT0, sampleRate, phase, amplitude);
  o += writeTone(out, o, 30, FREQ_VIS_STOP, sampleRate, phase, amplitude);
  return o - startOffset;
}

function totalImageDurationMs(mode: SstvEncodeMode): number {
  const M = SSTV_MODES[mode];
  if (mode === 'PD120' || mode === 'PD160' || mode === 'PD180') {
    const lineMs = M.syncPulse + M.syncPorch + 4 * M.colorScanTimes![0];
    return (M.height / 2) * lineMs;
  }
  if (mode === 'SCOTTIE_S1' || mode === 'SCOTTIE_S2') {
    const ch = M.colorScanTimes![0];
    const sep = M.separatorPulse;
    const firstMs = M.syncPulse + sep + ch + sep + ch + M.syncPulse + sep + ch;
    const regularMs = M.syncPulse + ch + sep + ch + sep + ch;
    return firstMs + (M.height - 1) * regularMs;
  }
  return M.height * M.scanTime;
}

export function estimateEncodedSamples(sampleRate: number, mode: SstvEncodeMode): number {
  return Math.ceil((sampleRate / 1000) * (VIS_MS + totalImageDurationMs(mode))) + sampleRate * 2;
}

function encodeRobot36(
  rgba: Uint8ClampedArray,
  sampleRate: number,
  out: Float32Array,
  phase: { p: number },
  amp: number
): number {
  const M = SSTV_MODES.ROBOT36;
  let o = 0;
  o += appendVisHeader(out, o, sampleRate, M.visCode, phase, amp);
  const yLevels = new Uint8Array(M.width);
  const cLevels = new Uint8Array(M.width);
  for (let row = 0; row < M.height; row++) {
    const even = row % 2 === 0;
    o += writeTone(out, o, M.syncPulse, FREQ_SYNC, sampleRate, phase, amp);
    o += writeTone(out, o, M.syncPorch, M.porchFreq, sampleRate, phase, amp);
    for (let x = 0; x < M.width; x++) {
      const i = (row * M.width + x) * 4;
      const { y, cb, cr } = rgbToYuv(rgba[i], rgba[i + 1], rgba[i + 2]);
      yLevels[x] = Math.round(yToLevel(y));
      cLevels[x] = Math.round(even ? chromaToLevel(cr) : chromaToLevel(cb));
    }
    o += writePixelRun(out, o, M.colorScanTimes![0], yLevels, sampleRate, phase, amp);
    o += writeTone(out, o, M.separatorPulse, even ? FREQ_BLACK : FREQ_WHITE, sampleRate, phase, amp);
    o += writeTone(out, o, PORCH_SHORT_MS, SEPARATOR_HZ, sampleRate, phase, amp);
    o += writePixelRun(out, o, M.colorScanTimes![1], cLevels, sampleRate, phase, amp);
  }
  return o;
}

function encodeRobot72(
  rgba: Uint8ClampedArray,
  sampleRate: number,
  out: Float32Array,
  phase: { p: number },
  amp: number
): number {
  const M = SSTV_MODES.ROBOT72;
  let o = 0;
  o += appendVisHeader(out, o, sampleRate, M.visCode, phase, amp);
  const yLevels = new Uint8Array(M.width);
  const vLevels = new Uint8Array(M.width);
  const uLevels = new Uint8Array(M.width);
  const yMs = M.colorScanTimes![0];
  const cMs = M.colorScanTimes![1];
  for (let row = 0; row < M.height; row++) {
    o += writeTone(out, o, M.syncPulse, FREQ_SYNC, sampleRate, phase, amp);
    o += writeTone(out, o, M.syncPorch, M.porchFreq, sampleRate, phase, amp);
    for (let x = 0; x < M.width; x++) {
      const i = (row * M.width + x) * 4;
      const { y, cb, cr } = rgbToYuv(rgba[i], rgba[i + 1], rgba[i + 2]);
      yLevels[x] = Math.round(yToLevel(y));
      vLevels[x] = Math.round(chromaToLevel(cr));
      uLevels[x] = Math.round(chromaToLevel(cb));
    }
    o += writePixelRun(out, o, yMs, yLevels, sampleRate, phase, amp);
    o += writeTone(out, o, M.separatorPulse, SEPARATOR_HZ, sampleRate, phase, amp);
    o += writeTone(out, o, PORCH_SHORT_MS, SEPARATOR_HZ, sampleRate, phase, amp);
    o += writePixelRun(out, o, cMs, vLevels, sampleRate, phase, amp);
    o += writeTone(out, o, M.separatorPulse, SEPARATOR_HZ, sampleRate, phase, amp);
    o += writeTone(out, o, PORCH_SHORT_MS, SEPARATOR_HZ, sampleRate, phase, amp);
    o += writePixelRun(out, o, cMs, uLevels, sampleRate, phase, amp);
  }
  return o;
}

function encodePdDual(
  rgba: Uint8ClampedArray,
  sampleRate: number,
  mode: 'PD120' | 'PD160' | 'PD180',
  out: Float32Array,
  phase: { p: number },
  amp: number
): number {
  const M = SSTV_MODES[mode];
  const chMs = M.colorScanTimes![0];
  const scanLines = M.height / 2;
  let o = 0;
  o += appendVisHeader(out, o, sampleRate, M.visCode, phase, amp);
  const yEven = new Uint8Array(M.width);
  const yOdd = new Uint8Array(M.width);
  const vAvg = new Uint8Array(M.width);
  const uAvg = new Uint8Array(M.width);
  for (let s = 0; s < scanLines; s++) {
    const re = 2 * s;
    const ro = 2 * s + 1;
    for (let x = 0; x < M.width; x++) {
      const ie = (re * M.width + x) * 4;
      const io = (ro * M.width + x) * 4;
      const ye = rgbToYuv(rgba[ie], rgba[ie + 1], rgba[ie + 2]);
      const yo = rgbToYuv(rgba[io], rgba[io + 1], rgba[io + 2]);
      yEven[x] = Math.round(yToLevel(ye.y));
      yOdd[x] = Math.round(yToLevel(yo.y));
      const cr = (ye.cr + yo.cr) / 2;
      const cb = (ye.cb + yo.cb) / 2;
      vAvg[x] = Math.round(chromaToLevel(cr));
      uAvg[x] = Math.round(chromaToLevel(cb));
    }
    o += writeTone(out, o, M.syncPulse, FREQ_SYNC, sampleRate, phase, amp);
    o += writeTone(out, o, M.syncPorch, M.porchFreq, sampleRate, phase, amp);
    o += writePixelRun(out, o, chMs, yEven, sampleRate, phase, amp);
    o += writePixelRun(out, o, chMs, vAvg, sampleRate, phase, amp);
    o += writePixelRun(out, o, chMs, uAvg, sampleRate, phase, amp);
    o += writePixelRun(out, o, chMs, yOdd, sampleRate, phase, amp);
  }
  return o;
}

function encodeScottie(
  rgba: Uint8ClampedArray,
  sampleRate: number,
  mode: 'SCOTTIE_S1' | 'SCOTTIE_S2',
  out: Float32Array,
  phase: { p: number },
  amp: number
): number {
  const M = SSTV_MODES[mode];
  const chMs = M.colorScanTimes![0];
  const sepMs = M.separatorPulse;
  const w = M.width;
  const h = M.height;
  let o = 0;
  o += appendVisHeader(out, o, sampleRate, M.visCode, phase, amp);

  const rLv = new Uint8Array(w);
  const gLv = new Uint8Array(w);
  const bLv = new Uint8Array(w);

  const lineRgbs = (row: number) => {
    for (let x = 0; x < w; x++) {
      const i = (row * w + x) * 4;
      rLv[x] = rgbLevel(rgba[i]);
      gLv[x] = rgbLevel(rgba[i + 1]);
      bLv[x] = rgbLevel(rgba[i + 2]);
    }
  };

  for (let row = 0; row < h; row++) {
    if (row === 0) {
      lineRgbs(0);
      o += writeTone(out, o, M.syncPulse, FREQ_SYNC, sampleRate, phase, amp);
      o += writeTone(out, o, sepMs, FREQ_BLACK, sampleRate, phase, amp);
      o += writePixelRun(out, o, chMs, gLv, sampleRate, phase, amp);
      o += writeTone(out, o, sepMs, FREQ_BLACK, sampleRate, phase, amp);
      o += writePixelRun(out, o, chMs, bLv, sampleRate, phase, amp);
      o += writeTone(out, o, M.syncPulse, FREQ_SYNC, sampleRate, phase, amp);
      o += writeTone(out, o, sepMs, FREQ_BLACK, sampleRate, phase, amp);
      o += writePixelRun(out, o, chMs, rLv, sampleRate, phase, amp);
    } else {
      lineRgbs(row);
      o += writeTone(out, o, M.syncPulse, FREQ_SYNC, sampleRate, phase, amp);
      o += writePixelRun(out, o, chMs, rLv, sampleRate, phase, amp);
      o += writeTone(out, o, sepMs, FREQ_BLACK, sampleRate, phase, amp);
      o += writePixelRun(out, o, chMs, gLv, sampleRate, phase, amp);
      o += writeTone(out, o, sepMs, FREQ_BLACK, sampleRate, phase, amp);
      o += writePixelRun(out, o, chMs, bLv, sampleRate, phase, amp);
    }
  }
  return o;
}

/**
 * Encode full SSTV transmission for the given settings mode.
 * @param rgba Row-major RGBA, length width×height×4
 */
export function encodeSstvToPcm(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  sampleRate: number,
  mode: SstvEncodeMode
): Float32Array {
  const M = SSTV_MODES[mode];
  if (width !== M.width || height !== M.height) {
    throw new Error(`${M.name} requires ${M.width}×${M.height} image`);
  }

  const total = estimateEncodedSamples(sampleRate, mode);
  const out = new Float32Array(total);
  const phase = { p: 0 };
  const amp = 0.35;

  let written: number;
  switch (mode) {
    case 'ROBOT36':
      written = encodeRobot36(rgba, sampleRate, out, phase, amp);
      break;
    case 'ROBOT72':
      written = encodeRobot72(rgba, sampleRate, out, phase, amp);
      break;
    case 'PD120':
      written = encodePdDual(rgba, sampleRate, 'PD120', out, phase, amp);
      break;
    case 'PD160':
      written = encodePdDual(rgba, sampleRate, 'PD160', out, phase, amp);
      break;
    case 'PD180':
      written = encodePdDual(rgba, sampleRate, 'PD180', out, phase, amp);
      break;
    case 'SCOTTIE_S1':
      written = encodeScottie(rgba, sampleRate, 'SCOTTIE_S1', out, phase, amp);
      break;
    case 'SCOTTIE_S2':
      written = encodeScottie(rgba, sampleRate, 'SCOTTIE_S2', out, phase, amp);
      break;
    default:
      throw new Error(`Unsupported mode: ${String(mode)}`);
  }

  return out.subarray(0, written);
}

/** @deprecated Use encodeSstvToPcm(..., 'ROBOT36') */
export function encodeRobot36ToPcm(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  sampleRate: number
): Float32Array {
  return encodeSstvToPcm(rgba, width, height, sampleRate, 'ROBOT36');
}

export function estimateRobot36EncodedSamples(sampleRate: number): number {
  return estimateEncodedSamples(sampleRate, 'ROBOT36');
}
