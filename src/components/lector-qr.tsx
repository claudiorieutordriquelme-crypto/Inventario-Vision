"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";

/*
  Lee el código QR de una etiqueta con la cámara.

  ── POR QUÉ jsQR Y NO LA API NATIVA DEL NAVEGADOR ──────────────────────────

  Existe BarcodeDetector, que delega la detección al sistema operativo y es más
  rápida. No está en Safari de iPhone. Escribir los dos caminos significa
  mantener dos, y que el que menos se usa en el escritorio de quien programa
  sea justo el que corre en el teléfono del mostrador: el camino que falla es
  el que nadie prueba.

  Con jsQR hay un solo camino, igual en todas partes. El costo es que la
  detección corre en JavaScript, y por eso todo lo de abajo está escrito para
  que no ahogue un teléfono modesto.

  ── LAS TRES COSAS QUE LO HACEN RÁPIDO ─────────────────────────────────────

  1. SE ANALIZA UN CUADRO REDUCIDO. El video llega en 1280 de ancho y se dibuja
     en un lienzo de 400: un QR de etiqueta se lee igual, y son diez veces menos
     píxeles que recorrer.
  2. SE ANALIZA SOLO EL CENTRO. Lo que importa está dentro del marco que ve la
     persona; el resto de la imagen es la mesa.
  3. requestAnimationFrame CON SALTO. Analizar los sesenta cuadros por segundo
     no sirve de nada: nadie mueve la etiqueta tan rápido. Se analiza uno de
     cada tres, y entre medio el teléfono descansa.

  ── EL STREAM SE APAGA SIEMPRE ─────────────────────────────────────────────

  Igual que en la cámara de captura: si no se detienen las pistas, la luz queda
  encendida después de cerrar y la gente lo nota y desconfía.
*/

const LADO_ANALISIS = 400;
/* Uno de cada tres cuadros. Suficiente para que se sienta instantáneo. */
const SALTO_CUADROS = 3;

type Estado =
  | { fase: "pidiendo" }
  | { fase: "buscando" }
  | { fase: "error"; mensaje: string };

