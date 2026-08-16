-- La clave canónica del teléfono de un contacto: sus últimos 10 dígitos.
--
-- El mismo número vive en la base en tres formatos ('+5491149372737',
-- '+541149372737', '1149372737') y la igualdad exacta entre ellos es imposible
-- por el "9" argentino. Costó un cliente real (2026-08-15): respondió a la
-- plantilla de tasación y el agente no encontró su trato porque el contacto
-- estaba guardado sin el 9. El matcheo exacto además venía creando contactos
-- DUPLICADOS (verificado: Ada, Susana, Eduardo... cada una dos veces).
--
-- Columna GENERADA: se mantiene sola en cada INSERT/UPDATE, nadie tiene que
-- acordarse. Con índice: buscar un contacto por teléfono es O(log n) sin
-- importar cuántos registros por día entren.
--
-- La MISMA regla vive en TypeScript (`lib/phone/ultimos-digitos.ts`).
-- Si se cambia una, cambiar la otra.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_norm TEXT GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
      THEN right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
      ELSE NULL
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_norm
  ON public.contacts (phone_norm) WHERE phone_norm IS NOT NULL;

COMMENT ON COLUMN public.contacts.phone_norm IS
  'Últimos 10 dígitos del teléfono (área+número). Clave de matcheo entre '
  'formatos (+549/+54/pelado). Espejo SQL de lib/phone/ultimos-digitos.ts.';
