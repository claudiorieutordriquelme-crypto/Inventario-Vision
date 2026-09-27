"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  cambiarEstadoProducto,
  cambiarEstadoProductos,
  eliminarProducto,
  eliminarProductos,
  type EstadoAccion,
  type EstadoMasivo,
} from "./acciones";
import {
  PRESENTACION_ESTADO,
  formateaMomento,
  formateaNumero,
  formateaPesos,
  procedenciaPrecio,
} from "@/lib/formato";
import type { ProductoListado } from "@/lib/tipos";

/*
  El listado del inventario, con selección, previsualización y acciones.

  POR QUÉ ESTO ES UN COMPONENTE DE CLIENTE Y NO SERVIDOR. La selección múltiple
  es estado compartido entre filas: cada casilla tiene que saber cuántas otras
  están marcadas para que la barra de acciones diga la verdad. Eso no se puede
  resolver con islas de cliente sueltas dentro de una lista de servidor. Los
  datos siguen viniendo del servidor, ya leídos y filtrados por RLS; acá solo
  se dibujan.

  ── LA REGLA QUE MANDA EN EL BORRADO ───────────────────────────────────────

  Desde la migración 20260927120000 la llave de movimientos_inventario es
  CASCADE: borrar un producto se lleva su libro completo. Antes era RESTRICT y
  dejaba 8 de cada 9 productos imposibles de borrar, porque el alta por foto
  les deja un conteo inicial.

  Como ahora todo se puede borrar y el borrado arrastra historial, la interfaz
  tiene una sola obligación: decir CUÁNTO se lleva antes de que alguien
  confirme, tanto en una fila como en una selección de treinta. Un borrado que
  no declara lo que arrastra es una trampa.

  ── POR QUÉ LA PREVISUALIZACIÓN USA <dialog> ───────────────────────────────

  El elemento nativo trae gratis y bien hechas las tres cosas que una ventana
  modal artesanal hace mal: atrapa el foco dentro, cierra con Escape, y el
  resto de la página queda inerte para un lector de pantalla. Escribir eso a
  mano son cien líneas y cinco defectos de accesibilidad.
*/

function Mensaje({ estado }: { estado: EstadoAccion }) {
  if (!estado.error && !estado.ok) return null;
  const esError = Boolean(estado.error);
  return (
    <p
      role={esError ? "alert" : "status"}
      className={`mt-2 rounded-md border px-3 py-2 text-sm font-medium text-gris-900 ${
        esError ? "border-acento" : "border-primario"
      }`}
    >
      {estado.error ?? estado.ok}
    </p>
  );
}

const claseConfirmacion =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

/* ─────────────────────────── Previsualización ─────────────────────────── */

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gris-200 p-3">
      <dt className="text-xs font-semibold tracking-wide text-gris-500 uppercase">{etiqueta}</dt>
      <dd className="mt-0.5 text-base font-semibold text-gris-900">{children}</dd>
    </div>
  );
}

