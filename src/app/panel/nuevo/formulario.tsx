"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camara } from "@/components/camara";
import { analizarYCrear, type EstadoAccion } from "../acciones";

/*
  Carga de las fotos de UNA pieza: dos vías, cámara y archivo.

  TRES FOTOS COMO MÍNIMO, Y ES UNA REGLA DEL NEGOCIO, no una preferencia de
  interfaz. Una sola foto no alcanza para vender algo usado: no muestra el
  reverso, ni el estado real, ni la escala. El botón de enviar está apagado
  hasta que haya tres, y dice cuántas faltan en vez de quedarse mudo.

  LAS FOTOS SON DE LA MISMA PIEZA. El análisis cataloga lo que está al centro
  del encuadre e ignora el fondo, así que acá no se juntan productos distintos:
  se juntan ángulos del mismo. Eso es lo que el texto de la pantalla tiene que
  dejar claro antes de que alguien saque la primera.

  POR QUÉ DOS VÍAS Y NO UNA. Son dos situaciones distintas y ninguna reemplaza
  a la otra. La cámara es para cuando estás parado frente a la pieza, que es el
  caso para el que existe esta herramienta. El archivo es para cuando las fotos
  ya existen: te las mandaron por mensaje, las sacaste antes, o estás en un
  computador ordenando lo que alguien fotografió en la bodega.

  LOS ARCHIVOS SE PASAN AL INPUT CON DataTransfer. Un <input type="file"> no
  acepta que le asignen un valor por código, y es una protección deliberada del
  navegador: si se pudiera, una página podría subir archivos del usuario sin
  que se entere. Lo que sí se permite es armar una lista con DataTransfer y
  asignarla a .files. Es la única vía, y por eso está acá y no en algo más
  corto.

  Las vistas previas se arman con URL.createObjectURL, que apunta al archivo en
  memoria sin subirlo. Descubrir que una foto salió movida después de esperar
  el análisis es la forma más rápida de gastar plata dos veces.
*/

const MINIMO = 3;
const MAXIMO = 6;

type Foto = { archivo: File; url: string; id: string };

