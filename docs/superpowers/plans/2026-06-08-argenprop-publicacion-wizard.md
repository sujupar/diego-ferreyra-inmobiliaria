# Argenprop — Wizard de publicación (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replicar el wizard de publicación de MercadoLibre para el portal Argenprop (Clarín `PublicarIntranet`), con pantalla de campos prellenados, publish síncrono, y baja en un click desde nuestra plataforma.

**Architecture:** Reescribir el stub fantasma `lib/portals/argenprop/{client,mapping,adapter}.ts` contra el contrato real `PublicarIntranet` (transporte `x-www-form-urlencoded`, auth `usr/psd` + IdSistema/IdVendedor, baja vía `Estado=Baja`, upsert por una clave de aviso que generamos). Diseño de **dos capas**: la capa "wire" (incierta, se valida con un `probe` contra el endpoint real) aislada del catálogo estático de campos (`field-schema.ts`) que alimenta la UI. El publish es **síncrono en la route** `POST /ap-publish` (espejo de ML); Argenprop NO pasa por el worker pg_cron. La UI es un espejo de `components/properties/wizards/ml/` con renombres Ml→Ap y endpoints `/ml-*` → `/ap-*`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase (service-role en routes), Vitest (tests existentes en `lib/portals/*.test.ts`), `node --env-file=.env.local --import tsx` para scripts QA.

**Spec:** [docs/superpowers/specs/2026-06-08-argenprop-publicacion-wizard-design.md](../specs/2026-06-08-argenprop-publicacion-wizard-design.md)

**Hallazgos que simplifican el plan (verificados en código):**
- La abstracción `lib/portals/` es genérica: `PortalAdapter`, registry, `worker.ts`, `validateCommon`, `audit`, `backoff` se reutilizan sin tocar.
- `PortalName` ya incluye `'argenprop'`; el adapter ya está registrado en `index.ts`.
- `20260522000001_disable_auto_publish_triggers.sql` ya **dropeó** `trg_enqueue_property_listings` → nada auto-encola filas `'pending'`. **Argenprop queda wizard-only sin migración** (solo verificación).
- Las tablas `property_listings`, `portal_credentials`, `portal_property_map`, `property_publish_events` ya soportan `argenprop` (columna `portal` text). **Cero migraciones** en el camino crítico.
- `IdOrigen` per-aviso = función determinística del UUID de la propiedad → sin secuencia, sin migración.

**Convención de tests:** los tests viven junto al código (`lib/portals/argenprop/*.test.ts`). Correr con el runner del repo. Verificá el comando exacto una vez:
```bash
cat package.json | grep -A2 '"scripts"' | grep -i test    # típico: "test": "vitest run"
```
En este plan se asume `npx vitest run <archivo>`. Si el repo usa otro runner, sustituir en todos los pasos.

---

## FASE 0 — Setup, credenciales y verificación de seguridad

### Task 0.1: Cargar credenciales Argenprop en `.env.local` (no se commitea) y nombres en `.env.example`

**Files:**
- Modify: `.env.local` (gitignored — NO commitear)
- Modify: `.env.example` (solo nombres, SÍ commitear)

- [ ] **Step 1: Confirmar que `.env.local` está gitignored**

Run:
```bash
git check-ignore .env.local && echo "IGNORED OK" || echo "PELIGRO: .env.local NO está ignorado — frenar"
```
Expected: `IGNORED OK`. Si no, agregá `.env.local` a `.gitignore` antes de seguir.

- [ ] **Step 2: Agregar las credenciales reales a `.env.local`**

Añadir al final de `.env.local` (valores productivos provistos por el usuario):
```
# --- Argenprop / Clarín PublicarIntranet ---
ARGENPROP_PUBLISH_URL=http://www.inmuebles.clarin.com/Publicaciones/PublicarIntranet?contentType=json
ARGENPROP_USR=dferreyrainmob@api.com
ARGENPROP_PSD=t638i632
ARGENPROP_ID_SISTEMA=10
ARGENPROP_ID_VENDEDOR=281022
ARGENPROP_ID_ORIGEN=60U6_
ARGENPROP_USER_AGENT=diego-ferreyra-crm
```

- [ ] **Step 3: Agregar SOLO los nombres a `.env.example`**

Añadir al final de `.env.example` (sin valores reales):
```
# Argenprop / Clarín PublicarIntranet (publicación vía API)
ARGENPROP_PUBLISH_URL=
ARGENPROP_USR=
ARGENPROP_PSD=
ARGENPROP_ID_SISTEMA=
ARGENPROP_ID_VENDEDOR=
ARGENPROP_ID_ORIGEN=
ARGENPROP_USER_AGENT=
```

- [ ] **Step 4: Verificar que `.env.local` NO aparece en el stage**

Run:
```bash
git status --short | grep -E "\.env\.local" && echo "ERROR: env.local trackeado" || echo "OK: env.local no trackeado"
```
Expected: `OK: env.local no trackeado`

- [ ] **Step 5: Commit (solo `.env.example`)**

```bash
git add .env.example
git commit -m "chore(argenprop): nombres de env vars de PublicarIntranet en .env.example"
```

---

### Task 0.2: Verificar en la DB que el auto-encolado está apagado (sin esto el worker podría auto-publicar Argenprop)

**Files:** ninguno (verificación SQL en el Dashboard de Supabase).

- [ ] **Step 1: Pedir al usuario correr esta query en el SQL Editor**

```sql
SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.properties'::regclass AND NOT tgisinternal;
```
Expected: NO debe aparecer `trg_enqueue_property_listings`. (La migración `20260522000001` lo dropeó.)

- [ ] **Step 2: Confirmar que no hay filas argenprop en estado publicable**

```sql
SELECT portal, status, count(*) FROM property_listings
WHERE portal='argenprop' GROUP BY portal, status;
```
Expected: vacío, o ninguna fila con `status='pending'`. Si hubiera filas `'pending'` de argenprop (de pruebas viejas), pasarlas a `'draft'`:
```sql
UPDATE property_listings SET status='draft' WHERE portal='argenprop' AND status='pending';
```

- [ ] **Step 3: Documentar el resultado** en el PR/notas. No hay commit en este task.

---

## FASE 1 — Capa wire (`lib/portals/argenprop/`)

> Toda esta fase encodea ASSUMPTIONS del contrato (no tenemos el spec oficial). Cada
> assumption va marcada con `// CONTRACT ASSUMPTION:` para que el `probe` (Fase 4/5)
> la valide/corrija en un solo lugar. Los tests cubren las transformaciones PURAS
> (que son correctas independientemente del contrato real); la corrección del
> transporte se valida en vivo.

### Task 1.1: Extender `credentials.ts` con el modelo de auth real de Argenprop

**Files:**
- Modify: `lib/portals/credentials.ts`
- Test: `lib/portals/credentials.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Añadir a `lib/portals/credentials.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveCredentials } from './credentials'

function fakeSupabase(row: Record<string, unknown> | null) {
  return {
    from() {
      return {
        select() { return this },
        eq() { return this },
        maybeSingle: async () => ({ data: row, error: null }),
      }
    },
  } as never
}

describe('resolveCredentials argenprop', () => {
  it('enabled=true cuando usr+psd+publishUrl están en env', async () => {
    const creds = await resolveCredentials('argenprop', {
      env: {
        ARGENPROP_USR: 'u@api.com',
        ARGENPROP_PSD: 'p',
        ARGENPROP_PUBLISH_URL: 'http://x/PublicarIntranet?contentType=json',
        ARGENPROP_ID_SISTEMA: '10',
        ARGENPROP_ID_VENDEDOR: '281022',
        ARGENPROP_ID_ORIGEN: '60U6_',
        ARGENPROP_USER_AGENT: 'diego-ferreyra-crm',
      },
      supabase: fakeSupabase({ portal: 'argenprop', enabled: false, metadata: {} }),
    })
    expect(creds.enabled).toBe(true)
    expect(creds.ap?.usr).toBe('u@api.com')
    expect(creds.ap?.idSistema).toBe('10')
    expect(creds.ap?.publishUrl).toContain('PublicarIntranet')
  })

  it('enabled=false si falta psd', async () => {
    const creds = await resolveCredentials('argenprop', {
      env: { ARGENPROP_USR: 'u@api.com', ARGENPROP_PUBLISH_URL: 'http://x' },
      supabase: fakeSupabase(null),
    })
    expect(creds.enabled).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test → falla**

Run: `npx vitest run lib/portals/credentials.test.ts`
Expected: FAIL (`creds.ap` undefined / enabled logic vieja con apiKey).

- [ ] **Step 3: Implementar el cambio en `credentials.ts`**

En `lib/portals/credentials.ts`:

1) Reemplazar el `ENV_MAP` y agregar el grupo argenprop. Cambiar la firma del map para soportar el bloque AP:
```ts
const ENV_MAP: Record<
  PortalName,
  { appId?: string; secret?: string; apiKey?: string; clientCode?: string; ap?: true }
> = {
  mercadolibre: { appId: 'ML_APP_ID', secret: 'ML_SECRET_KEY' },
  argenprop: { ap: true },
  zonaprop: { apiKey: 'ZONAPROP_API_KEY', clientCode: 'ZONAPROP_CLIENT_CODE' },
}
```

2) Agregar el shape `ApCredentials` y el campo `ap` a `ResolvedCredentials`:
```ts
export interface ApCredentials {
  publishUrl: string
  usr: string
  psd: string
  idSistema: string
  idVendedor: string
  idOrigen: string
  userAgent: string
}

export interface ResolvedCredentials {
  portal: PortalName
  enabled: boolean
  appId?: string
  secretKey?: string
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  clientCode?: string
  ap?: ApCredentials            // <-- nuevo
  metadata: Record<string, unknown>
}
```

3) Dentro de `resolveCredentials`, después de leer `env`, construir el bloque AP y la lógica de `enabled`:
```ts
  const ap: ApCredentials | undefined = portal === 'argenprop'
    ? {
        publishUrl: env.ARGENPROP_PUBLISH_URL ?? '',
        usr: env.ARGENPROP_USR ?? '',
        psd: env.ARGENPROP_PSD ?? '',
        idSistema: env.ARGENPROP_ID_SISTEMA ?? '',
        idVendedor: env.ARGENPROP_ID_VENDEDOR ?? '',
        idOrigen: env.ARGENPROP_ID_ORIGEN ?? '',
        userAgent: env.ARGENPROP_USER_AGENT ?? 'diego-ferreyra-crm',
      }
    : undefined

  const envEnabled =
    portal === 'mercadolibre'
      ? Boolean(fromEnv.appId && fromEnv.secretKey)
      : portal === 'argenprop'
        ? Boolean(ap?.usr && ap?.psd && ap?.publishUrl)
        : Boolean(fromEnv.apiKey && fromEnv.clientCode)

  const mlReady = portal === 'mercadolibre' ? Boolean(accessToken) : true
  const enabled = (Boolean(row?.enabled) || envEnabled) && mlReady
```

4) Agregar `ap` al objeto de retorno:
```ts
  return {
    portal, enabled,
    appId: fromEnv.appId, secretKey: fromEnv.secretKey,
    accessToken, refreshToken,
    apiKey: fromEnv.apiKey, clientCode: fromEnv.clientCode,
    ap,
    metadata,
  }
```

