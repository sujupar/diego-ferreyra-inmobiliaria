# Fase 1 — Publicación automática en portales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando una propiedad pasa a `status='approved'` con docs aprobados y fotos cargadas, el sistema publica automáticamente el aviso en MercadoLibre, Argenprop y ZonaProp, hace seguimiento por portal y sincroniza métricas (views, contactos, favoritos) diariamente.

**Architecture:** Adapter pattern (un archivo por portal). Trigger SQL inserta filas en `property_listings` por cada portal. Scheduled function worker procesa pendings cada 1 min con retries exponenciales. Credenciales por portal en env + tabla cifrada; portal sin creds queda `disabled` y los jobs esperan sin consumir intentos. UI muestra estado por portal en property detail con dashboard de métricas.

**Tech Stack:** Next.js 16, Supabase Postgres, Netlify scheduled functions (`.mts`), TypeScript, vitest para tests unitarios.

**Spec:** `docs/superpowers/specs/2026-05-12-portales-meta-ads-design.md`

---

## Milestones y checkpoints

- **M0**: Tooling (vitest setup) — 1 commit
- **M1**: Schema + RLS + trigger SQL — 1 PR mergeable
- **M2**: Adapter infrastructure — 1 PR
- **M3**: MercadoLibre adapter LIVE (con OAuth) — **/review checkpoint #1**, ya publicando en prod
- **M4**: Worker + scheduled function + retries — **/review checkpoint #2**
- **M5**: Argenprop adapter (esperando creds) — **/review checkpoint #3**
- **M6**: ZonaProp adapter (esperando creds) — **/review checkpoint #4**
- **M7**: UI dashboard en property detail — **/review checkpoint #5**
- **M8**: Admin settings, geocoding backfill, health, docs — **/review final Fase 1**

---

# M0 — Tooling base

### Task 0.1: Instalar vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Instalar dependencias**

```bash
npm install --save-dev vitest @vitest/ui happy-dom @types/node
```

- [ ] **Step 2: Crear `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules', '.next', '.netlify'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
```

- [ ] **Step 3: Agregar scripts a `package.json`**

Modificar la sección `scripts`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
}
```

- [ ] **Step 4: Verificar setup con un smoke test**

Crear archivo temporal `lib/__smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `npm test`
Expected: `1 passed`

Eliminar el archivo: `rm lib/__smoke.test.ts`

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit testing portal adapters"
```

---

# M1 — Schema, RLS y trigger

### Task 1.1: Migration extendiendo `properties` + tablas nuevas

**Files:**
- Create: `supabase/migrations/20260512000000_portal_listings_schema.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- =============================================================================
-- Migration: Schema para publicación automática en portales
-- Date: 2026-05-12
-- =============================================================================

-- 1. Extender properties con campos para portales
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS video_url text,
  ADD COLUMN IF NOT EXISTS tour_3d_url text,
  ADD COLUMN IF NOT EXISTS expensas numeric,
  ADD COLUMN IF NOT EXISTS amenities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS operation_type text DEFAULT 'venta',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS postal_code text;

COMMENT ON COLUMN public.properties.latitude IS 'Lat decimal para portales (ZonaProp/ML)';
COMMENT ON COLUMN public.properties.longitude IS 'Lng decimal para portales';
COMMENT ON COLUMN public.properties.amenities IS 'Array de strings: pileta, parrilla, sum, gym, etc.';
COMMENT ON COLUMN public.properties.operation_type IS 'venta | alquiler | temporario';

-- 2. property_listings: una fila por (propiedad, portal)
CREATE TABLE IF NOT EXISTS public.property_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  external_id text,
  external_url text,
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT NOW(),
  last_published_at timestamptz,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, portal)
);

CREATE INDEX IF NOT EXISTS idx_property_listings_status_next
  ON public.property_listings (status, next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_property_listings_property
  ON public.property_listings (property_id);

COMMENT ON COLUMN public.property_listings.status IS
  'pending | publishing | published | failed | disabled | paused';

-- 3. property_metrics_daily
CREATE TABLE IF NOT EXISTS public.property_metrics_daily (
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  date date NOT NULL,
  views int NOT NULL DEFAULT 0,
  contacts int NOT NULL DEFAULT 0,
  favorites int NOT NULL DEFAULT 0,
  whatsapps int NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (property_id, portal, date)
);

CREATE INDEX IF NOT EXISTS idx_property_metrics_property_date
  ON public.property_metrics_daily (property_id, date DESC);

-- 4. portal_credentials
CREATE TABLE IF NOT EXISTS public.portal_credentials (
  portal text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Seed con 3 portales en disabled
INSERT INTO public.portal_credentials (portal, enabled)
VALUES ('mercadolibre', false), ('argenprop', false), ('zonaprop', false)
ON CONFLICT (portal) DO NOTHING;

-- 5. property_publish_events (auditoría)
CREATE TABLE IF NOT EXISTS public.property_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES public.property_listings(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  event_type text NOT NULL,
  payload jsonb,
  error_message text,
  actor text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publish_events_property
  ON public.property_publish_events (property_id, created_at DESC);

-- 6. Trigger SQL: al captarse una propiedad, encolar publicaciones
CREATE OR REPLACE FUNCTION public.enqueue_property_listings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved'
     AND NEW.legal_status = 'approved'
     AND COALESCE(array_length(NEW.photos, 1), 0) >= 1
     AND (OLD.status IS DISTINCT FROM NEW.status
          OR OLD.legal_status IS DISTINCT FROM NEW.legal_status
          OR OLD.photos IS DISTINCT FROM NEW.photos)
  THEN
    INSERT INTO public.property_listings (property_id, portal, status)
    VALUES
      (NEW.id, 'mercadolibre', 'pending'),
      (NEW.id, 'argenprop', 'pending'),
      (NEW.id, 'zonaprop', 'pending')
    ON CONFLICT (property_id, portal) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enqueue_property_listings ON public.properties;
CREATE TRIGGER trg_enqueue_property_listings
  AFTER INSERT OR UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_property_listings();

-- 7. updated_at autoset
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_property_listings ON public.property_listings;
CREATE TRIGGER trg_touch_property_listings
  BEFORE UPDATE ON public.property_listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_portal_credentials ON public.portal_credentials;
CREATE TRIGGER trg_touch_portal_credentials
  BEFORE UPDATE ON public.portal_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Verificación post-migration:
-- SELECT portal, enabled FROM portal_credentials;
-- (esperado: 3 filas, enabled=false todas)
```

- [ ] **Step 2: Aplicar en Supabase Dashboard**

El usuario corre la migración manualmente en Supabase Dashboard → SQL Editor (CLI no funciona en este entorno, ver memory).

Verificar:
```sql
SELECT portal, enabled FROM portal_credentials;
-- Esperado: 3 filas
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260512000000_portal_listings_schema.sql
git commit -m "feat(portales): schema base property_listings + metrics + credentials + trigger"
```

---

### Task 1.2: RLS policies

**Files:**
- Create: `supabase/migrations/20260512000001_portal_listings_rls.sql`

- [ ] **Step 1: Escribir migración de RLS**

```sql
-- =============================================================================
-- Migration: RLS para tablas de portales
-- Date: 2026-05-12
-- =============================================================================

ALTER TABLE public.property_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_metrics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_publish_events ENABLE ROW LEVEL SECURITY;

-- property_listings: read según rol
DROP POLICY IF EXISTS listings_select ON public.property_listings;
CREATE POLICY listings_select ON public.property_listings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_listings.property_id
              AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- write solo service_role (default deny a authenticated, no policy = deny)

-- property_metrics_daily: mismo patrón
DROP POLICY IF EXISTS metrics_select ON public.property_metrics_daily;
CREATE POLICY metrics_select ON public.property_metrics_daily
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_metrics_daily.property_id
              AND pr.assigned_to = p.id
          ))
        )
    )
  );

-- portal_credentials: solo admin/dueno pueden leer
DROP POLICY IF EXISTS credentials_select ON public.portal_credentials;
CREATE POLICY credentials_select ON public.portal_credentials
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'dueno')
    )
  );

-- property_publish_events: read según rol
DROP POLICY IF EXISTS publish_events_select ON public.property_publish_events;
CREATE POLICY publish_events_select ON public.property_publish_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role IN ('admin', 'dueno', 'coordinador')
          OR (p.role = 'asesor' AND EXISTS (
            SELECT 1 FROM public.properties pr
            WHERE pr.id = property_publish_events.property_id
              AND pr.assigned_to = p.id
          ))
        )
    )
  );
```

- [ ] **Step 2: Aplicar en Supabase Dashboard**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260512000001_portal_listings_rls.sql
git commit -m "feat(portales): RLS por rol para listings, metrics, credentials, events"
```

---

### Task 1.3: Regenerar `database.types.ts`

**Files:**
- Modify: `types/database.types.ts`

- [ ] **Step 1: Agregar manualmente los nuevos tipos**

(En este proyecto la regeneración con CLI no funciona; los tipos se mantienen a mano. Buscar la sección de `Tables` y agregar los siguientes objetos.)

Agregar después de `properties`:

