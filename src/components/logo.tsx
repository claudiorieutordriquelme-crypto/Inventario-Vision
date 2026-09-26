/*
  Logo de Pánico Ideas.

  QUÉ ES ESTO Y QUÉ NO ES. Es un redibujo vectorial del logo: el globo de
  diálogo con la cola, el círculo blanco y el lettering en los dos ámbares de
  la marca. NO reproduce el lettering hecho a mano del original, con su textura
  y sus irregularidades; eso no se imita con tipografía.

  Se hizo así por dos razones concretas:
   1. Un SVG pesa un par de kilobytes, se ve nítido en cualquier tamaño y no
      agrega una petición de red. El original en PNG se pixela en el encabezado
      de un escritorio y pesa cien veces más en un teléfono con señal mala.
   2. Hereda el color desde las variables de la marca, así que si el ámbar
      cambia, cambia acá también sin reexportar nada.

  PARA USAR EL ARCHIVO ORIGINAL: déjalo en public/logo.png y cambia este
  componente por una <img>. Vale la pena para la portada y para cualquier cosa
  impresa; en el encabezado, el vector rinde mejor.
*/

export function Logo({
  className,
  conTexto = true,
}: {
  className?: string;
  /** Sin texto queda solo el globo, para espacios muy chicos como un favicon. */
  conTexto?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      className={className ?? "size-12"}
      role="img"
      aria-label="Pánico Ideas"
    >
      {/* El círculo blanco del original. Sobre fondo oscuro es lo que separa la
          marca del resto; sobre blanco desaparece, que es correcto. */}
      <circle cx="60" cy="60" r="58" fill="var(--color-blanco)" />

      {/* El globo de diálogo, en el negro de la marca. */}
      <rect x="18" y="26" width="84" height="56" rx="10" fill="var(--color-negro)" />
      {/* La cola, desplazada a la derecha como en el original. */}
      <path d="M62 80 L72 80 L66 100 Z" fill="var(--color-negro)" />

      {conTexto ? (
        <>
          {/*
            Dos líneas y dos tonos, como el original: PÁNICO en el ámbar pleno,
            IDEAS en el tono más cálido. Los dos van sobre negro, donde el
            ámbar da 10:1.

            textLength fija el ancho para que el logo no cambie de forma si la
            tipografía todavía no cargó y el navegador usa la de respaldo.
          */}
          <text
            x="60"
            y="50"
            textAnchor="middle"
            textLength="70"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="var(--font-sans)"
            fontSize="20"
            fontWeight="700"
            fill="var(--color-marca)"
          >
            PÁNICO
          </text>
          <text
            x="60"
            y="71"
            textAnchor="middle"
            textLength="62"
            lengthAdjust="spacingAndGlyphs"
            fontFamily="var(--font-sans)"
            fontSize="19"
            fontWeight="700"
            fill="var(--color-marca-clara)"
          >
            IDEAS
          </text>
        </>
      ) : null}
    </svg>
  );
}

/*
  Versión en línea para encabezados: el globo chico más el nombre en texto
  normal. En una barra de 56 px de alto el lettering dentro del globo queda
  ilegible, así que se saca afuera.
*/
export function LogoLinea({ className }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className ?? ""}`}>
      <Logo conTexto={false} className="size-8 shrink-0" />
      <span className="leading-none">
        <span className="block text-sm font-bold tracking-wide text-marca">PÁNICO</span>
        <span className="block text-sm font-bold tracking-wide text-marca-clara">IDEAS</span>
      </span>
    </span>
  );
}
