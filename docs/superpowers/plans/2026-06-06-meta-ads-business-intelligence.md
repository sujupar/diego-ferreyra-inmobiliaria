# Plan: Meta Ads como Business Intelligence — wizard de 11 etapas

> **Fecha:** 2026-06-06
> **Estado:** En ejecución
> **Sucede a:** plan de 2026-05-27 (Andrómeda + copy emocional)
> **Filosofía:** el sistema deja de ser un wizard de campaña y se convierte en una **inteligencia de negocio** que aprende de cada propiedad para vender mejor la siguiente.

---

## Contexto

El usuario detectó (con razón) que el sistema todavía está lejos de su visión. La descripción nueva del flow exige rediseñar el wizard en 11 etapas con análisis profundo de cada propiedad, 27 piezas gráficas generadas, custom audiences automáticos, conexión con el sistema de descripciones de portales y mucho más.

**Causa raíz del fallo de generación (resuelta hoy):** el modelo Gemini Image que usábamos era `gemini-2.5-flash-image-preview` que NO existe (404). El correcto es `gemini-2.5-flash-image` (sin `-preview`). Confirmado empíricamente con la API key real.

---

## El nuevo flujo (11 etapas)

| # | Etapa | Detalle |
|---|-------|---------|
| 1 | **Confirmar datos** | Mostrar TODOS los campos internos de la propiedad para revisar/ajustar. |
| 2 | **Recuperar o generar descripción** | Si la propiedad ya se publicó en algún portal (ML/AP/ZP), reusar esa descripción. Si no, llamar al sistema actual de "Generar descripción para portales". Usar como **insumo interno** del análisis. |
| 3 | **Análisis Gemini con progreso** | Barra de progreso visual mientras Gemini Vision lee TODAS las fotos + descripción + características y detecta fortalezas/debilidades. |
| 4 | **3 avatares de comprador** | Mostrar gráficamente 3 perfiles de buyer ideal. Usuario elige uno + puede agregar comentario que **optimiza** el avatar (no lo reemplaza). |
| 5 | **Galería con estrellas** | Recuadros de TODAS las fotos. Asesor marca con estrella las 3 principales. |
| 6 | **Ubicaciones** | Mantener los 3 presets actuales (Cercanos / Similares / Toda CABA). Mejorar la precisión geográfica con Google Places API si suma. |
| 7 | **Generación de creatividades** | Por cada una de las 3 fotos seleccionadas: Gemini crea **3 piezas gráficas distintas** (composiciones diferentes). Cada pieza se adapta a **3 formatos** (1:1, 4:5, 9:16). **Total: 27 piezas.** |
| 8 | **Videos opcionales** | Si la propiedad tiene videos, ofrecer agregar (uno por anuncio). |
| 9 | **Presupuesto** | Definir budget diario. |
| 10 | **Revisión final** | Confirmación de todo antes de publicar. |
| 11 | **Publicar** | Crear campaña + custom audiences (visitantes + conversiones) + conectar landing con UTMs + Pixel + CAPI. |

---

## Implicancias técnicas duras

### Costo y tiempo de generación

- **27 piezas × $0.04 = $1.08 por campaña.** A 50/mes = $54/mes en image gen. Razonable.
- **Tiempo: 27 imágenes × 10-15s = 5-7 minutos.** **No se puede hacer síncrono** en el wizard.
- → Necesitamos **sistema asíncrono con job queue + polling** desde el frontend.

### Storage de las piezas

- Actualmente cacheamos solo el `meta_image_hash` de Meta en `property_ad_assets`. Insuficiente — necesitamos retener la imagen real para mostrar previews al asesor antes de aprobar.
- **Solución:** subir cada pieza a Supabase Storage (bucket `ad-assets`). Guardar storage path en `property_ad_assets`.

### Custom Audiences automáticos

