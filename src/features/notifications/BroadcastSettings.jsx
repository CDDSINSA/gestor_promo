import React, { useRef, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { sendBroadcast } from "../../services/supabase/broadcasts";
import { BROADCAST_MESSAGE_LIMIT, BROADCAST_TITLE_LIMIT, createBroadcastRequestId, validateBroadcast } from "./broadcast";

export default function BroadcastSettings({ connection }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);
  const pending = useRef(null);
  const busy = useRef(false);
  const session = connection?.session || connection?.appSession || connection?.authSession;
  const connected = Boolean(session?.access_token);
  const submit = async (event) => {
    event.preventDefault();
    if (busy.current) return;
    const error = validateBroadcast(title, message);
    if (error) { setStatus({ type: "error", text: error }); return; }
    // Retrying identical content after an uncertain network response reuses its request ID.
    const content = JSON.stringify([title.trim(), message.trim()]);
    busy.current = true;
    setSending(true);
    setStatus(null);
    try {
      if (pending.current?.content !== content) pending.current = { content, id: createBroadcastRequestId() };
      const result = await sendBroadcast(connection, { title, message, requestId: pending.current.id });
      if (!Number.isInteger(result?.inserted) || result.inserted < 0) throw new Error("Respuesta de envío no válida. Puede reintentar el mismo mensaje sin duplicarlo.");
      setStatus({ type: result.inserted ? "success" : "warning", text: result.inserted
        ? `Mensaje enviado a ${result.inserted} usuario${result.inserted === 1 ? "" : "s"}.`
        : "No hay usuarios activos de Compras, Mercadeo o Ejecutor / Pricing para recibir el mensaje." });
      if (result.inserted) { setTitle(""); setMessage(""); }
      pending.current = null;
    } catch (error) {
      setStatus({ type: "error", text: `No se pudo confirmar el envío. ${error.message || "Intente nuevamente."}` });
    } finally {
      busy.current = false;
      setSending(false);
    }
  };
  return <Card className="settings-section-card"><CardContent className="broadcast-settings">
    <div className="broadcast-heading"><Megaphone size={22} aria-hidden="true"/><div><h2>Mensaje de difusión</h2><p>Comparta avisos con los usuarios activos de Compras, Mercadeo y Ejecutor / Pricing.</p></div></div>
    <p>Se recibe en la campana de notificaciones de la aplicación, incluso si el usuario se conecta después.</p>
    <form onSubmit={submit} className="broadcast-form">
      <label className="field"><span>Asunto</span><input required maxLength={BROADCAST_TITLE_LIMIT} value={title} onChange={(event) => { setTitle(event.target.value); setStatus(null); }} disabled={sending}/></label>
      <label className="field"><span>Mensaje</span><textarea required rows={5} maxLength={BROADCAST_MESSAGE_LIMIT} value={message} onChange={(event) => { setMessage(event.target.value); setStatus(null); }} disabled={sending} aria-describedby="broadcast-length"/><small id="broadcast-length">{message.length} / {BROADCAST_MESSAGE_LIMIT} caracteres</small></label>
      <div className="broadcast-preview"><small>Vista previa · Difusión administrativa</small><strong>{title.trim() || "Asunto del aviso"}</strong><p>{message.trim() || "Aquí aparecerá el mensaje que recibirán los usuarios."}</p></div>
      {!connected && <p role="status">Se requiere una sesión conectada para enviar mensajes.</p>}
      {status && <p className={`broadcast-status ${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.text}</p>}
      <Button type="submit" className="settings-btn-save" disabled={sending || !connected || !title.trim() || !message.trim()}><Send size={16}/>{sending ? "Enviando…" : "Enviar a todos los involucrados"}</Button>
    </form>
  </CardContent></Card>;
}
