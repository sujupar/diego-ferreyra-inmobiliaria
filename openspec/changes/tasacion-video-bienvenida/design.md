# Design

## Context

- **El primer WhatsApp de tasación:**
  - Lo manda el trabajo `whatsapp` de la cola del embudo: `primerWhatsappDeTasacion` en
    `lib/funnel/side-effect-handlers.ts`.
  - La plantilla sale de `WHATSAPP_TEMPLATE_TASACION`. Hoy es `tasacion_llamada_v1`
    (UTILIDAD, sin botones, un solo parámetro: el nombre de pila).
  - `buildTemplatePayload` (`lib/integrations/whatsapp/core.ts`) ya admite un botón de URL
    dinámica (`urlButtonParam`). Lo usa el recorrido (`lib/leads/send-recorrido-whatsapp.ts`).
- **La medición de video:**
  - Componente `components/funnel/FunnelClickToPlayVideo.tsx`: latido cada 5 s,
    `sendBeacon` al cerrar y respaldo en `localStorage`.
  - API `app/api/track/video/route.ts`, que llama a la RPC `upsert_video_view`.
  - Se guarda una fila por `(anon_id, video_key)`. El `contact_id` sale de `anon_identity`.
- **`link_anon_to_contact` nunca pisa una unión previa** (`coalesce(viejo, nuevo)`): con el
  `anon_id` del navegador, un celular que ya estaba unido a otro contacto le atribuiría el
  video a esa otra persona. Por eso D4 usa un `anon_id` propio del enlace.
- **Patrón de token para copiar:** la encuesta de visita (`/encuesta/<token>`) marca la
  apertura desde el navegador y no al armar la página en el servidor. Así la vista previa
  de WhatsApp no cuenta como apertura.
- **Línea de tiempo:** `lib/crm/linea-de-tiempo.ts` (lógica pura) más
  `lib/supabase/linea-de-tiempo.ts` (lecturas). El video ya aparece vía `video_view_state`.
- **Números:**
  - El de la empresa, que manda las plantillas, es +54 9 11 3907-0865 (leído de Meta el
    2026-11-27).
  - Paula llama desde +54 9 11 2292-6434.
- **Permisos:** `/metrics` exige `metrics.view`, que hoy tienen admin y dueño. Paula
  (coordinador) ve la medición en la cartera y en la ficha.
- **Video:**
  - Archivo limpio de 13:30, 1728×1080, 311 MB. Diego entrega después la versión editada.
  - El token de Cloudflare de `.env.local` no ve ninguna cuenta (es solo de DNS), así que
    no puede subir a R2.

## Goals / Non-Goals

**Goals:**
- Que la persona reciba en segundos un mensaje humano con un video de Diego, y que Paula
  deje de ser un número desconocido.
- Medir con nombre quién entró, cuánto vio y cómo cambia la atención de las llamadas.

**Non-Goals:**
- Emails.
- A/B del mensaje.
- Prender el agente de tasación.
- Editar el video.
- Una pantalla para cambiar los textos de la página: se cambian en un módulo de contenido.

## Decisions

### D1. Plantillas y textos

Se piden a Meta dos plantillas UTILIDAD en `es_AR`, con el mismo botón:

| | `tasacion_video_a_v1` (sobria) | `tasacion_video_b_v1` (con el caso) |
|---|---|---|
| `{{1}}` | nombre de pila | nombre de pila |
| `{{2}}` | enlace completo | enlace completo |
| Botón URL | "Ver el video" → `https://inmobiliariadiegoferreyra.com/video/{{1}}` | igual |

Cuerpo A:
```
Hola {{1}}, recibimos tu solicitud de tasación.

Antes de coordinar la visita, Diego Ferreyra te comparte un video donde cuenta, con un caso real, cómo trabajamos la venta de una propiedad.

Lo ves acá: {{2}}

Seguimos en contacto.
```

Cuerpo B:
```
Hola {{1}}, recibimos tu solicitud de tasación.

Antes de coordinar la visita, mirá este caso: la dueña de una casa terminó con USD 16.606 más en mano por cómo se publicó, cómo se negoció y cómo se calcularon los impuestos de la venta.

Diego te lo cuenta acá: {{2}}

Seguimos en contacto.
```

