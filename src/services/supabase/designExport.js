import { selectAll, selectRowsByValues } from "./http";

// RLS scopes pages and comments to the authenticated user's assignments.
export async function loadDesignExportData(connection, { fullAccess = false } = {}) {
  const [projects, pages, users, buyers, versions] = await Promise.all([
    selectAll(connection, "catalogo_proyecto_diseno", { order: "fecha_creacion.desc" }),
    selectAll(connection, "catalogo_paginas_diseno", { order: "numero_pagina.asc" }),
    selectAll(connection, "usuarios_app", { select: "id,nombre,email", order: "nombre.asc" }),
    selectAll(connection, "compradores", { select: "id,comprador", order: "comprador.asc" }),
    selectAll(connection, "catalogo_pagina_versiones", { order: "numero_version.asc" }).catch(() => []),
  ]);
  const visibleProjectIds = new Set(pages.map((page) => page.proyecto_id));
  const comments = await selectRowsByValues(
    connection,
    "catalogo_pagina_comentarios",
    "pagina_id",
    pages.map((page) => page.id),
    "id,pagina_id,comentario,estado,numero_version"
  );
  return {
    projects: fullAccess ? projects : projects.filter((project) => visibleProjectIds.has(project.id)),
    pages,
    comments,
    users,
    buyers,
    versions: Array.isArray(versions) ? versions : [],
  };
}
