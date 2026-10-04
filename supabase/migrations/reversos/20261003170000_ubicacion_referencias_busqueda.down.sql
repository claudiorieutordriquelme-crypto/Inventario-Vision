-- Reverso de 20261003170000_ubicacion_referencias_busqueda.sql
--
-- Se corre a mano con scripts/sql-remoto.mjs. No lo aplica ningun script.
--
-- QUE SE PIERDE: la tipologia de ubicacion de cada producto, las referencias
-- web aceptadas, la bitacora de busquedas y los vectores calculados. Los
-- vectores se pueden recalcular desde las imagenes; las referencias, no: hay
-- que volver a buscar y volver a aceptarlas, y eso cuesta plata.
--
-- Antes de correrlo conviene guardarse las referencias:
--   select producto_id, url, titulo from public.producto_referencias;
--
-- NO SE BORRAN LAS EXTENSIONES pg_trgm, unaccent ni vector. Pueden estar
-- siendo usadas por otra cosa del proyecto, y un drop extension se lleva por
-- delante todo lo que dependa de ellas sin preguntar.

begin;

drop function if exists public.productos_parecidos(extensions.vector, integer);
drop table if exists public.producto_embeddings;

drop function if exists public.buscar_productos(text, integer);

drop index if exists public.productos_nombre_trgm_idx;
drop index if exists public.productos_descripcion_trgm_idx;
drop index if exists public.clientes_busqueda_idx;

/* normaliza_busqueda va al final de este grupo: los indices de arriba dependen
   de ella y Postgres se niega a borrarla mientras existan. */
drop function if exists public.normaliza_busqueda(text);

drop table if exists public.busquedas_web;
drop table if exists public.producto_referencias;

drop index if exists public.productos_ubicacion_tipo_idx;
alter table public.productos drop column if exists ubicacion_tipo;
drop type if exists public.tipo_ubicacion;

commit;
