"use client";

import { useActionState } from "react";
import {
  aceptarReferencia,
  buscarReferenciasWeb,
  quitarReferencia,
  type EstadoReferencias,
} from "./referencias-acciones";
import { formateaPesos } from "@/lib/formato";
import type { ReferenciaProducto } from "@/lib/tipos";

/*
  Referencias web del producto: el botón de buscar, los resultados con Sí/No, y
  lo que ya está guardado.

  EL SÍ/NO ES EL PUNTO DE ESTA PANTALLA. La búsqueda no guarda nada: trae
  candidatos y una persona decide uno por uno. Guardar automáticamente lo que
  devuelva un buscador llenaría la ficha de enlaces que nadie miró, y el valor
  de una referencia es justamente que alguien la miró.

  EL "NO" NO ESCRIBE NADA. Descarta el candidato de la lista en pantalla y
  listo. No hay tabla de rechazados: nadie la consultaría.
*/

const ETIQUETA_RESPALDA: Record<string, string> = {
  precio: "Respalda el precio",
  descripcion: "Respalda la descripción",
  ambas: "Respalda precio y descripción",
};

function Mensaje({ estado }: { estado: EstadoReferencias }) {
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

export function Referencias({
  productoId,
  guardadas,
  puedeOperar,
  busquedaDisponible,
}: {
  productoId: string;
  guardadas: ReferenciaProducto[];
  puedeOperar: boolean;
  /** Si no hay clave de Anthropic, el botón no se dibuja y se explica por qué. */
  busquedaDisponible: boolean;
}) {
  const [estadoBusqueda, accionBuscar, buscando] = useActionState<EstadoReferencias, FormData>(
    buscarReferenciasWeb,
    {},
  );
  const [estadoAceptar, accionAceptar, aceptando] = useActionState<EstadoReferencias, FormData>(
    aceptarReferencia,
    {},
  );
  const [estadoQuitar, accionQuitar] = useActionState<EstadoReferencias, FormData>(
    quitarReferencia,
    {},
  );

  /* Lo que ya está guardado no se vuelve a ofrecer: aceptarlo otra vez fallaría
     contra la llave única y mostraría un error que no explica nada. */
  const yaGuardadas = new Set(guardadas.map((r) => r.url));
  const candidatas = (estadoBusqueda.encontradas ?? []).filter((r) => !yaGuardadas.has(r.url));

  return (
    <section aria-label="Referencias en la web">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Referencias en la web
        </h2>
        <p className="text-sm text-gris-600">
          {guardadas.length} {guardadas.length === 1 ? "guardada" : "guardadas"}
        </p>
      </div>

      <p className="mt-1 max-w-prose text-sm text-gris-600">
        Fuentes que respaldan el precio o la descripción. No cambian el precio
        estimado del modelo: quedan al lado, como respaldo o como contradicción.
      </p>

      {/* ── Lo guardado ──────────────────────────────────────────────── */}
      {guardadas.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {guardadas.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gris-200 p-3"
            >
              <div className="min-w-0 flex-1">
                {/* target _blank con rel noopener: abrir una página externa en
                    la misma pestaña perdería la ficha que se está revisando. */}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-primario hover:underline"
                >
                  {r.titulo}
                </a>
                <p className="mt-0.5 text-xs text-gris-500">
                  {r.dominio ?? r.url} · {ETIQUETA_RESPALDA[r.respalda] ?? r.respalda}
                  {r.precio_mencionado_clp !== null
                    ? ` · menciona ${formateaPesos(r.precio_mencionado_clp)}`
                    : ""}
                </p>
                {r.extracto ? (
                  <p className="mt-1 max-w-prose text-sm text-gris-600">{r.extracto}</p>
                ) : null}
              </div>

              {puedeOperar ? (
                <form action={accionQuitar} className="shrink-0">
                  <input type="hidden" name="referencia_id" value={r.id} />
                  <input type="hidden" name="producto_id" value={productoId} />
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
      ) : null}

      <Mensaje estado={estadoQuitar} />

      {/* ── El botón ─────────────────────────────────────────────────── */}
      {puedeOperar ? (
        busquedaDisponible ? (
          <form action={accionBuscar} className="mt-4">
            <input type="hidden" name="producto_id" value={productoId} />
            <button
              type="submit"
              disabled={buscando}
              className="rounded-lg border-2 border-primario px-4 py-2.5 text-sm font-semibold text-primario transition-colors hover:bg-primario hover:text-blanco disabled:opacity-60"
            >
              {buscando ? "Buscando en la web..." : "Buscar referencias en la web"}
            </button>
            {/* El costo se dice ANTES de apretar, no después. Es plata real y
                quien aprieta tiene derecho a saberlo. */}
            <p className="mt-2 text-xs text-gris-500">
              Hace hasta 3 búsquedas y tiene costo. Queda registrado en el
              consumo del mes.
            </p>
          </form>
        ) : (
          <p className="mt-4 rounded-md border border-gris-200 px-3 py-2 text-sm text-gris-600">
            La búsqueda en la web no está configurada: falta la clave de la API
            en el entorno. Puedes seguir usando la ficha con normalidad.
          </p>
        )
      ) : null}

      <Mensaje estado={estadoBusqueda} />

      {estadoBusqueda.observacion ? (
        <p className="mt-2 max-w-prose text-sm text-gris-600">{estadoBusqueda.observacion}</p>
      ) : null}

      {/* ── Los candidatos, uno por uno ──────────────────────────────── */}
      {candidatas.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-bold text-gris-900">
            ¿Cuáles guardas? Decide una por una
          </h3>

          <ul className="mt-3 space-y-3">
            {candidatas.map((r) => (
              <li key={r.url} className="rounded-lg border border-gris-200 p-4">
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-bold text-primario hover:underline"
                >
                  {r.titulo}
                </a>
                <p className="mt-0.5 text-xs break-all text-gris-500">{r.url}</p>
                <p className="mt-2 max-w-prose text-sm text-gris-700">{r.extracto}</p>
                <p className="mt-1 text-xs font-semibold text-gris-600">
                  {ETIQUETA_RESPALDA[r.respalda] ?? r.respalda}
                  {r.precio_mencionado_clp !== null
                    ? ` · menciona ${formateaPesos(r.precio_mencionado_clp)}`
                    : " · sin precio en pesos"}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <form action={accionAceptar}>
                    <input type="hidden" name="producto_id" value={productoId} />
                    <input type="hidden" name="url" value={r.url} />
                    <input type="hidden" name="titulo" value={r.titulo} />
                    <input type="hidden" name="extracto" value={r.extracto} />
                    <input type="hidden" name="respalda" value={r.respalda} />
                    <input
                      type="hidden"
                      name="precio_mencionado_clp"
                      value={r.precio_mencionado_clp ?? ""}
                    />
                    <button
                      type="submit"
                      disabled={aceptando}
                      className="rounded-md bg-primario px-5 py-2 text-sm font-bold text-blanco disabled:opacity-60"
                    >
                      Sí, guardar
                    </button>
                  </form>

                  {/*
                    El "No" no manda nada al servidor: basta con abrir el enlace
                    y no guardarlo. Se deja dicho para que no parezca que falta
                    un botón, y para que quede claro que descartar no cuesta
                    nada ni deja rastro.
                  */}
                  <p className="text-sm text-gris-500">
                    Si no sirve, simplemente no la guardes.
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <Mensaje estado={estadoAceptar} />
        </div>
      ) : null}
    </section>
  );
}
