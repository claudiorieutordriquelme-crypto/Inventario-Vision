# Inventario

Control de inventario a partir de fotos. Se le saca una foto a un producto, el
sistema lo identifica, lo clasifica en una de tus categorías, le asigna un SKU
correlativo y propone una descripción y un precio estimado. Queda en borrador
hasta que una persona lo revisa y confirma.

**No es un ERP.** Es un inventario con trazabilidad: qué hay, cuánto hay, dónde
está, cuánto vale y quién dijo que vale eso.

---

## Lo primero que hay que entender: de dónde sale el precio

El precio que propone el análisis es una **estimación del modelo**, no un
precio consultado en la web. Sale de su conocimiento, que tiene fecha de corte.

Toda la aplicación está construida alrededor de esa distinción:

- La columna se llama `precio_estimado_clp` y **nunca** la sobrescribe una
  persona. Cuando alguien fija un precio, se guarda aparte en
  `precio_confirmado_clp`, y el estimado se conserva.
- El precio que se muestra y se usa para valorizar es `precio_vigente_clp`, una
  columna generada: el confirmado si existe, si no el estimado.
- En cada pantalla donde aparece un precio se dice de dónde salió.
- El resumen del inventario cuenta cuántos productos tienen precio solo
  estimado, sin revisar.

Si algún día se quiere el precio real de mercado, el cambio está acotado a un
lugar: agregar la herramienta de servidor `web_search` a la llamada de
`src/lib/vision.ts` y guardar las fuentes citadas junto al monto.

---

## Puesta en marcha

### 1. Proyecto de Supabase

