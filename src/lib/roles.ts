/*
  Roles y sus etiquetas, en un módulo sin dependencias de servidor.

  Vive aparte de lib/auth porque auth importa el cliente de Supabase de
  servidor, que usa next/headers. Cualquier componente de cliente que importara
  una etiqueta desde auth arrastraría todo ese árbol al navegador y rompería el
  build.

  Acá no hay ninguna decisión de permisos. Eso vive en lib/auth y en las
  políticas RLS, del lado del servidor.
*/

export type Rol = "admin" | "operador" | "lector";

/** De mayor a menor privilegio. */
export const ROLES: Rol[] = ["admin", "operador", "lector"];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Administrador",
  operador: "Operador",
  lector: "Lector",
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  admin: "Acceso total: productos, categorías, usuarios y borrado.",
  operador: "Carga fotos, da de alta productos y registra movimientos. No borra.",
  lector: "Solo lectura del inventario.",
};
