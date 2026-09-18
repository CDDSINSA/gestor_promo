import React from "react";
import { ChevronLeft, ChevronRight, ZoomOut, ZoomIn, Pencil, Square, Circle, Undo2, Minimize2, Maximize2, Search, MessageSquare, ImageUp, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { classNames } from "../../utils/common";
import { Button } from "../../components/ui";
import { PAGE_STATES, StateBadge } from "./designPresentation";

const ANNOTATION_TOOLS = [
  ["rect", "Rectangulo", Square],
  ["circle", "Circulo", Circle],
  ["freehand", "Libre", Pencil],
];

export default function DesignViewerToolbar({
  goToViewerPage,
  selectedPageIndex,
  visiblePages,
  selectedPage,
  canManage,
  updatePageField,
  setViewerZoom,
  viewerZoom,
  annotationMode,
  toggleAnnotationMode,
  annotationsHidden,
  toggleAnnotationsVisibility,
  canUseAnnotations,
  annotationTool,
  setAnnotationTool,
  undoAnnotation,
  draftAnnotations,
  focusMode,
  setFocusMode,
  activeSideTab,
  sideRailCollapsed,
  setActiveSideTab,
  setSideRailCollapsed,
  openReviewPanel,
  selectedComments,
  canUploadSelectedPage,
  uploadPageImage,
  canReviewSelectedPage,
  reviewPage,
  commentText,
  setCommentText
}) {
  return (
    <div className="catalog-design-workspace-toolbar">
      <div className="catalog-design-toolbar-left">
        <div className="catalog-design-page-nav-pill" role="group" aria-label="Navegación de páginas">
          <button type="button" className="catalog-design-nav-arrow-btn" onClick={() => goToViewerPage(-1)} disabled={selectedPageIndex <= 0} title="Página anterior (o flecha izquierda)" aria-label="Página anterior"><ChevronLeft size={15}/></button>
          <span className="catalog-design-page-count-text" title="Página actual">
            {visiblePages.length ? `${selectedPageIndex + 1} / ${visiblePages.length}` : "0 / 0"}
          </span>
          <button type="button" className="catalog-design-nav-arrow-btn" onClick={() => goToViewerPage(1)} disabled={selectedPageIndex < 0 || selectedPageIndex >= visiblePages.length - 1} title="Página siguiente (o flecha derecha)" aria-label="Página siguiente"><ChevronRight size={15}/></button>
        </div>
    
        <strong className="catalog-design-page-title-text" title={selectedPage?.titulo_pagina || "Sin página"}>
          {selectedPage ? (selectedPage.titulo_pagina || `Página ${selectedPage.numero_pagina}`) : "Sin página seleccionada"}
        </strong>
    
        {selectedPage && (
          canManage ? (
            <select
              className="catalog-design-quick-state-select"
              value={selectedPage.estado || "pendiente"}
              onChange={(e) => updatePageField(selectedPage, "estado", e.target.value)}
              title="Cambiar estado de esta página directamente"
            >
              {PAGE_STATES.map((state) => (
                <option key={state} value={state}>{state.replace(/_/g, " ")}</option>
              ))}
            </select>
          ) : (
            <StateBadge state={selectedPage.estado}/>
          )
        )}
      </div>
    
      <div className="catalog-design-toolbar-center">
        <div className="catalog-design-segmented-zoom" role="group" aria-label="Controles de zoom">
          <button type="button" onClick={() => setViewerZoom((v) => Math.max(50, v - 15))} disabled={!selectedPage} title="Reducir zoom" aria-label="Reducir zoom"><ZoomOut size={14}/></button>
          <span className="catalog-design-zoom-val" title="Nivel de zoom actual">{viewerZoom}%</span>
          <button type="button" onClick={() => setViewerZoom((v) => Math.min(220, v + 15))} disabled={!selectedPage} title="Aumentar zoom" aria-label="Aumentar zoom"><ZoomIn size={14}/></button>
          <button type="button" className={viewerZoom === 100 ? "active" : ""} onClick={() => setViewerZoom(100)} disabled={!selectedPage} title="Ajustar al ancho (100%)">Ajustar</button>
          <button type="button" className={viewerZoom === 140 ? "active" : ""} onClick={() => setViewerZoom(140)} disabled={!selectedPage} title="Zoom detalle (140%)">140%</button>
        </div>
    
        <button
          type="button"
          className={classNames("catalog-design-tool-action-btn", annotationMode && "active")}
          onClick={toggleAnnotationMode}
          disabled={!canUseAnnotations}
          title={canUseAnnotations ? (annotationMode ? "Desactivar modo señalar" : "Señalar sobre la imagen (dibujar)") : "Cargue una imagen para poder señalar"}
        >
          <Pencil size={15}/> <span>Señalar</span>
        </button>

        <button
          type="button"
          className={classNames("catalog-design-tool-action-btn", annotationsHidden && "active")}
          onClick={toggleAnnotationsVisibility}
          disabled={!canUseAnnotations}
          aria-label="Ocultar pines y áreas sombreadas"
          aria-pressed={annotationsHidden}
          title={!canUseAnnotations ? "Cargue una imagen para ver sus marcas" : annotationsHidden ? "Mostrar pines y áreas sombreadas" : "Ocultar pines y áreas sombreadas sin borrar las anotaciones"}
        >
          {annotationsHidden ? <EyeOff size={15} aria-hidden="true"/> : <Eye size={15} aria-hidden="true"/>}
          <span>{annotationsHidden ? "Mostrar marcas" : "Ocultar marcas"}</span>
        </button>
    
        {annotationMode && (
          <div className="catalog-design-annotation-shapes-group">
            {ANNOTATION_TOOLS.map(([tool, label, Icon]) => (
              <button
                key={tool}
                type="button"
                className={classNames("catalog-design-tool-btn", annotationTool === tool && "selected")}
                onClick={() => setAnnotationTool(tool)}
                title={label}
                aria-label={label}
              >
                <Icon size={15}/>
              </button>
            ))}
            <button
              type="button"
              className="catalog-design-tool-btn"
              onClick={undoAnnotation}
              disabled={!draftAnnotations.length}
              title="Deshacer última señal"
              aria-label="Deshacer última señal"
            >
              <Undo2 size={15}/>
            </button>
          </div>
        )}
    
        <button
          type="button"
          className={classNames("catalog-design-tool-action-btn", focusMode && "active")}
          onClick={() => setFocusMode((v) => !v)}
          title={focusMode ? "Salir de Modo Enfoque (F o Esc)" : "Modo Enfoque / Pantalla Completa (F)"}
        >
          {focusMode ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
          <span>{focusMode ? "Salir" : "Enfoque"}</span>
        </button>
      </div>
    
      <div className="catalog-design-toolbar-right">
        <button
          type="button"
          className={classNames("catalog-design-tool-action-btn", activeSideTab === "sku" && !sideRailCollapsed && "active")}
          onClick={() => { setActiveSideTab("sku"); setSideRailCollapsed(false); }}
          title="Buscar información y precios de SKU"
        >
          <Search size={15}/> <span>SKU</span>
        </button>
    
        <button
          type="button"
          className={classNames("catalog-design-tool-action-btn", activeSideTab === "comments" && !sideRailCollapsed && "active")}
          onClick={() => { setActiveSideTab("comments"); setSideRailCollapsed(false); openReviewPanel(); }}
          disabled={!selectedPage}
          title="Ver observaciones de la página"
        >
          <MessageSquare size={15}/> <span>Observación</span>
          {selectedComments.length > 0 && <span className="catalog-design-pill-count">{selectedComments.length}</span>}
        </button>
    
        {canUploadSelectedPage && (
          <label className="btn btn-primary catalog-design-upload-cta" title="Subir o actualizar imagen JPG o PNG de la página (o arrastrar archivo al lienzo)">
            <ImageUp size={15}/> Subir Arte
            <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(e) => { uploadPageImage(selectedPage, e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
    
        {canReviewSelectedPage && (
          <div className="catalog-design-decision-group">
            <Button className="btn-approve-sm" onClick={() => reviewPage("aprobada", "aprobacion")} title="Aprobar página para publicación">
              <CheckCircle2 size={15}/> Aprobar
            </Button>
            <Button variant="outline" className="btn-reject-sm" onClick={() => { openReviewPanel(); if (!commentText.trim()) setCommentText("Requiere ajuste: "); }} title="Solicitar ajustes">
              <XCircle size={15}/> Ajustes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
