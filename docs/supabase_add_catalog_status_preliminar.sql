-- Permite usar el estado "Preliminar" en catalogos/campanas.
-- Ejecutar en Supabase SQL Editor solo si al guardar un catalogo con estado
-- Preliminar aparece un error de restriccion/check sobre campanas.estado.

alter table public.campanas
  drop constraint if exists campanas_estado_operativo_check;

alter table public.campanas
  drop constraint if exists campanas_estado_check;

alter table public.campanas
  add constraint campanas_estado_operativo_check
  check (estado in (
    'Preliminar', 'Borrador', 'Activo', 'Cerrado',
    'PRELIMINAR', 'BORRADOR', 'ACTIVO', 'CERRADO', 'CANCELADO',
    'Nuevo', 'Aprobado', 'Aprovado', 'En trabajo', 'Finalizado'
  ));
