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

  EL VISOR OCUPA LA PANTALLA COMPLETA, y es el cambio que más se nota al
  usarlo. Antes vivía dentro del formulario, en un rectángulo que compartía
  espacio con botones y texto: había que encuadrar mirando un recuadro chico
  mientras se sostenía el producto con la otra mano. Acá el video ocupa todo, el
  disparador queda abajo al centro donde llega el pulgar, y no hay nada más en
  pantalla que no sirva para sacar la foto.

  EL MARCO DEL CENTRO NO ES DECORACIÓN. El análisis mira el producto que está
  dentro de ese marco e ignora lo que haya detrás. Lo que se deja fuera no se
  cataloga, así que el marco es la instrucción: pon acá la pieza.

  SACA VARIAS SEGUIDAS SIN SALIR. Un producto necesita tres imágenes, y cerrar
  el visor, volver al formulario y reabrirlo tres veces es la forma más rápida
  de que alguien cargue una sola. La cámara se queda abierta, el contador dice
  en cuál va, y se cierra sola al llegar al objetivo.

  CINCO COSAS QUE HAY QUE RESPETAR AL TOCAR ESTO:

  1. EL STREAM SE APAGA SIEMPRE. Si no se llama a stop() en cada pista, la luz
     de la cámara queda encendida después de cerrar el visor, y eso la gente lo
     nota y desconfía. Se apaga al cerrar, al cambiar de cámara y al desmontar.
  2. playsInline y muted NO SON OPCIONALES. Sin playsInline, Safari en iPhone
     se lleva el video a pantalla completa y tapa la interfaz. Sin muted,
     algunos navegadores no dejan reproducir sin interacción.
  3. LA IMAGEN SE REDUCE ANTES DE SUBIRLA. Un teléfono moderno saca fotos de 4
     a 8 MB y 4000 píxeles de ancho. Para identificar un producto no hace falta
     nada de eso: a 1600 píxeles se reconoce igual. Reducirla ahorra subida en
     una bodega con mala señal, y ahorra plata, porque el costo del análisis
     sube con el tamaño de la imagen.
  4. EL BLOQUEO DEL SCROLL DEL FONDO SE REVIERTE. El visor fija el body; si se
     desmonta sin restaurarlo, la página queda trabada y parece rota.
  5. EL AVISO DE CALIDAD NO BLOQUEA. Mide y avisa; la decisión es de quien
     mira. Una medición heurística que impida guardar va a impedir, tarde o
     temprano, una foto perfectamente buena.
*/

const LADO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.85;

/*
  Umbrales del aviso de calidad. Son HEURÍSTICOS, calibrados a ojo sobre fotos
  de bodega y no derivados de nada: por eso avisan y no bloquean.

  LUZ es la luminancia media en 0-255. Bajo 45 la foto se ve como una mancha
  oscura y el modelo no distingue el producto del fondo.

  NITIDEZ es la varianza del laplaciano sobre una miniatura en grises, que es
  la medida clásica de enfoque: cuánto cambia el brillo entre píxeles vecinos.
  Una foto movida tiene bordes suaves y da varianza baja. Bajo 60 casi siempre
  está movida o desenfocada.
*/
const LUZ_MINIMA = 45;
const NITIDEZ_MINIMA = 60;
/* La miniatura sobre la que se mide. Más grande no mejora el diagnóstico y sí
   agrega trabajo en cada disparo. */
const LADO_ANALISIS = 160;

type Estado =
  | { fase: "apagada" }
  | { fase: "pidiendo" }
  | { fase: "viendo" }
  | { fase: "error"; mensaje: string };

type Aviso = { texto: string } | null;

