/** Build a mono 16-bit PCM WAV `Blob` from float samples in [-1, 1]. */
export function float32MonoToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const numFrames = samples.length;
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      v.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, byteRate, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  v.setUint32(40, dataSize, true);

  const pcm = new Int16Array(buffer, 44, numFrames);
  for (let i = 0; i < numFrames; i++) {
    const x = Math.max(-1, Math.min(1, samples[i]));
    pcm[i] = Math.round(x < 0 ? x * 0x8000 : x * 0x7fff);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}
