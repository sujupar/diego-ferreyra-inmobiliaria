# Tasador IA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** agregar un segundo tasador (IA) que interpreta las características de cada propiedad, deja que la calculadora de siempre saque los números, y permite elegir con cuál de los dos trabajar — sin tocar el tasador clásico ni el PDF.

**Architecture:** la IA devuelve una interpretación (calidad, estado, disposición, piso, antigüedad, coeficiente de ubicación) por propiedad; `calculateValuation` produce un `ValuationResult` con esa interpretación. Se guarda como snapshot independiente en `appraisals.ai_valuation_result`; `valuation_source` dice cuál está en uso y los tres precios desnormalizados siguen al elegido. Las pantallas leen `valuacionActiva(row)`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Supabase (service role en rutas), `chatCompletion` (`lib/ai/chat-client.ts`, OpenAI/DeepSeek), zod 4, vitest, `pg` para la migración.

**Spec:** `docs/superpowers/specs/2026-09-10-tasador-ia-design.md`

## Global Constraints

- **El tasador clásico no cambia:** `lib/valuation/calculator.ts` y `rules.ts` no se modifican. `PDFReport.tsx` y `PDFPreviewModal.tsx` no se modifican.
- **Una sola llamada al modelo por request** (regla dura de CLAUDE.md). `timeoutMs: 20_000`, `maxTokens: 2000`, `temperature: 0.2`. Sin `maxDuration` (Netlify lo ignora).
- **Escrituras con los DOS candados** del PUT: `puedeEditarTasacion(user.profile.role)` + `canAccessAppraisal(user, id)`.
- **Nombres en castellano** para lo nuevo del negocio; los tipos existentes (`ValuationResult`, `ValuationProperty`) se reusan tal cual.
- **Sin `any`**, sin `as` para callar errores.
- **Commits:** autor `Sujupar <redstyle50@gmail.com>` (`git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit …`), mensaje en castellano, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- **Worktree:** `.claude/worktrees/tasador-ia`, rama `feat/tasador-ia`. `node_modules` es un symlink al checkout principal. `.env.local` vive en el checkout principal: `node --env-file=../../../.env.local --import tsx scripts/<x>.ts`.
- **Tests:** `npx vitest run --config vitest.tasador-ia.config.ts` (config acotada, Tarea 0). Tipos: `npx tsc --noEmit -p tsconfig.tasador-ia.json`. Si alguno se cuelga (iCloud), copiar el worktree a `/private/tmp/claude-501/wt-tasador-ia-verif` y correr ahí.
- **Textos de UI:** "Tasador clásico", "Tasador IA", "En uso", "Analizando comparables…", "Generar", "Regenerar", "Reintentar", "Desactualizada: cambiaron los datos".

---

### Task 0: Configs acotadas de vitest y tsc

**Files:**
- Create: `vitest.tasador-ia.config.ts`
- Create: `tsconfig.tasador-ia.json`

**Interfaces:** produce los dos comandos que usan TODAS las tareas siguientes.

- [ ] **Step 1: Crear la config de vitest acotada**

```ts
// vitest.tasador-ia.config.ts
// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo lo que toca el Tasador IA.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/valuation/**/*.test.ts',
      'lib/supabase/appraisals*.test.ts',
      'app/api/appraisals/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify', '**/.claude/worktrees/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

- [ ] **Step 2: Crear el tsconfig acotado**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "incremental": false },
  "include": [
    "next-env.d.ts",
    "lib/valuation/**/*.ts",
    "lib/supabase/appraisals.ts",
    "lib/supabase/appraisals-write.ts",
    "lib/ai/chat-client.ts",
    "app/api/appraisals/**/*.ts",
    "app/(dashboard)/appraisals/[id]/page.tsx",
    "app/(dashboard)/appraisal/new/page.tsx",
    "components/appraisal/SelectorDeTasador.tsx",
    "types/database.types.ts",
    "scripts/probar-tasador-ia.ts",
    "scripts/apply-appraisal-ai-valuation-pg.ts"
  ]
}
```

- [ ] **Step 3: Verificar que corren** (todavía sin tests nuevos: `app/api/appraisals/[id]/route.test.ts` ya existe)

Run: `npx vitest run --config vitest.tasador-ia.config.ts`
Expected: la suite de `app/api/appraisals` pasa (verde). Si tarda >2 min, seguir la nota de iCloud de Global Constraints.

- [ ] **Step 4: Commit**

```bash
git add vitest.tasador-ia.config.ts tsconfig.tasador-ia.json
git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -m "chore(tasaciones): configs acotadas de vitest y tsc para el Tasador IA

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 1: Migración, tipos generados y script de aplicación

**Files:**
- Create: `supabase/migrations/20260910000001_appraisal_ai_valuation.sql`
- Create: `scripts/apply-appraisal-ai-valuation-pg.ts`
- Modify: `types/database.types.ts` (bloque `appraisals` Row/Insert/Update, líneas ~164-237)

**Interfaces:**
- Produce: columnas `ai_valuation_result JSONB`, `ai_valuation_status TEXT`, `ai_valuation_error TEXT`, `valuation_source TEXT NOT NULL DEFAULT 'calculator'`.

- [ ] **Step 1: Verificar numeración** — `ls supabase/migrations | tail -3` debe terminar en `20260903000001_landing_ab_test.sql`. Si hay algo con prefijo `20260910`, usar `20260910000002`.

- [ ] **Step 2: Escribir la migración**

```sql
-- Tasador IA: segunda valuación (misma forma que valuation_result) + cuál está en uso.
-- Aditiva: nada existente cambia; las tasaciones viejas quedan en 'calculator'.
ALTER TABLE appraisals
  ADD COLUMN IF NOT EXISTS ai_valuation_result JSONB,
  ADD COLUMN IF NOT EXISTS ai_valuation_status TEXT,
  ADD COLUMN IF NOT EXISTS ai_valuation_error TEXT,
  ADD COLUMN IF NOT EXISTS valuation_source TEXT NOT NULL DEFAULT 'calculator';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appraisals_ai_valuation_status_check') THEN
    ALTER TABLE appraisals ADD CONSTRAINT appraisals_ai_valuation_status_check
      CHECK (ai_valuation_status IS NULL OR ai_valuation_status IN ('pending','ready','failed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appraisals_valuation_source_check') THEN
    ALTER TABLE appraisals ADD CONSTRAINT appraisals_valuation_source_check
      CHECK (valuation_source IN ('calculator','ai'));
  END IF;
END $$;

COMMENT ON COLUMN appraisals.ai_valuation_result IS 'Snapshot del Tasador IA (ValuationResult + meta.ai). Independiente de valuation_result.';
COMMENT ON COLUMN appraisals.valuation_source IS 'Tasador en uso: calculator | ai. Los precios desnormalizados siguen a este.';
```

- [ ] **Step 3: Escribir el script de aplicación con verificación**

```ts
/**
 * Aplica `20260910000001_appraisal_ai_valuation.sql` contra el proyecto de la app
 * (mncsnastmcjdjxrehdep) y VERIFICA: que las 4 columnas existan, que el CHECK
 * rechace un tasador desconocido, y que ninguna fila haya quedado con un tasador
 * distinto de 'calculator' (la migración no debe cambiar ninguna elección).
 * Correr: node --env-file=../../../.env.local --import tsx scripts/apply-appraisal-ai-valuation-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20260910000001_appraisal_ai_valuation.sql', 'utf8'))

  const { rows: cols } = await c.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='appraisals'
       AND column_name IN ('ai_valuation_result','ai_valuation_status','ai_valuation_error','valuation_source')`)
  const nombres = cols.map(r => r.column_name).sort()
  console.log('columnas:', nombres.join(', '))
  if (nombres.length !== 4) throw new Error(`faltan columnas: hay ${nombres.length} de 4`)

  let rechazado = false
  try {
    await c.query(`UPDATE appraisals SET valuation_source='otro' WHERE false`)
    // WHERE false no toca filas; para probar el CHECK hace falta una fila real → usar un SAVEPOINT
    await c.query('BEGIN')
    await c.query(`UPDATE appraisals SET valuation_source='otro' WHERE id = (SELECT id FROM appraisals LIMIT 1)`)
    await c.query('ROLLBACK')
  } catch { rechazado = true; await c.query('ROLLBACK').catch(() => undefined) }
  console.log(`tasador desconocido: ${rechazado ? 'RECHAZADO por la base ✓' : 'ACEPTADO ✗'}`)
  if (!rechazado) throw new Error('¡ALERTA! el CHECK de valuation_source no frena valores desconocidos')

  const { rows: n } = await c.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE valuation_source <> 'calculator')::int AS distintas FROM appraisals`)
  await c.end()
  console.log(`tasaciones: ${n[0].total} · con tasador distinto de calculator: ${n[0].distintas}`)
  if (n[0].distintas !== 0) throw new Error('¡ALERTA! alguna fila quedó con valuation_source distinto de calculator')
  console.log('\n✅ aplicada y verificada')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Step 4: Aplicar contra la base** (es aditiva; el código que la usa viene después)

Run: `node --env-file=../../../.env.local --import tsx scripts/apply-appraisal-ai-valuation-pg.ts`
Expected: `columnas: ai_valuation_error, ai_valuation_result, ai_valuation_status, valuation_source` · `RECHAZADO por la base ✓` · `distintas: 0` · `✅ aplicada y verificada`. Pegar la salida en el mensaje al dueño.

- [ ] **Step 5: Agregar las columnas a `types/database.types.ts`**

En `appraisals.Row` (después de `report_edits: Json | null`):
```ts
                    ai_valuation_result: Json | null
                    ai_valuation_status: string | null
                    ai_valuation_error: string | null
                    valuation_source: string
```
En `Insert` y `Update`, las mismas cuatro con `?` (`ai_valuation_result?: Json | null`, …, `valuation_source?: string`).

- [ ] **Step 6: Tipos**

Run: `npx tsc --noEmit -p tsconfig.tasador-ia.json`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260910000001_appraisal_ai_valuation.sql scripts/apply-appraisal-ai-valuation-pg.ts types/database.types.ts
git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -m "feat(tasaciones): columnas del Tasador IA en appraisals (aplicadas y verificadas)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Tipos del Tasador IA y `completarValuacion` (extraída del wizard)

**Files:**
- Create: `lib/valuation/ia-tipos.ts`
- Create: `lib/valuation/completar-valuacion.ts`
- Test: `lib/valuation/completar-valuacion.test.ts`
- Modify: `app/(dashboard)/appraisal/new/page.tsx:512-566` (efecto de recálculo) y `:676-717` (`handleCalculate`)

**Interfaces:**
- Produce:
```ts
// lib/valuation/ia-tipos.ts
import type { ValuationFeatures, ValuationResult } from './calculator'
export type ValuationSource = 'calculator' | 'ai'
export type AiValuationStatus = 'pending' | 'ready' | 'failed'
export type AiConfidence = 'alta' | 'media' | 'baja'
export interface AiPropertyInterpretation { features: ValuationFeatures; reasoning: string }
export interface AiValuationMeta {
  provider: string; model: string; generatedAt: string; confidence: AiConfidence
  summary: string; inputFingerprint: string
  subject: AiPropertyInterpretation; comparables: AiPropertyInterpretation[]
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
}
export type AiValuationResult = ValuationResult & { ai: AiValuationMeta }
/** Las 4 columnas nuevas de `appraisals`, tal como viajan a las pantallas. */
export interface ColumnasTasadorIA {
  ai_valuation_result: AiValuationResult | null
  ai_valuation_status: AiValuationStatus | null
  ai_valuation_error: string | null
  valuation_source: ValuationSource
}
```
```ts
// lib/valuation/completar-valuacion.ts
export interface OpcionesCompletarValuacion {
  ownerSharePercent: number
  purchaseScenarios: PurchaseScenarioInput[]
  selectedScenarioIds: PurchaseScenarioId[]
  /** purchaseResult legacy; se conserva SOLO si siguen existiendo escenarios. */
  previousPurchaseResult?: PurchaseResult
}
export function completarValuacion(base: ValuationResult, opts: OpcionesCompletarValuacion): ValuationResult
```

- [ ] **Step 1: Escribir `lib/valuation/ia-tipos.ts`** con el contenido de arriba (más el docblock: "misma forma que `ValuationResult` a propósito: tablas, Mapa de Valor y PDF no distinguen").

- [ ] **Step 2: Escribir el test que falla**

```ts
// lib/valuation/completar-valuacion.test.ts
import { describe, it, expect } from 'vitest'
import { completarValuacion } from './completar-valuacion'
import { buildDefaultScenarios, calculateAllScenarios } from './purchase-scenarios'
import type { ValuationResult, PurchaseResult } from './calculator'

const base = {
  moneyInHand: 100_000, publicationPrice: 120_000, saleValue: 114_000, currency: 'USD',
} as unknown as ValuationResult

describe('completarValuacion — lo que el wizard agregaba a mano', () => {
  it('calcula la parte del propietario y el dinero disponible', () => {
    const r = completarValuacion(base, { ownerSharePercent: 50, purchaseScenarios: [], selectedScenarioIds: [] })
    expect(r.ownerSharePercent).toBe(50)
    expect(r.ownerShareMoney).toBe(50_000)
  })

  it('sin escenarios: purchaseScenarios undefined, selectedScenarioIds vacío, purchaseResult se descarta', () => {
    const legacy = { total: 1 } as unknown as PurchaseResult
    const r = completarValuacion(base, { ownerSharePercent: 100, purchaseScenarios: [], selectedScenarioIds: ['prop_0:medium'], previousPurchaseResult: legacy })
    expect(r.purchaseScenarios).toBeUndefined()
    expect(r.selectedScenarioIds).toEqual([])
    expect(r.purchaseResult).toBeUndefined()
  })

  it('con escenarios: los calcula sobre la parte del propietario y filtra la selección a ids existentes', () => {
    const escenarios = buildDefaultScenarios(200_000, 'prop_0', 'Depto A')
    const legacy = { total: 1 } as unknown as PurchaseResult
    const r = completarValuacion(base, {
      ownerSharePercent: 50, purchaseScenarios: escenarios,
      selectedScenarioIds: ['prop_0:medium', 'prop_9:aggressive'], previousPurchaseResult: legacy,
    })
    expect(r.purchaseScenarios).toEqual(calculateAllScenarios(escenarios, 50_000))
    expect(r.selectedScenarioIds).toEqual(['prop_0:medium'])
    expect(r.purchaseResult).toBe(legacy)
  })

  it('redondea el dinero del propietario como el wizard (Math.round)', () => {
    const r = completarValuacion({ ...base, moneyInHand: 100_001 } as ValuationResult, { ownerSharePercent: 33, purchaseScenarios: [], selectedScenarioIds: [] })
    expect(r.ownerShareMoney).toBe(Math.round(100_001 * 0.33))
  })
})
```

- [ ] **Step 3: Correr y ver que falla**

Run: `npx vitest run --config vitest.tasador-ia.config.ts lib/valuation/completar-valuacion.test.ts`
Expected: FAIL — "Cannot find module './completar-valuacion'".

- [ ] **Step 4: Implementar**

```ts
// lib/valuation/completar-valuacion.ts
/**
 * Lo que el wizard agregaba a mano encima de `calculateValuation` (parte del
 * propietario, escenarios de compra, selección). Vive acá para que el Tasador
 * IA lo aplique EXACTAMENTE igual sobre su propio resultado: si difiriera, las
 * dos tarjetas no serían comparables.
 */
import type { PurchaseResult, PurchaseScenarioId, PurchaseScenarioInput, ValuationResult } from './calculator'
import { calculateAllScenarios } from './purchase-scenarios'

export interface OpcionesCompletarValuacion {
  ownerSharePercent: number
  purchaseScenarios: PurchaseScenarioInput[]
  selectedScenarioIds: PurchaseScenarioId[]
  /** purchaseResult legacy; se conserva SOLO si siguen existiendo escenarios. */
  previousPurchaseResult?: PurchaseResult
}

export function completarValuacion(base: ValuationResult, opts: OpcionesCompletarValuacion): ValuationResult {
  const ownerShareMoney = Math.round(base.moneyInHand * (opts.ownerSharePercent / 100))
  const calculados = opts.purchaseScenarios.length > 0
    ? calculateAllScenarios(opts.purchaseScenarios, ownerShareMoney)
    : undefined
  // Si no quedan escenarios, la selección se limpia: ids huérfanos harían que
  // el PDF intente renderizar tablas inexistentes.
  const escenarios = calculados && calculados.length > 0 ? calculados : undefined
  const seleccion = escenarios
    ? opts.selectedScenarioIds.filter(id => escenarios.some(s => s.id === id))
    : []
  return {
    ...base,
    purchaseResult: escenarios ? opts.previousPurchaseResult : undefined,
    purchaseScenarios: escenarios,
    selectedScenarioIds: seleccion,
    ownerSharePercent: opts.ownerSharePercent,
    ownerShareMoney,
  }
}
```

- [ ] **Step 5: Correr y ver que pasa** — mismo comando, Expected: 4 tests PASS.

- [ ] **Step 6: Usar `completarValuacion` en el wizard (sin cambiar comportamiento)**

En el efecto de recálculo (`page.tsx` ~544-566) reemplazar desde `const ownerShareMoney = …` hasta el cierre de `const merged: ValuationResult = {…}` por:
```ts
        const merged = completarValuacion(next, {
            ownerSharePercent,
            purchaseScenarios,
            selectedScenarioIds,
            previousPurchaseResult: valuationResult.purchaseResult,
        })
```
En `handleCalculate` (~684-717): dejar el bloque de `scenariosForCalc` (edge case) y reemplazar `const ownerShareMoney = …`, `const scenarioResults = …` y el `if (result) { result = {…} }` por:
```ts
        if (result) {
            result = completarValuacion(result, {
                ownerSharePercent,
                purchaseScenarios: scenariosForCalc,
                selectedScenarioIds,
            })
        }
```
Import: `import { completarValuacion } from '@/lib/valuation/completar-valuacion'`. Si `calculateAllScenarios` queda sin uso en el archivo, quitar el import (dejar `buildDefaultScenarios`).

- [ ] **Step 7: Tipos** — `npx tsc --noEmit -p tsconfig.tasador-ia.json` → sin errores.

- [ ] **Step 8: Commit**

```bash
git add lib/valuation/ia-tipos.ts lib/valuation/completar-valuacion.ts lib/valuation/completar-valuacion.test.ts "app/(dashboard)/appraisal/new/page.tsx"
git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -m "refactor(tasaciones): completarValuacion sale del wizard para que el Tasador IA la reuse

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Huella de insumos (`huellaDeInsumos`)

**Files:**
- Create: `lib/valuation/huella-insumos.ts`
- Test: `lib/valuation/huella-insumos.test.ts`

**Interfaces:**
```ts
export interface PropiedadParaHuella {
  price?: number | null; currency?: string | null; location?: string; description?: string
  features: { coveredArea?: number | null; semiCoveredArea?: number | null; uncoveredArea?: number | null
              totalArea?: number | null; floor?: number | null; age?: number | null; publishedDate?: string | null }
}
export interface InsumosParaHuella {
  subject: PropiedadParaHuella; comparables: PropiedadParaHuella[]
  expenseRates?: ExpenseRates; ownerSharePercent?: number
}
export function huellaDeInsumos(i: InsumosParaHuella): string   // hex de 13-14 chars, determinístico
```
Corre en servidor Y navegador (sin `node:crypto`).

- [ ] **Step 1: Test que falla**

```ts
// lib/valuation/huella-insumos.test.ts
import { describe, it, expect } from 'vitest'
import { huellaDeInsumos, type InsumosParaHuella } from './huella-insumos'

const base: InsumosParaHuella = {
  subject: { price: null, location: 'Almagro', description: 'Luminoso', features: { coveredArea: 50, floor: 3, age: 40 } },
  comparables: [
    { price: 100_000, currency: 'USD', location: 'Almagro', description: 'a', features: { coveredArea: 48, uncoveredArea: 6, age: 30 } },
    { price: 120_000, currency: 'USD', location: 'Almagro', description: 'b', features: { coveredArea: 55, age: 10 } },
  ],
  expenseRates: { saleDiscountPercent: 5 },
  ownerSharePercent: 100,
}
const clon = (): InsumosParaHuella => JSON.parse(JSON.stringify(base))

describe('huellaDeInsumos — cambia con lo objetivo, no con el juicio', () => {
  it('es determinística', () => {
    expect(huellaDeInsumos(base)).toBe(huellaDeInsumos(clon()))
    expect(huellaDeInsumos(base)).toMatch(/^[0-9a-f]{8,16}$/)
  })
  it('cambia si cambia el precio de un comparable', () => {
    const c = clon(); c.comparables[0].price = 101_000
    expect(huellaDeInsumos(c)).not.toBe(huellaDeInsumos(base))
  })
  it('cambia si cambia una superficie, la descripción o las tasas de gastos', () => {
    const s = clon(); s.subject.features.coveredArea = 51
    const d = clon(); d.comparables[1].description = 'otra'
    const t = clon(); t.expenseRates = { saleDiscountPercent: 6 }
    for (const x of [s, d, t]) expect(huellaDeInsumos(x)).not.toBe(huellaDeInsumos(base))
  })
  it('NO cambia con calidad, estado, disposición ni coeficiente de ubicación', () => {
    const c = clon() as InsumosParaHuella & { comparables: Array<{ features: Record<string, unknown> }> }
    c.comparables[0].features.quality = 'EXCELLENT'
    c.comparables[0].features.conservationState = 'STATE_1'
    c.comparables[0].features.disposition = 'FRONT'
    c.comparables[0].features.locationCoefficient = 1.2
    expect(huellaDeInsumos(c)).toBe(huellaDeInsumos(base))
  })
  it('trata null y undefined igual, y recorta espacios de la descripción', () => {
    const c = clon(); c.subject.price = undefined; c.subject.description = '  Luminoso  '
    expect(huellaDeInsumos(c)).toBe(huellaDeInsumos(base))
  })
  it('cambia si cambia el orden de los comparables', () => {
    const c = clon(); c.comparables.reverse()
    expect(huellaDeInsumos(c)).not.toBe(huellaDeInsumos(base))
  })
})
```

- [ ] **Step 2: Correr → FAIL** (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// lib/valuation/huella-insumos.ts
/**
 * Huella de los insumos OBJETIVOS de una tasación (precios, superficies,
 * descripciones, ubicación, piso, antigüedad, tasas). NO incluye lo que cada
 * tasador decide (calidad, estado, disposición, coeficiente de ubicación):
 * eso es justamente lo que diferencia al clásico de la IA.
 *
 * Si la huella actual de la tasación ≠ la guardada en el snapshot IA, la
 * tarjeta IA avisa "Desactualizada". Corre en servidor y en navegador, por eso
 * el hash es propio (cyrb53) y no `node:crypto`.
 */
import type { ExpenseRates } from './calculator'

export interface PropiedadParaHuella {
  price?: number | null
  currency?: string | null
  location?: string
  description?: string
  features: {
    coveredArea?: number | null; semiCoveredArea?: number | null; uncoveredArea?: number | null
    totalArea?: number | null; floor?: number | null; age?: number | null; publishedDate?: string | null
  }
}

export interface InsumosParaHuella {
  subject: PropiedadParaHuella
  comparables: PropiedadParaHuella[]
  expenseRates?: ExpenseRates
  ownerSharePercent?: number
}

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const s = (v: string | null | undefined) => (v ?? '').trim()

function canonica(p: PropiedadParaHuella): unknown[] {
  const f = p.features ?? {}
  return [n(p.price), s(p.currency), s(p.location), s(p.description),
    n(f.coveredArea), n(f.semiCoveredArea), n(f.uncoveredArea), n(f.totalArea),
    n(f.floor), n(f.age), s(f.publishedDate)]
}

/** cyrb53 — hash de 53 bits, público y determinístico. */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16)
}

