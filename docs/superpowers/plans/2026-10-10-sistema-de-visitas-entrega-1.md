# Sistema de visitas — Entrega 1 (agendar y gestionar) — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development
> (elegido por el dueño: "agentes de auditoría que auditan lo que hacen los otros"). Los pasos
> usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que cada visita a una propiedad captada se agende desde un botón global "＋ Nuevo" o
desde la ficha, con origen, persona real (registro de comprador), día/hora en horario argentino y
asesor; y que cada cambio de etapa quede con fecha, autor y motivo.

**Arquitectura:** reglas de negocio en módulos puros `lib/visitas/*.ts` (testeados con vitest en
entorno node); acceso a datos con service role en `lib/visitas/datos.ts` (fino, sin lógica); rutas
`app/api/**` finas (sesión → permisos → Zod → módulo puro → datos); historial de etapas con
triggers en Postgres (BEFORE toca solo NEW, AFTER escribe el evento). UI cliente en
`components/visitas/**` con el diseño A — Claridad.

**Stack:** Next.js 16.0.10, React 19.2, TypeScript estricto, Supabase (Postgres + RLS), zod 4,
shadcn/ui (`radix-ui`), sonner, lucide-react, vitest 4 (+ happy-dom para componentes).

**Spec:** `docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md` (aprobado el
2026-10-10). Diseño visual: lienzo <https://claude.ai/artifact/4rfWaJomtQgBCDadkLUAUe>, pantallas
`Main` y `A-Agendar`. Leer ambos antes de empezar.

**Fuera de esta entrega:** rediseño de `/visits` con estadísticas y pestaña Visitas de la ficha
(Entrega 2), recordatorio "¿se realizó?" (Entrega 2), encuesta y WhatsApp (Entrega 3). No tocar
`visit_questionnaires`, `/questionnaire`, `send-questionnaire` ni el cron de recordatorios.

## Global Constraints

- Todo el texto que ve una persona, en castellano rioplatense, sin jerga.
- Nombres de funciones, variables y tests en castellano; columnas de la base respetan la
  convención inglesa de `property_visits`.
- Zona horaria única: `America/Argentina/Buenos_Aires`, desfase fijo `-03:00` (Argentina no tiene
  horario de verano). Nunca `toLocaleString` sin `timeZone`.
- Orígenes válidos, EXACTOS: `portal`, `publicidad_meta`, `publicidad_paga`, `cartel`, `otro`.
- Estados de visita, EXACTOS y sin cambios: `pending_confirmation`, `scheduled`, `completed`,
  `no_show`, `cancelled`.
- Motivos de no realizada/cancelada, EXACTOS: `no_vino`, `cancelo_persona`,
  `cancelo_propietario`, `cancelamos_nosotros`, `no_disponible`, `otro`.
- Interés del asesor, EXACTO: `alto`, `medio`, `bajo`.
- Teléfonos: nunca igualdad exacta; siempre `ultimos10Digitos` / columna `phone_norm`.
- Toda escritura que cambie `status`, `scheduled_at` o `advisor_id` de `property_visits` manda
  `changed_by` explícito (el id del usuario, o `null` si la hace el agente/cliente/sistema).
- Sin dependencias nuevas en `package.json`.
- zod 4: los UUID de los tests tienen que ser válidos RFC (ej.
  `11111111-1111-4111-8111-111111111111`); `'abc'` o `'prop-1'` fallan `z.string().uuid()`.
- Commits: autor `Sujupar <redstyle50@gmail.com>`, mensaje en castellano, trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. En este worktree el
  guardián rechaza comandos compuestos: `git add <archivos>` y `git commit` en llamadas separadas;
  el mensaje va con `git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -F - <<'EOF' … EOF`.
- Pruebas: `npx vitest run --config vitest.visitas.config.ts` (acotada; la raíz tarda minutos por
  iCloud). Tipos: `npx tsc --noEmit -p tsconfig.visitas.json`. Lint: `npx eslint <archivos>`.
- Nada de `any`, ni `as` para callar errores, ni `!` sin comentario del porqué.

## Review Focus

1. **El mismo teléfono escrito distinto** (`+54 9 11 5823-4521`, `1158234521`, `011 15 5823-4521`)
   es UNA persona: no se crea un segundo registro de comprador ni se duplica en la lista de
   interesados. → tests en Tarea 6 (`interesados`) y Tarea 7 (`decidirComprador`).
2. **Doble toque en "Agendar"** no crea dos visitas: el botón se deshabilita mientras envía y el
   servidor responde 409 `VISITA_DUPLICADA` si esa persona ya tiene una visita activa en esa
   propiedad. → test en Tarea 8.
3. **Una visita a las 23:30** queda en el día correcto de Argentina (en UTC es el día siguiente):
   formato, avisos de choque y día del selector. → tests en Tareas 3 y 6.
4. **Dos personas actúan sobre la misma visita a la vez** (una cancela mientras la otra marca
   "Se realizó"): la segunda recibe 409 "La visita cambió mientras la editabas" y no pisa a la
   primera. → test en Tarea 10.
5. **Texto con tildes descompuestas (macOS, NFD) o sin tildes** en el buscador de personas
   ("Lopez" encuentra "López"). → test en Tarea 6 (`filtrarInteresados`).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261010000001_visitas_origen_e_historial.sql` | Columnas nuevas, `phone_norm`, historial, triggers, RLS. |
| `scripts/apply-visitas-origen-pg.ts` | Aplica y VERIFICA la migración (aborta si algo no cuadra). |
| `lib/visitas/origen.ts` (+test) | Catálogo de orígenes, derivación desde el registro del comprador. |
| `lib/visitas/horario.ts` (+test) | Construir/validar/mostrar fechas en horario argentino. Seguro para el navegador. |
| `lib/visitas/transiciones.ts` (+test) | Estados, motivos, acciones permitidas y su efecto (patch). |
| `lib/visitas/persona.ts` (+test) | Validación de una persona cargada a mano. |
| `lib/visitas/acceso.ts` (+test) | Quién gestiona, quién ve todo, qué asesor queda. |
| `lib/visitas/interesados.ts` (+test) | Lista de personas para el paso 3 y su filtro de texto. |
| `lib/visitas/choques.ts` (+test) | Avisos de choque de horario. |
| `lib/visitas/comprador.ts` (+test) | Decisión pura: reusar o crear el registro de comprador. |
| `lib/visitas/tipos.ts` | Tipos compartidos de filas (los generados de la base están viejos). |
| `lib/visitas/datos.ts` | Lecturas/escrituras con service role. Sin lógica. |
| `lib/visitas/agendar-estado.ts` (+test) | Estado de la ventana "Agendar visita" (reductor puro). |
| `app/api/visits/route.ts` (+test) | POST alta nueva; GET con alcance por rol. |
| `app/api/visits/propiedades/route.ts` | Buscador de propiedades para el paso 1. |
| `app/api/properties/[id]/interesados/route.ts` (+test) | Personas para el paso 3. |
| `app/api/visits/agenda-del-asesor/route.ts` | Visitas del día para avisos de choque. |
| `app/api/visits/[id]/route.ts` | GET ficha + historial (se borra el PUT). |
| `app/api/visits/[id]/estado/route.ts` (+test) | Acciones: confirmar, reprogramar, cancelar, resultado, asesor, reabrir. |
| `components/visitas/SelectorDiaHora.tsx` | Días y horarios en botones (paso 4 y reprogramar). |
| `components/visitas/agendar/*.tsx` (+test) | La ventana paso a paso. |
| `components/visitas/BotonNuevo.tsx` | "＋ Nuevo" de la barra superior. |
| `components/visitas/BotonAgendarVisita.tsx` | Botón de la ficha de propiedad. |
| `components/visitas/ficha/*.tsx` | Acciones y línea de tiempo de la ficha de visita. |
| `app/(dashboard)/visits/[id]/page.tsx` (+tests) | Ficha de la visita (se reescribe). |

Se borran: `app/(dashboard)/properties/_components/ScheduleVisitDialog.tsx`,
`app/(dashboard)/visits/_components/CompleteVisitDialog.tsx` (+ su `.movil.test.tsx`),
`app/api/visits/[id]/complete/route.ts`, el `PUT` de `app/api/visits/[id]/route.ts`.

---

### Tarea 0: Configuración acotada de pruebas y tipos

**Files:**
- Modify: `vitest.visitas.config.ts`
- Create: `tsconfig.visitas.json`

- [ ] **Paso 1: Ampliar la config de vitest** (ya existe con 2 globs). Reemplazar el archivo por:

```ts
// Config ACOTADA: la raíz rastrea el proyecto entero en iCloud y tarda minutos
// (ver CLAUDE.md § "Correr las pruebas en esta Mac"). Solo lo que toca el
// sistema de visitas (spec docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md).
// Los globs evitan `[id]` y `(dashboard)`: picomatch los lee como clase de
// caracteres y grupo, y el archivo nunca matchea.
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: [
      'lib/visitas/**/*.test.ts',
      'lib/portals/fichas-fusionadas.test.ts',
      'lib/leads/visit-scheduling.test.ts',
      'lib/leads/responder-consulta.test.ts',
      'app/api/visits/**/*.test.ts',
      'app/api/properties/*/interesados/*.test.ts',
      'components/visitas/**/*.test.tsx',
      'app/*/visits/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', '.next', '.netlify'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
})
```

- [ ] **Paso 2: Crear `tsconfig.visitas.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": true, "incremental": false },
  "include": [
    "next-env.d.ts",
    "types/**/*.ts",
    "lib/visitas/**/*.ts",
    "lib/portals/fichas-fusionadas.ts",
    "lib/leads/visit-scheduling.ts",
    "lib/leads/responder-consulta.ts",
    "lib/ai/reset-prueba.ts",
    "lib/ai/scheduling-agent.ts",
    "lib/email/notifications/visit-scheduled-client.ts",
    "app/api/visits/**/*.ts",
    "app/api/properties/[id]/interesados/route.ts",
    "app/api/v/[token]/schedule/route.ts",
    "components/visitas/**/*.tsx",
    "components/dashboard/Topbar.tsx",
    "app/(dashboard)/layout.tsx",
    "app/(dashboard)/visits/[id]/page.tsx",
    "app/(dashboard)/properties/[id]/page.tsx",
    "app/(dashboard)/properties/page.tsx",
    "app/(dashboard)/properties/_components/PropertyDetailModal.tsx",
    "scripts/apply-visitas-origen-pg.ts",
    "scripts/reparar-consultas-fichas-fusionadas.ts"
  ],
  "exclude": ["node_modules", "**/*.test.ts", "**/*.test.tsx"]
}
```

- [ ] **Paso 3: Correr las pruebas existentes** — `npx vitest run --config vitest.visitas.config.ts`.
  Esperado: PASS de `fichas-fusionadas` (10), `visit-scheduling` y `responder-consulta` tal como
  están hoy. Si algún test existente falla ANTES de tocar código, anotarlo y avisar (no es nuestro).

- [ ] **Paso 4: Commit** — `git add vitest.visitas.config.ts tsconfig.visitas.json` y commit
  `chore(visitas): config acotada de pruebas y tipos`.

---

### Tarea 1: Migración de la base (origen, persona, historial, RLS)

**Files:**
- Create: `supabase/migrations/20261010000001_visitas_origen_e_historial.sql`
- Create: `scripts/apply-visitas-origen-pg.ts`

**Interfaces:**
- Produces: columnas `property_visits.{origin, origin_detail, lead_id, portal_inquiry_id,
  confirmed_at, outcome_at, outcome_reason, advisor_interest, reschedule_count, changed_by}`;
  `property_leads.phone_norm`; `portal_inquiries.phone_norm`; tabla `property_visit_events`
  `(id, visit_id, kind, from_status, to_status, from_scheduled_at, to_scheduled_at,
  from_advisor_id, to_advisor_id, reason, note, actor_id, created_at)` con `kind` ∈
  `creada, confirmada, reprogramada, realizada, no_realizada, cancelada, asesor_cambiado,
  reabierta, estado_cambiado`.

- [ ] **Paso 1: Escribir la migración**

```sql
-- Sistema de visitas — Entrega 1. Spec: docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md §4.1
-- ADITIVA. Se aplica con scripts/apply-visitas-origen-pg.ts ANTES del deploy del código que la usa
-- (el alta nueva escribe origin/lead_id: sin estas columnas, agendar falla en producción).

-- ───────────────────────────────────────────────────────────────────────────
-- 1) Teléfono normalizado: últimos 10 dígitos. MISMA expresión que
--    contacts.phone_norm (20260816000001) y lib/phone/ultimos-digitos.ts.
--    Si se cambia una, se cambian las tres.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.property_leads
  ADD COLUMN IF NOT EXISTS phone_norm TEXT GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 10
      THEN right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10)
      ELSE NULL
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_property_leads_property_phone_norm
  ON public.property_leads (property_id, phone_norm) WHERE phone_norm IS NOT NULL;

ALTER TABLE public.portal_inquiries
  ADD COLUMN IF NOT EXISTS phone_norm TEXT GENERATED ALWAYS AS (
    CASE
      WHEN length(regexp_replace(coalesce(lead_phone, ''), '\D', '', 'g')) >= 10
      THEN right(regexp_replace(coalesce(lead_phone, ''), '\D', '', 'g'), 10)
      ELSE NULL
    END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_property_phone_norm
  ON public.portal_inquiries (property_id, phone_norm) WHERE phone_norm IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2) property_visits: de dónde vino, quién es, tiempos y motivo.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.property_visits
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS origin_detail TEXT,
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.property_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS portal_inquiry_id UUID REFERENCES public.portal_inquiries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_reason TEXT,
  ADD COLUMN IF NOT EXISTS advisor_interest TEXT,
  ADD COLUMN IF NOT EXISTS reschedule_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- El catálogo vive TAMBIÉN en lib/visitas/origen.ts (ORIGENES_VISITA); origen.test.ts
-- lee este archivo y falla si difieren. Se tocan juntos.
ALTER TABLE public.property_visits DROP CONSTRAINT IF EXISTS property_visits_origin_check;
ALTER TABLE public.property_visits ADD CONSTRAINT property_visits_origin_check
  CHECK (origin IS NULL OR origin IN ('portal', 'publicidad_meta', 'publicidad_paga', 'cartel', 'otro'));

ALTER TABLE public.property_visits DROP CONSTRAINT IF EXISTS property_visits_outcome_reason_check;
ALTER TABLE public.property_visits ADD CONSTRAINT property_visits_outcome_reason_check
  CHECK (outcome_reason IS NULL OR outcome_reason IN
    ('no_vino', 'cancelo_persona', 'cancelo_propietario', 'cancelamos_nosotros', 'no_disponible', 'otro'));

ALTER TABLE public.property_visits DROP CONSTRAINT IF EXISTS property_visits_advisor_interest_check;
ALTER TABLE public.property_visits ADD CONSTRAINT property_visits_advisor_interest_check
  CHECK (advisor_interest IS NULL OR advisor_interest IN ('alto', 'medio', 'bajo'));

COMMENT ON COLUMN public.property_visits.origin IS
  'De dónde vino la visita. NULL solo en filas anteriores al 2026-10-10. Catálogo: lib/visitas/origen.ts.';
COMMENT ON COLUMN public.property_visits.changed_by IS
  'Quién hizo el ÚLTIMO cambio. Toda escritura que cambie status/scheduled_at/advisor_id lo manda explícito (NULL = agente, cliente o sistema). El trigger lo copia al historial.';

CREATE INDEX IF NOT EXISTS idx_property_visits_lead ON public.property_visits (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_visits_portal_inquiry ON public.property_visits (portal_inquiry_id) WHERE portal_inquiry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_property_visits_advisor_when ON public.property_visits (advisor_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_property_visits_property_when ON public.property_visits (property_id, scheduled_at);

-- ───────────────────────────────────────────────────────────────────────────
-- 3) Historial de la visita. Solo crece. Lo escribe ÚNICAMENTE el trigger AFTER.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.property_visit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES public.property_visits(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('creada', 'confirmada', 'reprogramada', 'realizada',
    'no_realizada', 'cancelada', 'asesor_cambiado', 'reabierta', 'estado_cambiado')),
  from_status TEXT,
  to_status TEXT,
  from_scheduled_at TIMESTAMPTZ,
  to_scheduled_at TIMESTAMPTZ,
  from_advisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_advisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  note TEXT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_property_visit_events_visit ON public.property_visit_events (visit_id, created_at);

ALTER TABLE public.property_visit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS property_visit_events_select ON public.property_visit_events;
CREATE POLICY property_visit_events_select ON public.property_visit_events
  FOR SELECT TO authenticated
  USING (
    public.is_operations_user()
    OR EXISTS (
      SELECT 1 FROM public.property_visits v
      WHERE v.id = visit_id AND (v.advisor_id = auth.uid() OR v.created_by = auth.uid())
    )
  );
-- Sin políticas de INSERT/UPDATE/DELETE: solo el trigger (SECURITY DEFINER) y el service role.

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Triggers. Regla de CLAUDE.md: el BEFORE solo toca NEW; lo que escribe en
--    OTRA tabla va en un AFTER (en BEFORE INSERT la fila todavía no existe y el
--    FK del historial fallaría).
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.property_visits_before_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'scheduled' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    IF NEW.status IN ('completed', 'no_show', 'cancelled') AND NEW.outcome_at IS NULL THEN NEW.outcome_at := now(); END IF;
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN NEW.completed_at := now(); END IF;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'scheduled' AND NEW.confirmed_at IS NULL THEN NEW.confirmed_at := now(); END IF;
    IF NEW.status IN ('completed', 'no_show', 'cancelled') THEN NEW.outcome_at := now(); END IF;
    IF NEW.status = 'completed' THEN NEW.completed_at := now(); END IF;
    -- Reabierta: vuelve a estar viva, sin resultado.
    IF NEW.status IN ('pending_confirmation', 'scheduled') AND OLD.status IN ('completed', 'no_show', 'cancelled') THEN
      NEW.outcome_at := NULL;
      NEW.completed_at := NULL;
    END IF;
  END IF;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    NEW.reschedule_count := OLD.reschedule_count + 1;
    -- El aviso "¿se realizó?" vuelve a aplicar a la fecha nueva.
    NEW.reminder_sent_at := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_property_visits_before_write ON public.property_visits;
CREATE TRIGGER trg_property_visits_before_write
  BEFORE INSERT OR UPDATE ON public.property_visits
  FOR EACH ROW EXECUTE FUNCTION public.property_visits_before_write();

CREATE OR REPLACE FUNCTION public.property_visits_log_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.property_visit_events (visit_id, kind, to_status, to_scheduled_at, to_advisor_id, actor_id)
    VALUES (NEW.id, 'creada', NEW.status, NEW.scheduled_at, NEW.advisor_id, NEW.changed_by);
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    k := CASE
      WHEN NEW.status = 'completed' THEN 'realizada'
      WHEN NEW.status = 'no_show' THEN 'no_realizada'
      WHEN NEW.status = 'cancelled' THEN 'cancelada'
      WHEN OLD.status IN ('completed', 'no_show', 'cancelled') THEN 'reabierta'
      WHEN NEW.status = 'scheduled' AND OLD.status = 'pending_confirmation' THEN 'confirmada'
      ELSE 'estado_cambiado'
    END;
    INSERT INTO public.property_visit_events (visit_id, kind, from_status, to_status, reason, note, actor_id)
    VALUES (
      NEW.id, k, OLD.status, NEW.status,
      CASE WHEN NEW.status IN ('no_show', 'cancelled') THEN NEW.outcome_reason END,
      CASE WHEN k IN ('realizada', 'no_realizada', 'cancelada', 'reabierta') THEN NEW.completion_notes END,
      NEW.changed_by
    );
  END IF;

  IF NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at THEN
    INSERT INTO public.property_visit_events (visit_id, kind, from_scheduled_at, to_scheduled_at, actor_id)
    VALUES (NEW.id, 'reprogramada', OLD.scheduled_at, NEW.scheduled_at, NEW.changed_by);
  END IF;

  IF NEW.advisor_id IS DISTINCT FROM OLD.advisor_id THEN
    INSERT INTO public.property_visit_events (visit_id, kind, from_advisor_id, to_advisor_id, actor_id)
    VALUES (NEW.id, 'asesor_cambiado', OLD.advisor_id, NEW.advisor_id, NEW.changed_by);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_property_visits_log_event ON public.property_visits;
CREATE TRIGGER trg_property_visits_log_event
  AFTER INSERT OR UPDATE OF status, scheduled_at, advisor_id ON public.property_visits
  FOR EACH ROW EXECUTE FUNCTION public.property_visits_log_event();

-- Historial de las filas que ya existían: un 'creada' con su fecha real. Idempotente.
INSERT INTO public.property_visit_events (visit_id, kind, to_status, to_scheduled_at, to_advisor_id, actor_id, created_at)
SELECT v.id, 'creada', v.status, v.scheduled_at, v.advisor_id, v.created_by, v.created_at
FROM public.property_visits v
WHERE NOT EXISTS (SELECT 1 FROM public.property_visit_events e WHERE e.visit_id = v.id AND e.kind = 'creada');

-- ───────────────────────────────────────────────────────────────────────────
-- 5) RLS de lectura de visitas: antes CUALQUIER usuario (abogado incluido).
--    Ahora operaciones, el asesor de la visita o quien la creó. El agente y el
--    link del recorrido usan service role: no les afecta.
-- ───────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS property_visits_select_all ON public.property_visits;
DROP POLICY IF EXISTS property_visits_select_scoped ON public.property_visits;
CREATE POLICY property_visits_select_scoped ON public.property_visits
  FOR SELECT TO authenticated
  USING (public.is_operations_user() OR advisor_id = auth.uid() OR created_by = auth.uid());
```

- [ ] **Paso 2: Escribir el script que aplica y verifica**

```ts
/**
 * Aplica `20261010000001_visitas_origen_e_historial.sql` y VERIFICA lo que importa.
 * Aborta (exit 1) si algo no cuadra. Las pruebas de triggers corren dentro de
 * una transacción que se DESHACE: no deja filas de prueba.
 *
 *   node --env-file=.env.local --import tsx scripts/apply-visitas-origen-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`¡ALERTA! ${msg}`)
  console.log(`✓ ${msg}`)
}

async function main() {
  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(readFileSync('supabase/migrations/20261010000001_visitas_origen_e_historial.sql', 'utf8'))
  console.log('migración aplicada; verificando…')

  const { rows: cols } = await c.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='property_visits'`)
  const nombres = new Set(cols.map(r => r.column_name as string))
  for (const col of ['origin', 'origin_detail', 'lead_id', 'portal_inquiry_id', 'confirmed_at', 'outcome_at',
    'outcome_reason', 'advisor_interest', 'reschedule_count', 'changed_by']) {
    ok(nombres.has(col), `property_visits.${col} existe`)
  }
  const { rows: rls } = await c.query(
    `SELECT relrowsecurity FROM pg_class WHERE relname='property_visit_events' AND relnamespace='public'::regnamespace`)
  ok(rls[0]?.relrowsecurity === true, 'property_visit_events con RLS')
  const { rows: pol } = await c.query(`SELECT policyname FROM pg_policies WHERE tablename='property_visits' AND cmd='SELECT'`)
  ok(pol.length === 1 && pol[0].policyname === 'property_visits_select_scoped', 'una sola política de lectura: property_visits_select_scoped')
  const { rows: norm } = await c.query(`SELECT count(*)::int n FROM portal_inquiries WHERE phone_norm IS NOT NULL`)
  ok(norm[0].n > 400, `portal_inquiries.phone_norm calculado (${norm[0].n} filas)`)

  // Prueba de triggers con una fila de prueba, DESHECHA al final.
  await c.query('BEGIN')
  try {
    const { rows: prop } = await c.query(`SELECT id FROM properties WHERE status='approved' LIMIT 1`)
    const { rows: v } = await c.query(
      `INSERT INTO property_visits (property_id, client_name, client_phone, scheduled_at, status, origin)
       VALUES ($1, '[TEST] trigger', '+5491100000000', now() + interval '1 day', 'pending_confirmation', 'portal')
       RETURNING id`, [prop[0].id])
    const id = v[0].id as string
    const eventos = async () => (await c.query(
      `SELECT kind, reason FROM property_visit_events WHERE visit_id=$1 ORDER BY created_at, kind`, [id])).rows
    ok((await eventos()).some(e => e.kind === 'creada'), 'insertar deja el evento "creada"')

    await c.query(`UPDATE property_visits SET status='scheduled' WHERE id=$1`, [id])
    const conf = (await c.query(`SELECT confirmed_at FROM property_visits WHERE id=$1`, [id])).rows[0]
    ok(conf.confirmed_at !== null, 'confirmar completa confirmed_at')
    ok((await eventos()).some(e => e.kind === 'confirmada'), 'confirmar deja el evento "confirmada"')

    await c.query(`UPDATE property_visits SET scheduled_at = scheduled_at + interval '1 hour' WHERE id=$1`, [id])
    const rep = (await c.query(`SELECT reschedule_count FROM property_visits WHERE id=$1`, [id])).rows[0]
    ok(rep.reschedule_count === 1, 'reprogramar suma reschedule_count')

    await c.query(`UPDATE property_visits SET status='no_show', outcome_reason='no_vino' WHERE id=$1`, [id])
    const fin = (await c.query(`SELECT outcome_at FROM property_visits WHERE id=$1`, [id])).rows[0]
    ok(fin.outcome_at !== null, 'no realizada completa outcome_at')
    ok((await eventos()).some(e => e.kind === 'no_realizada' && e.reason === 'no_vino'), 'evento "no_realizada" con motivo')

    let rechazado = false
    try {
      await c.query('SAVEPOINT s1')
      await c.query(`UPDATE property_visits SET origin='tasacion' WHERE id=$1`, [id])
    } catch { rechazado = true; await c.query('ROLLBACK TO SAVEPOINT s1') }
    ok(rechazado, 'la base rechaza un origen fuera del catálogo')
  } finally {
    await c.query('ROLLBACK')
  }
  const { rows: resto } = await c.query(`SELECT count(*)::int n FROM property_visits WHERE client_name='[TEST] trigger'`)
  ok(resto[0].n === 0, 'la fila de prueba no quedó en la base')
  await c.end()
  console.log('\n✅ aplicada y verificada')
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
```

- [ ] **Paso 3: Auditoría de la migración ANTES de aplicarla.** Despachar un subagente revisor
  (`feature-dev:code-reviewer`) con la skill `supabase:supabase-postgres-best-practices`
  cargada, pidiéndole revisar SOLO este SQL contra: reglas de CLAUDE.md (trigger AFTER para otra
  tabla, FK a profiles con SET NULL, RLS en tabla nueva), bloqueos (`ALTER TABLE` en tablas de
  <1000 filas: aceptable), idempotencia (se puede re-ejecutar), y consumidores de la política de
  lectura. Aplicar los hallazgos verificados.

- [ ] **Paso 4: Aplicar y verificar** —
  `node --env-file=../../../.env.local --import tsx scripts/apply-visitas-origen-pg.ts`.
  Esperado: todas las líneas `✓` y `✅ aplicada y verificada`. Si aparece `¡ALERTA!`, NO seguir.

- [ ] **Paso 5: Revisar los lectores de la política de lectura** — correr
  `grep -rn "from('property_visits')" app lib components --include=*.ts --include=*.tsx`
  y anotar en el reporte de la tarea cuáles usan la sesión del usuario (cliente con cookies):
  esos ahora ven solo lo propio si el usuario es asesor (deseado) y nada si es abogado (deseado).
  Se verifican en el QA (Tarea 19).

- [ ] **Paso 6: Commit** — agregar los dos archivos; mensaje
  `feat(visitas): origen, persona e historial de cada visita en la base`.

---

### Tarea 2: Catálogo de orígenes y derivación desde el registro del comprador

**Files:**
- Create: `lib/visitas/origen.ts`
- Test: `lib/visitas/origen.test.ts`

**Interfaces:**
- Produces: `ORIGENES_VISITA`, `type OrigenVisita`, `ORIGEN_INFO`, `esOrigenVisita(v): v is OrigenVisita`,
  `origenDesdeLead({source, utm}): { origen: OrigenVisita; detalle: string | null }`,
  `fuenteDelComprador(origen, portal?): string`,
  `validarDetalleDeOrigen(origen, texto, portal?): { ok: true; detalle: string | null } | { ok: false; error: string }`,
  `PORTAL_ETIQUETA: Record<string, string>`.

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  ORIGENES_VISITA, ORIGEN_INFO, esOrigenVisita, origenDesdeLead, fuenteDelComprador, validarDetalleDeOrigen,
} from './origen'

describe('catálogo de orígenes', () => {
  it('es EXACTAMENTE el del CHECK de la base (se tocan juntos)', () => {
    const sql = readFileSync('supabase/migrations/20261010000001_visitas_origen_e_historial.sql', 'utf8')
    const m = /property_visits_origin_check\s+CHECK \(origin IS NULL OR origin IN \(([^)]*)\)\)/.exec(sql)
    expect(m).not.toBeNull()
    const enLaBase = (m?.[1] ?? '').split(',').map(s => s.trim().replace(/'/g, ''))
    expect(enLaBase).toEqual([...ORIGENES_VISITA])
  })
  it('cada origen tiene etiqueta y ayuda en castellano', () => {
    for (const o of ORIGENES_VISITA) {
      expect(ORIGEN_INFO[o].etiqueta.length).toBeGreaterThan(2)
      expect(ORIGEN_INFO[o].ayuda.length).toBeGreaterThan(2)
    }
  })
  it('reconoce valores válidos y rechaza el resto', () => {
    expect(esOrigenVisita('cartel')).toBe(true)
    expect(esOrigenVisita('tasacion')).toBe(false)
    expect(esOrigenVisita(null)).toBe(false)
  })
})

describe('origenDesdeLead', () => {
  it('una consulta de portal es portal, con el portal como detalle', () => {
    expect(origenDesdeLead({ source: 'portal:zonaprop', utm: null })).toEqual({ origen: 'portal', detalle: 'zonaprop' })
  })
  it('un registro creado desde la ventana conserva el origen elegido', () => {
    expect(origenDesdeLead({ source: 'visita:cartel', utm: null })).toEqual({ origen: 'cartel', detalle: null })
  })
  it('landing con utm de Meta pago es publicidad de Meta', () => {
    expect(origenDesdeLead({ source: 'landing', utm: { utm_source: 'meta', utm_medium: 'paid_social' } }).origen).toBe('publicidad_meta')
    expect(origenDesdeLead({ source: 'landing', utm: { fbclid: 'abc' } }).origen).toBe('publicidad_meta')
  })
  it('un reel de Instagram NO es publicidad paga', () => {
    expect(origenDesdeLead({ source: 'landing', utm: { utm_source: 'instagram', utm_medium: 'reel' } }))
      .toEqual({ origen: 'otro', detalle: 'Reel de Instagram' })
  })
  it('Google es otra publicidad paga', () => {
    expect(origenDesdeLead({ source: 'landing', utm: { gclid: 'x' } })).toEqual({ origen: 'publicidad_paga', detalle: 'Google' })
    expect(origenDesdeLead({ source: 'landing', utm: { utm_source: 'tiktok', utm_medium: 'cpc' } }))
      .toEqual({ origen: 'publicidad_paga', detalle: 'tiktok' })
  })
  it('landing sin publicidad es "otro · Landing"', () => {
    expect(origenDesdeLead({ source: 'landing', utm: {} })).toEqual({ origen: 'otro', detalle: 'Landing' })
    expect(origenDesdeLead({ source: 'landing', utm: 'basura' })).toEqual({ origen: 'otro', detalle: 'Landing' })
  })
  it('un reinicio de prueba es "otro · Prueba"', () => {
    expect(origenDesdeLead({ source: 'prueba:reinicio', utm: null })).toEqual({ origen: 'otro', detalle: 'Prueba' })
  })
  it('una fuente desconocida cae en "otro" sin inventar detalle', () => {
    expect(origenDesdeLead({ source: 'algo-raro', utm: null })).toEqual({ origen: 'otro', detalle: null })
  })
})

describe('fuenteDelComprador', () => {
  it('portal con portal conocido usa el formato de las consultas', () => {
    expect(fuenteDelComprador('portal', 'argenprop')).toBe('portal:argenprop')
  })
  it('el resto queda marcado como creado desde la visita', () => {
    expect(fuenteDelComprador('cartel')).toBe('visita:cartel')
    expect(fuenteDelComprador('portal')).toBe('visita:portal')
  })
})

describe('validarDetalleDeOrigen', () => {
  it('"otro" exige escribir cuál', () => {
    expect(validarDetalleDeOrigen('otro', '  ')).toEqual({ ok: false, error: 'Escribí de dónde vino la visita' })
    expect(validarDetalleDeOrigen('otro', ' Un vecino ')).toEqual({ ok: true, detalle: 'Un vecino' })
  })
  it('"otra publicidad paga" lo acepta opcional', () => {
    expect(validarDetalleDeOrigen('publicidad_paga', '')).toEqual({ ok: true, detalle: null })
    expect(validarDetalleDeOrigen('publicidad_paga', 'Google')).toEqual({ ok: true, detalle: 'Google' })
  })
  it('portal guarda el portal de la consulta; el resto no guarda detalle', () => {
    expect(validarDetalleDeOrigen('portal', 'lo que sea', 'zonaprop')).toEqual({ ok: true, detalle: 'zonaprop' })
    expect(validarDetalleDeOrigen('cartel', 'ignorado')).toEqual({ ok: true, detalle: null })
  })
  it('recorta un detalle demasiado largo a 120 caracteres', () => {
    const r = validarDetalleDeOrigen('otro', 'x'.repeat(300))
    expect(r.ok && r.detalle?.length).toBe(120)
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/origen.test.ts`.
  Esperado: FAIL (no existe `./origen`).

- [ ] **Paso 3: Implementar**

```ts
/**
 * Catálogo ÚNICO de orígenes de una visita (spec §4.3) y su derivación desde el
 * registro del comprador (`property_leads`).
 *
 * Es el mismo que el CHECK `property_visits_origin_check` (migración
 * 20261010000001): se tocan JUNTOS. `origen.test.ts` lee la migración y falla si
 * difieren — si la app escribe un valor que la base no acepta, Postgres lo
 * rechaza con 23514 y la visita no se agenda.
 *
 * Módulo puro y seguro para el navegador (lo usa la ventana de agendar).
 */
