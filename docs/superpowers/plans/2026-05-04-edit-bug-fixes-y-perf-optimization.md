# Edit Bug Fixes + Performance Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver bugs en la edición de tasaciones legacy + optimizar el tiempo de respuesta percibido al navegar entre secciones del dashboard.

**Architecture:** Dos sub-proyectos independientes pero secuenciales:
- **Módulo A** (correctness): bug fixes targeted en el flujo de edit/save de tasaciones, sin cambiar funcionalidad — solo eliminar drifts silenciosos, errores no manejados y data loss en tasaciones legacy.
- **Módulo B** (performance): optimizaciones de UX y carga sin tocar la lógica de las features. Quick wins primero (parallelizar awaits, loading indicator global, dynamic imports, prefetch hints), seguidos de mejoras estructurales opcionales por sección.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase, @react-pdf/renderer, Tailwind/shadcn.

**Restricción del usuario:** "No toques ninguna funcionalidad como tal" — el plan se limita a bug fixes y optimización de performance/UX. No hay cambios de comportamiento de features.

---

## Mapa de Archivos Afectados

**Módulo A — Edit bug fixes:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx` — fix de timestamp draft, error handling de calculateValuation, preservación de selectedScenarioIds, restore + persist de reportEdits, banner de coefficient drift.
- Modify: `lib/supabase/appraisals.ts` — incluir `report_edits` JSONB en save/update/get.
- Modify: `types/database.types.ts` (o equivalente) — tipo del nuevo campo.
- Create: `supabase/migrations/20260504000000_appraisals_report_edits.sql` — agregar columna `report_edits` a la tabla `appraisals`.

**Módulo B — Performance:**
- Modify: `app/(dashboard)/layout.tsx` — parallelizar `getUser()` + `isImpersonating()`.
- Create: `components/dashboard/NavigationProgress.tsx` — barra de progreso global activada en click + ruta change.
- Modify: `app/(dashboard)/layout.tsx` — incluir `<NavigationProgress />`.
- Modify: `components/appraisal/PDFDownloadButton.tsx` — dynamic import del bundle PDF.
- Modify: `components/appraisal/pdf/PDFReport.tsx` — verify es solo importado por PDFPreviewModal/PDFDownloadButton (que ya son dynamic).
- Modify: `components/dashboard/DashboardNav.tsx` (o equivalente) — `prefetch={true}` explícito en Links del sidebar.

---

## MÓDULO A — Edit Bug Fixes

### Task A1: Fix timestamp para localStorage recovery (`updated_at` en lugar de `created_at`)

**Bug:** Línea 306 de `app/(dashboard)/appraisal/new/page.tsx` compara el draft local con `detail.created_at`. Como `created_at` no cambia con updates, un draft local viejo puede "ganar" incorrectamente sobre cambios recientes guardados en DB. Hay que usar `updated_at`.

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx:306`

- [ ] **Step 1: Verificar que `appraisals` tiene `updated_at`**

```bash
grep -n "updated_at" types/database.types.ts | head -5
grep -n "updated_at" supabase/migrations/*.sql | head -5
```

Expected: la columna existe en la tabla `appraisals`. Si no existe, AVISA — no inventes el campo.

- [ ] **Step 2: Confirmar que `getAppraisal` devuelve `updated_at` en su payload**

Leer `lib/supabase/appraisals.ts` — la función hace `select('*')`, así que `updated_at` ya viene. Verificar que `AppraisalDetail` interface lo incluya:

```bash
grep -A 30 "interface AppraisalDetail" lib/supabase/appraisals.ts
```

Si `updated_at` no está en el interface, agregarlo:

```typescript
export interface AppraisalDetail {
    // ... campos existentes
    updated_at: string
    // ... resto
}
```

- [ ] **Step 3: Reemplazar el campo en la comparación de timestamp**

En `app/(dashboard)/appraisal/new/page.tsx`, localizar:

```typescript
const dbTime = new Date(detail.created_at || 0).getTime()
```

Reemplazar por:

```typescript
const dbTime = new Date(detail.updated_at || detail.created_at || 0).getTime()
```

Fallback a `created_at` por si una tasación legacy nunca tuvo `updated_at` populado.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/appraisal/new/page.tsx" lib/supabase/appraisals.ts
git commit -m "fix(appraisals): usar updated_at para recovery del draft local"
```

---

### Task A2: Error handling cuando `calculateValuation` devuelve `null`

**Bug:** En el useEffect de recálculo + auto-save (~línea 385+), si `calculateValuation()` devuelve `null` (por subject inválido, comparables sin precio, etc.), el código simplemente `return`. El user no ve feedback y el state queda inconsistente con la tasación cargada.

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx` (useEffect de recálculo)

- [ ] **Step 1: Localizar el useEffect**