export function huellaDeInsumos(i: InsumosParaHuella): string {
  const r = i.expenseRates ?? {}
  const payload = [
    canonica(i.subject),
    i.comparables.map(canonica),
    [n(r.saleDiscountPercent), n(r.deedDiscountPercent), n(r.stampsPercent), n(r.deedExpensesPercent), n(r.agencyFeesPercent)],
    n(i.ownerSharePercent),
  ]
  return cyrb53(JSON.stringify(payload))
}
```

- [ ] **Step 4: Correr → 6 PASS.**

- [ ] **Step 5: Commit**

```bash
git add lib/valuation/huella-insumos.ts lib/valuation/huella-insumos.test.ts
git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -m "feat(tasaciones): huella de los insumos objetivos para saber si la valuación IA quedó vieja

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: El Tasador IA (`lib/valuation/tasador-ia.ts`)

**Files:**
- Create: `lib/valuation/tasador-ia.ts`
- Test: `lib/valuation/tasador-ia.test.ts`

**Interfaces:**
- Consumes: `chatCompletion` (`lib/ai/chat-client.ts`), `calculateValuation`, `completarValuacion`, `huellaDeInsumos`, `VALUATION_RULES`.
- Produces:
```ts
export interface EntradaTasadorIA {
  subject: ValuationProperty
  comparables: ValuationProperty[]           // SOLO normales, en orden de sort_order
  expenseRates?: ExpenseRates
  ownerSharePercent: number
  purchaseScenarios: PurchaseScenarioInput[]
  selectedScenarioIds: PurchaseScenarioId[]
  previousPurchaseResult?: PurchaseResult
}
export type ChatTasador = (input: { messages: {role:'system'|'user';content:string}[]; temperature: number; jsonMode: true; maxTokens: number; timeoutMs: number; model?: string })
  => Promise<{ content: string; provider: string; model: string; usage?: {promptTokens:number;completionTokens:number;totalTokens:number} }>
export function describirMetodo(): string
export function armarPromptTasadorIA(e: EntradaTasadorIA): { system: string; user: string }
export function validarRespuestaTasadorIA(raw: unknown, cantidadComparables: number): RespuestaTasadorIA  // lanza Error en castellano
export function fusionarInterpretacion(base: ValuationFeatures, ia: InterpretacionIA): ValuationFeatures
export async function correrTasadorIA(e: EntradaTasadorIA, deps: { chat: ChatTasador; ahora?: () => Date }): Promise<AiValuationResult>  // lanza Error
export class ErrorTasadorIA extends Error {}
```

- [ ] **Step 1: Test que falla**

```ts
// lib/valuation/tasador-ia.test.ts
import { describe, it, expect } from 'vitest'
import {
  armarPromptTasadorIA, validarRespuestaTasadorIA, fusionarInterpretacion, correrTasadorIA, describirMetodo,
  type EntradaTasadorIA, type ChatTasador,
} from './tasador-ia'
import { calculateValuation, type ValuationProperty } from './calculator'
import { huellaDeInsumos } from './huella-insumos'

const subject: ValuationProperty = {
  price: null, currency: 'USD', title: 'Depto 3 amb', location: 'Almagro, CABA',
  description: '<p>Luminoso, a estrenar, al frente</p>',
  features: { coveredArea: 60, uncoveredArea: 8, floor: 4, age: null as unknown as number, quality: 'GOOD', conservationState: 'STATE_2', disposition: 'BACK' },
}
const comparables: ValuationProperty[] = [
  { price: 120_000, currency: 'USD', title: 'A', location: 'Almagro', description: 'Muy buen estado', features: { coveredArea: 55, floor: 2, age: 30, quality: 'GOOD_ECONOMIC', conservationState: 'STATE_2', disposition: 'FRONT' } },
  { price: 150_000, currency: 'USD', title: 'B', location: 'Almagro', description: 'Reciclado', features: { coveredArea: 65, floor: 6, age: 50, quality: 'GOOD', conservationState: 'STATE_3', disposition: 'BACK' } },
  { price: 99_000, currency: 'USD', title: 'C', location: 'Boedo', description: 'A refaccionar', features: { coveredArea: 50, floor: 1, age: 60 } },
]
const entrada: EntradaTasadorIA = { subject, comparables, expenseRates: { saleDiscountPercent: 5 }, ownerSharePercent: 100, purchaseScenarios: [], selectedScenarioIds: [] }

const interp = (i: number, extra: Record<string, unknown> = {}) => ({
  index: i, quality: 'GOOD', conservationState: 'STATE_2', disposition: 'FRONT', floor: 3, age: 20, locationCoefficient: 1.0, reasoning: `c${i}`, ...extra,
})
const respuestaOk = () => ({
  subject: { quality: 'VERY_GOOD', conservationState: 'STATE_1', disposition: 'FRONT', floor: 4, age: 0, locationCoefficient: 1.05, reasoning: 'a estrenar' },
  comparables: [interp(0), interp(1, { conservationState: 'STATE_3', quality: 'GOOD' }), interp(2, { locationCoefficient: 0.95, quality: 'ECONOMIC' })],
  summary: 'Zona homogénea', confidence: 'media',
})

describe('describirMetodo — el prompt lleva las tablas del método, generadas del código', () => {
  it('incluye calidad, disposición, piso, estados y la vida útil', () => {
    const t = describirMetodo()
    expect(t).toContain('EXCELLENT')
    expect(t).toContain('1.275')
    expect(t).toContain('INTERNAL')
    expect(t).toContain('STATE_4_5')
    expect(t).toContain('70')
  })
})

describe('armarPromptTasadorIA', () => {
  it('lleva los comparables numerados con precio y superficies, y la descripción sin HTML', () => {
    const { system, user } = armarPromptTasadorIA(entrada)
    expect(system).toContain(describirMetodo())
    expect(user).toContain('"index": 0')
    expect(user).toContain('120000')
    expect(user).toContain('Luminoso, a estrenar, al frente')
    expect(user).not.toContain('<p>')
  })
  it('recorta descripciones largas a 600 caracteres', () => {
    const larga = { ...entrada, subject: { ...subject, description: 'x'.repeat(2000) } }
    const { user } = armarPromptTasadorIA(larga)
    expect(user).not.toContain('x'.repeat(601))
  })
})

describe('validarRespuestaTasadorIA — nunca datos a medias', () => {
  it('acepta una respuesta completa', () => {
    expect(validarRespuestaTasadorIA(respuestaOk(), 3).comparables).toHaveLength(3)
  })
  it('rechaza un enum inventado', () => {
    const r = respuestaOk(); r.comparables[0].quality = 'LUJO'
    expect(() => validarRespuestaTasadorIA(r, 3)).toThrow(/calidad|quality/i)
  })
  it('rechaza coeficiente de ubicación fuera de [0.70, 1.30]', () => {
    const r = respuestaOk(); r.subject.locationCoefficient = 1.6
    expect(() => validarRespuestaTasadorIA(r, 3)).toThrow(/ubicaci/i)
  })
  it('rechaza índices faltantes o repetidos', () => {
    const falta = respuestaOk(); falta.comparables.pop()
    expect(() => validarRespuestaTasadorIA(falta, 3)).toThrow(/comparable/i)
    const repite = respuestaOk(); repite.comparables[2].index = 1
    expect(() => validarRespuestaTasadorIA(repite, 3)).toThrow(/comparable/i)
  })
  it('rechaza lo que no es JSON de objeto', () => {
    expect(() => validarRespuestaTasadorIA('hola', 3)).toThrow()
    expect(() => validarRespuestaTasadorIA(null, 3)).toThrow()
  })
})

describe('fusionarInterpretacion — lo objetivo se respeta', () => {
  const base = { coveredArea: 55, uncoveredArea: 5, floor: 2, age: 30, quality: 'GOOD_ECONOMIC' as const, locationCoefficient: 1 }
  const ia = { quality: 'EXCELLENT' as const, conservationState: 'STATE_1' as const, disposition: 'INTERNAL' as const, floor: 9, age: 5, locationCoefficient: 1.1, reasoning: 'r' }
  it('mantiene superficies, y piso/antigüedad cuando ya estaban', () => {
    const f = fusionarInterpretacion(base, ia)
    expect(f.coveredArea).toBe(55); expect(f.uncoveredArea).toBe(5)
    expect(f.floor).toBe(2); expect(f.age).toBe(30)
  })
  it('toma calidad, estado, disposición y ubicación de la IA', () => {
    const f = fusionarInterpretacion(base, ia)
    expect(f.quality).toBe('EXCELLENT'); expect(f.conservationState).toBe('STATE_1')
    expect(f.disposition).toBe('INTERNAL'); expect(f.locationCoefficient).toBe(1.1)
  })
  it('completa piso/antigüedad SOLO cuando faltan', () => {
    const f = fusionarInterpretacion({ coveredArea: 55, floor: null as unknown as number, age: undefined }, ia)
    expect(f.floor).toBe(9); expect(f.age).toBe(5)
  })
})

describe('correrTasadorIA', () => {
  const chatOk: ChatTasador = async () => ({ content: JSON.stringify(respuestaOk()), provider: 'openai', model: 'gpt-x', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } })

  it('devuelve un ValuationResult calculado por la calculadora con las features fusionadas', async () => {
    const r = await correrTasadorIA(entrada, { chat: chatOk, ahora: () => new Date('2026-09-10T12:00:00Z') })
    const esperado = calculateValuation({
      subject: { ...subject, features: r.ai.subject.features },
      comparables: comparables.map((c, i) => ({ ...c, features: r.ai.comparables[i].features })),
      expenseRates: entrada.expenseRates,
    })
    expect(r.publicationPrice).toBe(esperado?.publicationPrice)
    expect(r.subjectQualityCoef).toBe(1.175)           // VERY_GOOD que dijo la IA
    expect(r.comparableAnalysis[2].locationCoefficient).toBe(0.95)
    expect(r.ai.confidence).toBe('media')
    expect(r.ai.model).toBe('gpt-x')
    expect(r.ai.generatedAt).toBe('2026-09-10T12:00:00.000Z')
    expect(r.ai.inputFingerprint).toBe(huellaDeInsumos({ subject, comparables, expenseRates: entrada.expenseRates, ownerSharePercent: 100 }))
    expect(r.ownerSharePercent).toBe(100)
    expect(r.ai.comparables[1].reasoning).toBe('c1')
  })
  it('hace UNA sola llamada, en modo JSON y con techo de tiempo', async () => {
    const llamadas: unknown[] = []
    const chat: ChatTasador = async (i) => { llamadas.push(i); return chatOk(i) }
    await correrTasadorIA(entrada, { chat })
    expect(llamadas).toHaveLength(1)
    const i = llamadas[0] as { jsonMode: boolean; timeoutMs: number; temperature: number }
    expect(i.jsonMode).toBe(true); expect(i.timeoutMs).toBe(20_000); expect(i.temperature).toBeLessThanOrEqual(0.3)
  })
  it('falla con mensaje legible si el modelo devuelve algo inválido', async () => {
    const chat: ChatTasador = async () => ({ content: '{"subject":{}}', provider: 'openai', model: 'm' })
    await expect(correrTasadorIA(entrada, { chat })).rejects.toThrow(/Tasador IA/)
  })
  it('falla si hay menos de 3 comparables', async () => {
    await expect(correrTasadorIA({ ...entrada, comparables: comparables.slice(0, 2) }, { chat: chatOk })).rejects.toThrow(/3 comparables/)
  })
  it('no deja pasar comparables sin precio o sin superficie (la calculadora los saltearía y los índices se correrían)', async () => {
    const sinPrecio = { ...entrada, comparables: [...comparables, { ...comparables[0], price: null }] }
    await expect(correrTasadorIA(sinPrecio, { chat: chatOk })).rejects.toThrow(/precio|superficie/i)
  })
})
```

