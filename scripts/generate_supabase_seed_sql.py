import argparse
from pathlib import Path

import pandas as pd

from migrate_drive_excel_to_supabase import bool_value, clean, date_value, none_if_empty, number_value, ts_value


TECH_EMAIL = "poter9109@gmail.com"


def sql_literal(value):
  if value is None:
    return "null"
  text = str(value)
  return "'" + text.replace("'", "''") + "'"


def sql_bool(value):
  return "true" if bool_value(value) else "false"


def sql_num(value, default=None):
  number = number_value(value, default)
  return "null" if number is None else str(number)


def sql_ts(value):
  timestamp = ts_value(value)
  return "null" if not timestamp else sql_literal(timestamp)


def sql_date(value):
  date = date_value(value)
  return "null" if not date else sql_literal(date)


def rows_from_sheet(path, sheet_name):
  frame = pd.read_excel(path, sheet_name=sheet_name, dtype=object).fillna("")
  return frame.dropna(how="all").to_dict(orient="records")


def values_block(rows):
  return ",\n".join("  (" + ", ".join(row) + ")" for row in rows)


def generate_sql(path):
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

  sql = [
    "-- Migracion inicial Drive/Google Sheets -> Supabase",
    "-- Generado desde export_google_sheet_mvp.xlsx",
    "-- Ejecutar en Supabase SQL Editor despues de crear el usuario tecnico en Auth.",
    "begin;",
    "",
    "-- Usuario tecnico MVP",
    "insert into public.usuarios_app (auth_user_id, nombre, email, rol, activo)",
    f"select id, 'Usuario Tecnico MVP', {sql_literal(TECH_EMAIL)}, 'ADMIN', true",
    "from auth.users",
    f"where email = {sql_literal(TECH_EMAIL)}",
    "on conflict (email) do update set",
    "  auth_user_id = excluded.auth_user_id,",
    "  nombre = excluded.nombre,",
    "  rol = excluded.rol,",
    "  activo = excluded.activo;",
    "",
  ]

  comprador_values = [
    [
      sql_literal(clean(row.get("comprador_id"))),
      sql_literal(clean(row.get("categoria_comprador")) or "Senior"),
      sql_literal(clean(row.get("comprador"))),
      sql_literal(clean(row.get("division"))),
      sql_literal(clean(row.get("correo"))),
      sql_bool(row.get("activo")),
      sql_literal(clean(row.get("senior_id"))),
    ]
    for row in compradores
    if clean(row.get("comprador"))
  ]
  sql += [
    "insert into public.compradores (comprador_id, categoria_comprador, comprador, division, correo, activo, senior_id)",
    "values",
    values_block(comprador_values),
    "on conflict (comprador) do update set",
    "  comprador_id = excluded.comprador_id,",
    "  categoria_comprador = excluded.categoria_comprador,",
    "  division = excluded.division,",
    "  correo = excluded.correo,",
    "  activo = excluded.activo,",
    "  senior_id = excluded.senior_id;",
    "",
  ]

  responsable_values = [
    [
      sql_literal(clean(row.get("responsable_id"))),
      sql_literal(clean(row.get("nombre"))),
      sql_literal(clean(row.get("area"))),
      sql_literal(clean(row.get("correo"))),
      sql_bool(row.get("activo")),
    ]
    for row in responsables
    if clean(row.get("responsable_id"))
  ]
  sql += [
    "insert into public.responsables_solicitudes (responsable_id, nombre, area, correo, activo)",
    "values",
    values_block(responsable_values),
    "on conflict (responsable_id) do update set",
    "  nombre = excluded.nombre,",
    "  area = excluded.area,",
    "  correo = excluded.correo,",
    "  activo = excluded.activo;",
    "",
  ]

  jerarquia_values = [
    [
      sql_literal(clean(row.get("dep_id"))),
      sql_literal(clean(row.get("dep_desc"))),
      sql_literal(clean(row.get("division"))),
      sql_bool(row.get("activo")),
    ]
    for row in jerarquias
    if clean(row.get("dep_id"))
  ]
  sql += [
    "insert into public.jerarquia_categorias (dep_id, dep_desc, division, activo)",
    "values",
    values_block(jerarquia_values),
    "on conflict (dep_id) do update set",
    "  dep_desc = excluded.dep_desc,",
    "  division = excluded.division,",
    "  activo = excluded.activo;",
    "",
  ]

  segmento_values = [
    [
      sql_literal(clean(row.get("segmento_id"))),
      sql_literal(clean(row.get("canal"))),
      sql_literal(clean(row.get("nombre_segmento"))),
      sql_bool(row.get("activo")),
      sql_num(row.get("orden"), 0),
    ]
    for row in segmentos
    if clean(row.get("segmento_id"))
  ]
  sql += [
    "insert into public.segmentos_clientes (legacy_segmento_id, canal, nombre_segmento, activo, orden)",
    "values",
    values_block(segmento_values),
    "on conflict (legacy_segmento_id) do update set",
    "  canal = excluded.canal,",
    "  nombre_segmento = excluded.nombre_segmento,",
    "  activo = excluded.activo,",
    "  orden = excluded.orden;",
    "",
  ]

  campana_values = []
  for row in actividades:
    actividad_id = clean(row.get("actividad_id"))
    catalogo = catalogos_by_id.get(actividad_id, {})
    campana_values.append([
      sql_literal(actividad_id),
      sql_literal(clean(row.get("tipo_actividad")) or "CATALOGO"),
      sql_literal(clean(row.get("nombre_actividad"))),
      sql_literal(clean(row.get("canal")) or clean(catalogo.get("canal"))),
      sql_date(row.get("fecha_inicio") or catalogo.get("vigencia_inicio")),
      sql_date(row.get("fecha_fin") or catalogo.get("vigencia_fin")),
      sql_literal(clean(row.get("solicitante") or row.get("comprador"))),
      sql_literal(clean(row.get("estado")) or "Borrador"),
      sql_literal(clean(row.get("motivo_solicitud"))),
      sql_literal(clean(catalogo.get("color")) or "bg-emerald-700"),
      sql_literal(clean(catalogo.get("doc_id"))),
      sql_literal(clean(catalogo.get("token_conexion"))),
      sql_bool(catalogo.get("notificaciones")),
      sql_literal(clean(catalogo.get("correos"))),
      sql_literal(clean(row.get("responsable"))),
      sql_literal(clean(row.get("recursos_ocupados"))),
      sql_ts(row.get("fecha_estado")),
      sql_ts(row.get("fecha_nuevo")),
      sql_ts(row.get("fecha_aprovado")),
      sql_ts(row.get("fecha_entrabajo")),
      sql_ts(row.get("fecha_finalizado")),
      sql_ts(row.get("fecha_asignado")),
      sql_ts(row.get("fecha_trabajando")),
      sql_ts(row.get("fecha_resuelto")),
      sql_num(row.get("tiempo_nuevo_horas"), 0),
      sql_num(row.get("tiempo_aprovado_horas"), 0),
      sql_num(row.get("tiempo_entrabajo_horas"), 0),
      sql_num(row.get("tiempo_finalizado_horas"), 0),
      sql_num(row.get("tiempo_asignado_horas"), 0),
      sql_num(row.get("tiempo_trabajando_horas"), 0),
      sql_num(row.get("tiempo_resuelto_horas"), 0),
      sql_num(row.get("tiempo_total_horas"), 0),
      sql_literal(clean(row.get("promo_ids"))),
      sql_literal(clean(row.get("oferta_ids"))),
      sql_literal(clean(catalogo.get("divisiones"))),
    ])

  sql += [
    "insert into public.campanas (",
    "  legacy_actividad_id, tipo_actividad, nombre_actividad, canal, fecha_inicio, fecha_fin,",
    "  comprador, estado, motivo_solicitud, color, doc_id, token_conexion, notificaciones, correos,",
    "  responsable, recursos_ocupados, fecha_estado, fecha_nuevo, fecha_aprovado, fecha_entrabajo,",
    "  fecha_finalizado, fecha_asignado, fecha_trabajando, fecha_resuelto, tiempo_nuevo_horas,",
    "  tiempo_aprovado_horas, tiempo_entrabajo_horas, tiempo_finalizado_horas, tiempo_asignado_horas,",
    "  tiempo_trabajando_horas, tiempo_resuelto_horas, tiempo_total_horas, promo_ids, oferta_ids, divisiones",
    ")",
    "values",
    values_block(campana_values),
    "on conflict (legacy_actividad_id) do update set",
    "  tipo_actividad = excluded.tipo_actividad, nombre_actividad = excluded.nombre_actividad, canal = excluded.canal,",
    "  fecha_inicio = excluded.fecha_inicio, fecha_fin = excluded.fecha_fin, comprador = excluded.comprador,",
    "  estado = excluded.estado, motivo_solicitud = excluded.motivo_solicitud, color = excluded.color,",
    "  doc_id = excluded.doc_id, token_conexion = excluded.token_conexion, notificaciones = excluded.notificaciones,",
    "  correos = excluded.correos, responsable = excluded.responsable, recursos_ocupados = excluded.recursos_ocupados,",
    "  fecha_estado = excluded.fecha_estado, fecha_nuevo = excluded.fecha_nuevo, fecha_aprovado = excluded.fecha_aprovado,",
    "  fecha_entrabajo = excluded.fecha_entrabajo, fecha_finalizado = excluded.fecha_finalizado,",
    "  fecha_asignado = excluded.fecha_asignado, fecha_trabajando = excluded.fecha_trabajando,",
    "  fecha_resuelto = excluded.fecha_resuelto, tiempo_nuevo_horas = excluded.tiempo_nuevo_horas,",
    "  tiempo_aprovado_horas = excluded.tiempo_aprovado_horas, tiempo_entrabajo_horas = excluded.tiempo_entrabajo_horas,",
    "  tiempo_finalizado_horas = excluded.tiempo_finalizado_horas, tiempo_asignado_horas = excluded.tiempo_asignado_horas,",
    "  tiempo_trabajando_horas = excluded.tiempo_trabajando_horas, tiempo_resuelto_horas = excluded.tiempo_resuelto_horas,",
    "  tiempo_total_horas = excluded.tiempo_total_horas, promo_ids = excluded.promo_ids, oferta_ids = excluded.oferta_ids,",
    "  divisiones = excluded.divisiones;",
    "",
  ]

  promo_values = []
  for row in promociones:
    promo_values.append([
      sql_literal(clean(row.get("row_id"))),
      sql_literal(clean(row.get("actividad_id"))),
      sql_literal(clean(row.get("comprador"))),
      sql_literal(clean(row.get("oferta_id"))),
      sql_literal(clean(row.get("tipo_promo"))),
      sql_literal(clean(row.get("grupo_oferta"))),
      sql_literal(clean(row.get("tipo_sku")) or "simple"),
      sql_literal(clean(row.get("variante"))),
      sql_literal(clean(row.get("sku"))),
      sql_literal(clean(row.get("num_parte"))),
      sql_literal(clean(row.get("descripcion"))),
      sql_literal(clean(row.get("tipo_cantidad")) or "Exacta"),
      sql_num(row.get("cantidad_minima"), 1),
      sql_num(row.get("precio_antes")),
      sql_num(row.get("precio_ahora")),
      sql_literal(clean(row.get("descuento"))),
      sql_literal(clean(row.get("comentario_comprador"))),
      sql_literal("SI" if clean(row.get("aplica_segmento")).upper() == "SI" else "NO"),
      sql_literal(clean(row.get("segmento_cliente"))),
      sql_literal(clean(row.get("alcance_tipo"))),
      sql_literal(clean(row.get("alcance_valor"))),
      sql_literal(clean(row.get("estado_registro")) or "BORRADOR"),
      sql_ts(row.get("fecha_creacion")),
      sql_ts(row.get("fecha_modificacion")),
      sql_literal(clean(row.get("dep_id"))),
      sql_literal(clean(row.get("ultima_modificacion_por"))),
    ])

  sql += [
    "with src (legacy_row_id, actividad_id, comprador, oferta_id, tipo_promo, grupo_oferta, tipo_sku, variante, sku, num_parte, descripcion, tipo_cantidad, cantidad_minima, precio_antes, precio_ahora, descuento, comentario_comprador, aplica_segmento, segmento_cliente, alcance_tipo, alcance_valor, estado_registro, created_at, updated_at, dep_id, ultima_modificacion_por) as (",
    "values",
    values_block(promo_values),
    ")",
    "insert into public.promociones (legacy_row_id, campana_id, buyer_id, oferta_id, tipo_promo, grupo_oferta, tipo_sku, variante, sku, num_parte, descripcion, tipo_cantidad, cantidad_minima, precio_antes, precio_ahora, descuento, comentario_comprador, aplica_segmento, segmento_cliente, alcance_tipo, alcance_valor, estado_registro, created_at, updated_at, dep_id, ultima_modificacion_por)",
    "select src.legacy_row_id, c.id, b.id, src.oferta_id, src.tipo_promo, src.grupo_oferta, src.tipo_sku, src.variante, src.sku, src.num_parte, src.descripcion, src.tipo_cantidad, src.cantidad_minima, src.precio_antes, src.precio_ahora, src.descuento, src.comentario_comprador, src.aplica_segmento, src.segmento_cliente, src.alcance_tipo, src.alcance_valor, src.estado_registro, coalesce(src.created_at::timestamptz, now()), coalesce(src.updated_at::timestamptz, now()), src.dep_id, src.ultima_modificacion_por",
    "from src",
    "join public.campanas c on c.legacy_actividad_id = src.actividad_id",
    "join public.compradores b on b.comprador = src.comprador",
    "on conflict (legacy_row_id) do update set",
    "  campana_id = excluded.campana_id, buyer_id = excluded.buyer_id, oferta_id = excluded.oferta_id,",
    "  tipo_promo = excluded.tipo_promo, grupo_oferta = excluded.grupo_oferta, tipo_sku = excluded.tipo_sku,",
    "  variante = excluded.variante, sku = excluded.sku, num_parte = excluded.num_parte, descripcion = excluded.descripcion,",
    "  tipo_cantidad = excluded.tipo_cantidad, cantidad_minima = excluded.cantidad_minima, precio_antes = excluded.precio_antes,",
    "  precio_ahora = excluded.precio_ahora, descuento = excluded.descuento, comentario_comprador = excluded.comentario_comprador,",
    "  aplica_segmento = excluded.aplica_segmento, segmento_cliente = excluded.segmento_cliente, alcance_tipo = excluded.alcance_tipo,",
    "  alcance_valor = excluded.alcance_valor, estado_registro = excluded.estado_registro, updated_at = excluded.updated_at,",
    "  dep_id = excluded.dep_id, ultima_modificacion_por = excluded.ultima_modificacion_por;",
    "",
  ]

  comentario_values = [
    [
      sql_literal(clean(row.get("comentario_id"))),
      sql_literal(clean(row.get("actividad_id"))),
      sql_literal(clean(row.get("row_id"))),
      sql_literal(clean(row.get("alcance_comentario")) or ("LINEA" if clean(row.get("row_id")) else "ACTIVIDAD")),
      sql_literal(clean(row.get("prioridad")) or "MEDIA"),
      sql_literal(clean(row.get("usuario"))),
      sql_literal(clean(row.get("tipo_usuario"))),
      sql_literal(clean(row.get("comentario"))),
      sql_literal(clean(row.get("estado")).upper() or "ABIERTO"),
      sql_ts(row.get("fecha")),
      sql_ts(row.get("fecha_resolucion")),
    ]
    for row in comentarios
  ]
  sql += [
    "with src (legacy_comentario_id, actividad_id, row_id, alcance_comentario, prioridad, usuario, tipo_usuario, comentario, estado, fecha, fecha_resolucion) as (",
    "values",
    values_block(comentario_values),
    ")",
    "insert into public.comentarios (legacy_comentario_id, campana_id, promocion_id, legacy_row_id, alcance_comentario, prioridad, usuario, tipo_usuario, comentario, estado, fecha, fecha_resolucion)",
    "select src.legacy_comentario_id, coalesce(c.id, p.campana_id), case when src.alcance_comentario = 'LINEA' then p.id else null end, case when src.alcance_comentario = 'LINEA' then src.row_id else '' end, src.alcance_comentario, src.prioridad, src.usuario, src.tipo_usuario, src.comentario, src.estado, coalesce(src.fecha::timestamptz, now()), src.fecha_resolucion::timestamptz",
    "from src",
    "left join public.campanas c on c.legacy_actividad_id = src.actividad_id",
    "left join public.promociones p on p.legacy_row_id = src.row_id",
    "where src.comentario <> ''",
    "on conflict (legacy_comentario_id) where legacy_comentario_id is not null and legacy_comentario_id <> '' do update set",
    "  campana_id = excluded.campana_id, promocion_id = excluded.promocion_id, legacy_row_id = excluded.legacy_row_id,",
    "  alcance_comentario = excluded.alcance_comentario, prioridad = excluded.prioridad, usuario = excluded.usuario,",
    "  tipo_usuario = excluded.tipo_usuario, comentario = excluded.comentario, estado = excluded.estado,",
    "  fecha = excluded.fecha, fecha_resolucion = excluded.fecha_resolucion;",
    "",
  ]

  if detalles:
    detalle_values = [
      [
        sql_literal(clean(row.get("row_id"))),
        sql_literal(clean(row.get("campo"))),
        sql_literal(clean(row.get("valor"))),
      ]
      for row in detalles
      if clean(row.get("row_id")) and clean(row.get("campo"))
    ]
    if detalle_values:
      sql += [
        "with src (row_id, campo, valor) as (",
        "values",
        values_block(detalle_values),
        ")",
        "insert into public.promociones_detalle (promocion_id, campo, valor)",
        "select p.id, src.campo, src.valor from src join public.promociones p on p.legacy_row_id = src.row_id",
        "on conflict (promocion_id, campo) do update set valor = excluded.valor;",
        "",
      ]

  notif_values = [
    [
      sql_literal(clean(row.get("actividad_id") or row.get("catalogo_id"))),
      sql_literal(clean(row.get("correo"))),
      sql_bool(row.get("activo")),
    ]
    for row in notificaciones
    if clean(row.get("correo"))
  ]
  sql += [
    "with src (actividad_id, correo, activo) as (",
    "values",
    values_block(notif_values),
    ")",
    "insert into public.notificaciones (campana_id, correo, tipo, activo)",
    "select c.id, src.correo, 'CAMBIO_PROMOCION', src.activo",
    "from src join public.campanas c on c.legacy_actividad_id = src.actividad_id",
    "on conflict (campana_id, correo, tipo) do update set activo = excluded.activo;",
    "",
  ]

  avance_values = [
    [
      sql_literal(clean(row.get("avance_id"))),
      sql_literal(clean(row.get("catalogo_id"))),
      sql_literal(clean(row.get("catalogo"))),
      sql_literal(clean(row.get("comprador_id"))),
      sql_literal(clean(row.get("comprador"))),
      sql_literal(clean(row.get("division"))),
      sql_literal(clean(row.get("estado")) or "Pendiente"),
      sql_ts(row.get("fecha_estado")),
      sql_literal(clean(row.get("usuario"))),
    ]
    for row in avances
    if clean(row.get("avance_id"))
  ]
  sql += [
    "with src (avance_id, catalogo_id, catalogo, comprador_id, comprador, division, estado, fecha_estado, usuario) as (",
    "values",
    values_block(avance_values),
    ")",
    "insert into public.avances_catalogo (avance_id, campana_id, catalogo_id, catalogo, comprador_id, buyer_id, comprador, division, estado, fecha_estado, usuario)",
    "select src.avance_id, c.id, src.catalogo_id, src.catalogo, src.comprador_id, b.id, src.comprador, src.division, src.estado, coalesce(src.fecha_estado::timestamptz, now()), src.usuario",
    "from src",
    "left join public.campanas c on c.legacy_actividad_id = src.catalogo_id",
    "left join public.compradores b on b.comprador = src.comprador",
    "on conflict (avance_id) do update set",
    "  campana_id = excluded.campana_id, catalogo_id = excluded.catalogo_id, catalogo = excluded.catalogo,",
    "  comprador_id = excluded.comprador_id, buyer_id = excluded.buyer_id, comprador = excluded.comprador,",
    "  division = excluded.division, estado = excluded.estado, fecha_estado = excluded.fecha_estado, usuario = excluded.usuario;",
    "",
  ]

  log_values = [
    [
      sql_literal(clean(row.get("log_id"))),
      sql_ts(row.get("fecha")),
      sql_literal(clean(row.get("usuario"))),
      sql_literal(clean(row.get("catalogo"))),
      sql_literal(clean(row.get("accion"))),
      sql_literal(clean(row.get("row_id"))),
      sql_literal(clean(row.get("campo"))),
      sql_literal(clean(row.get("valor_anterior"))),
      sql_literal(clean(row.get("valor_nuevo"))),
      sql_ts(row.get("fecha_cierre")),
    ]
    for row in logs
    if clean(row.get("accion"))
  ]
  sql += [
    "with src (request_id, fecha, usuario, catalogo, accion, row_id, campo, valor_anterior, valor_nuevo, fecha_cierre) as (",
    "values",
    values_block(log_values),
    ")",
    "insert into public.logs (request_id, created_at, usuario, entidad, campana_id, promocion_id, accion, campo, valor_anterior, valor_nuevo, fecha_cierre)",
    "select src.request_id, coalesce(src.fecha::timestamptz, now()), src.usuario, 'PROMOCIONES', coalesce(p.campana_id, c.id), p.id, src.accion, src.campo, src.valor_anterior, src.valor_nuevo, src.fecha_cierre::timestamptz",
    "from src",
    "left join public.promociones p on p.legacy_row_id = src.row_id",
    "left join public.campanas c on c.legacy_actividad_id = src.catalogo",
    "where not exists (select 1 from public.logs l where l.request_id = src.request_id and src.request_id <> '');",
    "",
    "commit;",
    "",
    "select 'compradores' as objeto, count(*) from public.compradores",
    "union all select 'responsables_solicitudes', count(*) from public.responsables_solicitudes",
    "union all select 'jerarquia_categorias', count(*) from public.jerarquia_categorias",
    "union all select 'segmentos_clientes', count(*) from public.segmentos_clientes",
    "union all select 'campanas', count(*) from public.campanas",
    "union all select 'promociones', count(*) from public.promociones",
    "union all select 'comentarios', count(*) from public.comentarios",
    "union all select 'logs', count(*) from public.logs",
    "union all select 'notificaciones', count(*) from public.notificaciones",
    "union all select 'avances_catalogo', count(*) from public.avances_catalogo;",
  ]

  return "\n".join(sql)


def main():
  parser = argparse.ArgumentParser(description="Genera SQL de carga inicial para Supabase.")
  parser.add_argument("--file", default=r"C:\Users\arlen.aguilar\Downloads\export_google_sheet_mvp.xlsx")
  parser.add_argument("--output", default="docs/supabase_seed_from_drive_export.sql")
  args = parser.parse_args()

  output = Path(args.output)
  output.write_text(generate_sql(args.file), encoding="utf-8")
  print(f"SQL generado: {output.resolve()}")


if __name__ == "__main__":
  main()
