import { NextResponse } from "next/server";
import { perfilHabilitado } from "@/lib/auth";
import { cargarCerebro } from "@/lib/datos/cerebro";
import { celdaNumero, celdaTexto, fila, respuestaCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/*
  Descarga del detalle del panel.

  ── POR QUÉ UN SOLO ARCHIVO CON TRES BLOQUES ───────────────────────────────

  Las tres tablas del panel —ventas por mes, ventas por categoría y stock por
  categoría— tienen columnas distintas, así que no se pueden apilar en una sola
  grilla sin inventar columnas vacías. Las alternativas eran tres descargas
  separadas, un .xlsx con tres hojas, o un archivo con tres bloques separados
  por una línea en blanco.

  Se eligió lo tercero: tres descargas obligan a apretar tres veces y a juntar
  los archivos después, y un .xlsx real exige meter una librería de planillas
  de varios megabytes al servidor para esto solo. Excel abre los tres bloques
  sin problema y quien quiera separarlos corta y pega una vez.

  ── LO QUE SE DESCARGA ES LO QUE SE ESTÁ VIENDO ────────────────────────────

  El período viaja en la dirección, igual que en la pantalla. Descargar siempre
  los últimos doce meses mientras la pantalla muestra seis haría que los
  números del archivo no cuadren con los del gráfico, y la conclusión sería que
  uno de los dos está malo.
*/

export async function GET(peticion: Request) {
  const perfil = await perfilHabilitado();
  if (!perfil) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });

  const url = new URL(peticion.url);
  const pedido = Number(url.searchParams.get("meses"));
  const meses = [6, 12, 24].includes(pedido) ? pedido : 12;

  const { resumen, ventasPorMes, porCategoria, stock, error } = await cargarCerebro(meses);

  if (error || !resumen) {
    /*
      No se entrega un archivo con los bloques vacíos. Una planilla que dice
      cero ventas por un fallo de lectura es peor que no tener planilla: la
      primera se guarda y se usa para decidir.
    */
    return NextResponse.json(
      { error: "No pude leer los datos para exportar." },
      { status: 500 },
    );
  }

  const lineas: string[] = [];

  /* ── Resumen ─────────────────────────────────────────────────────────── */
  lineas.push(fila([celdaTexto("RESUMEN DEL MES EN CURSO")]));
  lineas.push(fila([celdaTexto("Concepto"), celdaTexto("Valor")]));
  lineas.push(fila([celdaTexto("Vendido este mes (CLP)"), celdaNumero(Number(resumen.vendido_mes))]));
  lineas.push(fila([celdaTexto("Ventas este mes"), celdaNumero(Number(resumen.ventas_mes))]));
  lineas.push(
    fila([celdaTexto("Vendido mes anterior (CLP)"), celdaNumero(Number(resumen.vendido_mes_previo))]),
  );
  lineas.push(fila([celdaTexto("Ticket promedio (CLP)"), celdaNumero(Number(resumen.ticket_promedio))]));
  lineas.push(fila([celdaTexto("Valor del stock (CLP)"), celdaNumero(Number(resumen.valor_stock))]));
  lineas.push(fila([celdaTexto("Productos activos"), celdaNumero(Number(resumen.productos))]));
  lineas.push(fila([celdaTexto("Piezas agotadas"), celdaNumero(Number(resumen.agotados))]));
  lineas.push(fila([celdaTexto("Sin revisar (borrador)"), celdaNumero(Number(resumen.borradores))]));
  lineas.push(fila([celdaTexto("Con menos de 3 fotos"), celdaNumero(Number(resumen.incompletos))]));

  lineas.push("");

  /* ── Ventas por mes ──────────────────────────────────────────────────── */
  lineas.push(fila([celdaTexto(`VENTAS POR MES (últimos ${meses})`)]));
  lineas.push(
    fila([
      celdaTexto("Mes"),
      celdaTexto("Vendido (CLP)"),
      celdaTexto("Ventas"),
      celdaTexto("Unidades"),
    ]),
  );
  for (const v of ventasPorMes) {
    lineas.push(
      fila([
        celdaTexto(v.mes),
        celdaNumero(Number(v.total_clp)),
        celdaNumero(Number(v.ventas)),
        celdaNumero(Number(v.unidades), 3),
      ]),
    );
  }

  lineas.push("");

  /* ── Ventas por categoría ────────────────────────────────────────────── */
  lineas.push(fila([celdaTexto("VENTAS POR CATEGORÍA Y MES")]));
  lineas.push(fila([celdaTexto("Mes"), celdaTexto("Categoría"), celdaTexto("Vendido (CLP)")]));
  for (const c of porCategoria) {
    lineas.push(
      fila([celdaTexto(c.mes), celdaTexto(c.categoria), celdaNumero(Number(c.total_clp))]),
    );
  }

  lineas.push("");

  /* ── Stock ───────────────────────────────────────────────────────────── */
  lineas.push(fila([celdaTexto("STOCK POR CATEGORÍA")]));
  lineas.push(
    fila([
      celdaTexto("Categoría"),
      celdaTexto("Productos"),
      celdaTexto("Unidades"),
      celdaTexto("Valor (CLP)"),
      celdaTexto("Agotadas"),
    ]),
  );
  for (const s of stock) {
    lineas.push(
      fila([
        celdaTexto(s.categoria),
        celdaNumero(Number(s.productos)),
        celdaNumero(Number(s.unidades), 3),
        celdaNumero(Number(s.valor_clp)),
        celdaNumero(Number(s.sin_stock)),
      ]),
    );
  }

  /*
    La nota del final no es decoración: quien abra esta planilla en tres meses
    tiene que poder saber qué cuenta y qué no, sin volver a preguntar.
  */
  lineas.push("");
  lineas.push(
    fila([
      celdaTexto(
        "Solo se cuentan ventas confirmadas. Los borradores no cobraron y las anuladas se deshicieron. El valor del stock usa el precio vigente: un producto sin precio suma cero.",
      ),
    ]),
  );

  return respuestaCsv("cerebro", lineas);
}
