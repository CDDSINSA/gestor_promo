export const ROLES = {
  ADMIN: "ADMIN",
  BUYER: "BUYER",
  MARK: "MARK",
  OPER: "OPER",
  AUD: "AUD",
};

export const PERMISSIONS = {
  VIEW_HOME: "view:home",
  VIEW_PROMOS: "view:promos",
  EDIT_PROMOS: "edit:promos",
  VIEW_CONSULTA: "view:consulta",
  VIEW_SOLICITUDES: "view:solicitudes",
  MANAGE_SOLICITUDES: "manage:solicitudes",
  CREATE_SPECIAL_PROMO: "create:promocion_especial",
  VIEW_AVANCES: "view:avances",
  EDIT_AVANCES: "edit:avances",
  VIEW_LOGS: "view:logs",
  VIEW_CONSOLIDADO: "view:consolidado",
  MANAGE_MARKETING_COMMENTS: "manage:marketing_comments",
  EXPORT_CONSOLIDADO: "export:consolidado",
  VIEW_EXPORTS: "view:exports",
  DOWNLOAD_EXPORTS: "download:exports",
  MANAGE_SETTINGS: "manage:settings",
  SYNC_SUPABASE: "sync:supabase",
};

export const ROLE_LABELS = {
  [ROLES.ADMIN]: "Administrador",
  [ROLES.BUYER]: "Comprador",
  [ROLES.MARK]: "Marketing",
  [ROLES.OPER]: "Ejecutor",
  [ROLES.AUD]: "Auditor",
};

export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: Object.values(PERMISSIONS),
  [ROLES.BUYER]: [
    PERMISSIONS.VIEW_HOME,
    PERMISSIONS.VIEW_PROMOS,
    PERMISSIONS.EDIT_PROMOS,
    PERMISSIONS.VIEW_CONSULTA,
    PERMISSIONS.VIEW_SOLICITUDES,
    PERMISSIONS.CREATE_SPECIAL_PROMO,
    PERMISSIONS.VIEW_AVANCES,
    PERMISSIONS.EDIT_AVANCES,
    PERMISSIONS.VIEW_CONSOLIDADO,
    PERMISSIONS.MANAGE_MARKETING_COMMENTS,
    PERMISSIONS.EXPORT_CONSOLIDADO,
    PERMISSIONS.VIEW_EXPORTS,
    PERMISSIONS.DOWNLOAD_EXPORTS,
    PERMISSIONS.SYNC_SUPABASE,
  ],
  [ROLES.MARK]: [
    PERMISSIONS.VIEW_CONSOLIDADO,
    PERMISSIONS.MANAGE_MARKETING_COMMENTS,
    PERMISSIONS.EXPORT_CONSOLIDADO,
    PERMISSIONS.VIEW_EXPORTS,
    PERMISSIONS.DOWNLOAD_EXPORTS,
    PERMISSIONS.SYNC_SUPABASE,
  ],
  [ROLES.OPER]: [
    PERMISSIONS.VIEW_SOLICITUDES,
    PERMISSIONS.VIEW_EXPORTS,
    PERMISSIONS.DOWNLOAD_EXPORTS,
  ],
  [ROLES.AUD]: [
    PERMISSIONS.VIEW_LOGS,
  ],
};

export const MODULE_PERMISSIONS = {
  home: PERMISSIONS.VIEW_HOME,
  ajustes: PERMISSIONS.MANAGE_SETTINGS,
  promos: PERMISSIONS.VIEW_PROMOS,
  consulta: PERMISSIONS.VIEW_CONSULTA,
  solicitudes: PERMISSIONS.VIEW_SOLICITUDES,
  especial: PERMISSIONS.CREATE_SPECIAL_PROMO,
  avances: PERMISSIONS.VIEW_AVANCES,
  logs: PERMISSIONS.VIEW_LOGS,
  consolidado: PERMISSIONS.VIEW_CONSOLIDADO,
  export: PERMISSIONS.VIEW_EXPORTS,
};

export function normalizeRole(role) {
  const normalized = String(role || "").trim().toUpperCase();
  const aliases = {
    COMPRADOR: ROLES.BUYER,
    MERCADEO: ROLES.MARK,
    MARKETING: ROLES.MARK,
    PRICING: ROLES.OPER,
    PLANIMETRIA: ROLES.OPER,
    EJECUTOR: ROLES.OPER,
    AUDITOR: ROLES.AUD,
  };
  return aliases[normalized] || normalized;
}

export function getRolePermissions(role) {
  return ROLE_PERMISSIONS[normalizeRole(role)] || [];
}

export function roleHasPermission(role, permission) {
  if (!permission) return true;
  return getRolePermissions(role).includes(permission);
}

export function roleHasAnyPermission(role, permissions = []) {
  const required = Array.isArray(permissions) ? permissions.filter(Boolean) : [permissions].filter(Boolean);
  if (!required.length) return true;
  return required.some((permission) => roleHasPermission(role, permission));
}

export function roleHasAllPermissions(role, permissions = []) {
  const required = Array.isArray(permissions) ? permissions.filter(Boolean) : [permissions].filter(Boolean);
  if (!required.length) return true;
  return required.every((permission) => roleHasPermission(role, permission));
}

export function canAccessModule(role, moduleId) {
  return roleHasPermission(role, MODULE_PERMISSIONS[moduleId]);
}

export function getFirstAllowedModule(role, items = []) {
  return items.find((item) => canAccessModule(role, item.id))?.id || "home";
}
