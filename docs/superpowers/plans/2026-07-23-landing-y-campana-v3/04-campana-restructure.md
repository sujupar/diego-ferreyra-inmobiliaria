I now have the full empirical picture. Here is the design document.

---

# Diseño — Reestructuración Campaña Meta (Fase 2)

**Proyecto:** Diego Ferreyra Inmobiliaria · Next.js 16.0.10 / React 19 / Supabase / Netlify
**Alcance:** landing-gate · reúso de avatar · resumabilidad paso-a-paso · swap Gemini→gpt-image-2 · budget-safety
**Verificado empíricamente** contra los archivos reales (paths y números de línea abajo son los actuales, no supuestos).

---

## 0. Integration seam con Fase 1 (contrato del que depende Fase 2)

Fase 1 (landing como sección independiente) **todavía no existe** en el repo — no hay tabla `property_landings` ni migración de avatar/empathy-map (verificado: `grep` vacío). Toda la Fase 2 depende de una tabla de Fase 1. Para no acoplar contra algo indefinido, **fijo el contrato mínimo** que Fase 2 consume. Fase 1 puede enriquecerlo, pero estas columnas son el **API de datos** entre fases y no deben renombrarse.

```sql
-- Propiedad de Fase 1. Fase 2 SOLO lee de acá (salvo utm_base, que crea Fase 1 y Meta consume).
-- Contrato mínimo — Fase 1 puede agregar columnas (blocks jsonb del editor DnD, template_id, etc.)
CREATE TABLE IF NOT EXISTS public.property_landings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  -- Estado: el GATE de Fase 2 exige 'published'. 'draft' NO habilita campaña.
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','published','archived')),
  -- El enlace ESTABLE. Aunque el asesor cambie de template, este slug NO cambia.
  public_slug   text,                    -- espejo autoritativo de properties.public_slug
  published_at  timestamptz,
  -- AVATAR con MAPA DE EMPATÍA (co-creado en Fase 1). Fase 2 lo REUSA.
  avatar        jsonb,                   -- shape = LandingAvatar (abajo)
  -- Base estructural de UTMs (Fase 1 la crea, Meta la consume en el builder).
  utm_base      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {source,medium,campaign_prefix}
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- UNA landing publicada por propiedad (mismo enlace final aunque cambie el diseño).
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_landings_one_published
  ON public.property_landings(property_id) WHERE status = 'published';
```

**Shape del avatar de Fase 1 (superset del `BuyerAvatar` actual + mapa de empatía).** Fase 1 lo produce en co-creación; Fase 2 lo reusa:

```ts
// lib/marketing/types/landing-avatar.ts (nuevo, compartido por ambas fases)
export interface EmpathyMap {
  says: string[]; thinks: string[]; feels: string[]; does: string[]
  pains: string[]; gains: string[]
}
export interface LandingAvatar extends BuyerAvatar {   // BuyerAvatar = el actual de buyer-avatar-generator.ts
  empathyMap: EmpathyMap
  source: 'landing_cocreation'
}
```

> **Decisión / tradeoff.** Podría fusionar landing y campaña en una sola tabla `meta_launch_jobs`, pero la landing sobrevive a N campañas y se edita fuera del wizard → tabla propia. El costo es un JOIN extra en el gate; trivial.

---

## 1. LANDING GATE — de error 412 a flujo

### Problema
`start/route.ts:66-71` hoy corta con **412** si `!property.public_slug`. Eso: (a) chequea slug, no landing **publicada**; (b) el slug se asigna solo automáticamente al publicar en portal (`worker.ts:416`), así que una propiedad con portal pero sin landing pasa el gate igual; (c) es un dead-end sin acción.

### Diseño
El gate verifica **landing publicada real** (no slug), y el front convierte el bloqueo en navegación hacia Fase 1 con retorno.

**Backend — `start/route.ts`** (reemplaza el bloque 66-71):

