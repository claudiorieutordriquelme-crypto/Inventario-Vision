import Link from "next/link";
import { redirect } from "next/navigation";
import { PERMISOS, perfilHabilitado } from "@/lib/auth";
import { hayAnalisisDisponible } from "@/lib/env";
import { listarCategorias } from "@/lib/datos/inventario";
import { FormularioFoto } from "./formulario";

export const dynamic = "force-dynamic";

export default async function NuevoPage() {
  const perfil = await perfilHabilitado();
  if (!perfil) redirect("/login");
  /*
    Se verifica acá además del menú. El menú decide qué se dibuja; la dirección
    se puede escribir a mano.
  */
  if (!PERMISOS.operar.includes(perfil.rol)) redirect("/panel");

  const [{ categorias }, disponible] = await Promise.all([
    listarCategorias(true),
    Promise.resolve(hayAnalisisDisponible()),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel" className="text-sm font-semibold text-primario hover:underline">
          Volver al inventario
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gris-900">Nuevo producto con foto</h1>
        <p className="mt-1 max-w-prose text-base text-gris-600">
          Saca la foto y el sistema identifica el producto, lo clasifica, le
          asigna un SKU y propone descripción y precio. Queda en{" "}
          <strong className="font-semibold text-gris-900">borrador</strong> hasta
          que lo revises.
        </p>
      </div>

      {!disponible ? (
        <div className="flex overflow-hidden rounded-lg border border-gris-200">
          <div className="w-2 shrink-0 bg-acento" aria-hidden="true" />
          <div className="p-4">
            <h2 className="text-sm font-bold text-gris-900">
              El análisis automático no está configurado
            </h2>
            <p className="mt-1.5 max-w-prose text-sm text-gris-600">
              Falta la clave de la API en el entorno, así que la foto se va a
              guardar y el producto se va a crear, pero sin datos: tendrás que
              escribirlos a mano en su ficha. Avísale a quien administra el
              sistema.
            </p>
          </div>
        </div>
      ) : null}

      {categorias.length === 0 ? (
        <div className="flex overflow-hidden rounded-lg border border-gris-200">
          <div className="w-2 shrink-0 bg-acento" aria-hidden="true" />
          <div className="p-4">
            <h2 className="text-sm font-bold text-gris-900">No hay categorías activas</h2>
            <p className="mt-1.5 max-w-prose text-sm text-gris-600">
              El análisis clasifica eligiendo de la lista de categorías, así que
              sin ninguna activa todos los productos van a quedar sin clasificar.
              Un administrador puede crearlas en Categorías.
            </p>
          </div>
        </div>
      ) : null}

      <FormularioFoto analisisDisponible={disponible} />

      <div className="border-t border-gris-200 pt-5">
        <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
          Qué hace y qué no
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-gris-600">
          <li>
            <strong className="font-semibold text-gris-900">Identifica y clasifica</strong>{" "}
            eligiendo una de tus categorías. Si ninguna calza, deja el producto
            sin categoría en vez de inventar una.
          </li>
          <li>
            <strong className="font-semibold text-gris-900">El precio es una estimación</strong>{" "}
            del modelo, en pesos chilenos.{" "}
            <strong className="font-semibold text-gris-900">No consulta la web</strong>: sale de
            su conocimiento, que tiene fecha de corte. Revísalo antes de usarlo
            para decidir una compra.
          </li>
          <li>
            <strong className="font-semibold text-gris-900">Cuenta unidades</strong> solo si se
            ven con claridad, y lo registra como ingreso inicial para que quede
            en el historial.
          </li>
          <li>
            <strong className="font-semibold text-gris-900">Todo es editable</strong> después, en
            la ficha del producto.
          </li>
        </ul>
      </div>
    </div>
  );
}
