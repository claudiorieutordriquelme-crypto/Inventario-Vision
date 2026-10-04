"use client";

import { useActionState, useState } from "react";
import {
  agregarCaja,
  avanzarDespacho,
  desembalar,
  embalar,
  quitarCaja,
  type EstadoDespachoAccion,
} from "../acciones";
import { FLUJO_DESPACHO, PRESENTACION_DESPACHO } from "@/lib/formato";
import type { CajaConContenido, DespachoConDetalle } from "@/lib/datos/comercial";
import type { EstadoDespacho } from "@/lib/tipos";

function Mensaje({ estado }: { estado: EstadoDespachoAccion }) {
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
  Avanzar el despacho.

  SOLO SE OFRECE EL PASO SIGUIENTE. Un menú con los cuatro estados invita a
  saltar de pendiente a entregado, y ahí se pierde cuándo se embaló y cuándo
  salió, que es lo primero que alguien pregunta cuando un pedido se extravía.
*/
export function Avanzar({ despacho }: { despacho: DespachoConDetalle }) {
  const [estado, accion, pendiente] = useActionState<EstadoDespachoAccion, FormData>(
    avanzarDespacho,
    {},
  );

  const i = FLUJO_DESPACHO.indexOf(despacho.estado);
  const siguiente: EstadoDespacho | null =
    i >= 0 && i < FLUJO_DESPACHO.length - 1 ? FLUJO_DESPACHO[i + 1] : null;

  if (!siguiente) {
    return (
      <p className="rounded-lg border border-gris-200 p-4 text-sm text-gris-600">
        {despacho.estado === "entregado"
          ? "Este despacho ya se entregó. Las ventas que lleva no se pueden anular."
          : "Este despacho está anulado y no avanza más."}
      </p>
    );
  }

  const pres = PRESENTACION_DESPACHO[siguiente];

  return (
    <form action={accion} className="rounded-lg border border-gris-200 p-4">
      <input type="hidden" name="despacho_id" value={despacho.id} />
      <input type="hidden" name="estado" value={siguiente} />

      <p className="text-sm text-gris-600">Siguiente paso: {pres.explica}</p>

      <Mensaje estado={estado} />

      <button
        type="submit"
        disabled={pendiente}
        className="mt-3 rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pendiente ? "Guardando..." : `Marcar como ${pres.etiqueta.toLowerCase()}`}
      </button>
    </form>
  );
}

/*
  Lo que falta meter en una caja.

  LA CUENTA ES POR ARTÍCULO Y POR UNIDAD, no por artículo a secas: tres tazas
  pueden ir dos en una caja y una en otra, y la lista tiene que mostrar que
  queda una suelta. Sin eso, alguien cierra el despacho creyendo que embaló
  todo.
*/
export function PorEmbalar({
  despacho,
  cajas,
  editable,
}: {
  despacho: DespachoConDetalle;
  cajas: CajaConContenido[];
  editable: boolean;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoDespachoAccion, FormData>(embalar, {});
  const [cajaElegida, setCajaElegida] = useState(cajas[0]?.id ?? "");

  const pendientes = despacho.pendientes.filter((p) => Number(p.cantidad) > Number(p.embalado));

  if (pendientes.length === 0) {
    return (
      <p className="rounded-lg border border-primario p-4 text-sm font-medium text-gris-900">
        Todo lo vendido está en alguna caja.
      </p>
    );
  }

  return (
    <div>
      <ul className="divide-y divide-gris-100 rounded-lg border border-gris-200">
        {pendientes.map((p) => {
          const falta = Number(p.cantidad) - Number(p.embalado);
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-gris-900">{p.nombre}</p>
                <p className="mt-0.5 text-xs text-gris-600">
                  <span className="font-mono">{p.sku}</span> · venta{" "}
                  <span className="font-mono">{p.folio}</span>
                </p>
                <p className="text-xs text-gris-500">
                  {Number(p.embalado) > 0
                    ? `${p.embalado} de ${p.cantidad} ya en cajas, faltan ${falta}`
                    : `${falta} por embalar`}
                </p>
              </div>

              {editable && cajas.length > 0 ? (
                <form action={accion} className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name="despacho_id" value={despacho.id} />
                  <input type="hidden" name="venta_item_id" value={p.id} />
                  <input type="hidden" name="caja_id" value={cajaElegida} />
                  <input
                    name="cantidad"
                    inputMode="decimal"
                    defaultValue={String(falta)}
                    aria-label={`Cuántas unidades de ${p.nombre} embalar`}
                    className="w-16 rounded-md border border-gris-300 px-2 py-1.5 text-center text-sm"
                  />
                  <button
                    type="submit"
                    disabled={pendiente || !cajaElegida}
                    className="rounded-md bg-primario px-3 py-1.5 text-sm font-semibold text-blanco disabled:opacity-60"
                  >
                    Embalar
                  </button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>

      {editable && cajas.length > 0 ? (
        <label className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gris-800">Meter en la</span>
          <select
            value={cajaElegida}
            onChange={(e) => setCajaElegida(e.target.value)}
            className="rounded-md border border-gris-300 px-3 py-2 text-sm"
          >
            {cajas.map((c) => (
              <option key={c.id} value={c.id}>
                Caja {c.numero}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <Mensaje estado={estado} />
    </div>
  );
}

export function Cajas({
  despacho,
  editable,
}: {
  despacho: DespachoConDetalle;
  editable: boolean;
}) {
  const [estadoAgregar, accionAgregar, agregando] = useActionState<EstadoDespachoAccion, FormData>(
    agregarCaja,
    {},
  );
  const [estadoQuitar, accionQuitar] = useActionState<EstadoDespachoAccion, FormData>(
    quitarCaja,
    {},
  );
  const [estadoSacar, accionSacar] = useActionState<EstadoDespachoAccion, FormData>(
    desembalar,
    {},
  );

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Cajas ({despacho.cajas.length})
        </h2>
        {editable ? (
          <form action={accionAgregar}>
            <input type="hidden" name="despacho_id" value={despacho.id} />
            <button
              type="submit"
              disabled={agregando}
              className="text-sm font-semibold text-primario hover:underline disabled:opacity-60"
            >
              {agregando ? "Agregando..." : "Agregar una caja"}
            </button>
          </form>
        ) : null}
      </div>

      <Mensaje estado={estadoAgregar} />
      <Mensaje estado={estadoQuitar} />
      <Mensaje estado={estadoSacar} />

      {despacho.cajas.length === 0 ? (
        <p className="mt-3 rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
          Este despacho no tiene cajas. Agrega una para empezar a embalar.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {despacho.cajas.map((caja) => (
            <li key={caja.id} className="rounded-lg border border-gris-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-gris-900">
                    Caja {caja.numero} de {despacho.cajas.length}
                  </h3>
                  <p className="mt-0.5 text-sm text-gris-600">
                    {caja.items.length === 0
                      ? "Vacía"
                      : `${caja.items.length} ${caja.items.length === 1 ? "artículo" : "artículos"}`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  {/* El enlace abre la etiqueta lista para imprimir, con el QR,
                      el cliente y el número de caja. */}
                  <a
                    href={`/panel/delivery/${despacho.id}/caja/${caja.id}/etiqueta`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-gris-300 px-3 py-1.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
                  >
                    Imprimir etiqueta
                  </a>

                  {editable && caja.items.length === 0 && despacho.cajas.length > 1 ? (
                    <form action={accionQuitar}>
                      <input type="hidden" name="caja_id" value={caja.id} />
                      <input type="hidden" name="despacho_id" value={despacho.id} />
                      <button
                        type="submit"
                        className="text-sm font-semibold text-gris-600 hover:text-acento"
                      >
                        Eliminar
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>

              {caja.items.length > 0 ? (
                <ul className="mt-3 divide-y divide-gris-100 border-t border-gris-100">
                  {caja.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm text-gris-900">{i.nombre}</p>
                        <p className="font-mono text-xs text-gris-600">
                          {i.sku} · {i.folio}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-gris-700">{i.cantidad} u.</p>
                      {editable ? (
                        <form action={accionSacar}>
                          <input type="hidden" name="caja_item_id" value={i.id} />
                          <input type="hidden" name="despacho_id" value={despacho.id} />
                          <button
                            type="submit"
                            className="text-sm font-semibold text-gris-600 hover:text-acento"
                          >
                            Sacar
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