```bash
grep -n "calculateValuation\|merged.*ValuationResult" "app/(dashboard)/appraisal/new/page.tsx" | head -10
```

- [ ] **Step 2: Reemplazar el early return por manejo de error visible**

Buscar el bloque dentro del useEffect que se ve aproximadamente así:

```typescript
const next = calculateValuation({ subject: subjectVal, comparables: compsVal, expenseRates })
if (!next) return
```

Reemplazar por:

```typescript
const next = calculateValuation({ subject: subjectVal, comparables: compsVal, expenseRates })
if (!next) {
    // Datos inválidos: subject sin features mínimas o comparables sin precio.
    // No corromper el state ni hacer auto-save — preservar el último resultado válido
    // y avisar al usuario en el banner.
    console.warn('[recalc] calculateValuation devolvió null — datos insuficientes', {
        hasSubject: !!subject,
        comparableCount: comparables.length,
        comparablesConPrecio: comparables.filter(c => c.price).length,
    })
    setSaveStatus('error')
    setSaveErrorDetail('No se puede recalcular: revisá que el subject y los comparables tengan datos completos (precios, superficies).')
    return
}</br>
```

NOTA: dejá el resto del useEffect tal cual — solo se cambia el `if (!next) return` por la versión con feedback.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test mental**

1. Cargar tasación legacy con `subject.features.coveredArea = 0` y comparable sin precio.
2. Cambiar un valor.
3. Esperar: aparece banner rojo con mensaje claro de "datos insuficientes".
4. Antes del fix: el banner quedaba en "Guardado en historial" pero la tasación no se actualizaba.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "fix(appraisals): manejar null de calculateValuation con feedback al usuario"
```

---

### Task A3: Limpiar `selectedScenarioIds` cuando se eliminan todos los purchase scenarios

**Bug:** En el merge dentro del useEffect:
```typescript
selectedScenarioIds: scenarioResults ? selectedScenarioIds : valuationResult.selectedScenarioIds
```
Si el usuario borra TODAS las purchase properties, `scenarioResults = undefined` y se preserva el `selectedScenarioIds` viejo. El PDF puede intentar renderizar IDs inexistentes.

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx` (useEffect de recálculo, bloque `merged`)

- [ ] **Step 1: Localizar el `merged` object dentro del useEffect**

```bash
grep -n "merged.*ValuationResult\|selectedScenarioIds:" "app/(dashboard)/appraisal/new/page.tsx" | head -10
```

- [ ] **Step 2: Reemplazar la lógica**

Buscar:

```typescript
const merged: ValuationResult = {
    ...next,
    purchaseResult: valuationResult.purchaseResult,
    purchaseScenarios: scenarioResults,
    selectedScenarioIds: scenarioResults ? selectedScenarioIds : valuationResult.selectedScenarioIds,
}
```

Reemplazar por:

```typescript
// Si hay escenarios calculados, preservar la selección actual del usuario.
// Si NO hay (porque borró las purchase properties), también limpiar los IDs
// seleccionados — un selectedScenarioIds con IDs inexistentes hace que el PDF
// renderice tablas vacías o falle silenciosamente.
const mergedScenarios = scenarioResults && scenarioResults.length > 0 ? scenarioResults : undefined
const mergedSelectedIds = mergedScenarios
    ? selectedScenarioIds.filter(id => mergedScenarios.some(s => s.id === id))
    : []

const merged: ValuationResult = {
    ...next,
    purchaseResult: mergedScenarios ? valuationResult.purchaseResult : undefined,
    purchaseScenarios: mergedScenarios,
    selectedScenarioIds: mergedSelectedIds,
}
```

Cambios clave:
- `mergedScenarios` es `undefined` si el array está vacío (no `[]`).
- `mergedSelectedIds` filtra solo IDs que efectivamente existen en los scenarios.
- `purchaseResult` también se limpia si no hay scenarios (consistencia).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "fix(appraisals): limpiar selectedScenarioIds y purchaseResult si no hay scenarios"
```

---

### Task A4: Banner de coefficient drift en página de edición (paridad con detail page)

**Bug:** La detail page (`app/(dashboard)/appraisals/[id]/page.tsx`) detecta cuando una tasación legacy tiene `subjectQualityCoef = 1.0` hardcoded y muestra un banner de aviso. La página de edición (`/appraisal/new?editId=...`) NO lo hace. Si el user edita una tasación legacy y recalcula, el precio puede subir hasta 27.5% sin aviso.

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx` (después del useEffect de carga, antes del JSX)

- [ ] **Step 1: Localizar cómo lo hace la detail page**

```bash
grep -n "coefficientChanged\|drift\|getQualityCoefficient\|subjectQualityCoef" "app/(dashboard)/appraisals/[id]/page.tsx"
```

