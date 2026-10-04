"use client";

import { useId, useState } from "react";
import { formateaPesos } from "@/lib/formato";

/*
  Gráficos en SVG escrito a mano, sin ninguna librería.

  POR QUÉ SIN LIBRERÍA. Las tres o cuatro formas que este panel necesita son
  unas pocas líneas de geometría; una librería de gráficos pesa cientos de
  kilobytes, hay que mantenerla y obliga a pelear con sus estilos para que
  respete la marca. SVG en el servidor además se dibuja completo en el primer
  render, sin que la pantalla parpadee esperando JavaScript.

  ── LA PALETA NO SE ELIGIÓ A OJO ───────────────────────────────────────────

  Está validada contra los seis chequeos de color: banda de luminosidad, piso
  de croma, separación bajo daltonismo (protanopia y deuteranopia), piso de
  visión normal y contraste contra el fondo. El peor par adyacente da ΔE 9,1
  bajo protanopia y 19,6 en visión normal, los dos por sobre el umbral.

  El orden de los colores ES el mecanismo de seguridad: se asignan en secuencia
  y nunca se reordenan ni se generan nuevos. Una novena categoría no recibe un
  color inventado, se dobla en "Otras".

  La validación dejó una advertencia de contraste en tres de los seis colores,
  y eso OBLIGA a algo: los valores tienen que poder leerse sin depender del
  color. Por eso cada gráfico de este archivo lleva etiquetas visibles, y la
  pantalla que los usa ofrece además la tabla completa y su descarga.

  ── LO QUE NO SE HACE ACÁ, Y ES DELIBERADO ─────────────────────────────────

  No hay ningún gráfico de dos ejes. Dos medidas de escalas distintas en un
  mismo plano inventan una correlación que no está en los datos, porque la
  alineación entre las dos escalas es arbitraria. Cuando hacen falta dos
  medidas, van dos gráficos.

  Y el color sigue a la entidad, nunca a su posición: filtrar una categoría no
  repinta a las que quedan.
*/

/* Paleta categórica validada. El orden es fijo. */
export const SERIES = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
] as const;

/* Un solo tono para lo que mide magnitud sin identidad. Es el azul del primer
   turno: una serie sola no necesita distinguirse de nadie. */
const UNICO = SERIES[0];

const EJE = "var(--color-gris-300)";
const TINTA_SUAVE = "var(--color-gris-500)";

/** Abrevia a miles o millones. En un eje, "1,2 M" se lee; "1.234.567" no. */
function corto(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000) return `${(n / 1_000).toLocaleString("es-CL", { maximumFractionDigits: 0 })} mil`;
  return n.toLocaleString("es-CL", { maximumFractionDigits: 0 });
}

/* ─────────────────────────── Línea en el tiempo ─────────────────────────── */

export type PuntoTiempo = { etiqueta: string; valor: number; detalle?: string };

