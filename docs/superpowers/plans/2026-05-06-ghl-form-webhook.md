# 2026-05-06 — Integración GHL → CRM via webhook

## Pedido del usuario

Dos forms en GoHighLevel deben crear deals automáticamente en nuestro CRM:

1. **Form `[TASACIÓN DIRECTA]`** (landing "01 embudo de tasación directa") → deal en stage **"Solicitud"**.
2. **Form `[CLASE PROPIETARIOS]`** → deal en stage **"Clase Gratuita"** (nuevo, un paso ANTES de Solicitud).

El coordinador puede avanzar manualmente Clase Gratuita → Solicitud → Coordinada.

Backfill de registros históricos: documentado pero no implementado en este sprint.

---

## Estado actual relevante

- `lib/supabase/deals.ts`: tipo `DealStage = 'scheduled'|'not_visited'|...` (sin `request` ni `clase_gratuita`).
- `app/(dashboard)/crm/page.tsx`: las CRM stages UI (Solicitud, Coordinada, …) son DERIVADAS del backend stage. Hoy "Solicitud" se deduce de `stage='scheduled' && scheduled_date IS NULL`.
- `lib/marketing/ghl.ts`: integración GHL **outbound only** (lectura para reportería). Sin webhook inbound.
- DB: `deals.stage` es `text` libre (no enum, no CHECK constraint encontrado), solo hay un index sobre `(stage, created_at DESC)`.

---

## Decisiones de diseño

### Stages como valores reales (no derivados)

Promovemos "Solicitud" y agregamos "Clase Gratuita" a stages REALES en la DB, no derivados. Razones:
- Filtrado y métricas más precisos sin ramas de "if scheduled_date IS NULL".
- Origen del deal se preserva aunque después se le agende fecha.
- Backend distingue claramente: solicitud (acaba de llegar del form) vs coordinada (asesor agendó).

Nuevos backend stages:
- `clase_gratuita` (nuevo)
- `request` (nuevo) — equivalente a "Solicitud"

Backfill: deals existentes con `stage='scheduled' && scheduled_date IS NULL` → `stage='request'`. El resto queda igual.

### Webhook con secret simple

GHL Workflows envía POST al URL configurado cuando un form se submite. No hay HMAC out-of-the-box, así que validamos con `Authorization: Bearer <GHL_WEBHOOK_SECRET>` (el secret se configura como custom header en el workflow GHL).

Endpoint: `POST /api/webhooks/ghl/form-submission`.

### Mapping form → stage por nombre/id

Uso env vars opcionales para reconfigurar sin redeploy:
- `GHL_FORM_TASACION_DIRECTA_NAMES` (lista coma-separada de nombres y/o IDs que mapean a `request`).
- `GHL_FORM_CLASE_PROPIETARIOS_NAMES` (mapean a `clase_gratuita`).

Default hardcoded: matching por substring `tasacion directa` y `clase propietarios` (case-insensitive).

### Dedup de contactos

Buscar por email (case-insensitive) → fallback a phone normalizado → si no existe, crear. Mismo patrón que el form interno hoy.

---

## Archivos

### NEW

- `supabase/migrations/20260506000001_deal_stages_request_clase.sql` — backfill + comentario sobre los nuevos stages.
- `lib/ghl/webhook.ts` — verificación de secret + parser del payload GHL.
- `app/api/webhooks/ghl/form-submission/route.ts` — endpoint público que recibe el POST.
- `docs/superpowers/specs/2026-05-06-ghl-webhook-setup.md` — instrucciones para configurar el GHL Workflow.

### MODIFY

- `lib/supabase/deals.ts` — agregar `request` y `clase_gratuita` a `DealStage`. La función `createDeal` aceptará un `stage` opcional (default `scheduled` para compat con el form interno actual).
- `app/(dashboard)/crm/page.tsx` — agregar `clase_gratuita` a `CRM_STAGES`, actualizar `deriveCRMStage` y `mapStageToCRM`.
- `app/(dashboard)/pipeline/[id]/page.tsx` — el array `STAGES` que usa la barra de progreso debe incluir `clase_gratuita` y `request` al inicio.

---

## Lógica del webhook

```
POST /api/webhooks/ghl/form-submission
Authorization: Bearer <GHL_WEBHOOK_SECRET>

1. Verificar header Authorization. Si no matchea → 401.
2. Parsear body. Tomar: contact (name, email, phone), formName/formId, submittedAt.
3. Mapear formName → stage destino. Si no matchea ningún form conocido → 400 con detalle.
4. Buscar contact existente por email → phone. Si no existe, crear.
5. Crear deal con:
   - contact_id, contact_name, contact_phone (snapshot)
   - stage = mapped (request | clase_gratuita)
   - origin = 'embudo'
   - property_address = '' (todavía no sabemos)
   - notes = `Origen: GHL form "<formName>" - <submittedAt>`
6. Auto-crear task para coordinador: "Contactar lead de <stage>".
7. Disparar email a coordinador+admins con notifyDealCreated() (mismo flow que form interno).
8. 200 OK con { dealId, contactId, stage }.
```

---

## Backfill histórico (out of scope)

Documentado en `docs/superpowers/specs/2026-05-06-ghl-webhook-setup.md`, sección "Importar registros históricos":
- Endpoint admin (no incluido) que use `lib/marketing/ghl.ts` para listar contactos GHL filtrados por form name + fecha.
- Por cada uno, dispara el mismo path de creación que el webhook.
- Se deja como pasos a futuro; el usuario explícitamente pidió NO hacerlo en este sprint.

---

## Verificación post-deploy

1. Aplicar la migración SQL en Supabase Dashboard.
2. Setear `GHL_WEBHOOK_SECRET` en Netlify env vars (cualquier string random largo).
3. En GHL → Workflows → crear/editar el workflow del form `TASACIÓN DIRECTA`:
   - Trigger: "Form Submitted" → seleccionar el form.
   - Action: "Webhook" → URL: `https://inmodf.com.ar/api/webhooks/ghl/form-submission`, method POST.
   - Custom header: `Authorization: Bearer <mismo-secret>`.
   - Body: incluir `{{contact.first_name}}`, `{{contact.email}}`, `{{contact.phone}}`, `{{form.name}}`, `{{form.id}}`, `{{event.date_time}}`.
4. Repetir para `CLASE PROPIETARIOS`.
5. Test: completar el form de prueba → ver deal nuevo en CRM en stage correcto.

---

## Out of scope (no implementar)

- Backfill histórico automatizado.
- HMAC signature validation (cambiar a header + secret estática).
- UI para que admin reconfigure el mapping form→stage en runtime.
- Manejo de form fields personalizados (ej: dirección de propiedad si el form la tiene). Por ahora el deal se crea sin property_address y el coordinador la completa al tomar contacto.
