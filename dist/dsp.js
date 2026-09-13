export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const dbToGain = db => 10 ** (db / 20);

// YIN difference function with cumulative mean normalization. Clean input only.
export function detectPitch(samples, sampleRate, minHz = 55, maxHz = 1400) {
  let energy = 0;
  for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i];
  if (Math.sqrt(energy / samples.length) < 0.006) return null;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(samples.length / 2) - 1);
  const differences = new Float32Array(maxLag + 1);
  const window = samples.length - maxLag;
  let sum = 0;
  differences[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    let difference = 0;
    for (let i = 0; i < window; i++) {
      const delta = samples[i] - samples[i + lag];
      difference += delta * delta;
    }
    sum += difference;
    differences[lag] = sum ? difference * lag / sum : 1;
  }
  let lag = minLag;
  for (; lag < maxLag; lag++) {
    if (differences[lag] < 0.14) {
      while (lag + 1 < maxLag && differences[lag + 1] < differences[lag]) lag++;
      break;
    }
  }
  if (lag >= maxLag) return null;
  const a = differences[lag - 1], b = differences[lag], c = differences[lag + 1];
  const denominator = 2 * (2 * b - a - c);
  const refinedLag = lag + (denominator ? (c - a) / denominator : 0);
  const frequency = sampleRate / refinedLag;
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return { frequency, midi, cents: 1200 * Math.log2(frequency / (440 * 2 ** ((midi - 69) / 12))), confidence: 1 - b };
}

export function makeCurve(model = 'clean', size = 4096) {
  const curve = new Float32Array(size);
  const hardness = { clean: 1.2, chime: 1.8, crunch: 2.5, lead: 3.4, overdrive: 2.2 }[model] || 1.2;
  const asymmetry = model === 'chime' ? 0.12 : model === 'crunch' ? 0.07 : 0;
  const offset = Math.tanh(hardness * asymmetry);
  for (let i = 0; i < size; i++) {
    const x = i * 2 / (size - 1) - 1;
    curve[i] = (Math.tanh(hardness * (x + asymmetry)) - offset) / (1 + Math.abs(offset));
  }
  return curve;
}

// Seeded, decaying noise models a diffuse room; this is not a measured cabinet IR.
export function createRoomImpulse(context, seconds, tone = 55) {
  const frames = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, frames, context.sampleRate);
  let seed = 47831;
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let filtered = 0;
    const alpha = 0.08 + tone / 100 * 0.65;
    for (let i = 0; i < frames; i++) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      filtered += alpha * (seed / 2147483648 - 1 - filtered);
      const t = i / context.sampleRate;
      data[i] = filtered * Math.exp(-6.9 * t / seconds) * Math.min(1, t / 0.008);
    }
  }
  return buffer;
}

// A plucked-string synthesis demo, generated entirely on this device.
export function createDemoRiff(context) {
  const duration = 8;
  const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
  const data = buffer.getChannelData(0);
  const notes = [82.4069, 0, 123.4708, 164.8138, 0, 146.8324, 110, 0, 82.4069, 123.4708, 164.8138, 195.9977, 164.8138, 123.4708, 110, 0];
  let seed = 21;
  notes.forEach((hz, step) => {
    if (!hz) return;
    const ring = new Float32Array(Math.round(context.sampleRate / hz));
    for (let i = 0; i < ring.length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; ring[i] = (seed / 2147483648 - 1) * 0.5; }
    const start = Math.floor(step * 0.5 * context.sampleRate);
    let cursor = 0;
    for (let i = start; i < Math.min(start + context.sampleRate * 1.4, data.length); i++) {
      const sample = ring[cursor];
      ring[cursor] = (sample + ring[(cursor + 1) % ring.length]) * 0.496;
      cursor = (cursor + 1) % ring.length;
      data[i] += sample * Math.min(1, (i - start) / 90);
    }
  });
  return buffer;
}
