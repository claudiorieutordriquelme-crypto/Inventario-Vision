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

  POR QUÉ ACÁ Y NO EN UN PDF O EN UNA PÁGINA APARTE. Un manual que vive fuera
  de la herramienta envejece sin que nadie lo note. Este importa las mismas
  constantes que usa la interfaz: las insignias de estado se dibujan con
  PRESENTACION_ESTADO, los roles salen de ROLES, el tope de productos por foto
  sale de lib/vision. Si alguien cambia un estado, agrega un rol o sube el
  tope, esta página cambia sola. Un texto escrito a mano habría quedado
  mintiendo en el primer cambio.

  LO QUE NO SE PUEDE DERIVAR DEL CÓDIGO va escrito y con su porqué: de dónde
  sale el precio, por qué hay dos, por qué el libro de movimientos no se edita.
  Eso es justamente lo que la gente no puede deducir mirando la pantalla, y es
  donde se cometen los errores caros.
*/

const ESTADOS: EstadoProducto[] = ["borrador", "confirmado", "archivado"];
const MOVIMIENTOS: TipoMovimiento[] = ["ingreso", "salida", "ajuste"];

const QUE_HACER: Record<EstadoProducto, string> = {
  borrador:
    "Ábrelo, corrige lo que esté mal, fija el precio si lo sabes y márcalo como confirmado.",
  confirmado: "Nada, salvo que cambie algo. La valorización del inventario cuenta con él.",
  archivado:
    "Nada. Deja de sumar a la valorización, pero su ficha y su historial siguen ahí.",
};

const PASOS = [
  {
    titulo: "Saca la foto",
    cuerpo:
      "Desde el teléfono puedes usar la cámara sin salir de la página, mirar cómo quedó y repetirla si salió movida. Desde un computador, subes un archivo. Apoya las cosas sobre una superficie despejada y apunta de frente: una foto clara ahorra la mitad de las correcciones.",
  },
  {
    titulo: "Revisa lo que encontró",
    cuerpo:
      "Al terminar el análisis ves la lista de lo que identificó, con la ubicación de cada producto dentro de la imagen descrita en palabras, para que sepas cuál es cuál. Nada de eso es definitivo.",
  },
  {
    titulo: "Corrige y confirma",
    cuerpo:
      "Abre cada ficha, arregla el nombre, la categoría y el precio, y cámbiale el estado a confirmado. Confirmar significa que una persona se hace cargo de esos datos.",
  },
  {
    titulo: "Registra lo que entra y lo que sale",
    cuerpo:
      "Cuando llega mercadería o se consume algo, lo anotas como movimiento en la ficha del producto. La cantidad no se escribe a mano: sale de sumar esos movimientos.",
  },
];

const PROBLEMAS = [
  {
    q: "Identificó mal un producto, o se inventó uno que no está",
    a: "Corrige la ficha, o archívala si no corresponde a nada. El análisis propone, no decide. Si pasa seguido, casi siempre es la foto: poco contraste con la mesa, cosas encimadas o demasiado lejos.",
  },
  {
    q: "Dejó productos sin categoría",
    a: "El análisis elige entre las categorías que existan, y si ninguna calza deja el producto sin clasificar en vez de inventar una. Un administrador puede crear la que falta y después la asignas en la ficha.",
  },
  {
    q: "El precio se ve disparatado",
    a: "Es lo esperable en productos poco comunes, de nicho o con mucha variación de marca. Fija el precio confirmado y el estimado queda al lado para comparar.",
  },
  {
    q: "La cámara no abre",
    a: "El navegador pide permiso la primera vez; si lo rechazaste, se cambia desde el candado de la barra de direcciones. En un computador sin cámara no va a aparecer nunca: sube la foto como archivo.",
  },
  {
    q: "La cantidad no cuadra con la bodega",
    a: "No la edites, no se puede. Anota un ajuste con la diferencia y escribe el motivo. Así el número queda correcto y además queda registrado que hubo un descuadre.",
  },
];

