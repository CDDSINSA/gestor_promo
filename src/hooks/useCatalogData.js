import { useCallback, useState } from "react";
import {
  catalogosIniciales,
  compradoresIniciales,
  responsablesSolicitudesIniciales,
  segmentosClientesIniciales,
} from "../constants";
import {
  mergeCatalogActivities,
  normalizeCompradorData,
  normalizeResponsableSolicitud,
} from "../utils/promoHelpers";

function buildInitialCatalogState(useDemoData = false) {
  const catalogos = useDemoData ? catalogosIniciales : [];
  return {
    catalogos,
    catalogoActivo: catalogos[0] || null,
    catalogoAvanceActivo: catalogos[0] || null,
    actividades: mergeCatalogActivities(catalogos, []),
    compradores: useDemoData ? compradoresIniciales.map(normalizeCompradorData) : [],
    responsablesSolicitudes: useDemoData ? responsablesSolicitudesIniciales.map(normalizeResponsableSolicitud) : [],
    jerarquiaCategorias: [],
    segmentosClientes: useDemoData ? segmentosClientesIniciales : [],
    catalogoResumen: [],
    config: [],
    notificaciones: [],
  };
}

export function useCatalogData({ useDemoData = false } = {}) {
  const [catalogos, setCatalogos] = useState(() => buildInitialCatalogState(useDemoData).catalogos);
  const [catalogoActivo, setCatalogoActivo] = useState(() => buildInitialCatalogState(useDemoData).catalogoActivo);
  const [catalogoAvanceActivo, setCatalogoAvanceActivo] = useState(() => buildInitialCatalogState(useDemoData).catalogoAvanceActivo);
  const [actividades, setActividades] = useState(() => buildInitialCatalogState(useDemoData).actividades);
  const [compradores, setCompradores] = useState(() => buildInitialCatalogState(useDemoData).compradores);
  const [responsablesSolicitudes, setResponsablesSolicitudes] = useState(() => buildInitialCatalogState(useDemoData).responsablesSolicitudes);
  const [jerarquiaCategorias, setJerarquiaCategorias] = useState(() => buildInitialCatalogState(useDemoData).jerarquiaCategorias);
  const [segmentosClientes, setSegmentosClientes] = useState(() => buildInitialCatalogState(useDemoData).segmentosClientes);
  const [catalogoResumen, setCatalogoResumen] = useState(() => buildInitialCatalogState(useDemoData).catalogoResumen);
  const [config, setConfig] = useState(() => buildInitialCatalogState(useDemoData).config);
  const [notificaciones, setNotificaciones] = useState(() => buildInitialCatalogState(useDemoData).notificaciones);

  const resetCatalogData = useCallback(() => {
    const nextState = buildInitialCatalogState(useDemoData);
    setCatalogos(nextState.catalogos);
    setCatalogoActivo(nextState.catalogoActivo);
    setCatalogoAvanceActivo(nextState.catalogoAvanceActivo);
    setActividades(nextState.actividades);
    setCompradores(nextState.compradores);
    setResponsablesSolicitudes(nextState.responsablesSolicitudes);
    setJerarquiaCategorias(nextState.jerarquiaCategorias);
    setSegmentosClientes(nextState.segmentosClientes);
    setCatalogoResumen(nextState.catalogoResumen);
    setConfig(nextState.config);
    setNotificaciones(nextState.notificaciones);
  }, [useDemoData]);

  return {
    catalogos,
    setCatalogos,
    catalogoActivo,
    setCatalogoActivo,
    catalogoAvanceActivo,
    setCatalogoAvanceActivo,
    actividades,
    setActividades,
    compradores,
    setCompradores,
    responsablesSolicitudes,
    setResponsablesSolicitudes,
    jerarquiaCategorias,
    setJerarquiaCategorias,
    segmentosClientes,
    setSegmentosClientes,
    catalogoResumen,
    setCatalogoResumen,
    config,
    setConfig,
    notificaciones,
    setNotificaciones,
    resetCatalogData,
  };
}
