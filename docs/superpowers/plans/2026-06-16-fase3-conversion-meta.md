# Fase 3 — Conversión Meta (Pixel + CAPI con dedup + advanced matching) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar task-by-task. Steps usan checkbox (`- [ ]`).

**Goal:** Que cada conversión de las landings nativas llegue a Meta **una sola vez** (Pixel del navegador + CAPI server-side deduplicados por el mismo `event_id`) y con **máxima identificación** del prospecto (advanced matching), sin romper la conversión ni el tracking de propiedades.

**Architecture:** Las funnel pages montan un `FunnelMetaPixel` (client island) que inyecta el Pixel, dispara `PageView` (auto) + `ViewContent` (on-mount, con `content_name` del funnel) y expone `trackFunnelConversion(eventName, eventId)`. Al enviar el form, el client (1) lee `_fbp`/`_fbc`, los manda en el body, (2) tras el 200 dispara `trackFunnelConversion` con el `event_id` que ya generaba. El endpoint `/api/funnel/submit` (Fase 2) dispara **CAPI** (`Lead` para tasación / `CompleteRegistration` para clase) con **ese mismo `event_id`** + advanced matching (em/ph normalizado AR, fn/ln, ciudad, `external_id`=contact_id, fbp/fbc/IP/UA). Meta deduplica por `(event_id, event_name)`. Se valida con `test_event_code` en Events Manager (una sola fila deduplicada, EMQ ≥ 6).

**Tech Stack:** Next.js 16, React 19, TS, vitest. Reusa `lib/marketing/meta-capi.ts` (extendido) y el patrón de `components/landing/MetaPixel.tsx`. Sin deps nuevas, sin migración (el `event_id` ya se persiste en `funnel_lead_submissions`).

**Convenciones del repo (verificadas):**
- Commit author `Sujupar <redstyle50@gmail.com>` (config del repo ya correcta; igual usar `git -c ...`).
- `git add` de PATHS ESPECÍFICOS — NUNCA `git add -A`/`.` (hay WIP del usuario).
- Build local: usar `npx next build --webpack` para validar (Turbopack local crashea por el acento; el fallo preexistente de `@react-pdf/renderer` con webpack es AJENO). Gate real: tsc + eslint + tests + `next dev` smoke + validación en Events Manager.
- Pixel server-only inyectado como prop (patrón de `app/p/[slug]/page.tsx`: `const pixelId = process.env.META_PIXEL_ID ?? ''`).

**Hechos del recon (firmas reales que se usan):**
- `sendCapiEvent(input: SendCapiEventInput): Promise<CapiSendResult>` — `eventName: 'Lead'|'Contact'|'ViewContent'|'CompleteRegistration'`, `eventId`, `eventSourceUrl`, `userData: CapiUserData`, `customData?`, `testEventCode?`. Retorna `{ok,error}` (NO throw). v21.0. Timeout 3s.
- `CapiUserData`: `email,phone,firstName,lastName,city,countryCode(def 'ar'),fbp,fbc,clientIpAddress,clientUserAgent`. **NO tiene `externalId`** → se agrega en Task 1.
- Normalización phone ACTUAL: `sha256(phone.replace(/\D/g,''))` — **sin código país** → se mejora en Task 1.
- `MetaPixel.tsx`: inyecta fbevents.js (`Script afterInteractive`), valida `pixelId` con `/^\d+$/`, `trackLead({propertyId,eventId,...})` dispara `fbq('track','Lead',{...},{eventID})`, exporta `getMetaCookie('_fbp'|'_fbc')`.
- `/api/funnel/submit/route.ts` (Fase 2): ya recibe `eventId` + `eventSourceUrl`, ya tiene `name/email/phone/propertyLocation/tipoCliente` y `result.contactId/result.dealId`; ya extrae IP (`x-forwarded-for`). Hoy NO dispara CAPI ni recibe fbp/fbc.
- Funnel clients ya generan `eventId` (crypto.randomUUID) y lo mandan al endpoint; NO disparan Pixel hoy.

