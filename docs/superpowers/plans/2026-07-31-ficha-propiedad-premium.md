# Ficha de propiedad premium — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir `/properties/[id]` de una columna de ~12 tarjetas apiladas en una ficha premium con galería de lectura y datos clave fijos arriba, y navegación por **pestañas que cambian el contenido** (Propiedad · Multimedia · Documentación · Difusión · Historial), sin alterar ninguna función existente.

**Architecture:** La página pasa a ser un orquestador delgado (fetch + estado + composición). Toda la lógica de decisión (qué datos clave existen, qué pestañas se ven, cuál es el próximo paso, cómo se arma el mosaico) sale del JSX y vive en funciones puras en `lib/properties/detail-view.ts`, probadas con vitest. Los componentes pesados que ya funcionan (`PropertyMediaCard`, `LandingSection`, `MarketingTabs`, `FlowHistoryCard`, `LegalReviewHistory`) se **envuelven, no se reescriben**. Solo cambian por dentro `LegalDocsChecklist` (compactación) y `PostCaptureActions` (cuarto canal: Landing).

**Tech Stack:** Next.js 16 (App Router, componente cliente) · React 19 · TypeScript 5 · Tailwind CSS 4 · shadcn/ui (new-york) · lucide-react · Leaflet 1.9 (ya instalado) · Vitest 4 + happy-dom + @testing-library/react.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-07-31-ficha-propiedad-premium-design.md`. La tabla de paridad de la §5.9 es el checklist de "no perdimos nada".
- **Cero cambios de backend:** no se toca ninguna ruta de `app/api/`, ni `lib/supabase/properties.ts`, ni migraciones. `getProperty` ya hace `select('*')`.
- **Permisos idénticos a hoy:** el abogado NO ve Multimedia, ni Datos Comerciales, ni Difusión, ni las acciones de archivo. Solo `admin` y `dueno` pueden eliminar definitivamente.
- **Difusión solo si `status === 'approved'`** y rol ≠ abogado (regla vigente).
- **Prosa de interfaz en español rioplatense** (voseo: "Subí", "Enviá", "Revisá").
- **Turbopack no arranca en esta carpeta** (bug con el acento de "Gestión" en el path absoluto). NO usar `next build` ni `next dev` a secas para verificar. Verificación = `npx vitest run` + `npx tsc --noEmit` + probe con `renderToStaticMarkup`. Para mirarlo en un navegador: `npx next dev --webpack`.
- **Commits:** autor `Sujupar <redstyle50@gmail.com>` o el deploy de Netlify falla. Usar `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit`.
- **Tokens visuales existentes:** clases `.display`, `.eyebrow`, `.tabular-n` de `app/globals.css`; color de marca `var(--brand)` / `var(--brand-soft)`. No inventar tokens nuevos ni agregar dependencias.

---

### Task 1: Helpers puros de la ficha

Toda la lógica de decisión de la vista, en funciones sin React, con tests. Es la base de las 11 tareas siguientes.

**Files:**
- Create: `lib/properties/detail-view.ts`
- Test: `lib/properties/detail-view.test.ts`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `type TabKey = 'propiedad' | 'multimedia' | 'documentacion' | 'difusion' | 'historial'`
  - `TAB_LABELS: Record<TabKey, string>`
  - `buildKeyStats(p: KeyStatsInput): KeyStat[]` donde `KeyStat = { key: string; label: string; value: string }`
  - `heroLayout(count: number): { grid: string; cover: string; thumbs: number }`
  - `visibleTabs(input: { role: string | null | undefined; status: string }): TabKey[]`
  - `resolveTab(param: string | null | undefined, visible: TabKey[]): TabKey`
  - `ghlMissingFields(p: GhlCheckInput): string[]`
  - `nextStep(i: NextStepInput): NextStep | null`
  - `operationLabel(op: string | null | undefined): string`
  - `propertyTypeLabel(t: string | null | undefined): string`
  - `formatMoney(amount: number, currency: string): string`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/properties/detail-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildKeyStats, heroLayout, visibleTabs, resolveTab,
  ghlMissingFields, nextStep, operationLabel, propertyTypeLabel, formatMoney,
} from './detail-view'

describe('buildKeyStats', () => {
  it('solo devuelve los datos que existen, en orden', () => {
    const stats = buildKeyStats({ rooms: 3, bedrooms: 2, bathrooms: null, covered_area: 78, total_area: 92 })
    expect(stats.map(s => s.key)).toEqual(['rooms', 'bedrooms', 'covered_area', 'total_area'])
    expect(stats[2].value).toBe('78 m²')
  })

  it('trata el piso 0 como PB (y no lo descarta por ser falsy)', () => {
    expect(buildKeyStats({ floor: 0 })).toEqual([{ key: 'floor', label: 'Piso', value: 'PB' }])
    expect(buildKeyStats({ floor: 4 })[0].value).toBe('4º')
  })

  it('singulariza la antigüedad y formatea expensas en pesos', () => {
    expect(buildKeyStats({ age: 1 })[0].value).toBe('1 año')
    expect(buildKeyStats({ age: 12 })[0].value).toBe('12 años')
    expect(buildKeyStats({ expensas: 145000 })[0].value).toContain('145.000')
  })

  it('con la propiedad vacía no devuelve nada', () => {
    expect(buildKeyStats({})).toEqual([])
  })
})

describe('heroLayout', () => {
  it('una sola foto ocupa todo el ancho y no tiene miniaturas', () => {
    expect(heroLayout(1)).toEqual({ grid: 'grid-cols-1', cover: '', thumbs: 0 })
  })
  it('con 3 fotos deja 2 miniaturas y con 5 o más, 4', () => {
    expect(heroLayout(3).thumbs).toBe(2)
    expect(heroLayout(5).thumbs).toBe(4)
    expect(heroLayout(22).thumbs).toBe(4)
  })
  it('nunca pide más miniaturas que fotos disponibles', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 20]) {
      expect(heroLayout(n).thumbs).toBeLessThanOrEqual(Math.max(0, n - 1))
    }
  })
})

describe('visibleTabs / resolveTab', () => {
  it('el asesor con propiedad captada ve las cinco', () => {
    expect(visibleTabs({ role: 'asesor', status: 'approved' }))
      .toEqual(['propiedad', 'multimedia', 'documentacion', 'difusion', 'historial'])
  })
  it('sin captar todavía, no hay Difusión', () => {
    expect(visibleTabs({ role: 'asesor', status: 'pending_docs' })).not.toContain('difusion')
  })
  it('el abogado no ve Multimedia ni Difusión', () => {
    expect(visibleTabs({ role: 'abogado', status: 'approved' }))
      .toEqual(['propiedad', 'documentacion', 'historial'])
  })
  it('resuelve la pestaña de la URL y cae en Propiedad si no corresponde', () => {
    const visibles = visibleTabs({ role: 'abogado', status: 'approved' })
    expect(resolveTab('documentacion', visibles)).toBe('documentacion')
    expect(resolveTab('difusion', visibles)).toBe('propiedad')
    expect(resolveTab(null, visibles)).toBe('propiedad')
    expect(resolveTab('cualquier-cosa', visibles)).toBe('propiedad')
  })
})

describe('ghlMissingFields', () => {
  it('detecta los placeholders de importación como faltantes', () => {
    const missing = ghlMissingFields({
      address: '[Importado GHL] sin dirección', neighborhood: '[PENDIENTE]',
      asking_price: 0, commission_percentage: 3, covered_area: 50, total_area: 60, photos: [],
    })
    expect(missing).toEqual(['dirección', 'barrio', 'precio de venta', 'fotos'])
  })
  it('con todo cargado no falta nada', () => {
    expect(ghlMissingFields({
      address: 'Rivadavia 4820', neighborhood: 'Caballito', asking_price: 185000,
      commission_percentage: 3, covered_area: 78, total_area: 92, photos: ['a.jpg'],
    })).toEqual([])
  })
})

describe('nextStep', () => {
  const base = {
    role: 'asesor', status: 'approved', legalStatus: 'approved', legalNotes: null,
    photosCount: 5, documentsCount: 3, ghlImported: false, ghlMissing: [],
    importSource: null, legalDocsPending: false, originPending: false,
  }

  it('propiedad sana y captada: no muestra nada', () => {
    expect(nextStep(base)).toBeNull()
  })

  it('rechazo legal gana sobre todo lo demás y muestra las observaciones', () => {
    const s = nextStep({ ...base, legalStatus: 'rejected', legalNotes: 'Escritura vencida', ghlImported: true, ghlMissing: ['fotos'] })
    expect(s?.id).toBe('legal-rejected')
    expect(s?.tone).toBe('danger')
    expect(s?.text).toBe('Escritura vencida')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Ver observaciones' })
  })

  it('con documentación cargada y sin enviar, ofrece enviar a revisión legal', () => {
    const s = nextStep({ ...base, status: 'pending_docs', legalStatus: 'pending', photosCount: 0, documentsCount: 2 })
    expect(s?.action).toEqual({ kind: 'submit-review', label: 'Enviar a Revisión Legal' })
  })

  it('sin ningún documento, manda a la pestaña Documentación', () => {
    const s = nextStep({ ...base, status: 'pending_docs', legalStatus: 'pending', photosCount: 0, documentsCount: 0 })
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' })
  })

  it('legal aprobado y sin fotos: manda a Multimedia', () => {
    const s = nextStep({ ...base, status: 'pending_photos', photosCount: 0 })
    expect(s?.id).toBe('photos')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'multimedia', label: 'Subir fotos' })
  })

  it('al abogado nunca le ofrece subir fotos ni enviar a revisión', () => {
    const s = nextStep({ ...base, role: 'abogado', status: 'pending_photos', photosCount: 0 })
    expect(s?.action).toBeNull()
  })

  it('al abogado con revisión pendiente le ofrece revisar', () => {
    const s = nextStep({ ...base, role: 'abogado', status: 'pending_review', legalStatus: 'pending' })
    expect(s?.id).toBe('legal-todo')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Revisar documentación' })
  })

  it('al asesor con revisión en curso solo le informa', () => {
    const s = nextStep({ ...base, status: 'pending_review', legalStatus: 'pending' })
    expect(s?.id).toBe('legal-waiting')
    expect(s?.action).toBeNull()
  })

  it('la descartada avisa que está fuera del flujo', () => {
    expect(nextStep({ ...base, status: 'descartada' })?.id).toBe('descartada')
  })

  it('la importada por CSV con archivos pendientes manda a Documentación', () => {
    const s = nextStep({ ...base, importSource: 'csv_precaptada', legalDocsPending: true })
    expect(s?.id).toBe('precaptada')
    expect(s?.action).toEqual({ kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' })
  })
})

describe('etiquetas', () => {
  it('arma el ojo de aguja de la operación', () => {
    expect(operationLabel('venta')).toBe('en venta')
    expect(operationLabel('alquiler')).toBe('en alquiler')
    expect(operationLabel('alquiler_temporario')).toBe('en alquiler temporario')
    expect(operationLabel(null)).toBe('en venta')
  })
  it('capitaliza el tipo y respeta PH', () => {
    expect(propertyTypeLabel('departamento')).toBe('Departamento')
    expect(propertyTypeLabel('ph')).toBe('PH')
    expect(propertyTypeLabel(null)).toBe('Propiedad')
  })
  it('formatea precios sin decimales', () => {
    expect(formatMoney(185000, 'USD')).toContain('185.000')
    expect(formatMoney(185000, 'USD')).not.toContain(',00')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/properties/detail-view.test.ts`
Expected: FAIL — `Failed to resolve import "./detail-view"`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/properties/detail-view.ts`:

```ts
/**
 * Helpers PUROS de la ficha de propiedad (/properties/[id]).
 *
 * Viven fuera de los componentes a propósito: Turbopack no arranca en esta
 * carpeta (bug con el acento de "Gestión" en el path absoluto), así que la
 * única verificación barata y confiable de esta lógica es vitest sobre
 * funciones sin React.
 */