- **Regla de elección:** se usa la B solo si Meta la aprueba como **UTILITY**. Si la
  reclasifica a MARKETING, queda la A. Lo verifica el script de creación leyendo
  `category` de la plantilla aprobada.
- **Gotcha conocido:** el clasificador de Meta lee el vocabulario de venta ("gratuita",
  "sin costo") como promoción. Ninguno de los dos cuerpos lo usa.
- **El enlace también va en el texto** porque en WhatsApp de computadora el botón no abre
  nada (verificado el 2026-08-03).
- Los cuerpos aprobados se suman a `cuerpos-aprobados.ts` con
  `scripts/sincronizar-cuerpos-plantillas.ts`.

### D2. Tabla `video_bienvenida_enlaces`

| columna | tipo | regla |
|---|---|---|
| `codigo` | `text` PK | `CHECK (codigo ~ '^[A-HJ-NP-Za-kmnp-z2-9]{10}$')`, mismo alfabeto que `lead_access_tokens` |
| `contact_id` | `uuid` NOT NULL UNIQUE | FK `contacts(id)` ON DELETE CASCADE |
| `deal_id` | `uuid` | FK `deals(id)` ON DELETE SET NULL; el proceso que lo originó |
| `nombre` | `text` | nombre de pila congelado al crear |
| `origen` | `text` NOT NULL | `CHECK (origen IN ('whatsapp','manual'))` |
| `creado_por` | `uuid` | FK `profiles(id)` ON DELETE SET NULL (regla del proyecto); NULL si lo creó la cola |
| `created_at` | `timestamptz` | default `now()` |
| `primera_apertura`, `ultima_apertura` | `timestamptz` | |
| `aperturas` | `int` NOT NULL | default 0, `CHECK (aperturas >= 0)` |

- **RLS:** activada. Una sola policy, `SELECT` para `is_operations_user()`. No hay policies
  de escritura: escriben el servidor (rol de servicio) y la RPC.
- **Índices:** el PK y el `UNIQUE (contact_id)` cubren las lecturas por código y por
  contactos.
- **RPC de apertura:** `video_bienvenida_registrar_apertura(p_codigo text) returns boolean`.
  - Es `SECURITY DEFINER` con `search_path=public`.
  - Hace un `UPDATE` atómico: `aperturas = aperturas + 1`,
    `primera_apertura = coalesce(primera_apertura, now())`, `ultima_apertura = now()`.
  - Devuelve solo si el código existía. `GRANT EXECUTE` a `anon` y `authenticated`.
- **Crear o reusar:** `INSERT … ON CONFLICT (contact_id) DO NOTHING` y después `SELECT` por
  `contact_id`. Si el código choca (probabilidad despreciable), se reintenta con otro
  código hasta 3 veces.
- Al crear se llama `link_anon_to_contact('bv:' || codigo, contact_id)` (ver D4).
- **Migración:** `20261127000003_video_bienvenida.sql`. El 20261127000001 y el 000002 ya
  existen: antes de crearla, mirar el directorio.
- **Verificación** con `scripts/apply-video-bienvenida-pg.ts`, contra `mncsnastmcjdjxrehdep`:
  - la tabla existe con RLS;
  - el CHECK rechaza un código de 9 caracteres;
  - el UNIQUE rechaza dos enlaces del mismo contacto;
  - el rol `anon` lee 0 filas;
  - la RPC suma 1 y devuelve false con un código inexistente;
  - todo dentro de una transacción con ROLLBACK, sin dejar filas.

### D3. Envío (cola del embudo)

- `lib/video-bienvenida/plantillas.ts` (puro) define:
  - `PLANTILLAS_CON_VIDEO = ['tasacion_video_a_v1', 'tasacion_video_b_v1']`;
  - `parametrosDelEnvio(plantilla, nombre, enlace)`, que devuelve
    `{ bodyParams, urlButtonParam }` o `null` si la plantilla no lleva video.
- En `primerWhatsappDeTasacion`, si la plantilla vigente está en `PLANTILLAS_CON_VIDEO`:
  1. `obtenerOCrearEnlace({ contactId, dealId, nombre, origen: 'whatsapp' })`
     (`lib/video-bienvenida/enlaces.ts`).
  2. Si devuelve un enlace, se manda con
     `bodyParams: [nombre, urlCompleta]` y `urlButtonParam: codigo`.
  3. Si falla, se manda `tasacion_llamada_v1` con `[nombre]` y el resultado del trabajo
     registra `fallback: 'sin_enlace'` y el error.
