/**
 * soundService.js — Audio Notification Service
 * Plays a tactile sound when diagram generation completes,
 * notifying users even if they switched to another browser tab.
 */

const SOUND_SRC = '/sounds/diagram-generated.wav';

let cachedAudio = null;
let lastPlayTimestamp = 0;
const PLAY_COOLDOWN_MS = 1200; // prevent rapid double-fires

/**
 * Initialize or get cached Audio instance with preloaded buffer
 */
export function getAudioInstance() {
  if (typeof window === 'undefined') return null;

  if (!cachedAudio) {
    try {
      cachedAudio = new Audio(SOUND_SRC);
      cachedAudio.preload = 'auto';
      cachedAudio.volume = 0.55; // Calibrated volume: crisp, tactile, pleasing
    } catch (e) {
      console.debug('[Sound] Audio initialization skipped:', e);
      return null;
    }
  }

  return cachedAudio;
}

// Warm up / unlock audio buffer on first user gesture so browser autoplay policy allows background playback
if (typeof window !== 'undefined') {
  const primeAudio = () => {
    try {
      const audio = getAudioInstance();
      if (audio) {
        audio.load();
      }
    } catch (e) {
      // ignore
    }
    window.removeEventListener('pointerdown', primeAudio);
    window.removeEventListener('keydown', primeAudio);
    window.removeEventListener('touchstart', primeAudio);
  };
  window.addEventListener('pointerdown', primeAudio, { once: true, passive: true });
  window.addEventListener('keydown', primeAudio, { once: true, passive: true });
  window.addEventListener('touchstart', primeAudio, { once: true, passive: true });
}

/**
 * Play the diagram generated sound notification.
 * Works seamlessly whether the user is on the tab or switched to another tab.
 * 
 * @param {Object} options
 * @param {number} [options.delay=0] - Delay in ms (useful to align with visual reveal)
 * @param {number} [options.volume=0.55] - Custom volume level (0.0 to 1.0)
 */
export function playDiagramGeneratedSound({ delay = 0, volume = 0.55 } = {}) {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  if (now - lastPlayTimestamp < PLAY_COOLDOWN_MS) {
    return; // cooldown active
  }
  lastPlayTimestamp = now;

  const trigger = () => {
    try {
      const audio = getAudioInstance();
      if (!audio) return;

      audio.volume = Math.max(0, Math.min(1, volume));

      // Reset playback to start for snappy response
      audio.currentTime = 0;

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // Autoplay blocked by browser policy prior to user interaction
          console.debug('[Sound] Audio play prevented by browser:', err?.message || err);
        });
      }
    } catch (err) {
      console.debug('[Sound] Playback error:', err);
    }
  };

  // If user is on another tab (document.hidden), play immediately without visual delay
  if (typeof document !== 'undefined' && document.hidden) {
    trigger();
  } else if (delay > 0) {
    setTimeout(trigger, delay);
  } else {
    trigger();
  }
}