```ts
// Gate: exige landing PUBLICADA (Fase 1), no solo slug.
const { data: landing } = await supabase
  .from('property_landings')
  .select('id, status, public_slug, avatar')
  .eq('property_id', id)
  .eq('status', 'published')
  .maybeSingle()

if (!landing || !landing.public_slug) {
  return NextResponse.json(
    {
      error: 'landing_required',
      code: 'LANDING_REQUIRED',
      // deep-link a la sección de Fase 1 con retorno al wizard
      redirectTo: `/properties/${id}/marketing/landing?next=meta-ads`,
      message: 'Primero creá y publicá la landing de esta propiedad.',
    },
    { status: 409 },   // 409, no 412: "conflicto de precondición accionable"
  )
}
```

Nota: mantener también el guard de `public_slug` en `properties` como defensa (el builder ya lo exige en `meta-campaign-builder.ts:325`), pero la **fuente de verdad del gate** es `property_landings.status='published'`.

**Reason del 409 vs 412:** el front distingue por `code:'LANDING_REQUIRED'`, no por el status HTTP — pero 409 comunica "reconciliá un precondición" y no se confunde con los 412 de otras rutas. Aceptable dejar 412 si se prefiere; lo que importa es el `code`.

**Frontend — nuevo `step: 'landing_gate'` como step 0 del wizard.**
`MetaAdsWizardV2.tsx` recibe una prop nueva `hasPublishedLanding: boolean` (resuelta server-side en `page.tsx` con el mismo SELECT). Estado inicial:

```ts
const initialStep: WizardStep =
  hasZombieCampaign ? 'cleanup_required'
  : !hasPublishedLanding ? 'landing_gate'
  : 'confirm_data'
```

El render de `landing_gate` es una tarjeta con CTA "Crear la landing" → `router.push('/properties/[id]/marketing/landing?next=meta-ads')`. Al volver (`?next=meta-ads` consumido por Fase 1 tras publicar), la página del wizard re-evalúa `hasPublishedLanding` server-side y arranca en `confirm_data`. Como fallback, si el `POST /start` devuelve `code:'LANDING_REQUIRED'` (carrera: landing despublicada entremedio), el front vuelve a `landing_gate`.

**`page.tsx` (router del wizard)** agrega el SELECT de landing y pasa `hasPublishedLanding` + `landingAvatar` (para §2).

---

## 2. REÚSO DE AVATAR

### Problema
El `avatar_select` actual solo lista los 3 `generated_avatars` que produce `start` (Gemini, sin empathy map). No conoce el avatar co-creado en la landing.

### Diseño — tres fuentes en el mismo step
El step `avatar_select` presenta **tres orígenes** con precedencia:

1. **Avatar de la landing (recomendado, pre-seleccionado).** `property_landings.avatar` (LandingAvatar con empathyMap). Es el trabajo humano de Fase 1 → default.
2. **Ajustarlo.** El comentario del asesor pasa por `optimizeAvatarWithComment` (ya existe, `buyer-avatar-generator.ts:325`) — ampliado para **preservar `empathyMap`** (hoy lo dropea).
3. **Propuestas del sistema.** Los 3 `generated_avatars` que ya calcula `start`. Sirven como alternativas.

**Reconciliación con `meta_launch_jobs`.** Se agrega una columna que registra el **origen** del avatar elegido, sin duplicar el objeto:

```sql
ALTER TABLE public.meta_launch_jobs
  ADD COLUMN IF NOT EXISTS avatar_source text
    CHECK (avatar_source IN ('landing','system','system_optimized','landing_optimized'));
```

- `selected_avatar_id` sigue siendo el id (`'avatar_0'` o `'landing'`).
- `optimized_avatar` (jsonb ya existente) guarda el objeto **final efectivo** que consume el runner de imágenes (`ad-image-async-runner.ts:273` lee `optimized_avatar.hooks/shortLabel`). Si el asesor elige el de la landing sin ajustar, `start` (o el primer `save-input`) copia `property_landings.avatar` → `optimized_avatar` con `avatar_source='landing'`. Así **el runner de imágenes no cambia**: siempre lee `optimized_avatar`.

**`start/route.ts`** al pasar a `awaiting_user_input` ahora también persiste:
```ts
landing_avatar: landing.avatar,          // nueva col jsonb (o dentro de generated_avatars)
```
para que el front no tenga que re-fetchear la landing. Opción minimalista: reusar `generated_avatars` con forma `{ avatars: [...], landingAvatar: {...} }` (evita migración). **Recomiendo la reutilización de `generated_avatars`** — cero DDL, y el front ya lee ese jsonb.

