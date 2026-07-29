# Flujo video recorrido → WhatsApp → agenda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un visitante que se registra en la landing reciba el recorrido de la propiedad (video recorrido o tour 3D) por un link corto propio con su hash, y pueda proponer día y hora de visita sin volver a cargar sus datos.

**Architecture:** Al crear el lead se genera un token opaco (`lead_access_tokens`) que congela nombre/email/teléfono. El token abre `/v/[token]`: página pública con la media elegida por el asesor (`properties.deliver_media`) y un formulario de agenda que ya conoce a la persona. Al proponer horario se inserta una `property_visits` con estado `pending_confirmation` y se notifica al asesor, coordinador y CC de supervisión. El envío por WhatsApp (Fase 3B) reusa el cliente Cloud API existente, extendido para botones URL.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, Supabase (Postgres + service-role), Vitest, Resend (email), WhatsApp Cloud API.

## Global Constraints

- **Autor de commits:** `Sujupar <redstyle50@gmail.com>` o el deploy de Netlify falla. Usar `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit ...` con trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Rama:** `main` (el repo trabaja directo sobre main; Netlify auto-deploya en cada push).
- **Idioma de TODO el texto visible al cliente:** español rioplatense (voseo). Usar `RIOPLATENSE_STYLE` de `lib/copy/rioplatense.ts` en cualquier prompt de IA nuevo; los textos fijos deben pasar `findRioplatenseIssues(texto) === []`.
- **Turbopack está roto localmente** (acento en el path): NUNCA validar con `next build`/`next dev`. Typecheck con un tsconfig aislado creado en la RAÍZ (`extends: "./tsconfig.json"` + `include` acotado) y borrarlo después. Los tests de COMPONENTE (happy-dom) NO arrancan en este host (falla también con los preexistentes) → verificar UI con probes `renderToStaticMarkup` en `scripts/*.probe.tsx`, como `scripts/landing-gallery-lock.probe.tsx`.
- **Tests:** Vitest. `npm test -- <ruta>`. Colocados `*.test.ts` junto al módulo.
- **Migraciones:** la CLI de Supabase NO conecta. Se aplican por session pooler pg (`aws-0-us-west-2.pooler.supabase.com:5432`, user `postgres.mncsnastmcjdjxrehdep`, password en `SUPABASE_DB_PASSWORD`, `npm i --no-save pg`), patrón `scripts/apply-*-migration-pg.ts`. **Verificar SIEMPRE contra la API REST después** (hay más de un proyecto en el Dashboard). El proyecto correcto es `mncsnastmcjdjxrehdep`.
- **NO aplicar migraciones a producción sin OK explícito del usuario** — dejar el script listo y avisar.
- **Cliente Supabase en rutas públicas** (`/v/[token]`, `/api/v/...`): service-role (`createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`), NUNCA el cliente por cookies — no hay sesión. Patrón: `app/api/leads/route.ts`.
- **Notificaciones best-effort:** nunca hacer fallar una operación de negocio por un fallo de email/WhatsApp.

## Estructura de archivos

**Crear:**
- `supabase/migrations/20260728000001_video_recorrido_y_access_tokens.sql` — columnas + tabla + CHECK
- `scripts/apply-video-recorrido-migration-pg.ts` — aplicador (NO ejecutar sin OK)
- `lib/leads/access-token.ts` — generar/crear/leer tokens
- `lib/leads/access-token.test.ts`
- `lib/properties/deliver-media.ts` — decidir qué media entregar (puro)
- `lib/properties/deliver-media.test.ts`
- `app/v/[token]/page.tsx` — página pública del recorrido
- `app/v/[token]/ScheduleVisitForm.tsx` — formulario de agenda (client)
- `app/api/v/[token]/schedule/route.ts` — POST proponer visita
- `lib/email/notifications/visit-proposed.ts` — aviso al equipo
- `scripts/landing-access-token.probe.tsx` — probe de la página `/v/[token]`

**Modificar:**
- `types/database.types.ts` — columnas nuevas de `properties`
- `app/api/leads/route.ts` — crear el token tras el lead y devolver `accessUrl`
- `components/landing/LeadCaptureProvider.tsx` — mensaje de gracias con el link
- `components/properties/PropertyMediaCard.tsx` — campo "Video recorrido"
- `app/api/properties/[id]/media/route.ts` — aceptar `video_recorrido_url`
- `components/properties/LandingSection.tsx` — elegir qué entregar
- `app/api/properties/[id]/landing/route.ts` — persistir `deliver_media`
- `lib/integrations/whatsapp/core.ts` — soporte de botón URL (Fase 3B)

---

## FASE 3A — El flujo completo sin depender de Meta

### Task 1: Migración (columnas + tabla de tokens + estado de visita)

**Files:**
- Create: `supabase/migrations/20260728000001_video_recorrido_y_access_tokens.sql`
- Create: `scripts/apply-video-recorrido-migration-pg.ts`
- Modify: `types/database.types.ts` (bloque `properties`: Row/Insert/Update)

**Interfaces:**
- Produces: `properties.video_recorrido_url`, `properties.deliver_media`; tabla `lead_access_tokens`; `property_visits.status` acepta `'pending_confirmation'`.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260728000001_video_recorrido_y_access_tokens.sql`:
```sql
-- 1. Media nueva: el VIDEO RECORRIDO (distinto de video_url/video_file_url/tour_3d_url)
--    y qué se le entrega al cliente registrado.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS video_recorrido_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deliver_media TEXT;

COMMENT ON COLUMN properties.video_recorrido_url IS 'Video que recorre la propiedad por dentro. Se le ENTREGA al cliente que se registra (no va en la landing pública). Enlace externo o URL de Storage.';
COMMENT ON COLUMN properties.deliver_media IS 'Qué se entrega al cliente registrado: video_recorrido | tour_3d. Lo elige el asesor al crear la landing.';

