# Flujo "conocé la propiedad por dentro": video recorrido → WhatsApp → agenda

**Fecha:** 2026-07-28
**Estado:** Diseño aprobado (decisiones tomadas) — pendiente plan de implementación
**Autor:** Julian Parra + Claude

---

## 1. Objetivo de negocio

Convertir visitantes de la landing en **visitas agendadas calificadas**. El
mecanismo: la landing NO muestra todo; para conocer la propiedad por dentro hay
que registrarse. A cambio, la persona recibe por WhatsApp el **video recorrido**
(o el **recorrido virtual**) y puede proponer día y hora de visita en dos toques,
sin volver a cargar sus datos.

El usuario reporta que este flujo, probado en otros contextos, rinde alto y
produce citas mucho más calificadas.

---

## 2. Qué ya existe (verificado en el código)

| Pieza | Estado | Dónde |
|---|---|---|
| WhatsApp Cloud API **en vivo** (`WHATSAPP_TEST_MODE=false`) | ✅ | `lib/integrations/whatsapp/core.ts` |
| Plantilla **de utilidad** aprobada `consulta_portal_util` (es_AR) | ✅ | env `WHATSAPP_TEMPLATE_NAME` |
| Envío de plantillas con parámetros de body | ✅ | `sendWhatsappTemplate()` |
| Tabla `property_visits` (fecha, asesor, contacto, estado) | ✅ | `20260513000001_property_visits_schema.sql` |
| Captura de leads + notificación al asesor | ✅ | `app/api/leads/route.ts` |
| Puerta de registro en la galería (Fase 2) | ✅ | `GalleryLightbox` + `LeadCaptureProvider` |
| Media: fotos, `video_url` (enlace), `video_file_url` (subido), `tour_3d_url` | ✅ | `properties` |
| CC de supervisión por WhatsApp | ✅ | env `WHATSAPP_CC_PHONES` |

**Limitaciones a resolver:** `sendWhatsappTemplate` solo manda parámetros de
**body** — no soporta botones ni header. El botón con URL dinámica requiere
extenderlo Y una plantilla nueva aprobada por Meta.

---

## 3. Decisiones tomadas

| Decisión | Elección | Impacto |
|---|---|---|
| Botón "Agendar Visita" del WhatsApp | **Abre la página con el hash** (no bot conversacional) | Elimina webhook + máquina de estados + ventana de 24h. El cliente igual agenda en 2 toques. |
| Qué pasa al elegir día/hora | **Propone y el equipo confirma** | No hace falta sistema de disponibilidad por asesor. Coincide con "nuestro equipo se va a contactar para confirmar". |
| Video recorrido vs recorrido 3D | **El asesor elige al crear la landing** | Campo explícito en la propiedad; el asistente pregunta solo si hay ambos. |

**Fuera de alcance (posible etapa futura):** el bot conversacional de WhatsApp
que pregunta día y hora dentro del chat.

---

## 4. Arquitectura

### 4.1 Modelo de datos

**Migración `properties`** (aditiva):
```sql
ALTER TABLE properties ADD COLUMN IF NOT EXISTS video_recorrido_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deliver_media TEXT;  -- 'video_recorrido' | 'tour_3d'
```
- `video_recorrido_url`: recorrido filmado por dentro. **Distinto** de:
  - `video_url` — enlace externo que consumen los portales (va en la landing pública),
  - `video_file_url` — video subido (Storage),
  - `tour_3d_url` — recorrido virtual navegable (iframe).
  Acepta enlace externo (YouTube/Vimeo) **o** URL de Storage si se sube archivo.
- `deliver_media`: qué se le entrega al cliente registrado. Lo fija el asesor.

**Tabla nueva `lead_access_tokens`** — el "hash" de la persona:
```sql
CREATE TABLE lead_access_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token        TEXT NOT NULL UNIQUE,          -- 10 chars base62, va en la URL corta
  property_id  UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES leads(id) ON DELETE SET NULL,
  contact_id   UUID REFERENCES contacts(id) ON DELETE SET NULL,
  -- Snapshot de los datos ya registrados: permite prellenar la agenda SIN pedirlos
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  opened_at    TIMESTAMPTZ,                   -- 1ª apertura (medición)
  open_count   INTEGER NOT NULL DEFAULT 0,
  scheduled_at TIMESTAMPTZ                    -- cuándo agendó desde este token
);
CREATE INDEX ON lead_access_tokens (property_id);
```
- El token **no caduca** (el cliente puede volver al video cuando quiera) y es
  de un solo destinatario. No expone datos sensibles: solo nombre + la media.

**Migración `property_visits`** — nuevo estado:
```sql
ALTER TABLE property_visits DROP CONSTRAINT IF EXISTS property_visits_status_check;
ALTER TABLE property_visits ADD CONSTRAINT property_visits_status_check
  CHECK (status IN ('pending_confirmation','scheduled','completed','no_show','cancelled'));
```
> Gotcha conocido del proyecto: agregar un valor de status SIN recrear el CHECK
> rompe con `23514 check_violation` (pasó con `properties.status='descartada'`).

### 4.2 Flujo end-to-end

