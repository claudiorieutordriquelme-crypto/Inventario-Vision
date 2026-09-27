-- 20260927120000_borrado_arrastra_movimientos.sql
-- Borrar un producto ahora se lleva su libro de movimientos.
--
-- QUÉ CAMBIA Y POR QUÉ. La llave de movimientos_inventario hacia productos era
-- RESTRICT: un producto con aunque fuera un movimiento no se podía borrar por
-- ningún camino. La intención era proteger el historial, y como el alta por
-- foto deja un conteo inicial, en la práctica dejaba 8 de 9 productos
-- imposibles de borrar. La función existía y no se podía usar.
--
-- Decisión del dueño del producto, tomada con las alternativas a la vista: se
-- prefiere poder borrar, y que el historial se vaya con el producto, antes que
-- conservar un libro que ya no describe nada que exista.
--
-- LO QUE SE PIERDE, DICHO SIN ADORNOS. Un producto borrado no deja NINGUNA
-- huella: ni el SKU, ni cuántas unidades tuvo, ni quién lo cargó, ni que
-- existió. Si alguna vez hay que responder "¿qué pasó con el producto tal?",
-- la respuesta va a ser que no hay forma de saberlo. Se evaluó una bitácora de
-- borrados que conservara esa constancia y se descartó a propósito.
--
-- LO QUE NO CAMBIA. El libro sigue siendo de solo agregar para las personas:
-- no hay política RLS que permita borrar ni editar un movimiento suelto, y no
-- se agrega ninguna acá. La cantidad de un producto sigue siendo la suma de su
-- libro y sigue sin poder escribirse a mano. Lo único que cambia es que al
-- desaparecer el producto, desaparecen sus filas.
--
-- POR QUÉ CASCADE EN LA LLAVE Y NO UN BORRADO EN DOS PASOS DESDE EL CÓDIGO.
-- Dos pasos desde la aplicación pueden fallar a la mitad y dejar un libro
-- huérfano o un producto sin poder borrarse. La cascada la ejecuta la base en
-- la misma transacción: o se van los dos, o no se va ninguno.
--
-- CÓMO SE REVIERTE, si algún día se decide volver atrás: se vuelve a poner
-- RESTRICT con este mismo ALTER. Lo que no se revierte son los movimientos que
-- se hayan borrado mientras tanto.

alter table public.movimientos_inventario
  drop constraint movimientos_inventario_producto_id_fkey;

alter table public.movimientos_inventario
  add constraint movimientos_inventario_producto_id_fkey
    foreign key (producto_id)
    references public.productos(id)
    on delete cascade;