- El agente de tasación decide con `PLANTILLAS_QUE_CONVERSAN`. Las plantillas nuevas **no**
  se agregan ahí: un test lo fija.
- El texto que guarda el Inbox sale de `cuerpos-aprobados.ts` con los parámetros reales,
  como hoy.

### D4. Página `app/video/[codigo]`

- Es un componente de servidor con `dynamic = 'force-dynamic'` y
  `robots: { index: false, follow: false }`. Lee el enlace con el rol de servicio. Si el
  código no existe o no cumple el formato, llama a `notFound()`.
- Usa el layout de las landings: fuente de marca, fondo navy y una sola columna. El
  contenido vive en `lib/video-bienvenida/contenido.ts`:
  - `titular(nombre)`;
  - `subtitulo`;
  - `video: { src, poster, duracionS, trackKey }`;
  - `paula: { nombre, telefonoE164, telefonoVisible }`;
  - `whatsappEmpresa`.
- El video usa `FunnelClickToPlayVideo` con `trackKey="bienvenida-tasacion-v1"`,
  `funnel="tasacion"`, `context="bienvenida"` y una prop nueva **`anonId="bv:<codigo>"`**.
  - Con la prop, el componente no lee ni crea la cookie `df_anon` y usa ese id. Sin la
    prop, se comporta igual que hoy en las landings.
  - Como el `anon_id` es del enlace, todo lo que mira la persona queda en su contacto, en
    cualquier dispositivo, y `upsert_video_view` se queda con el máximo.
- `VIDEO_KEYS` suma `'bienvenida-tasacion-v1'` sin `pagina`, así no entra en el panel
  "registrados vs no", que es para landings. Un campo nuevo,
  `nombreEnLinea: 'el video de bienvenida'`, lo usa la línea de tiempo.
  - **Cuando llegue el video editado**, la clave pasa a `-v2` y la `-v1` se marca
    `retirada`, para no mezclar la retención de dos videos.
- **Apertura:**
  - Un componente de cliente hace `POST /api/public/video/[codigo]` una vez por carga,
    con una marca en `sessionStorage` para no contar recargas en la misma pestaña.
  - La ruta valida el formato y llama a la RPC. Responde `{ ok: true }` y nada más.
  - Si el `POST` falla, el video se ve igual.
- **Rutas públicas:** `/video/` va en `middleware.ts` y `/api/public/video/` en
  `lib/supabase/middleware.ts`, que ya cubre `/api/public/`. Hay que confirmarlo y agregar
  un test.
- **"Guardar el contacto de Paula":** `GET /video/paula.vcf`, un vCard 3.0 estático
  servido con `text/vcard`.
- **"Escribinos por WhatsApp":** `https://wa.me/5491139070865?text=Hola%2C%20ya%20vi%20el%20video.%20Quiero%20coordinar%20la%20tasaci%C3%B3n.`
- El archivo de video va al bucket público `funnel-media`, en
  `bienvenida/tasacion-v1.mp4`. Se codifica a 720p H.264 + AAC, `+faststart`, ~110 MB.
  El póster es un cuadro del video con Diego, en JPG.

### D5. Línea de tiempo

- `lib/supabase/linea-de-tiempo.ts` suma la lectura de `video_bienvenida_enlaces` por
  `contact_id` cuando `aperturas > 0`.
- `lib/crm/linea-de-tiempo.ts` suma la clase `enlace_video`:
  - `eventoDeAperturaDeEnlace(enlace, ahora)` arma el título y el detalle "N veces".
  - `eventosDeVideo` usa `nombreEnLinea` cuando existe y, para la bienvenida, el detalle
    `mm:ss de mm:ss`, con `watch_seconds` sobre `duration_s`.
- La regla de "un asesor no ve lo de procesos de otro" no se toca: el enlace es del
  contacto, como el WhatsApp.

### D6. Marca en la cartera

- La lectura de la cartera suma, para los contactos de las filas visibles en Solicitud, una
  consulta a `video_bienvenida_enlaces` y otra a `video_view_state`, filtrada por
  `video_key LIKE 'bienvenida-tasacion-%'` y por esos `contact_id`. Son dos consultas por
  página, no una por fila.
