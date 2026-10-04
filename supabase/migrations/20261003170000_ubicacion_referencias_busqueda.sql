-- 20261003170000_ubicacion_referencias_busqueda.sql
-- Tres cosas que el producto necesitaba y no tenía: dónde está físicamente,
-- qué fuentes respaldan su precio, y poder encontrarlo escribiendo mal.

-- ── Dónde está la pieza ──────────────────────────────────────────────────────
--
-- La columna ubicacion ya existía como TEXTO LIBRE y se queda: ahí va el
-- detalle, "estante C", "vitrina del fondo". Lo que faltaba era la tipología,
-- que es lo que se filtra y lo que decide si una venta se puede retirar en
-- tienda o hay que ir a buscarla a bodega.
--
-- Nullable a propósito: los productos cargados hasta hoy no la tienen, y
-- obligarla con un default inventaría una ubicación para todos ellos.

create type public.tipo_ubicacion as enum ('tienda', 'bodega');

alter table public.productos add column ubicacion_tipo public.tipo_ubicacion;

create index productos_ubicacion_tipo_idx on public.productos
  using btree (ubicacion_tipo) where ubicacion_tipo is not null;

-- ── Referencias web ──────────────────────────────────────────────────────────
--
-- Lo que respalda el precio y la descripción, cuando alguien aprieta el botón
-- de buscar y acepta un resultado.
--
-- SOLO SE GUARDAN LAS ACEPTADAS. Los resultados descartados no dejan fila: una
-- tabla con lo que alguien dijo que NO sirve es una tabla que crece sin que
-- nadie la consulte. Si mañana hace falta medir qué tan buena es la búsqueda,
-- eso se mide en la bitácora de la llamada, no acá.
--
-- Y NO TOCAN EL PRECIO. Una referencia que dice otro precio no reescribe
-- precio_estimado_clp: esa columna es la evidencia de cuánto se equivoca el
-- modelo, y pisarla con lo primero que diga una página la destruye. La
-- referencia queda al lado, como respaldo o como contradicción, y una persona
-- decide.

