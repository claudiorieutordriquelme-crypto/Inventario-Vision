-- 20260903120800_acceso_demo.sql
-- Credenciales de la cuenta de demostración, guardadas en la base y no en el
-- código.
--
-- POR QUÉ UNA TABLA Y NO UNA CONSTANTE EN EL REPOSITORIO. La regla de cero
-- credenciales en el árbol de código no tiene excepción para las de
-- demostración. Acá la clave se carga por SQL, nunca entra a git, y rotarla es
-- un UPDATE en vez de un commit y un despliegue.
--
-- POR QUÉ NO UNA VARIABLE DE ENTORNO, que sería más limpio todavía: en Vercel
-- hay que cargarla a mano y redesplegar, y mientras eso no ocurra la
-- funcionalidad simplemente no existe en producción. Esta tabla la deja
-- operativa desde el primer momento y permite apagarla sin desplegar nada.
--
-- LO QUE HAY QUE TENER PRESENTE: la función de abajo entrega la contraseña en
-- texto claro a cualquiera que la invoque, igual que la pantalla de login la
-- imprime. Ese es su propósito. Por eso la cuenta que se publique acá tiene que
-- ser una cuenta que uno esté dispuesto a que use cualquiera que vea el enlace.

create table public.acceso_demo (
  id boolean primary key default true,
  email text not null,
  password text,
  habilitado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* Una sola fila, con el mismo patrón de id booleano: el primary key impide que
   existan dos configuraciones compitiendo. */
alter table public.acceso_demo add constraint acceso_demo_fila_unica check (id);

alter table public.acceso_demo enable row level security;

/* Solo el administrador ve o cambia esto desde el panel. El resto de los roles
   no tiene por qué leer una contraseña, aunque sea de demostración. */
create policy acceso_demo_admin on public.acceso_demo
  as permissive for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

revoke all on table public.acceso_demo from anon;

create trigger acceso_demo_set_updated_at
  before update on public.acceso_demo
  for each row execute function public.tg_set_updated_at();

/*
  La única función que anon puede ejecutar en todo el esquema.

  Devuelve null cuando la demo está deshabilitada o sin clave cargada, y en ese
  caso el recuadro de la pantalla de login no se dibuja. Así la demostración se
  apaga con un UPDATE y sin desplegar nada:

    update public.acceso_demo set habilitado = false;
*/
create or replace function public.credenciales_demo()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select case
           when d.habilitado
                and d.password is not null
                and length(btrim(d.password)) > 0
             then jsonb_build_object('email', d.email, 'password', d.password)
           else null
         end
  from public.acceso_demo d
  where d.id;
$function$;

revoke execute on function public.credenciales_demo() from public;
revoke execute on function public.credenciales_demo() from anon;
grant execute on function public.credenciales_demo() to anon;
grant execute on function public.credenciales_demo() to authenticated;

/* La fila nace deshabilitada y sin clave. El correo sí puede vivir acá, no es
   una credencial. */
insert into public.acceso_demo (email, password, habilitado)
values ('demo@panicoideas.cl', null, false)
on conflict (id) do nothing;
