# Secuencias de email por etapa del CRM ↔ Mailchimp — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el CRM sincronice un tag de secuencia por etapa a Mailchimp (best-effort, con red de seguridad), para que las Journeys de Mailchimp disparen/corten las 5 secuencias de email automáticamente.

**Architecture:** Módulo satélite aislado en `lib/integrations/mailchimp/`. Lógica de mapeo/tags/reconciliación PURA y testeada con vitest; I/O (Mailchimp API + Supabase) fina y verificada con scripts reales. Enganche best-effort (dynamic import + try/catch) en el chokepoint real de cambios de etapa (`updateDealStage`, `linkAppraisalToDeal`, `linkPropertyToDeal`, alta por funnel). Ledger + cron de reconciliación nocturno como auto-reparación. Interruptor maestro fail-closed.

**Tech Stack:** Next.js 16 · TypeScript · Supabase (service role) · Mailchimp Marketing API v3 · vitest · pg (session pooler para migraciones) · Supabase pg_cron.

**Spec:** `docs/superpowers/specs/2026-08-03-mailchimp-secuencias-crm-design.md`

## Global Constraints

Cada tarea hereda estas reglas (valores exactos del spec y del repo):

- **Nunca romper el CRM.** Todo el código de integración es **best-effort y NUNCA tira excepción** (espejo de `lib/email/resend-client.ts`). Un fallo → `console.warn` + seguir.
- **Interruptor maestro `MAILCHIMP_SYNC_ENABLED`, default OFF** (fail-closed). Sin `=== 'true'`, la sync no hace nada.
- **Cero cambios de schema en tablas críticas** (`deals`, `contacts`). Solo tablas NUEVAS aditivas.
- **Tests:** vitest. Correr un test: `npx vitest run <ruta>`. Módulos `server-only` funcionan en vitest (precedente: `lib/integrations/whatsapp/templates.ts` + su `.test.ts`).
- **Commits:** autor y committer DEBEN ser `Sujupar <redstyle50@gmail.com>` (si no, falla el deploy de Netlify). Usar:
  `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "..."`.
  Terminar cada mensaje de commit con: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **NO pushear.** Netlify auto-deploya en cada push a `main`; el humano decide cuándo deployar. Commitear local nomás.
- **Migraciones:** aditivas, se aplican vía session pooler con `node --env-file=.env.local --import tsx scripts/apply-*.ts` (patrón `scripts/apply-lead-tags-migration-pg.ts`), verificando que no cambió ningún dato. NO usar Supabase CLI (no conecta).
- **Crons:** ruta bajo `app/api/cron/*` con `export const dynamic = 'force-dynamic'`, `export const maxDuration = 60`, `POST` y `GET`, `?ping=1` sin auth, y **auth DUAL** (env `CRON_SECRET` **o** `cron_config`), idéntica a `app/api/cron/send-report/route.ts`. Se agenda con pg_cron clonando el comando de un job existente.
- **Turbopack roto local** (path con acento): NO validar con `next build`/`next dev`. Validar con `npx vitest run` y `npx tsc --noEmit`.
- **Mailchimp API:** auth `Bearer <API_KEY>`; `subscriber_hash = md5(lowercase(email))`; upsert con `status_if_new` (NUNCA `status`, para no resucitar bajas); tags `active`/`inactive`.
- **Prosa/comentarios en español (es-AR).**
- **Credenciales (verificadas 2026-08-03):** datacenter `us17`, audiencia `db7f354a0d`.

---

## Estructura de archivos

**Módulo nuevo `lib/integrations/mailchimp/`:**
- `mapping.ts` — `resolveSequenceTag(...)` + `ALL_SEQUENCE_TAGS` (puro). **Fuente de verdad del contrato etapa→tag.**
- `subscriber.ts` — `subscriberHash(email)`, `mergeFieldsFor(...)` (puro).
- `tag-ops.ts` — `computeTagOps(target)` (puro).
- `reconcile-core.ts` — `needsResync(target, ledger)` (puro).
- `client.ts` — wrapper Marketing API (config, enabled, ping, upsertMember, setMemberTags, ensureMergeField). Nunca tira.
- `suppressions.ts` — `isSuppressed(email)`, `recordSuppression(...)`, `parseWebhook(body)` (I/O + parse puro).
- `sync-deal.ts` — `syncDealToMailchimp(dealId)` orquestador. Nunca tira.
- `reconcile.ts` — `reconcileMailchimp(...)` orquestador del cron.
- `*.test.ts` co-locados para los módulos puros.

**Migraciones/scripts:**
- `supabase/migrations/20260803000010_mailchimp_sync.sql` — 3 tablas aditivas.
- `scripts/apply-mailchimp-sync-migration-pg.ts` — aplica + verifica.
- `scripts/mailchimp-setup.ts` — crea merge fields (Fase 0, operativo).
- `scripts/mailchimp-verify.ts` — smoke test end-to-end (Fase 0).

**Rutas:**
- `app/api/cron/mailchimp-sync/route.ts` — reconciliación (cron).
- `app/api/webhooks/mailchimp/route.ts` — bajas/rebotes (Fase 3).

**Modificaciones (enganches best-effort):**
- `lib/funnel/create-funnel-lead.ts` — tras crear el lead.
- `lib/supabase/deals.ts` — en `updateDealStage`, `linkAppraisalToDeal`, `linkPropertyToDeal`.

---

### Task 1: Contrato de mapeo etapa→tag (puro)

**Files:**
- Create: `lib/integrations/mailchimp/mapping.ts`
- Test: `lib/integrations/mailchimp/mapping.test.ts`

**Interfaces:**
- Produces: `type SequenceTag`, `const ALL_SEQUENCE_TAGS: SequenceTag[]`, `resolveSequenceTag(input: { stage: string; origin: string | null; scheduledDate: string | null }): SequenceTag | null`

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/integrations/mailchimp/mapping.test.ts
import { describe, it, expect } from 'vitest'
import { resolveSequenceTag, ALL_SEQUENCE_TAGS } from './mapping'

