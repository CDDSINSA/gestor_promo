const keyById = (rows) => new Map(rows.map((row) => [row.id, row]));
const stateLabel = (value) => String(value || "").replace(/_/g, " ");
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function designExcelDate(value) {
  if (!value) return "Sin registro";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Managua", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map(({ type, value: part }) => [type, part]));
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second));
}

export function buildDesignReport(data, catalogos = [], filters = {}, { fullAccess = false } = {}) {
  const catalogs = keyById(catalogos.map((catalog) => ({ ...catalog, id: String(catalog.id || catalog.catalogo_id) })));
  const users = keyById(data.users || []);
  const buyers = keyById(data.buyers || []);

  const commentsByPage = new Map();
  (data.comments || []).forEach((comment) => {
    const list = commentsByPage.get(comment.pagina_id) || [];
    list.push(comment);
    commentsByPage.set(comment.pagina_id, list);
  });

  const versionsByPage = new Map();
  (data.versions || []).forEach((version) => {
    const list = versionsByPage.get(version.pagina_id) || [];
    list.push(version);
    versionsByPage.set(version.pagina_id, list);
  });

  const pagesByProject = new Map();
  (data.pages || []).forEach((page) => {
    if (filters.designer && page.disenador_id !== filters.designer) return;
    if (filters.buyer && page.comprador_id !== filters.buyer) return;
    const list = pagesByProject.get(page.proyecto_id) || [];
    list.push(page);
    pagesByProject.set(page.proyecto_id, list);
  });

  const detailHeaders = [
    "Catálogo ID",
    "Catálogo",
    "Proyecto",
    "Estado del proyecto",
    "Número de página",
    "Título de página",
    "Estado de página",
    "Versión actual",
    "Total versiones",
    "Diseñador",
    "Comprador",
    "Comentarios totales",
    "Comentarios abiertos",
    "Comentarios resueltos",
    "Texto comentarios abiertos",
    "Fecha última carga",
    "Último cambio de estado",
    "Última actualización",
  ];

  const summaryHeaders = [
    "Catálogo ID",
    "Catálogo",
    "Proyecto",
    "Estado del proyecto",
    "Páginas en alcance",
    "Pendientes",
    "En diseño",
    "En revisión",
    "Con ajustes",
    "Rechazadas",
    "Aprobadas",
    "Listas para consolidar",
    "Avance (%)",
    "Diseñadores",
    "Compradores",
    "Comentarios totales",
    "Comentarios abiertos",
    "Comentarios resueltos",
    "Fecha inicio",
    "Fecha entrega",
    "Último cambio de estado",
    "Última actualización",
    "Alcance",
  ];

  const summary = [];
  const detail = [];

  const designerName = (id) => users.get(id)?.nombre || users.get(id)?.email || (id ? "Usuario no disponible" : "Sin asignar");
  const buyerName = (id) => buyers.get(id)?.comprador || (id ? "Comprador no disponible" : "Sin asignar");
  const uniqueNames = (pages, field, label) => [...new Set(pages.map((page) => label(page[field])))].join(" | ");

  (data.projects || []).forEach((project) => {
    const catalogName = catalogs.get(String(project.catalogo_id))?.nombre || project.catalogo_id;
    if (filters.catalog && !normalize(`${catalogName} ${project.catalogo_id} ${project.nombre_proyecto}`).includes(normalize(filters.catalog))) return;
    if (filters.state && project.estado !== filters.state) return;

    const pages = (pagesByProject.get(project.id) || []).sort((a, b) => a.numero_pagina - b.numero_pagina);
    if (!pages.length && (!fullAccess || filters.buyer || filters.designer)) return;

    const comments = pages.flatMap((page) => commentsByPage.get(page.id) || []);
    const open = comments.filter((comment) => comment.estado !== "resuelto");
    const count = (state) => pages.filter((page) => page.estado === state).length;
    const approved = count("aprobada") + count("lista_consolidar");
    const scope = fullAccess ? (filters.buyer || filters.designer ? "Páginas filtradas" : "Proyecto completo") : "Páginas autorizadas";

    summary.push([
      project.catalogo_id,
      catalogName,
      project.nombre_proyecto,
      stateLabel(project.estado),
      pages.length,
      count("pendiente"),
      count("en_diseno"),
      count("en_revision"),
      count("ajustes"),
      count("rechazada"),
      count("aprobada"),
      count("lista_consolidar"),
      pages.length ? Math.round((approved / pages.length) * 100) : 0,
      uniqueNames(pages, "disenador_id", designerName),
      uniqueNames(pages, "comprador_id", buyerName),
      comments.length,
      open.length,
      comments.length - open.length,
      designExcelDate(project.fecha_inicio),
      designExcelDate(project.fecha_entrega),
      designExcelDate(project.fecha_ultimo_estado),
      designExcelDate(project.fecha_actualizacion),
      scope,
    ]);

    pages.forEach((page) => {
      const pageComments = commentsByPage.get(page.id) || [];
      const pageOpen = pageComments.filter((comment) => comment.estado !== "resuelto");
      const pageVersions = versionsByPage.get(page.id) || [];
      const currentVersion = Number(page.version_actual) || (pageVersions.length ? Math.max(...pageVersions.map((v) => Number(v.numero_version) || 1)) : 1);
      const totalVersions = Math.max(pageVersions.length, currentVersion, 1);

      detail.push([
        project.catalogo_id,
        catalogName,
        project.nombre_proyecto,
        stateLabel(project.estado),
        page.numero_pagina,
        page.titulo_pagina || `Página ${page.numero_pagina}`,
        stateLabel(page.estado),
        currentVersion,
        totalVersions,
        designerName(page.disenador_id),
        buyerName(page.comprador_id),
        pageComments.length,
        pageOpen.length,
        pageComments.length - pageOpen.length,
        pageOpen.map((comment) => comment.comentario || "").join("\n").slice(0, 32767),
        designExcelDate(page.fecha_ultima_carga || page.fecha_creacion),
        designExcelDate(page.fecha_ultimo_estado),
        designExcelDate(page.fecha_actualizacion),
      ]);
    });
  });

  return {
    summary: [summaryHeaders, ...summary],
    detail: [detailHeaders, ...detail],
    projectCount: summary.length,
    pageCount: detail.length,
  };
}
