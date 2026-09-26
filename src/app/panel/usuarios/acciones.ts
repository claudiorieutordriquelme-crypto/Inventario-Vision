"use server";

import { revalidatePath } from "next/cache";
import { PERMISOS, obtenerContexto, requiereRol, type Rol } from "@/lib/auth";
import { ROLES } from "@/lib/roles";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoUsuario = { error?: string; ok?: string };

const texto = (d: FormData, c: string) => String(d.get(c) ?? "").trim();

/*
  Cambio de rol y de estado de una cuenta.

  LA GUARDA IMPORTANTE: nunca quedar sin ningún administrador activo. La
  política profiles_admin_all deja que un admin edite cualquier perfil,
  incluido el suyo, así que un administrador que se baja a lector deja el
  sistema sin nadie que pueda tocar categorías, usuarios ni borrar nada. Y
  como esta aplicación no usa service_role a propósito, salir de ese estado
  exigiría entrar a la base por fuera.

  LÍMITE CONOCIDO Y DECLARADO: esta verificación es de aplicación. Dos
  administradores que se degraden en el mismo instante podrían pasar los dos.
  La guarda definitiva es el trigger de
  supabase/migrations/20260903120500_guarda_ultimo_admin.sql.
*/
export async function cambiarUsuario(_p: EstadoUsuario, datos: FormData): Promise<EstadoUsuario> {
  try {
    await requiereRol(PERMISOS.administrar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const id = texto(datos, "id");
  const rol = texto(datos, "rol") as Rol;
  const activo = texto(datos, "activo") === "1";

  if (!id) return { error: "Falta el usuario." };
  if (!ROLES.includes(rol)) return { error: "Ese rol no existe." };

  const supabase = await crearClienteServidor();

  const { data: objetivo, error: errorLectura } = await supabase
    .from("profiles")
    .select("id, nombre, email, rol, activo")
    .eq("id", id)
    .maybeSingle();

  if (errorLectura) {
    console.error("No pude leer el perfil a modificar:", errorLectura.message);
    return { error: "No pude leer ese usuario. Intenta de nuevo." };
  }
  if (!objetivo) return { error: "Ese usuario ya no existe." };

  const perfil = objetivo as { id: string; nombre: string; email: string | null; rol: Rol; activo: boolean };
  const dejaDeSerAdmin = perfil.rol === "admin" && perfil.activo && (rol !== "admin" || !activo);

  if (dejaDeSerAdmin) {
    const { count, error: errorConteo } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("rol", "admin")
      .eq("activo", true);

    if (errorConteo) {
      console.error("No pude contar los administradores:", errorConteo.message);
      return {
        error:
          "No pude comprobar cuántos administradores quedan, así que no voy a hacer el cambio. Intenta de nuevo.",
      };
    }

    if ((count ?? 0) <= 1) {
      const { perfil: propio } = await obtenerContexto();
      return {
        error:
          propio?.id === perfil.id
            ? "Eres el único administrador activo. Nombra a otro antes de cambiar tu propio rol, o nadie va a poder volver a entrar a esta sección."
            : "Es el único administrador activo. Nombra a otro antes de cambiarle el rol.",
      };
    }
  }

  const { error } = await supabase.from("profiles").update({ rol, activo }).eq("id", id);
  if (error) {
    if (error.code === "42501") return { error: "Tu rol no tiene permiso para esto." };
    console.error("No pude actualizar el perfil:", error.message);
    return { error: "No pude guardar el cambio." };
  }

  revalidatePath("/panel/usuarios");

  const quien = perfil.nombre || perfil.email || "El usuario";
  return { ok: `${quien}: ${activo ? "habilitado" : "deshabilitado"}, rol ${rol}.` };
}
