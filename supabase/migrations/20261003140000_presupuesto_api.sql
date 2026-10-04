-- 20261003140000_presupuesto_api.sql
-- Presupuesto mensual de la API y el consumo real contra el.
--
-- QUE RESPONDE ESTO: "cuanto llevo gastado este mes y cuando tengo que
-- cargar". No sale de Anthropic: sale de la bitacora que esta aplicacion ya
-- escribe en analisis_imagen desde el primer dia, con los tokens y el costo de
-- cada llamada.
--
-- POR QUE NO SE CONSULTA EL SALDO REAL A ANTHROPIC. Existe una API de uso y
-- costo, pero exige una Admin API key de la organizacion, que administra
-- miembros, llaves y espacios de trabajo completos. Esa credencial no tiene
-- nada que hacer dentro de una aplicacion de inventario desplegada en Vercel:
-- si se filtra, lo que se pierde no es el inventario, es la organizacion. Y no
-- hay endpoint publico de saldo de creditos. La bitacora propia responde la
-- misma pregunta sin agregar ninguna credencial.
--
-- LO QUE ESTA CIFRA ES Y NO ES. Es lo que gastaron los analisis de imagen de
-- esta aplicacion, calculado con la tarifa que vivia en el codigo al momento
-- de cada llamada. NO es la factura de Anthropic: no incluye ningun otro
-- consumo de la misma cuenta, ni impuestos, ni ajustes. La pantalla lo dice.

create table public.presupuesto_api (
  id boolean primary key default true,
  /*
    Tope mensual en dolares. Es el denominador del porcentaje, y es una
    decision del negocio, no un dato tecnico: el sistema no puede saber cuanto
    esta dispuesto a gastar quien paga.
  */
  monto_usd_mensual numeric(10,2) not null default 20,
  actualizado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* Una sola fila, mismo patron que acceso_demo: el primary key booleano impide
   que existan dos presupuestos compitiendo. */
alter table public.presupuesto_api add constraint presupuesto_api_fila_unica check (id);
alter table public.presupuesto_api
  add constraint presupuesto_api_monto_positivo check (monto_usd_mensual > 0);

alter table public.presupuesto_api enable row level security;

/* Leer y cambiar el presupuesto es del administrador. El operador ve el
   recuadro con el porcentaje, pero no fija el tope. */
create policy presupuesto_api_admin on public.presupuesto_api
  as permissive for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

revoke all on table public.presupuesto_api from anon;

create trigger presupuesto_api_set_updated_at
  before update on public.presupuesto_api
  for each row execute function public.tg_set_updated_at();

insert into public.presupuesto_api (monto_usd_mensual) values (20)
on conflict (id) do nothing;

/*
  Consumo del mes en curso.

  EL MES ES EL MES DE CHILE, no el UTC. Con una cuenta en UTC, los analisis de
  las ultimas veinte horas del 31 caerian en el mes siguiente y el corte no
  cuadraria con lo que vio la persona que estuvo cargando esa tarde.

  Es SECURITY DEFINER porque lee presupuesto_api, que solo el administrador
  puede leer por RLS, y el recuadro lo ve tambien el operador: el operador
  necesita saber que queda poco, no quien fijo el tope. Se sigue exigiendo
  sesion con puede_leer().

  Devuelve el detalle y no solo el porcentaje a proposito: un numero suelto no
  se puede auditar. Con los tokens y la cantidad de analisis, quien mire el
  recuadro puede explicar de donde salio.
*/
create or replace function public.consumo_api_mes()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_inicio timestamptz;
  v_presupuesto numeric(10,2);
  v_fila record;
begin
  if not public.puede_leer() then
    raise exception 'Necesitas sesion para ver el consumo.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Primer instante del mes local, convertido de vuelta a timestamptz.
  v_inicio := date_trunc('month', (now() at time zone 'America/Santiago'))
                at time zone 'America/Santiago';

  select p.monto_usd_mensual into v_presupuesto from public.presupuesto_api p where p.id;

  select
    coalesce(sum(a.costo_usd), 0)        as costo_usd,
    coalesce(sum(a.tokens_entrada), 0)   as tokens_entrada,
    coalesce(sum(a.tokens_salida), 0)    as tokens_salida,
    count(*)                             as analisis,
    count(*) filter (where a.error is not null) as fallidos
  into v_fila
  from public.analisis_imagen a
  where a.created_at >= v_inicio;

  return jsonb_build_object(
    'desde',            v_inicio,
    'presupuesto_usd',  v_presupuesto,
    'costo_usd',        round(v_fila.costo_usd, 4),
    'tokens_entrada',   v_fila.tokens_entrada,
    'tokens_salida',    v_fila.tokens_salida,
    'analisis',         v_fila.analisis,
    'analisis_fallidos', v_fila.fallidos,
    /*
      El porcentaje se calcula aca y no en la aplicacion para que el recuadro y
      cualquier otra cosa que lo use den el mismo numero. Puede pasar de 100:
      gastar mas del presupuesto es exactamente lo que hay que poder ver.
    */
    'porcentaje',       case
                          when v_presupuesto > 0
                            then round((v_fila.costo_usd / v_presupuesto) * 100, 1)
                          else null
                        end
  );
end;
$function$;

revoke execute on function public.consumo_api_mes() from public, anon;
grant execute on function public.consumo_api_mes() to authenticated;
