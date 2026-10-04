import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { buscarParaVender, listarClientes, obtenerVenta } from "@/lib/datos/comercial";
import { listarCategorias } from "@/lib/datos/inventario";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  ETIQUETA_COMPROBANTE,
  ETIQUETA_ENTREGA,
  ETIQUETA_PAGO,
  PRESENTACION_VENTA,
  formateaMomento,
} from "@/lib/formato";
import type { DireccionCliente } from "@/lib/tipos";
import { Anular, Carrito, Cobrar, DatosVenta, Resultados } from "./piezas";

export const dynamic = "force-dynamic";

/*
  La pantalla de una venta.

  EN BORRADOR ES UN PUNTO DE VENTA: buscador arriba, carrito al lado, cobrar
  abajo. CONFIRMADA ES UN COMPROBANTE: lo mismo, pero sin un solo control que
  permita cambiar algo. Son la misma pantalla porque es la misma venta, y
  partirla en dos obligaría a mantener dos veces el mismo detalle.

  LA BÚSQUEDA VA POR QUERYSTRING, sin JavaScript: el término queda en la
  dirección, el botón atrás funciona, y recargar no pierde el carrito.
*/
export default async function VentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ buscar?: string; categoria?: string }>;
}) {
  const { id } = await params;
  const consulta = await searchParams;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const { venta, error } = await obtenerVenta(id);
  if (error) {
    return (
      <p role="alert" className="rounded-md border border-acento p-4 text-sm text-gris-900">
        No pude leer esta venta completa, así que no la muestro a medias. Es un
        problema de lectura: vuelve a intentar.
      </p>
    );
  }
  if (!venta) notFound();

  const puedeOperar = PERMISOS.operar.includes(perfil.rol);
  const editable = puedeOperar && venta.estado === "borrador";

  /*
    El buscador y las listas de apoyo solo se cargan cuando se pueden usar. En
    una venta confirmada son cuatro consultas que no se van a mirar.
  */
  const [{ resultados }, { clientes }, { categorias }] = editable
    ? await Promise.all([
        buscarParaVender(consulta.buscar, consulta.categoria),
        listarClientes(),
        listarCategorias(true),
      ])
    : [{ resultados: [] }, { clientes: [] }, { categorias: [] }];

  /* Las direcciones de todos los clientes, para que el selector cambie sin
     ir al servidor cada vez que se elige otro cliente. Son pocas. */
  let direcciones: DireccionCliente[] = [];
  if (editable && clientes.length > 0) {
    const supabase = await crearClienteServidor();
    const { data } = await supabase
      .from("cliente_direcciones")
      .select("id, cliente_id, etiqueta, calle, comuna, ciudad, referencia, preferida, activa")
      .eq("activa", true)
      .order("preferida", { ascending: false });
    direcciones = (data ?? []) as DireccionCliente[];
  }

  const pres = PRESENTACION_VENTA[venta.estado];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/venta" className="text-sm font-semibold text-primario hover:underline">
          Volver a ventas
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-mono text-2xl font-bold text-gris-900 sm:text-3xl">
              {venta.folio}
            </h1>
            <p className="mt-0.5 text-sm text-gris-600">
              {ETIQUETA_ENTREGA[venta.tipo_entrega]}
              {venta.cliente_nombre ? ` · ${venta.cliente_nombre}` : ""} ·{" "}
              {formateaMomento(venta.confirmada_at ?? venta.created_at)}
            </p>
          </div>
          <span
            className={`shrink-0 rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
          >
            {pres.etiqueta}
          </span>
        </div>

        <p className="mt-2 max-w-prose text-sm text-gris-600">{pres.explica}</p>

        {venta.estado === "anulada" && venta.motivo_anulacion ? (
          <p className="mt-2 max-w-prose text-sm text-gris-700">
            <span className="font-semibold">Motivo:</span> {venta.motivo_anulacion}
          </p>
        ) : null}
      </div>

      {editable ? (
        <section>
          <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
            Buscar productos
          </h2>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="text-sm font-semibold text-gris-800">Nombre o SKU</span>
              <input
                name="buscar"
                defaultValue={consulta.buscar ?? ""}
                autoFocus
                placeholder="Taza, muñeca, MEN-0004"
                className="mt-1.5 w-full rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
              />
              <span className="mt-1 block text-xs text-gris-500">
                Tolera errores de tipeo y no distingue acentos.
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-gris-800">Categoría</span>
              <select
                name="categoria"
                defaultValue={consulta.categoria ?? ""}
                className="mt-1.5 rounded-md border border-gris-300 px-3 py-2.5 text-base text-gris-900 outline-none focus:border-primario focus:ring-2 focus:ring-primario/30"
              >
                <option value="">Todas</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
            >
              Buscar
            </button>
          </form>

          <Resultados
            ventaId={venta.id}
            resultados={resultados}
            buscado={Boolean(consulta.buscar || consulta.categoria)}
          />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-bold tracking-widest text-gris-500 uppercase">
          {venta.estado === "borrador" ? "Carrito" : "Detalle"}
        </h2>
        <Carrito venta={venta} editable={editable} />
      </section>

      {editable ? (
        <>
          <DatosVenta venta={venta} clientes={clientes} direcciones={direcciones} />
          <Cobrar venta={venta} />
        </>
      ) : (
        <section className="rounded-lg border border-gris-200 p-4">
          <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">Cobro</h2>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="font-semibold text-gris-800">Pago:</dt>
              <dd className="text-gris-700">
                {venta.medio_pago ? ETIQUETA_PAGO[venta.medio_pago] : "—"}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="font-semibold text-gris-800">Comprobante:</dt>
              <dd className="text-gris-700">
                {ETIQUETA_COMPROBANTE[venta.comprobante]}
                {venta.numero_comprobante ? ` ${venta.numero_comprobante}` : ""}
              </dd>
            </div>
          </dl>
        </section>
      )}

      {puedeOperar && venta.estado === "confirmada" ? <Anular venta={venta} /> : null}
    </div>
  );
}
