# Fase 4 — Públicos Personalizados de Meta por etapa del embudo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar task-by-task. Steps usan checkbox (`- [ ]`).

**Goal:** Sincronizar los contactos del CRM a **Custom Audiences (customer-list) de Meta según la etapa de su deal**, MOVIENDO al lead entre públicos al avanzar, y EXCLUYENDO a los convertidos (`captured`/`lost`) del prospecting — con teléfono normalizado AR + PII hasheada SHA-256, idempotente y observable.

**Architecture:** Un público CUSTOM (`customer_file_source: USER_PROVIDED_ONLY`) por etapa clave. Un **worker pg_cron** (`/api/cron/meta-audience-sync`, guardado por `x-cron-secret`) **reconcilia por estado actual**: en cada corrida calcula, por etapa, los contactos cuyos deals están HOY en esa etapa (origin `embudo`/`clase_gratuita`), los **diffea contra un ledger** (`funnel_meta_audience_members`), y hace `POST /{audienceId}/users` (altas) + `DELETE /{audienceId}/users` (bajas) con hashes SHA-256. Al avanzar de etapa, el contacto sale del público anterior (ya no aparece en su membresía deseada) y entra al nuevo. El campaign builder excluye los públicos `captured`/`lost` del prospecting. Reconciliar por estado actual (no por `deal_stage_history`) cubre TODOS los caminos de cambio de etapa (advance route, link helpers, imports). Best-effort: nunca rompe el CRM.

**Tech Stack:** Next.js 16, Supabase (service-role), vitest. Reusa `lib/marketing/meta-custom-audiences.ts` (extendido), `normalizeArPhone` (Fase 3), el patrón pg_cron de `app/api/cron/send-report`. Graph API `v21.0`.

**Convenciones (verificadas):** commit author `Sujupar <redstyle50@gmail.com>`; `git add` de paths específicos (NUNCA `-A`/`.`); migraciones a mano en el SQL Editor; cron real vía Supabase pg_cron → ruta Next con `x-cron-secret` (Netlify schedulers muertos); build local con `npx next build --webpack` (Turbopack local crashea por el acento; el fallo de `@react-pdf/renderer` con webpack es ajeno).

**Hechos del recon (firmas reales):**
- `createWebsiteAudience({name,description,rule,retentionDays}): Promise<string>` en `lib/marketing/meta-custom-audiences.ts`; `getMeta()` lee `META_AD_ACCOUNT_ID` (normaliza `act_`) + `META_ACCESS_TOKEN`. POST a `{accountId}/customaudiences`, v21.0, `META='https://graph.facebook.com'`.
- `property_meta_audiences` es **por property** (CHECK de `audience_type` no incluye etapas) → **se crea tabla nueva** `funnel_meta_audiences` (nivel cuenta, por etapa).
- `DEAL_STAGES` (10) en `lib/supabase/deals.ts`; `getDeals(filters)` expande `contacts:contact_id(id, full_name, phone, email)`. `contacts.origin` ∈ embudo/referido/historico/clase_gratuita. NO existe `ads_consent`.
- `normalizeArPhone(raw)` EXPORTADA en `lib/marketing/normalize-phone.ts`; `sha256`/hashers son PRIVADOS en `meta-capi.ts` → `audience-hash.ts` usa su propio `createHash('sha256')` + `normalizeArPhone`.
- Cron: `isAuthorized()` en `app/api/cron/send-report/route.ts` (env `CRON_SECRET` o tabla `cron_config.value` con service-role), `maxDuration=60`. Agendado con `cron.schedule(name, sched, command)` + `net.http_post(..., headers x-cron-secret, timeout_milliseconds:=30000)` (plantilla: `20260606000002_cron_publish_listings.sql`). **pg_net es POST-only** → el DELETE a Meta lo hace la ruta Next, no pg_cron.
- `meta-campaign-builder.ts` arma `targeting` del AdSet (~líneas 606-637) con `targeting_automation: { advantage_audience: 1 }` + caps de edad (min 25 / max 65); **NO** tiene `custom_audiences`/`excluded_custom_audiences`. Gotchas a preservar: age caps, OFFSITE_CONVERSIONS+promoted_object, bid_strategy en adset.

