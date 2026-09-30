# Editar un aviso ya publicado (ML + Argenprop) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** desde la plataforma se editan los datos, el título y la descripción de un aviso publicado en MercadoLibre y Argenprop partiendo de lo que el portal tiene hoy, y el envío automático de la ficha deja de pisar lo corregido a mano.

**Architecture:** toda escritura a un portal pasa por "leer aviso vivo → aplicar solo los cambios → enviar completo". Las reglas viven en módulos puros (`lib/portals/edicion-comun.ts`, `lib/portals/mercadolibre/edicion.ts`, `lib/portals/argenprop/edicion.ts`, `lib/portals/cambios-ficha.ts`); los adapters suman `leerAviso`/`enviar*`; rutas finas `ml-aviso`/`ap-aviso`; una pantalla compartida `EditarAvisoPanel`. El trigger de la ficha pasa a anotar QUÉ cambió (`metadata.cambios_ficha`) y el worker aplica solo eso.

**Tech Stack:** Next.js 16 (route handlers), TypeScript estricto, Zod, Supabase (service role), vitest (config acotada), APIs ML (`/items`) y Argenprop (`/v1/avisos`), `pg` para la migración.

**Spec:** `docs/superpowers/specs/2026-09-30-editar-aviso-publicado-design.md`

## Global Constraints

- Worktree: `/private/tmp/claude-501/wt-editar-aviso`, rama `feat/editar-aviso-publicado`. `node_modules`: `ln -s "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria/node_modules" node_modules` (una vez). `.env.local`: `--env-file="/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria/.env.local"`.
- Tests: `npx vitest run --config vitest.editar-aviso.config.ts` (se crea en la Tarea 2). Nunca la config raíz.
- Tipos: `npx tsc --noEmit -p tsconfig.editar-aviso.json` (se crea en la Tarea 2). Sin `any`, sin `as` para callar errores.
- Commits: autor `Sujupar <redstyle50@gmail.com>` (`git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit ...`), mensaje en castellano, trailer `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. `git push` al cerrar cada tarea (`/private/tmp` se borra solo).
- Portales reales: solo sobre la propiedad `[TEST`; nunca editar avisos reales antes del deploy.
- Roles: toda ruta nueva → `requireAuth()` + abogado 403 + `puedeDifundir(id, user.id, role, 'difundir', property)`.
- Textos de pantalla en castellano rioplatense, sin jerga. El resumen de cambios se confirma dentro de la página, no con `confirm()`.
- Máximos: título ML 60 (`TITULO_MAX_ML`), Argenprop 80 (`TITULO_MAX_AP`), descripción 5000.
- Envío automático: solo `precio`, `fotos`, `expensas`; tope 3 intentos.
- **Orden de despliegue:** primero el código (Tarea 10), DESPUÉS la migración del trigger. Con el trigger nuevo y el worker viejo, el worker reenviaría la ficha entera.

## Review Focus

1. **Aviso modificado en el portal entre abrir y guardar** → se aplican solo los ids cambiados por la persona sobre el aviso RE-leído; lo tocado por otro en el portal sobrevive. Test en Tarea 3 (`armarActualizacionMl` con ítem vivo distinto del inicial) y Tarea 4.
2. **Valores que el GET devuelve con otra forma** ("Muy_Bueno", "90.00", "600000 ARS" vs "600000") → no cuentan como cambio y se reenvían en la forma que el portal acepta. Tests en Tareas 2, 3 y 4.
3. **Texto con tildes en forma descompuesta (NFD, macOS)** → "Sí" en NFD es igual a "Sí" en NFC para comparar. Test en Tarea 2.
4. **Marcas viejas de `needs_update` sin `cambios_ficha`** → se limpian sin enviar nada. Test en Tarea 6.
5. **Vaciar un dato que el portal tiene** → en ML depende de la sonda (Tarea 1); si no se puede, la pantalla no deja vaciar y el servidor rechaza `null` con 400. Tests en Tareas 3 y 8.

---

### Task 1: Sonda contra MercadoLibre con un aviso [TEST]

Objetivo: confirmar (a) que `PUT /items/{id}` con la lista completa de atributos escribibles no pierde ninguno, y (b) cómo se vacía un atributo. El resultado fija la constante `ML_VALOR_VACIO` de la Tarea 3.

**Files:**
- Create (sin commitear): `scripts/_sonda-editar-ml.ts`

**Interfaces:** Produce: el valor de `ML_VALOR_VACIO` (`{ value_id: '-1', value_name: null }`, `{ value_name: '' }` o `null` = no se puede vaciar), anotado en el comentario de la Tarea 3.

- [ ] **Step 1: Preparar el aviso de prueba.** Buscar una propiedad `[TEST` existente o clonar una con `scripts/_qa-clonar-tasacion-test.ts` si está en la carpeta compartida; si no hay, crear en la base una fila de `properties` con título `[TEST EDITAR-AVISO] Depto 2 amb`, `property_type='departamento'`, `operation_type='venta'`, `status='approved'`, lat/lng y 3 fotos https de Storage. Publicarla:

```bash
node --env-file="$ENVF" --import tsx scripts/qa-publish-ml-test.ts publish <propertyId>
```
Esperar a `active` (1–3 min) con `... verify <propertyId>`.

- [ ] **Step 2: Escribir la sonda**

```ts
// scripts/_sonda-editar-ml.ts — NO commitear. Uso: ... _sonda-editar-ml.ts <itemId>
import { mlFetch } from '@/lib/portals/mercadolibre/client'

type Attr = { id: string; value_id: string | null; value_name: string | null }
type Item = { id: string; title: string; attributes: Attr[] }

const itemId = process.argv[2]
if (!itemId?.startsWith('MLA')) throw new Error('pasá el id del ítem [TEST]')
const leer = () => mlFetch<Item>(`/items/${itemId}`)
const mapa = (i: Item) => new Map(i.attributes.map(a => [a.id, a.value_name]))

const antes = await leer()
if (!/^\[TEST/.test(antes.title)) throw new Error('solo sobre avisos [TEST')
const NO = new Set(['HAS_LOWER_PRICE', 'ORIGINAL_PUBLICATION_DATE', 'OPERATION', 'OPERATION_SUBTYPE', 'PROPERTY_TYPE'])
const escribibles = antes.attributes.filter(a => !NO.has(a.id))

// (a) PUT con la lista completa + un cambio
await mlFetch(`/items/${itemId}`, { method: 'PUT', body: JSON.stringify({
  attributes: [...escribibles.map(a => ({ id: a.id, value_id: a.value_id, value_name: a.value_name })),
    { id: 'MAINTENANCE_FEE', value_name: '123456 ARS' }],
}) })
const tras = mapa(await leer())
const perdidos = [...mapa(antes).keys()].filter(k => !tras.has(k))
console.log('(a) perdidos:', perdidos, '· expensas:', tras.get('MAINTENANCE_FEE'))

// (a2) PUT con SOLO un atributo: ¿fusiona o reemplaza?
await mlFetch(`/items/${itemId}`, { method: 'PUT', body: JSON.stringify({ attributes: [{ id: 'HAS_LIFT', value_name: 'Sí' }] }) })
const tras2 = mapa(await leer())
console.log('(a2) fusiona:', [...tras.keys()].every(k => tras2.has(k)))

// (b) vaciar: dos formas
for (const forma of [{ value_id: '-1', value_name: null }, { value_name: '' }]) {
  try {
    await mlFetch(`/items/${itemId}`, { method: 'PUT', body: JSON.stringify({ attributes: [{ id: 'MAINTENANCE_FEE', ...forma }] }) })
    const v = mapa(await leer()).get('MAINTENANCE_FEE')
    console.log('(b)', JSON.stringify(forma), '→', v ?? '(sin el atributo)')
  } catch (e) { console.log('(b)', JSON.stringify(forma), '→ ERROR', e instanceof Error ? e.message : e) }
  await mlFetch(`/items/${itemId}`, { method: 'PUT', body: JSON.stringify({ attributes: [{ id: 'MAINTENANCE_FEE', value_name: '123456 ARS' }] }) })
}
```

- [ ] **Step 3: Correrla y anotar.** `node --env-file="$ENVF" --import tsx scripts/_sonda-editar-ml.ts <itemId>`. Esperado (a): `perdidos: []`. La primera forma de (b) que dé `(sin el atributo)` o `-1`/"No aplica" es `ML_VALOR_VACIO`; si ninguna, `ML_VALOR_VACIO = null`. Anotar la salida completa en el reporte de la tarea. **No cerrar el aviso**: se reusa en la Tarea 11.

---

### Task 2: Reglas comunes de edición (`edicion-comun.ts`) + config de pruebas

**Files:**
- Create: `vitest.editar-aviso.config.ts`, `tsconfig.editar-aviso.json`
- Create: `lib/portals/edicion-comun.ts`, `lib/portals/edicion-comun.test.ts`

**Interfaces:**
- Produces:
  - `type Valor = { value_name?: string; value_id?: string }`
  - `type Valores = Record<string, Valor>`
  - `type CambiosDeValores = Record<string, Valor | null>` (`null` = vaciar)
  - `interface CambiosDeAviso { titulo?: string; descripcion?: string; valores: CambiosDeValores }`
  - `mismoValor(a: Valor | undefined, b: Valor | undefined, normalizar?: (v: string) => string): boolean`
  - `diferencias(inicial: Valores, actual: Valores, normalizar?: (id: string, v: string) => string): CambiosDeValores`
  - `sugeridosPara(delPortal: Valores, conocidos: Valores, idsAceptados: ReadonlySet<string>): Valores`
  - `aplicarCambios(base: Valores, cambios: CambiosDeValores): Valores`

- [ ] **Step 1: Configs acotadas**

```ts
// vitest.editar-aviso.config.ts — acotada (la raíz rastrea iCloud y tarda minutos).
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/portals/edicion-comun.test.ts',
      'lib/portals/cambios-ficha.test.ts',
      'lib/portals/worker-logic.test.ts',
      'lib/portals/mercadolibre/*.test.ts',
      'lib/portals/argenprop/*.test.ts',
    ],
    exclude: ['**/node_modules/**'],
  },
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
})
```

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "incremental": false },
  "include": [
    "next-env.d.ts", "types/**/*.ts",
    "lib/portals/**/*.ts",
    "app/api/properties/[[]id]/ml-aviso/**/*.ts",
    "app/api/properties/[[]id]/ap-aviso/**/*.ts",
    "app/api/properties/[[]id]/portal-actualizacion/**/*.ts",
    "app/api/properties/[[]id]/ml-attributes/**/*.ts",
    "components/properties/wizards/**/*.tsx", "components/properties/wizards/**/*.ts"
  ]
}
```
(Si `[[]id]` no matchea en tsc, listar los archivos con su ruta literal.)

- [ ] **Step 2: Test que falla**