- Endpoint: `POST /act_XXX/customaudiences`
- Para cada campaña creamos 2:
  1. **Visitantes de la landing** (rule por URL contains `inmodf.com.ar/p/<slug>`)
  2. **Convertidores** (rule: visitó la landing + dispararon evento Lead)
- Persistimos los IDs en una tabla nueva `property_meta_audiences`.
- **Bonus a futuro**: cuando hay 100+ visitantes, crear lookalike audiences.

---

## Arquitectura propuesta

### Backend

```
/api/properties/[id]/meta-launch-v2  (nuevo, reemplaza /meta-launch)
  POST /start              → arranca job, devuelve jobId
  GET  /:jobId/status      → estado actual del job (poll cada 3s desde frontend)
  POST /:jobId/confirm     → asesor confirma assets y publica
  POST /:jobId/cancel      → cancelar
```

### Tablas nuevas

```sql
-- Jobs de generación (estado del proceso multi-etapa)
CREATE TABLE meta_launch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('analyzing','generating','awaiting_confirm','publishing','published','failed','cancelled')),
  current_step text,        -- 'analyzing_photos', 'generating_creatives_3_of_27', etc.
  progress_percent int,
  selected_persona_id text,
  persona_comment text,
  starred_photos integer[],  -- índices de las fotos elegidas
  geo_preset_id text,
  daily_budget_ars int,
  result_campaign_id text,
  error_message text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Custom Audiences creadas
CREATE TABLE property_meta_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  campaign_id text REFERENCES property_meta_campaigns(campaign_id),
  audience_id text NOT NULL,
  audience_type text NOT NULL CHECK (audience_type IN ('landing_visitors','landing_converters','lookalike')),
  audience_name text,
  created_at timestamptz DEFAULT NOW()
);

-- Ampliación de property_ad_assets para storage
ALTER TABLE property_ad_assets
  ADD COLUMN storage_url text,
  ADD COLUMN photo_source_index int,
  ADD COLUMN composition_variant int,
  ADD COLUMN dimensions text;  -- 'feed_square', 'feed_vertical', 'story_vertical'
```

### Servicios nuevos / refactor

- `lib/marketing/buyer-avatar-generator.ts` — Gemini genera 3 avatares con descripción práctica + visual cue
- `lib/marketing/property-analysis-orchestrator.ts` — coordina fortalezas, debilidades, avatares
- `lib/marketing/ad-image-async-runner.ts` — corre las 27 generaciones en background con progress updates
- `lib/marketing/meta-custom-audiences.ts` — crea audiences de website + conversion
- `lib/marketing/portal-description-bridge.ts` — busca descripción ya generada o llama al sistema de portales

### Frontend

- Refactor completo de `components/properties/wizards/MetaAdsWizard.tsx`
- Cada etapa como sub-componente:
  - `Step1ConfirmData.tsx`
  - `Step2DescriptionPanel.tsx`
  - `Step3AnalysisProgress.tsx`
  - `Step4AvatarSelector.tsx`
  - `Step5PhotoStars.tsx`
  - `Step6GeoPresets.tsx`  (reutiliza el existente)
  - `Step7CreativeGallery.tsx` (con polling)
  - `Step8VideoOptIn.tsx`
  - `Step9Budget.tsx`
  - `Step10FinalReview.tsx`
- Polling al endpoint de status durante la generación (3s interval)

---

## Fases del trabajo

| Fase | Qué incluye | Esfuerzo |
|------|-------------|----------|
| **F0** | Quick fix: nombre del modelo Gemini → push | ✅ Listo |
| **F1** | Plan documentado | ✅ Listo |
| **F2** | Migración SQL para `meta_launch_jobs` + `property_meta_audiences` + extensión `property_ad_assets` | 30 min |
| **F3** | Servicios backend: orchestrator + avatar generator + async runner + custom audiences | 4-6 h |
| **F4** | API routes: `/meta-launch-v2/start`, `/status`, `/confirm`, `/cancel` | 2 h |
| **F5** | Refactor wizard a 11 etapas (UI con shadcn) | 4-6 h |
| **F6** | Conexión con descripción de portal (Step 2) | 1 h |
| **F7** | Validación E2E con script ampliado | 1 h |
| **F8** | Agente QA + cleanup campaña | 30 min |
| **F9** | `/review` + fixes | 1 h |
| **F10** | Actualizar CLAUDE.md | 15 min |

