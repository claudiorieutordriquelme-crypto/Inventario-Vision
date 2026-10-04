/*
  Tipos del dominio. Espejo de los enum y las tablas de la base.

  Se escriben a mano y no se generan porque son pocos y estables, y un tipo
  escrito a mano se puede comentar. Si la base cambia, el verificador de
  esquema lo detecta: scripts/verifica-esquema.mjs compara estos valores contra
  los enum reales.
*/

export type Rol = "admin" | "operador" | "lector";
export type EstadoProducto = "borrador" | "confirmado" | "archivado";
export type TipoMovimiento = "ingreso" | "salida" | "ajuste";
export type OrigenDato = "ia" | "manual" | "mixto";
export type EstadoConservacion =
  | "nuevo"
  | "como_nuevo"
  | "buen_estado"
  | "usado"
  | "para_restaurar";

export type Categoria = {
  id: string;
  codigo: string;
  nombre: string;
  prefijo_sku: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
  /** Subcategoría de otra. Un solo nivel: null es categoría raíz. */
  padre_id: string | null;
  /*
    Los productos de esta categoría existen en una sola unidad, y no es una
    etiqueta decorativa: el trigger productos_pieza_unica_tope rechaza
    cualquier saldo mayor que 1. Una subcategoría hereda la marca de su madre.
  */
  pieza_unica: boolean;
};