export const ORIGENES_VISITA = ['portal', 'publicidad_meta', 'publicidad_paga', 'cartel', 'otro'] as const
export type OrigenVisita = (typeof ORIGENES_VISITA)[number]

export interface InfoOrigen {
  etiqueta: string
  ayuda: string
  /** Si la ventana pide escribir "cuál". */
  detalle: 'obligatorio' | 'opcional' | 'no'
}

export const ORIGEN_INFO: Record<OrigenVisita, InfoOrigen> = {
  portal: { etiqueta: 'Consulta de portal', ayuda: 'Zonaprop, Argenprop o MercadoLibre', detalle: 'no' },
  publicidad_meta: { etiqueta: 'Publicidad de Meta', ayuda: 'Facebook o Instagram pago', detalle: 'no' },
  publicidad_paga: { etiqueta: 'Otra publicidad paga', ayuda: 'Google u otro anuncio pago', detalle: 'opcional' },
  cartel: { etiqueta: 'Cartel en la propiedad', ayuda: 'Llamó o escribió por el cartel', detalle: 'no' },
  otro: { etiqueta: 'Otro', ayuda: 'Escribís cuál', detalle: 'obligatorio' },
}

export const PORTAL_ETIQUETA: Record<string, string> = {
  zonaprop: 'Zonaprop',
  argenprop: 'Argenprop',
  mercadolibre: 'MercadoLibre',
}

export function esOrigenVisita(v: unknown): v is OrigenVisita {
  return typeof v === 'string' && (ORIGENES_VISITA as readonly string[]).includes(v)
}

export interface LeadParaOrigen {
  source: string | null
  utm: unknown
}

export interface OrigenDerivado {
  origen: OrigenVisita
  detalle: string | null
}

const FUENTES_META = new Set(['meta', 'facebook', 'fb', 'instagram', 'ig'])
const MEDIOS_PAGOS = new Set(['cpc', 'ppc', 'cpm', 'paid', 'paid_social', 'paid_search', 'display'])
const LARGO_MAXIMO_DETALLE = 120

function utmTexto(utm: unknown, clave: string): string | null {
  if (!utm || typeof utm !== 'object') return null
  const v = (utm as Record<string, unknown>)[clave]
  return typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null
}

/**
 * Para las visitas que se crean SOLAS (agente de WhatsApp, link del recorrido):
 * el origen sale de cómo entró la persona. Las reglas de UTM son las de
 * `lib/marketing/meta-campaign-builder.ts` (utm_source=meta, utm_medium=paid_social)
 * y `lib/social/reels/enlace.ts` (utm_medium=reel, que es orgánico).
 */
export function origenDesdeLead(lead: LeadParaOrigen): OrigenDerivado {
  const source = (lead.source ?? '').trim().toLowerCase()
  if (source.startsWith('portal:')) return { origen: 'portal', detalle: source.slice('portal:'.length) || null }
  if (source.startsWith('visita:')) {
    const o = source.slice('visita:'.length)
    if (esOrigenVisita(o)) return { origen: o, detalle: null }
  }
  if (source.startsWith('prueba')) return { origen: 'otro', detalle: 'Prueba' }
  if (source === 'landing' || source === '') {
    const fuente = utmTexto(lead.utm, 'utm_source')
    const medio = utmTexto(lead.utm, 'utm_medium')
    if (medio === 'reel') return { origen: 'otro', detalle: 'Reel de Instagram' }
    if (utmTexto(lead.utm, 'fbclid') || (fuente && FUENTES_META.has(fuente))) return { origen: 'publicidad_meta', detalle: null }
    if (utmTexto(lead.utm, 'gclid') || fuente === 'google') return { origen: 'publicidad_paga', detalle: 'Google' }
    if (medio && MEDIOS_PAGOS.has(medio)) return { origen: 'publicidad_paga', detalle: fuente }
    return { origen: 'otro', detalle: 'Landing' }
  }
  return { origen: 'otro', detalle: null }
}

/** `property_leads.source` de un comprador creado desde la ventana de agendar. */
export function fuenteDelComprador(origen: OrigenVisita, portal?: string | null): string {
  if (origen === 'portal' && portal) return `portal:${portal}`
  return `visita:${origen}`
}

export function validarDetalleDeOrigen(
  origen: OrigenVisita,
  texto: string | null | undefined,
  portal?: string | null,
): { ok: true; detalle: string | null } | { ok: false; error: string } {
  if (origen === 'portal') return { ok: true, detalle: portal ?? null }
  const limpio = (texto ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, LARGO_MAXIMO_DETALLE)
  const regla = ORIGEN_INFO[origen].detalle
  if (regla === 'obligatorio' && limpio.length < 2) return { ok: false, error: 'Escribí de dónde vino la visita' }
  if (regla === 'no') return { ok: true, detalle: null }
  return { ok: true, detalle: limpio || null }
}
```

- [ ] **Paso 4: Correr y ver PASAR** — mismo comando. Esperado: PASS (todos).
- [ ] **Paso 5: Commit** — `feat(visitas): catálogo de orígenes y derivación desde el comprador`.

---

### Tarea 3: Horario argentino (construir, validar, mostrar)

**Files:**
- Create: `lib/visitas/horario.ts`
- Test: `lib/visitas/horario.test.ts`

**Interfaces:**
- Produces: `ZONA_ARGENTINA`, `MAX_DIAS_ATRAS = 60`, `MAX_DIAS_ADELANTE = 180`,
  `fechaEnArgentina(d: Date): string`, `horaEnArgentina(d: Date): string`,
  `construirInstante(fecha: string, hora: string): Date | null`,
  `validarHorarioDeVisita(fecha, hora, ahora?): { ok: true; instante: Date } | { ok: false; error: string }`,
  `formatearFechaHora(v: string | Date): string` ("sáb 10/10 · 10:30"),
  `formatearFechaLarga(v: string | Date): string` ("sábado 10 de octubre, 10:30"),
  `sumarDias(fecha: string, dias: number): string`,
  `diasParaElegir(hoy: string, cantidad?: number): Array<{ fecha: string; etiqueta: string; numero: string }>`,
  `HORARIOS_SUGERIDOS: readonly string[]` ('08:00' … '20:30', cada 30 min).

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import {
  construirInstante, validarHorarioDeVisita, formatearFechaHora, formatearFechaLarga,
  fechaEnArgentina, horaEnArgentina, diasParaElegir, HORARIOS_SUGERIDOS, sumarDias,
} from './horario'

const AHORA = new Date('2026-10-10T15:00:00Z') // sábado 10/10, 12:00 en Argentina

describe('construirInstante', () => {
  it('10:30 en Argentina es 13:30 UTC', () => {
    expect(construirInstante('2026-10-10', '10:30')?.toISOString()).toBe('2026-10-10T13:30:00.000Z')
  })
  it('23:30 en Argentina queda en el día argentino aunque en UTC sea el siguiente', () => {
    const d = construirInstante('2026-10-10', '23:30')
    expect(d?.toISOString()).toBe('2026-10-11T02:30:00.000Z')
    expect(fechaEnArgentina(d as Date)).toBe('2026-10-10')
  })
  it('rechaza fechas que no existen y formatos inválidos', () => {
    expect(construirInstante('2026-02-31', '10:00')).toBeNull()
    expect(construirInstante('2026-10-10', '25:00')).toBeNull()
    expect(construirInstante('2026-10-10', '10:3')).toBeNull()
    expect(construirInstante('10/10/2026', '10:00')).toBeNull()
    expect(construirInstante('', '')).toBeNull()
  })
})

describe('validarHorarioDeVisita', () => {
  it('acepta una visita futura', () => {
    expect(validarHorarioDeVisita('2026-10-12', '11:00', AHORA).ok).toBe(true)
  })
  it('acepta una visita pasada de hasta 60 días (para documentarla)', () => {
    expect(validarHorarioDeVisita('2026-08-15', '11:00', AHORA).ok).toBe(true)
  })
  it('rechaza más de 60 días atrás y más de 6 meses adelante', () => {
    expect(validarHorarioDeVisita('2026-07-01', '11:00', AHORA))
      .toEqual({ ok: false, error: 'Solo se pueden registrar visitas de los últimos 60 días' })
    expect(validarHorarioDeVisita('2027-06-01', '11:00', AHORA))
      .toEqual({ ok: false, error: 'Elegí una fecha dentro de los próximos 6 meses' })
  })
  it('rechaza un día inválido con un mensaje entendible', () => {
    expect(validarHorarioDeVisita('2026-02-31', '10:00', AHORA))
      .toEqual({ ok: false, error: 'Elegí un día y una hora válidos' })
  })
})

describe('mostrar fechas', () => {
  it('formato corto con día de la semana y 24 h', () => {
    expect(formatearFechaHora('2026-10-10T13:30:00Z')).toBe('sáb 10/10 · 10:30')
    expect(formatearFechaHora(new Date('2026-10-11T02:30:00Z'))).toBe('sáb 10/10 · 23:30')
  })
  it('formato largo', () => {
    expect(formatearFechaLarga('2026-10-12T14:00:00Z')).toBe('lunes 12 de octubre, 11:00')
  })
  it('hora en Argentina a medianoche no dice 24:00', () => {
    expect(horaEnArgentina(new Date('2026-10-11T03:00:00Z'))).toBe('00:00')
  })
})

describe('selector de días y horarios', () => {
  it('arranca en Hoy y Mañana, después el día abreviado', () => {
    const dias = diasParaElegir('2026-10-10', 4)
    expect(dias.map(d => d.etiqueta)).toEqual(['Hoy', 'Mañana', 'Lun', 'Mar'])
    expect(dias.map(d => d.numero)).toEqual(['10', '11', '12', '13'])
    expect(dias[2].fecha).toBe('2026-10-12')
  })
  it('suma días cruzando fin de mes', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01')
  })
  it('horarios de 8:00 a 20:30 cada media hora', () => {
    expect(HORARIOS_SUGERIDOS[0]).toBe('08:00')
    expect(HORARIOS_SUGERIDOS[HORARIOS_SUGERIDOS.length - 1]).toBe('20:30')
    expect(HORARIOS_SUGERIDOS).toHaveLength(26)
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar**

```ts
/**
 * Fechas y horas de las visitas, SIEMPRE en horario argentino.
 *
 * Por qué existe: varios emails y pantallas formateaban sin zona horaria y en el
 * servidor (UTC) la hora salía corrida 3 h. Acá hay UNA forma de construir un
 * instante (fecha + hora de Argentina) y UNA de mostrarlo.
 *
 * Argentina no tiene horario de verano: el desfase es fijo -03:00 (mismo criterio
 * que lib/leads/visit-scheduling.ts y lib/filters/rango-fechas.ts).
 * Módulo puro y seguro para el navegador: no importa nada de servidor.
 */
export const ZONA_ARGENTINA = 'America/Argentina/Buenos_Aires'
export const MAX_DIAS_ATRAS = 60
export const MAX_DIAS_ADELANTE = 180

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre']
const FECHA = /^\d{4}-\d{2}-\d{2}$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const MS_DIA = 86_400_000

const formatoFecha = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_ARGENTINA, year: 'numeric', month: '2-digit', day: '2-digit',
})
const formatoHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONA_ARGENTINA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function fechaEnArgentina(d: Date): string {
  return formatoFecha.format(d)
}

export function horaEnArgentina(d: Date): string {
  return formatoHora.format(d)
}

/** Fecha (AAAA-MM-DD) + hora (HH:MM) de Argentina → instante. `null` si no existe. */
export function construirInstante(fecha: string, hora: string): Date | null {
  if (!FECHA.test(fecha) || !HORA.test(hora)) return null
  const d = new Date(`${fecha}T${hora}:00-03:00`)
  if (Number.isNaN(d.getTime())) return null
  // `new Date('2026-02-31…')` no da error: JS lo corre al 3 de marzo. Si el día
  // no sobrevive el ida y vuelta, la fecha no existe.
  if (fechaEnArgentina(d) !== fecha) return null
  return d
}

export function validarHorarioDeVisita(
  fecha: string,
  hora: string,
  ahora: Date = new Date(),
): { ok: true; instante: Date } | { ok: false; error: string } {
  const instante = construirInstante(fecha, hora)
  if (!instante) return { ok: false, error: 'Elegí un día y una hora válidos' }
  const dias = (instante.getTime() - ahora.getTime()) / MS_DIA
  if (dias < -MAX_DIAS_ATRAS) return { ok: false, error: 'Solo se pueden registrar visitas de los últimos 60 días' }
  if (dias > MAX_DIAS_ADELANTE) return { ok: false, error: 'Elegí una fecha dentro de los próximos 6 meses' }
  return { ok: true, instante }
}

function aFecha(v: string | Date): Date {
  return typeof v === 'string' ? new Date(v) : v
}

/** Día de la semana de un AAAA-MM-DD (ancla al mediodía UTC: nunca cruza de día). */
function diaDeSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay()
}

/** "sáb 10/10 · 10:30" */
export function formatearFechaHora(v: string | Date): string {
  const d = aFecha(v)
  const fecha = fechaEnArgentina(d)
  const [, mes, dia] = fecha.split('-')
  return `${DIAS_CORTOS[diaDeSemana(fecha)]} ${dia}/${mes} · ${horaEnArgentina(d)}`
}

/** "sábado 10 de octubre, 10:30" */
export function formatearFechaLarga(v: string | Date): string {
  const d = aFecha(v)
  const fecha = fechaEnArgentina(d)
  const [, mes, dia] = fecha.split('-')
  return `${DIAS_LARGOS[diaDeSemana(fecha)]} ${Number(dia)} de ${MESES[Number(mes) - 1]}, ${horaEnArgentina(d)}`
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasParaElegir(hoy: string, cantidad = 7): Array<{ fecha: string; etiqueta: string; numero: string }> {
  return Array.from({ length: cantidad }, (_, i) => {
    const fecha = sumarDias(hoy, i)
    const corto = DIAS_CORTOS[diaDeSemana(fecha)]
    const etiqueta = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : corto.charAt(0).toUpperCase() + corto.slice(1)
    return { fecha, etiqueta, numero: String(Number(fecha.slice(8, 10))) }
  })
}

export const HORARIOS_SUGERIDOS: readonly string[] = Array.from({ length: 26 }, (_, i) => {
  const minutos = 8 * 60 + i * 30
  return `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`
})
```

- [ ] **Paso 4: Correr y ver PASAR.** Si `horaEnArgentina` medianoche da `24:00` en esta versión
  de Node, el `hourCycle: 'h23'` es el arreglo; no reemplazarlo por `hour12: false`.
- [ ] **Paso 5: Commit** — `feat(visitas): horario argentino único para construir y mostrar`.

---

### Tarea 4: Estados, motivos y acciones de una visita

**Files:**
- Create: `lib/visitas/transiciones.ts`
- Test: `lib/visitas/transiciones.test.ts`

**Interfaces:**
- Consumes: `validarHorarioDeVisita` (Tarea 3).
- Produces: `ESTADOS_VISITA`, `type EstadoVisita`, `ESTADO_ETIQUETA`, `ESTADOS_ACTIVOS`,
  `ESTADOS_FINALES`, `MOTIVOS_NO_REALIZADA`, `type MotivoNoRealizada`, `MOTIVO_ETIQUETA`,
  `INTERESES`, `type Interes`, `INTERES_ETIQUETA`, `type AccionVisita`, `type TipoAccion`,
  `interface VisitaParaAccion { status: EstadoVisita; scheduled_at: string; advisor_id: string | null }`,
  `interface PatchVisita`, `accionesDisponibles(v, ahora): TipoAccion[]`,
  `aplicarAccion(v, accion, ahora): { ok: true; patch: PatchVisita } | { ok: false; error: string }`,
  `pasoSinResultado(v, ahora): boolean`, `esEstadoVisita(v): v is EstadoVisita`.

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { accionesDisponibles, aplicarAccion, pasoSinResultado, type VisitaParaAccion } from './transiciones'

const AHORA = new Date('2026-10-10T15:00:00Z') // 12:00 en Argentina
const futura = (status: VisitaParaAccion['status']): VisitaParaAccion =>
  ({ status, scheduled_at: '2026-10-12T14:00:00Z', advisor_id: '11111111-1111-4111-8111-111111111111' })
const pasada = (status: VisitaParaAccion['status']): VisitaParaAccion =>
  ({ status, scheduled_at: '2026-10-09T20:30:00Z', advisor_id: '11111111-1111-4111-8111-111111111111' })

describe('accionesDisponibles', () => {
  it('a confirmar y futura: confirmar, reprogramar, cancelar, cambiar asesor', () => {
    expect(accionesDisponibles(futura('pending_confirmation'), AHORA))
      .toEqual(['confirmar', 'reprogramar', 'cancelar', 'cambiar_asesor'])
  })
  it('confirmada y futura: no se puede marcar resultado todavía', () => {
    expect(accionesDisponibles(futura('scheduled'), AHORA)).toEqual(['reprogramar', 'cancelar', 'cambiar_asesor'])
  })
  it('confirmada que ya pasó: resultado primero, sin "cancelar"', () => {
    expect(accionesDisponibles(pasada('scheduled'), AHORA))
      .toEqual(['realizada', 'no_realizada', 'reprogramar', 'cambiar_asesor'])
  })
  it('se puede marcar el resultado desde una hora antes (la visita está ocurriendo)', () => {
    const enUnRato = { ...futura('scheduled'), scheduled_at: '2026-10-10T15:45:00Z' }
    expect(accionesDisponibles(enUnRato, AHORA)).toContain('realizada')
  })
  it('una visita cerrada solo se puede reabrir', () => {
    expect(accionesDisponibles(pasada('completed'), AHORA)).toEqual(['reabrir'])
    expect(accionesDisponibles(pasada('cancelled'), AHORA)).toEqual(['reabrir'])
  })
})

describe('aplicarAccion', () => {
  it('confirmar pasa a scheduled', () => {
    expect(aplicarAccion(futura('pending_confirmation'), { tipo: 'confirmar' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'scheduled' } })
  })
  it('no se confirma algo ya confirmado', () => {
    const r = aplicarAccion(futura('scheduled'), { tipo: 'confirmar' }, AHORA)
    expect(r).toEqual({ ok: false, error: 'Esta visita ya no se puede confirmar' })
  })
  it('reprogramar valida el horario y guarda el instante en UTC', () => {
    const r = aplicarAccion(futura('scheduled'), { tipo: 'reprogramar', fecha: '2026-10-13', hora: '17:00' }, AHORA)
    expect(r).toEqual({ ok: true, patch: { scheduled_at: '2026-10-13T20:00:00.000Z' } })
  })
  it('reprogramar al mismo horario o a un horario pasado es un error', () => {
    expect(aplicarAccion(futura('scheduled'), { tipo: 'reprogramar', fecha: '2026-10-12', hora: '11:00' }, AHORA))
      .toEqual({ ok: false, error: 'Es el mismo día y horario' })
    expect(aplicarAccion(futura('scheduled'), { tipo: 'reprogramar', fecha: '2026-10-09', hora: '11:00' }, AHORA))
      .toEqual({ ok: false, error: 'Elegí un horario que todavía no pasó' })
  })
  it('cancelar exige un motivo, y "otro" exige escribirlo', () => {
    expect(aplicarAccion(futura('scheduled'), { tipo: 'cancelar', motivo: 'cancelo_persona' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'cancelled', outcome_reason: 'cancelo_persona', completion_notes: null } })
    expect(aplicarAccion(futura('scheduled'), { tipo: 'cancelar', motivo: 'otro', detalle: ' ' }, AHORA))
      .toEqual({ ok: false, error: 'Contanos el motivo' })
  })
  it('marcar "Se realizó" guarda el interés y las notas', () => {
    expect(aplicarAccion(pasada('scheduled'), { tipo: 'realizada', interes: 'alto', notas: ' Quiere volver ' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'completed', advisor_interest: 'alto', completion_notes: 'Quiere volver', outcome_reason: null } })
  })
  it('no se marca "Se realizó" una visita de pasado mañana', () => {
    expect(aplicarAccion(futura('scheduled'), { tipo: 'realizada' }, AHORA))
      .toEqual({ ok: false, error: 'Todavía no llegó el horario de la visita' })
  })
  it('"No se realizó" exige motivo', () => {
    expect(aplicarAccion(pasada('scheduled'), { tipo: 'no_realizada', motivo: 'no_vino' }, AHORA))
      .toEqual({ ok: true, patch: { status: 'no_show', outcome_reason: 'no_vino', completion_notes: null } })
  })
  it('cambiar asesor exige uno distinto', () => {
    const v = futura('scheduled')
    expect(aplicarAccion(v, { tipo: 'cambiar_asesor', asesorId: v.advisor_id ?? '' }, AHORA))
      .toEqual({ ok: false, error: 'Ese asesor ya tiene la visita' })
    expect(aplicarAccion(v, { tipo: 'cambiar_asesor', asesorId: '22222222-2222-4222-8222-222222222222' }, AHORA))
      .toEqual({ ok: true, patch: { advisor_id: '22222222-2222-4222-8222-222222222222' } })
  })
  it('reabrir exige motivo y limpia el resultado', () => {
    expect(aplicarAccion(pasada('no_show'), { tipo: 'reabrir', motivo: 'x' }, AHORA))
      .toEqual({ ok: false, error: 'Contanos por qué la reabrís' })
    expect(aplicarAccion(pasada('no_show'), { tipo: 'reabrir', motivo: 'Lo marqué por error' }, AHORA)).toEqual({
      ok: true,
      patch: { status: 'scheduled', outcome_reason: null, advisor_interest: null, completion_notes: 'Reabierta: Lo marqué por error' },
    })
  })
})

describe('pasoSinResultado', () => {
  it('una visita viva cuyo horario ya pasó', () => {
    expect(pasoSinResultado(pasada('scheduled'), AHORA)).toBe(true)
    expect(pasoSinResultado(pasada('completed'), AHORA)).toBe(false)
    expect(pasoSinResultado(futura('scheduled'), AHORA)).toBe(false)
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar**

```ts
/**
 * Etapas de una visita y qué se puede hacer en cada una (spec §3.3).
 * Módulo puro: decide el `patch` a escribir; la ruta lo aplica y el trigger de
 * la base deja el historial (confirmed_at, outcome_at, eventos).
 *
 * Los 5 estados son los mismos de siempre (los leen 16 archivos: inicio,
 * pendientes, agente, recordatorio…). No agregar uno sin revisar todos.
 */
import { validarHorarioDeVisita } from './horario'

export const ESTADOS_VISITA = ['pending_confirmation', 'scheduled', 'completed', 'no_show', 'cancelled'] as const
export type EstadoVisita = (typeof ESTADOS_VISITA)[number]

export const ESTADO_ETIQUETA: Record<EstadoVisita, string> = {
  pending_confirmation: 'A confirmar',
  scheduled: 'Confirmada',
  completed: 'Realizada',
  no_show: 'No se realizó',
  cancelled: 'Cancelada',
}

export const ESTADOS_ACTIVOS: readonly EstadoVisita[] = ['pending_confirmation', 'scheduled']
export const ESTADOS_FINALES: readonly EstadoVisita[] = ['completed', 'no_show', 'cancelled']

export function esEstadoVisita(v: unknown): v is EstadoVisita {
  return typeof v === 'string' && (ESTADOS_VISITA as readonly string[]).includes(v)
}

/** Mismo catálogo que el CHECK `property_visits_outcome_reason_check`. */
export const MOTIVOS_NO_REALIZADA = [
  'no_vino', 'cancelo_persona', 'cancelo_propietario', 'cancelamos_nosotros', 'no_disponible', 'otro',
] as const
export type MotivoNoRealizada = (typeof MOTIVOS_NO_REALIZADA)[number]

export const MOTIVO_ETIQUETA: Record<MotivoNoRealizada, string> = {
  no_vino: 'No vino',
  cancelo_persona: 'Canceló la persona',
  cancelo_propietario: 'Canceló el propietario',
  cancelamos_nosotros: 'Cancelamos nosotros',
  no_disponible: 'La propiedad dejó de estar disponible',
  otro: 'Otro',
}

export const INTERESES = ['alto', 'medio', 'bajo'] as const
export type Interes = (typeof INTERESES)[number]
export const INTERES_ETIQUETA: Record<Interes, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }

/** Se puede marcar el resultado desde 1 h antes del horario: la visita está ocurriendo. */
const MARGEN_RESULTADO_MS = 60 * 60 * 1000
const LARGO_NOTAS = 1000
const LARGO_DETALLE = 500

export type AccionVisita =
  | { tipo: 'confirmar' }
  | { tipo: 'reprogramar'; fecha: string; hora: string }
  | { tipo: 'cancelar'; motivo: MotivoNoRealizada; detalle?: string | null }
  | { tipo: 'realizada'; interes?: Interes | null; notas?: string | null }
  | { tipo: 'no_realizada'; motivo: MotivoNoRealizada; detalle?: string | null }
  | { tipo: 'cambiar_asesor'; asesorId: string }
  | { tipo: 'reabrir'; motivo: string }

export type TipoAccion = AccionVisita['tipo']

export interface VisitaParaAccion {
  status: EstadoVisita
  scheduled_at: string
  advisor_id: string | null
}

export interface PatchVisita {
  status?: EstadoVisita
  scheduled_at?: string
  advisor_id?: string
  outcome_reason?: MotivoNoRealizada | null
  advisor_interest?: Interes | null
  completion_notes?: string | null
}

export type ResultadoAccion = { ok: true; patch: PatchVisita } | { ok: false; error: string }

function limpiar(texto: string | null | undefined, largo: number): string {
  return (texto ?? '').normalize('NFC').replace(/[^\S\n]+/g, ' ').trim().slice(0, largo)
}

function yaPuedeTenerResultado(v: VisitaParaAccion, ahora: Date): boolean {
  return new Date(v.scheduled_at).getTime() - MARGEN_RESULTADO_MS <= ahora.getTime()
}

export function pasoSinResultado(v: VisitaParaAccion, ahora: Date): boolean {
  return ESTADOS_ACTIVOS.includes(v.status) && new Date(v.scheduled_at).getTime() < ahora.getTime()
}

