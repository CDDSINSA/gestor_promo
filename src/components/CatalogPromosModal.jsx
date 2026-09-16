import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Layers,
  Search,
  Tag,
  Trash2,
  Users,
  UserCheck,
  X,
} from "lucide-react";
import { isComplexPromoType } from "../promoTypes/promoTypeEngine";
import { classNames, normalizeValue } from "../utils/common";
import { isComboRewardRole } from "../utils/promoHelpers";
import { isAnulledPromotion } from "../features/promotions/application/promotionAnulation";
import {
  getAuthorizedCompradoresForBuyer,
  getCompradorNombre,
  getCompradorId,
  getCompradorIdentityKeys,
  isCompradorJunior,
  compradorReferencesSenior,
  getSeniorIds,
} from "../utils/avanceHelpers";
import { Button } from "./ui";

const OFFERS_PER_PAGE = 25;

function getAllowedBuyersForScope(selectedBuyerName, compradores = []) {
  if (!selectedBuyerName) return null;

  const cleanSelectedName = normalizeValue(selectedBuyerName).toLowerCase();
  const currentBuyerConfig = (compradores || []).find((b) => {
    const bName = normalizeValue(getCompradorNombre(b)).toLowerCase();
    const bId = normalizeValue(getCompradorId(b)).toLowerCase();
    return bName === cleanSelectedName || bId === cleanSelectedName;
  });

  const allowedSet = new Set();
  const allowedNames = new Set();

  allowedSet.add(cleanSelectedName);
  allowedNames.add(selectedBuyerName);

  if (currentBuyerConfig) {
    getCompradorIdentityKeys(currentBuyerConfig).forEach((k) => allowedSet.add(k));

    const authorizedBuyers = getAuthorizedCompradoresForBuyer(currentBuyerConfig, compradores);

    authorizedBuyers.forEach((buyer) => {
      const name = getCompradorNombre(buyer);
      if (name) {
        allowedNames.add(name);
        allowedSet.add(normalizeValue(name).toLowerCase());
      }
      getCompradorIdentityKeys(buyer).forEach((k) => allowedSet.add(k));
    });

    // Búsqueda complementaria bidireccional de Junior <-> Senior
    (compradores || []).forEach((b) => {
      if (b.activo === false) return;
      const bIsJunior = isCompradorJunior(b) || Boolean(getSeniorIds(b).length);

      // Si el seleccionado es Senior y 'b' es un Junior que lo referencia
      if (bIsJunior && compradorReferencesSenior(b, currentBuyerConfig)) {
        const name = getCompradorNombre(b);
        if (name) {
          allowedNames.add(name);
          allowedSet.add(normalizeValue(name).toLowerCase());
        }
        getCompradorIdentityKeys(b).forEach((k) => allowedSet.add(k));
      }

      // Si el seleccionado es Junior y 'b' es su Senior
      if (compradorReferencesSenior(currentBuyerConfig, b)) {
        const name = getCompradorNombre(b);
        if (name) {
          allowedNames.add(name);
          allowedSet.add(normalizeValue(name).toLowerCase());
        }
        getCompradorIdentityKeys(b).forEach((k) => allowedSet.add(k));
      }
    });
  }

  const isJunior = currentBuyerConfig ? isCompradorJunior(currentBuyerConfig) : false;
  const relatedNames = Array.from(allowedNames).filter(
    (n) => normalizeValue(n).toLowerCase() !== cleanSelectedName
  );

  return {
    allowedKeys: Array.from(allowedSet),
    allowedNames: Array.from(allowedNames),
    selectedBuyerName,
    relatedNames,
    isSenior: currentBuyerConfig ? !isJunior : false,
    isJunior,
    currentBuyerConfig,
  };
}

