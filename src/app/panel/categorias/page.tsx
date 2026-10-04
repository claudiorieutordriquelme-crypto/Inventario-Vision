import { redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { listarCategorias } from "@/lib/datos/inventario";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { AccionesCategoria, CrearCategoria } from "./piezas";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");
  if (!PERMISOS.administrar.includes(perfil.rol)) redirect("/panel");

  const supabase = await crearClienteServidor();
  const [{ categorias, error }, resProductos, resCorrelativos] = await Promise.all([
    listarCategorias(false),
    supabase.from("productos").select("categoria_id").limit(5000),
    supabase.from("correlativos_sku").select("prefijo, ultimo"),
  ]);

  /*
    Cuántos productos tiene cada categoría. Decide si se ofrece el borrado, así
    que un fallo de lectura NO puede contarse como cero: eso mostraría el botón
    en categorías que sí tienen productos, y aunque la base rechazaría el
    borrado, la pantalla ya habría afirmado algo falso.
  */
  const conteoFiable = !resProductos.error;
  const porCategoria = new Map<string, number>();
  if (resProductos.error) {
    console.error("No pude contar los productos por categoría:", resProductos.error.message);
  } else {
    for (const p of (resProductos.data ?? []) as { categoria_id: string | null }[]) {
      if (!p.categoria_id) continue;
      porCategoria.set(p.categoria_id, (porCategoria.get(p.categoria_id) ?? 0) + 1);
    }
  }

  const correlativos = new Map(
    ((resCorrelativos.data ?? []) as { prefijo: string; ultimo: number }[]).map((c) => [
      c.prefijo,
      c.ultimo,
    ]),
  );

  /*
    Solo una categoría raíz puede ser madre: el árbol es de un solo nivel y el
    trigger de la base rechaza lo demás. Ofrecer las hijas en el menú sería
    ofrecer una opción que siempre falla.
  */
  const raices = categorias.filter((c) => !c.padre_id);
  const nombrePorId = new Map(categorias.map((c) => [c.id, c.nombre]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gris-900">Categorías</h1>
          <p className="mt-1 max-w-prose text-base text-gris-600">
            Definen el prefijo del SKU y son la lista entre la que elige el
            análisis al clasificar una foto. El modelo no inventa categorías: usa
            una de estas o deja el producto sin clasificar.
          </p>
        </div>
        <CrearCategoria raices={raices} />
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-acento p-4 text-sm font-medium text-gris-900">
          No pude leer las categorías. Es un problema de lectura, no que no haya
          ninguna.
        </p>
      ) : categorias.length === 0 ? (
        <p className="rounded-lg border border-gris-200 p-6 text-base text-gris-600">
          No hay categorías. Sin al menos una activa, todo producto nuevo va a
          quedar sin clasificar.
        </p>
      ) : (
        <ul className="space-y-3">
          {categorias.map((c) => {
            const productos = porCategoria.get(c.id) ?? 0;
            const emitidos = correlativos.get(c.prefijo_sku) ?? 0;
            return (
              <li key={c.id} className="rounded-lg border border-gris-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    {/* La madre va encima del nombre y no al lado: leer
                        "Antigüedades / Muñecas de porcelana" de corrido es lo
                        que hace entender la jerarquía sin explicarla. */}
                    {c.padre_id ? (
                      <p className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
                        {nombrePorId.get(c.padre_id) ?? "Categoría madre borrada"}
                      </p>
                    ) : null}
                    <h2 className="text-lg font-bold text-gris-900">{c.nombre}</h2>
                    <p className="mt-0.5 font-mono text-sm font-semibold text-gris-700">
                      {c.prefijo_sku}-0001
                    </p>
                    {c.descripcion ? (
                      <p className="mt-1 max-w-prose text-sm text-gris-600">{c.descripcion}</p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {/* Ámbar de marca con texto negro: 10:1 medido. Lleva su
                        palabra escrita, nunca es solo el color. */}
                    {c.pieza_unica ? (
                      <span className="rounded bg-marca px-2 py-1 text-xs font-bold tracking-wide text-negro uppercase">
                        Pieza única
                      </span>
                    ) : null}
                    {!c.activo ? (
                      <span className="rounded bg-gris-200 px-2 py-1 text-xs font-bold tracking-wide text-gris-700 uppercase">
                        Inactiva
                      </span>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gris-600">
                  <div className="flex gap-1">
                    <dt className="font-semibold">Productos:</dt>
                    <dd>{conteoFiable ? productos : "no pude contarlos"}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-semibold">SKU emitidos:</dt>
                    <dd>{emitidos}</dd>
                  </div>
                </dl>

                {conteoFiable ? (
                  <AccionesCategoria
                    categoria={c}
                    productos={productos}
                    raices={raices.filter((r) => r.id !== c.id)}
                  />
                ) : (
                  <p className="mt-3 border-t border-gris-100 pt-3 text-sm text-gris-600">
                    No pude contar los productos de esta categoría, así que no
                    ofrezco editarla ni borrarla hasta poder hacerlo.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
