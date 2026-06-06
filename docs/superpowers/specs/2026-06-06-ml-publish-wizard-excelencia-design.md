# Wizard de publicación en MercadoLibre "de excelencia" — Diseño

**Fecha:** 2026-06-06
**Estado:** Aprobado para plan de implementación
**Autor:** Claude + Diego Ferreyra Inmobiliaria

## 1. Contexto y objetivo

MercadoLibre asigna un **score interno de calidad/posicionamiento** a cada aviso según qué tan completo y bien armado está. Hoy nuestro wizard de publicación está **desalineado** con lo que necesita el negocio y le faltan los factores de mayor impacto para ese score. El objetivo es rehacer el flujo de publicación para que un **asesor (no experto)** arme un aviso **de excelencia** de forma **súper intuitiva**, maximizando la completitud que premia ML.

Solo MercadoLibre está habilitado hoy (OAuth real en producción, sin sandbox). El rework es **solo ML** por ahora, pero la arquitectura no debe cerrarse a futuros portales.

## 2. Brechas que resuelve (de la auditoría)

| Factor de score ML | Estado hoy | Lo resuelve |
|---|---|---|
| Completitud de atributos por categoría | 9 atributos hardcodeados, nunca consulta la API | **Fetch dinámico** de `/categories/{id}/attributes` + formulario generativo prelleno |
| Video / Tour 3D | nunca se manda (`video_id` declarado, nunca seteado) | Paso de medios + extracción de ID de YouTube + mapping |
| Fotos (portada + calidad) | reorden ↑/↓, portada implícita, sin validar resolución | Paso de imágenes dedicado, portada + 2 explícitas, drag&drop, chequeo de resolución |
| Descripción rica del prompt | el generador vive **fuera** del wizard | Integración como paso del wizard (generar/regenerar/aceptar) |
| Geolocalización precisa | obligatoria pero sin capturador | Geocoding (Google) + confirmar pin en mapa (Leaflet/OSM) |
| Frescura (updates a ML) | worker roto (scheduler Netlify) | Migración del worker a **pg_cron** |

## 3. Decisiones cerradas (con el usuario)

1. **Campos ML → dinámico** desde `GET /categories/{id}/attributes`, con caché de 24h.
2. **Geolocalización → geocoding + confirmar en mapa** (Google Geocoding server-side; mapa Leaflet/OSM, sin key extra).
3. **QA → publicar → verificar → cerrar**, con endpoint de teardown seguro que cierra SOLO el ítem de ML sin borrar la propiedad.
4. **Worker sync → migrar a pg_cron** en este trabajo.
5. **Dirección visual aprobada** (mockups): stepper horizontal, grilla de fotos con portada/2ª/3ª destacadas, campos agrupados Obligatorios/Recomendados con barra de completitud, animaciones limpias (framer-motion).
6. **Orden de fotos único**: al elegir portada se reordena `properties.photos` (canónico) y ese mismo orden se respeta en la landing `/p/[slug]`.
7. **Listing type default `gold_premium`** (negocio premium/HNWI), con opción de bajar de tier.

## 4. Flujo de 6 pasos (UX)

Wizard accesible desde el detalle de la propiedad (status `approved`) → `/properties/[id]/marketing/mercadolibre`. Stepper horizontal arriba; transiciones con framer-motion; cada paso valida antes de habilitar "Siguiente". Si ya existe un listing publicado → entra directo al **panel de gestión** (se conserva el actual).

1. **📸 Imágenes.** Grilla con TODAS las fotos de `properties.photos`. Drag & drop para ordenar; la 1ª = ⭐ portada, 2ª y 3ª destacadas (son las que ML muestra primero). Chequeo de resolución mínima (warning no bloqueante). Persiste el orden en el array **canónico** `properties.photos`, por lo que **el mismo orden se refleja también en la landing `/p/[slug]`** (decisión confirmada con el usuario: un solo orden de fotos para todo).
2. **🎬 Video / Tour.** Si hay `video_url` y/o `tour_3d_url` (editables acá), el asesor elige **cuál** mandar a ML (ML acepta video de YouTube; el tour suele ir como link). Regla "uno u otro" configurable por portal. Guarda `media_choice` en el draft.
3. **📋 Campos de ML.** Trae **en vivo** los atributos de la categoría resuelta (con caché). Render dinámico agrupado en **Obligatorios** y **Recomendados**, prellenos con lo que ya tenemos (badge verde ✓), faltantes resaltados. Barra de **completitud %**. Incluye **geolocalización**: geocode de la dirección + mini-mapa con pin arrastrable para confirmar lat/lng. Selector de **listing type** con **default `gold_premium`** (decisión del usuario: máxima exposición para el negocio premium/HNWI); las opciones se traen de las disponibles para la categoría (`/categories/{id}/available_listing_types` o `/sites/MLA/listing_types`), permitiendo bajar de tier si se quiere. Confirmable.
4. **✍️ Descripción.** Genera la descripción con el sistema de prompts "GPT Portales" (`generatePortalDescription`), mostrando title/subtitle/body. Botones **Regenerar** (con perfil de comprador / notas) y **Aceptar**. Edición manual opcional con validación ≥100 chars y disclaimer preservado.
5. **👁️ Resumen visual.** "Así se va a ver el aviso", fiel a ML: portada + 2 secundarias, título, precio, atributos clave, categoría, descripción. Dos botones: **Editar algo** (vuelve al paso elegido) / **OK, ir a publicar**.
6. **🚀 Confirmar y publicar.** Resumen final + **Confirma y publica**. Pantalla de éxito con ID y link al aviso. Tras publicar, queda disponible el panel de gestión (pausar/cerrar).