export default function CatalogPromosModal({
  isOpen,
  onClose,
  catalogName = "",
  catalogId = "",
  catalogoActivo = null,
  selectedBuyer = "",
  rows = [],
  skuMaster = {},
  compradores = [],
  canEdit = false,
  isSyncing = false,
  onRequestAnulation,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [buyerFilter, setBuyerFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // 1. Obtener alcance de compradores autorizados (Comprador seleccionado + su Junior o Senior)
  const buyerScope = useMemo(() => {
    return getAllowedBuyersForScope(selectedBuyer, compradores);
  }, [selectedBuyer, compradores]);

  // 2. Filtrar todas las promociones del catálogo y restringir al comprador seleccionado y sus juniors/seniors
  const catalogRows = useMemo(() => {
    if (!catalogId && !catalogoActivo) return [];

    // Filtrar por catálogo
    const byCatalog = rows.filter((r) => {
      if (isAnulledPromotion(r)) return false;
      const actId = r.actividadId || r.actividad_id || r.catalogo_id || "";
      if (!actId) return false;
      if (catalogId && actId === catalogId) return true;
      if (catalogoActivo?.id && actId === catalogoActivo.id) return true;
      if (catalogoActivo?.actividad_id && actId === catalogoActivo.actividad_id) return true;
      if (catalogoActivo?.catalogo_id && actId === catalogoActivo.catalogo_id) return true;
      return false;
    });

    // Si no hay comprador seleccionado, mostramos las del catálogo
    if (!buyerScope) return byCatalog;

    const { allowedKeys } = buyerScope;

    // Filtrar únicamente las del comprador seleccionado o su contraparte Junior/Senior
    return byCatalog.filter((row) => {
      const bName = normalizeValue(row.comprador || row.comprador_nombre || row.buyer || "").toLowerCase();
      const bId = normalizeValue(row.compradorId || row.comprador_id || "").toLowerCase();
      const uCrea = normalizeValue(row.usuarioCrea || row.usuario_crea || "").toLowerCase();

      return (
        allowedKeys.includes(bName) ||
        allowedKeys.includes(bId) ||
        allowedKeys.includes(uCrea)
      );
    });
  }, [rows, catalogId, catalogoActivo, buyerScope]);

  // Lista única de compradores permitidos que tienen promociones cargadas en este catálogo
  const availableBuyers = useMemo(() => {
    const set = new Set();
    catalogRows.forEach((r) => {
      const b = r.comprador || r.buyer || "";
      if (b) set.add(b);
    });
    return Array.from(set).sort();
  }, [catalogRows]);

  const availableTypes = useMemo(() => {
    const set = new Set();
    catalogRows.forEach((r) => {
      const t = r.tipoPromo || r.tipo_promo || "";
      if (t) set.add(t);
    });
    return Array.from(set).sort();
  }, [catalogRows]);

  // 3. Filtrado por búsqueda de texto y filtros rápidos
  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return catalogRows.filter((row) => {
      const promoType = row.tipoPromo || row.tipo_promo || "";
      const buyer = row.comprador || "";

      if (buyerFilter && buyer !== buyerFilter) return false;
      if (typeFilter && promoType !== typeFilter) return false;

      if (!term) return true;

      const sku = normalizeValue(row.sku);
      const desc = normalizeValue(row.descripcion || skuMaster?.[sku]?.descripcion || "");
      const group = normalizeValue(row.grupoOferta || row.grupo_oferta || "");
      const offer = normalizeValue(row.ofertaId || row.oferta_id || "");
      const comment = normalizeValue(row.comentario || row.comentario_comprador || "");
      const numParte = normalizeValue(row.numParte || row.num_parte || "");

      return (
        sku.toLowerCase().includes(term) ||
        desc.toLowerCase().includes(term) ||
        group.toLowerCase().includes(term) ||
        offer.toLowerCase().includes(term) ||
        buyer.toLowerCase().includes(term) ||
        promoType.toLowerCase().includes(term) ||
        comment.toLowerCase().includes(term) ||
        numParte.toLowerCase().includes(term)
      );
    });
  }, [catalogRows, searchTerm, buyerFilter, typeFilter, skuMaster]);

  // 4. Agrupación por ID de oferta
  const groupedOffers = useMemo(() => {
    const map = new Map();

    filteredRows.forEach((row) => {
      const promoType = row.tipoPromo || row.tipo_promo || "Descuento";
      const rawGroup = row.grupoOferta || row.grupo_oferta || "";
      const isComplex = isComplexPromoType(promoType);

      let offerKey;
      let displayId;

      if (isComplex) {
        offerKey = rawGroup || row.ofertaId || row.oferta_id || row.id || row.row_id || "OFE-COMPLEJA";
        displayId = offerKey;
      } else if (rawGroup && rawGroup !== promoType && !["descuento", "precio fijo"].includes(rawGroup.toLowerCase())) {
        offerKey = rawGroup;
        displayId = rawGroup;
      } else {
        offerKey = row.ofertaId || row.oferta_id || `${promoType}-${row.sku || row.id || row.row_id}`;
        displayId = row.ofertaId || row.oferta_id || rawGroup || row.sku || row.id || row.row_id;
      }

      if (!map.has(offerKey)) {
        map.set(offerKey, {
          offerKey,
          offerId: displayId,
          tipoPromo: promoType,
          comprador: row.comprador || "Comprador",
          segmento:
            row.segmento ||
            (row.aplicaSegmento === "SI" || row.aplica_segmento === "SI"
              ? row.segmentoCliente || row.segmento_cliente
              : "") ||
            "Público general",
          lines: [],
        });
      }
      map.get(offerKey).lines.push(row);
    });

    return Array.from(map.values());
  }, [filteredRows]);

  // Paginación de ofertas agrupadas
  const totalOffers = groupedOffers.length;
  const totalPages = Math.max(1, Math.ceil(totalOffers / OFFERS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedOffers = useMemo(() => {
    const start = (safePage - 1) * OFFERS_PER_PAGE;
    return groupedOffers.slice(start, start + OFFERS_PER_PAGE);
  }, [groupedOffers, safePage]);

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, buyerFilter, typeFilter]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card catalog-promos-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-promos-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="modal-head catalog-promos-modal-head">
          <div className="catalog-promos-title-wrap">
            <div className="catalog-promos-icon-shell">
              <Layers size={22} />
            </div>
            <div>
              <h2 id="catalog-promos-title">Promociones del Catálogo</h2>
              <p>
                <strong>{catalogName || "Catálogo activo"}</strong>
                {buyerScope ? (
                  <>
                    {" "}&middot; Alcance: <strong>{buyerScope.selectedBuyerName}</strong> ({buyerScope.isJunior ? "Junior" : "Senior"})
                    {buyerScope.relatedNames.length > 0 && (
                      <span style={{ color: "#006B3F", fontWeight: 600 }}>
                        {" "}y {buyerScope.isJunior ? "Senior" : "Junior(s)"}: {buyerScope.relatedNames.join(", ")}
                      </span>
                    )}
                  </>
                ) : (
                  " · Vista general de ofertas del catálogo"
                )}
              </p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar modal">
            <X size={20} />
          </button>
        </div>

        {/* Barra de Filtros y KPIs */}
        <div className="catalog-promos-toolbar">
          <div className="catalog-promos-search-row">
            <div className="catalog-promos-search-input-wrap">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar por SKU, descripción, ID de oferta o comprador..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchTerm("")}
                  title="Limpiar búsqueda"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {availableBuyers.length > 1 && (
              <select
                className="catalog-promos-filter-select"
                value={buyerFilter}
                onChange={(e) => setBuyerFilter(e.target.value)}
                title="Filtrar por comprador"
              >
                <option value="">Todos los compradores ({availableBuyers.length})</option>
                {availableBuyers.map((b) => (
                  <option key={b} value={b}>
                    {b} {buyerScope?.selectedBuyerName === b ? "(Seleccionado)" : ""}
                  </option>
                ))}
              </select>
            )}

            {availableTypes.length > 1 && (
              <select
                className="catalog-promos-filter-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                title="Filtrar por tipo de promoción"
              >
                <option value="">Todos los tipos ({availableTypes.length})</option>
                {availableTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}

            {(searchTerm || buyerFilter || typeFilter) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setBuyerFilter("");
                  setTypeFilter("");
                }}
              >
                Restablecer
              </Button>
            )}
          </div>

          {/* Quick Metrics */}
          <div className="catalog-promos-kpi-row">
            <div className="catalog-promo-kpi-chip">
              <span>Ofertas visibles:</span>
              <strong>{totalOffers}</strong>
            </div>
            <div className="catalog-promo-kpi-chip">
              <span>Líneas / SKU:</span>
              <strong>{filteredRows.length}</strong>
            </div>
            {buyerScope && (
              <div className="catalog-promo-kpi-chip" style={{ borderColor: "#b7e0ca", background: "#f0fdf4" }}>
                <UserCheck size={13} style={{ color: "#006B3F" }} />
                <span>Equipo:</span>
                <strong style={{ color: "#006B3F" }}>
                  {buyerScope.allowedNames.join(" + ")}
                </strong>
              </div>
            )}
          </div>
        </div>

        {/* Cuerpo del Modal: Lista de Ofertas agrupadas */}
        <div className="modal-body catalog-promos-modal-body">
          {catalogRows.length === 0 ? (
            <div className="catalog-promos-empty">
              <AlertCircle size={36} className="empty-icon" />
              <h3>Sin promociones en este alcance</h3>
              <p>
                {buyerScope
                  ? `No se encontraron promociones registradas para ${buyerScope.selectedBuyerName} ni su equipo Junior/Senior en este catálogo.`
                  : "Aún no se han creado promociones para este catálogo en la sesión actual."}
              </p>
            </div>
          ) : paginatedOffers.length === 0 ? (
            <div className="catalog-promos-empty">
              <Search size={36} className="empty-icon" />
              <h3>Sin coincidencias</h3>
              <p>No se encontraron ofertas que coincidan con los criterios de búsqueda.</p>
            </div>
          ) : (
            <div className="catalog-promos-groups-list">
              {paginatedOffers.map((group) => {
                const isComplex = isComplexPromoType(group.tipoPromo);
                return (
                  <div key={group.offerKey} className="catalog-promo-group-card">
                    {/* Encabezado del Grupo de Oferta */}
                    <div className="catalog-promo-group-head">
                      <div className="group-head-left">
                        <span className="offer-id-badge" title="ID de Oferta">
                          #{group.offerId}
                        </span>
                        <span className={classNames("offer-type-badge", group.tipoPromo.toLowerCase().replace(/\s+/g, "-"))}>
                          {group.tipoPromo}
                        </span>
                        <span className="offer-buyer-badge">
                          <Users size={12} /> {group.comprador}
                        </span>
                        {group.segmento && group.segmento !== "Público general" && group.segmento !== "Todos" ? (
                          <span className="offer-segment-badge" title={`Segmento: ${group.segmento}`}>
                            <Tag size={11} /> {group.segmento}
                          </span>
                        ) : (
                          <span className="offer-segment-general">Público general</span>
                        )}
                      </div>
                      <div className="group-head-right">
                        <span className="offer-lines-count">
                          {group.lines.length} {group.lines.length === 1 ? "línea" : "líneas"}
                        </span>
                      </div>
                    </div>

                    {/* Tabla de Productos / Líneas de la Oferta */}
                    <div className="catalog-promo-table-wrap">
                      <table className="catalog-promos-table">
                        <thead>
                          <tr>
                            <th style={{ width: "13%" }}>ID / SKU</th>
                            <th style={{ width: "12%" }}>Tipo Oferta</th>
                            <th style={{ width: "24%" }}>Descripción</th>
                            <th style={{ width: "11%", textAlign: "right" }}>Precio Lista</th>
                            <th style={{ width: "11%", textAlign: "right" }}>Precio Oferta</th>
                            <th style={{ width: "9%", textAlign: "center" }}>Descuento</th>
                            <th style={{ width: "10%", textAlign: "center" }}>Cantidad</th>
                            <th style={{ width: canEdit ? "8%" : "10%" }}>Comentario</th>
                            {canEdit && <th style={{ width: "2%", textAlign: "center" }}>Acción</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {group.lines.map((line, idx) => {
                            const sku = line.sku || "-";
                            const master = (skuMaster || {})[sku] || {};
                            const descripcion = line.descripcion || master.descripcion || "-";
                            const precioLista = line.precioAntes || line.precio_antes || master.precio || "-";
                            const precioOferta = line.precioAhora ?? line.precio_ahora ?? "-";
                            const descuento = line.descuento || "-";
                            const cantidadMinima = line.cantidadMinima ?? line.cantidad_minima ?? 1;
                            const tipoCantidad = line.tipoCantidad || line.tipo_cantidad || "Exacta";
                            const comentario = line.comentario || line.comentario_comprador || "-";
                            const tipoSku = line.tipoSku || line.tipo_sku || "";
                            const isReward = isComboRewardRole(tipoSku);

                            return (
                              <tr key={`${line.id || line.row_id || idx}-${sku}`}>
                                <td>
                                  <div className="sku-cell-wrapper">
                                    <strong className="sku-code">{sku}</strong>
                                    {isComplex && tipoSku && (
                                      <span
                                        className={classNames(
                                          "role-pill",
                                          isReward ? "reward" : tipoSku === "principal" ? "principal" : "neutral"
                                        )}
                                      >
                                        {tipoSku}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <span className="table-type-label">{line.tipoPromo || line.tipo_promo}</span>
                                </td>
                                <td title={descripcion}>
                                  <span className="table-desc-text">{descripcion}</span>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <span className="table-price-old">
                                    {precioLista !== "-" && !String(precioLista).startsWith("$")
                                      ? `$${precioLista}`
                                      : precioLista}
                                  </span>
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <strong className="table-price-new">
                                    {precioOferta !== "-" && !String(precioOferta).startsWith("$")
                                      ? `$${precioOferta}`
                                      : precioOferta}
                                  </strong>
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <span
                                    className={classNames(
                                      "table-discount-badge",
                                      descuento !== "-" && "active"
                                    )}
                                  >
                                    {descuento}
                                  </span>
                                </td>
                                <td style={{ textAlign: "center" }}>
                                  <span className="table-qty-badge">
                                    {cantidadMinima} <small>({tipoCantidad.slice(0, 3)})</small>
                                  </span>
                                </td>
                                <td title={comentario}>
                                  <span className="table-comment-text">{comentario}</span>
                                </td>
                                {canEdit && (
                                  <td style={{ textAlign: "center" }}>
                                    <button
                                      type="button"
                                      className="icon-btn"
                                      onClick={() => onRequestAnulation?.(line)}
                                      disabled={isSyncing}
                                      title={isComplex ? "Anular oferta completa" : "Anular o quitar línea"}
                                      aria-label={isComplex ? "Anular oferta completa" : "Anular o quitar línea"}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pie del Modal con Paginación y Botón de Cerrar */}
        <div className="modal-actions catalog-promos-modal-actions">
          <div className="catalog-promos-pagination-info">
            <span>
              Mostrando <strong>{paginatedOffers.length}</strong> de <strong>{totalOffers}</strong> ofertas encontradas
              {totalOffers > 0 && ` (Página ${safePage} de ${totalPages})`}
            </span>
            {totalPages > 1 && (
              <div className="catalog-promos-page-controls">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft size={14} /> Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Siguiente <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>

          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
