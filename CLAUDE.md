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

### Meta Marketing API: `is_adset_budget_sharing_enabled` es obligatorio al crear Campaigns

- **Symptom:** `POST /act_XXX/campaigns` devuelve `Meta 400 — Invalid parameter — error_subcode 4834011 — "Debes indicar True o False en el campo is_adset_budget_sharing_enabled"`.
- **Root cause:** Meta actualizó la API en 2025 — cualquier Campaign que no use CBO (Campaign Budget Optimization, i.e. budget a nivel Campaign) ahora debe especificar explícitamente este campo. Antes era inferido.
- **Fix:** En `lib/marketing/meta-campaign-builder.ts` agregar `is_adset_budget_sharing_enabled: false` al body del POST de campaign cuando el budget está a nivel adset (nuestro caso default). Si en el futuro querés CBO entre múltiples adsets, mover el `daily_budget` a la Campaign y poner `true`.
- **Detection:** Antes de declarar una integración Meta completa, hacer un test end-to-end real de creación de Campaign — no solo unit tests del builder.

### Meta geo_locations: NO mezclar `custom_locations` con `countries`

- **Symptom:** `POST /act_XXX/adsets` devuelve `Meta 400 — subcode 1487756 — "No se pueden usar los lugares — Algunos de tus lugares se superponen"`.
- **Root cause:** Meta detecta superposición cuando especificás un `custom_locations` (lat/lng + radio) y al mismo tiempo `countries: ['AR']`. El radio ya está dentro de AR — Meta considera redundante incluir el país.
- **Fix:** Usar UNO solo. Para targeting con radio alrededor de la propiedad: solo `custom_locations`. Para targeting país-entero: solo `countries`. Nunca ambos en el mismo `geo_locations`.
- **Detection:** Si AdSet falla con subcode 1487756, hay `custom_locations` + `countries` simultáneos.

### Meta `age_min` y `age_max` con `advantage_audience=1` tienen rango restringido

- **Symptom 1:** `POST /act_XXX/adsets` devuelve `Meta 400 — subcode 1870188 — "Edad mínima supera el límite"`.
- **Symptom 2:** Idem con `subcode 1870189 — "Edad máxima está por debajo del límite permitido"`.
- **Root cause:** Cuando `advantage_audience=1`, Meta trata la edad como sugerencia y la expande automáticamente. Impone límites estrictos en lo que podés especificar:
  - `age_min ≤ 25` (sino sube el suelo)
  - `age_max ≥ 65` (sino baja el techo)
- **Fix:** En el builder, después de resolver el spec (sea automático o `targetingOverride` del wizard), aplicar `age_min = min(actual, 25)` y `age_max = max(actual, 65)`. Las edades del buyer persona se mantienen como hint dentro de esos límites.
- **Detection:** Si AdSet falla con 1870188 o 1870189, hay valores fuera del rango permitido por Advantage+.
- **Trampa típica:** un fix en el builder para `decideTargeting()` no aplica si el wizard pasa `targetingOverride` con sus propios valores. Aplicar el cap **después** de resolver el spec final, no antes.

### Meta `targeting_automation.advantage_audience` es obligatorio en AdSets desde 2024-2025

- **Symptom:** `POST /act_XXX/adsets` devuelve `Meta 400 — subcode 1870227 — "Se requiere la marca de público Advantage — Para crear el conjunto de anuncios, debes activar o desactivar la función de público Advantage"`.
- **Root cause:** Meta ahora exige que cada AdSet declare explícitamente si Advantage Audience (machine learning para expandir el público) está activado (`1`) o desactivado (`0`). Sin este campo, el AdSet no se puede crear.
- **Fix:** En el spec de targeting agregar `targeting_automation: { advantage_audience: 1 }`. Para campañas de conversion (OFFSITE_CONVERSIONS) tiene sentido `1` — Meta aprende quién convierte y busca gente similar. Para campañas con targeting muy específico que no querés que Meta toque, usar `0`.
- **Detection:** Si AdSet falla con subcode 1870227, falta `targeting_automation.advantage_audience`.

### Meta `optimization_goal` debe coincidir con `destination_type`

- **Symptom:** `POST /act_XXX/adsets` devuelve `Meta 400 — subcode 2490408 — "El objetivo de rendimiento no está disponible — No puedes usar el objetivo de rendimiento seleccionado con tu objetivo de campaña"`. El `blame_field_specs` apunta a `optimization_goal`.
- **Root cause:** Meta restringe qué optimization_goals son compatibles con qué destination_type:
  - `destination_type: 'WEBSITE'` → usar `optimization_goal: 'OFFSITE_CONVERSIONS'`. Meta optimiza para personas más propensas a generar el evento del Pixel definido en `promoted_object.custom_event_type`.
  - `destination_type: 'ON_AD'` (Instant Forms nativos) → usar `optimization_goal: 'LEAD_GENERATION'`.
  - Mezclar WEBSITE + LEAD_GENERATION rompe — LEAD_GENERATION solo aplica a Instant Forms.
- **Fix:** Para campañas que mandan tráfico a landing externa: `optimization_goal: 'OFFSITE_CONVERSIONS'` + `destination_type: 'WEBSITE'` + `promoted_object: { pixel_id, custom_event_type: 'LEAD' }`.
- **Detection:** Si AdSet falla con subcode 2490408 y `blame_field_specs: [["optimization_goal"]]`, hay incompatibilidad goal/destination.