-- 2. Token de acceso por persona ("el hash"): abre el recorrido y prellena la agenda.
CREATE TABLE IF NOT EXISTS lead_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT NOT NULL UNIQUE,
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES property_leads(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at    TIMESTAMPTZ,
  open_count   INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS lead_access_tokens_property_idx ON lead_access_tokens (property_id);

-- RLS: la tabla se lee/escribe SOLO con service-role desde rutas públicas.
ALTER TABLE lead_access_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lead_access_tokens_staff_read ON lead_access_tokens;
CREATE POLICY lead_access_tokens_staff_read ON lead_access_tokens
  FOR SELECT TO authenticated USING (true);

-- 3. Estado nuevo de visita: propuesta por el cliente, a confirmar por el equipo.
--    OJO: hay que RECREAR el CHECK — agregar un valor sin esto rompe con 23514.
ALTER TABLE property_visits DROP CONSTRAINT IF EXISTS property_visits_status_check;
ALTER TABLE property_visits ADD CONSTRAINT property_visits_status_check
  CHECK (status IN ('pending_confirmation','scheduled','completed','no_show','cancelled'));
```

- [ ] **Step 2: Escribir el aplicador (NO ejecutarlo)**

Create `scripts/apply-video-recorrido-migration-pg.ts` copiando el patrón de un `scripts/apply-*-migration-pg.ts` existente (leerlo primero): conecta por session pooler, ejecuta el SQL del archivo de migración y al final verifica con
`SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name IN ('video_recorrido_url','deliver_media')`
y `SELECT to_regclass('public.lead_access_tokens')`.
**No correr el script**: la aplicación a producción la autoriza el usuario.

- [ ] **Step 3: Actualizar los tipos**

En `types/database.types.ts`, bloque `properties`, agregar en Row (`string | null`) y en Insert/Update (`?: string | null`), después de `geocoded_at` si existe o al final del bloque:
```ts
                    video_recorrido_url: string | null
                    deliver_media: string | null
```

- [ ] **Step 4: Typecheck**

```bash
cat > tsconfig.t1.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["types/database.types.ts","lib/portals/types.ts"] }
EOF
npx tsc --noEmit -p tsconfig.t1.json; rm -f tsconfig.t1.json tsconfig.t1.tsbuildinfo
```
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260728000001_video_recorrido_y_access_tokens.sql scripts/apply-video-recorrido-migration-pg.ts types/database.types.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(db): video recorrido + tokens de acceso + estado pending_confirmation

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Módulo de tokens de acceso

**Files:**
- Create: `lib/leads/access-token.ts`
- Test: `lib/leads/access-token.test.ts`

**Interfaces:**
- Produces:
```ts
export function generateAccessToken(): string            // 10 chars base62
export interface AccessTokenRow {
  token: string; propertyId: string; name: string
  email: string | null; phone: string | null
}
export async function createAccessToken(input: {
  propertyId: string; leadId: string | null; name: string
  email: string | null; phone: string | null
}): Promise<string | null>                               // devuelve el token; null si falla
export async function getAccessToken(token: string): Promise<AccessTokenRow | null>
export async function markTokenOpened(token: string): Promise<void>
export function accessUrl(token: string): string         // https://inmodf.com.ar/v/<token>
```

- [ ] **Step 1: Escribir el test fallido**

Create `lib/leads/access-token.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { generateAccessToken, accessUrl } from './access-token'

describe('generateAccessToken', () => {
  it('devuelve 10 caracteres base62', () => {
    const t = generateAccessToken()
    expect(t).toHaveLength(10)
    expect(t).toMatch(/^[0-9A-Za-z]{10}$/)
  })

  it('no repite en 5000 generaciones (colisión práctica ~0)', () => {
    const set = new Set(Array.from({ length: 5000 }, () => generateAccessToken()))
    expect(set.size).toBe(5000)
  })

  it('no usa caracteres ambiguos para dictar por teléfono', () => {
    // Se excluyen O/0/I/l/1 para que el link sea legible si alguien lo copia a mano.
    const muestras = Array.from({ length: 500 }, () => generateAccessToken()).join('')
    expect(muestras).not.toMatch(/[O0Il1]/)
  })
})

describe('accessUrl', () => {
  it('arma la URL corta sobre el dominio propio', () => {
    expect(accessUrl('abc123XYZ9')).toMatch(/\/v\/abc123XYZ9$/)
    expect(accessUrl('abc123XYZ9').startsWith('http')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `npm test -- lib/leads/access-token.test.ts`
Expected: FAIL con "Failed to resolve import './access-token'".

- [ ] **Step 3: Implementar el módulo**

Create `lib/leads/access-token.ts`:
```ts
/**
 * Token de acceso por persona ("el hash" del flujo de recorrido).
 *
 * Abre `/v/<token>`: muestra el recorrido de la propiedad y permite proponer
 * día y hora SIN volver a pedir los datos (quedan congelados acá al registrarse).
 *
 * No es un mecanismo de seguridad fuerte: expone la media de UNA propiedad y un
 * nombre. Es opaco y no adivinable a la escala de este negocio.
 */
import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'node:crypto'

/** Sin O/0/I/l/1: el link se dicta y se copia a mano. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const TOKEN_LENGTH = 10

export function generateAccessToken(): string {
  let out = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

export function accessUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'
  return `${base.replace(/\/+$/, '')}/v/${token}`
}

export interface AccessTokenRow {
  token: string
  propertyId: string
  name: string
  email: string | null
  phone: string | null
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Crea el token. NUNCA lanza: si falla, el lead ya se guardó igual. */
export async function createAccessToken(input: {
  propertyId: string
  leadId: string | null
  name: string
  email: string | null
  phone: string | null
}): Promise<string | null> {
  try {
    const token = generateAccessToken()
    const { error } = await admin().from('lead_access_tokens').insert({
      token,
      property_id: input.propertyId,
      lead_id: input.leadId,
      name: input.name,
      email: input.email,
      phone: input.phone,
    })
    if (error) {
      console.warn('[access-token] no se pudo crear (continuando):', error.message)
      return null
    }
    return token
  } catch (err) {
    console.warn('[access-token] excepción creando (continuando):', err)
    return null
  }
}

export async function getAccessToken(token: string): Promise<AccessTokenRow | null> {
  try {
    const { data } = await admin()
      .from('lead_access_tokens')
      .select('token, property_id, name, email, phone')
      .eq('token', token)
      .maybeSingle()
    if (!data) return null
    const r = data as { token: string; property_id: string; name: string; email: string | null; phone: string | null }
    return { token: r.token, propertyId: r.property_id, name: r.name, email: r.email, phone: r.phone }
  } catch {
    return null
  }
}

/** Marca la 1ª apertura y suma al contador (medición). Best-effort. */
export async function markTokenOpened(token: string): Promise<void> {
  try {
    const sb = admin()
    const { data } = await sb
      .from('lead_access_tokens')
      .select('opened_at, open_count')
      .eq('token', token)
      .maybeSingle()
    const row = data as { opened_at: string | null; open_count: number } | null
    if (!row) return
    await sb
      .from('lead_access_tokens')
      .update({
        opened_at: row.opened_at ?? new Date().toISOString(),
        open_count: (row.open_count ?? 0) + 1,
      })
      .eq('token', token)
  } catch {
    /* medición: nunca romper la página por esto */
  }
}
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npm test -- lib/leads/access-token.test.ts`
Expected: PASS (4 casos).

- [ ] **Step 5: Commit**

```bash
git add lib/leads/access-token.ts lib/leads/access-token.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(leads): tokens de acceso al recorrido

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Decidir qué media se entrega

**Files:**
- Create: `lib/properties/deliver-media.ts`
- Test: `lib/properties/deliver-media.test.ts`

**Interfaces:**
- Produces:
```ts
export type DeliverKind = 'video_recorrido' | 'tour_3d' | 'fotos'
export interface DeliverMedia { kind: DeliverKind; url: string | null }
export function resolveDeliverMedia(p: {
  video_recorrido_url?: string | null
  tour_3d_url?: string | null
  deliver_media?: string | null
}): DeliverMedia
export function needsDeliveryChoice(p: {
  video_recorrido_url?: string | null
  tour_3d_url?: string | null
}): boolean
```

- [ ] **Step 1: Escribir el test fallido**

Create `lib/properties/deliver-media.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { resolveDeliverMedia, needsDeliveryChoice } from './deliver-media'

const VID = 'https://youtu.be/abc'
const TOUR = 'https://tour.example/123'

describe('resolveDeliverMedia', () => {
  it('respeta la elección del asesor cuando hay ambos', () => {
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: TOUR, deliver_media: 'tour_3d' }))
      .toEqual({ kind: 'tour_3d', url: TOUR })
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: TOUR, deliver_media: 'video_recorrido' }))
      .toEqual({ kind: 'video_recorrido', url: VID })
  })

  it('sin elección y con ambos, prefiere el video recorrido', () => {
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: TOUR }))
      .toEqual({ kind: 'video_recorrido', url: VID })
  })

  it('usa el único disponible aunque la elección diga otra cosa', () => {
    // El asesor eligió tour pero después se borró el tour: no puede quedar vacío.
    expect(resolveDeliverMedia({ video_recorrido_url: VID, tour_3d_url: null, deliver_media: 'tour_3d' }))
      .toEqual({ kind: 'video_recorrido', url: VID })
    expect(resolveDeliverMedia({ video_recorrido_url: null, tour_3d_url: TOUR, deliver_media: 'video_recorrido' }))
      .toEqual({ kind: 'tour_3d', url: TOUR })
  })

  it('sin nada, cae a las fotos', () => {
    expect(resolveDeliverMedia({})).toEqual({ kind: 'fotos', url: null })
  })
})

