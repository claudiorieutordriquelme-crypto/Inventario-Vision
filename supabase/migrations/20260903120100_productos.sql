-- 20260903120100_productos.sql
-- Productos, el libro de movimientos y la bitacora de los analisis de imagen.

-- ── Productos ────────────────────────────────────────────────────────────────

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  nombre text not null,
  descripcion text,
  categoria_id uuid references public.categorias(id) on delete restrict,

  cantidad numeric(14,3) not null default 0,
  unidad text not null default 'unidad',

  /*
    DOS PRECIOS, Y ES LO MAS IMPORTANTE DE ESTA TABLA.

    precio_estimado_clp es lo que dijo el modelo al mirar la foto. NUNCA lo
    sobreescribe una persona: es evidencia de que estimo la maquina y cuando.
    precio_confirmado_clp es lo que decidio un humano.

    Separarlos permite responder dos preguntas que con una sola columna se
    pierden para siempre: cuanto se equivoca el modelo, y que precios todavia
    no ha revisado nadie. Con una columna sola, la primera correccion borra la
    estimacion y no queda contra que comparar.
  */
  precio_estimado_clp numeric(14,2),
  precio_confirmado_clp numeric(14,2),
  precio_vigente_clp numeric(14,2)
    generated always as (coalesce(precio_confirmado_clp, precio_estimado_clp)) stored,

  ubicacion text,
  estado public.estado_producto not null default 'borrador',
  origen public.origen_dato not null default 'ia',

  foto_path text,
  foto_bucket text default 'fotos',

  notas text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.productos
  add constraint productos_nombre_no_vacio check (length(btrim(nombre)) > 0);
alter table public.productos
  add constraint productos_cantidad_no_negativa check (cantidad >= 0);
alter table public.productos
  add constraint productos_precios_no_negativos check (
    (precio_estimado_clp is null or precio_estimado_clp >= 0)
    and (precio_confirmado_clp is null or precio_confirmado_clp >= 0)
  );
/*
  Un producto confirmado tiene que tener categoria. Es la condicion que hace
  util el inventario: sin categoria no entra en ningun corte ni en ningun
  total por familia. En borrador se permite, porque el analisis puede no haber
  reconocido la categoria y alguien tiene que poder revisarlo igual.
*/
alter table public.productos
  add constraint productos_confirmado_exige_categoria check (
    estado <> 'confirmado' or categoria_id is not null
  );

create index productos_categoria_idx on public.productos using btree (categoria_id);
create index productos_estado_idx on public.productos using btree (estado);
create index productos_creado_idx on public.productos using btree (created_at desc);
/*
  Busqueda por nombre y SKU sin distinguir mayusculas ni acentos. unaccent no
  es inmutable, asi que no sirve en un indice; se normaliza con lower() y la
  busqueda de la aplicacion usa ilike sobre esta expresion.
*/
create index productos_busqueda_idx on public.productos using btree (lower(nombre));

create trigger productos_set_updated_at
  before update on public.productos
  for each row execute function public.tg_set_updated_at();

-- ── SKU ──────────────────────────────────────────────────────────────────────