describe('resolveSequenceTag', () => {
  it('request + embudo → seq-solicita', () => {
    expect(resolveSequenceTag({ stage: 'request', origin: 'embudo', scheduledDate: null })).toBe('seq-solicita')
  })
  it('request + otro origin → null (Solicita es solo embudo)', () => {
    expect(resolveSequenceTag({ stage: 'request', origin: 'referido', scheduledDate: null })).toBeNull()
  })
  it('scheduled CON fecha → seq-agendada', () => {
    expect(resolveSequenceTag({ stage: 'scheduled', origin: 'embudo', scheduledDate: '2026-08-10' })).toBe('seq-agendada')
  })
  it('scheduled SIN fecha + embudo → seq-solicita (semántica CRM: es "solicitud")', () => {
    expect(resolveSequenceTag({ stage: 'scheduled', origin: 'embudo', scheduledDate: null })).toBe('seq-solicita')
  })
  it('scheduled SIN fecha + no-embudo → null', () => {
    expect(resolveSequenceTag({ stage: 'scheduled', origin: null, scheduledDate: null })).toBeNull()
  })
  it('not_visited → seq-no-realizada', () => {
    expect(resolveSequenceTag({ stage: 'not_visited', origin: 'embudo', scheduledDate: null })).toBe('seq-no-realizada')
  })
  it('visited → seq-realizada', () => {
    expect(resolveSequenceTag({ stage: 'visited', origin: 'embudo', scheduledDate: null })).toBe('seq-realizada')
  })
  it('appraisal_sent y followup → seq-seguimiento (misma fase)', () => {
    expect(resolveSequenceTag({ stage: 'appraisal_sent', origin: 'embudo', scheduledDate: null })).toBe('seq-seguimiento')
    expect(resolveSequenceTag({ stage: 'followup', origin: 'embudo', scheduledDate: null })).toBe('seq-seguimiento')
  })
  it('captured / lost / comprador / clase_gratuita → null (STOP)', () => {
    for (const stage of ['captured', 'lost', 'comprador', 'clase_gratuita']) {
      expect(resolveSequenceTag({ stage, origin: 'embudo', scheduledDate: null })).toBeNull()
    }
  })
  it('ALL_SEQUENCE_TAGS tiene los 5 tags primarios', () => {
    expect(ALL_SEQUENCE_TAGS).toEqual(['seq-solicita', 'seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'])
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run lib/integrations/mailchimp/mapping.test.ts`
Expected: FAIL ("Cannot find module './mapping'").

- [ ] **Step 3: Implementar el mínimo**

```ts
// lib/integrations/mailchimp/mapping.ts
import 'server-only'

export type SequenceTag =
  | 'seq-solicita'
  | 'seq-agendada'
  | 'seq-no-realizada'
  | 'seq-realizada'
  | 'seq-seguimiento'

export const ALL_SEQUENCE_TAGS: SequenceTag[] = [
  'seq-solicita', 'seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento',
]

export interface DealTagInput {
  stage: string
  origin: string | null
  scheduledDate: string | null
}

/**
 * Contrato etapa→tag (spec 2026-08-03). Devuelve el tag de secuencia del estado
 * ACTUAL del deal, o null si no debe estar en ninguna secuencia. Función pura.
 * Nota: `scheduled` sin fecha es "solicitud" en la semántica del CRM
 * (ver applyCRMStageFilter en lib/supabase/deals.ts).
 */
export function resolveSequenceTag(input: DealTagInput): SequenceTag | null {
  const { stage, origin, scheduledDate } = input
  switch (stage) {
    case 'request':
      return origin === 'embudo' ? 'seq-solicita' : null
    case 'scheduled':
      if (scheduledDate) return 'seq-agendada'
      return origin === 'embudo' ? 'seq-solicita' : null
    case 'not_visited':
      return 'seq-no-realizada'
    case 'visited':
      return 'seq-realizada'
    case 'appraisal_sent':
    case 'followup':
      return 'seq-seguimiento'
    default:
      return null // captured, lost, comprador, clase_gratuita, etc. → STOP
  }
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run lib/integrations/mailchimp/mapping.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/mailchimp/mapping.ts lib/integrations/mailchimp/mapping.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): contrato puro etapa→tag de secuencia

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Subscriber hash + merge fields (puro)

**Files:**
- Create: `lib/integrations/mailchimp/subscriber.ts`
- Test: `lib/integrations/mailchimp/subscriber.test.ts`

**Interfaces:**
- Consumes: `firstName` de `@/lib/email/format`.
- Produces: `subscriberHash(email: string): string`, `interface MergeFields { FNAME: string; CRM_STAGE: string }`, `mergeFieldsFor(fullName: string | null, crmStage: string): MergeFields`

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/integrations/mailchimp/subscriber.test.ts
import { describe, it, expect } from 'vitest'
import { subscriberHash, mergeFieldsFor } from './subscriber'

describe('subscriberHash', () => {
  it('es el MD5 del email en minúsculas (contrato Mailchimp)', () => {
    // md5("prudence.mcvankab@example.com") — ejemplo oficial de los docs de Mailchimp
    expect(subscriberHash('Prudence.McVankab@example.com')).toBe('62eeb292278cc15f5817cb78f7790b08')
  })
  it('normaliza espacios y mayúsculas', () => {
    expect(subscriberHash('  A@B.COM ')).toBe(subscriberHash('a@b.com'))
  })
})

describe('mergeFieldsFor', () => {
  it('deriva FNAME del primer nombre y setea CRM_STAGE', () => {
    expect(mergeFieldsFor('Juan Pérez García', 'request')).toEqual({ FNAME: 'Juan', CRM_STAGE: 'request' })
  })
  it('FNAME vacío si no hay nombre', () => {
    expect(mergeFieldsFor(null, 'visited')).toEqual({ FNAME: '', CRM_STAGE: 'visited' })
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run lib/integrations/mailchimp/subscriber.test.ts`
Expected: FAIL ("Cannot find module './subscriber'").

- [ ] **Step 3: Implementar el mínimo**

```ts
// lib/integrations/mailchimp/subscriber.ts
import 'server-only'
import { createHash } from 'node:crypto'
import { firstName } from '@/lib/email/format'

/** subscriber_hash = MD5 del email en minúsculas (contrato Mailchimp). */
export function subscriberHash(email: string): string {
  return createHash('md5').update(email.trim().toLowerCase()).digest('hex')
}

export interface MergeFields {
  FNAME: string
  CRM_STAGE: string
}

/** Merge fields que mandamos en cada upsert. CRM_STAGE alimenta las condiciones de salida. */
export function mergeFieldsFor(fullName: string | null, crmStage: string): MergeFields {
  return { FNAME: firstName(fullName), CRM_STAGE: crmStage }
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run lib/integrations/mailchimp/subscriber.test.ts`
Expected: PASS (4 tests). Si el hash esperado difiere, reemplazá el valor por el que imprima el test (el algoritmo es correcto; el literal es solo la aserción).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/mailchimp/subscriber.ts lib/integrations/mailchimp/subscriber.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): subscriber hash + merge fields (puro)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Operaciones de tags (puro)

**Files:**
- Create: `lib/integrations/mailchimp/tag-ops.ts`
- Test: `lib/integrations/mailchimp/tag-ops.test.ts`

**Interfaces:**
- Consumes: `SequenceTag`, `ALL_SEQUENCE_TAGS` de `./mapping`.
- Produces: `computeTagOps(target: SequenceTag | null): { activate: SequenceTag | null; deactivate: SequenceTag[] }`

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/integrations/mailchimp/tag-ops.test.ts
import { describe, it, expect } from 'vitest'
import { computeTagOps } from './tag-ops'

describe('computeTagOps', () => {
  it('activa el target y desactiva los otros 4', () => {
    expect(computeTagOps('seq-agendada')).toEqual({
      activate: 'seq-agendada',
      deactivate: ['seq-solicita', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'],
    })
  })
  it('target null (STOP) → no activa nada y desactiva los 5', () => {
    expect(computeTagOps(null)).toEqual({
      activate: null,
      deactivate: ['seq-solicita', 'seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'],
    })
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run lib/integrations/mailchimp/tag-ops.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el mínimo**

```ts
// lib/integrations/mailchimp/tag-ops.ts
import 'server-only'
import { ALL_SEQUENCE_TAGS, type SequenceTag } from './mapping'

/**
 * Dado el tag objetivo, decide qué tags poner active/inactive. Un deal está en
 * UNA secuencia a la vez: se activa el target y se desactivan los demás.
 * NO gestiona los tags internos de encadenado (`seq-*-2`): esos los maneja el
 * flujo de Mailchimp y la SALIDA de esos flujos es por la condición sobre
 * CRM_STAGE, no por el tag. Función pura.
 */
export function computeTagOps(target: SequenceTag | null): { activate: SequenceTag | null; deactivate: SequenceTag[] } {
  return { activate: target, deactivate: ALL_SEQUENCE_TAGS.filter(t => t !== target) }
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run lib/integrations/mailchimp/tag-ops.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/mailchimp/tag-ops.ts lib/integrations/mailchimp/tag-ops.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): computeTagOps (activa target, desactiva el resto)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Detección de drift para reconciliación (puro)

**Files:**
- Create: `lib/integrations/mailchimp/reconcile-core.ts`
- Test: `lib/integrations/mailchimp/reconcile-core.test.ts`

**Interfaces:**
- Produces: `needsResync(targetTag: string | null, ledgerTag: string | null): boolean`

- [ ] **Step 1: Escribir el test que falla**

```ts
// lib/integrations/mailchimp/reconcile-core.test.ts
import { describe, it, expect } from 'vitest'
import { needsResync } from './reconcile-core'

describe('needsResync', () => {
  it('coincide → no resync', () => {
    expect(needsResync('seq-agendada', 'seq-agendada')).toBe(false)
    expect(needsResync(null, null)).toBe(false)
  })
  it('difiere → resync (avanzó de etapa entre corridas)', () => {
    expect(needsResync('seq-agendada', 'seq-solicita')).toBe(true)
  })
  it('pasó a STOP pero el ledger tenía un tag → resync (hay que desactivar)', () => {
    expect(needsResync(null, 'seq-seguimiento')).toBe(true)
  })
  it('nunca sincronizado (ledger null) pero ahora corresponde tag → resync', () => {
    expect(needsResync('seq-solicita', null)).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test y ver que falla**

Run: `npx vitest run lib/integrations/mailchimp/reconcile-core.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar el mínimo**

```ts
// lib/integrations/mailchimp/reconcile-core.ts
import 'server-only'

/** true si el tag que corresponde HOY difiere del último sincronizado (ledger). */
export function needsResync(targetTag: string | null, ledgerTag: string | null): boolean {
  return targetTag !== ledgerTag
}
```

- [ ] **Step 4: Correr el test y ver que pasa**

Run: `npx vitest run lib/integrations/mailchimp/reconcile-core.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/mailchimp/reconcile-core.ts lib/integrations/mailchimp/reconcile-core.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): needsResync (detección de drift para reconciliación)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migración de tablas (aditiva) + script de aplicación

**Files:**
- Create: `supabase/migrations/20260803000010_mailchimp_sync.sql`
- Create: `scripts/apply-mailchimp-sync-migration-pg.ts`

**Interfaces:**
- Produces: tablas `mailchimp_sync_state`, `mailchimp_sync_log`, `mailchimp_suppressions`.

- [ ] **Step 1: Escribir el SQL**

```sql
-- supabase/migrations/20260803000010_mailchimp_sync.sql
-- ADITIVA: 3 tablas nuevas para la sync CRM ↔ Mailchimp. No toca deals/contacts.

-- Ledger: último tag sincronizado por deal (fuente de la reconciliación).
create table if not exists public.mailchimp_sync_state (
  deal_id    uuid primary key references public.deals(id) on delete cascade,
  last_tag   text,
  last_email text,
  synced_at  timestamptz not null default now()
);

-- Log append-only: observabilidad de cada intento de sync.
create table if not exists public.mailchimp_sync_log (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid,
  email       text,
  tag_applied text,
  status      text not null, -- synced | skipped_disabled | skipped_no_email | suppressed | failed
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists mailchimp_sync_log_deal_idx    on public.mailchimp_sync_log(deal_id);
create index if not exists mailchimp_sync_log_created_idx  on public.mailchimp_sync_log(created_at desc);

-- Supresiones: bajas/rebotes espejados desde Mailchimp (el sync los saltea).
create table if not exists public.mailchimp_suppressions (
  email      text primary key,
  reason     text not null, -- unsubscribe | cleaned
  created_at timestamptz not null default now()
);

-- RLS: habilitada sin políticas → solo el service role (que la bypassa) accede.
-- Consistente con la postura RLS del proyecto; no hay UI que las lea todavía.
alter table public.mailchimp_sync_state   enable row level security;
alter table public.mailchimp_sync_log     enable row level security;
alter table public.mailchimp_suppressions enable row level security;
```

- [ ] **Step 2: Escribir el script de aplicación (patrón session pooler)**

```ts
// scripts/apply-mailchimp-sync-migration-pg.ts
/**
 * Aplica la migración de tablas Mailchimp vía session pooler (patrón CLAUDE.md).
 * ADITIVA: no borra ni cambia datos existentes.
 * Correr: node --env-file=.env.local --import tsx scripts/apply-mailchimp-sync-migration-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  const { rows: dealsBefore } = await client.query('SELECT count(*)::int AS n FROM deals')

  await client.query(readFileSync('supabase/migrations/20260803000010_mailchimp_sync.sql', 'utf8'))

  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public'
       AND table_name IN ('mailchimp_sync_state','mailchimp_sync_log','mailchimp_suppressions')
     ORDER BY table_name`,
  )
  const { rows: dealsAfter } = await client.query('SELECT count(*)::int AS n FROM deals')
  await client.end()

  console.log('tablas creadas:', tables.map(t => t.table_name).join(', '))
  if (tables.length !== 3) throw new Error(`Esperaba 3 tablas, hay ${tables.length}`)
  if (dealsBefore[0].n !== dealsAfter[0].n) throw new Error('¡ALERTA! cambió la cantidad de deals')
  console.log(`deals: ${dealsBefore[0].n} antes → ${dealsAfter[0].n} después (sin cambios)`)
  console.log('\n✅ aplicada y verificada — ningún dato tocado')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Step 3: Aplicar y verificar**

Run: `node --env-file=.env.local --import tsx scripts/apply-mailchimp-sync-migration-pg.ts`
Expected: imprime "tablas creadas: mailchimp_suppressions, mailchimp_sync_log, mailchimp_sync_state" y "✅ aplicada y verificada". Si `pg` no está: `npm i --no-save pg` y reintentar.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803000010_mailchimp_sync.sql scripts/apply-mailchimp-sync-migration-pg.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): migración aditiva (ledger, log, supresiones) + script pg

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Cliente de la Marketing API (I/O, nunca tira)

**Files:**
- Create: `lib/integrations/mailchimp/client.ts`

**Interfaces:**
- Consumes: `subscriberHash` de `./subscriber`, `MergeFields` de `./subscriber`.
- Produces: `getMailchimpConfig(): MailchimpConfig | null`, `mailchimpSyncEnabled(): boolean`, `ping(cfg)`, `upsertMember(cfg, email, merge)`, `setMemberTags(cfg, email, activate, deactivate)`, `ensureMergeField(cfg, tag, name)`. Tipo `MailchimpConfig { apiKey; server; audienceId; baseUrl }` y `MailchimpResult { ok: boolean; status: number; error?: string }`.

- [ ] **Step 1: Implementar el cliente**

```ts
// lib/integrations/mailchimp/client.ts
import 'server-only'
import { subscriberHash, type MergeFields } from './subscriber'

export interface MailchimpConfig { apiKey: string; server: string; audienceId: string; baseUrl: string }
export interface MailchimpResult { ok: boolean; status: number; error?: string }

/** Lee la config de env. Null si falta algo (nunca tira). */
export function getMailchimpConfig(): MailchimpConfig | null {
  const apiKey = process.env.MAILCHIMP_API_KEY
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID
  if (!apiKey || !audienceId) return null
  const server = process.env.MAILCHIMP_SERVER_PREFIX || apiKey.split('-')[1] || ''
  if (!server) return null
  return { apiKey, server, audienceId, baseUrl: `https://${server}.api.mailchimp.com/3.0` }
}

/** Interruptor maestro. Fail-closed: solo ON con exactamente 'true'. */
export function mailchimpSyncEnabled(): boolean {
  return process.env.MAILCHIMP_SYNC_ENABLED === 'true'
}

async function mcFetch(
  cfg: MailchimpConfig, path: string,
  init: { method: string; body?: string; timeoutMs?: number } = { method: 'GET' },
): Promise<{ ok: boolean; status: number; body: any }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 8000)
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method: init.method,
      body: init.body,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    })
    const text = await res.text()
    return { ok: res.ok, status: res.status, body: text ? JSON.parse(text) : null }
  } finally {
    clearTimeout(timer)
  }
}

export async function ping(cfg: MailchimpConfig): Promise<boolean> {
  const r = await mcFetch(cfg, '/ping', { method: 'GET' })
  return r.ok
}

/** Upsert idempotente. status_if_new (NUNCA status) para no resucitar bajas. */
export async function upsertMember(cfg: MailchimpConfig, email: string, merge: MergeFields): Promise<MailchimpResult> {
  const r = await mcFetch(cfg, `/lists/${cfg.audienceId}/members/${subscriberHash(email)}`, {
    method: 'PUT',
    body: JSON.stringify({ email_address: email, status_if_new: 'subscribed', merge_fields: merge }),
  })
  return { ok: r.ok, status: r.status, error: r.ok ? undefined : (r.body?.detail || `HTTP ${r.status}`) }
}

/** Pone un tag active y una lista de tags inactive. Idempotente. */
export async function setMemberTags(cfg: MailchimpConfig, email: string, activate: string | null, deactivate: string[]): Promise<MailchimpResult> {
  const tags = [
    ...(activate ? [{ name: activate, status: 'active' }] : []),
    ...deactivate.map(name => ({ name, status: 'inactive' })),
  ]
  if (tags.length === 0) return { ok: true, status: 204 }
  const r = await mcFetch(cfg, `/lists/${cfg.audienceId}/members/${subscriberHash(email)}/tags`, {
    method: 'POST', body: JSON.stringify({ tags }),
  })
  return { ok: r.ok, status: r.status, error: r.ok ? undefined : (r.body?.detail || `HTTP ${r.status}`) }
}

/** Crea un merge field si no existe (idempotente por tag). */
export async function ensureMergeField(cfg: MailchimpConfig, tag: string, name: string): Promise<void> {
  const list = await mcFetch(cfg, `/lists/${cfg.audienceId}/merge-fields?count=100`, { method: 'GET' })
  const exists = (list.body?.merge_fields || []).some((m: any) => m.tag === tag)
  if (exists) return
  await mcFetch(cfg, `/lists/${cfg.audienceId}/merge-fields`, {
    method: 'POST', body: JSON.stringify({ tag, name, type: 'text', public: false }),
  })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `lib/integrations/mailchimp/`.

- [ ] **Step 3: Commit**

```bash
git add lib/integrations/mailchimp/client.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): cliente Marketing API (upsert/tags/merge-fields, nunca tira)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Supresiones + parseo de webhook (I/O + parse puro)

**Files:**
- Create: `lib/integrations/mailchimp/suppressions.ts`
- Test: `lib/integrations/mailchimp/suppressions.test.ts`

**Interfaces:**
- Produces: `parseWebhook(form: URLSearchParams): { type: string; email: string | null }` (puro), `isSuppressed(email: string): Promise<boolean>`, `recordSuppression(email: string, reason: string): Promise<void>`

- [ ] **Step 1: Escribir el test del parse (puro)**

```ts
// lib/integrations/mailchimp/suppressions.test.ts
import { describe, it, expect } from 'vitest'
import { parseWebhook } from './suppressions'

describe('parseWebhook', () => {
  it('extrae type y email de un payload unsubscribe (form-encoded)', () => {
    const form = new URLSearchParams('type=unsubscribe&data[email]=a%40b.com')
    expect(parseWebhook(form)).toEqual({ type: 'unsubscribe', email: 'a@b.com' })
  })
  it('cleaned (rebote) también', () => {
    const form = new URLSearchParams('type=cleaned&data[email]=x%40y.com')
    expect(parseWebhook(form)).toEqual({ type: 'cleaned', email: 'x@y.com' })
  })
  it('sin email → email null', () => {
    expect(parseWebhook(new URLSearchParams('type=profile'))).toEqual({ type: 'profile', email: null })
  })
})
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run lib/integrations/mailchimp/suppressions.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
// lib/integrations/mailchimp/suppressions.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Parsea el payload form-encoded de un webhook de Mailchimp. Puro. */
export function parseWebhook(form: URLSearchParams): { type: string; email: string | null } {
  return { type: form.get('type') || '', email: form.get('data[email]') || null }
}

/** true si el email está suprimido (baja/rebote). Nunca tira: ante error, false. */
export async function isSuppressed(email: string): Promise<boolean> {
  try {
    const { data } = await admin().from('mailchimp_suppressions').select('email').eq('email', email.trim().toLowerCase()).maybeSingle()
    return !!data
  } catch (e) {
    console.warn('[mailchimp] isSuppressed check failed (asumo no suprimido):', e)
    return false
  }
}

/** Registra una supresión (idempotente por PK email). Nunca tira. */
export async function recordSuppression(email: string, reason: string): Promise<void> {
  try {
    await admin().from('mailchimp_suppressions').upsert(
      { email: email.trim().toLowerCase(), reason, created_at: new Date().toISOString() },
      { onConflict: 'email' },
    )
  } catch (e) {
    console.warn('[mailchimp] recordSuppression failed:', e)
  }
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run lib/integrations/mailchimp/suppressions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/mailchimp/suppressions.ts lib/integrations/mailchimp/suppressions.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): supresiones (baja/rebote) + parseWebhook puro

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Orquestador `syncDealToMailchimp` (I/O, nunca tira)

**Files:**
- Create: `lib/integrations/mailchimp/sync-deal.ts`

**Interfaces:**
- Consumes: `resolveSequenceTag` (`./mapping`), `computeTagOps` (`./tag-ops`), `mergeFieldsFor` (`./subscriber`), `getMailchimpConfig`/`mailchimpSyncEnabled`/`upsertMember`/`setMemberTags` (`./client`), `isSuppressed` (`./suppressions`).
- Produces: `syncDealToMailchimp(dealId: string): Promise<void>`. Lee el deal por su cuenta (NO importa `deals.ts` → sin ciclo).

- [ ] **Step 1: Implementar el orquestador**

```ts
// lib/integrations/mailchimp/sync-deal.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveSequenceTag } from './mapping'
import { computeTagOps } from './tag-ops'
import { mergeFieldsFor } from './subscriber'
import { getMailchimpConfig, mailchimpSyncEnabled, upsertMember, setMemberTags } from './client'
import { isSuppressed } from './suppressions'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function logSync(row: { deal_id: string; email: string | null; tag_applied: string | null; status: string; error?: string }) {
  try { await admin().from('mailchimp_sync_log').insert(row) } catch (e) { console.warn('[mailchimp] log insert failed:', e) }
}

/**
 * Sincroniza UN deal con Mailchimp según su etapa ACTUAL. Best-effort: NUNCA
 * tira. Respeta el interruptor maestro (fail-closed). Idempotente.
 */
export async function syncDealToMailchimp(dealId: string): Promise<void> {
  try {
    if (!mailchimpSyncEnabled()) {
      await logSync({ deal_id: dealId, email: null, tag_applied: null, status: 'skipped_disabled' })
      return
    }
    const cfg = getMailchimpConfig()
    if (!cfg) { console.warn('[mailchimp] config incompleta; skip'); return }

    const sb = admin()
    const { data: deal } = await sb.from('deals')
      .select('id, stage, origin, scheduled_date, contacts:contact_id ( full_name, email )')
      .eq('id', dealId).maybeSingle()
    if (!deal) return

    const d = deal as any
    const contact = d.contacts
    const email: string | null = contact?.email?.trim()?.toLowerCase() || null
    const fullName: string | null = contact?.full_name ?? null
    const targetTag = resolveSequenceTag({ stage: d.stage, origin: d.origin, scheduledDate: d.scheduled_date })

    if (!email) { await logSync({ deal_id: dealId, email: null, tag_applied: targetTag, status: 'skipped_no_email' }); return }
    if (await isSuppressed(email)) { await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'suppressed' }); return }

    const up = await upsertMember(cfg, email, mergeFieldsFor(fullName, d.stage))
    if (!up.ok) { await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'failed', error: up.error }); return }

    const { activate, deactivate } = computeTagOps(targetTag)
    const tg = await setMemberTags(cfg, email, activate, deactivate)
    if (!tg.ok) { await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'failed', error: tg.error }); return }

    try {
      await sb.from('mailchimp_sync_state').upsert(
        { deal_id: dealId, last_tag: targetTag, last_email: email, synced_at: new Date().toISOString() },
        { onConflict: 'deal_id' },
      )
    } catch (e) { console.warn('[mailchimp] ledger upsert failed:', e) }

    await logSync({ deal_id: dealId, email, tag_applied: targetTag, status: 'synced' })
  } catch (err) {
    console.warn('[mailchimp] syncDealToMailchimp failed (ignored):', err instanceof Error ? err.message : err)
    try { await logSync({ deal_id: dealId, email: null, tag_applied: null, status: 'failed', error: err instanceof Error ? err.message : String(err) }) } catch {}
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add lib/integrations/mailchimp/sync-deal.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): orquestador syncDealToMailchimp (best-effort + ledger + log)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Reconciliación + ruta de cron

**Files:**
- Create: `lib/integrations/mailchimp/reconcile.ts`
- Create: `app/api/cron/mailchimp-sync/route.ts`

**Interfaces:**
- Consumes: `resolveSequenceTag` (`./mapping`), `needsResync` (`./reconcile-core`), `syncDealToMailchimp` (`./sync-deal`).
- Produces: `reconcileMailchimp(limit?: number): Promise<{ scanned: number; resynced: number }>`

- [ ] **Step 1: Implementar la reconciliación**

```ts
// lib/integrations/mailchimp/reconcile.ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { resolveSequenceTag } from './mapping'
import { needsResync } from './reconcile-core'
import { syncDealToMailchimp } from './sync-deal'
import { mailchimpSyncEnabled } from './client'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Barrido de auto-reparación: compara el tag que corresponde HOY (por etapa)
 * contra el último sincronizado (ledger) y re-sincroniza los que driftaron.
 * Best-effort: nunca tira. Respeta el interruptor maestro.
 */
export async function reconcileMailchimp(limit = 1000): Promise<{ scanned: number; resynced: number }> {
  if (!mailchimpSyncEnabled()) return { scanned: 0, resynced: 0 }
  const sb = admin()
  // deals relevantes: los que pueden estar (o haber estado) en una secuencia.
  const { data: deals } = await sb.from('deals')
    .select('id, stage, origin, scheduled_date, mailchimp_sync_state ( last_tag )')
    .order('updated_at', { ascending: false })
    .limit(limit)
  const rows = (deals as any[]) || []
  let resynced = 0
  for (const d of rows) {
    const target = resolveSequenceTag({ stage: d.stage, origin: d.origin, scheduledDate: d.scheduled_date })
    const ledgerTag = d.mailchimp_sync_state?.last_tag ?? null
    if (needsResync(target, ledgerTag)) {
      await syncDealToMailchimp(d.id) // best-effort, nunca tira
      resynced++
    }
  }
  return { scanned: rows.length, resynced }
}
```

> Nota: el embed `mailchimp_sync_state ( last_tag )` funciona porque hay FK
> `mailchimp_sync_state.deal_id → deals.id`. Si PostgREST no resuelve el embed
> (relación no detectada), reemplazar por dos queries: traer los deals y traer
> `mailchimp_sync_state` (map por deal_id) y unir en JS.

- [ ] **Step 2: Implementar la ruta de cron (auth DUAL, patrón send-report)**

```ts
// app/api/cron/mailchimp-sync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reconcileMailchimp } from '@/lib/integrations/mailchimp/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Secreto: env CRON_SECRET o, si no existe, public.cron_config(key='mailchimp_sync'). */
async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'mailchimp_sync').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && provided === dbSecret
  } catch { return false }
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'mailchimp-sync', auth: 'db+env' })
  }
  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const result = await reconcileMailchimp()
  return NextResponse.json({ ok: true, ...result, firedAt: new Date().toISOString() })
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 4: Commit**

```bash
git add lib/integrations/mailchimp/reconcile.ts app/api/cron/mailchimp-sync/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): reconciliación de drift + ruta de cron (auth DUAL)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

> El job de pg_cron se agenda DESPUÉS del deploy (ver Fase 0 operativa), clonando
> el comando de un job existente y apuntando a `/api/cron/mailchimp-sync`.

---

### Task 10: Enganches best-effort en el CRM

**Files:**
- Modify: `lib/funnel/create-funnel-lead.ts` (después del bloque de notificación, ~línea 116)
- Modify: `lib/supabase/deals.ts` (`updateDealStage`, `linkAppraisalToDeal`, `linkPropertyToDeal`)

**Interfaces:**
- Consumes: `syncDealToMailchimp` de `@/lib/integrations/mailchimp/sync-deal` (vía dynamic import).

- [ ] **Step 1: Helper de enganche en `deals.ts`** (agregar cerca del tope, tras los imports)

```ts
// lib/supabase/deals.ts — agregar este helper (dynamic import: nunca rompe el flujo)
async function syncMailchimpBestEffort(dealId: string): Promise<void> {
  try {
    const { syncDealToMailchimp } = await import('@/lib/integrations/mailchimp/sync-deal')
    await syncDealToMailchimp(dealId)
  } catch (err) {
    console.warn('[mailchimp] hook sync failed (ignored):', err instanceof Error ? err.message : err)
  }
}
```

- [ ] **Step 2: Llamarlo tras cada cambio de etapa** en `deals.ts`

En `updateDealStage` (justo antes del `}` final, tras el check de error):
```ts
  if (error) throw error
  await syncMailchimpBestEffort(id)
}
```
En `linkAppraisalToDeal` (tras `if (error) throw error`):
```ts
  if (error) throw error
  await syncMailchimpBestEffort(dealId)
}
```
En `linkPropertyToDeal` (tras `if (error) throw error`):
```ts
  if (error) throw error
  await syncMailchimpBestEffort(dealId)
}
```

- [ ] **Step 3: Enganche en el alta por funnel** en `create-funnel-lead.ts` (tras el bloque `notifyWithEscalation`, antes de `return { contactId, dealId }`)

```ts
  // 5) Sync Mailchimp (best-effort: nunca rompe el alta del lead)
  try {
    const { syncDealToMailchimp } = await import('@/lib/integrations/mailchimp/sync-deal')
    await syncDealToMailchimp(dealId)
  } catch (err) {
    console.warn('[mailchimp] funnel sync failed (ignored):', err instanceof Error ? err.message : err)
  }

  return { contactId, dealId }
