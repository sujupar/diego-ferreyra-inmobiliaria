# Fase 1 — Páginas Nativas de los Funnels (Tasación + Clase VSL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild las dos landings de HighLevel como páginas nativas premium en este Next.js 16 app, servidas en staging sobre `inmodf.com.ar` (`/tasacion-directa`, `/vsl-clase-propietarios`), con media desde Supabase Storage y testimonios desde DB — SIN tocar todavía el form-submit real (Fase 2) ni el Pixel/CAPI (Fase 3).

**Architecture:** Rutas públicas en un route group `app/(funnels)/` (fuera de la auth del dashboard, bypass en `middleware.ts`). Cada página es un Server Component que lee testimonios con un cliente admin (service-role), arma SEO con `generateMetadata`, monta `<LandingVisitTracker>` (endpoint ya existente) y compone secciones. Las piezas interactivas (hero video con unmute, lightbox de testimonios, modal del form) son islas `'use client'` con foco en accesibilidad. Animaciones con `framer-motion` (ya instalado) respetando `prefers-reduced-motion`. Cero deps nuevas de runtime.

**Tech Stack:** Next.js 16.0.10, React 19.2.1, TypeScript, Tailwind CSS 4 (`@theme` en `app/globals.css`), shadcn/ui (`components/ui/`), framer-motion ^12.40.0, vitest ^4.1.6 (+ `@testing-library/react` y `happy-dom` solo para 2 componentes interactivos), Supabase Storage (bucket público `funnel-media`), fuentes Montserrat + Lato vía `next/font/google`.

**Convenciones del repo (NO violar):**
- Commit author DEBE ser `Sujupar <redstyle50@gmail.com>` (si no, el deploy de Netlify falla). Cada `git commit` de este plan usa `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit ...`.
- Migraciones se corren A MANO en el SQL Editor del Dashboard de Supabase (la CLI no conecta).
- Las rutas públicas usan el cliente service-role inline (no `requireAuth`).
- Las URLs públicas de Storage: `https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/<path>`.

**Assets ya disponibles (Fase 0 — ver `docs/superpowers/specs/2026-06-15-fase0-media-rescue-manifest.json`):**
- Heroes: `web/tasacion-hero-web.mp4`, `web/clase-vsl-web.mp4` (H.264 720p).
- Testimonios crudos: `raw/689e7b82960f1a6cf1509715.mp4` (Pablo), `raw/689e7b82f0feb60dbaa365e5.mp4` (Claudia), `raw/689e7b82d382f2bce214fe23.mov` (Federico — HEVC, hay que transcodificar en Task 4).
- Imágenes: logo `raw/682c6cc8e10a088724d26be6.png`, headshot Diego `raw/68669289ec92f406df0238d6.png`, poster VSL `raw/689e7d20f20a61e8e7ecf499.png`.

**Fuera de alcance de Fase 1 (no hacer acá):** submit real del form → CRM (Fase 2), Pixel/CAPI/eventos de conversión (Fase 3), públicos por etapa (Fase 4), corte de dominio/DNS + baja GHL (Fase 5).

---

## File Structure

**Crear:**
- `lib/supabase/admin.ts` — helper `createAdminClient()` (DRY del patrón inline).
- `lib/funnel/media.ts` — `funnelMediaUrl(path)` (URL pública de Storage).
- `lib/funnel/media.test.ts` — test del helper.
- `lib/funnel/testimonials.ts` — tipo `FunnelTestimonial`, `mapTestimonialRow` (puro), `getActiveTestimonials()` (IO).
- `lib/funnel/testimonials.test.ts` — test de `mapTestimonialRow`.
- `lib/funnel/content.ts` — copy de ambas páginas (constantes tipadas).
- `lib/funnel/content.test.ts` — test de invariantes del copy.
- `supabase/migrations/20260615000001_funnel_testimonials.sql` — tabla + RLS + seed.
- `app/(funnels)/layout.tsx` — fuentes Montserrat/Lato + wrapper.
- `components/funnel/ScrollReveal.tsx` — reveal on-scroll (framer-motion).
- `components/funnel/FunnelHeroVideo.tsx` — video muted-autoplay + unmute (cliente).
- `components/funnel/FunnelHeroVideo.test.tsx` — test del toggle de sonido.
- `components/funnel/TestimonialCard.tsx` + `components/funnel/TestimonialLightbox.tsx` — tarjeta + lightbox accesible (cliente).
- `components/funnel/TestimonialLightbox.test.tsx` — test a11y (ESC / focus / scroll-lock).
- `components/funnel/FunnelLeadModal.tsx` + `components/funnel/FunnelLeadForm.tsx` — modal + form UI (cliente; submit stub vía prop `onSubmit`).
- `components/funnel/FunnelLeadModal.test.tsx` — test open/close + validación.
- `app/(funnels)/tasacion-directa/page.tsx` + `app/(funnels)/gracias-tasacion/page.tsx`.
- `app/(funnels)/vsl-clase-propietarios/page.tsx` + `app/(funnels)/gracias-clase/page.tsx`.

**Modificar:**
- `middleware.ts` — agregar bypass público de las rutas de funnel.
- `package.json` / `package-lock.json` — devDeps de testing (Task 1).

---

## Task 1: Setup de testing de componentes (devDeps)

**Files:**
- Modify: `package.json` (devDependencies)
- Create: `components/funnel/__smoke__.test.tsx` (smoke, se borra al final del task)

- [ ] **Step 1: Instalar las devDeps de React Testing Library**

Run:
```bash
npm i -D @testing-library/react@^16 @testing-library/user-event@^14 @testing-library/jest-dom@^6
```
Expected: instala sin errores de peer deps (React 19 soportado por @testing-library/react v16). `happy-dom` ya está presente.

- [ ] **Step 2: Smoke test de que el entorno DOM funciona**

Create `components/funnel/__smoke__.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'

function Hello() {
  return <p>hola funnel</p>
}

describe('smoke: DOM testing', () => {
  it('renderiza en happy-dom', () => {
    render(<Hello />)
    expect(screen.getByText('hola funnel')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Correr el smoke test**

Run: `npm run test -- components/funnel/__smoke__.test.tsx`
Expected: PASS (1 test). Si falla por `document is not defined`, confirmar que el docblock `// @vitest-environment happy-dom` está en la primera línea.

- [ ] **Step 4: Borrar el smoke test y commitear el setup**

```bash
rm components/funnel/__smoke__.test.tsx
git add package.json package-lock.json
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "chore(test): add React Testing Library + jest-dom for funnel component tests"
```

---

## Task 2: Helper de cliente admin Supabase (DRY)

**Files:**
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Escribir el helper**

Create `lib/supabase/admin.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

/**
 * Cliente service-role para Server Components / rutas públicas (sin sesión de usuario).
 * Bypassa RLS — usar SOLO en el servidor, nunca en el cliente.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos relacionados a este archivo.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/admin.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "refactor(supabase): add createAdminClient() service-role helper"
```

