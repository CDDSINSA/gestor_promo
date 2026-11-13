// Pruebas locales de correo-auth (Deno; Microsoft y Supabase simulados).
// Ejecutar desde la raíz del repo:
//   deno test -A supabase/functions/correo-auth/index.test.ts
import { Webhook } from "npm:standardwebhooks@1.0.0";

const SECRET_B64 = btoa("clave-de-prueba-de-32-bytes-1234");
Deno.env.set("CORREO_AUTH_NO_SERVE", "1");
Deno.env.set("SUPABASE_URL", "https://ref.supabase.co");
Deno.env.set("AUTH_APP_NAMES", "promo.sinsa.com.ni=Gestor Comercial");
for (const [k, v] of Object.entries({ MS_TENANT_ID: "t", MS_CLIENT_ID: "c", MS_CLIENT_SECRET: "s", MS_SENDER: "notificaciones@sinsa.com.ni", CRON_TOKEN: "tok" })) Deno.env.set(k, v);
Deno.env.set("SEND_EMAIL_HOOK_SECRET", `v1,whsec_${SECRET_B64}`);

// Microsoft simulado: graphStatus controla la respuesta de sendMail.
let graphStatus = 202;
const sent: { url: string; body: any }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("login.microsoftonline.com")) return new Response(JSON.stringify({ access_token: "AT", expires_in: 3600 }), { status: 200 });
  if (url.includes("graph.microsoft.com")) {
    sent.push({ url, body: JSON.parse(String(init?.body)) });
    return new Response(graphStatus === 202 ? null : "{\"error\":{\"code\":\"ErrorAccessDenied\"}}", { status: graphStatus });
  }
  return realFetch(input, init);
}) as typeof fetch;

const mod = await import("./index.ts");

function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

function signed(body: string, offsetS = 0) {
  const wh = new Webhook(SECRET_B64);
  const id = "msg_1";
  const ts = new Date(Date.now() + offsetS * 1000);
  const sig = wh.sign(id, ts, body);
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(Math.floor(ts.getTime() / 1000)), "webhook-signature": sig });
}

Deno.test("firma válida de la librería oficial se acepta", async () => {
  const body = JSON.stringify({ a: 1 });
  await mod.verifyHookSignature(body, signed(body), `v1,whsec_${SECRET_B64}`);
});

Deno.test("firma alterada, cuerpo alterado o vencida se rechazan", async () => {
  const body = JSON.stringify({ a: 1 });
  for (const [b, h] of [[body + " ", signed(body)], [body, signed(body, -600)]] as const) {
    let failed = false;
    try { await mod.verifyHookSignature(b, h, `v1,whsec_${SECRET_B64}`); } catch { failed = true; }
    assert(failed, "debió rechazar");
  }
  let failed = false;
  try { await mod.verifyHookSignature(body, new Headers(), `v1,whsec_${SECRET_B64}`); } catch { failed = true; }
  assert(failed, "sin encabezados debió rechazar");
});

Deno.test("recovery: enlace verify con PKCE, redirect y nombre de app", () => {
  const [mail, ...rest] = mod.planEmails({ email: "Ana@SINSA.com.ni" }, {
    token: "111222", token_hash: "pkce_abc", redirect_to: "https://promo.sinsa.com.ni/", email_action_type: "recovery", site_url: "",
  });
  assert(rest.length === 0, "un solo correo");
  assert(mail.to === "ana@sinsa.com.ni", "destinatario en minúsculas");
  assert(mail.subject === "Restablecer su contraseña · Gestor Comercial", mail.subject);
  const href = mail.html.match(/href="([^"]+)"/)![1].replaceAll("&amp;", "&");
  const url = new URL(href);
  assert(url.origin + url.pathname === "https://ref.supabase.co/auth/v1/verify", href);
  assert(url.searchParams.get("token") === "pkce_abc" && url.searchParams.get("type") === "recovery", href);
  assert(url.searchParams.get("redirect_to") === "https://promo.sinsa.com.ni/", href);
  assert(!mail.html.includes("111222"), "no debe mostrar código en recovery");
});

Deno.test("email_change seguro: dos correos con los hash cruzados", () => {
  const mails = mod.planEmails({ email: "viejo@sinsa.com.ni", new_email: "nuevo@sinsa.com.ni" }, {
    token: "1", token_hash: "HASH_PARA_NUEVO", token_new: "2", token_hash_new: "HASH_PARA_ACTUAL",
    redirect_to: "", email_action_type: "email_change", site_url: "",
  });
  assert(mails.length === 2, "dos correos");
  const actual = mails.find((m) => m.to === "viejo@sinsa.com.ni")!;
  const nuevo = mails.find((m) => m.to === "nuevo@sinsa.com.ni")!;
  assert(actual.html.includes("HASH_PARA_ACTUAL") && nuevo.html.includes("HASH_PARA_NUEVO"), "hash cruzados");
});

