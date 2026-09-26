"use client";

import { useActionState, useState } from "react";
import {
  actualizarProducto,
  eliminarProducto,
  registrarMovimiento,
  type EstadoAccion,
} from "../../acciones";
import type { Categoria, ProductoConCategoria } from "@/lib/tipos";

/*
  Piezas interactivas de la ficha de un producto.

  Van juntas porque comparten el mismo patrón: un formulario con useActionState,
  que da el estado pendiente y el mensaje en línea sin recargar. En un
  formulario largo esa diferencia es la que separa corregir un dato de volver a
  tipear quince.
*/

const claseCampo =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

function Mensaje({ estado }: { estado: EstadoAccion }) {
  if (!estado.error && !estado.ok) return null;
  const esError = Boolean(estado.error);
  return (
    <p
      role={esError ? "alert" : "status"}
      className={`mt-3 rounded-md border px-3 py-2 text-sm font-medium text-gris-900 ${
        esError ? "border-acento" : "border-primario"
      }`}
    >
      {estado.error ?? estado.ok}
    </p>
  );
}

const ESTADOS = [
  { valor: "borrador", etiqueta: "Borrador — sin revisar" },
  { valor: "confirmado", etiqueta: "Confirmado — revisado por una persona" },
  { valor: "archivado", etiqueta: "Archivado — fuera de circulación" },
];

const UNIDADES = ["unidad", "caja", "par", "juego", "metro", "litro", "kilo", "rollo"];

