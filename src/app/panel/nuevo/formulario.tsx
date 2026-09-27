"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Camara } from "@/components/camara";
import { analizarYCrear, type EstadoAccion } from "../acciones";

/*
  Carga de una foto: dos vías, cámara y archivo.

  POR QUÉ DOS Y NO UNA. Son dos situaciones distintas y ninguna reemplaza a la
  otra. La cámara es para cuando estás parado frente a los productos, que es el
  caso para el que existe esta herramienta. El archivo es para cuando la foto ya
  existe: te la mandaron por mensaje, la sacaste antes, o estás en un computador
  ordenando lo que alguien fotografió en la bodega.

  EL ARCHIVO CAPTURADO SE PASA AL FORMULARIO CON DataTransfer. Un
  <input type="file"> no acepta que le asignen un valor por código, y es una
  protección deliberada del navegador: si se pudiera, una página podría subir
  archivos del usuario sin que se entere. Lo que sí se permite es armar una
  lista con DataTransfer y asignarla a .files. Es la única vía, y por eso está
  acá y no en algo más corto.

  La vista previa se arma con URL.createObjectURL, que apunta al archivo en
  memoria sin subirlo. Descubrir que la foto salió movida después de esperar el
  análisis es la forma más rápida de gastar plata dos veces.
*/

type Via = "elegir" | "camara";

export function FormularioFoto({ analisisDisponible }: { analisisDisponible: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(analizarYCrear, {});
  const [via, setVia] = useState<Via>("elegir");
  const [vista, setVista] = useState<string | null>(null);
  const [descripcion, setDescripcion] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const urlPrevia = useRef<string | null>(null);

  /* Cada createObjectURL retiene el archivo en memoria hasta que se revoca. */
  useEffect(() => {
    return () => {
      if (urlPrevia.current) URL.revokeObjectURL(urlPrevia.current);
    };
  }, []);

  const mostrar = (archivo: File) => {
    if (urlPrevia.current) URL.revokeObjectURL(urlPrevia.current);
    const url = URL.createObjectURL(archivo);
    urlPrevia.current = url;
    setVista(url);
    setDescripcion(`${archivo.name} · ${(archivo.size / 1024 / 1024).toFixed(1)} MB`);
  };

  const desdeCamara = (archivo: File) => {
    const dt = new DataTransfer();
    dt.items.add(archivo);
    if (entrada.current) entrada.current.files = dt.files;
    mostrar(archivo);
    setVia("elegir");
  };

  const desdeArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) {
      if (urlPrevia.current) URL.revokeObjectURL(urlPrevia.current);
      urlPrevia.current = null;
      setVista(null);
      setDescripcion(null);
      return;
    }
    mostrar(archivo);
  };

  const limpiar = () => {
    if (urlPrevia.current) URL.revokeObjectURL(urlPrevia.current);
    urlPrevia.current = null;
    if (entrada.current) entrada.current.value = "";
    setVista(null);
    setDescripcion(null);
  };

  return (
    <form action={accion} className="space-y-5">
      {/* El input real queda oculto: se opera con los dos botones grandes, que
          son objetivos táctiles reales y dicen lo que hacen. */}
      <input
        ref={entrada}
        type="file"
        name="foto"
        accept="image/jpeg,image/png,image/webp"
        required
        onChange={desdeArchivo}
        className="sr-only"
        aria-label="Foto del producto"
      />

      {via === "camara" ? (
        <Camara onCaptura={desdeCamara} alCancelar={() => setVia("elegir")} />
      ) : vista ? (
        <figure className="overflow-hidden rounded-xl border border-gris-200">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob local, no una URL remota que optimizar */}
          <img
            src={vista}
            alt="Vista previa de la foto"
            className="block max-h-96 w-full bg-gris-50 object-contain"
          />
          <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-gris-200 px-4 py-3">
            <span className="min-w-0 truncate text-xs text-gris-500">{descripcion}</span>
            <div className="flex shrink-0 gap-4">
              <button
                type="button"
                onClick={() => {
                  limpiar();
                  setVia("camara");
                }}
                className="text-sm font-semibold text-primario hover:underline"
              >
                Repetir foto
              </button>
              <button
                type="button"
                onClick={limpiar}
                className="text-sm font-semibold text-gris-600 hover:text-gris-900"
              >
                Quitar
              </button>
            </div>
          </figcaption>
        </figure>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-gris-300 p-6 sm:p-8">
          <p className="text-center text-base font-semibold text-gris-800">
            ¿Cómo quieres cargar la foto?
          </p>
          <p className="mx-auto mt-1 max-w-sm text-center text-sm text-gris-600">
            Pueden salir varios productos distintos en la misma imagen: apoya las
            cosas en una mesa y sácales una sola foto.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setVia("camara")}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primario px-5 py-4 text-base font-semibold text-blanco transition-opacity hover:opacity-90"
            >
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden="true">
                <path d="M9 3h6l1.2 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.8L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z" />
              </svg>
              Usar la cámara
            </button>

            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-gris-300 bg-blanco px-5 py-4 text-base font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
            >
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden="true">
                <path d="M12 3l5 5h-3v6h-4V8H7l5-5zM5 17h14v3H5v-3z" />
              </svg>
              Subir un archivo
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-gris-500">
            JPG, PNG o WebP, hasta 10 MB. Las fotos tomadas con la cámara se
            reducen antes de subirse, para que la subida no se eternice con mala
            señal.
          </p>
        </div>
      )}

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
        La barra de acción se pega abajo en pantalla chica. Con la foto ocupando
        media pantalla en un teléfono, el botón de enviar quedaba fuera de vista
        y había que desplazar para encontrarlo.
      */}
      <div className="sticky bottom-0 -mx-4 border-t border-gris-200 bg-blanco/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={pendiente || !vista}
          className="w-full rounded-xl bg-primario px-5 py-4 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-50 sm:w-auto sm:py-3"
        >
          {pendiente
            ? "Analizando la foto..."
            : analisisDisponible
              ? "Analizar y cargar"
              : "Cargar la foto"}
        </button>

        {pendiente ? (
          <p aria-live="polite" className="mt-3 text-sm text-gris-600">
            Esto toma unos segundos. No cierres la pestaña: la foto ya se subió y
            los productos se van a crear igual aunque el análisis falle.
          </p>
        ) : !vista ? (
          <p className="mt-3 text-sm text-gris-500">Primero saca o elige una foto.</p>
        ) : null}
      </div>
    </form>
  );
}
