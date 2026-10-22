import React from "react";
import { Plus, Save, XCircle, Check } from "lucide-react";
import { Button } from "../../components/ui";
import { classNames } from "../../utils/common";
import { COMMENT_CATEGORIES, CATEGORY_COLORS, ANNOTATION_COLOR, normalizeCommentAnnotations, getCommentStatus, getUserLabel, formatDate } from "./designPresentation";
import CommentReplies from "./CommentReplies";

export default function DesignCommentsPanel({
  selectedComments,
  pendingCommentsCount,
  resolvedCommentsCount,
  isDraftingComment,
  selectedPage,
  openReviewPanel,
  commentFilter,
  setCommentFilter,
  pendingAnnotationCount,
  commentCategory,
  setCommentCategory,
  commentText,
  setCommentText,
  annotationMode,
  resetReviewDraft,
  addComment,
  canReviewSelectedPage,
  reviewPage,
  filteredSelectedComments,
  chronologicalOrder,
  activeCommentId,
  hoveredAnnotation,
  setActiveCommentId,
  highlightAndScrollComment,
  canUpdateCommentStatus,
  updateCommentStatus,
  userById,
  supabaseConnection,
  isAdminOrMark,
  isDesigner,
  currentUserId,
  isBuyer,
  currentBuyerId,
  runAction,
  designEvent,
  activeVersionNumber = 1,
  currentPageVersions = [],
  currentVersionCommentsCount = 0,
}) {
  return (
    <div className="catalog-design-rail-content">
      <div className="catalog-design-comment-rail-head">
        <div>
          <strong>Checklist de Ajustes</strong>
          <span>{selectedComments.length ? `${pendingCommentsCount} pendiente${pendingCommentsCount === 1 ? "" : "s"} de ${selectedComments.length}` : "Sin observaciones"}</span>
        </div>
        {!isDraftingComment && (
          <Button variant="outline" onClick={openReviewPanel} disabled={!selectedPage}>
            <Plus size={15}/> Nueva
          </Button>
        )}
      </div>
    
      {/* Filtros rápidos de comentarios: Todos, Esta Versión, Pendientes, Resueltos */}
      {selectedComments.length > 0 && (
        <div className="catalog-design-comment-filter-pills" role="group" aria-label="Filtrar observaciones">
          <button
            type="button"
            className={classNames("catalog-design-filter-pill", commentFilter === "all" && "active")}
            aria-pressed={commentFilter === "all"}
            onClick={() => setCommentFilter("all")}
          >
            <span className="catalog-design-filter-label">Todas</span>
            <span className="catalog-design-filter-count">{selectedComments.length}</span>
          </button>
          {currentPageVersions.length > 1 && (
            <button
              type="button"
              className={classNames("catalog-design-filter-pill is-version", commentFilter === "version" && "active")}
              aria-pressed={commentFilter === "version"}
              onClick={() => setCommentFilter(commentFilter === "version" ? "all" : "version")}
              title={`Mostrar solo observaciones realizadas sobre la versión ${activeVersionNumber}`}
            >
              <span className="catalog-design-filter-label">v{activeVersionNumber}</span>
              <span className="catalog-design-filter-count">{currentVersionCommentsCount}</span>
            </button>
          )}
          <button
            type="button"
            className={classNames("catalog-design-filter-pill is-pending", commentFilter === "pending" && "active")}
            aria-pressed={commentFilter === "pending"}
            onClick={() => setCommentFilter("pending")}
          >
            <span className="catalog-design-filter-label">Pendientes</span>
            <span className={classNames("catalog-design-filter-count", pendingCommentsCount > 0 && "has-pending")}>
              {pendingCommentsCount}
            </span>
          </button>
          <button
            type="button"
            className={classNames("catalog-design-filter-pill is-resolved", commentFilter === "resolved" && "active")}
            aria-pressed={commentFilter === "resolved"}
            onClick={() => setCommentFilter("resolved")}
          >
            <span className="catalog-design-filter-label">Resueltas</span>
            <span className="catalog-design-filter-count">{resolvedCommentsCount}</span>
          </button>
        </div>
      )}
    
      {/* Integrated Comment Composer */}
      {isDraftingComment && selectedPage && (
        <div className="catalog-design-comment-composer">
          <div className="catalog-design-composer-head">
            <strong>Nueva observación</strong>
            <div className="catalog-design-composer-tags">
              <span className="catalog-design-composer-version-tag" title={`Esta observación quedará registrada en la versión ${activeVersionNumber}`}>
                v{activeVersionNumber}
              </span>
              {pendingAnnotationCount > 0 && (
                <span className="catalog-design-composer-signal-tag">
                  {pendingAnnotationCount} señal{pendingAnnotationCount === 1 ? "" : "es"} en imagen
                </span>
              )}
            </div>
          </div>
          <div className="catalog-design-category-selector" role="group" aria-label="Categoría de observación">
            {COMMENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={classNames("catalog-design-cat-pill", commentCategory === cat.id && "selected")}
                style={{ "--cat-color": cat.color }}
                onClick={() => setCommentCategory(cat.id)}
                aria-pressed={commentCategory === cat.id}
              >
                <cat.Icon size={13} aria-hidden="true"/> {cat.label}
              </button>
            ))}
          </div>
          <textarea
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder="Describe el ajuste necesario para el diseñador..."
            rows={3}
            autoFocus={!annotationMode}
          />
          <div className="catalog-design-composer-actions">
            <Button variant="outline" onClick={resetReviewDraft}>Cancelar</Button>
            <Button variant={canReviewSelectedPage ? "outline" : "default"} onClick={addComment} disabled={!commentText.trim()} title="Guardar la observación sin cambiar el estado de la página">
              <Save size={15}/> Guardar observación
            </Button>
            {canReviewSelectedPage && (
              <Button className="btn-reject-sm" onClick={() => reviewPage("ajustes", "rechazo")} disabled={!commentText.trim()} title="Guardar la observación y enviar la página a ajustes">
                <XCircle size={15}/> Solicitar ajustes
              </Button>
            )}
          </div>
        </div>
      )}
    
      {/* Comments List as Interactive Checklist */}
      <div className="catalog-design-comment-rail-list">
        {filteredSelectedComments.map((comment) => {
          const commentNumber = chronologicalOrder.get(comment.id) || 1;
          const annotationCount = normalizeCommentAnnotations(comment).length;
          const commentStatus = getCommentStatus(comment);
          const isResolved = commentStatus === "resuelto";
          const selected = activeCommentId === comment.id || hoveredAnnotation?.commentId === comment.id;
          const catColor = CATEGORY_COLORS[comment.tipo] || ANNOTATION_COLOR;
          const categoryInfo = COMMENT_CATEGORIES.find((c) => c.id === comment.tipo);
          return (
            <div
              key={comment.id}
              id={`catalog-comment-${comment.id}`}
              role="button"
              tabIndex={0}
              className={classNames(
                "catalog-design-comment-item",
                selected && "selected",
                isResolved && "resolved"
              )}
              style={{ "--comment-accent": catColor }}
              onMouseEnter={() => setActiveCommentId(comment.id)}
              onMouseLeave={() => setActiveCommentId("")}
              onFocus={() => setActiveCommentId(comment.id)}
              onBlur={() => setActiveCommentId("")}
              onClick={() => highlightAndScrollComment(comment.id)}
              onKeyDown={(event) => {
                if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  highlightAndScrollComment(comment.id);
                }
              }}
            >
              <div className="catalog-design-comment-item-top">
                {canUpdateCommentStatus && (
                  <button
                    type="button"
                    className={classNames("catalog-design-comment-checkbox", isResolved && "checked")}
                    onClick={(event) => {
                      event.stopPropagation();
                      updateCommentStatus(comment, isResolved ? "abierto" : "resuelto");
                    }}
                    title={isResolved ? "Reabrir observación" : "Marcar como resuelta"}
                    aria-label={isResolved ? "Reabrir observación" : "Marcar como resuelta"}
                  >
                    {isResolved ? <Check size={13}/> : null}
                  </button>
                )}
                <span className="catalog-design-comment-id-badge" style={{ backgroundColor: catColor }} title={`Observación #${commentNumber}`}>
                  #{commentNumber}
                </span>
                <span className="catalog-design-comment-cat-tag" style={{ color: catColor }}>
                  {categoryInfo ? <><categoryInfo.Icon size={12} aria-hidden="true"/> {categoryInfo.label}</> : (comment.tipo || "Observación")}
                </span>
                <span className="catalog-design-comment-meta">{formatDate(comment.fecha_creacion) || "sin fecha"}</span>
                {comment.numero_version && (
                  <span className="catalog-design-comment-version-badge" title={`Observación en versión ${comment.numero_version}`}>
                    v{comment.numero_version}
                  </span>
                )}
                <span className={classNames("catalog-design-comment-status", commentStatus)}>{isResolved ? "Resuelta" : "Pendiente"}</span>
              </div>
              <div className="catalog-design-comment-body-row">
                <strong>{getUserLabel(userById[comment.usuario_id])}</strong>
                <p className={isResolved ? "resolved-text" : ""}>{comment.comentario}</p>
              </div>
              <div className="catalog-design-comment-item-foot">
                {annotationCount > 0 && (
                  <span className="catalog-design-comment-signal" style={{ color: catColor, borderColor: catColor }}>
                    {annotationCount} señal{annotationCount === 1 ? "" : "es"} en la imagen
                  </span>
                )}
              </div>
              <CommentReplies
                comment={comment}
                connection={supabaseConnection}
                canReply={Boolean(isAdminOrMark || (isDesigner && selectedPage?.disenador_id === currentUserId) || (isBuyer && selectedPage?.comprador_id === currentBuyerId))}
                userById={userById}
                getUserLabel={getUserLabel}
                formatDate={formatDate}
                onSaved={() => runAction("Actualizando respuestas...", async () => {}, "Respuesta guardada.", designEvent(selectedPage, "comment", { commentId: comment.id }))}
              />
            </div>
          );
        })}
        {!filteredSelectedComments.length && !isDraftingComment && (
          <div className="empty-state">
            {{
              all: "Aún no hay observaciones para esta página.",
              pending: "No hay observaciones pendientes.",
              resolved: "No hay observaciones resueltas.",
              version: `No hay observaciones en la versión ${activeVersionNumber}.`,
            }[commentFilter] || "No hay observaciones."}
          </div>
        )}
      </div>
    </div>
  );
}