export type TabKey = 'propiedad' | 'multimedia' | 'documentacion' | 'difusion' | 'historial'

export const TAB_LABELS: Record<TabKey, string> = {
  propiedad: 'Propiedad',
  multimedia: 'Multimedia',
  documentacion: 'Documentación',
  difusion: 'Difusión',
  historial: 'Historial',
}

/* ---------------------------------- datos --------------------------------- */

export interface KeyStat { key: string; label: string; value: string }

export interface KeyStatsInput {
  rooms?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  garages?: number | null
  covered_area?: number | null
  total_area?: number | null
  floor?: number | null
  age?: number | null
  expensas?: number | null
}

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0,
})

export function formatMoney(amount: number, currency: string): string {
  const safe = currency === 'ARS' ? 'ARS' : 'USD'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: safe, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount)
}

/** Datos clave de la cabecera. Omite lo que no está cargado — sin huecos vacíos. */
export function buildKeyStats(p: KeyStatsInput): KeyStat[] {
  const out: KeyStat[] = []
  const push = (key: string, label: string, value: string | null) => {
    if (value) out.push({ key, label, value })
  }
  push('rooms', 'Ambientes', p.rooms ? String(p.rooms) : null)
  push('bedrooms', 'Dormitorios', p.bedrooms ? String(p.bedrooms) : null)
  push('bathrooms', 'Baños', p.bathrooms ? String(p.bathrooms) : null)
  push('garages', 'Cocheras', p.garages ? String(p.garages) : null)
  push('covered_area', 'Cubierta', p.covered_area ? `${p.covered_area} m²` : null)
  push('total_area', 'Total', p.total_area ? `${p.total_area} m²` : null)
  // El piso 0 es Planta Baja: no se puede filtrar por falsy.
  push('floor', 'Piso', p.floor == null ? null : p.floor === 0 ? 'PB' : `${p.floor}º`)
  push('age', 'Antigüedad', p.age ? `${p.age} año${p.age === 1 ? '' : 's'}` : null)
  push('expensas', 'Expensas', p.expensas ? ARS.format(p.expensas) : null)
  return out
}

/* --------------------------------- galería -------------------------------- */

/**
 * Distribución del mosaico según cuántas fotos hay, para que nunca quede un
 * hueco gris. El contenedor tiene alto fijo; las imágenes van con `h-full`.
 */
export function heroLayout(count: number): { grid: string; cover: string; thumbs: number } {
  if (count <= 1) return { grid: 'grid-cols-1', cover: '', thumbs: 0 }
  if (count === 2) return { grid: 'grid-cols-2', cover: '', thumbs: 1 }
  if (count === 3) return { grid: 'grid-cols-3 grid-rows-2', cover: 'col-span-2 row-span-2', thumbs: 2 }
  // Con 4 fotos exactas, el mosaico "portada grande + 4 chicas" dejaría una
  // celda vacía: van las 4 parejas en 2×2.
  if (count === 4) return { grid: 'grid-cols-2 grid-rows-2', cover: '', thumbs: 3 }
  return { grid: 'grid-cols-4 grid-rows-2', cover: 'col-span-2 row-span-2', thumbs: 4 }
}

/* -------------------------------- pestañas -------------------------------- */

export function visibleTabs(input: { role: string | null | undefined; status: string }): TabKey[] {
  const isAbogado = input.role === 'abogado'
  const tabs: TabKey[] = ['propiedad']
  if (!isAbogado) tabs.push('multimedia')
  tabs.push('documentacion')
  if (!isAbogado && input.status === 'approved') tabs.push('difusion')
  tabs.push('historial')
  return tabs
}

/** La pestaña de la URL, o la primera visible si ese valor no corresponde. */
export function resolveTab(param: string | null | undefined, visible: TabKey[]): TabKey {
  const candidate = (param ?? '') as TabKey
  return visible.includes(candidate) ? candidate : visible[0]
}

/* ------------------------------ próximo paso ------------------------------ */

export interface GhlCheckInput {
  address?: string | null
  neighborhood?: string | null
  asking_price?: number | null
  commission_percentage?: number | null
  covered_area?: number | null
  total_area?: number | null
  photos?: string[] | null
}

const isPlaceholder = (v?: string | null) =>
  !v || v.startsWith('[PENDIENTE') || v.startsWith('[Importado GHL')

export function ghlMissingFields(p: GhlCheckInput): string[] {
  const missing: string[] = []
  if (isPlaceholder(p.address)) missing.push('dirección')
  if (isPlaceholder(p.neighborhood)) missing.push('barrio')
  if (!p.asking_price || p.asking_price <= 0) missing.push('precio de venta')
  if (!p.commission_percentage) missing.push('comisión')
  if (!p.covered_area) missing.push('m² cubiertos')
  if (!p.total_area) missing.push('m² totales')
  if (!Array.isArray(p.photos) || p.photos.length === 0) missing.push('fotos')
  return missing
}

export type NextStepTone = 'info' | 'warn' | 'danger' | 'neutral'

export type NextStepAction =
  | { kind: 'tab'; tab: TabKey; label: string }
  | { kind: 'submit-review'; label: string }

export interface NextStep {
  id: string
  tone: NextStepTone
  title: string
  text: string
  action: NextStepAction | null
}

export interface NextStepInput {
  role: string | null | undefined
  status: string
  legalStatus: string
  legalNotes: string | null
  photosCount: number
  documentsCount: number
  ghlImported: boolean
  ghlMissing: string[]
  importSource: string | null
  legalDocsPending: boolean
  originPending: boolean
}

/**
 * UN solo bloque de aviso, por prioridad, en lugar de los cinco banners
 * sueltos de la versión anterior. Devuelve null cuando no hay nada pendiente.
 */
export function nextStep(i: NextStepInput): NextStep | null {
  const isAbogado = i.role === 'abogado'

  if (i.status === 'descartada') {
    return {
      id: 'descartada', tone: 'neutral', title: 'Propiedad descartada',
      text: 'Quedó fuera del flujo activo. Podés restaurarla a borrador desde el pie de la página.',
      action: null,
    }
  }

  if (i.legalStatus === 'rejected') {
    return {
      id: 'legal-rejected', tone: 'danger', title: 'Documentación rechazada',
      text: i.legalNotes || 'El abogado rechazó la documentación. Revisá las observaciones y volvé a enviarla.',
      action: { kind: 'tab', tab: 'documentacion', label: 'Ver observaciones' },
    }
  }

  if (i.ghlImported && i.ghlMissing.length > 0) {
    return {
      id: 'ghl', tone: 'warn', title: 'Propiedad importada desde GHL',
      text: `Faltan completar: ${i.ghlMissing.join(', ')}.`,
      action: null,
    }
  }

  if (i.importSource === 'csv_precaptada' || i.legalDocsPending || i.originPending) {
    const pendientes: string[] = []
    if (i.legalDocsPending) pendientes.push('subir los archivos de la documentación legal')
    if (i.originPending) pendientes.push('asignar el origen del lead')
    return {
      id: 'precaptada', tone: 'warn', title: 'Propiedad captada importada',
      text: pendientes.length
        ? `Queda pendiente: ${pendientes.join(' y ')}.`
        : 'Fue subida en bloque; revisá que los datos estén completos.',
      action: i.legalDocsPending
        ? { kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' }
        : null,
    }
  }

  if (i.status === 'pending_review' && i.legalStatus !== 'approved') {
    return isAbogado
      ? {
          id: 'legal-todo', tone: 'info', title: 'Revisión legal pendiente',
          text: 'Revisá la documentación y aprobá o rechazá la propiedad.',
          action: { kind: 'tab', tab: 'documentacion', label: 'Revisar documentación' },
        }
      : {
          id: 'legal-waiting', tone: 'info', title: 'En revisión legal',
          text: 'La documentación fue enviada al abogado. Te avisamos cuando la revise.',
          action: null,
        }
  }

  if (i.legalStatus === 'approved' && i.photosCount === 0) {
    return {
      id: 'photos', tone: 'warn', title: 'Fotos pendientes',
      text: 'La revisión legal fue aprobada. Subí las fotos para completar la captación.',
      action: isAbogado ? null : { kind: 'tab', tab: 'multimedia', label: 'Subir fotos' },
    }
  }

  if ((i.status === 'pending_docs' || i.status === 'pending_photos') && !isAbogado) {
    return i.documentsCount > 0
      ? {
          id: 'submit', tone: 'info', title: 'Lista para revisión legal',
          text: 'Ya hay documentación cargada. Enviala al abogado para que la revise.',
          action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
        }
      : {
          id: 'docs', tone: 'warn', title: 'Falta la documentación',
          text: 'Subí los documentos obligatorios para poder enviar la propiedad a revisión legal.',
          action: { kind: 'tab', tab: 'documentacion', label: 'Ir a Documentación' },
        }
  }

  return null
}

/* -------------------------------- etiquetas ------------------------------- */

export function operationLabel(op: string | null | undefined): string {
  switch ((op ?? 'venta').toLowerCase().trim()) {
    case 'alquiler': return 'en alquiler'
    case 'alquiler_temporario':
    case 'alquiler temporario': return 'en alquiler temporario'
    default: return 'en venta'
  }
}

const TYPE_LABELS: Record<string, string> = {
  ph: 'PH', casa: 'Casa', departamento: 'Departamento', local: 'Local',
  oficina: 'Oficina', terreno: 'Terreno', cochera: 'Cochera', galpon: 'Galpón',
}

export function propertyTypeLabel(t: string | null | undefined): string {
  const s = (t ?? '').trim().toLowerCase()
  if (!s) return 'Propiedad'
  return TYPE_LABELS[s] ?? s.charAt(0).toUpperCase() + s.slice(1)
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/properties/detail-view.test.ts`
Expected: PASS — 20 tests en verde.

- [ ] **Step 5: Commit**

```bash
git add lib/properties/detail-view.ts lib/properties/detail-view.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): helpers puros de la ficha de propiedad (datos clave, pestañas, próximo paso)"
```

---

### Task 2: Galería de portada (solo lectura)

El mosaico tipo portal con chips de material, visor a pantalla completa y estado vacío diseñado.

**Files:**
- Create: `components/properties/detail/PropertyHeroGallery.tsx`
- Test: `components/properties/detail/PropertyHeroGallery.test.tsx`

**Interfaces:**
- Consumes: `heroLayout` de `lib/properties/detail-view`.
- Produces: `<PropertyHeroGallery photos={string[]} address={string} plansCount={number} hasVideo={boolean} hasTour={boolean} onGoToMedia?={() => void} />`

- [ ] **Step 1: Escribir el test que falla**

Crear `components/properties/detail/PropertyHeroGallery.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyHeroGallery } from './PropertyHeroGallery'

const photos = Array.from({ length: 22 }, (_, i) => `https://x/${i}.jpg`)

