-- Corrige estados de solicitudes especiales y permite archivar.
-- Ejecutar en Supabase SQL Editor antes de guardar solicitudes con estado Archivado.

alter table public.campanas
  drop constraint if exists campanas_estado_operativo_check;

alter table public.campanas
  drop constraint if exists campanas_estado_check;

alter table public.campanas
  add constraint campanas_estado_operativo_check
  check (estado in (
    'Preliminar', 'Borrador', 'Activo', 'Cerrado',
    'PRELIMINAR', 'BORRADOR', 'ACTIVO', 'CERRADO', 'CANCELADO',
    'Nuevo', 'Aprobado', 'Aprovado', 'En trabajo', 'Finalizado', 'Archivado'
  ));

update public.campanas
set estado = 'Aprobado'
where estado = 'Aprovado';
