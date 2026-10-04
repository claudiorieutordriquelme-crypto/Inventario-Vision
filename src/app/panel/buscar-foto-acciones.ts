"use server";

import { PERMISOS, perfilHabilitado, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { DIMENSIONES, METODO_DESCRIPTOR } from "@/lib/descriptor";

export type Parecido = {
  producto_id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precio_vigente_clp: number | null;
  categoria_nombre: string | null;
  estado: string;
  /** 0..100, redondeado. Lo que se muestra como "87% de parecido". */
  parecido: number;
};

export type EstadoBusquedaFoto = {
  error?: string;
  aviso?: string;
  resultados?: Parecido[];
};

/*
  Buscar productos parecidos a una foto.

  EL VECTOR LLEGA YA CALCULADO DESDE EL NAVEGADOR. La foto no se sube: lo que
  viaja son 256 números. Eso es lo que hace que buscar por foto no cueste nada
  ni deje una imagen suelta en el bucket cada vez que alguien busca.

  Se valida el largo y que sean números finitos. No es paranoia: un vector de
  otro largo hace fallar la consulta con un error de Postgres que no dice nada,
  y uno con NaN devuelve resultados sin sentido ordenados al azar.
*/
export async function buscarPorFoto(
  _p: EstadoBusquedaFoto,
  datos: FormData,
): Promise<EstadoBusquedaFoto> {
  const perfil = await perfilHabilitado();
  if (!perfil) return { error: "Necesitas iniciar sesión." };

  const crudo = String(datos.get("vector") ?? "");
  if (!crudo) return { error: "No pude leer la foto. Intenta con otra." };

  let vector: unknown;
  try {
    vector = JSON.parse(crudo);
  } catch {
    return { error: "No pude leer la foto. Intenta con otra." };
  }

  if (
    !Array.isArray(vector) ||
    vector.length !== DIMENSIONES ||
    !vector.every((n) => typeof n === "number" && Number.isFinite(n))
  ) {
    return { error: "La medición de la foto salió mal. Saca otra." };
  }

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase.rpc("productos_parecidos", {
    p_vector: `[${vector.join(",")}]`,
    p_limite: 12,
  });

  if (error) {
    console.error("No pude buscar por foto:", error.message);
    return { error: "No pude hacer la búsqueda. Intenta de nuevo." };
  }

  const crudos = (data ?? []) as { producto_id: string; parecido: number }[];

  if (crudos.length === 0) {
    /*
      Vacío puede significar dos cosas MUY distintas y hay que separarlas: que
      ninguna foto se parece, o que todavía no hay ninguna imagen medida. La
      segunda se arregla indexando, y decir "no se parece a nada" cuando no hay
      nada contra qué comparar manda a buscar un problema que no existe.
    */
    const { count } = await supabase
      .from("producto_embeddings")
      .select("imagen_id", { count: "exact", head: true });

    if (!count) {
      return {
        aviso:
          "Todavía no hay imágenes medidas, así que no hay contra qué comparar. Arriba en el inventario aparece el botón para medirlas: hay que correrlo una vez.",
        resultados: [],
      };
    }
    return { aviso: "Ninguna pieza del inventario se parece a esa foto.", resultados: [] };
  }

  const porId = new Map(crudos.map((c) => [c.producto_id, c.parecido]));

  const { data: productos, error: errorProductos } = await supabase
    .from("productos")
    .select("id, sku, nombre, cantidad, precio_vigente_clp, estado, categorias(nombre)")
    .in(
      "id",
      crudos.map((c) => c.producto_id),
    );

  if (errorProductos) {
    console.error("No pude leer los productos parecidos:", errorProductos.message);
    return { error: "Encontré coincidencias pero no pude leer los productos." };
  }

  const filas = (productos ?? []) as unknown as {
    id: string;
    sku: string;
    nombre: string;
    cantidad: number;
    precio_vigente_clp: number | null;
    estado: string;
    categorias: { nombre: string } | { nombre: string }[] | null;
  }[];

  const resultados: Parecido[] = filas
    .map((p) => {
      const c = Array.isArray(p.categorias) ? (p.categorias[0] ?? null) : p.categorias;
      return {
        producto_id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        cantidad: Number(p.cantidad),
        precio_vigente_clp: p.precio_vigente_clp,
        categoria_nombre: c?.nombre ?? null,
        estado: p.estado,
        parecido: Math.round((porId.get(p.id) ?? 0) * 100),
      };
    })
    /* El orden lo manda el parecido, no el que haya devuelto la tabla. */
    .sort((a, b) => b.parecido - a.parecido);

  return { resultados };
}

/* ── Indexación ──────────────────────────────────────────────────────────── */

export type ImagenPorIndexar = { imagen_id: string; producto_id: string; url: string };

/*
  Qué imágenes faltan por medir.

  POR QUÉ ESTO EXISTE. Las fotos cargadas antes de que existiera la búsqueda
  por foto no tienen descriptor, y sin él son invisibles para la búsqueda. Esta
  función las lista con su URL firmada para que el navegador de quien indexa
  las cargue, las mida y devuelva los vectores.

  SE MIDE EN EL NAVEGADOR y no en el servidor porque el servidor de Next no
  tiene con qué decodificar un JPEG sin agregar una dependencia nativa, y
  porque así el trabajo pesado lo hace la máquina de quien está mirando en vez
  de la función que atiende a todos.
*/
export async function imagenesPorIndexar(
  limite = 40,
): Promise<{ imagenes: ImagenPorIndexar[]; faltan: number; error: string | null }> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { imagenes: [], faltan: 0, error: e instanceof Error ? e.message : "No autorizado." };
  }

  const supabase = await crearClienteServidor();

  const { data: yaMedidas, error: errorMedidas } = await supabase
    .from("producto_embeddings")
    .select("imagen_id");

  if (errorMedidas) {
    console.error("No pude leer las imágenes ya medidas:", errorMedidas.message);
    return { imagenes: [], faltan: 0, error: "No pude leer las imágenes ya medidas." };
  }

  const medidas = new Set(((yaMedidas ?? []) as { imagen_id: string }[]).map((m) => m.imagen_id));

  const { data: todas, error } = await supabase
    .from("producto_imagenes")
    .select("id, producto_id, path, bucket")
    .order("created_at");

  if (error) {
    console.error("No pude leer las imágenes:", error.message);
    return { imagenes: [], faltan: 0, error: "No pude leer las imágenes." };
  }

  const pendientes = ((todas ?? []) as {
    id: string;
    producto_id: string;
    path: string;
    bucket: string;
  }[]).filter((i) => !medidas.has(i.id));

  const lote = pendientes.slice(0, limite);
  if (lote.length === 0) return { imagenes: [], faltan: 0, error: null };

  const { data: firmas, error: errorFirma } = await supabase.storage
    .from(lote[0].bucket)
    .createSignedUrls(
      lote.map((i) => i.path),
      600,
    );

  if (errorFirma) {
    console.error("No pude firmar las imágenes para indexar:", errorFirma.message);
    return { imagenes: [], faltan: pendientes.length, error: "No pude preparar las imágenes." };
  }

  const urlPorPath = new Map(
    (firmas ?? [])
      .filter((f) => f.path && f.signedUrl)
      .map((f) => [f.path as string, f.signedUrl]),
  );

  return {
    imagenes: lote
      .map((i) => ({ imagen_id: i.id, producto_id: i.producto_id, url: urlPorPath.get(i.path) ?? "" }))
      .filter((i) => i.url),
    faltan: pendientes.length,
    error: null,
  };
}

