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

const CONSERVACION = [
  { valor: "", etiqueta: "Sin indicar" },
  { valor: "nuevo", etiqueta: "Nuevo — sin uso" },
  { valor: "como_nuevo", etiqueta: "Como nuevo — usado, sin marcas" },
  { valor: "buen_estado", etiqueta: "Buen estado — marcas de uso normales" },
  { valor: "usado", etiqueta: "Usado — desgaste visible, funciona" },
  { valor: "para_restaurar", etiqueta: "Para restaurar — necesita trabajo" },
];

/*
  Atributos de menaje, antigüedades, muñecas y colección.

  VAN PLEGADOS Y NO MEZCLADOS CON EL RESTO. Son siete campos que quien vende
  herramientas no va a llenar nunca, y siete campos vacíos en medio del
  formulario hacen que el que sí importa se pierda. Se abren solos cuando el
  producto ya tiene alguno cargado: si hay un dato adentro, esconderlo sería
  esconder información que alguien se tomó el trabajo de escribir.

  Ninguno es obligatorio, en pantalla ni en la base. De una pieza se sabe lo
  que se sabe, y un campo obligatorio acá produce "años 1900" inventados que
  después nadie distingue de los ciertos.
*/
function AtributosRubro({ producto }: { producto: ProductoConCategoria }) {
  const hayDatos = Boolean(
    producto.estado_conservacion ||
      producto.epoca ||
      producto.anio_aproximado ||
      producto.material ||
      producto.alto_cm ||
      producto.ancho_cm ||
      producto.profundidad_cm,
  );

  return (
    <details open={hayDatos} className="rounded-lg border border-gris-200 p-4">
      <summary className="cursor-pointer text-sm font-bold tracking-widest text-gris-500 uppercase">
        Atributos de la pieza
      </summary>

      <p className="mt-2 max-w-prose text-sm text-gris-600">
        Para menaje, antigüedades, muñecas y colección. Todos opcionales: deja
        vacío lo que no sepas en vez de aproximarlo.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Estado de conservación</span>
          <select
            name="estado_conservacion"
            defaultValue={producto.estado_conservacion ?? ""}
            className={claseCampo}
          >
            {CONSERVACION.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Material</span>
          <input
            name="material"
            defaultValue={producto.material ?? ""}
            placeholder="Porcelana, roble, bronce"
            className={claseCampo}
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Época</span>
          <input
            name="epoca"
            defaultValue={producto.epoca ?? ""}
            placeholder="Años 50"
            className={claseCampo}
          />
          <span className="mt-1 block text-xs text-gris-500">
            Texto libre. De una pieza se sabe la década mucho más seguido que el
            año exacto.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Año aproximado</span>
          <input
            name="anio_aproximado"
            inputMode="numeric"
            defaultValue={producto.anio_aproximado ?? ""}
            placeholder="1954"
            className={claseCampo}
          />
          <span className="mt-1 block text-xs text-gris-500">
            Solo si lo sabes. Entre 1500 y 2100.
          </span>
        </label>

        {/* Las tres medidas en una fila: se toman juntas, con la huincha en la
            mano, y separarlas obliga a soltar la pieza entre campo y campo. */}
        <div className="grid grid-cols-3 gap-3 sm:col-span-2">
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Alto (cm)</span>
            <input
              name="alto_cm"
              inputMode="decimal"
              defaultValue={producto.alto_cm ?? ""}
              className={claseCampo}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Ancho (cm)</span>
            <input
              name="ancho_cm"
              inputMode="decimal"
              defaultValue={producto.ancho_cm ?? ""}
              className={claseCampo}
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Fondo (cm)</span>
            <input
              name="profundidad_cm"
              inputMode="decimal"
              defaultValue={producto.profundidad_cm ?? ""}
              className={claseCampo}
            />
          </label>
        </div>
      </div>
    </details>
  );
}

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

          {/*
            DOS CAMPOS Y NO UNO. La tipología es lo que se filtra y lo que
            decide si una venta se puede retirar en tienda o hay que ir a
            buscarla; el detalle en texto libre es lo que permite encontrarla
            dentro del lugar. Con un solo campo de texto, "bodega" y "Bodega 2"
            son dos valores distintos y no se puede filtrar por ninguno.
          */}
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Dónde está</span>
            <select
              name="ubicacion_tipo"
              defaultValue={producto.ubicacion_tipo ?? ""}
              className={claseCampo}
            >
              <option value="">Sin indicar</option>
              <option value="tienda">En tienda</option>
              <option value="bodega">En bodega</option>
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Detalle del lugar</span>
            <input
              name="ubicacion"
              defaultValue={producto.ubicacion ?? ""}
              placeholder="Estante C, vitrina del fondo"
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

        <AtributosRubro producto={producto} />

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
