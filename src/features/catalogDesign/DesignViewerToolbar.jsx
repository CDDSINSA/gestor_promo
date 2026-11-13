import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, ZoomOut, ZoomIn, Pencil, Square, Circle, Undo2, Minimize2, Maximize2, ImageUp, CheckCircle2, XCircle, Eye, EyeOff, Layers, Keyboard } from "lucide-react";
import { classNames } from "../../utils/common";
import { Button } from "../../components/ui";
import { PAGE_STATES, StateBadge, getPageStateLabel } from "./designPresentation";

const SHORTCUTS = [
  ["← / →", "Página anterior / siguiente"],
  ["+ / −", "Acercar / alejar"],
  ["Ctrl + rueda", "Zoom en el punto del cursor"],
  ["0", "Ajustar al ancho"],
  ["H", "Ajustar a la altura"],
  ["Espacio + arrastrar", "Desplazar la imagen"],
  ["F", "Modo enfoque"],
  ["Esc", "Salir del enfoque / cerrar"],
  ["?", "Mostrar esta ayuda"],
];

function ShortcutsPopover({ open, setOpen }) {
  const containerRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, setOpen]);

  return (
    <div className="catalog-design-shortcuts" ref={containerRef}>
      <button
        type="button"
        className={classNames("catalog-design-tool-btn", open && "selected")}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Atajos de teclado"
        title="Atajos de teclado (?)"
      >
        <Keyboard size={15}/>
      </button>
      {open && (
        <div className="catalog-design-shortcuts-popover" role="dialog" aria-label="Atajos de teclado">
          <strong>Atajos de teclado</strong>
          <dl>
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{label}</dd></div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

const ANNOTATION_TOOLS = [
  ["rect", "Rectángulo", Square],
  ["circle", "Círculo", Circle],
  ["freehand", "Libre", Pencil],
];

// Barra única del visor: contexto de la página, herramientas del lienzo y decisiones de revisión.
// Los accesos a Observaciones / SKU viven solo en las pestañas del panel lateral.
export default function DesignViewerToolbar({
  goToViewerPage,
  selectedPageIndex,
  visiblePages,
  selectedPage,
  canManage,
  updatePageField,
  zoomTo,
  fitViewerToHeight,
  viewerZoom,
  shortcutsOpen = false,
  setShortcutsOpen,
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
  openReviewPanel,
  canUploadSelectedPage,
  uploadPageImage,
  canReviewSelectedPage,
  reviewPage,
  commentText,
  setCommentText,
  currentPageVersions = [],
  activeVersionNumber = 1,
  latestVersionNumber = 1,
  onSelectVersion,
  isHistoricalVersion = false,
}) {
  return (
    <div className="catalog-design-workspace-toolbar">
      <div className="catalog-design-toolbar-row">
        <div className="catalog-design-toolbar-group-left">
          <div className="catalog-design-page-nav-pill" role="group" aria-label="Navegación de páginas">
            <button
              type="button"
              className="catalog-design-nav-arrow-btn"
              onClick={() => goToViewerPage(-1)}
              disabled={selectedPageIndex <= 0}
              title="Página anterior (flecha izquierda)"
              aria-label="Página anterior"
            >
              <ChevronLeft size={15}/>
            </button>
            <span className="catalog-design-page-count-text" title="Página actual">
              {visiblePages.length ? `${selectedPageIndex + 1} / ${visiblePages.length}` : "0 / 0"}
            </span>
            <button
              type="button"
              className="catalog-design-nav-arrow-btn"
              onClick={() => goToViewerPage(1)}
              disabled={selectedPageIndex < 0 || selectedPageIndex >= visiblePages.length - 1}
              title="Página siguiente (flecha derecha)"
              aria-label="Página siguiente"
            >
              <ChevronRight size={15}/>
            </button>
          </div>

          <strong className="catalog-design-page-title-text" title={selectedPage?.titulo_pagina || "Sin página"}>
            {selectedPage ? (selectedPage.titulo_pagina || `Página ${selectedPage.numero_pagina}`) : "Sin página seleccionada"}
          </strong>

          {selectedPage && currentPageVersions.length > 1 && (
            <div className={classNames("catalog-design-version-pill", isHistoricalVersion && "is-historical")} title="Seleccionar versión visible del arte">
              <Layers size={14} className="catalog-design-version-icon" />
              <select
                className="catalog-design-version-select"
                value={activeVersionNumber}
                onChange={(e) => onSelectVersion?.(Number(e.target.value))}
                aria-label="Seleccionar versión del arte"
              >
                {currentPageVersions.map((v) => {
                  const isLatest = Number(v.numero_version) === latestVersionNumber;
                  return (
                    <option key={v.numero_version} value={v.numero_version}>
                      v{v.numero_version} {isLatest ? "(actual)" : "(histórica)"}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {selectedPage && currentPageVersions.length <= 1 && selectedPage?.archivo_path && (
            <div className="catalog-design-version-pill is-single" title="Versión única vigente: v1">
              <Layers size={13} className="catalog-design-version-icon" />
              <span className="catalog-design-version-select-static">v1</span>
            </div>
          )}

          {selectedPage && (
            canManage ? (
              <select
                className="catalog-design-quick-state-select"
                value={selectedPage.estado || "pendiente"}
                disabled={isHistoricalVersion}
                onChange={(e) => updatePageField(selectedPage, "estado", e.target.value)}
                title="Cambiar estado de esta página"
                aria-label="Estado de la página"
              >
                {PAGE_STATES.map((state) => (
                  <option key={state} value={state}>{getPageStateLabel(state)}</option>
                ))}
              </select>
            ) : (
              <StateBadge state={selectedPage.estado}/>
            )
          )}
        </div>

        <div className="catalog-design-toolbar-group-tools">
          <div className="catalog-design-segmented-zoom" role="group" aria-label="Controles de zoom">
            <button type="button" onClick={() => zoomTo((v) => v - 15)} disabled={!selectedPage} title="Alejar (−)" aria-label="Alejar"><ZoomOut size={14}/></button>
            <span className="catalog-design-zoom-val" title="Nivel de zoom actual">{viewerZoom}%</span>
            <button type="button" onClick={() => zoomTo((v) => v + 15)} disabled={!selectedPage} title="Acercar (+)" aria-label="Acercar"><ZoomIn size={14}/></button>
            <button type="button" className={viewerZoom === 100 ? "active" : ""} onClick={() => zoomTo(100)} disabled={!selectedPage} title="Ajustar al ancho (0)">Ancho</button>
            <button type="button" onClick={fitViewerToHeight} disabled={!selectedPage?.archivo_path} title="Ajustar a la altura: ver la página completa (H)">Alto</button>
          </div>

          <button
            type="button"
            className={classNames("catalog-design-tool-action-btn", annotationMode && "active")}
            onClick={toggleAnnotationMode}
            disabled={!canUseAnnotations}
            aria-pressed={annotationMode}
            title={canUseAnnotations ? (annotationMode ? "Desactivar modo señalar" : "Señalar sobre la imagen (dibujar)") : isHistoricalVersion ? "Modo histórico (solo lectura). Vuelva a la versión actual para señalar." : "Cargue una imagen para poder señalar"}
          >
            <Pencil size={15}/> <span>Señalar</span>
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
                  aria-pressed={annotationTool === tool}
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
            className={classNames("catalog-design-tool-btn", annotationsHidden && "selected")}
            onClick={toggleAnnotationsVisibility}
            disabled={!canUseAnnotations && !selectedPage}
            aria-label={annotationsHidden ? "Mostrar marcas de revisión" : "Ocultar marcas de revisión"}
            aria-pressed={annotationsHidden}
            title={annotationsHidden ? "Mostrar marcas de revisión" : "Ocultar marcas de revisión"}
          >
            {annotationsHidden ? <EyeOff size={15} aria-hidden="true"/> : <Eye size={15} aria-hidden="true"/>}
          </button>

          <button
            type="button"
            className={classNames("catalog-design-tool-btn", focusMode && "selected")}
            onClick={() => setFocusMode((v) => !v)}
            aria-label={focusMode ? "Salir del modo enfoque" : "Modo enfoque"}
            aria-pressed={focusMode}
            title={focusMode ? "Salir del modo enfoque (F o Esc)" : "Modo enfoque (F)"}
          >
            {focusMode ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
          </button>

          <ShortcutsPopover open={shortcutsOpen} setOpen={setShortcutsOpen}/>
        </div>

        <div className="catalog-design-toolbar-group-right">
          {canUploadSelectedPage && (
            <label className="btn btn-outline catalog-design-upload-cta is-secondary" title="Subir o actualizar imagen JPG o PNG de la página">
              <ImageUp size={15}/> Subir arte
              <input
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                onChange={(e) => { uploadPageImage(selectedPage, e.target.files?.[0]); e.target.value = ""; }}
                style={{ display: "none" }}
              />
            </label>
          )}

          {canReviewSelectedPage && (
            <div className="catalog-design-decision-group">
              <Button
                variant="outline"
                className="btn-reject-sm"
                onClick={() => { openReviewPanel(); if (!commentText.trim()) setCommentText("Requiere ajuste: "); }}
                title="Escribir las observaciones y enviar la página a ajustes"
              >
                <XCircle size={15}/> Solicitar ajustes
              </Button>
              <Button className="btn-approve-sm" onClick={() => reviewPage("aprobada", "aprobacion")} title="Aprobar página para publicación">
                <CheckCircle2 size={15}/> Aprobar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
