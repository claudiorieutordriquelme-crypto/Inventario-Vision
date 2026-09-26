/*
  Variables de entorno, validadas al arrancar y no al usarse.

  Una variable que falta se descubre en el momento en que alguien aprieta un
  boton, con un error que no dice nada. Leerlas aca convierte eso en un fallo
  al iniciar, con el nombre exacto de lo que falta.

  Las NEXT_PUBLIC_ viajan al navegador por diseño: la anon key de Supabase esta
  pensada para eso y no da acceso a nada sin una sesion, porque RLS decide.
  ANTHROPIC_API_KEY NO lleva ese prefijo y nunca debe llevarlo: se usa solo en
  el servidor.
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

export const SUPABASE_URL = requerida("NEXT_PUBLIC_SUPABASE_URL");
export const SUPABASE_ANON_KEY = requerida("NEXT_PUBLIC_SUPABASE_ANON_KEY");

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
