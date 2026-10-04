import { redirect } from "next/navigation";
import { perfilHabilitado } from "@/lib/auth";
import {
  armaSeries,
  cargarCerebro,
  mesCorto,
  variacion,
  MAXIMO_CATEGORIAS,
} from "@/lib/datos/cerebro";
import { formateaNumero, formateaPesos } from "@/lib/formato";
import {
  BarrasApiladas,
  BarrasHorizontales,
  Cifra,
  LineaTiempo,
} from "@/components/graficos";

export const dynamic = "force-dynamic";

const PERIODOS = [6, 12, 24] as const;

/*
  Cerebro: qué está pasando con las ventas y con el stock.

  ── LO QUE ESTA PANTALLA NO HACE ───────────────────────────────────────────

  No tiene ningún gráfico de dos ejes. Poner ventas y unidades en un mismo
  plano con dos escalas inventa una correlación que no está en los datos,
  porque la alineación entre las dos escalas la elige quien dibuja. Cuando
  hacen falta dos medidas, van dos gráficos.

  No pinta las barras de stock de un color por categoría. El largo de la barra
  ya dice la magnitud; darle además un color a cada una gasta el canal de
  identidad en repetir lo mismo.

  No muestra un gráfico donde basta un número. Las cifras de arriba son cifras,
  no barras de un solo elemento.

  ── TODO LO QUE SE GRAFICA SE PUEDE DESCARGAR ──────────────────────────────

  La validación de la paleta dejó una advertencia de contraste en tres colores,
  y eso obliga a que los valores se puedan leer sin depender del color. Por eso
  cada gráfico lleva etiquetas visibles y, además, está el botón de descarga
  con el detalle completo en planilla.
*/
export default async function CerebroPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>;
}) {
  const { meses: crudo } = await searchParams;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const meses = PERIODOS.includes(Number(crudo) as (typeof PERIODOS)[number])
    ? Number(crudo)
    : 12;

  const { resumen, ventasPorMes, porCategoria, stock, error } = await cargarCerebro(meses);

  if (error || !resumen) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gris-900">Cerebro</h1>
        <p role="alert" className="rounded-md border border-acento p-4 text-sm text-gris-900">
          No pude leer los datos del panel. Es un problema de lectura, no que no
          haya ventas: si dibujara los gráficos vacíos parecería que el negocio
          se detuvo.
        </p>
      </div>
    );
  }

  const etiquetas = ventasPorMes.map((v) => mesCorto(v.mes, meses > 12));
  const series = armaSeries(porCategoria, ventasPorMes.map((v) => v.mes));
  const variacionVendido = variacion(
    Number(resumen.vendido_mes),
    Number(resumen.vendido_mes_previo),
  );

  const valorTotal = stock.reduce((s, c) => s + Number(c.valor_clp), 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gris-900">Cerebro</h1>
          <p className="mt-1 max-w-prose text-base text-gris-600">
            Qué se está vendiendo y qué hay guardado. Solo cuentan las ventas
            confirmadas: un carrito abierto no cobró nada y una anulada se
            deshizo.
          </p>
        </div>

        {/* Enlace normal y no <Link>: la navegación de cliente de Next
            interceptaría la respuesta y la descarga nunca empezaría. */}
        <a
          href={`/panel/cerebro/exportar?meses=${meses}`}
          className="inline-flex items-center rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
        >
          Descargar el detalle
        </a>
      </div>

      {/* ── Las cifras ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">
          Este mes
        </h2>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra
            rotulo="Vendido"
            valor={formateaPesos(Number(resumen.vendido_mes))}
            variacion={variacionVendido}
          />
          <Cifra
            rotulo="Ventas"
            valor={formateaNumero(Number(resumen.ventas_mes))}
            nota={`${formateaNumero(Number(resumen.ventas_mes_previo))} el mes pasado`}
          />
          <Cifra
            rotulo="Ticket promedio"
            valor={formateaPesos(Number(resumen.ticket_promedio))}
            nota="Por venta confirmada"
          />
          <Cifra
            rotulo="Valor del stock"
            valor={formateaPesos(Number(resumen.valor_stock))}
            nota={`${formateaNumero(Number(resumen.productos))} productos activos`}
          />
        </dl>
      </section>

      {/* ── Qué hay que atender ────────────────────────────────────────── */}
      {Number(resumen.agotados) > 0 ||
      Number(resumen.borradores) > 0 ||
      Number(resumen.incompletos) > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">
            Qué hay que atender
          </h2>
          {/*
            Son tres cuentas, no tres gráficos. Cada una lleva a la pantalla
            donde se resuelve: una cifra que no se puede accionar es trivia.
          */}
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <li className="rounded-lg border border-gris-200 p-4">
              <p className="text-2xl font-bold text-gris-900">
                {formateaNumero(Number(resumen.agotados))}
              </p>
              <p className="mt-0.5 text-sm text-gris-700">
                {Number(resumen.agotados) === 1 ? "pieza agotada" : "piezas agotadas"}
              </p>
              <a
                href="/panel?orden=stock"
                className="mt-2 inline-block text-sm font-semibold text-primario hover:underline"
              >
                Ver las de menos stock
              </a>
            </li>
            <li className="rounded-lg border border-gris-200 p-4">
              <p className="text-2xl font-bold text-gris-900">
                {formateaNumero(Number(resumen.borradores))}
              </p>
              <p className="mt-0.5 text-sm text-gris-700">sin revisar</p>
              <a
                href="/panel?estado=borrador"
                className="mt-2 inline-block text-sm font-semibold text-primario hover:underline"
              >
                Revisar borradores
              </a>
            </li>
            <li className="rounded-lg border border-gris-200 p-4">
              <p className="text-2xl font-bold text-gris-900">
                {formateaNumero(Number(resumen.incompletos))}
              </p>
              <p className="mt-0.5 text-sm text-gris-700">con menos de 3 fotos</p>
              <p className="mt-2 text-xs text-gris-500">No se pueden confirmar así.</p>
            </li>
          </ul>
        </section>
      ) : null}

      {/* ── Período ────────────────────────────────────────────────────── */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
            Período
          </span>
          <select
            name="meses"
            defaultValue={String(meses)}
            className="mt-1 rounded-md border border-gris-300 px-3 py-2.5 text-sm text-gris-900"
          >
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                Últimos {p} meses
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
        >
          Aplicar
        </button>
      </form>

      {/* ── Evolución de las ventas ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Vendido por mes
        </h2>
        <p className="mt-1 mb-3 text-sm text-gris-600">
          Total cobrado cada mes. El eje parte en cero siempre: recortarlo
          exagera las diferencias.
        </p>
        <LineaTiempo
          datos={ventasPorMes.map((v, i) => ({
            etiqueta: etiquetas[i],
            valor: Number(v.total_clp),
            detalle: `${formateaNumero(Number(v.ventas))} ${Number(v.ventas) === 1 ? "venta" : "ventas"}`,
          }))}
        />
      </section>

      {/* ── Unidades, en su propio gráfico ─────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Unidades vendidas por mes
        </h2>
        <p className="mt-1 mb-3 max-w-prose text-sm text-gris-600">
          Va aparte del dinero a propósito. Las dos medidas tienen escalas
          distintas, y superponerlas en un mismo plano inventaría una relación
          entre ellas que depende de cómo se alineen los ejes.
        </p>
        <LineaTiempo
          datos={ventasPorMes.map((v, i) => ({
            etiqueta: etiquetas[i],
            valor: Number(v.unidades),
          }))}
          formato="numero"
          alto={180}
        />
      </section>

      {/* ── Por categoría ──────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Ventas por categoría
        </h2>
        <p className="mt-1 mb-3 max-w-prose text-sm text-gris-600">
          Cuánto aportó cada rubro cada mes. Las {MAXIMO_CATEGORIAS} que más
          venden en el período llevan color propio y el resto se suma en
          &quot;Otras&quot;; el color sigue a la categoría, así que no cambia de
          un mes a otro.
        </p>
        <BarrasApiladas meses={etiquetas} series={series} />
      </section>

      {/* ── Stock ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Valor del stock por categoría
        </h2>
        <p className="mt-1 mb-3 max-w-prose text-sm text-gris-600">
          Cuánta plata hay guardada en cada rubro. Un producto sin precio suma
          cero: inflar el inventario con precios imaginarios sería peor que
          dejarlo corto.
        </p>
        <BarrasHorizontales
          datos={stock.map((c) => ({
            etiqueta: c.categoria,
            valor: Number(c.valor_clp),
            nota: `${formateaNumero(Number(c.productos))} productos · ${formateaNumero(
              Number(c.unidades),
            )} unidades${Number(c.sin_stock) > 0 ? ` · ${c.sin_stock} agotadas` : ""}`,
          }))}
        />
        <p className="mt-3 border-t border-gris-200 pt-3 text-sm font-semibold text-gris-900">
          Total: {formateaPesos(valorTotal)}
        </p>
      </section>

      {/* ── La tabla ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Los mismos datos, en números
        </h2>
        <p className="mt-1 mb-3 max-w-prose text-sm text-gris-600">
          Está acá porque un gráfico no se puede leer con lector de pantalla ni
          copiar a otra planilla, y porque hay colores de la paleta cuyo
          contraste obliga a ofrecer los valores por otra vía.
        </p>

        {/* La tabla se desplaza sola en horizontal: el ancho de la página
            nunca lo hace. */}
        <div className="overflow-x-auto rounded-lg border border-gris-200">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="border-b border-gris-200 bg-gris-50 text-left">
                <th scope="col" className="px-3 py-2 font-semibold text-gris-700">Mes</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-gris-700">Vendido</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-gris-700">Ventas</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-gris-700">Unidades</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gris-100">
              {ventasPorMes.map((v, i) => (
                <tr key={v.mes}>
                  <th scope="row" className="px-3 py-2 text-left font-semibold text-gris-900">
                    {mesCorto(v.mes, true)}
                  </th>
                  <td className="px-3 py-2 text-right text-gris-900">
                    {formateaPesos(Number(v.total_clp))}
                  </td>
                  <td className="px-3 py-2 text-right text-gris-700">
                    {formateaNumero(Number(v.ventas))}
                  </td>
                  <td className="px-3 py-2 text-right text-gris-700">
                    {formateaNumero(Number(v.unidades))}
                  </td>
                  {/* El índice se usa solo para la clave de React arriba. */}
                  {i < 0 ? null : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
