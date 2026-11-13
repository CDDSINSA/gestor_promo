import React, { createContext } from "react";

export const AuthContext = createContext(null);

export function AuthProvider({ value, children }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