Patrón a replicar (típico):
```typescript
import { getQualityCoefficient } from '@/lib/valuation/calculator'

const storedQualityCoef = appraisal.valuation_result?.subjectQualityCoef
const expectedQualityCoef = getQualityCoefficient(appraisal.property_features?.quality)
const coefficientChanged = typeof storedQualityCoef === 'number' &&
    Math.abs(storedQualityCoef - expectedQualityCoef) > 0.01
```

- [ ] **Step 2: Importar el helper en new page**

En `app/(dashboard)/appraisal/new/page.tsx`, agregar al import existente de calculator:

```typescript
import { calculateValuation, calculatePurchaseCosts, getQualityCoefficient, ExpenseRates, ValuationResult, ValuationProperty, PurchaseResult } from '@/lib/valuation/calculator'
```

(NOTA: respetar los imports actuales — solo agregar `getQualityCoefficient` si no está.)

- [ ] **Step 3: Agregar state `coefficientDriftWarning`**

Cerca de los otros useStates iniciales:

```typescript
const [coefficientDriftWarning, setCoefficientDriftWarning] = useState<{
    storedCoef: number
    expectedCoef: number
    quality: string
} | null>(null)
```

- [ ] **Step 4: Detectar drift al final del useEffect de carga**

Dentro del bloque `getAppraisal(editId).then(detail => { ... })`, después de los `setX(...)` y antes del bloque de localStorage draft, agregar:

```typescript
// Aviso si la tasación legacy tiene un coeficiente de calidad hardcoded a 1.0.
// Al recalcular, el precio puede cambiar significativamente.
const storedCoef = detail.valuation_result?.subjectQualityCoef
const subjectQuality = (detail.property_features as Record<string, unknown> | undefined)?.quality as string | undefined
const expectedCoef = getQualityCoefficient(subjectQuality as Parameters<typeof getQualityCoefficient>[0])
if (typeof storedCoef === 'number' && Math.abs(storedCoef - expectedCoef) > 0.01) {
    setCoefficientDriftWarning({ storedCoef, expectedCoef, quality: subjectQuality || 'no definida' })
}
```

- [ ] **Step 5: Renderizar el banner en el JSX**

Buscar dónde está el `<main>` o `<div>` principal del JSX (después del header de la página). Agregar como hijo, antes del wizard/form principal:

```tsx
{coefficientDriftWarning && (
    <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong className="text-amber-800">⚠️ Aviso de actualización del motor de cálculo</strong>
        <p className="mt-1 text-amber-700">
            Esta tasación fue creada con un coeficiente de calidad fijo en {coefficientDriftWarning.storedCoef.toFixed(2)}.
            Al editar y recalcular se aplicará el coeficiente real de la calidad seleccionada
            (<strong>{coefficientDriftWarning.quality} = {coefficientDriftWarning.expectedCoef.toFixed(3)}</strong>).
            Esto puede modificar el precio de publicación.
        </p>
    </div>
)}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "feat(appraisals): banner de coefficient drift en página de edición"
```

---

### Task A5: Persistir `reportEdits` en DB (carga + save)

**Bug:** Los `reportEdits` (textos editables del PDF: estrategia, conclusiones, etc.) se inicializan con defaults en `useState` y NUNCA se restauran desde DB. Cada vez que el user recarga, sus textos custom se pierden.

**Files:**
- Create: `supabase/migrations/20260504000000_appraisals_report_edits.sql`
- Modify: `lib/supabase/appraisals.ts` — interfaz + save/update/get
- Modify: `app/(dashboard)/appraisal/new/page.tsx` — restore al cargar, save al persistir

- [ ] **Step 1: Crear migración SQL**

Crear archivo `supabase/migrations/20260504000000_appraisals_report_edits.sql`:

```sql
-- =============================================================================
-- Migration: Add report_edits JSONB column to appraisals
-- Date: 2026-05-04
--
-- Persiste los textos editables del PDF (estrategia, conclusiones, títulos
-- custom, etc.) que hoy se pierden cada vez que el usuario recarga la
-- tasación.
--
-- INSTRUCCIONES PARA APLICAR
-- --------------------------
-- 1. Abrir Supabase Dashboard → SQL Editor.
-- 2. Pegar y ejecutar.
-- 3. La columna acepta NULL para tasaciones legacy (se hidratan con defaults
--    en el cliente).
-- =============================================================================

ALTER TABLE public.appraisals
    ADD COLUMN IF NOT EXISTS report_edits JSONB;

-- Index opcional si en el futuro queremos buscar por contenido de edits.
-- (No agregar index hasta que tengamos un caso real para optimizar.)
```

- [ ] **Step 2: Aplicar la migración manualmente**

El usuario debe ejecutar el SQL anterior en Supabase Dashboard → SQL Editor. Sin esa columna, los pasos siguientes fallarán al guardar.