- [ ] **Step 2: Correr → FAIL** (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// lib/valuation/tasador-ia.ts
/**
 * Tasador IA: la IA es el TASADOR (juzga calidad, estado, disposición, piso,
 * antigüedad y ubicación de cada propiedad); la CALCULADORA es la misma
 * (`calculateValuation`). Por eso el resultado tiene exactamente la forma del
 * clásico y ningún coeficiente del PDF queda sin explicar por la tabla.
 *
 * Una sola llamada al modelo por request (regla dura de CLAUDE.md).
 */
import { z } from 'zod'
import { calculateValuation, type ExpenseRates, type PurchaseResult, type PurchaseScenarioId, type PurchaseScenarioInput, type ValuationFeatures, type ValuationProperty } from './calculator'
import { VALUATION_RULES, type ConservationStateType, type DispositionType, type QualityType } from './rules'
import { completarValuacion } from './completar-valuacion'
import { huellaDeInsumos } from './huella-insumos'
import type { AiValuationResult, AiPropertyInterpretation } from './ia-tipos'

export interface EntradaTasadorIA {
  subject: ValuationProperty
  /** SOLO comparables normales, en orden de sort_order. */
  comparables: ValuationProperty[]
  expenseRates?: ExpenseRates
  ownerSharePercent: number
  purchaseScenarios: PurchaseScenarioInput[]
  selectedScenarioIds: PurchaseScenarioId[]
  previousPurchaseResult?: PurchaseResult
}

export type ChatTasador = (input: {
  messages: { role: 'system' | 'user'; content: string }[]
  temperature: number; jsonMode: true; maxTokens: number; timeoutMs: number; model?: string
}) => Promise<{ content: string; provider: string; model: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>

export class ErrorTasadorIA extends Error {
  constructor(msg: string) { super(`Tasador IA: ${msg}`); this.name = 'ErrorTasadorIA' }
}

const CALIDADES = ['ECONOMIC', 'GOOD_ECONOMIC', 'GOOD', 'VERY_GOOD', 'EXCELLENT'] as const
const ESTADOS = ['STATE_1', 'STATE_1_5', 'STATE_2', 'STATE_2_5', 'STATE_3', 'STATE_3_5', 'STATE_4', 'STATE_4_5', 'STATE_5'] as const
const DISPOSICIONES = ['FRONT', 'BACK', 'LATERAL', 'INTERNAL'] as const
const MAX_DESCRIPCION = 600
const MAX_RAZON = 240

const interpretacionSchema = z.object({
  quality: z.enum(CALIDADES, { error: 'calidad (quality) inválida' }),
  conservationState: z.enum(ESTADOS, { error: 'estado de conservación inválido' }),
  disposition: z.enum(DISPOSICIONES, { error: 'disposición inválida' }),
  floor: z.number().int().min(0).max(60).nullable().optional(),
  age: z.number().min(0).max(150).nullable().optional(),
  locationCoefficient: z.number().min(0.7, 'coeficiente de ubicación fuera de rango').max(1.3, 'coeficiente de ubicación fuera de rango'),
  reasoning: z.string().max(2000).transform(s => s.trim().slice(0, MAX_RAZON)),
})
const respuestaSchema = z.object({
  subject: interpretacionSchema,
  comparables: z.array(interpretacionSchema.extend({ index: z.number().int().min(0) })),
  summary: z.string().max(4000).transform(s => s.trim().slice(0, 600)),
  confidence: z.enum(['alta', 'media', 'baja']),
})
export type InterpretacionIA = z.infer<typeof interpretacionSchema>
export type RespuestaTasadorIA = z.infer<typeof respuestaSchema>

/** El método, GENERADO desde `VALUATION_RULES` para que nunca se desincronice del código. */
export function describirMetodo(): string {
  const R = VALUATION_RULES
  const lineas = (o: Record<string, number | { name: string; depreciation: string }>) =>
    Object.entries(o).map(([k, v]) => typeof v === 'number' ? `  - ${k}: ${v}` : `  - ${k}: ${v.name} (depreciación ${v.depreciation})`).join('\n')
  return [
    'MÉTODO DE COMPARABLES (Ross-Heidecke). Cada propiedad tiene un coeficiente total N = J × K_piso × K_disposición × M × W.',
    `Superficie homogeneizada = cubierta × ${R.SURFACE_COEFFICIENTS.COVERED} + semicubierta × ${R.SURFACE_COEFFICIENTS.SEMI_COVERED} + descubierta × ${R.SURFACE_COEFFICIENTS.UNCOVERED}.`,
    'J = coeficiente de ubicación (1.00 = zona de referencia; menor si la ubicación resta, mayor si suma; rango permitido 0.70 a 1.30).',
    'K_piso, por número de piso (0 = planta baja):\n' + lineas(R.FLOOR_COEFFICIENTS),
    'K_disposición:\n' + lineas(R.DISPOSITION_COEFFICIENTS),
    'M = calidad constructiva:\n' + lineas(R.QUALITY_COEFFICIENTS),
    `W = edad-estado (tabla Ross-Heidecke, vida útil ${R.DEFAULT_LIFE_SPAN} años) según antigüedad y estado de conservación:\n` + lineas(R.CONSERVATION_STATE),
    'El precio por m² ajustado de cada comparable es precio / superficie homogeneizada / N. Se promedian y se multiplican por el N de la propiedad a tasar.',
  ].join('\n\n')
}

const sinHtml = (t: string | undefined) => (t ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPCION)

function fichaParaPrompt(p: ValuationProperty, index?: number) {
  const f = p.features
  return {
    ...(index !== undefined ? { index } : {}),
    titulo: p.title ?? '', ubicacion: p.location ?? '',
    precio: p.price ?? null, moneda: p.currency ?? null,
    superficie: { cubierta: f.coveredArea ?? null, semicubierta: f.semiCoveredArea ?? null, descubierta: f.uncoveredArea ?? null, total: f.totalArea ?? null },
    piso: f.floor ?? null, pisosTotales: f.totalFloors ?? null, antiguedad: f.age ?? null,
    ambientes: f.rooms ?? null, dormitorios: f.bedrooms ?? null, banos: f.bathrooms ?? null, cocheras: f.garages ?? null,
    publicado: f.publishedDate ?? null, vistas: f.views ?? null,
    descripcion: sinHtml(p.description),
  }
}

export function armarPromptTasadorIA(e: EntradaTasadorIA): { system: string; user: string } {
  const system = [
    'Sos un tasador inmobiliario senior de Buenos Aires. Aplicás el método de comparables de la inmobiliaria, tal cual está descripto abajo, interpretando cada propiedad a partir de su descripción, ubicación, antigüedad y datos.',
    describirMetodo(),
    'TU TAREA: para la propiedad a tasar y para CADA comparable, decidir quality, conservationState, disposition, floor, age y locationCoefficient, con una justificación corta (máx. 240 caracteres) por propiedad. Si la descripción dice "a estrenar" o "reciclado", reflejalo en conservationState. Si un comparable está en otro barrio o zona peor/mejor, ajustá su locationCoefficient. No inventes datos: si algo no se puede saber, usá el valor más probable y decilo en la justificación.',
    'RESPONDÉ SOLO con un JSON con esta forma exacta:',
    '{"subject":{"quality":"GOOD","conservationState":"STATE_2","disposition":"FRONT","floor":3,"age":40,"locationCoefficient":1.0,"reasoning":"..."},"comparables":[{"index":0,"quality":"...","conservationState":"...","disposition":"...","floor":0,"age":0,"locationCoefficient":1.0,"reasoning":"..."}],"summary":"resumen de 2-4 frases sobre cómo interpretaste el conjunto","confidence":"alta|media|baja"}',
    `Valores permitidos: quality ∈ ${CALIDADES.join('|')}; conservationState ∈ ${ESTADOS.join('|')}; disposition ∈ ${DISPOSICIONES.join('|')}; locationCoefficient entre 0.70 y 1.30. Debe haber exactamente un objeto por comparable, con su index.`,
  ].join('\n\n')
  const user = JSON.stringify({
    propiedadATasar: fichaParaPrompt(e.subject),
    comparables: e.comparables.map((c, i) => fichaParaPrompt(c, i)),
  }, null, 1)
  return { system, user }
}

export function validarRespuestaTasadorIA(raw: unknown, cantidadComparables: number): RespuestaTasadorIA {
  const parsed = respuestaSchema.safeParse(raw)
  if (!parsed.success) {
    const primero = parsed.error.issues[0]
    throw new ErrorTasadorIA(`respuesta inválida del modelo (${primero?.path.join('.')}: ${primero?.message})`)
  }
  const indices = parsed.data.comparables.map(c => c.index).sort((a, b) => a - b)
  const esperados = Array.from({ length: cantidadComparables }, (_, i) => i)
  if (JSON.stringify(indices) !== JSON.stringify(esperados)) {
    throw new ErrorTasadorIA(`el modelo no interpretó todos los comparables (esperaba ${cantidadComparables}, recibió índices ${indices.join(',')})`)
  }
  return parsed.data
}

/** Lo objetivo (superficies, precio) se respeta; piso/antigüedad solo si faltaban; el juicio es de la IA. */
export function fusionarInterpretacion(base: ValuationFeatures, ia: InterpretacionIA): ValuationFeatures {
  const tiene = (v: number | null | undefined) => typeof v === 'number' && Number.isFinite(v)
  return {
    ...base,
    quality: ia.quality as QualityType,
    conservationState: ia.conservationState as ConservationStateType,
    disposition: ia.disposition as DispositionType,
    locationCoefficient: ia.locationCoefficient,
    floor: tiene(base.floor) ? base.floor : (ia.floor ?? base.floor ?? undefined),
    age: tiene(base.age) ? base.age : (ia.age ?? base.age ?? undefined),
  }
}

export async function correrTasadorIA(e: EntradaTasadorIA, deps: { chat: ChatTasador; ahora?: () => Date }): Promise<AiValuationResult> {
  if (e.comparables.length < 3) throw new ErrorTasadorIA('hacen falta al menos 3 comparables')
  // La calculadora SALTEA comparables sin precio o sin superficie, y entonces
  // `comparableAnalysis[i]` dejaría de corresponder con `ai.comparables[i]`.
  const invalido = e.comparables.findIndex(c => !c.price || c.price <= 0 || !(c.features.coveredArea || c.features.semiCoveredArea || c.features.uncoveredArea))
  if (invalido >= 0) throw new ErrorTasadorIA(`el comparable ${invalido + 1} no tiene precio o superficie`)

  const { system, user } = armarPromptTasadorIA(e)
  const res = await deps.chat({
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    temperature: 0.2, jsonMode: true, maxTokens: 2000, timeoutMs: 20_000,
    model: process.env.TASADOR_IA_MODEL || undefined,
  })
  let raw: unknown
  try { raw = JSON.parse(res.content) } catch { throw new ErrorTasadorIA('el modelo no devolvió JSON') }
  const r = validarRespuestaTasadorIA(raw, e.comparables.length)

  const subject: AiPropertyInterpretation = { features: fusionarInterpretacion(e.subject.features, r.subject), reasoning: r.subject.reasoning }
  const porIndice = new Map(r.comparables.map(c => [c.index, c]))
  const comparables: AiPropertyInterpretation[] = e.comparables.map((c, i) => {
    const ia = porIndice.get(i)!  // validado arriba: hay exactamente uno por índice
    return { features: fusionarInterpretacion(c.features, ia), reasoning: ia.reasoning }
  })

  const base = calculateValuation({
    subject: { ...e.subject, features: subject.features },
    comparables: e.comparables.map((c, i) => ({ ...c, features: comparables[i].features })),
    expenseRates: e.expenseRates,
  })
  if (!base) throw new ErrorTasadorIA('la calculadora no pudo valuar con la interpretación recibida')
  const completo = completarValuacion(base, {
    ownerSharePercent: e.ownerSharePercent, purchaseScenarios: e.purchaseScenarios,
    selectedScenarioIds: e.selectedScenarioIds, previousPurchaseResult: e.previousPurchaseResult,
  })
  return {
    ...completo,
    ai: {
      provider: res.provider, model: res.model, generatedAt: (deps.ahora ?? (() => new Date()))().toISOString(),
      confidence: r.confidence, summary: r.summary,
      inputFingerprint: huellaDeInsumos({ subject: e.subject, comparables: e.comparables, expenseRates: e.expenseRates, ownerSharePercent: e.ownerSharePercent }),
      subject, comparables, usage: res.usage,
    },
  }
}
```
Nota zod 4: si `z.enum(X, { error })` no compila con esa firma, usar `z.enum(X, { message: '…' })` — verificar con tsc.

- [ ] **Step 4: Correr → todos PASS.** Si el test del prompt falla por `"index": 0` (formato de `JSON.stringify` con indent 1 produce `"index": 0`), ajustar el test al formato real, no el módulo.

- [ ] **Step 5: Tipos** — `npx tsc --noEmit -p tsconfig.tasador-ia.json`.

- [ ] **Step 6: Commit**

```bash
git add lib/valuation/tasador-ia.ts lib/valuation/tasador-ia.test.ts
git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -m "feat(tasaciones): el Tasador IA interpreta cada propiedad y la calculadora saca los números

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: `valuacionActiva`, precios desnormalizados y estado de la tarjeta IA

**Files:**
- Create: `lib/valuation/valuacion-activa.ts`
- Test: `lib/valuation/valuacion-activa.test.ts`

**Interfaces:**
```ts
export interface FilaConTasadores extends ColumnasTasadorIA { valuation_result: ValuationResult; updated_at?: string | null }
export interface FilaComparable { title: string|null; location: string|null; url: string|null; price: number|null; currency: string|null; description: string|null; images: string[]|null; features: ValuationFeatures; analysis: { propertyType?: string } | null; sort_order: number }
export function comparablesNormales(rows: FilaComparable[]): FilaComparable[]          // filtra overpriced/purchase, ordena por sort_order
export function filaAPropiedad(row: FilaComparable, features?: ValuationFeatures): ValuationProperty
export function rehidratar(result: ValuationResult, comparables: ValuationProperty[]): ValuationResult  // comparableAnalysis[i].property = comparables[i] si falta
export function comparablesDelSnapshotIA(rows: FilaComparable[], ai: AiValuationMeta): ValuationProperty[]  // features = ai.comparables[i].features
export function valuacionActiva(fila: FilaConTasadores, rows: FilaComparable[]): { source: ValuationSource; result: ValuationResult; comparables: ValuationProperty[] }
export function preciosDesnormalizados(r: ValuationResult): { publication_price: number; sale_value: number; money_in_hand: number; currency: string }
export type EstadoTarjetaIA = 'sin_generar' | 'analizando' | 'lista' | 'desactualizada' | 'fallida'
export function estadoTarjetaIA(fila: FilaConTasadores, huellaActual: string, ahora?: Date): EstadoTarjetaIA
export const PENDIENTE_MAX_MS = 2 * 60_000
```

- [ ] **Step 1: Test que falla**

```ts
// lib/valuation/valuacion-activa.test.ts
import { describe, it, expect } from 'vitest'
import { valuacionActiva, preciosDesnormalizados, estadoTarjetaIA, comparablesNormales, comparablesDelSnapshotIA, type FilaConTasadores, type FilaComparable } from './valuacion-activa'
import type { ValuationResult } from './calculator'
import type { AiValuationResult } from './ia-tipos'

const clasico = { publicationPrice: 100_000, saleValue: 95_000, moneyInHand: 90_000, currency: 'USD', subjectSurface: 50, comparableAnalysis: [{ adjustedPriceM2: 1 }, { adjustedPriceM2: 2 }] } as unknown as ValuationResult
const ia = {
  ...clasico, publicationPrice: 110_000, saleValue: 104_500, moneyInHand: 99_000,
  ai: { provider: 'openai', model: 'm', generatedAt: 'x', confidence: 'alta', summary: 's', inputFingerprint: 'h1',
    subject: { features: { coveredArea: 50 }, reasoning: '' },
    comparables: [{ features: { coveredArea: 40, quality: 'EXCELLENT' }, reasoning: '' }, { features: { coveredArea: 60 }, reasoning: '' }] },
} as unknown as AiValuationResult
const rows: FilaComparable[] = [
  { title: 'B', location: null, url: null, price: 2, currency: 'USD', description: null, images: null, features: { coveredArea: 60 }, analysis: null, sort_order: 1 },
  { title: 'A', location: null, url: null, price: 1, currency: 'USD', description: null, images: null, features: { coveredArea: 40, quality: 'GOOD' }, analysis: null, sort_order: 0 },
  { title: 'sobre', location: null, url: null, price: 9, currency: 'USD', description: null, images: null, features: {}, analysis: { propertyType: 'overpriced' }, sort_order: 1000 },
]
const fila = (extra: Partial<FilaConTasadores>): FilaConTasadores => ({
  valuation_result: clasico, ai_valuation_result: null, ai_valuation_status: null, ai_valuation_error: null, valuation_source: 'calculator', updated_at: '2026-09-10T10:00:00Z', ...extra,
})

describe('comparablesNormales', () => {
  it('saca sobrevaluadas y compra, y ordena por sort_order', () => {
    expect(comparablesNormales(rows).map(r => r.title)).toEqual(['A', 'B'])
  })
})

describe('comparablesDelSnapshotIA', () => {
  it('usa la fila para título/precio y el snapshot para las features', () => {
    const c = comparablesDelSnapshotIA(rows, ia.ai)
    expect(c[0].title).toBe('A'); expect(c[0].price).toBe(1)
    expect(c[0].features.quality).toBe('EXCELLENT')
  })
})

describe('valuacionActiva', () => {
  it('por defecto es la clásica, con los comparables rehidratados desde las filas', () => {
    const v = valuacionActiva(fila({}), rows)
    expect(v.source).toBe('calculator')
    expect(v.result.publicationPrice).toBe(100_000)
    expect(v.result.comparableAnalysis[0].property.title).toBe('A')
    expect(v.result.comparableAnalysis[0].property.features.quality).toBe('GOOD')
  })
  it('con IA elegida y lista devuelve el snapshot IA con SUS features', () => {
    const v = valuacionActiva(fila({ valuation_source: 'ai', ai_valuation_result: ia, ai_valuation_status: 'ready' }), rows)
    expect(v.source).toBe('ai')
    expect(v.result.publicationPrice).toBe(110_000)
    expect(v.result.comparableAnalysis[0].property.features.quality).toBe('EXCELLENT')
  })
  it('con IA elegida pero NO lista cae a la clásica (defensa)', () => {
    const v = valuacionActiva(fila({ valuation_source: 'ai', ai_valuation_result: null, ai_valuation_status: 'failed' }), rows)
    expect(v.source).toBe('calculator')
  })
  it('no pisa un property ya presente en el resultado', () => {
    const conProp = { ...clasico, comparableAnalysis: [{ property: { title: 'ya', features: {} } }, {}] } as unknown as ValuationResult
    const v = valuacionActiva(fila({ valuation_result: conProp }), rows)
    expect(v.result.comparableAnalysis[0].property.title).toBe('ya')
    expect(v.result.comparableAnalysis[1].property.title).toBe('B')
  })
})

describe('preciosDesnormalizados', () => {
  it('toma los tres precios y la moneda', () => {
    expect(preciosDesnormalizados(ia)).toEqual({ publication_price: 110_000, sale_value: 104_500, money_in_hand: 99_000, currency: 'USD' })
  })
})

describe('estadoTarjetaIA', () => {
  const ahora = new Date('2026-09-10T10:01:00Z')
  it('sin snapshot ni estado → sin_generar', () => expect(estadoTarjetaIA(fila({}), 'h1', ahora)).toBe('sin_generar'))
  it('pending reciente → analizando', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'pending' }), 'h1', ahora)).toBe('analizando'))
  it('pending de hace más de 2 minutos → fallida (la función murió a mitad)', () =>
    expect(estadoTarjetaIA(fila({ ai_valuation_status: 'pending', updated_at: '2026-09-10T09:50:00Z' }), 'h1', ahora)).toBe('fallida'))
  it('failed → fallida', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'failed', ai_valuation_error: 'x' }), 'h1', ahora)).toBe('fallida'))
  it('ready con la misma huella → lista', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'ready', ai_valuation_result: ia }), 'h1', ahora)).toBe('lista'))
  it('ready con otra huella → desactualizada', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'ready', ai_valuation_result: ia }), 'h2', ahora)).toBe('desactualizada'))
  it('ready sin snapshot (inconsistente) → fallida', () => expect(estadoTarjetaIA(fila({ ai_valuation_status: 'ready' }), 'h1', ahora)).toBe('fallida'))
})
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/valuation/valuacion-activa.ts
/**
 * Qué tasador está EN USO y cómo se lee su resultado. Todas las pantallas
 * (detalle, wizard, PDF) pasan por acá para no repartir el `if` por el código.
 */
import type { ValuationFeatures, ValuationProperty, ValuationResult } from './calculator'
import type { AiValuationMeta, ColumnasTasadorIA, ValuationSource } from './ia-tipos'

export interface FilaConTasadores extends ColumnasTasadorIA {
  valuation_result: ValuationResult
  updated_at?: string | null
}

export interface FilaComparable {
  title: string | null; location: string | null; url: string | null
  price: number | null; currency: string | null; description: string | null
  images: string[] | null; features: ValuationFeatures
  analysis: { propertyType?: string } | null; sort_order: number
}

export const PENDIENTE_MAX_MS = 2 * 60_000

export function comparablesNormales(rows: FilaComparable[]): FilaComparable[] {
  return rows
    .filter(r => r.analysis?.propertyType !== 'overpriced' && r.analysis?.propertyType !== 'purchase')
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
}

export function filaAPropiedad(row: FilaComparable, features?: ValuationFeatures): ValuationProperty {
  return {
    title: row.title ?? '', location: row.location ?? '', description: row.description ?? '', url: row.url ?? '',
    price: row.price, currency: row.currency, images: row.images ?? [],
    features: features ?? row.features ?? {},
  }
}

/** `comparableAnalysis[i].property` se quita al guardar; acá vuelve desde las filas. */
export function rehidratar(result: ValuationResult, comparables: ValuationProperty[]): ValuationResult {
  if (!result?.comparableAnalysis?.length) return result
  return {
    ...result,
    comparableAnalysis: result.comparableAnalysis.map((a, i) => ({
      ...a,
      property: a.property ?? comparables[i] ?? { title: '', location: '', description: '', url: '', price: null, currency: null, images: [], features: {} },
    })),
  }
}

export function comparablesDelSnapshotIA(rows: FilaComparable[], ai: AiValuationMeta): ValuationProperty[] {
  return comparablesNormales(rows).map((r, i) => filaAPropiedad(r, ai.comparables[i]?.features ?? r.features))
}

export function valuacionActiva(fila: FilaConTasadores, rows: FilaComparable[]): { source: ValuationSource; result: ValuationResult; comparables: ValuationProperty[] } {
  const iaLista = fila.valuation_source === 'ai' && fila.ai_valuation_status === 'ready' && !!fila.ai_valuation_result
  if (iaLista && fila.ai_valuation_result) {
    const comparables = comparablesDelSnapshotIA(rows, fila.ai_valuation_result.ai)
    return { source: 'ai', result: rehidratar(fila.ai_valuation_result, comparables), comparables }
  }
  const comparables = comparablesNormales(rows).map(r => filaAPropiedad(r))
  return { source: 'calculator', result: rehidratar(fila.valuation_result, comparables), comparables }
}

export function preciosDesnormalizados(r: ValuationResult) {
  return { publication_price: r.publicationPrice, sale_value: r.saleValue, money_in_hand: r.moneyInHand, currency: r.currency }
}

export type EstadoTarjetaIA = 'sin_generar' | 'analizando' | 'lista' | 'desactualizada' | 'fallida'

export function estadoTarjetaIA(fila: FilaConTasadores, huellaActual: string, ahora: Date = new Date()): EstadoTarjetaIA {
  const s = fila.ai_valuation_status
  if (!s) return 'sin_generar'
  if (s === 'failed') return 'fallida'
  if (s === 'pending') {
    const desde = fila.updated_at ? new Date(fila.updated_at).getTime() : 0
    return ahora.getTime() - desde > PENDIENTE_MAX_MS ? 'fallida' : 'analizando'
  }
  if (!fila.ai_valuation_result) return 'fallida'
  return fila.ai_valuation_result.ai.inputFingerprint === huellaActual ? 'lista' : 'desactualizada'
}
```

- [ ] **Step 4: Correr → PASS.** **Step 5: tsc.** **Step 6: Commit** (`feat(tasaciones): valuacionActiva decide qué tasador se lee y el estado de la tarjeta IA`).

---

### Task 6: Edición en línea sobre el snapshot IA (`recalcularSnapshotIA`)

**Files:**
- Create: `lib/valuation/editar-snapshot-ia.ts`
- Test: `lib/valuation/editar-snapshot-ia.test.ts`

**Interfaces:**
```ts
export type CambioSnapshotIA =
  | { tipo: 'subject'; features: ValuationFeatures }
  | { tipo: 'comparable'; index: number; features: ValuationFeatures }
  | { tipo: 'gastos'; expenseRates: Partial<ExpenseRates> }
export function recalcularSnapshotIA(snapshot: AiValuationResult, subject: ValuationProperty, comparablesNormales: ValuationProperty[], cambio: CambioSnapshotIA): AiValuationResult | null
```
`comparablesNormales` aporta precio/moneda/título (las filas); las features salen del snapshot (y del cambio). La huella NO se recalcula (los insumos objetivos no cambian por esta vía). `previousPurchaseResult`, escenarios y `ownerSharePercent` se toman del snapshot.

- [ ] **Step 1: Test que falla**

```ts
// lib/valuation/editar-snapshot-ia.test.ts
import { describe, it, expect } from 'vitest'
import { recalcularSnapshotIA } from './editar-snapshot-ia'
import { calculateValuation, type ValuationProperty } from './calculator'
import { completarValuacion } from './completar-valuacion'
import type { AiValuationResult } from './ia-tipos'

const subject: ValuationProperty = { price: null, currency: 'USD', features: { coveredArea: 60, floor: 3, age: 20, quality: 'GOOD', conservationState: 'STATE_2', disposition: 'FRONT' } }
const filas: ValuationProperty[] = [
  { price: 120_000, currency: 'USD', title: 'A', features: { coveredArea: 55, floor: 2, age: 30 } },
  { price: 150_000, currency: 'USD', title: 'B', features: { coveredArea: 65, floor: 6, age: 50 } },
  { price: 99_000, currency: 'USD', title: 'C', features: { coveredArea: 50, floor: 1, age: 60 } },
]
const featIA = [
  { coveredArea: 55, floor: 2, age: 30, quality: 'GOOD' as const, conservationState: 'STATE_2' as const, disposition: 'FRONT' as const, locationCoefficient: 1 },
  { coveredArea: 65, floor: 6, age: 50, quality: 'GOOD' as const, conservationState: 'STATE_3' as const, disposition: 'BACK' as const, locationCoefficient: 1 },
  { coveredArea: 50, floor: 1, age: 60, quality: 'ECONOMIC' as const, conservationState: 'STATE_3' as const, disposition: 'FRONT' as const, locationCoefficient: 0.95 },
]
function snapshotBase(): AiValuationResult {
  const base = calculateValuation({ subject, comparables: filas.map((f, i) => ({ ...f, features: featIA[i] })), expenseRates: { saleDiscountPercent: 5 } })!
  return {
    ...completarValuacion(base, { ownerSharePercent: 50, purchaseScenarios: [], selectedScenarioIds: [] }),
    ai: { provider: 'p', model: 'm', generatedAt: 'g', confidence: 'alta', summary: 's', inputFingerprint: 'huella',
      subject: { features: subject.features, reasoning: 'r0' },
      comparables: featIA.map((f, i) => ({ features: f, reasoning: `r${i + 1}` })) },
  }
}

describe('recalcularSnapshotIA', () => {
  it('cambiar la calidad de un comparable recalcula SOLO ese y conserva el resto del snapshot', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'comparable', index: 0, features: { ...featIA[0], quality: 'EXCELLENT' } })!
    expect(r.comparableAnalysis[0].qualityCoefficient).toBe(1.275)
    expect(r.comparableAnalysis[1].qualityCoefficient).toBe(s.comparableAnalysis[1].qualityCoefficient)
    expect(r.ai.comparables[0].features.quality).toBe('EXCELLENT')
    expect(r.ai.comparables[0].reasoning).toBe('r1')
    expect(r.ai.inputFingerprint).toBe('huella')
    expect(r.publicationPrice).not.toBe(s.publicationPrice)
  })
  it('cambiar el subject usa las features nuevas y las guarda en el snapshot', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'subject', features: { ...subject.features, quality: 'EXCELLENT' } })!
    expect(r.subjectQualityCoef).toBe(1.275)
    expect(r.ai.subject.features.quality).toBe('EXCELLENT')
  })
  it('cambiar los gastos mantiene el precio de publicación y cambia el dinero en mano', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'gastos', expenseRates: { agencyFeesPercent: 4 } })!
    expect(r.publicationPrice).toBe(s.publicationPrice)
    expect(r.expenseRates.agencyFeesPercent).toBe(4)
    expect(r.expenseRates.saleDiscountPercent).toBe(5)
    expect(r.moneyInHand).toBeLessThan(s.moneyInHand)
  })
  it('conserva la parte del propietario y la recalcula sobre el nuevo dinero en mano', () => {
    const s = snapshotBase()
    const r = recalcularSnapshotIA(s, subject, filas, { tipo: 'gastos', expenseRates: { agencyFeesPercent: 4 } })!
    expect(r.ownerSharePercent).toBe(50)
    expect(r.ownerShareMoney).toBe(Math.round(r.moneyInHand * 0.5))
  })
  it('devuelve null si la calculadora no puede (superficie 0)', () => {
    const s = snapshotBase()
    expect(recalcularSnapshotIA(s, subject, filas, { tipo: 'subject', features: { coveredArea: 0 } })).toBeNull()
  })
  it('un índice fuera de rango devuelve null', () => {
    expect(recalcularSnapshotIA(snapshotBase(), subject, filas, { tipo: 'comparable', index: 7, features: {} })).toBeNull()
  })
})
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar**

```ts
// lib/valuation/editar-snapshot-ia.ts
/**
 * Edición en línea del snapshot IA. Toca SOLO el snapshot: el resultado clásico
 * no se entera (y viceversa). La huella no cambia porque por esta vía no se
 * tocan precios ni superficies de las FILAS: lo que cambia es el juicio.
 */
import { calculateValuation, type ExpenseRates, type ValuationFeatures, type ValuationProperty } from './calculator'
import { completarValuacion } from './completar-valuacion'
import type { AiValuationResult } from './ia-tipos'

export type CambioSnapshotIA =
  | { tipo: 'subject'; features: ValuationFeatures }
  | { tipo: 'comparable'; index: number; features: ValuationFeatures }
  | { tipo: 'gastos'; expenseRates: Partial<ExpenseRates> }

export function recalcularSnapshotIA(
  snapshot: AiValuationResult,
  subject: ValuationProperty,
  comparablesNormales: ValuationProperty[],
  cambio: CambioSnapshotIA,
): AiValuationResult | null {
  if (cambio.tipo === 'comparable' && (cambio.index < 0 || cambio.index >= snapshot.ai.comparables.length)) return null

  const subjectFeatures = cambio.tipo === 'subject' ? cambio.features : snapshot.ai.subject.features
  const comparables = snapshot.ai.comparables.map((c, i) =>
    cambio.tipo === 'comparable' && cambio.index === i ? { ...c, features: cambio.features } : c)
  const expenseRates: ExpenseRates = cambio.tipo === 'gastos' ? { ...snapshot.expenseRates, ...cambio.expenseRates } : snapshot.expenseRates

  const base = calculateValuation({
    subject: { ...subject, features: subjectFeatures },
    comparables: comparablesNormales.map((fila, i) => ({ ...fila, features: comparables[i]?.features ?? fila.features })),
    expenseRates,
  })
  if (!base) return null
  const completo = completarValuacion(base, {
    ownerSharePercent: snapshot.ownerSharePercent ?? 100,
    purchaseScenarios: snapshot.purchaseScenarios ?? [],
    selectedScenarioIds: snapshot.selectedScenarioIds ?? [],
    previousPurchaseResult: snapshot.purchaseResult,
  })
  return { ...completo, ai: { ...snapshot.ai, subject: { ...snapshot.ai.subject, features: subjectFeatures }, comparables } }
}
```
Nota: `purchaseScenarios` en el snapshot son `PurchaseScenarioResult[]` (extienden `PurchaseScenarioInput`), así que pasan directo.

- [ ] **Step 4: Correr → PASS.** **Step 5: tsc.** **Step 6: Commit** (`feat(tasaciones): editar en línea la versión IA sin tocar la clásica`).

---

### Task 7: Persistencia en el servidor (`appraisals-write.ts`) y cliente (`appraisals.ts`)

**Files:**
- Modify: `lib/supabase/appraisals-write.ts` (`replaceAppraisalComparables` líneas 158-211 + 2 funciones nuevas)
- Modify: `lib/supabase/appraisals.ts` (`AppraisalDetail` + 3 funciones nuevas)
- Test: `lib/supabase/appraisals-write.tasador-ia.test.ts`

**Interfaces:**
```ts
// appraisals-write.ts
export async function guardarValuacionIA(supabase: SupabaseClient, id: string, patch:
  { status: 'pending' } | { status: 'ready'; result: AiValuationResult } | { status: 'failed'; error: string }): Promise<void>
export async function elegirTasador(supabase: SupabaseClient, id: string, source: ValuationSource): Promise<{ teniaPreciosEditados: boolean }>
// lanza Error('La valuación IA no está lista') si source='ai' y status≠'ready'
// appraisals.ts
export interface AppraisalDetail { …existente…; ai_valuation_result: AiValuationResult | null; ai_valuation_status: AiValuationStatus | null; ai_valuation_error: string | null; valuation_source: ValuationSource }
export async function generarValuacionIA(id: string): Promise<ColumnasTasadorIA & { updated_at: string }>
export async function elegirTasadorDeTasacion(id: string, source: ValuationSource): Promise<{ teniaPreciosEditados: boolean }>
export async function guardarSnapshotIA(id: string, result: AiValuationResult): Promise<void>
```

- [ ] **Step 1: Test que falla** (cliente Supabase falso, chainable, que registra `update` y devuelve filas por tabla)

```ts
// lib/supabase/appraisals-write.tasador-ia.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { guardarValuacionIA, elegirTasador, replaceAppraisalComparables } from './appraisals-write'
import type { AiValuationResult } from '@/lib/valuation/ia-tipos'
import type { SaveAppraisalInput } from './appraisals'

/** Cliente falso: `from(t).select().eq().single()` devuelve `filas[t]`; registra los `update`/`insert`/`delete`. */
function clienteFalso(filas: Record<string, unknown>) {
  const escrituras: { tabla: string; op: string; payload?: unknown }[] = []
  const armar = (tabla: string) => {
    const b: Record<string, unknown> = {}
    const self = () => b
    b.select = self; b.eq = self; b.order = self
    b.single = async () => ({ data: filas[tabla] ?? null, error: null })
    b.maybeSingle = b.single
    b.update = (payload: unknown) => { escrituras.push({ tabla, op: 'update', payload }); return { eq: async () => ({ error: null }) } }
    b.insert = async (payload: unknown) => { escrituras.push({ tabla, op: 'insert', payload }); return { error: null } }
    b.delete = () => { escrituras.push({ tabla, op: 'delete' }); return { eq: async () => ({ error: null }) } }
    return b
  }
  return { cliente: { from: armar } as never, escrituras }
}

const ia = { publicationPrice: 200_000, saleValue: 190_000, moneyInHand: 180_000, currency: 'USD', comparableAnalysis: [], ai: { inputFingerprint: 'h' } } as unknown as AiValuationResult
const clasico = { publicationPrice: 100_000, saleValue: 95_000, moneyInHand: 90_000, currency: 'USD', comparableAnalysis: [] }

describe('guardarValuacionIA', () => {
  it('ready con tasador clásico en uso: guarda el snapshot y NO toca los precios', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await guardarValuacionIA(cliente, 't1', { status: 'ready', result: ia })
    const p = escrituras[0].payload as Record<string, unknown>
    expect(p.ai_valuation_status).toBe('ready')
    expect(p.ai_valuation_error).toBeNull()
    expect((p.ai_valuation_result as { comparableAnalysis: unknown[] }).comparableAnalysis).toEqual([])
    expect(p.publication_price).toBeUndefined()
  })
  it('ready con IA en uso: además reescribe los tres precios', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'ai' } })
    await guardarValuacionIA(cliente, 't1', { status: 'ready', result: ia })
    const p = escrituras[0].payload as Record<string, unknown>
    expect(p.publication_price).toBe(200_000); expect(p.sale_value).toBe(190_000); expect(p.money_in_hand).toBe(180_000)
  })
  it('failed guarda el motivo y no toca el snapshot anterior', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await guardarValuacionIA(cliente, 't1', { status: 'failed', error: 'se cortó' })
    const p = escrituras[0].payload as Record<string, unknown>
    expect(p).toEqual({ ai_valuation_status: 'failed', ai_valuation_error: 'se cortó' })
  })
  it('pending limpia el error', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await guardarValuacionIA(cliente, 't1', { status: 'pending' })
    expect(escrituras[0].payload).toEqual({ ai_valuation_status: 'pending', ai_valuation_error: null })
  })
})

