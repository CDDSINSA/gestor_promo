// Edge Function "enviar-correos": envía por Microsoft Graph los correos encolados en
// public.notificaciones_correo (docs/supabase_notificaciones_correo.sql).
//
// Secretos requeridos (Supabase > Edge Functions > Secrets). Nunca en el frontend ni en .env.local:
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  Registro de aplicación en Entra ID con permiso Mail.Send (aplicación).
//   MS_SENDER                                     Buzón remitente, p. ej. notificaciones@sinsa.com.ni
//   CRON_TOKEN                                    Valor largo y aleatorio; el mismo que el secreto de Vault correo_funcion_token.
// Opcionales:
//   APP_URL                 Enlace al botón "Abrir la app" del correo.
//   EMAIL_ALLOWED_DOMAINS   Dominios permitidos separados por coma (por defecto sinsa.com.ni).
//   EMAIL_REDIRECT_TO       Modo prueba: todos los correos van a esta dirección en lugar del destinatario real.
//   EMAIL_SUBJECT_PREFIX    Prefijo del asunto (por defecto "[Gestor Comercial]").
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.
//
// Llamadas:
//   POST /enviar-correos                      Procesa un lote de la cola (lo hace pg_cron).
//   POST /enviar-correos?prueba=correo@x.com  Envía un correo de prueba para validar credenciales.
// Ambas requieren el encabezado x-cron-token.

const env = (name: string, fallback = "") => (Deno.env.get(name) ?? fallback).trim();

const SUPABASE_URL = env("SUPABASE_URL");
const SERVICE_ROLE_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
const TENANT_ID = env("MS_TENANT_ID");
const CLIENT_ID = env("MS_CLIENT_ID");
const CLIENT_SECRET = env("MS_CLIENT_SECRET");
const SENDER = env("MS_SENDER");
const CRON_TOKEN = env("CRON_TOKEN");
const APP_URL = env("APP_URL");
const REDIRECT_TO = env("EMAIL_REDIRECT_TO");
const SUBJECT_PREFIX = env("EMAIL_SUBJECT_PREFIX", "[Gestor Comercial]");
const ALLOWED_DOMAINS = env("EMAIL_ALLOWED_DOMAINS", "sinsa.com.ni")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);

const BATCH_SIZE = 25;
const MAX_RUN_MS = 45_000;

type QueuedEmail = {
  id: string;
  destinatario_email: string;
  destinatario_nombre: string;
  tipo_evento: string;
  titulo: string;
  mensaje: string;
  actor_nombre: string;
};

// retry: el correo vuelve a la cola. stop: problema de credenciales o permisos; se detiene el lote
// porque fallarían todos (los correos se reintentan solos cuando se corrija la configuración).
class GraphError extends Error {
  constructor(message: string, readonly retry: boolean, readonly stop = false) { super(message); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(value: string) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function isAllowedRecipient(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return ALLOWED_DOMAINS.length === 0 || ALLOWED_DOMAINS.includes(domain);
}

// ---------------------------------------------------------------------------
// Microsoft Graph
// ---------------------------------------------------------------------------
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getGraphToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.value;
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(TENANT_ID)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    // Credenciales inválidas o secreto vencido.
    throw new GraphError(`No se obtuvo token de Microsoft (${response.status}): ${data.error_description || data.error || "sin detalle"}`, true, true);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

function buildHtml(item: QueuedEmail) {
  const button = APP_URL
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(APP_URL)}" style="background:#006b3f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">Abrir el Gestor de Promociones</a></p>`
    : "";
  const actor = item.actor_nombre && item.actor_nombre !== "Sistema"
    ? `<p style="margin:12px 0 0;color:#64748b;font-size:13px">Acción de ${escapeHtml(item.actor_nombre)}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe7e1;border-radius:12px;overflow:hidden">
    <div style="background:#006b3f;color:#ffffff;padding:14px 20px;font-weight:600">Gestor Comercial · SINSA</div>
    <div style="padding:20px">
      <p style="margin:0 0 4px;color:#64748b;font-size:13px">Hola ${escapeHtml(item.destinatario_nombre || "")}</p>
      <h1 style="margin:0;font-size:18px;line-height:1.35">${escapeHtml(item.titulo)}</h1>
      ${item.mensaje ? `<p style="margin:12px 0 0;font-size:14px;line-height:1.5;white-space:pre-line">${escapeHtml(item.mensaje)}</p>` : ""}
      ${actor}
      ${button}
    </div>
    <div style="padding:12px 20px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px">Correo automático. No responda a este mensaje.</div>
  </div></body></html>`;
}

async function sendMail(to: string, toName: string, subject: string, html: string) {
  const token = await getGraphToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to, name: toName || undefined } }],
      },
      saveToSentItems: false,
    }),
  });
  if (response.status === 202) return;
  const detail = await response.text().catch(() => "");
  if (response.status === 401) cachedToken = null;
  // 429 (límite) y 5xx son temporales. 401/403/404: permisos o buzón remitente (detiene el lote).
  // 400: el correo en sí es inválido (p. ej. dirección mal escrita); no se reintenta.
  const stop = [401, 403, 404].includes(response.status);
  const retry = stop || response.status === 429 || response.status >= 500;
  throw new GraphError(`Graph ${response.status}: ${detail.slice(0, 600)}`, retry, stop);
}

