-- 20260903120500_guarda_ultimo_admin.sql
-- Impide que la instalacion se quede sin ningun administrador activo.
--
-- El problema concreto: la politica profiles_admin_all deja que un admin edite
-- cualquier perfil, incluido el suyo. Un administrador que se baja a lector, o
-- que deshabilita al ultimo que quedaba, deja el sistema sin nadie que pueda
-- tocar categorias, usuarios ni borrar nada. Y como esta aplicacion no usa
-- service_role a proposito, no hay forma de arreglarlo desde la interfaz:
-- habria que entrar a la base por fuera.
--
-- La pantalla de usuarios tambien lo verifica, pero esa verificacion es de
-- aplicacion y no sobrevive a dos administradores degradandose en el mismo
-- instante, ni a un UPDATE hecho desde cualquier otro cliente contra PostgREST.
-- La regla tiene que vivir en la base.
--
-- Por que un trigger de sentencia y no uno por fila: la condicion no es sobre
-- la fila que cambia sino sobre el conjunto que queda despues, y un UPDATE que
-- toque varias filas a la vez tiene que evaluarse una sola vez, al final.

create or replace function public.tg_exige_admin_activo()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  /*
    El bloqueo consultivo serializa las transacciones que tocan perfiles. Sin
    el, dos administradores degradandose al mismo tiempo ven cada uno al otro
    todavia activo, los dos pasan la comprobacion y el sistema termina sin
    administradores. Es de transaccion, asi que se suelta solo al terminar.
  */
  perform pg_advisory_xact_lock(hashtext('public.profiles:admin_activo'));

  if not exists (
    select 1 from public.profiles
    where rol = 'admin'::public.rol_usuario and activo
  ) then
    raise exception 'Tiene que quedar al menos un administrador activo'
      using errcode = 'check_violation',
            hint = 'Nombra a otro administrador antes de cambiar o deshabilitar el ultimo.';
  end if;

  return null;
end;
$function$;

revoke execute on function public.tg_exige_admin_activo() from public;

create trigger profiles_exige_admin_activo
  after update or delete on public.profiles
  for each statement execute function public.tg_exige_admin_activo();

/*
  El trigger es AFTER y de sentencia, asi que tambien se dispara cuando el
  UPDATE no cambio ningun rol. Eso es intencional: si la tabla ya estuviera sin
  administradores por cualquier otra via, el primer cambio que se intente lo
  revela en vez de dejarlo pasar en silencio.

  No cubre INSERT porque agregar perfiles nunca puede dejar la tabla sin
  administradores, y no cubre TRUNCATE porque ningun rol de la aplicacion tiene
  ese permiso.
*/