const SECCIONES = [
  { id: "como-funciona", titulo: "Cómo funciona" },
  { id: "paso-a-paso", titulo: "Paso a paso" },
  { id: "estados", titulo: "Los estados" },
  { id: "precios", titulo: "Los dos precios" },
  { id: "cantidad", titulo: "Cantidad y movimientos" },
  { id: "sku", titulo: "El SKU" },
  { id: "roles", titulo: "Los roles" },
  { id: "problemas", titulo: "Cuando algo sale mal" },
];

function Titulo({ id, children }: { id: string; children: React.ReactNode }) {
  /* scroll-mt deja el título bajo el encabezado pegajoso al saltar desde el
     índice; sin eso, el ancla aterriza tapada por la barra negra. */
  return (
    <h2 id={id} className="scroll-mt-32 text-xl font-bold text-gris-900">
      {children}
    </h2>
  );
}

function describeMovimiento(tipo: TipoMovimiento): string {
  if (tipo === "ingreso") {
    return "Entra mercadería. Suma. El alta de un producto con foto deja un ingreso inicial.";
  }
  if (tipo === "salida") {
    return "Se consume, se vende o se presta. Resta.";
  }
  return "Corrige una diferencia contra lo que hay realmente en la bodega. Puede sumar o restar.";
}

