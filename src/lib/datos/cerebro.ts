import { crearClienteServidor } from "@/lib/supabase/servidor";

/*
  Los datos de la pantalla Cerebro.

  Las sumas las hace Postgres y acá solo se les da forma: traer todas las
  ventas con todos sus ítems para sumarlas en el servidor de Next sería mover
  miles de filas para producir doce números.

  Cada función devuelve el dato Y el error por separado. En un panel de gestión
  eso importa más que en ninguna otra pantalla: un gráfico vacío por un fallo de
  lectura se ve exactamente igual que un mes sin ventas, y alguien puede
  concluir que el negocio se detuvo cuando lo que falló fue una consulta.
*/

export type VentasMes = { mes: string; total_clp: number; ventas: number; unidades: number };
export type VentaCategoria = { mes: string; categoria: string; total_clp: number };
export type StockCategoria = {
  categoria: string;
  productos: number;
  unidades: number;
  valor_clp: number;
  sin_stock: number;
};

export type ResumenCerebro = {
  desde: string;
  vendido_mes: number;
  ventas_mes: number;
  vendido_mes_previo: number;
  ventas_mes_previo: number;
  ticket_promedio: number;
  productos: number;
  valor_stock: number;
  agotados: number;
  borradores: number;
  incompletos: number;
};

/*
  Tope de categorías con color propio en el gráfico apilado.

  SEIS, y la séptima en adelante se doblan en "Otras". No es una limitación de
  espacio: la paleta validada tiene seis colores que se distinguen entre sí bajo
  daltonismo, y un séptimo color generado sería indistinguible de alguno de los
  anteriores para una parte de quienes lo miren.
*/
export const MAXIMO_CATEGORIAS = 6;

export async function cargarCerebro(meses = 12): Promise<{
  resumen: ResumenCerebro | null;
  ventasPorMes: VentasMes[];
  porCategoria: VentaCategoria[];
  stock: StockCategoria[];
  error: string | null;
}> {
  const supabase = await crearClienteServidor();

  const [resResumen, resVentas, resCategorias, resStock] = await Promise.all([
    supabase.rpc("cerebro_resumen"),
    supabase.rpc("cerebro_ventas_por_mes", { p_meses: meses }),
    supabase.rpc("cerebro_ventas_por_categoria", { p_meses: meses }),
    supabase.rpc("cerebro_stock_por_categoria"),
  ]);

  const fallo =
    resResumen.error ?? resVentas.error ?? resCategorias.error ?? resStock.error ?? null;

  if (fallo) {
    console.error("No pude leer los datos del panel:", fallo.message);
    return {
      resumen: null,
      ventasPorMes: [],
      porCategoria: [],
      stock: [],
      error: fallo.message,
    };
  }

  return {
    resumen: resResumen.data as ResumenCerebro,
    ventasPorMes: (resVentas.data ?? []) as VentasMes[],
    porCategoria: (resCategorias.data ?? []) as VentaCategoria[],
    stock: (resStock.data ?? []) as StockCategoria[],
    error: null,
  };
}

/** "2026-03-01" a "mar". El año solo cuando cambia, para no repetirlo doce veces. */
export function mesCorto(iso: string, conAnio = false): string {
  const d = new Date(`${iso}T12:00:00`);
  const mes = new Intl.DateTimeFormat("es-CL", { month: "short" }).format(d).replace(".", "");
  return conAnio ? `${mes} ${d.getFullYear().toString().slice(2)}` : mes;
}

/*
  Arma las series apiladas a partir de las filas sueltas de la base.

  LAS CATEGORÍAS SE ELIGEN POR SU TOTAL DEL PERÍODO COMPLETO, no mes a mes. Si
  se eligieran por mes, una categoría podría tener color en marzo y caer en
  "Otras" en abril, y seguir su línea sería imposible.
*/
export function armaSeries(
  filas: VentaCategoria[],
  meses: string[],
): { nombre: string; valores: number[] }[] {
  if (filas.length === 0) return [];

  const totalPorCategoria = new Map<string, number>();
  for (const f of filas) {
    totalPorCategoria.set(
      f.categoria,
      (totalPorCategoria.get(f.categoria) ?? 0) + Number(f.total_clp),
    );
  }

  const ordenadas = [...totalPorCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const conColor = ordenadas.slice(0, MAXIMO_CATEGORIAS).map(([nombre]) => nombre);
  const hayOtras = ordenadas.length > MAXIMO_CATEGORIAS;

  const indicePorMes = new Map(meses.map((m, i) => [m, i]));
  const series = new Map<string, number[]>();
  for (const nombre of conColor) series.set(nombre, new Array(meses.length).fill(0));
  if (hayOtras) series.set("Otras", new Array(meses.length).fill(0));

  for (const f of filas) {
    const i = indicePorMes.get(f.mes);
    if (i === undefined) continue;
    const clave = conColor.includes(f.categoria) ? f.categoria : "Otras";
    const serie = series.get(clave);
    if (serie) serie[i] += Number(f.total_clp);
  }

  return [...series.entries()].map(([nombre, valores]) => ({ nombre, valores }));
}

/** Variación porcentual contra el período anterior. null cuando no hay base. */
export function variacion(actual: number, previo: number): number | null {
  /*
    Sin base no hay porcentaje. Mostrar "+100%" porque el mes pasado fue cero
    es una cifra que suena enorme y no significa nada.
  */
  if (!previo) return null;
  return ((actual - previo) / previo) * 100;
}
