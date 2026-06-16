# Fase 2 — Captura de Leads de los Funnels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar task-by-task. Steps usan checkbox (`- [ ]`).

**Goal:** Reemplazar el stub `onSubmit` de las dos landings nativas por un endpoint público que cree contacto+deal en el CRM (con el `origin` correcto), con anti-spam, y redirija a las páginas de gracias — preservando los números de `/metrics` y persistiendo `event_id` para Fase 3.

**Architecture:** Un lib compartido `createFunnelLead()` encapsula la lógica de creación de lead (dedup contacto → `createDeal` → tarea de coordinador → notificación con escalación), REPLICANDO el comportamiento del webhook GHL (que NO se toca — se desmantela en Fase 5). Un endpoint público `POST /api/funnel/submit` valida con zod, aplica anti-spam (honeypot + rate-limit DB + dedup DB vía la tabla nueva `funnel_lead_submissions`), llama `createFunnelLead()`, persiste el submission (con `event_id`), y devuelve la URL de gracias. Los dos clients (`TasacionClient`/`ClaseClient`) reemplazan el stub por un `fetch` real que genera el `event_id`, lee cookies `_fbp`/`_fbc` si existen, y redirige.

**Tech Stack:** Next.js 16, React 19, TypeScript, zod ^4.2.1, Supabase (service-role), vitest. Sin deps nuevas.

**Convenciones del repo (verificadas, NO violar):**
- Commit author DEBE ser `Sujupar <redstyle50@gmail.com>` (el repo ya tiene esa config; usar igual `git -c user.name=... -c user.email=...` por las dudas).
- Migraciones se corren A MANO en el SQL Editor del Dashboard (la CLI no conecta).
- `git add` de PATHS ESPECÍFICOS — NUNCA `git add -A`/`.` (hay WIP del usuario sin commitear).
- Endpoints públicos: cliente service-role inline + defensas propias (no `requireAuth`). Patrón de `app/api/leads/route.ts` y `app/api/landing/track-visit/route.ts`.
- Build local: `next build` (Turbopack) crashea por el acento en la ruta; usar `npx next build --webpack` para validar build de prod (falla preexistente en `@react-pdf/renderer` con webpack es AJENA — no es gate de Fase 2). Gate real de Fase 2 = tsc + eslint + tests + `next dev` smoke.

**Firmas reales (del recon) que se usan:**
- `createDeal(input: DealInput): Promise<string>` — `DealInput` requiere `contact_id`, `property_address`; opc `origin`, `stage`(default 'scheduled'), `assigned_to`, `notes`, `neighborhood`, `property_type`. Devuelve deal id. (`lib/supabase/deals.ts`)
- `createTaskForRole(role: string, input: Omit<CreateTaskInput,'assigned_to'>): Promise<void>` — `CreateTaskInput.type` incluye `'update_contact'`. (`lib/supabase/tasks.ts`)
- `notifyDealCreated({ dealId }): Promise<...>` — LANZA si el deal tiene `origin==='clase_gratuita'`. (`lib/email/notifications/deal-created.ts`)
- `notifyClassRegistration({ dealId, formName? }): Promise<...>` — LANZA si `origin!=='clase_gratuita'`. (`lib/email/notifications/class-registration.ts`)
- `notifyWithEscalation(op: () => Promise<unknown>, ctx: { failedNotificationType: string; entityType: string; entityId: string }): Promise<{ok:boolean;error?:string}>`. (`lib/email/notify-with-escalation.ts`)
- Dedup contacto del webhook: `contacts` `.ilike('email', x).maybeSingle()` → `.eq('phone', x).maybeSingle()` → insert `{full_name,email,phone,origin,notes}`.
- Placeholder address: `"Solicitud de tasación — <name>"` / `"Clase Gratuita — <name>"`.
- IP hash: `sha256(ip + IP_HASH_SALT)` (patrón de `track-visit`).

