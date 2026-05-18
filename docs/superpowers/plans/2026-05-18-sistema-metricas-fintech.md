# Sistema de Métricas Fintech-Grade — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir un sistema de métricas del embudo completo (publicidad → landing → registro → solicitud → agenda → visita → entrega → captación) con dashboard interactivo + reportes automáticos por email en formato tabla tipo Excel (diario/semanal/mensual), y corregir el bug que dispara email de "solicitud de tasación" cuando alguien se registra a clase gratuita.

**Architecture:** Capa de datos: añadir fechas granulares por transición de stage en `deals` + tabla de historia `deal_stage_history`. Capa de agregación: vistas SQL + funciones RPC que respondan al rango de fechas. Capa de presentación: dashboard rebuild con funnel chart + tablas comparativas (período actual vs anterior). Capa de notificación: templates de email diferenciados por origen + reportes scheduled con HTML que renderice como tabla densa estilo planilla.

**Tech Stack:** Next.js 16 + React 19 + Supabase Postgres + Resend + Netlify scheduled functions + recharts (nueva dependencia para visualización) + Meta Marketing API v21 + GHL polling existente.

---

## Alcance y división en fases

Este plan toca múltiples subsistemas independientes. Cada fase produce software funcional por sí misma y es merge-able por separado:

- **Fase 1 — Bug fix emails diferenciados por origen** (1 PR pequeño, urgente)
- **Fase 2 — Schema: fechas granulares + historia de stages** (1 PR, base para todo lo demás)
- **Fase 3 — Capa de agregación SQL (vistas + RPCs del embudo)** (1 PR)
- **Fase 4 — API endpoints del dashboard de métricas** (1 PR)
- **Fase 5 — Dashboard UI rebuild (funnel + comparativas)** (1 PR, el más visible)
- **Fase 6 — Reportes email formato tabla Excel** (1 PR)
- **Fase 7 — Tracking de landing page views por campaña** (1 PR)
- **Fase 8 — QA end-to-end y dogfooding** (no genera código, solo validación)

Recomiendo ejecutarlas en orden. Las fases 1 y 2 son prerequisito de todas las demás.

---

## File Structure — qué se crea/modifica

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `emails/DealCreatedAdminsEmail.tsx` | Modify | Heading condicional por `origin` |
| `emails/ClassRegistrationAdminsEmail.tsx` | Create | Template específico para clase gratuita |
| `lib/email/notifications/deal-created.ts` | Modify | Branch por `origin` → notif distinta |
| `lib/email/notifications/class-registration.ts` | Create | Notif dedicada para clase gratuita |
| `supabase/migrations/20260518000001_deals_stage_dates.sql` | Create | Columnas `scheduled_at`, `visited_at`, `delivered_at`, `captured_at` |
| `supabase/migrations/20260518000002_deal_stage_history.sql` | Create | Tabla + trigger de historia |
| `supabase/migrations/20260518000003_metrics_views.sql` | Create | Vistas SQL del embudo |
| `supabase/migrations/20260518000004_metrics_rpcs.sql` | Create | Funciones RPC para queries con rango |
| `supabase/migrations/20260518000005_landing_page_visits.sql` | Create | Tabla para landing views por campaña |
| `lib/metrics/funnel.ts` | Create | Cliente SQL del embudo (tipos + fetch) |
| `lib/metrics/comparison.ts` | Create | Lógica de período anterior (delta %) |
| `lib/metrics/types.ts` | Create | Tipos compartidos FunnelMetrics, RangeFilter |
| `app/api/metrics/funnel/route.ts` | Create | GET endpoint funnel |
| `app/api/metrics/funnel-by-campaign/route.ts` | Create | GET endpoint por campaña |
| `app/api/metrics/landing/route.ts` | Create | GET endpoint visitas landing |
| `app/(dashboard)/metrics/page.tsx` | Rewrite | Dashboard rediseñado |
| `components/metrics/FunnelChart.tsx` | Create | Visualización del embudo |
| `components/metrics/MetricsTable.tsx` | Create | Tabla comparativa actual vs anterior |
| `components/metrics/CampaignBreakdown.tsx` | Create | Tabla por campaña Meta |
| `components/metrics/DateRangePicker.tsx` | Create | Selector con presets + custom |
| `lib/email/reports/excel-table-builder.ts` | Create | Generador de HTML estilo tabla Excel |
| `lib/email/reports/daily-report.ts` | Modify | Usar excel-table-builder |
| `lib/email/reports/weekly-report.ts` | Modify | Idem + comparativa |
| `lib/email/reports/monthly-report.ts` | Modify | Idem |
| `app/p/[slug]/page.tsx` | Modify | Server-side log de visita por campaña |
| `app/api/landing/track-visit/route.ts` | Create | Endpoint para registrar visita |

Tests:
- `tests/email/notifications/class-registration.test.ts`
- `tests/email/notifications/deal-created.test.ts`
- `tests/metrics/funnel.test.ts`
- `tests/metrics/comparison.test.ts`
- `tests/api/metrics/funnel.test.ts`
- `tests/email/reports/excel-table-builder.test.ts`

---

# FASE 1 — Bug fix: separar email clase gratuita vs solicitud tasación

**Por qué primero:** Es el bug que está contaminando la percepción de "solicitudes de tasación" del admin. Resolverlo de inmediato deja de ensuciar la métrica antes de medirla.

### Task 1.1: Test failing — notificación de clase gratuita

**Files:**
- Create: `tests/email/notifications/class-registration.test.ts`

- [ ] **Step 1: Crear test failing**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyClassRegistration } from '@/lib/email/notifications/class-registration'

vi.mock('resend')
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(),
}))

