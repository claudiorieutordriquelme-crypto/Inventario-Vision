#!/usr/bin/env node
/*
  Aplica las migraciones de supabase/migrations en orden.

  Por que existe en vez de `supabase db push`: en la red corporativa solo sale
  HTTPS, así que el pooler de Postgres en 5432/6543 es inalcanzable y db push
  muere con Connection timed out. Este script usa la Management API, que va por
  HTTPS, igual que scripts/sql-remoto.mjs.

  QUE HACE BIEN Y HAY QUE CONSERVAR:
   1. Cada migración se aplica dentro de una transacción. Si una sentencia
      falla, no queda media migración aplicada.
   2. Se registra en supabase_migrations.schema_migrations CON SU TEXTO
      COMPLETO. En otro proyecto se registraron solo el nombre y el orden, con
      statements vacío, y reconstruir el esquema desde el catálogo costó una
      tarde entera.
   3. Se salta lo ya aplicado, así que correrlo dos veces es seguro.
   4. --ensayo aplica todo y vuelve atrás, para ver si pasa sin escribir nada.

  Uso:
    SUPABASE_PROJECT_REF=abcdefgh node scripts/aplica-migraciones.mjs --ensayo
    SUPABASE_PROJECT_REF=abcdefgh node scripts/aplica-migraciones.mjs

  El token se lee de ~/.supabase_token o de SUPABASE_ACCESS_TOKEN, igual que
  sql-remoto. Nunca se imprime.
*/
import { readFileSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIRECTORIO = join(RAIZ, "supabase", "migrations");
const ENSAYO = process.argv.includes("--ensayo");

if (!process.env.SUPABASE_PROJECT_REF) {
  console.error("Falta SUPABASE_PROJECT_REF, la referencia del proyecto de Supabase.");
  console.error("Es la parte antes de .supabase.co en su URL.");
  process.exit(2);
}

function ejecuta(sql, etiqueta) {
  const archivo = join(tmpdir(), `migracion-${process.pid}.sql`);
  writeFileSync(archivo, sql);
  try {
    const r = spawnSync("node", [join(RAIZ, "scripts", "sql-remoto.mjs"), archivo, "--json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: process.env,
    });
    if (r.status !== 0) {
      console.error(`\n  FALLA en ${etiqueta}:`);
      console.error((r.stderr || r.stdout || "").trim());
      return null;
    }
    try {
      return JSON.parse(r.stdout);
    } catch {
      return [];
    }
  } finally {
    try {
      unlinkSync(archivo);
    } catch {
      /* nada */
    }
  }
}

/* El catálogo de migraciones puede no existir todavía en un proyecto nuevo. */
const preparado = ejecuta(
  "create schema if not exists supabase_migrations;\n" +
    "create table if not exists supabase_migrations.schema_migrations (\n" +
    "  version text primary key,\n" +
    "  name text,\n" +
    "  statements text[]\n" +
    ");",
  "preparación del catálogo",
);
if (preparado === null) process.exit(1);

const yaAplicadas = new Set(
  (ejecuta("select version from supabase_migrations.schema_migrations;", "lectura del catálogo") ?? [])
    .map((f) => f.version),
);

const archivos = readdirSync(DIRECTORIO)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`${archivos.length} migraciones en el directorio, ${yaAplicadas.size} ya aplicadas.`);
if (ENSAYO) console.log("MODO ENSAYO: se aplica todo y se vuelve atrás. No se escribe nada.\n");
else console.log("");

/*
  El texto de cada migración se envuelve en dollar-quote para registrarlo. La
  etiqueta lleva la versión para que no choque con los $function$ que hay
  dentro de las propias migraciones.
*/
function registroDe(version, nombre, cuerpo) {
  const tag = `$mig_${version}$`;
  if (cuerpo.includes(tag)) {
    console.error(`  FALLA    ${version}: el texto contiene la etiqueta ${tag}`);
    process.exit(1);
  }
  return (
    "insert into supabase_migrations.schema_migrations (version, name, statements)\n" +
    `values ('${version}', '${nombre}', array[${tag}${cuerpo}${tag}])\n` +
    "on conflict (version) do update set name = excluded.name, statements = excluded.statements;"
  );
}

const pendientes = archivos.map((archivo) => ({
  archivo,
  version: archivo.slice(0, archivo.indexOf("_")),
  nombre: archivo.slice(archivo.indexOf("_") + 1).replace(/\.sql$/, ""),
  cuerpo: readFileSync(join(DIRECTORIO, archivo), "utf8"),
}));

let aplicadas = 0;

if (ENSAYO) {
  /*
    TODAS en una sola transacción, y rollback al final.

    Es la única forma de ensayar una secuencia donde cada migración depende de
    la anterior: la segunda crea tablas con los tipos que definió la primera,
    así que ensayarlas por separado con rollback entre medio hace fallar la
    segunda por algo que en la realidad nunca va a pasar. La primera versión de
    este script tenía ese defecto y el primer ensayo real lo encontró.
  */
  const bloques = pendientes.map(
    (m) => `-- ${m.archivo}\n${m.cuerpo}\n\n${registroDe(m.version, m.nombre, m.cuerpo)}`,
  );
  const sql = `begin;\n\n${bloques.join("\n\n")}\n\nrollback;\n`;

  const resultado = ejecuta(sql, "el ensayo completo");
  if (resultado === null) {
    console.error("\nEl ensayo falló y no se escribió nada. El error de arriba dice dónde.");
    process.exit(1);
  }

  for (const m of pendientes) console.log(`  ensayada ${m.archivo}`);
  aplicadas = pendientes.length;
} else {
  /*
    Una transacción POR migración. Si la cuarta falla, las tres anteriores
    quedan aplicadas y registradas, y el script se vuelve a correr desde ahí.
    Envolverlas todas juntas obligaría a rehacer desde cero cada vez.
  */
  for (const m of pendientes) {
    if (yaAplicadas.has(m.version)) {
      console.log(`  omitida  ${m.archivo}`);
      continue;
    }

    const sql = `begin;\n\n${m.cuerpo}\n\n${registroDe(m.version, m.nombre, m.cuerpo)}\n\ncommit;\n`;

    const resultado = ejecuta(sql, m.archivo);
    if (resultado === null) {
      console.error(`\nSe detuvo en ${m.archivo}. Nada de esa migración quedó aplicado.`);
      console.error("Las anteriores sí, y están registradas: corrige y vuelve a correr.");
      process.exit(1);
    }

    console.log(`  aplicada ${m.archivo}`);
    aplicadas += 1;
  }
}


console.log(
  `\n${aplicadas} migración(es) ${ENSAYO ? "ensayadas sin escribir" : "aplicadas"}.`,
);
if (ENSAYO) console.log("Si todo salió bien, corre el script sin --ensayo.");
