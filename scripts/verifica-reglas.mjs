#!/usr/bin/env node
/*
  Prueba las reglas críticas del negocio contra la base real.

  POR QUÉ ESTO Y NO PRUEBAS UNITARIAS. Cada una de estas reglas vive en un
  trigger o en una restricción de Postgres, no en TypeScript. Una prueba
  unitaria con la base simulada confirmaría que el simulacro se comporta como
  yo creo que se comporta la base, que es exactamente lo que no hay que
  comprobar. Acá se le pide a la base de verdad que haga lo prohibido, y se
  comprueba que se niegue.

  QUÉ SE PRUEBA, y cada una es algo que si falla cuesta plata:
   1. Un producto confirmado necesita 3 imágenes.
   2. Una pieza única no puede quedar con más de una unidad.
   3. Una pieza única no puede estar en dos ventas vivas a la vez.
   4. Una venta no se confirma si no alcanza el stock.
   5. Confirmar descuenta el stock por el libro de movimientos, no a mano.
   6. Una venta confirmada no cambia de productos.
   7. No se puede embalar más de lo que se vendió.
   8. El token del QR es único y no se repite.
   9. La cantidad sigue siendo la suma del libro después de todo esto.

  ES DESTRUCTIVO SOBRE EL PAPEL Y SEGURO EN LA PRÁCTICA: todo corre dentro de
  una transacción que termina en ROLLBACK. No queda ni un producto, ni una
  venta, ni un movimiento. Lo único que avanza son los correlativos de SKU y de
  folio, porque esos los mueve una función que toma su propio candado y no
  vuelve atrás: es el mismo comportamiento que tendría una venta cancelada.

  Uso:
    SUPABASE_PROJECT_REF=xxxx NODE_EXTRA_CA_CERTS="$USERPROFILE/ca-windows.pem" \
      node scripts/verifica-reglas.mjs
*/
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.SUPABASE_PROJECT_REF) {
  console.error("Falta SUPABASE_PROJECT_REF.");
  process.exit(2);
}

function sql(texto) {
  const archivo = join(tmpdir(), `verifica-reglas-${process.pid}.sql`);
  writeFileSync(archivo, texto);
  try {
    const r = spawnSync("node", [join(RAIZ, "scripts", "sql-remoto.mjs"), archivo, "--json"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: process.env,
    });
    if (r.status !== 0) {
      console.error(r.stderr || r.stdout);
      process.exit(2);
    }
    return JSON.parse(r.stdout);
  } finally {
    try {
      unlinkSync(archivo);
    } catch {
      /* nada */
    }
  }
}

let fallas = 0;
const check = (etiqueta, ok, detalle = "") => {
  if (!ok) fallas += 1;
  console.log(`  ${ok ? "OK   " : "FALLA"} ${etiqueta}${detalle ? `  → ${detalle}` : ""}`);
};

