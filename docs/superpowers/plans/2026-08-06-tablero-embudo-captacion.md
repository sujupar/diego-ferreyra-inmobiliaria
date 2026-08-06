# Tablero del embudo de captación — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recuperar la medición de la inversión publicitaria (hoy rota) y agregar a `/embudos` cuatro secciones que respondan dónde se traba el embudo, cuánto cuesta cada etapa, cómo evoluciona y qué pasa por asesor.

**Architecture:** Dos entregas encadenadas. La primera arregla la captura de datos: una función que trae la serie diaria de Meta con `time_increment=1`, una ruta de cron, un job de `pg_cron` y un script que recupera el histórico. La segunda calcula en Postgres (dos RPCs nuevas), presenta con helpers puros y testeados, y muestra cada número junto a su tamaño de muestra y su cobertura de datos.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Supabase (Postgres + pg_cron) · Meta Marketing API v21.0 · Recharts · Vitest 4 + happy-dom · `pg` para migraciones y verificación.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-08-06-tablero-embudo-captacion-design.md`.
- **Worktree aislado:** todo en `/tmp/claude-501/tablero-embudo`, rama `feat/tablero-embudo-captacion`. **NUNCA** trabajar en `/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria`: otra sesión cambia de rama ahí y pisa el trabajo.
- **Auditar el diff con la BASE COMÚN, no con `origin/main`:** `git diff --name-only $(git merge-base origin/main HEAD) HEAD`. `origin/main` se mueve y comparar contra ella da falsos positivos.
- **El tablero nunca miente sobre su base.** Toda métrica agregada expone su `n`; con `n < 20` se muestra aviso de muestra chica. Los costos viajan con su cobertura (`dias_con_dato` / `dias_del_periodo`); con cobertura < 95% se advierte. Un período sin inversión cargada dice "sin datos de inversión", nunca "$0".
- **Mediana, no promedio**, para todos los tiempos: con estos volúmenes un caso de 90 días distorsiona el promedio.
- **`historico` se excluye por defecto** de las métricas (464 deals heredados sin historial real de etapas). La UI permite incluirlo explícitamente.
- **Inversión del embudo vs de propiedad:** una campaña es "de propiedad" si su `campaign_id` está en `property_meta_campaigns`; si no, es del embudo. **No clasificar por nombre de campaña.**
- **Prosa de interfaz en español rioplatense** (voseo).
- **Turbopack no arranca en esta carpeta** (bug con el acento de "Gestión"). Verificar con `npx vitest run`, `npx tsc --noEmit` y probes con `renderToStaticMarkup`. NO usar `next build`.
- **Commits:** autor `Sujupar <redstyle50@gmail.com>` o falla el deploy. Usar `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit`.
- **Baseline de tipos:** el repo tiene errores de TS preexistentes en tests ajenos. La regla es **0 errores nuevos en archivos de esta tarea**.
- **Si `pg` o `exceljs` no resuelven**, reinstalar con `npm i --no-save pg exceljs` — están fuera de `package.json` a propósito.

---

## PARTE 1 — Recuperar la medición de la inversión

### Task 1: Traer la serie diaria de Meta

**Files:**
- Modify: `lib/marketing/meta-ads.ts`
- Test: `lib/marketing/meta-insights-url.test.ts`

**Interfaces:**
- Consumes: `MetaDailySnapshot` y `MetaInsightsResponse` de `lib/marketing/types`; `parseInsight` (privada del módulo, ya usa `insight.date_start`, no se toca).
- Produces:
  - `buildDailyInsightsUrl(accountId: string, accessToken: string, since: string, until: string): string`
  - `fetchDailyInsightsRange(since: string, until: string): Promise<MetaDailySnapshot[]>`

**Contexto que hay que entender antes de tocar nada:**

`fetchInsightsRange(since, until)` pide el rango **sin `time_increment`**, así que Meta devuelve **una fila agregada por campaña para todo el rango**, no una por día. Como `parseInsight` lee `insight.date_start`, todas esas filas quedarían con la fecha de inicio del rango — es decir, meses de gasto colapsados en un solo día.

Ni `fetchInsightsRange` ni `fetchDailyInsights` los usa nadie (verificado por búsqueda en todo el repo), así que **no se rompe nada**. Se agrega una función nueva en vez de cambiar las viejas, para que el diff sea evidente.

El patrón correcto ya existe en este repo: `fetchCampaignInsights` en `lib/marketing/meta-campaign-builder.ts:1298` usa `time_increment: '1'` y mapea `date: row.date_start`. Se copia ese enfoque a nivel cuenta.

**Por qué se testea la URL y no el fetch:** pegarle a Meta en un test lo vuelve lento y dependiente de la red y del token. Lo que puede salir mal acá es **armar mal la URL** —olvidar `time_increment`, o no pedir `date_start`—, y eso sí se puede probar en aislamiento.

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/marketing/meta-insights-url.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildDailyInsightsUrl } from './meta-ads'

describe('buildDailyInsightsUrl', () => {
  const url = buildDailyInsightsUrl('act_123', 'TOKEN', '2026-03-01', '2026-05-31')

  it('pide el desglose DIARIO — sin esto Meta devuelve un total del rango', () => {
    expect(url).toContain('time_increment=1')
  })

  it('pide date_start explícitamente, que es de donde sale la fecha de cada fila', () => {
    expect(decodeURIComponent(url)).toContain('date_start')
  })

  it('agrega a nivel campaña y usa el rango pedido', () => {
    const plano = decodeURIComponent(url)
    expect(plano).toContain('level=campaign')
    expect(plano).toContain('"since":"2026-03-01"')
    expect(plano).toContain('"until":"2026-05-31"')
  })

  it('incluye la cuenta, el token y los campos que la app necesita', () => {
    const plano = decodeURIComponent(url)
    expect(url).toContain('act_123/insights')
    expect(url).toContain('access_token=TOKEN')
    for (const campo of ['campaign_id', 'campaign_name', 'impressions', 'clicks', 'ctr', 'spend', 'actions']) {
      expect(plano).toContain(campo)
    }
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/marketing/meta-insights-url.test.ts`
Expected: FAIL — `buildDailyInsightsUrl` no existe.

- [ ] **Step 3: Escribir la implementación**

En `lib/marketing/meta-ads.ts`, después de `fetchInsightsRange`, agregar:

```ts
/**
 * Arma la URL de insights con desglose DIARIO.
 *
 * Separada del fetch para poder testearla sin pegarle a Meta: lo que se rompe
 * acá es la URL (olvidar `time_increment`, no pedir `date_start`), no la red.
 *
 * OJO — la diferencia con `fetchInsightsRange`: sin `time_increment=1` Meta
 * devuelve UNA fila agregada por campaña para todo el rango, y como parseInsight
 * toma `date_start`, meses de gasto quedarían apilados en un solo día.
 */
export function buildDailyInsightsUrl(
  accountId: string, accessToken: string, since: string, until: string,
): string {
  const fields = 'date_start,campaign_id,campaign_name,impressions,clicks,ctr,spend,actions,cost_per_action_type'
  const params = new URLSearchParams({
    fields,
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    level: 'campaign',
    limit: '500',
    access_token: accessToken,
  })
  return `${META_API_BASE}/${accountId}/insights?${params.toString()}`
}

/**
 * Trae una fila por campaña Y POR DÍA para el rango pedido, siguiendo la
 * paginación de Meta (un trimestre con varias campañas pasa las 500 filas).
 */
export async function fetchDailyInsightsRange(
  since: string, until: string,
): Promise<MetaDailySnapshot[]> {
  const { accountId, accessToken } = getMetaConfig()
  let url: string | null = buildDailyInsightsUrl(accountId, accessToken, since, until)
  const out: MetaDailySnapshot[] = []

  while (url) {
    const response: Response = await fetch(url)
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(`Meta API error: ${JSON.stringify(error)}`)
    }
    const data: MetaInsightsResponse & { paging?: { next?: string } } = await response.json()
    out.push(...data.data.map(parseInsight))
    url = data.paging?.next ?? null
  }

  return out
}
```

