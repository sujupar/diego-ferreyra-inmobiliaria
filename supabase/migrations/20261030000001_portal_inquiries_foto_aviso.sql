-- La foto principal del aviso, sacada del mail del portal al recibir la consulta.
-- La muestra la hoja "Avisos sin propiedad" para reconocer el aviso de un vistazo
-- (spec 2026-10-30-conectar-avisos). Viene de un mail de terceros: solo https, y el
-- código además exige el host exacto del portal antes de guardarla.
ALTER TABLE public.portal_inquiries
  ADD COLUMN IF NOT EXISTS property_photo_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'portal_inquiries_property_photo_url_https'
  ) THEN
    ALTER TABLE public.portal_inquiries
      ADD CONSTRAINT portal_inquiries_property_photo_url_https
      CHECK (property_photo_url IS NULL OR property_photo_url ~ '^https://');
  END IF;
END $$;

COMMENT ON COLUMN public.portal_inquiries.property_photo_url IS
  'Foto principal del aviso, del mail del portal (imgar.zonapropcdn.com / www.argenprop.com/static-content). Solo https.';
