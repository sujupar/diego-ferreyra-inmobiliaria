# Configuración del webhook GoHighLevel → CRM

Fecha: 2026-05-06

## Qué hace

Cuando un visitante completa uno de estos forms en GHL:

| Form GHL | Stage destino en nuestro CRM |
|----------|------------------------------|
| `Form - [TASACIÓN DIRECTA]` | **Solicitud** (`request`) |
| `Form - [CLASE PROPIETARIOS]` | **Clase Gratuita** (`clase_gratuita`) |

…GHL dispara un POST a nuestro endpoint, que:

1. Verifica el contacto (dedup por email → phone) y lo crea si no existe.
2. Crea un deal en el stage correspondiente.
3. Crea una tarea para los coordinadores: "Nuevo lead — atender".
4. Envía email a coordinador + admins (mismo flow que cuando un asesor coordina manualmente).

El coordinador puede después avanzar el deal (Clase Gratuita → Solicitud → Coordinada → …) desde la pantalla de pipeline.

---

## 1. Variables de entorno (Netlify)

Agregar en **Netlify → Site settings → Environment variables**:

```bash
# Secret usado para validar que los POST vienen efectivamente de GHL.
# Generá un string random largo (mínimo 32 caracteres). Ejemplo:
# openssl rand -hex 32
GHL_WEBHOOK_SECRET=<string-random-largo>

# OPCIONAL: si los nombres exactos de los forms cambian, configurar acá.
# Lista coma-separada de nombres y/o IDs de forms a mapear. Match por substring
# case-insensitive, así que basta con la parte distintiva del nombre.
GHL_FORM_TASACION_DIRECTA_NAMES=tasacion directa
GHL_FORM_CLASE_PROPIETARIOS_NAMES=clase propietarios
```

Luego redeploy (Netlify lo hace automático al cambiar env vars).

## 2. Migración SQL

Ejecutar en Supabase Dashboard → SQL Editor:

`supabase/migrations/20260506000001_deal_stages_request_clase.sql`

Esto:
- Backfillea deals con `stage='scheduled' && scheduled_date IS NULL` → `stage='request'`.
- Agrega un comentario en la columna `stage` listando los valores válidos (incluyendo los nuevos `clase_gratuita` y `request`).

No requiere downtime.

## 3. Configurar el Workflow en GHL

Para CADA uno de los dos forms, crear un Workflow en GHL:

1. Entrar a **Automation → Workflows → New**.
2. **Trigger**: `Form Submitted`. Seleccionar el form (ej: `Form - [TASACIÓN DIRECTA]`).
3. **Acción 1**: `Webhook` con esta config:
   - **Method**: `POST`
   - **URL**: `https://inmodf.com.ar/api/webhooks/ghl/form-submission`
   - **Custom Headers**:
     - Key: `Authorization`
     - Value: `Bearer <mismo-secret-que-Netlify>`
   - **Body** (JSON, usar merge tags GHL):
     ```json
     {
       "contact": {
         "name": "{{contact.first_name}} {{contact.last_name}}",
         "email": "{{contact.email}}",
         "phone": "{{contact.phone}}"
       },
       "form": {
         "name": "{{form.name}}",
         "id": "{{form.id}}"
       },
       "submitted_at": "{{event.date_time}}",
       "message": "{{contact.notes}}"
     }
     ```
4. **Save & Activate**.

Repetir para `Form - [CLASE PROPIETARIOS]`.

## 4. Test

### A. Health check del endpoint

Desde tu terminal, con el secret en mano:

```bash
curl -i \
  -H "Authorization: Bearer <secret>" \
  https://inmodf.com.ar/api/webhooks/ghl/form-submission
```

Esperás `200 OK` con `{ "ok": true, "endpoint": "ghl/form-submission" }`.

Si dice 401, el secret está mal seteado en Netlify.

### B. Test del flujo completo

Con el secret en mano:

```bash
curl -i -X POST https://inmodf.com.ar/api/webhooks/ghl/form-submission \
  -H "Authorization: Bearer <secret>" \
  -H "Content-Type: application/json" \
  -d '{
    "contact": {
      "name": "Test Lead Webhook",
      "email": "test+webhook@inmodf.com.ar",
      "phone": "+5491100000000"
    },
    "form": {
      "name": "Form - [TASACIÓN DIRECTA]",
      "id": "test-id"
    },
    "submitted_at": "2026-05-06T15:00:00Z"
  }'
```

Esperás `200 OK` con `{ success: true, dealId: ..., contactId: ..., stage: "request" }`.

Verificá:
- En `/crm` aparece el deal en columna **Solicitud**.
- En `/contacts` aparece el contacto.
- En `/tasks` (como coordinador) aparece "Nuevo lead (Solicitud de tasación): Test Lead Webhook".
- Coordinadores recibieron email "Tasación coordinada".

### C. Test desde GHL real

Llenar el form en la landing usando un email tuyo. Esperar 5-10 segundos. Verificar lo mismo que en (B).

## 5. Backfill histórico (opcional, no implementado)

Si en algún momento se quiere ingestar los registros que YA están en GHL pero todavía no entraron al CRM nuevo:

1. Listar contactos GHL filtrados por form name + fecha de submission usando la API existente (`lib/marketing/ghl.ts` ya tiene auth lista).
2. Por cada contacto, hacer POST a `/api/webhooks/ghl/form-submission` con el mismo formato que GHL → todo el flujo se reusa.
3. Idempotencia: el dedup por email/phone evita duplicar contactos. Crea un deal nuevo por cada submission histórica (intencional — un contacto puede tener múltiples interacciones).

Pasos para el dev que lo implemente cuando se necesite:
- Endpoint admin `/api/admin/ghl-backfill` con role-gate.
- Listar contactos GHL via `GET /contacts?locationId=...&query=<form_name>` (depende de la API de GHL).
- Loop con rate limit (GHL tiene throttling).
- Dry-run flag para preview antes de impactar DB.

## 6. Troubleshooting

### El webhook devuelve 401

- Revisar que `GHL_WEBHOOK_SECRET` esté seteado en Netlify y que matchee EXACTO con el header configurado en el GHL Workflow.
- Sin trailing whitespace ni saltos de línea.

### El webhook devuelve 400 "Form no reconocido"

- El `form.name` o `form.id` que envía GHL no matchea ninguno de los patrones default ni env vars.
- Solución: agregar el nombre exacto a `GHL_FORM_TASACION_DIRECTA_NAMES` o `GHL_FORM_CLASE_PROPIETARIOS_NAMES`.

### El deal se crea pero no aparece en CRM

- Refrescar `/crm` (no hay realtime).
- Verificar que tu rol pueda ver el stage correspondiente (asesores no ven `clase_gratuita` ni `solicitud`, esos solo coordinador/admin/dueño).

### Los emails no llegan a coordinadores

- Si el banner amarillo "MODO PRUEBA ACTIVO" está visible, los emails se redirigen al test recipient.
- Desactivar test mode en `/admin/email-test` o vía SQL: `UPDATE notification_settings SET test_mode_enabled = false WHERE id = 'default';`

## 7. Seguridad

- El endpoint es público (no detrás de auth de usuario) por necesidad — GHL no puede pasar OAuth. Por eso el secret es la única defensa.
- Rotación: si el secret se filtra, generá uno nuevo, actualizalo en Netlify y en los Workflows GHL. Los POST con secret viejo darán 401 hasta que GHL retry con el nuevo.
- Logs: cada request rechazado por secret inválido se loggea, pero no bloqueamos IP. Si vemos abuso, agregar rate limiting.