export function accionesDisponibles(v: VisitaParaAccion, ahora: Date): TipoAccion[] {
  if (ESTADOS_FINALES.includes(v.status)) return ['reabrir']
  const acciones: TipoAccion[] = []
  if (v.status === 'pending_confirmation') acciones.push('confirmar')
  const conResultado = yaPuedeTenerResultado(v, ahora)
  if (conResultado) acciones.push('realizada', 'no_realizada')
  acciones.push('reprogramar')
  // Después del horario ya no es "cancelar": es "No se realizó" con su motivo.
  if (!conResultado) acciones.push('cancelar')
  acciones.push('cambiar_asesor')
  return acciones
}

function motivoValido(
  motivo: MotivoNoRealizada,
  detalle: string | null | undefined,
): { ok: true; nota: string | null } | { ok: false; error: string } {
  if (!(MOTIVOS_NO_REALIZADA as readonly string[]).includes(motivo)) return { ok: false, error: 'Elegí un motivo' }
  const nota = limpiar(detalle, LARGO_DETALLE)
  if (motivo === 'otro' && nota.length < 3) return { ok: false, error: 'Contanos el motivo' }
  return { ok: true, nota: nota || null }
}

const MENSAJE_NO_DISPONIBLE: Record<TipoAccion, string> = {
  confirmar: 'Esta visita ya no se puede confirmar',
  reprogramar: 'Esta visita ya no se puede reprogramar',
  cancelar: 'Esta visita ya no se puede cancelar',
  realizada: 'Todavía no llegó el horario de la visita',
  no_realizada: 'Todavía no llegó el horario de la visita',
  cambiar_asesor: 'A esta visita ya no se le puede cambiar el asesor',
  reabrir: 'Esta visita todavía está abierta',
}

export function aplicarAccion(v: VisitaParaAccion, accion: AccionVisita, ahora: Date): ResultadoAccion {
  if (!accionesDisponibles(v, ahora).includes(accion.tipo)) {
    // Una visita cerrada "no llegó al horario" no tiene sentido: decir la verdad.
    if ((accion.tipo === 'realizada' || accion.tipo === 'no_realizada') && ESTADOS_FINALES.includes(v.status)) {
      return { ok: false, error: 'Esta visita ya tiene resultado' }
    }
    return { ok: false, error: MENSAJE_NO_DISPONIBLE[accion.tipo] }
  }

  switch (accion.tipo) {
    case 'confirmar':
      return { ok: true, patch: { status: 'scheduled' } }
    case 'reprogramar': {
      const h = validarHorarioDeVisita(accion.fecha, accion.hora, ahora)
      if (!h.ok) return h
      if (h.instante.getTime() === new Date(v.scheduled_at).getTime()) return { ok: false, error: 'Es el mismo día y horario' }
      if (h.instante.getTime() < ahora.getTime()) return { ok: false, error: 'Elegí un horario que todavía no pasó' }
      return { ok: true, patch: { scheduled_at: h.instante.toISOString() } }
    }
    case 'cancelar': {
      const m = motivoValido(accion.motivo, accion.detalle)
      if (!m.ok) return m
      return { ok: true, patch: { status: 'cancelled', outcome_reason: accion.motivo, completion_notes: m.nota } }
    }
    case 'no_realizada': {
      const m = motivoValido(accion.motivo, accion.detalle)
      if (!m.ok) return m
      return { ok: true, patch: { status: 'no_show', outcome_reason: accion.motivo, completion_notes: m.nota } }
    }
    case 'realizada': {
      const interes = accion.interes ?? null
      if (interes !== null && !(INTERESES as readonly string[]).includes(interes)) return { ok: false, error: 'Elegí un nivel de interés' }
      const notas = limpiar(accion.notas, LARGO_NOTAS)
      return { ok: true, patch: { status: 'completed', advisor_interest: interes, completion_notes: notas || null, outcome_reason: null } }
    }
    case 'cambiar_asesor': {
      const id = accion.asesorId.trim()
      if (!id) return { ok: false, error: 'Elegí el asesor' }
      if (id === v.advisor_id) return { ok: false, error: 'Ese asesor ya tiene la visita' }
      return { ok: true, patch: { advisor_id: id } }
    }
    case 'reabrir': {
      const motivo = limpiar(accion.motivo, LARGO_DETALLE)
      if (motivo.length < 3) return { ok: false, error: 'Contanos por qué la reabrís' }
      return {
        ok: true,
        patch: { status: 'scheduled', outcome_reason: null, advisor_interest: null, completion_notes: `Reabierta: ${motivo}` },
      }
    }
  }
}
```

- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `feat(visitas): etapas, motivos y acciones permitidas de una visita`.

---

### Tarea 5: Persona cargada a mano y permisos

**Files:**
- Create: `lib/visitas/persona.ts`, `lib/visitas/acceso.ts`
- Test: `lib/visitas/persona.test.ts`, `lib/visitas/acceso.test.ts`

**Interfaces:**
- Produces: `validarPersonaNueva(input): { ok: true; valor: { nombre: string; telefono: string; email: string | null } } | { ok: false; errores: string[] }`;
  `puedeGestionarVisitas(role): boolean`, `puedeVerTodasLasVisitas(role): boolean`,
  `puedeVerVisita(role, userId, { advisor_id, created_by }): boolean`,
  `asesorParaLaVisita(role, userId, pedido): { ok: true; asesorId: string; esPropio: boolean } | { ok: false; error: string }`.

- [ ] **Paso 1: Tests**

```ts
// lib/visitas/persona.test.ts
import { describe, it, expect } from 'vitest'
import { validarPersonaNueva } from './persona'

describe('validarPersonaNueva', () => {
  it('acepta nombre y teléfono, limpia espacios y deja el email en minúsculas', () => {
    expect(validarPersonaNueva({ nombre: '  Sofía   Benítez ', telefono: '11 5823-4521', email: ' Sofia@Mail.COM ' }))
      .toEqual({ ok: true, valor: { nombre: 'Sofía Benítez', telefono: '11 5823-4521', email: 'sofia@mail.com' } })
  })
  it('el email es opcional', () => {
    const r = validarPersonaNueva({ nombre: 'Ana López', telefono: '+54 9 11 5823 4521', email: '' })
    expect(r.ok && r.valor.email).toBeNull()
  })
  it('junta TODOS los errores', () => {
    expect(validarPersonaNueva({ nombre: '1', telefono: '123', email: 'mal' })).toEqual({
      ok: false,
      errores: [
        'Escribí el nombre de la persona',
        'El teléfono tiene que tener al menos 10 números (con código de área)',
        'El email no es válido',
      ],
    })
  })
  it('un nombre con tildes descompuestas (macOS) queda compuesto', () => {
    const r = validarPersonaNueva({ nombre: 'López', telefono: '1158234521' })
    expect(r.ok && r.valor.nombre).toBe('López')
  })
  it('tolera entradas que no son texto', () => {
    expect(validarPersonaNueva({ nombre: 42, telefono: null }).ok).toBe(false)
  })
})
```

```ts
// lib/visitas/acceso.test.ts
import { describe, it, expect } from 'vitest'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas, puedeVerVisita, asesorParaLaVisita } from './acceso'

const YO = '11111111-1111-4111-8111-111111111111'
const OTRO = '22222222-2222-4222-8222-222222222222'

describe('permisos de visitas', () => {
  it('gestionan admin, dueño, coordinador y asesor; el abogado no', () => {
    expect(['admin', 'dueno', 'coordinador', 'asesor'].every(r => puedeGestionarVisitas(r as never))).toBe(true)
    expect(puedeGestionarVisitas('abogado')).toBe(false)
  })
  it('un rol desconocido cae del lado seguro', () => {
    expect(puedeGestionarVisitas('inventado' as never)).toBe(false)
    expect(puedeVerTodasLasVisitas('inventado' as never)).toBe(false)
  })
  it('el asesor ve solo las suyas (asignadas o creadas por él)', () => {
    expect(puedeVerVisita('asesor', YO, { advisor_id: YO, created_by: OTRO })).toBe(true)
    expect(puedeVerVisita('asesor', YO, { advisor_id: OTRO, created_by: YO })).toBe(true)
    expect(puedeVerVisita('asesor', YO, { advisor_id: OTRO, created_by: OTRO })).toBe(false)
    expect(puedeVerVisita('coordinador', YO, { advisor_id: OTRO, created_by: OTRO })).toBe(true)
    expect(puedeVerVisita('abogado', YO, { advisor_id: YO, created_by: YO })).toBe(false)
  })
})

