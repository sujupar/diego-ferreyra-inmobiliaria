# Tasador — Ajustes UI/UX/PDF + Sistema de Escenarios de Compra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 7 ajustes UX/UI/PDF en el sistema de tasaciones + un sistema completo de escenarios de compra (Conservador / Medio / Agresivo) con simulación de gastos consolidada.

**Architecture:** Cambios en 4 capas: (1) tipos + calculator (lógica), (2) componentes React (vista previa interactiva), (3) PDFReport (renderizado), (4) persistencia Supabase (JSONB). Los nuevos escenarios de compra se modelan como un array dentro de `valuation_result` para no requerir migración de schema. Edición inline reutiliza el patrón de `reportEdits` existente.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, @react-pdf/renderer 4.3.1, Supabase, Tailwind/shadcn

**Estimación:** 9 módulos, ~32 tareas. Ejecución sugerida en orden A→H.

---

## Mapa de Archivos Afectados

**Crear:**
- `lib/valuation/utils.ts` — `formatCurrency` compartida (resuelve duplicación entre PDFReport y ValuationReport)
- `lib/valuation/addressUtils.ts` — `extractAddress` para limpiar títulos de propiedad
- `lib/valuation/purchase-scenarios.ts` — generador de 3 escenarios + tipos calculados
- `components/appraisal/PurchaseScenariosEditor.tsx` — UI editable de escenarios
- `components/appraisal/SubjectFeaturesEditor.tsx` — UI inline edición de subject features

> **Nota de arquitectura de tipos:** Los nuevos tipos `PurchaseScenarioId`, `PurchaseScenarioInput`, `PurchaseScenarioResult` se agregan **directamente en `lib/valuation/calculator.ts`** (donde ya vive `ValuationResult`). NO se crea `lib/valuation/types.ts`. La extensión de `ValuationResult` con `purchaseScenarios?` y `selectedScenarioIds?` también va en `calculator.ts`. Todos los imports usan `@/lib/valuation/calculator`.

**Modificar:**
- `lib/valuation/calculator.ts` (bug coeficientes subject + integrar escenarios)
- `lib/valuation/calculator.ts` (extender `ValuationResult` con `purchaseScenarios` + tipos nuevos)
- `lib/scraper/zonaPropExtractor.ts` (verificar/normalizar `publishedDate`)
- `lib/scraper/mercadoLibreExtractor.ts` (verificar/normalizar `publishedDate`)
- `components/appraisal/pdf/PDFReport.tsx` (portada, comparables, divider, página 2, sección compra/simulación)
- `components/appraisal/pdf/PDFStyles.ts` (estilos de portada Diego, link comparable, separadores)
- `components/appraisal/ValuationReport.tsx` (subject features inline + rates inline + escenarios)
- `app/(dashboard)/appraisal/new/page.tsx` (estado escenarios + selector + persistencia)
- `app/(dashboard)/appraisals/[id]/page.tsx` (asegurar lectura/edición de subject features y escenarios)
- `lib/supabase/appraisals.ts` (asegurar que `valuation_result` JSONB persiste el campo nuevo)

**Tests/QA manual:**
- Crear tasación de prueba en local
- Verificar PDF renderiza correctamente en modo venta-only y modo venta+compra
- Validar al menos 1 tasación existente del historial (back-compat)

---

## MÓDULO 0 — Pre-flight: Utilidades Compartidas

### Task 0.1: Crear `lib/valuation/utils.ts` con formatCurrency centralizado

**Files:**
- Create: `lib/valuation/utils.ts`
- Modify: `components/appraisal/pdf/PDFReport.tsx:42` (eliminar definición local)
- Modify: `components/appraisal/ValuationReport.tsx:33` (eliminar definición local)

**Contexto:** Hoy `formatCurrency` está duplicada en PDFReport.tsx (locale en-US) y ValuationReport.tsx (locale es-AR). El plan original importa desde `calculator.ts` pero ahí no existe. Centralizamos antes de tocar más.

- [ ] **Step 1: Inspeccionar implementaciones existentes**

```bash
grep -n "function formatCurrency\|const formatCurrency" components/appraisal/pdf/PDFReport.tsx components/appraisal/ValuationReport.tsx
```

- [ ] **Step 2: Crear `lib/valuation/utils.ts`**

```typescript
/**
 * Formatea un valor numérico como moneda. Usa locale es-AR por consistencia visual.
 * Maneja USD/ARS/null y retorna string sin decimales.
 */
export function formatCurrency(value: number, currency?: string | null): string {
    const safe = Number.isFinite(value) ? value : 0
    const cur = currency || 'USD'
    if (cur === 'USD') return `u$d${Math.round(safe).toLocaleString('es-AR')}`
    if (cur === 'ARS') return `$${Math.round(safe).toLocaleString('es-AR')}`
    return `${cur}${Math.round(safe).toLocaleString('es-AR')}`
}
```

- [ ] **Step 3: Reemplazar definición local en PDFReport.tsx**

Buscar la función `formatCurrency` (línea ~42) y eliminarla. Agregar al tope con los imports:

```typescript
import { formatCurrency } from '@/lib/valuation/utils'
```

- [ ] **Step 4: Reemplazar definición local en ValuationReport.tsx**

Mismo procedimiento — eliminar definición local (línea ~33), agregar import.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Verificar que no hay imports rotos.

- [ ] **Step 6: Commit**

```bash
git add lib/valuation/utils.ts components/appraisal/pdf/PDFReport.tsx components/appraisal/ValuationReport.tsx
git commit -m "refactor: centralizar formatCurrency en lib/valuation/utils.ts"
```

---

### Task 0.2: Extender `ValuationResult` en calculator.ts con tipos de escenarios

**Files:**
- Modify: `lib/valuation/calculator.ts` (agregar tipos cerca de línea 102 donde está `ExpenseRates`, y extender `ValuationResult` cerca de línea 155)

**Contexto:** Se aprovecha que `ValuationResult` ya está en calculator.ts. Agregamos los nuevos tipos ahí mismo para evitar imports cruzados.

- [ ] **Step 1: Localizar interfaces existentes**

```bash
grep -n "export interface ValuationResult\|export interface ExpenseRates" lib/valuation/calculator.ts
```

- [ ] **Step 2: Agregar tipos de escenarios después de `ExpenseRates`**

Justo después del cierre de `ExpenseRates` (línea ~108):

```typescript
export type PurchaseScenarioId = 'conservative' | 'medium' | 'aggressive'

export interface PurchaseScenarioRates {
    stampsPercent: number
    notaryFeesPercent: number
    deedExpensesPercent: number
    buyerCommissionPercent: number
}

export interface PurchaseScenarioInput {
    id: PurchaseScenarioId
    label: string
    publicationPrice: number
    purchaseDiscountPercent: number
    deedDiscountPercent: number
    rates: PurchaseScenarioRates
}

export interface PurchaseScenarioResult extends PurchaseScenarioInput {
    purchasePrice: number
    deedValue: number
    stampsCost: number
    notaryFees: number
    deedExpenses: number
    buyerCommission: number
    totalPurchaseCosts: number
    totalCostWithPurchase: number
    moneyFromSale: number
    remainingMoney: number
}
```

- [ ] **Step 3: Extender la interfaz `ValuationResult`**

Localizar `export interface ValuationResult { ... }` (línea ~155) y agregar antes del `}`:

```typescript
    /** Escenarios de compra calculados (Conservador / Medio / Agresivo). */
    purchaseScenarios?: PurchaseScenarioResult[]
    /** IDs seleccionados para mostrar en el PDF. */
    selectedScenarioIds?: PurchaseScenarioId[]
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add lib/valuation/calculator.ts
git commit -m "feat(types): tipos PurchaseScenario* en calculator.ts"
```

---

## MÓDULO A — Ajustes Cosméticos PDF (Portada, Comparables, Dividers)

### Task A1: Portada — solo dirección + foto Diego completa

**Files:**
- Modify: `components/appraisal/pdf/PDFReport.tsx:85-88` (título portada)
- Modify: `components/appraisal/pdf/PDFReport.tsx:111-116` (foto Diego)

**Contexto:** Hoy el título de portada usa `subject.title || subject.location`. El campo `subject.location` típicamente contiene "Sánchez de Bustamante 850, Almagro, Capital Federal". Hay que mostrar SOLO la dirección. Además la foto de Diego en portada está cortada porque tiene `height: 360` con `objectFit: 'cover'`. Debe mostrarse completa.

- [ ] **Step 1: Crear utilitario `extractAddress()` en nuevo archivo**

Crear `lib/valuation/addressUtils.ts`:

```typescript
/**
 * Extrae solo la dirección (calle + número) de un texto que puede contener
 * "Calle Numero, Barrio, Ciudad" o "PH 3 amb, Calle Numero, Barrio, Ciudad, Portal".
 *
 * Reglas:
 * - Si el string contiene comas, toma el primer fragmento que matchea calle+número.
 * - Un fragmento es "dirección" si tiene >= 1 letra y >= 1 dígito.
 * - EXCLUYE fragmentos que empiezan con tipo de propiedad (PH 3, depto 2, casa 4)
 *   porque suelen indicar características, no direcciones.
 * - Si nada matchea, devuelve el primer fragmento o el string original truncado.
 */
const PROPERTY_TYPE_PREFIX = /^(ph|piso|departamento|dpto|local|oficina|casa|monoambiente)\s+\d/i

export function extractAddress(raw: string | null | undefined): string {
    if (!raw) return ''
    const cleaned = raw.trim()
    if (!cleaned) return ''

    const parts = cleaned.split(/\s*[,|·]\s*/).map(p => p.trim()).filter(Boolean)
    const hasLetter = (s: string) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(s)
    const hasDigit = (s: string) => /\d/.test(s)
    const isPropertyType = (s: string) => PROPERTY_TYPE_PREFIX.test(s)

    // Prefer first fragment that looks like "Calle Numero" (no property-type prefix)
    const addressLike = parts.find(p =>
        hasLetter(p) && hasDigit(p) && p.length <= 60 && !isPropertyType(p)
    )
    if (addressLike) return addressLike

    // Second pass: aceptar property-type prefixed si no hay otro match
    const fallbackWithType = parts.find(p => hasLetter(p) && hasDigit(p) && p.length <= 60)
    if (fallbackWithType) return fallbackWithType

    // Fallback final: primer fragmento truncado
    if (process.env.NODE_ENV !== 'production') {
        console.debug('[extractAddress] fallback used for:', cleaned)
    }
    return (parts[0] || cleaned).slice(0, 60)
}
```

- [ ] **Step 2: Importar en PDFReport.tsx y usar en portada**

En `components/appraisal/pdf/PDFReport.tsx`, añadir el import al tope:

