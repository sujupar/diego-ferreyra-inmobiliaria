# Fase 2 — M9: Landing page por propiedad en subdominio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development o superpowers:executing-plans para implementar este plan task-by-task. Steps usan checkbox (`- [ ]`) syntax.

**Goal:** Que cada propiedad publicada en al menos un portal tenga automáticamente una landing page propia en un subdominio del estilo `[slug].inmodf.com.ar`, con galería, video, tour 3D, descripción, mapa y lead form que cae en un inbox interno.

**Architecture:** DNS wildcard CNAME a Netlify + middleware Next.js que detecta el host y reescribe a `/p/[slug]/page.tsx`. Slug auto-generado del address (kebab-case) + sufijo random de 6 chars, persistido en `properties.public_slug` (UNIQUE). El page es server component, fetchea propiedad por slug con RLS abierto (read público), renderiza template responsive. Lead form usa server action que escribe en tabla nueva `property_leads` y dispara email Resend al asesor asignado.

**Tech Stack:** Next.js 16 (middleware + server components), Supabase, Resend, Tailwind, shadcn/ui (Card, Button, Input).

**Spec:** `docs/superpowers/specs/2026-05-12-portales-meta-ads-design.md` §7.1, §7.2

**Pre-requisitos:**
- Fase 1 mergeada y desplegada ✓
- Migración `20260506000000_properties_description.sql` aplicada (columna description en properties)
- DNS de inmodf.com.ar accesible para crear el wildcard CNAME

**No-objetivos de M9** (van en M10-M19):
- Pixel Meta + analytics — M11
- Inbox UI en dashboard — M13
- Meta Ads campaign builder — M14
- Tab Marketing en property detail — M18

---

## Milestones internos de M9

- **M9.1**: Schema (columna `public_slug`, tabla `property_leads`)
- **M9.2**: Slug generator + RPC SQL para garantizar unicidad
- **M9.3**: DNS wildcard + Netlify config + test del SSL wildcard
- **M9.4**: Middleware Next.js para rewrite de subdomain
- **M9.5**: Página `/p/[slug]` server component con fetch + SEO metadata
- **M9.6**: Componentes UI (Hero, Gallery, Features, LeadForm)
- **M9.7**: Server action de lead capture + email notification
- **M9.8**: Tests + /review checkpoint

---

# M9.1 — Schema

### Task 9.1.1: Migration `public_slug` + `property_leads`

**Files:**
- Create: `supabase/migrations/20260514000000_landing_pages_schema.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- =============================================================================
-- Migration: Schema para landings de propiedades (Fase 2 M9)
-- Date: 2026-05-14
-- =============================================================================

-- 1. properties.public_slug: slug único para el subdomain
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS public_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_public_slug
  ON public.properties (public_slug)
  WHERE public_slug IS NOT NULL;

COMMENT ON COLUMN public.properties.public_slug IS
  'Slug único para landing pública en [slug].inmodf.com.ar';

-- 2. property_leads: leads que llegan desde la landing o Meta
CREATE TABLE IF NOT EXISTS public.property_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  message text,
  source text NOT NULL DEFAULT 'landing',
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  meta_lead_id text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_leads_property
  ON public.property_leads (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_leads_assigned
  ON public.property_leads (assigned_to, status);

COMMENT ON COLUMN public.property_leads.status IS
  'new | contacted | scheduled | discarded';
COMMENT ON COLUMN public.property_leads.source IS
  'landing | meta_form | portal_mercadolibre | portal_argenprop | portal_zonaprop';

-- 3. updated_at trigger
DROP TRIGGER IF EXISTS trg_touch_property_leads ON public.property_leads;
CREATE TRIGGER trg_touch_property_leads
  BEFORE UPDATE ON public.property_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4. RLS
ALTER TABLE public.property_leads ENABLE ROW LEVEL SECURITY;

-- Asesor solo sus propiedades; admin/dueno/coordinador todo; abogado denegado
DROP POLICY IF EXISTS leads_select ON public.property_leads;
CREATE POLICY leads_select ON public.property_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND (
            assigned_to = p.id
            OR EXISTS (
              SELECT 1 FROM public.properties pr
              WHERE pr.id = property_leads.property_id AND pr.assigned_to = p.id
            )
          ))
        )
    )
  );

-- Mismo patrón para update (cambiar status, notas)
DROP POLICY IF EXISTS leads_update ON public.property_leads;
CREATE POLICY leads_update ON public.property_leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_leads.property_id AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- INSERT solo service_role (la landing usa server action con admin client)
```

