import React from "react";
import { ImageUp } from "lucide-react";
import { classNames } from "../../utils/common";
import DesignAnnotationLayer from "./DesignAnnotationLayer";

export default function DesignImageViewer({
  viewerZoom,
  isSpacePressed,
  annotationMode,
  annotationsHidden,
  isPanning,
  isDraggingOverStage,
  viewerStageRef,
  handleStagePointerDown,
  handleStagePointerMove,
  handleStagePointerUp,
  handleStageDragOver,
  handleStageDragLeave,
  handleStageDrop,
  selectedPage,
  selectedImageUrl,
  imageShellRef,
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
  activeAnnotation,
  hoveredAnnotationAnchor,
  canUploadSelectedPage,
  uploadPageImage
}) {
  return (
    <div className="catalog-design-viewer-surface">
      <div
        className={classNames(
          "catalog-design-viewer-stage",
          (viewerZoom > 100 || isSpacePressed) && !annotationMode && "can-pan",
          isPanning && "is-panning",
          isDraggingOverStage && "stage-drag-active"
        )}
        ref={viewerStageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
        onDragOver={handleStageDragOver}
        onDragLeave={handleStageDragLeave}
        onDrop={handleStageDrop}
      >
        {isDraggingOverStage && (
          <div className="catalog-design-drop-overlay">
            <ImageUp size={48} />
            <strong>Suelte la imagen aquí</strong>
            <span>Se actualizará el arte de la página {selectedPage?.numero_pagina}</span>
          </div>
        )}
    
        {selectedImageUrl ? (
          <div className="catalog-design-image-shell" ref={imageShellRef} style={{ width: `${viewerZoom}%` }}>
            <img src={selectedImageUrl} alt={selectedPage?.titulo_pagina || "Página de catálogo"} draggable={false} />
            {!annotationsHidden && <DesignAnnotationLayer
              annotationMode={annotationMode}
              beginAnnotation={beginAnnotation}
              moveAnnotation={moveAnnotation}
              endAnnotation={endAnnotation}
              selectedAnnotations={selectedAnnotations}
              activeCommentId={activeCommentId}
              hoveredAnnotation={hoveredAnnotation}
              setHoveredAnnotation={setHoveredAnnotation}
              highlightAndScrollComment={highlightAndScrollComment}
              setActiveCommentId={setActiveCommentId}
              draftAnnotations={draftAnnotations}
              activeAnnotation={activeAnnotation}
            />}
            {!annotationsHidden && hoveredAnnotation && hoveredAnnotationAnchor && (
              <div className="catalog-design-annotation-tooltip" style={{ left: `${hoveredAnnotationAnchor.x * 100}%`, top: `${hoveredAnnotationAnchor.y * 100}%` }}>
                <strong>{hoveredAnnotation.commentIndex ? `#${hoveredAnnotation.commentIndex} ` : ""}{hoveredAnnotation.commentType || "comentario"} · {hoveredAnnotation.commentUser || "Usuario"}</strong>
                <p>{hoveredAnnotation.commentText}</p>
                {hoveredAnnotation.commentDate && <span>{hoveredAnnotation.commentDate}</span>}
              </div>
            )}
            {annotationMode && <div className="catalog-design-drawing-hint">Arrastre sobre la imagen para señalar la corrección.</div>}
            {viewerZoom > 100 && !annotationMode && (
              <div className="catalog-design-pan-hint">
                <span>💡 Arrastre con el ratón o mantenga espacio para desplazarse por la imagen</span>
              </div>
            )}
          </div>
        ) : (
          <div className="catalog-design-viewer-empty">
            <ImageUp size={36}/>
            <strong>{selectedPage ? "Página sin arte cargado" : "Seleccione una página"}</strong>
            <span>{selectedPage ? "Arrastre una imagen JPG o PNG aquí, o use el botón Subir Arte superior." : "Use la tira inferior o tabla para elegir una página del proyecto."}</span>
            {canUploadSelectedPage && selectedPage && (
              <label className="btn btn-primary catalog-design-upload-cta">
                <ImageUp size={16}/> Seleccionar imagen
                <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(e) => { uploadPageImage(selectedPage, e.target.files?.[0]); e.target.value = ""; }} />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
