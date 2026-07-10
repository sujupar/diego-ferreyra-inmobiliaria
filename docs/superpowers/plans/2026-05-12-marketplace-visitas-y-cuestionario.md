# Marketplace de Propiedades + Sistema de Visitas + Cuestionario Post-Visita — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la sección de Propiedades en un **marketplace interno tipo Habi** con vista grid por defecto, modal portal-inmobiliario, sistema completo de agendamiento de visitas (con email al cliente), tracking con recordatorios automáticos al asesor, y cuestionario post-visita respondible por el cliente vía link público. Además: garantizar que toda la información del flujo `scheduled_appraisal → deal → appraisal → property` quede visible en cada etapa y se pre-llene al captar la propiedad.

**Architecture:**
- Backend: nuevas tablas `property_visits` y `visit_questionnaires` + tokens públicos. Migraciones SQL idempotentes en `supabase/migrations/`. APIs en `app/api/`. Resend para emails. Cron (Netlify Scheduled Function o Supabase pg_cron) para recordatorios.
- Frontend: refactor `app/(dashboard)/properties/page.tsx` para sumar viewMode `grid` (default); nuevo `PropertyDetailModal` portal-style; nueva ruta `/visits`; ruta pública sin auth `/questionnaire/[token]`.
- Permisos: TODOS los asesores ven TODAS las propiedades (badge "Mía" + filtro toggle). Quitar el filtro server-side por `assigned_to` en `/api/properties` para rol `asesor`. RLS revisada en migración.
- Datos compartidos del flujo: `scheduled_appraisals.scheduling_notes`, `deals.visit_data` (ya existe), `appraisals.valuation_result` (ya existe) — se exponen en cada vista del proceso y se pre-llenan al crear `properties`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Supabase (Postgres + RLS), Tailwind 4 + shadcn/ui, Resend (templates con `@react-email/components`), `lucide-react`, `sonner` (toasts), `zod` (validación), `date-fns` (formato), nativo `<input type="datetime-local">` para pickers simples + un calendar shadcn donde haga falta.

---

## Fases independientes (cada una mergeable y testeable por separado)

| Fase | Título | PR sugerido | Depende de |
|------|--------|-------------|------------|
| 1 | Visibilidad del proceso + pre-fill al captar | `feat(flow): visibility-and-prefill` | nada |
| 2 | Marketplace grid + ownership color + filtro "mías" | `feat(properties): grid-marketplace-view` | nada |
| 3 | PropertyDetailModal portal-style | `feat(properties): detail-modal-portal` | Fase 2 (tarea 2.3) |
| 4 | Property visits — schema + agendamiento + email cliente | `feat(visits): scheduling-and-email` | Fase 3 |
| 5 | Visits dashboard + recordatorios cron + completion | `feat(visits): tracking-and-reminders` | Fase 4 |
| 6 | Cuestionario post-visita (interno + link público al cliente) | `feat(visits): post-visit-questionnaire` | Fase 5 |

---

## File Structure

### Crear

```
supabase/migrations/
  20260513000000_scheduled_appraisals_notes.sql
  20260513000001_property_visits_schema.sql
  20260513000002_visit_questionnaires_schema.sql
  20260513000003_properties_rls_marketplace.sql

app/(dashboard)/properties/
  _components/
    PropertyCard.tsx           # Card del grid
    PropertyDetailModal.tsx    # Modal portal-style
    PropertyGallery.tsx        # Galería con thumbs + lightbox
    OwnershipBadge.tsx
    ScheduleVisitDialog.tsx    # Dialog con form + datetime picker

app/(dashboard)/visits/
  page.tsx                     # Listado con filtros (asesor/propiedad/status/fecha)
  [id]/page.tsx                # Detalle de visita + cuestionario
  _components/
    VisitsTable.tsx
    VisitFiltersBar.tsx
    CompleteVisitDialog.tsx    # "¿Se realizó?" + cuestionario inline
    QuestionnaireForm.tsx      # Reusable: interno o público

app/questionnaire/[token]/
  page.tsx                     # Pública, SIN auth
  thanks/page.tsx              # Confirmación post-submit
  not-found.tsx

app/api/visits/
  route.ts                     # GET (listar) POST (crear)
  [id]/route.ts                # GET PUT DELETE
  [id]/complete/route.ts       # POST marca completed + persiste cuestionario interno
  [id]/send-questionnaire/route.ts  # POST genera token + envía email

app/api/public/questionnaire/[token]/
  route.ts                     # GET datos + POST respuesta

app/api/cron/visit-reminders/route.ts  # GET, llamado por Netlify Scheduled Function

netlify/functions/
  visit-reminders.ts           # Scheduled function que pega a /api/cron/visit-reminders

lib/supabase/
  visits.ts                    # CRUD property_visits
  visit-questionnaires.ts      # CRUD questionnaires + token mgmt
  scheduled-appraisals.ts      # Extraer lógica de contacts.ts (solo lectura por ahora)

lib/email/notifications/
  visit-scheduled-client.ts    # email al cliente: cita agendada
  visit-reminder-advisor.ts    # email al asesor: ¿se realizó?
  questionnaire-invite-client.ts  # email al cliente: respondé el cuestionario

emails/
  VisitScheduledClientEmail.tsx
  VisitReminderAdvisorEmail.tsx
  QuestionnaireInviteClientEmail.tsx

components/forms/
  DateTimePicker.tsx           # wrapper shadcn (input datetime-local con shadcn styling)

types/
  visits.types.ts              # Visit, VisitStatus, Questionnaire, QuestionnaireResponse
```

### Modificar

```
app/(dashboard)/properties/page.tsx
  - sumar viewMode 'grid' (default)
  - quitar filtro server-side por assigned_to (rol asesor ve todas)
  - sumar filtro toggle "Solo mías"
  - importar PropertyCard

app/api/properties/route.ts
  - quitar branch `if asesor → filter assigned_to`
  - aceptar query param `only_mine=true` que SÍ filtra

app/(dashboard)/properties/[id]/page.tsx
  - agregar bloque "Información del flujo": scheduled_appraisal + visit_data + appraisal
  - botón "Agendar visita" arriba

app/(dashboard)/properties/new/page.tsx
  - aceptar query param `from_appraisal_id` o `from_scheduled_id`
  - pre-llenar formulario con datos de esa fuente

app/(dashboard)/scheduled-appraisals/[id]/page.tsx (si existe, si no se crea)
  - mostrar TODO: agendamiento + visit_data del deal + appraisal asociada

app/(dashboard)/appraisals/[id]/page.tsx
  - sumar bloque "Información de la visita previa" leyendo deal.visit_data

app/(dashboard)/layout.tsx
  - sumar link "Visitas" en sidebar

lib/supabase/middleware.ts
  - sumar `/questionnaire` a PUBLIC_ROUTES

lib/supabase/properties.ts
  - aceptar opcional from_appraisal/from_scheduled en createProperty para pre-fill server-side

types/database.types.ts
  - regenerar tras cada migración (npx supabase gen types)
```

---

# FASE 1 — Visibilidad del proceso + pre-fill al captar

**Objetivo:** Que cada vista del flujo (`scheduled_appraisal → deal → appraisal → property`) muestre toda la info acumulada, y que crear una `property` desde una `appraisal` pre-llene el formulario.

## Task 1.1: Sumar columnas para visibilidad del flujo

Tres cambios de schema necesarios:
1. `scheduled_appraisals.scheduling_notes` (TEXT) — notas libres al agendar.
2. `scheduled_appraisals.buyer_interest` (JSONB) — datos del cliente comprador interesado.
3. `deals.scheduled_appraisal_id` (UUID FK) — **no existe hoy**, sin esto las queries de FlowHistoryCard y de pre-fill fallan en runtime.

**Files:**
- Create: `supabase/migrations/20260513000000_scheduled_appraisals_notes.sql`

- [ ] **Step 1: Escribir migración**

```sql
-- Sumar campos de notas al agendar y datos pre-visita del cliente comprador.
ALTER TABLE scheduled_appraisals
  ADD COLUMN IF NOT EXISTS scheduling_notes TEXT,
  ADD COLUMN IF NOT EXISTS buyer_interest JSONB;

COMMENT ON COLUMN scheduled_appraisals.scheduling_notes IS
  'Notas libres al agendar la tasación (motivo de venta, urgencia, horarios preferidos, etc.)';
COMMENT ON COLUMN scheduled_appraisals.buyer_interest IS
  'Si el cliente además quiere comprar: {zona, presupuesto_min, presupuesto_max, ambientes_min, notas}';

-- FK explícita deals → scheduled_appraisals para joins limpios (no existía).
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS scheduled_appraisal_id UUID
    REFERENCES scheduled_appraisals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_scheduled_appraisal_id
  ON deals(scheduled_appraisal_id);

COMMENT ON COLUMN deals.scheduled_appraisal_id IS
  'FK al agendamiento original cuando el deal nace de una tasación agendada';
```

- [ ] **Step 2: Aplicar en Supabase Dashboard**

Pegar el contenido del archivo en SQL Editor → Run. Verificar con:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='scheduled_appraisals' AND column_name IN ('scheduling_notes','buyer_interest');
-- Expected: 2 filas

SELECT column_name FROM information_schema.columns
WHERE table_name='deals' AND column_name='scheduled_appraisal_id';
-- Expected: 1 fila
```

- [ ] **Step 3: Regenerar tipos**

```bash
npx supabase gen types typescript --project-id <project_id> > types/database.types.ts
```

Si Supabase CLI no conecta (gotcha conocida en este proyecto), editar manualmente `types/database.types.ts`:

En el tipo `scheduled_appraisals.Row` (y `.Insert`, `.Update`):
```ts
scheduling_notes: string | null
buyer_interest: Json | null
```

En el tipo `deals.Row` (y `.Insert`, `.Update`):
```ts
scheduled_appraisal_id: string | null
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513000000_scheduled_appraisals_notes.sql types/database.types.ts
git commit -m "feat(flow): notas al agendar, interés de compra, FK deal→scheduled_appraisal"
```

---

## Task 1.2: Extraer `lib/supabase/scheduled-appraisals.ts`

Hoy la lógica vive embebida en `contacts.ts`. Extraer para reuso limpio.

**Files:**
- Create: `lib/supabase/scheduled-appraisals.ts`

- [ ] **Step 1: Crear el módulo**

```ts
// lib/supabase/scheduled-appraisals.ts
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type Row = Database['public']['Tables']['scheduled_appraisals']['Row']

export interface ScheduledAppraisalDetail extends Row {
  contact: {
    id: string
    full_name: string
    phone: string | null
    email: string | null
  } | null
  appraisal: {
    id: string
    property_title: string | null
    valuation_result: unknown
  } | null
}

