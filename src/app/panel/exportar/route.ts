import { NextResponse } from "next/server";
import { perfilHabilitado } from "@/lib/auth";
import { LIMITE_EXPORTACION, listarProductos } from "@/lib/datos/inventario";
import { ETIQUETA_ESTADO } from "@/lib/formato";
import type { EstadoProducto, ProductoListado } from "@/lib/tipos";
/*
  El armado del CSV vive en lib/csv desde que hubo una segunda exportación. Lo
  importante de compartirlo no es ahorrar líneas: es que la defensa contra
  inyección de fórmulas de Excel exista UNA vez. Con dos copias, el día que una
  se corrija la otra queda abierta y nadie se entera.
*/
import { BOM, SALTO, SEPARADOR, celdaFecha, celdaNumero, celdaTexto } from "@/lib/csv";

export const dynamic = "force-dynamic";

/*
  Exportación del inventario.

  ── POR QUÉ CSV Y NO UN .xlsx DE VERDAD ────────────────────────────────────

  Un .xlsx obliga a meter una librería de generación de planillas al servidor,
  que pesa varios megabytes, hay que mantener y solo se usa acá. Un CSV bien
  hecho se abre con doble clic en Excel, en Google Sheets, en LibreOffice y en
  cualquier cosa que lea datos, y además se puede versionar y diffear.

  "Bien hecho" no es trivial y es la razón por la que este archivo es largo.
  Un CSV genérico se abre torcido en un Excel chileno. Hay tres cosas que
  arreglarlo requiere:

  1. SEPARADOR PUNTO Y COMA. Excel en español usa el separador de listas del
     sistema, que en es-CL es el punto y coma. Con comas, todo el archivo cae
     en una sola columna y la persona concluye que la exportación está mala.
  2. BOM AL INICIO. Sin esos tres bytes, Excel en Windows lee el archivo con
     la codificación del sistema y "Tetera de cerámica" aparece como
     "Tetera de cerÃ¡mica".
  3. COMA DECIMAL. Un 1500.5 se lee como texto o como mil quinientos cinco. Los
     números van con coma y sin separador de miles, que es lo que Excel es-CL
     entiende como número.

  ── INYECCIÓN DE FÓRMULAS: ESTO NO ES COSMÉTICO ────────────────────────────

  Excel ejecuta como fórmula cualquier celda que empiece con = + - @ o un
  tabulador. Los nombres y descripciones de este inventario los escribe un
  modelo de lenguaje a partir de una foto, o los escribe cualquiera con cuenta
  de operador, incluida la cuenta de demostración que es pública. Un producto
  llamado =HYPERLINK(...) o =cmd|'...' se convierte en código ejecutándose en
  el computador de quien abra la planilla.

  Por eso toda celda de texto que empiece con uno de esos caracteres se
  antecede con una comilla simple, que Excel interpreta como "esto es texto".
  Es la mitigación estándar y no se quita porque afee un nombre.

  ── LO QUE SE EXPORTA ──────────────────────────────────────────────────────

  Exactamente lo que está viendo la persona: los mismos filtros de la pantalla
  viajan en la dirección. Exportar siempre el inventario completo haría que
  alguien filtre por "borradores", exporte, y se lleve todo sin darse cuenta.

  Los DOS precios van en columnas separadas, más la procedencia escrita. Fundir
  los dos en una sola columna "Precio" es lo que convierte una estimación de un
  modelo en un dato de gestión que nadie vuelve a cuestionar.
*/


const COLUMNAS = [
  "SKU",
  "Nombre",
  "Descripción",
  "Categoría",
  "Estado",
  "Cantidad",
  "Unidad",
  "Precio estimado (CLP)",
  "Precio confirmado (CLP)",
  "Precio vigente (CLP)",
  "Procedencia del precio",
  "Valor en stock (CLP)",
  "Ubicación",
  "Movimientos",
  "Origen del dato",
  "Creado",
  "Última modificación",
  "Notas",
];

function procedencia(p: ProductoListado): string {
  if (p.precio_confirmado_clp !== null) return "Fijado por una persona";
  if (p.precio_estimado_clp !== null) return "Estimación del modelo, sin consultar la web";
  return "Sin precio";
}

function fila(p: ProductoListado): string {
  const vigente = p.precio_vigente_clp === null ? null : Number(p.precio_vigente_clp);
  return [
    celdaTexto(p.sku),
    celdaTexto(p.nombre),
    celdaTexto(p.descripcion),
    celdaTexto(p.categoria_nombre ?? "Sin categoría"),
    celdaTexto(ETIQUETA_ESTADO[p.estado as EstadoProducto] ?? p.estado),
    celdaNumero(p.cantidad, 3),
    celdaTexto(p.unidad),
    celdaNumero(p.precio_estimado_clp),
    celdaNumero(p.precio_confirmado_clp),
    celdaNumero(vigente),
    celdaTexto(procedencia(p)),
    celdaNumero(vigente === null ? null : Number(p.cantidad) * vigente),
    celdaTexto(p.ubicacion),
    celdaNumero(p.movimientos),
    celdaTexto(p.origen),
    celdaFecha(p.created_at),
    celdaFecha(p.updated_at),
    celdaTexto(p.notas),
  ].join(SEPARADOR);
}

export async function GET(peticion: Request) {
  /*
    Se verifica acá aunque el proxy ya exija sesión: un Route Handler es una
    dirección pública que cualquiera puede escribir, y apoyar la autorización
    en un matcher de rutas deja un agujero del tamaño de una expresión regular.
    Cualquier rol habilitado puede exportar, porque solo puede exportar lo que
    las políticas RLS ya le dejan leer en pantalla.
  */
  const perfil = await perfilHabilitado();
  if (!perfil) {
    return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  }

  const url = new URL(peticion.url);
  const filtros = {
    buscar: url.searchParams.get("buscar") ?? undefined,
    categoria: url.searchParams.get("categoria") ?? undefined,
    estado: url.searchParams.get("estado") ?? undefined,
  };

  const { productos, truncado, error } = await listarProductos(filtros, LIMITE_EXPORTACION);

  if (error) {
    return NextResponse.json(
      { error: "No pude leer el inventario para exportarlo." },
      { status: 500 },
    );
  }

  const contenido =
    BOM + [COLUMNAS.map(celdaTexto).join(SEPARADOR), ...productos.map(fila)].join(SALTO) + SALTO;

  const hoy = new Date();
  const fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  /*
    Si se alcanzó el tope, el nombre del archivo lo dice. Es feo a propósito:
    tiene que ser imposible cuadrar contra este archivo sin notar que está
    cortado.
  */
  const nombre = truncado
    ? `inventario-${fecha}-PARCIAL-primeros-${LIMITE_EXPORTACION}.csv`
    : `inventario-${fecha}.csv`;

  return new NextResponse(contenido, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      /* Un inventario cambia con cada movimiento: nunca se sirve desde caché. */
      "Cache-Control": "no-store",
    },
  });
}
