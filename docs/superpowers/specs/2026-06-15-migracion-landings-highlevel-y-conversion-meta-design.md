# Migración de Landings (HighLevel → plataforma) + Sistema de Conversión Meta — Design Spec

- **Fecha:** 2026-06-15
- **Estado:** Forma general aprobada por el usuario (Approach A). Spec pendiente de revisión.
- **Autor:** Claude (brainstorming) — para Diego Ferreyra Inmobiliaria
- **Tipo:** Master spec. Se implementa en fases; cada fase produce su propio plan de implementación (writing-plans).

---

## 1. Contexto y objetivo

Las dos landing pages que hoy reciben el tráfico publicitario viven en una **subcuenta white-label de HighLevel (GoHighLevel)** de la marca "NinjaSellFunnels". Esa subcuenta **va a cerrarse**, lo que implica perder: las páginas, los formularios, el hosting de los videos, y el pipeline `🟢 GESTIÓN COMERCIAL - PROPIETARIOS` que hoy esta plataforma importa con `ghl-poll`.

Las dos landings:

- **Tasación Directa** — `inmobiliariadiegoferreyra.com/tasacion-directa`. HTML estático propio (archivo `Landing Tasación.md`). Form = iframe de GHL (`Form - [TASACIÓN DIRECTA]`). Sin tracking. Genera leads de tasación reales y buenos.
- **Clase Gratuita (VSL)** — `inmobiliariadiegoferreyra.com/vsl-clase-propietarios`. Página construida en HighLevel/Nuxt (archivo `Landing Clase Gratuita.md`). Form = `Form - [CLASE PROPIETARIOS]` en popup. Pixel `589579724932979` (solo PageView).

**Objetivo:** migrar ambas a la plataforma propia (Next.js 16 + React 19 + Supabase), elevarlas visualmente a nivel premium sin romper la conversión probada, montar un sistema de conversión Meta de máxima calidad (Pixel + CAPI con deduplicación estricta y match alto + Públicos Personalizados por etapa del embudo), y cortar el dominio para que el link de campaña siga funcionando idéntico — todo sin doble conteo ni pérdida de eventos.

---

## 2. Decisiones tomadas (locked-in)

| # | Decisión | Elección |
|---|----------|----------|
| 1 | Alcance GHL | **Retiro total.** El CRM/pipeline queda 100% en esta plataforma como única fuente de verdad. Se desmantelan `ghl-poll` + webhook GHL. |
| 2 | Dominio de campaña | `inmobiliariadiegoferreyra.com` (dominio propio, distinto de `inmodf.com.ar` donde corre la app). Paths exactos a preservar: `/tasacion-directa` y `/vsl-clase-propietarios`. DNS reapuntable → el link de campaña **no cambia**. |
| 3 | Pixel Meta | **Unificar todo en UN pixel/dataset.** ✅ Confirmado por el usuario (2026-06-15): el pixel `589579724932979` de la clase **es el mismo** que `META_PIXEL_ID` de campañas → es el pixel maestro. |
| 4 | Datos del lead | **Formularios mínimos + enriquecer con señales automáticas** (fbp/fbc/click-id/IP/UA + ciudad/país derivados + external_id). No agregar campos que bajen conversión. |
| 5 | Públicos Meta | **Un público por etapa clave + mover al lead al avanzar (DELETE del anterior, POST al nuevo) + EXCLUIR convertidos** (`captured`/`lost`) del prospecting. |
| 6 | Portadas de testimonios | **Frame real del video, tratado** (encuadre, color, marca sutil, badge con nombre + resultado, play premium). 100% auténtico — la cara es la persona real. |
| 7 | Nivel visual | **Premium sobrio y rápido.** `motion` + `gsap` (sin Lenis/R3F/Spline). Liviano en mobile, sin tocar LCP/conversión. |
| 8 | Form Tasación | **Contacto + ubicación de la propiedad** (nombre, teléfono, email + barrio/dirección). |
| 9 | Estrategia de corte | **Approach A:** construir y validar todo en rutas internas de `inmodf.com.ar`; corte en una sola ventana (DNS flip + apagado de Pixel/forms de GHL simultáneo). Cero solapamiento de Pixel. |

