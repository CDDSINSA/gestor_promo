import React from "react";
import { classNames } from "../../utils/common";
import { ANNOTATION_COLOR, CATEGORY_COLORS } from "./designPresentation";
import { clampRatio, hexToRgba, getAnnotationAnchor } from "./annotationGeometry";

export function renderAnnotation(annotation, key, className = "", eventProps = {}) {
  if (!annotation) return null;
  const color = annotation.color || CATEGORY_COLORS[annotation.commentType] || ANNOTATION_COLOR;
  const title = annotation.commentText
    ? `${annotation.commentIndex ? `#${annotation.commentIndex} ` : ""}${annotation.commentType || "comentario"}: ${annotation.commentText}`
    : "";
  const anchor = getAnnotationAnchor(annotation);
  const pinRadius = 0.017;

  let shape = null;
  if (annotation.type === "freehand") {
    const points = Array.isArray(annotation.points)
      ? annotation.points.map((point) => `${clampRatio(point.x)},${clampRatio(point.y)}`).join(" ")
      : "";
    if (!points) return null;
    shape = <polyline className="annotation-shape" points={points} fill="none" stroke={color} strokeWidth="0.006" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">{title && <title>{title}</title>}</polyline>;
  } else {
    const x = clampRatio(annotation.x);
    const y = clampRatio(annotation.y);
    const width = clampRatio(annotation.width);
    const height = clampRatio(annotation.height);
    if (!width || !height) return null;
    const fillColor = hexToRgba(color, 0.16);
    if (annotation.type === "circle") {
      shape = <ellipse className="annotation-shape" cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fillColor} stroke={color} strokeWidth="0.006" vectorEffect="non-scaling-stroke">{title && <title>{title}</title>}</ellipse>;
    } else {
      shape = <rect className="annotation-shape" x={x} y={y} width={width} height={height} fill={fillColor} stroke={color} strokeWidth="0.006" vectorEffect="non-scaling-stroke">{title && <title>{title}</title>}</rect>;
    }
  }

  return (
    <g key={key} className={classNames("catalog-design-annotation-group", className)} {...eventProps}>
      {shape}
      {annotation.commentIndex && (
        <g className="catalog-design-pin" transform={`translate(${clampRatio(anchor.x)}, ${clampRatio(anchor.y)})`}>
          <circle r={pinRadius} fill={color} stroke="#ffffff" strokeWidth="0.003" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.4))" />
          <text textAnchor="middle" dy="0.006" fill="#ffffff" fontSize="0.017" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
            {annotation.commentIndex}
          </text>
        </g>
      )}
    </g>
  );
}

