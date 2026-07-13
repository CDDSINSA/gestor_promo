import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Eye,
  ImageUp,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
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
  logCatalogDesignPageStateChange,
  loadCatalogDesignData,
  reviewCatalogDesignPage,
  updateCatalogDesignPage,
  updateCatalogDesignProject,
  uploadCatalogDesignPageImage,
} from "../services/supabaseService";
import { isCompradorJunior } from "../utils/avanceHelpers";
import { classNames, normalizeValue } from "../utils/common";

const PROJECT_STATES = ["planificacion", "en_diseno", "en_revision", "aprobado", "consolidado", "cancelado"];
const PAGE_STATES = ["pendiente", "en_diseno", "en_revision", "ajustes", "aprobada", "rechazada", "lista_consolidar"];

function Header({ title, subtitle }) {
  return <div className="header"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function Button({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}

function Card({ children, className = "" }) {
  return <div className={classNames("card", className)}>{children}</div>;
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

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
  const [targetPageCount, setTargetPageCount] = useState("");
  const [projectPanelCollapsed, setProjectPanelCollapsed] = useState(false);
  const [skuFinderOpen, setSkuFinderOpen] = useState(false);
  const [skuQuery, setSkuQuery] = useState("");
  const [skuSearchTerm, setSkuSearchTerm] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });

  const visibleProjects = useMemo(() => projects.filter((project) => catalogoIdsTrabajables.has(String(project.catalogo_id || "").trim())), [projects, catalogoIdsTrabajables]);
  const hiddenProjectCount = projects.length - visibleProjects.length;
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

  const selectedComments = useMemo(() => comments.filter((comment) => comment.pagina_id === selectedPage?.id), [comments, selectedPage]);
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
      if (field === "estado") {
        await logCatalogDesignPageStateChange(supabaseConnection, page, value, {
          currentUserId,
          action: "Cambio manual de estado de pagina",
        });
      }
    }, "Página actualizada.");
  };

  const uploadPageImage = (page, file) => {
    if (!file) return;
    runAction("Subiendo imagen de página...", () => uploadCatalogDesignPageImage(supabaseConnection, page, selectedProject, file, currentUserId), "Imagen actualizada sin crear versiones.");
  };

  const addComment = () => {
    if (!selectedPage) return;
    runAction("Guardando comentario...", async () => {
      await addCatalogDesignPageComment(supabaseConnection, selectedPage.id, commentText, "comentario", currentUserId);
      setCommentText("");
    }, "Comentario guardado.");
  };

  const reviewPage = (nextStatus, type) => {
    if (!selectedPage) return;
    runAction("Registrando revisión...", async () => {
      await reviewCatalogDesignPage(supabaseConnection, selectedPage, nextStatus, commentText, type, currentUserId);
      setCommentText("");
    }, nextStatus === "aprobada" ? "Página aprobada." : "Página enviada a ajustes.");
  };

  const viewPageImage = (page) => {
    selectViewerPage(page);
  };

  const canUploadSelectedPage = selectedPage && (isAdminOrMark || (canUpload && selectedPage.disenador_id === currentUserId));

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
            {!visibleProjects.length && projects.length > 0 && <div className="empty-state">No hay proyectos de diseno para catalogos trabajables.</div>}
            {!projects.length && <div className="empty-state">No hay proyectos de diseño creados.</div>}
          </div>
          <div className="catalog-design-summary-card">
            <span>Proyecto seleccionado</span>
            <strong>{selectedProject?.nombre_proyecto || "Sin proyecto seleccionado"}</strong>
            <p>{selectedProjectCatalogo ? selectedProjectCatalogo.nombre || selectedProject.catalogo_id : "Seleccione un proyecto para revisar su avance."}</p>
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
                  <Button className="catalog-design-sku-btn" variant="outline" onClick={() => setSkuFinderOpen(true)} title="Buscar informacion de SKU"><Search size={16}/> Buscar SKU</Button>
                  {canUploadSelectedPage && <label className="btn btn-primary catalog-design-file-btn catalog-design-viewer-upload">
                    <ImageUp size={16}/> Actualizar imagen
                    <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(event) => { uploadPageImage(selectedPage, event.target.files?.[0]); event.target.value = ""; }} />
                  </label>}
                </div>
              </div>
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
              <div className="catalog-design-viewer-stage">
                {selectedImageUrl ? <img src={selectedImageUrl} alt={selectedPage?.titulo_pagina || "Pagina de catalogo"} style={{ width: `${viewerZoom}%` }} /> : <div className="catalog-design-viewer-empty">
                  <ImageUp size={30}/>
                  <strong>{selectedPage ? "Sin imagen cargada" : "Seleccione una pagina"}</strong>
                  <span>{selectedPage ? "El diseñador debe cargar una imagen JPG o PNG de calidad media para revision." : "Use la tabla inferior para elegir una pagina del proyecto."}</span>
                </div>}
              </div>
              {selectedPage && <p className="catalog-design-viewer-note">Ruta Storage: {selectedPage.archivo_path || `catalogos/${selectedProject?.catalogo_id}/paginas/pagina_${selectedPage.numero_pagina}.jpg`}</p>}
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

        <Card>
          <CardContent>
            <div className="toolbar compact">
              <div><h2>Comentarios y revisión</h2><p>{selectedPage ? `Página ${selectedPage.numero_pagina}` : "Seleccione una página para revisar."}</p></div>
            </div>
            {selectedPage ? <div className="catalog-design-review">
              <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Agregar comentario, aprobación, rechazo o ajuste." />
              <div className="toolbar-actions">
                <Button variant="outline" onClick={addComment} disabled={!commentText.trim()}><MessageSquare size={16}/> Comentar</Button>
                {(isAdminOrMark || (canReview && selectedPage.comprador_id === currentBuyerId)) && <>
                  <Button onClick={() => reviewPage("aprobada", "aprobacion")}><CheckCircle2 size={16}/> Aprobar</Button>
                  <Button variant="outline" onClick={() => reviewPage("ajustes", "rechazo")}><XCircle size={16}/> Rechazar</Button>
                </>}
              </div>
              <div className="catalog-design-comments">
                {selectedComments.map((comment) => <div key={comment.id}>
                  <strong>{comment.tipo || "comentario"} · {getUserLabel(userById[comment.usuario_id])}</strong>
                  <p>{comment.comentario}</p>
                  <span>{formatDate(comment.fecha_creacion)}</span>
                </div>)}
                {!selectedComments.length && <div className="empty-state">Aún no hay comentarios para esta página.</div>}
              </div>
            </div> : <div className="empty-state">Seleccione una página desde la tabla.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  </div>;
}