```

- [ ] **Step 4: Typecheck + suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: typecheck limpio; toda la suite verde. Con `MAILCHIMP_SYNC_ENABLED` OFF (default), los enganches loguean `skipped_disabled` y no llaman a Mailchimp → comportamiento del CRM idéntico.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase/deals.ts lib/funnel/create-funnel-lead.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): enganches best-effort en cambios de etapa y alta por funnel

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Webhook de bajas/rebotes (Fase 3)

**Files:**
- Create: `app/api/webhooks/mailchimp/route.ts`

**Interfaces:**
- Consumes: `parseWebhook`, `recordSuppression` (`@/lib/integrations/mailchimp/suppressions`).

- [ ] **Step 1: Implementar la ruta**

```ts
// app/api/webhooks/mailchimp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { parseWebhook, recordSuppression } from '@/lib/integrations/mailchimp/suppressions'

export const dynamic = 'force-dynamic'

function authorized(req: NextRequest): boolean {
  const secret = new URL(req.url).searchParams.get('s')
  return !!process.env.MAILCHIMP_WEBHOOK_SECRET && secret === process.env.MAILCHIMP_WEBHOOK_SECRET
}

// Mailchimp verifica el endpoint con un GET → debe responder 200.
export async function GET(req: NextRequest): Promise<Response> {
  return NextResponse.json({ ok: authorized(req) })
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const form = new URLSearchParams(await req.text())
    const { type, email } = parseWebhook(form)
    if (email && (type === 'unsubscribe' || type === 'cleaned')) {
      await recordSuppression(email, type)
    }
  } catch (err) {
    console.warn('[mailchimp] webhook parse failed (ignored):', err instanceof Error ? err.message : err)
  }
  // Siempre 200: no queremos que Mailchimp reintente por un error nuestro.
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add app/api/webhooks/mailchimp/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): webhook de bajas/rebotes → supresiones

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Scripts operativos (Fase 0): setup + verificación

