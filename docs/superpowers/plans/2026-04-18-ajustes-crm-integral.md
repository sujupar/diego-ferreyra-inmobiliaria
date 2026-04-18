# Plan de Implementación Integral — Ajustes CRM Diego Ferreyra Inmobiliaria

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 11 ajustes mayores al CRM: habilitar asesores a agendar tasaciones, añadir campos obligatorios (tipo de propiedad, barrio, ambientes), unificar nomenclatura "coordinar", redirigir landing a Pendientes, rediseñar alertas para asesores, añadir modal de Visita Realizada con guardado automático, renombrar "marcar perdido" → "descartado", prellenar tasaciones con datos de visita, restructurar documentos legales con checklist profesional, ocultar datos sensibles al abogado + añadir track record, unificar CRM y Procesos con visibilidad por rol, optimizar carga y rediseñar visualmente.

**Architecture:**
- Todas las tablas existen en Supabase. Añadiremos: (a) columnas en `deals` y `properties` para datos de visita; (b) tabla `legal_review_events` para track record de abogado; (c) tabla `property_documents_meta` para checklist legal.
- El modal de Visita Realizada se implementa como componente reutilizable con auto-save onBlur via debounced PATCH al endpoint del deal.
- Landing diferenciada por rol se migra de `/pipeline` → `/tasks` para todos salvo abogado (que queda en `/properties/review`).
- CRM reemplaza a `/pipeline` (lista). Se preserva `/pipeline/[id]` como detalle de proceso.
- Rediseño visual usa el skill `frontend-design:frontend-design` como cross-cutting concern al final.

**Tech Stack:** Next.js 16.0.10, React 19, TypeScript 5, Supabase (postgres + storage), Tailwind CSS 4, shadcn/ui, @react-pdf/renderer.

---

## Estructura de Archivos — Alto Nivel

### Archivos a crear
- `supabase/migrations/20260418_visit_data_plus_legal_docs.sql` — migraciones DB
- `supabase/migrations/20260418_legal_review_events.sql` — track record
- `components/pipeline/VisitDataModal.tsx` — modal de visita (venta + compra)
- `components/pipeline/VisitDataForm.tsx` — form con auto-save debounced
- `components/properties/LegalDocsChecklist.tsx` — checklist documentos obligatorios/opcionales
- `components/properties/LegalReviewHistory.tsx` — track record visual
- `components/crm/CRMRoleGuard.tsx` — filtrado por rol
- `lib/supabase/visit-data.ts` — CRUD del snapshot de visita
- `lib/supabase/legal-docs.ts` — metadatos checklist legal
- `lib/supabase/legal-events.ts` — audit log abogado
- `app/api/deals/[id]/visit-data/route.ts` — PATCH endpoint auto-save
- `app/api/properties/[id]/legal-docs/route.ts` — upload + metadata
- `app/api/properties/[id]/legal-review-item/route.ts` — aprobar ítem individual
- `types/visit-data.types.ts` — tipos compartidos (venta/compra)
- `types/legal-docs.types.ts` — tipos legales

### Archivos a modificar
- `lib/auth/roles.ts` — nuevo permiso `pipeline.schedule` (asesor)
- `app/page.tsx` — redirect landing a `/tasks`
- `app/(dashboard)/layout.tsx` — ajustar navSections: quitar "Procesos" del asesor
- `app/(dashboard)/pipeline/new/page.tsx` — añadir campos obligatorios
- `app/(dashboard)/pipeline/[id]/page.tsx` — nomenclatura + modal visita + "Descartado"
- `app/(dashboard)/pipeline/page.tsx` — **eliminar** o redirect a `/crm`
- `app/(dashboard)/crm/page.tsx` — filtrado por rol + vista adaptada
- `app/(dashboard)/tasks/page.tsx` — highlight visual para asesor con tasaciones pendientes
- `app/(dashboard)/properties/[id]/page.tsx` — checklist legal + ocultar campos sensibles al abogado + track record
- `app/(dashboard)/appraisal/new/page.tsx` — prellenado desde visitData del deal
- `lib/supabase/deals.ts` — DEAL_STAGES labels: "Agendada" → "Coordinada", "Perdido" → "Descartado"
- `lib/supabase/properties.ts` — helpers para legal docs checklist
- `components/appraisal/PropertyWizard.tsx` — aceptar `initialData.visitSnapshot`

---

## Tabla de Fases

| Fase | Nombre | Dependencias |
|------|--------|-------------|
| 0 | Pre-flight: worktree + TypeScript baseline | — |
| 1 | Migraciones DB (visit_data, legal_docs, legal_events) | 0 |
| 2 | Nomenclatura uniforme "Coordinar" + "Descartado" | 1 |
| 3 | Permitir asesores agendar tasaciones | 1 |
| 4 | Campos obligatorios en agendar tasación | 3 |
| 5 | Landing page → Pendientes + highlight asesor | 1 |
| 6 | Modal Visita Realizada con auto-save | 1 |
| 7 | Prellenado de tasación desde visita | 6 |
| 8 | Restructura documentos legales | 1 |
| 9 | Vista abogado restringida + review por ítem | 8 |
| 10 | Track record histórico abogado/asesor | 9 |
| 11 | Unificar CRM y Procesos (eliminar `/pipeline` lista) | 2 |
| 12 | Optimización de carga | 11 |
| 13 | Rediseño visual con frontend-design skill | 12 |
| 14 | Self-review plan + /review al final de implementación | 13 |

---

# FASE 0 — Pre-flight

### Task 0.1: Crear worktree dedicado

**Files:** (ninguno, solo git)

- [ ] **Step 1: Verificar árbol limpio**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && git status`

Expected: working tree clean (salvo los files ya reportados en git status inicial).

- [ ] **Step 2: Crear branch y worktree**

Run: `git worktree add ../dfi-ajustes-integrales -b ajustes-crm-integrales main`

Expected: Worktree creado. Seguir trabajando desde el path original — Netlify autodeploy en `main` no se afecta hasta merge.

- [ ] **Step 3: Verificar npm install y type-check baseline**

Run: `npm install && npx tsc --noEmit`

Expected: 0 errores de tipo. Si hay errores preexistentes, documentarlos en este comentario antes de seguir.

- [ ] **Step 4: Commit de baseline marker**

```bash
git commit --allow-empty -m "chore: baseline para ajustes CRM integrales"
```

---

# FASE 1 — Migraciones DB

### Task 1.1: Migración `visit_data` en deals

**Files:**
- Create: `supabase/migrations/20260418000000_visit_data.sql`

- [ ] **Step 1: Escribir migración SQL**

```sql
-- supabase/migrations/20260418000000_visit_data.sql
-- Añade snapshot de datos recogidos en la visita al inmueble, serializado en JSONB.
-- Se usa para prellenar la tasación posterior.

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS property_type TEXT,
  ADD COLUMN IF NOT EXISTS property_type_other TEXT,
  ADD COLUMN IF NOT EXISTS neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS rooms INTEGER,
  ADD COLUMN IF NOT EXISTS covered_area NUMERIC,
  ADD COLUMN IF NOT EXISTS visit_data JSONB,
  ADD COLUMN IF NOT EXISTS visit_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_deals_property_type ON deals(property_type);
CREATE INDEX IF NOT EXISTS idx_deals_neighborhood ON deals(neighborhood);

COMMENT ON COLUMN deals.visit_data IS 'JSONB snapshot con {sale: SalePropertyData, purchase: PurchasePropertyData | null}';
COMMENT ON COLUMN deals.visit_completed_at IS 'Timestamp cuando el asesor marcó visita realizada por primera vez';

-- Función RPC para merge atómico de visit_data (evita race condition read-modify-write)
CREATE OR REPLACE FUNCTION merge_deal_visit_data(p_deal_id UUID, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_merged JSONB;
BEGIN
  UPDATE deals
  SET visit_data = COALESCE(visit_data, '{}'::jsonb) || p_patch,
      updated_at = now()
  WHERE id = p_deal_id
  RETURNING visit_data INTO v_merged;
  RETURN v_merged;
END;
$$;
```

- [ ] **Step 2: Aplicar migración (usuario ejecuta en Supabase dashboard)**

El usuario tiene que copiar el contenido y ejecutarlo en el SQL Editor de Supabase (según memory: CLI no conecta). Documentar en PR description.

- [ ] **Step 3: Regenerar types**

Run: `npx supabase gen types typescript --project-id <project-id> > types/supabase.ts`

Expected: types/supabase.ts actualizado con las nuevas columnas en `deals`.

Si no se puede usar CLI, editar manualmente `types/supabase.ts` añadiendo las columnas a la interfaz de `deals.Row`, `Insert`, `Update`:
```typescript
property_type: string | null
property_type_other: string | null
neighborhood: string | null
rooms: number | null
covered_area: number | null
visit_data: Json | null
visit_completed_at: string | null
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260418000000_visit_data.sql types/supabase.ts
git commit -m "feat(db): add visit_data snapshot + required fields to deals"
```

---

### Task 1.2: Migración `legal_docs_meta` en properties

**Files:**
- Create: `supabase/migrations/20260418000001_legal_docs_meta.sql`

- [ ] **Step 1: Escribir migración**

```sql
-- supabase/migrations/20260418000001_legal_docs_meta.sql
-- Reemplaza el array plano `documents` por metadata por-ítem del checklist legal.
-- Mantiene `documents` por compatibilidad durante la transición.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS legal_docs JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_flags JSONB DEFAULT '{
    "has_succession": false,
    "has_divorce": false,
    "has_powers": false,
    "is_credit_purchase": false
  }'::jsonb;

COMMENT ON COLUMN properties.legal_docs IS 'Checklist legal: { [item_key]: { file_url, file_name, uploaded_at, status: "pending"|"approved"|"rejected", reviewer_notes, reviewed_at, reviewed_by } }';
COMMENT ON COLUMN properties.legal_flags IS 'Flags condicionales: succession, divorce, powers, credit_purchase';

-- Índice para queries sobre documentos aprobados
CREATE INDEX IF NOT EXISTS idx_properties_legal_docs ON properties USING gin (legal_docs);
```

- [ ] **Step 2: Usuario aplica en Supabase**

Same as Task 1.1 Step 2.

- [ ] **Step 3: Actualizar types/supabase.ts manualmente**

Agregar a `properties.Row`, `Insert`, `Update`:
```typescript
legal_docs: Json | null
legal_flags: Json | null
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260418000001_legal_docs_meta.sql types/supabase.ts
git commit -m "feat(db): add legal_docs checklist metadata to properties"
```

---

### Task 1.3: Migración `legal_review_events`

**Files:**
- Create: `supabase/migrations/20260418000002_legal_review_events.sql`

- [ ] **Step 1: Escribir migración**

```sql
-- supabase/migrations/20260418000002_legal_review_events.sql
-- Audit log para todas las acciones de revisión legal (asesor envía, abogado aprueba/rechaza, comentarios).

CREATE TABLE IF NOT EXISTS legal_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL, -- 'submitted', 'approved_item', 'rejected_item', 'approved_all', 'rejected_all', 'commented', 'resubmitted'
  item_key TEXT, -- NULL si acción global; si ítem, el key del checklist
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_legal_review_events_property ON legal_review_events(property_id, created_at DESC);
CREATE INDEX idx_legal_review_events_actor ON legal_review_events(actor_id, created_at DESC);

-- RLS: lectura abierta para autenticados, escritura solo desde server con service role
ALTER TABLE legal_review_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read all legal events for authenticated"
  ON legal_review_events FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE legal_review_events IS 'Track record histórico de revisión legal: quién hizo qué, cuándo, con qué notas';
