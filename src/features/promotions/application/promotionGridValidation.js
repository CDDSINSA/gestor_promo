function mapValidationFieldToCol(field) {
  if (field === "tipo_promo") return "tipoPromo";
  if (field === "aplica_segmento") return "aplicaSegmento";
  if (field === "segmento_cliente") return "segmento";
  if (field === "grupo_oferta") return "grupoOferta";
  if (field === "tipo_sku") return "tipoSku";
  if (field === "cantidad_minima") return "cantidadMinima";
  if (field === "precio_ahora") return "precioAhora";
  return field;
}

function setCellIssue(map, issue, type) {
  if (!issue.rowId || !issue.field) return;
  const colKey = mapValidationFieldToCol(issue.field);
  if (colKey === "beneficio") {
    const priceKey = `${issue.rowId}::precioAhora`;
    const discountKey = `${issue.rowId}::descuento`;
    if (type === "error" || !map.has(priceKey)) map.set(priceKey, { type, message: issue.message });
    if (type === "error" || !map.has(discountKey)) map.set(discountKey, { type, message: issue.message });
    return;
  }
  const cellKey = `${issue.rowId}::${colKey}`;
  if (type === "error" || !map.has(cellKey)) map.set(cellKey, { type, message: issue.message });
}

export function buildPromotionCellIssues(validationIssues = {}) {
  const map = new Map();
  (validationIssues.errors || []).forEach((issue) => setCellIssue(map, issue, "error"));
  (validationIssues.warnings || []).forEach((issue) => setCellIssue(map, issue, "warning"));
  return map;
}
