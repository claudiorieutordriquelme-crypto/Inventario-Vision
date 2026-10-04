/*
  Convierte una imagen en un vector de 256 números que describe cómo se ve.

  QUÉ HACE Y QUÉ NO HACE, porque la diferencia decide cómo se rotula en
  pantalla. Esto NO reconoce objetos: no sabe que algo es una taza. Mide cómo
  se ve la imagen — qué colores hay y dónde, y hacia dónde van sus bordes — y
  después se buscan las imágenes del inventario cuya medición se parece. Para
  un inventario de piezas distintas entre sí funciona bien: la taza celeste con
  asa se parece mucho más a su propia foto que a una muñeca. Para distinguir
  dos tazas blancas casi iguales, no sirve, y la pantalla lo dice.

  POR QUÉ ESTE CAMINO Y NO EMBEDDINGS DE UN MODELO. Un modelo de visión
  reconocería el objeto de verdad, pero significa mandar cada foto del
  inventario a un servicio externo, sumar otra credencial, y pagar por imagen.
  Esto corre en el navegador de quien busca, no sale de la máquina, cuesta cero
  y funciona desde el primer día. Si algún día hace falta más precisión, el
  cambio está acotado: se reemplaza esta función y se recalculan los vectores,
  que es justamente para lo que la tabla guarda el nombre del método.

  EL MISMO CÁLCULO SE USA PARA INDEXAR Y PARA BUSCAR. Si los dos lados no
  miden igual, las distancias no significan nada. Por eso vive en un solo
  archivo y lleva su versión en el nombre del método.
*/

export const METODO_DESCRIPTOR = "perceptual-v1-256";
export const DIMENSIONES = 256;

/* El lado al que se reduce antes de medir. 128 es suficiente: la forma general
   y la distribución de color sobreviven, y el cálculo baja de millones de
   píxeles a dieciséis mil. */
const LADO = 128;
/* Grilla de 4×4. Guardar dónde está cada color importa: una pieza azul arriba
   y blanca abajo es distinta de una blanca arriba y azul abajo, y un
   histograma global las daría idénticas. */
const CELDAS = 4;
const BINS_TONO = 8;
const BINS_ORIENTACION = 8;

/** RGB a tono y saturación, en 0..1. */
function aTonoSaturacion(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }

  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