---

## 3. Arquitectura general (5 subsistemas, en orden de dependencia)

```
Fase 0  Rescate de assets + prerrequisitos (URGENTE: bajar media de GHL antes del cierre)
   │
Fase 1  Páginas nativas (en staging /inmodf.com.ar) + testimonios en DB + media en Storage
   │
Fase 2  Captura de leads (lib compartido + endpoints públicos anti-spam → contacts+deals)
   │
Fase 3  Conversión Meta unificada (Pixel + CAPI, event_id compartido, advanced matching)
   │
Fase 4  Públicos por etapa (tablas + hashing + worker pg_cron + exclusiones en campaign builder)
   │
Fase 5  Corte de dominio + baja de GHL (cutover en ventana única + decommission)
```

Principio rector: **construir reutilizando lo que ya existe** (Pixel `MetaPixel.tsx`, CAPI `lib/marketing/meta-capi.ts`, patrón de endpoints públicos service-role, patrón pg_cron + `x-cron-secret`). El único greenfield real es la sincronización de Públicos por etapa.

---

## 4. Subsistema 1 — Páginas nativas

### 4.1 Rutas y aislamiento

- Nuevo grupo de rutas públicas, p.ej. `app/(funnels)/tasacion-directa/page.tsx` y `app/(funnels)/vsl-clase-propietarios/page.tsx`.
- **Fuera** de los layouts `(dashboard)`/`(auth)`. Sin `requireAuth`. Server Components que leen de Supabase con cliente service-role (mismo patrón que `app/p/[slug]/page.tsx`).
- Páginas de gracias: `app/(funnels)/gracias-tasacion/page.tsx` y `app/(funnels)/gracias-clase/page.tsx` (destino post-submit; reemplazan el "go-to-next-funnel-step / Gracias VSL" de GHL).
- **No CMS.** Son 2 páginas a medida con copy versionado en código (YAGNI: un CMS para 2 páginas es over-engineering). El contenido dinámico (testimonios) sí sale de DB.

### 4.2 Stack visual (premium sobrio)

- Dependencias nuevas: **`motion` (v12)** + **`gsap` (3.13)** con `@gsap/react` (`useGSAP`). **NO** agregar Lenis, react-three-fiber, drei ni Spline (riesgo LCP/INP en página con video; confirmado en investigación). Esto reemplaza la nota de memoria `scroll_animation_stack` (pensada para "art pieces", no para una landing de conversión).
- Página = Server Component con **islas `'use client'` chicas** (hero video, modal de form, lightbox de testimonios, reveals de scroll). `motion`/`gsap` nunca en el hero crítico.
- **Presupuesto de performance (mobile):** LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.
- Hero: poster `next/image` con `fetchPriority="high"` como LCP; el video arranca `muted playsinline` tras `loadeddata` con overlay "Activá el sonido" (replica la UX de GHL). `prefers-reduced-motion` respetado en todas las animaciones.
- Técnicas "caras" permitidas, sin relleno: escala tipográfica de alto nivel, easing curado, reveals al scroll, micro-interacciones (botón magnético sutil), gradientes/grain tasteful. Tokens de marca existentes: navy `#0d2d49`, verde CTA `#00BF63`, Montserrat (titulares) + Lato (cuerpo).

### 4.3 Testimonios desde DB

- Tabla `funnel_testimonials` (ver §9). Los 3 testimonios (Federico, Pablo, Claudia) son **compartidos** por ambas landings.
- Render: tarjeta premium = portada (frame real tratado) + badge de resultado ("Vendió en 25 días") + nombre + ubicación + botón play. Click → lightbox de video (componente cliente con focus-trap, ESC, scroll-lock — el modal de GHL no es accesible).
- Portadas: extraer el mejor frame de cada video real, tratarlo (encuadre/color/marca/badge). Herramienta: Higgsfield/Gemini para tratamiento de imagen a partir del frame real (NO generar caras nuevas — los testimonios son reales).

### 4.4 Media re-alojada en Supabase Storage