- [ ] **Step 3: Extender `SaveAppraisalInput` y `AppraisalDetail`**

En `lib/supabase/appraisals.ts`, importar el tipo:

```typescript
import type { ReportEdits } from '@/lib/types/report-edits'
```

(Verificar el path real — buscar con `grep -rn "export.*ReportEdits" lib/`.)

Extender los interfaces:

```typescript
export interface SaveAppraisalInput {
    // ... campos existentes
    reportEdits?: ReportEdits
}

export interface AppraisalDetail {
    // ... campos existentes
    report_edits: ReportEdits | null
}
```

- [ ] **Step 4: Persistir en `saveAppraisal`**

Localizar el `.insert({...})` del appraisal en saveAppraisal. Agregar al payload:

```typescript
report_edits: input.reportEdits ?? null,
```

- [ ] **Step 5: Persistir en `updateAppraisal`**

En el `updatePayload: Record<string, unknown> = { ... }`, agregar:

```typescript
report_edits: input.reportEdits ?? null,
```

- [ ] **Step 6: Restaurar en page.tsx al cargar**

En `app/(dashboard)/appraisal/new/page.tsx`, dentro del useEffect de carga (`getAppraisal(editId).then(detail => { ... })`), cerca de donde se restauran `expenseRates` / `purchaseScenarios`:

```typescript
if (detail.report_edits) {
    setReportEdits(detail.report_edits as ReportEdits)
}
```

- [ ] **Step 7: Pasar `reportEdits` al saveAppraisal/updateAppraisal**

Buscar las llamadas a `saveAppraisal({ ... })` y `updateAppraisal(id, { ... })` en page.tsx. Agregar al payload en cada caso:

```typescript
reportEdits,
```

(Hacelo en handleCalculate Y en el useEffect de auto-save Y en el botón Reintentar.)

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Smoke test mental**

1. Editar una tasación, abrir vista previa PDF, click "Editar", cambiar el texto de "Estrategia de venta".
2. Cerrar vista previa.
3. Hacer cambio en wizard que dispare auto-save.
4. Recargar página.
5. Abrir vista previa PDF.
6. Verificar: el texto custom de Estrategia se mantiene.

Antes del fix: el texto se reseteaba a default.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20260504000000_appraisals_report_edits.sql lib/supabase/appraisals.ts "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "feat(appraisals): persistir report_edits en DB para que sobrevivan recargas"
```

---

## MÓDULO B — Performance / UX Optimization

### Task B1: Parallelizar awaits en `app/(dashboard)/layout.tsx`

**Bug de performance:** El layout hace `await getUser()` y luego `await isImpersonating()` secuenciales. Cada await añade latencia (network round-trip a Supabase). Con cada navegación entre secciones, el layout se re-renderea y este overhead se siente.

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Localizar los awaits secuenciales**

```bash
grep -n "getUser\|isImpersonating\|await" "app/(dashboard)/layout.tsx" | head -10
```

- [ ] **Step 2: Reemplazar por Promise.all**

Buscar:

```typescript
const user = await getUser()
if (!user) redirect('/login')
const impersonating = await isImpersonating()
```

Reemplazar por:

```typescript
const [user, impersonating] = await Promise.all([
    getUser(),
    isImpersonating(),
])
if (!user) redirect('/login')
```

CRÍTICO: el `redirect` queda DESPUÉS del Promise.all. Si `getUser()` devuelve null, el await ya completó y podemos redirigir.

- [ ] **Step 3: Type-check + verificar comportamiento**

```bash
npx tsc --noEmit
npm run dev
```

Visualmente: navegar entre secciones del dashboard. La latencia debería bajar ~30-50% en sesiones donde getUser y isImpersonating son lentos.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx"
git commit -m "perf(layout): parallelizar getUser + isImpersonating con Promise.all"
```

---

### Task B2: Crear barra de progreso global de navegación

**Problema de UX:** Al hacer click en un link del sidebar, el usuario no ve nada hasta que el `loading.tsx` de la nueva ruta aparece (puede tardar 200-800ms). Resultado: sensación de "se quedó colgado".

**Solución:** Una barra de progreso minimalista al top de la pantalla que aparece inmediatamente al click + muestra progreso durante la carga + desaparece cuando completa.

**Files:**
- Create: `components/dashboard/NavigationProgress.tsx`
- Modify: `app/(dashboard)/layout.tsx` — montar el componente

- [ ] **Step 1: Crear el componente**