- `marcaVideo(enlace, vista)` (puro) devuelve `{ texto, detalle }` o `null`.
- Va en gris neutro con ícono de play, en el renglón del nombre, y baja de renglón a
  390 px.

### D7. Panel en `/metrics`

- La lógica vive en `lib/metrics/panel/video-bienvenida.ts` (puro, con tests). Recibe los
  enlaces, las vistas, los procesos (`deals`: `created_at`, `scheduled_at`, `stage`) y las
  llamadas (`contact_activities` con `kind='call'` y `voided_at IS NULL`).
- **"Atendió":** alguna llamada con `call_outcome IN ('agendo', 'volver_a_llamar',
  'no_interesa')`.
- **"Coordinó":** algún proceso del contacto con `scheduled_at` no nulo.
- **Grupos:**
  - "Vio el video": `playback_started`;
  - "Abrió sin mirar": `aperturas > 0` sin play;
  - "No abrió".
- **Antes / después:** contactos con proceso del embudo creado en los 14 días previos a
  `CAMBIO_DESDE` (constante con la fecha de activación de la plantilla) contra los
  posteriores. **Ojo:** las llamadas se registran desde el 2026-11-26, así que "atendió"
  antes del cambio tiene base mínima. El panel lo avisa, y "coordinó" se compara completo.
- **Exclusiones:** contacto Julian Parra, `contacto.julianparra@gmail.com` y nombres con
  `[TEST`. Una persona por contacto.
- Cada porcentaje lleva su `n`, con aviso si `n < 20`.
- La UI es `components/metrics/panel/VideoBienvenida.tsx`: tabla a 1280 px y tarjetas a
  390 px.

### D8. Ficha: copiar o crear el enlace

- `POST /api/contacts/[id]/video-bienvenida` crea o reusa el enlace (`origen: 'manual'`,
  `creado_por` = la persona que lo crea) y devuelve la URL. Usa el mismo chequeo de
  permiso que editar la ficha y responde 403 al abogado. **No manda mensajes.**
- La ficha lee el enlace y muestra "Enlace del video" con "Copiar". Si no tiene enlace,
  muestra "Crear enlace del video" solo cuando el contacto tiene un proceso con
  `origin='embudo'`.

## Risks / Trade-offs

- **Meta reclasifica la plantilla:** la B puede salir MARKETING. Mitigación: D1, se usa la
  A.
- **Enlace reenviado:** si Ana se lo manda a su pareja, lo que mire la pareja suma a Ana.
  Se acepta: sigue siendo interés de ese hogar.
- **El navegador de WhatsApp o Instagram corta el video al minimizar:** el latido de 5 s y
  el respaldo en `localStorage` ya cubren lo visto hasta ese momento.
- **Peso del video:** 13:30 a 720p ronda los 110 MB. El reproductor descarga por partes
  (`faststart` más pedidos por rango) y no baja el archivo entero si la persona mira 2
  minutos.
- **Base chica:** con ~5 personas por semana, el panel va a decir "base chica" durante
  semanas. Lo honesto es mostrarlo, no esconderlo.
- **El código va dentro de la URL:** quien tenga el enlace ve el nombre de pila y nada
  más. Nunca se muestran teléfono, email ni dirección.

## Migration Plan

1. Aplicar la migración con el script de verificación y deployar el código. Con
   `WHATSAPP_TEMPLATE_TASACION` sin cambiar, el envío queda igual que hoy.
2. Crear las dos plantillas en Meta (`scripts/create-whatsapp-template-tasacion-video.ts`).
3. Probar de punta a punta contra el número de prueba de Julián: recibir, abrir, mirar y
   ver la ficha y el panel. Después borrar los datos de prueba.
4. Cuando Meta apruebe, poner en Netlify `WHATSAPP_TEMPLATE_TASACION` = la B si salió
   UTILITY, o la A, y cargar `CAMBIO_DESDE`.
5. **Vuelta atrás:** `WHATSAPP_TEMPLATE_TASACION=tasacion_llamada_v1`. Los enlaces
   existentes siguen abriendo.

## Open Questions

- Ninguna bloqueante. Cuando llegue el video editado: subirlo como `tasacion-v2.mp4`,
  clave `-v2`, y marcar la `-v1` como retirada.
