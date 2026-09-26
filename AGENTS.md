<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Reglas de este proyecto

No son preferencias de estilo. Cada una está porque romperla produce un defecto
concreto, y el defecto está escrito al lado.

## Seguridad y datos

1. **`anon` no lee ni escribe en ninguna tabla.** Esta aplicación no tiene
   superficie pública. Cada tabla nueva se revoca explícitamente para `anon`, y
   también el `EXECUTE` de cada función, que Postgres concede a `PUBLIC` por
   defecto.
2. **Cada tabla nueva lleva RLS habilitada y políticas explícitas.** Sin
   política, RLS niega, y esa ausencia es parte del diseño: el libro de
   movimientos no tiene política de UPDATE ni de DELETE por eso.
3. **La `service_role` key no existe en este proyecto.** Todo lo que la
   aplicación escribe pasa por RLS con la sesión de quien opera. Esa llave se
   salta las políticas, así que cualquier error se convertiría en filtración.
4. **Toda Server Action y todo Route Handler verifica el rol por su cuenta.**
   `src/proxy.ts` es comodidad de navegación, no seguridad: un matcher que
   excluye una ruta también excluye sus Server Functions.
5. **Los triggers de negocio son `SECURITY DEFINER` con `search_path` fijado.**
   Sin fijarlo, un esquema puesto por delante en el `search_path` de quien
   llama puede suplantar una tabla.

## Integridad del inventario

6. **`movimientos_inventario` es de solo agregar.** Ni el administrador borra.
   Una corrección se hace con un ajuste que compensa.
7. **`productos.cantidad` no se escribe nunca desde la aplicación.** La manda
   el trigger que suma el libro. Si los dos pudieran escribirla, un día el
   total y el libro dejarían de coincidir y no habría forma de saber cuál
   miente.
8. **`precio_vigente_clp` es columna generada.** No se ingresa ni se corrige
   por UPDATE.
9. **`precio_estimado_clp` no lo sobrescribe nadie.** Es lo que dijo el modelo.
   Borrarlo elimina la única evidencia de cuánto se equivoca.
10. **El SKU lo asigna la base.** Un correlativo calculado en el servidor de
    aplicación se repite en cuanto hay dos procesos.

## Honestidad de la interfaz

11. **El precio estimado NO viene de la web.** Viene del conocimiento del
    modelo. Cada pantalla donde aparece un precio dice de dónde salió.
12. **El estado nunca se comunica solo por color.** Siempre hay además una
    palabra.
13. **Un error de lectura no se muestra igual que "no hay datos".** Cada
    función de `src/lib/datos/` devuelve el dato Y el error por separado, y la
    pantalla los distingue.
14. **Un botón que siempre va a fallar no se muestra.** Si la base va a
    rechazar la operación, la pantalla explica la salida real en vez de
    ofrecerla.

## Identidad visual

15. **Tres colores y ninguno más:** primario `#002eff`, acento `#ff3d00`,
    secundario `#41e8b4`. Los grises son acromáticos, no un cuarto color.
16. **Contraste medido, no estimado.** El acento da 3,5:1 sobre blanco: nunca
    lleva texto pequeño encima ni texto blanco. El secundario da 1,6:1: nunca
    lleva texto. Las dos reglas están en `src/app/globals.css` con sus cifras.
17. **Tipografía Barlow, cargada con `next/font`.** Sin peticiones a terceros.

## Credenciales

18. **Cero credenciales en el repositorio.** `.env.local` está en `.gitignore`.
    `ANTHROPIC_API_KEY` no lleva prefijo `NEXT_PUBLIC_`: con él terminaría en
    el paquete del navegador.