- ✅ **Fase 0 EJECUTADA (2026-06-15).** Las 12 piezas se descargaron de los CDN de GHL y se subieron al bucket público **`funnel-media`** de Supabase. Inventario completo en [`2026-06-15-fase0-media-rescue-manifest.json`](./2026-06-15-fase0-media-rescue-manifest.json). Detalle:
  - **2 heroes** (tasación 3:15 / clase VSL 3:45) eran **HEVC 1080p** (242MB/196MB) → exceden el límite global de Storage (~50MB) **y** HEVC no reproduce en Chrome/Firefox. Se transcodificaron a **H.264 720p (~21/22MB)** en `funnel-media/web/` (`tasacion-hero-web.mp4`, `clase-vsl-web.mp4`). El RAW HEVC master quedó **solo en local** (`media-rescue/raw/`, gitignored) — archivar aparte si se sube el límite del proyecto.
  - **3 videos de testimonios** (verticales) en `funnel-media/raw/`: Pablo (h264 480x848) y Claudia (h264 720x1280) ya web-ready; **Federico** es `.mov` **HEVC** → pendiente transcodificar a H.264 en Fase 1.
  - **7 imágenes** en `funnel-media/raw/`: 3 posters de testimonios (1280x720, landscape — no coinciden con los videos verticales), logo "DIEGO FERREYRA / Martillero CUCICBA 8266", headshot de Diego, gráfico decorativo "VIP TICKET", y el poster-frame del VSL.
- Fase 1 reemplaza todas las URLs `filesafe.space` / `storage.googleapis.com/msgsndr` / `images.leadconnectorhq.com` por las de `funnel-media`, y trata las portadas de testimonios (frame real + badge).

---

## 5. Subsistema 2 — Captura de leads

### 5.1 Lib compartido (refactor)

Hoy la lógica de creación de lead está **inline** en `app/api/webhooks/ghl/form-submission/route.ts`. Extraer a un lib reutilizable, p.ej. `lib/funnel/create-funnel-lead.ts`:

```
createFunnelLead({ funnel: 'tasacion' | 'clase', name, email, phone, propertyLocation?, tipoCliente?, utm, metaSignals })
  → dedup contacto (email → phone)
  → createDeal({ stage, origin, property_address: placeholder, ... })
  → createTaskForRole('coordinador', ...)
  → notifyDealCreated (tasación)  |  notifyClassRegistration (clase)   [con notifyWithEscalation]
  → return { contactId, dealId }
```

Mapeo (debe replicar exactamente el comportamiento actual para no romper `/metrics`):

| Funnel | stage | origin (deal y contact) | property_address | Notificación |
|--------|-------|--------------------------|------------------|--------------|
| Tasación | `request` | `embudo` | `"Solicitud de tasación — <name>"` o la ubicación capturada | `notifyDealCreated` |
| Clase | `clase_gratuita` | `clase_gratuita` | `"Clase Gratuita — <name>"` | `notifyClassRegistration` (NUNCA la de tasación) |

- El webhook GHL puede pasar a usar este mismo lib hasta que se desmantele (Fase 5), garantizando paridad.

### 5.2 Endpoint(s) público(s)

- Nuevo: `POST /api/funnel/submit` (o dos rutas dedicadas). Público, service-role, `runtime nodejs`.
- **Anti-spam** (la entrada GHL no tenía ninguno y no se puede exponer `GHL_WEBHOOK_SECRET` al browser): (a) rate-limit basado en DB (no in-memory — no sobrevive serverless), (b) dedup por email/phone en ventana corta (patrón de `/api/leads`), (c) honeypot field, (d) **Cloudflare Turnstile o hCaptcha** (recomendado — token verificado server-side).
- Validación server-side estricta de todos los inputs (el endpoint usa service-role y bypassa RLS).
- Campos:
  - **Tasación:** `name`, `phone`, `email`, `property_location` (barrio/dirección, texto). 
  - **Clase:** `name`, `phone`, `email`, `tipo_cliente` (radio: "Trabajo en el sector" / "Soy Propietario/a" → guardar como tag/campo del contacto).
- El submit dispara, en el mismo request: `createFunnelLead()` + Pixel(browser)/CAPI(server) con `event_id` compartido (ver §6).

