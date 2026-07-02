export function usePromos({
  setRows,
  skuMaster,
  selectedBuyerConfig,
  getMasterDivision,
  normalizeRow,
} = {}) {
  const updateRow = (id, field, value) => setRows((prev) => prev.map((row) => {
    if (row.id !== id) return row;
    const updated = { ...row, [field]: value };
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
      const master = (skuMaster || {})[value];
      if (master) { updated.depId = master.dep_id || ""; updated.dep_id = master.dep_id || ""; updated.numParte = master.vpn; updated.num_parte = master.vpn; updated.descripcion = master.descripcion; updated.precioAntes = master.precio; updated.precio_antes = master.precio; updated.division = getMasterDivision(master, selectedBuyerConfig?.division || updated.division || ""); }
      else { updated.depId = ""; updated.dep_id = ""; updated.numParte = ""; updated.num_parte = ""; updated.descripcion = ""; updated.precioAntes = ""; updated.precio_antes = ""; }
    }
    return normalizeRow(updated);
  }));

  const deleteRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  return { updateRow, deleteRow };
}
