# Fotos sin truncar + Argenprop fuera de CABA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Que ninguna ruta de portal vuelva a truncar `properties.photos` (el wizard de ML persistía `slice(0, 12)` sobre la columna compartida) y que cada aviso publique hasta el máximo real de su portal (ML = 30, verificado en la API). (2) Que Argenprop publique propiedades fuera de CABA resolviendo provincia → partido → localidad → barrio contra su catálogo de localización (jerarquía verificada en vivo el 2026-08-06).

**Architecture:** La columna `properties.photos` es la verdad de la propiedad y NINGUNA ruta de portal la achica: las rutas de guardado de los wizards pasan a usar un helper puro `reordenarSinPerder` (reordena, jamás pierde ni inyecta). El límite por portal se aplica recién al armar el payload (`ML_MAX_FOTOS_AVISO` / `AP_MAX_FOTOS_AVISO` en un módulo sin dependencias, importable desde cliente y servidor). Para la localización, `catalog.ts` suma la jerarquía completa (`paises/PAIS_1/provincias` → `provincias/{id}/partidos` → `partidos/{id}/localidades` → `localidades/{id}/barrios`, todas verificadas contra la API en vivo) con un matcher puro testeable, y `resolveLocalizacion` del adapter deja de lanzar "solo CABA".

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Vitest 4, API REST Argenprop (`integradores.api.sosiva451.com` v1, auth X-Token-CRM + Bearer), API pública MercadoLibre.

## Global Constraints

- Errores visibles para el asesor SIEMPRE en castellano, sin JSON crudo (regla del fix de ML de hoy: `mensajeYDetalle`).
- `properties.photos`: el ORDEN del array es la verdad; las 3 primeras son portada (CLAUDE.md § Multimedia). Reordenar sí; perder o inyectar, jamás.
- Ningún dato de un sistema ajeno se hardcodea sin verificación empírica ejecutable (lección ML de hoy: los IDs "se pudren solos").
- Los tests de lógica van sobre helpers puros (patrón del repo); las rutas quedan finas.
- Commits como `Sujupar <redstyle50@gmail.com>` (Netlify falla con otro autor).
- No usar subagentes para implementar (pedido del usuario); el agente E2E del final sí está pedido explícitamente.

## Hechos verificados en vivo (2026-08-06) — el plan depende de ellos

- ML `settings.max_pictures_per_item` = **30** en MLA401686/401685/105182/401687/1473.
- AP `/v1/localizacion/paises` → 19 (Argentina = `PAIS_1`).
- AP `/v1/localizacion/paises/PAIS_1/provincias` → 24 (`PROVINCIA_1` "Buenos Aires", `PROVINCIA_2` "Capital Federal").
- AP `/v1/localizacion/provincias/PROVINCIA_1/partidos` → 135 (ej. `PARTIDO_107` "Partido de Roque Pérez").
- AP `/v1/localizacion/partidos/PARTIDO_107/localidades` → 12 (`LOCALIDAD_1724`…).
- AP `/v1/localizacion/localidades/{id}/barrios` → ya en uso (CABA).
- Las credenciales AP en `.env.local`/DB funcionan HOY (el 401 "CRM no autorizado" de la memoria quedó resuelto).

---

### Task 1: Límites de fotos por portal + payloads a 30

**Files:**
- Create: `lib/portals/photo-limits.ts`
- Modify: `lib/portals/mercadolibre/mapping.ts:259` (slice 12 → constante)
- Modify: `lib/portals/argenprop/mapping.ts:84` (slice 30 → constante)
- Modify: `lib/portals/worker.ts:100` (12 → constante)
- Modify: `scripts/verify-ml-categories.ts` (chequear `max_pictures_per_item`)
- Test: `lib/portals/mercadolibre/mapping.test.ts`, `lib/portals/argenprop/mapping.test.ts`

**Interfaces:**
- Produces: `ML_MAX_FOTOS_AVISO = 30`, `AP_MAX_FOTOS_AVISO = 30` (números, export const) desde `lib/portals/photo-limits.ts`. Módulo SIN imports (se usa desde componentes cliente).

- [ ] **Step 1: Test que falla** — en `mapping.test.ts` de ML:

```ts
it('el aviso lleva hasta 30 fotos (límite real de ML, verificado en settings)', () => {
  const fotos = Array.from({ length: 35 }, (_, i) => `https://x/f${i}.jpg`)
  const p = propertyToMlPayload(makeProperty({ photos: fotos }))
  expect(p.pictures).toHaveLength(30)
  expect(p.pictures[0].source).toBe('https://x/f0.jpg')
})
```

Y en el de AP (`argenprop/mapping.test.ts`), mismo caso sobre `Multimedia` (35 fotos → 30 items `Tipo: 'FOTO'`).

- [ ] **Step 2: Correr y ver fallar** — `npx vitest run lib/portals/` → el de ML falla (12 ≠ 30).
- [ ] **Step 3: Implementar** — `lib/portals/photo-limits.ts`:

```ts
/**
 * Máximo de fotos que cada portal acepta POR AVISO.
 * Se aplican al armar el payload — NUNCA sobre properties.photos (la columna
 * compartida no se achica: truncarla acá fue el bug que dejó propiedades con
 * 12 fotos en todos los portales).
 * ML: settings.max_pictures_per_item = 30, verificado 2026-08-06 contra la API
 * para nuestras categorías (scripts/verify-ml-categories.ts lo re-verifica).
 */