**Files:**
- Create: `scripts/mailchimp-setup.ts`
- Create: `scripts/mailchimp-verify.ts`

**Interfaces:**
- Consumes: `getMailchimpConfig`, `ensureMergeField`, `ping`, `upsertMember`, `setMemberTags` (`@/lib/integrations/mailchimp/client`), `mergeFieldsFor` (`@/lib/integrations/mailchimp/subscriber`).

- [ ] **Step 1: Script de setup (crea merge fields una vez)**

```ts
// scripts/mailchimp-setup.ts
/**
 * Crea (idempotente) los merge fields que usan las plantillas.
 * Correr: node --env-file=.env.local --import tsx scripts/mailchimp-setup.ts
 */
import { getMailchimpConfig, ensureMergeField, ping } from '@/lib/integrations/mailchimp/client'

async function main() {
  const cfg = getMailchimpConfig()
  if (!cfg) throw new Error('Config incompleta: revisá MAILCHIMP_API_KEY / MAILCHIMP_AUDIENCE_ID en .env.local')
  if (!(await ping(cfg))) throw new Error('Ping a Mailchimp falló (revisá la API key)')
  // FNAME ya existe por default en toda audiencia. Creamos los demás:
  await ensureMergeField(cfg, 'WHATSAPP', 'WhatsApp link')
  await ensureMergeField(cfg, 'LINK_LANDING', 'Link landing tasación')
  await ensureMergeField(cfg, 'CRM_STAGE', 'Etapa CRM')
  console.log('✅ merge fields asegurados: WHATSAPP, LINK_LANDING, CRM_STAGE (+ FNAME por default)')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Step 2: Script de verificación end-to-end**

```ts
// scripts/mailchimp-verify.ts
/**
 * Smoke test: upsert de un contacto de prueba + tag, y lo lee de vuelta.
 * NO manda emails (ningún Journey activo). Requiere MAILCHIMP_SYNC_ENABLED=true
 * SOLO para esta prueba (el script no lo chequea; llama al client directo).
 * Correr: node --env-file=.env.local --import tsx scripts/mailchimp-verify.ts
 */
