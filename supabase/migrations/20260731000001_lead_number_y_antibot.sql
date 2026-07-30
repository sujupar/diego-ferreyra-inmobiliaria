-- Número de comprador + marca de bot. 100% ADITIVA: no borra ni cambia datos.

-- 1. Número visible de comprador (#1000, #1001...). Sirve para referirse a una
--    persona sin depender del nombre, y para mandarle cosas después.
CREATE SEQUENCE IF NOT EXISTS property_leads_number_seq START 1000;
ALTER TABLE property_leads
  ADD COLUMN IF NOT EXISTS lead_number BIGINT DEFAULT nextval('property_leads_number_seq');

-- Numera los que ya existen, por orden de llegada. No toca ninguna otra columna.
UPDATE property_leads SET lead_number = nextval('property_leads_number_seq')
  WHERE lead_number IS NULL;

ALTER TABLE property_leads ALTER COLUMN lead_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS property_leads_number_key ON property_leads (lead_number);
COMMENT ON COLUMN property_leads.lead_number IS 'Número de comprador visible para el equipo (#1000, #1001...). Se asigna solo y nunca se reusa.';

-- 2. Marca de registro sospechoso de bot. NUNCA se descarta un lead: se marca,
--    se puede filtrar, y el equipo decide. Perder un lead real es mucho peor que
--    guardar uno falso.
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS suspected_bot BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS bot_reason TEXT;
COMMENT ON COLUMN property_leads.suspected_bot IS 'true = el registro tiene señales de automatización (sin ficha de sesión válida, o datos de relleno conocidos). Se guarda igual.';
COMMENT ON COLUMN property_leads.bot_reason IS 'Por qué se marcó como sospechoso. Texto libre para poder auditarlo después.';
