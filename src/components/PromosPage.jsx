import React, { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPaste,
  CircleDashed,
  FileSpreadsheet,
  MessageSquare,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  allPromoTypes as todosTipos,
  isComplexPromoType,
  promoLabels as labels,
} from "../promoTypes/promoTypeEngine";
import {
  BULK_COLUMN_BUY_X_GET_X_TABLE,
  BULK_COLUMN_COMBO_TABLE,
  BULK_COLUMN_MEGAPACK_TABLE,
  BULK_COLUMN_UMBRAL_TABLE,
  BUY_X_GET_X_PROMO_TYPE,
  BUY_X_GET_X_PROMO_TYPES,
  BUY_X_GET_X_V2_PROMO_TYPE,
  MEGAPACK_PROMO_TYPE,
} from "../constants";
import {
  buildBuyXGetXBulkPreview,
  buildComboBulkPreview,
  buildMegapackBulkPreview,
  buildUmbralBulkPreview,
  getDefaultBulkColumnForPromoType,
  getBulkPasteContent,
  isBulkTableColumn,
  isNumericSku,
  normalizeDiscountValue,
  normalizePastedNumber,
  parseClipboardRows,
  parseClipboardValues,
  readPromoTemplateFile,
} from "../features/promotions/application/bulkImport";
import {
  canUseComboBenefit,
  comboBenefitNeedsValue,
  getComboBenefitValues,
} from "../features/promotions/application/comboBenefits";
import {
  getGridColumnsForPromoType,
  getPromoRowClass,
  hasDiscountWarning,
  toAppRow,
} from "../features/promotions/application/promoGridRows";
import {
  countSelectedVisibleIds,
  pruneSelectionToVisible,
  toggleSelectedId,
  toggleVisibleSelection,
} from "../features/promotions/application/promoSelection";
import { buildPromotionCellIssues } from "../features/promotions/application/promotionGridValidation";
import { focusAdjacentPromoGridInput } from "../features/promotions/ui/promoGridKeyboard";
import { getPromoRowActivityId, getPromoRowBuyer, usePromoFilters } from "../hooks/usePromoFilters";
import { usePromoForm } from "../hooks/usePromoForm";
import { usePromos } from "../hooks/usePromos";
import { PERMISSIONS, ROLES, normalizeRole } from "../constants/permissions";
import { useAuth } from "../hooks/useAuth";
import { usePermissions } from "../hooks/usePermissions";
import { formatPromotionValidationIssue, validatePromotions } from "../services/promotionValidationService";
import { classNames, makeId, normalizeValue } from "../utils/common";
import {
  getSegmentosByCanal,
  hasPromoFieldValue,
  isComboRewardRole,
  isSegmentedRow,
  normalizeCanal,
} from "../utils/promoHelpers";
import {
  getCatalogoAvanceId,
  getAuthorizedCompradorNamesForAppUser,
  getCompradorDivisiones,
  getCompradorNombre,
  isAvanceTerminado,
  toggleAvanceTerminado,
} from "../utils/avanceHelpers";
import { Button, Card, CardContent, Header } from "./ui";

function formatSkuMasterTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-NI", { hour: "2-digit", minute: "2-digit" });
}

function SkuMasterStatus({ status, total, source, onRefresh, onCancel }) {
  const statusType = status?.type || (total ? "ready" : "idle");
  const Icon = statusType === "ready" ? CheckCircle2 : statusType === "error" ? AlertTriangle : CircleDashed;
  const updatedAt = formatSkuMasterTime(source?.fecha);
  const isLoading = statusType === "loading";
  const progress = Math.max(0, Math.min(100, Number(status?.progress ?? (isLoading ? 12 : total ? 100 : 0))));
  const title = statusType === "loading" ? "Actualizando ERP" : statusType === "error" ? "ERP no disponible" : total ? "ERP actualizado" : "ERP pendiente";
  const detail = statusType === "loading"
    ? `Descargando archivo publicado (${progress}%)`
    : statusType === "error"
      ? status?.message || "No se pudo cargar el archivo"
      : total
        ? `${total} SKU cargados${updatedAt ? ` Â· ${updatedAt}` : ""}`
        : status?.message || "Esperando carga automatica";
  const safeDetail = statusType === "ready" && total && status?.message ? status.message : detail;
  return <div className={classNames("sku-master-status", statusType)}><Icon size={18}/><div className="sku-master-status-main"><div className="sku-master-status-top"><strong>{title}</strong>{isLoading && onCancel ? <button type="button" className="sku-master-refresh" onClick={onCancel} title="Cancelar carga ERP"><X size={13}/> Cancelar</button> : onRefresh && <button type="button" className="sku-master-refresh" onClick={onRefresh} disabled={isLoading} title="Actualizar archivo ERP"><RefreshCw size={13}/> Actualizar</button>}</div><span>{safeDetail}</span><div className="sku-master-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div></div></div>;
}

const PROMO_GRID_PAGE_SIZE = 100;

function getAuditUserLabel(appUser = {}) {
  return normalizeValue(appUser?.nombre || appUser?.email || "");
}

function EditableGridInput({ value, onCommit, onKeyDown, ...inputProps }) {
  const sourceValue = String(value ?? "");
  const [draft, setDraft] = React.useState(sourceValue);
  const sourceValueRef = React.useRef(sourceValue);
  const draftRef = React.useRef(sourceValue);

  React.useEffect(() => {
    sourceValueRef.current = sourceValue;
    draftRef.current = sourceValue;
    setDraft(sourceValue);
  }, [sourceValue]);

  const commitDraft = React.useCallback(() => {
    const nextValue = draftRef.current;
    if (nextValue === sourceValueRef.current) return;
    sourceValueRef.current = nextValue;
    onCommit(nextValue);
  }, [onCommit]);

  const handleChange = (event) => {
    const nextValue = event.target.value;
    draftRef.current = nextValue;
    setDraft(nextValue);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      commitDraft();
    } else if (event.key === "Escape") {
      draftRef.current = sourceValueRef.current;
      setDraft(sourceValueRef.current);
      event.preventDefault();
      return;
    }
    onKeyDown?.(event);
  };

  return <input {...inputProps} value={draft} onChange={handleChange} onBlur={commitDraft} onKeyDown={handleKeyDown} />;
}

