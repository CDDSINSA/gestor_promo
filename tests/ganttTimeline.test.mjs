import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTimelineModel, getItemGridPosition } from "../src/features/seguimiento/ganttModel.js";

const day = (y, m, d) => new Date(y, m - 1, d);

test("La barra y la etiqueta del día de inicio caen en la misma columna", () => {
  const items = [
    { start: day(2026, 11, 1), end: day(2026, 11, 30) },
    { start: day(2026, 12, 1), end: day(2026, 12, 31) },
  ];
  const timeline = buildTimelineModel(items, day(2026, 10, 28));
  const bar = getItemGridPosition(items[1], timeline);
  const barStart = Number(bar.gridColumn.split(" / ")[0]);
  const tick = timeline.ticks.find((item) => item.label === "01" && item.month.toLowerCase().startsWith("dic"));
  assert.ok(tick, "debe existir etiqueta para el 01 de diciembre");
  assert.equal(tick.gridColumn, `${barStart} / span 1`);
  assert.ok(timeline.ticks.every((item) => item.gridColumn.endsWith("/ span 1")));
});
