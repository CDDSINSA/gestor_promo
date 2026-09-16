import { createContext, useContext } from "react";

export const SkuLookupContext = createContext(null);
export function useSkuLookup() {
  const lookup = useContext(SkuLookupContext);
  if (!lookup) throw new Error("La consulta de artículos requiere SkuLookupContext.");
  return lookup;
}
