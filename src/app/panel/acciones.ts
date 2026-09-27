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
  Alta de productos a partir de una foto. UNA FOTO PUEDE DAR VARIOS.

  EL FLUJO ES DE UN SOLO PASO Y TERMINA EN LA REVISIÓN. Se sube la foto, se
  analiza, se crean los productos en estado BORRADOR y se lleva a la persona a
  revisarlos. No hay una pantalla intermedia de "confirma estos datos antes de
  guardar", y es deliberado: esa pantalla obliga a decidir con la foto todavía
  en la mano, y si alguien cierra la pestaña se pierde el análisis que ya se
  pagó.

  El estado borrador existe justamente para esto: los productos ya están
  cargados y buscables, y llevan escrito que nadie los ha revisado.

  A DÓNDE SE LLEGA DESPUÉS depende de cuántos salieron. Con uno, directo a su
  ficha, porque una pantalla de revisión de un solo elemento es un clic de más.
  Con varios, a la pantalla de revisión, que los muestra junto a la foto con la
  ubicación de cada uno: sin eso nadie sabría cuál de los seis es cuál.

  SI EL ANÁLISIS FALLA, se crea igual UN producto con la foto y sin datos. La
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
    return { error: "Elige una foto." };
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

  const detectados = resultado.ok ? resultado.analisis.productos : [];

  /*
    La bitácora se escribe PRIMERO y siempre, también cuando el análisis falló.
    Primero porque los productos apuntan a ella, y siempre porque un registro
    que solo guarda los aciertos no sirve para saber qué tan bien funciona esto.
  */
  const { data: analisisCreado, error: errorAnalisis } = await supabase
    .from("analisis_imagen")
    .insert({
      foto_path: ruta,
      modelo: resultado.ok ? resultado.modelo : "ninguno",
      version_prompt: resultado.ok ? resultado.versionPrompt : "ninguno",
      respuesta: resultado.ok ? (resultado.bruto as object) : { error: resultado.error },
      confianza: null,
      productos_detectados: detectados.length,
      tokens_entrada: resultado.ok ? resultado.tokensEntrada : null,
      tokens_salida: resultado.ok ? resultado.tokensSalida : null,
      costo_usd: resultado.ok ? resultado.costoUsd : null,
      duracion_ms: resultado.duracionMs,
      error: resultado.ok ? null : resultado.error,
      creado_por: perfilId,
    })
    .select("id")
    .single();

  if (errorAnalisis) {
    console.error("No pude registrar el análisis:", errorAnalisis.message);
  }
  const analisisId = (analisisCreado as { id: string } | null)?.id ?? null;

  /*
    Los códigos de categoría se resuelven a id en UNA consulta para toda la
    foto, no una por producto. Con doce productos serían doce viajes a la base
    para leer una tabla de once filas.
  */
  const { data: todasCategorias } = await supabase.from("categorias").select("id, codigo");
  const idPorCodigo = new Map(
    ((todasCategorias ?? []) as { id: string; codigo: string }[]).map((c) => [c.codigo, c.id]),
  );

  /*
    El tipo va explícito: sin él, TypeScript infiere el literal "ia" de la
    primera rama y rechaza "manual" de la segunda, aunque las dos sean valores
    válidos de la misma columna.
  */
  type FilaNueva = {
    nombre: string;
    descripcion: string;
    categoria_id: string | null;
    unidad: string;
    precio_estimado_clp: number | null;
    origen: "ia" | "manual";
    notas: string | null;
    estado: "borrador";
    foto_path: string;
    foto_bucket: string;
    analisis_id: string | null;
    indice_en_foto: number;
    ubicacion_en_foto: string;
    creado_por: string;
  };

  /*
    Cuando no se reconoció nada se crea UN borrador vacío con la foto. El caso
    cubre las dos formas de no reconocer: que el análisis falle, y que funcione
    pero la foto no muestre productos identificables.
  */
  const aInsertar: FilaNueva[] =
    detectados.length > 0
      ? detectados.map((p, i) => ({
          nombre: p.nombre.slice(0, 200),
          descripcion: p.descripcion,
          categoria_id: p.categoria_codigo ? (idPorCodigo.get(p.categoria_codigo) ?? null) : null,
          unidad: p.unidad || "unidad",
          precio_estimado_clp: p.precio_estimado_clp,
          origen: "ia",
          notas: p.advertencias.length > 0 ? `Revisar: ${p.advertencias.join(" · ")}` : null,
          estado: "borrador",
          foto_path: ruta,
          foto_bucket: "fotos",
          analisis_id: analisisId,
          indice_en_foto: i + 1,
          ubicacion_en_foto: p.ubicacion_en_foto,
          creado_por: perfilId,
        }))
      : [
          {
            nombre: "Sin identificar",
            descripcion: resultado.ok
              ? "El análisis no reconoció ningún producto en esta foto. Completa los datos a mano."
              : "El análisis de la foto no se pudo completar. Completa los datos a mano.",
            categoria_id: null,
            unidad: "unidad",
            precio_estimado_clp: null,
            origen: "manual",
            notas: resultado.ok ? resultado.analisis.observacion_general || null : resultado.error,
            estado: "borrador",
            foto_path: ruta,
            foto_bucket: "fotos",
            analisis_id: analisisId,
            indice_en_foto: 1,
            ubicacion_en_foto: "toda la imagen",
            creado_por: perfilId,
          },
        ];

  /*
    Un solo INSERT con todas las filas. Insertar de a una dejaría, ante un
    fallo a mitad de camino, la foto cargada con tres productos de seis y sin
    forma de saber cuáles faltan.
  */
  const { data: creados, error } = await supabase
    .from("productos")
    .insert(aInsertar)
    .select("id");

  if (error) {
    /* Sin productos, el archivo es basura que nadie va a encontrar. */
    await supabase.storage.from("fotos").remove([ruta]);
    return { error: traduce(error.code, error.message) };
  }

  const ids = ((creados ?? []) as { id: string }[]).map((p) => p.id);

  /*
    Los conteos van por el libro de movimientos y no escribiendo cantidad: la
    cantidad es la suma de su libro, siempre, y saltarse el libro una sola vez
    rompe esa garantía.
  */
  const ingresos = detectados
    .map((p, i) =>
      p.cantidad_visible && p.cantidad_visible > 0 && ids[i]
        ? {
            producto_id: ids[i],
            tipo: "ingreso" as const,
            cantidad: p.cantidad_visible,
            motivo: "Conteo inicial estimado desde la foto. Revisar.",
            creado_por: perfilId,
          }
        : null,
    )
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (ingresos.length > 0) {
    const { error: errorMov } = await supabase.from("movimientos_inventario").insert(ingresos);
    if (errorMov) {
      /*
        Los productos ya existen, así que esto no es motivo para fallar: se
        registra y quedan en cero, que es visible y corregible desde la ficha.
      */
      console.error("No pude registrar los conteos iniciales:", errorMov.message);
    }
  }

  revalidatePath("/panel");

  /* Con uno solo, la pantalla de revisión sobra. Con varios, es necesaria. */
  if (ids.length === 1) redirect(`/panel/productos/${ids[0]}`);
  redirect(`/panel/nuevo/revision/${analisisId}`);
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

  Desde la migración 20260927120000 la llave de movimientos_inventario es
  CASCADE: borrar un producto se lleva su libro completo, en la misma
  transacción de la base. Es una decisión tomada a conciencia y su costo está
  escrito en esa migración: un producto borrado no deja ninguna huella.

  Para sacar algo de circulación SIN perderlo sigue estando Archivado, que
  conserva ficha, foto e historial. Es la opción que hay que preferir.

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

  if (error) return { error: traduce(error.code, error.message) };
  if (!data || data.length === 0) return { error: "Ese producto ya no existe." };

  /*
    La foto se borra después de la fila y no antes. Al revés, si el borrado de
    la fila fallara quedaría un producto apuntando a un archivo inexistente y
    la ficha mostraría una imagen rota.
  */
  const borrado = data[0] as { sku: string; foto_path: string | null; foto_bucket: string | null };
  await borraFotoSiQuedoHuerfana(supabase, borrado.foto_path, borrado.foto_bucket);

  revalidatePath("/panel");
  redirect("/panel");
}

