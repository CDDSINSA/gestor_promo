-- Corrige valores dañados de promociones.tipo_cantidad (14-oct-2026).
--
-- Origen del problema (ya corregido en el frontend):
--   * La grilla de promociones ofrecía la opción "MÃ­nimo" (texto con codificación dañada).
--   * El modal de promo simple guardaba el texto literal "Mínimo" (con barra invertida).
-- El valor correcto es "Mínimo". No se toca la columna version para no provocar
-- conflictos de concurrencia en sesiones abiertas.

-- 1) Revisar qué se va a corregir (ejecutar primero y revisar el conteo):
select tipo_cantidad, count(*) as filas
from public.promociones
where lower(trim(tipo_cantidad)) in ('mã­nimo', 'mãnimo', 'mínimo', 'minimo', 'mínimo')
  and tipo_cantidad <> 'Mínimo'
group by tipo_cantidad
order by filas desc;

-- 2) Corregir:
begin;

update public.promociones
set tipo_cantidad = 'Mínimo'
where lower(trim(tipo_cantidad)) in ('mã­nimo', 'mãnimo', 'mínimo', 'minimo', 'mínimo')
  and tipo_cantidad <> 'Mínimo';

update public.promociones
set tipo_cantidad = 'Exacta'
where lower(trim(tipo_cantidad)) = 'exacta'
  and tipo_cantidad <> 'Exacta';

commit;

-- 3) Verificar que solo queden valores válidos:
select tipo_cantidad, count(*) as filas
from public.promociones
group by tipo_cantidad
order by filas desc;