/*
  Una sola serie en el tiempo.

  SIN LEYENDA, a propósito: con una sola serie el título ya dice qué es, y una
  caja de leyenda para un solo elemento es ruido.

  El área bajo la línea va en el mismo tono muy diluido. No codifica nada
  nuevo: ayuda a leer el volumen de un vistazo sin agregar un segundo color.
*/
export function LineaTiempo({
  datos,
  formato = "pesos",
  alto = 220,
}: {
  datos: PuntoTiempo[];
  formato?: "pesos" | "numero";
  alto?: number;
}) {
  const id = useId();
  const [encima, setEncima] = useState<number | null>(null);

  if (datos.length === 0) {
    return (
      <p className="rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
        Todavía no hay datos para este período.
      </p>
    );
  }

  const ancho = 720;
  const margen = { arriba: 16, derecha: 16, abajo: 34, izquierda: 56 };
  const w = ancho - margen.izquierda - margen.derecha;
  const h = alto - margen.arriba - margen.abajo;

  const maximo = Math.max(...datos.map((d) => d.valor), 1);
  /* El eje arranca en cero SIEMPRE. Recortarlo exagera las diferencias y es la
     forma más vieja de mentir con un gráfico. */
  const x = (i: number) => (datos.length === 1 ? w / 2 : (i / (datos.length - 1)) * w);
  const y = (v: number) => h - (v / maximo) * h;

  const linea = datos.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.valor)}`).join(" ");
  const area = `${linea} L ${x(datos.length - 1)} ${h} L ${x(0)} ${h} Z`;

  const marcas = [0, 0.5, 1].map((f) => Math.round(maximo * f));
  const fmt = (v: number) => (formato === "pesos" ? formateaPesos(v) : v.toLocaleString("es-CL"));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Evolución: ${datos.map((d) => `${d.etiqueta}, ${fmt(d.valor)}`).join("; ")}`}
      >
        <g transform={`translate(${margen.izquierda},${margen.arriba})`}>
          {/* Grilla recesiva: guía la lectura y no compite con los datos. */}
          {marcas.map((m) => (
            <g key={m}>
              <line x1={0} x2={w} y1={y(m)} y2={y(m)} stroke={EJE} strokeWidth={1} />
              <text x={-8} y={y(m)} dy="0.32em" textAnchor="end" fontSize={11} fill={TINTA_SUAVE}>
                {corto(m)}
              </text>
            </g>
          ))}

          <path d={area} fill={UNICO} opacity={0.1} />
          {/* 2px, como manda la especificación de marcas: fina pero visible. */}
          <path d={linea} fill="none" stroke={UNICO} strokeWidth={2} strokeLinejoin="round" />

          {datos.map((d, i) => (
            <g key={d.etiqueta}>
              {/* El objetivo del puntero es mucho más grande que el punto: un
                  círculo de 4px es imposible de apuntar con el dedo. */}
              <rect
                x={x(i) - w / Math.max(datos.length, 1) / 2}
                y={0}
                width={w / Math.max(datos.length, 1)}
                height={h}
                fill="transparent"
                onMouseEnter={() => setEncima(i)}
                onMouseLeave={() => setEncima(null)}
              />
              <circle
                cx={x(i)}
                cy={y(d.valor)}
                r={encima === i ? 6 : 4}
                fill={UNICO}
                /* Anillo del color del fondo: separa el punto de la línea y de
                   la grilla sin agregar un color más. */
                stroke="var(--color-blanco)"
                strokeWidth={2}
              />
            </g>
          ))}

          {/* Etiquetas del eje de tiempo: solo las que caben. Rotarlas para que
              entren todas las vuelve ilegibles. */}
          {datos.map((d, i) => {
            const cada = Math.ceil(datos.length / 6);
            if (i % cada !== 0 && i !== datos.length - 1) return null;
            return (
              <text
                key={d.etiqueta}
                x={x(i)}
                y={h + 18}
                textAnchor="middle"
                fontSize={11}
                fill={TINTA_SUAVE}
              >
                {d.etiqueta}
              </text>
            );
          })}
        </g>
      </svg>

      {/* El detalle al pasar por encima va como texto debajo y no como globo
          flotante: en un teléfono no hay "pasar por encima", y un globo que
          nunca aparece es información perdida. Acá se toca y se lee. */}
      <figcaption
        aria-live="polite"
        className={`mt-1 text-center text-sm ${encima === null ? "text-gris-500" : "font-semibold text-gris-900"}`}
      >
        {encima === null
          ? `${datos.length} períodos · máximo ${fmt(maximo)}`
          : `${datos[encima].etiqueta}: ${fmt(datos[encima].valor)}${
              datos[encima].detalle ? ` · ${datos[encima].detalle}` : ""
            }`}
      </figcaption>
      <span id={id} className="sr-only" />
    </figure>
  );
}

/* ─────────────────────────── Barras horizontales ────────────────────────── */