**Decisiones de diseño:**
- **8 públicos** (etapa → público): `clase_gratuita` (Registró clase), `request` (Solicitó tasación), `scheduled` (Coordinada), `visited` (Visita), `appraisal_sent` (Tasación entregada), `followup` (Seguimiento), `captured` (Captado — EXCLUIR), `lost` (Perdido — EXCLUIR). (`not_visited`/`comprador` fuera por ahora; fácil agregar.)
- **Reconciliación por estado actual** (no por history). Un contacto puede estar en varios públicos si tiene varios deals en distintas etapas (raro, aceptable).
- **Privacidad:** sincronizar SOLO `origin IN ('embudo','clase_gratuita')`. NO se agrega `ads_consent` (over-engineering para el alcance; el origin ya acota a leads de los funnels). Se suma una línea de uso publicitario a la política de privacidad (Task 8). Documentado.
- **Validación SEGURA:** el smoke usa UNA audiencia de prueba + 1 contacto inventado (no PII real). El "go-live" (sincronizar contactos reales) es decisión aparte del usuario, tras confirmar ToS + Advanced Access.

**Prerrequisitos del usuario (sin esto el sync NO escribe miembros en vivo):**
- [ ] Aceptar los **Custom Audience Terms** en `facebook.com/ads/manage/customaudiences/tos` (error `200/1870090` si no).
- [ ] Confirmar **Advanced Access `ads_management`** para la app de Meta (App Review) — para `/users` a escala.

**Fuera de alcance:** corte de dominio (Fase 5), lookalikes automáticos, evento `Schedule`, público `comprador`/`not_visited`.

---

## File Structure

**Crear:**
- `supabase/migrations/20260617000001_funnel_meta_audiences.sql` — 3 tablas (config + ledger + log).
- `lib/marketing/audience-hash.ts` + `.test.ts` — normalizar+SHA256 por key.
- `lib/marketing/funnel-audience-sync.ts` + `.test.ts` — ensureStageAudiences + computeDiff (puro, TDD) + syncAllStages (IO).
- `app/api/cron/meta-audience-sync/route.ts` — worker.
- `supabase/migrations/20260617000002_cron_meta_audience_sync.sql` — agenda pg_cron (usuario aplica).

**Modificar:**
- `lib/marketing/meta-custom-audiences.ts` — `createCustomerListAudience` + `addUsersToAudience` + `removeUsersFromAudience` (aditivo, no toca lo de WEBSITE).
- `lib/marketing/meta-campaign-builder.ts` — `excluded_custom_audiences` (captured/lost) en el AdSet de prospecting.
- `app/privacidad/page.tsx` — línea de uso publicitario de datos.

---

## Task 1: Migración (config + ledger + log)

**Files:** Create `supabase/migrations/20260617000001_funnel_meta_audiences.sql`

- [ ] **Step 1: Escribir la migración**
```sql
-- Públicos de Meta por etapa del embudo (sincronización desde el CRM).
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta).

-- Config: 1 fila por etapa con público (audience_id de Meta).
create table if not exists public.funnel_meta_audiences (
  stage        text primary key,           -- 'clase_gratuita' | 'request' | ... (DEAL_STAGES)
  audience_id  text not null,
  name         text not null,
  exclude_from_prospecting boolean not null default false,  -- captured/lost = true
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Ledger: qué contacto está en qué público (para el diff idempotente add/remove).
create table if not exists public.funnel_meta_audience_members (
  id            bigserial primary key,
  stage         text not null,
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  hashed_email  text,
  hashed_phone  text,
  status        text not null default 'active' check (status in ('active','removed')),
  last_synced_at timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (stage, contact_id)
);
create index if not exists idx_fma_members_stage_status on public.funnel_meta_audience_members (stage, status);

-- Telemetría por corrida.
create table if not exists public.funnel_meta_sync_log (
  id           bigserial primary key,
  run_at       timestamptz not null default now(),
  stage        text,
  added        int default 0,
  removed      int default 0,
  num_received int,
  error        text
);

-- RLS: sin policies → solo service-role (anon/authenticated denegados).
alter table public.funnel_meta_audiences enable row level security;
alter table public.funnel_meta_audience_members enable row level security;
alter table public.funnel_meta_sync_log enable row level security;
```