**`getMetaConfig` devuelve `{ accountId, accessToken, appId, appSecret }`** (verificado en `lib/marketing/meta-ads.ts:12`), y `accountId` ya viene con el prefijo `act_` puesto. El destructuring de arriba es correcto tal cual.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run lib/marketing/meta-insights-url.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep meta-ads || echo "sin errores"`
Expected: `sin errores`.

- [ ] **Step 6: Commit**

```bash
git add lib/marketing/meta-ads.ts lib/marketing/meta-insights-url.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "fix(meta): traer la inversión con desglose diario — sin time_increment venía un total del rango"
```

---

### Task 2: Ruta de cron y recuperación del histórico

**Files:**
- Create: `app/api/cron/meta-sync/route.ts`
- Create: `scripts/backfill-meta-spend.ts`

**Interfaces:**
- Consumes: `fetchDailyInsightsRange`, `saveDailySnapshot`, `checkTokenExpiry` de `lib/marketing/meta-ads`.
- Produces: `GET|POST /api/cron/meta-sync?days=N` → `{ ok, desde, hasta, filas }`; y el script de recuperación.

**Contexto:** el patrón de autenticación de cron está en `app/api/cron/send-report/route.ts`: el header `x-cron-secret` se compara contra la env var `CRON_SECRET` o, si no existe, contra la fila de `cron_config`. Se replica **con su propia clave** (`meta_sync`). `saveDailySnapshot` ya hace upsert con `onConflict: 'date,campaign_id'`, y esa constraint UNIQUE ya existe en la tabla.

- [ ] **Step 1: Escribir la ruta**

Crear `app/api/cron/meta-sync/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchDailyInsightsRange, saveDailySnapshot } from '@/lib/marketing/meta-ads'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET|POST /api/cron/meta-sync?days=7
 *
 * Trae la inversión diaria de Meta de los últimos N días y la guarda.
 * Se sincronizan 7 días por defecto y no solo el de ayer porque Meta AJUSTA
 * las cifras hasta 72 horas después: pedir una ventana y hacer upsert corrige
 * los días ya guardados en vez de dejarlos con el primer valor, incompleto.
 *
 * Lo dispara pg_cron con net.http_post — el scheduler de Netlify no invoca las
 * scheduled functions de este sitio (ver CLAUDE.md).
 */
async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'meta_sync').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && provided === dbSecret
  } catch {
    return false
  }
}

function diaISO(offsetDias: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - offsetDias)
  return d.toISOString().slice(0, 10)
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)

  // ?ping=1 → confirma que este deploy está vivo, sin auth ni efectos.
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'meta-sync', auth: 'db+env' })
  }

  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '7', 10) || 7, 1), 90)
  const desde = diaISO(days)
  const hasta = diaISO(0)

  try {
    const filas = await fetchDailyInsightsRange(desde, hasta)
    await saveDailySnapshot(filas)
    return NextResponse.json({ ok: true, desde, hasta, filas: filas.length })
  } catch (err) {
    console.error('[meta-sync] falló la sincronización:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
```

- [ ] **Step 2: Escribir el script de recuperación del histórico**

Crear `scripts/backfill-meta-spend.ts`:

```ts
/**
 * Recupera la inversión diaria de Meta hacia atrás y VERIFICA la cobertura.
 *
 * La tabla hoy tiene 24 días con dato sobre 88 del rango 2026-03-01..2026-05-27,
 * y nada después: lo que se guardó fue lo que alguien alcanzó a traer al abrir
 * una pantalla, no una serie. Esto la reconstruye.
 *
 * Correr: npx tsx --env-file=.env.local scripts/backfill-meta-spend.ts [desde] [hasta]
 * Default: desde 2026-01-01 hasta hoy.
 */
import { Client } from 'pg'
import { fetchDailyInsightsRange, saveDailySnapshot, checkTokenExpiry } from '../lib/marketing/meta-ads'

function hoyISO(): string { return new Date().toISOString().slice(0, 10) }

async function main() {
  const desde = process.argv[2] ?? '2026-01-01'
  const hasta = process.argv[3] ?? hoyISO()

  // Si el token está vencido, Meta devuelve un error que parece "no hay datos".
  // Cortar acá evita dejar la tabla a medias creyendo que se recuperó todo.
  const diasToken = await checkTokenExpiry().catch(() => null)
  if (diasToken !== null && diasToken <= 0) {
    throw new Error('El token de Meta está vencido. Renovalo antes de recuperar el histórico.')
  }
  console.log(`token: ${diasToken === null ? 'sin información de vencimiento' : `vence en ${diasToken} días`}`)

  console.log(`trayendo ${desde} → ${hasta} …`)
  const filas = await fetchDailyInsightsRange(desde, hasta)
  console.log(`Meta devolvió ${filas.length} filas (campaña × día)`)
  await saveDailySnapshot(filas)

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  const { rows: [cob] } = await c.query(
    `SELECT count(DISTINCT date)::int dias_con_dato,
            ($2::date - $1::date + 1)::int dias_del_rango
       FROM meta_ads_daily WHERE date BETWEEN $1 AND $2`, [desde, hasta])
  const { rows: huecos } = await c.query(
    `SELECT d::date::text dia
       FROM generate_series($1::date, $2::date, '1 day') d
      WHERE NOT EXISTS (SELECT 1 FROM meta_ads_daily m WHERE m.date = d::date)
      ORDER BY d`, [desde, hasta])
  await c.end()

  console.log(`cobertura: ${cob.dias_con_dato} de ${cob.dias_del_rango} días`)
  if (huecos.length > 0) {
    console.log(`días sin dato (${huecos.length}):`)
    console.log('  ' + huecos.map(h => h.dia).join(', '))
    console.log('\nUn día sin dato NO siempre es un error: si ese día no hubo ninguna')
    console.log('campaña activa, Meta no devuelve fila y está bien que falte.')
    console.log('Revisar en Ads Manager si alguno de estos días tuvo campañas corriendo.')
  } else {
    console.log('\n✅ no quedaron días sin dato en el rango')
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep -E "meta-sync|backfill-meta" || echo "sin errores"`
Expected: `sin errores`.

- [ ] **Step 4: Commit**

```bash
git add app/api/cron/meta-sync scripts/backfill-meta-spend.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(meta): ruta de sincronización diaria de inversión y recuperación del histórico"
```

- [ ] **Step 5: PARAR y consultar al humano antes de correr nada**

La recuperación **pega a la API de Meta y escribe en la base de producción**, y la ruta nueva **no existe en producción hasta que se deployee** (el job de `pg_cron` apuntaría a una URL 404).

Reportar al humano: la Parte 1 está lista para correr, y hacen falta tres decisiones suyas — (a) correr la recuperación del histórico ahora, (b) deployar antes de crear el job de `pg_cron`, y (c) qué secreto usar para `meta_sync`. **No inventar el secreto ni crear el job sin confirmación.**

---

### Task 3: Programar la sincronización

**Solo después de que el humano confirme el Step 5 de la Task 2 y de que el código esté deployado.**

**Files:**
- Create: `supabase/migrations/20260806000002_cron_meta_sync.sql`
- Create: `scripts/apply-cron-meta-sync-pg.ts`

**Interfaces:**
- Consumes: la ruta `/api/cron/meta-sync` ya deployada.
- Produces: job de `pg_cron` `meta-sync` corriendo a diario, y la fila `cron_config(key='meta_sync')`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260806000002_cron_meta_sync.sql`. El secreto va como marcador y lo reemplaza el script con el valor que dé el humano:

```sql
-- =============================================================================
-- Sincronización diaria de la inversión de Meta
-- =============================================================================
-- Por qué pg_cron y no una scheduled function de Netlify: el scheduler de
-- Netlify NO invoca las scheduled functions de este sitio (bug del plugin de
-- Next 16 — ver CLAUDE.md). Por eso la tabla meta_ads_daily quedó con 24 días
-- de 88 y cortada el 27/5/2026.
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details
-- diga 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar
-- SIEMPRE contra net._http_response (retiene ~6h) y contra los datos.
-- =============================================================================

INSERT INTO public.cron_config (key, value)
VALUES ('meta_sync', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('meta-sync') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'meta-sync');

SELECT cron.schedule('meta-sync', '30 9 * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/meta-sync?days=7',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT * FROM cron.job WHERE jobname='meta-sync';
--   2. SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;
--   3. SELECT max(date) FROM meta_ads_daily;   -- debe avanzar cada día
-- =============================================================================
```

- [ ] **Step 2: Escribir el script que aplica y verifica**

Crear `scripts/apply-cron-meta-sync-pg.ts`. Recibe el secreto y la URL del sitio por argumento —nunca inventados—, reemplaza los marcadores y verifica que el job quedó creado:

```ts
/**
 * Aplica la migración del job meta-sync reemplazando los marcadores.
 *
 * Correr: npx tsx --env-file=.env.local scripts/apply-cron-meta-sync-pg.ts <secreto> <dominio>
 * Ej:     ... apply-cron-meta-sync-pg.ts abc123 inmobiliariadiegoferreyra.com
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const [secreto, sitio] = process.argv.slice(2)
  if (!secreto || !sitio) {
    throw new Error('Faltan argumentos: <secreto> <dominio>. No se inventan.')
  }

  const sql = readFileSync('supabase/migrations/20260806000002_cron_meta_sync.sql', 'utf8')
    .replaceAll('__SECRETO__', secreto)
    .replaceAll('__SITIO__', sitio)

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(sql)

  const { rows: job } = await c.query(
    `SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'meta-sync'`)
  const { rows: cfg } = await c.query(
    `SELECT key FROM cron_config WHERE key = 'meta_sync'`)
  await c.end()

  console.log('job:', JSON.stringify(job[0] ?? null))
  console.log('cron_config:', JSON.stringify(cfg[0] ?? null))

  if (!job[0]) throw new Error('el job meta-sync no quedó creado')
  if (job[0].active !== true) throw new Error('el job quedó inactivo')
  if (!cfg[0]) throw new Error('no quedó la fila cron_config(meta_sync)')

  console.log('\n✅ job programado. Mañana verificar que max(date) de meta_ads_daily avanzó.')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260806000002_cron_meta_sync.sql scripts/apply-cron-meta-sync-pg.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(cron): job diario de sincronización de la inversión de Meta"
```

---

## PARTE 2 — El tablero

### Task 4: RPC de tiempos entre etapas

**Files:**
- Create: `supabase/migrations/20260806000003_funnel_timings_rpc.sql`
- Create: `scripts/apply-funnel-rpcs-pg.ts`

**Interfaces:**
- Consumes: `deal_stage_history(deal_id, from_stage, to_stage, changed_at)`, `deals(id, origin)`.
- Produces: `get_funnel_stage_timings(p_from DATE, p_to DATE, p_origins TEXT[])` → filas `(desde TEXT, hasta TEXT, n BIGINT, mediana_dias NUMERIC, p75_dias NUMERIC)`.

**Cómo se calcula el tiempo de una etapa:** no existe una columna con la duración. El tiempo que un deal pasó en una etapa es la diferencia entre el evento que lo metió en esa etapa y el evento siguiente del mismo deal. Se obtiene con `LAG` sobre `deal_stage_history` particionado por `deal_id` y ordenado por `changed_at`.

Se usa `LAG(to_stage)` y no `from_stage` porque `from_stage` puede venir nulo en la primera fila y porque el estado real desde el que se salta es el `to_stage` del evento anterior.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260806000003_funnel_timings_rpc.sql`:

```sql
-- =============================================================================
-- Tiempos entre etapas del embudo
-- =============================================================================
-- MEDIANA, no promedio: con los volúmenes actuales (el paso más transitado
-- tiene 14 casos) un deal que tardó 90 días desplaza el promedio y esconde la
-- realidad. Se devuelve también `n` porque la app MUESTRA el tamaño de muestra
-- junto a cada número — ver el spec, §4.
--
-- `historico` se excluye por defecto: son 464 deals heredados del sistema
-- anterior, sin historial real de etapas.
-- =============================================================================

DROP FUNCTION IF EXISTS get_funnel_stage_timings(DATE, DATE, TEXT[]);

CREATE OR REPLACE FUNCTION get_funnel_stage_timings(
  p_from    DATE,
  p_to      DATE,
  p_origins TEXT[] DEFAULT ARRAY['embudo','clase_gratuita','referido']
)
RETURNS TABLE (
  desde        TEXT,
  hasta        TEXT,
  n            BIGINT,
  mediana_dias NUMERIC,
  p75_dias     NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH ev AS (
    SELECT h.deal_id,
           h.to_stage,
           h.changed_at,
           LAG(h.to_stage)   OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) AS etapa_previa,
           LAG(h.changed_at) OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) AS entro_at
      FROM deal_stage_history h
      JOIN deals d ON d.id = h.deal_id
     WHERE d.origin = ANY(p_origins)
  )
  SELECT etapa_previa AS desde,
         to_stage     AS hasta,
         count(*)     AS n,
         round(percentile_cont(0.5)  WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (changed_at - entro_at)) / 86400.0)::numeric, 1) AS mediana_dias,
         round(percentile_cont(0.75) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (changed_at - entro_at)) / 86400.0)::numeric, 1) AS p75_dias
    FROM ev
   WHERE entro_at IS NOT NULL
     -- El período filtra por CUÁNDO OCURRIÓ la transición, no por cuándo se
     -- creó el deal: si no, un deal viejo que avanzó ayer quedaría afuera.
     AND changed_at::date BETWEEN p_from AND p_to
   GROUP BY 1, 2
   ORDER BY n DESC;
