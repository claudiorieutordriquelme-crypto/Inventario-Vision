"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoVentaAccion = { error?: string; ok?: string };

const texto = (d: FormData, c: string) => String(d.get(c) ?? "").trim();
const opcional = (d: FormData, c: string) => (texto(d, c).length > 0 ? texto(d, c) : null);

function numero(d: FormData, c: string): number | null {
  const v = texto(d, c);
  if (!v) return null;
  /* Se acepta la coma decimal: en Chile se escribe 1.500,50. */
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/*
  Punto de venta.

  PERMISOS: vender es de admin y operador. El lector ve las ventas y no puede
  tocar ninguna.

  LO QUE NO SE HACE ACÁ, y es deliberado: confirmar y anular no se arman con
  UPDATE desde este archivo. Son funciones de la base, porque cada una tiene
  que validar stock, escribir el libro de movimientos y cambiar el estado en
  una sola transacción. Hecho con tres llamadas desde acá, una caída en la
  segunda deja stock descontado de una venta que figura en borrador.
*/

function traduce(codigo: string | undefined, mensaje: string): string {
  if (codigo === "42501") return "Tu rol no tiene permiso para vender.";
  if (codigo === "23505" && mensaje.includes("producto_unico")) {
    return "Ese producto ya está en el carrito. Cambia su cantidad en vez de agregarlo de nuevo.";
  }
  if (codigo === "23514" || codigo === "P0001") {
    /*
      Los triggers de pieza única, de stock y de venta cerrada levantan
      mensajes ya escritos para que los lea una persona, y dicen el folio o la
      cantidad exacta. Reemplazarlos por uno genérico perdería ese dato.
    */
    return mensaje;
  }
  console.error("Error de base en la venta:", mensaje);
  return "No pude guardar. Intenta de nuevo.";
}

/*
  Abre un carrito y lleva a él.

  REUSA EL BORRADOR VACÍO QUE YA EXISTA, en vez de crear uno nuevo cada vez.

  El defecto apareció mirando los datos reales: había cuatro ventas, las cuatro
  en borrador y las cuatro con total cero. O sea cuatro carritos abiertos y
  abandonados, uno por cada vez que alguien apretó "Nueva venta" para mirar la
  pantalla. Cada uno consumió un folio del correlativo y quedó ensuciando el
  listado de ventas para siempre.

  Solo se reusa si está VACÍO. Un borrador con productos adentro es trabajo de
  alguien que quedó a medias, y llevarlo ahí sin avisar le mezclaría su carrito
  con la venta nueva.
*/
export async function abrirVenta(): Promise<void> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch {
    redirect("/panel/venta");
  }

  const supabase = await crearClienteServidor();

  const { data: vacias } = await supabase
    .from("ventas")
    .select("id, venta_items(count)")
    .eq("estado", "borrador")
    .eq("vendedor_id", perfilId)
    .order("created_at", { ascending: false })
    .limit(5);

  const sinProductos = ((vacias ?? []) as unknown as {
    id: string;
    venta_items: { count: number }[] | { count: number } | null;
  }[]).find((v) => {
    const c = Array.isArray(v.venta_items) ? v.venta_items[0] : v.venta_items;
    return Number(c?.count ?? 0) === 0;
  });

  if (sinProductos) {
    revalidatePath("/panel/venta");
    redirect(`/panel/venta/${sinProductos.id}`);
  }

  const { data, error } = await supabase
    .from("ventas")
    .insert({ vendedor_id: perfilId })
    .select("id")
    .single();

  if (error) {
    console.error("No pude abrir la venta:", error.message);
    redirect("/panel/venta?error=abrir");
  }

  revalidatePath("/panel/venta");
  redirect(`/panel/venta/${(data as { id: string }).id}`);
}

