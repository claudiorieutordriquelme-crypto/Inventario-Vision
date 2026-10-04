-- 20261003180000_clientes_pos_delivery.sql
-- Punto de venta, clientes y delivery con cajas y QR.
--
-- CINCO DECISIONES QUE ORDENAN TODO LO DEMÁS:
--
--  1. LA VENTA NO ESCRIBE productos.cantidad. Al confirmarse inserta un
--     movimiento de salida y el trigger que ya existe recalcula el stock. Es
--     la regla 7 del proyecto y es lo que impide que el libro y el stock
--     diverjan.
--  2. EL PRECIO DEL ITEM SE CONGELA AL VENDERSE. Se copia a la fila. Sin esto,
--     cambiar el precio de un producto reescribiría la historia de todas las
--     ventas anteriores y los totales de ayer dejarían de cuadrar.
--  3. EL TIPO DE ENTREGA VIVE EN LA VENTA, no en el despacho. Es lo que se
--     decide en el mostrador, con el cliente delante, y es lo que determina si
--     después hay despacho o no.
--  4. UNA VENTA CON DESPACHO CREA SU DESPACHO SOLA. Dejarlo a cargo de una
--     persona significa que algún día una caja no se arma porque nadie apretó
--     un botón, y el cliente llama preguntando por un pedido que el sistema
--     cree entregado en mostrador.
--  5. EL QR DE LA CAJA NO ES UNA CREDENCIAL. Lleva un token no adivinable para
--     que no se pueda enumerar, pero la ruta que lo resuelve exige sesión,
--     igual que todo lo demás. La regla 1 del proyecto no tiene excepciones.

-- ── Tipos ────────────────────────────────────────────────────────────────────

-- Los dos canales del negocio, y no hay un tercero: se decidió así.
create type public.canal_venta as enum ('tienda', 'live');

-- Lo que decide si hay delivery después.
create type public.tipo_entrega as enum ('retiro_tienda', 'despacho');

-- borrador: carrito abierto, todavía no toca el stock.
-- confirmada: se cobró y el stock ya salió.
-- anulada: se deshizo con un ajuste que compensa, y queda a la vista.
create type public.estado_venta as enum ('borrador', 'confirmada', 'anulada');

create type public.medio_pago as enum
  ('efectivo', 'debito', 'credito', 'transferencia', 'otro');

create type public.tipo_comprobante as enum ('ninguno', 'boleta', 'factura');

-- Los cuatro estados de una caja en camino, más la salida de emergencia.
create type public.estado_despacho as enum
  ('pendiente', 'embalado', 'en_ruta', 'entregado', 'anulado');

-- ── Folios ───────────────────────────────────────────────────────────────────
--
-- Mismo mecanismo que el correlativo de SKU y por la misma razón: un número
-- calculado en el servidor de aplicación se repite en cuanto hay dos personas
-- vendiendo a la vez.

