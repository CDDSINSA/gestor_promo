import React from "react";
import { classNames } from "../../utils/common";
import { renderAnnotation } from "./renderAnnotation";

export default function DesignAnnotationLayer({
  annotationMode,
  beginAnnotation,
  moveAnnotation,
  endAnnotation,
  selectedAnnotations,
  activeCommentId,
  hoveredAnnotation,
  setHoveredAnnotation,
  highlightAndScrollComment,
  setActiveCommentId,
  draftAnnotations,
  activeAnnotation
}) {
  return (
    <svg
      className={classNames("catalog-design-annotation-layer", annotationMode && "drawing")}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      onPointerDown={beginAnnotation}
      onPointerMove={moveAnnotation}
      onPointerUp={endAnnotation}
      onPointerCancel={endAnnotation}
    >
      {selectedAnnotations.map((annotation, index) => renderAnnotation(
        annotation,
        `${annotation.commentId}-${index}`,
        classNames("saved", (activeCommentId === annotation.commentId || hoveredAnnotation?.commentId === annotation.commentId) && "selected"),
        {
          onPointerEnter: () => {
            setHoveredAnnotation(annotation);
            highlightAndScrollComment(annotation.commentId);
          },
          onPointerLeave: () => {
            setHoveredAnnotation(null);
            setActiveCommentId("");
          },
          onClick: (event) => {
            event.stopPropagation();
            highlightAndScrollComment(annotation.commentId);
          },
          onFocus: () => {
            setHoveredAnnotation(annotation);
            highlightAndScrollComment(annotation.commentId);
          },
          onBlur: () => {
            setHoveredAnnotation(null);
            setActiveCommentId("");
          },
          tabIndex: 0,
        }
      ))}
      {draftAnnotations.map((annotation, index) => renderAnnotation(annotation, `draft-${index}`, "draft"))}
      {activeAnnotation && renderAnnotation(activeAnnotation, "active", "draft active")}
    </svg>
  );
}
