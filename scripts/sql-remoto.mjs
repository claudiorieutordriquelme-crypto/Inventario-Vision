#!/usr/bin/env node
/*
  Ejecuta SQL contra la base de Supabase por la Management API, sobre HTTPS.

  Por que existe: la red corporativa solo permite salida HTTPS, asi que el
  pooler de Postgres en 5432/6543 es inalcanzable y `supabase db push` muere
  con Connection timed out. Este script es el unico transporte disponible.

  Por que en Node y no en Python: Node ya es dependencia del proyecto; Python no
  esta instalado en el equipo de desarrollo. Una dependencia menos que pedir.

  Por que hay respaldo por curl: en la red corporativa el trafico HTTPS hacia
  api.supabase.com sale re-firmado por un proxy de inspeccion, y Node 20 solo
  confia en su bundle interno de CAs, no en el almacen de certificados de
  Windows (--use-system-ca recien existe desde Node 22). Resultado:
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY. curl, que viene con Git para Windows, si
  valida esa cadena. Se intenta fetch primero porque es lo correcto y portable,
  y solo ante un error de certificado se cae a curl. Lo que NO se hace es
  apagar la verificacion con NODE_TLS_REJECT_UNAUTHORIZED=0: por este canal
  viaja un token con control total de la organizacion.

  El token nunca vive en el repo. Se lee de un archivo fuera del arbol, por
  defecto ~/.supabase_token, o de la variable SUPABASE_ACCESS_TOKEN. Al usar
  curl los headers van en un archivo temporal con -H @archivo y no como
  argumento, para que el token no quede visible en la lista de procesos.

  Uso:
    node scripts/sql-remoto.mjs consulta.sql            # tabla legible
    node scripts/sql-remoto.mjs consulta.sql --json     # JSON crudo
    node scripts/sql-remoto.mjs consulta.sql --raw      # primera columna cruda
*/
import { readFileSync, writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/*
  La referencia del proyecto NO tiene valor por defecto. Un default apuntaría a
  la base de otro proyecto, y una migración aplicada por equivocación ahí no se
  deshace con un ctrl+z.
*/
const REF = process.env.SUPABASE_PROJECT_REF;
if (!REF) {
  console.error("Falta SUPABASE_PROJECT_REF, la referencia del proyecto de Supabase.");
  console.error("Es la parte antes de .supabase.co en su URL. Exportala antes de correr esto.");
  process.exit(2);
}
const URL_QUERY = `https://api.supabase.com/v1/projects/${REF}/database/query`;

function leerToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const ruta = process.env.SUPABASE_TOKEN_FILE ?? join(homedir(), ".supabase_token");
  try {
    return readFileSync(ruta, "utf8").trim();
  } catch {
    console.error(`No pude leer el token. Deja el sbp_... en ${ruta} o exporta SUPABASE_ACCESS_TOKEN.`);
    process.exit(2);
  }
}

function viaCurl(cuerpo, token) {
  const base = join(tmpdir(), `sql-remoto-${process.pid}`);
  const archivoCuerpo = `${base}.json`;
  const archivoHeaders = `${base}.headers`;
  writeFileSync(archivoCuerpo, cuerpo);
  writeFileSync(archivoHeaders, `Authorization: Bearer ${token}\nContent-Type: application/json\n`);
  try {
    chmodSync(archivoHeaders, 0o600);
  } catch {
    // Windows puede no aplicar el modo; el archivo vive en el temp del usuario.
  }
  try {
    const r = spawnSync(
      "curl",
      ["-s", "-w", "\n%{http_code}", "-X", "POST", URL_QUERY,
       "-H", `@${archivoHeaders}`, "--data-binary", `@${archivoCuerpo}`],
      { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    if (r.error) throw r.error;
    const salida = r.stdout ?? "";
    const corte = salida.lastIndexOf("\n");
    const estado = Number(salida.slice(corte + 1).trim());
    return { ok: estado >= 200 && estado < 300, estado, texto: salida.slice(0, corte) };
  } finally {
    for (const f of [archivoCuerpo, archivoHeaders]) {
      try { unlinkSync(f); } catch { /* nada */ }
    }
  }
}

async function ejecutar(sql, token) {
  const cuerpo = JSON.stringify({ query: sql });
  try {
    const res = await fetch(URL_QUERY, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: cuerpo,
    });
    return { ok: res.ok, estado: res.status, texto: await res.text() };
  } catch (e) {
    const codigo = String(e?.cause?.code ?? "");
    if (!/CERT|ISSUER|SELF_SIGNED/i.test(codigo)) throw e;
    return viaCurl(cuerpo, token);
  }
}

const archivo = process.argv[2];
if (!archivo) {
  console.error("Uso: node scripts/sql-remoto.mjs <archivo.sql> [--json|--raw]");
  process.exit(2);
}
const modo = process.argv[3] ?? "";
const { ok, estado, texto } = await ejecutar(readFileSync(archivo, "utf8"), leerToken());

if (!ok) {
  console.error(`HTTP ${estado}`);
  console.error(texto.slice(0, 4000));
  process.exit(1);
}

let datos;
try {
  datos = JSON.parse(texto);
} catch {
  console.log(texto);
  process.exit(0);
}

if (modo === "--json") {
  console.log(JSON.stringify(datos, null, 2));
} else if (modo === "--raw") {
  // Para volcar DDL a un .sql: primera columna de cada fila, sin adornos.
  for (const fila of datos) console.log(Object.values(fila)[0]);
} else if (Array.isArray(datos)) {
  if (datos.length === 0) {
    console.log("(0 filas)");
  } else {
    const cols = Object.keys(datos[0]);
    console.log(cols.join(" | "));
    console.log(cols.map((c) => "-".repeat(c.length)).join("-|-"));
    for (const fila of datos) {
      console.log(cols.map((c) => (fila[c] === null ? "NULL" : String(fila[c]))).join(" | "));
    }
    console.log(`(${datos.length} fila${datos.length === 1 ? "" : "s"})`);
  }
} else {
  console.log(JSON.stringify(datos, null, 2));
}