/*
  Siguiente SKU de un prefijo, sin carreras.

  El UPDATE ... RETURNING toma el candado de la fila del correlativo, asi que
  dos altas simultaneas se serializan ahi y nunca reciben el mismo numero. El
  INSERT ... ON CONFLICT DO NOTHING de arriba crea la fila la primera vez que
  se usa un prefijo.

  Formato: PREFIJO-0001. Cuatro digitos con relleno, y si se pasa de 9999 sigue
  creciendo sin romperse: HER-10000 es igual de valido, solo pierde el relleno.
*/
create or replace function public.siguiente_sku(p_prefijo text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_prefijo text := upper(btrim(p_prefijo));
  v_numero integer;
begin
  if v_prefijo !~ '^[A-Z]{2,4}$' then
    raise exception 'El prefijo de SKU tiene que ser de 2 a 4 letras: %', p_prefijo
      using errcode = 'check_violation';
  end if;

  insert into public.correlativos_sku (prefijo, ultimo)
  values (v_prefijo, 0)
  on conflict (prefijo) do nothing;

  update public.correlativos_sku
  set ultimo = ultimo + 1, updated_at = now()
  where prefijo = v_prefijo
  returning ultimo into v_numero;

  return v_prefijo || '-' || lpad(v_numero::text, 4, '0');
end;
$function$;

/*
  Asigna el SKU al insertar, si no vino uno.

  Se hace en la base y no en la aplicacion porque el SKU tiene que ser unico
  aunque el producto entre por otro camino: una carga masiva, una correccion
  por SQL, otro cliente. Un correlativo calculado en el servidor de aplicacion
  es un correlativo que se repite en cuanto hay dos procesos.

  Sin categoria el prefijo es GEN, de generico. Un producto en borrador que el
  analisis no supo clasificar igual necesita un identificador para que alguien
  pueda encontrarlo y corregirlo.
*/
create or replace function public.tg_asigna_sku()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_prefijo text;
begin
  if new.sku is not null and length(btrim(new.sku)) > 0 then
    return new;
  end if;

  select c.prefijo_sku into v_prefijo
  from public.categorias c
  where c.id = new.categoria_id;

  new.sku := public.siguiente_sku(coalesce(v_prefijo, 'GEN'));
  return new;
end;
$function$;

create trigger productos_asigna_sku
  before insert on public.productos
  for each row execute function public.tg_asigna_sku();

-- ── Libro de movimientos ─────────────────────────────────────────────────────
--
-- APPEND ONLY. Nadie borra una fila de aca, ni el administrador. Una
-- correccion se hace con un movimiento de ajuste que compensa, y ese ajuste
-- queda registrado. Asi el inventario se puede auditar hacia atras: la
-- cantidad de un producto siempre es la suma de su libro.

create table public.movimientos_inventario (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete restrict,
  tipo public.tipo_movimiento not null,
  cantidad numeric(14,3) not null,
  motivo text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.movimientos_inventario
  add constraint movimientos_cantidad_no_cero check (cantidad <> 0);
/*
  El signo tiene que ser coherente con el tipo. Un "ingreso" de -5 seria una
  salida disfrazada, y el libro dejaria de poder leerse de un vistazo. El
  ajuste es el unico que admite los dos signos, porque para eso existe.
*/
alter table public.movimientos_inventario
  add constraint movimientos_signo_coherente check (
    (tipo = 'ingreso' and cantidad > 0)
    or (tipo = 'salida' and cantidad < 0)
    or tipo = 'ajuste'
  );

create index movimientos_producto_fecha_idx
  on public.movimientos_inventario using btree (producto_id, created_at desc);

/*
  El movimiento manda sobre la cantidad del producto, no al reves.

  La aplicacion nunca escribe productos.cantidad directamente: inserta un
  movimiento y este trigger recalcula. Si la aplicacion pudiera hacer las dos
  cosas, un dia el total y el libro dejarian de coincidir y no habria forma de
  saber cual de los dos miente.
*/
create or replace function public.tg_aplica_movimiento()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_producto uuid := coalesce(new.producto_id, old.producto_id);
begin
  update public.productos p
  set cantidad = coalesce((
    select sum(m.cantidad)
    from public.movimientos_inventario m
    where m.producto_id = v_producto
  ), 0)
  where p.id = v_producto;

  return null;
end;
$function$;

create trigger movimientos_aplica
  after insert or update on public.movimientos_inventario
  for each row execute function public.tg_aplica_movimiento();

-- ── Bitacora de los analisis de imagen ───────────────────────────────────────
--
-- Cada llamada al modelo queda registrada con lo que devolvio y cuanto costo.
--
-- Por que esto no es opcional: el precio que muestra la aplicacion es una
-- ESTIMACION DE UN MODELO, no un precio de mercado consultado en la web. Sin
-- esta tabla no habria forma de responder "de donde salio este numero" seis
-- meses despues, y un precio sin procedencia en un inventario es un numero que
-- alguien va a usar para tomar una decision creyendo que es un dato.

create table public.analisis_imagen (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete set null,

  foto_path text not null,
  modelo text not null,
  version_prompt text not null,

  /* Lo que devolvio el modelo, tal cual, antes de que nadie lo tocara. */
  respuesta jsonb not null,
  confianza numeric(4,3),

  tokens_entrada integer,
  tokens_salida integer,
  /* Costo estimado en USD segun la tarifa vigente al momento de la llamada. */
  costo_usd numeric(12,6),
  duracion_ms integer,

  error text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.analisis_imagen
  add constraint analisis_confianza_rango check (
    confianza is null or (confianza >= 0 and confianza <= 1)
  );

create index analisis_producto_idx on public.analisis_imagen using btree (producto_id);
create index analisis_fecha_idx on public.analisis_imagen using btree (created_at desc);