- [ ] **Step 4: Correr el test → pasa**

Run: `npx vitest run lib/portals/credentials.test.ts`
Expected: PASS (los 2 nuevos + los existentes).

- [ ] **Step 5: Commit**

```bash
git add lib/portals/credentials.ts lib/portals/credentials.test.ts
git commit -m "feat(argenprop): credenciales PublicarIntranet (usr/psd/IdSistema/IdVendedor) en resolveCredentials"
```

---

### Task 1.2: `field-schema.ts` — catálogo estático + `derivedPrefill` + `apAvisoId`

**Files:**
- Create: `lib/portals/argenprop/field-schema.ts`
- Test: `lib/portals/argenprop/field-schema.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `lib/portals/argenprop/field-schema.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { AP_TIPO_PROPIEDAD, getApSchema, derivedPrefill, apAvisoId } from './field-schema'

const baseProp = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento',
  operation_type: 'venta',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
  covered_area: 95, total_area: 110, age: 15, floor: 4,
  expensas: 50000, currency: 'USD',
} as never

describe('field-schema argenprop', () => {
  it('mapea property_type a un código de TipoPropiedad', () => {
    expect(AP_TIPO_PROPIEDAD.departamento).toBe('1')
    expect(AP_TIPO_PROPIEDAD.casa).toBe('3')
  })

  it('getApSchema devuelve required + recommended para depto', () => {
    const s = getApSchema(baseProp)
    expect(s.required.length).toBeGreaterThan(0)
    expect(s.required.every(f => f.id && f.name && f.valueType)).toBe(true)
  })

  it('derivedPrefill rellena ambientes/dormitorios/superficie desde la propiedad', () => {
    const pf = derivedPrefill(baseProp)
    expect(pf.AMBIENTES?.value_name).toBe('3')
    expect(pf.DORMITORIOS?.value_name).toBe('2')
    expect(pf.SUP_CUBIERTA?.value_name).toBe('95')
  })

  it('apAvisoId es determinístico y estable por propiedad', () => {
    const a = apAvisoId(baseProp)
    const b = apAvisoId(baseProp)
    expect(a).toBe(b)
    expect(a).toMatch(/^df-/)
  })
})
```

- [ ] **Step 2: Correr → falla**

Run: `npx vitest run lib/portals/argenprop/field-schema.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `field-schema.ts`**

Create `lib/portals/argenprop/field-schema.ts`:
```ts
import type { Property } from '../types'

/** Mismo shape que ML (CategoryAttribute/AttributeOverride) para que la UI sea idéntica. */
export type ApValueType = 'string' | 'number' | 'number_unit' | 'boolean' | 'list'

export interface ApField {
  id: string
  name: string
  valueType: ApValueType
  required: boolean
  allowedValues?: { id: string; name: string }[]
  allowedUnits?: string[]
  hint?: string
}

export interface AttributeOverride {
  value_name?: string
  value_id?: string
}

export interface ApSchema {
  /** Etiqueta de la categoría (tipo de propiedad) que muestra la UI. */
  categoryId: string
  required: ApField[]
  recommended: ApField[]
}

/**
 * CONTRACT ASSUMPTION (tabla TipoPropiedad del spec v4.0 — confirmar en probe):
 * 1=Departamento 2=Depto tipo casa 3=Casa 4=Quinta 5=Cochera 6=Local 7=Hotel
 * 8=Terreno 9=Oficina 10=Campo 11=Fondo Comercio 12=Galpón 13=Negocio Esp 14=Edificio
 */
export const AP_TIPO_PROPIEDAD: Record<string, string> = {
  departamento: '1',
  casa: '3',
  ph: '2', // Depto tipo casa (Argenprop no tiene "PH" propio — confirmar en probe)
  terreno: '8',
  local: '6',
  oficina: '9',
}

/** CONTRACT ASSUMPTION: códigos de operación (confirmar en probe). */
export const AP_TIPO_OPERACION: { id: string; name: string }[] = [
  { id: 'venta', name: 'Venta' },
  { id: 'alquiler', name: 'Alquiler' },
  { id: 'temporario', name: 'Alquiler temporario' },
]

/** CONTRACT ASSUMPTION: códigos de moneda (confirmar en probe). */
export const AP_MONEDA: { id: string; name: string }[] = [
  { id: 'USD', name: 'Dólares' },
  { id: 'ARS', name: 'Pesos' },
]

export function apTipoPropiedad(property: Property): string {
  const t = (property.property_type || 'departamento').toLowerCase()
  return AP_TIPO_PROPIEDAD[t] ?? AP_TIPO_PROPIEDAD.departamento
}

/**
 * Catálogo estático de campos que Argenprop pide. `required` bloquea el publish;
 * `recommended` suma a la calidad (los portales priorizan por calidad).
 * CONTRACT ASSUMPTION: nombres/obligatoriedad reconstruidos del spec v4.0.
 */
export function getApSchema(_property: Property): ApSchema {
  const required: ApField[] = [
    { id: 'TIPO_OPERACION', name: 'Tipo de operación', valueType: 'list', required: true, allowedValues: AP_TIPO_OPERACION },
    { id: 'MONEDA', name: 'Moneda', valueType: 'list', required: true, allowedValues: AP_MONEDA },
    { id: 'AMBIENTES', name: 'Ambientes', valueType: 'number', required: true },
  ]
  const recommended: ApField[] = [
    { id: 'DORMITORIOS', name: 'Dormitorios', valueType: 'number', required: false },
    { id: 'BANOS', name: 'Baños', valueType: 'number', required: false },
    { id: 'COCHERAS', name: 'Cocheras', valueType: 'number', required: false },
    { id: 'SUP_CUBIERTA', name: 'Superficie cubierta', valueType: 'number_unit', required: false, allowedUnits: ['m²'] },
    { id: 'SUP_TOTAL', name: 'Superficie total', valueType: 'number_unit', required: false, allowedUnits: ['m²'] },
    { id: 'ANTIGUEDAD', name: 'Antigüedad (años)', valueType: 'number_unit', required: false, allowedUnits: ['años'] },
    { id: 'EXPENSAS', name: 'Expensas (ARS)', valueType: 'number', required: false },
    { id: 'ORIENTACION', name: 'Orientación', valueType: 'string', required: false },
    { id: 'DISPOSICION', name: 'Disposición', valueType: 'string', required: false },
  ]
  return { categoryId: `TipoPropiedad ${apTipoPropiedad(_property)}`, required, recommended }
}

/** Valores prellenados desde las columnas de la propiedad. Las claves matchean ApField.id. */
export function derivedPrefill(property: Property): Record<string, AttributeOverride> {
  const out: Record<string, AttributeOverride> = {}
  if (property.operation_type) out.TIPO_OPERACION = { value_id: property.operation_type }
  if (property.currency) out.MONEDA = { value_id: property.currency }
  if (property.rooms) out.AMBIENTES = { value_name: String(property.rooms) }
  if (property.bedrooms) out.DORMITORIOS = { value_name: String(property.bedrooms) }
  if (property.bathrooms) out.BANOS = { value_name: String(property.bathrooms) }
  if (property.garages) out.COCHERAS = { value_name: String(property.garages) }
  if (property.covered_area) out.SUP_CUBIERTA = { value_name: String(property.covered_area) }
  if (property.total_area) out.SUP_TOTAL = { value_name: String(property.total_area) }
  if (property.age != null) out.ANTIGUEDAD = { value_name: String(property.age) }
  if (property.expensas) out.EXPENSAS = { value_name: String(property.expensas) }
  return out
}

/**
 * Clave de aviso (aviso.IdOrigen) que generamos nosotros. Determinística por
 * propiedad → idempotente para update/baja sin necesidad de persistir nada.
 * CONTRACT ASSUMPTION: Argenprop acepta string. Si en el probe rechaza no-numérico,
 * cambiar a un entero (ej. parseInt de los primeros hex) o una secuencia Postgres.
 */
export function apAvisoId(property: Property): string {
  return `df-${property.id.replace(/-/g, '').slice(0, 16)}`
}
```

- [ ] **Step 4: Correr → pasa**

Run: `npx vitest run lib/portals/argenprop/field-schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/portals/argenprop/field-schema.ts lib/portals/argenprop/field-schema.test.ts
git commit -m "feat(argenprop): catálogo estático de campos + derivedPrefill + apAvisoId determinístico"
```

---

### Task 1.3: `mapping.ts` — reescribir a `propertyToApForm` (form aplanado) + helper de aplanado

**Files:**
- Modify (rewrite): `lib/portals/argenprop/mapping.ts`
- Test: `lib/portals/argenprop/mapping.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `lib/portals/argenprop/mapping.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { flattenForm, propertyToApForm } from './mapping'

const prop = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento', operation_type: 'venta',
  title: 'Lindo 3 amb', description: 'x'.repeat(120),
  asking_price: 120000, currency: 'USD',
  address: 'Av. Cabildo 1234', neighborhood: 'Belgrano', city: 'CABA',
  latitude: -34.56, longitude: -58.45, postal_code: '1426',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
  covered_area: 95, total_area: 110, age: 15, floor: 4, expensas: 50000,
  amenities: ['pileta', 'parrilla'],
  photos: ['https://cdn/x/1.jpg', 'https://cdn/x/2.jpg'],
  video_url: null, tour_3d_url: null,
} as never

describe('flattenForm', () => {
  it('aplana arrays con claves indexadas', () => {
    const f = flattenForm({ imagenes: [{ url: 'a' }, { url: 'b' }] })
    expect(f['imagenes[0].url']).toBe('a')
    expect(f['imagenes[1].url']).toBe('b')
  })
  it('aplana objetos anidados con punto', () => {
    const f = flattenForm({ aviso: { Precio: 100, Vendedor: { IdOrigen: 281022 } } })
    expect(f['aviso.Precio']).toBe('100')
    expect(f['aviso.Vendedor.IdOrigen']).toBe('281022')
  })
  it('omite null/undefined', () => {
    const f = flattenForm({ a: null, b: undefined, c: 0 })
    expect('a' in f).toBe(false)
    expect('b' in f).toBe(false)
    expect(f.c).toBe('0')
  })
})