describe('notifyClassRegistration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('envía email "Nuevo registro a clase gratuita" — NO "Tasación agendada"', async () => {
    const sendMock = vi.fn().mockResolvedValue({ id: 'msg_1' })
    // mock supabase + resend (ver fixtures)
    const result = await notifyClassRegistration({ dealId: 'deal-1' })
    expect(result.subject).toMatch(/clase gratuita/i)
    expect(result.subject).not.toMatch(/tasaci[oó]n agendada/i)
    expect(sendMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- tests/email/notifications/class-registration.test.ts`
Expected: FAIL con "Cannot find module class-registration"

### Task 1.2: Crear template ClassRegistrationAdminsEmail

**Files:**
- Create: `emails/ClassRegistrationAdminsEmail.tsx`

- [ ] **Step 1: Crear el template basado en DealCreatedAdminsEmail pero con copy específico**

```tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'

export interface ClassRegistrationAdminsEmailProps {
  contactName: string
  contactEmail: string
  contactPhone: string
  registeredAt: string
  origin: 'clase_gratuita'
  dealUrl: string
}

export default function ClassRegistrationAdminsEmail(props: ClassRegistrationAdminsEmailProps) {
  const preheader = `${props.contactName} se registró a la clase gratuita`
  return (
    <Html>
      <Head />
      <Preview>{preheader}</Preview>
      <Body style={{ fontFamily: 'Arial, sans-serif', background: '#f6f6f6' }}>
        <Container style={{ background: '#fff', padding: 24, maxWidth: 560 }}>
          <Heading as="h2">Nuevo registro a clase gratuita</Heading>
          <Text>
            <strong>{props.contactName}</strong> se registró a la clase gratuita el {props.registeredAt}.
          </Text>
          <Text>Este registro <strong>no</strong> implica una solicitud de tasación. El equipo debe contactar para evaluar interés.</Text>
          <Section>
            <Text><strong>Email:</strong> {props.contactEmail}</Text>
            <Text><strong>Teléfono:</strong> {props.contactPhone}</Text>
            <Text><a href={props.dealUrl}>Ver en CRM →</a></Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add emails/ClassRegistrationAdminsEmail.tsx tests/email/notifications/class-registration.test.ts
git commit -m "test(email): add failing test + template ClassRegistrationAdminsEmail"
```

### Task 1.3: Crear notifier `notifyClassRegistration`

**Files:**
- Create: `lib/email/notifications/class-registration.ts`

- [ ] **Step 1: Implementar el notifier**

```typescript
import { Resend } from 'resend'
import { render } from '@react-email/render'
import { createServerClient } from '@/lib/supabase/server'
import ClassRegistrationAdminsEmail from '@/emails/ClassRegistrationAdminsEmail'

const resend = new Resend(process.env.RESEND_API_KEY!)

export interface NotifyClassRegistrationParams {
  dealId: string
}

export async function notifyClassRegistration({ dealId }: NotifyClassRegistrationParams) {
  const supabase = await createServerClient()
  const { data: deal, error } = await supabase
    .from('deals')
    .select('id, contact_id, origin, created_at, contacts(full_name, email, phone)')
    .eq('id', dealId)
    .single()
  if (error || !deal) throw new Error(`Deal ${dealId} not found`)
  if (deal.origin !== 'clase_gratuita') {
    throw new Error(`Deal ${dealId} origin is "${deal.origin}", not "clase_gratuita"`)
  }

  const contact = Array.isArray(deal.contacts) ? deal.contacts[0] : deal.contacts
  const recipients = await getAdminRecipients(supabase)
  const subject = `Nuevo registro a clase gratuita: ${contact.full_name}`

  const html = await render(
    ClassRegistrationAdminsEmail({
      contactName: contact.full_name,
      contactEmail: contact.email ?? '—',
      contactPhone: contact.phone ?? '—',
      registeredAt: new Date(deal.created_at).toLocaleString('es-AR'),
      origin: 'clase_gratuita',
      dealUrl: `${process.env.NEXT_PUBLIC_APP_URL}/deals/${dealId}`,
    }),
  )

  const result = await resend.emails.send({
    from: process.env.EMAIL_FROM_DEFAULT!,
    to: recipients,
    replyTo: process.env.EMAIL_REPLY_TO,
    subject,
    html,
  })

  return { subject, messageId: result.data?.id }
}

async function getAdminRecipients(supabase: any): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('email')
    .in('role', ['admin', 'dueno', 'coordinador'])
    .not('email', 'is', null)
  return (data ?? []).map((r: any) => r.email)
}
```

- [ ] **Step 2: Verificar que pasa el test**

Run: `npm test -- tests/email/notifications/class-registration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add lib/email/notifications/class-registration.ts
git commit -m "feat(email): notifyClassRegistration con template propio"
```

### Task 1.4: Branchear el webhook GHL por `origin`

**Files:**
- Modify: `app/api/webhooks/ghl/form-submission/route.ts:181-186`

- [ ] **Step 1: Leer el archivo actual**

Run: `grep -n "notifyDealCreated\|notifyWithEscalation" app/api/webhooks/ghl/form-submission/route.ts`

- [ ] **Step 2: Reemplazar la llamada única por branch por origen**

```typescript
import { notifyDealCreated } from '@/lib/email/notifications/deal-created'
import { notifyClassRegistration } from '@/lib/email/notifications/class-registration'

if (dealOrigin === 'clase_gratuita') {
  await notifyWithEscalation(
    () => notifyClassRegistration({ dealId }),
    { failedNotificationType: 'class_registration', entityType: 'deal', entityId: dealId },
  )
} else {
  await notifyWithEscalation(
    () => notifyDealCreated({ dealId }),
    { failedNotificationType: 'deal_created', entityType: 'deal', entityId: dealId },
  )
}
```

- [ ] **Step 3: Verificar que `dealOrigin` está disponible en ese scope. Si no, leerlo del deal recién insertado.**

- [ ] **Step 4: Endurecer `notifyDealCreated` para rechazar `origin='clase_gratuita'`**

En `lib/email/notifications/deal-created.ts`, al inicio de la función, agregar:

```typescript
if (dealRow.origin === 'clase_gratuita') {
  throw new Error('Use notifyClassRegistration for clase_gratuita deals')
}
```

Esto previene regresiones futuras.

- [ ] **Step 5: Smoke test manual con curl**

Construir un payload de GHL "CLASE PROPIETARIOS" y un payload "TASACIÓN DIRECTA". Disparar a `/api/webhooks/ghl/form-submission` en dev. Verificar en logs/inbox que llega solo el email correspondiente.

- [ ] **Step 6: Commit**

```bash
git add app/api/webhooks/ghl/form-submission/route.ts lib/email/notifications/deal-created.ts
git commit -m "fix(email): no enviar 'tasación agendada' para registros de clase gratuita

Branchea por deal.origin: 'clase_gratuita' → notifyClassRegistration; resto → notifyDealCreated. Hardening: notifyDealCreated rechaza origin='clase_gratuita' para prevenir regresiones."
```

### Task 1.5: Test failing para deal-created (regresión guard)

**Files:**
- Modify: `tests/email/notifications/deal-created.test.ts` (crear si no existe)

- [ ] **Step 1: Agregar test que verifique que notifyDealCreated lanza error con origin='clase_gratuita'**

```typescript
it('rechaza deal con origin=clase_gratuita', async () => {
  // mock deal con origin clase_gratuita
  await expect(notifyDealCreated({ dealId: 'cg-1' })).rejects.toThrow(/clase_gratuita/)
})
```

- [ ] **Step 2: Run + commit si pasa**

```bash
npm test -- tests/email/notifications/deal-created.test.ts
git add tests/email/notifications/deal-created.test.ts
git commit -m "test(email): regression guard — notifyDealCreated rechaza clase_gratuita"
```

---

# FASE 2 — Schema: fechas granulares por transición de stage

**Por qué:** Hoy solo existe `deals.stage_changed_at` (un único timestamp, sobrescrito en cada movimiento). Para responder "cuántas tasaciones se entregaron entre el 1 y el 15", necesitamos `delivered_at` persistente. Idem para `visited_at`, `captured_at`, `scheduled_at`. Esto es la columna vertebral de todo lo demás.

### Task 2.1: Migración — columnas de fecha por stage

**Files:**
- Create: `supabase/migrations/20260518000001_deals_stage_dates.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Stage transition timestamps for funnel metrics.
-- Backfill from stage_changed_at where current stage matches; nulls otherwise.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS scheduled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS visited_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS captured_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lost_at       TIMESTAMPTZ;

-- Backfill conservador: solo si el stage actual coincide
UPDATE deals SET scheduled_at = stage_changed_at WHERE stage = 'scheduled' AND scheduled_at IS NULL;
UPDATE deals SET visited_at   = stage_changed_at WHERE stage IN ('visited','appraisal_sent','followup','captured') AND visited_at IS NULL AND visit_completed_at IS NOT NULL;
UPDATE deals SET visited_at   = visit_completed_at WHERE visited_at IS NULL AND visit_completed_at IS NOT NULL;
UPDATE deals SET delivered_at = stage_changed_at WHERE stage IN ('appraisal_sent','followup','captured') AND delivered_at IS NULL;
UPDATE deals SET captured_at  = stage_changed_at WHERE stage = 'captured' AND captured_at IS NULL;
UPDATE deals SET lost_at      = stage_changed_at WHERE stage = 'lost' AND lost_at IS NULL;

-- Índices para filtros por rango de fechas en cada métrica del embudo
CREATE INDEX IF NOT EXISTS idx_deals_scheduled_at ON deals (scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_visited_at   ON deals (visited_at)   WHERE visited_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_delivered_at ON deals (delivered_at) WHERE delivered_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_captured_at  ON deals (captured_at)  WHERE captured_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_origin_created ON deals (origin, created_at DESC);

COMMENT ON COLUMN deals.scheduled_at IS 'Timestamp persistente de cuando el deal pasó a stage=scheduled';
COMMENT ON COLUMN deals.visited_at   IS 'Timestamp de cuando se realizó la visita (stage visited o posterior)';
COMMENT ON COLUMN deals.delivered_at IS 'Timestamp de entrega de tasación (stage appraisal_sent o posterior)';
COMMENT ON COLUMN deals.captured_at  IS 'Timestamp de captación de propiedad (stage captured)';
```

- [ ] **Step 2: Correr en Supabase dashboard SQL editor** (el usuario corre SQL manualmente — ver MEMORY.md gotcha)

- [ ] **Step 3: Verificar con query de control**

```sql
SELECT
  COUNT(*) FILTER (WHERE stage='captured') AS captured_total,
  COUNT(*) FILTER (WHERE stage='captured' AND captured_at IS NOT NULL) AS captured_with_date
FROM deals;
```

Expected: ambos números iguales (backfill exitoso).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260518000001_deals_stage_dates.sql
git commit -m "feat(db): fechas granulares por transición en deals (scheduled/visited/delivered/captured)"
```

### Task 2.2: Migración — tabla `deal_stage_history`

**Files:**
- Create: `supabase/migrations/20260518000002_deal_stage_history.sql`

- [ ] **Step 1: Escribir la migración**

```sql
CREATE TABLE IF NOT EXISTS deal_stage_history (
  id BIGSERIAL PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_deal_stage_history_deal ON deal_stage_history (deal_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_stage_history_to_stage_changed ON deal_stage_history (to_stage, changed_at DESC);

-- Trigger: cada cambio de stage genera fila + actualiza columna específica del stage
CREATE OR REPLACE FUNCTION fn_deals_track_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at, metadata)
    VALUES (NEW.id, OLD.stage, NEW.stage, NOW(), NULL);

    -- Mantener columnas dedicadas alineadas (solo set en transición real)
    IF NEW.stage = 'scheduled' AND NEW.scheduled_at IS NULL THEN NEW.scheduled_at := NOW(); END IF;
    IF NEW.stage = 'visited'   AND NEW.visited_at   IS NULL THEN NEW.visited_at   := NOW(); END IF;
    IF NEW.stage = 'appraisal_sent' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := NOW(); END IF;
    IF NEW.stage = 'captured'  AND NEW.captured_at  IS NULL THEN NEW.captured_at  := NOW(); END IF;
    IF NEW.stage = 'lost'      AND NEW.lost_at      IS NULL THEN NEW.lost_at      := NOW(); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deals_stage_change ON deals;
CREATE TRIGGER trg_deals_stage_change
  BEFORE INSERT OR UPDATE OF stage ON deals
  FOR EACH ROW EXECUTE FUNCTION fn_deals_track_stage_change();

-- Backfill inicial: una fila por deal existente
INSERT INTO deal_stage_history (deal_id, from_stage, to_stage, changed_at)
SELECT id, NULL, stage, COALESCE(stage_changed_at, created_at)
FROM deals
WHERE NOT EXISTS (SELECT 1 FROM deal_stage_history h WHERE h.deal_id = deals.id);

-- RLS: lectura para admin/dueno/coordinador
ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deal_stage_history_read" ON deal_stage_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin','dueno','coordinador')));
```

- [ ] **Step 2: Correr migración + commit**

```bash
git add supabase/migrations/20260518000002_deal_stage_history.sql
git commit -m "feat(db): deal_stage_history + trigger que mantiene fechas granulares"
```

### Task 2.3: Regenerar tipos TypeScript

- [ ] **Step 1: Correr `npx supabase gen types`**

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> --schema public > types/database.types.ts
```

Si el CLI no conecta (ver MEMORY.md gotcha: "Supabase CLI can't connect"), regenerar desde el dashboard Supabase → API Docs → TypeScript.

- [ ] **Step 2: Verificar que `Database['public']['Tables']['deals']['Row']` ahora incluye `scheduled_at`, `visited_at`, `delivered_at`, `captured_at`, `lost_at`.**

- [ ] **Step 3: Verificar que `deal_stage_history` aparece en `Tables`.**

- [ ] **Step 4: Commit**

```bash
git add types/database.types.ts
git commit -m "chore(types): regenerate after stage dates + history migrations"
```

---

# FASE 3 — Capa de agregación SQL (vistas + RPCs del embudo)

**Por qué:** Mover la lógica de agregación a SQL es 10× más rápido que iterar en JS y un único lugar de verdad. RPCs aceptan rango de fechas, evitan N+1, son cacheables.

### Task 3.1: Vista `vw_funnel_daily`

**Files:**
- Create: `supabase/migrations/20260518000003_metrics_views.sql`

- [ ] **Step 1: Escribir vista que agrega métricas por día**

```sql
-- Vista que precomputa eventos del embudo por día, con campaña/origen como dimensión
CREATE OR REPLACE VIEW vw_funnel_daily AS
WITH dates AS (
  SELECT generate_series(
    (SELECT MIN(created_at)::date FROM deals),
    CURRENT_DATE,
    INTERVAL '1 day'
  )::date AS day
),
class_regs AS (
  SELECT created_at::date AS day, COUNT(*) AS class_registrations
  FROM deals
  WHERE origin = 'clase_gratuita'
  GROUP BY 1
),
appraisal_requests AS (
  SELECT created_at::date AS day, COUNT(*) AS appraisal_requests
  FROM deals
  WHERE origin <> 'clase_gratuita' OR origin IS NULL
  GROUP BY 1
),
scheduled AS (
  SELECT scheduled_at::date AS day, COUNT(*) AS appointments_scheduled
  FROM deals WHERE scheduled_at IS NOT NULL
  GROUP BY 1
),
visited AS (
  SELECT visited_at::date AS day, COUNT(*) AS visits_completed
  FROM deals WHERE visited_at IS NOT NULL
  GROUP BY 1
),
delivered AS (
  SELECT delivered_at::date AS day, COUNT(*) AS appraisals_delivered
  FROM deals WHERE delivered_at IS NOT NULL
  GROUP BY 1
),
captured AS (
  SELECT captured_at::date AS day, COUNT(*) AS properties_captured
  FROM deals WHERE captured_at IS NOT NULL
  GROUP BY 1
)
SELECT
  d.day,
  COALESCE(cr.class_registrations, 0)   AS class_registrations,
  COALESCE(ar.appraisal_requests, 0)    AS appraisal_requests,
  COALESCE(s.appointments_scheduled, 0) AS appointments_scheduled,
  COALESCE(v.visits_completed, 0)       AS visits_completed,
  COALESCE(dl.appraisals_delivered, 0)  AS appraisals_delivered,
  COALESCE(c.properties_captured, 0)    AS properties_captured
FROM dates d
LEFT JOIN class_regs cr        ON cr.day = d.day
LEFT JOIN appraisal_requests ar ON ar.day = d.day
LEFT JOIN scheduled s          ON s.day = d.day
LEFT JOIN visited v            ON v.day = d.day
LEFT JOIN delivered dl         ON dl.day = d.day
LEFT JOIN captured c           ON c.day = d.day;

COMMENT ON VIEW vw_funnel_daily IS 'Eventos del embudo por día. Una fila por fecha calendario.';
```

- [ ] **Step 2: Vista de Meta Ads por día y campaña**

```sql
CREATE OR REPLACE VIEW vw_meta_ads_funnel_daily AS
SELECT
  m.date AS day,
  m.campaign_id,
  m.campaign_name,
  m.impressions,
  m.clicks,
  m.ctr,
  m.spend,
  m.leads AS registrations,
  m.cost_per_lead,
  CASE
    WHEN LOWER(m.campaign_name) LIKE '%clase%' OR LOWER(m.campaign_name) LIKE '%curso%' THEN 'clase_gratuita'
    WHEN LOWER(m.campaign_name) LIKE '%tasaci%' THEN 'tasacion'
    ELSE 'otro'
  END AS funnel_type
FROM meta_ads_daily m;

COMMENT ON VIEW vw_meta_ads_funnel_daily IS 'Métricas Meta Ads con clasificación de tipo de campaña (clase_gratuita | tasacion | otro)';
```

> Nota: la regex de `funnel_type` es heurística por nombre de campaña. Si el cliente nombra distinto, ajustar. Alternativa robusta: agregar columna `funnel_type` a `meta_ads_daily` con default según nombre, editable por admin.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260518000003_metrics_views.sql
git commit -m "feat(db): vistas vw_funnel_daily + vw_meta_ads_funnel_daily"
```

### Task 3.2: RPC `get_funnel_metrics(from, to)`

**Files:**
- Create: `supabase/migrations/20260518000004_metrics_rpcs.sql`

- [ ] **Step 1: Escribir la RPC**

```sql
CREATE OR REPLACE FUNCTION get_funnel_metrics(p_from DATE, p_to DATE)
RETURNS TABLE (
  metric TEXT,
  value BIGINT
)
LANGUAGE sql
STABLE
AS $$
  SELECT 'class_registrations'::TEXT,    COALESCE(SUM(class_registrations), 0)::BIGINT FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'appraisal_requests',           COALESCE(SUM(appraisal_requests), 0) FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'appointments_scheduled',       COALESCE(SUM(appointments_scheduled), 0) FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'visits_completed',             COALESCE(SUM(visits_completed), 0) FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'appraisals_delivered',         COALESCE(SUM(appraisals_delivered), 0) FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to
  UNION ALL
  SELECT 'properties_captured',          COALESCE(SUM(properties_captured), 0) FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to;
$$;

CREATE OR REPLACE FUNCTION get_meta_funnel_by_campaign(p_from DATE, p_to DATE)
RETURNS TABLE (
  campaign_id TEXT,
  campaign_name TEXT,
  funnel_type TEXT,
  impressions BIGINT,
  clicks BIGINT,
  ctr NUMERIC,
  spend NUMERIC,
  registrations BIGINT,
  cost_per_registration NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    campaign_id,
    MAX(campaign_name) AS campaign_name,
    MAX(funnel_type) AS funnel_type,
    SUM(impressions)::BIGINT AS impressions,
    SUM(clicks)::BIGINT AS clicks,
    CASE WHEN SUM(impressions) > 0 THEN ROUND(SUM(clicks)::NUMERIC / SUM(impressions) * 100, 2) ELSE 0 END AS ctr,
    SUM(spend)::NUMERIC AS spend,
    SUM(registrations)::BIGINT AS registrations,
    CASE WHEN SUM(registrations) > 0 THEN ROUND(SUM(spend) / SUM(registrations), 2) ELSE NULL END AS cost_per_registration
  FROM vw_meta_ads_funnel_daily
  WHERE day BETWEEN p_from AND p_to
  GROUP BY campaign_id
  ORDER BY spend DESC;
$$;

CREATE OR REPLACE FUNCTION get_funnel_metrics_by_day(p_from DATE, p_to DATE)
RETURNS SETOF vw_funnel_daily
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM vw_funnel_daily WHERE day BETWEEN p_from AND p_to ORDER BY day;
$$;

GRANT EXECUTE ON FUNCTION get_funnel_metrics(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_meta_funnel_by_campaign(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_funnel_metrics_by_day(DATE, DATE) TO authenticated;
```

- [ ] **Step 2: Probar con SQL desde Supabase dashboard**

```sql
SELECT * FROM get_funnel_metrics('2026-05-01', '2026-05-18');
SELECT * FROM get_meta_funnel_by_campaign('2026-05-01', '2026-05-18');
```

Expected: 6 filas en la primera (una por métrica), N filas en la segunda (una por campaña).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260518000004_metrics_rpcs.sql
git commit -m "feat(db): RPCs get_funnel_metrics / get_meta_funnel_by_campaign / get_funnel_metrics_by_day"
```

---

# FASE 4 — Capa de servicios y API endpoints

### Task 4.1: Tipos compartidos

**Files:**
- Create: `lib/metrics/types.ts`

- [ ] **Step 1: Definir tipos**

```typescript
export type FunnelMetricKey =
  | 'class_registrations'
  | 'appraisal_requests'
  | 'appointments_scheduled'
  | 'visits_completed'
  | 'appraisals_delivered'
  | 'properties_captured'

export interface FunnelMetrics {
  class_registrations: number
  appraisal_requests: number
  appointments_scheduled: number
  visits_completed: number
  appraisals_delivered: number
  properties_captured: number
}

export interface RangeFilter {
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
}

export interface CampaignFunnelRow {
  campaign_id: string
  campaign_name: string
  funnel_type: 'clase_gratuita' | 'tasacion' | 'otro'
  impressions: number
  clicks: number
  ctr: number
  spend: number
  registrations: number
  cost_per_registration: number | null
}

export interface MetricsComparison<T> {
  current: T
  previous: T
  delta_pct: Partial<Record<keyof T, number>>
}
```

### Task 4.2: Service `lib/metrics/funnel.ts`

**Files:**
- Create: `lib/metrics/funnel.ts`

- [ ] **Step 1: Implementar el service**

```typescript
import { createServerClient } from '@/lib/supabase/server'
import type { FunnelMetrics, RangeFilter, CampaignFunnelRow } from './types'

export async function getFunnelMetrics(range: RangeFilter): Promise<FunnelMetrics> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('get_funnel_metrics', { p_from: range.from, p_to: range.to })
  if (error) throw error
  const map = Object.fromEntries((data ?? []).map((r: any) => [r.metric, Number(r.value)]))
  return {
    class_registrations:    map.class_registrations    ?? 0,
    appraisal_requests:     map.appraisal_requests     ?? 0,
    appointments_scheduled: map.appointments_scheduled ?? 0,
    visits_completed:       map.visits_completed       ?? 0,
    appraisals_delivered:   map.appraisals_delivered   ?? 0,
    properties_captured:    map.properties_captured    ?? 0,
  }
}

export async function getFunnelByCampaign(range: RangeFilter): Promise<CampaignFunnelRow[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('get_meta_funnel_by_campaign', { p_from: range.from, p_to: range.to })
  if (error) throw error
  return (data ?? []) as CampaignFunnelRow[]
}

export async function getFunnelByDay(range: RangeFilter) {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('get_funnel_metrics_by_day', { p_from: range.from, p_to: range.to })
  if (error) throw error
  return data ?? []
}
```

### Task 4.3: Service `lib/metrics/comparison.ts`

**Files:**
- Create: `lib/metrics/comparison.ts`

- [ ] **Step 1: Test failing**

`tests/metrics/comparison.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculatePreviousRange, deltaPercent } from '@/lib/metrics/comparison'

describe('calculatePreviousRange', () => {
  it('para "ayer" devuelve "antes de ayer"', () => {
    const r = calculatePreviousRange({ from: '2026-05-17', to: '2026-05-17' })
    expect(r).toEqual({ from: '2026-05-16', to: '2026-05-16' })
  })
  it('para 7 días devuelve los 7 inmediatamente anteriores', () => {
    const r = calculatePreviousRange({ from: '2026-05-11', to: '2026-05-17' })
    expect(r).toEqual({ from: '2026-05-04', to: '2026-05-10' })
  })
})

describe('deltaPercent', () => {
  it('devuelve null si previo es 0 y actual también', () => {
    expect(deltaPercent(0, 0)).toBeNull()
  })
  it('+100% si pasamos de 5 a 10', () => {
    expect(deltaPercent(10, 5)).toBe(100)
  })
  it('-50% si pasamos de 10 a 5', () => {
    expect(deltaPercent(5, 10)).toBe(-50)
  })
  it('Infinity si previo es 0 y actual > 0', () => {
    expect(deltaPercent(5, 0)).toBe(Infinity)
  })
})
```

- [ ] **Step 2: Implementar**

```typescript
import type { RangeFilter, FunnelMetrics, MetricsComparison } from './types'
import { getFunnelMetrics } from './funnel'

export function calculatePreviousRange(range: RangeFilter): RangeFilter {
  const from = new Date(range.from + 'T00:00:00Z')
  const to = new Date(range.to + 'T00:00:00Z')
  const diffDays = Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24))
  const prevTo = new Date(from)
  prevTo.setUTCDate(prevTo.getUTCDate() - 1)
  const prevFrom = new Date(prevTo)
  prevFrom.setUTCDate(prevFrom.getUTCDate() - diffDays)
  return {
    from: prevFrom.toISOString().slice(0, 10),
    to: prevTo.toISOString().slice(0, 10),
  }
}