**`optimizeAvatarWithComment` — parche para preservar empathy map:**
```ts
// buyer-avatar-generator.ts — agregar al system prompt + al return:
//  - system: "Preservá y ajustá el empathyMap (says/thinks/feels/does/pains/gains) coherente con el comentario."
//  - return: empathyMap: parsed.empathyMap ?? input.avatar.empathyMap
export async function optimizeAvatarWithComment(input: {
  avatar: LandingAvatar | BuyerAvatar; comment: string; property: Property
}): Promise<LandingAvatar | BuyerAvatar | null>
```

---

## 3. RESUMABILIDAD PASO-A-PASO (el gap real)

### Problema (raíz, confirmado)
`avatar_select`, `photo_stars`, `geo`, `budget` **todos** viven bajo el server status `'awaiting_user_input'`. En `pollStatus()` (`MetaAdsWizardV2.tsx:191-192`) el resume hace **siempre** `setStep('avatar_select')` cuando ve `awaiting_user_input`. Al recargar el navegador durante `budget`, el asesor cae de nuevo en `avatar_select` y pierde el punto. La resumabilidad de **imágenes** sí funciona (cuenta piezas en `property_ad_assets`, `ad-image-async-runner.ts:239-249`) — **no tocarla**.

### Diseño — persistir el sub-step exacto
Agregar una columna `wizard_step` que refleja el sub-step UI, actualizada por `save-input` en **cada avance** (incluido "atrás"). El front al resumir lee `wizard_step` y salta directo.

**Migración:**
```sql
ALTER TABLE public.meta_launch_jobs
  ADD COLUMN IF NOT EXISTS wizard_step text
    CHECK (wizard_step IN (
      'confirm_data','avatar_select','photo_stars','geo','budget',
      'review_and_publish'   -- generating/publishing/done se derivan del status, no de acá
    ));
-- Backfill defensivo para jobs vivos existentes:
UPDATE public.meta_launch_jobs SET wizard_step = 'avatar_select'
  WHERE status = 'awaiting_user_input' AND wizard_step IS NULL;
```

> **Por qué columna dedicada y no derivar de `current_step`.** `current_step` es texto libre que el backend pisa con labels de progreso (`'generating_piece_3_of_27'`, `'creating_campaign'`). Mezclar UI-step con progress-label acopla dos responsabilidades y ya rompió una vez implícitamente. Columna aparte = una responsabilidad, un CHECK, testeable.

**`save-input/route.ts`** — aceptar y persistir `wizardStep`:
```ts
// body agrega: wizardStep?: WizardStep
const ALLOWED_WSTEP = new Set(['confirm_data','avatar_select','photo_stars','geo','budget','review_and_publish'])
if (typeof body.wizardStep === 'string' && ALLOWED_WSTEP.has(body.wizardStep)) {
  update.wizard_step = body.wizardStep
}
```
La transición a `generating` (readyToGenerate, ya existente en `save-input:83-104`) **no** setea `wizard_step` — el status manda desde ahí.

**Front — cada `setStep` de un sub-step de input dispara un PATCH ligero** (fire-and-forget, no bloqueante):
```ts
function goToStep(next: WizardStep) {
  setStep(next)
  if (jobId && INPUT_STEPS.has(next)) {
    fetch(`/api/properties/${propertyId}/meta-launch-v2/${jobId}/save-input`, {
      method: 'PATCH', headers: {'content-type':'application/json'},
      body: JSON.stringify({ wizardStep: next }),
    }).catch(() => {})   // best-effort: si falla, el peor caso es resumir un paso antes
  }
}
```
Reemplazar los `onClick={() => setStep('geo')}` (líneas 772/839/873/918/837/872) por `goToStep(...)`. **Atrás también llama `goToStep`** → volver atrás persiste el retroceso (el asesor que retrocede y recarga vuelve a donde estaba). Como los inputs (avatar/starred/geo/budget) ya se guardan en el server vía `save-input`, "ir atrás" **no pierde datos**: cada sub-step re-hidrata su estado desde `job` en el poll.