**Fuera de alcance (NO hacer en Fase 2):** Pixel/CAPI/eventos de conversión (Fase 3 — acá solo se GENERA y PERSISTE `event_id`), públicos por etapa (Fase 4), corte de dominio (Fase 5), refactor del webhook GHL.

---

## File Structure

**Crear:**
- `supabase/migrations/20260616000001_funnel_lead_submissions.sql` — tabla log (rate-limit + dedup + observabilidad + event_id).
- `lib/funnel/create-funnel-lead.ts` — `resolveFunnelMapping` (puro) + `createFunnelLead` (IO).
- `lib/funnel/create-funnel-lead.test.ts` — test de `resolveFunnelMapping`.
- `app/api/funnel/submit/route.ts` — endpoint público.

**Modificar:**
- `components/funnel/FunnelLeadForm.tsx` — el form ya llama `onSubmit(values)`; sin cambios de lógica salvo confirmar que pasa `company` (honeypot). (Probablemente 0 cambios; ver Task 4.)
- `app/(funnels)/tasacion-directa/TasacionClient.tsx` — reemplazar stub `handleSubmit` por fetch real + redirect.
- `app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx` — idem.

**Ya existen (de Fase 1, no recrear):** `app/(funnels)/gracias-tasacion/page.tsx`, `app/(funnels)/gracias-clase/page.tsx`.

---

## Task 1: Migración `funnel_lead_submissions`

**Files:**
- Create: `supabase/migrations/20260616000001_funnel_lead_submissions.sql`

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260616000001_funnel_lead_submissions.sql`:
```sql
-- Log de envíos de los formularios de funnel (tasación / clase).
-- Sirve para: (1) rate-limit por IP, (2) dedup por email/phone, (3) observabilidad,
-- (4) persistir el event_id para deduplicar Pixel+CAPI en Fase 3.
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta).

create table if not exists public.funnel_lead_submissions (
  id          uuid primary key default gen_random_uuid(),
  funnel      text not null check (funnel in ('tasacion','clase')),
  ip_hash     text,
  email       text,
  phone       text,
  contact_id  uuid references public.contacts(id) on delete set null,
  deal_id     uuid references public.deals(id) on delete set null,
  event_id    text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_fls_ip_created    on public.funnel_lead_submissions (ip_hash, created_at desc);
create index if not exists idx_fls_email_created  on public.funnel_lead_submissions (email, created_at desc);
create index if not exists idx_fls_phone_created  on public.funnel_lead_submissions (phone, created_at desc);

-- RLS: sin policies → solo service-role escribe/lee. anon/authenticated denegados.
alter table public.funnel_lead_submissions enable row level security;
```

- [ ] **Step 2: Aplicar la migración (manual, Dashboard)**

Pegar en el SQL Editor del Dashboard y ejecutar. Verificar:
```sql
select count(*) from public.funnel_lead_submissions; -- 0
```
Expected: tabla creada, count 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260616000001_funnel_lead_submissions.sql
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(db): funnel_lead_submissions (rate-limit + dedup + observabilidad de leads de funnel)"
```

---

## Task 2: `lib/funnel/create-funnel-lead.ts` (TDD del mapeo puro)

**Files:**
- Create: `lib/funnel/create-funnel-lead.ts`
- Test: `lib/funnel/create-funnel-lead.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `lib/funnel/create-funnel-lead.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveFunnelMapping } from './create-funnel-lead'