```ts
property_listings: {
  Row: {
    id: string
    property_id: string
    portal: string
    status: string
    external_id: string | null
    external_url: string | null
    attempts: number
    next_attempt_at: string | null
    last_published_at: string | null
    last_error: string | null
    metadata: Json
    created_at: string
    updated_at: string
  }
  Insert: {
    id?: string
    property_id: string
    portal: string
    status?: string
    external_id?: string | null
    external_url?: string | null
    attempts?: number
    next_attempt_at?: string | null
    last_published_at?: string | null
    last_error?: string | null
    metadata?: Json
    created_at?: string
    updated_at?: string
  }
  Update: {
    id?: string
    property_id?: string
    portal?: string
    status?: string
    external_id?: string | null
    external_url?: string | null
    attempts?: number
    next_attempt_at?: string | null
    last_published_at?: string | null
    last_error?: string | null
    metadata?: Json
    created_at?: string
    updated_at?: string
  }
  Relationships: []
}
property_metrics_daily: {
  Row: {
    property_id: string
    portal: string
    date: string
    views: number
    contacts: number
    favorites: number
    whatsapps: number
    raw: Json
  }
  Insert: {
    property_id: string
    portal: string
    date: string
    views?: number
    contacts?: number
    favorites?: number
    whatsapps?: number
    raw?: Json
  }
  Update: {
    property_id?: string
    portal?: string
    date?: string
    views?: number
    contacts?: number
    favorites?: number
    whatsapps?: number
    raw?: Json
  }
  Relationships: []
}
portal_credentials: {
  Row: {
    portal: string
    enabled: boolean
    access_token: string | null
    refresh_token: string | null
    expires_at: string | null
    metadata: Json
    updated_at: string
  }
  Insert: {
    portal: string
    enabled?: boolean
    access_token?: string | null
    refresh_token?: string | null
    expires_at?: string | null
    metadata?: Json
    updated_at?: string
  }
  Update: {
    portal?: string
    enabled?: boolean
    access_token?: string | null
    refresh_token?: string | null
    expires_at?: string | null
    metadata?: Json
    updated_at?: string
  }
  Relationships: []
}
property_publish_events: {
  Row: {
    id: string
    listing_id: string | null
    property_id: string | null
    portal: string
    event_type: string
    payload: Json | null
    error_message: string | null
    actor: string
    created_at: string
  }
  Insert: {
    id?: string
    listing_id?: string | null
    property_id?: string | null
    portal: string
    event_type: string
    payload?: Json | null
    error_message?: string | null
    actor?: string
    created_at?: string
  }
  Update: {
    id?: string
    listing_id?: string | null
    property_id?: string | null
    portal?: string
    event_type?: string
    payload?: Json | null
    error_message?: string | null
    actor?: string
    created_at?: string
  }
  Relationships: []
}
```

Y dentro de `properties.Row`/`Insert`/`Update` agregar los campos nuevos:
- `latitude: number | null`
- `longitude: number | null`
- `video_url: string | null`
- `tour_3d_url: string | null`
- `expensas: number | null`
- `amenities: Json`
- `operation_type: string`
- `title: string | null`
- `postal_code: string | null`

- [ ] **Step 2: Verificar typecheck**

```bash
npx tsc --noEmit
```

Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add types/database.types.ts
git commit -m "feat(portales): types para tablas nuevas + columnas extra en properties"
```

---

# M2 — Adapter infrastructure

### Task 2.1: Tipos compartidos

**Files:**
- Create: `lib/portals/types.ts`

- [ ] **Step 1: Definir interfaces y tipos**

```ts
import type { Database } from '@/types/database.types'

export type PortalName = 'mercadolibre' | 'argenprop' | 'zonaprop'

export type ListingStatus =
  | 'pending'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'disabled'
  | 'paused'

export type Property = Database['public']['Tables']['properties']['Row']
export type PropertyListing = Database['public']['Tables']['property_listings']['Row']
export type PortalCredentials = Database['public']['Tables']['portal_credentials']['Row']

export interface PublishResult {
  externalId: string
  externalUrl: string
  metadata?: Record<string, unknown>
}

export interface PortalMetricsPoint {
  date: string // YYYY-MM-DD
  views: number
  contacts: number
  favorites: number
  whatsapps: number
  raw: Record<string, unknown>
}

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

export interface PortalAdapter {
  readonly name: PortalName
  readonly enabled: boolean

  validate(property: Property): ValidationResult
  publish(property: Property): Promise<PublishResult>
  update(property: Property, externalId: string): Promise<void>
  unpublish(externalId: string): Promise<void>
  fetchMetrics(externalId: string, since: Date): Promise<PortalMetricsPoint[]>
}

export class PortalAdapterError extends Error {
  constructor(
    message: string,
    public readonly portal: PortalName,
    public readonly code: 'auth' | 'validation' | 'rate_limit' | 'network' | 'unknown',
    public readonly retryable: boolean,
    public readonly original?: unknown,
  ) {
    super(message)
    this.name = 'PortalAdapterError'
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/portals/types.ts
git commit -m "feat(portales): tipos compartidos PortalAdapter"
```

---

### Task 2.2: Credential resolver

**Files:**
- Create: `lib/portals/credentials.ts`
- Test: `lib/portals/credentials.test.ts`

- [ ] **Step 1: Escribir test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveCredentials } from './credentials'

describe('resolveCredentials', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns disabled when no env and no DB row enabled', async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }
    const result = await resolveCredentials('mercadolibre', { env: {}, supabase: fakeSupabase as any })
    expect(result.enabled).toBe(false)
  })

  it('returns enabled when env var present', async () => {
    const fakeSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null }),
          }),
        }),
      }),
    }
    const result = await resolveCredentials('mercadolibre', {
      env: { ML_APP_ID: 'x', ML_SECRET_KEY: 'y' },
      supabase: fakeSupabase as any,
    })
    expect(result.enabled).toBe(true)
    expect(result.appId).toBe('x')
  })
})
```

- [ ] **Step 2: Run test → debe fallar**

```bash
npm test -- credentials
```

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `credentials.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { PortalName } from './types'

export interface ResolvedCredentials {
  portal: PortalName
  enabled: boolean
  appId?: string
  secretKey?: string
  accessToken?: string
  refreshToken?: string
  apiKey?: string
  clientCode?: string
  metadata: Record<string, unknown>
}

interface ResolveOpts {
  env: Record<string, string | undefined>
  supabase: SupabaseClient<Database>
}

const ENV_MAP: Record<PortalName, { appId?: string; secret?: string; apiKey?: string; clientCode?: string }> = {
  mercadolibre: { appId: 'ML_APP_ID', secret: 'ML_SECRET_KEY' },
  argenprop: { apiKey: 'ARGENPROP_API_KEY', clientCode: 'ARGENPROP_CLIENT_CODE' },
  zonaprop: { apiKey: 'ZONAPROP_API_KEY', clientCode: 'ZONAPROP_CLIENT_CODE' },
}

export async function resolveCredentials(
  portal: PortalName,
  opts: ResolveOpts,
): Promise<ResolvedCredentials> {
  const envKeys = ENV_MAP[portal]
  const env = opts.env

  const fromEnv = {
    appId: envKeys.appId ? env[envKeys.appId] : undefined,
    secretKey: envKeys.secret ? env[envKeys.secret] : undefined,
    apiKey: envKeys.apiKey ? env[envKeys.apiKey] : undefined,
    clientCode: envKeys.clientCode ? env[envKeys.clientCode] : undefined,
  }

  const { data: row } = await opts.supabase
    .from('portal_credentials')
    .select('*')
    .eq('portal', portal)
    .maybeSingle()

  const accessToken = row?.access_token ?? undefined
  const refreshToken = row?.refresh_token ?? undefined
  const metadata = (row?.metadata as Record<string, unknown>) ?? {}

  const envEnabled = portal === 'mercadolibre'
    ? Boolean(fromEnv.appId && fromEnv.secretKey)
    : Boolean(fromEnv.apiKey && fromEnv.clientCode)

  const enabled = Boolean(row?.enabled) || envEnabled

  return {
    portal,
    enabled,
    appId: fromEnv.appId,
    secretKey: fromEnv.secretKey,
    accessToken,
    refreshToken,
    apiKey: fromEnv.apiKey,
    clientCode: fromEnv.clientCode,
    metadata,
  }
}
```

- [ ] **Step 4: Run test → debe pasar**

```bash
npm test -- credentials
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/portals/credentials.ts lib/portals/credentials.test.ts
git commit -m "feat(portales): resolver de credenciales con fallback env→DB"
```

---

### Task 2.3: Utilidad de validación común

**Files:**
- Create: `lib/portals/validation.ts`
- Test: `lib/portals/validation.test.ts`

- [ ] **Step 1: Tests primero**

```ts
import { describe, it, expect } from 'vitest'
import { validateCommon } from './validation'
import type { Property } from './types'

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1',
    appraisal_id: null,
    address: 'Av Libertador 1234',
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 1,
    covered_area: 75, total_area: 80, floor: 5, age: 10,
    asking_price: 150000, currency: 'USD', commission_percentage: 3,
    contract_start_date: null, contract_end_date: null, origin: null,
    status: 'approved', documents: [], photos: ['https://x/1.jpg'],
    legal_status: 'approved', legal_reviewer_id: null, legal_notes: null,
    legal_reviewed_at: null, legal_docs: null, legal_flags: null,
    created_by: null, assigned_to: null,
    created_at: '2026-05-12T00:00:00Z', updated_at: '2026-05-12T00:00:00Z',
    latitude: -34.5, longitude: -58.4,
    video_url: null, tour_3d_url: null, expensas: null,
    amenities: [], operation_type: 'venta',
    title: null, postal_code: null,
    description: null,
    ...overrides,
  } as Property
}

describe('validateCommon', () => {
  it('ok for a complete property', () => {
    const result = validateCommon(makeProperty())
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('fails when no photos', () => {
    const result = validateCommon(makeProperty({ photos: [] }))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain('Sin fotos')
  })

  it('fails when no lat/lng', () => {
    const result = validateCommon(makeProperty({ latitude: null, longitude: null }))
    expect(result.ok).toBe(false)
    expect(result.errors.some(e => e.includes('geolocalización'))).toBe(true)
  })

  it('warning when no description', () => {
    const result = validateCommon(makeProperty({ description: null }))
    expect(result.ok).toBe(true)
    expect(result.warnings.some(w => w.includes('descripción'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test → FAIL**

`npm test -- validation`

- [ ] **Step 3: Implementación**

```ts
import type { Property, ValidationResult } from './types'

export function validateCommon(property: Property): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!property.photos || property.photos.length === 0) errors.push('Sin fotos')
  if (property.latitude == null || property.longitude == null) {
    errors.push('Falta geolocalización (lat/lng)')
  }
  if (!property.asking_price) errors.push('Sin precio')
  if (!property.address) errors.push('Sin dirección')
  if (!property.property_type) errors.push('Sin tipo de propiedad')

