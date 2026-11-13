// El canasto y el detalle de Fidelización guardan solo el ID del comprador
// (buyer_id -> compradores.id). El nombre se resuelve aquí, desde el maestro
// de compradores que la app ya tiene cargado.

export function buildBuyerNameMap(compradores = []) {
  const map = new Map();
  (compradores || []).forEach((buyer) => {
    const id = String(buyer?.id || "").trim();
    const name = String(buyer?.comprador || buyer?.nombre || "").trim();
    if (id && name) map.set(id, name);
  });
  return map;
}

// `comprador` solo existe en datos locales/demo antiguos; en Supabase ya no se guarda.
export function resolveBuyerName(row, buyerNames) {
  const id = String(row?.buyer_id || "").trim();
  return (id && buyerNames?.get(id)) || String(row?.comprador || "").trim();
}

export function withBuyerName(row, buyerNames) {
  return { ...row, comprador: resolveBuyerName(row, buyerNames) };
}
