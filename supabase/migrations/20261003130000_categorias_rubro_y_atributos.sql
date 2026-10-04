-- 20261003130000_categorias_rubro_y_atributos.sql
-- Categorias del rubro (menaje, antiguedades, muñecas, coleccion),
-- subcategorias, y los atributos que esos rubros necesitan.
--
-- NO TOCA NADA DE LO QUE YA FUNCIONA. Todas las columnas nuevas son nullable o
-- traen default, asi que los productos existentes quedan validos tal como
-- estan. Las categorias viejas no cambian de prefijo: los SKU ya emitidos no
-- se renumeran nunca.
--
-- LA DECISION DE ESTA MIGRACION: la pieza unica se deduce de la categoria, no
-- se marca producto por producto. Una antiguedad es unica porque es una
-- antiguedad, y pedirle a quien carga que ademas tilde una casilla significa
-- que el dia que se le olvide, el sistema permitira vender dos veces la misma
-- silla de 1940. La regla vive en la categoria y la base la hace cumplir.

-- ── Subcategorias ────────────────────────────────────────────────────────────
--
-- UN SOLO NIVEL. "Muñecas > Porcelana" sirve; "Muñecas > Porcelana > Alemanas
-- > 1920" no lo mantiene nadie y termina con una rama por producto. El trigger
-- de mas abajo lo hace cumplir.
--
-- CADA SUBCATEGORIA LLEVA SU PROPIO PREFIJO DE SKU. No hereda el del padre:
-- prefijo_sku es unico porque dos categorias con el mismo prefijo compartirian
-- correlativo y emitirian SKU repetidos. Esa regla no se relaja por una
-- jerarquia.

alter table public.categorias
  add column padre_id uuid references public.categorias(id) on delete restrict;

create index categorias_padre_idx on public.categorias using btree (padre_id)
  where padre_id is not null;

alter table public.categorias
  add constraint categorias_no_es_su_propio_padre check (padre_id is null or padre_id <> id);

create or replace function public.tg_categoria_un_solo_nivel()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.padre_id is null then
    -- Si deja de ser hija, no hay nada que validar hacia arriba. Hacia abajo
    -- tampoco: tener hijas y no tener madre es exactamente ser raiz.
    return new;
  end if;

  if exists (select 1 from public.categorias c where c.id = new.padre_id and c.padre_id is not null) then
    raise exception 'La categoria madre ya es una subcategoria. El arbol es de un solo nivel.'
      using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.categorias c where c.padre_id = new.id) then
    raise exception 'Esta categoria ya tiene subcategorias: no puede pasar a ser hija de otra.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

create trigger categorias_un_solo_nivel
  before insert or update of padre_id on public.categorias
  for each row execute function public.tg_categoria_un_solo_nivel();

-- ── Pieza unica ──────────────────────────────────────────────────────────────

alter table public.categorias
  add column pieza_unica boolean not null default false;

comment on column public.categorias.pieza_unica is
  'Los productos de esta categoria existen en una sola unidad. La base impide que su saldo pase de 1.';

/*
  La subcategoria hereda la condicion de la madre si no la declara. Se resuelve
  con una funcion y no con una columna copiada porque copiarla significa que
  marcar la madre despues no alcanza a las hijas que ya existian.
*/
create or replace function public.categoria_es_pieza_unica(p_categoria uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(bool_or(c.pieza_unica), false)
  from public.categorias c
  where c.id = p_categoria
     or c.id = (select padre_id from public.categorias where id = p_categoria);
$function$;

/*
  EL CANDADO REAL. productos.cantidad solo la escribe tg_aplica_movimiento, asi
  que es ahi donde hay que mirar: cualquier camino que suba el saldo de una
  pieza unica por encima de 1 pasa por este UPDATE, venga de una venta, de un
  ingreso manual o de una carga.

  Se valida el RESULTADO y no el movimiento: dos ingresos de 1 cada uno son
  individualmente inocentes y juntos dejan dos unidades de algo que es unico.
*/
create or replace function public.tg_pieza_unica_tope()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.cantidad <= 1 then
    return new;
  end if;

  if new.categoria_id is not null and public.categoria_es_pieza_unica(new.categoria_id) then
    raise exception 'El producto % es de una categoria de pieza unica: no puede quedar con % unidades.',
      new.nombre, new.cantidad
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

create trigger productos_pieza_unica_tope
  before insert or update on public.productos
  for each row execute function public.tg_pieza_unica_tope();

-- ── Atributos del rubro ──────────────────────────────────────────────────────
--
-- TODAS NULLABLE, y es la condicion para que esta migracion no rompa nada: los
-- productos cargados hasta hoy siguen siendo validos sin tocarlos. Quien venda
-- herramientas no ve estos campos; quien venda antiguedades los necesita en la
-- primera ficha.

create type public.estado_conservacion as enum (
  'nuevo',           -- sin uso, puede tener caja
  'como_nuevo',      -- usado pero sin marcas
  'buen_estado',     -- marcas de uso normales
  'usado',           -- desgaste visible, funciona
  'para_restaurar'   -- necesita trabajo antes de usarse
);

alter table public.productos
  add column estado_conservacion public.estado_conservacion,
  /*
    La epoca va en texto y el año en entero, y son dos campos distintos a
    proposito: de una pieza se sabe "años 50" mucho mas seguido que 1954, y
    forzar un año exacto produce años inventados que despues nadie distingue de
    los ciertos.
  */
  add column epoca text,
  add column anio_aproximado integer,
  add column material text,
  /* Centimetros. La unidad va en el nombre para que no haya que preguntarla. */
  add column alto_cm numeric(10,2),
  add column ancho_cm numeric(10,2),
  add column profundidad_cm numeric(10,2);

alter table public.productos
  add constraint productos_anio_razonable check (
    anio_aproximado is null or (anio_aproximado between 1500 and 2100)
  );
alter table public.productos
  add constraint productos_medidas_positivas check (
    (alto_cm is null or alto_cm > 0)
    and (ancho_cm is null or ancho_cm > 0)
    and (profundidad_cm is null or profundidad_cm > 0)
  );

-- ── Categorias nuevas ────────────────────────────────────────────────────────
--
-- Mobiliario ya existia con prefijo MOB y no se toca.
--
-- Pieza unica queda en TRUE solo para antiguedades y coleccion. Menaje y
-- muñecas no: de un juego de tazas o de una muñeca de produccion puede haber
-- varias iguales, y marcarlas unicas haria fallar el segundo ingreso de algo
-- perfectamente normal. Si en la practica resulta que una de estas tambien es
-- unica, se cambia desde la pantalla de categorias sin migracion.

insert into public.categorias (codigo, nombre, prefijo_sku, descripcion, orden, pieza_unica) values
  ('menaje',       'Menaje',                 'MEN', 'Loza, cristaleria, cubiertos, ollas y utiles de cocina y mesa.', 110, false),
  ('antiguedades', 'Antigüedades',           'ANT', 'Piezas antiguas y de epoca. Cada una existe en una sola unidad.', 120, true),
  ('munecas',      'Muñecas',                'MUN', 'Muñecas y figuras, de porcelana, vinilo o tela.', 130, false),
  ('coleccion',    'Artículos de colección', 'COL', 'Piezas de coleccion y ediciones limitadas. Cada una es unica.', 140, true)
on conflict (codigo) do nothing;
