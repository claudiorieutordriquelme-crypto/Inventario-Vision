"use server";

import { revalidatePath } from "next/cache";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { FLUJO_DESPACHO } from "@/lib/formato";
import type { EstadoDespacho } from "@/lib/tipos";

export type EstadoDespachoAccion = { error?: string; ok?: string };

const texto = (d: FormData, c: string) => String(d.get(c) ?? "").trim();

function numero(d: FormData, c: string): number | null {
  const v = texto(d, c);
  if (!v) return null;
  const n = Number(v.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/*
  Delivery: cajas, contenido y estado del despacho.

  PERMISOS: despachar es de admin y operador. El lector ve el estado de los
  despachos y no cambia ninguno.
*/

function traduce(codigo: string | undefined, mensaje: string): string {
  if (codigo === "42501") return "Tu rol no tiene permiso para despachar.";
  if (codigo === "23505" && mensaje.includes("caja_items_sin_repetir")) {
    return "Ese artículo ya está en esta caja. Cambia su cantidad en vez de agregarlo otra vez.";
  }
  if (codigo === "23505" && mensaje.includes("cajas_numero_unico")) {
    return "Ya existe una caja con ese número en este despacho.";
  }
  if (codigo === "23514" || codigo === "P0001") {
    /* El trigger que impide embalar más de lo vendido ya dice las cantidades
       exactas. Reemplazarlo perdería el dato que hace entender el problema. */
    return mensaje;
  }
  console.error("Error de base en delivery:", mensaje);
  return "No pude guardar. Intenta de nuevo.";
}

export async function agregarCaja(
  _p: EstadoDespachoAccion,
  datos: FormData,
): Promise<EstadoDespachoAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const despachoId = texto(datos, "despacho_id");
  if (!despachoId) return { error: "Falta el despacho." };

  const supabase = await crearClienteServidor();

  /*
    El número siguiente se calcula leyendo el máximo. Con una sola persona
    armando un despacho eso alcanza; si dos lo hicieran a la vez, la llave
    única (despacho_id, numero) rechaza la segunda y se reintenta. Un
    correlativo en la base para esto sería más maquinaria de la que el caso
    necesita.
  */
  const { data, error: errorMax } = await supabase
    .from("cajas")
    .select("numero")
    .eq("despacho_id", despachoId)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errorMax) {
    console.error("No pude leer las cajas:", errorMax.message);
    return { error: "No pude leer las cajas del despacho." };
  }

  const siguiente = ((data as { numero: number } | null)?.numero ?? 0) + 1;

  const { error } = await supabase
    .from("cajas")
    .insert({ despacho_id: despachoId, numero: siguiente });

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/delivery/${despachoId}`);
  return { ok: `Caja ${siguiente} agregada.` };
}

export async function quitarCaja(
  _p: EstadoDespachoAccion,
  datos: FormData,
): Promise<EstadoDespachoAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const cajaId = texto(datos, "caja_id");
  const despachoId = texto(datos, "despacho_id");
  if (!cajaId || !despachoId) return { error: "Falta la caja." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("cajas").delete().eq("id", cajaId);

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/delivery/${despachoId}`);
  return { ok: "Caja eliminada. Lo que tenía adentro volvió a quedar por embalar." };
}

/** Poner un artículo vendido dentro de una caja. */
export async function embalar(
  _p: EstadoDespachoAccion,
  datos: FormData,
): Promise<EstadoDespachoAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const cajaId = texto(datos, "caja_id");
  const ventaItemId = texto(datos, "venta_item_id");
  const despachoId = texto(datos, "despacho_id");
  const cantidad = numero(datos, "cantidad") ?? 1;

  if (!cajaId || !ventaItemId || !despachoId) return { error: "Falta el artículo o la caja." };
  if (cantidad <= 0) return { error: "La cantidad tiene que ser mayor que cero." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("caja_items").insert({
    caja_id: cajaId,
    venta_item_id: ventaItemId,
    cantidad,
  });

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/delivery/${despachoId}`);
  return { ok: "Artículo embalado." };
}

export async function desembalar(
  _p: EstadoDespachoAccion,
  datos: FormData,
): Promise<EstadoDespachoAccion> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const itemId = texto(datos, "caja_item_id");
  const despachoId = texto(datos, "despacho_id");
  if (!itemId || !despachoId) return { error: "Falta el artículo." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("caja_items").delete().eq("id", itemId);

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/delivery/${despachoId}`);
  return { ok: "Artículo sacado de la caja." };
}

/*
  Avanzar el despacho.

  SOLO SE AVANZA UN PASO A LA VEZ, y hacia adelante. Saltar de pendiente a
  entregado deja sin registrar cuándo se embaló y cuándo salió, que es
  justamente lo que alguien va a preguntar cuando un pedido se pierda. Volver
  atrás no se ofrece: si algo se devolvió, eso es una anulación, no un paso
  hacia atrás en el mismo despacho.
*/
export async function avanzarDespacho(
  _p: EstadoDespachoAccion,
  datos: FormData,
): Promise<EstadoDespachoAccion> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const despachoId = texto(datos, "despacho_id");
  const destino = texto(datos, "estado") as EstadoDespacho;
  if (!despachoId) return { error: "Falta el despacho." };

  const supabase = await crearClienteServidor();
  const { data, error: errorLectura } = await supabase
    .from("despachos")
    .select("estado")
    .eq("id", despachoId)
    .maybeSingle();

  if (errorLectura) {
    console.error("No pude leer el despacho:", errorLectura.message);
    return { error: "No pude leer el despacho." };
  }
  if (!data) return { error: "Ese despacho ya no existe." };

  const actual = (data as { estado: EstadoDespacho }).estado;
  const i = FLUJO_DESPACHO.indexOf(actual);
  const j = FLUJO_DESPACHO.indexOf(destino);

  if (i < 0) return { error: `Un despacho ${actual} ya no avanza.` };
  if (j !== i + 1) {
    return { error: "Solo se puede avanzar al paso siguiente, uno a la vez." };
  }

  /*
    Embalar exige que haya algo embalado. Marcar "embalado" con las cajas
    vacías produce una etiqueta que dice que todo está listo sobre un despacho
    en el que no se guardó nada.
  */
  if (destino === "embalado") {
    const { count, error: errorConteo } = await supabase
      .from("caja_items")
      .select("id, cajas!inner(despacho_id)", { count: "exact", head: true })
      .eq("cajas.despacho_id", despachoId);

    if (errorConteo) {
      console.error("No pude contar lo embalado:", errorConteo.message);
      return { error: "No pude revisar si hay algo en las cajas." };
    }
    if (!count) {
      return { error: "Las cajas están vacías. Pon los artículos adentro antes de marcar embalado." };
    }
  }

  const { error } = await supabase
    .from("despachos")
    .update({
      estado: destino,
      preparado_por: perfilId,
      entregado_at: destino === "entregado" ? new Date().toISOString() : null,
    })
    .eq("id", despachoId);

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath("/panel/delivery");
  revalidatePath(`/panel/delivery/${despachoId}`);
  return { ok: `Despacho marcado como ${destino.replace("_", " ")}.` };
}