create table public.correlativos_folio (
  serie text primary key,
  ultimo integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.correlativos_folio
  add constraint correlativos_folio_no_negativo check (ultimo >= 0);

create or replace function public.siguiente_folio(p_serie text)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_serie text := upper(btrim(p_serie));
  v_numero integer;
begin
  if v_serie !~ '^[A-Z]{1,3}$' then
    raise exception 'La serie del folio tiene que ser de 1 a 3 letras: %', p_serie
      using errcode = 'check_violation';
  end if;

  insert into public.correlativos_folio (serie, ultimo)
  values (v_serie, 0)
  on conflict (serie) do nothing;

  -- El UPDATE ... RETURNING toma el candado de la fila: dos ventas simultáneas
  -- se serializan acá y nunca reciben el mismo folio.
  update public.correlativos_folio
  set ultimo = ultimo + 1, updated_at = now()
  where serie = v_serie
  returning ultimo into v_numero;

  return v_serie || '-' || lpad(v_numero::text, 5, '0');
end;
$function$;

-- ── Clientes ─────────────────────────────────────────────────────────────────
--
-- DATOS PERSONALES. Es la primera tabla del proyecto con nombre, teléfono y
-- dirección de gente real. anon revocado como todo lo demás, borrado reservado
-- al administrador, y la llave desde ventas es RESTRICT para que nadie elimine
-- un cliente y deje ventas huérfanas.

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  email text,
  notas text,
  activo boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clientes
  add constraint clientes_nombre_no_vacio check (length(btrim(nombre)) > 0);

create index clientes_busqueda_idx on public.clientes
  using gin (public.normaliza_busqueda(nombre) extensions.gin_trgm_ops);
create index clientes_telefono_idx on public.clientes using btree (telefono)
  where telefono is not null;
create index clientes_activo_idx on public.clientes using btree (activo, nombre);

create trigger clientes_set_updated_at
  before update on public.clientes
  for each row execute function public.tg_set_updated_at();

/*
  VARIAS DIRECCIONES POR CLIENTE, y es el caso normal: se despacha a la casa,
  después al trabajo, después a la casa de la mamá. Con una sola columna en
  clientes, la segunda dirección pisa la primera y el historial de a dónde se
  mandó cada pedido se pierde.
*/
create table public.cliente_direcciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  /* Cómo la llama el cliente: "casa", "oficina". Para elegirla sin leerla. */
  etiqueta text,
  calle text not null,
  comuna text,
  ciudad text,
  referencia text,
  /* La preferida se ofrece primero. No hay unique: dos marcadas es un detalle
     cosmético, y un unique obligaría a desmarcar antes de marcar. */
  preferida boolean not null default false,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cliente_direcciones
  add constraint cliente_direcciones_calle_no_vacia check (length(btrim(calle)) > 0);

create index cliente_direcciones_cliente_idx
  on public.cliente_direcciones using btree (cliente_id, preferida desc, created_at);

create trigger cliente_direcciones_set_updated_at
  before update on public.cliente_direcciones
  for each row execute function public.tg_set_updated_at();

-- ── Ventas ───────────────────────────────────────────────────────────────────

create table public.ventas (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  /*
    El cliente es opcional PARA RETIRO EN TIENDA. Una venta de mostrador no
    tiene por qué pedirle el nombre a nadie, y exigirlo haría que el vendedor
    invente datos para poder cobrar. Para despacho sí es obligatorio, y eso lo
    hace cumplir el check de más abajo.
  */
  cliente_id uuid references public.clientes(id) on delete restrict,
  direccion_id uuid references public.cliente_direcciones(id) on delete restrict,
  canal public.canal_venta not null default 'tienda',
  tipo_entrega public.tipo_entrega not null default 'retiro_tienda',
  estado public.estado_venta not null default 'borrador',
  medio_pago public.medio_pago,
  comprobante public.tipo_comprobante not null default 'ninguno',
  numero_comprobante text,
  /*
    Total denormalizado, lo mantiene el trigger que suma los ítems. Se guarda y
    no se calcula al vuelo porque el listado del día lo necesita en cada fila,
    y sumar los ítems de cada venta en cada pintada es una consulta por fila.
  */
  total_clp numeric(14,2) not null default 0,
  notas text,
  vendedor_id uuid references public.profiles(id) on delete set null,
  confirmada_at timestamptz,
  anulada_at timestamptz,
  motivo_anulacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ventas
  add constraint ventas_total_no_negativo check (total_clp >= 0);
/*
  La fecha y el estado no pueden contradecirse. Una venta "confirmada" sin
  confirmada_at es una venta que no se puede ubicar en el tiempo, y el corte
  del día la perdería.
*/
alter table public.ventas
  add constraint ventas_confirmada_con_fecha check (
    (estado <> 'confirmada' or confirmada_at is not null)
    and (estado <> 'anulada' or anulada_at is not null)
  );
/*
  DESPACHAR EXIGE CLIENTE Y DIRECCIÓN, y solo al confirmar. En borrador se
  permite armar el carrito antes de preguntarle los datos al cliente, que es
  el orden en que pasa de verdad en un live.
*/
alter table public.ventas
  add constraint ventas_despacho_con_destino check (
    estado <> 'confirmada'
    or tipo_entrega <> 'despacho'
    or (cliente_id is not null and direccion_id is not null)
  );
/* Cobrar exige decir con qué se pagó. Sin esto, el corte de caja del día no se
   puede cuadrar contra nada. */
alter table public.ventas
  add constraint ventas_confirmada_con_pago check (
    estado <> 'confirmada' or medio_pago is not null
  );

create index ventas_estado_fecha_idx on public.ventas using btree (estado, created_at desc);
create index ventas_cliente_idx on public.ventas using btree (cliente_id)
  where cliente_id is not null;
create index ventas_confirmada_idx on public.ventas using btree (confirmada_at desc)
  where confirmada_at is not null;

create trigger ventas_set_updated_at
  before update on public.ventas
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_asigna_folio_venta()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.folio is null or length(btrim(new.folio)) = 0 then
    new.folio := public.siguiente_folio('V');
  end if;
  return new;
end;
$function$;

create trigger ventas_asigna_folio
  before insert on public.ventas
  for each row execute function public.tg_asigna_folio_venta();

-- ── Ítems de la venta ────────────────────────────────────────────────────────

create table public.venta_items (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references public.ventas(id) on delete cascade,
  /*
    RESTRICT, no CASCADE: un producto vendido no se borra del inventario. Para
    sacarlo de circulación se archiva.
  */
  producto_id uuid not null references public.productos(id) on delete restrict,
  /*
    El nombre y el SKU se copian. No es redundancia: es lo que hace que el
    comprobante de hace tres meses siga diciendo qué se vendió aunque el
    producto se haya renombrado después.
  */
  nombre text not null,
  sku text not null,
  cantidad numeric(14,3) not null,
  /* Congelado al agregarlo al carrito. Ver nota 2 del encabezado. */
  precio_unitario_clp numeric(14,2) not null,
  subtotal_clp numeric(14,2)
    generated always as (round(cantidad * precio_unitario_clp, 2)) stored,
  created_at timestamptz not null default now()
);

alter table public.venta_items
  add constraint venta_items_cantidad_positiva check (cantidad > 0);
alter table public.venta_items
  add constraint venta_items_precio_no_negativo check (precio_unitario_clp >= 0);
/*
  Un producto aparece una sola vez por venta. Dos líneas del mismo artículo son
  una fuente de descuadre al contar y no aportan nada: se suma la cantidad.
*/
alter table public.venta_items
  add constraint venta_items_producto_unico unique (venta_id, producto_id);

create index venta_items_venta_idx on public.venta_items using btree (venta_id);
create index venta_items_producto_idx on public.venta_items using btree (producto_id);

create or replace function public.tg_recalcula_total_venta()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_venta uuid := coalesce(new.venta_id, old.venta_id);
begin
  update public.ventas v
  set total_clp = coalesce((
    select sum(i.subtotal_clp) from public.venta_items i where i.venta_id = v_venta
  ), 0)
  where v.id = v_venta;
  return null;
end;
$function$;

create trigger venta_items_recalcula_total
  after insert or update or delete on public.venta_items
  for each row execute function public.tg_recalcula_total_venta();

/*
  Una venta confirmada no cambia de productos.

  Sin esto, agregar un ítem después de confirmar descontaría stock que nadie
  registró, o peor: cambiaría el total de una venta ya cobrada. La corrección
  de una venta confirmada es anularla y hacer otra.
*/
create or replace function public.tg_venta_cerrada_no_se_edita()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_estado public.estado_venta;
  v_venta uuid := coalesce(new.venta_id, old.venta_id);
begin
  select v.estado into v_estado from public.ventas v where v.id = v_venta;

  /* Si la venta ya no existe, esto es el CASCADE borrando sus ítems. El
     candado es contra editar una venta cerrada, no contra borrar un borrador. */
  if v_estado is null then
    return coalesce(new, old);
  end if;

  if v_estado <> 'borrador' then
    raise exception 'La venta ya no está en borrador: no se le pueden cambiar los productos.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$function$;

create trigger venta_items_solo_en_borrador
  before insert or update or delete on public.venta_items
  for each row execute function public.tg_venta_cerrada_no_se_edita();

/*
  PIEZA ÚNICA: NO SE VENDE DOS VECES.

  El control de stock ya lo impide casi siempre, porque una pieza única tiene
  saldo 1 y la segunda venta no alcanza. Pero hay una ventana real: dos
  carritos en borrador con la misma pieza, los dos armados antes de que
  cualquiera confirme. El stock todavía es 1 y ninguno de los dos ha descontado
  nada.

  Esto cierra esa ventana: una pieza única no puede estar en dos ventas vivas a
  la vez. La primera en confirmar se la lleva.
*/
create or replace function public.tg_pieza_unica_una_venta()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_categoria uuid;
  v_otra text;
begin
  select categoria_id into v_categoria from public.productos where id = new.producto_id;

  if v_categoria is null or not public.categoria_es_pieza_unica(v_categoria) then
    return new;
  end if;

  if new.cantidad > 1 then
    raise exception 'Es una pieza única: no se pueden vender % unidades.', new.cantidad
      using errcode = 'check_violation';
  end if;

  select v.folio into v_otra
  from public.venta_items i
  join public.ventas v on v.id = i.venta_id
  where i.producto_id = new.producto_id
    and i.venta_id <> new.venta_id
    and v.estado in ('borrador', 'confirmada')
  limit 1;

  if v_otra is not null then
    raise exception 'Esta pieza única ya está en la venta %. Sácala de ahí antes de agregarla acá.', v_otra
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

create trigger venta_items_pieza_unica
  before insert or update on public.venta_items
  for each row execute function public.tg_pieza_unica_una_venta();

-- ── Despachos ────────────────────────────────────────────────────────────────

create table public.despachos (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  estado public.estado_despacho not null default 'pendiente',
  cliente_id uuid references public.clientes(id) on delete restrict,
  /*
    La dirección se COPIA al crear el despacho y después vive aparte. El
    cliente se puede mudar; la caja que salió el martes fue a la dirección de
    ese martes, y el registro tiene que seguir diciéndolo.
  */
  direccion text,
  comuna text,
  ciudad text,
  referencia text,
  contacto text,
  telefono text,
  notas text,
  preparado_por uuid references public.profiles(id) on delete set null,
  entregado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.despachos
  add constraint despachos_entregado_con_fecha check (
    estado <> 'entregado' or entregado_at is not null
  );

create index despachos_estado_idx on public.despachos using btree (estado, created_at desc);
create index despachos_cliente_idx on public.despachos using btree (cliente_id)
  where cliente_id is not null;

create trigger despachos_set_updated_at
  before update on public.despachos
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_asigna_folio_despacho()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.folio is null or length(btrim(new.folio)) = 0 then
    new.folio := public.siguiente_folio('D');
  end if;
  return new;
end;
$function$;

create trigger despachos_asigna_folio
  before insert on public.despachos
  for each row execute function public.tg_asigna_folio_despacho();

/*
  La puente. Varias ventas en un despacho, pero cada venta en uno solo: por eso
  venta_id es UNIQUE. Despachar la misma venta dos veces es mandar la
  mercadería dos veces.
*/
create table public.despacho_ventas (
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  venta_id uuid not null references public.ventas(id) on delete restrict unique,
  created_at timestamptz not null default now(),
  primary key (despacho_id, venta_id)
);

create index despacho_ventas_despacho_idx on public.despacho_ventas using btree (despacho_id);

-- ── Cajas ────────────────────────────────────────────────────────────────────
--
-- UN DESPACHO PUEDE IR EN VARIAS CAJAS, y cada caja lleva su propio QR. El
-- caso es el de siempre: seis piezas de menaje no entran en una sola, y quien
-- recibe tiene que poder abrir la caja 2 de 3 y saber qué debería haber
-- adentro sin abrir las otras dos.

create table public.cajas (
  id uuid primary key default gen_random_uuid(),
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  /* 1, 2, 3... dentro del despacho. Es lo que se imprime: "caja 2 de 3". */
  numero integer not null,
  /*
    EL TOKEN DEL QR. Identificador opaco para pegar en la caja y escanear al
    entregar, NO una credencial: la ruta que lo resuelve está dentro del panel
    y exige sesión. Es no adivinable para que nadie pueda enumerar las cajas de
    nadie, no para reemplazar el inicio de sesión.
  */
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  peso_kg numeric(10,2),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cajas add constraint cajas_numero_positivo check (numero > 0);
alter table public.cajas add constraint cajas_numero_unico unique (despacho_id, numero);
alter table public.cajas
  add constraint cajas_peso_positivo check (peso_kg is null or peso_kg > 0);

create index cajas_despacho_idx on public.cajas using btree (despacho_id, numero);

create trigger cajas_set_updated_at
  before update on public.cajas
  for each row execute function public.tg_set_updated_at();

/*
  Qué va en cada caja.

  Apunta al ÍTEM DE LA VENTA y no al producto: lo que se embala es "las dos
  tazas de la venta V-00012", no "tazas" en abstracto. Con el producto suelto,
  dos ventas del mismo artículo en el mismo despacho serían indistinguibles al
  armar las cajas.
*/
create table public.caja_items (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id) on delete cascade,
  venta_item_id uuid not null references public.venta_items(id) on delete cascade,
  cantidad numeric(14,3) not null,
  created_at timestamptz not null default now()
);

alter table public.caja_items
  add constraint caja_items_cantidad_positiva check (cantidad > 0);
/* El mismo ítem una vez por caja. Repartirlo entre dos cajas se hace con dos
   filas en cajas distintas, que es exactamente lo que esta llave permite. */
alter table public.caja_items
  add constraint caja_items_sin_repetir unique (caja_id, venta_item_id);

create index caja_items_caja_idx on public.caja_items using btree (caja_id);
create index caja_items_venta_item_idx on public.caja_items using btree (venta_item_id);

/*
  No se puede embalar más de lo que se vendió.

  Sin esto, repartir un ítem de 3 unidades entre dos cajas permite poner 2 y 2,
  y la lista de embalaje promete cuatro cosas que no existen. Quien recibe
  cuenta tres y reclama.
*/
create or replace function public.tg_caja_items_no_excede()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_vendida numeric(14,3);
  v_embalada numeric(14,3);
begin
  select i.cantidad into v_vendida
  from public.venta_items i where i.id = new.venta_item_id;

  select coalesce(sum(c.cantidad), 0) into v_embalada
  from public.caja_items c
  where c.venta_item_id = new.venta_item_id
    and c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_embalada + new.cantidad > v_vendida then
    raise exception 'De ese artículo se vendieron % y ya hay % en cajas: no caben % más.',
      v_vendida, v_embalada, new.cantidad
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

create trigger caja_items_no_excede
  before insert or update on public.caja_items
  for each row execute function public.tg_caja_items_no_excede();

-- ── Confirmar y anular ───────────────────────────────────────────────────────
--
-- POR QUÉ ESTO ES UNA FUNCIÓN Y NO CÓDIGO DE LA APLICACIÓN. Confirmar una
-- venta es validar el stock de cada ítem, insertar un movimiento por ítem,
-- cambiar el estado y, si corresponde, crear el despacho. Esas cosas ocurren
-- juntas o no ocurren. Hechas desde la aplicación con cuatro llamadas, una
-- caída en la segunda deja stock descontado de una venta que figura en
-- borrador, y eso no se detecta hasta que alguien cuenta a mano.

create or replace function public.confirmar_venta(
  p_venta uuid,
  p_medio_pago public.medio_pago,
  p_comprobante public.tipo_comprobante default 'ninguno',
  p_numero_comprobante text default null
)
 returns public.ventas
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_venta public.ventas;
  v_item record;
  v_perfil uuid;
  v_despacho uuid;
  v_dir record;
begin
  if not public.puede_operar() then
    raise exception 'Tu rol no tiene permiso para confirmar ventas.'
      using errcode = 'insufficient_privilege';
  end if;

  select p.id into v_perfil from public.profiles p where p.user_id = auth.uid();

  /* FOR UPDATE toma el candado de la venta: dos pestañas confirmando la misma
     descontarían el stock dos veces sin esto. */
  select * into v_venta from public.ventas where id = p_venta for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;
  if v_venta.estado <> 'borrador' then
    raise exception 'Esta venta ya está %, no se puede confirmar de nuevo.', v_venta.estado
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.venta_items where venta_id = p_venta) then
    raise exception 'La venta no tiene productos.' using errcode = 'check_violation';
  end if;
  if p_medio_pago is null then
    raise exception 'Falta indicar con qué se pagó.' using errcode = 'check_violation';
  end if;
  if v_venta.tipo_entrega = 'despacho'
     and (v_venta.cliente_id is null or v_venta.direccion_id is null) then
    raise exception 'Una venta con despacho necesita cliente y dirección.'
      using errcode = 'check_violation';
  end if;

  /*
    Se valida el stock de TODOS los ítems antes de mover ninguno. Validar y
    descontar en la misma pasada dejaría media venta aplicada cuando el
    artículo que falta es el último de la lista.
  */
  for v_item in
    select i.producto_id, i.cantidad, i.nombre, p.cantidad as disponible
    from public.venta_items i
    join public.productos p on p.id = i.producto_id
    where i.venta_id = p_venta
    for update of p
  loop
    if v_item.disponible < v_item.cantidad then
      raise exception 'No alcanza el stock de %: hay % y la venta pide %.',
        v_item.nombre, v_item.disponible, v_item.cantidad
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Un movimiento de salida por ítem. El trigger del libro recalcula el stock.
  insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo, creado_por)
  select i.producto_id, 'salida', -i.cantidad, 'Venta ' || v_venta.folio, v_perfil
  from public.venta_items i
  where i.venta_id = p_venta;

  update public.ventas
  set estado = 'confirmada',
      confirmada_at = now(),
      medio_pago = p_medio_pago,
      comprobante = p_comprobante,
      numero_comprobante = nullif(btrim(coalesce(p_numero_comprobante, '')), ''),
      vendedor_id = coalesce(vendedor_id, v_perfil)
  where id = p_venta
  returning * into v_venta;

  /*
    EL DESPACHO SE CREA SOLO. Ver la decisión 4 del encabezado: dejarlo a cargo
    de una persona significa que algún día una caja no se arma porque nadie
    apretó un botón.
  */
  if v_venta.tipo_entrega = 'despacho' then
    select d.calle, d.comuna, d.ciudad, d.referencia into v_dir
    from public.cliente_direcciones d where d.id = v_venta.direccion_id;

    insert into public.despachos
      (estado, cliente_id, direccion, comuna, ciudad, referencia, contacto, telefono)
    select 'pendiente', v_venta.cliente_id, v_dir.calle, v_dir.comuna, v_dir.ciudad,
           v_dir.referencia, c.nombre, c.telefono
    from public.clientes c where c.id = v_venta.cliente_id
    returning id into v_despacho;

    insert into public.despacho_ventas (despacho_id, venta_id)
    values (v_despacho, p_venta);

    /* Y su primera caja, vacía. Un despacho sin ninguna caja no se puede
       empezar a embalar, y crearla a mano es un paso que no decide nada. */
    insert into public.cajas (despacho_id, numero) values (v_despacho, 1);
  end if;

  return v_venta;
end;
$function$;

/*
  Anular una venta confirmada devuelve el stock CON UN AJUSTE QUE COMPENSA, no
  borrando el movimiento de salida. Es la regla 6 del proyecto: el libro es de
  solo agregar. Después de anular quedan las dos líneas y se puede reconstruir
  qué pasó.
*/
create or replace function public.anular_venta(p_venta uuid, p_motivo text)
 returns public.ventas
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_venta public.ventas;
  v_perfil uuid;
begin
  if not public.puede_operar() then
    raise exception 'Tu rol no tiene permiso para anular ventas.'
      using errcode = 'insufficient_privilege';
  end if;
  if p_motivo is null or length(btrim(p_motivo)) = 0 then
    raise exception 'Una anulación necesita motivo.' using errcode = 'check_violation';
  end if;

  select p.id into v_perfil from public.profiles p where p.user_id = auth.uid();
  select * into v_venta from public.ventas where id = p_venta for update;

  if v_venta.id is null then
    raise exception 'La venta no existe.' using errcode = 'no_data_found';
  end if;
  if v_venta.estado <> 'confirmada' then
    raise exception 'Solo se anula una venta confirmada. Esta está %.', v_venta.estado
      using errcode = 'check_violation';
  end if;

  /*
    Si la venta ya salió en una caja entregada, anularla sumaría al stock
    mercadería que se fue. Se bloquea.
  */
  if exists (
    select 1 from public.despacho_ventas dv
    join public.despachos d on d.id = dv.despacho_id
    where dv.venta_id = p_venta and d.estado = 'entregado'
  ) then
    raise exception 'Esta venta ya fue entregada en un despacho: no se puede anular.'
      using errcode = 'check_violation';
  end if;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo, creado_por)
  select i.producto_id, 'ajuste', i.cantidad,
         'Anulación de venta ' || v_venta.folio || ': ' || btrim(p_motivo), v_perfil
  from public.venta_items i
  where i.venta_id = p_venta;

  update public.ventas
  set estado = 'anulada', anulada_at = now(), motivo_anulacion = btrim(p_motivo)
  where id = p_venta
  returning * into v_venta;

  /* El despacho que quedó sin razón de ser se anula también. Dejarlo pendiente
     haría que alguien arme una caja para una venta que no existe. */
  update public.despachos d
  set estado = 'anulado'
  where d.estado <> 'entregado'
    and exists (select 1 from public.despacho_ventas dv
                where dv.despacho_id = d.id and dv.venta_id = p_venta)
    and not exists (select 1 from public.despacho_ventas dv
                    join public.ventas v2 on v2.id = dv.venta_id
                    where dv.despacho_id = d.id and v2.estado = 'confirmada');

  return v_venta;
