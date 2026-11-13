import React, { useEffect, useMemo } from "react";
import { AlertCircle, ImageUp, X } from "lucide-react";
import { Button } from "../../components/ui";

export const PAGE_IMAGE_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png"]);
// Mismo límite que valida el servicio (PAGE_IMAGE_MAX_BYTES en services/supabase/catalogDesign.js).
export const PAGE_IMAGE_MAX_MB = 10;

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getPageImageError(file) {
  if (!file) return "Seleccione una imagen.";
  if (!ALLOWED_TYPES.has(file.type)) {
    return "Solo se permiten imágenes JPG o PNG.";
  }
  if (file.size > PAGE_IMAGE_MAX_MB * 1024 * 1024) {
    return `La imagen pesa ${formatBytes(file.size)}. El máximo es ${PAGE_IMAGE_MAX_MB} MB.`;
  }
  return "";
}

// Vista previa y confirmación antes de crear una nueva versión del arte.
export default function UploadConfirmModal({ pending, onConfirm, onCancel, isUploading }) {
  const { page, file } = pending || {};
  const error = getPageImageError(file);
  const previewUrl = useMemo(() => (file && !error ? URL.createObjectURL(file) : ""), [file, error]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !isUploading) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, isUploading]);

  if (!page || !file) return null;
  const pageName = page.titulo_pagina || `Página ${page.numero_pagina}`;
  const nextVersion = page.archivo_path ? (Number(page.version_actual) || 1) + 1 : 1;

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !isUploading && onCancel()}>
      <div className="modal-card catalog-design-upload-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-design-upload-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="catalog-design-upload-title">Subir arte · {pageName}</h2>
            <p>{error ? "Revise el archivo antes de continuar." : `Se guardará como versión v${nextVersion} y la página pasará a revisión.`}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} disabled={isUploading} aria-label="Cerrar">
            <X size={18}/>
          </button>
        </div>
        <div className="modal-body">
          {error ? (
            <div className="modal-error catalog-design-upload-error">
              <AlertCircle size={16} aria-hidden="true"/> <span>{error}</span>
            </div>
          ) : (
            <div className="catalog-design-upload-preview">
              <img src={previewUrl} alt={`Vista previa de ${file.name}`}/>
            </div>
          )}
          <dl className="catalog-design-upload-meta">
            <div><dt>Archivo</dt><dd title={file.name}>{file.name}</dd></div>
            <div><dt>Tamaño</dt><dd>{formatBytes(file.size)}</dd></div>
            <div><dt>Versión actual</dt><dd>{page.archivo_path ? `v${Number(page.version_actual) || 1}` : "Sin arte"}</dd></div>
          </dl>
          {isUploading && (
            <div className="catalog-design-upload-progress" role="status">
              <span className="catalog-design-upload-progress-bar" aria-hidden="true"/>
              <span>Subiendo imagen y registrando la versión...</span>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={onCancel} disabled={isUploading}>Cancelar</Button>
          <Button type="button" onClick={onConfirm} disabled={Boolean(error) || isUploading}>
            <ImageUp size={16}/> {isUploading ? "Subiendo..." : `Subir como v${nextVersion}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
