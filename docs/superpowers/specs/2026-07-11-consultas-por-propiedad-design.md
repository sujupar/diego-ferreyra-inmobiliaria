# Conteo de consultas por propiedad — Diseño

**Fecha:** 2026-07-11
**Estado:** Aprobado para plan de implementación
**Autor:** Claude (brainstorming con el usuario)

## Problema

Las consultas de portales (MercadoLibre / ZonaProp / Argenprop) se ingestan en
`portal_inquiries` desde Gmail. Hoy **no hay forma directa** de saber a qué
propiedad pertenece una consulta: el vínculo vive en un campo de texto libre y en
dos saltos, sin foreign key:

```
portal_inquiries.matched_map_id → portal_property_map.notes = "property:<id>"
                                                     ▲ string, no FK
```

Contar "consultas por propiedad" con esa estructura obliga a parsear strings, no
escala y no es una estructura que un desarrollador experto consideraría correcta.

El objetivo: **contar cuántas consultas tiene cada propiedad**, con un lugar en la
plataforma para ver esas métricas **filtradas por fecha**, asociadas a las
propiedades captadas. La prioridad explícita del usuario es que **la base de la
estructura sea sólida y escalable a miles de propiedades**.

## Principio rector: alinear al patrón que YA existe y funciona

El codebase **ya resolvió bien este problema** en su sistema de *leads*
(`property_leads`), que tiene una FK real `property_id` (ver `/api/leads`,
`PropertyLeadsCard`). El sistema de *consultas de portales* (`portal_inquiries`)
es el outlier que quedó con la convención de string `notes`.

Este diseño **no inventa una estructura nueva**: alinea `portal_inquiries` al
patrón probado de `property_leads` (FK indexada). Son dos conceptos distintos y
se mantienen separados:

| Sistema | Tabla | Fuente | Superficie existente |
|---|---|---|---|
| Leads | `property_leads` | landing / Meta Ads / manual | `PropertyLeadsCard`, tab "Leads" |
| **Consultas de portales** (objeto de este diseño) | `portal_inquiries` | Gmail (ML/ZonaProp/Argenprop) | inbox `PortalInquiriesClient` |

## Decisiones tomadas (brainstorming)

1. **Superficies:** dashboard global filtrable por fecha **+** sección en la ficha
   de cada propiedad. **No** hay columna en el listado de propiedades (YAGNI).
2. **Consultas sin propiedad identificada:** se muestran en un **grupo "Sin
   identificar"** (nada se descarta en silencio) → permite cazar avisos sin mapear.
3. **Dashboard global:** vive como **un panel dentro de `/metrics`** (junto a
   Embudo, Campañas, Estado actual).
4. **Ficha de propiedad:** pestaña **"Consultas"** dentro de `MarketingTabs`, al
   lado de "Leads".
5. **Agregación:** conteo en tiempo de consulta (RPC sobre FK indexada), **no**
   tabla de rollup denormalizada.

## Definición de la métrica (QUÉ se cuenta)

