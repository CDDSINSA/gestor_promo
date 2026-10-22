import useDesignImageUrls from "../features/catalogDesign/useDesignImageUrls";
import DesignImageViewer from "../features/catalogDesign/DesignImageViewer";
import { getDesignCatalogPromotions, getDesignPageOffers, getDesignPromoPage } from "../features/catalogDesign/designPromotions";
import DesignSkuOfferCard from "../features/catalogDesign/DesignSkuOfferCard";
import DesignViewerToolbar from "../features/catalogDesign/DesignViewerToolbar";
import { clampRatio, stripDraftCoordinates, buildBoxAnnotation, isUsefulAnnotation, getAnnotationAnchor } from "../features/catalogDesign/annotationGeometry";
import DesignCommentsPanel from "../features/catalogDesign/DesignCommentsPanel";
import DesignProjectSettings from "../features/catalogDesign/DesignProjectSettings";
import DesignPageList from "../features/catalogDesign/DesignPageList";
import DesignPageFilters from "../features/catalogDesign/DesignPageFilters";
import DesignProgressBar from "../features/catalogDesign/DesignProgressBar";
import CreateDesignProjectModal from "../features/catalogDesign/CreateDesignProjectModal";
import DesignToast from "../features/catalogDesign/DesignToast";
import UploadConfirmModal from "../features/catalogDesign/UploadConfirmModal";
import { ANNOTATION_COLOR, CATEGORY_COLORS, CONFIRM_PAGE_STATES, formatDate, getUserLabel, getBuyerLabel, getCommentStatus, getPageStateLabel, getProjectStateLabel, normalizeCommentAnnotations } from "../features/catalogDesign/designPresentation";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  MessageSquare,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShoppingCart,
  X,
} from "lucide-react";
import { PERMISSIONS, normalizeRole, ROLES } from "../constants/permissions";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { buildDesignNotificationEvent } from "../features/notifications/notificationEvents";
import { deliverNotifications } from "../features/notifications/deliverNotifications";
import {
  createLiveNotification,
  addCatalogDesignPageComment,
  saveCatalogDesignProjectWithPages,
  loadCatalogDesignData,
  reviewCatalogDesignPage,
  updateCatalogDesignPageCommentStatus,
  updateCatalogDesignPage,
  uploadCatalogDesignPageImage,
} from "../services/supabaseService";
import { isCompradorJunior } from "../utils/avanceHelpers";
import { classNames, normalizeValue } from "../utils/common";
import { Button, Card, CardContent, Header } from "./ui";
import {
  getCatalogoId,
  isCatalogoTrabajable,
  buildPageTitle,
  buildInitialProject,
  getPromoField,
  formatSkuInfoValue,
  ZOOM_STEP,
  clampZoom,
} from "../features/catalogDesign/catalogDesignProject";
import "../styles/pages/catalog-design-export-compartido.page.css";
import "../styles/pages/catalog-design.page.css";