Deno.test("reauthentication muestra el código; tipo desconocido no envía; HTML escapado", () => {
  const [m] = mod.planEmails({ email: "a@sinsa.com.ni" }, { token: "654321", token_hash: "", redirect_to: "", email_action_type: "reauthentication", site_url: "" });
  assert(m.html.includes("654321"), "código visible");
  assert(mod.planEmails({ email: "a@sinsa.com.ni" }, { token: "", token_hash: "", redirect_to: "", email_action_type: "otro", site_url: "" }).length === 0, "sin plantilla");
  const [x] = mod.planEmails({ email: "a@sinsa.com.ni" }, { token: "", token_hash: "h", redirect_to: 'https://x/"><script>', email_action_type: "invite", site_url: "" });
  assert(!x.html.includes("<script>"), "escapado");
  assert(x.subject.endsWith("· SINSA"), "nombre por defecto");
});

function hookRequest(payload: unknown) {
  const body = JSON.stringify(payload);
  return new Request("https://ref.supabase.co/functions/v1/correo-auth", { method: "POST", body, headers: signed(body) });
}
const recoveryPayload = (email: string) => ({ user: { email }, email_data: { token: "1", token_hash: "pkce_x", redirect_to: "https://promo.sinsa.com.ni/", email_action_type: "recovery", site_url: "" } });

Deno.test("hook firmado envía por Graph y responde {}", async () => {
  graphStatus = 202; sent.length = 0;
  const res = await mod.handler(hookRequest(recoveryPayload("ana@sinsa.com.ni")));
  assert(res.status === 200, `status ${res.status}`);
  assert(JSON.stringify(await res.json()) === "{}", "cuerpo vacío");
  assert(sent.length === 1 && sent[0].url.includes("notificaciones%40sinsa.com.ni"), "remitente");
  assert(sent[0].body.message.toRecipients[0].emailAddress.address === "ana@sinsa.com.ni", "destinatario");
});

Deno.test("Graph 403 devuelve error con formato del hook", async () => {
  graphStatus = 403; sent.length = 0;
  const res = await mod.handler(hookRequest(recoveryPayload("ana@sinsa.com.ni")));
  const data = await res.json();
  assert(res.status === 500 && data.error?.http_code === 500 && /Microsoft 403/.test(data.error.message), JSON.stringify(data));
  graphStatus = 202;
});

Deno.test("dominio externo se rechaza sin enviar; sin firma = 401", async () => {
  sent.length = 0;
  const res = await mod.handler(hookRequest(recoveryPayload("x@gmail.com")));
  assert(res.status === 400 && sent.length === 0, `status ${res.status}`);
  const unsigned = await mod.handler(new Request("https://ref.supabase.co/functions/v1/correo-auth", { method: "POST", body: "{}" }));
  assert(unsigned.status === 401, `status ${unsigned.status}`);
});

Deno.test("modo prueba exige x-cron-token y envía con [Prueba]", async () => {
  sent.length = 0;
  const bad = await mod.handler(new Request("https://ref.supabase.co/functions/v1/correo-auth?prueba=ana@sinsa.com.ni", { method: "POST" }));
  assert(bad.status === 401, "sin token");
  const ok = await mod.handler(new Request("https://ref.supabase.co/functions/v1/correo-auth?prueba=ana@sinsa.com.ni&tipo=invite", { method: "POST", headers: { "x-cron-token": "tok" } }));
  assert(ok.status === 200 && sent[0].body.message.subject.startsWith("[Prueba] Invitación"), sent[0]?.body.message.subject);
});

Deno.test("invitación enlaza directo a la app con token_hash (no al /verify de Supabase)", () => {
  const data = { token: "1", token_hash: "inv_hash", redirect_to: "", email_action_type: "invite", site_url: "https://promo.sinsa.com.ni" };
  const [m] = mod.planEmails({ email: "a@sinsa.com.ni" }, data);
  assert(m.html.includes("https://promo.sinsa.com.ni/?token_hash=inv_hash&amp;type=invite"), "enlace directo a la app");
  assert(!m.html.includes("/auth/v1/verify"), "sin /verify");
});