- [ ] **Step 2: Aplicar en el SQL Editor + verificar** (`select count(*) from public.funnel_meta_audiences;` → 0; idem las otras dos).

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260617000001_funnel_meta_audiences.sql
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(db): funnel_meta_audiences + member ledger + sync log (públicos por etapa)"
```

---

## Task 2: `lib/marketing/audience-hash.ts` (TDD)

**Files:** Create `lib/marketing/audience-hash.ts`, `lib/marketing/audience-hash.test.ts`

- [ ] **Step 1: Test que falla**
```ts
import { describe, it, expect } from 'vitest'
import { CUSTOMER_LIST_SCHEMA, hashContactRow } from './audience-hash'
import { createHash } from 'node:crypto'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

describe('hashContactRow', () => {
  it('schema fijo EMAIL,PHONE,FN,LN,CT,COUNTRY', () => {
    expect(CUSTOMER_LIST_SCHEMA).toEqual(['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'COUNTRY'])
  })
  it('hashea email lower+trim, phone normalizado AR, nombre split, country ar', () => {
    const row = hashContactRow({ fullName: 'Juan Pérez', email: ' Juan@Mail.com ', phone: '011 15-1234-5678', city: 'CABA' })
    expect(row).toEqual([
      sha('juan@mail.com'),
      sha('5491112345678'),
      sha('juan'),
      sha('pérez'),
      sha('caba'),
      sha('ar'),
    ])
  })
  it('campos faltantes → cadena vacía en esa posición', () => {
    const row = hashContactRow({ fullName: 'Ana', email: null, phone: null })
    expect(row[0]).toBe('') // email
    expect(row[1]).toBe('') // phone
    expect(row[2]).toBe(sha('ana'))
  })
})
```

- [ ] **Step 2: Correr → falla.** Run: `npm run test -- lib/marketing/audience-hash.test.ts`

- [ ] **Step 3: Implementar**
```ts
import { createHash } from 'node:crypto'
import { normalizeArPhone } from './normalize-phone'

export const CUSTOMER_LIST_SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'COUNTRY'] as const

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export interface ContactPii {
  fullName: string
  email?: string | null
  phone?: string | null
  city?: string | null
}

/** Devuelve una fila de hashes alineada a CUSTOMER_LIST_SCHEMA ('' donde falte). */
export function hashContactRow(c: ContactPii): string[] {
  const email = c.email?.trim().toLowerCase()
  const phone = c.phone ? normalizeArPhone(c.phone) : ''
  const parts = (c.fullName ?? '').trim().split(/\s+/)
  const fn = parts[0] ?? ''
  const ln = parts.slice(1).join(' ')
  const city = c.city?.trim().toLowerCase().replace(/\s+/g, '')
  return [
    email ? sha256(email) : '',
    phone ? sha256(phone) : '',
    fn ? sha256(fn.toLowerCase()) : '',
    ln ? sha256(ln.toLowerCase()) : '',
    city ? sha256(city) : '',
    (email || phone) ? sha256('ar') : '', // country solo si hay algún identificador
  ]
}

/** Identificador estable del miembro para el ledger (email hash, sino phone hash). */
export function memberKey(c: ContactPii): { hashedEmail: string | null; hashedPhone: string | null } {
  const email = c.email?.trim().toLowerCase()
  const phone = c.phone ? normalizeArPhone(c.phone) : ''
  return { hashedEmail: email ? sha256(email) : null, hashedPhone: phone ? sha256(phone) : null }
}
```

- [ ] **Step 4: Correr → pasa** (3 tests). **Step 5: Commit**
```bash
git add lib/marketing/audience-hash.ts lib/marketing/audience-hash.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(meta): audience-hash (normaliza+SHA256 para customer-list, reusa normalizeArPhone)"
```

---

## Task 3: Extender `meta-custom-audiences.ts` (CUSTOM + /users)

**Files:** Modify `lib/marketing/meta-custom-audiences.ts`

- [ ] **Step 1: Leer el archivo** y reusar su `getMeta()` (accountId + token) + `META`/`META_API_VERSION`. Agregar (sin tocar `createWebsiteAudience`):
```ts
/** Crea una audiencia customer-list (CUSTOM). Devuelve el audience_id. */
export async function createCustomerListAudience(name: string, description: string): Promise<string> {
  const { accountId, accessToken } = getMeta()
  const res = await fetch(`${META}/${META_API_VERSION}/${accountId}/customaudiences?access_token=${accessToken}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: name.slice(0, 50),
      description: description.slice(0, 200),
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
    }),
  })
  const json = (await res.json()) as { id?: string; error?: { message: string; error_subcode?: number } }
  if (!res.ok || !json.id) {
    throw new Error(`createCustomerListAudience failed: ${json.error?.message ?? res.status} (subcode ${json.error?.error_subcode ?? '-'})`)
  }
  return json.id
}

const SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'COUNTRY']

async function usersOp(method: 'POST' | 'DELETE', audienceId: string, rows: string[][]): Promise<{ ok: boolean; numReceived: number; error?: string }> {
  if (rows.length === 0) return { ok: true, numReceived: 0 }
  const { accessToken } = getMeta()
  const res = await fetch(`${META}/${META_API_VERSION}/${audienceId}/users?access_token=${accessToken}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: { schema: SCHEMA, data: rows } }),
  })
  const json = (await res.json()) as { num_received?: number; error?: { message: string; error_subcode?: number } }
  if (!res.ok) return { ok: false, numReceived: 0, error: `${json.error?.message ?? res.status} (subcode ${json.error?.error_subcode ?? '-'})` }
  return { ok: true, numReceived: json.num_received ?? 0 }
}

