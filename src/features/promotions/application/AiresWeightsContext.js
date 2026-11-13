import { createContext, useContext } from "react";

// Función (combos) => Promise<respuesta de calcular_pesos_aires>. Sin proveedor devuelve
// null y AIRES reparte por precio regular (por ejemplo en pruebas o sin Supabase).
export const AiresWeightsContext = createContext(null);
export function useAiresWeightsLoader() {
  return useContext(AiresWeightsContext);
}