---

## 6. Subsistema 3 — Conversión Meta unificada (Pixel + CAPI)

### 6.1 Un solo pixel/dataset

- Definir el **pixel maestro** (prerrequisito del usuario). Mantener UN dataset durante toda la migración — usar uno nuevo o distinto fragmenta señal y rompe dedup.
- Inyección server-side como prop (patrón actual de `META_PIXEL_ID` en `app/p/[slug]`), no `NEXT_PUBLIC` crudo.

### 6.2 Eventos del embudo

| Evento | Cuándo | Dónde |
|--------|--------|-------|
| `PageView` | carga de cualquier página | Pixel (auto) |
| `ViewContent` | vista de la landing (content_name = `tasacion`/`clase_gratuita`) | Pixel + CAPI |
| `Lead` | submit del form de **Tasación** | Pixel + CAPI |
| `CompleteRegistration` | submit del form de **Clase** | Pixel + CAPI |
| `Schedule` | cuando se agenda una visita/tasación real (deal pasa a `scheduled` con fecha) | CAPI (server) |

Casing canónico EXACTO en ambos lados (`Lead`, `CompleteRegistration`, …). Un mismatch de casing rompe el dedup aunque el `event_id` coincida.

### 6.3 Deduplicación (la parte crítica)

- **Clave de dedup = `event_id` + `event_name`** (ventana 48h). Generar **un** `event_id` (`crypto.randomUUID()`) por acción en el browser; pasarlo como `eventID` al 4º arg de `fbq(...)` **y** como `event_id` en el cuerpo de CAPI. Mismo string, mismo case.
- Disparar ambos caminos en minutos (no batch). CAPI **inline** en el submit (no por cron) — respeta el freshness de 7 días y el comportamiento de dedup que favorece el evento de browser.
- Persistir el `event_id` en el deal/contact para reintentos idempotentes dentro de la ventana 48h.

### 6.4 Advanced matching (EMQ alto)

