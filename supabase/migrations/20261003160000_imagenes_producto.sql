-- 20261003160000_imagenes_producto.sql
-- Varias imagenes por producto, con un minimo de tres para poder confirmarlo.
--
-- DE DONDE SALE LA REGLA DE LAS TRES. Una sola foto no alcanza para vender una
-- pieza usada: no muestra el reverso, ni el estado real, ni la escala. Tres es
-- el minimo con el que un comprador decide sin preguntar.
--
-- DONDE SE EXIGE, Y ESTO ES LO IMPORTANTE: al CONFIRMAR, no al crear. El alta
-- por foto existe justamente para apoyar seis cosas en una mesa, sacar UNA
-- foto y que salgan seis borradores. Exigir tres imagenes en ese momento
-- rompe el unico flujo que hace util la herramienta. El borrador puede tener
-- una; el producto confirmado, que es el que se publica y se vende, no.
--
-- Y LOS QUE YA ESTABAN CONFIRMADOS CON UNA SOLA FOTO NO SE ROMPEN. No hay
-- check sobre la tabla, que fallaria al crearse y dejaria esos productos
-- imposibles de editar hasta regularizarlos. Hay un trigger que mira la
-- TRANSICION: bloquea confirmar sin tres imagenes, y bloquea bajar de tres a
-- un producto ya confirmado. Un confirmado antiguo con una imagen se puede
-- seguir editando, y la interfaz lo marca como incompleto para que alguien lo
-- complete cuando le toque.

-- ── Tabla ────────────────────────────────────────────────────────────────────

