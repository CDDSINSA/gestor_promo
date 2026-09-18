import React from "react";
import { Plus, Save, CheckCircle2, XCircle, Check, RefreshCw } from "lucide-react";
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
  designEvent
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
    
      {/* Filtros rápidos de comentarios: Todos, Pendientes, Resueltos */}
      {selectedComments.length > 0 && (
        <div className="catalog-design-comment-filter-pills" role="tablist">
          <button
            type="button"
            className={classNames("catalog-design-filter-pill", commentFilter === "all" && "active")}
            onClick={() => setCommentFilter("all")}
          >
            Todas ({selectedComments.length})
          </button>
          <button
            type="button"
            className={classNames("catalog-design-filter-pill", commentFilter === "pending" && "active")}
            onClick={() => setCommentFilter("pending")}
          >
            Pendientes ({pendingCommentsCount})
          </button>
          <button
            type="button"
            className={classNames("catalog-design-filter-pill", commentFilter === "resolved" && "active")}
            onClick={() => setCommentFilter("resolved")}
          >
            Resueltas ({resolvedCommentsCount})
          </button>
        </div>
      )}
    
      {/* Integrated Comment Composer */}
      {isDraftingComment && selectedPage && (
        <div className="catalog-design-comment-composer">
          <div className="catalog-design-composer-head">
            <strong>Nueva observación</strong>
            {pendingAnnotationCount > 0 && (
              <span className="catalog-design-composer-signal-tag">
                {pendingAnnotationCount} señal{pendingAnnotationCount === 1 ? "" : "es"} en imagen
              </span>
            )}
          </div>
          <div className="catalog-design-category-selector" role="radiogroup" aria-label="Categoría de observación">
            {COMMENT_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={classNames("catalog-design-cat-pill", commentCategory === cat.id && "selected")}
                style={{ "--cat-color": cat.color }}
                onClick={() => setCommentCategory(cat.id)}
              >
                <span>{cat.icon}</span> {cat.label}
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
            <Button variant="outline" onClick={addComment} disabled={!commentText.trim()}>
              <Save size={15}/> Guardar
            </Button>
            {canReviewSelectedPage && (
              <>
                <Button onClick={() => reviewPage("aprobada", "aprobacion")} title="Aprobar página">
                  <CheckCircle2 size={15}/> Aprobar
                </Button>
                <Button variant="outline" onClick={() => reviewPage("ajustes", "rechazo")} title="Enviar a ajustes">
                  <XCircle size={15}/> Rechazar
                </Button>
              </>
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
            >
              <div className="catalog-design-comment-item-top">
                {canUpdateCommentStatus ? (
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
                ) : (
                  <div className="catalog-design-comment-id-badge" style={{ backgroundColor: catColor }}>
                    #{commentNumber}
                  </div>
                )}
                <span className="catalog-design-comment-cat-tag" style={{ color: catColor }}>
                  {categoryInfo ? `${categoryInfo.icon} ${categoryInfo.label}` : (comment.tipo || "Observación")}
                </span>
                <span className="catalog-design-comment-meta">{formatDate(comment.fecha_creacion) || "sin fecha"}</span>
                <span className={classNames("catalog-design-comment-status", commentStatus)}>{commentStatus}</span>
              </div>
              <div className="catalog-design-comment-body-row">
                <strong>{getUserLabel(userById[comment.usuario_id])}</strong>
                <p className={isResolved ? "resolved-text" : ""}>{comment.comentario}</p>
              </div>
              <div className="catalog-design-comment-item-foot">
                {annotationCount > 0 ? (
                  <span className="catalog-design-comment-signal" style={{ color: catColor, borderColor: catColor }}>
                    Pin #{commentNumber} ({annotationCount} señal{annotationCount === 1 ? "" : "es"})
                  </span>
                ) : <span />}
                {canUpdateCommentStatus && (
                  <button
                    type="button"
                    className="catalog-design-comment-status-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      updateCommentStatus(comment, isResolved ? "abierto" : "resuelto");
                    }}
                    title={isResolved ? "Reabrir observación" : "Marcar como resuelta"}
                  >
                    {isResolved ? <RefreshCw size={12}/> : <CheckCircle2 size={12}/>}
                    <span>{isResolved ? "Reabrir" : "Resolver"}</span>
                  </button>
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
            {commentFilter === "all" ? "Aún no hay observaciones para esta página." : `No hay observaciones ${commentFilter === "pending" ? "pendientes" : "resueltas"}.`}
          </div>
        )}
      </div>
    </div>
  );
}