```ts
// lib/portals/edicion-comun.test.ts
import { describe, it, expect } from 'vitest'
import { mismoValor, diferencias, sugeridosPara, aplicarCambios } from './edicion-comun'

describe('mismoValor', () => {
  it('compara por id cuando los dos tienen id', () => {
    expect(mismoValor({ value_id: '242085' }, { value_id: '242085', value_name: 'Sí' })).toBe(true)
  })
  it('ignora mayúsculas, espacios y la forma de las tildes (NFD de macOS)', () => {
    expect(mismoValor({ value_name: 'Sí' }, { value_name: ' si'.replace('i', 'í') })).toBe(true)
  })
  it('usa el normalizador para unidades', () => {
    const n = (v: string) => (/^\d+$/.test(v) ? `${v} ARS` : v)
    expect(mismoValor({ value_name: '600000' }, { value_name: '600000 ARS' }, n)).toBe(true)
  })
  it('vacío contra vacío es igual; vacío contra valor no', () => {
    expect(mismoValor(undefined, {})).toBe(true)
    expect(mismoValor(undefined, { value_name: '1' })).toBe(false)
  })
})

describe('diferencias', () => {
  it('devuelve solo lo cambiado, lo nuevo y lo vaciado (null)', () => {
    const d = diferencias(
      { ROOMS: { value_name: '4' }, HAS_LIFT: { value_name: 'No' }, FLOORS: { value_name: '9' } },
      { ROOMS: { value_name: '4' }, HAS_LIFT: { value_name: 'Sí' }, MAINTENANCE_FEE: { value_name: '1 ARS' } },
    )
    expect(d).toEqual({ HAS_LIFT: { value_name: 'Sí' }, MAINTENANCE_FEE: { value_name: '1 ARS' }, FLOORS: null })
  })
  it('sin cambios devuelve objeto vacío', () => {
    expect(diferencias({ A: { value_id: 'x' } }, { A: { value_id: 'x' } })).toEqual({})
  })
})

describe('sugeridosPara', () => {
  it('sugiere solo lo que el portal no tiene y la categoría acepta', () => {
    const s = sugeridosPara(
      { ROOMS: { value_name: '4' } },
      { ROOMS: { value_name: '5' }, MAINTENANCE_FEE: { value_name: '600000 ARS' }, INVENTADO: { value_name: 'x' } },
      new Set(['ROOMS', 'MAINTENANCE_FEE']),
    )
    expect(s).toEqual({ MAINTENANCE_FEE: { value_name: '600000 ARS' } })
  })
})

describe('aplicarCambios', () => {
  it('pisa, agrega y borra sin mutar la base', () => {
    const base = { A: { value_name: '1' }, B: { value_name: '2' } }
    const r = aplicarCambios(base, { A: { value_name: '9' }, B: null, C: { value_id: 'c' } })
    expect(r).toEqual({ A: { value_name: '9' }, C: { value_id: 'c' } })
    expect(base.B).toEqual({ value_name: '2' })
  })
})
```

- [ ] **Step 3:** `npx vitest run --config vitest.editar-aviso.config.ts lib/portals/edicion-comun.test.ts` → FAIL (módulo no existe).

- [ ] **Step 4: Implementación**

```ts
// lib/portals/edicion-comun.ts
/**
 * Reglas compartidas por la edición de avisos publicados (ML y Argenprop).
 * Puro: sin red ni base. La regla madre del diseño es "leer el aviso vivo,
 * aplicar SOLO lo que la persona cambió, enviar completo": acá vive la parte
 * de "qué cambió", que alimenta el contador de la pantalla y lo que se envía.
 */
export type Valor = { value_name?: string; value_id?: string }
export type Valores = Record<string, Valor>
/** `null` = la persona vació el dato. */
export type CambiosDeValores = Record<string, Valor | null>
export interface CambiosDeAviso { titulo?: string; descripcion?: string; valores: CambiosDeValores }

// NFC primero: macOS entrega la "í" descompuesta y sin esto "Sí" ≠ "Sí".
const plano = (s: string) => s.normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const vacio = (v: Valor | undefined | null) => !v || (!v.value_id && !(v.value_name ?? '').trim())

export function mismoValor(a: Valor | undefined, b: Valor | undefined, normalizar: (v: string) => string = s => s): boolean {
  if (vacio(a) && vacio(b)) return true
  if (vacio(a) || vacio(b)) return false
  if (a!.value_id && b!.value_id) return a!.value_id === b!.value_id
  const na = a!.value_name ?? '', nb = b!.value_name ?? ''
  return plano(normalizar(na)) === plano(normalizar(nb))
}

export function diferencias(
  inicial: Valores,
  actual: Valores,
  normalizar: (id: string, v: string) => string = (_id, v) => v,
): CambiosDeValores {
  const out: CambiosDeValores = {}
  for (const id of new Set([...Object.keys(inicial), ...Object.keys(actual)])) {
    const a = inicial[id], b = actual[id]
    if (mismoValor(a, b, v => normalizar(id, v))) continue
    out[id] = vacio(b) ? null : { ...b }
  }
  return out
}

export function sugeridosPara(delPortal: Valores, conocidos: Valores, idsAceptados: ReadonlySet<string>): Valores {
  const out: Valores = {}
  for (const [id, v] of Object.entries(conocidos)) {
    if (!idsAceptados.has(id) || vacio(v) || !vacio(delPortal[id])) continue
    out[id] = { ...v }
  }
  return out
}

export function aplicarCambios(base: Valores, cambios: CambiosDeValores): Valores {
  const out: Valores = { ...base }
  for (const [id, v] of Object.entries(cambios)) {
    if (v === null) delete out[id]
    else out[id] = { ...v }
  }
  return out
}
```
(Nota: `a!`/`b!` están justificados por el `vacio()` de arriba; si el linter los marca, reemplazar por variables locales tipadas.)

- [ ] **Step 5:** correr → PASS. `npx tsc --noEmit -p tsconfig.editar-aviso.json` limpio en lo tocado.
- [ ] **Step 6: Commit + push** `feat(portales): reglas comunes para editar un aviso publicado`.

---

### Task 3: MercadoLibre — leer el ítem y armar la actualización

**Files:**
- Modify: `lib/portals/mercadolibre/mapping.ts` (exportar `normalizeUnit`, agregar `MAINTENANCE_FEE`)
- Create: `lib/portals/mercadolibre/prefill.ts` (mover `derivedPrefill` desde `app/api/properties/[id]/ml-attributes/route.ts`)
- Modify: `app/api/properties/[id]/ml-attributes/route.ts` (importar `derivedPrefill` del módulo)
- Create: `lib/portals/mercadolibre/edicion.ts`, `lib/portals/mercadolibre/edicion.test.ts`
- Modify: `lib/portals/mercadolibre/mapping.test.ts` (caso de expensas)

**Interfaces:**
- Consumes: `Valor`, `Valores`, `CambiosDeValores`, `aplicarCambios`, `mismoValor` (Tarea 2); `CategoryAttribute`, `MlRawAttribute` (`category-attributes.ts`).
- Produces:
  - `normalizeUnit(attr: MlAttribute): MlAttribute` (exportada)
  - `derivedPrefill(property: Property): Record<string, AttributeOverride>` en `prefill.ts`
  - `interface MlItemVivo { id: string; title: string; status: string; category_id: string; price: number; permalink?: string; attributes: { id: string; value_id: string | null; value_name: string | null }[] }`
  - `ML_VALOR_VACIO: { value_id?: string | null; value_name?: string | null } | null` (valor de la Tarea 1)
  - `valoresDesdeItem(item: MlItemVivo, schema: readonly CategoryAttribute[]): Valores`
  - `interface CambiosMl { titulo?: string; valores: CambiosDeValores; precio?: number; fotos?: string[] }`
  - `armarActualizacionMl(item: MlItemVivo, cambios: CambiosMl, raw: readonly MlRawAttribute[]): { body: Record<string, unknown>; cambiados: string[] }`
  - `normalizarMl(id: string, v: string): string` (para comparar)

- [ ] **Step 1: Test de expensas en `mapping.test.ts`** (agregar al final)

```ts
it('expensas sin moneda salen con " ARS"', () => {
  const p = baseProperty({ latitude: -34.6, longitude: -58.4 })
  const payload = propertyToMlPayload(p, { attributeOverrides: { MAINTENANCE_FEE: { value_name: '150000' } } })
  expect(payload.attributes.find(a => a.id === 'MAINTENANCE_FEE')?.value_name).toBe('150000 ARS')
})
```
(Usar el helper de propiedad que ya tenga el archivo; si se llama distinto, reusar ese.)

- [ ] **Step 2: Tests de `edicion.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { valoresDesdeItem, armarActualizacionMl, normalizarMl, type MlItemVivo } from './edicion'
import type { CategoryAttribute, MlRawAttribute } from './category-attributes'

const schema: CategoryAttribute[] = [
  { id: 'ROOMS', name: 'Ambientes', valueType: 'number', required: true },
  { id: 'DISPOSITION', name: 'Disposición', valueType: 'list', required: false, allowedValues: [{ id: '242077', name: 'Frente' }] },
  { id: 'HAS_LIFT', name: 'Ascensor', valueType: 'boolean', required: false },
  { id: 'MAINTENANCE_FEE', name: 'Expensas', valueType: 'number_unit', required: false, allowedUnits: ['ARS'] },
  { id: 'SUITABLE_FOR_MORTGAGE_LOAN', name: 'Apto crédito', valueType: 'boolean', required: false },
]
const raw: MlRawAttribute[] = [
  ...schema.map(s => ({ id: s.id, name: s.name, value_type: s.valueType, tags: {} })),
  { id: 'OPERATION', name: 'Operación', value_type: 'list', tags: { fixed: true, hidden: true } },
  { id: 'HAS_LOWER_PRICE', name: 'Bajó', value_type: 'boolean', tags: { hidden: true, read_only: true } },
  { id: 'WITH_VIRTUAL_TOUR', name: 'Tour', value_type: 'boolean', tags: { hidden: true } },
]
const item = (extra: MlItemVivo['attributes'] = []): MlItemVivo => ({
  id: 'MLA1', title: 'Depto', status: 'active', category_id: 'MLA401686', price: 100,
  attributes: [
    { id: 'ROOMS', value_id: null, value_name: '4' },
    { id: 'DISPOSITION', value_id: '242077', value_name: 'Frente' },
    { id: 'HAS_LIFT', value_id: '242084', value_name: 'No' },
    { id: 'OPERATION', value_id: '242075', value_name: 'Venta' },
    { id: 'HAS_LOWER_PRICE', value_id: null, value_name: 'No' },
    { id: 'WITH_VIRTUAL_TOUR', value_id: '242084', value_name: 'No' },
    ...extra,
  ],
})

describe('valoresDesdeItem', () => {
  it('lista por id, Sí/No y números por nombre, solo ids del schema', () => {
    expect(valoresDesdeItem(item(), schema)).toEqual({
      ROOMS: { value_name: '4' }, DISPOSITION: { value_id: '242077' }, HAS_LIFT: { value_name: 'No' },
    })
  })
})

describe('armarActualizacionMl', () => {
  it('manda todo lo escribible con el cambio aplicado y nunca los de solo lectura ni fijos', () => {
    const { body, cambiados } = armarActualizacionMl(item(), { valores: { MAINTENANCE_FEE: { value_name: '600000' } } }, raw)
    const attrs = body.attributes as { id: string; value_name?: string | null }[]
    expect(attrs.map(a => a.id).sort()).toEqual(['DISPOSITION', 'HAS_LIFT', 'MAINTENANCE_FEE', 'ROOMS', 'WITH_VIRTUAL_TOUR'])
    expect(attrs.find(a => a.id === 'MAINTENANCE_FEE')?.value_name).toBe('600000 ARS')
    expect(cambiados).toEqual(['MAINTENANCE_FEE'])
    expect(body.title).toBeUndefined()
  })
  it('respeta lo que otro cambió en el portal después de abrir la pantalla', () => {
    const vivo = item([{ id: 'SUITABLE_FOR_MORTGAGE_LOAN', value_id: '242085', value_name: 'Sí' }])
    const { body } = armarActualizacionMl(vivo, { valores: { HAS_LIFT: { value_name: 'Sí' } } }, raw)
    const attrs = body.attributes as { id: string; value_name?: string | null }[]
    expect(attrs.find(a => a.id === 'SUITABLE_FOR_MORTGAGE_LOAN')?.value_name).toBe('Sí')
  })
  it('un cambio igual a lo que ya hay no cuenta', () => {
    const { cambiados } = armarActualizacionMl(item(), { valores: { ROOMS: { value_name: '4' } } }, raw)
    expect(cambiados).toEqual([])
  })
  it('título, precio y fotos solo si cambian', () => {
    const { body, cambiados } = armarActualizacionMl(item(), { titulo: 'Nuevo', valores: {}, precio: 100, fotos: ['https://x/1.jpg'] }, raw)
    expect(body.title).toBe('Nuevo')
    expect(body.price).toBeUndefined()
    expect(body.pictures).toEqual([{ source: 'https://x/1.jpg' }])
    expect(cambiados).toEqual(['titulo', 'fotos'])
  })
  it('vaciar usa ML_VALOR_VACIO o falla si ML no permite vaciar', () => {
    // Ajustar al resultado de la Tarea 1: si ML_VALOR_VACIO es null, esperar el throw.
    const r = () => armarActualizacionMl(item(), { valores: { ROOMS: null } }, raw)
    expect(r).not.toThrow() // o .toThrow(/no se puede vaciar/) si ML_VALOR_VACIO === null
  })
})

describe('normalizarMl', () => {
  it('agrega la unidad a expensas y superficies peladas', () => {
    expect(normalizarMl('MAINTENANCE_FEE', '600000')).toBe('600000 ARS')
    expect(normalizarMl('COVERED_AREA', '90')).toBe('90 m²')
    expect(normalizarMl('ROOMS', '4')).toBe('4')
  })
})
```