describe('elegirTasador', () => {
  it('elegir IA: escribe la fuente, los precios de la IA y borra priceOverrides conservando el resto', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: {
      valuation_result: clasico, ai_valuation_result: ia, ai_valuation_status: 'ready',
      report_edits: { semaphoreOverrides: {}, coverTitle: 'x', priceOverrides: { noSaleZonePrice: 1 } },
    } })
    const r = await elegirTasador(cliente, 't1', 'ai')
    expect(r.teniaPreciosEditados).toBe(true)
    const p = escrituras[0].payload as Record<string, unknown>
    expect(p.valuation_source).toBe('ai')
    expect(p.publication_price).toBe(200_000)
    expect(p.report_edits).toEqual({ semaphoreOverrides: {}, coverTitle: 'x' })
  })
  it('elegir clásico vuelve a los precios clásicos; sin overrides no reporta nada', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_result: clasico, ai_valuation_result: ia, ai_valuation_status: 'ready', report_edits: { semaphoreOverrides: {} } } })
    const r = await elegirTasador(cliente, 't1', 'calculator')
    expect(r.teniaPreciosEditados).toBe(false)
    const p = escrituras[0].payload as Record<string, unknown>
    expect(p.valuation_source).toBe('calculator'); expect(p.publication_price).toBe(100_000)
    expect(p.report_edits).toEqual({ semaphoreOverrides: {} })
  })
  it('elegir IA sin resultado listo falla y NO escribe', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_result: clasico, ai_valuation_result: null, ai_valuation_status: 'failed', report_edits: null } })
    await expect(elegirTasador(cliente, 't1', 'ai')).rejects.toThrow(/no está lista/)
    expect(escrituras).toHaveLength(0)
  })
  it('report_edits null se deja null', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_result: clasico, ai_valuation_result: ia, ai_valuation_status: 'ready', report_edits: null } })
    await elegirTasador(cliente, 't1', 'ai')
    expect((escrituras[0].payload as Record<string, unknown>).report_edits).toBeNull()
  })
})

