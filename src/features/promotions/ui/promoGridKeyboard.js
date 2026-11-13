export function focusAdjacentPromoGridInput(event, rootDocument = globalThis.document) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown" && event.key !== "Enter") return;
  const target = event.target;
  if (!target || typeof target.getAttribute !== "function") return;

  const rowIndex = Number(target.getAttribute("data-row-index"));
  const columnIndex = Number(target.getAttribute("data-col-index"));
  if (Number.isNaN(rowIndex) || Number.isNaN(columnIndex)) return;

  let targetRowIndex = rowIndex;
  if (event.key === "ArrowDown" || event.key === "Enter") {
    targetRowIndex = rowIndex + 1;
  } else if (event.key === "ArrowUp") {
    targetRowIndex = rowIndex - 1;
  }

  if (targetRowIndex === rowIndex) return;
  event.preventDefault();

  const selector = `[data-row-index="${targetRowIndex}"][data-col-index="${columnIndex}"]`;
  const nextInput = rootDocument?.querySelector?.(selector);
  if (nextInput) {
    nextInput.focus();
    if (typeof nextInput.select === "function") {
      nextInput.select();
    }
  }
}
