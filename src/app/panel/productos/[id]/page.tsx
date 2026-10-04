import Link from "next/link";
import { notFound } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { listarCategorias, obtenerProducto } from "@/lib/datos/inventario";
import { listarImagenes } from "@/lib/datos/imagenes";
import { hayAnalisisDisponible } from "@/lib/env";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { ReferenciaProducto } from "@/lib/tipos";
import { Galeria } from "./galeria";
import { Referencias } from "./referencias";
import {
  ETIQUETA_MOVIMIENTO,
  PRESENTACION_ESTADO,
  formateaMomento,
  formateaNumero,
  formateaPesos,
  procedenciaPrecio,
} from "@/lib/formato";
import { EditarProducto, RegistrarMovimiento, ZonaBorrado } from "./piezas";

export const dynamic = "force-dynamic";

export default async function ProductoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ registrado?: string }>;
}) {
  const { id } = await params;
  const { registrado } = await searchParams;

  const [{ producto, movimientos, error }, perfil, { categorias }] = await Promise.all([
    obtenerProducto(id),
    perfilHabilitado(),
    listarCategorias(false),
  ]);

  if (!producto) notFound();

  const puedeOperar = perfil ? PERMISOS.operar.includes(perfil.rol) : false;
  const puedeBorrar = perfil ? PERMISOS.borrarProductos.includes(perfil.rol) : false;

  /*
    Las imágenes viven en un bucket privado. Se firman URL de vida corta en el
    servidor y se pasan ya resueltas: así no hace falta JavaScript de cliente
    para verlas, y dejan de servir en cinco minutos. Un bucket público habría
    sido más simple y habría dejado las fotos del inventario en una dirección
    adivinable.
  */
  const { imagenes, error: errorImagenes } = await listarImagenes(producto.id);

  /*
    Las referencias aceptadas. Van en su propia consulta y no en obtenerProducto
    porque solo las necesita esta pantalla: el listado del inventario no las
    muestra, y traerlas ahí sería cargarlas quinientas veces para nada.
  */
  const supabaseRef = await crearClienteServidor();
  const { data: refs, error: errorRefs } = await supabaseRef
    .from("producto_referencias")
    .select("id, producto_id, url, titulo, extracto, dominio, respalda, precio_mencionado_clp, created_at")
    .eq("producto_id", producto.id)
    .order("created_at", { ascending: false });

  if (errorRefs) {
    console.error("No pude leer las referencias:", errorRefs.message);
  }
  const referencias = (refs ?? []) as ReferenciaProducto[];

  const pres = PRESENTACION_ESTADO[producto.estado];
  const precio = procedenciaPrecio(producto.precio_confirmado_clp, producto.precio_estimado_clp);

  return (
    <div className="space-y-8">
      {/*
        Confirmación del alta.

        VA ARRIBA DE TODO Y CON role="status", no como un aviso que se desvanece
        solo. Dos razones: quien acaba de cargar llega acá con la pieza todavía
        en la mano y necesita ver que quedó guardada antes de soltarla, y un
        mensaje que se borra a los tres segundos es invisible para quien usa
        lector de pantalla o se distrajo. Se va al navegar, que es cuando ya
        cumplió.

        Dice además lo que sigue, porque el producto queda en BORRADOR: sin eso,
        "registrado" se lee como "terminado" y nadie vuelve a revisarlo.
      */}
      {registrado ? (
        <div role="status" className="flex overflow-hidden rounded-lg border border-primario">
          <div className="w-2 shrink-0 bg-primario" aria-hidden="true" />
          <div className="min-w-0 flex-1 px-4 py-3">
            <p className="text-base font-bold text-gris-900">Producto registrado</p>
            <p className="mt-1 text-sm text-gris-600">
              Quedó en borrador con el SKU{" "}
              <span className="font-mono font-semibold">{producto.sku}</span>. Revisa
              los datos de abajo y confírmalo cuando estén correctos.
            </p>
          </div>
        </div>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/panel" className="text-sm font-semibold text-primario hover:underline">
            Volver al inventario
          </Link>

          {/*
            La etiqueta se abre en otra pestaña: imprimir deja la ventana en un
            estado raro y volver atrás desde ahí perdería la ficha que se estaba
            revisando.
          */}
          <a
            href={`/panel/productos/${producto.id}/etiqueta`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-gris-300 px-3 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-current" aria-hidden="true">
              <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8 0h2v2h-2v-2zm4-2h2v2h2v2h-2v2h-2v2h-2v-2h-2v-2h2v-4h2v2h2v-2zm2 6h2v2h-2v-2z" />
            </svg>
            Imprimir etiqueta con código
          </a>
        </div>


        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              {producto.categoria_nombre ?? "Sin categoría"}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-gris-900 sm:text-3xl">{producto.nombre}</h1>
            <p className="mt-0.5 font-mono text-base font-semibold text-gris-700">{producto.sku}</p>
          </div>

          <span
            className={`shrink-0 rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
          >
            {pres.etiqueta}
          </span>
        </div>

        <p className="mt-2 max-w-prose text-sm text-gris-600">{pres.explica}</p>
      </div>

      {/*
        La galería va a lo ancho y antes de las cifras. Las imágenes son lo
        primero que se mira de una pieza usada, y además son lo que decide si
        el producto se puede confirmar: meterlas en una columna lateral dejaba
        el aviso de "incompleto" fuera de la vista.
      */}
      <Galeria
        productoId={producto.id}
        nombre={producto.nombre}
        imagenes={imagenes}
        puedeOperar={puedeOperar}
        errorLectura={errorImagenes}
      />

      <section>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Cantidad
            </dt>
            <dd className="mt-0.5 text-2xl font-bold text-gris-900">
              {formateaNumero(producto.cantidad)}
            </dd>
            <dd className="mt-0.5 text-xs text-gris-500">{producto.unidad}</dd>
          </div>

          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">Precio</dt>
            <dd className="mt-0.5 text-2xl font-bold text-gris-900">{precio.valor}</dd>
            {/*
              La procedencia del precio va SIEMPRE, no solo cuando es estimado.
              Es el único dato de esta ficha que alguien puede usar para decidir
              una compra, y la diferencia entre "lo estimó un modelo" y "lo fijó
              una persona" es toda la diferencia.
            */}
            <dd className="mt-0.5 text-xs text-gris-500">{precio.origen}</dd>
          </div>

          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Valor en stock
            </dt>
            <dd className="mt-0.5 text-lg font-bold text-gris-900">
              {formateaPesos(
                producto.precio_vigente_clp !== null
                  ? Number(producto.cantidad) * Number(producto.precio_vigente_clp)
                  : null,
              )}
            </dd>
          </div>

          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Ubicación
            </dt>
            <dd className="mt-0.5 text-lg font-semibold text-gris-900">
              {producto.ubicacion || "Sin registrar"}
            </dd>
          </div>
        </dl>
      </section>

      {/* La estimación se muestra aparte y siempre, aunque ya haya un precio
          fijado: es la evidencia de cuánto se equivoca el modelo, y borrarla de
          la vista es perder la única forma de calibrar cuánto desconfiar. */}
      {producto.precio_estimado_clp !== null ? (
        <section className="rounded-lg border border-gris-200 p-4">
          <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
            Lo que estimó el análisis
          </h2>
          <p className="mt-2 text-lg font-bold text-gris-900">
            {formateaPesos(producto.precio_estimado_clp)}
          </p>
          <p className="mt-1 max-w-prose text-sm text-gris-600">
            Estimación del modelo a partir de la foto, en pesos chilenos.{" "}
            <strong className="font-semibold text-gris-900">No consultó la web</strong>: sale de su
            conocimiento, que tiene fecha de corte. Se conserva aunque fijes otro
            precio, para poder comparar.
          </p>
        </section>
      ) : null}

      <section className="space-y-3 border-t border-gris-200 pt-6">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Datos del producto
        </h2>
        <EditarProducto producto={producto} categorias={categorias} puedeOperar={puedeOperar} />
      </section>

      <section className="border-t border-gris-200 pt-6">
        <Referencias
          productoId={producto.id}
          guardadas={referencias}
          puedeOperar={puedeOperar}
          busquedaDisponible={hayAnalisisDisponible()}
        />
      </section>

      <section className="space-y-3 border-t border-gris-200 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
            Movimientos
          </h2>
          <p className="text-sm text-gris-600">
            La cantidad es la suma de esta lista. El libro no se edita ni se borra.
          </p>
        </div>

        {puedeOperar ? <RegistrarMovimiento productoId={producto.id} /> : null}

        {error ? (
          <p role="alert" className="rounded-md border border-acento p-4 text-sm font-medium text-gris-900">
            No pude leer los movimientos. Es un problema de lectura, no que no
            haya ninguno: la cantidad de arriba puede estar desactualizada en
            pantalla.
          </p>
        ) : movimientos.length === 0 ? (
          <p className="rounded-lg border border-gris-200 p-4 text-sm text-gris-600">
            Sin movimientos todavía. Registra un ingreso para que el stock deje
            de estar en cero.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gris-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gris-200 text-left text-xs font-semibold tracking-wide text-gris-500 uppercase">
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-gris-100 last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap text-gris-600">
                      {formateaMomento(m.created_at)}
                    </td>
                    <td className="px-3 py-2 font-semibold text-gris-900">
                      {ETIQUETA_MOVIMIENTO[m.tipo]}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-gris-900">
                      {/* El signo se escribe, no se deduce del color: en una
                          tabla larga el signo es lo único que se lee rápido. */}
                      {Number(m.cantidad) > 0 ? "+" : ""}
                      {formateaNumero(m.cantidad)}
                    </td>
                    <td className="px-3 py-2 text-gris-600">{m.motivo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {puedeBorrar ? (
        <section className="border-t border-gris-200 pt-6">
          <ZonaBorrado
            id={producto.id}
            sku={producto.sku}
            tieneMovimientos={movimientos.length > 0}
          />
        </section>
      ) : null}
    </div>
  );
}
