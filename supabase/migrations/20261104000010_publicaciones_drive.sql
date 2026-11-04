-- Carga desde Google Drive: el servidor copia el video a Storage por partes con la
-- subida reanudable de Supabase. Se guarda la dirección de esa subida para retomarla
-- en el pedido siguiente, y cuánto se copió para mostrar el porcentaje.
-- (Lo que de verdad se copió se le pregunta a Storage: esta cuenta es solo para la pantalla.)
ALTER TABLE public.publicacion_videos ADD COLUMN IF NOT EXISTS drive_subida_url text NULL;
ALTER TABLE public.publicacion_videos ADD COLUMN IF NOT EXISTS drive_copiado_bytes bigint NOT NULL DEFAULT 0;
-- Un video de Drive siempre sabe de qué archivo viene.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publicacion_videos_drive_id_check') THEN
    ALTER TABLE public.publicacion_videos
      ADD CONSTRAINT publicacion_videos_drive_id_check CHECK (origen <> 'drive' OR drive_file_id IS NOT NULL);
  END IF;
END $$;