/*
  Mide luz y nitidez de un cuadro ya dibujado.

  Se trabaja sobre una miniatura y en escala de grises: el color no aporta nada
  al enfoque, y hacerlo sobre la imagen completa costaría varios millones de
  operaciones por disparo en un teléfono.
*/
function mideCalidad(fuente: CanvasImageSource, ancho: number, alto: number): Aviso {
  const escala = Math.min(1, LADO_ANALISIS / Math.max(ancho, alto));
  const a = Math.max(8, Math.round(ancho * escala));
  const b = Math.max(8, Math.round(alto * escala));

  const mini = document.createElement("canvas");
  mini.width = a;
  mini.height = b;
  const ctx = mini.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(fuente, 0, 0, a, b);

  let datos: Uint8ClampedArray;
  try {
    datos = ctx.getImageData(0, 0, a, b).data;
  } catch {
    /* Un canvas contaminado no se puede leer. No es motivo para no capturar. */
    return null;
  }

  const grises = new Float32Array(a * b);
  let suma = 0;
  for (let i = 0; i < a * b; i++) {
    /* Luminancia perceptual Rec. 601: el ojo ve el verde mucho más que el azul,
       y un promedio plano haría pasar por clara una foto que no lo es. */
    const g = 0.299 * datos[i * 4] + 0.587 * datos[i * 4 + 1] + 0.114 * datos[i * 4 + 2];
    grises[i] = g;
    suma += g;
  }
  const luz = suma / (a * b);

  /* Laplaciano de 4 vecinos, y su varianza. */
  let sumaL = 0;
  let sumaL2 = 0;
  let n = 0;
  for (let y = 1; y < b - 1; y++) {
    for (let x = 1; x < a - 1; x++) {
      const i = y * a + x;
      const l = 4 * grises[i] - grises[i - 1] - grises[i + 1] - grises[i - a] - grises[i + a];
      sumaL += l;
      sumaL2 += l * l;
      n++;
    }
  }
  if (n === 0) return null;
  const media = sumaL / n;
  const nitidez = sumaL2 / n - media * media;

  /*
    Un solo aviso a la vez, el más grave. Dos avisos juntos se leen como ruido
    y hacen que no se lea ninguno; y una foto oscura casi siempre sale además
    movida, porque el sensor alarga la exposición.
  */
  if (luz < LUZ_MINIMA) {
    return { texto: "Quedó muy oscura. Acércate a una ventana o enciende una luz." };
  }
  if (nitidez < NITIDEZ_MINIMA) {
    return { texto: "Se ve movida. Apoya los codos y espera a que enfoque." };
  }
  return null;
}