describe('propertyToApForm', () => {
  it('incluye auth, tipoPropiedad, precio y IdOrigen del aviso', () => {
    const f = propertyToApForm(prop, {
      creds: { publishUrl: '', usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua' },
      idOrigen: 'df-abc',
    })
    expect(f['usr']).toBe('u')
    expect(f['psd']).toBe('p')
    expect(f['tipoPropiedad']).toBe('1')          // departamento
    expect(f['aviso.IdOrigen']).toBe('df-abc')
    expect(f['aviso.Vendedor.SistemaOrigen.Id']).toBe('10')
    expect(f['aviso.Vendedor.IdOrigen']).toBe('281022')
    expect(f['aviso.Precio']).toBe('120000')
    expect(f['aviso.Estado']).toBe('Activo')
  })
  it('aplana las fotos como imagenes[i].url', () => {
    const f = propertyToApForm(prop, {
      creds: { publishUrl: '', usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua' },
      idOrigen: 'df-abc',
    })
    expect(f['imagenes[0].url']).toBe('https://cdn/x/1.jpg')
    expect(f['imagenes[1].url']).toBe('https://cdn/x/2.jpg')
  })
  it('estado=Baja cuando opts.estado=Baja (para dar de baja)', () => {
    const f = propertyToApForm(prop, {
      creds: { publishUrl: '', usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua' },
      idOrigen: 'df-abc', estado: 'Baja',
    })
    expect(f['aviso.Estado']).toBe('Baja')
  })
})
```

- [ ] **Step 2: Correr → falla**

Run: `npx vitest run lib/portals/argenprop/mapping.test.ts`
Expected: FAIL (exports no existen; el archivo viejo exporta `propertyToApPayload`).

- [ ] **Step 3: Reescribir `mapping.ts` completo**

Replace `lib/portals/argenprop/mapping.ts` con:
```ts
import type { Property } from '../types'
import type { ApCredentials } from '../credentials'
import { apTipoPropiedad } from './field-schema'
import type { AttributeOverride } from './field-schema'

export interface ApFormOptions {
  creds: ApCredentials
  idOrigen: string
  /** 'Activo' (default) | 'Baja' | 'Suspendido' | 'Reservado'. */
  estado?: string
  /** Overrides del wizard (claves = ApField.id). */
  attributeOverrides?: Record<string, AttributeOverride>
}

type FormValue = string | number | boolean | null | undefined | FormObject | FormArray
interface FormObject { [k: string]: FormValue }
type FormArray = FormValue[]

/**
 * Aplana un objeto anidado a un Record<string,string> con la convención de
 * PublicarIntranet: objetos → claves con punto (`aviso.Precio`), arrays → claves
 * indexadas (`imagenes[0].url`). Omite null/undefined. Todo se stringifica.
 */
export function flattenForm(obj: FormObject, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    const key = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        const idxKey = `${key}[${i}]`
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          Object.assign(out, flattenForm(item as FormObject, idxKey))
        } else if (item !== null && item !== undefined) {
          out[idxKey] = String(item)
        }
      })
    } else if (typeof v === 'object') {
      Object.assign(out, flattenForm(v as FormObject, key))
    } else {
      out[key] = String(v)
    }
  }
  return out
}

function ov(overrides: Record<string, AttributeOverride> | undefined, id: string): string | undefined {
  const o = overrides?.[id]
  if (!o) return undefined
  return o.value_id ?? o.value_name
}

function buildTitle(property: Property): string {
  if (property.title) return property.title
  return `${property.property_type || 'Propiedad'} en ${property.neighborhood}`
}

/**
 * Construye el body form-urlencoded (aplanado) para PublicarIntranet.
 * CONTRACT ASSUMPTION: nombres de campos `aviso.*`/`propiedad.*` del spec v4.0.
 * El probe (Fase 4/5) corrige los nombres exactos en UN solo lugar (acá).
 */
export function propertyToApForm(property: Property, opts: ApFormOptions): Record<string, string> {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToApForm: lat/lng requeridos (corré validate antes)')
  }
  const { creds, idOrigen, estado = 'Activo', attributeOverrides: o } = opts

  const tree: FormObject = {
    // Auth (per-request, en el body)
    usr: creds.usr,
    psd: creds.psd,
    // Tipo de propiedad (top-level según spec)
    tipoPropiedad: apTipoPropiedad(property),
    aviso: {
      IdOrigen: idOrigen, // clave de idempotencia que generamos nosotros
      Estado: estado,
      TipoOperacion: ov(o, 'TIPO_OPERACION') ?? property.operation_type ?? 'venta',
      Titulo: buildTitle(property),
      Descripcion: property.description || buildTitle(property),
      Precio: property.asking_price,
      Moneda: ov(o, 'MONEDA') ?? property.currency ?? 'USD',
      Vendedor: {
        SistemaOrigen: { Id: creds.idSistema }, // IdSistema
        IdOrigen: creds.idVendedor,             // IdVendedor
        OrigenCuenta: creds.idOrigen,           // ARGENPROP_ID_ORIGEN (60U6_) — CONTRACT ASSUMPTION
      },
    },
    propiedad: {
      Ambientes: ov(o, 'AMBIENTES') ?? property.rooms ?? undefined,
      Dormitorios: ov(o, 'DORMITORIOS') ?? property.bedrooms ?? undefined,
      Banos: ov(o, 'BANOS') ?? property.bathrooms ?? undefined,
      Cocheras: ov(o, 'COCHERAS') ?? property.garages ?? undefined,
      SuperficieCubierta: ov(o, 'SUP_CUBIERTA') ?? property.covered_area ?? undefined,
      SuperficieTotal: ov(o, 'SUP_TOTAL') ?? property.total_area ?? undefined,
      Antiguedad: ov(o, 'ANTIGUEDAD') ?? (property.age != null ? property.age : undefined),
      Expensas: ov(o, 'EXPENSAS') ?? property.expensas ?? undefined,
      Orientacion: ov(o, 'ORIENTACION') ?? undefined,
      Disposicion: ov(o, 'DISPOSICION') ?? undefined,
      Direccion: property.address,
      Localidad: property.neighborhood,
      Ciudad: property.city || 'CABA',
      Latitud: property.latitude,
      Longitud: property.longitude,
      CodigoPostal: property.postal_code ?? undefined,
    },
    // Fotos por URL (Argenprop las descarga). CONTRACT ASSUMPTION: `imagenes[i].url`.
    imagenes: (property.photos ?? []).slice(0, 20).map((url, i) => ({ url, orden: i, principal: i === 0 })),
  }

  return flattenForm(tree)
}
```

- [ ] **Step 4: Correr → pasa**

Run: `npx vitest run lib/portals/argenprop/mapping.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/portals/argenprop/mapping.ts lib/portals/argenprop/mapping.test.ts
git commit -m "feat(argenprop): propertyToApForm + flattenForm (x-www-form-urlencoded indexado)"
```

---

### Task 1.4: `client.ts` — reescribir a `apPublish` (POST form-urlencoded + parseo de respuesta)

**Files:**
- Modify (rewrite): `lib/portals/argenprop/client.ts`
- Test: `lib/portals/argenprop/client.test.ts`

- [ ] **Step 1: Escribir el test que falla (cubre las funciones puras: encode + parse)**

Create `lib/portals/argenprop/client.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { encodeForm, parseApResponse } from './client'

describe('encodeForm', () => {
  it('codifica claves con [] y . sin romper', () => {
    const body = encodeForm({ 'imagenes[0].url': 'https://a/b.jpg?x=1', 'aviso.Precio': '100' })
    expect(body).toContain('imagenes%5B0%5D.url=https%3A%2F%2Fa%2Fb.jpg%3Fx%3D1')
    expect(body).toContain('aviso.Precio=100')
  })
})

describe('parseApResponse', () => {
  it('extrae ids de visibilidad de una respuesta array', () => {
    const r = parseApResponse([{ id: 111 }, { id: 222 }])
    expect(r.visibilidadIds).toEqual(['111', '222'])
    expect(r.ok).toBe(true)
  })
  it('detecta error cuando viene un envelope con Mensaje/Error', () => {
    const r = parseApResponse({ Error: true, Mensaje: 'credenciales inválidas' })
    expect(r.ok).toBe(false)
    expect(r.errorMessage).toContain('credenciales')
  })
})
```

- [ ] **Step 2: Correr → falla**

Run: `npx vitest run lib/portals/argenprop/client.test.ts`
Expected: FAIL (exports no existen).

- [ ] **Step 3: Reescribir `client.ts` completo**

Replace `lib/portals/argenprop/client.ts` con:
```ts
import { PortalAdapterError } from '../types'
import type { ApCredentials } from '../credentials'

export interface ApPublishResponse {
  ok: boolean
  visibilidadIds: string[]
  errorMessage?: string
  raw: unknown
}

/** Codifica un Record<string,string> a application/x-www-form-urlencoded. */
export function encodeForm(form: Record<string, string>): string {
  return Object.entries(form)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

/**
 * Parsea la respuesta JSON de PublicarIntranet.
 * CONTRACT ASSUMPTION: éxito = colección con ids de visibilidad; error = envelope
 * con Error/Mensaje. El probe corrige el shape real acá.
 */
export function parseApResponse(json: unknown): ApPublishResponse {
  // Caso éxito: array de objetos con id (visibilidades creadas)
  if (Array.isArray(json)) {
    const ids = json
      .map(x => (x && typeof x === 'object' && 'id' in x ? String((x as { id: unknown }).id) : null))
      .filter((x): x is string => !!x)
    return { ok: ids.length > 0, visibilidadIds: ids, raw: json }
  }
  // Caso envelope de error
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>
    const errFlag = o.Error === true || o.error === true || typeof o.Mensaje === 'string' || typeof o.mensaje === 'string'
    const msg = (o.Mensaje ?? o.mensaje ?? o.Message ?? o.message) as string | undefined
    // Algunas respuestas exitosas pueden venir como objeto con una colección anidada.
    const nested = (o.visibilidades ?? o.Visibilidades ?? o.ids ?? o.Ids) as unknown
    if (Array.isArray(nested)) {
      const ids = nested.map(x => String((x as { id?: unknown })?.id ?? x)).filter(Boolean)
      return { ok: ids.length > 0, visibilidadIds: ids, raw: json }
    }
    if (errFlag) return { ok: false, visibilidadIds: [], errorMessage: msg ?? 'Error de Argenprop', raw: json }
  }
  return { ok: false, visibilidadIds: [], errorMessage: 'Respuesta no reconocida', raw: json }
}

/**
 * POST a PublicarIntranet con el form aplanado. Transporte form-urlencoded;
 * `?contentType=json` (ya en la URL) hace que la respuesta venga en JSON.
 */
