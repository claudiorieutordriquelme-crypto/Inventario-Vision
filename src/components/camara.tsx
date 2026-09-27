"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  Captura desde la cámara del dispositivo.

  POR QUÉ NO BASTA CON capture="environment" EN EL INPUT. Ese atributo abre la
  cámara nativa del teléfono, saca la foto y la entrega: no hay previsualización
  dentro de la aplicación, no se puede repetir la toma sin volver a empezar, y
  en un computador no hace absolutamente nada. Para una herramienta que se usa
  parado en una bodega, poder mirar la foto y repetirla antes de gastar un
  análisis es la diferencia entre una toma y cuatro.

  Acá la cámara vive dentro de la página: se ve en vivo, se captura, se revisa y
  se repite si salió movida.

  TRES COSAS QUE HAY QUE RESPETAR AL TOCAR ESTO:

  1. EL STREAM SE APAGA SIEMPRE. Si no se llama a stop() en cada pista, la luz
     de la cámara queda encendida después de cerrar el visor, y eso la gente lo
     nota y desconfía. Se apaga al capturar, al cancelar y al desmontar.
  2. playsInline y muted NO SON OPCIONALES. Sin playsInline, Safari en iPhone
     se lleva el video a pantalla completa y tapa la interfaz. Sin muted,
     algunos navegadores no dejan reproducir sin interacción.
  3. LA IMAGEN SE REDUCE ANTES DE SUBIRLA. Un teléfono moderno saca fotos de 4
     a 8 MB y 4000 píxeles de ancho. Para identificar un producto no hace falta
     nada de eso: a 1600 píxeles se reconoce igual. Reducirla ahorra subida en
     una bodega con mala señal, y ahorra plata, porque el costo del análisis
     sube con el tamaño de la imagen.
*/

const LADO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.85;

type Estado =
  | { fase: "apagada" }
  | { fase: "pidiendo" }
  | { fase: "viendo" }
  | { fase: "error"; mensaje: string };

export function Camara({
  onCaptura,
  alCancelar,
}: {
  /** Recibe la foto ya reducida, lista para el formulario. */
  onCaptura: (archivo: File) => void;
  alCancelar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "apagada" });
  const [capturando, setCapturando] = useState(false);

  const apagar = useCallback(() => {
    if (stream.current) {
      for (const pista of stream.current.getTracks()) pista.stop();
      stream.current = null;
    }
  }, []);

  /* Se apaga al desmontar, pase lo que pase. */
  useEffect(() => () => apagar(), [apagar]);

  const encender = useCallback(async () => {
    setEstado({ fase: "pidiendo" });

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setEstado({
        fase: "error",
        mensaje:
          "Este navegador no permite usar la cámara desde la página. Sube la foto como archivo.",
      });
      return;
    }

    try {
      /*
        facingMode environment pide la cámara trasera, que es la que sirve para
        fotografiar algo que está sobre una mesa. Va como preferencia y no como
        exigencia: en un computador con una sola cámara, exigirla haría fallar
        la petición entera en vez de usar la que hay.
      */
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {
          /* Algunos navegadores rechazan play() sin gesto; el atributo autoPlay
             ya lo cubre y el visor igual se ve. */
        });
      }
      setEstado({ fase: "viendo" });
    } catch (e) {
      /* Cada motivo se resuelve distinto, así que cada uno lleva su mensaje. */
      const nombre = e instanceof DOMException ? e.name : "";
      const mensaje =
        nombre === "NotAllowedError"
          ? "No diste permiso para usar la cámara. Puedes permitirlo desde el candado de la barra de direcciones, o subir la foto como archivo."
          : nombre === "NotFoundError"
            ? "No encontré ninguna cámara en este dispositivo. Sube la foto como archivo."
            : nombre === "NotReadableError"
              ? "La cámara está siendo usada por otra aplicación. Ciérrala y vuelve a intentar."
              : "No pude abrir la cámara. Sube la foto como archivo.";
      setEstado({ fase: "error", mensaje });
    }
  }, []);

  const capturar = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setCapturando(true);

    /*
      Se dibuja el cuadro en un lienzo reducido. El lado mayor se lleva a
      LADO_MAXIMO conservando la proporción; si ya es más chico, no se agranda,
      porque estirar una foto no agrega información y sí agrega peso.
    */
    const escala = Math.min(1, LADO_MAXIMO / Math.max(v.videoWidth, v.videoHeight));
    const ancho = Math.round(v.videoWidth * escala);
    const alto = Math.round(v.videoHeight * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) {
      setCapturando(false);
      setEstado({ fase: "error", mensaje: "No pude procesar la imagen. Sube la foto como archivo." });
      return;
    }
    ctx.drawImage(v, 0, 0, ancho, alto);

    lienzo.toBlob(
      (blob) => {
        setCapturando(false);
        if (!blob) {
          setEstado({
            fase: "error",
            mensaje: "No pude guardar la foto. Intenta de nuevo o súbela como archivo.",
          });
          return;
        }
        /* El nombre lleva la marca de tiempo para que dos capturas seguidas no
           se llamen igual en el selector de archivos del navegador. */
        const archivo = new File([blob], `camara-${Date.now()}.jpg`, { type: "image/jpeg" });
        apagar();
        setEstado({ fase: "apagada" });
        onCaptura(archivo);
      },
      "image/jpeg",
      CALIDAD_JPEG,
    );
  }, [apagar, onCaptura]);

  const cancelar = useCallback(() => {
    apagar();
    setEstado({ fase: "apagada" });
    alCancelar();
  }, [apagar, alCancelar]);

  if (estado.fase === "apagada") {
    return (
      <button
        type="button"
        onClick={encender}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-gris-300 bg-blanco px-5 py-4 text-base font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario sm:w-auto"
      >
        <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden="true">
          <path d="M9 3h6l1.2 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.8L9 3zm3 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z" />
        </svg>
        Usar la cámara
      </button>
    );
  }

  if (estado.fase === "error") {
    return (
      <div className="flex overflow-hidden rounded-xl border border-gris-200">
        <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
        <div className="min-w-0 flex-1 p-4">
          <p className="text-sm font-bold text-gris-900">No pude usar la cámara</p>
          <p className="mt-1.5 text-sm text-gris-600">{estado.mensaje}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={encender}
              className="rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={cancelar}
              className="rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gris-200 bg-negro">
      <div className="relative">
        {/*
          playsInline evita que Safari en iPhone se lleve el video a pantalla
          completa. muted porque varios navegadores no dejan reproducir con
          audio sin un gesto explícito, y acá no hay audio que reproducir.
        */}
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className="block max-h-[60vh] w-full bg-negro object-contain"
        />

        {estado.fase === "pidiendo" ? (
          <p
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-blanco"
          >
            Pidiendo permiso para usar la cámara...
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gris-800 p-4">
        <p className="text-xs text-gris-300">
          Encuadra los productos y apunta de frente. La foto se reduce antes de
          subirla.
        </p>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={cancelar}
            className="rounded-lg border border-gris-600 px-4 py-2.5 text-sm font-semibold text-gris-200 transition-colors hover:border-marca hover:text-marca"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={capturar}
            disabled={estado.fase !== "viendo" || capturando}
            className="inline-flex items-center gap-2 rounded-lg bg-marca px-5 py-2.5 text-sm font-bold text-negro transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="size-4 shrink-0 fill-current" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
            </svg>
            {capturando ? "Capturando..." : "Tomar foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
