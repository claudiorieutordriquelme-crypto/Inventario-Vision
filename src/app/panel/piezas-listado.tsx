"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cambiarEstadoProducto, eliminarProducto, type EstadoAccion } from "./acciones";
import type { ProductoListado } from "@/lib/tipos";

/*
  Acciones sobre una fila del inventario.

  LA REGLA QUE MANDA ACÁ, Y QUE NO SE PUEDE ESQUIVAR DESDE LA INTERFAZ: la
  llave de movimientos_inventario hacia productos es RESTRICT. Un producto con
  aunque sea un movimiento NO se borra, la base lo rechaza. Y como el alta por
  foto deja un conteo inicial, la mayoría de los productos cae en ese caso.

  De ahí el diseño: la fila no ofrece "Borrar" cuando la base lo va a rechazar.
  Ofrece "Archivar", que es la salida real. Mostrar un botón que falla en el
  80% de los casos y explicar el error después es peor que no mostrarlo, porque
  la persona aprende que la aplicación se equivoca en vez de aprender cómo
  funciona el inventario.

  EL BORRADO PIDE ESCRIBIR EL SKU. En una ficha eso podría parecer ceremonia;
  en un listado es lo único que separa borrar lo que querías de borrar la fila
  de al lado. Se conserva igual que en la ficha, a propósito: la misma
  operación pide lo mismo en los dos lugares.
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

export function AccionesFila({
  producto,
  puedeOperar,
  puedeAdministrar,
}: {
  producto: ProductoListado;
  puedeOperar: boolean;
  puedeAdministrar: boolean;
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
  const borrable = producto.movimientos === 0;

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

        {puedeAdministrar ? (
          borrable ? (
            <button
              type="button"
              onClick={() => setConfirmando((v) => !v)}
              aria-expanded={confirmando}
              className="text-acento transition-opacity hover:opacity-80"
            >
              {confirmando ? "Cancelar" : "Borrar"}
            </button>
          ) : (
            /* No es un botón deshabilitado: un control apagado sin explicación
               se lee como una falla de la aplicación. Es una frase que dice por
               qué, y qué hacer en su lugar. */
            <span className="font-normal text-gris-500">
              No se puede borrar: tiene {producto.movimientos}{" "}
              {producto.movimientos === 1 ? "movimiento" : "movimientos"}. Archívalo.
            </span>
          )
        ) : null}
      </div>

      <Mensaje estado={estadoCambio} />

      {confirmando && borrable ? (
        <form action={accionBorrar} className="mt-3 rounded-lg border border-acento p-3">
          <input type="hidden" name="id" value={producto.id} />
          <input type="hidden" name="sku_esperado" value={producto.sku} />

          <p className="text-sm text-gris-700">
            Se borra el producto, su foto y su SKU, que no se reutiliza. No hay
            forma de deshacerlo.
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
              className="mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
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
