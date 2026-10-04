"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  Visor de imágenes que se desliza hacia el lado.

  POR QUÉ SCROLL NATIVO CON SCROLL-SNAP Y NO UN CARRUSEL DE LIBRERÍA. El
  desplazamiento horizontal del navegador ya trae, gratis y bien hechos, todos
  los gestos que una implementación a mano hace mal: arrastrar con el dedo con
  la inercia que espera el sistema operativo, el trackpad de dos dedos, la
  rueda con shift, y el frenado al soltar. scroll-snap solo agrega que termine
  encuadrado. Reimplementar eso con eventos de puntero son trescientas líneas y
  un gesto que se siente raro en algún dispositivo.

  Y ADEMÁS FUNCIONA SIN JAVASCRIPT. Si algo falla al hidratar, las imágenes
  siguen estando y siguen deslizándose: lo único que se pierde son las flechas
  y el contador.

  LAS FLECHAS NO SON DECORACIÓN. En un computador con mouse no hay gesto de
  deslizar, y una barra de scroll horizontal fina es fácil de no ver. Son el
  único camino para quien no tiene pantalla táctil ni trackpad.
*/

export type ImagenCarrusel = { id: string; url: string | null; alt: string };

export function Carrusel({
  imagenes,
  className = "",
}: {
  imagenes: ImagenCarrusel[];
  className?: string;
}) {
  const pista = useRef<HTMLUListElement>(null);
  const [actual, setActual] = useState(0);

  /*
    Qué imagen se está mirando, deducida de la posición del scroll. Se escucha
    el scroll en vez de llevar la cuenta en los botones porque hay tres formas
    de moverse —dedo, trackpad y flechas— y solo el scroll las ve todas.
  */
  useEffect(() => {
    const el = pista.current;
    if (!el) return;

    let pendiente = 0;
    const alDesplazar = () => {
      /* requestAnimationFrame: el scroll dispara decenas de veces por segundo
         y recalcular en cada una es trabajo tirado. */
      cancelAnimationFrame(pendiente);
      pendiente = requestAnimationFrame(() => {
        const ancho = el.clientWidth;
        if (ancho > 0) setActual(Math.round(el.scrollLeft / ancho));
      });
    };

    el.addEventListener("scroll", alDesplazar, { passive: true });
    return () => {
      cancelAnimationFrame(pendiente);
      el.removeEventListener("scroll", alDesplazar);
    };
  }, []);

  const irA = useCallback((indice: number) => {
    const el = pista.current;
    if (!el) return;
    const destino = Math.max(0, Math.min(indice, el.children.length - 1));
    el.scrollTo({ left: destino * el.clientWidth, behavior: "smooth" });
  }, []);

  if (imagenes.length === 0) {
    return (
      <p className={`flex items-center justify-center rounded-lg border border-gris-200 bg-gris-50 p-8 text-sm text-gris-600 ${className}`}>
        Este producto no tiene imágenes.
      </p>
    );
  }

  const hayVarias = imagenes.length > 1;

  return (
    <div className={`relative ${className}`}>
      <ul
        ref={pista}
        /*
          tabIndex y las teclas: sin esto, quien navega con teclado no puede
          mover el carrusel. Con el contenedor enfocable, las flechas del
          teclado lo recorren igual que cualquier lista.
        */
        tabIndex={0}
        aria-label="Imágenes del producto"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            irA(actual + 1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            irA(actual - 1);
          }
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg border border-gris-200 bg-gris-50 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {imagenes.map((img) => (
          <li key={img.id} className="w-full shrink-0 snap-center">
            {img.url ? (
              /* eslint-disable-next-line @next/next/no-img-element -- URL firmada y efímera: el optimizador de Next la cachearía más allá de su vida útil */
              <img
                src={img.url}
                alt={img.alt}
                /* contain y no cover: recortar una pieza para que llene el
                   marco esconde justo lo que alguien vino a mirar. */
                className="mx-auto block max-h-[60vh] w-full object-contain"
                draggable={false}
              />
            ) : (
              <p className="flex h-64 items-center justify-center px-6 text-center text-sm text-gris-600">
                No pude preparar esta imagen.
              </p>
            )}
          </li>
        ))}
      </ul>

      {hayVarias ? (
        <>
          {/* Las flechas se ocultan en los extremos en vez de quedar
              deshabilitadas: un botón apagado en el borde invita a apretarlo
              para ver qué pasa. */}
          {actual > 0 ? (
            <button
              type="button"
              onClick={() => irA(actual - 1)}
              aria-label="Imagen anterior"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-negro/60 p-2 text-blanco backdrop-blur transition-colors hover:bg-negro/80"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
                <path d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
              </svg>
            </button>
          ) : null}

          {actual < imagenes.length - 1 ? (
            <button
              type="button"
              onClick={() => irA(actual + 1)}
              aria-label="Imagen siguiente"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-negro/60 p-2 text-blanco backdrop-blur transition-colors hover:bg-negro/80"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden="true">
                <path d="m8.6 16.6 1.4 1.4 6-6-6-6-1.4 1.4 4.6 4.6z" />
              </svg>
            </button>
          ) : null}

          {/*
            Contador con número además de los puntos. Con cuatro imágenes los
            puntos bastan; con ocho ya no se cuentan de un vistazo, y "3 de 8"
            siempre se lee.
          */}
          <p
            aria-live="polite"
            className="absolute top-2 right-2 rounded-full bg-negro/60 px-2.5 py-1 text-xs font-bold text-blanco backdrop-blur"
          >
            {actual + 1} de {imagenes.length}
          </p>

          <div className="mt-2 flex justify-center gap-1.5">
            {imagenes.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => irA(i)}
                aria-label={`Ir a la imagen ${i + 1}`}
                aria-current={i === actual ? "true" : undefined}
                /* Objetivo táctil de 24px aunque el punto se vea de 8: un
                   punto de 8 píxeles es imposible de apretar con el pulgar. */
                className="grid size-6 place-items-center"
              >
                <span
                  className={`block size-2 rounded-full transition-colors ${
                    i === actual ? "bg-primario" : "bg-gris-300"
                  }`}
                />
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