end;
$function$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- LOS PERMISOS, DICHOS DE UNA VEZ:
--   vender          admin y operador
--   despachar       admin y operador
--   editar clientes admin y operador
--   borrar clientes solo admin
--   ver todo        también el lector, que no puede escribir nada

alter table public.correlativos_folio   enable row level security;
alter table public.clientes             enable row level security;
alter table public.cliente_direcciones  enable row level security;
alter table public.ventas               enable row level security;
alter table public.venta_items          enable row level security;
alter table public.despachos            enable row level security;
alter table public.despacho_ventas      enable row level security;
alter table public.cajas                enable row level security;
alter table public.caja_items           enable row level security;

create policy correlativos_folio_select on public.correlativos_folio
  as permissive for select to authenticated using (public.puede_leer());
create policy correlativos_folio_admin on public.correlativos_folio
  as permissive for all to authenticated
  using (public.es_admin()) with check (public.es_admin());

create policy clientes_select on public.clientes
  as permissive for select to authenticated using (public.puede_leer());
create policy clientes_insert_operador on public.clientes
  as permissive for insert to authenticated with check (public.puede_operar());
create policy clientes_update_operador on public.clientes
  as permissive for update to authenticated
  using (public.puede_operar()) with check (public.puede_operar());
/* Borrar es solo del administrador, y la llave RESTRICT desde ventas igual lo
   impide si tiene historial. Para sacarlo de las listas está el campo activo. */