**Decisiones de diseño (Fase 3):**
- **Eventos:** tasación → `Lead`; clase → `CompleteRegistration`. `ViewContent` + `PageView` solo en el **Pixel** (browser); la **conversión** (`Lead`/`CompleteRegistration`) va Pixel **+** CAPI con `event_id` compartido (dedup). No mandamos ViewContent/PageView por CAPI (no aportan al objetivo y agregan ruido). Decisión consciente.
- **`FunnelMetaPixel` nuevo** (no se toca `MetaPixel.tsx` de propiedades).
- **`external_id`** = `sha256(contactId)` server-side (alto valor de match; lo agrega Task 1 a CAPI).
- **`city`** = `propertyLocation` (tasación) cuando exista.
- **Sin `value`/`currency`** (los funnels no tienen precio).
- **Normalización phone AR** mejorada (Task 1), conservadora: beneficia también a propiedades.

**Fuera de alcance (NO en Fase 3):** públicos por etapa (Fase 4), evento `Schedule` al agendar visita (Fase 4, server-side desde cambio de etapa), corte de dominio (Fase 5).

---

## File Structure

**Modificar:**
- `lib/marketing/meta-capi.ts` — normalización phone AR + soporte `externalId` (aditivo, no rompe properties).
- `app/api/funnel/submit/route.ts` — recibir `fbp/fbc`, disparar `sendCapiEvent` tras crear el lead.
- `app/(funnels)/tasacion-directa/page.tsx` + `app/(funnels)/vsl-clase-propietarios/page.tsx` — leer `META_PIXEL_ID`, pasar como prop.
- `app/(funnels)/tasacion-directa/TasacionClient.tsx` + `.../vsl-clase-propietarios/ClaseClient.tsx` — montar `FunnelMetaPixel`, leer `_fbp/_fbc`, mandarlos al endpoint, disparar conversión tras submit.

**Crear:**
- `lib/marketing/normalize-phone.ts` — normalizador AR puro (extraído para testear).
- `lib/marketing/normalize-phone.test.ts` — tests del normalizador.
- `components/funnel/FunnelMetaPixel.tsx` — Pixel client para funnels.

---

## Task 1: Normalización de teléfono AR + `externalId` en CAPI (TDD)

**Files:**
- Create: `lib/marketing/normalize-phone.ts`, `lib/marketing/normalize-phone.test.ts`
- Modify: `lib/marketing/meta-capi.ts`

- [ ] **Step 1: Test del normalizador (que falla)**

Create `lib/marketing/normalize-phone.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { normalizeArPhone } from './normalize-phone'

describe('normalizeArPhone', () => {
  it('celular CABA con +54 9 11 y separadores → 5491112345678', () => {
    expect(normalizeArPhone('+54 9 11 1234-5678')).toBe('5491112345678')
  })
  it('formato local 011 15-1234-5678 → 5491112345678', () => {
    expect(normalizeArPhone('011 15-1234-5678')).toBe('5491112345678')
  })
  it('ya normalizado 5491112345678 → se mantiene', () => {
    expect(normalizeArPhone('5491112345678')).toBe('5491112345678')
  })
  it('11 1234 5678 (sin país) → 54 + 9 + 1112345678', () => {
    expect(normalizeArPhone('11 1234 5678')).toBe('5491112345678')
  })
  it('vacío/sin dígitos → cadena vacía', () => {
    expect(normalizeArPhone('')).toBe('')
    expect(normalizeArPhone('abc')).toBe('')
  })
  it('número ya con país no-AR (ej 1 555...) → conserva dígitos, no fuerza 54', () => {
    expect(normalizeArPhone('+1 555 111 2222')).toBe('15551112222')
  })
})
```

- [ ] **Step 2: Correr → falla**