export default async function GuiaPage() {
  const perfil = await perfilHabilitado();
  const disponible = hayAnalisisDisponible();
  const miRol = perfil?.rol ?? null;
  const puedeOperar = miRol ? PERMISOS.operar.includes(miRol) : false;

  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs font-bold tracking-widest text-primario uppercase">Guía</p>
        <h1 className="mt-1 text-2xl font-bold text-gris-900 sm:text-3xl">
          Cómo se usa esta herramienta
        </h1>
        <p className="mt-2 max-w-prose text-base text-gris-600">
          Léela una vez y no vuelves más. Lo único que de verdad hay que
          entender es{" "}
          <a href="#precios" className="font-semibold text-primario hover:underline">
            de dónde sale el precio
          </a>
          , porque es el dato con el que alguien puede tomar una mala decisión
          creyendo que es firme.
        </p>

        {/* Índice. En una pantalla chica esta página es larga, y sin esto hay
            que deslizar a ciegas para encontrar una cosa. */}
        <nav aria-label="Contenido de la guía" className="mt-5">
          <ul className="flex flex-wrap gap-2">
            {SECCIONES.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex items-center rounded-lg border border-gris-300 px-3 py-2 text-sm font-semibold text-gris-800 transition-colors hover:border-primario hover:text-primario"
                >
                  {s.titulo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <section className="space-y-3 border-t border-gris-200 pt-7">
        <Titulo id="como-funciona">Cómo funciona</Titulo>
        <p className="max-w-prose text-base text-gris-600">
          Le sacas una foto a lo que tienes y el sistema identifica cada
          producto que aparece, lo clasifica en una de tus categorías, le pone
          un SKU, escribe una descripción breve y propone un precio en pesos
          chilenos. Todo eso queda en{" "}
          <strong className="font-semibold text-gris-900">borrador</strong> hasta
          que una persona lo revisa.
        </p>
        <p className="max-w-prose text-base text-gris-600">
          En una misma foto pueden salir hasta {MAXIMO_POR_FOTO} productos
          distintos, y se crea una ficha por cada uno. Varias unidades del{" "}
          <em>mismo</em> producto no son varios productos: eso es cantidad.{" "}
          <span className="text-gris-800">
            Un martillo, un alicate y un destornillador sobre la mesa son tres
            fichas; tres martillos iguales son una ficha con cantidad 3.
          </span>
        </p>

        {!disponible ? (
          <div className="flex overflow-hidden rounded-lg border border-gris-200">
            <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
            <p className="p-4 text-sm text-gris-600">
              <strong className="font-semibold text-gris-900">
                Ahora mismo el análisis automático no está configurado
              </strong>
              , así que la foto se guarda y el producto se crea, pero vacío: los
              datos hay que escribirlos a mano en la ficha. Todo lo demás de
              esta guía funciona igual.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 border-t border-gris-200 pt-7">
        <Titulo id="paso-a-paso">Paso a paso</Titulo>

        <ol className="space-y-4">
          {PASOS.map((paso, i) => (
            <li key={paso.titulo} className="flex gap-4">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-marca text-sm font-bold text-negro"
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-gris-900">
                  <span className="sr-only">Paso {i + 1}: </span>
                  {paso.titulo}
                </h3>
                <p className="mt-1 max-w-prose text-sm text-gris-600">{paso.cuerpo}</p>
              </div>
            </li>
          ))}
        </ol>

        {puedeOperar ? (
          <Link
            href="/panel/nuevo"
            className="inline-flex items-center rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90"
          >
            Probar ahora con una foto
          </Link>
        ) : (
          <p className="text-sm text-gris-500">
            Tu cuenta es de solo lectura, así que los pasos 1, 3 y 4 los hace
            alguien con permiso de carga.
          </p>
        )}
      </section>

      <section className="space-y-4 border-t border-gris-200 pt-7">
        <Titulo id="estados">Qué significa cada estado</Titulo>
        <p className="max-w-prose text-base text-gris-600">
          Todo producto está en uno de tres estados. La insignia que ves acá es
          exactamente la que aparece en el listado y en la ficha.
        </p>

        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {ESTADOS.map((e) => {
            const pres = PRESENTACION_ESTADO[e];
            return (
              <li key={e} className="flex overflow-hidden rounded-lg border border-gris-200">
                <div className={`w-2 shrink-0 ${pres.barra}`} aria-hidden="true" />
                <div className="min-w-0 flex-1 p-4">
                  <span
                    className={`inline-flex rounded px-2 py-1 text-xs font-bold tracking-wide uppercase ${pres.insignia}`}
                  >
                    {pres.etiqueta}
                  </span>
                  <p className="mt-2.5 text-sm text-gris-600">{pres.explica}</p>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold text-gris-900">Qué hacer: </span>
                    <span className="text-gris-600">{QUE_HACER[e]}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="max-w-prose text-sm text-gris-500">
          El estado nunca se comunica solo con el color: la palabra va siempre
          escrita al lado. En una bodega con la pantalla a contraluz, o para
          quien no distingue esos tonos, el color por sí solo no se lee.
        </p>
      </section>

      <section className="space-y-4 border-t border-gris-200 pt-7">
        <Titulo id="precios">Los dos precios</Titulo>

        {/* La sección más importante de la guía, y por eso va destacada. */}
        <div className="flex overflow-hidden rounded-lg border border-gris-200">
          <div className="w-2 shrink-0 bg-marca" aria-hidden="true" />
          <p className="max-w-prose p-4 text-base text-gris-700">
            <strong className="font-semibold text-gris-900">
              El precio estimado no viene de buscar en internet.
            </strong>{" "}
            Sale del conocimiento del modelo que mira la foto, y ese
            conocimiento tiene fecha de corte. Sirve para tener un orden de
            magnitud mientras nadie lo ha revisado. No sirve para cotizar, para
            cobrar ni para decidir una compra.
          </p>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-sm font-bold text-gris-900">Precio estimado</dt>
            <dd className="mt-1.5 text-sm text-gris-600">
              Lo propone el análisis de la foto. Nunca lo sobrescribe una
              persona: se conserva aunque fijes otro, porque es la única forma
              de ver cuánto se equivoca el modelo y calibrar cuánto confiar en
              él la próxima vez.
            </dd>
          </div>
          <div className="rounded-lg border border-gris-200 p-4">
            <dt className="text-sm font-bold text-gris-900">Precio confirmado</dt>
            <dd className="mt-1.5 text-sm text-gris-600">
              Lo escribes tú, con una factura, una cotización o lo que
              corresponda a la vista. Manda sobre el estimado: en cuanto existe,
              es el que se usa para valorizar el inventario.
            </dd>
          </div>
        </dl>

        <p className="max-w-prose text-base text-gris-600">
          En el listado y en la ficha siempre dice de dónde salió el número que
          estás mirando:{" "}
          <span className="font-semibold text-gris-800">
            &quot;Estimación del modelo, sin consultar la web&quot;
          </span>{" "}
          o{" "}
          <span className="font-semibold text-gris-800">&quot;Fijado por una persona&quot;</span>.
          La cifra de <strong className="font-semibold text-gris-900">Valorización</strong> de
          la portada mezcla las dos, y por eso al lado va el contador de cuántos
          productos siguen con precio solo estimado: sin ese contador, una
          valorización hecha de puras estimaciones se ve igual de firme que una
          revisada.
        </p>
      </section>

      <section className="space-y-4 border-t border-gris-200 pt-7">
        <Titulo id="cantidad">Cantidad y movimientos</Titulo>
        <p className="max-w-prose text-base text-gris-600">
          La cantidad de un producto{" "}
          <strong className="font-semibold text-gris-900">no se edita</strong>. Es la suma de su
          libro de movimientos, y se recalcula sola cada vez que anotas uno.
        </p>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MOVIMIENTOS.map((t) => (
            <div key={t} className="rounded-lg border border-gris-200 p-4">
              <dt className="text-sm font-bold text-gris-900">{ETIQUETA_MOVIMIENTO[t]}</dt>
              <dd className="mt-1.5 text-sm text-gris-600">{describeMovimiento(t)}</dd>
            </div>
          ))}
        </dl>

        <p className="max-w-prose text-base text-gris-600">
          <strong className="font-semibold text-gris-900">
            El libro no se edita ni se borra
          </strong>
          , ni siquiera desde una cuenta de administrador. Si te equivocaste en
          un movimiento, anotas un ajuste que lo compense y quedan los dos a la
          vista. Un inventario en el que se puede reescribir el pasado no sirve
          para cuadrar contra una bodega real: cada vez que el número no calza,
          la explicación tiene que estar en alguna parte.
        </p>
      </section>

      <section className="space-y-3 border-t border-gris-200 pt-7">
        <Titulo id="sku">El SKU</Titulo>
        <p className="max-w-prose text-base text-gris-600">
          Cada producto recibe un código único al crearse, con el prefijo de su
          categoría y un correlativo. Lo genera la base de datos y no la
          pantalla, así que dos personas cargando fotos al mismo tiempo desde
          dos teléfonos nunca reciben el mismo número.
        </p>
        <p className="max-w-prose text-base text-gris-600">
          Es el identificador para buscar: el buscador del inventario lo acepta
          igual que el nombre.
        </p>
      </section>

      <section className="space-y-4 border-t border-gris-200 pt-7">
        <Titulo id="roles">Qué puede hacer cada rol</Titulo>

        <div className="overflow-x-auto rounded-lg border border-gris-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gris-200 text-left text-xs font-semibold tracking-wide text-gris-500 uppercase">
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Qué puede hacer</th>
              </tr>
            </thead>
            <tbody>
              {ROLES.map((r) => (
                <tr key={r} className="border-b border-gris-100 last:border-0">
                  <td className="px-3 py-3 align-top">
                    <span className="font-semibold whitespace-nowrap text-gris-900">
                      {ETIQUETA_ROL[r]}
                    </span>
                    {r === miRol ? (
                      <span className="mt-1 block text-xs font-bold text-primario">Tu cuenta</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3 text-gris-600">{DESCRIPCION_ROL[r]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="max-w-prose text-sm text-gris-500">
          El menú de arriba solo muestra las secciones de tu rol. Que una
          sección no aparezca no es un error: es que tu cuenta no la tiene.
        </p>
      </section>

      <section className="space-y-4 border-t border-gris-200 pt-7">
        <Titulo id="problemas">Cuando algo sale mal</Titulo>

        <dl className="space-y-3">
          {PROBLEMAS.map((f) => (
            <div key={f.q} className="rounded-lg border border-gris-200 p-4">
              <dt className="text-sm font-bold text-gris-900">{f.q}</dt>
              <dd className="mt-1.5 max-w-prose text-sm text-gris-600">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
