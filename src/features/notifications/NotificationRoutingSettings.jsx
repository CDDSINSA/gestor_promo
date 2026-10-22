import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Mail, Plus, RefreshCw, Save, Search, Trash2, Users } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { ROLE_LABELS, ROLES, normalizeRole } from "../../constants/permissions";
import {
  deleteNotificationGroup,
  loadNotificationRouting,
  saveNotificationGroup,
  saveNotificationSubscriptions,
} from "../../services/supabase/notificationRouting";
import { classNames } from "../../utils/common";

const ROLE_OPTIONS = [ROLES.OPER, ROLES.ADMIN, ROLES.MARK, ROLES.BUYER, ROLES.DESIGNER, ROLES.AUD];
const NEW_GROUP = "__nuevo__";

function buildDrafts(data) {
  return Object.fromEntries(data.eventos.map((evento) => {
    const subs = data.suscripciones.filter((s) => s.tipo_evento === evento.tipo_evento);
    return [evento.tipo_evento, {
      roles: subs.filter((s) => s.destino_tipo === "ROL").map((s) => normalizeRole(s.destino_rol)),
      grupos: subs.filter((s) => s.destino_tipo === "GRUPO").map((s) => s.grupo_id),
      dueno: subs.some((s) => s.destino_tipo === "DUENO"),
      correo: Object.prototype.hasOwnProperty.call(data.correo, evento.tipo_evento) ? Boolean(data.correo[evento.tipo_evento]) : null,
    }];
  }));
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function userLabel(user) {
  return user?.nombre || user?.email || "Usuario";
}

// Ajustes > Notificaciones: a quién llega cada aviso, por rol, grupo o comprador dueño.
export default function NotificationRoutingSettings({ connection }) {
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [dirty, setDirty] = useState({});
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupDraft, setGroupDraft] = useState(null);
  const [memberQuery, setMemberQuery] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const next = await loadNotificationRouting(connection);
      setData(next);
      setDrafts(buildDrafts(next));
      setDirty({});
      setStatus(null);
      return next;
    } catch (error) {
      const missing = /get_notification_routing|function|404/i.test(error.message || "");
      setStatus({ type: "error", text: missing
        ? "Falta instalar docs/supabase_notificaciones_grupos.sql en Supabase."
        : error.message || "No se pudo cargar la configuración." });
      return null;
    } finally {
      setBusy(false);
    }
  }, [connection]);

  useEffect(() => { load(); }, [load]);

  const usersById = useMemo(() => Object.fromEntries((data?.usuarios || []).map((u) => [u.id, u])), [data]);
  const activeUsers = useMemo(() => (data?.usuarios || []).filter((u) => u.activo !== false), [data]);
  const groupsById = useMemo(() => Object.fromEntries((data?.grupos || []).map((g) => [g.id, g])), [data]);
  const emailAvailable = Boolean(data && Object.keys(data.correo || {}).length);

  const recipientsFor = (draft) => {
    const ids = new Set();
    activeUsers.forEach((user) => {
      if (draft.roles.includes(normalizeRole(user.rol))) ids.add(user.id);
    });
    draft.grupos.forEach((groupId) => {
      const group = groupsById[groupId];
      if (group?.activo === false) return;
      (group?.miembros || []).forEach((id) => { if (usersById[id]?.activo !== false) ids.add(id); });
    });
    return [...ids].map((id) => usersById[id]).filter(Boolean).sort((a, b) => userLabel(a).localeCompare(userLabel(b)));
  };

  const updateDraft = (tipo, changes) => {
    setDrafts((current) => ({ ...current, [tipo]: { ...current[tipo], ...changes } }));
    setDirty((current) => ({ ...current, [tipo]: true }));
    setStatus(null);
  };

  const saveEvent = async (evento) => {
    const draft = drafts[evento.tipo_evento];
    setBusy(true);
    try {
      await saveNotificationSubscriptions(connection, {
        tipoEvento: evento.tipo_evento, roles: draft.roles, grupos: draft.grupos, dueno: draft.dueno, correo: draft.correo,
      });
      await load();
      setStatus({ type: "success", text: `Destinatarios de «${evento.etiqueta}» guardados.` });
    } catch (error) {
      setStatus({ type: "error", text: error.message || "No se pudo guardar." });
      setBusy(false);
    }
  };

  const selectGroup = (groupId) => {
    setSelectedGroupId(groupId);
    setMemberQuery("");
    const group = groupsById[groupId];
    setGroupDraft(groupId === NEW_GROUP
      ? { id: null, nombre: "", descripcion: "", activo: true, miembros: [] }
      : group ? { ...group, miembros: [...(group.miembros || [])] } : null);
  };

  const saveGroup = async () => {
    if (!groupDraft?.nombre?.trim()) {
      setStatus({ type: "error", text: "El grupo necesita un nombre." });
      return;
    }
    setBusy(true);
    try {
      const id = await saveNotificationGroup(connection, groupDraft);
      const next = await load();
      const savedId = typeof id === "string" ? id : groupDraft.id;
      const saved = next?.grupos.find((g) => g.id === savedId);
      setSelectedGroupId(saved?.id || "");
      setGroupDraft(saved ? { ...saved, miembros: [...(saved.miembros || [])] } : null);
      setStatus({ type: "success", text: `Grupo «${groupDraft.nombre.trim()}» guardado.` });
    } catch (error) {
      setStatus({ type: "error", text: error.message || "No se pudo guardar el grupo." });
      setBusy(false);
    }
  };

  const removeGroup = async () => {
    if (!groupDraft?.id) return;
    const confirmed = window.confirm(`¿Eliminar el grupo «${groupDraft.nombre}»?\n\nLos eventos dejarán de enviarle avisos a sus miembros.`);
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteNotificationGroup(connection, groupDraft.id);
      setSelectedGroupId("");
      setGroupDraft(null);
      await load();
      setStatus({ type: "success", text: "Grupo eliminado." });
    } catch (error) {
      setStatus({ type: "error", text: error.message || "No se pudo eliminar el grupo." });
      setBusy(false);
    }
  };

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return activeUsers.filter((user) => !q
      || userLabel(user).toLowerCase().includes(q)
      || String(user.email || "").toLowerCase().includes(q));
  }, [activeUsers, memberQuery]);

  if (!data) {
    return <Card className="settings-section-card"><CardContent className="notif-routing">
      <div className="notif-routing-heading"><BellRing size={22} aria-hidden="true"/><div><h2>Destinatarios de avisos</h2><p>Cargando configuración...</p></div></div>
      {status && <p className={`broadcast-status ${status.type}`} role="alert">{status.text}</p>}
      {status && <Button variant="outline" onClick={load} disabled={busy}><RefreshCw size={16}/> Reintentar</Button>}
    </CardContent></Card>;
  }

  return <div className="notif-routing-stack">
    {status && <p className={`broadcast-status ${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.text}</p>}

    <Card className="settings-section-card"><CardContent className="notif-routing">
      <div className="notif-routing-heading">
        <BellRing size={22} aria-hidden="true"/>
        <div>
          <h2>Destinatarios por evento</h2>
          <p>Elija qué roles y grupos reciben cada aviso. El correo se toma del perfil de cada usuario; no se escriben direcciones a mano.</p>
        </div>
      </div>

      {data.eventos.map((evento) => {
        const draft = drafts[evento.tipo_evento];
        if (!draft) return null;
        const recipients = recipientsFor(draft);
        return <section key={evento.tipo_evento} className={classNames("notif-event", dirty[evento.tipo_evento] && "is-dirty")}>
          <header>
            <div>
              <strong>{evento.etiqueta}</strong>
              <span>{evento.descripcion}</span>
            </div>
            <Button className="settings-btn-save" onClick={() => saveEvent(evento)} disabled={busy || !dirty[evento.tipo_evento]}>
              <Save size={15}/> Guardar
            </Button>
          </header>

          <div className="notif-event-row">
            <span className="notif-event-label">Roles</span>
            <div className="notif-chip-list">
              {ROLE_OPTIONS.map((role) => (
                <label key={role} className={classNames("notif-chip", draft.roles.includes(role) && "selected")}>
                  <input type="checkbox" checked={draft.roles.includes(role)} onChange={() => updateDraft(evento.tipo_evento, { roles: toggleValue(draft.roles, role) })}/>
                  {ROLE_LABELS[role] || role}
                </label>
              ))}
            </div>
          </div>

          <div className="notif-event-row">
            <span className="notif-event-label">Grupos</span>
            <div className="notif-chip-list">
              {data.grupos.length ? data.grupos.map((group) => (
                <label key={group.id} className={classNames("notif-chip", draft.grupos.includes(group.id) && "selected", group.activo === false && "inactive")}>
                  <input type="checkbox" checked={draft.grupos.includes(group.id)} onChange={() => updateDraft(evento.tipo_evento, { grupos: toggleValue(draft.grupos, group.id) })}/>
                  {group.nombre} <small>({(group.miembros || []).length})</small>
                </label>
              )) : <span className="notif-muted">No hay grupos. Créelos abajo.</span>}
            </div>
          </div>

          <div className="notif-event-row">
            <span className="notif-event-label">Otros</span>
            <div className="notif-chip-list">
              {evento.admite_dueno && (
                <label className={classNames("notif-chip", draft.dueno && "selected")}>
                  <input type="checkbox" checked={draft.dueno} onChange={() => updateDraft(evento.tipo_evento, { dueno: !draft.dueno })}/>
                  Comprador dueño de la solicitud
                </label>
              )}
              {emailAvailable && (
                <label className={classNames("notif-chip", draft.correo && "selected")}>
                  <input type="checkbox" checked={Boolean(draft.correo)} onChange={() => updateDraft(evento.tipo_evento, { correo: !draft.correo })}/>
                  <Mail size={13} aria-hidden="true"/> También por correo
                </label>
              )}
            </div>
          </div>

          <p className="notif-preview">
            <Users size={14} aria-hidden="true"/>
            {recipients.length || draft.dueno
              ? <>Llega a: {recipients.map(userLabel).join(", ") || "—"}{draft.dueno ? " + el comprador dueño" : ""}.</>
              : "Nadie recibirá este aviso."}
          </p>
        </section>;
      })}
      {!emailAvailable && <p className="notif-muted">El envío por correo no está instalado (docs/supabase_notificaciones_correo.sql); los avisos llegan solo a la campana.</p>}
    </CardContent></Card>

    <Card className="settings-section-card"><CardContent className="notif-routing">
      <div className="notif-routing-heading">
        <Users size={22} aria-hidden="true"/>
        <div>
          <h2>Grupos de notificación</h2>
          <p>Agrupe personas que deben recibir ciertos avisos sin cambiar su rol ni sus permisos.</p>
        </div>
      </div>

      <div className="notif-groups">
        <div className="notif-group-list" role="list">
          {data.grupos.map((group) => (
            <button key={group.id} type="button" role="listitem"
              className={classNames("notif-group-item", selectedGroupId === group.id && "selected", group.activo === false && "inactive")}
              onClick={() => selectGroup(group.id)}>
              <strong>{group.nombre}</strong>
              <span>{(group.miembros || []).length} miembro{(group.miembros || []).length === 1 ? "" : "s"}{group.activo === false ? " · inactivo" : ""}</span>
            </button>
          ))}
          <Button variant="outline" className="settings-btn-add" onClick={() => selectGroup(NEW_GROUP)} disabled={busy}>
            <Plus size={15}/> Nuevo grupo
          </Button>
        </div>

        {groupDraft ? <div className="notif-group-editor">
          <label className="field"><span>Nombre</span>
            <input value={groupDraft.nombre} maxLength={80} onChange={(e) => setGroupDraft({ ...groupDraft, nombre: e.target.value })}/>
          </label>
          <label className="field"><span>Descripción</span>
            <input value={groupDraft.descripcion || ""} maxLength={200} onChange={(e) => setGroupDraft({ ...groupDraft, descripcion: e.target.value })}/>
          </label>
          <label className="notif-inline-check">
            <input type="checkbox" checked={groupDraft.activo !== false} onChange={(e) => setGroupDraft({ ...groupDraft, activo: e.target.checked })}/>
            Grupo activo
          </label>

          <div className="notif-members">
            <div className="notif-members-head">
              <strong>Miembros ({groupDraft.miembros.length})</strong>
              <label className="notif-search"><Search size={14} aria-hidden="true"/>
                <input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Buscar usuario..." aria-label="Buscar usuario"/>
              </label>
            </div>
            <div className="notif-member-list">
              {filteredMembers.map((user) => (
                <label key={user.id} className="notif-member">
                  <input type="checkbox" checked={groupDraft.miembros.includes(user.id)}
                    onChange={() => setGroupDraft({ ...groupDraft, miembros: toggleValue(groupDraft.miembros, user.id) })}/>
                  <span><strong>{userLabel(user)}</strong><small>{ROLE_LABELS[normalizeRole(user.rol)] || user.rol} · {user.email}</small></span>
                </label>
              ))}
              {!filteredMembers.length && <span className="notif-muted">Sin resultados.</span>}
            </div>
          </div>

          <div className="notif-group-actions">
            {groupDraft.id && <Button variant="outline" onClick={removeGroup} disabled={busy}><Trash2 size={15}/> Eliminar</Button>}
            <Button className="settings-btn-save" onClick={saveGroup} disabled={busy}><Save size={15}/> Guardar grupo</Button>
          </div>
        </div> : <p className="notif-muted notif-group-empty">Seleccione un grupo para ver o editar sus miembros.</p>}
      </div>
    </CardContent></Card>
  </div>;
}
