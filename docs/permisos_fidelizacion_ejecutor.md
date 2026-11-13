# Permisos de Fidelización y estatus de solicitudes

## Aplicación en Supabase

Después de esta migración, aplicar `docs/supabase_fidelizacion_integrity.sql` y luego `docs/supabase_fidelizacion_orce.sql`. Las correcciones están descritas en [fidelizacion_integrity.md](fidelizacion_integrity.md) y la conciliación de IDs en [fidelizacion_orce.md](fidelizacion_orce.md). Finalmente aplicar `docs/supabase_admin_fidelizacion.sql` para habilitar la consulta de Fidelización y los cambios de estado del Administrador. Después aplicar `docs/supabase_admin_orce.sql` para habilitar la carga y conciliación ORCE del Administrador. Mantener ese orden de instalación; no reaplicar migraciones anteriores sin volver a aplicar este último ajuste.

En una base existente, ejecutar `docs/supabase_permissions_hardening.sql` en el SQL Editor como propietario de la base. Es transaccional, se puede repetir y no elimina registros. Requiere el esquema de Fidelización, `supabase_roles_permissions_mvp.sql`, el delta operativo y `supabase_special_request_status_cleanup.sql` ya instalados.

En una base nueva, instalar primero esos requisitos y `supabase_fidelizacion_schema.sql`, y después ejecutar la migración de permisos. Publicar el frontend junto con esta migración: el nuevo cambio de estatus del Ejecutor necesita la RPC `cambiar_estado_solicitud`.

No volver a ejecutar versiones anteriores del esquema de Fidelización: podrían reinstalar los permisos anónimos. La migración reemplaza todas las políticas de sus dos tablas; cualquier política personalizada debe revisarse antes de reaplicarla.

## Comportamiento

- Ejecutor puede cambiar estatus, finalizar con IDs de promoción/oferta y archivar solicitudes finalizadas. Guarda inmediatamente en Supabase y detecta cambios concurrentes del estado. No recibe permisos para asignar responsables, editar recursos o sincronizar todos los datos.
- Administrador consulta todas las solicitudes de Fidelización y gestiona sus estados desde el canvas. Los botones de estado guardan inmediatamente en Supabase, igual que Ejecutor, con control de concurrencia. Crear solicitudes conserva sus permisos anteriores. Administrador y Ejecutor pueden cargar y conciliar reportes ORCE con la migración `supabase_admin_orce.sql`. Marketing, Auditor, Diseñador y usuarios anónimos quedan excluidos de Fidelización.
- Comprador opera las solicitudes de su `buyer_id` y los compradores vinculados por `current_buyer_scope_ids()`. El propietario textual del canasto debe coincidir con el nombre registrado en `compradores`. Ejecutor opera todo el alcance de Fidelización.
- Los SKU existentes del canasto no pueden reasignarse desde otro comprador. Los registros nuevos se asignan al comprador autorizado de la solicitud. Esta restricción controla propiedad en Fidelización; no incorpora una nueva clasificación corporativa SKU/comprador.
- Los registros históricos sin comprador identificable o sin `solicitante_buyer_id` quedan disponibles al Ejecutor, pero no al Comprador hasta corregir su asignación.
- Los errores de permisos o conexión no se convierten en guardados locales exitosos. Una consulta remota vacía tampoco reutiliza datos de otra sesión almacenados localmente.

## Verificación

1. Con Ejecutor, cambiar una solicitud de Nuevo a Aprobado, recargar y comprobar persistencia. Responsable y recursos deben permanecer restringidos. Finalizar requiere IDs en solicitudes ordinarias; en Fidelización aplica los descuentos en la misma transacción.
2. Con dos compradores distintos, crear solicitudes y comprobar que cada uno solo ve/modifica su alcance. Probar también nombres de comprador e IDs ajenos manipulados en solicitudes directas.
3. Con Administrador, comprobar visibilidad de solicitudes FID, avanzar su estado y recargar para verificar persistencia. Finalizar exige referencia ORCE y aplica descuentos; una solicitud finalizada no puede reabrirse. Con Marketing, Auditor, Diseñador y sesión anónima, verificar el rechazo de escrituras y RPC de Fidelización. La ausencia del módulo en pantalla no sustituye esta verificación.
4. Interrumpir la conexión durante un cambio: la pantalla debe conservar el estado anterior y mostrar el error.

Pruebas de JavaScript:

```powershell
node --experimental-vm-modules --test tests/permissions.test.mjs tests/fidelizacionPermissions.test.mjs
```

La prueba `tests/permissionsSql.test.mjs` ejecuta PostgreSQL en memoria con PGlite y verifica RLS, RPC, triggers, aislamiento y reaplicación de la migración. Para ejecutarla, instalar `@electric-sql/pglite` en un directorio temporal externo al proyecto y establecer `PROMO_SQL_TEST_RUNTIME` con la ruta absoluta a `node_modules/@electric-sql/pglite/dist/index.js`; después:

```powershell
node --test tests/permissionsSql.test.mjs
```

No se añade ninguna dependencia a la aplicación. Sin esa variable, la prueba SQL se omite explícitamente. Las pruebas locales no certifican que la migración esté instalada en la base remota.