describe('needsDeliveryChoice', () => {
  it('solo pregunta si hay ambos', () => {
    expect(needsDeliveryChoice({ video_recorrido_url: VID, tour_3d_url: TOUR })).toBe(true)
    expect(needsDeliveryChoice({ video_recorrido_url: VID })).toBe(false)
    expect(needsDeliveryChoice({ tour_3d_url: TOUR })).toBe(false)
    expect(needsDeliveryChoice({})).toBe(false)
  })
})
```

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `npm test -- lib/properties/deliver-media.test.ts`
Expected: FAIL con "Failed to resolve import './deliver-media'".

- [ ] **Step 3: Implementar**

Create `lib/properties/deliver-media.ts`:
```ts
/**
 * Qué se le ENTREGA al cliente que se registra en la landing.
 *
 * Tres cosas distintas conviven en la propiedad:
 *  - `video_url` / `video_file_url`: el video que se ve en la landing pública.
 *  - `tour_3d_url`: recorrido virtual navegable (iframe).
 *  - `video_recorrido_url`: video que recorre la propiedad por dentro.
 * Los dos últimos son los "entregables". Si están los dos, elige el asesor
 * (`deliver_media`); si hay uno solo, se usa ese; si no hay ninguno, se entregan
 * las fotos completas (el flujo NUNCA se rompe por falta de media).
 */
export type DeliverKind = 'video_recorrido' | 'tour_3d' | 'fotos'

export interface DeliverMedia {
  kind: DeliverKind
  url: string | null
}

interface MediaFields {
  video_recorrido_url?: string | null
  tour_3d_url?: string | null
  deliver_media?: string | null
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

export function resolveDeliverMedia(p: MediaFields): DeliverMedia {
  const video = clean(p.video_recorrido_url)
  const tour = clean(p.tour_3d_url)
  if (video && tour) {
    // Con ambos manda la elección del asesor; sin elección, el video recorrido.
    return p.deliver_media === 'tour_3d'
      ? { kind: 'tour_3d', url: tour }
      : { kind: 'video_recorrido', url: video }
  }
  if (video) return { kind: 'video_recorrido', url: video }
  if (tour) return { kind: 'tour_3d', url: tour }
  return { kind: 'fotos', url: null }
}

/** Solo hay que preguntarle al asesor cuando la propiedad tiene LAS DOS. */
export function needsDeliveryChoice(p: MediaFields): boolean {
  return Boolean(clean(p.video_recorrido_url) && clean(p.tour_3d_url))
}
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npm test -- lib/properties/deliver-media.test.ts`
Expected: PASS (6 casos).

- [ ] **Step 5: Commit**

```bash
git add lib/properties/deliver-media.ts lib/properties/deliver-media.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): resolución de la media que se entrega al cliente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Crear el token al capturar el lead

**Files:**
- Modify: `app/api/leads/route.ts` (tras el insert de `property_leads`, ~línea 250; y el `return` final ~línea 309)
- Modify: `components/landing/LeadCaptureProvider.tsx` (estado de éxito)

**Interfaces:**
- Consumes: `createAccessToken`, `accessUrl` (Task 2).
- Produces: `POST /api/leads` devuelve `{ ok: true, id, accessUrl?: string }`. El popup muestra el link.

- [ ] **Step 1: Crear el token en la ruta**

En `app/api/leads/route.ts`, agregar el import arriba:
```ts
import { createAccessToken, accessUrl } from '@/lib/leads/access-token'
```
Después del bloque `if (insErr || !lead) { ... }` (tras el insert exitoso) y ANTES de `notifyAdvisorAsync`, agregar:
```ts
    // Token de acceso al recorrido: congela los datos de esta persona para que
    // después pueda ver la propiedad por dentro y agendar SIN volver a cargarlos.
    // Best-effort: si falla, el lead ya está guardado y el flujo sigue.
    const token = await createAccessToken({
      propertyId: prop.id,
      leadId: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
    })
```

