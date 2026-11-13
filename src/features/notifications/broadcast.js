export const BROADCAST_TITLE_LIMIT = 100;
export const BROADCAST_MESSAGE_LIMIT = 1000;

export function createBroadcastRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // getRandomValues also works on internal HTTP development hosts.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function validateBroadcast(title, message) {
  if (!title.trim() || !message.trim()) return "Escriba un asunto y un mensaje.";
  if (title.trim().length > BROADCAST_TITLE_LIMIT || message.trim().length > BROADCAST_MESSAGE_LIMIT) return "El asunto o el mensaje supera el límite permitido.";
  return "";
}
