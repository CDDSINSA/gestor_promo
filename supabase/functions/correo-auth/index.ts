// Edge Function "correo-auth": envía los correos de Supabase Auth (recuperar contraseña,
// invitación, cambio de correo, enlace mágico, códigos) por Microsoft Graph desde el buzón
// de SINSA, en lugar del servidor de correo de Supabase.
//
// Se conecta en Supabase > Authentication > Hooks > "Send Email hook" (tipo HTTPS).
// Guía: docs/correo_auth_microsoft.md
//
// Secretos (Supabase > Edge Functions > Secrets). Los MS_* son los MISMOS de "enviar-correos":
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET  Registro de aplicación en Entra ID con Mail.Send (aplicación).
//   MS_SENDER                                     Buzón remitente, p. ej. notificaciones@sinsa.com.ni
//   SEND_EMAIL_HOOK_SECRET                        Lo genera Supabase al crear el hook ("v1,whsec_...").
// Opcionales:
//   CRON_TOKEN                   Habilita el modo de prueba (?prueba=correo) con el encabezado x-cron-token.
//   AUTH_EMAIL_ALLOWED_DOMAINS   Dominios permitidos separados por coma (por defecto sinsa.com.ni). "*" = todos.
//   AUTH_APP_NAME                Nombre que se muestra en el correo (por defecto "SINSA").
//   AUTH_APP_NAMES               Nombre por host de la app, si el proyecto lo comparten varias apps:
//                                "promo.sinsa.com.ni=Gestor Comercial,localhost:3005=Gestor Comercial (dev)"
//   AUTH_LINK_TTL_TEXT           Texto de vigencia del enlace (por defecto "1 hora").
// SUPABASE_URL lo inyecta Supabase automáticamente.
//
// Importante: con el hook activo, Supabase YA NO envía ningún correo de Auth por su cuenta.
// Si esta función responde error, el usuario ve ese error y el correo no sale.

const env = (name: string, fallback = "") => (Deno.env.get(name) ?? fallback).trim();

const SUPABASE_URL = env("SUPABASE_URL").replace(/\/$/, "");
const TENANT_ID = env("MS_TENANT_ID");
const CLIENT_ID = env("MS_CLIENT_ID");
const CLIENT_SECRET = env("MS_CLIENT_SECRET");
const SENDER = env("MS_SENDER");
const HOOK_SECRET = env("SEND_EMAIL_HOOK_SECRET");
const CRON_TOKEN = env("CRON_TOKEN");
const DEFAULT_APP_NAME = env("AUTH_APP_NAME", "SINSA");
const LINK_TTL_TEXT = env("AUTH_LINK_TTL_TEXT", "1 hora");
const ALLOWED_DOMAINS = env("AUTH_EMAIL_ALLOWED_DOMAINS", "sinsa.com.ni")
  .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
const APP_NAMES = new Map(
  env("AUTH_APP_NAMES").split(",").map((pair) => pair.split("=").map((s) => s.trim()))
    .filter(([host, name]) => host && name).map(([host, name]) => [host.toLowerCase(), name]),
);

const SIGNATURE_TOLERANCE_S = 5 * 60;

type EmailData = {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
  old_email?: string;
};
type HookUser = { email: string; new_email?: string; user_metadata?: Record<string, unknown> };

class HookError extends Error {
  constructor(message: string, readonly status = 500) { super(message); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Formato que Supabase Auth espera para mostrar el error al usuario.
function hookError(message: string, status = 500) {
  return json({ error: { http_code: status, message } }, status);
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
  if (ALLOWED_DOMAINS.includes("*") || ALLOWED_DOMAINS.length === 0) return true;
  const domain = email.split("@")[1]?.toLowerCase() || "";
  return ALLOWED_DOMAINS.includes(domain);
}

// ---------------------------------------------------------------------------
// Firma del hook (Standard Webhooks: HMAC-SHA256 de "id.timestamp.cuerpo")
// ---------------------------------------------------------------------------
function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: ArrayBuffer) {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary);
}