Run: `npm run test -- lib/marketing/normalize-phone.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar el normalizador**

Create `lib/marketing/normalize-phone.ts`:
```ts
/**
 * Normaliza un teléfono argentino al formato que Meta espera para hashear:
 * dígitos, con código de país 54 y (para móviles) el 9, sin '+', sin 0 inicial, sin 15.
 * Conservador: si ya tiene país (>=11 díg con prefijo conocido) o no parece AR, no fuerza 54.
 * Reglas AR: quitar 0 de área inicial y el 15 de móvil; anteponer 54 9 para móviles AR.
 */
export function normalizeArPhone(raw: string): string {
  let d = (raw ?? '').replace(/\D/g, '')
  if (!d) return ''
  // Ya viene con país 54
  if (d.startsWith('54')) {
    let rest = d.slice(2)
    if (rest.startsWith('0')) rest = rest.slice(1)
    // si quedó 9 + area + 15 + num, sacar el 15 intermedio no es trivial; caso común ya viene limpio
    if (!rest.startsWith('9')) rest = '9' + rest
    return '54' + rest
  }
  // Otro país explícito (heurística: empieza con 1/ + largo típico). No forzar AR.
  if (d.length >= 11 && (d.startsWith('1') || d.startsWith('34') || d.startsWith('55'))) {
    return d
  }
  // Formato local AR: quitar 0 inicial de área y 15 de móvil
  if (d.startsWith('0')) d = d.slice(1)
  // patrón "<area>15<numero>" → quitar el 15
  d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2')
  return '549' + d
}
```
> NOTA: heurística best-effort para AR. Cubre los formatos comunes (CABA 11). Si en el futuro entran muchos del interior con códigos de área largos, revisar los tests con casos reales.

- [ ] **Step 4: Correr → pasa**

Run: `npm run test -- lib/marketing/normalize-phone.test.ts`
Expected: PASS (6 tests). Ajustar la heurística si algún caso real no cuadra (documentar).

- [ ] **Step 5: Usar el normalizador + agregar `externalId` en meta-capi.ts**

En `lib/marketing/meta-capi.ts`:
1. Importar: `import { normalizeArPhone } from './normalize-phone'`.
2. En la función que hashea el phone, reemplazar `phone.replace(/\D/g, '')` por `normalizeArPhone(phone)`.
3. Extender `CapiUserData` con `externalId?: string | null`.
4. En el armado de `user_data`, si `externalId` está presente: `external_id: [sha256(externalId.trim().toLowerCase())]`.
Leer el archivo y aplicar EXACTAMENTE sobre las funciones reales (no inventar nombres). El gate es tsc + que el flujo de properties (`/api/leads`) siga compilando.

- [ ] **Step 6: Typecheck + tests existentes**

Run: `npx tsc --noEmit 2>&1 | grep -E 'meta-capi|normalize-phone' || echo "ok"` && `npm run test -- lib/marketing`
Expected: sin errores; tests verdes (si hay tests previos de meta-capi, deben seguir pasando).

- [ ] **Step 7: Commit**

```bash
git add lib/marketing/normalize-phone.ts lib/marketing/normalize-phone.test.ts lib/marketing/meta-capi.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(meta): normalización de teléfono AR (cód. país 54) + external_id en CAPI para mejor match"
```

---

## Task 2: `FunnelMetaPixel` (Pixel client para funnels)

**Files:**
- Create: `components/funnel/FunnelMetaPixel.tsx`

- [ ] **Step 1: Implementar el componente**

Create `components/funnel/FunnelMetaPixel.tsx`:
```tsx
'use client'

import { useEffect } from 'react'
import Script from 'next/script'

interface FunnelMetaPixelProps {
  pixelId: string
  contentName: string // 'Tasación Directa' | 'Clase Gratuita'
}