**Front — `pollStatus()` resume por `wizard_step`** (reemplaza el `setStep('avatar_select')` fijo de la línea 191-192):
```ts
if (serverStatus === 'awaiting_user_input' &&
    (step === 'analyzing' || step === 'confirm_data' || step === 'landing_gate')) {
  const resumed = (data.job?.wizard_step as WizardStep | null) ?? 'avatar_select'
  setStep(INPUT_STEPS.has(resumed) ? resumed : 'avatar_select')
  hydrateInputsFromJob(data.job)   // setSelectedAvatarId/setStarredPhotos/setGeoPresetId/setDailyBudget
}
```
`status/route.ts` ya devuelve el job entero → solo hay que incluir `wizard_step` en la lectura (ya sale con `select('*')` si ese endpoint usa `*`; si tiene lista explícita, agregarlo). El resto de las ramas de `pollStatus` (generating/awaiting_confirm/publishing) **quedan igual** — preservan la resumabilidad de imágenes.

**Hidratación de inputs.** Nueva `hydrateInputsFromJob(job)` que setea los `useState` desde las columnas ya persistidas (`selected_avatar_id`, `starred_photo_indices`, `geo_preset_id`, `daily_budget_ars`, `optimized_avatar`). Sin esto, resumir en `budget` mostraría el step correcto pero con inputs vacíos.

**Invariante que no se rompe:** el status del server sigue siendo la fuente de verdad de la *fase macro*; `wizard_step` solo desambigua el sub-step **dentro** de `awaiting_user_input`. Un job en `generating`/`awaiting_confirm` ignora `wizard_step` por completo.

---

## 4. SWAP Gemini → gpt-image-2

### Decisión clave: ¿text2image o edit-con-referencia?
El objetivo del ad es **captar PROPIETARIOS** (no compradores) con una pieza de **altísimo nivel gráfico**. La foto real de la propiedad, cruda, "parece portal" — justo lo que el usuario rechaza. Pero descartarla del todo pierde el anclaje al inmueble.

**Recomendación: `generateScene` (images/edits) con la foto de la propiedad como referencia**, NO text2image puro.

- **Por qué edit y no `generateBackground`:** gpt-image-2 en `/edits` con la foto como `image[]` conserva la **geometría y luz reales del inmueble** mientras reencuadra, limpia y estiliza a nivel editorial (composición cinematográfica, negative space para el copy, paleta premium). text2image inventaría una propiedad que no existe → engañoso y off-brand para captación.
- El patrón `FACIAL_LOCK` de `openai.ts:74` no aplica (no hay cara), pero la **estructura de `buildScenePrompt`** (secciones ESCENA/ENCUADRE/LUZ/PALETA/NEGATIVOS) sí se reutiliza tal cual, sustituyendo el bloque de identidad por un **`PROPERTY_LOCK`** análogo: "respetá la arquitectura/ambiente reales de la foto de referencia; no inventes ambientes que no aparecen".

> **Tradeoff.** `/edits` cuesta lo mismo que `/generations` a igual quality pero da resultados más fieles y con menos regeneraciones. El riesgo es que gpt-image-2 a veces "limpia de más"; se mitiga con quality tier y con el prompt (abajo).

### Nueva firma — `generateAdImage` reescrito sobre `lib/social/openai.ts`
`ad-image-generator.ts` conserva **su interfaz pública** (`generateAdImage(input): Promise<GeneratedAdImage|null>`, `FORMAT_DIMENSIONS`, el `sharp` de normalización) — el runner (`ad-image-async-runner.ts:314`) no cambia. Solo cambia el **motor interno**:

