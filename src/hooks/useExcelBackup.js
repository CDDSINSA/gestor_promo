import { useRef } from "react";
import { loadCatalogFromExcel, saveCatalogToExcel } from "../services/excelService";

export function useExcelBackup({
  buildCatalogPayload,
  applyCatalogData,
  resetSyncedState,
  setSupabaseStatus,
  showSuccessToast,
}) {
  const fileInputRef = useRef(null);

  const onLoadExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const data = await loadCatalogFromExcel(file);
      applyCatalogData(data);
      resetSyncedState();
      setSupabaseStatus({ type: "ready", message: "Excel cargado: " + file.name });
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo cargar el Excel." });
    } finally {
      event.target.value = "";
    }
  };

  const onSaveExcel = async () => {
    try {
      await saveCatalogToExcel(buildCatalogPayload());
      setSupabaseStatus({ type: "ready", message: "Excel exportado correctamente." });
      showSuccessToast("El archivo Excel se genero correctamente.", "Exportacion lista");
    } catch (error) {
      setSupabaseStatus({ type: "error", message: error.message || "No se pudo exportar el Excel." });
    }
  };

  return { fileInputRef, onLoadExcel, onSaveExcel };
}
