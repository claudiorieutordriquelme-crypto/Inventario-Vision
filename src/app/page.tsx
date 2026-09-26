import Link from "next/link";

/*
  Portada. Es lo único que se ve sin sesión, así que no muestra ningún dato:
  explica qué es la herramienta y manda a entrar.
*/
export default function Portada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-xs font-bold tracking-widest text-primario uppercase">Inventario</p>
      <h1 className="mt-2 text-3xl font-bold text-gris-900 sm:text-4xl">
        Una foto, y el producto queda cargado
      </h1>
      <p className="mt-4 max-w-prose text-lg text-gris-600">
        Sacas la foto de lo que llega a bodega. El sistema lo identifica, lo
        clasifica, le asigna un SKU y propone una descripción y un precio
        estimado. Tú revisas y confirmas.
      </p>

      <ul className="mt-8 space-y-3 text-base text-gris-700">
        <li className="flex gap-3">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primario" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-gris-900">SKU automático</strong> por categoría,
            correlativo y sin repetidos.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primario" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-gris-900">Todo editable</strong>. Lo que propone
            el análisis entra como borrador hasta que una persona lo confirma.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primario" aria-hidden="true" />
          <span>
            <strong className="font-semibold text-gris-900">Stock con historial</strong>. La
            cantidad es la suma de sus movimientos, y el libro no se borra.
          </span>
        </li>
      </ul>

      <div className="mt-10">
        <Link
          href="/login"
          className="inline-flex items-center rounded-lg bg-primario px-6 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90"
        >
          Entrar
        </Link>
      </div>

      <p className="mt-10 max-w-prose text-sm text-gris-500">
        El precio que propone el análisis es una estimación del modelo, no un
        precio consultado en la web. La aplicación lo dice en cada pantalla
        donde aparece, y queda marcado como pendiente de revisión hasta que
        alguien lo fija.
      </p>
    </main>
  );
}
