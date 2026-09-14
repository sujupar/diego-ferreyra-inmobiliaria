-- Datos de difusión cargados en la VISITA de tasación y heredados al captar.
--
-- portal_data:     { ml: {ATRIBUTO: {value_id?|value_name?}}, ap: {...} } — lo que
--                  piden MercadoLibre/Argenprop y no se deriva de las columnas.
--                  Los wizards lo mezclan como prefill (derivado < portal_data < borrador).
-- landing_answers: { q1..q4: texto } — respuestas fijas de la landing; con las
--                  cuatro, la landing se crea y publica sola (autopilot).
--
-- Aditiva, con default: el código viejo no la toca y el nuevo la lee siempre.
-- Heredan la RLS de `properties`. Ver spec 2026-09-14-datos-difusion-en-visita.
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS portal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS landing_answers jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.properties.portal_data IS
  'Atributos para portales cargados en la visita: { ml: {...}, ap: {...} }. Prefill de los wizards de ML/Argenprop.';
COMMENT ON COLUMN public.properties.landing_answers IS
  'Respuestas fijas (q1..q4) de la landing cargadas en la visita. Con las cuatro, la landing se publica sola.';

-- Vista del listado: NO incluye estas columnas a propósito (son JSON pesado
-- que el listado no muestra). Se leen con select * en la ficha y los wizards.