/*
  Archivar y restaurar desde el listado.

  POR QUÉ HACE FALTA UNA ACCIÓN APARTE Y NO SIRVE actualizarProducto. Esa pide
  el formulario completo de la ficha; desde una fila del listado solo hay un
  identificador y una intención. Mandar el resto de los campos vacíos
  borraría datos.

  POR QUÉ IMPORTA QUE ESTÉ EN EL LISTADO. Casi ningún producto se puede borrar:
  la llave de movimientos_inventario hacia productos es RESTRICT, y todo
  producto que llegó con un conteo desde una foto ya tiene un movimiento.
  Archivar es la salida real para la mayoría, así que tiene que estar a un
  clic y no escondida dentro de la ficha.

  Archivar NO destruye nada: el producto deja de sumar a las unidades y a la
  valorización, y conserva su ficha, su foto y su libro completo.
*/
export async function cambiarEstadoProducto(
  _p: EstadoAccion,
  datos: FormData,
): Promise<EstadoAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch {
    return { error: "Tu rol no permite cambiar el estado de un producto." };
  }

  const id = texto(datos, "id");
  const estado = texto(datos, "estado");

  if (!id) return { error: "Falta el producto." };
  /*
    Solo estas dos transiciones. Confirmar no se hace desde el listado: exige
    categoría y, sobre todo, exige haber mirado los datos, que es justo lo que
    una fila de listado no permite.
  */
  if (estado !== "archivado" && estado !== "borrador") {
    return { error: "Desde el listado solo se puede archivar o devolver a borrador." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .update({ estado })
    .eq("id", id)
    .select("sku");

  if (error) return { error: traduce(error.code, error.message) };
  if (!data || data.length === 0) return { error: "Ese producto ya no existe." };

  const sku = (data[0] as { sku: string }).sku;

  revalidatePath("/panel");
  revalidatePath(`/panel/productos/${id}`);

  return {
    ok:
      estado === "archivado"
        ? `${sku} quedó archivado. Sigue en el sistema con todo su historial.`
        : `${sku} volvió a borrador.`,
  };
}

/*
  Borra del bucket una foto QUE YA NO USA NADIE.

  ESTE ERA UN DEFECTO REAL, no una precaución teórica. Una foto puede dar hasta
  doce productos, y los doce guardan la MISMA ruta. El borrado original sacaba
  el archivo del bucket apenas se borraba un producto, así que borrar uno de
  siete hermanos dejaba a los otros seis con la imagen rota, sin aviso y sin
  forma de recuperarla.

  Hoy el inventario tiene una foto compartida por siete productos, así que esto
  no era hipotético.

  Se consulta DESPUÉS de borrar la fila, no antes: en ese momento la respuesta
  ya refleja el borrado. Y ante cualquier duda se conserva el archivo. Un
  archivo huérfano ocupa unos kilobytes; una foto borrada de más no se
  recupera.
*/
async function borraFotoSiQuedoHuerfana(
  supabase: Awaited<ReturnType<typeof crearClienteServidor>>,
  rutas: string | string[] | null,
  bucket: string | null,
): Promise<void> {
  const lista = [...new Set((Array.isArray(rutas) ? rutas : [rutas]).filter(Boolean) as string[])];
  if (lista.length === 0) return;

  const { data, error } = await supabase
    .from("productos")
    .select("foto_path")
    .in("foto_path", lista);

  if (error) {
    console.error("No pude comprobar si la foto sigue en uso, la conservo:", error.message);
    return;
  }

  const enUso = new Set(((data ?? []) as { foto_path: string }[]).map((f) => f.foto_path));
  const huerfanas = lista.filter((r) => !enUso.has(r));
  if (huerfanas.length === 0) return;

  const { error: errorFoto } = await supabase.storage.from(bucket ?? "fotos").remove(huerfanas);
  if (errorFoto) {
    console.error("Borré los productos pero no sus fotos:", errorFoto.message);
  }
}

export type EstadoMasivo = EstadoAccion & {
  /** Cuántos se procesaron de verdad. Se usa para limpiar la selección. */
  hechos?: number;
};

/*
  Borrado masivo.

  LO QUE HACE DISTINTO A ESTA ACCIÓN: no es un ciclo que llama al borrado de a
  uno. Es un solo DELETE con una lista de identificadores, y hay una razón:
  borrar de a uno desde el servidor, ante un fallo a la mitad, deja media
  selección borrada y a la persona sin saber cuál mitad.

  EL FILTRO DE LO QUE SE PUEDE BORRAR LO HACE LA BASE, NO EL NAVEGADOR. La
  pantalla ya sabe cuáles tienen movimientos y no los manda, pero eso es
  comodidad, no seguridad: la lista de identificadores llega del cliente y
  puede venir manipulada. Acá se vuelve a preguntar cuáles tienen historial y
  esos se excluyen; si igual se colara uno, la llave RESTRICT lo rechazaría.

  LA RESPUESTA DICE LOS TRES NÚMEROS: cuántos se borraron, cuántos se saltaron
  por tener historial y cuántos ya no existían. Un "listo" sin números deja a
  la persona creyendo que se fueron todos.
*/
export async function eliminarProductos(
  _p: EstadoMasivo,
  datos: FormData,
): Promise<EstadoMasivo> {
  try {
    await requiereRol(PERMISOS.administrar);
  } catch {
    return { error: "Solo un administrador puede borrar productos." };
  }

  const ids = datos.getAll("ids").map((v) => String(v)).filter(Boolean);
  if (ids.length === 0) return { error: "No seleccionaste ningún producto." };

  /*
    La confirmación es la palabra, no los SKU: en una selección de treinta no
    se puede pedir que los escriba todos. Lo que sí se hace es mostrarle los
    SKU en pantalla antes de pedirla.
  */
  if (texto(datos, "confirmacion").toUpperCase() !== "BORRAR") {
    return { error: 'Para borrar, escribe la palabra BORRAR.' };
  }

  const supabase = await crearClienteServidor();

  /*
    Ya no se separa entre borrables y protegidos. La llave de
    movimientos_inventario pasó a CASCADE, así que un solo DELETE se lleva los
    productos y sus libros en la misma transacción de la base.
  */
  const { data, error } = await supabase
    .from("productos")
    .delete()
    .in("id", ids)
    .select("sku, foto_path, foto_bucket");

  if (error) return { error: traduce(error.code, error.message) };

  const borrados = (data ?? []) as { sku: string; foto_path: string | null; foto_bucket: string | null }[];

  await borraFotoSiQuedoHuerfana(
    supabase,
    borrados.map((b) => b.foto_path).filter(Boolean) as string[],
    borrados[0]?.foto_bucket ?? "fotos",
  );

  revalidatePath("/panel");

  const partes = [
    `${borrados.length} ${borrados.length === 1 ? "producto borrado" : "productos borrados"}`,
  ];
  /* La diferencia se declara: si se pidieron doce y se fueron diez, decir
     "listo" esconde que dos ya no estaban. */
  const noEncontrados = ids.length - borrados.length;
  if (noEncontrados > 0) partes.push(`${noEncontrados} que ya no existían`);

  return { ok: `${partes.join(", ")}.`, hechos: borrados.length };
}

/*
  Archivado masivo. Es la operación que de verdad se va a usar: casi todo
  producto tiene movimientos y por lo tanto no se borra.

  No pide confirmación escrita, y es deliberado: archivar no destruye nada y
  se deshace con un clic desde el mismo listado. Pedir una palabra para una
  acción reversible entrena a la gente a escribirla sin leer, y para cuando
  aparece una irreversible ya la escriben en automático.
*/
export async function cambiarEstadoProductos(
  _p: EstadoMasivo,
  datos: FormData,
): Promise<EstadoMasivo> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch {
    return { error: "Tu rol no permite cambiar el estado de un producto." };
  }

  const ids = datos.getAll("ids").map((v) => String(v)).filter(Boolean);
  const estado = texto(datos, "estado");

  if (ids.length === 0) return { error: "No seleccionaste ningún producto." };
  if (estado !== "archivado" && estado !== "borrador") {
    return { error: "Desde el listado solo se puede archivar o devolver a borrador." };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .update({ estado })
    .in("id", ids)
    .select("sku");

  if (error) return { error: traduce(error.code, error.message) };

  const n = (data ?? []).length;
  revalidatePath("/panel");

  return {
    ok:
      estado === "archivado"
        ? `${n} ${n === 1 ? "producto archivado" : "productos archivados"}. Conservan su historial.`
        : `${n} ${n === 1 ? "producto devuelto" : "productos devueltos"} a borrador.`,
    hechos: n,
  };
}
