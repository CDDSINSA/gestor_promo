import { assertOk, cleanText, fetchWithTimeout, getHeaders, getSupabaseUrl } from "./config";
import { deleteRowsByValues, patchRowById, selectAll, supabaseRequest, upsertRows } from "./http";
import { ensureFreshAppSession } from "./session";

export const CATALOG_DESIGN_WORK_BUCKET = "sns_app_promo";
export const CATALOG_DESIGN_FINAL_BUCKET = "catalogo_final";
export const PAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const FINAL_PDF_MAX_BYTES = 80 * 1024 * 1024;

const PAGE_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const PROJECT_STATES = new Set(["planificacion", "en_diseno", "en_revision", "aprobado", "consolidado", "cancelado"]);
const PAGE_STATES = new Set(["pendiente", "en_diseno", "en_revision", "ajustes", "aprobada", "rechazada", "lista_consolidar"]);
const COMMENT_TYPES = new Set(["comentario", "observacion", "aprobacion", "rechazo", "ajuste"]);
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

async function uploadStorageObject(connection, bucket, path, file) {
  const session = await requireSession(connection);
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
    selectAll(connection, "compradores", { select: "id,comprador,categoria_comprador,division,correo,activo,senior_id", order: "comprador.asc" }),
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
  return updatedPage;
}

export async function addCatalogDesignPageComment(connection, pageId, comment, type, currentUserId, annotations = []) {
  const normalizedAnnotations = normalizeAnnotations(annotations);
  const row = {
    pagina_id: pageId,
    usuario_id: currentUserId || null,
    comentario: cleanText(comment),
    tipo: normalizeState(type, COMMENT_TYPES, "comentario"),
    estado: normalizeState(type, COMMENT_TYPES, "comentario") === "aprobacion" ? "resuelto" : "abierto",
  };
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

export async function reviewCatalogDesignPage(connection, page, status, comment, type, currentUserId, annotations = []) {
  const nextStatus = normalizeState(status, PAGE_STATES, "en_revision");
  const [updatedPage] = await Promise.all([
    updateCatalogDesignPage(connection, page.id, {
      estado: nextStatus,
      observacion_actual: cleanText(comment) || page.observacion_actual || null,
      actualizado_por: currentUserId || null,
    }),
    addCatalogDesignPageComment(connection, page.id, comment || (nextStatus === "aprobada" ? "Pagina aprobada." : "Pagina requiere ajustes."), type, currentUserId, annotations),
  ]);
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
