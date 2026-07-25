-- E1.6 Editor de landing — columna de borrador.
-- El editor edita draft_content; "Publicar cambios" promueve draft_content -> content.
-- La página pública sigue leyendo content (status='published'), así editar NO afecta
-- lo que está en vivo hasta publicar. Aditiva y nullable: NULL = sin cambios sin publicar.
ALTER TABLE public.property_landings
  ADD COLUMN IF NOT EXISTS draft_content jsonb;

COMMENT ON COLUMN public.property_landings.draft_content IS
  'Borrador de edición (E1.6). NULL = sin cambios sin publicar. Publicar promueve draft_content -> content y lo limpia.';