export async function apPublish(form: Record<string, string>, creds: ApCredentials): Promise<ApPublishResponse> {
  if (!creds.publishUrl || !creds.usr || !creds.psd) {
    throw new PortalAdapterError('Missing Argenprop credentials', 'argenprop', 'auth', false)
  }
  const res = await fetch(creds.publishUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': creds.userAgent,
    },
    body: encodeForm(form),
  })
  const text = await res.text()
  if (!res.ok) {
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `Argenprop ${res.status}: ${text.slice(0, 500)}`,
      'argenprop',
      res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  let json: unknown
  try { json = JSON.parse(text) } catch { json = text }
  const parsed = parseApResponse(json)
  if (!parsed.ok) {
    throw new PortalAdapterError(
      `Argenprop rechazó la publicación: ${parsed.errorMessage ?? text.slice(0, 300)}`,
      'argenprop', 'unknown', false,
    )
  }
  return parsed
}
```

- [ ] **Step 4: Correr → pasa**

Run: `npx vitest run lib/portals/argenprop/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/portals/argenprop/client.ts lib/portals/argenprop/client.test.ts
git commit -m "feat(argenprop): apPublish (form-urlencoded) + encodeForm + parseApResponse"
```

---

### Task 1.5: `adapter.ts` — reescribir publish/update/unpublish contra el contrato real

**Files:**
- Modify (rewrite): `lib/portals/argenprop/adapter.ts`
- Test: `lib/portals/argenprop/adapter.test.ts`

- [ ] **Step 1: Escribir el test que falla (publish con fetch mockeado)**

Create `lib/portals/argenprop/adapter.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ArgenpropAdapter } from './adapter'

const prop = {
  id: '11111111-2222-3333-4444-555566667777',
  property_type: 'departamento', operation_type: 'venta',
  title: 'Lindo 3 amb', description: 'x'.repeat(120),
  asking_price: 120000, currency: 'USD',
  address: 'Av. Cabildo 1234', neighborhood: 'Belgrano', city: 'CABA',
  latitude: -34.56, longitude: -58.45,
  rooms: 3, photos: ['https://cdn/x/1.jpg'],
  amenities: [],
} as never

const creds = {
  publishUrl: 'http://x/PublicarIntranet?contentType=json',
  usr: 'u', psd: 'p', idSistema: '10', idVendedor: '281022', idOrigen: '60U6_', userAgent: 'ua',
}

afterEach(() => vi.restoreAllMocks())

describe('ArgenpropAdapter.publish', () => {
  it('publica y devuelve externalId=apAvisoId + visibilidadIds', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 999 }]), { status: 200 }),
    )
    const adapter = new ArgenpropAdapter(true, creds)
    const r = await adapter.publish(prop)
    expect(r.externalId).toMatch(/^df-/)
    expect(r.metadata?.visibilidadIds).toEqual(['999'])
  })

  it('unpublish reenvía con Estado=Baja', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 999 }]), { status: 200 }),
    )
    const adapter = new ArgenpropAdapter(true, creds)
    await adapter.unpublish('df-abc')
    const body = (spy.mock.calls[0][1] as RequestInit).body as string
    expect(decodeURIComponent(body)).toContain('aviso.Estado=Baja')
  })
})
```

- [ ] **Step 2: Correr → falla**

Run: `npx vitest run lib/portals/argenprop/adapter.test.ts`
Expected: FAIL (el adapter viejo usa `apFetch('/ads')` y su constructor no toma creds).

- [ ] **Step 3: Reescribir `adapter.ts` completo**

Replace `lib/portals/argenprop/adapter.ts` con:
```ts
import { apPublish } from './client'
import { propertyToApForm } from './mapping'
import { apAvisoId } from './field-schema'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type { ApCredentials } from '../credentials'
import type {
  PortalAdapter,
  Property,
  PublishResult,
  PortalMetricsPoint,
  ValidationResult,
} from '../types'

export interface ApPublishOptions {
  attributeOverrides?: Record<string, { value_name?: string; value_id?: string }>
}

export class ArgenpropAdapter implements PortalAdapter {
  readonly name = 'argenprop' as const

  constructor(
    public readonly enabled: boolean,
    private readonly creds?: ApCredentials,
  ) {}

  validate(property: Property): ValidationResult {
    return validateCommon(property)
  }

  private requireCreds(): ApCredentials {
    if (!this.creds) {
      throw new PortalAdapterError('Argenprop credentials not resolved', 'argenprop', 'auth', false)
    }
    return this.creds
  }

  async publish(property: Property, opts: ApPublishOptions = {}): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(`Validación falló: ${v.errors.join(', ')}`, 'argenprop', 'validation', false)
    }
    const creds = this.requireCreds()
    const idOrigen = apAvisoId(property)
    const form = propertyToApForm(property, { creds, idOrigen, estado: 'Activo', attributeOverrides: opts.attributeOverrides })
    const res = await apPublish(form, creds)
    // CONTRACT ASSUMPTION: el aviso público no devuelve URL directa en v4.0. Guardamos
    // los visibilidadIds; la URL pública se resuelve/ajusta en el probe. Best-effort:
    const externalUrl = res.visibilidadIds[0]
      ? `https://www.argenprop.com/${res.visibilidadIds[0]}`
      : ''
    return {
      externalId: idOrigen,
      externalUrl,
      metadata: { visibilidadIds: res.visibilidadIds },
    }
  }

  /** Update = re-POST con el mismo IdOrigen (upsert idempotente). */
  async update(property: Property, _externalId: string): Promise<void> {
    const creds = this.requireCreds()
    const idOrigen = apAvisoId(property)
    const form = propertyToApForm(property, { creds, idOrigen, estado: 'Activo' })
    await apPublish(form, creds)
  }

  /**
   * Baja = re-POST con Estado=Baja. Necesita reconstruir el form mínimo con el
   * mismo IdOrigen. `externalId` ES el idOrigen que guardamos al publicar.
   */
  async unpublish(externalId: string): Promise<void> {
    const creds = this.requireCreds()
    // Para la baja Argenprop solo necesita identificar el aviso por IdOrigen + vendedor.
    // CONTRACT ASSUMPTION: alcanza con un form mínimo. Si el probe muestra que exige
    // el aviso completo, reconstruir desde la propiedad (el worker/route tienen el row).
    const form = {
      usr: creds.usr,
      psd: creds.psd,
      'aviso.IdOrigen': externalId,
      'aviso.Estado': 'Baja',
      'aviso.Vendedor.SistemaOrigen.Id': creds.idSistema,
      'aviso.Vendedor.IdOrigen': creds.idVendedor,
    }
    await apPublish(form, creds)
  }

  async fetchMetrics(_externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    // CONTRACT ASSUMPTION: PublicarIntranet no expone métricas. Devolvemos vacío.
    return []
  }
}
```

- [ ] **Step 4: Actualizar `index.ts` para pasarle las creds al adapter**

En `lib/portals/index.ts`, cambiar la línea de registro de Argenprop para inyectar `apCreds.ap`:
```ts
  registerAdapter(new ArgenpropAdapter(apCreds.enabled, apCreds.ap))
```

- [ ] **Step 5: Correr el test → pasa**

Run: `npx vitest run lib/portals/argenprop/adapter.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Verificar que toda la suite de portals compila/pasa**

Run: `npx vitest run lib/portals/`
Expected: PASS (incluye credentials/mapping/client/adapter/field-schema + los existentes ML/worker).

- [ ] **Step 7: Commit**

```bash
git add lib/portals/argenprop/adapter.ts lib/portals/argenprop/adapter.test.ts lib/portals/index.ts
git commit -m "feat(argenprop): adapter publish/update/unpublish(Baja) contra PublicarIntranet"
```

---

## FASE 2 — Routes (`app/api/properties/[id]/ap-*`)

### Task 2.1: `ap-attributes/route.ts` (GET schema estático + prefill)

**Files:**
- Create: `app/api/properties/[id]/ap-attributes/route.ts`

- [ ] **Step 1: Implementar la route** (espejo de `ml-attributes`, pero schema estático)

Create `app/api/properties/[id]/ap-attributes/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { getApSchema, derivedPrefill, type AttributeOverride } from '@/lib/portals/argenprop/field-schema'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** GET → schema estático de Argenprop + valores prellenos (propiedad + draft). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { id } = await params
    const supabase = getAdmin()

    const { data: property } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
    if (!property) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (user.profile.role === 'asesor' && property.assigned_to !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const schema = getApSchema(property)

    const { data: listing } = await supabase
      .from('property_listings')
      .select('metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    const meta = (listing?.metadata ?? {}) as Record<string, unknown>
    const saved = (meta.ap_attributes ?? {}) as Record<string, AttributeOverride>

    const prefill: Record<string, AttributeOverride> = { ...derivedPrefill(property), ...saved }

    return NextResponse.json({
      categoryId: schema.categoryId,
      required: schema.required,
      recommended: schema.recommended,
      prefill,
      // Tier diferido: una sola opción "Estándar" para mantener la UI idéntica a ML.
      listingTypes: [{ id: 'estandar', label: 'Estándar' }],
      listingTypeSelected: (meta.listing_type as string) ?? 'estandar',
      mediaChoice: (meta.media_choice as string) ?? 'none',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit` (o `npm run build` si tsc no está suelto)
Expected: sin errores en `ap-attributes/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/ap-attributes/route.ts"
git commit -m "feat(argenprop): route ap-attributes (schema estático + prefill)"
```

---

### Task 2.2: `ap-preview/route.ts` (GET preview/validación + PATCH draft status='draft')

**Files:**
- Create: `app/api/properties/[id]/ap-preview/route.ts`

- [ ] **Step 1: Implementar la route** (espejo de `ml-preview`)

