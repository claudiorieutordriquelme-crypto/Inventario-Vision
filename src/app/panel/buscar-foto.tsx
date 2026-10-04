"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { Camara } from "@/components/camara";
import { descriptorDeArchivo } from "@/lib/descriptor";
import { formateaPesos } from "@/lib/formato";
import { buscarPorFoto, type EstadoBusquedaFoto } from "./buscar-foto-acciones";

/*
  Buscar una pieza del inventario sacándole una foto.

  SE USA EN DOS LUGARES y por eso vive acá y no dentro de ninguno: en el
  inventario, para encontrar la ficha de algo que tienes en la mano; y en el
  punto de venta, para agregarlo al carrito sin saber cómo se llama. En la
  venta, cada resultado trae su botón de agregar; en el inventario, lleva a la
  ficha.

  LA FOTO NO SE SUBE. El navegador la mide y manda 256 números. Por eso buscar
  por foto no cuesta nada, no deja imágenes sueltas en el bucket y funciona
  igual con mala señal.

  LO QUE ENCUENTRA, dicho en la pantalla y no solo acá: imágenes que SE VEN
  parecidas, por color y forma. No reconoce objetos. Entre piezas distintas
  entre sí acierta; entre dos tazas blancas casi iguales, no. Un porcentaje sin
  esa advertencia se lee como una certeza que esto no tiene.
*/