Crear `components/dashboard/NavigationProgress.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Barra de progreso global de navegación. Se activa cuando el usuario hace
 * click en un Link de Next.js y desaparece cuando la nueva ruta termina de
 * renderizar. Da feedback visual inmediato durante el "tiempo muerto" entre
 * el click y el render del loading.tsx de la nueva ruta.
 *
 * Implementación: detecta cambios de pathname/searchParams y maneja una
 * animación CSS pura (no requiere librería externa).
 */
export function NavigationProgress() {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [visible, setVisible] = useState(false)
    const [progress, setProgress] = useState(0)

    // Click en cualquier <a> o <Link> dentro del layout → arranca el progress
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement
            const anchor = target.closest('a')
            if (!anchor) return
            // Solo navegaciones internas (mismo origen) y sin modifier keys
            const href = anchor.getAttribute('href')
            if (!href || href.startsWith('http') || href.startsWith('#')) return
            if (e.metaKey || e.ctrlKey || e.shiftKey || anchor.target === '_blank') return
            // Arrancar progress
            setVisible(true)
            setProgress(15)
            // Subida progresiva mientras se carga la ruta
            let p = 15
            const interval = setInterval(() => {
                p = Math.min(p + Math.random() * 12, 85)
                setProgress(p)
            }, 150)
            // Cleanup si la animación se cancela antes de pathname change
            const cleanup = setTimeout(() => clearInterval(interval), 5000)
            // Se libera al detectar pathname change (useEffect siguiente)
            ;(window as Window & { __navProgressInterval?: NodeJS.Timeout }).__navProgressInterval = interval
            ;(window as Window & { __navProgressCleanup?: NodeJS.Timeout }).__navProgressCleanup = cleanup
        }
        document.addEventListener('click', handleClick)
        return () => document.removeEventListener('click', handleClick)
    }, [])

    // Pathname o search params cambió → completar y ocultar
    useEffect(() => {
        const w = window as Window & { __navProgressInterval?: NodeJS.Timeout; __navProgressCleanup?: NodeJS.Timeout }
        if (w.__navProgressInterval) clearInterval(w.__navProgressInterval)
        if (w.__navProgressCleanup) clearTimeout(w.__navProgressCleanup)
        if (visible) {
            setProgress(100)
            const t = setTimeout(() => {
                setVisible(false)
                setProgress(0)
            }, 200)
            return () => clearTimeout(t)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname, searchParams])

    if (!visible) return null

    return (
        <div
            className="fixed top-0 left-0 right-0 z-[100] h-0.5 bg-primary/20 pointer-events-none"
            aria-hidden="true"
        >
            <div
                className="h-full bg-primary transition-[width] duration-200 ease-out shadow-[0_0_8px_rgba(26,84,144,0.5)]"
                style={{ width: `${progress}%` }}
            />
        </div>
    )
}
```

- [ ] **Step 2: Montar el componente en el layout**

En `app/(dashboard)/layout.tsx`, importar:

```typescript
import { NavigationProgress } from '@/components/dashboard/NavigationProgress'
```

Agregarlo como primer hijo del JSX root (antes del header/sidebar):

```tsx
return (
    <>
        <NavigationProgress />
        {/* ... resto del layout existente */}
    </>
)
```

