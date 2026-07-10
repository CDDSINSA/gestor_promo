function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function getCatalogoAvanceId(catalogo) {
  return catalogo?.id || catalogo?.catalogo_id || catalogo?.actividad_id || catalogo?.actividadId || "";
}

export function getCompradorNombre(comprador) {
  return comprador?.comprador || comprador?.nombre || "";
}

export function getCompradorJunior(comprador) {
  return comprador?.compradorJunior || comprador?.comprador_junior || comprador?.junior || "";
}

export function getCompradorId(comprador) {
  return String(comprador?.comprador_id || comprador?.compradorId || comprador?.id || "").trim();
}

export function getCompradorIdentityKeys(comprador) {
  const values = [
    comprador?.comprador_id,
    comprador?.compradorId,
    comprador?.id,
    comprador?.comprador,
    comprador?.nombre,
    comprador?.correo,
  ];
  const seen = new Set();
  return values
    .map(normalizeKey)
    .filter(Boolean)
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getSeniorIds(comprador) {
  return String(comprador?.senior_id || comprador?.seniorId || comprador?.senior || "")
    .split(/[;|,]/)
    .map((id) => id.trim())
    .filter(Boolean);
}

export function getCompradorCategoria(comprador) {
  return comprador?.categoria_comprador || comprador?.categoriaComprador || comprador?.categoria || "";
}

export function isCompradorJunior(comprador) {
  const categoria = normalizeKey(getCompradorCategoria(comprador));
  return categoria === "junior" || categoria === "jr" || categoria.includes("junior");
}

export function compradorReferencesSenior(junior, senior) {
  const seniorRefs = getSeniorIds(junior).map(normalizeKey).filter(Boolean);
  if (!seniorRefs.length) return false;
  const seniorKeys = getCompradorIdentityKeys(senior);
  return seniorRefs.some((ref) => seniorKeys.includes(ref));
}

export function getJuniorsForSenior(senior, juniors = [], division = "") {
  const directMatches = juniors.filter((junior) => compradorReferencesSenior(junior, senior));
  const matches = directMatches.length
    ? directMatches
    : juniors.filter((junior) => !getSeniorIds(junior).length && getCompradorDivisiones(junior).some((buyerDivision) => sameDivision(buyerDivision, division)));
  return matches.map(getCompradorNombre).filter(Boolean);
}

export function getCompradorDivisiones(comprador) {
  const divisiones = Array.isArray(comprador?.divisiones) && comprador.divisiones.length
    ? comprador.divisiones
    : String(comprador?.divisiones || comprador?.division || "").split(/[;|,]/);
  const seen = new Set();
  return divisiones
    .map((division) => String(division || "").trim())
    .filter(Boolean)
    .filter((division) => {
      const key = normalizeKey(division);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function sameDivision(left, right) {
  return normalizeKey(left) === normalizeKey(right);
}

export function getDivisionOptionsFromCompradores(compradores = [], fallback = []) {
  const seen = new Set();
  const divisiones = [];
  compradores
    .filter((comprador) => comprador?.activo !== false)
    .flatMap(getCompradorDivisiones)
    .forEach((division) => {
      const key = normalizeKey(division);
      if (!key || seen.has(key)) return;
      seen.add(key);
      divisiones.push(division);
    });
  return divisiones.length ? divisiones : fallback;
}

export function buildAvanceKey(catalogoId, division, comprador) {
  return [catalogoId, normalizeKey(division), normalizeKey(comprador)].join("__");
}

export function isAvanceTerminado(avances, catalogoId, division, comprador) {
  return Boolean(avances?.[buildAvanceKey(catalogoId, division, comprador)]?.terminado);
}

export function toggleAvanceTerminado(avances, catalogoId, division, comprador) {
  const key = buildAvanceKey(catalogoId, division, comprador);
  const next = { ...(avances || {}) };
  if (next[key]?.terminado) {
    delete next[key];
  } else {
    next[key] = {
      catalogo_id: catalogoId,
      division,
      comprador,
      terminado: true,
      fecha: new Date().toISOString(),
    };
  }
  return next;
}
