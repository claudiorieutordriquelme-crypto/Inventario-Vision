import Link from "next/link";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import {
  cargarResumen,
  ETIQUETA_ORDEN,
  listarCategorias,
  listarProductos,
  POR_PAGINA,
  type OrdenInventario,
} from "@/lib/datos/inventario";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ETIQUETA_ESTADO, formateaNumero, formateaPesos } from "@/lib/formato";
import type { EstadoProducto } from "@/lib/tipos";
import { BuscarPorFoto } from "./buscar-foto";
import { ConsumoApi } from "./consumo-api";
import { IndexarImagenes } from "./indexar-imagenes";
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
const ORDENES: OrdenInventario[] = ["recientes", "antiguos", "nombre", "stock", "precio"];

export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{
    buscar?: string;
    categoria?: string;
    estado?: string;
    ubicacion?: string;
    orden?: string;
    pagina?: string;
  }>;
}) {
  const crudos = await searchParams;

  /*
    Lo que viene en la dirección lo escribe cualquiera, así que se valida antes
    de usarlo: un orden inventado haría fallar la consulta, y una página
    negativa produciría un rango que Postgres rechaza.
  */
  const filtros = {
    buscar: crudos.buscar,
    categoria: crudos.categoria,
    estado: crudos.estado,
    ubicacion: crudos.ubicacion === "tienda" || crudos.ubicacion === "bodega" ? crudos.ubicacion : undefined,
    orden: ORDENES.includes(crudos.orden as OrdenInventario)
      ? (crudos.orden as OrdenInventario)
      : undefined,
    pagina: Math.max(1, Number(crudos.pagina) || 1),
  };

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
  const esAdmin = perfil ? PERMISOS.administrar.includes(perfil.rol) : false;
  /* La página no es un filtro: estar en la 2 no significa que haya nada
     filtrado, y contarla haría que el mensaje de "sin resultados" mienta. */
  const hayFiltros = Boolean(
    filtros.buscar || filtros.categoria || filtros.estado || filtros.ubicacion,
  );

  const desde = listado.total === 0 ? 0 : (listado.pagina - 1) * POR_PAGINA + 1;
  const hasta = Math.min(listado.pagina * POR_PAGINA, listado.total);

  /* Cambiar de página conserva todo lo demás. Perder los filtros al avanzar es
     la forma más rápida de que alguien tenga que empezar de nuevo. */
  const conPagina = (n: number) => {
    const p = new URLSearchParams();
    if (filtros.buscar) p.set("buscar", filtros.buscar);
    if (filtros.categoria) p.set("categoria", filtros.categoria);
    if (filtros.estado) p.set("estado", filtros.estado);
    if (filtros.ubicacion) p.set("ubicacion", filtros.ubicacion);
    if (filtros.orden) p.set("orden", filtros.orden);
    p.set("pagina", String(n));
    return p.toString();
  };

  /*
    Cuántas imágenes faltan por medir para la búsqueda por foto. Solo se
    consulta para el administrador, que es el único que puede indexarlas:
    preguntarlo para todos sería una consulta por cada carga de pantalla que
    nadie más va a poder usar.
  */
  let faltanPorIndexar = 0;
  if (esAdmin) {
    const supabase = await crearClienteServidor();
    const [imagenes, medidas] = await Promise.all([
      supabase.from("producto_imagenes").select("id", { count: "exact", head: true }),
      supabase.from("producto_embeddings").select("imagen_id", { count: "exact", head: true }),
    ]);
    faltanPorIndexar = Math.max(0, (imagenes.count ?? 0) - (medidas.count ?? 0));
  }

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
            {/* El TOTAL, no los de esta página: con paginación, decir "50
                productos" cuando hay mil es derechamente falso. */}
            {formateaNumero(listado.total)}{" "}
            {listado.total === 1 ? "producto" : "productos"}
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

      {/* El consumo de la API lo ve quien carga fotos, porque es quien lo
          gasta. El lector no: no puede provocar una sola llamada al modelo. */}
      {puedeOperar ? <ConsumoApi esAdmin={esAdmin} /> : null}

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

      {/* Buscar con una foto va ANTES de los filtros de texto: cuando tienes
          la pieza en la mano y no sabes cómo se llama, es el único camino que
          sirve, y enterrarlo debajo del formulario lo haría invisible. */}
      <BuscarPorFoto />

      {esAdmin && faltanPorIndexar > 0 ? (
        <IndexarImagenes faltanInicial={faltanPorIndexar} />
      ) : null}

      <form method="get" className="rounded-lg border border-gris-200 p-4">
        {/* La página vuelve a 1 con cada filtro nuevo. Sin esto, filtrar
            estando en la página 7 deja una lista vacía que parece "no hay
            resultados" cuando sí los hay, en la página 1. */}
        <input type="hidden" name="pagina" value="1" />

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
            <span className="mt-1 block text-xs text-gris-500">
              Tolera errores de tipeo y acentos.
            </span>
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

          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Dónde está
            </span>
            <select
              name="ubicacion"
              defaultValue={filtros.ubicacion ?? ""}
              className="mt-1 w-full rounded-md border border-gris-300 px-3 py-2.5 text-sm text-gris-900"
            >
              <option value="">En cualquier parte</option>
              <option value="tienda">En tienda</option>
              <option value="bodega">En bodega</option>
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
              Ordenar por
            </span>
            <select
              name="orden"
              defaultValue={filtros.orden ?? "recientes"}
              className="mt-1 w-full rounded-md border border-gris-300 px-3 py-2.5 text-sm text-gris-900"
            >
              {ORDENES.map((o) => (
                <option key={o} value={o}>
                  {ETIQUETA_ORDEN[o]}
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
        <>
          {/*
            Cuántos hay y cuáles se están viendo. Con un inventario grande, no
            decirlo deja a alguien recorriendo páginas sin saber si va por la
            mitad o por el principio.
          */}
          <p className="text-sm text-gris-600">
            Mostrando {desde} a {hasta} de {formateaNumero(listado.total)}
            {hayFiltros ? " con los filtros aplicados" : ""}.
            {listado.truncado
              ? " La búsqueda por texto trae como mucho 200 coincidencias: afina el término si falta algo."
              : ""}
          </p>

          <ListaInventario
            productos={listado.productos}
            puedeOperar={puedeOperar}
            puedeBorrar={puedeBorrar}
          />

          {listado.paginas > 1 ? (
            <nav
              aria-label="Páginas del inventario"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-gris-200 pt-4"
            >
              {/*
                Anterior y siguiente como enlaces y no como botones: la página
                vive en la dirección, así que el botón atrás funciona, el enlace
                se puede abrir en otra pestaña y recargar no pierde el lugar.
                Un botón con JavaScript no da ninguna de las tres.
              */}
              {listado.pagina > 1 ? (
                <Link
                  href={`/panel?${conPagina(listado.pagina - 1)}`}
                  className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
                >
                  ← Anterior
                </Link>
              ) : (
                <span className="rounded-md border border-gris-200 px-4 py-2 text-sm font-semibold text-gris-400">
                  ← Anterior
                </span>
              )}

              <p className="text-sm font-semibold text-gris-700">
                Página {listado.pagina} de {listado.paginas}
              </p>

              {listado.pagina < listado.paginas ? (
                <Link
                  href={`/panel?${conPagina(listado.pagina + 1)}`}
                  className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
                >
                  Siguiente →
                </Link>
              ) : (
                <span className="rounded-md border border-gris-200 px-4 py-2 text-sm font-semibold text-gris-400">
                  Siguiente →
                </span>
              )}
            </nav>
          ) : null}
        </>
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
