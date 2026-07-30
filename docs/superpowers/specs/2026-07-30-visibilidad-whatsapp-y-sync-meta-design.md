# Visibilidad de WhatsApp, teléfonos correctos, papelera de leads y sincronización con Meta

**Fecha:** 2026-07-30
**Origen:** prueba end-to-end del usuario del 29-30/7. Cinco hallazgos, todos con evidencia dura.

---

## Auditoría: qué encontramos y con qué evidencia

### A1. El WhatsApp no llegó porque el número se mutiló (CONFIRMADO)

`normalizePhone` en `lib/integrations/whatsapp/core.ts` asume que **todo** número de
10-11 dígitos es argentino y le antepone `54`:

```
"3107822955"        →  543107822955    ← celular colombiano convertido en argentino falso
"+57 310 782 2955"  →  573107822955    ← correcto cuando trae indicativo
"11 6123 4567"      →  541161234567    ← móvil AR sin el 9 canónico
```

El lead de prueba se guardó como `3107822955` (sin indicativo) → se envió a
`543107822955`, que no existe. Meta aceptó el request y la entrega murió en silencio.

**Descartado como causa:** el "9" faltante de los móviles argentinos. Meta normaliza
solo en producción (acepta `5411…` y devuelve `wa_id: 54911…`). Es un problema de
canonicidad, no de entrega.

### A2. Cero visibilidad de mensajes (CONFIRMADO — el hallazgo más grave)

No existe NINGUNA tabla de log (`whatsapp_log`, `whatsapp_messages`,
`notification_log`: ninguna existe). `sendWhatsappTemplate` descarta la respuesta
de Meta entera, incluido el `wa_id` que dice a qué número real llegó. No hay
webhook de entrada, así que **una respuesta de un cliente se pierde**.

Consecuencia: nadie puede saber si un mensaje salió, a qué número, ni por qué falló.

### A3. El Inbox de leads no puede borrar (CONFIRMADO)

Ni individual ni masivo. Solo filtros de estado.

### A4. La campaña de Meta SÍ se creó correctamente (CONFIRMADO)

Registro de actividad de la cuenta, 29/7 23:33, actor **"Sistema DF"** (la app):
campaign → adset (ARS 3.000/día, Conversiones) → **6 anuncios**. Todo completo.

Quedó en PAUSED porque se lanzó como borrador (`dryRun`) — por diseño, para
auditar antes de gastar. El builder solo activa si `landingOk && !dryRun &&
failedVariants.length === 0`.

### A5. La app miente sobre el estado de las campañas (CONFIRMADO — el bug real del punto 5)

El registro de Meta muestra:

```
2026-07-30 07:59:09  update_campaign_run_status  [Inactiva → Eliminada]
   objeto 120246877453230656   actor: Julian David Parra Ramirez
```

Se borró manualmente desde Ads Manager (actor = usuario personal, distinto del
"Sistema DF" de las creaciones), junto con 5 campañas de prueba más. Ads Manager
oculta las eliminadas por defecto, incluso buscando por ID → "no está".

**Pero la app seguía mostrando "Pausada · 6 anuncios".** Auditamos las 4 campañas
que la app cree vivas: **4 de 4 desincronizadas** (app dice paused/provisioning,
Meta dice ARCHIVED). La app nunca re-consulta a Meta.

---

## Qué se construye

Seis piezas. Cada una resuelve un hallazgo y es verificable por separado.

### F1 · Teléfonos que nunca se inventan

`normalizePhone` pasa a usar **`libphonenumber-js`** con región por defecto `AR`:

- Si el input trae indicativo explícito (`+57…`), se respeta.
- Si no, se interpreta como argentino.
- Los móviles argentinos se emiten en su forma canónica (`549…`).
- **Si no se puede parsear como número válido, devuelve `null`** — nunca inventa.
  Hoy inventar es peor que fallar: falla en silencio y nadie se entera.

Además:
- El formulario de la landing valida el teléfono (cliente + servidor) y, si no es
  válido, muestra un error en línea pidiendo el número completo.
