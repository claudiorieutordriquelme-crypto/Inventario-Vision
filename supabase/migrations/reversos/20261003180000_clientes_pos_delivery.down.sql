-- Reverso de 20261003180000_clientes_pos_delivery.sql
--
-- Se corre a mano con scripts/sql-remoto.mjs. No lo aplica ningun script.
--
-- LEE ESTO ANTES DE CORRERLO. Se pierde TODA la operacion comercial: clientes
-- con sus direcciones, ventas con sus items, despachos, cajas y el contenido
-- de cada caja. No queda nada de eso en ninguna otra tabla.
--
-- LO QUE NO SE PIERDE, y es lo que importa para el inventario: los
-- movimientos. Cada venta confirmada escribio una salida en
-- movimientos_inventario, y esas filas NO las toca este reverso: el libro es
-- de solo agregar y la cantidad de cada producto sigue siendo la suma de su
-- libro. O sea, el stock queda correcto despues de revertir, pero sin ninguna
-- venta que explique las salidas. El motivo de cada movimiento conserva el
-- folio ("Venta V-00012"), que es la unica huella que va a quedar.
--
-- Si se va a revertir en serio, saca antes el detalle:
--   select v.folio, v.confirmada_at, v.total_clp, i.sku, i.cantidad, i.precio_unitario_clp
--   from public.ventas v join public.venta_items i on i.venta_id = v.id
--   order by v.confirmada_at;

begin;

drop function if exists public.confirmar_venta(uuid, public.medio_pago, public.tipo_comprobante, text);
drop function if exists public.anular_venta(uuid, text);

drop trigger if exists caja_items_no_excede on public.caja_items;
drop function if exists public.tg_caja_items_no_excede();

drop trigger if exists venta_items_pieza_unica on public.venta_items;
drop function if exists public.tg_pieza_unica_una_venta();

drop trigger if exists venta_items_solo_en_borrador on public.venta_items;
drop function if exists public.tg_venta_cerrada_no_se_edita();

drop trigger if exists venta_items_recalcula_total on public.venta_items;
drop function if exists public.tg_recalcula_total_venta();

drop trigger if exists despachos_asigna_folio on public.despachos;
drop function if exists public.tg_asigna_folio_despacho();

drop trigger if exists ventas_asigna_folio on public.ventas;
drop function if exists public.tg_asigna_folio_venta();

/* De las hojas hacia la raiz: cada tabla despues de la que la referencia. */
drop table if exists public.caja_items;
drop table if exists public.cajas;
drop table if exists public.despacho_ventas;
drop table if exists public.despachos;
drop table if exists public.venta_items;
drop table if exists public.ventas;
drop table if exists public.cliente_direcciones;
drop table if exists public.clientes;

drop function if exists public.siguiente_folio(text);
drop table if exists public.correlativos_folio;

drop type if exists public.estado_despacho;
drop type if exists public.tipo_comprobante;
drop type if exists public.medio_pago;
drop type if exists public.estado_venta;
drop type if exists public.tipo_entrega;
drop type if exists public.canal_venta;

commit;
