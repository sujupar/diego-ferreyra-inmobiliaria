# Spec — Datos de Mercado por Barrio (automático + branded)

**Fecha:** 2026-07-01
**Estado:** Diseño aprobado. Próximo paso: plan de implementación (writing-plans).
**Restricción dura del usuario:** *no romper absolutamente nada* del tasador actual. Todo lo nuevo es **aditivo**, con fallback al comportamiento de hoy.

---

## 1. Objetivo

Subir el nivel de los "Datos de Mercado" del tasador: hoy son **4 imágenes estáticas globales** (CABA-wide) que un admin sube a mano cada mes en Configuración. Queremos que:

1. Se **actualicen solos, una vez al mes**, sin intervención (decisión: **automático total**, pg_cron; NO agente externo ni subir archivo — los datos se pueden traer por HTTP).
2. Dos de las cuatro secciones sean **por barrio** (precio del barrio, tipos de propiedades), asociadas automáticamente al barrio de la tasación.
3. Las gráficas se **rendericen con la identidad Diego Ferreyra** (sin marcas de terceros), reconstruidas desde los datos crudos (decisión: **gráficos propios branded** + imagen oficial del Colegio para escrituras).
4. Cada tasación **congele** el mes con el que se creó (decisión: **snapshot por tasación**; tasaciones viejas no cambian al llegar datos nuevos). Se guarda **histórico ilimitado** (>12 meses), permite regenerar el PDF de cualquier mes.
5. El asesor elija el barrio desde un **dropdown** (catálogo canónico) + opción **"General/CABA"** (fallback: muestra promedio CABA).
6. **GBA Norte** se incluye a granularidad de **partido**, como **2ª ola** sobre la misma infraestructura (decisión confirmada).

---

## 2. Hallazgos de la investigación (Fase 1)

### 2.1 Cómo funciona HOY (estado actual, verificado en código)
- **4 slots FIJOS** hardcodeados: `stock-departamentos`, `escrituras-caba`, `datos-barrio`, `tipos-propiedades` — en TRES lugares: `DEFAULT_SLOTS` (`app/api/settings/market-images/route.ts`), `VALID_SLOTS` (`app/api/settings/upload-market-image/route.ts`) y las claves de `components/appraisal/pdf/PDFReport.tsx` (~L569-616).
- **Storage:** bucket público `market-images`, archivo `{slot}.png` con `upsert:true` → cada subida **pisa** la anterior (sin barrio ni mes ni historial). Fallback estático: `public/pdf-assets/monthly-data/{slot}.png`.
- **Tabla `market_image_settings`** (id=slot, label, description, updated_at) — solo textos. Sin migración CREATE TABLE en el repo (creada a mano en Dashboard). Admin-only por RLS (`20260505000001_rls_per_role_safe.sql`).
- **Consumo:** `PDFPreviewModal` hace fetch **lazy** a `/api/settings/market-images` (cache de módulo `marketImageCache`) y pasa `marketImageLabels`/`marketImageUrls` al PDF. **Se lee EN VIVO** cada vez que se abre el PDF → hoy cambiar una imagen cambia TODAS las tasaciones. Hay **3 caminos divergentes**: descarga del modal (usa Storage), preview del modal y `PDFDownloadButton` (usan los defaults estáticos).
- **Barrio HOY:** texto libre en el paso 1 de `components/appraisal/PropertyWizard.tsx` (inputs address/neighborhood/city), **concatenado** en `location = "dir, barrio, ciudad"`. NO hay columna de barrio en `appraisals` (solo `property_location TEXT`). El PDF re-deriva el barrio con `extractNeighborhood()` (regex frágil que exige `", CABA"`, pero el wizard escribe `"Ciudad Autónoma de Buenos Aires"` → **hoy el barrio del PDF suele salir "CABA"**: bug a corregir de paso). No existe catálogo canónico de los 48 barrios (solo `CABA_NEIGHBORHOODS` en `lib/marketing/neighborhood-data.ts`, ~35 entradas mezcladas con GBA/sub-barrios para Meta Ads).
- **Cron:** las Netlify scheduled functions **NO disparan** en este sitio → todo cron va por **pg_cron** (plantilla `supabase/migrations/20260606000002_cron_publish_listings.sql`; rutas `app/api/cron/*` validan `x-cron-secret == CRON_SECRET`, `maxDuration=60`, POST delega a GET).
- **Scraping:** solo `fetch` + Cheerio vía **ScraperAPI** (`SCRAPER_API_KEY`). **No hay headless browser** (Puppeteer removido, prohibido reintroducir).
- **@react-pdf** necesita URL HTTP **pública** para `<Image src>` (por eso `market-images` es público) — o base64. Ya dibuja donas con `Svg/Path/Circle` nativo.