/*
  Agregar un producto al carrito.

  EL PRECIO SE CONGELA ACÁ. Se lee precio_vigente_clp del producto y se copia a
  la fila. Si mañana cambia el precio del producto, esta venta sigue diciendo
  lo que se cobró. Leerlo al mostrar la venta reescribiría la historia.
*/
export async function agregarAlCarrito(
  _p: EstadoVentaAccion,
  datos: FormData,
): Promise<EstadoVentaAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const ventaId = texto(datos, "venta_id");
  const productoId = texto(datos, "producto_id");
  const cantidad = numero(datos, "cantidad") ?? 1;

  if (!ventaId || !productoId) return { error: "Falta el producto." };
  if (cantidad <= 0) return { error: "La cantidad tiene que ser mayor que cero." };

  const supabase = await crearClienteServidor();

  const { data: producto, error: errorProducto } = await supabase
    .from("productos")
    .select("id, nombre, sku, cantidad, precio_vigente_clp, estado")
    .eq("id", productoId)
    .maybeSingle();

  if (errorProducto) {
    console.error("No pude leer el producto:", errorProducto.message);
    return { error: "No pude leer el producto. Intenta de nuevo." };
  }
  if (!producto) return { error: "Ese producto ya no existe." };

  const p = producto as {
    nombre: string;
    sku: string;
    cantidad: number;
    precio_vigente_clp: number | null;
    estado: string;
  };

  if (p.estado === "archivado") {
    return { error: `${p.nombre} está archivado: no se puede vender.` };
  }
  if (p.precio_vigente_clp === null) {
    return {
      error: `${p.nombre} no tiene precio. Ponle uno en su ficha antes de venderlo.`,
    };
  }
  /*
    El stock se revisa acá además de al confirmar. La base lo vuelve a validar
    al confirmar, que es la barrera real; esto evita armar un carrito entero
    para descubrir al cobrar que no había.
  */
  if (Number(p.cantidad) < cantidad) {
    return {
      error: `De ${p.nombre} hay ${p.cantidad} y estás pidiendo ${cantidad}.`,
    };
  }

  const { error } = await supabase.from("venta_items").insert({
    venta_id: ventaId,
    producto_id: productoId,
    nombre: p.nombre,
    sku: p.sku,
    cantidad,
    precio_unitario_clp: p.precio_vigente_clp,
  });

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/venta/${ventaId}`);
  return { ok: `${p.nombre} agregado.` };
}

export async function cambiarCantidad(
  _p: EstadoVentaAccion,
  datos: FormData,
): Promise<EstadoVentaAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const itemId = texto(datos, "item_id");
  const ventaId = texto(datos, "venta_id");
  const cantidad = numero(datos, "cantidad");

  if (!itemId || !ventaId) return { error: "Falta el artículo." };
  if (cantidad === null || cantidad <= 0) {
    return { error: "La cantidad tiene que ser mayor que cero. Para sacarlo, usa Quitar." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("venta_items")
    .update({ cantidad })
    .eq("id", itemId)
    .eq("venta_id", ventaId);

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/venta/${ventaId}`);
  return { ok: "Cantidad actualizada." };
}

export async function quitarDelCarrito(
  _p: EstadoVentaAccion,
  datos: FormData,
): Promise<EstadoVentaAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const itemId = texto(datos, "item_id");
  const ventaId = texto(datos, "venta_id");
  if (!itemId || !ventaId) return { error: "Falta el artículo." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("venta_items").delete().eq("id", itemId);

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/venta/${ventaId}`);
  return { ok: "Artículo quitado." };
}

/** Canal, tipo de entrega, cliente, dirección y notas. Solo en borrador. */
export async function actualizarVenta(
  _p: EstadoVentaAccion,
  datos: FormData,
): Promise<EstadoVentaAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const ventaId = texto(datos, "venta_id");
  if (!ventaId) return { error: "Falta la venta." };

  const canal = texto(datos, "canal");
  const entrega = texto(datos, "tipo_entrega");
  if (!["tienda", "live"].includes(canal)) return { error: "Ese canal no existe." };
  if (!["retiro_tienda", "despacho"].includes(entrega)) {
    return { error: "Ese tipo de entrega no existe." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("ventas")
    .update({
      canal,
      tipo_entrega: entrega,
      cliente_id: opcional(datos, "cliente_id"),
      /* Cambiar de cliente deja la dirección anterior sin sentido: se borra en
         vez de arrastrar una dirección que es de otra persona. */
      direccion_id: opcional(datos, "direccion_id"),
      notas: opcional(datos, "notas"),
    })
    .eq("id", ventaId);

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/venta/${ventaId}`);
  return { ok: "Venta actualizada." };
}

