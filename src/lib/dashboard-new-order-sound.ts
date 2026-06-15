let audioContext: AudioContext | null = null;
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

function playTone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  volume = 0.28,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
}

/** Short three-note chime for incoming orders. */
export async function playNewOrderChime(): Promise<void> {
  const ctx = await getAudioContext();
  if (!ctx) return;

  const t0 = ctx.currentTime + 0.02;
  playTone(ctx, 523.25, t0, 0.2);
  playTone(ctx, 659.25, t0 + 0.13, 0.2);
  playTone(ctx, 783.99, t0 + 0.26, 0.38, 0.32);
}

/** Browsers block audio until the user interacts with the page. */
export function unlockDashboardAudio(): void {
  if (typeof window === "undefined" || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    void getAudioContext();
  };

  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}