Siguiendo la lección de `CLAUDE.md` ("definir QUÉ contar antes de definir la
métrica"):

- Una **consulta** = una fila de `portal_inquiries` (un evento de contacto
  entrante). Consultas repetidas del mismo lead = varias consultas (cada una es
  un contacto real).
- **Base temporal del filtro:** `COALESCE(received_at, created_at)::date`.
  `received_at` es cuándo el lead consultó realmente; `created_at` es fallback si
  el parseo del email no trajo fecha.
- **Matcheada** = `property_id IS NOT NULL`. **Sin identificar** =
  `property_id IS NULL`. Se usa `property_id IS NULL` (verdad basada en FK) como
  el split, no el flag `is_unmatched`.

## Arquitectura: por qué conteo en tiempo de consulta (no rollup)

Un `GROUP BY property_id` sobre la FK indexada, filtrado por fecha, es **siempre
exacto, sin sincronización ni denormalización**. Para el volumen real de una
inmobiliaria (cientos de propiedades, miles de consultas/año) es instantáneo con
el índice `(property_id, received_at)`. Es el mismo patrón de los RPCs de métricas
existentes (`get_funnel_metrics`).

Una tabla de rollup diaria (`property_inquiry_metrics_daily`, à la
`property_metrics_daily`) sería premature optimization acá: más maquinaria y
riesgo de consistencia eventual, justificable solo con volumen masivo. **Si algún
día el volumen lo exige, la tabla de rollup se agrega detrás de la MISMA RPC sin
tocar la UI.** La FK indexada es la fundación que habilita ambos caminos.

## Diseño en capas

### Capa 1 — Fundación (migración `20260711000001_portal_inquiries_property_fk.sql`)

```sql
-- 1) FK real en el mapa (reemplaza la convención notes='property:<id>')
ALTER TABLE portal_property_map
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_portal_map_property ON portal_property_map(property_id);

-- 2) FK real en la consulta (el corazón del feature)
ALTER TABLE portal_inquiries
  ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_property
  ON portal_inquiries(property_id, received_at DESC);
-- Índice para el range-scan del dashboard global (agrupa por propiedad en un rango):
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_received
  ON portal_inquiries(received_at);

-- 3) Backfill map.property_id desde notes (solo UUID válido y propiedad existente)
UPDATE portal_property_map m
   SET property_id = substring(m.notes from 'property:([0-9a-fA-F-]{36})')::uuid
 WHERE m.property_id IS NULL
   AND m.notes ~ 'property:[0-9a-fA-F-]{36}'
   AND EXISTS (
     SELECT 1 FROM properties p
      WHERE p.id = substring(m.notes from 'property:([0-9a-fA-F-]{36})')::uuid
   );

-- 4) Backfill portal_inquiries.property_id desde matched_map_id → map.property_id
UPDATE portal_inquiries pi
   SET property_id = m.property_id
  FROM portal_property_map m
 WHERE pi.matched_map_id = m.id
   AND m.property_id IS NOT NULL
   AND pi.property_id IS NULL;
```

- `ON DELETE SET NULL` en ambas FK (consistente con la regla de `CLAUDE.md` para
  FKs y con `assigned_to`). Borrar una propiedad no rompe el histórico de consultas.
- `notes` **se mantiene** — sigue siendo la clave de dedup idempotente de
  `syncPortalPropertyMap`. Transición sin romper nada; la FK convive con `notes`.
- El backfill es idempotente (`IS NULL` guards) — se puede correr de nuevo sin daño.

### Capa 2 — Write-path (las consultas NUEVAS nacen con `property_id`)

- **`syncPortalPropertyMap`** (en `app/api/properties/[id]/ml-publish/route.ts`,
  `.../ap-publish/route.ts`, y `lib/portals/refresh-zonaprop-map.ts`): ya tienen
  `property.id` a mano → setear `property_id` en el record del mapa además de
  `notes`.
- **`lib/integrations/portal-inquiries/match.ts`**: `MatchResult` gana un campo
  `propertyId: string | null`. La query de `matchProperty` ya lee
  `portal_property_map`; sumar `property_id` al `select` y propagarlo en `hit()`.
  `refreshZonaPropMap` y el fuzzy match no cambian su lógica de scoring.
- **`app/api/cron/portal-inquiries/route.ts`**: en el `insert` de la consulta,
  agregar `property_id: match.propertyId`.

### Capa 3 — Agregación (SQL, patrón `get_*(p_from DATE, p_to DATE)`)

Nuevo archivo de migración `20260711000002_property_inquiries_rpcs.sql`
(`LANGUAGE sql STABLE`, `GRANT EXECUTE ... TO authenticated`):

```sql
-- Una fila por propiedad con >=1 consulta en el rango.
CREATE OR REPLACE FUNCTION get_property_inquiry_counts(p_from DATE, p_to DATE)
RETURNS TABLE (
  property_id UUID, address TEXT, neighborhood TEXT, assigned_to UUID,
  total BIGINT, mercadolibre BIGINT, argenprop BIGINT, zonaprop BIGINT,
  last_inquiry_at TIMESTAMPTZ
) AS $$
  SELECT pi.property_id, p.address, p.neighborhood, p.assigned_to,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE pi.portal = 'mercadolibre') AS mercadolibre,
         COUNT(*) FILTER (WHERE pi.portal = 'argenprop')    AS argenprop,
         COUNT(*) FILTER (WHERE pi.portal = 'zonaprop')     AS zonaprop,
         MAX(COALESCE(pi.received_at, pi.created_at))        AS last_inquiry_at
    FROM portal_inquiries pi
    JOIN properties p ON p.id = pi.property_id
   WHERE pi.property_id IS NOT NULL
     AND COALESCE(pi.received_at, pi.created_at)::date BETWEEN p_from AND p_to
   GROUP BY pi.property_id, p.address, p.neighborhood, p.assigned_to
   ORDER BY total DESC;
$$ LANGUAGE sql STABLE;

-- Escalares para las tarjetas resumen (incluye "sin identificar").
CREATE OR REPLACE FUNCTION get_inquiries_summary(p_from DATE, p_to DATE)
RETURNS TABLE (metric TEXT, value BIGINT) AS $$
  SELECT * FROM (VALUES
    ('total',        (SELECT COUNT(*) FROM portal_inquiries WHERE COALESCE(received_at,created_at)::date BETWEEN p_from AND p_to)),
    ('matched',      (SELECT COUNT(*) FROM portal_inquiries WHERE property_id IS NOT NULL AND COALESCE(received_at,created_at)::date BETWEEN p_from AND p_to)),
    ('unidentified', (SELECT COUNT(*) FROM portal_inquiries WHERE property_id IS NULL     AND COALESCE(received_at,created_at)::date BETWEEN p_from AND p_to)),
    ('mercadolibre', (SELECT COUNT(*) FROM portal_inquiries WHERE portal='mercadolibre'   AND COALESCE(received_at,created_at)::date BETWEEN p_from AND p_to)),
    ('argenprop',    (SELECT COUNT(*) FROM portal_inquiries WHERE portal='argenprop'      AND COALESCE(received_at,created_at)::date BETWEEN p_from AND p_to)),
    ('zonaprop',     (SELECT COUNT(*) FROM portal_inquiries WHERE portal='zonaprop'       AND COALESCE(received_at,created_at)::date BETWEEN p_from AND p_to))
  ) AS t(metric, value);
$$ LANGUAGE sql STABLE;
```

- Si `get_property_inquiry_counts` ya existiera con otra firma, precederla con
  `DROP FUNCTION IF EXISTS ... CASCADE` (regla de `CLAUDE.md` sobre cambio de
  return type).

### Capa 4 — API (patrón `/metrics`: `force-dynamic` + `DATE_RE` + `requirePermission`)

- **`GET /api/metrics/property-inquiries?from&to`** (nuevo) — gated por
  `requirePermission('metrics.view')`. Valida `from`/`to` con
  `DATE_RE = /^\d{4}-\d{2}-\d{2}$/`. Devuelve
  `{ properties: [...], unidentified: { count, list }, totals: {...} }`. La lógica
  vive en `lib/metrics/property-inquiries.ts` (nuevo), que llama las dos RPCs con
  cliente service-role (consistente con `/api/portal-inquiries` y `/api/leads`,
  que usan service-role porque las tablas `portal_*` no están en
  `database.types`). La lista de "sin identificar" se trae con un `select`
  acotado (`property_id IS NULL`, rango, `limit`).
- **`GET /api/portal-inquiries`** (extender el existente) — agregar filtros
  `propertyId` (`.eq('property_id', ...)`) y `from`/`to` (sobre
  `received_at`/`created_at`), manteniendo `days` por retrocompatibilidad. Respeta
  la visibilidad por rol que ya tiene (asesor → `assigned_to = user.id`).

### Capa 5 — UI

**Dashboard global — panel en `/metrics`:**
- Nuevo `components/metrics/PropertyInquiriesPanel.tsx`, montado en
  `app/(dashboard)/metrics/page.tsx`. Reusa `components/metrics/DateRangePicker.tsx`
  (presets Ayer/7d/30d/mes) y el patrón de `fetch('?from&to')`.
- Contenido: tarjetas resumen (total, matcheadas, **sin identificar**, por portal)
  + tabla ordenable por total con columnas Propiedad / Barrio / Asesor / total /
  ML / Argenprop / ZonaProp / última consulta (reusa `MetricsTable`/`DataTable`)
  + bloque **"Sin propiedad identificada (N)"** expandible con la lista (cada ítem
  linkea a arreglar el ruteo).

**Ficha de propiedad — pestaña "Consultas" en `MarketingTabs`:**
- Agregar tab `{ key: 'inquiries', label: 'Consultas', icon: MessageSquare }` en
  `components/properties/MarketingTabs.tsx`.
- Nuevo `components/properties/PropertyInquiriesCard.tsx` — total-en-rango + lista
  de consultas de esa propiedad (lead, portal, fecha, tipo, link responder), vía
  `/api/portal-inquiries?propertyId=&from=&to=`. Visualmente consistente con
  `PropertyLeadsCard`.

### Capa 6 — Permisos / RLS

- La columna nueva no cambia RLS: `portal_inquiries` ya tiene SELECT role-based
  (operations ven todo; asesor ve `assigned_to = p.id`).
- Dashboard global = operations (`requirePermission('metrics.view')`).
- Ficha = quien puede ver la propiedad (la API `/api/portal-inquiries` ya filtra
  por rol).

### Capa 7 — Testing

- **Unit** (`match.test.ts`): `matchProperty` devuelve `propertyId` cuando el map
  row tiene FK.
- **RPC**: sembrar consultas (matcheadas + sin identificar, multi-portal, en/fuera
  de rango) y verificar `get_property_inquiry_counts` y `get_inquiries_summary`
  (bordes de fecha inclusivos, split matched/unidentified).
- **Backfill**: correr las UPDATE de la migración contra data real y comparar el
  conteo de `portal_inquiries.property_id IS NOT NULL` antes/después.

## Archivos afectados (resumen)

**Nuevos:**
- `supabase/migrations/20260711000001_portal_inquiries_property_fk.sql`
- `supabase/migrations/20260711000002_property_inquiries_rpcs.sql`
- `lib/metrics/property-inquiries.ts`
- `app/api/metrics/property-inquiries/route.ts`
- `components/metrics/PropertyInquiriesPanel.tsx`
- `components/properties/PropertyInquiriesCard.tsx`

**Modificados:**
- `lib/integrations/portal-inquiries/match.ts` (+`propertyId` en `MatchResult`)
- `lib/integrations/portal-inquiries/match.test.ts` (assert `propertyId`)
- `app/api/cron/portal-inquiries/route.ts` (escribir `property_id`)
- `app/api/properties/[id]/ml-publish/route.ts`, `.../ap-publish/route.ts`,
  `lib/portals/refresh-zonaprop-map.ts` (setear `map.property_id`)
- `app/api/portal-inquiries/route.ts` (filtros `propertyId` + `from`/`to`)
- `app/(dashboard)/metrics/page.tsx` (montar el panel)
- `components/properties/MarketingTabs.tsx` (tab "Consultas")

## Gate de deploy

Las migraciones `20260711000001` y `20260711000002` deben correrse en el Dashboard
de Supabase **antes** de deployar el código que escribe/lee `property_id` (el
cliente CLI de Supabase no conecta — el usuario corre el SQL a mano). El backfill
va incluido en `...000001`.

## Fuera de alcance (YAGNI)

- Columna "# consultas" en el listado de propiedades.
- Tabla de rollup denormalizada.
- Unificar `portal_inquiries` con `property_leads` (son conceptos distintos; se
  mantienen separados).
- Métricas por asesor / por barrio en el dashboard (la RPC ya trae `assigned_to` y
  `neighborhood`, así que se puede agregar después sin cambiar la fundación).