create policy clientes_delete_admin on public.clientes
  as permissive for delete to authenticated using (public.es_admin());

create policy cliente_direcciones_select on public.cliente_direcciones
  as permissive for select to authenticated using (public.puede_leer());
create policy cliente_direcciones_operador on public.cliente_direcciones
  as permissive for all to authenticated
  using (public.puede_operar()) with check (public.puede_operar());

create policy ventas_select on public.ventas
  as permissive for select to authenticated using (public.puede_leer());
create policy ventas_insert_operador on public.ventas
  as permissive for insert to authenticated with check (public.puede_operar());
/*
  El UPDATE directo se limita a las ventas en borrador. Confirmar y anular NO
  pasan por acá: son funciones que además escriben el libro. Sin este using,
  alguien podría marcar una venta como confirmada con un UPDATE y saltarse el
  descuento de stock por completo.
*/
create policy ventas_update_borrador on public.ventas
  as permissive for update to authenticated
  using (public.puede_operar() and estado = 'borrador')
  with check (public.puede_operar() and estado = 'borrador');
/* Borrar solo el administrador y solo un borrador. Una venta confirmada es
   parte de la contabilidad del día: se anula, no se borra. */
create policy ventas_delete_admin on public.ventas
  as permissive for delete to authenticated
  using (public.es_admin() and estado = 'borrador');

