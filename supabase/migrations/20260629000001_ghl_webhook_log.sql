-- Log auditable de CADA recepción del webhook de GHL (/api/webhooks/ghl/form-submission).
-- Motivo: hoy un fallo del webhook (auth/payload/error) solo deja console.warn → es
-- INVISIBLE y se puede perder un lead sin que nadie se entere (caso Serfaty). Con esta
-- tabla, cada recepción queda registrada con su resultado y se puede recuperar el lead.
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta).

CREATE TABLE IF NOT EXISTS public.ghl_webhook_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at  timestamptz NOT NULL DEFAULT now(),
  status       text NOT NULL,            -- 'created' | 'ignored' | 'invalid' | 'auth_failed' | 'error'
  form_name    text,
  form_id      text,
  lead_name    text,
  lead_email   text,
  lead_phone   text,
  deal_id      uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  error_message text,
  raw_payload  jsonb
);

CREATE INDEX IF NOT EXISTS ghl_webhook_log_received_at_idx ON public.ghl_webhook_log (received_at DESC);
CREATE INDEX IF NOT EXISTS ghl_webhook_log_status_idx ON public.ghl_webhook_log (status);

ALTER TABLE public.ghl_webhook_log ENABLE ROW LEVEL SECURITY;

-- SELECT: solo operaciones (admin/dueno/coordinador). El INSERT lo hace la ruta con
-- service_role (BYPASSEA RLS) → NO se agrega política INSERT (la tabla guarda PII de
-- leads: email/teléfono → no dejarla legible por asesor/abogado).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ghl_webhook_log'
      AND policyname = 'ghl_webhook_log_select_ops'
  ) THEN
    CREATE POLICY ghl_webhook_log_select_ops ON public.ghl_webhook_log
      FOR SELECT TO authenticated
      USING (public.is_operations_user());
  END IF;
END $$;