- Refactor: extraer el hashing a `lib/marketing/meta-hash.ts` (hoy `sha256()` es privado en `meta-capi.ts`). Normalizar → SHA-256 → hex minúscula. Tests unitarios por normalizador.
- Parámetros (hashea PII; envía fbp/fbc/IP/UA en claro):
  - `em` (trim+lowercase), `ph` (**solo dígitos, sin `+`, sin 0 inicial, con código país `54`** — p.ej. `+54 9 11 1234-5678` → `5491112345678`; **es el killer #1 de EMQ**), `fn`/`ln` (split del nombre, lowercase sin puntuación), `ct` (derivado de barrio/CABA/Zona Norte), `country` = `ar`, `external_id` (id del contacto, hasheado), `fbp`/`fbc` (cookies; construir `fbc` desde `fbclid` si falta cookie: `fb.1.{ms}.{fbclid}`), `client_ip_address`, `client_user_agent`.
- `action_source: 'website'`, `event_source_url` presente, `event_time` en **segundos** (no ms), dentro de 7 días.
- Reflejar `origin` en `custom_data.lead_origin` (`embudo`/`clase_gratuita`) para alinear optimización Meta con las vistas de embudo del CRM y poder auditar Meta vs Supabase.

### 6.5 Validación

- `META_TEST_EVENT_CODE` en Test Events → confirmar **una fila deduplicada** por conversión y **EMQ ≥ 6**. Quitar el test code en producción.

---

## 7. Subsistema 4 — Públicos Personalizados por etapa

### 7.1 Modelo

- Públicos a nivel **cuenta/embudo** (no por propiedad — `property_meta_audiences` no aplica). Un público CUSTOM (`customer_file_source: USER_PROVIDED_ONLY`) por etapa clave:

| Público | Etapa(s) de deal |
|---------|------------------|
| Registró clase | `clase_gratuita` |
| Solicitó tasación | `request` |
| Coordinada | `scheduled` (con fecha) |
| Visita realizada | `visited` |
| Tasación entregada | `appraisal_sent` |
| En seguimiento | `followup` |
| Captado (EXCLUIR) | `captured` |
| Perdido (EXCLUIR) | `lost` |

- **Mover, no acumular:** al avanzar de etapa, DELETE del público anterior + POST al nuevo. `captured`/`lost` se **excluyen** del prospecting (no se les vuelve a pagar).
- Solo se sincronizan contactos con `origin IN ('embudo','clase_gratuita')` (consentimiento — ver §12).

### 7.2 Sync (worker pg_cron, reconciliación)

- Lib `lib/marketing/audience-hash.ts` (normalizar+SHA-256 por key: EMAIL, PHONE, FN, LN, CT, ST, ZIP, COUNTRY; EXTERN_ID en plano).
- Endpoint `app/api/cron/meta-audience-sync` (guardado por `x-cron-secret == CRON_SECRET`), agendado con **Supabase pg_cron + pg_net** (Netlify scheduled functions NO disparan en este sitio — documentado en CLAUDE.md).
- El worker **reconcilia estado**: lee el stage actual de cada deal (cubre TODOS los caminos de cambio de etapa: ruta `advance`, helpers `linkAppraisal/linkProperty`, e imports), computa la membresía por etapa, y la **diffea** contra el ledger `meta_audience_members`. POST de hashes nuevos, DELETE de los que salieron. Esto evita depender de triggers que no cubren todos los paths.
- `pg_net` es solo POST → el DELETE lo emite el handler Next, no pg_cron.
- Batch ≤ 10.000 registros. Best-effort (try/catch) — nunca bloquea el CRM. Manejar `1870090` (ToS no aceptados) y errores de capability con gracia.
- Telemetría por corrida (`num_received`/`num_matched`/`num_invalid`) a una tabla de log (patrón observabilidad de `email_report_log`).

### 7.3 Exclusiones en campañas

- En `lib/marketing/meta-campaign-builder.ts`: agregar `excluded_custom_audiences: [{id}]` (Captado/Perdido + deals activos) a los adsets de prospecting. **Preservar** los gotchas Meta ya resueltos (advantage_audience, caps de edad ≤25/≥65, no mezclar countries+custom_locations, `LEARN_MORE`, sin interest IDs hardcoded, `bid_strategy` en adset, `is_adset_budget_sharing_enabled`).

---

## 8. Subsistema 5 — Corte de dominio + baja de GHL

### 8.1 Multi-dominio (Netlify)

- Agregar `inmobiliariadiegoferreyra.com` (+ `www`) como **domain alias** del sitio en Netlify. La app sigue en `inmodf.com.ar`.
- Las rutas `/tasacion-directa` y `/vsl-clase-propietarios` resuelven en ambos dominios. **Canónico = `inmobiliariadiegoferreyra.com`**; las copias en `inmodf.com.ar` quedan `noindex` (evitar contenido duplicado) o se redirigen post-cutover.
- Raíz de `inmobiliariadiegoferreyra.com/` → redirect a una página sensata (p.ej. la landing de tasación). **Cuidado con middleware host-aware**: no debe romper el auth de `inmodf.com.ar` (riesgo documentado). Scope mínimo y testeado.
- Bajar el **TTL de DNS** antes del corte (rollback rápido).

### 8.2 Decommission GHL

- Quitar `export const config.schedule` de `netlify/functions/ghl-poll.mts`; **deshabilitar el job pg_cron** de `ghl-poll`.
- Webhook `app/api/webhooks/ghl/form-submission`: dejar de depender de él. Opcional: devolver `410 Gone` o quitar la ruta.
- En el UI de GHL: **apagar el Pixel** y deshabilitar/redirigir los forms (en la ventana de corte).
- Evitar cron muerto pegándole a GHL con key vacía (limpiar `ghl_poll_state`).

---

## 9. Modelo de datos (tablas/columnas nuevas — correr a mano en Supabase Dashboard)

> CLI de Supabase no conecta — migraciones se corren en el SQL Editor. Toda FK a `profiles(id)` usa `ON DELETE SET NULL`. Probar INSERT real por el flow (no solo SQL) por el gotcha de triggers BEFORE/AFTER en `deals`.

1. **`funnel_testimonials`** — `id`, `key` (federico/pablo/claudia), `client_name`, `location`, `result_badge`, `quote` (text), `video_url` (Storage), `poster_url` (Storage), `sort_order`, `active` (bool), timestamps. RLS: SELECT anon (público); escritura service-role.
2. **`funnel_meta_audiences`** — `id`, `funnel_stage` (UNIQUE), `audience_id` (Meta), `name`, `customer_file_source`, `created_at`. Estado de los públicos por etapa.
3. **`meta_audience_members`** — `id`, `funnel_stage` (o `audience_id`), `contact_id` (FK→contacts), `hashed_id`, `status` (`active`/`removed`), `last_synced_at`. UNIQUE para idempotencia del diff.
4. **`meta_audience_sync_log`** — telemetría por corrida (`run_at`, `stage`, `num_received`, `num_matched`, `num_invalid`, `error`).
5. **`contacts`/`deals`**: `meta_event_id` (text — idempotencia CAPI dentro de la ventana 48h, se setea en Fase 3); `ads_consent` (bool — auditoría de consentimiento, Fase 4); `tipo_cliente` (text en `contacts` para el funnel Clase, Fase 2). El detalle exacto (tabla/tipo/índice) se fija en el plan de cada fase.

Reutilizar: `landing_page_visits` (ya acepta `funnel_type` `clase_gratuita`/`tasacion`) montando `LandingVisitTracker` con el `funnelType` correcto.

---

## 10. Runbook de cutover (ventana única — Approach A)

**Pre-corte (días antes):**
1. Todo construido, mergeado y deployado; páginas accesibles en `inmodf.com.ar/tasacion-directa` y `/vsl-clase-propietarios`.
2. Migraciones corridas; videos+posters en Storage; testimonios sembrados; pixel maestro confirmado; ToS de Custom Audiences aceptado; Advanced Access confirmado; `CRON_SECRET` y env vars en Netlify.
3. **Validar tracking** con `test_event_code`: una fila deduplicada por conversión, EMQ ≥ 6, deal creado con `origin` correcto, notificación correcta (INSERT real para descartar el 500 de trigger).
4. Bajar TTL de DNS de `inmobiliariadiegoferreyra.com`.

**Ventana de corte:**
5. Agregar domain alias en Netlify; flip de DNS; verificar SSL + que las páginas cargan en `inmobiliariadiegoferreyra.com/<paths>`.
6. En GHL: **apagar Pixel + deshabilitar forms** (mismo momento). Sin dos Pixels a la vez.
7. Verificación en vivo: enviar un lead de prueba real en el dominio de producción → deal creado + **una** conversión en Meta (sin duplicar).

**Post-corte:**
8. Desmantelar crons/webhook GHL.
9. Habilitar el pg_cron de sync de Públicos.

**Rollback:** revertir DNS a GHL (mantener los funnels de GHL intactos 48–72h). El TTL bajo hace el rollback rápido.

---

## 11. Validación y testing

- Tests unitarios de normalizadores (teléfono AR con varios formatos, email, nombre).
- Flujo `test_event_code` (Pixel↔CAPI deduplicado, EMQ ≥ 6).
- INSERT real por el endpoint nuevo → confirmar que el trigger de `deals`/`deal_stage_history` no devuelve 500 (gotcha CLAUDE.md).
- Paridad de métricas: `vw_funnel_daily` / `get_funnel_metrics` siguen contando `origin='embudo'` (tasación) y `origin IN ('embudo','clase_gratuita')` (eventos). Confirmar que los nuevos deals aparecen con el origin correcto.
- CWV mobile (Lighthouse): LCP/INP/CLS dentro de presupuesto.
- Dry-run del sync de públicos + match-rate en telemetría.

---

## 12. Privacidad y consentimiento

- Subir PII del CRM a Meta como customer-list exige base legal + aviso (Custom Audience Terms).
- **Sincronizar solo** contactos `origin IN ('embudo','clase_gratuita')` (entraron por nuestros funnels).
- Sumar una línea en la política de privacidad de las landings cubriendo el uso publicitario de datos.
- Considerar flag `ads_consent` en `contacts` para auditoría.

---

## 13. Riesgos y gotchas (consolidado)

1. **Doble conteo por solapamiento de Pixel** — dos fuentes de Pixel sin `event_id` compartido garantizan duplicado. Mitigación: Approach A (apagar GHL Pixel en la misma ventana).
2. **Normalización de teléfono AR** — killer #1 de EMQ y de match en públicos. Normalizador dedicado + tests.
3. **`deals.property_address` NOT NULL** — sintetizar placeholder o usar la ubicación capturada.
4. **Triggers BEFORE/AFTER en `deals`** — probar INSERT real; RLS apropiada.
5. **Netlify scheduled functions muertas** — usar pg_cron + ruta Next (`x-cron-secret`). `pg_net` solo POST.
6. **Custom Audience ToS (`1870090`) + Advanced Access** — prerrequisitos manuales; el `/users` write necesita capability avanzada.
7. **`.env.example` incompleto** — faltan `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_APP_ID/SECRET`, `META_TEST_EVENT_CODE`, vars de GHL/CRON. Documentar.
8. **Link rot de media GHL** — **bajar los videos/posters YA** (Fase 0) antes del cierre.
9. **`.MOV` del testimonio 1** — transcodificar a MP4 H.264.
10. **Autoplay sin `muted`** — el hero debe ir `muted playsinline` o no autoplaya.
11. **Métricas por origin** — un origin equivocado rompe `/metrics` silenciosamente.
12. **Middleware host-aware** — no romper el auth de `inmodf.com.ar`.

---

## 14. Prerrequisitos del usuario (acciones manuales)

- [x] Confirmar el **pixel maestro** → ✅ `589579724932979` = `META_PIXEL_ID` (confirmado 2026-06-15).
- [x] **Rescatar la media de GHL** → ✅ Fase 0 ejecutada: 12 piezas en el bucket `funnel-media` (+ heroes transcodificados a H.264). Ver manifest.
- [ ] Aceptar los **Custom Audience Terms** en el UI de Meta con el usuario/sistema del negocio (`facebook.com/ads/manage/customaudiences/tos`).
- [ ] Confirmar **Advanced Access `ads_management`** (App Review) para escribir miembros (`/users`).
- [ ] Acceso al **DNS** de `inmobiliariadiegoferreyra.com` (registrador) + bajar TTL antes del corte.
- [ ] Correr las **migraciones** en el SQL Editor de Supabase (cuando estén escritas por fase).
- [ ] Cargar **env vars** en Netlify (`CRON_SECRET`, `META_*`, `IP_HASH_SALT`, Turnstile/hCaptcha keys, etc.).
- [ ] (Opcional) Subir el **límite global de Storage** del proyecto si se quieren archivar los heroes RAW HEVC en Supabase (hoy solo en local).

---

## 15. Fases de implementación (cada una → su propio plan)

- **Fase 0 — Rescate de assets + prerrequisitos.** ✅ **HECHO (2026-06-15):** media bajada de GHL + subida a `funnel-media` (heroes transcodificados a H.264), pixel maestro confirmado. Pendientes manuales del usuario: ToS Custom Audiences, Advanced Access, acceso DNS, env vars (ver §14).
- **Fase 1 — Páginas nativas.** Rutas, componentes premium (motion+gsap), testimonios en DB, media en Storage, páginas de gracias. En staging `inmodf.com.ar`.
- **Fase 2 — Captura de leads.** Lib compartido `createFunnelLead`, endpoints públicos anti-spam, paridad de origin/notificación.
- **Fase 3 — Conversión Meta unificada.** Pixel (eventos del embudo) + CAPI inline + `event_id` compartido + advanced matching + validación test events.
- **Fase 4 — Públicos por etapa.** Tablas, hashing lib, worker pg_cron (reconciliación), exclusiones en campaign builder, telemetría.
- **Fase 5 — Corte de dominio + baja de GHL.** Domain alias, DNS, cutover runbook, decommission.

---

## 16. Fuera de alcance (YAGNI)

- CMS genérico de landings.
- Framework de A/B testing / multivariante.
- Automatización de lookalikes (puede venir después; las tablas no lo impiden).
- Público para pipeline `comprador` (opcional, futuro).
- Backfill histórico de GHL más allá de lo ya importado.