## 5. Arquitectura y componentes

### 5.1 UI (descomposición del wizard monolítico)
El actual `MercadoLibreWizard.tsx` (~760 líneas, todo en uno) se descompone en unidades con responsabilidad única:

- `components/properties/wizards/ml/MercadoLibreWizard.tsx` — **shell**: stepper, navegación, animaciones, orquestación del draft. No contiene lógica de cada paso.
- `components/properties/wizards/ml/steps/StepImages.tsx`
- `components/properties/wizards/ml/steps/StepMedia.tsx`
- `components/properties/wizards/ml/steps/StepFields.tsx` (incluye `<GeoPinMap/>`)
- `components/properties/wizards/ml/steps/StepDescription.tsx`
- `components/properties/wizards/ml/steps/StepReview.tsx`
- `components/properties/wizards/ml/steps/StepConfirm.tsx` (+ estado "done")
- `components/properties/wizards/ml/ManageListingPanel.tsx` (extraído del actual)
- `components/properties/wizards/ml/GeoPinMap.tsx` — client-only (Leaflet, `dynamic(ssr:false)`)
- `components/properties/wizards/ml/useMlPublishDraft.ts` — hook de estado + persistencia del draft.

**Contrato de cada step:** recibe `{ draft, property, attributesSchema, onChange, onValidityChange }` y emite cambios al draft + su estado de validez. Así cada step se entiende y prueba aislado; el shell solo conoce el contrato, no los internos.

### 5.2 Dominio (lib/portals/mercadolibre)
- **Nuevo** `category-attributes.ts`: `fetchCategoryAttributes(categoryId)` → consulta `/categories/{id}/attributes` vía `mlFetch`, cachea en tabla `ml_category_attributes` (TTL 24h), clasifica en `required` / `recommended` (por `tags.required`, excluye `tags.hidden`/`read_only`/`variation_attribute`), normaliza `value_type` (string/number/number_unit/boolean/list) y `allowed_values`.
- **Modificar** `mapping.ts`: `propertyToMlPayload(property, opts)` acepta `opts = { attributeOverrides, mediaChoice, listingType, categoryId }`. Construye attributes mergeando (a) derivados de la propiedad → ids ML conocidos + (b) `attributeOverrides` del draft, **filtrando contra el schema de la categoría** (descarta ids inválidos). Setea `video_id` extrayendo el ID de YouTube cuando `mediaChoice='video'`. Usa `listingType` (**default `gold_premium`**, validado contra los listing types disponibles de la categoría; cae a `silver` si `gold_premium` no estuviera disponible). Mantiene `buildLocation`/`buildTitle`.
- **Nuevo** helper `media.ts`: `extractYouTubeId(url)`.
- `adapter.ts`: sin cambios de contrato; `publish/update/pause/unpublish` ya sirven. `update` ya filtra attrs calculados.

### 5.3 API (rutas Next.js)
- **Nueva** `GET /api/properties/[id]/ml-attributes` → resuelve categoría, devuelve `{ categoryId, categoryName, required[], recommended[], prefill{} }` (schema + valores prellenos desde property + draft).
- **Modificar** `PATCH /api/properties/[id]/ml-preview` → además de title/description/photos/asking_price, acepta `mlAttributes`, `mediaChoice`, `listingType`, `videoUrl`, `tour3dUrl`, `latitude`, `longitude`. Persiste atributos/medios/listingType en `property_listings.metadata` (draft); lat/lng/video/tour en `properties`.
- **Nueva** `POST /api/geocode` → geocoding server-side con `GOOGLE_GEOCODING_API_KEY` (dirección → {lat,lng,formatted}); guard auth.
- **Nueva** `app/api/cron/publish-listings/route.ts` (POST/GET, `maxDuration=60`, valida `x-cron-secret==CRON_SECRET`) → ejecuta `worker-logic` (procesa pending/needs_update/needs_unpublish/retry). Migración del worker roto.
- **Nueva/confirmar** teardown seguro de QA: usar `PATCH /ml-publish {action:'close'}` (cierra ítem, NO borra propiedad). Se documenta que `DELETE /api/admin/pipeline-test` NO se usa (cascade destructivo).

