"use server";

import { revalidatePath } from "next/cache";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  buscarReferencias,
  dominioDe,
  MODELO_REFERENCIAS,
  type Referencia,
} from "@/lib/referencias";

export type EstadoReferencias = {
  error?: string;
  ok?: string;
  /*
    Los resultados viajan en el estado de la acción y NO se guardan en la base.
    Solo lo que la persona acepta se escribe. Una tabla con lo que alguien dijo
    que no sirve es una tabla que crece y nadie consulta.
  */
  encontradas?: Referencia[];
  observacion?: string;
};

const texto = (d: FormData, c: string) => String(d.get(c) ?? "").trim();

/*
  Buscar referencias en la web para un producto.

  CUESTA PLATA Y SE DISPARA SOLO CON UN BOTÓN. Cada llamada hace hasta tres
  búsquedas, y la herramienta web_search cobra por búsqueda además de los
  tokens. Por eso queda registrada en busquedas_web, que es lo que alimenta el
  recuadro de consumo.

  SI FALLA, LA FICHA SIGUE FUNCIONANDO. Se devuelve el error como mensaje y
  nada más: ni se borra lo que había, ni se bloquea el formulario del producto.
*/
export async function buscarReferenciasWeb(
  _p: EstadoReferencias,
  datos: FormData,
): Promise<EstadoReferencias> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const productoId = texto(datos, "producto_id");
  if (!productoId) return { error: "Falta el producto." };

  const supabase = await crearClienteServidor();

  const { data, error: errorProducto } = await supabase
    .from("productos")
    .select("nombre, descripcion, epoca, material, categorias(nombre)")
    .eq("id", productoId)
    .maybeSingle();

  if (errorProducto) {
    console.error("No pude leer el producto para buscar:", errorProducto.message);
    return { error: "No pude leer el producto. Intenta de nuevo." };
  }
  if (!data) return { error: "Ese producto ya no existe." };

  /*
    El join llega como arreglo aunque la relación sea de uno a uno: PostgREST
    no sabe que categoria_id es única desde este lado. Se toma el primero.
  */
  const p = data as unknown as {
    nombre: string;
    descripcion: string | null;
    epoca: string | null;
    material: string | null;
    categorias: { nombre: string }[] | { nombre: string } | null;
  };

  const categoria = Array.isArray(p.categorias) ? (p.categorias[0] ?? null) : p.categorias;

  const resultado = await buscarReferencias({
    nombre: p.nombre,
    descripcion: p.descripcion,
    categoria: categoria?.nombre ?? null,
    epoca: p.epoca,
    material: p.material,
  });

  /*
    La bitácora se escribe SIEMPRE, también cuando la búsqueda falló. Un
    registro que solo guarda los aciertos no sirve para saber cuánto se está
    gastando ni qué tan bien funciona.
  */
  const { error: errorBitacora } = await supabase.from("busquedas_web").insert({
    producto_id: productoId,
    consulta: p.nombre,
    modelo: MODELO_REFERENCIAS,
    resultados: resultado.ok ? resultado.referencias.length : 0,
    busquedas: resultado.ok ? resultado.busquedas : 0,
    tokens_entrada: resultado.ok ? resultado.tokensEntrada : null,
    tokens_salida: resultado.ok ? resultado.tokensSalida : null,
    costo_usd: resultado.ok ? resultado.costoUsd : null,
    duracion_ms: resultado.duracionMs,
    error: resultado.ok ? null : resultado.error,
    creado_por: perfilId,
  });

  if (errorBitacora) {
    console.error("No pude registrar la búsqueda:", errorBitacora.message);
  }

  if (!resultado.ok) return { error: resultado.error };

  if (resultado.referencias.length === 0) {
    return {
      ok: "La búsqueda no encontró fuentes útiles.",
      observacion: resultado.observacion,
      encontradas: [],
    };
  }

  return {
    encontradas: resultado.referencias,
    observacion: resultado.observacion,
    ok: `${resultado.referencias.length} ${
      resultado.referencias.length === 1 ? "fuente encontrada" : "fuentes encontradas"
    }. Decide una por una cuáles guardar.`,
  };
}

/** Guarda una referencia que la persona aceptó con el botón Sí. */
export async function aceptarReferencia(
  _p: EstadoReferencias,
  datos: FormData,
): Promise<EstadoReferencias> {
  let perfilId: string;
  try {
    const perfil = await requiereRol(PERMISOS.operar);
    perfilId = perfil.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const productoId = texto(datos, "producto_id");
  const url = texto(datos, "url");
  const titulo = texto(datos, "titulo");
  if (!productoId || !url || !titulo) return { error: "Falta el dato de la referencia." };
  if (!/^https?:\/\//i.test(url)) return { error: "Esa dirección no es una URL válida." };

  const precioCrudo = texto(datos, "precio_mencionado_clp");
  const precio = precioCrudo ? Number(precioCrudo) : null;

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("producto_referencias").insert({
    producto_id: productoId,
    url,
    titulo,
    extracto: texto(datos, "extracto") || null,
    dominio: dominioDe(url),
    respalda: texto(datos, "respalda") || "ambas",
    precio_mencionado_clp: precio !== null && Number.isFinite(precio) ? precio : null,
    creado_por: perfilId,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "Esa fuente ya está guardada en este producto." };
    }
    if (error.code === "42501") {
      return { error: "Tu rol no tiene permiso para guardar referencias." };
    }
    console.error("No pude guardar la referencia:", error.message);
    return { error: "No pude guardar la referencia. Intenta de nuevo." };
  }

  revalidatePath(`/panel/productos/${productoId}`);
  return { ok: "Referencia guardada." };
}

export async function quitarReferencia(
  _p: EstadoReferencias,
  datos: FormData,
): Promise<EstadoReferencias> {
  try {
    await requiereRol(PERMISOS.operar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const id = texto(datos, "referencia_id");
  const productoId = texto(datos, "producto_id");
  if (!id || !productoId) return { error: "Falta la referencia." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("producto_referencias").delete().eq("id", id);

  if (error) {
    console.error("No pude quitar la referencia:", error.message);
    return { error: "No pude quitar la referencia. Intenta de nuevo." };
  }

  revalidatePath(`/panel/productos/${productoId}`);
  return { ok: "Referencia quitada." };
}
