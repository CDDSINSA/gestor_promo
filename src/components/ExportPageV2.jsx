import React, { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { classNames } from "../utils/common";
import { isActivityComment, isLineComment, isSegmentedRow, normalizeActividad } from "../utils/promoHelpers";

function Header({ title, subtitle }) {
  return (
    <div className="header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  );
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

export default function ExportPageV2({ rows = [], actividades = [], comentarios = [] }) {
  const [compradorFiltro, setCompradorFiltro] = useState("Todos");
  const [tipoFiltro, setTipoFiltro] = useState("Todos");
  const [tipoActividadFiltro, setTipoActividadFiltro] = useState("Todos");
  const [canalFiltro, setCanalFiltro] = useState("Todos");
  const [alcanceFiltro, setAlcanceFiltro] = useState("Todos");
  const [estadoComentarioFiltro, setEstadoComentarioFiltro] = useState("Todos");
  const [skuFiltro, setSkuFiltro] = useState("");
  const [actividadCatalogoFiltro, setActividadCatalogoFiltro] = useState("");

  const activityMap = useMemo(
    () => new Map((actividades || []).map((item) => {
      const activity = normalizeActividad(item);
      return [activity.actividad_id, activity];
    })),
    [actividades],
  );

  const getActivityId = (row) => row.actividadId || row.actividad_id || row.catalogo_id || "";
  const getActivity = (row) => activityMap.get(row.actividadId || row.actividad_id) || activityMap.get(row.catalogo_id) || {};
  const getComentariosRow = (rowId) => comentarios.filter((c) => isLineComment(c) && (c.rowId || c.row_id) === rowId);
  const getActivityComments = (activityId) => comentarios.filter((c) => isActivityComment(c) && (c.actividadId || c.actividad_id) === activityId);

  const compradoresUnicos = ["Todos", ...Array.from(new Set(rows.map((row) => row.comprador || getActivity(row).comprador || getActivity(row).solicitante || "Sin comprador")))];
  const tiposUnicos = ["Todos", ...Array.from(new Set(rows.map((row) => row.tipoPromo || "Sin tipo")))];
  const tiposActividad = ["Todos", ...Array.from(new Set(rows.map((row) => getActivity(row).tipo_actividad || "CATALOGO")))];
  const canales = ["Todos", ...Array.from(new Set(rows.map((row) => getActivity(row).canal || "Sin canal")))];
  const alcances = ["Todos", ...Array.from(new Set(rows.map((row) => row.alcanceTipo || row.alcance_tipo || "Sin alcance")))];

  const rowsFiltradas = rows.filter((row) => {
    const activity = getActivity(row);
    const comentariosRow = getComentariosRow(row.id);
    const comentariosActividad = getActivityComments(getActivityId(row));
    const comentariosTotales = [...comentariosRow, ...comentariosActividad];
    const tieneAbierto = comentariosTotales.some((c) => String(c.estado).toLowerCase() === "abierto");
    const tieneResuelto = comentariosTotales.some((c) => String(c.estado).toLowerCase() === "resuelto");
    const compradorRow = row.comprador || activity.comprador || activity.solicitante || "Sin comprador";
    const tipoActividad = activity.tipo_actividad || "CATALOGO";
    const activityId = getActivityId(row);
    const activityName = activity.nombre_actividad || activity.nombreActividad || activity.nombre || "";
    const canal = activity.canal || "Sin canal";
    const alcance = row.alcanceTipo || row.alcance_tipo || "Sin alcance";
    const skuTerm = skuFiltro.trim().toLowerCase();
    const activityTerm = actividadCatalogoFiltro.trim().toLowerCase();
    const matchesSku = !skuTerm || String(row.sku || "").toLowerCase().includes(skuTerm);
    const matchesActivity = !activityTerm || `${activityId} ${activityName}`.toLowerCase().includes(activityTerm);
    return matchesSku
      && matchesActivity
      && (compradorFiltro === "Todos" || compradorRow === compradorFiltro)
      && (tipoFiltro === "Todos" || (row.tipoPromo || "Sin tipo") === tipoFiltro)
      && (tipoActividadFiltro === "Todos" || tipoActividad === tipoActividadFiltro)
      && (canalFiltro === "Todos" || canal === canalFiltro)
      && (alcanceFiltro === "Todos" || alcance === alcanceFiltro)
      && (estadoComentarioFiltro === "Todos"
        || (estadoComentarioFiltro === "Abiertos" && tieneAbierto)
        || (estadoComentarioFiltro === "Resueltos" && tieneResuelto)
        || (estadoComentarioFiltro === "Sin comentarios" && comentariosTotales.length === 0));
  });

  const escapeCsv = (value) => {
    const text = String(value ?? "").replace(/\r?\n/g, " ");
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const makeCommon = (row) => {
    const activity = getActivity(row);
    const activityId = getActivityId(row);
    const segmenta = isSegmentedRow(row) ? "SI" : "NO";
    return {
      activity,
      activityId,
      segmenta,
      segmentoCliente: row.segmentoCliente || row.segmento_cliente || (segmenta === "SI" ? row.segmento : ""),
      comentariosActividad: getActivityComments(activityId).map((c) => `${c.estado}: ${c.texto || c.comentario}`).join(" | "),
      comentariosLinea: getComentariosRow(row.id).map((c) => `${c.estado}: ${c.texto || c.comentario}`).join(" | "),
      comentariosLineaAbiertos: getComentariosRow(row.id)
        .filter((c) => String(c.estado).toLowerCase() === "abierto")
        .map((c) => c.texto || c.comentario)
        .join(" | "),
    };
  };

  const exportDefs = {
    pricing: {
      title: "Pricing",
      desc: "Base operativa para configurar promociones.",
      file: "export_pricing",
      columns: [["actividad_id", (row, ctx) => ctx.activityId], ["oferta_id", (row) => row.ofertaId || row.oferta_id || ""], ["tipo_actividad", (row, ctx) => ctx.activity.tipo_actividad || "CATALOGO"], ["canal", (row, ctx) => ctx.activity.canal || ""], ["alcance_tipo", (row) => row.alcanceTipo || row.alcance_tipo || ""], ["alcance_valor", (row) => row.alcanceValor || row.alcance_valor || ""], ["comprador", (row) => row.comprador || ""], ["tipo_promo", (row) => row.tipoPromo || ""], ["grupo_oferta", (row) => row.grupoOferta || ""], ["tipo_sku", (row) => row.tipoSku || ""], ["variante", (row) => row.variante || ""], ["sku", (row) => row.sku || ""], ["tipo_cantidad", (row) => row.tipoCantidad || ""], ["cantidad_minima", (row) => row.cantidadMinima || ""], ["precio_antes", (row) => row.precioAntes || ""], ["precio_ahora", (row) => row.precioAhora || ""], ["descuento", (row) => row.descuento || ""], ["aplica_segmento", (row, ctx) => ctx.segmenta], ["segmento_cliente", (row, ctx) => ctx.segmentoCliente], ["segmento", (row) => row.segmento || ""], ["estado_registro", (row) => row.estado_registro || ""], ["comentarios_actividad", (row, ctx) => ctx.comentariosActividad]],
    },
    mercadeo: {
      title: "Mercadeo",
      desc: "Base para artes, catalogo y revision.",
      file: "export_mercadeo",
      columns: [["actividad_id", (row, ctx) => ctx.activityId], ["nombre_actividad", (row, ctx) => ctx.activity.nombre_actividad || ""], ["oferta_id", (row) => row.ofertaId || row.oferta_id || ""], ["tipo_actividad", (row, ctx) => ctx.activity.tipo_actividad || "CATALOGO"], ["canal", (row, ctx) => ctx.activity.canal || ""], ["alcance_tipo", (row) => row.alcanceTipo || row.alcance_tipo || ""], ["alcance_valor", (row) => row.alcanceValor || row.alcance_valor || ""], ["comprador", (row) => row.comprador || ""], ["tipo_promo", (row) => row.tipoPromo || ""], ["grupo_oferta", (row) => row.grupoOferta || ""], ["variante", (row) => row.variante || ""], ["sku", (row) => row.sku || ""], ["num_parte", (row) => row.numParte || ""], ["descripcion", (row) => row.descripcion || ""], ["precio_antes", (row) => row.precioAntes || ""], ["precio_ahora", (row) => row.precioAhora || ""], ["descuento", (row) => row.descuento || ""], ["comentario_comprador", (row) => row.comentario || ""], ["aplica_segmento", (row, ctx) => ctx.segmenta], ["segmento_cliente", (row, ctx) => ctx.segmentoCliente], ["segmento", (row) => row.segmento || ""], ["comentarios_actividad", (row, ctx) => ctx.comentariosActividad], ["comentarios_abiertos_mercadeo", (row, ctx) => ctx.comentariosLineaAbiertos]],
    },
    planimetria: {
      title: "Planimetria",
      desc: "Base para tickets, rotulos y exhibiciones.",
      file: "export_planimetria",
      columns: [["actividad_id", (row, ctx) => ctx.activityId], ["oferta_id", (row) => row.ofertaId || row.oferta_id || ""], ["tipo_actividad", (row, ctx) => ctx.activity.tipo_actividad || "CATALOGO"], ["canal", (row, ctx) => ctx.activity.canal || ""], ["comprador", (row) => row.comprador || ""], ["division", (row) => row.division || ""], ["tipo_promo", (row) => row.tipoPromo || ""], ["grupo_oferta", (row) => row.grupoOferta || ""], ["variante", (row) => row.variante || ""], ["sku", (row) => row.sku || ""], ["descripcion", (row) => row.descripcion || ""], ["precio_antes", (row) => row.precioAntes || ""], ["precio_ahora", (row) => row.precioAhora || ""], ["descuento", (row) => row.descuento || ""], ["aplica_segmento", (row, ctx) => ctx.segmenta], ["segmento_cliente", (row, ctx) => ctx.segmentoCliente], ["segmento", (row) => row.segmento || ""], ["comentarios_actividad", (row, ctx) => ctx.comentariosActividad]],
    },
    consolidado: {
      title: "Consolidado",
      desc: "Base completa con revision y aplicabilidad.",
      file: "consolidado_promociones",
      columns: [["Actividad", (row, ctx) => ctx.activityId], ["Nombre actividad", (row, ctx) => ctx.activity.nombre_actividad || ""], ["Oferta ID", (row) => row.ofertaId || row.oferta_id || ""], ["Tipo actividad", (row, ctx) => ctx.activity.tipo_actividad || "CATALOGO"], ["Canal", (row, ctx) => ctx.activity.canal || ""], ["Alcance", (row) => row.alcanceTipo || row.alcance_tipo || ""], ["Valor alcance", (row) => row.alcanceValor || row.alcance_valor || ""], ["Segmenta", (row, ctx) => ctx.segmenta], ["Segmento cliente", (row, ctx) => ctx.segmentoCliente], ["Comprador", (row) => row.comprador || ""], ["Tipo promo", (row) => row.tipoPromo || ""], ["Oferta", (row) => row.grupoOferta || ""], ["Rol", (row) => row.tipoSku || ""], ["Variante", (row) => row.variante || ""], ["SKU", (row) => row.sku || ""], ["Descripcion", (row) => row.descripcion || ""], ["Cantidad", (row) => row.cantidadMinima || ""], ["Precio ahora", (row) => row.precioAhora || ""], ["Descuento", (row) => row.descuento || ""], ["Comentarios actividad", (row, ctx) => ctx.comentariosActividad], ["Comentarios linea", (row, ctx) => ctx.comentariosLinea]],
    },
  };

  const downloadExport = (key) => {
    const def = exportDefs[key];
    if (!def || !rowsFiltradas.length) return;

    const lines = [
      def.columns.map(([label]) => escapeCsv(label)).join(";"),
      ...rowsFiltradas.map((row) => {
        const ctx = makeCommon(row);
        return def.columns.map(([, getter]) => escapeCsv(getter(row, ctx))).join(";");
      }),
    ];

    const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${def.file}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Header title="Exportaciones" subtitle="Salidas preparadas para Pricing, Mercadeo, Planimetria y consolidacion." />
      <Card className="consolidado-filter-card export-filter-card">
        <CardContent>
          <div className="section-head">
            <div>
              <h2>Filtros</h2>
              <span>{rowsFiltradas.length} filas listas para exportar</span>
            </div>
          </div>
          <div className="filter-grid">
            <label className="filter-field">
              <span>SKU</span>
              <input value={skuFiltro} onChange={(e) => setSkuFiltro(e.target.value)} placeholder="Buscar SKU" />
            </label>
            <label className="filter-field">
              <span>Actividad / catalogo</span>
              <input value={actividadCatalogoFiltro} onChange={(e) => setActividadCatalogoFiltro(e.target.value)} placeholder="ID o nombre" />
            </label>
            <label className="filter-field">
              <span>Comprador</span>
              <select value={compradorFiltro} onChange={(e) => setCompradorFiltro(e.target.value)}>{compradoresUnicos.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="filter-field">
              <span>Tipo actividad</span>
              <select value={tipoActividadFiltro} onChange={(e) => setTipoActividadFiltro(e.target.value)}>{tiposActividad.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="filter-field">
              <span>Canal</span>
              <select value={canalFiltro} onChange={(e) => setCanalFiltro(e.target.value)}>{canales.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="filter-field">
              <span>Alcance</span>
              <select value={alcanceFiltro} onChange={(e) => setAlcanceFiltro(e.target.value)}>{alcances.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="filter-field">
              <span>Tipo promo</span>
              <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)}>{tiposUnicos.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="filter-field">
              <span>Comentarios</span>
              <select value={estadoComentarioFiltro} onChange={(e) => setEstadoComentarioFiltro(e.target.value)}><option>Todos</option><option>Abiertos</option><option>Resueltos</option><option>Sin comentarios</option></select>
            </label>
          </div>
        </CardContent>
      </Card>
      <div className="export-grid">
        {Object.entries(exportDefs).map(([key, def]) => (
          <Card key={key}>
            <CardContent>
              <Download size={22} />
              <h3>{def.title}</h3>
              <p>{def.desc}</p>
              <Button onClick={() => downloadExport(key)} disabled={!rowsFiltradas.length}>
                <Download size={16} /> Descargar CSV
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
