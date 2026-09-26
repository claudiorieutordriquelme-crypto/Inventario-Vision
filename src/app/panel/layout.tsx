import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ETIQUETA_ROL, obtenerContexto, type Rol } from "@/lib/auth";
import { cerrarSesion } from "@/app/login/acciones";
import { NavPanel, type ItemNav } from "./nav";

export const metadata: Metadata = {
  title: "Inventario",
  robots: { index: false, follow: false },
};

type Seccion = ItemNav & { roles: Rol[] };

const SECCIONES: Seccion[] = [
  { nombre: "Inventario", ruta: "/panel", roles: ["admin", "operador", "lector"] },
  { nombre: "Nuevo con foto", ruta: "/panel/nuevo", roles: ["admin", "operador"] },
  { nombre: "Categorías", ruta: "/panel/categorias", roles: ["admin"] },
  { nombre: "Usuarios", ruta: "/panel/usuarios", roles: ["admin"] },
];

function SinAcceso({ motivo }: { motivo: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-bold text-gris-900">Sin acceso</h1>
      <p className="mt-3 text-base text-gris-600">{motivo}</p>
      <form action={cerrarSesion} className="mt-7">
        <button
          type="submit"
          className="rounded-md border border-gris-300 px-4 py-2.5 text-sm font-semibold text-gris-800 transition-colors hover:border-gris-500"
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, perfil } = await obtenerContexto();

  /*
    Sin sesión el proxy ya debería haber redirigido, pero una Server Function
    invocada desde acá puede llegar sin pasar por él.
  */
  if (!user) redirect("/login");

  /*
    Con sesión pero sin perfil utilizable NO se redirige a /login: el proxy
    vería la sesión ahí y devolvería al panel, en bucle. Se muestra el estado
    y la salida.
  */
  if (!perfil) {
    return (
      <SinAcceso motivo="Tu cuenta existe pero todavía no tiene un perfil asignado, o el sistema no pudo leerlo. Pídele a un administrador que lo revise." />
    );
  }

  if (!perfil.activo) {
    return <SinAcceso motivo="Tu cuenta está deshabilitada. Contacta a un administrador." />;
  }

  const visibles = SECCIONES.filter((s) => s.roles.includes(perfil.rol));

  return (
    <div className="min-h-dvh bg-gris-50">
      <header className="sticky top-0 z-20 border-b border-gris-200 bg-blanco/90 shadow-barra backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-bold tracking-widest text-primario uppercase">Inventario</p>
            <p className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-gris-900">
              <span className="truncate">{perfil.nombre || perfil.email || "Sin nombre"}</span>
              <span className="rounded border border-gris-300 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-gris-600">
                {ETIQUETA_ROL[perfil.rol]}
              </span>
            </p>
          </div>

          <form action={cerrarSesion}>
            <button
              type="submit"
              className="shrink-0 rounded-md border border-gris-300 px-3 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-gris-500"
            >
              <span className="sm:hidden">Salir</span>
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </form>
        </div>

        <NavPanel items={visibles} />
      </header>

      <div className="mx-auto max-w-6xl px-3 py-4 sm:px-5 sm:py-7">
        <div className="rounded-xl border border-gris-200 bg-blanco p-4 shadow-tarjeta sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