describe('asesorParaLaVisita', () => {
  it('un asesor queda SIEMPRE a su nombre, pida lo que pida', () => {
    expect(asesorParaLaVisita('asesor', YO, OTRO)).toEqual({ ok: true, asesorId: YO, esPropio: true })
    expect(asesorParaLaVisita('asesor', YO, null)).toEqual({ ok: true, asesorId: YO, esPropio: true })
  })
  it('quien ve todo tiene que elegir el asesor', () => {
    expect(asesorParaLaVisita('coordinador', YO, OTRO)).toEqual({ ok: true, asesorId: OTRO, esPropio: false })
    expect(asesorParaLaVisita('admin', YO, ' ')).toEqual({ ok: false, error: 'Elegí el asesor que va a mostrar la propiedad' })
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar**

```ts
// lib/visitas/persona.ts
/**
 * Persona cargada a mano en la ventana de agendar (cartel, otro, o alguien que
 * no está en la lista). Teléfono obligatorio: sin él no hay encuesta posible
 * (decisión del dueño, 2026-10-10). Email opcional. Módulo puro.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

export interface PersonaNueva {
  nombre: string
  telefono: string
  email: string | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function texto(v: unknown): string {
  return typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() : ''
}

export function validarPersonaNueva(input: { nombre?: unknown; telefono?: unknown; email?: unknown }):
  { ok: true; valor: PersonaNueva } | { ok: false; errores: string[] } {
  const nombre = texto(input.nombre).slice(0, 80)
  const telefono = texto(input.telefono).slice(0, 40)
  const email = texto(input.email).toLowerCase()
  const errores: string[] = []
  if (nombre.length < 2 || !/\p{L}/u.test(nombre)) errores.push('Escribí el nombre de la persona')
  if (!ultimos10Digitos(telefono)) errores.push('El teléfono tiene que tener al menos 10 números (con código de área)')
  if (email && !EMAIL.test(email)) errores.push('El email no es válido')
  if (errores.length > 0) return { ok: false, errores }
  return { ok: true, valor: { nombre, telefono, email: email || null } }
}
```

```ts
// lib/visitas/acceso.ts
/**
 * Quién puede hacer qué con las visitas. Una sola regla para la ruta y la
 * pantalla (el menú NO es la barrera: la barrera es el servidor).
 * Un rol desconocido cae del lado seguro (mismo criterio que lib/auth/scope.ts:
 * `hasPermission` explota con un rol fuera del catálogo).
 */
import { hasPermission, type Permission } from '@/lib/auth/roles'
import type { Role } from '@/types/auth.types'

function permiso(role: Role, p: Permission): boolean {
  try {
    return hasPermission(role, p)
  } catch {
    return false
  }
}

export function puedeGestionarVisitas(role: Role): boolean {
  return permiso(role, 'pipeline.schedule')
}

export function puedeVerTodasLasVisitas(role: Role): boolean {
  return permiso(role, 'pipeline.view_all')
}

export function puedeVerVisita(
  role: Role,
  userId: string,
  visita: { advisor_id: string | null; created_by: string | null },
): boolean {
  if (!puedeGestionarVisitas(role)) return false
  if (puedeVerTodasLasVisitas(role)) return true
  return visita.advisor_id === userId || visita.created_by === userId
}

export function asesorParaLaVisita(
  role: Role,
  userId: string,
  pedido: string | null | undefined,
): { ok: true; asesorId: string; esPropio: boolean } | { ok: false; error: string } {
  if (!puedeVerTodasLasVisitas(role)) return { ok: true, asesorId: userId, esPropio: true }
  const elegido = pedido?.trim()
  if (!elegido) return { ok: false, error: 'Elegí el asesor que va a mostrar la propiedad' }
  return { ok: true, asesorId: elegido, esPropio: elegido === userId }
}
```

  Verificar antes que `Permission` se exporta como tipo desde `lib/auth/roles.ts` (sí: línea 15).
- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `feat(visitas): validación de persona y permisos`.

---

### Tarea 6: Interesados de la propiedad y avisos de choque

**Files:**
- Create: `lib/visitas/interesados.ts`, `lib/visitas/choques.ts`, `lib/visitas/tipos.ts`
- Test: `lib/visitas/interesados.test.ts`, `lib/visitas/choques.test.ts`

**Interfaces:**
- Consumes: `origenDesdeLead`, `ORIGEN_INFO`, `PORTAL_ETIQUETA` (Tarea 2); `ultimos10Digitos`;
  `fechaEnArgentina`, `horaEnArgentina` (Tarea 3).
- Produces (`tipos.ts`): `ConsultaR`, `RegistroR`, `VisitaActivaR`, `VisitaAgendaR` (abajo).
- Produces (`interesados.ts`): `interface Interesado`, `MAX_INTERESADOS = 200`,
  `interesadosParaOrigen(origen, datos): Interesado[]`, `filtrarInteresados(lista, texto): Interesado[]`.
- Produces (`choques.ts`): `avisosDeChoque({ instante, propiedadId, asesorId, visitas, excluirId? }): string[]`.

- [ ] **Paso 1: Crear los tipos compartidos**

```ts
// lib/visitas/tipos.ts
/**
 * Filas tal como las leen las rutas de visitas. Se escriben a mano porque
 * `types/database.types.ts` está desactualizado (no tiene las columnas de
 * 2026-10-10 ni `property_leads.pipeline_state`).
 */
import type { EstadoVisita, MotivoNoRealizada, Interes } from './transiciones'
import type { OrigenVisita } from './origen'

export interface ConsultaR {
  id: string
  lead_name: string | null
  lead_phone: string | null
  lead_email: string | null
  portal: string
  received_at: string | null
  created_at: string
}

export interface RegistroR {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string | null
  utm: unknown
  created_at: string
  suspected_bot: boolean | null
  deleted_at: string | null
}

export interface VisitaActivaR {
  id: string
  lead_id: string | null
  client_phone: string | null
  scheduled_at: string
  status: EstadoVisita
}

export interface VisitaAgendaR {
  id: string
  scheduled_at: string
  property_id: string
  advisor_id: string | null
  address: string | null
}

export interface EventoVisitaR {
  id: string
  kind: string
  from_status: string | null
  to_status: string | null
  from_scheduled_at: string | null
  to_scheduled_at: string | null
  reason: string | null
  note: string | null
  created_at: string
  actor: string | null
  desde_asesor: string | null
  hacia_asesor: string | null
}

export interface VisitaDetalle {
  id: string
  property_id: string
  advisor_id: string | null
  created_by: string | null
  lead_id: string | null
  portal_inquiry_id: string | null
  client_name: string
  client_email: string | null
  client_phone: string | null
  scheduled_at: string
  status: EstadoVisita
  origin: OrigenVisita | null
  origin_detail: string | null
  notes: string | null
  completion_notes: string | null
  outcome_reason: MotivoNoRealizada | null
  advisor_interest: Interes | null
  confirmed_at: string | null
  outcome_at: string | null
  reschedule_count: number
  created_at: string
  created_by_ai: boolean
  propiedad: { id: string; address: string; neighborhood: string | null; foto: string | null } | null
  asesor: { id: string; full_name: string } | null
  comprador: { id: string; name: string; lead_number: number | null } | null
  consulta: { id: string; portal: string; received_at: string | null } | null
}
```

- [ ] **Paso 2: Tests**

```ts
// lib/visitas/interesados.test.ts
import { describe, it, expect } from 'vitest'
import { interesadosParaOrigen, filtrarInteresados, MAX_INTERESADOS } from './interesados'
import type { ConsultaR, RegistroR, VisitaActivaR } from './tipos'

const consulta = (p: Partial<ConsultaR>): ConsultaR => ({
  id: 'c', lead_name: 'Ana', lead_phone: '1158234521', lead_email: null, portal: 'zonaprop',
  received_at: '2026-10-08T12:00:00Z', created_at: '2026-10-08T12:00:00Z', ...p,
})
const registro = (p: Partial<RegistroR>): RegistroR => ({
  id: 'r', name: 'Beto', phone: '1144445555', email: null, source: 'landing', utm: {},
  created_at: '2026-10-08T12:00:00Z', suspected_bot: false, deleted_at: null, ...p,
})
const sinDatos = { consultas: [] as ConsultaR[], registros: [] as RegistroR[], visitasActivas: [] as VisitaActivaR[] }

describe('interesadosParaOrigen — portal', () => {
  it('lista las consultas, la más reciente primero, con el portal legible', () => {
    const r = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
      consulta({ id: 'c1', lead_name: 'Vieja', lead_phone: '1111111111', received_at: '2026-10-01T12:00:00Z' }),
      consulta({ id: 'c2', lead_name: 'Nueva', lead_phone: '2222222222', received_at: '2026-10-09T12:00:00Z', portal: 'argenprop' }),
    ] })
    expect(r.map(i => i.nombre)).toEqual(['Nueva', 'Vieja'])
    expect(r[0]).toMatchObject({ clave: 'consulta:c2', tipo: 'consulta', detalle: 'Argenprop', tieneTelefono: true })
  })
  it('el MISMO teléfono en otro formato es UNA persona (con la cuenta de consultas)', () => {
    const r = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
      consulta({ id: 'c1', lead_phone: '+54 9 11 5823-4521', received_at: '2026-10-09T12:00:00Z' }),
      consulta({ id: 'c2', lead_phone: '011 5823 4521', received_at: '2026-10-01T12:00:00Z' }),
    ] })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ id: 'c1', consultas: 2 })
  })
  it('sin teléfono no se deduplica y queda marcado', () => {
    const r = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
      consulta({ id: 'c1', lead_phone: null, lead_name: null }), consulta({ id: 'c2', lead_phone: null }),
    ] })
    expect(r).toHaveLength(2)
    expect(r.find(i => i.id === 'c1')).toMatchObject({ tieneTelefono: false, nombre: 'Sin nombre' })
  })
  it('marca a quien ya tiene una visita activa (por teléfono)', () => {
    const r = interesadosParaOrigen('portal', {
      ...sinDatos,
      consultas: [consulta({ id: 'c1', lead_phone: '1158234521' })],
      visitasActivas: [{ id: 'v1', lead_id: null, client_phone: '+5491158234521', scheduled_at: '2026-10-12T14:00:00Z', status: 'scheduled' }],
    })
    expect(r[0].visitaActiva).toEqual({ id: 'v1', scheduled_at: '2026-10-12T14:00:00Z' })
  })
})

describe('interesadosParaOrigen — publicidad', () => {
  const registros = [
    registro({ id: 'r1', name: 'De Google', utm: { gclid: 'x' }, created_at: '2026-10-09T12:00:00Z', phone: '1100000001' }),
    registro({ id: 'r2', name: 'De Meta', utm: { utm_source: 'meta' }, created_at: '2026-10-01T12:00:00Z', phone: '1100000002' }),
    registro({ id: 'r3', name: 'Bot', suspected_bot: true, phone: '1100000003' }),
    registro({ id: 'r4', name: 'Borrado', deleted_at: '2026-10-02T00:00:00Z', phone: '1100000004' }),
    registro({ id: 'r5', name: 'Portal', source: 'portal:zonaprop', phone: '1100000005' }),
  ]
  it('con origen Meta, los de Meta primero; sin bots, borrados ni registros de portal', () => {
    const r = interesadosParaOrigen('publicidad_meta', { ...sinDatos, registros })
    expect(r.map(i => i.nombre)).toEqual(['De Meta', 'De Google'])
    expect(r[0]).toMatchObject({ coincideConElOrigen: true, detalle: 'Publicidad de Meta' })
    expect(r[1]).toMatchObject({ coincideConElOrigen: false, detalle: 'Otra publicidad paga · Google' })
  })
  it('con otra publicidad paga, Google primero', () => {
    const r = interesadosParaOrigen('publicidad_paga', { ...sinDatos, registros })
    expect(r[0].nombre).toBe('De Google')
  })
  it('marca visita activa por lead_id', () => {
    const r = interesadosParaOrigen('publicidad_meta', {
      ...sinDatos, registros: [registro({ id: 'r2', utm: { utm_source: 'meta' } })],
      visitasActivas: [{ id: 'v9', lead_id: 'r2', client_phone: null, scheduled_at: '2026-10-12T14:00:00Z', status: 'pending_confirmation' }],
    })
    expect(r[0].visitaActiva?.id).toBe('v9')
  })
})

describe('otros orígenes y límites', () => {
  it('cartel y otro no tienen lista (se carga a mano)', () => {
    expect(interesadosParaOrigen('cartel', { ...sinDatos, consultas: [consulta({})] })).toEqual([])
    expect(interesadosParaOrigen('otro', sinDatos)).toEqual([])
  })
  it('nunca devuelve más de MAX_INTERESADOS', () => {
    const muchas = Array.from({ length: 500 }, (_, i) => consulta({ id: `c${i}`, lead_phone: String(1100000000 + i) }))
    expect(interesadosParaOrigen('portal', { ...sinDatos, consultas: muchas })).toHaveLength(MAX_INTERESADOS)
  })
})

describe('filtrarInteresados', () => {
  const lista = interesadosParaOrigen('portal', { ...sinDatos, consultas: [
    consulta({ id: 'c1', lead_name: 'María López', lead_phone: '1158234521' }),
    consulta({ id: 'c2', lead_name: 'Juan Pérez', lead_phone: '1144445555' }),
  ] })
  it('sin tildes encuentra con tildes, y al revés en NFD', () => {
    expect(filtrarInteresados(lista, 'lopez').map(i => i.id)).toEqual(['c1'])
    expect(filtrarInteresados(lista, 'Pérez').map(i => i.id)).toEqual(['c2'])
  })
  it('busca por teléfono ignorando formato', () => {
    expect(filtrarInteresados(lista, '15 5823-4521').map(i => i.id)).toEqual(['c1'])
  })
  it('texto vacío devuelve la lista entera', () => {
    expect(filtrarInteresados(lista, '  ')).toHaveLength(2)
  })
})
```

```ts
// lib/visitas/choques.test.ts
import { describe, it, expect } from 'vitest'
import { avisosDeChoque } from './choques'

const ASESOR = '11111111-1111-4111-8111-111111111111'
const PROP = '33333333-3333-4333-8333-333333333333'

describe('avisosDeChoque', () => {
  const instante = new Date('2026-10-12T14:00:00Z') // lunes 11:00
  it('avisa si el asesor tiene otra visita dentro de una hora', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, visitas: [
      { id: 'v1', scheduled_at: '2026-10-12T14:30:00Z', property_id: 'otra', advisor_id: ASESOR, address: 'Tarija 4000' },
    ] })).toEqual(['El asesor ya tiene una visita a las 11:30 en Tarija 4000'])
  })
  it('avisa si la propiedad tiene otra visita ese día (día argentino)', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, visitas: [
      { id: 'v2', scheduled_at: '2026-10-12T21:00:00Z', property_id: PROP, advisor_id: 'otro', address: 'Doblas 248' },
    ] })).toEqual(['La propiedad ya tiene otra visita ese día a las 18:00'])
  })
  it('una visita a las 23:30 del día anterior en Argentina NO es "ese día"', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, visitas: [
      { id: 'v3', scheduled_at: '2026-10-12T02:30:00Z', property_id: PROP, advisor_id: 'otro', address: 'Doblas 248' },
    ] })).toEqual([])
  })
  it('ignora la propia visita (al reprogramar) y no repite avisos', () => {
    expect(avisosDeChoque({ instante, propiedadId: PROP, asesorId: ASESOR, excluirId: 'v1', visitas: [
      { id: 'v1', scheduled_at: '2026-10-12T14:00:00Z', property_id: PROP, advisor_id: ASESOR, address: 'Doblas 248' },
    ] })).toEqual([])
  })
})
```

- [ ] **Paso 3: Correr y ver FALLAR.**
- [ ] **Paso 4: Implementar**

```ts
// lib/visitas/interesados.ts
/**
 * Las personas que se ofrecen en el paso "Persona" de la ventana de agendar.
 * Consulta de portal → quienes consultaron por ESA propiedad. Publicidad → los
 * registrados en su landing, con la publicidad que los trajo. Cartel/otro →
 * nadie: se cargan a mano. Módulo puro y seguro para el navegador.
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { ORIGEN_INFO, PORTAL_ETIQUETA, origenDesdeLead, type OrigenVisita } from './origen'
import type { ConsultaR, RegistroR, VisitaActivaR } from './tipos'

export const MAX_INTERESADOS = 200

export interface Interesado {
  clave: string
  tipo: 'consulta' | 'registro'
  id: string
  nombre: string
  telefono: string | null
  email: string | null
  detalle: string
  fecha: string
  tieneTelefono: boolean
  consultas: number
  coincideConElOrigen: boolean
  visitaActiva: { id: string; scheduled_at: string } | null
}

interface Datos {
  consultas: ConsultaR[]
  registros: RegistroR[]
  visitasActivas: VisitaActivaR[]
}

function visitaDe(visitas: VisitaActivaR[], tipo: 'consulta' | 'registro', id: string, telefono: string | null) {
  const norm = ultimos10Digitos(telefono)
  const v = visitas.find(x =>
    (tipo === 'registro' && x.lead_id === id) || (norm !== null && ultimos10Digitos(x.client_phone) === norm))
  return v ? { id: v.id, scheduled_at: v.scheduled_at } : null
}

/** Ordena (ya ordenado de más nuevo a más viejo) y colapsa el mismo teléfono en una persona. */
function sinRepetir(lista: Interesado[]): Interesado[] {
  const vistos = new Map<string, Interesado>()
  const salida: Interesado[] = []
  for (const i of lista) {
    const norm = ultimos10Digitos(i.telefono)
    if (!norm) { salida.push(i); continue }
    const previo = vistos.get(norm)
    if (previo) { previo.consultas += 1; continue }
    vistos.set(norm, i)
    salida.push(i)
  }
  return salida
}

function porFechaDesc(a: { fecha: string }, b: { fecha: string }): number {
  return b.fecha.localeCompare(a.fecha)
}

export function interesadosParaOrigen(origen: OrigenVisita, datos: Datos): Interesado[] {
  if (origen === 'portal') {
    const lista: Interesado[] = datos.consultas
      .map(c => {
        const fecha = c.received_at ?? c.created_at
        return {
          clave: `consulta:${c.id}`, tipo: 'consulta' as const, id: c.id,
          nombre: c.lead_name?.trim() || 'Sin nombre',
          telefono: c.lead_phone, email: c.lead_email,
          detalle: PORTAL_ETIQUETA[c.portal] ?? c.portal,
          fecha, tieneTelefono: ultimos10Digitos(c.lead_phone) !== null, consultas: 1,
          coincideConElOrigen: true,
          visitaActiva: visitaDe(datos.visitasActivas, 'consulta', c.id, c.lead_phone),
        }
      })
      .sort(porFechaDesc)
    return sinRepetir(lista).slice(0, MAX_INTERESADOS)
  }

  if (origen === 'publicidad_meta' || origen === 'publicidad_paga') {
    const lista: Interesado[] = datos.registros
      .filter(r => !r.deleted_at && !r.suspected_bot && (r.source ?? 'landing') === 'landing')
      .map(r => {
        const derivado = origenDesdeLead({ source: r.source, utm: r.utm })
        const base = ORIGEN_INFO[derivado.origen].etiqueta
        return {
          clave: `registro:${r.id}`, tipo: 'registro' as const, id: r.id,
          nombre: r.name?.trim() || 'Sin nombre',
          telefono: r.phone, email: r.email,
          detalle: derivado.detalle && derivado.origen !== 'otro' ? `${base} · ${derivado.detalle}` : (derivado.detalle ?? base),
          fecha: r.created_at, tieneTelefono: ultimos10Digitos(r.phone) !== null, consultas: 1,
          coincideConElOrigen: derivado.origen === origen,
          visitaActiva: visitaDe(datos.visitasActivas, 'registro', r.id, r.phone),
        }
      })
      .sort((a, b) => Number(b.coincideConElOrigen) - Number(a.coincideConElOrigen) || porFechaDesc(a, b))
    return sinRepetir(lista).slice(0, MAX_INTERESADOS)
  }

  return []
}

function plano(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

export function filtrarInteresados(lista: Interesado[], texto: string): Interesado[] {
  const t = plano(texto.trim())
  if (!t) return lista
  const digitos = texto.replace(/\D/g, '')
  return lista.filter(i => {
    if (plano(i.nombre).includes(t)) return true
    if (digitos.length >= 4 && (i.telefono ?? '').replace(/\D/g, '').includes(digitos.slice(-8))) return true
    return false
  })
}
```

  Nota del test "detalle": para Google, `derivado = { origen: 'publicidad_paga', detalle: 'Google' }` →
  `"Otra publicidad paga · Google"`; para Meta `{ origen: 'publicidad_meta', detalle: null }` →
  `"Publicidad de Meta"`; para landing orgánica `{ origen: 'otro', detalle: 'Landing' }` → `"Landing"`.

```ts
// lib/visitas/choques.ts
/**
 * Avisos (NO bloqueos) al elegir día y hora: el asesor ya tiene algo cerca, o la
 * propiedad ya tiene otra visita ese día. El "día" es el de Argentina: una visita
 * a las 23:30 cae en UTC al día siguiente y no tiene que mezclarse.
 */
import { fechaEnArgentina, horaEnArgentina } from './horario'
import type { VisitaAgendaR } from './tipos'

const VENTANA_ASESOR_MS = 60 * 60 * 1000

export function avisosDeChoque(input: {
  instante: Date
  propiedadId: string
  asesorId: string | null
  visitas: VisitaAgendaR[]
  excluirId?: string
}): string[] {
  const avisos = new Set<string>()
  const dia = fechaEnArgentina(input.instante)
  for (const v of input.visitas) {
    if (v.id === input.excluirId) continue
    const cuando = new Date(v.scheduled_at)
    const hora = horaEnArgentina(cuando)
    if (input.asesorId && v.advisor_id === input.asesorId &&
        Math.abs(cuando.getTime() - input.instante.getTime()) < VENTANA_ASESOR_MS) {
      avisos.add(`El asesor ya tiene una visita a las ${hora}${v.address ? ` en ${v.address}` : ''}`)
      continue
    }
    if (v.property_id === input.propiedadId && fechaEnArgentina(cuando) === dia) {
      avisos.add(`La propiedad ya tiene otra visita ese día a las ${hora}`)
    }
  }
  return [...avisos]
}
```

- [ ] **Paso 5: Correr y ver PASAR.**
- [ ] **Paso 6: Commit** — `feat(visitas): lista de interesados por propiedad y avisos de choque`.

---

### Tarea 7: Registro de comprador (decisión pura) y capa de datos

**Files:**
- Create: `lib/visitas/comprador.ts`, `lib/visitas/datos.ts`, `scripts/visitas-datos.probe.ts`
- Test: `lib/visitas/comprador.test.ts`

**Interfaces:**
- Produces (`comprador.ts`): `decidirComprador(existentes, entrada): { accion: 'reusar'; leadId: string; completar: { phone?: string; email?: string } } | { accion: 'crear' }`.
- Produces (`datos.ts`, todas `async`, service role, lanzan `Error` ante fallo de la base):
  - `leerPropiedadParaVisita(id): Promise<PropiedadParaVisita | null>` con
    `PropiedadParaVisita = { id; address; neighborhood: string | null; status: string | null; commercial_status: string | null; assigned_to: string | null; foto: string | null; asking_price: number | null; currency: string | null }`
  - `buscarPropiedadesParaVisita({ q?: string; id?: string; asesorId?: string }): Promise<PropiedadParaVisita[]>` (máx. 20)
  - `leerConsulta(id): Promise<(ConsultaR & { property_id: string | null; lead_message: string | null }) | null>`
  - `leerRegistro(id): Promise<(RegistroR & { property_id: string }) | null>`
  - `listarConsultasDeLaPropiedad(propertyId): Promise<ConsultaR[]>` (máx. 300)
  - `listarRegistrosDeLaPropiedad(propertyId): Promise<RegistroR[]>` (máx. 300)
  - `visitasActivasDeLaPropiedad(propertyId): Promise<VisitaActivaR[]>`
  - `asegurarComprador(entrada: EntradaComprador): Promise<string>` (devuelve el `leadId`)
  - `completarTelefonoDelRegistro(leadId, telefono): Promise<void>`
  - `insertarVisita(fila: FilaVisitaNueva): Promise<string>` (devuelve el id)
  - `leerVisita(id): Promise<VisitaDetalle | null>`
  - `eventosDeLaVisita(id): Promise<EventoVisitaR[]>`
  - `actualizarVisita(id, estadoPrevio, patch, actorId): Promise<{ ok: true } | { ok: false; motivo: 'cambio_concurrente' }>`
  - `visitasDelDia({ fecha, asesorId, propiedadId }): Promise<VisitaAgendaR[]>`
  - `origenDeLead(leadId): Promise<OrigenDerivado | null>`
  - `asesorAsignable(id): Promise<boolean>`

- [ ] **Paso 1: Test de la decisión pura**

```ts
// lib/visitas/comprador.test.ts
import { describe, it, expect } from 'vitest'
import { decidirComprador } from './comprador'

const existente = (p: Partial<{ id: string; phone: string | null; email: string | null; created_at: string }>) =>
  ({ id: 'l1', phone: '+5491158234521', email: null, created_at: '2026-10-01T00:00:00Z', ...p })

describe('decidirComprador', () => {
  it('reusa por teléfono aunque esté escrito distinto', () => {
    expect(decidirComprador([existente({})], { telefono: '11 5823-4521', email: null }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: {} })
  })
  it('completa SOLO los huecos (nunca pisa)', () => {
    expect(decidirComprador([existente({ email: null })], { telefono: '1158234521', email: 'ana@mail.com' }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: { email: 'ana@mail.com' } })
    expect(decidirComprador([existente({ email: 'vieja@mail.com' })], { telefono: '1158234521', email: 'nueva@mail.com' }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: {} })
  })
  it('sin teléfono coincidente busca por email (sin importar mayúsculas)', () => {
    expect(decidirComprador([existente({ phone: null, email: 'Ana@Mail.com' })], { telefono: '1199999999', email: 'ana@mail.com' }))
      .toEqual({ accion: 'reusar', leadId: 'l1', completar: { phone: '1199999999' } })
  })
  it('con dos coincidencias se queda con la más nueva', () => {
    const r = decidirComprador([
      existente({ id: 'viejo', created_at: '2026-01-01T00:00:00Z' }),
      existente({ id: 'nuevo', created_at: '2026-09-01T00:00:00Z' }),
    ], { telefono: '1158234521', email: null })
    expect(r).toMatchObject({ accion: 'reusar', leadId: 'nuevo' })
  })
  it('si no hay nadie, crea', () => {
    expect(decidirComprador([], { telefono: '1158234521', email: null })).toEqual({ accion: 'crear' })
    expect(decidirComprador([existente({ phone: '1100000000' })], { telefono: '1158234521', email: null })).toEqual({ accion: 'crear' })
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar `comprador.ts`**

```ts
/**
 * ¿Esta persona ya es un comprador registrado de ESTA propiedad?
 * Por teléfono (últimos 10 dígitos, nunca igualdad exacta — CLAUDE.md §Teléfonos)
 * y, si no, por email. Nunca pisa un dato que ya existe: solo completa huecos
 * (un teléfono mal tipeado no puede cambiarle los datos a otra persona).
 */
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

export interface CompradorExistente {
  id: string
  phone: string | null
  email: string | null
  created_at: string
}

export type DecisionComprador =
  | { accion: 'reusar'; leadId: string; completar: { phone?: string; email?: string } }
  | { accion: 'crear' }

export function decidirComprador(
  existentes: CompradorExistente[],
  entrada: { telefono: string | null; email: string | null },
): DecisionComprador {
  const norm = ultimos10Digitos(entrada.telefono)
  const email = entrada.email?.trim().toLowerCase() || null
  const masNuevosPrimero = [...existentes].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const encontrado =
    (norm && masNuevosPrimero.find(e => ultimos10Digitos(e.phone) === norm)) ||
    (email && masNuevosPrimero.find(e => e.email?.trim().toLowerCase() === email)) ||
    null
  if (!encontrado) return { accion: 'crear' }
  const completar: { phone?: string; email?: string } = {}
  if (!encontrado.phone && entrada.telefono) completar.phone = entrada.telefono
  if (!encontrado.email && email) completar.email = email
  return { accion: 'reusar', leadId: encontrado.id, completar }
}
```

- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Implementar `datos.ts`** (sin test unitario: es I/O fino; lo cubren el probe del
  paso 6, los tests de rutas con mock y el QA).

```ts
import 'server-only'
/**
 * Lecturas y escrituras de visitas con SERVICE ROLE. Sin lógica de negocio: las
 * decisiones están en los módulos puros de lib/visitas y los permisos en las
 * rutas (que los chequean ANTES de llamar acá).
 *
 * Cliente sin tipar a propósito: types/database.types.ts no tiene las columnas
 * del 2026-10-10. Los tipos de salida son los de ./tipos.ts.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import { clausulasBusqueda } from '@/lib/filters/busqueda-texto'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import { esAsesorAsignable } from '@/lib/deals/asesor-asignable'
import { decidirComprador, type CompradorExistente } from './comprador'
import { origenDesdeLead, type OrigenDerivado, type OrigenVisita } from './origen'
import { ESTADOS_ACTIVOS, type EstadoVisita, type PatchVisita } from './transiciones'
import type { ConsultaR, RegistroR, VisitaActivaR, VisitaAgendaR, VisitaDetalle, EventoVisitaR } from './tipos'

function sb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan las credenciales de Supabase en el servidor')
  return createClient(url, key)
}

function fallo(contexto: string, error: { message: string } | null): never {
  throw new Error(`${contexto}: ${error?.message ?? 'error desconocido'}`)
}

function primeraFotoUsable(photos: unknown): string | null {
  if (!Array.isArray(photos)) return null
  const f = photos.find(p => typeof p === 'string' && !p.startsWith('data:'))
  return typeof f === 'string' ? f : null
}

export interface PropiedadParaVisita {
  id: string
  address: string
  neighborhood: string | null
  status: string | null
  commercial_status: string | null
  assigned_to: string | null
  foto: string | null
  asking_price: number | null
  currency: string | null
}

const COLUMNAS_PROPIEDAD = 'id, address, neighborhood, status, commercial_status, assigned_to, photos, asking_price, currency'

function aPropiedad(r: Record<string, unknown>): PropiedadParaVisita {
  return {
    id: String(r.id), address: String(r.address ?? ''),
    neighborhood: (r.neighborhood as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    commercial_status: (r.commercial_status as string | null) ?? null,
    assigned_to: (r.assigned_to as string | null) ?? null,
    foto: primeraFotoUsable(r.photos),
    asking_price: r.asking_price === null || r.asking_price === undefined ? null : Number(r.asking_price),
    currency: (r.currency as string | null) ?? null,
  }
}

export async function leerPropiedadParaVisita(id: string): Promise<PropiedadParaVisita | null> {
  const { data, error } = await sb().from('properties').select(COLUMNAS_PROPIEDAD).eq('id', id).maybeSingle()
  if (error) fallo('leer propiedad', error)
  return data ? aPropiedad(data as Record<string, unknown>) : null
}

/** Captadas y disponibles/reservadas. `asesorId` acota (rol asesor). */
export async function buscarPropiedadesParaVisita(f: { q?: string; id?: string; asesorId?: string }): Promise<PropiedadParaVisita[]> {
  let q = sb().from('properties').select(COLUMNAS_PROPIEDAD)
    .eq('status', 'approved').in('commercial_status', ['disponible', 'reservada'])
    .order('address').limit(20)
  if (f.id) q = q.eq('id', f.id)
  if (f.asesorId) q = q.eq('assigned_to', f.asesorId)
  for (const clausula of clausulasBusqueda(['address', 'neighborhood'], f.q ?? '')) q = q.or(clausula)
  const { data, error } = await q
  if (error) fallo('buscar propiedades', error)
  return ((data ?? []) as Record<string, unknown>[]).map(aPropiedad)
}

const COLUMNAS_CONSULTA = 'id, lead_name, lead_phone, lead_email, portal, received_at, created_at'

export async function leerConsulta(id: string): Promise<(ConsultaR & { property_id: string | null; lead_message: string | null }) | null> {
  const { data, error } = await sb().from('portal_inquiries')
    .select(`${COLUMNAS_CONSULTA}, property_id, lead_message`).eq('id', id).maybeSingle()
  if (error) fallo('leer consulta', error)
  return (data as (ConsultaR & { property_id: string | null; lead_message: string | null }) | null) ?? null
}

export async function listarConsultasDeLaPropiedad(propertyId: string): Promise<ConsultaR[]> {
  const { data, error } = await sb().from('portal_inquiries').select(COLUMNAS_CONSULTA)
    .eq('property_id', propertyId)
    .order('received_at', { ascending: false, nullsFirst: false })
    .limit(300)
  if (error) fallo('listar consultas', error)
  return (data ?? []) as ConsultaR[]
}

const COLUMNAS_REGISTRO = 'id, name, phone, email, source, utm, created_at, suspected_bot, deleted_at'

export async function leerRegistro(id: string): Promise<(RegistroR & { property_id: string }) | null> {
  const { data, error } = await sb().from('property_leads').select(`${COLUMNAS_REGISTRO}, property_id`).eq('id', id).maybeSingle()
  if (error) fallo('leer registro', error)
  return (data as (RegistroR & { property_id: string }) | null) ?? null
}

export async function listarRegistrosDeLaPropiedad(propertyId: string): Promise<RegistroR[]> {
  const { data, error } = await sb().from('property_leads').select(COLUMNAS_REGISTRO)
    .eq('property_id', propertyId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(300)
  if (error) fallo('listar registros', error)
  return (data ?? []) as RegistroR[]
}

export async function visitasActivasDeLaPropiedad(propertyId: string): Promise<VisitaActivaR[]> {
  const { data, error } = await sb().from('property_visits')
    .select('id, lead_id, client_phone, scheduled_at, status')
    .eq('property_id', propertyId).in('status', [...ESTADOS_ACTIVOS])
  if (error) fallo('visitas activas', error)
  return (data ?? []) as VisitaActivaR[]
}

export interface EntradaComprador {
  propertyId: string
  nombre: string
  telefono: string | null
  email: string | null
  mensaje: string | null
  source: string
  asignadoA: string | null
}

export async function asegurarComprador(e: EntradaComprador): Promise<string> {
  const db = sb()
  const norm = ultimos10Digitos(e.telefono)
  const candidatos: CompradorExistente[] = []
  if (norm) {
    const { data, error } = await db.from('property_leads').select('id, phone, email, created_at')
      .eq('property_id', e.propertyId).eq('phone_norm', norm).is('deleted_at', null)
    if (error) fallo('buscar comprador por teléfono', error)
    candidatos.push(...((data ?? []) as CompradorExistente[]))
  }
  if (e.email) {
    const { data, error } = await db.from('property_leads').select('id, phone, email, created_at')
      .eq('property_id', e.propertyId).ilike('email', e.email.replace(/[%_\\]/g, '\\$&')).is('deleted_at', null)
    if (error) fallo('buscar comprador por email', error)
    candidatos.push(...((data ?? []) as CompradorExistente[]))
  }
  const decision = decidirComprador(candidatos, { telefono: e.telefono, email: e.email })
  if (decision.accion === 'reusar') {
    if (Object.keys(decision.completar).length > 0) {
      const { error } = await db.from('property_leads').update(decision.completar).eq('id', decision.leadId)
      if (error) fallo('completar comprador', error)
    }
    return decision.leadId
  }
  const { data, error } = await db.from('property_leads').insert({
    property_id: e.propertyId, name: e.nombre, phone: e.telefono, email: e.email,
    message: e.mensaje, source: e.source, assigned_to: e.asignadoA,
  }).select('id').single()
  if (error || !data) fallo('crear comprador', error)
  return String((data as { id: string }).id)
}

export async function completarTelefonoDelRegistro(leadId: string, telefono: string): Promise<void> {
  const { error } = await sb().from('property_leads').update({ phone: telefono }).eq('id', leadId).is('phone', null)
  if (error) fallo('completar teléfono', error)
}

export interface FilaVisitaNueva {
  property_id: string
  advisor_id: string
  client_name: string
  client_email: string | null
  client_phone: string
  scheduled_at: string
  status: Extract<EstadoVisita, 'pending_confirmation' | 'scheduled'>
  notes: string | null
  origin: OrigenVisita
  origin_detail: string | null
  lead_id: string
  portal_inquiry_id: string | null
  created_by: string
  changed_by: string
}

export async function insertarVisita(fila: FilaVisitaNueva): Promise<string> {
  const { data, error } = await sb().from('property_visits').insert(fila).select('id').single()
  if (error || !data) fallo('crear visita', error)
  return String((data as { id: string }).id)
}

const SELECT_VISITA = `
  id, property_id, advisor_id, created_by, lead_id, portal_inquiry_id, client_name, client_email,
  client_phone, scheduled_at, status, origin, origin_detail, notes, completion_notes, outcome_reason,
  advisor_interest, confirmed_at, outcome_at, reschedule_count, created_at, created_by_ai,
  property:properties(id, address, neighborhood, photos),
  advisor:profiles!property_visits_advisor_id_fkey(id, full_name),
  lead:property_leads(id, name, lead_number),
  consulta:portal_inquiries(id, portal, received_at)`

function uno<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

export async function leerVisita(id: string): Promise<VisitaDetalle | null> {
  const { data, error } = await sb().from('property_visits').select(SELECT_VISITA).eq('id', id).maybeSingle()
  if (error) fallo('leer visita', error)
  if (!data) return null
  const r = data as Record<string, unknown>
  const p = uno(r.property as Record<string, unknown> | null)
  return {
    ...(r as unknown as VisitaDetalle),
    propiedad: p ? { id: String(p.id), address: String(p.address ?? ''), neighborhood: (p.neighborhood as string | null) ?? null, foto: primeraFotoUsable(p.photos) } : null,
    asesor: uno(r.advisor as VisitaDetalle['asesor']),
    comprador: uno(r.lead as VisitaDetalle['comprador']),
    consulta: uno(r.consulta as VisitaDetalle['consulta']),
  }
}

export async function eventosDeLaVisita(id: string): Promise<EventoVisitaR[]> {
  const { data, error } = await sb().from('property_visit_events')
    .select(`id, kind, from_status, to_status, from_scheduled_at, to_scheduled_at, reason, note, created_at,
      actor:profiles!property_visit_events_actor_id_fkey(full_name),
      desde:profiles!property_visit_events_from_advisor_id_fkey(full_name),
      hacia:profiles!property_visit_events_to_advisor_id_fkey(full_name)`)
    .eq('visit_id', id).order('created_at', { ascending: true })
  if (error) fallo('leer historial', error)
  return ((data ?? []) as Record<string, unknown>[]).map(e => ({
    id: String(e.id), kind: String(e.kind),
    from_status: (e.from_status as string | null) ?? null, to_status: (e.to_status as string | null) ?? null,
    from_scheduled_at: (e.from_scheduled_at as string | null) ?? null, to_scheduled_at: (e.to_scheduled_at as string | null) ?? null,
    reason: (e.reason as string | null) ?? null, note: (e.note as string | null) ?? null,
    created_at: String(e.created_at),
    actor: uno(e.actor as { full_name: string } | null)?.full_name ?? null,
    desde_asesor: uno(e.desde as { full_name: string } | null)?.full_name ?? null,
    hacia_asesor: uno(e.hacia as { full_name: string } | null)?.full_name ?? null,
  }))
}

/**
 * Concurrencia optimista: la fila se actualiza SOLO si sigue en el estado que se
 * leyó. Si otra persona la cambió en el medio, no se pisa nada.
 */
export async function actualizarVisita(
  id: string, estadoPrevio: EstadoVisita, patch: PatchVisita, actorId: string,
): Promise<{ ok: true } | { ok: false; motivo: 'cambio_concurrente' }> {
  const { data, error } = await sb().from('property_visits')
    .update({ ...patch, changed_by: actorId })
    .eq('id', id).eq('status', estadoPrevio)
    .select('id').maybeSingle()
  if (error) fallo('actualizar visita', error)
  return data ? { ok: true } : { ok: false, motivo: 'cambio_concurrente' }
}

export async function visitasDelDia(f: { fecha: string; asesorId: string | null; propiedadId: string }): Promise<VisitaAgendaR[]> {
  const desde = inicioDelDiaArgentina(f.fecha)
  const hasta = finDelDiaArgentina(f.fecha)
  const filtroDuenio = f.asesorId ? `advisor_id.eq.${f.asesorId},property_id.eq.${f.propiedadId}` : `property_id.eq.${f.propiedadId}`
  const { data, error } = await sb().from('property_visits')
    .select('id, scheduled_at, property_id, advisor_id, property:properties(address)')
    .in('status', [...ESTADOS_ACTIVOS]).gte('scheduled_at', desde).lte('scheduled_at', hasta)
    .or(filtroDuenio)
  if (error) fallo('visitas del día', error)
  return ((data ?? []) as Record<string, unknown>[]).map(v => ({
    id: String(v.id), scheduled_at: String(v.scheduled_at), property_id: String(v.property_id),
    advisor_id: (v.advisor_id as string | null) ?? null,
    address: uno(v.property as { address: string } | null)?.address ?? null,
  }))
}

export async function origenDeLead(leadId: string): Promise<OrigenDerivado | null> {
  const { data, error } = await sb().from('property_leads').select('source, utm').eq('id', leadId).maybeSingle()
  if (error || !data) return null
  return origenDesdeLead(data as { source: string | null; utm: unknown })
}

export async function asesorAsignable(id: string): Promise<boolean> {
  return esAsesorAsignable(sb(), id)
}
```

  OJO con `visitasDelDia`: los ids van dentro de un filtro `or()` de PostgREST; son UUID que la
  ruta ya validó con zod (`z.string().uuid()`), así que no pueden traer comas ni paréntesis.

- [ ] **Paso 6: Probe contra la base real** (sin commitear datos: crea una visita `[TEST]` y la borra).

```ts
// scripts/visitas-datos.probe.ts
/**
 *   node --env-file=.env.local --import tsx scripts/visitas-datos.probe.ts
 * Ejercita lib/visitas/datos.ts contra la base REAL con una visita `[TEST]` que
 * borra al final. Necesita la migración 20261010000001 aplicada.
 */
import { Client } from 'pg'
import * as datos from '@/lib/visitas/datos'

async function main() {
  const props = await datos.buscarPropiedadesParaVisita({ q: 'doblas' })
  console.log('buscar "doblas":', props.map(p => p.address))
  if (props.length === 0) throw new Error('no encontró Doblas 248')
  const prop = props[0]
  const consultas = await datos.listarConsultasDeLaPropiedad(prop.id)
  console.log(`consultas de ${prop.address}: ${consultas.length}`)
  const asesor = prop.assigned_to
  if (!asesor) throw new Error('la propiedad no tiene asesor')

  const leadId = await datos.asegurarComprador({
    propertyId: prop.id, nombre: '[TEST] Probe visitas', telefono: '+54 9 11 0000-0001', email: null,
    mensaje: null, source: 'visita:otro', asignadoA: asesor,
  })
  const otraVez = await datos.asegurarComprador({
    propertyId: prop.id, nombre: '[TEST] Probe visitas', telefono: '1100000001', email: null,
    mensaje: null, source: 'visita:otro', asignadoA: asesor,
  })
  console.log(`mismo teléfono en otro formato → mismo comprador: ${leadId === otraVez ? 'sí ✓' : 'NO ✗'}`)

  const visitaId = await datos.insertarVisita({
    property_id: prop.id, advisor_id: asesor, client_name: '[TEST] Probe visitas', client_email: null,
    client_phone: '+5491100000001', scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'pending_confirmation', notes: null, origin: 'otro', origin_detail: 'probe', lead_id: leadId,
    portal_inquiry_id: null, created_by: asesor, changed_by: asesor,
  })
  const r1 = await datos.actualizarVisita(visitaId, 'pending_confirmation', { status: 'scheduled' }, asesor)
  const r2 = await datos.actualizarVisita(visitaId, 'pending_confirmation', { status: 'cancelled' }, asesor)
  console.log(`confirmar: ${r1.ok ? 'ok ✓' : 'falló ✗'} · segunda escritura con estado viejo: ${r2.ok ? 'PISÓ ✗' : 'rechazada ✓'}`)
  const v = await datos.leerVisita(visitaId)
  const ev = await datos.eventosDeLaVisita(visitaId)
  console.log(`visita leída: ${v?.status} · origen ${v?.origin} · eventos: ${ev.map(e => e.kind).join(', ')}`)

  const c = new Client({ host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(`DELETE FROM property_visits WHERE id=$1`, [visitaId])
  await c.query(`DELETE FROM property_leads WHERE id=$1 AND name LIKE '[TEST]%'`, [leadId])
  await c.end()
  console.log('limpieza: visita y comprador [TEST] borrados')
}
main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
```

  Correr con `node --env-file=../../../.env.local --import tsx scripts/visitas-datos.probe.ts`.
  `datos.ts` importa `server-only`: para correrlo con tsx, precargar el stub
  (`--import ./test/stubs/server-only-register.ts` si existe; si no, crear
  `scripts/_qa-server-only.mjs` que registre un módulo vacío — mismo truco documentado en CLAUDE.md
  § "La palabra reiniciar"). Esperado: `sí ✓`, `ok ✓`, `rechazada ✓`, eventos
  `creada, confirmada`, limpieza hecha.

- [ ] **Paso 7: Commit** — `comprador.ts`, `comprador.test.ts`, `datos.ts`, `tipos.ts`,
  `scripts/visitas-datos.probe.ts`. Mensaje `feat(visitas): registro de comprador y capa de datos`.

---

### Tarea 8: `POST /api/visits` (alta nueva) y `GET` con alcance

**Files:**
- Modify: `app/api/visits/route.ts` (reemplazo completo)
- Test: `app/api/visits/route.test.ts`

**Interfaces:**
- Consumes: Tareas 2–7.
- Produces: `POST /api/visits` body
  `{ propiedadId, origen, origenDetalle?, persona: { tipo:'consulta'|'registro', id, telefono? } | { tipo:'nueva', nombre, telefono, email? }, fecha, hora, asesorId?, confirmada, notas?, forzarDuplicado? }`
  → `201 { data: { id } }` · `400 { error }` · `401` · `403` · `404` · `409 { error, code: 'PROPIEDAD_NO_DISPONIBLE' | 'VISITA_DUPLICADA', visita?: { id, scheduled_at } }`.

- [ ] **Paso 1: Escribir el test** (mocks de `getUser`, `datos`, `advancePipelineState`, email).

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { estado, datosMock, avanzarMock, emailMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '11111111-1111-4111-8111-111111111111', activo: true, logueado: true },
  datosMock: {
    leerPropiedadParaVisita: vi.fn(), leerConsulta: vi.fn(), leerRegistro: vi.fn(),
    asegurarComprador: vi.fn(), completarTelefonoDelRegistro: vi.fn(), visitasActivasDeLaPropiedad: vi.fn(),
    insertarVisita: vi.fn(), asesorAsignable: vi.fn(),
  },
  avanzarMock: vi.fn(),
  emailMock: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/leads/pipeline-state', () => ({ advancePipelineState: avanzarMock }))
vi.mock('@/lib/email/notifications/visit-scheduled-client', () => ({ sendVisitScheduledToClient: emailMock }))
vi.mock('@/lib/supabase/visits', () => ({ listVisits: vi.fn(async () => []) }))

import { POST } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
const ASESOR = '22222222-2222-4222-8222-222222222222'
const CONSULTA = '44444444-4444-4444-8444-444444444444'

const propiedad = { id: PROP, address: 'Doblas 248', neighborhood: 'Caballito', status: 'approved',
  commercial_status: 'disponible', assigned_to: ASESOR, foto: null, asking_price: 220000, currency: 'USD' }

function pedir(body: unknown) {
  return POST(new Request('http://local/api/visits', { method: 'POST', body: JSON.stringify(body) }) as never)
}

const base = {
  propiedadId: PROP, origen: 'cartel', persona: { tipo: 'nueva', nombre: 'Sofía Benítez', telefono: '11 5823-4521' },
  fecha: '2099-01-12', hora: '11:00', asesorId: ASESOR, confirmada: true,
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  avanzarMock.mockReset(); emailMock.mockReset()
  estado.role = 'coordinador'; estado.activo = true; estado.logueado = true
  datosMock.leerPropiedadParaVisita.mockResolvedValue(propiedad)
  datosMock.asegurarComprador.mockResolvedValue('55555555-5555-4555-8555-555555555555')
  datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([])
  datosMock.insertarVisita.mockResolvedValue('66666666-6666-4666-8666-666666666666')
  datosMock.asesorAsignable.mockResolvedValue(true)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-10T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('POST /api/visits', () => {
  it('sin sesión 401; abogado 403', async () => {
    estado.logueado = false
    expect((await pedir(base)).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await pedir(base)).status).toBe(403)
  })
  it('agenda una persona nueva por cartel, confirmada, a la hora argentina', async () => {
    const res = await pedir(base)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ data: { id: '66666666-6666-4666-8666-666666666666' } })
    const fila = datosMock.insertarVisita.mock.calls[0][0]
    expect(fila).toMatchObject({
      property_id: PROP, advisor_id: ASESOR, client_name: 'Sofía Benítez', client_phone: '11 5823-4521',
      scheduled_at: '2099-01-12T14:00:00.000Z', status: 'scheduled', origin: 'cartel', origin_detail: null,
      lead_id: '55555555-5555-4555-8555-555555555555', portal_inquiry_id: null,
      created_by: estado.id, changed_by: estado.id,
    })
    expect(datosMock.asegurarComprador.mock.calls[0][0]).toMatchObject({ source: 'visita:cartel', propertyId: PROP })
    expect(avanzarMock).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555', 'visit_scheduled')
  })
  it('un asesor queda a su nombre aunque pida otro', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    await pedir({ ...base, asesorId: '77777777-7777-4777-8777-777777777777' })
    expect(datosMock.insertarVisita.mock.calls[0][0].advisor_id).toBe(ASESOR)
  })
  it('un asesor no agenda en una propiedad que no es suya', async () => {
    estado.role = 'asesor'; estado.id = '77777777-7777-4777-8777-777777777777'
    expect((await pedir(base)).status).toBe(403)
  })
  it('consulta de portal: usa los datos de la consulta y la vincula', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: PROP, lead_name: 'Mariana López',
      lead_phone: '1158234521', lead_email: null, portal: 'zonaprop', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: 'Hola' })
    const res = await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA } })
    expect(res.status).toBe(201)
    expect(datosMock.insertarVisita.mock.calls[0][0]).toMatchObject({
      origin: 'portal', origin_detail: 'zonaprop', portal_inquiry_id: CONSULTA, client_name: 'Mariana López' })
    expect(datosMock.asegurarComprador.mock.calls[0][0]).toMatchObject({ source: 'portal:zonaprop' })
  })
  it('consulta de OTRA propiedad: 400', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: 'otra', lead_name: 'X', lead_phone: '1158234521',
      lead_email: null, portal: 'zonaprop', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: null })
    expect((await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA } })).status).toBe(400)
  })
  it('consulta sin teléfono y sin completar: 400 con mensaje', async () => {
    datosMock.leerConsulta.mockResolvedValue({ id: CONSULTA, property_id: PROP, lead_name: 'X', lead_phone: null,
      lead_email: null, portal: 'mercadolibre', received_at: null, created_at: '2099-01-09T00:00:00Z', lead_message: null })
    const res = await pedir({ ...base, origen: 'portal', persona: { tipo: 'consulta', id: CONSULTA } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Falta el teléfono de la persona')
  })
  it('una consulta solo vale con origen portal', async () => {
    expect((await pedir({ ...base, origen: 'cartel', persona: { tipo: 'consulta', id: CONSULTA } })).status).toBe(400)
  })
  it('propiedad vendida: 409 PROPIEDAD_NO_DISPONIBLE', async () => {
    datosMock.leerPropiedadParaVisita.mockResolvedValue({ ...propiedad, commercial_status: 'vendida' })
    const res = await pedir(base)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('PROPIEDAD_NO_DISPONIBLE')
  })
  it('doble toque: si la persona ya tiene visita activa, 409 VISITA_DUPLICADA y no crea', async () => {
    datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([{ id: 'v1', lead_id: '55555555-5555-4555-8555-555555555555',
      client_phone: '+5491158234521', scheduled_at: '2099-01-12T14:00:00Z', status: 'scheduled' }])
    const res = await pedir(base)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'VISITA_DUPLICADA', visita: { id: 'v1' } })
    expect(datosMock.insertarVisita).not.toHaveBeenCalled()
  })
  it('con forzarDuplicado sí crea', async () => {
    datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([{ id: 'v1', lead_id: '55555555-5555-4555-8555-555555555555',
      client_phone: null, scheduled_at: '2099-01-12T14:00:00Z', status: 'scheduled' }])
    expect((await pedir({ ...base, forzarDuplicado: true })).status).toBe(201)
  })
  it('origen "otro" sin escribir cuál: 400', async () => {
    const res = await pedir({ ...base, origen: 'otro' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Escribí de dónde vino la visita')
  })
  it('horario fuera de rango: 400 con el mensaje del horario', async () => {
    const res = await pedir({ ...base, fecha: '2098-01-01' })
    expect((await res.json()).error).toBe('Solo se pueden registrar visitas de los últimos 60 días')
  })
  it('asesor inexistente o dado de baja: 400', async () => {
    datosMock.asesorAsignable.mockResolvedValue(false)
    expect((await pedir(base)).status).toBe(400)
  })
  it('manda el email de confirmación solo si está confirmada y hay email', async () => {
    await pedir({ ...base, persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).toHaveBeenCalledTimes(1)
    emailMock.mockReset()
    await pedir({ ...base, confirmada: false, persona: { ...base.persona, email: 'sofia@mail.com' } })
    expect(emailMock).not.toHaveBeenCalled()
  })
  it('un fallo de la base responde 500 con mensaje en castellano', async () => {
    datosMock.insertarVisita.mockRejectedValue(new Error('crear visita: boom'))
    const res = await pedir(base)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos agendar la visita. Probá de nuevo.')
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar la ruta**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { resolverAlcanceAsignado } from '@/lib/auth/scope'
import { listVisits } from '@/lib/supabase/visits'
import { advancePipelineState } from '@/lib/leads/pipeline-state'
import { sendVisitScheduledToClient } from '@/lib/email/notifications/visit-scheduled-client'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'
import * as datos from '@/lib/visitas/datos'
import { ORIGENES_VISITA, fuenteDelComprador, validarDetalleDeOrigen } from '@/lib/visitas/origen'
import { validarHorarioDeVisita } from '@/lib/visitas/horario'
import { validarPersonaNueva } from '@/lib/visitas/persona'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas, asesorParaLaVisita } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/**
 * Alta de una visita desde la ventana "Agendar visita" (spec §3.2 y §4.4).
 * Todo se valida ACÁ (el navegador solo ayuda): permisos, origen, persona,
 * horario argentino, propiedad disponible y duplicado. La persona queda SIEMPRE
 * vinculada a un registro de comprador (`property_leads`).
 */
const personaSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('consulta'), id: z.string().uuid(), telefono: z.string().max(40).optional() }),
  z.object({ tipo: z.literal('registro'), id: z.string().uuid(), telefono: z.string().max(40).optional() }),
  z.object({ tipo: z.literal('nueva'), nombre: z.string().max(200), telefono: z.string().max(40), email: z.string().max(200).nullish() }),
])

const altaSchema = z.object({
  propiedadId: z.string().uuid(),
  origen: z.enum(ORIGENES_VISITA),
  origenDetalle: z.string().max(500).nullish(),
  persona: personaSchema,
  fecha: z.string().max(10),
  hora: z.string().max(5),
  asesorId: z.string().uuid().nullish(),
  confirmada: z.boolean(),
  notas: z.string().max(1000).nullish(),
  forzarDuplicado: z.boolean().optional(),
})

function error(status: number, mensaje: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: mensaje, ...extra }, { status })
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return error(403, 'No tenés permiso para agendar visitas')

  const parsed = altaSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return error(400, 'Faltan datos de la visita')
  const b = parsed.data

  const horario = validarHorarioDeVisita(b.fecha, b.hora)
  if (!horario.ok) return error(400, horario.error)

  const asesor = asesorParaLaVisita(role, user.id, b.asesorId)
  if (!asesor.ok) return error(400, asesor.error)

  try {
    const propiedad = await datos.leerPropiedadParaVisita(b.propiedadId)
    if (!propiedad) return error(404, 'No encontramos la propiedad')
    if (!puedeVerTodasLasVisitas(role) && propiedad.assigned_to !== user.id) {
      return error(403, 'Solo podés agendar visitas en tus propiedades')
    }
    if (propiedad.status !== 'approved' || !['disponible', 'reservada'].includes(propiedad.commercial_status ?? 'disponible')) {
      return error(409, 'La propiedad no está disponible para visitas', { code: 'PROPIEDAD_NO_DISPONIBLE' })
    }
    if (!asesor.esPropio && !(await datos.asesorAsignable(asesor.asesorId))) {
      return error(400, 'Ese asesor no está activo')
    }

    // ── La persona ─────────────────────────────────────────────────────────
    let nombre: string
    let telefono: string
    let email: string | null = null
    let leadId: string
    let portalInquiryId: string | null = null
    let portal: string | null = null

    if (b.persona.tipo === 'consulta') {
      if (b.origen !== 'portal') return error(400, 'Una consulta de portal solo va con el origen "Consulta de portal"')
      const c = await datos.leerConsulta(b.persona.id)
      if (!c || c.property_id !== propiedad.id) return error(400, 'Esa consulta no es de esta propiedad')
      const tel = (b.persona.telefono?.trim() || c.lead_phone || '').trim()
      if (!ultimos10Digitos(tel)) return error(400, 'Falta el teléfono de la persona')
      portal = c.portal
      nombre = c.lead_name?.trim() || 'Sin nombre'
      telefono = tel
      email = c.lead_email?.trim().toLowerCase() || null
      portalInquiryId = c.id
      leadId = await datos.asegurarComprador({
        propertyId: propiedad.id, nombre, telefono, email, mensaje: c.lead_message,
        source: fuenteDelComprador('portal', c.portal), asignadoA: propiedad.assigned_to,
      })
    } else if (b.persona.tipo === 'registro') {
      const r = await datos.leerRegistro(b.persona.id)
      if (!r || r.property_id !== propiedad.id || r.deleted_at) return error(400, 'Esa persona no está registrada en esta propiedad')
      const tel = (b.persona.telefono?.trim() || r.phone || '').trim()
      if (!ultimos10Digitos(tel)) return error(400, 'Falta el teléfono de la persona')
      if (!r.phone) await datos.completarTelefonoDelRegistro(r.id, tel)
      nombre = r.name?.trim() || 'Sin nombre'
      telefono = tel
      email = r.email?.trim().toLowerCase() || null
      leadId = r.id
    } else {
      const p = validarPersonaNueva(b.persona)
      if (!p.ok) return error(400, p.errores[0], { errores: p.errores })
      nombre = p.valor.nombre
      telefono = p.valor.telefono
      email = p.valor.email
      leadId = await datos.asegurarComprador({
        propertyId: propiedad.id, nombre, telefono, email, mensaje: null,
        source: fuenteDelComprador(b.origen), asignadoA: propiedad.assigned_to,
      })
    }

    const detalle = validarDetalleDeOrigen(b.origen, b.origenDetalle, portal)
    if (!detalle.ok) return error(400, detalle.error)

    // ── Duplicado: misma persona con una visita viva en esta propiedad ──────
    if (!b.forzarDuplicado) {
      const norm = ultimos10Digitos(telefono)
      const activa = (await datos.visitasActivasDeLaPropiedad(propiedad.id))
        .find(v => v.lead_id === leadId || (norm !== null && ultimos10Digitos(v.client_phone) === norm))
      if (activa) {
        return error(409, 'Esta persona ya tiene una visita agendada en esta propiedad', {
          code: 'VISITA_DUPLICADA', visita: { id: activa.id, scheduled_at: activa.scheduled_at },
        })
      }
    }

    const visitaId = await datos.insertarVisita({
      property_id: propiedad.id, advisor_id: asesor.asesorId, client_name: nombre, client_email: email,
      client_phone: telefono, scheduled_at: horario.instante.toISOString(),
      status: b.confirmada ? 'scheduled' : 'pending_confirmation',
      notes: b.notas?.trim() || null, origin: b.origen, origin_detail: detalle.detalle,
      lead_id: leadId, portal_inquiry_id: portalInquiryId, created_by: user.id, changed_by: user.id,
    })

    // Lo de abajo es secundario: la visita YA está. Un fallo acá se registra y
    // no hace parecer que no se agendó.
    try { await advancePipelineState(leadId, 'visit_scheduled') } catch (e) { console.error('[visits] avance del comprador falló', e) }
    if (b.confirmada && email) {
      try { await sendVisitScheduledToClient(visitaId) } catch (e) { console.error('[visits] email de confirmación falló', e) }
    }
    return NextResponse.json({ data: { id: visitaId } }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/visits]', e)
    return error(500, 'No pudimos agendar la visita. Probá de nuevo.')
  }
}

/** Lista (la pantalla /visits se rehace en la Entrega 2; acá solo se cierran permisos y alcance). */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return error(403, 'No tenés permiso para ver visitas')
  const sp = req.nextUrl.searchParams
  try {
    const visits = await listVisits({
      advisorId: resolverAlcanceAsignado(role, user.id, sp.get('advisor_id')),
      propertyId: sp.get('property_id') || undefined,
      status: sp.get('status') || undefined,
      from: sp.get('from') || undefined,
      to: sp.get('to') || undefined,
    })
    return NextResponse.json({ data: visits })
  } catch (e) {
    console.error('[GET /api/visits]', e)
    return error(500, 'No pudimos cargar las visitas')
  }
}
```

- [ ] **Paso 4: Correr y ver PASAR.** Si `vi.useFakeTimers({ toFake: ['Date'] })` no existe en
  esta versión, usar `vi.setSystemTime` con `vi.useFakeTimers()` y `vi.useRealTimers()` en
  `afterEach` (los `fetch` simulados no dependen de temporizadores).
- [ ] **Paso 5: Commit** — `feat(visitas): alta de visita con origen, persona y duplicados`.

---

### Tarea 9: Rutas de apoyo de la ventana (propiedades, interesados, agenda del asesor)

**Files:**
- Create: `app/api/visits/propiedades/route.ts`, `app/api/properties/[id]/interesados/route.ts`,
  `app/api/visits/agenda-del-asesor/route.ts`
- Test: `app/api/properties/[id]/interesados/route.test.ts`

**Interfaces:**
- `GET /api/visits/propiedades?q=&id=` → `{ data: PropiedadParaVisita[] }` (asesor: solo las suyas).
- `GET /api/properties/[id]/interesados?origen=` → `{ data: Interesado[] }`.
- `GET /api/visits/agenda-del-asesor?fecha=&propiedad=&asesor=` → `{ data: VisitaAgendaR[] }`.

- [ ] **Paso 1: Test de interesados**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: {
    leerPropiedadParaVisita: vi.fn(), listarConsultasDeLaPropiedad: vi.fn(),
    listarRegistrosDeLaPropiedad: vi.fn(), visitasActivasDeLaPropiedad: vi.fn(),
  },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)

import { GET } from './route'

const PROP = '33333333-3333-4333-8333-333333333333'
function pedir(origen: string) {
  const req = new Request(`http://local/api/properties/${PROP}/interesados?origen=${origen}`)
  return GET(Object.assign(req, { nextUrl: new URL(req.url) }) as never, { params: Promise.resolve({ id: PROP }) })
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  estado.role = 'asesor'
  datosMock.leerPropiedadParaVisita.mockResolvedValue({ id: PROP, assigned_to: estado.id })
  datosMock.listarConsultasDeLaPropiedad.mockResolvedValue([
    { id: 'c1', lead_name: 'Ana', lead_phone: '1158234521', lead_email: null, portal: 'zonaprop', received_at: '2026-10-08T00:00:00Z', created_at: '2026-10-08T00:00:00Z' },
  ])
  datosMock.listarRegistrosDeLaPropiedad.mockResolvedValue([])
  datosMock.visitasActivasDeLaPropiedad.mockResolvedValue([])
})

describe('GET /api/properties/[id]/interesados', () => {
  it('portal: devuelve quienes consultaron por la propiedad', async () => {
    const res = await pedir('portal')
    expect(res.status).toBe(200)
    expect((await res.json()).data.map((i: { nombre: string }) => i.nombre)).toEqual(['Ana'])
    expect(datosMock.listarRegistrosDeLaPropiedad).not.toHaveBeenCalled()
  })
  it('un asesor no ve los interesados de una propiedad ajena', async () => {
    datosMock.leerPropiedadParaVisita.mockResolvedValue({ id: PROP, assigned_to: 'otro' })
    expect((await pedir('portal')).status).toBe(403)
  })
  it('origen inválido: 400; abogado: 403', async () => {
    expect((await pedir('tasacion')).status).toBe(400)
    estado.role = 'abogado'
    expect((await pedir('portal')).status).toBe(403)
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar las tres rutas**

```ts
// app/api/properties/[id]/interesados/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { esOrigenVisita } from '@/lib/visitas/origen'
import { interesadosParaOrigen } from '@/lib/visitas/interesados'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/** Personas para el paso "Persona" de la ventana de agendar (spec §3.2 paso 3). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso' }, { status: 403 })
  const origen = req.nextUrl.searchParams.get('origen')
  if (!esOrigenVisita(origen)) return NextResponse.json({ error: 'Origen inválido' }, { status: 400 })
  const { id } = await params
  try {
    const prop = await datos.leerPropiedadParaVisita(id)
    if (!prop) return NextResponse.json({ error: 'No encontramos la propiedad' }, { status: 404 })
    if (!puedeVerTodasLasVisitas(role) && prop.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Esa propiedad no es tuya' }, { status: 403 })
    }
    const [consultas, registros, visitasActivas] = await Promise.all([
      origen === 'portal' ? datos.listarConsultasDeLaPropiedad(id) : Promise.resolve([]),
      origen === 'publicidad_meta' || origen === 'publicidad_paga' ? datos.listarRegistrosDeLaPropiedad(id) : Promise.resolve([]),
      datos.visitasActivasDeLaPropiedad(id),
    ])
    return NextResponse.json({ data: interesadosParaOrigen(origen, { consultas, registros, visitasActivas }) })
  } catch (e) {
    console.error('[GET interesados]', e)
    return NextResponse.json({ error: 'No pudimos cargar las personas' }, { status: 500 })
  }
}
```

```ts
// app/api/visits/propiedades/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/** Paso 1 de la ventana: propiedades captadas disponibles/reservadas. Asesor: solo las suyas. */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const id = sp.get('id')
  if (id && !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Propiedad inválida' }, { status: 400 })
  try {
    const data = await datos.buscarPropiedadesParaVisita({
      q: (sp.get('q') ?? '').slice(0, 80),
      id: id ?? undefined,
      asesorId: puedeVerTodasLasVisitas(role) ? undefined : user.id,
    })
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[GET visits/propiedades]', e)
    return NextResponse.json({ error: 'No pudimos buscar propiedades' }, { status: 500 })
  }
}
```

```ts
// app/api/visits/agenda-del-asesor/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

const schema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  propiedad: z.string().uuid(),
  asesor: z.string().uuid().nullish(),
})

/** Visitas del día del asesor y de la propiedad: alimenta los AVISOS de choque (no bloquean). */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso' }, { status: 403 })
  const sp = req.nextUrl.searchParams
  const p = schema.safeParse({ fecha: sp.get('fecha'), propiedad: sp.get('propiedad'), asesor: sp.get('asesor') })
  if (!p.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
  const asesorId = puedeVerTodasLasVisitas(role) ? (p.data.asesor ?? null) : user.id
  try {
    const data = await datos.visitasDelDia({ fecha: p.data.fecha, asesorId, propiedadId: p.data.propiedad })
    return NextResponse.json({ data })
  } catch (e) {
    console.error('[GET agenda-del-asesor]', e)
    return NextResponse.json({ error: 'No pudimos revisar la agenda' }, { status: 500 })
  }
}
```

- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `feat(visitas): rutas de propiedades, interesados y agenda para la ventana`.

---

### Tarea 10: Ficha de visita por API: `GET /api/visits/[id]` y `POST /api/visits/[id]/estado`

**Files:**
- Modify: `app/api/visits/[id]/route.ts` (queda solo `GET`)
- Create: `app/api/visits/[id]/estado/route.ts`
- Delete: `app/api/visits/[id]/complete/route.ts`
- Test: `app/api/visits/[id]/estado/route.test.ts`

**Interfaces:**
- `GET /api/visits/[id]` → `{ data: VisitaDetalle & { eventos: EventoVisitaR[]; acciones: TipoAccion[] } }`.
- `POST /api/visits/[id]/estado` body `AccionVisita` → `200 { data: VisitaDetalle & { eventos, acciones } }`
  · `400` · `403` · `404` · `409 { error, code: 'ACCION_NO_VALIDA' | 'CAMBIO_CONCURRENTE' }`.

- [ ] **Paso 1: Antes de borrar, listar consumidores** —
  `grep -rn "api/visits/\${\|/complete\|method: 'PUT'" app components lib | grep -i visit`.
  Esperado: solo `app/(dashboard)/visits/[id]/page.tsx` y `CompleteVisitDialog.tsx` (se reescriben
  en la Tarea 18). Si aparece otro, agregarlo al plan antes de borrar.

- [ ] **Paso 2: Test de `estado`**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { estado, datosMock, avanzarMock } = vi.hoisted(() => ({
  estado: { role: 'asesor', id: '22222222-2222-4222-8222-222222222222' },
  datosMock: { leerVisita: vi.fn(), actualizarVisita: vi.fn(), eventosDeLaVisita: vi.fn(), asesorAsignable: vi.fn() },
  avanzarMock: vi.fn(),
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => ({ id: estado.id, email: 'a@b.c', profile: { id: estado.id, role: estado.role, is_active: true } })),
}))
vi.mock('@/lib/visitas/datos', () => datosMock)
vi.mock('@/lib/leads/pipeline-state', () => ({ advancePipelineState: avanzarMock }))

import { POST } from './route'

const VISITA = '66666666-6666-4666-8666-666666666666'
const visita = (p: Record<string, unknown> = {}) => ({
  id: VISITA, status: 'scheduled', scheduled_at: '2099-01-09T20:00:00Z', advisor_id: estado.id, created_by: estado.id,
  lead_id: '55555555-5555-4555-8555-555555555555', ...p,
})
function pedir(body: unknown) {
  return POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never,
    { params: Promise.resolve({ id: VISITA }) })
}

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset()); avanzarMock.mockReset()
  estado.role = 'asesor'; estado.id = '22222222-2222-4222-8222-222222222222'
  datosMock.leerVisita.mockResolvedValue(visita())
  datosMock.actualizarVisita.mockResolvedValue({ ok: true })
  datosMock.eventosDeLaVisita.mockResolvedValue([])
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2099-01-10T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('POST /api/visits/[id]/estado', () => {
  it('marca "Se realizó", con el autor, y avanza al comprador a "visitó"', async () => {
    const res = await pedir({ tipo: 'realizada', interes: 'alto' })
    expect(res.status).toBe(200)
    expect(datosMock.actualizarVisita).toHaveBeenCalledWith(VISITA, 'scheduled',
      { status: 'completed', advisor_interest: 'alto', completion_notes: null, outcome_reason: null }, estado.id)
    expect(avanzarMock).toHaveBeenCalledWith('55555555-5555-4555-8555-555555555555', 'visit_completed')
  })
  it('una acción que no corresponde al estado: 409 ACCION_NO_VALIDA', async () => {
    const res = await pedir({ tipo: 'confirmar' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'ACCION_NO_VALIDA', error: 'Esta visita ya no se puede confirmar' })
  })
  it('si otra persona la cambió en el medio: 409 CAMBIO_CONCURRENTE', async () => {
    datosMock.actualizarVisita.mockResolvedValue({ ok: false, motivo: 'cambio_concurrente' })
    const res = await pedir({ tipo: 'no_realizada', motivo: 'no_vino' })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'CAMBIO_CONCURRENTE', error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.' })
  })
  it('un asesor no toca la visita de otro: 403', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ advisor_id: 'otro', created_by: 'otro' }))
    expect((await pedir({ tipo: 'realizada' })).status).toBe(403)
  })
  it('un asesor no puede cambiar el asesor: 403', async () => {
    datosMock.leerVisita.mockResolvedValue(visita({ scheduled_at: '2099-01-20T20:00:00Z' }))
    expect((await pedir({ tipo: 'cambiar_asesor', asesorId: '77777777-7777-4777-8777-777777777777' })).status).toBe(403)
  })
  it('coordinador cambia el asesor solo a uno activo', async () => {
    estado.role = 'coordinador'
    datosMock.leerVisita.mockResolvedValue(visita({ scheduled_at: '2099-01-20T20:00:00Z' }))
    datosMock.asesorAsignable.mockResolvedValue(false)
    expect((await pedir({ tipo: 'cambiar_asesor', asesorId: '77777777-7777-4777-8777-777777777777' })).status).toBe(400)
  })
  it('visita inexistente: 404; cuerpo inválido: 400', async () => {
    expect((await pedir({ tipo: 'bailar' })).status).toBe(400)
    datosMock.leerVisita.mockResolvedValue(null)
    expect((await pedir({ tipo: 'realizada' })).status).toBe(404)
  })
})
```

- [ ] **Paso 3: Correr y ver FALLAR.**
- [ ] **Paso 4: Implementar**

```ts
// app/api/visits/[id]/estado/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { advancePipelineState } from '@/lib/leads/pipeline-state'
import * as datos from '@/lib/visitas/datos'
import { aplicarAccion, accionesDisponibles, MOTIVOS_NO_REALIZADA, INTERESES, type AccionVisita } from '@/lib/visitas/transiciones'
import { puedeVerVisita, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/**
 * Cambia la etapa de una visita (spec §3.3). Reemplaza al PUT genérico y a
 * /complete, que solo pedían estar logueado: cualquiera —el abogado incluido—
 * podía cerrar cualquier visita. El historial lo escribe el trigger de la base.
 */
const accionSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('confirmar') }),
  z.object({ tipo: z.literal('reprogramar'), fecha: z.string().max(10), hora: z.string().max(5) }),
  z.object({ tipo: z.literal('cancelar'), motivo: z.enum(MOTIVOS_NO_REALIZADA), detalle: z.string().max(500).nullish() }),
  z.object({ tipo: z.literal('realizada'), interes: z.enum(INTERESES).nullish(), notas: z.string().max(1000).nullish() }),
  z.object({ tipo: z.literal('no_realizada'), motivo: z.enum(MOTIVOS_NO_REALIZADA), detalle: z.string().max(500).nullish() }),
  z.object({ tipo: z.literal('cambiar_asesor'), asesorId: z.string().uuid() }),
  z.object({ tipo: z.literal('reabrir'), motivo: z.string().max(500) }),
])

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  const parsed = accionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  const accion = parsed.data as AccionVisita
  const { id } = await params
  // Un id que no es UUID haría fallar a Postgres con 22P02 (→ 500). Es "no existe".
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })

  try {
    const visita = await datos.leerVisita(id)
    if (!visita) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    if (!puedeVerVisita(role, user.id, visita)) return NextResponse.json({ error: 'No tenés permiso sobre esta visita' }, { status: 403 })
    if (accion.tipo === 'cambiar_asesor') {
      if (!puedeVerTodasLasVisitas(role)) return NextResponse.json({ error: 'No podés cambiar el asesor' }, { status: 403 })
      if (!(await datos.asesorAsignable(accion.asesorId))) return NextResponse.json({ error: 'Ese asesor no está activo' }, { status: 400 })
    }

    const ahora = new Date()
    const r = aplicarAccion(visita, accion, ahora)
    if (!r.ok) return NextResponse.json({ error: r.error, code: 'ACCION_NO_VALIDA' }, { status: 409 })

    const escrito = await datos.actualizarVisita(id, visita.status, r.patch, user.id)
    if (!escrito.ok) {
      return NextResponse.json({ error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.', code: 'CAMBIO_CONCURRENTE' }, { status: 409 })
    }

    if (r.patch.status === 'completed' && visita.lead_id) {
      try { await advancePipelineState(visita.lead_id, 'visit_completed') } catch (e) { console.error('[visits/estado] avance falló', e) }
    }

    const actualizada = await datos.leerVisita(id)
    const eventos = await datos.eventosDeLaVisita(id)
    return NextResponse.json({ data: actualizada ? { ...actualizada, eventos, acciones: accionesDisponibles(actualizada, new Date()) } : null })
  } catch (e) {
    console.error('[POST /api/visits/[id]/estado]', e)
    return NextResponse.json({ error: 'No pudimos guardar el cambio. Probá de nuevo.' }, { status: 500 })
  }
}
```

```ts
// app/api/visits/[id]/route.ts (reemplazo completo: queda solo GET)
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { accionesDisponibles } from '@/lib/visitas/transiciones'
import { puedeVerVisita } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'

/** Ficha de la visita con su historial y las acciones posibles AHORA (calculadas con la hora del servidor). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
  try {
    const visita = await datos.leerVisita(id)
    if (!visita) return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    if (!puedeVerVisita(user.profile.role as Role, user.id, visita)) {
      return NextResponse.json({ error: 'No encontramos la visita' }, { status: 404 })
    }
    const eventos = await datos.eventosDeLaVisita(id)
    return NextResponse.json({ data: { ...visita, eventos, acciones: accionesDisponibles(visita, new Date()) } })
  } catch (e) {
    console.error('[GET /api/visits/[id]]', e)
    return NextResponse.json({ error: 'No pudimos cargar la visita' }, { status: 500 })
  }
}
```

- [ ] **Paso 5: Borrar** `app/api/visits/[id]/complete/route.ts` (`git rm`).
- [ ] **Paso 6: Correr y ver PASAR.**
- [ ] **Paso 7: Commit** — `feat(visitas): acciones de etapa con permisos, motivos y concurrencia`.

---

### Tarea 11: Las visitas que se crean solas guardan origen, comprador y autor

**Files:**
- Modify: `lib/leads/visit-scheduling.ts` (`UpsertPendingVisitInput`, `upsertPendingVisit`)
- Modify: `app/api/v/[token]/schedule/route.ts`
- Modify: `lib/ai/scheduling-agent.ts` (llamada a `upsertPendingVisit`, ~línea 1444)
- Modify: `lib/ai/reset-prueba.ts` (cancelación de visitas de prueba, ~línea 258)
- Test: `lib/leads/visit-scheduling.test.ts` (agregar casos)

**Interfaces:**
- Consumes: `origenDeLead(leadId)` (Tarea 7).
- Produces: `UpsertPendingVisitInput` gana `leadId?: string | null`, `origin?: OrigenVisita | null`,
  `originDetail?: string | null`.

- [ ] **Paso 1: Agregar tests** al final de `lib/leads/visit-scheduling.test.ts`:

```ts
  it('guarda origen, comprador y changed_by=null en el alta (escritor automático)', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    insertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })
    await upsertPendingVisit(admin(), {
      propertyId: 'prop-1', advisorId: null, clientName: 'Juan', clientEmail: null, clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'), notes: 'nota',
      leadId: 'lead-1', origin: 'publicidad_meta', originDetail: null,
    })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({
      lead_id: 'lead-1', origin: 'publicidad_meta', origin_detail: null, changed_by: null,
    }))
  })
  it('al actualizar la propuesta también deja changed_by=null (el historial no se la atribuye a nadie)', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    updateMaybeSingle.mockResolvedValueOnce({ data: { id: 'visit-old' }, error: null })
    await upsertPendingVisit(admin(), {
      propertyId: 'prop-1', advisorId: null, clientName: 'Juan', clientEmail: null, clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'), notes: 'otra', existingVisitId: 'visit-old',
    })
    expect(updateFn).toHaveBeenCalledWith(expect.objectContaining({ changed_by: null }))
  })
```

  (Los nombres `insertFn`, `insertSingle`, `updateFn`, `updateMaybeSingle` ya existen en ese archivo.)

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar en `visit-scheduling.ts`**: agregar a la interfaz

```ts
  /** Comprador (`property_leads`) de la visita. Spec §4.2: toda visita tiene uno. */
  leadId?: string | null
  /** Origen derivado del comprador (`origenDesdeLead`). */
  origin?: OrigenVisita | null
  originDetail?: string | null
```

  con `import type { OrigenVisita } from '@/lib/visitas/origen'`; en el `update` agregar
  `changed_by: null` junto a `scheduled_at` y `notes`; en el `insert` agregar
  `lead_id: input.leadId ?? null, origin: input.origin ?? null, origin_detail: input.originDetail ?? null, changed_by: null`.
  Comentario: "changed_by=null a propósito: lo escribe un proceso automático (agente o cliente), y
  el trigger del historial copia este valor. Sin mandarlo, quedaría el autor de la última edición
  humana."

- [ ] **Paso 4: Token del recorrido** — en `app/api/v/[token]/schedule/route.ts`, después de leer
  `leadId` del token y antes de `upsertPendingVisit`:

```ts
    const origen = leadId ? await origenDeLead(leadId) : null
```

  (`import { origenDeLead } from '@/lib/visitas/datos'`) y pasar
  `leadId, origin: origen?.origen ?? null, originDetail: origen?.detalle ?? null` a `upsertPendingVisit`.

- [ ] **Paso 5: Agente** — en `lib/ai/scheduling-agent.ts`, en la llamada de ~línea 1444, antes de
  `upsertPendingVisit`: `const origen = input.leadId ? await origenDeLead(input.leadId) : null` y
  pasar los mismos tres campos. Correr `grep -n "upsertPendingVisit" -r lib app` para confirmar que
  no hay un tercer llamador.

- [ ] **Paso 6: Reinicio de prueba** — en `lib/ai/reset-prueba.ts` (~línea 259), agregar
  `changed_by: null` al objeto del `update` que cancela las visitas de prueba.

- [ ] **Paso 7: Correr** las pruebas de la config acotada **y** las del agente:
  `npx vitest run --config vitest.agente-prueba.config.ts` (config existente del agente). Esperado:
  PASS sin cambios de comportamiento.

- [ ] **Paso 8: Commit** — `feat(visitas): las visitas del agente y del recorrido guardan origen y comprador`.

---

### Tarea 12: La respuesta a consultas usa el mismo registro de comprador

**Files:**
- Modify: `lib/leads/responder-consulta.ts` (`asegurarLead`, ~líneas 316-360)
- Test: `lib/leads/responder-consulta.test.ts` (ajustar si mockea `.eq('phone', …)`)

  Por qué no lleva test nuevo: `asegurarLead` es privada y su regla nueva ("mismo teléfono en
  otro formato = mismo comprador") vive en `decidirComprador`, ya testeada en la Tarea 7 y
  ejercitada contra la base en `scripts/visitas-datos.probe.ts`. Esta tarea solo cambia la llamada.
  El test existente de este archivo (`ubicacionDeLaPropiedad`) tiene que seguir pasando: importa el
  módulo, que ahora importa `@/lib/visitas/datos` (con `server-only`, resuelto por el alias de la
  config acotada).

- [ ] **Paso 1: Implementar**: agregar `import { asegurarComprador } from '@/lib/visitas/datos'` y
  reemplazar el cuerpo de `asegurarLead` por

```ts
  try {
    return await asegurarComprador({
      propertyId: prop.id,
      nombre: c.lead_name?.trim() || 'Consulta de portal',
      telefono: c.lead_phone,
      email: c.lead_email,
      mensaje: c.lead_message,
      source: `portal:${c.portal}`,
      asignadoA: prop.assigned_to,
    })
  } catch (err) {
    console.warn('[consulta] no se pudo asegurar el comprador (se manda igual):', err)
    return null
  }
```

  La firma queda `async function asegurarLead(c: {…mismo tipo…}, prop: PropiedadParaConsulta): Promise<string | null>`
  (sin `sb`) y su único llamador (`lib/leads/responder-consulta.ts:180`) pasa a
  `const leadId = await asegurarLead(c, prop)`. Mantener el comentario existente y agregar:
  "Usa la misma búsqueda por últimos 10 dígitos que la ventana de agendar
  (lib/visitas/datos.asegurarComprador): antes comparaba el teléfono exacto y duplicaba compradores."
- [ ] **Paso 2: Verificar** — `grep -n "asegurarLead(" lib/leads/responder-consulta.ts` (dos líneas:
  la definición y la llamada, ambas sin `sb`); `npx vitest run --config vitest.visitas.config.ts lib/leads/responder-consulta.test.ts`
  (PASS); `npx tsc --noEmit -p tsconfig.visitas.json` limpio.
- [ ] **Paso 3: Commit** — `fix(consultas): un mismo comprador aunque el teléfono venga en otro formato`.

---

### Tarea 13: El email de confirmación muestra la hora argentina

**Files:**
- Modify: `lib/email/notifications/visit-scheduled-client.ts`

- [ ] **Paso 1: Reemplazar el archivo completo** por:

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import VisitScheduledClientEmail from '@/emails/VisitScheduledClientEmail'

/**
 * "Tu visita está confirmada" para la persona que va a visitar.
 *
 * Hora: `formatearFechaLarga` la escribe en horario argentino. Antes usaba
 * `toLocaleString` sin zona y en el servidor (UTC) la hora salía 3 h corrida.
 * Lectura con service role: desde 2026-10-10 la lectura con sesión depende de la
 * RLS por asesor, y este envío ocurre en la misma solicitud que creó la visita.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function sendVisitScheduledToClient(visitId: string) {
  const { data: visit } = await admin()
    .from('property_visits')
    .select(`
      id, client_name, client_email, scheduled_at,
      property:properties(address, neighborhood),
      advisor:profiles!property_visits_advisor_id_fkey(full_name, email, phone)
    `)
    .eq('id', visitId)
    .maybeSingle()

  if (!visit || !visit.client_email) {
    console.warn('[visit-scheduled-client] missing visit or client_email', visitId)
    return
  }

  // Supabase tipa los joins como arreglos de 1: se normaliza.
  const property = Array.isArray(visit.property) ? visit.property[0] : visit.property
  const advisor = Array.isArray(visit.advisor) ? visit.advisor[0] : visit.advisor

  const html = await renderEmail(
    VisitScheduledClientEmail({
      clientName: visit.client_name,
      propertyAddress: property?.address ?? '',
      propertyNeighborhood: property?.neighborhood ?? '',
      scheduledAt: formatearFechaLarga(visit.scheduled_at),
      advisorName: advisor?.full_name ?? 'Tu asesor',
      advisorPhone: advisor?.phone ?? undefined,
      advisorEmail: advisor?.email ?? 'contacto@inmodf.com.ar',
    })
  )

  await sendEmail({
    notificationType: 'visit_scheduled_client',
    entityType: 'property',
    entityId: visit.id,
    to: visit.client_email,
    subject: `Confirmación de visita: ${property?.address ?? ''}`,
    html,
    idempotent: true,
  })
}
```

  El `!` en las variables de entorno es el mismo patrón que `lib/leads/visit-scheduling.ts`: sin
  ellas la app entera no arranca. Si el cliente sin tipar hace que `visit.property` sea `unknown`,
  tiparlo con `as { address: string; neighborhood: string | null } | Array<…> | null` en vez de `any`.
- [ ] **Paso 2: Probar con un render** — crear `scripts/_qa-email-visita.tsx` (sin commitear):

```tsx
import { renderEmail } from '@/lib/email/render'
import VisitScheduledClientEmail from '@/emails/VisitScheduledClientEmail'
import { formatearFechaLarga } from '@/lib/visitas/horario'

const html = await renderEmail(VisitScheduledClientEmail({
  clientName: 'Sofía', propertyAddress: 'Doblas 248', propertyNeighborhood: 'Caballito',
  scheduledAt: formatearFechaLarga('2026-10-12T14:00:00Z'), advisorName: 'Lucas', advisorEmail: 'x@inmodf.com.ar',
}))
console.log(html.includes('lunes 12 de octubre, 11:00') ? 'hora correcta ✓' : 'HORA INCORRECTA ✗')
```

  y correrlo con `node --env-file=../../../.env.local --import tsx scripts/_qa-email-visita.tsx`.
  Esperado: `hora correcta ✓`.
- [ ] **Paso 3:** `npx tsc --noEmit -p tsconfig.visitas.json` limpio para el archivo.
- [ ] **Paso 4: Commit** — `fix(visitas): el email de confirmación con la hora de Argentina`.

---

### Tarea 14: Estado de la ventana "Agendar visita" (reductor puro)

**Files:**
- Create: `lib/visitas/agendar-estado.ts`
- Test: `lib/visitas/agendar-estado.test.ts`

**Interfaces:**
- Produces: `type PasoAgendar = 'propiedad' | 'origen' | 'persona' | 'cuando' | 'asesor' | 'confirmar'`,
  `interface PropiedadElegida { id; address; neighborhood: string | null; foto: string | null; asesorId: string | null }`,
  `type PersonaElegida = { tipo: 'consulta' | 'registro'; id: string; nombre: string; telefono: string | null; detalle: string } | { tipo: 'nueva'; nombre: string; telefono: string; email: string }`,
  `interface EstadoAgendar`, `estadoInicial({ propiedad?, asesorPropio? })`,
  `pasosVisibles(estado, { puedeElegirAsesor })`, `errorDelPaso(estado, paso, ahora?)`,
  `reducirAgendar(estado, accion)`, `siguientePaso(estado, opts)`, `pasoAnterior(estado, opts)`,
  `armarPedido(estado): PedidoAlta`.

- [ ] **Paso 1: Test**

```ts
import { describe, it, expect } from 'vitest'
import { estadoInicial, reducirAgendar, pasosVisibles, errorDelPaso, siguientePaso, pasoAnterior, armarPedido, type PropiedadElegida } from './agendar-estado'

const PROP: PropiedadElegida = { id: '33333333-3333-4333-8333-333333333333', address: 'Doblas 248', neighborhood: 'Caballito', foto: null, asesorId: '22222222-2222-4222-8222-222222222222' }
const AHORA = new Date('2026-10-10T15:00:00Z')

describe('pasos de la ventana', () => {
  it('desde la ficha se saltea "Propiedad"; un asesor no ve "Asesor"', () => {
    const e = estadoInicial({ propiedad: PROP })
    expect(pasosVisibles(e, { puedeElegirAsesor: false })).toEqual(['origen', 'persona', 'cuando', 'confirmar'])
    expect(pasosVisibles(estadoInicial({}), { puedeElegirAsesor: true }))
      .toEqual(['propiedad', 'origen', 'persona', 'cuando', 'asesor', 'confirmar'])
  })
  it('empieza en el primer paso visible y avanza/retrocede en orden', () => {
    const e = estadoInicial({ propiedad: PROP })
    expect(e.paso).toBe('origen')
    expect(siguientePaso(e, { puedeElegirAsesor: false })).toBe('persona')
    expect(pasoAnterior({ ...e, paso: 'persona' }, { puedeElegirAsesor: false })).toBe('origen')
    expect(pasoAnterior(e, { puedeElegirAsesor: false })).toBeNull()
  })
})

describe('reglas al elegir', () => {
  it('reiniciar reemplaza TODO el estado (al abrir la ventana desde la ficha)', () => {
    const sucio = reducirAgendar(estadoInicial({}), { tipo: 'notas', texto: 'viejo' })
    const nuevo = estadoInicial({ propiedad: PROP })
    expect(reducirAgendar(sucio, { tipo: 'reiniciar', estado: nuevo })).toEqual(nuevo)
    expect(nuevo.propiedadFija).toBe(true)
  })
  it('elegir propiedad trae su asesor y borra la persona elegida', () => {
    let e = estadoInicial({})
    e = reducirAgendar(e, { tipo: 'elegirPersona', persona: { tipo: 'nueva', nombre: 'A', telefono: '1', email: '' } })
    e = reducirAgendar(e, { tipo: 'elegirPropiedad', propiedad: PROP })
    expect(e.asesorId).toBe(PROP.asesorId)
    expect(e.persona).toBeNull()
  })
  it('cambiar de origen borra la persona (otra lista)', () => {
    let e = reducirAgendar(estadoInicial({ propiedad: PROP }), { tipo: 'elegirOrigen', origen: 'portal' })
    e = reducirAgendar(e, { tipo: 'elegirPersona', persona: { tipo: 'consulta', id: 'c1', nombre: 'Ana', telefono: null, detalle: 'Zonaprop' } })
    e = reducirAgendar(e, { tipo: 'elegirOrigen', origen: 'cartel' })
    expect(e.persona).toBeNull()
  })
})

describe('errorDelPaso', () => {
  const e = estadoInicial({ propiedad: PROP })
  it('origen obligatorio, y "otro" con texto', () => {
    expect(errorDelPaso(e, 'origen')).toBe('Elegí de dónde viene la visita')
    expect(errorDelPaso({ ...e, origen: 'otro', origenDetalle: '' }, 'origen')).toBe('Escribí de dónde vino la visita')
  })
  it('persona de la lista sin teléfono exige completarlo', () => {
    const conPersona = { ...e, origen: 'portal' as const, persona: { tipo: 'consulta' as const, id: 'c', nombre: 'A', telefono: null, detalle: 'ML' } }
    expect(errorDelPaso(conPersona, 'persona')).toBe('Falta el teléfono de la persona')
    expect(errorDelPaso({ ...conPersona, telefonoFaltante: '11 5823 4521' }, 'persona')).toBeNull()
  })
  it('persona nueva usa la validación de persona', () => {
    expect(errorDelPaso({ ...e, origen: 'cartel', persona: { tipo: 'nueva', nombre: 'S', telefono: '11', email: '' } }, 'persona'))
      .toBe('Escribí el nombre de la persona')
  })
  it('día y hora válidos y en rango', () => {
    expect(errorDelPaso(e, 'cuando', AHORA)).toBe('Elegí el día y la hora')
    expect(errorDelPaso({ ...e, fecha: '2026-02-31', hora: '10:00' }, 'cuando', AHORA)).toBe('Elegí un día y una hora válidos')
    expect(errorDelPaso({ ...e, fecha: '2026-10-12', hora: '11:00' }, 'cuando', AHORA)).toBeNull()
  })
})

describe('armarPedido', () => {
  it('arma exactamente el cuerpo que espera POST /api/visits', () => {
    const e = {
      ...estadoInicial({ propiedad: PROP }), origen: 'portal' as const,
      persona: { tipo: 'consulta' as const, id: '44444444-4444-4444-8444-444444444444', nombre: 'Ana', telefono: null, detalle: 'ML' },
      telefonoFaltante: '1158234521', fecha: '2026-10-12', hora: '11:00', confirmada: true, notas: ' trae a su hija ',
    }
    expect(armarPedido(e)).toEqual({
      propiedadId: PROP.id, origen: 'portal', origenDetalle: null,
      persona: { tipo: 'consulta', id: '44444444-4444-4444-8444-444444444444', telefono: '1158234521' },
      fecha: '2026-10-12', hora: '11:00', asesorId: PROP.asesorId, confirmada: true, notas: 'trae a su hija',
    })
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar**

```ts
/**
 * Estado de la ventana "Agendar visita" (spec §3.2). Puro: la ventana solo
 * despacha acciones y pinta; las reglas de cada paso viven acá, testeadas.
 * El servidor vuelve a validar TODO (esto es ayuda, no barrera).
 */
import { ORIGEN_INFO, validarDetalleDeOrigen, type OrigenVisita } from './origen'
import { validarHorarioDeVisita } from './horario'
import { validarPersonaNueva } from './persona'
import { ultimos10Digitos } from '@/lib/phone/ultimos-digitos'

export type PasoAgendar = 'propiedad' | 'origen' | 'persona' | 'cuando' | 'asesor' | 'confirmar'
const ORDEN: PasoAgendar[] = ['propiedad', 'origen', 'persona', 'cuando', 'asesor', 'confirmar']

export interface PropiedadElegida {
  id: string
  address: string
  neighborhood: string | null
  foto: string | null
  asesorId: string | null
}

export type PersonaElegida =
  | { tipo: 'consulta' | 'registro'; id: string; nombre: string; telefono: string | null; detalle: string }
  | { tipo: 'nueva'; nombre: string; telefono: string; email: string }

export interface EstadoAgendar {
  paso: PasoAgendar
  propiedadFija: boolean
  propiedad: PropiedadElegida | null
  origen: OrigenVisita | null
  origenDetalle: string
  persona: PersonaElegida | null
  telefonoFaltante: string
  fecha: string | null
  hora: string | null
  asesorId: string | null
  confirmada: boolean
  notas: string
}

export interface OpcionesPasos { puedeElegirAsesor: boolean }

export function estadoInicial(o: { propiedad?: PropiedadElegida | null; asesorPropio?: string | null }): EstadoAgendar {
  const propiedad = o.propiedad ?? null
  return {
    paso: propiedad ? 'origen' : 'propiedad',
    propiedadFija: propiedad !== null,
    propiedad,
    origen: null,
    origenDetalle: '',
    persona: null,
    telefonoFaltante: '',
    fecha: null,
    hora: null,
    asesorId: propiedad?.asesorId ?? o.asesorPropio ?? null,
    confirmada: true,
    notas: '',
  }
}

export function pasosVisibles(e: EstadoAgendar, o: OpcionesPasos): PasoAgendar[] {
  return ORDEN.filter(p => !(p === 'propiedad' && e.propiedadFija) && !(p === 'asesor' && !o.puedeElegirAsesor))
}

export function siguientePaso(e: EstadoAgendar, o: OpcionesPasos): PasoAgendar | null {
  const pasos = pasosVisibles(e, o)
  return pasos[pasos.indexOf(e.paso) + 1] ?? null
}

export function pasoAnterior(e: EstadoAgendar, o: OpcionesPasos): PasoAgendar | null {
  const pasos = pasosVisibles(e, o)
  const i = pasos.indexOf(e.paso)
  return i > 0 ? pasos[i - 1] : null
}

export type AccionAgendar =
  | { tipo: 'reiniciar'; estado: EstadoAgendar }
  | { tipo: 'irA'; paso: PasoAgendar }
  | { tipo: 'elegirPropiedad'; propiedad: PropiedadElegida }
  | { tipo: 'elegirOrigen'; origen: OrigenVisita }
  | { tipo: 'detalleOrigen'; texto: string }
  | { tipo: 'elegirPersona'; persona: PersonaElegida | null }
  | { tipo: 'telefonoFaltante'; texto: string }
  | { tipo: 'elegirFecha'; fecha: string }
  | { tipo: 'elegirHora'; hora: string }
  | { tipo: 'elegirAsesor'; asesorId: string }
  | { tipo: 'confirmada'; valor: boolean }
  | { tipo: 'notas'; texto: string }

export function reducirAgendar(e: EstadoAgendar, a: AccionAgendar): EstadoAgendar {
  switch (a.tipo) {
    case 'reiniciar': return a.estado
    case 'irA': return { ...e, paso: a.paso }
    case 'elegirPropiedad':
      return { ...e, propiedad: a.propiedad, persona: null, telefonoFaltante: '', asesorId: a.propiedad.asesorId ?? e.asesorId }
    case 'elegirOrigen':
      return a.origen === e.origen ? e : { ...e, origen: a.origen, origenDetalle: '', persona: null, telefonoFaltante: '' }
    case 'detalleOrigen': return { ...e, origenDetalle: a.texto }
    case 'elegirPersona': return { ...e, persona: a.persona, telefonoFaltante: '' }
    case 'telefonoFaltante': return { ...e, telefonoFaltante: a.texto }
    case 'elegirFecha': return { ...e, fecha: a.fecha }
    case 'elegirHora': return { ...e, hora: a.hora }
    case 'elegirAsesor': return { ...e, asesorId: a.asesorId }
    case 'confirmada': return { ...e, confirmada: a.valor }
    case 'notas': return { ...e, notas: a.texto }
  }
}

export function errorDelPaso(e: EstadoAgendar, paso: PasoAgendar, ahora: Date = new Date()): string | null {
  switch (paso) {
    case 'propiedad':
      return e.propiedad ? null : 'Elegí la propiedad'
    case 'origen': {
      if (!e.origen) return 'Elegí de dónde viene la visita'
      if (ORIGEN_INFO[e.origen].detalle === 'no') return null
      const d = validarDetalleDeOrigen(e.origen, e.origenDetalle)
      return d.ok ? null : d.error
    }
    case 'persona': {
      if (!e.persona) return 'Elegí a la persona o cargala a mano'
      if (e.persona.tipo === 'nueva') {
        const p = validarPersonaNueva(e.persona)
        return p.ok ? null : p.errores[0]
      }
      if (ultimos10Digitos(e.persona.telefono) || ultimos10Digitos(e.telefonoFaltante)) return null
      return 'Falta el teléfono de la persona'
    }
    case 'cuando': {
      if (!e.fecha || !e.hora) return 'Elegí el día y la hora'
      const h = validarHorarioDeVisita(e.fecha, e.hora, ahora)
      return h.ok ? null : h.error
    }
    case 'asesor':
      return e.asesorId ? null : 'Elegí el asesor'
    case 'confirmar':
      return null
  }
}

export interface PedidoAlta {
  propiedadId: string
  origen: OrigenVisita
  origenDetalle: string | null
  persona: { tipo: 'consulta' | 'registro'; id: string; telefono?: string } | { tipo: 'nueva'; nombre: string; telefono: string; email: string | null }
  fecha: string
  hora: string
  asesorId: string | null
  confirmada: boolean
  notas: string | null
  forzarDuplicado?: boolean
}

export function armarPedido(e: EstadoAgendar): PedidoAlta | null {
  if (!e.propiedad || !e.origen || !e.persona || !e.fecha || !e.hora) return null
  const persona: PedidoAlta['persona'] = e.persona.tipo === 'nueva'
    ? { tipo: 'nueva', nombre: e.persona.nombre, telefono: e.persona.telefono, email: e.persona.email.trim() || null }
    : { tipo: e.persona.tipo, id: e.persona.id, ...(e.telefonoFaltante.trim() ? { telefono: e.telefonoFaltante.trim() } : {}) }
  return {
    propiedadId: e.propiedad.id,
    origen: e.origen,
    origenDetalle: e.origenDetalle.trim() || null,
    persona,
    fecha: e.fecha,
    hora: e.hora,
    asesorId: e.asesorId,
    confirmada: e.confirmada,
    notas: e.notas.trim() || null,
  }
}
```

- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `feat(visitas): estado de la ventana de agendar`.

---

### Tarea 15: Selector de día y hora (componente compartido)

**Files:**
- Create: `components/visitas/SelectorDiaHora.tsx`
- Test: `components/visitas/SelectorDiaHora.test.tsx`

**Interfaces:**
- Produces: `<SelectorDiaHora fecha={string|null} hora={string|null} onFecha={(f) => void} onHora={(h) => void} avisos={string[]} />`.

- [ ] **Paso 1: Test** (happy-dom; la primera corrida en frío puede tardar >60 s — reintentar una vez).

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectorDiaHora } from './SelectorDiaHora'

describe('SelectorDiaHora', () => {
  it('ofrece Hoy y Mañana como botones y avisa la elección', () => {
    const onFecha = vi.fn()
    render(<SelectorDiaHora hoy="2026-10-10" fecha={null} hora={null} onFecha={onFecha} onHora={vi.fn()} avisos={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Mañana/ }))
    expect(onFecha).toHaveBeenCalledWith('2026-10-11')
  })
  it('marca el horario elegido con aria-pressed', () => {
    render(<SelectorDiaHora hoy="2026-10-10" fecha="2026-10-12" hora="11:00" onFecha={vi.fn()} onHora={vi.fn()} avisos={[]} />)
    expect(screen.getByRole('button', { name: '11:00' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('muestra los avisos en una región anunciada', () => {
    render(<SelectorDiaHora hoy="2026-10-10" fecha="2026-10-12" hora="11:00" onFecha={vi.fn()} onHora={vi.fn()} avisos={['El asesor ya tiene una visita a las 11:30']} />)
    expect(screen.getByRole('status')).toHaveTextContent('El asesor ya tiene una visita a las 11:30')
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar**

```tsx
'use client'

/**
 * Día y hora en botones (diseño A del lienzo, paso "¿Cuándo?"). Un toque por
 * dato; "Otro día u horario" abre los campos nativos (los del sistema: en el
 * celular abren su propio selector, mejor que cualquier calendario dibujado).
 * Lo usan la ventana de agendar y "Reprogramar".
 */
import { useState } from 'react'
import { Clock } from 'lucide-react'
import { diasParaElegir, HORARIOS_SUGERIDOS } from '@/lib/visitas/horario'
import { cn } from '@/lib/utils'

interface Props {
  hoy: string
  fecha: string | null
  hora: string | null
  onFecha: (fecha: string) => void
  onHora: (hora: string) => void
  avisos: string[]
}

export function SelectorDiaHora({ hoy, fecha, hora, onFecha, onHora, avisos }: Props) {
  const dias = diasParaElegir(hoy, 7)
  const fechaFueraDeLista = fecha !== null && !dias.some(d => d.fecha === fecha)
  const horaFueraDeLista = hora !== null && !HORARIOS_SUGERIDOS.includes(hora)
  const [libre, setLibre] = useState(fechaFueraDeLista || horaFueraDeLista)

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Día" className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {dias.map(d => (
          <button
            key={d.fecha}
            type="button"
            aria-pressed={fecha === d.fecha}
            onClick={() => onFecha(d.fecha)}
            className={cn(
              'flex h-16 flex-col items-center justify-center rounded-xl border text-sm transition-colors',
              fecha === d.fecha ? 'border-transparent bg-foreground text-background' : 'bg-card hover:bg-secondary',
            )}
          >
            <span className="text-xs">{d.etiqueta}</span>
            <span className="text-lg font-semibold tabular-nums">{d.numero}</span>
          </button>
        ))}
      </div>

      <div role="group" aria-label="Hora" className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {HORARIOS_SUGERIDOS.map(h => (
          <button
            key={h}
            type="button"
            aria-pressed={hora === h}
            onClick={() => onHora(h)}
            className={cn(
              'h-11 rounded-lg border font-mono text-sm tabular-nums transition-colors',
              hora === h ? 'border-transparent bg-brand text-brand-foreground' : 'bg-card hover:bg-secondary',
            )}
          >
            {h}
          </button>
        ))}
      </div>

      {libre ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Otro día</span>
            <input type="date" value={fecha ?? ''} onChange={e => e.target.value && onFecha(e.target.value)}
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Otro horario</span>
            <input type="time" step={300} value={hora ?? ''} onChange={e => e.target.value && onHora(e.target.value)}
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
        </div>
      ) : (
        <button type="button" onClick={() => setLibre(true)} className="text-sm text-brand underline-offset-4 hover:underline">
          Otro día u horario
        </button>
      )}

      <div role="status" aria-live="polite">
        {avisos.map(a => (
          <p key={a} className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />{a}
          </p>
        ))}
      </div>
    </div>
  )
}
```

  Contraste: `text-amber-900` sobre `bg-amber-50` supera 4,5:1. Inputs con `text-base` (16 px):
  evita el zoom de iOS al enfocarlos.
- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `feat(visitas): selector de día y hora en botones`.

---

### Tarea 16: La ventana "Agendar visita"

**Files:**
- Create: `components/visitas/agendar/AgendarVisitaDialog.tsx`, `PasoPropiedad.tsx`, `PasoOrigen.tsx`,
  `PasoPersona.tsx`, `PasoCuando.tsx`, `PasoAsesor.tsx`, `PasoConfirmar.tsx`, `leer-respuesta.ts`
- Test: `components/visitas/agendar/AgendarVisitaDialog.test.tsx`

**Interfaces:**
- Produces: `<AgendarVisitaDialog open onOpenChange propiedadId?={string} onAgendada?={(id: string) => void} />`.
  Si viene `propiedadId`, la ventana pide `GET /api/visits/propiedades?id=` y arranca en "Origen".

- [ ] **Paso 1: Helper tolerante de respuestas** (`leer-respuesta.ts`): un 504 de Netlify devuelve
  HTML; nunca mostrar `Unexpected token '<'`.

```ts
export async function leerRespuesta<T>(res: Response): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; cuerpo: Record<string, unknown> }> {
  let cuerpo: Record<string, unknown> = {}
  try { cuerpo = (await res.json()) as Record<string, unknown> } catch { /* HTML de error del gateway */ }
  if (res.ok) return { ok: true, data: cuerpo.data as T }
  const error = typeof cuerpo.error === 'string' ? cuerpo.error
    : res.status === 504 ? 'El servidor tardó demasiado. Probá de nuevo.' : 'Algo falló. Probá de nuevo.'
  return { ok: false, status: res.status, error, cuerpo }
}
```

- [ ] **Paso 2: Test de la ventana** (mock de `fetch` por URL):

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AgendarVisitaDialog } from './AgendarVisitaDialog'

const PROP = { id: '33333333-3333-4333-8333-333333333333', address: 'Doblas 248', neighborhood: 'Caballito', foto: null, assigned_to: '22222222-2222-4222-8222-222222222222', status: 'approved', commercial_status: 'disponible', asking_price: 220000, currency: 'USD' }
let rol = 'asesor'

beforeEach(() => {
  rol = 'asesor'
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 })
    if (url.startsWith('/api/auth/me')) return new Response(JSON.stringify({ id: PROP.assigned_to, role: rol }), { status: 200 })
    if (url.startsWith('/api/visits/propiedades')) return json([PROP])
    if (url.includes('/interesados')) return json([{ clave: 'consulta:c1', tipo: 'consulta', id: 'c1', nombre: 'Mariana López', telefono: '1158234521', email: null, detalle: 'Zonaprop', fecha: '2026-10-08T00:00:00Z', tieneTelefono: true, consultas: 1, coincideConElOrigen: true, visitaActiva: null }])
    if (url.startsWith('/api/users/advisors')) return json([{ id: PROP.assigned_to, full_name: 'Lucas' }])
    if (url.startsWith('/api/visits/agenda-del-asesor')) return json([])
    return new Response('{}', { status: 404 })
  }))
})

describe('AgendarVisitaDialog', () => {
  it('desde la ficha arranca en "¿De dónde viene esta visita?"', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    expect(await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })).toBeInTheDocument()
  })
  it('no deja avanzar sin elegir y explica por qué', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Elegí de dónde viene la visita')).toBeInTheDocument()
  })
  it('consulta de portal → lista quienes consultaron', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    fireEvent.click(await screen.findByRole('button', { name: /Consulta de portal/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Mariana López')).toBeInTheDocument()
  })
  it('un asesor no ve el paso "Asesor"', async () => {
    render(<AgendarVisitaDialog open onOpenChange={vi.fn()} propiedadId={PROP.id} />)
    await screen.findByRole('heading', { name: '¿De dónde viene esta visita?' })
    await waitFor(() => expect(screen.queryByText('Asesor', { selector: 'li *' })).not.toBeInTheDocument())
  })
})
```