### 2.2 Las 4 fuentes externas (verificado EN VIVO 2026-07-01)
| Sección | Fuente | Acceso | Granularidad |
|---|---|---|---|
| **Stock (composición)** | Monitor Inmob. (Bryn) | JSON kpis + **Infogram** `window.infographicData` para la composición completa | CABA-wide |
| **Escrituras** | Colegio de Escribanos CABA | **RSS** `/category/estadisticas-de-escrituras/feed/` → item[0] = mes más reciente (imagen JPEG + texto) | CABA-wide |
| **Precio m² por barrio** | Monitor Inmob. (Bryn) | **1 GET** al JSON → array `barrios` (48) | por barrio |
| **Tipos de propiedades** | Zonaprop `/barrios/capital-federal/{slug}` | HTML server-rendered vía **ScraperAPI** (48 GETs/mes) | por barrio |

**Endpoint JSON Bryn (linchpin):** `https://script.google.com/macros/s/AKfycbwKtvJPYs-reH0TeR9QLpAtKFdu90HAKY3NeWa5kRUqZ5ViipkGKle8kOPwNMEW4p91Mg/exec?token=bryn-monitor-2026&origen=monitorinmobiliario` → `{ kpis:{73 campos}, barrios:[48 {barrio,prom,vm,via,deptos,usado,pozo,estrenar,alq_2amb,renta}], _actualizado }`.
- El JSON tiene: `stock_deptos`, `terrenos_oferta`, `locales_oferta`, `oficinas_oferta`, `absorcion`, `escrituras`, `escrituras_mes`, precios, etc.
- **NO** trae en el JSON: conteos de casa/PH/depósitos/cocheras/otros, ni la composición por **antigüedad/vendedor/ant.publicación** → eso vive en el **Infogram** (chart id `09008d4a-dcf6-4acf-aebe-18cb3cfc2f5c`), cuyos datos SÍ se pueden parsear de `window.infographicData` del embed `https://e.infogram.com/09008d4a-...?src=embed`.
- **Mapa de CABA:** el HTML de `monitorinmobiliario.com` trae un **SVG inline con 48 `<path class="barrio-path">`**, cada uno con `data-id` (ej. `palermo`), `data-n`, `data-prom`, `data-vm`, `data-via`, `data-renta`, `data-deptos`. Sirve como **mapa choropleth** y como **fallback** de los datos por barrio si el JSON falla.

**GBA Norte** (verificado descargando PDFs reales):
- **Precio:** `INDEX_GBA_NORTE_REPORTE_{AAAA}-{MM}.pdf` (Zonaprop blog, mensual, `pdftotext`), a nivel **partido** (Vicente López, San Isidro, San Fernando, Tigre, Escobar, Pilar, …) + barrios destacados.
- **Escrituras:** Colegio de Escribanos **PBA** (`colescba.org.ar`, PDF mensual) — **solo total Provincia**, sin desglose por partido.
- **Tipos/stock:** Zonaprop `/barrios/gba-norte/{partido}` + listados, vía ScraperAPI.

### 2.3 Riesgo principal y mitigación
El JSON de Bryn y el Infogram son de un **tercero** con token estático. Mitigación (cimientos sólidos):
- **Persistir el snapshot de cada mes** en DB → si un mes el endpoint falla, NO se pisa lo anterior.
- **Validar** `content-type` + `barrios.length===48` (y estructura del Infogram) antes de persistir.
- **Fallback** a parsear los `data-*` del SVG del mapa (precio por barrio) si el JSON cambia.
- **Parser que falla ruidoso** (log + estado `failed` en tabla de observabilidad), nunca en silencio.
- **Override manual** en Configuración (subir imagen) como respaldo de último recurso.

---

## 3. Arquitectura / Diseño

### 3.1 Modelo de datos (migraciones manuales en Dashboard)
**Tabla `neighborhoods`** (catálogo canónico):
`id uuid pk`, `name text unique` (canónico), `slug text unique` (NFD sin acentos), `zonaprop_slug text`, `zone text` (`caba`|`gba_norte`), `partido text null` (GBA), `lat/lng numeric null`, `active bool default true`, `sort_order int`, `created_at/updated_at`.
- Semilla CABA: los **48 nombres** exactos del JSON Bryn + slugs.
- Fila lógica **"General/CABA"** (slug `general`).
- GBA Norte: se agregan en la 2ª ola.