create policy venta_items_select on public.venta_items
  as permissive for select to authenticated using (public.puede_leer());
create policy venta_items_operador on public.venta_items
  as permissive for all to authenticated
  using (public.puede_operar()) with check (public.puede_operar());

create policy despachos_select on public.despachos
  as permissive for select to authenticated using (public.puede_leer());
create policy despachos_insert_operador on public.despachos
  as permissive for insert to authenticated with check (public.puede_operar());
create policy despachos_update_operador on public.despachos
  as permissive for update to authenticated
  using (public.puede_operar()) with check (public.puede_operar());
create policy despachos_delete_admin on public.despachos
  as permissive for delete to authenticated
  using (public.es_admin() and estado <> 'entregado');

create policy despacho_ventas_select on public.despacho_ventas
  as permissive for select to authenticated using (public.puede_leer());
create policy despacho_ventas_insert_operador on public.despacho_ventas
  as permissive for insert to authenticated with check (public.puede_operar());
/* Sacar una venta de un despacho se permite mientras no se haya entregado. No
   hay UPDATE: una venta se saca y se vuelve a agregar, no se reasigna. */
create policy despacho_ventas_delete_operador on public.despacho_ventas
  as permissive for delete to authenticated
  using (
    public.puede_operar()
    and exists (select 1 from public.despachos d
                where d.id = despacho_id and d.estado <> 'entregado')
  );