- [ ] **Paso 3: Correr y ver FALLAR.**
- [ ] **Paso 4: Implementar los pasos.** Cada paso recibe `{ estado, despachar }` (y lo que necesite).
  Estructura y textos EXACTOS del lienzo (pantalla `A-Agendar`):

```tsx
// components/visitas/agendar/PasoOrigen.tsx
'use client'
import { ORIGENES_VISITA, ORIGEN_INFO } from '@/lib/visitas/origen'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { cn } from '@/lib/utils'

export function PasoOrigen({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const info = estado.origen ? ORIGEN_INFO[estado.origen] : null
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">¿De dónde viene esta visita?</h2>
        <p className="text-sm text-muted-foreground">Con esto sabemos qué canal trae visitas que se concretan.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {ORIGENES_VISITA.map(o => (
          <button key={o} type="button" aria-pressed={estado.origen === o}
            onClick={() => despachar({ tipo: 'elegirOrigen', origen: o })}
            className={cn('flex min-h-[76px] flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition-colors',
              estado.origen === o ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
            <span className="font-semibold">{ORIGEN_INFO[o].etiqueta}</span>
            <span className="text-xs text-muted-foreground">{ORIGEN_INFO[o].ayuda}</span>
          </button>
        ))}
      </div>
      {info && info.detalle !== 'no' && (
        <label className="block space-y-1 text-sm">
          <span>{estado.origen === 'otro' ? '¿De dónde vino?' : '¿Cuál publicidad? (opcional)'}</span>
          <input value={estado.origenDetalle} maxLength={120}
            onChange={e => despachar({ tipo: 'detalleOrigen', texto: e.target.value })}
            placeholder={estado.origen === 'otro' ? 'Ej: recomendación de un vecino' : 'Ej: Google'}
            className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
        </label>
      )}
    </div>
  )
}
```

