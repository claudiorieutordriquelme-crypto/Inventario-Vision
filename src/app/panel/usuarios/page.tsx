import { redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { ListaUsuarios, type UsuarioPanel } from "./piezas";
import type { Rol } from "@/lib/roles";

export const dynamic = "force-dynamic";

const ORDEN_ROL: Record<Rol, number> = { admin: 1, operador: 2, lector: 3 };

export default async function UsuariosPage() {
  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");
  if (!PERMISOS.administrar.includes(perfil.rol)) redirect("/panel");

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nombre, email, rol, activo");

  if (error) {
    console.error("No pude leer los usuarios:", error.message);
  }

  /*
    Se ordena por estado y después por rol. Alfabético puro deja al
    administrador perdido entre los lectores, y el rol es justamente lo que se
    viene a revisar.
  */
  const usuarios = ((data ?? []) as UsuarioPanel[]).sort((a, b) => {
    if (a.activo !== b.activo) return a.activo ? -1 : 1;
    const r = ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol];
    if (r !== 0) return r;
    return (a.nombre || a.email || "").localeCompare(b.nombre || b.email || "", "es");
  });

  const admins = usuarios.filter((u) => u.rol === "admin" && u.activo).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gris-900">Usuarios</h1>
        <p className="mt-1 max-w-prose text-base text-gris-600">
          Acá se cambia el rol de quien ya tiene cuenta y se habilitan o
          deshabilitan cuentas.{" "}
          <strong className="font-semibold text-gris-900">
            No se invita gente nueva desde esta pantalla
          </strong>
          : una persona aparece en esta lista recién después de registrarse. Es
          consecuencia de que la aplicación no usa la llave de servicio de
          Supabase, y esa decisión es deliberada, porque esa llave se salta
          todas las políticas de la base.
        </p>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-acento p-4 text-sm font-medium text-gris-900">
          No pude leer la lista de usuarios. Es un problema de lectura, no que no
          haya ninguno: no cambies roles hasta que esto se resuelva.
        </p>
      ) : usuarios.length === 0 ? (
        <p className="rounded-lg border border-gris-200 p-4 text-sm text-gris-600">
          No hay perfiles cargados, lo que es raro estando tú dentro. Revisa la
          tabla de perfiles en la base.
        </p>
      ) : (
        <ListaUsuarios usuarios={usuarios} idPropio={perfil.id} />
      )}

      <p className="max-w-prose text-sm text-gris-500">
        El sistema no deja que quede sin ningún administrador activo. Hoy hay{" "}
        {admins}. Si fueras el único, primero nombra a otro y después cambia tu
        propio rol.
      </p>
    </div>
  );
}