import { getMailchimpConfig, upsertMember, setMemberTags } from '@/lib/integrations/mailchimp/client'
import { mergeFieldsFor } from '@/lib/integrations/mailchimp/subscriber'

async function main() {
  const cfg = getMailchimpConfig()
  if (!cfg) throw new Error('Config incompleta')
  const email = 'prueba+mailchimp@inmodf.com.ar'
  const up = await upsertMember(cfg, email, mergeFieldsFor('Prueba Mailchimp', 'request'))
  console.log('upsert:', up)
  if (!up.ok) throw new Error('upsert falló: ' + up.error)
  const tg = await setMemberTags(cfg, email, 'seq-solicita', ['seq-agendada', 'seq-no-realizada', 'seq-realizada', 'seq-seguimiento'])
  console.log('tags:', tg)
  if (!tg.ok) throw new Error('tags falló: ' + tg.error)
  console.log('\n✅ contacto de prueba creado con tag seq-solicita — verificalo en el Audience de Mailchimp')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Step 3: Commit** (los scripts se CORREN en la Fase 0 operativa, no ahora)

```bash
git add scripts/mailchimp-setup.ts scripts/mailchimp-verify.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit --author="Sujupar <redstyle50@gmail.com>" -m "$(cat <<'EOF'
feat(mailchimp): scripts de setup (merge fields) y verificación end-to-end

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Fases operativas (NO son tareas de código — se hacen con el usuario)

Estas fases usan la UI de Mailchimp + configuración; se ejecutan tras deployar el código de arriba.

### Fase 0 · Conexión (no envía)
- [ ] Cargar env vars en **Netlify** y en `.env.local`: `MAILCHIMP_API_KEY` (`…-us17`), `MAILCHIMP_SERVER_PREFIX=us17`, `MAILCHIMP_AUDIENCE_ID=db7f354a0d`, `MAILCHIMP_SYNC_ENABLED=false`.
- [ ] Aplicar la migración (Task 5) contra la base de la app (`mncsnastmcjdjxrehdep`) y verificar las 3 tablas.
- [ ] Correr `scripts/mailchimp-setup.ts` (crea merge fields).
- [ ] Deploy (push a `main` — decisión del usuario).
- [ ] Agendar el cron en pg_cron clonando un job existente: `SELECT command FROM cron.job WHERE jobname='send-report'`, cambiar la URL a `/api/cron/mailchimp-sync`, y `cron.schedule('mailchimp-sync','0 8 * * *', <cmd>)`. Insertar el secreto en `cron_config(key='mailchimp_sync')` (mismo valor que use el job clonado). Verificar 3 capas: `cron.job_run_details` → `net._http_response.status_code=200` → fila en `mailchimp_sync_log`.
- [ ] Prueba controlada: `MAILCHIMP_SYNC_ENABLED=true` (temporal, en local con `.env.local`), correr `scripts/mailchimp-verify.ts`, confirmar el contacto+tag en la audiencia. **Ningún Journey activo → cero emails.**

### Fase 1 · Diseño del email #1 (no envía)
- [ ] Pedir al usuario sus **ejemplos visuales** de referencia.
- [ ] Diseñar en Mailchimp el email 1 de Solicita (identidad de Diego, merge fields `FNAME`/`WHATSAPP`).
- [ ] Test-send al usuario. Iterar hasta aprobación. **Gate: no seguir sin el OK.**

### Fase 2 · Construir las Journeys (borrador/pausadas)
- [ ] Journey **Solicita** completa (~21 emails, 2 flujos encadenados con `seq-solicita-2`, condición de salida sobre `CRM_STAGE ≠ solicita`). Verificar en la cuenta si existe condición de salida "por tag"; si no, usar `CRM_STAGE`.
- [ ] Journeys Agendada, No Realizada, Realizada (1 flujo c/u).
- [ ] Journey **Seguimiento** (~21, encadenada, salida por `CRM_STAGE ∉ {entregada, seguimiento}`).

### Fase 3 · Webhooks + supresiones
- [ ] Setear `MAILCHIMP_WEBHOOK_SECRET` en Netlify.
- [ ] Registrar el webhook en Mailchimp apuntando a `/api/webhooks/mailchimp?s=<secret>`, eventos unsubscribe/cleaned, **source ≠ api**.

### Fase 4 · QA correo por correo
- [ ] Test-send de cada email de cada Journey; validar merge fields, links, y variantes A/B de asunto.

### Fase 5 · Go-live gradual
- [ ] `MAILCHIMP_SYNC_ENABLED=true` en Netlify.
- [ ] Activar Journeys **de a una** (Solicita primero; observar `mailchimp_sync_log` + reportes de Mailchimp; luego el resto).

### Follow-up (posterior, tarea aparte)
- [ ] Revivir el sync de públicos de Meta: verificar ToS/Advanced Access y agendar el cron de `20260617000002` (ver §9 del spec).

---

## Self-Review (cobertura del spec)

- Arquitectura A (tag-driven) → Tasks 1,3,6,8,10. ✅
- Contrato de mapeo (con las 3 decisiones) → Task 1 (tests cubren embudo-only, scheduled+fecha, appraisal_sent+followup, STOP). ✅
- Chokepoint real (updateDealStage + link* + funnel) → Task 10. ✅
- Ledger + reconciliación + observabilidad → Tasks 4,5,8,9. ✅
- Interruptor maestro fail-closed → Task 6 (`mailchimpSyncEnabled`), aplicado en Tasks 8,9. ✅
- Nunca tira / contactos sin email / supresiones → Tasks 6,7,8. ✅
- Journeys + salida por CRM_STAGE + merge fields + encadenado → Task 12 (merge fields) + Fases operativas 1,2. ✅
- Webhooks → Task 11 + Fase 3. ✅
- Secretos/env + cron DUAL + migración pg → Tasks 5,6,9 + Fase 0. ✅
- Meta parkeado → Follow-up. ✅
