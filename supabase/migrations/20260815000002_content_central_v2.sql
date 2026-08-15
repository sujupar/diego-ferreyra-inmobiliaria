-- =============================================================================
-- Central de Contenido v2 — feedback del 15/8 tras el primer uso real:
-- 1) El volumen no puede estar limitado a 2 videos por día: el check de slot
--    pasa de ('a','b') a cualquier marca corta — el orden del día es alfabético.
-- 2) Cada pieza puede vincular su FORMATO DE GRABACIÓN (content_formats) por FK,
--    para que la ficha muestre las referencias de ese formato. El campo de texto
--    `formato` queda como etiqueta legacy.
-- IDEMPOTENTE.
-- =============================================================================

alter table public.content_pieces drop constraint if exists content_pieces_slot_check;
do $$ begin
  alter table public.content_pieces
    add constraint content_pieces_slot_check check (char_length(slot) between 1 and 2);
exception when duplicate_object then null; end $$;

alter table public.content_pieces
  add column if not exists formato_id uuid references public.content_formats(id) on delete set null;
