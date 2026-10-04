"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoCliente = { error?: string; ok?: string };

const texto = (d: FormData, c: string) => String(d.get(c) ?? "").trim();
const opcional = (d: FormData, c: string) => (texto(d, c).length > 0 ? texto(d, c) : null);

/*
  Mantenedor de clientes.

  PERMISOS: crear y editar es de admin y operador; desactivar también. Borrar
  de verdad es solo del administrador, y además la llave RESTRICT desde ventas
  lo impide si el cliente tiene historial. Para sacarlo de las listas está el
  campo activo, que es lo que se usa el 99% de las veces.

  DATOS PERSONALES. Esta es la pantalla donde entran nombre, teléfono y
  dirección de gente real. Nada de eso se muestra fuera del panel, y la tabla
  está cerrada a anon como todo lo demás.
*/

function traduce(codigo: string | undefined, mensaje: string): string {
  if (codigo === "42501") return "Tu rol no tiene permiso para esta operación.";
  if (codigo === "23503") {
    return "No puedo borrar este cliente: tiene ventas registradas. Desactívalo, así deja de ofrecerse y su historial se conserva.";
  }
  if (codigo === "23514") {
    if (mensaje.includes("nombre_no_vacio")) return "El cliente necesita un nombre.";
    if (mensaje.includes("calle_no_vacia")) return "La dirección necesita al menos la calle.";
    return "Los datos no cumplen una regla de la base.";
  }
  console.error("Error de base en clientes:", mensaje);
  return "No pude guardar. Revisa los datos e intenta de nuevo.";
}

export async function crearCliente(_p: EstadoCliente, datos: FormData): Promise<EstadoCliente> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const nombre = texto(datos, "nombre");
  if (!nombre) return { error: "El cliente necesita un nombre." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nombre,
      telefono: opcional(datos, "telefono"),
      email: opcional(datos, "email"),
      notas: opcional(datos, "notas"),
      creado_por: perfilId,
    })
    .select("id")
    .single();

  if (error) return { error: traduce(error.code, error.message) };

  /*
    Si vino una dirección en el mismo formulario, se crea junto con el cliente
    y queda como preferida. Pedirla en una segunda pantalla significa que el
    cliente que se creó apurado en medio de un live nunca la va a tener.
  */
  const calle = texto(datos, "calle");
  if (calle) {
    const { error: errorDir } = await supabase.from("cliente_direcciones").insert({
      cliente_id: (data as { id: string }).id,
      etiqueta: opcional(datos, "etiqueta"),
      calle,
      comuna: opcional(datos, "comuna"),
      ciudad: opcional(datos, "ciudad"),
      referencia: opcional(datos, "referencia"),
      preferida: true,
    });
    if (errorDir) {
      /* El cliente ya existe y es utilizable. No se deshace por esto: se avisa
         y la dirección se agrega desde su ficha. */
      console.error("No pude guardar la dirección:", errorDir.message);
      revalidatePath("/panel/clientes");
      redirect(`/panel/clientes/${(data as { id: string }).id}?aviso=direccion`);
    }
  }

  revalidatePath("/panel/clientes");
  redirect(`/panel/clientes/${(data as { id: string }).id}`);
}

export async function actualizarCliente(
  _p: EstadoCliente,
  datos: FormData,
): Promise<EstadoCliente> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const id = texto(datos, "id");
  const nombre = texto(datos, "nombre");
  if (!id) return { error: "Falta el cliente." };
  if (!nombre) return { error: "El cliente necesita un nombre." };

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("clientes")
    .update({
      nombre,
      telefono: opcional(datos, "telefono"),
      email: opcional(datos, "email"),
      notas: opcional(datos, "notas"),
      activo: texto(datos, "activo") === "1",
    })
    .eq("id", id)
    .select("id");

  if (error) return { error: traduce(error.code, error.message) };
  if (!data || data.length === 0) return { error: "Ese cliente ya no existe." };

  revalidatePath(`/panel/clientes/${id}`);
  revalidatePath("/panel/clientes");
  return { ok: "Cliente actualizado." };
}

export async function agregarDireccion(
  _p: EstadoCliente,
  datos: FormData,
): Promise<EstadoCliente> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const clienteId = texto(datos, "cliente_id");
  const calle = texto(datos, "calle");
  if (!clienteId) return { error: "Falta el cliente." };
  if (!calle) return { error: "La dirección necesita al menos la calle." };

  const supabase = await crearClienteServidor();
  const preferida = texto(datos, "preferida") === "1";

  /*
    Marcar una como preferida desmarca las otras. No hay unique que lo obligue
    a propósito: dos preferidas sería un detalle cosmético, y un unique
    forzaría a desmarcar antes de marcar, que es un paso que nadie entiende.
  */
  if (preferida) {
    await supabase
      .from("cliente_direcciones")
      .update({ preferida: false })
      .eq("cliente_id", clienteId);
  }

  const { error } = await supabase.from("cliente_direcciones").insert({
    cliente_id: clienteId,
    etiqueta: opcional(datos, "etiqueta"),
    calle,
    comuna: opcional(datos, "comuna"),
    ciudad: opcional(datos, "ciudad"),
    referencia: opcional(datos, "referencia"),
    preferida,
  });

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath(`/panel/clientes/${clienteId}`);
  return { ok: "Dirección agregada." };
}

export async function quitarDireccion(
  _p: EstadoCliente,
  datos: FormData,
): Promise<EstadoCliente> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const id = texto(datos, "direccion_id");
  const clienteId = texto(datos, "cliente_id");
  if (!id || !clienteId) return { error: "Falta la dirección." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("cliente_direcciones").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      /*
        La llave desde ventas es RESTRICT: una dirección usada en una venta no
        se borra, porque esa venta dice a dónde se mandó. Se desactiva.
      */
      const { error: errorDesactivar } = await supabase
        .from("cliente_direcciones")
        .update({ activa: false })
        .eq("id", id);
      if (errorDesactivar) return { error: traduce(errorDesactivar.code, errorDesactivar.message) };
      revalidatePath(`/panel/clientes/${clienteId}`);
      return {
        ok: "Esta dirección se usó en una venta, así que no se borra: quedó desactivada y deja de ofrecerse.",
      };
    }
    return { error: traduce(error.code, error.message) };
  }

  revalidatePath(`/panel/clientes/${clienteId}`);
  return { ok: "Dirección eliminada." };
}
