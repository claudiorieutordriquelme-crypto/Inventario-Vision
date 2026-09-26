-- 20260903120600_cierra_anon.sql
-- Cierra de verdad la ejecución de funciones para el rol anónimo.
--
-- POR QUE HIZO FALTA ESTA MIGRACION. La anterior hacía:
--
--   revoke execute on all functions in schema public from public;
--
-- y eso NO alcanzó. La verificación del esquema contra la base real lo
-- detectó: anon seguía pudiendo ejecutar las nueve funciones, incluida
-- siguiente_sku, que mueve un correlativo, y tg_exige_admin_activo.
--
-- La razón es que el permiso llegaba por DOS caminos distintos y revocar uno
-- no toca el otro:
--   1. El grant implícito a PUBLIC que Postgres pone en cada función nueva.
--      Ese sí lo quitaba el revoke de arriba.
--   2. Un grant DIRECTO a anon que Supabase configura por defecto en el
--      proyecto. Ese sobrevivía intacto.
--
-- De ahí la lección, que vale para cualquier proyecto Supabase: revocar de
-- PUBLIC y revocar de anon son dos operaciones distintas y hay que hacer las
-- dos. Comprobarlo con has_function_privilege() es la única forma de saber que
-- quedó cerrado; leer el SQL no basta, porque el SQL se ve correcto.

-- Lo que existe hoy.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;

-- Y lo que se cree de aquí en adelante, para no tener que acordarse cada vez.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

/*
  Se vuelve a conceder a quien de verdad lo necesita. authenticated no es
  opcional: las políticas RLS llaman a mi_rol(), puede_leer(), puede_operar() y
  es_admin() en nombre de quien consulta, así que sin EXECUTE ninguna política
  podría evaluarse y toda la aplicación dejaría de leer.
*/
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant execute on functions to authenticated;
alter default privileges in schema public grant execute on functions to service_role;