$$;

COMMENT ON FUNCTION get_funnel_stage_timings(DATE, DATE, TEXT[]) IS
  'Tiempo entre etapas del embudo: mediana y p75 en días, con el tamaño de muestra.';

GRANT EXECUTE ON FUNCTION get_funnel_stage_timings(DATE, DATE, TEXT[]) TO authenticated;
```

- [ ] **Step 2: Escribir el script que aplica y verifica contra la base**

Crear `scripts/apply-funnel-rpcs-pg.ts`. La verificación **compara la RPC contra una consulta escrita de otra forma**: una métrica probada solo contra sí misma no está probada.

```ts
/**
 * Aplica las RPCs del tablero y las verifica contra consultas equivalentes
 * escritas de otra forma.
 *
 * Correr: npx tsx --env-file=.env.local scripts/apply-funnel-rpcs-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACIONES = [
  'supabase/migrations/20260806000003_funnel_timings_rpc.sql',
  'supabase/migrations/20260806000004_funnel_costs_rpc.sql',
]

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  for (const m of MIGRACIONES) {
    await c.query(readFileSync(m, 'utf8'))
    console.log(`aplicada: ${m.split('/').pop()}`)
  }

  // ── Verificación 1: tiempos ────────────────────────────────────────────────
  const { rows: rpc } = await c.query(
    `SELECT desde, hasta, n FROM get_funnel_stage_timings('2025-01-01','2026-12-31')
      ORDER BY n DESC LIMIT 1`)
  const { rows: manual } = await c.query(`
    WITH ev AS (
      SELECT h.deal_id, h.to_stage, h.changed_at,
             LAG(h.to_stage)   OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) prev_stage,
             LAG(h.changed_at) OVER (PARTITION BY h.deal_id ORDER BY h.changed_at) prev_at
        FROM deal_stage_history h JOIN deals d ON d.id = h.deal_id
       WHERE d.origin IN ('embudo','clase_gratuita','referido'))
    SELECT prev_stage desde, to_stage hasta, count(*)::bigint n FROM ev
     WHERE prev_at IS NOT NULL AND changed_at::date BETWEEN '2025-01-01' AND '2026-12-31'
     GROUP BY 1,2 ORDER BY n DESC LIMIT 1`)

  console.log('tiempos — RPC:', JSON.stringify(rpc[0] ?? null))
  console.log('tiempos — consulta independiente:', JSON.stringify(manual[0] ?? null))
  if (JSON.stringify(rpc[0]) !== JSON.stringify(manual[0])) {
    throw new Error('la RPC de tiempos no coincide con la consulta independiente')
  }

  // ── Verificación 2: costos ─────────────────────────────────────────────────
  const { rows: costos } = await c.query(
    `SELECT * FROM get_funnel_costs('2026-03-01','2026-05-31')`)
  console.log('costos marzo-mayo:', JSON.stringify(costos[0] ?? null))
  const cst = costos[0]
  if (!cst) throw new Error('get_funnel_costs no devolvió fila')
  if (Number(cst.dias_del_periodo) !== 92) {
    throw new Error(`dias_del_periodo debería ser 92, dio ${cst.dias_del_periodo}`)
  }
  if (Number(cst.dias_con_dato) > Number(cst.dias_del_periodo)) {
    throw new Error('dias_con_dato no puede superar dias_del_periodo')
  }

  await c.end()
  console.log('\n✅ RPCs aplicadas y verificadas contra consultas independientes')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
```

- [ ] **Step 3: Commit** (se corre en la Task 5, cuando exista la segunda migración)

```bash
git add supabase/migrations/20260806000003_funnel_timings_rpc.sql scripts/apply-funnel-rpcs-pg.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(metrics): RPC de tiempos entre etapas del embudo (mediana + tamaño de muestra)"
```

---

### Task 5: RPC de costos por etapa

**Files:**
- Create: `supabase/migrations/20260806000004_funnel_costs_rpc.sql`

**Interfaces:**
- Consumes: `meta_ads_daily(date, campaign_id, spend)`, `property_meta_campaigns(campaign_id)`, `deals`, `deal_stage_history`.
- Produces: `get_funnel_costs(p_from DATE, p_to DATE)` → una fila `(inversion NUMERIC, solicitudes BIGINT, tasaciones BIGINT, captaciones BIGINT, costo_solicitud NUMERIC, costo_tasacion NUMERIC, costo_captacion NUMERIC, dias_con_dato INT, dias_del_periodo INT)`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260806000004_funnel_costs_rpc.sql`:

```sql
-- =============================================================================
-- Costo por etapa del embudo de captación
-- =============================================================================
-- Inversión DEL EMBUDO, no la de promocionar propiedades ya captadas: una
-- campaña es "de propiedad" si su campaign_id figura en property_meta_campaigns.
-- La separación es por DATO y no por nombre de campaña, que hoy alcanzaría
-- ("Tasación Gratuita", "Clase Gratuita") pero se rompe al renombrar una.
--
-- Devuelve dias_con_dato y dias_del_periodo porque la app MUESTRA la cobertura
-- junto al costo: al 2026-08-06 la tabla tiene 24 días de 88, así que un costo
-- sin su cobertura sería un número con cara de verdad. Ver el spec, §4.
-- =============================================================================

DROP FUNCTION IF EXISTS get_funnel_costs(DATE, DATE);

CREATE OR REPLACE FUNCTION get_funnel_costs(p_from DATE, p_to DATE)
RETURNS TABLE (
  inversion         NUMERIC,
  solicitudes       BIGINT,
  tasaciones        BIGINT,
  captaciones       BIGINT,
  costo_solicitud   NUMERIC,
  costo_tasacion    NUMERIC,
  costo_captacion   NUMERIC,
  dias_con_dato     INT,
  dias_del_periodo  INT
)
LANGUAGE sql
STABLE
AS $$
  WITH gasto AS (
    SELECT coalesce(sum(m.spend), 0)::numeric AS total,
           count(DISTINCT m.date)::int        AS dias
      FROM meta_ads_daily m
     WHERE m.date BETWEEN p_from AND p_to
       AND NOT EXISTS (
             SELECT 1 FROM property_meta_campaigns c
              WHERE c.campaign_id = m.campaign_id)
  ),
  sol AS (
    SELECT count(*)::bigint AS n FROM deals
     WHERE origin = 'embudo' AND created_at::date BETWEEN p_from AND p_to
  ),
  tas AS (
    SELECT count(*)::bigint AS n FROM deal_stage_history
     WHERE to_stage = 'appraisal_sent' AND changed_at::date BETWEEN p_from AND p_to
  ),
  cap AS (
    SELECT count(*)::bigint AS n FROM deal_stage_history
     WHERE to_stage = 'captured' AND changed_at::date BETWEEN p_from AND p_to
  )
  SELECT g.total,
         s.n, t.n, c.n,
         CASE WHEN s.n > 0 THEN round(g.total / s.n, 0) END,
         CASE WHEN t.n > 0 THEN round(g.total / t.n, 0) END,
         CASE WHEN c.n > 0 THEN round(g.total / c.n, 0) END,
         g.dias,
         (p_to - p_from + 1)::int
    FROM gasto g, sol s, tas t, cap c;
$$;

COMMENT ON FUNCTION get_funnel_costs(DATE, DATE) IS
  'Costo por solicitud/tasación/captación con la cobertura de datos de inversión.';

GRANT EXECUTE ON FUNCTION get_funnel_costs(DATE, DATE) TO authenticated;

-- Volumen por origen: permite comparar lo PAGO (embudo, clase_gratuita) contra
-- el REFERIDO, que no cuesta publicidad. Es la comparación que decide dónde
-- poner el esfuerzo, y por eso va junto a los costos.
DROP FUNCTION IF EXISTS get_funnel_volume_by_origin(DATE, DATE);

CREATE OR REPLACE FUNCTION get_funnel_volume_by_origin(p_from DATE, p_to DATE)
RETURNS TABLE (origen TEXT, solicitudes BIGINT, captaciones BIGINT)
LANGUAGE sql
STABLE
AS $$
  WITH sol AS (
    SELECT coalesce(origin, '(sin origen)') AS o, count(*)::bigint AS n
      FROM deals
     WHERE created_at::date BETWEEN p_from AND p_to
     GROUP BY 1
  ),
  cap AS (
    SELECT coalesce(d.origin, '(sin origen)') AS o, count(*)::bigint AS n
      FROM deal_stage_history h
      JOIN deals d ON d.id = h.deal_id
     WHERE h.to_stage = 'captured'
       AND h.changed_at::date BETWEEN p_from AND p_to
     GROUP BY 1
  )
  SELECT coalesce(sol.o, cap.o)  AS origen,
         coalesce(sol.n, 0)      AS solicitudes,
         coalesce(cap.n, 0)      AS captaciones
    FROM sol
    FULL OUTER JOIN cap ON cap.o = sol.o
   ORDER BY 2 DESC, 3 DESC;
$$;

COMMENT ON FUNCTION get_funnel_volume_by_origin(DATE, DATE) IS
  'Solicitudes y captaciones por origen, para comparar lo pago contra el referido.';

GRANT EXECUTE ON FUNCTION get_funnel_volume_by_origin(DATE, DATE) TO authenticated;
```

**Por qué los costos son NULL y no 0 cuando no hay denominador:** dividir por cero rompe, y devolver 0 diría "salió gratis". `NULL` obliga a la interfaz a mostrar "sin datos", que es la verdad.

- [ ] **Step 2: Aplicar y verificar ambas RPCs contra la base**

Run: `npx tsx --env-file=.env.local scripts/apply-funnel-rpcs-pg.ts`
Expected: termina con `✅ RPCs aplicadas y verificadas contra consultas independientes`.

Si la verificación de tiempos falla, **no relajar la comparación**: significa que la RPC calcula distinto de lo que dice hacer.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260806000004_funnel_costs_rpc.sql
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(metrics): RPC de costo por etapa del embudo con cobertura de datos"
```

---

### Task 6: Helpers de presentación (módulo puro)

**Files:**
- Create: `lib/metrics/funnel-insights.ts`
- Test: `lib/metrics/funnel-insights.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type StageTiming = { desde: string; hasta: string; n: number; mediana_dias: number; p75_dias: number }`
  - `type FunnelCosts = { inversion: number; solicitudes: number; tasaciones: number; captaciones: number; costo_solicitud: number | null; costo_tasacion: number | null; costo_captacion: number | null; dias_con_dato: number; dias_del_periodo: number }`
  - `MUESTRA_MINIMA = 20`
  - `esMuestraChica(n: number): boolean`
  - `cobertura(c: Pick<FunnelCosts,'dias_con_dato'|'dias_del_periodo'>): { pct: number; confiable: boolean; texto: string }`
  - `cuelloDeBotella(timings: StageTiming[]): { masLento: StageTiming | null; texto: string }`
  - `formatearDuracion(dias: number): string`
  - `etiquetaEtapa(stage: string): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/metrics/funnel-insights.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  MUESTRA_MINIMA, esMuestraChica, cobertura, cuelloDeBotella,
  formatearDuracion, etiquetaEtapa, type StageTiming,
} from './funnel-insights'

const t = (desde: string, hasta: string, n: number, mediana: number): StageTiming =>
  ({ desde, hasta, n, mediana_dias: mediana, p75_dias: mediana * 1.5 })

describe('muestra chica', () => {
  it('avisa por debajo del mínimo y no avisa a partir de ahí', () => {
    expect(esMuestraChica(MUESTRA_MINIMA - 1)).toBe(true)
    expect(esMuestraChica(MUESTRA_MINIMA)).toBe(false)
    expect(esMuestraChica(0)).toBe(true)
  })
})

describe('cobertura de datos de inversión', () => {
  it('con todos los días cargados es confiable', () => {
    const c = cobertura({ dias_con_dato: 30, dias_del_periodo: 30 })
    expect(c.pct).toBe(100)
    expect(c.confiable).toBe(true)
  })

  it('con 24 de 88 días NO es confiable y lo dice en castellano', () => {
    const c = cobertura({ dias_con_dato: 24, dias_del_periodo: 88 })
    expect(c.pct).toBe(27)
    expect(c.confiable).toBe(false)
    expect(c.texto).toContain('24')
    expect(c.texto).toContain('88')
  })

  it('sin ningún día cargado avisa que no hay datos, no que sea cero', () => {
    const c = cobertura({ dias_con_dato: 0, dias_del_periodo: 31 })
    expect(c.confiable).toBe(false)
    expect(c.texto.toLowerCase()).toContain('sin datos')
  })

  it('un período de cero días no rompe', () => {
    expect(() => cobertura({ dias_con_dato: 0, dias_del_periodo: 0 })).not.toThrow()
    expect(cobertura({ dias_con_dato: 0, dias_del_periodo: 0 }).confiable).toBe(false)
  })
})

describe('cuello de botella', () => {
  it('señala el paso más lento y lo nombra en castellano', () => {
    const r = cuelloDeBotella([
      t('scheduled', 'visited', 14, 2),
      t('visited', 'appraisal_sent', 7, 6),
      t('request', 'scheduled', 30, 1),
    ])
    expect(r.masLento?.desde).toBe('visited')
    expect(r.texto).toContain('Visita realizada')
    expect(r.texto).toContain('Tasación entregada')
    expect(r.texto).toContain('6')
  })

  it('avisa cuando el paso más lento se apoya en muestra chica', () => {
    const r = cuelloDeBotella([t('visited', 'appraisal_sent', 7, 6)])
    expect(r.texto).toContain('7 casos')
  })

  it('sin datos no inventa un cuello de botella', () => {
    const r = cuelloDeBotella([])
    expect(r.masLento).toBeNull()
    expect(r.texto.toLowerCase()).toContain('sin datos')
  })

  it('ignora las transiciones a perdido: no son un paso del embudo', () => {
    const r = cuelloDeBotella([
      t('request', 'lost', 10, 40),
      t('scheduled', 'visited', 14, 2),
    ])
    expect(r.masLento?.hasta).toBe('visited')
  })
})

describe('formato', () => {
  it('escribe duraciones en castellano', () => {
    expect(formatearDuracion(1)).toBe('1 día')
    expect(formatearDuracion(6)).toBe('6 días')
    expect(formatearDuracion(0.5)).toBe('menos de un día')
  })

  it('traduce las etapas y no rompe con una desconocida', () => {
    expect(etiquetaEtapa('appraisal_sent')).toBe('Tasación entregada')
    expect(etiquetaEtapa('captured')).toBe('Captada')
    expect(etiquetaEtapa('cualquier_cosa')).toBe('cualquier_cosa')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/metrics/funnel-insights.test.ts`
Expected: FAIL — no se resuelve `./funnel-insights`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/metrics/funnel-insights.ts`:

```ts
/**
 * Helpers de presentación del tablero del embudo.
 *
 * Puros y testeados a propósito: Turbopack no arranca en esta carpeta (bug con
 * el acento de "Gestión" en el path), así que las funciones sin React son la
 * única verificación barata y confiable de esta lógica.
 */