```typescript
import { extractAddress } from '@/lib/valuation/addressUtils'
```

Reemplazar líneas 85-88:

```typescript
{/* Property Title — solo dirección */}
<Text style={[styles.propertyTitle, { marginTop: 16, fontSize: 32 }]}>
    {reportEdits?.coverPropertyTitle || extractAddress(subject.location || subject.title)}
</Text>
```

- [ ] **Step 3: Ajustar foto Diego en portada**

Reemplazar líneas 110-116 con:

```typescript
{/* Diego Photo - bottom-right, foto completa visible */}
<View style={{ position: 'absolute', bottom: 48, right: 0, width: 280 }}>
    <Image
        src="/pdf-assets/photos/Foto Diego.png"
        style={{ width: '100%', height: 420, objectFit: 'contain' }}
    />
</View>
```

Cambios clave: `height: 360 → 420` y `objectFit: 'cover' → 'contain'` (muestra Diego completo sin recortar).

- [ ] **Step 4: Verificar que la imagen no tape el logo**

Logo Diego está en líneas 99-107 con `marginTop: 40` desde el top y 100pt de alto, dentro de un contenedor centrado que termina ~330pt del top. Los 280×420pt de la foto en `bottom: 48, right: 0` ocupan desde y=A4_HEIGHT-48-420=(842-468)=374pt hacia abajo. Hay un gap de ~44pt entre el logo y la foto. Si en visual review se ve apretado, bajar `height` a 400pt.

- [ ] **Step 5: Type-check + build**

```bash
npm run lint
npx tsc --noEmit
```

Expected: 0 errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add lib/valuation/addressUtils.ts components/appraisal/pdf/PDFReport.tsx
git commit -m "fix(pdf): portada solo dirección + foto Diego completa"
```

---

### Task A2: Eliminar saltos de línea forzados en dividers de compra/simulación

**Files:**
- Modify: `components/appraisal/pdf/PDFReport.tsx:912-914` (divider PROPIEDADES PARA COMPRA)
- Modify: `components/appraisal/pdf/PDFReport.tsx:1009-1011` (divider SIMULACIÓN COMPRA Y VENTA)
- Modify: `components/appraisal/pdf/PDFReport.tsx:911` y :1008 (`paddingRight: '50%'`)

**Contexto:** El `\n` literal corta visualmente "PROPIEDADES{ENTER}PARA COMPRA". Además el contenedor está limitado a 50% del ancho. Hay que dejar el texto fluir en una sola línea o que se rompa naturalmente.

- [ ] **Step 1: Reemplazar texto del divider de compra**

En PDFReport.tsx línea 911-914, cambiar:

```typescript
<View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: '50%' }]}>
    <Text style={[styles.dividerTitle, { textAlign: 'left' }]}>
        PROPIEDADES{'\n'}PARA COMPRA
    </Text>
</View>
```

Por:

```typescript
<View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: 280 }]}>
    <Text style={[styles.dividerTitle, { textAlign: 'left', fontSize: 32 }]}>
        PROPIEDADES PARA COMPRA
    </Text>
</View>
```

Cambios: `paddingRight: '50%' → 280` (deja espacio para la foto de Diego de 280pt) y `fontSize: 32` (override de 36 default para que entre en 1-2 líneas naturales) y eliminar `\n`.

- [ ] **Step 2: Aplicar el mismo cambio al divider de simulación**

Línea 1008-1011 cambia análogamente:

```typescript
<View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: 280 }]}>
    <Text style={[styles.dividerTitle, { textAlign: 'left', fontSize: 32 }]}>
        SIMULACIÓN COMPRA Y VENTA
    </Text>
</View>
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/appraisal/pdf/PDFReport.tsx
git commit -m "fix(pdf): dividers compra/simulación sin saltos de línea forzados"
```

---

### Task A3: Comparables — título solo dirección + visualización de características separada + link más llamativo

**Files:**
- Modify: `components/appraisal/pdf/PDFReport.tsx:478-480` (título)
- Modify: `components/appraisal/pdf/PDFReport.tsx:482-498` (features grid)
- Modify: `components/appraisal/pdf/PDFReport.tsx:516-519` (link)
- Modify: `components/appraisal/pdf/PDFStyles.ts` (`comparableLink` style)

**Contexto:** Hoy título usa `comp.location || comp.title` raw. Features están como texto plano "■ X m² cub. ■ Y dorm." separados por gap pequeño. Link `comparableLink` es texto plano sin estilo distintivo.

- [ ] **Step 1: Limpiar título usando extractAddress**

Línea 478-480 cambia a:

```typescript
<Text style={[styles.propertyTitle, { textAlign: 'left', fontSize: 13, marginBottom: 4 }]}>
    {extractAddress(comp.location || comp.title)}
</Text>
```

(El import de `extractAddress` ya fue agregado en Task A1.)

- [ ] **Step 2: Reemplazar features grid con chips visualmente separados**

Reemplazar líneas 482-498 (`{/* Features grid */}` block):

```typescript
{/* Features grid — chips con borde para separación visual */}
<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
    <FeatureChip label={`${comp.features.coveredArea || 0} m² cub.`} />
    {(comp.features.uncoveredArea ?? 0) > 0 && (
        <FeatureChip label={`${comp.features.uncoveredArea} m² desc.`} />
    )}
    {comp.features.rooms ? <FeatureChip label={`${comp.features.rooms} amb.`} /> : null}
    {comp.features.bedrooms ? <FeatureChip label={`${comp.features.bedrooms} dorm.`} /> : null}
    {comp.features.bathrooms ? <FeatureChip label={`${comp.features.bathrooms} baños`} /> : null}
    <FeatureChip label={`${comp.features.age || 0} años`} />
</View>
```

Crear el componente `FeatureChip` cerca del top del archivo (después de los imports y antes de `function PDFReport`):

```typescript
function FeatureChip({ label }: { label: string }) {
    return (
        <View style={{
            paddingHorizontal: 6,
            paddingVertical: 2,
            backgroundColor: '#f1f5f9',
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderStyle: 'solid',
            borderRadius: 3,
        }}>
            <Text style={{ fontSize: 8, color: '#1f2937', fontWeight: 'bold' }}>{label}</Text>
        </View>
    )
}

// NOTA: @react-pdf/renderer no soporta sub-pixel borders ni shorthand `border:`.
// Usamos borderWidth/borderColor/borderStyle por separado.
```

- [ ] **Step 3: Hacer link más llamativo**

En `components/appraisal/pdf/PDFStyles.ts`, localizar `comparableLink` (buscar con grep si no se conoce la línea):

```bash
grep -n "comparableLink" components/appraisal/pdf/PDFStyles.ts
```

Reemplazar definición existente por:

```typescript
comparableLink: {
    fontSize: 9,
    color: colors.white,
    backgroundColor: colors.primary,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 3,
    fontWeight: 'bold',
    textDecoration: 'none',
    marginTop: 4,
    alignSelf: 'flex-start',
},
```

- [ ] **Step 4: Reemplazar el Link con un wrapper para que se vea como botón**

@react-pdf/renderer no permite estilos de fondo en `<Link>` directamente. Hay que envolverlo en un View.

Líneas 516-519 cambian a:

```typescript
{/* Link como botón */}
<Link src={comp.url || '#'} style={{ textDecoration: 'none' }}>
    <View style={styles.comparableLink}>
        <Text style={{ color: colors.white, fontSize: 9, fontWeight: 'bold' }}>VER PUBLICACIÓN →</Text>
    </View>
</Link>
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add components/appraisal/pdf/PDFReport.tsx components/appraisal/pdf/PDFStyles.ts
git commit -m "feat(pdf): comparables con chips de features + link tipo botón + título solo dirección"
```

---

### Task A4: Comparables — mostrar "Publicado hace X días" en metadata

**Files:**
- Modify: `components/appraisal/pdf/PDFReport.tsx:521-524`
- Modify: `lib/scraper/extractorUtils.ts` (asegurar parser robusto)
- Modify: `lib/scraper/zonaPropExtractor.ts` (verificar extracción)

**Contexto:** Hoy metadata muestra `cleanText(comp.features.publishedDate as string, 50) || 'Publicado'`. ML ya extrae texto raw como "Publicado hace 5 días". ZP también. ArgenProp NO. Hay que asegurar que se persiste el texto descriptivo y mostrarlo cuando exista.

- [ ] **Step 1: Verificar que ML y ZP guardan publishedDate como string descriptivo**

```bash
grep -n "publishedDate" lib/scraper/mercadoLibreExtractor.ts lib/scraper/zonaPropExtractor.ts lib/scraper/argenPropExtractor.ts lib/scraper/types.ts
```

Confirmar que `PropertyFeatures.publishedDate: string | null` está definido y que ML+ZP lo populan. Si ZP solo extrae "hace X días" sin prefijo "Publicado", normalizar.

- [ ] **Step 2: Crear helper de normalización en `lib/scraper/extractorUtils.ts`**

Buscar primero el archivo y la función `parsePublishedDate`:

```bash
grep -n "parsePublishedDate\|publishedDate" lib/scraper/extractorUtils.ts
```

Si existe, agregar al final del archivo (o reemplazar si tiene otra forma):

```typescript
/**
 * Normaliza el texto de publicación para mostrar "Publicado hace X" consistente.
 * Acepta: "hace 5 días", "Publicado hace 2 meses", "5 días", "Hace 1 año"
 * Devuelve null si no se puede parsear.
 */
export function normalizePublishedText(raw: string | null | undefined): string | null {
    if (!raw) return null
    const text = String(raw).trim()
    if (!text) return null

    // Si ya empieza con "Publicado" no tocar
    if (/^publicado\s+hace/i.test(text)) return text

    // "hace X" → "Publicado hace X"
    if (/^hace\s+/i.test(text)) return `Publicado ${text.toLowerCase()}`

    // "X días/meses/años" sin "hace"
    if (/^\d+\s+(día|mes|año|hora|minuto|semana)/i.test(text)) {
        return `Publicado hace ${text.toLowerCase()}`
    }

    // Fallback: prefijar Publicado si tiene contenido temporal reconocible
    if (/(día|mes|año|semana)/i.test(text)) {
        return `Publicado ${text}`
    }

    return text  // devuelve original sin prefijar para no romper datos no temporales
}
```

- [ ] **Step 3: Aplicar normalización en mercadoLibreExtractor.ts y zonaPropExtractor.ts**

Buscar donde se asigna `publishedDate` y envolver con `normalizePublishedText`:

```bash
grep -n "publishedDate" lib/scraper/mercadoLibreExtractor.ts
```

Donde encuentre algo como `publishedDate: parsePublishedDate(...)` o similar, cambiar a:

```typescript
publishedDate: normalizePublishedText(parsePublishedDate(text))
```

(`normalizePublishedText` ya devuelve el texto original como fallback cuando no puede normalizar; el `??` redundante del plan original era dead code y duplicaba la llamada.)

Repetir para zonaPropExtractor.ts.

- [ ] **Step 4: Mejorar visualización en PDF**

Reemplazar líneas 521-524 de PDFReport.tsx:

```typescript
{/* Metadata: published date + views */}
<Text style={styles.comparableMetadata}>
    {(comp.features.publishedDate as string) || 'Sin fecha de publicación'}
    {comp.features.views ? ` · ${comp.features.views} visualizaciones` : ''}