function Previsualizacion({
  producto,
  alCerrar,
}: {
  producto: ProductoListado | null;
  alCerrar: () => void;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    if (producto && !d.open) d.showModal();
    if (!producto && d.open) d.close();
  }, [producto]);

  if (!producto) return null;

  const pres = PRESENTACION_ESTADO[producto.estado];
  const precio = procedenciaPrecio(producto.precio_confirmado_clp, producto.precio_estimado_clp);
  const vigente = producto.precio_vigente_clp === null ? null : Number(producto.precio_vigente_clp);

  return (
    <dialog
      ref={dialogo}
      /* Escape y el botón de cerrar del sistema pasan por acá. */
      onClose={alCerrar}
      /* Clic en el fondo: el objetivo del evento es el propio dialog solo
         cuando se hizo clic fuera del contenido. */
      onClick={(e) => {
        if (e.target === dialogo.current) alCerrar();
      }}
      aria-labelledby="titulo-previsualizacion"
      className="m-auto w-[min(48rem,92vw)] rounded-xl border border-gris-200 bg-blanco p-0 shadow-elevada backdrop:bg-negro/60"
    >
      <div className="flex items-start justify-between gap-4 border-b border-gris-200 p-4 sm:p-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
            {producto.categoria_nombre ?? "Sin categoría"}
          </p>
          <h2 id="titulo-previsualizacion" className="mt-0.5 text-xl font-bold text-gris-900">
            {producto.nombre}
          </h2>
          <p className="mt-0.5 font-mono text-sm font-semibold text-gris-700">{producto.sku}</p>
        </div>
        <button
          type="button"
          onClick={alCerrar}
          aria-label="Cerrar la previsualización"
          className="shrink-0 rounded-md border border-gris-300 px-3 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-gris-500"
        >
          Cerrar
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,15rem)_1fr]">
          {producto.foto_path ? (
            <figure className="rounded-lg border border-gris-200 p-2">
              {/*
                La foto se pide a /panel/foto/[id], que la firma en el momento.
                eslint-disable porque el optimizador de Next cachearía una URL
                que deja de servir en cinco minutos.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/panel/foto/${producto.id}`}
                alt={`Foto de ${producto.nombre}`}
                loading="lazy"
                className="mx-auto max-h-56 w-auto rounded"
              />
              {producto.ubicacion_en_foto ? (
                <figcaption className="mt-2 text-center text-xs text-gris-500">
                  En la foto: {producto.ubicacion_en_foto}
                </figcaption>
              ) : null}
            </figure>
          ) : (
            <p className="flex items-center justify-center rounded-lg border border-gris-200 p-6 text-sm text-gris-500">
              Sin foto
            </p>
          )}

          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
              >
                {pres.etiqueta}
              </span>
              <span className="text-sm text-gris-600">{pres.explica}</span>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <Dato etiqueta="Cantidad">
                {formateaNumero(producto.cantidad)}{" "}
                <span className="text-sm font-normal text-gris-500">{producto.unidad}</span>
              </Dato>
              <Dato etiqueta="Precio vigente">{precio.valor}</Dato>
              <Dato etiqueta="Valor en stock">
                {formateaPesos(vigente === null ? null : Number(producto.cantidad) * vigente)}
              </Dato>
              <Dato etiqueta="Movimientos">{producto.movimientos}</Dato>
            </dl>

            {/* La procedencia del precio va siempre, no solo cuando es
                estimado: es el único dato de esta ventana con el que alguien
                puede decidir una compra. */}
            <p className="text-sm text-gris-600">
              <span className="font-semibold text-gris-900">Precio: </span>
              {precio.origen}
              {producto.precio_estimado_clp !== null && producto.precio_confirmado_clp !== null ? (
                <> · el modelo había estimado {formateaPesos(producto.precio_estimado_clp)}</>
              ) : null}
            </p>

            {producto.ubicacion ? (
              <p className="text-sm text-gris-600">
                <span className="font-semibold text-gris-900">Ubicación: </span>
                {producto.ubicacion}
              </p>
            ) : null}
          </div>
        </div>

        {producto.descripcion ? (
          <p className="mt-4 max-w-prose text-sm text-gris-600">{producto.descripcion}</p>
        ) : null}

        {producto.notas ? (
          <div className="mt-3 flex overflow-hidden rounded-lg border border-gris-200">
            <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
            <p className="p-3 text-sm text-gris-600">{producto.notas}</p>
          </div>
        ) : null}

        <p className="mt-4 text-xs text-gris-500">
          Cargado el {formateaMomento(producto.created_at)} · última modificación{" "}
          {formateaMomento(producto.updated_at)}
        </p>
      </div>

      <div className="border-t border-gris-200 p-4 sm:p-5">
        <Link
          href={`/panel/productos/${producto.id}`}
          className="inline-flex items-center rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90"
        >
          Abrir la ficha para editar
        </Link>
      </div>
    </dialog>
  );
}

/* ──────────────────────── Acciones de una fila ────────────────────────── */