export interface StageTiming {
  desde: string
  hasta: string
  n: number
  mediana_dias: number
  p75_dias: number
}

export interface FunnelCosts {
  inversion: number
  solicitudes: number
  tasaciones: number
  captaciones: number
  costo_solicitud: number | null
  costo_tasacion: number | null
  costo_captacion: number | null
  dias_con_dato: number
  dias_del_periodo: number
}

/** Debajo de esto, un promedio no sostiene una decisión de negocio. */
export const MUESTRA_MINIMA = 20

export function esMuestraChica(n: number): boolean {
  return n < MUESTRA_MINIMA
}

/** Cobertura de los datos de inversión del período. */
export function cobertura(c: Pick<FunnelCosts, 'dias_con_dato' | 'dias_del_periodo'>): {
  pct: number; confiable: boolean; texto: string
} {
  if (c.dias_del_periodo <= 0) {
    return { pct: 0, confiable: false, texto: 'Sin datos de inversión para este período.' }
  }
  const pct = Math.round((c.dias_con_dato / c.dias_del_periodo) * 100)
  if (c.dias_con_dato === 0) {
    return { pct: 0, confiable: false, texto: 'Sin datos de inversión para este período.' }
  }
  const confiable = pct >= 95
  return {
    pct,
    confiable,
    texto: confiable
      ? `Inversión cargada para los ${c.dias_del_periodo} días del período.`
      : `Ojo: hay inversión cargada para ${c.dias_con_dato} de ${c.dias_del_periodo} días (${pct}%). El costo real es mayor que el que se muestra.`,
  }
}