```

- [ ] **Step 2: Aplicar + types**

Usuario aplica. Añadir a `types/supabase.ts`:
```typescript
legal_review_events: {
  Row: { id: string; property_id: string; actor_id: string | null; actor_role: string; action: string; item_key: string | null; notes: string | null; created_at: string }
  Insert: { id?: string; property_id: string; actor_id?: string | null; actor_role: string; action: string; item_key?: string | null; notes?: string | null; created_at?: string }
  Update: { id?: string; property_id?: string; actor_id?: string | null; actor_role?: string; action?: string; item_key?: string | null; notes?: string | null; created_at?: string }
  Relationships: [{ foreignKeyName: 'legal_review_events_property_id_fkey'; columns: ['property_id']; referencedRelation: 'properties'; referencedColumns: ['id'] }]
}
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260418000002_legal_review_events.sql types/supabase.ts
git commit -m "feat(db): add legal_review_events audit log table"
```

---

# FASE 2 — Nomenclatura Uniforme

### Task 2.1: Renombrar stages "Agendada" → "Coordinada" y "Perdido" → "Descartado"

**Files:**
- Modify: `lib/supabase/deals.ts:9-17`
- Modify: `app/(dashboard)/pipeline/[id]/page.tsx:15-23`
- Modify: `app/(dashboard)/crm/page.tsx:88-93`
- Modify: `app/(dashboard)/pipeline/[id]/page.tsx:75-76,367-369`

**Decisión clave:** NO renombrar los valores internos `DealStage` (siguen siendo `'scheduled'`, `'lost'`) para no romper queries existentes. SOLO cambiamos los labels visibles.

- [ ] **Step 1: Update DEAL_STAGES labels**

Edit `lib/supabase/deals.ts` lines 9-17:

```typescript
export const DEAL_STAGES: { key: DealStage; label: string; color: string }[] = [
  { key: 'scheduled', label: 'Coordinada', color: 'bg-blue-500' },
  { key: 'not_visited', label: 'No Realizada', color: 'bg-rose-400' },
  { key: 'visited', label: 'Visita Realizada', color: 'bg-amber-500' },
  { key: 'appraisal_sent', label: 'Tasación Entregada', color: 'bg-purple-500' },
  { key: 'followup', label: 'En Seguimiento', color: 'bg-orange-500' },
  { key: 'captured', label: 'Captada', color: 'bg-green-500' },
  { key: 'lost', label: 'Descartado', color: 'bg-red-500' },
]
```

- [ ] **Step 2: Update pipeline detail page STAGES**

Edit `app/(dashboard)/pipeline/[id]/page.tsx` lines 15-23:

```typescript
const STAGES = [
  { key: 'scheduled', label: 'Coordinada', color: 'bg-blue-500' },
  { key: 'not_visited', label: 'No Realizada', color: 'bg-rose-400' },
  { key: 'visited', label: 'Visita Realizada', color: 'bg-amber-500' },
  { key: 'appraisal_sent', label: 'Tasación Entregada', color: 'bg-purple-500' },
  { key: 'followup', label: 'En Seguimiento', color: 'bg-orange-500' },
  { key: 'captured', label: 'Captada', color: 'bg-green-500' },
  { key: 'lost', label: 'Descartado', color: 'bg-red-500' },
]
```

- [ ] **Step 3: Update botón "Marcar Perdido" → "Descartar"**

Edit `app/(dashboard)/pipeline/[id]/page.tsx` line 76:

```typescript
async function handleLost() {
  if (!confirm('¿Descartar este proceso?')) return
```

Edit line 367-369 (texto botón):

```tsx
<Button variant="ghost" size="sm" onClick={handleLost} disabled={advancing} className="text-red-600 hover:text-red-700 hover:bg-red-50">
  <XCircle className="h-4 w-4 mr-1" /> Descartar
</Button>
```

- [ ] **Step 4: Update CRM label**

En `app/(dashboard)/crm/page.tsx` línea 87-92, ya dice "Descartado". Verificar con grep:

Run: `grep -rn "Descartado\|descartado" app/ components/ lib/ --include="*.tsx" --include="*.ts"`

Expected: todas las referencias usan "Descartado" (capitalized en UI, snake_case en claves).

- [ ] **Step 5: Buscar otros usos de "Agendada" y "Perdido"**

Run: `grep -rn "Agendada\|Perdido" app/ components/ lib/ --include="*.tsx" --include="*.ts"`

Expected: identificar todas las ocurrencias. Reemplazar "Agendada" → "Coordinada" y "Perdido" → "Descartado" en:
- Cualquier toast, alert, label, badge, tooltip
- Texto de confirmaciones
- Comentarios de UI (opcional pero deseable)

EXCEPCIÓN: `agendar`, `Agendar Tasación` (verbo) se mantiene en la página de creación (label del botón de action) pero cambiar el título de la página a "Coordinar Tasación" — ver Task 4.1.

- [ ] **Step 6: Type-check y commit**

Run: `npx tsc --noEmit`

Expected: 0 errores.

```bash
git add -A
git commit -m "refactor: unify nomenclatura — 'Agendada'→'Coordinada', 'Perdido'→'Descartado'"
```

---

### Task 2.2: Renombrar "Agendar" verbo → "Coordinar"

**Files:**
- Modify: `app/(dashboard)/pipeline/new/page.tsx:88-92,91,214`
- Modify: `app/(dashboard)/layout.tsx:47,62`

- [ ] **Step 1: Update pipeline/new/page.tsx títulos y botones**

Edit `app/(dashboard)/pipeline/new/page.tsx` lines 91-92:
```tsx
<h1 className="text-2xl font-bold tracking-tight">Coordinar Tasación</h1>
<p className="text-muted-foreground">Coordiná una nueva tasación para un prospecto</p>
```

Edit línea 80:
```tsx
<h2 className="text-xl font-bold mb-2">Tasación Coordinada</h2>
```

Edit línea 214:
```tsx
<Button type="submit" disabled={loading} className="flex-1">
  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
  Coordinar Tasación
</Button>
```

- [ ] **Step 2: Update nav labels**

Edit `app/(dashboard)/layout.tsx` líneas 47 y 62 — cambiar `label: 'Agendar'` a `label: 'Coordinar'`:

```typescript
// coordinador:
{ label: 'Tasaciones', items: [
    { href: '/pipeline/new', label: 'Coordinar' },
    { href: '/appraisals', label: 'Historial' },
]},

// admin/dueno (línea 62 original):
{ label: 'Tasaciones', items: [
    { href: '/pipeline/new', label: 'Coordinar' },
    { href: '/appraisal/new', label: 'Nueva Tasación' },
    { href: '/appraisals', label: 'Historial' },
]},
// Nota: dejar el resto del array de admin/dueno intacto.
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: rename 'Agendar' verbo → 'Coordinar' en UI"
```

---

# FASE 3 — Permitir Asesores Coordinar Tasaciones

### Task 3.1: Añadir permiso `pipeline.schedule` al asesor

**Files:**
- Modify: `lib/auth/roles.ts:15-29,48-52`

- [ ] **Step 1: Añadir permiso al enum y lista**

Edit `lib/auth/roles.ts` líneas 15-29:

```typescript
export type Permission =
  | 'pipeline.create'
  | 'pipeline.schedule'  // NUEVO: coordinar nueva tasación
  | 'pipeline.view_all'
  | 'pipeline.view_own'
  | 'pipeline.advance'
  | 'appraisal.create'
  | 'appraisal.view_all'
  | 'properties.view_all'
  | 'properties.manage'
  | 'properties.create'
  | 'properties.review'
  | 'properties.upload'
  | 'metrics.view'
  | 'settings.manage'
  | 'users.manage'
```

Edit líneas 31-62 añadiendo `pipeline.schedule` a admin, dueno, coordinador y asesor:

```typescript
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'pipeline.create', 'pipeline.schedule', 'pipeline.view_all', 'pipeline.advance',
    'appraisal.create', 'appraisal.view_all',
    'properties.view_all', 'properties.manage', 'properties.create', 'properties.review', 'properties.upload',
    'metrics.view', 'settings.manage', 'users.manage',
  ],
  dueno: [
    'pipeline.schedule', 'pipeline.view_all', 'pipeline.advance',
    'appraisal.view_all',
    'properties.view_all', 'properties.create',
    'metrics.view', 'users.manage',
  ],
  coordinador: [
    'pipeline.create', 'pipeline.schedule', 'pipeline.view_all', 'pipeline.advance',
    'properties.view_all', 'properties.create',
  ],
  asesor: [
    'pipeline.schedule', 'pipeline.view_own', 'pipeline.advance',
    'appraisal.create',
    'properties.manage', 'properties.create', 'properties.upload',
  ],
  abogado: [
    'properties.view_all', 'properties.review',
  ],
  agent: [
    'pipeline.view_own', 'pipeline.advance',
    'appraisal.create',
  ],
  viewer: [],
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`

Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add lib/auth/roles.ts
git commit -m "feat(auth): add 'pipeline.schedule' permission to asesor role"
```

---

### Task 3.2: Añadir "Coordinar" al nav del asesor

**Files:**
- Modify: `app/(dashboard)/layout.tsx:28-39`

- [ ] **Step 1: Update asesor nav**

Edit `app/(dashboard)/layout.tsx` líneas 28-39:

```typescript
case 'asesor':
    return [
        { label: 'Pendientes', href: '/tasks' },
        { label: 'CRM', href: '/crm' },
        { label: 'Tasaciones', items: [
            { href: '/pipeline/new', label: 'Coordinar' },
            { href: '/appraisal/new', label: 'Nueva Tasación' },
            { href: '/appraisals', label: 'Historial' },
        ]},
        { label: 'Mis Contactos', href: '/contacts' },
        { label: 'Mis Propiedades', href: '/properties' },
    ]
```

Nota: El ítem "Procesos" (href `/pipeline`) se ELIMINA del asesor (parte de Fase 11 — Unificación). Aquí solo añadimos "Coordinar".

- [ ] **Step 2: Protección server-side en el endpoint**

El endpoint `/api/deals` POST debe admitir asesor. Buscar la ruta actual:

Run: `grep -rn "requireRole\|requirePermission" app/api/deals/route.ts`

Si existe `requirePermission('pipeline.create')`, cambiar a `requirePermission('pipeline.schedule')`. Si no hay guard, añadirlo:

Edit `app/api/deals/route.ts` (si es necesario), añadir al inicio del POST:
```typescript
import { requirePermission } from '@/lib/auth/require-role'

export async function POST(req: Request) {
  await requirePermission('pipeline.schedule')
  // ... resto
}
```

- [ ] **Step 3: Verificar manualmente**

Run: `npm run dev` (si no está corriendo)

Loguearse como asesor (o usar impersonation). Ir a `/pipeline/new`. Expected: página carga sin redirect. Formulario visible.

- [ ] **Step 4: Commit**

```bash
git add app/\(dashboard\)/layout.tsx app/api/deals/route.ts
git commit -m "feat(asesor): allow asesor to access 'Coordinar' tasación flow"
```

---

# FASE 4 — Campos Obligatorios en Coordinar Tasación

### Task 4.1: Añadir tipo de propiedad, barrio, ambientes, metros a `/pipeline/new`

**Files:**
- Modify: `app/(dashboard)/pipeline/new/page.tsx`
- Modify: `app/api/deals/route.ts` (POST handler)
- Modify: `lib/supabase/deals.ts:19-28` (DealInput)

- [ ] **Step 1: Actualizar DealInput**

Edit `lib/supabase/deals.ts` líneas 19-28:

```typescript
export interface DealInput {
  contact_id: string
  property_address: string
  scheduled_date?: string
  scheduled_time?: string
  origin?: string
  assigned_to?: string
  created_by?: string
  notes?: string
  // NUEVOS:
  property_type: 'departamento' | 'casa' | 'ph' | 'otro'
  property_type_other?: string | null
  neighborhood: string
  rooms: number
  covered_area?: number | null
}
```

Edit líneas 30-38 (createDeal) para pasar los nuevos campos directamente (ya son columnas en `deals` post-migración 1.1):

```typescript
export async function createDeal(input: DealInput) {
  const { data, error } = await getAdmin()
    .from('deals')
    .insert({ ...input, stage: 'scheduled' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
```

- [ ] **Step 2: Actualizar formulario**

Edit `app/(dashboard)/pipeline/new/page.tsx`. Añadir al state form (líneas 16-26):

```typescript
const [form, setForm] = useState({
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  propertyAddress: '',
  scheduledDate: '',
  scheduledTime: '',
  origin: '',
  assignedTo: '',
  notes: '',
  propertyType: '' as '' | 'departamento' | 'casa' | 'ph' | 'otro',
  propertyTypeOther: '',
  neighborhood: '',
  rooms: '' as string,
  coveredArea: '' as string,
})
```

- [ ] **Step 3: Añadir card "Datos de la Propiedad" ANTES de "Propiedad y Fecha"**

Insertar un nuevo `<Card>` entre líneas 165 y 166. Contenido:

```tsx
<Card>
  <CardHeader>
    <CardTitle className="flex items-center gap-2 text-lg">
      <Home className="h-5 w-5" />
      Datos de la Propiedad
    </CardTitle>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label htmlFor="propertyType">Tipo de Propiedad *</Label>
        <select
          id="propertyType"
          value={form.propertyType}
          onChange={e => updateField('propertyType', e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        >
          <option value="">Seleccionar...</option>
          <option value="departamento">Departamento</option>
          <option value="casa">Casa</option>
          <option value="ph">PH</option>
          <option value="otro">Otro</option>
        </select>
      </div>
      {form.propertyType === 'otro' && (
        <div className="space-y-2">
          <Label htmlFor="propertyTypeOther">Especificar tipo *</Label>
          <Input
            id="propertyTypeOther"
            value={form.propertyTypeOther}
            onChange={e => updateField('propertyTypeOther', e.target.value)}
            placeholder="Ej: Local comercial, Terreno..."
            required
          />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="neighborhood">Barrio *</Label>
        <Input
          id="neighborhood"
          value={form.neighborhood}
          onChange={e => updateField('neighborhood', e.target.value)}
          placeholder="Ej: Palermo, Belgrano, CABA"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rooms">Cantidad de Ambientes *</Label>
        <select
          id="rooms"
          value={form.rooms}
          onChange={e => updateField('rooms', e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          required
        >
          <option value="">Seleccionar...</option>
          <option value="1">1 ambiente (monoambiente)</option>
          <option value="2">2 ambientes</option>
          <option value="3">3 ambientes</option>
          <option value="4">4 ambientes</option>
          <option value="5">5 ambientes</option>
          <option value="6">6 o más</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="coveredArea">Metros cuadrados cubiertos <span className="text-muted-foreground text-xs">(opcional)</span></Label>
        <Input
          id="coveredArea"
          type="number"
          min="0"
          step="1"
          value={form.coveredArea}
          onChange={e => updateField('coveredArea', e.target.value)}
          placeholder="Ej: 75"
        />
      </div>
    </div>
  </CardContent>
</Card>
```

Añadir también al import del archivo la importación de `Home` de `lucide-react` (ya hay otros iconos ahí — verificar línea 9).

- [ ] **Step 4: Actualizar handleSubmit para enviar nuevos campos**

Edit líneas 44-58:

```typescript
const res = await fetch('/api/deals', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contact_name: form.contactName,
    contact_phone: form.contactPhone,
    contact_email: form.contactEmail,
    property_address: form.propertyAddress,
    scheduled_date: form.scheduledDate,
    scheduled_time: form.scheduledTime || null,
    origin: form.origin || null,
    assigned_to: form.assignedTo || null,
    notes: form.notes || null,
    property_type: form.propertyType,
    property_type_other: form.propertyType === 'otro' ? form.propertyTypeOther : null,
    neighborhood: form.neighborhood,
    rooms: form.rooms ? parseInt(form.rooms, 10) : null,
    covered_area: form.coveredArea ? parseFloat(form.coveredArea) : null,
  }),
})
```

- [ ] **Step 5: Actualizar endpoint `/api/deals` POST**

Read `app/api/deals/route.ts` y añadir los nuevos campos en el body destructuring y en el insert a deals.

Expected code path (ajustar según la implementación actual):

```typescript
const body = await req.json()
const {
  contact_name, contact_phone, contact_email,
  property_address, scheduled_date, scheduled_time,
  origin, assigned_to, notes,
  property_type, property_type_other, neighborhood, rooms, covered_area,
} = body

// Crear contacto si no existe (lookup por phone o crear nuevo):
let contact_id: string
const existing = await supabase.from('contacts').select('id').eq('phone', contact_phone).maybeSingle()
if (existing.data) {
  contact_id = existing.data.id
} else {
  const created = await supabase.from('contacts').insert({ full_name: contact_name, phone: contact_phone, email: contact_email, origin, created_by: user.id, assigned_to }).select('id').single()
  contact_id = created.data!.id
}
// luego crear deal:
await createDeal({
  contact_id,
  property_address,
  scheduled_date, scheduled_time,
  origin, assigned_to, notes,
  property_type, property_type_other,
  neighborhood, rooms, covered_area,
  created_by: user.id,
})
```

- [ ] **Step 6: Validación servidor**

En el handler POST añadir validación:

