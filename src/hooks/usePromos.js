import { useRef, useState } from "react";
import { priceWithIva } from "../features/promotions/application/promoPrices";

export function usePromos({
  setRows,
  skuMaster,
  lookupSkus,
  onLookupError,
  selectedBuyerConfig,
  getMasterDivision,
  normalizeRow,
  auditUser = "",
} = {}) {
  const revisions = useRef(new Map());
  const [pendingCount, setPendingCount] = useState(0);
  const updateRow = async (id, field, value) => {
    let masterData = skuMaster || {};
    if (field === "sku") {
      value = String(value ?? "").trim();
      const revision = (revisions.current.get(id) || 0) + 1;
      revisions.current.set(id, revision);
      setPendingCount((count) => count + 1);
      try {
        masterData = await lookupSkus([value]);
        if (revisions.current.get(id) !== revision) return;
        onLookupError?.("");
      } catch (error) {
        if (revisions.current.get(id) === revision) onLookupError?.(error.message);
        return;
      } finally {
        setPendingCount((count) => count - 1);
      }
    }
    setRows((prev) => prev.map((row) => {
    if (row.id !== id) return row;
    const updated = { ...row, [field]: value };
    if (field === "precioAhora" || field === "precio_ahora") {
      updated.precioAhora = value;
      updated.precio_ahora = value;
    }
    if (auditUser) {
      updated.usuarioEdita = auditUser;
      updated.usuario_edita = auditUser;
      updated.ultima_modificacion_por = auditUser;
      updated.fecha_modificacion = new Date().toISOString();
    }
    if (field === "aplicaSegmento") {
      updated.aplica_segmento = value;
      if (value !== "SI") { updated.segmento = "Todos"; updated.segmentoCliente = ""; updated.segmento_cliente = ""; }
    }
    if (field === "segmento") {
      updated.aplicaSegmento = value && String(value).toLowerCase() !== "todos" ? "SI" : "NO";
      updated.aplica_segmento = updated.aplicaSegmento;
      updated.segmentoCliente = updated.aplicaSegmento === "SI" ? value : "";
      updated.segmento_cliente = updated.segmentoCliente;
    }
    if (field === "numPagina" || field === "numero_pagina" || field === "num_pagina") {
      const pageVal = value === "" || value === null || value === undefined ? "" : value;
      updated.numPagina = pageVal;
      updated.num_pagina = pageVal;
      updated.numero_pagina = pageVal;
    }
    if (field === "sku") {
      const master = masterData[value];
      if (master) { updated.depId = master.dep_id || ""; updated.dep_id = master.dep_id || ""; updated.numParte = master.vpn; updated.num_parte = master.vpn; updated.descripcion = master.descripcion; updated.precioAntes = priceWithIva(master.precio); updated.precio_antes = updated.precioAntes; updated.division = getMasterDivision(master, selectedBuyerConfig?.division || updated.division || ""); }
      else { updated.depId = ""; updated.dep_id = ""; updated.numParte = ""; updated.num_parte = ""; updated.descripcion = ""; updated.precioAntes = ""; updated.precio_antes = ""; }
    }
    // Promocion de Descuento: si cambia el descuento o el SKU, Ahora c/iva se recalcula
    // desde el precio regular (normalizeRow/toAppRow lo calcula cuando queda vacio).
    const tipoPromo = updated.tipoPromo || updated.tipo_promo || "";
    if (tipoPromo === "Descuento" && (field === "descuento" || field === "sku")) {
      updated.precioAhora = "";
      updated.precio_ahora = "";
    }
    return normalizeRow(updated);
    }));
  };

  return { updateRow, isResolvingSku: pendingCount > 0 };
}
