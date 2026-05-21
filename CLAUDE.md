# Diego Ferreyra Inmobiliaria — Operational Notes

## Stack
Next.js 16 + React 19 + TypeScript 5 + Supabase + Resend + Netlify Functions. shadcn/ui (new-york). Recharts para gráficos. @react-pdf/renderer para PDFs cliente.

## Deploy
- Repo privado en GitHub `sujupar/diego-ferreyra-inmobiliaria`.
- Netlify auto-deploya en cada push a `main` (webhook nativo, NO usa GitHub Actions).
- Site ID `b7e73ba5-3bfb-4604-b7bf-353169dd912a`.
- Commit author DEBE ser `Sujupar <redstyle50@gmail.com>` o el deploy falla.

## Supabase
- CLI no conecta (auth issue) — el usuario corre SQL en el Dashboard SQL Editor manualmente.
- RLS habilitada granular por rol (admin, dueno, coordinador, asesor, abogado) desde migración `20260505000001_rls_per_role_safe.sql`.

---

## Operational Gotchas / Lessons Learned

### Postgres triggers que insertan en otra tabla con FK al row actual

- **Symptom:** `POST /api/deals` devolvía 500 al "Coordinar Tasación". En logs: foreign key violation sobre `deal_stage_history.deal_id`. También afectaba a cualquier flow que hiciera UPDATE de `deals.stage`.
- **Root cause:** El trigger `trg_deals_stage_change` (migración `20260518000002_deal_stage_history.sql`) era `BEFORE INSERT OR UPDATE OF stage` y dentro hacía `INSERT INTO deal_stage_history (deal_id, ...) VALUES (NEW.id, ...)`. En `BEFORE INSERT` el row aún no está persistido en la tabla original, así que el FK `deal_stage_history.deal_id REFERENCES deals(id)` falla con violación. Bonus: la tabla `deal_stage_history` solo tenía política RLS SELECT, no INSERT → segundo bloqueo.
- **Fix:** Split en 2 triggers (migración hotfix `20260520000001_fix_deal_stage_history_trigger.sql`):
  1. `BEFORE INSERT OR UPDATE OF stage` → solo modifica `NEW` para poblar columnas `*_at` del propio deal.
  2. `AFTER INSERT OR UPDATE OF stage` → inserta en `deal_stage_history` cuando el deal ya existe. Marcado `SECURITY DEFINER` para bypass de RLS.
  Además, agregar política `FOR INSERT TO authenticated WITH CHECK (true)` en `deal_stage_history` como defense-in-depth.
- **Regla general:** Si un trigger necesita escribir en otra tabla con FK al row del trigger, ESE INSERT debe ir en un trigger `AFTER`, nunca en `BEFORE`. Si el trigger BEFORE también necesita modificar `NEW`, separar en dos triggers/funciones — no combinarlos.
- **Detection:** Antes de declarar completa cualquier migración con trigger nuevo en tabla mutable (`deals`, `contacts`, `properties`, `appraisals`), hacer un INSERT real desde el flow de la app (no solo SQL Editor) y confirmar que no devuelve 500. Si el trigger escribe en otra tabla, verificar también que esa tabla tiene política RLS apropiada para el operation type.

### Métricas del embudo CRM: definir QUÉ origin contar

- **Symptom:** El usuario reportó que `/metrics` mostraba números "exagerados" del embudo CRM (3-5x los reales del pipeline). El conteo de "solicitudes de tasación" no coincidía con lo que veía en el CRM por la misma fecha.
- **Root cause:** La vista `vw_funnel_daily` original contaba `appraisal_requests` como cualquier deal con `origin IS DISTINCT FROM 'clase_gratuita'`. Eso incluía `origin='referido'` (cargados manualmente), `origin='historico'` (data heredada pre-sistema), `origin='comprador'` (otro pipeline), `origin=NULL` (deals creados desde la UI sin marcar origen). Ninguno de esos es "solicitud de tasación del embudo de marketing", pero todos sumaban.
- **Fix:** Migración `20260520000004_funnel_definitions_fix.sql` restringió:
  - `appraisal_requests` → solo `origin = 'embudo'` (registros vía GHL form de "Tasación Directa").
  - Eventos del embudo (agendadas, visitas, entregadas, captadas, perdidas) → solo deals con `origin IN ('embudo','clase_gratuita')` (los del funnel medible, no referidos/históricos/comprador).
