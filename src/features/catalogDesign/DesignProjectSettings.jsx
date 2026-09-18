import React from "react";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { classNames } from "../../utils/common";
import { Field, PROJECT_STATES, formatDate } from "./designPresentation";

export default function DesignProjectSettings({
  configCollapsed,
  setConfigCollapsed,
  selectedProject,
  selectedProjectPageCount,
  canManage,
  saveSelectedProject,
  updateProjectField,
  targetPageCount,
  setTargetPageCount
}) {
  return (
    <Card className={classNames("catalog-design-config-card", configCollapsed && "collapsed")}>
      <CardContent>
        <div className="toolbar catalog-design-config-toolbar" onClick={() => setConfigCollapsed((v) => !v)} style={{ cursor: "pointer" }}>
          <div>
            <div className="catalog-design-config-title-row">
              <h2>Configuración del catálogo</h2>
              {configCollapsed && selectedProject && (
                <span className="catalog-design-config-pill">
                  <strong>{selectedProject.nombre_proyecto || "Proyecto"}</strong> · {selectedProject.estado || "planificación"} · {selectedProjectPageCount} págs.
                </span>
              )}
            </div>
            <p>{selectedProject?.catalogo_id ? `Catálogo ${selectedProject.catalogo_id}` : "Proyecto de diseño por páginas"}</p>
          </div>
          <div className="toolbar-actions" onClick={(e) => e.stopPropagation()}>
            {canManage && selectedProject && !configCollapsed && (
              <Button variant="outline" onClick={saveSelectedProject}><Save size={16}/> Guardar proyecto</Button>
            )}
            <Button
              variant="outline"
              className="catalog-design-collapse-toggle-btn"
              onClick={() => setConfigCollapsed((v) => !v)}
              title={configCollapsed ? "Expandir configuración" : "Contraer configuración hacia arriba"}
              aria-label={configCollapsed ? "Expandir configuración" : "Contraer configuración hacia arriba"}
            >
              {configCollapsed ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}
              <span>{configCollapsed ? "Expandir" : "Contraer"}</span>
            </Button>
          </div>
        </div>
    
        {!configCollapsed && (
          <>
            {selectedProject && <div className="catalog-design-project-edit">
              {canManage ? <>
                <Field label="Nombre"><input value={selectedProject.nombre_proyecto || ""} onChange={(event) => updateProjectField("nombre_proyecto", event.target.value)} /></Field>
                <Field label="Estado"><select value={selectedProject.estado || "planificacion"} onChange={(event) => updateProjectField("estado", event.target.value)}>{PROJECT_STATES.map((state) => <option key={state} value={state}>{state.replace(/_/g, " ")}</option>)}</select></Field>
                <Field label="Inicio"><input type="date" value={selectedProject.fecha_inicio || ""} onChange={(event) => updateProjectField("fecha_inicio", event.target.value)} /></Field>
                <Field label="Entrega"><input type="date" value={selectedProject.fecha_entrega || ""} onChange={(event) => updateProjectField("fecha_entrega", event.target.value)} /></Field>
                <Field label="Cantidad de paginas"><input type="number" min="1" max="120" value={targetPageCount} onChange={(event) => setTargetPageCount(event.target.value)} /></Field>
              </> : <p className="readonly">Estado del proyecto: {selectedProject.estado}. Entrega: {formatDate(selectedProject.fecha_entrega) || "sin fecha"}.</p>}
            </div>}
            {selectedProject && canManage && <p className="catalog-design-name-preview">Cantidad actual: {selectedProjectPageCount} paginas. Si reduces, solo se eliminan paginas vacias sin imagen ni comentarios.</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