---

## Task 3: Helper de URL pública de Storage (TDD)

**Files:**
- Create: `lib/funnel/media.ts`
- Test: `lib/funnel/media.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `lib/funnel/media.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { funnelMediaUrl } from './media'

describe('funnelMediaUrl', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mncsnastmcjdjxrehdep.supabase.co'
  })

  it('arma la URL pública del bucket funnel-media', () => {
    expect(funnelMediaUrl('web/tasacion-hero-web.mp4')).toBe(
      'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/tasacion-hero-web.mp4',
    )
  })

  it('tolera un slash inicial en el path', () => {
    expect(funnelMediaUrl('/raw/x.png')).toBe(
      'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/x.png',
    )
  })

  it('normaliza un trailing slash en el SUPABASE_URL', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mncsnastmcjdjxrehdep.supabase.co/'
    expect(funnelMediaUrl('raw/x.png')).toBe(
      'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/x.png',
    )
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test -- lib/funnel/media.test.ts`
Expected: FAIL ("Cannot find module './media'").

- [ ] **Step 3: Implementación mínima**

Create `lib/funnel/media.ts`:
```ts
const BUCKET = 'funnel-media'

/** URL pública de un objeto del bucket funnel-media. */
export function funnelMediaUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')
  const clean = path.replace(/^\/+/, '')
  return `${base}/storage/v1/object/public/${BUCKET}/${clean}`
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test -- lib/funnel/media.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/funnel/media.ts lib/funnel/media.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): add funnelMediaUrl Storage helper"
```

---

## Task 4: Preparación de assets de testimonios (transcode + posters)

> Manual/scripted. Produce las URLs finales que usa el seed (Task 5). Requiere `ffmpeg` (ya disponible en `/opt/homebrew/bin/ffmpeg`) y las credenciales en `.env.local`. Trabaja sobre los RAW ya bajados en `media-rescue/raw/`.

- [ ] **Step 1: Transcodificar el testimonio de Federico (.mov HEVC → .mp4 H.264 vertical)**

Run:
```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
ffmpeg -y -loglevel error -i media-rescue/raw/689e7b82d382f2bce214fe23.mov \
  -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart \
  media-rescue/web/testimonio-federico.mp4