### Meta `promoted_object` con `destination_type=WEBSITE` requiere `custom_event_type`

- **Symptom:** `POST /act_XXX/adsets` devuelve `Meta 400 — subcode 1885014 — "Objeto promocionado no válido — El objeto promocionado que especificaste tiene una combinación no válida de parámetros"`.
- **Root cause:** Para AdSets con `destination_type: 'WEBSITE'` + `optimization_goal: 'LEAD_GENERATION'`, Meta exige que `promoted_object` tenga TANTO `pixel_id` COMO `custom_event_type`. El `custom_event_type` le dice a Meta cuál evento del Pixel/CAPI cuenta como conversión.
- **Fix:** Pasar `promoted_object: { pixel_id: META_PIXEL_ID, custom_event_type: 'LEAD' }`. Valores válidos de custom_event_type: `'LEAD'`, `'PURCHASE'`, `'COMPLETE_REGISTRATION'`, `'VIEW_CONTENT'`, `'ADD_TO_CART'`, etc. Para inmobiliaria → siempre `'LEAD'`.
- **Detection:** Si AdSet falla con subcode 1885014, probablemente el promoted_object está incompleto.

### Meta `bid_strategy` debe ir en el AdSet (no en Campaign) cuando el budget es a nivel AdSet

- **Symptom 1:** `POST /act_XXX/adsets` devuelve `Meta 400 — subcode 2490487 — "Se requiere un importe o limitaciones de puja para la estrategia"` cuando no especificás `bid_strategy` en ningún lado.
- **Symptom 2:** `POST /act_XXX/campaigns` devuelve `Meta 400 — subcode 1885737 — "Campaña sin presupuesto. Agregá uno para editar la estrategia de puja"` cuando ponés `bid_strategy` en la Campaign pero el budget está en el AdSet.
- **Root cause:** Meta exige que `bid_strategy` y `daily_budget`/`lifetime_budget` vayan **en la misma entidad**. Si usás CBO (budget en Campaign), ambos van en Campaign. Si usás budget a nivel adset (nuestro caso), ambos van en AdSet. Mezclar entidades rompe.
- **Fix:** En `lib/marketing/meta-campaign-builder.ts`:
  - NO especificar `bid_strategy` en el POST de Campaign.
  - Sí especificar `bid_strategy: 'LOWEST_COST_WITHOUT_CAP'` en el POST de AdSet (junto al daily_budget).
- **Detection:** Si ves errores de "bid amount required" o "campaña sin presupuesto", probablemente el `bid_strategy` está en el lugar equivocado.

### Meta interest IDs hardcoded se deprecan — NO usarlos en targeting fijo

- **Symptom:** `POST /act_XXX/adsets` devuelve `Meta 400 — error_subcode 1487079 — "Especificación de segmentación no válida — El interés con el identificador XXXXX no es válido"`.
- **Root cause:** Meta deprecá interest IDs periódicamente sin avisar. Ej: `6003315098934` ("Property") fue invalidado en 2026. Cualquier AdSet que lo incluya falla entero.
- **Fix:** No hardcodear interest IDs. Targeting con geo + age + publisher_platforms ya tiene muy buen alcance para inmobiliaria. Si necesitás interests, hacelo dinámico via `GET /search?type=adinterest&q=...` (Targeting Search API) y cacheá el resultado por 24h.
- **Detection:** Si AdSet falla con subcode 1487079, alguno de los interests/behaviors hardcoded está deprecado.

### Meta `/adimages?url=` requiere capability avanzada — usar multipart bytes

- **Symptom:** `POST /act_XXX/adimages?url=<URL>` devuelve `Meta 400 — (#3) Application does not have the capability to make this API call — type: OAuthException`.
- **Root cause:** El endpoint `/adimages` tiene dos modos: (a) `?url=<URL>` donde Meta descarga la imagen desde su servidor (requiere capability "Marketing API Standard Access" en Advanced Access), y (b) multipart bytes donde nosotros descargamos y subimos. La mayoría de las apps de Meta no tienen Advanced Access aprobado por App Review, así que el modo (a) falla con error code 3.
- **Fix:** Implementar el upload con bytes multipart. Descargar la imagen con `fetch`, convertir a `Buffer`, mandar como `FormData` con field `access_token` + un field cuyo nombre es el filename y cuyo valor es el `Blob`. Soporta jpeg/png/gif/webp.
- **Detection:** Si Campaign + AdCreative funcionan pero falla al subir imágenes, mirar el subcode/code del error. `code: 3` típicamente significa "tu app necesita una capability más avanzada para esta llamada específica".

### Foreign keys a `profiles(id)` deben ser `ON DELETE SET NULL`

- **Symptom:** Borrar un usuario desde Supabase Auth devuelve "Database error deleting user".
- **Root cause:** Si una FK apunta a `profiles(id)` con `ON DELETE NO ACTION` (default), el borrado del auth user cascadea a profiles pero falla por las FKs.
- **Fix:** Toda nueva FK que apunte a `profiles(id)` debe usar `ON DELETE SET NULL` (o `CASCADE` si la entidad dependiente no tiene sentido sin el usuario). Ej: `deal_stage_history.changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL`.
