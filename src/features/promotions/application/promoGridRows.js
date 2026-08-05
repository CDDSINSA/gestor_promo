import { BUY_X_GET_X_PROMO_TYPES } from "../../../constants";
import { getColumnsForPromoType } from "../../../promoTypes/promoTypeEngine";
import { classNames, makeId } from "../../../utils/common";
import {
  isComboRewardRole,
  isSegmentedRow,
  normalizeAlcanceType,
  normalizeCanal,
  pickPromoFieldValue,
  pickPromoFieldValueOr,
  resolveOfferId,
} from "../../../utils/promoHelpers";

export function toAppRow(row) {
  const segmentValue = row.segmentoCliente || row.segmento_cliente || row.segmento || "";
  const aplicaSegmento = isSegmentedRow({ ...row, segmento: segmentValue }) ? "SI" : "NO";
  const rowId = row.row_id || row.id || makeId("ROW");
  const activityId = row.actividadId || row.actividad_id || row.catalogo_id || "";
  const tipoPromo = row.tipoPromo || row.tipo_promo || "";
  const grupoOferta = row.grupoOferta || row.grupo_oferta || "";
  const offerId = resolveOfferId(row, rowId, activityId, tipoPromo, grupoOferta);
  const compradorId = row.comprador_id || row.compradorId || "";
  const usuarioCrea = row.usuarioCrea || row.usuario_crea || "";
  const usuarioEdita = row.usuarioEdita || row.usuario_edita || row.ultima_modificacion_por || "";
  return {
    ...row,
    id: rowId,
    row_id: rowId,
    actividadId: activityId,
    actividad_id: activityId,
    ofertaId: offerId,
    oferta_id: offerId,
    tipoPromo,
    tipo_promo: tipoPromo,
    grupoOferta,
    grupo_oferta: grupoOferta,
    compradorId,
    comprador_id: compradorId,
    tipoSku: row.tipoSku || row.tipo_sku || "",
    tipo_sku: row.tipo_sku || row.tipoSku || "",
    variante: row.variante || "",
    numParte: row.numParte || row.num_parte || "",
    num_parte: row.num_parte || row.numParte || "",
    tipoCantidad: row.tipoCantidad || row.tipo_cantidad || "Exacta",
    tipo_cantidad: row.tipo_cantidad || row.tipoCantidad || "Exacta",
    cantidadMinima: pickPromoFieldValueOr(1, row.cantidadMinima, row.cantidad_minima),
    cantidad_minima: pickPromoFieldValueOr(1, row.cantidad_minima, row.cantidadMinima),
    precioAntes: pickPromoFieldValue(row.precioAntes, row.precio_antes),
    precio_antes: pickPromoFieldValue(row.precio_antes, row.precioAntes),
    precioAhora: pickPromoFieldValue(row.precioAhora, row.precio_ahora),
    precio_ahora: pickPromoFieldValue(row.precio_ahora, row.precioAhora),
    comentario: row.comentario || row.comentario_comprador || "",
    comentario_comprador: row.comentario_comprador || row.comentario || "",
    aplicaSegmento,
    aplica_segmento: aplicaSegmento,
    segmento: aplicaSegmento === "SI" ? segmentValue || "" : "Todos",
    segmentoCliente: aplicaSegmento === "SI" ? segmentValue || "" : "",
    segmento_cliente: aplicaSegmento === "SI" ? segmentValue || "" : "",
    alcanceTipo: normalizeAlcanceType(row.alcanceTipo || row.alcance_tipo),
    alcance_tipo: normalizeAlcanceType(row.alcance_tipo || row.alcanceTipo),
    alcanceValor: row.alcanceValor || row.alcance_valor || "",
    alcance_valor: row.alcance_valor || row.alcanceValor || "",
    usuarioCrea,
    usuario_crea: usuarioCrea,
    usuarioEdita,
    usuario_edita: usuarioEdita,
    ultima_modificacion_por: row.ultima_modificacion_por || usuarioEdita,
  };
}

export function getGridColumnsForPromoType(type) {
  const columns = getColumnsForPromoType(type);
  return ["sku", ...columns.filter((column) => column !== "sku")];
}

export function getPromoRowClass(row) {
  if (!["Combo", ...BUY_X_GET_X_PROMO_TYPES].includes(row.tipoPromo || row.tipo_promo)) return "";
  const role = normalizeCanal(row.tipoSku || row.tipo_sku);
  return classNames(role === "principal" && "row-principal", isComboRewardRole(role) && "row-reward");
}

export function hasDiscountWarning(row) {
  const before = Number(row.precioAntes);
  const now = Number(row.precioAhora);
  if (!before || Number.isNaN(before) || Number.isNaN(now) || row.descuento === "" || now === "") return false;
  const expected = Math.round((1 - now / before) * 100);
  const typed = Number(String(row.descuento).replace("%", ""));
  if (Number.isNaN(typed)) return false;
  return Math.abs(expected - typed) > 1;
}