create table public.producto_referencias (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos(id) on delete cascade,
  url text not null,
  titulo text not null,
  /* Lo que decía la página, en pocas líneas. Se guarda porque la página puede
     desaparecer y el respaldo tiene que seguir diciendo algo. */
  extracto text,
  /* El dominio, separado de la URL, para poder mostrarlo sin parsear en cada
     pintada y para agrupar por fuente. */
  dominio text,
  /*
    Qué respalda. Sirve para que la ficha ordene: las de precio juntas, las de
    descripción juntas. Quien acepta el resultado lo marca.
  */
  respalda text not null default 'ambas',
  precio_mencionado_clp numeric(14,2),
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.producto_referencias
  add constraint producto_referencias_url_http check (url ~* '^https?://');
alter table public.producto_referencias
  add constraint producto_referencias_titulo_no_vacio check (length(btrim(titulo)) > 0);
alter table public.producto_referencias
  add constraint producto_referencias_respalda check (respalda in ('precio', 'descripcion', 'ambas'));
/* La misma URL una sola vez por producto. Aceptar dos veces el mismo resultado
   es lo que pasa cuando se busca de nuevo sin mirar lo que ya había. */
alter table public.producto_referencias
  add constraint producto_referencias_sin_repetir unique (producto_id, url);

create index producto_referencias_producto_idx
  on public.producto_referencias using btree (producto_id, created_at desc);

alter table public.producto_referencias enable row level security;

create policy producto_referencias_select on public.producto_referencias
  as permissive for select to authenticated using (public.puede_leer());
create policy producto_referencias_insert_operador on public.producto_referencias
  as permissive for insert to authenticated with check (public.puede_operar());
create policy producto_referencias_delete_operador on public.producto_referencias
  as permissive for delete to authenticated using (public.puede_operar());
/*
  No hay política de UPDATE, y su ausencia es la regla: una referencia es lo
  que decía una página el día que alguien la aceptó. Si cambió, se borra y se
  busca de nuevo; editarla a mano convertiría el respaldo en una opinión.
*/

revoke all on table public.producto_referencias from anon;

-- ── Bitácora de las búsquedas web ────────────────────────────────────────────
--
-- Misma razón que analisis_imagen: cada búsqueda cuesta plata y hay que poder
-- saber cuánta. La herramienta web_search cobra POR BÚSQUEDA además de los
-- tokens, así que la cuenta de búsquedas se guarda aparte y no se deduce.

create table public.busquedas_web (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid references public.productos(id) on delete set null,
  consulta text,
  modelo text not null,
  resultados integer not null default 0,
  busquedas integer not null default 0,
  tokens_entrada integer,
  tokens_salida integer,
  costo_usd numeric(12,6),
  duracion_ms integer,
  error text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index busquedas_web_fecha_idx on public.busquedas_web using btree (created_at desc);

alter table public.busquedas_web enable row level security;

/* Append only, igual que analisis_imagen y por la misma razón: es el registro
   de lo que se gastó. Un registro de gasto que se puede editar no es registro. */
create policy busquedas_web_select on public.busquedas_web
  as permissive for select to authenticated using (public.puede_leer());
create policy busquedas_web_insert_operador on public.busquedas_web
  as permissive for insert to authenticated with check (public.puede_operar());

revoke all on table public.busquedas_web from anon;

-- ── Buscar escribiendo mal ───────────────────────────────────────────────────
--
-- EL PROBLEMA CONCRETO: hoy la búsqueda es ilike sobre lower(nombre). Quien
-- escribe "muñeca porcelna" no encuentra "Muñeca de porcelana", y quien escribe
-- "porcelana" sin acentos no encuentra nada si el nombre los lleva.
--
-- pg_trgm compara por trigramas, así que tolera letras cambiadas, faltantes y
-- sobrantes. unaccent saca los acentos. Juntas resuelven las dos cosas.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

/*
  unaccent NO es inmutable, así que no sirve directo en un índice. Esta
  envoltura la declara inmutable, que es la forma estándar de resolverlo: la
  función es determinista para un diccionario fijo, y el diccionario de este
  proyecto no cambia.

  search_path fijado y SECURITY DEFINER, como el resto de las funciones.
*/
create or replace function public.normaliza_busqueda(p_texto text)
 returns text
 language sql
 immutable
 security definer
 set search_path to ''
as $function$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_texto, '')));
$function$;

create index productos_nombre_trgm_idx on public.productos
  using gin (public.normaliza_busqueda(nombre) extensions.gin_trgm_ops);
create index productos_descripcion_trgm_idx on public.productos
  using gin (public.normaliza_busqueda(descripcion) extensions.gin_trgm_ops);

/*
  Búsqueda tolerante. Devuelve los productos ordenados por parecido.

  El umbral 0.15 es BAJO a propósito: en un inventario de cientos de piezas,
  dejar fuera lo dudoso es peor que mostrarlo al final de la lista. Quien busca
  "porcelna" prefiere ver quince resultados y elegir, antes que ver cero.
*/
create or replace function public.buscar_productos(p_texto text, p_limite integer default 50)
 returns table (id uuid, parecido real)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select p.id,
         greatest(
           extensions.similarity(public.normaliza_busqueda(p.nombre), public.normaliza_busqueda(p_texto)),
           extensions.similarity(public.normaliza_busqueda(coalesce(p.descripcion, '')), public.normaliza_busqueda(p_texto)) * 0.6,
           /* El SKU se compara exacto por prefijo: quien escribe un SKU lo
              escribe bien, y un parecido difuso ahí solo agrega ruido. */
           case when p.sku ilike p_texto || '%' then 1.0 else 0 end
         )::real as parecido
  from public.productos p
  where public.puede_leer()
    and (
      public.normaliza_busqueda(p.nombre) operator(extensions.%) public.normaliza_busqueda(p_texto)
      or public.normaliza_busqueda(coalesce(p.descripcion, '')) operator(extensions.%) public.normaliza_busqueda(p_texto)
      or p.sku ilike p_texto || '%'
    )
  order by parecido desc, p.nombre
  limit greatest(1, least(coalesce(p_limite, 50), 200));
