import { assertOk, cleanText, fetchWithTimeout, getHeaders, getSupabaseUrl } from "./config";
import { callRpc, deleteRowsByValues, patchRowById, selectAll, supabaseRequest, upsertRows } from "./http";
import { ensureFreshAppSession } from "./session";

export const CATALOG_DESIGN_WORK_BUCKET = "sns_app_promo";
export const CATALOG_DESIGN_FINAL_BUCKET = "catalogo_final";
export const PAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FINAL_PDF_MAX_BYTES = 80 * 1024 * 1024;

const PAGE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const PROJECT_STATES = new Set(["planificacion", "en_diseno", "en_revision", "aprobado", "consolidado", "cancelado"]);
const PAGE_STATES = new Set(["pendiente", "en_diseno", "en_revision", "ajustes", "aprobada", "rechazada", "lista_consolidar"]);
const COMMENT_TYPES = new Set(["comentario", "observacion", "aprobacion", "rechazo", "ajuste", "precio", "imagen", "general"]);
const COMMENT_STATES = new Set(["abierto", "resuelto"]);
const ANNOTATION_TYPES = new Set(["rect", "circle", "freehand"]);

async function requireSession(connection = {}) {
  const session = connection.session || connection.appSession || connection.authSession;
  if (!session?.access_token) {
    throw new Error("No hay sesion activa para usar Supabase.");
  }
  return ensureFreshAppSession(connection, session);
}

function storagePath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function normalizeState(value, allowed, fallback) {
  const clean = cleanText(value).toLowerCase();
  return allowed.has(clean) ? clean : fallback;
}

function normalizeFileExtension(file) {
  const nameExt = cleanText(file?.name).split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png"].includes(nameExt)) return nameExt === "jpeg" ? "jpg" : nameExt;
  return file?.type === "image/png" ? "png" : "jpg";
}

function getPageStoragePath(page, project, file) {
  if (!page?.id || !project?.catalogo_id) throw new Error("La página debe tener proyecto y catálogo antes de subir imagen.");
  return `catalogos/${project.catalogo_id}/paginas/${page.id}/${crypto.randomUUID()}.${normalizeFileExtension(file)}`;
}

function getFinalPdfPath(project) {
  const catalogoId = cleanText(project?.catalogo_id || project?.catalogoId || project?.id);
  if (!catalogoId) throw new Error("El proyecto debe tener catalogo_id antes de subir PDF final.");
  return `catalogos/${catalogoId}/final/catalogo_final.pdf`;
}

function validatePageImage(file) {
  if (!file) throw new Error("Seleccione una imagen para subir.");
  if (!PAGE_IMAGE_TYPES.has(file.type)) {
    throw new Error("Solo se permiten imagenes JPG, JPEG o PNG.");
  }
  if (file.size > PAGE_IMAGE_MAX_BYTES) {
    throw new Error("La imagen supera el tamano maximo recomendado de 10 MB.");
  }
}

