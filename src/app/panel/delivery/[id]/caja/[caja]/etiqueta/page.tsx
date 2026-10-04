import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { perfilHabilitado } from "@/lib/auth";
import { obtenerDespacho } from "@/lib/datos/comercial";
import { BotonImprimir } from "@/components/boton-imprimir";

export const dynamic = "force-dynamic";

/*
  La etiqueta que se pega en la caja.

  ESTÁ HECHA PARA SALIR EN PAPEL, no para mirarla en pantalla: fondo blanco,
  tinta negra, tamaño fijo y sin un solo elemento de la aplicación alrededor.
  Lo que se imprime es lo que necesita quien recibe la caja y quien la reparte:
  a quién va, a dónde, cuál caja es de cuántas, y qué debería haber adentro.

  EL QR SE GENERA EN EL SERVIDOR Y VA EMBEBIDO COMO SVG. Sin JavaScript de
  cliente y sin una petición más: la etiqueta tiene que poder imprimirse en un
  computador viejo del taller sin que falle nada.

  EL QR LLEVA UNA URL ABSOLUTA. Un teléfono que escanea no tiene contexto de
  dónde salió ese código: una ruta relativa no lleva a ninguna parte.

  Y LA URL NO ES UNA CREDENCIAL. Apunta a una ruta del panel que exige sesión.
  El token es no adivinable para que nadie pueda enumerar las cajas de otro,
  no para reemplazar el inicio de sesión.
*/

export default async function EtiquetaPage({
  params,
}: {
  params: Promise<{ id: string; caja: string }>;
}) {
  const { id, caja: cajaId } = await params;

  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");

  const { despacho } = await obtenerDespacho(id);
  if (!despacho) notFound();

  const caja = despacho.cajas.find((c) => c.id === cajaId);
  if (!caja) notFound();

  /*
    El origen se arma con las cabeceras de la petición y no con una variable de
    entorno: así la etiqueta funciona igual en local, en una vista previa y en
    producción, sin configurar nada que después quede desactualizado.
  */
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  const protocolo = cabeceras.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const destino = `${protocolo}://${host}/panel/caja/${caja.token}`;

  const qr = await QRCode.toString(destino, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });

  return (
    <div className="etiqueta mx-auto max-w-[10cm] bg-blanco p-6 text-negro">
      {/*
        El estilo va en línea y no en el CSS global: es la única pantalla del
        proyecto que se imprime, y mezclar sus reglas con las del panel haría
        que cualquiera de las dos rompa a la otra sin que se note.
      */}
      <style>{`
        @media print {
          /* Fuera del papel: la barra del panel, el menú y todo lo demás. */
          header, nav, .no-imprimir { display: none !important; }
          body { background: #fff !important; margin: 0; }
          .etiqueta { max-width: none; padding: 0.5cm; }
          @page { size: auto; margin: 8mm; }
        }
      `}</style>

      <div className="no-imprimir mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-gris-200 pb-3">
        <p className="text-sm text-gris-600">Pega esta etiqueta en la caja.</p>
        {/* En un teléfono no hay Ctrl+P, y el menú de imprimir está escondido
            con un nombre distinto en cada navegador. */}
        <BotonImprimir>Imprimir etiqueta</BotonImprimir>
      </div>

      <div className="border-2 border-negro p-4">
        <p className="text-xs font-bold tracking-widest uppercase">Despacho</p>
        <p className="font-mono text-2xl font-bold">{despacho.folio}</p>

        <p className="mt-3 text-3xl font-bold">
          Caja {caja.numero} de {despacho.cajas.length}
        </p>

        <div className="mt-4 border-t border-negro pt-3">
          <p className="text-xs font-bold tracking-widest uppercase">Para</p>
          <p className="text-lg font-bold">{despacho.cliente_nombre ?? "Sin cliente"}</p>
          <p className="text-base">
            {[despacho.direccion, despacho.comuna, despacho.ciudad].filter(Boolean).join(", ") ||
              "Sin dirección"}
          </p>
          {despacho.referencia ? <p className="text-sm">{despacho.referencia}</p> : null}
          {despacho.telefono ? <p className="text-sm">{despacho.telefono}</p> : null}
        </div>

        <div className="mt-4 flex items-start gap-4 border-t border-negro pt-3">
          {/* El SVG viene de qrcode, generado acá mismo: no es contenido de un
              usuario, es una imagen derivada de una URL que arma el servidor. */}
          <div
            className="shrink-0"
            aria-label="Código QR de la caja"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-widest uppercase">Contenido</p>
            {caja.items.length === 0 ? (
              <p className="text-sm">Esta caja está vacía.</p>
            ) : (
              <ul className="mt-1 space-y-0.5">
                {caja.items.map((i) => (
                  <li key={i.id} className="text-sm">
                    {i.cantidad} × {i.nombre}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs">
              Escanea el código para ver esta caja en el sistema. Requiere sesión.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