export function deltaPercent(current: number, previous: number): number | null {
  if (current === 0 && previous === 0) return null
  if (previous === 0) return Infinity
  return Math.round(((current - previous) / previous) * 100)
}

export async function getFunnelComparison(range: RangeFilter): Promise<MetricsComparison<FunnelMetrics>> {
  const previousRange = calculatePreviousRange(range)
  const [current, previous] = await Promise.all([
    getFunnelMetrics(range),
    getFunnelMetrics(previousRange),
  ])
  const delta_pct: Partial<Record<keyof FunnelMetrics, number>> = {}
  ;(Object.keys(current) as (keyof FunnelMetrics)[]).forEach(k => {
    const d = deltaPercent(current[k], previous[k])
    if (d !== null) delta_pct[k] = d
  })
  return { current, previous, delta_pct }
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm test -- tests/metrics/comparison.test.ts
git add lib/metrics/ tests/metrics/comparison.test.ts
git commit -m "feat(metrics): services funnel + comparison con tests"
```

### Task 4.4: API endpoint `/api/metrics/funnel`

**Files:**
- Create: `app/api/metrics/funnel/route.ts`

- [ ] **Step 1: Implementar GET con validación**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getFunnelComparison } from '@/lib/metrics/comparison'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from/to required as YYYY-MM-DD' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be <= to' }, { status: 400 })
  }
  try {
    const data = await getFunnelComparison({ from, to })
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
```

- [ ] **Step 2: Probar manualmente**

```bash
curl 'http://localhost:3000/api/metrics/funnel?from=2026-05-11&to=2026-05-17'
```

Expected: `{ "current": {...}, "previous": {...}, "delta_pct": {...} }`

### Task 4.5: API endpoints restantes

**Files:**
- Create: `app/api/metrics/funnel-by-campaign/route.ts`
- Create: `app/api/metrics/funnel-by-day/route.ts`

- [ ] **Step 1: Implementar ambos siguiendo el mismo patrón que `/api/metrics/funnel`**

`app/api/metrics/funnel-by-campaign/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getFunnelByCampaign } from '@/lib/metrics/funnel'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const from = sp.get('from'); const to = sp.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from/to required' }, { status: 400 })
  const data = await getFunnelByCampaign({ from, to })
  return NextResponse.json(data)
}
```

`app/api/metrics/funnel-by-day/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getFunnelByDay } from '@/lib/metrics/funnel'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const from = sp.get('from'); const to = sp.get('to')
  if (!from || !to) return NextResponse.json({ error: 'from/to required' }, { status: 400 })
  const data = await getFunnelByDay({ from, to })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/metrics/
git commit -m "feat(api): endpoints /api/metrics/funnel{,-by-campaign,-by-day}"
```

---

# FASE 5 — Dashboard UI rebuild

**Por qué:** El usuario calificó la página actual como "terriblemente pobre". Rebuild completo, no patch.

### Task 5.1: Instalar recharts

- [ ] **Step 1: Instalar**

```bash
npm install recharts
```

- [ ] **Step 2: Commit del lock**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add recharts for metrics visualization"
```

### Task 5.2: Componente `DateRangePicker`

**Files:**
- Create: `components/metrics/DateRangePicker.tsx`

- [ ] **Step 1: Implementar selector con presets**

```tsx
"use client"
import { useState } from 'react'

const PRESETS = [
  { key: 'yesterday', label: 'Ayer', days: 1, offset: 1 },
  { key: '7d',  label: 'Últimos 7 días',  days: 7,  offset: 1 },
  { key: '30d', label: 'Últimos 30 días', days: 30, offset: 1 },
  { key: 'month_to_date', label: 'Mes corriente', custom: true },
  { key: 'last_month',    label: 'Mes anterior',  custom: true },
  { key: 'custom', label: 'Personalizado', customRange: true },
]

export interface DateRange { from: string; to: string }

export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const [preset, setPreset] = useState('7d')
  const apply = (key: string) => {
    setPreset(key)
    if (key === 'custom') return
    const today = new Date(); today.setUTCHours(0, 0, 0, 0)
    if (key === 'yesterday') {
      const y = new Date(today); y.setUTCDate(y.getUTCDate() - 1)
      onChange({ from: y.toISOString().slice(0,10), to: y.toISOString().slice(0,10) })
    } else if (key === '7d') {
      const to = new Date(today); to.setUTCDate(to.getUTCDate() - 1)
      const from = new Date(to); from.setUTCDate(from.getUTCDate() - 6)
      onChange({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) })
    } else if (key === '30d') {
      const to = new Date(today); to.setUTCDate(to.getUTCDate() - 1)
      const from = new Date(to); from.setUTCDate(from.getUTCDate() - 29)
      onChange({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) })
    } else if (key === 'month_to_date') {
      const from = new Date(today.getUTCFullYear(), today.getUTCMonth(), 1)
      onChange({ from: from.toISOString().slice(0,10), to: today.toISOString().slice(0,10) })
    } else if (key === 'last_month') {
      const from = new Date(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)
      const to = new Date(today.getUTCFullYear(), today.getUTCMonth(), 0)
      onChange({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) })
    }
  }
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESETS.map(p => (
        <button
          key={p.key}
          onClick={() => apply(p.key)}
          className={`px-3 py-1.5 text-sm rounded border ${preset === p.key ? 'bg-black text-white border-black' : 'bg-white border-gray-300'}`}
        >{p.label}</button>
      ))}
      {preset === 'custom' && (
        <>
          <input type="date" value={value.from} onChange={e => onChange({ ...value, from: e.target.value })} className="px-2 py-1 border rounded text-sm" />
          <span>—</span>
          <input type="date" value={value.to} onChange={e => onChange({ ...value, to: e.target.value })} className="px-2 py-1 border rounded text-sm" />
        </>
      )}
    </div>
  )
}
```

### Task 5.3: Componente `FunnelChart`

**Files:**
- Create: `components/metrics/FunnelChart.tsx`

- [ ] **Step 1: Implementar funnel horizontal con drop-off**

```tsx
"use client"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts'
import type { FunnelMetrics } from '@/lib/metrics/types'