- [ ] **Step 3:** correr → FAIL.

- [ ] **Step 4: `normalizeUnit` en `mapping.ts`** — cambiar `function normalizeUnit` por `export function normalizeUnit` y agregar la línea:

```ts
  if (attr.id === 'MAINTENANCE_FEE') return { ...attr, value_name: `${v} ARS` } // default_unit de ML
```
(debajo de la de `PROPERTY_AGE`; actualizar el comentario de la función: expensas incluidas, 2026-09-30.)

- [ ] **Step 5: `prefill.ts`** — cortar `derivedPrefill` de `ml-attributes/route.ts` tal cual, exportarla desde `lib/portals/mercadolibre/prefill.ts` (tipo `Property` de `../types`, `AttributeOverride` de `./category-attributes`) e importarla en la ruta.

- [ ] **Step 6: `edicion.ts`**

```ts
// lib/portals/mercadolibre/edicion.ts
/**
 * Edición de un ítem YA publicado en ML. Puro.
 * Regla: se parte del ítem VIVO (re-leído al guardar), se aplican solo los
 * cambios de la persona y se envía la lista COMPLETA de atributos escribibles,
 * así el resultado no depende de si ML fusiona o reemplaza (Tarea 1 lo midió).
 */
import { aplicarCambios, mismoValor, type CambiosDeValores, type Valores } from '../edicion-comun'
import { normalizeUnit } from './mapping'
import type { CategoryAttribute, MlRawAttribute } from './category-attributes'
import { ML_MAX_FOTOS_AVISO } from '../photo-limits'

export interface MlItemVivo {
  id: string; title: string; status: string; category_id: string; price: number; permalink?: string
  attributes: { id: string; value_id: string | null; value_name: string | null }[]
}
export interface CambiosMl { titulo?: string; valores: CambiosDeValores; precio?: number; fotos?: string[] }

/** Resultado de la Tarea 1 (sonda 2026-09-30). null = ML no deja vaciar. */
export const ML_VALOR_VACIO: { value_id?: string | null; value_name?: string | null } | null = { value_id: '-1', value_name: null }

// Calculados por ML: si se mandan, ML los marca como warning (cause 3611).
const CALCULADOS = new Set(['HAS_LOWER_PRICE', 'BASE_PRICE', 'PRICE_TO_PAY', 'HAS_DISCOUNT'])

export function normalizarMl(id: string, v: string): string {
  return normalizeUnit({ id, value_name: v }).value_name ?? v
}

export function valoresDesdeItem(item: MlItemVivo, schema: readonly CategoryAttribute[]): Valores {
  const porId = new Map(schema.map(a => [a.id, a]))
  const out: Valores = {}
  for (const a of item.attributes) {
    const def = porId.get(a.id)
    if (!def) continue
    if (def.valueType === 'list' && a.value_id) out[a.id] = { value_id: a.value_id }
    else if (a.value_name) out[a.id] = { value_name: a.value_name }
  }
  return out
}

function escribibles(raw: readonly MlRawAttribute[]): Set<string> {
  return new Set(raw.filter(r => !r.tags?.read_only && !r.tags?.fixed && !CALCULADOS.has(r.id)).map(r => r.id))
}

export function armarActualizacionMl(item: MlItemVivo, cambios: CambiosMl, raw: readonly MlRawAttribute[]) {
  const permitidos = escribibles(raw)
  const vivos: Valores = {}
  for (const a of item.attributes) {
    if (!permitidos.has(a.id)) continue
    vivos[a.id] = a.value_id ? { value_id: a.value_id, value_name: a.value_name ?? undefined } : { value_name: a.value_name ?? undefined }
  }
  const ids: string[] = []
  for (const [id, v] of Object.entries(cambios.valores)) {
    if (!permitidos.has(id)) continue
    if (v === null && ML_VALOR_VACIO === null) throw new Error(`MercadoLibre no deja vaciar "${id}"; cambialo por otro valor.`)
    if (!mismoValor(vivos[id], v ?? undefined, s => normalizarMl(id, s))) ids.push(id)
  }
  const finales = aplicarCambios(vivos, Object.fromEntries(Object.entries(cambios.valores).filter(([id]) => permitidos.has(id))))
  const attributes = [
    ...Object.entries(finales).map(([id, v]) => normalizeUnit({ id, ...(v.value_id ? { value_id: v.value_id } : { value_name: v.value_name }) })),
    ...Object.entries(cambios.valores).filter(([id, v]) => v === null && permitidos.has(id) && vivos[id]).map(([id]) => ({ id, ...ML_VALOR_VACIO })),
  ]
  const body: Record<string, unknown> = { attributes }
  const cambiaTitulo = cambios.titulo !== undefined && cambios.titulo.trim() !== item.title.trim()
  const cambiaPrecio = cambios.precio !== undefined && cambios.precio !== item.price
  if (cambiaTitulo) body.title = cambios.titulo!.trim() // `!`: cambiaTitulo ya garantiza que existe
  if (cambiaPrecio) body.price = cambios.precio
  if (cambios.fotos !== undefined) body.pictures = cambios.fotos.slice(0, ML_MAX_FOTOS_AVISO).map(source => ({ source }))
  const cambiados = [
    ...(cambiaTitulo ? ['titulo'] : []), ...ids,
    ...(cambiaPrecio ? ['precio'] : []), ...(cambios.fotos !== undefined ? ['fotos'] : []),
  ]
  return { body, cambiados }
}
```
Orden de `cambiados`: título, ids de datos, precio, fotos. Ajustar `ML_VALOR_VACIO` y el test de vaciar al resultado de la Tarea 1.

- [ ] **Step 7:** correr la suite de la config → PASS (incluye `mapping.test.ts`, `category-attributes.test.ts` y los existentes de ML). tsc limpio.
- [ ] **Step 8: Commit + push** `feat(ml): armar la actualización de un aviso publicado sin perder datos; expensas con ARS`.

---

### Task 4: Argenprop — leer el aviso, armar la actualización, apto crédito y apto profesional

**Files:**
- Modify: `lib/portals/argenprop/field-schema.ts` (+`APTO_CREDITO`, +`APTO_PROFESIONAL`)
- Modify: `lib/portals/argenprop/mapping.ts` (`AptoCredito` al publicar; `APTO_CREDITO` va a `SPECIAL_FIELDS`; tipos `Contacto?`, `AceptaPermuta?`)
- Modify: `lib/portals/argenprop/field-schema.test.ts`, `lib/portals/argenprop/mapping.test.ts`
- Create: `lib/portals/argenprop/edicion.ts`, `lib/portals/argenprop/edicion.test.ts`

**Interfaces:**
- Consumes: Tarea 2.
- Produces:
  - `interface ApAvisoVivo { Codigo: string; IdAviso: number; Titulo: string; Descripcion: string; AptoCredito?: boolean; AceptaPermuta?: boolean; Categoria: { Tipo: string; SubTipo?: string }; Publicacion: { EstadoPublicacion?: string; Visible: boolean }; Precio: { Monto: number; Moneda: string; Operacion: string; Mostrar: boolean }; Caracteristicas: { Id: string; Valor: string | number | boolean }[]; Multimedia: { Tipo: string; Url: string }[]; Localizacion: { Calle?: { Nombre: string; Numero: string }; Latitud?: number; Longitud?: number; Localidad: { Id: string }; Barrio?: { Id: string } }; Contacto?: Record<string, unknown> }`
  - `valoresDesdeAviso(aviso: ApAvisoVivo, schema: readonly ApField[]): Valores`
  - `interface CambiosAp { titulo?: string; descripcion?: string; valores: CambiosDeValores; precio?: number; fotos?: string[] }`
  - `armarAvisoActualizado(aviso: ApAvisoVivo, cambios: CambiosAp, schema: readonly ApField[], idAnunciante: number): { dto: Record<string, unknown>; cambiados: string[] }`
  - `normalizarAp(id: string, v: string): string`

- [ ] **Step 1: Tests de schema/mapping** (agregar)

```ts
// field-schema.test.ts
it('ofrece apto crédito siempre y apto profesional solo en departamento y PH', () => {
  const ids = (t: string) => [...getApSchema({ property_type: t }).required, ...getApSchema({ property_type: t }).recommended].map(f => f.id)
  expect(ids('departamento')).toEqual(expect.arrayContaining(['APTO_CREDITO', 'APTO_PROFESIONAL']))
  expect(ids('ph')).toContain('APTO_PROFESIONAL')
  expect(ids('casa')).toContain('APTO_CREDITO')
  expect(ids('casa')).not.toContain('APTO_PROFESIONAL')
})
// mapping.test.ts
it('APTO_CREDITO va al campo AptoCredito, no a Caracteristicas', () => {
  const dto = propertyToAvisoDto(baseProperty(), { ...opts, attributeOverrides: { APTO_CREDITO: { value_name: 'Sí' }, APTO_PROFESIONAL: { value_name: 'Sí' } } })
  expect(dto.AptoCredito).toBe(true)
  expect(dto.Caracteristicas.find(c => c.Id === 'APTO_CREDITO')).toBeUndefined()
  expect(dto.Caracteristicas.find(c => c.Id === 'APTO_PROFESIONAL')?.Valor).toBe(true)
})
```
(Usar los helpers `baseProperty`/`opts` que ya existan en el archivo, con su nombre real.)

