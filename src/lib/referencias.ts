import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { claveAnthropic } from "@/lib/env";

/*
  Busca en la web fuentes que respalden el precio y la descripción de una pieza.

  POR QUÉ ESTO ES UN MÓDULO APARTE DE vision.ts. Son dos cosas distintas que se
  confunden fácil: vision.ts MIRA una foto y no sale a internet nunca, y su
  precio es una estimación del modelo. Esto SÍ sale a internet, y su resultado
  son enlaces a páginas que existen. Mezclarlas haría que el día de mañana
  nadie pueda decir de dónde salió un precio.

  Y NO REESCRIBE NINGÚN PRECIO. Devuelve referencias; qué se hace con ellas lo
  decide una persona en la pantalla. precio_estimado_clp sigue siendo lo que
  dijo el modelo al mirar la foto, que es la evidencia de cuánto se equivoca.

  CUESTA PLATA Y POR ESO NO ES AUTOMÁTICO. La herramienta web_search cobra POR
  BÚSQUEDA, además de los tokens de la conversación. Por eso esto se dispara
  solo cuando alguien aprieta un botón, el tope de búsquedas está fijado acá, y
  cada llamada queda registrada en la tabla busquedas_web para que entre en el
  recuadro de consumo.
*/

export const MODELO_REFERENCIAS = "claude-opus-5";
export const VERSION_PROMPT_REFERENCIAS = "2026-10-03.1";

/* Tarifa de claude-opus-5 por millón de tokens. Las búsquedas de la
   herramienta se cobran aparte y no están incluidas en esta cuenta: por eso la
   bitácora guarda el número de búsquedas en su propia columna. */
const USD_POR_MTOK_ENTRADA = 5;
const USD_POR_MTOK_SALIDA = 25;

/*
  Tope de búsquedas por llamada. Tres alcanza para "nombre + marca", "nombre +
  precio Chile" y una variante. Sin tope, una consulta ambigua puede encadenar
  diez búsquedas y multiplicar el costo sin mejorar el resultado.
*/
const MAXIMO_BUSQUEDAS = 3;

/* Tope de resultados que se le muestran a la persona. Más de seis no se
   revisan uno por uno: se aceptan en bloque o se ignoran todos. */
const MAXIMO_RESULTADOS = 6;

const EsquemaReferencia = z.object({
  titulo: z.string().describe("Título de la página, tal como aparece."),
  url: z.string().describe("La URL completa del resultado, empezando en http:// o https://."),
  extracto: z
    .string()
    .describe(
      "Dos o tres frases sobre qué dice esa página de este producto y por qué sirve como respaldo. En español de Chile.",
    ),
  respalda: z
    .enum(["precio", "descripcion", "ambas"])
    .describe("Qué respalda esta fuente: el precio, la descripción, o las dos cosas."),
  precio_mencionado_clp: z
    .number()
    .nullable()
    .describe(
      "Si la página menciona un precio y se puede expresar en pesos chilenos, el número. null si no hay precio o está en otra moneda y no se puede convertir con certeza.",
    ),
});

const EsquemaBusqueda = z.object({
  referencias: z
    .array(EsquemaReferencia)
    .describe(
      `Hasta ${MAXIMO_RESULTADOS} fuentes encontradas, de la más útil a la menos. Lista vacía si no encontraste nada que sirva.`,
    ),
  observacion: z
    .string()
    .describe(
      "Una frase sobre la búsqueda: si el producto es demasiado genérico para encontrar referencias útiles, si lo que hay es de otro país, o si no encontraste nada. Cadena vacía si no hay nada que decir.",
    ),
});

export type Referencia = z.infer<typeof EsquemaReferencia>;

export type ResultadoReferencias =
  | {
      ok: true;
      referencias: Referencia[];
      observacion: string;
      busquedas: number;
      tokensEntrada: number;
      tokensSalida: number;
      costoUsd: number;
      duracionMs: number;
    }
  | { ok: false; error: string; duracionMs: number };

export type ProductoParaBuscar = {
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  marca?: string | null;
  epoca?: string | null;
  material?: string | null;
};

function instrucciones(): string {
  return `Eres el asistente de un negocio chileno que vende menaje, antigüedades, muñecas y artículos de colección. Recibes los datos de una pieza y buscas en la web fuentes que respalden su precio y su descripción.

QUÉ ES UNA BUENA FUENTE, en este orden:
1. Una venta real de la misma pieza o de una muy parecida, con precio visible. Mercado Libre Chile, tiendas de antigüedades, casas de remate.
2. Una ficha de catálogo o de fabricante que confirme qué es, de qué año, de qué material.
3. Una página de referencia de coleccionistas sobre ese modelo o esa serie.

QUÉ NO SIRVE Y NO HAY QUE DEVOLVER:
- Resultados de búsqueda genéricos del tipo "muñecas de porcelana en venta", que no hablan de ESTA pieza.
- Páginas sin precio ni datos concretos.
- Tiendas de otro país cuando el precio no se puede comparar. Si igual la incluyes, dilo en el extracto y deja precio_mencionado_clp en null.

SOBRE EL PRECIO. Si la página muestra un precio en pesos chilenos, ponlo en precio_mencionado_clp tal cual, sin convertir ni redondear. Si está en dólares o euros, déjalo en null y menciónalo en el extracto: una conversión inventada es peor que no tener el dato, porque parece un precio de mercado chileno y no lo es.

SOBRE LAS URL. Devuelve la dirección completa de la página concreta, no la del sitio. Una URL que no lleva a la pieza no es un respaldo de nada.

SI NO ENCUENTRAS NADA ÚTIL, devuelve la lista vacía y explícalo en observacion. Es una respuesta válida y mucho mejor que llenar la lista con páginas que no sirven: cada una de esas le hace perder tiempo a quien las revisa una por una.

Máximo ${MAXIMO_RESULTADOS} referencias. Escribe en español de Chile, sin adornos.`;
}

