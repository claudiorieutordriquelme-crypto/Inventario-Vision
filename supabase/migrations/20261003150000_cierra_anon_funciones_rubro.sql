-- 20261003150000_cierra_anon_funciones_rubro.sql
-- Cierra para anon las tres funciones que agrego la migracion de categorias
-- del rubro.
--
-- POR QUE HIZO FALTA, otra vez. La migracion 20261003130000 creo
-- categoria_es_pieza_unica, tg_categoria_un_solo_nivel y tg_pieza_unica_tope
-- sin revocarlas explicitamente, confiando en el
--
--   alter default privileges in schema public revoke execute on functions from anon;
--
-- que dejo puesto 20260903120600_cierra_anon.sql. NO ALCANZO: los default
-- privileges solo rigen para los objetos que crea el MISMO rol que los
-- declaro, y la Management API aplica las migraciones con otro rol. El grant
-- directo que Supabase pone en cada funcion nueva sobrevivio intacto.
--
-- Lo detecto scripts/verifica-esquema.mjs, que es justamente la razon por la
-- que ese script existe: leer el SQL no basta, porque el SQL se veia correcto.
--
-- LA REGLA QUE QUEDA, y que vale para toda migracion futura de este proyecto:
-- cada funcion nueva se revoca de public Y de anon en su propia migracion. Las
-- dos revocaciones, siempre, aunque los default privileges esten puestos.
--
-- NOTA SOBRE credenciales_demo: el verificador tambien la lista, y ahi el
-- grant a anon es DELIBERADO; lo pone 20260903120800_acceso_demo.sql para que
-- la pantalla de login pueda mostrar la cuenta de demostracion sin sesion. Es
-- la unica excepcion del esquema y no se toca aca.

revoke execute on function public.categoria_es_pieza_unica(uuid) from public, anon;
revoke execute on function public.tg_categoria_un_solo_nivel()   from public, anon;
revoke execute on function public.tg_pieza_unica_tope()          from public, anon;

/*
  authenticated SI necesita categoria_es_pieza_unica: la llama el trigger en
  nombre de quien escribe, y sin EXECUTE cualquier alta de producto fallaria.

  Las dos tg_ no se conceden a nadie. Un trigger lo invoca el motor con los
  permisos de su dueño, no quien dispara la sentencia: nadie necesita poder
  llamarlas a mano, y poder hacerlo solo sirve para ejecutarlas fuera de su
  contexto.
*/
grant execute on function public.categoria_es_pieza_unica(uuid) to authenticated;