/** Pixel para landings de funnel: PageView (auto) + ViewContent (on-mount). */
export function FunnelMetaPixel({ pixelId, contentName }: FunnelMetaPixelProps) {
  const valid = /^\d+$/.test(pixelId)

  useEffect(() => {
    if (!valid || typeof window === 'undefined' || typeof window.fbq !== 'function') return
    window.fbq('track', 'ViewContent', {
      content_name: contentName,
      content_category: 'real_estate',
      content_type: 'lead_funnel',
    })
  }, [valid, contentName])

  if (!valid) return null

  return (
    <Script id="funnel-meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
      {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)}(window,document,'script',
      'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  )
}

/** Dispara la conversión del funnel con el MISMO event_id que el CAPI (dedup). */
export function trackFunnelConversion(input: {
  eventName: 'Lead' | 'CompleteRegistration'
  eventId: string
  contentName: string
}): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return
  window.fbq(
    'track',
    input.eventName,
    { content_name: input.contentName, content_category: 'real_estate', content_type: 'lead_funnel' },
    { eventID: input.eventId },
  )
}

/** Lee cookies de Meta (_fbp / _fbc) para advanced matching. */
export function getMetaCookie(name: '_fbp' | '_fbc'): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}
```
> Si `window.fbq` no está tipado globalmente, reutilizar la declaración global que ya usa `components/landing/MetaPixel.tsx` (revisar si exporta el `declare global`; si está local a ese archivo, agregar un `declare global { interface Window { fbq?: (...args: unknown[]) => void } }` en este archivo).

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E 'FunnelMetaPixel' || echo "ok"` && `npx eslint components/funnel/FunnelMetaPixel.tsx`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/funnel/FunnelMetaPixel.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): FunnelMetaPixel (PageView + ViewContent + trackFunnelConversion con event_id)"
```

---

## Task 3: CAPI server-side en `/api/funnel/submit`

**Files:**
- Modify: `app/api/funnel/submit/route.ts`

- [ ] **Step 1: Recibir fbp/fbc + disparar CAPI tras crear el lead**

En `app/api/funnel/submit/route.ts`:
1. Extender el `Schema` zod con: `fbp: z.string().max(200).nullable().optional()`, `fbc: z.string().max(300).nullable().optional()`.
2. Tras el `createFunnelLead` exitoso (y antes o en paralelo al insert de `funnel_lead_submissions`), disparar el CAPI. Agregar:
```ts
// --- CAPI (Fase 3): conversión server-side con el MISMO event_id que el Pixel ---
const eventName = d.funnel === 'clase' ? 'CompleteRegistration' : 'Lead'
const contentName = d.funnel === 'clase' ? 'Clase Gratuita' : 'Tasación Directa'
if (d.eventId) {
  const [firstName, ...rest] = d.name.trim().split(/\s+/)
  const userAgent = req.headers.get('user-agent')
  try {
    const { sendCapiEvent } = await import('@/lib/marketing/meta-capi')
    const capi = await sendCapiEvent({
      eventName,
      eventId: d.eventId,
      eventSourceUrl: d.eventSourceUrl ?? `https://inmodf.com.ar/${d.funnel === 'clase' ? 'vsl-clase-propietarios' : 'tasacion-directa'}`,
      userData: {
        email: d.email ?? null,
        phone: d.phone ?? null,
        firstName: firstName ?? null,
        lastName: rest.join(' ') || null,
        city: d.funnel === 'tasacion' ? (d.propertyLocation ?? null) : null,
        countryCode: 'ar',
        externalId: result.contactId, // alto valor de match (hasheado en meta-capi)
        fbp: d.fbp ?? null,
        fbc: d.fbc ?? null,
        clientIpAddress: ip === 'unknown' ? null : ip,
        clientUserAgent: userAgent,
      },
      customData: { contentName },
      testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
    })
    if (!capi.ok) console.warn('[funnel/submit capi] failed', capi.error, capi.fbtraceId)
  } catch (e) {
    console.warn('[funnel/submit capi] threw', e)
  }
}
```
> IMPORTANTE: el CAPI NUNCA debe romper la respuesta del lead (try/catch + sendCapiEvent ya retorna {ok,error}). El `customData` debe matchear el tipo `CapiCustomData` real (leer meta-capi.ts; si `contentName` no es un campo válido, usar el campo correcto o omitir customData). Ajustar a la firma real.

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit 2>&1 | grep -E 'funnel/submit' || echo "ok"` && `npx eslint app/api/funnel/submit/route.ts`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/funnel/submit/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): CAPI server-side en /api/funnel/submit (Lead/CompleteRegistration + advanced matching + dedup event_id)"
```

---

## Task 4: Montar el Pixel + disparar la conversión en las funnel pages

**Files:**
- Modify: `app/(funnels)/tasacion-directa/page.tsx`, `app/(funnels)/tasacion-directa/TasacionClient.tsx`
- Modify: `app/(funnels)/vsl-clase-propietarios/page.tsx`, `app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx`

- [ ] **Step 1: Server pages pasan pixelId**

En `app/(funnels)/tasacion-directa/page.tsx`: leer `const pixelId = process.env.META_PIXEL_ID ?? ''` y pasar `pixelId={pixelId}` a `<TasacionClient ... />`. Idem `vsl-clase-propietarios/page.tsx` → `<ClaseClient pixelId={pixelId} ... />`.

- [ ] **Step 2: TasacionClient monta el pixel + dispara conversión + manda fbp/fbc**

En `app/(funnels)/tasacion-directa/TasacionClient.tsx`:
1. Agregar `pixelId: string` a las props del componente.
2. Importar `{ FunnelMetaPixel, trackFunnelConversion, getMetaCookie }` de `@/components/funnel/FunnelMetaPixel`.
3. Renderizar `<FunnelMetaPixel pixelId={pixelId} contentName="Tasación Directa" />` dentro del `<main>` (arriba).
4. En `handleSubmit`, antes del fetch agregar `const fbp = getMetaCookie('_fbp'); const fbc = getMetaCookie('_fbc')` y sumarlos al body (`fbp, fbc`). Tras el 200 (antes del redirect) disparar:
```ts
trackFunnelConversion({ eventName: 'Lead', eventId, contentName: 'Tasación Directa' })
```
(El redirect a `/gracias-tasacion` puede demorarse mínimamente o hacerse igual; el `fbq` es sincrónico-encolado, dispararlo antes del `window.location.href` está bien.)

- [ ] **Step 3: ClaseClient idem (CompleteRegistration)**

En `ClaseClient.tsx`: mismo patrón con `contentName="Clase Gratuita"` y `trackFunnelConversion({ eventName: 'CompleteRegistration', eventId, contentName: 'Clase Gratuita' })`.

- [ ] **Step 4: Typecheck + lint + tests**

Run: `npx tsc --noEmit 2>&1 | grep -E 'funnels' || echo "ok"` && `npx eslint "app/(funnels)" components/funnel` && `npm run test -- lib/funnel components/funnel`
Expected: sin errores; tests verdes.

- [ ] **Step 5: Commit**

```bash
git add "app/(funnels)/tasacion-directa" "app/(funnels)/vsl-clase-propietarios"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): montar Pixel + disparar Lead/CompleteRegistration con event_id compartido (dedup Pixel+CAPI)"
```

---

## Task 5: Verificación + validación de deduplicación (Events Manager)

- [ ] **Step 1: Tests + lint + tsc + build**

Run:
```bash
npm run test -- lib/marketing lib/funnel components/funnel
npx eslint "app/(funnels)" components/funnel lib/marketing app/api/funnel
npx tsc --noEmit | grep -E 'error TS' | head || echo "tsc limpio"
npx next build --webpack 2>&1 | tail -15   # único error aceptable: @react-pdf/renderer (ajeno)
```
Expected: tests verdes, lint 0 errores, tsc limpio (salvo nada nuevo), build sin errores de funnel/meta.

- [ ] **Step 2: Smoke de dedup con `test_event_code` (requiere acción del usuario)**

PRE: el usuario setea `META_TEST_EVENT_CODE` (de Events Manager → dataset → "Probar eventos") en `.env.local` (local) y/o Netlify, y activa `test_mode` de email para no notificar al equipo (igual que Fase 2).

Local: `PORT=3102 npm run dev` (bg). Abrir `http://localhost:3102/tasacion-directa` en un navegador con el inspector de Events del Pixel Helper, enviar un lead de prueba. En Events Manager → Test Events confirmar:
- Aparece **`Lead`** (tasación) o **`CompleteRegistration`** (clase) **UNA sola vez**, marcado **"Deduplicated"** (Browser + Server con el mismo `event_id`), NO dos filas.
- El evento muestra **EMQ** y los parámetros de match (em, ph, fn, ln, ct, external_id, fbp, fbc) presentes.

