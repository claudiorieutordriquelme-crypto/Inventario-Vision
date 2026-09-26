import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claveAnthropic } from "@/lib/env";

/*
  Analisis de una foto de inventario con Claude.

  QUE HACE Y QUE NO HACE, porque la diferencia decide como se etiqueta el
  resultado en pantalla:

  IDENTIFICA el producto de la foto, lo clasifica en una de las categorias que
  existen en la base, escribe una descripcion breve y ESTIMA un precio.

  NO CONSULTA LA WEB. El precio sale del conocimiento del modelo, que tiene
  fecha de corte, no de una busqueda en retail chileno hoy. Es un punto de
  partida para que una persona lo corrija, no un dato de mercado. Toda la
  aplicacion lo trata asi: la columna se llama precio_estimado_clp, nunca
  sobreescribe lo que fija un humano, y la pantalla dice de donde vino.

  Si algun dia se quiere el precio real de mercado, el cambio es acotado:
  agregar la herramienta de servidor web_search a esta llamada y guardar las
  fuentes citadas junto al monto. Queda anotado aca para que no haya que
  reconstruir el razonamiento.
*/

export const MODELO = "claude-opus-5";

/*
  La version del prompt se guarda con cada analisis. Cuando el prompt cambie,
  esta constante sube, y asi se puede saber que resultados vinieron de que
  instrucciones. Sin esto, comparar la calidad entre dos epocas es imposible.
*/
export const VERSION_PROMPT = "2026-09-03.1";

/* Tarifa de claude-opus-5 por millon de tokens, para estimar el costo. */
const USD_POR_MTOK_ENTRADA = 5;
const USD_POR_MTOK_SALIDA = 25;

const MIME_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type MimeImagen = (typeof MIME_PERMITIDOS)[number];

export function esMimeSoportado(mime: string): mime is MimeImagen {
  return (MIME_PERMITIDOS as readonly string[]).includes(mime);
}

/*
  Lo que se le pide al modelo.

  Cada campo admite null a proposito. Un modelo obligado a rellenar un campo
  que no puede ver inventa, y un inventario con datos inventados es peor que
  un inventario incompleto: el incompleto se nota, el inventado no.
*/
const EsquemaAnalisis = z.object({
  nombre: z
    .string()
    .describe(
      "Nombre corto y concreto del producto, como lo escribiria alguien de bodega. Marca y modelo si se leen en la foto. Máximo 80 caracteres.",
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
      "Cuántas unidades del mismo producto se ven en la foto. null si no se puede contar con seguridad.",
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
      "Qué tan seguro estás de la identificación, entre 0 y 1. Sé honesto: 0.3 en algo genérico es más útil que 0.9 falso.",
    ),
  advertencias: z
    .array(z.string())
    .describe(
      "Lo que la persona debería revisar: foto borrosa, producto parcialmente tapado, varios productos distintos en la imagen, precio muy variable según marca. Lista vacía si no hay nada que advertir.",
    ),
});

export type Analisis = z.infer<typeof EsquemaAnalisis>;

export type CategoriaOfrecida = { codigo: string; nombre: string; descripcion: string | null };

function instrucciones(categorias: CategoriaOfrecida[]): string {
  const lista = categorias
    .map((c) => `- ${c.codigo}: ${c.nombre}${c.descripcion ? ` — ${c.descripcion}` : ""}`)
    .join("\n");

  return `Eres el asistente de un sistema de control de inventario en Chile. Recibes la foto de un producto y devuelves los datos para darlo de alta.

CATEGORÍAS DISPONIBLES. Elige el código exacto de una de estas, o null:
${lista}

Si ninguna calza bien, devuelve null en categoria_codigo. No inventes códigos: un código que no está en esta lista deja el producto sin clasificar igual, y además obliga a alguien a descubrir por qué.

SOBRE EL PRECIO. No tienes acceso a internet en esta llamada, así que el precio es una estimación tuya para el mercado chileno, en pesos, por unidad y con IVA incluido, que es como se muestran los precios al público en Chile. Tres reglas:
- Si el producto es genérico y su precio varía mucho según marca, dilo en advertencias.
- Si no tienes base razonable para estimar, devuelve null. Es una respuesta válida y preferible a un número inventado.
- No presentes el precio como un dato de mercado actual. Alguien lo va a revisar.

SOBRE LA HONESTIDAD DEL RESTO. Una foto borrosa, un producto tapado a medias o varios productos distintos en la misma imagen son situaciones normales en una bodega. Cuando pasen, bájale a la confianza y escríbelo en advertencias. El sistema está hecho para que una persona revise y corrija; lo que no se puede corregir es un dato que parecía seguro y no lo era.

Escribe en español de Chile, sin adornos.`;
}

export type ResultadoAnalisis =
  | {
      ok: true;
      analisis: Analisis;
      /* Para la bitacora: lo que devolvio el modelo y lo que costo. */
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
  Analiza una imagen y devuelve los campos del producto.

  La imagen va en base64 dentro del mensaje y no por la Files API: se usa una
  sola vez, subirla aparte seria un viaje mas a la red por nada.

  effort en "low" no es ahorrar por ahorrar. Identificar un objeto en una foto
  y describirlo es una tarea de un solo paso; el esfuerzo alto se gasta en
  razonamiento que aca no cambia el resultado. Si la calidad no alcanza, este
  es el primer dial que hay que mover, y esta en un solo lugar.
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
            {
              type: "image",
              source: { type: "base64", media_type: mime, data: imagen.toString("base64") },
            },
            {
              type: "text",
              text: "Identifica el producto de esta foto y devuelve sus datos para darlo de alta en el inventario.",
            },
          ],
        },
      ],
    });

    const duracionMs = Date.now() - inicio;

    /*
      stop_reason se revisa ANTES de leer el contenido. Un rechazo por politica
      llega con HTTP 200 y sin los datos, y leer parsed_output sin mirar esto
      daria un error de null que no explica nada.
    */
    if (respuesta.stop_reason === "refusal") {
      return {
        ok: false,
        error:
          "El modelo no quiso analizar esta imagen. Revisa que sea una foto de un producto y vuelve a intentar, o carga el producto a mano.",
        duracionMs,
      };
    }

    if (!respuesta.parsed_output) {
      return {
        ok: false,
        error:
          "El modelo respondió, pero no en el formato esperado. Intenta de nuevo o carga el producto a mano.",
        duracionMs,
      };
    }

    const tokensEntrada = respuesta.usage.input_tokens;
    const tokensSalida = respuesta.usage.output_tokens;

    return {
      ok: true,
      analisis: respuesta.parsed_output,
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
      mensaje generico manda a la persona a adivinar.
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
      error: "No pude analizar la imagen. Puedes cargar el producto a mano.",
      duracionMs,
    };
  }
}