(Si el layout retorna directamente un wrapper `<div>`, agregar `<NavigationProgress />` como su primer hijo.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Click en cualquier sección del sidebar. Inmediatamente debe aparecer una línea azul al top que se llena hasta ~85% durante la carga, y completa al 100% cuando la ruta termina de renderizar.

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/NavigationProgress.tsx "app/(dashboard)/layout.tsx"
git commit -m "feat(ux): barra de progreso global de navegación con feedback inmediato"
```

---

### Task B3: Dynamic imports del bundle de PDF

**Bug de bundle:** `@react-pdf/renderer` pesa ~200KB minified. Si se importa sincronamente en componentes que se cargan en cada página (e.g. `PDFDownloadButton` montado en una página de detalle), entra al bundle inicial. Hoy `PDFPreviewModal` ya es dynamic, pero hay que verificar que `PDFDownloadButton` y los styles no fuerzan el bundle.

**Files:**
- Modify: `components/appraisal/PDFDownloadButton.tsx`
- Verify: `components/appraisal/pdf/PDFReport.tsx` y `PDFStyles.ts` no son importados directamente desde page-level components.

- [ ] **Step 1: Auditar imports de @react-pdf/renderer**

```bash
grep -rn "from '@react-pdf/renderer'" components/ app/ --include="*.tsx" --include="*.ts" | grep -v ".netlify\|.next"
```

Listar cada archivo y marcar:
- ✅ Server-only (`app/api/`, sin `'use client'`)
- ✅ Ya dynamic (envuelto en `dynamic(() => ...)`)
- ❌ Direct import en client component que se monta en page.tsx (necesita fix)

- [ ] **Step 2: Convertir `PDFDownloadButton` a dynamic interno**

Leer el archivo actual:

```bash
grep -n "import\|pdf\b" components/appraisal/PDFDownloadButton.tsx | head -20
```

Si el archivo importa directamente:
```typescript
import { pdf } from '@react-pdf/renderer'
import { PDFReportDocument } from './pdf/PDFReport'
```

Cambiar por carga lazy dentro del handler de click:

```typescript
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import type { ValuationProperty, ValuationResult, PurchaseResult } from '@/lib/valuation/calculator'
import type { ReportEdits } from '@/lib/types/report-edits'

interface Props {
    subject: ValuationProperty
    comparables: ValuationProperty[]
    valuationResult: ValuationResult
    overpriced?: ValuationProperty[]
    purchaseProperties?: ValuationProperty[]
    purchaseResult?: PurchaseResult
    reportEdits?: ReportEdits
    appraisalDate?: string
}

export function PDFDownloadButton(props: Props) {
    const [loading, setLoading] = useState(false)

    async function handleDownload() {
        setLoading(true)
        try {
            // Cargar el bundle de PDF SOLO al click — no entra al bundle inicial.
            const [{ pdf }, { PDFReportDocument }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('./pdf/PDFReport'),
            ])
            const blob = await pdf(<PDFReportDocument {...props} />).toBlob()
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `Informe_Tasacion_${props.subject.title || 'propiedad'}.pdf`
            document.body.appendChild(link)
            link.click()
            link.remove()
            URL.revokeObjectURL(url)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Button onClick={handleDownload} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Descargar PDF
        </Button>
    )
}
```

NOTA: si la versión actual del componente tiene props/lógica adicionales (cleanText de filename, etc.), preservarlos. Solo cambiar los imports estáticos por dinámicos dentro del handler.

- [ ] **Step 3: Verificar que PDFReport.tsx no es importado directo en otros lugares**

```bash
grep -rn "from.*pdf/PDFReport\|import.*PDFReport" components/ app/ --include="*.tsx" --include="*.ts" | grep -v ".netlify\|.next"
```

Espera: solo aparece en `PDFPreviewModal.tsx` (ya dynamic) y `PDFDownloadButton.tsx` (después del fix, dynamic interno). Si aparece en alguna page.tsx, AVISA.

- [ ] **Step 4: Build y medir bundle**

```bash
npm run build
```

Después del build, mirar el output del archivo donde aparece `appraisal/[id]/page` o `appraisals/page` — el "First Load JS" debería ser menor (al menos 100-200KB menos si era el caso).

- [ ] **Step 5: Type-check + commit**

```bash
npx tsc --noEmit
git add components/appraisal/PDFDownloadButton.tsx
git commit -m "perf(pdf): dynamic import del bundle de @react-pdf/renderer en download button"
```

---

### Task B4: `prefetch={true}` explícito en links de navegación principal

**Problema:** Por default, Next.js hace prefetch de Links visibles en viewport. Pero en sidebars con dropdown o secciones colapsables, el prefetch puede no dispararse hasta que el user expande. Hacer prefetch explícito de las rutas principales acelera la primera navegación.

**Files:**
- Modify: el componente que renderiza el sidebar/nav (probablemente `components/dashboard/DashboardNav.tsx` o similar — buscar primero).

- [ ] **Step 1: Localizar el componente de navegación principal**

```bash
grep -rn "Tasaciones\|Pendientes\|CRM" components/dashboard/ components/ --include="*.tsx" 2>/dev/null | grep -v ".netlify" | head -10
```

Identificar el archivo donde están los `<Link href="...">` del sidebar.

- [ ] **Step 2: Agregar `prefetch={true}` a los Links principales**

Buscar en ese archivo todos los `<Link href="...">` que correspondan a las secciones principales (Pendientes, CRM, Tasaciones, Propiedades, Contactos, Métricas, Marketing, Admin). Agregar `prefetch={true}`:

```tsx
<Link href="/crm" prefetch={true}>CRM</Link>
```

NOTA: Next.js 13+ tiene 3 modos de prefetch:
- `prefetch={false}`: nunca
- `prefetch={null}` (default): sólo páginas estáticas
- `prefetch={true}`: siempre, incluyendo páginas dinámicas con `loading.tsx`

Para nuestras páginas dynamic con server data, `prefetch={true}` triggea el prefetch del shell + loading.tsx (no la data completa, que sigue server-rendering on demand).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke test**

```bash
npm run dev
```

Abrir DevTools → Network. Recargar dashboard. En 2-3 segundos deberías ver requests `RSC=...` para cada ruta principal (prefetch). Click en una sección debería ser cuasi-instantáneo.

- [ ] **Step 5: Commit**

```bash
# Ajustar el path al archivo real
git add components/dashboard/
git commit -m "perf(nav): prefetch={true} en links del sidebar para navegación instantánea"
```

---

### Task B5: Loading state en buttons de "Calcular Valor de Mercado" y similares

**Problema de UX:** El botón "Calcular Valor de Mercado" en /appraisal/new no muestra loading state mientras corre el cálculo + save. Para tasaciones con muchos comparables o conexión lenta, el user puede pensar que el click no registró.

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx` — botón principal de calcular.

- [ ] **Step 1: Verificar el botón actual**

```bash
grep -n "Calcular Valor de Mercado\|handleCalculate\|onClick.*handleCalculate" "app/(dashboard)/appraisal/new/page.tsx" | head -5
```

- [ ] **Step 2: Asegurar que `saveStatus === 'saving'` deshabilita y muestra spinner**

Localizar el `<Button onClick={handleCalculate}>...</Button>`. Verificar/extender:

```tsx
<Button
    size="lg"
    className="..."
    onClick={handleCalculate}
    disabled={!allComparablesComplete || saveStatus === 'saving'}
>
    {saveStatus === 'saving' ? (
        <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Calculando...
        </>
    ) : (
        <>
            <Calculator className="h-5 w-5" />
            Calcular Valor de Mercado
            <ArrowRight className="h-5 w-5 opacity-50" />
        </>
    )}
</Button>
```

(Si `Loader2` ya está importado, perfecto. Si no, agregar `import { Loader2 } from 'lucide-react'`.)

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "feat(ux): loading state en botón Calcular Valor de Mercado"
```

---

### Task B6: Auditar y dynamic-import otros bundles pesados (cheerio, charts)

**Problema:** Algunas páginas (Métricas, CRM con charts) importan bibliotecas de visualización que pesan cientos de KB. Si están en el bundle inicial, retrasan la carga de TODAS las secciones.

**Files:**
- Audit: todas las páginas pesadas, identificar imports candidatos a dynamic.

- [ ] **Step 1: Listar dependencias pesadas**

```bash
cat package.json | grep -E "recharts|chart\\.js|d3|cheerio|@react-pdf|puppeteer" | head -10
```

- [ ] **Step 2: Buscar imports directos en client components**

```bash
grep -rn "from 'recharts'\|from 'chart.js'\|from 'cheerio'" app/ components/ --include="*.tsx" --include="*.ts" | grep -v ".netlify\|.next" | head -20
```

Para cada match en archivo `'use client'`, verificar si entra al bundle inicial (es decir, si la página donde se usa es accesible sin user interaction). Si sí, candidato a dynamic.

- [ ] **Step 3: Convertir a dynamic los charts en `/metrics`**

Si encuentra algo como:

```typescript
import { LineChart, BarChart } from 'recharts'
```

en una página de métricas, reemplazar por:

```typescript
import dynamic from 'next/dynamic'

const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse bg-muted rounded" />,
})
const BarChart = dynamic(() => import('recharts').then(m => m.BarChart), {
    ssr: false,
    loading: () => <div className="h-64 animate-pulse bg-muted rounded" />,
})
```

NOTA: si el componente de chart es complejo (varios subcomponents de recharts), envolver el chart entero en su propio componente `MetricsChart.tsx` y hacer dynamic de ese wrapper.

- [ ] **Step 4: Verify cheerio no está en client**

```bash
grep -rn "from 'cheerio'" app/ components/ --include="*.tsx" --include="*.ts" | grep -v ".netlify\|.next\|api/\|/scrape"
```

Expected: solo aparece en archivos de `app/api/` (server) o `lib/scraper/` (server-only). Si aparece en un client component, AVISA — eso requiere análisis específico.

- [ ] **Step 5: Build y comparar**

```bash
npm run build
```

Comparar el "First Load JS" antes vs después del cambio en la ruta `/metrics`. Debería bajar.

- [ ] **Step 6: Commit**

```bash
git add app/ components/
git commit -m "perf: dynamic imports para bibliotecas de charts pesadas"
```

---

### Task B7: Skeleton más informativo en `loading.tsx` de páginas data-heavy

**Problema:** Los `loading.tsx` actuales muestran skeletons genéricos. El user no sabe SI se cargó algo o se quedó colgado. Un skeleton que MIRE como la página real (con shapes y placeholders dimensionados correctamente) reduce la sensación de espera.

**Files:**
- Verify y mejorar: `app/(dashboard)/{tasaciones,contactos,propiedades,crm,pipeline,metricas,marketing}/loading.tsx`

- [ ] **Step 1: Auditar los `loading.tsx` actuales**

```bash
find "app/(dashboard)" -name "loading.tsx" -exec echo "=== {} ===" \; -exec head -30 {} \;
```

- [ ] **Step 2: Para cada loading.tsx que sea solo un spinner, reemplazar por skeleton structural**

Patrón: si la página real tiene una grid de cards / lista de filas, el loading debe replicar esa estructura.

Por ejemplo, para `app/(dashboard)/contacts/loading.tsx` (asumiendo que contacts muestra una tabla), reemplazar:

```typescript
export default function Loading() {
    return <div className="p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
}
```

Por:

```typescript
export default function Loading() {
    return (
        <div className="p-8 space-y-4">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="h-8 w-48 bg-muted rounded animate-pulse" />
                <div className="h-10 w-32 bg-muted rounded animate-pulse" />
            </div>
            {/* Search bar */}
            <div className="h-10 w-full bg-muted rounded animate-pulse" />
            {/* Rows */}
            <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-14 bg-muted rounded animate-pulse" style={{ animationDelay: `${i * 50}ms` }} />
                ))}
            </div>
        </div>
    )
}
```

Hacer lo mismo para cada `loading.tsx` que sea genérico, con la estructura propia de la página.

- [ ] **Step 3: Build + verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/"
git commit -m "perf(ux): skeletons structurales en loading.tsx para feedback más claro"
```

