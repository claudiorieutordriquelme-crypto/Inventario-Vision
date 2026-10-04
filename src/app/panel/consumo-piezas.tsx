"use client";

import { useActionState, useState } from "react";
import { actualizarPresupuesto, type EstadoPresupuesto } from "./consumo-acciones";

/*
  El formulario del tope mensual. Aparte del recuadro porque el recuadro lo ve
  el operador y esto solo el administrador, y porque useActionState obliga a
  componente de cliente: el recuadro en sí no necesita JavaScript.

  Va cerrado por defecto. Es un dato que se fija una vez cada varios meses, y
  un campo editable siempre abierto en la pantalla de inicio es un campo que
  alguien cambia sin querer.
*/
export function EditarPresupuesto({ actual }: { actual: number }) {
  const [estado, accion, pendiente] = useActionState<EstadoPresupuesto, FormData>(
    actualizarPresupuesto,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-semibold text-primario hover:underline"
      >
        Cambiar tope
      </button>
    );
  }

  return (
    <form action={accion} className="mt-3 w-full border-t border-gris-100 pt-3">
      <label className="block max-w-xs">
        <span className="text-sm font-semibold text-gris-800">Tope mensual en dólares</span>
        <input
          name="monto_usd_mensual"
          inputMode="decimal"
          defaultValue={actual}
          autoFocus
          className="mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
        />
        <span className="mt-1 block text-xs text-gris-500">
          Es el denominador del porcentaje. No limita el gasto ni apaga nada:
          solo define contra qué se mide.
        </span>
      </label>

      {estado.error || estado.ok ? (
        <p
          role={estado.error ? "alert" : "status"}
          className={`mt-3 rounded-md border px-3 py-2 text-sm font-medium text-gris-900 ${
            estado.error ? "border-acento" : "border-primario"
          }`}
        >
          {estado.error ?? estado.ok}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-blanco disabled:opacity-60"
        >
          {pendiente ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800"
        >
          Cerrar
        </button>
      </div>
    </form>
  );
}
