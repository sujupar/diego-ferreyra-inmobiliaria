-- Columna para el archivo de VIDEO subido a Storage de la propiedad.
-- `video_url` se mantiene para enlaces externos que consumen los portales
-- (esperan algo tipo YouTube). `video_file_url` guarda la URL pública del
-- archivo subido a Storage, que se reproduce embebido con <video>.
alter table public.properties
  add column if not exists video_file_url text;
