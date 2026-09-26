"use client";

import { useActionState, useRef, useState } from "react";
import { analizarYCrear, type EstadoAccion } from "../acciones";

/*
  Carga de una foto.

  capture="environment" en el input hace que en un teléfono se abra
  directamente la cámara trasera en vez del selector de archivos. Es la
  diferencia entre tres toques y uno cuando alguien está parado frente al
  producto.

  La vista previa se arma con URL.createObjectURL y no subiendo el archivo:
  mostrar la foto antes de mandarla evita el caso más común, que es descubrir
  que salió movida recién después de esperar el análisis.
*/
export function FormularioFoto({ analisisDisponible }: { analisisDisponible: boolean }) {
  const [estado, accion, pendiente] = useActionState<EstadoAccion, FormData>(analizarYCrear, {});
  const [vista, setVista] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const previa = useRef<string | null>(null);

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    /* Se libera la anterior: cada createObjectURL retiene el archivo en
       memoria hasta que se revoca. */
    if (previa.current) URL.revokeObjectURL(previa.current);
    if (!archivo) {
      previa.current = null;
      setVista(null);
      setNombreArchivo(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    previa.current = url;
    setVista(url);
    setNombreArchivo(archivo.name);
  };

  return (
    <form action={accion} className="space-y-5">
      <label className="block">
        <span className="text-sm font-semibold text-gris-800">
          Foto del producto<span className="text-gris-500"> *</span>
        </span>
        <input
          type="file"
          name="foto"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          required
          onChange={alElegir}
          className="mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 file:mr-3 file:rounded file:border-0 file:bg-primario file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blanco"
        />
        <span className="mt-1 block text-xs text-gris-500">
          JPG, PNG o WebP, hasta 10 MB. Una sola foto y un solo producto por
          vez: con varios productos distintos en la imagen, el análisis se
          confunde y lo dice.
        </span>
      </label>

      {vista ? (
        <figure className="rounded-lg border border-gris-200 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- es un blob local, no una URL remota que optimizar */}
          <img
            src={vista}
            alt="Vista previa de la foto elegida"
            className="mx-auto max-h-72 w-auto rounded"
          />
          <figcaption className="mt-2 text-center text-xs text-gris-500">
            {nombreArchivo}
          </figcaption>
        </figure>
      ) : null}

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

      <div className="border-t border-gris-200 pt-5">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pendiente
            ? "Analizando la foto..."
            : analisisDisponible
              ? "Analizar y cargar"
              : "Cargar la foto"}
        </button>

        {pendiente ? (
          <p aria-live="polite" className="mt-3 text-sm text-gris-600">
            Esto toma unos segundos. No cierres la pestaña: la foto ya se subió
            y el producto se va a crear igual aunque el análisis falle.
          </p>
        ) : null}
      </div>
    </form>
  );
}