**Tabla `market_snapshot_caba`** (CABA-wide, 1 fila/mes):
`id uuid`, `period date` (1º del mes), `stock jsonb` (composición: 9 tipos count+%, antigüedad[], vendedor[], ant_publicacion[], stock_deptos, absorcion, terrenos/locales/oficinas_oferta), `escrituras jsonb` (cantidad, monto, var_ia, hipotecas, article_url, image_storage_path, summary_text, mes_label), `source_meta jsonb`, `captured_at`, `created_at`. **`unique(period)`**.

**Tabla `market_snapshot_neighborhood`** (por barrio, 1 fila/(barrio,mes)):
`id uuid`, `neighborhood_id fk → neighborhoods`, `period date`, `price jsonb` (prom, vm, via, usado, pozo, estrenar, alq_2amb, renta, deptos), `property_types jsonb` (departamentos, terrenos, locales, casas, ph, oficinas, total), `source_meta jsonb`, `captured_at`, `created_at`. **`unique(neighborhood_id, period)`** (requisito para upsert — gotcha conocido del proyecto).

**Storage:** bucket público `market-data` para la imagen del Colegio (`escrituras/{period}.jpg`). Las otras 3 gráficas se **renderizan desde datos** (no se almacenan como imagen).

**`appraisals`:** `+ market_period date null`, `+ neighborhood_slug text null`. Ambas nullable → tasaciones legacy = fallback.

**RLS:** escritura solo **service_role** (el cron; sin policy INSERT/UPDATE = deny para clientes). Lectura **`FOR SELECT TO authenticated`** abierta (los datos de mercado no son sensibles por asesor). Patrón plantilla: `20260603000001_portal_inquiries.sql`. Cada tabla nueva declara sus policies en su propia migración.

### 3.2 Contrato central (desacople ingesta ↔ render)
Un resolver **`getMarketDataForAppraisal(neighborhoodSlug, period)`** → devuelve:
```
{
  period,
  caba: { stock:{...}, escrituras:{...} },            // de market_snapshot_caba
  neighborhood: { price:{...}, propertyTypes:{...} }   // de market_snapshot_neighborhood
      | null  // si slug='general'/null → se resuelve al agregado CABA
}
```
El PDF y la UI consumen SOLO este contrato. Así el módulo de render se implementa contra la interfaz aunque el de ingesta no esté listo. Fallback: si no hay fila para `(barrio, period)` → usar el último `period` disponible; si no hay ninguno → las imágenes globales actuales (`market-images`/estáticas). **Cero ruptura para tasaciones legacy.**

### 3.3 Ingesta automática (pg_cron)
Ruta(s) `app/api/cron/refresh-market-data*` (patrón `x-cron-secret`, `maxDuration=60`, service-role, try/catch con estado en tabla singleton de observabilidad — patrón `portal-inquiries`). Registro con pg_cron (plantilla `20260606000002`). Idempotente por `period` → **auto-reparable**.
- **Barato/directo (frecuente):** JSON Bryn (stock kpis + 48 barrios precio) + Infogram (composición) + RSS Colegio (escrituras: descarga JPEG a Storage + resumen de texto). Upsert `market_snapshot_caba` + parte `price` de `market_snapshot_neighborhood`.
- **Con proxy (mensual):** 48 GETs Zonaprop vía ScraperAPI → `property_types` de `market_snapshot_neighborhood`. (Separado para acotar costo de proxy; cadencia exacta se fija en el plan.)
- **Resumen de escrituras:** extracción por reglas de las cifras clave del artículo (Gemini opcional para prosa).

### 3.4 Barrio en el wizard
- Reemplazar el `<Input>` de barrio (paso 1 de `PropertyWizard.tsx`) por un **combobox** alimentado por `neighborhoods` (48 CABA + "General"; GBA en 2ª ola).
- Persistir `neighborhood_slug` + `market_period` (mes vigente) en la tasación al guardar (`insertAppraisalWithComparables`, `POST /api/appraisals`).
- **Corregir** el barrio del PDF: pasar el barrio canónico directo (no re-derivar con el regex frágil). Modo edición: mapear el texto libre viejo por normalización (o "General").
- No romper: el flujo de guardado, `editId`, ni el deal auto-creado (que hoy parsea `location.split(',')[1]`) — se alimentan del slug canónico, mejorando consistencia.