  // Warnings (no bloquean)
  const description = (property as Property & { description?: string | null }).description
  if (!description || description.length < 100) {
    warnings.push('Falta descripción o es muy corta (<100 chars)')
  }
  if (!property.amenities || (Array.isArray(property.amenities) && property.amenities.length === 0)) {
    warnings.push('Sin amenities')
  }

  return { ok: errors.length === 0, errors, warnings }
}
```

- [ ] **Step 4: Run test → PASS**

`npm test -- validation`

- [ ] **Step 5: Commit**

```bash
git add lib/portals/validation.ts lib/portals/validation.test.ts
git commit -m "feat(portales): validación común de propiedad antes de publicar"
```

---

### Task 2.4: Adapter registry

**Files:**
- Create: `lib/portals/registry.ts`

- [ ] **Step 1: Implementación**

```ts
import type { PortalAdapter, PortalName } from './types'

const registry = new Map<PortalName, PortalAdapter>()

export function registerAdapter(adapter: PortalAdapter): void {
  registry.set(adapter.name, adapter)
}

export function getAdapter(name: PortalName): PortalAdapter | undefined {
  return registry.get(name)
}

export function listAdapters(): PortalAdapter[] {
  return Array.from(registry.values())
}

export function clearRegistry(): void {
  registry.clear()
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/portals/registry.ts
git commit -m "feat(portales): adapter registry singleton"
```

---

### Task 2.5: Backoff utility + audit log writer

**Files:**
- Create: `lib/portals/backoff.ts`
- Create: `lib/portals/audit.ts`
- Test: `lib/portals/backoff.test.ts`

- [ ] **Step 1: Tests backoff**

```ts
import { describe, it, expect } from 'vitest'
import { nextBackoff } from './backoff'

describe('nextBackoff', () => {
  it('returns 60 seconds for first attempt', () => {
    expect(nextBackoff(0)).toBe(60)
  })
  it('returns 300 for second', () => {
    expect(nextBackoff(1)).toBe(300)
  })
  it('returns 1500 for third', () => {
    expect(nextBackoff(2)).toBe(1500)
  })
  it('returns 7200 for fourth', () => {
    expect(nextBackoff(3)).toBe(7200)
  })
  it('returns 43200 for fifth', () => {
    expect(nextBackoff(4)).toBe(43200)
  })
  it('returns null past max', () => {
    expect(nextBackoff(5)).toBe(null)
  })
})
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementación `backoff.ts`**

```ts
const BACKOFF_SECONDS = [60, 300, 1500, 7200, 43200]

export function nextBackoff(attempt: number): number | null {
  return BACKOFF_SECONDS[attempt] ?? null
}

export function isoFromNow(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toISOString()
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Implementación `audit.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { PortalName } from './types'

export interface AuditEvent {
  listingId?: string | null
  propertyId: string
  portal: PortalName
  eventType: 'created' | 'updated' | 'published' | 'failed' | 'retried' | 'unpublished' | 'skipped_disabled'
  payload?: Record<string, unknown>
  errorMessage?: string
  actor?: string
}

export async function writeAudit(
  supabase: SupabaseClient<Database>,
  event: AuditEvent,
): Promise<void> {
  const { error } = await supabase.from('property_publish_events').insert({
    listing_id: event.listingId ?? null,
    property_id: event.propertyId,
    portal: event.portal,
    event_type: event.eventType,
    payload: (event.payload ?? null) as never,
    error_message: event.errorMessage ?? null,
    actor: event.actor ?? 'system',
  })
  if (error) console.error('[audit] failed to insert event', error)
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/portals/backoff.ts lib/portals/backoff.test.ts lib/portals/audit.ts
git commit -m "feat(portales): backoff exponencial + audit log writer"
```

---

# M3 — MercadoLibre adapter LIVE

### Task 3.1: ML OAuth callback endpoint

**Files:**
- Create: `app/api/oauth/mercadolibre/callback/route.ts`
- Create: `app/api/oauth/mercadolibre/start/route.ts`

- [ ] **Step 1: Endpoint de inicio del flow**

```ts
// app/api/oauth/mercadolibre/start/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const appId = process.env.ML_APP_ID
  if (!appId) {
    return NextResponse.json({ error: 'ML_APP_ID not configured' }, { status: 500 })
  }
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/mercadolibre/callback`
  const url = new URL('https://auth.mercadolibre.com.ar/authorization')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  return NextResponse.redirect(url.toString())
}
```

- [ ] **Step 2: Endpoint de callback**

```ts
// app/api/oauth/mercadolibre/callback/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'no code' }, { status: 400 })

  const appId = process.env.ML_APP_ID!
  const secret = process.env.ML_SECRET_KEY!
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/mercadolibre/callback`

  const tokenRes = await fetch('https://api.mercadolibre.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appId,
      client_secret: secret,
      code,
      redirect_uri: redirectUri,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return NextResponse.json({ error: 'token exchange failed', detail: text }, { status: 502 })
  }

  const data = await tokenRes.json() as {
    access_token: string
    refresh_token: string
    expires_in: number
    user_id: number
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

  await supabase.from('portal_credentials').upsert({
    portal: 'mercadolibre',
    enabled: true,
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
    metadata: { user_id: data.user_id },
  })

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?oauth=mercadolibre_ok`)
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/oauth/mercadolibre/
git commit -m "feat(portales): OAuth flow MercadoLibre (start + callback)"
```

---

### Task 3.2: ML client wrapper con refresh automático

**Files:**
- Create: `lib/portals/mercadolibre/client.ts`

- [ ] **Step 1: Implementación**

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { PortalAdapterError } from '../types'

const ML_BASE = 'https://api.mercadolibre.com'

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function getAccessToken(): Promise<string> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('portal_credentials')
    .select('*')
    .eq('portal', 'mercadolibre')
    .maybeSingle()

  if (error || !data) throw new PortalAdapterError('No ML credentials in DB', 'mercadolibre', 'auth', false)
  if (!data.enabled) throw new PortalAdapterError('ML disabled', 'mercadolibre', 'auth', false)

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const expiresSoon = expiresAt - Date.now() < 60 * 60 * 1000 // 1h

  if (!data.access_token || expiresSoon) {
    if (!data.refresh_token) {
      throw new PortalAdapterError('No refresh_token', 'mercadolibre', 'auth', false)
    }
    return refreshToken(data.refresh_token)
  }
  return data.access_token
}

async function refreshToken(refresh: string): Promise<string> {
  const res = await fetch(`${ML_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ML_APP_ID!,
      client_secret: process.env.ML_SECRET_KEY!,
      refresh_token: refresh,
    }),
  })
  if (!res.ok) {
    throw new PortalAdapterError('ML refresh failed', 'mercadolibre', 'auth', false)
  }
  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const supabase = getSupabase()
  await supabase.from('portal_credentials').update({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  }).eq('portal', 'mercadolibre')
  return data.access_token
}

export async function mlFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken()
  const res = await fetch(`${ML_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `ML ${res.status} ${path}: ${text}`,
      'mercadolibre',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/portals/mercadolibre/client.ts
git commit -m "feat(portales): ML client wrapper con refresh automático de token"
```

---

### Task 3.3: ML adapter — publish/update/unpublish/metrics

**Files:**
- Create: `lib/portals/mercadolibre/adapter.ts`
- Create: `lib/portals/mercadolibre/mapping.ts`
- Test: `lib/portals/mercadolibre/mapping.test.ts`

- [ ] **Step 1: Test del mapping property → ML payload**

```ts
import { describe, it, expect } from 'vitest'
import { propertyToMlPayload } from './mapping'

describe('propertyToMlPayload', () => {
  it('maps basic apartment for sale', () => {
    const property: any = {
      id: 'p1',
      title: 'Lindo dpto 3 amb Palermo',
      address: 'Honduras 5000', neighborhood: 'Palermo', city: 'CABA',
      property_type: 'departamento', rooms: 3, bedrooms: 2, bathrooms: 1,
      garages: 0, covered_area: 70, total_area: 75, age: 5,
      asking_price: 180000, currency: 'USD', operation_type: 'venta',
      latitude: -34.58, longitude: -58.43, photos: ['https://x/a.jpg', 'https://x/b.jpg'],
      description: 'Departamento luminoso de 3 ambientes con balcón aterrazado, muy cerca del subte D...',
      expensas: 50000, amenities: ['pileta', 'parrilla'],
      postal_code: '1414', floor: 5,
    }
    const payload = propertyToMlPayload(property)
    expect(payload.title).toContain('Palermo')
    expect(payload.currency_id).toBe('USD')
    expect(payload.price).toBe(180000)
    expect(payload.pictures.length).toBe(2)
    expect(payload.location.latitude).toBe(-34.58)
  })
})
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implementación `mapping.ts`**

```ts
import type { Property } from '../types'

interface MlPayload {
  title: string
  category_id: string
  price: number
  currency_id: string
  available_quantity: number
  buying_mode: 'classified'
  listing_type_id: string
  condition: 'new'
  pictures: { source: string }[]
  description: { plain_text: string }
  attributes: { id: string; value_name: string }[]
  location: { latitude: number; longitude: number; address_line: string }
}

// Categorías ML Inmuebles Argentina
const CATEGORY_MAP: Record<string, Record<string, string>> = {
  venta: {
    departamento: 'MLA1473',
    casa: 'MLA1472',
    ph: 'MLA1471',
    terreno: 'MLA1493',
    local: 'MLA1494',
    oficina: 'MLA1495',
  },
  alquiler: {
    departamento: 'MLA1463',
    casa: 'MLA1462',
  },
}

export function propertyToMlPayload(property: Property): MlPayload {
  const propWithDesc = property as Property & { description?: string | null }
  const operation = property.operation_type || 'venta'
  const type = (property.property_type || 'departamento').toLowerCase()
  const category = CATEGORY_MAP[operation]?.[type] ?? 'MLA1459'

  const title = (property.title ??
    `${type[0].toUpperCase() + type.slice(1)} ${property.rooms ?? ''} amb ${property.neighborhood}`).slice(0, 60)

  return {
    title,
    category_id: category,
    price: property.asking_price,
    currency_id: property.currency || 'USD',
    available_quantity: 1,
    buying_mode: 'classified',
    listing_type_id: 'silver',
    condition: 'new',
    pictures: (property.photos ?? []).slice(0, 12).map(source => ({ source })),
    description: { plain_text: propWithDesc.description ?? title },
    attributes: buildAttributes(property),
    location: {
      latitude: property.latitude!,
      longitude: property.longitude!,
      address_line: `${property.address}, ${property.neighborhood}, ${property.city}`,
    },
  }
}

function buildAttributes(property: Property): { id: string; value_name: string }[] {
  const attrs: { id: string; value_name: string }[] = []
  if (property.rooms) attrs.push({ id: 'ROOMS', value_name: String(property.rooms) })
  if (property.bedrooms) attrs.push({ id: 'BEDROOMS', value_name: String(property.bedrooms) })
  if (property.bathrooms) attrs.push({ id: 'BATHROOMS', value_name: String(property.bathrooms) })
  if (property.garages) attrs.push({ id: 'PARKING_LOTS', value_name: String(property.garages) })
  if (property.covered_area) attrs.push({ id: 'COVERED_AREA', value_name: `${property.covered_area} m²` })
  if (property.total_area) attrs.push({ id: 'TOTAL_AREA', value_name: `${property.total_area} m²` })
  if (property.expensas) attrs.push({ id: 'MAINTENANCE_FEE', value_name: `${property.expensas} ARS` })
  if (property.age != null) attrs.push({ id: 'PROPERTY_AGE', value_name: String(property.age) })
  return attrs
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Implementación `adapter.ts`**

```ts
import { mlFetch } from './client'
import { propertyToMlPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type { PortalAdapter, Property, PublishResult, PortalMetricsPoint, ValidationResult } from '../types'

export class MercadoLibreAdapter implements PortalAdapter {
  readonly name = 'mercadolibre' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    const base = validateCommon(property)
    const errors = [...base.errors]
    const warnings = [...base.warnings]
    if ((property.photos?.length ?? 0) === 0) {
      // Ya cubierto por validateCommon, pero ML lo exige explícitamente desde feb 2026
    }
    const propWithDesc = property as Property & { description?: string | null }
    if (!propWithDesc.description || propWithDesc.description.length < 100) {
      errors.push('ML requiere descripción ≥ 100 chars')
    }
    return { ok: errors.length === 0, errors, warnings }
  }

  async publish(property: Property): Promise<PublishResult> {
    const validation = this.validate(property)
    if (!validation.ok) {
      throw new PortalAdapterError(`Validación falló: ${validation.errors.join(', ')}`, 'mercadolibre', 'validation', false)
    }
    const payload = propertyToMlPayload(property)
    const created = await mlFetch<{ id: string; permalink: string }>('/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.permalink }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToMlPayload(property)
    // ML PUT no acepta category_id ni listing_type_id
    const { category_id: _c, listing_type_id: _l, ...updateable } = payload
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(updateable),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await mlFetch(`/items/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'closed' }),
    })
  }

  async fetchMetrics(externalId: string, since: Date): Promise<PortalMetricsPoint[]> {
    const sinceISO = since.toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const visits = await mlFetch<{ results: Array<{ date: string; total: number }> }>(
      `/items/${externalId}/visits/time_window?last=30&unit=day&ending=${today}`,
    ).catch(() => ({ results: [] }))

    const questions = await mlFetch<{ total: number }>(
      `/questions/search?item=${externalId}`,
    ).catch(() => ({ total: 0 }))

    const byDate = new Map<string, PortalMetricsPoint>()
    for (const v of visits.results ?? []) {
      const d = v.date.slice(0, 10)
      if (d < sinceISO) continue
      byDate.set(d, {
        date: d,
        views: v.total ?? 0,
        contacts: 0,
        favorites: 0,
        whatsapps: 0,
        raw: { source: 'ml_visits', value: v },
      })
    }
    if (byDate.has(today)) {
      const entry = byDate.get(today)!
      entry.contacts = questions.total ?? 0
    }
    return Array.from(byDate.values())
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/portals/mercadolibre/
git commit -m "feat(portales): MercadoLibre adapter completo (publish/update/unpublish/metrics)"
```

---

### Task 3.4: Registrar el ML adapter al booteo

**Files:**
- Create: `lib/portals/index.ts`

- [ ] **Step 1: Implementación**

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { registerAdapter, listAdapters } from './registry'
import { resolveCredentials } from './credentials'
import { MercadoLibreAdapter } from './mercadolibre/adapter'
import { ArgenpropAdapter } from './argenprop/adapter'
import { ZonapropAdapter } from './zonaprop/adapter'

let initialized = false

export async function initPortals(): Promise<void> {
  if (initialized) return
  initialized = true

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const mlCreds = await resolveCredentials('mercadolibre', { env: process.env, supabase })
  const apCreds = await resolveCredentials('argenprop', { env: process.env, supabase })
  const zpCreds = await resolveCredentials('zonaprop', { env: process.env, supabase })

  registerAdapter(new MercadoLibreAdapter(mlCreds.enabled))
  registerAdapter(new ArgenpropAdapter(apCreds.enabled))
  registerAdapter(new ZonapropAdapter(zpCreds.enabled))
}

export { listAdapters }
export { getAdapter } from './registry'
```

(Esto referencia ArgenpropAdapter y ZonapropAdapter que se crean en M5/M6 con esqueleto. Anticipamos los imports para no romper en cada milestone.)

- [ ] **Step 2: Crear stubs para que el import compile**

```ts
// lib/portals/argenprop/adapter.ts
import type { PortalAdapter, Property, PublishResult, PortalMetricsPoint, ValidationResult } from '../types'
import { PortalAdapterError } from '../types'

export class ArgenpropAdapter implements PortalAdapter {
  readonly name = 'argenprop' as const
  constructor(public readonly enabled: boolean) {}

  validate(): ValidationResult { return { ok: false, errors: ['Argenprop no implementado aún'], warnings: [] } }
  async publish(_p: Property): Promise<PublishResult> {
    throw new PortalAdapterError('Argenprop no implementado', 'argenprop', 'unknown', false)
  }
  async update(): Promise<void> { throw new PortalAdapterError('Argenprop no implementado', 'argenprop', 'unknown', false) }
  async unpublish(): Promise<void> { throw new PortalAdapterError('Argenprop no implementado', 'argenprop', 'unknown', false) }
  async fetchMetrics(): Promise<PortalMetricsPoint[]> { return [] }
}
```

```ts
// lib/portals/zonaprop/adapter.ts
import type { PortalAdapter, Property, PublishResult, PortalMetricsPoint, ValidationResult } from '../types'
import { PortalAdapterError } from '../types'

export class ZonapropAdapter implements PortalAdapter {
  readonly name = 'zonaprop' as const
  constructor(public readonly enabled: boolean) {}

  validate(): ValidationResult { return { ok: false, errors: ['ZonaProp no implementado aún'], warnings: [] } }
  async publish(_p: Property): Promise<PublishResult> {
    throw new PortalAdapterError('ZonaProp no implementado', 'zonaprop', 'unknown', false)
  }
  async update(): Promise<void> { throw new PortalAdapterError('ZonaProp no implementado', 'zonaprop', 'unknown', false) }
  async unpublish(): Promise<void> { throw new PortalAdapterError('ZonaProp no implementado', 'zonaprop', 'unknown', false) }
  async fetchMetrics(): Promise<PortalMetricsPoint[]> { return [] }
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/portals/index.ts lib/portals/argenprop/adapter.ts lib/portals/zonaprop/adapter.ts
git commit -m "feat(portales): registry init con 3 adapters (AP/ZP en stub)"
```

---

### Task 3.5: /review checkpoint #1 — MercadoLibre

- [ ] **Step 1: Smoke test manual**

1. Setear env vars `ML_APP_ID`, `ML_SECRET_KEY` en `.env.local`.
2. Setear `NEXT_PUBLIC_APP_URL=http://localhost:3000`.
3. `npm run dev`
4. Ir a `/api/oauth/mercadolibre/start` y completar el flow.
5. Verificar en Supabase que `portal_credentials.mercadolibre.enabled = true` y `access_token` está poblado.

- [ ] **Step 2: Ejecutar /review focalizado en MercadoLibre**

```
/review
```

(El sub-agent revisará M0-M3 mergeable, identificará issues. Plan de acción según output.)

- [ ] **Step 3: Iterar fixes que surjan del review hasta verde.**

---

# M4 — Worker scheduled function + retries

### Task 4.1: Worker `publish-listings.mts`

**Files:**
- Create: `netlify/functions/publish-listings.mts`

- [ ] **Step 1: Implementación self-contained**

(Siguiendo patrón del proyecto: las scheduled functions son self-contained, no importan de `lib/`. Sin embargo, este worker SÍ puede importar de `lib/portals/` porque corre con bundling de Netlify Functions v2.)

```ts
import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { initPortals, getAdapter } from '@/lib/portals'
import { nextBackoff, isoFromNow } from '@/lib/portals/backoff'
import { writeAudit } from '@/lib/portals/audit'
import type { PortalName } from '@/lib/portals/types'

export default async () => {
  await initPortals()
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Pickear hasta 10 pendings cuyo next_attempt_at <= NOW()
  const { data: listings, error } = await supabase
    .from('property_listings')
    .select('*')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(10)

  if (error) {
    console.error('[publish-listings] fetch error', error)
    return new Response('error', { status: 500 })
  }
  if (!listings || listings.length === 0) {
    return new Response('no pending', { status: 200 })
  }

  for (const listing of listings) {
    const adapter = getAdapter(listing.portal as PortalName)
    if (!adapter) {
      console.warn(`[publish-listings] no adapter for ${listing.portal}`)
      continue
    }
    if (!adapter.enabled) {
      // Portal disabled — skipear sin consumir intentos
      await writeAudit(supabase, {
        listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName,
        eventType: 'skipped_disabled',
      })
      continue
    }

    // Lock atomic: marcar como publishing solo si sigue en pending
    const { data: locked } = await supabase
      .from('property_listings')
      .update({ status: 'publishing' })
      .eq('id', listing.id)
      .eq('status', 'pending')
      .select()
      .maybeSingle()
    if (!locked) continue // otro worker se lo llevó

    // Cargar property
    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', listing.property_id)
      .single()

    if (!property) {
      await supabase.from('property_listings').update({
        status: 'failed', last_error: 'Property not found',
      }).eq('id', listing.id)
      continue
    }

    try {
      const result = await adapter.publish(property)
      await supabase.from('property_listings').update({
        status: 'published',
        external_id: result.externalId,
        external_url: result.externalUrl,
        last_published_at: new Date().toISOString(),
        last_error: null,
        attempts: listing.attempts + 1,
      }).eq('id', listing.id)
      await writeAudit(supabase, {
        listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName,
        eventType: 'published', payload: { externalId: result.externalId, externalUrl: result.externalUrl },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const attempts = listing.attempts + 1
      const backoff = nextBackoff(attempts - 1)
      const isRetryable = !(err && typeof err === 'object' && 'retryable' in err && (err as { retryable: boolean }).retryable === false)

      if (backoff && isRetryable) {
        await supabase.from('property_listings').update({
          status: 'pending',
          attempts,
          next_attempt_at: isoFromNow(backoff),
          last_error: message,
        }).eq('id', listing.id)
        await writeAudit(supabase, {
          listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName,
          eventType: 'retried', errorMessage: message, payload: { attempts, backoff },
        })
      } else {
        await supabase.from('property_listings').update({
          status: 'failed',
          attempts,
          last_error: message,
        }).eq('id', listing.id)
        await writeAudit(supabase, {
          listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName,
          eventType: 'failed', errorMessage: message,
        })
      }
    }
  }

  return new Response('ok', { status: 200 })
}

export const config: Config = {
  schedule: '* * * * *', // cada 1 min
}
```

- [ ] **Step 2: Verificar tipo Config válido**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Smoke test local (opcional)**

`netlify dev` y crear un listing manualmente para que el worker lo procese, o esperar el deploy.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/publish-listings.mts
git commit -m "feat(portales): scheduled function publish-listings cada 1min con retries"
```

---

### Task 4.2: Worker `sync-portal-metrics.mts`

**Files:**
- Create: `netlify/functions/sync-portal-metrics.mts`

- [ ] **Step 1: Implementación**

```ts
import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { initPortals, getAdapter } from '@/lib/portals'
import type { PortalName } from '@/lib/portals/types'

export default async () => {
  await initPortals()
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: listings } = await supabase
    .from('property_listings')
    .select('*')
    .eq('status', 'published')
    .not('external_id', 'is', null)

  if (!listings) return new Response('no listings', { status: 200 })

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // últimos 7 días

  for (const listing of listings) {
    const adapter = getAdapter(listing.portal as PortalName)
    if (!adapter || !adapter.enabled || !listing.external_id) continue

    try {
      const points = await adapter.fetchMetrics(listing.external_id, since)
      for (const p of points) {
        await supabase.from('property_metrics_daily').upsert({
          property_id: listing.property_id,
          portal: listing.portal,
          date: p.date,
          views: p.views,
          contacts: p.contacts,
          favorites: p.favorites,
          whatsapps: p.whatsapps,
          raw: p.raw as never,
        })
      }
    } catch (err) {
      console.error(`[sync-metrics] ${listing.portal} ${listing.id}`, err)
    }
  }

  return new Response('ok', { status: 200 })
}

export const config: Config = {
  schedule: '0 */6 * * *', // cada 6h
}
```

- [ ] **Step 2: Commit**

```bash
git add netlify/functions/sync-portal-metrics.mts
git commit -m "feat(portales): scheduled function sync-portal-metrics cada 6h"
```

---

### Task 4.3: Update trigger para edits post-publicación

**Files:**
- Create: `supabase/migrations/20260512000002_property_updates_trigger.sql`

- [ ] **Step 1: Trigger SQL**

```sql
-- =============================================================================
-- Migration: cuando se actualiza una propiedad ya publicada, reencolar update
-- Date: 2026-05-12
-- =============================================================================

CREATE OR REPLACE FUNCTION public.requeue_listings_on_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Solo si la propiedad está aprobada y cambió un campo relevante
  IF NEW.status = 'approved'
     AND (
       OLD.asking_price IS DISTINCT FROM NEW.asking_price
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.description IS DISTINCT FROM NEW.description
       OR OLD.photos IS DISTINCT FROM NEW.photos
       OR OLD.amenities IS DISTINCT FROM NEW.amenities
       OR OLD.expensas IS DISTINCT FROM NEW.expensas
     )
  THEN
    -- Para listings ya publicados, marcamos un flag en metadata para que el worker haga update
    UPDATE public.property_listings
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{needs_update}', 'true'::jsonb)
    WHERE property_id = NEW.id AND status = 'published';
  END IF;

  -- Si la propiedad se marca como vendida o retirada, despublicar
  IF NEW.status IN ('sold', 'withdrawn') AND OLD.status <> NEW.status THEN
    UPDATE public.property_listings
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{needs_unpublish}', 'true'::jsonb)
    WHERE property_id = NEW.id AND status = 'published';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_requeue_listings_on_update ON public.properties;
CREATE TRIGGER trg_requeue_listings_on_update
  AFTER UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.requeue_listings_on_update();
```

- [ ] **Step 2: Actualizar worker para procesar updates/unpublishes**

Modificar `netlify/functions/publish-listings.mts`, agregar antes del bloque de pendings:

```ts
// Procesar updates pending
const { data: updates } = await supabase
  .from('property_listings')
  .select('*')
  .eq('status', 'published')
  .contains('metadata', { needs_update: true })
  .limit(10)

for (const listing of updates ?? []) {
  const adapter = getAdapter(listing.portal as PortalName)
  if (!adapter || !adapter.enabled || !listing.external_id) continue
  const { data: property } = await supabase.from('properties').select('*').eq('id', listing.property_id).single()
  if (!property) continue
  try {
    await adapter.update(property, listing.external_id)
    const meta = { ...(listing.metadata as Record<string, unknown>) }
    delete meta.needs_update
    await supabase.from('property_listings').update({ metadata: meta as never }).eq('id', listing.id)
    await writeAudit(supabase, {
      listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName,
      eventType: 'updated',
    })
  } catch (err) {
    console.error(`[update-listing] ${listing.portal} ${listing.id}`, err)
  }
}

// Procesar unpublishes pending
const { data: unpubs } = await supabase
  .from('property_listings')
  .select('*')
  .eq('status', 'published')
  .contains('metadata', { needs_unpublish: true })
  .limit(10)

for (const listing of unpubs ?? []) {
  const adapter = getAdapter(listing.portal as PortalName)
  if (!adapter || !adapter.enabled || !listing.external_id) continue
  try {
    await adapter.unpublish(listing.external_id)
    await supabase.from('property_listings').update({ status: 'paused' }).eq('id', listing.id)
    await writeAudit(supabase, {
      listingId: listing.id, propertyId: listing.property_id, portal: listing.portal as PortalName,
      eventType: 'unpublished',
    })
  } catch (err) {
    console.error(`[unpublish-listing] ${listing.portal} ${listing.id}`, err)
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260512000002_property_updates_trigger.sql netlify/functions/publish-listings.mts
git commit -m "feat(portales): trigger + worker para updates y unpublishes automáticos"
```

---

### Task 4.4: /review checkpoint #2 — Worker

- [ ] **Step 1: Ejecutar /review**

```
/review
```

- [ ] **Step 2: Resolver issues que surjan.**

---

# M5 — Argenprop adapter

### Task 5.1: Argenprop client wrapper

**Files:**
- Create: `lib/portals/argenprop/client.ts`

- [ ] **Step 1: Implementación**

```ts
import { PortalAdapterError } from '../types'

// Endpoint base provisto por Argenprop al recibir credenciales.
// Por ahora, asumimos el patrón estándar de API REST de la spec pública.
const AP_BASE = process.env.ARGENPROP_API_BASE ?? 'https://api.argenprop.com/v1'

export async function apFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = process.env.ARGENPROP_API_KEY
  const clientCode = process.env.ARGENPROP_CLIENT_CODE
  if (!apiKey || !clientCode) {
    throw new PortalAdapterError('Missing AP credentials', 'argenprop', 'auth', false)
  }
  const res = await fetch(`${AP_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'x-client-code': clientCode,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `AP ${res.status} ${path}: ${text}`,
      'argenprop',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/portals/argenprop/client.ts
git commit -m "feat(portales): Argenprop client wrapper (espera credenciales)"
```

---

### Task 5.2: Argenprop mapping + adapter completo

**Files:**
- Modify: `lib/portals/argenprop/adapter.ts`
- Create: `lib/portals/argenprop/mapping.ts`

- [ ] **Step 1: Mapping property → Argenprop payload**

```ts
import type { Property } from '../types'

interface ApPayload {
  operation: string // 'venta' | 'alquiler'
  propertyType: string // 'departamento' | 'casa' | etc.
  title: string
  description: string
  price: { amount: number; currency: string }
  expenses?: { amount: number; currency: string }
  address: { street: string; neighborhood: string; city: string; lat: number; lng: number; postalCode?: string }
  features: {
    rooms?: number
    bedrooms?: number
    bathrooms?: number
    garages?: number
    coveredArea?: number
    totalArea?: number
    age?: number
    floor?: number
    amenities: string[]
  }
  media: { photos: string[]; videoUrl?: string; tour3dUrl?: string }
}

export function propertyToApPayload(property: Property): ApPayload {
  const propWithDesc = property as Property & { description?: string | null }
  return {
    operation: property.operation_type || 'venta',
    propertyType: property.property_type || 'departamento',
    title: property.title || `${property.property_type} en ${property.neighborhood}`,
    description: propWithDesc.description || property.address,
    price: { amount: property.asking_price, currency: property.currency || 'USD' },
    expenses: property.expensas ? { amount: property.expensas, currency: 'ARS' } : undefined,
    address: {
      street: property.address,
      neighborhood: property.neighborhood,
      city: property.city || 'CABA',
      lat: property.latitude!,
      lng: property.longitude!,
      postalCode: property.postal_code ?? undefined,
    },
    features: {
      rooms: property.rooms ?? undefined,
      bedrooms: property.bedrooms ?? undefined,
      bathrooms: property.bathrooms ?? undefined,
      garages: property.garages ?? undefined,
      coveredArea: property.covered_area ?? undefined,
      totalArea: property.total_area ?? undefined,
      age: property.age ?? undefined,
      floor: property.floor ?? undefined,
      amenities: Array.isArray(property.amenities) ? (property.amenities as string[]) : [],
    },
    media: {
      photos: property.photos ?? [],
      videoUrl: property.video_url ?? undefined,
      tour3dUrl: property.tour_3d_url ?? undefined,
    },
  }
}
```

- [ ] **Step 2: Reemplazar `argenprop/adapter.ts`**

```ts
import { apFetch } from './client'
import { propertyToApPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type { PortalAdapter, Property, PublishResult, PortalMetricsPoint, ValidationResult } from '../types'

export class ArgenpropAdapter implements PortalAdapter {
  readonly name = 'argenprop' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    return validateCommon(property)
  }

  async publish(property: Property): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(`Validación falló: ${v.errors.join(', ')}`, 'argenprop', 'validation', false)
    }
    const payload = propertyToApPayload(property)
    const created = await apFetch<{ id: string; url: string }>('/ads', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.url }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToApPayload(property)
    await apFetch(`/ads/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await apFetch(`/ads/${externalId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ active: false }),
    })
  }

  async fetchMetrics(externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    const stats = await apFetch<{ daily: Array<{ date: string; views: number; contacts: number; favorites: number }> }>(
      `/ads/${externalId}/stats?days=30`,
    ).catch(() => ({ daily: [] }))
    return (stats.daily ?? []).map(d => ({
      date: d.date.slice(0, 10),
      views: d.views ?? 0,
      contacts: d.contacts ?? 0,
      favorites: d.favorites ?? 0,
      whatsapps: 0,
      raw: { source: 'argenprop_stats', value: d },
    }))
  }
}
```

(Nota: cuando lleguen las credenciales y la documentación oficial, podemos ajustar los endpoints y campos exactos. La estructura está lista; cambios menores en mapping.)

- [ ] **Step 3: Commit**

```bash
git add lib/portals/argenprop/
git commit -m "feat(portales): Argenprop adapter completo (queda enabled=false hasta credenciales)"
```

---

### Task 5.3: /review checkpoint #3 — Argenprop

- [ ] Ejecutar `/review`.
- [ ] Resolver issues.

---

# M6 — ZonaProp adapter

### Task 6.1: ZonaProp client + mapping + adapter

**Files:**
- Create: `lib/portals/zonaprop/client.ts`
- Create: `lib/portals/zonaprop/mapping.ts`
- Modify: `lib/portals/zonaprop/adapter.ts`

- [ ] **Step 1: Client**

```ts
// lib/portals/zonaprop/client.ts
import { PortalAdapterError } from '../types'

const ZP_BASE = process.env.ZONAPROP_API_BASE ?? 'https://api.zonaprop.com.ar/v2'

export async function zpFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const apiKey = process.env.ZONAPROP_API_KEY
  const clientCode = process.env.ZONAPROP_CLIENT_CODE
  if (!apiKey || !clientCode) {
    throw new PortalAdapterError('Missing ZP credentials', 'zonaprop', 'auth', false)
  }
  const res = await fetch(`${ZP_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
      'x-client-code': clientCode,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    const retryable = res.status >= 500 || res.status === 429
    throw new PortalAdapterError(
      `ZP ${res.status} ${path}: ${text}`,
      'zonaprop',
      res.status === 401 ? 'auth' : res.status === 429 ? 'rate_limit' : 'unknown',
      retryable,
    )
  }
  return res.json() as Promise<T>
}
```

- [ ] **Step 2: Mapping**

```ts
// lib/portals/zonaprop/mapping.ts
import type { Property } from '../types'

interface ZpPayload {
  operationType: string
  propertyType: string
  title: string
  description: string
  price: number
  currency: string
  expenses?: number
  location: { address: string; neighborhood: string; city: string; latitude: number; longitude: number; postalCode?: string }
  characteristics: {
    rooms?: number; bedrooms?: number; bathrooms?: number; parkings?: number
    coveredSurface?: number; totalSurface?: number; floor?: number; age?: number
  }
  amenities: string[]
  photos: string[]
  videoUrl?: string
  virtualTourUrl?: string
}

export function propertyToZpPayload(property: Property): ZpPayload {
  const propWithDesc = property as Property & { description?: string | null }
  return {
    operationType: property.operation_type || 'venta',
    propertyType: property.property_type || 'departamento',
    title: property.title || `${property.property_type} en ${property.neighborhood}`,
    description: propWithDesc.description || property.address,
    price: property.asking_price,
    currency: property.currency || 'USD',
    expenses: property.expensas ?? undefined,
    location: {
      address: property.address,
      neighborhood: property.neighborhood,
      city: property.city || 'CABA',
      latitude: property.latitude!,
      longitude: property.longitude!,
      postalCode: property.postal_code ?? undefined,
    },
    characteristics: {
      rooms: property.rooms ?? undefined,
      bedrooms: property.bedrooms ?? undefined,
      bathrooms: property.bathrooms ?? undefined,
      parkings: property.garages ?? undefined,
      coveredSurface: property.covered_area ?? undefined,
      totalSurface: property.total_area ?? undefined,
      floor: property.floor ?? undefined,
      age: property.age ?? undefined,
    },
    amenities: Array.isArray(property.amenities) ? (property.amenities as string[]) : [],
    photos: property.photos ?? [],
    videoUrl: property.video_url ?? undefined,
    virtualTourUrl: property.tour_3d_url ?? undefined,
  }
}
```

- [ ] **Step 3: Adapter**

```ts
// lib/portals/zonaprop/adapter.ts (reemplazar el stub)
import { zpFetch } from './client'
import { propertyToZpPayload } from './mapping'
import { validateCommon } from '../validation'
import { PortalAdapterError } from '../types'
import type { PortalAdapter, Property, PublishResult, PortalMetricsPoint, ValidationResult } from '../types'

export class ZonapropAdapter implements PortalAdapter {
  readonly name = 'zonaprop' as const

  constructor(public readonly enabled: boolean) {}

  validate(property: Property): ValidationResult {
    const base = validateCommon(property)
    const errors = [...base.errors]
    const warnings = [...base.warnings]
    if ((property.photos?.length ?? 0) < 10) {
      warnings.push('ZonaProp recomienda ≥10 fotos para mejor calidad de aviso')
    }
    const propWithDesc = property as Property & { description?: string | null }
    if (!propWithDesc.description || propWithDesc.description.length < 300) {
      warnings.push('ZonaProp recomienda descripción ≥300 chars')
    }
    return { ok: errors.length === 0, errors, warnings }
  }

  async publish(property: Property): Promise<PublishResult> {
    const v = this.validate(property)
    if (!v.ok) {
      throw new PortalAdapterError(`Validación falló: ${v.errors.join(', ')}`, 'zonaprop', 'validation', false)
    }
    const payload = propertyToZpPayload(property)
    const created = await zpFetch<{ id: string; publicUrl: string }>('/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return { externalId: created.id, externalUrl: created.publicUrl }
  }

  async update(property: Property, externalId: string): Promise<void> {
    const payload = propertyToZpPayload(property)
    await zpFetch(`/listings/${externalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async unpublish(externalId: string): Promise<void> {
    await zpFetch(`/listings/${externalId}`, { method: 'DELETE' })
  }

  async fetchMetrics(externalId: string, _since: Date): Promise<PortalMetricsPoint[]> {
    const stats = await zpFetch<{ daily: Array<{ date: string; views: number; contacts: number; favorites: number; whatsapps: number }> }>(
      `/listings/${externalId}/stats?range=30d`,
    ).catch(() => ({ daily: [] }))
    return (stats.daily ?? []).map(d => ({
      date: d.date.slice(0, 10),
      views: d.views ?? 0,
      contacts: d.contacts ?? 0,
      favorites: d.favorites ?? 0,
      whatsapps: d.whatsapps ?? 0,
      raw: { source: 'zonaprop_stats', value: d },
    }))
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/portals/zonaprop/
git commit -m "feat(portales): ZonaProp adapter completo (queda enabled=false hasta credenciales)"
```

---

### Task 6.2: /review checkpoint #4 — ZonaProp

- [ ] Ejecutar `/review`.
- [ ] Resolver issues.

---

# M7 — UI dashboard en property detail

### Task 7.1: API endpoint para listings de una propiedad

**Files:**
- Create: `app/api/properties/[id]/listings/route.ts`

- [ ] **Step 1: Implementación**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('property_listings')
    .select('*')
    .eq('property_id', id)
    .order('portal', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/properties/[id]/listings/
git commit -m "feat(portales): GET /api/properties/[id]/listings"
```

---

### Task 7.2: API endpoint para métricas

**Files:**
- Create: `app/api/properties/[id]/portal-metrics/route.ts`

- [ ] **Step 1: Implementación**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') ?? '30', 10)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('property_metrics_daily')
    .select('*')
    .eq('property_id', id)
    .gte('date', since)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/properties/[id]/portal-metrics/
git commit -m "feat(portales): GET /api/properties/[id]/portal-metrics?days=N"
```

---

### Task 7.3: Componente ListingsCard

**Files:**
- Create: `components/properties/PortalListingsCard.tsx`

- [ ] **Step 1: Implementación**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle, Clock, AlertTriangle, XCircle, RefreshCw, ExternalLink, Pause } from 'lucide-react'

interface Listing {
  id: string
  portal: 'mercadolibre' | 'argenprop' | 'zonaprop'
  status: string
  external_id: string | null
  external_url: string | null
  attempts: number
  last_published_at: string | null
  last_error: string | null
}

const PORTAL_LABEL: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  argenprop: 'Argenprop',
  zonaprop: 'ZonaProp',
}

const STATUS_BADGE = (status: string) => {
  switch (status) {
    case 'published': return { icon: CheckCircle, color: 'bg-emerald-600/90 text-white', label: 'Publicado' }
    case 'publishing': return { icon: Clock, color: 'bg-blue-500 text-white', label: 'Publicando…' }
    case 'pending': return { icon: Clock, color: 'bg-amber-500 text-white', label: 'En cola' }
    case 'failed': return { icon: XCircle, color: 'bg-destructive text-white', label: 'Falló' }
    case 'disabled': return { icon: AlertTriangle, color: 'bg-gray-400 text-white', label: 'Esperando credenciales' }
    case 'paused': return { icon: Pause, color: 'bg-gray-500 text-white', label: 'Pausado' }
    default: return { icon: AlertTriangle, color: 'bg-gray-400 text-white', label: status }
  }
}

export function PortalListingsCard({ propertyId }: { propertyId: string }) {
  const [listings, setListings] = useState<Listing[] | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/properties/${propertyId}/listings`)
    if (res.ok) {
      const { data } = await res.json()
      setListings(data)
    }
  }
  useEffect(() => { load() }, [propertyId])

  async function retry(listingId: string) {
    setRefreshing(listingId)
    await fetch(`/api/properties/${propertyId}/listings/${listingId}/retry`, { method: 'POST' })
    await load()
    setRefreshing(null)
  }

  if (!listings) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="display text-base">Publicación en portales</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {listings.map(l => {
          const badge = STATUS_BADGE(l.status)
          const Icon = badge.icon
          return (
            <div key={l.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex flex-col gap-1">
                <span className="font-medium text-sm">{PORTAL_LABEL[l.portal]}</span>
                {l.last_error && <span className="text-xs text-destructive">{l.last_error}</span>}
                {l.last_published_at && (
                  <span className="text-xs text-muted-foreground">
                    Publicado el {new Date(l.last_published_at).toLocaleString('es-AR')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge className={`text-xs ${badge.color}`}><Icon className="h-3 w-3 mr-1" />{badge.label}</Badge>
                {l.external_url && (
                  <a href={l.external_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm"><ExternalLink className="h-4 w-4" /></Button>
                  </a>
                )}
                {l.status === 'failed' && (
                  <Button variant="outline" size="sm" disabled={refreshing === l.id} onClick={() => retry(l.id)}>
                    <RefreshCw className={`h-4 w-4 ${refreshing === l.id ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/properties/PortalListingsCard.tsx
git commit -m "feat(portales): PortalListingsCard con estado por portal y retry manual"
```

---

### Task 7.4: Endpoint de retry manual

**Files:**
- Create: `app/api/properties/[id]/listings/[listingId]/retry/route.ts`

- [ ] **Step 1: Implementación**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; listingId: string }> }) {
  const { listingId } = await params
  const supabase = await createClient()

  const { error } = await supabase
    .from('property_listings')
    .update({
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', listingId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/properties/[id]/listings/[listingId]/retry/
git commit -m "feat(portales): POST retry manual de listing"
```

---

### Task 7.5: Componente PortalMetricsChart

**Files:**
- Create: `components/properties/PortalMetricsChart.tsx`

- [ ] **Step 1: Implementación (sin recharts; renderiza tabla + sparklines simples)**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MetricPoint {
  property_id: string
  portal: string
  date: string
  views: number
  contacts: number
  favorites: number
  whatsapps: number
}

const PORTAL_LABEL: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  argenprop: 'Argenprop',
  zonaprop: 'ZonaProp',
}

export function PortalMetricsChart({ propertyId }: { propertyId: string }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<MetricPoint[] | null>(null)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/portal-metrics?days=${days}`)
      .then(r => r.json())
      .then(({ data }) => setData(data))
  }, [propertyId, days])

  if (!data) return null

  const byPortal = data.reduce<Record<string, MetricPoint[]>>((acc, p) => {
    acc[p.portal] = acc[p.portal] ?? []
    acc[p.portal].push(p)
    return acc
  }, {})

  const totals = (rows: MetricPoint[]) => rows.reduce(
    (a, r) => ({
      views: a.views + r.views,
      contacts: a.contacts + r.contacts,
      favorites: a.favorites + r.favorites,
      whatsapps: a.whatsapps + r.whatsapps,
    }),
    { views: 0, contacts: 0, favorites: 0, whatsapps: 0 },
  )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="display text-base">Métricas por portal</CardTitle>
          <select
            value={days}
            onChange={e => setDays(Number(e.target.value))}
            className="text-xs border rounded px-2 py-1 bg-background"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.entries(byPortal).map(([portal, rows]) => {
          const t = totals(rows)
          return (
            <div key={portal}>
              <h4 className="text-sm font-medium mb-2">{PORTAL_LABEL[portal] ?? portal}</h4>
              <div className="grid grid-cols-4 gap-3 text-center">
                <Metric label="Vistas" value={t.views} />
                <Metric label="Contactos" value={t.contacts} />
                <Metric label="Favoritos" value={t.favorites} />
                <Metric label="WhatsApp" value={t.whatsapps} />
              </div>
            </div>
          )
        })}
        {Object.keys(byPortal).length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no hay métricas disponibles.</p>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-medium tabular-nums">{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/properties/PortalMetricsChart.tsx
git commit -m "feat(portales): PortalMetricsChart con totales por portal y date picker"
```

---

### Task 7.6: Integrar en property detail page

**Files:**
- Modify: `app/(dashboard)/properties/[id]/page.tsx`

- [ ] **Step 1: Agregar imports**

En el top del archivo, agregar:

```tsx
import { PortalListingsCard } from '@/components/properties/PortalListingsCard'
import { PortalMetricsChart } from '@/components/properties/PortalMetricsChart'
```

- [ ] **Step 2: Insertar componentes en el JSX**

Después del bloque `<LegalReviewHistory propertyId={property.id} />` agregar:

```tsx
{!isAbogado && property.status === 'approved' && (
  <>
    <PortalListingsCard propertyId={property.id} />
    <PortalMetricsChart propertyId={property.id} />
  </>
)}
```

- [ ] **Step 3: Commit**

```bash
git add app/(dashboard)/properties/[id]/page.tsx
git commit -m "feat(portales): integrar PortalListingsCard y MetricsChart en detalle propiedad"
```

---

### Task 7.7: /review checkpoint #5 — UI

- [ ] Ejecutar `/review`.
- [ ] Resolver issues.

---

# M8 — Admin + edge cases + docs

### Task 8.1: Geocoding backfill script

**Files:**
- Create: `scripts/backfill-property-geocode.ts`

- [ ] **Step 1: Implementación**

```ts
// scripts/backfill-property-geocode.ts
// Uso: npm exec tsx scripts/backfill-property-geocode.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const GOOGLE_KEY = process.env.GOOGLE_GEOCODING_API_KEY

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!GOOGLE_KEY) throw new Error('GOOGLE_GEOCODING_API_KEY missing')
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('address', address)
  url.searchParams.set('key', GOOGLE_KEY)
  url.searchParams.set('region', 'ar')
  const res = await fetch(url.toString())
  const json = await res.json() as { results: { geometry: { location: { lat: number; lng: number } } }[] }
  if (!json.results?.[0]) return null
  return json.results[0].geometry.location
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: properties } = await supabase
    .from('properties')
    .select('id, address, neighborhood, city, latitude')
    .is('latitude', null)

  if (!properties) return
  console.log(`Backfilling ${properties.length} properties`)

  for (const p of properties) {
    const fullAddress = `${p.address}, ${p.neighborhood}, ${p.city}, Argentina`
    const coords = await geocode(fullAddress)
    if (!coords) {
      console.warn(`No coords for ${p.id} (${fullAddress})`)
      continue
    }
    await supabase.from('properties').update({
      latitude: coords.lat, longitude: coords.lng,
    }).eq('id', p.id)
    console.log(`✓ ${p.id} → ${coords.lat}, ${coords.lng}`)
    await new Promise(r => setTimeout(r, 100)) // rate limit
  }
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Documentar uso en README de scripts**

Crear `scripts/README.md` con:

```markdown
## backfill-property-geocode

Llena latitude/longitude de propiedades existentes via Google Geocoding API.

Requiere: `GOOGLE_GEOCODING_API_KEY` en env.

```bash
npm exec tsx scripts/backfill-property-geocode.ts
```
```

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-property-geocode.ts scripts/README.md
git commit -m "feat(portales): script backfill geocoding para propiedades existentes"
```

---

### Task 8.2: Página de settings para portal credentials

**Files:**
- Create: `app/(dashboard)/settings/portals/page.tsx`
- Create: `app/api/admin/portal-credentials/route.ts`

- [ ] **Step 1: Endpoint para gestionar credenciales**

```ts
// app/api/admin/portal-credentials/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('portal_credentials')
    .select('portal, enabled, expires_at, updated_at, metadata')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function PATCH(req: Request) {
  const body = await req.json() as { portal: string; enabled: boolean }
  const supabase = await createClient()
  const { error } = await supabase
    .from('portal_credentials')
    .update({ enabled: body.enabled })
    .eq('portal', body.portal)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Página UI**

```tsx
// app/(dashboard)/settings/portals/page.tsx
'use client'
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Credential {
  portal: string
  enabled: boolean
  expires_at: string | null
  updated_at: string
}

const PORTAL_LABEL: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  argenprop: 'Argenprop',
  zonaprop: 'ZonaProp',
}

export default function PortalsSettingsPage() {
  const [creds, setCreds] = useState<Credential[]>([])

  async function load() {
    const r = await fetch('/api/admin/portal-credentials')
    const { data } = await r.json()
    setCreds(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function toggle(portal: string, enabled: boolean) {
    await fetch('/api/admin/portal-credentials', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ portal, enabled }),
    })
    await load()
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="display text-2xl">Portales</h1>
        <p className="text-sm text-muted-foreground">Habilitá cada portal cuando recibas sus credenciales.</p>
      </div>
      {creds.map(c => (
        <Card key={c.portal}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              {PORTAL_LABEL[c.portal] ?? c.portal}
              <Badge className={c.enabled ? 'bg-emerald-600 text-white' : 'bg-gray-400 text-white'}>
                {c.enabled ? 'Activo' : 'Inactivo'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Última actualización: {new Date(c.updated_at).toLocaleString('es-AR')}</p>
            {c.expires_at && <p>Token expira: {new Date(c.expires_at).toLocaleString('es-AR')}</p>}
            <Button size="sm" variant={c.enabled ? 'outline' : 'default'} onClick={() => toggle(c.portal, !c.enabled)}>
              {c.enabled ? 'Desactivar' : 'Activar'}
            </Button>
            {c.portal === 'mercadolibre' && !c.enabled && (
              <p className="text-xs text-muted-foreground">
                Para activar MercadoLibre: <a href="/api/oauth/mercadolibre/start" className="underline">conectar cuenta vía OAuth</a>.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Agregar link en nav del dashboard**

Modificar `app/(dashboard)/DashboardNav.tsx` para incluir entry de "Portales" bajo Settings (solo visible para admin/dueno).

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/portal-credentials/ app/\(dashboard\)/settings/portals/
git commit -m "feat(portales): settings page para activar/desactivar portales"
```

---

### Task 8.3: Portal health endpoint

**Files:**
- Create: `app/api/admin/portal-health/route.ts`

- [ ] **Step 1: Implementación**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: listings } = await supabase
    .from('property_listings')
    .select('portal, status')
    .gte('updated_at', since)

  const { data: pending } = await supabase
    .from('property_listings')
    .select('portal, status')
    .eq('status', 'pending')

  const summary: Record<string, { published: number; failed: number; pending: number; total: number }> = {}

  for (const l of listings ?? []) {
    const p = l.portal
    summary[p] = summary[p] ?? { published: 0, failed: 0, pending: 0, total: 0 }
    summary[p].total++
    if (l.status === 'published') summary[p].published++
    if (l.status === 'failed') summary[p].failed++
  }
  for (const l of pending ?? []) {
    const p = l.portal
    summary[p] = summary[p] ?? { published: 0, failed: 0, pending: 0, total: 0 }
    summary[p].pending++
  }

  return NextResponse.json({ summary, lastChecked: new Date().toISOString() })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/admin/portal-health/
git commit -m "feat(portales): endpoint admin portal-health con resumen 24h"
```

---

### Task 8.4: Documentar env vars necesarias

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Agregar al .env.example**

```env
# Portales
ML_APP_ID=
ML_SECRET_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000

ARGENPROP_API_KEY=
ARGENPROP_CLIENT_CODE=
ARGENPROP_API_BASE=https://api.argenprop.com/v1

ZONAPROP_API_KEY=
ZONAPROP_CLIENT_CODE=
ZONAPROP_API_BASE=https://api.zonaprop.com.ar/v2

# Geocoding
GOOGLE_GEOCODING_API_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(portales): env vars requeridas en .env.example"
```

---

### Task 8.5: /review final Fase 1

- [ ] Ejecutar `/review` global de la fase 1.
- [ ] Smoke test end-to-end: crear propiedad de prueba, aprobar legal, subir fotos, verificar que se publique en MercadoLibre real.
- [ ] Verificar que las métricas aparezcan en el dashboard tras 6h del primer cron de sync.
- [ ] Resolver últimos issues y mergear a main.

---

## Self-review

**Spec coverage:**
- §4 Schema → Tasks 1.1, 1.2, 1.3 ✓
- §5 Trigger + worker flow → Tasks 1.1 (trigger), 4.1, 4.3 ✓
- §5 Métricas sync → Task 4.2 ✓
- §5 UI property detail → Tasks 7.1-7.6 ✓
- §6.1 MercadoLibre → Tasks 3.1-3.4 ✓
- §6.2 Argenprop → Tasks 5.1-5.3 ✓
- §6.3 ZonaProp → Tasks 6.1-6.2 ✓
- §8 Permisos → cubierto en RLS Task 1.2 ✓
- §9 Failure modes → Tasks 4.1 (backoff), 8.1 (geocoding), 4.3 (updates/unpublish) ✓
- §3.4 Credenciales en env + DB → Task 2.2 ✓
- Admin/health → Tasks 8.2, 8.3 ✓

**Placeholder scan:** No "TBD", no "implement later". Endpoints específicos de Argenprop y ZonaProp son tentativos (basados en patrón estándar REST); cuando lleguen credenciales y docs oficiales, ajustamos mapping y client en commits chicos.

**Type consistency:** PortalAdapter interface usada consistently en tres adapters. `PortalName` enum coincide en types, registry, credentials, adapters, scheduled functions.

**Riesgos conocidos del plan**:
- Exact endpoints de Argenprop / ZonaProp pueden cambiar cuando lleguen docs oficiales. La estructura del adapter está pensada para que el ajuste sea solo en mapping + client.
- Si ZonaProp solo ofrece feed XML legacy, hay que escribir un adapter alternativo (`ZonapropXmlFeedAdapter`) — agregable sin cambios al resto. Plan B documentado en spec §6.3.

---

## Execution

Sugerencia: ejecutar este plan con `superpowers:subagent-driven-development` para máxima paralelización y review entre tasks. Cada milestone (M0-M8) puede ejecutarse como bloque, con /review al cerrar M3, M4, M5, M6, M7, M8.
