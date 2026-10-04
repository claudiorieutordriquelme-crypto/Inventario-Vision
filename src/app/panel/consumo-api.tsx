import { cargarConsumoApi, nivelConsumo } from "@/lib/datos/consumo";
import { formateaNumero } from "@/lib/formato";
import { EditarPresupuesto } from "./consumo-piezas";

/*
  Recuadro de consumo de la API del mes.

  PARA QUE ESTA: para saber cuándo hay que cargar, antes de salir a sacar cien
  fotos y descubrir a mitad de camino que no queda saldo.

  LO QUE MIDE Y LO QUE NO, y por eso lo dice en pantalla: suma los análisis de
  imagen de ESTA aplicación, con la tarifa que estaba vigente en cada llamada.
  No es la factura de Anthropic. Si la misma cuenta se usa para otra cosa, eso
  no aparece acá. Presentarlo como "tu saldo" haría que alguien tome una
  decisión de plata con un número que no es el suyo.

  El porcentaje nunca se comunica solo por color: cada nivel lleva su palabra
  escrita, que es lo único que sobrevive a una pantalla vista a contraluz.
*/
export async function ConsumoApi({ esAdmin }: { esAdmin: boolean }) {
  const { consumo, error } = await cargarConsumoApi();

  /*
    Un fallo de lectura NO se dibuja como 0%. Decir "no has gastado nada"
    cuando lo que pasó es que no se pudo consultar es la conclusión contraria a
    la verdadera, y es la que haría que nadie cargue.
  */
  if (error || !consumo) {
    return (
      <section
        aria-label="Consumo de la API"
        className="rounded-lg border border-gris-200 p-4"
      >
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Consumo del mes
        </h2>
        <p role="alert" className="mt-2 text-sm text-gris-600">
          No pude leer el consumo. Es un problema de lectura, no que no se haya
          gastado nada.
        </p>
      </section>
    );
  }

  const nivel = nivelConsumo(consumo.porcentaje);
  const pct = consumo.porcentaje ?? 0;
  /* La barra se corta en 100 aunque el número siga subiendo: una barra que se
     sale del recuadro no comunica nada que el "168%" escrito no diga mejor. */
  const anchoBarra = Math.max(0, Math.min(100, pct));

  const mes = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(
    new Date(consumo.desde),
  );

  return (
    <section
      aria-label="Consumo de la API"
      className={`rounded-lg border p-4 ${nivel.borde}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Consumo del mes
        </h2>
        <p className="text-sm text-gris-600">{mes}</p>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-3xl font-bold text-gris-900">
          {consumo.porcentaje === null ? "—" : `${consumo.porcentaje}%`}
        </p>
        {/* La palabra va siempre, no es alternativa al color: es el mensaje. */}
        <p className="text-base font-bold text-gris-900">{nivel.palabra}</p>
        <p className="text-sm text-gris-600">
          USD {consumo.costo_usd.toFixed(2)} de {consumo.presupuesto_usd}
        </p>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gris-200"
        role="img"
        aria-label={`${pct}% del presupuesto del mes`}
      >
        <div className={`h-full ${nivel.barra}`} style={{ width: `${anchoBarra}%` }} />
      </div>

      <p className="mt-2 text-sm text-gris-600">{nivel.explica}</p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-gris-100 pt-3 text-sm text-gris-600">
        <div className="flex gap-1">
          <dt className="font-semibold">Análisis:</dt>
          <dd>{formateaNumero(consumo.analisis)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-semibold">Tokens de entrada:</dt>
          <dd>{formateaNumero(consumo.tokens_entrada)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="font-semibold">Tokens de salida:</dt>
          <dd>{formateaNumero(consumo.tokens_salida)}</dd>
        </div>
        {consumo.analisis_fallidos > 0 ? (
          <div className="flex gap-1">
            <dt className="font-semibold">Fallidos:</dt>
            <dd>{formateaNumero(consumo.analisis_fallidos)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="mt-3 text-xs text-gris-500">
        Suma los análisis de imagen de esta aplicación, con la tarifa vigente en
        cada llamada. No es la factura de Anthropic: cualquier otro uso de la
        misma cuenta no aparece acá.
      </p>

      {esAdmin ? <EditarPresupuesto actual={consumo.presupuesto_usd} /> : null}
    </section>
  );
}