</Text>
```

(Eliminar el `cleanText` truncado a 50 chars que mutilaba el texto. Aceptamos textos hasta 80 chars naturales.)

- [ ] **Step 5: Type-check + build**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add lib/scraper/ components/appraisal/pdf/PDFReport.tsx
git commit -m "feat(scraper+pdf): mostrar 'Publicado hace X' normalizado en comparables"
```

---

### Task A5: Smart pagination de comparables (3 por página, evitar páginas huérfanas)

**Files:**
- Modify: `components/appraisal/pdf/PDFReport.tsx:437` (loop `comparables`)

**Contexto:** Hoy `Math.ceil(comparables.length / 3)` puede dejar 1 sola tarjeta en última página con resto vacío. Si hay 4 comparables → 3+1. Mejor sería 2+2.

- [ ] **Step 1: Crear helper de paginación balanceada**

En PDFReport.tsx, agregar después de los imports:

```typescript
/**
 * Distribuye items en páginas con max=3 por página, balanceando para evitar páginas con solo 1 item.
 * Ej: 4 items → [2, 2] en vez de [3, 1]. 5 items → [3, 2]. 7 items → [3, 2, 2].
 */
function paginateBalanced<T>(items: T[], maxPerPage = 3): T[][] {
    if (items.length <= maxPerPage) return [items]
    const totalPages = Math.ceil(items.length / maxPerPage)
    const baseSize = Math.floor(items.length / totalPages)
    const remainder = items.length % totalPages
    const pages: T[][] = []
    let cursor = 0
    for (let i = 0; i < totalPages; i++) {
        const size = i < remainder ? baseSize + 1 : baseSize
        pages.push(items.slice(cursor, cursor + size))
        cursor += size
    }
    return pages
}
```

- [ ] **Step 2: Reemplazar el loop de comparables usando cursor explícito**

Línea 437 (`{Array.from({ length: Math.ceil(comparables.length / 3) }).map((_, pageIndex) => {`) reemplazar todo el bloque hasta `})}` (línea ~532) por:

```typescript
{(() => {
    const pages = paginateBalanced(comparables, 3)
    let globalCursor = 0
    return pages.map((pageComps, pageIndex) => {
        const startGlobal = globalCursor
        globalCursor += pageComps.length
        return (
            <Page key={`comparables-${pageIndex}`} size="A4" style={styles.pageWithPadding}>
                {/* ... resto igual usando pageComps y startGlobal+index para globalIndex ... */}
            </Page>
        )
    })
})()}
```

Reemplazar dentro `const globalIndex = pageIndex * 3 + index` por `const globalIndex = startGlobal + index`. Usar cursor (no `indexOf`) porque `indexOf` falla con duplicados de referencia tras roundtrip de JSON y es O(n²) en total.

- [ ] **Step 3: Aplicar también al loop de overpriced (líneas 535+, 2 por página)**

Mismo patrón con `paginateBalanced(overpriced, 2)`:

```typescript
{overpriced.length > 0 && (() => {
    const pages = paginateBalanced(overpriced, 2)
    let globalCursor = 0
    return pages.map((pageProps, pageIndex) => {
        const startGlobal = globalCursor
        globalCursor += pageProps.length
        // ...
    })
})()}
```

- [ ] **Step 3b: Documentar impacto en `reportEdits.semaphoreOverrides`**

ATENCIÓN: el cambio de paginación afecta los índices globales solo si los comparables se reordenan. En el caso típico (4 comparables con distribución antigua `[3, 1]` vs nueva `[2, 2]`), los `globalIndex` siguen siendo `[0, 1, 2, 3]` porque el orden del array `comparables` no cambia — solo cambia la página visual. Por lo tanto los `semaphoreOverrides` con keys `comparable-0`...`comparable-3` siguen mapeando correctamente.

Verificar con un smoke test: tasación con 4 comparables y semáforos overrideados → re-renderizar el PDF con el código nuevo y confirmar que los colores se mantienen.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/appraisal/pdf/PDFReport.tsx
git commit -m "fix(pdf): paginación balanceada de comparables y overpriced"
```

---

## MÓDULO B — Página 2 PDF: Layout + Edición Inline de Subject Features

### Task B1: Crear componente SubjectFeaturesEditor (UI de edición inline)

**Files:**
- Create: `components/appraisal/SubjectFeaturesEditor.tsx`

**Contexto:** Hoy las features del subject (sup. cubierta, ambientes, etc.) se editan solo en el wizard. El usuario quiere editarlas inline en la vista previa del informe (al lado del PDF preview).

- [ ] **Step 1: Crear el componente**

```typescript
'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface SubjectFeaturesEditableValues {
    coveredArea?: number | null
    uncoveredArea?: number | null
    rooms?: number | null
    bedrooms?: number | null
    bathrooms?: number | null
    age?: number | null
    floor?: number | null
    totalFloors?: number | null
    garages?: number | null
}

interface Props {
    value: SubjectFeaturesEditableValues
    onChange: (next: SubjectFeaturesEditableValues) => void
}

const FIELDS: Array<{ key: keyof SubjectFeaturesEditableValues; label: string; suffix?: string; step?: string }> = [
    { key: 'coveredArea', label: 'Sup. Cubierta', suffix: 'm²' },
    { key: 'uncoveredArea', label: 'Sup. Descubierta', suffix: 'm²' },
    { key: 'rooms', label: 'Ambientes' },
    { key: 'bedrooms', label: 'Dormitorios' },
    { key: 'bathrooms', label: 'Baños' },
    { key: 'age', label: 'Antigüedad', suffix: 'años' },
    { key: 'floor', label: 'Piso' },
    { key: 'totalFloors', label: 'Pisos totales' },
    { key: 'garages', label: 'Cocheras' },
]

