# Editar precio y características desde la ficha — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Que el equipo pueda cambiar el precio de publicación y las características de una propiedad captada desde su ficha, con guardado automático, y que la landing pública lo refleje.

**Architecture:** Una ruta nueva `PATCH /api/properties/[id]/details` con **lista blanca de campos** (no el `PUT` genérico, que acepta cualquier columna), validación pura y testeada en `lib/properties/editable-fields.ts`, y un panel de edición en la pestaña Propiedad. La landing NO requiere trabajo: ya lee estos datos en vivo.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, Vitest 4 + happy-dom.

---

## Hallazgo que define el alcance (verificado en vivo, 2026-08-14)

**La landing pública ya muestra el precio y las características en vivo desde `properties`.** No hay que regenerarla ni invalidar nada.

Evidencia:
- `lib/landing/registry.tsx:106` → `price={property.asking_price}`; el comentario del archivo lo dice: *"desde `property` (precio, m², fotos por índice) — el bloque sólo trae overrides"*.
- `asking_price` NO existe en `lib/landing/schema.ts`: nunca se congela en el documento guardado.
- `curl` a la landing de José Luis Cantilo 4300 → header **`cache-control: private,no-cache,no-store,max-age=0,must-revalidate`** (100% dinámica, se renderiza en cada visita) y el HTML trae `1.350.000`, `6 amb`, `6 dorm`, `520 m` — exactamente los valores de la base.

**Conclusión:** al guardar el precio nuevo, la landing lo muestra en el siguiente refresh. El requisito "que se modifique automáticamente en la landing" se cumple sin tocar nada del módulo landing.

**Salvedad conocida:** de 6 landings, **una** (property `1e116561…`) tiene `80 m²` escrito dentro de un texto generado por IA. Los textos guardados no se recalculan. Si se edita la superficie de ESA propiedad, ese párrafo queda desactualizado hasta regenerar la landing. La UI avisa (Fase 2, Task 5).

## Global Constraints

- **NO usar el `PUT /api/properties/[id]` genérico** desde el panel: acepta cualquier columna del body, así que un asesor podría mandar `legal_status`, `commercial_status`, `assigned_to` o `status`. Ruta propia con lista blanca (mismo criterio que `POST /api/properties/[id]/commercial-status`).
- **El abogado no edita nada** (no ve datos comerciales; `isAbogado` ya gatea esa zona de `OverviewTab`).
- Autorización con `canAccessProperty` (un asesor solo su propiedad).
- **El precio NO se guarda tecleando.** Se guarda al salir del campo (blur) o con Enter. Razón: la landing es pública y tiene tráfico pago encima; un debounce mientras se tipea `1350000` puede publicar `US$ 13` durante un segundo. Los campos numéricos chicos y el texto sí van con debounce.
- Textos al usuario en castellano.
- Commits como `Sujupar <redstyle50@gmail.com>`.

---

# ARCHIVOS QUE SE TOCAN (para auditar antes de implementar)

## Fase 1 — PRECIO (prioridad del usuario: entregar y pushear primero)

| Archivo | Qué se hace |
|---|---|
| `lib/properties/editable-fields.ts` | **NUEVO.** Módulo puro: lista blanca de campos, validación y saneo. Sin imports de Supabase. |
| `lib/properties/editable-fields.test.ts` | **NUEVO.** Tests de la validación (precio > 0, techo, moneda válida, rechazo de campos fuera de la lista). |
| `app/api/properties/[id]/details/route.ts` | **NUEVO.** `PATCH` con auth + `canAccessProperty` + 403 abogado + lista blanca. |
| `components/properties/detail/PropertyPriceCard.tsx` | **NUEVO.** Tarjeta de precio editable (blur/Enter guarda, indicador "Guardado"). |
| `components/properties/detail/PropertyPriceCard.test.tsx` | **NUEVO.** Tests de UI. |
| `components/properties/detail/tabs/OverviewTab.tsx` | **MODIFICAR.** Reemplazar el precio de solo lectura del bloque "Datos comerciales" (línea ~155) por la tarjeta editable. |

**Fase 1 no toca NADA del módulo landing ni de portales.**

## Fase 2 — CARACTERÍSTICAS

| Archivo | Qué se hace |
|---|---|
| `lib/properties/editable-fields.ts` | **MODIFICAR.** Sumar a la lista blanca: `rooms`, `bedrooms`, `bathrooms`, `garages`, `covered_area`, `total_area`, `age`, `floor`, `expensas`, `description`. |
| `components/properties/detail/PropertyDetailsEditor.tsx` | **NUEVO.** Panel "Editar características" (se abre/cierra; autosave con debounce). |
| `components/properties/detail/PropertyDetailsEditor.test.tsx` | **NUEVO.** Tests de UI. |
| `components/properties/detail/tabs/OverviewTab.tsx` | **MODIFICAR.** Montar el panel en la sección "Características". |
| `CLAUDE.md` | **MODIFICAR.** Documentar que la landing lee en vivo y la regla del precio-en-blur. |

## Lo que NO se toca (decisiones explícitas)