export async function verifyHookSignature(body: string, headers: Headers, secret: string, nowMs = Date.now()) {
  const id = headers.get("webhook-id") || "";
  const timestamp = headers.get("webhook-timestamp") || "";
  const signatures = headers.get("webhook-signature") || "";
  if (!id || !timestamp || !signatures) throw new HookError("Faltan encabezados de firma del hook.", 401);

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > SIGNATURE_TOLERANCE_S) {
    throw new HookError("La firma del hook está vencida.", 401);
  }

  const rawSecret = secret.replace(/^v1,/, "").replace(/^whsec_/, "");
  const key = await crypto.subtle.importKey("raw", base64ToBytes(rawSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = bytesToBase64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)));

  const valid = signatures.split(" ").some((part) => {
    const [version, signature] = part.split(",");
    return version === "v1" && safeEqual(signature || "", expected);
  });
  if (!valid) throw new HookError("Firma del hook inválida.", 401);
}

// ---------------------------------------------------------------------------
// Microsoft Graph (misma lógica que enviar-correos)
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
    console.error("Token Microsoft", response.status, data.error, data.error_description);
    throw new HookError("No se pudo enviar el correo (credenciales de Microsoft). Avise a TI.", 500);
  }
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function sendMail(to: string, subject: string, html: string) {
  const token = await getGraphToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(SENDER)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: false,
    }),
  });
  if (response.status === 202) return;
  if (response.status === 401) cachedToken = null;
  const detail = await response.text().catch(() => "");
  console.error("Graph sendMail", response.status, detail.slice(0, 600));
  if (response.status === 429) throw new HookError("Demasiados correos en poco tiempo. Intente de nuevo en unos minutos.", 429);
  throw new HookError(`No se pudo enviar el correo (Microsoft ${response.status}). Avise a TI.`, 500);
}

// ---------------------------------------------------------------------------
// Contenido
// ---------------------------------------------------------------------------
export function appNameFor(redirectTo: string, siteUrl: string) {
  for (const candidate of [redirectTo, siteUrl]) {
    try {
      const host = new URL(candidate).host.toLowerCase();
      if (APP_NAMES.has(host)) return APP_NAMES.get(host)!;
    } catch { /* URL vacía o inválida */ }
  }
  return DEFAULT_APP_NAME;
}

export function verifyLink(tokenHash: string, type: string, redirectTo: string) {
  const params = new URLSearchParams({ token: tokenHash, type });
  if (redirectTo) params.set("redirect_to", redirectTo);
  return `${SUPABASE_URL}/auth/v1/verify?${params.toString()}`;
}

// Invitación: el enlace va DIRECTO a la app (?token_hash=...&type=invite) y la app canjea el hash
// con verifyOtp. Así no depende del flujo PKCE/implicit (el /verify de Supabase devolvía
// #access_token, que el cliente PKCE rechaza y la app caía en el login) ni de que un escáner
// de correo (Safe Links) "abra" el enlace y gaste el token antes que el usuario.
export function appLink(baseUrl: string, tokenHash: string, type: string) {
  try {
    const url = new URL(baseUrl);
    url.hash = "";
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", type);
    return url.toString();
  } catch {
    return "";
  }
}

type Content = { subject: string; title: string; intro: string; button?: { label: string; url: string }; code?: string; note?: string };