- [ ] **Step 2: Devolver el link**

Reemplazar `return NextResponse.json({ ok: true, id: lead.id })` por:
```ts
    return NextResponse.json({
      ok: true,
      id: lead.id,
      ...(token ? { accessUrl: accessUrl(token) } : {}),
    })
```

- [ ] **Step 3: Mostrar el link en la pantalla de gracias**

En `components/landing/LeadCaptureProvider.tsx`:

(a) Agregar el estado, junto a los otros `useState`:
```ts
  const [accessUrl, setAccessUrl] = useState<string | null>(null)
```

(b) En `submit`, donde hoy dice `const { error } = await res.json().catch(...)`, cambiar el manejo para leer el body en éxito. Reemplazar el bloque:
```ts
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Error' }))
        throw new Error(error || 'No pudimos enviar tus datos')
      }
```
por:
```ts
      const payload = (await res.json().catch(() => ({}))) as { error?: string; accessUrl?: string }
      if (!res.ok) throw new Error(payload.error || 'No pudimos enviar tus datos')
      setAccessUrl(payload.accessUrl ?? null)
```

(c) En el bloque `status === 'ok'`, reemplazar el `<p>` del subtítulo por:
```tsx
                <p className="text-sm text-slate-500">
                  {accessUrl
                    ? 'Te mandamos por WhatsApp el recorrido de la propiedad para que la conozcas por dentro. También podés verlo acá:'
                    : source === GALLERY_LOCK_SOURCE
                      ? 'Cerrá esta ventana y recorré todas las fotos. Un asesor te contacta para coordinar la visita.'
                      : 'Un asesor te va a contactar muy pronto.'}
                </p>
                {accessUrl && (
                  <a
                    href={accessUrl}
                    className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-medium text-white"
                  >
                    Ver el recorrido
                  </a>
                )}
```

- [ ] **Step 4: Typecheck**

```bash
cat > tsconfig.t4.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["app/api/leads/route.ts","components/landing/LeadCaptureProvider.tsx","lib/leads/access-token.ts","types/database.types.ts"] }
EOF
npx tsc --noEmit -p tsconfig.t4.json; rm -f tsconfig.t4.json tsconfig.t4.tsbuildinfo
```
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/api/leads/route.ts components/landing/LeadCaptureProvider.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(leads): crear token de recorrido al registrarse y mostrarlo al agradecer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Página pública del recorrido `/v/[token]`

**Files:**
- Create: `app/v/[token]/page.tsx`
- Create: `app/v/[token]/ScheduleVisitForm.tsx`
- Create: `scripts/landing-access-token.probe.tsx`

**Interfaces:**
- Consumes: `getAccessToken`, `markTokenOpened` (Task 2); `resolveDeliverMedia` (Task 3).
- Produces: la página renderiza el recorrido y monta `<ScheduleVisitForm token={...} propertyId={...} />`, que hace `POST /api/v/[token]/schedule` (Task 6).

- [ ] **Step 1: Página server**

Create `app/v/[token]/page.tsx`:
```tsx
/**
 * Página del RECORRIDO (privada por token, sin login).
 *
 * Llega acá quien se registró en la landing: ve la propiedad por dentro (video
 * recorrido o tour 3D, según lo que eligió el asesor) y propone día y hora sin
 * volver a cargar sus datos — ya viajan en el token.
 */
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken, markTokenOpened } from '@/lib/leads/access-token'
import { resolveDeliverMedia } from '@/lib/properties/deliver-media'
import { ScheduleVisitForm } from './ScheduleVisitForm'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function formatPrice(v: number | null, c: string | null): string {
  if (!v) return ''
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: c === 'ARS' ? 'ARS' : 'USD',
    minimumFractionDigits: 0,
  }).format(v)
}

/** YouTube/Vimeo → embed; cualquier otra cosa se sirve como <video>. */
function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/)
  return m ? `https://www.youtube.com/embed/${m[1]}` : null
}

export default async function RecorridoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const access = await getAccessToken(token)
  if (!access) notFound()

  const { data: property } = await admin()
    .from('properties')
    .select('id, address, neighborhood, city, asking_price, currency, photos, rooms, covered_area, video_recorrido_url, tour_3d_url, deliver_media')
    .eq('id', access.propertyId)
    .maybeSingle()
  if (!property) notFound()

  await markTokenOpened(token)

  const media = resolveDeliverMedia(property)
  const yt = media.kind === 'video_recorrido' && media.url ? youtubeEmbed(media.url) : null
  const fotos = (property.photos ?? []) as string[]

  return (
    <div className="landing-root min-h-screen">
      <main className="mx-auto max-w-4xl px-5 py-10 md:py-16">
        <p className="lx-eyebrow">Hola {access.name.split(' ')[0]}</p>
        <h1 className="mt-2 text-3xl md:text-5xl">Conocé {property.address} por dentro</h1>
        <p className="mt-2 text-black/60">
          {property.neighborhood}{property.city ? `, ${property.city}` : ''} · {formatPrice(property.asking_price, property.currency)}
        </p>

        <section className="mt-8">
          {media.kind === 'tour_3d' && media.url && (
            <iframe
              src={media.url}
              title="Recorrido virtual"
              className="aspect-video w-full rounded-lg border"
              allow="fullscreen; xr-spatial-tracking"
            />
          )}
          {media.kind === 'video_recorrido' && media.url && (
            yt ? (
              <iframe
                src={yt}
                title="Video recorrido"
                className="aspect-video w-full rounded-lg border"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video src={media.url} controls playsInline className="aspect-video w-full rounded-lg border" />
            )
          )}
          {media.kind === 'fotos' && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {fotos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />
              ))}
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-2xl md:text-3xl">¿Querés visitarla?</h2>
          <p className="mt-2 text-black/60">
            Elegí el día y el momento que te queda cómodo. Nuestro equipo te contacta para confirmarla.
          </p>
          <ScheduleVisitForm token={token} clientName={access.name} />
        </section>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Formulario de agenda (client)**

