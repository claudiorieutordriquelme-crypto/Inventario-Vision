"use server";

import { revalidatePath } from "next/cache";
import { PERMISOS, requiereRol } from "@/lib/auth";
import { crearClienteServidor } from "@/lib/supabase/servidor";

export type EstadoCategoria = { error?: string; ok?: string };

const texto = (d: FormData, c: string) => String(d.get(c) ?? "").trim();

function traduce(codigo: string | undefined, mensaje: string): string {
  if (codigo === "42501") return "Tu rol no tiene permiso para administrar categorías.";
  if (codigo === "23505") {
    if (mensaje.includes("prefijo")) {
      return "Ya existe una categoría con ese prefijo. El prefijo tiene que ser único, porque es lo que arma el SKU.";
    }
    return "Ya existe una categoría con ese código.";
  }
  if (codigo === "23503") {
    return "No puedo borrar esta categoría: tiene productos asignados. Desactívala, así deja de ofrecerse y los productos conservan su clasificación.";
  }
  if (codigo === "23514") {
    if (mensaje.includes("prefijo_formato")) {
      return "El prefijo son de 2 a 4 letras mayúsculas, sin números ni espacios.";
    }
    if (mensaje.includes("codigo_slug")) {
      return "El código va en minúsculas, sin espacios ni acentos. Usa guion bajo si necesitas separar.";
    }
    /* Los tres de abajo los levanta el trigger categorias_un_solo_nivel, y el
       mensaje de la base ya está escrito para que lo lea una persona. */
    if (mensaje.includes("un solo nivel")) {
      return "Esa categoría ya es una subcategoría. El árbol es de un solo nivel: elige una categoría raíz como madre.";
    }
    if (mensaje.includes("ya tiene subcategorias")) {
      return "Esta categoría tiene subcategorías, así que no puede pasar a ser hija de otra. Primero saca a sus hijas.";
    }
    if (mensaje.includes("no_es_su_propio_padre")) {
      return "Una categoría no puede ser su propia madre.";
    }
    return "Los datos no cumplen una regla de la base.";
  }
  console.error("Error de base en categorías:", mensaje);
  return "No pude guardar. Revisa los datos e intenta de nuevo.";
}

/*
  El código y el prefijo se normalizan acá y no se le piden perfectos al
  usuario. Escribir "Herramientas Eléctricas" y que el sistema derive
  "herramientas_electricas" es lo que corresponde; hacer que la persona
  descubra el formato a base de errores, no.
*/
function aCodigo(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function crearCategoria(
  _p: EstadoCategoria,
  datos: FormData,
): Promise<EstadoCategoria> {
  try {
    await requiereRol(PERMISOS.administrar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const nombre = texto(datos, "nombre");
  const prefijo = texto(datos, "prefijo_sku").toUpperCase();
  if (!nombre) return { error: "La categoría necesita un nombre." };
  if (!/^[A-Z]{2,4}$/.test(prefijo)) {
    return { error: "El prefijo son de 2 a 4 letras, por ejemplo HER o ELEC." };
  }

  const codigo = texto(datos, "codigo") ? aCodigo(texto(datos, "codigo")) : aCodigo(nombre);
  if (!codigo) return { error: "No pude derivar un código del nombre. Escríbelo a mano." };

  const supabase = await crearClienteServidor();
  const { error } = await supabase.from("categorias").insert({
    codigo,
    nombre,
    prefijo_sku: prefijo,
    descripcion: texto(datos, "descripcion") || null,
    orden: Number(texto(datos, "orden")) || 100,
    /* Cadena vacía es "ninguna", no una madre llamada "". */
    padre_id: texto(datos, "padre_id") || null,
    pieza_unica: texto(datos, "pieza_unica") === "1",
  });

  if (error) return { error: traduce(error.code, error.message) };

  revalidatePath("/panel/categorias");
  revalidatePath("/panel");
  return { ok: `Categoría "${nombre}" creada con prefijo ${prefijo}.` };
}

export async function actualizarCategoria(
  _p: EstadoCategoria,
  datos: FormData,
): Promise<EstadoCategoria> {
  try {
    await requiereRol(PERMISOS.administrar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const id = texto(datos, "id");
  const nombre = texto(datos, "nombre");
  if (!id) return { error: "Falta la categoría." };
  if (!nombre) return { error: "La categoría necesita un nombre." };

  const supabase = await crearClienteServidor();
  /*
    El PREFIJO NO SE EDITA. Los SKU ya emitidos no se renumeran, así que
    cambiarlo dejaría productos HER-0001 en una categoría con prefijo ELE y
    nadie podría explicar por qué. Si hace falta otro prefijo, lo correcto es
    otra categoría.
  */
  const { data, error } = await supabase
    .from("categorias")
    .update({
      nombre,
      descripcion: texto(datos, "descripcion") || null,
      orden: Number(texto(datos, "orden")) || 100,
      activo: texto(datos, "activo") === "1",
      padre_id: texto(datos, "padre_id") || null,
      pieza_unica: texto(datos, "pieza_unica") === "1",
    })
    .eq("id", id)
    .select("nombre");

  if (error) return { error: traduce(error.code, error.message) };
  if (!data || data.length === 0) return { error: "Esa categoría ya no existe." };

  revalidatePath("/panel/categorias");
  revalidatePath("/panel");
  return { ok: "Categoría actualizada." };
}

export async function eliminarCategoria(
  _p: EstadoCategoria,
  datos: FormData,
): Promise<EstadoCategoria> {
  try {
    await requiereRol(PERMISOS.administrar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No autorizado." };
  }

  const id = texto(datos, "id");
  const confirmacion = texto(datos, "confirmacion");
  const esperado = texto(datos, "nombre_esperado");
  if (!id) return { error: "Falta la categoría." };
  if (confirmacion !== esperado) {
    return { error: `Para borrar, escribe exactamente el nombre: ${esperado}` };
  }

  const supabase = await crearClienteServidor();
  const { data, error } = await supabase
    .from("categorias")
    .delete()
    .eq("id", id)
    .select("nombre");

  if (error) return { error: traduce(error.code, error.message) };
  if (!data || data.length === 0) return { error: "Esa categoría ya no existe." };

  revalidatePath("/panel/categorias");
  revalidatePath("/panel");
  return {
    ok: `Categoría "${data[0].nombre}" borrada. Su correlativo de SKU se conserva, así que los números no se reutilizan.`,
  };
}
