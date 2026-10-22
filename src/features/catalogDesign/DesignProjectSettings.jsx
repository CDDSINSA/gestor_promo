import React, { useEffect } from "react";
import { Save, X } from "lucide-react";
import { Button } from "../../components/ui";
import { Field, PROJECT_STATES, formatDate, getProjectStateLabel } from "./designPresentation";

// Configuración del proyecto en un modal: libera el espacio vertical que antes ocupaba la tarjeta fija sobre el visor.
export default function DesignProjectSettings({
  onClose,
  onCancel,
  selectedProject,
  catalogName,
  selectedProjectPageCount,
  canManage,
  saveSelectedProject,
  updateProjectField,
  targetPageCount,
  setTargetPageCount,
  isSaving,
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  if (!selectedProject) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="modal-card catalog-design-create-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-design-settings-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="catalog-design-settings-title">Configuración del proyecto</h2>
            <p>{catalogName ? `Catálogo base: ${catalogName}` : "Proyecto de diseño por páginas"}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onCancel} aria-label="Cerrar configuración">
            <X size={18}/>
          </button>
        </div>
        <div className="modal-body">
          {canManage ? <>
            <Field label="Nombre">
              <input value={selectedProject.nombre_proyecto || ""} onChange={(event) => updateProjectField("nombre_proyecto", event.target.value)} />
            </Field>
            <Field label="Estado">
              <select value={selectedProject.estado || "planificacion"} onChange={(event) => updateProjectField("estado", event.target.value)}>
                {PROJECT_STATES.map((state) => <option key={state} value={state}>{getProjectStateLabel(state)}</option>)}
              </select>
            </Field>
            <div className="catalog-design-two">
              <Field label="Inicio">
                <input type="date" value={selectedProject.fecha_inicio || ""} onChange={(event) => updateProjectField("fecha_inicio", event.target.value)} />
              </Field>
              <Field label="Entrega">
                <input type="date" value={selectedProject.fecha_entrega || ""} onChange={(event) => updateProjectField("fecha_entrega", event.target.value)} />
              </Field>
            </div>
            <Field label="Cantidad de páginas">
              <input type="number" min="1" max="120" value={targetPageCount} onChange={(event) => setTargetPageCount(event.target.value)} />
              <small className="catalog-design-field-hint">
                Cantidad actual: {selectedProjectPageCount} páginas. Si reduce la cantidad, solo se eliminan páginas vacías, sin imagen ni comentarios.
              </small>
            </Field>
          </> : (
            <dl className="catalog-design-settings-readonly">
              <div><dt>Nombre</dt><dd>{selectedProject.nombre_proyecto || "Sin nombre"}</dd></div>
              <div><dt>Estado</dt><dd>{getProjectStateLabel(selectedProject.estado)}</dd></div>
              <div><dt>Inicio</dt><dd>{formatDate(selectedProject.fecha_inicio) || "Sin fecha"}</dd></div>
              <div><dt>Entrega</dt><dd>{formatDate(selectedProject.fecha_entrega) || "Sin fecha"}</dd></div>
              <div><dt>Páginas</dt><dd>{selectedProjectPageCount}</dd></div>
            </dl>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={canManage ? onCancel : onClose}>
            {canManage ? "Cancelar" : "Cerrar"}
          </Button>
          {canManage && (
            <Button type="button" onClick={saveSelectedProject} disabled={isSaving}>
              <Save size={16}/> Guardar proyecto
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
