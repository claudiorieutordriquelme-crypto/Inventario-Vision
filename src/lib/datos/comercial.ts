import { cache } from "react";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import type {
  Caja,
  CajaItem,
  Cliente,
  ClienteConDirecciones,
  Despacho,
  DireccionCliente,
  Venta,
  VentaConDetalle,
  VentaItem,
} from "@/lib/tipos";

/*
  Lecturas de la parte comercial: clientes, ventas y despachos.

  Todo pasa por el cliente con sesión, así que cada consulta se evalúa contra
  las políticas RLS con el JWT de quien mira. No hay ningún filtro de permisos
  en este archivo a propósito: si alguien no debe ver algo, lo decide la base.

  Cada función devuelve el dato Y el error por separado. Un fallo de lectura
  devuelto como lista vacía se ve idéntico a "todavía no hay nada", y esa
  confusión hace que una pantalla diga "sin ventas hoy" cuando en realidad la
  consulta falló. En una pantalla de ventas, eso es peor que un error visible.
*/

const LIMITE = 200;

/* ── Clientes ────────────────────────────────────────────────────────────── */

export async function listarClientes(
  buscar?: string,
  incluirInactivos = false,
): Promise<{ clientes: Cliente[]; error: string | null }> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("clientes")
    .select("id, nombre, telefono, email, notas, activo, created_at, updated_at")
    .order("nombre")
    .limit(LIMITE);

  if (!incluirInactivos) consulta = consulta.eq("activo", true);

  /*
    La búsqueda por nombre va con ilike y no con la función de trigramas: el
    nombre de un cliente se escribe completo o casi, y quien busca "Gonz"
    espera ver a González. La tolerancia a errores de tipeo importa para
    productos, donde el nombre lo escribió el modelo.
  */
  if (buscar && buscar.trim()) {
    const t = buscar.trim();
    consulta = consulta.or(`nombre.ilike.%${t}%,telefono.ilike.%${t}%,email.ilike.%${t}%`);
  }

  const { data, error } = await consulta;
  if (error) {
    console.error("No pude leer los clientes:", error.message);
    return { clientes: [], error: error.message };
  }
  return { clientes: (data ?? []) as Cliente[], error: null };
}

export const obtenerCliente = cache(
  async (
    id: string,
  ): Promise<{ cliente: ClienteConDirecciones | null; error: string | null }> => {
    const supabase = await crearClienteServidor();

    const [resCliente, resDirecciones] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, telefono, email, notas, activo, created_at, updated_at")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("cliente_direcciones")
        .select("id, cliente_id, etiqueta, calle, comuna, ciudad, referencia, preferida, activa")
        .eq("cliente_id", id)
        .order("preferida", { ascending: false })
        .order("created_at"),
    ]);

    if (resCliente.error) {
      console.error("No pude leer el cliente:", resCliente.error.message);
      return { cliente: null, error: resCliente.error.message };
    }
    if (!resCliente.data) return { cliente: null, error: null };

    if (resDirecciones.error) {
      console.error("No pude leer las direcciones:", resDirecciones.error.message);
    }

    return {
      cliente: {
        ...(resCliente.data as Cliente),
        direcciones: (resDirecciones.data ?? []) as DireccionCliente[],
      },
      error: resDirecciones.error?.message ?? null,
    };
  },
);

/* ── Ventas ──────────────────────────────────────────────────────────────── */

export type FiltrosVenta = { estado?: string; canal?: string; buscar?: string };

