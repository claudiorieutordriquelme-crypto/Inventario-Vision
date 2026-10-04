"use client";

import { useActionState, useState } from "react";
import {
  actualizarVenta,
  agregarAlCarrito,
  anularVenta,
  cambiarCantidad,
  confirmarVenta,
  quitarDelCarrito,
  type EstadoVentaAccion,
} from "../acciones";
import { ETIQUETA_PAGO, formateaPesos } from "@/lib/formato";
import type {
  Cliente,
  DireccionCliente,
  MedioPago,
  VentaConDetalle,
  VentaItem,
} from "@/lib/tipos";
import type { ResultadoBusqueda } from "@/lib/datos/comercial";

const claseCampo =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

function Mensaje({ estado }: { estado: EstadoVentaAccion }) {
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

/*
  Resultados de la búsqueda, cada uno con su botón de agregar.

  EL STOCK VA EN CADA FILA, y no es decoración: es lo que decide si se puede
  vender. Un resultado sin stock se muestra igual pero sin botón, porque saber
  que el producto existe y está agotado es información útil; ofrecer un botón
  que la base va a rechazar, no.
*/
export function Resultados({
  ventaId,
  resultados,
  buscado,
}: {
  ventaId: string;
  resultados: ResultadoBusqueda[];
  buscado: boolean;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaAccion, FormData>(
    agregarAlCarrito,
    {},
  );

  return (
    <div>
      <Mensaje estado={estado} />

      {resultados.length === 0 ? (
        <p className="mt-3 rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
          {buscado
            ? "Nada coincide con esa búsqueda. La búsqueda tolera errores de tipeo, así que probablemente el producto no está cargado."
            : "Busca por nombre, SKU o categoría para empezar a cargar el carrito."}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-gris-100 rounded-lg border border-gris-200">
          {resultados.map((r) => {
            const sinStock = Number(r.cantidad) <= 0;
            const sinPrecio = r.precio_vigente_clp === null;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-gris-900">
                    {r.nombre}
                    <span className="font-mono text-xs font-semibold text-gris-600">{r.sku}</span>
                    {r.parecido !== null && r.parecido < 0.99 ? (
                      <span className="text-xs font-semibold text-gris-500">
                        {Math.round(r.parecido * 100)}% de parecido
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-sm text-gris-600">
                    {r.categoria_nombre ?? "Sin categoría"} ·{" "}
                    {r.ubicacion_tipo === "tienda"
                      ? "En tienda"
                      : r.ubicacion_tipo === "bodega"
                        ? "En bodega"
                        : "Sin ubicación"}{" "}
                    · {sinStock ? "Sin stock" : `${r.cantidad} disponibles`}
                  </p>
                </div>

                <p className="shrink-0 text-base font-bold text-gris-900">
                  {formateaPesos(r.precio_vigente_clp)}
                </p>

                {sinStock || sinPrecio ? (
                  /* Un botón que siempre va a fallar no se muestra: la pantalla
                     explica la salida real en vez de ofrecerla. */
                  <p className="shrink-0 text-xs font-semibold text-gris-500">
                    {sinStock ? "Agotado" : "Ponle precio en su ficha"}
                  </p>
                ) : (
                  <form action={accion} className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="venta_id" value={ventaId} />
                    <input type="hidden" name="producto_id" value={r.id} />
                    <input
                      name="cantidad"
                      inputMode="decimal"
                      defaultValue="1"
                      aria-label={`Cantidad de ${r.nombre}`}
                      className="w-16 rounded-md border border-gris-300 px-2 py-1.5 text-center text-sm"
                    />
                    <button
                      type="submit"
                      disabled={pendiente}
                      className="rounded-md bg-primario px-3 py-1.5 text-sm font-semibold text-blanco disabled:opacity-60"
                    >
                      Agregar
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Carrito({ venta, editable }: { venta: VentaConDetalle; editable: boolean }) {
  const [estadoCantidad, accionCantidad] = useActionState<EstadoVentaAccion, FormData>(
    cambiarCantidad,
    {},
  );
  const [estadoQuitar, accionQuitar] = useActionState<EstadoVentaAccion, FormData>(
    quitarDelCarrito,
    {},
  );

  if (venta.items.length === 0) {
    return (
      <p className="rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
        El carrito está vacío.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-gris-100 rounded-lg border border-gris-200">
        {venta.items.map((i: VentaItem) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gris-900">{i.nombre}</p>
              <p className="mt-0.5 font-mono text-xs text-gris-600">{i.sku}</p>
              {/* El precio unitario se muestra aparte del subtotal: es el que
                  quedó congelado al agregarlo, y si alguien cambia el precio
                  del producto mañana, este no se mueve. */}
              <p className="text-xs text-gris-500">
                {formateaPesos(i.precio_unitario_clp)} por unidad
              </p>
            </div>

            {editable ? (
              <form action={accionCantidad} className="flex shrink-0 items-center gap-2">
                <input type="hidden" name="item_id" value={i.id} />
                <input type="hidden" name="venta_id" value={venta.id} />
                <input
                  name="cantidad"
                  inputMode="decimal"
                  defaultValue={String(i.cantidad)}
                  aria-label={`Cantidad de ${i.nombre}`}
                  className="w-16 rounded-md border border-gris-300 px-2 py-1.5 text-center text-sm"
                />
                <button
                  type="submit"
                  className="text-sm font-semibold text-primario hover:underline"
                >
                  Cambiar
                </button>
              </form>
            ) : (
              <p className="shrink-0 text-sm text-gris-700">{i.cantidad} u.</p>
            )}

            <p className="w-28 shrink-0 text-right text-base font-bold text-gris-900">
              {formateaPesos(i.subtotal_clp)}
            </p>

            {editable ? (
              <form action={accionQuitar} className="shrink-0">
                <input type="hidden" name="item_id" value={i.id} />
                <input type="hidden" name="venta_id" value={venta.id} />
                <button
                  type="submit"
                  className="text-sm font-semibold text-gris-600 hover:text-acento"
                >
                  Quitar
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>

      <Mensaje estado={estadoCantidad} />
      <Mensaje estado={estadoQuitar} />

      <p className="mt-3 flex items-baseline justify-between gap-4 border-t border-gris-200 pt-3">
        <span className="text-sm font-bold tracking-widest text-gris-500 uppercase">Total</span>
        <span className="text-3xl font-bold text-gris-900">{formateaPesos(venta.total_clp)}</span>
      </p>
    </div>
  );
}

/*
  Canal, entrega y cliente.

  EL CLIENTE SE PIDE SOLO CUANDO HAY DESPACHO. En retiro en tienda es opcional
  a propósito: obligarlo haría que el vendedor invente un nombre para poder
  cobrarle a alguien que pasó por el mostrador.
*/
export function DatosVenta({
  venta,
  clientes,
  direcciones,
}: {
  venta: VentaConDetalle;
  clientes: Cliente[];
  direcciones: DireccionCliente[];
}) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaAccion, FormData>(
    actualizarVenta,
    {},
  );
  const [entrega, setEntrega] = useState(venta.tipo_entrega);
  const [clienteId, setClienteId] = useState(venta.cliente_id ?? "");

  const suyas = direcciones.filter((d) => d.cliente_id === clienteId && d.activa);

  return (
    <form action={accion} className="rounded-lg border border-gris-200 p-4">
      <input type="hidden" name="venta_id" value={venta.id} />
      <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">
        Datos de la venta
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Canal</span>
          <select name="canal" defaultValue={venta.canal} className={claseCampo}>
            <option value="tienda">Tienda</option>
            <option value="live">Venta live</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Entrega</span>
          <select
            name="tipo_entrega"
            value={entrega}
            onChange={(e) => setEntrega(e.target.value as typeof entrega)}
            className={claseCampo}
          >
            <option value="retiro_tienda">Retiro en tienda</option>
            <option value="despacho">Despacho</option>
          </select>
          {entrega === "despacho" ? (
            <span className="mt-1 block text-xs text-gris-500">
              Al confirmar se crea solo el despacho con su primera caja, y aparece
              en Delivery.
            </span>
          ) : null}
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">
            Cliente
            {entrega === "despacho" ? <span className="text-gris-500"> *</span> : null}
          </span>
          <select
            name="cliente_id"
            value={clienteId}
            onChange={(e) => setClienteId(e.target.value)}
            className={claseCampo}
          >
            <option value="">Sin cliente</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">
            Dirección
            {entrega === "despacho" ? <span className="text-gris-500"> *</span> : null}
          </span>
          <select
            name="direccion_id"
            defaultValue={venta.direccion_id ?? ""}
            disabled={!clienteId}
            className={claseCampo}
          >
            <option value="">Sin dirección</option>
            {suyas.map((d) => (
              <option key={d.id} value={d.id}>
                {d.etiqueta ? `${d.etiqueta}: ` : ""}
                {d.calle}
                {d.comuna ? `, ${d.comuna}` : ""}
              </option>
            ))}
          </select>
          {entrega === "despacho" && clienteId && suyas.length === 0 ? (
            <span className="mt-1 block text-xs text-gris-600">
              Este cliente no tiene direcciones activas. Agrégale una en su ficha
              antes de confirmar.
            </span>
          ) : null}
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-gris-800">Notas</span>
          <input name="notas" defaultValue={venta.notas ?? ""} className={claseCampo} />
        </label>
      </div>

      <Mensaje estado={estado} />

      <button
        type="submit"
        disabled={pendiente}
        className="mt-4 rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario disabled:opacity-60"
      >
        {pendiente ? "Guardando..." : "Guardar datos"}
      </button>
    </form>
  );
}

const PAGOS: MedioPago[] = ["efectivo", "debito", "credito", "transferencia", "otro"];

export function Cobrar({ venta }: { venta: VentaConDetalle }) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaAccion, FormData>(
    confirmarVenta,
    {},
  );
  const [comprobante, setComprobante] = useState(venta.comprobante);

  const faltaDestino =
    venta.tipo_entrega === "despacho" && (!venta.cliente_id || !venta.direccion_id);

  return (
    <form action={accion} className="rounded-lg border-2 border-primario p-4">
      <input type="hidden" name="venta_id" value={venta.id} />
      <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">Cobrar</h2>

      <p className="mt-2 text-sm text-gris-600">
        Al confirmar, el stock sale del inventario con un movimiento por cada
        artículo. Esto no se deshace editando: se anula.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">
            Con qué pagó<span className="text-gris-500"> *</span>
          </span>
          <select name="medio_pago" required defaultValue="" className={claseCampo}>
            <option value="" disabled>
              Elige
            </option>
            {PAGOS.map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PAGO[p]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Comprobante</span>
          <select
            name="comprobante"
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value as typeof comprobante)}
            className={claseCampo}
          >
            <option value="ninguno">Sin comprobante</option>
            <option value="boleta">Boleta</option>
            <option value="factura">Factura</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Número</span>
          <input
            name="numero_comprobante"
            disabled={comprobante === "ninguno"}
            placeholder={comprobante === "ninguno" ? "—" : "Folio del documento"}
            className={claseCampo}
          />
        </label>
      </div>

      {faltaDestino ? (
        <p className="mt-3 rounded-md border border-marca px-3 py-2 text-sm font-medium text-gris-900">
          Esta venta va con despacho y le falta cliente o dirección. Complétalos
          arriba antes de cobrar.
        </p>
      ) : null}

      <Mensaje estado={estado} />

      <button
        type="submit"
        disabled={pendiente || venta.items.length === 0 || faltaDestino}
        className="mt-4 w-full rounded-xl bg-primario px-5 py-4 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto"
      >
        {pendiente
          ? "Confirmando..."
          : `Cobrar ${formateaPesos(venta.total_clp)}`}
      </button>

      {venta.items.length === 0 ? (
        <p className="mt-3 text-sm text-gris-500">Agrega productos al carrito primero.</p>
      ) : null}
    </form>
  );
}

export function Anular({ venta }: { venta: VentaConDetalle }) {
  const [estado, accion, pendiente] = useActionState<EstadoVentaAccion, FormData>(
    anularVenta,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-sm font-semibold text-gris-600 transition-colors hover:text-acento"
      >
        Anular esta venta
      </button>
    );
  }

  return (
    <form action={accion} className="flex overflow-hidden rounded-lg border border-gris-200">
      <div className="w-2 shrink-0 bg-acento" aria-hidden="true" />
      <div className="min-w-0 flex-1 p-4">
        <input type="hidden" name="venta_id" value={venta.id} />
        <p className="text-sm font-bold text-gris-900">Anular {venta.folio}</p>
        <p className="mt-1.5 text-sm text-gris-600">
          El stock vuelve con un ajuste que compensa la salida. Las dos líneas
          quedan en el libro: la venta no se borra de la historia.
        </p>

        <label className="mt-3 block max-w-md">
          <span className="text-sm font-semibold text-gris-800">
            Motivo<span className="text-gris-500"> *</span>
          </span>
          <input name="motivo" required autoFocus className={claseCampo} />
        </label>

        <Mensaje estado={estado} />

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-md bg-acento px-4 py-2 text-sm font-semibold text-negro disabled:opacity-60"
          >
            {pendiente ? "Anulando..." : "Anular la venta"}
          </button>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  );
}
