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

## 2) Gmail — conectar la casilla

Hay dos métodos. **Usá el A (OAuth)** porque el B (cuenta de servicio) suele estar
bloqueado por una org policy de Google (`iam.disableServiceAccountKeyCreation`, no
deja crear keys). El A no necesita key.

### Método A (RECOMENDADO) — OAuth con refresh token

**2a. Pantalla de consentimiento (una vez)**
1. https://console.cloud.google.com → elegí/creá un proyecto.
2. **APIs y servicios → Biblioteca** → **Gmail API** → **Habilitar**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** → tipo de usuario
   **Interno** (Internal). *Importante:* Interno = no requiere verificación de
   Google y el refresh token NO expira. Guardar.

**2b. Crear el ID de cliente OAuth**
1. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
2. Tipo de aplicación: **App de escritorio (Desktop app)**. Crear.
3. Copiá el **Client ID** y el **Client Secret**.

**2c. Obtener el refresh token (login una vez, en tu compu)**
1. Poné en `.env.local`:
   ```
   GMAIL_OAUTH_CLIENT_ID=<Client ID del 2b>
   GMAIL_OAUTH_CLIENT_SECRET=<Client Secret del 2b>
   GMAIL_IMPERSONATE_EMAIL=contacto@diegoferreyrainmobiliaria.com
   ```
2. Corré:
   ```
   npx tsx scripts/gmail-oauth-setup.ts
   ```
3. Se abre el navegador → **iniciá sesión COMO `contacto@diegoferreyrainmobiliaria.com`**
   → Aceptar. El script imprime `GMAIL_OAUTH_REFRESH_TOKEN=...`.
4. Pegá esa línea en `.env.local` (y luego en Netlify para producción).

> Si al aceptar dice "app no verificada", es normal para apps internas: entrá por
> "Configuración avanzada → Ir a (la app)". Con tipo **Interno** no hace falta verificación.

### Método B (alternativo) — Cuenta de servicio + delegación
Solo si tu organización permite crear keys de service account (si te dio el error
"Service account key creation is disabled", usá el método A).
1. Google Cloud → **Cuenta de servicio** → **Claves → JSON** (descarga). De ahí:
   `client_email` → `GMAIL_SA_CLIENT_EMAIL`, `private_key` → `GMAIL_SA_PRIVATE_KEY`.
2. Copiá el **Client ID** de la SA (Detalles avanzados).
3. En https://admin.google.com (admin del dominio): **Seguridad → Controles de API →
   Delegación de todo el dominio → Agregar** → pegá el Client ID + scope
   `https://www.googleapis.com/auth/gmail.readonly`.

### 2c. Env vars
En **Netlify** → Site settings → Environment variables (para producción) **y** en
`.env.local` (para probar local — paso 2d):
```
GMAIL_SA_CLIENT_EMAIL = <client_email del JSON>
GMAIL_SA_PRIVATE_KEY  = <private_key del JSON, en UNA línea, con los \n tal cual>
GMAIL_IMPERSONATE_EMAIL = contacto@diegoferreyrainmobiliaria.com
```
> La `GMAIL_SA_PRIVATE_KEY` debe ir en **una sola línea** (copiala tal cual del JSON,
> donde ya viene como `"-----BEGIN...\n...\n-----END...\n"` — incluí las comillas).

### 2d. Probar la conexión LOCAL (sin base de datos, sin WhatsApp)
Con las 3 vars en `.env.local`, corré el diagnóstico:
```
npx tsx scripts/gmail-portal-diagnostic.ts --days 60
```
Esto se conecta a Gmail, busca los correos de MercadoLibre/ZonaProp/Argenprop de los
últimos 60 días y muestra, por cada uno: remitente, asunto, portal detectado, y cómo
quedó parseado (nombre, tel, email, código, dirección). También lista los **remitentes
reales** encontrados. Si alguno aparece como "⚠️ NO RECONOCIDO" o "fuera de
PORTAL_SENDERS", pasámelo y ajusto el detector. **Recién cuando esto se ve bien,
seguí con el SQL.**

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
