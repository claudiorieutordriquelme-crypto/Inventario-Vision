-- 20260903120200_rls.sql
-- Row Level Security y cierre de la superficie del rol anonimo.
--
-- REGLA DE ESTE PROYECTO: el rol anon no lee NI ESCRIBE en ninguna tabla. Esta
-- aplicacion no tiene superficie publica; todo pasa por una sesion. Si algun
-- dia hace falta una vista publica, se expone por una funcion SECURITY DEFINER
-- con search_path fijado, nunca abriendo una tabla.

alter table public.profiles               enable row level security;
alter table public.categorias             enable row level security;
alter table public.correlativos_sku       enable row level security;
alter table public.productos              enable row level security;
alter table public.movimientos_inventario enable row level security;
alter table public.analisis_imagen        enable row level security;

-- ── Perfiles ─────────────────────────────────────────────────────────────────

create policy profiles_admin_all on public.profiles
  as permissive for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy profiles_select_equipo on public.profiles
  as permissive for select to authenticated
  using (public.puede_leer());

/*
  Cada quien ve su propia fila aunque no pueda leer el equipo. Sin esto, una
  cuenta recien creada no podria ni averiguar cual es su rol, y la pantalla no
  sabria si mostrar "sin acceso" o "esperando asignacion".
*/
create policy profiles_select_propio on public.profiles
  as permissive for select to authenticated
  using (user_id = auth.uid());

/*
  Editar el propio nombre, sin poder cambiarse el rol. El with check compara
  contra mi_rol(), asi que un UPDATE que intente subirse a admin no encuentra
  fila que cumpla y no escribe nada.
*/
create policy profiles_update_propio on public.profiles
  as permissive for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and rol = public.mi_rol());

-- ── Categorias ───────────────────────────────────────────────────────────────

create policy categorias_select on public.categorias
  as permissive for select to authenticated
  using (public.puede_leer());

create policy categorias_admin on public.categorias
  as permissive for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ── Correlativos ─────────────────────────────────────────────────────────────
--
-- Nadie los toca directamente desde la aplicacion: los mueve siguiente_sku(),
-- que es SECURITY DEFINER y corre con los permisos de su dueño. Se deja solo
-- lectura para poder mostrar en que numero va cada prefijo, y correccion
-- manual reservada al administrador.

create policy correlativos_select on public.correlativos_sku
  as permissive for select to authenticated
  using (public.puede_leer());

create policy correlativos_admin on public.correlativos_sku
  as permissive for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

-- ── Productos ────────────────────────────────────────────────────────────────

create policy productos_select on public.productos
  as permissive for select to authenticated
  using (public.puede_leer());

create policy productos_insert_operador on public.productos
  as permissive for insert to authenticated
  with check (public.puede_operar());

create policy productos_update_operador on public.productos
  as permissive for update to authenticated
  using (public.puede_operar()) with check (public.puede_operar());

/*
  Borrar es solo del administrador. La llave de movimientos_inventario hacia
  productos es RESTRICT, asi que un producto con historial de movimientos no se
  borra por ningun camino: para sacarlo de circulacion se usa el estado
  archivado, que conserva su libro.
*/
create policy productos_delete_admin on public.productos
  as permissive for delete to authenticated
  using (public.es_admin());

-- ── Movimientos: APPEND ONLY ─────────────────────────────────────────────────
--
-- Hay SELECT e INSERT. No hay UPDATE ni DELETE, y su ausencia es la regla: sin
-- politica, RLS niega. Ni el administrador puede borrar una fila del libro.
-- Una correccion se hace con un movimiento de ajuste que compensa.

create policy movimientos_select on public.movimientos_inventario
  as permissive for select to authenticated
  using (public.puede_leer());

create policy movimientos_insert_operador on public.movimientos_inventario
  as permissive for insert to authenticated
  with check (public.puede_operar());

-- ── Bitacora de analisis ─────────────────────────────────────────────────────
--
-- Tambien append only, y por la misma razon: es la procedencia del precio
-- estimado. Un registro de procedencia que se puede editar no es procedencia.

create policy analisis_select on public.analisis_imagen
  as permissive for select to authenticated
  using (public.puede_leer());

create policy analisis_insert_operador on public.analisis_imagen
  as permissive for insert to authenticated
  with check (public.puede_operar());

-- ── Cierre del rol anonimo ───────────────────────────────────────────────────
--
-- Un proyecto Supabase trae auto_expose_new_tables activo: cada tabla creada en
-- public recibe GRANT para anon sin que nadie lo pida. Se revoca explicitamente
-- tabla por tabla.

revoke all on table public.profiles               from anon;
revoke all on table public.categorias             from anon;
revoke all on table public.correlativos_sku       from anon;
revoke all on table public.productos              from anon;
revoke all on table public.movimientos_inventario from anon;
revoke all on table public.analisis_imagen        from anon;

/*
  Y las funciones. Postgres concede EXECUTE a PUBLIC en cada funcion nueva, o
  sea tambien a anon. Se revoca de PUBLIC (revocarlo solo de anon no hace nada,
  porque el permiso viene por PUBLIC) y se vuelve a conceder a los roles que de
  verdad lo necesitan: authenticated, porque las politicas RLS llaman a
  mi_rol() y compania en nombre de quien consulta.
*/
revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

/*
  Y para lo que se cree despues de esta migracion, para que no haya que
  acordarse cada vez.
*/
alter default privileges in schema public revoke execute on functions from public;