export function Camara({
  onCaptura,
  alCancelar,
  objetivo,
  yaCapturadas = 0,
}: {
  /** Recibe cada foto ya reducida, lista para el formulario. */
  onCaptura: (archivo: File) => void;
  alCancelar: () => void;
  /** Cuántas se esperan en total. Sin esto, se cierra después de la primera. */
  objetivo?: number;
  /** Cuántas lleva el formulario antes de abrir el visor. */
  yaCapturadas?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>({ fase: "apagada" });
  const [capturando, setCapturando] = useState(false);
  const [trasera, setTrasera] = useState(true);
  const [tomadas, setTomadas] = useState(0);
  const [aviso, setAviso] = useState<Aviso>(null);

  /*
    EL PUNTO DE PARTIDA SE CONGELA AL MONTAR, y no es un detalle.

    Quien abre el visor lleva su propia cuenta y la actualiza con cada foto que
    recibe, así que yaCapturadas SUBE mientras el visor está abierto. Sumarlo
    al contador propio contaría cada foto dos veces: la primera captura diría
    "2 de 3" y el cierre automático se dispararía a la mitad. El visor se monta
    cuando se abre, así que el valor inicial es exactamente cuántas había
    antes de empezar.
  */
  const [base] = useState(yaCapturadas);

  const total = base + tomadas;
  const faltan = objetivo ? Math.max(0, objetivo - total) : 0;

  const apagar = useCallback(() => {
    if (stream.current) {
      for (const pista of stream.current.getTracks()) pista.stop();
      stream.current = null;
    }
  }, []);

  /* Se apaga al desmontar, pase lo que pase. */
  useEffect(() => () => apagar(), [apagar]);

  const encender = useCallback(async (haciaAtras: boolean) => {
    setEstado({ fase: "pidiendo" });
    setAviso(null);

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
        facingMode va como preferencia y no como exigencia: en un computador
        con una sola cámara, exigirla haría fallar la petición entera en vez de
        usar la que hay.
      */
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: haciaAtras ? "environment" : "user" },
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

  /*
    Mientras el visor está abierto, el fondo no se desplaza. Sin esto, en un
    teléfono el gesto de encuadrar arrastra la página de atrás y el visor se
    mueve solo. Se restaura siempre, incluso si el componente se desmonta de
    golpe.
  */
  useEffect(() => {
    if (estado.fase !== "viendo" && estado.fase !== "pidiendo") return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, [estado.fase]);

  const cambiarCamara = useCallback(() => {
    apagar();
    const siguiente = !trasera;
    setTrasera(siguiente);
    void encender(siguiente);
  }, [apagar, encender, trasera]);

  const cerrar = useCallback(() => {
    apagar();
    setEstado({ fase: "apagada" });
    setTomadas(0);
    setAviso(null);
    alCancelar();
  }, [apagar, alCancelar]);

  const capturar = useCallback(() => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    setCapturando(true);
    setAviso(null);

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
      setEstado({
        fase: "error",
        mensaje: "No pude procesar la imagen. Sube la foto como archivo.",
      });
      return;
    }
    ctx.drawImage(v, 0, 0, ancho, alto);

    /* Se mide sobre el lienzo ya dibujado, no sobre el video: es el cuadro
       exacto que se va a guardar. */
    const problema = mideCalidad(lienzo, ancho, alto);

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

        const siguientes = tomadas + 1;
        setTomadas(siguientes);
        /* La foto SE ENTREGA IGUAL cuando hay aviso. El aviso informa para que
           quien mira decida repetirla; descartarla por una medición heurística
           sería descartar, tarde o temprano, una foto buena. */
        onCaptura(archivo);
        setAviso(problema);

        /*
          Al completar el objetivo se cierra solo: seguir abierto después de la
          última invita a sacar una cuarta que nadie pidió.

          SALVO QUE LA ÚLTIMA HAYA SALIDO MAL. Cerrando de inmediato, el aviso
          de "quedó movida" se dibujaría y desaparecería en el mismo cuadro, y
          quien sacó la foto se enteraría del problema en la ficha, con la
          pieza ya guardada. Si hay aviso, el visor se queda abierto para poder
          repetirla ahí mismo.
        */
        if (objetivo && base + siguientes >= objetivo && !problema) {
          apagar();
          setEstado({ fase: "apagada" });
          setTomadas(0);
          alCancelar();
        }
      },
      "image/jpeg",
      CALIDAD_JPEG,
    );
  }, [apagar, alCancelar, base, objetivo, onCaptura, tomadas]);

  if (estado.fase === "apagada") {
    return (
      <button
        type="button"
        onClick={() => void encender(trasera)}
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
              onClick={() => void encender(trasera)}
              className="rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Reintentar
            </button>
            <button
              type="button"
              onClick={cerrar}
              className="rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*
    El visor. Fijo sobre todo lo demás y sobre fondo negro: es el único momento
    de la aplicación en que la pantalla tiene un solo trabajo.

    La clase sobre-negro cambia el color del anillo de foco, que en primario
    oscuro desaparecería contra el negro.
  */
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cámara"
      className="sobre-negro fixed inset-0 z-50 flex flex-col bg-negro"
    >
      {/* ── Barra superior ───────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={cerrar}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-gris-200 hover:text-blanco"
        >
          Cerrar
        </button>

        {/* El contador va arriba al centro, donde se mira sin bajar la vista
            del encuadre. Lleva número y no solo una barra: "2 de 3" se entiende
            de una, un indicador de progreso hay que interpretarlo. */}
        {objetivo ? (
          <p aria-live="polite" className="text-sm font-bold text-blanco">
            {total >= objetivo ? (
              "Listo"
            ) : (
              <>
                Foto {total + 1} de {objetivo}
                <span className="ml-2 font-semibold text-gris-300">
                  {faltan === 1 ? "falta 1" : `faltan ${faltan}`}
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="text-sm font-bold text-blanco">Cámara</p>
        )}

        <button
          type="button"
          onClick={cambiarCamara}
          aria-label="Cambiar de cámara"
          className="rounded-lg px-3 py-2 text-sm font-semibold text-gris-200 hover:text-blanco"
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
            <path d="M12 5V2L8 6l4 4V7a5 5 0 0 1 5 5h2a7 7 0 0 0-7-7zm0 12a5 5 0 0 1-5-5H5a7 7 0 0 0 7 7v3l4-4-4-4v3z" />
          </svg>
        </button>
      </div>

      {/* ── Visor ────────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        {/*
          playsInline evita que Safari en iPhone se lleve el video a pantalla
          completa. muted porque varios navegadores no dejan reproducir con
          audio sin un gesto explícito, y acá no hay audio que reproducir.

          object-contain y no object-cover: recortar el encuadre que la persona
          está viendo significa que la foto guardada no es la que vio.
        */}
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 size-full object-contain"
        />

        {/*
          Marco de encuadre. No recorta el archivo: la foto se guarda completa.
          Lo que marca es DÓNDE PONER LA PIEZA, porque el análisis cataloga lo
          que está al centro e ignora el fondo. Las esquinas en vez de un
          rectángulo completo dejan ver lo que hay detrás.
        */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center p-8"
        >
          <div className="relative aspect-square w-full max-w-sm">
            <span className="absolute top-0 left-0 size-10 rounded-tl-lg border-t-4 border-l-4 border-marca/80" />
            <span className="absolute top-0 right-0 size-10 rounded-tr-lg border-t-4 border-r-4 border-marca/80" />
            <span className="absolute bottom-0 left-0 size-10 rounded-bl-lg border-b-4 border-l-4 border-marca/80" />
            <span className="absolute right-0 bottom-0 size-10 rounded-br-lg border-r-4 border-b-4 border-marca/80" />
          </div>
        </div>

        {estado.fase === "pidiendo" ? (
          <p
            aria-live="polite"
            className="absolute inset-0 flex items-center justify-center text-base font-semibold text-blanco"
          >
            Abriendo la cámara...
          </p>
        ) : (
          <p className="pointer-events-none absolute inset-x-4 top-2 text-center text-xs font-semibold text-gris-300">
            Pon la pieza dentro del marco. Lo que quede fuera no se cataloga.
          </p>
        )}

        {/*
          El aviso de calidad flota sobre el visor, encima del disparador, que
          es donde está la vista justo después de disparar. Ámbar con texto
          negro: 10:1 medido. Lleva su palabra, no es solo un color.
        */}
        {aviso ? (
          <p
            role="status"
            className="absolute inset-x-4 bottom-4 rounded-lg bg-marca px-4 py-3 text-sm font-semibold text-negro"
          >
            {aviso.texto} La guardé igual: si no te convence, sácala de nuevo y
            borra la otra.
          </p>
        ) : null}
      </div>

      {/* ── Disparador ───────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-center px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {/*
          Redondo, grande y centrado abajo: es donde cae el pulgar sosteniendo
          el teléfono con una mano, que es como se usa esto con un producto en
          la otra. 80 píxeles de lado, bastante más que los 44 mínimos, porque
          se aprieta sin mirar.
        */}
        <button
          type="button"
          onClick={capturar}
          disabled={capturando || estado.fase !== "viendo"}
          aria-label="Sacar la foto"
          className="relative size-20 rounded-full border-4 border-blanco transition-transform active:scale-95 disabled:opacity-50"
        >
          <span className="absolute inset-1.5 rounded-full bg-blanco" />
        </button>
      </div>
    </div>
  );
}
