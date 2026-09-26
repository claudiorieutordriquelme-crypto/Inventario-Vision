import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/*
  Cliente de Supabase para el servidor.

  Se crea uno por petición y no se comparte: lleva la sesión de quien está
  mirando, y un cliente compartido entre peticiones mezclaría sesiones. En
  Next 16 cookies() es asíncrono, de ahí el await.

  Nunca se usa la service_role key. No existe en este proyecto. Todo lo que la
  aplicación escribe pasa por las políticas RLS con el JWT de la sesión, así que
  la base es la que decide, no el código. Una clave que se salta RLS convierte
  cualquier error de la aplicación en una filtración.
*/
export async function crearClienteServidor() {
  const almacen = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(aEscribir) {
        try {
          for (const { name, value, options } of aEscribir) {
            almacen.set(name, value, options);
          }
        } catch {
          /*
            Desde un Server Component no se pueden escribir cookies. No es un
            error: el proxy ya refrescó la sesión antes de llegar acá, así que
            no hay nada que perder. Tragarlo es correcto solo por esa razón.
          */
        }
      },
    },
  });
}
