"use server";

import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoLogin = { error?: string; email?: string };

/*
  Inicio de sesión.

  El correo se devuelve en el estado de error para que el formulario lo vuelva
  a pintar. Sin eso, una contraseña mal escrita borra los dos campos y hay que
  tipear el correo de nuevo, que es la forma más rápida de que alguien deje de
  usar una herramienta.
*/
export async function iniciarSesion(_p: EstadoLogin, datos: FormData): Promise<EstadoLogin> {
  const email = String(datos.get("email") ?? "").trim();
  const password = String(datos.get("password") ?? "");
  const volver = String(datos.get("volver") ?? "").trim();

  if (!email || !password) {
    return { error: "Escribe tu correo y tu contraseña.", email };
  }

  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    /*
      El mensaje NO distingue entre correo inexistente y contraseña incorrecta.
      Distinguirlos convierte el formulario en un verificador de qué correos
      tienen cuenta, que es información que no hace falta dar.
    */
    console.error("Fallo el inicio de sesión:", error.message);
    return { error: "Correo o contraseña incorrectos.", email };
  }

  /*
    Se vuelve a donde iba, si venía de algún lado. El destino se valida: solo
    rutas internas que empiecen con una sola barra. Sin esa comprobación,
    ?volver=https://otro-sitio convierte el login en un redirector abierto.
  */
  const destino = /^\/[^/\\]/.test(volver) ? volver : "/panel";
  redirect(destino);
}

export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect("/login");
}
