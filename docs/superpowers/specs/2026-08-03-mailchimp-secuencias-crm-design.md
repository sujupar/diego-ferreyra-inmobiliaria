# Secuencias de email por etapa del CRM ↔ Mailchimp — Diseño

- **Fecha:** 2026-08-03
- **Estado:** Aprobado (diseño). Pendiente: plan de implementación.
- **Autor:** Julián + Claude (liderazgo técnico)
- **Alcance:** Conectar el CRM (Next.js/Supabase) con Mailchimp para que los cambios de
  etapa de un prospecto disparen / corten secuencias de email automatizadas.

---

## 1. Objetivo

El negocio tiene 5 secuencias de seguimiento por email (documentadas en los PDFs
"Etapa 1/3/4/5/7") atadas a etapas del embudo. Se quiere que **cuando el CRM mueve a
un prospecto de etapa, entre automáticamente a la secuencia correspondiente y salga de
la anterior**, con las secuencias corriendo en Mailchimp. La solución tiene que ser
sólida, escalable y **no poner en riesgo la plataforma existente**.

## 2. Decisión de arquitectura — Opción A: "Mailchimp maneja las secuencias"

**Mailchimp es el cerebro de las secuencias; el CRM solo sincroniza un tag por etapa.**

Se evaluaron 3 opciones (A: Mailchimp maneja; B: la plataforma maneja + Resend; C:
híbrido). Se eligió **A** porque:

