import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claveAnthropic } from "@/lib/env";

/*
  Análisis de una foto de inventario con Claude.

  UNA FOTO PUEDE TENER VARIOS PRODUCTOS DISTINTOS, y devolver todos es el punto
  de la herramienta: se llega a la bodega, se apoyan seis cosas en la mesa, una
  foto, seis productos cargados. Por eso la respuesta es una lista y no un
  objeto, aunque la mayoría de las veces tenga un solo elemento.

  LA DISTINCIÓN QUE MÁS IMPORTA, y que el prompt de abajo desarrolla: varios
  productos DISTINTOS son varias entradas de la lista; varias unidades del
  MISMO producto son una sola entrada con cantidad. Confundirlas rompe el
  inventario en las dos direcciones: doce entradas de un mismo tornillo, o un
  martillo y un alicate sumados como "2 unidades" de algo que no existe.

  QUÉ HACE Y QUÉ NO HACE, porque la diferencia decide cómo se etiqueta el
  resultado en pantalla:

  IDENTIFICA cada producto, lo clasifica en una de las categorías que existen
  en la base, escribe una descripción breve y ESTIMA un precio.

  NO CONSULTA LA WEB. El precio sale del conocimiento del modelo, que tiene
  fecha de corte, no de una búsqueda en retail chileno hoy. Es un punto de
  partida para que una persona lo corrija, no un dato de mercado. Toda la
  aplicación lo trata así: la columna se llama precio_estimado_clp, nunca
  sobrescribe lo que fija un humano, y la pantalla dice de dónde vino.

  Si algún día se quiere el precio real de mercado, el cambio es acotado:
  agregar la herramienta de servidor web_search a esta llamada y guardar las
  fuentes citadas junto al monto. Queda anotado acá para que no haya que
  reconstruir el razonamiento.
*/

export const MODELO = "claude-opus-5";

/*
  La versión del prompt se guarda con cada análisis. Cuando el prompt cambie,
  esta constante sube, y así se puede saber qué resultados vinieron de qué
  instrucciones. Sin esto, comparar la calidad entre dos épocas es imposible.
*/
export const VERSION_PROMPT = "2026-10-03.1-pieza-central";

/* Tarifa de claude-opus-5 por millón de tokens, para estimar el costo. */
const USD_POR_MTOK_ENTRADA = 5;
const USD_POR_MTOK_SALIDA = 25;

/*
  Tope de imágenes por análisis.

  Las fotos son del MISMO producto, de frente, de atrás y del detalle. Seis es
  más de lo que nadie saca de una pieza, y cada una suma tokens de entrada: el
  costo del análisis crece con la cantidad de imágenes, no con la cantidad de
  productos.
*/
export const MAXIMO_IMAGENES = 6;

const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type MimeImagen = (typeof MIME_PERMITIDOS)[number];

export function esMimeSoportado(mime: string): mime is MimeImagen {
  return (MIME_PERMITIDOS as readonly string[]).includes(mime);
}