const LABELS: Array<{ key: keyof FunnelMetrics; label: string }> = [
  { key: 'appraisal_requests',     label: 'Solicitudes de tasación' },
  { key: 'appointments_scheduled', label: 'Tasaciones agendadas' },
  { key: 'visits_completed',       label: 'Visitas realizadas' },
  { key: 'appraisals_delivered',   label: 'Tasaciones entregadas' },
  { key: 'properties_captured',    label: 'Propiedades captadas' },
]

export function FunnelChart({ metrics }: { metrics: FunnelMetrics }) {
  const data = LABELS.map((l, i) => {
    const value = metrics[l.key]
    const prev = i === 0 ? value : metrics[LABELS[i-1].key]
    const conversionPct = prev > 0 ? Math.round((value / prev) * 100) : null
    return { stage: l.label, value, conversionPct }
  })
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} layout="vertical" margin={{ left: 40, right: 60 }}>
        <XAxis type="number" />
        <YAxis type="category" dataKey="stage" width={180} />
        <Tooltip formatter={(v: number, _n, ctx: any) => [
          `${v} (${ctx.payload.conversionPct !== null ? ctx.payload.conversionPct + '% conv.' : 'inicio'})`,
          'Cantidad',
        ]} />
        <Bar dataKey="value" fill="#0ea5e9">
          <LabelList dataKey="value" position="right" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

