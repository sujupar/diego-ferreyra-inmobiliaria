-- Índice de procesos (deals) por propiedad (2026-09-19).
--
-- La ficha de cada propiedad busca la visita del proceso vinculado
-- (`deals.property_id`) para no volver a preguntar lo que se contestó en la
-- visita, y otras pantallas buscan el proceso de una propiedad por la misma
-- columna. No tenía índice: con 892 procesos no se nota, con miles cada ficha
-- recorría la tabla entera. Parcial porque la mayoría de los procesos todavía
-- no tiene propiedad (tasaciones que no se captaron).
-- Aditivo: no cambia datos ni comportamiento.

CREATE INDEX IF NOT EXISTS idx_deals_property_id
  ON public.deals (property_id)
  WHERE property_id IS NOT NULL;
