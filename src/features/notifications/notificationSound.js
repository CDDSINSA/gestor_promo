// A short, locally generated chime. No audio downloads or additional dependencies.
export function createNotificationSound({ createContext, now = () => Date.now() } = {}) {
  let context;
  let disposed = false;
  let lastPlayed = -Infinity;
  const seen = new Set();

  const unlock = async () => {
    try {
      if (disposed) return;
      context ||= createContext?.();
      if (context?.state === "suspended") await context.resume();
    } catch { /* Browser audio restrictions must not interrupt notifications. */ }
  };

  const play = (id) => {
    if (!id || disposed || seen.has(id)) return false;
    seen.add(id);
    if (seen.size > 100) seen.delete(seen.values().next().value);
    // Do not replay historical alerts or make a burst of notifications noisy.
    if (context?.state !== "running" || now() - lastPlayed < 1500) return false;
    try {
      const start = context.currentTime;
      [660, 880].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const at = start + index * 0.13;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, at);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.07, at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at);
        oscillator.stop(at + 0.23);
      });
      lastPlayed = now();
      return true;
    } catch { return false; }
  };

  return {
    unlock, play,
    dispose() {
      disposed = true;
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