function AccionesFila({
  producto,
  puedeOperar,
  puedeBorrar,
}: {
  producto: ProductoListado;
  puedeOperar: boolean;
  puedeBorrar: boolean;
}) {
  const [estadoBorrado, accionBorrar, borrando] = useActionState<EstadoAccion, FormData>(
    eliminarProducto,
    {},
  );
  const [estadoCambio, accionCambiar, cambiando] = useActionState<EstadoAccion, FormData>(
    cambiarEstadoProducto,
    {},
  );
  const [confirmando, setConfirmando] = useState(false);

  const archivado = producto.estado === "archivado";

  return (
    <div className="mt-3 border-t border-gris-100 pt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold">
        <Link href={`/panel/productos/${producto.id}`} className="text-primario hover:underline">
          Ver y editar
        </Link>

        {puedeOperar ? (
          <form action={accionCambiar} className="contents">
            <input type="hidden" name="id" value={producto.id} />
            <input type="hidden" name="estado" value={archivado ? "borrador" : "archivado"} />
            <button
              type="submit"
              disabled={cambiando}
              className="text-gris-600 transition-colors hover:text-gris-900 disabled:opacity-60"
            >
              {cambiando ? "Guardando..." : archivado ? "Restaurar" : "Archivar"}
            </button>
          </form>
        ) : null}

        {puedeBorrar ? (
          <button
            type="button"
            onClick={() => setConfirmando((v) => !v)}
            aria-expanded={confirmando}
            className="text-acento transition-opacity hover:opacity-80"
          >
            {confirmando ? "Cancelar" : "Borrar"}
          </button>
        ) : null}
      </div>

      <Mensaje estado={estadoCambio} />

      {confirmando ? (
        <form action={accionBorrar} className="mt-3 rounded-lg border border-acento p-3">
          <input type="hidden" name="id" value={producto.id} />
          <input type="hidden" name="sku_esperado" value={producto.sku} />

          <p className="text-sm text-gris-700">
            Se borra el producto y su SKU, que no se reutiliza
            {producto.movimientos > 0 ? (
              <>
                , junto con sus{" "}
                <strong className="font-semibold text-gris-900">
                  {producto.movimientos}{" "}
                  {producto.movimientos === 1 ? "movimiento" : "movimientos"}
                </strong>
              </>
            ) : null}
            . La foto solo se borra si ningún otro producto la está usando. No
            hay forma de deshacerlo.
          </p>

          <label className="mt-2.5 block max-w-xs">
            <span className="text-sm font-semibold text-gris-800">
              Escribe <span className="font-mono font-bold">{producto.sku}</span> para confirmar
            </span>
            <input
              name="confirmacion"
              autoComplete="off"
              autoFocus
              placeholder={producto.sku}
              className={claseConfirmacion}
            />
          </label>

          <Mensaje estado={estadoBorrado} />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={borrando}
              className="rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-negro transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {borrando ? "Borrando..." : "Borrar definitivamente"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/* ─────────────────────── Barra de acciones masivas ────────────────────── */

function BarraMasiva({
  seleccionados,
  puedeOperar,
  puedeBorrar,
  alLimpiar,
  accionEstado,
  cambiando,
  accionBorrar,
  estadoBorrado,
  borrando,
}: {
  seleccionados: ProductoListado[];
  puedeOperar: boolean;
  puedeBorrar: boolean;
  alLimpiar: () => void;
  accionEstado: (datos: FormData) => void;
  cambiando: boolean;
  accionBorrar: (datos: FormData) => void;
  estadoBorrado: EstadoMasivo;
  borrando: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  /*
    LOS RESULTADOS NO SE MUESTRAN ACÁ. Viven arriba, en el listado, y la razón
    es que esta barra desaparece justo cuando hay algo que contar: al borrar,
    las filas se van de la lista, la selección queda vacía y este componente se
    desmonta llevándose el mensaje "7 productos borrados" antes de que nadie lo
    lea. Con los hooks arriba, el mensaje sobrevive a la barra.

    Por el mismo motivo no hace falta ningún efecto que limpie la selección:
    se calcula cruzando los marcados contra los productos que existen, así que
    lo borrado deja de estar seleccionado solo.
  */

  const n = seleccionados.length;
  /* Cuántos movimientos se van con la selección. Es el dato que la persona
     necesita antes de confirmar, y el que la base va a borrar en cascada. */
  const movimientos = seleccionados.reduce((t, p) => t + p.movimientos, 0);

  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-gris-300 bg-blanco/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-elevada">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p aria-live="polite" className="text-sm font-bold text-gris-900">
          {n} {n === 1 ? "seleccionado" : "seleccionados"}
        </p>

        <button
          type="button"
          onClick={alLimpiar}
          className="text-sm font-semibold text-gris-600 hover:text-gris-900"
        >
          Quitar la selección
        </button>

        <div className="ml-auto flex flex-wrap gap-2">
          {puedeOperar ? (
            <>
              <form action={accionEstado}>
                {seleccionados.map((p) => (
                  <input key={p.id} type="hidden" name="ids" value={p.id} />
                ))}
                <input type="hidden" name="estado" value="archivado" />
                <button
                  type="submit"
                  disabled={cambiando || borrando}
                  className="rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario disabled:opacity-60"
                >
                  {cambiando ? "Guardando..." : "Archivar"}
                </button>
              </form>

              <form action={accionEstado}>
                {seleccionados.map((p) => (
                  <input key={p.id} type="hidden" name="ids" value={p.id} />
                ))}
                <input type="hidden" name="estado" value="borrador" />
                <button
                  type="submit"
                  disabled={cambiando || borrando}
                  className="rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario disabled:opacity-60"
                >
                  Devolver a borrador
                </button>
              </form>
            </>
          ) : null}

          {puedeBorrar ? (
            <button
              type="button"
              onClick={() => setConfirmando((v) => !v)}
              aria-expanded={confirmando}
              disabled={n === 0}
              className="rounded-lg border border-acento px-4 py-2.5 text-sm font-semibold text-gris-900 transition-colors hover:bg-acento hover:text-negro disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gris-900"
            >
              {confirmando ? "Cancelar" : `Borrar (${n})`}
            </button>
          ) : null}
        </div>
      </div>

      {/* El arrastre se dice antes de apretar nada. Enterarse después de
          confirmar de que se fueron treinta movimientos es enterarse tarde. */}
      {puedeBorrar && movimientos > 0 ? (
        <p className="mt-2 text-sm text-gris-600">
          Borrarlos se lleva también {movimientos}{" "}
          {movimientos === 1 ? "movimiento" : "movimientos"} de historial. Si
          solo quieres sacarlos de circulación, usa Archivar.
        </p>
      ) : null}

      {confirmando && n > 0 ? (
        <form action={accionBorrar} className="mt-3 rounded-lg border border-acento p-3">
          {seleccionados.map((p) => (
            <input key={p.id} type="hidden" name="ids" value={p.id} />
          ))}

          <p className="text-sm font-bold text-gris-900">
            Se van a borrar {n} {n === 1 ? "producto" : "productos"}:
          </p>
          {/* Los SKU van a la vista. Confirmar una cantidad sin ver cuáles es
              confirmar a ciegas. */}
          <p className="mt-1 max-h-24 overflow-y-auto font-mono text-sm text-gris-700">
            {seleccionados.map((p) => p.sku).join(", ")}
          </p>
          <p className="mt-2 text-sm text-gris-600">
            Se van sus SKU, que no se reutilizan, y las fotos que no esté usando
            ningún otro producto. No hay forma de deshacerlo.
          </p>

          <label className="mt-2.5 block max-w-xs">
            <span className="text-sm font-semibold text-gris-800">
              Escribe <span className="font-mono font-bold">BORRAR</span> para confirmar
            </span>
            <input
              name="confirmacion"
              autoComplete="off"
              autoFocus
              placeholder="BORRAR"
              className={claseConfirmacion}
            />
          </label>

          <Mensaje estado={estadoBorrado} />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={borrando}
              className="rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-negro transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {borrando ? "Borrando..." : `Borrar ${n} definitivamente`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

/* ────────────────────────────── El listado ────────────────────────────── */

export function ListaInventario({
  productos,
  puedeOperar,
  puedeBorrar,
}: {
  productos: ProductoListado[];
  puedeOperar: boolean;
  puedeBorrar: boolean;
}) {
  const [marcados, setMarcados] = useState<string[]>([]);
  const [viendo, setViendo] = useState<ProductoListado | null>(null);

  /*
    LAS ACCIONES MASIVAS VIVEN ACÁ Y NO EN LA BARRA, aunque sea la barra la que
    tiene los botones. La barra solo existe mientras haya algo seleccionado, y
    al borrar las filas desaparecen de la lista y la selección queda vacía: la
    barra se desmonta llevándose el mensaje "7 productos borrados" antes de que
    nadie alcance a leerlo. Con los hooks acá, el resultado sobrevive.
  */
  const [estadoEstado, accionEstado, cambiando] = useActionState<EstadoMasivo, FormData>(
    cambiarEstadoProductos,
    {},
  );
  const [estadoBorrado, accionBorrar, borrando] = useActionState<EstadoMasivo, FormData>(
    eliminarProductos,
    {},
  );

  const puedeSeleccionar = puedeOperar || puedeBorrar;

  /*
    La selección se guarda como lista de identificadores y se cruza contra los
    productos en cada render. Dos cosas se resuelven solas con eso: guardar los
    objetos dejaría copias viejas que seguirían mostrando el estado anterior
    después de archivar, y un producto borrado deja de estar seleccionado sin
    que haya que limpiar nada a mano.
  */
  const seleccionados = useMemo(
    () => productos.filter((p) => marcados.includes(p.id)),
    [productos, marcados],
  );

  const alterna = (id: string) =>
    setMarcados((previos) =>
      previos.includes(id) ? previos.filter((x) => x !== id) : [...previos, id],
    );

  /* Se compara contra los seleccionados vivos, no contra los marcados: un id
     que quedó marcado y ya no existe no debe contar como selección. */
  const todos = seleccionados.length === productos.length && productos.length > 0;

  return (
    <div className="space-y-3">
      <Mensaje estado={estadoEstado} />
      <Mensaje estado={estadoBorrado} />
      {puedeSeleccionar ? (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold text-gris-700">
          <input
            type="checkbox"
            checked={todos}
            onChange={() => setMarcados(todos ? [] : productos.map((p) => p.id))}
            className="size-4 accent-primario"
          />
          Seleccionar los {productos.length} de esta página
        </label>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {productos.map((p) => {
          const pres = PRESENTACION_ESTADO[p.estado];
          const precio = procedenciaPrecio(p.precio_confirmado_clp, p.precio_estimado_clp);
          const marcado = marcados.includes(p.id);

          return (
            <li
              key={p.id}
              className={`flex overflow-hidden rounded-lg border ${
                marcado ? "border-primario" : "border-gris-200"
              }`}
            >
              <div className={`w-2 shrink-0 ${pres.barra}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 gap-3">
                    {puedeSeleccionar ? (
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => alterna(p.id)}
                        aria-label={`Seleccionar ${p.sku}, ${p.nombre}`}
                        className="mt-1 size-4 shrink-0 accent-primario"
                      />
                    ) : null}

                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
                        {p.categoria_nombre ?? "Sin categoría"}
                      </p>
                      <h2 className="text-lg font-bold text-gris-900">{p.nombre}</h2>
                      <p className="mt-0.5 font-mono text-sm font-semibold text-gris-700">
                        {p.sku}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {/* El ojo abre la ficha resumida sin salir del listado: al
                        revisar veinte borradores, entrar y volver veinte veces
                        pierde la posición de la lista cada vez. */}
                    <button
                      type="button"
                      onClick={() => setViendo(p)}
                      aria-label={`Previsualizar ${p.nombre}`}
                      title="Previsualizar"
                      className="rounded-md border border-gris-300 p-2 text-gris-700 transition-colors hover:border-primario hover:text-primario"
                    >
                      <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
                        <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7zm0 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
                      </svg>
                    </button>

                    {/* La insignia lleva la palabra, no solo el color. */}
                    <span
                      className={`rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
                    >
                      {pres.etiqueta}
                    </span>
                  </div>
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gris-600">
                  <div className="flex gap-1">
                    <dt className="font-semibold">Cantidad:</dt>
                    <dd>
                      {formateaNumero(p.cantidad)} {p.unidad}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt className="font-semibold">Precio:</dt>
                    <dd>{precio.valor}</dd>
                  </div>
                  {p.ubicacion ? (
                    <div className="flex gap-1">
                      <dt className="font-semibold">Ubicación:</dt>
                      <dd>{p.ubicacion}</dd>
                    </div>
                  ) : null}
                </dl>

                {precio.revisar ? (
                  <p className="mt-2 text-xs text-gris-500">{precio.origen}</p>
                ) : null}

                <AccionesFila
                  producto={p}
                  puedeOperar={puedeOperar}
                  puedeBorrar={puedeBorrar}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {seleccionados.length > 0 && puedeSeleccionar ? (
        <BarraMasiva
          seleccionados={seleccionados}
          puedeOperar={puedeOperar}
          puedeBorrar={puedeBorrar}
          alLimpiar={() => setMarcados([])}
          accionEstado={accionEstado}
          cambiando={cambiando}
          accionBorrar={accionBorrar}
          estadoBorrado={estadoBorrado}
          borrando={borrando}
        />
      ) : null}

      <Previsualizacion producto={viendo} alCerrar={() => setViendo(null)} />
    </div>
  );
}