describe('replaceAppraisalComparables respeta al tasador en uso', () => {
  const input = { subject: { title: 's', location: 'l', features: {}, images: [], url: '', price: null, currency: null, description: '', portal: '' }, comparables: [], valuationResult: clasico } as unknown as SaveAppraisalInput
  it('con IA en uso NO reescribe los precios desnormalizados', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'ai' } })
    await replaceAppraisalComparables(cliente, 't1', input)
    const p = escrituras.find(e => e.op === 'update')!.payload as Record<string, unknown>
    expect(p.valuation_result).toBeDefined()
    expect(p.publication_price).toBeUndefined(); expect(p.sale_value).toBeUndefined(); expect(p.money_in_hand).toBeUndefined()
  })
  it('con clásico en uso los reescribe como siempre', async () => {
    const { cliente, escrituras } = clienteFalso({ appraisals: { valuation_source: 'calculator' } })
    await replaceAppraisalComparables(cliente, 't1', input)
    const p = escrituras.find(e => e.op === 'update')!.payload as Record<string, unknown>
    expect(p.publication_price).toBe(100_000)
  })
})
```

- [ ] **Step 2: Correr → FAIL** (funciones inexistentes; el de `replaceAppraisalComparables` falla porque hoy siempre escribe precios).

- [ ] **Step 3: Implementar en `appraisals-write.ts`**

Arriba, imports nuevos:
```ts
import type { AiValuationResult, ValuationSource } from '@/lib/valuation/ia-tipos'
import { preciosDesnormalizados } from '@/lib/valuation/valuacion-activa'
import type { ReportEdits } from '@/lib/types/report-edits'
```
Helper privado:
```ts
async function tasadorEnUso(supabase: SupabaseClient, id: string): Promise<ValuationSource> {
    const { data, error } = await supabase.from('appraisals').select('valuation_source').eq('id', id).single()
    if (error) throw error
    return ((data as { valuation_source?: string } | null)?.valuation_source === 'ai') ? 'ai' : 'calculator'
}
```
En `replaceAppraisalComparables`, reemplazar las tres líneas `publication_price / sale_value / money_in_hand` del `updatePayload` por nada, y después de armar `updatePayload` agregar:
```ts
    // Los precios desnormalizados siguen al tasador EN USO. Si la IA está
    // elegida, un guardado del camino clásico (autosave del wizard, edición en
    // línea de la versión clásica) no debe pisar el precio que ve el listado.
    if ((await tasadorEnUso(supabase, id)) === 'calculator') {
        Object.assign(updatePayload, preciosDesnormalizados(leanValuation))
    }
```
(`preciosDesnormalizados` incluye `currency`; dejar también la línea `currency: leanValuation.currency` existente, es el mismo valor.)

Funciones nuevas al final del archivo:
```ts
/** Guarda el estado/resultado del Tasador IA. Si la IA está en uso y el resultado está listo, los precios desnormalizados la siguen. */
export async function guardarValuacionIA(
    supabase: SupabaseClient, id: string,
    patch: { status: 'pending' } | { status: 'ready'; result: AiValuationResult } | { status: 'failed'; error: string },
): Promise<void> {
    const payload: Record<string, unknown> = { ai_valuation_status: patch.status, ai_valuation_error: null }
    if (patch.status === 'failed') payload.ai_valuation_error = patch.error
    if (patch.status === 'ready') {
        const lean = sanitizeValuationResultForStorage(patch.result) as AiValuationResult
        payload.ai_valuation_result = lean
        if ((await tasadorEnUso(supabase, id)) === 'ai') Object.assign(payload, preciosDesnormalizados(lean))
    }
    const { error } = await supabase.from('appraisals').update(payload as never).eq('id', id)
    if (error) throw error
}

/**
 * Elige el tasador en uso. Reescribe los tres precios desnormalizados desde el
 * elegido y BORRA `report_edits.priceOverrides`: fueron editados contra los
 * números del otro tasador y quedarían mintiendo en el PDF.
 */