### Task 5.4: Componente `MetricsTable`

**Files:**
- Create: `components/metrics/MetricsTable.tsx`

- [ ] **Step 1: Tabla comparativa actual vs anterior con delta %**

```tsx
"use client"
import type { MetricsComparison, FunnelMetrics } from '@/lib/metrics/types'

const ROWS: Array<{ key: keyof FunnelMetrics; label: string }> = [
  { key: 'class_registrations',    label: 'Registros a clase gratuita' },
  { key: 'appraisal_requests',     label: 'Solicitudes de tasación' },
  { key: 'appointments_scheduled', label: 'Tasaciones agendadas' },
  { key: 'visits_completed',       label: 'Visitas realizadas' },
  { key: 'appraisals_delivered',   label: 'Tasaciones entregadas' },
  { key: 'properties_captured',    label: 'Propiedades captadas' },
]

export function MetricsTable({ data }: { data: MetricsComparison<FunnelMetrics> }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead className="bg-gray-100">
        <tr>
          <th className="text-left py-2 px-3 border">Métrica</th>
          <th className="text-right py-2 px-3 border">Período actual</th>
          <th className="text-right py-2 px-3 border">Período anterior</th>
          <th className="text-right py-2 px-3 border">Δ %</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map(r => {
          const cur = data.current[r.key]
          const prev = data.previous[r.key]
          const delta = data.delta_pct[r.key]
          const deltaColor = delta === undefined ? 'text-gray-400' : delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-600'
          return (
            <tr key={r.key} className="hover:bg-gray-50">
              <td className="py-2 px-3 border">{r.label}</td>
              <td className="py-2 px-3 border text-right font-medium">{cur}</td>
              <td className="py-2 px-3 border text-right text-gray-600">{prev}</td>
              <td className={`py-2 px-3 border text-right ${deltaColor}`}>{delta === undefined ? '—' : delta === Infinity ? '+∞' : `${delta > 0 ? '+' : ''}${delta}%`}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

### Task 5.5: Componente `CampaignBreakdown`

**Files:**
- Create: `components/metrics/CampaignBreakdown.tsx`

- [ ] **Step 1: Tabla por campaña con segmentos clase_gratuita vs tasacion**

```tsx
"use client"
import type { CampaignFunnelRow } from '@/lib/metrics/types'

