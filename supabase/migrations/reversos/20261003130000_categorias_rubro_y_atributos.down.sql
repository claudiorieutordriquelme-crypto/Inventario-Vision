-- Reverso de 20261003130000_categorias_rubro_y_atributos.sql
--
-- NO LO APLICA NINGUN SCRIPT. aplica-migraciones.mjs solo lee los .sql que
-- estan directamente en supabase/migrations, y esta carpeta no entra ahi. Se
-- corre a mano con scripts/sql-remoto.mjs cuando hay que volver atras.
--
-- QUE SE PIERDE AL REVERTIR, y hay que decirlo antes de correrlo: los valores
-- cargados en los atributos nuevos (estado, epoca, año, material, medidas) y
-- la jerarquia de subcategorias. Las cuatro categorias nuevas se borran SOLO
-- si no tienen productos; la llave desde productos es RESTRICT, asi que si
-- alguna tiene mercaderia cargada el DELETE falla y la transaccion completa
-- vuelve atras. Eso es deliberado: es preferible que el reverso se niegue a
-- correr antes que dejar productos sin categoria.

begin;

drop trigger if exists productos_pieza_unica_tope on public.productos;
drop function if exists public.tg_pieza_unica_tope();
drop function if exists public.categoria_es_pieza_unica(uuid);

drop trigger if exists categorias_un_solo_nivel on public.categorias;
drop function if exists public.tg_categoria_un_solo_nivel();

alter table public.productos
  drop constraint if exists productos_medidas_positivas,
  drop constraint if exists productos_anio_razonable;

alter table public.productos
  drop column if exists profundidad_cm,
  drop column if exists ancho_cm,
  drop column if exists alto_cm,
  drop column if exists material,
  drop column if exists anio_aproximado,
  drop column if exists epoca,
  drop column if exists estado_conservacion;

drop type if exists public.estado_conservacion;

delete from public.categorias
where codigo in ('menaje', 'antiguedades', 'munecas', 'coleccion');

alter table public.categorias
  drop constraint if exists categorias_no_es_su_propio_padre;

drop index if exists public.categorias_padre_idx;

alter table public.categorias
  drop column if exists pieza_unica,
  drop column if exists padre_id;

commit;