export const ML_MAX_FOTOS_AVISO = 30
export const AP_MAX_FOTOS_AVISO = 30
```

En ML mapping: `pictures: (property.photos ?? []).slice(0, ML_MAX_FOTOS_AVISO).map(...)`. En AP mapping: `for (const url of (property.photos ?? []).slice(0, AP_MAX_FOTOS_AVISO))`. En worker: `Math.min(..., ML_MAX_FOTOS_AVISO)`.

- [ ] **Step 4: verify-ml-categories** — al verificar cada categoría, sumar: si `settings.max_pictures_per_item < ML_MAX_FOTOS_AVISO` → fallo con mensaje (la constante quedó por encima de lo que ML permite).
- [ ] **Step 5: Correr tests + verificador** — `npx vitest run lib/portals/` PASS; `npx tsx scripts/verify-ml-categories.ts` PASS (muestra el máximo por categoría).
- [ ] **Step 6: Commit** — `fix(portales): el límite de fotos es del aviso, no de la propiedad — y el de ML es 30, no 12`

### Task 2: Las rutas de guardado nunca pierden fotos (`reordenarSinPerder`)

**Files:**
- Create: `lib/portals/photo-reorder.ts` + `lib/portals/photo-reorder.test.ts`
- Modify: `app/api/properties/[id]/ml-preview/route.ts:177-182`
- Modify: `app/api/properties/[id]/ap-preview/route.ts:96-101`
- Modify: `components/properties/wizards/ml/steps/StepImages.tsx` y `.../ap/steps/StepImages.tsx` (aviso "publica las primeras N")

**Interfaces:**
- Produces: `reordenarSinPerder(actuales: string[], enviadas: string[]): string[]` — puro.

- [ ] **Step 1: Tests que fallan** (`photo-reorder.test.ts`):

```ts
import { describe, it, expect } from 'vitest'
import { reordenarSinPerder } from './photo-reorder'

const A = ['a', 'b', 'c', 'd']
describe('reordenarSinPerder', () => {
  it('reordena una permutación completa', () => {
    expect(reordenarSinPerder(A, ['c', 'a', 'd', 'b'])).toEqual(['c', 'a', 'd', 'b'])
  })
  it('NUNCA pierde: lo que falta en lo enviado se apendea al final en su orden', () => {
    expect(reordenarSinPerder(A, ['c', 'a'])).toEqual(['c', 'a', 'b', 'd'])
  })
  it('NUNCA inyecta: una URL que no es de la propiedad se descarta', () => {
    expect(reordenarSinPerder(A, ['x', 'b', 'a'])).toEqual(['b', 'a', 'c', 'd'])
  })
  it('deduplica lo enviado', () => {
    expect(reordenarSinPerder(A, ['b', 'b', 'a'])).toEqual(['b', 'a', 'c', 'd'])
  })
  it('enviado vacío = queda todo como estaba', () => {
    expect(reordenarSinPerder(A, [])).toEqual(A)
  })
})
```

- [ ] **Step 2: Ver fallar** — módulo no existe.
- [ ] **Step 3: Implementar**:

```ts
/**
 * Reordena properties.photos según lo que mandó un wizard SIN perder ni
 * inyectar. El wizard de ML truncaba con slice(0, 12) y cada propiedad que
 * pasaba por él quedaba con 12 fotos PARA SIEMPRE, en todos los portales.
 * Regla: el wizard elige ORDEN; el conjunto lo gobierna el módulo de media.
 */