export default function CatalogDesignPage({ catalogos = [], rows = [], supabaseConnection, supabaseReady, onEnsureCampaigns }) {
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
  const actionInFlight = useRef(false);
  const imageShellRef = useRef(null);
  const viewerStageRef = useRef(null);
  const filmstripTrackRef = useRef(null);
  const zoomAnchorRef = useRef(null);

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
  const [pageVersionsList, setPageVersionsList] = useState([]);
  const [selectedVersionByPage, setSelectedVersionByPage] = useState({});
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsSnapshot, setSettingsSnapshot] = useState(null);
  const [skuQuery, setSkuQuery] = useState("");
  const [skuSearchTerm, setSkuSearchTerm] = useState("");
  const [skuDisplayLimit, setSkuDisplayLimit] = useState(50);
  const [isDraggingOverStage, setIsDraggingOverStage] = useState(false);
  const [commentFilter, setCommentFilter] = useState("all");
  const [copiedSkuText, setCopiedSkuText] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });
  const [pendingUpload, setPendingUpload] = useState(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const dismissStatus = useCallback(() => setStatus({ type: "idle", message: "" }), []);

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
  const pendingCommentCountByPageId = useMemo(() => {
    return comments.reduce((acc, comment) => {
      if (getCommentStatus(comment) === "abierto") acc[comment.pagina_id] = (acc[comment.pagina_id] || 0) + 1;
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
      enDiseno: count(["en_diseno"]),
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

  const currentPageVersions = useMemo(() => {
    if (!selectedPage?.id) return [];
    const list = pageVersionsList.filter((v) => v.pagina_id === selectedPage.id);
    const map = new Map();
    list.forEach((v) => {
      const num = Number(v.numero_version);
      if (num > 0) map.set(num, v);
    });
    if (selectedPage.archivo_path) {
      const currentVerNum = Number(selectedPage.version_actual) || (map.size > 0 ? Math.max(...map.keys()) : 1);
      if (!map.has(currentVerNum)) {
        map.set(currentVerNum, {
          pagina_id: selectedPage.id,
          numero_version: currentVerNum,
          archivo_path: selectedPage.archivo_path,
          fecha_creacion: selectedPage.fecha_ultima_carga || selectedPage.fecha_creacion,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => Number(a.numero_version) - Number(b.numero_version));
  }, [selectedPage, pageVersionsList]);

  const latestVersionNumber = useMemo(() => {
    if (!currentPageVersions.length) return Number(selectedPage?.version_actual) || 1;
    return Math.max(...currentPageVersions.map((v) => Number(v.numero_version) || 1));
  }, [currentPageVersions, selectedPage]);

  const activeVersionNumber = useMemo(() => {
    const userSelected = selectedVersionByPage[selectedPage?.id];
    if (userSelected && currentPageVersions.some((v) => Number(v.numero_version) === Number(userSelected))) {
      return Number(userSelected);
    }
    return latestVersionNumber;
  }, [selectedVersionByPage, selectedPage?.id, currentPageVersions, latestVersionNumber]);

  const activeVersionObj = useMemo(() => {
    return currentPageVersions.find((v) => Number(v.numero_version) === activeVersionNumber) || null;
  }, [currentPageVersions, activeVersionNumber]);

  const activeImagePath = activeVersionObj?.archivo_path || selectedPage?.archivo_path || "";
  const isHistoricalVersion = Boolean(currentPageVersions.length > 0 && activeVersionNumber < latestVersionNumber);

  const pendingCommentsCount = useMemo(() => {
    return selectedComments.filter((c) => getCommentStatus(c) === "abierto").length;
  }, [selectedComments]);

  const resolvedCommentsCount = useMemo(() => {
    return selectedComments.filter((c) => getCommentStatus(c) === "resuelto").length;
  }, [selectedComments]);

  const currentVersionCommentsCount = useMemo(() => {
    return selectedComments.filter((c) => {
      if (c.numero_version) return Number(c.numero_version) === activeVersionNumber;
      return activeVersionNumber === 1;
    }).length;
  }, [selectedComments, activeVersionNumber]);

  const filteredSelectedComments = useMemo(() => {
    if (commentFilter === "pending") {
      return selectedComments.filter((c) => getCommentStatus(c) === "abierto");
    }
    if (commentFilter === "resolved") {
      return selectedComments.filter((c) => getCommentStatus(c) === "resuelto");
    }
    if (commentFilter === "version") {
      return selectedComments.filter((c) => {
        if (c.numero_version) return Number(c.numero_version) === activeVersionNumber;
        return activeVersionNumber === 1;
      });
    }
    return selectedComments;
  }, [selectedComments, commentFilter, activeVersionNumber]);

  const selectedAnnotations = useMemo(() => selectedComments
    .filter((comment) => {
      if (comment.numero_version) {
        return Number(comment.numero_version) === activeVersionNumber;
      }
      return activeVersionNumber === 1 || currentPageVersions.length <= 1;
    })
    .flatMap((comment) => {
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
        versionNumber: comment.numero_version,
      }));
    }), [selectedComments, chronologicalOrder, userById, activeVersionNumber, currentPageVersions.length]);
  const imageUrls = useDesignImageUrls(supabaseConnection, supabaseReady,
    [...visiblePages.map((page) => page.archivo_path), activeImagePath]);
  const signedUrlsByPath = imageUrls.urls;
  const signedUrls = useMemo(() => Object.fromEntries(visiblePages.map((page) => [page.id, signedUrlsByPath[page.archivo_path] || ""])), [visiblePages, signedUrlsByPath]);
  const imageUrlError = imageUrls.errors[activeImagePath] || "";
  const selectedPageIndex = visiblePages.findIndex((page) => page.id === selectedPage?.id);
  const selectedImageUrl = useMemo(() => {
    if (!activeImagePath) return "";
    if (activeImagePath.startsWith("http://") || activeImagePath.startsWith("https://") || activeImagePath.startsWith("blob:") || activeImagePath.startsWith("data:")) {
      return activeImagePath;
    }
    if (signedUrlsByPath[activeImagePath]) return signedUrlsByPath[activeImagePath];
    if (activeImagePath === selectedPage?.archivo_path && signedUrls[selectedPage?.id]) {
      return signedUrls[selectedPage?.id];
    }
    return "";
  }, [activeImagePath, signedUrlsByPath, selectedPage?.archivo_path, selectedPage?.id, signedUrls]);
  const isImageLoading = Boolean(activeImagePath && !selectedImageUrl && !imageUrlError);
  const selectedProjectCatalogId = selectedProject?.catalogo_id || selectedProjectCatalogo?.id || selectedProjectCatalogo?.catalogo_id || "";
  const selectedProjectPromoRows = useMemo(
    () => getDesignCatalogPromotions(rows || [], selectedProjectCatalogId),
    [rows, selectedProjectCatalogId],
  );
  // Carga por campaña: al abrir un proyecto se cargan las promociones de su catalogo.
  useEffect(() => {
    if (selectedProjectCatalogId) void onEnsureCampaigns?.([selectedProjectCatalogId]);
  }, [selectedProjectCatalogId, onEnsureCampaigns]);

  const pagePromosCount = useMemo(() => {
    if (!selectedPage?.numero_pagina) return 0;
    const p = Number(selectedPage.numero_pagina);
    return selectedProjectPromoRows.filter((r) => getDesignPromoPage(r) === p).length;
  }, [selectedProjectPromoRows, selectedPage?.numero_pagina]);

  // Resultados agrupados por oferta: las promos complejas muestran todas sus líneas en una card.
  const { offers: skuSearchResults, total: skuOffersTotal } = useMemo(() =>
    getDesignPageOffers(selectedProjectPromoRows, selectedPage?.numero_pagina, skuSearchTerm, skuDisplayLimit),
    [selectedProjectPromoRows, selectedPage?.numero_pagina, skuSearchTerm, skuDisplayLimit]
  );

  useEffect(() => {
    setSkuDisplayLimit(50);
  }, [selectedPageId]);

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

  // Zoom que conserva bajo el cursor (o en el centro) el punto que se estaba mirando.
  const zoomTo = (getNextZoom, anchorEvent = null) => {
    const stage = viewerStageRef.current;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      const offsetX = anchorEvent ? anchorEvent.clientX - rect.left : stage.clientWidth / 2;
      const offsetY = anchorEvent ? anchorEvent.clientY - rect.top : stage.clientHeight / 2;
      zoomAnchorRef.current = {
        offsetX,
        offsetY,
        ratioX: (stage.scrollLeft + offsetX) / Math.max(stage.scrollWidth, 1),
        ratioY: (stage.scrollTop + offsetY) / Math.max(stage.scrollHeight, 1),
      };
    }
    setViewerZoom((prev) => clampZoom(typeof getNextZoom === "function" ? getNextZoom(prev) : getNextZoom));
  };

  useLayoutEffect(() => {
    const stage = viewerStageRef.current;
    const anchor = zoomAnchorRef.current;
    zoomAnchorRef.current = null;
    if (!stage || !anchor) return;
    stage.scrollLeft = anchor.ratioX * stage.scrollWidth - anchor.offsetX;
    stage.scrollTop = anchor.ratioY * stage.scrollHeight - anchor.offsetY;
  }, [viewerZoom]);

  // Ajusta el zoom para que la página completa quepa en la altura del visor.
  const fitViewerToHeight = () => {
    const stage = viewerStageRef.current;
    const image = imageShellRef.current?.querySelector("img");
    if (!stage || !image?.naturalWidth || !image?.naturalHeight) return;
    const aspect = image.naturalHeight / image.naturalWidth;
    const availableHeight = stage.clientHeight - 16;
    zoomAnchorRef.current = null;
    setViewerZoom(clampZoom((availableHeight / (stage.clientWidth * aspect)) * 100));
    stage.scrollTo({ top: 0, left: 0 });
  };

  const isModalOpen = Boolean(pendingUpload || isSettingsOpen || isCreateProjectModalOpen);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (isModalOpen || ["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target?.isContentEditable) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomTo((prev) => prev + ZOOM_STEP);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomTo((prev) => prev - ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        zoomTo(100);
      } else if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        fitViewerToHeight();
      } else if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen((prev) => !prev);
      } else if (event.code === "Space" && !event.repeat) {
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
        setShortcutsOpen(false);
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
  }, [visiblePages, selectedPageIndex, focusMode, isModalOpen]);

  useEffect(() => {
    const stage = viewerStageRef.current;
    if (!stage) return;
    const handleWheel = (event) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        zoomTo((prev) => prev + delta, event);
      }
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => stage.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    if (!selectedPage || pageViewMode !== "filmstrip") return;
    const card = document.getElementById(`filmstrip-card-${selectedPage.id}`);
    const track = filmstripTrackRef.current;
    if (card && track) {
      // Solo desplaza la tira horizontalmente; scrollIntoView también movía la página hacia abajo.
      track.scrollTo({ left: card.offsetLeft - track.clientWidth / 2 + card.clientWidth / 2, behavior: "smooth" });
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
      setPageVersionsList(data.versions || []);
      setStatus({ type: "idle", message: "" });
      return true;
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudo cargar el módulo de diseño." });
      return false;
    }
  };

  useEffect(() => {
    refreshData();
  }, [supabaseReady, supabaseConnection]);

  const handleManualRefresh = async () => {
    if (await refreshData()) setStatus({ type: "ready", message: "Información actualizada." });
  };

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
    setCommentText("");
    setCommentCategory("ajuste");
    setIsDraftingComment(false);
    setAnnotationMode(false);
    setDraftAnnotations([]);
    setActiveAnnotation(null);
    setActiveCommentId("");
    setHoveredAnnotation(null);
  }, [selectedPage?.id, activeVersionNumber]);

  const designEvent = (page, action, details = {}) => buildDesignNotificationEvent({
    page, project: projects.find((project) => project.id === page?.proyecto_id),
    actorRole: currentRole, action, ...details,
  });

  const runAction = async (loadingMessage, action, successMessage, notificationEvent = null) => {
    if (actionInFlight.current) return false;
    actionInFlight.current = true;
    setStatus({ type: "loading", message: loadingMessage });
    try {
      await action();
      const warnings = await deliverNotifications([notificationEvent], (event) => createLiveNotification(supabaseConnection, event));
      if (!await refreshData()) {
        setStatus({ type: "error", message: `${successMessage} El guardado se confirmó, pero no se pudo actualizar la vista. Pulse Actualizar; no repita la operación.` });
        return true;
      }
      setStatus({ type: "ready", message: warnings.length ? `${successMessage} Advertencias de notificación: ${warnings.join(" ")}` : successMessage });
      return true;
    } catch (error) {
      setStatus({ type: "error", message: error.message || "No se pudo completar la acción." });
      return false;
    } finally {
      actionInFlight.current = false;
    }
  };

  const createProject = () => runAction(
    "Creando proyecto...",
    async () => {
      const catalogoId = String(projectForm.catalogo_id || "").trim();
      if (!catalogoIdsTrabajables.has(catalogoId)) {
        throw new Error("El proyecto debe estar ligado a un catalogo creado en Ajustes y visible en Inicio.");
      }
      const pageCount = Number(projectForm.cantidad_paginas);
      if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > 120) {
        throw new Error("Defina la cantidad de paginas del catalogo.");
      }
      const catalogo = catalogoById[catalogoId];
      const created = await saveCatalogDesignProjectWithPages(supabaseConnection, projectForm,
        Array.from({ length: pageCount }, (_, index) => buildPageTitle(index + 1, catalogo)), Array.from(catalogoIdsTrabajables));
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

  const openSettings = () => {
    if (!selectedProject) return;
    setSettingsSnapshot(selectedProject);
    setTargetPageCount(String(selectedProjectPages.length || ""));
    setIsSettingsOpen(true);
  };

  const cancelSettings = () => {
    // Descarta los cambios no guardados devolviendo el proyecto a como estaba al abrir el modal.
    if (settingsSnapshot) {
      setProjects((current) => current.map((project) => project.id === settingsSnapshot.id ? settingsSnapshot : project));
    }
    setSettingsSnapshot(null);
    setIsSettingsOpen(false);
  };

  const saveSelectedProject = async () => {
    if (!selectedProject) return;
    const saved = await runAction("Guardando proyecto...", async () => {
      const nextPageCount = Number(targetPageCount);
      if (!Number.isInteger(nextPageCount) || nextPageCount < 1 || nextPageCount > 120) {
        throw new Error("Defina entre 1 y 120 páginas enteras.");
      }
      await saveCatalogDesignProjectWithPages(supabaseConnection, selectedProject,
        Array.from({ length: nextPageCount }, (_, index) => buildPageTitle(index + 1, selectedProjectCatalogo)));
    }, "Proyecto actualizado.");
    if (saved) {
      setSettingsSnapshot(null);
      setIsSettingsOpen(false);
    }
  };

  const updateProjectField = (field, value) => {
    setProjects((current) => current.map((project) => project.id === selectedProject?.id ? { ...project, [field]: value } : project));
  };

  const updatePageField = (page, field, value) => {
    if (field === "estado" && page.estado !== value && CONFIRM_PAGE_STATES.has(value)) {
      const pageName = page.titulo_pagina || `Página ${page.numero_pagina}`;
      const confirmed = window.confirm(`¿Cambiar "${pageName}" a "${getPageStateLabel(value)}"?\n\nSe registrará la revisión y se notificará a los responsables.`);
      if (!confirmed) return;
    }
    runAction("Actualizando página...", async () => {
      if (field === "estado" && ["aprobada", "ajustes", "rechazada"].includes(value)) {
        await reviewCatalogDesignPage(supabaseConnection, page, value, "", null, currentUserId, [], Number(page.version_actual) || 1);
      } else {
        await updateCatalogDesignPage(supabaseConnection, page.id, { [field]: value, actualizado_por: currentUserId || null });
      }
    }, "Página actualizada.", field === "estado" && page.estado !== value ? designEvent(page, "state", { state: value }) : null);
  };

  const performPageUpload = (page, file) => {
    if (!file) return Promise.resolve(false);
    return runAction(
      "Subiendo nueva versión de imagen...",
      async () => {
        const result = await uploadCatalogDesignPageImage(supabaseConnection, page, selectedProject, file);
        if (result?.newVersionRecord) {
          setPageVersionsList((prev) => [...prev, result.newVersionRecord]);
        }
        if (result?.versionNumber) {
          setSelectedVersionByPage((prev) => ({ ...prev, [page.id]: result.versionNumber }));
        }
        return result?.updatedPage;
      },
      "Nueva versión de imagen cargada exitosamente.",
      designEvent(page, "image", { state: "en_revision" })
    );
  };

  // Todas las entradas de archivo (botones, arrastrar a visor o miniatura) pasan por la vista previa.
  const uploadPageImage = (page, file) => {
    if (!page || !file) return;
    setPendingUpload({ page, file });
  };

  const confirmPendingUpload = async () => {
    if (!pendingUpload) return;
    const uploaded = await performPageUpload(pendingUpload.page, pendingUpload.file);
    if (uploaded) setPendingUpload(null);
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
    setCommentCategory("ajuste");
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
      await addCatalogDesignPageComment(
        supabaseConnection,
        selectedPage.id,
        commentText,
        commentCategory,
        currentUserId,
        draftAnnotations,
        activeVersionNumber,
        activeVersionObj?.id || null
      );
      resetReviewDraft();
    }, "Comentario guardado.", designEvent(selectedPage, "comment"));
  };

  const reviewPage = (nextStatus, type) => {
    if (!selectedPage) return;
    if (isHistoricalVersion) {
      setStatus({ type: "error", message: "Vuelva a la versión vigente para aprobar o solicitar ajustes." });
      return;
    }
    runAction("Registrando revisión...", async () => {
      await reviewCatalogDesignPage(
        supabaseConnection,
        selectedPage,
        nextStatus,
        commentText,
        type,
        currentUserId,
        draftAnnotations,
        activeVersionNumber,
        activeVersionObj?.id || null
      );
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
  const canReviewSelectedPage = selectedPage && !isHistoricalVersion && (isAdminOrMark || (canReview && (selectedPage.comprador_id === currentBuyerId || !selectedPage.comprador_id)));
  const canUpdateCommentStatus = Boolean(selectedPage && (isAdminOrMark || canReview || canUpload || isDesigner || isBuyer));
  const canUseAnnotations = Boolean(selectedPage && selectedImageUrl && !isHistoricalVersion);

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
    if (file) uploadPageImage(selectedPage, file);
  };

  const pendingAnnotationCount = draftAnnotations.length + (activeAnnotation ? 1 : 0);
  const hoveredAnnotationAnchor = hoveredAnnotation ? getAnnotationAnchor(hoveredAnnotation) : null;

  return <div className={classNames("catalog-design-page", focusMode && "catalog-design-focus-active")}>
    <div className="toolbar page-header-toolbar">
      <Header title="Diseño de Catálogos" subtitle="Proyectos por página, avances de diseño, revisión del comprador y consolidación final." />
      <div className="toolbar-actions catalog-design-header-actions">
        {hiddenProjectCount > 0 && <div className="catalog-design-status ready" title={`Se ocultaron ${hiddenProjectCount} proyectos sin catalogo trabajable en Inicio.`}>Se ocultaron {hiddenProjectCount} proyecto{hiddenProjectCount === 1 ? "" : "s"} sin catalogo trabajable.</div>}
        <Button variant="outline" onClick={handleManualRefresh} disabled={status.type === "loading"}><RefreshCw size={16} className={status.type === "loading" ? "catalog-design-spin" : ""}/> Actualizar</Button>
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
                    {getProjectStateLabel(project.estado)}
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

          {selectedProject && <DesignProgressBar metrics={metrics}/>}
          </>}
        </CardContent>
      </Card>

      <div className="catalog-design-main">
        <Card className="grid-card catalog-design-viewer-card">
          <CardContent>
            <div className="toolbar catalog-design-viewer-toolbar">
              <div className="catalog-design-viewer-header-info">
                <h2>{selectedProject?.nombre_proyecto || "Seleccione un proyecto"}</h2>
                {selectedProject && (
                  <div className="catalog-design-viewer-current-meta">
                    <span>{selectedProjectCatalogo?.nombre || selectedProject.catalogo_id || "Sin catálogo visible"}</span>
                    <span className="dot-sep">·</span>
                    <span>{getProjectStateLabel(selectedProject.estado)}</span>
                    <span className="dot-sep">·</span>
                    <span>Entrega {formatDate(selectedProject.fecha_entrega) || "sin fecha"}</span>
                    {selectedPage && <>
                      <span className="dot-sep">·</span>
                      <span title="Diseñador asignado"><Palette size={13} aria-hidden="true"/> {getUserLabel(userById[selectedPage.disenador_id])}</span>
                      <span title="Comprador asignado"><ShoppingCart size={13} aria-hidden="true"/> {getBuyerLabel(buyerById[selectedPage.comprador_id])}</span>
                    </>}
                  </div>
                )}
              </div>
              <div className="toolbar-actions catalog-design-viewer-header-actions">
                <DesignPageFilters
                  filters={filters}
                  setFilters={setFilters}
                  designerOptions={designerOptions}
                  buyerOptions={seniorBuyerFilterOptions}
                />
                {selectedProject && (
                  <button
                    type="button"
                    className="catalog-design-tool-action-btn"
                    onClick={openSettings}
                    title={canManage ? "Editar nombre, estado, fechas y cantidad de páginas" : "Ver datos del proyecto"}
                  >
                    <Settings2 size={15}/> <span>{canManage ? "Configurar" : "Detalles"}</span>
                  </button>
                )}
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
                zoomTo={zoomTo}
                fitViewerToHeight={fitViewerToHeight}
                viewerZoom={viewerZoom}
                shortcutsOpen={shortcutsOpen}
                setShortcutsOpen={setShortcutsOpen}
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
                openReviewPanel={openReviewPanel}
                canUploadSelectedPage={canUploadSelectedPage}
                uploadPageImage={uploadPageImage}
                canReviewSelectedPage={canReviewSelectedPage}
                reviewPage={reviewPage}
                commentText={commentText}
                setCommentText={setCommentText}
                currentPageVersions={currentPageVersions}
                activeVersionNumber={activeVersionNumber}
                latestVersionNumber={latestVersionNumber}
                onSelectVersion={(v) => setSelectedVersionByPage((prev) => ({ ...prev, [selectedPage?.id]: v }))}
                isHistoricalVersion={isHistoricalVersion}
              />
              <div className={classNames("catalog-design-review-workspace", sideRailCollapsed && "rail-collapsed")}>
                {/* Visor a la izquierda; observaciones y SKU en el panel derecho */}
                {/* Superficie del Visor con soporte Drag & Drop nativo */}
                <DesignImageViewer
                  imageUrlError={imageUrlError}
                  retryImageUrl={imageUrls.retry}
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
                  isHistoricalVersion={isHistoricalVersion}
                  activeVersionNumber={activeVersionNumber}
                  latestVersionNumber={latestVersionNumber}
                  onSelectVersion={(v) => setSelectedVersionByPage((prev) => ({ ...prev, [selectedPage?.id]: v }))}
                  isImageLoading={isImageLoading}
                />
                <aside className={classNames("catalog-design-comment-rail", sideRailCollapsed && "collapsed")}>
                  {sideRailCollapsed ? (
                    <div className="catalog-design-rail-collapsed-stack">
                      <button
                        type="button"
                        className="icon-btn catalog-design-rail-toggle-btn"
                        onClick={() => setSideRailCollapsed(false)}
                        title="Expandir panel"
                        aria-label="Expandir panel"
                      >
                        <PanelRightOpen size={16}/>
                      </button>
                      <button
                        type="button"
                        className="icon-btn catalog-design-rail-icon-btn"
                        onClick={() => { setActiveSideTab("comments"); setSideRailCollapsed(false); }}
                        title="Observaciones"
                        aria-label={`Observaciones (${pendingCommentsCount} pendientes)`}
                      >
                        <MessageSquare size={16}/>
                        {pendingCommentsCount > 0 && <span className="catalog-design-tab-badge">{pendingCommentsCount}</span>}
                      </button>
                      <button
                        type="button"
                        className="icon-btn catalog-design-rail-icon-btn"
                        onClick={() => { setActiveSideTab("sku"); setSideRailCollapsed(false); }}
                        title="Catálogo SKU"
                        aria-label="Catálogo SKU"
                      >
                        <Search size={16}/>
                      </button>
                    </div>
                  ) : (
                  <div className="catalog-design-rail-tabs-bar">
                    <div className="catalog-design-rail-tabs" role="tablist" aria-label="Panel lateral">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeSideTab === "comments"}
                        className={classNames("catalog-design-tab-btn", activeSideTab === "comments" && "active")}
                        onClick={() => setActiveSideTab("comments")}
                      >
                        <MessageSquare size={14}/> Observaciones
                        {pendingCommentsCount > 0 && <span className="catalog-design-tab-badge" title={`${pendingCommentsCount} pendientes`}>{pendingCommentsCount}</span>}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={activeSideTab === "sku"}
                        className={classNames("catalog-design-tab-btn", activeSideTab === "sku" && "active")}
                        onClick={() => setActiveSideTab("sku")}
                      >
                        <Search size={14}/> SKU
                      </button>
                    </div>
                    <button
                      type="button"
                      className="icon-btn catalog-design-rail-toggle-btn"
                      onClick={() => setSideRailCollapsed(true)}
                      title="Contraer panel"
                      aria-label="Contraer panel"
                    >
                      <PanelRightClose size={16}/>
                    </button>
                  </div>
                  )}

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
                      activeVersionNumber={activeVersionNumber}
                      currentPageVersions={currentPageVersions}
                      currentVersionCommentsCount={currentVersionCommentsCount}
                    />
                  )}

                  {!sideRailCollapsed && activeSideTab === "sku" && (
                    <div className="catalog-design-rail-content">
                      <div className="catalog-design-sku-head">
                        <div>
                          <strong>
                            {skuSearchTerm
                              ? "Resultados en el catálogo"
                              : pagePromosCount > 0
                                ? "Promociones de la página"
                                : "Promociones del catálogo"}
                          </strong>
                          <span>
                            {selectedPage
                              ? skuSearchTerm
                                ? `Página ${selectedPage.numero_pagina} · ${skuSearchResults.length} encontrada${skuSearchResults.length === 1 ? "" : "s"} · Primero las de esta página`
                                : pagePromosCount > 0
                                  ? `Página ${selectedPage.numero_pagina} · ${pagePromosCount} asociada${pagePromosCount === 1 ? "" : "s"} a esta página + catálogo`
                                  : `Página ${selectedPage.numero_pagina} · Sin códigos asociados · Mostrando promociones del catálogo en edición`
                              : "Seleccione una página para consultar sus promociones"}
                          </span>
                        </div>
                      </div>
                      <form className="catalog-design-sku-search" onSubmit={submitSkuSearch}>
                        <input
                          value={skuQuery}
                          onChange={(event) => {
                            const val = event.target.value;
                            setSkuQuery(val);
                            setSkuSearchTerm(normalizeValue(val));
                          }}
                          placeholder="Buscar SKU o descripción en este catálogo..."
                          aria-label="Buscar SKU en este catálogo"
                        />
                      </form>
                      {skuSearchTerm && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSkuQuery("");
                            setSkuSearchTerm("");
                            setSkuDisplayLimit(50);
                          }}
                        >
                          Ver promociones de esta página y catálogo
                        </Button>
                      )}

                      {/* Lista de resultados de búsqueda o SKUs asociados al proyecto */}
                      <div className="catalog-design-sku-results">
                        {skuSearchTerm && !skuSearchResults.length && (
                          <div className="catalog-design-sku-empty">
                            No se encontró información para "{skuSearchTerm}" en este catálogo.
                          </div>
                        )}
                        {skuSearchResults.map((offer) => (
                          <DesignSkuOfferCard
                            key={offer.key}
                            offer={offer}
                            currentPage={Number(selectedPage?.numero_pagina) || null}
                            copiedSkuText={copiedSkuText}
                            onCopy={copyToClipboard}
                          />
                        ))}
                        {skuOffersTotal > skuSearchResults.length && !skuSearchTerm && (
                          <div className="catalog-design-sku-more">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSkuDisplayLimit((prev) => prev + 50)}
                            >
                              Mostrar más promociones (+50)
                            </Button>
                          </div>
                        )}
                        {!skuSearchTerm && !skuSearchResults.length && (
                          <div className="catalog-design-sku-empty">
                            {!selectedProjectPromoRows.length ? "No hay promociones disponibles para este catálogo." : !selectedPage ? "Seleccione una página para ver sus promociones." : "No hay promociones disponibles en este catálogo."}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </aside>
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
              pendingCommentCountByPageId={pendingCommentCountByPageId}
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

    {pendingUpload && (
      <UploadConfirmModal
        pending={pendingUpload}
        onConfirm={confirmPendingUpload}
        onCancel={() => setPendingUpload(null)}
        isUploading={status.type === "loading"}
      />
    )}

    <DesignToast status={status} onDismiss={dismissStatus}/>

    {isSettingsOpen && selectedProject && (
      <DesignProjectSettings
        onClose={() => { setSettingsSnapshot(null); setIsSettingsOpen(false); }}
        onCancel={cancelSettings}
        selectedProject={selectedProject}
        catalogName={selectedProjectCatalogo?.nombre || selectedProject.catalogo_id}
        selectedProjectPageCount={selectedProjectPageCount}
        canManage={canManage}
        saveSelectedProject={saveSelectedProject}
        updateProjectField={updateProjectField}
        targetPageCount={targetPageCount}
        setTargetPageCount={setTargetPageCount}
        isSaving={status.type === "loading"}
      />
    )}

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