export async function listarVentas(
  filtros: FiltrosVenta = {},
): Promise<{ ventas: (Venta & { cliente_nombre: string | null })[]; error: string | null }> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("ventas")
    .select("*, clientes(nombre)")
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  if (filtros.estado) consulta = consulta.eq("estado", filtros.estado);
  if (filtros.canal) consulta = consulta.eq("canal", filtros.canal);
  if (filtros.buscar?.trim()) consulta = consulta.ilike("folio", `%${filtros.buscar.trim()}%`);

  const { data, error } = await consulta;
  if (error) {
    console.error("No pude leer las ventas:", error.message);
    return { ventas: [], error: error.message };
  }

  const filas = (data ?? []) as (Venta & { clientes: { nombre: string } | null })[];
  return {
    ventas: filas.map(({ clientes, ...v }) => ({ ...v, cliente_nombre: clientes?.nombre ?? null })),
    error: null,
  };
}

export const obtenerVenta = cache(
  async (id: string): Promise<{ venta: VentaConDetalle | null; error: string | null }> => {
    const supabase = await crearClienteServidor();

    const [resVenta, resItems] = await Promise.all([
      supabase.from("ventas").select("*, clientes(nombre)").eq("id", id).maybeSingle(),
      supabase
        .from("venta_items")
        .select("id, venta_id, producto_id, nombre, sku, cantidad, precio_unitario_clp, subtotal_clp")
        .eq("venta_id", id)
        .order("created_at"),
    ]);

    if (resVenta.error) {
      console.error("No pude leer la venta:", resVenta.error.message);
      return { venta: null, error: resVenta.error.message };
    }
    if (!resVenta.data) return { venta: null, error: null };

    if (resItems.error) {
      console.error("No pude leer los ítems de la venta:", resItems.error.message);
      /*
        Una venta sin sus ítems NO se devuelve a medias. El total vendría de la
        columna y los ítems vacíos: la pantalla mostraría "$45.000" con un
        carrito vacío debajo, y eso parece una venta corrupta en vez de un
        error de lectura.
      */
      return { venta: null, error: resItems.error.message };
    }

    const { clientes, ...venta } = resVenta.data as Venta & { clientes: { nombre: string } | null };

    return {
      venta: {
        ...venta,
        cliente_nombre: clientes?.nombre ?? null,
        items: (resItems.data ?? []) as VentaItem[],
      },
      error: null,
    };
  },
);

/*
  La venta en borrador de quien está vendiendo ahora.

  POR QUÉ LA MÁS RECIENTE Y NO UNA POR PERSONA. El punto de venta es un
  mostrador: lo normal es que haya un carrito abierto a la vez. Buscar el
  último borrador y seguir ahí evita que alguien acumule seis carritos
  olvidados sin darse cuenta.
*/
export async function ventaEnCurso(): Promise<{ venta: VentaConDetalle | null; error: string | null }> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("ventas")
    .select("id")
    .eq("estado", "borrador")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("No pude buscar la venta en curso:", error.message);
    return { venta: null, error: error.message };
  }
  if (!data) return { venta: null, error: null };

  return obtenerVenta((data as { id: string }).id);
}

/* ── Despachos ───────────────────────────────────────────────────────────── */

export async function listarDespachos(
  estado?: string,
): Promise<{
  despachos: (Despacho & { cliente_nombre: string | null; cajas: number })[];
  error: string | null;
}> {
  const supabase = await crearClienteServidor();

  let consulta = supabase
    .from("despachos")
    .select("*, clientes(nombre), cajas(count)")
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  if (estado) consulta = consulta.eq("estado", estado);

  const { data, error } = await consulta;
  if (error) {
    console.error("No pude leer los despachos:", error.message);
    return { despachos: [], error: error.message };
  }

  const filas = (data ?? []) as (Despacho & {
    clientes: { nombre: string } | null;
    cajas: { count: number }[];
  })[];

  return {
    despachos: filas.map(({ clientes, cajas, ...d }) => ({
      ...d,
      cliente_nombre: clientes?.nombre ?? null,
      cajas: cajas?.[0]?.count ?? 0,
    })),
    error: null,
  };
}

export type CajaConContenido = Caja & {
  items: (CajaItem & { nombre: string; sku: string; folio: string })[];
};

