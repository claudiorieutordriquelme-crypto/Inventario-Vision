"use server";

import { revalidatePath } from "next/cache";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { esMimeSoportado, MAXIMO_IMAGENES } from "@/lib/vision";

export type EstadoImagenes = { error?: string; ok?: string };

const TAMANO_MAXIMO = 10 * 1024 * 1024;

/*
  Agregar, quitar y reordenar las imágenes de un producto ya cargado.

  POR QUÉ ESTO EXISTE Y NO ALCANZA CON VOLVER A CARGAR EL PRODUCTO. Hay dos
  situaciones reales: los productos cargados antes de esta regla, que tienen
  una sola foto y necesitan llegar a tres para poder confirmarse; y la foto que
  salió movida y se descubre en la oficina, con la pieza ya guardada.

  NINGUNA DE ESTAS ESCRIBE productos.imagenes NI productos.foto_path. Las dos
  son columnas derivadas que mantiene el trigger producto_imagenes_recalcula,
  por la misma razón que cantidad la mantiene el trigger del libro: dos
  escritores sobre el mismo dato terminan, siempre, en dos datos distintos.
*/

export async function agregarImagenes(
  _p: EstadoImagenes,
  datos: FormData,
): Promise<EstadoImagenes> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const productoId = String(datos.get("producto_id") ?? "").trim();
  if (!productoId) return { error: "Falta el producto." };

  const archivos = datos
    .getAll("fotos")
    .filter((a): a is File => a instanceof File && a.size > 0);

  if (archivos.length === 0) return { error: "Elige al menos una foto." };

  const supabase = await crearClienteServidor();

  /*
    El tope se cuenta contra lo que YA tiene, no contra lo que se está
    subiendo. Sin esto, tres tandas de dos fotos dejarían seis sin que ninguna
    tanda pareciera excesiva.
  */
  const { count, error: errorConteo } = await supabase
    .from("producto_imagenes")
    .select("id", { count: "exact", head: true })
    .eq("producto_id", productoId);

  if (errorConteo) {
    console.error("No pude contar las imágenes:", errorConteo.message);
    return { error: "No pude revisar cuántas imágenes tiene. Intenta de nuevo." };
  }

  const existentes = count ?? 0;
  if (existentes + archivos.length > MAXIMO_IMAGENES) {
    const espacio = Math.max(0, MAXIMO_IMAGENES - existentes);
    return {
      error:
        espacio === 0
          ? `Este producto ya tiene el máximo de ${MAXIMO_IMAGENES} imágenes. Quita alguna antes de agregar otra.`
          : `Solo caben ${espacio} ${espacio === 1 ? "imagen más" : "imágenes más"}: el máximo por producto es ${MAXIMO_IMAGENES}.`,
    };
  }

  for (const archivo of archivos) {
    if (archivo.size > TAMANO_MAXIMO) {
      return { error: "Una de las fotos supera los 10 MB. Sácala con menos resolución." };
    }
    if (!esMimeSoportado(archivo.type)) {
      return {
        error: `No puedo leer un archivo de tipo ${archivo.type || "desconocido"}. Usa JPG, PNG o WebP.`,
      };
    }
  }

  const subidas: { ruta: string; mime: string; peso: number }[] = [];
  for (const archivo of archivos) {
    const extension = archivo.name.includes(".") ? archivo.name.split(".").pop() : "jpg";
    const ruta = `productos/${crypto.randomUUID()}.${extension}`;
    const bytes = Buffer.from(await archivo.arrayBuffer());

    const { error: errorSubida } = await supabase.storage
      .from("fotos")
      .upload(ruta, bytes, { contentType: archivo.type, upsert: false });

    if (errorSubida) {
      console.error("No pude subir una foto:", errorSubida.message);
      if (subidas.length > 0) {
        await supabase.storage.from("fotos").remove(subidas.map((s) => s.ruta));
      }
      return { error: "No pude guardar las fotos. Intenta de nuevo." };
    }
    subidas.push({ ruta, mime: archivo.type, peso: archivo.size });
  }

  /* Las nuevas van al final: la portada no cambia porque alguien agregue un
     detalle tres semanas después. Para cambiarla se reordena a propósito. */
  const { error } = await supabase.from("producto_imagenes").insert(
    subidas.map((s, i) => ({
      producto_id: productoId,
      path: s.ruta,
      bucket: "fotos",
      orden: existentes + i,
      mime: s.mime,
      bytes: s.peso,
      creado_por: perfilId,
    })),
  );

  if (error) {
    await supabase.storage.from("fotos").remove(subidas.map((s) => s.ruta));
    if (error.code === "42501") {
      return { error: "Tu rol no tiene permiso para agregar imágenes." };
    }
    console.error("No pude registrar las imágenes:", error.message);
    return { error: "No pude guardar las fotos. Intenta de nuevo." };
  }

  revalidatePath(`/panel/productos/${productoId}`);
  revalidatePath("/panel");
  return {
    ok: `${subidas.length} ${subidas.length === 1 ? "imagen agregada" : "imágenes agregadas"}.`,
  };
}