```ts
// ad-image-generator.ts — internals nuevos, MISMA firma pública
import { generateScene } from '@/lib/social/openai'

// Map formato Meta → size gpt-image-2 (ratios nativos, evita recorte de sharp)
const FORMAT_TO_OPENAI_SIZE: Record<AdFormat, '1024x1024'|'1024x1536'> = {
  feed_square:    '1024x1024',
  feed_vertical:  '1024x1536',   // 4:5 aprox — sharp 'contain' normaliza a 1080x1350
  story_vertical: '1024x1536',   // 9:16 — sharp normaliza a 1080x1920
}

export async function generateAdImage(input: GenerateInput): Promise<GeneratedAdImage | null> {
  if (!process.env.OPENAI_API_KEY) return null           // fallback runner sube foto cruda
  const basePhotoUrl = input.overridePhotoUrl
    ?? input.property.photos[input.highlight.photoIndex] ?? input.property.photos[0]
  if (!basePhotoUrl) return null

  // gpt-image-2 /edits necesita el archivo en disco (openai.ts lee readFileSync).
  // Descargar a tmp de Netlify (/tmp) — NO usar el bucket. Limpiar en finally.
  const refPath = await downloadToTmp(basePhotoUrl)      // helper nuevo, /tmp/<uuid>.png
  try {
    const prompt = buildAdImagePrompt({ ...input })       // §4 prompts, ver abajo
    const promptHash = hashString(prompt)
    const raw = await generateScene({
      prompt,
      referencePaths: [refPath],
      size: FORMAT_TO_OPENAI_SIZE[input.format],
      quality: pickQuality(input.property),               // §4 quality tier
    })
    // MISMA normalización sharp que hoy (contain + off-white), sin cambios:
    const finalBuffer = await normalizeToFormat(raw, input.format)
    return { format: input.format, buffer: finalBuffer, mimeType: 'image/jpeg', promptHash }
  } catch (err) { console.warn('[ad-image-gen] gpt-image-2 falló:', err); return null }
  finally { await rm(refPath, { force: true }) }
}
```

**Idempotencia:** intacta. El runner sigue contando piezas por `launch_job_id` (`ad-image-async-runner.ts:239-249`), calcula `startIdx` y skipea. El swap es solo del motor por pieza → una pieza ya persistida no se regenera. **No tocar el runner.**

**Upload a Meta `/adimages`:** intacto (`uploadToMeta`, runner:139) — recibe el `Buffer` igual que hoy.

### Prompts predeterminados (estructura, nivel mejor diseñador gráfico)
`ad-image-prompts.ts` `buildAdImagePrompt` se reescribe con la **estructura de secciones** de `buildScenePrompt`. Un prompt por (formato × estilo). Bloques fijos:

```
[ROL]        "Sos director de arte de una agencia premium. Pieza publicitaria para
              CAPTAR PROPIETARIOS que quieren vender su inmueble en {barrio}, CABA."
[PROPERTY_LOCK] "Base: la foto de referencia es {tipo} real en {barrio}. Respetá su
              arquitectura, luz y ambiente. NO inventes espacios que no aparecen. NO
              agregues muebles/personas inexistentes."
[ESTILO]     por CompositionStyle:
   split_photo_info   → "Composición dividida: 60% foto tratada editorial, 40% panel
                         sólido navy con jerarquía tipográfica limpia para el copy."
   editorial_magazine → "Estética revista de arquitectura: full-bleed, grano fino,
                         color grading cálido, mucho negative space arriba."
   color_overlay_solid→ "Overlay de color de marca (navy+verde) con degradé sutil,
                         foto de fondo desaturada 20%, foco en un solo mensaje."
[ENCUADRE]   por AdFormat: square/vertical/story → dónde va el negative space del copy.
[LUZ/PALETA] "Luz natural difusa, hora dorada suave. Paleta navy + neutros cálidos,
              acento verde. Look cinematográfico, sofisticado, alta conversión."
[MENSAJE]    "Ancla emocional para el PROPIETARIO: {hook del avatar}. Sensación de
              'tu propiedad merece venderse así de bien'."
[NEGATIVOS]  "Sin texto/letras/logos/watermark/bordes (el texto lo agrega el sistema
              aparte). Sin distorsión arquitectónica. Sin estética de portal inmobiliario."
```

> **Texto en la imagen.** Igual que la lección `USE_V2_PIPELINE` (satori), **el copy NO lo dibuja el modelo** — `NEGATIVOS` fuerza "sin letras" y el texto se compone determinístico (satori/overlay) encima. Elimina "Departamenton" por construcción y es agnóstico al motor de imagen. El swap a gpt-image-2 **refuerza** esta decisión: pedir imagen limpia + texto vectorial.