- [ ] **Step 2: Aplicar en Supabase Dashboard.**

- [ ] **Step 3: Actualizar types/database.types.ts**

Agregar a `properties` (Row/Insert/Update): `public_slug: string | null`.

Agregar tabla `property_leads` con Row/Insert/Update completos (id, property_id, name, email, phone, message, source, utm, status, assigned_to, meta_lead_id, created_at, updated_at).

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/20260514000000_landing_pages_schema.sql types/database.types.ts
git commit -m "feat(landing): schema public_slug + property_leads + RLS"
```

---

# M9.2 — Slug generator + RPC de unicidad

### Task 9.2.1: Helper TS para generar slug

**Files:**
- Create: `lib/landing/slug.ts`
- Create: `lib/landing/slug.test.ts`

- [ ] **Step 1: Tests primero**

```ts
import { describe, it, expect } from 'vitest'
import { propertyToSlug } from './slug'

describe('propertyToSlug', () => {
  it('kebab-case del address', () => {
    const slug = propertyToSlug({ address: 'Av Libertador 1234', neighborhood: 'Palermo', property_type: 'departamento' } as never)
    expect(slug).toMatch(/^departamento-palermo-av-libertador-1234-[a-z0-9]{6}$/)
  })

  it('quita tildes', () => {
    const slug = propertyToSlug({ address: 'Calle ñandú 100', neighborhood: 'Núñez', property_type: 'casa' } as never)
    expect(slug).toMatch(/^casa-nunez-calle-nandu-100-[a-z0-9]{6}$/)
  })

  it('limita largo total a 80', () => {
    const slug = propertyToSlug({
      address: 'A'.repeat(200),
      neighborhood: 'Z'.repeat(50),
      property_type: 'casa',
    } as never)
    expect(slug.length).toBeLessThanOrEqual(80)
  })

  it('agrega sufijo random distinto cada vez', () => {
    const a = propertyToSlug({ address: 'X', neighborhood: 'Y', property_type: 'casa' } as never)
    const b = propertyToSlug({ address: 'X', neighborhood: 'Y', property_type: 'casa' } as never)
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Implementación**

```ts
import type { Property } from '../portals/types'

const RANDOM_LEN = 6
const MAX_TOTAL = 80

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 2 + RANDOM_LEN).padEnd(RANDOM_LEN, '0')
}

function kebab(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function propertyToSlug(
  property: Pick<Property, 'address' | 'neighborhood' | 'property_type'>,
): string {
  const parts = [
    property.property_type ?? '',
    property.neighborhood ?? '',
    property.address ?? '',
  ].map(kebab).filter(Boolean)
  const base = parts.join('-')
  const suffix = randomSuffix()
  // dejamos espacio para "-<6char>"
  const trunc = base.slice(0, MAX_TOTAL - RANDOM_LEN - 1)
  return `${trunc}-${suffix}`
}
```

- [ ] **Step 3: Run tests.**

- [ ] **Step 4: Commit.**

```bash
git add lib/landing/
git commit -m "feat(landing): generador de slug kebab-case + sufijo random"
```

---

### Task 9.2.2: Server helper para asignar slug a propiedades captadas

**Files:**
- Create: `lib/landing/assign-slug.ts`

- [ ] **Step 1: Implementación**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { propertyToSlug } from './slug'

const MAX_RETRIES = 5

/**
 * Asigna un public_slug único a una propiedad si todavía no tiene.
 * Reintenta hasta 5 veces ante colisiones (random suffix).
 * Idempotente: si ya tiene slug, no hace nada.
 */
export async function ensurePublicSlug(
  supabase: SupabaseClient<Database>,
  propertyId: string,
): Promise<string> {
  const { data: property } = await supabase
    .from('properties')
    .select('id, address, neighborhood, property_type, public_slug')
    .eq('id', propertyId)
    .single()
  if (!property) throw new Error('Property not found')
  if (property.public_slug) return property.public_slug

  for (let i = 0; i < MAX_RETRIES; i++) {
    const slug = propertyToSlug(property)
    const { error } = await supabase
      .from('properties')
      .update({ public_slug: slug })
      .eq('id', propertyId)
      .is('public_slug', null)
    if (!error) return slug
    // Si fue por unique violation, reintentamos con nuevo random
    if (!error.message.toLowerCase().includes('unique')) throw error
  }
  throw new Error(`Could not assign unique slug after ${MAX_RETRIES} attempts`)
}
```

- [ ] **Step 2: Hook en worker `publish-listings.mts`**

Cuando un listing pasa a 'published' por primera vez, llamar a `ensurePublicSlug(supabase, property.id)`. Editar el bloque success en `processPublishes`:

```ts
// Después del primer publish exitoso, asegurar slug
try {
  await ensurePublicSlug(supabase, listing.property_id)
} catch (err) {
  console.warn('[publish-listings] ensurePublicSlug failed', err)
}
```

- [ ] **Step 3: Commit.**

```bash
git add lib/landing/assign-slug.ts netlify/functions/publish-listings.mts
git commit -m "feat(landing): ensurePublicSlug + hook en worker tras publish exitoso"
```

---

# M9.3 — DNS wildcard + Netlify SSL

### Task 9.3.1: Configurar DNS wildcard

**Files:**
- Modify: `DEPLOY.md`

- [ ] **Step 1: Comprobar dominio actual en Netlify**

```bash
netlify status
netlify api getDnsRecords --data '{"zone_id":"inmodf.com.ar"}'
```

(O desde el dashboard de Netlify → Domains.)

- [ ] **Step 2: Agregar registro DNS wildcard**

En el proveedor DNS de inmodf.com.ar (probablemente Cloudflare o el registrar argentino), agregar:

```
Tipo:  CNAME
Host:  *
Valor: <netlify-site-name>.netlify.app (o el alias provisto por Netlify)
TTL:   3600
Proxy: deshabilitado (DNS only — Netlify maneja SSL)
```

- [ ] **Step 3: En Netlify, agregar el alias wildcard**

Netlify Dashboard → Site → Domain settings → Add domain alias → `*.inmodf.com.ar`.

Esperar que Netlify provea SSL wildcard automático (Let's Encrypt). Puede tardar 5-30 min.

- [ ] **Step 4: Verificar con curl**

```bash
curl -I https://test-slug.inmodf.com.ar
# Esperado: TLS handshake exitoso (no SSL error)
# Status: 404 o lo que devuelva el middleware
```

- [ ] **Step 5: Documentar en DEPLOY.md**

Agregar sección "Subdomain wildcard para landings" con los pasos arriba.

- [ ] **Step 6: Commit.**

```bash
git add DEPLOY.md
git commit -m "docs(landing): pasos para configurar wildcard DNS + SSL Netlify"
```

---

# M9.4 — Middleware Next.js para subdomain rewrite

### Task 9.4.1: Detectar subdomain y reescribir a `/p/[slug]`

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Leer middleware actual**

```bash
cat middleware.ts
```

(Hay un middleware existente que maneja auth/redirects. Hay que insertar la lógica de subdomain ANTES del check de auth.)

- [ ] **Step 2: Agregar branching por host**

En el top del middleware, antes de cualquier lógica de auth:

```ts
import { NextRequest, NextResponse } from 'next/server'

const ROOT_DOMAINS = ['inmodf.com.ar', 'www.inmodf.com.ar', 'localhost:3000']

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? ''

  // Si NO es root domain, es un subdomain → rewrite a /p/[slug]
  if (!ROOT_DOMAINS.includes(host)) {
    const slug = host.split('.')[0]
    if (slug && /^[a-z0-9-]+$/.test(slug)) {
      const url = req.nextUrl.clone()
      url.pathname = `/p/${slug}${url.pathname === '/' ? '' : url.pathname}`
      return NextResponse.rewrite(url)
    }
  }

  // ... resto del middleware existente (auth, etc.)
}
```

Cuidado: preservar la lógica de auth/redirects existente para todo lo que NO sea subdomain.

- [ ] **Step 3: Excluir rutas de Next internals del rewrite**

El `matcher` del middleware debe seguir excluyendo `/_next/static`, `/_next/image`, `/api/*`, etc.

- [ ] **Step 4: Test manual**

`npm run dev` y agregar `127.0.0.1 test-slug.localhost` a `/etc/hosts`. Probar `http://test-slug.localhost:3000` → debería intentar buscar `/p/test-slug/page.tsx`.

- [ ] **Step 5: Commit.**

```bash
git add middleware.ts
git commit -m "feat(landing): middleware subdomain rewrite → /p/[slug]"
```

---

# M9.5 — Página `/p/[slug]` server component

### Task 9.5.1: Route handler con fetch por slug

**Files:**
- Create: `app/p/[slug]/page.tsx`
- Create: `app/p/[slug]/not-found.tsx`

- [ ] **Step 1: page.tsx server component**

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { Metadata } from 'next'
import { LandingHero } from '@/components/landing/Hero'
import { LandingGallery } from '@/components/landing/Gallery'
import { LandingFeatures } from '@/components/landing/Features'
import { LandingDescription } from '@/components/landing/Description'
import { LandingLocationMap } from '@/components/landing/LocationMap'
import { LandingLeadForm } from '@/components/landing/LeadForm'
import { LandingVideoEmbed } from '@/components/landing/VideoEmbed'
import { LandingTour3DEmbed } from '@/components/landing/Tour3DEmbed'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getPropertyBySlug(slug: string) {
  const supabase = getAdmin()
  const { data } = await supabase
    .from('properties')
    .select('*')
    .eq('public_slug', slug)
    .in('status', ['approved'])
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) return { title: 'Propiedad no encontrada' }
  const title = property.title ?? `${property.property_type} en ${property.neighborhood}`
  const description = property.description ?? property.address
  return {
    title: `${title} | Diego Ferreyra Inmobiliaria`,
    description: description.slice(0, 160),
    openGraph: {
      title,
      description: description.slice(0, 160),
      images: property.photos?.[0] ? [property.photos[0]] : [],
      type: 'website',
    },
  }
}

export default async function PropertyLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) notFound()

  return (
    <main className="min-h-screen bg-background">
      <LandingHero property={property} />
      <LandingGallery photos={property.photos ?? []} />
      {property.video_url && <LandingVideoEmbed url={property.video_url} />}
      {property.tour_3d_url && <LandingTour3DEmbed url={property.tour_3d_url} />}
      <LandingFeatures property={property} />
      <LandingDescription text={property.description ?? ''} />
      <LandingLocationMap lat={property.latitude} lng={property.longitude} address={property.address} />
      <LandingLeadForm propertyId={property.id} propertyTitle={property.title ?? property.address} />
    </main>
  )
}
```

- [ ] **Step 2: not-found.tsx**

```tsx
export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center text-center p-8">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="display text-4xl mt-2">Propiedad no encontrada</h1>
        <p className="text-muted-foreground mt-4">
          Este enlace puede haber expirado o la propiedad ya no está disponible.
        </p>
      </div>
    </main>
  )
}
```

- [ ] **Step 3: Commit.**

```bash
git add app/p/
git commit -m "feat(landing): route /p/[slug] con fetch + SEO metadata"
```

---

# M9.6 — Componentes UI

### Task 9.6.1-9.6.7: 7 componentes de landing

**Files:**
- Create: `components/landing/Hero.tsx`
- Create: `components/landing/Gallery.tsx`
- Create: `components/landing/VideoEmbed.tsx`
- Create: `components/landing/Tour3DEmbed.tsx`
- Create: `components/landing/Features.tsx`
- Create: `components/landing/Description.tsx`
- Create: `components/landing/LocationMap.tsx`
- Create: `components/landing/LeadForm.tsx`

Cada uno con un único responsabilidad. Patrón:

**Hero.tsx**: foto grande + título + precio + CTA sticky que scroll-to-form. Server component.
**Gallery.tsx**: client component con grid + lightbox al click.
**VideoEmbed.tsx**: detect YouTube/Vimeo/mp4 y embed responsive.
**Tour3DEmbed.tsx**: iframe Matterport con aspect-ratio container.
**Features.tsx**: grid de stats (ambientes, m², expensas, amenities).
**Description.tsx**: render del campo description con paragraph styling.
**LocationMap.tsx**: imagen estática de Google Static Maps o Mapbox con pin.
**LeadForm.tsx**: client component, react-hook-form + zod, submit via server action.

(El detalle de cada componente se completa cuando arranquemos el milestone, copiando el patrón de design del resto de la app.)

- [ ] **Step**: crear los 8 componentes uno por uno con commits separados.
- [ ] **Step**: testear visual abriendo `localhost:3000/p/<slug-de-prueba>` con un slug seedeado.

---

# M9.7 — Server action de lead capture + email Resend

### Task 9.7.1: Server action `/api/leads`

**Files:**
- Create: `app/api/leads/route.ts`

- [ ] **Step 1: Validación con zod**

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const LeadSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(2).max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(6).max(30).optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
  utm: z.record(z.string(), z.string()).optional(),
})

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(req: Request) {
  const body = await req.json()
  const parsed = LeadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid payload', detail: parsed.error.flatten() }, { status: 400 })
  }
  const supabase = getAdmin()
  // Asignar al asesor de la propiedad si existe
  const { data: prop } = await supabase
    .from('properties')
    .select('assigned_to, title, address')
    .eq('id', parsed.data.propertyId)
    .single()
  if (!prop) return NextResponse.json({ error: 'property not found' }, { status: 404 })

  const { data: lead, error } = await supabase
    .from('property_leads')
    .insert({
      property_id: parsed.data.propertyId,
      name: parsed.data.name,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      message: parsed.data.message ?? null,
      source: 'landing',
      utm: parsed.data.utm ?? {},
      assigned_to: prop.assigned_to,
    })
    .select()
    .single()

  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 })
  }

  // Disparar email Resend al asesor (fire-and-forget)
  if (prop.assigned_to) {
    notifyAdvisor(prop.assigned_to, lead, prop).catch(e =>
      console.error('[lead notification]', e),
    )
  }

  return NextResponse.json({ ok: true, id: lead.id })
}

async function notifyAdvisor(advisorId: string, lead: { name: string; email: string | null; phone: string | null; message: string | null }, prop: { title: string | null; address: string }) {
  // Resolver email del asesor + enviar (depende del email stack existente en /lib/email)
  // Implementación: dynamic import para mantener el módulo liviano.
  const mod = await import('@/lib/email/notifications/lead-notification')
  await mod.notifyLead(advisorId, lead, prop)
}
```

- [ ] **Step 2: Template de email Resend**

Create `emails/lead-notification.tsx` siguiendo el patrón de los emails existentes en el proyecto, y `lib/email/notifications/lead-notification.ts` que lo usa.

- [ ] **Step 3: Commit.**

```bash
git add app/api/leads/ emails/lead-notification.tsx lib/email/notifications/lead-notification.ts
git commit -m "feat(landing): /api/leads endpoint + email notification al asesor"
```

---

# M9.8 — Tests + /review

### Task 9.8.1: Tests del slug generator + lead validation

Ya cubierto en M9.2. Asegurar coverage de los 4 escenarios principales.

### Task 9.8.2: Smoke test e2e

Extender `scripts/smoke-test-portals-flow.ts` para que después de simular el publish, verifique:
- Que se asignó public_slug a la property.
- Que GET https://test-slug.inmodf.com.ar (en producción) o /p/test-slug (local) devuelva 200.

### Task 9.8.3: /review

```
/review
```

Resolver issues. Cerrar M9.

---

## Self-review

**Spec coverage** (§7 del spec original):
- §7.1 Routing wildcard → M9.3, M9.4 ✓
- §7.1 Slug + persistencia → M9.1, M9.2 ✓
- §7.1 Template visual + lead form → M9.5, M9.6 ✓
- §7.2 Tabla property_leads → M9.1 ✓
- §7.2 RLS de leads → M9.1 ✓
- §7.2 Email notification al asesor → M9.7 ✓
- §7.1 SEO/OpenGraph → M9.5 ✓

**Placeholder scan**: Sin TBD/TODO. Los detalles visuales de cada uno de los 7 componentes UI se completan en M9.6 con commits separados — el plan da el contrato de cada componente, la implementación visual sigue el patrón del proyecto.

**Type consistency**: `propertyToSlug`, `ensurePublicSlug`, `LeadSchema`, types de `Property` consistentes a través del módulo.

**Riesgos del plan**:
- DNS wildcard puede tener cache largo (hasta TTL). Mitigación: usar TTL bajo (300s) durante setup, subirlo después.
- SSL wildcard de Netlify a veces tarda hasta 24h en activarse. Mitigación: empezar M9.3 lo más temprano posible para no quedar bloqueados al final.
- Si el middleware se rompe, rompe todo el sitio. Mitigación: branch separada, smoke test antes del merge.

**Dependencias del plan**:
- `description` column en properties (migración previa) — bloqueante M9.5 (la landing usa description).
- Asegurarse que esa migración esté aplicada antes de arrancar M9.5.

---

## Execution

Ejecutar este plan con `superpowers:subagent-driven-development`. Cada milestone interno (M9.1 a M9.8) es un commit/PR independiente mergeable. /review al cerrar M9.8.