Create `app/api/properties/[id]/ap-preview/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { validateCommon } from '@/lib/portals/validation'
import { getApSchema, derivedPrefill, type AttributeOverride } from '@/lib/portals/argenprop/field-schema'
import type { Database } from '@/types/database.types'

type PropertyRow = Database['public']['Tables']['properties']['Row']

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function authorize(propertyId: string, userId: string, role: string) {
  if (role === 'abogado') return false
  if (role !== 'asesor') return true
  const supabase = getAdmin()
  const { data } = await supabase.from('properties').select('assigned_to').eq('id', propertyId).single()
  return data?.assigned_to === userId
}

/** Valida la propiedad para Argenprop usando los overrides guardados. */
function validateForArgenprop(property: PropertyRow, meta: Record<string, unknown>) {
  const validation = validateCommon(property)
  // Los required del schema deben estar cubiertos por la propiedad o por un override.
  const schema = getApSchema(property)
  const prefill = { ...derivedPrefill(property), ...((meta.ap_attributes ?? {}) as Record<string, AttributeOverride>) }
  for (const f of schema.required) {
    const v = prefill[f.id]
    if (!v || (!v.value_id && !v.value_name)) {
      validation.errors.push(`Falta campo obligatorio de Argenprop: ${f.name}`)
      validation.ok = false
    }
  }
  return validation
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { data: property, error } = await supabase.from('properties').select('*').eq('id', id).single()
    if (error || !property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    const { data: listing } = await supabase
      .from('property_listings')
      .select('status, external_id, external_url, last_published_at, last_error, metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    const meta = (listing?.metadata ?? {}) as Record<string, unknown>

    return NextResponse.json({
      property,
      payload: null, // Argenprop no previsualiza un payload tipado en la UI (form opaco)
      validation: validateForArgenprop(property, meta),
      listing: listing ?? null,
      draft: meta,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as {
      title?: string; description?: string; photos?: string[]; asking_price?: number
      videoUrl?: string | null; tour3dUrl?: string | null; latitude?: number; longitude?: number
      apAttributes?: Record<string, AttributeOverride>
      mediaChoice?: 'video' | 'tour' | 'none'; listingType?: string
    }
    const supabase = getAdmin()

    // 1) Campos de la propiedad (mismo set y saneo que ml-preview)
    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.slice(0, 60)
    if (typeof body.description === 'string') update.description = body.description.slice(0, 5000)
    if (Array.isArray(body.photos)) {
      update.photos = body.photos
        .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 2000)
        .filter(p => /^https?:\/\//i.test(p))
        .slice(0, 20)
    }
    if (typeof body.asking_price === 'number' && body.asking_price > 0) {
      update.asking_price = Math.min(body.asking_price, 100_000_000)
    }
    if (body.videoUrl !== undefined) update.video_url = body.videoUrl
    if (body.tour3dUrl !== undefined) update.tour_3d_url = body.tour3dUrl
    if (typeof body.latitude === 'number') update.latitude = body.latitude
    if (typeof body.longitude === 'number') update.longitude = body.longitude

    let property: PropertyRow | null = null
    if (Object.keys(update).length > 0) {
      const { data, error } = await supabase.from('properties').update(update).eq('id', id).select().single()
      if (error || !data) return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 })
      property = data
    } else {
      const { data } = await supabase.from('properties').select('*').eq('id', id).single()
      property = data
    }
    if (!property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    // 2) Draft en property_listings.metadata (status 'draft' — NO 'pending')
    const draftPatch: Record<string, unknown> = {}
    if (body.apAttributes) draftPatch.ap_attributes = body.apAttributes
    if (body.mediaChoice) draftPatch.media_choice = body.mediaChoice
    if (body.listingType) draftPatch.listing_type = body.listingType
    let meta: Record<string, unknown> = {}
    if (Object.keys(draftPatch).length > 0) {
      const { data: existing } = await supabase
        .from('property_listings').select('metadata')
        .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
      meta = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...draftPatch }
      const row: Record<string, unknown> = { property_id: id, portal: 'argenprop', metadata: meta }
      if (!existing) row.status = 'draft' // CRÍTICO: 'draft', no 'pending' (el worker solo toca 'pending')
      await supabase.from('property_listings').upsert(row as never, { onConflict: 'property_id,portal' })
    } else {
      const { data: existing } = await supabase
        .from('property_listings').select('metadata')
        .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
      meta = (existing?.metadata as Record<string, unknown>) ?? {}
    }

    return NextResponse.json({ property, payload: null, validation: validateForArgenprop(property, meta) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores en `ap-preview/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/ap-preview/route.ts"
git commit -m "feat(argenprop): route ap-preview (GET preview/validación + PATCH draft status=draft)"
```

---

### Task 2.3: `ap-publish/route.ts` (POST publish síncrono + PATCH baja/republish + bridge)

**Files:**
- Create: `app/api/properties/[id]/ap-publish/route.ts`

- [ ] **Step 1: Implementar la route** (espejo de `ml-publish` POST + PATCH baja)

Create `app/api/properties/[id]/ap-publish/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { initPortals, getAdapter } from '@/lib/portals'
import { ArgenpropAdapter } from '@/lib/portals/argenprop/adapter'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function authorize(propertyId: string, userId: string, role: string) {
  if (role === 'asesor') {
    const supabase = getAdmin()
    const { data } = await supabase.from('properties').select('assigned_to').eq('id', propertyId).single()
    return data?.assigned_to === userId
  }
  return ['admin', 'dueno', 'coordinador'].includes(role)
}

type PropertyRow = Database['public']['Tables']['properties']['Row']
type LooseQuery = {
  delete: () => LooseQuery
  insert: (row: Record<string, unknown>) => Promise<unknown>
  eq: (column: string, value: unknown) => LooseQuery & Promise<unknown>
}

/** BRIDGE publicación → routing de consultas (espejo del de ML, portal='argenprop'). */
async function syncPortalPropertyMap(
  supabase: ReturnType<typeof getAdmin>, property: PropertyRow, externalId: string, externalUrl: string,
) {
  const noteKey = `property:${property.id}`
  const db = supabase as unknown as { from: (table: string) => LooseQuery }
  await db.from('portal_property_map').delete().eq('portal', 'argenprop').eq('notes', noteKey)
  await db.from('portal_property_map').insert({
    portal: 'argenprop', external_code: externalId, external_url: externalUrl,
    address: property.address, neighborhood: property.neighborhood,
    title: property.title ?? property.address, assigned_to: property.assigned_to,
    active: true, notes: noteKey,
  })
}

