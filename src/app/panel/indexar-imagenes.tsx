"use client";

import { useState } from "react";
import { descriptorDeUrl } from "@/lib/descriptor";
import { guardarDescriptores, imagenesPorIndexar } from "./buscar-foto-acciones";

/*
  Mide las imágenes del inventario para que la búsqueda por foto las encuentre.

  POR QUÉ ES UN BOTÓN Y NO ALGO AUTOMÁTICO. Medir una imagen exige
  decodificarla, y el servidor de Next no puede hacerlo sin agregar una
  dependencia nativa. El navegador sí, con el mismo canvas que ya usa la
  cámara. Entonces el trabajo lo hace la máquina de quien aprieta el botón, de
  a lotes, con el avance a la vista.

  SE PUEDE CORTAR Y RETOMAR. Cada lote se guarda apenas se mide, así que
  cerrar la pestaña a la mitad no pierde lo hecho: la próxima vez empieza donde
  quedó, porque el servidor devuelve solo las que todavía no tienen medición.

  NO CUESTA NADA. No hay llamada a ningún modelo. Lo único que viaja de vuelta
  son 256 números por imagen.
*/

type Estado =
  | { fase: "quieto" }
  | { fase: "trabajando"; hechas: number; total: number }
  | { fase: "listo"; hechas: number; fallidas: number }
  | { fase: "error"; mensaje: string };

export function IndexarImagenes({ faltanInicial }: { faltanInicial: number }) {
  const [estado, setEstado] = useState<Estado>({ fase: "quieto" });
  const [faltan, setFaltan] = useState(faltanInicial);

  const indexar = async () => {
    let hechas = 0;
    let fallidas = 0;
    let restantes = faltan;

    setEstado({ fase: "trabajando", hechas: 0, total: restantes });

    /*
      Tope de vueltas. Sin él, un error que devolviera siempre el mismo lote
      sin poder guardarlo dejaría este bucle girando para siempre contra el
      servidor.
    */
    for (let vuelta = 0; vuelta < 200; vuelta++) {
      const { imagenes, faltan: pendientes, error } = await imagenesPorIndexar(20);

      if (error) {
        setEstado({ fase: "error", mensaje: error });
        return;
      }
      if (imagenes.length === 0) {
        setFaltan(0);
        setEstado({ fase: "listo", hechas, fallidas });
        return;
      }

      restantes = pendientes;

      const medidos: { imagen_id: string; producto_id: string; vector: number[] }[] = [];
      for (const img of imagenes) {
        const vector = await descriptorDeUrl(img.url);
        if (vector) {
          medidos.push({ imagen_id: img.imagen_id, producto_id: img.producto_id, vector });
        } else {
          /*
            Una imagen que no se puede medir no se reintenta en esta corrida,
            pero tampoco se marca: volverá a aparecer la próxima vez. Es
            preferible a guardarle un vector falso, que la haría parecerse a
            cualquier cosa en todas las búsquedas futuras.
          */
          fallidas++;
        }
      }

      if (medidos.length > 0) {
        const { error: errorGuardar } = await guardarDescriptores(medidos);
        if (errorGuardar) {
          setEstado({ fase: "error", mensaje: errorGuardar });
          return;
        }
        hechas += medidos.length;
      }

      setFaltan(Math.max(0, restantes - medidos.length));
      setEstado({ fase: "trabajando", hechas, total: hechas + Math.max(0, restantes - medidos.length) });

      /* Si el lote entero falló, insistir con el siguiente no va a ir mejor. */
      if (medidos.length === 0) {
        setEstado({ fase: "listo", hechas, fallidas });
        return;
      }
    }

    setEstado({ fase: "listo", hechas, fallidas });
  };

  if (faltan === 0 && estado.fase !== "listo") return null;

  return (
    <section className="rounded-lg border border-marca p-4">
      <h2 className="text-sm font-bold tracking-widest text-gris-500 uppercase">
        Búsqueda por foto
      </h2>

      {estado.fase === "listo" ? (
        <p className="mt-2 text-sm text-gris-900">
          Listo: {estado.hechas} {estado.hechas === 1 ? "imagen medida" : "imágenes medidas"}.
          {estado.fallidas > 0
            ? ` ${estado.fallidas} no se pudieron leer y van a volver a aparecer la próxima vez.`
            : ""}
        </p>
      ) : estado.fase === "error" ? (
        <p role="alert" className="mt-2 text-sm text-gris-900">
          {estado.mensaje}
        </p>
      ) : estado.fase === "trabajando" ? (
        <>
          <p aria-live="polite" className="mt-2 text-sm text-gris-900">
            Midiendo {estado.hechas} de {estado.total}. Puedes cerrar esto cuando
            quieras: lo medido queda guardado.
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gris-200">
            <div
              className="h-full bg-marca transition-[width]"
              style={{ width: `${estado.total ? (estado.hechas / estado.total) * 100 : 0}%` }}
            />
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 max-w-prose text-sm text-gris-700">
            Hay <span className="font-bold">{faltan}</span>{" "}
            {faltan === 1 ? "imagen sin medir" : "imágenes sin medir"}. Hasta
            que se midan, la búsqueda por foto no las va a encontrar. Se mide en
            este navegador y no cuesta nada.
          </p>
          <button
            type="button"
            onClick={() => void indexar()}
            className="mt-3 rounded-md bg-primario px-4 py-2.5 text-sm font-semibold text-blanco"
          >
            Medir ahora
          </button>
        </>
      )}
    </section>
  );
}
