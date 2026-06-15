const SOUND_SRC = "/dashboard-sounds/option-3-soft-marimba.wav";
const PLAYBACK_GAIN = 1.15;

let audioContext: AudioContext | null = null;
let soundBuffer: AudioBuffer | null = null;
let bufferPromise: Promise<AudioBuffer | null> | null = null;
let unlockListenersAttached = false;

async function getAudioContext(): Promise<AudioContext | null> {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  return audioContext;
}

async function getSoundBuffer(): Promise<AudioBuffer | null> {
  if (soundBuffer) return soundBuffer;
  if (!bufferPromise) {
    bufferPromise = (async () => {
      const ctx = await getAudioContext();
      if (!ctx) return null;
      const response = await fetch(SOUND_SRC);
      const arrayBuffer = await response.arrayBuffer();
      soundBuffer = await ctx.decodeAudioData(arrayBuffer);
      return soundBuffer;
    })();
  }
  return bufferPromise;
}

/** Soft marimba chime for incoming orders. */
export async function playNewOrderChime(): Promise<void> {
  const ctx = await getAudioContext();
  const buffer = await getSoundBuffer();
  if (!ctx || !buffer) return;

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = PLAYBACK_GAIN;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

/** Browsers block audio until the user interacts with the page. */
export function unlockDashboardAudio(): void {
  if (typeof window === "undefined" || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    void getAudioContext();
    void getSoundBuffer();
  };

  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}