function renderCell(row, col, updateRow, warning, segmentOptions = [], cellError = null, onKeyDown = null, rowIndex = 0, colIndex = 0) {
  const hasErr = cellError?.type === "error";
  const hasWarn = cellError?.type === "warning" || (col === "descuento" && warning);
  const inputClass = classNames(
    hasErr && "input-error",
    hasWarn && !hasErr && "input-warning"
  );
  const titleText = cellError ? cellError.message : undefined;

  if (col === "tipoCantidad") {
    return <select className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row[col]} onChange={(e) => updateRow(row.id, col, e.target.value)}>
      <option>Exacta</option>
      <option>MÃ­nimo</option>
    </select>;
  }
  if (col === "tipoSku") {
    const role = normalizeCanal(row[col]);
    const highlightRole = ["Combo", ...BUY_X_GET_X_PROMO_TYPES].includes(row.tipoPromo || row.tipo_promo);
    const roleClass = !highlightRole ? "neutral" : isComboRewardRole(role) ? "reward" : role === "principal" ? "principal" : "neutral";
    return <div className={classNames("role-cell", roleClass)} title={titleText}>
      <span className="role-dot" aria-hidden="true"></span>
      <select className={classNames("role-select", inputClass)} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row[col]} onChange={(e) => updateRow(row.id, col, e.target.value)}>
        <option>principal</option>
        <option>regalia</option>
        <option>recompensa</option>
      </select>
    </div>;
  }
  if (col === "aplicaSegmento") {
    return <select className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={isSegmentedRow(row) ? "SI" : "NO"} onChange={(e) => updateRow(row.id, col, e.target.value)}>
      <option value="NO">NO</option>
      <option value="SI">SI</option>
    </select>;
  }
  if (col === "segmento") {
    return isSegmentedRow(row) ? (
      <>
        <EditableGridInput className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} list={`segmentos-${row.id}`} value={row.segmento || ""} onCommit={(value) => updateRow(row.id, col, value)} />
        <datalist id={`segmentos-${row.id}`}>
          {segmentOptions.map((item) => <option key={item.segmento_id} value={item.segmento_id}>{item.segmento}</option>)}
        </datalist>
      </>
    ) : (
      <div className="readonly-cell">Todos</div>
    );
  }
  if (["descripcion", "numParte", "grupoOferta", "tipoPromo"].includes(col)) {
    return <div className="readonly-cell">{row[col]}</div>;
  }
  if (col === "descuento") {
    return <div className="inline-cell">
      <EditableGridInput className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row[col] || ""} onCommit={(value) => updateRow(row.id, col, value)} />
      {hasErr ? <AlertTriangle size={15} style={{color: "#ef4444"}}/> : hasWarn ? <AlertTriangle size={15}/> : null}
    </div>;
  }
  return <div className="inline-cell">
    <EditableGridInput className={inputClass} title={titleText} data-row-index={rowIndex} data-col-index={colIndex} onKeyDown={onKeyDown} value={row[col] || ""} onCommit={(value) => updateRow(row.id, col, value)} />
    {hasErr && <AlertTriangle size={15} style={{color: "#ef4444"}}/>}
  </div>;
}


