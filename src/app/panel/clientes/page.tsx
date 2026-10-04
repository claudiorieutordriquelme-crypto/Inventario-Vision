import Link from "next/link";
import { redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { listarClientes } from "@/lib/datos/comercial";
import { CrearCliente } from "./piezas";

export const dynamic = "force-dynamic";

/*
  Mantenedor de clientes.

  EL FILTRO VA POR QUERYSTRING, en un <form method="get"> sin JavaScript, igual
  que el del inventario: el estado del filtro queda en la dirección, así que se
  puede compartir un enlace y el botón atrás funciona.
*/
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string; inactivos?: string }>;
}) {
  const filtros = await searchParams;
  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const puedeOperar = PERMISOS.operar.includes(perfil.rol);
  const { clientes, error } = await listarClientes(filtros.buscar, filtros.inactivos === "1");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gris-900">Clientes</h1>
          <p className="mt-1 max-w-prose text-base text-gris-600">
            Quién compra y a dónde se le despacha. Una venta con despacho necesita
            un cliente con dirección.
          </p>
        </div>
        {puedeOperar ? <CrearCliente /> : null}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1">
          <span className="text-sm font-semibold text-gris-800">Buscar</span>
          <input
            name="buscar"
            defaultValue={filtros.buscar ?? ""}
            placeholder="Nombre, teléfono o correo"
            className="mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
          />
        </label>
        <label className="flex items-center gap-2 pb-3">
          <input
            type="checkbox"
            name="inactivos"
            value="1"
            defaultChecked={filtros.inactivos === "1"}
            className="size-4"
          />
          <span className="text-sm text-gris-800">Incluir inactivos</span>
        </label>
        <button
          type="submit"
          className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
        >
          Filtrar
        </button>
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-acento p-4 text-sm font-medium text-gris-900"
        >
          No pude leer los clientes. Es un problema de lectura, no que no haya
          ninguno.
        </p>
      ) : clientes.length === 0 ? (
        <p className="rounded-lg border border-gris-200 p-6 text-base text-gris-600">
          {filtros.buscar
            ? "Ningún cliente coincide con esa búsqueda."
            : "Todavía no hay clientes cargados."}
        </p>
      ) : (
        <ul className="space-y-2">
          {clientes.map((c) => (
            <li key={c.id}>
              <Link
                href={`/panel/clientes/${c.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-lg border border-gris-200 p-4 transition-colors hover:border-primario"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-base font-bold text-gris-900">
                    {c.nombre}
                    {!c.activo ? (
                      <span className="rounded bg-gris-200 px-1.5 py-0.5 text-xs font-bold tracking-wide text-gris-700 uppercase">
                        Inactivo
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-gris-600">
                    {[c.telefono, c.email].filter(Boolean).join(" · ") || "Sin contacto cargado"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-primario">Ver ficha</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