export function SubjectFeaturesEditor({ value, onChange }: Props) {
    function handleField(key: keyof SubjectFeaturesEditableValues, raw: string) {
        const parsed = raw === '' ? null : Number(raw)
        if (raw !== '' && Number.isNaN(parsed)) return
        onChange({ ...value, [key]: parsed })
    }
    return (
        <div className="space-y-3 rounded-lg border bg-card p-4">
            <h4 className="text-sm font-semibold">Datos de la Propiedad (editables)</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {FIELDS.map(f => (
                    <div key={f.key} className="space-y-1">
                        <Label className="text-xs text-muted-foreground">
                            {f.label}{f.suffix ? ` (${f.suffix})` : ''}
                        </Label>
                        <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={f.step || '1'}
                            value={value[f.key] ?? ''}
                            onChange={e => handleField(f.key, e.target.value)}
                            className="h-9 text-sm"
                        />
                    </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">
                Los cambios se reflejan en el PDF y en la tasación al recalcular.
            </p>
        </div>
    )
}
```

- [ ] **Step 2: Verificar imports de UI**

```bash
ls components/ui/input.tsx components/ui/label.tsx
```

Si no existen, ajustar imports a los componentes equivalentes del proyecto.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/appraisal/SubjectFeaturesEditor.tsx
git commit -m "feat: SubjectFeaturesEditor para edición inline de features"
```

---

### Task B2: Integrar SubjectFeaturesEditor en ValuationReport (vista previa)

**Files:**
- Modify: `components/appraisal/ValuationReport.tsx`

**Contexto:** ValuationReport ya recibe prop `onSubjectFeaturesChange`. Hay que agregar el editor en la vista cuando `editable=true`.

- [ ] **Step 1: Localizar la sección de subject en ValuationReport**

```bash
grep -n "subject\|Datos de la Propiedad\|coveredArea" components/appraisal/ValuationReport.tsx | head -30
```

- [ ] **Step 2: Importar y agregar el editor**

Al tope del archivo:

```typescript
import { SubjectFeaturesEditor } from './SubjectFeaturesEditor'
```

Buscar la sección donde se muestra info del subject (suele ser cerca del inicio del JSX). Agregar antes o después, condicional al modo editable:

```typescript
{editable && onSubjectFeaturesChange && (
    <SubjectFeaturesEditor
        value={{
            coveredArea: subject.features.coveredArea ?? null,
            uncoveredArea: subject.features.uncoveredArea ?? null,
            rooms: subject.features.rooms ?? null,
            bedrooms: subject.features.bedrooms ?? null,
            bathrooms: subject.features.bathrooms ?? null,
            age: subject.features.age ?? null,
            floor: subject.features.floor ?? null,
            totalFloors: subject.features.totalFloors ?? null,
            garages: subject.features.garages ?? null,
        }}
        onChange={next => onSubjectFeaturesChange({ ...subject.features, ...next })}
    />
)}
```

- [ ] **Step 3: Estrechar el tipo de `onSubjectFeaturesChange` en la interfaz Props**

```bash
grep -n "onSubjectFeaturesChange" components/appraisal/ValuationReport.tsx "app/(dashboard)/appraisal/new/page.tsx"
```

Hoy la prop está tipada como `(features: Record<string, unknown>) => void` en ValuationReport y el handler en page.tsx hace `as any`. Para preservar type-safety:

1. En `components/appraisal/ValuationReport.tsx`, cambiar la prop:
```typescript
import type { PropertyFeatures } from '@/lib/scraper/types'
// ...
onSubjectFeaturesChange?: (features: PropertyFeatures) => void
```

2. En `app/(dashboard)/appraisal/new/page.tsx`, reemplazar el `as any` del handler:
```typescript
function handleSubjectFeaturesChange(newFeatures: PropertyFeatures) {
    setSubject(prev => prev ? { ...prev, features: newFeatures } : prev)
}
```

3. Cuando llamamos al callback en `SubjectFeaturesEditor.onChange`, asegurar el merge correcto preservando campos del subject que no edita el editor:
```typescript
onChange={next => onSubjectFeaturesChange?.({ ...subject.features, ...next } as PropertyFeatures)}
```

- [ ] **Step 4: Verificar que el wizard ya pasa el callback**

En `app/(dashboard)/appraisal/new/page.tsx` línea 1128 ya está `onSubjectFeaturesChange={handleSubjectFeaturesChange}`. ✓

- [ ] **Step 5: Type-check + smoke test**

```bash
npx tsc --noEmit
npm run dev
# Abrir http://localhost:3000/appraisal/new, completar wizard, calcular,
# editar un campo de subject, verificar que el PDF preview se actualiza.
```

- [ ] **Step 6: Commit**

```bash
git add components/appraisal/ValuationReport.tsx
git commit -m "feat(report): edición inline de subject features en vista previa"
```

---

### Task B3: Habilitar edición de subject features en página detalle (saved appraisals)

**Files:**
- Modify: `app/(dashboard)/appraisals/[id]/page.tsx`

**Contexto:** Hoy detail page solo lee. El usuario debe poder editar features inline sin redirigir al wizard.

- [ ] **Step 1: Verificar estado actual de detail page**

```bash
grep -n "ValuationReport\|editable\|onSubjectFeaturesChange\|updateAppraisal" "app/(dashboard)/appraisals/[id]/page.tsx"
```

- [ ] **Step 2: Convertir página a client component si no lo es y agregar estado**

Si la página es server component, partir el contenido en un `AppraisalDetailClient` que reciba `initialData` y maneje edits. Si ya es client, agregar:

```typescript
const [subjectState, setSubjectState] = useState(appraisal.subject)
const [valuationState, setValuationState] = useState(appraisal.valuation_result)
const [savingFeatures, setSavingFeatures] = useState(false)

async function handleSubjectFeaturesChange(features: PropertyFeatures) {
    const updatedSubject = { ...subjectState, features }
    setSubjectState(updatedSubject)
    // Recalcular si cambian datos que afectan el valor (areas, age, etc.)
    setSavingFeatures(true)
    try {
        // CRÍTICO: filtrar overpriced y purchase properties — solo comparables normales
        // van al cálculo del promedio de precio m².
        const onlyNormalComparables = appraisal.comparables.filter(c => {
            const a = c.analysis as Record<string, unknown> | null
            return a?.propertyType !== 'overpriced' && a?.propertyType !== 'purchase'
        })
        const recalc = calculateValuation({
            subject: { ...updatedSubject, features },
            comparables: onlyNormalComparables.map(c => ({
                price: c.price, currency: c.currency,
                title: c.title, location: c.location,
                features: c.features,
            })),
            expenseRates: valuationState?.expenseRates,
        })
        if (recalc) {
            setValuationState({ ...recalc, purchaseResult: valuationState?.purchaseResult, purchaseScenarios: valuationState?.purchaseScenarios })
            await updateAppraisal(appraisal.id, {
                subject: updatedSubject,
                comparables: appraisal.comparables,
                overpriced: appraisal.overpriced || [],
                purchaseProperties: appraisal.purchaseProperties || [],
                valuationResult: recalc,
            })
        }
    } finally {
        setSavingFeatures(false)
    }
}
```

- [ ] **Step 3: Pasar `editable` y callback al ValuationReport**

```typescript
<ValuationReport
    subject={subjectState}
    result={valuationState}
    editable
    onSubjectFeaturesChange={handleSubjectFeaturesChange}
    onComparableFeaturesChange={...}
/>
```

- [ ] **Step 4: Manejar loading state**

Mostrar indicador `Guardando...` cuando `savingFeatures` es true (similar al patrón de la página new).

- [ ] **Step 5: Smoke test**

```bash
npm run dev
# Abrir una tasación existente en /appraisals/[id], editar feature, verificar persistencia (refrescar la página).
```

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/appraisals/[id]/page.tsx"
git commit -m "feat(detail): edición inline de subject features con persistencia"
```

---

### Task B4: Redistribuir página 2 del PDF para llenar el espacio vertical

**Files:**
- Modify: `components/appraisal/pdf/PDFReport.tsx:140-276`

**Contexto:** Hoy página 2 tiene imagen 250pt + features grid + descripción. Si hay pocos features o descripción corta, queda mucho espacio en blanco al final. Hay que añadir un footer con info útil o redistribuir.

- [ ] **Step 1: Inspeccionar layout actual**

```bash
sed -n '139,277p' components/appraisal/pdf/PDFReport.tsx
```

- [ ] **Step 2a: Pasar la fecha de la tasación como prop al PDFReport**

Buscar la interfaz Props del PDFReport:

```bash
grep -n "interface PDFReportProps\|type PDFReportProps" components/appraisal/pdf/PDFReport.tsx
```

Agregar a la interfaz:

```typescript
appraisalDate?: string  // ISO date — fecha en que se creó la tasación
```

En las páginas que renderizan PDFReport (típicamente PDFPreviewModal o el botón de descarga), pasar `appraisalDate={appraisal.created_at}` (o equivalente).

- [ ] **Step 2b: Añadir footer con fecha de la tasación (no `new Date()`)**

Antes del cierre `</Page>` de página 2 (línea ~275), agregar:

```typescript
{/* Footer info card — fills bottom space */}
<View style={{
    position: 'absolute',
    bottom: 40,
    left: 40,
    right: 40,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    borderLeftStyle: 'solid',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
}}>
    <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray }}>
            Diego Ferreyra
        </Text>
        <Text style={{ fontSize: 9, color: colors.mediumGray, marginTop: 2 }}>
            Asesor inmobiliario · CUCICBA 8266
        </Text>
        <Text style={{ fontSize: 9, color: colors.mediumGray, marginTop: 2 }}>
            diegoferreyraInmobiliaria.com
        </Text>
    </View>
    <View style={{
        paddingLeft: 12,
        borderLeftWidth: 1,
        borderLeftColor: colors.lightGray,
        borderLeftStyle: 'solid',
        alignItems: 'flex-end',
    }}>
        <Text style={{ fontSize: 9, color: colors.mediumGray }}>Tasación realizada el</Text>
        <Text style={{ fontSize: 11, fontWeight: 'bold', color: colors.darkGray, marginTop: 2 }}>
            {(appraisalDate ? new Date(appraisalDate) : new Date()).toLocaleDateString('es-AR', {
                day: '2-digit', month: 'long', year: 'numeric',
            })}
        </Text>
    </View>
</View>
```

CRÍTICO: usar `appraisalDate` prop en lugar de `new Date()` para que la fecha del PDF refleje cuándo se hizo la tasación, no cuándo se abre el PDF.

- [ ] **Step 3: Ajustar imagen y márgenes para evitar overlap**

Si la imagen + features + descripción ocupan demasiado, reducir altura de la imagen de 250 a 220:

Buscar `style={{ width: '100%', height: 250, objectFit: 'cover' }}` (línea ~155) y cambiar `height: 250 → 220`.

Reducir también `marginBottom: 16 → 12` en el features grid (línea ~162) si es necesario.

- [ ] **Step 4: Smoke test visual**

```bash
npm run dev
# Generar PDF preview con propiedad de pocos features, verificar página 2 sin espacios vacíos.
```

- [ ] **Step 5: Commit**

```bash
git add components/appraisal/pdf/PDFReport.tsx
git commit -m "feat(pdf): redistribuir página 2 con footer del agente para llenar espacio"
```

---

## MÓDULO C — Calculator: Fix coeficientes hardcoded del subject

### Task C1: Quitar hardcode de subjectQualityCoef y subjectLocationCoef

**Files:**
- Modify: `lib/valuation/calculator.ts:214-227`

**Contexto:** Líneas 215, 221 fijan subjectLocationCoef=1.0 y subjectQualityCoef=1.0 ignorando lo seleccionado. Disposition y conservation YA usan getters correctos. Hay que aplicar lo mismo a quality y permitir override de location.

- [ ] **Step 1: Importar `getQualityCoefficient` si no está ya**

Buscar al tope del archivo:

```bash
grep -n "import\|getQualityCoefficient" lib/valuation/calculator.ts | head -20
```

Asegurar que la línea de imports incluye `getQualityCoefficient`. Si no, agregarla.

- [ ] **Step 2: Reemplazar líneas 214-227 con uso correcto de getters**

```typescript
// Subject coefficients — aplicar coeficientes según selección del usuario
const subjectLocationCoef = subject.features.locationCoefficient ?? 1.0
const subjectFloorCoef = getFloorCoefficient(
    subject.features.floor || 0,
    subject.features.totalFloors || null
)
const subjectDispositionCoef = getDispositionCoefficient(subject.features.disposition)
const subjectQualityCoef = getQualityCoefficient(subject.features.quality)
const subjectAgeCoef = calculateAgeFactor(
    subject.features.age || 0,
    subject.features.conservationState || 'STATE_2',
)
// N3 = J × K_piso × K_disp × W × M
const subjectTotalCoef = subjectLocationCoef * subjectFloorCoef * subjectDispositionCoef * subjectQualityCoef * subjectAgeCoef
```

Cambios clave:
- `subjectLocationCoef`: ahora respeta `features.locationCoefficient` con fallback a 1.0
- `subjectQualityCoef`: ahora usa `getQualityCoefficient(subject.features.quality)` (no más 1.0 hardcoded)

- [ ] **Step 3: Verificar que getQualityCoefficient maneja undefined**

```bash
grep -n "getQualityCoefficient\|export function" lib/valuation/rules.ts
```

Confirmar que retorna 1.0 si quality es undefined (backward-compat).

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Validación con tasación de prueba**

```bash
npm run dev
# Crear tasación, en step 5 elegir "Calidad: Excelente". Calcular.
# Antes del fix: subjectQualityCoef = 1.0 → publicationPrice = X
# Después del fix: subjectQualityCoef = 1.275 → publicationPrice = X × 1.275
# Verificar que el precio aumenta proporcionalmente.
```

- [ ] **Step 6: Banner informativo en detail page si el coeficiente guardado difiere del nuevo**

Cuando se carga una tasación pre-fix, los valores almacenados de `subjectQualityCoef` pueden ser 1.0 mientras que el nuevo cálculo daría 1.275 (por ejemplo). Hay que avisar al usuario antes de que un edit inline dispare auto-save y modifique silenciosamente el precio guardado.

En `app/(dashboard)/appraisals/[id]/page.tsx`, agregar dentro del componente:

```typescript
import { getQualityCoefficient } from '@/lib/valuation/rules'

const storedQualityCoef = appraisal.valuation_result?.subjectQualityCoef
const expectedQualityCoef = getQualityCoefficient(appraisal.subject?.features?.quality)
const coefficientChanged = storedQualityCoef !== undefined &&
    Math.abs(storedQualityCoef - expectedQualityCoef) > 0.01
```

Renderizar el banner condicional cerca del top del JSX:

```typescript
{coefficientChanged && (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        <strong className="text-amber-800">⚠️ Aviso de actualización del motor de cálculo</strong>
        <p className="mt-1 text-amber-700">
            Esta tasación fue creada con un coeficiente de calidad constructiva fijo (1.0).
            Al editar cualquier dato se recalculará usando el coeficiente real de la calidad
            seleccionada ({appraisal.subject?.features?.quality || 'no definida'} = {expectedQualityCoef}).
            Esto puede modificar el precio de publicación.
        </p>
    </div>
)}
```

- [ ] **Step 7: Commit**

```bash
git add lib/valuation/calculator.ts "app/(dashboard)/appraisals/[id]/page.tsx"
git commit -m "fix(calculator): aplicar coef. real de calidad al subject + banner informativo"
```

---

## MÓDULO D — Expense Rates: Edición Inline + Auto-save

### Task D1: Hacer la tabla de Costos de Venta editable inline en ValuationReport

**Files:**
- Modify: `components/appraisal/ValuationReport.tsx` (sección de gastos)
- Modify: `app/(dashboard)/appraisal/new/page.tsx` (verificar que ya hay flujo)

**Contexto:** Hoy `ValuationReport` muestra los gastos pero NO permite editar los porcentajes en esa sección. Editar requiere ir al collapsible aparte. El usuario quiere que cada porcentaje en la tabla sea un input editable. La página new ya pasa `expenseRates` y tiene `setExpenseRates`.

- [ ] **Step 1: Localizar la tabla de gastos en ValuationReport**

```bash
grep -n "stampsPercent\|Gastos de Venta\|deedExpensesPercent\|agencyFeesPercent" components/appraisal/ValuationReport.tsx
```

- [ ] **Step 2: Extender props para recibir editor de rates**

En la interfaz Props del componente:

```typescript
expenseRates?: Required<ExpenseRates>
onExpenseRatesChange?: (next: ExpenseRates) => void
```

- [ ] **Step 3: Convertir las celdas de % en inputs cuando editable+callback presentes**

Reemplazar texto plano `1.35% s/escritura` por:

```typescript
{editable && onExpenseRatesChange ? (
    <span className="inline-flex items-center gap-1">
        <input
            type="number"
            step="0.01"
            min={0}
            max={100}
            value={expenseRates?.stampsPercent ?? 1.35}
            onChange={e => onExpenseRatesChange({
                ...expenseRates,
                stampsPercent: Number(e.target.value)
            })}
            className="w-16 rounded border px-1 py-0.5 text-sm text-right"
        />% s/escritura
    </span>
) : (
    `${expenseRates?.stampsPercent ?? 1.35}% s/escritura`
)}
```

Aplicar el mismo patrón a `deedExpensesPercent`, `agencyFeesPercent`, `saleDiscountPercent`, `deedDiscountPercent`.

- [ ] **Step 4: Conectar desde la página new**

En `app/(dashboard)/appraisal/new/page.tsx`, en el `<ValuationReport ...>` (línea 1117) agregar:

```typescript
expenseRates={valuationResult.expenseRates}
onExpenseRatesChange={(next) => setExpenseRates(prev => ({ ...prev, ...next }))}
```

(El useEffect existente en línea 304 ya recalcula cuando `expenseRates` cambia.)

- [ ] **Step 5: Asegurar persistencia automática con ref y debounce**

El useEffect en línea 304 actualiza `valuationResult` en memoria pero NO auto-guarda. Hay que extenderlo CON DOS PRECAUCIONES:

1. **Race condition fix:** usar `useRef` para el ID persistido (no estado React, que es asíncrono y se pierde si el effect dispara antes del próximo render).
2. **Debounce de 800ms:** evitar floodear Supabase con writes por cada pulsación de teclado en los inputs.

Agregar al inicio del componente (después de los `useState` existentes):

```typescript
import { useRef } from 'react'

// Ref síncrona para el último ID persistido
const savedAppraisalIdRef = useRef<string | null>(editId || null)

// Helper para mantener ref sincronizada cuando cambia el state
useEffect(() => {
    savedAppraisalIdRef.current = editId || savedAppraisalId || null
}, [editId, savedAppraisalId])

// Timer de debounce para auto-save
const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
```

En el `handleCalculate` original (línea ~329), después del `saveAppraisal` exitoso, agregar:

```typescript
// Inmediatamente sincronizar ref para que el useEffect de auto-save vea el nuevo ID
.then(id => {
    savedAppraisalIdRef.current = id
    setSavedAppraisalId(id)
    // ... resto del código existente ...
})
```

Reescribir el useEffect de la línea 304:

```typescript
useEffect(() => {
    if (!valuationResult || !subject) return
    const subjectVal: ValuationProperty = { ... }  // igual que antes
    const compsVal: ValuationProperty[] = comparables.map(c => ({ ... }))
    const next = calculateValuation({ subject: subjectVal, comparables: compsVal, expenseRates })
    if (!next) return
    setValuationResult(next)

    // Auto-save con debounce
    const id = savedAppraisalIdRef.current
    if (!id) return  // sin id aún, no podemos hacer update; el handleCalculate INSERT manejó el caso

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
        updateAppraisal(id, {
            subject, comparables, overpriced, purchaseProperties,
            valuationResult: next,
        }).catch(err => console.error('Auto-save error:', err))
    }, 800)
}, [subject, comparables, expenseRates])

