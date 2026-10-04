"use server";

import { revalidatePath } from "next/cache";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoPresupuesto = { error?: string; ok?: string };

/*
  Cambiar el tope mensual de gasto de la API.

  Es del administrador. El operador ve el recuadro porque necesita saber que
  queda poco antes de salir a sacar cien fotos, pero cuánto se está dispuesto a
  gastar lo decide quien paga.

  requiereRol acá y la política RLS presupuesto_api_admin en la base. Las dos
  cosas, y no una: la política es la barrera real, este chequeo es el que
  permite devolver un mensaje en vez de un error de Postgres.
*/
export async function actualizarPresupuesto(
  _p: EstadoPresupuesto,
  datos: FormData,
): Promise<EstadoPresupuesto> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.administrar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const crudo = String(datos.get("monto_usd_mensual") ?? "").trim();
  if (!crudo) return { error: "Escribe el tope mensual en dólares." };

  /*
    Se acepta la coma decimal: en Chile se escribe 12,50 y nadie va a cambiar
    de costumbre por un formulario. Mismo criterio que el resto de los montos
    de la aplicación.
  */
  const monto = Number(crudo.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: "El tope tiene que ser un monto mayor que cero." };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase
    .from("presupuesto_api")
    .update({ monto_usd_mensual: monto, actualizado_por: perfilId })
    .eq("id", true);

  if (error) {
    if (error.code === "42501") {
      return { error: "Tu rol no tiene permiso para cambiar el presupuesto." };
    }
    console.error("Error al guardar el presupuesto:", error.message);
    return { error: "No pude guardar el tope. Intenta de nuevo." };
  }

  revalidatePath("/panel");
  return { ok: `Tope mensual fijado en USD ${monto}.` };
}
