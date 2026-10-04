import Link from "next/link";
import { redirect } from "next/navigation";
import { perfilHabilitado } from "@/lib/auth";
import { listarDespachos } from "@/lib/datos/comercial";
import { FLUJO_DESPACHO, PRESENTACION_DESPACHO, formateaMomento } from "@/lib/formato";

export const dynamic = "force-dynamic";

/*
  Los despachos, agrupados por estado.

  EL ORDEN ES EL DEL FLUJO, no el de la fecha: lo primero que alguien quiere
  ver al abrir esta pantalla es qué falta embalar, no qué se entregó la semana
  pasada. Lo entregado y lo anulado van al final.
*/
export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const { despachos, error } = await listarDespachos(estado);

  const porEstado = (e: string) => despachos.filter((d) => d.estado === e);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gris-900">Delivery</h1>
        <p className="mt-1 max-w-prose text-base text-gris-600">
          Los despachos se crean solos al confirmar una venta con entrega a
          domicilio. Acá se arman las cajas, se imprime su código y se sigue el
          camino hasta la entrega.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Estado</span>
          <select
            name="estado"
            defaultValue={estado ?? ""}
            className="mt-1.5 rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
          >
            <option value="">Todos</option>
            {FLUJO_DESPACHO.map((e) => (
              <option key={e} value={e}>
                {PRESENTACION_DESPACHO[e].etiqueta}
              </option>
            ))}
            <option value="anulado">Anulado</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
        >
          Filtrar
        </button>
      </form>

      {error ? (
        <p role="alert" className="rounded-md border border-acento p-4 text-sm text-gris-900">
          No pude leer los despachos. Es un problema de lectura, no que no haya
          ninguno.
        </p>
      ) : despachos.length === 0 ? (
        <p className="rounded-lg border border-gris-200 p-6 text-base text-gris-600">
          No hay despachos. Aparecen acá cuando se confirma una venta con entrega
          a domicilio.
        </p>
      ) : (
        <div className="space-y-6">
          {[...FLUJO_DESPACHO, "anulado" as const].map((e) => {
            const grupo = porEstado(e);
            if (grupo.length === 0) return null;
            const pres = PRESENTACION_DESPACHO[e];

            return (
              <section key={e}>
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold tracking-widest text-gris-500 uppercase">
                  {pres.etiqueta}
                  <span className="rounded bg-gris-100 px-2 py-0.5 text-xs font-bold text-gris-700">
                    {grupo.length}
                  </span>
                </h2>
                <p className="mt-1 text-sm text-gris-600">{pres.explica}</p>

                <ul className="mt-3 space-y-2">
                  {grupo.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/panel/delivery/${d.id}`}
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-gris-200 p-4 transition-colors hover:border-primario"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-bold text-gris-900">{d.folio}</p>
                          <p className="mt-0.5 text-sm text-gris-700">
                            {d.cliente_nombre ?? "Sin cliente"}
                          </p>
                          <p className="text-sm text-gris-600">
                            {[d.direccion, d.comuna].filter(Boolean).join(", ") || "Sin dirección"}
                          </p>
                          <p className="text-xs text-gris-500">
                            {formateaMomento(d.entregado_at ?? d.created_at)}
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-gris-700">
                          {d.cajas} {d.cajas === 1 ? "caja" : "cajas"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
