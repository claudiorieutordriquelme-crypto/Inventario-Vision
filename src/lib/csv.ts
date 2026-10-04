/*
  Armado de CSV que Excel chileno abre bien.

  ── POR QUÉ ESTO VIVE EN UN MÓDULO Y NO DENTRO DE CADA EXPORTACIÓN ─────────

  Nació dentro de la exportación del inventario. Al agregar la del panel hubo
  que elegir entre copiarlo o compartirlo, y copiarlo significaba tener dos
  versiones de la defensa contra inyección de fórmulas: el día que una se
  corrija, la otra queda abierta y nadie se entera hasta que alguien abre la
  planilla equivocada.

  ── POR QUÉ CSV Y NO UN .xlsx DE VERDAD ────────────────────────────────────

  Un .xlsx obliga a meter una librería de planillas al servidor, que pesa
  varios megabytes y hay que mantener. Un CSV bien hecho se abre con doble clic
  en Excel, en Google Sheets y en LibreOffice.

  "Bien hecho" no es trivial, y son tres cosas:

  1. SEPARADOR PUNTO Y COMA. Excel en español usa el separador de listas del
     sistema, que en es-CL es el punto y coma. Con comas, todo el archivo cae
     en una sola columna y la persona concluye que la exportación está mala.
  2. BOM AL INICIO. Sin esos tres bytes, Excel en Windows lee el archivo con la
     codificación del sistema y "Tetera de cerámica" aparece como
     "Tetera de cerÃ¡mica".
  3. COMA DECIMAL. Un 1500.5 se lee como texto o como mil quinientos cinco. Los
     números van con coma y sin separador de miles.

  ── INYECCIÓN DE FÓRMULAS: ESTO NO ES COSMÉTICO ────────────────────────────

  Excel ejecuta como fórmula cualquier celda que empiece con = + - @ o un
  tabulador. Los nombres de este inventario los escribe un modelo a partir de
  una foto, o los escribe cualquiera con cuenta de operador, incluida la cuenta
  de demostración que es pública. Un producto llamado =HYPERLINK(...) se
  convierte en código ejecutándose en el computador de quien abra la planilla.

  Por eso toda celda de texto que empiece con uno de esos caracteres se
  antecede con una comilla simple, que Excel interpreta como "esto es texto".
  Es la mitigación estándar y no se quita porque afee un nombre.
*/

export const SEPARADOR = ";";
export const BOM = "﻿";
/* Excel espera fin de línea de Windows en un CSV. */
export const SALTO = "\r\n";

/** Caracteres con los que Excel empieza a interpretar una celda como fórmula. */
const PELIGROSOS = /^[=+\-@\t\r]/;

export function celdaTexto(valor: string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const limpio = PELIGROSOS.test(valor) ? `'${valor}` : valor;
  /* Las comillas internas se duplican, que es como el formato CSV las escapa. */
  return `"${limpio.replace(/"/g, '""')}"`;
}

export function celdaNumero(valor: number | null | undefined, decimales = 0): string {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return "";
  /* Sin comillas para que Excel lo tome como número, y con coma decimal. */
  return Number(valor).toFixed(decimales).replace(".", ",");
}

export function celdaFecha(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return celdaTexto(`${dd}-${mm}-${d.getFullYear()} ${hh}:${mi}`);
}

export function fila(celdas: string[]): string {
  return celdas.join(SEPARADOR);
}

/*
  La respuesta HTTP de una descarga.

  El nombre del archivo lleva la fecha: tres exportaciones en la carpeta de
  descargas sin fecha son tres archivos que nadie sabe cuál es cuál.
*/
export function respuestaCsv(nombre: string, lineas: string[]): Response {
  const hoy = new Date();
  const sello = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(
    hoy.getDate(),
  ).padStart(2, "0")}`;

  return new Response(BOM + lineas.join(SALTO) + SALTO, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}-${sello}.csv"`,
      /* Una exportación nunca se cachea: el inventario cambia cada día y un
         archivo servido desde caché haría cuadrar contra datos de ayer. */
      "Cache-Control": "private, no-store",
    },
  });
}
