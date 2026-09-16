import { useRef, useState } from "react";

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
    if (field === "sku") {
      const master = masterData[value];
      if (master) { updated.depId = master.dep_id || ""; updated.dep_id = master.dep_id || ""; updated.numParte = master.vpn; updated.num_parte = master.vpn; updated.descripcion = master.descripcion; updated.precioAntes = master.precio; updated.precio_antes = master.precio; updated.division = getMasterDivision(master, selectedBuyerConfig?.division || updated.division || ""); }
      else { updated.depId = ""; updated.dep_id = ""; updated.numParte = ""; updated.num_parte = ""; updated.descripcion = ""; updated.precioAntes = ""; updated.precio_antes = ""; }
    }
    return normalizeRow(updated);
    }));
  };

  return { updateRow, isResolvingSku: pendingCount > 0 };
}
