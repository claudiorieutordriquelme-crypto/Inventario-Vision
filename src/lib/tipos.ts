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

export type Categoria = {
  id: string;
  codigo: string;
  nombre: string;
  prefijo_sku: string;
  descripcion: string | null;
  orden: number;
  activo: boolean;
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
