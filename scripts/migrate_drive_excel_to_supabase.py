import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import pandas as pd


DEFAULT_SUPABASE_URL = "https://hanvbbezofcengyorooc.supabase.co"
DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_DBBFpGllQwN98skP71n-Dg_kXzmEMgS"


def clean(value):
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    if pd.isna(value):
        return ""
    return str(value).strip()


def none_if_empty(value):
    text = clean(value)
    return text or None


def bool_value(value, default=True):
    text = clean(value).upper()
    if not text:
        return default
    return text in {"TRUE", "SI", "SÍ", "1", "ACTIVO", "ACTIVA", "YES"}


def number_value(value, default=None):
    text = clean(value).replace("%", "").replace(",", ".")
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def ts_value(value, default=None):
    text = clean(value)
    if not text:
        return default
    text = text.replace("a. m.", "AM").replace("p. m.", "PM").replace("a.m.", "AM").replace("p.m.", "PM")
    parsed = pd.to_datetime(text, errors="coerce", dayfirst=True, utc=True)
    if pd.isna(parsed):
        return default
    return parsed.isoformat()


def date_value(value):
    timestamp = ts_value(value)
    return timestamp[:10] if timestamp else None


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def rows_from_sheet(path, sheet_name):
    frame = pd.read_excel(path, sheet_name=sheet_name, dtype=object).fillna("")
    frame = frame.dropna(how="all")
    return frame.to_dict(orient="records")


def key_by(rows, key):
    return {str(row.get(key)): row for row in rows if row.get(key)}


class SupabaseRest:
    def __init__(self, url, anon_key, email, password):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.email = email
        self.password = password
        self.access_token = None

    def request(self, method, path, body=None, token=None, extra_headers=None):
        headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {token or self.access_token or self.anon_key}",
            "Content-Type": "application/json",
        }
        headers.update(extra_headers or {})
        data = None if body is None else json.dumps(body).encode("utf-8")
        request = urllib.request.Request(f"{self.url}{path}", data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as error:
            raw = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} fallo: {error.code} {raw}") from error

    def login(self):
        if not self.email or not self.password:
            raise RuntimeError("Faltan SUPABASE_TECH_EMAIL y SUPABASE_TECH_PASSWORD.")
        payload = {"email": self.email, "password": self.password}
        result = self.request("POST", "/auth/v1/token?grant_type=password", payload, token=self.anon_key)
        self.access_token = result["access_token"]
        return result

    def role(self):
        result = self.request("POST", "/rest/v1/rpc/current_user_role", {})
        return result[0] if isinstance(result, list) else result

    def select(self, table, select="*", extra=None):
        params = {"select": select}
        if extra:
            params.update(extra)
        query = urllib.parse.urlencode(params)
        return self.request("GET", f"/rest/v1/{table}?{query}") or []

    def patch_by_id(self, table, row_id, row):
        query = urllib.parse.urlencode({"id": f"eq.{row_id}"})
        result = self.request("PATCH", f"/rest/v1/{table}?{query}", row, extra_headers={"Prefer": "return=representation"})
        return result[0] if isinstance(result, list) and result else result

    def upsert(self, table, rows, on_conflict=None, chunk_size=500):
        rows = [row for row in rows if row]
        if not rows:
            return []
        inserted = []
        for index in range(0, len(rows), chunk_size):
            chunk = rows[index:index + chunk_size]
            query = f"?{urllib.parse.urlencode({'on_conflict': on_conflict})}" if on_conflict else ""
            prefer = "return=representation"
            if on_conflict:
                prefer += ",resolution=merge-duplicates"
            result = self.request("POST", f"/rest/v1/{table}{query}", chunk, extra_headers={"Prefer": prefer})
            if isinstance(result, list):
                inserted.extend(result)
        return inserted