export default function PromosPage({ catalogoActivo, rows, setRows, comentarios, setComentarios, compradores, jerarquiaCategorias = [], segmentosClientes, skuMaster, skuMasterCount = 0, setLogs, archivoComprador, skuMasterStatus, onRefreshSkuMaster, onCancelSkuMaster, onSaveSupabase, onSaveSupabaseDirect, onRefreshPromotionScope, promotionScopeRefreshStatus = { type: "idle", message: "" }, supabaseReady, saveSupabaseStatus, isSyncing, avanceCatalogos = {}, setAvanceCatalogos, activityContext = null, initialComprador = "", lockComprador = false, initialTipoPromo = "Descuento", title = "Carga de promociones", subtitle = "Grilla controlada para registrar promociones simples y complejas por comprador." }) {
  const { appUser } = useAuth();
  const { can, role } = usePermissions();
  const canEditPromos = can(PERMISSIONS.EDIT_PROMOS);
  const canEditAvances = can(PERMISSIONS.EDIT_AVANCES);
  const canSyncSupabase = can(PERMISSIONS.SYNC_SUPABASE);
  const [saveWarning, setSaveWarning] = React.useState(null);
  const [selectedPromoIds, setSelectedPromoIds] = React.useState(() => new Set());
  const [promoGridPage, setPromoGridPage] = React.useState(1);
  const selectVisibleCheckboxRef = React.useRef(null);
  const {
    comprador,
    setComprador,
    tipoActivo,
    setTipoActivo,
    search,
    setSearch,
    bulkColumn,
    setBulkColumn,
    bulkText,
    setBulkText,
    bulkPreview,
    setBulkPreview,
    segmentMode,
    setSegmentMode,
    selectedSegments,
    setSelectedSegments,
    comboDraft,
    setComboDraft,
    showActivityComment,
    setShowActivityComment,
    activityCommentDraft,
    setActivityCommentDraft,
    segmentText,
  } = usePromoForm({ initialComprador, initialTipoPromo });
  const [showBulkTools, setShowBulkTools] = React.useState(false);
  const promoTemplateFileInputRef = React.useRef(null);
  const restrictBuyerScope = normalizeRole(role) === ROLES.BUYER;
  const buyerList = useMemo(
    () => getAuthorizedCompradorNamesForAppUser(appUser, compradores, restrictBuyerScope),
    [appUser, compradores, restrictBuyerScope],
  );
  const compradorSeleccionado = Boolean(comprador);
  const skuMasterTotal = skuMasterCount || archivoComprador?.total || 0;
  const esCompleja = isComplexPromoType(tipoActivo);
  const columnas = getGridColumnsForPromoType(tipoActivo);
  const segmentOptions = getSegmentosByCanal(segmentosClientes, catalogoActivo?.canal);
  const currentActivityId = activityContext?.actividad_id || catalogoActivo?.actividad_id || catalogoActivo?.actividadId || catalogoActivo?.id || catalogoActivo?.catalogo_id || "";
  const currentActivityName = activityContext?.nombre_actividad || catalogoActivo?.nombre || "Sin catalogo";
  const currentCatalogoAvanceId = getCatalogoAvanceId(activityContext || catalogoActivo) || currentActivityId;
  const canCreatePromotion = compradorSeleccionado && Boolean(currentActivityId);
  const currentBuyerRows = useMemo(() => rows.filter((row) => {
    if (!compradorSeleccionado || !currentActivityId) return false;
    return getPromoRowActivityId(row) === currentActivityId && getPromoRowBuyer(row) === comprador;
  }), [rows, compradorSeleccionado, currentActivityId, comprador]);

  const validationIssues = useMemo(() => {
    if (!compradorSeleccionado) return { errors: [], warnings: [] };
    return validatePromotions(currentBuyerRows, {
      actividades: [activityContext || catalogoActivo].filter(Boolean),
      compradores,
    });
  }, [currentBuyerRows, catalogoActivo, activityContext, compradores, compradorSeleccionado]);

  const cellErrors = useMemo(() => buildPromotionCellIssues(validationIssues), [validationIssues]);

  const handleGridKeyDown = focusAdjacentPromoGridInput;

  const selectedBuyerConfig = compradores.find((buyer) => getCompradorNombre(buyer) === comprador);
  const auditUser = getAuditUserLabel(appUser);
  const stampCreatedPromo = (row) => {
    if (!auditUser) return row;
    return {
      ...row,
      usuarioCrea: row.usuarioCrea || row.usuario_crea || auditUser,
      usuario_crea: row.usuario_crea || row.usuarioCrea || auditUser,
      usuarioEdita: auditUser,
      usuario_edita: auditUser,
      ultima_modificacion_por: auditUser,
      fecha_creacion: row.fecha_creacion || new Date().toISOString(),
      fecha_modificacion: new Date().toISOString(),
    };
  };
  const stampEditedPromo = (row) => {
    if (!auditUser) return row;
    return {
      ...row,
      usuarioEdita: auditUser,
      usuario_edita: auditUser,
      ultima_modificacion_por: auditUser,
      fecha_modificacion: new Date().toISOString(),
    };
  };
  const hierarchyByDepId = useMemo(() => new Map((jerarquiaCategorias || []).filter((item) => item.activo !== false && item.dep_id).map((item) => [normalizeCanal(item.dep_id), item])), [jerarquiaCategorias]);
  const getMasterDivision = (master, fallback = "") => hierarchyByDepId.get(normalizeCanal(master?.dep_id || master?.dept))?.division || fallback;
  const buyerDivisionesAvance = selectedBuyerConfig ? getCompradorDivisiones(selectedBuyerConfig) : [];
  const toggleBuyerAvance = (division) => {
    if (!setAvanceCatalogos || !currentCatalogoAvanceId || !comprador || !division) return;
    setAvanceCatalogos((current) => toggleAvanceTerminado(current, currentCatalogoAvanceId, division, comprador));
  };
  const simpleRequiredBulkColumn = tipoActivo === "Precio fijo" ? "precioAhora" : tipoActivo === "Descuento" ? "descuento" : "";
  const isSimpleRequiredValuePaste = bulkColumn === simpleRequiredBulkColumn;
  const {
    activityComments,
    openActivityComments,
    latestActivityComment,
    rowMatchesSkuSegment,
    createGroupForCurrentActivity,
    rowMatchesActiveScope,
    activeRows,
    filteredRows,
    missingBenefitCount,
    benefitStatusText,
    comboGroups,
  } = usePromoFilters({
    rows,
    comentarios,
    currentActivityId,
    compradorSeleccionado,
    comprador,
    tipoActivo,
    search,
    segmentMode,
    segmentText,
  });
  const createComboLine = (role = "principal", overrides = {}) => ({
    id: makeId(role === "reward" ? "combo-reward" : "combo-principal"),
    sku: "",
    cantidad: 1,
    beneficio: role === "reward" ? "gratis" : "descuento",
    valor: "",
    ...overrides,
  });
  const createEmptyComboDraft = (overrides = {}) => ({
    group: "",
    principals: [createComboLine("principal")],
    rewards: [createComboLine("reward")],
    ...overrides,
  });
  const comboPrincipals = Array.isArray(comboDraft.principals) && comboDraft.principals.length
    ? comboDraft.principals
    : [createComboLine("principal", {
      sku: comboDraft.principalSku || "",
      cantidad: comboDraft.principalCantidad || 1,
      beneficio: comboDraft.principalBeneficio || "descuento",
      valor: comboDraft.principalValor || "",
    })];
  const comboRewards = Array.isArray(comboDraft.rewards) && comboDraft.rewards.length
    ? comboDraft.rewards
    : [createComboLine("reward", {
      sku: comboDraft.rewardSku || "",
      cantidad: comboDraft.rewardCantidad || 1,
      beneficio: comboDraft.rewardBeneficio || "gratis",
      valor: comboDraft.rewardValor || "",
    })];
  const comboGroup = comboDraft.group || createGroupForCurrentActivity("Combo");
  const pushLog = (accion) => setLogs((prev) => [{ fecha: new Date().toLocaleString(), usuario: comprador, catalogo: currentActivityName, accion }, ...prev]);
  const toggleSegment = (segmentoId) => setSelectedSegments((prev) => prev.includes(segmentoId) ? prev.filter((item) => item !== segmentoId) : [...prev, segmentoId]);
  const toggleSegmentMode = () => { setSegmentMode((prev) => { if (prev) setSelectedSegments([]); return !prev; }); };
  const applySegmentsToGrid = () => {
    const rowIds = new Set(filteredRows.map((row) => row.id));
    setRows((prev) => prev.map((row) => rowIds.has(row.id) ? toAppRow(stampEditedPromo({ ...row, aplica_segmento: segmentMode && segmentText ? "SI" : "NO", aplicaSegmento: segmentMode && segmentText ? "SI" : "NO", segmento: segmentMode && segmentText ? segmentText : "Todos" })) : row));
    pushLog(segmentMode && segmentText ? `AplicÃ³ segmentos ${segmentText}` : "MarcÃ³ promociones para pÃºblico general");
  };
  const addActivityComment = () => {
    const texto = normalizeValue(activityCommentDraft);
    if (!texto || !currentActivityId) return;
    const id = makeId("CMT");
    setComentarios((prev) => [{
      id,
      comentario_id: id,
      actividadId: currentActivityId,
      actividad_id: currentActivityId,
      rowId: "",
      row_id: "",
      alcanceComentario: "ACTIVITY",
      alcance_comentario: "ACTIVITY",
      usuario: comprador || "Comprador",
      tipo_usuario: "Comprador",
      texto,
      comentario: texto,
      estado: "Abierto",
      fecha: new Date().toLocaleString(),
      prioridad: "MEDIA",
    }, ...prev]);
    setActivityCommentDraft("");
    setShowActivityComment(false);
    pushLog(`AgregÃ³ comentario general en ${currentActivityName}`);
  };
  const buildPromoRow = ({ sku = "", promoType = tipoActivo, group = "", tipoSku = "", tipoCantidad = "Exacta", cantidadMinima = 1, precioAhora = "", descuento = "", comentario = "", variante = "" } = {}) => {
    const cleanSku = normalizeValue(sku);
    const master = (skuMaster || {})[cleanSku] || {};
    const rowId = makeId("ROW");
    const promoIsComplex = isComplexPromoType(promoType);
    const nextGroup = group || (promoIsComplex ? createGroupForCurrentActivity(promoType) : promoType);
    const buyer = compradores.find((c) => (c.comprador || c.nombre) === comprador);
    const aplicaSegmento = activityContext?.aplica_segmento || (segmentMode && segmentText ? "SI" : "NO");
    const segmentoCliente = activityContext?.segmento_cliente || (segmentMode && segmentText ? segmentText : "");
    const actividadId = currentActivityId;
    const division = getMasterDivision(master, buyer?.division || "");
    const compradorId = buyer?.comprador_id || buyer?.compradorId || buyer?.id || "";
    return toAppRow(stampCreatedPromo({ row_id: rowId, actividad_id: actividadId, tipo_promo: promoType, grupo_oferta: nextGroup, tipo_sku: tipoSku || (promoIsComplex ? "principal" : "simple"), variante, sku: cleanSku, dep_id: master.dep_id || "", num_parte: master.vpn || "", descripcion: master.descripcion || "", tipo_cantidad: tipoCantidad, cantidad_minima: cantidadMinima, precio_antes: master.precio || "", precio_ahora: precioAhora, descuento, comentario_comprador: comentario, aplica_segmento: aplicaSegmento, segmento: aplicaSegmento === "SI" ? segmentoCliente : "Todos", segmento_cliente: aplicaSegmento === "SI" ? segmentoCliente : "", alcance_tipo: activityContext?.alcance_tipo || "CANAL", alcance_valor: activityContext?.alcance_valor || catalogoActivo?.canal || "", comprador_id: compradorId, comprador, division, estado_registro: "BORRADOR" }));
  };
  const updateComboDraft = (field, value) => setComboDraft((prev) => ({ ...prev, [field]: value }));
  const updateComboLine = (role, id, field, value) => {
    const collection = role === "reward" ? "rewards" : "principals";
    const fallback = role === "reward" ? comboRewards : comboPrincipals;
    setComboDraft((prev) => ({
      ...prev,
      [collection]: (Array.isArray(prev[collection]) && prev[collection].length ? prev[collection] : fallback)
        .map((line) => line.id === id ? { ...line, [field]: value } : line),
    }));
  };
  const addComboDraftLine = (role) => {
    const collection = role === "reward" ? "rewards" : "principals";
    const fallback = role === "reward" ? comboRewards : comboPrincipals;
    setComboDraft((prev) => ({
      ...prev,
      [collection]: [...(Array.isArray(prev[collection]) && prev[collection].length ? prev[collection] : fallback), createComboLine(role)],
    }));
  };
  const removeComboDraftLine = (role, id) => {
    const collection = role === "reward" ? "rewards" : "principals";
    const fallback = role === "reward" ? comboRewards : comboPrincipals;
    setComboDraft((prev) => {
      const current = Array.isArray(prev[collection]) && prev[collection].length ? prev[collection] : fallback;
      const next = current.filter((line) => line.id !== id);
      return { ...prev, [collection]: next.length ? next : current };
    });
  };
  const startNewCombo = () => setComboDraft(createEmptyComboDraft());
  const addComboPair = () => {
    if (!compradorSeleccionado) return;
    const validPrincipals = comboPrincipals
      .map((line) => ({ ...line, sku: normalizeValue(line.sku), cantidad: Math.max(1, Number(line.cantidad) || 1) }))
      .filter((line) => line.sku && canUseComboBenefit(line.beneficio, line.valor));
    const validRewards = comboRewards
      .map((line) => ({ ...line, sku: normalizeValue(line.sku), cantidad: Math.max(1, Number(line.cantidad) || 1) }))
      .filter((line) => line.sku && canUseComboBenefit(line.beneficio, line.valor));
    if (!validPrincipals.length || !validRewards.length) return;
    const group = comboGroup;
    const principalRows = validPrincipals.map((line) => {
      const benefit = getComboBenefitValues(line.beneficio, line.valor);
      return buildPromoRow({
        sku: line.sku,
        promoType: "Combo",
        group,
        tipoSku: "principal",
        tipoCantidad: "Exacta",
        cantidadMinima: line.cantidad,
        precioAhora: benefit.precioAhora,
        descuento: benefit.descuento,
        comentario: `Combo ${group}: principal compra ${line.cantidad}`,
      });
    });
    const rewardRows = validRewards.map((line) => {
      const benefit = getComboBenefitValues(line.beneficio, line.valor, true);
      return buildPromoRow({
        sku: line.sku,
        promoType: "Combo",
        group,
        tipoSku: "regalia",
        tipoCantidad: "Exacta",
        cantidadMinima: line.cantidad,
        precioAhora: benefit.precioAhora,
        descuento: benefit.descuento,
        comentario: `Combo ${group}: regalia entrega ${line.cantidad}`,
      });
    });
    setRows((prev) => [...prev, ...principalRows, ...rewardRows]);
    setComboDraft(createEmptyComboDraft());
    pushLog(`AgregÃ³ combo completo ${group}: ${validPrincipals.length} principal(es) y ${validRewards.length} regalÃ­a(s)`);
  };
  const addRow = (sku = "") => {
    if (!canCreatePromotion) return;
    sku = normalizeValue(sku);
    if (sku && !isNumericSku(sku)) return;
    if (tipoActivo === "Combo") return;
    const newRow = buildPromoRow({ sku });
    setRows((prev) => [...prev, newRow]);
    pushLog(`AgregÃ³ SKU ${sku || "sin cÃ³digo"} en ${tipoActivo}`);
  };
  const pasteSkus = async () => {
    if (!canCreatePromotion) return;
    setShowBulkTools(true);
    try {
      const text = await navigator.clipboard.readText();
      if (tipoActivo === "Umbral") { setBulkColumn(BULK_COLUMN_UMBRAL_TABLE); setBulkText(text); setBulkPreview(buildUmbralBulkPreview(text, skuMaster)); return; }
      if (tipoActivo === "Combo") { setBulkColumn(BULK_COLUMN_COMBO_TABLE); setBulkText(text); setBulkPreview(buildComboBulkPreview(text, skuMaster)); return; }
      if (BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo)) { setBulkColumn(BULK_COLUMN_BUY_X_GET_X_TABLE); setBulkText(text); setBulkPreview(buildBuyXGetXBulkPreview(text, skuMaster, tipoActivo)); return; }
      if (tipoActivo === MEGAPACK_PROMO_TYPE) { setBulkColumn(BULK_COLUMN_MEGAPACK_TABLE); setBulkText(text); setBulkPreview(buildMegapackBulkPreview(text, skuMaster)); return; }
      parseClipboardValues(text).forEach(addRow);
    } catch {
      setBulkColumn(getDefaultBulkColumnForPromoType(tipoActivo) || "sku");
    }
  };
  const changeBulkColumn = (value) => { setBulkColumn(value); setBulkPreview([]); };
  const changeTipoActivo = (value) => {
    setTipoActivo(value);
    setBulkPreview([]);
    setShowBulkTools(false);
    const nextBulkColumn = getDefaultBulkColumnForPromoType(value);
    if (nextBulkColumn) setBulkColumn(nextBulkColumn);
    else if (isBulkTableColumn(bulkColumn)) setBulkColumn("sku");
  };
  const buildBulkPreviewItems = (text = bulkText, column = bulkColumn) => {
    const pastedRows = parseClipboardRows(text); if (!pastedRows.length) return [];
    if (column === BULK_COLUMN_UMBRAL_TABLE) return buildUmbralBulkPreview(text, skuMaster);
    if (column === BULK_COLUMN_COMBO_TABLE) return buildComboBulkPreview(text, skuMaster);
    if (column === BULK_COLUMN_BUY_X_GET_X_TABLE) return buildBuyXGetXBulkPreview(text, skuMaster, tipoActivo);
    if (column === BULK_COLUMN_MEGAPACK_TABLE) return buildMegapackBulkPreview(text, skuMaster);
    const numericRows = pastedRows.filter((cells) => isNumericSku(cells[0]));
    if (column === "sku") return numericRows.map((cells, index) => { const value = cells[0]; return { index:index+1, rowId:null, sku:value, descripcion:(skuMaster || {})[value]?.descripcion || "SKU no encontrado en archivo comprador", campo:"Nuevo SKU", valorActual:"", valorNuevo:value, warning:!value || !(skuMaster || {})[value] }; });
    const simpleRequiredPaste = column === (tipoActivo === "Precio fijo" ? "precioAhora" : tipoActivo === "Descuento" ? "descuento" : "");
    if (simpleRequiredPaste) return numericRows.map((cells, index) => {
      const sku = cells[0];
      const value = cells.length > 1 ? cells[1] : "";
      const optionalValue = cells.length > 2 ? normalizeValue(cells[2]) : "";
      const commentValue = cells.length > 3 ? normalizeValue(cells[3]) : "";
      const extraValues = {};
      if (optionalValue && column === "descuento") { const precioAhora = normalizePastedNumber(optionalValue); extraValues.precioAhora = precioAhora; extraValues.precio_ahora = precioAhora; }
      if (optionalValue && column === "precioAhora") extraValues.descuento = normalizeDiscountValue(optionalValue);
      if (commentValue) extraValues.comentario = commentValue;
      const extraSummary = [hasPromoFieldValue(extraValues.precioAhora) ? `Precio ${extraValues.precioAhora}` : "", hasPromoFieldValue(extraValues.descuento) ? `Descuento ${extraValues.descuento}` : "", extraValues.comentario ? "Comentario" : ""].filter(Boolean).join(" | ");
      const matches = rows.filter((row) => rowMatchesActiveScope(row) && rowMatchesSkuSegment(row, sku));
      const missingSecondColumn = cells.length < 2;
      const missingRequired = !sku || missingSecondColumn;
      const master = (skuMaster || {})[sku];
      const baseDescripcion = missingRequired ? `Pegue dos columnas: SKU y ${labels[column]}` : matches.length ? `Actualizara ${matches.length} fila(s) existente(s)` : master?.descripcion || "SKU nuevo sin descripcion del archivo comprador";
      const descripcion = extraSummary ? `${baseDescripcion} | ${extraSummary}` : baseDescripcion;
      return { index:index+1, rowId:matches[0]?.id || null, rowIds:matches.map((row) => row.id), sku:sku || "SKU vacio", descripcion, campo:labels[column], valorActual:matches.length ? matches.map((row) => row[column] || "").join(" | ") : "", valorNuevo:value, extraValues, warning:missingRequired || !master, canApply:!missingRequired };
    });
    return numericRows.map((cells, index) => {
      const sku = cells[0];
      const value = cells.length > 1 ? cells[1] : "";
      const matches = rows.filter((row) => rowMatchesActiveScope(row) && rowMatchesSkuSegment(row, sku));
      const row = matches.length === 1 ? matches[0] : null;
      const missingSecondColumn = cells.length < 2;
      const duplicated = matches.length > 1;
      const descripcion = missingSecondColumn ? `Pegue dos columnas: SKU y ${labels[column]}` : duplicated ? "SKU duplicado en la grilla; revise manualmente" : row?.descripcion || "No existe una fila con este SKU";
      const warning = !sku || missingSecondColumn || !row || duplicated;
      return { index:index+1, rowId:row?.id || null, sku:sku || "SKU vacio", descripcion, campo:labels[column], valorActual:row ? row[column] : "", valorNuevo:value, warning, canApply:!warning };
    });
  };
  const buildBulkPreview = () => { if (!canCreatePromotion) return; setBulkPreview(buildBulkPreviewItems()); };
  const loadPromoTemplate = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !canCreatePromotion) return;
    setShowBulkTools(true);
    try {
      const result = await readPromoTemplateFile(file, tipoActivo);
      const preview = buildBulkPreviewItems(result.text, result.bulkColumn);
      setBulkColumn(result.bulkColumn);
      setBulkText(result.text);
      setBulkPreview(preview.length ? preview : [{ index:"Aviso", sku:"Plantilla", descripcion:`La pestaÃ±a ${result.sheetName} no generÃ³ vista previa.`, campo:"Archivo", valorActual:"", valorNuevo:file.name, warning:true, canApply:false }]);
    } catch (error) {
      setBulkPreview([{ index:"Aviso", sku:"Plantilla", descripcion:error?.message || "No se pudo leer la plantilla.", campo:"Archivo", valorActual:"", valorNuevo:file.name, warning:true, canApply:false }]);
    } finally {
      event.target.value = "";
    }
  };
  const openTemplatePicker = () => {
    if (!canCreatePromotion) return;
    setShowBulkTools(true);
    promoTemplateFileInputRef.current?.click();
  };
  const applyBulkPaste = () => {
    if (!canCreatePromotion) return;
    if (!bulkPreview.length) return;
    if (bulkColumn === "sku") { bulkPreview.forEach((item) => addRow(item.valorNuevo)); setBulkText(""); setBulkPreview([]); return; }
    if (bulkColumn === BULK_COLUMN_UMBRAL_TABLE) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false);
      const groupsBySku = new Map();
      const newRows = [];
      applicableItems.forEach((item) => {
        if (!groupsBySku.has(item.sku)) groupsBySku.set(item.sku, createGroupForCurrentActivity("Umbral", [...rows, ...newRows]));
        newRows.push(buildPromoRow({ sku: item.sku, promoType: "Umbral", group: groupsBySku.get(item.sku), tipoSku: "principal", tipoCantidad: "MÃ­nimo", cantidadMinima: item.cantidadMinima, precioAhora: item.precioAhora, descuento: item.descuento }));
      });
      if (!newRows.length) return;
      setRows((prev) => [...prev, ...newRows]);
      pushLog(`PegÃ³ ${newRows.length} filas de umbral para ${groupsBySku.size} SKU`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    if (bulkColumn === BULK_COLUMN_COMBO_TABLE) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false);
      const groupsByScenario = new Map();
      const newRows = [];
      applicableItems.forEach((item) => {
        if (!groupsByScenario.has(item.scenario)) groupsByScenario.set(item.scenario, createGroupForCurrentActivity("Combo", [...rows, ...newRows]));
        const reward = isComboRewardRole(item.role);
        const comboComment = [`${item.scenario}: ${reward ? "regalia" : "principal"} cantidad 1`, item.comentario].filter(Boolean).join(" | ");
        newRows.push(buildPromoRow({ sku: item.sku, promoType: "Combo", group: groupsByScenario.get(item.scenario), tipoSku: reward ? "regalia" : "principal", tipoCantidad: "Exacta", cantidadMinima: 1, precioAhora: item.precioAhora, descuento: item.descuento, comentario: comboComment }));
      });
      if (!newRows.length) return;
      setRows((prev) => [...prev, ...newRows]);
      setComboDraft((prev) => ({ ...prev, group: Array.from(groupsByScenario.values()).at(-1) || prev.group }));
      pushLog(`PegÃ³ ${newRows.length} filas de combo para ${groupsByScenario.size} combos`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    if (bulkColumn === BULK_COLUMN_BUY_X_GET_X_TABLE) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false);
      const newRows = [];
      applicableItems.forEach((item) => {
        const promoType = BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) ? tipoActivo : BUY_X_GET_X_PROMO_TYPE;
        const group = createGroupForCurrentActivity(promoType, [...rows, ...newRows]);
        if (promoType === BUY_X_GET_X_V2_PROMO_TYPE) {
          newRows.push(buildPromoRow({ sku: item.sku, promoType, group, tipoSku: "principal", tipoCantidad: "Exacta", cantidadMinima: item.principalQty, precioAhora: item.precioAhora, descuento: item.descuento, comentario: `Variante ${item.variant}: principal ${item.principalQty}; regalia ${item.rewardQty}`, variante: item.variant }));
          return;
        }
        newRows.push(buildPromoRow({ sku: item.sku, promoType, group, tipoSku: "principal", tipoCantidad: "Exacta", cantidadMinima: item.principalQty, precioAhora: item.precioAhora, descuento: item.descuento, comentario: `Variante ${item.variant}: principal ${item.principalQty}`, variante: item.variant }));
        newRows.push(buildPromoRow({ sku: item.sku, promoType, group, tipoSku: "regalia", tipoCantidad: "Exacta", cantidadMinima: item.rewardQty, precioAhora: 0, descuento: "100%", comentario: `Variante ${item.variant}: regalia ${item.rewardQty}`, variante: item.variant }));
      });
      if (!newRows.length) return;
      setRows((prev) => [...prev, ...newRows]);
      pushLog(`PegÃ³ ${newRows.length} filas de ${tipoActivo} para ${applicableItems.length} variantes`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    if (bulkColumn === BULK_COLUMN_MEGAPACK_TABLE) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false);
      const newRows = [];
      applicableItems.forEach((item) => {
        const group = createGroupForCurrentActivity(MEGAPACK_PROMO_TYPE, [...rows, ...newRows]);
        const baseComment = [`Megapack: compra ${item.principalQty}`, item.comentario].filter(Boolean).join(" | ");
        newRows.push(buildPromoRow({ sku: item.principalSku, promoType: MEGAPACK_PROMO_TYPE, group, tipoSku: "principal", tipoCantidad: "Exacta", cantidadMinima: item.principalQty, comentario: baseComment }));
        item.rewards.forEach((reward) => {
          const rewardComment = [`Megapack: obsequio ${reward.quantity}`, item.comentario].filter(Boolean).join(" | ");
          newRows.push(buildPromoRow({ sku: reward.sku, promoType: MEGAPACK_PROMO_TYPE, group, tipoSku: "regalia", tipoCantidad: "Exacta", cantidadMinima: reward.quantity, precioAhora: 0, descuento: "100%", comentario: rewardComment }));
        });
      });
      if (!newRows.length) return;
      setRows((prev) => [...prev, ...newRows]);
      pushLog(`PegÃ³ ${newRows.length} filas de ${MEGAPACK_PROMO_TYPE} para ${applicableItems.length} megapack`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    if (isSimpleRequiredValuePaste) {
      const applicableItems = bulkPreview.filter((item) => item.canApply !== false && isNumericSku(item.sku));
      if (!applicableItems.length) return;
      setRows((prev) => {
        let nextRows = [...prev];
        applicableItems.forEach((item) => {
          const matches = nextRows.filter((row) => rowMatchesActiveScope(row) && rowMatchesSkuSegment(row, item.sku));
          const extraValues = item.extraValues || {};
          if (matches.length) {
            const ids = new Set(matches.map((row) => row.id));
            nextRows = nextRows.map((row) => ids.has(row.id) ? toAppRow(stampEditedPromo({ ...row, [bulkColumn]: item.valorNuevo, [bulkColumn === "precioAhora" ? "precio_ahora" : bulkColumn]: item.valorNuevo, ...extraValues })) : row);
            return;
          }
          const values = bulkColumn === "precioAhora" ? { precioAhora: item.valorNuevo } : { descuento: item.valorNuevo };
          nextRows = [...nextRows, buildPromoRow({ sku: item.sku, promoType: tipoActivo, ...values, ...extraValues })];
        });
        return nextRows;
      });
      pushLog(`PegÃ³ ${applicableItems.length} valores de ${labels[bulkColumn]} en ${tipoActivo}`);
      setBulkText("");
      setBulkPreview([]);
      return;
    }
    const map = new Map(bulkPreview.filter((item) => item.rowId && !item.warning && isNumericSku(item.sku)).map((item) => [item.rowId, item.valorNuevo]));
    setRows((prev) => prev.map((row) => map.has(row.id) ? toAppRow(stampEditedPromo({ ...row, [bulkColumn]: map.get(row.id), [bulkColumn === "precioAhora" ? "precio_ahora" : bulkColumn]: map.get(row.id) })) : row));
    setBulkText("");
    setBulkPreview([]);
  };
  const clearPromosWorkspace = () => {
    setSearch("");
    setBulkText("");
    setBulkPreview([]);
    setBulkColumn(getDefaultBulkColumnForPromoType(tipoActivo, { includeMegapack: false }) || "sku");
    setSegmentMode(false);
    setSelectedSegments([]);
    setComboDraft(createEmptyComboDraft());
  };
  const { updateRow, deleteRow } = usePromos({
    setRows,
    skuMaster,
    selectedBuyerConfig,
    getMasterDivision,
    normalizeRow: toAppRow,
    auditUser,
  });
  React.useEffect(() => {
    if (comprador && !buyerList.includes(comprador)) {
      setComprador("");
      return;
    }
    if (!comprador && buyerList.length === 1) {
      setComprador(buyerList[0]);
    }
  }, [buyerList, comprador, setComprador]);
  React.useEffect(() => {
    if (!supabaseReady || !onRefreshPromotionScope || !currentActivityId || !comprador || !tipoActivo) return;
    onRefreshPromotionScope({ actividadId: currentActivityId, comprador, tipoPromo: tipoActivo });
  }, [supabaseReady, onRefreshPromotionScope, currentActivityId, comprador, tipoActivo]);
  React.useEffect(() => {
    setPromoGridPage(1);
    setSelectedPromoIds(new Set());
  }, [currentActivityId, comprador, tipoActivo, search, segmentMode, segmentText]);
  const promoGridTotalPages = Math.max(1, Math.ceil(filteredRows.length / PROMO_GRID_PAGE_SIZE));
  const safePromoGridPage = Math.min(promoGridPage, promoGridTotalPages);
  React.useEffect(() => {
    if (promoGridPage > promoGridTotalPages) setPromoGridPage(promoGridTotalPages);
  }, [promoGridPage, promoGridTotalPages]);
  const paginatedRows = useMemo(() => {
    const start = (safePromoGridPage - 1) * PROMO_GRID_PAGE_SIZE;
    return filteredRows.slice(start, start + PROMO_GRID_PAGE_SIZE);
  }, [filteredRows, safePromoGridPage]);
  const selectableFilteredRowIds = useMemo(() => paginatedRows.map((row) => row.id).filter(Boolean), [paginatedRows]);
  React.useEffect(() => {
    setSelectedPromoIds((current) => pruneSelectionToVisible(current, selectableFilteredRowIds));
  }, [selectableFilteredRowIds]);
  const selectedFilteredRowCount = useMemo(() => countSelectedVisibleIds(selectableFilteredRowIds, selectedPromoIds), [selectableFilteredRowIds, selectedPromoIds]);
  const selectedPromoCount = selectedPromoIds.size;
  const allFilteredRowsSelected = selectableFilteredRowIds.length > 0 && selectedFilteredRowCount === selectableFilteredRowIds.length;
  React.useEffect(() => {
    if (!selectVisibleCheckboxRef.current) return;
    selectVisibleCheckboxRef.current.indeterminate = selectedFilteredRowCount > 0 && selectedFilteredRowCount < selectableFilteredRowIds.length;
  }, [selectedFilteredRowCount, selectableFilteredRowIds.length]);
  const togglePromoSelection = (id) => {
    setSelectedPromoIds((current) => toggleSelectedId(current, id));
  };
  const toggleVisiblePromoSelection = () => {
    setSelectedPromoIds((current) => toggleVisibleSelection(current, selectableFilteredRowIds, allFilteredRowsSelected));
  };
  const deleteSelectedPromos = () => {
    const ids = Array.from(selectedPromoIds);
    if (!ids.length) return;
    const confirmed = window.confirm(`Se eliminarÃ¡n ${ids.length} lÃ­nea(s) seleccionada(s). Esta acciÃ³n no se puede deshacer.`);
    if (!confirmed) return;
    const idsToDelete = new Set(ids);
    const nextRows = rows.filter((row) => !idsToDelete.has(row.id));
    setRows(nextRows);
    setSelectedPromoIds(new Set());
    if (canSyncSupabase && supabaseReady && !isSyncing && onSaveSupabaseDirect) {
      onSaveSupabaseDirect({ rows: nextRows });
    }
  };
  const { bulkInstructions, bulkPlaceholder } = getBulkPasteContent({ bulkColumn, tipoActivo, labels, isSimpleRequiredValuePaste });
  const canApplyBulkPreview = bulkPreview.length > 0 && bulkPreview.some((item) => item.canApply !== false);
  const isComboActive = tipoActivo === "Combo";
  const principalCompleteCount = comboPrincipals.filter((line) => normalizeValue(line.sku) && canUseComboBenefit(line.beneficio, line.valor)).length;
  const rewardCompleteCount = comboRewards.filter((line) => normalizeValue(line.sku) && canUseComboBenefit(line.beneficio, line.valor)).length;
  const canAddComboPair = canCreatePromotion
    && principalCompleteCount > 0
    && rewardCompleteCount > 0
    && principalCompleteCount === comboPrincipals.length
    && rewardCompleteCount === comboRewards.length;
  const validateBeforeSave = () => {
    return validatePromotions(currentBuyerRows, {
      actividades: [activityContext || catalogoActivo].filter(Boolean),
      compradores,
    });
  };
  const handleSaveSupabase = () => {
    const validation = validateBeforeSave();
    if (validation.errors.length) {
      setSaveWarning(validation);
      return;
    }
    onSaveSupabase?.();
  };
  const renderComboLine = (role, line, index, total) => {
    const isReward = role === "reward";
    const collectionLabel = isReward ? "regalÃ­a" : "principal";
    const needsValue = comboBenefitNeedsValue(line.beneficio);
    return <div className="combo-line" key={line.id}>
      <div className="combo-line-head">
        <strong>{collectionLabel} {index + 1}</strong>
        <button type="button" className="icon-btn" onClick={() => removeComboDraftLine(role, line.id)} disabled={total <= 1} title={`Quitar ${collectionLabel}`} aria-label={`Quitar ${collectionLabel}`}><Trash2 size={15}/></button>
      </div>
      <label className="field"><span>SKU</span><input value={line.sku || ""} onChange={(e) => updateComboLine(role, line.id, "sku", e.target.value)} disabled={!compradorSeleccionado} placeholder={isReward ? "SKU de regalÃ­a" : "SKU principal"} /></label>
      <label className="field"><span>{isReward ? "Cantidad entregada" : "Cantidad comprada"}</span><input type="number" min="1" step="1" value={line.cantidad || 1} onChange={(e) => updateComboLine(role, line.id, "cantidad", e.target.value)} disabled={!compradorSeleccionado} /></label>
      <label className="field"><span>Beneficio</span><select value={line.beneficio || (isReward ? "gratis" : "descuento")} onChange={(e) => updateComboLine(role, line.id, "beneficio", e.target.value)} disabled={!compradorSeleccionado}>{isReward && <option value="gratis">Gratis / regalÃ­a</option>}<option value="descuento">Descuento</option><option value="precio">Precio fijo</option><option value="sin">Sin beneficio</option></select></label>
      <label className="field"><span>Valor beneficio</span><input value={line.valor || ""} onChange={(e) => updateComboLine(role, line.id, "valor", e.target.value)} disabled={!compradorSeleccionado || !needsValue} placeholder={line.beneficio === "precio" ? "250" : "10%"} /></label>
    </div>;
  };
  const comboBuilder = isComboActive && canEditPromos ? <Card className="combo-builder-card"><CardContent><div className="combo-builder-head"><div><h2>Constructor de combo</h2><p>{comboGroup}</p></div><Button variant="outline" onClick={startNewCombo} disabled={!compradorSeleccionado}><Plus size={16}/> Nuevo combo</Button></div><div className="combo-builder combo-builder-pair"><label className="field wide"><span>Oferta</span><select value={comboDraft.group || ""} onChange={(e) => updateComboDraft("group", e.target.value)} disabled={!compradorSeleccionado}><option value="">Nueva oferta: {createGroupForCurrentActivity("Combo")}</option>{comboGroups.map((group) => <option key={group}>{group}</option>)}</select></label><div className="combo-role-panel principal"><div className="combo-role-head"><div><strong>Principales</strong><span>SKU que compra el cliente</span></div><Button variant="outline" onClick={() => addComboDraftLine("principal")} disabled={!compradorSeleccionado}><Plus size={16}/> Agregar</Button></div><div className="combo-line-list">{comboPrincipals.map((line, index) => renderComboLine("principal", line, index, comboPrincipals.length))}</div></div><div className="combo-role-panel reward"><div className="combo-role-head"><div><strong>RegalÃ­as</strong><span>SKU entregados como beneficio</span></div><Button variant="outline" onClick={() => addComboDraftLine("reward")} disabled={!compradorSeleccionado}><Plus size={16}/> Agregar</Button></div><div className="combo-line-list">{comboRewards.map((line, index) => renderComboLine("reward", line, index, comboRewards.length))}</div></div><div className="combo-builder-summary"><span>{principalCompleteCount}/{comboPrincipals.length} principales completos</span><span>{rewardCompleteCount}/{comboRewards.length} regalÃ­as completas</span></div><div className="button-row combo-pair-actions"><Button onClick={addComboPair} disabled={!canAddComboPair}><Plus size={16}/> Agregar combo completo</Button></div></div></CardContent></Card> : null;
  const saveSupabaseLabel = saveSupabaseStatus === "saving" ? "Guardando..." : saveSupabaseStatus === "error" ? "Reintentar" : saveSupabaseStatus === "success" ? "Guardado" : "Guardar Supabase";
  const activityCommentStatus = openActivityComments.length ? `${openActivityComments.length} abierto(s)` : activityComments.length ? `${activityComments.length} registrado(s)` : "Sin comentarios";
  const buyerAvancePanel = compradorSeleccionado && canEditAvances ? <div className="avance-mini-panel"><div className="segment-panel-head"><div><strong>Estado de carga</strong><span>Marque terminado cuando complete sus ofertas por division.</span></div></div>{buyerDivisionesAvance.length ? <div className="segment-chip-list">{buyerDivisionesAvance.map((division) => { const terminado = isAvanceTerminado(avanceCatalogos, currentCatalogoAvanceId, division, comprador); return <button key={division} type="button" className={terminado ? "segment-chip selected" : "segment-chip"} onClick={() => toggleBuyerAvance(division)}>{terminado ? <CheckCircle2 size={14}/> : <CircleDashed size={14}/>} {division}</button>; })}</div> : <div className="empty-state">Este comprador no tiene divisiones configuradas en Ajustes.</div>}</div> : null;
  const activityCommentPanel = <div className="activity-comment-panel"><div className="activity-comment-head"><div><strong>Comentario general</strong><span>{activityCommentStatus}</span></div>{canEditPromos && <Button variant="outline" onClick={() => setShowActivityComment((value) => !value)} disabled={!currentActivityId || !compradorSeleccionado}><MessageSquare size={16}/> {showActivityComment ? "Ocultar" : "Agregar"}</Button>}</div>{latestActivityComment && <div className="activity-comment-latest"><span className={String(latestActivityComment.estado).toLowerCase() === "abierto" ? "pill yellow" : "pill green"}>{latestActivityComment.estado}</span><p>{latestActivityComment.texto || latestActivityComment.comentario}</p></div>}{canEditPromos && showActivityComment && <div className="activity-comment-form"><textarea value={activityCommentDraft} onChange={(e) => setActivityCommentDraft(e.target.value)} placeholder="Ej. 20% de descuento en categoria Puertas" /><div className="button-row"><Button onClick={addActivityComment} disabled={!normalizeValue(activityCommentDraft)}><Save size={16}/> Guardar comentario</Button></div></div>}</div>;
  return <div>
    <div className="promo-page-head">
      <Header title={title} subtitle={subtitle} />
      <SkuMasterStatus status={skuMasterStatus} total={skuMasterTotal} source={archivoComprador} onRefresh={onRefreshSkuMaster} onCancel={onCancelSkuMaster} />
    </div>
    <div className="promos-layout">
      <Card className="promo-controls-card">
        <CardContent>
          <label className="field"><span>{activityContext ? "Actividad" : "Catalogo activo"}</span><div className="readonly">{activityContext?.nombre_actividad || catalogoActivo?.nombre || "Seleccione catalogo"}</div></label>
          <label className="field"><span>Comprador</span><select value={comprador} onChange={(e) => setComprador(e.target.value)} disabled={lockComprador || buyerList.length <= 1}><option value="">Seleccione comprador</option>{buyerList.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="field"><span>{"Tipo de promoci\u00f3n"}</span><select value={tipoActivo} onChange={(e) => changeTipoActivo(e.target.value)} disabled={!compradorSeleccionado}>{todosTipos.map((t) => <option key={t}>{t}</option>)}</select></label>
          {promotionScopeRefreshStatus.message && <div className={classNames("status-message", promotionScopeRefreshStatus.type === "error" && "error")}>{promotionScopeRefreshStatus.message}</div>}
          <input ref={promoTemplateFileInputRef} type="file" accept=".xlsx,.xls" hidden onChange={loadPromoTemplate}/>
          {buyerAvancePanel}
          {activityCommentPanel}
          {canEditPromos && !activityContext && <div className="segment-panel"><div className="segment-panel-head"><div><strong>{"P\u00fablico objetivo"}</strong><span>{segmentMode && segmentText ? segmentText : "Todos"}</span></div><Button variant={segmentMode ? "default" : "outline"} onClick={toggleSegmentMode} disabled={!compradorSeleccionado || !segmentOptions.length}><Users size={16}/> Segmento</Button></div>{segmentMode && <div className="segment-chip-list">{segmentOptions.map((item) => <button key={item.segmento_id} type="button" className={selectedSegments.includes(item.segmento_id) ? "segment-chip selected" : "segment-chip"} onClick={() => toggleSegment(item.segmento_id)}>{item.segmento_id} {"\u00b7"} {item.segmento}</button>)}<Button variant="outline" onClick={applySegmentsToGrid} disabled={!filteredRows.length || (segmentMode && !segmentText)}><Users size={16}/> Aplicar a grilla</Button></div>}</div>}
          {canEditPromos && <div className="button-row promo-action-row">
            <Button variant="outline" onClick={pasteSkus} disabled={!canCreatePromotion}><ClipboardPaste size={16}/> {tipoActivo === "Umbral" || tipoActivo === "Combo" || BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) || tipoActivo === MEGAPACK_PROMO_TYPE ? "Pegar tabla" : "Pegar SKU"}</Button>
            <Button variant="outline" onClick={openTemplatePicker} disabled={!canCreatePromotion}><FileSpreadsheet size={16}/> Plantilla</Button>
          </div>}
          {canEditPromos && showBulkTools && <div className="bulk-box"><p><AlertTriangle size={16}/> {bulkInstructions}</p><label className="field"><span>Pegar valores en</span><select value={bulkColumn} onChange={(e) => changeBulkColumn(e.target.value)} disabled={!canCreatePromotion}><option value="sku">SKU nuevos</option>{tipoActivo === "Umbral" && <option value={BULK_COLUMN_UMBRAL_TABLE}>Tabla de umbrales</option>}{tipoActivo === "Combo" && <option value={BULK_COLUMN_COMBO_TABLE}>Tabla de combos</option>}{BUY_X_GET_X_PROMO_TYPES.includes(tipoActivo) && <option value={BULK_COLUMN_BUY_X_GET_X_TABLE}>Tabla compra X lleva X</option>}{tipoActivo === MEGAPACK_PROMO_TYPE && <option value={BULK_COLUMN_MEGAPACK_TABLE}>Tabla Megapack</option>}<option value="precioAhora">Precio ahora c/IVA</option><option value="descuento">Descuento</option><option value="cantidadMinima">{"Cantidad m\u00ednima"}</option><option value="comentario">Comentario adicional</option></select></label><textarea placeholder={bulkPlaceholder} value={bulkText} onChange={(e) => setBulkText(e.target.value)} disabled={!canCreatePromotion} /><div className="button-row"><Button variant="outline" onClick={buildBulkPreview} disabled={!canCreatePromotion}><Search size={16}/> Vista previa</Button><Button variant="outline" onClick={applyBulkPaste} disabled={!canCreatePromotion || !canApplyBulkPreview}><ClipboardPaste size={16}/> Aplicar</Button></div>{bulkPreview.length > 0 && <div className="preview-list">{bulkPreview.map((item) => <div key={`${item.index}-${item.sku}`} className={item.warning ? "warning" : ""}><strong>{item.index}. {item.sku}</strong><span>{item.descripcion}</span><p>{item.campo}: <s>{String(item.valorActual)}</s> -&gt; <b>{String(item.valorNuevo)}</b></p></div>)}</div>}</div>}
        </CardContent>
      </Card>
      {comboBuilder}
      <Card className="grid-card">
        <CardContent>
        <div className="toolbar promo-grid-toolbar"><div><h2>{esCompleja ? "Promociones complejas" : "Promociones simples"}</h2><p>{esCompleja ? "Cada paquete se configura hacia abajo: principal y recompensas." : "Cada SKU ocupa una fila independiente."}</p></div><div className="toolbar-actions"><div className="search"><Search size={16}/><input placeholder={"Buscar SKU o descripciÃ³n"} value={search} onChange={(e) => setSearch(e.target.value)} /></div>{canEditPromos && selectedPromoCount > 0 && <Button variant="outline" onClick={deleteSelectedPromos} disabled={isSyncing}><Trash2 size={16}/> Eliminar seleccionados ({selectedPromoCount})</Button>}{canEditPromos && <Button variant="outline" onClick={clearPromosWorkspace}><X size={16}/> Limpiar</Button>}{canEditPromos && <Button variant="outline" onClick={() => addRow()} disabled={!canCreatePromotion || isComboActive}><Plus size={16}/> {"Agregar lÃ­nea"}</Button>}{canSyncSupabase && <Button onClick={handleSaveSupabase} disabled={!supabaseReady || isSyncing}><Save size={16}/> {saveSupabaseLabel}</Button>}</div></div>
          {!esCompleja && <div className="promo-integrity-row"><p className={classNames("promo-integrity-note", missingBenefitCount ? "warning" : "ok")}>{benefitStatusText}</p></div>}
          <div className="table-wrap"><table><thead><tr>{canEditPromos && <th className="sticky-action-col"><input ref={selectVisibleCheckboxRef} className="promo-row-checkbox" type="checkbox" checked={allFilteredRowsSelected} onChange={toggleVisiblePromoSelection} disabled={!selectableFilteredRowIds.length} title="Seleccionar visibles" aria-label="Seleccionar promociones visibles" /></th>}{columnas.map((col) => <th key={col} className={col === "sku" ? "sticky-sku-col" : ""}>{labels[col]}</th>)}</tr></thead><tbody>{paginatedRows.map((row, rIdx) => { const warning = hasDiscountWarning(row); return <tr key={row.id} className={getPromoRowClass(row)}>{canEditPromos && <td className="sticky-action-col"><div className="promo-row-actions"><input className="promo-row-checkbox" type="checkbox" checked={selectedPromoIds.has(row.id)} onChange={() => togglePromoSelection(row.id)} aria-label={`Seleccionar SKU ${row.sku || ""}`} /><button className="icon-btn" onClick={() => deleteRow(row.id)} title="Eliminar lÃ­nea" aria-label="Eliminar lÃ­nea"><Trash2 size={15}/></button></div></td>}{columnas.map((col, cIdx) => { const cellError = cellErrors.get(`${row.id}::${col}`); return <td key={col} className={col === "sku" ? "sticky-sku-col" : ""}>{renderCell(row, col, updateRow, warning, segmentOptions, cellError, handleGridKeyDown, rIdx, cIdx)}</td>; })}</tr>; })}</tbody></table></div>
          {filteredRows.length > PROMO_GRID_PAGE_SIZE && <div className="pagination-bar"><Button variant="outline" onClick={() => setPromoGridPage((page) => Math.max(1, page - 1))} disabled={safePromoGridPage <= 1}>Anterior</Button><span>Pagina {safePromoGridPage} de {promoGridTotalPages} Â· {filteredRows.length} filas filtradas</span><Button variant="outline" onClick={() => setPromoGridPage((page) => Math.min(promoGridTotalPages, page + 1))} disabled={safePromoGridPage >= promoGridTotalPages}>Siguiente</Button></div>}
        </CardContent>
      </Card>
    </div>
    {saveWarning && <div className="modal-backdrop" role="presentation">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="promo-save-warning-title">
        <div className="modal-head">
          <div>
            <h2 id="promo-save-warning-title">Revisar ofertas incompletas</h2>
            <p>No se guardo porque hay promociones que necesitan completar informacion.</p>
          </div>
          <button type="button" className="icon-btn" onClick={() => setSaveWarning(null)} aria-label="Cerrar advertencia"><X size={18}/></button>
        </div>
        <div className="modal-body">
          <p className="modal-note"><AlertTriangle size={16}/> Complete las ofertas indicadas y vuelva a presionar Guardar Supabase.</p>
          {saveWarning.errors.length > 0 && <div className="validation-list">
            <strong>{saveWarning.errors.length} error(es) bloqueante(s)</strong>
            {saveWarning.errors.slice(0, 8).map((issue, index) => <span key={`${issue.rowId || issue.groupKey || "issue"}-${index}`}>{formatPromotionValidationIssue(issue)}</span>)}
          </div>}
          {saveWarning.warnings?.length > 0 && <div className="validation-list">
            <strong>{saveWarning.warnings.length} advertencia(s)</strong>
            {saveWarning.warnings.slice(0, 5).map((issue, index) => <span key={`${issue.rowId || issue.groupKey || "warning"}-${index}`}>{formatPromotionValidationIssue(issue)}</span>)}
          </div>}
        </div>
        <div className="modal-actions">
          <Button onClick={() => setSaveWarning(null)}>Revisar ofertas</Button>
        </div>
      </div>
    </div>}
  </div>;
}