export function BuscarPorFoto({
  alElegir,
  etiquetaAccion = "Ver ficha",
}: {
  /* Cuando viene, cada resultado muestra un botón que lo entrega en vez de
     enlazar a su ficha. Es lo que usa el punto de venta para agregar al
     carrito. */
  alElegir?: (productoId: string, nombre: string) => void;
  etiquetaAccion?: string;
}) {
  const [estado, accion, buscando] = useActionState<EstadoBusquedaFoto, FormData>(
    buscarPorFoto,
    {},
  );
  const [abierto, setAbierto] = useState(false);
  const [camara, setCamara] = useState(false);
  const [midiendo, setMidiendo] = useState(false);
  const [vista, setVista] = useState<string | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const campoVector = useRef<HTMLInputElement>(null);
  const formulario = useRef<HTMLFormElement>(null);
  const urlVista = useRef<string | null>(null);

  const medirYBuscar = async (archivo: File) => {
    setProblema(null);
    setMidiendo(true);

    if (urlVista.current) URL.revokeObjectURL(urlVista.current);
    urlVista.current = URL.createObjectURL(archivo);
    setVista(urlVista.current);

    const vector = await descriptorDeArchivo(archivo);
    setMidiendo(false);

    if (!vector) {
      setProblema("No pude medir esa imagen. Prueba con otra foto.");
      return;
    }
    if (campoVector.current) {
      campoVector.current.value = JSON.stringify(vector);
      formulario.current?.requestSubmit();
    }
  };

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-current" aria-hidden="true">
          <path d="M9 3h6l1.2 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.8L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z" />
        </svg>
        Buscar con una foto
      </button>
    );
  }

  const resultados = estado.resultados ?? [];

  return (
    <section className="rounded-lg border border-gris-200 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Buscar con una foto
        </h2>
        <button
          type="button"
          onClick={() => {
            setAbierto(false);
            setCamara(false);
          }}
          className="text-sm font-semibold text-gris-600 hover:text-gris-900"
        >
          Cerrar
        </button>
      </div>

      <p className="mt-1 max-w-prose text-sm text-gris-600">
        Saca una foto de la pieza y te muestro las del inventario que más se le
        parecen. La foto no se sube: se mide en este dispositivo.
      </p>

      {camara ? (
        <Camara
          onCaptura={(archivo) => {
            setCamara(false);
            void medirYBuscar(archivo);
          }}
          alCancelar={() => setCamara(false)}
        />
      ) : null}

      <form ref={formulario} action={accion} className="mt-3">
        <input ref={campoVector} type="hidden" name="vector" />

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCamara(true)}
            disabled={midiendo || buscando}
            className="rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco disabled:opacity-60"
          >
            Sacar una foto
          </button>

          <label className="cursor-pointer rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario">
            Elegir una imagen
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={midiendo || buscando}
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                e.target.value = "";
                if (archivo) void medirYBuscar(archivo);
              }}
            />
          </label>

          {vista ? (
            /* eslint-disable-next-line @next/next/no-img-element -- blob local */
            <img
              src={vista}
              alt="La foto con la que estás buscando"
              className="size-14 rounded border border-gris-200 object-cover"
            />
          ) : null}

          {midiendo || buscando ? (
            <p aria-live="polite" className="text-sm text-gris-600">
              {midiendo ? "Midiendo la foto..." : "Buscando parecidos..."}
            </p>
          ) : null}
        </div>
      </form>

      {problema ? (
        <p role="alert" className="mt-3 rounded-md border border-acento px-3 py-2 text-sm text-gris-900">
          {problema}
        </p>
      ) : null}

      {estado.error ? (
        <p role="alert" className="mt-3 rounded-md border border-acento px-3 py-2 text-sm text-gris-900">
          {estado.error}
        </p>
      ) : null}

      {estado.aviso ? (
        <p role="status" className="mt-3 rounded-md border border-gris-200 px-3 py-2 text-sm text-gris-700">
          {estado.aviso}
        </p>
      ) : null}

      {resultados.length > 0 ? (
        <>
          <p className="mt-4 text-sm text-gris-600">
            Ordenados por parecido visual. Esto compara colores y formas, no
            reconoce objetos: revisa cuál es antes de elegir.
          </p>

          <ul className="mt-3 divide-y divide-gris-100 rounded-lg border border-gris-200">
            {resultados.map((r) => (
              <li
                key={r.producto_id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                {/* La miniatura del producto, servida por la ruta que firma
                    de a una. Con doce resultados son doce firmas, no
                    quinientas como sería en el listado completo. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- ruta propia que redirige a una URL firmada */}
                <img
                  src={`/panel/foto/${r.producto_id}`}
                  alt=""
                  className="size-12 shrink-0 rounded border border-gris-200 bg-gris-50 object-cover"
                />

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gris-900">{r.nombre}</p>
                  <p className="mt-0.5 text-xs text-gris-600">
                    <span className="font-mono">{r.sku}</span> ·{" "}
                    {r.categoria_nombre ?? "Sin categoría"} ·{" "}
                    {r.cantidad > 0 ? `${r.cantidad} disponibles` : "Sin stock"}
                  </p>
                </div>

                {/*
                  El parecido va con número Y con barra. El número solo no dice
                  si 62 es mucho o poco; la barra sola no se puede comparar
                  entre dos filas lejanas.
                */}
                <div className="w-24 shrink-0">
                  <p className="text-right text-sm font-bold text-gris-900">{r.parecido}%</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gris-200">
                    <div className="h-full bg-primario" style={{ width: `${r.parecido}%` }} />
                  </div>
                </div>

                <p className="w-24 shrink-0 text-right text-sm font-semibold text-gris-700">
                  {formateaPesos(r.precio_vigente_clp)}
                </p>

                {alElegir ? (
                  <button
                    type="button"
                    onClick={() => alElegir(r.producto_id, r.nombre)}
                    disabled={r.cantidad <= 0 || r.precio_vigente_clp === null}
                    className="shrink-0 rounded-md bg-primario px-3 py-1.5 text-sm font-semibold text-blanco disabled:opacity-50"
                  >
                    {etiquetaAccion}
                  </button>
                ) : (
                  <Link
                    href={`/panel/productos/${r.producto_id}`}
                    className="shrink-0 text-sm font-semibold text-primario hover:underline"
                  >
                    {etiquetaAccion}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