describe('resolveFunnelMapping', () => {
  it('tasacion → stage request, origin embudo, notify deal', () => {
    expect(resolveFunnelMapping('tasacion')).toEqual({
      stage: 'request',
      origin: 'embudo',
      placeholderLabel: 'Solicitud de tasación',
      notify: 'deal',
    })
  })

  it('clase → stage clase_gratuita, origin clase_gratuita, notify class', () => {
    expect(resolveFunnelMapping('clase')).toEqual({
      stage: 'clase_gratuita',
      origin: 'clase_gratuita',
      placeholderLabel: 'Clase Gratuita',
      notify: 'class',
    })
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm run test -- lib/funnel/create-funnel-lead.test.ts`
Expected: FAIL ("Cannot find module './create-funnel-lead'").

- [ ] **Step 3: Implementación**

Create `lib/funnel/create-funnel-lead.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { createDeal } from '@/lib/supabase/deals'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { notifyDealCreated } from '@/lib/email/notifications/deal-created'
import { notifyClassRegistration } from '@/lib/email/notifications/class-registration'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'

export type FunnelKind = 'tasacion' | 'clase'

interface FunnelMapping {
  stage: 'request' | 'clase_gratuita'
  origin: 'embudo' | 'clase_gratuita'
  placeholderLabel: string
  notify: 'deal' | 'class'
}

/** Mapea el funnel al stage/origin/notificación del CRM. Puro (testeable). */
export function resolveFunnelMapping(funnel: FunnelKind): FunnelMapping {
  if (funnel === 'clase') {
    return { stage: 'clase_gratuita', origin: 'clase_gratuita', placeholderLabel: 'Clase Gratuita', notify: 'class' }
  }
  return { stage: 'request', origin: 'embudo', placeholderLabel: 'Solicitud de tasación', notify: 'deal' }
}

function admin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export interface FunnelLeadInput {
  funnel: FunnelKind
  name: string
  email: string | null
  phone: string | null
  propertyLocation?: string | null
  tipoCliente?: string | null
  message?: string | null
}

export interface FunnelLeadResult {
  contactId: string
  dealId: string
}

/**
 * Crea (o reutiliza) el contacto y crea el deal del funnel, replicando el
 * comportamiento del webhook GHL (origin/stage/placeholder/notificación).
 * El webhook GHL NO se modifica (se desmantela en Fase 5).
 */
export async function createFunnelLead(input: FunnelLeadInput): Promise<FunnelLeadResult> {
  const supabase = admin()
  const map = resolveFunnelMapping(input.funnel)
  const name = input.name.trim()
  const email = input.email?.trim() || null
  const phone = input.phone?.trim() || null

  // 1) Dedup contacto: email (ilike) → phone (eq) → crear
  let contactId: string | null = null
  if (email) {
    const { data } = await supabase.from('contacts').select('id').ilike('email', email).maybeSingle()
    if (data) contactId = data.id
  }
  if (!contactId && phone) {
    const { data } = await supabase.from('contacts').select('id').eq('phone', phone).maybeSingle()
    if (data) contactId = data.id
  }
  if (!contactId) {
    const { data, error } = await supabase
      .from('contacts')
      .insert({ full_name: name, email, phone, origin: map.origin, notes: input.message ?? null })
      .select('id')
      .single()
    if (error) throw error
    contactId = data.id
  }

  // 2) Crear deal (property_address NOT NULL → ubicación capturada o placeholder)
  const placeholder = `${map.placeholderLabel} — ${name}`
  const propertyAddress =
    input.funnel === 'tasacion' && input.propertyLocation?.trim()
      ? input.propertyLocation.trim()
      : placeholder
  const dealNotes =
    input.funnel === 'clase' && input.tipoCliente
      ? `Tipo de cliente: ${input.tipoCliente}`
      : input.message ?? undefined

  const dealId = await createDeal({
    contact_id: contactId,
    property_address: propertyAddress,
    origin: map.origin,
    stage: map.stage,
    notes: dealNotes,
  })

  // 3) Tarea de coordinador (broadcast a coordinadores activos)
  await createTaskForRole('coordinador', {
    type: 'update_contact',
    title: `${map.placeholderLabel}: ${name}`,
    description: `Lead capturado desde la landing de ${input.funnel === 'clase' ? 'Clase Gratuita' : 'Tasación Directa'}. Completar datos.`,
    deal_id: dealId,
    contact_id: contactId,
  })

  // 4) Notificación con escalación (rama correcta según funnel)
  await notifyWithEscalation(
    () => (map.notify === 'class' ? notifyClassRegistration({ dealId }) : notifyDealCreated({ dealId })),
    { failedNotificationType: map.notify === 'class' ? 'class_registration' : 'deal_created', entityType: 'deal', entityId: dealId },
  )

  return { contactId, dealId }
}
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `npm run test -- lib/funnel/create-funnel-lead.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E 'create-funnel-lead' || echo "sin errores en create-funnel-lead"`
Expected: sin errores. (Verificar que `createDeal`/`createTaskForRole`/notify firmas tipan; si `createTaskForRole` o las notify tienen firmas distintas, ajustar la llamada a la firma REAL del repo — leé el archivo correspondiente.)

- [ ] **Step 6: Commit**

```bash
git add lib/funnel/create-funnel-lead.ts lib/funnel/create-funnel-lead.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): createFunnelLead — contacto+deal+tarea+notificación (replica webhook GHL)"
```

---

## Task 3: `POST /api/funnel/submit` (endpoint público con anti-spam)

**Files:**
- Create: `app/api/funnel/submit/route.ts`

- [ ] **Step 1: Implementar el endpoint**

Create `app/api/funnel/submit/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { createFunnelLead } from '@/lib/funnel/create-funnel-lead'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5
const DEDUP_WINDOW_MS = 5 * 60_000

const Schema = z
  .object({
    funnel: z.enum(['tasacion', 'clase']),
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().max(200).nullable().optional(),
    phone: z.string().trim().min(6).max(30).nullable().optional(),
    propertyLocation: z.string().trim().max(200).nullable().optional(),
    tipoCliente: z.string().trim().max(100).nullable().optional(),
    message: z.string().trim().max(2000).nullable().optional(),
    company: z.string().max(200).optional(), // honeypot
    eventId: z.string().min(8).max(128).optional(),
    eventSourceUrl: z.string().url().max(500).nullable().optional(),
  })
  .refine((d) => !!(d.email || d.phone), { message: 'Se requiere email o teléfono.' })

function admin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + (process.env.IP_HASH_SALT ?? 'inmodf-default-salt')).digest('hex')
}

function redirectFor(funnel: 'tasacion' | 'clase'): string {
  return funnel === 'tasacion' ? '/gracias-tasacion' : '/gracias-clase'
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Datos inválidos', detail: parsed.error.flatten() }, { status: 400 })
  }
  const d = parsed.data

  // Honeypot: si viene relleno, fingimos éxito sin crear nada.
  if (d.company && d.company.trim().length > 0) {
    return NextResponse.json({ ok: true, redirect: redirectFor(d.funnel) })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  const ipHash = hashIp(ip)
  const supabase = admin()

  // Rate-limit por IP (DB, sobrevive serverless)
  const rateSince = new Date(Date.now() - RATE_WINDOW_MS).toISOString()
  const { count: ipCount } = await supabase
    .from('funnel_lead_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', rateSince)
  if ((ipCount ?? 0) >= RATE_MAX) {
    return NextResponse.json({ error: 'Demasiados envíos. Probá de nuevo en un minuto.' }, { status: 429 })
  }

  // Dedup por email/phone (5 min) → fingir éxito (no crear deal duplicado)
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
  for (const [col, val] of [['email', d.email], ['phone', d.phone]] as const) {
    if (!val) continue
    const { count } = await supabase
      .from('funnel_lead_submissions')
      .select('id', { count: 'exact', head: true })
      .eq(col, val)
      .gte('created_at', dedupSince)
    if ((count ?? 0) > 0) {
      return NextResponse.json({ ok: true, deduplicated: true, redirect: redirectFor(d.funnel) })
    }
  }

  // Crear el lead (contacto + deal + tarea + notificación)
  let result: { contactId: string; dealId: string }
  try {
    result = await createFunnelLead({
      funnel: d.funnel,
      name: d.name,
      email: d.email ?? null,
      phone: d.phone ?? null,
      propertyLocation: d.propertyLocation ?? null,
      tipoCliente: d.tipoCliente ?? null,
      message: d.message ?? null,
    })
  } catch (e) {
    console.error('[funnel/submit] createFunnelLead failed', e)
    return NextResponse.json({ error: 'No pudimos procesar tu envío. Probá de nuevo.' }, { status: 500 })
  }

  // Log del submission (rate-limit/dedup futuros + event_id para Fase 3)
  await supabase.from('funnel_lead_submissions').insert({
    funnel: d.funnel,
    ip_hash: ipHash,
    email: d.email ?? null,
    phone: d.phone ?? null,
    contact_id: result.contactId,
    deal_id: result.dealId,
    event_id: d.eventId ?? null,
  })

  return NextResponse.json({ ok: true, redirect: redirectFor(d.funnel) })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E 'funnel/submit' || echo "sin errores en funnel/submit"`
Expected: sin errores.

- [ ] **Step 3: Lint**

Run: `npx eslint app/api/funnel/submit/route.ts`
Expected: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/funnel/submit/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): POST /api/funnel/submit (zod + honeypot + rate-limit/dedup DB → createFunnelLead)"
```

---

## Task 4: Cablear los forms al endpoint real (+ event_id + redirect)

**Files:**
- Modify: `components/funnel/FunnelLeadForm.tsx` (solo si hace falta exponer `company`/`eventId`)
- Modify: `app/(funnels)/tasacion-directa/TasacionClient.tsx`
- Modify: `app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx`

> El form ya llama `await onSubmit(values)` con `FunnelLeadValues` (incluye `company` honeypot, `propertyLocation`/`tipoCliente` según variant). Solo hay que reemplazar el STUB de los clients por un POST real. El `event_id` se genera en el client (para Fase 3) y se manda al endpoint.

- [ ] **Step 1: Helper de submit en TasacionClient**

En `app/(funnels)/tasacion-directa/TasacionClient.tsx`, reemplazar el stub:
```tsx
  // Fase 2 reemplaza este stub por el POST real a /api/funnel/submit
  async function handleSubmit(_values: FunnelLeadValues) {
    await new Promise((r) => setTimeout(r, 400))
  }
```
por:
```tsx
  async function handleSubmit(values: FunnelLeadValues) {
    const eventId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await fetch('/api/funnel/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        funnel: 'tasacion',
        name: values.name,
        email: values.email,
        phone: values.phone,
        propertyLocation: values.propertyLocation,
        company: values.company,
        eventId,
        eventSourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string }
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'No pudimos procesar tu envío.')
    if (data.redirect && typeof window !== 'undefined') window.location.href = data.redirect
  }
```

- [ ] **Step 2: Helper de submit en ClaseClient**

En `app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx`, reemplazar el stub equivalente por:
```tsx
  async function handleSubmit(values: FunnelLeadValues) {
    const eventId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const res = await fetch('/api/funnel/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        funnel: 'clase',
        name: values.name,
        email: values.email,
        phone: values.phone,
        tipoCliente: values.tipoCliente,
        company: values.company,
        eventId,
        eventSourceUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect?: string; error?: string }
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'No pudimos procesar tu envío.')
    if (data.redirect && typeof window !== 'undefined') window.location.href = data.redirect
  }
```

- [ ] **Step 3: Confirmar que `FunnelLeadForm` propaga el error**

Leer `components/funnel/FunnelLeadForm.tsx`: el `handleSubmit` del form hace `try { await onSubmit(values); setDone(true) } catch { setError(...) }`. Confirmar que un throw del `onSubmit` (cuando el fetch falla) se muestra como error en el form (ya está así por Fase 1). Si el form NO captura el error de `onSubmit`, envolver la llamada en try/catch que setee el error. NO cambiar otra cosa.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E 'app/\(funnels\)' || echo "funnel pages OK"` && `npx eslint "app/(funnels)"`
Expected: sin errores de tipo en las páginas; eslint 0 errores (los 2 warnings `_values` desaparecen porque ahora el param `values` SÍ se usa).

- [ ] **Step 5: Commit**

```bash
git add "app/(funnels)/tasacion-directa/TasacionClient.tsx" "app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): cablear forms a POST /api/funnel/submit (event_id + redirect a gracias)"
```

---

## Task 5: Verificación + smoke con lead de prueba

- [ ] **Step 1: Tests + lint + typecheck del funnel**

Run:
```bash
npm run test -- lib/funnel components/funnel
npx eslint "app/(funnels)" components/funnel lib/funnel app/api/funnel
npx tsc --noEmit 2>&1 | grep -E 'funnel' || echo "funnel typechecks clean"
```
Expected: tests verdes, eslint 0 errores, tsc sin errores de funnel.

- [ ] **Step 2: Build de producción (webpack, sortea el bug del acento)**

Run: `npx next build --webpack 2>&1 | tail -20`
Expected: si falla, confirmar que el ÚNICO error es el preexistente de `@react-pdf/renderer` (ESM) — NO en archivos de funnel. (No es gate de Fase 2.)

- [ ] **Step 3a: Activar modo prueba de email (proteger al equipo del smoke)**

El smoke crea un deal real que dispara notificaciones por email. `notification_settings.test_mode_enabled` está hoy en `false`, así que sin esto los emails irían al EQUIPO real. Activar el modo prueba (redirige TODO email a `test_recipient_email` = contacto.julianparra@gmail.com con prefijo `[PRUEBA]`):
```sql
update public.notification_settings set test_mode_enabled = true, updated_at = now() where id = 'default';
```
El cache de settings es de 5s — esperar ~6s antes del smoke. Se RESTAURA a `false` en el Step 6.

- [ ] **Step 3b: Smoke con lead de PRUEBA (crea un deal real → limpiarlo después)**

Levantar dev: `PORT=3100 npm run dev` (background). Enviar un lead de prueba CLARAMENTE identificable:
```bash
curl -s -X POST http://localhost:3100/api/funnel/submit -H 'content-type: application/json' \
  -d '{"funnel":"tasacion","name":"[TEST] Lead Fase2","email":"test-fase2-tasacion@example.com","phone":"541100000001","propertyLocation":"Palermo, CABA","eventId":"test-evt-0001","company":""}'
echo; echo "→ esperar {ok:true, redirect:'/gracias-tasacion'}"
```
Verificar en Supabase (SQL Editor) que el deal se creó con el origin correcto y que NO hubo 500 del trigger (gotcha CLAUDE.md):
```sql
select d.id, d.stage, d.origin, d.property_address, c.full_name, c.origin as contact_origin
from deals d join contacts c on c.id = d.contact_id
where c.email = 'test-fase2-tasacion@example.com';
-- Expected: 1 fila, stage='request', origin='embudo'
```
Repetir el curl una 2da vez dentro de 5 min → debe devolver `{ok:true, deduplicated:true}` y NO crear un 2do deal.

- [ ] **Step 4: Limpiar el lead de prueba (filtrar SOLO el test — regla CLAUDE.md: nunca borrar data real)**

En el SQL Editor, borrar SOLO el contacto/deal de prueba (cascada o explícito), p.ej.:
```sql
delete from public.funnel_lead_submissions where email = 'test-fase2-tasacion@example.com';
delete from public.deals where contact_id in (select id from public.contacts where email = 'test-fase2-tasacion@example.com');
delete from public.tasks where contact_id in (select id from public.contacts where email = 'test-fase2-tasacion@example.com');
delete from public.contacts where email = 'test-fase2-tasacion@example.com';
```
Verificar que NO quedó nada de prueba y que NO se tocó data real (el filtro es por el email de test). Repetir el smoke para `clase` si se desea (email `test-fase2-clase@example.com`, esperar `stage='clase_gratuita'`, origin `clase_gratuita`, y notificación de CLASE — no la de tasación). Limpiar igual.

- [ ] **Step 5: Confirmar métricas (definición de embudo intacta)**

Confirmar que el deal de prueba (mientras existió) contaba como `appraisal_requests` (origin='embudo') / `class_registrations` (origin='clase_gratuita') en `vw_funnel_daily` — i.e. el origin es el correcto. (Ya verificado en Step 3 por el origin del deal.) Detener el dev server: `lsof -ti:3100 | xargs kill`.

- [ ] **Step 6: RESTAURAR modo prueba de email a OFF (estado original)**

CRÍTICO — dejar `notification_settings` como estaba (test_mode OFF) para que en producción las notificaciones reales lleguen al equipo:
```sql
update public.notification_settings set test_mode_enabled = false, updated_at = now() where id = 'default';
```
Verificar:
```sql
select test_mode_enabled, test_recipient_email from public.notification_settings where id = 'default';
-- Expected: test_mode_enabled = false
```

- [ ] **Step 7: Commit final (si hubo ajustes)**

```bash
git add -A -- lib/funnel app/api/funnel "app/(funnels)" components/funnel
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "chore(funnel): Fase 2 verification pass" || echo "nada que commitear"
```

---

## Self-Review

**1. Spec coverage (vs §5 del spec maestro):**
- Lib compartido `createFunnelLead` extraído de la lógica del webhook → Task 2. ✅
- Mapeo exacto stage/origin/notificación (tasación=request/embudo/notifyDealCreated; clase=clase_gratuita/clase_gratuita/notifyClassRegistration) → Task 2 `resolveFunnelMapping` + `createFunnelLead`. ✅
- `property_address` placeholder (NOT NULL) → Task 2 (usa ubicación capturada o placeholder). ✅
- Endpoint público anti-spam (rate-limit DB + dedup DB + honeypot) → Task 3. ✅ (Captcha Turnstile: documentado como activable, fuera de Fase 2 por decisión consciente.)
- Forms cableados con origin correcto + redirect a gracias → Task 4. ✅
- `event_id` generado y persistido para Fase 3 → Task 3/4 (persiste en funnel_lead_submissions). ✅
- Preserva `/metrics` (origin embudo/clase_gratuita) → verificado en Task 5 Step 3/5. ✅
- Webhook GHL intacto (se desmantela en Fase 5) → no se toca. ✅

**2. Placeholder scan:** Sin TBD/TODO. El `eventId` se persiste pero su uso en Pixel/CAPI es explícitamente Fase 3 (documentado).

**3. Type consistency:** `FunnelKind` ('tasacion'|'clase') consistente en lib + endpoint. `FunnelLeadInput`/`FunnelLeadResult` usados por el endpoint. `FunnelLeadValues` (de Fase 1) provee `company`/`propertyLocation`/`tipoCliente` que el client mapea al body. El `redirect` apunta a `/gracias-tasacion` | `/gracias-clase` (páginas de Fase 1).

**Riesgo a vigilar en ejecución:** las firmas reales de `createTaskForRole` y de las funciones notify deben matchear la llamada en Task 2 — el implementador DEBE leer esos archivos y ajustar si difieren del recon (p.ej. si `createTaskForRole` espera más campos requeridos). El gate es `tsc` limpio.

---

## Prerrequisitos del usuario
- [ ] Aplicar la migración `20260616000001_funnel_lead_submissions.sql` en el SQL Editor (Task 1 Step 2).
- [ ] (Opcional) Si se quiere captcha: crear app en Cloudflare Turnstile y setear `TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — se cablea en un add-on posterior (no incluido en Fase 2).

## Notas para Fase 3 (no implementar acá)
- El `event_id` ya viaja del client al endpoint y se persiste en `funnel_lead_submissions`. Fase 3 montará el Pixel en las funnel pages y disparará `Lead` (tasación) / `CompleteRegistration` (clase) con ESE mismo `event_id`, y el CAPI server-side usará el mismo id (dedup). Idealmente el disparo del Pixel ocurre en el client justo antes/después del submit, y el CAPI se manda desde `createFunnelLead`/endpoint con el `event_id` recibido.