- [ ] **Step 2: Tests de `edicion.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { valoresDesdeAviso, armarAvisoActualizado, type ApAvisoVivo } from './edicion'
import { getApSchema } from './field-schema'

const schema = (() => { const s = getApSchema({ property_type: 'departamento' }); return [...s.required, ...s.recommended] })()
const aviso = (): ApAvisoVivo => ({
  Codigo: '60U6_x', IdAviso: 1, Titulo: 'T', Descripcion: 'D', AptoCredito: false, AceptaPermuta: false,
  Categoria: { Tipo: 'DEPARTAMENTO', SubTipo: 'DEPARTAMENTO' },
  Publicacion: { EstadoPublicacion: 'VIGENTE', Visible: true },
  Precio: { Monto: 220000, Moneda: 'USD', Operacion: 'VENTA', Mostrar: true },
  Caracteristicas: [
    { Id: 'ESTADO_PROPIEDAD', Valor: 'Muy_Bueno' }, { Id: 'DISPOSICION', Valor: 'Contra_Frente' },
    { Id: 'SUPERFICIE_CUBIERTA', Valor: 80.0 }, { Id: 'CANTIDAD_TOILETTES', Valor: 1 },
  ],
  Multimedia: [{ Tipo: 'FOTO', Url: 'https://static1.sosiva451.com/1.jpg' }],
  Localizacion: { Calle: { Nombre: 'Doblas', Numero: '248' }, Latitud: -34.6, Longitud: -58.4, Localidad: { Id: 'LOCALIDAD_2102' }, Barrio: { Id: 'BARRIO_3' } },
  Contacto: { Nombre: 'Diego' },
})

describe('valoresDesdeAviso', () => {
  it('traduce las formas del GET a los ids del catálogo', () => {
    const v = valoresDesdeAviso(aviso(), schema)
    expect(v.ESTADO_PROPIEDAD).toEqual({ value_id: 'MUY_BUENO' })
    expect(v.DISPOSICION).toEqual({ value_id: 'CONTRA_FRENTE' })
    expect(v.SUPERFICIE_CUBIERTA).toEqual({ value_name: '80' })
    expect(v.APTO_CREDITO).toEqual({ value_name: 'No' })
    expect(v.TIPO_OPERACION).toEqual({ value_id: 'VENTA' })
  })
})

describe('armarAvisoActualizado', () => {
  it('conserva todo lo que no se tocó (fotos, localización, contacto, características ajenas)', () => {
    const { dto, cambiados } = armarAvisoActualizado(aviso(), { valores: { EXPENSAS: { value_name: '600000' } } }, schema, 281022)
    expect(cambiados).toEqual(['EXPENSAS'])
    expect(dto.Multimedia).toEqual(aviso().Multimedia)
    expect(dto.Localizacion).toEqual({ Calle: { Nombre: 'Doblas', Numero: '248' }, Latitud: -34.6, Longitud: -58.4, Localidad: { Id: 'LOCALIDAD_2102' }, Barrio: { Id: 'BARRIO_3' } })
    expect(dto.Contacto).toEqual({ Nombre: 'Diego' })
    expect(dto.Categoria).toEqual({ Tipo: 'DEPARTAMENTO', Subtipo: 'DEPARTAMENTO' })
    const c = dto.Caracteristicas as { Id: string; Valor: unknown }[]
    expect(c).toEqual(expect.arrayContaining([
      { Id: 'EXPENSAS', Valor: 600000 }, { Id: 'CANTIDAD_TOILETTES', Valor: 1 },
      { Id: 'ESTADO_PROPIEDAD', Valor: 'MUY_BUENO' }, { Id: 'DISPOSICION', Valor: 'CONTRA_FRENTE' },
    ]))
  })
  it('apto crédito va al campo propio', () => {
    const { dto } = armarAvisoActualizado(aviso(), { valores: { APTO_CREDITO: { value_name: 'Sí' } } }, schema, 1)
    expect(dto.AptoCredito).toBe(true)
  })
  it('vaciar saca la característica', () => {
    const { dto } = armarAvisoActualizado(aviso(), { valores: { DISPOSICION: null } }, schema, 1)
    expect((dto.Caracteristicas as { Id: string }[]).some(c => c.Id === 'DISPOSICION')).toBe(false)
  })
  it('precio y fotos del envío automático', () => {
    const { dto, cambiados } = armarAvisoActualizado(aviso(), { valores: {}, precio: 210000, fotos: ['https://a/1.jpg'] }, schema, 1)
    expect((dto.Precio as { Monto: number }).Monto).toBe(210000)
    expect(dto.Multimedia).toEqual([{ Tipo: 'FOTO', Url: 'https://a/1.jpg' }])
    expect(cambiados).toEqual(['precio', 'fotos'])
  })
})
```

- [ ] **Step 3:** correr → FAIL.

- [ ] **Step 4: schema** — en `getApSchema`, al final del `recommended.push(...)`:

```ts
    { id: 'APTO_CREDITO', name: 'Apto crédito', valueType: 'boolean', required: false },
  )
  // APTO_PROFESIONAL existe en el catálogo de Argenprop solo para DEPARTAMENTO
  // (y DEPARTAMENTO_TIPO_CASA); en CASA no está (verificado 2026-09-26).
  if (tipo === 'DEPARTAMENTO') {
    recommended.push({ id: 'APTO_PROFESIONAL', name: 'Apto profesional', valueType: 'boolean', required: false })
  }
```
(`ph` mapea a `tipo: 'DEPARTAMENTO'`, así que queda cubierto.)

- [ ] **Step 5: mapping** — `SPECIAL_FIELDS` suma `'APTO_CREDITO'`; en el DTO: `AptoCredito: /^(s[ií]|true|1)$/i.test(eff.APTO_CREDITO?.value_name ?? '')` sólo si `eff.APTO_CREDITO` existe (`...(eff.APTO_CREDITO ? { AptoCredito: ... } : {})`). Agregar a `AvisoPublicacionDto` los opcionales `AceptaPermuta?: boolean` y `Contacto?: Record<string, unknown>`.

- [ ] **Step 6: `edicion.ts`**

```ts
// lib/portals/argenprop/edicion.ts
/**
 * Edición de un aviso YA publicado en Argenprop. Puro.
 * PUT /v1/avisos REEMPLAZA el aviso entero: por eso se parte del aviso vivo
 * (GET /v1/avisos/{Codigo}) y se devuelve completo, con solo los cambios
 * aplicados. Mandar la ficha, como hacía el worker, borraba AptoCredito y lo
 * corregido a mano en el portal.
 */
import { mismoValor, type CambiosDeValores, type Valores } from '../edicion-comun'
import type { ApField } from './field-schema'
import { AP_MAX_FOTOS_AVISO } from '../photo-limits'

export interface ApAvisoVivo { /* tal cual la interfaz de "Produces" */
  Codigo: string; IdAviso: number; Titulo: string; Descripcion: string
  AptoCredito?: boolean; AceptaPermuta?: boolean
  Categoria: { Tipo: string; SubTipo?: string }
  Publicacion: { EstadoPublicacion?: string; Visible: boolean }
  Precio: { Monto: number; Moneda: string; Operacion: string; Mostrar: boolean }
  Caracteristicas: { Id: string; Valor: string | number | boolean }[]
  Multimedia: { Tipo: string; Url: string }[]
  Localizacion: { Calle?: { Nombre: string; Numero: string }; Latitud?: number; Longitud?: number; Localidad: { Id: string }; Barrio?: { Id: string } }
  Contacto?: Record<string, unknown>
}
export interface CambiosAp { titulo?: string; descripcion?: string; valores: CambiosDeValores; precio?: number; fotos?: string[] }

const SI_NO = (b: boolean) => ({ value_name: b ? 'Sí' : 'No' })
const esSi = (s: string | undefined) => /^(s[ií]|true|1)$/i.test((s ?? '').normalize('NFC').trim())
// El GET devuelve "Muy_Bueno"/"Contra_Frente"; el catálogo y el PUT usan "MUY_BUENO".
const aId = (s: string) => (/^[A-Za-z_]+$/.test(s) ? s.toUpperCase() : s)

export function normalizarAp(_id: string, v: string): string {
  const n = Number(v.replace(/[^\d.-]/g, ''))
  return /^[\d.,\s]+(ars)?$/i.test(v.trim()) && !Number.isNaN(n) ? String(n) : v
}

export function valoresDesdeAviso(aviso: ApAvisoVivo, schema: readonly ApField[]): Valores {
  const porId = new Map(schema.map(f => [f.id, f]))
  const out: Valores = {
    TIPO_OPERACION: { value_id: aviso.Precio.Operacion },
    MONEDA: { value_id: aviso.Precio.Moneda },
    APTO_CREDITO: SI_NO(!!aviso.AptoCredito),
  }
  if (aviso.Categoria.SubTipo && porId.has('SUBTIPO')) out.SUBTIPO = { value_id: aId(aviso.Categoria.SubTipo) }
  for (const c of aviso.Caracteristicas) {
    const f = porId.get(c.Id)
    if (!f) continue
    if (f.valueType === 'boolean') out[c.Id] = SI_NO(c.Valor === true || esSi(String(c.Valor)))
    else if (f.valueType === 'list') out[c.Id] = { value_id: aId(String(c.Valor)) }
    else out[c.Id] = { value_name: String(c.Valor) } // 80.00 del JSON ya llega como el número 80
  }
  return out
}

function valorParaEnviar(f: ApField | undefined, v: { value_name?: string; value_id?: string }): string | number | boolean {
  const raw = v.value_id ?? v.value_name ?? ''
  if (f?.valueType === 'boolean') return esSi(raw)
  if (f?.valueType === 'number' || f?.valueType === 'number_unit') return Number(String(raw).replace(/[^\d.-]/g, ''))
  return aId(String(raw))
}

export function armarAvisoActualizado(aviso: ApAvisoVivo, cambios: CambiosAp, schema: readonly ApField[], idAnunciante: number) {
  const porId = new Map(schema.map(f => [f.id, f]))
  const actuales = valoresDesdeAviso(aviso, schema)
  const cambiados: string[] = []
  let aptoCredito = !!aviso.AptoCredito
  const caracteristicas = new Map<string, string | number | boolean>(
    aviso.Caracteristicas.map(c => [c.Id, typeof c.Valor === 'string' ? aId(c.Valor) : c.Valor]),
  )
  for (const [id, v] of Object.entries(cambios.valores)) {
    if (['TIPO_OPERACION', 'MONEDA', 'SUBTIPO'].includes(id)) continue // no se editan acá
    if (mismoValor(actuales[id], v ?? undefined, s => normalizarAp(id, s))) continue
    cambiados.push(id)
    if (id === 'APTO_CREDITO') { aptoCredito = v !== null && esSi(v.value_name); continue }
    if (v === null) caracteristicas.delete(id)
    else caracteristicas.set(id, valorParaEnviar(porId.get(id), v))
  }
  let titulo = aviso.Titulo, descripcion = aviso.Descripcion, monto = aviso.Precio.Monto, multimedia = aviso.Multimedia
  if (cambios.titulo !== undefined && cambios.titulo.trim() !== aviso.Titulo.trim()) { titulo = cambios.titulo.trim(); cambiados.push('titulo') }
  if (cambios.descripcion !== undefined && cambios.descripcion !== aviso.Descripcion) { descripcion = cambios.descripcion; cambiados.push('descripcion') }
  if (cambios.precio !== undefined && Math.round(cambios.precio) !== aviso.Precio.Monto) { monto = Math.round(cambios.precio); cambiados.push('precio') }
  if (cambios.fotos !== undefined) {
    // Conserva VIDEO/TOUR; reemplaza solo las FOTO.
    multimedia = [...cambios.fotos.slice(0, AP_MAX_FOTOS_AVISO).map(Url => ({ Tipo: 'FOTO', Url })), ...aviso.Multimedia.filter(m => m.Tipo !== 'FOTO')]
    cambiados.push('fotos')
  }
  const { Localizacion: L } = aviso
  const dto: Record<string, unknown> = {
    IdAnunciante: idAnunciante, Codigo: aviso.Codigo, Titulo: titulo, Descripcion: descripcion,
    AptoCredito: aptoCredito, AceptaPermuta: !!aviso.AceptaPermuta,
    Categoria: { Tipo: aviso.Categoria.Tipo, ...(aviso.Categoria.SubTipo ? { Subtipo: aId(aviso.Categoria.SubTipo) } : {}) },
    Publicacion: { Visible: aviso.Publicacion.Visible },
    Precio: { ...aviso.Precio, Monto: monto },
    Caracteristicas: [...caracteristicas].map(([Id, Valor]) => ({ Id, Valor })),
    Multimedia: multimedia,
    Localizacion: {
      ...(L.Calle ? { Calle: L.Calle } : {}), ...(L.Latitud != null ? { Latitud: L.Latitud } : {}),
      ...(L.Longitud != null ? { Longitud: L.Longitud } : {}), Localidad: { Id: L.Localidad.Id },
      ...(L.Barrio?.Id ? { Barrio: { Id: L.Barrio.Id } } : {}),
    },
    ...(aviso.Contacto ? { Contacto: aviso.Contacto } : {}),
  }
  return { dto, cambiados }
}
```