/*
  Lo que se le pide al modelo por cada producto.

  Casi todo admite null a propósito. Un modelo obligado a rellenar un campo que
  no puede ver inventa, y un inventario con datos inventados es peor que uno
  incompleto: el incompleto se nota, el inventado no.
*/
const EsquemaProducto = z.object({
  nombre: z
    .string()
    .describe(
      "Nombre corto y concreto, como lo escribiría alguien de bodega. Marca y modelo si se leen en la foto. Máximo 80 caracteres.",
    ),
  descripcion: z
    .string()
    .describe(
      "Dos o tres frases: qué es, para qué sirve y cualquier característica visible que ayude a identificarlo entre varios parecidos.",
    ),
  categoria_codigo: z
    .string()
    .nullable()
    .describe(
      "El código EXACTO de una de las categorías ofrecidas, o null si ninguna corresponde o no estás seguro. No inventes códigos nuevos.",
    ),
  marca: z.string().nullable().describe("Marca si se lee en la foto. null si no se ve."),
  modelo: z.string().nullable().describe("Modelo si se lee en la foto. null si no se ve."),
  unidad: z
    .string()
    .describe("Unidad de medida: unidad, caja, par, metro, litro, kilo, juego, rollo."),
  cantidad_visible: z
    .number()
    .int()
    .nullable()
    .describe(
      "Cuántas unidades idénticas de ESTA MISMA pieza central se ven juntas. Casi siempre 1. null si no se puede contar con seguridad.",
    ),
  /*
    Atributos del rubro. Se piden acá porque las fotos son de UNA pieza y hay
    varias: con el frente, el reverso y el detalle se puede decir algo del
    estado y del material. Con una foto de seis cosas en una mesa, no.
  */
  estado_conservacion: z
    .enum(["nuevo", "como_nuevo", "buen_estado", "usado", "para_restaurar"])
    .nullable()
    .describe(
      "Estado visible de la pieza. null si las fotos no alcanzan para juzgarlo. No lo adivines por el tipo de objeto.",
    ),
  material: z
    .string()
    .nullable()
    .describe("Material principal si se reconoce: porcelana, roble, bronce, plástico. null si no."),
  epoca: z
    .string()
    .nullable()
    .describe(
      "Época aproximada en palabras, si el estilo la delata: 'años 50', 'mediados del siglo XX'. null si no tienes base.",
    ),
  precio_estimado_clp: z
    .number()
    .nullable()
    .describe(
      "Precio unitario estimado en pesos chilenos, de tu conocimiento y SIN consultar la web. null si no tienes base para estimarlo.",
    ),
  confianza: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Qué tan seguro estás de ESTA identificación, entre 0 y 1. Sé honesto: 0.3 en algo genérico es más útil que 0.9 falso.",
    ),
  advertencias: z
    .array(z.string())
    .describe(
      "Lo que la persona debería revisar de este producto: parcialmente tapado, fuera de foco, precio muy variable según marca. Lista vacía si no hay nada que advertir.",
    ),
});

const EsquemaAnalisis = z.object({
  producto: EsquemaProducto.nullable().describe(
    "La pieza que ocupa el centro de las fotos. null si no hay ninguna pieza identificable al centro.",
  ),
  observacion_general: z
    .string()
    .describe(
      "Una frase sobre las fotos: si están borrosas, mal iluminadas, si no se distingue cuál es la pieza central, o si en realidad no son fotos de un producto. Cadena vacía si no hay nada que decir.",
    ),
});

export type ProductoDetectado = z.infer<typeof EsquemaProducto>;
export type Analisis = z.infer<typeof EsquemaAnalisis>;

export type CategoriaOfrecida = { codigo: string; nombre: string; descripcion: string | null };

