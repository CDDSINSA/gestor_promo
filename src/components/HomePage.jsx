import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Bell,
  BellOff,
  CalendarDays,
  Download,
  History,
  LayoutDashboard,
  ListChecks,
  Plus,
  Save,
  Settings,
  Upload,
} from "lucide-react";
import { hasSupabaseConnection } from "../services/supabaseService";
import { classNames } from "../utils/common";

function Header({ title, subtitle }) {
  return <div className="header"><h1>{title}</h1><p>{subtitle}</p></div>;
}

function Button({ children, className = "", variant = "default", ...props }) {
  return <button className={classNames("btn", variant === "outline" ? "btn-outline" : "btn-primary", className)} {...props}>{children}</button>;
}

function Card({ children, className = "" }) { return <div className={classNames("card", className)}>{children}</div>; }
function CardContent({ children, className = "" }) { return <div className={className}>{children}</div>; }
function Metric({ title, value, icon: Icon }) { return <Card><CardContent className="metric"><div><p>{title}</p><strong>{value}</strong></div><div className="metric-icon"><Icon size={20}/></div></CardContent></Card>; }

export default function HomePage({ catalogos, rows = [], rowsCount, logsCount, setActive, setCatalogoActivo, onOpenAvances, onLoadExcel, onSaveExcel, onLoadDrive, onSaveDrive, driveConnection, driveStatus, isSyncing, fileInputRef }) {
  const catalogosVisibles = catalogos.filter((c) => String(c.estado).toLowerCase() !== "cerrado");
  const activos = catalogosVisibles.filter((c) => c.estado === "Activo").length;
  const driveReady = hasSupabaseConnection(driveConnection);
  const statusType = driveStatus?.type || (driveReady ? "ready" : "idle");
  const statusMessage = driveStatus?.message || (driveReady ? "Conexion lista para Supabase." : "Configure el usuario tecnico de Supabase.");
  const catalogStats = useMemo(() => {
    const stats = new Map(catalogosVisibles.map((cat) => [cat.id, { compradores: new Set(), divisiones: new Set(), skus: new Set() }]));
    const byKey = new Map();
    catalogosVisibles.forEach((cat) => [cat.id, cat.catalogo_id].filter(Boolean).forEach((key) => byKey.set(String(key), cat.id)));
    rows.forEach((row) => {
      const rowCatalogKey = row.actividad_id || row.actividadId || row.catalogo_id || row.catalogoId;
      const catalogId = byKey.get(String(rowCatalogKey || ""));
      if (!catalogId || !stats.has(catalogId)) return;
      const stat = stats.get(catalogId);
      if (row.comprador) stat.compradores.add(row.comprador);
      if (row.division) stat.divisiones.add(row.division);
      if (row.sku) stat.skus.add(row.sku);
    });
    return stats;
  }, [catalogosVisibles, rows]);

  return <div>
    <Header title="Inicio" subtitle="Panel general para administrar catalogos, promociones, cambios y exportaciones." />
    <div className="metrics">
      <Metric title="Catalogos activos" value={activos} icon={LayoutDashboard}/>
      <Metric title="Promos registradas" value={rowsCount} icon={ListChecks}/>
      <Metric title="Cambios recientes" value={logsCount} icon={History}/>
      <Metric title="Conexion Supabase" value={driveReady ? "ON" : "OFF"} icon={Bell}/>
    </div>
    <div className={classNames("sync-panel", statusType)}>
      <div>
        <strong>Supabase</strong>
        <span>{driveReady ? driveConnection.url : "Sin usuario tecnico configurado"}</span>
        <p>{statusMessage}</p>
      </div>
      <div className="toolbar-actions">
        <Button variant="outline" onClick={onLoadDrive} disabled={!driveReady || isSyncing}><Download size={16}/> Cargar Supabase</Button>
        <Button onClick={onSaveDrive} disabled={!driveReady || isSyncing}><Save size={16}/> Guardar Supabase</Button>
        {!driveReady && <Button variant="outline" onClick={() => setActive("ajustes")}><Settings size={16}/> Configurar</Button>}
      </div>
    </div>
    <div className="toolbar">
      <h2>Catalogos disponibles</h2>
      <div className="toolbar-actions">
        <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={onLoadExcel}/>
        <Button onClick={() => setActive("especial")}><Plus size={16}/> Nueva promocion especial</Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload size={16}/> Cargar Excel</Button>
        <Button variant="outline" onClick={onSaveExcel}><Save size={16}/> Exportar Excel</Button>
        <Button variant="outline" onClick={() => setActive("ajustes")}><Settings size={16}/> Ajustes</Button>
      </div>
    </div>
    <div className="catalog-grid">
      {catalogosVisibles.map((cat) => {
        const stats = catalogStats.get(cat.id) || { compradores: new Set(), divisiones: new Set(), skus: new Set() };
        return <motion.div key={cat.id} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
          <Card className="catalog-card">
            <div className={classNames("color-strip", cat.color)}></div>
            <CardContent>
              <div className="catalog-head">
                <div>
                  <h3>{cat.nombre}</h3>
                  <p className="catalog-note">{stats.compradores.size} compradores - {stats.divisiones.size} divisiones - {stats.skus.size} SKU</p>
                  <p className="catalog-meta-row"><span>{cat.canal}</span><span><CalendarDays size={14}/>{cat.vigencia}</span></p>
                </div>
                <div className="catalog-status">
                  <span className={cat.estado === "Activo" ? "pill green" : "pill"}>{cat.estado}</span>
                  <span className={cat.notificaciones ? "notification-dot active" : "notification-dot inactive"} title={cat.notificaciones ? "Notificaciones activas" : "Notificaciones inactivas"} aria-label={cat.notificaciones ? "Notificaciones activas" : "Notificaciones inactivas"}>
                    {cat.notificaciones ? <Bell size={15}/> : <BellOff size={15}/>}
                  </span>
                </div>
              </div>
              <div className="catalog-actions">
                <Button className="full" onClick={() => { setCatalogoActivo(cat); setActive("promos"); }}>Trabajar catalogo</Button>
                <Button className="full btn-avances" variant="outline" onClick={() => onOpenAvances?.(cat)}><ListChecks size={16}/> Avances</Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>;
      })}
    </div>
  </div>;
}