export function reordenarSinPerder(actuales: string[], enviadas: string[]): string[] {
  const setActuales = new Set(actuales)
  const orden: string[] = []
  const visto = new Set<string>()
  for (const u of enviadas) {
    if (setActuales.has(u) && !visto.has(u)) { orden.push(u); visto.add(u) }
  }
  for (const u of actuales) if (!visto.has(u)) { orden.push(u); visto.add(u) }
  return orden
}
```

- [ ] **Step 4: Rutas** — en `ml-preview` PATCH, el bloque de photos pasa a: leer `photos` actuales de la propiedad ANTES de armar el update (un `select('photos')` si `body.photos` vino), sanear las enviadas (mismos filtros de URL http/largo) y `update.photos = reordenarSinPerder(actuales, enviadasSaneadas)`. Sin `slice`. Igual en `ap-preview` (adiós `slice(0, 20)`).
- [ ] **Step 5: Aviso en el paso de imágenes** — en ambos `StepImages`, bajo el contador: si `photos.length > LIMITE` mostrar `El aviso lleva las primeras {LIMITE} según este orden; las demás quedan en la ficha.` (importando la constante de `lib/portals/photo-limits.ts`).
- [ ] **Step 6: Correr** — `npx vitest run lib/portals/ components/properties/` PASS; `npx tsc --noEmit` sin errores nuevos.
- [ ] **Step 7: Commit** — `fix(portales): los wizards reordenan fotos pero nunca las pierden (adiós slice(0,12) persistido)`

### Task 3: Auditoría solo-lectura de propiedades ya truncadas

**Files:**
- Create: `scripts/audit-fotos-truncadas.ts`

- [ ] **Step 1: Script** — para cada propiedad no descartada: listar Storage `properties/{id}/photos/` (`supabase.storage.from(BUCKET).list(...)` con el bucket que usan `upload-init`/`commit` — verificarlo en `app/api/properties/[id]/media/upload-init/route.ts` al implementar), comparar `archivosEnStorage` vs `photos.length` y reportar las que tienen MÁS archivos que entradas (candidatas al truncado del wizard). SOLO imprime; no escribe nada. Salida: dirección, fotos en ficha, archivos en Storage, diferencia.
- [ ] **Step 2: Correr** — `node --env-file=.env.local --import tsx scripts/audit-fotos-truncadas.ts` y GUARDAR el resultado para el reporte final al usuario (decisión de reparar es del usuario: puede haber fotos borradas a propósito con `deletePhoto`).
- [ ] **Step 3: Commit** — `chore(media): auditoría de fotos huérfanas en Storage vs ficha`

### Task 4: Catálogo de localización completo + matcher puro

**Files:**
- Modify: `lib/portals/argenprop/catalog.ts`
- Test: `lib/portals/argenprop/catalog.test.ts` (nuevo)

**Interfaces:**
- Produces: `PAIS_ARGENTINA_ID = 'PAIS_1'`; `getProvincias(creds)`, `getPartidos(creds, provinciaId)`, `getLocalidadesDePartido(creds, partidoId)`, `getBarrios(creds, localidadId)` (todas `Promise<CatalogItem[]>`, cacheadas 24h con `cached()`); `matchLocalizacion(items: CatalogItem[], query: string): CatalogItem | null` (PURA); `resolveBarrioId(creds, localidadId, neighborhood)` (generaliza `resolveCabaBarrioId`, que queda como wrapper de compatibilidad).

- [ ] **Step 1: Tests del matcher que fallan**:

```ts
const items = [
  { Id: 'PARTIDO_107', Nombre: 'Partido de Roque Pérez' },
  { Id: 'PARTIDO_1', Nombre: 'Partido de 25 de Mayo' },
  { Id: 'BARRIO_20', Nombre: 'Palermo' },
  { Id: 'BARRIO_21', Nombre: 'Palermo Chico' },
]
it('matchea sin tildes ni mayúsculas y sin el prefijo "Partido de"', () => {
  expect(matchLocalizacion(items, 'roque perez')?.Id).toBe('PARTIDO_107')
})
it('prefiere el match exacto sobre el contenido ("Palermo" no se lo roba "Palermo Chico")', () => {
  expect(matchLocalizacion(items, 'Palermo')?.Id).toBe('BARRIO_20')
})
it('input más específico cae al contenido más largo ("Palermo Soho" → Palermo)', () => {
  expect(matchLocalizacion(items, 'Palermo Soho')?.Id).toBe('BARRIO_20')
})
it('sin match devuelve null, nunca un parecido dudoso', () => {
  expect(matchLocalizacion(items, 'Bariloche')).toBeNull()
})
```

- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** — `matchLocalizacion`: normaliza (`norm` existente) ambos lados y quita el prefijo `partido de ` del nombre del catálogo; (1) exacto; (2) nombre-contenido-en-query, el más largo (regla actual de barrios, mismos comentarios); (3) `null`. Los getters: espejo de `getBarriosCaba` con las rutas verificadas (`/v1/localizacion/paises/PAIS_1/provincias`, `/v1/localizacion/provincias/${id}/partidos`, `/v1/localizacion/partidos/${id}/localidades`, `/v1/localizacion/localidades/${id}/barrios`), cache key por id. `resolveBarrioId(creds, localidadId, neighborhood)` = el cuerpo actual de `resolveCabaBarrioId` parametrizando la localidad; `resolveCabaBarrioId` pasa a `return resolveBarrioId(creds, CABA_LOCALIDAD_ID, neighborhood)`.
- [ ] **Step 4: Correr** — PASS + `tsc` limpio.
- [ ] **Step 5: Commit** — `feat(argenprop): catálogo de localización completo (provincias→partidos→localidades) + matcher puro`

### Task 5: `resolveLocalizacion` general (adiós "solo CABA")

**Files:**
- Modify: `lib/portals/argenprop/adapter.ts:40-62`
- Test: `lib/portals/argenprop/adapter.test.ts` (nuevo; `vi.mock('./catalog')`)

**Interfaces:**
- Consumes: getters y `matchLocalizacion` de Task 4.
- Produces: misma firma (`{ localidadId, barrioId }`), sin el throw "solo CABA".

- [ ] **Step 1: Tests que fallan** (mockeando `./catalog` con los datos reales del probe):
  - provincia "CABA" → `{ localidadId: 'LOCALIDAD_2102', barrioId: 'BARRIO_20' }` (CABA sigue exigiendo barrio; sin barrio → error con "barrio").
  - provincia vacía + neighborhood "Palermo" → camino CABA (compatibilidad con fichas viejas).
  - provincia "Buenos Aires" + city "Roque Pérez" → resuelve provincia→partido→localidad; `barrioId: null` NO es error.
  - provincia "Buenos Aires" con city inexistente → error castellano que menciona "Ciudad" y el valor recibido.
  - provincia inexistente ("Marte") → error castellano que menciona "provincia".
- [ ] **Step 2: Ver fallar.**
- [ ] **Step 3: Implementar** — flujo:
  1. `dicenCaba` = `/^caba$/i.test(prov)` o el regex actual sobre `prov + city` → camino CABA actual (localidad 2102; el barrio en CABA es OBLIGATORIO: si no resuelve, el error actual se mantiene).
  2. `prov` vacía → intentar barrio CABA (comportamiento actual para fichas viejas); si no resuelve → error: `Cargá la provincia en la ficha para publicar fuera de CABA (ciudad recibida: "X").`
  3. Camino provincial: `getProvincias` + `matchLocalizacion(prov)`; `getPartidos` + `matchLocalizacion(city)`; `getLocalidadesDePartido` + `matchLocalizacion(city)` y, si no matchea pero el partido tiene UNA sola localidad, usarla; barrio = `resolveBarrioId(localidadId, neighborhood)` con `null` permitido.
  4. Cada paso que no resuelve lanza `PortalAdapterError` castellano nombrando el campo de la ficha y el valor recibido (sin IDs internos).
- [ ] **Step 4: Correr** — PASS; suite completa + `tsc`.
- [ ] **Step 5: Commit** — `feat(argenprop): publicación fuera de CABA — provincia→partido→localidad resueltos contra el catálogo`

### Task 6: Verificación en vivo + limpieza

**Files:**
- Create: `scripts/verify-ap-localizacion.ts` (reemplaza y borra `scripts/tmp-probe-ap-localizacion.ts`)

- [ ] **Step 1: Script** — casos fijos SOLO LECTURA contra la API real usando `resolveLocalizacion` vía un `ArgenpropAdapter` real (o replicando su flujo con los getters): `(CABA, — , Palermo)`, `(Buenos Aires, Roque Pérez, —)`, `(Buenos Aires, La Plata, —)`. Imprime la cadena resuelta con nombres e IDs; exit 1 si alguno falla.
- [ ] **Step 2: Correr en vivo** — los 3 casos resuelven.
- [ ] **Step 3: Commit** — `test(argenprop): verificador en vivo de la resolución de localización`

### Task 7: Documentación

**Files:**
- Modify: `CLAUDE.md` (sección Argenprop/portales)

- [ ] **Step 1:** Documentar: (a) regla "ninguna ruta de portal achica `properties.photos`; el límite es del payload" con los valores y dónde viven; (b) Argenprop fuera de CABA: jerarquía de endpoints verificada, matcher, y que en CABA el barrio sigue siendo obligatorio; (c) el 401 "CRM no autorizado" quedó resuelto (la memoria `argenprop_publicacion` se actualiza aparte).
- [ ] **Step 2: Commit** — `docs: fotos por portal y Argenprop fuera de CABA`

### Task 8 (post-implementación, pedido explícito del usuario): agente E2E + /review + push

- [ ] Agente E2E (Agent tool, explícitamente pedido): corre `npx vitest run`, `npx tsc --noEmit`, `npx tsx scripts/verify-ml-categories.ts`, `npx tsx scripts/verify-ap-localizacion.ts`, y el flujo del QA AP (`scripts/qa-publish-argenprop-test.ts`) en modo recon/lectura; publish live SOLO si existe propiedad `[TEST` (con teardown), reportando cada resultado crudo.
- [ ] `/review` del diff completo de la rama.
- [ ] Arreglar lo que salga, re-verificar, commit + push (merge a main si `origin/main` no se movió).