Create `app/v/[token]/ScheduleVisitForm.tsx`:
```tsx
'use client'

/**
 * Agenda SIN pedir datos: el nombre/email/teléfono ya viajan en el token, así
 * que solo se elige día y franja horaria. La visita queda "a confirmar" y la
 * cierra el equipo por teléfono.
 */
import { useState } from 'react'
import { Loader2, CalendarCheck } from 'lucide-react'

const FRANJAS = [
  { id: 'manana', label: 'Por la mañana (9 a 12)' },
  { id: 'mediodia', label: 'Al mediodía (12 a 15)' },
  { id: 'tarde', label: 'Por la tarde (15 a 19)' },
] as const

/** Hoy no: la visita se coordina con al menos un día de anticipación. */
function minDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function ScheduleVisitForm({ token, clientName }: { token: string; clientName: string }) {
  const [date, setDate] = useState('')
  const [franja, setFranja] = useState<string>(FRANJAS[0].id)
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!date) {
      setStatus('err')
      setError('Elegí un día para la visita.')
      return
    }
    setStatus('sending')
    setError('')
    try {
      const res = await fetch(`/api/v/${token}/schedule`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ date, franja }),
      })
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(j.error || 'No pudimos registrar la visita')
      setStatus('ok')
    } catch (err) {
      setStatus('err')
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  if (status === 'ok') {
    return (
      <div className="mt-6 flex flex-col items-start gap-2 rounded-lg border p-6">
        <CalendarCheck className="h-8 w-8 text-emerald-600" />
        <p className="text-lg font-medium">¡Listo, {clientName.split(' ')[0]}!</p>
        <p className="text-black/60">
          Nuestro equipo se va a contactar con vos para confirmar la visita a la propiedad.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="v-date">Día</label>
        <input
          id="v-date"
          type="date"
          required
          min={minDate()}
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full max-w-xs rounded-lg border px-3 py-2.5 text-base"
        />
      </div>
      <fieldset>
        <legend className="mb-1.5 block text-sm font-medium">Momento del día</legend>
        <div className="flex flex-col gap-2">
          {FRANJAS.map(f => (
            <label key={f.id} className="flex items-center gap-2">
              <input
                type="radio"
                name="franja"
                value={f.id}
                checked={franja === f.id}
                onChange={() => setFranja(f.id)}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {status === 'err' && error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium text-white disabled:opacity-60"
        style={{ background: 'var(--brand)' }}
      >
        {status === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
        Agendar visita
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Probe de render**

Create `scripts/landing-access-token.probe.tsx`:
```tsx
/**
 * Verifica el formulario de agenda sin navegador (happy-dom no arranca en este
 * host). Renderiza el client component y afirma sobre el HTML.
 *
 * Uso: node --import tsx scripts/landing-access-token.probe.tsx
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScheduleVisitForm } from '../app/v/[token]/ScheduleVisitForm'

let fallos = 0
const check = (n: string, ok: boolean, d = '') => {
  console.log(`${ok ? '✅' : '❌'} ${n}${ok ? '' : ` — ${d}`}`)
  if (!ok) fallos++
}

const html = renderToStaticMarkup(<ScheduleVisitForm token="Abc23Xyz99" clientName="Juan Pérez" />)

check('pide día', html.includes('type="date"'))
check('ofrece las 3 franjas', ['mañana', 'mediodía', 'tarde'].every(f => html.toLowerCase().includes(f)))
check('NO pide nombre/email/teléfono (ya vienen en el token)',
  !/name="(nombre|name|email|phone|telefono)"/i.test(html))
check('el botón dice Agendar visita', html.includes('Agendar visita'))
check('está en voseo', /Eleg[íi]|Agend[áa]/.test(html) && !/\b(elige|puedes|tienes)\b/i.test(html))

console.log(fallos === 0 ? '\n🎉 Todo OK' : `\n${fallos} fallaron`)
process.exit(fallos === 0 ? 0 : 1)
```

- [ ] **Step 4: Correr el probe**

Run: `node --import tsx scripts/landing-access-token.probe.tsx`
Expected: 5/5 ✅.

- [ ] **Step 5: Typecheck**

```bash
cat > tsconfig.t5.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["app/v/[token]/**/*.tsx","lib/leads/access-token.ts","lib/properties/deliver-media.ts","scripts/landing-access-token.probe.tsx","types/database.types.ts"] }
EOF
npx tsc --noEmit -p tsconfig.t5.json; rm -f tsconfig.t5.json tsconfig.t5.tsbuildinfo
```
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add "app/v/[token]/page.tsx" "app/v/[token]/ScheduleVisitForm.tsx" scripts/landing-access-token.probe.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(recorrido): página /v/[token] con el recorrido y la agenda sin datos

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Endpoint de agenda + notificación al equipo

**Files:**
- Create: `app/api/v/[token]/schedule/route.ts`
- Create: `lib/email/notifications/visit-proposed.ts`
- Modify: `lib/email/notifications/index.ts` (export)

**Interfaces:**
- Consumes: `getAccessToken` (Task 2).
- Produces: `POST /api/v/[token]/schedule` con body `{ date: 'YYYY-MM-DD', franja: 'manana'|'mediodia'|'tarde' }` → inserta en `property_visits` y notifica. `notifyVisitProposed(visitId: string): Promise<void>`.

- [ ] **Step 1: Endpoint**

Create `app/api/v/[token]/schedule/route.ts`:
```ts
/**
 * El cliente propone día y franja desde la página del recorrido.
 * No pide datos: salen del token. La visita queda 'pending_confirmation' y la
 * confirma el equipo (decisión de producto: no hay disponibilidad real por asesor).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken } from '@/lib/leads/access-token'
import { notifyVisitProposed } from '@/lib/email/notifications/visit-proposed'

/** Hora de inicio por franja (hora local de Buenos Aires, UTC-3). */
const FRANJA_HORA: Record<string, number> = { manana: 9, mediodia: 12, tarde: 15 }

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    const access = await getAccessToken(token)
    if (!access) return NextResponse.json({ error: 'Enlace no válido' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as { date?: string; franja?: string }
    const date = typeof body.date === 'string' ? body.date : ''
    const franja = typeof body.franja === 'string' ? body.franja : 'manana'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Elegí un día válido' }, { status: 400 })
    }
    const hora = FRANJA_HORA[franja] ?? 9
    // -03:00 = hora de Argentina; guardamos el instante correcto en UTC.
    const scheduledAt = new Date(`${date}T${String(hora).padStart(2, '0')}:00:00-03:00`)
    if (Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: 'Elegí un día válido' }, { status: 400 })
    }

    const sb = admin()
    const { data: prop } = await sb
      .from('properties')
      .select('id, assigned_to')
      .eq('id', access.propertyId)
      .maybeSingle()

    const { data: visit, error } = await sb
      .from('property_visits')
      .insert({
        property_id: access.propertyId,
        advisor_id: (prop as { assigned_to?: string | null } | null)?.assigned_to ?? null,
        client_name: access.name,
        client_email: access.email,
        client_phone: access.phone,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending_confirmation',
        notes: `Propuesta por el cliente desde el recorrido (franja: ${franja}).`,
      })
      .select('id')
      .single()
    if (error || !visit) {
      return NextResponse.json({ error: error?.message ?? 'No pudimos registrar la visita' }, { status: 500 })
    }

    // Medición: desde qué token salió la visita.
    await sb.from('lead_access_tokens').update({ scheduled_at: new Date().toISOString() }).eq('token', token)

    // Notificar al equipo. Best-effort: la visita YA está registrada.
    try {
      await notifyVisitProposed((visit as { id: string }).id)
    } catch (err) {
      console.error('[schedule] notificación falló (visita igual registrada):', err)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Notificación al equipo**

Create `lib/email/notifications/visit-proposed.ts` (leer antes `lib/email/notifications/visit-completed.ts` para copiar el estilo del HTML y del `sendEmail`):
```ts
/**
 * Aviso de VISITA PROPUESTA por un cliente desde el recorrido.
 * Destinatarios: asesor asignado + coordinadores + dueños (supervisión).
 * Best-effort: nunca lanza — la visita ya está registrada.
 */
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/resend-client'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function notifyVisitProposed(visitId: string): Promise<void> {
  const sb = admin()
  const { data: visit } = await sb
    .from('property_visits')
    .select('id, client_name, client_email, client_phone, scheduled_at, notes, property_id, advisor_id')
    .eq('id', visitId)
    .maybeSingle()
  if (!visit) return
  const v = visit as {
    id: string; client_name: string; client_email: string | null; client_phone: string | null
    scheduled_at: string; notes: string | null; property_id: string; advisor_id: string | null
  }

  const { data: prop } = await sb
    .from('properties')
    .select('address, neighborhood')
    .eq('id', v.property_id)
    .maybeSingle()

  // Asesor asignado + coordinadores + dueños/admins (supervisión).
  const { data: staff } = await sb
    .from('profiles')
    .select('id, email, full_name, role')
    .in('role', ['coordinador', 'dueno', 'admin'])
  const emails = new Set<string>()
  for (const p of (staff ?? []) as { email: string | null }[]) if (p.email) emails.add(p.email)
  if (v.advisor_id) {
    const { data: advisor } = await sb.from('profiles').select('email').eq('id', v.advisor_id).maybeSingle()
    const e = (advisor as { email?: string | null } | null)?.email
    if (e) emails.add(e)
  }
  if (emails.size === 0) return

  const cuando = new Date(v.scheduled_at).toLocaleString('es-AR', {
    dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Argentina/Buenos_Aires',
  })
  const direccion = (prop as { address?: string } | null)?.address ?? 'la propiedad'

  const html = `
    <h2>Nueva visita propuesta</h2>
    <p><strong>${v.client_name}</strong> quiere visitar <strong>${direccion}</strong>.</p>
    <p><strong>Cuándo:</strong> ${cuando}</p>
    <p><strong>Contacto:</strong> ${v.client_phone ?? '—'} · ${v.client_email ?? '—'}</p>
    <p>${v.notes ?? ''}</p>
    <p>La visita quedó <strong>a confirmar</strong>: hay que contactarlo para cerrarla.</p>
  `

  await sendEmail({
    notificationType: 'visit_proposed',
    entityType: 'property',
    entityId: v.id,
    to: [...emails],
    subject: `Visita propuesta: ${direccion} — ${v.client_name}`,
    html,
  })
}
```

- [ ] **Step 3: Exportar en el índice**

En `lib/email/notifications/index.ts`, agregar al final:
```ts
export { notifyVisitProposed } from './visit-proposed'
```

- [ ] **Step 4: Typecheck**

```bash
cat > tsconfig.t6.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["app/api/v/[token]/schedule/route.ts","lib/email/notifications/visit-proposed.ts","lib/email/notifications/index.ts","lib/leads/access-token.ts","types/database.types.ts"] }
EOF
npx tsc --noEmit -p tsconfig.t6.json; rm -f tsconfig.t6.json tsconfig.t6.tsbuildinfo
```
Expected: sin errores. Si `sendEmail` exige campos que faltan, ajustarlos leyendo `lib/email/resend-client.ts`.

- [ ] **Step 5: Commit**

```bash
git add "app/api/v/[token]/schedule/route.ts" lib/email/notifications/visit-proposed.ts lib/email/notifications/index.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(recorrido): proponer visita desde el token + aviso al equipo

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Cargar el video recorrido desde la ficha

**Files:**
- Modify: `app/api/properties/[id]/media/route.ts` (agregar rama `video_recorrido_url`, junto a la de `tour_3d_url`)
- Modify: `components/properties/PropertyMediaCard.tsx` (campo nuevo)

**Interfaces:**
- Produces: `PATCH /api/properties/[id]/media` acepta `{ video_recorrido_url: string | null }`.

- [ ] **Step 1: Aceptar el campo en la ruta**

En `app/api/properties/[id]/media/route.ts`, después de la rama de `tour_3d_url`, agregar una rama análoga (leer la de `tour_3d_url` y copiarla), validando **https://** igual que el tour, ya que puede embeberse:
```ts
    // Video recorrido: se ENTREGA al cliente registrado (no va en la landing
    // pública). Mismo criterio https:// que el tour — puede ir en un <iframe>.
    if ('video_recorrido_url' in body) {
      const raw = typeof body.video_recorrido_url === 'string' ? body.video_recorrido_url.trim() : ''
      let val: string | null = null
      if (raw) {
        let isHttps = false
        try { isHttps = new URL(raw).protocol === 'https:' } catch { isHttps = false }
        if (!isHttps) {
          return NextResponse.json({ error: 'El video recorrido debe ser un enlace https válido' }, { status: 400 })
        }
        val = raw
      }
      await updateProperty(id, { video_recorrido_url: val })
      return NextResponse.json({ success: true })
    }
```

- [ ] **Step 2: Campo en la UI**

En `components/properties/PropertyMediaCard.tsx`, ubicar el input del recorrido virtual (`tour_3d_url`) y duplicar el patrón para el video recorrido, con esta copia exacta:
- Etiqueta: `Video recorrido`
- Ayuda: `Video que recorre la propiedad por dentro. NO se muestra en la landing: se le envía a quien se registra.`
- Placeholder: `https://youtu.be/...`
El handler debe hacer `PATCH /api/properties/${id}/media` con `{ video_recorrido_url: valor || null }`, igual que el del tour.

- [ ] **Step 3: Typecheck**

```bash
cat > tsconfig.t7.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["app/api/properties/[id]/media/route.ts","components/properties/PropertyMediaCard.tsx","types/database.types.ts"] }
EOF
npx tsc --noEmit -p tsconfig.t7.json; rm -f tsconfig.t7.json tsconfig.t7.tsbuildinfo
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "app/api/properties/[id]/media/route.ts" components/properties/PropertyMediaCard.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(propiedades): campo video recorrido en multimedia

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Elegir qué entregar al crear la landing

**Files:**
- Modify: `components/properties/LandingSection.tsx`
- Modify: `app/api/properties/[id]/landing/route.ts` (PATCH que persista `deliver_media`)

**Interfaces:**
- Consumes: `needsDeliveryChoice` (Task 3).
- Produces: `PATCH /api/properties/[id]/landing` acepta `{ deliverMedia: 'video_recorrido' | 'tour_3d' }` y lo guarda en `properties.deliver_media`.

- [ ] **Step 1: Persistir la elección**

En `app/api/properties/[id]/landing/route.ts`, en el handler `PATCH`, agregar antes de la respuesta:
```ts
    if (body.deliverMedia === 'video_recorrido' || body.deliverMedia === 'tour_3d') {
      await adminTyped()
        .from('properties')
        .update({ deliver_media: body.deliverMedia })
        .eq('id', id)
    }
```
(usar el cliente admin ya disponible en el archivo; si el tipo del `body` está declarado, agregarle `deliverMedia?: 'video_recorrido' | 'tour_3d'`).

- [ ] **Step 2: Preguntar en la UI solo si hay ambos**

En `components/properties/LandingSection.tsx`, agregar el import:
```ts
import { needsDeliveryChoice } from '@/lib/properties/deliver-media'
```
El componente ya recibe/carga la propiedad para armar la landing. Antes del botón de crear/publicar, cuando `needsDeliveryChoice(property)` sea `true`, mostrar un selector con esta copia exacta:
- Título: `¿Qué le enviamos a quien se registre?`
- Opciones: `Video recorrido` y `Recorrido virtual 3D`
- Ayuda: `Se le manda por WhatsApp para que conozca la propiedad por dentro.`
Al elegir, hacer `PATCH /api/properties/${propertyId}/landing` con `{ deliverMedia }`.
Si `needsDeliveryChoice` es `false`, NO mostrar nada (se resuelve solo).

- [ ] **Step 3: Typecheck**

```bash
cat > tsconfig.t8.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["components/properties/LandingSection.tsx","app/api/properties/[id]/landing/route.ts","lib/properties/deliver-media.ts","types/database.types.ts"] }
EOF
npx tsc --noEmit -p tsconfig.t8.json; rm -f tsconfig.t8.json tsconfig.t8.tsbuildinfo
```
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/properties/LandingSection.tsx "app/api/properties/[id]/landing/route.ts"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): el asesor elige qué recorrido se le entrega al cliente

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## FASE 3B — Entrega por WhatsApp (depende de que Meta apruebe la plantilla)

### Task 9: Soporte de botón URL en el cliente de WhatsApp

**Files:**
- Modify: `lib/integrations/whatsapp/core.ts`
- Test: `lib/integrations/whatsapp/core.test.ts` (crear)

**Interfaces:**
- Produces: `SendTemplateInput` acepta `urlButtonParam?: string`; cuando está, se agrega el componente `{ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text }] }`.

- [ ] **Step 1: Test fallido**

Create `lib/integrations/whatsapp/core.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildTemplatePayload } from './core'

