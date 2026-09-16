import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  Circle,
  Eye,
  ImageUp,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
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
const COMMENT_CATEGORIES = [
  { id: "precio", label: "Precio / Promo", color: "#D97706", icon: "🏷️" },
  { id: "imagen", label: "Arte / Imagen", color: "#00A6C8", icon: "🖼️" },
  { id: "ajuste", label: "Ajuste Crítico", color: "#E53935", icon: "⚠️" },
  { id: "general", label: "General / Texto", color: "#006B3F", icon: "📝" },
];

const CATEGORY_COLORS = {
  precio: "#D97706",
  imagen: "#00A6C8",
  ajuste: "#E53935",
  general: "#006B3F",
  rechazo: "#E53935",
  aprobacion: "#006B3F",
  comentario: "#E53935",
};

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

function hexToRgba(hex, alpha = 0.15) {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return `rgba(229,57,53,${alpha})`;
  const clean = hex.slice(1);
  const num = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildBoxAnnotation(tool, startPoint, endPoint, color = ANNOTATION_COLOR) {
  const startX = Number.isFinite(startPoint?.startX) ? startPoint.startX : startPoint?.x;
  const startY = Number.isFinite(startPoint?.startY) ? startPoint.startY : startPoint?.y;
  const endX = endPoint?.x ?? startX;
  const endY = endPoint?.y ?? startY;
  return {
    type: tool,
    color,
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
  const color = annotation.color || CATEGORY_COLORS[annotation.commentType] || ANNOTATION_COLOR;
  const title = annotation.commentText
    ? `${annotation.commentIndex ? `#${annotation.commentIndex} ` : ""}${annotation.commentType || "comentario"}: ${annotation.commentText}`
    : "";
  const anchor = getAnnotationAnchor(annotation);
  const pinRadius = 0.017;

  let shape = null;
  if (annotation.type === "freehand") {
    const points = Array.isArray(annotation.points)
      ? annotation.points.map((point) => `${clampRatio(point.x)},${clampRatio(point.y)}`).join(" ")
      : "";
    if (!points) return null;
    shape = <polyline className="annotation-shape" points={points} fill="none" stroke={color} strokeWidth="0.006" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke">{title && <title>{title}</title>}</polyline>;
  } else {
    const x = clampRatio(annotation.x);
    const y = clampRatio(annotation.y);
    const width = clampRatio(annotation.width);
    const height = clampRatio(annotation.height);
    if (!width || !height) return null;
    const fillColor = hexToRgba(color, 0.16);
    if (annotation.type === "circle") {
      shape = <ellipse className="annotation-shape" cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={fillColor} stroke={color} strokeWidth="0.006" vectorEffect="non-scaling-stroke">{title && <title>{title}</title>}</ellipse>;
    } else {
      shape = <rect className="annotation-shape" x={x} y={y} width={width} height={height} fill={fillColor} stroke={color} strokeWidth="0.006" vectorEffect="non-scaling-stroke">{title && <title>{title}</title>}</rect>;
    }
  }

  return (
    <g key={key} className={classNames("catalog-design-annotation-group", className)} {...eventProps}>
      {shape}
      {annotation.commentIndex && (
        <g className="catalog-design-pin" transform={`translate(${clampRatio(anchor.x)}, ${clampRatio(anchor.y)})`}>
          <circle r={pinRadius} fill={color} stroke="#ffffff" strokeWidth="0.003" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.4))" />
          <text textAnchor="middle" dy="0.006" fill="#ffffff" fontSize="0.017" fontWeight="bold" fontFamily="system-ui, -apple-system, sans-serif">
            {annotation.commentIndex}
          </text>
        </g>
      )}
    </g>
  );
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
  const viewerStageRef = useRef(null);
  const filmstripTrackRef = useRef(null);

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
  const [commentCategory, setCommentCategory] = useState("ajuste");
  const [signedUrls, setSignedUrls] = useState({});
  const [viewerZoom, setViewerZoom] = useState(100);
  const [pageViewMode, setPageViewMode] = useState("filmstrip");
  const [focusMode, setFocusMode] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState("comments");
  const [isDraftingComment, setIsDraftingComment] = useState(false);
  const [sideRailCollapsed, setSideRailCollapsed] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotationTool, setAnnotationTool] = useState("rect");
  const [draftAnnotations, setDraftAnnotations] = useState([]);
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [activeCommentId, setActiveCommentId] = useState("");
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);
  const [targetPageCount, setTargetPageCount] = useState("");
  const [projectPanelCollapsed, setProjectPanelCollapsed] = useState(false);
  const [configCollapsed, setConfigCollapsed] = useState(false);
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

  const chronologicalOrder = useMemo(() => {
    const pageComments = comments.filter((c) => c.pagina_id === selectedPage?.id);
    const sorted = [...pageComments].sort((a, b) => new Date(a.fecha_creacion || 0) - new Date(b.fecha_creacion || 0));
    return new Map(sorted.map((c, idx) => [c.id, idx + 1]));
  }, [comments, selectedPage?.id]);

  const selectedComments = useMemo(() => comments
    .filter((comment) => comment.pagina_id === selectedPage?.id)
    .sort((a, b) => {
      const aResolved = getCommentStatus(a) === "resuelto";
      const bResolved = getCommentStatus(b) === "resuelto";
      if (aResolved !== bResolved) return aResolved ? 1 : -1;
      return new Date(b.fecha_creacion || 0) - new Date(a.fecha_creacion || 0);
    }), [comments, selectedPage]);

  const selectedAnnotations = useMemo(() => selectedComments.flatMap((comment) => {
    const commentNumber = chronologicalOrder.get(comment.id) || 1;
    const catColor = CATEGORY_COLORS[comment.tipo] || ANNOTATION_COLOR;
    return normalizeCommentAnnotations(comment).map((annotation) => ({
      ...annotation,
      color: annotation.color || catColor,
      commentId: comment.id,
      commentIndex: commentNumber,
      commentType: comment.tipo || "comentario",
      commentText: comment.comentario || "",
      commentUser: getUserLabel(userById[comment.usuario_id]),
      commentDate: formatDate(comment.fecha_creacion),
    }));
  }), [selectedComments, chronologicalOrder, userById]);
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

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) {
        return;
      }
      if (event.code === "Space" && !event.repeat) {
        event.preventDefault();
        setIsSpacePressed(true);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToViewerPage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToViewerPage(1);
      } else if (event.key === "f" || event.key === "F") {
        event.preventDefault();
        setFocusMode((prev) => !prev);
      } else if (event.key === "Escape") {
        setFocusMode(false);
      }
    };

    const handleKeyUp = (event) => {
      if (event.code === "Space") {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [visiblePages, selectedPageIndex, focusMode]);

  useEffect(() => {
    const stage = viewerStageRef.current;
    if (!stage) return;
    const handleWheel = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? 15 : -15;
        setViewerZoom((prev) => Math.max(50, Math.min(220, prev + delta)));
      }
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (!selectedPage || pageViewMode !== "filmstrip") return;
    const card = document.getElementById(`filmstrip-card-${selectedPage.id}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [selectedPage?.id, pageViewMode]);

  const scrollFilmstrip = (direction) => {
    if (!filmstripTrackRef.current) return;
    filmstripTrackRef.current.scrollBy({ left: direction * 360, behavior: "smooth" });
  };

  const handleStagePointerDown = (event) => {
    if (annotationMode && !isSpacePressed) return;
    if (event.button !== 0) return;
    const stage = viewerStageRef.current;
    if (!stage) return;
    if (viewerZoom <= 100 && !isSpacePressed) return;

    setIsPanning(true);
    setPanStart({
      x: event.clientX,
      y: event.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    });
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {}
  };

  const handleStagePointerMove = (event) => {
    if (!isPanning) return;
    const stage = viewerStageRef.current;
    if (!stage) return;
    const dx = event.clientX - panStart.x;
    const dy = event.clientY - panStart.y;
    stage.scrollLeft = panStart.scrollLeft - dx;
    stage.scrollTop = panStart.scrollTop - dy;
  };

  const handleStagePointerUp = (event) => {
    if (isPanning) {
      setIsPanning(false);
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch {}
    }
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
    setIsDraftingComment(false);
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
    const currentColor = CATEGORY_COLORS[commentCategory] || ANNOTATION_COLOR;
    if (annotationTool === "freehand") {
      setActiveAnnotation({ type: "freehand", color: currentColor, points: [point] });
      return;
    }
    setActiveAnnotation(buildBoxAnnotation(annotationTool, { ...point, startX: point.x, startY: point.y }, point, currentColor));
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
      return buildBoxAnnotation(current.type, current, point, current.color);
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
    setIsDraftingComment(false);
    setAnnotationMode(false);
  };

  const openReviewPanel = () => {
    setActiveSideTab("comments");
    setIsDraftingComment(true);
    setSideRailCollapsed(false);
  };

  const highlightAndScrollComment = (commentId) => {
    if (!commentId) return;
    setActiveCommentId(commentId);
    setActiveSideTab("comments");
    setSideRailCollapsed(false);
    const element = document.getElementById(`catalog-comment-${commentId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const undoAnnotation = () => {
    setDraftAnnotations((current) => current.slice(0, -1));
  };

  const addComment = () => {
    if (!selectedPage) return;
    runAction("Guardando comentario...", async () => {
      await addCatalogDesignPageComment(supabaseConnection, selectedPage.id, commentText, commentCategory, currentUserId, draftAnnotations);
      resetReviewDraft();
    }, "Comentario guardado.");
  };

  const reviewPage = (nextStatus, type) => {
    if (!selectedPage) return;
    runAction("Registrando revisión...", async () => {
      await reviewCatalogDesignPage(supabaseConnection, selectedPage, nextStatus, commentText, commentCategory || type, currentUserId, draftAnnotations);
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

  return <div className={classNames("catalog-design-page", focusMode && "catalog-design-focus-active")}>
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
        <Card className={classNames("catalog-design-config-card", configCollapsed && "collapsed")}>
          <CardContent>
            <div className="toolbar catalog-design-config-toolbar" onClick={() => setConfigCollapsed((v) => !v)} style={{ cursor: "pointer" }}>
              <div>
                <div className="catalog-design-config-title-row">
                  <h2>Configuración del catálogo</h2>
                  {configCollapsed && selectedProject && (
                    <span className="catalog-design-config-pill">
                      <strong>{selectedProject.nombre_proyecto || "Proyecto"}</strong> · {selectedProject.estado || "planificación"} · {selectedProjectPageCount} págs.
                    </span>
                  )}
                </div>
                <p>{selectedProject?.catalogo_id ? `Catálogo ${selectedProject.catalogo_id}` : "Proyecto de diseño por páginas"}</p>
              </div>
              <div className="toolbar-actions" onClick={(e) => e.stopPropagation()}>
                {canManage && selectedProject && !configCollapsed && (
                  <Button variant="outline" onClick={saveSelectedProject}><Save size={16}/> Guardar proyecto</Button>
                )}
                <Button
                  variant="outline"
                  className="catalog-design-collapse-toggle-btn"
                  onClick={() => setConfigCollapsed((v) => !v)}
                  title={configCollapsed ? "Expandir configuración" : "Contraer configuración hacia arriba"}
                  aria-label={configCollapsed ? "Expandir configuración" : "Contraer configuración hacia arriba"}
                >
                  {configCollapsed ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}
                  <span>{configCollapsed ? "Expandir" : "Contraer"}</span>
                </Button>
              </div>
            </div>

            {!configCollapsed && (
              <>
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
              </>
            )}
          </CardContent>
        </Card>

        <Card className="grid-card catalog-design-viewer-card">
          <CardContent>
            <div className="toolbar catalog-design-viewer-toolbar">
              <div>
                <h2>Páginas de {selectedProject?.nombre_proyecto || "proyecto"}</h2>
                <p>{selectedPage ? `${selectedPage.titulo_pagina || `Página ${selectedPage.numero_pagina}`} · ${selectedPage.estado || "pendiente"}` : "Seleccione una página para revisar el diseño."}</p>
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
                  <div className="catalog-design-viewer-current-title-row">
                    <span>Pág.</span>
                    <strong>{selectedPage?.titulo_pagina || "Sin página"}</strong>
                    {selectedPage && (
                      canManage ? (
                        <select
                          className="catalog-design-quick-state-select"
                          value={selectedPage.estado || "pendiente"}
                          onChange={(e) => updatePageField(selectedPage, "estado", e.target.value)}
                          title="Cambiar estado de esta página directamente"
                        >
                          {PAGE_STATES.map((state) => (
                            <option key={state} value={state}>{state.replace(/_/g, " ")}</option>
                          ))}
                        </select>
                      ) : (
                        <StateBadge state={selectedPage.estado}/>
                      )
                    )}
                  </div>
                  {selectedPage && (
                    <div className="catalog-design-viewer-current-meta">
                      <span title="Diseñador asignado">🎨 {getUserLabel(userById[selectedPage.disenador_id]) || "Sin diseñador"}</span>
                      <span className="dot-sep">·</span>
                      <span title="Comprador asignado">🛒 {getBuyerLabel(buyerById[selectedPage.comprador_id]) || "Sin comprador"}</span>
                    </div>
                  )}
                </div>

                <div className="catalog-design-viewer-controls">
                  <div className="catalog-design-nav-group" role="group" aria-label="Navegación de páginas">
                    <Button className="catalog-design-nav-btn" variant="outline" onClick={() => goToViewerPage(-1)} disabled={selectedPageIndex <= 0} title="Página anterior (o flecha izquierda)"><ChevronLeft size={16}/> Anterior</Button>
                    <span className="catalog-design-page-indicator" title="Página actual de páginas visibles">{visiblePages.length ? `${selectedPageIndex + 1} / ${visiblePages.length}` : "0 / 0"}</span>
                    <Button className="catalog-design-nav-btn" variant="outline" onClick={() => goToViewerPage(1)} disabled={selectedPageIndex < 0 || selectedPageIndex >= visiblePages.length - 1} title="Página siguiente (o flecha derecha)">Siguiente <ChevronRight size={16}/></Button>
                  </div>

                  <div className="catalog-design-zoom-group" role="group" aria-label="Controles de zoom">
                    <Button className="catalog-design-zoom-btn" variant="outline" onClick={() => setViewerZoom((value) => Math.max(50, value - 15))} disabled={!selectedPage} title="Reducir zoom" aria-label="Reducir zoom"><ZoomOut size={16}/></Button>
                    <span className="catalog-design-zoom-level" title="Nivel de zoom actual">{viewerZoom}%</span>
                    <Button className="catalog-design-zoom-btn" variant="outline" onClick={() => setViewerZoom((value) => Math.min(220, value + 15))} disabled={!selectedPage} title="Aumentar zoom" aria-label="Aumentar zoom"><ZoomIn size={16}/></Button>
                    <Button className="catalog-design-zoom-preset-btn" variant={viewerZoom === 100 ? "default" : "outline"} onClick={() => setViewerZoom(100)} disabled={!selectedPage} title="Ajustar al ancho (100%)">Ajustar</Button>
                    <Button className="catalog-design-zoom-preset-btn" variant={viewerZoom === 140 ? "default" : "outline"} onClick={() => setViewerZoom(140)} disabled={!selectedPage} title="Zoom detalle (140%)">140%</Button>
                  </div>

                  <Button
                    className={classNames("catalog-design-focus-btn", focusMode && "active")}
                    variant={focusMode ? "default" : "outline"}
                    onClick={() => setFocusMode((v) => !v)}
                    title={focusMode ? "Salir de Modo Enfoque (F o Esc)" : "Modo Enfoque / Pantalla Completa (F)"}
                  >
                    {focusMode ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
                    <span>{focusMode ? "Salir Enfoque" : "Modo Enfoque"}</span>
                  </Button>

                  <Button className={classNames("catalog-design-sku-btn", activeSideTab === "sku" && "active")} variant="outline" onClick={() => { setActiveSideTab("sku"); setSideRailCollapsed(false); }} title="Buscar información de SKU"><Search size={16}/> Buscar SKU</Button>

                  {canUploadSelectedPage && <label className="btn btn-primary catalog-design-file-btn catalog-design-viewer-upload">
                    <ImageUp size={16}/> Actualizar imagen
                    <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => { uploadPageImage(selectedPage, event.target.files?.[0]); event.target.value = ""; }} />
                  </label>}
                </div>
              </div>

              {selectedPage && <div className="catalog-design-review-quickbar">
                <div className="catalog-design-annotation-tools" aria-label="Herramientas de señalización">
                  <Button className="catalog-design-pencil-btn" variant={annotationMode ? "default" : "outline"} onClick={() => { setAnnotationMode((value) => !value); openReviewPanel(); }} disabled={!canUseAnnotations} title={canUseAnnotations ? "Señalar sobre la página con imagen" : "Seleccione una página con imagen asignada para revisar."}>
                    <Pencil size={16}/> Señalar
                  </Button>
                  {annotationMode && ANNOTATION_TOOLS.map(([tool, label, Icon]) => <button key={tool} type="button" className={annotationTool === tool ? "catalog-design-tool-btn selected" : "catalog-design-tool-btn"} onClick={() => setAnnotationTool(tool)} title={label} aria-label={label}><Icon size={16}/></button>)}
                  {annotationMode && <button type="button" className="catalog-design-tool-btn" onClick={undoAnnotation} disabled={!draftAnnotations.length} title="Deshacer última señal" aria-label="Deshacer última señal"><Undo2 size={16}/></button>}
                </div>
                <div className="catalog-design-review-actions">
                  <Button variant="outline" onClick={openReviewPanel} disabled={!selectedPage}><MessageSquare size={16}/> Comentar</Button>
                  {canReviewSelectedPage && <>
                    <Button onClick={() => reviewPage("aprobada", "aprobacion")}><CheckCircle2 size={16}/> Aprobar</Button>
                    <Button variant="outline" onClick={() => { openReviewPanel(); if (!commentText.trim()) setCommentText("Requiere ajuste: "); }}><XCircle size={16}/> Rechazar</Button>
                  </>}
                </div>
              </div>}

              <div className={classNames("catalog-design-review-workspace", sideRailCollapsed && "rail-collapsed")}>
                <aside className={classNames("catalog-design-comment-rail", sideRailCollapsed && "collapsed")}>
                  <div className="catalog-design-rail-tabs-bar">
                    <div className="catalog-design-rail-tabs">
                      <button
                        type="button"
                        className={classNames("catalog-design-tab-btn", activeSideTab === "comments" && "active")}
                        onClick={() => setActiveSideTab("comments")}
                      >
                        <MessageSquare size={14}/> Comentarios
                        {selectedComments.length > 0 && <span className="catalog-design-tab-badge">{selectedComments.length}</span>}
                      </button>
                      <button
                        type="button"
                        className={classNames("catalog-design-tab-btn", activeSideTab === "sku" && "active")}
                        onClick={() => setActiveSideTab("sku")}
                      >
                        <Search size={14}/> Buscar SKU
                      </button>
                    </div>
                    <button
                      type="button"
                      className="icon-btn catalog-design-rail-toggle-btn"
                      onClick={() => setSideRailCollapsed((c) => !c)}
                      title={sideRailCollapsed ? "Expandir panel" : "Contraer panel"}
                      aria-label={sideRailCollapsed ? "Expandir panel" : "Contraer panel"}
                    >
                      {sideRailCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                    </button>
                  </div>

                  {!sideRailCollapsed && activeSideTab === "comments" && (
                    <div className="catalog-design-rail-content">
                      <div className="catalog-design-comment-rail-head">
                        <div>
                          <strong>Comentarios de página</strong>
                          <span>{selectedComments.length ? `${selectedComments.length} registrado${selectedComments.length === 1 ? "" : "s"}` : "Sin comentarios"}</span>
                        </div>
                        {!isDraftingComment && (
                          <Button variant="outline" onClick={openReviewPanel} disabled={!selectedPage}>
                            <Plus size={15}/> Nuevo
                          </Button>
                        )}
                      </div>

                      {/* Integrated Comment Composer */}
                      {isDraftingComment && selectedPage && (
                        <div className="catalog-design-comment-composer">
                          <div className="catalog-design-composer-head">
                            <strong>Nuevo comentario</strong>
                            {pendingAnnotationCount > 0 && (
                              <span className="catalog-design-composer-signal-tag">
                                {pendingAnnotationCount} señal{pendingAnnotationCount === 1 ? "" : "es"} en imagen
                              </span>
                            )}
                          </div>
                          <div className="catalog-design-category-selector" role="radiogroup" aria-label="Categoría de observación">
                            {COMMENT_CATEGORIES.map((cat) => (
                              <button
                                key={cat.id}
                                type="button"
                                className={classNames("catalog-design-cat-pill", commentCategory === cat.id && "selected")}
                                style={{ "--cat-color": cat.color }}
                                onClick={() => setCommentCategory(cat.id)}
                              >
                                <span>{cat.icon}</span> {cat.label}
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={commentText}
                            onChange={(event) => setCommentText(event.target.value)}
                            placeholder="Describe el ajuste necesario para el diseñador..."
                            rows={3}
                            autoFocus={!annotationMode}
                          />
                          <div className="catalog-design-composer-actions">
                            <Button variant="outline" onClick={resetReviewDraft}>Cancelar</Button>
                            <Button variant="outline" onClick={addComment} disabled={!commentText.trim()}>
                              <Save size={15}/> Guardar
                            </Button>
                            {canReviewSelectedPage && (
                              <>
                                <Button onClick={() => reviewPage("aprobada", "aprobacion")} title="Aprobar página">
                                  <CheckCircle2 size={15}/> Aprobar
                                </Button>
                                <Button variant="outline" onClick={() => reviewPage("ajustes", "rechazo")} title="Enviar a ajustes">
                                  <XCircle size={15}/> Rechazar
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Comments List */}
                      <div className="catalog-design-comment-rail-list">
                        {selectedComments.map((comment) => {
                          const commentNumber = chronologicalOrder.get(comment.id) || 1;
                          const annotationCount = normalizeCommentAnnotations(comment).length;
                          const commentStatus = getCommentStatus(comment);
                          const selected = activeCommentId === comment.id || hoveredAnnotation?.commentId === comment.id;
                          const catColor = CATEGORY_COLORS[comment.tipo] || ANNOTATION_COLOR;
                          const categoryInfo = COMMENT_CATEGORIES.find((c) => c.id === comment.tipo);
                          return (
                            <div
                              key={comment.id}
                              id={`catalog-comment-${comment.id}`}
                              role="button"
                              tabIndex={0}
                              className={classNames(
                                "catalog-design-comment-item",
                                selected && "selected",
                                commentStatus === "resuelto" && "resolved"
                              )}
                              style={{ "--comment-accent": catColor }}
                              onMouseEnter={() => setActiveCommentId(comment.id)}
                              onMouseLeave={() => setActiveCommentId("")}
                              onFocus={() => setActiveCommentId(comment.id)}
                              onBlur={() => setActiveCommentId("")}
                              onClick={() => highlightAndScrollComment(comment.id)}
                            >
                              <div className="catalog-design-comment-item-top">
                                <div className="catalog-design-comment-id-badge" style={{ backgroundColor: catColor }}>
                                  #{commentNumber}
                                </div>
                                <span className="catalog-design-comment-cat-tag" style={{ color: catColor }}>
                                  {categoryInfo ? `${categoryInfo.icon} ${categoryInfo.label}` : (comment.tipo || "Comentario")}
                                </span>
                                <span className="catalog-design-comment-meta">{formatDate(comment.fecha_creacion) || "sin fecha"}</span>
                                <span className={classNames("catalog-design-comment-status", commentStatus)}>{commentStatus}</span>
                              </div>
                              <strong>{getUserLabel(userById[comment.usuario_id])}</strong>
                              <p>{comment.comentario}</p>
                              <div className="catalog-design-comment-item-foot">
                                {annotationCount > 0 ? (
                                  <span className="catalog-design-comment-signal" style={{ color: catColor, borderColor: catColor }}>
                                    Pin #{commentNumber} ({annotationCount} señal{annotationCount === 1 ? "" : "es"})
                                  </span>
                                ) : <span />}
                                {canUpdateCommentStatus && (
                                  <button
                                    type="button"
                                    className="catalog-design-comment-status-btn"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      updateCommentStatus(comment, commentStatus === "resuelto" ? "abierto" : "resuelto");
                                    }}
                                    title={commentStatus === "resuelto" ? "Reabrir comentario" : "Marcar como resuelto"}
                                  >
                                    {commentStatus === "resuelto" ? <RefreshCw size={13}/> : <CheckCircle2 size={13}/>}
                                    <span>{commentStatus === "resuelto" ? "Reabrir" : "Resolver"}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {!selectedComments.length && !isDraftingComment && (
                          <div className="empty-state">Aún no hay comentarios para esta página.</div>
                        )}
                      </div>
                    </div>
                  )}

                  {!sideRailCollapsed && activeSideTab === "sku" && (
                    <div className="catalog-design-rail-content">
                      <div className="catalog-design-sku-head">
                        <div>
                          <strong>Buscar SKU</strong>
                          <span>Valida datos promocionales en paralelo al catálogo</span>
                        </div>
                      </div>
                      <form className="catalog-design-sku-search" onSubmit={submitSkuSearch}>
                        <input
                          value={skuQuery}
                          onChange={(event) => setSkuQuery(event.target.value)}
                          placeholder="Código SKU (ej. 102345)"
                          autoFocus
                        />
                        <Button type="submit" disabled={!skuQuery.trim()}><Search size={15}/> Buscar</Button>
                      </form>
                      <div className="catalog-design-sku-results">
                        {!skuSearchTerm && (
                          <div className="catalog-design-sku-empty">
                            Ingrese un código para consultar descripción, precios, descuento y comentario.
                          </div>
                        )}
                        {skuSearchTerm && !skuSearchResults.length && (
                          <div className="catalog-design-sku-empty">
                            No se encontró información para el SKU {skuSearchTerm}.
                          </div>
                        )}
                        {skuSearchResults.map((row, index) => (
                          <div className="catalog-design-sku-result" key={`${row.id || row.row_id || row.sku}-${index}`}>
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
                              <span>Comentario del comprador</span>
                              <p>{formatSkuInfoValue(getPromoField(row, "comentario", "comentario_comprador"))}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </aside>

                <div className="catalog-design-viewer-surface">
                  <div
                    className={classNames(
                      "catalog-design-viewer-stage",
                      (viewerZoom > 100 || isSpacePressed) && !annotationMode && "can-pan",
                      isPanning && "is-panning"
                    )}
                    ref={viewerStageRef}
                    onPointerDown={handleStagePointerDown}
                    onPointerMove={handleStagePointerMove}
                    onPointerUp={handleStagePointerUp}
                    onPointerCancel={handleStagePointerUp}
                  >
                    {selectedImageUrl ? (
                      <div className="catalog-design-image-shell" ref={imageShellRef} style={{ width: `${viewerZoom}%` }}>
                        <img src={selectedImageUrl} alt={selectedPage?.titulo_pagina || "Página de catálogo"} draggable={false} />
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
                                highlightAndScrollComment(annotation.commentId);
                              },
                              onPointerLeave: () => {
                                setHoveredAnnotation(null);
                                setActiveCommentId("");
                              },
                              onClick: (event) => {
                                event.stopPropagation();
                                highlightAndScrollComment(annotation.commentId);
                              },
                              onFocus: () => {
                                setHoveredAnnotation(annotation);
                                highlightAndScrollComment(annotation.commentId);
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
                        {hoveredAnnotation && hoveredAnnotationAnchor && (
                          <div className="catalog-design-annotation-tooltip" style={{ left: `${hoveredAnnotationAnchor.x * 100}%`, top: `${hoveredAnnotationAnchor.y * 100}%` }}>
                            <strong>{hoveredAnnotation.commentIndex ? `#${hoveredAnnotation.commentIndex} ` : ""}{hoveredAnnotation.commentType || "comentario"} · {hoveredAnnotation.commentUser || "Usuario"}</strong>
                            <p>{hoveredAnnotation.commentText}</p>
                            {hoveredAnnotation.commentDate && <span>{hoveredAnnotation.commentDate}</span>}
                          </div>
                        )}
                        {annotationMode && <div className="catalog-design-drawing-hint">Arrastre sobre la imagen para señalar.</div>}
                        {viewerZoom > 100 && !annotationMode && (
                          <div className="catalog-design-pan-hint">
                            <span>💡 Arrastre con el ratón para desplazarse por la imagen (Pan)</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="catalog-design-viewer-empty">
                        <ImageUp size={32}/>
                        <strong>{selectedPage ? "Sin imagen cargada" : "Seleccione una página"}</strong>
                        <span>{selectedPage ? "El diseñador debe cargar una imagen JPG o PNG para revisión." : "Use la tira inferior o tabla para elegir una página del proyecto."}</span>
                      </div>
                    )}
                  </div>
                  {selectedPage && <p className="catalog-design-viewer-note">Ruta Storage: {selectedPage.archivo_path || `catalogos/${selectedProject?.catalogo_id}/paginas/pagina_${selectedPage.numero_pagina}.jpg`}</p>}
                </div>
              </div>
            </div>

            <div className="catalog-design-pages-header">
              <div className="catalog-design-pages-title-group">
                <h3>Hojas del Proyecto ({visiblePages.length})</h3>
                <span className="catalog-design-pages-subtitle">
                  {pageViewMode === "filmstrip"
                    ? "Haga clic en una miniatura para abrirla en el visor sin perder de vista el catálogo."
                    : "Vista tabular tradicional para auditoría de fechas y asignación rápida."}
                </span>
              </div>
              <div className="catalog-design-view-mode-toggle" role="tablist" aria-label="Modo de visualización de páginas">
                <button
                  type="button"
                  role="tab"
                  aria-selected={pageViewMode === "filmstrip"}
                  className={classNames("catalog-design-view-mode-btn", pageViewMode === "filmstrip" && "active")}
                  onClick={() => setPageViewMode("filmstrip")}
                  title="Ver como tira de miniaturas continua"
                >
                  <LayoutGrid size={15}/> Tira de Miniaturas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={pageViewMode === "table"}
                  className={classNames("catalog-design-view-mode-btn", pageViewMode === "table" && "active")}
                  onClick={() => setPageViewMode("table")}
                  title="Ver como tabla tradicional"
                >
                  <List size={15}/> Tabla Detallada
                </button>
              </div>
            </div>

            {pageViewMode === "filmstrip" ? (
              <div className="catalog-design-filmstrip-wrapper">
                <button
                  type="button"
                  className="catalog-design-filmstrip-nav-btn left"
                  onClick={() => scrollFilmstrip(-1)}
                  title="Desplazar hacia la izquierda"
                  aria-label="Desplazar hacia la izquierda"
                >
                  <ChevronLeft size={18}/>
                </button>

                <div className="catalog-design-filmstrip-track" ref={filmstripTrackRef}>
                  {visiblePages.map((page) => {
                    const isSelected = selectedPage?.id === page.id;
                    const imageUrl = signedUrls[page.id];
                    const pageCommentsCount = commentCountByPageId[page.id] || 0;
                    const canUploadPage = isAdminOrMark || (canUpload && page.disenador_id === currentUserId);
                    return (
                      <div
                        key={page.id}
                        id={`filmstrip-card-${page.id}`}
                        className={classNames("catalog-design-filmstrip-card", isSelected && "selected")}
                        onClick={() => selectViewerPage(page)}
                        role="button"
                        tabIndex={0}
                        title={`Página ${page.numero_pagina} · ${page.estado || "pendiente"}`}
                      >
                        <div className="catalog-design-filmstrip-card-head">
                          <span className="catalog-design-filmstrip-page-num">#{page.numero_pagina}</span>
                          <StateBadge state={page.estado || "pendiente"} />
                        </div>

                        <div className="catalog-design-filmstrip-card-preview">
                          {imageUrl ? (
                            <img src={imageUrl} alt={`Pág. ${page.numero_pagina}`} loading="lazy" draggable={false} />
                          ) : (
                            <div className="catalog-design-filmstrip-empty">
                              <ImageUp size={22} />
                              <span>Sin arte</span>
                            </div>
                          )}
                          {isSelected && <div className="catalog-design-filmstrip-active-pill">EN VISOR</div>}
                        </div>

                        <div className="catalog-design-filmstrip-card-foot">
                          <div className="catalog-design-filmstrip-comments-count">
                            {pageCommentsCount > 0 ? (
                              <span className="catalog-design-filmstrip-comment-pill" title={`${pageCommentsCount} observaciones`}>
                                <MessageSquare size={12} /> {pageCommentsCount}
                              </span>
                            ) : (
                              <span className="catalog-design-filmstrip-no-comments">0 obs.</span>
                            )}
                          </div>

                          {canUploadPage && (
                            <label
                              className="btn btn-outline catalog-design-filmstrip-upload-btn"
                              title="Subir o actualizar imagen de esta página"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ImageUp size={12} /> Subir
                              <input
                                type="file"
                                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                                onChange={(event) => {
                                  uploadPageImage(page, event.target.files?.[0]);
                                  event.target.value = "";
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!visiblePages.length && (
                    <div className="empty-state">No hay páginas disponibles con los filtros actuales.</div>
                  )}
                </div>

                <button
                  type="button"
                  className="catalog-design-filmstrip-nav-btn right"
                  onClick={() => scrollFilmstrip(1)}
                  title="Desplazar hacia la derecha"
                  aria-label="Desplazar hacia la derecha"
                >
                  <ChevronRight size={18}/>
                </button>
              </div>
            ) : (
              <div className="table-wrap catalog-design-table">
                <table>
                  <thead>
                    <tr>
                      <th>Pág.</th>
                      <th>Miniatura</th>
                      <th>Título</th>
                      <th>Diseñador</th>
                      <th>Comprador</th>
                      <th>Estado</th>
                      <th>Comentarios</th>
                      <th>Última carga</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePages.map((page) => {
                      const canUploadPage = isAdminOrMark || (canUpload && page.disenador_id === currentUserId);
                      const imageUrl = signedUrls[page.id];
                      const pageCommentsCount = commentCountByPageId[page.id] || 0;
                      const isSelected = selectedPage?.id === page.id;
                      return (
                        <tr
                          key={page.id}
                          className={isSelected ? "catalog-design-selected-row" : ""}
                          onClick={() => selectViewerPage(page)}
                          style={{ cursor: "pointer" }}
                        >
                          <td><strong>#{page.numero_pagina}</strong></td>
                          <td>
                            {imageUrl ? (
                              <button
                                type="button"
                                className="catalog-design-thumb"
                                onClick={(e) => { e.stopPropagation(); selectViewerPage(page); }}
                                title="Ver en visor"
                              >
                                <img src={imageUrl} alt={`Página ${page.numero_pagina}`} />
                              </button>
                            ) : (
                              <span className="catalog-design-no-thumb">Sin imagen</span>
                            )}
                          </td>
                          <td>
                            <div className="catalog-design-table-title">
                              <strong>{page.titulo_pagina || `Página ${page.numero_pagina}`}</strong>
                            </div>
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {canManage ? (
                              <select
                                className="catalog-design-table-select"
                                value={page.disenador_id || ""}
                                onChange={(event) => updatePageField(page, "disenador_id", event.target.value || null)}
                              >
                                <option value="">Sin asignar</option>
                                {designerOptions.map((user) => (
                                  <option key={user.id} value={user.id}>{user.nombre || user.email}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="catalog-design-table-user">{getUserLabel(userById[page.disenador_id])}</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {canManage ? (
                              <select
                                className="catalog-design-table-select"
                                value={page.comprador_id || ""}
                                onChange={(event) => updatePageField(page, "comprador_id", event.target.value || null)}
                              >
                                <option value="">Sin asignar</option>
                                {buyers.map((buyer) => (
                                  <option key={buyer.id} value={buyer.id}>{buyer.comprador}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="catalog-design-table-user">{getBuyerLabel(buyerById[page.comprador_id])}</span>
                            )}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {canManage ? (
                              <select
                                className="catalog-design-table-select"
                                value={page.estado || "pendiente"}
                                onChange={(event) => updatePageField(page, "estado", event.target.value)}
                              >
                                {PAGE_STATES.map((state) => (
                                  <option key={state} value={state}>{state.replace(/_/g, " ")}</option>
                                ))}
                              </select>
                            ) : (
                              <StateBadge state={page.estado}/>
                            )}
                          </td>
                          <td>
                            {pageCommentsCount > 0 ? (
                              <span className="catalog-design-table-comment-pill" title={`${pageCommentsCount} comentarios registrados`}>
                                <MessageSquare size={13}/> {pageCommentsCount}
                              </span>
                            ) : (
                              <span className="catalog-design-table-no-comments">—</span>
                            )}
                          </td>
                          <td>{formatDate(page.fecha_ultima_carga) || "Sin carga"}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="catalog-design-actions">
                              {canUploadPage && (
                                <label className="btn btn-outline catalog-design-file-btn" title="Subir nueva imagen">
                                  <ImageUp size={15}/> Subir
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                                    onChange={(event) => {
                                      uploadPageImage(page, event.target.files?.[0]);
                                      event.target.value = "";
                                    }}
                                  />
                                </label>
                              )}
                              <Button
                                variant={isSelected ? "default" : "outline"}
                                onClick={() => selectViewerPage(page)}
                                title="Abrir página en el visor"
                              >
                                <Eye size={15}/> Revisar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!visiblePages.length && <tr><td colSpan={9}><div className="empty-state">No hay páginas visibles con los filtros actuales.</div></td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  </div>;
}
