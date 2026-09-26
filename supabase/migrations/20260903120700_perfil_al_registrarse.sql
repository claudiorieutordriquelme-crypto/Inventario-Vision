-- 20260903120700_perfil_al_registrarse.sql
-- Crea el perfil automáticamente cuando alguien se registra.
--
-- POR QUE HACE FALTA. Sin esto, una persona que se registra queda con cuenta en
-- auth.users y sin fila en profiles. El resultado práctico es que no puede
-- entrar (el panel exige perfil) y además NO APARECE en la pantalla de
-- usuarios, porque esa pantalla lee profiles. O sea: alguien pide acceso, se
-- registra, no puede entrar, y el administrador no ve a nadie a quien darle
-- permisos. La única salida era escribir SQL a mano por cada persona.
--
-- Con este trigger, quien se registra aparece de inmediato en la lista con rol
-- LECTOR, que es el mínimo, y un administrador le sube el rol con dos clics.
--
-- EL ROL POR DEFECTO ES LECTOR Y NO ADMIN, a propósito. El patrón de "el
-- primero que se registra queda de administrador" es cómodo y es exactamente
-- cómo se pierde el control de una instalación: si los registros públicos
-- quedan abiertos, el primer desconocido que encuentre la URL se queda con
-- todo. El primer administrador se nombra a mano, una vez, con la sentencia
-- que está al final de este archivo.

create or replace function public.tg_crea_perfil_al_registrarse()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  /*
    El nombre sale de los metadatos que manda el formulario de registro, si los
    manda. Si no, queda vacío y la interfaz muestra el correo, que siempre está.
  */
  insert into public.profiles (user_id, nombre, email, rol, activo)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'lector'::public.rol_usuario,
    true
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

revoke execute on function public.tg_crea_perfil_al_registrarse() from public;
revoke execute on function public.tg_crea_perfil_al_registrarse() from anon;

create trigger usuarios_crean_perfil
  after insert on auth.users
  for each row execute function public.tg_crea_perfil_al_registrarse();

/*
  Y para las cuentas que ya existan en auth.users sin perfil, por haberse
  creado antes de este trigger.
*/
insert into public.profiles (user_id, nombre, email, rol, activo)
select u.id,
       coalesce(u.raw_user_meta_data ->> 'nombre', u.raw_user_meta_data ->> 'full_name', ''),
       u.email,
       'lector'::public.rol_usuario,
       true
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id)
on conflict (user_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- EL PRIMER ADMINISTRADOR SE NOMBRA A MANO. Una vez, después de crear la
-- cuenta en Authentication → Users del panel de Supabase:
--
--   update public.profiles set rol = 'admin'
--   where email = 'tu@correo.cl';
--
-- Desde ahí, el resto de los roles se administra desde la pantalla de Usuarios.
-- ─────────────────────────────────────────────────────────────────────────────