function validateFinalPdf(file) {
  if (!file) throw new Error("Seleccione un PDF final para subir.");
  if (file.type !== "application/pdf" && !cleanText(file.name).toLowerCase().endsWith(".pdf")) {
    throw new Error("Solo se permite subir el catalogo final en formato PDF.");
  }
  if (file.size > FINAL_PDF_MAX_BYTES) {
    throw new Error("El PDF supera el tamano maximo recomendado de 80 MB.");
  }
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function normalizeAnnotations(annotations = []) {
  if (!Array.isArray(annotations)) return [];
  return annotations
    .map((annotation) => {
      const type = cleanText(annotation?.type).toLowerCase();
      if (!ANNOTATION_TYPES.has(type)) return null;
      const color = cleanText(annotation?.color) || "#E53935";
      if (type === "freehand") {
        const points = Array.isArray(annotation.points)
          ? annotation.points.map((point) => ({ x: clampRatio(point?.x), y: clampRatio(point?.y) }))
          : [];
        if (points.length < 2) return null;
        return { type, color, points };
      }
      const x = clampRatio(annotation?.x);
      const y = clampRatio(annotation?.y);
      const width = clampRatio(annotation?.width);
      const height = clampRatio(annotation?.height);
      if (!width || !height) return null;
      return { type, color, x, y, width, height };
    })
    .filter(Boolean);
}

async function insertRow(connection, table, row) {
  const result = await supabaseRequest(connection, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result[0] : result;
}

async function uploadStorageObject(connection, bucket, path, file, upsert = false) {
  const session = await requireSession(connection);
  const response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/storage/v1/object/${bucket}/${storagePath(path)}`, {
    method: "POST",
    headers: getHeaders(connection, session.access_token, {
      "Content-Type": file.type || "application/octet-stream",
      "cache-control": "3600",
      "x-upsert": String(upsert),
    }),
    body: file,
  });
  return assertOk(response, "No se pudo subir el archivo a Supabase Storage.");
}

export async function getCatalogDesignSignedUrl(connection, bucket, path, expiresIn = 3600) {
  if (!path) return "";
  const result = await supabaseRequest(connection, `/storage/v1/object/sign/${bucket}/${storagePath(path)}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn }),
  });
  const signedUrl = result?.signedURL || result?.signedUrl || "";
  if (!signedUrl) return "";
  return signedUrl.startsWith("http") ? signedUrl : `${getSupabaseUrl(connection)}/storage/v1${signedUrl}`;
}

// RLS solo deja a ADMIN/MARK leer otros usuarios. Este directorio (docs/supabase_catalogo_diseno_directorio_usuarios.sql)
// entrega id, nombre y rol de diseñadores y autores de comentarios para que compradores y diseñadores vean los nombres.
// Si la función aún no está instalada se conserva el comportamiento anterior.
async function loadDesignUserDirectory(connection) {
  try {
    const rows = await callRpc(connection, "catalog_design_user_directory");
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function mergeUsers(users = [], directory = []) {
  const byId = new Map(directory.filter((user) => user?.id).map((user) => [user.id, user]));
  users.forEach((user) => {
    if (user?.id) byId.set(user.id, { ...byId.get(user.id), ...user });
  });
  return Array.from(byId.values());
}

export async function loadCatalogDesignData(connection) {
  const [projects, pages, comments, finals, users, buyers, versions, userDirectory] = await Promise.all([
    selectAll(connection, "catalogo_proyecto_diseno", { order: "fecha_creacion.desc" }),
    selectAll(connection, "catalogo_paginas_diseno", { order: "numero_pagina.asc" }),
    selectAll(connection, "catalogo_pagina_comentarios", { select: "*,respuestas:catalogo_pagina_respuestas(*)", order: "fecha_creacion.desc" }),
    selectAll(connection, "catalogo_consolidado_final", { order: "fecha_creacion.desc" }),
    selectAll(connection, "usuarios_app", { select: "id,auth_user_id,nombre,email,rol,buyer_id,activo", order: "nombre.asc" }),
    selectAll(connection, "compradores", { select: "id,comprador,categoria_comprador,division,correo,activo,senior_id", order: "comprador.asc" }),
    selectAll(connection, "catalogo_pagina_versiones", { order: "numero_version.asc" }),
    loadDesignUserDirectory(connection),
  ]);

  return {
    projects,
    pages,
    comments,
    finals,
    users: mergeUsers(users, userDirectory),
    buyers,
    versions: Array.isArray(versions) ? versions : [],
  };
}

// Keep an unconfirmed request ID for retries with the same connection and payload.
const pendingDesignOperations = new WeakMap();
async function runDesignOperation(connection, rpc, payload) {
  let pending = pendingDesignOperations.get(connection);
  if (!pending) { pending = new Map(); pendingDesignOperations.set(connection, pending); }
  const key = JSON.stringify([rpc, payload]);
  const wasPending = pending.has(key);
  const operationId = pending.get(key) || crypto.randomUUID();
  pending.set(key, operationId);
  const body = JSON.stringify({ ...payload, p_operation_id: operationId });
  let failure;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await supabaseRequest(connection, `/rest/v1/rpc/${rpc}`, { method: "POST", body });
      pending.delete(key);
      return result;
    } catch (error) {
      failure = error;
      if (error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
        if (!wasPending && attempt === 0) {
          pending.delete(key);
          throw new Error(`${error.message} No se guardaron cambios.`);
        }
        break;
      }
    }
  }
  throw new Error(`${failure?.message || "Error de guardado."} No se pudo confirmar la operación. Actualice antes de repetirla; si reintenta sin cambiar los datos se conserva su identificador.`);
}

