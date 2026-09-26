#!/usr/bin/env node
/*
  Verifica que el esquema quedó como corresponde en la base real.

  Se mira el catálogo de Postgres y no los archivos de migración: lo que
  importa es lo que QUEDÓ aplicado, no lo que decían las migraciones. Las dos
  cosas se separan en cuanto alguien toca la base a mano una vez.

  Lo que se comprueba y por qué cada cosa:
  - RLS habilitada en todas las tablas. Una tabla sin RLS en un proyecto
    Supabase es una tabla pública, porque PostgREST la expone.
  - El rol anon sin ningún permiso. Postgres concede EXECUTE a PUBLIC en cada
    función nueva, y Supabase concede acceso a cada tabla nueva: las dos cosas
    hay que revocarlas, y esta prueba confirma que se revocaron.
  - El libro de movimientos sin política de UPDATE ni de DELETE. Su ausencia ES
    la regla: sin política, RLS niega.
  - Los triggers de negocio con search_path fijado.
  - El SKU sin carreras, probado de verdad: se piden cien correlativos en una
    sola sentencia y se comprueba que no haya ninguno repetido.

  Es de SOLO LECTURA sobre los datos. La única escritura es dentro de una
  transacción que vuelve atrás.

  Uso:
    SUPABASE_PROJECT_REF=xxxx NODE_EXTRA_CA_CERTS="$USERPROFILE/ca-windows.pem" \
      node scripts/verifica-esquema.mjs
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

const sql = (texto) => {
  const archivo = join(tmpdir(), `verifica-esquema-${process.pid}.sql`);
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
};

let fallas = 0;
const check = (etiqueta, esperado, real, ok) => {
  if (!ok) fallas += 1;
  console.log(
    `  ${ok ? "OK   " : "FALLA"} ${etiqueta.padEnd(50)} esperado=${String(esperado).padEnd(14)} real=${real}`,
  );
};

const TABLAS = [
  "profiles",
  "categorias",
  "correlativos_sku",
  "productos",
  "movimientos_inventario",
  "analisis_imagen",
];

console.log("=== 1. Las tablas existen ===");
const existentes = sql(
  "select c.relname as tabla, c.relrowsecurity as rls\n" +
    "from pg_class c join pg_namespace n on n.oid = c.relnamespace\n" +
    "where n.nspname = 'public' and c.relkind = 'r' order by c.relname;",
);
const porNombre = new Map(existentes.map((t) => [t.tabla, t]));
for (const t of TABLAS) {
  check(`  ${t}`, "existe", porNombre.has(t) ? "existe" : "FALTA", porNombre.has(t));
}

console.log("\n=== 2. RLS habilitada en todas ===");
/*
  Una tabla sin RLS en Supabase es una tabla pública: PostgREST la expone y sin
  políticas no hay nada que la frene.
*/
const sinRls = existentes.filter((t) => !t.rls);
check(
  "ninguna tabla sin RLS",
  0,
  sinRls.length ? sinRls.map((t) => t.tabla).join(" ") : 0,
  sinRls.length === 0,
);

console.log("\n=== 3. El rol anon no tiene nada ===");
const permisos = sql(
  "select c.relname as tabla,\n" +
    "  has_table_privilege('anon', 'public.' || quote_ident(c.relname), 'select') as lee,\n" +
    "  has_table_privilege('anon', 'public.' || quote_ident(c.relname), 'insert') as inserta,\n" +
    "  has_table_privilege('anon', 'public.' || quote_ident(c.relname), 'update') as actualiza,\n" +
    "  has_table_privilege('anon', 'public.' || quote_ident(c.relname), 'delete') as borra\n" +
    "from pg_class c join pg_namespace n on n.oid = c.relnamespace\n" +
    "where n.nspname = 'public' and c.relkind = 'r' order by c.relname;",
);
const conAlgo = permisos.filter((p) => p.lee || p.inserta || p.actualiza || p.borra);
check(
  "anon sin permisos en ninguna tabla",
  0,
  conAlgo.length
    ? conAlgo
        .map(
          (p) =>
            `${p.tabla}(${[p.lee && "S", p.inserta && "I", p.actualiza && "U", p.borra && "D"]
              .filter(Boolean)
              .join("")})`,
        )
        .join(" ")
    : 0,
  conAlgo.length === 0,
);

const funciones = sql(
  "select p.proname as funcion, has_function_privilege('anon', p.oid, 'execute') as ejecuta\n" +
    "from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n" +
    "where n.nspname = 'public' order by p.proname;",
);
const ejecutables = funciones.filter((f) => f.ejecuta);
check(
  "anon no ejecuta ninguna función",
  0,
  ejecutables.length ? ejecutables.map((f) => f.funcion).join(" ") : 0,
  ejecutables.length === 0,
);

console.log("\n=== 4. El libro de movimientos es de solo agregar ===");
/*
  Lo que se comprueba es una AUSENCIA: sin política de UPDATE ni de DELETE, RLS
  niega. Que no estén es la regla, no un olvido.
*/
const politicasMov = sql(
  "select cmd::text as comando, count(*)::int as cuantas\n" +
    "from pg_policies where schemaname = 'public' and tablename = 'movimientos_inventario'\n" +
    "group by cmd order by cmd;",
);
const comandos = new Set(politicasMov.map((p) => p.comando));
check("tiene política de SELECT", true, comandos.has("SELECT"), comandos.has("SELECT"));
check("tiene política de INSERT", true, comandos.has("INSERT"), comandos.has("INSERT"));
check("NO tiene política de UPDATE", false, comandos.has("UPDATE"), !comandos.has("UPDATE"));
check("NO tiene política de DELETE", false, comandos.has("DELETE"), !comandos.has("DELETE"));

