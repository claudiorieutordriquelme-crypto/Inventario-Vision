import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/servidor";

/*
  Credenciales de la cuenta de demostración.

  Viven en la tabla acceso_demo y se leen por la función credenciales_demo(),
  que es SECURITY DEFINER y la ÚNICA función que anon puede ejecutar en todo el
  esquema. No están en el repositorio ni en una variable de entorno, y esa es
  la razón: apagar la demostración es un UPDATE en la base, sin commit y sin
  desplegar.

    update public.acceso_demo set habilitado = false;

  La función devuelve null cuando la demo está apagada o sin clave cargada, y
  entonces el recuadro de la pantalla de login simplemente no se dibuja.

  QUÉ SIGNIFICA QUE ESTO SE IMPRIMA EN PANTALLA. La contraseña queda a la vista
  de cualquiera que abra /login. Es su propósito. Por eso la cuenta publicada
  acá tiene que ser una cuenta que uno esté dispuesto a que use un desconocido:
  hoy es un operador, que puede cargar fotos, y cada foto consume crédito de la
  API de Anthropic.

  Un fallo de lectura devuelve null y no rompe el login: sin recuadro la
  pantalla sigue sirviendo para entrar con una cuenta real, que es lo que
  importa.
*/

export type CredencialesDemo = { email: string; password: string };

export const credencialesDemo = cache(async (): Promise<CredencialesDemo | null> => {
  try {
    const supabase = await crearClienteServidor();
    const { data, error } = await supabase.rpc("credenciales_demo");

    if (error) {
      console.error("No pude leer las credenciales de demostración:", error.message);
      return null;
    }

    /* La función devuelve jsonb: se valida la forma antes de confiar en ella. */
    if (!data || typeof data !== "object") return null;
    const { email, password } = data as Record<string, unknown>;
    if (typeof email !== "string" || typeof password !== "string") return null;
    if (!email.trim() || !password.trim()) return null;

    return { email: email.trim(), password };
  } catch (e) {
    console.error("No pude leer las credenciales de demostración:", e);
    return null;
  }
});
