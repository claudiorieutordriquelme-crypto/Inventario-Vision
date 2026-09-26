-- 20260903120300_storage.sql
-- Bucket privado para las fotos del inventario.
--
-- PRIVADO, no publico. Una foto de inventario muestra que hay y cuanto hay en
-- una bodega, y eso no se publica en una URL adivinable. Se sirve con URL
-- firmada de vida corta desde el servidor.
--
-- Se sube con la SESION de quien opera, nunca con service_role. Las politicas
-- de abajo permiten a authenticated insertar con puede_operar() y leer con
-- puede_leer(), asi que la aplicacion nunca necesita una clave que se salte
-- RLS. Esa clave no existe en este proyecto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fotos',
  'fotos',
  false,
  10485760,  -- 10 MB. Una foto de telefono comprimida entra de sobra.
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

/*
  Las politicas van sobre storage.objects y se acotan al bucket por bucket_id.
  Sin ese filtro, una politica escrita para este bucket abriria todos los demas
  del proyecto.
*/

create policy "fotos leer" on storage.objects
  as permissive for select to authenticated
  using (bucket_id = 'fotos' and public.puede_leer());

create policy "fotos subir" on storage.objects
  as permissive for insert to authenticated
  with check (bucket_id = 'fotos' and public.puede_operar());

create policy "fotos actualizar" on storage.objects
  as permissive for update to authenticated
  using (bucket_id = 'fotos' and public.puede_operar())
  with check (bucket_id = 'fotos' and public.puede_operar());

/*
  Borrar un archivo es de administrador, igual que borrar el producto que lo
  usa. Un operador que se equivoca de foto sube otra; el archivo viejo lo
  limpia quien administra.
*/
create policy "fotos borrar" on storage.objects
  as permissive for delete to authenticated
  using (bucket_id = 'fotos' and public.es_admin());