export function LectorQr({
  alLeer,
  alCerrar,
}: {
  /** Recibe el texto crudo del código. Quien llama decide qué significa. */
  alLeer: (texto: string) => void;
  alCerrar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const lienzo = useRef<HTMLCanvasElement | null>(null);
  const animacion = useRef(0);
  const cuadro = useRef(0);
  /* Para no disparar la misma lectura dos veces mientras la etiqueta sigue
     delante de la cámara. */
  const ultimo = useRef<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "pidiendo" });

  const apagar = useCallback(() => {
    cancelAnimationFrame(animacion.current);
    if (stream.current) {
      for (const pista of stream.current.getTracks()) pista.stop();
      stream.current = null;
    }
  }, []);

  useEffect(() => () => apagar(), [apagar]);

  /* El fondo no se desplaza mientras el visor está abierto. Sin esto, en un
     teléfono el gesto de acercarse arrastra la página de atrás. */
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    let vivo = true;

    const buscar = () => {
      animacion.current = requestAnimationFrame(buscar);
      if (!vivo) return;

      cuadro.current = (cuadro.current + 1) % SALTO_CUADROS;
      if (cuadro.current !== 0) return;

      const v = video.current;
      if (!v || v.readyState < 2 || !v.videoWidth) return;

      if (!lienzo.current) lienzo.current = document.createElement("canvas");
      const c = lienzo.current;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      /* El recorte central, llevado al tamaño de análisis. */
      const lado = Math.min(v.videoWidth, v.videoHeight);
      const sx = (v.videoWidth - lado) / 2;
      const sy = (v.videoHeight - lado) / 2;

      c.width = LADO_ANALISIS;
      c.height = LADO_ANALISIS;
      ctx.drawImage(v, sx, sy, lado, lado, 0, 0, LADO_ANALISIS, LADO_ANALISIS);

      let datos: ImageData;
      try {
        datos = ctx.getImageData(0, 0, LADO_ANALISIS, LADO_ANALISIS);
      } catch {
        return;
      }

      const codigo = jsQR(datos.data, datos.width, datos.height, {
        /* La etiqueta se imprime en negro sobre blanco. Decírselo evita que
           pruebe también el inverso en cada cuadro. */
        inversionAttempts: "dontInvert",
      });

      if (codigo?.data && codigo.data !== ultimo.current) {
        ultimo.current = codigo.data;
        /* Vibración corta: en un mostrador con ruido, es la única confirmación
           que se nota sin mirar la pantalla. Donde no existe, no pasa nada. */
        navigator.vibrate?.(60);
        alLeer(codigo.data);
      }
    };

    const encender = async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setEstado({
          fase: "error",
          mensaje: "Este navegador no permite usar la cámara. Busca el producto por nombre.",
        });
        return;
      }

      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            /* Más resolución que en la captura: un QR chico impreso necesita
               píxeles para que los módulos se distingan. */
            width: { ideal: 1280 },
            height: { ideal: 1280 },
          },
          audio: false,
        });

        if (!vivo) {
          for (const pista of s.getTracks()) pista.stop();
          return;
        }

        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {
            /* autoPlay lo cubre; algunos navegadores rechazan play() sin gesto. */
          });
        }
        setEstado({ fase: "buscando" });
        animacion.current = requestAnimationFrame(buscar);
      } catch (e) {
        const nombre = e instanceof DOMException ? e.name : "";
        setEstado({
          fase: "error",
          mensaje:
            nombre === "NotAllowedError"
              ? "No diste permiso para usar la cámara. Puedes permitirlo desde el candado de la barra de direcciones."
              : nombre === "NotFoundError"
                ? "No encontré ninguna cámara en este dispositivo."
                : nombre === "NotReadableError"
                  ? "La cámara está siendo usada por otra aplicación."
                  : "No pude abrir la cámara. Busca el producto por nombre.",
        });
      }
    };

    void encender();

    return () => {
      vivo = false;
      apagar();
    };
  }, [alLeer, apagar]);

  const cerrar = () => {
    apagar();
    alCerrar();
  };

  if (estado.fase === "error") {
    return (
      <div className="flex overflow-hidden rounded-xl border border-gris-200">
        <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
        <div className="min-w-0 flex-1 p-4">
          <p className="text-sm font-bold text-gris-900">No pude usar la cámara</p>
          <p className="mt-1.5 text-sm text-gris-600">{estado.mensaje}</p>
          <button
            type="button"
            onClick={cerrar}
            className="mt-3 rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Escanear código"
      className="sobre-negro fixed inset-0 z-50 flex flex-col bg-negro"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={cerrar}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-gris-200 hover:text-blanco"
        >
          Cerrar
        </button>
        <p className="text-sm font-bold text-blanco">Escanear etiqueta</p>
        {/* Espaciador para que el título quede centrado de verdad. */}
        <span className="w-16" aria-hidden="true" />
      </div>

      <div className="relative min-h-0 flex-1">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
        />

        {/* El marco dice dónde poner la etiqueta, y coincide con la zona que de
            verdad se analiza: un marco decorativo más grande que el área real
            haría que alguien encuadre bien y no lea nada. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-10"
        >
          <div className="relative aspect-square w-full max-w-xs">
            <span className="absolute top-0 left-0 size-10 rounded-tl-lg border-t-4 border-l-4 border-marca" />
            <span className="absolute top-0 right-0 size-10 rounded-tr-lg border-t-4 border-r-4 border-marca" />
            <span className="absolute bottom-0 left-0 size-10 rounded-bl-lg border-b-4 border-l-4 border-marca" />
            <span className="absolute right-0 bottom-0 size-10 rounded-br-lg border-r-4 border-b-4 border-marca" />
          </div>
        </div>

        <p
          aria-live="polite"
          className="absolute inset-x-4 bottom-6 text-center text-sm font-semibold text-blanco"
        >
          {estado.fase === "pidiendo"
            ? "Abriendo la cámara..."
            : "Apunta al código de la etiqueta"}
        </p>
      </div>
    </div>
  );
}
