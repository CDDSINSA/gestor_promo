export function clearAuthTokensFromUrl() {
  if (typeof window === "undefined" || !window.history?.replaceState) return;
  const url = new URL(window.location.href);
  ["access_token", "refresh_token", "expires_at", "expires_in", "token_type", "type", "code"].forEach((key) => {
    url.searchParams.delete(key);
  });
  url.hash = "";
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

export function getDataOwnerKey(session, user) {
  return String(user?.auth_user_id || session?.user?.id || session?.user_id || user?.id || user?.email || session?.user_email || "").trim();
}