export function CampaignBreakdown({ rows }: { rows: CampaignFunnelRow[] }) {
  const groups = ['clase_gratuita', 'tasacion', 'otro'] as const
  return (
    <div className="space-y-6">
      {groups.map(g => {
        const slice = rows.filter(r => r.funnel_type === g)
        if (slice.length === 0) return null
        const labels: Record<string, string> = { clase_gratuita: 'Campañas Clase Gratuita', tasacion: 'Campañas Solicitud de Tasación', otro: 'Otras campañas' }
        const totals = slice.reduce((a, r) => ({
          impressions: a.impressions + r.impressions,
          clicks: a.clicks + r.clicks,
          spend: a.spend + r.spend,
          registrations: a.registrations + r.registrations,
        }), { impressions: 0, clicks: 0, spend: 0, registrations: 0 })
        const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100).toFixed(2) : '0'
        const cpr = totals.registrations > 0 ? (totals.spend / totals.registrations).toFixed(0) : '—'
        return (
          <section key={g}>
            <h3 className="text-lg font-semibold mb-2">{labels[g]}</h3>
            <table className="w-full text-sm border-collapse">
              <thead className="bg-gray-100">
                <tr>
                  <th className="text-left py-2 px-3 border">Campaña</th>
                  <th className="text-right py-2 px-3 border">Impresiones</th>
                  <th className="text-right py-2 px-3 border">Clics</th>
                  <th className="text-right py-2 px-3 border">CTR %</th>
                  <th className="text-right py-2 px-3 border">Gasto</th>
                  <th className="text-right py-2 px-3 border">Registros</th>
                  <th className="text-right py-2 px-3 border">$/Registro</th>
                </tr>
              </thead>
              <tbody>
                {slice.map(r => (
                  <tr key={r.campaign_id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 border">{r.campaign_name}</td>
                    <td className="py-2 px-3 border text-right">{r.impressions}</td>
                    <td className="py-2 px-3 border text-right">{r.clicks}</td>
                    <td className="py-2 px-3 border text-right">{r.ctr.toFixed(2)}%</td>
                    <td className="py-2 px-3 border text-right">${r.spend.toFixed(0)}</td>
                    <td className="py-2 px-3 border text-right">{r.registrations}</td>
                    <td className="py-2 px-3 border text-right">{r.cost_per_registration ?? '—'}</td>
                  </tr>
                ))}
                <tr className="font-semibold bg-gray-50">
                  <td className="py-2 px-3 border">Total {labels[g]}</td>
                  <td className="py-2 px-3 border text-right">{totals.impressions}</td>
                  <td className="py-2 px-3 border text-right">{totals.clicks}</td>
                  <td className="py-2 px-3 border text-right">{ctr}%</td>
                  <td className="py-2 px-3 border text-right">${totals.spend.toFixed(0)}</td>
                  <td className="py-2 px-3 border text-right">{totals.registrations}</td>
                  <td className="py-2 px-3 border text-right">{cpr}</td>
                </tr>
              </tbody>
            </table>
          </section>
        )
      })}
    </div>
  )
}
```

### Task 5.6: Reescribir `app/(dashboard)/metrics/page.tsx`

**Files:**
- Modify: `app/(dashboard)/metrics/page.tsx` (rewrite)

- [ ] **Step 1: Reescribir como client component con fetch a los 3 endpoints**

```tsx
"use client"
import { useEffect, useState } from 'react'
import { DateRangePicker, type DateRange } from '@/components/metrics/DateRangePicker'
import { FunnelChart } from '@/components/metrics/FunnelChart'
import { MetricsTable } from '@/components/metrics/MetricsTable'
import { CampaignBreakdown } from '@/components/metrics/CampaignBreakdown'
import type { MetricsComparison, FunnelMetrics, CampaignFunnelRow } from '@/lib/metrics/types'

function defaultRange(): DateRange {
  const today = new Date()
  const to = new Date(today); to.setUTCDate(to.getUTCDate() - 1)
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - 6)
  return { from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10) }
}

export default function MetricsPage() {
  const [range, setRange] = useState<DateRange>(defaultRange())
  const [funnel, setFunnel] = useState<MetricsComparison<FunnelMetrics> | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignFunnelRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/metrics/funnel?from=${range.from}&to=${range.to}`).then(r => r.json()),
      fetch(`/api/metrics/funnel-by-campaign?from=${range.from}&to=${range.to}`).then(r => r.json()),
    ]).then(([f, c]) => {
      setFunnel(f); setCampaigns(c)
    }).finally(() => setLoading(false))
  }, [range.from, range.to])

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Métricas</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </header>
      {loading && <p className="text-sm text-gray-500">Cargando…</p>}
      {funnel && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Embudo — Período {range.from} a {range.to}</h2>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="bg-white rounded border p-4"><FunnelChart metrics={funnel.current} /></div>
            <div className="bg-white rounded border p-4"><MetricsTable data={funnel} /></div>
          </div>
        </section>
      )}
      <section>
        <h2 className="text-lg font-semibold mb-3">Rendimiento publicitario</h2>
        <div className="bg-white rounded border p-4">
          <CampaignBreakdown rows={campaigns} />
        </div>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Levantar dev server y probar en el navegador**

```bash
npm run dev
```

Abrir `http://localhost:3000/metrics`, probar todos los presets (ayer / 7d / 30d / mes corriente / mes anterior / custom). Verificar que:
- El funnel muestra las 5 etapas en orden
- La tabla muestra +/-% en color verde/rojo
- La tabla de campañas separa "Clase Gratuita" de "Tasación"

- [ ] **Step 3: Commit**

```bash
git add app/\(dashboard\)/metrics/page.tsx components/metrics/
git commit -m "feat(metrics): dashboard rebuild — funnel chart, tabla comparativa, breakdown por campaña"
```

---

# FASE 6 — Reportes email formato tabla Excel

**Por qué:** El usuario fue muy explícito: "tiene que ser visualmente como si fuese una tabla de Excel ... no me sirve algo súper bonito ... yo necesito que visualmente sea fácil de comparar."

### Task 6.1: Builder de HTML estilo tabla densa

**Files:**
- Create: `lib/email/reports/excel-table-builder.ts`

- [ ] **Step 1: Test failing**

`tests/email/reports/excel-table-builder.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildExcelTable } from '@/lib/email/reports/excel-table-builder'

describe('buildExcelTable', () => {
  it('produce HTML con todas las filas y columnas', () => {
    const html = buildExcelTable({
      title: 'Reporte diario — 2026-05-17',
      columns: ['Métrica', 'Hoy', 'Ayer', 'Δ %'],
      rows: [
        ['Solicitudes de tasación', '5', '3', '+67%'],
        ['Tasaciones agendadas', '4', '2', '+100%'],
      ],
    })
    expect(html).toContain('Reporte diario')
    expect(html).toContain('Solicitudes de tasación')
    expect(html).toContain('+67%')
    expect(html).toMatch(/<table[^>]*border-collapse:\s*collapse/)
  })
})
```

- [ ] **Step 2: Implementar**

```typescript
export interface ExcelTableSection {
  title: string
  columns: string[]
  rows: string[][]
}

const TD = (v: string, opts: { align?: 'left' | 'right'; bold?: boolean; color?: string } = {}) =>
  `<td style="padding:6px 10px;border:1px solid #d1d5db;text-align:${opts.align ?? 'left'};${opts.bold ? 'font-weight:600;' : ''}${opts.color ? `color:${opts.color};` : ''}">${v}</td>`

export function buildExcelTable(section: ExcelTableSection): string {
  const head = section.columns.map((c, i) =>
    `<th style="padding:6px 10px;border:1px solid #9ca3af;background:#e5e7eb;text-align:${i === 0 ? 'left' : 'right'};font-size:12px;">${c}</th>`,
  ).join('')
  const body = section.rows.map(r => {
    const cells = r.map((v, i) => {
      const isDelta = i === r.length - 1 && /^[+\-]/.test(v)
      const color = isDelta ? (v.startsWith('+') ? '#16a34a' : '#dc2626') : undefined
      return TD(v, { align: i === 0 ? 'left' : 'right', bold: i === 0, color })
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')
  return `
    <h3 style="font-family:Arial,sans-serif;margin:18px 0 6px 0;font-size:14px;">${section.title}</h3>
    <table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:12px;width:100%;max-width:720px;">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>`
}

