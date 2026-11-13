import { useMemo } from "react";
import {
  getRolePermissions,
  roleHasAllPermissions,
  roleHasAnyPermission,
  roleHasPermission,
} from "../constants/permissions";
import { useAuth } from "./useAuth";

export function usePermissions() {
  const { appUser } = useAuth();
  const role = appUser?.rol || appUser?.role || "";

  return useMemo(() => ({
    role,
    permissions: getRolePermissions(role),
    can: (permission) => roleHasPermission(role, permission),
    canAny: (permissions) => roleHasAnyPermission(role, permissions),
    canAll: (permissions) => roleHasAllPermissions(role, permissions),
  }), [role]);
}
