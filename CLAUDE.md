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
- **PERO las migraciones SÍ se pueden aplicar desde acá (descubierto 2026-07-18):** conexión directa Postgres vía session pooler `aws-0-us-west-2.pooler.supabase.com:5432`, user `postgres.mncsnastmcjdjxrehdep`, password en `SUPABASE_DB_PASSWORD` (.env.local), con `npm i --no-save pg`. Ejemplo: `scripts/apply-plans-migration-pg.ts`. La conexión directa `db.<ref>.supabase.co` es IPv6-only (esta red no tiene ruta IPv6) y el `SUPABASE_ACCESS_TOKEN` de .env.local es un placeholder (Management API da 401).
- **OJO: hay más de un proyecto en el Dashboard.** El de la app es `mncsnastmcjdjxrehdep` (= `NEXT_PUBLIC_SUPABASE_URL`). El 2026-07-18 el usuario corrió una migración "en el Dashboard" y la columna no apareció — la corrió en otro proyecto. Verificar siempre contra la API (`select` de la columna) después de una migración manual.
- RLS habilitada granular por rol (admin, dueno, coordinador, asesor, abogado) desde migración `20260505000001_rls_per_role_safe.sql`.

## GHL (GoHighLevel) DECOMISADO — 2026-07-17

- **GHL ya NO es parte de ningún proceso.** Las landings del embudo son 100% propias (`app/(funnels)/tasacion-directa` y `/vsl-clase-propietarios`, dominio público `inmobiliariadiegoferreyra.com` en env `NEXT_PUBLIC_FUNNEL_PUBLIC_URL`), y la conversión entra por `POST /api/funnel/submit` → `create-funnel-lead` (deal + notificación + tarea + Píxel/CAPI dedup). NO reintroducir integraciones GHL.
- Vestigios en cuarentena (no activos): `app/api/webhooks/ghl/form-submission` (GHL dejó de POSTear el 2026-07-02), `app/api/cron/ghl-poll` + `lib/ghl/import.ts` (el job pg_cron `ghl-poll` debe estar **unscheduled** — `SELECT cron.unschedule('ghl-poll');`). Si un lead aparece como `[Importado GHL]` después del decomiso, algo lo re-encendió.
- **Si ese webhook alguna vez se reactivara:** hoy (2026-08-06) sigue ruteando las tasaciones a `notifyDealCreated` (`app/api/webhooks/ghl/form-submission/route.ts`) — el email de "Tasación agendada" que, desde el fix de `fix/email-solicitud-tasacion`, ya NO se usa para el registro de `POST /api/funnel/submit` (ver `### "Solicitud de tasación" ≠ "Tasación agendada"` más abajo). Reactivar el webhook sin cambiar esa línea reintroduciría el bug del email con todos los campos vacíos — habría que rutearlo a `notifyAppraisalRequest` (`lib/email/notifications/appraisal-request.ts`), igual que hace `create-funnel-lead.ts`. No se toca ahora porque el código está en cuarentena.
- **Evento de conversión Meta de AMBOS embudos: `CompleteRegistration`** (los adsets optimizan por COMPLETE_REGISTRATION). NO cambiar a `Lead` — desalinearía el conteo de resultados en Ads Manager. Definido en `TasacionClient.tsx`/`ClaseClient.tsx` (Pixel) y `app/api/funnel/submit/route.ts` (CAPI).

---

## Meta Ads — Arquitectura actual (2026-06-06)

Hay DOS wizards de campaña Meta coexistiendo:

- **`MetaAdsWizard` (v1)**: el original. Hoy solo se usa cuando la propiedad
  YA tiene una campaña no archivada — sirve como panel de gestión
  (Pausar / Reactivar / Archivar / link a Ads Manager).
- **`MetaAdsWizardV2`**: el nuevo flow de 11 etapas. Se usa cuando la
  propiedad NO tiene campaña.

El router está en `app/(dashboard)/properties/[id]/marketing/meta-ads/page.tsx`.

### Flujo del wizard v2 (Business Intelligence)

1. Confirmar datos de la propiedad
2. Recuperar descripción de portal (si está publicada) o generarla
3. Análisis con Gemini Vision (todas las fotos)
4. 3 avatares de comprador (Gemini text). El asesor puede comentar para refinar uno
5. Galería con estrellas: elegir 3 fotos principales
6. Ubicaciones (3 presets — Cercanos / Similares / Toda CABA)
7. **Generación de 12 piezas** = 3 fotos × 2 estilos × 2 formatos (E2.5, 2026-07-24; antes eran 27 con Gemini). Async con polling
8. Videos opcionales
9. Presupuesto en ARS
10. Revisión final
11. Publicar = Campaign + N Ads (1 por par feed/story generado; con E2.5 son 6) + 2 Custom Audiences. Cada Ad usa personalización por ubicación (feed 4:5 + historias/reels 9:16), Instagram asociado y CTA "Ver más" (`WATCH_MORE`).

### Endpoints clave

```
POST   /api/properties/[id]/meta-launch-v2/start
GET    /api/properties/[id]/meta-launch-v2/[jobId]/status
PATCH  /api/properties/[id]/meta-launch-v2/[jobId]/save-input
POST   /api/properties/[id]/meta-launch-v2/[jobId]/generate-batch
POST   /api/properties/[id]/meta-launch-v2/[jobId]/optimize-avatar
POST   /api/properties/[id]/meta-launch-v2/[jobId]/confirm
POST   /api/properties/[id]/meta-launch-v2/[jobId]/cancel
```

### Motor de imágenes de campaña (E2.5, 2026-07-24)

- **Foto de la pieza (Stage A):** **OpenAI `gpt-image-2`** vía `images/edits` con la
  foto REAL como referencia (preserva la propiedad). Calidad `'low'` por default
  (var `AD_IMAGE_OPENAI_QUALITY`): verificada en ~26s (cabe en el maxDuration=60s
  de Netlify), fiel a la propiedad y barata. `'medium'` mide ~65s → NO usar (excede
  el límite). Prompt foto-only, sin texto.
- **Texto de la pieza (Stage B):** overlay VECTORIAL (satori + resvg) → el texto
  NUNCA pasa por IA, cero errores ortográficos. Estilos usados: `editorial_magazine`
  + `hero_full_bleed` (los 2 verificados que llenan 4:5 y 9:16 sin espacio muerto).
  - **Requisitos del texto (usuario, 2026-07-25):** cada pieza muestra un **badge "En venta"**
    (o "En alquiler"/"Alquiler temporario" según `operation_type`) bien visible (`operationBadge()`
    en `ad-image-templates.tsx`, en editorial + hero), y el **tipo capitalizado** ("Departamento",
    nunca "departamento": `normalizePropertyTypeLabel` en el token + en el fallback de headline del
    runner). El token `operationLabel` sale de `operationLabelFor(property.operation_type)`.
  - **Gotcha layout:** el `hero_full_bleed` tenía un bloque de texto de **altura FIJA** → con titular
    de 2 líneas el precio se **superponía**. Fix: el bloque se ancla abajo (`bottom`) y **crece con el
    contenido** (sin `height`, con `paddingTop` para el fade del degradado). Verificar SIEMPRE los
    cambios de overlay renderizando un PNG real y MIRÁNDOLO: `scripts/render-ad-overlay-test.ts`
    (editorial+hero × feed+story) — satori no avisa de superposiciones, hay que verlas.
- **Cache:** la foto mejorada se cachea en Storage (`social-carousels/ad-enhanced/{jobId}/r{idx}.jpg`)
  por foto de origen → OpenAI corre **~3 veces por campaña** (1 por foto), no 12. Un
  reintento NO regenera lo hecho. Rollback: `AD_IMAGE_ENGINE=gemini` (V2 con Gemini)
  o `=legacy` (v1 all-in-one). Motor pluggable en `lib/marketing/ad-image-generator-v2.ts`.
- **OJO:** los 4 templates `split_photo_info`, `color_overlay_solid`, `minimalist_whitespace`,
  `typography_dominant` tienen bugs de satori (undefined/`display`) o dejan espacio
  muerto en 9:16 — NO usarlos en `STYLE_DUO` sin arreglarlos y re-renderizar antes.

### Modelos de Gemini (texto/visión; imagen migrada a OpenAI arriba)

- **Vision (análisis de fotos):** `gemini-2.5-flash` (var: `GEMINI_VISION_MODEL`)
- **Text (avatares + copy):** `gemini-2.5-flash` (var: `GEMINI_TEXT_MODEL`)
- **Image (legacy, solo si `AD_IMAGE_ENGINE=gemini|legacy`):** **`gemini-2.5-flash-image`** (var: `GEMINI_IMAGE_MODEL`)
  - **OJO 1:** `gemini-2.5-flash-image-preview` NO existe (404). El nombre correcto
    es `gemini-2.5-flash-image` (sin `-preview`). Verificado empíricamente 2026-06-06.
  - **OJO 2 (2026-06-08):** `gemini-2.0-flash` fue deprecado. El probe a
    `/v1beta/models/gemini-2.0-flash:generateContent` responde
    `404 NOT_FOUND — "This model models/gemini-2.0-flash is no longer
    available. Please update your code to use a newer model"`. Reemplazado
    en código por `gemini-2.5-flash` (sucesor canónico). Si en Netlify las
    env vars `GEMINI_TEXT_MODEL` / `GEMINI_VISION_MODEL` quedaron con
    `gemini-2.0-flash`, **borrarlas** (para que use el default del código)
    o actualizarlas a `gemini-2.5-flash`. Verificable con
    `GET /api/marketing/diag-gemini`.
- Todos requieren `GEMINI_API_KEY` en Netlify env vars.
- El modelo de imagen requiere billing habilitado en el proyecto Google AI Studio.

### Costos

- Imágenes: gracias al cache, **~3 llamadas a `gpt-image-2` `'low'` por campaña**
  (1 por foto de origen), no 12 — las otras 9 piezas solo hacen overlay vectorial
  (gratis). El costo por campaña = 3 × lo que OpenAI cobre por `gpt-image-2` `'low'`
  (mucho menos que las 27 generaciones Gemini de antes). Verificar el precio real
  en la cuenta OpenAI — no está hardcodeado acá.
- Optimizar avatar con comentario: ~$0.01 cada vez (Gemini text).

### Tablas relacionadas

- `meta_launch_jobs` — estado del proceso multi-etapa. UNIQUE PARTIAL en property_id WHERE status IN ('analyzing','awaiting_user_input','generating','awaiting_confirm','publishing') previene jobs paralelos.
- `property_meta_campaigns` — campañas creadas (UNIQUE PARTIAL en property_id WHERE status<>'archived' previene duplicados de Meta)
- `property_meta_audiences` — Custom Audiences creados al lanzar
- `property_ad_assets` — cache de imágenes generadas (incluye `storage_url`, `photo_source_index`, `composition_variant`, `launch_job_id`)

### Migraciones que el usuario debe ejecutar manualmente

```
20260523000001_ad_assets.sql                — cache base
20260527000001_meta_campaign_lock.sql       — anti-duplicado de campañas
20260606000001_meta_business_intelligence.sql — wizard v2
```

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

### Gemini Image: el modelo `-preview` NO existe — usar GA sin sufijo

