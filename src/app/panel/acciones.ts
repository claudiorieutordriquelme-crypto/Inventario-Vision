"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { analizaImagen, esMimeSoportado } from "@/lib/vision";

export type EstadoAccion = { error?: string; ok?: string };

const TAMANO_MAXIMO = 10 * 1024 * 1024;

const texto = (d: FormData, c: string) => String(d.get(c) ?? "").trim();
const opcional = (d: FormData, c: string) => (texto(d, c).length > 0 ? texto(d, c) : null);

function numero(d: FormData, c: string): number | null {
  const v = texto(d, c);
  if (!v) return null;
  /*
    Se acepta la coma decimal: en Chile se escribe 1.500,50 y nadie va a
    cambiar de costumbre por un formulario. Se quitan los puntos de miles
    antes de convertir.
  */
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function traduce(codigo: string | undefined, mensaje: string): string {
  if (codigo === "42501") return "Tu rol no tiene permiso para esta operación.";
  if (codigo === "23505") return "Ya existe un producto con ese SKU.";
  if (codigo === "23503") return "La categoría que elegiste ya no existe.";
  if (codigo === "23514") {
    if (mensaje.includes("confirmado_exige_categoria")) {
      return "Para confirmar un producto hay que asignarle una categoría.";
    }
    if (mensaje.includes("cantidad_no_negativa")) {
      return "La cantidad no puede quedar negativa.";
    }
    if (mensaje.includes("precios_no_negativos")) {
      return "El precio no puede ser negativo.";
    }
    if (mensaje.includes("nombre_no_vacio")) {
      return "El producto necesita un nombre.";
    }
    return "Los datos no cumplen una regla de la base.";
  }
  console.error("Error de base en inventario:", mensaje);
  return "No pude guardar. Revisa los datos e intenta de nuevo.";
}

/*
  Alta de un producto a partir de una foto.

  EL FLUJO ES DE UN SOLO PASO Y TERMINA EN LA FICHA. Se sube la foto, se
  analiza, se crea el producto en estado BORRADOR y se lleva a la persona a su
  ficha para que revise y corrija. No hay una pantalla intermedia de "confirma
  estos datos antes de guardar", y es deliberado: esa pantalla obliga a decidir
  con la foto todavía en la mano y sin poder compararla con el resto del
  inventario, y si alguien cierra la pestaña se pierde el análisis que ya se
  pagó.

  El estado borrador existe justamente para esto: el producto ya está cargado y
  buscable, y lleva escrito que nadie lo ha revisado.

  SI EL ANÁLISIS FALLA, el producto se crea igual con la foto y sin datos. La
  foto es lo que costó ir a la bodega a tomar; perderla porque el modelo no
  respondió sería perder el trabajo de campo por una falla de red.
*/
export async function analizarYCrear(_p: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const archivo = datos.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elige una foto del producto." };
  }
  if (archivo.size > TAMANO_MAXIMO) {
    return { error: "La foto supera los 10 MB. Sácala con menos resolución o comprímela." };
  }
  if (!esMimeSoportado(archivo.type)) {
    return {
      error: `No puedo leer un archivo de tipo ${archivo.type || "desconocido"}. Usa JPG, PNG o WebP.`,
    };
  }

  const supabase = await crearClienteServidor();

  /*
    La ruta lleva un identificador aleatorio y no el nombre original. Dos fotos
    llamadas IMG_0001.jpg son lo normal cuando se descarga de un teléfono, y
    con el nombre original la segunda pisaría a la primera.
  */
  const extension = archivo.name.includes(".") ? archivo.name.split(".").pop() : "jpg";
  const ruta = `productos/${crypto.randomUUID()}.${extension}`;

  const bytes = Buffer.from(await archivo.arrayBuffer());

  const { error: errorSubida } = await supabase.storage
    .from("fotos")
    .upload(ruta, bytes, { contentType: archivo.type, upsert: false });

  if (errorSubida) {
    console.error("No pude subir la foto:", errorSubida.message);
    return { error: "No pude guardar la foto. Revisa el formato y vuelve a intentar." };
  }

  const { data: categorias } = await supabase
    .from("categorias")
    .select("codigo, nombre, descripcion")
    .eq("activo", true)
    .order("orden");

  const resultado = await analizaImagen(
    bytes,
    archivo.type,
    (categorias ?? []) as { codigo: string; nombre: string; descripcion: string | null }[],
  );

  /* Se resuelve la categoría contra la base: el modelo devuelve un código. */
  let categoriaId: string | null = null;
  if (resultado.ok && resultado.analisis.categoria_codigo) {
    const { data } = await supabase
      .from("categorias")
      .select("id")
      .eq("codigo", resultado.analisis.categoria_codigo)
      .maybeSingle();
    categoriaId = (data as { id: string } | null)?.id ?? null;
  }

  const campos = resultado.ok
    ? {
        nombre: resultado.analisis.nombre.slice(0, 200),
        descripcion: resultado.analisis.descripcion,
        categoria_id: categoriaId,
        unidad: resultado.analisis.unidad || "unidad",
        precio_estimado_clp: resultado.analisis.precio_estimado_clp,
        origen: "ia" as const,
        notas:
          resultado.analisis.advertencias.length > 0
            ? `Revisar: ${resultado.analisis.advertencias.join(" · ")}`
            : null,
      }
    : {
        nombre: "Sin identificar",
        descripcion:
          "El análisis de la foto no se pudo completar. Completa los datos a mano o vuelve a analizar desde la ficha.",
        categoria_id: null,
        unidad: "unidad",
        precio_estimado_clp: null,
        origen: "manual" as const,
        notas: resultado.error,
      };

  const { data: creado, error } = await supabase
    .from("productos")
    .insert({
      ...campos,
      estado: "borrador",
      foto_path: ruta,
      foto_bucket: "fotos",
      creado_por: perfilId,
    })
    .select("id")
    .single();

  if (error) {
    /* Sin fila de producto, el archivo es basura que nadie va a encontrar. */
    await supabase.storage.from("fotos").remove([ruta]);
    return { error: traduce(error.code, error.message) };
  }

  const productoId = (creado as { id: string }).id;

  /*
    La bitácora se escribe SIEMPRE, también cuando el análisis falló. Un
    registro que solo guarda los aciertos no sirve para saber qué tan bien
    funciona esto.
  */
  await supabase.from("analisis_imagen").insert({
    producto_id: productoId,
    foto_path: ruta,
    modelo: resultado.ok ? resultado.modelo : "ninguno",
    version_prompt: resultado.ok ? resultado.versionPrompt : "ninguno",
    respuesta: resultado.ok ? (resultado.bruto as object) : { error: resultado.error },
    confianza: resultado.ok ? resultado.analisis.confianza : null,
    tokens_entrada: resultado.ok ? resultado.tokensEntrada : null,
    tokens_salida: resultado.ok ? resultado.tokensSalida : null,
    costo_usd: resultado.ok ? resultado.costoUsd : null,
    duracion_ms: resultado.duracionMs,
    error: resultado.ok ? null : resultado.error,
    creado_por: perfilId,
  });

  /*
    Si el modelo contó unidades, se registra como ingreso inicial. Va por el
    libro y no escribiendo productos.cantidad: la cantidad es la suma de su
    libro, siempre, y saltarse el libro una sola vez rompe esa garantía.
  */
  if (resultado.ok && resultado.analisis.cantidad_visible && resultado.analisis.cantidad_visible > 0) {
    await supabase.from("movimientos_inventario").insert({
      producto_id: productoId,
      tipo: "ingreso",
      cantidad: resultado.analisis.cantidad_visible,
      motivo: "Conteo inicial estimado desde la foto. Revisar.",
      creado_por: perfilId,
    });
  }

  revalidatePath("/panel");
  redirect(`/panel/productos/${productoId}`);
}