1. **Es la que menos toca la plataforma** (miedo #1 del negocio): todo el peso vive en
   Mailchimp; el CRM solo agrega/saca un *tag* por API como side-effect best-effort.
2. **La operación es de copy iterativo** (los PDFs están llenos de variantes de asunto
   A/B/C y notas de edición): con la A, Diego y su equipo editan todo en Mailchimp **sin
   depender de un desarrollador**.
3. **Entregabilidad, desuscripciones, rebotes y métricas** los da Mailchimp gratis.
4. La Fase 1 pedida (diseñar el email #1 y mandar pruebas) es nativa del editor de
   Mailchimp.

### Limitaciones DURAS de Mailchimp aceptadas (con mitigación)

- **No hay API para expulsar a un contacto de un journey en curso.** La *entrada* es
  limpia (por tag); la *salida* se resuelve con una **condición de salida** configurada
  en el editor, sobre el merge field `CRM_STAGE` (que el sync mantiene al día). Efecto
  práctico a cadencia de días: al avanzar de etapa, el contacto **deja de recibir el
  próximo email** de la secuencia vieja y **entra** a la nueva. El único hueco teórico
  (un email a punto de salir en los próximos minutos) es irrelevante para nurture.
- **Tope de 10 esperas por flujo** ([verificado](https://mailchimp.com/help/about-customer-journeys/)).
  Las 2 secuencias largas (Solicita ~21 emails y Seguimiento ~21, en ~510 días = 20
  esperas) **no entran en un solo flujo** → se arman **encadenando 2 flujos** cada una
  (el último paso del Flujo A agrega un tag que dispara el Flujo B).

## 3. Contrato de mapeo — etapa → tag → secuencia

Regla base: un deal está en **una** etapa a la vez → **un** tag de secuencia a la vez.
El CRM, en cada cambio, pone el tag nuevo y saca el viejo. Mailchimp entra por
"Tag added" y la condición de salida usa `CRM_STAGE`.

| Etapa CRM (`deals.stage`) | Condición extra | Tag Mailchimp | Secuencia (PDF) |
|---|---|---|---|
| `request` | `origin = 'embudo'` | `seq-solicita` | 1 · Solicita (~21) |
| `scheduled` | `scheduled_date IS NOT NULL` | `seq-agendada` | 3 · Agendada (3) |
| `not_visited` | — | `seq-no-realizada` | 4 · No Realizada (4) |
| `visited` | — | `seq-realizada` | 5 · Realizada (4) |
| `appraisal_sent` **o** `followup` | — | `seq-seguimiento` | 7 · Seguimiento (~21) |
| `captured` / `lost` / `comprador` | — | *(ninguno — STOP)* | — |
| `clase_gratuita` | — | *(ninguno)* | fuera de alcance |

**Decisiones confirmadas por el usuario (2026-08-03):**
1. **Seguimiento arranca al ENTREGAR el informe:** el tag entra en `appraisal_sent` y
   **no se reinicia** al pasar a `followup`. Las dos etapas = una sola fase de Seguimiento.
2. **Solicita = solo `origin='embudo'`** (el email 1 dice "vi que pediste tu Tasación
   Estratégica"; a referidos/históricos no les aplica).
3. **Agendada solo con fecha coordinada** (`scheduled_date` presente); sin fecha, el
   deal sigue tratado como "solicitud".

La lógica vive en una función pura testeable: `resolveSequenceTag(stage, origin,
scheduledDate) → tag | null` (única fuente de verdad del mapeo).

## 4. Módulo de sincronización CRM → Mailchimp (con red de seguridad)

Todo el código nuevo vive aislado en `lib/integrations/mailchimp/`. **No modifica
ninguna tabla existente** (`deals`, `contacts` quedan intactas).

- **`mapping.ts`** — `resolveSequenceTag(...)` (función pura) + constantes de tags.
- **`client.ts`** — envoltorio finito sobre la Marketing API v3 (lee env vars; init
  perezoso; **nunca tira excepción**, igual que `lib/email/resend-client.ts`).
- **`sync-deal.ts`** — `syncDealToMailchimp(dealId)`: lee el estado ACTUAL del deal +
  contacto, calcula el tag, y en Mailchimp:
  1. **Upsert** del miembro: `PUT /lists/{audience}/members/{md5(lowercase(email))}`
     con `status_if_new: 'subscribed'` (nunca `status`, para no resucitar bajas) y
     `merge_fields: { FNAME }` (derivado de `full_name` con el helper `firstName()`).
  2. **Tags:** `POST .../tags` con el tag objetivo `active` y los demás `seq-*` en
     `inactive`. Setea también `CRM_STAGE`.
  Idempotente: reejecutar con el mismo estado no cambia nada.

### Puntos de enganche (chokepoint real, no la ruta `advance`)

La auditoría del sync de Meta (ver §9) demostró que el chokepoint real es
`updateDealStage` en `lib/supabase/deals.ts`, **no** `app/api/deals/[id]/advance`, y que
hay transiciones que no pasan por `advance`. Por eso el sync se llama best-effort
(`try/catch`, dynamic import, como Meta CAPI) desde:

| Punto | Archivo | Cubre |
|---|---|---|
| Alta por funnel | `lib/funnel/create-funnel-lead.ts` | `seq-solicita` |
| Cambio de etapa | `updateDealStage` en `lib/supabase/deals.ts` | agendada/no-realizada/realizada/followup/captured/lost |
| Crear tasación | `linkAppraisalToDeal` (`lib/supabase/deals.ts`) | `seq-seguimiento` (`appraisal_sent`) |
| Vincular propiedad | `linkPropertyToDeal` (`lib/supabase/deals.ts`) | STOP (`captured`) |

### Red de seguridad (event-driven + reconciliación)

- **Ledger:** tabla `mailchimp_sync_state` (1 fila por deal: último tag sincronizado +
  timestamp). El enganche inline sincroniza en tiempo real (caso feliz).
- **Reconciliación:** cron nocturno `app/api/cron/mailchimp-sync` re-sincroniza cualquier
  deal cuyo tag derivado ≠ el del ledger. Resultado: tiempo real + **auto-reparación** si
  Mailchimp tose + **observable**. Mismo principio "reconciliación + observabilidad" que
  ya usa el proyecto (reportes, market-data) — y lo que le faltó a Meta.
- **Observabilidad:** tabla `mailchimp_sync_log` (append-only: deal, tag aplicado,
  estado, error) — espíritu de `email_notifications_log`.

### Modelo de seguridad (fail-closed)

- 🔒 **Interruptor maestro `MAILCHIMP_SYNC_ENABLED`, default OFF.** Sin esto, el sync no
  hace nada. Fail-closed (como los switches del agente de IA).
- 🔒 **Doble seguro independiente:** aunque el sync esté ON, Mailchimp no manda ningún
  email hasta que se **active cada Journey** (un journey en borrador recibe el tag pero
  no envía). Para enviar tienen que estar prendidas las dos cosas.
- 🛡️ **Nunca tira excepción** (fallo → `console.warn` + sigue, como Meta CAPI).
- 🛡️ **Contactos sin email** (solo teléfono) → se saltean y se loguea.
- 🛡️ **Cero cambios de schema en tablas críticas** (solo tablas nuevas aditivas).

## 5. Las Journeys en Mailchimp

| Journey | Entra por tag | Emails | Estructura |
|---|---|---|---|
| Solicita | `seq-solicita` | ~21 | 2 flujos encadenados |
| Agendada | `seq-agendada` | 3 | 1 flujo |
| No Realizada | `seq-no-realizada` | 4 | 1 flujo |
| Realizada | `seq-realizada` | 4 | 1 flujo |
| Seguimiento | `seq-seguimiento` | ~21 | 2 flujos encadenados |

- **Encadenado de las largas:** Flujo A (emails 1–~11) → último paso agrega
  `seq-solicita-2` → Flujo B entra por "Tag added `seq-solicita-2`" (emails 12–21).
- **Salida:** condición de salida sobre `CRM_STAGE` (ej.: Solicita sale si
  `CRM_STAGE ≠ solicita`). En Fase 0 se verifica si la condición "por tag" está
  disponible en la cuenta; si no, se usa `CRM_STAGE` (siempre disponible). Backstop:
  drips cortos e idempotentes → peor caso, un email de más, nunca un loop.
- **Merge fields** (los `[corchetes]` de los PDFs), creados por API: `FNAME` → `[Nombre]`;
  `WHATSAPP` → `[WHATSAPP]`; `LINK_LANDING` → `[LINK LANDING]`; `CRM_STAGE` (invisible,
  control de salida). `[LINK/VIDEO TESTIMONIO]` son fijos → van en la plantilla.
- **A/B de asuntos:** nativo por email en Mailchimp (los PDFs traen variantes A/B/C).
- **QA correo por correo:** test-send de cualquier email del Journey a la casilla del
  usuario, sin esperar los días reales.

## 6. Webhooks de vuelta al CRM

Ruta `app/api/webhooks/mailchimp/route.ts` (Fase 3). Eventos: `unsubscribe`, `cleaned`
(rebote duro), `upemail`. Espeja bajas/rebotes en la tabla `mailchimp_suppressions`
(email + motivo + fecha); el sync consulta esa lista y **saltea a los suprimidos**.
Payloads form-encoded; se filtra `source != 'api'` para evitar loops. La URL lleva un
secreto (`?s=…`) validado en el server. No es bloqueante para los primeros envíos porque
el upsert usa `status_if_new` (nunca resucita una baja).

## 7. Secretos y configuración

Env vars (Netlify + `.env.local`, **nunca al repo**):

| Variable | Valor |
|---|---|
| `MAILCHIMP_API_KEY` | `…-us17` (provista por el usuario 2026-08-03) |
| `MAILCHIMP_SERVER_PREFIX` | `us17` |
| `MAILCHIMP_AUDIENCE_ID` | `db7f354a0d` (audiencia "Diego Ferreyra Inmobiliaria") |
| `MAILCHIMP_SYNC_ENABLED` | `false` (interruptor maestro, default OFF) |
| `MAILCHIMP_WEBHOOK_SECRET` | (Fase 3) |

- **Cron de reconciliación:** `app/api/cron/mailchimp-sync/route.ts` con **auth DUAL**
  (env `CRON_SECRET` **o** `cron_config`) + `maxDuration=60`, agendado en pg_cron
  **clonando el comando de un job existente** (reusa el secreto que funciona; nunca leer
  Vault en runtime del worker). Netlify Scheduled Functions NO se usan (están muertas en
  este sitio).
- **Credenciales verificadas (2026-08-03):** `GET /3.0/ping` → OK; `GET /3.0/lists` → 1
  audiencia `db7f354a0d`, 1 miembro. Datacenter `us17`.

## 8. Modelo de datos nuevo (todo aditivo, tablas nuevas)

Migraciones a correr a mano en el Dashboard de Supabase (convención del proyecto):

- `mailchimp_sync_state` — ledger: `deal_id` (PK/FK), `last_tag`, `last_email`,
  `synced_at`.
- `mailchimp_sync_log` — append-only: `deal_id`, `email`, `tag_applied`, `status`,
  `error`, `created_at`.
- `mailchimp_suppressions` — `email` (PK), `reason` (`unsubscribe`/`cleaned`), `created_at`.

El job de pg_cron (reconciliación) se agenda **después** del deploy.

## 9. Auditoría relacionada — sync de públicos de Meta (parkeado)

Durante el diseño se auditó (a pedido del usuario) el sync de públicos de Meta por etapa
del CRM. **Veredicto: roto — nunca funcionó automáticamente.** El cron
(`meta-audience-sync`) **nunca se agendó** (la migración `20260617000002` nunca se
aplicó; su header pide esperar al go-live de ToS de Custom Audiences + Advanced Access de
Meta). Corrió UNA vez a mano el 2026-06-17 (8 públicos + 256 miembros) y quedó congelado
47 días. No es problema de auth. Los públicos por propiedad/campaña (de píxel) sí
funcionan; son otro sistema.

**Follow-up (tarea aparte, después de Mailchimp):** verificar el estado de ToS/Advanced
Access de Meta y, si está OK, agendar el cron existente. Considerar aplicar el mismo
patrón outbox/reconciliación para robustecerlo.

## 10. Plan de fases (fail-closed)

| Fase | Qué se hace | ¿Envía? |
|---|---|---|
| **0 · Conexión** | Env vars + migraciones + merge fields por API + módulo + enganches + cron, todo detrás del flag OFF. Test con un deal de prueba. | ❌ |
| **1 · Diseño email #1** | Diseñar en Mailchimp el email 1 de Solicita (identidad Diego, según ejemplos visuales del usuario). Mandar pruebas. Iterar hasta aprobación. | ❌ (test) |
| **2 · Construir Journeys** | Armar las 5 Journeys (Solicita primero, completa) en borrador/pausadas. | ❌ |
| **3 · Webhooks + supresiones** | Unsubscribe/rebote → CRM. | ❌ |
| **4 · QA correo por correo** | Test-send de cada email; validar merge fields, links, asuntos A/B. | ❌ (test) |
| **5 · Go-live gradual** | `MAILCHIMP_SYNC_ENABLED=true` + activar Journeys de a una (Solicita primero, observar, luego el resto). | ✅ (controlado) |

## 11. Fuera de alcance (v1)

- Secuencias para `clase_gratuita` (Etapa "Clase Gratuita") y referidos/históricos.
- Contactos sin email (solo teléfono) — se saltean; SMS no está en alcance.
- El fix del sync de públicos de Meta (§9) — tarea separada posterior.
- Editor de secuencias dentro de la plataforma (el copy se maneja en Mailchimp).

## 12. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Romper el CRM | Sync best-effort, aislado, nunca tira excepción, cero cambios de schema crítico, flag OFF por default |
| Salida no instantánea de un journey | Condición de salida por `CRM_STAGE`; irrelevante a cadencia de días |
| Secuencias largas > 10 esperas | Encadenado de 2 flujos |
| Sync "muere en silencio" (como Meta) | Ledger + cron de reconciliación + `mailchimp_sync_log` observable |
| Re-mailing a desuscriptos | `status_if_new` (nunca `status`) + supresiones vía webhook |
| Perder transiciones fuera de `advance` | Enganche en el chokepoint real (`updateDealStage` + linkAppraisal/linkProperty + funnel) |

## Referencias

- [About Marketing Automation Flows](https://mailchimp.com/help/about-customer-journeys/)
- [All the Starting Points (triggers)](https://mailchimp.com/help/all-the-starting-points/)
- [Marketing API Fundamentals](https://mailchimp.com/developer/marketing/docs/fundamentals/)
- [Organize Contacts with Tags](https://mailchimp.com/developer/marketing/guides/organize-contacts-with-tags/)
- [Create Your First Audience (upsert, subscriber_hash)](https://mailchimp.com/developer/marketing/guides/create-your-first-audience/)
- [Sync Audience Data with Webhooks](https://mailchimp.com/developer/marketing/guides/sync-audience-data-webhooks/)
