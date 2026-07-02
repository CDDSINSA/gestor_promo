import React from "react";
import { usePermissions } from "../hooks/usePermissions";

function PermissionDenied({ title = "Acceso restringido" }) {
  return (
    <div className="permission-denied">
      <h1>{title}</h1>
      <p>Su rol no tiene permisos para abrir este modulo.</p>
    </div>
  );
}

export default function ProtectedRoute({ permission, permissions, requireAll = false, children, fallback }) {
  const { can, canAny, canAll } = usePermissions();
  const allowed = permissions
    ? (requireAll ? canAll(permissions) : canAny(permissions))
    : can(permission);

  if (!allowed) return fallback || <PermissionDenied />;
  return children;
}