```tsx
// components/visitas/agendar/PasoPropiedad.tsx
'use client'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { EstadoAgendar, AccionAgendar, PropiedadElegida } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { cn } from '@/lib/utils'

interface PropiedadApi { id: string; address: string; neighborhood: string | null; foto: string | null; assigned_to: string | null }

export function PasoPropiedad({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const [texto, setTexto] = useState('')
  const [lista, setLista] = useState<PropiedadApi[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vigente = true
    const t = setTimeout(async () => {
      const r = await leerRespuesta<PropiedadApi[]>(await fetch(`/api/visits/propiedades?q=${encodeURIComponent(texto)}`))
      if (!vigente) return
      if (r.ok) { setLista(r.data); setError(null) } else setError(r.error)
    }, 300)
    return () => { vigente = false; clearTimeout(t) }
  }, [texto])

  const elegir = (p: PropiedadApi) => {
    const propiedad: PropiedadElegida = { id: p.id, address: p.address, neighborhood: p.neighborhood, foto: p.foto, asesorId: p.assigned_to }
    despachar({ tipo: 'elegirPropiedad', propiedad })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">¿Qué propiedad van a visitar?</h2>
      <label className="flex h-11 items-center gap-2 rounded-lg border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Buscar por dirección o barrio</span>
        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por dirección o barrio"
          className="flex-1 bg-transparent text-base outline-none" />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <ul className="space-y-2">
        {lista.map(p => (
          <li key={p.id}>
            <button type="button" aria-pressed={estado.propiedad?.id === p.id} onClick={() => elegir(p)}
              className={cn('flex w-full items-center gap-3 rounded-xl p-2 text-left',
                estado.propiedad?.id === p.id ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
              {p.foto
                ? <img src={p.foto} alt="" className="h-12 w-16 rounded-md object-cover" />
                : <span className="h-12 w-16 rounded-md bg-secondary" aria-hidden="true" />}
              <span className="flex flex-col">
                <span className="font-semibold">{p.address}</span>
                <span className="text-xs text-muted-foreground">{p.neighborhood ?? ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {lista.length === 0 && !error && <p className="text-sm text-muted-foreground">No hay propiedades captadas disponibles con ese texto.</p>}
    </div>
  )
}
```

