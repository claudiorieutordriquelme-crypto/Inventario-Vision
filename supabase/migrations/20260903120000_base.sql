-- 20260903120000_base.sql
-- Tipos, perfiles y el maestro de categorias con su correlativo de SKU.
--
-- Todo lo que decide quien puede hacer que vive en la base, no en la
-- aplicacion. La interfaz oculta botones por comodidad; la barrera real son
-- estas politicas.

-- ── Tipos ────────────────────────────────────────────────────────────────────

create type public.rol_usuario as enum ('admin', 'operador', 'lector');

-- borrador: lo que dejo el analisis de la foto, todavia sin revisar.
-- confirmado: una persona lo reviso y se hace cargo de los datos.
-- archivado: fuera de circulacion, se conserva para el historial.
create type public.estado_producto as enum ('borrador', 'confirmado', 'archivado');

create type public.tipo_movimiento as enum ('ingreso', 'salida', 'ajuste');

-- De donde salio cada dato del producto. Importa para saber que revisar.
create type public.origen_dato as enum ('ia', 'manual', 'mixto');

-- ── Perfiles ─────────────────────────────────────────────────────────────────

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nombre text not null default '',
  email text,
  rol public.rol_usuario not null default 'lector',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_rol_idx on public.profiles using btree (rol) where activo;

-- ── Helpers de rol ───────────────────────────────────────────────────────────
--
-- Van en SQL y no en la aplicacion porque las politicas RLS los llaman. Con
-- search_path fijado y SECURITY DEFINER: sin eso, un esquema puesto por delante
-- en el search_path del que llama podria suplantar la tabla profiles.

create or replace function public.mi_rol()
 returns public.rol_usuario
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select p.rol
  from public.profiles p
  where p.user_id = auth.uid() and p.activo
  limit 1;
$function$;

create or replace function public.puede_leer()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select public.mi_rol() is not null;
$function$;

create or replace function public.puede_operar()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select public.mi_rol() in ('admin', 'operador');
$function$;

create or replace function public.es_admin()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select public.mi_rol() = 'admin';
$function$;

-- ── updated_at ───────────────────────────────────────────────────────────────

create or replace function public.tg_set_updated_at()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ── Categorias ───────────────────────────────────────────────────────────────
--
-- El prefijo es lo que arma el SKU: HER-0001, TOR-0042. Se guarda en
-- mayusculas y sin espacios, y es unico, porque dos categorias con el mismo
-- prefijo compartirian correlativo y producirian SKU repetidos.

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  prefijo_sku text not null unique,
  descripcion text,
  orden integer not null default 100,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.categorias
  add constraint categorias_codigo_slug check (codigo ~ '^[a-z0-9_]+$');
alter table public.categorias
  add constraint categorias_prefijo_formato check (prefijo_sku ~ '^[A-Z]{2,4}$');
alter table public.categorias
  add constraint categorias_nombre_no_vacio check (length(btrim(nombre)) > 0);

create trigger categorias_set_updated_at
  before update on public.categorias
  for each row execute function public.tg_set_updated_at();

-- ── Correlativo de SKU ───────────────────────────────────────────────────────
--
-- Tabla propia y no una secuencia de Postgres por dos razones:
--  1. Hace falta un correlativo POR PREFIJO, y una secuencia por categoria
--     obligaria a crear objetos de esquema cada vez que alguien agrega una
--     categoria desde la interfaz.
--  2. El numero tiene que poder corregirse a mano si una carga masiva sale
--     mal, y una secuencia no se edita con un UPDATE.
--
-- La carrera se evita con el UPDATE ... RETURNING de la funcion de abajo, que
-- toma el candado de la fila. Dos altas simultaneas se serializan ahi.

create table public.correlativos_sku (
  prefijo text primary key,
  ultimo integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.correlativos_sku
  add constraint correlativos_no_negativo check (ultimo >= 0);