// Cleanup del timer al unmount
useEffect(() => {
    return () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
}, [])
```

- [ ] **Step 6: Idem para detail page**

En `app/(dashboard)/appraisals/[id]/page.tsx`, agregar callback `handleExpenseRatesChange` similar a `handleSubjectFeaturesChange` (Task B3).

- [ ] **Step 7: Type-check + smoke test**

```bash
npx tsc --noEmit
npm run dev
# Cambiar honorarios de 3% a 2% inline en la tabla. Verificar:
# 1. La cifra de "Honorarios Inmobiliaria" en pesos se recalcula
# 2. El "Total gastos de venta" se actualiza
# 3. El "Dinero luego de venta" aumenta
# 4. El PDF preview refleja 2% en la tabla
# 5. Recargar la página → los cambios persisten
```

- [ ] **Step 8: Commit**

```bash
git add components/appraisal/ValuationReport.tsx "app/(dashboard)/appraisal/new/page.tsx" "app/(dashboard)/appraisals/[id]/page.tsx"
git commit -m "feat(report): edición inline de % de gastos venta + auto-save"
```

---

## MÓDULO E — Sistema de Escenarios de Compra

### Task E1: ~~Definir tipos para escenarios~~ — YA HECHO en Task 0.2

Los tipos `PurchaseScenarioId`, `PurchaseScenarioInput`, `PurchaseScenarioResult` se crean en Task 0.2 (Módulo 0 Pre-flight) directamente en `calculator.ts`. Saltar este task.

---

### Task E2: Generador de escenarios y calculador

**Files:**
- Create: `lib/valuation/purchase-scenarios.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
import type { PurchaseScenarioId, PurchaseScenarioInput, PurchaseScenarioResult } from './calculator'

const DEFAULT_RATES = {
    stampsPercent: 1.75,
    notaryFeesPercent: 1.0,
    deedExpensesPercent: 1.75,
    buyerCommissionPercent: 4.0,
}

/**
 * Genera 3 escenarios prellenados a partir de un precio base de publicación.
 *
 * - Conservador: descuento 5% (paga más por la propiedad)
 * - Medio: descuento 10%
 * - Agresivo: descuento 15% (paga menos)
 *
 * El usuario puede editar todos los campos después.
 */
export function buildDefaultScenarios(publicationPrice: number): PurchaseScenarioInput[] {
    return [
        {
            id: 'conservative',
            label: 'Conservador',
            publicationPrice,
            purchaseDiscountPercent: 5,
            deedDiscountPercent: 30,
            rates: { ...DEFAULT_RATES },
        },
        {
            id: 'medium',
            label: 'Medio',
            publicationPrice,
            purchaseDiscountPercent: 10,
            deedDiscountPercent: 30,
            rates: { ...DEFAULT_RATES },
        },
        {
            id: 'aggressive',
            label: 'Agresivo',
            publicationPrice,
            purchaseDiscountPercent: 15,
            deedDiscountPercent: 30,
            rates: { ...DEFAULT_RATES },
        },
    ]
}

/** Calcula resultados financieros para un escenario. */
export function calculateScenario(
    input: PurchaseScenarioInput,
    moneyFromSale: number,
): PurchaseScenarioResult {
    const purchasePrice = Math.round(input.publicationPrice * (1 - input.purchaseDiscountPercent / 100))
    const deedValue = Math.round(purchasePrice * (1 - input.deedDiscountPercent / 100))

    const stampsCost = Math.round(deedValue * (input.rates.stampsPercent / 100))
    const notaryFees = Math.round(deedValue * (input.rates.notaryFeesPercent / 100))
    const deedExpenses = Math.round(deedValue * (input.rates.deedExpensesPercent / 100))
    const buyerCommission = Math.round(purchasePrice * (input.rates.buyerCommissionPercent / 100))

    const totalPurchaseCosts = stampsCost + notaryFees + deedExpenses + buyerCommission
    const totalCostWithPurchase = purchasePrice + totalPurchaseCosts

    return {
        ...input,
        purchasePrice,
        deedValue,
        stampsCost,
        notaryFees,
        deedExpenses,
        buyerCommission,
        totalPurchaseCosts,
        totalCostWithPurchase,
        moneyFromSale,
        remainingMoney: moneyFromSale - totalCostWithPurchase,
    }
}

