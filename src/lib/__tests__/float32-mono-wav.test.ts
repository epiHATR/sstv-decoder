import { float32MonoToWavBlob } from '../float32-mono-wav';

describe('float32MonoToWavBlob', () => {
  it('produces a WAV blob with expected size', () => {
    const samples = new Float32Array(1000);
    samples.fill(0.1);
    const blob = float32MonoToWavBlob(samples, 44100);
    expect(blob.type).toMatch(/wav/);
    expect(blob.size).toBe(44 + 1000 * 2);
  });
});
