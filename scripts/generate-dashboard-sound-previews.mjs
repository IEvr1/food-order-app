import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE_RATE = 44100;
const OUT_DIR = join(process.cwd(), "public/dashboard-sounds");

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  writeFileSync(filePath, buffer);
}

function renderSound(notes, durationSec, mix) {
  const totalSamples = Math.ceil(durationSec * SAMPLE_RATE);
  const output = new Float64Array(totalSamples);

  for (const note of notes) {
    const startSample = Math.floor(note.start * SAMPLE_RATE);
    const noteSamples = Math.floor(note.duration * SAMPLE_RATE);

    for (let i = 0; i < noteSamples; i += 1) {
      const sampleIndex = startSample + i;
      if (sampleIndex >= totalSamples) break;

      const t = i / SAMPLE_RATE;
      const attack = Math.min(1, t / 0.015);
      const releaseStart = Math.max(0, note.duration - 0.08);
      const release =
        t > releaseStart ? Math.max(0, 1 - (t - releaseStart) / 0.08) : 1;
      const envelope = attack * release * note.volume;

      let sample = 0;
      if (note.wave === "sine") {
        sample = Math.sin(2 * Math.PI * note.freq * t);
      } else if (note.wave === "triangle") {
        const phase = (note.freq * t) % 1;
        sample = 1 - 4 * Math.abs(phase - 0.5);
      } else if (note.wave === "bell") {
        sample =
          0.6 * Math.sin(2 * Math.PI * note.freq * t) +
          0.25 * Math.sin(2 * Math.PI * note.freq * 2.01 * t) +
          0.1 * Math.sin(2 * Math.PI * note.freq * 3.02 * t);
      }

      output[sampleIndex] += sample * envelope;
    }
  }

  return mix(output);
}

function normalize(samples, peak = 0.92) {
  const max = Math.max(...samples.map((v) => Math.abs(v)), 0.0001);
  const gain = peak / max;
  return samples.map((v) => v * gain);
}

mkdirSync(OUT_DIR, { recursive: true });

const current = renderSound(
  [
    { freq: 523.25, start: 0, duration: 0.2, volume: 0.28, wave: "sine" },
    { freq: 659.25, start: 0.13, duration: 0.2, volume: 0.28, wave: "sine" },
    { freq: 783.99, start: 0.26, duration: 0.38, volume: 0.32, wave: "sine" },
  ],
  0.75,
  (s) => normalize(Array.from(s)),
);

const brightBell = renderSound(
  [
    { freq: 880, start: 0, duration: 0.45, volume: 0.34, wave: "bell" },
    { freq: 1174.66, start: 0.18, duration: 0.55, volume: 0.3, wave: "bell" },
  ],
  0.85,
  (s) => normalize(Array.from(s)),
);

const softMarimba = renderSound(
  [
    { freq: 392, start: 0, duration: 0.22, volume: 0.38, wave: "triangle" },
    { freq: 523.25, start: 0.11, duration: 0.22, volume: 0.38, wave: "triangle" },
    { freq: 659.25, start: 0.22, duration: 0.22, volume: 0.38, wave: "triangle" },
    { freq: 783.99, start: 0.33, duration: 0.35, volume: 0.43, wave: "triangle" },
  ],
  0.8,
  (s) => normalize(Array.from(s), 0.98),
);

writeWav(join(OUT_DIR, "option-1-current-chime.wav"), current);
writeWav(join(OUT_DIR, "option-2-bright-bell.wav"), brightBell);
writeWav(join(OUT_DIR, "option-3-soft-marimba.wav"), softMarimba);

console.log("Generated:");
console.log("- public/dashboard-sounds/option-1-current-chime.wav");
console.log("- public/dashboard-sounds/option-2-bright-bell.wav");
console.log("- public/dashboard-sounds/option-3-soft-marimba.wav");