### Quality tier
```ts
function pickQuality(p: Property): 'low'|'medium'|'high' {
  // Default medium. 'high' solo para Alto Valor (evita que 27 piezas × high vacíen la billetera).
  const usd = p.currency === 'USD' ? p.asking_price : p.asking_price / (Number(process.env.USDARS_FALLBACK) || 1000)
  return usd >= 600_000 ? 'high' : 'medium'
}
```
Override por env `OPENAI_IMAGE_QUALITY` (ya existe en `openai.ts:15`) para bajar a `low` si Netlify timeout aprieta.

### ¿Reducir de 27 piezas? — **Sí, a 12.** Recomendación fuerte.
Análisis costo/beneficio:

| Config | Piezas | Costo/campaña (medium ~$0.04) | Ads reales usados |
|---|---|---|---|
| Hoy (Gemini) | 27 | ~$1.08 | máx 10 (confirm toma 10 `feed_square`) |
| gpt-image-2 27 | 27 | **~$1.20–1.35** | máx 10 |
| **gpt-image-2 12** | **12** | **~$0.48–0.60** | **10** |

El `confirm` solo consume **`feed_square`, hasta 10** (`confirm/route.ts:262`). De las 27, 18 son `feed_vertical`/`story_vertical` que **nunca se usan** para los Ads (el AdSet usa feed). Propuesta:

- **3 fotos × 2 estilos × 2 formatos = 12** (feed_square para los Ads + feed_vertical para placements que sí lo aprovechen), o incluso **feed_square-only: 3×3×1 = 9** si se acepta un solo placement.
- **Recomiendo 12** (`STYLE_TRIO`→2 estilos, `FORMAT_TRIO`→`['feed_square','feed_vertical']`): baja costo ~55%, mantiene variedad para A/B de los 10 Ads, y sube quality a `medium/high` sin culpa. `TOTAL_PIECES` pasa a `12`, `pieceCoordsAt` se ajusta (`formatIdx = idx % 2`, `styleIdx = Math.floor(idx/2) % 2`, `photoSourceIdx = Math.floor(idx/4)`). **Batch runner y su idempotencia no cambian** (siguen contando por `launch_job_id`).

> Tradeoff: menos piezas story/vertical para reels orgánicos. Aceptable — esas se pueden generar on-demand después con el mismo motor.

---

## 5. BUDGET-SAFETY (crítico — "un cero de más nos deja en la quiebra")

### El bug real (confirmado)
- El builder **ya soporta** el override: `meta-campaign-builder.ts:417` usa `overrides.dailyBudgetArs` si viene, y **una sola** conversión ×100 en `:664`.
- Pero `confirm/route.ts:272-278` arma `overrides` **sin `dailyBudgetArs`** → el budget del wizard se **ignora** y usa el auto-tier de `decideBudget`. Por eso lo que el asesor ve ≠ lo que corre.

### Fix mínimo + blindaje (defensa en capas)

**Capa A — cablear el budget (confirm/route.ts).** Leer `daily_budget_ars` del job y pasarlo con **validación de rango antes de mandarlo**:

```ts
// confirm/route.ts — antes de createCampaignForProperty
const MIN_ARS = Number(process.env.META_MIN_DAILY_ARS) || 3_000
const MAX_ARS = Number(process.env.META_MAX_DAILY_ARS) || 60_000   // techo duro anti-"cero de más"
const rawBudget = Number(job.daily_budget_ars)
if (!Number.isInteger(rawBudget) || rawBudget < MIN_ARS || rawBudget > MAX_ARS) {
  await markJobFailed(jobId, `Budget inválido: ${rawBudget} ARS (rango ${MIN_ARS}–${MAX_ARS})`)
  return NextResponse.json(
    { error: `Presupuesto fuera de rango (${MIN_ARS}–${MAX_ARS} ARS/día). Revisalo.`, code: 'BUDGET_OUT_OF_RANGE' },
    { status: 400 })
}
campaign = await createCampaignForProperty(property as never, {
  dryRun: true,
  overrides: {
    preGeneratedImageHashes,
    variantCount: Math.min(preGeneratedImageHashes.length, 10),
    dailyBudgetArs: rawBudget,      // ← EL FIX. Entero ARS, sin ×100 (el builder lo hace en :664).
  },
})
```