```typescript
if (!property_type || !['departamento','casa','ph','otro'].includes(property_type)) {
  return Response.json({ error: 'property_type inválido' }, { status: 400 })
}
if (property_type === 'otro' && !property_type_other?.trim()) {
  return Response.json({ error: 'property_type_other requerido cuando tipo es "otro"' }, { status: 400 })
}
if (!neighborhood?.trim()) return Response.json({ error: 'neighborhood requerido' }, { status: 400 })
if (!rooms || rooms < 1) return Response.json({ error: 'rooms requerido' }, { status: 400 })
```

- [ ] **Step 7: Probar manualmente**

Iniciar dev. Ir a `/pipeline/new`. Rellenar todos los campos. Dejar opcionalmente `coveredArea` en blanco. Submit.

Expected: Se crea el deal. Verificar en Supabase dashboard que `property_type`, `neighborhood`, `rooms` se guardaron.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(coordinar): add tipo propiedad, barrio, ambientes, metros a nueva tasación"
```

---

### Task 4.2: Actualizar UI del detalle del proceso para mostrar los nuevos campos

**Files:**
- Modify: `app/(dashboard)/pipeline/[id]/page.tsx:206-219`

- [ ] **Step 1: Añadir card "Propiedad" en deal detail**

Edit después de línea 219 (después del card "Contacto"), insertar:

```tsx
<Card>
  <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Home className="h-5 w-5" />Propiedad</CardTitle></CardHeader>
  <CardContent className="space-y-2 text-sm">
    <div className="grid grid-cols-2 gap-2">
      <span className="text-muted-foreground">Dirección:</span><span className="font-medium">{deal.property_address}</span>
      {deal.property_type && (
        <>
          <span className="text-muted-foreground">Tipo:</span>
          <span className="capitalize">
            {deal.property_type === 'otro' ? deal.property_type_other : deal.property_type}
          </span>
        </>
      )}
      {deal.neighborhood && <><span className="text-muted-foreground">Barrio:</span><span>{deal.neighborhood}</span></>}
      {deal.rooms && <><span className="text-muted-foreground">Ambientes:</span><span>{deal.rooms}</span></>}
      {deal.covered_area && <><span className="text-muted-foreground">M² cubiertos:</span><span>{deal.covered_area} m²</span></>}
    </div>
  </CardContent>
</Card>
```

Ya se importa `Home` de lucide-react (línea 11).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(pipeline): show propiedad fields in deal detail view"
```

---

# FASE 5 — Landing Page → Pendientes

### Task 5.1: Cambiar landing default a `/tasks`

**Files:**
- Modify: `app/page.tsx:10-19`

- [ ] **Step 1: Update redirects**

Edit `app/page.tsx` completo:

```typescript
import { redirect } from 'next/navigation'
import { getUser } from '@/lib/auth/get-user'

export default async function Home() {
  const user = await getUser()

  if (!user) redirect('/login')

  // Landing por rol — todos van a Pendientes salvo abogado (tiene su propia revisión legal).
  switch (user.profile.role) {
    case 'abogado':
      redirect('/properties/review')
    case 'coordinador':
    case 'asesor':
    case 'dueno':
    case 'admin':
    default:
      redirect('/tasks')
  }
}
```

- [ ] **Step 2: Verificar middleware no redirecciona `/tasks`**

Read `middleware.ts` y `lib/supabase/middleware.ts`. Expected: `/tasks` no está excluido y el middleware pasa por `updateSession()` estándar.

- [ ] **Step 3: Probar manualmente**

Loguearse como asesor. Expected: URL final = `/tasks`. Repetir con coordinador, dueno.

