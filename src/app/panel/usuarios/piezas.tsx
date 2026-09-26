"use client";

import { useActionState } from "react";
import { DESCRIPCION_ROL, ETIQUETA_ROL, ROLES } from "@/lib/roles";
import { cambiarUsuario, type EstadoUsuario } from "./acciones";
import type { Rol } from "@/lib/roles";

const claseCampo =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

export type UsuarioPanel = {
  id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
};

function Mensaje({ estado }: { estado: EstadoUsuario }) {
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

function FilaUsuario({ usuario, esUnoMismo }: { usuario: UsuarioPanel; esUnoMismo: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoUsuario, FormData>(cambiarUsuario, {});

  return (
    <li className="border-b border-gris-100 p-4 last:border-0">
      <form action={accion} className="space-y-3">
        <input type="hidden" name="id" value={usuario.id} />

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-semibold text-gris-900">
            {usuario.nombre || usuario.email || "Sin nombre"}
          </span>
          {esUnoMismo ? (
            <span className="rounded border border-primario px-1.5 py-0.5 text-xs font-bold text-primario">
              Eres tú
            </span>
          ) : null}
          {!usuario.activo ? (
            <span className="rounded bg-gris-200 px-1.5 py-0.5 text-xs font-bold tracking-wide text-gris-700 uppercase">
              Deshabilitado
            </span>
          ) : null}
          {usuario.email && usuario.nombre ? (
            <span className="text-sm text-gris-500">{usuario.email}</span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,14rem)_auto_auto] sm:items-end">
          <label className="block">
            <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">Rol</span>
            <select name="rol" defaultValue={usuario.rol} className={claseCampo}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 sm:pb-3">
            <input
              type="checkbox"
              name="activo"
              value="1"
              defaultChecked={usuario.activo}
              className="size-5 accent-[var(--color-primario)]"
            />
            <span className="text-sm font-semibold text-gris-800">Cuenta habilitada</span>
          </label>

          <button
            type="submit"
            disabled={pendiente}
            className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-gris-500 disabled:opacity-60 sm:mb-1"
          >
            {pendiente ? "Guardando..." : "Aplicar"}
          </button>
        </div>

        <p className="text-xs text-gris-500">{DESCRIPCION_ROL[usuario.rol]}</p>

        <Mensaje estado={estado} />
      </form>
    </li>
  );
}

export function ListaUsuarios({
  usuarios,
  idPropio,
}: {
  usuarios: UsuarioPanel[];
  idPropio: string;
}) {
  return (
    <ul className="rounded-lg border border-gris-200">
      {usuarios.map((u) => (
        <FilaUsuario key={u.id} usuario={u} esUnoMismo={u.id === idPropio} />
      ))}
    </ul>
  );
}