- **Symptom:** Generación de imágenes con Gemini cae siempre a fallback silencioso (foto cruda). Los logs muestran `[ad-image-gen] Gemini 404: models/gemini-2.5-flash-image-preview is not found for API version v1beta`.
- **Root cause:** El nombre `gemini-2.5-flash-image-preview` NO existe. Google nunca tuvo ese sufijo `-preview` público. El modelo GA correcto es `gemini-2.5-flash-image` (apodo "Nano Banana"). Verificado empíricamente 2026-06-06 con curl directo a la API.
- **Fix:** En `lib/marketing/ad-image-generator.ts` y `GEMINI_IMAGE_MODEL` env var, usar `gemini-2.5-flash-image`.
- **Verificación rápida sin código:**
  ```bash
  curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/<NOMBRE>:generateContent?key=$GEMINI_API_KEY" \
    -H "content-type: application/json" \
    -d '{"contents":[{"parts":[{"text":"hi"}]}]}'
  ```
  Si responde 404 NOT_FOUND, el nombre del modelo está mal. Si responde 400 INVALID_ARGUMENT, hay otro error pero el modelo SÍ existe.
- **Atención:** los modelos de imagen de Gemini requieren billing habilitado en el proyecto Google AI Studio. Las llamadas de TEXTO funcionan en free tier, las de IMAGEN no.

### Meta: multi-texto y personalización por ubicación son EXCLUYENTES (subcode 1885878)

- **Symptom:** `POST /act_XXX/adcreatives` devuelve `400 code 100 subcode 1885878 — "No se pueden aplicar varios activos bodies a la regla N (número de prioridad...) en la lista de activos del anuncio"`.
- **Root cause:** en `asset_feed_spec`, si hay `asset_customization_rules` (nuestro caso: feed 4:5 + story 9:16), Meta admite **UN SOLO** `bodies` y **UN SOLO** `titles`. Los 5 textos principales que permite Meta son del creative SIN reglas de personalización.
- **Verificado empíricamente 2026-07-27** con `scripts/validate-meta-creative-payload.ts` (usa `execution_options:['validate_only']` → no crea nada):
  - `5 bodies / 5 titles` + reglas → ❌ 1885878
  - `1 body / 5 titles` + reglas → ❌ 1885878 (también aplica a titles)
  - `5 bodies / 1 title` + reglas → ❌ 1885878
  - `1 body / 1 title` + reglas → ✅
  - `5 bodies / 5 titles` SIN reglas → ✅
- **Decisión vigente:** se mantiene la personalización por ubicación (E2.5) → 1 texto por anuncio, y la variedad de copy se logra con **un texto DISTINTO por anuncio** (6 anuncios = 6 textos). Constante `MAX_TEXTS_WITH_CUSTOMIZATION = 1` en `meta-campaign-builder.ts`; `pickWindow()` reparte el pool de 10 textos sin que dos anuncios compartan el mismo.
- **Si alguna vez se quiere rotación de 5 textos dentro de un anuncio:** hay que RENUNCIAR a `asset_customization_rules` (una sola imagen para todos los placements).

### Meta: un anuncio que falla NO debe matar al lote (campaña de 3 de 6) — fix 2026-07-27

- **Symptom:** campaña publicada con **3 anuncios en vez de 6** (aparecían "Ad 6", "Ad 5", "Ad 1"), y al reintentar `400 subcode 3858798 "El contenido de anuncio ya existe"`.
- **Root cause (doble):** (1) `runWithConcurrency` propaga el throw → un creative rechazado abortaba el `Promise.all`, pero los ads ya creados en paralelo quedaban vivos en Meta y `ad_ids` nunca se persistía. (2) Los creatives de un intento fallido NO se borran; el reintento armaba payloads idénticos → Meta los rechaza como duplicados.
- **Fix:** cada variante se crea AISLADA (try/catch por variante, `attemptVariant`), con **reintento único** y un `ad_ref` único (`{campaignId}-v{i}[-r{attempt}]`) que viaja en el link, en `url_tags` y en el nombre del creative → nunca choca con su gemelo. `mergeVariantOutcomes()` (función pura, testeada) combina ambas pasadas preservando el orden.
- **Reglas nuevas:** una campaña INCOMPLETA nunca se activa sola (`failedVariants.length === 0` es condición para `activateCampaign`) y queda `paused`; el detalle se persiste en `property_meta_campaigns.last_error` y `meta_launch_jobs.error_message`; el panel V1 bloquea "Reactivar" sobre una parcial (409 `PARTIAL_CAMPAIGN`, salvo `force:true`).
- **Detection:** si en Ads Manager hay menos anuncios que piezas generadas, mirar `last_error` de `property_meta_campaigns` (ahí queda "Publicación parcial: N/M...").

### Meta CTA de los anuncios = `WATCH_MORE` ("Ver más") — decisión del usuario 2026-07-25

- **Decisión vigente:** el CTA de los ads es **`WATCH_MORE` → "Ver más"** (`AD_CTA_TYPE` en `lib/marketing/meta-campaign-builder.ts`). El usuario lo eligió porque muestra más del título del aviso.
- **Verificado empíricamente (2026-07-25):** contra la creencia previa ("WATCH_MORE solo aplica a video"), Meta **SÍ acepta `WATCH_MORE` para link ads con imagen** vía `asset_feed_spec` (creative creado status 200, `call_to_action_types:["WATCH_MORE"]` conservado). La UI de Meta también lo ofrece como opción para estos avisos.
- **Otros valores canónicos con traducción es-AR** (por si se cambia): `LEARN_MORE`→"Más información", `CONTACT_US`→"Contactarnos", `BOOK_NOW`→"Reservar", `SIGN_UP`→"Registrarse", `SHOP_NOW`→"Comprar ahora", `GET_QUOTE`→"Obtener presupuesto", `DOWNLOAD`→"Descargar", `WHATSAPP_MESSAGE`→"Enviar WhatsApp". Evitar `SEE_MORE`/`VIEW_MORE` (no canónicos → salen crudos en inglés).

### Bug productor/consumidor: el confirm buscaba `feed_square` (que E2.5 ya no genera) — 2026-07-25

- **Symptom:** una campaña publicada quedó con **1 solo anuncio, con la foto CRUDA, 1 copy, sin Instagram, CTA "Más información"** — en vez de 6 ads con las imágenes generadas (caso Villa Pueyrredón, job `c317c14d`).
- **Root cause (evidencia dura en DB):** el generador E2.5 (`ad-image-async-runner.ts`) produce 12 piezas en formatos **`feed_vertical` (4:5) + `story_vertical` (9:16)** — NUNCA `feed_square`. Pero el consumidor (`confirm/route.ts`) seguía filtrando `property_ad_assets.format = 'feed_square'` → **0 piezas** → `preGeneratedImageHashes=[]` → `variantCount` colapsa a **1** → el builder cae al generador legacy/foto cruda. Clásico "se refactorizó el productor y se olvidó el consumidor".
- **Fix (código, 2026-07-25):** el confirm ahora lee `feed_vertical`+`story_vertical` y los **EMPAREJA** por `(photo_source_index, composition_variant)` → `preGeneratedPairs` (feed 4:5 + story 9:16). Cada par → 1 ad con **personalización por ubicación** (`asset_feed_spec`: `asset_customization_rules` [story→9:16] + **regla default OBLIGATORIA con `customization_spec:{}` vacío**, sino Meta rechaza subcode 1885923). 6 pares → 6 ads. `buildCreativePayload()` en el builder arma el creative; con `pair` usa asset_feed_spec, sin pair cae al link ad de 1 imagen. Ambos caminos ahora **asocian Instagram** (`object_story_spec.instagram_user_id`, resuelto por `getInstagramActorId()` desde la Página o env `META_INSTAGRAM_ACTOR_ID`) y usan `WATCH_MORE`.
- **Regla general:** ante un cambio de nombres/enum en un productor (formatos, tipos), grepear TODOS los consumidores (`grep -rn "feed_square"`). Y antes de declarar completa una campaña, verificar en Meta que el nº de ads y las imágenes coinciden con lo generado (no confiar en "status published").
- **Reparación de campañas ya publicadas mal:** `scripts/repair-villa-pueyrredon-ads.ts` (modos test/build/inspect) — recrea los ads correctos sobre el adset existente y archiva el roto. Patrón reutilizable si aparece otra campaña vieja con el bug.

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

### properties.status: el CHECK original no incluía 'descartada'

- **Symptom:** `UPDATE properties SET status='descartada'` (el descarte de la app y el archivado de fusiones) falla con `23514 check_violation`.
- **Root cause:** la tabla `properties` fue creada fuera de migraciones con un CHECK de status que no contempla `'descartada'`, aunque la app lo usa como valor oficial de descarte (`PUT /api/properties/[id]`).
- **Fix:** migración `20260713000001_properties_status_descartada.sql` recrea el CHECK con la lista completa de STATUS_LABELS (incluye `descartada`). Si aparece un status nuevo en la app, actualizar TAMBIÉN el CHECK.
- **Fusión de duplicados (2026-07-13):** las fichas duplicadas del import CSV se fusionaron (deal/contacto/tasación → la copia publicada; la vieja queda `status='descartada'` con address `[FUSIONADA-><id8>] ...`). Script reutilizable de linkeo mapa→propiedad: `scripts/backfill-map-property-links.ts`. Evidencia usada para NO fusionar: posting IDs de ZonaProp distintos = avisos/propiedades distintas (Agüero 950 Palermo vs Balvanera; G. Mistral 2750 vs 2751).

### "Solicitud de tasación" ≠ "Tasación agendada" (emails del embudo)

- **Symptom:** por cada registro en la landing de tasación llegaba un email "Tasación agendada: …" con Barrio/Fecha/Hora/Tipo en `—` y "Asesor: Sin asignar".
- **Root cause:** `createFunnelLead` reusaba `notifyDealCreated`, que es la pieza de una tasación YA COORDINADA (muestra fecha, hora, tipo y asesor). Un registro del embudo no tiene nada de eso todavía.
- **Fix (2026-07-30):** `lib/email/notifications/appraisal-request.ts` (`notifyAppraisalRequest`) + `emails/AppraisalRequestAdminsEmail.tsx`, con subject `Nueva solicitud de tasación: {nombre}` y un callout que aclara que NO está agendada. Guard: exige `origin='embudo'`. Va a coordinador + admins/dueños, NUNCA al asesor (todavía no hay).
- **Regla general:** cada evento del embudo tiene su propia notificación. Ya son tres y no se mezclan: registro de clase → `notifyClassRegistration`; solicitud de tasación → `notifyAppraisalRequest`; tasación coordinada (`/api/deals`) → `notifyDealCreated`. Reusar una pieza "parecida" hace que el email afirme cosas falsas.
- **Métricas:** no cambian — el deal sigue siendo `origin='embudo'`, `stage='request'` y cuenta igual en el embudo. Este fix es SOLO del email.

### La inversión de Meta NO se sincronizaba sola — y los datos viejos no eran una serie (2026-08-06)