export type Producto = {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  categoria_id: string | null;
  cantidad: number;
  unidad: string;
  /** Lo que estimó el modelo. Nunca lo sobreescribe una persona. */
  precio_estimado_clp: number | null;
  /** Lo que fijó un humano. Manda sobre el estimado. */
  precio_confirmado_clp: number | null;
  /** Columna generada: confirmado si existe, si no el estimado. */
  precio_vigente_clp: number | null;
  ubicacion: string | null;
  estado: EstadoProducto;
  origen: OrigenDato;
  foto_path: string | null;
  foto_bucket: string | null;
  notas: string | null;
  /* Los tres siguientes los agregó la migración del análisis múltiple: de qué
     análisis salió, en qué orden apareció y dónde está dentro de la imagen
     descrito con palabras. Faltaban en este tipo aunque la base los devuelve. */
  analisis_id: string | null;
  indice_en_foto: number | null;
  ubicacion_en_foto: string | null;
  /* Atributos del rubro de anticuario: menaje, antigüedades, muñecas y
     colección. Todos opcionales, porque quien vende herramientas no los
     necesita y exigirlos produciría datos inventados. */
  estado_conservacion: EstadoConservacion | null;
  /** Texto libre: "años 50" se sabe mucho más seguido que 1954. */
  epoca: string | null;
  anio_aproximado: number | null;
  material: string | null;
  alto_cm: number | null;
  ancho_cm: number | null;
  profundidad_cm: number | null;
  /* Cuántas imágenes tiene. La mantiene un trigger, no se escribe a mano. */
  imagenes: number;
  /* La tipología de dónde está. `ubicacion` sigue siendo el detalle en texto
     libre: "estante C". Esta es la que se filtra y la que decide si una venta
     se puede retirar en tienda o hay que ir a bodega. */
  ubicacion_tipo: TipoUbicacion | null;
  creado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductoConCategoria = Producto & {
  categoria_nombre: string | null;
  categoria_codigo: string | null;
};

/*
  Lo que necesita una fila del listado por encima del producto: cuántos
  movimientos tiene. No es un dato decorativo, decide si la fila se puede
  borrar: la llave de movimientos_inventario hacia productos es RESTRICT, así
  que un producto con historial no se borra por ningún camino. Sin este número
  el listado ofrecería un botón que la base va a rechazar.
*/
export type ProductoListado = ProductoConCategoria & { movimientos: number };

export type Movimiento = {
  id: string;
  producto_id: string;
  tipo: TipoMovimiento;
  cantidad: number;
  motivo: string | null;
  creado_por: string | null;
  created_at: string;
};

export type AnalisisRegistrado = {
  id: string;
  producto_id: string | null;
  foto_path: string;
  modelo: string;
  version_prompt: string;
  respuesta: unknown;
  confianza: number | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  costo_usd: number | null;
  duracion_ms: number | null;
  error: string | null;
  created_at: string;
};

/* ── Ubicación física ────────────────────────────────────────────────────── */

export type TipoUbicacion = "tienda" | "bodega";

export const ETIQUETA_UBICACION: Record<TipoUbicacion, string> = {
  tienda: "En tienda",
  bodega: "En bodega",
};

/* ── Referencias web ─────────────────────────────────────────────────────── */

export type ReferenciaProducto = {
  id: string;
  producto_id: string;
  url: string;
  titulo: string;
  extracto: string | null;
  dominio: string | null;
  /* Qué respalda: el precio, la descripción, o las dos cosas. */
  respalda: "precio" | "descripcion" | "ambas";
  precio_mencionado_clp: number | null;
  created_at: string;
};

/* ── Clientes ────────────────────────────────────────────────────────────── */

export type Cliente = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  notas: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type DireccionCliente = {
  id: string;
  cliente_id: string;
  etiqueta: string | null;
  calle: string;
  comuna: string | null;
  ciudad: string | null;
  referencia: string | null;
  preferida: boolean;
  activa: boolean;
};

export type ClienteConDirecciones = Cliente & { direcciones: DireccionCliente[] };

/* ── Ventas ──────────────────────────────────────────────────────────────── */

export type CanalVenta = "tienda" | "live";
export type TipoEntrega = "retiro_tienda" | "despacho";
export type EstadoVenta = "borrador" | "confirmada" | "anulada";
export type MedioPago = "efectivo" | "debito" | "credito" | "transferencia" | "otro";
export type TipoComprobante = "ninguno" | "boleta" | "factura";

export type Venta = {
  id: string;
  folio: string;
  cliente_id: string | null;
  direccion_id: string | null;
  canal: CanalVenta;
  tipo_entrega: TipoEntrega;
  estado: EstadoVenta;
  medio_pago: MedioPago | null;
  comprobante: TipoComprobante;
  numero_comprobante: string | null;
  /** Lo mantiene el trigger que suma los ítems. No se escribe a mano. */
  total_clp: number;
  notas: string | null;
  vendedor_id: string | null;
  confirmada_at: string | null;
  anulada_at: string | null;
  motivo_anulacion: string | null;
  created_at: string;
  updated_at: string;
};

export type VentaItem = {
  id: string;
  venta_id: string;
  producto_id: string;
  /* Nombre y SKU copiados al vender: la boleta de hace tres meses sigue
     diciendo qué se vendió aunque el producto se haya renombrado. */
  nombre: string;
  sku: string;
  cantidad: number;
  /** Congelado al agregarlo al carrito. */
  precio_unitario_clp: number;
  subtotal_clp: number;
};

export type VentaConDetalle = Venta & {
  items: VentaItem[];
  cliente_nombre: string | null;
};

/* ── Despacho ────────────────────────────────────────────────────────────── */

export type EstadoDespacho = "pendiente" | "embalado" | "en_ruta" | "entregado" | "anulado";

export type Despacho = {
  id: string;
  folio: string;
  estado: EstadoDespacho;
  cliente_id: string | null;
  /* La dirección se copió al crear el despacho: el cliente se puede mudar, la
     caja que salió el martes fue a la dirección de ese martes. */
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
  referencia: string | null;
  contacto: string | null;
  telefono: string | null;
  notas: string | null;
  entregado_at: string | null;
  created_at: string;
};

export type Caja = {
  id: string;
  despacho_id: string;
  numero: number;
  /** Lo que lleva el QR. Identificador opaco, no una credencial. */
  token: string;
  peso_kg: number | null;
  notas: string | null;
};

export type CajaItem = {
  id: string;
  caja_id: string;
  venta_item_id: string;
  cantidad: number;
};
