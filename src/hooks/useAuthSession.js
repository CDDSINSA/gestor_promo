import { useCallback, useEffect, useState } from "react";
import {
  loadStoredAppSession,
  abortActiveSupabaseRequests,
  loadAppUserProfile,
  loadRecoverySessionFromUrl,
  loadAuthUserFromSession,
  requestPasswordRecovery,
  saveStoredSupabaseConnection,
  signInAppUser,
  signOutAppUser,
  subscribeAppSession,
  hasSupabaseConnection,
  updateRecoveredPassword,
} from "../services/supabaseService";
import { clearAuthTokensFromUrl } from "../app/session/sessionHelpers";

function isTemporaryAuthError(error) {
  return error?.name === "TypeError" || error?.name === "AbortError"
    || error?.name === "AuthRetryableFetchError"
    || [408, 429].includes(error?.status) || error?.status >= 500;
}

export function useAuthSession({ supabaseSettings, setSupabaseSettings }) {
  const [appSession, setAppSession] = useState(loadStoredAppSession);
  const [appUser, setAppUser] = useState(null);
  const [authStatus, setAuthStatus] = useState({ type: "idle", message: "" });
  const [loginStatus, setLoginStatus] = useState({ type: "idle", message: "" });
  const [recoveryStatus, setRecoveryStatus] = useState({ type: "idle", message: "" });
  const [authScreen, setAuthScreen] = useState("login");
  const [recoverySession, setRecoverySession] = useState(null);
  const [recoveryUser, setRecoveryUser] = useState(null);

  const handleSessionRefresh = useCallback((nextSession) => {
    setAppSession(nextSession);
  }, []);
  useEffect(() => {
    if (!hasSupabaseConnection(supabaseSettings)) return undefined;
    return subscribeAppSession(supabaseSettings, (event, session) => {
      if (event === "INITIAL_SESSION" && session) {
        setAppSession((current) => current || session);
      }
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        // Recovery credentials must not turn into a normal application login.
        setAppSession((current) => current ? session : null);
        setRecoverySession((current) => current ? session : null);
      }
      if (event === "SIGNED_OUT") {
        abortActiveSupabaseRequests();
        setAppSession(null);
        setAppUser(null);
        setRecoverySession(null);
        setRecoveryUser(null);
        setLoginStatus({ type: "error", message: "La sesion termino. Inicie sesion nuevamente." });
      }
    });
  }, [supabaseSettings]);

  useEffect(() => {
    let cancelled = false;
    loadRecoverySessionFromUrl(supabaseSettings)
      .then((nextRecoverySession) => {
        if (cancelled || !nextRecoverySession) return null;
        clearAuthTokensFromUrl();
        setAuthScreen("reset");
        setRecoverySession(nextRecoverySession);
        setRecoveryUser(null);
        setLoginStatus({ type: "idle", message: "" });
        setRecoveryStatus({ type: "loading", message: "Validando enlace de recuperacion..." });
        return loadAuthUserFromSession(supabaseSettings, nextRecoverySession);
      })
      .then((user) => {
        if (!user) return;
        if (cancelled) return;
        setRecoveryUser(user);
        setRecoveryStatus({ type: "idle", message: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        clearAuthTokensFromUrl();
        setAuthScreen("reset");
        setRecoveryStatus({ type: "error", message: error.message || "No se pudo validar el enlace de recuperacion." });
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseSettings]);

  useEffect(() => {
    if (!appSession?.access_token) {
      setAppUser(null);
      setAuthStatus({ type: "idle", message: "" });
      return;
    }
    let cancelled = false;
    let retryTimer;
    let retryDelay = 5000;
    setAuthStatus({ type: "loading", message: "Cargando permisos..." });
    const loadProfile = () => loadAppUserProfile({ ...supabaseSettings, onSessionRefresh: handleSessionRefresh }, appSession)
      .then((profile) => {
        if (cancelled) return;
        setAppUser(profile);
        setAuthStatus({ type: "ready", message: "" });
      })
      .catch((error) => {
        if (cancelled) return;
        if (isTemporaryAuthError(error)) {
          setAuthStatus({ type: "error", message: "No se pudieron verificar los permisos temporalmente. Reintentando..." });
          retryTimer = setTimeout(loadProfile, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30000);
          return;
        }
        void signOutAppUser(supabaseSettings, appSession).catch(() => null);
        setAppSession(null);
        setAppUser(null);
        setAuthStatus({ type: "error", message: error.message || "No se pudieron cargar los permisos." });
        setLoginStatus({ type: "error", message: error.message || "No se pudieron cargar los permisos." });
      });
    void loadProfile();
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
    };
  }, [appSession, supabaseSettings, handleSessionRefresh]);

  const onLogin = async (email, password) => {
    setLoginStatus({ type: "loading", message: "Validando usuario..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      const session = await signInAppUser(savedConnection, email, password);
      const profile = await loadAppUserProfile(savedConnection, session);
      setAppUser(profile);
      setAppSession(session);
      setLoginStatus({ type: "ready", message: "" });
    } catch (error) {
      setLoginStatus({ type: "error", message: error.message || "No se pudo iniciar sesion." });
    }
  };

  const onRequestPasswordRecovery = async (email) => {
    setRecoveryStatus({ type: "loading", message: "Enviando enlace de recuperacion..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      await requestPasswordRecovery(savedConnection, email);
      setRecoveryStatus({ type: "success", message: "Si el correo existe, recibira un enlace para restablecer la contraseña." });
      setLoginStatus({ type: "idle", message: "" });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "No se pudo enviar el enlace de recuperacion." });
    }
  };

  const onResetPassword = async (password, confirmPassword) => {
    if (password !== confirmPassword) {
      setRecoveryStatus({ type: "error", message: "Las contraseñas no coinciden." });
      return;
    }
    setRecoveryStatus({ type: "loading", message: "Actualizando contraseña..." });
    try {
      const savedConnection = saveStoredSupabaseConnection(supabaseSettings);
      setSupabaseSettings(savedConnection);
      await updateRecoveredPassword(savedConnection, recoverySession, password);
      await signOutAppUser(savedConnection, recoverySession).catch(() => null);
      setAppSession(null);
      setAppUser(null);
      setRecoverySession(null);
      setAuthScreen("login");
      setRecoveryStatus({ type: "idle", message: "" });
      setLoginStatus({ type: "success", message: "Contraseña actualizada. Ya puede iniciar sesion con la nueva contraseña." });
    } catch (error) {
      setRecoveryStatus({ type: "error", message: error.message || "No se pudo actualizar la contraseña." });
    }
  };

  const onLogout = async () => {
    let signOutError = null;
    setAuthStatus({ type: "loading", message: "Cerrando sesion..." });
    try {
      await signOutAppUser(supabaseSettings, appSession, { scope: "local" });
    } catch (error) {
      signOutError = error;
    }
    abortActiveSupabaseRequests();
    setAppSession(null);
    setAppUser(null);
    setAuthStatus({ type: "idle", message: "" });
    setLoginStatus(signOutError
      ? { type: "error", message: `Sesion local cerrada. Supabase reporto: ${signOutError.message || signOutError}` }
      : { type: "idle", message: "" });
    setRecoveryStatus({ type: "idle", message: "" });
    setRecoverySession(null);
    setRecoveryUser(null);
    setAuthScreen("login");
  };

  return {
    appSession,
    appUser,
    authStatus,
    loginStatus,
    recoveryStatus,
    setRecoveryStatus,
    authScreen,
    setAuthScreen,
    recoverySession,
    setRecoverySession,
    handleSessionRefresh,
    onLogin,
    onRequestPasswordRecovery,
    onResetPassword,
    onLogout,
    recoveryUser,
    setRecoveryUser,
  };
}