**Regla de oro (documentar en el código):** `daily_budget_ars` viaja como **entero ARS** en TODA la app; el `×100` a unidad mínima de Meta ocurre **exactamente una vez**, en `meta-campaign-builder.ts:664`. Prohibido multiplicar en otro lado. Comentario explícito en `save-input` y `confirm`.

**Capa B — validación en `save-input` (entrada).** Hoy `save-input:77-79` solo hace `Math.floor(>=0)`. Agregar el mismo rango:
```ts
if (typeof body.dailyBudgetArs === 'number') {
  const v = Math.floor(body.dailyBudgetArs)
  if (v < MIN_ARS || v > MAX_ARS) return NextResponse.json(
    { error: `Presupuesto fuera de rango (${MIN_ARS}–${MAX_ARS} ARS/día)`, code:'BUDGET_OUT_OF_RANGE' }, { status: 400 })
  update.daily_budget_ars = v
}
```

**Capa C — UI: confirmación explícita "vas a gastar $X/día = $Y/mes".**
En el step `budget` y de nuevo en `review_and_publish`, mostrar en grande con separador de miles es-AR:
```tsx
// mensual = daily × 30.4 (promedio Meta). Doble confirmación si >= umbral alto.
<p>Vas a gastar <strong>{fmtARS(dailyBudget)}/día</strong> ≈ <strong>{fmtARS(Math.round(dailyBudget*30.4))}/mes</strong></p>
{dailyBudget >= 30_000 && <Checkbox required>Confirmo este presupuesto alto</Checkbox>}
```
El botón "Confirmar y publicar" queda **disabled** hasta que el valor esté en rango y (si aplica) el checkbox marcado. Formateo con `Intl.NumberFormat('es-AR')` — un input que muestra `10.000` y manda `10000`.

**Capa D — input que hace imposible el "cero de más".**
Reemplazar el input libre por **presets + slider acotado a `[MIN_ARS, MAX_ARS]`** (los tiers de `budget-rules.ts` como chips: 5k/10k/15k/25k). Un `<input type=number>` con `max={MAX_ARS}` no alcanza (se puede pegar); el slider con `max` duro sí. Si se deja el number input, `onChange` clampa: `Math.min(MAX_ARS, Math.max(0, v))`.

**Capa E — garantía "lo que ve == lo que se manda": un smoke assert en dryRun.**
`createCampaignForProperty` ya devuelve `budgetDailyArs` (builder:837). Con `dryRun:true` el confirm puede **comparar antes de crear en vivo**:
```ts
if (campaign.budgetDailyArs !== rawBudget) {
  await markJobFailed(jobId, `Mismatch budget: job=${rawBudget} builder=${campaign.budgetDailyArs}`)
  return NextResponse.json({ error:'Inconsistencia de presupuesto — abortado por seguridad', code:'BUDGET_MISMATCH' }, { status:500 })
}
```
Esto es el cinturón + tirantes: si alguna vez se re-introduce un ×100 duplicado o un tier pisa el override, el confirm **aborta** en vez de gastar.

### Tests (los que garantizan el invariante)
- **Unit** (`budget-rules`/builder): `dailyBudgetArs: 10000` ⇒ body Meta `daily_budget === 1_000_000`. Un test que falla si alguien mete otro ×100.
- **Unit** save-input: `50_000` (sobre `MAX_ARS`) ⇒ 400 `BUDGET_OUT_OF_RANGE`.
- **Unit** confirm: job con `daily_budget_ars=null`/`0`/`100_000` ⇒ 400, **no** llama al builder.
- **Property test / assert**: `Math.round(dailyArs*100)` es la única multiplicación por 100 en el path (grep en CI: `grep -rn '\* 100' lib/marketing | wc -l` == 1).
- **E2E**: setear 10000 en el wizard → dryRun devuelve 1_000_000 → confirm real crea AdSet con `daily_budget:1000000`. (Meta test account; regla del CLAUDE.md: "test end-to-end real de creación de Campaign, no solo unit tests".)

