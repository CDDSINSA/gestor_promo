import { useCallback, useState } from "react";

export function useSkuMaster() {
  const [skuMaster, setSkuMaster] = useState({});
  const [skuMasterCount, setSkuMasterCount] = useState(0);
  const [archivoComprador, setArchivoComprador] = useState(null);
  const [skuMasterStatus, setSkuMasterStatus] = useState({ type: "idle", message: "Pendiente de cargar ERP." });

  const resetSkuMaster = useCallback(() => {
    setSkuMaster({});
    setSkuMasterCount(0);
    setArchivoComprador(null);
    setSkuMasterStatus({ type: "idle", message: "Pendiente de cargar ERP." });
  }, []);

  return {
    skuMaster,
    setSkuMaster,
    skuMasterCount,
    setSkuMasterCount,
    archivoComprador,
    setArchivoComprador,
    skuMasterStatus,
    setSkuMasterStatus,
    resetSkuMaster,
  };
}
