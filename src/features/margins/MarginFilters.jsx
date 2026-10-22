import React from "react";
import { Download, Search, X } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { MARGIN_STATUS_FILTER_OPTIONS } from "./marginPresentation";
import ActivityCombobox from "./ActivityCombobox";
import { ABC_FILTER_OPTIONS } from "./abcMarginAnalysis";

export default function MarginFilters({
  filters, onChange, onConsult, onClear, onExport, options, loading, canExport, exportDisabled,
}) {
  const submit = (event) => {
    event.preventDefault();
    onConsult();
  };
  return <Card className="margin-filter-card">
    <CardContent>
      <form onSubmit={submit}>
        <div className="section-head">
          <div>
            <h2>Define qué quieres revisar</h2>
            <p>La consulta se ejecuta solo al presionar Consultar.</p>
          </div>
          <div className="toolbar-actions">
            <Button type="button" variant="outline" onClick={onClear} disabled={loading}><X size={16}/>Limpiar</Button>
            {canExport && <Button type="button" variant="outline" onClick={onExport} disabled={exportDisabled}><Download size={16}/>Exportar Excel</Button>}
            <Button type="submit" disabled={loading}><Search size={16}/>{loading ? "Consultando…" : "Consultar"}</Button>
          </div>
        </div>
        <div className="filter-grid margin-filter-grid">
          <label className="filter-field"><span>Comprador</span>
            <select value={filters.comprador} onChange={(event) => onChange("comprador", event.target.value)}>
              <option value="Todos">Todos los compradores</option>
              {options.compradores.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="filter-field"><span>División</span>
            <select value={filters.division} onChange={(event) => onChange("division", event.target.value)}>
              <option value="Todos">Todas las divisiones</option>
              {options.divisiones.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <label className="filter-field"><span>Tipo de actividad</span>
            <select value={filters.tipoActividad} onChange={(event) => onChange("tipoActividad", event.target.value)}>
              <option value="Todos">Catálogos y especiales</option>
              <option value="CATALOGO">Catálogo</option>
              <option value="ESPECIAL">Solicitud especial</option>
            </select>
          </label>
          <ActivityCombobox value={filters.actividad} onChange={(value) => onChange("actividad", value)} options={options.actividades} tipoActividad={filters.tipoActividad}/>
          <label className="filter-field"><span>Tipo de promoción</span>
            <select value={filters.tipoPromo} onChange={(event) => onChange("tipoPromo", event.target.value)}>
              <option value="Todos">Todos los tipos</option>
              {options.tiposPromo.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="filter-field"><span>SKU o descripción</span>
            <input value={filters.sku} placeholder="Ej. 100245 o taladro" onChange={(event) => onChange("sku", event.target.value)}/>
          </label>
          <label className="filter-field"><span>Estado del margen</span>
            <select value={filters.estado} onChange={(event) => onChange("estado", event.target.value)}>
              {MARGIN_STATUS_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="filter-field"><span>Clasificación ABC</span>
            <select value={filters.abc} onChange={(event) => onChange("abc", event.target.value)}>
              {ABC_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
      </form>
    </CardContent>
  </Card>;
}
