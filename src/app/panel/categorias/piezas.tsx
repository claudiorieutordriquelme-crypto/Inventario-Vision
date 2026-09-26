"use client";

import { useActionState, useState } from "react";
import {
  actualizarCategoria,
  crearCategoria,
  eliminarCategoria,
  type EstadoCategoria,
} from "./acciones";
import type { Categoria } from "@/lib/tipos";

const claseCampo =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

function Mensaje({ estado }: { estado: EstadoCategoria }) {
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

export function CrearCategoria() {
  const [estado, accion, pendiente] = useActionState<EstadoCategoria, FormData>(crearCategoria, {});
  const [abierto, setAbierto] = useState(false);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco transition-opacity hover:opacity-90"
      >
        Nueva categoría
      </button>
    );
  }

  return (
    <form action={accion} className="w-full rounded-lg border border-gris-200 p-4">
      <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">
        Nueva categoría
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-gris-800">
            Nombre<span className="text-gris-500"> *</span>
          </span>
          <input name="nombre" required placeholder="Herramientas eléctricas" className={claseCampo} />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">
            Prefijo de SKU<span className="text-gris-500"> *</span>
          </span>
          <input
            name="prefijo_sku"
            required
            maxLength={4}
            placeholder="HER"
            className={`${claseCampo} uppercase`}
          />
          <span className="mt-1 block text-xs text-gris-500">
            De 2 a 4 letras. Arma el SKU: HER-0001. No se puede cambiar después.
          </span>
        </label>

        <label className="block sm:col-span-2">
          <span className="text-sm font-semibold text-gris-800">Descripción</span>
          <input
            name="descripcion"
            placeholder="Qué entra en esta categoría"
            className={claseCampo}
          />
          <span className="mt-1 block text-xs text-gris-500">
            La lee el análisis para decidir si un producto calza acá. Mientras
            más concreta, mejor clasifica.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Orden</span>
          <input type="number" name="orden" defaultValue={100} className={claseCampo} />
        </label>
      </div>

      <Mensaje estado={estado} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-md bg-primario px-4 py-2.5 text-sm font-semibold text-blanco disabled:opacity-60"
        >
          {pendiente ? "Creando..." : "Crear categoría"}
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

export function AccionesCategoria({
  categoria,
  productos,
}: {
  categoria: Categoria;
  productos: number;
}) {
  const [modo, setModo] = useState<"cerrado" | "editar" | "borrar">("cerrado");
  const [estadoEdicion, accionEditar, editando] = useActionState<EstadoCategoria, FormData>(
    actualizarCategoria,
    {},
  );
  const [estadoBorrado, accionBorrar, borrando] = useActionState<EstadoCategoria, FormData>(
    eliminarCategoria,
    {},
  );

  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-4 border-t border-gris-100 pt-3 text-sm">
        <button
          type="button"
          onClick={() => setModo(modo === "editar" ? "cerrado" : "editar")}
          aria-expanded={modo === "editar"}
          className="font-semibold text-primario hover:underline"
        >
          Editar
        </button>
        {/* El borrado solo se ofrece si de verdad se puede. Con productos
            asignados la llave foránea lo rechaza siempre, y un botón que
            siempre falla manda a pelear con el sistema. */}
        {productos === 0 ? (
          <button
            type="button"
            onClick={() => setModo(modo === "borrar" ? "cerrado" : "borrar")}
            aria-expanded={modo === "borrar"}
            className="font-semibold text-gris-600 transition-colors hover:text-acento"
          >
            Eliminar
          </button>
        ) : (
          <span className="text-gris-500">
            No se puede borrar: tiene {productos} {productos === 1 ? "producto" : "productos"}.
            Desactívala si ya no se usa.
          </span>
        )}
      </div>

      {modo === "editar" ? (
        <form action={accionEditar} className="mt-3 border-t border-gris-100 pt-3">
          <input type="hidden" name="id" value={categoria.id} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-gris-800">Nombre</span>
              <input name="nombre" required defaultValue={categoria.nombre} className={claseCampo} />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gris-800">Estado</span>
              <select
                name="activo"
                defaultValue={categoria.activo ? "1" : "0"}
                className={claseCampo}
              >
                <option value="1">Activa</option>
                <option value="0">Inactiva</option>
              </select>
              <span className="mt-1 block text-xs text-gris-500">
                Inactiva deja de ofrecerse al clasificar y conserva sus productos.
              </span>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-semibold text-gris-800">Descripción</span>
              <input
                name="descripcion"
                defaultValue={categoria.descripcion ?? ""}
                className={claseCampo}
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gris-800">Orden</span>
              <input
                type="number"
                name="orden"
                defaultValue={categoria.orden}
                className={claseCampo}
              />
            </label>
          </div>

          <p className="mt-3 text-xs text-gris-500">
            El prefijo <span className="font-mono font-bold">{categoria.prefijo_sku}</span> no se
            edita: los SKU ya emitidos no se renumeran, así que cambiarlo dejaría
            productos con un prefijo que no corresponde a su categoría.
          </p>

          <Mensaje estado={estadoEdicion} />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={editando}
              className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-blanco disabled:opacity-60"
            >
              {editando ? "Guardando..." : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setModo("cerrado")}
              className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {modo === "borrar" ? (
        <form action={accionBorrar} className="mt-3 border-t border-gris-100 pt-3">
          <input type="hidden" name="id" value={categoria.id} />
          <input type="hidden" name="nombre_esperado" value={categoria.nombre} />

          <div className="flex overflow-hidden rounded-lg border border-gris-200">
            <div className="w-2 shrink-0 bg-acento" aria-hidden="true" />
            <div className="min-w-0 flex-1 p-4">
              <p className="text-sm font-bold text-gris-900">Borrar {categoria.nombre}</p>
              <p className="mt-1.5 text-sm text-gris-600">
                No tiene productos, así que se puede borrar. El correlativo de su
                prefijo se conserva: si vuelves a crear una categoría{" "}
                <span className="font-mono">{categoria.prefijo_sku}</span>, los SKU siguen desde
                donde iban y no se repiten.
              </p>

              <label className="mt-3 block max-w-sm">
                <span className="text-sm font-semibold text-gris-800">
                  Escribe <span className="font-mono font-bold">{categoria.nombre}</span> para
                  confirmar
                </span>
                <input name="confirmacion" autoComplete="off" autoFocus className={claseCampo} />
              </label>

              <Mensaje estado={estadoBorrado} />

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={borrando}
                  className="rounded-md bg-acento px-4 py-2 text-sm font-semibold text-negro disabled:opacity-60"
                >
                  {borrando ? "Borrando..." : "Borrar definitivamente"}
                </button>
                <button
                  type="button"
                  onClick={() => setModo("cerrado")}
                  className="rounded-md border border-gris-300 px-4 py-2 text-sm font-semibold text-gris-800"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
}
