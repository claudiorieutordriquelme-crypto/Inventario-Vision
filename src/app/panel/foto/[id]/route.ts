import { NextResponse } from "next/server";
import { perfilHabilitado } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export const dynamic = "force-dynamic";

/*
  Sirve la foto de un producto, firmada al momento.

  POR QUÉ HACE FALTA. El bucket es privado: no hay URL pública que poner en un
  <img>. La ficha resuelve esto firmando la URL en el servidor antes de pintar,
  pero el listado no puede hacer lo mismo: firmar quinientas URL para dibujar
  una página en la que se van a mirar dos es desperdiciar el trabajo y el
  tiempo de carga.

  Acá se firma UNA, cuando alguien abre la previsualización de ese producto.

  POR QUÉ UNA REDIRECCIÓN Y NO DEVOLVER LOS BYTES. Redirigir deja que el
  archivo viaje desde el almacenamiento de Supabase directo al navegador, sin
  pasar por este servidor. Proxear la imagen gastaría ancho de banda y memoria
  de la función para no agregar nada.

  LA AUTORIZACIÓN ES REAL, no decorativa: sin perfil habilitado no se firma
  nada. Y quién puede ver qué producto lo decide RLS, porque la consulta va con
  la sesión de quien pide. Alguien que escriba el identificador de un producto
  que no puede leer recibe un 404, no la foto.
*/

/** Cinco minutos. Suficiente para abrir la previsualización, corto para que un enlace copiado no sirva mañana. */
const VIDA_FIRMA = 300;

export async function GET(_peticion: Request, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;

  const perfil = await perfilHabilitado();
  if (!perfil) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("productos")
    .select("foto_path, foto_bucket")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("No pude leer el producto para firmar su foto:", error.message);
    return NextResponse.json({ error: "No pude leer el producto." }, { status: 500 });
  }

  const fila = data as { foto_path: string | null; foto_bucket: string | null } | null;
  if (!fila?.foto_path) {
    return NextResponse.json({ error: "Ese producto no tiene foto." }, { status: 404 });
  }

  const { data: firma, error: errorFirma } = await supabase.storage
    .from(fila.foto_bucket ?? "fotos")
    .createSignedUrl(fila.foto_path, VIDA_FIRMA);

  if (errorFirma || !firma?.signedUrl) {
    console.error("No pude firmar la URL de la foto:", errorFirma?.message);
    return NextResponse.json({ error: "No pude preparar la foto." }, { status: 500 });
  }

  /*
    302 y no 307: es una redirección a un recurso equivalente para un GET, y
    los navegadores la cachean mejor dentro de la vida de la firma. El
    no-store es sobre ESTA respuesta, para que el navegador no reutilice una
    firma vencida cuando se vuelva a abrir la previsualización.
  */
  return NextResponse.redirect(firma.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, no-store" },
  });
}
