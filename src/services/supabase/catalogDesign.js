import { assertOk, cleanText, fetchWithTimeout, getHeaders, getSupabaseUrl } from "./config";
import { deleteRowsByValues, patchRowById, selectAll, supabaseRequest, upsertRows } from "./http";

export const CATALOG_DESIGN_WORK_BUCKET = "sns_app_promo";
export const CATALOG_DESIGN_FINAL_BUCKET = "catalogo_final";
export const PAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FINAL_PDF_MAX_BYTES = 80 * 1024 * 1024;

const PAGE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const PROJECT_STATES = new Set(["planificacion", "en_diseno", "en_revision", "aprobado", "consolidado", "cancelado"]);
const PAGE_STATES = new Set(["pendiente", "en_diseno", "en_revision", "ajustes", "aprobada", "rechazada", "lista_consolidar"]);
const COMMENT_TYPES = new Set(["comentario", "observacion", "aprobacion", "rechazo", "ajuste"]);

function requireSession(connection = {}) {
  const session = connection.session || connection.appSession || connection.authSession;
  if (!session?.access_token) {
    throw new Error("No hay sesion activa para usar Supabase.");
  }
  return session;
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

function getPageStoragePath(page, file) {
  if (page?.archivo_path) return page.archivo_path;
  const catalogoId = cleanText(page?.catalogo_id || page?.catalogoId || page?.proyecto?.catalogo_id || page?.proyecto_catalogo_id || page?.proyecto_id);
  const pageNumber = Number(page?.numero_pagina || 0);
  if (!catalogoId || !pageNumber) {
    throw new Error("La pagina debe tener catalogo y numero antes de subir imagen.");
  }
  return `catalogos/${catalogoId}/paginas/pagina_${pageNumber}.${normalizeFileExtension(file)}`;
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

async function insertRow(connection, table, row) {
  const result = await supabaseRequest(connection, `/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return Array.isArray(result) ? result[0] : result;
}

function getCurrentAppUser(connection = {}, fallbackUserId = "") {
  return {
    id: fallbackUserId || connection.appUser?.id || null,
    name: cleanText(connection.appUser?.nombre || connection.appUser?.email || connection.session?.user_email || "Usuario"),
  };
}

function buildRequestId(prefix = "LOG") {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now()}-${random}`;
}

export async function logCatalogDesignPageStateChange(connection, page, nextStatus, options = {}) {
  const previousStatus = cleanText(options.previousStatus ?? page?.estado);
  const newStatus = cleanText(nextStatus);
  if (!page?.id || !newStatus || previousStatus === newStatus) return null;

  const currentUser = getCurrentAppUser(connection, options.currentUserId);
  const action = cleanText(options.action) || "Cambio de estado de pagina de catalogo";

  try {
    return insertRow(connection, "logs", {
      usuario_id: currentUser.id,
      usuario: currentUser.name,
      entidad: "CATALOGO_DISENO_PAGINA",
      entidad_id: page.id,
      accion: action,
      campo: "estado",
      valor_anterior: previousStatus,
      valor_nuevo: newStatus,
      request_id: buildRequestId("CATDIS"),
      created_at: new Date().toISOString(),
      fecha_cierre: ["aprobada", "rechazada", "ajustes"].includes(newStatus) ? new Date().toISOString() : null,
    });
  } catch {
    return null;
  }
}

async function uploadStorageObject(connection, bucket, path, file) {
  const session = requireSession(connection);
  const response = await fetchWithTimeout(`${getSupabaseUrl(connection)}/storage/v1/object/${bucket}/${storagePath(path)}`, {
    method: "POST",
    headers: getHeaders(connection, session.access_token, {
      "Content-Type": file.type || "application/octet-stream",
      "cache-control": "3600",
      "x-upsert": "true",
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

export async function loadCatalogDesignData(connection) {
  const [projects, pages, comments, finals, users, buyers] = await Promise.all([
    selectAll(connection, "catalogo_proyecto_diseno", { order: "fecha_creacion.desc" }),
    selectAll(connection, "catalogo_paginas_diseno", { order: "numero_pagina.asc" }),
    selectAll(connection, "catalogo_pagina_comentarios", { order: "fecha_creacion.desc" }),
    selectAll(connection, "catalogo_consolidado_final", { order: "fecha_creacion.desc" }),
    selectAll(connection, "usuarios_app", { select: "id,auth_user_id,nombre,email,rol,buyer_id,activo", order: "nombre.asc" }),
    selectAll(connection, "compradores", { select: "id,comprador,division,correo,activo", order: "comprador.asc" }),
  ]);

  return { projects, pages, comments, finals, users, buyers };
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

export async function uploadCatalogDesignPageImage(connection, page, project, file, currentUserId) {
  validatePageImage(file);
  const path = getPageStoragePath({ ...page, proyecto: project, catalogo_id: project?.catalogo_id }, file);
  await uploadStorageObject(connection, CATALOG_DESIGN_WORK_BUCKET, path, file);
  const updatedPage = await updateCatalogDesignPage(connection, page.id, {
    archivo_path: path,
    archivo_url: null,
    fecha_ultima_carga: new Date().toISOString(),
    actualizado_por: currentUserId || null,
    estado: "en_revision",
  });
  await logCatalogDesignPageStateChange(connection, page, "en_revision", {
    currentUserId,
    action: "Imagen de pagina actualizada",
    detail: path,
  });
  return updatedPage;
}

export async function addCatalogDesignPageComment(connection, pageId, comment, type, currentUserId) {
  const row = {
    pagina_id: pageId,
    usuario_id: currentUserId || null,
    comentario: cleanText(comment),
    tipo: normalizeState(type, COMMENT_TYPES, "comentario"),
  };
  if (!row.pagina_id || !row.comentario) {
    throw new Error("Ingrese un comentario antes de guardar.");
  }
  return insertRow(connection, "catalogo_pagina_comentarios", row);
}

export async function reviewCatalogDesignPage(connection, page, status, comment, type, currentUserId) {
  const nextStatus = normalizeState(status, PAGE_STATES, "en_revision");
  const [updatedPage] = await Promise.all([
    updateCatalogDesignPage(connection, page.id, {
      estado: nextStatus,
      observacion_actual: cleanText(comment) || page.observacion_actual || null,
      actualizado_por: currentUserId || null,
    }),
    addCatalogDesignPageComment(connection, page.id, comment || (nextStatus === "aprobada" ? "Pagina aprobada." : "Pagina requiere ajustes."), type, currentUserId),
  ]);
  await logCatalogDesignPageStateChange(connection, page, nextStatus, {
    currentUserId,
    action: nextStatus === "aprobada" ? "Pagina aprobada por comprador" : "Pagina rechazada por comprador",
    detail: comment,
  });
  return updatedPage;
}

export async function uploadCatalogDesignFinalPdf(connection, project, file, currentUserId) {
  validateFinalPdf(file);
  const pdfPath = getFinalPdfPath(project);
  await uploadStorageObject(connection, CATALOG_DESIGN_FINAL_BUCKET, pdfPath, file);
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
    pagina_id: `eq.${pageId}`,
    order: "fecha_creacion.desc",
  });
}