```
Landing /p/[slug]
  ├── Si hay video (video_url/video_file_url) → se ve en el hero
  ├── Galería: 3 fotos + resto con candado          [Fase 2, ya hecho]
  └── CTA "Conocé la propiedad por dentro"
        ↓ (popup de captura)
  POST /api/leads
        ├── crea lead + notifica al asesor           [ya existe]
        ├── crea lead_access_tokens (token único)    [nuevo]
        └── envía WhatsApp de utilidad con el link   [nuevo, Fase 3B]
        ↓
  Pantalla de gracias (estado de éxito del popup)
     "¡Listo! Te mandamos por WhatsApp el recorrido de la propiedad."
        ↓
  WhatsApp → botón → https://inmodf.com.ar/v/<token>
        ↓
  GET /v/[token]  (página pública, sin login)
        ├── video recorrido O recorrido 3D (según deliver_media)
        ├── datos básicos de la propiedad
        └── "Agendar visita": elige DÍA + FRANJA (mañana/tarde) — sin cargar datos
              ↓
        POST /api/v/[token]/schedule
              ├── property_visits (status 'pending_confirmation')
              ├── notifica: asesor asignado + coordinador + CC (Julián, Diego)
              │    por email (Resend) y WhatsApp (plantilla)
              └── "Nuestro equipo se va a contactar para confirmar la visita"
```

### 4.3 Elección de media en el asistente de landing

En el wizard de landing (`startCoCreation` / paso de preview), si la propiedad
tiene **ambos** (`video_recorrido_url` y `tour_3d_url`), se le pregunta al asesor
cuál entregar y se guarda en `properties.deliver_media`. Si tiene **uno solo**,
se setea automáticamente sin preguntar. Si no tiene **ninguno**, el flujo sigue
funcionando: el WhatsApp se manda igual, con las fotos completas como entrega, y
la página del token muestra la galería completa.

### 4.4 Acortador de links

No hace falta dominio nuevo: la ruta corta `/v/<token>` sobre el dominio propio
(`inmodf.com.ar`) ya es corta y de marca. El token de 10 caracteres base62 da
~8·10¹⁷ combinaciones (no adivinable por fuerza bruta a escala de este negocio).

### 4.5 WhatsApp (Fase 3B)

Plantilla nueva **de utilidad**, `recorrido_propiedad_util` (es_AR):

```
Hola {{1}}, gracias por tu interés en {{2}}.
Te compartimos el recorrido completo de la propiedad para que la conozcas por dentro.
Si te gusta, podés proponer día y horario para visitarla.
[Botón URL: "Ver recorrido"] → https://inmodf.com.ar/v/{{1}}
```
- `sendWhatsappTemplate` se extiende para aceptar **componentes de botón**
  (`type: 'button', sub_type: 'url', index: 0, parameters: [{type:'text', text: token}]`).
- La plantilla la **aprueba Meta** (fuera de nuestro control, suele tardar días).
  Hasta que esté aprobada, el flujo funciona igual: el link se muestra en la
  pantalla de gracias y se manda por email.

### 4.6 Notificaciones al agendar

Destinatarios: **asesor asignado + coordinador + Julián Parra + Diego Ferreyra**.
- **Email:** helper existente `sendEmail()` (Resend, `inmodf.com.ar`).
- **WhatsApp:** plantilla existente/nueva; el CC de supervisión ya se resuelve
  con `WHATSAPP_CC_PHONES` (patrón de `portal-inquiries/notify.ts`).
- Ambas vías son **best-effort**: si fallan, la visita YA quedó registrada (nunca
  se pierde el turno por un fallo de notificación).

### 4.7 Medición

- `lead_access_tokens.opened_at` / `open_count` → cuántos abren el recorrido.
- `lead_access_tokens.scheduled_at` → cuántos agendan desde el recorrido.
- Embudo: registros → aperturas del recorrido → visitas propuestas → confirmadas.
- Se apoya en `property_visits.status` para el tramo final.

---

## 5. Sub-fases

| Fase | Contenido | Depende de |
|---|---|---|
| **3A** | Migraciones, campo video recorrido + elección, token, página `/v/[token]`, agenda, notificaciones por email, medición | Nada externo |
| **3B** | Plantilla nueva + botón URL + envío automático por WhatsApp + aviso por WhatsApp al agendar | **Aprobación de Meta** |
| **3C** (futuro) | Bot conversacional de WhatsApp para elegir día/hora en el chat | 3B |

**3A entrega valor completo por sí sola**: el cliente recibe el link (por email y
en la pantalla de gracias) y puede agendar. 3B solo cambia el canal de entrega.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Meta demora o rechaza la plantilla | 3A funciona sin WhatsApp (link por email + pantalla de gracias). |
| Token filtrado (se comparte el link) | Solo expone la media de una propiedad y un nombre. La agenda queda "a confirmar" y la valida un humano. |
| Propiedad sin video recorrido ni tour | El flujo no se rompe: se entrega la galería completa. |
| Doble agendamiento desde el mismo token | Se permite (puede cambiar de idea); la última propuesta gana y el equipo confirma. |
| El CHECK de `property_visits` rompe el insert | La migración recrea el constraint (gotcha ya documentado en CLAUDE.md). |
| Notificación falla | Best-effort; la visita ya está persistida. |

---

## 7. Fuera de alcance

- Bot conversacional de WhatsApp (3C).
- Disponibilidad real por asesor / reserva firme (se eligió "propone y confirma").
- Dominio de acortador separado (se usa `inmodf.com.ar/v/...`).
- Recordatorios automáticos previos a la visita (ya existe `visit-reminders`; se
  evaluará conectarlo después).