Verificar en la DB que el `event_id` quedó persistido en `funnel_lead_submissions` y coincide con el de Events Manager.

- [ ] **Step 3: Limpiar lead de prueba + restaurar test_mode + quitar test_event_code de prod**

Borrar el lead de prueba (filtrado por su email/contact_id, como Fase 2). Restaurar `test_mode` email a OFF. **Quitar `META_TEST_EVENT_CODE` de producción** (Netlify) — con el code seteado, los eventos reales se marcan como test y NO optimizan. (En local puede quedar para futuras pruebas.)

- [ ] **Step 4: Commit final (si hubo ajustes)**

```bash
git add -A -- lib/marketing lib/funnel components/funnel app/api/funnel "app/(funnels)"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "chore(funnel): Fase 3 verification pass" || echo "nada que commitear"
```

---

## Self-Review

**Spec coverage (§6 del spec maestro):**
- Un solo pixel (589579724932979 = META_PIXEL_ID) inyectado server-side → Task 4. ✅
- Pixel: PageView + ViewContent + Lead/CompleteRegistration → Tasks 2/4. ✅
- CAPI inline con MISMO event_id (dedup) → Task 3. ✅
- Advanced matching (em, ph normalizado AR, fn/ln, city, external_id, fbp/fbc/IP/UA) → Tasks 1/3. ✅
- Casing canónico de eventos (Lead, CompleteRegistration, ViewContent, PageView) → exacto. ✅
- Validación con test_event_code (una fila deduplicada, EMQ) → Task 5. ✅
- `event_id` persistido (Fase 2) reutilizado → Task 3. ✅
- No rompe el tracking de properties (meta-capi extendido aditivamente; MetaPixel.tsx intacto) → Tasks 1/2. ✅