- **Symptom:** `meta_ads_daily` tenía **24 días con dato sobre 88** (marzo 12, abril 9, mayo 3) y nada después del 27/5/2026. Cualquier costo por tasación calculado con eso era la suma de días sueltos presentada como el mes entero.
- **Root cause (doble):** (1) **ningún proceso ejecutaba la sincronización** — los jobs de `cron.job` no incluían ninguno de Meta, y lo único que escribía esa tabla era una scheduled function de Netlify de las que no se disparan. (2) `fetchInsightsRange` pedía el rango **sin `time_increment`**, así que Meta devolvía UNA fila agregada por campaña para todo el rango; como `parseInsight` toma `date_start`, meses de gasto habrían quedado apilados en un solo día.
- **Fix:** `buildDailyInsightsUrl` + `fetchDailyInsightsRange` (con `time_increment=1` y paginación), ruta `app/api/cron/meta-sync` (patrón de `send-report`: `x-cron-secret` contra env o `cron_config`), y `scripts/backfill-meta-spend.ts` para recuperar el histórico. Recuperado el 2026-08-06: la cobertura pasó de 24 a **211 de 218 días**.
- **PENDIENTE:** falta programar el job `meta-sync` en `pg_cron` (migración `20260806000006`, se aplica con `scripts/apply-cron-meta-sync-pg.ts <secreto> <dominio>`). Requiere que el código esté deployado: apunta a una URL que no existe hasta entonces. **Sin esto, la inversión vuelve a cortarse.**
- **Detection:** `SELECT max(date), count(DISTINCT date) FROM meta_ads_daily;` — si `max(date)` no avanza a diario, el job no está corriendo.
- **OJO con la numeración de migraciones:** el prefijo `20260806000001` quedó **DUPLICADO** — `property_commercial_status.sql` y `whatsapp_origen.sql`, escritas el mismo día por dos sesiones en paralelo. Las dos ya están aplicadas, así que no rompe nada hoy, pero si alguna vez se reproducen las migraciones en orden el de esas dos es ambiguo. Antes de crear una migración, mirar el directorio.

### Tablero: el estado de resultados del embudo vive en `/metrics`, no en `/embudos` (2026-08-06)

- **Dónde:** `/metrics`, arriba de todo, con lo anterior debajo bajo "Detalle operativo". `/embudos` es la VISUALIZACIÓN del embudo (curvas, mapa de calor) y no se toca. Meter análisis de negocio ahí fue un error corregido a pedido del usuario.
- **Por COHORTE, no por eventos:** `get_funnel_statement` sigue a los deals CREADOS en el período. Es la única forma de que "de 109 solicitudes se coordinaron 26" sea verdad; contando eventos sueltos, numerador y denominador son poblaciones distintas.
- **Regla del tablero — no mentir sobre su propia base:** toda métrica viaja con su `n` (aviso con `n < 20`) y los costos con su cobertura (`dias_con_dato`/`dias_del_periodo`). Un período sin inversión dice "sin datos", nunca "$0".
- **Inversión del embudo vs de propiedad:** se separa por `property_meta_campaigns`, no por nombre de campaña. **Limitación conocida:** solo reconoce las campañas creadas DESDE la plataforma; una hecha a mano en Ads Manager (ej. "Venta Roque Perez") se cuela en la inversión del embudo. Por eso la pantalla muestra el desglose por campaña y lo advierte.
- **Gráficos:** barra horizontal por etapa con ancho proporcional al volumen, resaltando SOLO el cuello de botella y agrisando el resto (forma "emphasis"). El costo unitario NO va como barra: su escala va de $31 mil a $3,4 millones y exigiría un segundo eje. Colores validados con el script de la skill `dataviz` — el amarillo de advertencia se descartó por 1.79 de contraste.
- **Hallazgo del negocio (2026-08-06):** de 109 solicitudes del embudo en 2026, solo 26 se coordinaron y 1 se captó. Y la última transición a `captured` en el sistema fue en **mayo**: las 25 propiedades de junio entraron por carga masiva desde CSV, no avanzando por el embudo. O no se captó por embudo, o el equipo dejó de mover los deals. Los datos no distinguen.

### Estado comercial: `commercial_status` es OTRA columna, no un valor de `status` (2026-08-06)

- **Qué es:** `properties.commercial_status` con 5 valores — `disponible` (default), `reservada`, `vendida`, `dada_de_baja`, `descartada` — más `sold_price`/`sold_currency`/`sold_at` para la operación cerrada, y la tabla de historial `property_status_events` (solo crece; RLS de lectura con `is_operations_user()`). Migración `20260806000001_property_commercial_status.sql`, aplicada y verificada el 2026-08-06.
- **POR QUÉ NO va en `status`:** `checkAndAdvanceProperty` (`lib/supabase/properties.ts`) escribe `status='approved'` en CADA commit de multimedia cuando hay fotos + legal aprobado. Un estado comercial guardado ahí **se borraría solo** y re-dispararía los emails N8A/N8B de captación; además el trigger de `20260514000002` aprovisiona campaña Meta al pasar a `approved`. Son dos ejes distintos: `status` = captación, `commercial_status` = qué pasó con la propiedad.
- **Reglas:** todas en `lib/properties/commercial-status.ts` (módulo puro, 17 tests). `vendida` exige precio > 0 y fecha no futura; salir de `vendida` exige motivo; al salir se limpian los `sold_*` (el dato queda en el evento).
- **Al agregar un estado nuevo hay que tocar DOS lugares juntos:** el catálogo `COMMERCIAL_STATUSES` y el CHECK `properties_commercial_status_check`. Si no, la app escribe un valor que Postgres rechaza con 23514.
- **Escritura:** ruta propia `POST /api/properties/[id]/commercial-status` (NO el `PUT` genérico, que crea tareas y manda emails al pasar a `pending_review`). Son dos escrituras sin transacción: primero la propiedad, después el evento con un reintento; si el evento falla igual, responde 200 con `warning`.
- **Deuda documentada:** `descartada` se escribe TAMBIÉN en `status` (espejo heredado) porque cinco lugares todavía leen `status === 'descartada'` — badge del listado, descarte masivo, `isDiscarded`, `nextStep` y la vista `vw_properties_list`. `commercial_status` es la fuente de verdad; migrar esos cinco lectores y sacar el espejo queda pendiente.

### El link "Responder al interesado": acortador PROPIO con rebote (2026-08-27)

- **Symptom:** el link del aviso de consulta sacaba al asesor de WhatsApp: abría el navegador, había que esperar y tocar "Continuar al chat" para llegar al chat del interesado.
- **La regla dura, que no se puede esquivar:** WhatsApp abre el chat **sin salir de la app** SOLO cuando el link del mensaje es de un dominio suyo (`wa.me`, `api.whatsapp.com`). Con **cualquier** otro dominio —TinyURL, el nuestro, el que sea— se abre el navegador. No es un detalle del acortador: es cómo WhatsApp decide qué links maneja él.
- **Qué se hizo, y por qué NO es simplemente "sacar el acortador":** el dueño quiere el saludo COMPLETO precargado (decisión reafirmada el 2026-08-27), y eso hace un `wa.me` de ~240 caracteres que en el chat se ve como un bloque azul de varias líneas, incómodo de tocar. Así que el link se acorta con **nuestro dominio**: `inmodf.com.ar/r/<código>` (~31 chars, contra 28 del `tinyurl` que había).
- **La diferencia real con TinyURL — el rebote:** TinyURL redirigía a la PÁGINA WEB de `wa.me`, que exige tocar "Continuar al chat". `/r/<código>` sirve una página que rebota sola al deep link **`whatsapp://send?phone=…&text=…`**, que abre la app directo, **sin ese clic**. Respaldo a `wa.me` a los 2,5 s por si WhatsApp no está instalado. El navegador aparece un instante igual: eso es inevitable (ver la regla dura).
- **Seguridad — un acortador es un redirector abierto si se lo deja:** solo se acortan destinos `wa.me`/`api.whatsapp.com`, validado en TRES capas: al crear, al servir, y con un `CHECK` en la tabla (verificado: la base rechaza `https://banco-falso.com`). Se compara el **host exacto**, nunca con `includes`/`startsWith` — `wa.me.evil.com` pasaría cualquiera de esos dos. Sin esto, `inmodf.com.ar/r/xxx` sería un link de phishing con la credibilidad de nuestro dominio detrás.
- **XSS en la página de rebote:** el saludo lleva el nombre del interesado, que lo escribió un desconocido en un formulario de portal. El destino **NO se interpola dentro del `<script>`**: viaja en atributos HTML escapados y el JS lo lee del DOM. Un nombre `</script><script>…` sería XSS en nuestro dominio. Hay tests que lo cubren.
- **Nunca bloquea el aviso:** si el acortador falla (tabla ausente, red, lo que sea) se manda el `wa.me` crudo. Ahí sí importa el tope de **1024 caracteres** del cuerpo de una plantilla de Meta —pasarse no degrada el mensaje, lo RECHAZA y nadie se entera de la consulta—, así que el saludo se recorta por FRASE hasta que entra, y si no entra ninguno cede el "Aviso". Una URL **nunca** se trunca: media URL no es un link.
- **De paso se arreglaron dos bugs del mismo mensaje:** el link del "Aviso" salía cortado en 120 chars con un "…" (o sea, no abría nada) y decía "Consulta ##291" (la plantilla ya trae el `#`).
- **Piezas:** `lib/links/short-link.ts` (puro, 22 tests) · `lib/links/short-link-store.ts` · `app/r/[code]/route.ts` · `lib/integrations/portal-inquiries/reply-link.ts` (presupuesto, 24 tests) · migración `20260827000001_short_links.sql` (aplicada y verificada con `scripts/apply-short-links-pg.ts`) · `/r/` agregada a las rutas públicas del middleware.
- **El saludo termina con el enlace del aviso del portal** (pedido del dueño, 2026-08-27), en su propio renglón, para que el interesado tenga a mano lo que estuvo mirando. Solo si es un enlace de verdad: `avisoLabel` a veces trae un código o un título ("⚠️ CÓD 12345 · Departamento 2 ambientes") y eso, pegado en el mensaje al cliente, es contabilidad interna nuestra. **Trampa:** `armarLinkRespuesta` normalizaba con `\s+ → ' '`, que aplastaba los saltos de línea y dejaba el saludo y el enlace pegados; ahora usa `[^\S\n]+` (espacios que NO son salto). Los saltos no rompen la URL: `encodeURIComponent` los vuelve %0A.
- **Botón "Responder al interesado" (`consulta_portal_v2`, APROBADA como UTILITY el 2026-08-28, ~19h después de enviarla):** cuerpo CALCADO del aprobado —cambiarlo sería volver a jugarse la categoría; la gemela `nueva_consulta_portal` cayó en MARKETING y Meta la RETIENE— más un botón URL a `inmodf.com.ar/r/{{1}}`. Meta la aceptó como UTILITY con el botón apuntando a nuestro dominio. **El link SIGUE en el cuerpo, no es redundancia:** en WhatsApp de computadora los botones de plantilla no abren nada (verificado por el dueño el 2026-08-03, es lo que motivó `recorrido_acceso_v4`). Botón para el celular, link para la compu.
- **El botón NO se enciende solo:** `PLANTILLAS_CON_BOTON` en `notify.ts` decide si se manda el componente. Mandar un botón que la plantilla aprobada no declara hace que Meta **rechace el envío entero**, así que mientras `WHATSAPP_TEMPLATE_NAME` siga en `consulta_portal_util` no se manda nada. **Ya está APPROVED: falta poner `WHATSAPP_TEMPLATE_NAME=consulta_portal_v2` en Netlify** y correr `scripts/sincronizar-cuerpos-plantillas.ts`. Probada de punta a punta el 2026-08-28 con `scripts/probar-plantilla-consulta-v2.ts`.
- **Trampa de los scripts de prueba:** `normalizePhone` usa `libphonenumber-js/max`, cuya metadata NO carga bajo `tsx` (revienta con "Cannot read properties of undefined (reading 'hasOwnProperty')"). En la app corre sobre el bundler de Next y anda perfecto — es solo ese runner. En un script, pasar el teléfono ya en E.164 sin `+`. `sendWhatsappTemplate` NO normaliza: usa `to` tal cual.
- **Detection:** si un link del mensaje termina en "…", lo truncó NUESTRO código. Si `/r/<código>` da 404, mirar `short_links`. Si el asesor vuelve a ver "Continuar al chat", el rebote al deep link dejó de funcionar (¿cambió el esquema `whatsapp://`?).