// ---------------------------------------------------------------------------
// Cola en Supabase (RPC con service_role, solo en el servidor)
// ---------------------------------------------------------------------------
async function rpc(name: string, body: Record<string, unknown>) {
  const schema = Deno.env.get("SUPABASE_SCHEMA") || "g_comercial";
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      "Content-Profile": schema,
      "Accept-Profile": schema,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`RPC ${name} (${response.status}): ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function processQueue() {
  const started = Date.now();
  const summary = { enviados: 0, reintentos: 0, errores: 0, omitidos: 0, lotes: 0 };
  while (Date.now() - started < MAX_RUN_MS) {
    const batch: QueuedEmail[] = await rpc("claim_email_batch", { p_limit: BATCH_SIZE }) || [];
    if (!batch.length) break;
    summary.lotes += 1;
    for (const item of batch) {
      const realTo = item.destinatario_email.toLowerCase();
      if (!REDIRECT_TO && !isAllowedRecipient(realTo)) {
        await rpc("mark_email_result", { p_id: item.id, p_ok: false, p_error: `Dominio no permitido: ${realTo}`, p_retry: false });
        summary.omitidos += 1;
        continue;
      }
      const to = REDIRECT_TO || realTo;
      const subject = `${SUBJECT_PREFIX} ${item.titulo}${REDIRECT_TO ? ` (prueba para ${realTo})` : ""}`.trim();
      try {
        await sendMail(to, item.destinatario_nombre, subject, buildHtml(item));
        await rpc("mark_email_result", { p_id: item.id, p_ok: true });
        summary.enviados += 1;
      } catch (error) {
        const retry = error instanceof GraphError ? error.retry : true;
        await rpc("mark_email_result", { p_id: item.id, p_ok: false, p_error: String((error as Error).message || error), p_retry: retry });
        if (retry) summary.reintentos += 1; else summary.errores += 1;
        if (error instanceof GraphError && error.stop) {
          // Devuelve a la cola el resto del lote sin esperar los 10 minutos de bloqueo.
          for (const pending of batch.slice(batch.indexOf(item) + 1)) {
            await rpc("mark_email_result", { p_id: pending.id, p_ok: false, p_error: "Lote detenido: " + error.message, p_retry: true });
          }
          return { ...summary, detenido: error.message };
        }
      }
    }
    if (batch.length < BATCH_SIZE) break;
  }
  return summary;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!safeEqual(request.headers.get("x-cron-token") || "", CRON_TOKEN)) return json({ error: "No autorizado." }, 401);

  const missing = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_SENDER", "CRON_TOKEN"].filter((name) => !env(name));
  if (missing.length) return json({ error: `Faltan secretos: ${missing.join(", ")}` }, 500);

  const testTo = new URL(request.url).searchParams.get("prueba");
  try {
    if (testTo) {
      if (!isAllowedRecipient(testTo.toLowerCase())) return json({ error: `Dominio no permitido para la prueba: ${testTo}` }, 400);
      await sendMail(testTo, "", `${SUBJECT_PREFIX} Correo de prueba`, buildHtml({
        id: "prueba", destinatario_email: testTo, destinatario_nombre: "", tipo_evento: "PRUEBA",
        titulo: "Correo de prueba", mensaje: "Si recibió este mensaje, la conexión con Microsoft 365 funciona.", actor_nombre: "",
      }));
      return json({ ok: true, prueba: testTo, remitente: SENDER });
    }
    return json({ ok: true, ...(await processQueue()) });
  } catch (error) {
    return json({ ok: false, error: String((error as Error).message || error) }, 500);
  }
});
