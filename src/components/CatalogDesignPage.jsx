import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Eye,
  ImageUp,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Square,
  Undo2,
  ZoomIn,
  ZoomOut,
  X,
  XCircle,
} from "lucide-react";
import { PERMISSIONS, normalizeRole, ROLES } from "../constants/permissions";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import {
  CATALOG_DESIGN_WORK_BUCKET,
  addCatalogDesignPageComment,
  createCatalogDesignPage,
  createCatalogDesignProject,
  deleteCatalogDesignPages,
  getCatalogDesignSignedUrl,
  loadCatalogDesignData,
  reviewCatalogDesignPage,
  updateCatalogDesignPageCommentStatus,
  updateCatalogDesignPage,
  updateCatalogDesignProject,
  uploadCatalogDesignPageImage,
} from "../services/supabaseService";
import { isCompradorJunior } from "../utils/avanceHelpers";
import { classNames, normalizeValue } from "../utils/common";
import { Button, Card, CardContent, Header } from "./ui";

const PROJECT_STATES = ["planificacion", "en_diseno", "en_revision", "aprobado", "consolidado", "cancelado"];
const PAGE_STATES = ["pendiente", "en_diseno", "en_revision", "ajustes", "aprobada", "rechazada", "lista_consolidar"];
const ANNOTATION_COLOR = "#E53935";
const ANNOTATION_TOOLS = [
  ["rect", "Rectangulo", Square],
  ["circle", "Circulo", Circle],
  ["freehand", "Libre", Pencil],
];

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function StateBadge({ state }) {
  const normalized = String(state || "pendiente").toLowerCase();
  return <span className={classNames("catalog-design-badge", `catalog-design-state-${normalized.replace(/_/g, "-")}`)}>{normalized.replace(/_/g, " ")}</span>;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toLocaleDateString();
}

function getUserLabel(user) {
  return user ? `${user.nombre || user.email || "Usuario"}${user.rol ? ` (${user.rol})` : ""}` : "Sin asignar";
}

function getBuyerLabel(buyer) {
  return buyer ? `${buyer.comprador || "Comprador"}${buyer.division ? ` - ${buyer.division}` : ""}` : "Sin asignar";
}

function getCatalogoId(catalogo) {
  return String(catalogo?.id || catalogo?.catalogo_id || "").trim();
}

function isCatalogoTrabajable(catalogo) {
  return Boolean(getCatalogoId(catalogo)) && String(catalogo?.estado || "").toLowerCase() !== "cerrado";
}

function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMonthCode(value) {
  const text = normalizeTextKey(value);
  const months = [
    ["ENERO", "ENE"],
    ["FEBRERO", "FEB"],
    ["MARZO", "MAR"],
    ["ABRIL", "ABR"],
    ["MAYO", "MAY"],
    ["JUNIO", "JUN"],
    ["JULIO", "JUL"],
    ["AGOSTO", "AGO"],
    ["SEPTIEMBRE", "SEP"],
    ["SETIEMBRE", "SEP"],
    ["OCTUBRE", "OCT"],
    ["NOVIEMBRE", "NOV"],
    ["DICIEMBRE", "DIC"],
  ];
  return months.find(([month]) => text.includes(month))?.[1] || "";
}

function getYearCode(value) {
  const match = String(value || "").match(/\b(20\d{2}|\d{2})\b/);
  return match ? match[1].slice(-2) : "";
}

function getCatalogDesignSuffix(catalogo) {
  const name = normalizeTextKey(catalogo?.nombre || catalogo?.nombre_actividad || catalogo?.catalogo_id || catalogo?.id);
  const words = name.split(" ").filter(Boolean);
  const prefix = words.find((word) => word.startsWith("BIF")) ? "BIF" : (words[0] || "CAT").slice(0, 3);
  const dateText = `${catalogo?.nombre || ""} ${catalogo?.vigencia_inicio || ""} ${catalogo?.fecha_inicio || ""}`;
  const monthFromDate = catalogo?.vigencia_inicio ? new Date(catalogo.vigencia_inicio).toLocaleString("es-NI", { month: "short" }).slice(0, 3).toUpperCase() : "";
  const month = getMonthCode(dateText) || normalizeTextKey(monthFromDate).slice(0, 3) || "MES";
  const year = getYearCode(`${catalogo?.nombre || ""} ${catalogo?.vigencia_inicio || ""} ${catalogo?.fecha_inicio || ""}`) || "00";
  return `${prefix}_${month}_${year}`;
}

function buildPageTitle(pageNumber, catalogo) {
  return `Pag-${pageNumber}_${getCatalogDesignSuffix(catalogo)}`;
}

function buildInitialProject(catalogos = []) {
  const first = catalogos.find(isCatalogoTrabajable);
  return {
    catalogo_id: getCatalogoId(first),
    nombre_proyecto: first?.nombre ? `Diseño ${first.nombre}` : "",
    estado: "planificacion",
    fecha_inicio: "",
    fecha_entrega: "",
    cantidad_paginas: 1,
  };
}

function getPromoField(row = {}, ...fields) {
  for (const field of fields) {
    const value = normalizeValue(row[field]);
    if (value) return value;
  }
  return "";
}

function normalizeSkuKey(value) {
  return normalizeValue(value).toLowerCase();
}

function formatSkuInfoValue(value) {
  return normalizeValue(value) || "Sin dato";
}

function getCommentStatus(comment) {
  return String(comment?.estado || "abierto").toLowerCase() === "resuelto" ? "resuelto" : "abierto";
}

function clampRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function normalizeCommentAnnotations(comment) {
  const raw = comment?.anotaciones || comment?.annotations || [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function stripDraftCoordinates(annotation) {
  const { startX, startY, ...clean } = annotation || {};
  return clean;
}

function buildBoxAnnotation(tool, startPoint, endPoint) {
  const startX = Number.isFinite(startPoint?.startX) ? startPoint.startX : startPoint?.x;
  const startY = Number.isFinite(startPoint?.startY) ? startPoint.startY : startPoint?.y;
  const endX = endPoint?.x ?? startX;
  const endY = endPoint?.y ?? startY;
  return {
    type: tool,
    color: ANNOTATION_COLOR,
    startX,
    startY,
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function isUsefulAnnotation(annotation) {
  if (!annotation) return false;
  if (annotation.type === "freehand") return Array.isArray(annotation.points) && annotation.points.length > 1;
  return Number(annotation.width) > 0.008 && Number(annotation.height) > 0.008;
}

function getAnnotationAnchor(annotation) {
  if (!annotation) return { x: 0.5, y: 0.5 };
  if (annotation.type === "freehand" && Array.isArray(annotation.points) && annotation.points.length) {
    const totals = annotation.points.reduce((acc, point) => ({ x: acc.x + clampRatio(point.x), y: acc.y + clampRatio(point.y) }), { x: 0, y: 0 });
    return { x: totals.x / annotation.points.length, y: totals.y / annotation.points.length };
  }
  return {
    x: clampRatio(annotation.x) + clampRatio(annotation.width) / 2,
    y: clampRatio(annotation.y) + clampRatio(annotation.height) / 2,
  };
}

function renderAnnotation(annotation, key, className = "", eventProps = {}) {
  if (!annotation) return null;
  const color = annotation.color === "#FFC72C" ? ANNOTATION_COLOR : annotation.color || ANNOTATION_COLOR;
  const title = annotation.commentText ? `${annotation.commentType || "comentario"}: ${annotation.commentText}` : "";
  if (annotation.type === "freehand") {
    const points = Array.isArray(annotation.points)
      ? annotation.points.map((point) => `${clampRatio(point.x)},${clampRatio(point.y)}`).join(" ")
      : "";
    if (!points) return null;
    return <polyline key={key} className={className} points={points} fill="none" stroke={color} strokeWidth="0.006" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" {...eventProps}>{title && <title>{title}</title>}</polyline>;
  }
  const x = clampRatio(annotation.x);
  const y = clampRatio(annotation.y);
  const width = clampRatio(annotation.width);
  const height = clampRatio(annotation.height);
  if (!width || !height) return null;
  if (annotation.type === "circle") {
    return <ellipse key={key} className={className} cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill="rgba(229,57,53,0.14)" stroke={color} strokeWidth="0.006" vectorEffect="non-scaling-stroke" {...eventProps}>{title && <title>{title}</title>}</ellipse>;
  }
  return <rect key={key} className={className} x={x} y={y} width={width} height={height} fill="rgba(229,57,53,0.14)" stroke={color} strokeWidth="0.006" vectorEffect="non-scaling-stroke" {...eventProps}>{title && <title>{title}</title>}</rect>;
}

export default function CatalogDesignPage({ catalogos = [], rows = [], supabaseConnection, supabaseReady }) {
  const { appUser, role } = useAuth();
  const { can } = usePermissions();
  const currentRole = normalizeRole(role || appUser?.rol);
  const isAdminOrMark = currentRole === ROLES.ADMIN || currentRole === ROLES.MARK;
  const isBuyer = currentRole === ROLES.BUYER;
  const isDesigner = currentRole === ROLES.DESIGNER;
  const canManage = can(PERMISSIONS.MANAGE_CATALOG_DESIGN);
  const canUpload = can(PERMISSIONS.UPLOAD_CATALOG_PAGE);
  const canReview = can(PERMISSIONS.REVIEW_CATALOG_PAGE);
  const currentUserId = appUser?.id || "";
  const currentBuyerId = appUser?.buyer_id || "";
  const catalogosTrabajables = useMemo(() => catalogos.filter(isCatalogoTrabajable), [catalogos]);
  const catalogoById = useMemo(() => Object.fromEntries(catalogosTrabajables.map((catalogo) => [getCatalogoId(catalogo), catalogo])), [catalogosTrabajables]);
  const catalogoIdsTrabajables = useMemo(() => new Set(catalogosTrabajables.map(getCatalogoId)), [catalogosTrabajables]);
  const imageShellRef = useRef(null);

  const [projects, setProjects] = useState([]);
  const [pages, setPages] = useState([]);
  const [comments, setComments] = useState([]);
  const [users, setUsers] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPageId, setSelectedPageId] = useState("");
  const [projectForm, setProjectForm] = useState(() => buildInitialProject(catalogos));
  const [filters, setFilters] = useState({ designer: "", buyer: "", state: "" });
  const [commentText, setCommentText] = useState("");
  const [signedUrls, setSignedUrls] = useState({});
  const [viewerZoom, setViewerZoom] = useState(100);
  const [commentPanelOpen, setCommentPanelOpen] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationTool, setAnnotationTool] = useState("rect");
  const [draftAnnotations, setDraftAnnotations] = useState([]);
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [activeCommentId, setActiveCommentId] = useState("");
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);
  const [targetPageCount, setTargetPageCount] = useState("");
  const [projectPanelCollapsed, setProjectPanelCollapsed] = useState(false);
  const [skuFinderOpen, setSkuFinderOpen] = useState(false);
  const [skuQuery, setSkuQuery] = useState("");
  const [skuSearchTerm, setSkuSearchTerm] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const scopedProjectIds = useMemo(() => new Set(pages
    .filter((page) => {
      if (isAdminOrMark) return true;
      if (isDesigner) return page.disenador_id === currentUserId;
      if (isBuyer) return page.comprador_id === currentBuyerId;
      return false;
    })
    .map((page) => page.proyecto_id)
    .filter(Boolean)), [pages, isAdminOrMark, isDesigner, isBuyer, currentUserId, currentBuyerId]);
  const visibleProjects = useMemo(() => projects.filter((project) => {
    const catalogoId = String(project.catalogo_id || "").trim();
    if (catalogoIdsTrabajables.has(catalogoId)) return true;
    return !isAdminOrMark && scopedProjectIds.has(project.id);
  }), [projects, catalogoIdsTrabajables, scopedProjectIds, isAdminOrMark]);
  const hiddenProjectCount = isAdminOrMark ? projects.length - visibleProjects.length : 0;
  const canCreateProject = canManage
    && catalogoIdsTrabajables.has(String(projectForm.catalogo_id || "").trim())
    && Boolean(String(projectForm.nombre_proyecto || "").trim())
    && Number(projectForm.cantidad_paginas || 0) > 0;
  const userById = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user])), [users]);
  const buyerById = useMemo(() => Object.fromEntries(buyers.map((buyer) => [buyer.id, buyer])), [buyers]);
  const projectById = useMemo(() => Object.fromEntries(visibleProjects.map((project) => [project.id, project])), [visibleProjects]);
  const selectedProject = projectById[selectedProjectId] || visibleProjects[0] || null;
  const selectedPage = pages.find((page) => page.id === selectedPageId) || null;
  const selectedProjectCatalogo = selectedProject ? catalogoById[String(selectedProject.catalogo_id || "").trim()] : null;
  const commentCountByPageId = useMemo(() => {
    return comments.reduce((acc, comment) => {
      acc[comment.pagina_id] = (acc[comment.pagina_id] || 0) + 1;
      return acc;
    }, {});
  }, [comments]);

  const designerOptions = useMemo(() => {
    const allowedRoles = new Set([ROLES.DESIGNER, ROLES.MARK, ROLES.ADMIN]);
    return users.filter((user) => user.activo !== false && allowedRoles.has(normalizeRole(user.rol)));
  }, [users]);
  const seniorBuyerFilterOptions = useMemo(() => buyers.filter((buyer) => buyer.activo !== false && !isCompradorJunior(buyer)), [buyers]);

  const visiblePages = useMemo(() => {
    return pages.filter((page) => {
      if (page.proyecto_id !== selectedProject?.id) return false;
      if (!isAdminOrMark && isDesigner && page.disenador_id !== currentUserId) return false;
      if (!isAdminOrMark && isBuyer && page.comprador_id !== currentBuyerId) return false;
      if (filters.designer && page.disenador_id !== filters.designer) return false;
      if (filters.buyer && page.comprador_id !== filters.buyer) return false;
      if (filters.state && page.estado !== filters.state) return false;
      return true;
    });
  }, [pages, selectedProject, isAdminOrMark, isDesigner, isBuyer, currentUserId, currentBuyerId, filters]);

  const selectedProjectPages = useMemo(() => pages.filter((page) => page.proyecto_id === selectedProject?.id), [pages, selectedProject]);
  const selectedProjectPageCount = selectedProjectPages.length;
  const metrics = useMemo(() => {
    const total = selectedProjectPages.length;
    const count = (states) => selectedProjectPages.filter((page) => states.includes(page.estado)).length;
    const aprobadas = count(["aprobada"]);
    const listas = count(["lista_consolidar"]);
    return {
      total,
      pendientes: count(["pendiente"]),
      revision: count(["en_revision"]),
      aprobadas,
      ajustes: count(["ajustes", "rechazada"]),
      listas,
      porcentaje: total ? Math.round(((aprobadas + listas) / total) * 100) : 0,
    };
  }, [selectedProjectPages]);

  const selectedComments = useMemo(() => comments
    .filter((comment) => comment.pagina_id === selectedPage?.id)
    .sort((a, b) => {
      const aResolved = getCommentStatus(a) === "resuelto";
      const bResolved = getCommentStatus(b) === "resuelto";
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      return new Date(b.fecha_creacion || 0) - new Date(a.fecha_creacion || 0);
    }), [comments, selectedPage]);
  const selectedAnnotations = useMemo(() => selectedComments.flatMap((comment) => normalizeCommentAnnotations(comment).map((annotation) => ({
    ...annotation,
    commentId: comment.id,
    commentType: comment.tipo || "comentario",
    commentText: comment.comentario || "",
    commentUser: getUserLabel(userById[comment.usuario_id]),
    commentDate: formatDate(comment.fecha_creacion),
  }))), [selectedComments, userById]);
  const selectedPageIndex = visiblePages.findIndex((page) => page.id === selectedPage?.id);
  const selectedImageUrl = selectedPage ? signedUrls[selectedPage.id] || "" : "";
  const selectedProjectPromoRows = useMemo(() => {
    const projectCatalogId = normalizeValue(selectedProject?.catalogo_id);
    const sourceRows = rows || [];
    if (!projectCatalogId) return sourceRows;
    const relatedRows = sourceRows.filter((row) => {
      const rowCatalogIds = [
        row.catalogo_id,
        row.actividad_id,
        row.actividadId,
        row.catalogoId,
      ].map(normalizeValue).filter(Boolean);
      return rowCatalogIds.includes(projectCatalogId);
    });
    return relatedRows.length ? relatedRows : sourceRows;
  }, [rows, selectedProject]);
  const skuSearchResults = useMemo(() => {
    const term = normalizeSkuKey(skuSearchTerm);
    if (!term) return [];
    const exactMatches = selectedProjectPromoRows.filter((row) => normalizeSkuKey(row.sku) === term);
    if (exactMatches.length) return exactMatches;
    return selectedProjectPromoRows.filter((row) => normalizeSkuKey(row.sku).includes(term));
  }, [selectedProjectPromoRows, skuSearchTerm]);

  const submitSkuSearch = (event) => {
    event.preventDefault();
    setSkuSearchTerm(normalizeValue(skuQuery));
  };

  const selectViewerPage = (page) => {
    if (!page) return;
    setSelectedPageId(page.id);
    setViewerZoom(100);
  };

  const goToViewerPage = (direction) => {
    if (!visiblePages.length) return;
    const currentIndex = selectedPageIndex >= 0 ? selectedPageIndex : 0;
    const nextIndex = Math.min(visiblePages.length - 1, Math.max(0, currentIndex + direction));
    selectViewerPage(visiblePages[nextIndex]);
  };

  const refreshData = async () => {
    if (!supabaseReady) {
      setStatus({ type: "error", message: "Configure Supabase antes de usar diseño de catálogos." });
      return;
    }
    setStatus({ type: "loading", message: "Cargando proyectos de diseño..." });
    try {
      const data = await loadCatalogDesignData(supabaseConnection);
      setProjects(data.projects || []);
      setPages(data.pages || []);
      setComments(data.comments || []);
      setUsers(data.users || []);
      setBuyers(data.buyers || []);
      setStatus({ type: "ready", message: "Información de diseño cargada." });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudo cargar el módulo de diseño." });
    }
  };

  useEffect(() => {
    refreshData();
  }, [supabaseReady, supabaseConnection]);

  useEffect(() => {
    setSelectedProjectId((current) => visibleProjects.some((project) => project.id === current) ? current : visibleProjects[0]?.id || "");
  }, [visibleProjects]);

  useEffect(() => {
    setProjectForm((current) => {
      if (catalogoIdsTrabajables.has(String(current.catalogo_id || "").trim())) return current;
      return buildInitialProject(catalogosTrabajables);
    });
  }, [catalogosTrabajables, catalogoIdsTrabajables]);

  useEffect(() => {
    if (!filters.buyer) return;
    if (seniorBuyerFilterOptions.some((buyer) => buyer.id === filters.buyer)) return;
    setFilters((current) => ({ ...current, buyer: "" }));
  }, [filters.buyer, seniorBuyerFilterOptions]);

  useEffect(() => {
    setSelectedPageId((current) => pages.some((page) => page.id === current && page.proyecto_id === selectedProject?.id) ? current : "");
  }, [selectedProject?.id, pages]);

  useEffect(() => {
    setTargetPageCount(selectedProject ? String(selectedProjectPages.length || "") : "");
  }, [selectedProject?.id, selectedProjectPages.length]);

  useEffect(() => {
    setSelectedPageId((current) => visiblePages.some((page) => page.id === current) ? current : visiblePages[0]?.id || "");
  }, [visiblePages]);

  useEffect(() => {
    setCommentPanelOpen(false);
    setAnnotationMode(false);
    setDraftAnnotations([]);
    setActiveAnnotation(null);
    setActiveCommentId("");
    setHoveredAnnotation(null);
  }, [selectedPage?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadUrls = async () => {
      const pairs = await Promise.all(visiblePages.filter((page) => page.archivo_path).map(async (page) => {
        try {
          const url = await getCatalogDesignSignedUrl(supabaseConnection, CATALOG_DESIGN_WORK_BUCKET, page.archivo_path);
          return [page.id, url];
        } catch {
          return [page.id, ""];
        }
      }));
      if (!cancelled) setSignedUrls(Object.fromEntries(pairs));
    };
    if (visiblePages.length && supabaseReady) loadUrls();
    else setSignedUrls({});
    return () => {
      cancelled = true;
    };
  }, [visiblePages, supabaseReady, supabaseConnection]);

  const runAction = async (loadingMessage, action, successMessage) => {
    setStatus({ type: "loading", message: loadingMessage });
    try {
      await action();
      await refreshData();
      setStatus({ type: "ready", message: successMessage });
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudo completar la accion." });
    }
  };

  const createProject = () => runAction(
    "Creando proyecto...",
    async () => {
      const catalogoId = String(projectForm.catalogo_id || "").trim();
      if (!catalogoIdsTrabajables.has(catalogoId)) {
        throw new Error("El proyecto debe estar ligado a un catalogo creado en Ajustes y visible en Inicio.");
      }
      const pageCount = Math.max(1, Math.min(120, Number(projectForm.cantidad_paginas || 0)));
      if (!pageCount) {
        throw new Error("Defina la cantidad de paginas del catalogo.");
      }
      const catalogo = catalogoById[catalogoId];
      const created = await createCatalogDesignProject(supabaseConnection, projectForm, currentUserId, Array.from(catalogoIdsTrabajables));
      await Promise.all(Array.from({ length: pageCount }, (_, index) => {
        const numeroPagina = index + 1;
        return createCatalogDesignPage(supabaseConnection, {
          proyecto_id: created.id,
          numero_pagina: numeroPagina,
          titulo_pagina: buildPageTitle(numeroPagina, catalogo),
          estado: "pendiente",
        });
      }));
      setSelectedProjectId(created?.id || "");
      setProjectForm(buildInitialProject(catalogosTrabajables));
    },
    "Proyecto creado con sus paginas iniciales."
  );

  const saveSelectedProject = () => {
    if (!selectedProject) return;
    runAction("Guardando proyecto...", async () => {
      const nextPageCount = Math.max(1, Math.min(120, Number(targetPageCount || selectedProjectPageCount || 1)));
      if (!nextPageCount) {
        throw new Error("Defina una cantidad valida de paginas.");
      }

      await updateCatalogDesignProject(supabaseConnection, selectedProject.id, {
        nombre_proyecto: selectedProject.nombre_proyecto,
        estado: selectedProject.estado,
        fecha_inicio: selectedProject.fecha_inicio || null,
        fecha_entrega: selectedProject.fecha_entrega || null,
      });

      if (nextPageCount > selectedProjectPageCount) {
        const existingNumbers = new Set(selectedProjectPages.map((page) => Number(page.numero_pagina)));
        const pagesToCreate = [];
        for (let pageNumber = 1; pageNumber <= nextPageCount; pageNumber += 1) {
          if (!existingNumbers.has(pageNumber)) {
            pagesToCreate.push(createCatalogDesignPage(supabaseConnection, {
              proyecto_id: selectedProject.id,
              numero_pagina: pageNumber,
              titulo_pagina: buildPageTitle(pageNumber, selectedProjectCatalogo),
              estado: "pendiente",
            }));
          }
        }
        await Promise.all(pagesToCreate);
      }

      if (nextPageCount < selectedProjectPageCount) {
        const pagesToRemove = selectedProjectPages
          .filter((page) => Number(page.numero_pagina) > nextPageCount)
          .sort((a, b) => Number(b.numero_pagina) - Number(a.numero_pagina));
        const blockedPages = pagesToRemove.filter((page) => page.archivo_path || commentCountByPageId[page.id]);
        if (blockedPages.length) {
          throw new Error(`No se puede reducir la cantidad porque las paginas ${blockedPages.map((page) => page.numero_pagina).join(", ")} ya tienen imagen o comentarios.`);
        }
        await deleteCatalogDesignPages(supabaseConnection, pagesToRemove.map((page) => page.id));
      }
    }, "Proyecto actualizado.");
  };

  const updateProjectField = (field, value) => {
    setProjects((current) => current.map((project) => project.id === selectedProject?.id ? { ...project, [field]: value } : project));
  };

  const updatePageField = (page, field, value) => {
    runAction("Actualizando página...", async () => {
      await updateCatalogDesignPage(supabaseConnection, page.id, { [field]: value, actualizado_por: currentUserId || null });
    }, "Página actualizada.");
  };

  const uploadPageImage = (page, file) => {
    if (!file) return;
    runAction("Subiendo imagen de página...", () => uploadCatalogDesignPageImage(supabaseConnection, page, selectedProject, file, currentUserId), "Imagen actualizada sin crear versiones.");
  };

  const getAnnotationPoint = (event) => {
    const rect = imageShellRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      x: clampRatio((event.clientX - rect.left) / rect.width),
      y: clampRatio((event.clientY - rect.top) / rect.height),
    };
  };

  const beginAnnotation = (event) => {
    if (!annotationMode || !selectedImageUrl) return;
    const point = getAnnotationPoint(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    openReviewPanel();
    if (annotationTool === "freehand") {
      setActiveAnnotation({ type: "freehand", color: ANNOTATION_COLOR, points: [point] });
      return;
    }
    setActiveAnnotation(buildBoxAnnotation(annotationTool, { ...point, startX: point.x, startY: point.y }, point));
  };

  const moveAnnotation = (event) => {
    if (!annotationMode || !activeAnnotation) return;
    const point = getAnnotationPoint(event);
    if (!point) return;
    event.preventDefault();
    setActiveAnnotation((current) => {
      if (!current) return current;
      if (current.type === "freehand") {
        const lastPoint = current.points[current.points.length - 1];
        if (lastPoint && Math.abs(lastPoint.x - point.x) + Math.abs(lastPoint.y - point.y) < 0.003) return current;
        return { ...current, points: [...current.points, point] };
      }
      return buildBoxAnnotation(current.type, current, point);
    });
  };

  const endAnnotation = (event) => {
    if (!activeAnnotation) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const cleanAnnotation = stripDraftCoordinates(activeAnnotation);
    if (isUsefulAnnotation(cleanAnnotation)) {
      setDraftAnnotations((current) => [...current, cleanAnnotation]);
    }
    setActiveAnnotation(null);
  };

  const resetReviewDraft = () => {
    setCommentText("");
    setDraftAnnotations([]);
    setActiveAnnotation(null);
    setCommentPanelOpen(false);
    setAnnotationMode(false);
  };

  const openReviewPanel = () => {
    setSkuFinderOpen(false);
    setCommentPanelOpen(true);
  };

  const undoAnnotation = () => {
    setDraftAnnotations((current) => current.slice(0, -1));
  };

  const addComment = () => {
    if (!selectedPage) return;
    runAction("Guardando comentario...", async () => {
      await addCatalogDesignPageComment(supabaseConnection, selectedPage.id, commentText, "comentario", currentUserId, draftAnnotations);
      resetReviewDraft();
    }, "Comentario guardado.");
  };

  const reviewPage = (nextStatus, type) => {
    if (!selectedPage) return;
    runAction("Registrando revisión...", async () => {
      await reviewCatalogDesignPage(supabaseConnection, selectedPage, nextStatus, commentText, type, currentUserId, draftAnnotations);
      resetReviewDraft();
    }, nextStatus === "aprobada" ? "Página aprobada." : "Página enviada a ajustes.");
  };

  const updateCommentStatus = (comment, nextStatus) => {
    if (!comment?.id) return;
    runAction(nextStatus === "resuelto" ? "Marcando comentario como resuelto..." : "Reabriendo comentario...", async () => {
      await updateCatalogDesignPageCommentStatus(supabaseConnection, comment.id, nextStatus, currentUserId);
    }, nextStatus === "resuelto" ? "Comentario marcado como resuelto." : "Comentario reabierto.");
  };

  const viewPageImage = (page) => {
    selectViewerPage(page);
  };

  const canUploadSelectedPage = selectedPage && (isAdminOrMark || (canUpload && selectedPage.disenador_id === currentUserId));
  const canReviewSelectedPage = selectedPage && (isAdminOrMark || (canReview && selectedPage.comprador_id === currentBuyerId));
  const canUpdateCommentStatus = selectedPage && (isAdminOrMark || (isDesigner && selectedPage.disenador_id === currentUserId) || (isBuyer && selectedPage.comprador_id === currentBuyerId));
  const canUseAnnotations = Boolean(selectedPage && selectedImageUrl && canReviewSelectedPage);
  const pendingAnnotationCount = draftAnnotations.length + (activeAnnotation ? 1 : 0);
  const hoveredAnnotationAnchor = hoveredAnnotation ? getAnnotationAnchor(hoveredAnnotation) : null;

  return <div className="catalog-design-page">
    <div className="toolbar">
      <Header title="Diseño de Catálogos" subtitle="Proyectos por página, avances de diseño, revisión del comprador y consolidación final." />
      <div className="toolbar-actions catalog-design-header-actions">
        {status.message && <div className={classNames("catalog-design-status", status.type)} title={status.message}>{status.message}</div>}
        {hiddenProjectCount > 0 && <div className="catalog-design-status ready" title={`Se ocultaron ${hiddenProjectCount} proyectos sin catalogo trabajable en Inicio.`}>Se ocultaron {hiddenProjectCount} proyecto{hiddenProjectCount === 1 ? "" : "s"} sin catalogo trabajable.</div>}
        <Button variant="outline" onClick={refreshData} disabled={status.type === "loading"}><RefreshCw size={16}/> Actualizar</Button>
      </div>
    </div>

    <div className={classNames("catalog-design-layout", projectPanelCollapsed && "projects-collapsed")}>
      <Card className={classNames("catalog-design-sidebar", projectPanelCollapsed && "collapsed")}>
        <CardContent>
          {projectPanelCollapsed ? <div className="catalog-design-sidebar-rail">
            <button type="button" onClick={() => setProjectPanelCollapsed(false)} title="Mostrar proyectos" aria-label="Mostrar proyectos"><PanelLeftOpen size={18}/></button>
            <span>Proyectos</span>
          </div> : <>
          <div className="toolbar compact catalog-design-sidebar-head">
            <h2>Proyectos</h2>
            <div className="toolbar-actions">
              <button type="button" className="icon-btn catalog-design-collapse-btn" onClick={() => setProjectPanelCollapsed(true)} title="Contraer proyectos" aria-label="Contraer proyectos"><PanelLeftClose size={18}/></button>
              {canManage && <Button variant="outline" onClick={createProject} disabled={!canCreateProject} title={canCreateProject ? "" : "Seleccione un catalogo trabajable creado en Ajustes."}><Plus size={16}/> Crear</Button>}
            </div>
          </div>
          {canManage && <div className="catalog-design-form">
            <Field label="Catálogo">
              <select value={projectForm.catalogo_id} onChange={(event) => {
                const catalogo = catalogoById[event.target.value];
                setProjectForm((current) => ({
                  ...current,
                  catalogo_id: event.target.value,
                  nombre_proyecto: catalogo?.nombre ? `Diseño ${catalogo.nombre}` : current.nombre_proyecto,
                }));
              }}>
                <option value="">Seleccione catálogo</option>
                {catalogosTrabajables.map((catalogo) => <option key={getCatalogoId(catalogo)} value={getCatalogoId(catalogo)}>{catalogo.nombre || getCatalogoId(catalogo)}</option>)}
              </select>
            </Field>
            <Field label="Nombre proyecto">
              <input value={projectForm.nombre_proyecto} onChange={(event) => setProjectForm((current) => ({ ...current, nombre_proyecto: event.target.value }))} />
            </Field>
            <Field label="Cantidad de páginas">
              <input type="number" min="1" max="120" value={projectForm.cantidad_paginas || ""} onChange={(event) => setProjectForm((current) => ({ ...current, cantidad_paginas: event.target.value }))} />
            </Field>
            <div className="catalog-design-two">
              <Field label="Inicio">
                <input type="date" value={projectForm.fecha_inicio || ""} onChange={(event) => setProjectForm((current) => ({ ...current, fecha_inicio: event.target.value }))} />
              </Field>
              <Field label="Entrega">
                <input type="date" value={projectForm.fecha_entrega || ""} onChange={(event) => setProjectForm((current) => ({ ...current, fecha_entrega: event.target.value }))} />
              </Field>
            </div>
            <p className="catalog-design-name-preview">Nombre de páginas: {buildPageTitle(1, catalogoById[String(projectForm.catalogo_id || "").trim()])}</p>
          </div>}
          {canManage && !catalogosTrabajables.length && <div className="empty-state">Cree primero un catalogo en Ajustes para que aparezca como trabajable en Inicio.</div>}
          <div className="list catalog-design-project-list">
            {visibleProjects.map((project) => <button key={project.id} type="button" className={selectedProject?.id === project.id ? "selected" : ""} onClick={() => setSelectedProjectId(project.id)}>
              <strong>{project.nombre_proyecto}</strong>
              <span>{project.estado} · entrega {formatDate(project.fecha_entrega) || "sin fecha"}</span>
            </button>)}
            {!visibleProjects.length && projects.length > 0 && <div className="empty-state">{isAdminOrMark ? "No hay proyectos de diseno para catalogos trabajables." : "No hay proyectos con paginas asignadas a tu usuario."}</div>}
            {!projects.length && <div className="empty-state">No hay proyectos de diseño creados.</div>}
          </div>
          <div className="catalog-design-summary-card">
            <span>Proyecto seleccionado</span>
            <strong>{selectedProject?.nombre_proyecto || "Sin proyecto seleccionado"}</strong>
            <p>{selectedProject ? selectedProjectCatalogo?.nombre || selectedProject.catalogo_id || "Proyecto sin catalogo visible" : "Seleccione un proyecto para revisar su avance."}</p>
            {selectedProject && <div className="catalog-design-summary-meta">
              <span><b>Estado</b>{selectedProject.estado || "planificacion"}</span>
              <span><b>Entrega</b>{formatDate(selectedProject.fecha_entrega) || "sin fecha"}</span>
            </div>}
          </div>
          <div className="catalog-design-kpi-panel">
            <div><span>Total</span><strong>{metrics.total}</strong></div>
            <div><span>Pendientes</span><strong>{metrics.pendientes}</strong></div>
            <div><span>Revision</span><strong>{metrics.revision}</strong></div>
            <div><span>Aprobadas</span><strong>{metrics.aprobadas}</strong></div>
            <div><span>Ajustes</span><strong>{metrics.ajustes}</strong></div>
            <div><span>Listas</span><strong>{metrics.listas}</strong></div>
            <div className="catalog-design-kpi-progress"><span>Avance</span><strong>{metrics.porcentaje}%</strong></div>
          </div>
          </>}
        </CardContent>
      </Card>

      <div className="catalog-design-main">
        <Card className="catalog-design-config-card">
          <CardContent>
            <div className="toolbar">
              <div>
                <h2>Configuracion del catalogo</h2>
                <p>{selectedProject?.catalogo_id ? `Catalogo ${selectedProject.catalogo_id}` : "Proyecto de diseño por páginas"}</p>
              </div>
              {canManage && selectedProject && <div className="toolbar-actions">
                <Button variant="outline" onClick={saveSelectedProject}><Save size={16}/> Guardar proyecto</Button>
              </div>}
            </div>

            {selectedProject && <div className="catalog-design-project-edit">
              {canManage ? <>
                <Field label="Nombre"><input value={selectedProject.nombre_proyecto || ""} onChange={(event) => updateProjectField("nombre_proyecto", event.target.value)} /></Field>
                <Field label="Estado"><select value={selectedProject.estado || "planificacion"} onChange={(event) => updateProjectField("estado", event.target.value)}>{PROJECT_STATES.map((state) => <option key={state} value={state}>{state.replace(/_/g, " ")}</option>)}</select></Field>
                <Field label="Inicio"><input type="date" value={selectedProject.fecha_inicio || ""} onChange={(event) => updateProjectField("fecha_inicio", event.target.value)} /></Field>
                <Field label="Entrega"><input type="date" value={selectedProject.fecha_entrega || ""} onChange={(event) => updateProjectField("fecha_entrega", event.target.value)} /></Field>
                <Field label="Cantidad de paginas"><input type="number" min="1" max="120" value={targetPageCount} onChange={(event) => setTargetPageCount(event.target.value)} /></Field>
              </> : <p className="readonly">Estado del proyecto: {selectedProject.estado}. Entrega: {formatDate(selectedProject.fecha_entrega) || "sin fecha"}.</p>}
            </div>}
            {selectedProject && canManage && <p className="catalog-design-name-preview">Cantidad actual: {selectedProjectPageCount} paginas. Si reduces, solo se eliminan paginas vacias sin imagen ni comentarios.</p>}
          </CardContent>
        </Card>

        <div className="catalog-design-metrics">
          <Card><CardContent><span>Total</span><strong>{metrics.total}</strong></CardContent></Card>
          <Card><CardContent><span>Pendientes</span><strong>{metrics.pendientes}</strong></CardContent></Card>
          <Card><CardContent><span>En revisión</span><strong>{metrics.revision}</strong></CardContent></Card>
          <Card><CardContent><span>Aprobadas</span><strong>{metrics.aprobadas}</strong></CardContent></Card>
          <Card><CardContent><span>Ajustes</span><strong>{metrics.ajustes}</strong></CardContent></Card>
          <Card><CardContent><span>Listas</span><strong>{metrics.listas}</strong></CardContent></Card>
          <Card className="catalog-design-progress"><CardContent><span>Avance</span><strong>{metrics.porcentaje}%</strong></CardContent></Card>
        </div>

        <Card className="grid-card catalog-design-viewer-card">
          <CardContent>
            <div className="toolbar catalog-design-viewer-toolbar">
              <div>
                <h2>Páginas de {selectedProject?.nombre_proyecto || "proyecto"}</h2>
                <p>{selectedPage ? `${selectedPage.titulo_pagina || `Pagina ${selectedPage.numero_pagina}`} · ${selectedPage.estado || "pendiente"}` : "Seleccione una página para revisar el diseño."}</p>
              </div>
              <div className="toolbar-actions filters">
                <select value={filters.designer} onChange={(event) => setFilters((current) => ({ ...current, designer: event.target.value }))}><option value="">Diseñador</option>{designerOptions.map((user) => <option key={user.id} value={user.id}>{user.nombre || user.email}</option>)}</select>
                <select value={filters.buyer} onChange={(event) => setFilters((current) => ({ ...current, buyer: event.target.value }))}><option value="">Comprador senior</option>{seniorBuyerFilterOptions.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.comprador}</option>)}</select>
                <select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))}><option value="">Estado</option>{PAGE_STATES.map((state) => <option key={state} value={state}>{state.replace(/_/g, " ")}</option>)}</select>
              </div>
            </div>
            <div className="catalog-design-viewer">
              <div className="catalog-design-viewer-actions">
                <div className="catalog-design-viewer-current">
                  <span>Página seleccionada</span>
                  <strong>{selectedPage?.titulo_pagina || "Sin página"}</strong>
                  {selectedPage && <StateBadge state={selectedPage.estado}/>}
                </div>
                <div className="catalog-design-viewer-controls">
                  <Button className="catalog-design-nav-btn" variant="outline" onClick={() => goToViewerPage(-1)} disabled={selectedPageIndex <= 0}><ChevronLeft size={16}/> Anterior</Button>
                  <Button className="catalog-design-nav-btn" variant="outline" onClick={() => goToViewerPage(1)} disabled={selectedPageIndex < 0 || selectedPageIndex >= visiblePages.length - 1}>Siguiente <ChevronRight size={16}/></Button>
                  <Button className="catalog-design-zoom-btn" variant="outline" onClick={() => setViewerZoom((value) => Math.max(60, value - 20))} disabled={!selectedPage} title="Reducir zoom" aria-label="Reducir zoom"><ZoomOut size={16}/></Button>
                  <Button className="catalog-design-zoom-btn" variant="outline" onClick={() => setViewerZoom((value) => Math.min(180, value + 20))} disabled={!selectedPage} title="Aumentar zoom" aria-label="Aumentar zoom"><ZoomIn size={16}/></Button>
                  <Button className="catalog-design-sku-btn" variant="outline" onClick={() => { setCommentPanelOpen(false); setAnnotationMode(false); setSkuFinderOpen(true); }} title="Buscar informacion de SKU"><Search size={16}/> Buscar SKU</Button>
                  {canUploadSelectedPage && <label className="btn btn-primary catalog-design-file-btn catalog-design-viewer-upload">
                    <ImageUp size={16}/> Actualizar imagen
                    <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => { uploadPageImage(selectedPage, event.target.files?.[0]); event.target.value = ""; }} />
                  </label>}
                </div>
              </div>
              {selectedPage && <div className="catalog-design-review-quickbar">
                <div className="catalog-design-annotation-tools" aria-label="Herramientas de senalizacion">
                  <Button className="catalog-design-pencil-btn" variant={annotationMode ? "default" : "outline"} onClick={() => { setAnnotationMode((value) => !value); openReviewPanel(); }} disabled={!canUseAnnotations} title={canUseAnnotations ? "Senalar sobre la pagina" : "Seleccione una pagina con imagen asignada para revisar."}>
                    <Pencil size={16}/> Senalar
                  </Button>
                  {annotationMode && ANNOTATION_TOOLS.map(([tool, label, Icon]) => <button key={tool} type="button" className={annotationTool === tool ? "catalog-design-tool-btn selected" : "catalog-design-tool-btn"} onClick={() => setAnnotationTool(tool)} title={label} aria-label={label}><Icon size={16}/></button>)}
                  {annotationMode && <button type="button" className="catalog-design-tool-btn" onClick={undoAnnotation} disabled={!draftAnnotations.length} title="Deshacer ultima senal" aria-label="Deshacer ultima senal"><Undo2 size={16}/></button>}
                </div>
                <div className="catalog-design-review-actions">
                  <Button variant="outline" onClick={openReviewPanel} disabled={!selectedPage}><MessageSquare size={16}/> Comentar</Button>
                  {canReviewSelectedPage && <>
                    <Button onClick={() => reviewPage("aprobada", "aprobacion")}><CheckCircle2 size={16}/> Aprobar</Button>
                    <Button variant="outline" onClick={() => { openReviewPanel(); if (!commentText.trim()) setCommentText("Requiere ajuste: "); }}><XCircle size={16}/> Rechazar</Button>
                  </>}
                </div>
              </div>}
              {skuFinderOpen && <div className="catalog-design-sku-popover" role="dialog" aria-label="Buscar informacion de SKU">
                <div className="catalog-design-sku-popover-head">
                  <div>
                    <strong>Buscar SKU</strong>
                    <span>Valida datos promocionales contra la pagina visible.</span>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => setSkuFinderOpen(false)} aria-label="Cerrar buscador SKU"><X size={16}/></button>
                </div>
                <form className="catalog-design-sku-search" onSubmit={submitSkuSearch}>
                  <input value={skuQuery} onChange={(event) => setSkuQuery(event.target.value)} placeholder="Codigo SKU" autoFocus />
                  <Button type="submit" disabled={!skuQuery.trim()}><Search size={16}/> Buscar</Button>
                </form>
                <div className="catalog-design-sku-results">
                  {!skuSearchTerm && <div className="catalog-design-sku-empty">Ingrese un codigo para consultar descripcion, precios, descuento y comentario.</div>}
                  {skuSearchTerm && !skuSearchResults.length && <div className="catalog-design-sku-empty">No se encontro informacion para el SKU {skuSearchTerm}.</div>}
                  {skuSearchResults.map((row, index) => <div className="catalog-design-sku-result" key={`${row.id || row.row_id || row.sku}-${index}`}>
                    <div className="catalog-design-sku-result-head">
                      <span>SKU</span>
                      <strong>{formatSkuInfoValue(row.sku)}</strong>
                    </div>
                    <p>{formatSkuInfoValue(getPromoField(row, "descripcion"))}</p>
                    <div className="catalog-design-sku-data">
                      <div><span>Antes</span><strong>{formatSkuInfoValue(getPromoField(row, "precioAntes", "precio_antes"))}</strong></div>
                      <div><span>Ahora</span><strong>{formatSkuInfoValue(getPromoField(row, "precioAhora", "precio_ahora"))}</strong></div>
                      <div><span>Descuento</span><strong>{formatSkuInfoValue(getPromoField(row, "descuento"))}</strong></div>
                    </div>
                    <div className="catalog-design-sku-comment">
                      <span>Comentario</span>
                      <p>{formatSkuInfoValue(getPromoField(row, "comentario", "comentario_comprador"))}</p>
                    </div>
                  </div>)}
                </div>
              </div>}
              {commentPanelOpen && selectedPage && <div className="catalog-design-comment-popover" role="dialog" aria-label="Comentario de revision">
                <div className="catalog-design-comment-popover-head">
                  <div>
                    <strong>Comentario de revision</strong>
                    <span>{pendingAnnotationCount ? `${pendingAnnotationCount} senal${pendingAnnotationCount === 1 ? "" : "es"} por guardar` : "Sin senales pendientes"}</span>
                  </div>
                  <button type="button" className="icon-btn" onClick={() => { setCommentPanelOpen(false); setAnnotationMode(false); }} aria-label="Cerrar comentario"><X size={16}/></button>
                </div>
                <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Describe el cambio solicitado para el disenador." autoFocus={!annotationMode} />
                <div className="catalog-design-comment-popover-actions">
                  <Button variant="outline" onClick={resetReviewDraft}>Cancelar</Button>
                  <Button variant="outline" onClick={addComment} disabled={!commentText.trim()}><MessageSquare size={16}/> Guardar</Button>
                  {canReviewSelectedPage && <>
                    <Button onClick={() => reviewPage("aprobada", "aprobacion")}><CheckCircle2 size={16}/> Aprobar</Button>
                    <Button variant="outline" onClick={() => reviewPage("ajustes", "rechazo")}><XCircle size={16}/> Rechazar</Button>
                  </>}
                </div>
              </div>}
              <div className="catalog-design-review-workspace">
                <aside className="catalog-design-comment-rail">
                  <div className="catalog-design-comment-rail-head">
                    <div>
                      <strong>Comentarios</strong>
                      <span>{selectedComments.length ? `${selectedComments.length} registrado${selectedComments.length === 1 ? "" : "s"}` : "Sin comentarios"}</span>
                    </div>
                    <Button variant="outline" onClick={openReviewPanel} disabled={!selectedPage}><MessageSquare size={16}/> Nuevo</Button>
                  </div>
                  <div className="catalog-design-comment-rail-list">
                    {selectedComments.map((comment) => {
                      const annotationCount = normalizeCommentAnnotations(comment).length;
                      const commentStatus = getCommentStatus(comment);
                      const selected = activeCommentId === comment.id || hoveredAnnotation?.commentId === comment.id;
                      return <div key={comment.id} role="button" tabIndex={0} className={classNames("catalog-design-comment-item", selected && "selected", commentStatus === "resuelto" && "resolved")} onMouseEnter={() => setActiveCommentId(comment.id)} onMouseLeave={() => setActiveCommentId("")} onFocus={() => setActiveCommentId(comment.id)} onBlur={() => setActiveCommentId("")}>
                        <span className="catalog-design-comment-meta">{comment.tipo || "comentario"} · {formatDate(comment.fecha_creacion) || "sin fecha"}</span>
                        <span className={classNames("catalog-design-comment-status", commentStatus)}>{commentStatus}</span>
                        <strong>{getUserLabel(userById[comment.usuario_id])}</strong>
                        <p>{comment.comentario}</p>
                        <div className="catalog-design-comment-item-foot">
                          {annotationCount > 0 && <span className="catalog-design-comment-signal">{annotationCount} senal{annotationCount === 1 ? "" : "es"}</span>}
                          {canUpdateCommentStatus && <button type="button" className="catalog-design-comment-status-btn" onClick={(event) => { event.stopPropagation(); updateCommentStatus(comment, commentStatus === "resuelto" ? "abierto" : "resuelto"); }} title={commentStatus === "resuelto" ? "Reabrir comentario" : "Marcar como resuelto"} aria-label={commentStatus === "resuelto" ? "Reabrir comentario" : "Marcar como resuelto"}>
                            {commentStatus === "resuelto" ? <RefreshCw size={14}/> : <CheckCircle2 size={14}/>}
                            <span>{commentStatus === "resuelto" ? "Reabrir" : "Resolver"}</span>
                          </button>}
                        </div>
                      </div>;
                    })}
                    {!selectedComments.length && <div className="empty-state">Aun no hay comentarios para esta pagina.</div>}
                  </div>
                </aside>
                <div className="catalog-design-viewer-surface">
                  <div className="catalog-design-viewer-stage">
                {selectedImageUrl ? <div className="catalog-design-image-shell" ref={imageShellRef} style={{ width: `${viewerZoom}%` }}>
                  <img src={selectedImageUrl} alt={selectedPage?.titulo_pagina || "Pagina de catalogo"} />
                  <svg
                    className={classNames("catalog-design-annotation-layer", annotationMode && "drawing")}
                    viewBox="0 0 1 1"
                    preserveAspectRatio="none"
                    onPointerDown={beginAnnotation}
                    onPointerMove={moveAnnotation}
                    onPointerUp={endAnnotation}
                    onPointerCancel={endAnnotation}
                  >
                    {selectedAnnotations.map((annotation, index) => renderAnnotation(
                      annotation,
                      `${annotation.commentId}-${index}`,
                      classNames("saved", (activeCommentId === annotation.commentId || hoveredAnnotation?.commentId === annotation.commentId) && "selected"),
                      {
                        onPointerEnter: () => {
                          setHoveredAnnotation(annotation);
                          setActiveCommentId(annotation.commentId);
                        },
                        onPointerLeave: () => {
                          setHoveredAnnotation(null);
                          setActiveCommentId("");
                        },
                        onFocus: () => {
                          setHoveredAnnotation(annotation);
                          setActiveCommentId(annotation.commentId);
                        },
                        onBlur: () => {
                          setHoveredAnnotation(null);
                          setActiveCommentId("");
                        },
                        tabIndex: 0,
                      }
                    ))}
                    {draftAnnotations.map((annotation, index) => renderAnnotation(annotation, `draft-${index}`, "draft"))}
                    {activeAnnotation && renderAnnotation(activeAnnotation, "active", "draft active")}
                  </svg>
                  {hoveredAnnotation && hoveredAnnotationAnchor && <div className="catalog-design-annotation-tooltip" style={{ left: `${hoveredAnnotationAnchor.x * 100}%`, top: `${hoveredAnnotationAnchor.y * 100}%` }}>
                    <strong>{hoveredAnnotation.commentType || "comentario"} · {hoveredAnnotation.commentUser || "Usuario"}</strong>
                    <p>{hoveredAnnotation.commentText}</p>
                    {hoveredAnnotation.commentDate && <span>{hoveredAnnotation.commentDate}</span>}
                  </div>}
                  {annotationMode && <div className="catalog-design-drawing-hint">Arrastre sobre la imagen para senalar.</div>}
                </div> : <div className="catalog-design-viewer-empty">
                  <ImageUp size={30}/>
                  <strong>{selectedPage ? "Sin imagen cargada" : "Seleccione una pagina"}</strong>
                  <span>{selectedPage ? "El diseñador debe cargar una imagen JPG o PNG de calidad media para revision." : "Use la tabla inferior para elegir una pagina del proyecto."}</span>
                </div>}
              </div>
                  {selectedPage && <p className="catalog-design-viewer-note">Ruta Storage: {selectedPage.archivo_path || `catalogos/${selectedProject?.catalogo_id}/paginas/pagina_${selectedPage.numero_pagina}.jpg`}</p>}
                </div>
              </div>
            </div>
            <div className="table-wrap catalog-design-table">
              <table>
                <thead><tr><th>Página</th><th>Miniatura</th><th>Título</th><th>Diseñador</th><th>Comprador</th><th>Estado</th><th>Última carga</th><th>Acciones</th></tr></thead>
                <tbody>
                  {visiblePages.map((page) => {
                    const canUploadPage = isAdminOrMark || (canUpload && page.disenador_id === currentUserId);
                    const imageUrl = signedUrls[page.id];
                    return <tr key={page.id} className={selectedPage?.id === page.id ? "catalog-design-selected-row" : ""}>
                      <td><strong>{page.numero_pagina}</strong></td>
                      <td>{imageUrl ? <button type="button" className="catalog-design-thumb" onClick={() => viewPageImage(page)}><img src={imageUrl} alt={`Pagina ${page.numero_pagina}`} /></button> : <span className="catalog-design-no-thumb">Sin imagen</span>}</td>
                      <td>{page.titulo_pagina || "Sin título"}</td>
                      <td>{canManage ? <select value={page.disenador_id || ""} onChange={(event) => updatePageField(page, "disenador_id", event.target.value || null)}><option value="">Sin asignar</option>{designerOptions.map((user) => <option key={user.id} value={user.id}>{user.nombre || user.email}</option>)}</select> : getUserLabel(userById[page.disenador_id])}</td>
                      <td>{canManage ? <select value={page.comprador_id || ""} onChange={(event) => updatePageField(page, "comprador_id", event.target.value || null)}><option value="">Sin asignar</option>{buyers.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.comprador}</option>)}</select> : getBuyerLabel(buyerById[page.comprador_id])}</td>
                      <td>{canManage ? <select value={page.estado || "pendiente"} onChange={(event) => updatePageField(page, "estado", event.target.value)}>{PAGE_STATES.map((state) => <option key={state} value={state}>{state.replace(/_/g, " ")}</option>)}</select> : <StateBadge state={page.estado}/>}</td>
                      <td>{formatDate(page.fecha_ultima_carga) || "Sin carga"}</td>
                      <td>
                        <div className="catalog-design-actions">
                          {canUploadPage && <label className="btn btn-outline catalog-design-file-btn"><ImageUp size={16}/> Subir<input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => { uploadPageImage(page, event.target.files?.[0]); event.target.value = ""; }} /></label>}
                          {page.archivo_path && <Button variant="outline" onClick={() => viewPageImage(page)}><Eye size={16}/> Visor</Button>}
                          <Button variant="outline" onClick={() => setSelectedPageId(page.id)}><MessageSquare size={16}/> Revisar</Button>
                        </div>
                      </td>
                    </tr>;
                  })}
                  {!visiblePages.length && <tr><td colSpan={8}><div className="empty-state">No hay páginas visibles con los filtros actuales.</div></td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {false && <Card>
          <CardContent>
            <div className="toolbar compact">
              <div><h2>Comentarios y revisión</h2><p>{selectedPage ? `Página ${selectedPage.numero_pagina}` : "Seleccione una página para revisar."}</p></div>
            </div>
            {selectedPage ? <div className="catalog-design-review">
              <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Agregar comentario, aprobación, rechazo o ajuste." />
              <div className="toolbar-actions">
                <Button variant="outline" onClick={addComment} disabled={!commentText.trim()}><MessageSquare size={16}/> Comentar</Button>
                {canReviewSelectedPage && <>
                  <Button onClick={() => reviewPage("aprobada", "aprobacion")}><CheckCircle2 size={16}/> Aprobar</Button>
                  <Button variant="outline" onClick={() => reviewPage("ajustes", "rechazo")}><XCircle size={16}/> Rechazar</Button>
                </>}
              </div>
              <div className="catalog-design-comments">
                {selectedComments.map((comment) => {
                  const annotationCount = normalizeCommentAnnotations(comment).length;
                  return <div key={comment.id}>
                    <strong>{comment.tipo || "comentario"} · {getUserLabel(userById[comment.usuario_id])}{annotationCount ? ` · ${annotationCount} senal${annotationCount === 1 ? "" : "es"}` : ""}</strong>
                    <p>{comment.comentario}</p>
                    <span>{formatDate(comment.fecha_creacion)}</span>
                  </div>;
                })}
                {!selectedComments.length && <div className="empty-state">Aún no hay comentarios para esta página.</div>}
              </div>
            </div> : <div className="empty-state">Seleccione una página desde la tabla.</div>}
          </CardContent>
        </Card>}
      </div>
    </div>
  </div>;
}