/*
  Edición del producto. Todo es modificable, que es lo que se pidió.

  DOS COSAS QUE NO SE TOCAN ACÁ, y no por descuido:
  - precio_estimado_clp: es lo que dijo el modelo. Sobrescribirlo borraría la
    única evidencia de qué tan bien estima, y con ella la posibilidad de saber
    cuánto hay que desconfiar del resto.
  - cantidad: la manda el libro de movimientos. Se cambia registrando un
    movimiento, no escribiendo el total.
*/
export async function actualizarProducto(_p: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const id = texto(datos, "id");
  if (!id) return { error: "Falta el producto." };

  const nombre = texto(datos, "nombre");
  if (!nombre) return { error: "El producto necesita un nombre." };

  const precio = numero(datos, "precio_confirmado_clp");
  if (precio !== null && precio < 0) return { error: "El precio no puede ser negativo." };

  const estado = texto(datos, "estado");
  if (!["borrador", "confirmado", "archivado"].includes(estado)) {
    return { error: "Ese estado no existe." };
  }

  const categoriaId = opcional(datos, "categoria_id");
  if (estado === "confirmado" && !categoriaId) {
    return { error: "Para confirmar un producto hay que asignarle una categoría." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .update({
      nombre,
      descripcion: opcional(datos, "descripcion"),
      categoria_id: categoriaId,
      unidad: texto(datos, "unidad") || "unidad",
      precio_confirmado_clp: precio,
      ubicacion: opcional(datos, "ubicacion"),
      estado,
      notas: opcional(datos, "notas"),
      /*
        Un producto tocado por una persona deja de ser puramente de la IA. Se
        marca mixto para poder distinguir después qué revisó alguien y qué no.
      */
      origen: "mixto",
    })
    .eq("id", id)
    .select("id");

  if (error) return { error: traduce(error.code, error.message) };
  if (!data || data.length === 0) return { error: "Ese producto ya no existe." };

  revalidatePath("/panel");
  revalidatePath(`/panel/productos/${id}`);
  return { ok: "Producto actualizado." };
}

/*
  Movimiento de inventario. Es la ÚNICA forma de cambiar la cantidad.

  El libro es de solo agregar: no hay acción para editar ni borrar un
  movimiento, y la base tampoco tiene política que lo permita. Una corrección
  se hace con un ajuste que compensa, y ese ajuste queda registrado. Así la
  cantidad de un producto siempre se puede reconstruir desde su historial.
*/
export async function registrarMovimiento(
  _p: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const productoId = texto(datos, "producto_id");
  const tipo = texto(datos, "tipo");
  const bruto = numero(datos, "cantidad");

  if (!productoId) return { error: "Falta el producto." };
  if (!["ingreso", "salida", "ajuste"].includes(tipo)) return { error: "Ese tipo no existe." };
  if (bruto === null || bruto === 0) return { error: "La cantidad tiene que ser distinta de cero." };

  /*
    El signo lo pone el tipo, no la persona. Escribir "-5" en una salida es un
    error fácil de cometer y la base lo rechazaría con un mensaje que no
    explica nada; acá se normaliza y se acabó.
  */
  const cantidad =
    tipo === "ingreso" ? Math.abs(bruto) : tipo === "salida" ? -Math.abs(bruto) : bruto;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("movimientos_inventario").insert({
    producto_id: productoId,
    tipo,
    cantidad,
    motivo: opcional(datos, "motivo"),
    creado_por: perfilId,
  });

  if (error) {
    if (error.code === "23514" && error.message.includes("signo_coherente")) {
      return { error: "El signo de la cantidad no corresponde al tipo de movimiento." };
    }
    return { error: traduce(error.code, error.message) };
  }

  revalidatePath("/panel");
  revalidatePath(`/panel/productos/${productoId}`);

  const resumen =
    tipo === "ingreso"
      ? `Ingreso de ${Math.abs(cantidad)} registrado.`
      : tipo === "salida"
        ? `Salida de ${Math.abs(cantidad)} registrada.`
        : `Ajuste de ${cantidad} registrado.`;
  return { ok: resumen };
}

/*
  Borrado de un producto.

  La llave de movimientos_inventario hacia productos es RESTRICT, así que un
  producto con historial no se borra por ningún camino: la base lo impide para
  no dejar un libro apuntando al vacío. Para sacarlo de circulación está el
  estado archivado, que conserva todo.

  Se pide escribir el SKU. No es ceremonia: obliga a mirar cuál se está
  borrando, y en un listado de quinientos productos apretar la fila equivocada
  es el error más fácil de cometer.
*/
export async function eliminarProducto(_p: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  try {
    await requiereRol(PERMISOS.administrar);
  } catch {
    return { error: "Solo un administrador puede borrar un producto." };
  }

  const id = texto(datos, "id");
  const confirmacion = texto(datos, "confirmacion");
  const esperado = texto(datos, "sku_esperado");

  if (!id) return { error: "Falta el producto." };
  if (confirmacion !== esperado) {
    return { error: `Para borrar, escribe exactamente el SKU: ${esperado}` };
  }

  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("productos")
    .delete()
    .eq("id", id)
    .select("sku, foto_path, foto_bucket");

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Este producto tiene movimientos registrados y la base impide borrarlo, para no perder el historial. Cámbialo a Archivado: sale de circulación y conserva su libro.",
      };
    }
    return { error: traduce(error.code, error.message) };
  }
  if (!data || data.length === 0) return { error: "Ese producto ya no existe." };

  /*
    La foto se borra después de la fila y no antes. Al revés, si el borrado de
    la fila fallara quedaría un producto apuntando a un archivo inexistente y
    la ficha mostraría una imagen rota.
  */
  const borrado = data[0] as { sku: string; foto_path: string | null; foto_bucket: string | null };
  if (borrado.foto_path) {
    const { error: errorFoto } = await supabase.storage
      .from(borrado.foto_bucket ?? "fotos")
      .remove([borrado.foto_path]);
    if (errorFoto) {
      console.error("Borré el producto pero no su foto:", errorFoto.message);
    }
  }

  revalidatePath("/panel");
  redirect("/panel");
}