def build_payload(path):
    catalogos = rows_from_sheet(path, "CATALOGOS")
    actividades = rows_from_sheet(path, "ACTIVIDADES")
    compradores = rows_from_sheet(path, "COMPRADORES")
    responsables = rows_from_sheet(path, "RESPONSABLES_SOLICITUDES")
    jerarquias = rows_from_sheet(path, "JERARQUIA_CATEGORIAS")
    segmentos = rows_from_sheet(path, "SEGMENTOS_CLIENTES")
    promociones = rows_from_sheet(path, "PROMOCIONES")
    detalles = rows_from_sheet(path, "PROMOCIONES_DETALLE")
    comentarios = rows_from_sheet(path, "COMENTARIOS")
    logs = rows_from_sheet(path, "LOGS")
    notificaciones = rows_from_sheet(path, "NOTIFICACIONES")
    avances = rows_from_sheet(path, "AVANCES_CATALOGO")

    catalogos_by_id = {clean(row.get("catalogo_id")): row for row in catalogos}

    missing_promo_activities = sorted(
        {clean(row.get("actividad_id")) for row in promociones}
        - {clean(row.get("actividad_id")) for row in actividades}
    )
    missing_comment_activities = sorted(
        {clean(row.get("actividad_id")) for row in comentarios if clean(row.get("actividad_id"))}
        - {clean(row.get("actividad_id")) for row in actividades}
    )

    if missing_promo_activities or missing_comment_activities:
        raise RuntimeError(
            "Hay actividad_id sin ACTIVIDADES: "
            f"promociones={missing_promo_activities}, comentarios={missing_comment_activities}"
        )

    db_compradores = [
        {
            "comprador_id": none_if_empty(row.get("comprador_id")),
            "categoria_comprador": clean(row.get("categoria_comprador")) or "Senior",
            "comprador": clean(row.get("comprador")),
            "division": clean(row.get("division")),
            "correo": clean(row.get("correo")),
            "activo": bool_value(row.get("activo")),
            "senior_id": clean(row.get("senior_id")),
        }
        for row in compradores
        if clean(row.get("comprador"))
    ]

    db_responsables = [
        {
            "responsable_id": clean(row.get("responsable_id")),
            "nombre": clean(row.get("nombre")),
            "area": clean(row.get("area")),
            "correo": clean(row.get("correo")),
            "activo": bool_value(row.get("activo")),
        }
        for row in responsables
        if clean(row.get("responsable_id")) and clean(row.get("nombre"))
    ]

    db_jerarquias = [
        {
            "dep_id": clean(row.get("dep_id")),
            "dep_desc": clean(row.get("dep_desc")),
            "division": clean(row.get("division")),
            "activo": bool_value(row.get("activo")),
        }
        for row in jerarquias
        if clean(row.get("dep_id"))
    ]

    db_segmentos = [
        {
            "legacy_segmento_id": clean(row.get("segmento_id")),
            "nombre_segmento": clean(row.get("nombre_segmento")),
            "canal": clean(row.get("canal")),
            "activo": bool_value(row.get("activo")),
            "orden": int(number_value(row.get("orden"), 0) or 0),
        }
        for row in segmentos
        if clean(row.get("segmento_id")) and clean(row.get("nombre_segmento"))
    ]

    return {
        "catalogos": catalogos,
        "actividades": actividades,
        "catalogos_by_id": catalogos_by_id,
        "compradores": db_compradores,
        "responsables": db_responsables,
        "jerarquias": db_jerarquias,
        "segmentos": db_segmentos,
        "promociones": promociones,
        "detalles": detalles,
        "comentarios": comentarios,
        "logs": logs,
        "notificaciones": notificaciones,
        "avances": avances,
        "summary": {
            "compradores": len(db_compradores),
            "responsables_solicitudes": len(db_responsables),
            "jerarquia_categorias": len(db_jerarquias),
            "segmentos_clientes": len(db_segmentos),
            "campanas": len(actividades),
            "promociones": len(promociones),
            "promociones_detalle": len(detalles),
            "comentarios": len(comentarios),
            "logs": len(logs),
            "notificaciones": len(notificaciones),
            "avances_catalogo": len(avances),
        },
    }


