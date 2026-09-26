"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/*
  Menú del panel.

  Client Component por una sola razón: usePathname, para marcar la sección
  actual. Sin eso, en una pantalla chica no hay forma de saber dónde estás.

  En móvil la fila se desliza en vez de romperse en tres líneas: envolver
  cinco secciones en un teléfono empuja el contenido media pantalla hacia
  abajo, y deslizar es el gesto que la gente ya conoce.
*/
export type ItemNav = { nombre: string; ruta: string };

export function NavPanel({ items }: { items: ItemNav[] }) {
  const ruta = usePathname();

  const activa = (destino: string) =>
    destino === "/panel" ? ruta === "/panel" : ruta.startsWith(destino);

  return (
    <nav aria-label="Secciones" className="border-t border-gris-800">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 sm:px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((s) => {
          const esta = activa(s.ruta);
          return (
            <li key={s.ruta} className="shrink-0">
              <Link
                href={s.ruta as "/panel"}
                aria-current={esta ? "page" : undefined}
                /* Sobre negro, la sección activa va en el ámbar pleno de la
                   marca: 10:1. El primario oscuro se perdería contra el fondo. */
                className={`inline-flex items-center border-b-2 px-3 py-3 text-sm whitespace-nowrap transition-colors ${
                  esta
                    ? "border-marca font-bold text-marca"
                    : "border-transparent font-semibold text-gris-300 hover:border-gris-500 hover:text-blanco"
                }`}
              >
                {s.nombre}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
