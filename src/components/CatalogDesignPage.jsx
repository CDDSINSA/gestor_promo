import DesignImageViewer from "../features/catalogDesign/DesignImageViewer";
import DesignViewerToolbar from "../features/catalogDesign/DesignViewerToolbar";
import { clampRatio, stripDraftCoordinates, buildBoxAnnotation, isUsefulAnnotation, getAnnotationAnchor } from "../features/catalogDesign/annotationGeometry";
import DesignCommentsPanel from "../features/catalogDesign/DesignCommentsPanel";
import DesignProjectSettings from "../features/catalogDesign/DesignProjectSettings";
import DesignPageList from "../features/catalogDesign/DesignPageList";
import CreateDesignProjectModal from "../features/catalogDesign/CreateDesignProjectModal";
import { PAGE_STATES, ANNOTATION_COLOR, CATEGORY_COLORS, formatDate, getUserLabel, getBuyerLabel, getCommentStatus, normalizeCommentAnnotations } from "../features/catalogDesign/designPresentation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { PERMISSIONS, normalizeRole, ROLES } from "../constants/permissions";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { buildDesignNotificationEvent } from "../features/notifications/notificationEvents";
import { deliverNotifications } from "../features/notifications/deliverNotifications";
import {
  CATALOG_DESIGN_WORK_BUCKET,
  createLiveNotification,
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
  const [annotationsHidden, setAnnotationsHidden] = useState(false);
  const [annotationTool, setAnnotationTool] = useState("rect");
  const [draftAnnotations, setDraftAnnotations] = useState([]);
  const [activeAnnotation, setActiveAnnotation] = useState(null);
  const [activeCommentId, setActiveCommentId] = useState("");
  const [hoveredAnnotation, setHoveredAnnotation] = useState(null);
  const [targetPageCount, setTargetPageCount] = useState("");
  const [projectPanelCollapsed, setProjectPanelCollapsed] = useState(false);
  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [skuQuery, setSkuQuery] = useState("");
  const [skuSearchTerm, setSkuSearchTerm] = useState("");
  const [isDraggingOverStage, setIsDraggingOverStage] = useState(false);
  const [commentFilter, setCommentFilter] = useState("all");
  const [copiedSkuText, setCopiedSkuText] = useState("");
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
  const filteredProjects = useMemo(() => {
    if (!projectSearchQuery.trim()) return visibleProjects;
    const q = projectSearchQuery.toLowerCase().trim();
    return visibleProjects.filter((project) =>
      (project.nombre_proyecto || "").toLowerCase().includes(q) ||
      (project.estado || "").toLowerCase().includes(q)
    );
  }, [visibleProjects, projectSearchQuery]);
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

  const pendingCommentsCount = useMemo(() => {
    return selectedComments.filter((c) => getCommentStatus(c) === "abierto").length;
  }, [selectedComments]);

  const resolvedCommentsCount = useMemo(() => {
    return selectedComments.filter((c) => getCommentStatus(c) === "resuelto").length;
  }, [selectedComments]);

  const filteredSelectedComments = useMemo(() => {
    if (commentFilter === "pending") {
      return selectedComments.filter((c) => getCommentStatus(c) === "abierto");
    }
    if (commentFilter === "resolved") {
      return selectedComments.filter((c) => getCommentStatus(c) === "resuelto");
    }
    return selectedComments;
  }, [selectedComments, commentFilter]);

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

  const designEvent = (page, action, details = {}) => buildDesignNotificationEvent({
    page, project: projects.find((project) => project.id === page?.proyecto_id),
    actorRole: currentRole, action, ...details,
  });

  const runAction = async (loadingMessage, action, successMessage, notificationEvent = null) => {
    setStatus({ type: "loading", message: loadingMessage });
    try {
      await action();
      const warnings = await deliverNotifications([notificationEvent], (event) => createLiveNotification(supabaseConnection, event));
      await refreshData();
      setStatus({ type: "ready", message: warnings.length ? `${successMessage} Advertencias de notificacion: ${warnings.join(" ")}` : successMessage });
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
      setIsCreateProjectModalOpen(false);
    },
    "Proyecto creado con sus páginas iniciales."
  );

  const openCreateProjectModal = () => {
    setProjectForm(buildInitialProject(catalogosTrabajables));
    setIsCreateProjectModalOpen(true);
  };

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
    }, "Página actualizada.", field === "estado" && page.estado !== value ? designEvent(page, "state", { state: value }) : null);
  };

  const uploadPageImage = (page, file) => {
    if (!file) return;
    runAction("Subiendo imagen de página...", () => uploadCatalogDesignPageImage(supabaseConnection, page, selectedProject, file, currentUserId), "Imagen actualizada sin crear versiones.", designEvent(page, "image", { state: "en_revision" }));
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
    }, "Comentario guardado.", designEvent(selectedPage, "comment"));
  };

  const reviewPage = (nextStatus, type) => {
    if (!selectedPage) return;
    runAction("Registrando revisión...", async () => {
      await reviewCatalogDesignPage(supabaseConnection, selectedPage, nextStatus, commentText, commentCategory || type, currentUserId, draftAnnotations);
      resetReviewDraft();
    }, nextStatus === "aprobada" ? "Página aprobada." : "Página enviada a ajustes.", designEvent(selectedPage, "review", { state: nextStatus }));
  };

  const updateCommentStatus = (comment, nextStatus) => {
    if (!comment?.id) return;
    runAction(nextStatus === "resuelto" ? "Marcando comentario como resuelto..." : "Reabriendo comentario...", async () => {
      await updateCatalogDesignPageCommentStatus(supabaseConnection, comment.id, nextStatus, currentUserId);
    }, nextStatus === "resuelto" ? "Comentario marcado como resuelto." : "Comentario reabierto.", designEvent(pages.find((page) => page.id === comment.pagina_id), nextStatus === "resuelto" ? "resolved" : "reopened", { commentId: comment.id }));
  };

  const viewPageImage = (page) => {
    selectViewerPage(page);
  };

  const canUploadSelectedPage = selectedPage && (isAdminOrMark || (canUpload && (selectedPage.disenador_id === currentUserId || !selectedPage.disenador_id)) || isDesigner);
  const canReviewSelectedPage = selectedPage && (isAdminOrMark || (canReview && (selectedPage.comprador_id === currentBuyerId || !selectedPage.comprador_id)));
  const canUpdateCommentStatus = Boolean(selectedPage && (isAdminOrMark || canReview || canUpload || isDesigner || isBuyer));
  const canUseAnnotations = Boolean(selectedPage && selectedImageUrl);

  const toggleAnnotationMode = () => {
    if (!canUseAnnotations) return;
    if (!annotationMode) {
      setAnnotationsHidden(false);
      openReviewPanel();
    }
    setAnnotationMode(!annotationMode);
  };

  const toggleAnnotationsVisibility = () => {
    if (!canUseAnnotations) return;
    setAnnotationsHidden(!annotationsHidden);
    setHoveredAnnotation(null);
    if (!annotationsHidden) {
      setAnnotationMode(false);
      setActiveAnnotation(null);
    }
  };

  const copyToClipboard = (text, label) => {
    if (!text) return;
    navigator.clipboard?.writeText?.(String(text));
    setCopiedSkuText(label || text);
    setStatus({ type: "ready", message: `Copiado: ${label || text}` });
    setTimeout(() => setCopiedSkuText(""), 2000);
  };

  const handleStageDragOver = (e) => {
    if (!canUploadSelectedPage) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverStage(true);
  };

  const handleStageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverStage(false);
  };

  const handleStageDrop = (e) => {
    if (!canUploadSelectedPage) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverStage(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.type?.startsWith("image/") || /\.(jpg|jpeg|png)$/i.test(file.name))) {
      uploadPageImage(selectedPage, file);
    }
  };

  const pendingAnnotationCount = draftAnnotations.length + (activeAnnotation ? 1 : 0);
  const hoveredAnnotationAnchor = hoveredAnnotation ? getAnnotationAnchor(hoveredAnnotation) : null;

  return <div className={classNames("catalog-design-page", focusMode && "catalog-design-focus-active")}>
    <div className="toolbar page-header-toolbar">
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
            <div className="catalog-design-sidebar-title-group">
              <h2>Proyectos</h2>
              <span className="catalog-design-badge-count">{visibleProjects.length}</span>
            </div>
            <div className="toolbar-actions">
              <button type="button" className="icon-btn catalog-design-collapse-btn" onClick={() => setProjectPanelCollapsed(true)} title="Contraer proyectos" aria-label="Contraer proyectos"><PanelLeftClose size={18}/></button>
            </div>
          </div>

          {canManage && (
            <div className="catalog-design-sidebar-action">
              <Button
                type="button"
                className="catalog-design-new-project-btn"
                onClick={openCreateProjectModal}
                disabled={!catalogosTrabajables.length}
                title={catalogosTrabajables.length ? "Crear un nuevo proyecto de catálogo" : "Debe existir al menos un catálogo en Ajustes"}
              >
                <Plus size={16}/> Nuevo Proyecto
              </Button>
            </div>
          )}

          <div className="catalog-design-sidebar-search">
            <Search size={15}/>
            <input
              type="text"
              placeholder="Buscar proyecto..."
              value={projectSearchQuery}
              onChange={(event) => setProjectSearchQuery(event.target.value)}
              aria-label="Buscar proyecto"
            />
            {projectSearchQuery && (
              <button type="button" onClick={() => setProjectSearchQuery("")} aria-label="Limpiar búsqueda">
                <X size={14}/>
              </button>
            )}
          </div>

          <div className="list catalog-design-project-list">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={classNames("catalog-design-project-item", selectedProject?.id === project.id && "selected")}
                onClick={() => setSelectedProjectId(project.id)}
              >
                <div className="catalog-design-project-item-top">
                  <strong title={project.nombre_proyecto}>{project.nombre_proyecto}</strong>
                </div>
                <div className="catalog-design-project-item-bottom">
                  <span className={classNames("catalog-design-state-chip", `state-${String(project.estado || "planificacion").toLowerCase()}`)}>
                    {(project.estado || "planificación").replace(/_/g, " ")}
                  </span>
                  <span className="catalog-design-project-date">
                    {formatDate(project.fecha_entrega) || "sin fecha"}
                  </span>
                </div>
              </button>
            ))}
            {!filteredProjects.length && visibleProjects.length > 0 && <div className="empty-state">No hay proyectos que coincidan con la búsqueda.</div>}
            {!visibleProjects.length && projects.length > 0 && <div className="empty-state">{isAdminOrMark ? "No hay proyectos de diseño para catálogos trabajables." : "No hay proyectos con páginas asignadas a tu usuario."}</div>}
            {!projects.length && <div className="empty-state">No hay proyectos de diseño creados.</div>}
          </div>

          <div className="catalog-design-summary-card">
            <span>Proyecto activo</span>
            <strong>{selectedProject?.nombre_proyecto || "Sin proyecto seleccionado"}</strong>
            <p>{selectedProject ? selectedProjectCatalogo?.nombre || selectedProject.catalogo_id || "Proyecto sin catálogo visible" : "Seleccione un proyecto para revisar su avance."}</p>
            {selectedProject && <div className="catalog-design-summary-meta">
              <span><b>Estado:</b> {(selectedProject.estado || "planificación").replace(/_/g, " ")}</span>
              <span><b>Entrega:</b> {formatDate(selectedProject.fecha_entrega) || "sin fecha"}</span>
            </div>}
          </div>

          <div className="catalog-design-kpi-panel">
            <div><span>Total</span><strong>{metrics.total}</strong></div>
            <div><span>Pendientes</span><strong>{metrics.pendientes}</strong></div>
            <div><span>Revisión</span><strong>{metrics.revision}</strong></div>
            <div><span>Aprobadas</span><strong>{metrics.aprobadas}</strong></div>
            <div><span>Ajustes</span><strong>{metrics.ajustes}</strong></div>
            <div><span>Listas</span><strong>{metrics.listas}</strong></div>
            <div className="catalog-design-kpi-progress"><span>Avance</span><strong>{metrics.porcentaje}%</strong></div>
          </div>
          </>}
        </CardContent>
      </Card>

      <div className="catalog-design-main">
        <DesignProjectSettings
          configCollapsed={configCollapsed}
          setConfigCollapsed={setConfigCollapsed}
          selectedProject={selectedProject}
          selectedProjectPageCount={selectedProjectPageCount}
          canManage={canManage}
          saveSelectedProject={saveSelectedProject}
          updateProjectField={updateProjectField}
          targetPageCount={targetPageCount}
          setTargetPageCount={setTargetPageCount}
        />
        <Card className="grid-card catalog-design-viewer-card">
          <CardContent>
            <div className="toolbar catalog-design-viewer-toolbar">
              <div className="catalog-design-viewer-header-info">
                <h2>Páginas de {selectedProject?.nombre_proyecto || "proyecto"}</h2>
                {selectedPage && (
                  <div className="catalog-design-viewer-current-meta">
                    <span title="Diseñador asignado">🎨 {getUserLabel(userById[selectedPage.disenador_id]) || "Sin diseñador"}</span>
                    <span className="dot-sep">·</span>
                    <span title="Comprador asignado">🛒 {getBuyerLabel(buyerById[selectedPage.comprador_id]) || "Sin comprador"}</span>
                  </div>
                )}
              </div>
              <div className="toolbar-actions filters">
                <select value={filters.designer} onChange={(event) => setFilters((current) => ({ ...current, designer: event.target.value }))}><option value="">Todos los diseñadores</option>{designerOptions.map((user) => <option key={user.id} value={user.id}>{user.nombre || user.email}</option>)}</select>
                <select value={filters.buyer} onChange={(event) => setFilters((current) => ({ ...current, buyer: event.target.value }))}><option value="">Todos los compradores</option>{seniorBuyerFilterOptions.map((buyer) => <option key={buyer.id} value={buyer.id}>{buyer.comprador}</option>)}</select>
                <select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))}><option value="">Todos los estados</option>{PAGE_STATES.map((state) => <option key={state} value={state}>{state.replace(/_/g, " ")}</option>)}</select>
              </div>
            </div>

            <div className="catalog-design-viewer">
              {/* Barra de control unificada del área de trabajo */}
              <DesignViewerToolbar
                goToViewerPage={goToViewerPage}
                selectedPageIndex={selectedPageIndex}
                visiblePages={visiblePages}
                selectedPage={selectedPage}
                canManage={canManage}
                updatePageField={updatePageField}
                setViewerZoom={setViewerZoom}
                viewerZoom={viewerZoom}
                annotationMode={annotationMode}
                toggleAnnotationMode={toggleAnnotationMode}
                annotationsHidden={annotationsHidden}
                toggleAnnotationsVisibility={toggleAnnotationsVisibility}
                canUseAnnotations={canUseAnnotations}
                annotationTool={annotationTool}
                setAnnotationTool={setAnnotationTool}
                undoAnnotation={undoAnnotation}
                draftAnnotations={draftAnnotations}
                focusMode={focusMode}
                setFocusMode={setFocusMode}
                activeSideTab={activeSideTab}
                sideRailCollapsed={sideRailCollapsed}
                setActiveSideTab={setActiveSideTab}
                setSideRailCollapsed={setSideRailCollapsed}
                openReviewPanel={openReviewPanel}
                selectedComments={selectedComments}
                canUploadSelectedPage={canUploadSelectedPage}
                uploadPageImage={uploadPageImage}
                canReviewSelectedPage={canReviewSelectedPage}
                reviewPage={reviewPage}
                commentText={commentText}
                setCommentText={setCommentText}
              />
              <div className={classNames("catalog-design-review-workspace", sideRailCollapsed && "rail-collapsed")}>
                <aside className={classNames("catalog-design-comment-rail", sideRailCollapsed && "collapsed")}>
                  <div className="catalog-design-rail-tabs-bar">
                    <div className="catalog-design-rail-tabs">
                      <button
                        type="button"
                        className={classNames("catalog-design-tab-btn", activeSideTab === "comments" && "active")}
                        onClick={() => setActiveSideTab("comments")}
                      >
                        <MessageSquare size={14}/> Observaciones
                        {selectedComments.length > 0 && <span className="catalog-design-tab-badge">{selectedComments.length}</span>}
                      </button>
                      <button
                        type="button"
                        className={classNames("catalog-design-tab-btn", activeSideTab === "sku" && "active")}
                        onClick={() => setActiveSideTab("sku")}
                      >
                        <Search size={14}/> Catálogo SKU
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
                    <DesignCommentsPanel
                      selectedComments={selectedComments}
                      pendingCommentsCount={pendingCommentsCount}
                      resolvedCommentsCount={resolvedCommentsCount}
                      isDraftingComment={isDraftingComment}
                      selectedPage={selectedPage}
                      openReviewPanel={openReviewPanel}
                      commentFilter={commentFilter}
                      setCommentFilter={setCommentFilter}
                      pendingAnnotationCount={pendingAnnotationCount}
                      commentCategory={commentCategory}
                      setCommentCategory={setCommentCategory}
                      commentText={commentText}
                      setCommentText={setCommentText}
                      annotationMode={annotationMode}
                      resetReviewDraft={resetReviewDraft}
                      addComment={addComment}
                      canReviewSelectedPage={canReviewSelectedPage}
                      reviewPage={reviewPage}
                      filteredSelectedComments={filteredSelectedComments}
                      chronologicalOrder={chronologicalOrder}
                      activeCommentId={activeCommentId}
                      hoveredAnnotation={hoveredAnnotation}
                      setActiveCommentId={setActiveCommentId}
                      highlightAndScrollComment={highlightAndScrollComment}
                      canUpdateCommentStatus={canUpdateCommentStatus}
                      updateCommentStatus={updateCommentStatus}
                      userById={userById}
                      supabaseConnection={supabaseConnection}
                      isAdminOrMark={isAdminOrMark}
                      isDesigner={isDesigner}
                      currentUserId={currentUserId}
                      isBuyer={isBuyer}
                      currentBuyerId={currentBuyerId}
                      runAction={runAction}
                      designEvent={designEvent}
                    />
                  )}

                  {!sideRailCollapsed && activeSideTab === "sku" && (
                    <div className="catalog-design-rail-content">
                      <div className="catalog-design-sku-head">
                        <div>
                          <strong>Datos Promocionales SKU</strong>
                          <span>Consulte y copie precios oficiales directo a su diseño</span>
                        </div>
                      </div>
                      <form className="catalog-design-sku-search" onSubmit={submitSkuSearch}>
                        <input
                          value={skuQuery}
                          onChange={(event) => setSkuQuery(event.target.value)}
                          placeholder="Buscar código SKU o descripción..."
                          autoFocus
                        />
                        <Button type="submit" disabled={!skuQuery.trim()}><Search size={15}/> Buscar</Button>
                      </form>

                      {/* Lista de resultados de búsqueda o SKUs asociados al proyecto */}
                      <div className="catalog-design-sku-results">
                        {skuSearchTerm && !skuSearchResults.length && (
                          <div className="catalog-design-sku-empty">
                            No se encontró información para "{skuSearchTerm}".
                          </div>
                        )}
                        {(skuSearchTerm ? skuSearchResults : selectedProjectPromoRows.slice(0, 20)).map((row, index) => (
                          <div className="catalog-design-sku-result" key={`${row.id || row.row_id || row.sku}-${index}`}>
                            <div className="catalog-design-sku-result-head">
                              <div>
                                <span className="sku-chip">SKU {formatSkuInfoValue(row.sku)}</span>
                                <button
                                  type="button"
                                  className="catalog-design-copy-btn"
                                  onClick={() => copyToClipboard(row.sku, `SKU ${row.sku}`)}
                                  title="Copiar código SKU"
                                >
                                  {copiedSkuText === `SKU ${row.sku}` ? <Check size={12}/> : <Copy size={12}/>}
                                </button>
                              </div>
                              {row.descuento && <span className="sku-discount-pill">{formatSkuInfoValue(getPromoField(row, "descuento"))}</span>}
                            </div>
                            <p className="sku-desc-text">
                              {formatSkuInfoValue(getPromoField(row, "descripcion"))}
                              <button
                                type="button"
                                className="catalog-design-copy-inline-btn"
                                onClick={() => copyToClipboard(getPromoField(row, "descripcion"), "Descripción")}
                                title="Copiar descripción al portapapeles"
                              >
                                <Copy size={12}/>
                              </button>
                            </p>
                            <div className="catalog-design-sku-data">
                              <div>
                                <span>Antes</span>
                                <strong>{formatSkuInfoValue(getPromoField(row, "precioAntes", "precio_antes"))}</strong>
                              </div>
                              <div className="sku-now-price">
                                <span>Ahora</span>
                                <strong>{formatSkuInfoValue(getPromoField(row, "precioAhora", "precio_ahora"))}</strong>
                                <button
                                  type="button"
                                  className="catalog-design-copy-inline-btn"
                                  onClick={() => copyToClipboard(getPromoField(row, "precioAhora", "precio_ahora"), "Precio")}
                                  title="Copiar precio oferta"
                                >
                                  <Copy size={12}/>
                                </button>
                              </div>
                            </div>
                            {getPromoField(row, "comentario", "comentario_comprador") && (
                              <div className="catalog-design-sku-comment">
                                <span>Nota comercial:</span>
                                <p>{formatSkuInfoValue(getPromoField(row, "comentario", "comentario_comprador"))}</p>
                              </div>
                            )}
                          </div>
                        ))}
                        {!skuSearchTerm && !selectedProjectPromoRows.length && (
                          <div className="catalog-design-sku-empty">
                            Ingrese un código para consultar descripción, precios, descuento y comentario.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </aside>

                {/* Superficie del Visor con soporte Drag & Drop nativo */}
                <DesignImageViewer
                  annotationsHidden={annotationsHidden}
                  viewerZoom={viewerZoom}
                  isSpacePressed={isSpacePressed}
                  annotationMode={annotationMode}
                  isPanning={isPanning}
                  isDraggingOverStage={isDraggingOverStage}
                  viewerStageRef={viewerStageRef}
                  handleStagePointerDown={handleStagePointerDown}
                  handleStagePointerMove={handleStagePointerMove}
                  handleStagePointerUp={handleStagePointerUp}
                  handleStageDragOver={handleStageDragOver}
                  handleStageDragLeave={handleStageDragLeave}
                  handleStageDrop={handleStageDrop}
                  selectedPage={selectedPage}
                  selectedImageUrl={selectedImageUrl}
                  imageShellRef={imageShellRef}
                  beginAnnotation={beginAnnotation}
                  moveAnnotation={moveAnnotation}
                  endAnnotation={endAnnotation}
                  selectedAnnotations={selectedAnnotations}
                  activeCommentId={activeCommentId}
                  hoveredAnnotation={hoveredAnnotation}
                  setHoveredAnnotation={setHoveredAnnotation}
                  highlightAndScrollComment={highlightAndScrollComment}
                  setActiveCommentId={setActiveCommentId}
                  draftAnnotations={draftAnnotations}
                  activeAnnotation={activeAnnotation}
                  hoveredAnnotationAnchor={hoveredAnnotationAnchor}
                  canUploadSelectedPage={canUploadSelectedPage}
                  uploadPageImage={uploadPageImage}
                />
              </div>
            </div>

            <DesignPageList
              visiblePages={visiblePages}
              pageViewMode={pageViewMode}
              setPageViewMode={setPageViewMode}
              scrollFilmstrip={scrollFilmstrip}
              filmstripTrackRef={filmstripTrackRef}
              selectedPage={selectedPage}
              signedUrls={signedUrls}
              commentCountByPageId={commentCountByPageId}
              isAdminOrMark={isAdminOrMark}
              canUpload={canUpload}
              currentUserId={currentUserId}
              selectViewerPage={selectViewerPage}
              uploadPageImage={uploadPageImage}
              canManage={canManage}
              updatePageField={updatePageField}
              designerOptions={designerOptions}
              userById={userById}
              buyers={buyers}
              buyerById={buyerById}
            />
          </CardContent>
        </Card>
      </div>
    </div>

    {isCreateProjectModalOpen && (
      <CreateDesignProjectModal
        setIsCreateProjectModalOpen={setIsCreateProjectModalOpen}
        projectForm={projectForm}
        setProjectForm={setProjectForm}
        catalogoById={catalogoById}
        catalogosTrabajables={catalogosTrabajables}
        getCatalogoId={getCatalogoId}
        buildPageTitle={buildPageTitle}
        createProject={createProject}
        canCreateProject={canCreateProject}
        status={status}
      />
    )}
  </div>;
}
