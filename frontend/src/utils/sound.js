// Audio notification helper using Web Audio API (No external assets required, 100% reliable)
export const playNotificationSound = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Warm two-tone café chime (D5 -> A5)
    const now = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.setValueAtTime(880, now + 0.15); // A5

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.start(now);
    osc.stop(now + 0.52);
  } catch (e) {
    // Browser may require user gesture to enable AudioContext
  }
};

