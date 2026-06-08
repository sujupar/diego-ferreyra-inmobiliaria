# Setup — Consultas de portales → WhatsApp

Guía paso a paso para activar el sistema que escanea Gmail, parsea las consultas
de MercadoLibre/ZonaProp/Argenprop y avisa por WhatsApp al asesor.

Orden recomendado: **1) SQL → 2) Gmail → 3) Lista de propiedades → 4) WhatsApp → 5) Deploy → 6) Activar envío real.**

Todo arranca en **modo prueba** (`WHATSAPP_TEST_MODE=true`): el sistema registra
y muestra las consultas en el inbox, pero NO envía WhatsApp hasta que vos lo actives.

---

## 1) SQL — crear las tablas (5 min)

1. Supabase Dashboard → **SQL Editor**.
2. Pegá el contenido de `supabase/migrations/20260603000001_portal_inquiries.sql`.
3. **Run**. (Es idempotente: re-ejecutar es seguro.)

Verificación: `SELECT * FROM portal_inquiry_poll_state;` debe devolver 1 fila (id=1).

---

## 2) Gmail — conectar la casilla (cuenta de servicio + delegación)

La casilla `contacto@diegoferreyrainmobiliaria.com` es de **Google Workspace**, así
que usamos una "cuenta de servicio" con delegación. **Esto NO se hace en nuestra
plataforma** — se hace en Google Cloud + el panel de administración de Google.

### 2a. Crear la cuenta de servicio (Google Cloud Console)
1. Andá a https://console.cloud.google.com → crear (o elegir) un proyecto.
2. Menú → **APIs y servicios → Biblioteca** → buscá **Gmail API** → **Habilitar**.
3. Menú → **APIs y servicios → Credenciales** → **Crear credenciales → Cuenta de servicio**.
   - Nombre: `gmail-consultas-portales`. Crear.
4. Entrá a la cuenta de servicio creada → pestaña **Claves** → **Agregar clave → Crear clave nueva → JSON**. Se descarga un archivo `.json`. **Guardalo bien.**
   - De ese JSON salen dos env vars: `client_email` → `GMAIL_SA_CLIENT_EMAIL`, y `private_key` → `GMAIL_SA_PRIVATE_KEY`.
5. En la misma cuenta de servicio, **Detalles avanzados** → copiá el **Client ID** (un número largo, ej. `1078...`). Lo necesitás en el paso 2b.

### 2b. Autorizar la delegación (Google Admin Console) ← "dónde se autoriza el Client ID"
Esto lo hace **quien administra el dominio** `diegoferreyrainmobiliaria.com` en https://admin.google.com:
1. **Seguridad → Acceso y control de datos → Controles de API → Delegación de todo el dominio** (Domain-wide Delegation).
2. **Agregar nuevo**.
3. **ID de cliente:** pegá el **Client ID** del paso 2a.5.
4. **Permisos de OAuth (scopes):** `https://www.googleapis.com/auth/gmail.readonly`
5. **Autorizar.**

> En resumen: el Client ID NO se carga en nuestra plataforma. Se autoriza en el
> panel de administración de Google Workspace (admin.google.com). Nuestra plataforma
> solo usa el JSON de la cuenta de servicio (vía env vars).

### 2c. Env vars (en Netlify → Site settings → Environment variables)
```
GMAIL_SA_CLIENT_EMAIL = <client_email del JSON>
GMAIL_SA_PRIVATE_KEY  = <private_key del JSON, con los \n tal cual>
GMAIL_IMPERSONATE_EMAIL = contacto@diegoferreyrainmobiliaria.com
```

---

## 3) Lista de propiedades → asesor

1. Completá la lista en formato CSV (ver `scripts/data/portal-property-map.example.csv`).
   Columnas: `portal,external_code,external_url,address,neighborhood,title,advisor`.
   - `advisor` = nombre, email, o "Diego"/"Lucas".
   - Conviene poner el **código o la URL del aviso** (mejor match); si solo hay
     dirección también sirve (match difuso).
2. Cargala:
   ```
   npx tsx scripts/seed-portal-property-map.ts --file scripts/data/TU-LISTA.csv --dry-run   # revisar
   npx tsx scripts/seed-portal-property-map.ts --file scripts/data/TU-LISTA.csv --commit    # cargar
   ```
3. También se puede ver/editar en el inbox (sección Consultas) una vez en producción.

---

## 4) WhatsApp — paso a paso en Meta (ver `docs/setup-whatsapp-cloud-api.md`)

Resumen: número de negocio dedicado + plantilla `nueva_consulta_portal` aprobada +
system-user token. Detalle completo en el otro doc.

Env vars (Netlify):
```
WHATSAPP_PHONE_NUMBER_ID = ...
WHATSAPP_BUSINESS_ACCOUNT_ID = ...
WHATSAPP_ACCESS_TOKEN = ...
WHATSAPP_API_VERSION = v21.0
WHATSAPP_TEMPLATE_NAME = nueva_consulta_portal
WHATSAPP_TEMPLATE_LANG = es_AR
WHATSAPP_TEST_MODE = true          # dejar en true hasta validar
WHATSAPP_FALLBACK_PHONE = <tel de Diego en formato 549...>  # opcional
```

---

## 5) Deploy + cron (pg_cron, NO Netlify)

⚠️ **Las Netlify Scheduled Functions NO se disparan en este sitio** (Next 16 + plugin v5,
ver CLAUDE.md). El cron de consultas corre vía **Supabase pg_cron**, igual que los reportes
y `publish-listings`. La ruta `/api/cron/portal-inquiries` (GET+POST) ya está deployada.

1. Commit + push a `main` (autor Sujupar) — ya hecho: el código del sistema está en producción.
2. En Supabase → SQL Editor, correr `supabase/migrations/20260608000001_cron_portal_inquiries.sql`
   (auto-suficiente: copia el secreto de otro cron y agenda el job cada 5 min). Correr **después**
   de que el deploy de Netlify haya terminado (sino el job pega a una ruta que aún no existe → 404).

Verificación post-deploy (3 capas):
- `SELECT * FROM cron.job WHERE jobname='portal-inquiries';`
- `SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 5;`  → esperar **200**
- `SELECT last_polled_at, last_run_stats FROM portal_inquiry_poll_state WHERE id=1;`
  → `last_run_stats.status` debe ser `ok | skipped | failed` (skipped = Gmail no configurado todavía).

---

## 6) Activar el envío real

Cuando ya veas en el inbox que las consultas se parsean y asignan bien (en modo prueba),
poné `WHATSAPP_TEST_MODE=false` en Netlify y redeployá. Recién ahí empieza a mandar WhatsApp.

---

## Verificar que anda

- **Inbox → Consultas:** deberían aparecer las consultas entrantes con su asesor.
- **`portal_inquiry_poll_state`:** `last_run_stats` muestra `fetched/parsed/inserted/notifySent/...`.
- **`portal_inquiry_notifications`:** una fila por intento de WhatsApp (en modo prueba quedan como `skipped` con `test_mode=true`).