- [ ] **Step 7:** correr la suite → PASS (incluye los tests viejos de Argenprop). tsc limpio.
- [ ] **Step 8: Commit + push** `feat(argenprop): editar el aviso sin perder datos; apto crédito y apto profesional`.

---

### Task 5: Adapters — leer el aviso vivo y enviar la edición

**Files:**
- Modify: `lib/portals/mercadolibre/adapter.ts`, `lib/portals/argenprop/adapter.ts`

**Interfaces:**
- Consumes: `MlItemVivo`, `armarActualizacionMl` (T3); `ApAvisoVivo`, `armarAvisoActualizado` (T4).
- Produces:
  - `MercadoLibreAdapter.leerAviso(externalId: string): Promise<{ item: MlItemVivo; descripcion: string }>`
  - `MercadoLibreAdapter.enviarEdicion(externalId: string, body: Record<string, unknown>, descripcion?: string): Promise<void>`
  - `ArgenpropAdapter.leerAviso(codigo: string): Promise<ApAvisoVivo>`
  - `ArgenpropAdapter.enviarAviso(dto: Record<string, unknown>): Promise<void>`
  - `ArgenpropAdapter.idAnunciante(): number`

- [ ] **Step 1: ML** — agregar a la clase:

```ts
  /** Lee el ítem VIVO y su descripción (sub-recurso aparte en ML). */
  async leerAviso(externalId: string): Promise<{ item: MlItemVivo; descripcion: string }> {
    const item = await mlFetch<MlItemVivo>(`/items/${encodeURIComponent(externalId)}`)
    const desc = await mlFetch<{ plain_text?: string }>(`/items/${encodeURIComponent(externalId)}/description`)
      .catch(() => ({ plain_text: '' })) // un ítem sin descripción responde 404
    return { item, descripcion: desc.plain_text ?? '' }
  }

  /** PUT del ítem (cuerpo ya armado por armarActualizacionMl) y, si cambió, la descripción. */
  async enviarEdicion(externalId: string, body: Record<string, unknown>, descripcion?: string): Promise<void> {
    await mlFetch(`/items/${encodeURIComponent(externalId)}`, { method: 'PUT', body: JSON.stringify(body) })
    if (descripcion !== undefined) {
      await mlFetch(`/items/${encodeURIComponent(externalId)}/description`, { method: 'PUT', body: JSON.stringify({ plain_text: descripcion }) })
    }
  }
```
Y el `update(property, externalId)` viejo: reemplazar su cuerpo por `throw new Error('update() quedó en desuso: usar leerAviso + armarActualizacionMl + enviarEdicion (ver cambios-ficha.ts)')`. Grep antes: `grep -rn "\.update(property" lib app scripts` — el único llamador es `worker.ts` (se reescribe en T6). `scripts/smoke-test-portals-flow.ts` solo lee metadata.

- [ ] **Step 2: Argenprop** — agregar:

```ts
  idAnunciante(): number { return this.requireCreds().idAnunciante }

  async leerAviso(codigo: string): Promise<ApAvisoVivo> {
    return apGet<ApAvisoVivo>(this.requireCreds(), `/v1/avisos/${encodeURIComponent(codigo)}`)
  }

  /** PUT /v1/avisos con el aviso COMPLETO (armarAvisoActualizado). */
  async enviarAviso(dto: Record<string, unknown>): Promise<void> {
    await apFetch(this.requireCreds(), '/v1/avisos', { method: 'PUT', body: JSON.stringify(dto) })
  }
```
Y `update()` con el mismo `throw` de desuso.

- [ ] **Step 3:** tsc limpio; suite de la config sigue verde (los adapters no tienen test de red; `adapter.test.ts` de Argenprop debe seguir pasando — si probaba `update`, adaptar el test a que tira el error de desuso).
- [ ] **Step 4: Commit + push** `feat(portales): leer el aviso vivo y enviar ediciones desde los adapters`.

---

### Task 6: Envío automático por cambios de la ficha (lógica + worker)

**Files:**
- Create: `lib/portals/cambios-ficha.ts`, `lib/portals/cambios-ficha.test.ts`
- Modify: `lib/portals/worker-logic.ts` (+`estadoTrasFalloActualizacion`), `lib/portals/worker-logic.test.ts`
- Modify: `lib/portals/worker.ts` (`processUpdates`)

**Interfaces:**
- Produces:
  - `type CampoFicha = 'precio' | 'fotos' | 'expensas'`
  - `leerCambiosFicha(metadata: unknown): CampoFicha[]` (filtra valores desconocidos, sin repetidos)
  - `cambiosMlDesdeFicha(campos: CampoFicha[], p: { asking_price: number; photos: unknown[] | null; expensas: number | null }): CambiosMl`
  - `cambiosApDesdeFicha(campos: CampoFicha[], p: ...): CambiosAp`
  - `estadoTrasFalloActualizacion(metadata: unknown, motivo: string): Record<string, unknown>` — suma `intentos_actualizacion`; a los 3 deja `needs_update:false` y `actualizacion_fallida: { motivo, cambios_ficha, fecha }`; antes deja `needs_update:true`.
  - `metadataTrasExito(metadata: unknown): Record<string, unknown>` — borra `needs_update`, `update_in_progress`, `cambios_ficha`, `intentos_actualizacion`, `actualizacion_fallida`.

- [ ] **Step 1: Tests**

```ts
// lib/portals/cambios-ficha.test.ts
import { describe, it, expect } from 'vitest'
import { leerCambiosFicha, cambiosMlDesdeFicha, cambiosApDesdeFicha } from './cambios-ficha'

const p = { asking_price: 210000, photos: ['https://a/1.jpg', 'data:image/png;base64,xx', 'https://a/2.jpg'], expensas: 600000 }

describe('leerCambiosFicha', () => {
  it('solo campos conocidos y sin repetir', () => {
    expect(leerCambiosFicha({ cambios_ficha: ['precio', 'precio', 'titulo', 'expensas'] })).toEqual(['precio', 'expensas'])
  })
  it('marca vieja sin cambios_ficha → lista vacía (no se envía nada)', () => {
    expect(leerCambiosFicha({ needs_update: true })).toEqual([])
  })
})
describe('desde la ficha', () => {
  it('ML: solo lo marcado; expensas con ARS; fotos sin base64', () => {
    expect(cambiosMlDesdeFicha(['expensas'], p)).toEqual({ valores: { MAINTENANCE_FEE: { value_name: '600000 ARS' } } })
    expect(cambiosMlDesdeFicha(['precio', 'fotos'], p)).toEqual({ valores: {}, precio: 210000, fotos: ['https://a/1.jpg', 'https://a/2.jpg'] })
  })
  it('expensas borradas en la ficha vacían el dato', () => {
    expect(cambiosApDesdeFicha(['expensas'], { ...p, expensas: null })).toEqual({ valores: { EXPENSAS: null } })
  })
})
```

```ts
// worker-logic.test.ts (agregar)
describe('estadoTrasFalloActualizacion', () => {
  it('reintenta hasta 3 y después deja el fallo visible', () => {
    const m1 = estadoTrasFalloActualizacion({ cambios_ficha: ['precio'] }, 'ML 400')
    expect(m1).toMatchObject({ needs_update: true, intentos_actualizacion: 1 })
    const m3 = estadoTrasFalloActualizacion({ ...m1, intentos_actualizacion: 2 }, 'ML 400')
    expect(m3.needs_update).toBe(false)
    expect(m3.actualizacion_fallida).toMatchObject({ motivo: 'ML 400', cambios_ficha: ['precio'] })
  })
})
describe('metadataTrasExito', () => {
  it('limpia todas las marcas de actualización y conserva lo demás', () => {
    expect(metadataTrasExito({ needs_update: true, cambios_ficha: ['precio'], intentos_actualizacion: 2, ml_attributes: { A: 1 } }))
      .toEqual({ ml_attributes: { A: 1 } })
  })
})
```

- [ ] **Step 2:** correr → FAIL.

- [ ] **Step 3: `cambios-ficha.ts`**

```ts
// lib/portals/cambios-ficha.ts
/**
 * Qué se manda solo a los portales cuando cambia la ficha. Puro.
 * Solo precio, fotos y expensas (decisión del dueño 2026-09-26): título y
 * descripción los escriben también los asistentes de publicación, y
 * reenviarlos hacía que publicar en Argenprop le cambiara el título a ML.
 */
import { fotosPublicables } from './fotos-publicables'
import type { CambiosMl } from './mercadolibre/edicion'
import type { CambiosAp } from './argenprop/edicion'

export type CampoFicha = 'precio' | 'fotos' | 'expensas'
const CONOCIDOS: readonly CampoFicha[] = ['precio', 'fotos', 'expensas']
type Ficha = { asking_price: number; photos: unknown[] | null; expensas: number | null }

export function leerCambiosFicha(metadata: unknown): CampoFicha[] {
  const raw = (metadata as { cambios_ficha?: unknown } | null)?.cambios_ficha
  if (!Array.isArray(raw)) return []
  return CONOCIDOS.filter(c => raw.includes(c))
}

export function cambiosMlDesdeFicha(campos: CampoFicha[], p: Ficha): CambiosMl {
  const out: CambiosMl = { valores: {} }
  if (campos.includes('precio')) out.precio = p.asking_price
  if (campos.includes('fotos')) out.fotos = fotosPublicables(p.photos).validas
  if (campos.includes('expensas')) out.valores.MAINTENANCE_FEE = p.expensas ? { value_name: `${p.expensas} ARS` } : null
  return out
}

export function cambiosApDesdeFicha(campos: CampoFicha[], p: Ficha): CambiosAp {
  const out: CambiosAp = { valores: {} }
  if (campos.includes('precio')) out.precio = p.asking_price
  if (campos.includes('fotos')) out.fotos = fotosPublicables(p.photos).validas
  if (campos.includes('expensas')) out.valores.EXPENSAS = p.expensas ? { value_name: String(p.expensas) } : null
  return out
}
```
Si `ML_VALOR_VACIO` es `null` (T1), en ML las expensas borradas se omiten (`if (p.expensas)` → solo setear cuando hay valor) y el test ML correspondiente se ajusta.

- [ ] **Step 4: `worker-logic.ts`**

```ts
export const MAX_INTENTOS_ACTUALIZACION = 3

export function estadoTrasFalloActualizacion(metadata: unknown, motivo: string): Record<string, unknown> {
  const m = stripFlag(metadata, 'update_in_progress')
  const intentos = Number(m.intentos_actualizacion ?? 0) + 1
  if (intentos < MAX_INTENTOS_ACTUALIZACION) return { ...m, needs_update: true, intentos_actualizacion: intentos }
  return { ...m, needs_update: false, intentos_actualizacion: intentos,
    actualizacion_fallida: { motivo, cambios_ficha: m.cambios_ficha ?? [], fecha: new Date().toISOString() } }
}

export function metadataTrasExito(metadata: unknown): Record<string, unknown> {
  let m = { ...((metadata as Record<string, unknown>) ?? {}) }
  for (const k of ['needs_update', 'update_in_progress', 'cambios_ficha', 'intentos_actualizacion', 'actualizacion_fallida']) m = stripFlag(m, k)
  return m
}
```

- [ ] **Step 5: `processUpdates` en `worker.ts`** — reemplazar el bloque `try { await adapter.update(...) } catch {...}` por:

```ts
    const campos = leerCambiosFicha(locked.metadata)
    if (campos.length === 0) {
      // Marca vieja (trigger anterior) o sin campos relevantes: no sabemos qué
      // cambió, y reenviar la ficha entera es justo lo que pisaba lo corregido
      // a mano en el portal. Se limpia sin enviar.
      await supabase.from('property_listings').update({ metadata: metadataTrasExito(locked.metadata) as never }).eq('id', listing.id)
      continue
    }
    try {
      let cambiados: string[] = []
      if (listing.portal === 'mercadolibre') {
        const ml = adapter as MercadoLibreAdapter
        const { item } = await ml.leerAviso(listing.external_id)
        const raw = await getRawAttributes(item.category_id)
        const r = armarActualizacionMl(item, cambiosMlDesdeFicha(campos, property), raw)
        cambiados = r.cambiados
        if (cambiados.length > 0) await ml.enviarEdicion(listing.external_id, r.body)
      } else if (listing.portal === 'argenprop') {
        const ap = adapter as ArgenpropAdapter
        const aviso = await ap.leerAviso(listing.external_id)
        const s = getApSchema(property)
        const r = armarAvisoActualizado(aviso, cambiosApDesdeFicha(campos, property), [...s.required, ...s.recommended], ap.idAnunciante())
        cambiados = r.cambiados
        if (cambiados.length > 0) await ap.enviarAviso(r.dto)
      }
      await supabase.from('property_listings').update({ metadata: metadataTrasExito(locked.metadata) as never, last_error: null }).eq('id', listing.id)
      if (cambiados.length > 0) {
        await writeAudit(supabase, { listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName, eventType: 'updated', payload: { origen: 'ficha', cambiados } })
      }
    } catch (err) {
      const { paraElLog } = mensajeYDetalle(err)
      await supabase.from('property_listings')
        .update({ metadata: estadoTrasFalloActualizacion(locked.metadata, paraElLog) as never, last_error: paraElLog })
        .eq('id', listing.id)
      await writeAudit(supabase, { listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName, eventType: 'failed', errorMessage: paraElLog, payload: { origen: 'ficha', campos } })
      console.error(`[update-listing] ${listing.portal} ${listing.id}`, paraElLog)
    }
```
Imports nuevos: `leerCambiosFicha, cambiosMlDesdeFicha, cambiosApDesdeFicha` de `./cambios-ficha`; `armarActualizacionMl` de `./mercadolibre/edicion`; `armarAvisoActualizado` de `./argenprop/edicion`; `getRawAttributes` de `./mercadolibre/category-attributes`; `getApSchema` de `./argenprop/field-schema`; `MercadoLibreAdapter`, `ArgenpropAdapter`; `estadoTrasFalloActualizacion, metadataTrasExito` de `./worker-logic`; `mensajeYDetalle` de `./types`. Zonaprop: ya hace `continue` porque su adapter no está habilitado; dejarlo así.

- [ ] **Step 6:** suite verde; tsc limpio.
- [ ] **Step 7: Commit + push** `feat(portales): el envío automático manda solo lo que cambió en la ficha`.

---

### Task 7: Migración del trigger (se escribe ahora, se APLICA en la Tarea 11)

**Files:**
- Create: `supabase/migrations/20260930000001_requeue_solo_cambios.sql` (mirar el directorio antes: si el prefijo existe, usar el siguiente)
- Create: `scripts/apply-requeue-solo-cambios-pg.ts`

- [ ] **Step 1: SQL**