### 3.5 Render en el PDF (4 secciones, estilo aprobado)
Reconstruir con SVG/estilos nativos de @react-pdf, identidad Diego Ferreyra (azul `#1a5490`, Montserrat), **sin watermark**:
1. **Stock (CABA)** — dashboard compacto: **tabla** TIPO/CANTIDAD/% + **semi-dona** "Tipo de inmueble" + 3 mini-semi-donas (Vendedor, Antigüedad, Ant. publicación). Datos de `caba.stock`.
2. **Escrituras (CABA)** — **imagen oficial del Colegio** (de Storage) + resumen de texto. Datos de `caba.escrituras`.
3. **Datos del barrio** — **panel de precios** (promedio destacado + usado/pozo/estrenar/alquiler/renta/deptos) + **mapa choropleth de CABA con el barrio resaltado** (relleno claro + contorno dorado, sin tooltip). Datos de `neighborhood.price` + SVG del mapa (48 paths con `data-id`). Si "General" → promedio CABA, sin resaltar.
4. **Tipos de propiedades** — **dona** de 6 tipos + leyenda. Datos de `neighborhood.propertyTypes`. Si "General" → suma de los 48.

Snapshot: el PDF resuelve por `(neighborhood_slug, market_period)` congelados. Se **unifican los 3 caminos** (descarga del modal, preview, `PDFDownloadButton`) para que no diverjan. El cache de módulo de `PDFPreviewModal` se **parametriza por (barrio, period)** o se invalida.

### 3.6 Configuración
La sección "Datos de Mercado Mensuales" pasa de "subir 4 PNG" a un **panel de estado**: mes vigente, qué se capturó por fuente, cuándo, estado (ok/failed), botón **"Refrescar ahora"** (dispara el cron on-demand). Se conserva la **subida manual como override** de emergencia por fuente.

### 3.7 GBA Norte (2ª ola)
Misma infraestructura (tablas agnósticas de fuente). Se agregan: partidos GBA Norte al catálogo `neighborhoods` (`zone='gba_norte'`); parsers de los **2 PDFs** (INDEX Zonaprop GBA Norte para precio por partido; Colescba para escrituras Provincia con rótulo "Provincia de Bs. As."); tipos/stock por partido vía ScraperAPI. Granularidad **partido** (no barrio fino). Se implementa DESPUÉS de que CABA esté probado.

---

## 4. Unidades / módulos (para implementación por subagentes con contratos)
- **A. Migraciones + catálogo** — 3 tablas + 2 columnas + seed 48 barrios + bucket. Entrega el schema y el seed.
- **B. Fuentes/parsers** — `lib/market-data/sources/*` (bryn-json, infogram, colegio-rss, zonaprop-tipos), cada uno con salida tipada. Puro, testeable con fixtures.
- **C. Ingesta + cron** — ruta `app/api/cron/refresh-market-data*` + worker que orquesta B → upsert A + observabilidad + migración pg_cron.
- **D. Resolver** — `getMarketDataForAppraisal()` (contrato §3.2) + fallbacks.
- **E. Wizard/barrio** — combobox + persistencia + fix del barrio canónico.
- **F. Render PDF** — las 4 secciones + mapa SVG + unificar los 3 caminos + cache por barrio.
- **G. Configuración** — panel de estado + refrescar + override manual.
Contratos que desacoplan: la **salida tipada de cada source (B)**, el **shape de las tablas (A)** y el **contrato del resolver (D)**. F y G trabajan contra D; C trabaja contra A+B.

## 5. Compatibilidad — "no romper nada"
- Columnas nuevas nullable; tasaciones sin barrio/period → fallback a imágenes globales de hoy.
- No se toca el motor de cálculo (Ross-Heidecke) ni el flujo de guardado.
- Los 3 puntos hardcodeados de slots se migran con cuidado; el override manual se conserva.
- `PDFPreviewModal` cache parametrizado (no servir el barrio equivocado).

## 6. Fuera de alcance (por ahora)
- GBA Oeste/Sur, Rosario u otras zonas del INDEX.
- Escrituras GBA por partido (la fuente no lo desglosa).
- Envío/notificación automática del informe.

## 7. Verificación (Fase 4)
- Cron corre e ingesta: `market_snapshot_caba` + `_neighborhood` con el mes vigente; observabilidad ok.
- Tasación en Palermo → PDF muestra datos de Palermo (precio + tipos + mapa resaltado) y stock/escrituras CABA.
- Tasación "General" → agregados CABA, mapa sin resaltar.
- Snapshot: tasación de un mes previo mantiene sus datos al llegar el mes nuevo.
- Fuente caída → no pisa el mes anterior; estado `failed`; override manual funciona.
- Legacy: tasación vieja sin barrio → sigue renderizando (imágenes globales).
- `tsc` + build OK. Commit `Sujupar <redstyle50@gmail.com>`.

## 8. Estilo visual aprobado
Definido en los mockups (`.superpowers/brainstorm/`, v6): identidad Diego Ferreyra, las 4 secciones descritas en §3.5. Aprobado por el usuario 2026-07-01.