export function EditarProducto({
  producto,
  categorias,
  puedeOperar,
}: {
  producto: ProductoConCategoria;
  categorias: Categoria[];
  puedeOperar: boolean;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(
    actualizarProducto,
    {},
  );

  return (
    <form action={accion} className="space-y-5">
      <input type="hidden" name="id" value={producto.id} />
      <fieldset disabled={!puedeOperar} className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-gris-800">
              Nombre<span className="text-gris-500"> *</span>
            </span>
            <input name="nombre" required defaultValue={producto.nombre} className={claseCampo} />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-gris-800">Descripción</span>
            <textarea
              name="descripcion"
              rows={3}
              defaultValue={producto.descripcion ?? ""}
              className={claseCampo}
            />
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Categoría</span>
            <select
              name="categoria_id"
              defaultValue={producto.categoria_id ?? ""}
              className={claseCampo}
            >
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {c.activo ? "" : " (inactiva)"}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gris-500">
              Obligatoria para poder confirmar el producto.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Unidad</span>
            <select name="unidad" defaultValue={producto.unidad} className={claseCampo}>
              {UNIDADES.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Precio</span>
            <input
              name="precio_confirmado_clp"
              inputMode="numeric"
              defaultValue={producto.precio_confirmado_clp ?? ""}
              placeholder={
                producto.precio_estimado_clp !== null
                  ? `Estimado: ${producto.precio_estimado_clp}`
                  : "Sin estimación"
              }
              className={claseCampo}
            />
            <span className="mt-1 block text-xs text-gris-500">
              En pesos, sin símbolo. Lo que escribas acá manda sobre la
              estimación del modelo, que se conserva aparte.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Ubicación</span>
            <input
              name="ubicacion"
              defaultValue={producto.ubicacion ?? ""}
              placeholder="Bodega 2, estante C"
              className={claseCampo}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-gris-800">Estado</span>
            <select name="estado" defaultValue={producto.estado} className={claseCampo}>
              {ESTADOS.map((e) => (
                <option key={e.valor} value={e.valor}>
                  {e.etiqueta}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-gris-800">Notas</span>
            <textarea
              name="notas"
              rows={2}
              defaultValue={producto.notas ?? ""}
              className={claseCampo}
            />
          </label>
        </div>

        <p className="text-sm text-gris-500">
          La cantidad no se edita acá: se cambia registrando un movimiento, para
          que el total siempre sea la suma de su historial.
        </p>

        <Mensaje estado={estado} />

        {puedeOperar ? (
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pendiente ? "Guardando..." : "Guardar cambios"}
          </button>
        ) : (
          <p className="text-sm text-gris-600">
            Tu rol es de solo lectura, así que los campos están bloqueados.
          </p>
        )}
      </fieldset>
    </form>
  );
}

const TIPOS = [
  { valor: "ingreso", etiqueta: "Ingreso", ayuda: "Llegó mercadería. Suma al stock." },
  { valor: "salida", etiqueta: "Salida", ayuda: "Salió mercadería. Resta del stock." },
  {
    valor: "ajuste",
    etiqueta: "Ajuste",
    ayuda: "Corrección de inventario. Puede sumar o restar; escribe el signo.",
  },
];

export function RegistrarMovimiento({ productoId }: { productoId: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(
    registrarMovimiento,
    {},
  );
  const [tipo, setTipo] = useState("ingreso");

  const ayuda = TIPOS.find((t) => t.valor === tipo)?.ayuda ?? "";

  return (
    <form action={accion} className="rounded-lg border border-gris-200 p-4">
      <input type="hidden" name="producto_id" value={productoId} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Tipo</span>
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            className={claseCampo}
          >
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Cantidad</span>
          <input
            name="cantidad"
            inputMode="decimal"
            required
            placeholder={tipo === "ajuste" ? "-3 o 5" : "5"}
            className={claseCampo}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Motivo</span>
          <input name="motivo" placeholder="Orden de compra 1234" className={claseCampo} />
        </label>
      </div>

      <p className="mt-2 text-xs text-gris-500">{ayuda}</p>

      <Mensaje estado={estado} />

      <button
        type="submit"
        disabled={pendiente}
        className="mt-4 rounded-md bg-primario px-4 py-2.5 text-sm font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pendiente ? "Registrando..." : "Registrar movimiento"}
      </button>
    </form>
  );
}

/*
  Zona de borrado.

  ARCHIVAR VA PRIMERO, y no es cortesía. La llave de movimientos hacia
  productos es RESTRICT, así que un producto con historial no se borra por
  ningún camino: la base lo impide para no dejar un libro apuntando al vacío.
  Archivar lo saca de circulación y conserva todo.

  La confirmación pide escribir el SKU. Obliga a mirar cuál se está borrando, y
  en un listado largo apretar la fila equivocada es el error más fácil.
*/
export function ZonaBorrado({ id, sku, tieneMovimientos }: {
  id: string;
  sku: string;
  tieneMovimientos: boolean;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(eliminarProducto, {});
  const [abierto, setAbierto] = useState(false);

  if (tieneMovimientos) {
    return (
      <div className="flex overflow-hidden rounded-lg border border-gris-200">
        <div className="w-2 shrink-0 bg-gris-300" aria-hidden="true" />
        <div className="p-4">
          <h2 className="text-sm font-bold text-gris-900">Este producto no se puede borrar</h2>
          <p className="mt-1.5 max-w-prose text-sm text-gris-600">
            Tiene movimientos registrados y la base lo impide, para no perder el
            historial. Si salió del inventario, cámbialo arriba a{" "}
            <span className="font-semibold">Archivado</span>: deja de contarse en
            las unidades y en la valorización, y conserva su libro.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex overflow-hidden rounded-lg border border-gris-200">
      <div className="w-2 shrink-0 bg-acento" aria-hidden="true" />
      <div className="min-w-0 flex-1 p-4">
        <h2 className="text-sm font-bold text-gris-900">Borrar este producto</h2>
        <p className="mt-1.5 max-w-prose text-sm text-gris-600">
          No tiene movimientos, así que se puede borrar. Se van con él su foto y
          su SKU, que no se reutiliza. No hay forma de deshacerlo desde aquí.
        </p>

        {!abierto ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="mt-3 rounded-md border border-acento px-4 py-2.5 text-sm font-semibold text-gris-900 transition-colors hover:bg-acento hover:text-negro"
          >
            Quiero borrarlo
          </button>
        ) : (
          <form action={accion} className="mt-3">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="sku_esperado" value={sku} />

            <label className="block max-w-sm">
              <span className="text-sm font-semibold text-gris-800">
                Escribe <span className="font-mono font-bold">{sku}</span> para confirmar
              </span>
              <input
                name="confirmacion"
                autoComplete="off"
                autoFocus
                className={claseCampo}
                placeholder={sku}
              />
            </label>

            <Mensaje estado={estado} />

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
        )}
      </div>
    </div>
  );
}