### 5.4 Datos (Supabase)
- **Nueva tabla** `ml_category_attributes` (caché): `category_id text PK`, `attributes jsonb`, `fetched_at timestamptz`, RLS service_role + read authenticated.
- **Sin columnas nuevas en `properties`**: el orden de fotos vive en `properties.photos`; lat/lng/video_url/tour_3d_url ya existen.
- **`property_listings.metadata`** (jsonb ya existe) guarda el draft de publicación: `{ ml_attributes:{<attrId>:value}, media_choice, listing_type, geo_confirmed }`.

### 5.5 Dependencias nuevas
- `framer-motion` (animaciones del wizard).
- `leaflet` + `react-leaflet` (mapa de confirmación; client-only). Tiles OSM, sin key.

## 6. Mapeo de datos de la propiedad → atributos ML (prefill)

| Campo propiedad | Atributo ML (id) | Notas |
|---|---|---|
| rooms | ROOMS | |
| bedrooms | BEDROOMS | |
| bathrooms | FULL_BATHROOMS | |
| garages | PARKING_LOTS | |
| covered_area | COVERED_AREA | number_unit "m²" |
| total_area | TOTAL_AREA | number_unit "m²" |
| expensas | MAINTENANCE_FEE | "ARS" |
| age | PROPERTY_AGE | unidad explícita ("años"/"A estrenar") |
| floor | FLOORS | |
| amenities (Json) | atributos booleanos/list según categoría | mapeo por nombre ⇒ value_id del schema |
| (falta) | DISPOSITION, ORIENTATION, WITH_BALCONY, IS_FURNISHED… | los completa el asesor en el paso 3 |

La fuente de verdad de **qué** atributos existen y cuáles son obligatorios es el schema dinámico de ML; esta tabla solo define el **prefill** de los que ya tenemos.

## 7. Manejo de errores

- **ML caído / 5xx / rate limit:** `PortalAdapterError` ya distingue retryable; el wizard muestra toast claro y permite reintentar. El fetch de atributos cae a caché previa si existe; si no, degrada al set derivado de la propiedad con aviso.
- **Atributo inválido por categoría:** se filtra contra el schema antes de publicar (evita 400 silencioso).
- **Descripción <100 chars:** validación bloqueante en el paso 4 antes de avanzar.
- **lat/lng sin geocodificar:** bloquea publicar; el paso 3 obliga a confirmar el pin.
- **OAuth expirado:** `mlFetch` refresca; si falla, 412 "ML no conectado" con link a Settings.
- **QA:** teardown idempotente; si el item está en `not_yet_active`, se respeta el flag `needs_pause_after_active`.

## 8. Estrategia de testing

- **Unit:** `category-attributes` (clasificación required/recommended, normalización, TTL de caché), `mapping` con overrides + filtrado por schema, `extractYouTubeId`, parseo de geocode. Actualizar `mapping.test.ts`.
- **Componente:** validez de cada step (gating de navegación).
- **QA end-to-end (con propiedad de prueba):** publicar en ML real → verificar vía `GET /items/{id}` que título, categoría, fotos (orden), atributos, descripción, video y ubicación quedaron exactamente como en el wizard → **cerrar** el ítem (teardown seguro) → confirmar que la propiedad de prueba **sigue existiendo** → reportar al usuario para su prueba manual. Filtro de seguridad: solo propiedades con prefijo `[TEST` (regla CLAUDE.md).

## 9. Riesgos y mitigaciones

- **Publicar aviso real en QA:** mitigado por teardown inmediato (close) + filtro `[TEST` + verificación de no-borrado de la propiedad.
- **Cierre irreversible por error:** el teardown de QA actúa solo sobre el listing de la propiedad de prueba identificada por id.
- **Doble envío si Netlify revive el scheduler:** el worker en pg_cron debe ser idempotente (lock por `next_attempt_at`/status); documentar en CLAUDE.md.
- **Atributos ML deprecados:** al filtrar contra el schema dinámico, dejan de romper el publish.
- **Tokens OAuth en texto plano:** fuera de alcance (TODO pgsodium ya documentado).

## 10. Fuera de alcance (follow-ups)

- Argenprop / ZonaProp (sin credenciales hoy).
- Cifrado pgsodium de tokens.
- Capturador de lat/lng en el form de alta (lo resolvemos dentro del wizard).
- Validación de coherencia de precio vs mercado.
