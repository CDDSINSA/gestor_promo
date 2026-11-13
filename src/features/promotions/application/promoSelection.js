export function toggleSelectedId(currentSelection, id) {
  const next = new Set(currentSelection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function toggleVisibleSelection(currentSelection, visibleIds = [], allVisibleSelected = false) {
  const next = new Set(currentSelection);
  if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
  else visibleIds.forEach((id) => next.add(id));
  return next;
}

export function pruneSelectionToVisible(currentSelection, visibleIds = []) {
  const visibleIdSet = new Set(visibleIds);
  const next = new Set();
  let changed = false;
  currentSelection.forEach((id) => {
    if (visibleIdSet.has(id)) next.add(id);
    else changed = true;
  });
  return changed ? next : currentSelection;
}

export function countSelectedVisibleIds(visibleIds = [], selectedIds = new Set()) {
  return visibleIds.filter((id) => selectedIds.has(id)).length;
}