export async function elegirTasador(supabase: SupabaseClient, id: string, source: ValuationSource): Promise<{ teniaPreciosEditados: boolean }> {
    const { data, error } = await supabase.from('appraisals')
        .select('valuation_result, ai_valuation_result, ai_valuation_status, report_edits').eq('id', id).single()
    if (error) throw error
    const fila = data as unknown as { valuation_result: ValuationResult; ai_valuation_result: AiValuationResult | null; ai_valuation_status: string | null; report_edits: ReportEdits | null }
    if (source === 'ai' && (fila.ai_valuation_status !== 'ready' || !fila.ai_valuation_result)) {
        throw new Error('La valuación IA no está lista')
    }
    const elegido = source === 'ai' ? fila.ai_valuation_result! : fila.valuation_result
    const teniaPreciosEditados = Boolean(fila.report_edits?.priceOverrides && Object.keys(fila.report_edits.priceOverrides).length > 0)
    let report_edits: ReportEdits | null = fila.report_edits
    if (report_edits) {
        const { priceOverrides: _descartados, ...resto } = report_edits
        report_edits = resto
    }
    const { error: e2 } = await supabase.from('appraisals')
        .update({ valuation_source: source, ...preciosDesnormalizados(elegido), report_edits } as never).eq('id', id)
    if (e2) throw e2
    return { teniaPreciosEditados }
}
```
Importar `ValuationResult` de `@/lib/valuation/calculator` si no está. Verificar que `sanitizeValuationResultForStorage` ya se importa (sí, línea ~10).

- [ ] **Step 4: Correr → PASS.** Si el test de `replaceAppraisalComparables` falla porque `insertAllComparableRows` usa algo que el cliente falso no tiene (`.insert` devuelve `{error}` — ya cubierto), ampliar el falso, no el módulo.

- [ ] **Step 5: Cliente (`lib/supabase/appraisals.ts`)**

En `AppraisalDetail` agregar (import `type { AiValuationResult, AiValuationStatus, ValuationSource, ColumnasTasadorIA } from '@/lib/valuation/ia-tipos'`):
```ts
    ai_valuation_result: AiValuationResult | null
    ai_valuation_status: AiValuationStatus | null
    ai_valuation_error: string | null
    valuation_source: ValuationSource
```
En `getAppraisal`, en el `return` agregar explícitamente (el spread ya las trae, pero así el tipo no depende del cast):
```ts
        ai_valuation_result: (row.ai_valuation_result as AiValuationResult | null | undefined) ?? null,
        ai_valuation_status: (row.ai_valuation_status as AiValuationStatus | null | undefined) ?? null,
        ai_valuation_error: (row.ai_valuation_error as string | null | undefined) ?? null,
        valuation_source: row.valuation_source === 'ai' ? 'ai' : 'calculator',
```
Funciones nuevas al final:
```ts
/** Lee la respuesta aunque no sea JSON (Netlify devuelve HTML en un 504). */
async function leerJson<T>(res: Response): Promise<T & { error?: string }> {
    const text = await res.text()
    try { return JSON.parse(text) as T & { error?: string } }
    catch {
        if (res.status === 504 || res.status === 502 || res.status === 408) return { error: 'El servidor tardó demasiado y cortó la operación. Volvé a intentar.' } as never
        return { error: `El servidor respondió algo inesperado (${res.status}). Volvé a intentar.` } as never
    }
}

/** Dispara el Tasador IA (una llamada al modelo, en el servidor). Devuelve las columnas IA actualizadas. */
export async function generarValuacionIA(id: string): Promise<ColumnasTasadorIA & { updated_at: string }> {
    const res = await fetch(`/api/appraisals/${id}/ai-valuation`, { method: 'POST' })
    const data = await leerJson<{ data?: ColumnasTasadorIA & { updated_at: string } }>(res)
    if (!res.ok || !data.data) throw new Error(data.error || 'No se pudo generar la valuación IA')
    return data.data
}

export async function elegirTasadorDeTasacion(id: string, source: ValuationSource): Promise<{ teniaPreciosEditados: boolean }> {
    const res = await fetch(`/api/appraisals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valuationSource: source }) })
    const data = await leerJson<{ teniaPreciosEditados?: boolean }>(res)
    if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el tasador')
    return { teniaPreciosEditados: Boolean(data.teniaPreciosEditados) }
}

/** Persiste una edición en línea del snapshot IA (no toca comparables ni el resultado clásico). */
export async function guardarSnapshotIA(id: string, result: AiValuationResult): Promise<void> {
    const res = await fetch(`/api/appraisals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiValuationResult: sanitizeValuationResultForStorage(result) }) })
    if (!res.ok) { const data = await leerJson<Record<string, unknown>>(res); throw buildApiError(data, 'No se pudo guardar la versión IA') }
}
```

- [ ] **Step 6: tsc.** **Step 7: Commit** (`feat(tasaciones): persistencia del Tasador IA — snapshot, elección y precios que siguen al elegido`).

---

### Task 8: Rutas — `POST …/ai-valuation` y `PATCH` extendido

**Files:**
- Create: `app/api/appraisals/[id]/ai-valuation/route.ts`
- Test: `app/api/appraisals/[id]/ai-valuation/route.test.ts`
- Modify: `app/api/appraisals/[id]/route.ts:109-135` (PATCH)
- Modify: `app/api/appraisals/[id]/route.test.ts` (agregar 3 casos al PATCH)

**Interfaces:**
- `POST /api/appraisals/[id]/ai-valuation` → `200 { data: ColumnasTasadorIA & { updated_at } }` | `403` | `404` | `422 { error }` (modelo falló: la fila queda `failed`) | `503 { error: 'Tasador IA no configurado' }`.
- `PATCH /api/appraisals/[id]` body `{ reportEdits }` (como hoy) | `{ valuationSource: 'calculator'|'ai' }` → `{ success, teniaPreciosEditados }` | `{ aiValuationResult }` → `{ success }`.

- [ ] **Step 1: Test de la ruta nueva (falla)**

```ts
// app/api/appraisals/[id]/ai-valuation/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { registro } = vi.hoisted(() => ({
  registro: { rol: 'admin' as string, filas: {} as Record<string, unknown>, escrituras: [] as unknown[], correr: vi.fn(), configurado: true },
}))

vi.mock('@supabase/supabase-js', () => {
  const armar = (tabla: string) => {
    const b: Record<string, unknown> = {}
    const self = () => b
    b.select = self; b.eq = self; b.order = self; b.lt = self
    b.single = async () => ({ data: registro.filas[tabla] ?? null, error: registro.filas[tabla] ? null : { code: 'PGRST116' } })
    b.maybeSingle = b.single
    b.update = (p: unknown) => { registro.escrituras.push(p); return { eq: async () => ({ error: null }) } }
    ;(b as { then?: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: registro.filas[`${tabla}:lista`] ?? [], error: null }).then(ok)
    return b
  }
  return { createClient: () => ({ from: armar }) }
})
vi.mock('@/lib/auth/require-role', () => ({ requireAuth: vi.fn(async () => ({ id: 'yo', email: 'yo@local', profile: { id: 'yo', role: registro.rol } })) }))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessAppraisal: vi.fn(async () => true) }))
vi.mock('@/lib/ai/chat-client', () => ({ chatCompletion: vi.fn(), hasAiConfigured: () => registro.configurado }))
vi.mock('@/lib/valuation/tasador-ia', async (orig) => ({ ...(await orig<typeof import('@/lib/valuation/tasador-ia')>()), correrTasadorIA: (...a: unknown[]) => registro.correr(...a) }))

import { POST } from './route'

const params = Promise.resolve({ id: 't1' })
const pedido = () => new Request('http://local/api/appraisals/t1/ai-valuation', { method: 'POST' }) as never
const comparable = (i: number) => ({ title: `c${i}`, location: null, url: null, price: 100_000 + i, currency: 'USD', description: null, images: null, features: { coveredArea: 50 }, analysis: null, sort_order: i })

beforeEach(() => {
  registro.rol = 'admin'; registro.escrituras.length = 0; registro.configurado = true
  registro.filas = {
    appraisals: { id: 't1', property_title: 's', property_location: 'l', property_features: { coveredArea: 60 }, valuation_result: { expenseRates: { saleDiscountPercent: 5 }, ownerSharePercent: 100, purchaseScenarios: [], selectedScenarioIds: [] }, valuation_source: 'calculator', updated_at: 'u' },
    'appraisal_comparables:lista': [comparable(0), comparable(1), comparable(2), { ...comparable(3), analysis: { propertyType: 'overpriced' }, sort_order: 1000 }],
  }
  registro.correr.mockResolvedValue({ publicationPrice: 1, saleValue: 1, moneyInHand: 1, currency: 'USD', comparableAnalysis: [], ai: { inputFingerprint: 'h', comparables: [] } })
})