export function buildExcelReport(opts: { title: string; preheader: string; sections: ExcelTableSection[] }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${opts.title}</title></head>
<body style="background:#f9fafb;margin:0;padding:24px;">
<div style="max-width:740px;margin:0 auto;background:#fff;padding:24px;border:1px solid #e5e7eb;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#6b7280;margin:0 0 4px 0;">${opts.preheader}</p>
  <h1 style="font-family:Arial,sans-serif;font-size:18px;margin:0 0 12px 0;">${opts.title}</h1>
  ${opts.sections.map(buildExcelTable).join('')}
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;margin-top:24px;">Generado automáticamente por la plataforma. Dudas: contacto@inmodf.com.ar</p>
</div></body></html>`
}
```

- [ ] **Step 3: Run test + commit**

```bash
npm test -- tests/email/reports/excel-table-builder.test.ts
git add lib/email/reports/excel-table-builder.ts tests/email/reports/excel-table-builder.test.ts
git commit -m "feat(email): excel-table-builder para reportes formato planilla"
```

### Task 6.2: Refactorizar `daily-report`

**Files:**
- Modify: `lib/email/reports/daily-report.ts` (o equivalente que dispara `netlify/functions/scheduled-daily-report.mts`)

- [ ] **Step 1: Identificar el archivo actual**

```bash
grep -rln "scheduled-daily-report\|daily.report\|dailyReport" netlify/ lib/ app/
```

- [ ] **Step 2: Reemplazar el HTML generation para usar `buildExcelReport`**

El reporte diario debe tener estas secciones:

```typescript
import { buildExcelReport } from './excel-table-builder'
import { getFunnelMetrics } from '@/lib/metrics/funnel'
import { calculatePreviousRange, deltaPercent } from '@/lib/metrics/comparison'
import { getFunnelByCampaign } from '@/lib/metrics/funnel'

export async function buildDailyReportHTML(date: string /* YYYY-MM-DD */) {
  const range = { from: date, to: date }
  const prev = calculatePreviousRange(range)
  const [today, yesterday, campaigns] = await Promise.all([
    getFunnelMetrics(range),
    getFunnelMetrics(prev),
    getFunnelByCampaign(range),
  ])

  const fmtDelta = (a: number, b: number) => {
    const d = deltaPercent(a, b)
    if (d === null) return '—'
    if (d === Infinity) return '+∞'
    return `${d > 0 ? '+' : ''}${d}%`
  }

  const funnelRows: string[][] = [
    ['Registros a clase gratuita',    String(today.class_registrations),    String(yesterday.class_registrations),    fmtDelta(today.class_registrations, yesterday.class_registrations)],
    ['Solicitudes de tasación',       String(today.appraisal_requests),     String(yesterday.appraisal_requests),     fmtDelta(today.appraisal_requests, yesterday.appraisal_requests)],
    ['Tasaciones agendadas',          String(today.appointments_scheduled), String(yesterday.appointments_scheduled), fmtDelta(today.appointments_scheduled, yesterday.appointments_scheduled)],
    ['Visitas realizadas',            String(today.visits_completed),       String(yesterday.visits_completed),       fmtDelta(today.visits_completed, yesterday.visits_completed)],
    ['Tasaciones entregadas',         String(today.appraisals_delivered),   String(yesterday.appraisals_delivered),   fmtDelta(today.appraisals_delivered, yesterday.appraisals_delivered)],
    ['Propiedades captadas',          String(today.properties_captured),    String(yesterday.properties_captured),    fmtDelta(today.properties_captured, yesterday.properties_captured)],
  ]

  const campaignRows: string[][] = campaigns.map(c => [
    c.campaign_name,
    String(c.clicks),
    `${c.ctr.toFixed(2)}%`,
    String(c.registrations),
    c.cost_per_registration ? `$${c.cost_per_registration.toFixed(0)}` : '—',
    `$${c.spend.toFixed(0)}`,
  ])

  return buildExcelReport({
    title: `Reporte diario — ${date}`,
    preheader: `Embudo del ${date} vs ${prev.from}`,
    sections: [
      { title: 'Embudo (vs día anterior)', columns: ['Métrica', 'Hoy', 'Ayer', 'Δ %'], rows: funnelRows },
      { title: 'Rendimiento por campaña Meta',
        columns: ['Campaña', 'Clics', 'CTR', 'Registros', '$/Registro', 'Gasto'],
        rows: campaignRows.length > 0 ? campaignRows : [['(sin datos de Meta para esta fecha)', '', '', '', '', '']] },
    ],
  })
}
```

- [ ] **Step 3: Conectar al cron actual** que envía a recipients de `report_settings`

Asegurarse que la función scheduled-daily-report llama a `buildDailyReportHTML(yesterday)` y envía con Resend al destinatario.

- [ ] **Step 4: Test smoke en local**

Disparar manualmente con `curl http://localhost:3000/api/cron/daily-report?dryRun=true&date=2026-05-17`. Inspeccionar HTML generado y abrirlo en un navegador para validar visualmente que parece una tabla de Excel.

- [ ] **Step 5: Commit**

```bash
git add lib/email/reports/daily-report.ts
git commit -m "feat(email): reporte diario en formato tabla Excel — embudo + campañas"
```

### Task 6.3: Refactorizar `weekly-report` y `monthly-report`

**Files:**
- Modify: `lib/email/reports/weekly-report.ts`
- Modify: `lib/email/reports/monthly-report.ts`

- [ ] **Step 1: Weekly — mismas secciones, rango de 7 días + comparativa con los 7 anteriores**

```typescript
export async function buildWeeklyReportHTML(weekEnding: string) {
  const to = weekEnding
  const fromD = new Date(weekEnding); fromD.setUTCDate(fromD.getUTCDate() - 6)
  const from = fromD.toISOString().slice(0, 10)
  // misma estructura que daily pero con range de 7 días
  // ...
  return buildExcelReport({
    title: `Reporte semanal — ${from} a ${to}`,
    preheader: `Embudo de los últimos 7 días vs los 7 anteriores`,
    sections: [/* idem daily */],
  })
}
```

- [ ] **Step 2: Monthly — rango calendario del mes + comparativa mes anterior**

- [ ] **Step 3: Probar ambos con dryRun** y validar el HTML.

- [ ] **Step 4: Commit**

```bash
git add lib/email/reports/weekly-report.ts lib/email/reports/monthly-report.ts
git commit -m "feat(email): reportes semanal/mensual en formato tabla Excel"
```

### Task 6.4: Verificar destinatarios

- [ ] **Step 1: Consultar `report_settings`**

```sql
SELECT recipients, daily_enabled, weekly_enabled, monthly_enabled FROM report_settings WHERE id='default';
```

- [ ] **Step 2: Confirmar con el usuario** que los emails de él (contacto.julianparra@gmail.com) y Diego están listados. Si no, actualizar:

```sql
UPDATE report_settings
SET recipients = ARRAY['contacto.julianparra@gmail.com', '<email_diego>'],
    daily_enabled = true, weekly_enabled = true, monthly_enabled = true
WHERE id='default';
```

> ⚠️ Esto es acción sobre datos compartidos — pedir confirmación del email de Diego antes de ejecutar.

---

# FASE 7 — Tracking de landing page views por campaña

**Por qué:** El usuario pide medir "visitas a la landing page" para calcular conversión real (visitas → registros). Hoy se infiere de Meta Ads `clicks` pero no se mide en nuestra base.

### Task 7.1: Migración `landing_page_visits`

**Files:**
- Create: `supabase/migrations/20260518000005_landing_page_visits.sql`

- [ ] **Step 1: Tabla**

```sql
CREATE TABLE IF NOT EXISTS landing_page_visits (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  funnel_type TEXT CHECK (funnel_type IN ('clase_gratuita', 'tasacion', 'otro')) DEFAULT 'otro',
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  fbclid TEXT,
  gclid TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lpv_visited_at ON landing_page_visits (visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lpv_funnel_visited ON landing_page_visits (funnel_type, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_lpv_slug_visited ON landing_page_visits (slug, visited_at DESC);

ALTER TABLE landing_page_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lpv_insert_anon" ON landing_page_visits FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "lpv_read_admin" ON landing_page_visits FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','dueno','coordinador')));
```

- [ ] **Step 2: Vista de conversión**

```sql
CREATE OR REPLACE VIEW vw_landing_conversion_daily AS
WITH visits AS (
  SELECT visited_at::date AS day, funnel_type, COUNT(*) AS visits
  FROM landing_page_visits GROUP BY 1, 2
),
regs AS (
  SELECT created_at::date AS day,
    CASE WHEN origin = 'clase_gratuita' THEN 'clase_gratuita' ELSE 'tasacion' END AS funnel_type,
    COUNT(*) AS registrations
  FROM deals
  GROUP BY 1, 2
)
SELECT
  COALESCE(v.day, r.day) AS day,
  COALESCE(v.funnel_type, r.funnel_type) AS funnel_type,
  COALESCE(v.visits, 0) AS visits,
  COALESCE(r.registrations, 0) AS registrations,
  CASE WHEN COALESCE(v.visits, 0) > 0
    THEN ROUND(COALESCE(r.registrations, 0)::NUMERIC / v.visits * 100, 2)
    ELSE NULL END AS conversion_pct
FROM visits v
FULL OUTER JOIN regs r ON v.day = r.day AND v.funnel_type = r.funnel_type;
```

### Task 7.2: Endpoint `/api/landing/track-visit`

**Files:**
- Create: `app/api/landing/track-visit/route.ts`

- [ ] **Step 1: Implementar**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const supabase = await createServerClient()
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  const ipHash = crypto.createHash('sha256').update(ip + (process.env.IP_HASH_SALT ?? '')).digest('hex').slice(0, 32)
  const funnelType = body.funnel_type === 'clase_gratuita' ? 'clase_gratuita' : body.funnel_type === 'tasacion' ? 'tasacion' : 'otro'
  await supabase.from('landing_page_visits').insert({
    slug: body.slug ?? null,
    funnel_type: funnelType,
    utm_source: body.utm?.utm_source ?? null,
    utm_medium: body.utm?.utm_medium ?? null,
    utm_campaign: body.utm?.utm_campaign ?? null,
    utm_content: body.utm?.utm_content ?? null,
    utm_term: body.utm?.utm_term ?? null,
    fbclid: body.fbclid ?? null,
    gclid: body.gclid ?? null,
    referrer: body.referrer ?? null,
    user_agent: req.headers.get('user-agent'),
    ip_hash: ipHash,
  })
  return NextResponse.json({ ok: true })
}
```

### Task 7.3: Dispatch desde landing

**Files:**
- Modify: `app/p/[slug]/page.tsx` (o componente landing equivalente — ver Fase 7 audit)

- [ ] **Step 1: Agregar componente client `<LandingVisitTracker />`**

`components/landing/LandingVisitTracker.tsx`:

```tsx
"use client"
import { useEffect } from 'react'

