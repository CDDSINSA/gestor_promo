import React from "react";
import { ImageUp, History, RefreshCw, Layers } from "lucide-react";
import { classNames } from "../../utils/common";
import DesignAnnotationLayer from "./DesignAnnotationLayer";
import { PAGE_IMAGE_ACCEPT } from "./UploadConfirmModal";

export default function DesignImageViewer({
  imageUrlError,
  retryImageUrl,
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
  uploadPageImage,
  isHistoricalVersion = false,
  activeVersionNumber = 1,
  latestVersionNumber = 1,
  onSelectVersion,
  isImageLoading = false,
}) {
  return (
    <div className="catalog-design-viewer-surface">
      {isHistoricalVersion && (
        <div className="catalog-design-historical-banner" role="status">
          <History size={15} />
          <span>Estás viendo la <strong>versión {activeVersionNumber}</strong> (histórica). Las marcas corresponden a este arte.</span>
          <button
            type="button"
            className="catalog-design-banner-action-btn"
            onClick={() => onSelectVersion?.(latestVersionNumber)}
          >
            Volver a la versión actual (v{latestVersionNumber})
          </button>
        </div>
      )}
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
            <span>Podrá revisarla antes de cargarla como nueva versión de la página {selectedPage?.numero_pagina}</span>
          </div>
        )}
    
        {imageUrlError && <div role="alert" className="catalog-design-historical-banner">
          <span>{imageUrlError}</span>
          <button type="button" className="btn btn-outline" onClick={retryImageUrl}>Reintentar</button>
        </div>}
        {selectedImageUrl ? (
          <div className="catalog-design-image-shell" ref={imageShellRef} style={{ width: `${viewerZoom}%` }}>
            <div className={classNames("catalog-design-image-version-watermark", isHistoricalVersion && "historical")}>
              <Layers size={13} />
              <span>v{activeVersionNumber} {isHistoricalVersion ? "(Histórica)" : "(Vigente)"}</span>
            </div>
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
                <span>Arrastre para desplazarse · Ctrl + rueda para zoom · H para ver la página completa</span>
              </div>
            )}
          </div>
        ) : imageUrlError ? null : isImageLoading ? (
          <div className="catalog-design-viewer-empty is-loading">
            <RefreshCw size={36} className="catalog-design-spin" />
            <strong>Cargando arte de la versión {activeVersionNumber}...</strong>
            <span>Obteniendo archivo desde almacenamiento de Supabase...</span>
          </div>
        ) : (
          <div className="catalog-design-viewer-empty">
            <ImageUp size={36}/>
            <strong>{selectedPage ? "Página sin arte cargado" : "Seleccione una página"}</strong>
            <span>{selectedPage ? (canUploadSelectedPage ? "Arrastre una imagen JPG o PNG (máx. 10 MB) aquí, o use Subir arte." : "El diseñador aún no ha cargado el arte de esta página.") : "Use la tira inferior o la tabla para elegir una página del proyecto."}</span>
            {canUploadSelectedPage && selectedPage && (
              <label className="btn btn-primary catalog-design-upload-cta">
                <ImageUp size={16}/> Seleccionar imagen
                <input type="file" accept={PAGE_IMAGE_ACCEPT} onChange={(e) => { uploadPageImage(selectedPage, e.target.files?.[0]); e.target.value = ""; }} style={{ display: "none" }} />
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