afterEach(() => vi.unstubAllEnvs())

describe('buildTemplatePayload', () => {
  it('arma el body con los parámetros en orden', () => {
    const p = buildTemplatePayload({ to: '5491122334455', templateName: 't', languageCode: 'es_AR', bodyParams: ['a', 'b'] })
    expect(p.template.components[0]).toEqual({
      type: 'body',
      parameters: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }],
    })
  })

  it('agrega el botón URL cuando se pasa urlButtonParam', () => {
    const p = buildTemplatePayload({ to: '54911', templateName: 't', languageCode: 'es_AR', bodyParams: ['a'], urlButtonParam: 'Abc23Xyz99' })
    expect(p.template.components[1]).toEqual({
      type: 'button', sub_type: 'url', index: '0',
      parameters: [{ type: 'text', text: 'Abc23Xyz99' }],
    })
  })

  it('sin urlButtonParam no agrega componentes de botón', () => {
    const p = buildTemplatePayload({ to: '54911', templateName: 't', languageCode: 'es_AR', bodyParams: ['a'] })
    expect(p.template.components).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr — debe FALLAR**

Run: `npm test -- lib/integrations/whatsapp/core.test.ts`
Expected: FAIL con "buildTemplatePayload is not exported".

- [ ] **Step 3: Extraer y extender el payload**

En `lib/integrations/whatsapp/core.ts`:
(a) agregar a `SendTemplateInput`:
```ts
  /** Sufijo dinámico del botón URL de la plantilla (ej. el token del recorrido). */
  urlButtonParam?: string
```
(b) extraer el armado del body a una función exportada y testeable:
```ts
export interface TemplatePayload {
  messaging_product: 'whatsapp'
  to: string
  type: 'template'
  template: {
    name: string
    language: { code: string }
    components: Array<Record<string, unknown>>
  }
}

export function buildTemplatePayload(input: SendTemplateInput): TemplatePayload {
  const components: Array<Record<string, unknown>> = [
    { type: 'body', parameters: input.bodyParams.map(text => ({ type: 'text', text })) },
  ]
  // Botón URL con sufijo dinámico: Meta lo concatena a la URL fija de la
  // plantilla (ej. https://inmodf.com.ar/v/ + <token>). index va como string.
  if (input.urlButtonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: input.urlButtonParam }],
    })
  }
  return {
    messaging_product: 'whatsapp',
    to: input.to,
    type: 'template',
    template: { name: input.templateName, language: { code: input.languageCode }, components },
  }
}
```
(c) en `sendWhatsappTemplate`, reemplazar el objeto `body` inline por `const body = buildTemplatePayload(input)`.

- [ ] **Step 4: Correr — debe PASAR**

Run: `npm test -- lib/integrations/whatsapp/core.test.ts`
Expected: PASS (3 casos). Correr también `npm test -- lib/integrations` para no romper lo existente.

- [ ] **Step 5: Commit**

```bash
git add lib/integrations/whatsapp/core.ts lib/integrations/whatsapp/core.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(whatsapp): soporte de botón URL con sufijo dinámico en plantillas

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Enviar el recorrido por WhatsApp al registrarse

**Files:**
- Create: `lib/leads/send-recorrido-whatsapp.ts`
- Modify: `app/api/leads/route.ts`

**Interfaces:**
- Consumes: `sendWhatsappTemplate` + `urlButtonParam` (Task 9); token (Task 4).
- Produces: `sendRecorridoWhatsapp(input): Promise<void>` — best-effort, nunca lanza.

**Prerrequisito externo:** plantilla **de utilidad** `recorrido_propiedad_util` (es_AR) aprobada por Meta, con body de 2 variables y un botón URL dinámico apuntando a `https://inmodf.com.ar/v/{{1}}`. Env nueva: `WHATSAPP_TEMPLATE_RECORRIDO=recorrido_propiedad_util`. **Si la env no está seteada, la función no envía y no rompe nada.**

- [ ] **Step 1: Módulo de envío**

Create `lib/leads/send-recorrido-whatsapp.ts`:
```ts
/**
 * Le manda al cliente recién registrado el link de su recorrido por WhatsApp,
 * con una plantilla de UTILIDAD (mejor entregabilidad que una de marketing).
 *
 * Best-effort en todo: si no hay plantilla configurada, si no hay teléfono o si
 * Meta falla, el flujo sigue — el link igual se muestra en la pantalla de
 * gracias y viaja por email.
 */
import { sendWhatsappTemplate, normalizePhone } from '@/lib/integrations/whatsapp/meta-cloud'

export async function sendRecorridoWhatsapp(input: {
  phone: string | null
  clientName: string
  propertyLabel: string
  token: string
}): Promise<void> {
  const template = process.env.WHATSAPP_TEMPLATE_RECORRIDO
  if (!template) return
  const to = normalizePhone(input.phone)
  if (!to) return
  try {
    await sendWhatsappTemplate({
      to,
      templateName: template,
      languageCode: process.env.WHATSAPP_TEMPLATE_LANG ?? 'es_AR',
      bodyParams: [input.clientName.split(' ')[0], input.propertyLabel],
      urlButtonParam: input.token,
    })
  } catch (err) {
    console.warn('[recorrido-wa] no se pudo enviar (continuando):', err)
  }
}
```

- [ ] **Step 2: Enganchar en la captura del lead**

En `app/api/leads/route.ts`, agregar el import:
```ts
import { sendRecorridoWhatsapp } from '@/lib/leads/send-recorrido-whatsapp'
```
y justo después del bloque que crea el token (Task 4, Step 1):
```ts
    if (token) {
      await sendRecorridoWhatsapp({
        phone: lead.phone,
        clientName: lead.name,
        propertyLabel: prop.title ?? prop.address,
        token,
      })
    }
```

- [ ] **Step 3: Typecheck + tests**

```bash
cat > tsconfig.t10.json <<'EOF'
{ "extends": "./tsconfig.json", "include": ["lib/leads/send-recorrido-whatsapp.ts","app/api/leads/route.ts","lib/integrations/whatsapp/core.ts","types/database.types.ts"] }
EOF
npx tsc --noEmit -p tsconfig.t10.json; rm -f tsconfig.t10.json tsconfig.t10.tsbuildinfo
npm test -- lib/integrations lib/leads
```
Expected: sin errores de tsc; tests en verde.

- [ ] **Step 4: Commit**

```bash
git add lib/leads/send-recorrido-whatsapp.ts app/api/leads/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(recorrido): enviar el link por WhatsApp con plantilla de utilidad

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Gates de despliegue (los ejecuta el controller con OK del usuario)

1. **Migración a producción** — `scripts/apply-video-recorrido-migration-pg.ts`. Verificar contra la API REST que existan `properties.video_recorrido_url`, `properties.deliver_media` y la tabla `lead_access_tokens`, y que `property_visits` acepte `pending_confirmation`. **Antes** de que el código que las escribe llegue a producción.
2. **Push a `main`** → Netlify deploya.
3. **Plantilla de WhatsApp** (Fase 3B) — crear `recorrido_propiedad_util` y mandarla a aprobación de Meta; al aprobarse, setear `WHATSAPP_TEMPLATE_RECORRIDO` en Netlify.
4. **Prueba end-to-end en vivo** — registrarse en una landing real, abrir `/v/<token>`, proponer una visita y confirmar que llega el aviso.

## Self-Review

**Cobertura del spec:** 4.1 modelo de datos → Task 1 ✅ · token → Task 2 ✅ · `deliver_media` → Task 3 ✅ · 4.2 flujo (lead → token → gracias) → Task 4 ✅ · página `/v/[token]` + agenda → Tasks 5-6 ✅ · 4.3 elección en el asistente → Task 8 ✅ · carga del video recorrido → Task 7 ✅ · 4.4 acortador (`/v/<token>` en dominio propio) → Task 2 (`accessUrl`) ✅ · 4.5 WhatsApp → Tasks 9-10 ✅ · 4.6 notificaciones → Task 6 ✅ · 4.7 medición (`opened_at`, `open_count`, `scheduled_at`) → Tasks 2 y 6 ✅.

**Sin placeholders:** cada paso trae el código o la copia exacta. Las dos tareas de UI (7 y 8) describen el patrón a duplicar de un componente hermano concreto porque el archivo es grande y el patrón ya existe; la copia visible está dada palabra por palabra.

**Consistencia de tipos:** `createAccessToken`/`getAccessToken`/`accessUrl`/`markTokenOpened` (Task 2) se usan con esas firmas en Tasks 4, 5 y 6. `resolveDeliverMedia`/`needsDeliveryChoice` (Task 3) en Tasks 5 y 8. `notifyVisitProposed(visitId)` (Task 6) coincide con su llamada. `buildTemplatePayload`/`urlButtonParam` (Task 9) coinciden con el uso en Task 10. El estado `'pending_confirmation'` de Task 1 es el que inserta Task 6.