export type DespachoConDetalle = Despacho & {
  cliente_nombre: string | null;
  cajas: CajaConContenido[];
  /* Lo vendido en este despacho, para poder repartirlo entre las cajas. */
  pendientes: (VentaItem & { folio: string; embalado: number })[];
};

export const obtenerDespacho = cache(
  async (id: string): Promise<{ despacho: DespachoConDetalle | null; error: string | null }> => {
    const supabase = await crearClienteServidor();

    const resDespacho = await supabase
      .from("despachos")
      .select("*, clientes(nombre)")
      .eq("id", id)
      .maybeSingle();

    if (resDespacho.error) {
      console.error("No pude leer el despacho:", resDespacho.error.message);
      return { despacho: null, error: resDespacho.error.message };
    }
    if (!resDespacho.data) return { despacho: null, error: null };

    const [resCajas, resVentas] = await Promise.all([
      supabase
        .from("cajas")
        .select("id, despacho_id, numero, token, peso_kg, notas, caja_items(id, caja_id, venta_item_id, cantidad)")
        .eq("despacho_id", id)
        .order("numero"),
      supabase.from("despacho_ventas").select("venta_id").eq("despacho_id", id),
    ]);

    if (resCajas.error || resVentas.error) {
      const mensaje = resCajas.error?.message ?? resVentas.error?.message ?? "";
      console.error("No pude leer el contenido del despacho:", mensaje);
      return { despacho: null, error: mensaje };
    }

    const ventaIds = ((resVentas.data ?? []) as { venta_id: string }[]).map((v) => v.venta_id);

    const resItems = ventaIds.length
      ? await supabase
          .from("venta_items")
          .select("id, venta_id, producto_id, nombre, sku, cantidad, precio_unitario_clp, subtotal_clp, ventas(folio)")
          .in("venta_id", ventaIds)
      : { data: [], error: null };

    if (resItems.error) {
      console.error("No pude leer lo vendido del despacho:", resItems.error.message);
      return { despacho: null, error: resItems.error.message };
    }

    const items = (resItems.data ?? []) as (VentaItem & { ventas: { folio: string } | null })[];
    const porItem = new Map(items.map((i) => [i.id, i]));

    /* Cuánto de cada ítem ya está en alguna caja. Es lo que decide qué queda
       por embalar, y mostrarlo mal haría que alguien mande una caja incompleta. */
    const embaladoPorItem = new Map<string, number>();

    const cajasCrudas = (resCajas.data ?? []) as (Caja & { caja_items: CajaItem[] })[];
    for (const caja of cajasCrudas) {
      for (const ci of caja.caja_items ?? []) {
        embaladoPorItem.set(ci.venta_item_id, (embaladoPorItem.get(ci.venta_item_id) ?? 0) + Number(ci.cantidad));
      }
    }

    const cajas: CajaConContenido[] = cajasCrudas.map((caja) => ({
      ...caja,
      items: (caja.caja_items ?? []).map((ci) => {
        const origen = porItem.get(ci.venta_item_id);
        return {
          ...ci,
          nombre: origen?.nombre ?? "Artículo que ya no existe",
          sku: origen?.sku ?? "—",
          folio: origen?.ventas?.folio ?? "—",
        };
      }),
    }));

    const { clientes, ...despacho } = resDespacho.data as Despacho & {
      clientes: { nombre: string } | null;
    };

    return {
      despacho: {
        ...despacho,
        cliente_nombre: clientes?.nombre ?? null,
        cajas,
        pendientes: items.map(({ ventas, ...i }) => ({
          ...i,
          folio: ventas?.folio ?? "—",
          embalado: embaladoPorItem.get(i.id) ?? 0,
        })),
      },
      error: null,
    };
  },
);