- **Regla general:** Antes de definir una métrica del embudo, decidir QUÉ valores de `origin` cuentan. `IS DISTINCT FROM X` raramente es lo correcto — usar enumeración explícita (`origin = 'embudo'` o `origin IN (...)`).
- **Detection:** Si los números del dashboard difieren del CRM en >30%, primero correr:
  ```sql
  SELECT origin, COUNT(*) FROM deals GROUP BY origin ORDER BY COUNT(*) DESC;
  ```
  Y revisar si la vista incluye orígenes que no deberían contar.

### Postgres: cambiar return type de una función requiere DROP previo

- **Symptom:** `ERROR: 42P13: cannot change return type of existing function` al correr una migración que usa `CREATE OR REPLACE FUNCTION` sobre una función ya existente cuyo `RETURNS TABLE` cambió.
- **Root cause:** `CREATE OR REPLACE` solo permite cambiar el cuerpo, no la signature. Si cambia el tipo de retorno (nueva columna, tipo distinto, etc.), Postgres rechaza el reemplazo.
- **Fix:** Hacer `DROP FUNCTION IF EXISTS fn_name(arg_types) CASCADE;` ANTES del `CREATE`. Si la función es usada por otra (ej. `RETURNS SETOF vista`), el CASCADE las dropea — recordá recrearlas también.
- **Detection:** Cualquier migración que toque una función ya existente y modifique su `RETURNS TABLE (...)` o tipo escalar debe llevar `DROP FUNCTION` arriba.

### Meta Ads: medir "Visitas a la página", no "Clics"

- **Symptom:** Las métricas Meta del dashboard mostraban "clics" pero el usuario quiere medir cuántas personas LLEGARON a la landing — son cosas distintas.
- **Root cause:** Meta API expone tanto `clicks` (raw click events, incluye rebotes pre-carga) como el action `landing_page_view` (página efectivamente cargada). El código contaba solo `clicks`.
- **Fix:** Migración `20260520000003_meta_ads_landing_page_views.sql` agregó columna `landing_page_views`. `lib/marketing/meta-ads.ts` (función `parseInsight`) y las 4 Netlify Functions extraen `actions.find(a => a.action_type === 'landing_page_view')`. La RPC `get_meta_funnel_by_campaign` ahora devuelve LPV y recalcula CTR como `LPV/impressions`. El componente `CampaignBreakdown.tsx` muestra "Visitas a la página" en la columna que antes era "Clics".

### Supabase upsert con `onConflict` requiere UNIQUE constraint

- **Symptom:** Métricas de Meta Ads aparecían infladas en rangos multi-día del dashboard `/metrics`. Filtro "Ayer" mostraba números correctos pero "Últimos 7/30 días" o "Mes corriente" daban valores absurdos (suma de filas duplicadas).
- **Root cause:** El cliente Supabase JS interpreta `.upsert(rows, { onConflict: 'col_a,col_b' })` como "si existe conflicto en esa combinación de columnas, UPDATE, si no INSERT". Pero **requiere que esa combinación tenga UNIQUE constraint en la DB**. Sin la constraint, Postgres no detecta conflicto → upsert se comporta como INSERT puro → duplicados se acumulan. Esto fue invisible mucho tiempo porque 3 scheduled functions (daily/weekly/monthly report) escriben en `meta_ads_daily` cada una.
- **Fix:** Cada vez que agregues `.upsert(..., { onConflict: 'X' })`, confirmá con un SELECT en `pg_constraint` que existe la UNIQUE correspondiente. Si no, agregarla. Migración `20260520000002_meta_ads_daily_dedup.sql` agregó constraints faltantes en `meta_ads_daily(date, campaign_id)`, `ghl_pipeline_daily(date, pipeline_id, stage_id)`, `ghl_commercial_actions_daily(date)`.
- **Detection:** Si un dashboard muestra métricas que duplican o triplican el valor real cuando ampliás el rango, primero ejecutar:
  ```sql
  SELECT col_a, col_b, COUNT(*) FROM tabla
  GROUP BY col_a, col_b HAVING COUNT(*) > 1 LIMIT 20;
  ```