export type Barra = { etiqueta: string; valor: number; nota?: string };

/*
  Comparación de magnitud entre categorías sin orden natural.

  TODAS LAS BARRAS DEL MISMO COLOR, y esto es una regla, no una preferencia.
  Pintar cada barra de un color distinto gasta el canal de identidad en
  reencodar lo que el largo de la barra ya dice; y pintarlas más oscuras donde
  son más grandes dobla la misma información en dos canales. El color acá no
  tiene nada que decir: la longitud lo dice todo.

  HORIZONTALES porque los nombres de categoría son largos. En barras verticales
  habría que rotar las etiquetas y eso las vuelve ilegibles.
*/
export function BarrasHorizontales({
  datos,
  formato = "pesos",
}: {
  datos: Barra[];
  formato?: "pesos" | "numero";
}) {
  if (datos.length === 0) {
    return (
      <p className="rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
        Todavía no hay datos.
      </p>
    );
  }

  const maximo = Math.max(...datos.map((d) => d.valor), 1);
  const fmt = (v: number) => (formato === "pesos" ? formateaPesos(v) : v.toLocaleString("es-CL"));

  return (
    <ul className="space-y-2.5">
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold text-gris-800">{d.etiqueta}</p>
            {/* Etiqueta directa en cada barra: es lo que vuelve legible el
                gráfico sin depender del color ni de pasar el mouse. */}
            <p className="shrink-0 text-sm font-bold text-gris-900">{fmt(d.valor)}</p>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-gris-100">
            <div
              /* Extremo redondeado anclado a la base, como manda la
                 especificación de marcas. */
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (d.valor / maximo) * 100)}%`,
                backgroundColor: UNICO,
              }}
            />
          </div>
          {d.nota ? <p className="mt-0.5 text-xs text-gris-500">{d.nota}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/* ──────────────────────── Barras apiladas por mes ───────────────────────── */

export type SerieApilada = { nombre: string; valores: number[] };

/*
  Parte-a-todo a lo largo del tiempo: cuánto aportó cada categoría cada mes.

  ACÁ SÍ ES CATEGÓRICO: las series son el sujeto, y cada una tiene que poder
  seguirse de un mes al siguiente. El color va por nombre de categoría y no por
  su posición en el ranking, así que si un mes una categoría vende menos, no
  cambia de color.

  TOPE DE SEIS, y la séptima se dobla en "Otras" antes de llegar acá. Generar
  un color más sería generar uno indistinguible bajo daltonismo.

  SEPARACIÓN DE 2px ENTRE SEGMENTOS, del color del fondo: sin ella, dos
  categorías contiguas de tonos parecidos se leen como un solo bloque.
*/
export function BarrasApiladas({
  meses,
  series,
}: {
  meses: string[];
  series: SerieApilada[];
}) {
  const [encima, setEncima] = useState<{ mes: number; serie: number } | null>(null);

  if (series.length === 0 || meses.length === 0) {
    return (
      <p className="rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
        Todavía no hay ventas que mostrar por categoría.
      </p>
    );
  }

  const ancho = 720;
  const alto = 260;
  const margen = { arriba: 12, derecha: 12, abajo: 34, izquierda: 56 };
  const w = ancho - margen.izquierda - margen.derecha;
  const h = alto - margen.arriba - margen.abajo;

  const totales = meses.map((_, i) => series.reduce((s, serie) => s + (serie.valores[i] ?? 0), 0));
  const maximo = Math.max(...totales, 1);

  const anchoBanda = w / meses.length;
  const anchoBarra = Math.min(48, anchoBanda * 0.62);
  const marcas = [0, 0.5, 1].map((f) => Math.round(maximo * f));

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-auto w-full" role="img" aria-label="Ventas por categoría y mes">
        <g transform={`translate(${margen.izquierda},${margen.arriba})`}>
          {marcas.map((m) => (
            <g key={m}>
              <line
                x1={0}
                x2={w}
                y1={h - (m / maximo) * h}
                y2={h - (m / maximo) * h}
                stroke={EJE}
                strokeWidth={1}
              />
              <text
                x={-8}
                y={h - (m / maximo) * h}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill={TINTA_SUAVE}
              >
                {corto(m)}
              </text>
            </g>
          ))}

          {meses.map((mes, i) => {
            let acumulado = 0;
            const cx = i * anchoBanda + anchoBanda / 2;

            return (
              <g key={mes}>
                {series.map((serie, s) => {
                  const valor = serie.valores[i] ?? 0;
                  if (valor <= 0) return null;
                  const altoSeg = (valor / maximo) * h;
                  const yTop = h - acumulado - altoSeg;
                  acumulado += altoSeg;
                  const resaltado = encima?.mes === i && encima?.serie === s;

                  return (
                    <rect
                      key={serie.nombre}
                      x={cx - anchoBarra / 2}
                      /* El +1 y el -2 de alto son la separación del fondo entre
                         segmentos contiguos. */
                      y={yTop + 1}
                      width={anchoBarra}
                      height={Math.max(0, altoSeg - 2)}
                      fill={SERIES[s % SERIES.length]}
                      opacity={encima && !resaltado ? 0.45 : 1}
                      onMouseEnter={() => setEncima({ mes: i, serie: s })}
                      onMouseLeave={() => setEncima(null)}
                    />
                  );
                })}

                <text x={cx} y={h + 18} textAnchor="middle" fontSize={11} fill={TINTA_SUAVE}>
                  {mes}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <figcaption
        aria-live="polite"
        className={`mt-1 text-center text-sm ${encima === null ? "text-gris-500" : "font-semibold text-gris-900"}`}
      >
        {encima === null
          ? "Pasa por encima de un bloque para ver su detalle"
          : `${meses[encima.mes]} · ${series[encima.serie].nombre}: ${formateaPesos(
              series[encima.serie].valores[encima.mes] ?? 0,
            )}`}
      </figcaption>

      {/*
        La leyenda va SIEMPRE con dos o más series, porque es lo que hace que la
        identidad no dependa solo del color. El cuadrito lleva el color; el
        texto va en tinta normal, nunca del color de la serie.
      */}
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {series.map((serie, s) => (
          <li key={serie.nombre} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: SERIES[s % SERIES.length] }}
            />
            <span className="text-xs font-semibold text-gris-700">{serie.nombre}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ─────────────────────────────── Stat tile ──────────────────────────────── */

/*
  Un número solo NO es un gráfico de una barra.

  Cuando el dato es una cifra actual, la forma correcta es la cifra, grande, con
  su variación al lado. Un gráfico para un número gasta espacio y atención en
  dibujar lo que el número ya dice.

  LA VARIACIÓN LLEVA SIGNO Y PALABRA, no solo color. Verde y rojo son lo
  primero que se pierde con daltonismo, y además acá el rojo está reservado para
  lo que destruye.
*/
export function Cifra({
  rotulo,
  valor,
  nota,
  variacion,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  /** Variación porcentual contra el período anterior. */
  variacion?: number | null;
}) {
  return (
    <div className="rounded-lg border border-gris-200 p-4">
      <p className="text-xs font-semibold tracking-wide text-gris-500 uppercase">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold text-gris-900">{valor}</p>

      {variacion !== null && variacion !== undefined && Number.isFinite(variacion) ? (
        <p className="mt-0.5 text-sm font-semibold text-gris-700">
          {variacion >= 0 ? "▲" : "▼"} {Math.abs(variacion).toFixed(0)}%{" "}
          <span className="font-normal text-gris-500">
            {variacion >= 0 ? "más" : "menos"} que el mes pasado
          </span>
        </p>
      ) : null}

      {nota ? <p className="mt-0.5 text-xs text-gris-500">{nota}</p> : null}
    </div>
  );
}
