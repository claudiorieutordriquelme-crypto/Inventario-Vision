-- Reverso de 20261003140000_presupuesto_api.sql
--
-- Se corre a mano con scripts/sql-remoto.mjs. No lo aplica ningun script.
--
-- QUE SE PIERDE: el monto del presupuesto configurado. Nada mas: el consumo
-- vive en analisis_imagen, que esta migracion nunca toco.

begin;

drop function if exists public.consumo_api_mes();

drop trigger if exists presupuesto_api_set_updated_at on public.presupuesto_api;

drop table if exists public.presupuesto_api;

commit;