export async function saveCatalogDesignProjectWithPages(connection, project, titles, allowedCatalogIds = null) {
  const catalogoId = cleanText(project.catalogo_id);
  if (!project.id && Array.isArray(allowedCatalogIds) && !allowedCatalogIds.map(cleanText).includes(catalogoId)) {
    throw new Error("El proyecto debe estar ligado a un catálogo disponible en Inicio.");
  }
  if (!cleanText(project.nombre_proyecto) || !Array.isArray(titles) || titles.length < 1 || titles.length > 120) {
    throw new Error("Ingrese nombre y entre 1 y 120 páginas.");
  }
  return runDesignOperation(connection, "save_catalog_design_project", {
    p_project_id: project.id || null,
    p_values: { catalogo_id: catalogoId, nombre_proyecto: cleanText(project.nombre_proyecto),
      estado: normalizeState(project.estado, PROJECT_STATES, "planificacion"),
      fecha_inicio: project.fecha_inicio || null, fecha_entrega: project.fecha_entrega || null },
    p_titles: titles,
    p_expected_updated_at: project.id ? project.fecha_actualizacion : null,
  });
}

export async function createCatalogDesignProject(connection, project, currentUserId, allowedCatalogIds = null) {
  const catalogoId = cleanText(project.catalogo_id);
  if (Array.isArray(allowedCatalogIds) && !allowedCatalogIds.map(cleanText).includes(catalogoId)) {
    throw new Error("El proyecto debe estar ligado a un catalogo creado en Ajustes y visible en Inicio.");
  }
  const row = {
    catalogo_id: catalogoId,
    nombre_proyecto: cleanText(project.nombre_proyecto),
    estado: normalizeState(project.estado, PROJECT_STATES, "planificacion"),
    fecha_inicio: project.fecha_inicio || null,
    fecha_entrega: project.fecha_entrega || null,
    creado_por: currentUserId || null,
  };
  if (!row.catalogo_id || !row.nombre_proyecto) {
    throw new Error("Ingrese catalogo y nombre del proyecto.");
  }
  return insertRow(connection, "catalogo_proyecto_diseno", row);
}

export async function updateCatalogDesignProject(connection, projectId, changes) {
  const row = {
    ...changes,
    fecha_actualizacion: new Date().toISOString(),
  };
  if (row.estado) row.estado = normalizeState(row.estado, PROJECT_STATES, "planificacion");
  return patchRowById(connection, "catalogo_proyecto_diseno", projectId, row);
}

export async function createCatalogDesignPage(connection, page) {
  const row = {
    proyecto_id: page.proyecto_id,
    numero_pagina: Number(page.numero_pagina),
    titulo_pagina: cleanText(page.titulo_pagina) || null,
    disenador_id: page.disenador_id || null,
    comprador_id: page.comprador_id || null,
    estado: normalizeState(page.estado, PAGE_STATES, "pendiente"),
  };
  if (!row.proyecto_id || !row.numero_pagina) {
    throw new Error("Ingrese proyecto y numero de pagina.");
  }
  return insertRow(connection, "catalogo_paginas_diseno", row);
}

export async function updateCatalogDesignPage(connection, pageId, changes) {
  const row = {
    ...changes,
    fecha_actualizacion: new Date().toISOString(),
  };
  if (row.estado) row.estado = normalizeState(row.estado, PAGE_STATES, "pendiente");
  return patchRowById(connection, "catalogo_paginas_diseno", pageId, row);
}

