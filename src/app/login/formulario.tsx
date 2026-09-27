"use client";

import { useActionState, useRef } from "react";
import { iniciarSesion, type EstadoLogin } from "./acciones";
import type { CredencialesDemo } from "@/lib/datos/demo";

const claseCampo =
  "mt-1.5 w-full rounded-md border border-gris-300 px-3 py-3 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30";

/*
  Formulario de entrada, con el atajo de demostración.

  EL BOTÓN DE DEMO NO ES UN SEGUNDO FORMULARIO. Rellena los mismos dos campos y
  envía el de siempre con requestSubmit(). Así hay una sola ruta de inicio de
  sesión que mantener, un solo manejo de errores, y lo que ocurre queda a la
  vista: los campos se llenan delante de quien mira, en vez de una sesión que
  aparece por un camino que no se ve.

  Las credenciales también se imprimen en texto. Alguien que quiera probar
  desde otro dispositivo, o entender qué cuenta está usando, las necesita
  legibles y no escondidas detrás de un botón.
*/
export function FormularioLogin({
  volver,
  demo,
}: {
  volver: string;
  demo: CredencialesDemo | null;
}) {
  const [estado, accion, pendiente] = useActionState<EstadoLogin, FormData>(iniciarSesion, {});
  const formulario = useRef<HTMLFormElement>(null);
  const correo = useRef<HTMLInputElement>(null);
  const clave = useRef<HTMLInputElement>(null);

  const entrarComoDemo = () => {
    if (!demo || !correo.current || !clave.current) return;
    correo.current.value = demo.email;
    clave.current.value = demo.password;
    /* requestSubmit y no submit(): submit() se salta la validación del
       formulario y, con React, el manejador de action. */
    formulario.current?.requestSubmit();
  };

  return (
    <>
      <form ref={formulario} action={accion} className="mt-8 space-y-4">
        <input type="hidden" name="volver" value={volver} />

        <label className="block">
          <span className="text-sm font-semibold text-gris-800">Correo</span>
          <input
            ref={correo}
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
            ref={clave}
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
          className="w-full rounded-lg bg-primario px-5 py-3.5 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pendiente ? "Entrando..." : "Entrar"}
        </button>
      </form>

      {demo ? (
        <div className="mt-8 flex overflow-hidden rounded-xl border border-gris-200">
          {/* Ámbar: esto es una invitación a probar, no un aviso ni un error. */}
          <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
          <div className="min-w-0 flex-1 p-4">
            <h2 className="text-sm font-bold text-gris-900">¿Solo quieres probarla?</h2>
            <p className="mt-1.5 text-sm text-gris-600">
              Entra con la cuenta de demostración. Puede cargar fotos y editar
              productos, pero no administra usuarios ni categorías, y lo que
              cargues lo va a ver todo el mundo.
            </p>

            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-gris-800">Correo:</dt>
                <dd className="font-mono break-all text-gris-700">{demo.email}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-semibold text-gris-800">Contraseña:</dt>
                <dd className="font-mono break-all text-gris-700">{demo.password}</dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={entrarComoDemo}
              disabled={pendiente}
              className="mt-4 w-full rounded-lg bg-marca px-5 py-3 text-base font-bold text-negro transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pendiente ? "Entrando..." : "Entrar con la cuenta de prueba"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
