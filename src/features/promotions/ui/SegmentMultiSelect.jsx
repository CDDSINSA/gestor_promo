import React from "react";
import { ChevronDown } from "lucide-react";
import { classNames } from "../../../utils/common";

export default function SegmentMultiSelect({
  options = [],
  selected = [],
  onChange,
  placeholder = "Seleccione segmento(s)...",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const selectedArray = Array.isArray(selected)
    ? selected
    : typeof selected === "string" && selected
    ? selected.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean)
    : [];

  const handleToggle = (id) => {
    const next = selectedArray.includes(id)
      ? selectedArray.filter((item) => item !== id)
      : [...selectedArray, id];
    onChange?.(next);
  };

  const handleSelectAll = () => {
    if (selectedArray.length === options.length) {
      onChange?.([]);
    } else {
      onChange?.(options.map((opt) => opt.segmento_id || opt.segmento));
    }
  };

  const labelSummary = React.useMemo(() => {
    if (!selectedArray.length) return placeholder;
    if (selectedArray.length === 1) {
      const match = options.find((o) => (o.segmento_id || o.segmento) === selectedArray[0]);
      return match ? `${match.segmento_id ? match.segmento_id + " · " : ""}${match.segmento}` : selectedArray[0];
    }
    return `${selectedArray.length} segmentos seleccionados (${selectedArray.join(" | ")})`;
  }, [selectedArray, options, placeholder]);

  return (
    <div className={classNames("segment-multiselect-container", className)} ref={containerRef}>
      <button
        type="button"
        className={classNames("segment-multiselect-btn", open && "open", disabled && "disabled")}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        disabled={disabled}
      >
        <span className="multiselect-label" title={labelSummary}>{labelSummary}</span>
        <ChevronDown size={15} className={classNames("multiselect-chevron", open && "rotated")} />
      </button>

      {open && (
        <div className="segment-multiselect-dropdown">
          <div className="segment-dropdown-top">
            <button type="button" className="multiselect-toggle-all-btn" onClick={handleSelectAll}>
              {selectedArray.length === options.length ? "Deseleccionar todos" : "Seleccionar todos"}
            </button>
            <span className="multiselect-badge-count">{selectedArray.length} de {options.length}</span>
          </div>
          <div className="segment-dropdown-items">
            {options.map((opt) => {
              const optId = opt.segmento_id || opt.segmento;
              const isChecked = selectedArray.includes(optId);
              return (
                <label key={optId} className={classNames("segment-dropdown-item", isChecked && "checked")}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(optId)}
                  />
                  {opt.segmento_id && <span className="segment-code-badge">{opt.segmento_id}</span>}
                  <span className="segment-name-text">{opt.segmento}</span>
                </label>
              );
            })}
            {options.length === 0 && (
              <div className="segment-dropdown-empty">Sin segmentos disponibles para este canal</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