Loguearse como abogado. Expected: URL final = `/properties/review`.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat(landing): redirect all non-abogado roles to /tasks on login"
```

---

### Task 5.2: Highlight visual de tasaciones pendientes para asesor

**Files:**
- Modify: `app/(dashboard)/tasks/page.tsx:13-18,105-144`

- [ ] **Step 1: Añadir variant destacado en TYPE_CONFIG para asesor**

Edit líneas 13-18 para añadir variante visual más llamativa a `new_assignment` (tasación coordinada):

```typescript
const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; label: string; urgent?: boolean }> = {
  update_contact: { icon: User, color: 'bg-amber-100 text-amber-800', label: 'Actualizar Contacto' },
  new_assignment: { icon: FileCheck, color: 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white', label: 'Tasación Coordinada', urgent: true },
  review_property: { icon: Scale, color: 'bg-purple-100 text-purple-800', label: 'Revisión Legal' },
  rejected_docs: { icon: AlertTriangle, color: 'bg-red-100 text-red-800', label: 'Docs Rechazados' },
}
```

- [ ] **Step 2: Renderizar tarjetas urgentes con borde prominente + animación**

Edit líneas 113-144 (dentro del `.map(task => ...)`):

```tsx
return (
  <Card
    key={task.id}
    className={`transition-all ${config.urgent ? 'border-2 border-blue-500 shadow-lg ring-2 ring-blue-500/20 hover:shadow-xl' : 'hover:bg-muted/30'}`}
  >
    <CardContent className="flex items-center gap-4 py-3">
      <div className={`h-10 w-10 rounded-full flex items-center justify-center ${config.color} ${config.urgent ? 'animate-pulse shadow-md' : ''}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`font-medium ${config.urgent ? 'text-blue-900 dark:text-blue-100 font-semibold' : ''}`}>
            {task.title}
          </span>
          <Badge variant={config.urgent ? 'default' : 'secondary'} className={`text-xs ${config.urgent ? 'bg-blue-600' : ''}`}>
            {config.label}
          </Badge>
          {config.urgent && (
            <Badge variant="destructive" className="text-xs animate-pulse">¡Acción requerida!</Badge>
          )}
        </div>
        {task.description && <p className="text-sm text-muted-foreground truncate">{task.description}</p>}
        <p className="text-xs text-muted-foreground mt-0.5">{formatDate(task.created_at)}</p>
      </div>
      <div className="flex items-center gap-2">
        {task.status === 'pending' && (
          <>
            <Button size="sm" variant="outline" onClick={() => handleAction(task.id, 'complete')} disabled={completing === task.id}>
              {completing === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => handleAction(task.id, 'dismiss')} disabled={completing === task.id}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        <Link href={link}>
          <Button size="sm" variant={config.urgent ? 'default' : 'ghost'} className={config.urgent ? 'bg-blue-600 hover:bg-blue-700' : ''}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </CardContent>
  </Card>
)
```

- [ ] **Step 3: Orden descendente por urgencia**

Edit el fetch handler (líneas 56-65) para ordenar — las urgentes primero:

Opcional si el backend ya retorna ordenado. Si no, añadir un sort client-side:

```typescript
.then(({ data }) => {
  const sorted = (data || []).slice().sort((a: Task, b: Task) => {
    const aUrgent = a.type === 'new_assignment' ? 1 : 0
    const bUrgent = b.type === 'new_assignment' ? 1 : 0
    return bUrgent - aUrgent  // urgentes primero
  })
  setTasks(sorted)
})
```

- [ ] **Step 4: Asegurar task `new_assignment` se crea al coordinar tasación**

Read `app/api/deals/route.ts` POST handler. Después de `createDeal()`, añadir:

```typescript
import { createTask } from '@/lib/supabase/tasks'

// Después de crear el deal:
if (assigned_to) {
  await createTask({
    type: 'new_assignment',
    title: `Tasación coordinada: ${property_address}`,
    description: `Contacto: ${contact_name}. ${scheduled_date ? 'Fecha: ' + scheduled_date : ''}`,
    assigned_to,
    deal_id,
    contact_id,
  })
}
```

- [ ] **Step 5: Verificar**

Coordinar una tasación como dueno asignando a un asesor. Loguearse como ese asesor. Expected: al entrar a `/tasks` aparece la tarjeta destacada con borde azul, pulse animation y badge "¡Acción requerida!".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pendientes): highlight visual para tasaciones coordinadas + auto-task al asesor"
```

---

# FASE 6 — Modal Visita Realizada con Auto-save

### Task 6.1: Crear tipos compartidos

**Files:**
- Create: `types/visit-data.types.ts`

- [ ] **Step 1: Definir tipos**

Write `types/visit-data.types.ts`:

```typescript
// types/visit-data.types.ts
// Snapshot de datos recogidos durante la visita a la propiedad.
// Se persiste en deals.visit_data como JSONB.

export type PropertyTypeVenta = 'departamento' | 'casa' | 'ph' | 'otro'
export type Disposition = 'frente' | 'contrafrente' | 'interno' | 'lateral'
export type Orientation = 'N' | 'S' | 'E' | 'O' | 'NE' | 'NO' | 'SE' | 'SO'
export type Quality = 'baja' | 'media-baja' | 'media' | 'media-alta' | 'alta' | 'premium'
export type ConservationState = 'a_refaccionar' | 'bueno' | 'muy_bueno' | 'excelente' | 'a_estrenar'

export interface SaleVisitData {
  property_type: PropertyTypeVenta
  property_type_other?: string | null
  rooms: number | null
  bedrooms: number | null
  bathrooms: number | null
  garages: number | null
  covered_m2: number | null
  semi_covered_m2: number | null
  uncovered_m2: number | null
  total_m2: number | null
  terrain_m2: number | null
  age_years: number | null
  is_refurbished: boolean
  orientation: Orientation | null
  floor: number | null
  total_floors: number | null
  disposition: Disposition | null
  quality: Quality | null
  conservation: ConservationState | null
  construction_features: string[] // carpintería, pisos, etc. con opciones predefinidas + free text
  reason_for_sale: string | null
  sale_timeframe: string | null // "urgente", "1-3_meses", "3-6_meses", "6+_meses"
  strong_points: string[] // lista de "puntos estratégicos"
  extra_notes: string | null
}

export interface PurchaseVisitData {
  interested_in_purchase: boolean
  property_type_target: PropertyTypeVenta | null
  rooms_target: number | null
  budget_min: number | null
  budget_max: number | null
  budget_currency: 'USD' | 'ARS'
  neighborhoods_target: string[]
  required_features: string[]
  purchase_timeframe: string | null
  extra_notes: string | null
}

export interface VisitDataSnapshot {
  sale: SaleVisitData | null
  purchase: PurchaseVisitData | null
  updated_at: string
}

export const CONSTRUCTION_FEATURES_OPTIONS = [
  'Pisos madera', 'Pisos cerámica', 'Pisos porcelanato', 'Pisos mármol',
  'Carpintería madera', 'Carpintería aluminio', 'Carpintería DVH',
  'Techo losa', 'Techo tejas', 'Cocina integrada', 'Lavadero',
  'Balcón aterrazado', 'Balcón francés', 'Patio', 'Parrilla',
  'Amenities', 'Portero eléctrico', 'Seguridad 24hs',
] as const
```

- [ ] **Step 2: Commit**

```bash
git add types/visit-data.types.ts
git commit -m "feat(types): add VisitDataSnapshot types for sale/purchase"
```

---

### Task 6.2: Crear endpoint PATCH visit-data

**Files:**
- Create: `app/api/deals/[id]/visit-data/route.ts`
- Create: `lib/supabase/visit-data.ts`

- [ ] **Step 1: Crear lib helper**

Write `lib/supabase/visit-data.ts`:

```typescript
// lib/supabase/visit-data.ts
import { createClient } from '@supabase/supabase-js'
import type { VisitDataSnapshot } from '@/types/visit-data.types'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function saveVisitData(dealId: string, snapshot: Partial<VisitDataSnapshot>) {
  // Merge ATÓMICO via RPC — evita race condition del read-modify-write.
  // Requiere función Postgres creada en migración 20260418000000_visit_data.sql (ver abajo).
  const patch = { ...snapshot, updated_at: new Date().toISOString() }
  const { data, error } = await getAdmin().rpc('merge_deal_visit_data', {
    p_deal_id: dealId,
    p_patch: patch,
  })
  if (error) throw error
  return data as VisitDataSnapshot
}

export async function getVisitData(dealId: string): Promise<VisitDataSnapshot | null> {
  const { data, error } = await getAdmin().from('deals').select('visit_data').eq('id', dealId).single()
  if (error) throw error
  return (data?.visit_data as VisitDataSnapshot | null) || null
}

export async function markVisitCompleted(dealId: string) {
  const { error } = await getAdmin()
    .from('deals')
    .update({
      stage: 'visited',
      visit_completed_at: new Date().toISOString(),
      stage_changed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
  if (error) throw error
}
```

- [ ] **Step 2: Crear endpoint**

Write `app/api/deals/[id]/visit-data/route.ts`:

```typescript
// app/api/deals/[id]/visit-data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { saveVisitData, getVisitData, markVisitCompleted } from '@/lib/supabase/visit-data'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const data = await getVisitData(id)
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const body = await req.json()
  const { snapshot, complete } = body
  const saved = await saveVisitData(id, snapshot)
  if (complete) await markVisitCompleted(id)
  return NextResponse.json({ data: saved })
}
```

- [ ] **Step 3: Type-check + commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat(api): add /api/deals/[id]/visit-data PATCH endpoint"
```

---

### Task 6.3: Crear componente VisitDataForm con auto-save

**Files:**
- Create: `components/pipeline/VisitDataForm.tsx`

- [ ] **Step 1: Implementar el form con onBlur auto-save debounced**

Write `components/pipeline/VisitDataForm.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Home, User, ShoppingCart, Save, Loader2, CheckCircle2 } from 'lucide-react'
import type {
  VisitDataSnapshot, SaleVisitData, PurchaseVisitData,
  PropertyTypeVenta, Disposition, Orientation, Quality, ConservationState,
} from '@/types/visit-data.types'
import { CONSTRUCTION_FEATURES_OPTIONS } from '@/types/visit-data.types'

const EMPTY_SALE: SaleVisitData = {
  property_type: 'departamento',
  property_type_other: null,
  rooms: null, bedrooms: null, bathrooms: null, garages: null,
  covered_m2: null, semi_covered_m2: null, uncovered_m2: null, total_m2: null, terrain_m2: null,
  age_years: null, is_refurbished: false,
  orientation: null, floor: null, total_floors: null,
  disposition: null, quality: null, conservation: null,
  construction_features: [], reason_for_sale: null, sale_timeframe: null,
  strong_points: [], extra_notes: null,
}

const EMPTY_PURCHASE: PurchaseVisitData = {
  interested_in_purchase: false,
  property_type_target: null, rooms_target: null,
  budget_min: null, budget_max: null, budget_currency: 'USD',
  neighborhoods_target: [], required_features: [],
  purchase_timeframe: null, extra_notes: null,
}

interface Props {
  dealId: string
  initial: VisitDataSnapshot | null
  onCompleted: () => void
}

export function VisitDataForm({ dealId, initial, onCompleted }: Props) {
  const [sale, setSale] = useState<SaleVisitData>(initial?.sale || EMPTY_SALE)
  const [purchase, setPurchase] = useState<PurchaseVisitData>(initial?.purchase || EMPTY_PURCHASE)
  const [activeTab, setActiveTab] = useState<'sale' | 'purchase'>('sale')
  const [savingStatus, setSavingStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [finalizing, setFinalizing] = useState(false)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-save debounced (500ms tras cada cambio)
  const triggerAutoSave = useCallback((next: Partial<VisitDataSnapshot>) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(async () => {
      setSavingStatus('saving')
      try {
        const res = await fetch(`/api/deals/${dealId}/visit-data`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshot: next }),
        })
        if (!res.ok) throw new Error('save failed')
        setSavingStatus('saved')
        setTimeout(() => setSavingStatus('idle'), 2000)
      } catch {
        setSavingStatus('error')
      }
    }, 500)
  }, [dealId])

  const updateSale = <K extends keyof SaleVisitData>(key: K, value: SaleVisitData[K]) => {
    const next = { ...sale, [key]: value }
    setSale(next)
    triggerAutoSave({ sale: next })
  }

  const updatePurchase = <K extends keyof PurchaseVisitData>(key: K, value: PurchaseVisitData[K]) => {
    const next = { ...purchase, [key]: value }
    setPurchase(next)
    triggerAutoSave({ purchase: next })
  }

  const toggleFeature = (f: string) => {
    const next = sale.construction_features.includes(f)
      ? sale.construction_features.filter(x => x !== f)
      : [...sale.construction_features, f]
    updateSale('construction_features', next)
  }

  const addStrongPoint = (point: string) => {
    if (!point.trim()) return
    updateSale('strong_points', [...sale.strong_points, point.trim()])
  }

  async function handleFinalize() {
    setFinalizing(true)
    // Forzar flush del save pendiente
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    try {
      await fetch(`/api/deals/${dealId}/visit-data`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot: { sale, purchase }, complete: true }),
      })
      onCompleted()
    } catch {
      alert('Error al finalizar la visita. Los datos sí fueron guardados.')
    } finally {
      setFinalizing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Status indicator */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border bg-muted/40 p-0.5">
          <button
            onClick={() => setActiveTab('sale')}
            className={`px-4 py-2 rounded-md text-sm flex items-center gap-2 transition-all ${activeTab === 'sale' ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`}
          >
            <Home className="h-4 w-4" /> Venta (Propiedad)
          </button>
          <button
            onClick={() => setActiveTab('purchase')}
            className={`px-4 py-2 rounded-md text-sm flex items-center gap-2 transition-all ${activeTab === 'purchase' ? 'bg-background shadow-sm font-semibold' : 'text-muted-foreground'}`}
          >
            <ShoppingCart className="h-4 w-4" /> Compra (Interesado)
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {savingStatus === 'saving' && <><Loader2 className="h-3 w-3 animate-spin" /> Guardando...</>}
          {savingStatus === 'saved' && <><CheckCircle2 className="h-3 w-3 text-green-600" /> Guardado</>}
          {savingStatus === 'error' && <span className="text-red-600">Error — reintenta</span>}
        </div>
      </div>

      {activeTab === 'sale' && (
        <SaleSection
          sale={sale}
          onUpdate={updateSale}
          onToggleFeature={toggleFeature}
          onAddStrongPoint={addStrongPoint}
        />
      )}
      {activeTab === 'purchase' && (
        <PurchaseSection purchase={purchase} onUpdate={updatePurchase} />
      )}

      <div className="flex gap-3 pt-4 border-t">
        <Button onClick={handleFinalize} disabled={finalizing} size="lg" className="flex-1">
          {finalizing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Finalizar Visita
        </Button>
      </div>
    </div>
  )
}

// ──── SaleSection ────
function SaleSection({
  sale, onUpdate, onToggleFeature, onAddStrongPoint,
}: {
  sale: SaleVisitData
  onUpdate: <K extends keyof SaleVisitData>(k: K, v: SaleVisitData[K]) => void
  onToggleFeature: (f: string) => void
  onAddStrongPoint: (p: string) => void
}) {
  const [newPoint, setNewPoint] = useState('')
  return (
    <div className="space-y-4">
      {/* Características Básicas */}
      <Card>
        <CardHeader><CardTitle className="text-base">Características Básicas</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><Label>Tipo</Label>
            <select value={sale.property_type} onChange={e => onUpdate('property_type', e.target.value as PropertyTypeVenta)} className="w-full rounded-md border px-3 py-2">
              <option value="departamento">Departamento</option>
              <option value="casa">Casa</option>
              <option value="ph">PH</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          {sale.property_type === 'otro' && (
            <div><Label>Especificar</Label>
              <Input value={sale.property_type_other || ''} onChange={e => onUpdate('property_type_other', e.target.value)} />
            </div>
          )}
          <div><Label>Ambientes</Label>
            <Input type="number" min="0" value={sale.rooms ?? ''} onChange={e => onUpdate('rooms', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>Dormitorios</Label>
            <Input type="number" min="0" value={sale.bedrooms ?? ''} onChange={e => onUpdate('bedrooms', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>Baños</Label>
            <Input type="number" min="0" value={sale.bathrooms ?? ''} onChange={e => onUpdate('bathrooms', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>Cocheras</Label>
            <Input type="number" min="0" value={sale.garages ?? ''} onChange={e => onUpdate('garages', e.target.value ? +e.target.value : null)} />
          </div>
        </CardContent>
      </Card>

      {/* Metrajes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Metrajes (m²)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><Label>Cubiertos</Label><Input type="number" value={sale.covered_m2 ?? ''} onChange={e => onUpdate('covered_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Semi-cubiertos</Label><Input type="number" value={sale.semi_covered_m2 ?? ''} onChange={e => onUpdate('semi_covered_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Descubiertos</Label><Input type="number" value={sale.uncovered_m2 ?? ''} onChange={e => onUpdate('uncovered_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Totales</Label><Input type="number" value={sale.total_m2 ?? ''} onChange={e => onUpdate('total_m2', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Terreno</Label><Input type="number" value={sale.terrain_m2 ?? ''} onChange={e => onUpdate('terrain_m2', e.target.value ? +e.target.value : null)} /></div>
        </CardContent>
      </Card>

      {/* Antigüedad y Estado */}
      <Card>
        <CardHeader><CardTitle className="text-base">Antigüedad, Orientación, Estado</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div><Label>Antigüedad (años)</Label>
            <Input type="number" min="0" value={sale.age_years ?? ''} onChange={e => onUpdate('age_years', e.target.value ? +e.target.value : null)} />
          </div>
          <div><Label>¿Refaccionado?</Label>
            <div className="flex items-center gap-2 pt-2">
              <input type="checkbox" checked={sale.is_refurbished} onChange={e => onUpdate('is_refurbished', e.target.checked)} className="h-4 w-4" />
              <span>Sí, refaccionado</span>
            </div>
          </div>
          <div><Label>Orientación</Label>
            <select value={sale.orientation ?? ''} onChange={e => onUpdate('orientation', (e.target.value || null) as Orientation | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              {['N','S','E','O','NE','NO','SE','SO'].map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div><Label>Piso</Label><Input type="number" value={sale.floor ?? ''} onChange={e => onUpdate('floor', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Plantas totales</Label><Input type="number" value={sale.total_floors ?? ''} onChange={e => onUpdate('total_floors', e.target.value ? +e.target.value : null)} /></div>
          <div><Label>Disposición</Label>
            <select value={sale.disposition ?? ''} onChange={e => onUpdate('disposition', (e.target.value || null) as Disposition | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              <option value="frente">Frente</option>
              <option value="contrafrente">Contrafrente</option>
              <option value="interno">Interno</option>
              <option value="lateral">Lateral</option>
            </select>
          </div>
          <div><Label>Calidad</Label>
            <select value={sale.quality ?? ''} onChange={e => onUpdate('quality', (e.target.value || null) as Quality | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              {['baja','media-baja','media','media-alta','alta','premium'].map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div><Label>Estado conservación</Label>
            <select value={sale.conservation ?? ''} onChange={e => onUpdate('conservation', (e.target.value || null) as ConservationState | null)} className="w-full rounded-md border px-3 py-2">
              <option value="">Sin definir</option>
              <option value="a_refaccionar">A refaccionar</option>
              <option value="bueno">Bueno</option>
              <option value="muy_bueno">Muy bueno</option>
              <option value="excelente">Excelente</option>
              <option value="a_estrenar">A estrenar</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Características constructivas */}
      <Card>
        <CardHeader><CardTitle className="text-base">Características Constructivas</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {CONSTRUCTION_FEATURES_OPTIONS.map(f => (
            <Badge
              key={f}
              variant={sale.construction_features.includes(f) ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => onToggleFeature(f)}
            >
              {f}
            </Badge>
          ))}
        </CardContent>
      </Card>

      {/* Motivación de venta */}
      <Card>
        <CardHeader><CardTitle className="text-base">Motivación y Tiempos</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <Label>¿Por qué quiere vender?</Label>
            <textarea
              className="w-full min-h-[80px] rounded-md border px-3 py-2"
              value={sale.reason_for_sale ?? ''}
              onChange={e => onUpdate('reason_for_sale', e.target.value || null)}
              placeholder="Mudanza, separación, inversión, etc."
            />
          </div>
          <div>
            <Label>¿En cuánto tiempo quiere vender?</Label>
            <select
              value={sale.sale_timeframe ?? ''}
              onChange={e => onUpdate('sale_timeframe', e.target.value || null)}
              className="w-full rounded-md border px-3 py-2"
            >
              <option value="">Sin definir</option>
              <option value="urgente">Urgente (&lt;1 mes)</option>
              <option value="1-3_meses">1–3 meses</option>
              <option value="3-6_meses">3–6 meses</option>
              <option value="6+_meses">Más de 6 meses</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Puntos fuertes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Puntos Estratégicos (Fortalezas)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newPoint}
              onChange={e => setNewPoint(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAddStrongPoint(newPoint); setNewPoint('') } }}
              placeholder="Ej: Vista abierta, ubicación estratégica, edificio nuevo..."
            />
            <Button type="button" size="sm" onClick={() => { onAddStrongPoint(newPoint); setNewPoint('') }}>Agregar</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {sale.strong_points.map((p, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pr-1">
                {p}
                <button
                  onClick={() => onUpdate('strong_points', sale.strong_points.filter((_, ix) => ix !== i))}
                  className="ml-1 hover:text-red-600"
                >&times;</button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notas adicionales */}
      <Card>
        <CardContent className="pt-6">
          <Label>Notas adicionales</Label>
          <textarea
            className="w-full min-h-[80px] rounded-md border px-3 py-2 mt-2"
            value={sale.extra_notes ?? ''}
            onChange={e => onUpdate('extra_notes', e.target.value || null)}
            placeholder="Observaciones libres..."
          />
        </CardContent>
      </Card>
    </div>
  )
}

// ──── PurchaseSection ────
function PurchaseSection({ purchase, onUpdate }: {
  purchase: PurchaseVisitData
  onUpdate: <K extends keyof PurchaseVisitData>(k: K, v: PurchaseVisitData[K]) => void
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={purchase.interested_in_purchase}
              onChange={e => onUpdate('interested_in_purchase', e.target.checked)}
              className="h-4 w-4"
              id="interested"
            />
            <Label htmlFor="interested" className="font-semibold">¿El cliente también está buscando comprar?</Label>
          </div>
        </CardContent>
      </Card>

      {purchase.interested_in_purchase && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Preferencias de Compra</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><Label>Tipo buscado</Label>
                <select value={purchase.property_type_target ?? ''} onChange={e => onUpdate('property_type_target', (e.target.value || null) as PropertyTypeVenta | null)} className="w-full rounded-md border px-3 py-2">
                  <option value="">Sin definir</option>
                  <option value="departamento">Departamento</option>
                  <option value="casa">Casa</option>
                  <option value="ph">PH</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div><Label>Ambientes</Label>
                <Input type="number" value={purchase.rooms_target ?? ''} onChange={e => onUpdate('rooms_target', e.target.value ? +e.target.value : null)} />
              </div>
              <div><Label>Plazo de compra</Label>
                <select value={purchase.purchase_timeframe ?? ''} onChange={e => onUpdate('purchase_timeframe', e.target.value || null)} className="w-full rounded-md border px-3 py-2">
                  <option value="">Sin definir</option>
                  <option value="urgente">Urgente</option>
                  <option value="1-3_meses">1–3 meses</option>
                  <option value="3-6_meses">3–6 meses</option>
                  <option value="6+_meses">Más de 6 meses</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Presupuesto</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm">
              <div><Label>Mínimo</Label><Input type="number" value={purchase.budget_min ?? ''} onChange={e => onUpdate('budget_min', e.target.value ? +e.target.value : null)} /></div>
              <div><Label>Máximo</Label><Input type="number" value={purchase.budget_max ?? ''} onChange={e => onUpdate('budget_max', e.target.value ? +e.target.value : null)} /></div>
              <div><Label>Moneda</Label>
                <select value={purchase.budget_currency} onChange={e => onUpdate('budget_currency', e.target.value as 'USD' | 'ARS')} className="w-full rounded-md border px-3 py-2">
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <div>
                <Label>Barrios de interés (separados por coma)</Label>
                <Input
                  value={purchase.neighborhoods_target.join(', ')}
                  onChange={e => onUpdate('neighborhoods_target', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="Palermo, Belgrano, Recoleta..."
                />
              </div>
              <div>
                <Label>Características requeridas (separadas por coma)</Label>
                <Input
                  value={purchase.required_features.join(', ')}
                  onChange={e => onUpdate('required_features', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                  placeholder="Cochera, amenities, 2 baños..."
                />
              </div>
              <div>
                <Label>Notas</Label>
                <textarea className="w-full min-h-[80px] rounded-md border px-3 py-2" value={purchase.extra_notes ?? ''} onChange={e => onUpdate('extra_notes', e.target.value || null)} />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check + commit**

```bash
npx tsc --noEmit
git add components/pipeline/VisitDataForm.tsx
git commit -m "feat(visita): add VisitDataForm with sale/purchase tabs and auto-save"
```

---

### Task 6.4: Integrar VisitDataForm al flujo del pipeline

**Files:**
- Modify: `app/(dashboard)/pipeline/[id]/page.tsx:275-285`

- [ ] **Step 1: Cambiar "Marcar Visita Realizada" para abrir modal**

Edit `app/(dashboard)/pipeline/[id]/page.tsx`:

1. Añadir al componente: state `const [showVisitModal, setShowVisitModal] = useState(false)` (cerca de línea 37).
2. Import: `import { VisitDataForm } from '@/components/pipeline/VisitDataForm'`.
3. Cambiar el botón "Marcar Visita Realizada" (líneas 277-280):

```tsx
<Button onClick={() => setShowVisitModal(true)} disabled={advancing} className="w-full" size="lg">
  {advancing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
  Marcar Visita Realizada
</Button>
```

4. Añadir modal al final del componente, antes del closing `</div>` final:

```tsx
{showVisitModal && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto" onClick={() => setShowVisitModal(false)}>
    <div className="bg-background rounded-2xl shadow-xl w-full max-w-4xl my-8 p-6 space-y-4 max-h-[95vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between sticky top-0 bg-background pb-2 border-b z-10">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Eye className="h-5 w-5 text-amber-600" />
          Datos de la Visita Realizada
        </h2>
        <Button variant="ghost" size="sm" onClick={() => setShowVisitModal(false)}>&times;</Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Recolectá los datos de la propiedad durante la visita. Todo se guarda automáticamente.
        Al finalizar, el proceso pasa a "Visita Realizada".
      </p>
      <VisitDataForm
        dealId={deal.id}
        initial={deal.visit_data || null}
        onCompleted={() => { setShowVisitModal(false); fetchDeal() }}
      />
    </div>
  </div>
)}
```

- [ ] **Step 2: Verificar deal.visit_data viene en el GET**

Read `app/api/deals/[id]/route.ts` (o su implementación). Asegurar que el SELECT incluye `visit_data`. El SELECT `*` ya lo cubre (está en `lib/supabase/deals.ts:67-71`).

- [ ] **Step 3: Probar manualmente**

1. Ir a un deal en stage `scheduled`.
2. Click "Marcar Visita Realizada" → modal abre.
3. Llenar tipo, ambientes, metros. Esperar 1 segundo. Ver "Guardado" aparecer.
4. Cambiar a tab Compra, marcar checkbox. Ver "Guardado".
5. Cerrar modal sin finalizar. Recargar página. Re-abrir modal. Datos persisten.
6. Finalizar. Stage pasa a `visited`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(visita): integrate VisitDataForm modal on 'Marcar Visita Realizada'"
```

---

# FASE 7 — Prellenado de Tasación desde Visit Data

### Task 7.1: Mapear visit_data → wizard initialData

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx` (fetch de deal + pre-fill)
- Modify: `components/appraisal/PropertyWizard.tsx` (aceptar initialData ampliado)

- [ ] **Step 1: Función de mapeo**

En `app/(dashboard)/appraisal/new/page.tsx`, después del bloque `if (dealId)`, extender el fetch para traer `visit_data` y mapear:

```typescript
// Fetch deal + visit_data
const dealRes = await fetch(`/api/deals/${dealId}`)
if (dealRes.ok) {
  const { data: deal } = await dealRes.json()
  const visit = deal.visit_data?.sale as SaleVisitData | null

  const prefill = {
    address: deal.property_address,
    neighborhood: deal.neighborhood || visit?.property_type_other || '',
    city: 'CABA',
    propertyType: deal.property_type || visit?.property_type || 'apt',
    rooms: visit?.rooms ?? deal.rooms ?? null,
    bedrooms: visit?.bedrooms ?? null,
    bathrooms: visit?.bathrooms ?? null,
    garages: visit?.garages ?? null,
    coveredArea: visit?.covered_m2 ?? deal.covered_area ?? null,
    semiCoveredArea: visit?.semi_covered_m2 ?? null,
    uncoveredArea: visit?.uncovered_m2 ?? null,
    totalArea: visit?.total_m2 ?? null,
    terrainArea: visit?.terrain_m2 ?? null,
    floor: visit?.floor ?? null,
    totalFloors: visit?.total_floors ?? null,
    age: visit?.age_years ?? null,
    isRefurbished: visit?.is_refurbished ?? false,
    orientation: visit?.orientation ?? null,
    disposition: visit?.disposition ?? null,
    quality: visit?.quality ?? null,
    conservationState: visit?.conservation ?? null,
    constructionFeatures: visit?.construction_features ?? [],
    strongPoints: visit?.strong_points ?? [],
    reasonForSale: visit?.reason_for_sale ?? null,
    saleTimeframe: visit?.sale_timeframe ?? null,
    extraNotes: visit?.extra_notes ?? null,
    dealContactName: deal.contacts?.full_name,
  }
  // Pasar prefill al PropertyWizard via initialData
  setPrefillData(prefill)
  setSkipToComparables(true) // si todos los campos obligatorios están llenos
}
```

- [ ] **Step 2: Actualizar PropertyWizard para aceptar skipToComparables**

Read `components/appraisal/PropertyWizard.tsx` (es un archivo crítico — asegúrate de leerlo completo primero).

Añadir prop `initialStep?: number` y una prop `initialData?: FormData` (ya existe).

Si `initialStep` se pasa, `useState(initialStep)` en vez de 0.

Si la prop `skipToComparables` es true, el wizard se inicia en el step de comparables.

- [ ] **Step 3: Mostrar banner "Datos prellenados desde la visita"**

En `appraisal/new/page.tsx`, cerca del banner existente de "Creando tasación para...":

```tsx
{prefillData && (
  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
    <p className="text-sm text-emerald-900">
      ✓ Datos de la propiedad prellenados desde la visita realizada. Revisá y ajustá si es necesario antes de continuar con los comparables.
    </p>
  </div>
)}
```

- [ ] **Step 4: Probar**

1. Tomar un deal con `visited` y visit_data llenos.
2. Click "Crear Tasación".
3. Expected: wizard carga con datos prellenados. Los campos de ambientes, metros, estado, calidad, etc. están llenos.
4. Usuario puede ir siguiente sin cambios → llegar a comparables → completar flujo normal.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(appraisal): prefill wizard from visit_data snapshot"
```

---

# FASE 8 — Documentos Legales Restructurados

### Task 8.1: Definir catálogo de documentos legales

**Files:**
- Create: `types/legal-docs.types.ts`

- [ ] **Step 1: Definir el catálogo**

Write `types/legal-docs.types.ts`:

```typescript
// types/legal-docs.types.ts
// Catálogo de documentos legales requeridos, condicionales y opcionales.

export type LegalDocCategory = 'mandatory' | 'temporal' | 'optional'

export interface LegalDocDefinition {
  key: string
  label: string
  category: LegalDocCategory
  description?: string
  condition?: 'succession' | 'divorce' | 'powers' | 'credit_purchase' | 'apt_or_ph'
  alertDaysRemaining?: number // para temporales, cuántos días antes alertar
}

export const LEGAL_DOCS_CATALOG: LegalDocDefinition[] = [
  // OBLIGATORIOS
  { key: 'autorizacion_firmada', label: 'Autorización Firmada', category: 'mandatory', description: 'Autorización del propietario firmada para comercializar la propiedad.' },
  { key: 'dni_titulares', label: 'DNI de los Titulares', category: 'mandatory', description: 'Copia de DNI de todos los titulares.' },
  { key: 'escritura', label: 'Escritura de la Propiedad', category: 'mandatory', description: 'Escritura vigente.' },

  // CONDICIONALES (obligatorios si aplica la condición)
  { key: 'declaratoria_herederos', label: 'Declaratoria de Herederos', category: 'mandatory', condition: 'succession', description: 'Obligatorio si hay sucesión.' },
  { key: 'sentencia_divorcio', label: 'Sentencia de Divorcio', category: 'mandatory', condition: 'divorce', description: 'Obligatorio si hay divorcio.' },

  // TEMPORALES (obligatorios con alertas)
  { key: 'reglamento', label: 'Reglamento de Copropiedad', category: 'temporal', condition: 'apt_or_ph', description: 'Requerido para departamentos y PH.', alertDaysRemaining: 15 },
  { key: 'plano', label: 'Plano de la Propiedad', category: 'temporal', condition: 'credit_purchase', description: 'Requerido si el comprador adquiere con crédito.', alertDaysRemaining: 15 },
  { key: 'poderes', label: 'Poderes', category: 'temporal', condition: 'powers', description: 'Requerido si hay representación por poder.', alertDaysRemaining: 15 },

  // OPCIONALES
  { key: 'estado_parcelario', label: 'Estado Parcelario', category: 'optional', description: 'Opcional. Aplica a PH, casa en provincia o casa en CABA.' },
]

export type DocItemStatus = 'missing' | 'pending' | 'approved' | 'rejected'

export interface DocItemState {
  file_url?: string
  file_name?: string
  uploaded_at?: string
  status: DocItemStatus
  reviewer_notes?: string | null
  reviewed_at?: string | null
  reviewed_by?: string | null
}

export interface LegalDocsState {
  [item_key: string]: DocItemState
}

export interface LegalFlags {
  has_succession: boolean
  has_divorce: boolean
  has_powers: boolean
  is_credit_purchase: boolean
}

export function getApplicableDocs(flags: LegalFlags, propertyType: string): LegalDocDefinition[] {
  return LEGAL_DOCS_CATALOG.filter(d => {
    if (!d.condition) return true
    if (d.condition === 'succession') return flags.has_succession
    if (d.condition === 'divorce') return flags.has_divorce
    if (d.condition === 'powers') return flags.has_powers
    if (d.condition === 'credit_purchase') return flags.is_credit_purchase
    if (d.condition === 'apt_or_ph') return propertyType === 'departamento' || propertyType === 'apt' || propertyType === 'ph'
    return true
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add types/legal-docs.types.ts
git commit -m "feat(legal): define legal docs catalog types + helpers"
```

---

### Task 8.2: Crear helpers de CRUD + endpoint

**Files:**
- Create: `lib/supabase/legal-docs.ts`
- Create: `app/api/properties/[id]/legal-docs/route.ts`
- Create: `app/api/properties/[id]/legal-docs/[itemKey]/route.ts`

- [ ] **Step 1: lib/supabase/legal-docs.ts**

Write:

```typescript
// lib/supabase/legal-docs.ts
import { createClient } from '@supabase/supabase-js'
import type { LegalDocsState, LegalFlags, DocItemState } from '@/types/legal-docs.types'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function getLegalDocs(propertyId: string) {
  const { data, error } = await getAdmin()
    .from('properties')
    .select('legal_docs, legal_flags, property_type')
    .eq('id', propertyId).single()
  if (error) throw error
  return {
    docs: (data.legal_docs as LegalDocsState) || {},
    flags: (data.legal_flags as LegalFlags) || { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false },
    propertyType: data.property_type as string,
  }
}

export async function setLegalFlags(propertyId: string, flags: Partial<LegalFlags>) {
  const current = await getLegalDocs(propertyId)
  const merged: LegalFlags = { ...current.flags, ...flags }
  const { error } = await getAdmin().from('properties').update({ legal_flags: merged, updated_at: new Date().toISOString() }).eq('id', propertyId)
  if (error) throw error
  return merged
}

export async function upsertLegalDocItem(propertyId: string, itemKey: string, state: Partial<DocItemState>) {
  const current = await getLegalDocs(propertyId)
  const existing = current.docs[itemKey] || { status: 'missing' as const }
  const merged: DocItemState = { ...existing, ...state }
  const next: LegalDocsState = { ...current.docs, [itemKey]: merged }
  const { error } = await getAdmin().from('properties').update({ legal_docs: next, updated_at: new Date().toISOString() }).eq('id', propertyId)
  if (error) throw error
  return merged
}
```

- [ ] **Step 2: Endpoint GET/PATCH flags**

Write `app/api/properties/[id]/legal-docs/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getLegalDocs, setLegalFlags } from '@/lib/supabase/legal-docs'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  return NextResponse.json({ data: await getLegalDocs(id) })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const { flags } = await req.json()
  return NextResponse.json({ data: await setLegalFlags(id, flags) })
}
```

- [ ] **Step 3: Endpoint upload por ítem**

Write `app/api/properties/[id]/legal-docs/[itemKey]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { upsertLegalDocItem } from '@/lib/supabase/legal-docs'
import { requireAuth } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'

function getStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemKey: string }> }) {
  const user = await requireAuth()
  const { id, itemKey } = await params
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const ext = file.name.split('.').pop() || 'bin'
  const path = `properties/${id}/legal/${itemKey}-${Date.now()}.${ext}`
  const bucket = getStorage().from('property-files')
  const buf = await file.arrayBuffer()
  const { error: upErr } = await bucket.upload(path, buf, { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: { publicUrl } } = bucket.getPublicUrl(path)

  const item = await upsertLegalDocItem(id, itemKey, {
    file_url: publicUrl,
    file_name: file.name,
    uploaded_at: new Date().toISOString(),
    status: 'pending',
    reviewed_at: null,
    reviewer_notes: null,
    reviewed_by: null,
  })

  return NextResponse.json({ data: item })
}
```

- [ ] **Step 4: Type-check + commit**

```bash
npx tsc --noEmit
git add -A
git commit -m "feat(legal): add legal-docs CRUD lib + upload endpoints per item"
```

---

### Task 8.3: UI del asesor — Checklist de documentos

**Files:**
- Create: `components/properties/LegalDocsChecklist.tsx`
- Modify: `app/(dashboard)/properties/[id]/page.tsx:253-283` (reemplazar card Documentación)

- [ ] **Step 1: Componente LegalDocsChecklist**

Write `components/properties/LegalDocsChecklist.tsx`:

```tsx
'use client'

import { useState, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle, Clock, Loader2 } from 'lucide-react'
import type { LegalDocsState, LegalFlags, DocItemState } from '@/types/legal-docs.types'
import { LEGAL_DOCS_CATALOG, getApplicableDocs } from '@/types/legal-docs.types'

interface Props {
  propertyId: string
  propertyType: string
  docs: LegalDocsState
  flags: LegalFlags
  isAbogado: boolean
  onUpdated: () => void
}

export function LegalDocsChecklist({ propertyId, propertyType, docs, flags, isAbogado, onUpdated }: Props) {
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [savingFlags, setSavingFlags] = useState(false)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  const applicable = getApplicableDocs(flags, propertyType)
  const mandatory = applicable.filter(d => d.category === 'mandatory')
  const temporal = applicable.filter(d => d.category === 'temporal')
  const optional = applicable.filter(d => d.category === 'optional')

  async function handleFlagChange(flag: keyof LegalFlags, value: boolean) {
    setSavingFlags(true)
    try {
      await fetch(`/api/properties/${propertyId}/legal-docs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flags: { [flag]: value } }),
      })
      onUpdated()
    } finally { setSavingFlags(false) }
  }

  async function handleUpload(itemKey: string, file: File) {
    setUploadingKey(itemKey)
    try {
      const fd = new FormData()
      fd.append('file', file)
      await fetch(`/api/properties/${propertyId}/legal-docs/${itemKey}`, { method: 'POST', body: fd })
      onUpdated()
    } finally { setUploadingKey(null) }
  }

  const renderItem = (def: typeof LEGAL_DOCS_CATALOG[0]) => {
    const state: DocItemState = docs[def.key] || { status: 'missing' }
    const hasFile = !!state.file_url
    return (
      <div key={def.key} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
        <div className="shrink-0">
          {state.status === 'approved' && <CheckCircle className="h-5 w-5 text-green-600" />}
          {state.status === 'rejected' && <XCircle className="h-5 w-5 text-red-600" />}
          {state.status === 'pending' && <Clock className="h-5 w-5 text-amber-500" />}
          {state.status === 'missing' && <AlertTriangle className="h-5 w-5 text-gray-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{def.label}</span>
            {def.category === 'mandatory' && <Badge variant="destructive" className="text-xs">Obligatorio</Badge>}
            {def.category === 'temporal' && <Badge className="text-xs bg-amber-500">Temporal</Badge>}
            {def.category === 'optional' && <Badge variant="secondary" className="text-xs">Opcional</Badge>}
            {state.status === 'rejected' && <Badge variant="destructive" className="text-xs">Rechazado</Badge>}
            {state.status === 'approved' && <Badge className="text-xs bg-green-600">Aprobado</Badge>}
          </div>
          {def.description && <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>}
          {hasFile && (
            <a href={state.file_url} target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
              <FileText className="h-3 w-3" /> {state.file_name}
            </a>
          )}
          {state.reviewer_notes && (
            <p className={`text-xs mt-1 ${state.status === 'rejected' ? 'text-red-700' : 'text-muted-foreground'}`}>
              <span className="font-semibold">Abogado: </span>{state.reviewer_notes}
            </p>
          )}
        </div>
        {!isAbogado && (
          <div className="shrink-0">
            <input
              ref={el => { fileInputs.current[def.key] = el }}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.png"
              onChange={e => e.target.files?.[0] && handleUpload(def.key, e.target.files[0])}
            />
            <Button
              size="sm"
              variant={hasFile ? 'outline' : 'default'}
              onClick={() => fileInputs.current[def.key]?.click()}
              disabled={uploadingKey === def.key}
            >
              {uploadingKey === def.key
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <><Upload className="h-3.5 w-3.5 mr-1" />{hasFile ? 'Reemplazar' : 'Subir'}</>
              }
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Flags condicionales (solo asesor puede cambiar) */}
      {!isAbogado && (
        <Card>
          <CardHeader><CardTitle className="text-base">Situación Jurídica</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.has_succession} onChange={e => handleFlagChange('has_succession', e.target.checked)} disabled={savingFlags} />
              ¿Hay sucesión?
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.has_divorce} onChange={e => handleFlagChange('has_divorce', e.target.checked)} disabled={savingFlags} />
              ¿Hay divorcio?
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.has_powers} onChange={e => handleFlagChange('has_powers', e.target.checked)} disabled={savingFlags} />
              ¿Hay poderes?
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={flags.is_credit_purchase} onChange={e => handleFlagChange('is_credit_purchase', e.target.checked)} disabled={savingFlags} />
              ¿Compra a crédito?
            </label>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Documentos Obligatorios</CardTitle></CardHeader>
        <CardContent className="space-y-2">{mandatory.map(renderItem)}</CardContent>
      </Card>

      {temporal.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Documentos Temporales (con alerta)</CardTitle></CardHeader>
          <CardContent className="space-y-2">{temporal.map(renderItem)}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Documentos Opcionales</CardTitle></CardHeader>
        <CardContent className="space-y-2">{optional.map(renderItem)}</CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Integrar en properties/[id]/page.tsx**

Reemplazar el Card "Documentación" (líneas 253-283) por:

```tsx
{/* Legal Docs Checklist */}
<LegalDocsChecklist
  propertyId={property.id}
  propertyType={property.property_type || ''}
  docs={legalDocsData?.docs || {}}
  flags={legalDocsData?.flags || { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }}
  isAbogado={isAbogado}
  onUpdated={fetchLegalDocs}
/>
```

Añadir al top del archivo:
- `import { LegalDocsChecklist } from '@/components/properties/LegalDocsChecklist'`
- State: `const [legalDocsData, setLegalDocsData] = useState<{ docs: LegalDocsState; flags: LegalFlags } | null>(null)`
- Fn `fetchLegalDocs`:
```typescript
async function fetchLegalDocs() {
  const res = await fetch(`/api/properties/${id}/legal-docs`)
  if (res.ok) {
    const { data } = await res.json()
    setLegalDocsData(data)
  }
}
useEffect(() => { fetchLegalDocs() }, [id])
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(legal): replace flat docs array with structured checklist UI for asesor"
```

---

# FASE 9 — Vista Abogado Restringida + Review por Ítem

### Task 9.1: Ocultar precio, comisión, fotos al abogado

**Files:**
- Modify: `app/(dashboard)/properties/[id]/page.tsx:222-251,286-312`

- [ ] **Step 1: Condicionar rendering por `isAbogado`**

Edit líneas 222-251 — el bloque con "Datos Comerciales" y "Datos de la Propiedad":

```tsx
<div className={`grid grid-cols-1 ${isAbogado ? '' : 'lg:grid-cols-2'} gap-6`}>
  <Card>
    <CardHeader><CardTitle className="text-lg"><Home className="h-5 w-5 inline mr-2" />Datos de la Propiedad</CardTitle></CardHeader>
    <CardContent className="space-y-2 text-sm">
      <div className="grid grid-cols-2 gap-2">
        <span className="text-muted-foreground">Dirección:</span><span className="font-semibold">{property.address}</span>
        <span className="text-muted-foreground">Barrio:</span><span>{property.neighborhood}</span>
        {property.city && <><span className="text-muted-foreground">Ciudad:</span><span>{property.city}</span></>}
        <span className="text-muted-foreground">Tipo:</span><span className="capitalize">{property.property_type}</span>
        {property.rooms && <><span className="text-muted-foreground">Ambientes:</span><span>{property.rooms}</span></>}
        {property.covered_area && <><span className="text-muted-foreground">Sup. Cubierta:</span><span>{property.covered_area} m²</span></>}
        {property.total_area && <><span className="text-muted-foreground">Sup. Total:</span><span>{property.total_area} m²</span></>}
      </div>
    </CardContent>
  </Card>

  {/* Datos Comerciales: oculto al abogado */}
  {!isAbogado && (
    <Card>
      <CardHeader><CardTitle className="text-lg">Datos Comerciales</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-muted-foreground">Precio:</span>
          <span className="font-bold">{new Intl.NumberFormat('es-AR', { style: 'currency', currency: property.currency, minimumFractionDigits: 0 }).format(property.asking_price)}</span>
          <span className="text-muted-foreground">Comisión:</span><span>{property.commission_percentage}%</span>
          {property.contract_start_date && <><span className="text-muted-foreground">Inicio contrato:</span><span>{property.contract_start_date}</span></>}
          {property.contract_end_date && <><span className="text-muted-foreground">Fin contrato:</span><span>{property.contract_end_date}</span></>}
          {property.origin && <><span className="text-muted-foreground">Origen:</span><span className="capitalize">{property.origin}</span></>}
        </div>
      </CardContent>
    </Card>
  )}
</div>
```

- [ ] **Step 2: Ocultar card Fotos al abogado**

Edit líneas 286-312 — wrap en `{!isAbogado && (...)}`:

```tsx
{!isAbogado && (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle className="text-lg"><Image className="h-5 w-5 inline mr-2" />Fotos ({photos.length})</CardTitle>
        <div>
          <input ref={photoRef} type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0], 'photo')} />
          <Button size="sm" variant="outline" onClick={() => photoRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
            Subir Foto
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      {photos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay fotos subidas.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {photos.map((url, i) => (
            <img key={i} src={url} alt={`Foto ${i + 1}`} className="rounded-lg h-32 w-full object-cover" />
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(abogado): hide precio, comisión, fotos from abogado view"
```

---

### Task 9.2: Aprobación por-ítem del abogado

**Files:**
- Create: `app/api/properties/[id]/legal-docs/[itemKey]/review/route.ts`
- Modify: `components/properties/LegalDocsChecklist.tsx` (añadir acciones del abogado)

- [ ] **Step 1: Endpoint review por ítem**

Write `app/api/properties/[id]/legal-docs/[itemKey]/review/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { upsertLegalDocItem } from '@/lib/supabase/legal-docs'
import { requirePermission } from '@/lib/auth/require-role'
import { logLegalEvent } from '@/lib/supabase/legal-events'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemKey: string }> }) {
  const user = await requirePermission('properties.review')
  const { id, itemKey } = await params
  const { approved, notes } = await req.json()

  await upsertLegalDocItem(id, itemKey, {
    status: approved ? 'approved' : 'rejected',
    reviewer_notes: notes || null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
  })
  await logLegalEvent({
    property_id: id,
    actor_id: user.id,
    actor_role: user.profile.role,
    action: approved ? 'approved_item' : 'rejected_item',
    item_key: itemKey,
    notes: notes || null,
  })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: UI del abogado en checklist**

Edit `components/properties/LegalDocsChecklist.tsx` — dentro de `renderItem`, cuando `isAbogado && hasFile && state.status !== 'approved'`:

Añadir abajo del item row:

```tsx
{isAbogado && hasFile && (state.status === 'pending' || state.status === 'rejected') && (
  <div className="shrink-0 flex items-center gap-1">
    <Button size="sm" variant="outline" className="text-green-700 border-green-300" onClick={() => handleReviewItem(def.key, true)}>
      <CheckCircle className="h-3.5 w-3.5" />
    </Button>
    <Button size="sm" variant="outline" className="text-red-700 border-red-300" onClick={() => {
      const note = prompt('Motivo del rechazo (requerido):')
      if (note) handleReviewItem(def.key, false, note)
    }}>
      <XCircle className="h-3.5 w-3.5" />
    </Button>
  </div>
)}
```

Añadir la fn:
```typescript
async function handleReviewItem(itemKey: string, approved: boolean, notes?: string) {
  await fetch(`/api/properties/${propertyId}/legal-docs/${itemKey}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved, notes }),
  })
  onUpdated()
}
```

- [ ] **Step 3: Determinar aprobación global automática**

Cuando todos los mandatorios aplicables estén `approved`, actualizar `properties.legal_status = 'approved'`. Esto puede hacerse al trigger del endpoint review:

Extender `upsertLegalDocItem` o añadir helper `checkGlobalApproval(propertyId)` que:
1. Lee legal_docs + flags + property_type
2. Llama `getApplicableDocs()`
3. Filtra mandatory. Verifica que todos tienen `status === 'approved'`
4. Si sí, update `properties.legal_status = 'approved', legal_reviewed_at = NOW()`

Write en `lib/supabase/legal-docs.ts` adicional:

```typescript
export async function checkGlobalApproval(propertyId: string) {
  const { docs, flags, propertyType } = await getLegalDocs(propertyId)
  const applicable = getApplicableDocs(flags, propertyType)
  const mandatory = applicable.filter(d => d.category === 'mandatory' || d.category === 'temporal')
  const allApproved = mandatory.every(d => docs[d.key]?.status === 'approved')

  if (allApproved) {
    await getAdmin().from('properties').update({
      legal_status: 'approved',
      legal_reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', propertyId)
  }
  return allApproved
}
```

Añadir a la ruta review/route.ts después del upsert:
```typescript
if (approved) await checkGlobalApproval(id)
```

Importar `getApplicableDocs` en el file.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(abogado): per-item review with automatic global approval"
```

---

# FASE 10 — Track Record Histórico

### Task 10.1: lib + componente de historial

**Files:**
- Create: `lib/supabase/legal-events.ts`
- Create: `components/properties/LegalReviewHistory.tsx`
- Modify: `app/(dashboard)/properties/[id]/page.tsx` (insertar historial)
- Create: `app/api/properties/[id]/legal-events/route.ts`

- [ ] **Step 1: Crear lib helper**

Write `lib/supabase/legal-events.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

function getAdmin() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) }

export interface LegalEvent {
  id: string
  property_id: string
  actor_id: string | null
  actor_role: string
  action: string
  item_key: string | null
  notes: string | null
  created_at: string
  actor_name?: string
}

export async function logLegalEvent(input: Omit<LegalEvent, 'id' | 'created_at' | 'actor_name'>) {
  const { error } = await getAdmin().from('legal_review_events').insert(input)
  if (error) throw error
}

export async function getLegalEvents(propertyId: string): Promise<LegalEvent[]> {
  const { data, error } = await getAdmin()
    .from('legal_review_events')
    .select(`
      id, property_id, actor_id, actor_role, action, item_key, notes, created_at,
      actor:actor_id ( full_name )
    `)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data || []).map((r: any) => ({ ...r, actor_name: r.actor?.full_name || 'Sistema' }))
}
```

Nota: usamos la sintaxis `actor:actor_id` de supabase-js para el join, que resuelve por columna (no depende del nombre del constraint FK). La migración ya define `actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL`, preservando registros históricos si se desactiva un perfil.

- [ ] **Step 2: Endpoint GET events**

Write `app/api/properties/[id]/legal-events/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getLegalEvents } from '@/lib/supabase/legal-events'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  return NextResponse.json({ data: await getLegalEvents(id) })
}
```

- [ ] **Step 3: Componente visual**

Write `components/properties/LegalReviewHistory.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Clock, CheckCircle, XCircle, FileText, MessageSquare, Send, RefreshCw } from 'lucide-react'
import { LEGAL_DOCS_CATALOG } from '@/types/legal-docs.types'