/** Alta de miembros (batch ≤10k). rows = filas de hashes alineadas a SCHEMA. */
export async function addUsersToAudience(audienceId: string, rows: string[][]) {
  return usersOp('POST', audienceId, rows)
}
/** Baja de miembros (mismos hashes que el alta). */
export async function removeUsersFromAudience(audienceId: string, rows: string[][]) {
  return usersOp('DELETE', audienceId, rows)
}
```
> Si `getMeta`/`META`/`META_API_VERSION` no son accesibles en el módulo, ajustá a como estén definidos (leé el archivo). NO rompas `createWebsiteAudience`/`createAudiencesForCampaign`.

- [ ] **Step 2: Typecheck** `npx tsc --noEmit 2>&1 | grep meta-custom || echo ok`. **Step 3: Commit**
```bash
git add lib/marketing/meta-custom-audiences.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(meta): createCustomerListAudience + add/removeUsersFromAudience (/users)"
```

---

## Task 4: `lib/marketing/funnel-audience-sync.ts` (TDD del diff)

**Files:** Create `lib/marketing/funnel-audience-sync.ts`, `lib/marketing/funnel-audience-sync.test.ts`

- [ ] **Step 1: Test del diff puro (que falla)**
```ts
import { describe, it, expect } from 'vitest'
import { computeDiff } from './funnel-audience-sync'

