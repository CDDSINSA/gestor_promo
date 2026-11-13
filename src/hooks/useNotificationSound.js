import { useEffect, useRef, useState } from "react";
import { createNotificationSound } from "../features/notifications/notificationSound";

const STORAGE_KEY = "sinsaPromo.notificationSound";

export function useNotificationSound(notification) {
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== "off"; } catch { return true; }
  });
  const playerRef = useRef(null);
  const lastNotificationRef = useRef(null);

  useEffect(() => {
    const player = createNotificationSound({ createContext: () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      return AudioContext ? new AudioContext() : null;
    } });
    playerRef.current = player;
    // Browsers require user interaction before allowing audio playback.
    const unlock = () => { void player.unlock(); };
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      player.dispose();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!notification?.id || notification.id === lastNotificationRef.current) return;
    lastNotificationRef.current = notification.id;
    if (soundEnabled) playerRef.current?.play(notification.id);
  }, [notification, soundEnabled]);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try { localStorage.setItem(STORAGE_KEY, next ? "on" : "off"); } catch { /* Session preference still works. */ }
    if (next) void playerRef.current?.unlock();
  };

  return { soundEnabled, toggleSound };
}
