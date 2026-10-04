import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { obtenerDespacho } from "@/lib/datos/comercial";
import { PRESENTACION_DESPACHO, formateaMomento } from "@/lib/formato";
import { Avanzar, Cajas, PorEmbalar } from "./piezas";

export const dynamic = "force-dynamic";

export default async function DespachoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const { despacho, error } = await obtenerDespacho(id);
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-acento p-4 text-sm text-gris-900">
        No pude leer este despacho completo, así que no lo muestro a medias.
        Vuelve a intentar.
      </p>
    );
  }
  if (!despacho) notFound();

  const puedeOperar = PERMISOS.operar.includes(perfil.rol);
  /*
    Un despacho entregado o anulado ya no se toca. Dejar los controles
    encendidos permitiría sacar artículos de una caja que ya llegó a destino, y
    el registro dejaría de describir lo que pasó.
  */
  const editable =
    puedeOperar && despacho.estado !== "entregado" && despacho.estado !== "anulado";

  const pres = PRESENTACION_DESPACHO[despacho.estado];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/delivery" className="text-sm font-semibold text-primario hover:underline">
          Volver a delivery
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-mono text-2xl font-bold text-gris-900 sm:text-3xl">
              {despacho.folio}
            </h1>
            <p className="mt-1 text-base font-semibold text-gris-900">
              {despacho.cliente_nombre ?? "Sin cliente"}
            </p>
            <p className="text-sm text-gris-700">
              {[despacho.direccion, despacho.comuna, despacho.ciudad]
                .filter(Boolean)
                .join(", ") || "Sin dirección"}
            </p>
            {despacho.referencia ? (
              <p className="text-sm text-gris-600">{despacho.referencia}</p>
            ) : null}
            {despacho.telefono ? (
              <p className="text-sm text-gris-600">{despacho.telefono}</p>
            ) : null}
            <p className="mt-1 text-xs text-gris-500">
              Creado {formateaMomento(despacho.created_at)}
              {despacho.entregado_at
                ? ` · Entregado ${formateaMomento(despacho.entregado_at)}`
                : ""}
            </p>
          </div>

          <span
            className={`shrink-0 rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
          >
            {pres.etiqueta}
          </span>
        </div>

        <p className="mt-2 max-w-prose text-sm text-gris-600">{pres.explica}</p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">
          Por embalar
        </h2>
        <PorEmbalar despacho={despacho} cajas={despacho.cajas} editable={editable} />
      </section>

      <Cajas despacho={despacho} editable={editable} />

      {puedeOperar ? <Avanzar despacho={despacho} /> : null}
    </div>
  );
}