```sql
-- Re-encolar listings SOLO por precio, fotos y expensas, anotando QUÉ cambió
-- (metadata.cambios_ficha). Antes cualquier cambio de título/descripción/fotos/…
-- reenviaba la ficha entera y pisaba lo corregido a mano en los portales.
-- APLICAR DESPUÉS de deployar el worker nuevo (con el viejo, reenviaría todo).
CREATE OR REPLACE FUNCTION public.requeue_listings_on_update()
RETURNS TRIGGER AS $$
DECLARE
  cambios text[] := ARRAY[]::text[];
BEGIN
  IF NEW.status = 'approved' THEN
    IF OLD.asking_price IS DISTINCT FROM NEW.asking_price THEN cambios := cambios || 'precio'::text; END IF;
    IF OLD.photos       IS DISTINCT FROM NEW.photos       THEN cambios := cambios || 'fotos'::text;  END IF;
    IF OLD.expensas     IS DISTINCT FROM NEW.expensas     THEN cambios := cambios || 'expensas'::text; END IF;

    IF array_length(cambios, 1) > 0 THEN
      UPDATE public.property_listings pl
         SET metadata = (COALESCE(pl.metadata, '{}'::jsonb) - 'actualizacion_fallida')
                        || jsonb_build_object(
                             'needs_update', true,
                             'intentos_actualizacion', 0,
                             'cambios_ficha', (
                               SELECT to_jsonb(array_agg(DISTINCT c ORDER BY c))
                                 FROM unnest(
                                   ARRAY(SELECT jsonb_array_elements_text(COALESCE(pl.metadata->'cambios_ficha', '[]'::jsonb)))
                                   || cambios
                                 ) AS c))
       WHERE pl.property_id = NEW.id AND pl.status = 'published';
    END IF;
  END IF;

  IF NEW.status IN ('sold', 'withdrawn') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.property_listings
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{needs_unpublish}', 'true'::jsonb)
     WHERE property_id = NEW.id AND status = 'published';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
(El trigger `trg_requeue_listings_on_update` ya existe y apunta a esta función: no se recrea.)

- [ ] **Step 2: Script que aplica y VERIFICA dentro de una transacción de prueba**

```ts
/**
 * Aplica 20260930000001_requeue_solo_cambios.sql y la PRUEBA sin dejar rastros:
 * dentro de BEGIN…ROLLBACK cambia el precio y el título de una propiedad con
 * listing publicado y verifica que cambios_ficha = ["precio"] (el título ya no dispara).
 * Correr: node --env-file=.env.local --import tsx scripts/apply-requeue-solo-cambios-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20260930000001_requeue_solo_cambios.sql', 'utf8'))
  const { rows: [def] } = await c.query(`SELECT pg_get_functiondef('public.requeue_listings_on_update'::regproc) AS d`)
  if (!def.d.includes('cambios_ficha') || def.d.includes('OLD.title')) throw new Error('la función no quedó actualizada')

  const { rows: [pl] } = await c.query(`
    SELECT pl.id, pl.property_id FROM property_listings pl JOIN properties p ON p.id = pl.property_id
     WHERE pl.status = 'published' AND p.status = 'approved' LIMIT 1`)
  if (!pl) throw new Error('no hay listing publicado para probar')
  await c.query('BEGIN')
  try {
    await c.query(`UPDATE properties SET asking_price = asking_price + 1, title = coalesce(title,'') || ' ' WHERE id = $1`, [pl.property_id])
    const { rows: [m] } = await c.query(`SELECT metadata FROM property_listings WHERE id = $1`, [pl.id])
    console.log('metadata tras el cambio:', JSON.stringify(m.metadata))
    if (JSON.stringify(m.metadata.cambios_ficha) !== '["precio"]') throw new Error('cambios_ficha inesperado')
    if (m.metadata.needs_update !== true) throw new Error('needs_update no quedó en true')
  } finally {
    await c.query('ROLLBACK')
  }
  await c.end()
  console.log('OK: trigger aplicado y verificado (prueba revertida)')
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Commit + push** (sin aplicar) `feat(db): el trigger de la ficha anota qué cambió y solo por precio, fotos y expensas`.

---

### Task 8: Rutas `ml-aviso`, `ap-aviso` y reintentar

**Files:**
- Create: `lib/portals/edicion-validacion.ts`, `lib/portals/edicion-validacion.test.ts`
- Create: `app/api/properties/[id]/ml-aviso/route.ts`
- Create: `app/api/properties/[id]/ap-aviso/route.ts`
- Create: `app/api/properties/[id]/portal-actualizacion/route.ts`

**Interfaces:**
- Produces:
  - `esquemaCambios(tituloMax: number)` → Zod `{ cambios: { titulo?: string ≤ tituloMax, descripcion?: string ≤ 5000, valores: Record<string, Valor | null> } }`
  - `validarIds(valores: CambiosDeValores, aceptados: ReadonlySet<string>, permiteVaciar: boolean): string | null` (mensaje de error o null)
  - `expensasDesdeCambio(v: Valor | null | undefined): number | null | undefined` (`undefined` = no tocar la ficha; `null` = vaciar)
  - Respuesta GET común: `interface AvisoParaEditar { portal: 'mercadolibre' | 'argenprop'; titulo: string; descripcion: string; descripcionFicha: string | null; tituloMax: number; valores: Valores; sugeridos: Valores; required: CampoAtributo[]; recommended: CampoAtributo[]; estado: string; externalUrl: string | null; permiteVaciar: boolean; otroPortal: string | null }`
  - POST: `{ ok: true; cambiados: string[]; expensasEnFicha: boolean }` · error `{ error: string }`

- [ ] **Step 1: Tests de validación**

```ts
import { describe, it, expect } from 'vitest'
import { esquemaCambios, validarIds, expensasDesdeCambio } from './edicion-validacion'

describe('validación de la edición', () => {
  it('rechaza títulos largos y descripciones de más de 5000', () => {
    expect(esquemaCambios(60).safeParse({ cambios: { titulo: 'x'.repeat(61), valores: {} } }).success).toBe(false)
    expect(esquemaCambios(60).safeParse({ cambios: { descripcion: 'x'.repeat(5001), valores: {} } }).success).toBe(false)
  })
  it('rechaza ids que la categoría no acepta y vaciar cuando no se puede', () => {
    expect(validarIds({ INVENTADO: { value_name: '1' } }, new Set(['ROOMS']), true)).toMatch(/INVENTADO/)
    expect(validarIds({ ROOMS: null }, new Set(['ROOMS']), false)).toMatch(/vaciar/)
    expect(validarIds({ ROOMS: { value_name: '2' } }, new Set(['ROOMS']), false)).toBeNull()
  })
  it('expensas: número, vacío o sin tocar', () => {
    expect(expensasDesdeCambio({ value_name: '600.000 ARS' })).toBe(600000)
    expect(expensasDesdeCambio(null)).toBeNull()
    expect(expensasDesdeCambio(undefined)).toBeUndefined()
  })
})
```

- [ ] **Step 2:** FAIL → implementar:

```ts
// lib/portals/edicion-validacion.ts
import { z } from 'zod'
import type { CambiosDeValores, Valor } from './edicion-comun'

const valor = z.object({ value_name: z.string().max(500).optional(), value_id: z.string().max(100).optional() }).strict()
export const esquemaCambios = (tituloMax: number) => z.object({
  cambios: z.object({
    titulo: z.string().trim().min(1).max(tituloMax).optional(),
    descripcion: z.string().max(5000).optional(),
    valores: z.record(z.string().regex(/^[A-Z0-9_]{1,60}$/), valor.nullable()),
  }).strict(),
})

export function validarIds(valores: CambiosDeValores, aceptados: ReadonlySet<string>, permiteVaciar: boolean): string | null {
  for (const [id, v] of Object.entries(valores)) {
    if (!aceptados.has(id)) return `El dato "${id}" no existe para esta categoría del portal.`
    if (v === null && !permiteVaciar) return `Este portal no deja vaciar un dato ya cargado ("${id}"); cambialo por otro valor.`
  }
  return null
}

/** Las expensas en pesos, como número; "600.000 ARS" → 600000. */
export function expensasDesdeCambio(v: Valor | null | undefined): number | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const n = Number((v.value_name ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
```

- [ ] **Step 3: `ml-aviso/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import { initPortals, getAdapter } from '@/lib/portals'
import { MercadoLibreAdapter } from '@/lib/portals/mercadolibre/adapter'
import { fetchCategoryAttributes, getRawAttributes } from '@/lib/portals/mercadolibre/category-attributes'
import { valoresDesdeItem, armarActualizacionMl, ML_VALOR_VACIO } from '@/lib/portals/mercadolibre/edicion'
import { derivedPrefill } from '@/lib/portals/mercadolibre/prefill'
import { resolverIdsDeLista } from '@/lib/portals/datos-visita'
import { sugeridosPara, type Valores } from '@/lib/portals/edicion-comun'
import { esquemaCambios, validarIds, expensasDesdeCambio } from '@/lib/portals/edicion-validacion'
import { writeAudit } from '@/lib/portals/audit'
import { mensajeYDetalle } from '@/lib/portals/types'
import { TITULO_MAX_ML } from '@/lib/portals/titulo-sugerido'
import type { Database } from '@/types/database.types'

const admin = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/** Auth + propiedad + listing publicado + adapter. Devuelve Response si algo falla. */
async function contexto(id: string) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  const supabase = admin()
  const { data: property } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
  if (!property) return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir', property))) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) }
  }
  const { data: listing } = await supabase.from('property_listings').select('id, status, external_id, external_url')
    .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
  if (!listing?.external_id || listing.status === 'closed') {
    return { error: NextResponse.json({ error: 'Este aviso no está publicado en MercadoLibre o ya se cerró.' }, { status: 409 }) }
  }
  await initPortals()
  const ml = getAdapter('mercadolibre')
  if (!(ml instanceof MercadoLibreAdapter) || !ml.enabled) {
    return { error: NextResponse.json({ error: 'MercadoLibre no está conectado.' }, { status: 412 }) }
  }
  return { user, supabase, property, listing: { ...listing, external_id: listing.external_id }, ml }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const ctx = await contexto(id)
    if ('error' in ctx) return ctx.error
    const { item, descripcion } = await ctx.ml.leerAviso(ctx.listing.external_id)
    const { required, recommended } = await fetchCategoryAttributes(item.category_id)
    const schema = [...required, ...recommended]
    const valores = valoresDesdeItem(item, schema)
    const deLaVisita = resolverIdsDeLista((((ctx.property.portal_data ?? {}) as { ml?: Valores }).ml ?? {}), schema)
    const sugeridos = sugeridosPara(valores, { ...derivedPrefill(ctx.property), ...deLaVisita }, new Set(schema.map(a => a.id)))
    const { data: otro } = await ctx.supabase.from('property_listings').select('external_id')
      .eq('property_id', id).eq('portal', 'argenprop').eq('status', 'published').maybeSingle()
    return NextResponse.json({
      portal: 'mercadolibre', titulo: item.title, descripcion, descripcionFicha: ctx.property.description,
      tituloMax: TITULO_MAX_ML, valores, sugeridos, required, recommended, estado: item.status,
      externalUrl: item.permalink ?? ctx.listing.external_url, permiteVaciar: ML_VALOR_VACIO !== null,
      otroPortal: otro?.external_id ? 'Argenprop' : null,
    })
  } catch (err) {
    return NextResponse.json({ error: mensajeYDetalle(err).mensaje }, { status: 502 })
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await contexto(id)
  if ('error' in ctx) return ctx.error
  const parsed = esquemaCambios(TITULO_MAX_ML).safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  const { cambios } = parsed.data
  try {
    // Se RE-lee el aviso: si alguien lo tocó en ML mientras la pantalla estaba abierta, se respeta.
    const { item, descripcion } = await ctx.ml.leerAviso(ctx.listing.external_id)
    const raw = await getRawAttributes(item.category_id)
    const { required, recommended } = await fetchCategoryAttributes(item.category_id)
    const errorIds = validarIds(cambios.valores, new Set([...required, ...recommended].map(a => a.id)), ML_VALOR_VACIO !== null)
    if (errorIds) return NextResponse.json({ error: errorIds }, { status: 400 })
    const { body, cambiados } = armarActualizacionMl(item, { titulo: cambios.titulo, valores: cambios.valores }, raw)
    const nuevaDescripcion = cambios.descripcion !== undefined && cambios.descripcion !== descripcion ? cambios.descripcion : undefined
    if (nuevaDescripcion !== undefined) cambiados.push('descripcion')
    if (cambiados.length === 0) return NextResponse.json({ ok: true, cambiados: [], expensasEnFicha: false })
    await ctx.ml.enviarEdicion(ctx.listing.external_id, body, nuevaDescripcion)
    await writeAudit(ctx.supabase, { listingId: ctx.listing.id, propertyId: id, portal: 'mercadolibre', eventType: 'updated',
      payload: { origen: 'edicion', cambiados }, actor: ctx.user.profile.full_name ?? ctx.user.id })
    // DESPUÉS del éxito en el portal: las expensas pasan a la ficha (y el trigger las lleva al otro portal).
    const expensas = expensasDesdeCambio(cambios.valores.MAINTENANCE_FEE)
    let expensasEnFicha = false
    if (expensas !== undefined && cambiados.includes('MAINTENANCE_FEE')) {
      const { error } = await ctx.supabase.from('properties').update({ expensas }).eq('id', id)
      expensasEnFicha = !error
    }
    return NextResponse.json({ ok: true, cambiados, expensasEnFicha })
  } catch (err) {
    const { mensaje, paraElLog } = mensajeYDetalle(err)
    await writeAudit(ctx.supabase, { listingId: ctx.listing.id, propertyId: id, portal: 'mercadolibre', eventType: 'failed',
      errorMessage: paraElLog, payload: { origen: 'edicion' }, actor: ctx.user.profile.full_name ?? ctx.user.id })
    return NextResponse.json({ error: mensaje }, { status: 502 })
  }
}
```

- [ ] **Step 4: `ap-aviso/route.ts`** — misma estructura, con estas diferencias exactas:
  - listing `portal='argenprop'`; 409 si no hay `external_id` (el Codigo).
  - adapter `ArgenpropAdapter`; `const aviso = await ctx.ap.leerAviso(ctx.listing.external_id)`.
  - schema: `const s = getApSchema(ctx.property); const schema = [...s.required, ...s.recommended]`.
  - GET: `valores = valoresDesdeAviso(aviso, schema)`; conocidos = `{ ...derivedPrefill(ctx.property) /* de argenprop/field-schema */, ...(portal_data.ap ?? {}) }`; `titulo: aviso.Titulo`, `descripcion: aviso.Descripcion`, `tituloMax: TITULO_MAX_AP`, `estado: aviso.Publicacion.EstadoPublicacion ?? ''`, `externalUrl: ctx.listing.external_url`, `permiteVaciar: true`, `otroPortal`: ML publicado → `'MercadoLibre'`. Quitar de `valores`/`sugeridos` y del `required` que se devuelve los campos `TIPO_OPERACION`, `MONEDA`, `SUBTIPO` (no se editan acá).
  - POST: `esquemaCambios(TITULO_MAX_AP)`; `validarIds(..., aceptados sin esos tres, true)`; `const { dto, cambiados } = armarAvisoActualizado(aviso, cambios, schema, ctx.ap.idAnunciante())`; si `cambiados.length > 0` → `await ctx.ap.enviarAviso(dto)`; expensas desde `cambios.valores.EXPENSAS`.
  - Si `aviso.Publicacion.EstadoPublicacion` es `ELIMINADO` → 409 "El aviso fue eliminado en Argenprop".

- [ ] **Step 5: `portal-actualizacion/route.ts`** (POST `{ portal: 'mercadolibre' | 'argenprop' }` → Reintentar)

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import type { Database } from '@/types/database.types'

const cuerpo = z.object({ portal: z.enum(['mercadolibre', 'argenprop']) })

/** "Reintentar" un envío automático que falló 3 veces: vuelve a encolarlo con los mismos cambios. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { id } = await params
  if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir'))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const p = cuerpo.safeParse(await req.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 })
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: l } = await supabase.from('property_listings').select('id, metadata').eq('property_id', id).eq('portal', p.data.portal).maybeSingle()
  const meta = (l?.metadata ?? {}) as Record<string, unknown>
  const fallida = meta.actualizacion_fallida as { cambios_ficha?: string[] } | undefined
  if (!l || !fallida) return NextResponse.json({ error: 'No hay un envío fallido para reintentar.' }, { status: 409 })
  const { actualizacion_fallida: _f, ...resto } = meta
  await supabase.from('property_listings').update({
    metadata: { ...resto, needs_update: true, intentos_actualizacion: 0, cambios_ficha: fallida.cambios_ficha ?? [] } as never,
  }).eq('id', l.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6:** tests verdes; tsc limpio; `npx eslint` sobre los archivos nuevos.
- [ ] **Step 7: Commit + push** `feat(portales): rutas para leer y guardar la edición de un aviso publicado`.

---

### Task 9: Pantalla "Editar datos del aviso"

**Files:**
- Create: `components/properties/wizards/EditarAvisoPanel.tsx`
- Create: `components/properties/wizards/editar-aviso-estado.ts`, `components/properties/wizards/editar-aviso-estado.test.ts`
- Modify: `components/properties/wizards/ml/ManageListingPanel.tsx`, `components/properties/wizards/ap/ManageListingPanel.tsx`
- Modify: `components/properties/wizards/ml/types.ts`, `components/properties/wizards/ap/types.ts` (`metadata?: Record<string, unknown> | null` en `MlListing`/`ApListing`)
- Modify: `vitest.editar-aviso.config.ts` (sumar `components/properties/wizards/editar-aviso-estado.test.ts`)

**Interfaces:**
- Consumes: GET/POST de T8 (`AvisoParaEditar`), `AttrField`/`hasValue` de `components/properties/wizards/AttrField.tsx`, `diferencias`/`aplicarCambios` (T2).
- Produces: `<EditarAvisoPanel propertyId portal="mercadolibre"|"argenprop" onCerrar={() => void} />`; `resumenDeCambios(cambios, campos, antes): string[]` (líneas "Expensas: vacío → 600000 ARS").

- [ ] **Step 1: Test del resumen (puro)**

```ts
import { describe, it, expect } from 'vitest'
import { resumenDeCambios } from './editar-aviso-estado'

const campos = [
  { id: 'MAINTENANCE_FEE', name: 'Expensas', valueType: 'number_unit' as const, required: false },
  { id: 'DISPOSITION', name: 'Disposición', valueType: 'list' as const, required: false, allowedValues: [{ id: '1', name: 'Frente' }, { id: '2', name: 'Contrafrente' }] },
]
it('arma una línea por cambio con nombres legibles', () => {
  expect(resumenDeCambios({ MAINTENANCE_FEE: { value_name: '600000 ARS' }, DISPOSITION: { value_id: '2' } }, campos,
    { DISPOSITION: { value_id: '1' } })).toEqual(['Expensas: vacío → 600000 ARS', 'Disposición: Frente → Contrafrente'])
})
it('vaciar se muestra como "vacío"', () => {
  expect(resumenDeCambios({ DISPOSITION: null }, campos, { DISPOSITION: { value_id: '1' } })).toEqual(['Disposición: Frente → vacío'])
})
```

- [ ] **Step 2:** FAIL → implementar `editar-aviso-estado.ts`:

```ts
import type { CambiosDeValores, Valor, Valores } from '@/lib/portals/edicion-comun'
import type { CampoAtributo } from './AttrField'

function legible(campo: CampoAtributo | undefined, v: Valor | null | undefined): string {
  if (!v || (!v.value_id && !v.value_name)) return 'vacío'
  if (v.value_id && campo?.allowedValues) return campo.allowedValues.find(a => a.id === v.value_id)?.name ?? v.value_id
  return v.value_name ?? v.value_id ?? 'vacío'
}