- **`app/api/properties/[id]/route.ts` (PUT genérico):** queda como está. No se usa desde el panel.
- **Portales (ML / Argenprop):** cambiar el precio acá **NO actualiza el aviso publicado**. Es un tema real pero es otra decisión (¿re-publicar solo? ¿avisar?). La UI lo va a advertir con un texto, sin actuar sola. **Pendiente para vos.**
- **`properties.status` / `commercial_status` / `legal_status`:** fuera de la lista blanca, a propósito.
- **Historial de precio:** no hay tabla hoy. Queda fuera de estas dos fases; se puede sumar después.

---

### Task 1: Módulo puro de campos editables (Fase 1)

**Files:**
- Create: `lib/properties/editable-fields.ts`, `lib/properties/editable-fields.test.ts`

**Interfaces:**
- Produces: `sanearEdicion(body: unknown): { ok: true; patch: Record<string, unknown> } | { ok: false; error: string }`; `CAMPOS_EDITABLES: readonly string[]`.

- [ ] **Step 1: Test que falla** (`editable-fields.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { sanearEdicion } from './editable-fields'

describe('sanearEdicion', () => {
  it('acepta un precio válido', () => {
    const r = sanearEdicion({ asking_price: 1290000 })
    expect(r).toEqual({ ok: true, patch: { asking_price: 1290000 } })
  })

  it('acepta cambiar la moneda', () => {
    const r = sanearEdicion({ currency: 'ARS' })
    expect(r.ok && r.patch.currency).toBe('ARS')
  })

  it('rechaza un precio de cero o negativo', () => {
    expect(sanearEdicion({ asking_price: 0 }).ok).toBe(false)
    expect(sanearEdicion({ asking_price: -5 }).ok).toBe(false)
  })

  it('rechaza un precio absurdo (techo defensivo)', () => {
    expect(sanearEdicion({ asking_price: 100_000_001 }).ok).toBe(false)
  })

  it('rechaza una moneda inventada', () => {
    expect(sanearEdicion({ currency: 'BTC' }).ok).toBe(false)
  })

  it('IGNORA campos fuera de la lista blanca — no los deja pasar al UPDATE', () => {
    // Es la razón de existir de este módulo: sin él, el body del navegador
    // llega entero al UPDATE y un asesor podría cambiar su propio permiso
    // sobre la ficha o el estado legal.
    const r = sanearEdicion({ asking_price: 100, legal_status: 'approved', assigned_to: 'x', status: 'approved' })
    expect(r).toEqual({ ok: true, patch: { asking_price: 100 } })
  })

  it('un body sin ningún campo editable es error, no un UPDATE vacío', () => {
    expect(sanearEdicion({ legal_status: 'approved' }).ok).toBe(false)
    expect(sanearEdicion({}).ok).toBe(false)
  })

  it('rechaza un body que no es objeto', () => {
    expect(sanearEdicion(null).ok).toBe(false)
    expect(sanearEdicion('hola').ok).toBe(false)
  })
})
```

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run lib/properties/editable-fields.test.ts` (el módulo no existe).
- [ ] **Step 3: Implementar** `lib/properties/editable-fields.ts`:

```ts
/**
 * Lista blanca de lo que se puede editar desde la ficha, con su validación.
 *
 * Por qué NO se usa el PUT genérico de /api/properties/[id]: ese acepta el body
 * entero y lo manda al UPDATE. Desde el navegador, eso significa que quien edite
 * el precio podría mandar también `legal_status`, `assigned_to` o `status`. Acá
 * lo que no está en la lista simplemente no viaja.
 *
 * Módulo PURO (sin Supabase): la ruta se queda fina y esto se testea sin mocks.
 */
const MONEDAS = ['USD', 'ARS'] as const
const TECHO_PRECIO = 100_000_000

export const CAMPOS_EDITABLES = ['asking_price', 'currency'] as const

type Resultado =
  | { ok: true; patch: Record<string, unknown> }
  | { ok: false; error: string }

export function sanearEdicion(body: unknown): Resultado {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Los datos enviados no tienen el formato esperado.' }
  }
  const entrada = body as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  if ('asking_price' in entrada) {
    const v = entrada.asking_price
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
      return { ok: false, error: 'El precio tiene que ser un número mayor a cero.' }
    }
    if (v > TECHO_PRECIO) {
      return { ok: false, error: 'Ese precio parece un error de tipeo. Revisalo.' }
    }
    patch.asking_price = v
  }

  if ('currency' in entrada) {
    const v = entrada.currency
    if (typeof v !== 'string' || !MONEDAS.includes(v as (typeof MONEDAS)[number])) {
      return { ok: false, error: 'La moneda tiene que ser USD o ARS.' }
    }
    patch.currency = v
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: 'No hay ningún cambio para guardar.' }
  }
  return { ok: true, patch }
}
```

- [ ] **Step 4: Correr** — `npx vitest run lib/properties/editable-fields.test.ts` PASS.
- [ ] **Step 5: Commit** — `feat(propiedades): lista blanca de campos editables desde la ficha`

### Task 2: Ruta `PATCH /api/properties/[id]/details`

**Files:**
- Create: `app/api/properties/[id]/details/route.ts`

**Interfaces:**
- Consumes: `sanearEdicion` (Task 1), `requireAuth`, `canAccessProperty`, `updateProperty`.
- Produces: `PATCH` → `200 { success: true, property }` | `400` validación | `403` sin permiso/abogado | `500`.

- [ ] **Step 1: Implementar**:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { updateProperty, getProperty } from '@/lib/supabase/properties'
import { sanearEdicion } from '@/lib/properties/editable-fields'

/**
 * Edición de datos de la propiedad desde su ficha (precio y características).
 *
 * Ruta propia y NO el PUT genérico de /api/properties/[id]: aquel acepta
 * cualquier columna del body. Acá solo pasa lo que está en la lista blanca de
 * `sanearEdicion`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params

    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const saneado = sanearEdicion(await request.json().catch(() => null))
    if (!saneado.ok) {
      return NextResponse.json({ error: saneado.error }, { status: 400 })
    }

    await updateProperty(id, saneado.patch)
    const property = await getProperty(id)
    return NextResponse.json({ success: true, property })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar el cambio.' },
      { status: 500 },
    )
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` sin errores nuevos.
- [ ] **Step 3: Commit** — `feat(propiedades): ruta de edición con lista blanca`

