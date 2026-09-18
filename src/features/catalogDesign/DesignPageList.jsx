import React from "react";
import { LayoutGrid, List, ChevronLeft, ChevronRight, ImageUp, MessageSquare, Eye } from "lucide-react";
import { Button } from "../../components/ui";
import { classNames } from "../../utils/common";
import { StateBadge, PAGE_STATES, getUserLabel, getBuyerLabel, formatDate } from "./designPresentation";

export default function DesignPageList({
  visiblePages,
  pageViewMode,
  setPageViewMode,
  scrollFilmstrip,
  filmstripTrackRef,
  selectedPage,
  signedUrls,
  commentCountByPageId,
  isAdminOrMark,
  canUpload,
  currentUserId,
  selectViewerPage,
  uploadPageImage,
  canManage,
  updatePageField,
  designerOptions,
  userById,
  buyers,
  buyerById
}) {
  return (
    <>
    <div className="catalog-design-pages-header">
      <div className="catalog-design-pages-title-group">
        <h3>Hojas del Proyecto ({visiblePages.length})</h3>
        <span className="catalog-design-pages-subtitle">
          {pageViewMode === "filmstrip"
            ? "Haga clic en una miniatura para abrirla en el visor sin perder de vista el catálogo."
            : "Vista tabular tradicional para auditoría de fechas y asignación rápida."}
        </span>
      </div>
      <div className="catalog-design-view-mode-toggle" role="tablist" aria-label="Modo de visualización de páginas">
        <button
          type="button"
          role="tab"
          aria-selected={pageViewMode === "filmstrip"}
          className={classNames("catalog-design-view-mode-btn", pageViewMode === "filmstrip" && "active")}
          onClick={() => setPageViewMode("filmstrip")}
          title="Ver como tira de miniaturas continua"
        >
          <LayoutGrid size={15}/> Tira de Miniaturas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={pageViewMode === "table"}
          className={classNames("catalog-design-view-mode-btn", pageViewMode === "table" && "active")}
          onClick={() => setPageViewMode("table")}
          title="Ver como tabla tradicional"
        >
          <List size={15}/> Tabla Detallada
        </button>
      </div>
    </div>
    
    {pageViewMode === "filmstrip" ? (
      <div className="catalog-design-filmstrip-wrapper">
        <button
          type="button"
          className="catalog-design-filmstrip-nav-btn left"
          onClick={() => scrollFilmstrip(-1)}
          title="Desplazar hacia la izquierda"
          aria-label="Desplazar hacia la izquierda"
        >
          <ChevronLeft size={18}/>
        </button>
    
        <div className="catalog-design-filmstrip-track" ref={filmstripTrackRef}>
          {visiblePages.map((page) => {
            const isSelected = selectedPage?.id === page.id;
            const imageUrl = signedUrls[page.id];
            const pageCommentsCount = commentCountByPageId[page.id] || 0;
            const canUploadPage = isAdminOrMark || (canUpload && page.disenador_id === currentUserId);
            return (
              <div
                key={page.id}
                id={`filmstrip-card-${page.id}`}
                className={classNames("catalog-design-filmstrip-card", isSelected && "selected")}
                onClick={() => selectViewerPage(page)}
                onDragOver={(e) => {
                  if (canUploadPage) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onDrop={(e) => {
                  if (!canUploadPage) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const file = e.dataTransfer?.files?.[0];
                  if (file && (file.type?.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(file.name))) {
                    uploadPageImage(page, file);
                  }
                }}
                role="button"
                tabIndex={0}
                title={`Página ${page.numero_pagina} · ${page.estado || "pendiente"} (Arrastre imagen aquí para subir)`}
              >
                <div className="catalog-design-filmstrip-card-head">
                  <span className="catalog-design-filmstrip-page-num">#{page.numero_pagina}</span>
                  <StateBadge state={page.estado || "pendiente"} />
                </div>
    
                <div className="catalog-design-filmstrip-card-preview">
                  {imageUrl ? (
                    <img src={imageUrl} alt={`Pág. ${page.numero_pagina}`} loading="lazy" draggable={false} />
                  ) : (
                    <div className="catalog-design-filmstrip-empty">
                      <ImageUp size={22} />
                      <span>Sin arte</span>
                    </div>
                  )}
                  {isSelected && <div className="catalog-design-filmstrip-active-pill">EN VISOR</div>}
                </div>
    
                <div className="catalog-design-filmstrip-card-foot">
                  <div className="catalog-design-filmstrip-comments-count">
                    {pageCommentsCount > 0 ? (
                      <span className="catalog-design-filmstrip-comment-pill" title={`${pageCommentsCount} observaciones`}>
                        <MessageSquare size={12} /> {pageCommentsCount}
                      </span>
                    ) : (
                      <span className="catalog-design-filmstrip-no-comments">0 obs.</span>
                    )}
                  </div>
    
                  {canUploadPage && (
                    <label
                      className="btn btn-outline catalog-design-filmstrip-upload-btn"
                      title="Subir o actualizar imagen de esta página"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ImageUp size={12} /> Subir
                      <input
                        type="file"
                        accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                        onChange={(event) => {
                          uploadPageImage(page, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
          {!visiblePages.length && (
            <div className="empty-state">No hay páginas disponibles con los filtros actuales.</div>
          )}
        </div>
    
        <button
          type="button"
          className="catalog-design-filmstrip-nav-btn right"
          onClick={() => scrollFilmstrip(1)}
          title="Desplazar hacia la derecha"
          aria-label="Desplazar hacia la derecha"
        >
          <ChevronRight size={18}/>
        </button>
      </div>
    ) : (
      <div className="table-wrap catalog-design-table">
        <table>
          <thead>
            <tr>
              <th>Pág.</th>
              <th>Miniatura</th>
              <th>Título</th>
              <th>Diseñador</th>
              <th>Comprador</th>
              <th>Estado</th>
              <th>Comentarios</th>
              <th>Última carga</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visiblePages.map((page) => {
              const canUploadPage = isAdminOrMark || (canUpload && page.disenador_id === currentUserId);
              const imageUrl = signedUrls[page.id];
              const pageCommentsCount = commentCountByPageId[page.id] || 0;
              const isSelected = selectedPage?.id === page.id;
              return (
                <tr
                  key={page.id}
                  className={isSelected ? "catalog-design-selected-row" : ""}
                  onClick={() => selectViewerPage(page)}
                  style={{ cursor: "pointer" }}
                >
                  <td><strong>#{page.numero_pagina}</strong></td>
                  <td>
                    {imageUrl ? (
                      <button
                        type="button"
                        className="catalog-design-thumb"
                        onClick={(e) => { e.stopPropagation(); selectViewerPage(page); }}
                        title="Ver en visor"
                      >
                        <img src={imageUrl} alt={`Página ${page.numero_pagina}`} />
                      </button>
                    ) : (
                      <span className="catalog-design-no-thumb">Sin imagen</span>
                    )}
                  </td>
                  <td>
                    <div className="catalog-design-table-title">
                      <strong>{page.titulo_pagina || `Página ${page.numero_pagina}`}</strong>
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {canManage ? (
                      <select
                        className="catalog-design-table-select"
                        value={page.disenador_id || ""}
                        onChange={(event) => updatePageField(page, "disenador_id", event.target.value || null)}
                      >
                        <option value="">Sin asignar</option>
                        {designerOptions.map((user) => (
                          <option key={user.id} value={user.id}>{user.nombre || user.email}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="catalog-design-table-user">{getUserLabel(userById[page.disenador_id])}</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {canManage ? (
                      <select
                        className="catalog-design-table-select"
                        value={page.comprador_id || ""}
                        onChange={(event) => updatePageField(page, "comprador_id", event.target.value || null)}
                      >
                        <option value="">Sin asignar</option>
                        {buyers.map((buyer) => (
                          <option key={buyer.id} value={buyer.id}>{buyer.comprador}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="catalog-design-table-user">{getBuyerLabel(buyerById[page.comprador_id])}</span>
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {canManage ? (
                      <select
                        className="catalog-design-table-select"
                        value={page.estado || "pendiente"}
                        onChange={(event) => updatePageField(page, "estado", event.target.value)}
                      >
                        {PAGE_STATES.map((state) => (
                          <option key={state} value={state}>{state.replace(/_/g, " ")}</option>
                        ))}
                      </select>
                    ) : (
                      <StateBadge state={page.estado}/>
                    )}
                  </td>
                  <td>
                    {pageCommentsCount > 0 ? (
                      <span className="catalog-design-table-comment-pill" title={`${pageCommentsCount} comentarios registrados`}>
                        <MessageSquare size={13}/> {pageCommentsCount}
                      </span>
                    ) : (
                      <span className="catalog-design-table-no-comments">—</span>
                    )}
                  </td>
                  <td>{formatDate(page.fecha_ultima_carga) || "Sin carga"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="catalog-design-actions">
                      {canUploadPage && (
                        <label className="btn btn-outline catalog-design-file-btn" title="Subir nueva imagen">
                          <ImageUp size={15}/> Subir
                          <input
                            type="file"
                            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                            onChange={(event) => {
                              uploadPageImage(page, event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                      )}
                      <Button
                        variant={isSelected ? "default" : "outline"}
                        onClick={() => selectViewerPage(page)}
                        title="Abrir página en el visor"
                      >
                        <Eye size={15}/> Revisar
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visiblePages.length && <tr><td colSpan={9}><div className="empty-state">No hay páginas visibles con los filtros actuales.</div></td></tr>}
          </tbody>
        </table>
      </div>
    )}
    </>
  );
}
