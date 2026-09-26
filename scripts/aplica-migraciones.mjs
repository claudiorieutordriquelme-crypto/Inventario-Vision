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

let aplicadas = 0;

for (const archivo of archivos) {
  const version = archivo.slice(0, archivo.indexOf("_"));
  const nombre = archivo.slice(archivo.indexOf("_") + 1).replace(/\.sql$/, "");

  if (yaAplicadas.has(version) && !ENSAYO) {
    console.log(`  omitida  ${archivo}`);
    continue;
  }

  const cuerpo = readFileSync(join(DIRECTORIO, archivo), "utf8");

  /*
    El texto se guarda con dollar-quote. La etiqueta lleva la versión para que
    no choque con los $function$ que hay dentro de las propias migraciones.
  */
  const tag = `$mig_${version}$`;
  if (cuerpo.includes(tag)) {
    console.error(`  FALLA    ${archivo}: el texto contiene la etiqueta ${tag}`);
    process.exit(1);
  }

  const registro =
    "insert into supabase_migrations.schema_migrations (version, name, statements)\n" +
    `values ('${version}', '${nombre}', array[${tag}${cuerpo}${tag}])\n` +
    "on conflict (version) do update set name = excluded.name, statements = excluded.statements;";

  const sql = `begin;\n\n${cuerpo}\n\n${registro}\n\n${ENSAYO ? "rollback;" : "commit;"}\n`;

  const resultado = ejecuta(sql, archivo);
  if (resultado === null) {
    console.error(`\nSe detuvo en ${archivo}. Nada de esa migración quedó aplicado.`);
    process.exit(1);
  }

  console.log(`  ${ENSAYO ? "ensayada" : "aplicada"} ${archivo}`);
  aplicadas += 1;
}

console.log(
  `\n${aplicadas} migración(es) ${ENSAYO ? "ensayadas sin escribir" : "aplicadas"}.`,
);
if (ENSAYO) console.log("Si todo salió bien, corre el script sin --ensayo.");