**Total estimado: 14-19 horas distribuidas en varias sesiones.**

---

## Plan de ejecución incremental

No se puede hacer todo en una sola sesión. Estrategia:

### Sesión actual (HOY)
1. ✅ Diagnóstico Gemini (causa raíz: nombre del modelo)
2. ✅ Fix del nombre del modelo + push
3. ✅ Plan documentado
4. ⏳ Migraciones SQL (F2)
5. ⏳ Servicios backend de avatares y custom audiences (F3 parcial)
6. ⏳ Script de validación de generación real con la key
7. ⏳ Push intermedio

### Sesiones siguientes
- Refactor UI del wizard
- Sistema asíncrono completo con polling
- Custom audiences en el flujo de lanzamiento
- QA + review

---

## Anticipación de problemas (no reactivo)

| Riesgo | Mitigación |
|--------|------------|
| 27 generaciones en paralelo saturan Gemini rate limit | Hacer batches de 3-5 con `Promise.all`, esperar entre batches |
| El asesor abandona el proceso a mitad → assets generados quedan huérfanos | Job con TTL: si no hay confirmación en 24h, cleanup automático |
| Custom Audiences API rate limit | Encolar; los audiences no son críticos para el lanzamiento, pueden tardar |
| Storage de 27 imágenes × N propiedades crece rápido | Política de retención: borrar storage de campañas archivadas hace >30 días |
| `meta_launch_jobs` race condition (mismo asesor abre 2 tabs) | UNIQUE PARTIAL en property_id WHERE status IN ('analyzing','generating','awaiting_confirm') |
| Gemini falla mid-batch (timeout, content policy) | Continuar con las otras, marcar el job como "partial" si faltan; el asesor decide si publicar con menos piezas |
| Frontend pierde conexión durante el polling | Reconectar automáticamente, no perder el jobId |
| Costo Gemini crece a $50+/mes | Aceptable para el valor que entrega. Documentar en CLAUDE.md. |

---

## Notas críticas

- **GEMINI_API_KEY**: confirmada funcional (test empírico 2026-06-06). Modelo correcto: `gemini-2.5-flash-image` (sin `-preview`).
- **Descripción de portal como insumo**: el sistema existe en el componente `GenerateDescriptionCard` debajo del wizard. Hay que crear endpoint que devuelva la descripción del portal correspondiente (o la genere si no existe).
- **No tocar el flujo de captación de propiedades**: este wizard solo aparece para propiedades en `status='approved'`. No alterar nada antes.
- **Idempotencia**: el lock atómico de la sesión anterior (`idx_property_meta_campaigns_one_active`) sigue protegiendo contra duplicados de Campaign. Hay que mantenerlo.

---

## Aceptación

Cuando el flujo nuevo esté funcionando:

- [ ] El asesor puede iniciar campaña sobre la propiedad ficticia
- [ ] Las 11 etapas se muestran secuencialmente con UI profesional
- [ ] El análisis Gemini muestra progreso real (no spinner genérico)
- [ ] Los 3 avatares se generan con info comprensible
- [ ] La selección de 3 fotos por estrellas funciona
- [ ] Las 27 piezas se generan (con polling visible)
- [ ] Las piezas son **distintas entre sí** (composiciones, fotos base)
- [ ] Custom Audiences se crean al lanzar
- [ ] Landing URL queda conectada con UTMs + pixel + CAPI
- [ ] Script E2E pasa verde
- [ ] Agente QA aprueba
- [ ] `/review` sin issues
- [ ] CLAUDE.md actualizado
