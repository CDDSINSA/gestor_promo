// Notification failures must not invalidate a business operation that already succeeded.
export async function deliverNotifications(events, send) {
  const warnings = [];
  for (const event of events.filter(Boolean)) {
    try {
      const result = await send(event);
      if (result?.skipped === "disabled_for_campaign") continue;
      if (!(Number(result?.inserted) > 0)) {
        warnings.push(`${event.titulo}: no hay destinatarios activos distintos del autor o falta asignar un responsable.`);
      }
    } catch (error) {
      warnings.push(`${event.titulo}: ${error.message || "no se pudo enviar el aviso"}`);
    }
  }
  return warnings;
}
