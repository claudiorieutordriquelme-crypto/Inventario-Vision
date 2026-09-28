"use client";

import { useActionState, useState } from "react";
import { eliminarProducto, type EstadoAccion } from "./acciones";

/*
  Borrar un producto. Un solo componente para todas las pantallas.

  POR QUÉ EXISTE ESTE ARCHIVO. El borrado se pedía desde el listado y desde la
  ficha, y faltaba justo donde más se necesita: la pantalla de revisión, a la
  que se llega después de cargar una foto. Ahí aparecen ocho productos de
  golpe, dos de ellos mal identificados, y no había forma de descartarlos sin
  entrar uno por uno a su ficha.

  Con la lógica en un solo lugar, agregar el borrado a una pantalla nueva es
  una línea, y la confirmación no se puede desincronizar entre pantallas.

  SE SIGUE PIDIENDO EL SKU ESCRITO. En una ficha podría parecer ceremonia; en
  una lista de ocho productos recién creados es lo único que separa descartar
  el que sobra de descartar el de al lado. La misma operación pide lo mismo en
  todas partes, a propósito.

  EL BOTÓN ES UN BOTÓN Y NO UN ENLACE DE TEXTO. La versión anterior era una
  palabra suelta entre otras dos, y en un teléfono no se leía como una acción
  disponible. Un borrado que nadie encuentra es un borrado que no existe.
*/

export function BorrarProducto({
  id,
  sku,
  movimientos,
}: {
  id: string;
  sku: string;
  /** Cuántos movimientos se van en cascada. Se declara antes de confirmar. */
  movimientos: number;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(
    eliminarProducto,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gris-300 px-3 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-acento hover:text-acento"
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-current" aria-hidden="true">
          <path d="M9 3h6l1 2h4v2H4V5h4l1-2zM6 9h12l-1 11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L6 9zm3 2v9h2v-9H9zm4 0v9h2v-9h-2z" />
        </svg>
        {abierto ? "Cancelar" : "Borrar"}
      </button>

      {abierto ? (
        <form action={accion} className="mt-3 w-full rounded-lg border border-acento p-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="sku_esperado" value={sku} />

          <p className="text-sm text-gris-700">
            Se borra el producto y su código SKU, que no se reutiliza
            {movimientos > 0 ? (
              <>
                , junto con sus{" "}
                <strong className="font-semibold text-gris-900">
                  {movimientos} {movimientos === 1 ? "movimiento" : "movimientos"}
                </strong>
              </>
            ) : null}
            . La fotografía se borra solo si ningún otro producto la está
            usando. No hay forma de deshacerlo.
          </p>

          <label className="mt-2.5 block max-w-xs">
            <span className="text-sm font-semibold text-gris-800">
              Escribe <span className="font-mono font-bold">{sku}</span> para confirmar
            </span>
            <input
              name="confirmacion"
              autoComplete="off"
              autoFocus
              placeholder={sku}
              className="mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
            />
          </label>

          {estado.error ? (
            <p
              role="alert"
              className="mt-2 rounded-md border border-acento px-3 py-2 text-sm font-medium text-gris-900"
            >
              {estado.error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={pendiente}
              className="rounded-md bg-acento px-4 py-2.5 text-sm font-semibold text-negro transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pendiente ? "Borrando..." : "Borrar definitivamente"}
            </button>
            <button
              type="button"
              onClick={() => setAbierto(false)}
              className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