export function resumenDeCambios(cambios: CambiosDeValores, campos: readonly CampoAtributo[], antes: Valores): string[] {
  const porId = new Map(campos.map(c => [c.id, c]))
  return Object.entries(cambios).map(([id, v]) => `${porId.get(id)?.name ?? id}: ${legible(porId.get(id), antes[id])} → ${legible(porId.get(id), v)}`)
}
```

- [ ] **Step 3: `EditarAvisoPanel.tsx`** (cliente)

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader2, ExternalLink, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AttrField, type CampoAtributo } from './AttrField'
import { aplicarCambios, diferencias, type Valores } from '@/lib/portals/edicion-comun'
import { resumenDeCambios } from './editar-aviso-estado'

type Portal = 'mercadolibre' | 'argenprop'
interface Aviso {
  titulo: string; descripcion: string; descripcionFicha: string | null; tituloMax: number
  valores: Valores; sugeridos: Valores; required: CampoAtributo[]; recommended: CampoAtributo[]
  externalUrl: string | null; permiteVaciar: boolean; otroPortal: string | null
}
const NOMBRE: Record<Portal, string> = { mercadolibre: 'MercadoLibre', argenprop: 'Argenprop' }
const RUTA: Record<Portal, string> = { mercadolibre: 'ml-aviso', argenprop: 'ap-aviso' }

/** Lee el body sin romperse si el servidor devolvió una página de error HTML (504 de Netlify). */
async function leerJson(r: Response): Promise<Record<string, unknown>> {
  const t = await r.text()
  try { return JSON.parse(t) } catch { return { error: r.status === 504 ? 'El portal tardó demasiado. Probá de nuevo.' : `Error ${r.status}` } }
}

export function EditarAvisoPanel({ propertyId, portal, onCerrar }: { propertyId: string; portal: Portal; onCerrar: () => void }) {
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [valores, setValores] = useState<Valores>({})
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState<{ expensasEnFicha: boolean } | null>(null)

  async function cargar() {
    setError(null); setAviso(null); setListo(null)
    const r = await fetch(`/api/properties/${propertyId}/${RUTA[portal]}`)
    const j = await leerJson(r)
    if (!r.ok) { setError(String(j.error ?? 'No se pudo traer el aviso.')); return }
    const a = j as unknown as Aviso
    setAviso(a); setTitulo(a.titulo); setDescripcion(a.descripcion)
    setValores(aplicarCambios(a.valores, a.sugeridos)) // lo sugerido arranca completado y cuenta como cambio
  }
  useEffect(() => { void cargar() }, [propertyId, portal]) // eslint-disable-line react-hooks/exhaustive-deps

  const cambiosValores = useMemo(() => (aviso ? diferencias(aviso.valores, valores) : {}), [aviso, valores])
  const cambioTitulo = aviso && titulo.trim() !== aviso.titulo.trim()
  const cambioDescripcion = aviso && descripcion !== aviso.descripcion
  const total = Object.keys(cambiosValores).length + (cambioTitulo ? 1 : 0) + (cambioDescripcion ? 1 : 0)
  const campos = aviso ? [...aviso.required, ...aviso.recommended] : []

  async function guardar() {
    if (!aviso) return
    setEnviando(true); setError(null)
    try {
      const r = await fetch(`/api/properties/${propertyId}/${RUTA[portal]}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cambios: {
          ...(cambioTitulo ? { titulo: titulo.trim() } : {}),
          ...(cambioDescripcion ? { descripcion } : {}),
          valores: cambiosValores,
        } }),
      })
      const j = await leerJson(r)
      if (!r.ok) { setError(String(j.error ?? 'El portal rechazó el cambio.')); setConfirmando(false); return }
      setListo({ expensasEnFicha: j.expensasEnFicha === true })
    } finally { setEnviando(false) }
  }

  if (error && !aviso) return (
    <div className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
      <p>{error}</p>
      <div className="flex gap-2"><Button size="sm" onClick={() => void cargar()}>Reintentar</Button><Button size="sm" variant="ghost" onClick={onCerrar}>Volver</Button></div>
    </div>
  )
  if (!aviso) return <p className="flex items-center gap-2 py-10 justify-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Trayendo el aviso de {NOMBRE[portal]}…</p>
  if (listo) return (
    <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
      <p className="font-medium text-emerald-800">Listo, el aviso se actualizó.</p>
      {listo.expensasEnFicha && aviso.otroPortal && <p>También quedaron en la ficha y se van a mandar a {aviso.otroPortal} en unos minutos.</p>}
      {aviso.externalUrl && <a href={aviso.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline text-[color:var(--brand)]">Ver en {NOMBRE[portal]}<ExternalLink className="h-3 w-3" /></a>}
      <div><Button size="sm" variant="ghost" onClick={onCerrar}>Volver</Button></div>
    </div>
  )

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onCerrar}><ArrowLeft className="h-4 w-4 mr-1" />Volver</Button>
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Título y descripción (como están hoy en {NOMBRE[portal]})</p>
        <input value={titulo} maxLength={aviso.tituloMax} onChange={e => setTitulo(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm max-md:min-h-11" />
        <textarea value={descripcion} maxLength={5000} rows={8} onChange={e => setDescripcion(e.target.value)} className="w-full rounded-md border border-input px-3 py-2 text-sm" />
        {aviso.descripcionFicha && aviso.descripcionFicha !== descripcion && (
          <Button type="button" size="sm" variant="outline" onClick={() => setDescripcion(aviso.descripcionFicha ?? '')}>Usar la descripción de la ficha</Button>
        )}
      </section>
      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Datos del aviso</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {campos.map(a => {
            const sugerido = !!aviso.sugeridos[a.id] && !!cambiosValores[a.id]
            const tieneEnPortal = !!aviso.valores[a.id]
            return (
              <label key={a.id} className="space-y-1">
                <span className="text-sm">{a.name}{sugerido && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">Se va a agregar</span>}</span>
                <AttrField attr={a} value={valores[a.id]} onSet={v => {
                  if (!v && tieneEnPortal && !aviso.permiteVaciar) return // ML no deja vaciar (sonda T1)
                  setValores(prev => { const n = { ...prev }; if (v) n[a.id] = v; else delete n[a.id]; return n })
                }} />
              </label>
            )
          })}
        </div>
      </section>
      {error && <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {confirmando ? (
        <div className="space-y-3 rounded-lg border p-4 text-sm">
          <p className="font-medium">Vas a cambiar en {NOMBRE[portal]}:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {cambioTitulo && <li>Título</li>}
            {cambioDescripcion && <li>Descripción</li>}
            {resumenDeCambios(cambiosValores, campos, aviso.valores).map(l => <li key={l}>{l}</li>)}
          </ul>
          <div className="flex gap-2">
            <Button onClick={() => void guardar()} disabled={enviando}>{enviando ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Enviando…</> : 'Confirmar y enviar'}</Button>
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={enviando}>Volver a editar</Button>
          </div>
        </div>
      ) : (
        <div className="max-md:sticky max-md:bottom-0 max-md:-mx-4 max-md:border-t max-md:bg-background max-md:px-4 max-md:pt-3 max-md:pb-safe">
          <Button className="w-full" disabled={total === 0} onClick={() => setConfirmando(true)}>Guardar cambios ({total})</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Integrar en los dos `ManageListingPanel`** — agregar props `propertyId: string` y `onReintentarEnvio: () => void`; estado local `const [editando, setEditando] = useState(false)`; si `editando` → `return <EditarAvisoPanel propertyId={propertyId} portal="mercadolibre" onCerrar={() => setEditando(false)} />`. Arriba de "¿Qué querés hacer?" (solo si `!isClosed`):

```tsx
<Button onClick={() => setEditando(true)} className="w-full justify-start">
  <Pencil className="h-4 w-4 mr-2" />Editar datos del aviso
</Button>
```
Y el aviso de envío fallido (ambos paneles), debajo del bloque de datos del aviso:

```tsx
{(() => {
  const f = (listing.metadata?.actualizacion_fallida ?? null) as { motivo?: string } | null
  if (!f) return null
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-2">
      <p>No se pudo mandar un cambio de la ficha a este portal: {soloElMensaje(f.motivo ?? '')}</p>
      <Button size="sm" variant="outline" onClick={onReintentarEnvio}>Reintentar</Button>
    </div>
  )
})()}
```
En `MercadoLibreWizard.tsx` y `ArgenpropWizard.tsx` pasar `propertyId={propertyId}` y `onReintentarEnvio={async () => { const r = await fetch(`/api/properties/${propertyId}/portal-actualizacion`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ portal: 'mercadolibre' }) }); toast[r.ok ? 'success' : 'error'](r.ok ? 'Se va a reintentar en un minuto.' : 'No se pudo reintentar.'); await reload() }}` (con `'argenprop'` en el de Argenprop; ver si ese wizard llama `reload` igual). En Argenprop `isClosed` = nunca (no hay cerrado definitivo en el panel): el botón se muestra siempre que haya `external_id`.

- [ ] **Step 5:** test verde; tsc limpio; eslint en los archivos tocados. Probe de render: `scripts/editar-aviso.probe.tsx` con `renderToStaticMarkup(<EditarAvisoPanel …/>)` no sirve (hace fetch en efecto) → se valida en el QA de la Tarea 11.
- [ ] **Step 6: Commit + push** `feat(portales): pantalla "Editar datos del aviso" en ML y Argenprop`.

---

### Task 10: Revisión adversarial, PR y vista previa

- [ ] **Step 1:** `/code-review` (o subagente `feature-dev:code-reviewer`) sobre `origin/main..feat/editar-aviso-publicado`, y `/security-review` (toca inputs de terceros y avisos públicos). Verificar cada hallazgo antes de aplicarlo; lo aplicado vuelve a su tarea con test.
- [ ] **Step 2:** `git diff --name-only origin/main feat/editar-aviso-publicado` → solo archivos de este plan.
- [ ] **Step 3:** `git push` + `gh pr create --base main --title "Editar un aviso ya publicado en ML y Argenprop" --body "<resumen + criterios>\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)"`. Esperar la vista previa (`gh pr checks <N>`).

---

### Task 11: QA en la vista previa con el aviso [TEST], deploy y migración

- [ ] **Step 1:** navegador de Claude (`scripts/navegador-claude.sh abrir <vista previa>`), login "Claude · pruebas". Publicar la propiedad `[TEST` también en Argenprop (desde su wizard en la vista previa) — ML ya está publicada desde la Tarea 1.
- [ ] **Step 2:** recorrer los 15 criterios del spec contra el aviso `[TEST` (para cada edición: guardar `GET /items/{id}` / `GET /v1/avisos/{Codigo}` antes y después y comparar; esperado: solo cambia lo tocado). Criterios 7, 8 y 9 requieren el trigger nuevo: aplicarlos DESPUÉS del Step 4, en producción, sobre el `[TEST`. Rol abogado para el 14 (`UPDATE profiles SET role='abogado'` y volver a `admin`). Consola y red sin errores. Celular 390×844.
- [ ] **Step 3:** merge (`gh pr merge <N> --merge`), esperar el deploy de producción.
- [ ] **Step 4:** aplicar la migración: `node --env-file=.env.local --import tsx scripts/apply-requeue-solo-cambios-pg.ts` → "OK". Verificar criterios 7–9 con el `[TEST` (cambiar precio/expensas en su ficha, esperar ≤ 5 min, comparar avisos).
- [ ] **Step 5:** limpiar: cerrar el ítem ML `[TEST` (`qa-publish-ml-test.ts teardown`) y eliminar el aviso Argenprop (`qa-publish-argenprop-test.ts baja` / estado `eliminado`); borrar la propiedad `[TEST` si se creó para esto.
- [ ] **Step 6:** con el OK del dueño sobre el valor, cargar expensas y apto crédito de Doblas 248 desde la pantalla nueva y verificar en ML.
- [ ] **Step 7:** CLAUDE.md: sección "Editar un aviso publicado" (regla leer→aplicar→enviar, trigger con `cambios_ficha`, orden de deploy, sonda de vaciar). Actualizar la memoria `portales_datos_post_publicacion`. Reporte al dueño con la tabla criterio → cómo se probó → resultado. Cerrar el navegador.
