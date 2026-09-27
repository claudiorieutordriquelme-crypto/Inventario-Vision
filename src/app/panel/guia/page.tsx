import Link from "next/link";
import type { Metadata } from "next";
import { DESCRIPCION_ROL, ETIQUETA_ROL, PERMISOS, ROLES, perfilHabilitado } from "@/lib/auth";
import { hayAnalisisDisponible } from "@/lib/env";
import { ETIQUETA_MOVIMIENTO, PRESENTACION_ESTADO } from "@/lib/formato";
import { MAXIMO_POR_FOTO } from "@/lib/vision";
import type { EstadoProducto, TipoMovimiento } from "@/lib/tipos";

export const metadata: Metadata = {
  title: "Guía · Inventario",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  Manual de uso, dentro de la aplicación.

  ── POR QUÉ VIVE ACÁ Y NO EN UN DOCUMENTO APARTE ───────────────────────────

  Un manual que vive fuera de la herramienta envejece sin que nadie lo note.
  Este importa las mismas constantes que usa la interfaz: las insignias se
  dibujan con PRESENTACION_ESTADO, los roles salen de ROLES y DESCRIPCION_ROL,
  el tope de productos por foto sale de lib/vision. Si alguien agrega un
  estado, cambia una descripción de rol o sube el tope, esta página cambia
  sola.

  Lo que NO se puede derivar del código va escrito, con su porqué: de dónde
  sale el precio, por qué hay dos, qué arrastra un borrado. Eso es lo que nadie
  puede deducir mirando la pantalla, y donde se cometen los errores caros.

  ── REGISTRO ───────────────────────────────────────────────────────────────

  Redacción impersonal y formal, sin tuteo y sin expresiones coloquiales. El
  resto de la aplicación todavía usa segunda persona informal ("Saca la foto");
  si se decide unificar, este archivo marca el registro de destino.

  ── DISEÑO ─────────────────────────────────────────────────────────────────

  Dos columnas desde 1024 px con el índice fijo a la izquierda, que es el
  patrón de documentación que la gente ya sabe leer. Bajo ese ancho, el índice
  pasa arriba como fila de fichas. El cuerpo se limita a 65 caracteres por
  línea: más ancho que eso, el ojo pierde el renglón al volver.
*/

const ESTADOS: EstadoProducto[] = ["borrador", "confirmado", "archivado"];
const MOVIMIENTOS: TipoMovimiento[] = ["ingreso", "salida", "ajuste"];

const QUE_HACER: Record<EstadoProducto, string> = {
  borrador:
    "Revisar los datos, corregir lo que corresponda, fijar el precio si se conoce y confirmar.",
  confirmado: "Nada, salvo que cambie algo. La valorización del inventario lo considera.",
  archivado: "Nada. Deja de sumar a la valorización y conserva su ficha y su historial.",
};

const PASOS = [
  {
    titulo: "Tomar la fotografía",
    cuerpo:
      "Desde un teléfono, la cámara se abre dentro de la aplicación: permite revisar la toma y repetirla si salió desenfocada. Desde un computador, se sube un archivo. Conviene apoyar los productos sobre una superficie despejada y fotografiar de frente.",
    dato: "Una fotografía nítida reduce a la mitad las correcciones posteriores.",
  },
  {
    titulo: "Revisar lo identificado",
    cuerpo:
      "Al terminar el análisis se presenta la lista de productos detectados, cada uno con su ubicación dentro de la imagen descrita en palabras. Nada de eso es definitivo.",
    dato: "Todo queda en estado Borrador hasta que una persona lo revise.",
  },
  {
    titulo: "Corregir y confirmar",
    cuerpo:
      "En la ficha de cada producto se ajusta el nombre, la categoría y el precio, y se cambia el estado a Confirmado. Confirmar significa que una persona se hace responsable de esos datos.",
    dato: "Confirmar exige asignar una categoría.",
  },
  {
    titulo: "Registrar entradas y salidas",
    cuerpo:
      "Cuando llega mercadería o se consume un producto, se anota como movimiento en su ficha. La cantidad no se escribe a mano: resulta de la suma de esos movimientos.",
    dato: "El libro de movimientos no se edita ni se borra por separado.",
  },
];

const PROBLEMAS = [
  {
    q: "El análisis identificó mal un producto, o detectó uno inexistente",
    a: "Corresponde corregir la ficha, o archivarla si no representa nada real. El análisis propone, no decide. Cuando ocurre con frecuencia, la causa suele estar en la fotografía: poco contraste con la superficie, productos superpuestos o tomados a demasiada distancia.",
  },
  {
    q: "Quedaron productos sin categoría",
    a: "El análisis elige entre las categorías existentes y, cuando ninguna corresponde, deja el producto sin clasificar en lugar de inventar una. Un administrador puede crear la categoría faltante y luego asignarla desde la ficha.",
  },
  {
    q: "El precio estimado parece muy alejado de la realidad",
    a: "Es lo esperable en productos poco comunes, de nicho o con alta variación entre marcas. Corresponde fijar el precio confirmado; la estimación se conserva al lado para efectos de comparación.",
  },
  {
    q: "La cámara no se abre",
    a: "El navegador solicita permiso la primera vez. Si se rechazó, se modifica desde el candado de la barra de direcciones. En un computador sin cámara la opción no estará disponible: corresponde subir la fotografía como archivo.",
  },
  {
    q: "La cantidad no coincide con lo que hay en bodega",
    a: "La cantidad no se edita. Corresponde registrar un movimiento de tipo Ajuste con la diferencia y escribir el motivo. Así el número queda correcto y además queda constancia de que hubo un descuadre.",
  },
];

const SECCIONES = [
  { id: "resumen", titulo: "En 30 segundos" },
  { id: "paso-a-paso", titulo: "El flujo, paso a paso" },
  { id: "estados", titulo: "Los tres estados" },
  { id: "precios", titulo: "Los dos precios" },
  { id: "cantidad", titulo: "Cantidad y movimientos" },
  { id: "sku", titulo: "El código SKU" },
  { id: "salir", titulo: "Archivar, borrar y exportar" },
  { id: "roles", titulo: "Permisos por rol" },
  { id: "problemas", titulo: "Situaciones frecuentes" },
];

function Seccion({
  id,
  titulo,
  bajada,
  children,
}: {
  id: string;
  titulo: string;
  bajada?: string;
  children: React.ReactNode;
}) {
  return (
    /* scroll-mt deja el título bajo el encabezado pegajoso al saltar desde el
       índice; sin eso, el ancla aterriza tapada por la barra negra. */
    <section id={id} className="scroll-mt-32 border-t border-gris-200 pt-8">
      <h2 className="text-xl font-bold text-gris-900 sm:text-2xl">{titulo}</h2>
      {bajada ? <p className="mt-1.5 max-w-[65ch] text-base text-gris-600">{bajada}</p> : null}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Ficha({
  titulo,
  children,
  destacada = false,
}: {
  titulo: string;
  children: React.ReactNode;
  destacada?: boolean;
}) {
  if (destacada) {
    return (
      <div className="flex overflow-hidden rounded-xl border border-gris-200">
        <div className="w-1.5 shrink-0 bg-marca" aria-hidden="true" />
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <h3 className="text-base font-bold text-gris-900">{titulo}</h3>
          <div className="mt-1.5 max-w-[65ch] text-base text-gris-600">{children}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gris-200 p-4 sm:p-5">
      <h3 className="text-base font-bold text-gris-900">{titulo}</h3>
      <div className="mt-1.5 text-base text-gris-600">{children}</div>
    </div>
  );
}

function describeMovimiento(tipo: TipoMovimiento): string {
  if (tipo === "ingreso") {
    return "Llega mercadería. Suma. El alta de un producto por fotografía deja un ingreso inicial.";
  }
  if (tipo === "salida") {
    return "El producto se consume, se vende o se presta. Resta.";
  }
  return "Corrige una diferencia respecto de lo que hay realmente en bodega. Puede sumar o restar.";
}

export default async function GuiaPage() {
  const perfil = await perfilHabilitado();
  const disponible = hayAnalisisDisponible();
  const miRol = perfil?.rol ?? null;
  const puedeOperar = miRol ? PERMISOS.operar.includes(miRol) : false;

  return (
    <div className="lg:flex lg:gap-10">
      {/*
        Índice. En pantalla ancha queda fijo a la izquierda mientras el
        contenido se desplaza; en pantalla chica se convierte en una fila de
        fichas arriba. Sin índice, esta página obliga a recorrerla a ciegas.
      */}
      <nav
        aria-label="Contenido de la guía"
        className="mb-8 lg:sticky lg:top-32 lg:mb-0 lg:h-fit lg:w-56 lg:shrink-0"
      >
        <p className="text-xs font-bold tracking-widest text-gris-500 uppercase">Contenido</p>
        <ul className="mt-3 flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
          {SECCIONES.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex rounded-lg border border-gris-300 px-3 py-2 text-sm font-semibold text-gris-700 transition-colors hover:border-primario hover:text-primario lg:w-full lg:border-0 lg:border-l-2 lg:border-gris-200 lg:px-3 lg:py-1.5 lg:hover:border-primario lg:hover:bg-gris-50"
              >
                {s.titulo}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-10">
        <header>
          <p className="text-xs font-bold tracking-widest text-primario uppercase">Guía de uso</p>
          <h1 className="mt-1.5 text-3xl font-bold text-gris-900 sm:text-4xl">
            Cómo funciona el inventario
          </h1>
          <p className="mt-3 max-w-[65ch] text-lg text-gris-600">
            Esta guía explica el flujo completo, qué significa cada estado y qué
            puede hacer cada rol. Basta leerla una vez.
          </p>
        </header>

        <section id="resumen" className="scroll-mt-32">
          <h2 className="sr-only">En 30 segundos</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              {
                n: "01",
                t: "Una foto, varios productos",
                d: `En una misma imagen se identifican hasta ${MAXIMO_POR_FOTO} productos distintos y se crea una ficha por cada uno.`,
              },
              {
                n: "02",
                t: "Nada entra confirmado",
                d: "Todo lo que propone el análisis queda en Borrador hasta que una persona lo revisa.",
              },
              {
                n: "03",
                t: "El precio es una estimación",
                d: "No proviene de consultar la web. Sirve como orden de magnitud, no para cotizar.",
              },
            ].map((c) => (
              <li key={c.n} className="rounded-xl border border-gris-200 p-4 sm:p-5">
                <span className="font-mono text-sm font-bold text-primario">{c.n}</span>
                <h3 className="mt-1 text-base font-bold text-gris-900">{c.t}</h3>
                <p className="mt-1.5 text-sm text-gris-600">{c.d}</p>
              </li>
            ))}
          </ul>

          {!disponible ? (
            <div className="mt-4 flex overflow-hidden rounded-xl border border-gris-200">
              <div className="w-1.5 shrink-0 bg-marca" aria-hidden="true" />
              <p className="max-w-[65ch] p-4 text-base text-gris-600">
                <strong className="font-semibold text-gris-900">
                  El análisis automático no está configurado en este momento.
                </strong>{" "}
                La fotografía se guarda y el producto se crea, pero sin datos:
                corresponde escribirlos a mano en la ficha. El resto de la guía
                aplica igual.
              </p>
            </div>
          ) : null}
        </section>

        <Seccion
          id="paso-a-paso"
          titulo="El flujo, paso a paso"
          bajada="Cuatro pasos, de la bodega a un inventario confirmado."
        >
          <ol className="space-y-3">
            {PASOS.map((paso, i) => (
              <li key={paso.titulo} className="flex gap-4 rounded-xl border border-gris-200 p-4 sm:p-5">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca text-base font-bold text-negro"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-gris-900">
                    <span className="sr-only">Paso {i + 1}: </span>
                    {paso.titulo}
                  </h3>
                  <p className="mt-1.5 max-w-[65ch] text-base text-gris-600">{paso.cuerpo}</p>
                  <p className="mt-2 text-sm font-semibold text-primario">{paso.dato}</p>
                </div>
              </li>
            ))}
          </ol>

          {puedeOperar ? (
            <Link
              href="/panel/nuevo"
              className="inline-flex items-center rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90"
            >
              Cargar una fotografía
            </Link>
          ) : (
            <p className="text-sm text-gris-500">
              Esta cuenta es de solo lectura. Los pasos 1, 3 y 4 los ejecuta una
              cuenta con permiso de carga.
            </p>
          )}
        </Seccion>

        <Seccion
          id="estados"
          titulo="Los tres estados"
          bajada="Todo producto está en uno de tres estados. Las insignias que aparecen a continuación son exactamente las del listado y las de la ficha."
        >
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {ESTADOS.map((e) => {
              const pres = PRESENTACION_ESTADO[e];
              return (
                <li key={e} className="flex overflow-hidden rounded-xl border border-gris-200">
                  <div className={`w-1.5 shrink-0 ${pres.barra}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1 p-4 sm:p-5">
                    <span
                      className={`inline-flex rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
                    >
                      {pres.etiqueta}
                    </span>
                    <p className="mt-3 text-base text-gris-600">{pres.explica}</p>
                    <p className="mt-3 border-t border-gris-100 pt-3 text-sm">
                      <span className="font-bold text-gris-900">Qué corresponde hacer</span>
                      <br />
                      <span className="text-gris-600">{QUE_HACER[e]}</span>
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="max-w-[65ch] text-sm text-gris-500">
            El estado nunca se comunica solo mediante color: la palabra está
            siempre escrita al lado. En una bodega con la pantalla a contraluz, o
            para quien no distingue esos tonos, el color por sí solo no se lee.
          </p>
        </Seccion>

        <Seccion
          id="precios"
          titulo="Los dos precios"
          bajada="La sección más importante de esta guía. Es el único dato con el que alguien puede tomar una mala decisión creyendo que es firme."
        >
          <Ficha titulo="El precio estimado no proviene de una búsqueda en internet" destacada>
            Proviene del conocimiento del modelo que observa la fotografía, y ese
            conocimiento tiene fecha de corte. Sirve como orden de magnitud
            mientras nadie lo ha revisado.{" "}
            <strong className="font-semibold text-gris-900">
              No sirve para cotizar, para cobrar ni para decidir una compra.
            </strong>
          </Ficha>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Ficha titulo="Precio estimado">
              Lo propone el análisis de la fotografía. Nunca lo sobrescribe una
              persona: se conserva aunque se fije otro, porque es la única forma
              de medir cuánto se desvía el modelo y calibrar cuánta confianza
              merece.
            </Ficha>
            <Ficha titulo="Precio confirmado">
              Lo ingresa una persona, respaldado por una factura, una cotización
              o lo que corresponda. Prevalece sobre el estimado: en cuanto
              existe, es el que se usa para valorizar el inventario.
            </Ficha>
          </div>

          <p className="max-w-[65ch] text-base text-gris-600">
            En el listado y en la ficha siempre se indica de dónde proviene la
            cifra en pantalla:{" "}
            <span className="font-semibold text-gris-800">
              &quot;Estimación del modelo, sin consultar la web&quot;
            </span>{" "}
            o{" "}
            <span className="font-semibold text-gris-800">&quot;Fijado por una persona&quot;</span>.
          </p>
          <p className="max-w-[65ch] text-base text-gris-600">
            La cifra de <strong className="font-semibold text-gris-900">Valorización</strong> de la
            portada combina ambas, y por eso a su lado va el contador de cuántos
            productos mantienen precio solo estimado. Sin ese contador, una
            valorización construida con puras estimaciones se ve igual de firme
            que una revisada.
          </p>
        </Seccion>

        <Seccion
          id="cantidad"
          titulo="Cantidad y movimientos"
          bajada="La cantidad de un producto no se edita. Resulta de la suma de su libro de movimientos y se recalcula cada vez que se registra uno."
        >
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MOVIMIENTOS.map((t) => (
              <div key={t} className="rounded-xl border border-gris-200 p-4 sm:p-5">
                <dt className="text-base font-bold text-gris-900">{ETIQUETA_MOVIMIENTO[t]}</dt>
                <dd className="mt-1.5 text-base text-gris-600">{describeMovimiento(t)}</dd>
              </div>
            ))}
          </dl>

          <Ficha titulo="Un movimiento no se edita ni se borra por separado" destacada>
            Tampoco desde una cuenta de administrador. Un error se corrige
            registrando un ajuste que lo compense, y ambos quedan a la vista. Un
            inventario en el que se puede reescribir el pasado no sirve para
            cuadrar contra una bodega real: cada vez que el número no calce, la
            explicación tiene que estar en alguna parte.
          </Ficha>
        </Seccion>

        <Seccion
          id="sku"
          titulo="El código SKU"
          bajada="Cada producto recibe un código único al crearse, con el prefijo de su categoría y un correlativo."
        >
          <p className="max-w-[65ch] text-base text-gris-600">
            Lo genera la base de datos y no la pantalla, de modo que dos personas
            cargando fotografías al mismo tiempo desde dos teléfonos nunca
            reciben el mismo número.
          </p>
          <p className="max-w-[65ch] text-base text-gris-600">
            Es el identificador de búsqueda: el buscador del inventario lo acepta
            igual que el nombre. Un SKU borrado no se reutiliza.
          </p>
        </Seccion>

        <Seccion
          id="salir"
          titulo="Archivar, borrar y exportar"
          bajada="Dos formas de sacar un producto del inventario, que no son intercambiables."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Ficha titulo="Archivar — reversible">
              Es la opción recomendada. El producto deja de contarse en las
              unidades y en la valorización, y conserva su ficha, su fotografía y
              su libro completo. Se restaura con un clic desde el mismo listado.
              Disponible para operadores y administradores.
            </Ficha>
            <Ficha titulo="Borrar — definitivo">
              Desaparecen el producto, su código SKU y{" "}
              <strong className="font-semibold text-gris-900">
                todo su historial de movimientos
              </strong>
              . La fotografía se elimina solo si ningún otro producto la utiliza.
              Reservado a administradores y exige escribir el código SKU para
              confirmar.
            </Ficha>
          </div>

          <Ficha titulo="Un producto borrado no deja ninguna huella" destacada>
            No queda el código, ni las unidades que tuvo, ni constancia de que
            existió. Antes de confirmar, la pantalla indica cuántos movimientos
            se eliminarán junto con el producto. Cuando el objetivo es solo sacar
            algo de circulación, corresponde archivar.
          </Ficha>

          <p className="max-w-[65ch] text-base text-gris-600">
            Ambas acciones están disponibles de forma individual en cada fila del
            listado, y de forma masiva seleccionando varias filas con las
            casillas.
          </p>

          <h3 className="pt-2 text-base font-bold text-gris-900">Exportar</h3>
          <p className="max-w-[65ch] text-base text-gris-600">
            El botón <strong className="font-semibold text-gris-900">Exportar a Excel</strong> del
            listado descarga un archivo que se abre directamente en Excel, Google
            Sheets o LibreOffice. Contiene{" "}
            <strong className="font-semibold text-gris-900">
              exactamente lo que está filtrado en pantalla
            </strong>
            : al filtrar por borradores, se exportan solo los borradores.
          </p>
          <p className="max-w-[65ch] text-base text-gris-600">
            Los dos precios van en columnas separadas, más una columna que indica
            la procedencia de cada uno. Combinarlos en una sola columna
            &quot;Precio&quot; es lo que convierte la estimación de un modelo en
            un dato de gestión que nadie vuelve a cuestionar.
          </p>
        </Seccion>

        <Seccion
          id="roles"
          titulo="Permisos por rol"
          bajada="El menú superior muestra únicamente las secciones del rol de la sesión. Que una sección no aparezca no es un error."
        >
          <ul className="space-y-3">
            {ROLES.map((r) => (
              <li
                key={r}
                className={`rounded-xl border p-4 sm:p-5 ${
                  r === miRol ? "border-primario" : "border-gris-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-gris-900">{ETIQUETA_ROL[r]}</h3>
                  {r === miRol ? (
                    <span className="rounded bg-marca px-2 py-0.5 text-xs font-bold text-negro">
                      Esta cuenta
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 max-w-[65ch] text-base text-gris-600">{DESCRIPCION_ROL[r]}</p>
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion
          id="problemas"
          titulo="Situaciones frecuentes"
          bajada="Qué hacer cuando el resultado no es el esperado."
        >
          <dl className="space-y-3">
            {PROBLEMAS.map((f) => (
              <div key={f.q} className="rounded-xl border border-gris-200 p-4 sm:p-5">
                <dt className="text-base font-bold text-gris-900">{f.q}</dt>
                <dd className="mt-1.5 max-w-[65ch] text-base text-gris-600">{f.a}</dd>
              </div>
            ))}
          </dl>
        </Seccion>
      </div>
    </div>
  );
}
