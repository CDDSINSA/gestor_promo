import React, { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { classNames } from "../../utils/common";
import { Field, PAGE_STATES, getPageStateLabel } from "./designPresentation";

const EMPTY_FILTERS = { designer: "", buyer: "", state: "" };

// Filtros de páginas agrupados en un solo botón con contador de filtros activos.
export default function DesignPageFilters({ filters, setFilters, designerOptions, buyerOptions }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const activeCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const setFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));

  return (
    <div className="catalog-design-filters" ref={containerRef}>
      <button
        type="button"
        className={classNames("catalog-design-tool-action-btn", activeCount > 0 && "active")}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal size={15}/> <span>Filtros</span>
        {activeCount > 0 && <span className="catalog-design-pill-count">{activeCount}</span>}
      </button>
      {open && (
        <div className="catalog-design-filters-popover" role="dialog" aria-label="Filtrar páginas">
          <Field label="Diseñador">
            <select value={filters.designer} onChange={(event) => setFilter("designer", event.target.value)}>
              <option value="">Todos los diseñadores</option>
              {designerOptions.map((user) => <option key={user.id} value={user.id}>{user.nombre || user.email}</option>)}
            </select>
          </Field>
          <Field label="Comprador">
            <select value={filters.buyer} onChange={(event) => setFilter("buyer", event.target.value)}>
              <option value="">Todos los compradores</option>
              {buyerOptions.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.comprador}</option>)}
            </select>
          </Field>
          <Field label="Estado">
            <select value={filters.state} onChange={(event) => setFilter("state", event.target.value)}>
              <option value="">Todos los estados</option>
              {PAGE_STATES.map((state) => <option key={state} value={state}>{getPageStateLabel(state)}</option>)}
            </select>
          </Field>
          <div className="catalog-design-filters-actions">
            <button type="button" className="catalog-design-link-btn" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!activeCount}>
              <X size={13}/> Limpiar filtros
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