describe('computeDiff', () => {
  it('toAdd = deseados no en ledger; toRemove = en ledger pero ya no deseados', () => {
    const desired = new Set(['c1', 'c2', 'c3'])
    const ledger = new Set(['c2', 'c4'])
    const { toAdd, toRemove } = computeDiff(desired, ledger)
    expect(toAdd.sort()).toEqual(['c1', 'c3'])
    expect(toRemove.sort()).toEqual(['c4'])
  })
  it('sin cambios → vacíos', () => {
    const { toAdd, toRemove } = computeDiff(new Set(['a']), new Set(['a']))
    expect(toAdd).toEqual([]); expect(toRemove).toEqual([])
  })
})
```

- [ ] **Step 2: Correr → falla.**

- [ ] **Step 3: Implementar**
```ts
import { createClient } from '@supabase/supabase-js'
import {
  createCustomerListAudience,
  addUsersToAudience,
  removeUsersFromAudience,
} from './meta-custom-audiences'
import { hashContactRow, memberKey, type ContactPii } from './audience-hash'

/** Etapa → nombre de público + si se excluye del prospecting. */
export const STAGE_AUDIENCES: { stage: string; name: string; excludeFromProspecting: boolean }[] = [
  { stage: 'clase_gratuita', name: 'CRM · Registró Clase', excludeFromProspecting: false },
  { stage: 'request', name: 'CRM · Solicitó Tasación', excludeFromProspecting: false },
  { stage: 'scheduled', name: 'CRM · Tasación Coordinada', excludeFromProspecting: false },
  { stage: 'visited', name: 'CRM · Visita Realizada', excludeFromProspecting: false },
  { stage: 'appraisal_sent', name: 'CRM · Tasación Entregada', excludeFromProspecting: false },
  { stage: 'followup', name: 'CRM · En Seguimiento', excludeFromProspecting: false },
  { stage: 'captured', name: 'CRM · Captado', excludeFromProspecting: true },
  { stage: 'lost', name: 'CRM · Perdido', excludeFromProspecting: true },
]