---

## MÓDULO C — QA Final

### Task C1: Type-check, lint, build

- [ ] **Step 1: Suite completa**

```bash
npx tsc --noEmit
npm run lint 2>&1 | grep -E "error" | head -10
npm run build
```

Expected: 0 errores nuevos. Cualquier `any` o `prefer-const` preexistente queda como está.

- [ ] **Step 2: Smoke test manual end-to-end**

1. **Tasación legacy (creada antes de Module C1)**:
   - Editar tasación.
   - Ver banner de coefficient drift en la parte superior (Task A4).
   - Cambiar un comparable. Auto-save dispara.
   - Recargar página. Los cambios persisten.
   - Verificar que `reportEdits` se restauran si el user los modificó (Task A5).

2. **Tasación con purchase scenarios**:
   - Borrar todas las purchase properties.
   - Verificar que `selectedScenarioIds` queda vacío (Task A3).
   - PDF preview no muestra tablas vacías de scenarios.

3. **Navegación dashboard**:
   - Recargar `/contacts`. Aparece skeleton structural (Task B7).
   - Click en sidebar → "Pendientes". Aparece la barra de progreso al top (Task B2).
   - Verificar que la navegación se siente instantánea (prefetch de Task B4).

4. **Bundle size**:
   - `npm run build` y mirar "First Load JS" para `/contacts`, `/metrics`, `/appraisals/[id]`.
   - Comparar con baseline pre-implementación (anotado al inicio).