describe('PropertyHeroGallery', () => {
  it('muestra los chips con el material disponible', () => {
    render(<PropertyHeroGallery photos={photos} address="Rivadavia 4820" plansCount={2} hasVideo hasTour />)
    expect(screen.getByText('22 fotos')).toBeInTheDocument()
    expect(screen.getByText('2 planos')).toBeInTheDocument()
    expect(screen.getByText('Video')).toBeInTheDocument()
    expect(screen.getByText('Recorrido 360°')).toBeInTheDocument()
  })

  it('no muestra chips de material que no existe', () => {
    render(<PropertyHeroGallery photos={['https://x/0.jpg']} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText('1 foto')).toBeInTheDocument()
    expect(screen.queryByText('Video')).not.toBeInTheDocument()
    expect(screen.queryByText(/plano/)).not.toBeInTheDocument()
  })

  it('indica cuántas fotos quedan fuera del mosaico', () => {
    render(<PropertyHeroGallery photos={photos} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText('+17')).toBeInTheDocument()
  })

  it('abre el visor al hacer clic en una foto y cierra con ESC', async () => {
    const user = userEvent.setup()
    render(<PropertyHeroGallery photos={photos} address="Rivadavia 4820" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /ver foto 1/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin fotos muestra el panel de marca con el botón para subirlas', async () => {
    const onGoToMedia = vi.fn()
    const user = userEvent.setup()
    render(<PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} onGoToMedia={onGoToMedia} />)

    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /subir fotos/i }))
    expect(onGoToMedia).toHaveBeenCalledTimes(1)
  })

  it('sin fotos y sin permiso de multimedia (abogado) no ofrece subirlas', () => {
    render(<PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} />)
    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /subir fotos/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run components/properties/detail/PropertyHeroGallery.test.tsx`
Expected: FAIL — no se resuelve `./PropertyHeroGallery`.

- [ ] **Step 3: Escribir la implementación**

Crear `components/properties/detail/PropertyHeroGallery.tsx`:

```tsx
'use client'

/**
 * Galería de portada de la ficha — SOLO LECTURA.
 * La edición (subir, reordenar, borrar) vive en la pestaña Multimedia.
 */
import { useEffect, useState } from 'react'
import { ImageOff, X } from 'lucide-react'
import { heroLayout } from '@/lib/properties/detail-view'

interface Props {
  photos: string[]
  address: string
  plansCount: number
  hasVideo: boolean
  hasTour: boolean
  /** Ausente = el rol no tiene pestaña Multimedia (abogado). */
  onGoToMedia?: () => void
}

export function PropertyHeroGallery({ photos, address, plansCount, hasVideo, hasTour, onGoToMedia }: Props) {
  const [openAt, setOpenAt] = useState<number | null>(null)

  useEffect(() => {
    if (openAt === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenAt(null)
      if (e.key === 'ArrowRight') setOpenAt(i => (i === null ? i : (i + 1) % photos.length))
      if (e.key === 'ArrowLeft') setOpenAt(i => (i === null ? i : (i - 1 + photos.length) % photos.length))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openAt, photos.length])

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl bg-gradient-to-br from-[color:var(--brand)] to-[color:var(--brand)]/75 text-white px-6 py-14 flex flex-col items-center justify-center gap-3 text-center">
        <ImageOff className="h-8 w-8 opacity-80" />
        <p className="display text-lg">Todavía no hay fotos de esta propiedad</p>
        <p className="text-sm text-white/75 max-w-md">
          Sin fotos no se puede publicar en portales ni lanzar campañas.
        </p>
        {onGoToMedia && (
          <button
            type="button"
            onClick={onGoToMedia}
            className="mt-2 rounded-lg bg-white text-[color:var(--brand)] px-5 py-2 text-sm font-semibold hover:bg-white/90 transition"
          >
            Subir fotos
          </button>
        )}
      </div>
    )
  }

  const layout = heroLayout(photos.length)
  const thumbs = photos.slice(1, 1 + layout.thumbs)
  const hidden = photos.length - 1 - thumbs.length

  const chips: string[] = [`${photos.length} foto${photos.length === 1 ? '' : 's'}`]
  if (plansCount > 0) chips.push(`${plansCount} plano${plansCount === 1 ? '' : 's'}`)
  if (hasVideo) chips.push('Video')
  if (hasTour) chips.push('Recorrido 360°')

  return (
    <>
      <div className={`grid gap-2 h-[280px] md:h-[420px] ${layout.grid}`}>
        <button
          type="button"
          onClick={() => setOpenAt(0)}
          aria-label={`Ver foto 1 de ${address}`}
          className={`relative overflow-hidden rounded-2xl bg-muted group ${layout.cover}`}
        >
          <img src={photos[0]} alt={`${address} — foto principal`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
          <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent pointer-events-none" />
          <span className="absolute left-3 bottom-3 flex flex-wrap gap-1.5">
            {chips.map(c => (
              <span key={c} className="rounded-full bg-black/60 text-white text-[11px] font-semibold px-2.5 py-1 backdrop-blur-sm">
                {c}
              </span>
            ))}
          </span>
        </button>

        {thumbs.map((url, i) => {
          const index = i + 1
          const isLast = i === thumbs.length - 1 && hidden > 0
          return (
            <button
              key={url}
              type="button"
              onClick={() => setOpenAt(index)}
              aria-label={`Ver foto ${index + 1} de ${address}`}
              className="relative overflow-hidden rounded-2xl bg-muted group"
            >
              <img src={url} alt={`${address} — foto ${index + 1}`} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
              {isLast && (
                <span className="absolute inset-0 bg-black/55 text-white flex items-center justify-center text-lg font-semibold">
                  +{hidden}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {openAt !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Fotos de ${address}`}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setOpenAt(null)}
        >
          <button className="absolute top-4 right-4 text-white" aria-label="Cerrar" onClick={() => setOpenAt(null)}>
            <X className="h-7 w-7" />
          </button>
          <button
            className="absolute left-4 text-white text-4xl px-3"
            aria-label="Foto anterior"
            onClick={e => { e.stopPropagation(); setOpenAt((openAt - 1 + photos.length) % photos.length) }}
          >‹</button>
          <img
            src={photos[openAt]}
            alt={`${address} — foto ${openAt + 1}`}
            className="max-h-[90vh] max-w-[92vw] object-contain rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute right-4 text-white text-4xl px-3"
            aria-label="Foto siguiente"
            onClick={e => { e.stopPropagation(); setOpenAt((openAt + 1) % photos.length) }}
          >›</button>
          <span className="absolute bottom-5 text-white/80 text-sm tabular-n">{openAt + 1} / {photos.length}</span>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run components/properties/detail/PropertyHeroGallery.test.tsx`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add components/properties/detail/PropertyHeroGallery.tsx components/properties/detail/PropertyHeroGallery.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): galería de portada de solo lectura con visor y estado vacío"
```

---

### Task 3: Barra de identidad y datos clave

Dirección, precio y estado a un golpe de vista, más la fila de datos que hoy no se ve.

**Files:**
- Create: `components/properties/detail/PropertyIdentityBar.tsx`
- Create: `components/properties/detail/PropertyKeyStats.tsx`

**Interfaces:**
- Consumes: `buildKeyStats`, `formatMoney`, `operationLabel`, `propertyTypeLabel`, tipo `KeyStat` de `lib/properties/detail-view`.
- Produces:
  - `<PropertyIdentityBar operationType={string|null} propertyType={string} address={string} neighborhood={string} city={string} price={number} currency={string} statusLabel={string} statusColor={string} showPrice={boolean} />`
  - `<PropertyKeyStats stats={KeyStat[]} />`

- [ ] **Step 1: Escribir `PropertyIdentityBar`**

Crear `components/properties/detail/PropertyIdentityBar.tsx`:

```tsx
'use client'

import { MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatMoney, operationLabel, propertyTypeLabel } from '@/lib/properties/detail-view'

interface Props {
  operationType: string | null
  propertyType: string
  address: string
  neighborhood: string
  city: string
  price: number
  currency: string
  statusLabel: string
  statusColor: string
  /** El abogado no ve datos comerciales. */
  showPrice: boolean
}

export function PropertyIdentityBar({
  operationType, propertyType, address, neighborhood, city,
  price, currency, statusLabel, statusColor, showPrice,
}: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {/* Un solo nodo de texto: así el probe de render puede buscar la frase entera. */}
        <p className="eyebrow">{`${propertyTypeLabel(propertyType)} ${operationLabel(operationType)}`}</p>
        <h1 className="display text-3xl md:text-4xl mt-1 break-words">{address}</h1>
        <p className="text-muted-foreground flex items-center gap-1.5 text-sm mt-1.5">
          <MapPin className="h-4 w-4 shrink-0" />
          <span className="break-words">{[neighborhood, city].filter(Boolean).join(', ')}</span>
        </p>
      </div>
      <div className="sm:text-right shrink-0">
        {showPrice && (
          <>
            <p className="eyebrow">Precio de publicación</p>
            <p className="display text-3xl tabular-n mt-1">{formatMoney(price, currency)}</p>
          </>
        )}
        <Badge className={`text-white text-xs mt-2 ${statusColor}`}>{statusLabel}</Badge>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escribir `PropertyKeyStats`**

Crear `components/properties/detail/PropertyKeyStats.tsx`:

```tsx
'use client'

import type { KeyStat } from '@/lib/properties/detail-view'

/** Fila de datos clave. Si no hay ninguno cargado, no se dibuja nada. */
export function PropertyKeyStats({ stats }: { stats: KeyStat[] }) {
  if (stats.length === 0) return null
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {stats.map(s => (
        <div key={s.key} className="rounded-xl border bg-card px-3 py-2.5 text-center">
          <p className="display text-base tabular-n leading-tight">{s.value}</p>
          <p className="eyebrow mt-0.5">{s.label}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compilan**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en `components/properties/detail/`.

- [ ] **Step 4: Commit**

```bash
git add components/properties/detail/PropertyIdentityBar.tsx components/properties/detail/PropertyKeyStats.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): barra de identidad y fila de datos clave de la ficha"
```

---

### Task 4: Bloque de próximo paso

Un solo aviso, con su acción, en lugar de los cinco banners sueltos de hoy.

**Files:**
- Create: `components/properties/detail/PropertyNextStepBanner.tsx`
- Test: `components/properties/detail/PropertyNextStepBanner.test.tsx`

**Interfaces:**
- Consumes: tipos `NextStep`, `TabKey` de `lib/properties/detail-view`.
- Produces: `<PropertyNextStepBanner step={NextStep|null} submitting={boolean} onGoToTab={(t: TabKey) => void} onSubmitReview={() => void} details?={ReactNode} />`

- [ ] **Step 1: Escribir el test que falla**

Crear `components/properties/detail/PropertyNextStepBanner.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyNextStepBanner } from './PropertyNextStepBanner'
import type { NextStep } from '@/lib/properties/detail-view'

const stepTab: NextStep = {
  id: 'photos', tone: 'warn', title: 'Fotos pendientes',
  text: 'La revisión legal fue aprobada. Subí las fotos para completar la captación.',
  action: { kind: 'tab', tab: 'multimedia', label: 'Subir fotos' },
}

describe('PropertyNextStepBanner', () => {
  it('sin próximo paso no dibuja nada', () => {
    const { container } = render(
      <PropertyNextStepBanner step={null} submitting={false} onGoToTab={() => {}} onSubmitReview={() => {}} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('la acción de tipo pestaña avisa a qué pestaña ir', async () => {
    const onGoToTab = vi.fn()
    const user = userEvent.setup()
    render(<PropertyNextStepBanner step={stepTab} submitting={false} onGoToTab={onGoToTab} onSubmitReview={() => {}} />)

    expect(screen.getByText('Fotos pendientes')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Subir fotos' }))
    expect(onGoToTab).toHaveBeenCalledWith('multimedia')
  })

  it('la acción de enviar a revisión dispara su propio callback', async () => {
    const onSubmitReview = vi.fn()
    const user = userEvent.setup()
    const step: NextStep = {
      id: 'submit', tone: 'info', title: 'Lista para revisión legal', text: 'Ya hay documentación cargada.',
      action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
    }
    render(<PropertyNextStepBanner step={step} submitting={false} onGoToTab={() => {}} onSubmitReview={onSubmitReview} />)

    await user.click(screen.getByRole('button', { name: /enviar a revisión legal/i }))
    expect(onSubmitReview).toHaveBeenCalledTimes(1)
  })

  it('mientras envía, el botón queda deshabilitado', () => {
    const step: NextStep = {
      id: 'submit', tone: 'info', title: 'Lista', text: '.',
      action: { kind: 'submit-review', label: 'Enviar a Revisión Legal' },
    }
    render(<PropertyNextStepBanner step={step} submitting onGoToTab={() => {}} onSubmitReview={() => {}} />)
    expect(screen.getByRole('button', { name: /enviar a revisión legal/i })).toBeDisabled()
  })

  it('un paso sin acción no dibuja botón', () => {
    const step: NextStep = { id: 'legal-waiting', tone: 'info', title: 'En revisión legal', text: 'Enviada al abogado.', action: null }
    render(<PropertyNextStepBanner step={step} submitting={false} onGoToTab={() => {}} onSubmitReview={() => {}} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run components/properties/detail/PropertyNextStepBanner.test.tsx`
Expected: FAIL — no se resuelve `./PropertyNextStepBanner`.

- [ ] **Step 3: Escribir la implementación**

Crear `components/properties/detail/PropertyNextStepBanner.tsx`:

```tsx
'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Info, XCircle, Archive, Loader2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { NextStep, NextStepTone, TabKey } from '@/lib/properties/detail-view'

const TONES: Record<NextStepTone, { box: string; icon: typeof Info; iconColor: string }> = {
  info: { box: 'border-[color:var(--brand)]/30 bg-[color:var(--brand-soft)]/25', icon: Info, iconColor: 'text-[color:var(--brand)]' },
  warn: { box: 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20', icon: AlertTriangle, iconColor: 'text-amber-600' },
  danger: { box: 'border-red-300 bg-red-50/60 dark:bg-red-950/20', icon: XCircle, iconColor: 'text-[color:var(--destructive)]' },
  neutral: { box: 'border-slate-300 bg-muted/40', icon: Archive, iconColor: 'text-muted-foreground' },
}

interface Props {
  step: NextStep | null
  submitting: boolean
  onGoToTab: (tab: TabKey) => void
  onSubmitReview: () => void
  /** Detalle opcional plegable (ej. los campos importados de GHL). */
  details?: ReactNode
}

export function PropertyNextStepBanner({ step, submitting, onGoToTab, onSubmitReview, details }: Props) {
  if (!step) return null
  const tone = TONES[step.tone]
  const Icon = tone.icon

  return (
    <div className={`rounded-2xl border px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${tone.box}`}>
      <div className="flex items-start gap-3 min-w-0">
        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${tone.iconColor}`} />
        <div className="min-w-0">
          <p className="font-medium">{step.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{step.text}</p>
          {details}
        </div>
      </div>

      {step.action && (
        <div className="shrink-0">
          {step.action.kind === 'submit-review' ? (
            <Button onClick={onSubmitReview} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {step.action.label}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => onGoToTab((step.action as { tab: TabKey }).tab)}>
              {step.action.label}
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run components/properties/detail/PropertyNextStepBanner.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add components/properties/detail/PropertyNextStepBanner.tsx components/properties/detail/PropertyNextStepBanner.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): bloque unificado de próximo paso en la ficha"
```

---

### Task 5: Barra de pestañas

La pieza central del rediseño: **cambia el contenido, no hace scroll**.

**Files:**
- Create: `components/properties/detail/PropertyTabsNav.tsx`
- Test: `components/properties/detail/PropertyTabsNav.test.tsx`

**Interfaces:**
- Consumes: `TAB_LABELS`, tipo `TabKey` de `lib/properties/detail-view`.
- Produces: `<PropertyTabsNav tabs={TabKey[]} active={TabKey} onChange={(t: TabKey) => void} />`

- [ ] **Step 1: Escribir el test que falla**

Crear `components/properties/detail/PropertyTabsNav.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyTabsNav } from './PropertyTabsNav'

describe('PropertyTabsNav', () => {
  it('dibuja solo las pestañas recibidas, con la activa marcada', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'documentacion', 'historial']} active="documentacion" onChange={() => {}} />)

    expect(screen.getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('tab', { name: 'Documentación' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Propiedad' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByRole('tab', { name: 'Multimedia' })).not.toBeInTheDocument()
  })

  it('avisa qué pestaña se eligió', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={onChange} />)

    await user.click(screen.getByRole('tab', { name: 'Multimedia' }))
    expect(onChange).toHaveBeenCalledWith('multimedia')
  })

  it('es una tablist accesible', () => {
    render(<PropertyTabsNav tabs={['propiedad', 'multimedia']} active="propiedad" onChange={() => {}} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run components/properties/detail/PropertyTabsNav.test.tsx`
Expected: FAIL — no se resuelve `./PropertyTabsNav`.

- [ ] **Step 3: Escribir la implementación**

Crear `components/properties/detail/PropertyTabsNav.tsx`:

```tsx
'use client'

/**
 * Barra de secciones de la ficha. CAMBIA el contenido — no hace scroll a
 * anclas: al elegir una pestaña, las demás no se renderizan.
 */
import { TAB_LABELS, type TabKey } from '@/lib/properties/detail-view'

interface Props {
  tabs: TabKey[]
  active: TabKey
  onChange: (tab: TabKey) => void
}

export function PropertyTabsNav({ tabs, active, onChange }: Props) {
  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 py-2 bg-background/85 backdrop-blur-md border-y">
      <div role="tablist" aria-label="Secciones de la propiedad" className="flex gap-1 overflow-x-auto">
        {tabs.map(tab => {
          const isActive = tab === active
          return (
            <button
              key={tab}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => onChange(tab)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition ${
                isActive
                  ? 'bg-[color:var(--brand)] text-white font-semibold'
                  : 'text-muted-foreground hover:bg-muted font-medium'
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run components/properties/detail/PropertyTabsNav.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add components/properties/detail/PropertyTabsNav.tsx components/properties/detail/PropertyTabsNav.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): barra de pestañas de la ficha (cambia contenido, no scrollea)"
```

---

### Task 6: Mapa de ubicación (solo lectura)

Mapa contenido —ancho completo y bajo—, nunca media pantalla. Sin coordenadas, no se dibuja.

**Files:**
- Create: `components/properties/detail/PropertyLocationMap.tsx`

**Interfaces:**
- Consumes: `leaflet` (ya instalado, `@types/leaflet` presente).
- Produces: `<PropertyLocationMap lat={number} lng={number} label={string} />` — el llamador es responsable de NO renderizarlo si falta alguna coordenada.

- [ ] **Step 1: Escribir la implementación**

Crear `components/properties/detail/PropertyLocationMap.tsx`. Sigue el patrón ya probado en producción de `components/properties/wizards/ml/GeoPinMap.tsx` (import dinámico de leaflet dentro del efecto, iconos servidos desde unpkg), pero sin edición: el pin no se arrastra y no hay handler de click.

```tsx
'use client'

import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap } from 'leaflet'

interface Props {
  lat: number
  lng: number
  /** Texto del globo del pin (dirección de la propiedad). */
  label: string
}

/**
 * Mapa de SOLO LECTURA de la ficha. Leaflet se importa dentro del efecto
 * (nunca en el módulo) porque toca `window` y rompería el render de servidor.
 */
export function PropertyLocationMap({ lat, lng, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !ref.current || mapRef.current) return

      const map = L.map(ref.current, { scrollWheelZoom: false }).setView([lat, lng], 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)

      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41],
      })
      L.marker([lat, lng], { icon }).addTo(map).bindTooltip(label)

      mapRef.current = map
    })()

    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Si las coordenadas cambian (edición en otra pestaña), recentra.
  useEffect(() => {
    mapRef.current?.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={ref} className="h-[260px] w-full rounded-2xl border z-0" />
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/detail/PropertyLocationMap.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): mapa de ubicación de solo lectura en la ficha"
```

---

### Task 7: Pestaña Propiedad

Descripción, características y ubicación — incluidos los campos que hoy están en la base pero no se muestran.

**Files:**
- Create: `components/properties/detail/tabs/OverviewTab.tsx`

**Interfaces:**
- Consumes: `PropertyLocationMap` (Task 6); `formatMoney`, `propertyTypeLabel`, `operationLabel` (Task 1).
- Produces: `<OverviewTab property={OverviewProperty} isAbogado={boolean} />` con
  ```ts
  interface OverviewProperty {
    address: string; neighborhood: string; city: string
    property_type: string; operation_type?: string | null
    description?: string | null
    amenities?: unknown
    expensas?: number | null
    floor?: number | null
    age?: number | null
    asking_price: number; currency: string; commission_percentage: number
    contract_start_date?: string | null; contract_end_date?: string | null
    origin?: string | null
    latitude?: number | null; longitude?: number | null
  }
  ```

- [ ] **Step 1: Escribir la implementación**

Crear `components/properties/detail/tabs/OverviewTab.tsx`:

```tsx
'use client'

import dynamic from 'next/dynamic'
import { Card, CardContent } from '@/components/ui/card'
import { formatMoney, operationLabel, propertyTypeLabel } from '@/lib/properties/detail-view'

// Leaflet toca `window`: fuera del render de servidor.
const PropertyLocationMap = dynamic(
  () => import('../PropertyLocationMap').then(m => m.PropertyLocationMap),
  { ssr: false, loading: () => <div className="h-[260px] w-full rounded-2xl border bg-muted/40" /> },
)

export interface OverviewProperty {
  address: string
  neighborhood: string
  city: string
  property_type: string
  operation_type?: string | null
  description?: string | null
  amenities?: unknown
  expensas?: number | null
  floor?: number | null
  age?: number | null
  asking_price: number
  currency: string
  commission_percentage: number
  contract_start_date?: string | null
  contract_end_date?: string | null
  origin?: string | null
  latitude?: number | null
  longitude?: number | null
}

/** `amenities` es jsonb: puede llegar como array, como objeto de banderas o null. */
function amenityList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((a): a is string => typeof a === 'string' && a.trim() !== '')
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v === true)
      .map(([k]) => k.replace(/_/g, ' '))
  }
  return []
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2.5">
      <p className="eyebrow">{label}</p>
      <p className="font-medium text-sm mt-0.5">{value}</p>
    </div>
  )
}

export function OverviewTab({ property, isAbogado }: { property: OverviewProperty; isAbogado: boolean }) {
  const amenities = amenityList(property.amenities)
  const hasCoords = property.latitude != null && property.longitude != null

  const specs: Array<{ label: string; value: string }> = [
    { label: 'Tipo', value: propertyTypeLabel(property.property_type) },
    { label: 'Operación', value: operationLabel(property.operation_type).replace(/^en /, '') },
  ]
  if (property.floor != null) specs.push({ label: 'Piso', value: property.floor === 0 ? 'PB' : `${property.floor}º` })
  if (property.age) specs.push({ label: 'Antigüedad', value: `${property.age} año${property.age === 1 ? '' : 's'}` })
  if (property.expensas) specs.push({ label: 'Expensas', value: formatMoney(property.expensas, 'ARS') })

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-6">
        <section>
          <p className="eyebrow">La propiedad</p>
          <h2 className="display text-xl mt-1 mb-3">Descripción</h2>
          {property.description ? (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-muted-foreground">
              {property.description}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Esta propiedad todavía no tiene descripción cargada.
            </p>
          )}
        </section>

        <section>
          <p className="eyebrow">Ficha</p>
          <h2 className="display text-xl mt-1 mb-3">Características</h2>
          <div className="grid grid-cols-2 gap-2">
            {specs.map(s => <Spec key={s.label} label={s.label} value={s.value} />)}
          </div>

          {amenities.length > 0 && (
            <div className="mt-4">
              <p className="eyebrow mb-2">Amenities</p>
              <div className="flex flex-wrap gap-1.5">
                {amenities.map(a => (
                  <span key={a} className="rounded-full border bg-card px-3 py-1 text-xs capitalize">{a}</span>
                ))}
              </div>
            </div>
          )}

          {!isAbogado && (
            <Card className="mt-4">
              <CardContent className="py-4">
                <p className="eyebrow mb-3">Datos comerciales</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                  <span className="text-muted-foreground">Precio</span>
                  <span className="tabular-n font-medium">{formatMoney(property.asking_price, property.currency)}</span>
                  <span className="text-muted-foreground">Comisión</span>
                  <span className="tabular-n">{property.commission_percentage}%</span>
                  {property.contract_start_date && (<><span className="text-muted-foreground">Inicio contrato</span><span className="tabular-n">{property.contract_start_date}</span></>)}
                  {property.contract_end_date && (<><span className="text-muted-foreground">Fin contrato</span><span className="tabular-n">{property.contract_end_date}</span></>)}
                  {property.origin && (<><span className="text-muted-foreground">Origen</span><span className="capitalize">{property.origin}</span></>)}
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </div>

      <section>
        <p className="eyebrow">Dónde está</p>
        <h2 className="display text-xl mt-1 mb-3">Ubicación</h2>
        <p className="text-sm text-muted-foreground mb-3">
          {[property.address, property.neighborhood, property.city].filter(Boolean).join(' · ')}
        </p>
        {hasCoords ? (
          <PropertyLocationMap lat={property.latitude!} lng={property.longitude!} label={property.address} />
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Esta propiedad todavía no tiene ubicación precisa cargada.
          </p>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/detail/tabs/OverviewTab.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): pestaña Propiedad con descripción, características y ubicación"
```

---

### Task 8: Pestañas Multimedia e Historial

Dos envoltorios finos sobre componentes que ya funcionan. No se toca su código interno.

**Files:**
- Create: `components/properties/detail/tabs/MediaTab.tsx`
- Create: `components/properties/detail/tabs/HistoryTab.tsx`

**Interfaces:**
- Consumes: `PropertyMediaCard` de `@/components/properties/PropertyMediaCard`; `FlowHistoryCard` y su tipo `FlowHistoryData` de `@/app/(dashboard)/_components/FlowHistoryCard`; `LegalReviewHistory` de `@/components/properties/LegalReviewHistory`.
- Produces:
  - `<MediaTab propertyId={string} photos={string[]} plans={string[]} videoFileUrl={string|null} tourUrl={string|null} videoRecorridoUrl={string|null} onChanged={() => void} />`
  - `<HistoryTab propertyId={string} flowHistory={FlowHistoryData|null} feedback={VisitFeedback[]} />` con
    ```ts
    interface VisitFeedback {
      id: string
      response_source: 'advisor' | 'client'
      liked: boolean | null
      most_liked: string | null
      least_liked: string | null
      in_price: boolean | null
      hypothetical_offer: number | null
      responded_at: string
      visit: { id: string; scheduled_at: string; client_name: string } | null
    }
    ```

- [ ] **Step 1: Escribir `MediaTab`**

Crear `components/properties/detail/tabs/MediaTab.tsx`:

```tsx
'use client'

import { PropertyMediaCard } from '@/components/properties/PropertyMediaCard'

interface Props {
  propertyId: string
  photos: string[]
  plans: string[]
  videoFileUrl: string | null
  tourUrl: string | null
  videoRecorridoUrl: string | null
  onChanged: () => void
}

/**
 * Envoltorio de la pestaña Multimedia. `PropertyMediaCard` queda intacto:
 * misma subida por URL firmada, mismo drag & drop de portada, mismos límites.
 */
export function MediaTab(props: Props) {
  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Material</p>
        <h2 className="display text-xl mt-1">Multimedia</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Las 3 primeras fotos son la portada del aviso. Arrastrá para reordenarlas.
        </p>
      </div>
      <PropertyMediaCard {...props} />
    </div>
  )
}
```

- [ ] **Step 2: Escribir `HistoryTab`**

Crear `components/properties/detail/tabs/HistoryTab.tsx`:

```tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FlowHistoryCard, type FlowHistoryData } from '@/app/(dashboard)/_components/FlowHistoryCard'
import { LegalReviewHistory } from '@/components/properties/LegalReviewHistory'

export interface VisitFeedback {
  id: string
  response_source: 'advisor' | 'client'
  liked: boolean | null
  most_liked: string | null
  least_liked: string | null
  in_price: boolean | null
  hypothetical_offer: number | null
  responded_at: string
  visit: { id: string; scheduled_at: string; client_name: string } | null
}

interface Props {
  propertyId: string
  flowHistory: FlowHistoryData | null
  feedback: VisitFeedback[]
}

export function HistoryTab({ propertyId, flowHistory, feedback }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Seguimiento</p>
        <h2 className="display text-xl mt-1">Historial</h2>
      </div>

      <FlowHistoryCard data={flowHistory} />

      {feedback.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="display text-base">Feedback de visitas ({feedback.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {feedback.map(f => (
              <div key={f.id} className="border rounded-xl p-3 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge>{f.response_source === 'client' ? 'Cliente' : 'Asesor'}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {f.visit?.client_name} · visita {f.visit ? new Date(f.visit.scheduled_at).toLocaleDateString('es-AR') : ''}
                  </span>
                </div>
                <p>¿Le gustó? <strong>{f.liked === null ? '-' : f.liked ? 'Sí' : 'No'}</strong></p>
                {f.most_liked && <p>Más le gustó: {f.most_liked}</p>}
                {f.least_liked && <p>Menos le gustó: {f.least_liked}</p>}
                <p>¿En precio? <strong>{f.in_price === null ? '-' : f.in_price ? 'Sí' : 'No'}</strong></p>
                <p>Oferta hipotética: USD {f.hypothetical_offer ?? '-'}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <LegalReviewHistory propertyId={propertyId} />
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compilan**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/properties/detail/tabs/MediaTab.tsx components/properties/detail/tabs/HistoryTab.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): pestañas Multimedia e Historial de la ficha"
```

---

### Task 9: Documentación compacta

El arreglo grande: la sección que hoy ocupa pantallas enteras pasa a una línea por documento. **Misma mecánica, distinto envoltorio.**

**Files:**
- Modify: `components/properties/LegalDocsChecklist.tsx` (reemplazar el bloque `return (...)` y la función `renderItem`/`sectionCard`; **NO** tocar `handleUpload`, `handleReviewItem`, `handleFlagChange`, `openRejectDialog`, `confirmReject` ni el `<Dialog>` de rechazo)
- Create: `components/properties/detail/tabs/DocsTab.tsx`
- Test: `components/properties/detail/tabs/DocsTab.test.tsx`

**Interfaces:**
- Consumes: `LegalDocsChecklist` (props sin cambios: `propertyId`, `propertyType`, `docs`, `flags`, `isAbogado`, `onUpdated`); `summarizeLegalDocs`, `getApplicableDocs` de `@/types/legal-docs.types`.
- Produces: `<DocsTab propertyId={string} propertyType={string} docs={LegalDocsState} flags={LegalFlags} isAbogado={boolean} status={string} legalStatus={string} legalNotes={string|null} onUpdated={() => void} onReviewed={() => void} />`

**Contexto de la compactación (leer antes de editar):** hoy `LegalDocsChecklist` anida `Collapsible > Card > Card(sectionCard) > filas`, y cada `sectionCard` trae un `CardHeader` completo. Cada fila usa `p-3` con un `StatusIcon` de 36 px. La compactación consiste en: (a) reemplazar `sectionCard` por un separador de una línea, (b) achicar la fila a `py-2` con punto de estado de 10 px, (c) convertir los 4 checkboxes de situación jurídica en una fila de píldoras. La lista de documentos aplicables la sigue calculando `getApplicableDocs(flags, propertyType)` — no cambia.

- [ ] **Step 1: Escribir el test que falla**

Crear `components/properties/detail/tabs/DocsTab.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocsTab } from './DocsTab'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'

const flags: LegalFlags = { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }
const docs: LegalDocsState = {}

const base = {
  propertyId: 'p1', propertyType: 'departamento', docs, flags,
  legalNotes: null as string | null,
  onUpdated: () => {}, onReviewed: () => {},
}

describe('DocsTab', () => {
  it('al abogado con revisión pendiente le muestra aprobar y rechazar', () => {
    render(<DocsTab {...base} isAbogado status="pending_review" legalStatus="pending" />)
    expect(screen.getByRole('button', { name: /aprobar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument()
  })

  it('al asesor nunca le muestra los botones de revisión', () => {
    render(<DocsTab {...base} isAbogado={false} status="pending_review" legalStatus="pending" />)
    expect(screen.queryByRole('button', { name: /^aprobar$/i })).not.toBeInTheDocument()
  })

  it('muestra el resultado de la revisión con las observaciones del abogado', () => {
    render(<DocsTab {...base} isAbogado={false} status="approved" legalStatus="rejected" legalNotes="Escritura vencida" />)
    expect(screen.getByText(/rechazada en revisión legal/i)).toBeInTheDocument()
    expect(screen.getByText('Escritura vencida')).toBeInTheDocument()
  })

  it('aprobar llama al endpoint de revisión y avisa al padre', async () => {
    const onReviewed = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<DocsTab {...base} isAbogado status="pending_review" legalStatus="pending" onReviewed={onReviewed} />)
    await user.click(screen.getByRole('button', { name: /aprobar/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/properties/p1/review', expect.objectContaining({ method: 'POST' }))
    expect(onReviewed).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run components/properties/detail/tabs/DocsTab.test.tsx`
Expected: FAIL — no se resuelve `./DocsTab`.

- [ ] **Step 3: Compactar `LegalDocsChecklist`**

En `components/properties/LegalDocsChecklist.tsx`:

**3a.** Reemplazar el componente `StatusIcon` (líneas ~31-44) por un punto de estado chico:

```tsx
const STATUS_DOT: Record<DocItemState['status'], { className: string; label: string }> = {
  approved: { className: 'bg-emerald-500', label: 'Aprobado' },
  rejected: { className: 'bg-[color:var(--destructive)]', label: 'Rechazado' },
  pending: { className: 'bg-amber-500', label: 'En revisión' },
  missing: { className: 'bg-muted-foreground/30', label: 'Falta' },
}

function StatusDot({ status }: { status: DocItemState['status'] }) {
  const { className, label } = STATUS_DOT[status]
  return <span aria-label={label} title={label} className={`h-2.5 w-2.5 rounded-full shrink-0 ${className}`} />
}
```

**3b.** Reemplazar `renderItem` por la versión compacta (una línea por documento). Los handlers y las condiciones (`hasFile`, `canReview`) quedan **idénticos**:

```tsx
  const renderItem = (def: LegalDocDefinition) => {
    const state: DocItemState = docs[def.key] || { status: 'missing' }
    const hasFile = !!state.file_url
    const canReview = isAbogado && hasFile && (state.status === 'pending' || state.status === 'rejected')

    return (
      <div key={def.key} className="flex items-center gap-3 py-2 px-3 rounded-lg border bg-card">
        <StatusDot status={state.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium">{def.label}</span>
            {def.category === 'mandatory' && <span className="eyebrow">Obligatorio</span>}
            {state.status === 'rejected' && <Badge variant="destructive" className="text-[10px] h-4">Rechazado</Badge>}
          </div>
          {hasFile && (
            <a href={state.file_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 mt-0.5">
              <FileText className="h-3 w-3" />{state.file_name}
            </a>
          )}
          {state.reviewer_notes && (
            <p className={`text-xs mt-0.5 ${state.status === 'rejected' ? 'text-red-700' : 'text-muted-foreground'}`}>
              <span className="font-semibold">Abogado: </span>{state.reviewer_notes}
            </p>
          )}
        </div>

        {!isAbogado && (
          <>
            <input
              ref={el => { fileInputs.current[def.key] = el }}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.tif,.tiff"
              onChange={e => e.target.files?.[0] && handleUpload(def.key, e.target.files[0])}
            />
            <Button
              size="sm"
              variant={hasFile ? 'ghost' : 'outline'}
              onClick={() => fileInputs.current[def.key]?.click()}
              disabled={uploadingKey === def.key}
              className="shrink-0 gap-1 tabular-nums"
            >
              {uploadingKey === def.key
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{uploadProgress > 0 ? `${uploadProgress}%` : '…'}</>
                : <><Upload className="h-3.5 w-3.5" />{hasFile ? 'Reemplazar' : 'Subir'}</>}
            </Button>
          </>
        )}

        {canReview && (
          <div className="shrink-0 flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={() => handleReviewItem(def.key, true)} disabled={reviewingKey === def.key} aria-label={`Aprobar ${def.label}`}>
              {reviewingKey === def.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="outline" className="border-red-200 text-[color:var(--destructive)]/80 hover:bg-red-50" onClick={() => openRejectDialog(def.key, def.label)} disabled={reviewingKey === def.key} aria-label={`Rechazar ${def.label}`}>
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    )
  }
```

**3c.** Agregar el anillo de progreso del encabezado (spec §5.5), junto a `StatusDot`:

```tsx
/** Anillo de "N de M aprobados" — el dato ya lo calcula summarizeLegalDocs. */
function ProgressRing({ approved, total }: { approved: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((approved / total) * 100)
  return (
    <span
      aria-hidden
      className="h-10 w-10 rounded-full shrink-0 flex items-center justify-center"
      style={{ background: `conic-gradient(var(--brand) 0 ${pct}%, var(--muted) ${pct}% 100%)` }}
    >
      <span className="h-8 w-8 rounded-full bg-card flex items-center justify-center text-[11px] font-semibold tabular-nums">
        {approved}/{total}
      </span>
    </span>
  )
}
```

**3d.** Borrar la función `sectionCard` y reemplazar todo el `return (...)` por lo de abajo. **El `<Dialog>` de rechazo (desde `<Dialog open={rejectDialog.open}` hasta su `</Dialog>`) se deja EXACTAMENTE como está** — solo cambia lo que va antes, dentro del mismo fragmento `<>…</>`:

```tsx
  const group = (title: string, items: LegalDocDefinition[]) =>
    items.length === 0 ? null : (
      <div className="space-y-1.5">
        <p className="eyebrow pt-1">{title}</p>
        {items.map(renderItem)}
      </div>
    )

  return (
    <>
      <Collapsible defaultOpen={summary.tone !== 'ok'} className="rounded-2xl border bg-card">
        <CollapsibleTrigger asChild>
          <button className="group w-full flex items-center gap-3 px-5 py-4 text-left">
            <span className="h-9 w-9 rounded-full bg-[color:var(--brand-soft)]/40 flex items-center justify-center shrink-0">
              <Scale className="h-5 w-5 text-[color:var(--brand)]" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="eyebrow block">Documentación</span>
              <span className="display text-base">Checklist legal</span>
            </span>
            <ProgressRing approved={summary.approved} total={summary.total} />
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${summaryPill}`}>{summary.label}</span>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-5 pb-5 space-y-4">
            {!isAbogado && (
              <div>
                <p className="eyebrow mb-2">Situación jurídica</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    ['has_succession', 'Sucesión'],
                    ['has_divorce', 'Divorcio'],
                    ['has_powers', 'Poderes'],
                    ['is_credit_purchase', 'Compra a crédito'],
                  ] as Array<[keyof LegalFlags, string]>).map(([key, label]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs cursor-pointer transition ${
                        flags[key] ? 'border-[color:var(--brand)]/40 bg-[color:var(--brand-soft)]/30 font-medium' : 'hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={flags[key]}
                        onChange={e => handleFlagChange(key, e.target.checked)}
                        disabled={savingFlags}
                        className="h-3.5 w-3.5 rounded"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {group('Obligatorios', mandatory)}
            {group('Temporales (con vencimiento)', temporal)}
            {group('Opcionales', optional)}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* A partir de acá NO se toca nada: el <Dialog> de rechazo queda igual. */}
    </>
  )
```

**3e.** Limpiar imports que quedaron sin uso (`Card`, `CardContent`, `CardHeader`, `CardTitle`, `AlertTriangle`, `Clock`, `FileCheck2`, `CalendarClock`, `FilePlus2`) y agregar `LegalFlags` al import de tipos si no estuviera.

- [ ] **Step 4: Escribir `DocsTab`**

Crear `components/properties/detail/tabs/DocsTab.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, Scale } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LegalDocsChecklist } from '@/components/properties/LegalDocsChecklist'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'

interface Props {
  propertyId: string
  propertyType: string
  docs: LegalDocsState
  flags: LegalFlags
  isAbogado: boolean
  status: string
  legalStatus: string
  legalNotes: string | null
  onUpdated: () => void
  onReviewed: () => void
}

export function DocsTab({
  propertyId, propertyType, docs, flags, isAbogado,
  status, legalStatus, legalNotes, onUpdated, onReviewed,
}: Props) {
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const legalApproved = legalStatus === 'approved'
  const legalRejected = legalStatus === 'rejected'
  const canReview = isAbogado && status === 'pending_review' && !legalApproved && !legalRejected

  async function review(approved: boolean) {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${propertyId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes }),
      })
      if (!res.ok) throw new Error('Error')
      setNotes('')
      onReviewed()
    } catch {
      alert('Error al procesar revisión')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow">Legales</p>
        <h2 className="display text-xl mt-1">Documentación</h2>
      </div>

      {(legalApproved || legalRejected) && (
        <Card className={legalApproved ? 'border-emerald-300' : 'border-red-300'}>
          <CardContent className="py-4">
            <div className="flex items-center gap-2">
              {legalApproved
                ? <CheckCircle className="h-5 w-5 text-emerald-600" />
                : <XCircle className="h-5 w-5 text-[color:var(--destructive)]" />}
              <span className="font-medium">
                {legalApproved
                  ? (isAbogado ? 'Aprobaste esta propiedad' : 'Revisión legal aprobada')
                  : (isAbogado ? 'Rechazaste esta propiedad' : 'Rechazada en revisión legal')}
              </span>
            </div>
            {legalNotes && <p className="mt-2 text-sm text-muted-foreground">{legalNotes}</p>}
          </CardContent>
        </Card>
      )}

      {canReview && (
        <Card className="border-2 border-[color:var(--brand)]/40">
          <CardContent className="py-5 space-y-4">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-[color:var(--brand)]" />
              <span className="display text-base">Revisión legal pendiente</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Revisá la documentación de abajo y aprobá o rechazá según corresponda.
            </p>
            <textarea
              className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Observaciones (opcional)…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <div className="flex gap-3">
              <Button onClick={() => review(true)} disabled={submitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700" size="lg">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                Aprobar
              </Button>
              <Button onClick={() => review(false)} disabled={submitting} variant="destructive" className="flex-1" size="lg">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
                Rechazar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <LegalDocsChecklist
        propertyId={propertyId}
        propertyType={propertyType}
        docs={docs}
        flags={flags}
        isAbogado={isAbogado}
        onUpdated={onUpdated}
      />
    </div>
  )
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run components/properties/detail/tabs/DocsTab.test.tsx types/legal-docs.types.test.ts`
Expected: PASS — los 4 de DocsTab y los de `legal-docs.types` siguen verdes (no se tocó el catálogo).

- [ ] **Step 6: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores (revisar que no quedaron imports sin uso en `LegalDocsChecklist.tsx`).

- [ ] **Step 7: Commit**

```bash
git add components/properties/LegalDocsChecklist.tsx components/properties/detail/tabs/DocsTab.tsx components/properties/detail/tabs/DocsTab.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): documentación legal compacta (una línea por documento) + pestaña Documentación"
```

---

### Task 10: Pestaña Difusión con los cuatro canales

MercadoLibre, Argenprop, Meta Ads y **Landing** con el mismo formato, más los paneles que ya existen.

**Files:**
- Modify: `components/properties/PostCaptureActions.tsx` (agregar el canal Landing y unificar las tarjetas en un subcomponente `ChannelCard`)
- Create: `components/properties/detail/tabs/MarketingTab.tsx`

**Interfaces:**
- Consumes: `PostCaptureActions`, `LandingSection`, `MarketingTabs` (props sin cambios).
- Produces: `<MarketingTab propertyId={string} canManage={boolean} videoRecorridoUrl={string|null} tour3dUrl={string|null} deliverMediaSaved={string|null} />`

- [ ] **Step 1: Agregar el canal Landing a `PostCaptureActions`**

En `components/properties/PostCaptureActions.tsx`:

**1a.** Agregar el estado de landing junto a los otros tres:

```tsx
  const [landingState, setLandingState] = useState<{
    status: 'sin_landing' | 'borrador' | 'publicada' | 'loading'
    slug?: string
  }>({ status: 'loading' })
```

**1b.** Dentro de `load()`, después del bloque de meta-campaign, agregar:

```tsx
      try {
        const r = await fetch(`/api/properties/${propertyId}/landing`)
        if (r.ok) {
          const { landing } = await r.json() as { landing?: { status?: string; public_slug?: string | null } | null }
          if (!landing) setLandingState({ status: 'sin_landing' })
          else if (landing.status === 'published') setLandingState({ status: 'publicada', slug: landing.public_slug ?? undefined })
          else setLandingState({ status: 'borrador' })
        } else {
          setLandingState({ status: 'sin_landing' })
        }
      } catch {
        setLandingState({ status: 'sin_landing' })
      }
```

**1c.** Agregar la cuarta tarjeta. **Las tres existentes (MercadoLibre, Argenprop, Meta Ads) no se tocan** — ya comparten el mismo formato `rounded-lg border bg-card p-4 space-y-3`; refactorizarlas a un subcomponente sería churn sin beneficio visual y con riesgo de romper estados que hoy andan.

Importar `Globe` de `lucide-react`. Cambiar la clase de la grilla de `md:grid-cols-3` a `md:grid-cols-2 xl:grid-cols-4`, y agregar después de la tarjeta de Meta Ads (dentro de la misma grilla):

```tsx
          {/* Landing */}
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Landing</span>
              </div>
              {landingState.status === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : landingState.status === 'publicada' ? (
                <Badge className="bg-emerald-600 text-white text-[10px] h-5">
                  <CheckCircle2 className="h-3 w-3 mr-0.5" />Online
                </Badge>
              ) : landingState.status === 'borrador' ? (
                <Badge className="bg-amber-500 text-white text-[10px] h-5">Borrador</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] h-5">Sin landing</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground min-h-[2.5em]">
              {landingState.status === 'publicada' && 'La landing de conversión está publicada.'}
              {landingState.status === 'borrador' && 'Hay una landing empezada sin publicar.'}
              {landingState.status === 'sin_landing' && 'Página propia de la propiedad; es requisito para la campaña Meta.'}
              {landingState.status === 'loading' && 'Cargando estado…'}
            </p>
            <div className="flex gap-2">
              <Button
                asChild
                size="sm"
                className="flex-1"
                variant={landingState.status === 'sin_landing' ? 'default' : 'outline'}
              >
                <Link href={`/properties/${propertyId}/landing/edit`}>
                  {landingState.status === 'sin_landing' ? 'Crear landing' : 'Ver / Editar'}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
              {landingState.slug && (
                <Button asChild size="sm" variant="ghost">
                  <a href={`/p/${landingState.slug}`} target="_blank" rel="noopener noreferrer">Abrir</a>
                </Button>
              )}
            </div>
          </div>
```

**1d.** Actualizar el texto del encabezado de la tarjeta contenedora para que mencione los cuatro canales:

```tsx
              La propiedad está lista para difundirse: portales, campaña en Meta
              y su propia landing. Cada canal tiene su asistente que te guía paso a paso.
```

- [ ] **Step 2: Escribir `MarketingTab`**

Crear `components/properties/detail/tabs/MarketingTab.tsx`:

```tsx
'use client'

import { PostCaptureActions } from '@/components/properties/PostCaptureActions'
import { LandingSection } from '@/components/properties/LandingSection'
import { MarketingTabs } from '@/components/properties/MarketingTabs'

interface Props {
  propertyId: string
  canManage: boolean
  videoRecorridoUrl: string | null
  tour3dUrl: string | null
  deliverMediaSaved: string | null
}

/**
 * Pestaña Difusión: canales arriba, el asistente de landing en el medio y los
 * resultados abajo. La tarjeta "Generar descripción para portales" se eliminó
 * a pedido del usuario (2026-07-31): cada asistente de portal ya genera la
 * descripción por su cuenta.
 */
export function MarketingTab({ propertyId, canManage, videoRecorridoUrl, tour3dUrl, deliverMediaSaved }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Marketing</p>
        <h2 className="display text-xl mt-1">Difusión y resultados</h2>
      </div>

      <PostCaptureActions propertyId={propertyId} />

      <LandingSection
        propertyId={propertyId}
        videoRecorridoUrl={videoRecorridoUrl}
        tour3dUrl={tour3dUrl}
        deliverMediaSaved={deliverMediaSaved}
      />

      <MarketingTabs propertyId={propertyId} canManage={canManage} />
    </div>
  )
}
```

- [ ] **Step 3: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/properties/PostCaptureActions.tsx components/properties/detail/tabs/MarketingTab.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): pestaña Difusión con los 4 canales parejos (incluye Landing)"
```

---

### Task 11: Reescribir la página como orquestador

Todo junto: zona fija, pestañas, pie discreto, y fuera la tarjeta de generar descripción.

**Files:**
- Modify: `app/(dashboard)/properties/[id]/page.tsx` (reescritura completa del componente; se conservan tal cual los `useEffect` de carga y los handlers `handleUpdateStatus`, `handleDiscard`, `handleRestore`, `handleDelete`)
- Create: `components/properties/detail/PropertyArchiveFooter.tsx`

**Interfaces:**
- Consumes: todo lo de las tareas 1-10.
- Produces: la ruta `/properties/[id]` rediseñada, con `?tab=` en la URL.

**Nota de implementación (importante):** NO usar `useSearchParams()` para leer la pestaña. En Next 16, un componente cliente que la usa exige un `<Suspense>` alrededor o rompe el build de la ruta. Se lee y escribe con `window.location` + `window.history.replaceState`, que no tiene esa restricción.

- [ ] **Step 1: Escribir el pie de acciones de archivo**

Crear `components/properties/detail/PropertyArchiveFooter.tsx`:

```tsx
'use client'

import { Loader2, Archive, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  createdAt: string
  isDiscarded: boolean
  canHardDelete: boolean
  submitting: boolean
  onDiscard: () => void
  onRestore: () => void
  onDelete: () => void
}

/**
 * Franja discreta al pie. Reemplaza la tarjeta punteada grande de la versión
 * anterior — mismas acciones y mismas confirmaciones.
 */
export function PropertyArchiveFooter({
  createdAt, isDiscarded, canHardDelete, submitting, onDiscard, onRestore, onDelete,
}: Props) {
  return (
    <div className="border-t pt-4 mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>Creada el {new Date(createdAt).toLocaleDateString('es-AR')}</span>
      <div className="flex flex-wrap items-center gap-2">
        {isDiscarded ? (
          <Button variant="ghost" size="sm" onClick={onRestore} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
            Restaurar a borrador
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDiscard} disabled={submitting}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
            Descartar
          </Button>
        )}
        {canHardDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete} disabled={submitting} className="text-[color:var(--destructive)] hover:text-[color:var(--destructive)]">
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Eliminar definitivamente
          </Button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Reescribir la página**

Reemplazar el contenido completo de `app/(dashboard)/properties/[id]/page.tsx` por:

```tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Loader2, ArrowLeft } from 'lucide-react'
import { AddTaskDialog } from '@/components/tasks/AddTaskDialog'
import { VisitDataView } from '@/components/pipeline/VisitDataView'
import type { LegalDocsState, LegalFlags } from '@/types/legal-docs.types'
import type { FlowHistoryData } from '@/app/(dashboard)/_components/FlowHistoryCard'

import {
  buildKeyStats, ghlMissingFields, nextStep, resolveTab, visibleTabs, type TabKey,
} from '@/lib/properties/detail-view'
import { PropertyHeroGallery } from '@/components/properties/detail/PropertyHeroGallery'
import { PropertyIdentityBar } from '@/components/properties/detail/PropertyIdentityBar'
import { PropertyKeyStats } from '@/components/properties/detail/PropertyKeyStats'
import { PropertyNextStepBanner } from '@/components/properties/detail/PropertyNextStepBanner'
import { PropertyTabsNav } from '@/components/properties/detail/PropertyTabsNav'
import { PropertyArchiveFooter } from '@/components/properties/detail/PropertyArchiveFooter'
import { OverviewTab } from '@/components/properties/detail/tabs/OverviewTab'
import { MediaTab } from '@/components/properties/detail/tabs/MediaTab'
import { DocsTab } from '@/components/properties/detail/tabs/DocsTab'
import { MarketingTab } from '@/components/properties/detail/tabs/MarketingTab'
import { HistoryTab, type VisitFeedback } from '@/components/properties/detail/tabs/HistoryTab'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Borrador', color: 'bg-gray-400' },
  pending_docs: { label: 'Pendiente Documentos', color: 'bg-amber-500' },
  pending_photos: { label: 'Pendiente Fotos', color: 'bg-orange-500' },
  pending_review: { label: 'En Revisión Legal', color: 'bg-purple-500' },
  approved: { label: 'Captación Completa', color: 'bg-green-500' },
  rejected: { label: 'Rechazada', color: 'bg-red-500' },
  active: { label: 'Activa', color: 'bg-emerald-600' },
  descartada: { label: 'Descartada', color: 'bg-slate-500' },
}

interface PropertyData {
  id: string
  address: string
  neighborhood: string
  city: string
  property_type: string
  operation_type: string | null
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  covered_area: number | null
  total_area: number | null
  floor: number | null
  age: number | null
  expensas: number | null
  amenities: unknown
  description: string | null
  latitude: number | null
  longitude: number | null
  asking_price: number
  currency: string
  commission_percentage: number
  contract_start_date: string | null
  contract_end_date: string | null
  origin: string | null
  status: string
  documents: Array<{ name: string; url: string }>
  photos: string[]
  plans: string[] | null
  video_file_url: string | null
  tour_3d_url: string | null
  video_recorrido_url: string | null
  deliver_media: string | null
  legal_status: string
  legal_notes: string | null
  legal_reviewed_at: string | null
  created_at: string
  ghl_imported?: boolean
  ghl_custom_fields?: Record<string, string | null> | null
  import_source?: string | null
  legal_docs_pending?: boolean | null
  origin_pending?: boolean | null
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [property, setProperty] = useState<PropertyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userInfo, setUserInfo] = useState<{ id: string; role: string } | null>(null)
  const [legalDocsData, setLegalDocsData] = useState<{ docs: LegalDocsState; flags: LegalFlags } | null>(null)
  const [flowHistory, setFlowHistory] = useState<FlowHistoryData | null>(null)
  const [feedback, setFeedback] = useState<VisitFeedback[]>([])
  const [tab, setTab] = useState<TabKey>('propiedad')

  const fetchProperty = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${id}`)
      if (res.ok) {
        const { data } = await res.json()
        setProperty(data)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  const fetchLegalDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${id}/legal-docs`)
      if (res.ok) {
        const { data } = await res.json()
        setLegalDocsData(data)
      }
    } catch (err) {
      console.error(err)
    }
  }, [id])

  useEffect(() => { fetch('/api/auth/me').then(r => r.json()).then(setUserInfo).catch(() => {}) }, [])
  useEffect(() => { fetchProperty() }, [fetchProperty])
  useEffect(() => { fetchLegalDocs() }, [fetchLegalDocs])
  useEffect(() => {
    fetch(`/api/flow-history?propertyId=${id}`)
      .then(r => r.json()).then(({ data }) => setFlowHistory(data)).catch(() => setFlowHistory(null))
  }, [id])
  useEffect(() => {
    if (!id) return
    fetch(`/api/properties/${id}/feedback`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => setFeedback(Array.isArray(data) ? data : []))
      .catch(() => setFeedback([]))
  }, [id])

  // La pestaña vive en la URL (?tab=…) para que recargar no vuelva al principio
  // y se pueda mandar un link directo. Se lee con window.location en vez de
  // useSearchParams: ese hook obliga a envolver la página en <Suspense>.
  const tabs = visibleTabs({ role: userInfo?.role, status: property?.status ?? '' })

  useEffect(() => {
    if (!property || !userInfo) return
    const fromUrl = new URLSearchParams(window.location.search).get('tab')
    setTab(resolveTab(fromUrl, visibleTabs({ role: userInfo.role, status: property.status })))
  }, [property, userInfo])

  function goToTab(next: TabKey) {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url.toString())
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleUpdateStatus(newStatus: string) {
    setSubmitting(true)
    try {
      await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      await fetchProperty()
    } catch {
      alert('Error al actualizar estado')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDiscard() {
    if (!confirm(`¿Descartar la propiedad "${property?.address}"?\n\nQueda guardada en el sistema (status="Descartada") y se puede restaurar cambiándola de estado, pero no avanza más en el flujo de captación.`)) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'descartada' }),
      })
      if (!res.ok) throw new Error('Error')
      await fetchProperty()
    } catch {
      alert('Error al descartar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRestore() {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      })
      if (!res.ok) throw new Error('Error')
      await fetchProperty()
    } catch {
      alert('Error al restaurar')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!property) return
    const confirmation = prompt(
      `Vas a ELIMINAR DEFINITIVAMENTE la propiedad "${property.address}".\n\n` +
      `Esta acción no se puede deshacer. Se borran también sus publicaciones en portales, métricas, fotos, eventos legales y revisiones.\n\n` +
      `Para confirmar, escribí ELIMINAR:`
    )
    if (confirmation !== 'ELIMINAR') return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/properties/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(data.error || 'Error al eliminar')
        setSubmitting(false)
        return
      }
      router.push('/properties')
    } catch {
      alert('Error al eliminar')
      setSubmitting(false)
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  if (!property) return <div className="text-center py-20"><p>Propiedad no encontrada</p></div>

  const statusInfo = (property.status === 'pending_review' && property.legal_status === 'approved')
    ? { label: 'Pendiente Fotos', color: 'bg-amber-500' }
    : STATUS_LABELS[property.status] || { label: property.status, color: 'bg-gray-400' }

  const isAbogado = userInfo?.role === 'abogado'
  const canHardDelete = userInfo?.role === 'admin' || userInfo?.role === 'dueno'
  const photos = property.photos || []
  const plans = property.plans || []
  const documents = Array.isArray(property.documents) ? property.documents : []

  const step = nextStep({
    role: userInfo?.role,
    status: property.status,
    legalStatus: property.legal_status,
    legalNotes: property.legal_notes,
    photosCount: photos.length,
    documentsCount: documents.length,
    ghlImported: !!property.ghl_imported,
    ghlMissing: property.ghl_imported ? ghlMissingFields(property) : [],
    importSource: property.import_source ?? null,
    legalDocsPending: !!property.legal_docs_pending,
    originPending: !!property.origin_pending,
  })

  const ghlDetails = step?.id === 'ghl' && property.ghl_custom_fields && Object.keys(property.ghl_custom_fields).length > 0
    ? (
      <details className="text-sm mt-2">
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Ver datos importados de GHL ({Object.keys(property.ghl_custom_fields).length} campos)
        </summary>
        <div className="mt-2 p-3 bg-muted/50 rounded-lg">
          <VisitDataView data={property.ghl_custom_fields} />
        </div>
      </details>
    )
    : undefined

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <AddTaskDialog entity={{ kind: 'property', id: property.id, label: property.address }} />
      </div>

      <PropertyHeroGallery
        photos={photos}
        address={property.address}
        plansCount={plans.length}
        hasVideo={!!property.video_file_url}
        hasTour={!!property.tour_3d_url}
        onGoToMedia={isAbogado ? undefined : () => goToTab('multimedia')}
      />

      <PropertyIdentityBar
        operationType={property.operation_type}
        propertyType={property.property_type}
        address={property.address}
        neighborhood={property.neighborhood}
        city={property.city}
        price={property.asking_price}
        currency={property.currency}
        statusLabel={statusInfo.label}
        statusColor={statusInfo.color}
        showPrice={!isAbogado}
      />

      <PropertyKeyStats stats={buildKeyStats(property)} />

      <PropertyNextStepBanner
        step={step}
        submitting={submitting}
        onGoToTab={goToTab}
        onSubmitReview={() => handleUpdateStatus('pending_review')}
        details={ghlDetails}
      />

      <PropertyTabsNav tabs={tabs} active={tab} onChange={goToTab} />

      <div className="pt-2">
        {tab === 'propiedad' && <OverviewTab property={property} isAbogado={!!isAbogado} />}

        {tab === 'multimedia' && (
          <MediaTab
            propertyId={property.id}
            photos={photos}
            plans={plans}
            videoFileUrl={property.video_file_url}
            tourUrl={property.tour_3d_url}
            videoRecorridoUrl={property.video_recorrido_url}
            onChanged={fetchProperty}
          />
        )}

        {tab === 'documentacion' && (
          <DocsTab
            propertyId={property.id}
            propertyType={property.property_type || ''}
            docs={legalDocsData?.docs || {}}
            flags={legalDocsData?.flags || { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }}
            isAbogado={!!isAbogado}
            status={property.status}
            legalStatus={property.legal_status}
            legalNotes={property.legal_notes}
            onUpdated={fetchLegalDocs}
            onReviewed={() => { fetchProperty(); fetchLegalDocs() }}
          />
        )}

        {tab === 'difusion' && (
          <MarketingTab
            propertyId={property.id}
            canManage={['admin', 'dueno', 'coordinador'].includes(userInfo?.role ?? '')}
            videoRecorridoUrl={property.video_recorrido_url}
            tour3dUrl={property.tour_3d_url}
            deliverMediaSaved={property.deliver_media}
          />
        )}

        {tab === 'historial' && (
          <HistoryTab propertyId={property.id} flowHistory={flowHistory} feedback={feedback} />
        )}
      </div>

      {!isAbogado && (
        <PropertyArchiveFooter
          createdAt={property.created_at}
          isDiscarded={property.status === 'descartada'}
          canHardDelete={canHardDelete}
          submitting={submitting}
          onDiscard={handleDiscard}
          onRestore={handleRestore}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verificar que `GenerateDescriptionCard` quedó fuera**

Run: `grep -rn "GenerateDescriptionCard" --include="*.tsx" app components`
Expected: solo la definición `components/properties/GenerateDescriptionCard.tsx:23` — ninguna importación. El archivo del componente y su endpoint quedan en el repo, sin uso.

- [ ] **Step 4: Verificar que compila y que la suite sigue verde**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; toda la suite en verde.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/properties/[id]/page.tsx" components/properties/detail/PropertyArchiveFooter.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): ficha rediseñada con pestañas, galería premium y pie de archivo"
```

---

### Task 12: Probe de render y verificación final

Turbopack no arranca acá, así que el probe es la red de seguridad: renderiza las 5 pestañas en los 4 escenarios que importan.

**Files:**
- Create: `scripts/property-detail-tabs.probe.tsx`

**Interfaces:**
- Consumes: todos los componentes de las tareas 2-11.
- Produces: script ejecutable que falla ruidosamente si alguna pestaña deja de renderizar.

- [ ] **Step 1: Escribir el probe**

Crear `scripts/property-detail-tabs.probe.tsx`:

```tsx
/**
 * Probe de render de la ficha de propiedad rediseñada.
 * Verifica que las 5 pestañas renderizan en los escenarios reales SIN navegador
 * (Turbopack no arranca en esta carpeta por el acento de "Gestión" en el path).
 *
 * Correr: npx tsx scripts/property-detail-tabs.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { PropertyHeroGallery } from '@/components/properties/detail/PropertyHeroGallery'
import { PropertyIdentityBar } from '@/components/properties/detail/PropertyIdentityBar'
import { PropertyKeyStats } from '@/components/properties/detail/PropertyKeyStats'
import { PropertyNextStepBanner } from '@/components/properties/detail/PropertyNextStepBanner'
import { PropertyTabsNav } from '@/components/properties/detail/PropertyTabsNav'
import { OverviewTab } from '@/components/properties/detail/tabs/OverviewTab'
import { HistoryTab } from '@/components/properties/detail/tabs/HistoryTab'
import { buildKeyStats, nextStep, visibleTabs } from '@/lib/properties/detail-view'

function check(name: string, html: string, needles: string[]) {
  for (const n of needles) {
    if (!html.includes(n)) throw new Error(`[${name}] falta en el render: ${n}`)
  }
  console.log(`✓ ${name}`)
}

const property = {
  address: 'Av. Rivadavia 4820', neighborhood: 'Caballito', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta',
  description: 'Tres ambientes al frente con balcón corrido.',
  amenities: ['parrilla', 'sum'], expensas: 145000, floor: 4, age: 12,
  asking_price: 185000, currency: 'USD', commission_percentage: 3,
  contract_start_date: null, contract_end_date: null, origin: 'embudo',
  latitude: null, longitude: null,
}

// 1) Captada y completa
check('galería con fotos', renderToStaticMarkup(
  <PropertyHeroGallery photos={['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg', 'f.jpg']}
    address="Av. Rivadavia 4820" plansCount={2} hasVideo hasTour />,
), ['6 fotos', '2 planos', 'Video', 'Recorrido 360°', '+1'])

check('identidad', renderToStaticMarkup(
  <PropertyIdentityBar operationType="venta" propertyType="departamento"
    address="Av. Rivadavia 4820" neighborhood="Caballito" city="CABA"
    price={185000} currency="USD" statusLabel="Captación Completa" statusColor="bg-green-500" showPrice />,
), ['Departamento en venta', 'Av. Rivadavia 4820', 'Caballito, CABA'])

check('datos clave', renderToStaticMarkup(
  <PropertyKeyStats stats={buildKeyStats({ rooms: 3, bathrooms: 2, covered_area: 78, floor: 0 })} />,
), ['Ambientes', 'Baños', '78 m²', 'PB'])

check('pestaña Propiedad', renderToStaticMarkup(
  <OverviewTab property={property} isAbogado={false} />,
), ['Descripción', 'Características', 'Datos comerciales', 'parrilla',
    'Esta propiedad todavía no tiene ubicación precisa cargada'])

check('pestaña Propiedad (abogado, sin datos comerciales)', renderToStaticMarkup(
  <OverviewTab property={property} isAbogado />,
), ['Descripción'])
if (renderToStaticMarkup(<OverviewTab property={property} isAbogado />).includes('Datos comerciales')) {
  throw new Error('[abogado] no debería ver los datos comerciales')
}

check('pestaña Historial', renderToStaticMarkup(
  <HistoryTab propertyId="p1" flowHistory={null} feedback={[]} />,
), ['Historial'])

// 2) Sin fotos
check('galería vacía', renderToStaticMarkup(
  <PropertyHeroGallery photos={[]} address="X" plansCount={0} hasVideo={false} hasTour={false} />,
), ['Todavía no hay fotos de esta propiedad'])

// 3) Pendiente de documentos
const stepPendiente = nextStep({
  role: 'asesor', status: 'pending_docs', legalStatus: 'pending', legalNotes: null,
  photosCount: 3, documentsCount: 0, ghlImported: false, ghlMissing: [],
  importSource: null, legalDocsPending: false, originPending: false,
})
check('próximo paso pendiente', renderToStaticMarkup(
  <PropertyNextStepBanner step={stepPendiente} submitting={false} onGoToTab={() => {}} onSubmitReview={() => {}} />,
), ['Falta la documentación', 'Ir a Documentación'])

// 4) Pestañas por rol
check('pestañas del asesor', renderToStaticMarkup(
  <PropertyTabsNav tabs={visibleTabs({ role: 'asesor', status: 'approved' })} active="propiedad" onChange={() => {}} />,
), ['Propiedad', 'Multimedia', 'Documentación', 'Difusión', 'Historial'])

const abogadoHtml = renderToStaticMarkup(
  <PropertyTabsNav tabs={visibleTabs({ role: 'abogado', status: 'approved' })} active="propiedad" onChange={() => {}} />,
)
if (abogadoHtml.includes('Multimedia') || abogadoHtml.includes('Difusión')) {
  throw new Error('[abogado] no debería ver Multimedia ni Difusión')
}
console.log('✓ pestañas del abogado')

console.log('\nTodas las pestañas renderizan.')
```

- [ ] **Step 2: Correr el probe**

Run: `npx tsx scripts/property-detail-tabs.probe.tsx`
Expected: todas las líneas con `✓` y `Todas las pestañas renderizan.`

**Por qué el probe puede renderizar `OverviewTab` fuera de Next:** el mapa entra por `dynamic(..., { ssr: false })`, así que en un render de servidor se dibuja el fallback y **el módulo de Leaflet nunca se evalúa** — que es justo lo que hace falta, porque `PropertyLocationMap` importa `leaflet/dist/leaflet.css` y Node no sabe parsear CSS. Si aun así `next/dynamic` diera error fuera del runtime de Next, la salida es mover la sección Ubicación a su propio componente (`OverviewLocation.tsx`) y que el probe pruebe `OverviewTab` sin ella; NO quitar el `ssr: false`.

- [ ] **Step 3: Verificación completa**

Run: `npx vitest run && npx tsc --noEmit && npx eslint app/\(dashboard\)/properties components/properties lib/properties`
Expected: suite verde, sin errores de tipos, sin errores de lint.

- [ ] **Step 4: Repasar la tabla de paridad del spec**

Abrir `docs/superpowers/specs/2026-07-31-ficha-propiedad-premium-design.md` §5.9 y confirmar, fila por fila, que cada bloque de la versión anterior tiene su destino en el código nuevo. Anotar cualquier faltante y resolverlo antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add scripts/property-detail-tabs.probe.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "test(properties): probe de render de las 5 pestañas de la ficha"
```

- [ ] **Step 6: Verificación en navegador (requiere al usuario)**

Levantar `npx next dev --webpack` (arranca lento la primera vez, ~4 min) y abrir una propiedad captada. Confirmar a mano:

1. La barra **cambia el contenido**: al tocar Multimedia aparece solo Multimedia.
2. La pestaña queda en la URL y al recargar se mantiene.
3. La galería abre el visor y se navega con las flechas.
4. Subir una foto en Multimedia funciona y se refleja en la galería de arriba.
5. Subir un documento en Documentación funciona; con el usuario abogado aparecen Aprobar y Rechazar.
6. En Difusión se ven los cuatro canales con su estado real.
7. Una propiedad sin fotos muestra el panel de marca, no un hueco roto.

Pedirle al usuario la confirmación visual final antes de dar la tarea por terminada.

---

## Notas de implementación

- **Orden de las tareas:** 1 → 12 en secuencia. Las tareas 2-8 son independientes entre sí una vez hecha la 1, así que se pueden repartir; la 11 necesita todas las anteriores.
- **Qué NO tocar:** `PropertyMediaCard`, `LandingSection`, `MarketingTabs`, `FlowHistoryCard`, `LegalReviewHistory`, `PhotoGallery`, `PlansPanel` y cualquier archivo bajo `app/api/`.
- **Si algo del plan choca con la realidad del código** (una prop que cambió, un helper que no existe), parar y avisar en vez de improvisar: la regla que gobierna este trabajo es que ninguna función existente se rompe.