const ACTION_META: Record<string, { label: string; icon: any; color: string }> = {
  submitted: { label: 'Enviado a revisión', icon: Send, color: 'text-blue-600 bg-blue-100' },
  approved_item: { label: 'Documento aprobado', icon: CheckCircle, color: 'text-green-600 bg-green-100' },
  rejected_item: { label: 'Documento rechazado', icon: XCircle, color: 'text-red-600 bg-red-100' },
  approved_all: { label: 'Revisión legal completa', icon: CheckCircle, color: 'text-green-700 bg-green-200' },
  rejected_all: { label: 'Revisión legal rechazada', icon: XCircle, color: 'text-red-700 bg-red-200' },
  commented: { label: 'Comentario', icon: MessageSquare, color: 'text-gray-600 bg-gray-100' },
  resubmitted: { label: 'Reenviado tras corrección', icon: RefreshCw, color: 'text-amber-600 bg-amber-100' },
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function getItemLabel(itemKey: string | null) {
  if (!itemKey) return ''
  const def = LEGAL_DOCS_CATALOG.find(d => d.key === itemKey)
  return def?.label || itemKey
}

export function LegalReviewHistory({ propertyId }: { propertyId: string }) {
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/properties/${propertyId}/legal-events`)
      .then(r => r.json())
      .then(({ data }) => setEvents(data || []))
      .finally(() => setLoading(false))
  }, [propertyId])

  if (loading) return null
  if (!events.length) return null

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Clock className="h-5 w-5" />Historial de Revisión Legal</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.map(ev => {
            const meta = ACTION_META[ev.action] || { label: ev.action, icon: FileText, color: 'text-gray-600 bg-gray-100' }
            const Icon = meta.icon
            return (
              <div key={ev.id} className="flex gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${meta.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 border-b pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm">
                      {meta.label}
                      {ev.item_key && <span className="text-muted-foreground ml-1">· {getItemLabel(ev.item_key)}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(ev.created_at)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {ev.actor_name} ({ev.actor_role})
                  </p>
                  {ev.notes && <p className="text-sm mt-1 italic text-muted-foreground">"{ev.notes}"</p>}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Insertar en properties/[id]/page.tsx**

Añadir al import:
```tsx
import { LegalReviewHistory } from '@/components/properties/LegalReviewHistory'
```

Insertar cerca del final, antes del closing `</div>`:
```tsx
<LegalReviewHistory propertyId={property.id} />
```

- [ ] **Step 5: Logging en puntos críticos**

Editar `app/(dashboard)/properties/[id]/page.tsx` función `handleUpdateStatus('pending_review')` para log event 'submitted'. Lo simple: el endpoint `/api/properties/[id]` que reciba `status: 'pending_review'` debe logger:

Edit `app/api/properties/[id]/route.ts` (o donde esté el PUT handler), añadir después del update:
```typescript
if (body.status === 'pending_review') {
  await logLegalEvent({
    property_id: id,
    actor_id: user.id,
    actor_role: user.profile.role,
    action: 'submitted',
    item_key: null,
    notes: null,
  })
}
```

Y en el endpoint `app/api/properties/[id]/review/route.ts`:
```typescript
await logLegalEvent({
  property_id: id,
  actor_id: user.id,
  actor_role: 'abogado',
  action: approved ? 'approved_all' : 'rejected_all',
  item_key: null,
  notes: notes || null,
})
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(legal): add legal review history + audit log across submission/review"
```

---

# FASE 11 — Unificar CRM y Procesos

### Task 11.1: Redirigir `/pipeline` → `/crm` y adaptar CRM por rol

**Files:**
- Modify: `app/(dashboard)/pipeline/page.tsx` (convertir a redirect)
- Modify: `app/(dashboard)/layout.tsx:28-55` (quitar "Procesos" del nav)
- Modify: `app/(dashboard)/crm/page.tsx` (filtros por rol)

- [ ] **Step 1: Convertir /pipeline en redirect**

Reemplazar el contenido de `app/(dashboard)/pipeline/page.tsx` con:

```typescript
import { redirect } from 'next/navigation'

export default function PipelineListRedirect() {
  redirect('/crm')
}
```

Nota: `/pipeline/[id]` y `/pipeline/new` quedan intactos. Solo la lista `/pipeline` ahora redirige.

- [ ] **Step 2: Quitar ítem "Procesos"/"Pipeline" del nav**

Edit `app/(dashboard)/layout.tsx` — eliminar de `asesor` y de `coordinador`:

```typescript
// asesor (líneas 28-39) — remove { label: 'Procesos', href: '/pipeline' }
case 'asesor':
    return [
        { label: 'Pendientes', href: '/tasks' },
        { label: 'CRM', href: '/crm' },
        { label: 'Tasaciones', items: [
            { href: '/pipeline/new', label: 'Coordinar' },
            { href: '/appraisal/new', label: 'Nueva Tasación' },
            { href: '/appraisals', label: 'Historial' },
        ]},
        { label: 'Mis Contactos', href: '/contacts' },
        { label: 'Mis Propiedades', href: '/properties' },
    ]

// coordinador — remove { label: 'Pipeline', href: '/pipeline' }
case 'coordinador':
    return [
        { label: 'Pendientes', href: '/tasks' },
        { label: 'CRM', href: '/crm' },
        { label: 'Tasaciones', items: [
            { href: '/pipeline/new', label: 'Coordinar' },
            { href: '/appraisals', label: 'Historial' },
        ]},
        { label: 'Propiedades', items: [
            { href: '/properties', label: 'Listado' },
            { href: '/properties/new', label: 'Nueva' },
        ]},
        { label: 'Contactos', href: '/contacts' },
    ]

// admin/dueno — remove { label: 'Pipeline', href: '/pipeline' }, ADD Pendientes al inicio
// (admin/dueno también aterrizan en /tasks — ver Fase 5 — así que deben tener el ítem accesible)
default:
    return [
        { label: 'Pendientes', href: '/tasks' },
        { label: 'CRM', href: '/crm' },
        { label: 'Tasaciones', items: [
            { href: '/pipeline/new', label: 'Coordinar' },
            { href: '/appraisal/new', label: 'Nueva Tasación' },
            { href: '/appraisals', label: 'Historial' },
        ]},
        { label: 'Propiedades', items: [
            { href: '/properties', label: 'Listado' },
            { href: '/properties/new', label: 'Nueva' },
            ...(can('properties.review') ? [{ href: '/properties/review', label: 'Revision Legal' }] : []),
        ]},
        { label: 'Contactos', href: '/contacts' },
        ...(can('metrics.view') ? [
            { label: 'Metricas', href: '/metrics' },
            { label: 'Marketing', href: '/marketing' },
        ] : []),
        ...(can('settings.manage') || can('users.manage') ? [{
            label: 'Admin', items: [
                ...(can('settings.manage') ? [{ href: '/settings', label: 'Configuracion' }] : []),
                ...(can('users.manage') ? [{ href: '/users', label: 'Usuarios' }] : []),
            ]
        }] : []),
    ]
```

- [ ] **Step 3: Adaptar CRM por rol: asesor NO ve "Solicitud" stage**

Edit `app/(dashboard)/crm/page.tsx`. Alrededor de línea 293 (donde se renderizan las stages), filtrar:

```tsx
{CRM_STAGES
  .filter(s => {
    if (userInfo?.role === 'asesor' && s.key === 'solicitud') return false
    return true
  })
  .map((s) => { ... })}
```

También filtrar el array de deals renderizados si la etapa es solicitud y el rol es asesor:

```typescript
const roleFilteredDeals = userInfo?.role === 'asesor'
  ? dealsWithCRM.filter(d => d.crmStage !== 'solicitud')
  : dealsWithCRM

// y ajustar filteredDeals y stageCounts para usar roleFilteredDeals
```

Buscar `dealsWithCRM` (línea 197) y reemplazar por `roleFilteredDeals` en los `filteredDeals` y `stageCounts` downstream.

- [ ] **Step 4: Bloquear abogado de `/crm`**

Edit `app/(dashboard)/crm/page.tsx`. Añadir al top del componente, justo después de `userInfo` state, un efecto guard:

```typescript
const router = useRouter()
useEffect(() => {
  if (userInfo && userInfo.role === 'abogado') {
    router.replace('/properties/review')
  }
}, [userInfo, router])
```

- [ ] **Step 5: Probar**

1. Loguearse como asesor. Nav no tiene "Procesos". `/pipeline` redirige a `/crm`. CRM no muestra columna "Solicitud".
2. Loguearse como coordinador. Nav no tiene "Pipeline". CRM muestra todas las columnas.
3. Loguearse como dueno. Nav no tiene "Pipeline". CRM completo.
4. Loguearse como abogado. Nav no tiene "CRM". Si intenta `/crm` → redirige a `/properties/review`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(crm): unify CRM+Procesos, filter stages by role, block abogado from /crm"
```

---

### Task 11.2: Mover features únicas de /pipeline al detalle de CRM

**Files:**
- Verify: `app/(dashboard)/pipeline/[id]/page.tsx` ya es el detail completo — no requiere migración
- Delete: `app/(dashboard)/pipeline/loading.tsx` (opcional, si existía para la lista)

- [ ] **Step 1: Auditar qué features había SOLO en `/pipeline` (lista)**

Read `app/(dashboard)/pipeline/page.tsx` antes del cambio (en git history):

Run: `git log --all -- app/(dashboard)/pipeline/page.tsx | head -20`

Si la lista tenía filtros o búsqueda especiales NO cubiertos por CRM (ej: búsqueda rápida por dirección), agregarlos a CRM.

- [ ] **Step 2: Conservar loading.tsx si existe**

Si `app/(dashboard)/pipeline/loading.tsx` existe, dejarlo — aplica aún a `/pipeline/new` y `/pipeline/[id]`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(pipeline): audit migration of /pipeline features into /crm"
```

---

# FASE 12 — Optimización de Carga

### Task 12.1: Añadir paginación server-side a CRM y listados

**Files:**
- Modify: `lib/supabase/deals.ts:40-62` (getDeals con range + stageCounts)
- Modify: `app/api/deals/route.ts` (aceptar limit/offset)
- Modify: `app/(dashboard)/crm/page.tsx` (fetch paginado + stageCounts del servidor)

**Decisión arquitectónica crítica**: stageCounts debe calcularse en el servidor sobre TODOS los deals filtrados (no solo la página actual), porque los contadores del Kanban CRM necesitan el total por etapa. Si se calculara en cliente sobre data paginada, el badge mostraría 50 cuando realmente hay 120.

- [ ] **Step 1: Actualizar getDeals con paginación + stageCounts agregados**

Edit `lib/supabase/deals.ts` líneas 40-62:

```typescript
export async function getDeals(filters?: {
  stage?: string; origin?: string; assigned_to?: string; from?: string; to?: string;
  limit?: number; offset?: number;
}) {
  const limit = filters?.limit ?? 50
  const offset = filters?.offset ?? 0

  // Query base sin range — se reutiliza para counts y para data paginada
  function applyFilters<T>(q: T): T {
    let query = q as any
    if (filters?.stage) query = query.eq('stage', filters.stage)
    if (filters?.origin) query = query.eq('origin', filters.origin)
    if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
    if (filters?.from) query = query.gte('created_at', filters.from + 'T00:00:00Z')
    if (filters?.to) query = query.lte('created_at', filters.to + 'T23:59:59Z')
    return query as T
  }

  // Data paginada
  const dataQuery = applyFilters(
    getAdmin()
      .from('deals')
      .select(`
        id, stage, property_address, property_type, neighborhood, rooms,
        scheduled_date, scheduled_time,
        origin, assigned_to, appraisal_id, property_id, notes,
        stage_changed_at, created_at,
        contacts:contact_id ( id, full_name, phone, email )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
  )
  const { data, error, count } = await dataQuery.range(offset, offset + limit - 1)
  if (error) throw error

  // stageCounts — agregado sobre el total filtrado (sin paginar)
  // Stage filter se EXCLUYE aquí para poder mostrar counts de todas las stages en el Kanban
  const countFilters = { ...filters, stage: undefined }
  const countQuery = getAdmin().from('deals').select('stage')
  // Re-aplicar filtros manualmente sin stage:
  let cq = countQuery
  if (countFilters.origin) cq = cq.eq('origin', countFilters.origin)
  if (countFilters.assigned_to) cq = cq.eq('assigned_to', countFilters.assigned_to)
  if (countFilters.from) cq = cq.gte('created_at', countFilters.from + 'T00:00:00Z')
  if (countFilters.to) cq = cq.lte('created_at', countFilters.to + 'T23:59:59Z')
  const { data: stageRows, error: stageErr } = await cq
  if (stageErr) throw stageErr

  const stageCounts: Record<string, number> = {}
  for (const row of stageRows || []) {
    stageCounts[row.stage] = (stageCounts[row.stage] || 0) + 1
  }

  return { data: data || [], total: count ?? 0, stageCounts }
}
```

- [ ] **Step 2: Endpoint acepta limit/offset**

Edit `app/api/deals/route.ts` GET handler:

```typescript
const url = new URL(req.url)
const limit = parseInt(url.searchParams.get('limit') || '50', 10)
const offset = parseInt(url.searchParams.get('offset') || '0', 10)
// Pasar a getDeals junto con los demás filtros:
const origin = url.searchParams.get('origin') || undefined
const assigned_to = url.searchParams.get('assigned_to') || undefined
const from = url.searchParams.get('from') || undefined
const to = url.searchParams.get('to') || undefined
const { data, total, stageCounts } = await getDeals({ origin, assigned_to, from, to, limit, offset })
return NextResponse.json({ data, total, stageCounts })
return NextResponse.json({ data, total })
```

- [ ] **Step 3: CRM cargado por páginas + stageCounts del servidor**

En `app/(dashboard)/crm/page.tsx`:

1. Añadir state:
```typescript
const [page, setPage] = useState(0)
const [total, setTotal] = useState(0)
const [serverStageCounts, setServerStageCounts] = useState<Record<string, number>>({})
const PAGE_SIZE = 50
```

2. Cambiar fetchData:
```typescript
const fetchData = useCallback(async (resetPage = true) => {
  setLoading(true)
  const p = resetPage ? 0 : page
  const params = new URLSearchParams()
  if (filterOrigin) params.set('origin', filterOrigin)
  if (dateRange.from) params.set('from', dateRange.from)
  if (dateRange.to) params.set('to', dateRange.to)
  if (userInfo?.role === 'asesor') params.set('assigned_to', userInfo.id)
  else if (filterAdvisor) params.set('assigned_to', filterAdvisor)
  params.set('limit', String(PAGE_SIZE))
  params.set('offset', String(p * PAGE_SIZE))

  const res = await fetch(`/api/deals?${params}`)
  if (res.ok) {
    const { data, total, stageCounts } = await res.json()
    setDeals(resetPage ? (data || []) : [...deals, ...(data || [])])
    setTotal(total || 0)
    setServerStageCounts(stageCounts || {})
    if (resetPage) setPage(0)
  }
  setLoading(false)
}, [filterOrigin, filterAdvisor, dateRange, userInfo, page, deals])
```

3. Cambiar el cálculo de `stageCounts` en línea 202-205 — reemplazar por los del servidor pero mapear internal stage → crmStage:

```typescript
// Derivar counts de CRM desde stages internos del servidor
const crmStageCounts: Record<string, number> = {}
for (const [internalStage, count] of Object.entries(serverStageCounts)) {
  // Crear un deal-like para pasar por deriveCRMStage (solo usa stage + scheduled_date + appraisal_id,
  // pero los counts no distinguen por scheduled_date — para el MVP, mapear stage directo)
  const crmKey = mapStageToCRM(internalStage)
  crmStageCounts[crmKey] = (crmStageCounts[crmKey] || 0) + count
}

function mapStageToCRM(stage: string): string {
  switch (stage) {
    case 'scheduled': return 'coordinada' // nota: también puede ser solicitud si !scheduled_date, pero mapeamos al común
    case 'not_visited': return 'no_realizada'
    case 'visited': return 'visitada' // puede ser tasacion_creada si hay appraisal_id
    case 'appraisal_sent': return 'entregada'
    case 'followup': return 'seguimiento'
    case 'captured': return 'captada'
    case 'lost': return 'descartado'
    default: return 'solicitud'
  }
}
```

**Trade-off aceptado**: los stages `solicitud` vs `coordinada` y `visitada` vs `tasacion_creada` se fusionan en los counts (porque el servidor solo da counts por stage interno, no por scheduled_date o appraisal_id). Si se quiere contar fino, hacer otro RPC que devuelva counts agrupados por las condiciones del derive. Documentar esta decisión como "MVP — counts aproximados en stages derivados".

4. Añadir botón "Cargar más":
```tsx
{deals.length < total && (
  <Button variant="outline" className="w-full" onClick={() => { setPage(p => p + 1); fetchData(false) }}>
    Cargar más ({total - deals.length} restantes)
  </Button>
)}
```

- [ ] **Step 4: Suspense boundary para detail pages**

Cada `loading.tsx` ya existe en `pipeline`, `properties`, `contacts`, `appraisals`. Verificar que estén presentes y que muestren skeleton screens en vez de spinner solo. Si un `loading.tsx` falta, crear uno en pages pesadas.

Ejemplo mejorado `app/(dashboard)/crm/loading.tsx` (crear si no existe):

```tsx
export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="h-9 w-32 bg-muted animate-pulse rounded" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted/50 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted/30 animate-pulse rounded-xl" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Prefetch al hover en links de navegación**

Next/Link prefetchea por defecto. Verificar que se use `<Link>` (no `<a>`) en todas las listas. Grep:

Run: `grep -rn "<a href" app/ components/ --include="*.tsx" | head -20`

Expected: solo URLs externas (blob, http://, mailto, etc.). Cualquier ruta interna debe usar `<Link>`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "perf: paginate CRM + improve loading states with skeletons"
```

---

### Task 12.2: Reducir JS inicial — dynamic imports pesados

**Files:**
- Modify: `app/(dashboard)/appraisal/new/page.tsx` (PDFPreview ya usa dynamic)
- Review: `components/appraisal/PropertyWizard.tsx`
- Review: `components/pipeline/VisitDataForm.tsx`

- [ ] **Step 1: Dynamic imports para modales pesados**

En `app/(dashboard)/pipeline/[id]/page.tsx`, convertir VisitDataForm a lazy:

```typescript
import dynamic from 'next/dynamic'
const VisitDataForm = dynamic(() => import('@/components/pipeline/VisitDataForm').then(m => ({ default: m.VisitDataForm })), {
  ssr: false,
  loading: () => <Loader2 className="h-6 w-6 animate-spin mx-auto" />,
})
```

- [ ] **Step 2: Bundle analyzer (opcional diagnóstico)**

Run: `npm install -D @next/bundle-analyzer` (solo si el usuario lo permite)

Configurar en next.config.ts con `withBundleAnalyzer` y correr `ANALYZE=true npm run build`. Revisar reporte. Identificar chunks > 200KB y aplicar dynamic import.

Esta sub-tarea es exploratoria — documentar hallazgos y aplicar dynamic imports adicionales donde se justifique.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "perf: lazy-load heavy modal components"
```

---

### Task 12.3: Índices DB para queries críticas

**Files:**
- Create: `supabase/migrations/20260418000003_performance_indexes.sql`

- [ ] **Step 1: Crear índices**

Write:

```sql
-- supabase/migrations/20260418000003_performance_indexes.sql
-- Indexes para queries frecuentes de CRM, tasks y properties.

-- CRM: filtra por assigned_to + order by created_at
CREATE INDEX IF NOT EXISTS idx_deals_assigned_created ON deals(assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_stage_created ON deals(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_origin_created ON deals(origin, created_at DESC);

-- Tasks: filtra por assigned_to + status
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status, created_at DESC);

-- Properties: filtros por status + assigned_to
CREATE INDEX IF NOT EXISTS idx_properties_status_created ON properties(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_assigned ON properties(assigned_to, created_at DESC);
```

- [ ] **Step 2: Usuario aplica en Supabase dashboard**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "perf(db): add performance indexes for CRM, tasks, properties queries"
```

---

# FASE 13 — Rediseño Visual con frontend-design

### Task 13.1: Invocar skill frontend-design para auditoría visual

**Files:** (varios — skill decide)

- [ ] **Step 1: Iniciar skill**

En la sesión de ejecución, invocar:

```
Skill(frontend-design:frontend-design, args: "Rediseñar CRM de Diego Ferreyra Inmobiliaria — aplicar estilo profesional, cálido pero ejecutivo, para una inmobiliaria de lujo. Mejorar: tasks/page.tsx (Pendientes), crm/page.tsx (stage cards + list view), pipeline/[id]/page.tsx (detail view), properties/[id]/page.tsx (checklist + history), appraisal/new/page.tsx (wizard). Prioridad: legibilidad, densidad de información apropiada, affordances claras para acciones críticas (coordinar, visitar, aprobar, rechazar, descartar). Paleta: tonos neutros slate + acentos (azul profundo para acciones primarias, verde para éxito, rojo para descartar, ámbar para alertas). Respetar shadcn/ui primitives ya usados. No romper funcionalidad existente.")
```

- [ ] **Step 2: Aplicar cambios recomendados por el skill en cada página principal**

Iterativo: el skill sugerirá cambios específicos. Aplicar por archivo con commits separados:

```bash
git commit -m "design: rediseño Pendientes — jerarquía visual + animación sutil"
git commit -m "design: rediseño CRM cards + list density"
git commit -m "design: rediseño detalle de proceso — timeline de acciones"
git commit -m "design: rediseño propiedad — checklist + historial visual"
git commit -m "design: rediseño wizard tasación — steps + confirmación"
```

- [ ] **Step 3: Pasar review visual en dev**

Run: `npm run dev` y probar cada página loguéandose como cada rol. Documentar cualquier regresión.

- [ ] **Step 4: Commit final de la fase**

```bash
git add -A
git commit -m "design: fase visual completa — todas las vistas rediseñadas"
```

---

# FASE 14 — Self-Review del Plan + /review Implementación

### Task 14.1: Self-review del plan

- [ ] **Step 1: Verificar que cada requisito del usuario está cubierto**

Mapear requisito → task. Checklist:

1. Asesores pueden coordinar tasaciones → Fase 3 (Tasks 3.1, 3.2)
2. Campos obligatorios (tipo, barrio, ambientes, m² opcional) → Fase 4 (Task 4.1)
3. Nomenclatura "coordinar" → Fase 2 (Tasks 2.1, 2.2)
4. Landing a Pendientes → Fase 5 (Task 5.1)
5. Highlight asesor con tasaciones → Fase 5 (Task 5.2)
6. Modal Visita Realizada con auto-save (venta + compra) → Fase 6 (Tasks 6.1–6.4)
7. "Marcar Perdido" → "Descartado" → Fase 2 (Task 2.1)
8. Prellenado tasación con visit data → Fase 7 (Task 7.1)
9. Documentos legales estructurados (obligatorios/temporales/opcionales) → Fase 8 (Tasks 8.1–8.3)
10. Vista abogado sin precio/comisión/fotos + review por ítem + dirección/barrio visible → Fase 9 (Tasks 9.1, 9.2)
11. Track record histórico → Fase 10 (Task 10.1)
12. Unificar CRM/Procesos + adaptación por rol → Fase 11 (Tasks 11.1, 11.2)
13. Optimización de carga → Fase 12 (Tasks 12.1–12.3)
14. Rediseño visual → Fase 13 (Task 13.1)

- [ ] **Step 2: Correr /review sobre este documento**

Ejecutar el slash command `/review` sobre el path `docs/superpowers/plans/2026-04-18-ajustes-crm-integral.md`. Esperar feedback sobre:
- Coherencia
- Placeholders
- Spec coverage
- Type consistency

Resolver feedback inline. Commit del resultado:

```bash
git commit -m "docs(plan): apply /review feedback — clarify types and coverage"
```

---

### Task 14.2: /review al final de la implementación

- [ ] **Step 1: Ejecutar /review al completar todas las fases**

Después de mergear o dejar la rama lista, ejecutar `/review` sobre los cambios (diff contra main). Dejar que identifique:
- Bugs
- Type errors
- Race conditions (auto-save)
- Permisos mal aplicados
- Inconsistencias visuales

- [ ] **Step 2: Aplicar fixes y commit**

```bash
git commit -m "fix: apply /review feedback from final review"
```

- [ ] **Step 3: Build + tests + deploy check**

```bash
npx tsc --noEmit
npm run build
```

Expected: 0 errors.

Push a la rama y verificar que Netlify construye sin errores antes de merge a main.

---

## Notas finales

### Assumptions made (confirmar con el usuario si hay dudas)
1. Las dos imágenes mencionadas ("una para venta y otra para compra") no fueron incluidas en el prompt. Se asumió el contenido basado en el texto descriptivo — si el usuario provee screenshots, ajustar el VisitDataForm para coincidir exactamente.
2. Se asume que la estructura de `properties.documents` existente puede **coexistir** con el nuevo `legal_docs`. Se mantiene por compatibilidad mientras se migra. Una migración opcional futura puede drop `documents` cuando todos los tenants usen solo `legal_docs`.
3. "Cloud Design" en el prompt original se interpretó como el skill `frontend-design:frontend-design` (plugin oficial). Si el usuario se refería a otra herramienta específica, ajustar Fase 13.
4. Las alertas temporales para documentos (reglamento, plano, poderes) se documentan en tipos pero el mecanismo de notificación automática (email/push) se deja fuera de este plan — puede añadirse después como Fase 15.
5. Las queries con RLS dependen de que las políticas actuales permitan a cualquier usuario autenticado leer/escribir. Si en el futuro se endurece RLS, revisar todos los endpoints.

### Dependencias externas / tareas del usuario
- Ejecutar las 4 migraciones SQL en Supabase dashboard (tasks 1.1, 1.2, 1.3, 12.3).
- Commit con autor Sujupar/redstyle50@gmail.com (según memory — obligatorio para Netlify).
- Push a main cuando esté listo (auto-deploy en Netlify).

### Risk flags
- **Race conditions en auto-save**: se resuelve con función Postgres `merge_deal_visit_data` atómica (JSONB `||`). Multi-dispositivo simultáneo sigue siendo last-write-wins pero ya no hay read-modify-write en aplicación.
- **Legal_status overlap**: el campo `legal_status` existente en properties vs el checklist per-item. Se resuelve con `checkGlobalApproval` pero hay que testear edge cases (rechazo de 1 ítem después de aprobar todos). Nota semántica: documentos `temporal` que apliquen y estén `missing` bloquean la aprobación global — confirmar con el usuario si esta es la semántica deseada o si `temporal missing` debería permitir aprobación parcial con warning.
- **Migración de deals ya agendados sin property_type**: NULL en columnas nuevas. Los deals previos no tendrán datos. El formulario que los muestra debe manejar null correctamente (ya contemplado con los `&&` guards).
- **PropertyWizard field mapping (Fase 7)**: Antes de ejecutar Task 7.1, leer `components/appraisal/PropertyWizard.tsx` completo y crear una tabla de equivalencias explícita entre `SaleVisitData` y los nombres de campo del wizard. El `'apt'` en el mapping sugiere que el wizard usa códigos cortos — verificar y ajustar.
- **Tenant isolation abogado**: El endpoint review por ítem solo verifica `properties.review` permission — cualquier abogado autenticado puede en teoría aprobar documentos de cualquier propiedad. Para MVP con una sola inmobiliaria esto es aceptable. Documentar como decisión consciente.
- **stageCounts en stages derivados**: los counts del Kanban CRM fusionan `solicitud+coordinada` y `visitada+tasacion_creada` (ver Task 12.1 Step 3). Si el usuario requiere counts exactos por stage derivado, crear un RPC Postgres adicional. Para MVP, aceptable.
- **Rediseño visual al final**: Trade-off aceptado — la app estará funcional-pero-no-pulida durante fases 1-12. Los componentes nuevos usan shadcn/ui primitives (no estilos ad-hoc), lo que minimiza rework en fase 13.
- **Falta de tests automatizados**: el plan no incluye unit/integration tests. Recomendación: tras completar fase 14, añadir smoke tests manuales documentados (happy path por rol) o crear una Fase 15 opcional con tests para `checkGlobalApproval`, `getApplicableDocs`, `saveVisitData`.
- **Alertas temporales de documentos**: los campos `alertDaysRemaining` en el catálogo (Fase 8) están declarados pero no hay mecanismo de notificación implementado. Opción A: mostrar badge visual local ("⚠️ Temporal — subir en X días") cuando aplique. Opción B: posponer totalmente a Fase 15. El plan actualmente los declara en tipo — elegir antes de ejecutar Fase 8.