/*
  Calcula el descriptor de una imagen ya dibujable.

  Recibe cualquier cosa que el canvas sepa dibujar: un <img> cargado, un
  <video>, un ImageBitmap. Devuelve null si el navegador no deja leer los
  píxeles, que pasa cuando la imagen viene de otro origen sin CORS: en ese caso
  la búsqueda por foto simplemente no está disponible para esa imagen, y eso es
  mejor que un vector de ceros que se parecería a todo.
*/
export function calculaDescriptor(fuente: CanvasImageSource): number[] | null {
  const lienzo = document.createElement("canvas");
  lienzo.width = LADO;
  lienzo.height = LADO;
  const ctx = lienzo.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  /* Se deforma a cuadrado a propósito, sin recortar: recortar perdería los
     bordes de la pieza, que es justo donde está la forma. La deformación es la
     misma al indexar y al buscar, así que no introduce diferencia. */
  ctx.drawImage(fuente, 0, 0, LADO, LADO);

  let datos: Uint8ClampedArray;
  try {
    datos = ctx.getImageData(0, 0, LADO, LADO).data;
  } catch {
    return null;
  }

  /* Escala de grises aparte, para los gradientes. */
  const gris = new Float32Array(LADO * LADO);
  for (let i = 0; i < LADO * LADO; i++) {
    gris[i] =
      0.299 * datos[i * 4] + 0.587 * datos[i * 4 + 1] + 0.114 * datos[i * 4 + 2];
  }

  const vector = new Float32Array(DIMENSIONES);
  const ladoCelda = LADO / CELDAS;
  const porCelda = BINS_TONO + BINS_ORIENTACION;

  for (let cy = 0; cy < CELDAS; cy++) {
    for (let cx = 0; cx < CELDAS; cx++) {
      const base = (cy * CELDAS + cx) * porCelda;

      for (let y = cy * ladoCelda; y < (cy + 1) * ladoCelda; y++) {
        for (let x = cx * ladoCelda; x < (cx + 1) * ladoCelda; x++) {
          const i = y * LADO + x;

          /* ── Color ──────────────────────────────────────────────── */
          const { h, s, v } = aTonoSaturacion(
            datos[i * 4],
            datos[i * 4 + 1],
            datos[i * 4 + 2],
          );
          /*
            El voto se pondera por saturación y brillo. Un píxel gris no tiene
            tono significativo: su matiz es ruido de redondeo, y dejarlo votar
            con el mismo peso que un azul saturado llenaría el histograma de
            basura.
          */
          const peso = s * v;
          if (peso > 0.05) {
            const bin = Math.min(BINS_TONO - 1, Math.floor(h * BINS_TONO));
            vector[base + bin] += peso;
          }

          /* ── Bordes ─────────────────────────────────────────────── */
          if (x > 0 && x < LADO - 1 && y > 0 && y < LADO - 1) {
            const gx = gris[i + 1] - gris[i - 1];
            const gy = gris[i + LADO] - gris[i - LADO];
            const magnitud = Math.sqrt(gx * gx + gy * gy);
            if (magnitud > 8) {
              /*
                Orientación sin signo, en media vuelta: un borde claro-a-oscuro
                y el mismo borde al revés son el mismo borde. Con la vuelta
                completa, la misma pieza fotografiada contra un fondo más claro
                daría un descriptor distinto.
              */
              let angulo = Math.atan2(gy, gx);
              if (angulo < 0) angulo += Math.PI;
              const bin = Math.min(
                BINS_ORIENTACION - 1,
                Math.floor((angulo / Math.PI) * BINS_ORIENTACION),
              );
              vector[base + BINS_TONO + bin] += magnitud;
            }
          }
        }
      }
    }
  }

  /*
    Normalización L2. Es lo que hace comparables dos fotos de la misma pieza
    sacadas con distinta luz: sin esto, la más iluminada tendría magnitudes más
    grandes en todo y la distancia coseno, que es la que usa el índice, se
    calcularía sobre vectores de largos distintos.
  */
  let norma = 0;
  for (let i = 0; i < DIMENSIONES; i++) norma += vector[i] * vector[i];
  norma = Math.sqrt(norma);

  /* Una imagen plana de un solo color da norma cero. No se puede normalizar y
     tampoco describe nada: mejor decir que no hay descriptor. */
  if (norma === 0) return null;

  const salida = new Array<number>(DIMENSIONES);
  for (let i = 0; i < DIMENSIONES; i++) {
    /* Seis decimales: más precisión no cambia ningún resultado y engorda cada
       fila del vector sin motivo. */
    salida[i] = Number((vector[i] / norma).toFixed(6));
  }
  return salida;
}

/** Calcula el descriptor de un archivo de imagen, cargándolo primero. */
export function descriptorDeArchivo(archivo: File): Promise<number[] | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const d = calculaDescriptor(img);
      URL.revokeObjectURL(url);
      resolver(d);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolver(null);
    };
    img.src = url;
  });
}

/**
 * Calcula el descriptor de una imagen remota ya firmada.
 *
 * crossOrigin anónimo es obligatorio: sin él el lienzo queda contaminado y
 * getImageData lanza, que es el caso que calculaDescriptor devuelve como null.
 */
export function descriptorDeUrl(url: string): Promise<number[] | null> {
  return new Promise((resolver) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolver(calculaDescriptor(img));
    img.onerror = () => resolver(null);
    img.src = url;
  });
}

/** El formato que espera pgvector: [0.1,0.2,...] */
export function aTextoVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
