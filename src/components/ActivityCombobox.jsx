import React, { useEffect, useId, useMemo, useState } from "react";
import { matchActivityOptions } from "../features/margins/marginActivitySearch";

function describe(item) {
  return `${item.nombre} · ${item.id}`;
}

/**
 * Campo con lista desplegable de coincidencias (nombre o ID de catálogo / actividad).
 * Al elegir una opción filtra por su ID exacto; si no se elige, filtra por el texto escrito.
 * Compartido por Márgenes y Consolidado. `options`: [{ id, nombre, tipo }].
 */
export default function ActivityCombobox({
  value,
  onChange,
  options,
  tipoActividad,
  label = "Actividad o catálogo",
  placeholder = "Escriba parte del nombre o ID",
  className = "",
}) {
  const listId = useId();
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => matchActivityOptions(options, query, { tipoActividad }), [options, query, tipoActividad]);

  // Limpiar filtros vacía también el texto visible.
  useEffect(() => { if (!value) setQuery(""); }, [value]);
  useEffect(() => { setActive(0); }, [query]);

  const select = (item) => {
    setQuery(describe(item));
    onChange(item.id);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (!open || !matches.length) {
      if (event.key === "ArrowDown" && matches.length) { setOpen(true); event.preventDefault(); }
      return;
    }
    if (event.key === "ArrowDown") { setActive((index) => Math.min(index + 1, matches.length - 1)); event.preventDefault(); }
    else if (event.key === "ArrowUp") { setActive((index) => Math.max(index - 1, 0)); event.preventDefault(); }
    else if (event.key === "Enter") { select(matches[active]); event.preventDefault(); }
    else if (event.key === "Escape") { setOpen(false); }
  };

  const showList = open && query.trim() !== "";

  return <label className={`filter-field activity-combobox activity-combobox-rich ${className}`.trim()}>
    <span>{label}</span>
    <input
      value={query}
      placeholder={placeholder}
      autoComplete="off"
      role="combobox"
      aria-expanded={showList}
      aria-controls={listId}
      aria-autocomplete="list"
      onFocus={() => setOpen(true)}
      onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      onKeyDown={onKeyDown}
      onChange={(event) => { setQuery(event.target.value); onChange(event.target.value); setOpen(true); }}
    />
    {showList && <div className="activity-combobox-list" role="listbox" id={listId}>
      {matches.length
        ? matches.map((item, index) => <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === active}
          className={index === active ? "active" : ""}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActive(index)}
          onClick={() => select(item)}
        >
          <strong>{item.nombre}</strong>
          <small>{item.id} · {item.tipo === "ESPECIAL" ? "Solicitud especial" : "Catálogo"}</small>
        </button>)
        : <p className="activity-combobox-empty margin-combobox-empty">Sin coincidencias. Se filtrará por el texto escrito.</p>}
    </div>}
  </label>;
}