const ETAPAS: Record<string, string> = {
  clase_gratuita: 'Clase gratuita',
  request: 'Solicitud',
  scheduled: 'Coordinada',
  not_visited: 'Visita no realizada',
  visited: 'Visita realizada',
  appraisal_sent: 'Tasación entregada',
  followup: 'En seguimiento',
  captured: 'Captada',
  lost: 'Perdido',
  comprador: 'Comprador',
}

export function etiquetaEtapa(stage: string): string {
  return ETAPAS[stage] ?? stage
}

export function formatearDuracion(dias: number): string {
  if (dias < 1) return 'menos de un día'
  const redondeado = Math.round(dias)
  return `${redondeado} día${redondeado === 1 ? '' : 's'}`
}

/**
 * El paso más lento del embudo, nombrado en castellano.
 *
 * Las transiciones a `lost` se excluyen: perder un deal no es un paso del
 * embudo, y como suelen tardar mucho (se marcan tarde) se llevarían siempre el
 * primer puesto y taparían el cuello de botella real.
 */
export function cuelloDeBotella(timings: StageTiming[]): {
  masLento: StageTiming | null; texto: string
} {
  const pasos = timings.filter(t => t.hasta !== 'lost' && t.desde !== 'lost')
  if (pasos.length === 0) {
    return { masLento: null, texto: 'Sin datos suficientes para identificar el paso más lento.' }
  }
  const masLento = pasos.reduce((a, b) => (b.mediana_dias > a.mediana_dias ? b : a))
  const aviso = esMuestraChica(masLento.n) ? ` (sobre ${masLento.n} casos, muestra chica)` : ''
  return {
    masLento,
    texto: `El paso más lento es de ${etiquetaEtapa(masLento.desde)} a ${etiquetaEtapa(masLento.hasta)}: ${formatearDuracion(masLento.mediana_dias)}${aviso}.`,
  }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/metrics/funnel-insights.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/metrics/funnel-insights.ts lib/metrics/funnel-insights.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(metrics): helpers del tablero (cuello de botella, cobertura, muestra chica)"
```

---

### Task 7: Ruta de API del tablero

**Files:**
- Create: `app/api/funnels/insights/route.ts`

**Interfaces:**
- Consumes: las RPCs `get_funnel_stage_timings` y `get_funnel_costs`; tipos `StageTiming` y `FunnelCosts` de `lib/metrics/funnel-insights`.
- Produces: `GET /api/funnels/insights?from=YYYY-MM-DD&to=YYYY-MM-DD[&historico=1]` → `{ timings: StageTiming[], costs: FunnelCosts | null, porOrigen: VolumenPorOrigen[], asesores: { total: number; con_asesor: number; por_mes: { mes: string; total: number; con_asesor: number }[] } }` con `VolumenPorOrigen = { origen: string; solicitudes: number; captaciones: number }`

**Permiso:** el mismo que ya tienen `/metrics` y `/embudos` — `requireRole('admin', 'dueno')`. Si un asesor llegara a la ruta, 403.

- [ ] **Step 1: Escribir la ruta**

Crear `app/api/funnels/insights/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRole } from '@/lib/auth/require-role'