### Foreign keys a `profiles(id)` deben ser `ON DELETE SET NULL`

- **Symptom:** Borrar un usuario desde Supabase Auth devuelve "Database error deleting user".
- **Root cause:** Si una FK apunta a `profiles(id)` con `ON DELETE NO ACTION` (default), el borrado del auth user cascadea a profiles pero falla por las FKs.
- **Fix:** Toda nueva FK que apunte a `profiles(id)` debe usar `ON DELETE SET NULL` (o `CASCADE` si la entidad dependiente no tiene sentido sin el usuario). Ej: `deal_stage_history.changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL`.

### Netlify scheduled functions que fallan en silencio (reportes por email)

- **Symptom:** Los reportes automáticos por email (`scheduled-*-report.mts`) dejaron de llegar (el último envío automático fue 2026-04-06), pero el envío MANUAL (`POST /api/marketing/reports`) sí llega bien. `report_settings`, destinatarios y dominio Resend (`inmodf.com.ar`) estaban todos OK.
- **Root cause (diagnóstico):** Manual y cron leen los MISMOS `report_settings`, así que si el manual llega, no es problema de destinatarios/flag. El cron de Netlify no estaba corriendo/registrando las funciones (en `email_report_log` no había NINGÚN envío a la hora del cron, 09:00 UTC; los registros recientes eran todos manuales a horas sueltas). Peor: las funciones hacían `return` temprano (settings null / deshabilitado) o crasheaban (env var faltante, `.single()` con 0 filas) **antes de loguear nada**, así que el fallo era invisible.
- **Fix (durable — observabilidad):** En cada función scheduled: (1) envolver TODO el handler en `try/catch` y loguear `status:'failed'` en `email_report_log` ante cualquier excepción; (2) loguear `status:'skipped'` con el motivo en `error_message` cuando se hace `return` temprano (deshabilitado / sin destinatarios / ya enviado hoy); (3) usar `.maybeSingle()` en vez de `.single()`. Resultado: una sola query a `email_report_log` dice exactamente qué pasó en cada corrida. La columna `status` es texto libre (sin CHECK) — `'skipped'` se acepta; igual va envuelto en try/catch.
- **Regla:** En `.mts` de Netlify NO se puede importar `@/lib`. La tabla del reporte de embudo está inlineada en las 4 funciones y replicada en `lib/marketing/funnel-report.ts` (para la ruta manual) — mantener sincronizadas. Métricas: Meta a nivel CUENTA (`reach` deduplicado, no suma de campañas) + RPC `get_funnel_metrics`. USD vía dólar blue (`getUsdToArs`, inlineado como `_getUsdToArs` en las funciones).

### CRÍTICO: las Netlify Scheduled Functions NO se disparan en este sitio (Next 16 + plugin) — usar pg_cron

