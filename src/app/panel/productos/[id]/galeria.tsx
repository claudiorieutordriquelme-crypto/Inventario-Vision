"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camara } from "@/components/camara";
import { Carrusel } from "@/components/carrusel";
import type { ImagenProducto } from "@/lib/datos/imagenes";
import {
  agregarImagenes,
  quitarImagen,
  reordenarImagenes,
  type EstadoImagenes,
} from "./imagenes-acciones";

/*
  Galería de la ficha: ver, agregar, quitar y reordenar las imágenes.

  POR QUÉ ESTÁ ACÁ Y NO SOLO EN EL ALTA. Los productos cargados antes de la
  regla de las tres imágenes tienen una sola, y sin esta pantalla no habría
  forma de completarlos: quedarían para siempre sin poder confirmarse. Esta es
  la pantalla que los regulariza.

  EL ESTADO DE "INCOMPLETO" SE DICE CON PALABRAS Y CON NÚMERO. Un contador
  suelto no explica qué pasa si no llega a tres; acá dice que no se va a poder
  confirmar, que es la consecuencia real.
*/

const MINIMO = 3;
const MAXIMO = 6;

function Mensaje({ estado }: { estado: EstadoImagenes }) {
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

export function Galeria({
  productoId,
  nombre,
  imagenes,
  puedeOperar,
  errorLectura,
}: {
  productoId: string;
  nombre: string;
  imagenes: ImagenProducto[];
  puedeOperar: boolean;
  errorLectura: string | null;
}) {
  const [estadoAgregar, accionAgregar, agregando] = useActionState<EstadoImagenes, FormData>(
    agregarImagenes,
    {},
  );
  const [estadoQuitar, accionQuitar, quitando] = useActionState<EstadoImagenes, FormData>(
    quitarImagen,
    {},
  );
  const [estadoOrden, accionOrden, ordenando] = useActionState<EstadoImagenes, FormData>(
    reordenarImagenes,
    {},
  );

  const [camara, setCamara] = useState(false);
  const [nuevas, setNuevas] = useState<File[]>([]);
  const entrada = useRef<HTMLInputElement>(null);
  const formAgregar = useRef<HTMLFormElement>(null);

  /*
    Orden local, para que reordenar se vea de inmediato y se guarde con un
    botón. Guardar en cada clic dispararía tres escrituras para mover una foto
    dos lugares.

    Se reinicia AJUSTANDO EL ESTADO DURANTE EL RENDER y no desde un efecto. Es
    el patrón que React documenta para "el estado depende de una prop que
    cambió": con un efecto, el primer render pinta el orden viejo y el
    siguiente lo corrige, y ese parpadeo se ve cuando se agrega una imagen.
  */
  const idsDelServidor = imagenes.map((i) => i.id).join(",");
  const [orden, setOrden] = useState<string[]>(() => imagenes.map((i) => i.id));
  const [idsVistos, setIdsVistos] = useState(idsDelServidor);
  if (idsVistos !== idsDelServidor) {
    setIdsVistos(idsDelServidor);
    setOrden(imagenes.map((i) => i.id));
  }

  const porId = new Map(imagenes.map((i) => [i.id, i]));
  const ordenadas = orden.map((id) => porId.get(id)).filter((i): i is ImagenProducto => Boolean(i));
  const cambioElOrden = orden.join(",") !== imagenes.map((i) => i.id).join(",");

  /* El input oculto es lo que viaja. Un <input type="file"> no acepta que le
     asignen un valor por código; DataTransfer es la única vía permitida. */
  useEffect(() => {
    if (!entrada.current) return;
    const dt = new DataTransfer();
    for (const f of nuevas) dt.items.add(f);
    entrada.current.files = dt.files;
  }, [nuevas]);

  const total = imagenes.length;
  const faltan = Math.max(0, MINIMO - total);
  const espacio = Math.max(0, MAXIMO - total);

  const mover = (desde: number, hacia: number) => {
    if (hacia < 0 || hacia >= orden.length) return;
    const copia = [...orden];
    const [sacada] = copia.splice(desde, 1);
    copia.splice(hacia, 0, sacada);
    setOrden(copia);
  };

  return (
    <section aria-label="Imágenes del producto">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">Imágenes</h2>
        <p className="text-sm text-gris-600">
          {total} de {MINIMO} mínimas
        </p>
      </div>

      {errorLectura ? (
        <p role="alert" className="mt-3 rounded-md border border-acento px-3 py-2 text-sm text-gris-900">
          No pude leer las imágenes. Es un problema de lectura, no que el
          producto no tenga ninguna.
        </p>
      ) : null}

      {/*
        El aviso de incompleto dice la CONSECUENCIA, no solo el número. "Tiene
        1 de 3" no explica por qué importa; "no se va a poder confirmar" sí.
      */}
      {faltan > 0 && !errorLectura ? (
        <div className="mt-3 flex overflow-hidden rounded-lg border border-marca">
          <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
          <p className="min-w-0 flex-1 px-4 py-3 text-sm text-gris-900">
            <span className="font-bold">Incompleto.</span>{" "}
            {faltan === 1 ? "Falta 1 imagen" : `Faltan ${faltan} imágenes`} para llegar a{" "}
            {MINIMO}. Mientras tanto este producto no se puede confirmar.
          </p>
        </div>
      ) : null}

      {/*
        El visor deslizable va arriba de las miniaturas, no en vez de ellas.
        Son dos tareas distintas: mirar la pieza en grande, que es lo primero
        que alguien hace al abrir la ficha, y administrar el orden, que es una
        tarea ocasional. Con solo miniaturas había que abrir cada una aparte
        para verla; con solo visor no se podría reordenar.
      */}
      {ordenadas.length > 0 ? (
        <Carrusel
          className="mt-4"
          imagenes={ordenadas.map((img, i) => ({
            id: img.id,
            url: img.url,
            alt: `${nombre}, imagen ${i + 1} de ${ordenadas.length}`,
          }))}
        />
      ) : null}

      {ordenadas.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ordenadas.map((img, i) => (
            <li key={img.id} className="overflow-hidden rounded-lg border border-gris-200">
              <div className="relative">
                {img.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- URL firmada y efímera: el optimizador de Next la cachearía más allá de su vida útil */
                  <img
                    src={img.url}
                    alt={`${nombre}, imagen ${i + 1}`}
                    className="block aspect-square w-full bg-gris-50 object-cover"
                  />
                ) : (
                  <p className="flex aspect-square w-full items-center justify-center bg-gris-100 px-3 text-center text-xs text-gris-600">
                    No pude preparar esta imagen
                  </p>
                )}
                {i === 0 ? (
                  <span className="absolute top-2 left-2 rounded bg-marca px-2 py-0.5 text-xs font-bold tracking-wide text-negro uppercase">
                    Portada
                  </span>
                ) : null}
              </div>

              {puedeOperar ? (
                <div className="flex items-center justify-between gap-1 border-t border-gris-200 px-2 py-1.5">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      onClick={() => mover(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Mover la imagen ${i + 1} hacia atrás`}
                      className="rounded px-2 py-1 text-sm font-bold text-gris-600 hover:text-primario disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, i + 1)}
                      disabled={i === ordenadas.length - 1}
                      aria-label={`Mover la imagen ${i + 1} hacia adelante`}
                      className="rounded px-2 py-1 text-sm font-bold text-gris-600 hover:text-primario disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>

                  <form action={accionQuitar}>
                    <input type="hidden" name="imagen_id" value={img.id} />
                    <input type="hidden" name="producto_id" value={productoId} />
                    <button
                      type="submit"
                      disabled={quitando}
                      className="rounded px-2 py-1 text-xs font-semibold text-gris-600 hover:text-acento disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : !errorLectura ? (
        <p className="mt-4 rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
          Este producto no tiene ninguna imagen.
        </p>
      ) : null}

      <Mensaje estado={estadoQuitar} />

      {/* El botón de guardar el orden solo aparece cuando hay algo que
          guardar. Un botón permanente invita a apretarlo sin haber cambiado
          nada, y escribir tres filas para dejarlas igual es trabajo inútil. */}
      {puedeOperar && cambioElOrden ? (
        <form action={accionOrden} className="mt-3">
          <input type="hidden" name="producto_id" value={productoId} />
          <input type="hidden" name="orden" value={orden.join(",")} />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={ordenando}
              className="rounded-md bg-primario px-4 py-2 text-sm font-semibold text-blanco disabled:opacity-60"
            >
              {ordenando ? "Guardando..." : "Guardar el orden"}
            </button>
            <button
              type="button"
              onClick={() => setOrden(imagenes.map((i) => i.id))}
              className="text-sm font-semibold text-gris-600 hover:text-gris-900"
            >
              Deshacer
            </button>
          </div>
        </form>
      ) : null}
      <Mensaje estado={estadoOrden} />

      {puedeOperar ? (
        <>
          {camara ? (
            <Camara
              onCaptura={(archivo) => setNuevas((previas) => [...previas, archivo])}
              alCancelar={() => setCamara(false)}
              objetivo={faltan > 0 ? faltan : undefined}
            />
          ) : null}

          <form ref={formAgregar} action={accionAgregar} className="mt-4">
            <input type="hidden" name="producto_id" value={productoId} />
            <input ref={entrada} type="file" name="fotos" multiple className="sr-only" tabIndex={-1} />

            {espacio > 0 ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCamara(true)}
                  disabled={agregando}
                  className="inline-flex items-center gap-2 rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-current" aria-hidden="true">
                    <path d="M9 3h6l1.2 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.8L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z" />
                  </svg>
                  Sacar más fotos
                </button>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario">
                  Subir archivos
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    disabled={agregando}
                    onChange={(e) => {
                      const elegidos = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      setNuevas(elegidos);
                    }}
                    className="sr-only"
                  />
                </label>

                {/*
                  Las elegidas no se suben solas: el envío es un acto aparte y
                  explícito. Subir al soltar el selector deja a alguien que se
                  equivocó de archivo sin ningún momento para arrepentirse, y
                  cada subida que hay que deshacer cuesta una fila y un archivo.
                */}
                {nuevas.length > 0 ? (
                  <button
                    type="submit"
                    disabled={agregando}
                    className="rounded-lg bg-primario px-4 py-2.5 text-sm font-semibold text-blanco disabled:opacity-60"
                  >
                    {agregando
                      ? "Subiendo..."
                      : `Agregar ${nuevas.length} ${nuevas.length === 1 ? "imagen" : "imágenes"}`}
                  </button>
                ) : null}

                <p className="self-center text-xs text-gris-500">
                  {agregando
                    ? "Subiendo..."
                    : nuevas.length > 0
                      ? "Elegidas, todavía sin subir."
                      : `Caben ${espacio} ${espacio === 1 ? "imagen más" : "imágenes más"}.`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gris-600">
                Llegaste al máximo de {MAXIMO} imágenes. Quita alguna para cambiarla.
              </p>
            )}
          </form>

          <Mensaje estado={estadoAgregar} />
        </>
      ) : null}
    </section>
  );
}