export async function getScheduledAppraisal(id: string): Promise<ScheduledAppraisalDetail | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scheduled_appraisals')
    .select(`
      *,
      contact:contacts(id, full_name, phone, email),
      appraisal:appraisals(id, property_title, valuation_result)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[getScheduledAppraisal]', error)
    return null
  }
  return data as ScheduledAppraisalDetail | null
}

export async function listScheduledAppraisals(opts: {
  assignedTo?: string
  status?: 'scheduled' | 'completed' | 'cancelled'
} = {}) {
  const supabase = await createClient()
  let q = supabase
    .from('scheduled_appraisals')
    .select('*, contact:contacts(id, full_name, phone, email)')
    .order('scheduled_date', { ascending: false })

  if (opts.assignedTo) q = q.eq('assigned_to', opts.assignedTo)
  if (opts.status) q = q.eq('status', opts.status)

  const { data, error } = await q
  if (error) {
    console.error('[listScheduledAppraisals]', error)
    return []
  }
  return data
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/scheduled-appraisals.ts
git commit -m "refactor(scheduled-appraisals): extraer módulo dedicado"
```

---

## Task 1.3: Vista de detalle de `scheduled_appraisal` con info completa

Si la página `app/(dashboard)/scheduled-appraisals/[id]/page.tsx` no existe, crearla. Si existe, modificarla para mostrar:

1. Datos del agendamiento (fecha, hora, dirección, notas, contacto)
2. Datos del comprador interesado (`buyer_interest`) si aplica
3. Datos de la visita realizada (`deal.visit_data`) si ya se hizo
4. Link al appraisal si existe

**Files:**
- Create or Modify: `app/(dashboard)/scheduled-appraisals/[id]/page.tsx`

- [ ] **Step 1: Verificar si existe la página**

```bash
ls "app/(dashboard)/scheduled-appraisals/" 2>/dev/null
```

- [ ] **Step 2: Escribir la página (Server Component)**

```tsx
// app/(dashboard)/scheduled-appraisals/[id]/page.tsx
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getScheduledAppraisal } from '@/lib/supabase/scheduled-appraisals'
import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export default async function ScheduledAppraisalDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const item = await getScheduledAppraisal(id)
  if (!item) notFound()

  const supabase = await createClient()
  const { data: deal } = await supabase
    .from('deals')
    .select('id, visit_data, visit_completed_at, property_type, neighborhood, rooms, covered_area')
    .eq('scheduled_appraisal_id', id)
    .maybeSingle()

  const buyer = (item.buyer_interest as Record<string, unknown> | null) ?? null

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{item.property_address}</h1>
          <p className="text-muted-foreground text-sm">
            Agendada: {new Date(`${item.scheduled_date}T${item.scheduled_time ?? '00:00'}`).toLocaleString('es-AR')}
          </p>
        </div>
        <Badge>{item.status}</Badge>
      </header>

      <section className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Contacto</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p><strong>Nombre:</strong> {item.contact?.full_name}</p>
            <p><strong>Tel:</strong> {item.contact?.phone ?? '-'}</p>
            <p><strong>Email:</strong> {item.contact?.email ?? '-'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Notas al agendar</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">
            {item.scheduling_notes || <span className="text-muted-foreground">Sin notas</span>}
          </CardContent>
        </Card>

        {buyer && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Interés de compra del cliente</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1">
              <p><strong>Zona buscada:</strong> {String(buyer.zona ?? '-')}</p>
              <p><strong>Presupuesto:</strong> USD {String(buyer.presupuesto_min ?? '?')} - {String(buyer.presupuesto_max ?? '?')}</p>
              <p><strong>Ambientes mínimos:</strong> {String(buyer.ambientes_min ?? '-')}</p>
              <p><strong>Notas:</strong> {String(buyer.notas ?? '-')}</p>
            </CardContent>
          </Card>
        )}

        {deal?.visit_data && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Datos relevados en la visita</CardTitle>
              <p className="text-xs text-muted-foreground">
                Visita completada {deal.visit_completed_at ? new Date(deal.visit_completed_at).toLocaleString('es-AR') : ''}
              </p>
            </CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-96">
                {JSON.stringify(deal.visit_data, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {item.appraisal && (
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Tasación realizada</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-sm">{item.appraisal.property_title}</p>
              <Button asChild>
                <Link href={`/appraisals/${item.appraisal.id}`}>Ver tasación</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
```

> **Nota integración:** el campo `deals.scheduled_appraisal_id` puede no existir. Verificar con:
> ```sql
> SELECT column_name FROM information_schema.columns WHERE table_name='deals' AND column_name LIKE 'scheduled%';
> ```
> Si no existe, usar el join correcto que sí existe (probablemente `deals.contact_id` + filtro por fecha). Inspeccionar `lib/supabase/contacts.ts` para confirmar el join real y adaptar.

- [ ] **Step 3: Verificación manual**

Abrir un scheduled_appraisal en el browser. Confirmar que muestra los 4 bloques cuando corresponde.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/scheduled-appraisals/[id]/page.tsx"
git commit -m "feat(scheduled-appraisals): vista detalle con info completa del flujo"
```

---

## Task 1.4: Bloque "Info del flujo" en detalle de Property y de Appraisal

Mostrar en la vista de propiedad lo que viene del scheduled_appraisal + deal.visit_data + appraisal — así el asesor que abre una propiedad ve TODO el historial.

**Files:**
- Modify: `app/(dashboard)/properties/[id]/page.tsx`
- Modify: `app/(dashboard)/appraisals/[id]/page.tsx`
- Create: `app/(dashboard)/_components/FlowHistoryCard.tsx` (reusable)

- [ ] **Step 1: Crear componente reusable**

```tsx
// app/(dashboard)/_components/FlowHistoryCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

interface FlowItem {
  label: string
  value: React.ReactNode
}

interface Props {
  title: string
  scheduledAppraisalId?: string
  appraisalId?: string
  schedulingNotes?: string | null
  buyerInterest?: Record<string, unknown> | null
  visitData?: Record<string, unknown> | null
  visitCompletedAt?: string | null
}

export function FlowHistoryCard(props: Props) {
  const items: FlowItem[] = []
  if (props.schedulingNotes) items.push({ label: 'Notas al agendar', value: props.schedulingNotes })
  if (props.buyerInterest) items.push({ label: 'Interés de compra', value: <pre className="text-xs bg-muted p-2 rounded">{JSON.stringify(props.buyerInterest, null, 2)}</pre> })
  if (props.visitData) items.push({ label: 'Datos relevados en visita', value: <pre className="text-xs bg-muted p-2 rounded max-h-64 overflow-auto">{JSON.stringify(props.visitData, null, 2)}</pre> })

  if (items.length === 0 && !props.scheduledAppraisalId && !props.appraisalId) return null

  return (
    <Card>
      <CardHeader><CardTitle>{props.title}</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {items.map(it => (
          <div key={it.label}>
            <p className="font-medium text-xs uppercase text-muted-foreground">{it.label}</p>
            <div className="mt-1">{it.value}</div>
          </div>
        ))}
        <div className="flex gap-3 pt-2 border-t">
          {props.scheduledAppraisalId && (
            <Link className="text-primary underline" href={`/scheduled-appraisals/${props.scheduledAppraisalId}`}>
              Ver agendamiento original →
            </Link>
          )}
          {props.appraisalId && (
            <Link className="text-primary underline" href={`/appraisals/${props.appraisalId}`}>
              Ver tasación →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Modificar `properties/[id]/page.tsx` para sumar el bloque**

En la página de detalle, en el Server Component, agregar antes del render:

```tsx
// dentro de PropertyDetailPage server component, después de cargar property:
const supabase = await createClient()
const { data: appraisal } = property.appraisal_id
  ? await supabase
      .from('appraisals')
      .select('id, valuation_result')
      .eq('id', property.appraisal_id)
      .maybeSingle()
  : { data: null }

const { data: deal } = property.contact_id
  ? await supabase
      .from('deals')
      .select('id, visit_data, visit_completed_at, scheduled_appraisal_id')
      .eq('contact_id', property.contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  : { data: null }

const { data: scheduledAppraisal } = deal?.scheduled_appraisal_id
  ? await supabase
      .from('scheduled_appraisals')
      .select('id, scheduling_notes, buyer_interest')
      .eq('id', deal.scheduled_appraisal_id)
      .maybeSingle()
  : { data: null }
```

Y en el JSX, antes de los demás cards:

```tsx
<FlowHistoryCard
  title="Información del proceso"
  scheduledAppraisalId={scheduledAppraisal?.id}
  appraisalId={appraisal?.id}
  schedulingNotes={scheduledAppraisal?.scheduling_notes}
  buyerInterest={scheduledAppraisal?.buyer_interest as Record<string, unknown> | null}
  visitData={deal?.visit_data as Record<string, unknown> | null}
  visitCompletedAt={deal?.visit_completed_at}
/>
```

- [ ] **Step 3: Hacer lo análogo en `appraisals/[id]/page.tsx`**

Inyectar el mismo `FlowHistoryCard` arriba del detalle. Mismo patrón de consulta.

- [ ] **Step 4: Verificación manual**

1. Abrir una `property` que viene de un flujo completo. Verificar que aparece "Información del proceso" con los 3 bloques poblados.
2. Abrir una `appraisal` y verificar lo mismo.
3. Abrir una `property` creada from scratch (sin flow): el bloque debe NO renderizar (o renderizar vacío sin romper).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/_components/FlowHistoryCard.tsx" "app/(dashboard)/properties/[id]/page.tsx" "app/(dashboard)/appraisals/[id]/page.tsx"
git commit -m "feat(flow): bloque 'info del proceso' visible en property y appraisal"
```

---

## Task 1.5: Pre-fill de `properties/new` desde `appraisal` o `scheduled_appraisal`

Cuando el asesor convierte una tasación en captación, los datos deben venir pre-llenados.

**Files:**
- Modify: `app/(dashboard)/properties/new/page.tsx`
- Modify: `lib/supabase/properties.ts` (helper de pre-fill)

- [ ] **Step 1: Inspeccionar el form actual**

```bash
head -200 "app/(dashboard)/properties/new/page.tsx"
```

Identificar nombres de campos (probablemente: `address`, `neighborhood`, `rooms`, `covered_area`, `asking_price`, `property_type`).

- [ ] **Step 2: Crear helper `getPropertyPrefill`**

```ts
// lib/supabase/properties.ts — al final del archivo
import { createClient as createServerClient } from '@/lib/supabase/server'

export interface PropertyPrefill {
  address?: string | null
  neighborhood?: string | null
  property_type?: string | null
  rooms?: number | null
  covered_area?: number | null
  asking_price?: number | null
  appraisal_id?: string | null
  contact_id?: string | null
}

export async function getPropertyPrefill(opts: {
  appraisalId?: string
  scheduledAppraisalId?: string
}): Promise<PropertyPrefill> {
  const supabase = await createServerClient()
  const result: PropertyPrefill = {}

  if (opts.appraisalId) {
    const { data: ap } = await supabase
      .from('appraisals')
      .select('id, contact_id, property_title, valuation_result')
      .eq('id', opts.appraisalId)
      .maybeSingle()
    if (ap) {
      result.appraisal_id = ap.id
      result.contact_id = ap.contact_id
      const vr = ap.valuation_result as Record<string, unknown> | null
      if (vr) {
        result.address = (vr.address as string) ?? result.address
        result.neighborhood = (vr.neighborhood as string) ?? result.neighborhood
        result.rooms = (vr.rooms as number) ?? result.rooms
        result.covered_area = (vr.coveredArea as number) ?? result.covered_area
        result.asking_price = (vr.publicationPrice as number) ?? result.asking_price
      }
    }
  }

  if (opts.scheduledAppraisalId) {
    const { data: sa } = await supabase
      .from('scheduled_appraisals')
      .select('property_address, contact_id')
      .eq('id', opts.scheduledAppraisalId)
      .maybeSingle()
    if (sa) {
      result.address ??= sa.property_address
      result.contact_id ??= sa.contact_id
    }

    const { data: deal } = await supabase
      .from('deals')
      .select('property_type, neighborhood, rooms, covered_area')
      .eq('scheduled_appraisal_id', opts.scheduledAppraisalId)
      .maybeSingle()
    if (deal) {
      result.property_type ??= deal.property_type
      result.neighborhood ??= deal.neighborhood
      result.rooms ??= deal.rooms
      result.covered_area ??= deal.covered_area
    }
  }

  return result
}
```

- [ ] **Step 3: Convertir `properties/new/page.tsx` para aceptar query params**

Estructura: Page (Server) carga prefill → pasa a Client form.

```tsx
// app/(dashboard)/properties/new/page.tsx
import { getPropertyPrefill, type PropertyPrefill } from '@/lib/supabase/properties'
import { NewPropertyForm } from './_components/NewPropertyForm'

export default async function NewPropertyPage({
  searchParams,
}: {
  searchParams: Promise<{ from_appraisal_id?: string; from_scheduled_id?: string }>
}) {
  const sp = await searchParams
  const prefill: PropertyPrefill = (sp.from_appraisal_id || sp.from_scheduled_id)
    ? await getPropertyPrefill({
        appraisalId: sp.from_appraisal_id,
        scheduledAppraisalId: sp.from_scheduled_id,
      })
    : {}

  return <NewPropertyForm prefill={prefill} />
}
```

Y en `NewPropertyForm` (extraer del actual page.tsx si no está separado), aceptar prop `prefill` e inicializar `useState` con esos valores:

```tsx
const [form, setForm] = useState<PropertyInput>({
  address: prefill.address ?? '',
  neighborhood: prefill.neighborhood ?? '',
  property_type: prefill.property_type ?? '',
  rooms: prefill.rooms ?? 0,
  covered_area: prefill.covered_area ?? 0,
  asking_price: prefill.asking_price ?? 0,
  appraisal_id: prefill.appraisal_id ?? null,
  contact_id: prefill.contact_id ?? null,
  // ... resto con defaults
})
```

- [ ] **Step 4: Sumar botón "Captar como propiedad" en `appraisals/[id]/page.tsx`**

```tsx
<Button asChild>
  <Link href={`/properties/new?from_appraisal_id=${appraisal.id}`}>
    Captar como propiedad
  </Link>
</Button>
```

Y análogo en `scheduled-appraisals/[id]/page.tsx`:

```tsx
<Button asChild>
  <Link href={`/properties/new?from_scheduled_id=${item.id}`}>
    Captar como propiedad
  </Link>
</Button>
```

- [ ] **Step 5: Verificación manual**

1. Ir a una appraisal completada → click "Captar como propiedad".
2. Confirmar que el form viene pre-llenado con address, neighborhood, rooms, area, price.
3. Guardar y verificar que la property creada tiene `appraisal_id` y `contact_id` enlazados.

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/properties.ts "app/(dashboard)/properties/new/" "app/(dashboard)/appraisals/[id]/page.tsx" "app/(dashboard)/scheduled-appraisals/[id]/page.tsx"
git commit -m "feat(properties): pre-fill al captar desde tasación o agendamiento"
```

---

# FASE 2 — Marketplace grid + ownership color + filtro "mías"

**Objetivo:** Default = vista grid tipo cards portal inmobiliario. Toggle a list/table. TODOS los asesores ven TODAS las propiedades. Las propiedades del asesor logueado tienen un badge "Mía" + borde de color. Filtro chip "Solo mías" para colapsar.

## Task 2.0: Migración RLS marketplace para `properties`

**Critical**: la RLS actual en `20260505000001_rls_per_role_safe.sql:183` restringe SELECT a `assigned_to = auth.uid() OR is_operations_user() OR is_lawyer()`. Sin esta migración, quitar el filtro client-side en Task 2.1 hace que asesores reciban array vacío del servidor.

**Files:**
- Create: `supabase/migrations/20260513000003_properties_rls_marketplace.sql`

- [ ] **Step 1: Migración**

```sql
-- Marketplace: cualquier usuario autenticado lee todas las propiedades.
-- La distinción "mías vs todas" se hace en UI (badge + filtro), no en RLS.

DROP POLICY IF EXISTS properties_select_owner_ops_or_lawyer ON properties;
DROP POLICY IF EXISTS properties_select ON properties;

CREATE POLICY properties_select_all_authenticated ON properties
  FOR SELECT TO authenticated
  USING (true);

-- Las policies de INSERT/UPDATE/DELETE NO se tocan — siguen restringidas por rol/ownership.
```

- [ ] **Step 2: Aplicar en Supabase Dashboard y verificar**

```sql
SELECT polname, polcmd FROM pg_policy
WHERE polrelid = 'properties'::regclass AND polcmd = 'r';
-- Expected: solo `properties_select_all_authenticated`
```

Luego login como asesor (no admin) y verificar via SQL:
```sql
-- ejecutar como ese usuario via supabase impersonation
SELECT count(*) FROM properties;
-- Expected: count completo del schema, no solo asignadas
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513000003_properties_rls_marketplace.sql
git commit -m "feat(properties): RLS marketplace - todos los asesores leen todas"
```

---

## Task 2.1: Quitar filtro server-side por asesor

**Files:**
- Modify: `app/(dashboard)/properties/page.tsx` (líneas 71-79)
- Modify: `app/api/properties/route.ts`

- [ ] **Step 1: Eliminar el filtro en el client**

En `app/(dashboard)/properties/page.tsx` líneas 71-79, **quitar**:
```ts
if (userInfo?.role === 'asesor') params.set('assigned_to', userInfo.id)
```
(las dos ocurrencias: en el `useEffect` y en `refreshProperties`).

- [ ] **Step 2: Sumar query param `only_mine` opcional**

```ts
const [onlyMine, setOnlyMine] = useState(false)
// ...
useEffect(() => {
  const params = new URLSearchParams()
  if (filterStatus) params.set('status', filterStatus)
  if (dateRange.from) params.set('from', dateRange.from)
  if (dateRange.to) params.set('to', dateRange.to)
  if (onlyMine && userInfo?.id) params.set('assigned_to', userInfo.id)
  // ...
}, [filterStatus, dateRange, userInfo, onlyMine])
```

- [ ] **Step 3: Asegurar que el endpoint respeta `assigned_to` opcional**

Abrir `app/api/properties/route.ts`. Confirmar (o agregar):

```ts
const assignedTo = searchParams.get('assigned_to')
if (assignedTo) query = query.eq('assigned_to', assignedTo)
```

**No** forzar filtro por rol asesor. Solo aplicar si viene en query.

- [ ] **Step 4: Verificación**

Login como asesor (no admin), ir a `/properties`. Confirmar que ahora se ven propiedades de otros asesores.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/properties/page.tsx" app/api/properties/route.ts
git commit -m "feat(properties): asesores ven todas las propiedades + filtro 'solo mías'"
```

---

## Task 2.2: Componente `PropertyCard` para el grid

**Files:**
- Create: `app/(dashboard)/properties/_components/PropertyCard.tsx`
- Create: `app/(dashboard)/properties/_components/OwnershipBadge.tsx`

- [ ] **Step 1: OwnershipBadge**

```tsx
// app/(dashboard)/properties/_components/OwnershipBadge.tsx
'use client'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'

export function OwnershipBadge({ isMine }: { isMine: boolean }) {
  if (!isMine) return null
  return (
    <Badge className="bg-amber-500 hover:bg-amber-600 text-white gap-1">
      <Star className="size-3 fill-current" />
      Mía
    </Badge>
  )
}
```

- [ ] **Step 2: PropertyCard**

```tsx
// app/(dashboard)/properties/_components/PropertyCard.tsx
'use client'
import Image from 'next/image'
import { MapPin, Bed, Bath, Square } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { OwnershipBadge } from './OwnershipBadge'
import { cn } from '@/lib/utils'

export interface PropertyCardData {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  asking_price: number
  currency: string
  status: string
  photos: string[]
  rooms?: number | null
  bathrooms?: number | null
  covered_area?: number | null
  assigned_to?: string | null
}

interface Props {
  property: PropertyCardData
  currentUserId?: string
  statusInfo: { label: string; color: string }
  onClick: () => void
}

function formatCurrency(v: number, c: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}

export function PropertyCard({ property, currentUserId, statusInfo, onClick }: Props) {
  const isMine = !!currentUserId && property.assigned_to === currentUserId
  const hero = property.photos?.[0]

  return (
    <Card
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={cn(
        'group cursor-pointer overflow-hidden transition-all hover:shadow-lg',
        isMine && 'ring-2 ring-amber-400'
      )}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {hero ? (
          <Image
            src={hero}
            alt={property.address}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Sin foto
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge className={cn('text-white', statusInfo.color)}>{statusInfo.label}</Badge>
        </div>
        <div className="absolute top-2 right-2">
          <OwnershipBadge isMine={isMine} />
        </div>
      </div>

      <CardContent className="p-3 space-y-2">
        <p className="text-lg font-semibold tracking-tight">
          {formatCurrency(property.asking_price, property.currency)}
        </p>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{property.neighborhood}, {property.city}</span>
        </div>
        <p className="text-sm font-medium truncate">{property.address}</p>
        <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t">
          {property.rooms != null && (
            <span className="flex items-center gap-1"><Bed className="size-3" /> {property.rooms}</span>
          )}
          {property.bathrooms != null && (
            <span className="flex items-center gap-1"><Bath className="size-3" /> {property.bathrooms}</span>
          )}
          {property.covered_area != null && (
            <span className="flex items-center gap-1"><Square className="size-3" /> {property.covered_area}m²</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/properties/_components/PropertyCard.tsx" "app/(dashboard)/properties/_components/OwnershipBadge.tsx"
git commit -m "feat(properties): PropertyCard component para vista grid"
```

---

## Task 2.3: Integrar grid en `properties/page.tsx` como default

**Files:**
- Modify: `app/(dashboard)/properties/page.tsx`

- [ ] **Step 1: Sumar 'grid' al viewMode**

Cambiar la línea:
```ts
const [viewMode, setViewMode] = useState<'list' | 'table'>('table')
```
por:
```ts
const [viewMode, setViewMode] = useState<'grid' | 'list' | 'table'>('grid')
```

- [ ] **Step 2: Persistir preferencia en localStorage**

```ts
useEffect(() => {
  const saved = localStorage.getItem('propertiesViewMode') as 'grid' | 'list' | 'table' | null
  if (saved) setViewMode(saved)
}, [])
useEffect(() => {
  localStorage.setItem('propertiesViewMode', viewMode)
}, [viewMode])
```

- [ ] **Step 3: Agregar toggle de vista + filtro "Solo mías"**

En el bloque de filtros superior, sumar 3 botones para viewMode y un Toggle de "Solo mías":

```tsx
import { LayoutGrid, LayoutList, Table2 } from 'lucide-react'

// dentro del JSX, junto a los filtros:
<div className="flex items-center gap-2">
  <Button size="sm" variant={viewMode === 'grid' ? 'default' : 'outline'} onClick={() => setViewMode('grid')}>
    <LayoutGrid className="size-4" />
  </Button>
  <Button size="sm" variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}>
    <LayoutList className="size-4" />
  </Button>
  <Button size="sm" variant={viewMode === 'table' ? 'default' : 'outline'} onClick={() => setViewMode('table')}>
    <Table2 className="size-4" />
  </Button>
</div>

<Button size="sm" variant={onlyMine ? 'default' : 'outline'} onClick={() => setOnlyMine(!onlyMine)}>
  {onlyMine ? '✓ Solo mías' : 'Solo mías'}
</Button>
```

- [ ] **Step 4: Renderizar el grid**

Después del bloque de filtros, antes de los renders existentes de list/table:

```tsx
{!loading && viewMode === 'grid' && (
  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {properties.map(p => (
      <PropertyCard
        key={p.id}
        property={p}
        currentUserId={userInfo?.id}
        statusInfo={getPropertyStatusInfo(p)}
        onClick={() => router.push(`/properties/${p.id}`)}
      />
    ))}
  </div>
)}
```

> Nota: el click de la card va a `/properties/[id]` por ahora. En la Fase 3 cambiamos a abrir un modal.

- [ ] **Step 5: Verificación manual**

1. Ir a `/properties`. La vista por defecto debe ser grid de cards.
2. Toggle a list y table — debe funcionar.
3. Recargar — debe recordar el último viewMode.
4. Toggle "Solo mías" — debe filtrar por `assigned_to == currentUser.id`.
5. Sin "Solo mías", login como asesor (no admin) — debe ver TODAS, las suyas con ring amber + badge estrella.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/properties/page.tsx"
git commit -m "feat(properties): vista grid marketplace como default + filtro solo mías"
```

---

# FASE 3 — `PropertyDetailModal` portal-style

**Objetivo:** Al hacer click en una card del grid, abrir un modal grande con galería, video, tour 3D, características, descripción, y botón "Agendar visita". El detalle de página `/properties/[id]` queda para edición avanzada.

## Task 3.1: Galería con thumbs + lightbox

**Files:**
- Create: `app/(dashboard)/properties/_components/PropertyGallery.tsx`

- [ ] **Step 1: Componente galería**

```tsx
// app/(dashboard)/properties/_components/PropertyGallery.tsx
'use client'
import Image from 'next/image'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export function PropertyGallery({ photos, alt }: { photos: string[]; alt: string }) {
  const [active, setActive] = useState(0)
  const [lightbox, setLightbox] = useState(false)

  if (!photos.length) {
    return (
      <div className="aspect-video bg-muted flex items-center justify-center text-muted-foreground rounded-lg">
        Sin fotos
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden cursor-zoom-in" onClick={() => setLightbox(true)}>
          <Image src={photos[active]} alt={`${alt} ${active + 1}`} fill className="object-cover" sizes="(max-width: 1200px) 100vw, 800px" />
        </div>
        {photos.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((p, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                className={cn(
                  'relative size-16 shrink-0 rounded overflow-hidden border-2',
                  i === active ? 'border-primary' : 'border-transparent'
                )}
              >
                <Image src={p} alt={`${alt} thumb ${i + 1}`} fill className="object-cover" sizes="64px" />
              </button>
            ))}
          </div>
        )}
      </div>

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent className="max-w-6xl p-0 bg-black/95 border-0">
          <div className="relative aspect-video">
            <Image src={photos[active]} alt={`${alt} ${active + 1}`} fill className="object-contain" sizes="100vw" />
            <button onClick={() => setLightbox(false)} className="absolute top-4 right-4 bg-white/10 hover:bg-white/20 rounded-full p-2">
              <X className="size-5 text-white" />
            </button>
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setActive((active - 1 + photos.length) % photos.length)}
                  className="absolute top-1/2 left-4 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-2"
                >
                  <ChevronLeft className="size-6 text-white" />
                </button>
                <button
                  onClick={() => setActive((active + 1) % photos.length)}
                  className="absolute top-1/2 right-4 -translate-y-1/2 bg-white/10 hover:bg-white/20 rounded-full p-2"
                >
                  <ChevronRight className="size-6 text-white" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/properties/_components/PropertyGallery.tsx"
git commit -m "feat(properties): galería con thumbs + lightbox"
```

---

## Task 3.2: `PropertyDetailModal` portal-style

**Files:**
- Create: `app/(dashboard)/properties/_components/PropertyDetailModal.tsx`

- [ ] **Step 1: Modal**

```tsx
// app/(dashboard)/properties/_components/PropertyDetailModal.tsx
'use client'
import Link from 'next/link'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MapPin, Bed, Bath, Square, Calendar, ExternalLink, Video, Box } from 'lucide-react'
import { PropertyGallery } from './PropertyGallery'
import { OwnershipBadge } from './OwnershipBadge'

interface DetailProperty {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  description?: string | null
  asking_price: number
  currency: string
  status: string
  photos: string[]
  rooms?: number | null
  bathrooms?: number | null
  covered_area?: number | null
  uncovered_area?: number | null
  video_url?: string | null
  tour_3d_url?: string | null
  assigned_to?: string | null
}

function formatCurrency(v: number, c: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: c === 'ARS' ? 'ARS' : 'USD', minimumFractionDigits: 0 }).format(v)
}

interface Props {
  property: DetailProperty | null
  open: boolean
  onOpenChange: (open: boolean) => void
  currentUserId?: string
  onScheduleVisit: (propertyId: string) => void
}

export function PropertyDetailModal({ property, open, onOpenChange, currentUserId, onScheduleVisit }: Props) {
  if (!property) return null
  const isMine = !!currentUserId && property.assigned_to === currentUserId

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto p-0">
        <div className="p-6 space-y-6">
          <header className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-2xl">{property.address}</DialogTitle>
              <p className="flex items-center gap-1 text-muted-foreground text-sm">
                <MapPin className="size-4" /> {property.neighborhood}, {property.city}
              </p>
              <p className="text-3xl font-bold pt-2">{formatCurrency(property.asking_price, property.currency)}</p>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <Badge>{property.property_type}</Badge>
              <OwnershipBadge isMine={isMine} />
            </div>
          </header>

          <PropertyGallery photos={property.photos} alt={property.address} />

          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {property.rooms != null && (
              <Stat icon={<Bed />} label="Ambientes" value={String(property.rooms)} />
            )}
            {property.bathrooms != null && (
              <Stat icon={<Bath />} label="Baños" value={String(property.bathrooms)} />
            )}
            {property.covered_area != null && (
              <Stat icon={<Square />} label="Sup. cubierta" value={`${property.covered_area} m²`} />
            )}
            {property.uncovered_area != null && (
              <Stat icon={<Square />} label="Sup. descubierta" value={`${property.uncovered_area} m²`} />
            )}
          </section>

          {(property.video_url || property.tour_3d_url) && (
            <section className="flex flex-wrap gap-2">
              {property.video_url && (
                <Button variant="outline" asChild>
                  <a href={property.video_url} target="_blank" rel="noopener noreferrer">
                    <Video className="size-4 mr-1" /> Ver video <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              )}
              {property.tour_3d_url && (
                <Button variant="outline" asChild>
                  <a href={property.tour_3d_url} target="_blank" rel="noopener noreferrer">
                    <Box className="size-4 mr-1" /> Tour 360° <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              )}
            </section>
          )}

          {property.description && (
            <section>
              <h3 className="font-semibold mb-2">Descripción</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{property.description}</p>
            </section>
          )}

          <footer className="sticky bottom-0 -mx-6 -mb-6 px-6 py-4 bg-background border-t flex flex-wrap gap-2 justify-end">
            <Button variant="outline" asChild>
              <Link href={`/properties/${property.id}`}>Ver detalle completo</Link>
            </Button>
            <Button onClick={() => onScheduleVisit(property.id)} className="gap-2">
              <Calendar className="size-4" />
              Agendar visita
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="border rounded-lg p-3 text-center">
      <div className="size-5 mx-auto text-muted-foreground [&_svg]:size-5">{icon}</div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Enganchar el modal al click de PropertyCard en `properties/page.tsx`**

```tsx
import { PropertyDetailModal } from './_components/PropertyDetailModal'

// state:
const [modalProperty, setModalProperty] = useState<Property | null>(null)
const [modalOpen, setModalOpen] = useState(false)
const [scheduleVisitOpen, setScheduleVisitOpen] = useState(false)
const [scheduleForPropertyId, setScheduleForPropertyId] = useState<string | null>(null)

// onClick de la card:
onClick={() => { setModalProperty(p); setModalOpen(true) }}

// al final del JSX:
<PropertyDetailModal
  property={modalProperty}
  open={modalOpen}
  onOpenChange={setModalOpen}
  currentUserId={userInfo?.id}
  onScheduleVisit={(id) => { setScheduleForPropertyId(id); setScheduleVisitOpen(true); setModalOpen(false) }}
/>
```

> El `<ScheduleVisitDialog>` se crea en Fase 4. Por ahora el callback puede solo `console.log`.

- [ ] **Step 3: Verificación**

Click en una card → debe abrir el modal con galería, stats, video/tour si existen, descripción, y botón "Agendar visita".

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/properties/_components/PropertyDetailModal.tsx" "app/(dashboard)/properties/page.tsx"
git commit -m "feat(properties): modal portal-style con galería y botón agendar"
```

---

# FASE 4 — Visits: schema + agendamiento + email cliente

**Objetivo:** Tabla `property_visits` + API + dialog para agendar + email Resend al cliente con datos de la cita.

## Task 4.1: Migración `property_visits`

**Files:**
- Create: `supabase/migrations/20260513000001_property_visits_schema.sql`

- [ ] **Step 1: Migración**

```sql
-- property_visits: agendamiento de visitas de clientes a propiedades publicadas.
-- Cualquier asesor puede agendar visitas a cualquier propiedad.

-- Función set_updated_at() — no existe en migraciones previas, la creamos idempotentemente.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS property_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  advisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 30,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'no_show', 'cancelled')),
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_property_visits_property ON property_visits(property_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_advisor ON property_visits(advisor_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_status ON property_visits(status);
CREATE INDEX IF NOT EXISTS idx_property_visits_scheduled_at ON property_visits(scheduled_at);

-- updated_at trigger (asumiendo existe la función set_updated_at en el schema)
CREATE TRIGGER trg_property_visits_updated_at
  BEFORE UPDATE ON property_visits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: alineado con la política general de marketplace (todos los asesores ven todas)
ALTER TABLE property_visits ENABLE ROW LEVEL SECURITY;

-- SELECT: cualquier usuario autenticado
CREATE POLICY property_visits_select_all ON property_visits
  FOR SELECT TO authenticated USING (true);

-- INSERT: cualquier asesor autenticado puede crear
CREATE POLICY property_visits_insert_self ON property_visits
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid() OR advisor_id = auth.uid()
  );

-- UPDATE: el asesor de la visita, el creador, o roles admin/dueno/coordinador
CREATE POLICY property_visits_update ON property_visits
  FOR UPDATE TO authenticated USING (
    advisor_id = auth.uid()
    OR created_by = auth.uid()
    OR (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','dueno','coordinador')
  );

-- DELETE: solo admin/dueno
CREATE POLICY property_visits_delete ON property_visits
  FOR DELETE TO authenticated USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','dueno')
  );
```

- [ ] **Step 2: Aplicar en Supabase Dashboard**

- [ ] **Step 3: Regenerar tipos**

Misma operación que Task 1.1 Step 3.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260513000001_property_visits_schema.sql types/database.types.ts
git commit -m "feat(visits): schema property_visits + RLS marketplace"
```

---

## Task 4.2: Tipos TypeScript de visitas

**Files:**
- Create: `types/visits.types.ts`

- [ ] **Step 1: Tipos**

```ts
// types/visits.types.ts
import type { Database } from './database.types'

export type VisitStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled'

export type PropertyVisit = Database['public']['Tables']['property_visits']['Row']
export type PropertyVisitInsert = Database['public']['Tables']['property_visits']['Insert']
export type PropertyVisitUpdate = Database['public']['Tables']['property_visits']['Update']

export interface PropertyVisitWithRelations extends PropertyVisit {
  property: { id: string; address: string; neighborhood: string; photos: string[] } | null
  advisor: { id: string; full_name: string; email: string } | null
}

export interface ScheduleVisitInput {
  property_id: string
  advisor_id?: string  // default = current user
  client_name: string
  client_email: string  // required para enviar email
  client_phone?: string
  scheduled_at: string  // ISO
  duration_minutes?: number
  notes?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add types/visits.types.ts
git commit -m "feat(visits): tipos TypeScript"
```

---

## Task 4.3: CRUD `lib/supabase/visits.ts` + API routes

**Files:**
- Create: `lib/supabase/visits.ts`
- Create: `app/api/visits/route.ts`
- Create: `app/api/visits/[id]/route.ts`

- [ ] **Step 1: CRUD**

```ts
// lib/supabase/visits.ts
import { createClient } from '@/lib/supabase/server'
import type { PropertyVisitInsert, PropertyVisitUpdate, PropertyVisitWithRelations } from '@/types/visits.types'

export async function createVisit(input: PropertyVisitInsert) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_visits')
    .insert(input)
    .select('*')
    .single()
  if (error) throw error
  return data
}

export async function listVisits(opts: {
  advisorId?: string
  propertyId?: string
  status?: string
  from?: string
  to?: string
} = {}): Promise<PropertyVisitWithRelations[]> {
  const supabase = await createClient()
  let q = supabase
    .from('property_visits')
    .select(`
      *,
      property:properties(id, address, neighborhood, photos),
      advisor:profiles!property_visits_advisor_id_fkey(id, full_name, email)
    `)
    .order('scheduled_at', { ascending: false })

  if (opts.advisorId) q = q.eq('advisor_id', opts.advisorId)
  if (opts.propertyId) q = q.eq('property_id', opts.propertyId)
  if (opts.status) q = q.eq('status', opts.status)
  if (opts.from) q = q.gte('scheduled_at', opts.from)
  if (opts.to) q = q.lte('scheduled_at', opts.to)

  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as unknown as PropertyVisitWithRelations[]
}

export async function getVisit(id: string): Promise<PropertyVisitWithRelations | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_visits')
    .select(`
      *,
      property:properties(id, address, neighborhood, photos),
      advisor:profiles!property_visits_advisor_id_fkey(id, full_name, email)
    `)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data as unknown as PropertyVisitWithRelations | null
}

export async function updateVisit(id: string, patch: PropertyVisitUpdate) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_visits')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data
}
```

- [ ] **Step 2: API list/create**

```ts
// app/api/visits/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { createVisit, listVisits } from '@/lib/supabase/visits'

const createSchema = z.object({
  property_id: z.string().uuid(),
  advisor_id: z.string().uuid().optional(),
  client_name: z.string().min(1),
  client_email: z.string().email(),
  client_phone: z.string().optional(),
  scheduled_at: z.string().datetime(),
  duration_minutes: z.number().int().positive().optional(),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const visits = await listVisits({
    advisorId: sp.get('advisor_id') || undefined,
    propertyId: sp.get('property_id') || undefined,
    status: sp.get('status') || undefined,
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
  })
  return NextResponse.json({ data: visits })
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })

  const visit = await createVisit({
    ...parsed.data,
    advisor_id: parsed.data.advisor_id ?? user.id,
    created_by: user.id,
  })

  // dispatch email (no bloqueante)
  import('@/lib/email/notifications/visit-scheduled-client')
    .then(({ sendVisitScheduledToClient }) => sendVisitScheduledToClient(visit.id))
    .catch(err => console.error('[visits] email dispatch failed', err))

  return NextResponse.json({ data: visit }, { status: 201 })
}
```

> Verificar el path real del helper `getUser`. En el explore se mencionó `lib/auth/get-user.ts`. Ajustar si es otro.

- [ ] **Step 3: API detalle**

```ts
// app/api/visits/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { getVisit, updateVisit } from '@/lib/supabase/visits'

const patchSchema = z.object({
  scheduled_at: z.string().datetime().optional(),
  client_name: z.string().min(1).optional(),
  client_email: z.string().email().optional(),
  client_phone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'completed', 'no_show', 'cancelled']).optional(),
  completion_notes: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const visit = await getVisit(id)
  if (!visit) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ data: visit })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })

  const updated = await updateVisit(id, {
    ...parsed.data,
    ...(parsed.data.status === 'completed' && !parsed.data.completion_notes ? {} : {}),
    ...(parsed.data.status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
  })
  return NextResponse.json({ data: updated })
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/visits.ts app/api/visits/
git commit -m "feat(visits): CRUD + API routes"
```

---

## Task 4.4: Email plantilla "Cita agendada (al cliente)"

**Files:**
- Create: `emails/VisitScheduledClientEmail.tsx`
- Create: `lib/email/notifications/visit-scheduled-client.ts`

- [ ] **Step 1: Plantilla**

```tsx
// emails/VisitScheduledClientEmail.tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Hr, Link } from '@react-email/components'

interface Props {
  clientName: string
  propertyAddress: string
  propertyNeighborhood: string
  scheduledAt: string  // ya formateado en español
  advisorName: string
  advisorPhone?: string
  advisorEmail: string
}

export default function VisitScheduledClientEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>Confirmación de visita: {p.propertyAddress}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#ffffff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ color: '#111', fontSize: 20 }}>Tu visita está confirmada</Heading>
          <Text>Hola {p.clientName},</Text>
          <Text>Te confirmamos la cita para visitar la siguiente propiedad:</Text>

          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6, margin: '16px 0' }}>
            <Text style={{ margin: 0, fontWeight: 600, fontSize: 16 }}>{p.propertyAddress}</Text>
            <Text style={{ margin: '4px 0 0', color: '#555' }}>{p.propertyNeighborhood}</Text>
            <Hr style={{ margin: '12px 0' }} />
            <Text style={{ margin: 0 }}><strong>Fecha y hora:</strong> {p.scheduledAt}</Text>
          </Section>

          <Text>Tu asesor asignado es <strong>{p.advisorName}</strong>.</Text>
          <Text>
            Cualquier consulta o cambio, escribinos a <Link href={`mailto:${p.advisorEmail}`}>{p.advisorEmail}</Link>
            {p.advisorPhone ? <> o llamanos al {p.advisorPhone}</> : null}.
          </Text>

          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 2: Notification helper**

```ts
// lib/email/notifications/visit-scheduled-client.ts
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { createClient } from '@/lib/supabase/server'
import VisitScheduledClientEmail from '@/emails/VisitScheduledClientEmail'

function formatES(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export async function sendVisitScheduledToClient(visitId: string) {
  const supabase = await createClient()
  const { data: visit } = await supabase
    .from('property_visits')
    .select(`
      id, client_name, client_email, scheduled_at,
      property:properties(address, neighborhood),
      advisor:profiles!property_visits_advisor_id_fkey(full_name, email, phone)
    `)
    .eq('id', visitId)
    .maybeSingle()

  if (!visit || !visit.client_email) {
    console.warn('[visit-scheduled-client] missing visit or client_email', visitId)
    return
  }

  const html = await renderEmail(VisitScheduledClientEmail({
    clientName: visit.client_name,
    propertyAddress: visit.property?.address ?? '',
    propertyNeighborhood: visit.property?.neighborhood ?? '',
    scheduledAt: formatES(visit.scheduled_at),
    advisorName: visit.advisor?.full_name ?? 'Tu asesor',
    advisorPhone: visit.advisor?.phone ?? undefined,
    advisorEmail: visit.advisor?.email ?? 'contacto@inmodf.com.ar',
  }))

  await sendEmail({
    notificationType: 'visit_scheduled_client',
    entityType: 'property',
    entityId: visit.id,
    to: visit.client_email,
    subject: `Confirmación de visita: ${visit.property?.address ?? ''}`,
    html,
    idempotent: true,
  })
}
```

> El nombre exacto del campo `phone` en `profiles` ya está confirmado del explore. Si `sendEmail` rechaza `notificationType` no enumerado, sumar el tipo en su union type.

- [ ] **Step 3: Commit**

```bash
git add emails/VisitScheduledClientEmail.tsx lib/email/notifications/visit-scheduled-client.ts
git commit -m "feat(visits): email de confirmación al cliente"
```

---

## Task 4.5: `ScheduleVisitDialog` con datetime picker

**Files:**
- Create: `app/(dashboard)/properties/_components/ScheduleVisitDialog.tsx`

- [ ] **Step 1: Dialog**

```tsx
// app/(dashboard)/properties/_components/ScheduleVisitDialog.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

interface Props {
  propertyId: string | null
  propertyAddress?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: (visitId: string) => void
}

export function ScheduleVisitDialog({ propertyId, propertyAddress, open, onOpenChange, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    scheduled_at: '',
    notes: '',
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!propertyId) return
    if (!form.client_name || !form.client_email || !form.scheduled_at) {
      toast.error('Completá nombre, email y fecha/hora')
      return
    }
    setSubmitting(true)
    try {
      const isoScheduledAt = new Date(form.scheduled_at).toISOString()
      const res = await fetch('/api/visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          client_name: form.client_name,
          client_email: form.client_email,
          client_phone: form.client_phone || undefined,
          scheduled_at: isoScheduledAt,
          notes: form.notes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al agendar')
      toast.success('Visita agendada. Se envió email de confirmación al cliente.')
      onSuccess?.(json.data.id)
      onOpenChange(false)
      setForm({ client_name: '', client_email: '', client_phone: '', scheduled_at: '', notes: '' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al agendar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Agendar visita</DialogTitle>
        {propertyAddress && (
          <DialogDescription>Propiedad: <strong>{propertyAddress}</strong></DialogDescription>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client_name">Nombre del cliente</Label>
            <Input id="client_name" value={form.client_name} onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_email">Email</Label>
            <Input id="client_email" type="email" value={form.client_email} onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="client_phone">Teléfono</Label>
            <Input id="client_phone" value={form.client_phone} onChange={e => setForm(f => ({ ...f, client_phone: e.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduled_at">Fecha y hora</Label>
            <Input
              id="scheduled_at"
              type="datetime-local"
              value={form.scheduled_at}
              min={new Date().toISOString().slice(0, 16)}
              onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea id="notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
              Agendar y notificar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Integrar en `properties/page.tsx`**

```tsx
import { ScheduleVisitDialog } from './_components/ScheduleVisitDialog'

// ... existing state
const scheduleProperty = properties.find(p => p.id === scheduleForPropertyId)

// JSX al final:
<ScheduleVisitDialog
  propertyId={scheduleForPropertyId}
  propertyAddress={scheduleProperty?.address}
  open={scheduleVisitOpen}
  onOpenChange={setScheduleVisitOpen}
/>
```

- [ ] **Step 3: Verificación E2E manual**

1. `/properties` → click card → modal → "Agendar visita".
2. Llenar form con tu email real → submit.
3. Verificar toast "Visita agendada".
4. Verificar email recibido en bandeja de entrada.
5. SQL: `SELECT * FROM property_visits ORDER BY created_at DESC LIMIT 1;` — debe estar.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/properties/_components/ScheduleVisitDialog.tsx" "app/(dashboard)/properties/page.tsx"
git commit -m "feat(visits): dialog de agendamiento con datetime picker"
```

---

# FASE 5 — Visits dashboard + recordatorios + completion

## Task 5.0: Endpoint `/api/profiles` para poblar selector de asesores

**Critical**: el `VisitFiltersBar` necesita listar asesores; el endpoint no existe en el repo.

**Files:**
- Create: `app/api/profiles/route.ts`

- [ ] **Step 1: Endpoint**

```ts
// app/api/profiles/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const role = req.nextUrl.searchParams.get('role')
  const supabase = await createClient()
  let q = supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  if (role) q = q.eq('role', role)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

- [ ] **Step 2: Smoke test**

```bash
curl -s http://localhost:3000/api/profiles?role=asesor -b cookies.txt | jq
# Expected: { data: [{id, full_name, email, role}, ...] }
```

- [ ] **Step 3: Commit**

```bash
git add app/api/profiles/route.ts
git commit -m "feat(profiles): GET endpoint con filtro por rol"
```

---

## Task 5.1: Página `/visits` con filtros

**Files:**
- Create: `app/(dashboard)/visits/page.tsx`
- Create: `app/(dashboard)/visits/_components/VisitsTable.tsx`
- Create: `app/(dashboard)/visits/_components/VisitFiltersBar.tsx`
- Modify: `app/(dashboard)/layout.tsx` (sidebar link)

- [ ] **Step 1: VisitFiltersBar**

```tsx
// app/(dashboard)/visits/_components/VisitFiltersBar.tsx
'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Filters {
  status: string
  advisorId: string
  propertyId: string
  from: string
  to: string
  onlyMine: boolean
}

interface Props {
  filters: Filters
  setFilters: (f: Filters) => void
  advisors: { id: string; full_name: string }[]
  isAdmin: boolean
}

export function VisitFiltersBar({ filters, setFilters, advisors, isAdmin }: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3 p-3 border rounded-lg bg-card">
      <div className="space-y-1">
        <label className="text-xs font-medium">Estado</label>
        <Select value={filters.status || 'all'} onValueChange={v => setFilters({ ...filters, status: v === 'all' ? '' : v })}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="scheduled">Agendadas</SelectItem>
            <SelectItem value="completed">Realizadas</SelectItem>
            <SelectItem value="no_show">No se realizó</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isAdmin && (
        <div className="space-y-1">
          <label className="text-xs font-medium">Asesor</label>
          <Select value={filters.advisorId || 'all'} onValueChange={v => setFilters({ ...filters, advisorId: v === 'all' ? '' : v })}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todos los asesores" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {advisors.map(a => <SelectItem key={a.id} value={a.id}>{a.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium">Desde</label>
        <Input type="date" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} className="w-40" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium">Hasta</label>
        <Input type="date" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} className="w-40" />
      </div>

      <Button
        variant={filters.onlyMine ? 'default' : 'outline'}
        onClick={() => setFilters({ ...filters, onlyMine: !filters.onlyMine })}
      >
        Solo mías
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: VisitsTable**

```tsx
// app/(dashboard)/visits/_components/VisitsTable.tsx
'use client'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: 'bg-blue-500' },
  completed: { label: 'Realizada', color: 'bg-green-500' },
  no_show: { label: 'No se realizó', color: 'bg-orange-500' },
  cancelled: { label: 'Cancelada', color: 'bg-gray-400' },
}

export function VisitsTable({ visits }: { visits: PropertyVisitWithRelations[] }) {
  if (visits.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">No hay visitas</div>
  }

  return (
    <div className="overflow-x-auto border rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="text-left p-3">Fecha/Hora</th>
            <th className="text-left p-3">Propiedad</th>
            <th className="text-left p-3">Cliente</th>
            <th className="text-left p-3">Asesor</th>
            <th className="text-left p-3">Estado</th>
            <th className="text-right p-3"></th>
          </tr>
        </thead>
        <tbody>
          {visits.map(v => {
            const s = STATUS_LABEL[v.status] ?? STATUS_LABEL.scheduled
            return (
              <tr key={v.id} className="border-t hover:bg-muted/50">
                <td className="p-3 whitespace-nowrap">{new Date(v.scheduled_at).toLocaleString('es-AR')}</td>
                <td className="p-3">{v.property?.address ?? '-'}</td>
                <td className="p-3">{v.client_name}</td>
                <td className="p-3">{v.advisor?.full_name ?? '-'}</td>
                <td className="p-3"><Badge className={`${s.color} text-white`}>{s.label}</Badge></td>
                <td className="p-3 text-right">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/visits/${v.id}`}>Ver</Link>
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Página /visits**

