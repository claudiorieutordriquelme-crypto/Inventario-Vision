import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { perfilHabilitado } from "@/lib/auth";
import { obtenerProducto } from "@/lib/datos/inventario";
import { formateaPesos, procedenciaPrecio } from "@/lib/formato";
import { BotonImprimir } from "@/components/boton-imprimir";

export const dynamic = "force-dynamic";

/*
  La etiqueta que se pega en la pieza.

  ── QUÉ LLEVA EL CÓDIGO, Y POR QUÉ UNA URL ─────────────────────────────────

  Lleva la dirección completa de la ficha del producto. Eso le da dos usos con
  un solo código:

  1. Escaneado desde el punto de venta, la aplicación lo reconoce y agrega la
     pieza al carrito sin escribir nada.
  2. Escaneado con la cámara normal de cualquier teléfono, abre la ficha. Eso
     sirve en la bodega, y es lo que un código con un formato propio tipo
     "PANIKO:MEN-0004" no haría: la cámara del sistema no sabría qué hacer con
     él.

  NO ES UNA CREDENCIAL. La ficha exige sesión como todo el panel. Quien
  encuentre una etiqueta en el suelo ve una pantalla de inicio de sesión.

  ── TAMAÑOS ────────────────────────────────────────────────────────────────

  Se ofrecen tres y la diferencia es práctica, no estética: en una taza no cabe
  lo que cabe en un mueble. El QR mantiene su tamaño mínimo legible en los
  tres; lo que cambia es cuánto texto lo acompaña.

  Corrección de errores en nivel M: una etiqueta pegada en una pieza se raya y
  se ensucia, y M tolera alrededor de un 15% del código dañado sin dejar de
  leerse. Subir a Q o H haría el código más denso y más difícil de leer en
  chico, que es el problema que de verdad se tiene acá.
*/

type Tamano = "chica" | "media" | "grande";

const TAMANOS: Record<Tamano, { qr: number; clase: string; rotulo: string }> = {
  chica: { qr: 110, clase: "max-w-[5cm]", rotulo: "Chica (5 cm)" },
  media: { qr: 150, clase: "max-w-[7cm]", rotulo: "Media (7 cm)" },
  grande: { qr: 200, clase: "max-w-[9cm]", rotulo: "Grande (9 cm)" },
};

export default async function EtiquetaProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tamano?: string; copias?: string }>;
}) {
  const { id } = await params;
  const consulta = await searchParams;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const { producto } = await obtenerProducto(id);
  if (!producto) notFound();

  const tamano: Tamano =
    consulta.tamano === "chica" || consulta.tamano === "grande"
      ? consulta.tamano
      : "media";
  /* Tope de copias: una hoja no tiene más de veinte etiquetas de este tamaño, y
     sin tope un cero de más manda mil páginas a la impresora. */
  const copias = Math.min(20, Math.max(1, Number(consulta.copias) || 1));

  /*
    El origen se arma con las cabeceras de la petición y no con una variable de
    entorno: así la etiqueta funciona igual en local, en una vista previa y en
    producción, sin configurar nada que después quede desactualizado.
  */
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  const protocolo =
    cabeceras.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const destino = `${protocolo}://${host}/panel/productos/${producto.id}`;

  const config = TAMANOS[tamano];
  const qr = await QRCode.toString(destino, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: config.qr,
  });

  const precio = procedenciaPrecio(producto.precio_confirmado_clp, producto.precio_estimado_clp);

  return (
    <div className="bg-blanco text-negro">
      <style>{`
        @media print {
          /* Fuera del papel: la barra del panel, el menú y los controles. */
          header, nav, .no-imprimir { display: none !important; }
          body { background: #fff !important; margin: 0; }
          @page { size: auto; margin: 8mm; }
          /* Una etiqueta no se parte entre dos páginas. */
          .etiqueta { break-inside: avoid; }
        }
      `}</style>

      <div className="no-imprimir mb-5 rounded-lg border border-gris-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gris-600">
            Elige el tamaño y las copias, y después imprime.
          </p>
          {/* En un teléfono no hay Ctrl+P: imprimir está escondido en el menú
              del navegador con un nombre distinto en cada uno. El botón abre el
              mismo diálogo en todas partes, y ahí también se puede guardar como
              PDF para mandarlo a imprimir después. */}
          <BotonImprimir>Imprimir etiqueta</BotonImprimir>
        </div>

        <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Tamaño
            </span>
            <select
              name="tamano"
              defaultValue={tamano}
              className="mt-1 rounded-md border border-gris-300 px-3 py-2 text-sm"
            >
              {(Object.keys(TAMANOS) as Tamano[]).map((t) => (
                <option key={t} value={t}>
                  {TAMANOS[t].rotulo}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Copias
            </span>
            <input
              name="copias"
              type="number"
              min={1}
              max={20}
              defaultValue={copias}
              className="mt-1 w-20 rounded-md border border-gris-300 px-3 py-2 text-sm"
            />
          </label>

          <button
            type="submit"
            className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
          >
            Aplicar
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-3">
        {Array.from({ length: copias }, (_, i) => (
          <div
            key={i}
            className={`etiqueta flex items-center gap-3 border-2 border-negro p-3 ${config.clase}`}
          >
            {/* El SVG viene de qrcode, generado acá: no es contenido de un
                usuario, es una imagen derivada de una URL que arma el servidor. */}
            <div className="shrink-0" aria-label="Código del producto" dangerouslySetInnerHTML={{ __html: qr }} />

            <div className="min-w-0">
              <p className="font-mono text-sm font-bold">{producto.sku}</p>
              {/* El nombre se corta en dos líneas: una etiqueta con un párrafo
                  encima no se lee de un vistazo, que es para lo que existe. */}
              <p className="mt-0.5 line-clamp-2 text-sm leading-tight font-bold">
                {producto.nombre}
              </p>
              {tamano !== "chica" ? (
                <>
                  <p className="mt-1 text-xs">{producto.categoria_nombre ?? "Sin categoría"}</p>
                  <p className="mt-0.5 text-sm font-bold">
                    {formateaPesos(producto.precio_vigente_clp)}
                  </p>
                  {/*
                    Si el precio es la estimación del modelo, la etiqueta lo
                    dice. Una etiqueta pegada en la pieza es lo que un cliente
                    va a leer como precio de venta, y ese es exactamente el
                    lugar donde no se puede presentar una estimación como un
                    precio decidido.
                  */}
                  {precio.revisar ? (
                    <p className="mt-0.5 text-[0.6rem] leading-tight">
                      Precio estimado, sin confirmar
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