create policy cajas_select on public.cajas
  as permissive for select to authenticated using (public.puede_leer());
create policy cajas_operador on public.cajas
  as permissive for all to authenticated
  using (public.puede_operar()) with check (public.puede_operar());

create policy caja_items_select on public.caja_items
  as permissive for select to authenticated using (public.puede_leer());
create policy caja_items_operador on public.caja_items
  as permissive for all to authenticated
  using (public.puede_operar()) with check (public.puede_operar());

-- ── Cierre del rol anónimo ───────────────────────────────────────────────────

revoke all on table public.correlativos_folio  from anon;
revoke all on table public.clientes            from anon;
revoke all on table public.cliente_direcciones from anon;
revoke all on table public.ventas              from anon;
revoke all on table public.venta_items         from anon;
revoke all on table public.despachos           from anon;
revoke all on table public.despacho_ventas     from anon;
revoke all on table public.cajas               from anon;
revoke all on table public.caja_items          from anon;

revoke execute on function public.siguiente_folio(text)                from public, anon;
revoke execute on function public.tg_asigna_folio_venta()              from public, anon;
revoke execute on function public.tg_asigna_folio_despacho()           from public, anon;
revoke execute on function public.tg_recalcula_total_venta()           from public, anon;
revoke execute on function public.tg_venta_cerrada_no_se_edita()       from public, anon;
revoke execute on function public.tg_pieza_unica_una_venta()           from public, anon;
revoke execute on function public.tg_caja_items_no_excede()            from public, anon;
revoke execute on function public.confirmar_venta(uuid, public.medio_pago, public.tipo_comprobante, text)
  from public, anon;
revoke execute on function public.anular_venta(uuid, text)             from public, anon;

grant execute on function public.confirmar_venta(uuid, public.medio_pago, public.tipo_comprobante, text)
  to authenticated;
grant execute on function public.anular_venta(uuid, text) to authenticated;
