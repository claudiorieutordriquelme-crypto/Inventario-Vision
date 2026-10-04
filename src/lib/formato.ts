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
      Ámbar de marca, no el rojo. Un borrador pide atención, no es un error, y
      el rojo está reservado para lo que destruye.

      Texto NEGRO sobre el ámbar. Medido: negro sobre #F7A823 da 10:1; blanco
      daría 1,98:1 y sería ilegible.
    */
    insignia: "bg-marca text-negro",
    barra: "bg-marca",
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

/* ── Venta y despacho ────────────────────────────────────────────────────── */

import type {
  CanalVenta,
  EstadoDespacho,
  EstadoVenta,
  MedioPago,
  TipoComprobante,
  TipoEntrega,
} from "@/lib/tipos";

export const ETIQUETA_CANAL: Record<CanalVenta, string> = {
  tienda: "Tienda",
  live: "Venta live",
};

export const ETIQUETA_ENTREGA: Record<TipoEntrega, string> = {
  retiro_tienda: "Retiro en tienda",
  despacho: "Despacho",
};

export const ETIQUETA_PAGO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferencia",
  otro: "Otro",
};

export const ETIQUETA_COMPROBANTE: Record<TipoComprobante, string> = {
  ninguno: "Sin comprobante",
  boleta: "Boleta",
  factura: "Factura",
};

/*
  Presentación de cada estado de venta y de despacho.

  MISMA REGLA QUE EN EL INVENTARIO: el estado nunca se comunica solo por color.
  Cada uno lleva su etiqueta escrita, porque el color es lo primero que se
  pierde con daltonismo o con una pantalla vista a contraluz.
*/
export const PRESENTACION_VENTA: Record<
  EstadoVenta,
  { etiqueta: string; insignia: string; explica: string }
> = {
  borrador: {
    etiqueta: "Borrador",
    /* Ámbar de marca con texto negro: 10:1 medido. Un carrito abierto pide
       atención, no es un error, y el rojo está reservado para lo que destruye. */
    insignia: "bg-marca text-negro",
    explica: "Carrito abierto. Todavía no descuenta stock.",
  },
  confirmada: {
    etiqueta: "Confirmada",
    insignia: "bg-primario text-blanco",
    explica: "Se cobró y el stock ya salió del inventario.",
  },
  anulada: {
    etiqueta: "Anulada",
    insignia: "bg-gris-200 text-gris-700",
    explica: "Se deshizo con un ajuste que devolvió el stock. Queda registrada.",
  },
};

export const PRESENTACION_DESPACHO: Record<
  EstadoDespacho,
  { etiqueta: string; insignia: string; explica: string }
> = {
  pendiente: {
    etiqueta: "Pendiente",
    insignia: "bg-marca text-negro",
    explica: "Recién creado. Falta armar las cajas.",
  },
  embalado: {
    etiqueta: "Embalado",
    insignia: "bg-gris-800 text-blanco",
    explica: "Las cajas están armadas y rotuladas, listas para salir.",
  },
  en_ruta: {
    etiqueta: "En ruta",
    insignia: "bg-primario text-blanco",
    explica: "Salió a reparto. Todavía no llega.",
  },
  entregado: {
    etiqueta: "Entregado",
    insignia: "bg-gris-200 text-gris-700",
    explica: "Llegó a destino. Las ventas de este despacho ya no se anulan.",
  },
  anulado: {
    etiqueta: "Anulado",
    insignia: "bg-gris-200 text-gris-700",
    explica: "Se dejó sin efecto, normalmente porque su venta se anuló.",
  },
};

/* El orden en que avanza un despacho. anulado queda fuera: no es un paso del
   camino, es salirse de él. */
export const FLUJO_DESPACHO: EstadoDespacho[] = [
  "pendiente",
  "embalado",
  "en_ruta",
  "entregado",
];
