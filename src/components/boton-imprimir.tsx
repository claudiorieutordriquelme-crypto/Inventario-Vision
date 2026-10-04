"use client";

/*
  El botón de imprimir.

  POR QUÉ HACE FALTA, SI YA SE PODÍA IMPRIMIR. Se podía con Ctrl+P, y la página
  lo decía. El problema es que en un teléfono NO HAY Ctrl+P: imprimir desde el
  navegador móvil está escondido en el menú de tres puntos, con un nombre
  distinto en cada navegador, y mucha gente no sabe que está ahí. La instrucción
  escrita servía solo para quien ya sabía hacerlo.

  window.print() abre el mismo diálogo del sistema en todas partes, incluido el
  teléfono, donde además ofrece "Guardar como PDF" y mandarlo a imprimir después
  o compartirlo.

  LLEVA .no-imprimir, obviamente: un botón de imprimir impreso en la etiqueta
  sería lo primero que alguien notaría.
*/
export function BotonImprimir({ children = "Imprimir" }: { children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-imprimir inline-flex items-center gap-2 rounded-lg bg-primario px-5 py-3 text-base font-semibold text-blanco transition-opacity hover:opacity-90"
    >
      <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-current" aria-hidden="true">
        <path d="M7 3h10v4H7V3zm-3 6h16a2 2 0 0 1 2 2v6h-4v4H6v-4H2v-6a2 2 0 0 1 2-2zm4 8v4h8v-4H8zm10-5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" />
      </svg>
      {children}
    </button>
  );
}
