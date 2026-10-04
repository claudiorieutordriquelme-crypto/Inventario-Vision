-- 20261004120000_cerebro_agregados.sql
-- Los agregados que alimentan la pantalla Cerebro.
--
-- POR QUE FUNCIONES EN LA BASE Y NO SUMAS EN LA APLICACION. Un panel de
-- gestion pregunta "cuanto se vendio cada mes del ultimo año": traer todas las
-- ventas con todos sus items para sumarlas en el servidor de Next es mover
-- miles de filas para producir doce numeros. Postgres agrupa donde estan los
-- datos y devuelve esas doce filas.
--
-- EL MES ES EL MES DE CHILE, igual que en consumo_api_mes. Con la cuenta en
-- UTC, las ventas de las ultimas veinte horas del 31 caerian en el mes
-- siguiente y el corte no cuadraria con lo que vio quien estuvo vendiendo esa
-- tarde.
--
-- SOLO CUENTAN LAS VENTAS CONFIRMADAS. Un borrador es un carrito abierto que
-- todavia no cobro nada, y una venta anulada se deshizo: sumar cualquiera de
-- los dos haria que el grafico no cuadre con el dinero que hay en la caja.

-- ── Ventas por mes ───────────────────────────────────────────────────────────

create or replace function public.cerebro_ventas_por_mes(p_meses integer default 12)
 returns table (mes date, total_clp numeric, ventas bigint, unidades numeric)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with limites as (
    select date_trunc('month', (now() at time zone 'America/Santiago'))
             - make_interval(months => greatest(0, least(coalesce(p_meses, 12), 36)) - 1) as desde
  ),
  /*
    La serie de meses se genera COMPLETA y despues se une con las ventas. Sin
    esto, un mes sin ventas no aparece y la linea del grafico salta de febrero
    a abril como si marzo no hubiera existido.
  */
  meses as (
    select generate_series(l.desde, date_trunc('month', (now() at time zone 'America/Santiago')), interval '1 month')::date as mes
    from limites l
  )
  select m.mes,
         coalesce(sum(v.total_clp), 0) as total_clp,
         count(distinct v.id) as ventas,
         coalesce(sum(i.cantidad), 0) as unidades
  from meses m
  left join public.ventas v
    on v.estado = 'confirmada'
   and date_trunc('month', (v.confirmada_at at time zone 'America/Santiago'))::date = m.mes
  left join public.venta_items i on i.venta_id = v.id
  where public.puede_leer()
  group by m.mes
  order by m.mes;
$function$;

-- ── Ventas por categoria y mes ───────────────────────────────────────────────
--
-- La categoria se toma del PRODUCTO al momento de consultar, no se guarda en
-- el item. Es una decision con consecuencia: si una pieza se recategoriza, sus
-- ventas viejas se mueven de categoria en este grafico. Se prefiere asi porque
-- la pregunta que responde el panel es "que rubro vende", y el rubro es el que
-- la pieza tiene hoy. Para la boleta historica estan el nombre y el SKU
-- copiados en el item, que no se mueven nunca.

create or replace function public.cerebro_ventas_por_categoria(p_meses integer default 12)
 returns table (mes date, categoria text, total_clp numeric)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select date_trunc('month', (v.confirmada_at at time zone 'America/Santiago'))::date as mes,
         coalesce(c.nombre, 'Sin categoría') as categoria,
         sum(i.subtotal_clp) as total_clp
  from public.ventas v
  join public.venta_items i on i.venta_id = v.id
  left join public.productos p on p.id = i.producto_id
  left join public.categorias c on c.id = p.categoria_id
  where public.puede_leer()
    and v.estado = 'confirmada'
    and v.confirmada_at >= date_trunc('month', (now() at time zone 'America/Santiago'))
          - make_interval(months => greatest(0, least(coalesce(p_meses, 12), 36)) - 1)
  group by 1, 2
  order by 1, 3 desc;