export function FormularioFoto({ analisisDisponible }: { analisisDisponible: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(analizarYCrear, {});
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [camara, setCamara] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  /*
    Cada createObjectURL retiene el archivo en memoria hasta que se revoca. Se
    revoca todo al desmontar, y cada una al quitarla de la lista.

    El ref espeja el estado porque la limpieza del desmontaje corre una sola
    vez: leer `fotos` ahí dentro vería la lista vacía del primer render y no
    revocaría nada.
  */
  const vivas = useRef<Foto[]>([]);
  useEffect(() => {
    vivas.current = fotos;
  }, [fotos]);
  useEffect(() => {
    return () => {
      for (const f of vivas.current) URL.revokeObjectURL(f.url);
    };
  }, []);

  /*
    El input oculto es lo que viaja en el envío. Se re-arma con cada cambio de
    la lista para que el orden en pantalla sea el orden que llega al servidor:
    la primera es la portada, y esa decisión la toma quien arrastra acá.
  */
  useEffect(() => {
    if (!entrada.current) return;
    const dt = new DataTransfer();
    for (const f of fotos) dt.items.add(f.archivo);
    entrada.current.files = dt.files;
  }, [fotos]);

  const agregar = (nuevos: File[]) => {
    setFotos((previas) => {
      const espacio = MAXIMO - previas.length;
      if (espacio <= 0) return previas;
      const admitidos = nuevos.slice(0, espacio).map((archivo) => ({
        archivo,
        url: URL.createObjectURL(archivo),
        id: `${archivo.name}-${archivo.lastModified}-${crypto.randomUUID()}`,
      }));
      return [...previas, ...admitidos];
    });
  };

  const quitar = (id: string) => {
    setFotos((previas) => {
      const fuera = previas.find((f) => f.id === id);
      if (fuera) URL.revokeObjectURL(fuera.url);
      return previas.filter((f) => f.id !== id);
    });
  };

  /* Reordenar con botones y no arrastrando: arrastrar en un teléfono compite
     con el gesto de desplazar la página, y acá se usa en un teléfono. */
  const mover = (desde: number, hacia: number) => {
    setFotos((previas) => {
      if (hacia < 0 || hacia >= previas.length) return previas;
      const copia = [...previas];
      const [sacada] = copia.splice(desde, 1);
      copia.splice(hacia, 0, sacada);
      return copia;
    });
  };

  const desdeArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    /* El input de selección es OTRO que el oculto del envío: este solo sirve
       para abrir el explorador, y se vacía para que elegir dos veces el mismo
       archivo vuelva a disparar el evento. */
    const elegidos = Array.from(e.target.files ?? []);
    e.target.value = "";
    agregar(elegidos);
  };

  const faltan = Math.max(0, MINIMO - fotos.length);
  const completo = fotos.length >= MINIMO;

  return (
    <form action={accion} className="space-y-5">
      {/* El que viaja. Sin onChange: lo llena el efecto de arriba. */}
      <input ref={entrada} type="file" name="fotos" multiple className="sr-only" tabIndex={-1} />

      {camara ? (
        <Camara
          onCaptura={(archivo) => agregar([archivo])}
          alCancelar={() => setCamara(false)}
          objetivo={MINIMO}
          yaCapturadas={fotos.length}
        />
      ) : null}

      <div className="rounded-xl border-2 border-dashed border-gris-300 p-5 sm:p-6">
        <p className="text-center text-base font-semibold text-gris-800">
          Fotos de la pieza
        </p>
        <p className="mx-auto mt-1 max-w-md text-center text-sm text-gris-600">
          Todas de la <strong>misma</strong> pieza: el frente, el reverso y un
          detalle. Se cataloga lo que quede al centro del encuadre; lo que salga
          de fondo se ignora.
        </p>

        {/* ── Galería ──────────────────────────────────────────────── */}
        {fotos.length > 0 ? (
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fotos.map((f, i) => (
              <li
                key={f.id}
                className="overflow-hidden rounded-lg border border-gris-200 bg-blanco"
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- blob local, no una URL remota que optimizar */}
                  <img
                    src={f.url}
                    alt={`Foto ${i + 1} de la pieza`}
                    className="block aspect-square w-full bg-gris-50 object-cover"
                  />
                  {/* La portada se rotula. Sin esto nadie sabe que la primera
                      es la que se va a ver en el listado y en el catálogo. */}
                  {i === 0 ? (
                    <span className="absolute top-2 left-2 rounded bg-marca px-2 py-0.5 text-xs font-bold tracking-wide text-negro uppercase">
                      Portada
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-1 border-t border-gris-200 px-2 py-1.5">
                  <div className="flex gap-0.5">
                    <button
                      type="button"
                      onClick={() => mover(i, i - 1)}
                      disabled={i === 0}
                      aria-label={`Mover la foto ${i + 1} hacia atrás`}
                      className="rounded px-2 py-1 text-sm font-bold text-gris-600 hover:text-primario disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, i + 1)}
                      disabled={i === fotos.length - 1}
                      aria-label={`Mover la foto ${i + 1} hacia adelante`}
                      className="rounded px-2 py-1 text-sm font-bold text-gris-600 hover:text-primario disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => quitar(f.id)}
                    className="rounded px-2 py-1 text-xs font-semibold text-gris-600 hover:text-acento"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {/* ── Vías de carga ────────────────────────────────────────── */}
        {fotos.length < MAXIMO ? (
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setCamara(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primario px-5 py-4 text-base font-semibold text-blanco transition-opacity hover:opacity-90"
            >
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden="true">
                <path d="M9 3h6l1.2 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.8L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z" />
              </svg>
              {fotos.length === 0 ? "Usar la cámara" : "Sacar otra"}
            </button>

            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-gris-300 bg-blanco px-5 py-4 text-base font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario">
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden="true">
                <path d="M12 3l5 5h-3v6h-4V8H7l5-5zM5 17h14v3H5v-3z" />
              </svg>
              Subir archivos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={desdeArchivo}
                className="sr-only"
              />
            </label>
          </div>
        ) : (
          <p className="mt-5 text-center text-sm font-semibold text-gris-700">
            Llegaste al máximo de {MAXIMO} fotos. Quita alguna para cambiarla.
          </p>
        )}

        <p className="mt-4 text-center text-xs text-gris-500">
          JPG, PNG o WebP, hasta 10 MB cada una. Mínimo {MINIMO}, máximo {MAXIMO}. Las
          tomadas con la cámara se reducen antes de subirse, para que la subida
          no se eternice con mala señal.
        </p>
      </div>

      {estado.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-acento px-4 py-3 text-sm font-medium text-gris-900"
        >
          <svg viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 fill-acento" aria-hidden="true">
            <circle cx="8" cy="8" r="7" />
            <rect x="7" y="4" width="2" height="5" rx="1" fill="var(--color-blanco)" />
            <rect x="7" y="10.5" width="2" height="2" rx="1" fill="var(--color-blanco)" />
          </svg>
          {estado.error}
        </p>
      ) : null}

      {/*
        La barra de acción se pega abajo en pantalla chica. Con la galería
        ocupando media pantalla en un teléfono, el botón de enviar quedaba
        fuera de vista y había que desplazar para encontrarlo.
      */}
      <div className="sticky bottom-0 -mx-4 border-t border-gris-200 bg-blanco/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={pendiente || !completo}
          className="w-full rounded-xl bg-primario px-5 py-4 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:py-3"
        >
          {pendiente
            ? "Analizando las fotos..."
            : analisisDisponible
              ? "Analizar y cargar"
              : "Cargar las fotos"}
        </button>

        {/*
          El estado se dice con palabras y con número. Un botón apagado sin
          explicación manda a adivinar qué falta, y lo que falta acá siempre se
          puede contar.
        */}
        <p aria-live="polite" className="mt-3 text-sm text-gris-600">
          {pendiente
            ? "Esto toma unos segundos. No cierres la pestaña: las fotos ya se subieron y el producto se va a crear igual aunque el análisis falle."
            : completo
              ? `${fotos.length} ${fotos.length === 1 ? "foto lista" : "fotos listas"}. La primera es la portada.`
              : fotos.length === 0
                ? `Saca o elige ${MINIMO} fotos de la pieza para continuar.`
                : `Llevas ${fotos.length} de ${MINIMO}. ${faltan === 1 ? "Falta 1 foto." : `Faltan ${faltan} fotos.`}`}
        </p>
      </div>
    </form>
  );
}
