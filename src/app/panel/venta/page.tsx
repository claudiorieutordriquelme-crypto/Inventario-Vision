import Link from "next/link";
import { redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { listarVentas } from "@/lib/datos/comercial";
import {
  ETIQUETA_CANAL,
  ETIQUETA_ENTREGA,
  PRESENTACION_VENTA,
  formateaMomento,
  formateaPesos,
} from "@/lib/formato";
import { abrirVenta } from "./acciones";

export const dynamic = "force-dynamic";

const ESTADOS = ["borrador", "confirmada", "anulada"] as const;

export default async function VentasPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; canal?: string; buscar?: string }>;
}) {
  const filtros = await searchParams;
  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const puedeOperar = PERMISOS.operar.includes(perfil.rol);
  const { ventas, error } = await listarVentas(filtros);

  /*
    El total del día se calcula sobre lo CONFIRMADO del listado. Los borradores
    no suman: todavía no se cobró nada, y mostrarlos en el total haría que el
    corte de caja no cuadre contra el dinero que hay en el cajón.
  */
  const hoy = new Date().toDateString();
  const delDia = ventas.filter(
    (v) => v.estado === "confirmada" && v.confirmada_at && new Date(v.confirmada_at).toDateString() === hoy,
  );
  const totalDia = delDia.reduce((suma, v) => suma + Number(v.total_clp), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gris-900">Punto de venta</h1>
          <p className="mt-1 max-w-prose text-base text-gris-600">
            Cada venta descuenta el stock al confirmarse, no antes. Las que van
            con despacho pasan solas a Delivery.
          </p>
        </div>

        {puedeOperar ? (
          <form action={abrirVenta}>
            <button
              type="submit"
              className="rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
            >
              Nueva venta
            </button>
          </form>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gris-200 p-4">
          <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
            Vendido hoy
          </dt>
          <dd className="mt-0.5 text-2xl font-bold text-gris-900">{formateaPesos(totalDia)}</dd>
          <dd className="mt-0.5 text-xs text-gris-500">Solo ventas confirmadas</dd>
        </div>
        <div className="rounded-lg border border-gris-200 p-4">
          <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
            Ventas hoy
          </dt>
          <dd className="mt-0.5 text-2xl font-bold text-gris-900">{delDia.length}</dd>
        </div>
        <div className="rounded-lg border border-gris-200 p-4">
          <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
            Carritos abiertos
          </dt>
          <dd className="mt-0.5 text-2xl font-bold text-gris-900">
            {ventas.filter((v) => v.estado === "borrador").length}
          </dd>
        </div>
      </dl>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-gris-800">Folio</span>
          <input
            name="buscar"
            defaultValue={filtros.buscar ?? ""}
            placeholder="V-00012"
            className="mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Estado</span>
          <select
            name="estado"
            defaultValue={filtros.estado ?? ""}
            className="mt-1.5 rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {PRESENTACION_VENTA[e].etiqueta}
              </option>
            ))}
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
          No pude leer las ventas. Es un problema de lectura, no que no haya
          ninguna.
        </p>
      ) : ventas.length === 0 ? (
        <p className="rounded-lg border border-gris-200 p-6 text-base text-gris-600">
          No hay ventas con esos filtros.
        </p>
      ) : (
        <ul className="space-y-2">
          {ventas.map((v) => {
            const pres = PRESENTACION_VENTA[v.estado];
            return (
              <li key={v.id}>
                <Link
                  href={`/panel/venta/${v.id}`}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-gris-200 p-4 transition-colors hover:border-primario"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-gris-900">{v.folio}</span>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
                      >
                        {pres.etiqueta}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm text-gris-600">
                      {ETIQUETA_CANAL[v.canal]} · {ETIQUETA_ENTREGA[v.tipo_entrega]} ·{" "}
                      {v.cliente_nombre ?? "Sin cliente"}
                    </p>
                    <p className="text-xs text-gris-500">
                      {formateaMomento(v.confirmada_at ?? v.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-lg font-bold text-gris-900">
                    {formateaPesos(v.total_clp)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
