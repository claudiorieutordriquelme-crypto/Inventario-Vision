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
export const VERSION_PROMPT = "2026-09-03.2-multiple";

/* Tarifa de claude-opus-5 por millón de tokens, para estimar el costo. */
const USD_POR_MTOK_ENTRADA = 5;
const USD_POR_MTOK_SALIDA = 25;

/*
  Tope de productos por foto. No es una preferencia: una foto de una estantería
  entera daría treinta entradas que nadie va a revisar una por una, y cada una
  entraría al inventario como borrador. Doce es lo que cabe en una mesa y se
  alcanza a revisar de una sentada. Si el modelo ve más, lo dice en la
  observación general y la pantalla lo muestra.
*/
export const MAXIMO_POR_FOTO = 12;

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
  ubicacion_en_foto: z
    .string()
    .describe(
      "Dónde está en la imagen, en palabras que sirvan para encontrarlo: 'arriba a la izquierda', 'el rojo del centro', 'el más grande, al fondo'. Cuando hay un solo producto, escribe 'toda la imagen'.",
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
      "Cuántas unidades DE ESTE MISMO producto se ven. Si hay tres martillos idénticos, esto es 3 y va en una sola entrada. null si no se puede contar con seguridad.",
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
  productos: z
    .array(EsquemaProducto)
    .describe(
      `Un elemento por cada producto DISTINTO que veas. Máximo ${MAXIMO_POR_FOTO}. Si no reconoces ningún producto, devuelve la lista vacía.`,
    ),
  observacion_general: z
    .string()
    .describe(
      "Una frase sobre la foto completa: si está borrosa, mal iluminada, si hay más productos de los que alcanzaste a listar, o si en realidad no es una foto de productos. Cadena vacía si no hay nada que decir.",
    ),
});

export type ProductoDetectado = z.infer<typeof EsquemaProducto>;
export type Analisis = z.infer<typeof EsquemaAnalisis>;

export type CategoriaOfrecida = { codigo: string; nombre: string; descripcion: string | null };

function instrucciones(categorias: CategoriaOfrecida[]): string {
  const lista = categorias
    .map((c) => `- ${c.codigo}: ${c.nombre}${c.descripcion ? ` — ${c.descripcion}` : ""}`)
    .join("\n");

  return `Eres el asistente de un sistema de control de inventario en Chile. Recibes la foto de uno o varios productos y devuelves los datos para darlos de alta.

LA REGLA MÁS IMPORTANTE: PRODUCTOS DISTINTOS CONTRA UNIDADES DEL MISMO.

Un martillo, un alicate y un destornillador en la misma foto son TRES entradas de la lista.
Tres martillos idénticos son UNA entrada con cantidad_visible 3.
Un martillo y tres alicates idénticos son DOS entradas: el martillo con cantidad 1, el alicate con cantidad 3.

Confundir las dos cosas rompe el inventario en las dos direcciones. Doce entradas de un mismo tornillo llenan el sistema de basura que hay que borrar a mano. Un martillo y un alicate sumados como "2 unidades" crean un producto que no existe y esconde los dos que sí.

Cuando dudes si dos objetos son el mismo producto, míralos como los miraría bodega: si se guardarían en la misma caja y se pedirían con el mismo código, son el mismo producto. Si uno es de 12 pulgadas y el otro de 16, son distintos.

Máximo ${MAXIMO_POR_FOTO} productos por foto. Si ves más, lista los ${MAXIMO_POR_FOTO} más claros y dilo en observacion_general.

CATEGORÍAS DISPONIBLES. Para cada producto, elige el código exacto de una de estas, o null:
${lista}

Si ninguna calza bien, devuelve null en categoria_codigo. No inventes códigos: un código que no está en esta lista deja el producto sin clasificar igual, y además obliga a alguien a descubrir por qué.

SOBRE EL PRECIO. No tienes acceso a internet en esta llamada, así que el precio es una estimación tuya para el mercado chileno, en pesos, por unidad y con IVA incluido, que es como se muestran los precios al público en Chile. Tres reglas:
- Si el producto es genérico y su precio varía mucho según marca, dilo en sus advertencias.
- Si no tienes base razonable para estimar, devuelve null. Es una respuesta válida y preferible a un número inventado.
- No presentes el precio como un dato de mercado actual. Alguien lo va a revisar.

SOBRE UBICACION_EN_FOTO. Es lo que va a permitir que una persona, mirando la foto, sepa cuál de los seis productos de la lista es cuál. Escribe algo que sirva para encontrarlo: la posición, el color, el tamaño relativo. "Producto 3" no sirve.

SOBRE LA HONESTIDAD. Una foto borrosa, un producto tapado a medias o un objeto que no logras identificar son situaciones normales en una bodega. Cuando pasen, bájale a la confianza de ese producto y escríbelo en sus advertencias. Si la foto no muestra productos identificables, devuelve la lista vacía y explícalo en observacion_general. El sistema está hecho para que una persona revise y corrija; lo que no se puede corregir es un dato que parecía seguro y no lo era.

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

/*
  Analiza una imagen y devuelve TODOS los productos que reconoce.

  La imagen va en base64 dentro del mensaje y no por la Files API: se usa una
  sola vez, subirla aparte sería un viaje más a la red por nada.

  effort en "low" no es ahorrar por ahorrar. Identificar objetos en una foto y
  describirlos es una tarea de un solo paso; el esfuerzo alto se gasta en
  razonamiento que acá no cambia el resultado. Si la calidad no alcanza, este
  es el primer dial que hay que mover, y está en un solo lugar.

  max_tokens sube con el tope de productos: doce fichas completas necesitan
  espacio, y quedarse corto trunca la respuesta a mitad de un producto.
*/
export async function analizaImagen(
  imagen: Buffer,
  mime: MimeImagen,
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

  const client = new Anthropic({ apiKey: clave });

  try {
    const respuesta = await client.messages.parse({
      model: MODELO,
      max_tokens: 12000,
      output_config: {
        format: zodOutputFormat(EsquemaAnalisis),
        effort: "low",
      },
      system: instrucciones(categorias),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mime, data: imagen.toString("base64") },
            },
            {
              type: "text",
              text: "Identifica todos los productos distintos que veas en esta foto y devuelve sus datos para darlos de alta en el inventario.",
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
      Quedarse sin tokens con una lista larga deja el último producto a medias.
      Se trata como error en vez de guardar una ficha truncada: media ficha
      parece una ficha completa y nadie la revisaría dos veces.
    */
    if (respuesta.stop_reason === "max_tokens") {
      return {
        ok: false,
        error:
          "La foto tiene demasiados productos y la respuesta se cortó. Sácale fotos por grupos más chicos.",
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

    /*
      El tope se aplica también acá y no solo se pide en el prompt. Una
      instrucción es una petición; esto es una garantía, y de ella depende que
      una foto no pueda crear treinta borradores de una vez.
    */
    const recortado: Analisis = {
      ...analisis,
      productos: analisis.productos.slice(0, MAXIMO_POR_FOTO),
    };

    const tokensEntrada = respuesta.usage.input_tokens;
    const tokensSalida = respuesta.usage.output_tokens;

    return {
      ok: true,
      analisis: recortado,
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