export const dynamic = 'force-dynamic'

const ORIGENES_MEDIBLES = ['embudo', 'clase_gratuita', 'referido']

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/funnels/insights?from=&to=[&historico=1]
 *
 * Tiempos entre etapas, costo por etapa y cobertura de asignación de asesor.
 * `historico=1` suma los 464 deals heredados, que por defecto se excluyen
 * porque no tienen historial real de etapas y distorsionan los tiempos.
 */
export async function GET(req: NextRequest) {
  try {
    await requireRole('admin', 'dueno')

    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'Faltan from y to (YYYY-MM-DD).' }, { status: 400 })
    }

    const origenes = searchParams.get('historico') === '1'
      ? [...ORIGENES_MEDIBLES, 'historico']
      : ORIGENES_MEDIBLES

    const db = admin()

    const [timings, costs, porOrigen, asesores] = await Promise.all([
      db.rpc('get_funnel_stage_timings', { p_from: from, p_to: to, p_origins: origenes }),
      db.rpc('get_funnel_costs', { p_from: from, p_to: to }),
      db.rpc('get_funnel_volume_by_origin', { p_from: from, p_to: to }),
      db.rpc('get_advisor_coverage', { p_from: from, p_to: to }),
    ])

    if (timings.error) throw timings.error
    if (costs.error) throw costs.error
    if (porOrigen.error) throw porOrigen.error
    if (asesores.error) throw asesores.error

    const cobertura = (asesores.data ?? []) as Array<{ mes: string; total: number; con_asesor: number }>

    return NextResponse.json({
      timings: timings.data ?? [],
      costs: (costs.data ?? [])[0] ?? null,
      porOrigen: porOrigen.data ?? [],
      asesores: {
        total: cobertura.reduce((a, r) => a + Number(r.total), 0),
        con_asesor: cobertura.reduce((a, r) => a + Number(r.con_asesor), 0),
        por_mes: cobertura,
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Agregar la RPC de cobertura de asesor**

La ruta usa `get_advisor_coverage`, que todavía no existe. Agregarla al final de `supabase/migrations/20260806000004_funnel_costs_rpc.sql`:

```sql
-- Cobertura de asignación de asesor, mes a mes.
-- Existe para MOSTRAR el problema, no para esconderlo: al 2026-08-06 solo 28
-- de 815 deals tienen assigned_to, así que cualquier métrica por persona sería
-- una mentira estadística. Esta pantalla es el argumento para arreglar el proceso.
DROP FUNCTION IF EXISTS get_advisor_coverage(DATE, DATE);

CREATE OR REPLACE FUNCTION get_advisor_coverage(p_from DATE, p_to DATE)
RETURNS TABLE (mes TEXT, total BIGINT, con_asesor BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(created_at, 'YYYY-MM') AS mes,
         count(*)::bigint                AS total,
         count(*) FILTER (WHERE assigned_to IS NOT NULL)::bigint AS con_asesor
    FROM deals
   WHERE created_at::date BETWEEN p_from AND p_to
   GROUP BY 1
   ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION get_advisor_coverage(DATE, DATE) TO authenticated;
```

Volver a correr `npx tsx --env-file=.env.local scripts/apply-funnel-rpcs-pg.ts` para aplicarla.

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep "funnels/insights" || echo "sin errores en la ruta"`
Expected: `sin errores en la ruta`.

- [ ] **Step 4: Commit**

```bash
git add app/api/funnels/insights supabase/migrations/20260806000004_funnel_costs_rpc.sql
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(metrics): ruta del tablero (tiempos, costos y cobertura de asesor)"
```

---

### Task 8: Las cuatro secciones en `/embudos`

**Files:**
- Create: `components/embudos/CuelloDeBotellaPanel.tsx`
- Create: `components/embudos/CostosPanel.tsx`
- Create: `components/embudos/CoberturaAsesoresPanel.tsx`
- Modify: `app/(dashboard)/embudos/EmbudosClient.tsx`
- Test: `components/embudos/paneles.test.tsx`
- Create: `scripts/embudo-insights.probe.tsx`

**Interfaces:**
- Consumes: `StageTiming`, `FunnelCosts`, `cuelloDeBotella`, `cobertura`, `esMuestraChica`, `formatearDuracion`, `etiquetaEtapa` de `lib/metrics/funnel-insights`; la ruta `/api/funnels/insights`.
- Produces:
  - `<CuelloDeBotellaPanel timings={StageTiming[]} />`
  - `<CostosPanel costs={FunnelCosts | null} />`
  - `<CoberturaAsesoresPanel data={{ total: number; con_asesor: number; por_mes: {mes:string;total:number;con_asesor:number}[] }} />`

**Dónde se enganchan:** `EmbudosClient` ya tiene selector de período (`range`), botón de refresco y `fetchAll`. Se suma una llamada a `/api/funnels/insights` dentro de `fetchAll` con el mismo `range`, y los tres paneles se renderizan debajo de lo que ya hay. **No se toca lo existente.**

La cuarta sección del spec —"cómo evoluciona"— se cubre con lo que `/embudos` **ya muestra** (curvas y evolución) más el mes a mes de `CoberturaAsesoresPanel`; no se agrega un gráfico nuevo para no duplicar. Si al verlo el usuario quiere una serie de costo mensual, se agrega después.

- [ ] **Step 1: Escribir el test que falla**

Crear `components/embudos/paneles.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { CuelloDeBotellaPanel } from './CuelloDeBotellaPanel'
import { CostosPanel } from './CostosPanel'
import { CoberturaAsesoresPanel } from './CoberturaAsesoresPanel'
import type { StageTiming, FunnelCosts } from '@/lib/metrics/funnel-insights'

const timings: StageTiming[] = [
  { desde: 'request', hasta: 'scheduled', n: 30, mediana_dias: 1, p75_dias: 2 },
  { desde: 'visited', hasta: 'appraisal_sent', n: 7, mediana_dias: 6, p75_dias: 9 },
]

const costsOk: FunnelCosts = {
  inversion: 1019737, solicitudes: 225, tasaciones: 40, captaciones: 11,
  costo_solicitud: 4532, costo_tasacion: 25493, costo_captacion: 92703,
  dias_con_dato: 92, dias_del_periodo: 92,
}

describe('CuelloDeBotellaPanel', () => {
  it('nombra el paso más lento en castellano', () => {
    render(<CuelloDeBotellaPanel timings={timings} />)
    expect(screen.getByText(/Visita realizada/)).toBeInTheDocument()
    expect(screen.getByText(/Tasación entregada/)).toBeInTheDocument()
  })

  it('marca la muestra chica del paso que la tiene', () => {
    render(<CuelloDeBotellaPanel timings={timings} />)
    expect(screen.getByText(/7 casos/)).toBeInTheDocument()
  })

  it('sin datos no inventa un cuello de botella', () => {
    render(<CuelloDeBotellaPanel timings={[]} />)
    expect(screen.getByText(/sin datos suficientes/i)).toBeInTheDocument()
  })
})

describe('CostosPanel', () => {
  it('con cobertura completa muestra los costos sin advertencia', () => {
    render(<CostosPanel costs={costsOk} />)
    expect(screen.getByText(/92\.703/)).toBeInTheDocument()
    expect(screen.queryByText(/Ojo:/)).not.toBeInTheDocument()
  })

  it('con cobertura parcial advierte que el costo real es mayor', () => {
    render(<CostosPanel costs={{ ...costsOk, dias_con_dato: 24, dias_del_periodo: 88 }} />)
    expect(screen.getByText(/24 de 88/)).toBeInTheDocument()
    expect(screen.getByText(/mayor que el que se muestra/i)).toBeInTheDocument()
  })

  it('sin inversión cargada dice que no hay datos, no cero', () => {
    render(<CostosPanel costs={{ ...costsOk, inversion: 0, dias_con_dato: 0, costo_captacion: null, costo_tasacion: null, costo_solicitud: null }} />)
    expect(screen.getByText(/sin datos de inversión/i)).toBeInTheDocument()
  })

  it('sin respuesta del servidor no rompe', () => {
    render(<CostosPanel costs={null} />)
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument()
  })

  it('compara lo pago contra el referido cuando hay datos por origen', () => {
    render(<CostosPanel costs={costsOk} porOrigen={[
      { origen: 'embudo', solicitudes: 225, captaciones: 8 },
      { origen: 'referido', solicitudes: 3, captaciones: 3 },
    ]} />)
    expect(screen.getByText('Embudo (pago)')).toBeInTheDocument()
    expect(screen.getByText('Referido')).toBeInTheDocument()
    expect(screen.getByText(/3 solicitudes · 3 captadas/)).toBeInTheDocument()
  })
})

describe('CoberturaAsesoresPanel', () => {
  it('muestra el problema en vez de una métrica falsa', () => {
    render(<CoberturaAsesoresPanel data={{
      total: 815, con_asesor: 28,
      por_mes: [{ mes: '2026-07', total: 50, con_asesor: 5 }],
    }} />)
    expect(screen.getByText(/28 de 815/)).toBeInTheDocument()
    expect(screen.getByText(/no puede medir/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run components/embudos/paneles.test.tsx`
Expected: FAIL — no se resuelven los tres componentes.

- [ ] **Step 3: Escribir `CuelloDeBotellaPanel`**

Crear `components/embudos/CuelloDeBotellaPanel.tsx`:

```tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import {
  cuelloDeBotella, esMuestraChica, etiquetaEtapa, formatearDuracion,
  type StageTiming,
} from '@/lib/metrics/funnel-insights'

export function CuelloDeBotellaPanel({ timings }: { timings: StageTiming[] }) {
  const { masLento, texto } = cuelloDeBotella(timings)
  const pasos = [...timings]
    .filter(t => t.hasta !== 'lost' && t.desde !== 'lost')
    .sort((a, b) => b.mediana_dias - a.mediana_dias)

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Dónde se traba?</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cuánto tarda cada paso del embudo. Se usa la mediana y no el promedio: un caso
          que tardó meses correría el promedio y escondería la realidad.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`text-sm rounded-lg px-3 py-2 ${masLento ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200' : 'bg-muted text-muted-foreground'}`}>
          {texto}
        </p>

        {pasos.length > 0 && (
          <div className="space-y-1.5">
            {pasos.map(t => (
              <div key={`${t.desde}-${t.hasta}`} className="flex items-center justify-between gap-3 text-sm border-b pb-1.5 last:border-0">
                <span className="min-w-0">
                  {etiquetaEtapa(t.desde)} <span className="text-muted-foreground">→</span> {etiquetaEtapa(t.hasta)}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <strong className="tabular-n">{formatearDuracion(t.mediana_dias)}</strong>
                  <span className="text-xs text-muted-foreground tabular-n">{t.n} casos</span>
                  {esMuestraChica(t.n) && (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-label="muestra chica" />
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Escribir `CostosPanel`**

Crear `components/embudos/CostosPanel.tsx`:

```tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cobertura, type FunnelCosts } from '@/lib/metrics/funnel-insights'

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
})

function Costo({ label, valor, detalle }: { label: string; valor: number | null; detalle: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p className="display text-xl tabular-n mt-1">
        {valor == null ? <span className="text-muted-foreground text-base">Sin datos</span> : ARS.format(valor)}
      </p>
      <p className="text-xs text-muted-foreground mt-0.5">{detalle}</p>
    </div>
  )
}

export function CostosPanel({ costs }: { costs: FunnelCosts | null }) {
  if (!costs) {
    return (
      <Card>
        <CardHeader><CardTitle>¿Cuánto cuesta?</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sin datos para este período.</p>
        </CardContent>
      </Card>
    )
  }

  const cob = cobertura(costs)

  return (
    <Card>
      <CardHeader>
        <CardTitle>¿Cuánto cuesta?</CardTitle>
        <p className="text-xs text-muted-foreground">
          Inversión publicitaria del embudo de captación, sin contar lo que se gasta en
          promocionar propiedades ya captadas.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={`text-sm rounded-lg px-3 py-2 ${cob.confiable ? 'bg-muted text-muted-foreground' : 'bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'}`}>
          {cob.texto}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Costo label="Por solicitud" valor={costs.costo_solicitud} detalle={`${costs.solicitudes} solicitudes`} />
          <Costo label="Por tasación entregada" valor={costs.costo_tasacion} detalle={`${costs.tasaciones} tasaciones`} />
          <Costo label="Por captación" valor={costs.costo_captacion} detalle={`${costs.captaciones} captaciones`} />
        </div>

        <p className="text-xs text-muted-foreground">
          Inversión del período: <strong className="tabular-n">{ARS.format(costs.inversion)}</strong>
        </p>

        {porOrigen.length > 0 && (
          <div className="pt-2 border-t space-y-1">
            <p className="eyebrow">De dónde vienen</p>
            <p className="text-xs text-muted-foreground pb-1">
              El referido no cuesta publicidad: comparar contra lo pago es lo que dice
              dónde conviene poner el esfuerzo.
            </p>
            {porOrigen.map(o => (
              <div key={o.origen} className="flex items-center justify-between text-sm border-b pb-1 last:border-0">
                <span>{ORIGEN_LABEL[o.origen] ?? o.origen}</span>
                <span className="text-muted-foreground tabular-n text-xs">
                  {o.solicitudes} solicitudes · {o.captaciones} captadas
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

Y arriba del componente, la traducción de los orígenes y el tipo:

```tsx
export interface VolumenPorOrigen {
  origen: string
  solicitudes: number
  captaciones: number
}

const ORIGEN_LABEL: Record<string, string> = {
  embudo: 'Embudo (pago)',
  clase_gratuita: 'Clase gratuita (pago)',
  referido: 'Referido',
  historico: 'Histórico (sistema anterior)',
  comprador: 'Comprador',
}
```

La firma del componente pasa a ser:

```tsx
export function CostosPanel({ costs, porOrigen = [] }: { costs: FunnelCosts | null; porOrigen?: VolumenPorOrigen[] }) {
```

y el caso `!costs` sigue devolviendo la tarjeta de "Sin datos para este período" igual que antes.

- [ ] **Step 5: Escribir `CoberturaAsesoresPanel`**

Crear `components/embudos/CoberturaAsesoresPanel.tsx`:

```tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  data: {
    total: number
    con_asesor: number
    por_mes: { mes: string; total: number; con_asesor: number }[]
  }
}

/**
 * Muestra el PROBLEMA en vez de una métrica falsa.
 *
 * Al 2026-08-06 solo 28 de 815 deals tienen asesor asignado, así que cualquier
 * número "por asesor" sería una mentira estadística. Esta pantalla existe para
 * que se vea, y es el argumento para arreglar la asignación en la operación.
 */
export function CoberturaAsesoresPanel({ data }: Props) {
  const pct = data.total > 0 ? Math.round((data.con_asesor / data.total) * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Por asesor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg px-3 py-2 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 text-sm">
          Solo <strong className="tabular-n">{data.con_asesor} de {data.total}</strong> solicitudes
          tienen asesor asignado ({pct}%). Hasta que se asigne al crear la solicitud,
          esta sección <strong>no puede medir</strong> nada por persona.
        </div>

        {data.por_mes.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="eyebrow">Asignación mes a mes</p>
            {data.por_mes.map(m => (
              <div key={m.mes} className="flex items-center justify-between border-b pb-1 last:border-0">
                <span className="tabular-n">{m.mes}</span>
                <span className="tabular-n text-muted-foreground">
                  {m.con_asesor} de {m.total}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `npx vitest run components/embudos/paneles.test.tsx`
Expected: PASS — 8 tests.

- [ ] **Step 7: Enganchar los paneles en `EmbudosClient`**

En `app/(dashboard)/embudos/EmbudosClient.tsx`:

**7a.** Agregar los imports arriba:

```tsx
import { CuelloDeBotellaPanel } from '@/components/embudos/CuelloDeBotellaPanel'
import { CostosPanel } from '@/components/embudos/CostosPanel'
import { CoberturaAsesoresPanel } from '@/components/embudos/CoberturaAsesoresPanel'
import type { StageTiming, FunnelCosts } from '@/lib/metrics/funnel-insights'
```

**7b.** Agregar el estado junto a los que ya existen:

```tsx
  const [insights, setInsights] = useState<{
    timings: StageTiming[]
    costs: FunnelCosts | null
    asesores: { total: number; con_asesor: number; por_mes: { mes: string; total: number; con_asesor: number }[] }
  } | null>(null)
```

**7c.** Dentro de `fetchAll`, después de la llamada que ya existe a `/api/funnels/metrics`, agregar:

```tsx
      // Las secciones nuevas son independientes: si esta llamada falla, el resto
      // de la pantalla tiene que seguir funcionando.
      try {
        const r = await fetch(`/api/funnels/insights?from=${range.from}&to=${range.to}`)
        setInsights(r.ok ? await r.json() : null)
      } catch {
        setInsights(null)
      }
```

**7d.** Al final del JSX, antes de cerrar el contenedor principal, agregar:

```tsx
      <CuelloDeBotellaPanel timings={insights?.timings ?? []} />
      <CostosPanel costs={insights?.costs ?? null} porOrigen={insights?.porOrigen ?? []} />
      {insights?.asesores && <CoberturaAsesoresPanel data={insights.asesores} />}
```

Y el tipo del estado del paso 7b incluye `porOrigen`:

```tsx
  const [insights, setInsights] = useState<{
    timings: StageTiming[]
    costs: FunnelCosts | null
    porOrigen: VolumenPorOrigen[]
    asesores: { total: number; con_asesor: number; por_mes: { mes: string; total: number; con_asesor: number }[] }
  } | null>(null)
```

con `VolumenPorOrigen` importado desde `@/components/embudos/CostosPanel`.

- [ ] **Step 8: Escribir el probe de render**

Crear `scripts/embudo-insights.probe.tsx`:

```tsx
/**
 * Probe de render de los tres paneles nuevos del tablero del embudo.
 * Correr: npx tsx scripts/embudo-insights.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { CuelloDeBotellaPanel } from '@/components/embudos/CuelloDeBotellaPanel'
import { CostosPanel } from '@/components/embudos/CostosPanel'
import { CoberturaAsesoresPanel } from '@/components/embudos/CoberturaAsesoresPanel'
import type { StageTiming, FunnelCosts } from '@/lib/metrics/funnel-insights'

function check(nombre: string, html: string, textos: string[]) {
  for (const t of textos) {
    if (!html.includes(t)) throw new Error(`[${nombre}] falta en el render: ${t}`)
  }
  console.log(`✓ ${nombre}`)
}

const timings: StageTiming[] = [
  { desde: 'request', hasta: 'scheduled', n: 30, mediana_dias: 1, p75_dias: 2 },
  { desde: 'visited', hasta: 'appraisal_sent', n: 7, mediana_dias: 6, p75_dias: 9 },
]
const costs: FunnelCosts = {
  inversion: 1019737, solicitudes: 225, tasaciones: 40, captaciones: 11,
  costo_solicitud: 4532, costo_tasacion: 25493, costo_captacion: 92703,
  dias_con_dato: 24, dias_del_periodo: 88,
}

check('cuello de botella', renderToStaticMarkup(<CuelloDeBotellaPanel timings={timings} />),
  ['¿Dónde se traba?', 'Visita realizada', 'Tasación entregada', '7 casos'])

check('cuello de botella sin datos', renderToStaticMarkup(<CuelloDeBotellaPanel timings={[]} />),
  ['Sin datos suficientes'])

check('costos con cobertura parcial', renderToStaticMarkup(<CostosPanel costs={costs} />),
  ['¿Cuánto cuesta?', '24 de 88', 'mayor que el que se muestra'])

check('costos sin datos', renderToStaticMarkup(<CostosPanel costs={null} />),
  ['Sin datos para este período'])

check('cobertura de asesores', renderToStaticMarkup(
  <CoberturaAsesoresPanel data={{ total: 815, con_asesor: 28, por_mes: [{ mes: '2026-07', total: 50, con_asesor: 5 }] }} />),
  ['Por asesor', '28', '815', 'no puede medir'])

console.log('\nLos tres paneles renderizan.')
```

- [ ] **Step 9: Verificación completa**

Run: `npx tsx scripts/embudo-insights.probe.tsx`
Expected: cinco `✓` y `Los tres paneles renderizan.`

Run: `npx vitest run`
Expected: toda la suite en verde.

Run: `npx tsc --noEmit 2>&1 | grep -E "embudos|funnel-insights|funnels/insights" || echo "sin errores en mis archivos"`
Expected: `sin errores en mis archivos`.

Run: `git diff --name-only $(git merge-base origin/main HEAD) HEAD`
Expected: SOLO archivos de esta tarea. **Si aparece cualquier archivo ajeno, parar**: se contaminó la rama y hay que reconstruirla desde `origin/main`.

- [ ] **Step 10: Commit**

```bash
git add components/embudos "app/(dashboard)/embudos/EmbudosClient.tsx" scripts/embudo-insights.probe.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(embudos): secciones de cuello de botella, costos y cobertura de asesores"
```

- [ ] **Step 11: Revisión visual del usuario**

Levantar el servidor desde el worktree (ruta sin acentos, pero Turbopack rechaza el `node_modules` enlazado, así que va webpack):

```bash
cd /tmp/claude-501/tablero-embudo && npx next dev --webpack --port 3300
```

Pedirle al usuario que entre a `/embudos` y confirme:

1. Abajo de lo que ya había aparecen las tres secciones nuevas.
2. "¿Dónde se traba?" nombra el paso más lento en castellano y marca los pasos con muestra chica.
3. "¿Cuánto cuesta?" advierte sobre la cobertura parcial de la inversión.
4. "Por asesor" muestra el problema de asignación con el detalle mes a mes.
5. Nada de lo que ya existía en la pantalla se rompió.

---

## Notas de implementación

- **Orden:** 1 → 8 en secuencia. La Task 2 tiene un alto obligatorio (Step 5) para consultar al humano antes de tocar producción.
- **Qué NO tocar:** `/metrics` y lo que ya existe en `EmbudosClient` (solo se agregan cosas); `lib/marketing/meta-ads.ts` más allá de las dos funciones nuevas; cualquier archivo de `components/inbox/`, `app/(dashboard)/inbox/` o `lib/integrations/mailchimp/` (otra sesión trabaja ahí).
- **Al terminar**, agregar a `CLAUDE.md`: que la inversión de Meta se sincroniza por `pg_cron` con el job `meta-sync`, que la separación embudo/propiedad es por `property_meta_campaigns` y no por nombre, y que el tablero muestra siempre tamaño de muestra y cobertura.
- **Pendientes conocidos que NO son de este plan:** el vínculo deal captado ↔ propiedad (necesario para "de captar a vender"), la asignación de asesor en la operación, y el job zombi `ghl-poll` que corre cada 10 minutos sobre un sistema dado de baja.
