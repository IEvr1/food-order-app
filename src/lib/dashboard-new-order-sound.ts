const SOUND_SRC = "/dashboard-sounds/option-3-soft-marimba.wav";

let audio: HTMLAudioElement | null = null;
let unlockListenersAttached = false;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    audio = new Audio(SOUND_SRC);
    audio.preload = "auto";
  }
  return audio;
}

/** Soft marimba chime for incoming orders. */
export async function playNewOrderChime(): Promise<void> {
  const clip = getAudio();
  if (!clip) return;

  clip.currentTime = 0;
  try {
    await clip.play();
  } catch {
    // Blocked until the user interacts with the page.
  }
}

/** Browsers block audio until the user interacts with the page. */
export function unlockDashboardAudio(): void {
  if (typeof window === "undefined" || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const unlock = () => {
    const clip = getAudio();
    if (!clip) return;
    clip.volume = 1;
    void clip.play()
      .then(() => {
        clip.pause();
        clip.currentTime = 0;
      })
      .catch(() => undefined);
  };

  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });
}
