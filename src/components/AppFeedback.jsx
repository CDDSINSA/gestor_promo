import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  X,
} from "lucide-react";
import { classNames } from "../utils/common";

function ModalButton({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}

export function ConfirmModal({ title, description, note, confirmLabel = "Confirmar", cancelLabel = "Cancelar", icon: Icon = AlertTriangle, onConfirm, onCancel }) {
  return <div className="modal-backdrop" role="presentation"><div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="save-confirm-title"><div className="modal-head"><div><h2 id="save-confirm-title">{title}</h2><p>{description}</p></div><button type="button" className="icon-btn" onClick={onCancel} aria-label="Cerrar confirmacion"><X size={18}/></button></div><div className="modal-body"><p className="modal-note"><Icon size={16}/> {note}</p></div><div className="modal-actions"><ModalButton variant="outline" onClick={onCancel}>{cancelLabel}</ModalButton><ModalButton onClick={onConfirm}>{confirmLabel}</ModalButton></div></div></div>;
}

export function SuccessToast({ toast, onClose }) {
  if (!toast) return null;
  return <div className="success-toast" role="status" aria-live="polite"><div className="success-toast-icon"><CheckCircle2 size={18}/></div><div className="success-toast-copy"><strong>{toast.title}</strong><span>{toast.message}</span></div><button type="button" className="success-toast-close" onClick={onClose} aria-label="Cerrar mensaje"><X size={16}/></button></div>;
}

export function PromotionConflictModal({ conflict, onReload, onMerge, onDiscard }) {
  if (!conflict) return null;
  const fields = Array.isArray(conflict.fields) ? conflict.fields : [];
  return <div className="modal-backdrop" role="presentation"><div className="modal-card conflict-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-conflict-title"><div className="modal-head"><div><h2 id="promotion-conflict-title">Conflicto de promocion</h2><p>La fila cambio en Supabase despues de abrirla.</p></div><button type="button" className="icon-btn" onClick={onMerge} aria-label="Cerrar conflicto"><X size={18}/></button></div><div className="modal-body"><p className="modal-note"><ShieldAlert size={16}/> Revise las diferencias antes de volver a guardar.</p><div className="conflict-summary"><span>Fila: <strong>{conflict.row_id || "Sin row_id"}</strong></span><span>Version local: <strong>{conflict.expected_version || "sin version"}</strong></span><span>Version actual: <strong>{conflict.current_version || "sin version"}</strong></span></div><div className="conflict-fields"><strong>Campos en conflicto</strong>{fields.length ? fields.map((item) => <div className="conflict-field" key={item.field}><span>{item.field}</span><div><small>Local</small><code>{String(item.user ?? "") || "-"}</code></div><div><small>Actual</small><code>{String(item.current ?? "") || "-"}</code></div></div>) : <p>No se recibio detalle de campos desde Supabase.</p>}</div></div><div className="modal-actions"><ModalButton variant="outline" onClick={onDiscard}>Descartar local</ModalButton><ModalButton variant="outline" onClick={onMerge}>Fusionar manual</ModalButton><ModalButton onClick={onReload}>Recargar</ModalButton></div></div></div>;
}
