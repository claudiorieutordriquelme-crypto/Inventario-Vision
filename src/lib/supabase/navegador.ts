import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/*
  Cliente para el navegador. Solo lo usa el formulario de inicio de sesión, que
  necesita escribir la cookie de sesión del lado del cliente.

  El resto de la aplicación lee y escribe desde el servidor. Eso no es
  preferencia de estilo: cada consulta desde el navegador es una consulta que
  viaja con la anon key a la vista, y aunque RLS la contenga, es superficie que
  no hace falta abrir.
*/
export function crearClienteNavegador() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
