// Divisiones de un catálogo en Ajustes.
// Se guarda divisiones = [] para "Todas" (así lo leen Avances y el resto de la app).
// Un catálogo sin ninguna división elegida se marca con divisionesPendientes (solo en pantalla)
// y no se puede guardar.

export function getCatalogosSinDivisiones(catalogos = []) {
  return (catalogos || []).filter((catalogo) => catalogo?.divisionesPendientes === true);
}

// Quita la marca de pantalla antes de guardar.
export function stripCatalogDraftFlags(catalogos = []) {
  return (catalogos || []).map((catalogo) => {
    if (!catalogo || !("divisionesPendientes" in catalogo)) return catalogo;
    const { divisionesPendientes, ...rest } = catalogo;
    return rest;
  });
}