def migrate(rest, payload):
    compradores = rest.upsert("compradores", payload["compradores"], "comprador")
    comprador_by_name = key_by(compradores, "comprador")

    campanas_payload = []
    for row in payload["actividades"]:
        actividad_id = clean(row.get("actividad_id"))
        catalogo = payload["catalogos_by_id"].get(actividad_id, {})
        solicitante = clean(row.get("solicitante") or row.get("comprador"))
        campanas_payload.append({
            "legacy_actividad_id": actividad_id,
            "tipo_actividad": clean(row.get("tipo_actividad")) or "CATALOGO",
            "nombre_actividad": clean(row.get("nombre_actividad")),
            "canal": clean(row.get("canal") or catalogo.get("canal")),
            "fecha_inicio": date_value(row.get("fecha_inicio") or catalogo.get("vigencia_inicio")),
            "fecha_fin": date_value(row.get("fecha_fin") or catalogo.get("vigencia_fin")),
            "solicitante_buyer_id": comprador_by_name.get(solicitante, {}).get("id"),
            "estado": clean(row.get("estado")) or "Borrador",
            "motivo_solicitud": clean(row.get("motivo_solicitud")),
            "color": clean(catalogo.get("color")) or "bg-emerald-700",
            "doc_id": clean(catalogo.get("doc_id")),
            "token_conexion": clean(catalogo.get("token_conexion")),
            "notificaciones": bool_value(catalogo.get("notificaciones"), False),
            "correos": clean(catalogo.get("correos")),
            "comprador": solicitante,
            "responsable": clean(row.get("responsable")),
            "recursos_ocupados": clean(row.get("recursos_ocupados")),
            "fecha_estado": ts_value(row.get("fecha_estado")),
            "fecha_nuevo": ts_value(row.get("fecha_nuevo")),
            "fecha_aprovado": ts_value(row.get("fecha_aprovado")),
            "fecha_entrabajo": ts_value(row.get("fecha_entrabajo")),
            "fecha_finalizado": ts_value(row.get("fecha_finalizado")),
            "fecha_asignado": ts_value(row.get("fecha_asignado")),
            "fecha_trabajando": ts_value(row.get("fecha_trabajando")),
            "fecha_resuelto": ts_value(row.get("fecha_resuelto")),
            "tiempo_nuevo_horas": number_value(row.get("tiempo_nuevo_horas"), 0),
            "tiempo_aprovado_horas": number_value(row.get("tiempo_aprovado_horas"), 0),
            "tiempo_entrabajo_horas": number_value(row.get("tiempo_entrabajo_horas"), 0),
            "tiempo_finalizado_horas": number_value(row.get("tiempo_finalizado_horas"), 0),
            "tiempo_asignado_horas": number_value(row.get("tiempo_asignado_horas"), 0),
            "tiempo_trabajando_horas": number_value(row.get("tiempo_trabajando_horas"), 0),
            "tiempo_resuelto_horas": number_value(row.get("tiempo_resuelto_horas"), 0),
            "tiempo_total_horas": number_value(row.get("tiempo_total_horas"), 0),
            "promo_ids": clean(row.get("promo_ids")),
            "oferta_ids": clean(row.get("oferta_ids")),
            "divisiones": clean(catalogo.get("divisiones")),
        })

    campanas = rest.upsert("campanas", campanas_payload, "legacy_actividad_id")
    campana_by_legacy = key_by(campanas, "legacy_actividad_id")

    rest.upsert("responsables_solicitudes", payload["responsables"], "responsable_id")
    rest.upsert("jerarquia_categorias", payload["jerarquias"], "dep_id")
    rest.upsert("segmentos_clientes", payload["segmentos"], "legacy_segmento_id")

    promociones_payload = []
    for row in payload["promociones"]:
        actividad_id = clean(row.get("actividad_id"))
        comprador = clean(row.get("comprador"))
        promociones_payload.append({
            "legacy_row_id": clean(row.get("row_id")),
            "campana_id": campana_by_legacy.get(actividad_id, {}).get("id"),
            "oferta_id": clean(row.get("oferta_id")),
            "buyer_id": comprador_by_name.get(comprador, {}).get("id"),
            "tipo_promo": clean(row.get("tipo_promo")),
            "grupo_oferta": clean(row.get("grupo_oferta")),
            "tipo_sku": clean(row.get("tipo_sku")) or "simple",
            "variante": clean(row.get("variante")),
            "sku": clean(row.get("sku")),
            "num_parte": clean(row.get("num_parte")),
            "descripcion": clean(row.get("descripcion")),
            "tipo_cantidad": clean(row.get("tipo_cantidad")) or "Exacta",
            "cantidad_minima": number_value(row.get("cantidad_minima"), 1),
            "precio_antes": number_value(row.get("precio_antes")),
            "precio_ahora": number_value(row.get("precio_ahora")),
            "descuento": clean(row.get("descuento")),
            "comentario_comprador": clean(row.get("comentario_comprador")),
            "aplica_segmento": "SI" if clean(row.get("aplica_segmento")).upper() == "SI" else "NO",
            "segmento_cliente": clean(row.get("segmento_cliente")),
            "alcance_tipo": clean(row.get("alcance_tipo")),
            "alcance_valor": clean(row.get("alcance_valor")),
            "estado_registro": clean(row.get("estado_registro")) or "BORRADOR",
            "created_at": ts_value(row.get("fecha_creacion"), now_iso()),
            "updated_at": ts_value(row.get("fecha_modificacion"), now_iso()),
            "dep_id": clean(row.get("dep_id")),
            "ultima_modificacion_por": clean(row.get("ultima_modificacion_por")),
        })

    promociones = rest.upsert("promociones", promociones_payload, "legacy_row_id")
    promo_by_legacy = key_by(promociones, "legacy_row_id")

    detalle_payload = []
    for row in payload["detalles"]:
        promocion_id = promo_by_legacy.get(clean(row.get("row_id")), {}).get("id")
        if promocion_id and clean(row.get("campo")):
            detalle_payload.append({
                "promocion_id": promocion_id,
                "campo": clean(row.get("campo")),
                "valor": clean(row.get("valor")),
            })
    rest.upsert("promociones_detalle", detalle_payload, "promocion_id,campo")

    comentario_payload = []
    for row in payload["comentarios"]:
        scope = clean(row.get("alcance_comentario")) or ("LINEA" if clean(row.get("row_id")) else "ACTIVIDAD")
        promo = promo_by_legacy.get(clean(row.get("row_id")), {})
        campana_id = campana_by_legacy.get(clean(row.get("actividad_id")), {}).get("id") or promo.get("campana_id")
        comentario_payload.append({
            "legacy_comentario_id": clean(row.get("comentario_id")),
            "promocion_id": promo.get("id") if scope == "LINEA" else None,
            "campana_id": campana_id,
            "legacy_row_id": clean(row.get("row_id")) if scope == "LINEA" else "",
            "alcance_comentario": scope,
            "prioridad": clean(row.get("prioridad")) or "MEDIA",
            "usuario": clean(row.get("usuario")),
            "tipo_usuario": clean(row.get("tipo_usuario")),
            "comentario": clean(row.get("comentario")),
            "estado": clean(row.get("estado")).upper() or "ABIERTO",
            "fecha": ts_value(row.get("fecha"), now_iso()),
            "fecha_resolucion": ts_value(row.get("fecha_resolucion")),
        })
    comentario_payload = [row for row in comentario_payload if row["comentario"] and (row["promocion_id"] or row["campana_id"])]
    existing_comments = rest.select("comentarios", "id,legacy_comentario_id")
    comment_by_legacy = key_by(existing_comments, "legacy_comentario_id")
    new_comments = []
    for row in comentario_payload:
        existing = comment_by_legacy.get(row["legacy_comentario_id"])
        if existing and existing.get("id"):
            rest.patch_by_id("comentarios", existing["id"], row)
        else:
            new_comments.append(row)
    rest.upsert("comentarios", new_comments)

    notif_payload = []
    for row in payload["notificaciones"]:
        campana_id = campana_by_legacy.get(clean(row.get("actividad_id") or row.get("catalogo_id")), {}).get("id")
        if campana_id and clean(row.get("correo")):
            notif_payload.append({
                "campana_id": campana_id,
                "correo": clean(row.get("correo")),
                "tipo": "CAMBIO_PROMOCION",
                "activo": bool_value(row.get("activo")),
            })
    rest.upsert("notificaciones", notif_payload, "campana_id,correo,tipo")

    avance_payload = []
    for row in payload["avances"]:
        comprador = clean(row.get("comprador"))
        catalogo_id = clean(row.get("catalogo_id"))
        avance_payload.append({
            "avance_id": clean(row.get("avance_id")),
            "campana_id": campana_by_legacy.get(catalogo_id, {}).get("id"),
            "catalogo_id": catalogo_id,
            "catalogo": clean(row.get("catalogo")),
            "comprador_id": clean(row.get("comprador_id")),
            "buyer_id": comprador_by_name.get(comprador, {}).get("id"),
            "comprador": comprador,
            "division": clean(row.get("division")),
            "estado": clean(row.get("estado")) or "Pendiente",
            "fecha_estado": ts_value(row.get("fecha_estado"), now_iso()),
            "usuario": clean(row.get("usuario")),
        })
    rest.upsert("avances_catalogo", [row for row in avance_payload if row["avance_id"]], "avance_id")

    existing_logs = rest.select("logs", "request_id")
    existing_request_ids = {clean(row.get("request_id")) for row in existing_logs}
    log_payload = []
    for row in payload["logs"]:
        request_id = clean(row.get("log_id"))
        if request_id in existing_request_ids:
            continue
        promo = promo_by_legacy.get(clean(row.get("row_id")), {})
        log_payload.append({
            "usuario": clean(row.get("usuario")),
            "entidad": "PROMOCIONES",
            "campana_id": promo.get("campana_id") or campana_by_legacy.get(clean(row.get("catalogo")), {}).get("id"),
            "promocion_id": promo.get("id"),
            "accion": clean(row.get("accion")),
            "campo": clean(row.get("campo")),
            "valor_anterior": clean(row.get("valor_anterior")),
            "valor_nuevo": clean(row.get("valor_nuevo")),
            "request_id": request_id,
            "created_at": ts_value(row.get("fecha"), now_iso()),
            "fecha_cierre": ts_value(row.get("fecha_cierre")),
        })
    rest.upsert("logs", [row for row in log_payload if row["accion"]])

    return {
        "compradores": len(compradores),
        "campanas": len(campanas),
        "promociones": len(promociones),
        "comentarios": len(comentario_payload),
        "logs_insertados": len(log_payload),
    }