export function buildContent(type: string, data: EmailData, link: (hash: string) => string, opts: { toNew?: boolean } = {}): Content | null {
  const ttl = `El enlace vence en ${LINK_TTL_TEXT} y solo se puede usar una vez.`;
  const ignore = "Si usted no lo solicitó, ignore este correo; su cuenta no cambia.";
  switch (type) {
    case "recovery":
      return {
        subject: "Restablecer su contraseña",
        title: "Restablecer contraseña",
        intro: "Recibimos una solicitud para cambiar la contraseña de su cuenta. Use el botón para crear una nueva.",
        button: { label: "Crear nueva contraseña", url: link(data.token_hash) },
        note: `${ttl} Ábralo en el mismo navegador donde lo solicitó. ${ignore}`,
      };
    case "invite":
      return {
        subject: "Invitación de acceso",
        title: "Le dieron acceso",
        intro: "Se creó una cuenta para usted. Use el botón para aceptar la invitación y definir su contraseña.",
        button: { label: "Aceptar invitación", url: link(data.token_hash) },
        note: ttl,
      };
    case "signup":
      return {
        subject: "Confirme su correo",
        title: "Confirme su correo",
        intro: "Confirme su dirección de correo para activar la cuenta.",
        button: { label: "Confirmar correo", url: link(data.token_hash) },
        note: `${ttl} ${ignore}`,
      };
    case "magiclink":
      return {
        subject: "Enlace para iniciar sesión",
        title: "Iniciar sesión",
        intro: "Use el botón para entrar sin contraseña.",
        button: { label: "Iniciar sesión", url: link(data.token_hash) },
        note: `${ttl} ${ignore}`,
      };
    case "email_change":
      return opts.toNew
        ? {
          subject: "Confirme su nuevo correo",
          title: "Confirme su nuevo correo",
          intro: "Se solicitó usar esta dirección en su cuenta. Confírmela con el botón.",
          button: { label: "Confirmar nuevo correo", url: link(data.token_hash) },
          note: `${ttl} ${ignore}`,
        }
        : {
          subject: "Confirme el cambio de correo",
          title: "Cambio de correo",
          intro: "Se solicitó cambiar el correo de su cuenta. Confirme desde esta dirección para continuar.",
          button: { label: "Confirmar cambio", url: link(data.token_hash_new || "") },
          note: `${ttl} ${ignore}`,
        };
    case "reauthentication":
    case "email":
      return {
        subject: "Su código de verificación",
        title: "Código de verificación",
        intro: "Use este código para continuar:",
        code: data.token,
        note: ignore,
      };
    case "password_changed_notification":
      return { subject: "Su contraseña cambió", title: "Contraseña actualizada", intro: "La contraseña de su cuenta se cambió.", note: "Si no fue usted, avise de inmediato a TI." };
    case "email_changed_notification":
      return { subject: "El correo de su cuenta cambió", title: "Correo actualizado", intro: "El correo de su cuenta se cambió.", note: "Si no fue usted, avise de inmediato a TI." };
    default:
      if (type.endsWith("_notification")) {
        return { subject: "Cambio de seguridad en su cuenta", title: "Cambio de seguridad", intro: "Se registró un cambio de seguridad en su cuenta.", note: "Si no fue usted, avise de inmediato a TI." };
      }
      return null;
  }
}

