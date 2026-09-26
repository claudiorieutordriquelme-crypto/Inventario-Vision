import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/*
  Proxy (lo que en versiones anteriores de Next se llamaba middleware).

  HACE DOS COSAS Y NINGUNA ES SEGURIDAD:
   1. Refresca la cookie de sesión de Supabase, que expira. Sin esto, una
      pestaña abierta un rato se cae sola.
   2. Redirige a /login cuando no hay sesión, para ahorrar un render.

  La autorización de verdad vive en src/lib/auth.ts y en las políticas RLS. La
  razón es concreta: un matcher que excluye una ruta también excluye las Server
  Functions invocadas desde esa ruta, así que apoyar la seguridad acá deja un
  agujero del tamaño de una expresión regular.
*/
export async function proxy(request: NextRequest) {
  const respuesta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(aEscribir) {
          for (const { name, value } of aEscribir) {
            request.cookies.set(name, value);
          }
          for (const { name, value, options } of aEscribir) {
            respuesta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  /*
    getUser y no getSession: getSession lee la cookie sin validarla, así que
    una cookie vencida pasaría el filtro y el refresco nunca ocurriría.
  */
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const ruta = request.nextUrl.pathname;
  const esLogin = ruta === "/login";
  const esPortada = ruta === "/";

  if (!user && !esLogin && !esPortada) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    /*
      Se guarda a dónde iba para volver ahí después de entrar. Sin esto, quien
      abre un enlace directo a un producto termina en el panel y tiene que
      buscarlo de nuevo.
    */
    destino.searchParams.set("volver", ruta + request.nextUrl.search);
    return NextResponse.redirect(destino);
  }

  if (user && esLogin) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/panel";
    destino.search = "";
    return NextResponse.redirect(destino);
  }

  return respuesta;
}

export const config = {
  /*
    Se excluyen los archivos estáticos y las imágenes. Todo lo demás pasa por
    acá, incluidas las Server Functions, que es justamente lo que hay que
    cuidar al tocar este matcher.
  */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
