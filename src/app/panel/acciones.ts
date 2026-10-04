"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  analizaImagen,
  esMimeSoportado,
  MAXIMO_IMAGENES,
  type Hoja,
  type MimeImagen,
} from "@/lib/vision";

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
    if (mensaje.includes("anio_razonable")) {
      return "El año aproximado tiene que estar entre 1500 y 2100.";
    }
    if (mensaje.includes("medidas_positivas")) {
      return "Las medidas, si las cargas, tienen que ser mayores que cero.";
    }
    /*
      El trigger de pieza única. El mensaje de la base ya nombra el producto y
      la cantidad, y está escrito para que lo lea una persona: se devuelve tal
      cual en vez de reemplazarlo por uno genérico que pierde el dato.
    */
    if (mensaje.includes("pieza unica")) {
      return mensaje;
    }
    return "Los datos no cumplen una regla de la base.";
  }
  console.error("Error de base en inventario:", mensaje);
  return "No pude guardar. Revisa los datos e intenta de nuevo.";
}

/*
  Alta de UN producto a partir de varias fotos de la misma pieza.

  CAMBIÓ EL CRITERIO, Y ES EL CAMBIO MÁS GRANDE QUE HA TENIDO ESTA FUNCIÓN.
  Antes una foto podía dar hasta doce productos: se apoyaban seis cosas en una
  mesa, una foto, seis borradores. Ahora las fotos son de UNA pieza, el
  análisis cataloga solo la que está al centro, e ignora el fondo.

  POR QUÉ. Para vender una pieza usada hacen falta tres imágenes de ESA pieza:
  el frente, el reverso, el detalle. Con el criterio anterior, esas tres fotos
  producían tres productos distintos del mismo objeto, y había que borrar dos.
  El fondo de una bodega llena, además, entraba al catálogo como mercadería.

  LAS FOTOS VAN JUNTAS AL MODELO, en una sola llamada. Entre todas describen
  una pieza; de a una producirían tres fichas del mismo objeto. Y cuesta menos:
  un prompt de sistema en vez de tres.

  EL FLUJO ES DE UN SOLO PASO Y TERMINA EN LA FICHA. Se suben las fotos, se
  analiza, se crea el producto en estado BORRADOR y se lleva a la persona a su
  ficha. No hay pantalla intermedia de "confirma estos datos antes de guardar",
  y es deliberado: esa pantalla obliga a decidir con la pieza todavía en la
  mano, y si alguien cierra la pestaña se pierde el análisis que ya se pagó.

  SI EL ANÁLISIS FALLA, se crea igual el producto con sus fotos y sin datos.
  Las fotos son lo que costó ir a buscar la pieza y fotografiarla; perderlas
  porque el modelo no respondió sería perder el trabajo de campo por una falla
  de red.
*/
export async function analizarYCrear(_p: EstadoAccion, datos: FormData): Promise<EstadoAccion> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  /*
    Varias fotos bajo el mismo nombre de campo. getAll y no get: con get solo
    llegaría la primera y las otras dos se perderían en silencio, que es la
    peor forma de perder algo.
  */
  const archivos = datos
    .getAll("fotos")
    .filter((a): a is File => a instanceof File && a.size > 0);

  if (archivos.length === 0) {
    return { error: "Saca o elige al menos una foto." };
  }
  if (archivos.length > MAXIMO_IMAGENES) {
    return { error: `Son demasiadas fotos. El máximo por producto es ${MAXIMO_IMAGENES}.` };
  }

  /*
    La validación deja además el mime ya estrechado al tipo que acepta el
    análisis. Sin esta lista, más abajo habría que volver a comprobarlo o
    forzar el tipo, y forzarlo es desactivar justo la comprobación que evita
    mandarle al modelo un archivo que no puede leer.
  */
  const validados: { archivo: File; mime: MimeImagen }[] = [];
  for (const archivo of archivos) {
    if (archivo.size > TAMANO_MAXIMO) {
      return { error: "Una de las fotos supera los 10 MB. Sácala con menos resolución." };
    }
    if (!esMimeSoportado(archivo.type)) {
      return {
        error: `No puedo leer un archivo de tipo ${archivo.type || "desconocido"}. Usa JPG, PNG o WebP.`,
      };
    }
    validados.push({ archivo, mime: archivo.type });
  }

  const supabase = await crearClienteServidor();

  /*
    Cada ruta lleva un identificador aleatorio y no el nombre original. Dos
    fotos llamadas IMG_0001.jpg son lo normal cuando se descarga de un
    teléfono, y con el nombre original la segunda pisaría a la primera.
  */
  const subidas: { ruta: string; mime: MimeImagen; bytes: Buffer; peso: number }[] = [];

  for (const { archivo, mime } of validados) {
    const extension = archivo.name.includes(".") ? archivo.name.split(".").pop() : "jpg";
    const ruta = `productos/${crypto.randomUUID()}.${extension}`;
    const bytes = Buffer.from(await archivo.arrayBuffer());

    const { error: errorSubida } = await supabase.storage
      .from("fotos")
      .upload(ruta, bytes, { contentType: mime, upsert: false });

    if (errorSubida) {
      console.error("No pude subir una foto:", errorSubida.message);
      /* Lo ya subido se limpia: archivos sueltos que nadie referencia ocupan
         espacio y no se pueden encontrar después. */
      if (subidas.length > 0) {
        await supabase.storage.from("fotos").remove(subidas.map((s) => s.ruta));
      }
      return { error: "No pude guardar las fotos. Revisa el formato y vuelve a intentar." };
    }

    subidas.push({ ruta, mime, bytes, peso: archivo.size });
  }

  const limpiarSubidas = async () => {
    await supabase.storage.from("fotos").remove(subidas.map((s) => s.ruta));
  };

  const { data: categorias } = await supabase
    .from("categorias")
    .select("codigo, nombre, descripcion")
    .eq("activo", true)
    .order("orden");

  /*
    La hoja de referencia, si quien cargó dijo que la pieza está apoyada sobre
    una. Sin ella el modelo devuelve las medidas en null, que es lo correcto:
    sin una referencia de tamaño conocido, estimar centímetros desde una foto
    es inventar.
  */
  const hojaPedida = texto(datos, "hoja");
  const hoja: Hoja | undefined =
    hojaPedida === "carta" || hojaPedida === "a4" ? hojaPedida : undefined;

  const resultado = await analizaImagen(
    subidas.map((s) => ({ datos: s.bytes, mime: s.mime })),
    (categorias ?? []) as { codigo: string; nombre: string; descripcion: string | null }[],
    hoja,
  );

  const detectado = resultado.ok ? resultado.analisis.producto : null;

  /*
    La bitácora se escribe PRIMERO y siempre, también cuando el análisis falló.
    Primero porque el producto apunta a ella, y siempre porque un registro que
    solo guarda los aciertos no sirve para saber qué tan bien funciona esto.

    foto_path guarda la PRIMERA foto. La bitácora registra una llamada, y una
    llamada puede llevar varias imágenes; la primera alcanza para saber de qué
    análisis se trata al revisarlo después.
  */
  const { data: analisisCreado, error: errorAnalisis } = await supabase
    .from("analisis_imagen")
    .insert({
      foto_path: subidas[0].ruta,
      modelo: resultado.ok ? resultado.modelo : "ninguno",
      version_prompt: resultado.ok ? resultado.versionPrompt : "ninguno",
      respuesta: resultado.ok ? (resultado.bruto as object) : { error: resultado.error },
      confianza: detectado?.confianza ?? null,
      productos_detectados: detectado ? 1 : 0,
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

  let categoriaId: string | null = null;
  if (detectado?.categoria_codigo) {
    const { data: categoria } = await supabase
      .from("categorias")
      .select("id")
      .eq("codigo", detectado.categoria_codigo)
      .maybeSingle();
    categoriaId = (categoria as { id: string } | null)?.id ?? null;
  }

  /*
    El producto nace SIN foto_path. Esa columna pasó a ser derivada: la escribe
    el trigger de producto_imagenes con la portada, igual que cantidad la
    escribe el trigger del libro de movimientos. Dos escritores sobre el mismo
    dato terminan, siempre, en dos datos que no coinciden.
  */
  const { data: creado, error } = await supabase
    .from("productos")
    .insert({
      nombre: detectado ? detectado.nombre.slice(0, 200) : "Sin identificar",
      descripcion: detectado
        ? detectado.descripcion
        : resultado.ok
          ? "El análisis no reconoció ninguna pieza al centro de las fotos. Completa los datos a mano."
          : "El análisis de las fotos no se pudo completar. Completa los datos a mano.",
      categoria_id: categoriaId,
      unidad: detectado?.unidad || "unidad",
      precio_estimado_clp: detectado?.precio_estimado_clp ?? null,
      origen: detectado ? "ia" : "manual",
      notas: detectado
        ? detectado.advertencias.length > 0
          ? `Revisar: ${detectado.advertencias.join(" · ")}`
          : null
        : resultado.ok
          ? resultado.analisis.observacion_general || null
          : resultado.error,
      estado: "borrador",
      /* Los atributos del rubro, cuando las fotos alcanzaron para verlos. */
      estado_conservacion: detectado?.estado_conservacion ?? null,
      material: detectado?.material ?? null,
      epoca: detectado?.epoca ?? null,
      /* Las medidas solo entran si hubo hoja Y el modelo pudo compararla. Sin
         las dos cosas quedan vacías y las llena una persona con la huincha. */
      ancho_cm: hoja ? (detectado?.ancho_cm ?? null) : null,
      alto_cm: hoja ? (detectado?.alto_cm ?? null) : null,
      analisis_id: analisisId,
      indice_en_foto: 1,
      creado_por: perfilId,
    })
    .select("id")
    .single();

  if (error) {
    /* Sin producto, los archivos son basura que nadie va a encontrar. */
    await limpiarSubidas();
    return { error: traduce(error.code, error.message) };
  }

  const productoId = (creado as { id: string }).id;

  /*
    Las imágenes, en el orden en que se sacaron. La primera es la portada, y
    ese orden lo decidió quien fotografió: la foto de frente va primero porque
    se saca primero.
  */
  const { error: errorImagenes } = await supabase.from("producto_imagenes").insert(
    subidas.map((s, i) => ({
      producto_id: productoId,
      path: s.ruta,
      bucket: "fotos",
      orden: i,
      mime: s.mime,
      bytes: s.peso,
      creado_por: perfilId,
    })),
  );

  if (errorImagenes) {
    /*
      El producto quedó sin ninguna imagen registrada, que es peor que no
      tenerlo: aparecería vacío en el listado y nadie sabría que sus fotos
      están en el bucket. Se deshace entero.
    */
    console.error("No pude registrar las imágenes:", errorImagenes.message);
    await supabase.from("productos").delete().eq("id", productoId);
    await limpiarSubidas();
    return { error: "No pude guardar las fotos del producto. Intenta de nuevo." };
  }

  /*
    El conteo inicial va por el libro de movimientos y no escribiendo cantidad:
    la cantidad es la suma de su libro, siempre, y saltarse el libro una sola
    vez rompe esa garantía.
  */
  const unidades = detectado?.cantidad_visible;
  if (unidades && unidades > 0) {
    const { error: errorMov } = await supabase.from("movimientos_inventario").insert({
      producto_id: productoId,
      tipo: "ingreso",
      cantidad: unidades,
      motivo: "Conteo inicial estimado desde las fotos. Revisar.",
      creado_por: perfilId,
    });
    if (errorMov) {
      /*
        El producto ya existe, así que esto no es motivo para fallar: se
        registra y queda en cero, que es visible y corregible desde la ficha.
      */
      console.error("No pude registrar el conteo inicial:", errorMov.message);
    }
  }

  revalidatePath("/panel");
  /*
    El aviso de "registrado" viaja en la dirección y no en el estado de la
    acción, porque acá hay un redirect: el estado que devuelve una Server
    Action se pierde al navegar, así que la ficha llegaría sin nada que
    confirmara el alta. Con el parámetro, la ficha lo dibuja al cargar.
  */
  redirect(`/panel/productos/${productoId}?registrado=1`);
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

  /*
    Atributos del rubro de anticuario. Todos opcionales: quien vende
    herramientas no los llena nunca, y exigirlos produciría años y materiales
    inventados con tal de poder guardar.

    Se validan acá ADEMÁS de en la base. El check de la base es la barrera
    real; esto existe para devolver "el año va entre 1500 y 2100" en vez de un
    error de Postgres sobre una restricción cuyo nombre nadie conoce.
  */
  const anio = numero(datos, "anio_aproximado");
  if (anio !== null && (anio < 1500 || anio > 2100)) {
    return { error: "El año aproximado tiene que estar entre 1500 y 2100." };
  }

  const medidas = {
    alto_cm: numero(datos, "alto_cm"),
    ancho_cm: numero(datos, "ancho_cm"),
    profundidad_cm: numero(datos, "profundidad_cm"),
  };
  if (Object.values(medidas).some((m) => m !== null && m <= 0)) {
    return { error: "Las medidas, si las cargas, tienen que ser mayores que cero." };
  }

  const conservacion = texto(datos, "estado_conservacion");
  if (
    conservacion &&
    !["nuevo", "como_nuevo", "buen_estado", "usado", "para_restaurar"].includes(conservacion)
  ) {
    return { error: "Ese estado de conservación no existe." };
  }

  const ubicacionTipo = texto(datos, "ubicacion_tipo");
  if (ubicacionTipo && !["tienda", "bodega"].includes(ubicacionTipo)) {
    return { error: "Esa ubicación no existe. Es en tienda o en bodega." };
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
      ubicacion_tipo: ubicacionTipo || null,
      estado,
      notas: opcional(datos, "notas"),
      estado_conservacion: conservacion || null,
      epoca: opcional(datos, "epoca"),
      anio_aproximado: anio,
      material: opcional(datos, "material"),
      ...medidas,
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
    await requiereRol(PERMISOS.borrarProductos);
  } catch {
    return { error: "Tu rol no permite borrar productos." };
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
    await requiereRol(PERMISOS.borrarProductos);
  } catch {
    return { error: "Tu rol no permite borrar productos." };
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