- **Symptom:** NINGUNA de las 11 scheduled functions de `netlify/functions/*.mts` se ejecuta. No es solo los reportes: `ghl-poll` (*/10), `publish-listings` (* * * * *), `provision-meta-campaigns` (*/2), `visit-reminders`, `sync-*` — todas muertas. El deploy es OK y el código anda (los endpoints manuales funcionan), pero el handler programado nunca se invoca. El "fix" anterior de re-deployar NO re-registra el cron.
- **Root cause:** `@netlify/plugin-nextjs` (NO está pineado en package.json; Netlify auto-instala la última v5.x, ~5.15.9) corriendo sobre **Next.js 16.0.10** (más nuevo que el rango soportado por el plugin v5). El paso de build del plugin que registra los schedules con el scheduler de Netlify falla silenciosamente: las funciones se bundlean/deployan pero el cron nunca queda registrado (bug conocido: GitHub netlify/cli #4749, answers.netlify.com 126318 — pasa específicamente en sitios Next.js). Sin dashboard/CLI/token de Netlify no se puede inspeccionar ni arreglar el scheduler.
- **Prueba decisiva (sin dashboard):** heartbeats en la DB. `ghl_poll_state` (singleton que `ghl-poll` upsertea en CADA corrida) tiene `last_run_*` y `updated_at` congelados en el default de la migración → nunca corrió. `email_report_log` (logging always-on) tiene CERO filas a las 09:00 UTC en días consecutivos. Si una scheduled function de alta frecuencia (1/min, /10) no escribió nada reciente, el scheduler está roto a nivel sitio.
- **Fix (confiable + verificable): Supabase pg_cron + pg_net → ruta Next.js segura.** El scheduler vive en Supabase (donde el usuario ya corre SQL), totalmente bajo control e inspeccionable server-side. Ruta `app/api/cron/send-report` (POST/GET, `maxDuration=60`) valida `x-cron-secret == CRON_SECRET` (misma convención que `/api/cron/ghl-poll`, `portal-inquiries`, `visit-reminders`) y llama a `sendFunnelReport(type)` (cero duplicación). El job: `cron.schedule('report-daily','0 9 * * *', $$select net.http_post(url:='https://<site>/api/cron/send-report?type=daily', headers:=jsonb_build_object('x-cron-secret','<CRON_SECRET>'), body:='{}'::jsonb, timeout_milliseconds:=30000);$$)`. Cambiar la hora = `cron.alter_job(jobid, schedule:='...')`.
- **Gotchas pg_net/pg_cron:** (1) `net.http_post` es async/fire-and-forget → `cron.job_run_details.status='succeeded'` NO prueba que el HTTP haya dado 2xx; verificar SIEMPRE `net._http_response.status_code` (retiene ~6h) + `email_report_log`. (2) timeout default de pg_net es 2000ms → subir a 30000 (el reporte pega a Meta+Supabase+Resend). (3) pg_net es solo POST. (4) NO leer el secreto de Vault en runtime dentro del job (en el worker de pg_cron Vault puede no estar disponible → header NULL → 403 silencioso); inlinear el secreto o resolverlo una vez al crear el job. (5) Si algún día Netlify vuelve a disparar las .mts, hay riesgo de doble envío (el dedup de las .mts mitiga el diario, pero `sendFunnelReport` no deduplica) — documentar y, si se confirma, sacarles el `export const config.schedule`.
- **Verificación de 3 capas:** `cron.job_run_details` (corrió el SQL) → `net._http_response.status_code` (el endpoint dio 200) → `email_report_log` + inbox (se envió). Para test en el día sin que el dedup interfiera: pasar `?from=YYYY-MM-DD&to=YYYY-MM-DD` (la ruta no deduplica).

### Un ícono de lucide NO cruza la frontera servidor→cliente (menú lateral, 2026-08-07)

- **Symptom:** la plataforma ENTERA en blanco (las 39 pantallas, porque el que se cae es el layout). En el overlay de Next: `Only plain objects can be passed to Client Components from Server Components. Classes or other objects with methods are not supported. {href: "/tasks", label: …, icon: {$$typeof: …, render: …}}`.
- **Root cause:** `getNavSections()` (`lib/nav/sections.ts`) devuelve ítems con `icon: LucideIcon`, que es un **componente de React**. Un componente de servidor no puede pasar eso como prop a uno de cliente: React lo intenta serializar y falla. No es un warning, es pantalla caída.
- **Fix:** el menú se arma **del lado del cliente**. El layout manda el ROL (un string) y `components/nav/NavForRole.tsx` (`'use client'`) llama a `getNavSections` y le pasa la lista a `AppSidebar`/`Topbar`. **No borrar ese archivo por “envoltorio innecesario”: es lo único que evita el crash.** El SSR no se pierde (un componente de cliente igual se renderiza en el servidor).
- **Por qué es seguro:** el menú nunca fue la barrera de permisos — quién entra a cada ruta lo decide el servidor. `lib/auth/roles` y el rol ya viajaban al navegador (los usa `UserMenu`).
- **Detection:** NINGÚN test lo atrapa. Los tests de `lib/nav/sections` (24) y los de humo de `AppSidebar`/`Topbar` corren de un solo lado de la frontera; el error solo aparece **abriendo la app**. Regla general: si un módulo exporta datos que incluyen componentes (íconos, render props) y lo consume un componente de cliente, **el que arma esos datos tiene que correr en el cliente**.

### El sidebar de shadcn esconde submenús y contadores al colapsar

- **Symptom:** con el menú en modo ícono, clickear un desplegable ("Tasaciones", "Propiedades", "Configuración") no hace **nada visible** → 13 rutas inalcanzables para un admin. Y el contador del Inbox desaparece.
- **Root cause:** `SidebarMenuSub`, `SidebarMenuSubButton` y `SidebarMenuBadge` llevan `group-data-[collapsible=icon]:hidden` en `components/ui/sidebar.tsx`. Agravante: el estado colapsado vive en la cookie `sidebar_state` (7 días), así que el usuario se queda ahí.
- **Fix:** en `CollapsibleNavEntry` (`components/nav/AppSidebar.tsx`), si `state === 'collapsed' && !isMobile` el desplegable se renderiza como `DropdownMenu` flotante hacia la derecha (patrón canónico de shadcn); y el badge del Inbox suma un **punto** (`bg-brand`) que solo se ve en modo ícono. En celular NO aplica: ahí el menú se abre como panel expandido.
- **Trampa al armar el disparador del flotante:** NO pasarle `tooltip` al `SidebarMenuButton`. Ese prop lo envuelve en un `<Tooltip>`, y entonces `DropdownMenuTrigger asChild` le pasa las props al Tooltip en vez de al botón. El nombre del grupo va como `DropdownMenuLabel` adentro del flotante.
- **Otra trampa:** el punto del badge va como HERMANO del botón, no adentro. `sidebarMenuButtonVariants` tiene `[&>span:last-child]:truncate`, así que un `<span>` extra al final se roba el truncado de la etiqueta.
- **Regla general:** cualquier cosa nueva que se cuelgue del menú hay que mirarla **colapsada** además de expandida. La mitad de las clases de esa primitiva cambian de comportamiento en modo ícono.

---

## Publicación en portales — Wizard de MercadoLibre (rework 2026-06-06)

### Arquitectura del nuevo wizard de publicación ML

- **UI (6 pasos):** `components/properties/wizards/ml/MercadoLibreWizard.tsx` (shell con stepper + framer-motion) orquesta 6 steps en `components/properties/wizards/ml/steps/`: `StepImages` (drag&drop, portada + 2 secundarias, reordena `properties.photos`) → `StepMedia` (video YouTube **o** tour 3D) → `StepFields` (campos dinámicos de ML + `GeoPinMap` Leaflet/OSM) → `StepDescription` (genera con `generatePortalDescription`) → `StepReview` → `StepConfirm`. Estado en `useMlPublishDraft.ts`. La página `app/(dashboard)/properties/[id]/marketing/mercadolibre/page.tsx` importa de `wizards/ml/`.
- **Atributos dinámicos:** `lib/portals/mercadolibre/category-attributes.ts` consulta `GET /categories/{id}/attributes` (público, no requiere auth) y cachea 24h en la tabla `ml_category_attributes` (migración `20260606000001`). Clasifica en required/recommended (excluye `tags.hidden/read_only/variation_attribute`). NO hardcodear atributos.
- **Mapping:** `propertyToMlPayload(property, opts)` acepta `MlPayloadOptions { attributeOverrides, mediaChoice, listingType, allowedAttributeIds }`. `allowedAttributeIds` filtra los atributos contra el schema de la categoría (evita 400 por atributo inválido). Default `listing_type_id = free` (publicación gratuita — decisión del usuario; el asesor puede subir de tier en el paso 3).
- **Draft:** lo que el asesor configura en el wizard se persiste en `property_listings.metadata` (`ml_attributes`, `media_choice`, `listing_type`) vía `PATCH /api/properties/[id]/ml-preview`. El schema dinámico + prefill lo sirve `GET /api/properties/[id]/ml-attributes`.
- **Worker:** migrado de `netlify/functions/publish-listings.mts` (scheduler muerto) a `lib/portals/worker.ts` + ruta `app/api/cron/publish-listings` (pg_cron, migración `20260606000002`). El `.mts` quedó como handler on-demand SIN `config.schedule` (evita doble envío).
- **QA tool:** `scripts/qa-publish-ml-test.ts` (recon/publish/verify/teardown/`force-close <itemId>`/`photos-audit`/`picswatch`/`inquiry-status`/`listingtypes`). Correr con `node --env-file=.env.local --import tsx`. publish/verify/teardown SOLO operan sobre propiedades con título que empieza con `[TEST`; `force-close <itemId>` opera por id directo (sin guard).
- **Bridge publicación → consultas:** al publicar (`POST /ml-publish`), `syncPortalPropertyMap` inserta el aviso en `portal_property_map` (external_code = id del aviso, external_url, address/neighborhood/title, assigned_to de la propiedad, `notes='property:<id>'` para dedup). Así las consultas de ese aviso rutean al asesor de la propiedad SIN cargar el CSV a mano. Best-effort (try/catch): si la tabla del sistema de consultas no existe aún, no rompe el publish.

### ML procesa las fotos de forma ASÍNCRONA (~1-2 min) — no es bug

- **Symptom:** Recién publicado, el aviso "no tiene fotos" aunque la propiedad sí las tiene.
- **Root cause:** ML descarga las pictures desde la URL `source` de forma async. Mientras el item está `not_yet_active`, `pictures[].secure_url` apunta al placeholder `.../processing-image/.../O-ES.jpg` (size 500x500). Recién cuando el item pasa a `active` (~80-100s) las fotos quedan en full resolución. Verificado en vivo: t=0 placeholder → t=100s las 3 en 1920px + status active.
- **Fix (UX + verificación):** El wizard avisa en la pantalla de éxito que las fotos tardan ~1-2 min. Además, el publish setea `metadata.needs_picture_check=true` y el worker (`processPictureChecks`) verifica, una vez `active`, que las pictures no hayan quedado en placeholder ni falten respecto a las enviadas; si fallan, marca `metadata.picture_issues` + `last_error`. Diagnóstico manual: `scripts/qa-publish-ml-test.ts picswatch <propertyId>`.
- **Regla:** NUNCA juzgar si las fotos subieron mirando el aviso en `not_yet_active`. Esperar a `active` o usar `GET /items/{id}` + chequear `pictures[].secure_url` (que NO contenga "processing-image").

### ML: la descripción del item NO se publica inline — usar `POST /items/{id}/description`

- **Symptom:** El aviso queda publicado pero SIN descripción; `GET /items/{id}/description` devuelve 404.
- **Root cause:** Poner `description: { plain_text }` en el body de `POST /items` NO crea la descripción (ML la ignora). La descripción es un **sub-recurso** aparte. Bug latente: el código viejo mandaba la descripción inline y nunca llegaba a ML.
- **Fix:** Tras crear el item, `POST /items/{id}/description` con `{ plain_text }`. Para updates, `PUT /items/{id}/description`. Implementado en `lib/portals/mercadolibre/adapter.ts` (`publish` y `update`). En el PUT del item, sacar `description` del body (va por su endpoint).
- **Detection:** En QA, verificar SIEMPRE `GET /items/{id}/description` aparte del `GET /items/{id}`.

### ML `listing_type`: `gold_premium` requiere cupo pago; `gold_special` no aplica a inmuebles — fallback de tier

- **Symptom 1:** `POST /items` devuelve `400 "Not available quota"` (`bad_request`) al pedir `gold_premium`.
- **Symptom 2:** `400 listing_type.invalid` / "Listing type was null" al pedir `gold_special` en inmuebles (MLA1473 etc.).
- **Root cause:** `gold_premium` es un tier PAGO; consume cupo de publicaciones premium que la cuenta puede no tener. `gold_special` directamente no existe para inmuebles. Tiers válidos de inmuebles: `gold_premium`, `silver`, `free` (`ML_LISTING_TYPES` en `mapping.ts`).
- **Fix:** `adapter.publish` intenta el tier pedido y, SOLO ante `"available quota"` / `listing_type.invalid` / "listing type was null", baja al siguiente tier (`gold_premium → silver → free`), devolviendo `metadata.listingTypeUsed`/`downgradedFrom`. La ruta y el worker persisten el tier REALMENTE usado en `metadata.listing_type`. NO ensanchar el match a `/listing.?type/i` (tragaría errores legítimos). `ML_LISTING_TYPES` DEBE quedar en orden descendente para que el fallback pruebe el tier inferior.
- **La disponibilidad de tiers es POR CATEGORÍA y POR CUENTA — traerla de ML, no hardcodear.** Endpoint: `GET /users/{me}/available_listing_types?category_id={cat}` → lista de tiers disponibles + `remaining_listings`. Ejemplo real (cuenta DIEGOFERREYRAINMOBILIARIA, 2026-06-06): **Departamentos/Casas en venta (MLA1473/MLA1472) → SOLO `silver` (Plata), 37 cupos**; **PH (MLA1471) → `free` (10) + otras**. O sea: para depto/casa NO hay publicación gratuita en esta cuenta (son slots `silver` del plan, sin costo extra). Implementado en `lib/portals/mercadolibre/listing-types.ts` (`fetchAvailableListingTypes`). La ruta `ml-attributes` devuelve los tiers reales + default al más barato disponible; el `adapter.publish` arma `tiersToTry = [pedido, ...disponibles]` y degrada ante "Not available quota". Por eso pedir `free` en un depto publica como `silver` automáticamente.
- **Default del wizard = el tier más barato DISPONIBLE para la categoría** (free donde se ofrece, sino el siguiente: silver para depto/casa). El asesor puede subir de tier en el paso 3.

### ML `number_unit`: superficies y antigüedad EXIGEN unidad explícita

- **Symptom:** `POST /items` devuelve `400 validation_error — "Attribute COVERED_AREA with value 95 ... The provided unit is not valid. You can use a number followed by one of these valid units: [in², m², ...]."` (idem TOTAL_AREA, PROPERTY_AGE).
- **Root cause:** Los atributos `number_unit` necesitan número **+ unidad** (`"95 m²"`, `"15 años"`). Se rompía cuando el prefill/override del wizard mandaba el número pelado (`"95"`) y pisaba el valor con unidad que arma `derivedAttributes`. El QA automático no lo detectó porque no sobreescribía los atributos derivados — solo se reproduce pasando por el paso de Campos con un humano.
- **Fix:** `mapping.ts` `normalizeUnit()` normaliza al chokepoint (`*_AREA → " m²"`, `PROPERTY_AGE → " años"`) cualquier valor `number_unit` que llegue como número pelado, y el prefill (`derivedPrefill` en la ruta `ml-attributes`) ya incluye la unidad. Si en el futuro se publican terrenos, sumar FRONT/DEPTH (unidad `m`) a `normalizeUnit`.

### ML: cerrar un item en `not_yet_active` requiere activar→esperar→cerrar

- **Symptom:** `PUT /items/{id}` con `{status:'closed'}` devuelve `400 item.status.invalid — "Item in status not_yet_active is not possible to change to status closed. Valid transitions are [active, not_yet_active]"`.
- **Root cause:** Un item recién creado queda en `not_yet_active` mientras ML lo valida (asíncrono, puede tardar ~1–2 min). Desde ese estado solo se puede ir a `active`.
- **Fix (script/manual):** Para cerrar a mano: `PUT status:'active'` → pollear `GET /items/{id}?attributes=status` hasta `active` (esperar minutos, no segundos) → `PUT status:'closed'`. Ver `scripts/qa-publish-ml-test.ts` (`teardown` por propertyId con guard `[TEST`, o `force-close <itemId>` por id directo + sync DB) y `scripts/force-close-ml-item.ts`.
- **Fix (wizard, async):** El botón "Pausar"/"Cerrar definitivamente" del wizard, si el item está en `not_yet_active`, NO falla: la ruta `PATCH /ml-publish` marca el flag `needs_pause_after_active` / `needs_close_after_active` en `property_listings.metadata` y el worker pg_cron (`processPausesAfterActive` / `processClosesAfterActive` en `lib/portals/worker.ts`) lo pausa/cierra cuando ML lo activa (~1-2 min). La UI muestra "se cerrará automáticamente en 1-2 minutos".

### Draft del wizard vs worker pg_cron: usar status `'draft'`, NO `'pending'`

- **Symptom:** Un asesor entra al wizard, toca "Siguiente" en el paso 1, y a los <60s el aviso se publica solo (a medio configurar). Al volver, el wizard muestra el panel de gestión y ya no puede terminar.
- **Root cause:** El autosave del draft (`PATCH /ml-preview`) creaba la fila `property_listings` con `status:'pending'`. La columna `next_attempt_at` tiene `DEFAULT NOW()`, y el worker pg_cron (`processPublishes`) levanta `status='pending' AND next_attempt_at <= NOW()` → publica de inmediato. El status `pending` históricamente significaba "listo, publicar ya".
- **Fix:** El draft del wizard usa `status:'draft'`. El worker solo toca `'pending'`. El publish real (`POST /ml-publish`) pasa la fila a `'published'`. **Regla:** cualquier fila `property_listings` en `'pending'` será publicada por el worker — no usar `'pending'` para borradores/configuración intermedia.
- **Relacionado:** el worker DEBE reconstruir las `MlPayloadOptions` desde `property_listings.metadata` antes de publicar (`buildPublishOpts` en `lib/portals/worker.ts`); si llama `adapter.publish(property)` sin opts, ignora todo el draft (atributos/medios/tier) y republica con defaults.

### Multimedia de propiedad captada: fotos (orden=portada), video (archivo) y recorrido (enlace)

- **Modelo de datos:** las fotos viven en `properties.photos` (TEXT[]) — **el ORDEN del array es la verdad**: las 3 primeras son la portada y `photos[0]` es la miniatura en todo el sistema (listado, leads, portales). `video_url` queda RESERVADO para enlaces externos que consumen los portales (esperan algo tipo YouTube); el **video SUBIDO** (archivo) va en la columna nueva **`video_file_url`** (Storage, reproducido con `<video>`). El **recorrido virtual** es un enlace en `tour_3d_url`, embebido en `<iframe>`. Migración: `supabase/migrations/20260606000003_property_video_file_url.sql` (correr a mano en el Dashboard — Supabase CLI no conecta).
- **Subida:** SIEMPRE por **URL firmada directa a Storage** (`POST /api/properties/[id]/media/upload-init` → PUT a la signedUrl → `POST /media/commit`), NO multipart al server (evita el límite de body de Next.js). Mismo patrón que los documentos legales. El cliente sube en **lotes de 30** (la route cap a 30 por request) y escribe los resultados en **slots por índice** para preservar el orden de selección (las subidas paralelas resuelven en orden de finalización, no de índice).
- **Mutaciones:** `PATCH /api/properties/[id]/media` — `{photos}` (reorden, debe ser **permutación** del set actual), `{deletePhoto}`, `{video_file_url}`, `{tour_3d_url}`. NO usar el `PUT /api/properties/[id]` para media: ese tiene efectos secundarios (crea tarea + dispara email cuando status='pending_review').
- **Auto-avance:** `checkAndAdvanceProperty` se llama UNA vez en el commit del lote, nunca por archivo (evita disparos múltiples de la notificación de captación N8A/N8B).
- **Seguridad (lecciones del code-review):** (1) `tour_3d_url` se valida `https://` en el servidor antes de guardar — sin esto un `javascript:`/`data:` queda como `<iframe src>` = **XSS almacenado** (también en la landing pública `app/p/[slug]`). (2) El `{photos}` reorder valida que sea **permutación** de las fotos actuales — sin esto se inyectan URLs arbitrarias a `property.photos` (que van a `<img>` y a Meta/portales). (3) El commit valida que cada URL empiece con el prefijo de Storage de ESA propiedad; **normalizar el trailing slash de `NEXT_PUBLIC_SUPABASE_URL`** (`.replace(/\/+$/,'')`) o el prefijo no matchea y rompe todos los commits. (4) La route legacy `POST /api/properties/[id]/upload` quedó huérfana tras el rediseño y NO tenía auth — se le agregó `requireAuth` + 403 abogado (candidata a borrar más adelante).
- **UI:** los primitivos `components/ui/collapsible.tsx` y `tabs.tsx` se importan del paquete bundleado `radix-ui` (NO `@radix-ui/react-*` standalone). Galería con `@dnd-kit/*`. La página de detalle (`app/(dashboard)/properties/[id]/page.tsx`) es estilo iOS: documentación legal en desplegable maestro con resumen de estado, secciones (Datos, Historial) plegables, y el orden = resumen+acción arriba, historiales plegados abajo. El abogado NO ve Multimedia/Marketing/Archivar.
- **Limitaciones conocidas (aceptadas):** el append de `photos` en commit y el reorder son read-modify-write (no atómicos) — race posible bajo subidas concurrentes, baja probabilidad en uso real (un asesor por propiedad); un fix atómico requeriría RPC + migración. Ante fallo de commit tras un PUT exitoso queda un objeto huérfano en Storage (solo `console.warn`); costo tolerable.
- **Planos (2026-07-18):** columna `properties.plans` (TEXT[], migración `20260718000001_property_plans.sql`), espejo de `photos`: `kind:'plan'` en `upload-init`/`commit` (carpeta `properties/{id}/plans/`, hasta 100 MB c/u — PDFs grandes OK porque van directo a Storage, sin comprimir) y `{deletePlan}` en el PATCH. El path incluye el nombre original saneado (`{uuid}-{nombre}.{ext}`) y la UI deriva la etiqueta con `planLabelFromUrl()` (`lib/properties/media.ts`) — si se cambia el formato del path, actualizar ese parser. El commit de planos NO llama a `checkAndAdvanceProperty` (no cuentan para completar la captación). UIs: pestaña Planos en `PropertyMediaCard` (`PlansPanel.tsx`) y card opcional en `properties/new` que sube vía `lib/properties/upload-plans.ts` DESPUÉS de crear la propiedad (y después de avanzar el deal). No se publican en portales ni en la landing.

### Consultas por propiedad: FK real, no la convención notes

- Desde la migración `20260711000001`, `portal_inquiries.property_id` y
  `portal_property_map.property_id` son FKs reales a `properties(id)` (ON DELETE
  SET NULL). La convención `notes='property:<id>'` SIGUE VIVA solo como clave de
  dedup de `syncPortalPropertyMap` — NO usarla para joins nuevos; usar la FK.
- Métricas: RPCs `get_property_inquiry_counts` / `get_inquiries_summary`
  (`20260711000002`), base temporal `COALESCE(received_at, created_at)::date`.
  Panel en `/metrics` + pestaña Consultas en la ficha. Conteo query-time; si el
  volumen algún día lo exige, agregar rollup DETRÁS de la misma RPC.
- Gate de deploy: esas 2 migraciones deben correrse ANTES de deployar código que
  escribe `property_id` (el INSERT del cron falla sin la columna → se rompe la
  ingesta de consultas).
- Tras el deploy, en orden: (1) correr `scripts/backfill-map-property-links.ts
  --commit` (linkea filas del mapa sin FK — p. ej. las sembradas por CSV — a
  properties por dirección); (2) esperar/forzar una corrida de
  `refresh-portal-map` (cura las filas zonaprop legacy sin notes); (3) re-correr
  el UPDATE #4 de la migración `20260711000001` (idempotente) — propaga la FK a
  las consultas históricas y a las ingresadas entre migración y deploy.

---

## Datos de Mercado por Barrio (tasador) — 2026-07

- **Qué es:** las 4 secciones de mercado del PDF (stock, escrituras, datos del barrio, tipos) se ingestan solas y 2 son POR BARRIO. Spec: `docs/superpowers/specs/2026-07-01-datos-mercado-por-barrio-design.md`.
- **Fuentes (las 4 automáticas desde 2026-07-02):** JSON Bryn (precio 48 barrios + kpis; fallback: data-* del SVG del mapa), RSS Colegio de Escribanos (escrituras + imagen a Storage `market-data/escrituras/{period}.jpg`), Zonaprop `/barrios/capital-federal/{slug}` vía ScraperAPI (6 conteos, parser VERIFICADO contra HTML real: los counts viven en `.en-numeros .custom-chart-legend`, no en JSON embebido; slug especial: `nueva-pompeya → pompeya`), e **Infogram (composición del stock) vía ScraperAPI `render=true&wait_for_selector=svg`**: el embed trae 24 charts "live" con `chartData.data` vacío y el endpoint directo `getLiveData` da 401 — pero el render hidratado SÍ expone todo (pie-labels `igc-graph-pie-label` "Inmobiliaria 98.70%" + tabla de tipos en celdas `igc-table-cell`). `parseHydratedInfogram()` en `lib/market-data/sources/infogram.ts`; cada fetch cuesta ~10 créditos (1×/día vía cron). Plan B documentado: `&screenshot=true` expone header `sa-screenshot` con URL de PNG.
- **Tablas:** `neighborhoods` (48+General), `market_snapshot_caba` (UNIQUE period), `market_snapshot_neighborhood` (UNIQUE neighborhood_id+period), `market_data_refresh_state` (observabilidad). Histórico ilimitado; upserts con merge (fallo parcial NUNCA borra lo capturado).
- **Cron pg_cron:** `market-data-core` (diario 09:15 UTC, 3 GETs) y `market-data-zonaprop` (cada 2h, lotes de 12 pendientes, sale temprano si el período está completo). Auth DUAL (env CRON_SECRET o cron_config) — env-only da 403 con los jobs actuales.
- **Congelado:** `appraisals.neighborhood_slug` + `market_period` (se setea al CREAR, nunca en updates). Tasaciones legacy (null) → el PDF renderiza el camino de imágenes de siempre (`market-images`/estáticas). El resolver (`lib/market-data/resolver.ts`) sirve `(slug, period)` con fallback al último período disponible.
- **PDF:** con `marketData` → 4 páginas data-driven (dashboard stock, escrituras, panel+mapa con barrio resaltado, dona de tipos); cada sección cae a su imagen legacy si SU dato falta. Mapa: `lib/market-data/caba-map-paths.ts` (generado por `scripts/extract-caba-map.ts`; fix villa-general-mitre aplicado; los <path> de la fuente NO se autocierran — regenerar solo con el script).
- **Gotcha PDFViewer ("n1 is not a function"):** el host-config de @react-pdf NO implementa `detachDeletedInstance`; el reconciler de React lo llama al ELIMINAR nodos en un update en vivo del `PDFViewer` → crash irreproducible en node/build (un render fresco nunca elimina). Gatillo típico: un prop async (ej. `marketData`) llega DESPUÉS de que el visor montó y cambia la ESTRUCTURA del documento (páginas agregadas/quitadas). Guardas en `PDFPreviewModal.tsx`: (1) el JSX del preview es inline con props crudas estables; (2) el `<PDFViewer>` lleva un `key` derivado de los insumos estructurales async (marketData/advisorPhotoUrl) que fuerza REMONTAR el visor en vez de difear — NO quitar ese key; (3) SEGUNDO gatillo: dos renders de @react-pdf CO-PRESENTES (visor montado + `pdf().toBlob()` de la descarga) comparten estado interno y corrompen el visor vivo → `handleDownload` hace `flushSync(setIsDownloading(true))` y el visor se DESMONTA (branch "Generando el PDF...") mientras se genera el blob — NO quitar ese desmontaje. Verificación real solo en navegador (tsc/build/node-render no lo detectan).
- **Gotcha Infogram/Zonaprop:** parsers FALLAN RUIDOSO ante shape nuevo (estado `failed` en `market_data_refresh_state`, visible en Configuración) — nunca datos a medias. Override manual: Configuración → "Override manual" (los 4 slots legacy siguen operativos).
- **Gate de migraciones/deploy:** las migraciones `20260701000010` y `20260701000011` deben estar corridas en el Dashboard de Supabase ANTES de deployar este código — el INSERT de `appraisals` incluye `neighborhood_slug`/`market_period`, así que sin esas columnas crear una tasación falla en producción. La migración `20260701000012` (pg_cron, jobs `market-data-core`/`market-data-zonaprop`) se corre DESPUÉS del deploy final (necesita que la URL del sitio ya esté sirviendo las rutas `/api/cron/refresh-market-data`).

---

## REGLA DURA: nunca encadenar varias llamadas de IA dentro de UN request

Ya nos mordió **dos veces** (carruseles 2026-07-22, creación de landing 2026-07-29).
Las funciones de Netlify se cortan bastante antes de los 60s y **`export const
maxDuration = 60` NO sirve acá**: es una directiva de Vercel, Netlify la ignora.
Cuando la función se pasa, el gateway devuelve una **página HTML de error 504** →
el `res.json()` del cliente explota con `Unexpected token '<', "<HTML>..."`, un
mensaje que no dice nada del problema real.

- **Síntoma típico:** el botón queda "cargando" 30s y después un toast ilegible.
  En la consola: `Failed to load resource: the server responded with a status of 504`.
- **Trampa:** el bug es INTERMITENTE, así que parece "andar". La creación de landing
  funcionó 3 veces (25 y 27 de julio) y falló a la cuarta. Las 4 propiedades tenían
  las MISMAS 12 fotos y descripciones parecidas — no había diferencia estructural.
  Era una moneda al aire de latencia contra el techo de tiempo.
- **Diagnóstico:** medir CADA etapa por separado con un script tsx contra la base real.
  **OJO:** `.env.local` NO tiene `GEMINI_API_KEY`, así que las etapas de Gemini
  devuelven en 0.0s con su fallback y **la medición local subestima producción**.
  Sumar a mano el techo de cada llamada Gemini (Vision corta a los 15s).
- **Patrón correcto (el que ya usan carruseles y meta-launch-v2):** el POST de
  creación es RÁPIDO y sin IA, deja la entidad usable, y guarda un puntero de
  etapa. Un endpoint aparte hace **UNA etapa por llamada** y el cliente loopea
  mostrando progreso. Un fallo se reintenta solo en su etapa, sin volver a pagar
  las anteriores.
- **Implementación de referencia:** `lib/landing/enrich.ts` (máquina de etapas pura
  y testeada) + `runEnrichStage` en `landing-service.ts` + `POST
  /api/properties/[id]/landing/enrich` + el loop de `LandingSection.tsx`.
  Una etapa por llamada, no dos: `vision` y `description` van separadas justamente
  porque juntas se pasaban cuando la descripción no estaba cacheada.
- **Compatibilidad:** `nextEnrichStage` devuelve `'done'` cuando falta el campo
  `enrich` → una landing vieja NUNCA se re-genera (re-generar pisaría el contenido
  que el asesor pudo haber editado). Un valor desconocido también cae en `'done'`,
  así el loop del cliente siempre termina.
- **Siempre** leer respuestas con un helper tolerante (`readJson` en
  `LandingSection.tsx`): si el body no es JSON, mostrar el error real
  ("el servidor tardó demasiado"), no el `Unexpected token '<'`.

---

## Generador de Carruseles — Sección "Redes Sociales" (2026-07-21)

Genera carruseles de campaña (largo variable, narrativa de curiosidad) a partir de un tema, con la identidad de marca y la metodología entrenadas. Specs: `docs/superpowers/specs/2026-07-20-carruseles-redes-sociales-design.md` (Fase 0) y `2026-07-21-generador-carruseles-plataforma-design.md` (Fase 1). Plan: `docs/superpowers/plans/2026-07-21-generador-carruseles.md`.

- **Motor (todo en `lib/social/`):** `narrative.ts` + `brand-bible.ts` (OpenAI texto→JSON: guion con gancho→bucles→resolución→CTA, semántica de color rojo=pérdida/verde=acción, Diego solo en gancho/cierre, testimonios reales) → `generate.ts` `processNextSlide` (por slide: `openai.ts` gpt-image-2 según `image_kind` → `compose.ts` mapea a los layouts del `kit.ts` → `render.ts` satori/resvg → `storage.ts` a Storage). `testimonios.ts` = biblioteca real (Federico/Pablo/Claudia). Un carrusel de Fase 0 (`scripts/carousel/`) fue el prototipo; `lib/social` es el port server-side. Smoke tests en `scripts/social/`.
- **Flujo un-paso + procesamiento desacoplado:** `POST /api/social/carousels` genera el guion e inserta slides `pending`. `GET /api/social/carousels/[id]` es **lectura instantánea** (status/progress/slides/step/error — NO genera). **`POST /api/social/carousels/[id]/process`** hace el trabajo pesado: **1 slide por llamada** (`processNextSlide`). El front hace loop `process → status` mostrando progreso + paso actual + errores + botón Reintentar (`{retry:true}` resetea failed→pending). `PATCH .../slides/[n]` edita copy (re-render gratis) o `regenerate` (1 gpt-image-2). `POST .../export` = ZIP (fflate). UI en `app/(dashboard)/redes-sociales/`.
- **GOTCHA (por qué el GET no genera):** meter la generación de imagen (gpt-image-2 ~15-40s) DENTRO del request choca con el **límite de tiempo de las funciones de Netlify (~10-26s)** → la función se mata a mitad, sin escribir nada ni error, y el cliente queda colgado en "Cargando…" (síntoma real, 2026-07-22: carrusel con 0 slides procesados, 0% progreso, sin error). Fix: status read-only + `POST /process` 1 slide por llamada + **`OPENAI_IMAGE_QUALITY=medium`** (más rápida) para caber en el límite. Si el slide igual excede el límite, el loop reintenta (visible, no cuelga) pero **cada timeout igual consume 1 imagen en OpenAI** (la llamada completa del lado de OpenAI aunque la función se mate) — bajar a `low` o mover a Netlify Background Function si persiste.
- **OJO billing OpenAI:** las imágenes fallan con `billing_hard_limit_reached` si se agota el límite duro de la cuenta (nos pasó tras ~25 imágenes de prueba el 2026-07-22). Subir el límite en platform.openai.com/settings/organization/billing/limits. Con el fix de visibilidad, ese error ahora se ve en la UI (antes: "Cargando" mudo).
- **Modelos:** `OPENAI_IMAGE_MODEL=gpt-image-2` (NO `input_fidelity` — es de gpt-image-1; el código lo aplica solo si el modelo empieza con `gpt-image-1`), `OPENAI_TEXT_MODEL=gpt-4.1`. `OPENAI_API_KEY` en Netlify (sin ella la sección da 500). Modelos de imagen disponibles en la cuenta: gpt-image-1/-mini/-1.5/-2. gpt-image-2 preserva la cara de Diego EXCELENTE (2 fotos de referencia en `public/social/diego/`).
- **Fuentes satori:** Montserrat/Lato `.woff` en `public/fonts/` (Next siempre incluye `public/` en el bundle — mismo patrón que `lib/marketing/satori-fonts.ts`). satori NO soporta woff2 ni grid (solo flexbox); el kit ya está en flexbox.
- **RLS/roles:** migración `20260721000001_social_carousels.sql` (tablas + bucket privado `social-carousels` + RLS con `is_operations_user()`/`is_lawyer()`). **El abogado NO ve la sección** (nav en `layout.tsx` + `socialAuth` 403). Asesor ve solo los suyos; ops todo. **Correr la migración ANTES de deployar** (el INSERT falla sin las tablas). Aplicada 2026-07-21 vía `scripts/apply-social-carousels-migration-pg.ts`.

### Gotcha CRÍTICO: Turbopack panica por el acento de la carpeta "Gestión" en el path

- **Symptom:** `next build` y `next dev` (Turbopack, default en Next 16) revientan con `TurbopackInternalError: byte index N is not a char boundary; it is inside '\u{301}'` apuntando a `...Gestión - Diego Ferreyra Inmobiliaria_...`. Explota en archivos preexistentes (no es tu código) durante la emisión de chunks.
- **Root cause:** bug de Turbopack manejando el combining accent U+0301 ("ó" de "Gestión") en el path ABSOLUTO del proyecto. Es puramente por el nombre de la carpeta local.
- **Netlify NO lo tiene:** buildea en `/opt/build/repo` (ASCII), así que el deploy funciona normal. Es un problema SOLO local.
- **Workarounds locales:** (1) dev con **`next dev --webpack`** (evita Turbopack; arranca lento ~4min la primera vez pero sirve OK). (2) Verificar el código con `npx tsc --noEmit -p <tsconfig acotado>` (typecheck no toca Turbopack). NO confiar en `next build` local para validar.

---

## Landing pública premium — diseño (E1.7 → E1.9, 2026-07-24)

**Estado actual (E1.9, APROBADO por el usuario):** la landing es un SISTEMA de LUJO replicable nivel "Villa Eva" (referencia que dio el usuario). Template default `luxury` (`lib/landing/templates/luxury.ts`, `buildLuxuryDocument`) que arma el documento en orden curado de alta conversión: **HeroLuxury** (foto/video + oferta + CTA) → **StatsBar** → **StoryBlocks** (3 numerados I·II·III, foto/texto alternados, de los `benefits` del copy) → **CuratedGallery** + lightbox (recorrido completo) → **FloorPlans** (condicional: solo si `property.plans`) → **CtaBand** (mid) → **LocationShowcase** (banda navy, SIN mapa) → **ClosingInvite** (marca, sin asesor) → **FooterBrand** (CUCICBA) + **FloatingCta**. Todo en `components/landing/luxury/`. Copy IA (`conversion-copy.ts`, reusado) con fallback determinístico. Popup único de captura (`LeadCaptureProvider`) para todos los CTAs. Intensidad por tier (`lib/landing/tier.ts`), curación de fotos (`lib/landing/photo-plan.ts`). Decisiones del usuario: **estética navy con la marca (no marfil/oro)**, **sin asesor/persona en la página**, galería = recorrido completo. Specs: `docs/superpowers/specs/2026-07-24-landing-lujo-replicable-design.md` + plan homónimo. Historial de rechazos: E1.7 y E1.8 fueron rechazados por "parecer portal"/no conectar; la referencia Villa Eva desbloqueó la dirección correcta.

**Editor de landing (E1.6, 2026-07-24):** el asesor retoca el CONTENIDO de una landing desde `/(dashboard)/properties/[id]/landing/edit` (botón "Editar landing" en `LandingSection`, solo si la landing existe; abogado gateado). UI = **panel + vista previa en vivo** (`components/landing/editor/`): `LandingEditor` (shell 2 paneles, `fixed inset-0`), `EditorPreview` (reusa `BLOCK_REGISTRY` en `mode='edit'`, envuelve cada bloque en un overlay clickeable que selecciona y bloquea los CTAs internos; clase `.lx-editor-preview` en globals.css apaga las animaciones), `EditorPanel` → panels por tipo (hero/story/gallery/location/closing = texto; stats/floor_plans/footer = InfoPanel), `PhotoPicker` (elige/reordena fotos **por índice** de `property.photos`, @dnd-kit, patrón de `PhotoGallery.tsx`), `SectionToggles` (mostrar/ocultar solo galería/planos/ubicación). **Alcance = solo contenido**: la estructura de lujo (ids canónicos `hero/stats/story/gallery/plans/cta-mid/location/closing/footer`) queda fija; NO se reordenan secciones ni se agregan bloques arbitrarios ni se borran los CTAs (`closing_invite`) → el invariante Zod (≥1 CTA) siempre se cumple. **Borrador seguro:** migración aditiva `property_landings.draft_content jsonb`; el editor autosalva ahí (`useAutosave` debounce 800ms → `PATCH /landing` con `{draftContent}` → `updateLanding`), la pública sigue leyendo `content` → editar NO afecta lo live hasta "Publicar cambios" (`POST /landing/publish` → `publishLanding` promueve `draft_content→content` y lo limpia vía `pickPublishSource`; si no hay borrador, el flujo del wizard queda byte-por-byte igual). Helpers puros testeados: `lib/landing/editor/{block-order,block-patch,editable,promote}.ts`. **Verificación:** `tsc` + probes (`scripts/landing-editor-*.probe.*`: lógica pura + `renderToStaticMarkup` de preview/panels) — el drag/clic/autosave real SOLO en navegador (Turbopack roto local). Spec/plan: `docs/superpowers/specs|plans/2026-07-24-landing-editor*`.

Las claves de arquitectura/motion de abajo (E1.7) SIGUEN VIGENTES:

La landing (`app/p/[slug]`) se rediseñó a nivel premium (estilo editorial/lujo, una oferta + un CTA). Claves:

- **Layout propio** `app/p/[slug]/layout.tsx`: carga la serif editorial **Cormorant Garamond** (la MISMA de los anuncios Meta → embudo cohesivo) y envuelve todo en `<div class="landing-root">` — scope aislado del dashboard.
- **Sistema por scope CSS** (`app/globals.css`, bloque `.landing-root`): serif en todos los `h1/h2/h3`, `overflow-wrap:anywhere`, selección de marca, y **scroll suave en el scroller real** (`html:has(.landing-root)`, NO en el div `.landing-root` que no scrollea). Eleva TODOS los bloques sin reescribirlos (usan los tokens Tailwind v4 ya premium: off-white cálido + charcoal + navy `--brand`).
- **Motion 100% CSS, cero framer-motion en la landing** (`Hero.tsx` y `Reveal.tsx` son **server components**). Regla dura aprendida en el review adversarial: **NUNCA ramificar la ESTRUCTURA del DOM según `useReducedMotion()`** (devuelve `null` en SSR y el valor real en la 1ª hidratación → hydration mismatch en React 19), y **NUNCA dejar el contenido con `opacity:0` esperando al JS** (con `whileInView`/`animate` de framer-motion el hero/secciones quedan invisibles sin JS o en conexiones lentas — es tráfico pago). Solución: animación por CSS keyframes (`hero-rise/hero-zoom/hero-cue`) y scroll-driven (`animation-timeline: view()` con fallback `@supports`), todo dentro de `@media (prefers-reduced-motion: no-preference)` → el estado por defecto es SIEMPRE visible.
- **Verificación:** como la carpeta con tilde rompe Turbopack, la landing NO se puede ver con `next dev` local. Se verifica con `renderToStaticMarkup` en un script tsx (estructura + que el texto NO tenga `opacity:0`) + WebFetch de una landing en producción. El look final (tipografía, contraste, motion) SOLO se confirma en un navegador real — pedírselo al usuario.

---

## Agente de IA que agenda visitas por WhatsApp — 2026-08-03

Plan: `docs/superpowers/plans/2026-08-03-agente-ia-agenda-y-prioridad.md`.
Reportes de implementación: `.superpowers/sdd/2026-08-03-agente-ia/`.

### Los TRES interruptores (arranca APAGADO, fail-closed)

El agente tiene dos mitades y cada una tiene su propio freno, a propósito:
**analizar** es leer y ordenar la bandeja (cuesta tokens, no le habla a nadie);
**agendar** es un bot escribiéndole a un cliente real. Se puede querer lo primero
sin lo segundo — de hecho ese es el orden natural para estrenarlo.

- **Análisis (el que LEE):** `ai_agent_settings.analysis_enabled` (default `false`).
  Sin esto, cada mensaje entrante dispara una llamada paga al modelo DENTRO del
  webhook. El chequeo vive en `analyzeConversation`, que es el chokepoint: `askModel`
  es privada del módulo, así que **no existe camino hacia el modelo que lo esquive**
  (ni hoy ni cuando alguien agregue un cron o un botón "re-analizar").
- **Agente (el que ESCRIBE), global:** `ai_agent_settings.scheduling_enabled` (default `false`).
- **Agente, por propiedad:** `properties.ai_scheduling_enabled` (default `false`
  desde `20260803000006`; nació en `true` y eso habría prendido las 41 propiedades
  de golpe al activar el global).
- Los tres son **fail-closed**: si están apagados, o si no se puede LEER alguno
  (error de red, tabla ausente, RLS), no pasa nada. Nunca se asume "prendido".

**Para estrenarlo, en este orden** (no hay UI todavía; es SQL en el Dashboard):

```sql
UPDATE ai_agent_settings SET analysis_enabled = true WHERE id;              -- 1. mirar cómo prioriza
UPDATE properties SET ai_scheduling_enabled = true WHERE id = '<la de prueba>'; -- 2. elegir UNA propiedad
UPDATE ai_agent_settings SET scheduling_enabled = true WHERE id;           -- 3. recién ahí, dejarlo hablar
```

**Antes del paso 3, dos cosas siguen abiertas** (documentadas, no resueltas):
el presupuesto de tiempo del webhook no cierra con el agente encendido en el peor
caso (el mail al equipo y las queries a Supabase no tienen techo — ver el comentario
de `AI_BUDGET_MS` en el webhook), y el agente asume que la conversación es sobre la
propiedad del lead MÁS RECIENTE de ese teléfono: un comprador con consultas sobre
dos propiedades puede recibir la dirección equivocada.
- **Tope:** `ai_agent_settings.max_messages_per_conversation` (hoy 3). Al llegar,
  `conversation_ai_state.agent_handed_off = true` **para siempre** en esa
  conversación y queda una nota INTERNA en el chat (`status:'agent_handoff'`, no
  sale por Meta). Al cliente NO se le escribe "ahora te atiende un humano".

### Es un agente que ATIENDE, no un formulario de agendamiento (2026-08-06)

El diseño original tenía un prompt de ANALISTA que clasificaba, y la respuesta la
decidía un parser de expresiones regulares. En la primera prueba con una persona
real el agente preguntó "¿qué día y a qué hora?", el cliente contestó "Mañana", y
el sistema no supo qué hacer. **Un agente conversacional no puede depender de que
la gente conteste con la forma exacta que espera un regex.**

Hoy el modelo entiende la conversación Y redacta la respuesta, en UNA sola
llamada — la misma que ya se hacía para ordenar la bandeja. El prompt vive en
`lib/ai/agent-brain.ts` (`DEFAULT_AGENT_PROMPT`).

**La división que hace que esto sea seguro: el modelo decide qué DECIR, el código
decide qué PASA.** El modelo nunca agenda: propone. `validateProposedVisit`
verifica que la fecha exista, sea futura y esté dentro de 90 días antes de que
nada entre al CRM. Los frenos —interruptores, ventana, tope, visita ya
coordinada— se evalúan en código y MANDAN sobre lo que devuelva el modelo.

**Manda material de verdad** (fotos, planos, video): el modelo pide un TIPO
(`send: ["fotos","video"]`) y `archivosParaEnviar` resuelve los archivos reales
de esa propiedad. El modelo nunca produce URLs. Reglas que están en el CÓDIGO y
no en el prompt, porque tienen que ocurrir SIEMPRE:
- **Fotos y video van juntos**, en las dos direcciones (`completarConVideo`).
  Pedir fotos y recibir solo el video dejó a un cliente sin lo que pidió.
- Tope de 3 archivos por turno: es un límite de TIEMPO (cada envío es un
  roundtrip a Meta dentro del webhook), no de gusto.
- Un link de YouTube NO es video mandable: Meta descarga el archivo desde la URL.
  Por eso se migraron los videos a archivo propio (`video_file_url`).

**Lecciones de tono, todas aprendidas rompiéndolas:**
- Empujaba a agendar en CADA mensaje. La causa no era la instrucción sino la
  FALTA DE INFORMACIÓN: el modelo no podía saber que ya lo había preguntado —el
  resumen acumulado no guarda sus palabras—. Se le pasa su mensaje anterior
  (`ultimoMensajePropio`). **Cuando el modelo se porta mal, preguntarse primero
  qué NO puede saber.**
- Contestaba como una ficha ("La casa tiene 3 ambientes, 2 dormitorios..."). Se
  corrigió con ejemplos de MAL y BIEN en el prompt: es lo único que corrige un tono.
- Repetía el mismo material cada turno: se le pasa `yaMandado`.

### Banco de pruebas: `/admin/ai-agent`

Escribís lo que diría un cliente y ves qué contestaría, SIN mandar WhatsApp ni
escribir nada. Muestra respuesta, archivos, si agendaría, lo que anota para el
equipo, y el prompt completo. **Existe porque probar contra el chat real costó
tres rondas de diagnóstico equivocado**: el dueño probaba contra código que
todavía no había deployado y no había forma de verificar sin pedirle otra
prueba. Usalo ANTES de tocar el prompt.

Esa ruta esquiva `analysis_enabled` a propósito (no es automática, la dispara
una persona con permiso de configuración): apagar el agente no debe impedir
probarlo.

### Apagar el agente en UNA conversación

Botón en el chat del Inbox (`ThreadActionsBar`) → `POST
/api/whatsapp/conversations/[phone]/agent`. Escribe la MISMA columna
(`agent_handed_off`) que usa el tope, así no hay dos frenos que se contradigan,
y deja nota interna con quién lo apagó.

### Dónde corre (y por qué no puede correr en otro lado)

`runSchedulingAgent` corre **pegado** a `runConversationAnalysis`, en el MISMO
ciclo del webhook (`app/api/webhooks/whatsapp/route.ts` → `runAiPipeline`).
`wantsToSchedule`/`proposedSlot` **no se persisten en ninguna columna**: viajan
solo en el resultado del análisis. Si alguna vez se mueve el agente a un proceso
aparte que lee la tabla, esos dos datos NO van a estar ahí.

Sigue siendo UNA sola llamada al modelo por mensaje entrante (ver § "nunca
encadenar varias llamadas de IA dentro de UN request"): la misma que ordena la
bandeja, haciendo el trabajo completo.

**Presupuesto de tiempo (`AI_BUDGET_MS`, hoy 5s):** el POST no arranca el
pipeline si ya se consumió ese tiempo. OJO — estuvo en 1s y eso lo mató: guardar
el mensaje entrante ya se lleva más de un segundo, así que el análisis no corría
NUNCA y el agente parecía apagado. El gate es para no arrancar cuando ni el caso
NORMAL entra, no para cubrir el peor caso teórico.

### Contención del costo (la regla que define el diseño)

1. La IA corre **solo ante un mensaje entrante**; un refresco de pantalla NUNCA
   dispara análisis.
2. Nunca lee la conversación completa: lee un **resumen acumulado (≤400 chars)**
   más los mensajes nuevos, y reescribe el resumen en la misma llamada.
3. Cooldown anti-rebote de 2 min (`debeAnalizar`). **Efecto lateral conocido:** si
   el cliente contesta la propuesta de franjas antes de esos 2 min, esa vuelta no
   hay análisis fresco → el agente no responde hasta el mensaje siguiente.
4. Panel de costo en `/admin/ai-usage` (gate `settings.manage`).

### Migraciones (las 6 aplicadas el 2026-08-03, verificadas contra la base)

```
20260803000001_conversation_ai_state.sql          — memoria + interruptores
20260803000002_whatsapp_messages_ai_generated.sql — marca "lo escribió la IA"
20260803000003_property_visits_created_by_ai.sql  — marca "la agendó la IA"
20260803000004_claim_agent_message_slot.sql       — reserva ATÓMICA del cupo
20260803000005_conversation_ai_state_rls.sql      — RLS solo operaciones
20260803000006_ai_analysis_switch.sql             — interruptor del análisis
```

Scripts que las aplican Y **abortan** si algo no cuadra (cantidad de filas,
filas viejas marcadas como IA, un interruptor que quedó prendido):
`apply-ai-agent-migration-pg.ts`, `apply-ai-markers-migration-pg.ts`,
`apply-ai-claim-and-rls-pg.ts`, `apply-ai-analysis-switch-pg.ts`.

**Trampa que ya nos mordió:** esos scripts re-ejecutan el archivo de migración
ENTERO para verificar. Si un arreglo posterior cambia algo que el archivo viejo
define (una policy, un default), hay que actualizar TAMBIÉN el archivo viejo o
"verificar que está todo bien" revierte el arreglo en silencio. Pasó con la RLS
de `conversation_ai_state`. La migración `000006` se defiende sola con un
`DO $$` que detecta si ya corrió.

**Regla del deploy:** el código manda `created_by_ai` **solo** cuando la visita la
crea el agente. El camino del cliente (`/v/<token>/schedule`, en producción) no
menciona la columna → no hay ventana de deploy que lo rompa. Igual, correr las
migraciones ANTES de prender `scheduling_enabled`: sin `ai_generated`, el log de
lo que manda el agente falla en silencio (`console.warn`) y el síntoma sería "el
agente no manda nada", sin error visible.

### Una sola forma de crear una visita propuesta

`lib/leads/visit-scheduling.ts` (`upsertPendingVisit` + `notifyAndAdvancePipeline`)
salió de `app/api/v/[token]/schedule/route.ts` para que el agente reuse
EXACTAMENTE el mismo camino. **No crear una segunda forma**: si hace falta cambiar
cómo se registra una visita propuesta, se cambia ahí y vale para los dos.

### Plantilla que lo dispara

`recorrido_acceso_v3` (UTILITY, aprobada 2026-08-03): botón URL "Ver recorrido" +
**respuesta rápida "Quiero agendar una visita"**. La respuesta rápida es la clave:
al tocarla ENTRA un mensaje del cliente → abre la ventana de 24hs, deja la
intención registrada y le da el pie al agente. Un segundo botón URL no generaría
nada. Se selecciona con la env var `WHATSAPP_TEMPLATE_RECORRIDO` en Netlify.