export async function buscarReferencias(
  producto: ProductoParaBuscar,
): Promise<ResultadoReferencias> {
  const clave = claveAnthropic();
  const inicio = Date.now();

  if (!clave) {
    return {
      ok: false,
      error:
        "La búsqueda de referencias no está configurada: falta ANTHROPIC_API_KEY en el entorno. El resto de la ficha funciona igual.",
      duracionMs: 0,
    };
  }

  const client = new Anthropic({ apiKey: clave });

  const descripcion = [
    `Producto: ${producto.nombre}`,
    producto.categoria ? `Categoría: ${producto.categoria}` : null,
    producto.marca ? `Marca: ${producto.marca}` : null,
    producto.material ? `Material: ${producto.material}` : null,
    producto.epoca ? `Época: ${producto.epoca}` : null,
    producto.descripcion ? `Descripción: ${producto.descripcion}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const respuesta = await client.messages.parse({
      model: MODELO_REFERENCIAS,
      max_tokens: 8000,
      output_config: {
        format: zodOutputFormat(EsquemaBusqueda),
        /*
          effort medio y no bajo: acá sí hay varios pasos reales. Decidir qué
          buscar, mirar lo que volvió y descartar lo que no sirve es lo que
          separa seis enlaces útiles de seis resultados de búsqueda pegados.
        */
        effort: "medium",
      },
      tools: [
        {
          type: "web_search_20260209",
          name: "web_search",
          max_uses: MAXIMO_BUSQUEDAS,
          /* El negocio vende en Chile: los precios que sirven son los de acá. */
          user_location: { type: "approximate", country: "CL" },
        },
      ],
      system: instrucciones(),
      messages: [
        {
          role: "user",
          content: `Busca en la web fuentes que respalden el precio y la descripción de esta pieza:\n\n${descripcion}`,
        },
      ],
    });

    const duracionMs = Date.now() - inicio;

    /* stop_reason se revisa ANTES de leer el contenido: un rechazo por política
       llega con HTTP 200 y sin los datos. */
    if (respuesta.stop_reason === "refusal") {
      return {
        ok: false,
        error: "El modelo no quiso hacer esta búsqueda. Puedes agregar las referencias a mano.",
        duracionMs,
      };
    }
    if (respuesta.stop_reason === "max_tokens") {
      return {
        ok: false,
        error: "La respuesta de la búsqueda se cortó. Intenta de nuevo.",
        duracionMs,
      };
    }
    if (!respuesta.parsed_output) {
      return {
        ok: false,
        error:
          "La búsqueda respondió, pero no en el formato esperado. Intenta de nuevo o agrega las referencias a mano.",
        duracionMs,
      };
    }

    /*
      Cuántas búsquedas se hicieron de verdad. Se cuenta sobre los bloques de
      resultado de la herramienta y no sobre lo que diga el modelo: es lo que
      se va a facturar, y para eso tiene que ser el número real.
    */
    const busquedas = respuesta.content.filter(
      (b) => b.type === "web_search_tool_result",
    ).length;

    const tokensEntrada = respuesta.usage.input_tokens;
    const tokensSalida = respuesta.usage.output_tokens;

    /* El tope se aplica acá además de pedirse en el prompt: una instrucción es
       una petición, esto es una garantía. */
    const referencias = respuesta.parsed_output.referencias
      .filter((r) => /^https?:\/\//i.test(r.url))
      .slice(0, MAXIMO_RESULTADOS);

    return {
      ok: true,
      referencias,
      observacion: respuesta.parsed_output.observacion,
      busquedas,
      tokensEntrada,
      tokensSalida,
      costoUsd:
        (tokensEntrada / 1_000_000) * USD_POR_MTOK_ENTRADA +
        (tokensSalida / 1_000_000) * USD_POR_MTOK_SALIDA,
      duracionMs,
    };
  } catch (e) {
    const duracionMs = Date.now() - inicio;

    /* Cada falla se distingue porque cada una se resuelve distinto, y un
       mensaje genérico manda a la persona a adivinar. */
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
        error: "Se alcanzó el límite de uso de la API. Espera un momento y vuelve a intentar.",
        duracionMs,
      };
    }
    if (e instanceof Anthropic.BadRequestError) {
      console.error("La API rechazó la búsqueda de referencias:", e.message);
      return {
        ok: false,
        error:
          "La API rechazó esta búsqueda. Puede que la herramienta de búsqueda web no esté habilitada en la cuenta. La ficha sigue funcionando igual.",
        duracionMs,
      };
    }

    console.error("Error buscando referencias:", e);
    return {
      ok: false,
      error: "No pude completar la búsqueda. La ficha sigue funcionando: intenta más tarde.",
      duracionMs,
    };
  }
}

/** El dominio de una URL, para mostrarlo sin que la pantalla parsee nada. */
export function dominioDe(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
