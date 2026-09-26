"use client";

import { useActionState } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";

const claseCampo =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

export function FormularioLogin({ volver }: { volver: string }) {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});

  return (
    <form action={accion} className="mt-8 space-y-4">
      <input type="hidden" name="volver" value={volver} />

      <label className="block">
        <span className="text-sm font-semibold text-gris-800">Correo</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="username"
          autoFocus
          defaultValue={estado.email ?? ""}
          className={claseCampo}
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-gris-800">Contraseña</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className={claseCampo}
        />
      </label>

      {estado.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-acento px-3 py-2.5 text-sm font-medium text-gris-900"
        >
          <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 fill-acento" aria-hidden="true">
            <circle cx="8" cy="8" r="7" />
            <rect x="7" y="4" width="2" height="5" rx="1" fill="var(--color-blanco)" />
            <rect x="7" y="10.5" width="2" height="2" rx="1" fill="var(--color-blanco)" />
          </svg>
          {estado.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendiente}
        className="w-full rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pendiente ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
