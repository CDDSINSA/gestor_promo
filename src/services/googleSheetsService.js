export const PROMO_SPREADSHEET_ID = "1QuT13pajfbLx_90oTZEosB3O7G3mpwuk_soOPqyOCms";

const STORAGE_KEY = "sinsaPromo.driveConnection";
const REQUEST_TIMEOUT_MS = 45000;

function getEnvValue(key) {
  return import.meta.env?.[key] || "";
}

export function getDefaultDriveConnection() {
  return {
    webAppUrl: getEnvValue("VITE_PROMO_APPS_SCRIPT_URL"),
    token: getEnvValue("VITE_PROMO_API_TOKEN"),
    spreadsheetId: PROMO_SPREADSHEET_ID,
  };
}

export function loadStoredDriveConnection() {
  const defaults = getDefaultDriveConnection();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw), spreadsheetId: PROMO_SPREADSHEET_ID };
  } catch {
    return defaults;
  }
}

export function saveStoredDriveConnection(connection) {
  const nextConnection = {
    webAppUrl: String(connection?.webAppUrl || "").trim(),
    token: String(connection?.token || "").trim(),
    spreadsheetId: PROMO_SPREADSHEET_ID,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConnection));
  return nextConnection;
}

export function hasDriveConnection(connection) {
  return Boolean(String(connection?.webAppUrl || "").trim());
}

function assertConnection(connection) {
  const webAppUrl = String(connection?.webAppUrl || "").trim();
  if (!webAppUrl) throw new Error("Configure la URL de Apps Script en Ajustes.");
  if (webAppUrl.includes("/dev")) throw new Error("Use la URL publicada que termina en /exec, no la URL /dev de prueba.");
  return webAppUrl;
}

function createRequestId() {
  return `promo-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function createHiddenInput(name, value) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  return input;
}

function cleanupNode(node) {
  if (node?.parentNode) node.parentNode.removeChild(node);
}

function buildQueryUrl(webAppUrl, params) {
  const url = new URL(webAppUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url.toString();
}

function handleAppsScriptResult(result) {
  if (!result || result.ok === false) {
    throw new Error(result?.error || "No se pudo completar la operacion en Google Sheets.");
  }
  return result.data;
}

function requestAppsScriptJsonp(connection, action, payload = {}) {
  const webAppUrl = assertConnection(connection);
  const requestId = createRequestId();
  const callbackName = `__promoDriveCallback_${requestId.replace(/[^a-zA-Z0-9_]/g, "_")}`;

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let timeoutId;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete window[callbackName];
      cleanupNode(script);
    };

    window[callbackName] = (result) => {
      cleanup();
      try {
        resolve(handleAppsScriptResult(result));
      } catch (error) {
        reject(error);
      }
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script no respondio la prueba JSONP. Revise que la aplicacion web este publicada como /exec y que el acceso no requiera inicio de sesion."));
    }, REQUEST_TIMEOUT_MS);

    script.onerror = () => {
      cleanup();
      reject(new Error("No se pudo cargar Apps Script. Revise la URL /exec y los permisos de la implementacion web."));
    };

    script.src = buildQueryUrl(webAppUrl, {
      action,
      callback: callbackName,
      requestId,
      token: String(connection?.token || "").trim(),
      ...payload,
    });

    document.body.appendChild(script);
  });
}

function hasSaveMarker(catalog, requestId) {
  return Boolean((catalog?.logs || []).some((log) => String(log.valor_anterior || "") === requestId));
}

function requestAppsScriptForm(connection, action, payload = {}) {
  const webAppUrl = assertConnection(connection);
  const requestId = createRequestId();
  const requestPayload = { ...payload };

  if ((action === "saveCatalog" || action === "saveSettings") && requestPayload.data) {
    requestPayload.data = { ...requestPayload.data, sync_request_id: requestId };
  }

  const message = {
    action,
    token: String(connection?.token || "").trim(),
    transport: "iframe",
    requestId,
    ...requestPayload,
  };

  return new Promise((resolve, reject) => {
    const iframeName = `apps-script-${requestId}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    let timeoutId;

    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      cleanupNode(form);
      cleanupNode(iframe);
    };

    const verifySave = async () => {
      try {
        const catalog = await requestAppsScriptJsonp(connection, "getCatalog");
        if (hasSaveMarker(catalog, requestId)) {
          resolve(catalog);
          return;
        }
        reject(new Error("Apps Script respondio, pero no se encontro el registro de este guardado en LOGS."));
      } catch (error) {
        reject(error);
      }
    };

    const onMessage = (event) => {
      const result = event.data;
      if (!result || result.requestId !== requestId) return;
      cleanup();
      try {
        resolve(handleAppsScriptResult(result));
      } catch (error) {
        reject(error);
      }
    };

    timeoutId = window.setTimeout(() => {
      cleanup();
      if (action === "saveCatalog" || action === "saveSettings") {
        verifySave();
        return;
      }
      reject(new Error("No hubo respuesta de Apps Script. Use Probar conexion para verificar permisos y URL /exec."));
    }, REQUEST_TIMEOUT_MS);

    iframe.name = iframeName;
    iframe.title = "Conexion Google Sheets";
    iframe.style.display = "none";

    form.method = "POST";
    form.action = webAppUrl;
    form.target = iframeName;
    form.style.display = "none";
    form.appendChild(createHiddenInput("payload", JSON.stringify(message)));

    window.addEventListener("message", onMessage);
    document.body.appendChild(iframe);
    document.body.appendChild(form);
    form.submit();
  });
}

export function pingDriveConnection(connection) {
  return requestAppsScriptJsonp(connection, "ping");
}

export function setupDriveWorkbook(connection) {
  return requestAppsScriptJsonp(connection, "setupWorkbook");
}

export function loadCatalogFromDrive(connection) {
  return requestAppsScriptJsonp(connection, "getCatalog");
}

export function saveCatalogToDrive(connection, data) {
  return requestAppsScriptForm(connection, "saveCatalog", { data });
}

export function saveSettingsToDrive(connection, data) {
  return requestAppsScriptForm(connection, "saveSettings", { data });
}

export function rebuildDriveViews(connection) {
  return requestAppsScriptJsonp(connection, "rebuildViews");
}