ls -la media-rescue/web/testimonio-federico.mp4
```
Expected: archivo MP4 H.264 creado (decenas de MB; bajo el límite de Storage).

- [ ] **Step 2: Extraer un poster (frame) de cada video de testimonio**

Run:
```bash
ffmpeg -y -loglevel error -ss 2 -i media-rescue/web/testimonio-federico.mp4 -frames:v 1 -q:v 3 media-rescue/web/poster-federico.jpg
ffmpeg -y -loglevel error -ss 2 -i media-rescue/raw/689e7b82960f1a6cf1509715.mp4 -frames:v 1 -q:v 3 media-rescue/web/poster-pablo.jpg
ffmpeg -y -loglevel error -ss 2 -i media-rescue/raw/689e7b82f0feb60dbaa365e5.mp4 -frames:v 1 -q:v 3 media-rescue/web/poster-claudia.jpg
file media-rescue/web/poster-*.jpg
```
Expected: 3 JPGs. (Si el frame a 2s no es bueno, ajustar `-ss`.)

- [ ] **Step 3: Subir transcode + posters a `funnel-media/web/`**

Run:
```bash
SUPABASE_URL=$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')
SRK=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | head -1 | cut -d= -f2- | tr -d '"'\''' | tr -d '[:space:]')
for f in testimonio-federico.mp4:video/mp4 poster-federico.jpg:image/jpeg poster-pablo.jpg:image/jpeg poster-claudia.jpg:image/jpeg; do
  name="${f%%:*}"; mt="${f##*:}"
  curl -s -o /dev/null -w "%{http_code} $name\n" --max-time 600 -X POST \
    "$SUPABASE_URL/storage/v1/object/funnel-media/web/$name" \
    -H "Authorization: Bearer $SRK" -H "apikey: $SRK" -H "x-upsert: true" -H "Content-Type: $mt" \
    --data-binary "@media-rescue/web/$name"
done
```
Expected: cuatro `200`.

- [ ] **Step 4: Verificar accesibilidad pública**

Run:
```bash
B="https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web"
for p in testimonio-federico.mp4 poster-federico.jpg poster-pablo.jpg poster-claudia.jpg; do curl -s -o /dev/null -w "%{http_code} $p\n" "$B/$p"; done
```
Expected: cuatro `200`. (No hay commit — los binarios viven en Storage, no en git.)

---

## Task 5: Migración `funnel_testimonials` + RLS + seed

**Files:**
- Create: `supabase/migrations/20260615000001_funnel_testimonials.sql`

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260615000001_funnel_testimonials.sql`:
```sql
-- Testimonios de las landings (compartidos por Tasación y Clase VSL).
-- El ORDEN lo da sort_order. video_url/poster_url = URLs públicas del bucket funnel-media.
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta).

create table if not exists public.funnel_testimonials (
  id           uuid primary key default gen_random_uuid(),
  key          text unique not null,            -- 'federico' | 'pablo' | 'claudia'
  client_name  text not null,                   -- 'Federico'
  location     text not null,                   -- 'Propietario en Zona Norte'
  title        text not null,                   -- 'Venta Récord en 25 Días'
  result_badge text,                            -- 'Vendió en 25 días'
  quote        text not null,
  video_url    text not null,
  poster_url   text not null,
  is_vertical  boolean not null default true,
  sort_order   int not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.funnel_testimonials enable row level security;

-- Lectura pública SOLO de los activos (anon + authenticated). Escritura: solo service-role (bypassa RLS).
drop policy if exists "funnel_testimonials public read" on public.funnel_testimonials;
create policy "funnel_testimonials public read"
  on public.funnel_testimonials for select
  to anon, authenticated
  using (active = true);

insert into public.funnel_testimonials
  (key, client_name, location, title, result_badge, quote, video_url, poster_url, is_vertical, sort_order)
values
  ('federico', 'Federico', 'Propietario en Zona Norte', 'Venta Récord en 25 Días', 'Vendió en 25 días',
   'Vendimos 3 propiedades. La primera en 5 días, la segunda en 15, y la más difícil, en un barrio cerrado de Zona Norte, en solo 25 días. Un reto que para muchos tarda meses.',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/testimonio-federico.mp4',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/poster-federico.jpg',
   true, 1),
  ('pablo', 'Pablo', 'Propietario en CABA', '2 Ventas, 1 Compra y un Sueño Cumplido', '2 ventas + 1 compra',
   'Necesitábamos vender dos propiedades para comprar la de nuestros sueños. El desafío era enorme, pero encontraron la propiedad perfecta y coordinaron todo para que se hiciera realidad.',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/689e7b82960f1a6cf1509715.mp4',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/poster-pablo.jpg',
   true, 2),
  ('claudia', 'Claudia', 'Propietaria en CABA', 'Cero Estrés, 100% Confianza', 'Cero estrés',
   'Vender es un proceso lleno de desconfianza. Buscábamos un apoyo real. El resultado fue una experiencia segura, satisfactoria y sin el estrés que tanto temíamos. Pusieron el corazón.',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/raw/689e7b82f0feb60dbaa365e5.mp4',
   'https://mncsnastmcjdjxrehdep.supabase.co/storage/v1/object/public/funnel-media/web/poster-claudia.jpg',
   true, 3)
on conflict (key) do nothing;
```

- [ ] **Step 2: Aplicar la migración (manual, Dashboard)**

Pegar el contenido del archivo en el SQL Editor del Dashboard de Supabase y ejecutar.
Expected: `CREATE TABLE`, `CREATE POLICY`, `INSERT 0 3`. Verificar con:
```sql
select key, client_name, sort_order, active from public.funnel_testimonials order by sort_order;
```
Expected: 3 filas (federico/pablo/claudia).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260615000001_funnel_testimonials.sql
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(db): funnel_testimonials table + RLS + seed (Federico/Pablo/Claudia)"
```

---

## Task 6: Data layer de testimonios (TDD del mapeo puro)

**Files:**
- Create: `lib/funnel/testimonials.ts`
- Test: `lib/funnel/testimonials.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `lib/funnel/testimonials.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mapTestimonialRow, type FunnelTestimonialRow } from './testimonials'

const row: FunnelTestimonialRow = {
  id: 'uuid-1',
  key: 'federico',
  client_name: 'Federico',
  location: 'Propietario en Zona Norte',
  title: 'Venta Récord en 25 Días',
  result_badge: 'Vendió en 25 días',
  quote: 'Vendimos 3 propiedades...',
  video_url: 'https://x/v.mp4',
  poster_url: 'https://x/p.jpg',
  is_vertical: true,
  sort_order: 1,
  active: true,
}

describe('mapTestimonialRow', () => {
  it('mapea la fila al modelo de UI', () => {
    const t = mapTestimonialRow(row)
    expect(t).toEqual({
      key: 'federico',
      clientName: 'Federico',
      location: 'Propietario en Zona Norte',
      title: 'Venta Récord en 25 Días',
      resultBadge: 'Vendió en 25 días',
      quote: 'Vendimos 3 propiedades...',
      videoUrl: 'https://x/v.mp4',
      posterUrl: 'https://x/p.jpg',
      isVertical: true,
    })
  })

  it('result_badge null → resultBadge null', () => {
    expect(mapTestimonialRow({ ...row, result_badge: null }).resultBadge).toBeNull()
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm run test -- lib/funnel/testimonials.test.ts`
Expected: FAIL ("Cannot find module './testimonials'").

- [ ] **Step 3: Implementación**

Create `lib/funnel/testimonials.ts`:
```ts
import { createAdminClient } from '@/lib/supabase/admin'

export interface FunnelTestimonialRow {
  id: string
  key: string
  client_name: string
  location: string
  title: string
  result_badge: string | null
  quote: string
  video_url: string
  poster_url: string
  is_vertical: boolean
  sort_order: number
  active: boolean
}

export interface FunnelTestimonial {
  key: string
  clientName: string
  location: string
  title: string
  resultBadge: string | null
  quote: string
  videoUrl: string
  posterUrl: string
  isVertical: boolean
}

export function mapTestimonialRow(r: FunnelTestimonialRow): FunnelTestimonial {
  return {
    key: r.key,
    clientName: r.client_name,
    location: r.location,
    title: r.title,
    resultBadge: r.result_badge,
    quote: r.quote,
    videoUrl: r.video_url,
    posterUrl: r.poster_url,
    isVertical: r.is_vertical,
  }
}

/** Lee los testimonios activos ordenados. Devuelve [] ante cualquier error (la página no debe romper). */
export async function getActiveTestimonials(): Promise<FunnelTestimonial[]> {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('funnel_testimonials')
      .select('*')
      .eq('active', true)
      .order('sort_order', { ascending: true })
    if (error || !data) return []
    return (data as unknown as FunnelTestimonialRow[]).map(mapTestimonialRow)
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `npm run test -- lib/funnel/testimonials.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/funnel/testimonials.ts lib/funnel/testimonials.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): testimonials data layer (mapTestimonialRow + getActiveTestimonials)"
```

---

## Task 7: Copy de las páginas (config tipada + TDD de invariantes)

**Files:**
- Create: `lib/funnel/content.ts`
- Test: `lib/funnel/content.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Create `lib/funnel/content.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { TASACION_CONTENT, CLASE_CONTENT } from './content'

describe('funnel content', () => {
  it('tasación tiene headline, 3 beneficios y CTA', () => {
    expect(TASACION_CONTENT.hero.headline.length).toBeGreaterThan(10)
    expect(TASACION_CONTENT.benefits).toHaveLength(3)
    expect(TASACION_CONTENT.cta.label).toMatch(/TASACIÓN/i)
  })

  it('clase tiene headline y el form pide tipo de cliente', () => {
    expect(CLASE_CONTENT.hero.headline.length).toBeGreaterThan(10)
    expect(CLASE_CONTENT.form.tipoClienteOptions).toEqual([
      'Trabajo en el sector',
      'Soy Propietario/a',
    ])
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm run test -- lib/funnel/content.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementación (copy verbatim de las landings rescatadas)**

Create `lib/funnel/content.ts`:
```ts
export const TASACION_CONTENT = {
  topbar: 'Exclusivo para Propietarios en CABA y Zona Norte',
  hero: {
    headline: 'Evita Perder un 20% del Valor de tu Propiedad por Errores Evitables',
    subhead:
      'La mayoría de los propietarios se enfoca en el "precio de venta". Nosotros nos enfocamos en cuánto te queda en mano. Descubrí cómo la mayoría pierde miles de dólares sin darse cuenta en impuestos evitables, IVA, gastos, comisiones y malas negociaciones.',
    videoPath: 'web/tasacion-hero-web.mp4',
  },
  benefits: [
    {
      title: 'Conocé el dinero que te quedará en mano',
      body: 'Calculamos el dinero que te quedará luego de vender tomando en cuenta el precio de cierre real de tu propiedad.',
    },
    {
      title: 'Evitá Costos Ocultos',
      body: 'Identificamos exactamente qué impuestos, gastos de escritura, IVA y comisiones podrías evitar.',
    },
    {
      title: 'Defendé tu Precio Máximo',
      body: 'Te entrego una tasación estratégica con datos reales para que conozcas el mejor precio de tu propiedad para este mercado.',
    },
  ],
  stat: {
    number: '91%',
    body: 'De nuestros clientes que solicitaron la Tasación Estratégica y aplican el método, venden su propiedad en un máximo de 60 días.',
  },
  testimonialsHeading: 'No Hablemos Nosotros. Que Hablen los Resultados.',
  cta: {
    label: 'SOLICITAR MI TASACIÓN GRATUITA',
    note: '100% Gratuito, Confidencial y Sin Compromiso.',
  },
  finalHeading:
    '¿Listo para conocer el mejor precio de tu propiedad y el dinero que te quedará en mano?',
  form: {
    title: 'Completá los Datos',
    subtitle:
      'Para crear tu Análisis Estratégico, nuestro equipo necesita 2 datos clave de tu propiedad.',
  },
} as const

export const CLASE_CONTENT = {
  topbar: 'Esta página es solo para propietarios de CABA y Zona Norte',
  badge: 'CLASE GRATUITA',
  hero: {
    headline:
      'El método probado para vender tu propiedad al MEJOR Precio de Mercado en Menos de 30 Días.',
    subhead:
      'Accedé a la clase gratuita donde te revelo el plan exacto para atraer compradores calificados y cerrar una venta segura, incluso con un mercado tan complejo.',
    videoPath: 'web/clase-vsl-web.mp4',
    posterPath: 'raw/689e7d20f20a61e8e7ecf499.png',
    soundHint: 'Activá el sonido',
  },
  cta: { label: '¡Ver Clase GRATIS!', note: 'Clase 100% Virtual' },
  socialProofHeading:
    'Ayudamos a cientos de dueños a vender al mejor precio, sin estrés y en tiempo récord.',
  bio: {
    heading: '¿Quién Soy?',
    headshotPath: 'raw/68669289ec92f406df0238d6.png',
    name: 'Diego Ferreyra',
    role: 'Martillero Público — CUCICBA 8266',
  },
  form: {
    heading: 'Registrate a la Clase',
    subtitle: 'Ingresá tus datos para verla...',
    submitLabel: '¡Ver Clase GRATIS!',
    tipoClienteLabel: 'Soy...',
    tipoClienteOptions: ['Trabajo en el sector', 'Soy Propietario/a'] as const,
  },
} as const

export const BRAND = {
  logoPath: 'raw/682c6cc8e10a088724d26be6.png',
  footer: 'Inmobiliaria Diego Ferreyra — Todos los derechos reservados.',
  navy: '#0d2d49',
  green: '#00BF63',
} as const
```

- [ ] **Step 4: Correr para verificar que pasa**

Run: `npm run test -- lib/funnel/content.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/funnel/content.ts lib/funnel/content.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): page copy config + invariant tests"
```

---

## Task 8: Layout del route group `(funnels)` con fuentes premium

**Files:**
- Create: `app/(funnels)/layout.tsx`

- [ ] **Step 1: Escribir el layout**

Create `app/(funnels)/layout.tsx`:
```tsx
import type { ReactNode } from 'react'
import { Montserrat, Lato } from 'next/font/google'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-funnel-head',
  display: 'swap',
})
const lato = Lato({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-funnel-body',
  display: 'swap',
})

export default function FunnelLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${montserrat.variable} ${lato.variable} min-h-screen bg-white font-[family-name:var(--font-funnel-body)] text-[#333] antialiased`}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Verificar build (no se puede ver aún sin páginas; sólo typecheck)**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add "app/(funnels)/layout.tsx"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): route-group layout with Montserrat/Lato fonts"
```

---

## Task 9: Primitivo de animación `ScrollReveal` (framer-motion)

**Files:**
- Create: `components/funnel/ScrollReveal.tsx`

- [ ] **Step 1: Escribir el componente**

Create `components/funnel/ScrollReveal.tsx`:
```tsx
'use client'

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface ScrollRevealProps {
  children: ReactNode
  delay?: number
  className?: string
}

/** Reveal sutil al entrar en viewport. Respeta prefers-reduced-motion. */
export function ScrollReveal({ children, delay = 0, className }: ScrollRevealProps) {
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add components/funnel/ScrollReveal.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): ScrollReveal motion primitive (reduced-motion aware)"
```

---

## Task 10: `FunnelHeroVideo` (muted-autoplay + unmute) (TDD del toggle)

**Files:**
- Create: `components/funnel/FunnelHeroVideo.tsx`
- Test: `components/funnel/FunnelHeroVideo.test.tsx`

- [ ] **Step 1: Escribir el componente**

Create `components/funnel/FunnelHeroVideo.tsx`:
```tsx
'use client'

import { useRef, useState } from 'react'

interface FunnelHeroVideoProps {
  src: string
  poster?: string
  className?: string
}

/**
 * Video con autoplay MUTED + playsInline (única forma de autoplay confiable en móvil),
 * con overlay "Activá el sonido" que activa el audio al primer click.
 */
export function FunnelHeroVideo({ src, poster, className }: FunnelHeroVideoProps) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)

  function enableSound() {
    const v = ref.current
    if (!v) return
    v.muted = false
    setMuted(false)
    void v.play().catch(() => {})
  }

  return (
    <div className={`relative overflow-hidden rounded-xl ${className ?? ''}`}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        autoPlay
        playsInline
        loop
        controls={!muted}
        preload="metadata"
        className="h-full w-full"
      />
      {muted && (
        <button
          type="button"
          onClick={enableSound}
          aria-label="Activar el sonido del video"
          className="absolute inset-0 flex items-center justify-center bg-black/30 text-white transition hover:bg-black/40"
        >
          <span className="rounded-full bg-[#00BF63] px-5 py-2.5 text-sm font-bold shadow-lg">
            🔊 Activá el sonido
          </span>
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Escribir el test del toggle de sonido**

Create `components/funnel/FunnelHeroVideo.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunnelHeroVideo } from './FunnelHeroVideo'

describe('FunnelHeroVideo', () => {
  it('arranca muted con el overlay de sonido y lo activa al click', async () => {
    // happy-dom no implementa HTMLMediaElement.play → stub
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<FunnelHeroVideo src="https://x/v.mp4" poster="https://x/p.jpg" />)

    const btn = screen.getByRole('button', { name: /activar el sonido/i })
    expect(btn).toBeInTheDocument()

    await user.click(btn)
    expect(screen.queryByRole('button', { name: /activar el sonido/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Correr el test**

Run: `npm run test -- components/funnel/FunnelHeroVideo.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add components/funnel/FunnelHeroVideo.tsx components/funnel/FunnelHeroVideo.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): FunnelHeroVideo with muted-autoplay + unmute toggle"
```

---

## Task 11: `TestimonialCard` + `TestimonialLightbox` accesible (TDD a11y)

**Files:**
- Create: `components/funnel/TestimonialLightbox.tsx`
- Create: `components/funnel/TestimonialCard.tsx`
- Test: `components/funnel/TestimonialLightbox.test.tsx`

- [ ] **Step 1: Escribir el lightbox (focus-trap básico + ESC + scroll-lock)**

Create `components/funnel/TestimonialLightbox.tsx`:
```tsx
'use client'

import { useEffect, useRef } from 'react'

interface TestimonialLightboxProps {
  videoUrl: string
  clientName: string
  onClose: () => void
}

export function TestimonialLightbox({ videoUrl, clientName, onClose }: TestimonialLightboxProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Testimonio de ${clientName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-sm">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar video"
          className="absolute -top-10 right-0 text-2xl text-white"
        >
          ✕
        </button>
        <video
          src={videoUrl}
          controls
          autoPlay
          playsInline
          className="w-full rounded-xl bg-black"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Escribir la tarjeta**

Create `components/funnel/TestimonialCard.tsx`:
```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { TestimonialLightbox } from './TestimonialLightbox'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'

export function TestimonialCard({ t }: { t: FunnelTestimonial }) {
  const [open, setOpen] = useState(false)
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-[0_10px_40px_rgba(13,45,73,0.10)] ring-1 ring-black/5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Ver video testimonio de ${t.clientName}`}
        className="group relative aspect-[4/5] w-full overflow-hidden"
      >
        <Image
          src={t.posterUrl}
          alt={`Testimonio de ${t.clientName}`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-2xl text-[#0d2d49] shadow-lg transition group-hover:scale-110">
            ▶
          </span>
        </span>
        {t.resultBadge && (
          <span className="absolute left-3 top-3 rounded-full bg-[#00BF63] px-3 py-1 text-xs font-bold text-white shadow">
            {t.resultBadge}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <h3 className="font-[family-name:var(--font-funnel-head)] text-lg font-bold text-[#0d2d49]">
          {t.title}
        </h3>
        <p className="flex-1 text-sm leading-relaxed text-[#555]">“{t.quote}”</p>
        <p className="text-sm font-bold text-[#0d2d49]">
          {t.clientName}, <span className="font-normal text-[#777]">{t.location}</span>
        </p>
      </div>
      {open && (
        <TestimonialLightbox
          videoUrl={t.videoUrl}
          clientName={t.clientName}
          onClose={() => setOpen(false)}
        />
      )}
    </article>
  )
}
```

- [ ] **Step 3: Escribir el test a11y del lightbox**

Create `components/funnel/TestimonialLightbox.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TestimonialLightbox } from './TestimonialLightbox'

describe('TestimonialLightbox', () => {
  it('es un dialog modal, bloquea el scroll y cierra con ESC', async () => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<TestimonialLightbox videoUrl="https://x/v.mp4" clientName="Federico" onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cierra con el botón ✕', async () => {
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<TestimonialLightbox videoUrl="https://x/v.mp4" clientName="Pablo" onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /cerrar video/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 4: Correr el test**

Run: `npm run test -- components/funnel/TestimonialLightbox.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/funnel/TestimonialCard.tsx components/funnel/TestimonialLightbox.tsx components/funnel/TestimonialLightbox.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): accessible TestimonialCard + lightbox (ESC/scroll-lock/focus)"
```

---

## Task 12: `FunnelLeadForm` + `FunnelLeadModal` (UI, submit stub) (TDD)

> El submit real al CRM es Fase 2. Acá el form recibe un `onSubmit(values)` por prop; la página pasa un stub que resuelve éxito. Incluye honeypot inerte (campo oculto) que Fase 2 usará.

**Files:**
- Create: `components/funnel/FunnelLeadForm.tsx`
- Create: `components/funnel/FunnelLeadModal.tsx`
- Test: `components/funnel/FunnelLeadModal.test.tsx`

- [ ] **Step 1: Escribir el form**

Create `components/funnel/FunnelLeadForm.tsx`:
```tsx
'use client'

import { useState } from 'react'

export interface FunnelLeadValues {
  name: string
  phone: string
  email: string
  propertyLocation?: string
  tipoCliente?: string
  /** honeypot — debe quedar vacío */
  company?: string
}

interface FunnelLeadFormProps {
  variant: 'tasacion' | 'clase'
  submitLabel: string
  tipoClienteLabel?: string
  tipoClienteOptions?: readonly string[]
  onSubmit: (values: FunnelLeadValues) => Promise<void>
}

export function FunnelLeadForm({
  variant,
  submitLabel,
  tipoClienteLabel,
  tipoClienteOptions,
  onSubmit,
}: FunnelLeadFormProps) {
  const [values, setValues] = useState<FunnelLeadValues>({ name: '', phone: '', email: '', company: '' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  function set<K extends keyof FunnelLeadValues>(k: K, v: FunnelLeadValues[K]) {
    setValues((p) => ({ ...p, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (values.name.trim().length < 2) return setError('Ingresá tu nombre.')
    if (values.phone.trim().length < 6) return setError('Ingresá un teléfono válido.')
    if (!/.+@.+\..+/.test(values.email)) return setError('Ingresá un email válido.')
    setSubmitting(true)
    try {
      await onSubmit(values)
      setDone(true)
    } catch {
      setError('Hubo un problema. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <p role="status" className="py-6 text-center text-[#0d2d49]">
        ¡Listo! Recibimos tus datos. Te contactamos a la brevedad. ✅
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        aria-label="Nombre"
        placeholder="Tu nombre..."
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
      <input
        aria-label="Teléfono"
        type="tel"
        placeholder="Tu número de teléfono..."
        value={values.phone}
        onChange={(e) => set('phone', e.target.value)}
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
      <input
        aria-label="Email"
        type="email"
        placeholder="Tu mejor email..."
        value={values.email}
        onChange={(e) => set('email', e.target.value)}
        className="rounded-lg border border-[#DEE2E6] px-4 py-3"
      />
      {variant === 'tasacion' && (
        <input
          aria-label="Ubicación de la propiedad"
          placeholder="Barrio o dirección de tu propiedad..."
          value={values.propertyLocation ?? ''}
          onChange={(e) => set('propertyLocation', e.target.value)}
          className="rounded-lg border border-[#DEE2E6] px-4 py-3"
        />
      )}
      {variant === 'clase' && tipoClienteOptions && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold text-[#0d2d49]">{tipoClienteLabel}</legend>
          {tipoClienteOptions.map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tipoCliente"
                value={opt}
                checked={values.tipoCliente === opt}
                onChange={(e) => set('tipoCliente', e.target.value)}
              />
              {opt}
            </label>
          ))}
        </fieldset>
      )}
      {/* honeypot anti-spam (Fase 2 lo valida) */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        value={values.company ?? ''}
        onChange={(e) => set('company', e.target.value)}
        className="hidden"
        aria-hidden="true"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="mt-1 rounded-lg bg-[#00BF63] px-6 py-3.5 text-base font-bold text-white shadow-lg transition hover:brightness-95 disabled:opacity-60"
      >
        {submitting ? 'Enviando...' : submitLabel}
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Escribir el modal**

Create `components/funnel/FunnelLeadModal.tsx`:
```tsx
'use client'

import { useEffect, useRef } from 'react'
import { FunnelLeadForm, type FunnelLeadValues } from './FunnelLeadForm'

interface FunnelLeadModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle: string
  variant: 'tasacion' | 'clase'
  submitLabel: string
  tipoClienteLabel?: string
  tipoClienteOptions?: readonly string[]
  onSubmit: (values: FunnelLeadValues) => Promise<void>
}

export function FunnelLeadModal(props: FunnelLeadModalProps) {
  const { open, onClose, title, subtitle } = props
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar formulario"
          className="absolute right-4 top-4 text-xl text-[#999]"
        >
          ✕
        </button>
        <h2 className="font-[family-name:var(--font-funnel-head)] text-xl font-bold text-[#0d2d49]">
          {title}
        </h2>
        <p className="mb-4 mt-1 text-sm text-[#555]">{subtitle}</p>
        <FunnelLeadForm
          variant={props.variant}
          submitLabel={props.submitLabel}
          tipoClienteLabel={props.tipoClienteLabel}
          tipoClienteOptions={props.tipoClienteOptions}
          onSubmit={props.onSubmit}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Escribir el test del modal (open/close + validación + submit stub)**

Create `components/funnel/FunnelLeadModal.test.tsx`:
```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FunnelLeadModal } from './FunnelLeadModal'

const base = {
  open: true,
  onClose: () => {},
  title: 'Completá los Datos',
  subtitle: 'Necesitamos 2 datos clave.',
  variant: 'tasacion' as const,
  submitLabel: 'SOLICITAR',
}

describe('FunnelLeadModal', () => {
  it('no renderiza cuando open=false', () => {
    render(<FunnelLeadModal {...base} open={false} onSubmit={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('valida campos y llama onSubmit con datos válidos', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<FunnelLeadModal {...base} onSubmit={onSubmit} />)

    // submit vacío → error, no llama onSubmit
    await user.click(screen.getByRole('button', { name: 'SOLICITAR' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText(/ingresá tu nombre/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nombre'), 'Juan')
    await user.type(screen.getByLabelText('Teléfono'), '1133224455')
    await user.type(screen.getByLabelText('Email'), 'juan@mail.com')
    await user.click(screen.getByRole('button', { name: 'SOLICITAR' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: 'Juan', email: 'juan@mail.com' })
  })
})
```

- [ ] **Step 4: Correr el test**

Run: `npm run test -- components/funnel/FunnelLeadModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add components/funnel/FunnelLeadForm.tsx components/funnel/FunnelLeadModal.tsx components/funnel/FunnelLeadModal.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): lead form + modal UI (validation + honeypot + submit stub)"
```

---

## Task 13: Página Tasación + gracias

**Files:**
- Create: `app/(funnels)/tasacion-directa/page.tsx`
- Create: `app/(funnels)/tasacion-directa/TasacionClient.tsx`
- Create: `app/(funnels)/gracias-tasacion/page.tsx`

> El estado del modal y el CTA son interactivos → una isla cliente `TasacionClient` recibe los testimonios y el copy ya resueltos por el server component.

- [ ] **Step 1: Isla cliente con el layout visual + CTA + modal**

Create `app/(funnels)/tasacion-directa/TasacionClient.tsx`:
```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ScrollReveal } from '@/components/funnel/ScrollReveal'
import { FunnelHeroVideo } from '@/components/funnel/FunnelHeroVideo'
import { TestimonialCard } from '@/components/funnel/TestimonialCard'
import { FunnelLeadModal } from '@/components/funnel/FunnelLeadModal'
import type { FunnelLeadValues } from '@/components/funnel/FunnelLeadForm'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'
import { TASACION_CONTENT as C, BRAND } from '@/lib/funnel/content'

export function TasacionClient({
  testimonials,
  heroVideoUrl,
  logoUrl,
}: {
  testimonials: FunnelTestimonial[]
  heroVideoUrl: string
  logoUrl: string
}) {
  const [open, setOpen] = useState(false)

  // Fase 2 reemplaza este stub por el POST real a /api/funnel/submit
  async function handleSubmit(_values: FunnelLeadValues) {
    await new Promise((r) => setTimeout(r, 400))
  }

  const Cta = ({ note }: { note?: string }) => (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-[#00BF63] px-8 py-4 text-lg font-extrabold text-white shadow-xl transition hover:scale-[1.02] hover:brightness-95"
      >
        {C.cta.label}
      </button>
      {note && <p className="text-sm text-[#777]">{note}</p>}
    </div>
  )

  return (
    <main>
      {/* Topbar */}
      <div className="bg-[#0d2d49] py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">
        {C.topbar}
      </div>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 py-10 text-center">
        <Image src={logoUrl} alt="Diego Ferreyra" width={260} height={57} className="mx-auto mb-8 h-auto w-[240px]" priority />
        <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold leading-tight text-[#0d2d49] md:text-5xl">
          {C.hero.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#555] md:text-lg">
          {C.hero.subhead}
        </p>
        <div className="mx-auto mt-8 max-w-3xl">
          <FunnelHeroVideo src={heroVideoUrl} className="aspect-video" />
        </div>
        <div className="mt-8">
          <Cta note={C.cta.note} />
        </div>
      </section>

      {/* Benefits */}
      <section className="bg-[#F8F9FA] py-14">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 md:grid-cols-3">
          {C.benefits.map((b, i) => (
            <ScrollReveal key={b.title} delay={i * 0.1}>
              <div className="h-full rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                <h3 className="font-[family-name:var(--font-funnel-head)] text-lg font-bold text-[#0d2d49]">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#555]">{b.body}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Stat band */}
      <section className="bg-[#0d2d49] py-16 text-center text-white">
        <ScrollReveal>
          <p className="font-[family-name:var(--font-funnel-head)] text-6xl font-extrabold text-[#00BF63] md:text-7xl">
            {C.stat.number}
          </p>
          <p className="mx-auto mt-4 max-w-2xl px-4 text-base text-white/90">{C.stat.body}</p>
        </ScrollReveal>
      </section>

      {/* Testimonios */}
      {testimonials.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-center font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49] md:text-3xl">
            {C.testimonialsHeading}
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.key} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* Final CTA */}
      <section className="bg-[#F8F9FA] py-16 text-center">
        <h2 className="mx-auto max-w-2xl px-4 font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49]">
          {C.finalHeading}
        </h2>
        <div className="mt-8">
          <Cta />
        </div>
      </section>

      <footer className="bg-[#0d2d49] py-6 text-center text-xs text-white/70">
        © {new Date().getFullYear()} {BRAND.footer}
      </footer>

      <FunnelLeadModal
        open={open}
        onClose={() => setOpen(false)}
        title={C.form.title}
        subtitle={C.form.subtitle}
        variant="tasacion"
        submitLabel={C.cta.label}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
```

- [ ] **Step 2: Server component (data + SEO + visit tracking)**

Create `app/(funnels)/tasacion-directa/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { getActiveTestimonials } from '@/lib/funnel/testimonials'
import { funnelMediaUrl } from '@/lib/funnel/media'
import { TASACION_CONTENT, BRAND } from '@/lib/funnel/content'
import { TasacionClient } from './TasacionClient'

export const metadata: Metadata = {
  title: 'Tasación Estratégica Gratuita | Diego Ferreyra Inmobiliaria',
  description: TASACION_CONTENT.hero.subhead,
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Tasación Estratégica Gratuita',
    description: TASACION_CONTENT.hero.headline,
    type: 'website',
  },
}

export default async function TasacionPage() {
  const testimonials = await getActiveTestimonials()
  return (
    <>
      <LandingVisitTracker slug="tasacion-directa" funnelType="tasacion" />
      <TasacionClient
        testimonials={testimonials}
        heroVideoUrl={funnelMediaUrl(TASACION_CONTENT.hero.videoPath)}
        logoUrl={funnelMediaUrl(BRAND.logoPath)}
      />
    </>
  )
}
```

- [ ] **Step 3: Página de gracias**

Create `app/(funnels)/gracias-tasacion/page.tsx`:
```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '¡Gracias! | Tasación', robots: { index: false, follow: false } }

export default function GraciasTasacion() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold text-[#0d2d49]">
        ¡Recibimos tu solicitud! 🎉
      </h1>
      <p className="mt-4 text-[#555]">
        Nuestro equipo te va a contactar a la brevedad para coordinar tu Tasación Estratégica. Revisá
        tu WhatsApp y tu email.
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Verificar en el dev server**

Run: `npm run dev` y abrir `http://localhost:3000/tasacion-directa`
Expected: la página carga sin auth/redirect, muestra hero+video+beneficios+91%+testimonios+CTA; el botón abre el modal; los 3 testimonios abren el lightbox. (Si los testimonios no aparecen, confirmar que la migración Task 5 se aplicó.)

- [ ] **Step 5: Commit**

```bash
git add "app/(funnels)/tasacion-directa" "app/(funnels)/gracias-tasacion"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): native Tasación landing + gracias page (staging)"
```

---

## Task 14: Página Clase VSL + gracias

**Files:**
- Create: `app/(funnels)/vsl-clase-propietarios/page.tsx`
- Create: `app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx`
- Create: `app/(funnels)/gracias-clase/page.tsx`

- [ ] **Step 1: Isla cliente**

Create `app/(funnels)/vsl-clase-propietarios/ClaseClient.tsx`:
```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ScrollReveal } from '@/components/funnel/ScrollReveal'
import { FunnelHeroVideo } from '@/components/funnel/FunnelHeroVideo'
import { TestimonialCard } from '@/components/funnel/TestimonialCard'
import { FunnelLeadModal } from '@/components/funnel/FunnelLeadModal'
import type { FunnelLeadValues } from '@/components/funnel/FunnelLeadForm'
import type { FunnelTestimonial } from '@/lib/funnel/testimonials'
import { CLASE_CONTENT as C, BRAND } from '@/lib/funnel/content'

export function ClaseClient({
  testimonials,
  vslUrl,
  vslPoster,
  headshotUrl,
}: {
  testimonials: FunnelTestimonial[]
  vslUrl: string
  vslPoster: string
  headshotUrl: string
}) {
  const [open, setOpen] = useState(false)

  // Fase 2 reemplaza este stub por el POST real a /api/funnel/submit
  async function handleSubmit(_values: FunnelLeadValues) {
    await new Promise((r) => setTimeout(r, 400))
  }

  const Cta = () => (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-[#00BF63] px-10 py-4 text-lg font-extrabold text-white shadow-xl transition hover:scale-[1.02] hover:brightness-95"
      >
        {C.cta.label}
      </button>
      <p className="text-sm text-[#777]">{C.cta.note}</p>
    </div>
  )

  return (
    <main>
      <div className="bg-[#0d2d49] py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">
        {C.topbar}
      </div>

      <section className="mx-auto max-w-4xl px-4 py-10 text-center">
        <span className="inline-block rounded-full bg-[#00BF63]/15 px-4 py-1 text-sm font-bold uppercase tracking-wide text-[#00BF63]">
          {C.badge}
        </span>
        <h1 className="mx-auto mt-5 max-w-3xl font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold leading-tight text-[#0d2d49] md:text-5xl">
          {C.hero.headline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#555] md:text-lg">
          {C.hero.subhead}
        </p>
        <div className="mx-auto mt-8 max-w-3xl">
          <FunnelHeroVideo src={vslUrl} poster={vslPoster} className="aspect-video" />
        </div>
        <div className="mt-8">
          <Cta />
        </div>
      </section>

      {testimonials.length > 0 && (
        <section className="bg-[#F8F9FA] py-16">
          <h2 className="mx-auto max-w-3xl px-4 text-center font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49] md:text-3xl">
            {C.socialProofHeading}
          </h2>
          <div className="mx-auto mt-10 grid max-w-6xl gap-6 px-4 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((t) => (
              <TestimonialCard key={t.key} t={t} />
            ))}
          </div>
        </section>
      )}

      {/* ¿Quién soy? */}
      <section className="mx-auto flex max-w-4xl flex-col items-center gap-8 px-4 py-16 md:flex-row">
        <Image
          src={headshotUrl}
          alt={C.bio.name}
          width={220}
          height={220}
          className="h-44 w-44 shrink-0 rounded-full object-cover shadow-lg ring-4 ring-[#00BF63]/20"
        />
        <div>
          <h2 className="font-[family-name:var(--font-funnel-head)] text-2xl font-bold text-[#0d2d49]">
            {C.bio.heading}
          </h2>
          <p className="mt-1 text-lg font-bold text-[#0d2d49]">{C.bio.name}</p>
          <p className="text-sm text-[#777]">{C.bio.role}</p>
        </div>
      </section>

      <section className="bg-[#0d2d49] py-16 text-center">
        <ScrollReveal>
          <div className="px-4">
            <Cta />
          </div>
        </ScrollReveal>
      </section>

      <footer className="bg-[#0d2d49] py-6 text-center text-xs text-white/70">
        © {new Date().getFullYear()} {BRAND.footer}
      </footer>

      <FunnelLeadModal
        open={open}
        onClose={() => setOpen(false)}
        title={C.form.heading}
        subtitle={C.form.subtitle}
        variant="clase"
        submitLabel={C.form.submitLabel}
        tipoClienteLabel={C.form.tipoClienteLabel}
        tipoClienteOptions={C.form.tipoClienteOptions}
        onSubmit={handleSubmit}
      />
    </main>
  )
}
```

- [ ] **Step 2: Server component**

Create `app/(funnels)/vsl-clase-propietarios/page.tsx`:
```tsx
import type { Metadata } from 'next'
import { LandingVisitTracker } from '@/components/landing/LandingVisitTracker'
import { getActiveTestimonials } from '@/lib/funnel/testimonials'
import { funnelMediaUrl } from '@/lib/funnel/media'
import { CLASE_CONTENT } from '@/lib/funnel/content'
import { ClaseClient } from './ClaseClient'

export const metadata: Metadata = {
  title: '[Clase GRATUITA] Para Propietarios en CABA y Zona Norte',
  description: CLASE_CONTENT.hero.subhead,
  robots: { index: true, follow: true },
  openGraph: { title: CLASE_CONTENT.hero.headline, description: CLASE_CONTENT.hero.subhead, type: 'website' },
}

export default async function ClasePage() {
  const testimonials = await getActiveTestimonials()
  return (
    <>
      <LandingVisitTracker slug="vsl-clase-propietarios" funnelType="clase_gratuita" />
      <ClaseClient
        testimonials={testimonials}
        vslUrl={funnelMediaUrl(CLASE_CONTENT.hero.videoPath)}
        vslPoster={funnelMediaUrl(CLASE_CONTENT.hero.posterPath)}
        headshotUrl={funnelMediaUrl(CLASE_CONTENT.bio.headshotPath)}
      />
    </>
  )
}
```

- [ ] **Step 3: Página de gracias**

Create `app/(funnels)/gracias-clase/page.tsx`:
```tsx
import type { Metadata } from 'next'

export const metadata: Metadata = { title: '¡Gracias! | Clase', robots: { index: false, follow: false } }

export default function GraciasClase() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-4 text-center">
      <h1 className="font-[family-name:var(--font-funnel-head)] text-3xl font-extrabold text-[#0d2d49]">
        ¡Estás anotado! 🎉
      </h1>
      <p className="mt-4 text-[#555]">
        Te enviamos el acceso a la clase por email y WhatsApp. Revisá tu bandeja (y el spam, por las
        dudas).
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Verificar en el dev server**

Run: abrir `http://localhost:3000/vsl-clase-propietarios`
Expected: carga pública, VSL con poster + unmute, social proof, bio de Diego, CTA → modal con el radio "Tipo de cliente".

- [ ] **Step 5: Commit**

```bash
git add "app/(funnels)/vsl-clase-propietarios" "app/(funnels)/gracias-clase"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): native Clase VSL landing + gracias page (staging)"
```

---

## Task 15: Bypass de auth en middleware para las rutas de funnel

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Agregar el bypass público**

En `middleware.ts`, dentro de `middleware(request)`, junto al bloque que ya hace `if (request.nextUrl.pathname.startsWith('/p/'))`, agregar las rutas de funnel:
```ts
  // Rutas públicas de funnels (no requieren auth) — staging + producción
  const publicFunnelPaths = [
    '/tasacion-directa',
    '/vsl-clase-propietarios',
    '/gracias-tasacion',
    '/gracias-clase',
  ]
  if (
    request.nextUrl.pathname.startsWith('/p/') ||
    publicFunnelPaths.some((p) => request.nextUrl.pathname === p || request.nextUrl.pathname.startsWith(p + '/'))
  ) {
    return NextResponse.next()
  }
```
(Reemplaza el `if (... '/p/')` existente por este bloque combinado. No tocar el `return await updateSession(request)` final.)

- [ ] **Step 2: Verificar que el dashboard sigue protegido y los funnels públicos**

Run: con `npm run dev`, abrir en una ventana SIN sesión: `http://localhost:3000/tasacion-directa` (debe cargar), `http://localhost:3000/` (debe redirigir a /login).
Expected: funnels públicos OK; dashboard sigue redirigiendo a login.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(funnel): public middleware bypass for funnel routes"
```

---

## Task 16: Verificación final (build + tests + CWV)

- [ ] **Step 1: Suite de tests completa**

Run: `npm run test`
Expected: PASS (incluye media, testimonials, content, FunnelHeroVideo, TestimonialLightbox, FunnelLeadModal). Sin tests rotos preexistentes.

- [ ] **Step 2: Typecheck + lint + build de producción**

Run:
```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: sin errores. El build compila las rutas `(funnels)`.

- [ ] **Step 3: Smoke en build de producción**

Run: `npm run start` y abrir `/tasacion-directa` y `/vsl-clase-propietarios`.
Expected: ambas cargan, videos reproducen muted con overlay de sonido, modales y lightbox funcionan, testimonios desde DB.

- [ ] **Step 4: Core Web Vitals (mobile)**

Con el dev/prod corriendo, correr Lighthouse mobile (Chrome DevTools o `npx lighthouse http://localhost:3000/tasacion-directa --preset=desktop` y mobile).
Expected/objetivo: LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1. Si LCP alto, confirmar que el hero usa poster + `preload="metadata"` (no descarga el video entero antes del paint) y que el logo/headshot usan `next/image`.

- [ ] **Step 5: Commit final (si hubo ajustes)**

```bash
git add -A
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "chore(funnel): Fase 1 verification pass (build/tests/CWV)"
```

---

## Self-Review

**1. Spec coverage (vs §4 del spec):**
- Rutas públicas fuera de auth → Task 8 (layout) + Task 15 (middleware). ✅
- Stack visual motion (framer-motion) sin Lenis/3D → Task 9 + componentes. ✅
- Server Components + islas cliente → Tasks 13/14. ✅
- Hero poster + muted-autoplay + unmute → Task 10. ✅ CWV budget → Task 16. ✅
- Testimonios desde DB (tabla `funnel_testimonials`) → Task 5/6; render con frame real + badge → Task 4 (frames) + Task 11 (badge overlay). ✅
- Lightbox accesible (focus/ESC/scroll-lock) → Task 11. ✅
- Media re-alojada en `funnel-media` → Task 4 + helper Task 3. ✅
- Páginas de gracias → Tasks 13/14. ✅
- Visit tracking con `funnel_type` correcto → Tasks 13/14 (`LandingVisitTracker`). ✅
- Form Tasación pide ubicación; Clase pide tipo_cliente → Task 12. ✅
- **Explícitamente diferido:** submit real (Fase 2), Pixel/CAPI (Fase 3). El form usa `onSubmit` stub — documentado en Tasks 13/14 Step 1.

**2. Placeholder scan:** Sin "TBD/TODO/agregar estilos". El único stub (`handleSubmit`) es intencional y marcado como "Fase 2 lo reemplaza". El honeypot está presente pero inerte (Fase 2 lo valida). ✅

**3. Type consistency:** `FunnelTestimonial` (Task 6) se usa en `TestimonialCard` (Task 11) y en las islas (13/14). `FunnelLeadValues` (Task 12) se usa en el modal y las islas. `funnelMediaUrl` (Task 3) consistente en páginas. `funnelType` usa los valores del enum existente (`tasacion`/`clase_gratuita`) que `LandingVisitTracker` ya acepta. ✅

---

## Notas para Fase 2/3 (no implementar acá)
- Fase 2 reemplaza el `onSubmit` stub por `POST /api/funnel/submit` → `createFunnelLead()` (origin `embudo`/`clase_gratuita`, placeholder address, notificación correcta) + valida el honeypot + rate-limit. Redirige a `/gracias-*`.
- Fase 3 monta el Pixel (PageView/ViewContent + Lead/CompleteRegistration con `event_id` compartido) + CAPI inline con advanced matching. El `event_id` se genera en la isla cliente al hacer submit y se pasa al endpoint de Fase 2.
