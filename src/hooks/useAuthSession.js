import { useState } from "react";
import { loadStoredAppSession } from "../services/supabaseService";

export function useAuthSession() {
  const [appSession, setAppSession] = useState(loadStoredAppSession);
  const [appUser, setAppUser] = useState(null);
  const [authStatus, setAuthStatus] = useState({ type: "idle", message: "" });
  const [loginStatus, setLoginStatus] = useState({ type: "idle", message: "" });
  const [recoveryStatus, setRecoveryStatus] = useState({ type: "idle", message: "" });
  const [authScreen, setAuthScreen] = useState("login");
  const [recoverySession, setRecoverySession] = useState(null);
  const [recoveryUser, setRecoveryUser] = useState(null);

  return {
    appSession,
    setAppSession,
    appUser,
    setAppUser,
    authStatus,
    setAuthStatus,
    loginStatus,
    setLoginStatus,
    recoveryStatus,
    setRecoveryStatus,
    authScreen,
    setAuthScreen,
    recoverySession,
    setRecoverySession,
    recoveryUser,
    setRecoveryUser,
  };
}