describe('POST /api/appraisals/[id]/ai-valuation', () => {
  it('el abogado no puede', async () => {
    registro.rol = 'abogado'
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(403); expect(registro.escrituras).toHaveLength(0)
  })
  it('sin IA configurada responde 503 sin escribir', async () => {
    registro.configurado = false
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(503); expect(registro.escrituras).toHaveLength(0)
  })
  it('marca pending, corre el tasador SOLO con los comparables normales y guarda ready', async () => {
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(200)
    const entrada = registro.correr.mock.calls[0][0] as { comparables: unknown[]; ownerSharePercent: number }
    expect(entrada.comparables).toHaveLength(3)
    expect(entrada.ownerSharePercent).toBe(100)
    expect((registro.escrituras[0] as { ai_valuation_status: string }).ai_valuation_status).toBe('pending')
    expect((registro.escrituras[1] as { ai_valuation_status: string }).ai_valuation_status).toBe('ready')
  })
  it('si el modelo falla, guarda failed con el motivo y responde 422', async () => {
    registro.correr.mockRejectedValue(new Error('Tasador IA: el modelo no devolvió JSON'))
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(422)
    const ultimo = registro.escrituras.at(-1) as { ai_valuation_status: string; ai_valuation_error: string }
    expect(ultimo.ai_valuation_status).toBe('failed'); expect(ultimo.ai_valuation_error).toMatch(/JSON/)
  })
  it('tasación inexistente → 404', async () => {
    registro.filas = {}
    const res = await POST(pedido(), { params })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Correr → FAIL.**

- [ ] **Step 3: Implementar la ruta**

```ts
// app/api/appraisals/[id]/ai-valuation/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessAppraisal } from '@/lib/auth/entity-access'
import { puedeEditarTasacion } from '@/lib/auth/appraisal-access'
import { chatCompletion, hasAiConfigured } from '@/lib/ai/chat-client'
import { correrTasadorIA, type ChatTasador } from '@/lib/valuation/tasador-ia'
import { comparablesNormales, filaAPropiedad, type FilaComparable } from '@/lib/valuation/valuacion-activa'
import { guardarValuacionIA } from '@/lib/supabase/appraisals-write'
import type { ValuationProperty, ValuationResult } from '@/lib/valuation/calculator'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

interface FilaTasacion {
  id: string; property_title: string | null; property_location: string; property_description: string | null
  property_url: string | null; property_price: number | null; property_currency: string | null
  property_images: string[] | null; property_features: ValuationProperty['features'] | null
  valuation_result: ValuationResult | null
}

/**
 * Genera (o regenera) la valuación del Tasador IA. UNA llamada al modelo por
 * request (regla dura de CLAUDE.md); `timeoutMs` vive en `correrTasadorIA`.
 * Idempotente: llamar de nuevo = "Regenerar".
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  try {
    const { id } = await params
    if (!puedeEditarTasacion(user.profile.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!(await canAccessAppraisal(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    if (!hasAiConfigured()) return NextResponse.json({ error: 'Tasador IA no configurado (falta la clave del proveedor de IA)' }, { status: 503 })

    const supabase = getAdmin()
    const [tasacionRes, comparablesRes] = await Promise.all([
      supabase.from('appraisals').select('id, property_title, property_location, property_description, property_url, property_price, property_currency, property_images, property_features, valuation_result').eq('id', id).single(),
      supabase.from('appraisal_comparables').select('*').eq('appraisal_id', id).order('sort_order'),
    ])
    if (tasacionRes.error || !tasacionRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const fila = tasacionRes.data as unknown as FilaTasacion
    const filas = (comparablesRes.data ?? []) as unknown as FilaComparable[]
    const clasico = fila.valuation_result

    const subject: ValuationProperty = {
      title: fila.property_title ?? '', location: fila.property_location, description: fila.property_description ?? '',
      url: fila.property_url ?? '', price: fila.property_price, currency: fila.property_currency,
      images: fila.property_images ?? [], features: fila.property_features ?? {},
    }
    const comparables = comparablesNormales(filas).map(r => filaAPropiedad(r))

    await guardarValuacionIA(supabase, id, { status: 'pending' })
    try {
      const chat: ChatTasador = (i) => chatCompletion(i)
      const resultado = await correrTasadorIA({
        subject, comparables,
        expenseRates: clasico?.expenseRates,
        ownerSharePercent: clasico?.ownerSharePercent ?? 100,
        purchaseScenarios: clasico?.purchaseScenarios ?? [],
        selectedScenarioIds: clasico?.selectedScenarioIds ?? [],
        previousPurchaseResult: clasico?.purchaseResult,
      }, { chat })
      await guardarValuacionIA(supabase, id, { status: 'ready', result: resultado })
    } catch (e) {
      const motivo = e instanceof Error ? e.message : 'Error desconocido del Tasador IA'
      console.error('[ai-valuation] falló', { id, motivo })
      await guardarValuacionIA(supabase, id, { status: 'failed', error: motivo })
      return NextResponse.json({ error: motivo }, { status: 422 })
    }

    const { data } = await supabase.from('appraisals')
      .select('ai_valuation_result, ai_valuation_status, ai_valuation_error, valuation_source, updated_at').eq('id', id).single()
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
```
Nota: si `AbortSignal.timeout` corta la llamada, el error se llama `TimeoutError` y su mensaje es genérico; en el `catch`, si `e instanceof Error && e.name === 'TimeoutError'`, usar el motivo `'El modelo tardó más de 20 segundos'`.

- [ ] **Step 4: Correr → PASS.** Ajustar el cliente falso si `select(...)` con string largo o `.order` rompe la cadena (el falso devuelve `b` para todo).

- [ ] **Step 5: Extender el PATCH** en `app/api/appraisals/[id]/route.ts`. Reemplazar desde `const body = (await req.json()) as { reportEdits?: unknown }` hasta el `return NextResponse.json({ success: true })` por:

```ts
    const body = (await req.json()) as { reportEdits?: unknown; valuationSource?: unknown; aiValuationResult?: unknown }
    const supabase = getAdmin()

    // Tres usos, UNO por llamada: ajustes del informe (como siempre), elegir
    // tasador, o guardar una edición en línea del snapshot IA.
    if (body?.valuationSource !== undefined) {
      if (body.valuationSource !== 'calculator' && body.valuationSource !== 'ai') {
        return NextResponse.json({ error: 'valuationSource debe ser calculator o ai' }, { status: 400 })
      }
      try {
        const r = await elegirTasador(supabase, id, body.valuationSource)
        return NextResponse.json({ success: true, teniaPreciosEditados: r.teniaPreciosEditados })
      } catch (e) {
        if (e instanceof Error && /no está lista/.test(e.message)) return NextResponse.json({ error: e.message }, { status: 409 })
        throw e
      }
    }
    if (body?.aiValuationResult !== undefined) {
      const r = body.aiValuationResult as { ai?: { inputFingerprint?: unknown }; publicationPrice?: unknown } | null
      if (!r || typeof r !== 'object' || typeof r.publicationPrice !== 'number' || typeof r.ai?.inputFingerprint !== 'string') {
        return NextResponse.json({ error: 'aiValuationResult inválido' }, { status: 400 })
      }
      await guardarValuacionIA(supabase, id, { status: 'ready', result: body.aiValuationResult as AiValuationResult })
      return NextResponse.json({ success: true })
    }
    if (body?.reportEdits === undefined) {
      return NextResponse.json({ error: 'reportEdits es requerido' }, { status: 400 })
    }
    const { error } = await supabase
      .from('appraisals')
      .update({ report_edits: body.reportEdits } as never)
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
```
Imports: `elegirTasador, guardarValuacionIA` de `@/lib/supabase/appraisals-write`; `type { AiValuationResult } from '@/lib/valuation/ia-tipos'`. En `route.test.ts` el mock de `appraisals-write` debe sumar `elegirTasador: vi.fn(async () => ({ teniaPreciosEditados: false })), guardarValuacionIA: vi.fn()`.

- [ ] **Step 6: Tres casos nuevos en `app/api/appraisals/[id]/route.test.ts`** (dentro del bloque del PATCH existente; adaptar nombres al estilo del archivo):

```ts
  it('PATCH con valuationSource llama a elegirTasador y devuelve teniaPreciosEditados', async () => {
    registro.rol = 'admin'
    const res = await PATCH(pedido({ valuationSource: 'ai' }), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, teniaPreciosEditados: false })
  })
  it('PATCH con valuationSource inválido → 400', async () => {
    registro.rol = 'admin'
    expect((await PATCH(pedido({ valuationSource: 'otro' }), { params })).status).toBe(400)
  })
  it('PATCH con aiValuationResult sin huella → 400', async () => {
    registro.rol = 'admin'
    expect((await PATCH(pedido({ aiValuationResult: { publicationPrice: 1 } }), { params })).status).toBe(400)
  })
  it('el abogado tampoco elige tasador', async () => {
    registro.rol = 'abogado'
    expect((await PATCH(pedido({ valuationSource: 'ai' }), { params })).status).toBe(403)
  })
```

- [ ] **Step 7: Correr toda la config acotada → PASS. tsc → OK.**

- [ ] **Step 8: Commit** (`feat(tasaciones): ruta que genera la valuación IA y PATCH para elegir tasador`).

---

### Task 9: Componente `SelectorDeTasador` + probe

**Files:**
- Create: `components/appraisal/SelectorDeTasador.tsx`
- Create: `scripts/selector-de-tasador.probe.tsx`

**Interfaces:**
```ts
export type EstadoIAEnPantalla = EstadoTarjetaIA | 'no_configurado'
export interface SelectorDeTasadorProps {
  clasico: ValuationResult
  ia: AiValuationResult | null
  estadoIA: EstadoIAEnPantalla
  errorIA?: string | null
  elegido: ValuationSource
  ocupado?: boolean               // deshabilita clicks mientras se guarda
  onElegir: (source: ValuationSource) => void
  onGenerar: () => void           // Generar / Regenerar / Reintentar
}
export function SelectorDeTasador(p: SelectorDeTasadorProps): JSX.Element
```

- [ ] **Step 1: Implementar**

```tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, Calculator, RefreshCw, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/valuation/utils'
import type { ValuationResult } from '@/lib/valuation/calculator'
import type { AiValuationResult, ValuationSource } from '@/lib/valuation/ia-tipos'
import type { EstadoTarjetaIA } from '@/lib/valuation/valuacion-activa'
import { cn } from '@/lib/utils'

export type EstadoIAEnPantalla = EstadoTarjetaIA | 'no_configurado'

export interface SelectorDeTasadorProps {
    clasico: ValuationResult
    ia: AiValuationResult | null
    estadoIA: EstadoIAEnPantalla
    errorIA?: string | null
    elegido: ValuationSource
    ocupado?: boolean
    onElegir: (source: ValuationSource) => void
    onGenerar: () => void
}

function Numeros({ r }: { r: ValuationResult }) {
    const fila = (label: string, v: string) => (
        <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums">{v}</span>
        </div>
    )
    return (
        <div className="space-y-1.5">
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(r.publicationPrice, r.currency)}</div>
            <div className="text-xs text-muted-foreground -mt-1">Precio de publicación</div>
            {fila('Valor de venta', formatCurrency(r.saleValue, r.currency))}
            {fila('Dinero en mano', formatCurrency(r.moneyInHand, r.currency))}
            {fila('Precio por m²', formatCurrency(r.subjectPriceM2, r.currency))}
        </div>
    )
}

function diferencia(ia: number, clasico: number): string {
    if (!clasico) return '—'
    const pct = ((ia - clasico) / clasico) * 100
    const signo = pct > 0 ? '+' : ''
    return `${signo}${pct.toFixed(1)}% vs. clásico`
}

const CONFIANZA: Record<string, string> = { alta: 'Confianza alta', media: 'Confianza media', baja: 'Confianza baja' }

/**
 * Dos tarjetas: Tasador clásico y Tasador IA. La elegida lleva borde de marca y
 * "En uso". La IA solo se puede elegir cuando está lista (o desactualizada: los
 * números siguen siendo válidos para ese conjunto de datos).
 */
export function SelectorDeTasador({ clasico, ia, estadoIA, errorIA, elegido, ocupado, onElegir, onGenerar }: SelectorDeTasadorProps) {
    const iaElegible = ia != null && (estadoIA === 'lista' || estadoIA === 'desactualizada')
    const tarjeta = (activa: boolean, clickable: boolean) => cn(
        'relative transition-shadow',
        clickable && !ocupado && 'cursor-pointer hover:shadow-md',
        activa ? 'border-brand ring-2 ring-brand/30' : 'border-border',
    )
    const enUso = <Badge className="absolute right-3 top-3 bg-brand text-white">En uso</Badge>

    return (
        <section aria-label="Elegir tasador" className="grid gap-4 md:grid-cols-2">
            <Card
                role="button" tabIndex={0} aria-pressed={elegido === 'calculator'}
                className={tarjeta(elegido === 'calculator', true)}
                onClick={() => !ocupado && elegido !== 'calculator' && onElegir('calculator')}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!ocupado) onElegir('calculator') } }}
            >
                {elegido === 'calculator' && enUso}
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Calculator className="h-4 w-4" /> Tasador clásico</CardTitle>
                    <p className="text-xs text-muted-foreground">Coeficientes cargados por el asesor</p>
                </CardHeader>
                <CardContent><Numeros r={clasico} /></CardContent>
            </Card>

            <Card
                role="button" tabIndex={0} aria-pressed={elegido === 'ai'} aria-disabled={!iaElegible}
                className={tarjeta(elegido === 'ai', iaElegible)}
                onClick={() => !ocupado && iaElegible && elegido !== 'ai' && onElegir('ai')}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && iaElegible && !ocupado) { e.preventDefault(); onElegir('ai') } }}
            >
                {elegido === 'ai' && enUso}
                <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Tasador IA</CardTitle>
                    <p className="text-xs text-muted-foreground">Mismo método, interpretado por inteligencia artificial</p>
                </CardHeader>
                <CardContent className="space-y-3">
                    {estadoIA === 'analizando' && (
                        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Analizando comparables…</div>
                    )}
                    {estadoIA === 'no_configurado' && (
                        <p className="py-6 text-sm text-muted-foreground">Tasador IA no configurado.</p>
                    )}
                    {estadoIA === 'sin_generar' && (
                        <div className="py-4 space-y-3">
                            <p className="text-sm text-muted-foreground">Esta tasación todavía no tiene una segunda opinión.</p>
                            <Button size="sm" onClick={e => { e.stopPropagation(); onGenerar() }} disabled={ocupado}><Sparkles className="h-4 w-4 mr-1" /> Generar</Button>
                        </div>
                    )}
                    {estadoIA === 'fallida' && (
                        <div className="py-4 space-y-3">
                            <p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {errorIA || 'No se pudo generar la valuación IA.'}</p>
                            <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onGenerar() }} disabled={ocupado}><RefreshCw className="h-4 w-4 mr-1" /> Reintentar</Button>
                        </div>
                    )}
                    {ia && (estadoIA === 'lista' || estadoIA === 'desactualizada') && (
                        <>
                            {estadoIA === 'desactualizada' && (
                                <div className="flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    <span>Desactualizada: cambiaron los datos</span>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={e => { e.stopPropagation(); onGenerar() }} disabled={ocupado}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerar</Button>
                                </div>
                            )}
                            <Numeros r={ia} />
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                <Badge variant="secondary">{CONFIANZA[ia.ai.confidence] ?? ia.ai.confidence}</Badge>
                                <span className="text-muted-foreground">{diferencia(ia.publicationPrice, clasico.publicationPrice)}</span>
                                <span className="text-muted-foreground">· {ia.ai.model}</span>
                            </div>
                            <details className="text-xs text-muted-foreground">
                                <summary className="cursor-pointer select-none">Cómo lo interpretó</summary>
                                <p className="mt-1 whitespace-pre-line">{ia.ai.summary}</p>
                            </details>
                            {estadoIA === 'lista' && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={e => { e.stopPropagation(); onGenerar() }} disabled={ocupado}><RefreshCw className="h-3.5 w-3.5 mr-1" /> Regenerar</Button>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}
```
Verificar que existe la clase `bg-brand`/`border-brand` (grep `--brand` en `app/globals.css`; el CLAUDE.md la menciona en el sidebar). Si no, usar `bg-primary`/`border-primary`.

- [ ] **Step 2: Probe con `renderToStaticMarkup`**

```tsx
// scripts/selector-de-tasador.probe.tsx
// Correr: node --import tsx scripts/selector-de-tasador.probe.tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { SelectorDeTasador } from '@/components/appraisal/SelectorDeTasador'
import type { ValuationResult } from '@/lib/valuation/calculator'
import type { AiValuationResult } from '@/lib/valuation/ia-tipos'

const clasico = { publicationPrice: 100_000, saleValue: 95_000, moneyInHand: 90_000, subjectPriceM2: 2_000, currency: 'USD' } as ValuationResult
const ia = { ...clasico, publicationPrice: 110_000, ai: { confidence: 'media', summary: 'Zona homogénea.', model: 'gpt-4o-mini' } } as unknown as AiValuationResult
const casos = [
  ['sin_generar', null, 'calculator', 'Generar'],
  ['analizando', null, 'calculator', 'Analizando comparables'],
  ['fallida', null, 'calculator', 'Reintentar'],
  ['lista', ia, 'ai', '+10.0% vs. clásico'],
  ['desactualizada', ia, 'calculator', 'Desactualizada: cambiaron los datos'],
  ['no_configurado', null, 'calculator', 'no configurado'],
] as const
let fallas = 0
for (const [estado, snapshot, elegido, esperado] of casos) {
  const html = renderToStaticMarkup(<SelectorDeTasador clasico={clasico} ia={snapshot} estadoIA={estado} elegido={elegido} onElegir={() => {}} onGenerar={() => {}} errorIA="se cortó" />)
  const ok = html.includes(esperado) && html.includes('Tasador clásico') && html.includes('Tasador IA') && html.includes('En uso')
  console.log(`${ok ? '✓' : '✗'} ${estado}: ${esperado}`)
  if (!ok) fallas++
}
if (fallas) { console.error(`${fallas} casos fallaron`); process.exit(1) }
```
Si `tsx` no resuelve `@/`, correr con `node --import tsx --import ./scripts/_alias.mjs …` si existe ese helper en el repo (`ls scripts | grep alias`); si no, cambiar los imports del probe a rutas relativas.

- [ ] **Step 3: Correr el probe → 6 ✓.** **Step 4: tsc.** **Step 5: Commit** (`feat(tasaciones): tarjetas para elegir entre Tasador clásico y Tasador IA`).

---

### Task 10: Integración en el detalle (`app/(dashboard)/appraisals/[id]/page.tsx`)

**Files:**
- Modify: `app/(dashboard)/appraisals/[id]/page.tsx`

**Interfaces:** consume `valuacionActiva`, `estadoTarjetaIA`, `huellaDeInsumos`, `recalcularSnapshotIA`, `generarValuacionIA`, `elegirTasadorDeTasacion`, `guardarSnapshotIA`, `SelectorDeTasador`, `hasAiConfigured` NO (es server-only: el estado `no_configurado` llega por el 503 de la ruta).

- [ ] **Step 1: Estado nuevo** (junto a los `useState` existentes):
```ts
    const [estadoIA, setEstadoIA] = useState<EstadoIAEnPantalla | null>(null)   // null = derivar de la fila
    const [ocupadoIA, setOcupadoIA] = useState(false)
    const [avisoTasador, setAvisoTasador] = useState<string | null>(null)
```
Imports: `SelectorDeTasador, type EstadoIAEnPantalla` de `@/components/appraisal/SelectorDeTasador`; `valuacionActiva, estadoTarjetaIA, comparablesNormales, filaAPropiedad` de `@/lib/valuation/valuacion-activa`; `huellaDeInsumos` de `@/lib/valuation/huella-insumos`; `recalcularSnapshotIA` de `@/lib/valuation/editar-snapshot-ia`; `generarValuacionIA, elegirTasadorDeTasacion, guardarSnapshotIA` de `@/lib/supabase/appraisals`; `type { ValuationSource, AiValuationResult } from '@/lib/valuation/ia-tipos'`.

- [ ] **Step 2: Derivar la valuación activa** — reemplazar la línea `const result: ValuationResult = valuationOverride ?? (appraisal.valuation_result || {} as ValuationResult)` por:
```ts
    const activa = valuacionActiva(appraisal, appraisal.comparables)
    const tasadorElegido: ValuationSource = activa.source
    const result: ValuationResult = valuationOverride ?? activa.result
    const huellaActual = huellaDeInsumos({
        subject: { price: appraisal.property_price, currency: appraisal.property_currency, location: appraisal.property_location, description: appraisal.property_description ?? '', features: (appraisal.property_features ?? {}) as ValuationProperty['features'] },
        comparables: comparablesNormales(appraisal.comparables).map(r => filaAPropiedad(r)),
        expenseRates: appraisal.valuation_result?.expenseRates,
        ownerSharePercent: appraisal.valuation_result?.ownerSharePercent ?? 100,
    })
    const estadoIAEfectivo: EstadoIAEnPantalla = estadoIA ?? estadoTarjetaIA(appraisal, huellaActual)
```
(`appraisal.comparables` es `ComparableRow[]`; su `features: any` y `analysis: any` encajan con `FilaComparable` — si tsc se queja, castear `appraisal.comparables as FilaComparable[]` con un comentario del porqué.)

- [ ] **Step 3: Handlers del picker**
```ts
    async function handleGenerarIA() {
        if (!appraisal) return
        setEstadoIA('analizando'); setOcupadoIA(true)
        try {
            const cols = await generarValuacionIA(appraisal.id)
            setAppraisal(prev => prev ? { ...prev, ...cols } : prev)
            setEstadoIA(null)
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'No se pudo generar'
            if (/no configurado/i.test(msg)) setEstadoIA('no_configurado')
            else { setEstadoIA('fallida'); setAppraisal(prev => prev ? { ...prev, ai_valuation_status: 'failed', ai_valuation_error: msg } : prev) }
        } finally { setOcupadoIA(false) }
    }

    async function handleElegirTasador(source: ValuationSource) {
        if (!appraisal || source === tasadorElegido) return
        setOcupadoIA(true); setAvisoTasador(null)
        try {
            const { teniaPreciosEditados } = await elegirTasadorDeTasacion(appraisal.id, source)
            setValuationOverride(null)
            setSubjectFeaturesOverride(null)
            if (teniaPreciosEditados) {
                setReportEdits(prev => prev ? { ...prev, priceOverrides: undefined } : prev)
                setAvisoTasador('Se descartaron los precios editados a mano del PDF: eran de la otra versión.')
            }
            await loadAppraisal()
        } catch (err) {
            setAvisoTasador(err instanceof Error ? err.message : 'No se pudo cambiar el tasador')
        } finally { setOcupadoIA(false) }
    }
```
`loadAppraisal` hoy setea `loading`? Revisar: si pone `setLoading(true)` la pantalla parpadea al skeleton; en ese caso agregar un parámetro `loadAppraisal(silencioso = true)` que no toque `loading`.

- [ ] **Step 4: Ramificar los tres handlers de edición por tasador.** Al inicio de `handleSubjectFeaturesChange`, `handleComparableFeaturesChange` y `handleExpenseRatesChange`, después del guard `if (!appraisal) return`, agregar:
```ts
        if (tasadorElegido === 'ai' && appraisal.ai_valuation_result) {
            await editarSnapshotIA({ tipo: 'subject', features: features as unknown as ValuationProperty['features'] })   // subject
            // comparable: { tipo: 'comparable', index, features: newFeatures as ValuationProperty['features'] }
            // gastos:     { tipo: 'gastos', expenseRates: next }
            return
        }
```
y la función común:
```ts
    async function editarSnapshotIA(cambio: CambioSnapshotIA) {
        if (!appraisal?.ai_valuation_result || !subject) return
        setSavingFeatures(true)
        try {
            const nuevo = recalcularSnapshotIA(appraisal.ai_valuation_result, subject, activa.comparables, cambio)
            if (!nuevo) return
            setValuationOverride(rehidratar(nuevo, comparablesDelSnapshotIA(appraisal.comparables, nuevo.ai)))
            await guardarSnapshotIA(appraisal.id, nuevo)
            setAppraisal(prev => prev ? { ...prev, ai_valuation_result: nuevo } : prev)
        } catch (err) { console.error('editarSnapshotIA error:', err) }
        finally { setSavingFeatures(false) }
    }
```
(import `rehidratar, comparablesDelSnapshotIA` y `type CambioSnapshotIA`). Para el subject en modo IA, el `subject` que se pasa lleva `features` del snapshot: construir `{ ...subject, features: appraisal.ai_valuation_result.ai.subject.features }` — y `effectiveFeatures` para la UI del subject en modo IA debe salir del snapshot: cambiar la línea de `effectiveFeatures` a `subjectFeaturesOverride ?? (tasadorElegido === 'ai' ? appraisal?.ai_valuation_result?.ai.subject.features : appraisal?.property_features) ?? null` (mover la derivación de `tasadorElegido` arriba de los `useMemo`, con `appraisal` posiblemente null → `appraisal ? valuacionActiva(...) : null`).

- [ ] **Step 5: Render.** Arriba del bloque `{/* Report */}` (después del banner de drift), agregar:
```tsx
            {hasFullValuation && (
                <SelectorDeTasador
                    clasico={rehidratar(appraisal.valuation_result, comparablesNormales(appraisal.comparables).map(r => filaAPropiedad(r)))}
                    ia={appraisal.ai_valuation_result}
                    estadoIA={estadoIAEfectivo}
                    errorIA={appraisal.ai_valuation_error}
                    elegido={tasadorElegido}
                    ocupado={ocupadoIA}
                    onElegir={handleElegirTasador}
                    onGenerar={handleGenerarIA}
                />
            )}
            {avisoTasador && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{avisoTasador}</div>
            )}
```
`ValuationReport` y `PDFPreviewModal` ya reciben `result` → nada más que tocar, salvo `expenseRates={(valuationOverride?.expenseRates ?? result.expenseRates) || undefined}` y `comparables={activa.comparables}` en el modal (para que el PDF lea las features de la versión activa).

- [ ] **Step 6: Quitar el import muerto** `PDFDownloadButton` (línea 10) — eslint lo marca.

- [ ] **Step 7: tsc + eslint** — `npx tsc --noEmit -p tsconfig.tasador-ia.json && npx eslint "app/(dashboard)/appraisals/[id]/page.tsx"`.

- [ ] **Step 8: Commit** (`feat(tasaciones): el detalle muestra las dos tarjetas, permite elegir y editar la versión en uso`).

---

### Task 11: Integración en el wizard (`app/(dashboard)/appraisal/new/page.tsx`)

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx`

- [ ] **Step 1: Estado nuevo**
```ts
    const [snapshotIA, setSnapshotIA] = useState<AiValuationResult | null>(null)
    const [estadoIA, setEstadoIA] = useState<EstadoIAEnPantalla>('sin_generar')
    const [errorIA, setErrorIA] = useState<string | null>(null)
    const [tasadorElegido, setTasadorElegido] = useState<ValuationSource>('calculator')
    const [ocupadoIA, setOcupadoIA] = useState(false)
    const [avisoTasador, setAvisoTasador] = useState<string | null>(null)
```

- [ ] **Step 2: Hidratar en modo edición** (dentro del `.then(detail => …)`, después de `setValuationResult(detail.valuation_result)`):
```ts
                setSnapshotIA(detail.ai_valuation_result)
                setTasadorElegido(detail.valuation_source)
                setEstadoIA(estadoTarjetaIA(detail, huellaDelWizard(reconstructedSubject, normalComps, detail.valuation_result?.expenseRates, detail.valuation_result?.ownerSharePercent ?? 100)))
                setErrorIA(detail.ai_valuation_error)
```
con el helper (fuera del componente):
```ts
function huellaDelWizard(subject: ScrapedProperty, comparables: ScrapedProperty[], expenseRates: ExpenseRates | undefined, ownerSharePercent: number): string {
    const a = (p: ScrapedProperty) => ({ price: p.price, currency: p.currency, location: p.location, description: p.description, features: p.features })
    return huellaDeInsumos({ subject: a(subject), comparables: comparables.map(a), expenseRates, ownerSharePercent })
}
```

- [ ] **Step 3: Disparar la IA después de guardar.** En el `.then(async (appraisalId) => {` del guardado de `handleCalculate`, justo después de `setSaveStatus('saved')`:
```ts
                    void generarIA(appraisalId)
```
y la función:
```ts
    async function generarIA(appraisalId: string) {
        setEstadoIA('analizando'); setErrorIA(null); setOcupadoIA(true)
        try {
            const cols = await generarValuacionIA(appraisalId)
            setSnapshotIA(cols.ai_valuation_result)
            setErrorIA(cols.ai_valuation_error)
            setEstadoIA(cols.ai_valuation_status === 'ready' ? 'lista' : 'fallida')
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'No se pudo generar'
            setErrorIA(msg)
            setEstadoIA(/no configurado/i.test(msg) ? 'no_configurado' : 'fallida')
        } finally { setOcupadoIA(false) }
    }
```
Regenerar desde la tarjeta: `onGenerar={() => { const id = editId || savedAppraisalIdRef.current; if (id) void generarIA(id) }}`.

- [ ] **Step 4: Marcar "desactualizada" cuando cambian los insumos.** En el efecto de recálculo, después de `setValuationResult(merged)`:
```ts
        if (snapshotIA && subject) {
            const huella = huellaDelWizard(subject, comparables, expenseRates, ownerSharePercent)
            setEstadoIA(prev => prev === 'lista' && huella !== snapshotIA.ai.inputFingerprint ? 'desactualizada'
                : prev === 'desactualizada' && huella === snapshotIA.ai.inputFingerprint ? 'lista' : prev)
        }
```

- [ ] **Step 5: Elegir tasador**
```ts
    async function handleElegirTasador(source: ValuationSource) {
        const id = editId || savedAppraisalIdRef.current
        if (!id || source === tasadorElegido) return
        setOcupadoIA(true); setAvisoTasador(null)
        try {
            const { teniaPreciosEditados } = await elegirTasadorDeTasacion(id, source)
            setTasadorElegido(source)
            if (teniaPreciosEditados) {
                setReportEdits(prev => ({ ...prev, priceOverrides: undefined }))
                setAvisoTasador('Se descartaron los precios editados a mano del PDF: eran de la otra versión.')
            }
        } catch (err) { setAvisoTasador(err instanceof Error ? err.message : 'No se pudo cambiar el tasador') }
        finally { setOcupadoIA(false) }
    }
```

- [ ] **Step 6: Lo que ven las tablas y el PDF.** Definir antes del `return`:
```ts
    const resultadoEnUso: ValuationResult | null =
        tasadorElegido === 'ai' && snapshotIA && (estadoIA === 'lista' || estadoIA === 'desactualizada')
            ? rehidratar(snapshotIA, comparables.map((c, i) => ({ price: c.price, currency: c.currency, title: c.title, location: c.location, url: c.url, images: c.images, description: c.description, features: snapshotIA.ai.comparables[i]?.features ?? c.features })))
            : valuationResult
```
- En la sección de resultados, arriba de `<ValuationReport …>`, insertar el `SelectorDeTasador` con `clasico={valuationResult}`, `ia={snapshotIA}`, `estadoIA`, `errorIA`, `elegido={tasadorElegido}`, `ocupado={ocupadoIA}`, `onElegir={handleElegirTasador}`, `onGenerar` (Step 3); debajo el `avisoTasador` como en el detalle.
- `ValuationReport`: `result={resultadoEnUso ?? valuationResult}`; `subject.features` en modo IA = `snapshotIA.ai.subject.features`; **en modo IA los handlers de edición NO se pasan** (`editable={tasadorElegido === 'calculator'}`) y arriba de la tabla un texto: "Para ajustar coeficientes de la versión IA, hacelo desde el detalle de la tasación." Motivo: el wizard edita las FILAS (estado `comparables`) y el efecto de recálculo re-escribe el clásico; mezclar los dos caminos acá duplicaría 1.700 líneas de riesgo. El detalle ya edita las dos versiones.
- `PDFPreviewModal`: `valuationResult={resultadoEnUso ?? valuationResult}` y `comparables` con las features IA en modo IA (mismo mapeo del `rehidratar` de arriba).

- [ ] **Step 7: Imports**: `SelectorDeTasador, type EstadoIAEnPantalla`; `estadoTarjetaIA, rehidratar` de `valuacion-activa`; `huellaDeInsumos`; `generarValuacionIA, elegirTasadorDeTasacion`; `type { AiValuationResult, ValuationSource }`; `type { ExpenseRates }` ya está.

- [ ] **Step 8: tsc + eslint sobre el archivo.** **Step 9: Commit** (`feat(tasaciones): el wizard dispara el Tasador IA al calcular y deja elegir con cuál seguir`).

---

### Task 12: Prueba real contra OpenAI y la base (`scripts/probar-tasador-ia.ts`)

**Files:**
- Create: `scripts/probar-tasador-ia.ts`

- [ ] **Step 1: Escribir el script** (NO escribe en la base)

```ts
/**
 * Corre el Tasador IA sobre una tasación REAL y compara con la clásica. No
 * escribe nada. Mide latencia y tokens: si la latencia pasa de ~15 s hay que
 * achicar el prompt antes de deployar (la función de Netlify se corta antes).
 * Correr: node --env-file=../../../.env.local --import tsx scripts/probar-tasador-ia.ts <appraisalId>
 */
import { createClient } from '@supabase/supabase-js'
import { chatCompletion } from '../lib/ai/chat-client'
import { correrTasadorIA } from '../lib/valuation/tasador-ia'
import { comparablesNormales, filaAPropiedad, type FilaComparable } from '../lib/valuation/valuacion-activa'
import type { ValuationProperty, ValuationResult } from '../lib/valuation/calculator'

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('uso: probar-tasador-ia.ts <appraisalId>')
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const [{ data: t }, { data: comps }] = await Promise.all([
    sb.from('appraisals').select('*').eq('id', id).single(),
    sb.from('appraisal_comparables').select('*').eq('appraisal_id', id).order('sort_order'),
  ])
  if (!t) throw new Error('tasación no encontrada')
  const fila = t as Record<string, unknown>
  const clasico = fila.valuation_result as ValuationResult
  const subject: ValuationProperty = {
    title: String(fila.property_title ?? ''), location: String(fila.property_location ?? ''), description: String(fila.property_description ?? ''),
    price: (fila.property_price as number | null) ?? null, currency: (fila.property_currency as string | null) ?? null,
    features: (fila.property_features ?? {}) as ValuationProperty['features'],
  }
  const comparables = comparablesNormales((comps ?? []) as unknown as FilaComparable[]).map(r => filaAPropiedad(r))
  console.log(`Tasación: ${subject.title} · ${comparables.length} comparables`)
  const t0 = Date.now()
  const ia = await correrTasadorIA({
    subject, comparables, expenseRates: clasico.expenseRates,
    ownerSharePercent: clasico.ownerSharePercent ?? 100, purchaseScenarios: clasico.purchaseScenarios ?? [],
    selectedScenarioIds: clasico.selectedScenarioIds ?? [], previousPurchaseResult: clasico.purchaseResult,
  }, { chat: (i) => chatCompletion(i) })
  const ms = Date.now() - t0
  const f = (n: number) => `USD ${Math.round(n).toLocaleString('es-AR')}`
  console.log(`\nLatencia: ${(ms / 1000).toFixed(1)} s · modelo ${ia.ai.provider}/${ia.ai.model} · tokens ${ia.ai.usage?.totalTokens ?? '?'} (in ${ia.ai.usage?.promptTokens ?? '?'} / out ${ia.ai.usage?.completionTokens ?? '?'})`)
  console.log(`Confianza: ${ia.ai.confidence}\nResumen: ${ia.ai.summary}\n`)
  console.log(`${'':22}${'Clásico'.padStart(16)}${'IA'.padStart(16)}`)
  for (const [k, l] of [['publicationPrice', 'Publicación'], ['saleValue', 'Venta'], ['moneyInHand', 'Dinero en mano'], ['subjectPriceM2', 'USD/m² subject'], ['averagePriceM2', 'Promedio USD/m²']] as const) {
    console.log(`${l.padEnd(22)}${f(clasico[k]).padStart(16)}${f(ia[k]).padStart(16)}`)
  }
  console.log('\nSubject:', ia.ai.subject.features.quality, ia.ai.subject.features.conservationState, ia.ai.subject.features.disposition, 'J=' + ia.ai.subject.features.locationCoefficient, '—', ia.ai.subject.reasoning)
  ia.ai.comparables.forEach((c, i) => console.log(`Comp ${i + 1}:`, c.features.quality, c.features.conservationState, c.features.disposition, 'J=' + c.features.locationCoefficient, '—', c.reasoning))
  if (ms > 15_000) console.warn('\n⚠️ latencia alta: achicar prompt/maxTokens antes de deployar')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Step 2: Elegir una tasación real con ≥3 comparables**

Run: `node --env-file=../../../.env.local --import tsx -e "…"` o directamente con SQL vía `pg`: `SELECT id, property_title, comparable_count FROM appraisals WHERE comparable_count >= 3 ORDER BY created_at DESC LIMIT 5`.

- [ ] **Step 3: Correr el script** contra esa tasación. Pegar la salida (latencia, tokens, tabla) en el mensaje al dueño. Si la latencia > 15 s: bajar `MAX_DESCRIPCION` a 400 y `maxTokens` a 1500 en `tasador-ia.ts`, re-correr los tests y el script. Si el modelo devuelve inválido dos veces seguidas, mirar el `content` crudo (agregar `console.log` temporal en el script, NO en el módulo) y ajustar el prompt.

- [ ] **Step 4: Commit** (`chore(tasaciones): script para probar el Tasador IA contra una tasación real`).

---

### Task 13: Documentación y cierre de la Etapa 3-4

**Files:**
- Modify: `CLAUDE.md` (nueva sección `## Tasador IA — segunda opinión con el mismo método (2026-09-10)` después de "Buscar texto en Postgres…", antes de "Correr las pruebas en esta Mac")

- [ ] **Step 1: Escribir la sección** con: qué es (IA interpreta, calculadora calcula), las 4 columnas, `valuation_source` y los precios desnormalizados que la siguen (lista de los 12 consumidores que NO cambiaron), la huella y qué NO incluye, por qué los `priceOverrides` se borran al cambiar, la regla "el wizard no edita la versión IA; el detalle sí", cómo probar (`scripts/probar-tasador-ia.ts`), `TASADOR_IA_MODEL` opcional, y Detection: `SELECT ai_valuation_status, count(*) FROM appraisals GROUP BY 1` (muchos `failed` = el modelo o el prompt cambiaron; `pending` viejos = la función murió).

- [ ] **Step 2: Correr TODA la config acotada y tsc por última vez**; pegar la salida.

- [ ] **Step 3: Commit** (`docs(claude): Tasador IA — cómo funciona, qué no tocar y cómo detectar fallas`).

---

## Después del plan (Etapas 5 y 6 del protocolo, fuera de las tareas)

1. Revisión adversarial (`superpowers:requesting-code-review` / subagente `feature-dev:code-reviewer`) sobre `git diff origin/main...feat/tasador-ia`. Verificar cada hallazgo antes de aplicarlo.
2. `git diff --name-only origin/main feat/tasador-ia` → solo archivos propios.
3. `git push -u origin feat/tasador-ia && gh pr create --base main --title "feat(tasaciones): Tasador IA, segunda opinión de precio con el mismo método"`.
4. QA en la vista previa con el navegador de Claude (`scripts/navegador-claude.sh abrir <url>`), recorriendo los 12 criterios de aceptación de la spec con una tasación `[TEST`; tabla criterio → cómo → resultado. Rol abogado: no ve el picker.
5. Merge (`gh pr merge --squash` o `--ff-only`), esperar deploy, humo en `https://inmodf.com.ar` sobre la tasación `[TEST`, borrarla, cerrar el navegador, reporte al dueño. La migración YA está aplicada (Tarea 1). Variable opcional `TASADOR_IA_MODEL` (avisar al dueño; sin ella usa el default).
