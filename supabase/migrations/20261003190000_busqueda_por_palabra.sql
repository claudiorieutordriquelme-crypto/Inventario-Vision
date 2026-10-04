-- 20261003190000_busqueda_por_palabra.sql
-- Corrige la busqueda tolerante: comparaba la frase completa y no encontraba
-- nada en nombres largos.
--
-- EL DEFECTO, MEDIDO CONTRA LOS DATOS REALES. buscar_productos() usaba el
-- operador % de pg_trgm, que compara la similitud de la CADENA COMPLETA. Con
-- los nombres que escribe el modelo, que son largos y descriptivos, eso da:
--
--   'Figura de porcelana dama con vestido largo'  vs 'porcelna' -> 0,159
--   'Figuras de porcelana de niños'               vs 'porcelna' -> 0,241
--
-- y el umbral por defecto de pg_trgm es 0,30. O sea, los dos daban FALSE:
-- buscar "porcelna" no devolvia ninguna de las dos figuras de porcelana. La
-- funcion existia, estaba indexada, y no servia para nada.
--
-- Mientras mas largo y mas descriptivo el nombre, peor: cada palabra adicional
-- diluye la similitud global. Justo al reves de lo que hace falta.
--
-- LA CORRECCION es word_similarity, el operador <%, que mide si la consulta
-- aparece como una palabra DENTRO del texto en vez de parecerse al texto
-- entero. Sobre los mismos datos da 0,667 en los dos casos.
--
-- Baja tambien el umbral de palabra a 0,45. El de pg_trgm por defecto es 0,60,
-- que exige casi acertar la palabra: con 0,45 "porcelna" sigue encontrando
-- "porcelana" y una letra mas de error tambien pasa. Es el valor por conexion,
-- asi que se fija dentro de la funcion, que es el unico lugar donde rige con
-- certeza: ponerlo en la configuracion del rol dependeria de por donde entre
-- cada cliente.
--
-- Los indices GIN que ya existen sirven igual: gin_trgm_ops soporta <%.

create or replace function public.buscar_productos(p_texto text, p_limite integer default 50)
 returns table (id uuid, parecido real)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_texto text := public.normaliza_busqueda(p_texto);
begin
  if not public.puede_leer() then
    return;
  end if;

  /*
    Por conexion y solo mientras dure esta llamada. 0,45 es el punto donde
    "porcelna" encuentra "porcelana" sin que "porta" empiece a traerla tambien.
  */
  set local pg_trgm.word_similarity_threshold = 0.45;

  return query
  select p.id,
         greatest(
           extensions.word_similarity(v_texto, public.normaliza_busqueda(p.nombre)),
           /*
             La descripcion pesa menos que el nombre. Un termino que aparece en
             la descripcion de cuarenta productos no deberia ganarle al unico
             que lo lleva en el nombre.
           */
           extensions.word_similarity(v_texto, public.normaliza_busqueda(coalesce(p.descripcion, ''))) * 0.6,
           /* El SKU se compara por prefijo exacto: quien escribe un SKU lo
              escribe bien, y un parecido difuso ahi solo agrega ruido. */
           case when p.sku ilike p_texto || '%' then 1.0 else 0 end
         )::real as parecido
  from public.productos p
  where v_texto operator(extensions.<%) public.normaliza_busqueda(p.nombre)
     or v_texto operator(extensions.<%) public.normaliza_busqueda(coalesce(p.descripcion, ''))
     or p.sku ilike p_texto || '%'
  order by parecido desc, p.nombre
  limit greatest(1, least(coalesce(p_limite, 50), 200));
end;
$function$;

revoke execute on function public.buscar_productos(text, integer) from public, anon;
grant execute on function public.buscar_productos(text, integer) to authenticated;

/*
  Indices para el operador <%. Los que existian estan declarados con
  gin_trgm_ops, que soporta tanto % como <%, asi que no hace falta crear
  ninguno nuevo: queda anotado aca para que nadie los borre creyendo que
  quedaron sin uso despues de este cambio.
*/
