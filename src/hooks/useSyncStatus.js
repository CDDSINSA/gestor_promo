import { useState } from "react";
import { loadStoredSupabaseConnection } from "../services/supabaseService";

export function useSyncStatus() {
  const [supabaseSettings, setSupabaseSettings] = useState(loadStoredSupabaseConnection);
  const [supabaseStatus, setSupabaseStatus] = useState({ type: "idle", message: "Configure Supabase para sincronizar datos." });
  const [saveSupabaseStatus, setSaveSupabaseStatus] = useState("idle");
  const [isSyncing, setIsSyncing] = useState(false);
  const [specialRequestsRefreshStatus, setSpecialRequestsRefreshStatus] = useState({ type: "idle", message: "" });
  const [promotionScopeRefreshStatus, setPromotionScopeRefreshStatus] = useState({ type: "idle", message: "" });

  return {
    supabaseSettings,
    setSupabaseSettings,
    supabaseStatus,
    setSupabaseStatus,
    saveSupabaseStatus,
    setSaveSupabaseStatus,
    isSyncing,
    setIsSyncing,
    specialRequestsRefreshStatus,
    setSpecialRequestsRefreshStatus,
    promotionScopeRefreshStatus,
    setPromotionScopeRefreshStatus,
  };
}
