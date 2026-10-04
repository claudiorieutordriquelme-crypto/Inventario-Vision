import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type {
  Categoria,
  Movimiento,
  Producto,
  ProductoConCategoria,
  ProductoListado,
} from "@/lib/tipos";

/*
  Lecturas del inventario.

  Todo pasa por el cliente con sesión, así que cada consulta se evalúa contra
  las políticas RLS con el JWT de quien mira. No hay ningún filtro de permisos
  en este archivo a propósito: si alguien no debe ver algo, lo decide la base.

  Cada función devuelve el dato Y el error por separado. Un fallo de lectura
  que se devuelve como lista vacía se ve idéntico a "todavía no hay nada", y
  esa confusión hace que una pantalla diga "inventario vacío" cuando en
  realidad la consulta falló.
*/

export const listarCategorias = cache(
  async (soloActivas = true): Promise<{ categorias: Categoria[]; error: string | null }> => {
    const supabase = await crearClienteServidor();
    let consulta = supabase
      .from("categorias")
      .select("id, codigo, nombre, prefijo_sku, descripcion, orden, activo, padre_id, pieza_unica")
      .order("orden")
      .order("nombre");

    if (soloActivas) consulta = consulta.eq("activo", true);

    const { data, error } = await consulta;
    if (error) {
      console.error("No pude leer las categorías:", error.message);
      return { categorias: [], error: error.message };
    }
    return { categorias: (data ?? []) as Categoria[], error: null };
  },
);

export type FiltrosInventario = {
  buscar?: string;
  categoria?: string;
  estado?: string;
};

/*
  Listado del inventario.

  Límite conocido: 500 productos por página de resultados, y se declara en
  pantalla cuando se alcanza. Un corte silencioso hace que alguien concluya que
  un producto no existe cuando solo quedó fuera del lote.
*/
const LIMITE_LISTADO = 500;

/*
  La exportación usa un tope mucho más alto que la pantalla. Una tabla de
  quinientas filas ya nadie la lee de corrido, pero un archivo de cinco mil sí
  se abre en Excel y se filtra ahí. Si alguna vez se alcanza, la exportación lo
  declara en el nombre del archivo: un recorte silencioso hace que alguien
  cuadre contra un total incompleto sin enterarse.
*/
export const LIMITE_EXPORTACION = 5000;

export async function listarProductos(
  filtros: FiltrosInventario = {},
  limite: number = LIMITE_LISTADO,
): Promise<{
  productos: ProductoListado[];
  ubicaciones: string[];
  truncado: boolean;
  error: string | null;
}> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("productos")
    /*
      El conteo de movimientos viene embebido y agregado por la base, no
      trayendo las filas para contarlas acá. Con quinientos productos que
      pueden tener decenas de movimientos cada uno, traerlas sería mover miles
      de filas para calcular un número por producto.
    */
    .select("*, categorias(nombre, codigo), movimientos_inventario(count)")
    .order("created_at", { ascending: false })
    .limit(limite);

  if (filtros.categoria) consulta = consulta.eq("categoria_id", filtros.categoria);
  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  /*
    La búsqueda va contra nombre y SKU, sin distinguir mayúsculas. El comodín
    se arma acá y no se acepta del usuario: un % suelto en el texto convertiría
    cualquier búsqueda en "traer todo".
  */
  if (filtros.buscar) {
    const termino = filtros.buscar.replace(/[%_]/g, "").trim();
    if (termino) {
      consulta = consulta.or(`nombre.ilike.%${termino}%,sku.ilike.%${termino}%`);
    }
  }

  const { data, error } = await consulta;

  if (error) {
    console.error("No pude leer el inventario:", error.message);
    return { productos: [], ubicaciones: [], truncado: false, error: error.message };
  }

  /*
    PostgREST devuelve un objeto para una relación muchos-a-uno, pero el
    cliente sin tipos generados la infiere como arreglo. Se aceptan las dos
    formas en vez de forzar el casteo y confiar en una.
  */
  const uno = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  type Fila = Producto & {
    categorias: { nombre: string; codigo: string } | { nombre: string; codigo: string }[] | null;
    movimientos_inventario: { count: number }[] | { count: number } | null;
  };

  const productos = ((data ?? []) as unknown as Fila[]).map((p) => {
    const c = uno(p.categorias);
    const conteo = uno(p.movimientos_inventario);
    return {
      ...p,
      categoria_nombre: c?.nombre ?? null,
      categoria_codigo: c?.codigo ?? null,
      movimientos: Number(conteo?.count ?? 0),
    } as ProductoListado;
  });

  const ubicaciones = [
    ...new Set(productos.map((p) => p.ubicacion).filter((u): u is string => Boolean(u))),
  ].sort();

  return {
    productos,
    ubicaciones,
    truncado: productos.length === limite,
    error: null,
  };
}