/*
  Cobrar.

  Todo el trabajo lo hace confirmar_venta() en la base: valida el stock de cada
  ítem, escribe un movimiento de salida por cada uno, cambia el estado y, si la
  entrega es despacho, crea el despacho con su primera caja. En una
  transacción. Acá solo se llama y se traduce el error.
*/
export async function confirmarVenta(
  _p: EstadoVentaAccion,
  datos: FormData,
): Promise<EstadoVentaAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const ventaId = texto(datos, "venta_id");
  const medioPago = texto(datos, "medio_pago");
  const comprobante = texto(datos, "comprobante") || "ninguno";

  if (!ventaId) return { error: "Falta la venta." };
  if (!["efectivo", "debito", "credito", "transferencia", "otro"].includes(medioPago)) {
    return { error: "Elige con qué se pagó." };
  }
  if (!["ninguno", "boleta", "factura"].includes(comprobante)) {
    return { error: "Ese tipo de comprobante no existe." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("confirmar_venta", {
    p_venta: ventaId,
    p_medio_pago: medioPago,
    p_comprobante: comprobante,
    p_numero_comprobante: opcional(datos, "numero_comprobante"),
  });

  if (error) {
    console.error("No pude confirmar la venta:", error.message);
    /* El mensaje de la función ya está escrito para una persona: dice qué
       producto no alcanza y cuánto hay. Devolverlo tal cual es más útil que
       cualquier reemplazo genérico. */
    return { error: error.message };
  }

  revalidatePath("/panel");
  revalidatePath("/panel/venta");
  revalidatePath("/panel/delivery");
  redirect(`/panel/venta/${ventaId}`);
}

export async function anularVenta(
  _p: EstadoVentaAccion,
  datos: FormData,
): Promise<EstadoVentaAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const ventaId = texto(datos, "venta_id");
  const motivo = texto(datos, "motivo");
  if (!ventaId) return { error: "Falta la venta." };
  if (!motivo) return { error: "Una anulación necesita motivo." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.rpc("anular_venta", {
    p_venta: ventaId,
    p_motivo: motivo,
  });

  if (error) {
    console.error("No pude anular la venta:", error.message);
    return { error: error.message };
  }

  revalidatePath("/panel");
  revalidatePath(`/panel/venta/${ventaId}`);
  revalidatePath("/panel/delivery");
  return { ok: "Venta anulada. El stock volvió con un ajuste que quedó registrado." };
}

/*
  Agregar al carrito a partir de un código escaneado.

  ── QUÉ PUEDE TRAER EL CÓDIGO ──────────────────────────────────────────────

  Las etiquetas que imprime esta aplicación llevan la URL de la ficha, así que
  lo normal es ".../panel/productos/<uuid>". Pero alguien va a escanear tarde o
  temprano una etiqueta vieja, una escrita a mano o un código de otro sistema,
  y la pantalla tiene que responder algo útil en vez de quedarse muda.

  Por eso se aceptan tres formas, en este orden:
   1. Una URL de ficha de esta aplicación -> se saca el identificador.
   2. Un identificador suelto.
   3. Un SKU, que es lo que está impreso en texto debajo del código y lo que
      alguien va a teclear si el código se borró.

  Lo que no calce con ninguna devuelve un mensaje que dice qué se leyó. "Código
  no reconocido" a secas obliga a adivinar si el problema fue la etiqueta, la
  cámara o el producto.
*/
export async function agregarPorCodigo(
  _p: EstadoVentaAccion,
  datos: FormData,
): Promise<EstadoVentaAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const ventaId = texto(datos, "venta_id");
  const codigo = texto(datos, "codigo");
  if (!ventaId) return { error: "Falta la venta." };
  if (!codigo) return { error: "No leí ningún código." };

  const supabase = await crearClienteServidor();

  /* El identificador que viene en una URL de ficha, o el código suelto si ya
     es un identificador. */
  const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const enUrl = codigo.match(/\/panel\/productos\/([^/?#\s]+)/i)?.[1];
  const posibleId = enUrl && UUID.test(enUrl) ? enUrl : UUID.test(codigo) ? codigo.match(UUID)?.[0] : null;

  let productoId: string | null = posibleId ?? null;

  if (!productoId) {
    /* Por SKU. Va en mayúsculas porque así se emite y así está impreso. */
    const { data, error } = await supabase
      .from("productos")
      .select("id")
      .eq("sku", codigo.trim().toUpperCase())
      .maybeSingle();

    if (error) {
      console.error("No pude buscar por SKU:", error.message);
      return { error: "No pude leer el producto. Intenta de nuevo." };
    }
    productoId = (data as { id: string } | null)?.id ?? null;
  }

  if (!productoId) {
    /* Se muestra lo leído, recortado: un código largo llenaría la pantalla, y
       los primeros caracteres alcanzan para reconocer de dónde salió. */
    const leido = codigo.length > 40 ? `${codigo.slice(0, 40)}...` : codigo;
    return {
      error: `Ese código no corresponde a ningún producto de este inventario. Leí: ${leido}`,
    };
  }

  /*
    De acá en adelante es exactamente el mismo camino que agregar desde la
    búsqueda por texto: las validaciones de stock, de precio y de pieza única
    tienen que ser las mismas sin importar cómo se eligió el producto.
  */
  const reenvio = new FormData();
  reenvio.set("venta_id", ventaId);
  reenvio.set("producto_id", productoId);
  reenvio.set("cantidad", texto(datos, "cantidad") || "1");

  return agregarAlCarrito({}, reenvio);
}
