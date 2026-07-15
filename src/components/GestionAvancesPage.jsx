import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleDashed, Layers3, ListChecks, Save, Tag, Users } from "lucide-react";
import { DIVISIONES_CATALOGO } from "../constants";
import { PERMISSIONS } from "../constants/permissions";
import { usePermissions } from "../hooks/usePermissions";
import { classNames } from "../utils/common";
import { normalizeDivisionesCatalogo } from "../utils/promoHelpers";
import { Button, Card, CardContent, Header, Metric } from "./ui";
import {
  getCatalogoAvanceId,
  compradorReferencesSenior,
  getCompradorCategoria,
  getCompradorDivisiones,
  getCompradorId,
  getCompradorNombre,
  getDivisionOptionsFromCompradores,
  getSeniorIds,
  isAvanceTerminado,
  isCompradorJunior,
  sameDivision,
  toggleAvanceTerminado,
} from "../utils/avanceHelpers";

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getSeniorKey(senior) {
  return getCompradorId(senior) || normalizeKey(getCompradorNombre(senior));
}

function rowMatchesCatalog(row, catalogo) {
  const catalogKeys = [
    catalogo?.id,
    catalogo?.catalogo_id,
    catalogo?.actividad_id,
    catalogo?.actividadId,
    catalogo?.nombre,
    catalogo?.nombre_actividad,
  ].filter(Boolean).map(normalizeKey);
  const rowKeys = [
    row?.actividad_id,
    row?.actividadId,
    row?.catalogo_id,
    row?.catalogoId,
    row?.catalogo,
    row?.catalogo_nombre,
  ].filter(Boolean).map(normalizeKey);
  return rowKeys.some((key) => catalogKeys.includes(key));
}

function uniqueCount(rows, field) {
  return new Set((rows || []).map((row) => row?.[field]).filter(Boolean)).size;
}

function isBuyerName(row, names) {
  const rowBuyer = normalizeKey(row?.comprador);
  return names.some((name) => normalizeKey(name) === rowBuyer);
}