export type ResumenInventario = {
  total: number;
  borradores: number;
  confirmados: number;
  archivados: number;
  unidades: number;
  /** Suma del precio vigente por la cantidad. Es una valorización, no un costo. */
  valorizacion: number;
  /** Cuántos productos tienen precio solo estimado, sin confirmar. */
  precioSinRevisar: number;
  error: string | null;
};

export async function cargarResumen(): Promise<ResumenInventario> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("productos")
    .select("estado, cantidad, precio_vigente_clp, precio_confirmado_clp, precio_estimado_clp")
    .limit(5000);

  const vacio: ResumenInventario = {
    total: 0,
    borradores: 0,
    confirmados: 0,
    archivados: 0,
    unidades: 0,
    valorizacion: 0,
    precioSinRevisar: 0,
    error: null,
  };

  if (error) {
    console.error("No pude leer el resumen del inventario:", error.message);
    return { ...vacio, error: error.message };
  }

  type Fila = {
    estado: string;
    cantidad: number;
    precio_vigente_clp: number | null;
    precio_confirmado_clp: number | null;
    precio_estimado_clp: number | null;
  };

  const filas = (data ?? []) as Fila[];

  return {
    total: filas.length,
    borradores: filas.filter((f) => f.estado === "borrador").length,
    confirmados: filas.filter((f) => f.estado === "confirmado").length,
    archivados: filas.filter((f) => f.estado === "archivado").length,
    /* Lo archivado no suma unidades ni valor: está fuera de circulación. */
    unidades: filas
      .filter((f) => f.estado !== "archivado")
      .reduce((s, f) => s + Number(f.cantidad ?? 0), 0),
    valorizacion: filas
      .filter((f) => f.estado !== "archivado")
      .reduce((s, f) => s + Number(f.cantidad ?? 0) * Number(f.precio_vigente_clp ?? 0), 0),
    precioSinRevisar: filas.filter(
      (f) =>
        f.estado !== "archivado" &&
        f.precio_confirmado_clp === null &&
        f.precio_estimado_clp !== null,
    ).length,
    error: null,
  };
}

export async function obtenerProducto(id: string): Promise<{
  producto: ProductoConCategoria | null;
  movimientos: Movimiento[];
  error: string | null;
}> {
  const supabase = await crearClienteServidor();

  const [resProducto, resMovimientos] = await Promise.all([
    supabase.from("productos").select("*, categorias(nombre, codigo)").eq("id", id).maybeSingle(),
    supabase
      .from("movimientos_inventario")
      .select("id, producto_id, tipo, cantidad, motivo, creado_por, created_at")
      .eq("producto_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (resProducto.error) {
    console.error("No pude leer el producto:", resProducto.error.message);
    return { producto: null, movimientos: [], error: resProducto.error.message };
  }
  if (!resProducto.data) {
    return { producto: null, movimientos: [], error: null };
  }

  const uno = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const fila = resProducto.data as unknown as Producto & {
    categorias: { nombre: string; codigo: string } | { nombre: string; codigo: string }[] | null;
  };
  const c = uno(fila.categorias);

  if (resMovimientos.error) {
    console.error("No pude leer los movimientos:", resMovimientos.error.message);
  }

  return {
    producto: {
      ...fila,
      categoria_nombre: c?.nombre ?? null,
      categoria_codigo: c?.codigo ?? null,
    } as ProductoConCategoria,
    movimientos: (resMovimientos.data ?? []) as Movimiento[],
    /* Un fallo al leer los movimientos NO oculta el producto, pero sí se dice. */
    error: resMovimientos.error ? resMovimientos.error.message : null,
  };
}