```tsx
// app/(dashboard)/visits/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { VisitFiltersBar } from './_components/VisitFiltersBar'
import { VisitsTable } from './_components/VisitsTable'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

export default function VisitsPage() {
  const [user, setUser] = useState<{ id: string; role: string } | null>(null)
  const [advisors, setAdvisors] = useState<{ id: string; full_name: string }[]>([])
  const [visits, setVisits] = useState<PropertyVisitWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: '', advisorId: '', propertyId: '', from: '', to: '', onlyMine: false,
  })

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(setUser).catch(() => {})
    fetch('/api/profiles?role=asesor').then(r => r.json()).then(({ data }) => setAdvisors(data ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.advisorId) params.set('advisor_id', filters.advisorId)
    if (filters.propertyId) params.set('property_id', filters.propertyId)
    if (filters.from) params.set('from', new Date(filters.from).toISOString())
    if (filters.to) params.set('to', new Date(filters.to + 'T23:59:59').toISOString())
    if (filters.onlyMine && user?.id) params.set('advisor_id', user.id)

    setLoading(true)
    fetch(`/api/visits?${params}`)
      .then(r => r.json())
      .then(({ data }) => setVisits(data ?? []))
      .finally(() => setLoading(false))
  }, [filters, user])

  const isAdmin = !!user && ['admin', 'dueno', 'coordinador'].includes(user.role)

  return (
    <div className="container mx-auto py-6 space-y-4">
      <h1 className="text-2xl font-semibold">Visitas</h1>
      <VisitFiltersBar filters={filters} setFilters={setFilters} advisors={advisors} isAdmin={isAdmin} />
      {loading ? <div className="p-8 text-center text-muted-foreground">Cargando…</div> : <VisitsTable visits={visits} />}
    </div>
  )
}
```

