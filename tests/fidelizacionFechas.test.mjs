import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";

// Carga módulos con imports sin extensión (igual que airesCombo.test.mjs).
async function load(entry) {
  const context = createContext({});
  const modules = new Map();
  const get = async (filename) => {
    if (!modules.has(filename)) modules.set(filename, readFile(filename, "utf8").then((source) => new SourceTextModule(source, { context, identifier: filename })));
    return modules.get(filename);
  };
  const stub = (values) => new SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value);
  }, { context });
  const root = await get(fileURLToPath(new URL(entry, import.meta.url)));
  await root.link(async (name, parent) => {
    if (name === "react") return stub({ createContext: () => ({}), useContext: () => null });
    if (name === "lucide-react") return stub(Object.fromEntries(["CalendarDays", "Download", "FileSpreadsheet", "History", "Home", "Images", "ListChecks", "Percent", "Search", "Settings", "TrendingUp"].map((icon) => [icon, () => null])));
    const base = path.resolve(path.dirname(parent.identifier), name);
    return get([base + ".js", path.join(base, "index.js"), base].find((file) => existsSync(file) && statSync(file).isFile()));
  });
  await root.evaluate();
  return root.namespace;
}

const { validatePromotions, isFidelizacionActivity } = await load("../src/services/promotionValidationService.js");
const { validateActividades } = await load("../src/services/excelService.js");

const fid = { actividad_id: "FID-20261028-d5ac30a7f287", tipo_actividad: "ESPECIAL", comprador: "Marcela Torres", canal: "Comasa", fecha_inicio: "", fecha_fin: "" };
const esp = { actividad_id: "ESP-20261028-001", tipo_actividad: "ESPECIAL", comprador: "Marcela Torres", canal: "Comasa", fecha_inicio: "", fecha_fin: "" };

test("isFidelizacionActivity reconoce prefijo FID- y subtipo", () => {
  assert.equal(isFidelizacionActivity(fid), true);
  assert.equal(isFidelizacionActivity({ actividad_id: "ESP-1", subtipo: "FIDELIZACION" }), true);
  assert.equal(isFidelizacionActivity(esp), false);
  assert.equal(isFidelizacionActivity(), false);
});

test("Excel: fidelización sin fechas no bloquea; especial normal sin fechas sí", () => {
  assert.deepEqual(Array.from(validateActividades([fid])), []);
  assert.deepEqual(Array.from(validateActividades([esp])), ["ACTIVIDADES fila 2: especial sin fecha_inicio.", "ACTIVIDADES fila 2: especial sin fecha_fin."]);
});

test("Excel: fidelización sigue exigiendo comprador y canal", () => {
  assert.deepEqual(Array.from(validateActividades([{ ...fid, comprador: "", canal: "" }])), ["ACTIVIDADES fila 2: especial sin comprador.", "ACTIVIDADES fila 2: especial sin canal."]);
});

test("Validación de filas: línea de fidelización sin fechas no da error de fecha", () => {
  const row = (actividad_id) => ({ id: "ROW-1", actividad_id, comprador: "Marcela Torres", tipo_promo: "Descuento", tipo_sku: "simple", oferta_id: "OFE-1", sku: "100531212", descuento: "5%", aplica_segmento: "NO", alcance_tipo: "CANAL", alcance_valor: "Comasa" });
  const fields = (r) => Array.from(r.errors, (e) => e.field);
  assert.ok(!fields(validatePromotions([row(fid.actividad_id)], { actividades: [fid] })).some((f) => /fecha/.test(f)));
  assert.ok(fields(validatePromotions([row(esp.actividad_id)], { actividades: [esp] })).includes("fecha_inicio"));
});