function instrucciones(categorias: CategoriaOfrecida[]): string {
  const lista = categorias
    .map((c) => `- ${c.codigo}: ${c.nombre}${c.descripcion ? ` — ${c.descripcion}` : ""}`)
    .join("\n");

  return `Eres el asistente de un sistema de control de inventario en Chile. Recibes varias fotos de UNA MISMA PIEZA y devuelves sus datos para darla de alta.

LA REGLA MÁS IMPORTANTE: SOLO LA PIEZA DEL CENTRO.

Las fotos las saca alguien que puso una pieza al centro del encuadre, a propósito, y apretó el disparador. Detrás hay una bodega, una mesa, un estante, una casa. TODO ESO ES FONDO Y SE IGNORA.

No catalogues la repisa donde está apoyada la pieza. No catalogues las cosas del estante de atrás. No catalogues la mano que la sostiene ni el mantel. Si al centro hay una taza y atrás se ven otras veinte, el producto es la taza del centro y las otras veinte no existen para ti.

Cómo reconocer cuál es: está al centro, está enfocada, y es lo que ocupa más superficie en primer plano. Si dudas entre dos, elige la que está más al centro y más nítida.

Si de verdad no hay ninguna pieza identificable al centro, devuelve producto en null y explícalo en observacion_general. Es una respuesta válida.

LAS FOTOS SON DE LA MISMA PIEZA, no de piezas distintas. Vienen el frente, el reverso, un detalle. Úsalas juntas: lo que no se ve en una puede verse en otra, y entre todas se arma una sola ficha. No devuelvas una ficha por foto.

cantidad_visible casi siempre es 1. Solo es mayor si al centro hay varias unidades IDÉNTICAS de la misma pieza, juntas y evidentemente en conjunto, como un juego de seis copas iguales.

CATEGORÍAS DISPONIBLES. Elige el código exacto de una de estas, o null:
${lista}

Si ninguna calza bien, devuelve null en categoria_codigo. No inventes códigos: un código que no está en esta lista deja el producto sin clasificar igual, y además obliga a alguien a descubrir por qué.

SOBRE EL PRECIO. No tienes acceso a internet en esta llamada, así que el precio es una estimación tuya para el mercado chileno, en pesos, por unidad y con IVA incluido, que es como se muestran los precios al público en Chile. Tres reglas:
- Si el producto es genérico y su precio varía mucho según marca, dilo en sus advertencias.
- Si no tienes base razonable para estimar, devuelve null. Es una respuesta válida y preferible a un número inventado.
- No presentes el precio como un dato de mercado actual. Alguien lo va a revisar.

SOBRE EL ESTADO, EL MATERIAL Y LA ÉPOCA. Son para piezas usadas, de menaje, antigüedades, muñecas y colección. Dilos solo si las fotos los muestran: una pieza fotografiada de lejos no permite juzgar su estado, y un "buen estado" inventado hace que alguien compre algo trizado. null es la respuesta correcta cuando no se ve.

SOBRE LA HONESTIDAD. Una foto borrosa, una pieza tapada a medias o un objeto que no logras identificar son situaciones normales. Cuando pasen, bájale a la confianza y escríbelo en advertencias. El sistema está hecho para que una persona revise y corrija; lo que no se puede corregir es un dato que parecía seguro y no lo era.

Escribe en español de Chile, sin adornos.`;
}

export type ResultadoAnalisis =
  | {
      ok: true;
      analisis: Analisis;
      /* Para la bitácora: lo que devolvió el modelo y lo que costó. */
      bruto: unknown;
      modelo: string;
      versionPrompt: string;
      tokensEntrada: number;
      tokensSalida: number;
      costoUsd: number;
      duracionMs: number;
    }
  | { ok: false; error: string; duracionMs: number };

export type ImagenParaAnalizar = { datos: Buffer; mime: MimeImagen };