### Task 3: Tarjeta de precio editable

**Files:**
- Create: `components/properties/detail/PropertyPriceCard.tsx`, `PropertyPriceCard.test.tsx`
- Modify: `components/properties/detail/tabs/OverviewTab.tsx` (bloque "Datos comerciales", línea ~155)

**Interfaces:**
- Consumes: `PATCH /api/properties/[id]/details` (Task 2), `formatMoney` de `lib/properties/detail-view`.
- Produces: `<PropertyPriceCard propertyId currency askingPrice onChanged />`.

- [ ] **Step 1: Tests que fallan** (`PropertyPriceCard.test.tsx`, `// @vitest-environment happy-dom`):

```ts
it('muestra el precio actual formateado', ...)              // US$ 1.350.000
it('NO guarda mientras se tipea (la landing es pública)', ...)  // fetch no llamado tras escribir
it('guarda al salir del campo', ...)                        // blur → 1 PATCH con el valor nuevo
it('guarda con Enter', ...)
it('no guarda si el valor no cambió', ...)                  // fetch no llamado
it('muestra el error del servidor y deja el valor viejo', ...)
it('avisa que el aviso de los portales no se actualiza solo', ...)
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** la tarjeta: input numérico + selector de moneda; `guardar()` se dispara en `onBlur` y en `Enter`, compara contra el valor inicial y hace `PATCH`; estados `guardando`/`guardado`/`error`; nota fija: *"La landing pública toma el precio nuevo enseguida. Los avisos ya publicados en los portales no se actualizan solos."*
- [ ] **Step 4:** Montar en `OverviewTab` reemplazando la fila "Precio" de solo lectura.
- [ ] **Step 5: Correr** — `npx vitest run components/properties/` PASS + `npx tsc --noEmit`.
- [ ] **Step 6: Commit** — `feat(propiedades): el precio de publicación se edita desde la ficha`

### Task 4: Verificación de la Fase 1 y entrega

- [ ] Suite completa + typecheck.
- [ ] Script de verificación contra la base real (`scripts/verify-precio-landing.ts`, solo lectura): para una propiedad con landing publicada, imprime el precio de la base y el precio que aparece en el HTML de la landing pública, y confirma que coinciden.
- [ ] Push a `main` y confirmar el deploy de Netlify.

---

### Task 5: Panel de características (Fase 2)

**Files:**
- Modify: `lib/properties/editable-fields.ts` + su test
- Create: `components/properties/detail/PropertyDetailsEditor.tsx` + test
- Modify: `components/properties/detail/tabs/OverviewTab.tsx`

- [ ] **Step 1: Tests de validación que fallan** — enteros ≥ 0 y con techo para `rooms`/`bedrooms`/`bathrooms`/`garages` (0–50), `age` (0–300), `floor` (−5–200), `covered_area`/`total_area` (> 0, ≤ 100.000), `expensas` (≥ 0), `description` (string ≤ 5000, se recorta). Campo vacío → `null` (borrar un dato es válido), salvo los que la ficha exige.
- [ ] **Step 2: Ver fallar → implementar → correr.**
- [ ] **Step 3: Panel de UI** "Editar características" plegable, con autosave debounce 1000 ms por campo (acá sí: no son datos que se lean mal a medio tipear como el precio), indicador de guardado e invalidación de la ficha al terminar.
- [ ] **Step 4:** Aviso en el panel cuando la propiedad tiene landing publicada: *"Los datos se actualizan solos en la landing. Los textos que ya escribió la IA no se reescriben."*
- [ ] **Step 5: Tests de UI + suite + typecheck. Commit.**

### Task 6: Documentación (Fase 2)

- [ ] `CLAUDE.md`: la landing lee `properties` en vivo (nada que invalidar); el precio se guarda en blur y por qué; la ruta `details` con lista blanca y por qué no el PUT genérico; los portales no se actualizan solos.
- [ ] Commit + push.
