import { crearClienteServidor } from "@/lib/supabase/servidor";

/*
  Las imágenes de un producto, con su URL ya firmada.

  EL BUCKET ES PRIVADO, así que no hay URL que poner en un <img>: se firma una
  de vida corta por cada imagen, en el servidor, y la pantalla recibe algo que
  ya se puede pintar sin JavaScript de cliente.

  SE FIRMAN TODAS LAS DE ESTE PRODUCTO, que son tres o cuatro. Eso es muy
  distinto de firmar las de quinientos productos para dibujar un listado, que
  es por lo que el listado usa la ruta /panel/foto/[id] y firma de a una.
*/

export type ImagenProducto = {
  id: string;
  path: string;
  bucket: string;
  orden: number;
  mime: string | null;
  bytes: number | null;
  created_at: string;
  /** null si la firma falló. La pantalla lo distingue de "no hay imagen". */
  url: string | null;
};

/** Cinco minutos: alcanza para mirar la ficha, y un enlace copiado no sirve mañana. */
const VIDA_FIRMA = 300;

export async function listarImagenes(
  productoId: string,
): Promise<{ imagenes: ImagenProducto[]; error: string | null }> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("producto_imagenes")
    .select("id, path, bucket, orden, mime, bytes, created_at")
    .eq("producto_id", productoId)
    .order("orden")
    .order("created_at");

  if (error) {
    console.error("No pude leer las imágenes del producto:", error.message);
    return { imagenes: [], error: error.message };
  }

  const filas = (data ?? []) as Omit<ImagenProducto, "url">[];
  if (filas.length === 0) return { imagenes: [], error: null };

  /*
    createSignedUrls firma un lote en una sola llamada, por bucket. En la
    práctica todas están en 'fotos', pero agruparlas evita que el día que haya
    dos buckets esto firme de a una sin que nadie lo note.
  */
  const porBucket = new Map<string, Omit<ImagenProducto, "url">[]>();
  for (const f of filas) {
    const lista = porBucket.get(f.bucket) ?? [];
    lista.push(f);
    porBucket.set(f.bucket, lista);
  }

  const urlPorPath = new Map<string, string>();
  for (const [bucket, lista] of porBucket) {
    const { data: firmas, error: errorFirma } = await supabase.storage
      .from(bucket)
      .createSignedUrls(
        lista.map((f) => f.path),
        VIDA_FIRMA,
      );
    if (errorFirma) {
      console.error("No pude firmar las URL de las imágenes:", errorFirma.message);
      continue;
    }
    for (const firma of firmas ?? []) {
      if (firma.path && firma.signedUrl) urlPorPath.set(firma.path, firma.signedUrl);
    }
  }

  return {
    imagenes: filas.map((f) => ({ ...f, url: urlPorPath.get(f.path) ?? null })),
    error: null,
  };
}