export async function deleteCatalogDesignPages(connection, pageIds = []) {
  const ids = pageIds.filter(Boolean);
  if (!ids.length) return;
  await deleteRowsByValues(connection, "catalogo_paginas_diseno", "id", ids);
}

export async function uploadCatalogDesignPageImage(connection, page, project, file) {
  validatePageImage(file);
  const path = getPageStoragePath(page, project, file);
  await uploadStorageObject(connection, CATALOG_DESIGN_WORK_BUCKET, path, file);
  let failure;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await supabaseRequest(connection, "/rest/v1/rpc/register_catalog_design_version", {
        method: "POST", body: JSON.stringify({ p_page_id: page.id, p_path: path }),
      });
    } catch (error) { failure = error; }
  }
  // Never delete the uploaded file: the response may have been lost after commit.
  throw new Error(`La imagen se subió, pero no se pudo confirmar su versión. Actualice el módulo antes de reintentar. ${failure?.message || ""}`);
}

export async function addCatalogDesignPageComment(connection, pageId, comment, type, currentUserId, annotations = [], numeroVersion = null, versionId = null) {
  const normalizedAnnotations = normalizeAnnotations(annotations);
  const row = {
    pagina_id: pageId,
    usuario_id: currentUserId || null,
    comentario: cleanText(comment),
    tipo: normalizeState(type, COMMENT_TYPES, "comentario"),
    estado: normalizeState(type, COMMENT_TYPES, "comentario") === "aprobacion" ? "resuelto" : "abierto",
  };
  if (numeroVersion) {
    row.numero_version = Number(numeroVersion);
  }
  if (versionId) {
    row.version_id = versionId;
  }
  if (normalizedAnnotations.length) {
    row.anotaciones = normalizedAnnotations;
  }
  if (!row.pagina_id || !row.comentario) {
    throw new Error("Ingrese un comentario antes de guardar.");
  }
  return insertRow(connection, "catalogo_pagina_comentarios", row);
}

export async function updateCatalogDesignPageCommentStatus(connection, commentId, status, currentUserId) {
  const nextStatus = normalizeState(status, COMMENT_STATES, "abierto");
  return patchRowById(connection, "catalogo_pagina_comentarios", commentId, {
    estado: nextStatus,
    fecha_resolucion: nextStatus === "resuelto" ? new Date().toISOString() : null,
    resuelto_por: nextStatus === "resuelto" ? currentUserId || null : null,
  });
}

export async function reviewCatalogDesignPage(connection, page, status, comment, type, currentUserId, annotations = [], numeroVersion = null, versionId = null) {
  if (!["aprobada", "ajustes", "rechazada"].includes(status)) {
    throw new Error("Seleccione aprobar o solicitar ajustes para registrar la revisión.");
  }
  return runDesignOperation(connection, "review_catalog_design_page", {
    p_page_id: page.id, p_status: status, p_comment: cleanText(comment),
    p_annotations: normalizeAnnotations(annotations), p_version_number: Number(numeroVersion),
    p_version_id: versionId || null, p_image_path: page.archivo_path || null,
  });
}

export async function uploadCatalogDesignFinalPdf(connection, project, file, currentUserId) {
  validateFinalPdf(file);
  const pdfPath = getFinalPdfPath(project);
  await uploadStorageObject(connection, CATALOG_DESIGN_FINAL_BUCKET, pdfPath, file, true);
  const rows = await upsertRows(connection, "catalogo_consolidado_final", [{
    proyecto_id: project.id,
    pdf_path: pdfPath,
    pdf_url: null,
    estado: "consolidado",
    consolidado_por: currentUserId || null,
    fecha_consolidacion: new Date().toISOString(),
  }], "proyecto_id");
  await updateCatalogDesignProject(connection, project.id, { estado: "consolidado" });
  return rows[0];
}

export async function loadCatalogDesignComments(connection, pageId) {
  return selectAll(connection, "catalogo_pagina_comentarios", {
    select: "*,respuestas:catalogo_pagina_respuestas(*)",
    pagina_id: `eq.${pageId}`,
    order: "fecha_creacion.desc",
  });
}
