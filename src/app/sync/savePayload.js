export function getFullSyncPayload(payload = {}) {
  return payload.__full_sync_payload || payload;
}

export function normalizePromotionConflict(raw = {}) {
  const conflicts = Array.isArray(raw.conflicts) ? raw.conflicts : [];
  const first = conflicts[0] || raw;
  if (!first) return null;
  return {
    row_id: first.row_id || first.id || "",
    expected_version: first.expected_version ?? "",
    current_version: first.current_version ?? "",
    fields: Array.isArray(first.fields) ? first.fields : [],
    current_row: first.current_row || null,
  };
}
