"use client";

import { useActionState, useState } from "react";
import {
  actualizarCliente,
  agregarDireccion,
  crearCliente,
  quitarDireccion,
  type EstadoCliente,
} from "./acciones";
import type { ClienteConDirecciones, DireccionCliente } from "@/lib/tipos";

const claseCampo =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

function Mensaje({ estado }: { estado: EstadoCliente }) {
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
  Alta de cliente, con su primera dirección en el mismo formulario.

  LA DIRECCIÓN VA ACÁ Y NO EN UNA SEGUNDA PANTALLA. Un cliente se crea casi
  siempre en medio de una venta, con la persona esperando: si la dirección
  queda para después, el cliente que se creó apurado no la va a tener nunca, y
  la venta con despacho no se va a poder confirmar.
*/
export function CrearCliente() {
  const [estado, accion, pendiente] = useActionState<EstadoCliente, FormData>(crearCliente, {});
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
      >
        Nuevo cliente
      </button>
    );
  }

  return (
    <form action={accion} className="w-full rounded-lg border border-gris-200 p-4">
      <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">
        Nuevo cliente
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-3">
          <span className="text-sm font-semibold text-gris-800">
            Nombre<span className="text-gris-500"> *</span>
          </span>
          <input name="nombre" required autoFocus className={claseCampo} />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Teléfono</span>
          <input name="telefono" inputMode="tel" placeholder="+56 9 ..." className={claseCampo} />
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-gris-800">Correo</span>
          <input name="email" type="email" className={claseCampo} />
        </label>
      </div>

      <fieldset className="mt-4 rounded-lg border border-gris-200 p-4">
        <legend className="px-1 text-sm font-semibold text-gris-800">
          Dirección de despacho
        </legend>
        <p className="text-sm text-gris-600">
          Opcional ahora, obligatoria para confirmar una venta con despacho.
        </p>

        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Etiqueta</span>
            <input name="etiqueta" placeholder="Casa, oficina" className={claseCampo} />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-gris-800">Calle y número</span>
            <input name="calle" className={claseCampo} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Comuna</span>
            <input name="comuna" className={claseCampo} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Ciudad</span>
            <input name="ciudad" className={claseCampo} />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-gris-800">Referencia</span>
            <input name="referencia" placeholder="Depto 402, reja negra" className={claseCampo} />
          </label>
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-gris-800">Notas</span>
        <textarea name="notas" rows={2} className={claseCampo} />
      </label>

      <Mensaje estado={estado} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-md bg-primario px-4 py-2.5 text-sm font-semibold text-blanco disabled:opacity-60"
        >
          {pendiente ? "Creando..." : "Crear cliente"}
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
  );
}

export function EditarCliente({ cliente }: { cliente: ClienteConDirecciones }) {
  const [estado, accion, pendiente] = useActionState<EstadoCliente, FormData>(
    actualizarCliente,
    {},
  );

  return (
    <form action={accion} className="rounded-lg border border-gris-200 p-4">
      <input type="hidden" name="id" value={cliente.id} />
      <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">Datos</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-gris-800">Nombre</span>
          <input name="nombre" required defaultValue={cliente.nombre} className={claseCampo} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Teléfono</span>
          <input
            name="telefono"
            inputMode="tel"
            defaultValue={cliente.telefono ?? ""}
            className={claseCampo}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Correo</span>
          <input
            name="email"
            type="email"
            defaultValue={cliente.email ?? ""}
            className={claseCampo}
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Estado</span>
          <select name="activo" defaultValue={cliente.activo ? "1" : "0"} className={claseCampo}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
          <span className="mt-1 block text-xs text-gris-500">
            Inactivo deja de ofrecerse al vender y conserva todo su historial.
          </span>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Notas</span>
          <input name="notas" defaultValue={cliente.notas ?? ""} className={claseCampo} />
        </label>
      </div>

      <Mensaje estado={estado} />

      <button
        type="submit"
        disabled={pendiente}
        className="mt-4 rounded-md bg-primario px-4 py-2.5 text-sm font-semibold text-blanco disabled:opacity-60"
      >
        {pendiente ? "Guardando..." : "Guardar"}
      </button>
    </form>
  );
}

export function Direcciones({
  clienteId,
  direcciones,
}: {
  clienteId: string;
  direcciones: DireccionCliente[];
}) {
  const [estadoAgregar, accionAgregar, agregando] = useActionState<EstadoCliente, FormData>(
    agregarDireccion,
    {},
  );
  const [estadoQuitar, accionQuitar] = useActionState<EstadoCliente, FormData>(
    quitarDireccion,
    {},
  );
  const [abierto, setAbierto] = useState(false);

  return (
    <section className="rounded-lg border border-gris-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">Direcciones</h2>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="text-sm font-semibold text-primario hover:underline"
        >
          {abierto ? "Cerrar" : "Agregar dirección"}
        </button>
      </div>

      {direcciones.length === 0 ? (
        <p className="mt-3 text-sm text-gris-600">
          Sin direcciones. Una venta con despacho no se va a poder confirmar hasta
          que haya al menos una.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {direcciones.map((d) => (
            <li
              key={d.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-md border p-3 ${
                d.activa ? "border-gris-200" : "border-gris-200 bg-gris-50"
              }`}
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-gris-900">
                  {d.etiqueta || "Sin etiqueta"}
                  {d.preferida ? (
                    <span className="rounded bg-marca px-1.5 py-0.5 text-xs font-bold tracking-wide text-negro uppercase">
                      Preferida
                    </span>
                  ) : null}
                  {!d.activa ? (
                    <span className="rounded bg-gris-200 px-1.5 py-0.5 text-xs font-bold tracking-wide text-gris-700 uppercase">
                      Inactiva
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-gris-700">{d.calle}</p>
                <p className="text-sm text-gris-600">
                  {[d.comuna, d.ciudad].filter(Boolean).join(", ") || "Sin comuna"}
                  {d.referencia ? ` · ${d.referencia}` : ""}
                </p>
              </div>

              <form action={accionQuitar} className="shrink-0">
                <input type="hidden" name="direccion_id" value={d.id} />
                <input type="hidden" name="cliente_id" value={clienteId} />
                <button
                  type="submit"
                  className="text-sm font-semibold text-gris-600 hover:text-acento"
                >
                  Quitar
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <Mensaje estado={estadoQuitar} />

      {abierto ? (
        <form action={accionAgregar} className="mt-4 border-t border-gris-100 pt-4">
          <input type="hidden" name="cliente_id" value={clienteId} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-sm font-semibold text-gris-800">Etiqueta</span>
              <input name="etiqueta" placeholder="Casa, oficina" className={claseCampo} />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-gris-800">
                Calle y número<span className="text-gris-500"> *</span>
              </span>
              <input name="calle" required className={claseCampo} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gris-800">Comuna</span>
              <input name="comuna" className={claseCampo} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gris-800">Ciudad</span>
              <input name="ciudad" className={claseCampo} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gris-800">Referencia</span>
              <input name="referencia" className={claseCampo} />
            </label>
          </div>

          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" name="preferida" value="1" className="size-4" />
            <span className="text-sm text-gris-800">
              Usar como preferida. Se ofrece primero al despachar.
            </span>
          </label>

          <Mensaje estado={estadoAgregar} />

          <button
            type="submit"
            disabled={agregando}
            className="mt-3 rounded-md bg-primario px-4 py-2.5 text-sm font-semibold text-blanco disabled:opacity-60"
          >
            {agregando ? "Guardando..." : "Agregar dirección"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
