import { ANNOTATION_COLOR } from "./designPresentation";

export function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

export function stripDraftCoordinates(annotation) {
  const { startX, startY, ...clean } = annotation || {};
  return clean;
}

export function hexToRgba(hex, alpha = 0.15) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return `rgba(229,57,53,${alpha})`;
  const clean = hex.slice(1);
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function buildBoxAnnotation(tool, startPoint, endPoint, color = ANNOTATION_COLOR) {
  const startX = Number.isFinite(startPoint?.startX) ? startPoint.startX : startPoint?.x;
  const startY = Number.isFinite(startPoint?.startY) ? startPoint.startY : startPoint?.y;
  const endX = endPoint?.x ?? startX;
  const endY = endPoint?.y ?? startY;
  return {
    type: tool,
    color,
    startX,
    startY,
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

export function isUsefulAnnotation(annotation) {
  if (!annotation) return false;
  if (annotation.type === "freehand") return Array.isArray(annotation.points) && annotation.points.length > 1;
  return Number(annotation.width) > 0.008 && Number(annotation.height) > 0.008;
}

export function getAnnotationAnchor(annotation) {
  if (!annotation) return { x: 0.5, y: 0.5 };
  if (annotation.type === "freehand" && Array.isArray(annotation.points) && annotation.points.length) {
    const totals = annotation.points.reduce((acc, point) => ({ x: acc.x + clampRatio(point.x), y: acc.y + clampRatio(point.y) }), { x: 0, y: 0 });
    return { x: totals.x / annotation.points.length, y: totals.y / annotation.points.length };
  }
  return {
    x: clampRatio(annotation.x) + clampRatio(annotation.width) / 2,
    y: clampRatio(annotation.y) + clampRatio(annotation.height) / 2,
  };
}