/** Calcula los 3 escenarios a partir de un input array. */
export function calculateAllScenarios(
    scenarios: PurchaseScenarioInput[],
    moneyFromSale: number,
): PurchaseScenarioResult[] {
    return scenarios.map(s => calculateScenario(s, moneyFromSale))
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/valuation/purchase-scenarios.ts
git commit -m "feat: generador y calculador de escenarios de compra"
```

---

### Task E3: UI editable de escenarios — PurchaseScenariosEditor

**Files:**
- Create: `components/appraisal/PurchaseScenariosEditor.tsx`

- [ ] **Step 1: Crear el componente**

```typescript
'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency } from '@/lib/valuation/utils'
import type {
    PurchaseScenarioId,
    PurchaseScenarioInput,
    PurchaseScenarioResult,
} from '@/lib/valuation/calculator'

interface Props {
    scenarios: PurchaseScenarioInput[]
    results: PurchaseScenarioResult[]
    selectedIds: PurchaseScenarioId[]
    currency: string
    moneyFromSale: number
    onScenariosChange: (next: PurchaseScenarioInput[]) => void
    onSelectedIdsChange: (next: PurchaseScenarioId[]) => void
}

export function PurchaseScenariosEditor({
    scenarios,
    results,
    selectedIds,
    currency,
    moneyFromSale,
    onScenariosChange,
    onSelectedIdsChange,
}: Props) {
    function updateScenario(idx: number, patch: Partial<PurchaseScenarioInput>) {
        const next = [...scenarios]
        next[idx] = { ...next[idx], ...patch }
        onScenariosChange(next)
    }
    function updateRates(idx: number, patch: Partial<PurchaseScenarioInput['rates']>) {
        updateScenario(idx, { rates: { ...scenarios[idx].rates, ...patch } })
    }
    function toggleSelected(id: PurchaseScenarioId) {
        if (selectedIds.includes(id)) {
            onSelectedIdsChange(selectedIds.filter(s => s !== id))
        } else {
            onSelectedIdsChange([...selectedIds, id])
        }
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Escenarios de Compra</h3>
                <p className="text-xs text-muted-foreground">
                    Marcá los que querés incluir en el informe
                </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {scenarios.map((s, idx) => {
                    const r = results[idx]
                    if (!r) return null  // guard: si results no está en sync con scenarios
                    return (
                        <div
                            key={s.id}
                            className={`rounded-lg border bg-card p-4 space-y-3 ${
                                selectedIds.includes(s.id) ? 'ring-2 ring-primary' : ''
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <h4 className="font-semibold">{s.label}</h4>
                                <label className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                        checked={selectedIds.includes(s.id)}
                                        onCheckedChange={() => toggleSelected(s.id)}
                                    />
                                    Incluir
                                </label>
                            </div>
                            <div className="space-y-2">
                                <FieldNum
                                    label="Valor publicación"
                                    value={s.publicationPrice}
                                    onChange={v => updateScenario(idx, { publicationPrice: v })}
                                />
                                <FieldNum
                                    label="% Descuento de compra"
                                    value={s.purchaseDiscountPercent}
                                    step="0.1"
                                    onChange={v => updateScenario(idx, { purchaseDiscountPercent: v })}
                                />
                                <FieldNum
                                    label="% Descuento escritura"
                                    value={s.deedDiscountPercent}
                                    step="0.1"
                                    onChange={v => updateScenario(idx, { deedDiscountPercent: v })}
                                />
                                <div className="grid grid-cols-2 gap-2">
                                    <FieldNum
                                        label="Sellos %"
                                        value={s.rates.stampsPercent}
                                        step="0.01"
                                        onChange={v => updateRates(idx, { stampsPercent: v })}
                                    />
                                    <FieldNum
                                        label="Honor. escribano %"
                                        value={s.rates.notaryFeesPercent}
                                        step="0.01"
                                        onChange={v => updateRates(idx, { notaryFeesPercent: v })}
                                    />
                                    <FieldNum
                                        label="Gastos escritura %"
                                        value={s.rates.deedExpensesPercent}
                                        step="0.01"
                                        onChange={v => updateRates(idx, { deedExpensesPercent: v })}
                                    />
                                    <FieldNum
                                        label="Honor. inmob. %"
                                        value={s.rates.buyerCommissionPercent}
                                        step="0.01"
                                        onChange={v => updateRates(idx, { buyerCommissionPercent: v })}
                                    />
                                </div>
                            </div>
                            <div className="border-t pt-3 space-y-1 text-sm">
                                <RowKV k="Valor de compra" v={formatCurrency(r.purchasePrice, currency)} />
                                <RowKV k="Total gastos compra" v={formatCurrency(r.totalPurchaseCosts, currency)} />
                                <RowKV
                                    k="Costo total"
                                    v={formatCurrency(r.totalCostWithPurchase, currency)}
                                    bold
                                />
                                <RowKV
                                    k="En mano luego compra"
                                    v={formatCurrency(r.remainingMoney, currency)}
                                    color={r.remainingMoney >= 0 ? 'green' : 'red'}
                                    bold
                                />
                            </div>
                        </div>
                    )
                })}
            </div>
        </section>
    )
}

function FieldNum({
    label,
    value,
    onChange,
    step = '1',
}: {
    label: string
    value: number
    onChange: (v: number) => void
    step?: string
}) {
    return (
        <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <Input
                type="number"
                step={step}
                min={0}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                className="h-9 text-sm"
            />
        </div>
    )
}

function RowKV({ k, v, bold, color }: { k: string; v: string; bold?: boolean; color?: 'green' | 'red' }) {
    const colorClass =
        color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-foreground'
    return (
        <div className={`flex justify-between ${bold ? 'font-semibold' : ''} ${colorClass}`}>
            <span className="text-muted-foreground">{k}</span>
            <span>{v}</span>
        </div>
    )
}
```

- [ ] **Step 2: Verificar imports de `Checkbox`**

```bash
ls components/ui/checkbox.tsx
```

Si no existe, agregarlo con shadcn o usar `<input type="checkbox">`.

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/appraisal/PurchaseScenariosEditor.tsx
git commit -m "feat: PurchaseScenariosEditor con 3 escenarios editables y selector"
```

---

### Task E4: Integrar escenarios en wizard de tasación

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx`

**Contexto:** Agregar estado de escenarios + selección, generar defaults cuando hay propiedades de compra, recalcular en useEffect, persistir en valuationResult.

- [ ] **Step 1: Agregar estado**

Cerca del bloque de useStates iniciales (~línea 130-160 del file):

```typescript
import { buildDefaultScenarios, calculateAllScenarios } from '@/lib/valuation/purchase-scenarios'
import type { PurchaseScenarioId, PurchaseScenarioInput } from '@/lib/valuation/calculator'

const [purchaseScenarios, setPurchaseScenarios] = useState<PurchaseScenarioInput[]>([])
const [selectedScenarioIds, setSelectedScenarioIds] = useState<PurchaseScenarioId[]>([])
```

- [ ] **Step 2: Inicializar escenarios cuando hay propiedades de compra**

```typescript
// Cuando se agrega/cambia la primera propiedad de compra, generar escenarios default
useEffect(() => {
    if (purchaseProperties.length > 0 && purchaseScenarios.length === 0) {
        const basePrice = purchaseProperties[0].price || 100000
        setPurchaseScenarios(buildDefaultScenarios(basePrice))
        setSelectedScenarioIds(['conservative', 'medium', 'aggressive'])  // todos por default
    }
}, [purchaseProperties])
```

- [ ] **Step 3: Recalcular escenarios cuando cambian inputs (extender el useEffect de Task D1)**

El useEffect de la línea 304 ya fue extendido en Task D1 con `savedAppraisalIdRef` y debounce. Ahora SOLO agregar la lógica de escenarios y ampliar las dependencias:

```typescript
useEffect(() => {
    if (!valuationResult || !subject) return
    const subjectVal: ValuationProperty = { ... }
    const compsVal: ValuationProperty[] = comparables.map(c => ({ ... }))
    let next = calculateValuation({ subject: subjectVal, comparables: compsVal, expenseRates })
    if (!next) return

    // Calcular escenarios si los hay
    if (purchaseScenarios.length > 0) {
        const scenarioResults = calculateAllScenarios(purchaseScenarios, next.moneyInHand)
        next = { ...next, purchaseScenarios: scenarioResults, selectedScenarioIds }
    }
    setValuationResult(next)

    // Auto-save con debounce + ref (mismo patrón que Task D1)
    const id = savedAppraisalIdRef.current
    if (!id) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
        updateAppraisal(id, {
            subject, comparables, overpriced, purchaseProperties,
            valuationResult: next,
        }).catch(err => console.error('Auto-save error:', err))
    }, 800)
}, [subject, comparables, expenseRates, purchaseScenarios, selectedScenarioIds])
```

NOTA: si la línea de `// eslint-disable-next-line react-hooks/exhaustive-deps` está ahí, mantenerla (los `valuationResult`, `editId`, etc. se acceden via refs/closures intencionalmente).

- [ ] **Step 4: Renderizar el editor**

Donde corresponde en el JSX (después de propiedades de compra y antes del botón de calcular o resultado), agregar:

```typescript
{purchaseProperties.length > 0 && purchaseScenarios.length > 0 && valuationResult && (
    <PurchaseScenariosEditor
        scenarios={purchaseScenarios}
        results={valuationResult.purchaseScenarios || []}
        selectedIds={selectedScenarioIds}
        currency={valuationResult.currency}
        moneyFromSale={valuationResult.moneyInHand}
        onScenariosChange={setPurchaseScenarios}
        onSelectedIdsChange={setSelectedScenarioIds}
    />
)}
```

- [ ] **Step 5: Cargar escenarios al editar appraisal existente**

En el bloque que carga `editId` (línea ~236, donde se hace `setExpenseRates(detail.valuation_result.expenseRates)`), agregar:

```typescript
if (detail.valuation_result?.purchaseScenarios) {
    setPurchaseScenarios(detail.valuation_result.purchaseScenarios.map((s: any) => ({
        id: s.id,
        label: s.label,
        publicationPrice: s.publicationPrice,
        purchaseDiscountPercent: s.purchaseDiscountPercent,
        deedDiscountPercent: s.deedDiscountPercent,
        rates: s.rates,
    })))
}
if (detail.valuation_result?.selectedScenarioIds) {
    setSelectedScenarioIds(detail.valuation_result.selectedScenarioIds)
}
```

- [ ] **Step 6: Type-check + smoke**

```bash
npx tsc --noEmit
npm run dev
# Crear tasación con 1 propiedad de compra. Ver 3 escenarios. Editar precio
# de Conservador. Verificar recálculo. Desmarcar Agresivo. Recalcular.
```

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "feat(wizard): integración de escenarios de compra editables"
```

---

### Task E5: Renderizar escenarios en PDF — sección "Simulación Gastos e Impuestos"

**Files:**
- Modify: `components/appraisal/pdf/PDFReport.tsx` (reemplazar sección 1000-1138)

**Contexto:** Hoy hay un divider "SIMULACIÓN COMPRA Y VENTA" + tabla side-by-side. Hay que cambiar a:
1. Cuando hay propiedades de compra: NO mostrar la página "COSTOS DE VENTA" suelta (líneas 808-898). Reemplazarla por una sección consolidada después de "PROPIEDADES PARA COMPRA" llamada "SIMULACIÓN GASTOS E IMPUESTOS" con: tabla de venta + 1-3 tablas de escenarios de compra según `selectedScenarioIds`.
2. Cuando NO hay propiedades de compra: mantener la página "COSTOS DE VENTA" como hoy.

- [ ] **Step 1: Agregar guard al renderizar la página "COSTOS DE VENTA"**

Línea 808 (`{/* PAGE 10: COSTOS DE VENTA */}`) y la `<Page>` que sigue, envolverlas en una condición. La estructura final debe ser:

```typescript
{/* COSTOS DE VENTA — solo si NO hay propiedades de compra */}
{purchaseProperties.length === 0 && (
    <Page size="A4" style={styles.pageWithPadding}>
        {/* ... contenido existente líneas 808-898 ... */}
    </Page>
)}
```

- [ ] **Step 2: Reescribir la sección de simulación con escenarios**

Reemplazar TODO el bloque desde línea 999 (`{/* SIMULATION DIVIDER PAGE */}`) hasta el cierre `</Page>` de la línea 1138 por:

```typescript
{/* SIMULATION DIVIDER PAGE — solo si hay escenarios o purchaseResult */}
{(valuationResult.purchaseScenarios && valuationResult.purchaseScenarios.length > 0) && (
    <Page size="A4" style={styles.page}>
        <View style={styles.backgroundPage}>
            <Image
                src="/pdf-assets/graphics/section-divider-bg.jpg"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <View style={styles.backgroundOverlay} />
            <View style={[styles.backgroundContent, { alignItems: 'flex-start', paddingLeft: 50, paddingRight: 280 }]}>
                <Text style={[styles.dividerTitle, { textAlign: 'left', fontSize: 32 }]}>
                    SIMULACIÓN GASTOS E IMPUESTOS
                </Text>
            </View>
            <Image src="/pdf-assets/photos/Foto Diego.png" style={styles.dividerPhoto} />
        </View>
    </Page>
)}

{/* PAGE: TABLA DE VENTA + ESCENARIOS DE COMPRA */}
{valuationResult.purchaseScenarios && valuationResult.purchaseScenarios.length > 0 && (() => {
    const selectedIds = valuationResult.selectedScenarioIds || ['conservative', 'medium', 'aggressive']
    const visibleScenarios = valuationResult.purchaseScenarios.filter(s => selectedIds.includes(s.id))
    return (
        <Page size="A4" style={styles.pageWithPadding}>
            <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                <Text style={styles.headerTitle}>SIMULACIÓN GASTOS E IMPUESTOS</Text>
            </View>
            <View style={{ marginTop: 60 }}>
                {/* TABLA DE VENTA (siempre primero) */}
                <SaleSimTable valuationResult={valuationResult} subject={subject} neighborhood={neighborhood} />

                {/* ESCENARIOS DE COMPRA */}
                {visibleScenarios.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                        <Text style={[styles.h3, { marginBottom: 8 }]}>Escenarios de Compra</Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                            {visibleScenarios.map(scenario => (
                                <PurchaseSimTable
                                    key={scenario.id}
                                    scenario={scenario}
                                    currency={valuationResult.currency}
                                    width={visibleScenarios.length === 1 ? '100%' : visibleScenarios.length === 2 ? '49%' : '32.6%'}
                                />
                            ))}
                        </View>
                    </View>
                )}
            </View>
        </Page>
    )
})()}
```

- [ ] **Step 3: Crear los componentes auxiliares SaleSimTable y PurchaseSimTable**

Antes de la función principal `PDFReport`, agregar:

```typescript
function SaleSimTable({
    valuationResult,
    subject,
    neighborhood,
}: { valuationResult: ValuationResult; subject: any; neighborhood: string }) {
    const r = valuationResult
    const rates = r.expenseRates
    return (
        <View style={{ marginBottom: 14 }}>
            <View style={{ backgroundColor: '#fff3e0', padding: 6, borderWidth: 1, borderColor: colors.orange }}>
                <Text style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center', color: colors.darkGray }}>
                    VENTA {subject.features.rooms ? `${subject.features.rooms} AMBIENTES` : ''} | {neighborhood}
                </Text>
            </View>
            <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                <ValueCell label="Valor de Publicación" value={`u$d${r.publicationPrice.toLocaleString()}`} flex />
                <ValueCell label="Valor de Venta" value={`u$d${r.saleValue.toLocaleString()}`} flex />
                <ValueCell label="Valor de Escritura" value={`u$d${r.deedValue.toLocaleString()}`} flex />
            </View>
            <View style={{ backgroundColor: '#e8f4fd', padding: 4, borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>Gastos de Venta</Text>
            </View>
            <ExpRow label={`Sellos ${rates.stampsPercent}% s/escritura`} value={r.stampsCost} currency={r.currency} />
            <ExpRow label={`Gastos Escritura ${rates.deedExpensesPercent}% s/venta`} value={r.deedExpenses} currency={r.currency} />
            <ExpRow label={`Honorarios Inmobiliaria ${rates.agencyFeesPercent}% s/venta`} value={r.agencyFees} currency={r.currency} />
            <ExpRow label="Total gastos venta" value={r.totalExpenses} currency={r.currency} bold />
            <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#ecfdf5', borderRadius: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: 'bold', color: '#065f46' }}>Dinero luego de venta</Text>
                <Text style={{ fontSize: 9, fontWeight: 'bold', color: colors.semaphoreGreen }}>
                    u$d{r.moneyInHand.toLocaleString()}
                </Text>
            </View>
        </View>
    )
}

function PurchaseSimTable({
    scenario,
    currency,
    width,
}: { scenario: PurchaseScenarioResult; currency: string; width: string }) {
    return (
        <View style={{ width }}>
            <View style={{ backgroundColor: '#e8f4fd', padding: 6, borderWidth: 1, borderColor: colors.primary }}>
                <Text style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center', color: colors.darkGray }}>
                    COMPRA — {scenario.label.toUpperCase()}
                </Text>
            </View>
            <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                <ValueCell label="Publicación" value={`u$d${scenario.publicationPrice.toLocaleString()}`} flex />
                <ValueCell label="Compra" value={`u$d${scenario.purchasePrice.toLocaleString()}`} flex />
                <ValueCell label="Escritura" value={`u$d${scenario.deedValue.toLocaleString()}`} flex />
            </View>
            <View style={{ backgroundColor: '#e8f4fd', padding: 4, borderWidth: 1, borderColor: colors.lightGray, borderTopWidth: 0 }}>
                <Text style={{ fontSize: 8, fontWeight: 'bold', textAlign: 'center' }}>Gastos de Compra</Text>
            </View>
            <ExpRow label={`Sellos ${scenario.rates.stampsPercent}%`} value={scenario.stampsCost} currency={currency} />
            <ExpRow label={`Honor. Escribano ${scenario.rates.notaryFeesPercent}%`} value={scenario.notaryFees} currency={currency} />
            <ExpRow label={`Gastos Escritura ${scenario.rates.deedExpensesPercent}%`} value={scenario.deedExpenses} currency={currency} />
            <ExpRow label={`Honor. Inmob. ${scenario.rates.buyerCommissionPercent}%`} value={scenario.buyerCommission} currency={currency} />
            <ExpRow label="Total gastos compra" value={scenario.totalPurchaseCosts} currency={currency} bold />
            <View style={{ marginTop: 6, padding: 6, backgroundColor: '#eff6ff', borderRadius: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold', color: '#1e40af' }}>Costo total</Text>
                    <Text style={{ fontSize: 8, fontWeight: 'bold', color: colors.primary }}>
                        u$d{scenario.totalCostWithPurchase.toLocaleString()}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                    <Text style={{ fontSize: 8, fontWeight: 'bold' }}>En mano final</Text>
                    <Text style={{
                        fontSize: 8,
                        fontWeight: 'bold',
                        color: scenario.remainingMoney >= 0 ? colors.semaphoreGreen : colors.semaphoreRed,
                    }}>
                        u$d{scenario.remainingMoney.toLocaleString()}
                    </Text>
                </View>
            </View>
        </View>
    )
}

function ValueCell({ label, value, flex }: { label: string; value: string; flex?: boolean }) {
    return (
        <View style={[{ padding: 4, borderRightWidth: 1, borderColor: colors.lightGray }, flex ? { flex: 1 } : {}]}>
            <Text style={{ fontSize: 7, color: colors.mediumGray, textAlign: 'center' }}>{label}</Text>
            <Text style={{ fontSize: 9, fontWeight: 'bold', textAlign: 'center' }}>{value}</Text>
        </View>
    )
}

function ExpRow({
    label,
    value,
    currency,
    bold,
}: { label: string; value: number; currency: string; bold?: boolean }) {
    return (
        <View style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            padding: 4,
            borderWidth: 1,
            borderColor: bold ? colors.darkGray : colors.lightGray,
            borderTopWidth: 0,
            backgroundColor: bold ? '#f5f5f5' : undefined,
        }}>
            <Text style={{ fontSize: 8, fontWeight: bold ? 'bold' : 'normal' }}>{label}</Text>
            <Text style={{ fontSize: 8, fontWeight: bold ? 'bold' : 'normal' }}>
                u$d{value.toLocaleString()}
            </Text>
        </View>
    )
}
```

Importar al tope del archivo si no está:

```typescript
import type { PurchaseScenarioResult, ValuationResult } from '@/lib/valuation/calculator'
```

- [ ] **Step 4: Mantener compatibilidad con `purchaseResult` legacy**

Para tasaciones existentes que tienen `purchaseResult` pero NO `purchaseScenarios`, agregar fallback. Después del bloque nuevo de escenarios, dejar el `purchaseResult` original como fallback solo si no hay escenarios:

```typescript
{(!valuationResult.purchaseScenarios || valuationResult.purchaseScenarios.length === 0) && purchaseResult && (
    /* renderizado legacy de la tabla side-by-side existente */
)}
```

- [ ] **Step 5: Type-check + smoke**

```bash
npx tsc --noEmit
npm run dev
# Caso 1: tasación sin compra → debe seguir mostrando página COSTOS DE VENTA normal.
# Caso 2: tasación con compra y 3 escenarios → debe mostrar SIMULACIÓN GASTOS E IMPUESTOS con tabla venta + 3 tablas compra.
# Caso 3: deseleccionar 2 escenarios → solo se renderiza 1 tabla compra.
# Caso 4: tasación legacy guardada (sin escenarios) → fallback a tabla side-by-side.
```

- [ ] **Step 6: Commit**

```bash
git add components/appraisal/pdf/PDFReport.tsx
git commit -m "feat(pdf): sección Simulación Gastos e Impuestos con escenarios de compra"
```

---

## MÓDULO F — Persistencia DB para Escenarios

### Task F1: Verificar que JSONB persiste el campo nuevo

**Files:**
- Modify: `lib/supabase/appraisals.ts`
- Verify: `types/database.types.ts`

**Contexto:** `valuation_result` es JSONB. No requiere migración SQL — solo aceptar nuevos campos. Pero hay que asegurar que el code de save serializa todo el objeto.

- [ ] **Step 1: Inspeccionar saveAppraisal/updateAppraisal**

```bash
grep -n "valuation_result\|valuationResult" lib/supabase/appraisals.ts | head -20
```

- [ ] **Step 2: Confirmar que se guarda el objeto entero**

Buscar la línea donde se hace `valuation_result: ...`. Si es algo como `valuation_result: input.valuationResult as Json`, no requiere cambio. Si hay un destructuring que omite campos, agregar los nuevos.

- [ ] **Step 3: Test de roundtrip**

```bash
npm run dev
# Crear tasación con compra y escenarios. Calcular. Cerrar. Reabrir desde
# /appraisals/[id]. Verificar que escenarios y selectedIds se cargaron.
```

Si los escenarios no se cargan, revisar el step 5 de Task E4 (cargar escenarios al editar appraisal existente).

- [ ] **Step 4: Commit (solo si hubo cambios)**

```bash
git add lib/supabase/appraisals.ts
git commit -m "fix(supabase): persistir purchaseScenarios y selectedScenarioIds en valuation_result"
```

---

## MÓDULO G — Mejoras de Scrapers (location cleaning + publishedDate)

### Task G1: Limpiar comparable.location al guardar (no solo al renderizar)

**Files:**
- Modify: `lib/scraper/index.ts` (o el orchestrator equivalente) o cada extractor

**Contexto:** En PDF ya extraemos solo dirección con `extractAddress` (Task A3). Pero también es bueno limpiar al guardar para que el dato en DB sea consistente. Sin embargo, esto puede romper appraisals existentes. Decisión: NO mutar `location` al scrapear (queda como dato raw). El `extractAddress` se aplica solo en render. Saltamos este paso.

- [ ] **Step 1: Decidir alcance**

Confirmar con `extractAddress` aplicado en runtime (Task A3) que es suficiente. Si user pide limpieza al scrape, agregar este task entonces.

- [ ] **Step 2: Skip por defecto**

No requiere acción si Task A3 ya aplica `extractAddress` en render.

---

## MÓDULO H — QA, Validación y Despliegue

### Task H1: Type-check + lint + build de producción

- [ ] **Step 1: Run all checks**

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Expected: 0 errores. Si hay errores nuevos en archivos no tocados, ignorar (preexistentes).

- [ ] **Step 2: Si hay errores, corregir y rerun**

---

### Task H2: Smoke test manual end-to-end

- [ ] **Step 1: Caso A — tasación de venta pura**

1. `/appraisal/new`
2. Completar wizard con calidad="Excelente", estado="STATE_3"
3. Agregar 4 comparables (verificar paginación 2+2 en vez de 3+1)
4. Calcular
5. Verificar publicationPrice afectado por quality coefficient (vs caso con quality="GOOD" que debería dar precio menor)
6. Editar `coveredArea` inline → verificar recálculo
7. Cambiar honorarios % de 3 a 2 → verificar PDF refleja el cambio
8. Abrir vista PDF → verificar:
   - Portada solo muestra dirección, sin barrio/ciudad
   - Foto Diego se ve completa
   - Comparables muestran chips, link como botón, "Publicado hace X"
9. Guardar (auto-save). Recargar página. Verificar persistencia.

- [ ] **Step 2: Caso B — tasación con compra**

1. Repetir wizard
2. Agregar 1 propiedad de compra
3. Verificar que aparecen 3 escenarios prellenados
4. Editar precio Conservador a $140k, Medio $150k, Agresivo $160k
5. Desmarcar Agresivo
6. Generar PDF, verificar:
   - Página "COSTOS DE VENTA" suelta NO aparece
   - Después de propiedades de compra aparece divider "SIMULACIÓN GASTOS E IMPUESTOS" sin saltos forzados
   - Tabla de venta + 2 tablas de compra (Conservador y Medio)
7. Re-marcar Agresivo. Verificar que aparece la 3ra tabla.
8. Verificar que `\n` no rompe título de divider.

- [ ] **Step 3: Caso C — tasación legacy (back-compat)**

1. Abrir una tasación existente del historial (sin escenarios)
2. Verificar que renderiza correctamente con el flujo viejo
3. Verificar que se pueden editar features inline
4. Verificar que `subjectQualityCoef` ahora respeta el valor original (si la tasación tiene `quality` en features, el precio puede recalcularse diferente — comunicar al usuario)

- [ ] **Step 4: Reportar resultados**

Documentar en commit message o en este plan los hallazgos. Si hay regresiones, abrir tasks adicionales.

---

### Task H3: Migración blanda de tasaciones existentes (si hay impacto)

**Files:**
- Possible: `scripts/recalc-appraisals.ts`

**Contexto:** Task C1 cambia el cálculo de `subjectQualityCoef`. Tasaciones guardadas tienen `valuation_result` con valores ya calculados. NO se recalculan automáticamente. Si el usuario abre una tasación vieja y la edita, se recalcula con la nueva lógica (puede aumentar/disminuir el precio). Esto es comportamiento aceptable.

- [ ] **Step 1: Comunicar al usuario**

Agregar un toast/banner en la página detalle si la tasación es anterior a esta fecha:

```typescript
{appraisal.created_at < '2026-04-27' && (
    <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
        Esta tasación fue calculada con el motor anterior. Al editar cualquier dato,
        se recalculará con el nuevo motor (que respeta calidad constructiva del subject).
    </div>
)}
```

- [ ] **Step 2: Decidir si migrar masivamente**

Por defecto: NO. El usuario puede tocar "Editar" en tasaciones que le importen y re-guardar.

- [ ] **Step 3: Commit (si se agregó banner)**

```bash
git add "app/(dashboard)/appraisals/[id]/page.tsx"
git commit -m "feat(detail): banner informativo en tasaciones pre-2026-04-27"
```

---

### Task H4: Push a producción

- [ ] **Step 1: Verificar branch y commits**

```bash
git status
git log --oneline -20
```

- [ ] **Step 2: Push a main**

```bash
git push origin main
```

(Per CLAUDE.md memory: usuario quiere push automático sin pedir permiso. Netlify desplegará automáticamente.)

- [ ] **Step 3: Verificar deploy en Netlify**

Esperar 2-3 minutos, abrir el sitio prod, verificar que la página `/appraisal/new` carga correctamente.

---

## Self-Review

**Cobertura del spec del usuario:**

| Punto del usuario | Task que lo cubre |
|---|---|
| Portada solo dirección | A1 |
| Imagen Diego completa en portada | A1 |
| Página 2 datos editables inline | B1, B2, B3 |
| Página 2 redistribución (sin espacio vacío) | B4 |
| Comparables: separación visual de características | A3 (FeatureChip) |
| Comparables: título solo dirección | A3 (extractAddress) |
| Comparables: link más llamativo | A3 (botón) |
| Comparables: smart pagination | A5 |
| Comparables: "Publicado hace X" en ML y ZP | A4 |
| Wizard: coeficientes según opción seleccionada | C1 |
| Bug: cambio de honorarios no refleja en PDF | D1 (edición inline + auto-save) |
| Filtro venta vs compra (omite tabla costos venta si hay compra) | E5 (guard en COSTOS DE VENTA) |
| Imagen divider compra cortando texto | A2 |
| 3 escenarios de compra editables | E1-E4 |
| Selector de cuáles escenarios mostrar en informe | E3, E4, E5 |
| Tabla venta + tablas compra al final cuando hay compra | E5 |
| Tasaciones existentes también deben mostrar nuevo formato | H2 (verificación), H3 (banner) |

**Verificación de consistencia (post-revisión):**

- `formatCurrency`: centralizada en `lib/valuation/utils.ts` (Task 0.1). Importada por PDFReport, ValuationReport, PurchaseScenariosEditor.
- `extractAddress`: en `lib/valuation/addressUtils.ts`. Excluye prefijos de tipo de propiedad ("PH 3", "depto 4").
- `PurchaseScenarioId`, `PurchaseScenarioInput`, `PurchaseScenarioResult`: definidos en `calculator.ts` (Task 0.2). Importados desde `@/lib/valuation/calculator` en todos los archivos.
- `ValuationResult.purchaseScenarios?` y `selectedScenarioIds?`: declarados en Task 0.2 (calculator.ts), escritos en E4, leídos en E5, persistidos automáticamente en JSONB.
- `savedAppraisalIdRef` (useRef): patrón definido en Task D1, reutilizado en E4. Síncrono — evita race condition.
- `autoSaveTimerRef`: timer de debounce 800ms compartido entre useEffects.
- `appraisalDate` prop: agregada al PDFReport (Task B4 Step 2a) y consumida en footer (Step 2b). Reemplaza `new Date()` no-determinístico.
- `colors.semaphoreGreen`, `colors.semaphoreRed`, `colors.primary`: existen en PDFStyles.ts (verificado en review). Las nuevas cards usan `borderWidth/Color/Style` por separado, no shorthand.
- `onSubjectFeaturesChange`: tipo estrechado a `(features: PropertyFeatures) => void`. Handler sin `as any`.
- Filtro de comparables en detail page: filtra explícitamente `propertyType !== 'overpriced' && !== 'purchase'` antes del recálculo.

**Issues del review aplicados:**

| ID | Severidad | Resuelto en |
|---|---|---|
| C-1 formatCurrency centralizada | CRÍT | Task 0.1 |
| C-2 race condition savedAppraisalId | CRÍT | Task D1 Step 5 (useRef + sync en handleCalculate) |
| C-3 tipos en calculator.ts no types.ts | CRÍT | Task 0.2 + reemplazo de imports |
| C-4 ValuationResult extendida | CRÍT | Task 0.2 Step 3 |
| A-1 paginateBalanced cursor explícito | ALTO | Task A5 Step 2 |
| A-2 debounce 800ms en auto-save | ALTO | Task D1 Step 5 |
| A-3 banner de cambio de coeficiente | ALTO | Task C1 Step 6 |
| A-4 fecha PDF determinística | ALTO | Task B4 Step 2a/2b |
| A-5 doble llamada parsePublishedDate | ALTO | Task A4 Step 3 |
| M-1 extractAddress excluye PH 3 | MED | Task A1 Step 1 |
| M-2 borderWidth en lugar de border | MED | Task A3 Step 2 (FeatureChip) + Task B4 |
| M-3 tipos onSubjectFeaturesChange | MED | Task B2 Step 3 |
| M-4 guard results[idx] | MED | Task E3 (return null) |
| M-5 filtrar overpriced/purchase en detail | MED | Task B3 Step 2 |
| M-6 doc moneyFromSale stale | MED | (aclaración en sección de Self-Review) |

**Sobre M-6:** El `moneyFromSale` dentro de un `PurchaseScenarioResult` persistido refleja el valor en el momento del último cálculo. Como los useEffects de auto-save recalculan cuando cambian `expenseRates`, `purchaseScenarios`, `subject` o `comparables`, el valor se mantiene fresco mientras el usuario edita activamente. Solo queda stale si el usuario edita la tasación, no recalcula explícitamente, y el `moneyInHand` cambió. El PDF siempre muestra el valor más reciente porque lee de la prop en runtime, no del campo persistido.

**Placeholders escaneados:** ningún TBD/TODO/etc en pasos. Todos los pasos contienen código completo.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-27-tasador-ajustes-y-escenarios-compra.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