### Email stack 100% Resend (no Gmail/nodemailer)

- **Symptom:** Si por error se vuelve a usar nodemailer/Gmail, los emails no llegan o caen en spam.
- **Root cause:** Migración a Resend completada 2026-04-24 (commits ff3c90f + f9e4dd8). Dominio configurado con SPF/DKIM en Resend: `inmodf.com.ar`.
- **Fix:** Usar siempre el helper `lib/email/resend-client.ts` (`sendEmail()`) que envuelve Resend SDK + idempotencia + test mode. Variables de entorno requeridas: `RESEND_API_KEY`, `EMAIL_FROM_DEFAULT`, `EMAIL_FROM_INVITATIONS`, `EMAIL_FROM_REPORTS`, `EMAIL_REPLY_TO`.

### Netlify Functions no pueden importar `@/`-aliases

- **Symptom:** Build de Netlify Functions falla con "Cannot find module '@/lib/...'".
- **Root cause:** Las functions en `netlify/functions/*.mts` se bundlean con esbuild aparte de Next.js — el `tsconfig.paths` no aplica.
- **Fix:** Inlinear el código necesario dentro del archivo `.mts`. Si hay duplicación con `lib/`, documentar "mantener sincronizado" en comentario. Ejemplo concreto: `_excelTable()` y `_fetchFunnelMetrics()` están inlineados en cada `scheduled-*-report.mts` aunque existen en `lib/email/reports/excel-table-builder.ts`.

### Scraper proxy obligatorio (ScraperAPI, no Puppeteer)

- **Symptom:** Scraping directo desde Netlify falla con 403 / captcha / IP bloqueada en portales (MercadoLibre, Argenprop, ZonaProp).
- **Root cause:** Los portales rate-limitan IPs de cloud providers. Puppeteer también — además es muy pesado para Netlify Functions.
- **Fix:** Usar `fetch` plano + ScraperAPI proxy (`SCRAPER_API_KEY` env var). NO reintroducir Puppeteer ni `serverExternalPackages: ['puppeteer']` en `next.config.ts`.

### File names con Unicode U+202F (narrow no-break space)

- **Symptom:** Operaciones de FS sobre archivos en `public/pdf-assets/monthly-data/` fallan en bash (path mismatch).
- **Root cause:** Algunos archivos viejos tienen ` ` en el nombre (espacio no rompible angosto). Bash glob no lo matchea sin escapado.
- **Fix:** Usar Python para listar/renombrar esos archivos. Nombres estandarizados nuevos sí están sin Unicode: `stock-departamentos.png`, `escrituras-caba.png`, `datos-barrio.png`, `tipos-propiedades.png`.

### Foreign keys a `profiles(id)` deben ser `ON DELETE SET NULL`

- **Symptom:** Borrar un usuario desde Supabase Auth devuelve "Database error deleting user".
- **Root cause:** Si una FK apunta a `profiles(id)` con `ON DELETE NO ACTION` (default), el borrado del auth user cascadea a profiles pero falla por las FKs.
- **Fix:** Toda nueva FK que apunte a `profiles(id)` debe usar `ON DELETE SET NULL` (o `CASCADE` si la entidad dependiente no tiene sentido sin el usuario). Ej: `deal_stage_history.changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL`.
