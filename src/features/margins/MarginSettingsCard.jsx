import React, { useEffect, useState } from "react";
import { Save, TrendingUp } from "lucide-react";
import { Button, Card, CardContent } from "../../components/ui";
import { loadMarginSettingsFromSupabase, saveMarginSettingsToSupabase } from "../../services/supabase/margins";
import { normalizeThresholds } from "./marginEngine";

function toNumber(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateMarginSettings({ verde, naranja, amarillo }) {
  const values = [verde, naranja, amarillo].map(toNumber);
  if (values.some((value) => value === null || value < 0 || value > 100)) return "Los cortes del semáforo deben estar entre 0 y 100.";
  if (!(values[0] > values[1] && values[1] > values[2])) return "Los cortes deben cumplir verde > naranja > amarillo.";
  return "";
}

/** Solo ADMIN: cortes del semáforo. Los costos (AV_COST) ya vienen en C$. */
export default function MarginSettingsCard({ connection }) {
  const [form, setForm] = useState({ verde: "", naranja: "", amarillo: "" });
  const [status, setStatus] = useState({ type: "loading", text: "Cargando parámetros..." });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    loadMarginSettingsFromSupabase(connection)
      .then((settings) => {
        if (!active) return;
        const thresholds = normalizeThresholds(settings.semaforo);
        setForm({ verde: String(thresholds.verde), naranja: String(thresholds.naranja), amarillo: String(thresholds.amarillo) });
        setStatus(null);
      })
      .catch((error) => { if (active) setStatus({ type: "error", text: error.message || "No se pudieron cargar los parámetros." }); });
    return () => { active = false; };
  }, [connection]);

  const update = (field) => (event) => { setForm((prev) => ({ ...prev, [field]: event.target.value })); setStatus(null); };

  const submit = async (event) => {
    event.preventDefault();
    const error = validateMarginSettings(form);
    if (error) { setStatus({ type: "error", text: error }); return; }
    setSaving(true);
    try {
      await saveMarginSettingsToSupabase(connection, {
        semaforo: { verde: toNumber(form.verde), naranja: toNumber(form.naranja), amarillo: toNumber(form.amarillo) },
      });
      setStatus({ type: "success", text: "Parámetros guardados." });
    } catch (saveError) {
      setStatus({ type: "error", text: saveError.message || "No se pudieron guardar los parámetros." });
    } finally {
      setSaving(false);
    }
  };

  return <Card className="settings-section-card"><CardContent className="margin-settings">
    <div className="broadcast-heading"><TrendingUp size={22} aria-hidden="true"/><div><h2>Parámetros de márgenes</h2><p>Cortes del semáforo. El costo es el AV_COST (costo promedio) del maestro, en C$.</p></div></div>
    <form onSubmit={submit} className="margin-settings-form">
      <label className="field"><span>Verde desde (%)</span><input inputMode="decimal" value={form.verde} onChange={update("verde")} disabled={saving}/></label>
      <label className="field"><span>Naranja desde (%)</span><input inputMode="decimal" value={form.naranja} onChange={update("naranja")} disabled={saving}/></label>
      <label className="field"><span>Amarillo desde (%)</span><input inputMode="decimal" value={form.amarillo} onChange={update("amarillo")} disabled={saving}/></label>
      <p className="field-hint full">Rojo: menos del corte amarillo. El costo de cada promoción se guarda al crearla con el AV_COST vigente.</p>
      {status && <p className={`broadcast-status ${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.text}</p>}
      <Button type="submit" className="settings-btn-save" disabled={saving || status?.type === "loading"}><Save size={16}/>{saving ? "Guardando…" : "Guardar parámetros"}</Button>
    </form>
  </CardContent></Card>;
}
