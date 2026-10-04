import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/*
  Consumo de la API en el mes en curso.

  DE DONDE SALE Y DE DONDE NO. Sale de analisis_imagen, la bitácora que esta
  aplicación escribe con los tokens y el costo de cada llamada al modelo. NO es
  la factura de Anthropic: no incluye ningún otro consumo de la misma cuenta,
  ni impuestos, ni ajustes. La pantalla lo dice, porque alguien que lea "12%" y
  crea que es su saldo real va a tomar una decisión con un número que no es.

  El cálculo vive en la función consumo_api_mes() de la base y no acá: así el
  recuadro y cualquier otra cosa que lo consulte dan el mismo número, y el mes
  se corta en horario de Chile y no en UTC.
*/

export type ConsumoApi = {
  /** Primer instante del mes local, en ISO. */
  desde: string;
  presupuesto_usd: number;
  costo_usd: number;
  tokens_entrada: number;
  tokens_salida: number;
  analisis: number;
  analisis_fallidos: number;
  /** Puede pasar de 100: gastar de más es justamente lo que hay que ver. */
  porcentaje: number | null;
};

/*
  Devuelve el dato Y el error por separado, como el resto de lib/datos. Un
  fallo de lectura mostrado como "0%" diría que no se ha gastado nada, que es
  la conclusión contraria a la verdadera cuando lo que pasó es que no se pudo
  consultar.
*/
export const cargarConsumoApi = cache(
  async (): Promise<{ consumo: ConsumoApi | null; error: string | null }> => {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("consumo_api_mes");

    if (error) {
      console.error("No pude leer el consumo de la API:", error.message);
      return { consumo: null, error: error.message };
    }

    return { consumo: data as ConsumoApi, error: null };
  },
);

/*
  Cómo se rotula el nivel de consumo.

  TRES NIVELES Y CADA UNO CON SU PALABRA. El color solo no sirve: es lo primero
  que se pierde con daltonismo o mirando un teléfono a contraluz, y acá el
  mensaje es exactamente "tienes que cargar". Los cortes son 70% y 100%: a 70
  queda margen para cargar sin apuro, a 100 ya se pasó.
*/
export function nivelConsumo(porcentaje: number | null): {
  palabra: string;
  explica: string;
  barra: string;
  borde: string;
} {
  if (porcentaje === null) {
    return {
      palabra: "Sin presupuesto",
      explica: "No hay un tope mensual cargado, así que no hay contra qué medir.",
      barra: "bg-gris-300",
      borde: "border-gris-200",
    };
  }
  if (porcentaje >= 100) {
    return {
      palabra: "Pasado",
      explica: "El gasto del mes superó el tope. Hay que cargar o subir el presupuesto.",
      barra: "bg-acento",
      borde: "border-acento",
    };
  }
  if (porcentaje >= 70) {
    return {
      palabra: "Por cargar",
      explica: "Queda menos de un tercio del presupuesto del mes.",
      barra: "bg-marca",
      borde: "border-marca",
    };
  }
  return {
    palabra: "Holgado",
    explica: "El gasto del mes va dentro de lo previsto.",
    barra: "bg-primario",
    borde: "border-gris-200",
  };
}
