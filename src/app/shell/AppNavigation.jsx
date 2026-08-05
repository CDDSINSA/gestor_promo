import React, { useState } from "react";
import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  MoreHorizontal,
} from "lucide-react";
import sinsaLogo from "../../assets/sinsa.webp";
import { MOBILE_NAV_ITEMS, SIDEBAR_NAV_ITEMS } from "../../constants";
import { ROLE_LABELS } from "../../constants/permissions";
import { usePermissions } from "../../hooks/usePermissions";
import { classNames } from "../../utils/common";

export function AppShell({ active, setActive, currentUser, currentRole, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const { can } = usePermissions();
  const ToggleIcon = collapsed ? ChevronsRight : ChevronsLeft;
  const visibleItems = SIDEBAR_NAV_ITEMS.filter((item) => can(item.permission));
  const roleLabel = ROLE_LABELS[currentRole] || currentRole || "Sesion activa";
  return <aside className={classNames("sidebar", collapsed && "collapsed")}><div className="sidebar-head"><div className="brand"><img className="brand-logo" src={sinsaLogo} alt="SINSA" /><div className="brand-copy"><div>Gestor de Promociones</div></div></div><button type="button" className="sidebar-toggle" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expandir menu" : "Replegar menu"} aria-label={collapsed ? "Expandir menu" : "Replegar menu"}><ToggleIcon size={18}/></button></div><nav>{visibleItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={active === item.id ? "active" : ""} title={collapsed ? item.label : undefined}><Icon size={18}/><span className="nav-label">{item.label}</span></button>; })}</nav><div className="sidebar-session"><span title={`${currentUser} - ${roleLabel}`}>{currentUser || roleLabel}</span><button type="button" onClick={onLogout} title="Salir"><LogOut size={18}/><span className="nav-label">Salir</span></button></div></aside>;
}

export function MobileNav({ active, setActive }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { can } = usePermissions();
  const visibleItems = MOBILE_NAV_ITEMS.filter((item) => can(item.permission));
  const primaryItems = visibleItems.slice(0, 4);
  const overflowItems = visibleItems.slice(4);
  const visibleNavItems = overflowItems.length ? primaryItems : visibleItems;
  const activeInOverflow = overflowItems.some((item) => item.id === active);
  const selectItem = (id) => {
    setActive(id);
    setMoreOpen(false);
  };
  return <div className="mobile-nav-wrap">{moreOpen && overflowItems.length > 0 && <div className="mobile-more-menu">{overflowItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => selectItem(item.id)} className={active === item.id ? "active" : ""}><Icon size={16}/><span>{item.label}</span></button>; })}</div>}<div className="mobile-nav">{visibleNavItems.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => selectItem(item.id)} className={active === item.id ? "active" : ""}><Icon size={18}/><span>{item.label}</span></button>; })}{overflowItems.length > 0 && <button type="button" onClick={() => setMoreOpen((value) => !value)} className={activeInOverflow || moreOpen ? "active" : ""}><MoreHorizontal size={18}/><span>Más</span></button>}</div></div>;
}
