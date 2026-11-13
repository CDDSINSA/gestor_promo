// Estado de un catálogo en Ajustes.
// Al salir de Borrador hacia un estado de trabajo se encienden las
// "Notificaciones en vivo" (y con ellas los correos). La base hace lo mismo con
// el trigger catalog_enable_notifications_on_leave_draft; aquí se refleja en
// pantalla para que el siguiente guardado no las vuelva a apagar.

const ESTADOS_QUE_ENCIENDEN = new Set(["Preliminar", "Precios Finales", "Activo"]);

export function catalogStatusChangeFields(estadoAnterior, estadoNuevo) {
  const changes = { estado: estadoNuevo };
  if (estadoAnterior === "Borrador" && ESTADOS_QUE_ENCIENDEN.has(estadoNuevo)) {
    changes.notificacionesEnvivo = true;
    changes.notificaciones_envivo = true;
  }
  return changes;
}