export async function quitarImagen(
  _p: EstadoImagenes,
  datos: FormData,
): Promise<EstadoImagenes> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const imagenId = String(datos.get("imagen_id") ?? "").trim();
  const productoId = String(datos.get("producto_id") ?? "").trim();
  if (!imagenId || !productoId) return { error: "Falta la imagen." };

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("producto_imagenes")
    .delete()
    .eq("id", imagenId)
    .select("path, bucket");

  if (error) {
    if (error.code === "23514" && error.message.includes("imagenes")) {
      /* El trigger del mínimo. El mensaje de la base ya está escrito para que
         lo lea una persona y dice cuántas quedan. */
      return { error: error.message };
    }
    if (error.code === "42501") return { error: "Tu rol no tiene permiso para quitar imágenes." };
    console.error("No pude quitar la imagen:", error.message);
    return { error: "No pude quitar la imagen. Intenta de nuevo." };
  }

  const borradas = (data ?? []) as { path: string; bucket: string }[];
  if (borradas.length === 0) return { error: "Esa imagen ya no existe." };

  /*
    EL ARCHIVO NO SE BORRA DEL BUCKET, y es deliberado: la política de storage
    reserva el borrado al administrador, y además un archivo huérfano cuesta
    centavos mientras que una imagen borrada por error no vuelve. La fila se
    va, que es lo que decide qué se muestra.
  */
  revalidatePath(`/panel/productos/${productoId}`);
  revalidatePath("/panel");
  return { ok: "Imagen quitada. El archivo queda guardado por si hay que recuperarlo." };
}

/*
  Reordenar: se recibe el orden completo, no un "sube uno".

  Mandar la lista entera hace la operación idempotente y deja el resultado
  igual aunque dos pestañas la ejecuten: con movimientos relativos, dos
  "subir" simultáneos dejan un orden que no pidió nadie.
*/
export async function reordenarImagenes(
  _p: EstadoImagenes,
  datos: FormData,
): Promise<EstadoImagenes> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const productoId = String(datos.get("producto_id") ?? "").trim();
  const orden = String(datos.get("orden") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (!productoId || orden.length === 0) return { error: "Falta el orden." };

  const supabase = await crearClienteServidor();

  /*
    Una actualización por fila. Son tres o cuatro: no vale la pena una función
    en la base para ahorrar dos viajes, y un fallo a mitad deja un orden
    parcial que se arregla volviendo a ordenar, no un dato corrupto.
  */
  for (let i = 0; i < orden.length; i++) {
    const { error } = await supabase
      .from("producto_imagenes")
      .update({ orden: i })
      .eq("id", orden[i])
      .eq("producto_id", productoId);

    if (error) {
      if (error.code === "42501") {
        return { error: "Tu rol no tiene permiso para reordenar las imágenes." };
      }
      console.error("No pude reordenar las imágenes:", error.message);
      return { error: "No pude guardar el orden. Intenta de nuevo." };
    }
  }

  revalidatePath(`/panel/productos/${productoId}`);
  revalidatePath("/panel");
  return { ok: "Orden guardado. La primera es la portada." };
}
