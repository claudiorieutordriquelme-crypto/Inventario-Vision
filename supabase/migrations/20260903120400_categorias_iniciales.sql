-- 20260903120400_categorias_iniciales.sql
-- Categorias de arranque.
--
-- Existen para que el analisis de la primera foto tenga contra que clasificar.
-- El modelo NO inventa categorias: elige una de esta lista o dice que no supo,
-- y ahi el producto queda en borrador sin categoria para que una persona
-- decida. Eso es deliberado: un clasificador que inventa etiquetas produce
-- cuarenta categorias con un producto cada una, y el inventario deja de poder
-- agruparse.
--
-- Son editables desde la pantalla de administracion: agregar, renombrar,
-- desactivar. El prefijo de una categoria que ya tiene productos conviene no
-- tocarlo, porque los SKU ya emitidos no se renumeran.

insert into public.categorias (codigo, nombre, prefijo_sku, descripcion, orden) values
  ('herramientas',   'Herramientas',            'HER', 'Manuales y eléctricas: taladros, llaves, sierras, destornilladores.', 10),
  ('electronica',    'Electrónica',             'ELE', 'Equipos y componentes electrónicos, cables, cargadores, baterías.', 20),
  ('computacion',    'Computación',             'COM', 'Computadores, periféricos, monitores, redes.', 30),
  ('oficina',        'Oficina y papelería',     'OFI', 'Insumos de escritorio, papelería, archivadores.', 40),
  ('mobiliario',     'Mobiliario',              'MOB', 'Escritorios, sillas, estanterías, muebles.', 50),
  ('seguridad',      'Seguridad y EPP',         'SEG', 'Elementos de protección personal, señalética, extintores.', 60),
  ('aseo',           'Aseo y mantención',       'ASE', 'Productos de limpieza, insumos de mantención.', 70),
  ('construccion',   'Construcción',            'CON', 'Materiales de obra, fijaciones, adhesivos, pinturas.', 80),
  ('repuestos',      'Repuestos y consumibles', 'REP', 'Piezas de recambio, filtros, correas, consumibles.', 90),
  ('vehiculos',      'Vehículos y accesorios',  'VEH', 'Accesorios vehiculares, neumáticos, lubricantes.', 100),
  ('otros',          'Otros',                   'OTR', 'Lo que no cae en ninguna de las anteriores.', 999)
on conflict (codigo) do nothing;