def main():
    parser = argparse.ArgumentParser(description="Migra el export de Google Sheets MVP a Supabase.")
    parser.add_argument("--file", default=r"C:\Users\arlen.aguilar\Downloads\export_google_sheet_mvp.xlsx")
    parser.add_argument("--execute", action="store_true", help="Escribe datos en Supabase. Sin esta bandera solo valida.")
    args = parser.parse_args()

    payload = build_payload(args.file)
    print(json.dumps({"archivo": args.file, "conteos_origen": payload["summary"]}, ensure_ascii=False, indent=2))

    if not args.execute:
        print("Validacion local completada. Use --execute con credenciales de usuario tecnico para cargar Supabase.")
        return 0

    rest = SupabaseRest(
        os.getenv("SUPABASE_URL", DEFAULT_SUPABASE_URL),
        os.getenv("SUPABASE_ANON_KEY", DEFAULT_SUPABASE_ANON_KEY),
        os.getenv("SUPABASE_TECH_EMAIL", ""),
        os.getenv("SUPABASE_TECH_PASSWORD", ""),
    )
    rest.login()
    role = rest.role()
    if role != "ADMIN":
        raise RuntimeError(f"El usuario tecnico debe tener rol ADMIN en usuarios_app. Rol actual: {role!r}")

    started = time.time()
    result = migrate(rest, payload)
    result["segundos"] = round(time.time() - started, 2)
    print(json.dumps({"resultado": result}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