export function buildHtml(content: Content, appName: string) {
  const button = content.button?.url
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(content.button.url)}" style="background:#006b3f;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(content.button.label)}</a></p>`
    : "";
  const code = content.code
    ? `<p style="margin:16px 0 0;font-size:26px;letter-spacing:6px;font-weight:700;font-family:Consolas,monospace">${escapeHtml(content.code)}</p>`
    : "";
  const note = content.note ? `<p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.5">${escapeHtml(content.note)}</p>` : "";
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dbe7e1;border-radius:12px;overflow:hidden">
    <div style="background:#006b3f;color:#ffffff;padding:14px 20px;font-weight:600">${escapeHtml(appName)}</div>
    <div style="padding:20px">
      <h1 style="margin:0;font-size:18px;line-height:1.35">${escapeHtml(content.title)}</h1>
      <p style="margin:12px 0 0;font-size:14px;line-height:1.5">${escapeHtml(content.intro)}</p>
      ${button}
      ${code}
      ${note}
    </div>
    <div style="padding:12px 20px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px">Correo automático. No responda a este mensaje.</div>
  </div></body></html>`;
}

// Arma la lista de correos a enviar para un evento del hook.
export function planEmails(user: HookUser, data: EmailData) {
  const type = data.email_action_type;
  const appName = appNameFor(data.redirect_to, data.site_url);
  const appBase = data.redirect_to || data.site_url;
  const link = (hash: string) => (type === "invite" && appLink(appBase, hash, type)) || verifyLink(hash, type, data.redirect_to);
  const out: { to: string; subject: string; html: string }[] = [];
  const add = (to: string | undefined, content: Content | null) => {
    if (!to || !content) return;
    out.push({ to: to.toLowerCase(), subject: `${content.subject} · ${appName}`, html: buildHtml(content, appName) });
  };

  if (type === "email_change") {
    // Nombres invertidos por compatibilidad (ver docs de Supabase):
    // token_hash_new → correo ACTUAL; token_hash → correo NUEVO.
    if (data.token_hash_new) add(user.email, buildContent(type, data, link, { toNew: false }));
    if (data.token_hash) add(user.new_email || user.email, buildContent(type, data, link, { toNew: true }));
  } else {
    add(user.email, buildContent(type, data, link));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Servidor
// ---------------------------------------------------------------------------
async function handleHook(request: Request) {
  const body = await request.text();
  await verifyHookSignature(body, request.headers, HOOK_SECRET);
  const { user, email_data } = JSON.parse(body) as { user: HookUser; email_data: EmailData };
  const emails = planEmails(user, email_data);
  if (!emails.length) {
    console.warn("Tipo de correo sin plantilla:", email_data?.email_action_type);
    return json({});
  }
  for (const email of emails) {
    if (!isAllowedRecipient(email.to)) throw new HookError(`El dominio de ${email.to} no está permitido para recibir correos.`, 400);
  }
  for (const email of emails) await sendMail(email.to, email.subject, email.html);
  console.log("Correo de Auth enviado", email_data.email_action_type, emails.map((e) => e.to).join(", "));
  return json({});
}

async function handleTest(request: Request, to: string) {
  if (!CRON_TOKEN || !safeEqual(request.headers.get("x-cron-token") || "", CRON_TOKEN)) return json({ error: "No autorizado." }, 401);
  if (!isAllowedRecipient(to.toLowerCase())) return json({ error: `Dominio no permitido para la prueba: ${to}` }, 400);
  const url = new URL(request.url);
  const type = url.searchParams.get("tipo") || "recovery";
  const redirect = url.searchParams.get("redirect_to") || "";
  const [email] = planEmails({ email: to }, {
    token: "123456", token_hash: "enlace-de-prueba-no-valido", redirect_to: redirect, email_action_type: type, site_url: redirect,
  });
  if (!email) return json({ error: `Tipo sin plantilla: ${type}` }, 400);
  await sendMail(email.to, `[Prueba] ${email.subject}`, email.html);
  return json({ ok: true, prueba: to, tipo: type, remitente: SENDER });
}

export async function handler(request: Request) {
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  const isTest = new URL(request.url).searchParams.has("prueba");
  const required = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "MS_SENDER", ...(isTest ? [] : ["SEND_EMAIL_HOOK_SECRET"])];
  const missing = required.filter((name) => !env(name));
  if (missing.length) {
    console.error("Faltan secretos:", missing.join(", "));
    return hookError("El servicio de correo no está configurado. Avise a TI.", 500);
  }
  try {
    const testTo = new URL(request.url).searchParams.get("prueba");
    return testTo ? await handleTest(request, testTo) : await handleHook(request);
  } catch (error) {
    const status = error instanceof HookError ? error.status : 500;
    const message = error instanceof HookError ? error.message : "No se pudo enviar el correo.";
    if (!(error instanceof HookError)) console.error(error);
    return hookError(message, status);
  }
}

// CORREO_AUTH_NO_SERVE=1 solo lo usan las pruebas locales para importar el módulo sin abrir el servidor.
if (env("CORREO_AUTH_NO_SERVE") !== "1") Deno.serve(handler);
