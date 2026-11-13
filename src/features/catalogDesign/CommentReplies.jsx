import React, { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui";
import { addCatalogDesignReply, loadCatalogDesignReplies, MAX_DESIGN_REPLIES } from "../../services/supabase/catalogDesignReplies";
import "./commentReplies.css";

export default function CommentReplies({ comment, connection, canReply, userById, getUserLabel, formatDate, onSaved }) {
  const [replies, setReplies] = useState(comment.respuestas || []);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  useEffect(() => setReplies(comment.respuestas || []), [comment.respuestas]);

  async function submit(event) {
    event.preventDefault();
    if (submitting.current || !text.trim() || !canReply) return;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      const current = await loadCatalogDesignReplies(connection, comment.id);
      setReplies(current);
      const reply = await addCatalogDesignReply(connection, comment.id, text, current);
      setReplies([...current, reply]);
      setText("");
      setEditing(false);
      await onSaved();
    } catch (failure) {
      setError(failure.message || "No se pudo guardar la respuesta.");
      // Another user may have occupied the same slot while this form was open.
      try {
        const current = await loadCatalogDesignReplies(connection, comment.id);
        setReplies(current);
        if (current.length >= MAX_DESIGN_REPLIES) {
          setError("Este comentario ya tiene las dos respuestas permitidas.");
        } else if (/unique|duplicate/i.test(failure.message || "")) {
          setError("Se agregó otra respuesta. Revísela antes de volver a guardar.");
        }
      } catch { /* Preserve the original error and the unsaved draft. */ }
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return (
    <section className="catalog-design-replies" aria-label="Respuestas a la observación" onClick={(event) => event.stopPropagation()}>
      {[...replies].sort((a, b) => a.numero - b.numero).map((reply) => (
        <div className="catalog-design-reply" key={reply.id}>
          <div className="catalog-design-reply-meta">
            <strong>{getUserLabel(userById[reply.usuario_id])}</strong>
            <span>{formatDate(reply.fecha_creacion)}</span>
          </div>
          <p>{reply.comentario}</p>
        </div>
      ))}
      <div className="catalog-design-reply-meta">
        <span>{replies.length}/{MAX_DESIGN_REPLIES} respuestas</span>
        {canReply && replies.length < MAX_DESIGN_REPLIES && !editing && (
          <button type="button" className="catalog-design-comment-status-btn" onClick={() => setEditing(true)}>Responder</button>
        )}
        {replies.length >= MAX_DESIGN_REPLIES && <span>Límite alcanzado</span>}
      </div>
      {editing && canReply && replies.length < MAX_DESIGN_REPLIES && (
        <form className="catalog-design-comment-composer" onSubmit={submit}>
          <label htmlFor={`reply-${comment.id}`}>Respuesta {replies.length + 1} de {MAX_DESIGN_REPLIES}</label>
          <textarea id={`reply-${comment.id}`} value={text} onChange={(event) => setText(event.target.value)} rows={2} disabled={saving} autoFocus />
          <div className="catalog-design-reply-actions">
            <Button type="submit" variant="outline" disabled={saving || !text.trim()}>{saving ? "Guardando..." : "Guardar respuesta"}</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => { setEditing(false); setText(""); setError(""); }}>Cancelar</Button>
          </div>
        </form>
      )}
      {error && <p className="catalog-design-reply-error" role="alert">{error}</p>}
    </section>
  );
}