```tsx
// components/visitas/agendar/PasoPersona.tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { filtrarInteresados, type Interesado } from '@/lib/visitas/interesados'
import { formatearFechaHora } from '@/lib/visitas/horario'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { cn } from '@/lib/utils'

function haceCuanto(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  if (dias < 7) return `hace ${dias} días`
  const semanas = Math.floor(dias / 7)
  return semanas === 1 ? 'hace 1 semana' : `hace ${semanas} semanas`
}

export function PasoPersona({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const conLista = estado.origen === 'portal' || estado.origen === 'publicidad_meta' || estado.origen === 'publicidad_paga'
  const [manual, setManual] = useState(!conLista || estado.persona?.tipo === 'nueva')
  const [lista, setLista] = useState<Interesado[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  useEffect(() => {
    if (!conLista || !estado.propiedad || !estado.origen) return
    let vigente = true
    fetch(`/api/properties/${estado.propiedad.id}/interesados?origen=${estado.origen}`)
      .then(r => leerRespuesta<Interesado[]>(r))
      .then(r => { if (!vigente) return; if (r.ok) setLista(r.data); else setError(r.error) })
    return () => { vigente = false }
  }, [conLista, estado.propiedad, estado.origen])

  const visibles = useMemo(() => filtrarInteresados(lista ?? [], texto), [lista, texto])
  const nueva = estado.persona?.tipo === 'nueva' ? estado.persona : { tipo: 'nueva' as const, nombre: '', telefono: '', email: '' }
  const cambiarNueva = (campo: 'nombre' | 'telefono' | 'email', valor: string) =>
    despachar({ tipo: 'elegirPersona', persona: { ...nueva, [campo]: valor } })
  const elegida = estado.persona && estado.persona.tipo !== 'nueva' ? estado.persona : null

  const titulo = estado.origen === 'portal' ? '¿Quién consultó?' : conLista ? '¿Quién se registró?' : '¿Quién viene?'
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{titulo}</h2>
        {conLista && lista && !manual && (
          <p className="text-sm text-muted-foreground">
            {estado.origen === 'portal'
              ? `${lista.length} ${lista.length === 1 ? 'persona consultó' : 'personas consultaron'} por ${estado.propiedad?.address}. Las más recientes primero.`
              : `${lista.length} ${lista.length === 1 ? 'persona se registró' : 'personas se registraron'} en la landing.`}
          </p>
        )}
      </div>

      {conLista && !manual && (
        <>
          <label className="flex h-11 items-center gap-2 rounded-lg border bg-card px-3">
            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Buscar por nombre o teléfono</span>
            <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Buscar por nombre o teléfono"
              className="flex-1 bg-transparent text-base outline-none" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {lista === null && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
          {lista !== null && visibles.length === 0 && <p className="text-sm text-muted-foreground">Nadie con ese nombre o teléfono.</p>}
          <ul className="space-y-2">
            {visibles.map(i => {
              const activa = elegida?.id === i.id
              const nota = i.visitaActiva ? `Ya tiene visita ${formatearFechaHora(i.visitaActiva.scheduled_at)}`
                : !i.tieneTelefono ? 'Falta el teléfono' : i.consultas > 1 ? `Consultó ${i.consultas} veces` : null
              return (
                <li key={i.clave}>
                  <button type="button" aria-pressed={activa}
                    onClick={() => despachar({ tipo: 'elegirPersona', persona: { tipo: i.tipo, id: i.id, nombre: i.nombre, telefono: i.telefono, detalle: i.detalle } })}
                    className={cn('flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left',
                      activa ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{i.nombre}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {i.detalle} · {haceCuanto(i.fecha)}{i.telefono ? ` · ${i.telefono}` : ''}
                      </span>
                    </span>
                    {nota && <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">{nota}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
          {elegida && !elegida.telefono && (
            <label className="block space-y-1 text-sm">
              <span>Teléfono de {elegida.nombre} (el portal no lo pasó)</span>
              <input type="tel" inputMode="tel" value={estado.telefonoFaltante}
                onChange={e => despachar({ tipo: 'telefonoFaltante', texto: e.target.value })}
                placeholder="11 5555-5555" className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
            </label>
          )}
          <button type="button" onClick={() => { setManual(true); despachar({ tipo: 'elegirPersona', persona: null }) }}
            className="h-10 rounded-lg border border-dashed px-3 text-sm">
            No está en la lista — cargar a mano
          </button>
        </>
      )}

      {manual && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>Nombre y apellido</span>
            <input value={nueva.nombre} onChange={e => cambiarNueva('nombre', e.target.value)} autoComplete="off"
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm">
            <span>Teléfono (WhatsApp)</span>
            <input type="tel" inputMode="tel" value={nueva.telefono} onChange={e => cambiarNueva('telefono', e.target.value)}
              placeholder="11 5555-5555" className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span>Email (opcional)</span>
            <input type="email" inputMode="email" value={nueva.email} onChange={e => cambiarNueva('email', e.target.value)}
              className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
          </label>
          {conLista && (
            <button type="button" onClick={() => { setManual(false); despachar({ tipo: 'elegirPersona', persona: null }) }}
              className="text-left text-sm text-brand sm:col-span-2">Volver a la lista</button>
          )}
        </div>
      )}
    </div>
  )
}
```

```tsx
// components/visitas/agendar/PasoCuando.tsx
'use client'
import { useEffect, useState } from 'react'
import { SelectorDiaHora } from '@/components/visitas/SelectorDiaHora'
import { construirInstante, fechaEnArgentina } from '@/lib/visitas/horario'
import { avisosDeChoque } from '@/lib/visitas/choques'
import type { VisitaAgendaR } from '@/lib/visitas/tipos'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'

export function PasoCuando({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const [visitasDelDia, setVisitasDelDia] = useState<VisitaAgendaR[]>([])
  const propiedadId = estado.propiedad?.id ?? null

  useEffect(() => {
    if (!estado.fecha || !propiedadId) return
    let vigente = true
    const qs = new URLSearchParams({ fecha: estado.fecha, propiedad: propiedadId, ...(estado.asesorId ? { asesor: estado.asesorId } : {}) })
    fetch(`/api/visits/agenda-del-asesor?${qs}`).then(r => leerRespuesta<VisitaAgendaR[]>(r))
      .then(r => { if (vigente && r.ok) setVisitasDelDia(r.data) })
    return () => { vigente = false }
  }, [estado.fecha, estado.asesorId, propiedadId])

  const instante = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
  const avisos = instante && propiedadId
    ? avisosDeChoque({ instante, propiedadId, asesorId: estado.asesorId, visitas: visitasDelDia })
    : []

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">¿Cuándo?</h2>
        <p className="text-sm text-muted-foreground">Horario de Argentina. Te avisamos si el asesor ya tiene algo a esa hora.</p>
      </div>
      <SelectorDiaHora hoy={fechaEnArgentina(new Date())} fecha={estado.fecha} hora={estado.hora}
        onFecha={f => despachar({ tipo: 'elegirFecha', fecha: f })}
        onHora={h => despachar({ tipo: 'elegirHora', hora: h })} avisos={avisos} />
    </div>
  )
}
```

```tsx
// components/visitas/agendar/PasoAsesor.tsx
'use client'
import { useEffect, useState } from 'react'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'
import { leerRespuesta } from './leer-respuesta'
import { cn } from '@/lib/utils'

export function PasoAsesor({ estado, despachar }: { estado: EstadoAgendar; despachar: (a: AccionAgendar) => void }) {
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  useEffect(() => {
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setAsesores(r.data ?? []) })
  }, [])
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">¿Quién la muestra?</h2>
      <div role="radiogroup" aria-label="Asesor" className="grid gap-2 sm:grid-cols-2">
        {asesores.map(a => (
          <button key={a.id} type="button" role="radio" aria-checked={estado.asesorId === a.id}
            onClick={() => despachar({ tipo: 'elegirAsesor', asesorId: a.id })}
            className={cn('flex min-h-14 items-center gap-3 rounded-xl px-4 text-left',
              estado.asesorId === a.id ? 'border-2 border-brand bg-brand-soft/40' : 'border bg-card hover:bg-secondary')}>
            <span className="font-semibold">{a.full_name}</span>
            {estado.propiedad?.asesorId === a.id && <span className="text-xs text-muted-foreground">asesor de la propiedad</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
```

```tsx
// components/visitas/agendar/PasoConfirmar.tsx
'use client'
import { construirInstante, formatearFechaLarga } from '@/lib/visitas/horario'
import { ORIGEN_INFO } from '@/lib/visitas/origen'
import type { EstadoAgendar, AccionAgendar } from '@/lib/visitas/agendar-estado'

export function PasoConfirmar({ estado, despachar, nombreAsesor, duplicado, error }: {
  estado: EstadoAgendar
  despachar: (a: AccionAgendar) => void
  nombreAsesor: string | null
  duplicado: { scheduled_at: string } | null
  error: string | null
}) {
  const instante = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
  const persona = estado.persona
  const filas: Array<[string, string]> = [
    ['Propiedad', estado.propiedad?.address ?? '—'],
    ['Origen', estado.origen ? `${ORIGEN_INFO[estado.origen].etiqueta}${estado.origenDetalle.trim() ? ` · ${estado.origenDetalle.trim()}` : ''}` : '—'],
    ['Persona', persona ? `${persona.nombre}${persona.tipo === 'nueva' ? ` · ${persona.telefono}` : ` · ${persona.telefono ?? estado.telefonoFaltante}`}` : '—'],
    ['Cuándo', instante ? formatearFechaLarga(instante) : '—'],
    ['Asesor', nombreAsesor ?? '—'],
  ]
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Revisá y agendá</h2>
      <dl className="divide-y rounded-xl border bg-card">
        {filas.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-3 text-sm">
            <dt className="text-muted-foreground">{k}</dt><dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">¿Ya está confirmada con la persona?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[{ v: true, t: 'Sí, confirmada' }, { v: false, t: 'No, a confirmar' }].map(o => (
            <button key={String(o.v)} type="button" aria-pressed={estado.confirmada === o.v}
              onClick={() => despachar({ tipo: 'confirmada', valor: o.v })}
              className={estado.confirmada === o.v ? 'h-11 rounded-lg border-2 border-brand bg-brand-soft/40 font-semibold' : 'h-11 rounded-lg border bg-card'}>
              {o.t}
            </button>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1 text-sm">
        <span>Notas (opcional)</span>
        <textarea value={estado.notas} maxLength={1000} onChange={e => despachar({ tipo: 'notas', texto: e.target.value })}
          className="min-h-20 w-full rounded-lg border bg-card px-3 py-2 text-base" />
      </label>
      {duplicado && (
        <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Esta persona ya tiene una visita el {formatearFechaLarga(duplicado.scheduled_at)}. Si igual querés agendar otra, tocá “Agendar igual”.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Paso 5: Implementar el armazón** (`AgendarVisitaDialog.tsx`):

```tsx
'use client'

/**
 * Ventana "Agendar visita" (diseño A — Claridad, pantalla A-Agendar del lienzo).
 * Lista de pasos a la izquierda (en el celular, barra de progreso arriba: el
 * diálogo base ya se vuelve hoja inferior por debajo de 640 px). Las reglas de
 * cada paso están en lib/visitas/agendar-estado.ts; el servidor revalida todo.
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  estadoInicial, reducirAgendar, pasosVisibles, siguientePaso, pasoAnterior, errorDelPaso, armarPedido,
  type PasoAgendar, type PropiedadElegida,
} from '@/lib/visitas/agendar-estado'
import { puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import { ORIGEN_INFO } from '@/lib/visitas/origen'
import { construirInstante, formatearFechaHora } from '@/lib/visitas/horario'
import type { Role } from '@/types/auth.types'
import { leerRespuesta } from './leer-respuesta'
import { PasoPropiedad } from './PasoPropiedad'
import { PasoOrigen } from './PasoOrigen'
import { PasoPersona } from './PasoPersona'
import { PasoCuando } from './PasoCuando'
import { PasoAsesor } from './PasoAsesor'
import { PasoConfirmar } from './PasoConfirmar'
import { cn } from '@/lib/utils'

const ETIQUETA: Record<PasoAgendar, string> = {
  propiedad: 'Propiedad', origen: 'Origen', persona: 'Persona', cuando: 'Día y hora', asesor: 'Asesor', confirmar: 'Confirmar',
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  propiedadId?: string
  onAgendada?: (visitaId: string) => void
}

interface PropiedadApi { id: string; address: string; neighborhood: string | null; foto: string | null; assigned_to: string | null }

export function AgendarVisitaDialog({ open, onOpenChange, propiedadId, onAgendada }: Props) {
  const router = useRouter()
  const [yo, setYo] = useState<{ id: string; role: Role } | null>(null)
  const [estado, despachar] = useReducer(reducirAgendar, estadoInicial({}))
  const [listo, setListo] = useState(false)
  const [errorPaso, setErrorPaso] = useState<string | null>(null)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [duplicado, setDuplicado] = useState<{ scheduled_at: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [nombreAsesor, setNombreAsesor] = useState<string | null>(null)
  const enviandoRef = useRef(false)

  // Al abrir: quién soy y, si viene de la ficha, la propiedad. Se reinicia TODO
  // (con `reiniciar`, así `propiedadFija` queda bien puesto desde el arranque).
  useEffect(() => {
    if (!open) { setListo(false); return }
    let vigente = true
    ;(async () => {
      // /api/auth/me devuelve el perfil PLANO ({ id, role, full_name }), no `{ data }`.
      let quien: { id: string; role: Role } | null = null
      try {
        const r = await fetch('/api/auth/me')
        const j = (await r.json()) as { id?: string; role?: Role }
        if (r.ok && j.id && j.role) quien = { id: j.id, role: j.role }
      } catch { /* sin sesión: el servidor rechaza el alta igual */ }
      let propiedad: PropiedadElegida | null = null
      if (propiedadId) {
        const r = await leerRespuesta<PropiedadApi[]>(await fetch(`/api/visits/propiedades?id=${propiedadId}`))
        const p = r.ok ? r.data[0] : undefined
        if (p) propiedad = { id: p.id, address: p.address, neighborhood: p.neighborhood, foto: p.foto, asesorId: p.assigned_to }
      }
      if (!vigente) return
      setYo(quien)
      despachar({
        tipo: 'reiniciar',
        estado: estadoInicial({ propiedad, asesorPropio: quien && !puedeVerTodasLasVisitas(quien.role) ? quien.id : null }),
      })
      setErrorPaso(null); setErrorEnvio(null); setDuplicado(null); setListo(true)
    })()
    return () => { vigente = false }
  }, [open, propiedadId])