/** POST → publica la propiedad en Argenprop (síncrono). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { data: property, error } = await supabase.from('properties').select('*').eq('id', id).single()
    if (error || !property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    await initPortals(true)
    const ap = getAdapter('argenprop')
    if (!ap?.enabled) {
      return NextResponse.json(
        { error: 'Argenprop no está conectado. Faltan las env vars ARGENPROP_* en el entorno.' },
        { status: 412 },
      )
    }

    const { data: listingDraft } = await supabase
      .from('property_listings').select('metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    const meta = (listingDraft?.metadata ?? {}) as Record<string, unknown>

    let pub: { externalId: string; externalUrl: string; metadata?: Record<string, unknown> }
    try {
      pub = await (ap as ArgenpropAdapter).publish(property, {
        attributeOverrides: (meta.ap_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await supabase.from('property_listings').upsert(
        { property_id: id, portal: 'argenprop', status: 'failed', last_error: msg, attempts: 1 },
        { onConflict: 'property_id,portal' },
      )
      await supabase.from('property_publish_events').insert({
        property_id: id, portal: 'argenprop', event_type: 'failed', error_message: msg,
        actor: user.profile.full_name ?? user.id,
      })
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    const mergedMeta = { ...meta, visibilidad_ids: pub.metadata?.visibilidadIds ?? [] }
    await supabase.from('property_listings').upsert(
      {
        property_id: id, portal: 'argenprop', status: 'published',
        external_id: pub.externalId, external_url: pub.externalUrl,
        last_published_at: new Date().toISOString(), attempts: 1, last_error: null,
        metadata: mergedMeta as never,
      },
      { onConflict: 'property_id,portal' },
    )
    await supabase.from('property_publish_events').insert({
      property_id: id, portal: 'argenprop', event_type: 'published',
      payload: { externalId: pub.externalId, externalUrl: pub.externalUrl, visibilidadIds: pub.metadata?.visibilidadIds },
      actor: user.profile.full_name ?? user.id,
    })

    try {
      await syncPortalPropertyMap(supabase, property, pub.externalId, pub.externalUrl)
    } catch (bridgeErr) {
      console.warn('[ap-publish] no se pudo sincronizar portal_property_map', bridgeErr)
    }

    return NextResponse.json({ ok: true, externalId: pub.externalId, externalUrl: pub.externalUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

/**
 * PATCH → { action: 'baja' | 'republish' }
 *  - 'baja'      → Estado=Baja (deja de publicarse). status DB = 'paused'.
 *  - 'republish' → re-POST Activo (status DB = 'published').
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    const action = body.action
    if (action !== 'baja' && action !== 'republish') {
      return NextResponse.json({ error: 'action debe ser "baja" o "republish"' }, { status: 400 })
    }
    const supabase = getAdmin()
    const { data: listing } = await supabase
      .from('property_listings').select('external_id, metadata')
      .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
    if (!listing?.external_id) return NextResponse.json({ error: 'no listing to modify' }, { status: 404 })

    await initPortals(true)
    const ap = getAdapter('argenprop')
    if (!ap?.enabled) return NextResponse.json({ error: 'Argenprop not connected' }, { status: 412 })
    const adapter = ap as ArgenpropAdapter

    try {
      if (action === 'baja') {
        await adapter.unpublish(listing.external_id)
      } else {
        const { data: property } = await supabase.from('properties').select('*').eq('id', id).single()
        if (!property) return NextResponse.json({ error: 'property not found' }, { status: 404 })
        await adapter.update(property, listing.external_id)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: `${action} falló: ${msg}` }, { status: 502 })
    }

    const newStatus = action === 'baja' ? 'paused' : 'published'
    await supabase.from('property_listings')
      .update({ status: newStatus, last_error: null })
      .eq('property_id', id).eq('portal', 'argenprop')
    await supabase.from('property_publish_events').insert({
      property_id: id, portal: 'argenprop',
      event_type: action === 'baja' ? 'unpublished' : 'updated',
      payload: { action, status: newStatus }, actor: user.profile.full_name ?? user.id,
    })
    return NextResponse.json({ ok: true, status: newStatus })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/ap-publish/route.ts"
git commit -m "feat(argenprop): route ap-publish (POST síncrono + PATCH baja/republish + bridge consultas)"
```

---

## FASE 3 — Wizard UI (`components/properties/wizards/ap/`)

> La UI es un espejo casi 1:1 de `wizards/ml/`. Se copia, se renombra Ml→Ap y se
> retargetean los endpoints `/ml-*` → `/ap-*`. Las diferencias reales (sin pause/activate,
> textos "Argenprop", baja en vez de close) están explícitas abajo.

### Task 3.1: Copiar el árbol de la UI y renombrar

**Files:**
- Create (copia de `components/properties/wizards/ml/`): `components/properties/wizards/ap/`

- [ ] **Step 1: Copiar el árbol completo**

```bash
cp -R "components/properties/wizards/ml" "components/properties/wizards/ap"
ls components/properties/wizards/ap components/properties/wizards/ap/steps
```
Expected: aparecen `MercadoLibreWizard.tsx`, `useMlPublishDraft.ts`, `types.ts`, `ManageListingPanel.tsx`, `GeoPinMap.tsx`, `steps/Step*.tsx`.

- [ ] **Step 2: Renombrar archivos**

```bash
cd components/properties/wizards/ap
git mv MercadoLibreWizard.tsx ArgenpropWizard.tsx
git mv useMlPublishDraft.ts useApPublishDraft.ts
cd -
```

- [ ] **Step 3: Commit del copy (antes de editar, para que el diff posterior sea legible)**

```bash
git add components/properties/wizards/ap
git commit -m "chore(argenprop): copiar árbol wizard ML → ap (pre-rename)"
```

---

### Task 3.2: `types.ts` y `useApPublishDraft.ts` — renombres + retarget de endpoints

**Files:**
- Modify: `components/properties/wizards/ap/types.ts`
- Modify: `components/properties/wizards/ap/useApPublishDraft.ts`

- [ ] **Step 1: Reescribir `ap/types.ts`**

Replace el contenido de `components/properties/wizards/ap/types.ts` con (independiente de ML — define sus propios tipos, NO importa de mercadolibre):
```ts
export type ApValueType = 'string' | 'number' | 'number_unit' | 'boolean' | 'list'

export interface ApField {
  id: string
  name: string
  valueType: ApValueType
  required: boolean
  allowedValues?: { id: string; name: string }[]
  allowedUnits?: string[]
  hint?: string
}

export interface AttributeOverride {
  value_name?: string
  value_id?: string
}

export type StepId = 'images' | 'media' | 'fields' | 'description' | 'review' | 'confirm'

export interface ApPreviewProperty {
  id: string
  title: string | null
  description: string | null
  photos: string[]
  asking_price: number
  currency: string
  address: string
  neighborhood: string
  city: string
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  covered_area: number | null
  total_area: number | null
  latitude: number | null
  longitude: number | null
  video_url: string | null
  tour_3d_url: string | null
}

export interface ApAttributesResponse {
  categoryId: string
  required: ApField[]
  recommended: ApField[]
  prefill: Record<string, AttributeOverride>
  listingTypes: { id: string; label: string }[]
  listingTypeSelected: string
  mediaChoice: 'video' | 'tour' | 'none'
}

export interface ApDraft {
  photos: string[]
  videoUrl: string | null
  tour3dUrl: string | null
  mediaChoice: 'video' | 'tour' | 'none'
  apAttributes: Record<string, AttributeOverride>
  listingType: string
  title: string
  description: string
  askingPrice: number
  latitude: number | null
  longitude: number | null
}

export interface ApListing {
  status: string
  external_id: string | null
  external_url: string | null
  last_published_at: string | null
  last_error: string | null
}
```

- [ ] **Step 2: Reescribir `ap/useApPublishDraft.ts`**

Replace el contenido con (mismo hook, endpoints `/ap-*`, tipos `Ap*`, draft usa `apAttributes`):
```ts
'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { ApAttributesResponse, ApDraft, ApListing, ApPreviewProperty } from './types'

interface PreviewResponse {
  property: ApPreviewProperty
  payload: unknown | null
  validation: { ok: boolean; errors: string[]; warnings: string[] }
  listing: ApListing | null
}

export function useApPublishDraft(propertyId: string) {
  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState<ApPreviewProperty | null>(null)
  const [attrs, setAttrs] = useState<ApAttributesResponse | null>(null)
  const [listing, setListing] = useState<ApListing | null>(null)
  const [validation, setValidation] = useState<PreviewResponse['validation']>({ ok: false, errors: [], warnings: [] })
  const [draft, setDraft] = useState<ApDraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prevR, attrR] = await Promise.all([
        fetch(`/api/properties/${propertyId}/ap-preview`),
        fetch(`/api/properties/${propertyId}/ap-attributes`),
      ])
      if (!prevR.ok) throw new Error('No se pudo cargar el preview')
      const prev = (await prevR.json()) as PreviewResponse
      const attrJson = attrR.ok ? ((await attrR.json()) as ApAttributesResponse) : null
      setProperty(prev.property)
      setListing(prev.listing)
      setValidation(prev.validation)
      setAttrs(attrJson)
      setDraft({
        photos: prev.property.photos ?? [],
        videoUrl: prev.property.video_url,
        tour3dUrl: prev.property.tour_3d_url,
        mediaChoice: attrJson?.mediaChoice ?? (prev.property.video_url ? 'video' : prev.property.tour_3d_url ? 'tour' : 'none'),
        apAttributes: attrJson?.prefill ?? {},
        listingType: attrJson?.listingTypeSelected ?? 'estandar',
        title: prev.property.title ?? '',
        description: prev.property.description ?? '',
        askingPrice: prev.property.asking_price,
        latitude: prev.property.latitude,
        longitude: prev.property.longitude,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { load() }, [load])

  const patch = useCallback((p: Partial<ApDraft>) => setDraft(d => (d ? { ...d, ...p } : d)), [])

  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false
    const r = await fetch(`/api/properties/${propertyId}/ap-preview`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: draft.title, description: draft.description, photos: draft.photos,
        asking_price: draft.askingPrice, videoUrl: draft.videoUrl, tour3dUrl: draft.tour3dUrl,
        latitude: draft.latitude, longitude: draft.longitude,
        apAttributes: draft.apAttributes, mediaChoice: draft.mediaChoice, listingType: draft.listingType,
      }),
    })
    const j = (await r.json()) as { validation?: PreviewResponse['validation']; error?: string }
    if (!r.ok) { toast.error(j.error ?? 'Error al guardar'); return false }
    if (j.validation) setValidation(j.validation)
    return true
  }, [draft, propertyId])

  return { loading, property, attrs, listing, validation, draft, patch, save, reload: load }
}
```

- [ ] **Step 3: Typecheck (fallará en los Step* todavía sin renombrar — esperado)**

Run: `npx tsc --noEmit 2>&1 | grep "wizards/ap" | head`
Expected: errores SOLO en los `steps/*` y el shell que todavía importan tipos `Ml*` — se arreglan en 3.3/3.4.

- [ ] **Step 4: Commit**

```bash
git add components/properties/wizards/ap/types.ts components/properties/wizards/ap/useApPublishDraft.ts
git commit -m "feat(argenprop): types + useApPublishDraft (endpoints /ap-*, tipos Ap*)"
```

---

### Task 3.3: Renombrar tipos/endpoints en los Step components + StepFields (texto Argenprop)

**Files:**
- Modify: `components/properties/wizards/ap/steps/StepImages.tsx`, `StepMedia.tsx`, `StepFields.tsx`, `StepDescription.tsx`, `StepReview.tsx`, `StepConfirm.tsx`

- [ ] **Step 1: Reemplazo mecánico en todos los steps**

Aplicar, en TODOS los archivos de `components/properties/wizards/ap/steps/` y en `ArgenpropWizard.tsx`, estos reemplazos exactos (string-for-string):

| Buscar | Reemplazar |
|---|---|
| `from '../types'` (los tipos importados Ml*) | mantener `from '../types'` pero renombrar los símbolos: `MlDraft`→`ApDraft`, `MlPreviewProperty`→`ApPreviewProperty`, `MlAttributesResponse`→`ApAttributesResponse` |
| `import type { CategoryAttribute, AttributeOverride } from '@/lib/portals/mercadolibre/category-attributes'` | `import type { ApField, AttributeOverride } from '../types'` |
| `CategoryAttribute` (uso de tipo) | `ApField` |
| `draft.mlAttributes` | `draft.apAttributes` |
| `mlAttributes:` (en `onChange({...})`) | `apAttributes:` |
| `/api/properties/${propertyId}/ml-publish` | `/api/properties/${propertyId}/ap-publish` |
| `MercadoLibre` (texto visible) | `Argenprop` |

Comando para encontrar ocurrencias a revisar:
```bash
grep -rn "Ml\|mercadolibre\|mlAttributes\|MercadoLibre\|ml-publish\|ml-preview\|ml-attributes" components/properties/wizards/ap/
```

- [ ] **Step 2: `StepFields.tsx` — el import de GeoPinMap y el título**

En `components/properties/wizards/ap/steps/StepFields.tsx`:
- El `GeoPinMap` se importa de `../GeoPinMap` (ya copiado en el árbol `ap/`) — dejar igual.
- Cambiar el heading `Datos que pide MercadoLibre` → `Datos que pide Argenprop`.
- El selector "Tipo de publicación" queda igual (recibe `attrs.listingTypes` = `[{id:'estandar',label:'Estándar'}]`).

- [ ] **Step 3: `StepConfirm.tsx` — endpoint + textos + nota de fotos**

En `components/properties/wizards/ap/steps/StepConfirm.tsx`:
- `fetch(\`/api/properties/${propertyId}/ml-publish\`, { method: 'POST' })` → `/ap-publish`.
- Textos "MercadoLibre" → "Argenprop".
- La nota "ML valida el aviso (1-2 min)" reemplazar por: `Argenprop procesa el aviso. Vas a poder verlo y, si es una prueba, darlo de baja desde el panel de gestión.`

- [ ] **Step 4: Typecheck de los steps**

Run: `npx tsc --noEmit 2>&1 | grep "wizards/ap/steps" | head`
Expected: sin errores en `steps/`.

- [ ] **Step 5: Commit**

```bash
git add components/properties/wizards/ap/steps
git commit -m "feat(argenprop): steps con tipos Ap*, endpoints /ap-*, textos Argenprop"
```

---

### Task 3.4: `ArgenpropWizard.tsx` + `ManageListingPanel.tsx` (baja en vez de pause/close)

**Files:**
- Modify: `components/properties/wizards/ap/ArgenpropWizard.tsx`
- Modify: `components/properties/wizards/ap/ManageListingPanel.tsx`

- [ ] **Step 1: `ArgenpropWizard.tsx` — renombres + acción baja**

En `components/properties/wizards/ap/ArgenpropWizard.tsx`:
- Renombrar `export function MercadoLibreWizard` → `export function ArgenpropWizard`.
- `import { useMlPublishDraft } from './useMlPublishDraft'` → `import { useApPublishDraft } from './useApPublishDraft'` y su uso.
- `import { StepFields }`… los imports de steps quedan igual (mismos nombres de archivo).
- Reemplazar el bloque `changeStatus(action: 'pause'|'close'|'activate')` por una versión `baja`:
```tsx
  const [managing, setManaging] = useState<'baja' | 'republish' | null>(null)

  async function changeStatus(action: 'baja' | 'republish') {
    const msg = action === 'baja'
      ? '¿Dar de baja el aviso en Argenprop? Deja de publicarse.'
      : '¿Volver a publicar el aviso?'
    if (!confirm(msg)) return
    setManaging(action)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ap-publish`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      toast.success(action === 'baja' ? 'Aviso dado de baja' : 'Aviso republicado')
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setManaging(null)
    }
  }
```
- El render del `ManageListingPanel` pasa `onAction={changeStatus}` con la nueva firma.
- Las llamadas `<StepFields ... attrs={attrs} draft={draft} .../>` quedan igual (props mismas).

- [ ] **Step 2: `ManageListingPanel.tsx` — simplificar a Ver + Baja/Republish**

En `components/properties/wizards/ap/ManageListingPanel.tsx`:
- Cambiar la firma de props: `managing: 'baja' | 'republish' | null`, `onAction: (action: 'baja' | 'republish') => void`.
- `import type { MlListing }` → `import type { ApListing } from './types'` y usar `ApListing`.
- Mapa de status: `published` = "Activo y visible", `paused` = "Dado de baja", `failed`="Error".
- Reemplazar los 3 botones (pause/activate/close) por:
```tsx
{listing.status === 'published' && (
  <Button onClick={() => onAction('baja')} disabled={managing !== null} variant="destructive" className="w-full justify-start">
    {managing === 'baja' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
    Dar de baja en Argenprop
  </Button>
)}
{listing.status === 'paused' && (
  <Button onClick={() => onAction('republish')} disabled={managing !== null} variant="outline" className="w-full justify-start">
    {managing === 'republish' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
    Volver a publicar
  </Button>
)}
```
- Título del panel: "Aviso en Argenprop". El link `Abrir aviso en Argenprop` usa `listing.external_url` (puede estar vacío en v1 hasta que el probe resuelva la URL real — el bloque ya es condicional a `listing.external_url`).

- [ ] **Step 3: Typecheck del wizard completo**

Run: `npx tsc --noEmit 2>&1 | grep "wizards/ap" | head`
Expected: sin errores en todo `wizards/ap/`.

- [ ] **Step 4: Commit**

```bash
git add components/properties/wizards/ap/ArgenpropWizard.tsx components/properties/wizards/ap/ManageListingPanel.tsx
git commit -m "feat(argenprop): ArgenpropWizard + ManageListingPanel (baja/republish)"
```

---

### Task 3.5: Página del wizard + entrada en PostCaptureActions

**Files:**
- Create: `app/(dashboard)/properties/[id]/marketing/argenprop/page.tsx`
- Modify: `components/properties/PostCaptureActions.tsx`

- [ ] **Step 1: Crear la página** (espejo de la de ML)

Create `app/(dashboard)/properties/[id]/marketing/argenprop/page.tsx`:
```tsx
import { requireAuth } from '@/lib/auth/require-role'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2 } from 'lucide-react'
import { ArgenpropWizard } from '@/components/properties/wizards/ap/ArgenpropWizard'

export const metadata = { title: 'Publicar en Argenprop' }

export default async function ArgenpropWizardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') redirect('/')
  const { id } = await params

  return (
    <div className="max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/properties/${id}`}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver al detalle de la propiedad
        </Link>
      </Button>
      <div>
        <p className="eyebrow">Publicación manual</p>
        <h1 className="display text-3xl flex items-center gap-3">
          <Building2 className="h-7 w-7 text-[color:var(--brand)]" />
          Argenprop
        </h1>
        <p className="text-muted-foreground text-sm mt-2">
          Previsualizá el aviso, completá los campos que pide Argenprop y publicá cuando estés
          conforme. Mientras tanto, no se publica nada.
        </p>
      </div>
      <ArgenpropWizard propertyId={id} />
    </div>
  )
}
```

- [ ] **Step 2: Agregar la tarjeta Argenprop en `PostCaptureActions.tsx`**

En `components/properties/PostCaptureActions.tsx`:

1) Agregar estado y carga para Argenprop. Después del bloque `mlState` (en el `load()`), agregar el find de argenprop reutilizando la MISMA respuesta de `/listings`:
```tsx
  const [apState, setApState] = useState<{
    status: 'no_publicado' | 'publicado' | 'baja' | 'error' | 'loading'
    url?: string; error?: string
  }>({ status: 'loading' })
```
Dentro de `load()`, después de procesar `ml`, agregar (usando el mismo `data`):
```tsx
        const apr = data?.find(d => d.portal === 'argenprop')
        if (!apr) setApState({ status: 'no_publicado' })
        else if (apr.status === 'published') setApState({ status: 'publicado', url: apr.external_url ?? undefined })
        else if (apr.status === 'paused') setApState({ status: 'baja', url: apr.external_url ?? undefined })
        else if (apr.status === 'failed') setApState({ status: 'error', error: apr.last_error ?? 'Error' })
        else setApState({ status: 'no_publicado' })
```
> Nota: mover el `setApState` dentro del mismo `if (r.ok)` que parsea `data`, junto al `ml` find. En el `catch`/`else` de error, setear `setApState({ status: 'no_publicado' })`.

2) Cambiar el grid de `md:grid-cols-2` a `md:grid-cols-3` y agregar la tarjeta Argenprop como tercer item (después de la de MercadoLibre, antes o después de Meta — recomendado: ML, Argenprop, Meta):
```tsx
          {/* Argenprop */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Argenprop</span>
              </div>
              <Badge
                variant={apState.status === 'publicado' ? undefined : 'outline'}
                className={apState.status === 'publicado' ? 'bg-emerald-600 text-white text-[10px] h-5' : 'text-[10px] h-5'}
              >
                {apState.status === 'publicado' ? 'Publicado'
                  : apState.status === 'baja' ? 'De baja'
                  : apState.status === 'error' ? 'Error' : 'No publicado'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground min-h-[2.5em]">
              {apState.status === 'no_publicado' && 'Campos prellenados, edición y publicación en Argenprop en un click.'}
              {apState.status === 'publicado' && 'El aviso está activo en Argenprop.'}
              {apState.status === 'baja' && 'Aviso dado de baja.'}
              {apState.status === 'error' && (apState.error ?? 'Error de publicación.')}
              {apState.status === 'loading' && 'Cargando estado…'}
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" className="flex-1" variant={apState.status === 'no_publicado' ? 'default' : 'outline'}>
                <Link href={`/properties/${propertyId}/marketing/argenprop`}>
                  {apState.status === 'no_publicado' ? 'Publicar en Argenprop' : 'Ver / Gestionar'}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              {apState.url && (
                <Button asChild size="sm" variant="ghost">
                  <a href={apState.url} target="_blank" rel="noopener noreferrer">Abrir</a>
                </Button>
              )}
            </div>
          </div>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` (y si hay tiempo `npm run build`)
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/properties/[id]/marketing/argenprop/page.tsx" components/properties/PostCaptureActions.tsx
git commit -m "feat(argenprop): página del wizard + tarjeta de entrada en PostCaptureActions"
```

---

## FASE 4 — QA script de descubrimiento de contrato

### Task 4.1: `scripts/qa-publish-argenprop-test.ts`

**Files:**
- Create: `scripts/qa-publish-argenprop-test.ts`

- [ ] **Step 1: Implementar el script** (espejo del de ML + subcomando `probe`)

Create `scripts/qa-publish-argenprop-test.ts`:
```ts
/**
 * QA del wizard de publicación en Argenprop (PublicarIntranet).
 *
 * Uso: node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts <cmd> [arg]
 *   recon [propertyId]    -> read-only: estado de la propiedad de prueba + listing + creds
 *   probe                 -> request mínimo real al endpoint para DESCUBRIR el contrato
 *                            (publica un aviso mínimo y lo da de baja inmediatamente)
 *   publish <propertyId>  -> publica la propiedad de prueba en Argenprop
 *   verify <propertyId>   -> imprime el listing + visibilidadIds + intenta abrir la URL
 *   baja <propertyId>     -> da de baja (Estado=Baja) SIN borrar la propiedad
 *   force-baja <idOrigen> -> baja por IdOrigen directo (sin guard [TEST)
 *
 * SEGURIDAD: publish/verify/baja SOLO operan sobre propiedades cuyo título empiece
 * con "[TEST". `probe` y `force-baja` no tienen guard (operan sobre datos sintéticos
 * o un idOrigen explícito).
 */
import { createClient } from '@supabase/supabase-js'
import { resolveCredentials } from '../lib/portals/credentials'
import { ArgenpropAdapter } from '../lib/portals/argenprop/adapter'
import { apAvisoId } from '../lib/portals/argenprop/field-schema'
import { propertyToApForm } from '../lib/portals/argenprop/mapping'
import { apPublish, encodeForm } from '../lib/portals/argenprop/client'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function creds() {
  const c = await resolveCredentials('argenprop', { env: process.env, supabase: sb() as never })
  if (!c.ap) throw new Error('Faltan credenciales ARGENPROP_* en .env.local')
  return c.ap
}

async function findTestPropertyId(): Promise<string | null> {
  const { data } = await sb().from('properties').select('id, title, created_at')
    .ilike('title', '[TEST%').order('created_at', { ascending: false }).limit(1)
  return data?.[0]?.id ?? null
}

async function assertTest(propertyId: string) {
  const { data: prop } = await sb().from('properties').select('title').eq('id', propertyId).maybeSingle()
  if (!prop) throw new Error('propiedad no encontrada')
  if (!String(prop.title ?? '').startsWith('[TEST')) {
    throw new Error('ABORT: la propiedad no es de prueba (título no empieza con "[TEST"). No se toca.')
  }
}

async function recon(propertyId?: string) {
  const id = propertyId ?? (await findTestPropertyId())
  if (!id) { console.log('No se encontró propiedad de prueba ([TEST...).'); return }
  const { data: p } = await sb().from('properties').select('*').eq('id', id).maybeSingle()
  if (!p) { console.log('propiedad no encontrada'); return }
  console.log('=== PROPIEDAD DE PRUEBA ===')
  console.log({ id: p.id, title: p.title, status: p.status, legal_status: p.legal_status,
    lat: p.latitude, lng: p.longitude, photos: (p.photos ?? []).length,
    desc_chars: (p.description ?? '').length, idOrigen: apAvisoId(p as never) })
  const { data: listing } = await sb().from('property_listings').select('*')
    .eq('property_id', id).eq('portal', 'argenprop').maybeSingle()
  console.log('=== LISTING ARGENPROP ===')
  console.log(listing ?? '(sin listing)')
  const c = await creds().catch(e => { console.log('creds:', e.message); return null })
  console.log('=== CREDS ===', c ? { usr: c.usr, idSistema: c.idSistema, idVendedor: c.idVendedor, publishUrl: c.publishUrl, enabled: true } : '(faltan)')
}

/**
 * Descubre el contrato real: arma el form de la propiedad de prueba, lo IMPRIME
 * (sin publicar), después hace UN publish real y lo da de baja inmediatamente.
 * Imprime la respuesta cruda para confirmar nombres de campos / shape de error.
 */
async function probe() {
  const c = await creds()
  const id = await findTestPropertyId()
  if (!id) throw new Error('necesito una propiedad [TEST para el probe')
  const { data: p } = await sb().from('properties').select('*').eq('id', id).single()
  const form = propertyToApForm(p as never, { creds: c, idOrigen: apAvisoId(p as never), estado: 'Activo' })
  console.log('=== FORM (claves) ===')
  console.log(Object.keys(form).join('\n'))
  console.log('=== BODY urlencoded (primeros 800 chars) ===')
  console.log(encodeForm(form).slice(0, 800))
  console.log('\n=== PUBLICANDO (real) ===')
  try {
    const res = await apPublish(form, c)
    console.log('OK respuesta:', JSON.stringify(res, null, 2))
    console.log('\n=== DANDO DE BAJA inmediatamente ===')
    await new ArgenpropAdapter(true, c).unpublish(apAvisoId(p as never))
    console.log('baja OK')
  } catch (e) {
    console.log('ERROR (esto enseña el contrato):', e instanceof Error ? e.message : e)
  }
}

async function publish(propertyId: string) {
  await assertTest(propertyId)
  const c = await creds()
  const { data: property } = await sb().from('properties').select('*').eq('id', propertyId).single()
  if (!property) throw new Error('propiedad no encontrada')
  const { data: listing } = await sb().from('property_listings').select('metadata')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  const meta = (listing?.metadata ?? {}) as Record<string, unknown>
  const adapter = new ArgenpropAdapter(true, c)
  const result = await adapter.publish(property as never, {
    attributeOverrides: (meta.ap_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
  })
  await sb().from('property_listings').upsert({
    property_id: propertyId, portal: 'argenprop', status: 'published',
    external_id: result.externalId, external_url: result.externalUrl,
    last_published_at: new Date().toISOString(), last_error: null,
    metadata: { ...meta, visibilidad_ids: result.metadata?.visibilidadIds ?? [] } as never,
  }, { onConflict: 'property_id,portal' })
  console.log('OK publicado:', result)
}

async function verify(propertyId: string) {
  await assertTest(propertyId)
  const { data: listing } = await sb().from('property_listings').select('*')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  console.log('=== LISTING ===', { status: listing.status, external_id: listing.external_id,
    external_url: listing.external_url, metadata: listing.metadata })
  if (listing.external_url) {
    try {
      const r = await fetch(listing.external_url, { method: 'GET' })
      console.log(`URL ${listing.external_url} → HTTP ${r.status}`)
    } catch (e) { console.log('URL no alcanzable:', e instanceof Error ? e.message : e) }
  }
}

async function baja(propertyId: string) {
  await assertTest(propertyId)
  const c = await creds()
  const { data: listing } = await sb().from('property_listings').select('external_id')
    .eq('property_id', propertyId).eq('portal', 'argenprop').maybeSingle()
  if (!listing?.external_id) throw new Error('sin external_id (no publicado)')
  await new ArgenpropAdapter(true, c).unpublish(listing.external_id)
  await sb().from('property_listings').update({ status: 'paused' })
    .eq('property_id', propertyId).eq('portal', 'argenprop')
  console.log(`OK: aviso ${listing.external_id} dado de baja. Propiedad ${propertyId} INTACTA.`)
}

async function forceBaja(idOrigen: string) {
  const c = await creds()
  await new ArgenpropAdapter(true, c).unpublish(idOrigen)
  await sb().from('property_listings').update({ status: 'paused' })
    .eq('external_id', idOrigen).eq('portal', 'argenprop')
  console.log(`OK: aviso ${idOrigen} dado de baja (Argenprop + DB).`)
}

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  if (cmd === 'recon') return recon(arg)
  if (cmd === 'probe') return probe()
  if (cmd === 'force-baja') { if (!arg) { console.error('uso: force-baja <idOrigen>'); process.exit(1) } return forceBaja(arg) }
  if (!arg) { console.error('uso: <recon|probe|publish|verify|baja> [propertyId]'); process.exit(1) }
  if (cmd === 'publish') return publish(arg)
  if (cmd === 'verify') return verify(arg)
  if (cmd === 'baja') return baja(arg)
  console.error(`comando desconocido: ${cmd}`); process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Typecheck del script**

Run: `npx tsc --noEmit 2>&1 | grep "qa-publish-argenprop" | head`
Expected: sin errores.

- [ ] **Step 3: Smoke test del `recon` (read-only, seguro)**

Run: `node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts recon`
Expected: imprime la propiedad de prueba + creds presentes (NO publica nada).

- [ ] **Step 4: Commit**

```bash
git add scripts/qa-publish-argenprop-test.ts
git commit -m "feat(argenprop): script QA (recon/probe/publish/verify/baja/force-baja)"
```

---

## FASE 5 — QA en vivo: descubrir contrato, publicar [TEST], verificar, dar de baja

> Esta fase la ejecuta el agente QA (subagent) contra el endpoint REAL. Itera sobre
> la capa wire según lo que devuelva `probe`. El usuario confirmó publish+baja real.

### Task 5.1: Ejecutar el probe y CORREGIR la capa wire con el contrato real

**Files (posibles ediciones según el probe):**
- Modify: `lib/portals/argenprop/mapping.ts` (nombres de campos `aviso.*`/`propiedad.*` reales)
- Modify: `lib/portals/argenprop/field-schema.ts` (códigos TipoOperación/Moneda reales)
- Modify: `lib/portals/argenprop/client.ts` (shape de respuesta/error real, URL pública)

- [ ] **Step 1: Correr el probe**

Run: `node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts probe`
Expected: imprime las claves del form, el body urlencoded, y la respuesta REAL (éxito con visibilidadIds, o un error que enseña qué campo falta/está mal).

- [ ] **Step 2: Interpretar y corregir**

Según la respuesta:
- Si devuelve **error de campo** (ej. "falta aviso.X" / "Y inválido"): corregir el nombre/código en `mapping.ts` (o el código en `field-schema.ts`) y re-correr `probe`. Repetir hasta éxito.
- Si devuelve **error de auth**: revisar qué campo de credenciales espera (`usr/psd` vs `Vendedor.*`) y ajustar `mapping.ts` (sección auth) — quitar el comentario `CONTRACT ASSUMPTION` y dejar el nombre confirmado.
- Si **publica OK**: capturar el shape exacto de la respuesta y, si trae la URL pública del aviso, ajustar `client.ts`/`adapter.ts` para extraerla a `externalUrl` (en vez del best-effort).
- Documentar cada corrección en el commit y, si es un gotcha durable, agregarlo a `CLAUDE.md` vía la skill `documenting-errors`.

- [ ] **Step 3: Re-correr la suite unit tras las correcciones**

Run: `npx vitest run lib/portals/argenprop/`
Expected: PASS (ajustar los tests si cambiaron nombres de campos — los tests son la red de seguridad del refactor).

- [ ] **Step 4: Commit de las correcciones del contrato**

```bash
git add lib/portals/argenprop/
git commit -m "fix(argenprop): ajustar capa wire al contrato real de PublicarIntranet (probe)"
```

---

### Task 5.2: Publicar la propiedad [TEST], verificar visible, dar de baja

**Files:** ninguno (operación contra el endpoint real + DB).

- [ ] **Step 1: Recon de la propiedad de prueba**

Run: `node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts recon`
Expected: confirma `[TEST...`, lat/lng presentes, ≥1 foto, descripción. Si falta lat/lng o fotos, completarlos antes (o el publish fallará por `validateCommon`).

- [ ] **Step 2: Publicar**

Run: `node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts publish <propertyId>`
Expected: `OK publicado` con `externalId` (df-...) y `visibilidadIds` no vacío.

- [ ] **Step 3: Verificar visible**

Run: `node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts verify <propertyId>`
Expected: status `published`, `external_url` presente; si la URL responde 200, el aviso es visible. Anotar la URL para el reporte al usuario.

- [ ] **Step 4: Dar de baja (teardown)**

Run: `node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts baja <propertyId>`
Expected: `OK: aviso df-... dado de baja. Propiedad ... INTACTA.`

- [ ] **Step 5: Confirmar estado final**

Run: `node --env-file=.env.local --import tsx scripts/qa-publish-argenprop-test.ts recon <propertyId>`
Expected: listing en `status='paused'` (dado de baja), propiedad intacta.

- [ ] **Step 6: Reporte al usuario**

Resumir: contrato confirmado/ajustado, que el publish funcionó (con la URL del aviso vista), y que se dio de baja OK. Avisar que ya puede hacer sus pruebas manuales de rendimiento desde el wizard (`/properties/[id]/marketing/argenprop`).

---

## FASE 6 — Cierre

### Task 6.1: Verificación final + (opcional) PR

- [ ] **Step 1: Suite completa de portals + typecheck**

Run:
```bash
npx vitest run lib/portals/
npx tsc --noEmit
```
Expected: todo PASS / sin errores.

- [ ] **Step 2: Build de Next (opcional pero recomendado antes de mergear)**

Run: `npm run build`
Expected: build OK (las nuevas routes `ap-*` y la página compilan).

- [ ] **Step 3: Decidir integración con la skill `finishing-a-development-branch`**

Usar `superpowers:finishing-a-development-branch` para elegir merge/PR/cleanup de la rama `feat/argenprop-publicacion`. Recordar: el commit debe ser autor `Sujupar <redstyle50@gmail.com>` si se va a mergear a `main` (Netlify auto-deploya en push a main). NO pushear `main` sin que el usuario lo pida.

---

## Self-Review (completado por el autor del plan)

**Spec coverage** — cada sección del spec tiene tarea:
- Misma estructura/UX que ML → Fase 3 (copy+rename del árbol ml→ap).
- Pantalla de campos prellenados → Task 1.2 (`field-schema`/`derivedPrefill`) + Task 2.1 (`ap-attributes`) + Task 3.3 (`StepFields`).
- Publicar y ver el aviso → Task 2.3 (`ap-publish` POST + `external_url`) + Task 3.4/3.5 (link "Abrir en Argenprop").
- Dar de baja rápido → Task 2.3 (PATCH baja) + Task 3.4 (botón) + Task 4.1/5.2 (`baja`/`force-baja`).
- Wizard-only (no worker) → Task 0.2 (verificación trigger) + status `'draft'` en Task 2.2.
- QA con [TEST] → Fase 4 + Fase 5.
- Capa wire aislada / contrato incierto → Fase 1 con `CONTRACT ASSUMPTION` + Task 5.1 (probe).
- Auth abogado denegado → routes 2.1/2.2/2.3 (mismo patrón ML).
- Tablas/migraciones → confirmado cero migraciones (Task 0.2 + nota header).

**Placeholder scan** — sin TBD/TODO; los `CONTRACT ASSUMPTION` son intencionales y tienen su tarea de resolución (5.1). Código completo en cada paso de código.

**Type consistency** — `AttributeOverride` (= `{value_name?, value_id?}`) consistente entre `field-schema.ts`, `mapping.ts`, routes y `ap/types.ts`. `ApField` definido en `field-schema.ts` y re-declarado en `ap/types.ts` (frontend no importa de lib — patrón del repo, igual que ML). `apAvisoId` usado igual en adapter/route/QA. `ApCredentials` definido en `credentials.ts`, consumido por `mapping.ts`/`client.ts`/`adapter.ts`/`index.ts`/QA. `ApFormOptions.creds` consistente. `propertyToApForm`/`apPublish`/`encodeForm`/`parseApResponse` nombres consistentes entre tasks 1.3/1.4/1.5/4.1.