> Si `/api/profiles?role=asesor` no existe, crearlo siguiendo el patrón de los otros endpoints. Es 1 archivo.

- [ ] **Step 4: Sumar link "Visitas" al sidebar**

Modificar `app/(dashboard)/layout.tsx` agregando una entrada de navegación: `{ href: '/visits', label: 'Visitas', icon: Calendar }`. Seguir exactamente el patrón visual de los otros links.

- [ ] **Step 5: Verificación**

1. `/visits` muestra todas las visitas creadas.
2. Filtros funcionan (status, fechas, asesor, "solo mías").
3. Click "Ver" navega a `/visits/[id]` (404 hasta Task 5.2).

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/visits/" "app/(dashboard)/layout.tsx"
git commit -m "feat(visits): página listado con filtros + link sidebar"
```

---

## Task 5.2: Página `/visits/[id]` + Dialog "Completar visita"

**Files:**
- Create: `app/(dashboard)/visits/[id]/page.tsx`
- Create: `app/(dashboard)/visits/_components/CompleteVisitDialog.tsx`
- Create: `app/api/visits/[id]/complete/route.ts`

- [ ] **Step 1: API complete**

```ts
// app/api/visits/[id]/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { updateVisit } from '@/lib/supabase/visits'

const schema = z.object({
  outcome: z.enum(['completed', 'no_show']),
  completion_notes: z.string().optional(),
  internal_answers: z
    .object({
      liked: z.boolean().nullable(),
      most_liked: z.string().nullable(),
      least_liked: z.string().nullable(),
      in_price: z.boolean().nullable(),
      hypothetical_offer: z.number().nullable(),
    })
    .optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })

  await updateVisit(id, {
    status: parsed.data.outcome,
    completion_notes: parsed.data.completion_notes,
    completed_at: new Date().toISOString(),
  })

  if (parsed.data.outcome === 'completed' && parsed.data.internal_answers) {
    // crear questionnaire interno (Fase 6 lo profundiza)
    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()
    await supabase.from('visit_questionnaires').insert({
      visit_id: id,
      response_source: 'advisor',
      ...parsed.data.internal_answers,
      responded_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ ok: true })
}
```

> Esta API depende de la tabla `visit_questionnaires` que se crea en Fase 6 Task 6.1. **Implementar Task 6.1 antes que este step** o dejar el `if (internal_answers)` comentado hasta entonces.

- [ ] **Step 2: CompleteVisitDialog**

```tsx
// app/(dashboard)/visits/_components/CompleteVisitDialog.tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'