```

  Continúa el componente:

```tsx
  const opciones = { puedeElegirAsesor: yo ? puedeVerTodasLasVisitas(yo.role) : false }
  const pasos = pasosVisibles(estado, opciones)
  const indice = pasos.indexOf(estado.paso)

  useEffect(() => {
    if (!estado.asesorId) { setNombreAsesor(null); return }
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setNombreAsesor(r.data.find(a => a.id === estado.asesorId)?.full_name ?? null) })
  }, [estado.asesorId])

  const valorDelPaso = (p: PasoAgendar): string => {
    if (p === 'propiedad') return estado.propiedad?.address ?? ''
    if (p === 'origen') return estado.origen ? ORIGEN_INFO[estado.origen].etiqueta : ''
    if (p === 'persona') return estado.persona?.nombre ?? ''
    if (p === 'cuando') {
      const i = estado.fecha && estado.hora ? construirInstante(estado.fecha, estado.hora) : null
      return i ? formatearFechaHora(i) : ''
    }
    if (p === 'asesor') return nombreAsesor ?? ''
    return ''
  }

  async function enviar(forzar: boolean) {
    if (enviandoRef.current) return
    const pedido = armarPedido(estado)
    if (!pedido) { setErrorEnvio('Faltan datos de la visita'); return }
    enviandoRef.current = true; setEnviando(true); setErrorEnvio(null)
    try {
      const r = await leerRespuesta<{ id: string }>(await fetch('/api/visits', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...pedido, ...(forzar ? { forzarDuplicado: true } : {}) }),
      }))
      if (r.ok) {
        toast.success('Visita agendada', {
          action: { label: 'Ver visita', onClick: () => router.push(`/visits/${r.data.id}`) },
        })
        onAgendada?.(r.data.id)
        onOpenChange(false)
        router.refresh()
        return
      }
      if (r.status === 409 && r.cuerpo.code === 'VISITA_DUPLICADA') {
        setDuplicado(r.cuerpo.visita as { scheduled_at: string })
        return
      }
      setErrorEnvio(r.error)
    } catch {
      setErrorEnvio('No hay conexión. Probá de nuevo.')
    } finally {
      enviandoRef.current = false; setEnviando(false)
    }
  }

  function avanzar() {
    const e = errorDelPaso(estado, estado.paso)
    if (e) { setErrorPaso(e); return }
    setErrorPaso(null)
    const sig = siguientePaso(estado, opciones)
    if (sig) despachar({ tipo: 'irA', paso: sig })
    else void enviar(duplicado !== null)
  }

  function volver() {
    setErrorPaso(null); setDuplicado(null)
    const ant = pasoAnterior(estado, opciones)
    if (ant) despachar({ tipo: 'irA', paso: ant })
  }

  const esUltimo = indice === pasos.length - 1
  const props = { estado, despachar }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-[900px]">
        <DialogTitle className="sr-only">Agendar visita</DialogTitle>
        <DialogDescription className="sr-only">Paso {indice + 1} de {pasos.length}: {ETIQUETA[estado.paso]}</DialogDescription>
        <div className="grid min-h-[560px] md:grid-cols-[236px_1fr]">
          <aside className="hidden flex-col gap-5 border-r bg-secondary/60 p-5 md:flex">
            <div>
              <p className="text-base font-semibold">Agendar visita</p>
              <p className="text-xs text-muted-foreground">Toma menos de un minuto</p>
            </div>
            <ol className="space-y-1">
              {pasos.map((p, i) => {
                const hecho = i < indice
                const actual = i === indice
                return (
                  <li key={p} aria-current={actual ? 'step' : undefined}
                    className={cn('flex items-center gap-3 rounded-lg px-2 py-2', actual && 'bg-card shadow-sm')}>
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      actual ? 'bg-brand text-brand-foreground' : hecho ? 'bg-foreground text-background' : 'bg-border text-muted-foreground')}>
                      {hecho ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className={cn('block text-sm', actual ? 'font-semibold' : 'text-foreground/80')}>{ETIQUETA[p]}</span>
                      {hecho && <span className="block truncate text-xs text-muted-foreground">{valorDelPaso(p)}</span>}
                    </span>
                  </li>
                )
              })}
            </ol>
          </aside>

          <div className="flex min-w-0 flex-col">
            <div className="h-1 bg-secondary md:hidden" aria-hidden="true">
              <div className="h-1 bg-brand transition-[width]" style={{ width: `${((indice + 1) / pasos.length) * 100}%` }} />
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {!listo ? <p className="text-sm text-muted-foreground">Cargando…</p> : (
                <>
                  {estado.paso === 'propiedad' && <PasoPropiedad {...props} />}
                  {estado.paso === 'origen' && <PasoOrigen {...props} />}
                  {estado.paso === 'persona' && <PasoPersona {...props} />}
                  {estado.paso === 'cuando' && <PasoCuando {...props} />}
                  {estado.paso === 'asesor' && <PasoAsesor {...props} />}
                  {estado.paso === 'confirmar' && (
                    <PasoConfirmar {...props} nombreAsesor={nombreAsesor} duplicado={duplicado} error={errorEnvio} />
                  )}
                  {errorPaso && <p role="alert" className="text-sm text-destructive">{errorPaso}</p>}
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
              <Button variant="outline" onClick={volver} disabled={indice <= 0 || enviando}>Atrás</Button>
              <Button onClick={avanzar} disabled={!listo || enviando} className="min-w-32 bg-brand text-brand-foreground hover:bg-brand/90">
                {enviando ? 'Agendando…' : esUltimo ? (duplicado ? 'Agendar igual' : 'Agendar') : 'Siguiente'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Paso 6: Correr el test de la Tarea 16 y ver PASAR.** Si la primera corrida falla con
  "Failed to start … worker" a los 60 s, reintentar una vez (CLAUDE.md § vitest en esta Mac).
- [ ] **Paso 7:** `npx tsc --noEmit -p tsconfig.visitas.json` y `npx eslint components/visitas` limpios.
- [ ] **Paso 8: Commit** — `feat(visitas): ventana paso a paso para agendar visitas`.

---

### Tarea 17: Botón "＋ Nuevo", botón de la ficha y el listado

**Files:**
- Create: `components/visitas/BotonNuevo.tsx`, `components/visitas/BotonAgendarVisita.tsx`
- Modify: `app/(dashboard)/layout.tsx` (~línea 119), `app/(dashboard)/properties/[id]/page.tsx` (~líneas 296-300),
  `app/(dashboard)/properties/page.tsx` (~líneas 887-906 + import), `app/(dashboard)/properties/_components/PropertyDetailModal.tsx` (sin cambio de props)
- Delete: `app/(dashboard)/properties/_components/ScheduleVisitDialog.tsx`
- Test: `components/visitas/BotonNuevo.test.tsx`

- [ ] **Paso 1: Test**

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('./agendar/AgendarVisitaDialog', () => ({ AgendarVisitaDialog: ({ open }: { open: boolean }) => open ? <div>ventana abierta</div> : null }))

import { BotonNuevo } from './BotonNuevo'

// userEvent SIN temporizadores simulados: con fake timers cuelga cualquier clic
// (CLAUDE.md § "Correr las pruebas en esta Mac").
describe('BotonNuevo', () => {
  it('el abogado no lo ve', () => {
    const { container } = render(<BotonNuevo role="abogado" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('un asesor ve "Agendar visita" y "Nueva tasación"', async () => {
    const user = userEvent.setup()
    render(<BotonNuevo role="asesor" />)
    await user.click(screen.getByRole('button', { name: /Nuevo/ }))
    expect(await screen.findByRole('menuitem', { name: 'Agendar visita' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Nueva tasación' })).toBeInTheDocument()
  })
  it('elegir "Agendar visita" abre la ventana', async () => {
    const user = userEvent.setup()
    render(<BotonNuevo role="asesor" />)
    await user.click(screen.getByRole('button', { name: /Nuevo/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Agendar visita' }))
    expect(await screen.findByText('ventana abierta')).toBeInTheDocument()
  })
  it('un coordinador no ve "Nueva tasación" (no la tiene en el menú)', async () => {
    const user = userEvent.setup()
    render(<BotonNuevo role="coordinador" />)
    await user.click(screen.getByRole('button', { name: /Nuevo/ }))
    expect(await screen.findByRole('menuitem', { name: 'Agendar visita' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Nueva tasación' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar**

```tsx
// components/visitas/BotonNuevo.tsx
'use client'

/**
 * "＋ Nuevo" de la barra superior (spec §3.1). Recibe el ROL como texto —nunca
 * íconos ni funciones desde el servidor: cruzar esa frontera tira la pantalla
 * entera (CLAUDE.md § "Un ícono de lucide NO cruza la frontera").
 * "Nueva tasación" se muestra solo si el rol ya la tiene en el menú lateral:
 * la fuente de verdad es getNavSections, no una lista repetida acá.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, CalendarPlus, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getNavSections, isCollapsible } from '@/lib/nav/sections'
import { puedeGestionarVisitas } from '@/lib/visitas/acceso'
import type { Role } from '@/types/auth.types'
import { AgendarVisitaDialog } from './agendar/AgendarVisitaDialog'

function tieneNuevaTasacion(role: Role): boolean {
  return getNavSections(role).some(g => g.entries.some(e =>
    isCollapsible(e) ? e.items.some(i => i.href === '/appraisal/new') : e.href === '/appraisal/new'))
}

export function BotonNuevo({ role }: { role: Role }) {
  const [agendar, setAgendar] = useState(false)
  const conTasacion = useMemo(() => tieneNuevaTasacion(role), [role])
  if (!puedeGestionarVisitas(role)) return null
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="h-9 gap-1.5 bg-foreground px-3 text-background hover:bg-foreground/90" aria-label="Nuevo">
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nuevo</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setAgendar(true)} className="min-h-11 gap-2">
            <CalendarPlus className="h-4 w-4" aria-hidden="true" />Agendar visita
          </DropdownMenuItem>
          {conTasacion && (
            <DropdownMenuItem asChild className="min-h-11 gap-2">
              <Link href="/appraisal/new"><ClipboardList className="h-4 w-4" aria-hidden="true" />Nueva tasación</Link>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AgendarVisitaDialog open={agendar} onOpenChange={setAgendar} />
    </>
  )
}
```

```tsx
// components/visitas/BotonAgendarVisita.tsx
'use client'
import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgendarVisitaDialog } from './agendar/AgendarVisitaDialog'

/** "Agendar visita" con la propiedad ya elegida (ficha de propiedad). */
export function BotonAgendarVisita({ propiedadId, onAgendada }: { propiedadId: string; onAgendada?: (id: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)} className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
        <CalendarPlus className="h-4 w-4" aria-hidden="true" />Agendar visita
      </Button>
      <AgendarVisitaDialog open={abierto} onOpenChange={setAbierto} propiedadId={propiedadId} onAgendada={onAgendada} />
    </>
  )
}
```

- [ ] **Paso 4: Layout** — en `app/(dashboard)/layout.tsx`, dentro de `<TopbarForRole>`, antes de
  `<UserMenu …/>`: `<BotonNuevo role={user.profile.role} />` (import de `@/components/visitas/BotonNuevo`).
  Verificar que el layout sigue siendo componente de servidor y que solo pasa el string del rol.
- [ ] **Paso 5: Ficha de propiedad** — en `app/(dashboard)/properties/[id]/page.tsx` reemplazar el
  bloque del encabezado por:

```tsx
      <div className="flex items-center justify-between gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
        <div className="flex items-center gap-2">
          {puedeAgendarVisita && <BotonAgendarVisita propiedadId={property.id} />}
          <AddTaskDialog entity={{ kind: 'property', id: property.id, label: property.address }} />
        </div>
      </div>
```

  con, cerca de `isAbogado` (~línea 251):

```tsx
  // Solo captadas y disponibles/reservadas; quién puede agendar lo decide la
  // misma regla que el servidor (lib/visitas/acceso). El servidor revalida.
  const puedeAgendarVisita = !!userInfo && puedeGestionarVisitas(userInfo.role as Role)
    && property.status === 'approved'
    && ['disponible', 'reservada'].includes(property.commercial_status ?? 'disponible')
```

  (imports: `BotonAgendarVisita`, `puedeGestionarVisitas`, `type Role`). Si `userInfo.role` no está
  tipado como `Role`, tiparlo en el `useState` existente.
- [ ] **Paso 6: Listado** — en `app/(dashboard)/properties/page.tsx` reemplazar `ScheduleVisitDialog`
  por `<AgendarVisitaDialog open={scheduleVisitOpen} onOpenChange={setScheduleVisitOpen} propiedadId={scheduleForPropertyId ?? undefined} />`
  y borrar su import. `git rm app/(dashboard)/properties/_components/ScheduleVisitDialog.tsx`.
  Correr `grep -rn "ScheduleVisitDialog" app components` → sin resultados.
- [ ] **Paso 7: Correr tests, tsc y eslint** de lo tocado.
- [ ] **Paso 8: Commit** — `feat(visitas): botón Nuevo arriba y Agendar visita en la ficha`.

---

### Tarea 18: Ficha de la visita con etapas, motivos e historial

**Files:**
- Rewrite: `app/(dashboard)/visits/[id]/page.tsx`
- Create: `components/visitas/ficha/AccionVisitaDialog.tsx`, `components/visitas/ficha/LineaDeTiempo.tsx`
- Rewrite tests: `app/(dashboard)/visits/[id]/page.test.tsx`, `app/(dashboard)/visits/[id]/page.movil.test.tsx`
- Delete: `app/(dashboard)/visits/_components/CompleteVisitDialog.tsx`, `CompleteVisitDialog.movil.test.tsx`

**Garantías que los tests viejos protegían y la ficha nueva CONSERVA** (reescribir los tests con
los textos nuevos, sin perder ninguna):
1. Cuatro estados: cargando · no encontrada (404, con link "Volver a visitas") · error de carga
   (500 o cuerpo no-JSON, con botón "Reintentar" que vuelve a pedir) · datos. Un 200 sin `data` es
   error, no pantalla vacía.
2. Encabezado: título y badge de estado se apilan en celular (`flex-col sm:flex-row`), el título
   puede encogerse (`min-w-0`) y el badge no (`shrink-0`).
3. Teléfono como `tel:` sin separadores y email como `mailto:` que parte (`break-all`); sin dato,
   sin enlace vacío.
4. Fecha legible: día de la semana y hora 24 h sin segundos → usar `formatearFechaLarga`.
5. La acción principal ocupa el ancho en celular (`w-full md:w-auto`).
6. Sin `container mx-auto py-6`.
7. El diálogo de acción no declara `max-h` propio ni `vh` (el techo lo pone el primitivo), las
   opciones de radio llegan a 44 px (`min-h-11`) y la etiqueta ocupa el renglón.

- [ ] **Paso 1: Reescribir `page.test.tsx`** (reemplazo completo):

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VisitDetailPage from './page'

/**
 * D30 — la ficha nunca se queda en "Cargando…": 404, 500, cuerpo no-JSON (504
 * con HTML del gateway) y 200 sin datos tienen su pantalla, con salida a /visits.
 * Más: las acciones de etapa piden lo que tienen que pedir antes de guardar.
 */
const ID = '66666666-6666-4666-8666-666666666666'
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '66666666-6666-4666-8666-666666666666' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function visita(p: Record<string, unknown> = {}) {
  return {
    id: ID, scheduled_at: '2026-08-05T15:00:00Z', status: 'scheduled', client_name: 'Cliente Uno',
    client_email: 'cliente@example.com', client_phone: '11-1111-1111', origin: 'portal', origin_detail: 'zonaprop',
    propiedad: { id: 'p1', address: 'Calle Falsa 123', neighborhood: 'Palermo', foto: null },
    asesor: { id: 'a1', full_name: 'Lucas' }, comprador: null, consulta: null, notes: null, completion_notes: null,
    outcome_reason: null, advisor_interest: null, reschedule_count: 0, created_by_ai: false,
    eventos: [{ id: 'e1', kind: 'creada', from_status: null, to_status: 'scheduled', from_scheduled_at: null,
      to_scheduled_at: null, reason: null, note: null, created_at: '2026-08-01T12:00:00Z', actor: 'Lucas',
      desde_asesor: null, hacia_asesor: null }],
    acciones: ['realizada', 'no_realizada', 'reprogramar', 'cambiar_asesor'],
    ...p,
  }
}
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })
let respuesta: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
let posteos: Array<{ url: string; body: unknown }> = []

beforeEach(() => {
  respuesta = async () => ok(visita())
  posteos = []
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posteos.push({ url, body: JSON.parse(String(init.body)) })
      return Promise.resolve(ok(visita({ status: 'no_show', outcome_reason: 'no_vino', acciones: ['reabrir'] })))
    }
    if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([]))
    if (url.startsWith('/api/visits/')) return respuesta()
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

describe('VisitDetailPage — la pantalla no se queda en "Cargando…" ante un fallo', () => {
  it('el camino feliz muestra propiedad, persona, origen e historial', async () => {
    render(<VisitDetailPage />)
    await screen.findByText('Calle Falsa 123')
    expect(screen.getByText('Cliente Uno')).toBeInTheDocument()
    expect(screen.getByText(/Consulta de portal · zonaprop/)).toBeInTheDocument()
    expect(screen.getByText('Creada')).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })
  it('un 404 dice que no se encontró la visita, con salida a /visits', async () => {
    respuesta = async () => ({ ok: false, status: 404, json: async () => ({ error: 'No encontramos la visita' }) })
    render(<VisitDetailPage />)
    await screen.findByText('No encontramos esta visita')
    expect(screen.getByText('← Volver a visitas')).toBeInTheDocument()
    expect(screen.getByText('Ver todas las visitas')).toBeInTheDocument()
  })
  it('un 500 dice que no se pudo cargar, y "Reintentar" la trae', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
      respuesta = async () => ok(visita())
      fireEvent.click(screen.getByText('Reintentar'))
      await screen.findByText('Calle Falsa 123')
    } finally { errores.mockRestore() }
  })
  it('un cuerpo que no es JSON (el 504 con HTML del gateway) tampoco la cuelga', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'") } })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
    } finally { errores.mockRestore() }
  })
  it('un 200 sin la visita adentro es un fallo, no una pantalla vacía', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ok(null)
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
    } finally { errores.mockRestore() }
  })
})

describe('VisitDetailPage — cambiar de etapa', () => {
  it('"No se realizó" exige un motivo antes de guardar, y después guarda y pinta la respuesta', async () => {
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'No se realizó' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elegí un motivo')).toBeInTheDocument()
    expect(posteos).toHaveLength(0)

    fireEvent.click(screen.getByRole('radio', { name: 'No vino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    expect(posteos[0]).toEqual({ url: `/api/visits/${ID}/estado`, body: { tipo: 'no_realizada', motivo: 'no_vino', detalle: '' } })
    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeInTheDocument()
  })
})
```

  Y `page.movil.test.tsx` (reemplazo completo):

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import VisitDetailPage from './page'

/**
 * La ficha de visita en un teléfono (es la pantalla que el asesor abre parado
 * en la puerta de la propiedad, con una mano). Se fijan clases y nombres
 * accesibles porque estos problemas no los atrapa un test de comportamiento.
 */
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '66666666-6666-4666-8666-666666666666' }) }))

const VISITA = {
  id: '66666666-6666-4666-8666-666666666666', status: 'pending_confirmation', scheduled_at: '2026-08-01T15:30:45Z',
  client_name: 'Juliana Rodríguez', client_email: 'juliana.rodriguez@gmail.com', client_phone: '+54 9 11 5555-5555',
  origin: 'cartel', origin_detail: null,
  propiedad: { id: 'p1', address: 'Av. Rivadavia 5400, piso 8 A, Caballito', neighborhood: null, foto: null },
  asesor: null, comprador: null, consulta: null, notes: null, completion_notes: null, outcome_reason: null,
  advisor_interest: null, reschedule_count: 0, created_by_ai: false, eventos: [],
  acciones: ['confirmar', 'reprogramar', 'cancelar', 'cambiar_asesor'],
}
let visita: Record<string, unknown>

beforeEach(() => {
  visita = { ...VISITA }
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ data: visita }) })))
})

describe('ficha de visita — el encabezado no aplasta al estado', () => {
  it('el título y el badge se apilan en celular y vuelven a fila desde sm', async () => {
    render(<VisitDetailPage />)
    const titulo = await screen.findByRole('heading', { name: VISITA.propiedad.address })
    const cabecera = titulo.closest('header') as HTMLElement
    expect(cabecera.className).toContain('flex-col')
    expect(cabecera.className).toContain('gap-2')
    expect(cabecera.className).toContain('sm:flex-row')
  })
  it('el bloque del título puede encogerse y el badge no', async () => {
    render(<VisitDetailPage />)
    const titulo = await screen.findByRole('heading', { name: VISITA.propiedad.address })
    expect(titulo.closest('.min-w-0')).toBeTruthy()
    expect(titulo.className).toContain('break-words')
    expect(screen.getByText('A confirmar').className).toContain('shrink-0')
  })
})

describe('ficha de visita — el cliente se puede llamar desde el teléfono', () => {
  it('el número es un enlace tel: con los separadores fuera', async () => {
    render(<VisitDetailPage />)
    const tel = await screen.findByRole('link', { name: VISITA.client_phone })
    expect(tel).toHaveAttribute('href', 'tel:+5491155555555')
    expect(tel.className).toContain('max-md:min-h-11')
  })
  it('el mail es un enlace mailto: y parte si no entra', async () => {
    render(<VisitDetailPage />)
    const mail = await screen.findByRole('link', { name: VISITA.client_email })
    expect(mail).toHaveAttribute('href', `mailto:${VISITA.client_email}`)
    expect(mail.className).toContain('break-all')
  })
  it('sin teléfono ni mail no dibuja enlaces vacíos', async () => {
    visita = { ...VISITA, client_email: null, client_phone: null }
    render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.propiedad.address })
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
  })
})

describe('ficha de visita — la fecha se lee, no se descifra', () => {
  it('día de la semana y hora argentina en 24 h, sin segundos', async () => {
    render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.propiedad.address })
    expect(screen.getByText('sábado 1 de agosto, 12:30')).toBeInTheDocument()
  })
})

describe('ficha de visita — la acción principal ocupa el ancho en celular', () => {
  it('"Confirmar visita" es una barra de lado a lado por debajo de md', async () => {
    render(<VisitDetailPage />)
    expect((await screen.findByRole('button', { name: 'Confirmar visita' })).className).toContain('max-md:w-full')
  })
  it('con la visita pasada, "Se realizó" también', async () => {
    visita = { ...VISITA, status: 'scheduled', acciones: ['realizada', 'no_realizada', 'reprogramar', 'cambiar_asesor'] }
    render(<VisitDetailPage />)
    expect((await screen.findByRole('button', { name: 'Se realizó' })).className).toContain('max-md:w-full')
  })
})

describe('ficha de visita — el marco es el del resto de las pantallas', () => {
  it('no vuelve a envolver el contenido en `container mx-auto py-6`', async () => {
    const { container } = render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.propiedad.address })
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**
- [ ] **Paso 3: Implementar `AccionVisitaDialog.tsx`** — un diálogo para todas las acciones:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SelectorDiaHora } from '@/components/visitas/SelectorDiaHora'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { MOTIVOS_NO_REALIZADA, MOTIVO_ETIQUETA, INTERESES, INTERES_ETIQUETA, type TipoAccion, type MotivoNoRealizada, type Interes } from '@/lib/visitas/transiciones'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import type { VisitaDetalle, EventoVisitaR } from '@/lib/visitas/tipos'

export type VisitaConHistorial = VisitaDetalle & { eventos: EventoVisitaR[]; acciones: TipoAccion[] }

const TITULO: Record<TipoAccion, string> = {
  confirmar: 'Confirmar visita', reprogramar: 'Reprogramar', cancelar: 'Cancelar visita',
  realizada: 'Se realizó', no_realizada: 'No se realizó', cambiar_asesor: 'Cambiar asesor', reabrir: 'Reabrir visita',
}

export function AccionVisitaDialog({ visita, accion, onClose, onHecho }: {
  visita: VisitaConHistorial
  accion: TipoAccion | null
  onClose: () => void
  onHecho: (v: VisitaConHistorial) => void
}) {
  const [motivo, setMotivo] = useState<MotivoNoRealizada | null>(null)
  const [detalle, setDetalle] = useState('')
  const [interes, setInteres] = useState<Interes | null>(null)
  const [notas, setNotas] = useState('')
  const [fecha, setFecha] = useState<string | null>(null)
  const [hora, setHora] = useState<string | null>(null)
  const [asesorId, setAsesorId] = useState<string>('')
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Cada vez que se abre con otra acción, arranca limpio: un motivo elegido para
  // "Cancelar" no puede quedar marcado al abrir "No se realizó".
  useEffect(() => {
    setMotivo(null); setDetalle(''); setInteres(null); setNotas('')
    setFecha(null); setHora(null); setAsesorId(''); setError(null)
  }, [accion])

  useEffect(() => {
    if (accion !== 'cambiar_asesor' || asesores.length > 0) return
    let vigente = true
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (vigente && r.ok) setAsesores(r.data ?? []) })
    return () => { vigente = false }
  }, [accion, asesores.length])

  function cuerpo(): Record<string, unknown> | string {
    switch (accion) {
      case 'confirmar': return { tipo: 'confirmar' }
      case 'realizada': return { tipo: 'realizada', interes, notas }
      case 'no_realizada':
      case 'cancelar':
        if (!motivo) return 'Elegí un motivo'
        if (motivo === 'otro' && detalle.trim().length < 3) return 'Contanos el motivo'
        return { tipo: accion, motivo, detalle }
      case 'reprogramar':
        if (!fecha || !hora) return 'Elegí el nuevo día y la hora'
        return { tipo: 'reprogramar', fecha, hora }
      case 'cambiar_asesor':
        if (!asesorId) return 'Elegí el asesor'
        return { tipo: 'cambiar_asesor', asesorId }
      case 'reabrir':
        if (detalle.trim().length < 3) return 'Contanos por qué la reabrís'
        return { tipo: 'reabrir', motivo: detalle }
      default: return 'Acción desconocida'
    }
  }

  async function guardar() {
    const b = cuerpo()
    if (typeof b === 'string') { setError(b); return }
    setGuardando(true); setError(null)
    try {
      const r = await leerRespuesta<VisitaConHistorial>(await fetch(`/api/visits/${visita.id}/estado`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b),
      }))
      if (!r.ok) { setError(r.error); return }
      toast.success('Listo')
      onHecho(r.data)
      onClose()
    } finally {
      setGuardando(false)
    }
  }

  const opcion = (activa: boolean) => `flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left ${activa ? 'border-2 border-brand bg-brand-soft/40 font-semibold' : 'bg-card'}`

  return (
    <Dialog open={accion !== null} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{accion ? TITULO[accion] : ''}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {accion === 'confirmar' && <p className="text-sm">¿La persona confirmó que viene?</p>}
          {accion === 'realizada' && (
            <>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">¿Cómo viste el interés?</legend>
                {INTERESES.map(i => (
                  <button key={i} type="button" role="radio" aria-checked={interes === i} onClick={() => setInteres(i)} className={opcion(interes === i)}>
                    {INTERES_ETIQUETA[i]}
                  </button>
                ))}
              </fieldset>
              <label className="block space-y-1 text-sm"><span>Notas (opcional)</span>
                <textarea value={notas} maxLength={1000} onChange={e => setNotas(e.target.value)} className="min-h-20 w-full rounded-lg border bg-card px-3 py-2 text-base" />
              </label>
            </>
          )}
          {(accion === 'no_realizada' || accion === 'cancelar') && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">¿Por qué?</legend>
              {MOTIVOS_NO_REALIZADA.map(m => (
                <button key={m} type="button" role="radio" aria-checked={motivo === m} onClick={() => setMotivo(m)} className={opcion(motivo === m)}>
                  {MOTIVO_ETIQUETA[m]}
                </button>
              ))}
              {motivo === 'otro' && (
                <input value={detalle} maxLength={500} onChange={e => setDetalle(e.target.value)} placeholder="Contanos el motivo"
                  className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
              )}
            </fieldset>
          )}
          {accion === 'reprogramar' && (
            <SelectorDiaHora hoy={fechaEnArgentina(new Date())} fecha={fecha} hora={hora} onFecha={setFecha} onHora={setHora} avisos={[]} />
          )}
          {accion === 'cambiar_asesor' && (
            <div role="radiogroup" aria-label="Asesor" className="space-y-2">
              {asesores.filter(a => a.id !== visita.advisor_id).map(a => (
                <button key={a.id} type="button" role="radio" aria-checked={asesorId === a.id} onClick={() => setAsesorId(a.id)} className={opcion(asesorId === a.id)}>
                  {a.full_name}
                </button>
              ))}
            </div>
          )}
          {accion === 'reabrir' && (
            <label className="block space-y-1 text-sm"><span>¿Por qué la reabrís?</span>
              <input value={detalle} maxLength={500} onChange={e => setDetalle(e.target.value)} className="h-11 w-full rounded-lg border bg-card px-3 text-base" />
            </label>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Volver</Button>
          <Button onClick={guardar} disabled={guardando} className="bg-brand text-brand-foreground hover:bg-brand/90">
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Paso 4: Implementar `LineaDeTiempo.tsx`**

```tsx
'use client'
import { formatearFechaHora } from '@/lib/visitas/horario'
import { MOTIVO_ETIQUETA, type MotivoNoRealizada } from '@/lib/visitas/transiciones'
import type { EventoVisitaR } from '@/lib/visitas/tipos'

const TEXTO: Record<string, string> = {
  creada: 'Creada', confirmada: 'Confirmada', reprogramada: 'Reprogramada', realizada: 'Se realizó',
  no_realizada: 'No se realizó', cancelada: 'Cancelada', asesor_cambiado: 'Cambió el asesor',
  reabierta: 'Reabierta', estado_cambiado: 'Cambió el estado',
}

function detalle(e: EventoVisitaR): string | null {
  if (e.kind === 'reprogramada' && e.from_scheduled_at && e.to_scheduled_at) {
    return `${formatearFechaHora(e.from_scheduled_at)} → ${formatearFechaHora(e.to_scheduled_at)}`
  }
  if (e.kind === 'asesor_cambiado') return `${e.desde_asesor ?? 'sin asesor'} → ${e.hacia_asesor ?? 'sin asesor'}`
  if (e.reason) return MOTIVO_ETIQUETA[e.reason as MotivoNoRealizada] ?? e.reason
  return e.note
}

export function LineaDeTiempo({ eventos }: { eventos: EventoVisitaR[] }) {
  if (eventos.length === 0) return <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
  return (
    <ol className="space-y-3">
      {eventos.map(e => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />
          <span className="min-w-0">
            <span className="font-medium">{TEXTO[e.kind] ?? e.kind}</span>
            <span className="text-muted-foreground"> · {formatearFechaHora(e.created_at)}{e.actor ? ` · ${e.actor}` : ''}</span>
            {detalle(e) && <span className="block break-words text-muted-foreground">{detalle(e)}</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
```

- [ ] **Paso 5: Reescribir `page.tsx`** (reemplazo completo):

```tsx
'use client'

/**
 * Ficha de una visita (spec §3.3): quién, cuándo, de dónde vino, en qué etapa
 * está, qué se puede hacer AHORA (lo calcula el servidor con su hora) y todo lo
 * que pasó (historial que escribe el trigger de la base).
 *
 * Garantías heredadas de la ficha anterior, fijadas por sus tests: nunca queda
 * en "Cargando…" (404, error y cuerpo no-JSON tienen su pantalla); el link de
 * vuelta existe en todos los estados; en celular el título y el estado se
 * apilan, el teléfono y el mail se tocan, y la acción principal ocupa el ancho.
 */
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AccionVisitaDialog, type VisitaConHistorial } from '@/components/visitas/ficha/AccionVisitaDialog'
import { LineaDeTiempo } from '@/components/visitas/ficha/LineaDeTiempo'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import { ORIGEN_INFO } from '@/lib/visitas/origen'
import { ESTADO_ETIQUETA, MOTIVO_ETIQUETA, INTERES_ETIQUETA, type TipoAccion, type EstadoVisita } from '@/lib/visitas/transiciones'
import { cn } from '@/lib/utils'

type Fase =
  | { tipo: 'cargando' }
  | { tipo: 'no_encontrada' }
  | { tipo: 'error' }
  | { tipo: 'lista'; visita: VisitaConHistorial }

const TEXTO_ACCION: Record<TipoAccion, string> = {
  confirmar: 'Confirmar visita', realizada: 'Se realizó', no_realizada: 'No se realizó', reprogramar: 'Reprogramar',
  cancelar: 'Cancelar', cambiar_asesor: 'Cambiar asesor', reabrir: 'Reabrir',
}
/** Si ya pasó, lo primero es decir si se hizo; si no, confirmarla. */
const PRIORIDAD: TipoAccion[] = ['realizada', 'confirmar', 'reprogramar', 'reabrir']

const COLOR_ESTADO: Record<EstadoVisita, string> = {
  pending_confirmation: 'bg-amber-50 text-amber-900',
  scheduled: 'bg-brand-soft text-brand',
  completed: 'bg-emerald-50 text-emerald-900',
  no_show: 'bg-red-50 text-red-900',
  cancelled: 'bg-secondary text-muted-foreground',
}

function Volver() {
  return <Link href="/visits" className="text-sm text-muted-foreground hover:text-foreground">← Volver a visitas</Link>
}

const MARCO = 'w-full max-w-4xl mx-auto space-y-6 pb-10'

export default function VisitDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [fase, setFase] = useState<Fase>({ tipo: 'cargando' })
  const [accion, setAccion] = useState<TipoAccion | null>(null)

  const cargar = useCallback(async () => {
    setFase({ tipo: 'cargando' })
    try {
      const r = await leerRespuesta<VisitaConHistorial | null>(await fetch(`/api/visits/${id}`))
      if (!r.ok) {
        if (r.status === 404) { setFase({ tipo: 'no_encontrada' }); return }
        console.error('[visita] no se pudo cargar:', r.error)
        setFase({ tipo: 'error' })
        return
      }
      if (!r.data) { console.error('[visita] la respuesta no trae la visita'); setFase({ tipo: 'error' }); return }
      setFase({ tipo: 'lista', visita: r.data })
    } catch (e) {
      console.error('[visita] no se pudo cargar:', e)
      setFase({ tipo: 'error' })
    }
  }, [id])

  useEffect(() => { void cargar() }, [cargar])

  if (fase.tipo === 'cargando') {
    return <div className={MARCO}><Volver /><p className="text-sm text-muted-foreground">Cargando…</p></div>
  }
  if (fase.tipo === 'no_encontrada') {
    return (
      <div className={MARCO}>
        <Volver />
        <p className="font-medium">No encontramos esta visita</p>
        <Link href="/visits" className="text-sm text-brand">Ver todas las visitas</Link>
      </div>
    )
  }
  if (fase.tipo === 'error') {
    return (
      <div className={MARCO}>
        <Volver />
        <p className="font-medium">No pudimos cargar la visita</p>
        <Button variant="outline" onClick={() => void cargar()}>Reintentar</Button>
      </div>
    )
  }

  const v = fase.visita
  const principal = PRIORIDAD.find(a => v.acciones.includes(a)) ?? null
  const secundarias = v.acciones.filter(a => a !== principal)
  const telefono = v.client_phone?.trim() || null
  const email = v.client_email?.trim() || null

  return (
    <div className={MARCO}>
      <Volver />
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="break-words text-2xl font-semibold">{v.propiedad?.address ?? 'Visita'}</h1>
          <p className="text-sm text-muted-foreground">{formatearFechaLarga(v.scheduled_at)}</p>
        </div>
        <span className={cn('shrink-0 self-start rounded-full px-3 py-1 text-xs font-semibold', COLOR_ESTADO[v.status])}>
          {ESTADO_ETIQUETA[v.status]}
        </span>
      </header>

      {(principal || secundarias.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {principal && (
            <Button onClick={() => setAccion(principal)} className="max-md:w-full max-md:min-h-11 bg-brand text-brand-foreground hover:bg-brand/90">
              {TEXTO_ACCION[principal]}
            </Button>
          )}
          {secundarias.map(a => (
            <Button key={a} variant="outline" onClick={() => setAccion(a)} className="max-md:min-h-11">{TEXTO_ACCION[a]}</Button>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Persona</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-semibold">{v.client_name}</p>
            {telefono && (
              <a href={`tel:${telefono.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 text-brand max-md:min-h-11">
                <Phone className="h-4 w-4" aria-hidden="true" />{telefono}
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center gap-2 break-all text-brand max-md:min-h-11">
                <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{email}
              </a>
            )}
            {v.origin && (
              <p>Origen: {ORIGEN_INFO[v.origin].etiqueta}{v.origin_detail ? ` · ${v.origin_detail}` : ''}</p>
            )}
            {v.comprador && (
              <p className="text-muted-foreground">Comprador{v.comprador.lead_number ? ` #${v.comprador.lead_number}` : ''}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Visita</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Asesor: {v.asesor?.full_name ?? 'Sin asesor'}</p>
            {v.reschedule_count > 0 && <p>Reprogramada {v.reschedule_count} {v.reschedule_count === 1 ? 'vez' : 'veces'}</p>}
            {v.created_by_ai && <p className="text-muted-foreground">La propuso el agente de WhatsApp</p>}
            {v.notes && <p className="whitespace-pre-line text-muted-foreground">{v.notes}</p>}
            {v.outcome_reason && <p>Motivo: {MOTIVO_ETIQUETA[v.outcome_reason]}</p>}
            {v.advisor_interest && <p>Interés: {INTERES_ETIQUETA[v.advisor_interest]}</p>}
            {v.completion_notes && <p className="whitespace-pre-line">{v.completion_notes}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial</CardTitle></CardHeader>
        <CardContent><LineaDeTiempo eventos={v.eventos} /></CardContent>
      </Card>

      <AccionVisitaDialog
        visita={v}
        accion={accion}
        onClose={() => setAccion(null)}
        onHecho={nueva => setFase({ tipo: 'lista', visita: nueva })}
      />
    </div>
  )
}
```

  Nota del test de etapa: el diálogo manda `detalle: ''` cuando el motivo no es "otro"; la ruta
  lo acepta (`nullish`) y `aplicarAccion` lo guarda como `null`.
- [ ] **Paso 6: Borrar** `CompleteVisitDialog.tsx` y su test movil (`git rm`). `grep -rn "CompleteVisitDialog" app components` → nada.
- [ ] **Paso 7: Correr tests, tsc, eslint.**
- [ ] **Paso 8: Commit** — `feat(visitas): ficha de visita con etapas, motivos e historial`.

---

### Tarea 19: Verificación, auditoría, QA, despliegue y cierre (Etapas 5 y 6 del protocolo)

- [ ] **Paso 1: Suite completa y tipos** — `npx vitest run --config vitest.visitas.config.ts`,
  `npx vitest run --config vitest.agente-prueba.config.ts`, `npx tsc --noEmit -p tsconfig.visitas.json`,
  `npx eslint lib/visitas components/visitas app/api/visits "app/api/properties/[id]/interesados" "app/(dashboard)/visits/[id]"`.
  Pegar el resumen de cada salida en el reporte.
- [ ] **Paso 2: Rendimiento (presupuestos de la spec §8 que aplican a esta entrega)** —
  `scripts/_perf-visitas.ts` (sin commitear): con `EXPLAIN (ANALYZE, BUFFERS)` confirmar que la
  consulta de interesados por propiedad usa `idx_portal_inquiries_property` o
  `idx_portal_inquiries_property_phone_norm`, y la de visitas activas usa
  `idx_property_visits_property_when`. En la vista previa (Paso 5), 30 llamadas en caliente a
  `/api/properties/<Entre Ríos>/interesados?origen=portal` (98 consultas) y a `GET /api/visits/<id>`:
  p95 < 1,5 s. Anotar p50/p95.
- [ ] **Paso 3: Revisión adversarial** — subagente `feature-dev:code-reviewer` sobre
  `git diff origin/main...HEAD` buscando bugs, permisos, casos borde y consumidores olvidados de
  `property_visits` (estados, la política de lectura, `PUT /api/visits/[id]` borrado). Verificar
  cada hallazgo antes de aplicarlo; lo aplicado vuelve a la Tarea correspondiente.
- [ ] **Paso 4: Revisión de seguridad** — `/security-review` (rutas nuevas con datos personales,
  permisos por rol, filtro `or()` con ids, inyección en la búsqueda).
- [ ] **Paso 5: PR** — `git push -u origin feat/sistema-visitas` y `gh pr create --base main` con el
  resumen y la tabla de criterios. Esperar la vista previa
  (`https://deploy-preview-<N>--inmobiliariadiegoferreyra.netlify.app`, `gh pr checks <N>`).
- [ ] **Paso 6: QA con el navegador de Claude** (`scripts/navegador-claude.sh abrir <preview>` +
  `scripts/navegador-claude-login.ts`), quitando el "Netlify Drawer" en cada página. Recorrer los
  **criterios 1 a 11** de la spec, uno por uno, con captura y `select` de verificación:
  1. "＋ Nuevo" por rol (cambiar rol de `claude.qa@inmodf.com.ar` con `UPDATE profiles`; dejarlo en `admin`).
  2. Botón en la ficha (Doblas 248 sí; una `vendida` no).
  3. Portal en Doblas 248 y en Entre Ríos 2333 (aparecen las 98).
  4. Alta con persona de la lista → `select origin, portal_inquiry_id, lead_id from property_visits where client_name like '[TEST]%'`
     (para no tocar personas reales en el QA: usar "Cargar a mano" con nombre `[TEST] …` y un
     teléfono de prueba; para el criterio 4 verificar la LISTA y el vínculo con una consulta `[TEST]`
     insertada a mano en `portal_inquiries` y borrada al final).
  5. Cartel sin teléfono no avanza.
  6. Duplicado avisa y pide "Agendar igual".
  7. 10:30 en pantalla = 13:30 UTC en la base.
  8. Asesor no agenda a nombre de otro (pantalla y `curl` a la ruta con su sesión).
  9. Acciones de la ficha + `select kind, reason, actor_id from property_visit_events where visit_id=…`.
  10. Visita del agente/recorrido: con `scripts/visitas-datos.probe.ts` o el banco `/admin/ai-agent`
      NO (no crea visitas): verificar con un `upsertPendingVisit` desde un script `[TEST]`.
  11. Abogado: `/visits` y `/api/visits` → 403/vacío.
  Además: celular 390×844 (ventana como hoja inferior, botones ≥ 44 px), consola sin errores, red
  sin 4xx/5xx inesperados, y las pantallas que leen visitas con sesión (`/inicio`, `/tasks`) siguen
  andando con rol asesor y coordinador.
  Borrar todo lo `[TEST` al final.
- [ ] **Paso 7: Despliegue** — puertas en orden: (1) migración ya aplicada y verificada (Tarea 1);
  (2) sin variables de entorno nuevas en esta entrega; (3) `git diff --name-only origin/main feat/sistema-visitas`
  solo con archivos propios; `gh pr merge <N> --merge`; (4) sin pg_cron en esta entrega. Esperar el
  deploy y repetir el camino principal en `https://inmodf.com.ar` con una visita `[TEST]` (borrarla).
- [ ] **Paso 8: Cierre** — sección nueva en `CLAUDE.md` ("Sistema de visitas — Entrega 1": origen,
  `changed_by` obligatorio, historial por trigger, RLS de lectura, rutas borradas, cómo verificar);
  memoria del proyecto actualizada; `scripts/navegador-claude.sh cerrar`; reporte al dueño en
  castellano simple con la tabla criterio → cómo se probó → resultado.
