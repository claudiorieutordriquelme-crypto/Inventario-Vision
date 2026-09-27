import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type { Rol } from "@/lib/roles";

/*
  Sesión y rol, del lado del servidor.

  Acá está la capa de autorización real de la aplicación, junto con las
  políticas RLS. src/proxy.ts hace un chequeo optimista para redirigir a
  /login, pero eso es comodidad de navegación y no seguridad: un matcher que
  excluye una ruta también excluye las Server Functions invocadas desde esa
  ruta, así que apoyar la seguridad ahí deja un agujero del tamaño de una
  expresión regular.

  Toda Server Action y todo Route Handler verifica el rol por su cuenta.
*/

export type { Rol } from "@/lib/roles";
export { ETIQUETA_ROL, DESCRIPCION_ROL, ROLES } from "@/lib/roles";

export type Perfil = {
  id: string;
  user_id: string;
  nombre: string;
  email: string | null;
  rol: Rol;
  activo: boolean;
};

export type Contexto = {
  /** Sesión validada contra el servidor de Auth. */
  user: User | null;
  /** Fila de profiles. Puede faltar aunque haya sesión. */
  perfil: Perfil | null;
};

/*
  Se devuelven los dos juntos, y no solo el perfil, porque hay que poder
  distinguir "no hay sesión" de "hay sesión pero el perfil está deshabilitado".
  Si los dos casos redirigieran a /login, el segundo entra en bucle: el proxy ve
  la sesión ahí y devuelve al panel, que vuelve a redirigir a /login.

  getUser y no getSession, y la diferencia importa: getSession devuelve lo que
  venga en la cookie sin validarlo contra el servidor de Auth, así que sirve
  para pintar una interfaz pero no para decidir permisos.

  cache() lo memoriza por petición: el layout, la página y cada acción piden
  esto, y sin memorizar serían varias validaciones de token por navegación.
*/
export const obtenerContexto = cache(async (): Promise<Contexto> => {
  const supabase = await crearClienteServidor();

  const {
    data: { user },
    error: errorUsuario,
  } = await supabase.auth.getUser();

  if (errorUsuario || !user) return { user: null, perfil: null };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, nombre, email, rol, activo")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("No pude leer el perfil:", error.message);
    return { user, perfil: null };
  }

  return { user, perfil: (data as Perfil | null) ?? null };
});

/** Perfil solo si hay sesión, existe la fila y está habilitada. */
export async function perfilHabilitado(): Promise<Perfil | null> {
  const { perfil } = await obtenerContexto();
  return perfil && perfil.activo ? perfil : null;
}

export const PERMISOS = {
  /** Ve el inventario. */
  leer: ["admin", "operador", "lector"] as Rol[],
  /** Carga fotos, da de alta y edita productos, registra movimientos. */
  operar: ["admin", "operador"] as Rol[],
  /** Categorías, usuarios y la configuración de la demostración. */
  administrar: ["admin"] as Rol[],
  /*
    Borrar productos. Va aparte de administrar porque el operador lo tiene y
    el resto de lo administrativo no: quien ya puede editar cualquier campo y
    archivar no gana nada protegido al no poder borrar.

    La política RLS productos_delete_operador dice lo mismo del lado de la
    base, y es la que manda. Esto es solo para decidir qué se dibuja.
  */
  borrarProductos: ["admin", "operador"] as Rol[],
};

/*
  Guarda para Server Actions y Route Handlers. Lanza en vez de redirigir a
  propósito: una acción no autorizada tiene que interrumpirse, no continuar y
  confiar en que la base la va a frenar. La base también la va a frenar, y eso
  es defensa en profundidad, no un reemplazo de este chequeo.
*/
export async function requiereRol(roles: Rol[]): Promise<Perfil> {
  const perfil = await perfilHabilitado();

  if (!perfil) {
    throw new Error("Necesitas iniciar sesión para hacer esto.");
  }

  if (!roles.includes(perfil.rol)) {
    throw new Error("Tu rol no tiene permiso para esta acción.");
  }

  return perfil;
}