export function computeDiff(desired: Set<string>, ledger: Set<string>): { toAdd: string[]; toRemove: string[] } {
  const toAdd = [...desired].filter((x) => !ledger.has(x))
  const toRemove = [...ledger].filter((x) => !desired.has(x))
  return { toAdd, toRemove }
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Crea en Meta los públicos que falten y los registra en funnel_meta_audiences. */
export async function ensureStageAudiences(): Promise<Record<string, string>> {
  const supabase = admin()
  const { data: existing } = await supabase.from('funnel_meta_audiences').select('stage, audience_id')
  const map: Record<string, string> = {}
  for (const row of (existing ?? []) as { stage: string; audience_id: string }[]) map[row.stage] = row.audience_id
  for (const a of STAGE_AUDIENCES) {
    if (map[a.stage]) continue
    const audienceId = await createCustomerListAudience(a.name, `Público CRM etapa ${a.stage}`)
    await supabase.from('funnel_meta_audiences').insert({
      stage: a.stage, audience_id: audienceId, name: a.name, exclude_from_prospecting: a.excludeFromProspecting,
    })
    map[a.stage] = audienceId
  }
  return map
}

interface DealContact { contact_id: string; stage: string; contacts: ContactPii }

/** Sincroniza TODAS las etapas: reconcilia deseado (deals en la etapa) vs ledger. Best-effort. */
export async function syncAllStages(): Promise<{ stage: string; added: number; removed: number; error?: string }[]> {
  const supabase = admin()
  const audiences = await ensureStageAudiences()
  const results: { stage: string; added: number; removed: number; error?: string }[] = []

  // Traer deals de origin embudo/clase_gratuita con su contacto, agrupar por stage.
  const { data: deals } = await supabase
    .from('deals')
    .select('contact_id, stage, contacts:contact_id ( id, full_name, email, phone, neighborhood )')
    .in('origin', ['embudo', 'clase_gratuita'])
  const byStage = new Map<string, Map<string, ContactPii>>()
  for (const d of (deals ?? []) as unknown as DealContact[]) {
    if (!d.contact_id || !d.contacts) continue
    if (!byStage.has(d.stage)) byStage.set(d.stage, new Map())
    byStage.get(d.stage)!.set(d.contact_id, {
      fullName: d.contacts.fullName ?? (d.contacts as { full_name?: string }).full_name ?? '',
      email: d.contacts.email, phone: d.contacts.phone,
      city: (d.contacts as { neighborhood?: string }).neighborhood ?? null,
    })
  }

  for (const a of STAGE_AUDIENCES) {
    try {
      const audienceId = audiences[a.stage]
      const desiredMap = byStage.get(a.stage) ?? new Map<string, ContactPii>()
      const desired = new Set(desiredMap.keys())
      const { data: led } = await supabase
        .from('funnel_meta_audience_members')
        .select('contact_id').eq('stage', a.stage).eq('status', 'active')
      const ledger = new Set(((led ?? []) as { contact_id: string }[]).map((r) => r.contact_id))
      const { toAdd, toRemove } = computeDiff(desired, ledger)

      // Altas
      if (toAdd.length) {
        const rows = toAdd.map((cid) => hashContactRow(desiredMap.get(cid)!))
        const r = await addUsersToAudience(audienceId, rows)
        for (const cid of toAdd) {
          const mk = memberKey(desiredMap.get(cid)!)
          await supabase.from('funnel_meta_audience_members').upsert(
            { stage: a.stage, contact_id: cid, hashed_email: mk.hashedEmail, hashed_phone: mk.hashedPhone, status: 'active', last_synced_at: new Date().toISOString() },
            { onConflict: 'stage,contact_id' },
          )
        }
        if (!r.ok) throw new Error(r.error)
      }
      // Bajas (mismos hashes guardados en el ledger → reconstruir fila desde hashed_*)
      if (toRemove.length) {
        const { data: rows2 } = await supabase
          .from('funnel_meta_audience_members')
          .select('contact_id, hashed_email, hashed_phone').eq('stage', a.stage).in('contact_id', toRemove)
        const delRows = ((rows2 ?? []) as { hashed_email: string | null; hashed_phone: string | null }[])
          .map((m) => [m.hashed_email ?? '', m.hashed_phone ?? '', '', '', '', ''])
        const r = await removeUsersFromAudience(audienceId, delRows)
        await supabase.from('funnel_meta_audience_members')
          .update({ status: 'removed', last_synced_at: new Date().toISOString() })
          .eq('stage', a.stage).in('contact_id', toRemove)
        if (!r.ok) throw new Error(r.error)
      }

      await supabase.from('funnel_meta_sync_log').insert({ stage: a.stage, added: toAdd.length, removed: toRemove.length })
      results.push({ stage: a.stage, added: toAdd.length, removed: toRemove.length })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await supabase.from('funnel_meta_sync_log').insert({ stage: a.stage, error: msg })
      results.push({ stage: a.stage, added: 0, removed: 0, error: msg })
    }
  }
  return results
}
```
> Ajustar el nombre de la relación `contacts:contact_id(...)` y el campo de ciudad (`neighborhood`) a lo que exista realmente (leé `getDeals` en deals.ts + el schema de contacts). El gate es `tsc` limpio. La forma del row de `contacts` embebido la define supabase-js — castear con cuidado.

- [ ] **Step 4: Correr el test del diff → pasa.** **Step 5: tsc.** **Step 6: Commit**
```bash
git add lib/marketing/funnel-audience-sync.ts lib/marketing/funnel-audience-sync.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(meta): funnel-audience-sync (ensure audiences + reconciliación diff por etapa)"
```

---

## Task 5: Worker `/api/cron/meta-audience-sync`

**Files:** Create `app/api/cron/meta-audience-sync/route.ts`

- [ ] **Step 1: Implementar** (copiar el patrón de auth de `app/api/cron/send-report/route.ts`: `isAuthorized` con `CRON_SECRET` o tabla `cron_config`)
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncAllStages } from '@/lib/marketing/funnel-audience-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'meta_audience_sync').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && provided === dbSecret
  } catch {
    return false
  }
}

async function handle(req: NextRequest) {
  if (req.nextUrl.searchParams.get('ping') === '1') return NextResponse.json({ ok: true })
  const secret = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('secret')
  if (!(await isAuthorized(secret))) return NextResponse.json({ error: 'unauthorized' }, { status: 403 })
  try {
    const results = await syncAllStages()
    return NextResponse.json({ ok: true, results })
  } catch (e) {
    console.error('[meta-audience-sync]', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) { return handle(req) }
export async function GET(req: NextRequest) { return handle(req) }
```

- [ ] **Step 2: tsc + lint.** **Step 3: Commit**
```bash
git add app/api/cron/meta-audience-sync/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(cron): /api/cron/meta-audience-sync (x-cron-secret → syncAllStages)"
```

---

## Task 6: Agendar el cron (Supabase pg_cron) — migración (usuario aplica)

**Files:** Create `supabase/migrations/20260617000002_cron_meta_audience_sync.sql`

- [ ] **Step 1: Escribir la migración** (patrón de `20260606000002_cron_publish_listings.sql`: copia el `command` de un cron existente y cambia la URL; cada 30 min)
```sql
-- Agenda el sync de públicos cada 30 min vía pg_cron + pg_net (POST a la ruta Next con x-cron-secret).
do $$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where command ilike '%/api/cron/%' limit 1;
  if v_cmd is null then raise exception 'No hay cron previo para copiar el patrón net.http_post'; end if;
  v_cmd := regexp_replace(v_cmd, 'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?', 'https://inmodf.com.ar/api/cron/meta-audience-sync');
  if exists (select 1 from cron.job where jobname = 'meta-audience-sync') then perform cron.unschedule('meta-audience-sync'); end if;
  perform cron.schedule('meta-audience-sync', '*/30 * * * *', v_cmd);
  raise notice 'OK: job meta-audience-sync agendado (*/30).';
end $$;
```

- [ ] **Step 2:** Aplicar en el SQL Editor. Verificar 3 capas: `select jobname, schedule from cron.job where jobname='meta-audience-sync'` / tras una corrida `cron.job_run_details` / `net._http_response` (status 200). **Pero NO habilitar hasta validar el canal (Task 9) + ToS/Advanced Access** — el usuario aplica esta migración cuando dé el go-live.

- [ ] **Step 3: Commit**
```bash
git add supabase/migrations/20260617000002_cron_meta_audience_sync.sql
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(cron): agendar meta-audience-sync (pg_cron */30)"
```

---

## Task 7: Exclusión de convertidos en el campaign builder

**Files:** Modify `lib/marketing/meta-campaign-builder.ts`

- [ ] **Step 1:** Antes de armar el AdSet, leer los audience_ids de las etapas `exclude_from_prospecting=true` (captured/lost) desde `funnel_meta_audiences` (admin client), y agregarlos al `targeting` del AdSet como `excluded_custom_audiences: [{id}, ...]` SOLO si existen. NO tocar `advantage_audience`/age caps/promoted_object. Best-effort (si la query falla o no hay audiencias, seguir sin exclusión). Mostrá el fragmento exacto integrado al spec de targeting (`targetingWithAdvantage`).

- [ ] **Step 2: tsc + lint.** **Step 3: Commit**
```bash
git add lib/marketing/meta-campaign-builder.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(meta): excluir públicos Captado/Perdido del prospecting (excluded_custom_audiences)"
```

---

## Task 8: Privacidad

**Files:** Modify `app/privacidad/page.tsx`

- [ ] **Step 1:** Agregar un párrafo: los datos de contacto de quienes se registran en los funnels pueden usarse para crear Públicos Personalizados en Meta (Facebook/Instagram) con fines publicitarios, hasheados, y que pueden solicitar su exclusión. (Texto sobrio, en español.) **Step 2: Commit**
```bash
git add app/privacidad/page.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "docs(privacidad): uso de datos para Públicos Personalizados de Meta"
```

---

## Task 9: Verificación + validación SEGURA del canal /users

- [ ] **Step 1: Tests + tsc + lint + build**
```bash
npm run test -- lib/marketing
npx tsc --noEmit | grep -E 'error TS' | head || echo "tsc limpio"
npx eslint lib/marketing app/api/cron/meta-audience-sync
npx next build --webpack 2>&1 | tail -12   # único error aceptable: @react-pdf/renderer (ajeno)
```

- [ ] **Step 2: Smoke SEGURO del canal /users (sin PII real).** PRE: el usuario aceptó los Custom Audience ToS. Con `node --env-file=.env.local --import tsx` (o un endpoint temporal), crear UNA audiencia de prueba, subir 1 contacto INVENTADO hasheado, confirmar `num_received: 1`, removerlo, y borrar la audiencia. Esto valida el canal sin tocar contactos reales. (Si da `200/1870090` → faltan los ToS; si capability error → falta Advanced Access.) Documentá el resultado.

- [ ] **Step 3: Go-live (decisión del usuario, NO automático).** Tras ToS + Advanced Access confirmados: aplicar la migración Task 6, y disparar UNA corrida manual del cron (`curl -H 'x-cron-secret: <CRON_SECRET>' https://inmodf.com.ar/api/cron/meta-audience-sync`). Verificar en `funnel_meta_sync_log` (added/removed por etapa) + en Meta Ads (las 8 audiencias creadas, poblándose; Meta tarda ~24h en matchear). Confirmar que `captured`/`lost` quedan marcadas para exclusión.

- [ ] **Step 4: Commit final (si hubo ajustes).**

---

## Self-Review

**Spec coverage (§7):** público por etapa (Task 1/4) ✅; mover al avanzar (reconciliación por estado actual → sale del anterior, entra al nuevo) ✅; excluir captured/lost del prospecting (Task 7) ✅; hashing SHA-256 + teléfono AR (Task 2, reusa normalizeArPhone) ✅; worker pg_cron + x-cron-secret, pg_net POST-only → DELETE desde la ruta (Task 5/6) ✅; idempotencia vía ledger + diff (Task 4) ✅; telemetría (funnel_meta_sync_log) ✅; solo origin embudo/clase_gratuita ✅; ToS/Advanced Access como prereqs ✅; privacidad (Task 8) ✅.

**Placeholder scan:** sin TBD. Los `> Ajustar a la firma real` son instrucciones de implementación (leer el archivo), no placeholders de contenido.

**Type consistency:** `ContactPii`/`hashContactRow`/`memberKey` (Task 2) usados en sync (Task 4); `STAGE_AUDIENCES`/`computeDiff` (Task 4) usados en el worker (Task 5); `createCustomerListAudience`/`add/removeUsersFromAudience` (Task 3) usados en sync (Task 4).

**Riesgos a vigilar:** (1) la forma del `contacts` embebido en supabase-js (castear bien; campo ciudad = `neighborhood`?). (2) `/users` requiere ToS + Advanced Access (validar en Task 9 antes del go-live). (3) batch ≤10k (hoy el volumen es bajo; si crece, paginar — `log()` si se trunca). (4) NO romper los gotchas del campaign builder (Task 7 es aditivo).

## Notas para Fase 5
- El corte de dominio no afecta este cron (corre sobre el CRM, independiente del dominio público).