- El CRM marca con una insignia los leads cuyo teléfono no sirve para WhatsApp.

**Decisión:** región por defecto AR (es el mercado), pero un indicativo explícito
siempre gana. No se agrega selector de país al formulario público: suma fricción
y `libphonenumber-js` resuelve el 99% de los casos reales.

### F2 · Registro de todos los mensajes de WhatsApp

Tabla `whatsapp_messages`. Se registra **todo intento**, incluidos los saltados por
modo prueba y los rechazados por Meta, con:

- `direction` (`out`/`in`), `phone_e164`, `wa_id` (el que devuelve Meta), `wa_message_id`
- `template_name`, `body_preview`, `payload` (jsonb)
- `status`: `skipped` → `accepted` → `sent` → `delivered` → `read`, o `failed`
- `error_code` / `error_message` cuando falla
- vínculo opcional a `lead_id` / `property_id`

**Regla dura:** si el registro falla, el envío sigue. El log nunca puede romper el flujo.

### F3 · Webhook de entrada + estados de entrega

`app/api/webhooks/whatsapp`:
- `GET` → verificación de Meta (`hub.challenge` contra `WHATSAPP_WEBHOOK_VERIFY_TOKEN`).
- `POST` → mensajes entrantes y cambios de estado. Firma validada con
  `WHATSAPP_APP_SECRET` (`X-Hub-Signature-256`); sin firma válida, 403.
- Los entrantes se guardan como `direction='in'` y se atan al lead por teléfono.
- Los estados actualizan la fila del saliente por `wa_message_id`.

**Gate del usuario:** hay que pegar la URL y el token una sola vez en el panel de Meta.
Mientras no se haga, F2 y F4 funcionan igual (se ve lo que sale, no lo que entra).

### F4 · Chat de WhatsApp en el Inbox

Pestaña nueva "WhatsApp" junto a Campañas y Consultas:
- Lista de conversaciones (por teléfono) con último mensaje, hora y no leídos.
- Hilo con burbujas, estado de cada mensaje y a qué propiedad/lead corresponde.
- Caja de respuesta: **texto libre solo dentro de las 24h** del último mensaje del
  cliente (ventana de atención de WhatsApp). Fuera de esa ventana la caja se
  bloquea y explica que solo se puede mandar una plantilla.

**Restricción de WhatsApp, no nuestra.** Se muestra explícitamente en la UI con el
tiempo restante para que nadie escriba al vacío.

### F5 · Papelera de leads

- `property_leads.deleted_at` (aditiva, nada se borra).
- `DELETE /api/leads` con `ids[]` → marca `deleted_at`. `POST /api/leads/restore` deshace.
- Inbox: casillas de selección, "Eliminar seleccionados", y filtro "Papelera" para restaurar.
- Todas las consultas de listado excluyen lo borrado.

### F6 · Sincronización real con Meta

`lib/marketing/meta-sync.ts` → `syncCampaignState(campaignId)`:
- Consulta `status`/`effective_status` y cuenta conjuntos y anuncios reales.
- Mapea a nuestro estado: `ARCHIVED`/`DELETED`/inexistente → `archived` con nota.
- La página de la campaña sincroniza al cargar → **el panel nunca miente**.
- El panel distingue "Borrador (pausada, no está gastando)" de "Activa".
- Link a Ads Manager que incluye el filtro de archivadas, para que se encuentre.
- Endpoint de reconciliación masiva + arreglo de las 4 filas rancias actuales.

---

## Fuera de alcance

- Selector de país en el formulario público (fricción).
- Iniciar conversaciones nuevas de WhatsApp desde el CRM a mano.
- Recuperar las campañas borradas: están eliminadas en Meta, no se restauran. Se
  crean de nuevo cuando el usuario quiera.

## Verificación

Cada pieza con tests unitarios de su lógica pura, más probes contra la base real.
Al final, agentes independientes prueban el circuito completo y solo entonces se
entrega al usuario. El chat entrante real solo se puede probar de punta a punta
después de que el usuario configure el webhook en Meta.
