import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { listarVentas, obtenerCliente } from "@/lib/datos/comercial";
import { ETIQUETA_CANAL, ETIQUETA_ENTREGA, PRESENTACION_VENTA, formateaMomento, formateaPesos } from "@/lib/formato";
import { Direcciones, EditarCliente } from "../piezas";

export const dynamic = "force-dynamic";

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { id } = await params;
  const { aviso } = await searchParams;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const { cliente, error } = await obtenerCliente(id);
  if (!cliente) notFound();

  const puedeOperar = PERMISOS.operar.includes(perfil.rol);

  /*
    Las ventas del cliente. Se listan todas y se filtran acá: son decenas, no
    miles, y un filtro por cliente en la consulta obligaría a una variante más
    de listarVentas para ganar muy poco.
  */
  const { ventas } = await listarVentas();
  const suyas = ventas.filter((v) => v.cliente_id === id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/clientes" className="text-sm font-semibold text-primario hover:underline">
          Volver a clientes
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gris-900 sm:text-3xl">{cliente.nombre}</h1>
        <p className="mt-0.5 text-sm text-gris-600">
          Cliente desde {formateaMomento(cliente.created_at)}
        </p>
      </div>

      {aviso === "direccion" ? (
        <div className="flex overflow-hidden rounded-lg border border-marca">
          <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
          <p className="min-w-0 flex-1 px-4 py-3 text-sm text-gris-900">
            <span className="font-bold">El cliente se creó, la dirección no.</span>{" "}
            Agrégala acá abajo: sin ella no se puede confirmar una venta con
            despacho.
          </p>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-md border border-acento p-4 text-sm text-gris-900">
          No pude leer las direcciones. Es un problema de lectura, no que el
          cliente no tenga ninguna.
        </p>
      ) : null}

      {puedeOperar ? (
        <EditarCliente cliente={cliente} />
      ) : (
        <section className="rounded-lg border border-gris-200 p-4">
          <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">Datos</h2>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="font-semibold text-gris-800">Teléfono:</dt>
              <dd className="text-gris-700">{cliente.telefono ?? "—"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-gris-800">Correo:</dt>
              <dd className="text-gris-700">{cliente.email ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-gris-600">
            Tu rol es de solo lectura, así que los datos están bloqueados.
          </p>
        </section>
      )}

      <Direcciones clienteId={cliente.id} direcciones={cliente.direcciones} />

      <section>
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Sus compras
        </h2>
        {suyas.length === 0 ? (
          <p className="mt-3 rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
            Todavía no tiene ventas registradas.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {suyas.map((v) => {
              const pres = PRESENTACION_VENTA[v.estado];
              return (
                <li key={v.id}>
                  <Link
                    href={`/panel/venta/${v.id}`}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-gris-200 p-4 transition-colors hover:border-primario"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-bold text-gris-900">{v.folio}</p>
                      <p className="mt-0.5 text-sm text-gris-600">
                        {ETIQUETA_CANAL[v.canal]} · {ETIQUETA_ENTREGA[v.tipo_entrega]} ·{" "}
                        {formateaMomento(v.confirmada_at ?? v.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-base font-bold text-gris-900">
                        {formateaPesos(v.total_clp)}
                      </span>
                      <span
                        className={`rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
                      >
                        {pres.etiqueta}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