- [ ] **Step 3: Push si todo pasa**

```bash
git push origin main
```

Netlify auto-desplegará. Verificar el deploy en ~2 minutos.

---

## Self-Review

**Spec coverage:**

| Punto del usuario | Task que lo cubre |
|---|---|
| "Tasaciones anteriores no cargan correctamente" | A1 (timestamp), A2 (null calc), A3 (scenarios), A4 (drift), A5 (reportEdits) |
| "Cuando cambio valores tiene que guardarse y visualizarse" | A2 (error feedback), A3 (state limpio) |
| "Optimización de carga en todas las secciones" | B1 (parallel awaits), B6 (charts dynamic), B3 (PDF dynamic) |
| "No es claro que efectivamente le di click" | B2 (NavigationProgress), B5 (loading state en buttons), B7 (skeletons) |
| "Tiempo de carga se demora un montón" | B1, B3, B4 (prefetch), B6 |
| "Navegación hiper-rápida e hiper-fluida" | B2 + B4 + B7 (juntos cubren la sensación) |
| "No tocar funcionalidad" | Todos los tasks son bug fixes o perf — sin cambios de comportamiento. |

**Placeholder scan:** ningún TBD/TODO. Todos los pasos tienen código completo o comandos exactos.

**Type consistency:**
- `ReportEdits` tipo importado en lib/supabase/appraisals.ts y page.tsx (Task A5).
- `report_edits` columna agregada en migración (Task A5 step 1) y persisted en saveAppraisal/updateAppraisal (steps 4-5).
- `getQualityCoefficient` importado del calculator (Task A4 step 2).
- `NavigationProgress` componente client-only (`'use client'`), montado en layout (server component) — válido en Next.js 13+.

**Riesgos conocidos documentados:**
- Task A5 requiere ejecución manual de SQL en Supabase Dashboard (step 2). Sin eso, el save fallará con "column not found".
- Task B4 requiere conocer el archivo del sidebar — se busca en step 1.
- Task B6 puede no aplicar si el proyecto no usa charts pesados en client.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-edit-bug-fixes-y-perf-optimization.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatcho un subagente fresh por task, review entre tasks, iteración rápida.

**2. Inline Execution** - Ejecuto los tasks en esta sesión con checkpoints para review.

**¿Qué enfoque preferís?**