interface Props { slug: string; funnelType: 'clase_gratuita' | 'tasacion' | 'otro' }

export function LandingVisitTracker({ slug, funnelType }: Props) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const utm = {
      utm_source:   params.get('utm_source'),
      utm_medium:   params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content:  params.get('utm_content'),
      utm_term:     params.get('utm_term'),
    }
    fetch('/api/landing/track-visit', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug, funnel_type: funnelType, utm,
        fbclid: params.get('fbclid'), gclid: params.get('gclid'),
        referrer: document.referrer,
      }),
    }).catch(() => {})
  }, [slug, funnelType])
  return null
}
```

- [ ] **Step 2: Insertar en la página landing**

```tsx
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
// dentro del JSX:
<LandingVisitTracker slug={params.slug} funnelType={detectFunnelType(params.slug)} />
```

`detectFunnelType` puede mapear por slug (ej. `clase-gratuita-*` → `clase_gratuita`, `tasacion-*` → `tasacion`) o leer de un campo en BD.

- [ ] **Step 3: Probar visitas en local con UTM params**

```bash
curl 'http://localhost:3000/p/<slug>?utm_source=meta&utm_campaign=clase_gratuita_test'
```

- [ ] **Step 4: Verificar fila insertada**

```sql
SELECT * FROM landing_page_visits ORDER BY visited_at DESC LIMIT 5;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260518000005_landing_page_visits.sql app/api/landing/track-visit/ components/landing/LandingVisitTracker.tsx app/p/\[slug\]/page.tsx
git commit -m "feat(metrics): tracking server-side de visitas a landing por campaña + vista de conversión"
```

### Task 7.4: Exponer en el dashboard

- [ ] **Step 1: Agregar endpoint `/api/metrics/landing-conversion`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const from = sp.get('from'); const to = sp.get('to')
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('vw_landing_conversion_daily')
    .select('*')
    .gte('day', from).lte('day', to)
    .order('day', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: Componente `LandingConversionTable.tsx` análogo a `CampaignBreakdown`**

- [ ] **Step 3: Agregar sección "Conversión landing" al dashboard de métricas**

---

# FASE 8 — QA end-to-end y dogfooding

### Task 8.1: Checklist de validación funcional

- [ ] **Email diferenciado clase gratuita** — Disparar webhook GHL de "CLASE PROPIETARIOS"; verificar que llega solo email "Nuevo registro a clase gratuita", NO "Tasación agendada".
- [ ] **Email solicitud tasación** — Disparar webhook GHL de "TASACIÓN DIRECTA"; verificar que llega solo "Nueva tasación asignada / agendada".
- [ ] **Fechas granulares** — Mover un deal por todos los stages (request → scheduled → visited → appraisal_sent → captured) y verificar que cada columna `*_at` queda poblada en el orden correcto.
- [ ] **Historia de stages** — Verificar `SELECT * FROM deal_stage_history WHERE deal_id = '<x>'` retorna una fila por cada transición.
- [ ] **Dashboard** — Probar todos los presets de fecha; verificar que números cuadran con queries SQL directas (`SELECT count(*) FROM deals WHERE captured_at::date = '2026-05-17'`).
- [ ] **Reporte diario** — Disparar manualmente `/api/cron/daily-report?date=2026-05-17`; abrir el HTML en navegador y validar formato tabla Excel.
- [ ] **Reporte semanal** — Idem para `/api/cron/weekly-report`.
- [ ] **Reporte mensual** — Idem.
- [ ] **Tracking landing** — Visitar `/p/<slug>?utm_campaign=test` y verificar fila en `landing_page_visits`.
- [ ] **Conversión landing** — Insertar manualmente 10 visitas + 3 registros del mismo funnel_type+día y verificar que `vw_landing_conversion_daily` muestra 30% conversión.

### Task 8.2: Documentación

**Files:**
- Modify: `CLAUDE.md` (raíz)

- [ ] **Step 1: Agregar sección "Sistema de métricas"** explicando:
  - Tablas: `deals` (con `*_at`), `deal_stage_history`, `landing_page_visits`
  - Vistas: `vw_funnel_daily`, `vw_meta_ads_funnel_daily`, `vw_landing_conversion_daily`
  - RPCs: `get_funnel_metrics`, `get_meta_funnel_by_campaign`, `get_funnel_metrics_by_day`
  - Endpoints: `/api/metrics/*`
  - Reportes scheduled: diario / semanal / mensual via Netlify functions

- [ ] **Step 2: Actualizar memoria del proyecto** con:
  - `metrics_system.md`: arquitectura del sistema de métricas
  - Actualizar `MEMORY.md` con pointer a `metrics_system.md`

### Task 8.3: Cierre

- [ ] **Step 1: Crear PR draft con todas las fases**
- [ ] **Step 2: Smoke test final en Netlify deploy preview**
- [ ] **Step 3: Anunciar al usuario** que llegará el primer reporte diario al día siguiente. Sugerir validar el primero antes de habilitar reportes semanales/mensuales.

---

## Auto-revisión del plan

**Cobertura del spec (lo que pidió el usuario):**

| Requisito | Task que lo cubre |
|---|---|
| Clics + CTR + registros + costo/registro por campaña | Task 3.1 (vw_meta_ads_funnel_daily) + 4.5 + 5.5 |
| Diferenciación clase gratuita vs tasación | Vista 3.1 con `funnel_type` + Task 1.* (emails) |
| Visitas landing por campaña + % conversión | Fase 7 completa |
| Solicitudes de tasación (limpio, sin clase gratuita) | Task 2.1 (origin) + Task 1.4 (emails) |
| Tasaciones agendadas | Task 2.1 (scheduled_at) + 3.1 |
| Visitas realizadas | Task 2.1 (visited_at) + 3.1 |
| Tasaciones entregadas | Task 2.1 (delivered_at) + 3.1 |
| Captaciones | Task 2.1 (captured_at) + 3.1 |
| Filtro por fecha en dashboard | Task 5.2 (DateRangePicker) |
| Reporte diario formato tabla Excel | Task 6.1 + 6.2 |
| Reporte semanal formato tabla Excel | Task 6.3 |
| Reporte mensual formato tabla Excel | Task 6.3 |
| Bug fix email tasación al registrarse a clase gratuita | Fase 1 completa |
| Audit completo de plataforma | Hecho antes de redactar este plan |

**Sin gaps detectados.**

**Type consistency:** `FunnelMetrics` se define en `lib/metrics/types.ts` (Task 4.1), usado consistentemente en Tasks 4.2, 4.3, 4.4, 5.4, 5.6, 6.2. `CampaignFunnelRow` idem en Tasks 4.1, 4.2, 5.5, 5.6.

**Placeholders:** ninguno detectado.

---

## Riesgos y mitigaciones

1. **Backfill de fechas granulares puede ser impreciso** (solo el último `stage_changed_at` está; transiciones intermedias se perdieron). **Mitigación:** documentar que las métricas históricas anteriores a esta migración son aproximadas, y que a partir del deploy son exactas.
2. **Clasificación de campañas Meta por nombre es heurística.** **Mitigación:** Task 3.1 nota la alternativa de agregar columna explícita; si la heurística falla, agregar columna `funnel_type` editable en `meta_ads_daily`.
3. **`report_settings.recipients`** podría no incluir a Diego. **Mitigación:** Task 6.4 pide confirmación antes de ejecutar UPDATE.
4. **Migración 20260518000002 incluye trigger que modifica filas** — verificar que no genera conflicto con código que ya escribe directamente a `scheduled_at`/`captured_at` (no debería existir, pero auditar).
5. **Performance del dashboard con rangos largos** — las vistas tienen índices apropiados, pero rangos > 90 días podrían ser lentos. **Mitigación:** si surge problema, materializar `vw_funnel_daily` con refresh nocturno.