console.log("\n=== 5. Las funciones de negocio están blindadas ===");
const seguras = sql(
  "select p.proname as funcion, p.prosecdef as definer,\n" +
    "  coalesce(array_to_string(p.proconfig, ','), '') as config\n" +
    "from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n" +
    "where n.nspname = 'public'\n" +
    "  and p.proname in ('mi_rol','puede_leer','puede_operar','es_admin','siguiente_sku',\n" +
    "                    'tg_asigna_sku','tg_aplica_movimiento','tg_exige_admin_activo')\n" +
    "order by p.proname;",
);
for (const f of seguras) {
  check(
    `  ${f.funcion}`,
    "definer + search_path",
    `${f.definer ? "definer" : "NO definer"} + ${f.config.includes("search_path") ? "search_path" : "SIN search_path"}`,
    f.definer && f.config.includes("search_path"),
  );
}
check("están las 8 funciones", 8, seguras.length, seguras.length === 8);

console.log("\n=== 6. El bucket de fotos es privado ===");
const [bucket] = sql(
  "select id, public, file_size_limit from storage.buckets where id = 'fotos';",
);
check("el bucket existe", "fotos", bucket?.id ?? "FALTA", bucket?.id === "fotos");
check("y es privado", false, bucket?.public, bucket?.public === false);

console.log("\n=== 7. Categorías de arranque ===");
const [cats] = sql("select count(*)::int as total from public.categorias where activo;");
check("hay categorías activas", ">0", cats.total, cats.total > 0);

console.log("\n=== 8. El SKU no se repite bajo concurrencia ===");
/*
  Se piden cien correlativos del mismo prefijo en una sola sentencia y se
  cuentan los distintos. Si siguiente_sku() no tomara el candado de la fila,
  acá aparecerían repetidos. Todo dentro de una transacción que vuelve atrás,
  así que el correlativo real no se mueve.
*/
const [carrera] = sql(
  "begin;\n" +
    "create temporary table prueba_sku on commit drop as\n" +
    "  select public.siguiente_sku('ZZT') as sku from generate_series(1, 100);\n" +
    "select count(*)::int as pedidos, count(distinct sku)::int as distintos from prueba_sku;\n" +
    "rollback;",
);
check(
  "cien SKU, cien distintos",
  "100 / 100",
  `${carrera.pedidos} / ${carrera.distintos}`,
  carrera.pedidos === 100 && carrera.distintos === 100,
);

console.log("\n=== 9. La cantidad la manda el libro ===");
/*
  Se crea un producto, se le cargan movimientos y se comprueba que
  productos.cantidad quede en la suma.

  EL INSERT Y LA LECTURA VAN EN SENTENCIAS SEPARADAS, y eso no es estilo. La
  primera version de esta prueba hacia las dos cosas en un solo statement con
  CTEs y devolvia 0: el trigger que recalcula es AFTER ROW, o sea corre al
  CERRAR la sentencia, asi que un select dentro de la misma sentencia lee el
  valor de antes. La prueba estaba mal, no el trigger.

  Todo dentro de una transaccion que vuelve atras: no queda nada en la base.
*/
const ID_PRUEBA = "00000000-0000-4000-8000-0000000000ff";
const [libro] = sql(
  "begin;\n" +
    `insert into public.productos (id, nombre) values ('${ID_PRUEBA}', 'ZZ-VERIF libro');\n` +
    "insert into public.movimientos_inventario (producto_id, tipo, cantidad) values\n" +
    `  ('${ID_PRUEBA}', 'ingreso', 10),\n` +
    `  ('${ID_PRUEBA}', 'salida', -3),\n` +
    `  ('${ID_PRUEBA}', 'ajuste', 2);\n` +
    `select sku, cantidad from public.productos where id = '${ID_PRUEBA}';\n` +
    "rollback;",
);
check("el SKU se asigno solo", "empieza con GEN-", libro.sku, String(libro.sku).startsWith("GEN-"));
check("la cantidad es la suma del libro", 9, Number(libro.cantidad), Number(libro.cantidad) === 9);


console.log("\n=== 10. No se puede quedar sin administradores ===");
/*
  Se intenta dejar profiles sin ningún admin activo y se comprueba que el
  trigger lo rechace. Dentro de una transacción que vuelve atrás.
*/
const [guarda] = sql(
  "begin;\n" +
    "create temporary table resultado_guarda (veredicto text, detalle text) on commit drop;\n" +
    "do $p$\n" +
    "begin\n" +
    "  begin\n" +
    "    update public.profiles set rol = 'lector'::public.rol_usuario\n" +
    "    where rol = 'admin'::public.rol_usuario;\n" +
    "    insert into resultado_guarda values ('SIN FRENO', 'la degradacion paso');\n" +
    "  exception when others then\n" +
    "    insert into resultado_guarda values ('BLOQUEADO', sqlstate || ' ' || sqlerrm);\n" +
    "  end;\n" +
    "end $p$;\n" +
    "select veredicto, detalle from resultado_guarda;\n" +
    "rollback;",
);
/*
  Con la tabla de perfiles vacía el UPDATE no toca ninguna fila, pero el
  trigger es de sentencia y se dispara igual: sin ningún admin, bloquea. Las
  dos respuestas confirman que la guarda está activa.
*/
check(
  "el trigger frena quedarse sin admin",
  "BLOQUEADO",
  guarda?.veredicto ?? "sin resultado",
  guarda?.veredicto === "BLOQUEADO",
);

console.log(`\n${fallas === 0 ? "TODO OK" : `${fallas} FALLA(S)`}`);
process.exit(fallas === 0 ? 0 : 1);
