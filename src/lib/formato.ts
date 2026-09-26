import type { EstadoProducto, TipoMovimiento } from "@/lib/tipos";
import type { Rol } from "@/lib/roles";

/*
  Formatos es-CL. Todo lo que decide cómo se lee un dato vive acá, para que dos
  pantallas no terminen escribiendo el mismo número de dos maneras.
*/

const PESOS = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const NUMERO = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 3 });

const FECHA_CORTA = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const MOMENTO = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formateaPesos(n: number | null | undefined): string {
  return n === null || n === undefined ? "Sin precio" : PESOS.format(n);
}

export function formateaNumero(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : NUMERO.format(n);
}

/*
  Una fecha sin hora se parte por componentes y NO se pasa por new Date(iso).
  Con la cadena completa, JavaScript la interpreta como medianoche UTC, y leída
  en horario de Chile eso cae el día anterior.
*/
export function formateaFechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (soloFecha) {
    const [, a, m, d] = soloFecha;
    return FECHA_CORTA.format(new Date(Number(a), Number(m) - 1, Number(d)));
  }
  return FECHA_CORTA.format(new Date(iso));
}

export function formateaMomento(iso: string | null): string {
  return iso ? MOMENTO.format(new Date(iso)) : "—";
}

export const ETIQUETA_ESTADO: Record<EstadoProducto, string> = {
  borrador: "Borrador",
  confirmado: "Confirmado",
  archivado: "Archivado",
};

/*
  Presentación de cada estado.

  EL ESTADO NUNCA SE COMUNICA SOLO POR COLOR. Cada uno lleva además su etiqueta
  escrita, porque el color es lo primero que se pierde con daltonismo o con una
  pantalla vista a contraluz en una bodega.
*/
export const PRESENTACION_ESTADO: Record<
  EstadoProducto,
  { etiqueta: string; insignia: string; barra: string; explica: string }
> = {
  borrador: {
    etiqueta: "Borrador",
    /*
      Texto NEGRO sobre el acento, no blanco. Medido: blanco sobre #ff3d00 da
      3,5:1 y no alcanza para texto pequeño; negro da 6,0:1 y sí.
    */
    insignia: "bg-acento text-negro",
    barra: "bg-acento",
    explica: "Lo dejó el análisis de la foto y nadie lo ha revisado todavía.",
  },
  confirmado: {
    etiqueta: "Confirmado",
    insignia: "bg-primario text-blanco",
    barra: "bg-primario",
    explica: "Una persona revisó los datos y se hace cargo de ellos.",
  },
  archivado: {
    etiqueta: "Archivado",
    insignia: "bg-gris-200 text-gris-700",
    barra: "bg-gris-300",
    explica: "Fuera de circulación. Se conserva con todo su historial.",
  },
};

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  ingreso: "Ingreso",
  salida: "Salida",
  ajuste: "Ajuste",
};

export const ETIQUETA_ROL_CORTA: Record<Rol, string> = {
  admin: "Admin",
  operador: "Operador",
  lector: "Lector",
};

/*
  Cómo se rotula el precio según de dónde salió. Es la pieza de texto más
  importante de la aplicación: el precio estimado NO viene de consultar la web,
  viene del conocimiento del modelo, y presentarlo como precio de mercado sería
  mentir sobre el único dato que alguien va a usar para decidir una compra.
*/
export function procedenciaPrecio(
  confirmado: number | null,
  estimado: number | null,
): { valor: string; origen: string; revisar: boolean } {
  if (confirmado !== null && confirmado !== undefined) {
    return { valor: formateaPesos(confirmado), origen: "Fijado por una persona", revisar: false };
  }
  if (estimado !== null && estimado !== undefined) {
    return {
      valor: formateaPesos(estimado),
      origen: "Estimación del modelo, sin consultar la web",
      revisar: true,
    };
  }
  return { valor: "Sin precio", origen: "Nadie lo ha cargado", revisar: true };
}