/** Guarda los vectores que midió el navegador. */
export async function guardarDescriptores(
  medidos: { imagen_id: string; producto_id: string; vector: number[] }[],
): Promise<{ guardados: number; error: string | null }> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { guardados: 0, error: e instanceof Error ? e.message : "No autorizado." };
  }

  const validos = medidos.filter(
    (m) =>
      Array.isArray(m.vector) &&
      m.vector.length === DIMENSIONES &&
      m.vector.every((n) => typeof n === "number" && Number.isFinite(n)),
  );

  if (validos.length === 0) return { guardados: 0, error: null };

  const supabase = await crearClienteServidor();

  const { error } = await supabase.from("producto_embeddings").upsert(
    validos.map((m) => ({
      imagen_id: m.imagen_id,
      producto_id: m.producto_id,
      metodo: METODO_DESCRIPTOR,
      vector: `[${m.vector.join(",")}]`,
    })),
    { onConflict: "imagen_id" },
  );

  if (error) {
    console.error("No pude guardar los descriptores:", error.message);
    return { guardados: 0, error: "No pude guardar las mediciones." };
  }

  return { guardados: validos.length, error: null };
}

/* ── Imágenes de un producto, para la vista rápida ──────────────────────── */

export type ImagenDeProducto = { id: string; url: string | null };

/*
  Las imágenes firmadas de UN producto.

  SE PIDE AL ABRIR LA VISTA RÁPIDA y no al dibujar el listado, por la misma
  razón que /panel/foto/[id] firma de a una: firmar las imágenes de cincuenta
  productos para que alguien mire dos es gastar el trabajo y el tiempo de carga
  en cuarenta y ocho que nadie va a ver.
*/
export async function imagenesDeProducto(
  productoId: string,
): Promise<{ imagenes: ImagenDeProducto[]; error: string | null }> {
  const perfil = await perfilHabilitado();
  if (!perfil) return { imagenes: [], error: "Necesitas iniciar sesión." };

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("producto_imagenes")
    .select("id, path, bucket")
    .eq("producto_id", productoId)
    .order("orden")
    .order("created_at");

  if (error) {
    console.error("No pude leer las imágenes del producto:", error.message);
    return { imagenes: [], error: "No pude leer las imágenes." };
  }

  const filas = (data ?? []) as { id: string; path: string; bucket: string }[];
  if (filas.length === 0) return { imagenes: [], error: null };

  const { data: firmas, error: errorFirma } = await supabase.storage
    .from(filas[0].bucket)
    .createSignedUrls(
      filas.map((f) => f.path),
      300,
    );

  if (errorFirma) {
    console.error("No pude firmar las imágenes:", errorFirma.message);
    return { imagenes: [], error: "No pude preparar las imágenes." };
  }

  const urlPorPath = new Map(
    (firmas ?? [])
      .filter((f) => f.path && f.signedUrl)
      .map((f) => [f.path as string, f.signedUrl]),
  );

  return {
    imagenes: filas.map((f) => ({ id: f.id, url: urlPorPath.get(f.path) ?? null })),
    error: null,
  };
}