interface Props {
  visitId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

export function CompleteVisitDialog({ visitId, open, onOpenChange, onCompleted }: Props) {
  const [outcome, setOutcome] = useState<'completed' | 'no_show'>('completed')
  const [notes, setNotes] = useState('')
  const [liked, setLiked] = useState<boolean | null>(null)
  const [mostLiked, setMostLiked] = useState('')
  const [leastLiked, setLeastLiked] = useState('')
  const [inPrice, setInPrice] = useState<boolean | null>(null)
  const [offer, setOffer] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      const internal_answers = outcome === 'completed' ? {
        liked,
        most_liked: mostLiked || null,
        least_liked: leastLiked || null,
        in_price: inPrice,
        hypothetical_offer: offer ? Number(offer) : null,
      } : undefined
      const res = await fetch(`/api/visits/${visitId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome, completion_notes: notes || undefined, internal_answers }),
      })
      if (!res.ok) throw new Error('Error al guardar')
      toast.success('Visita actualizada')
      onCompleted()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogTitle>¿Cómo fue la visita?</DialogTitle>
        <div className="space-y-4">
          <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as 'completed' | 'no_show')}>
            <div className="flex items-center gap-2"><RadioGroupItem value="completed" id="o1" /><Label htmlFor="o1">Se realizó</Label></div>
            <div className="flex items-center gap-2"><RadioGroupItem value="no_show" id="o2" /><Label htmlFor="o2">No se realizó</Label></div>
          </RadioGroup>

          {outcome === 'completed' && (
            <>
              <div className="space-y-2">
                <Label>¿Le gustó la propiedad?</Label>
                <RadioGroup value={liked === null ? '' : liked ? 'yes' : 'no'} onValueChange={(v) => setLiked(v === 'yes')}>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="l1" /><Label htmlFor="l1">Sí</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="no" id="l2" /><Label htmlFor="l2">No</Label></div>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2"><Label>¿Qué fue lo que más le gustó?</Label><Textarea value={mostLiked} onChange={e => setMostLiked(e.target.value)} rows={2} /></div>
              <div className="space-y-2"><Label>¿Qué fue lo que menos le gustó?</Label><Textarea value={leastLiked} onChange={e => setLeastLiked(e.target.value)} rows={2} /></div>
              <div className="space-y-2">
                <Label>¿La propiedad está en precio?</Label>
                <RadioGroup value={inPrice === null ? '' : inPrice ? 'yes' : 'no'} onValueChange={(v) => setInPrice(v === 'yes')}>
                  <div className="flex gap-4">
                    <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="p1" /><Label htmlFor="p1">Sí</Label></div>
                    <div className="flex items-center gap-2"><RadioGroupItem value="no" id="p2" /><Label htmlFor="p2">No</Label></div>
                  </div>
                </RadioGroup>
              </div>
              <div className="space-y-2"><Label>¿Cuánto ofrecería? (USD)</Label><Input type="number" value={offer} onChange={e => setOffer(e.target.value)} /></div>
            </>
          )}

          <div className="space-y-2"><Label>Notas internas (opcional)</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={submit} disabled={submitting}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Página detalle**

```tsx
// app/(dashboard)/visits/[id]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CompleteVisitDialog } from '../_components/CompleteVisitDialog'
import { toast } from 'sonner'
import type { PropertyVisitWithRelations } from '@/types/visits.types'

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [visit, setVisit] = useState<PropertyVisitWithRelations | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [questionnaire, setQuestionnaire] = useState<unknown>(null)

  async function load() {
    const res = await fetch(`/api/visits/${id}`)
    const json = await res.json()
    setVisit(json.data)
    // questionnaire (si existe)
    const qr = await fetch(`/api/visits/${id}/questionnaire`)
    if (qr.ok) {
      const qj = await qr.json()
      setQuestionnaire(qj.data)
    }
  }

  useEffect(() => { load() }, [id])

  async function sendQuestionnaire() {
    const res = await fetch(`/api/visits/${id}/send-questionnaire`, { method: 'POST' })
    if (res.ok) toast.success('Cuestionario enviado al cliente')
    else toast.error('No se pudo enviar')
  }

  if (!visit) return <div className="p-6">Cargando…</div>

  return (
    <div className="container mx-auto py-6 space-y-4">
      <Button variant="ghost" asChild><Link href="/visits">← Volver a visitas</Link></Button>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{visit.property?.address}</h1>
          <p className="text-muted-foreground">{new Date(visit.scheduled_at).toLocaleString('es-AR')}</p>
        </div>
        <Badge>{visit.status}</Badge>
      </header>

      <Card>
        <CardHeader><CardTitle>Cliente</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <p><strong>{visit.client_name}</strong></p>
          <p>{visit.client_email}</p>
          <p>{visit.client_phone}</p>
        </CardContent>
      </Card>

      {visit.status === 'scheduled' && (
        <Card>
          <CardContent className="pt-6 flex flex-wrap gap-2">
            <Button onClick={() => setCompleteOpen(true)}>¿Se realizó?</Button>
          </CardContent>
        </Card>
      )}

      {visit.status === 'completed' && (
        <Card>
          <CardHeader><CardTitle>Cuestionario</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {questionnaire ? (
              <pre className="text-xs bg-muted p-3 rounded">{JSON.stringify(questionnaire, null, 2)}</pre>
            ) : (
              <p className="text-sm text-muted-foreground">Sin respuestas todavía</p>
            )}
            <Button onClick={sendQuestionnaire}>Enviar cuestionario al cliente</Button>
          </CardContent>
        </Card>
      )}

      <CompleteVisitDialog visitId={visit.id} open={completeOpen} onOpenChange={setCompleteOpen} onCompleted={load} />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/visits/[id]/page.tsx" "app/(dashboard)/visits/_components/CompleteVisitDialog.tsx" "app/api/visits/[id]/complete/route.ts"
git commit -m "feat(visits): detalle + completar visita con cuestionario interno"
```

---

## Task 5.3: Cron de recordatorios al asesor

**Files:**
- Create: `app/api/cron/visit-reminders/route.ts`
- Create: `emails/VisitReminderAdvisorEmail.tsx`
- Create: `lib/email/notifications/visit-reminder-advisor.ts`
- Create: `netlify.toml` entry (modify existing)

- [ ] **Step 1: Email plantilla**

```tsx
// emails/VisitReminderAdvisorEmail.tsx
import { Body, Container, Head, Heading, Html, Preview, Section, Text, Button, Hr } from '@react-email/components'

interface Props {
  advisorName: string
  propertyAddress: string
  scheduledAt: string
  clientName: string
  visitUrl: string
}

export default function VisitReminderAdvisorEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>¿Se realizó la visita de {p.propertyAddress}?</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>Marcá el resultado de la visita</Heading>
          <Text>Hola {p.advisorName},</Text>
          <Text>Pasó la fecha de la siguiente visita y necesitamos saber si se realizó:</Text>
          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6 }}>
            <Text style={{ margin: 0, fontWeight: 600 }}>{p.propertyAddress}</Text>
            <Text style={{ margin: '4px 0 0' }}>Cliente: {p.clientName}</Text>
            <Text style={{ margin: '4px 0 0' }}>Fecha: {p.scheduledAt}</Text>
          </Section>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.visitUrl} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Marcar resultado
            </Button>
          </Section>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>Diego Ferreyra Inmobiliaria</Text>
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 2: Notification helper**

```ts
// lib/email/notifications/visit-reminder-advisor.ts
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { createClient } from '@/lib/supabase/server'
import VisitReminderAdvisorEmail from '@/emails/VisitReminderAdvisorEmail'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.inmodf.com.ar'

export async function sendReminderForVisit(visitId: string) {
  const supabase = await createClient()
  const { data: v } = await supabase
    .from('property_visits')
    .select(`
      id, scheduled_at, client_name, reminder_sent_at,
      property:properties(address),
      advisor:profiles!property_visits_advisor_id_fkey(id, full_name, email)
    `)
    .eq('id', visitId)
    .maybeSingle()

  if (!v || !v.advisor?.email) return
  if (v.reminder_sent_at) return  // ya se envió

  const html = await renderEmail(VisitReminderAdvisorEmail({
    advisorName: v.advisor.full_name,
    propertyAddress: v.property?.address ?? '',
    clientName: v.client_name,
    scheduledAt: new Date(v.scheduled_at).toLocaleString('es-AR'),
    visitUrl: `${APP_URL}/visits/${v.id}`,
  }))

  await sendEmail({
    notificationType: 'visit_reminder_advisor',
    entityType: 'property',
    entityId: v.id,
    to: v.advisor.email,
    subject: `¿Se realizó la visita? ${v.property?.address ?? ''}`,
    html,
    idempotent: true,
  })

  await supabase.from('property_visits').update({ reminder_sent_at: new Date().toISOString() }).eq('id', v.id)
}
```

- [ ] **Step 3: Cron endpoint**

```ts
// app/api/cron/visit-reminders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendReminderForVisit } from '@/lib/email/notifications/visit-reminder-advisor'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  const { data: due } = await supabase
    .from('property_visits')
    .select('id')
    .eq('status', 'scheduled')
    .lt('scheduled_at', new Date().toISOString())
    .is('reminder_sent_at', null)

  let sent = 0
  for (const v of due ?? []) {
    try { await sendReminderForVisit(v.id); sent++ }
    catch (e) { console.error('[cron/visit-reminders]', v.id, e) }
  }

  return NextResponse.json({ checked: due?.length ?? 0, sent })
}
```

- [ ] **Step 4: Scheduled function Netlify**

```ts
// netlify/functions/visit-reminders.ts
import type { Config } from '@netlify/functions'

export default async () => {
  const url = `${process.env.URL ?? 'https://app.inmodf.com.ar'}/api/cron/visit-reminders`
  const res = await fetch(url, { headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' } })
  return new Response(JSON.stringify({ status: res.status }), { headers: { 'content-type': 'application/json' } })
}

export const config: Config = {
  schedule: '0 * * * *',  // cada hora
}
```

- [ ] **Step 5: Setear env var `CRON_SECRET` en Netlify**

`netlify env:set CRON_SECRET $(openssl rand -hex 32)` o vía dashboard.

- [ ] **Step 6: Verificación**

`curl https://app.inmodf.com.ar/api/cron/visit-reminders -H "x-cron-secret: <secret>"` → debe devolver `{checked, sent}`.

Probar: crear una visita con `scheduled_at` en el pasado, correr el cron manualmente, confirmar email recibido.

- [ ] **Step 7: Commit**

```bash
git add app/api/cron/visit-reminders/ emails/VisitReminderAdvisorEmail.tsx lib/email/notifications/visit-reminder-advisor.ts netlify/functions/visit-reminders.ts
git commit -m "feat(visits): cron de recordatorios al asesor cuando pasa la fecha"
```

---

## Task 5.4: Bloque "Visitas pendientes" en dashboard

**Files:**
- Modify: `app/(dashboard)/page.tsx` (o dashboard home)

- [ ] **Step 1: Sumar widget**

Identificar el dashboard home (probablemente `app/(dashboard)/page.tsx`). Agregar:

```tsx
import { listVisits } from '@/lib/supabase/visits'
import { getUser } from '@/lib/auth/get-user'

// dentro del Server Component:
const user = await getUser()
const overdue = user ? (await listVisits({ advisorId: user.id, status: 'scheduled' }))
  .filter(v => new Date(v.scheduled_at) < new Date()) : []
```

Render:

```tsx
{overdue.length > 0 && (
  <Card className="border-orange-500 border-2">
    <CardHeader><CardTitle className="text-orange-700">Visitas pendientes de marcar ({overdue.length})</CardTitle></CardHeader>
    <CardContent>
      <ul className="space-y-1 text-sm">
        {overdue.map(v => (
          <li key={v.id}>
            <Link href={`/visits/${v.id}`} className="text-primary underline">
              {v.property?.address} · {new Date(v.scheduled_at).toLocaleString('es-AR')}
            </Link>
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
)}
```

- [ ] **Step 2: Commit**

```bash
git add "app/(dashboard)/page.tsx"
git commit -m "feat(visits): widget de visitas pendientes en dashboard"
```

---

# FASE 6 — Cuestionario post-visita (interno + público al cliente)

## Task 6.1: Schema `visit_questionnaires` + tokens

**Files:**
- Create: `supabase/migrations/20260513000002_visit_questionnaires_schema.sql`

- [ ] **Step 1: Migración**

```sql
CREATE TABLE IF NOT EXISTS visit_questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES property_visits(id) ON DELETE CASCADE,
  response_source TEXT NOT NULL CHECK (response_source IN ('advisor', 'client')),
  liked BOOLEAN,
  most_liked TEXT,
  least_liked TEXT,
  in_price BOOLEAN,
  hypothetical_offer NUMERIC,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_questionnaires_visit ON visit_questionnaires(visit_id);

-- Tokens públicos para que el cliente responda sin login
CREATE TABLE IF NOT EXISTS visit_questionnaire_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES property_visits(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  sent_to TEXT NOT NULL,  -- email al que se envió
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visit_questionnaire_tokens_token ON visit_questionnaire_tokens(token);

-- RLS
ALTER TABLE visit_questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE visit_questionnaire_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY vq_select_all ON visit_questionnaires FOR SELECT TO authenticated USING (true);
CREATE POLICY vq_insert_authenticated ON visit_questionnaires FOR INSERT TO authenticated WITH CHECK (true);

-- Para tokens, el endpoint público usa service_role; bloquear acceso anon.
CREATE POLICY vqt_admin_read ON visit_questionnaire_tokens FOR SELECT TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','dueno','coordinador')
);
```

- [ ] **Step 2: Aplicar y regenerar tipos**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260513000002_visit_questionnaires_schema.sql types/database.types.ts
git commit -m "feat(questionnaire): schema visit_questionnaires + tokens"
```

---

## Task 6.2: Abrir `/questionnaire/*` en middleware (ruta pública)

**Files:**
- Modify: `lib/supabase/middleware.ts`

- [ ] **Step 1: Sumar a PUBLIC_ROUTES**

```ts
const PUBLIC_ROUTES = ['/login', '/accept-invite', '/api/', '/questionnaire', '/api/public/']
```

(o el equivalente al patrón que use ya el middleware — el formato exacto puede ser un Array de prefijos).

- [ ] **Step 2: Verificación**

`curl -I https://app.inmodf.com.ar/questionnaire/foo` → no debe redirigir a `/login`.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/middleware.ts
git commit -m "feat(questionnaire): abrir ruta pública en middleware"
```

---

## Task 6.3: API send-questionnaire + email al cliente

**Files:**
- Create: `app/api/visits/[id]/send-questionnaire/route.ts`
- Create: `emails/QuestionnaireInviteClientEmail.tsx`
- Create: `lib/email/notifications/questionnaire-invite-client.ts`

- [ ] **Step 1: Email plantilla**

```tsx
// emails/QuestionnaireInviteClientEmail.tsx
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text, Hr } from '@react-email/components'

interface Props {
  clientName: string
  propertyAddress: string
  questionnaireUrl: string
  advisorName: string
}

export default function QuestionnaireInviteClientEmail(p: Props) {
  return (
    <Html>
      <Head />
      <Preview>Tu opinión sobre {p.propertyAddress}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ backgroundColor: '#fff', maxWidth: 560, margin: '40px auto', padding: 32, borderRadius: 8 }}>
          <Heading style={{ fontSize: 20 }}>¿Qué te pareció la propiedad?</Heading>
          <Text>Hola {p.clientName},</Text>
          <Text>Gracias por visitar <strong>{p.propertyAddress}</strong>. Tu feedback es muy valioso — son solo 5 preguntas rápidas.</Text>
          <Section style={{ textAlign: 'center', padding: '24px 0' }}>
            <Button href={p.questionnaireUrl} style={{ backgroundColor: '#2563eb', color: '#fff', padding: '12px 24px', borderRadius: 6 }}>
              Responder cuestionario
            </Button>
          </Section>
          <Text>Saludos,<br/>{p.advisorName} - Diego Ferreyra Inmobiliaria</Text>
          <Hr />
          <Text style={{ color: '#888', fontSize: 12 }}>El enlace expira en 14 días.</Text>
        </Container>
      </Body>
    </Html>
  )
}
```

- [ ] **Step 2: Notification helper**

```ts
// lib/email/notifications/questionnaire-invite-client.ts
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import QuestionnaireInviteClientEmail from '@/emails/QuestionnaireInviteClientEmail'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.inmodf.com.ar'

export async function sendQuestionnaireInvite(visitId: string) {
  const supabase = await createClient()
  const { data: v } = await supabase
    .from('property_visits')
    .select(`
      id, client_name, client_email,
      property:properties(address),
      advisor:profiles!property_visits_advisor_id_fkey(full_name)
    `)
    .eq('id', visitId)
    .maybeSingle()

  if (!v || !v.client_email) throw new Error('Visit or client_email missing')

  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const { error: tErr } = await supabase
    .from('visit_questionnaire_tokens')
    .insert({ visit_id: visitId, token, expires_at: expiresAt, sent_to: v.client_email })
  if (tErr) throw tErr

  const url = `${APP_URL}/questionnaire/${token}`
  const html = await renderEmail(QuestionnaireInviteClientEmail({
    clientName: v.client_name,
    propertyAddress: v.property?.address ?? '',
    questionnaireUrl: url,
    advisorName: v.advisor?.full_name ?? 'Tu asesor',
  }))

  await sendEmail({
    notificationType: 'questionnaire_invite_client',
    entityType: 'property',
    entityId: visitId,
    to: v.client_email,
    subject: `Tu opinión sobre ${v.property?.address ?? 'la propiedad visitada'}`,
    html,
    idempotent: false,  // permitir reenvío manual
  })

  return { token, url }
}
```

- [ ] **Step 3: API route**

```ts
// app/api/visits/[id]/send-questionnaire/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { sendQuestionnaireInvite } from '@/lib/email/notifications/questionnaire-invite-client'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  try {
    const result = await sendQuestionnaireInvite(id)
    return NextResponse.json({ ok: true, url: result.url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/visits/[id]/send-questionnaire/ emails/QuestionnaireInviteClientEmail.tsx lib/email/notifications/questionnaire-invite-client.ts
git commit -m "feat(questionnaire): API send + email plantilla al cliente"
```

---

## Task 6.4: Página pública `/questionnaire/[token]`

**Files:**
- Create: `app/questionnaire/[token]/page.tsx`
- Create: `app/questionnaire/[token]/thanks/page.tsx`
- Create: `app/api/public/questionnaire/[token]/route.ts`

- [ ] **Step 0: Instalar shadcn `radio-group` (no está en el repo)**

```bash
npx shadcn@latest add radio-group
```

Verificar que se creó `components/ui/radio-group.tsx`. Sin esto, todos los `<RadioGroup>` usados en Tasks 5.2 (CompleteVisitDialog) y 6.4 (página pública) fallarán en build.

> Nota: ejecutar este step **antes** de empezar a editar componentes que importen `RadioGroup` — idealmente antes de Task 5.2 si se ejecuta secuencial.

- [ ] **Step 1: API pública (uses service_role internamente porque las policies bloquean anon)**

```ts
// app/api/public/questionnaire/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const SERVICE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function svc() {
  return createServiceClient(SERVICE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

const answerSchema = z.object({
  liked: z.boolean(),
  most_liked: z.string().min(1).max(2000),
  least_liked: z.string().min(1).max(2000),
  in_price: z.boolean(),
  hypothetical_offer: z.number().nonnegative(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = svc()
  const { data } = await supabase
    .from('visit_questionnaire_tokens')
    .select(`
      token, expires_at, used_at,
      visit:property_visits(id, client_name, property:properties(address))
    `)
    .eq('token', token)
    .maybeSingle()

  if (!data) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  if (data.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(data.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  return NextResponse.json({
    clientName: data.visit?.client_name,
    propertyAddress: data.visit?.property?.address,
  })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json()
  const parsed = answerSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })

  const supabase = svc()
  const { data: t } = await supabase
    .from('visit_questionnaire_tokens')
    .select('visit_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (!t) return NextResponse.json({ error: 'invalid_token' }, { status: 404 })
  if (t.used_at) return NextResponse.json({ error: 'already_used' }, { status: 410 })
  if (new Date(t.expires_at) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 })

  const { error: insErr } = await supabase.from('visit_questionnaires').insert({
    visit_id: t.visit_id,
    response_source: 'client',
    liked: parsed.data.liked,
    most_liked: parsed.data.most_liked,
    least_liked: parsed.data.least_liked,
    in_price: parsed.data.in_price,
    hypothetical_offer: parsed.data.hypothetical_offer,
    responded_at: new Date().toISOString(),
  })
  if (insErr) return NextResponse.json({ error: 'insert_failed' }, { status: 500 })

  await supabase.from('visit_questionnaire_tokens').update({ used_at: new Date().toISOString() }).eq('token', token)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Página pública**

```tsx
// app/questionnaire/[token]/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { toast } from 'sonner'

export default function PublicQuestionnairePage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [info, setInfo] = useState<{ clientName: string; propertyAddress: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const [liked, setLiked] = useState<boolean | null>(null)
  const [mostLiked, setMostLiked] = useState('')
  const [leastLiked, setLeastLiked] = useState('')
  const [inPrice, setInPrice] = useState<boolean | null>(null)
  const [offer, setOffer] = useState('')

  useEffect(() => {
    fetch(`/api/public/questionnaire/${token}`)
      .then(async r => {
        if (r.ok) setInfo(await r.json())
        else {
          const j = await r.json()
          setError(j.error)
        }
      })
  }, [token])

  async function submit() {
    if (liked === null || inPrice === null || !mostLiked || !leastLiked || !offer) {
      toast.error('Completá todas las preguntas')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/questionnaire/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          liked,
          most_liked: mostLiked,
          least_liked: leastLiked,
          in_price: inPrice,
          hypothetical_offer: Number(offer),
        }),
      })
      if (!res.ok) throw new Error('Error al enviar')
      router.push(`/questionnaire/${token}/thanks`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setSubmitting(false)
    }
  }

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader><CardTitle>Enlace no válido</CardTitle></CardHeader>
        <CardContent>
          {error === 'expired' && <p>El enlace expiró. Pedile uno nuevo al asesor.</p>}
          {error === 'already_used' && <p>Ya completaste este cuestionario. ¡Gracias!</p>}
          {error === 'invalid_token' && <p>El enlace no existe.</p>}
        </CardContent>
      </Card>
    </div>
  )

  if (!info) return <div className="p-6">Cargando…</div>

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <Card className="max-w-xl mx-auto">
        <CardHeader>
          <CardTitle>Hola {info.clientName}</CardTitle>
          <p className="text-sm text-muted-foreground">Tu opinión sobre {info.propertyAddress}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>1. ¿Te gustó la propiedad?</Label>
            <RadioGroup value={liked === null ? '' : liked ? 'yes' : 'no'} onValueChange={(v) => setLiked(v === 'yes')}>
              <div className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="q1y" /><Label htmlFor="q1y">Sí</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="no" id="q1n" /><Label htmlFor="q1n">No</Label></div>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2"><Label>2. ¿Qué fue lo que más te gustó?</Label><Textarea value={mostLiked} onChange={e => setMostLiked(e.target.value)} rows={3} /></div>
          <div className="space-y-2"><Label>3. ¿Qué fue lo que menos te gustó?</Label><Textarea value={leastLiked} onChange={e => setLeastLiked(e.target.value)} rows={3} /></div>
          <div className="space-y-2">
            <Label>4. ¿Te parece que está en precio?</Label>
            <RadioGroup value={inPrice === null ? '' : inPrice ? 'yes' : 'no'} onValueChange={(v) => setInPrice(v === 'yes')}>
              <div className="flex gap-4">
                <div className="flex items-center gap-2"><RadioGroupItem value="yes" id="q4y" /><Label htmlFor="q4y">Sí</Label></div>
                <div className="flex items-center gap-2"><RadioGroupItem value="no" id="q4n" /><Label htmlFor="q4n">No</Label></div>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2"><Label>5. ¿Cuánto ofrecerías hipotéticamente? (USD)</Label><Input type="number" min="0" value={offer} onChange={e => setOffer(e.target.value)} /></div>
          <Button onClick={submit} disabled={submitting} className="w-full">Enviar respuestas</Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Página thanks**

```tsx
// app/questionnaire/[token]/thanks/page.tsx
export default function ThanksPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-semibold">¡Gracias por tu respuesta!</h1>
        <p className="text-muted-foreground">Recibimos tus respuestas. Tu asesor las revisará en breve.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Verificación E2E**

1. Crear visita y marcarla completed.
2. Click "Enviar cuestionario al cliente".
3. Recibir email, click "Responder cuestionario".
4. Llenar las 5 preguntas, submit → ver página thanks.
5. SQL: `SELECT * FROM visit_questionnaires WHERE response_source='client' ORDER BY created_at DESC LIMIT 1;`
6. Volver a la visita en `/visits/[id]` → ver respuestas mostradas.

- [ ] **Step 5: Commit**

```bash
git add app/questionnaire/ app/api/public/
git commit -m "feat(questionnaire): página pública sin auth + API token validation"
```

---

## Task 6.5: Mostrar respuestas en `/visits/[id]` y `/properties/[id]`

**Files:**
- Modify: `app/(dashboard)/visits/[id]/page.tsx` (ya tiene placeholder)
- Modify: `app/(dashboard)/properties/[id]/page.tsx` (sumar resumen)
- Create: `app/api/visits/[id]/questionnaire/route.ts`

- [ ] **Step 1: Endpoint que devuelve el cuestionario**

```ts
// app/api/visits/[id]/questionnaire/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('visit_questionnaires')
    .select('*')
    .eq('visit_id', id)
    .order('responded_at', { ascending: false })
  return NextResponse.json({ data })
}
```

- [ ] **Step 2: Render lindo en VisitDetailPage**

Reemplazar el `<pre>{JSON.stringify(questionnaire, null, 2)}</pre>` por un render estructurado con badges (`Asesor` / `Cliente`) y las 5 respuestas formateadas.

```tsx
{Array.isArray(questionnaire) && questionnaire.map((q: any) => (
  <div key={q.id} className="border rounded p-3 space-y-1 text-sm">
    <Badge>{q.response_source === 'client' ? 'Cliente' : 'Asesor'}</Badge>
    <p>¿Le gustó? <strong>{q.liked ? 'Sí' : 'No'}</strong></p>
    <p>Más le gustó: {q.most_liked ?? '-'}</p>
    <p>Menos le gustó: {q.least_liked ?? '-'}</p>
    <p>¿En precio? <strong>{q.in_price ? 'Sí' : 'No'}</strong></p>
    <p>Oferta hipotética: USD {q.hypothetical_offer ?? '-'}</p>
    <p className="text-xs text-muted-foreground">{new Date(q.responded_at).toLocaleString('es-AR')}</p>
  </div>
))}
```

- [ ] **Step 3: Resumen en property detail**

En `app/(dashboard)/properties/[id]/page.tsx`, cargar últimas visitas + cuestionarios y mostrar bloque "Feedback de clientes":

```tsx
const { data: feedbacks } = await supabase
  .from('visit_questionnaires')
  .select('*, visit:property_visits(scheduled_at, client_name)')
  .eq('visit.property_id', property.id)  // requires join
  .order('responded_at', { ascending: false })
  .limit(5)
```

> Si el join así no funciona en supabase-js, hacer dos queries: primero IDs de visits de esta property, luego questionnaires con `visit_id IN (...)`.

- [ ] **Step 4: Commit**

```bash
git add app/api/visits/[id]/questionnaire/ "app/(dashboard)/visits/[id]/page.tsx" "app/(dashboard)/properties/[id]/page.tsx"
git commit -m "feat(questionnaire): mostrar respuestas en visit y property detail"
```

---

# Verificación final (todas las fases integradas)

- [ ] **Smoke test E2E manual:**
  1. Crear contacto + scheduled_appraisal con `scheduling_notes` y `buyer_interest` → ver visible en `/scheduled-appraisals/[id]`.
  2. Marcar visita y poblar `deal.visit_data` → ver el bloque en scheduled_appraisal y appraisal.
  3. Completar appraisal → click "Captar como propiedad" → form pre-llenado.
  4. Property creada → ver "Información del proceso" con todo el historial.
  5. `/properties` → grid de cards, badge en propias, filtro "Solo mías".
  6. Click card → modal con galería + botón "Agendar visita".
  7. Agendar visita → cliente recibe email.
  8. `/visits` → ver lista con filtros.
  9. Esperar cron (o simular pasando `scheduled_at` al pasado) → asesor recibe email.
  10. Click "¿Se realizó?" → completar 5 preguntas internas → guardar.
  11. Click "Enviar cuestionario al cliente" → cliente recibe email.
  12. Cliente abre link → completa 5 preguntas (sin login) → submit.
  13. Volver a `/visits/[id]` → ver ambas respuestas (asesor + cliente).
  14. Volver a `/properties/[id]` → ver feedback histórico.

- [ ] **Smoke test integridad:**
  - Login como asesor (no admin) → ver TODAS las propiedades (no solo las propias).
  - Login como admin → ver filtros completos en `/visits`.
  - Borrar una property → confirmar que sus visitas/cuestionarios CASCADE delete.
  - Borrar un asesor → confirmar que sus visitas quedan con `advisor_id = NULL` (SET NULL).

---

## Notas finales para el implementador

1. **Tipos de Supabase:** después de cada migración (Tasks 1.1, 4.1, 6.1), regenerar `types/database.types.ts`. El Supabase CLI tiene problema de auth en este proyecto — si falla, editar manualmente las tablas/columnas nuevas en el archivo.

2. **`sendEmail` notification types:** los nuevos tipos (`visit_scheduled_client`, `visit_reminder_advisor`, `questionnaire_invite_client`) probablemente deban sumarse al union/enum en `lib/email/resend-client.ts`. Confirmar viendo `SendEmailInput.notificationType`.

3. **`getUser`:** verificar path exacto y firma del helper (`lib/auth/get-user.ts`). Si la firma es diferente, adaptar las API routes.

4. **Foreign key `deals.scheduled_appraisal_id`:** cubierta por Task 1.1. El runtime se rompe si esta migración no se aplica antes de las Tasks 1.3 / 1.5.

5. **Imágenes en filesystem (gotcha conocida):** las fotos suben a filesystem local, no persisten en Netlify. Esto NO se resuelve en este plan — es deuda preexistente. La galería del modal usa los paths actuales tal como están.

6. **RLS sobre `properties`:** cubierta por Task 2.0 (reemplaza la policy `properties_select_owner_ops_or_lawyer` de `20260505000001_rls_per_role_safe.sql:183` por una abierta a `authenticated`). **Aplicar Task 2.0 antes de Task 2.1** o asesores ven lista vacía.

7. **Performance:** el grid carga todas las properties — si hay >200, agregar paginación / virtualization en una iteración posterior. No es bloqueante para shipping.

8. **Mobile:** todos los Dialog/Modal son shadcn — verificar responsiveness en mobile (especialmente el detail modal con galería).