$function$;

-- ── Stock por categoria ──────────────────────────────────────────────────────

create or replace function public.cerebro_stock_por_categoria()
 returns table (
   categoria text,
   productos bigint,
   unidades numeric,
   valor_clp numeric,
   sin_stock bigint
 )
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(c.nombre, 'Sin categoría') as categoria,
         count(*) as productos,
         coalesce(sum(p.cantidad), 0) as unidades,
         /*
           El valor usa precio_vigente_clp, que es el confirmado si existe y el
           estimado si no. Un producto sin ningun precio suma cero y no inventa
           nada: inflar el inventario con precios imaginarios es la forma mas
           rapida de que alguien tome una decision con una cifra falsa.
         */
         coalesce(sum(p.cantidad * coalesce(p.precio_vigente_clp, 0)), 0) as valor_clp,
         count(*) filter (where p.cantidad <= 0) as sin_stock
  from public.productos p
  left join public.categorias c on c.id = p.categoria_id
  where public.puede_leer()
    and p.estado <> 'archivado'
  group by 1
  order by valor_clp desc;
$function$;

-- ── Resumen para las cifras de arriba ────────────────────────────────────────

create or replace function public.cerebro_resumen()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_inicio timestamptz;
  v_mes record;
  v_previo record;
  v_stock record;
begin
  if not public.puede_leer() then
    raise exception 'Necesitas sesion para ver el panel.'
      using errcode = 'insufficient_privilege';
  end if;

  v_inicio := date_trunc('month', (now() at time zone 'America/Santiago'))
                at time zone 'America/Santiago';

  select coalesce(sum(total_clp), 0) as total, count(*) as ventas
  into v_mes
  from public.ventas
  where estado = 'confirmada' and confirmada_at >= v_inicio;

  /* El mes anterior completo, para poder mostrar la variacion. Una cifra sin
     con que compararla no dice si es buena o mala. */
  select coalesce(sum(total_clp), 0) as total, count(*) as ventas
  into v_previo
  from public.ventas
  where estado = 'confirmada'
    and confirmada_at >= v_inicio - interval '1 month'
    and confirmada_at < v_inicio;

  select count(*) as productos,
         coalesce(sum(cantidad * coalesce(precio_vigente_clp, 0)), 0) as valor,
         count(*) filter (where cantidad <= 0) as agotados,
         count(*) filter (where estado = 'borrador') as borradores,
         count(*) filter (where imagenes < 3) as incompletos
  into v_stock
  from public.productos
  where estado <> 'archivado';

  return jsonb_build_object(
    'desde',              v_inicio,
    'vendido_mes',        v_mes.total,
    'ventas_mes',         v_mes.ventas,
    'vendido_mes_previo', v_previo.total,
    'ventas_mes_previo',  v_previo.ventas,
    'ticket_promedio',    case when v_mes.ventas > 0 then round(v_mes.total / v_mes.ventas) else 0 end,
    'productos',          v_stock.productos,
    'valor_stock',        v_stock.valor,
    'agotados',           v_stock.agotados,
    'borradores',         v_stock.borradores,
    'incompletos',        v_stock.incompletos
  );
end;
$function$;

-- ── Cierre del rol anonimo ───────────────────────────────────────────────────

revoke execute on function public.cerebro_ventas_por_mes(integer)       from public, anon;
revoke execute on function public.cerebro_ventas_por_categoria(integer) from public, anon;
revoke execute on function public.cerebro_stock_por_categoria()         from public, anon;
revoke execute on function public.cerebro_resumen()                     from public, anon;

grant execute on function public.cerebro_ventas_por_mes(integer)       to authenticated;
grant execute on function public.cerebro_ventas_por_categoria(integer) to authenticated;
grant execute on function public.cerebro_stock_por_categoria()         to authenticated;
grant execute on function public.cerebro_resumen()                     to authenticated;
