import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { formateaNumero, formateaPesos } from "@/lib/formato";
import { BorrarProducto } from "@/app/panel/borrar-producto";

/*
  Revisión de lo que salió de una foto.

  Existe porque una foto puede dar seis productos, y mandar a la persona al
  listado general después de cargarlos sería perder cuál fue cuál: quedarían
  mezclados entre otros quinientos, sin nada que los relacione con la imagen
  que acaba de sacar.

  Acá la foto se ve completa y al lado cada producto con su ubicación en
  palabras. Esa frase es lo único que permite decir "el alicate rojo del centro
  es este". Es el motivo de que se le pida al modelo.
*/
export const dynamic = "force-dynamic";

export default async function RevisionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const supabase = await crearClienteServidor();

  const [resAnalisis, resProductos] = await Promise.all([
    supabase
      .from("analisis_imagen")
      .select("id, foto_path, productos_detectados, error, costo_usd, duracion_ms, created_at")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("productos")
      .select(
        "id, sku, nombre, descripcion, cantidad, unidad, precio_estimado_clp, ubicacion_en_foto, indice_en_foto, notas, categorias(nombre), movimientos_inventario(count)",
      )
      .eq("analisis_id", id)
      .order("indice_en_foto"),
  ]);

  if (resAnalisis.error) {
    console.error("No pude leer el análisis:", resAnalisis.error.message);
  }
  if (!resAnalisis.data) notFound();

  const analisis = resAnalisis.data as {
    id: string;
    foto_path: string;
    productos_detectados: number;
    error: string | null;
    costo_usd: number | null;
    duracion_ms: number | null;
  };

  /* La foto vive en un bucket privado: URL firmada de vida corta. */
  const { data: firmada } = await supabase.storage
    .from("fotos")
    .createSignedUrl(analisis.foto_path, 300);

  const uno = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  type Fila = {
    id: string;
    sku: string;
    nombre: string;
    descripcion: string | null;
    cantidad: number;
    unidad: string;
    precio_estimado_clp: number | null;
    ubicacion_en_foto: string | null;
    indice_en_foto: number | null;
    notas: string | null;
    categorias: { nombre: string } | { nombre: string }[] | null;
    movimientos_inventario: { count: number }[] | { count: number } | null;
  };

  const productos = ((resProductos.data ?? []) as unknown as Fila[]).map((p) => ({
    ...p,
    categoria_nombre: uno(p.categorias)?.nombre ?? null,
    /* Se cuenta para poder declarar, antes de confirmar un borrado, cuánto
       historial se lleva en cascada. */
    movimientos: Number(uno(p.movimientos_inventario)?.count ?? 0),
  }));

  const puedeOperar = PERMISOS.operar.includes(perfil.rol);
  const puedeBorrar = PERMISOS.borrarProductos.includes(perfil.rol);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel" className="text-sm font-semibold text-primario hover:underline">
          Ir al inventario
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gris-900">
          {productos.length} {productos.length === 1 ? "producto cargado" : "productos cargados"} de
          esta foto
        </h1>
        <p className="mt-1 max-w-prose text-base text-gris-600">
          Todos quedaron en <strong className="font-semibold text-gris-900">borrador</strong>.
          Revisa cada uno y confírmalo, corrígelo si el análisis se equivocó, o
          bórralo desde aquí mismo si no corresponde a nada real.
        </p>
      </div>

      {analisis.error ? (
        <div className="flex overflow-hidden rounded-lg border border-gris-200">
          <div className="w-2 shrink-0 bg-acento" aria-hidden="true" />
          <div className="p-4">
            <h2 className="text-sm font-bold text-gris-900">El análisis no se pudo completar</h2>
            <p className="mt-1.5 max-w-prose text-sm text-gris-600">{analisis.error}</p>
            <p className="mt-1.5 max-w-prose text-sm text-gris-600">
              La foto sí se guardó y quedó un borrador vacío asociado a ella, así
              que puedes completar los datos a mano sin volver a la bodega.
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="space-y-3">
          {firmada?.signedUrl ? (
            <figure className="rounded-lg border border-gris-200 p-3 lg:sticky lg:top-28">
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada y efímera: el optimizador de Next la cachearía más allá de su vida útil */}
              <img
                src={firmada.signedUrl}
                alt="La foto que se analizó"
                className="mx-auto w-full rounded"
              />
              <figcaption className="mt-2 text-xs text-gris-500">
                Usa la ubicación de cada producto para saber cuál es cuál en esta
                imagen.
              </figcaption>
            </figure>
          ) : (
            <div className="rounded-lg border border-gris-200 p-6 text-sm text-gris-500">
              No pude cargar la foto.
            </div>
          )}
        </div>

        <div className="space-y-3">
          {productos.length === 0 ? (
            <p className="rounded-lg border border-gris-200 p-6 text-base text-gris-600">
              No quedó ningún producto asociado a este análisis.
            </p>
          ) : (
            <ul className="space-y-3">
              {productos.map((p) => (
                <li key={p.id} className="flex overflow-hidden rounded-lg border border-gris-200">
                  {/* Ámbar porque están en borrador: pendiente de revisión. */}
                  <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
                  <div className="min-w-0 flex-1 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
                          {p.categoria_nombre ?? "Sin categoría"}
                        </p>
                        <h2 className="text-lg font-bold text-gris-900">{p.nombre}</h2>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-gris-700">
                          {p.sku}
                        </p>
                      </div>
                      {p.indice_en_foto ? (
                        <span className="shrink-0 rounded bg-gris-100 px-2 py-1 text-xs font-bold text-gris-700">
                          {p.indice_en_foto} de {productos.length}
                        </span>
                      ) : null}
                    </div>

                    {/* La ubicación va destacada y no como un dato más: es lo
                        que conecta esta ficha con la foto de al lado. */}
                    {p.ubicacion_en_foto ? (
                      <p className="mt-2 text-sm font-semibold text-primario">
                        En la foto: {p.ubicacion_en_foto}
                      </p>
                    ) : null}

                    {p.descripcion ? (
                      <p className="mt-1.5 max-w-prose text-sm text-gris-600">{p.descripcion}</p>
                    ) : null}

                    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gris-600">
                      <div className="flex gap-1">
                        <dt className="font-semibold">Cantidad:</dt>
                        <dd>
                          {formateaNumero(p.cantidad)} {p.unidad}
                        </dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="font-semibold">Precio estimado:</dt>
                        <dd>{formateaPesos(p.precio_estimado_clp)}</dd>
                      </div>
                    </dl>

                    {p.notas ? (
                      <p className="mt-2 rounded border border-gris-200 px-3 py-2 text-sm text-gris-700">
                        {p.notas}
                      </p>
                    ) : null}

                    {/*
                      El borrado vive acá y no solo en el listado porque esta
                      es la pantalla donde se necesita: llegan ocho productos
                      de golpe y dos están mal identificados. Mandar a la
                      persona a buscarlos después entre quinientos, o a entrar
                      uno por uno a su ficha, es la forma más segura de que los
                      deje ahí y ensucien el inventario para siempre.
                    */}
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <Link
                        href={`/panel/productos/${p.id}`}
                        className="inline-flex items-center rounded-lg bg-primario px-3 py-2 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
                      >
                        {puedeOperar ? "Revisar y confirmar" : "Ver ficha"}
                      </Link>
                      {puedeBorrar ? (
                        <BorrarProducto id={p.id} sku={p.sku} movimientos={p.movimientos} />
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2 border-t border-gris-200 pt-4">
            <Link
              href="/panel/nuevo"
              className="rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
            >
              Cargar otra foto
            </Link>
            <Link
              href="/panel?estado=borrador"
              className="rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Ver todo lo pendiente de revisar
            </Link>
          </div>

          {/*
            El costo se muestra a quien administra y no a todo el mundo. Un
            operador que carga cincuenta fotos no necesita ver el gasto de cada
            una; quien paga la cuenta, sí.
          */}
          {perfil.rol === "admin" && analisis.costo_usd !== null ? (
            <p className="text-xs text-gris-500">
              Este análisis costó {analisis.costo_usd.toFixed(4)} dólares y tardó{" "}
              {Math.round((analisis.duracion_ms ?? 0) / 100) / 10} segundos.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
