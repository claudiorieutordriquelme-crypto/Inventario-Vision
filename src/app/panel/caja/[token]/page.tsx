import Link from "next/link";
import { redirect } from "next/navigation";
import { perfilHabilitado } from "@/lib/auth";
import { cajaPorToken, obtenerDespacho } from "@/lib/datos/comercial";
import { PRESENTACION_DESPACHO, formateaMomento } from "@/lib/formato";

export const dynamic = "force-dynamic";

/*
  Lo que se ve al escanear el QR de una caja.

  EXIGE SESIÓN, como todo el panel. El token del QR es un identificador opaco
  para que nadie pueda enumerar las cajas de otro, no una credencial: si el
  código se cae de la caja en la calle, quien lo encuentre ve una pantalla de
  inicio de sesión, no la dirección de un cliente.

  LO QUE MUESTRA ES LO QUE SIRVE CON LA CAJA EN LA MANO: qué hay adentro, de
  quién es y a dónde va. En ese orden, porque la pregunta de quien escanea casi
  siempre es "¿qué es esto?".
*/
export default async function CajaPorQrPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const { despachoId, cajaId, error } = await cajaPorToken(token);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-acento p-4 text-sm text-gris-900">
        No pude leer este código. Es un problema de lectura, no que el código sea
        inválido: vuelve a intentar.
      </p>
    );
  }

  if (!despachoId || !cajaId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gris-900">Código desconocido</h1>
        <p className="max-w-prose text-base text-gris-600">
          Este código no corresponde a ninguna caja del sistema. Puede ser de una
          caja que se eliminó, o de otro sistema.
        </p>
        <Link href="/panel/delivery" className="text-sm font-semibold text-primario hover:underline">
          Ir a delivery
        </Link>
      </div>
    );
  }

  const { despacho } = await obtenerDespacho(despachoId);
  const caja = despacho?.cajas.find((c) => c.id === cajaId);

  if (!despacho || !caja) {
    return (
      <p className="rounded-lg border border-gris-200 p-6 text-base text-gris-600">
        Esa caja ya no existe.
      </p>
    );
  }

  const pres = PRESENTACION_DESPACHO[despacho.estado];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-gris-500 uppercase">
          Escaneado desde la caja
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gris-900 sm:text-3xl">
          Caja {caja.numero} de {despacho.cajas.length}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-bold text-gris-700">{despacho.folio}</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
          >
            {pres.etiqueta}
          </span>
        </p>
      </div>

      <section>
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Qué lleva adentro
        </h2>
        {caja.items.length === 0 ? (
          <p className="mt-3 rounded-lg border border-gris-200 p-6 text-sm text-gris-600">
            Esta caja está vacía.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gris-100 rounded-lg border border-gris-200">
            {caja.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-base font-semibold text-gris-900">{i.nombre}</p>
                  <p className="mt-0.5 font-mono text-xs text-gris-600">
                    {i.sku} · venta {i.folio}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold text-gris-900">{i.cantidad}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-gris-200 p-4">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">Destino</h2>
        <p className="mt-2 text-base font-bold text-gris-900">
          {despacho.cliente_nombre ?? "Sin cliente"}
        </p>
        <p className="text-base text-gris-700">
          {[despacho.direccion, despacho.comuna, despacho.ciudad].filter(Boolean).join(", ") ||
            "Sin dirección"}
        </p>
        {despacho.referencia ? (
          <p className="text-sm text-gris-600">{despacho.referencia}</p>
        ) : null}
        {despacho.telefono ? (
          /* Enlace de teléfono: quien está en la puerta y no encuentra el
             departamento necesita llamar sin copiar el número a mano. */
          <a
            href={`tel:${despacho.telefono.replace(/\s/g, "")}`}
            className="mt-1 inline-block text-base font-semibold text-primario hover:underline"
          >
            {despacho.telefono}
          </a>
        ) : null}
        <p className="mt-2 text-xs text-gris-500">
          Creado {formateaMomento(despacho.created_at)}
        </p>
      </section>

      <Link
        href={`/panel/delivery/${despacho.id}`}
        className="inline-block rounded-lg border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
      >
        Ver el despacho completo
      </Link>
    </div>
  );
}