/** La caja detrás de un token de QR. Exige sesión como todo lo demás. */
export async function cajaPorToken(
  token: string,
): Promise<{ despachoId: string | null; cajaId: string | null; error: string | null }> {
  const supabase = await crearClienteServidor();

  const { data, error } = await supabase
    .from("cajas")
    .select("id, despacho_id")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    console.error("No pude resolver el código de la caja:", error.message);
    return { despachoId: null, cajaId: null, error: error.message };
  }
  if (!data) return { despachoId: null, cajaId: null, error: null };

  const fila = data as { id: string; despacho_id: string };
  return { despachoId: fila.despacho_id, cajaId: fila.id, error: null };
}

/* ── Buscar productos para vender ────────────────────────────────────────── */

export type ResultadoBusqueda = {
  id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precio_vigente_clp: number | null;
  categoria_nombre: string | null;
  ubicacion_tipo: string | null;
  estado: string;
  /** 0..1. Solo viene cuando se buscó por texto. */
  parecido: number | null;
};

/*
  Búsqueda del punto de venta: por texto, por categoría, o las dos.

  EL TEXTO VA POR buscar_productos(), que usa trigramas: tolera letras
  cambiadas, faltantes y sobrantes, y no distingue acentos. Quien escribe
  "muñeca porcelna" encuentra "Muñeca de porcelana", que es exactamente lo que
  no pasaba con el ilike de antes.

  NO SE OFRECE LO ARCHIVADO. Un producto archivado está fuera de circulación;
  mostrarlo en el buscador de ventas es ofrecer algo que la venta va a
  rechazar después.
*/
export async function buscarParaVender(
  texto?: string,
  categoriaId?: string,
): Promise<{ resultados: ResultadoBusqueda[]; error: string | null }> {
  const supabase = await crearClienteServidor();

  const consultaBase = () =>
    supabase
      .from("productos")
      .select("id, sku, nombre, cantidad, precio_vigente_clp, estado, ubicacion_tipo, categorias(nombre)")
      .neq("estado", "archivado")
      .order("nombre")
      .limit(60);

  /* Sin texto: se lista por categoría, o lo último cargado. */
  if (!texto || !texto.trim()) {
    let consulta = consultaBase();
    if (categoriaId) consulta = consulta.eq("categoria_id", categoriaId);

    const { data, error } = await consulta;
    if (error) {
      console.error("No pude listar productos para vender:", error.message);
      return { resultados: [], error: error.message };
    }
    return { resultados: aResultados(data), error: null };
  }

  const { data: parecidos, error: errorBusqueda } = await supabase.rpc("buscar_productos", {
    p_texto: texto.trim(),
    p_limite: 60,
  });

  if (errorBusqueda) {
    console.error("No pude buscar productos:", errorBusqueda.message);
    return { resultados: [], error: errorBusqueda.message };
  }

  const orden = (parecidos ?? []) as { id: string; parecido: number }[];
  if (orden.length === 0) return { resultados: [], error: null };

  const porId = new Map(orden.map((p) => [p.id, p.parecido]));

  let consulta = consultaBase().in(
    "id",
    orden.map((p) => p.id),
  );
  if (categoriaId) consulta = consulta.eq("categoria_id", categoriaId);

  const { data, error } = await consulta;
  if (error) {
    console.error("No pude leer los productos encontrados:", error.message);
    return { resultados: [], error: error.message };
  }

  /* El orden lo manda el parecido, no el nombre: lo más parecido va primero. */
  const resultados = aResultados(data)
    .map((r) => ({ ...r, parecido: porId.get(r.id) ?? null }))
    .sort((a, b) => (b.parecido ?? 0) - (a.parecido ?? 0));

  return { resultados, error: null };
}

function aResultados(data: unknown): ResultadoBusqueda[] {
  const filas = (data ?? []) as (Omit<ResultadoBusqueda, "categoria_nombre" | "parecido"> & {
    categorias: { nombre: string } | null;
  })[];
  return filas.map(({ categorias, ...p }) => ({
    ...p,
    categoria_nombre: categorias?.nombre ?? null,
    parecido: null,
  }));
}