Crea uno en [supabase.com](https://supabase.com). Anota de **Project Settings →
API**:

- la URL (`https://<ref>.supabase.co`)
- la `anon` key

La `service_role` key **no se usa en este proyecto y no debe cargarse en
ninguna parte**. Esa llave se salta todas las políticas de la base, así que
cualquier error de la aplicación se convertiría en una filtración. Todo lo que
la aplicación escribe pasa por RLS con la sesión de quien opera.

### 2. Aplicar el esquema

Con un token de acceso de Supabase en `~/.supabase_token` (o en
`SUPABASE_ACCESS_TOKEN`):

```bash
export SUPABASE_PROJECT_REF=<la-ref-de-tu-proyecto>

# Primero en seco: aplica todo y vuelve atrás, sin escribir nada.
node scripts/aplica-migraciones.mjs --ensayo

# Si pasó, de verdad.
node scripts/aplica-migraciones.mjs
```

Esto crea las tablas, las políticas RLS, el bucket privado de fotos y once
categorías de arranque.

### 3. Primer usuario administrador

Crea la cuenta en **Authentication → Users** del panel de Supabase, y después
su perfil:

```sql
insert into public.profiles (user_id, nombre, email, rol)
select id, 'Tu nombre', email, 'admin'
from auth.users where email = 'tu@correo.cl';
```

Desde ahí el resto de los usuarios se administra en la pantalla de Usuarios.
Una persona aparece en esa lista recién después de registrarse: la aplicación
no invita cuentas, porque hacerlo exigiría la `service_role` key.

### 4. Variables de entorno

Copia `.env.example` a `.env.local` y complétalo. En Vercel, las mismas tres en
**Settings → Environment Variables**.

```
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
ANTHROPIC_API_KEY=<clave>            # opcional, ver abajo
```

`ANTHROPIC_API_KEY` es opcional a propósito. Sin ella todo el inventario
funciona: se cargan productos, se editan, se registran movimientos, se vende y
se despacha. Lo único que deja de andar es el análisis automático de fotos y la
búsqueda de referencias en la web, y las dos pantallas lo dicen en vez de
fallar.

Ninguna variable lleva prefijo `NEXT_PUBLIC_`, y es una decisión: con él, el
valor termina dentro del paquete que descarga el navegador.

**Cosas que NO son variables de entorno, y dónde viven:**

| Qué | Dónde se configura | Por qué no es una variable |
|---|---|---|
| Tope mensual de gasto de la API | Tabla `presupuesto_api`, se edita en `/panel` | Cambiarlo no debería exigir un despliegue |
| Credenciales de la cuenta demo | Tabla `acceso_demo` | Se apaga con un `UPDATE`, sin desplegar |
| Dirección pública del sitio | Se deduce de las cabeceras de cada petición | Una variable mal puesta rompería los QR en silencio |

### 5. Quién puede hacer qué

Los permisos los hace cumplir la base con políticas RLS. La interfaz esconde
botones por comodidad; la barrera real son las políticas.

| Acción | Admin | Operador | Lector |
|---|---|---|---|
| Ver inventario, ventas, despachos y clientes | Sí | Sí | Sí |
| Cargar productos con foto, editarlos, mover stock | Sí | Sí | No |
| Agregar y quitar imágenes de un producto | Sí | Sí | No |
| Buscar referencias en la web y guardarlas | Sí | Sí | No |
| Vender: abrir carrito, cobrar, anular | Sí | Sí | No |
| Despachar: armar cajas, embalar, avanzar estado | Sí | Sí | No |
| Crear y editar clientes y sus direcciones | Sí | Sí | No |
| Borrar productos | Sí | Sí | No |
| Borrar clientes | Sí | No | No |
| Categorías, usuarios y presupuesto | Sí | No | No |

Dos cosas que **nadie** puede hacer, ni el administrador:

- Editar o borrar un movimiento del libro de inventario. Una corrección se hace
  con un ajuste que compensa, y ese ajuste queda registrado.
- Cambiar los productos de una venta ya confirmada. Se anula y se hace otra.

### 6. Comprobar que todo quedó bien

```bash
# El esquema: RLS, permisos de anon, triggers blindados, SKU sin carreras
SUPABASE_PROJECT_REF=<ref> node scripts/verifica-esquema.mjs

# Las reglas del negocio: 3 imágenes, pieza única, stock, cajas, QR
SUPABASE_PROJECT_REF=<ref> node scripts/verifica-reglas.mjs
```

El segundo le pide a la base que haga lo prohibido y comprueba que se niegue.
Corre dentro de una transacción que vuelve atrás: no deja nada escrito.

### 7. Local

```bash
npm install
npm run dev
```

---

## Cuánto cuesta analizar una foto

El análisis usa `claude-opus-5` con `effort: "low"`, que es lo que corresponde
a una tarea de un paso: identificar un objeto y describirlo. Cada análisis
queda registrado en `analisis_imagen` con sus tokens y su costo estimado en
dólares, así que el gasto real se consulta:

```sql
select date_trunc('month', created_at) as mes,
       count(*) as analisis,
       round(sum(costo_usd)::numeric, 2) as usd
from public.analisis_imagen
group by 1 order by 1 desc;
```

Si la calidad de la identificación no alcanza, el primer dial que hay que mover
es el `effort` en `src/lib/vision.ts`, y está en un solo lugar.

---

## Decisiones que conviene conocer antes de tocar el código

**El SKU lo asigna la base, no la aplicación.** Un trigger llama a
`siguiente_sku()`, que toma el candado de la fila del correlativo, así que dos
altas simultáneas nunca reciben el mismo número. Un correlativo calculado en el
servidor de aplicación se repite en cuanto hay dos procesos.

**La cantidad es la suma de su libro de movimientos.** La aplicación nunca
escribe `productos.cantidad` directamente: inserta un movimiento y un trigger
recalcula. Si pudiera hacer las dos cosas, un día el total y el libro dejarían
de coincidir y no habría forma de saber cuál miente.

**El libro de movimientos es de solo agregar.** No hay política de UPDATE ni de
DELETE sobre `movimientos_inventario`, y su ausencia es la regla: sin política,
RLS niega. Ni el administrador borra una fila. Una corrección se hace con un
ajuste que compensa.

**El rol `anon` no lee ni escribe en ninguna tabla.** Esta aplicación no tiene
superficie pública. Cada tabla se revoca explícitamente para `anon`, y también
el `EXECUTE` de las funciones, que Postgres concede a `PUBLIC` por defecto.

**El bucket de fotos es privado.** Una foto de inventario muestra qué hay y
cuánto hay en una bodega. Se sirve con URL firmada de cinco minutos desde el
servidor.

**El prefijo de una categoría no se edita.** Los SKU ya emitidos no se
renumeran, así que cambiarlo dejaría productos `HER-0001` en una categoría con
prefijo `ELE`.

**El estado nunca se comunica solo por color.** Cada insignia lleva además la
palabra. El color es lo primero que se pierde con daltonismo o con una pantalla
vista a contraluz en una bodega.

---

## Estructura

```
src/lib/vision.ts        El análisis de la foto. El corazón de la herramienta.
src/lib/auth.ts          Sesión y rol. La autorización real, junto con RLS.
src/lib/datos/           Lecturas. Devuelven dato y error por separado.
src/app/panel/           Inventario, alta con foto, categorías, usuarios.
supabase/migrations/     El esquema. Se aplica con scripts/aplica-migraciones.mjs.
scripts/                 Transporte SQL y verificaciones.
```

## Roles

| Rol | Puede |
|---|---|
| Lector | Ver el inventario y las fichas. Nada más. |
| Operador | Además: cargar fotos, dar de alta, editar productos, registrar movimientos. |
| Administrador | Además: categorías, usuarios y borrar. |

El sistema no deja que quede sin ningún administrador activo. La comprobación
está en la acción y, como barrera real, en un trigger de la base.
