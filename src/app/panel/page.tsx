import Link from "next/link";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { cargarResumen, listarCategorias, listarProductos } from "@/lib/datos/inventario";
import { ETIQUETA_ESTADO, formateaNumero, formateaPesos } from "@/lib/formato";
import type { EstadoProducto } from "@/lib/tipos";
import { ListaInventario } from "./piezas-listado";

/*
  Listado del inventario.

  Los filtros van por querystring y en un <form method="get">, sin JavaScript:
  el estado del filtro queda en la dirección, así que se puede compartir un
  enlace a "todo lo que está en borrador" y el botón atrás funciona. Un filtro
  en estado de React no permite ninguna de las dos cosas.
*/
export const dynamic = "force-dynamic";

const ESTADOS: EstadoProducto[] = ["borrador", "confirmado", "archivado"];

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ buscar?: string; categoria?: string; estado?: string }>;
}) {
  const filtros = await searchParams;
  const [perfil, { categorias }, listado, resumen] = await Promise.all([
    perfilHabilitado(),
    listarCategorias(false),
    listarProductos(filtros),
    cargarResumen(),
  ]);

  const puedeOperar = perfil ? PERMISOS.operar.includes(perfil.rol) : false;
  /* Borrar productos NO es lo mismo que administrar: el operador borra, pero
     no toca categorías ni usuarios. */
  const puedeBorrar = perfil ? PERMISOS.borrarProductos.includes(perfil.rol) : false;
  const hayFiltros = Object.values(filtros).some(Boolean);

  /*
    La exportación se lleva lo mismo que está en pantalla, así que los filtros
    viajan en la dirección. Exportar siempre el inventario completo haría que
    alguien filtre por borradores, exporte, y se lleve todo sin notarlo.
  */
  const consultaExportar = new URLSearchParams(
    Object.entries(filtros).filter(([, v]) => Boolean(v)) as [string, string][],
  ).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gris-900">Inventario</h1>
          <p className="mt-1 text-base text-gris-600">
            {listado.productos.length}{" "}
            {listado.productos.length === 1 ? "producto" : "productos"}
            {hayFiltros ? " con los filtros aplicados" : " cargados"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Enlace normal y no <Link>: la navegación de cliente de Next
              interceptaría la respuesta y la descarga nunca empezaría. */}
          <a
            href={consultaExportar ? `/panel/exportar?${consultaExportar}` : "/panel/exportar"}
            className="inline-flex items-center rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
          >
            Exportar a Excel
          </a>
          {puedeOperar ? (
            <Link
              href="/panel/nuevo"
              className="inline-flex items-center rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
            >
              Nuevo con foto
            </Link>
          ) : null}
        </div>
      </div>

      {/* Cuatro cifras, del mismo peso. Un número héroe solo no dice nada:
          la valorización sin el conteo de borradores esconde cuánto de esa
          cifra nadie ha revisado. */}
      {resumen.error ? (
        <p role="alert" className="rounded-md border border-acento p-4 text-sm font-medium text-gris-900">
          No pude leer el resumen. Es un problema de lectura, no que el
          inventario esté vacío.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Productos
            </dt>
            <dd className="mt-0.5 text-2xl font-bold text-gris-900">{resumen.total}</dd>
          </div>
          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Unidades
            </dt>
            <dd className="mt-0.5 text-2xl font-bold text-gris-900">
              {formateaNumero(resumen.unidades)}
            </dd>
          </div>
          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Valorización
            </dt>
            <dd className="mt-0.5 text-2xl font-bold text-gris-900">
              {formateaPesos(resumen.valorizacion)}
            </dd>
            <dd className="mt-1 text-xs text-gris-500">
              Cantidad por precio vigente, sin lo archivado
            </dd>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-gris-200">
            {/* Ámbar: "por revisar" pide atención, no es un error. */}
            <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
            <div className="p-4">
              <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
                Por revisar
              </dt>
              <dd className="mt-0.5 text-2xl font-bold text-gris-900">{resumen.borradores}</dd>
              <dd className="mt-1 text-xs text-gris-500">
                {resumen.precioSinRevisar} con precio solo estimado
              </dd>
            </div>
          </div>
        </dl>
      )}

      <form method="get" className="rounded-lg border border-gris-200 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Buscar
            </span>
            <input
              name="buscar"
              defaultValue={filtros.buscar ?? ""}
              placeholder="Nombre o SKU"
              className="mt-1 w-full rounded-md border border-gris-300 px-3 py-2.5 text-sm text-gris-900"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Categoría
            </span>
            <select
              name="categoria"
              defaultValue={filtros.categoria ?? ""}
              className="mt-1 w-full rounded-md border border-gris-300 px-3 py-2.5 text-sm text-gris-900"
            >
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.activo ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Estado
            </span>
            <select
              name="estado"
              defaultValue={filtros.estado ?? ""}
              className="mt-1 w-full rounded-md border border-gris-300 px-3 py-2.5 text-sm text-gris-900"
            >
              <option value="">Todos</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {ETIQUETA_ESTADO[e]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
          >
            Filtrar
          </button>
          {hayFiltros ? (
            <Link
              href="/panel"
              className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800"
            >
              Limpiar
            </Link>
          ) : null}
        </div>
      </form>

      {listado.error ? (
        <p role="alert" className="rounded-md border border-acento p-4 text-sm font-medium text-gris-900">
          No pude leer el inventario. Avisa a quien administra el sistema; el
          detalle quedó en el registro del servidor.
        </p>
      ) : listado.productos.length === 0 ? (
        <div className="rounded-lg border border-gris-200 p-6">
          <p className="text-base text-gris-600">
            {hayFiltros
              ? "Ningún producto cumple esos filtros."
              : "Todavía no hay productos. Empieza sacándole una foto a uno."}
          </p>
          {!hayFiltros ? (
            <div className="mt-4 flex flex-wrap gap-3">
              {puedeOperar ? (
                <Link
                  href="/panel/nuevo"
                  className="inline-flex items-center rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
                >
                  Cargar la primera foto
                </Link>
              ) : null}
              <Link
                href="/panel/guia"
                className="inline-flex items-center rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
              >
                Cómo se usa
              </Link>
            </div>
          ) : null}
        </div>
      ) : (
        /*
          El listado pasa a ser un componente de cliente porque la selección
          múltiple es estado compartido entre filas: cada casilla necesita
          saber cuántas otras están marcadas. Los datos siguen viniendo de acá,
          ya leídos y filtrados por RLS.
        */
        <ListaInventario
          productos={listado.productos}
          puedeOperar={puedeOperar}
          puedeBorrar={puedeBorrar}
        />
      )}

      {/* Un corte que no se declara se lee como "esto es todo". */}
      {listado.truncado ? (
        <p className="text-xs text-gris-500">
          Se muestran los 500 productos más recientes. Si buscas uno más
          antiguo, acota con el buscador o los filtros.
        </p>
      ) : null}
    </div>
  );
}
