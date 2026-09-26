/*
  Variables de entorno, validadas al arrancar y no al usarse.

  Una variable que falta se descubre en el momento en que alguien aprieta un
  boton, con un error que no dice nada. Leerlas aca convierte eso en un fallo
  al iniciar, con el nombre exacto de lo que falta.

  NINGUNA lleva el prefijo NEXT_PUBLIC_, y eso es una decision, no un olvido.

  La anon key de Supabase esta disenada para ser publica y no da acceso a nada
  sin una sesion, porque RLS decide. Podria llevar el prefijo sin riesgo. Pero
  resulta que NINGUN componente de cliente de esta aplicacion usa Supabase:
  todo pasa por Server Components, Server Actions y el proxy, que corren en el
  servidor. El prefijo habria puesto en el paquete del navegador dos valores
  que nadie iba a leer ahi.

  La consecuencia si algun dia hace falta un cliente de navegador, por ejemplo
  para suscripciones en tiempo real: hay que volver a agregarle el prefijo a
  estas dos y crear el cliente con createBrowserClient. Queda anotado para que
  no haya que redescubrirlo.
*/

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor || valor.trim().length === 0) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Cárgala en .env.local para desarrollo y en el panel de Vercel para producción.`,
    );
  }
  return valor.trim();
}

export const SUPABASE_URL = requerida("SUPABASE_URL");
export const SUPABASE_ANON_KEY = requerida("SUPABASE_ANON_KEY");

/*
  La clave de Anthropic se lee perezosamente y no con requerida() al importar.
  El resto de la aplicacion tiene que poder funcionar sin ella: se puede cargar
  inventario a mano, ver los listados y editarlo todo. Lo unico que deja de
  andar es el analisis de fotos, y esa pantalla lo dice en vez de tumbar el
  servidor entero al arrancar.
*/
export function claveAnthropic(): string | null {
  const valor = process.env.ANTHROPIC_API_KEY;
  return valor && valor.trim().length > 0 ? valor.trim() : null;
}

export function hayAnalisisDisponible(): boolean {
  return claveAnthropic() !== null;
}