/*
  Analiza varias fotos de UNA pieza y devuelve la ficha de la pieza central.

  POR QUÉ VARIAS IMÁGENES EN UNA SOLA LLAMADA, y no una llamada por foto. Son
  fotos del mismo objeto: el frente, el reverso, el detalle de la firma. Juntas
  describen una pieza; por separado producirían tres fichas distintas del mismo
  objeto, que es exactamente el problema que este cambio vino a resolver. Y
  además cuesta menos: un solo prompt de sistema en vez de tres.

  Las imágenes van en base64 dentro del mensaje y no por la Files API: se usan
  una sola vez, subirlas aparte sería un viaje más a la red por nada.

  effort en "low" no es ahorrar por ahorrar. Identificar un objeto y
  describirlo es una tarea de un solo paso; el esfuerzo alto se gasta en
  razonamiento que acá no cambia el resultado. Si la calidad no alcanza, este
  es el primer dial que hay que mover, y está en un solo lugar.
*/
export async function analizaImagen(
  imagenes: ImagenParaAnalizar[],
  categorias: CategoriaOfrecida[],
): Promise<ResultadoAnalisis> {
  const clave = claveAnthropic();
  const inicio = Date.now();

  if (!clave) {
    return {
      ok: false,
      error:
        "El análisis de fotos no está configurado: falta ANTHROPIC_API_KEY en el entorno. El resto del inventario funciona igual, y puedes cargar el producto a mano.",
      duracionMs: 0,
    };
  }

  if (imagenes.length === 0) {
    return { ok: false, error: "No hay ninguna foto que analizar.", duracionMs: 0 };
  }

  const client = new Anthropic({ apiKey: clave });
  /* El tope se aplica acá y no solo se pide en el prompt: es lo que garantiza
     que el costo de un análisis no pueda dispararse por una carga masiva. */
  const usadas = imagenes.slice(0, MAXIMO_IMAGENES);

  try {
    const respuesta = await client.messages.parse({
      model: MODELO,
      max_tokens: 4000,
      output_config: {
        format: zodOutputFormat(EsquemaAnalisis),
        effort: "low",
      },
      system: instrucciones(categorias),
      messages: [
        {
          role: "user",
          content: [
            ...usadas.map((img) => ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mime,
                data: img.datos.toString("base64"),
              },
            })),
            {
              type: "text",
              text:
                usadas.length === 1
                  ? "Identifica la pieza que está al centro de esta foto, ignorando el fondo, y devuelve sus datos para darla de alta en el inventario."
                  : `Estas ${usadas.length} fotos son de LA MISMA pieza, desde distintos ángulos. Identifica la pieza central, ignorando el fondo, y devuelve UNA sola ficha con sus datos.`,
            },
          ],
        },
      ],
    });

    const duracionMs = Date.now() - inicio;

    /*
      stop_reason se revisa ANTES de leer el contenido. Un rechazo por política
      llega con HTTP 200 y sin los datos, y leer parsed_output sin mirar esto
      daría un error de null que no explica nada.
    */
    if (respuesta.stop_reason === "refusal") {
      return {
        ok: false,
        error:
          "El modelo no quiso analizar esta imagen. Revisa que sea una foto de productos y vuelve a intentar, o carga los productos a mano.",
        duracionMs,
      };
    }

    /*
      Una respuesta cortada deja la ficha a medias. Se trata como error en vez
      de guardarla: media ficha parece una ficha completa y nadie la revisaría
      dos veces.
    */
    if (respuesta.stop_reason === "max_tokens") {
      return {
        ok: false,
        error: "La respuesta del análisis se cortó. Intenta de nuevo con menos fotos.",
        duracionMs,
      };
    }

    if (!respuesta.parsed_output) {
      return {
        ok: false,
        error:
          "El modelo respondió, pero no en el formato esperado. Intenta de nuevo o carga los productos a mano.",
        duracionMs,
      };
    }

    const analisis = respuesta.parsed_output;

    const tokensEntrada = respuesta.usage.input_tokens;
    const tokensSalida = respuesta.usage.output_tokens;

    return {
      ok: true,
      analisis,
      bruto: respuesta.content,
      modelo: MODELO,
      versionPrompt: VERSION_PROMPT,
      tokensEntrada,
      tokensSalida,
      costoUsd:
        (tokensEntrada / 1_000_000) * USD_POR_MTOK_ENTRADA +
        (tokensSalida / 1_000_000) * USD_POR_MTOK_SALIDA,
      duracionMs,
    };
  } catch (e) {
    const duracionMs = Date.now() - inicio;

    /*
      Se distingue cada falla porque cada una se resuelve distinto, y un
      mensaje genérico manda a la persona a adivinar.
    */
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("Clave de Anthropic rechazada:", e.message);
      return {
        ok: false,
        error: "La clave de Anthropic no es válida. Avisa a quien administra el sistema.",
        duracionMs,
      };
    }
    if (e instanceof Anthropic.RateLimitError) {
      return {
        ok: false,
        error: "Se alcanzó el límite de consultas. Espera un momento y vuelve a intentar.",
        duracionMs,
      };
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error("Petición rechazada por la API:", e.message);
      return {
        ok: false,
        error: "La imagen no pudo procesarse. Prueba con otra foto o con otro formato.",
        duracionMs,
      };
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`Error de la API (${e.status}):`, e.message);
      return {
        ok: false,
        error: "El servicio de análisis no respondió. Intenta de nuevo en unos minutos.",
        duracionMs,
      };
    }

    console.error("Fallo inesperado analizando la imagen:", e);
    return {
      ok: false,
      error: "No pude analizar la imagen. Puedes cargar los productos a mano.",
      duracionMs,
    };
  }
}