**Decisión documentada:** ViewContent/PageView solo Pixel (no CAPI); la conversión sí Pixel+CAPI.

**Placeholder scan:** sin TBD. La heurística de phone AR está marcada como best-effort con tests.

**Type consistency:** `CapiUserData.externalId` (Task 1) usado en Task 3. `trackFunnelConversion`/`FunnelMetaPixel` (Task 2) usados en Task 4. `eventName` 'Lead'|'CompleteRegistration' consistente client+server.

**Riesgo a vigilar:** (1) `customData` debe matchear `CapiCustomData` real (leer meta-capi). (2) la global `Window.fbq` puede necesitar declaración. (3) cambiar `hashPhone` afecta properties — es mejora, verificar que sus tests (si hay) siguen verdes.

---

## Prerrequisitos del usuario
- [ ] `META_TEST_EVENT_CODE` (de Events Manager → dataset → "Probar eventos") para validar el dedup (Task 5). Quitarlo de prod tras validar.
- [ ] Confirmar que `META_ACCESS_TOKEN` (ya usado por el CAPI de properties) tiene permiso sobre el dataset/pixel 589579724932979. (Si las conversiones de properties llegan, está OK.)
- [ ] Para el smoke: activar `test_mode` de email (como Fase 2) antes de enviar el lead de prueba.

## Notas para Fase 4
- El `event_id` y el `external_id` (contact_id) ya viajan a Meta. Fase 4 (públicos por etapa) reutilizará el contact_id/hashing para los Custom Audiences y podrá disparar `Schedule` (CAPI server-side) cuando el deal pase a `scheduled`.