export default function GestionAvancesPage({
  catalogo,
  rows = [],
  compradores = [],
  jerarquiaCategorias = [],
  avances = {},
  setAvanceCatalogos,
  setLogs,
  onSaveSupabase,
  supabaseReady,
  saveSupabaseStatus,
  isSyncing,
  onBack,
  onOpenCatalogo,
}) {
  const { can } = usePermissions();
  const canEditAvances = can(PERMISSIONS.EDIT_AVANCES);
  const canSyncSupabase = can(PERMISSIONS.SYNC_SUPABASE);
  const canOpenPromos = can(PERMISSIONS.VIEW_PROMOS);
  const catalogoId = getCatalogoAvanceId(catalogo);
  const divisionOptions = useMemo(() => getDivisionOptionsFromCompradores(compradores, DIVISIONES_CATALOGO), [compradores]);
  const activeBuyers = useMemo(() => compradores.filter((buyer) => buyer.activo !== false), [compradores]);
  const seniors = useMemo(() => activeBuyers.filter((buyer) => !isCompradorJunior(buyer)), [activeBuyers]);
  const juniors = useMemo(() => activeBuyers.filter(isCompradorJunior), [activeBuyers]);
  const [selectedSeniorKey, setSelectedSeniorKey] = useState(getSeniorKey(seniors[0]) || "");

  useEffect(() => {
    if (!seniors.some((senior) => getSeniorKey(senior) === selectedSeniorKey)) {
      setSelectedSeniorKey(getSeniorKey(seniors[0]) || "");
    }
  }, [selectedSeniorKey, seniors]);

  const scopedRows = useMemo(() => {
    return rows.filter((row) => rowMatchesCatalog(row, catalogo));
  }, [rows, catalogo]);
  const hierarchyByDepId = useMemo(() => new Map((jerarquiaCategorias || []).filter((item) => item.activo !== false && item.dep_id).map((item) => [normalizeKey(item.dep_id), item])), [jerarquiaCategorias]);
  const buyerDivisionMap = useMemo(() => {
    const map = new Map();
    activeBuyers.forEach((buyer) => {
      const name = normalizeKey(getCompradorNombre(buyer));
      const divisions = getCompradorDivisiones(buyer);
      if (name && divisions.length) map.set(name, divisions);
    });
    return map;
  }, [activeBuyers]);
  const getRowDivisionCandidates = (row) => {
    const hierarchyDivision = hierarchyByDepId.get(normalizeKey(row?.dep_id || row?.depId || row?.dept))?.division;
    const rowDivisions = getCompradorDivisiones({ division: row?.division });
    const buyerDivisions = buyerDivisionMap.get(normalizeKey(row?.comprador)) || [];
    const primaryCandidates = hierarchyDivision
      ? [hierarchyDivision]
      : rowDivisions.length === 1
        ? rowDivisions
        : [];
    const candidates = primaryCandidates.length
      ? primaryCandidates
      : buyerDivisions.length === 1
        ? buyerDivisions
        : [];
    const seen = new Set();
    return candidates
      .map((division) => String(division || "").trim())
      .filter(Boolean)
      .filter((division) => {
        const key = normalizeKey(division);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  };
  const rowMatchesDivision = (row, division) => getRowDivisionCandidates(row).some((candidate) => sameDivision(candidate, division));
  const involvedDivisions = useMemo(() => {
    const divisions = [];
    const seen = new Set();
    scopedRows.forEach((row) => {
      getRowDivisionCandidates(row).forEach((division) => {
        const key = normalizeKey(division);
        if (!key || seen.has(key)) return;
        seen.add(key);
        divisions.push(division);
      });
    });
    return divisions;
  }, [scopedRows, hierarchyByDepId, buyerDivisionMap]);
  const divisionesCatalogo = useMemo(() => {
    const selected = normalizeDivisionesCatalogo(catalogo?.divisiones);
    const base = selected.length ? selected : divisionOptions.length ? divisionOptions : involvedDivisions;
    return base.filter((division, index, source) => source.findIndex((item) => sameDivision(item, division)) === index);
  }, [catalogo, divisionOptions, involvedDivisions]);

  const getSupportJuniors = (senior, division) => {
    const directMatches = juniors.filter((junior) => compradorReferencesSenior(junior, senior));
    const candidates = directMatches.length
      ? directMatches
      : juniors.filter((junior) => !getSeniorIds(junior).length && getCompradorDivisiones(junior).some((juniorDivision) => sameDivision(juniorDivision, division)));

    return candidates.filter((junior) => {
      const juniorDivisions = getCompradorDivisiones(junior);
      return !juniorDivisions.length || juniorDivisions.some((juniorDivision) => sameDivision(juniorDivision, division));
    });
  };

  const getSeniorConfiguredDivisions = (senior) => {
    const divisionsByKey = new Map();
    const addDivision = (division) => {
      if (!division || !divisionesCatalogo.some((catalogDivision) => sameDivision(catalogDivision, division))) return;
      const key = normalizeKey(division);
      if (key && !divisionsByKey.has(key)) divisionsByKey.set(key, division);
    };

    getCompradorDivisiones(senior).forEach(addDivision);
    juniors
      .filter((junior) => compradorReferencesSenior(junior, senior))
      .flatMap(getCompradorDivisiones)
      .forEach(addDivision);

    return Array.from(divisionsByKey.values());
  };

  const seniorSummaries = useMemo(() => seniors.map((senior) => {
    const seniorName = getCompradorNombre(senior);
    const managedDivisions = getSeniorConfiguredDivisions(senior);
    const divisions = managedDivisions.map((division) => {
      const supportJuniors = getSupportJuniors(senior, division);
      const responsibleNames = [seniorName, ...supportJuniors.map(getCompradorNombre).filter(Boolean)];
      const divisionRows = scopedRows.filter((row) => isBuyerName(row, responsibleNames) && rowMatchesDivision(row, division));
      const terminado = isAvanceTerminado(avances, catalogoId, division, seniorName);
      return {
        division,
        terminado,
        juniors: supportJuniors.map(getCompradorNombre).filter(Boolean),
        tienePromos: divisionRows.length > 0,
        ofertas: divisionRows.length,
        ofertasEquipo: divisionRows.length,
        skus: uniqueCount(divisionRows, "sku"),
        skusDivision: uniqueCount(divisionRows, "sku"),
      };
    });
    const completas = divisions.filter((division) => division.terminado).length;
    const divisionesConPromos = divisions.filter((division) => division.tienePromos).length;
    const completo = divisions.length > 0 && completas === divisions.length;
    return {
      key: getSeniorKey(senior),
      id: getCompradorId(senior),
      name: seniorName,
      categoria: getCompradorCategoria(senior) || "Senior",
      divisions,
      completas,
      divisionesConSku: divisionesConPromos,
      divisionesConPromos,
      completo,
      juniors: Array.from(new Set(divisions.flatMap((division) => division.juniors))),
      ofertas: divisions.reduce((total, division) => total + division.ofertas, 0),
      skus: divisions.reduce((total, division) => total + division.skus, 0),
    };
  }).filter((senior) => senior.divisions.length > 0), [avances, catalogoId, divisionesCatalogo, scopedRows, seniors, juniors, buyerDivisionMap, hierarchyByDepId]);

  const selectedSenior = seniorSummaries.find((senior) => senior.key === selectedSeniorKey) || seniorSummaries[0];
  const totalDivisiones = seniorSummaries.reduce((total, senior) => total + senior.divisions.length, 0);
  const totalDivisionesCompletas = seniorSummaries.reduce((total, senior) => total + senior.completas, 0);
  const seniorsCompletos = seniorSummaries.filter((senior) => senior.completo).length;
  const totalOfertas = seniorSummaries.reduce((total, senior) => total + senior.ofertas, 0);
  const progress = totalDivisiones ? Math.round((totalDivisionesCompletas / totalDivisiones) * 100) : 0;
  const saveSupabaseLabel = saveSupabaseStatus === "saving" ? "Guardando..." : saveSupabaseStatus === "error" ? "Reintentar" : saveSupabaseStatus === "success" ? "Guardado" : "Guardar Supabase";

  const toggleDivision = (divisionStatus, seniorName) => {
    const division = divisionStatus?.division;
    if (!setAvanceCatalogos || !catalogoId || !division || !seniorName) return;
    const nextStatus = divisionStatus.terminado ? "Reabierto" : "Terminado";
    const previousStatus = divisionStatus.terminado ? "Terminado" : "Pendiente";

    setLogs?.((currentLogs) => [{
      fecha: new Date().toLocaleString(),
      usuario: seniorName,
      catalogo: catalogo?.nombre || catalogoId,
      accion: `Avance de division ${division}: ${nextStatus}`,
      row_id: "",
      campo: "avance_division",
      valor_anterior: previousStatus,
      valor_nuevo: nextStatus,
      fecha_cierre: nextStatus === "Terminado" ? new Date().toISOString() : "",
    }, ...currentLogs]);

    setAvanceCatalogos((current) => toggleAvanceTerminado(current, catalogoId, division, seniorName));
  };

  return <div>
    <div className="toolbar">
      <Header title="Gestion de Avances" subtitle={`Cumplimiento de carga por comprador Senior para ${catalogo?.nombre || "catalogo planificado"}.`} />
      <div className="toolbar-actions">
        <Button variant="outline" onClick={onBack}><ArrowLeft size={16}/> Volver</Button>
        {canSyncSupabase && <Button variant="outline" onClick={onSaveSupabase} disabled={!supabaseReady || isSyncing}><Save size={16}/> {saveSupabaseLabel}</Button>}
        {canOpenPromos && <Button onClick={() => onOpenCatalogo?.(catalogo)}><ListChecks size={16}/> Trabajar catalogo</Button>}
      </div>
    </div>

    <div className="metrics four">
      <Metric title="Avance general" value={`${progress}%`} icon={CheckCircle2}/>
      <Metric title="Seniors completos" value={`${seniorsCompletos}/${seniorSummaries.length}`} icon={Users}/>
      <Metric title="Divisiones completas" value={`${totalDivisionesCompletas}/${totalDivisiones}`} icon={Layers3}/>
      <Metric title="Ofertas cargadas" value={totalOfertas} icon={Tag}/>
    </div>

    <div className="avance-layout">
      <Card className="avance-board-card">
        <CardContent>
          <div className="section-head">
            <div>
              <h2>Compradores Senior</h2>
              <span>{seniorSummaries.length} responsables principales</span>
            </div>
            <span className={progress === 100 ? "pill green" : "pill yellow"}>{progress}%</span>
          </div>
          <div className="avance-division-list">
            {seniorSummaries.length ? seniorSummaries.map((senior) => {
              const selected = senior.key === selectedSenior?.key;
              return <button key={senior.key} type="button" className={classNames("avance-division-card", selected && "selected", senior.completo && "complete")} onClick={() => setSelectedSeniorKey(senior.key)}>
                <div>
                  <strong>{senior.name}</strong>
                  <span>{senior.categoria} {senior.id ? `- ID ${senior.id}` : ""}</span>
                  <span>{senior.completas}/{senior.divisions.length} divisiones completas</span>
                  <span>{senior.juniors.length ? `Junior: ${senior.juniors.join(", ")}` : "Sin junior asignado"}</span>
                </div>
                <div className="avance-card-status"><span className="pill">{senior.divisionesConPromos}/{senior.divisions.length} con promos</span><span className={senior.completo ? "pill green" : "pill yellow"}>{senior.completo ? "Completo" : "Pendiente"}</span></div>
              </button>;
            }) : <div className="empty-state">No hay compradores Senior activos configurados.</div>}
          </div>
        </CardContent>
      </Card>

      <Card className="avance-detail-card">
        <CardContent>
          {selectedSenior ? <>
            <div className="avance-detail-hero">
              <div>
                <span>{selectedSenior.completo ? <CheckCircle2 size={18}/> : <CircleDashed size={18}/>} {selectedSenior.completo ? "Comprador completo" : "Carga pendiente"}</span>
                <h2>{selectedSenior.name}</h2>
                <p>{selectedSenior.divisions.length} divisiones administradas, {selectedSenior.ofertas} ofertas y {selectedSenior.skus} SKU cargados.</p>
                <p>{selectedSenior.juniors.length ? `Junior asignado: ${selectedSenior.juniors.join(", ")}` : "Sin junior asignado"}</p>
              </div>
              <span className={selectedSenior.completo ? "pill green" : "pill yellow"}>{selectedSenior.completo ? "Completo" : "Pendiente"}</span>
            </div>

            <div className="avance-buyer-list">
              {selectedSenior.divisions.length ? selectedSenior.divisions.map((division) => <div key={`${selectedSenior.key}-${division.division}`} className={classNames("avance-buyer-row", division.terminado && "complete")}>
                <div>
                  <strong>{division.division}</strong>
                  <span>{division.juniors.length ? `Apoyo junior: ${division.juniors.join(", ")}` : "Sin apoyo junior"} - {division.ofertas} ofertas - {division.skusDivision} SKU en la division</span>
                </div>
                <div className="toolbar-actions">
                  <span className={division.terminado ? "pill green" : "pill yellow"}>{division.terminado ? "Terminado" : "Pendiente"}</span>
                  {canEditAvances && <Button variant={division.terminado ? "outline" : "default"} onClick={() => toggleDivision(division, selectedSenior.name)}>
                    {division.terminado ? "Reabrir" : "Marcar terminado"}
                  </Button>}
                </div>
              </div>) : <div className="empty-state">Este comprador no administra divisiones incluidas en el catalogo.</div>}
            </div>
          </> : <div className="empty-state">Seleccione un comprador Senior para revisar sus divisiones.</div>}
        </CardContent>
      </Card>
    </div>
  </div>;
}