/*
  TODAS LAS PRUEBAS EN UNA SOLA SENTENCIA, dentro de un bloque que arma el
  escenario, intenta cada operación prohibida dentro de su propio sub-bloque de
  excepción, y anota si la base la frenó.

  Un sub-bloque por prueba y no uno solo para todas: en PL/pgSQL, una excepción
  aborta todo lo que venía después dentro del mismo bloque, así que con un solo
  BEGIN/EXCEPTION la primera prueba que pasa impediría correr las demás.
*/
const guion = `
/*
  La tabla de resultados se crea FUERA del bloque, y la razón la encontró la
  primera corrida: creándola adentro, una excepción en el escenario revierte
  también el CREATE, y el manejador de errores intenta escribir en una tabla
  que ya no existe. Lo que se ve entonces no es el error que ocurrió, sino el
  de la tabla perdida.
*/
create temporary table _resultados (prueba text, paso boolean, detalle text) on commit drop;

do $prueba$
declare
  v_cat_unica  uuid;
  v_cat_normal uuid;
  v_prod_unico uuid;
  v_prod_normal uuid;
  v_venta_a uuid;
  v_venta_b uuid;
  v_item uuid;
  v_caja uuid;
  v_despacho uuid;
  v_resultado text;
  v_unicos boolean;
  v_cantidad numeric;
begin
  -- ── Escenario ──────────────────────────────────────────────────────────
  insert into public.categorias (codigo, nombre, prefijo_sku, pieza_unica, orden)
  values ('zz_prueba_unica', 'Prueba única', 'ZZU', true, 9000)
  returning id into v_cat_unica;

  insert into public.categorias (codigo, nombre, prefijo_sku, pieza_unica, orden)
  values ('zz_prueba_normal', 'Prueba normal', 'ZZN', false, 9001)
  returning id into v_cat_normal;

  insert into public.productos (nombre, categoria_id, estado, precio_confirmado_clp)
  values ('Pieza única de prueba', v_cat_unica, 'borrador', 10000)
  returning id into v_prod_unico;

  insert into public.productos (nombre, categoria_id, estado, precio_confirmado_clp)
  values ('Producto normal de prueba', v_cat_normal, 'borrador', 5000)
  returning id into v_prod_normal;

  insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo)
  values (v_prod_unico, 'ingreso', 1, 'prueba');
  insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo)
  values (v_prod_normal, 'ingreso', 5, 'prueba');

  -- ── 1. Confirmado exige 3 imágenes ─────────────────────────────────────
  begin
    update public.productos set estado = 'confirmado' where id = v_prod_normal;
    insert into _resultados values ('1. confirmar sin 3 imágenes', false, 'la base lo permitió');
  exception when others then
    insert into _resultados values ('1. confirmar sin 3 imágenes', true, sqlerrm);
  end;

  -- ── 2. Pieza única no pasa de 1 unidad ─────────────────────────────────
  begin
    insert into public.movimientos_inventario (producto_id, tipo, cantidad, motivo)
    values (v_prod_unico, 'ingreso', 1, 'prueba segunda unidad');
    insert into _resultados values ('2. pieza única con 2 unidades', false, 'la base lo permitió');
  exception when others then
    insert into _resultados values ('2. pieza única con 2 unidades', true, sqlerrm);
  end;

  -- ── 3. Pieza única en dos ventas vivas ─────────────────────────────────
  insert into public.ventas (canal, tipo_entrega) values ('tienda', 'retiro_tienda')
  returning id into v_venta_a;
  insert into public.ventas (canal, tipo_entrega) values ('tienda', 'retiro_tienda')
  returning id into v_venta_b;

  insert into public.venta_items (venta_id, producto_id, nombre, sku, cantidad, precio_unitario_clp)
  select v_venta_a, v_prod_unico, p.nombre, p.sku, 1, 10000 from public.productos p where p.id = v_prod_unico;

  begin
    insert into public.venta_items (venta_id, producto_id, nombre, sku, cantidad, precio_unitario_clp)
    select v_venta_b, v_prod_unico, p.nombre, p.sku, 1, 10000 from public.productos p where p.id = v_prod_unico;
    insert into _resultados values ('3. pieza única en dos ventas', false, 'la base lo permitió');
  exception when others then
    insert into _resultados values ('3. pieza única en dos ventas', true, sqlerrm);
  end;

  -- ── 4. No se confirma sin stock ────────────────────────────────────────
  insert into public.venta_items (venta_id, producto_id, nombre, sku, cantidad, precio_unitario_clp)
  select v_venta_b, v_prod_normal, p.nombre, p.sku, 99, 5000 from public.productos p where p.id = v_prod_normal;

  begin
    perform public.confirmar_venta(v_venta_b, 'efectivo', 'ninguno', null);
    insert into _resultados values ('4. confirmar sin stock', false, 'la base lo permitió');
  exception when others then
    insert into _resultados values ('4. confirmar sin stock', true, sqlerrm);
  end;

  -- ── 5. Confirmar descuenta por el libro ────────────────────────────────
  perform public.confirmar_venta(v_venta_a, 'efectivo', 'ninguno', null);
  select cantidad into v_cantidad from public.productos where id = v_prod_unico;
  insert into _resultados values (
    '5. confirmar descuenta el stock', v_cantidad = 0, 'quedó en ' || v_cantidad
  );

  select coalesce(sum(cantidad), 0) into v_cantidad
  from public.movimientos_inventario where producto_id = v_prod_unico;
  insert into _resultados values (
    '9. la cantidad es la suma del libro', v_cantidad = 0, 'libro suma ' || v_cantidad
  );

  -- ── 6. Venta confirmada no cambia de productos ─────────────────────────
  begin
    insert into public.venta_items (venta_id, producto_id, nombre, sku, cantidad, precio_unitario_clp)
    select v_venta_a, v_prod_normal, p.nombre, p.sku, 1, 5000 from public.productos p where p.id = v_prod_normal;
    insert into _resultados values ('6. editar venta confirmada', false, 'la base lo permitió');
  exception when others then
    insert into _resultados values ('6. editar venta confirmada', true, sqlerrm);
  end;

  -- ── 7. No se embala más de lo vendido ──────────────────────────────────
  insert into public.despachos (estado, direccion) values ('pendiente', 'Calle de prueba 123')
  returning id into v_despacho;
  insert into public.cajas (despacho_id, numero) values (v_despacho, 1) returning id into v_caja;
  select id into v_item from public.venta_items where venta_id = v_venta_a limit 1;

  begin
    insert into public.caja_items (caja_id, venta_item_id, cantidad) values (v_caja, v_item, 99);
    insert into _resultados values ('7. embalar más de lo vendido', false, 'la base lo permitió');
  exception when others then
    insert into _resultados values ('7. embalar más de lo vendido', true, sqlerrm);
  end;

  -- ── 8. El token del QR no se repite ────────────────────────────────────
  select count(distinct token) = count(*) into v_unicos from public.cajas;
  insert into _resultados values (
    '8. tokens de caja únicos', v_unicos, 'sobre ' || (select count(*) from public.cajas) || ' cajas'
  );

exception when others then
  insert into _resultados values ('ESCENARIO', false, 'no se pudo armar: ' || sqlerrm);
end
$prueba$;

select prueba, paso, detalle from _resultados order by prueba;
`;

console.log("=== Reglas críticas del negocio ===");
console.log("(todo dentro de una transacción que vuelve atrás)\n");

const filas = sql(`begin;\n${guion}\nrollback;`);

if (!Array.isArray(filas) || filas.length === 0) {
  console.error("No volvió ningún resultado. Revisa la conexión y el esquema.");
  process.exit(2);
}

for (const f of filas) {
  /*
    El detalle de una prueba que pasa es el mensaje de error que levantó la
    base, y se imprime recortado: leerlo es la forma de confirmar que falló por
    la razón correcta y no por otra cosa.
  */
  const detalle = String(f.detalle ?? "").slice(0, 90);
  check(f.prueba, f.paso === true || f.paso === "t", detalle);
}

console.log(
  fallas === 0
    ? "\nTodas las reglas críticas se hacen cumplir en la base."
    : `\n${fallas} REGLA(S) SIN HACERSE CUMPLIR. Cada una es un agujero por el que se pierde plata.`,
);

process.exit(fallas === 0 ? 0 : 1);
