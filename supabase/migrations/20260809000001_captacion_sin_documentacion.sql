-- ============================================================================
-- Captación sin documentación obligatoria — 2026-08-09
--
-- GATE DE DEPLOY: esta migración va ANTES del deploy del código que la usa.
-- El avance de captación escribe `captured_at` y la bandeja del abogado lee
-- `legal_submitted_at`. Sin las columnas, confirmar una subida de fotos
-- (POST /api/properties/[id]/media/commit) devuelve 500.
--
-- Es ADITIVA: dos columnas nuevas, ningún CHECK tocado, ninguna fila borrada.
-- ============================================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS legal_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS captured_at        TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- legal_submitted_at — el circuito legal deja de vivir en `properties.status`.
--
-- Antes, "mandársela al abogado" era escribir status='pending_review', y eso
-- apagaba de golpe la pestaña Difusión, la landing pública (filtra por
-- status='approved'), las consultas entrantes y el agendamiento del recorrido.
-- Con la documentación ya no obligatoria, una propiedad puede estar PUBLICADA
-- y a la vez con los papeles en revisión: son dos ejes, y necesitan dos
-- columnas.
--
-- La bandeja del abogado es ahora:
--     legal_status = 'pending' AND legal_submitted_at IS NOT NULL
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.properties.legal_submitted_at IS
  'Cuándo se envió la documentación al abogado. NULL = nunca se envió. Junto con legal_status arma el carril legal, INDEPENDIENTE de properties.status (captación).';

-- ---------------------------------------------------------------------------
-- captured_at — marca de "esta propiedad ya se anunció como captada".
--
-- Los mails N8A/N8B salen al pasar a `approved`. Con la regla nueva entrar y
-- salir de ese estado es mucho más fácil (restaurar una descartada la deja en
-- 'draft', y la primera foto la vuelve a captar), así que hacía falta una marca
-- PERSISTIDA. La idempotencia por email_notifications_log nunca frenó nada:
-- esa tabla no tiene una sola fila de 'property_captured'.
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.properties.captured_at IS
  'Primera vez que la propiedad se dio por captada. Se reclama de forma atómica (UPDATE ... WHERE captured_at IS NULL) para que los emails N8A/N8B salgan UNA sola vez.';

-- ---------------------------------------------------------------------------
-- Backfill 1 — histórico de envíos al abogado.
-- Toda propiedad cuya revisión ya terminó (o que está esperando al abogado con
-- el esquema viejo) fue enviada alguna vez. Sin efecto sobre la bandeja: las
-- que tienen legal_status distinto de 'pending' no entran en el filtro.
-- ---------------------------------------------------------------------------
UPDATE public.properties
SET legal_submitted_at = COALESCE(legal_reviewed_at, updated_at, created_at)
WHERE legal_submitted_at IS NULL
  AND (status = 'pending_review' OR legal_status IN ('approved', 'rejected'));

-- ---------------------------------------------------------------------------
-- Backfill 2 — todo lo que YA cumplió la condición vieja de captación
-- (fotos + legal aprobado, o directamente status='approved') queda marcado,
-- así ninguna propiedad existente vuelve a disparar "nueva captación".
-- Incluye las descartadas que en su momento estuvieron captadas: restaurarlas
-- y subirles una foto las re-capta, y sin esto mandarían el mail de nuevo.
-- ---------------------------------------------------------------------------
UPDATE public.properties
SET captured_at = COALESCE(legal_reviewed_at, updated_at, created_at)
WHERE captured_at IS NULL
  AND (
    status = 'approved'
    OR (legal_status = 'approved' AND COALESCE(array_length(photos, 1), 0) > 0)
  );

-- ---------------------------------------------------------------------------
-- Backfill 3 — las que la regla NUEVA capta y la vieja no captaba.
--
-- Hoy hay una sola: Roque Pérez 3059 (creada el 29/5, 1 foto, trabada en
-- pending_docs porque nunca pasó por el abogado). Con la regla nueva califica
-- como captada, y sin esta marca el primer toque le dispararía a todo el equipo
-- un mail de "¡nueva captación!" por una propiedad de hace dos meses y medio,
-- que además ya se está publicitando.
--
-- No la deja trabada: `checkAndAdvanceProperty` falla el reclamo atómico
-- (`WHERE captured_at IS NULL`) y cae a la rama de recaptura, que igual la pone
-- en 'approved' — solo se saltea el anuncio. La captación se fecha cuando
-- realmente ocurrió, no hoy.
-- ---------------------------------------------------------------------------
UPDATE public.properties
SET captured_at = COALESCE(updated_at, created_at)
WHERE captured_at IS NULL
  AND status NOT IN ('approved', 'descartada')
  AND COALESCE(array_length(photos, 1), 0) > 0;

-- La bandeja del abogado consulta exactamente por este predicado.
CREATE INDEX IF NOT EXISTS idx_properties_revision_legal_pendiente
  ON public.properties (legal_submitted_at)
  WHERE legal_status = 'pending' AND legal_submitted_at IS NOT NULL;