---

## Migración consolidada (correr en Supabase Dashboard — CLI no conecta)

```sql
-- 20260724000001_meta_launch_phase2.sql
-- (property_landings vive en la migración de Fase 1; acá solo lo de Fase 2)

ALTER TABLE public.meta_launch_jobs
  ADD COLUMN IF NOT EXISTS wizard_step text
    CHECK (wizard_step IN (
      'confirm_data','avatar_select','photo_stars','geo','budget','review_and_publish')),
  ADD COLUMN IF NOT EXISTS avatar_source text
    CHECK (avatar_source IN ('landing','system','system_optimized','landing_optimized'));

-- Backfill jobs vivos para que resuman en avatar_select (comportamiento actual)
UPDATE public.meta_launch_jobs
   SET wizard_step = 'avatar_select'
 WHERE status = 'awaiting_user_input' AND wizard_step IS NULL;
```

Sin cambio de return type de funciones → no requiere `DROP FUNCTION`. Sin triggers nuevos sobre tablas mutables → no aplica la gotcha de FK-en-BEFORE. **Gate de deploy:** correr esta migración **antes** de deployar el código de §2/§3 (el `save-input` escribe `wizard_step`; sin la columna, PATCH falla).

---

## Resumen de archivos tocados (paths reales)

| Área | Archivo | Cambio |
|---|---|---|
| Gate | `app/api/properties/[id]/meta-launch-v2/start/route.ts:66-71` | 412-slug → 409 landing publicada |
| Gate | `app/(dashboard)/properties/[id]/marketing/meta-ads/page.tsx` | SELECT landing → props `hasPublishedLanding`, `landingAvatar` |
| Gate/Resume/Avatar | `components/properties/wizards/MetaAdsWizardV2.tsx` | step `landing_gate`; `goToStep()`+PATCH; `pollStatus` resume por `wizard_step`; `hydrateInputsFromJob`; 3 fuentes de avatar; UI budget |
| Resume/Budget | `app/api/properties/[id]/meta-launch-v2/[jobId]/save-input/route.ts` | persistir `wizardStep`; validar rango budget |
| Budget | `app/api/properties/[id]/meta-launch-v2/[jobId]/confirm/route.ts:272-278` | cablear `dailyBudgetArs` + rango + assert dryRun |
| Avatar | `lib/marketing/buyer-avatar-generator.ts:325` | preservar `empathyMap` en optimize |
| Imágenes | `lib/marketing/ad-image-generator.ts:98` | motor Gemini → `generateScene` (gpt-image-2) |
| Imágenes | `lib/marketing/ad-image-prompts.ts:129` | prompts estructura editorial + `NEGATIVOS: sin texto` |
| Imágenes | `lib/marketing/ad-image-async-runner.ts:56-85` | `TOTAL_PIECES` 27→12, `pieceCoordsAt` (idempotencia intacta) |
| Tipos | `lib/marketing/types/landing-avatar.ts` | nuevo `LandingAvatar`+`EmpathyMap` |
| Migración | `supabase/migrations/20260724000001_meta_launch_phase2.sql` | `wizard_step`, `avatar_source` |

**No se toca** (invariantes preservados): idempotencia del runner de imágenes; la única multiplicación ×100 en `meta-campaign-builder.ts:664`; el lock atómico de confirm; la recuperación de campañas zombi; `uploadToMeta`.

**Decisiones abiertas con recomendación:**
1. Avatar de landing: reusar `generated_avatars` jsonb (0 DDL) vs columna `landing_avatar` → **reusar jsonb**.
2. Piezas: 27→**12** (feed_square+feed_vertical, 2 estilos) → −55% costo, mismo output de Ads.
3. Motor imagen: **`generateScene`/edits** con foto real como referencia (no text2image) → fidelidad al inmueble para captación.
4. Quality: **medium** default, **high** solo ≥USD 600k.
5. Gate HTTP: **409 + `code:LANDING_REQUIRED`** (el front rutea por `code`, no por status).