$function$;

-- ── Búsqueda por foto: el espacio para los vectores ──────────────────────────
--
-- SE CREA LA INFRAESTRUCTURA, NO EL GENERADOR. La tabla, el índice y la
-- función de búsqueda viven acá; quién calcula el vector es una decisión
-- aparte que se toma en la aplicación, y esta migración no la amarra.
--
-- LA DIMENSIÓN ES 256 y corresponde al descriptor perceptual que calcula el
-- servidor sin salir a ninguna API: histograma de color más orientación de
-- bordes. Se eligió así porque funciona desde el primer día, cuesta cero y las
-- imágenes no salen de este proyecto. Si algún día se cambia por embeddings de
-- un modelo, la dimensión cambia y esta tabla se recrea: por eso se guarda el
-- nombre del método en cada fila, para saber qué vectores hay que recalcular.

create extension if not exists vector with schema extensions;

create table public.producto_embeddings (
  imagen_id uuid primary key references public.producto_imagenes(id) on delete cascade,
  producto_id uuid not null references public.productos(id) on delete cascade,
  /* Qué lo calculó. Sin esto, mezclar dos métodos daría distancias que no
     significan nada y nadie sabría cuáles recalcular. */
  metodo text not null,
  vector extensions.vector(256) not null,
  created_at timestamptz not null default now()
);

create index producto_embeddings_producto_idx
  on public.producto_embeddings using btree (producto_id);

/*
  Índice de coseno. Con listas = 100 rinde bien hasta decenas de miles de
  imágenes, que es mucho más de lo que este inventario va a tener. IVFFlat y no
  HNSW porque se construye en un instante y ocupa menos; con este volumen la
  diferencia de velocidad no se nota.
*/
create index producto_embeddings_vector_idx on public.producto_embeddings
  using ivfflat (vector extensions.vector_cosine_ops) with (lists = 100);

alter table public.producto_embeddings enable row level security;

create policy producto_embeddings_select on public.producto_embeddings
  as permissive for select to authenticated using (public.puede_leer());
create policy producto_embeddings_insert_operador on public.producto_embeddings
  as permissive for insert to authenticated with check (public.puede_operar());
create policy producto_embeddings_update_operador on public.producto_embeddings
  as permissive for update to authenticated
  using (public.puede_operar()) with check (public.puede_operar());
create policy producto_embeddings_delete_operador on public.producto_embeddings
  as permissive for delete to authenticated using (public.puede_operar());

revoke all on table public.producto_embeddings from anon;

/*
  Productos parecidos a una foto.

  Devuelve el PARECIDO en 0..1 y no la distancia, porque es lo que se muestra
  en pantalla: "87% de parecido" se entiende, "0.13 de distancia coseno" no.

  Se agrupa por producto y se queda con su mejor imagen: un producto con cuatro
  fotos no puede ocupar los cuatro primeros lugares del resultado.
*/
create or replace function public.productos_parecidos(
  p_vector extensions.vector(256),
  p_limite integer default 12
)
 returns table (producto_id uuid, imagen_id uuid, parecido real)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select distinct on (e.producto_id)
         e.producto_id,
         e.imagen_id,
         (1 - (e.vector operator(extensions.<=>) p_vector))::real as parecido
  from public.producto_embeddings e
  where public.puede_leer()
  order by e.producto_id, e.vector operator(extensions.<=>) p_vector
  limit greatest(1, least(coalesce(p_limite, 12), 50));
$function$;

-- ── Cierre del rol anónimo ───────────────────────────────────────────────────

revoke execute on function public.normaliza_busqueda(text)                      from public, anon;
revoke execute on function public.buscar_productos(text, integer)               from public, anon;
revoke execute on function public.productos_parecidos(extensions.vector, integer) from public, anon;

grant execute on function public.normaliza_busqueda(text)                       to authenticated;
grant execute on function public.buscar_productos(text, integer)                to authenticated;
grant execute on function public.productos_parecidos(extensions.vector, integer) to authenticated;
