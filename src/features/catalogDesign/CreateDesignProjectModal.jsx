import React from "react";
import { X, Info, Plus } from "lucide-react";
import { Button } from "../../components/ui";
import { Field } from "./designPresentation";

export default function CreateDesignProjectModal({
  setIsCreateProjectModalOpen,
  projectForm,
  setProjectForm,
  catalogoById,
  catalogosTrabajables,
  getCatalogoId,
  buildPageTitle,
  createProject,
  canCreateProject,
  status
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={() => setIsCreateProjectModalOpen(false)}>
      <div className="modal-card catalog-design-create-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Nuevo Proyecto de Diseño</h2>
            <p>Configure el catálogo base y las páginas iniciales para la mesa de trabajo.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setIsCreateProjectModalOpen(false)} aria-label="Cerrar modal">
            <X size={18}/>
          </button>
        </div>
        <div className="modal-body">
          <Field label="Catálogo base *">
            <select
              value={projectForm.catalogo_id}
              onChange={(event) => {
                const catalogo = catalogoById[event.target.value];
                setProjectForm((current) => ({
                  ...current,
                  catalogo_id: event.target.value,
                  nombre_proyecto: catalogo?.nombre ? `Diseño ${catalogo.nombre}` : current.nombre_proyecto,
                  fecha_inicio: catalogo?.vigencia_inicio || catalogo?.fecha_inicio || current.fecha_inicio,
                  fecha_entrega: catalogo?.vigencia_fin || catalogo?.fecha_fin || current.fecha_entrega,
                }));
              }}
            >
              <option value="">Seleccione catálogo...</option>
              {catalogosTrabajables.map((catalogo) => (
                <option key={getCatalogoId(catalogo)} value={getCatalogoId(catalogo)}>
                  {catalogo.nombre || getCatalogoId(catalogo)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nombre del proyecto de diseño *">
            <input
              value={projectForm.nombre_proyecto}
              placeholder="Ej. Diseño Catálogo Octubre 2026"
              onChange={(event) => setProjectForm((current) => ({ ...current, nombre_proyecto: event.target.value }))}
            />
          </Field>
          <div className="catalog-design-two">
            <Field label="Fecha de inicio">
              <input
                type="date"
                value={projectForm.fecha_inicio || ""}
                onChange={(event) => setProjectForm((current) => ({ ...current, fecha_inicio: event.target.value }))}
              />
            </Field>
            <Field label="Fecha límite de entrega">
              <input
                type="date"
                value={projectForm.fecha_entrega || ""}
                onChange={(event) => setProjectForm((current) => ({ ...current, fecha_entrega: event.target.value }))}
              />
            </Field>
          </div>
          <Field label="Total de páginas a generar *">
            <input
              type="number"
              min="1"
              max="120"
              value={projectForm.cantidad_paginas || ""}
              onChange={(event) => setProjectForm((current) => ({ ...current, cantidad_paginas: event.target.value }))}
            />
            <small className="catalog-design-field-hint">
              Se generarán automáticamente las páginas vacías con su nomenclatura oficial (1 a 120 págs).
            </small>
          </Field>
          <div className="catalog-design-name-preview">
            <Info size={16} />
            <span>Nomenclatura inicial de páginas: <strong>{buildPageTitle(1, catalogoById[String(projectForm.catalogo_id || "").trim()])}</strong></span>
          </div>
          {!catalogosTrabajables.length && (
            <div className="empty-state">
              No hay catálogos activos disponibles. Cree primero un catálogo en Ajustes para habilitar proyectos.
            </div>
          )}
        </div>
        <div className="modal-actions">
          <Button variant="outline" type="button" onClick={() => setIsCreateProjectModalOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={createProject}
            disabled={!canCreateProject || status.type === "loading"}
          >
            <Plus size={16}/> Crear Proyecto y Generar Páginas
          </Button>
        </div>
      </div>
    </div>
  );
}
