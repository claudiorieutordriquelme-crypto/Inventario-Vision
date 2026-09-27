-- 20260927130000_operador_borra_productos.sql
-- El rol operador pasa a poder borrar productos.
--
-- QUÉ CAMBIA. Hasta acá borrar un producto era exclusivo de administrador
-- (política productos_delete_admin, con es_admin()). Ahora también lo puede
-- hacer un operador, que es el rol que carga las fotos y corrige las fichas.
--
-- POR QUÉ TIENE SENTIDO. Un operador ya podía editar cualquier campo de
-- cualquier producto, archivarlo y registrar movimientos. Reservarle el
-- borrado no protegía nada: quien puede dejar una ficha irreconocible y
-- archivarla no está a un paso de poder destruirla, está en el mismo lugar.
--
-- ── LO QUE HAY QUE TENER PRESENTE, Y NO ES MENOR ───────────────────────────
--
-- La cuenta de demostración es un OPERADOR y su contraseña se imprime en la
-- pantalla de login. Con este cambio, cualquiera que abra el enlace puede
-- borrar el inventario completo, y desde la migración 20260927120000 el
-- borrado arrastra el historial de movimientos: no hay nada que recuperar.
--
-- Se aplica igual porque es una decisión explícita del dueño del producto. Lo
-- que sí corresponde dejar escrito es cómo se cierra en un solo paso, sin
-- desplegar nada, el día que la demostración deje de mostrarse:
--
--   update public.acceso_demo set habilitado = false;
--
-- Y cómo se revierte solo este permiso, si se decide volver atrás:
--
--   drop policy productos_delete_operador on public.productos;
--   create policy productos_delete_admin on public.productos
--     as permissive for delete to authenticated using (public.es_admin());
--
-- ── LO QUE NO CAMBIA ───────────────────────────────────────────────────────
--
-- Categorías, usuarios y la configuración de la demostración siguen siendo
-- exclusivas de administrador. Esto abre el borrado de PRODUCTOS y nada más.
-- El libro de movimientos sigue sin política de borrado: un movimiento suelto
-- no se borra, solo se va en cascada con su producto.

drop policy if exists productos_delete_admin on public.productos;

create policy productos_delete_operador on public.productos
  as permissive for delete to authenticated
  using (public.puede_operar());