create table public.producto_imagenes (
  id uuid primary key default gen_random_uuid(),
  /*
    CASCADE, en linea con la decision ya tomada en
    20260927120000_borrado_arrastra_movimientos.sql: borrar un producto se
    lleva todo lo suyo. Un registro de imagen sin producto no describe nada.
  */
  producto_id uuid not null references public.productos(id) on delete cascade,
  path text not null,
  bucket text not null default 'fotos',
  /*
    El orden lo fija quien carga, arrastrando. La primera es la portada: es la
    que se ve en el listado y la que va a mirar un comprador antes que
    cualquier otra cosa.

    SIN unique(producto_id, orden) a proposito. Reordenar con un unico
    obligaria a escribir las filas en un orden preciso o a usar valores
    temporales para esquivar el choque a mitad de la actualizacion. Los
    empates se resuelven por created_at, que siempre desempata.
  */
  orden integer not null default 0,
  mime text,
  bytes integer,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

/*
  La misma ruta no se registra dos veces en el MISMO producto. Entre productos
  distintos si se repite, y tiene que poder repetirse: el alta por foto crea
  varios productos desde una sola imagen, y todos apuntan a ese archivo.
*/
alter table public.producto_imagenes
  add constraint producto_imagenes_sin_repetir unique (producto_id, bucket, path);

alter table public.producto_imagenes
  add constraint producto_imagenes_path_no_vacio check (length(btrim(path)) > 0);
alter table public.producto_imagenes
  add constraint producto_imagenes_bytes_positivo check (bytes is null or bytes > 0);

create index producto_imagenes_producto_idx
  on public.producto_imagenes using btree (producto_id, orden, created_at);

-- ── El conteo y la portada los mantiene la base ──────────────────────────────

alter table public.productos
  add column imagenes integer not null default 0;

comment on column public.productos.imagenes is
  'Cuantas filas tiene en producto_imagenes. La mantiene un trigger: no se escribe desde la aplicacion.';

/*
  MISMO PRINCIPIO QUE productos.cantidad (regla 7 del proyecto): el detalle
  manda sobre el agregado, nunca al reves. La aplicacion inserta o borra una
  fila de producto_imagenes y este trigger recalcula el conteo Y la portada.

  foto_path y foto_bucket pasan a ser columnas DERIVADAS: la primera imagen por
  orden. Se conservan en vez de borrarse porque el listado, la exportacion y la
  ruta /panel/foto/[id] las leen, y reescribir las tres para ganar normalidad
  seria cambiar codigo que funciona por una razon estetica.
*/
create or replace function public.tg_recalcula_imagenes()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_producto uuid := coalesce(new.producto_id, old.producto_id);
  v_total integer;
  v_path text;
  v_bucket text;
begin
  select count(*) into v_total
  from public.producto_imagenes
  where producto_id = v_producto;

  select i.path, i.bucket into v_path, v_bucket
  from public.producto_imagenes i
  where i.producto_id = v_producto
  order by i.orden, i.created_at
  limit 1;

  update public.productos p
  set imagenes = v_total,
      foto_path = v_path,
      foto_bucket = coalesce(v_bucket, 'fotos')
  where p.id = v_producto;

  return null;
end;
$function$;

create trigger producto_imagenes_recalcula
  after insert or update or delete on public.producto_imagenes
  for each row execute function public.tg_recalcula_imagenes();

-- ── Migracion de lo que ya existe ────────────────────────────────────────────
--
-- Cada producto con foto pasa a tener su primera imagen registrada. Es el paso
-- que hace que nada se rompa: despues de esto, foto_path y producto_imagenes
-- dicen lo mismo, y el trigger los mantiene asi de aqui en adelante.

insert into public.producto_imagenes (producto_id, path, bucket, orden, creado_por, created_at)
select p.id, p.foto_path, coalesce(p.foto_bucket, 'fotos'), 0, p.creado_por, p.created_at
from public.productos p
where p.foto_path is not null and length(btrim(p.foto_path)) > 0
on conflict (producto_id, bucket, path) do nothing;

-- Y el conteo de todos, incluidos los que no tienen ninguna.
update public.productos p
set imagenes = coalesce((
  select count(*) from public.producto_imagenes i where i.producto_id = p.id
), 0);

-- ── El minimo de tres, en la transicion ──────────────────────────────────────

create or replace function public.tg_confirmado_exige_imagenes()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_minimo constant integer := 3;
begin
  if new.estado <> 'confirmado' then
    return new;
  end if;

  /*
    Solo se revisa cuando el producto RECIEN pasa a confirmado, o cuando ya lo
    estaba y pierde imagenes. Un confirmado antiguo con una sola foto se puede
    seguir editando: lo que no se puede es confirmar algo nuevo sin las tres,
    ni dejar sin fotos algo que ya esta publicado.
  */
  if tg_op = 'UPDATE' and old.estado = 'confirmado' and new.imagenes >= old.imagenes then
    return new;
  end if;

  if new.imagenes < v_minimo then
    raise exception 'Para confirmar un producto hacen falta al menos % imagenes; este tiene %.',
      v_minimo, new.imagenes
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

create trigger productos_confirmado_exige_imagenes
  before insert or update on public.productos
  for each row execute function public.tg_confirmado_exige_imagenes();

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Mismo criterio que productos: lee quien tiene sesion, escribe quien opera.
-- Borrar tambien lo puede el operador, a diferencia de productos: quitar una
-- foto mal sacada es parte de cargar bien, y quien ya puede subirlas no gana
-- nada protegido al no poder sacarlas.

alter table public.producto_imagenes enable row level security;

create policy producto_imagenes_select on public.producto_imagenes
  as permissive for select to authenticated using (public.puede_leer());
create policy producto_imagenes_insert_operador on public.producto_imagenes
  as permissive for insert to authenticated with check (public.puede_operar());
create policy producto_imagenes_update_operador on public.producto_imagenes
  as permissive for update to authenticated
  using (public.puede_operar()) with check (public.puede_operar());
create policy producto_imagenes_delete_operador on public.producto_imagenes
  as permissive for delete to authenticated using (public.puede_operar());

-- ── Cierre del rol anonimo ───────────────────────────────────────────────────
--
-- Tabla y funciones nuevas, revocadas de public Y de anon explicitamente. El
-- alter default privileges no alcanza: lo demostro la migracion
-- 20261003150000, que existio solo para cerrar lo que esta de aqui se olvido.

revoke all on table public.producto_imagenes from anon;

revoke execute on function public.tg_recalcula_imagenes()         from public, anon;
revoke execute on function public.tg_confirmado_exige_imagenes()  from public, anon;
