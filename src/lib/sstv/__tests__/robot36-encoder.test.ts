import { SSTV_MODES } from '../constants';
import {
  encodeRobot36ToPcm,
  encodeSstvToPcm,
  estimateEncodedSamples,
  estimateRobot36EncodedSamples,
  appendVisHeader,
} from '../robot36-encoder';

describe('robot36-encoder', () => {
  const sr = 44100;
  const w = SSTV_MODES.ROBOT36.width;
  const h = SSTV_MODES.ROBOT36.height;

  it('encodeSstvToPcm Robot72 matches dimensions and returns audio', () => {
    const rw = SSTV_MODES.ROBOT72.width;
    const rh = SSTV_MODES.ROBOT72.height;
    const rgba = new Uint8ClampedArray(rw * rh * 4);
    rgba.fill(255);
    const pcm = encodeSstvToPcm(rgba, rw, rh, sr, 'ROBOT72');
    expect(pcm.length).toBeLessThanOrEqual(estimateEncodedSamples(sr, 'ROBOT72'));
    expect(pcm.length).toBeGreaterThan(sr * 60);
  });

  it('encodeRobot36ToPcm produces expected duration (~VIS + 240 lines)', () => {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = 40;
      rgba[i + 1] = 120;
      rgba[i + 2] = 200;
      rgba[i + 3] = 255;
    }
    const pcm = encodeRobot36ToPcm(rgba, w, h, sr);
    const expectedMin = Math.floor(sr * 35);
    const expectedMax = Math.ceil(sr * 40);
    expect(pcm.length).toBeGreaterThan(expectedMin);
    expect(pcm.length).toBeLessThan(expectedMax);
    expect(pcm.length).toBeLessThanOrEqual(estimateRobot36EncodedSamples(sr));
  });

  it('appendVisHeader writes without overflowing buffer', () => {
    const buf = new Float32Array(estimateRobot36EncodedSamples(sr));
    const phase = { p: 0 };
    const n = appendVisHeader(buf, 0, sr, SSTV_MODES.ROBOT36.visCode, phase, 0.3);
    expect(n).toBeGreaterThan(sr / 2);
    expect(n).toBeLessThan(sr * 2);
    let maxAbs = 0;
    for (let i = 0; i < n; i++) maxAbs = Math.max(maxAbs, Math.abs(buf[i]));
    expect(maxAbs).toBeGreaterThan(0.01);
  });
});
