-- Reverso de 20261003160000_imagenes_producto.sql
--
-- Se corre a mano con scripts/sql-remoto.mjs. No lo aplica ningun script.
--
-- QUE SE PIERDE: el registro de la SEGUNDA imagen en adelante de cada
-- producto. foto_path conserva la portada, asi que ningun producto queda sin
-- foto, pero las demas quedan como archivos sueltos en el bucket sin nadie que
-- los referencie. Antes de correr esto conviene sacar la lista:
--
--   select producto_id, path from public.producto_imagenes order by producto_id, orden;
--
-- Los archivos NO se borran del bucket: este reverso no toca storage. Quedan
-- ocupando espacio hasta que alguien los limpie a mano, y eso es preferible a
-- que un rollback borre imagenes que despues no se pueden recuperar.

begin;

drop trigger if exists productos_confirmado_exige_imagenes on public.productos;
drop function if exists public.tg_confirmado_exige_imagenes();

drop trigger if exists producto_imagenes_recalcula on public.producto_imagenes;
drop function if exists public.tg_recalcula_imagenes();

drop table if exists public.producto_imagenes;

alter table public.productos drop column if exists imagenes;

commit;
