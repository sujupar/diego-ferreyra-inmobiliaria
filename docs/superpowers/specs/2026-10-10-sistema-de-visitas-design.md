# Sistema de visitas a propiedades captadas — diseño

**Fecha:** 2026-10-10 · **Rama:** `feat/sistema-visitas` · **Tamaño:** grande (base de datos, permisos, mensajes a clientes)
**Diseño visual aprobado:** opción **A — Claridad** del lienzo
<https://claude.ai/artifact/4rfWaJomtQgBCDadkLUAUe> (pantallas `Main`, `A-Agendar`, `A-Encuesta`).

---

## 0. Decisiones del dueño (2026-10-10)

1. **Camino A:** se amplía lo que existe (tabla de visitas, encuesta de mayo) en vez de rehacer o
   crear una tabla única de personas.
2. **Diseño A — Claridad**, "por lejos". Rediseño al máximo nivel de toda la experiencia asociada.
3. **Cinco orígenes:** Consulta de portal · Publicidad de Meta · Otra publicidad paga (Google u
   otra) · Cartel en la propiedad · Otro (se escribe cuál).
4. La encuesta sale **sola cuando el asesor marca "Visita realizada"**, nunca antes.
5. El envío por WhatsApp queda **construido pero apagado** hasta que esté el regalo (lead magnet)
   que se arma con Diego. Mientras tanto se prueba solo con nuestros números.
6. El mensaje de WhatsApp **no menciona el regalo** (texto neutro de utilidad para que Meta lo
   apruebe y llegue siempre); el regalo se presenta adentro de la encuesta.
7. La encuesta se enfoca en **lo que la persona recibe**, dice **"menos de un minuto"** y **no
   cuenta las preguntas**. La experiencia es la de Typeform.
8. Un asesor agenda a su nombre; coordinador, admin y dueño eligen asesor. El abogado no ve visitas.
9. Teléfono obligatorio, email opcional.
10. Etapas: A confirmar → Confirmada → Realizada / No se realizó / Cancelada; motivo obligatorio
    cuando no se hace; reprogramar deja rastro.
11. Al agendar **no** se le manda WhatsApp a la persona.

---

## 1. Problema y resultado

**Problema:** las visitas de compradores no se registran de forma consistente (12 en toda la
historia, casi todas pruebas del agente), no se sabe de qué canal vienen, si se hacen, cuánto
tarda cada paso, ni qué opinan los que visitaron.

**Resultado:** cada visita a una propiedad captada queda registrada con **quién** (una persona
real), **de dónde vino**, **quién la muestra** y **cuándo**; cada cambio de etapa queda con fecha,
autor y motivo; la sección Visitas mide todo (volumen, realización, tiempos, origen, asesor,
opiniones); y después de cada visita realizada la persona recibe una encuesta estilo Typeform,
prellenada con sus datos, cuyas respuestas quedan pegadas a la visita y a la propiedad.

---

## 2. Lo que hay hoy (medido el 2026-10-10)

| Pieza | Estado |
|---|---|
| `property_visits` | 18 columnas, 5 estados (`pending_confirmation, scheduled, completed, no_show, cancelled`). 12 filas: 8 del agente IA (canceladas por reinicios de prueba), 3 a confirmar, 1 no-show. Sin origen, sin vínculo directo al comprador, sin historial. RLS de lectura abierta a cualquier usuario (incluido el abogado). |
| `visit_questionnaires` + `visit_questionnaire_tokens` (mayo) | Mismas 5 preguntas. **0 filas.** Solo email; todo en una pantalla; el envío fallaría siempre (la tabla de tokens no tiene política de INSERT y la ruta usa la sesión del usuario). Inserción de respuestas abierta a cualquier usuario logueado. |
| Sección `/visits` | Lista + una sola cifra. No permite cancelar, reprogramar, editar ni cambiar asesor. |
| Alta manual | `ScheduleVisitDialog` (solo desde el listado), email obligatorio, hora tomada en UTC. |
| Recordatorio "¿se realizó?" | Nunca corrió: depende de una función programada de Netlify (no se disparan en este sitio) y lee con la sesión anónima (RLS devuelve vacío). |
| Personas | Tres lugares: `portal_inquiries` (553; 95% con teléfono; sin `phone_norm`), `property_leads` (49; compradores; landing con UTM), `contacts` (vendedores). |
| Datos a reparar | 39 consultas de **Entre Ríos 2333** cuelgan de la copia fusionada `[FUSIONADA->1e116561]`; no aparecerían en "quién consultó". |
| Horarios | Varios emails y pantallas formatean sin zona horaria → en el servidor (UTC) la hora sale corrida 3 h. |

---

## 3. Qué ve el usuario

### 3.1 Botón "+ Nuevo" (barra superior, todas las pantallas)

- A la derecha de la barra, antes del usuario. En escritorio "＋ Nuevo"; en celular solo "＋".
- Menú: **Agendar visita** (abre la ventana de 3.2) y **Nueva tasación** (`/appraisal/new`).
- Quién lo ve: admin, dueño, coordinador, asesor. "Nueva tasación" solo para quien ya la tiene en
  el menú lateral (asesor, admin, dueño). El abogado no ve el botón.

### 3.2 Agendar visita (ventana paso a paso — `A-Agendar`)

Ventana con la lista de pasos a la izquierda (cada paso hecho muestra su valor); en celular se
abre desde abajo a pantalla completa y la lista de pasos se vuelve una barra arriba.

1. **Propiedad** — buscador de propiedades captadas (`status='approved'`) con estado comercial
   `disponible` o `reservada`. Se saltea si se abre desde la ficha.
2. **Origen** — cinco tarjetas. "Otro" pide escribir cuál. "Otra publicidad paga" ofrece escribir
   cuál (opcional, ej. "Google").
3. **Persona:**
   - *Consulta de portal:* todas las personas que consultaron por esa propiedad (más recientes
     primero), con portal, hace cuánto, teléfono; buscador por nombre/teléfono.
   - *Publicidad de Meta / Otra publicidad paga:* los registrados en la landing de esa propiedad,
     con la marca de qué publicidad los trajo (Meta primero si el origen es Meta).
   - *Cartel / Otro:* nombre y teléfono (email opcional).
   - Siempre: "No está en la lista — cargar a mano". Si falta el teléfono (MercadoLibre lo oculta)
     se pide en el momento. Si la persona ya tiene una visita activa a esa propiedad, se avisa
     ("Ya tiene visita hoy 10:30") y hay que confirmar para agendar otra.
4. **Día y hora** — fila de días (Hoy, Mañana, …, 7 días) + horarios en botones cada 30 min de
   8:00 a 20:30 + "Otro día u horario" (fecha y hora libres). Se puede elegir una fecha **pasada
   (hasta 60 días)** para documentar una visita que ya ocurrió. Aviso (no bloquea) si el asesor ya
   tiene otra visita ±1 h o la propiedad tiene otra visita ese día.
5. **Asesor** — viene el asesor de la propiedad. Coordinador/admin/dueño lo cambian; un asesor
   queda a su nombre (sin selector).
6. **Confirmar** — resumen + "¿Ya está confirmada con la persona?" (sí → **Confirmada**; no →
   **A confirmar**). Notas opcionales. Botón **Agendar**.

Al agendar: aparece en la agenda y en la ficha; la persona pasa a "Visita agendada" en su registro
de comprador; si tiene email recibe el email de confirmación que ya existe (con la hora
corregida). **No** se manda WhatsApp.

Errores: cada paso valida antes de avanzar; un error del servidor se muestra en castellano en el
paso que corresponde, sin perder lo cargado.

### 3.3 Ficha de la visita (`/visits/[id]`) — etapas y motivos

- Encabezado: propiedad (foto, dirección), persona (nombre, teléfono con botón de WhatsApp,
  origen con link a la consulta/registro original), asesor, fecha y hora, estado.
- **Acciones según estado:**
  - *A confirmar:* **Confirmar** · Reprogramar · Cancelar.
  - *Confirmada (futura):* Reprogramar · Cancelar · Cambiar asesor.
  - *Ya pasó sin resultado:* **Se realizó** · **No se realizó** · Reprogramar.
  - *Realizada:* ver/copiar/reenviar encuesta; ver respuestas.
- **Se realizó:** pide "¿Cómo viste el interés?" (Alto / Medio / Bajo) + notas opcionales →
  dispara la encuesta (3.6).
- **No se realizó / Cancelar:** motivo obligatorio — *No vino* · *Canceló la persona* · *Canceló
  el propietario* · *Cancelamos nosotros* · *La propiedad dejó de estar disponible* · *Otro*
  (escribir).
- **Reprogramar:** mismo selector de día y hora; cuenta reprogramaciones.
- **Línea de tiempo:** cada cambio (creada, confirmada, reprogramada, realizada, no realizada,
  cancelada, asesor cambiado, encuesta enviada/abierta/respondida) con fecha, hora y quién.

### 3.4 Sección Visitas (`/visits`) — pantalla `Main` del lienzo

- Encabezado: "Visitas", resumen del día ("3 visitas hoy · 5 cosas para resolver"), período
  (7 días / 30 días / Este mes / personalizado), filtros (asesor —solo quien ve todo—,
  propiedad, origen), botón **Agendar visita**.
- **Tarjetas:** Agendadas · Se realizaron (% con su base) · No se hicieron (no vinieron +
  canceladas) · Encuestas respondidas (% con su base) · De la consulta a la visita (mediana).
- **Agenda:** por día (Hoy, Mañana, próximos), con hora, propiedad, persona, origen, asesor y
  estado. "Ver todas" → lista completa con filtros y paginación.
- **Requieren tu acción:** pasaron sin resultado (con botones Se realizó / No se realizó /
  Reprogramar ahí mismo) · A confirmar · Encuestas sin responder hace más de 48 h.
- **Cómo vienen las visitas:** embudo (Agendadas → Confirmadas → Se realizaron → Respondieron
  encuesta → Dijeron cuánto ofertarían) resaltando el salto más grande; por origen (cantidad y %
  realizado); tiempos (medianas); por asesor.
- **Qué opinan los que visitaron:** por propiedad — visitas, a cuántos les gustó, opinión sobre el
  precio, oferta mediana y diferencia contra el precio publicado.
- Regla del tablero: cada número viaja con su base; con base < 20 se avisa "orientativo"; sin
  datos dice "Sin datos", nunca 0.
- El asesor ve solo sus visitas y sus números; admin, dueño y coordinador ven todo.

### 3.5 Ficha de la propiedad

- Botón **Agendar visita** en la fila de acciones del encabezado (junto a "Agregar tarea") si la
  propiedad está captada y disponible/reservada, para quien puede agendar.
- Pestaña nueva **Visitas** (visible para quien no es abogado, propiedad captada): próximas,
  pasadas (con estado) y el bloque **Qué opinan los que visitaron** de esa propiedad: respuestas,
  % que le gustó, opinión de precio, oferta mediana vs publicada, lo que más y menos gustó
  (con cantidades) y los comentarios escritos. Reemplaza "Feedback de visitas" del Historial.
- El botón "Agendar visita" del modal del listado de propiedades abre la misma ventana nueva.

### 3.6 La encuesta pública (`inmodf.com.ar/encuesta/<código>`) — pantalla `A-Encuesta`

Experiencia Typeform, una pregunta por pantalla, celular primero, con la marca (Geist, azul
marino de la plataforma), prellenada por el código del link.

1. **Bienvenida enfocada en el regalo:** foto de la propiedad; debajo (nada montado encima de la
   foto) "Visitaste <dirección>"; tarjeta del regalo (portada + título); "<Nombre>, este regalo es tuyo." · "Contanos qué te pareció la
   visita y es tuyo al instante. Te lleva menos de un minuto." Botón **Quiero mi regalo**.
   *No* dice cuántas preguntas son. Si el regalo todavía no está configurado, la bienvenida es
   neutra ("<Nombre>, ¿qué te pareció <dirección>? Te lleva menos de un minuto.").
2. **¿Te gustó <dirección>?** Sí / No (avanza solo al tocar).
3. **¿Qué fue lo que más te gustó?** Opciones armadas con lo que tiene ESA propiedad (ver 4.8) +
   "Otra cosa" (texto). Varias.
4. **¿Y lo que menos te gustó?** Ídem, con su propio juego de opciones. Varias.
5. **Está publicada en <moneda> <precio>. ¿Te parece…?** Correcto / Alto / Bajo (avanza solo).
6. **Si fueras a comprarla, ¿cuánto ofertarías?** Monto en la moneda publicada + atajos
   (−10 %, −5 %, precio publicado redondeados) + "Prefiero no decirlo". "El propietario no ve tu
   nombre".
7. **Confirmá tus datos para recibirlo:** regalo + WhatsApp prellenado y enmascarado
   ("11 ••••-4521", "Cambiar") + email opcional + casilla "Avisame si entra una propiedad
   parecida". Botón **Quiero mi regalo**.
8. **Gracias:** descarga inmediata del regalo (si está configurado) y "Si querés volver a verla o
   hacer una oferta, respondé el WhatsApp de la visita". Los textos que prometen *mandar* el
   regalo por WhatsApp se activan recién cuando exista esa entrega (infraestructura del regalo,
   §5); hasta entonces el regalo se entrega por descarga en esta pantalla.

Comportamiento: barra fina de avance (sin "x de y"), botón "OK ✓" en preguntas de varias opciones,
atrás con la flecha, transición de entrada hacia arriba solo con CSS y respetando "reducir
movimiento", teclado en computadora (letras A/B/C, Enter). **Se guarda pregunta a pregunta**: si
abandona en la 3, las dos primeras respuestas quedan. Si vuelve a abrir el link, retoma donde
quedó; si ya terminó, ve la pantalla de gracias (con el regalo).

> **Componente estilo Typeform:** ver §4.9 (decisión librería vs propio, tras la investigación).

### 3.7 Envío de la encuesta

- Al marcar **Se realizó**, el sistema crea el link de la encuesta y, **si el envío automático
  está prendido** (o el teléfono está en la lista de prueba), manda la plantilla de WhatsApp.
- La ficha de la visita muestra el estado: *Sin enviar (envío apagado)* · *Enviada* ·
  *Entregada* · *Leída* · *Abierta* · *Respondida* · *Falló: <motivo en castellano>*.
- Botones: **Copiar link** (siempre) y **Reenviar por WhatsApp** (si el envío está habilitado).
- Interruptor y lista de números de prueba: solo admin/dueño (por SQL en esta entrega; pantalla
  de configuración queda afuera).

---

## 4. Qué pasa por detrás

### 4.1 Modelo de datos

**Entrega 1 — migración `20261010000002_visitas_origen_e_historial.sql` (aditiva):**

- `property_leads.phone_norm` — columna generada, misma expresión que `contacts.phone_norm`
  (últimos 10 dígitos o NULL) + índice `(property_id, phone_norm)`. Regla de CLAUDE.md: los
  lookups por teléfono nunca usan igualdad exacta.
- `portal_inquiries.phone_norm` — ídem + índice `(property_id, phone_norm)`.
- `property_visits` agrega:
  - `origin TEXT` CHECK `origin IS NULL OR origin IN ('portal','publicidad_meta','publicidad_paga','cartel','otro')`
    (NULL solo para las 12 filas viejas; la app lo exige en altas nuevas).
  - `origin_detail TEXT` (cuál, para "otro"/"publicidad_paga"; portal para "portal").
  - `lead_id UUID REFERENCES property_leads(id) ON DELETE SET NULL`.
  - `portal_inquiry_id UUID REFERENCES portal_inquiries(id) ON DELETE SET NULL`.
  - `confirmed_at`, `outcome_at TIMESTAMPTZ`.
  - `outcome_reason TEXT` CHECK en (`no_vino`, `cancelo_persona`, `cancelo_propietario`,
    `cancelamos_nosotros`, `no_disponible`, `otro`) o NULL.
  - `advisor_interest TEXT` CHECK en (`alto`,`medio`,`bajo`) o NULL.
  - `reschedule_count INT NOT NULL DEFAULT 0`.
  - `changed_by UUID REFERENCES profiles(id) ON DELETE SET NULL` (quién hizo el último cambio; lo
    escribe la app; NULL = agente, cliente o sistema).
  - Índices: `(lead_id)`, `(portal_inquiry_id)`, `(advisor_id, scheduled_at)`, `(property_id, scheduled_at)`.
- `property_visit_events` (historial, solo crece): `id, visit_id → property_visits ON DELETE
  CASCADE, kind, from_status, to_status, from_scheduled_at, to_scheduled_at, from_advisor_id,
  to_advisor_id, reason, actor_id → profiles SET NULL, created_at`. `kind` CHECK:
  `creada, confirmada, reprogramada, realizada, no_realizada, cancelada, asesor_cambiado,
  reabierta`.
- **Triggers** (regla de CLAUDE.md: el que escribe en otra tabla va en AFTER):
  - `BEFORE INSERT OR UPDATE` → solo toca `NEW`: `confirmed_at` (primera vez que pasa a
    `scheduled`), `outcome_at` y `completed_at` (al pasar a un estado final), `reschedule_count`
    (si cambia `scheduled_at` en un UPDATE).
  - `AFTER INSERT OR UPDATE OF status, scheduled_at, advisor_id` → `SECURITY DEFINER`,
    `SET search_path = public`, inserta el/los eventos con `actor_id = NEW.changed_by` y
    `reason = NEW.outcome_reason`. Así **cualquier** escritor (pantalla, agente IA, link del
    recorrido) deja historial sin código extra.
- **RLS:**
  - `property_visits` SELECT: `is_operations_user() OR advisor_id = auth.uid() OR created_by = auth.uid()`
    (hoy: cualquiera, incluido el abogado). INSERT/UPDATE/DELETE se mantienen.
  - `property_visit_events` SELECT: operaciones o asesor de la visita. Sin políticas de escritura
    (solo el trigger y el service role).
- **Reparación de datos (con OK del dueño):** mover las 39 consultas de la copia fusionada de
  Entre Ríos 2333 a la ficha viva (`1e116561`). Script con modo informe y `--commit`.

**Entrega 3 — migración `20261010000002_encuesta_de_visita.sql` (aditiva):**

- `visit_questionnaire_tokens` agrega: `UNIQUE (visit_id)` (un link por visita; reenviar reusa
  el mismo), `opened_at`, `open_count INT DEFAULT 0`, `last_step TEXT`, `wa_message_id TEXT`,
  `send_status TEXT` CHECK (`sin_enviar`,`enviada`,`fallida`,`omitida`), `send_error TEXT`,
  `sent_at`. `expires_at` pasa a 30 días para los nuevos. `sent_to` admite NULL (link copiado a
  mano sin envío).
- `visit_questionnaires` agrega: `most_liked_tags TEXT[]`, `least_liked_tags TEXT[]`,
  `price_opinion TEXT` CHECK (`correcto`,`alto`,`bajo`), `offer_currency TEXT`,
  `offer_declined BOOLEAN`, `contact_phone`, `contact_email`, `wants_similar BOOLEAN`,
  `gift_key TEXT`, `started_at`, `completed_at`, `updated_at`. Índice único parcial
  `(visit_id) WHERE response_source = 'client'` (una respuesta del cliente por visita; el guardado
  progresivo hace upsert sobre esa fila). `in_price` y `liked` se siguen escribiendo
  (compatibilidad).
- RLS: se **borra** `vq_insert_authenticated` (cualquiera podía insertar respuestas); SELECT pasa
  a operaciones + asesor de la visita; escrituras solo por service role desde las rutas.
- `visit_survey_settings` (una sola fila): `envio_automatico BOOLEAN NOT NULL DEFAULT false`,
  `telefonos_prueba TEXT[] NOT NULL DEFAULT '{}'`, `regalo JSONB` (título, bajada, portada,
  archivo), `updated_at`, `updated_by`. RLS: lectura operaciones; escritura admin/dueño.
- `whatsapp_messages.origen`: el CHECK suma `'encuesta_visita'` (y se revisan todos sus lectores:
  filtro del Inbox, etiquetas).

### 4.2 La persona = registro de comprador (`property_leads`)

Toda visita nueva tiene `lead_id`. Función única `asegurarCompradorDeVisita` (`lib/visitas/`):
busca en `property_leads` de ESA propiedad por `phone_norm` (y si no hay teléfono, por email en
minúsculas); si no existe lo crea con `source` según el origen (`portal:<portal>`, `landing`,
`cartel`, `manual`) y `pipeline_state='nuevo'`. Nunca pisa el nombre de un registro existente;
solo completa huecos. Después avanza el estado con `advancePipelineState(lead, 'visit_scheduled')`
(ya existe, nunca retrocede). Crear un `property_lead` directo **no dispara nada** (verificado:
solo tiene el trigger de `updated_at`); los envíos del recorrido viven en `POST /api/leads`, que
este flujo no usa. `responder-consulta.ts` (`asegurarLead`, hoy con igualdad exacta de teléfono)
pasa a usar la misma función.

### 4.3 Origen: catálogo único y derivación automática

Catálogo en `lib/visitas/origen.ts` (módulo puro) con etiqueta y ayuda de cada valor; es el mismo
que el CHECK de la base (se tocan juntos, con test que los compara). Las visitas que crean solas
el agente de WhatsApp y el link del recorrido (`upsertPendingVisit`) **también** guardan origen y
`lead_id`, derivados del registro del comprador:
`portal:*` → `portal` · `landing` con UTM de Meta pago (`utm_source` meta/facebook/instagram/fb/ig
y `utm_medium` pago) → `publicidad_meta` · `landing` con `gclid` o `utm_medium` cpc/paid →
`publicidad_paga` · reel de Instagram u orgánico → `otro` (detalle "Reel de Instagram" /
"Landing") · `cartel` → `cartel`.

### 4.4 APIs (rutas finas: auth/rol → Zod → módulo → persistencia)

| Ruta | Qué hace | Permiso |
|---|---|---|
| `POST /api/visits` (se reescribe) | Alta desde la ventana. Body: propiedad, origen, persona (`{tipo:'consulta', id}` · `{tipo:'registro', id}` · `{tipo:'nueva', nombre, telefono, email?}`), `fecha` `AAAA-MM-DD` + `hora` `HH:MM` (Argentina), asesor, confirmada, notas, `forzarDuplicado`. 409 si la persona ya tiene visita activa sin `forzarDuplicado`. | `pipeline.schedule`; asesor forzado a sí mismo |
| `GET /api/visits` | Lista con filtros (desde, hasta, asesor, propiedad, estado, origen), alcance por rol, paginada. | logueado, no abogado |
| `GET /api/visits/resumen` | Tarjetas, agenda, "requieren acción", estadísticas y opiniones del período (cálculo en `lib/visitas/metricas.ts`). | ídem |
| `GET /api/visits/[id]` | Ficha + historial + encuesta. | dueño de la visita u operaciones |
| `POST /api/visits/[id]/estado` | `confirmar` · `reprogramar` · `cancelar` · `resultado` (realizada/no realizada) · `cambiar_asesor` · `reabrir`. Transiciones validadas en `lib/visitas/transiciones.ts`. Al marcar realizada → crea/obtiene link de encuesta y (si corresponde) envía. | ídem; cambiar asesor: `pipeline.view_all` |
| `POST /api/visits/[id]/encuesta` | Reenviar por WhatsApp. `GET`: estado + link para copiar. | ídem |
| `GET /api/properties/[id]/interesados?origen=` | Personas para el paso 3: consultas de portal o registros de landing de esa propiedad, con "ya tiene visita". | asesor: solo sus propiedades; operaciones: todas |
| `GET /api/visits/agenda-del-asesor?asesor&fecha` | Visitas del asesor y de la propiedad ese día (avisos de choque). | logueado, no abogado |
| `GET/PATCH/POST /api/public/encuesta/[token]` | Página pública: lee datos prellenados; guarda pregunta a pregunta; finaliza. | público (token) |

Se borran o reemplazan: `ScheduleVisitDialog`, `CompleteVisitDialog`, `/api/visits/[id]/complete`,
`/api/visits/[id]/send-questionnaire`, `questionnaire-invite-client` (email), `/questionnaire/[token]`
(0 links emitidos, sin consumidores externos). Antes de borrar cada uno: grep de consumidores.

### 4.5 Métricas — definiciones exactas (`lib/visitas/metricas.ts`, puro y testeado)

- **Período:** visitas cuya `scheduled_at` cae en el período, en días de Argentina (`-03:00`).
- **Agendadas:** todas las del período (cualquier estado).
- **Confirmadas:** las que alguna vez tuvieron `confirmed_at`.
- **Se realizaron %:** realizadas ÷ (realizadas + no realizadas + canceladas) entre las que ya
  pasaron y **tienen resultado**. Las pasadas sin resultado se muestran aparte ("sin marcar") y no
  entran en la base.
- **No se hicieron:** no realizadas + canceladas, con desglose por motivo.
- **Encuestas respondidas %:** encuestas completas ÷ visitas realizadas del período.
- **Tiempos (medianas):** anticipación (`scheduled_at − created_at`), confirmación
  (`confirmed_at − created_at`, solo las que nacieron a confirmar), marcar resultado
  (`outcome_at − scheduled_at`), de la consulta a la visita (`created_at` de la visita −
  `received_at` de la consulta para portal; − `created_at` del registro para el resto),
  respuesta de la encuesta (`completed_at − sent_at`).
- **Por origen / asesor / propiedad:** cantidad, % realizado, % encuesta.
- **Opiniones:** respuestas completas; "les gustó"; distribución de precio; oferta mediana y
  diferencia contra `asking_price` **solo si la moneda coincide**; etiquetas más elegidas.
- Toda cifra viaja con su base (`n`); base < 20 ⇒ "orientativo"; sin base ⇒ "Sin datos".

### 4.6 Zona horaria

Una sola función para construir (`fecha + hora + -03:00`) y una para mostrar
(`timeZone: 'America/Argentina/Buenos_Aires'`) en `lib/visitas/horario.ts`. Se corrigen los
emails `visit-scheduled-client` y `visit-reminder-advisor` y las pantallas que formatean sin zona.

### 4.7 Recordatorio "¿se realizó?" al asesor (Entrega 2)

La ruta `/api/cron/visit-reminders` pasa a leer con service role, acepta POST, auth doble
(`CRON_SECRET` o `cron_config`), y se programa con `pg_cron` cada hora (migración con
marcadores `__SECRETO__`/`__SITIO__` aplicada por script **después** del deploy, con `?ping=1`).
Idempotencia por `reminder_sent_at` (ya existe). Se apaga la scheduled function de Netlify
(sin `config.schedule`) para que no haya doble envío si algún día se reactiva.

### 4.8 Opciones de la encuesta adaptadas a la propiedad

`opcionesDeLaEncuesta(propiedad)` (puro, testeado, sin IA): "más gustó" siempre incluye
Ubicación, Luz, Distribución, Estado, Tamaño; suma Balcón/Terraza, Cochera, Amenities, Patio/Jardín,
Vista según `amenities`, `garages`, `floor`, `property_type` y los datos de difusión; "menos gustó"
siempre incluye Precio, Tamaño, Estado, Ruido, Nada en especial; suma Expensas si `expensas > 0`.
Ambas terminan en "Otra cosa" (texto ≤ 280 caracteres). Máximo 8 opciones.

### 4.9 Componente estilo Typeform — componente propio, con `openform` como referencia

**Investigación (2026-10-10, datos verificados en npm/GitHub):** ninguna librería sirve como
dependencia.

| Candidato | Por qué no |
|---|---|
| Typeform (`@typeform/embed-react`) | Los datos quedan en Typeform, es pago por volumen (plan gratis ~100 respuestas/mes) y carga su app entera en un iframe. |
| Quill Forms (única librería React "tipo Typeform") | No anda con React 19 (issue #195 abierto desde 2024-12), sin versión nueva hace 15 meses, arrastra emotion 10 + lodash + paquetes de WordPress, licencia inconsistente (LGPL/GPL). |
| Formbricks, HeyForm, OpnForm, Typebot | Plataformas completas con su propia base (Mongo/Postgres+Redis/Laravel): otro servidor que mantener y los datos fuera de nuestra Supabase. AGPL/FSL. |
| SurveyJS | 379 kB: imposible Lighthouse ≥ 90 en celular. |
| Formity (3 kB, MIT) | Solo lógica de pasos con ramas; para 5 preguntas lineales no hace falta. Queda como opción si mañana hay ramas. |

**Decisión:** componente propio, **sin dependencias nuevas** (React + `radix-ui` y Tailwind que
ya están; `zod` en el servidor; nada de framer-motion). **Referencia de código:**
[`dabit3/openform`](https://github.com/dabit3/openform) (MIT, Next 16 + React 19 + Supabase +
shadcn + Tailwind 4, activo al 2026-10-02), clonado en `/Users/apple/referencias/openform`.
Se copian PATRONES de `components/form-player/form-player.tsx` (teclado, auto-avance con 350 ms,
barra de progreso accesible, pista "Enter ↵" solo en escritorio) y se reemplaza su animación con
framer-motion por CSS. No se copia código de Quill/Formbricks/HeyForm/OpnForm (licencias GPL/AGPL).

**Patrones Typeform que se replican** (fuente: centro de ayuda de Typeform):
1. Una pregunta por pantalla; el paso final de contacto es una página con varios campos.
2. Auto-avance ~350 ms en opción única (¿Te gustó?, Precio); varias opciones piden "OK ✓".
3. Teclado en computadora: letras A/B/C sobre las opciones, Enter avanza, ↑↓ navegan; las letras
   y la pista "presioná Enter ↵" se muestran solo con `@media (hover:hover)`.
4. Barra fina de avance con `role="progressbar"`, sin "x de y" visible (decisión del dueño);
   el título del documento sí dice "Paso N" para lectores de pantalla.
5. Bienvenida y cierre propios; botón de bienvenida "Quiero mi regalo".
6. "Recall": el nombre y la dirección aparecen en los textos ("Mariana, ¿te gustó Doblas 248?").
7. Prellenado: como en los *hidden fields* de Typeform pero **sin datos personales en la URL**:
   un código opaco que el servidor resuelve (patrón de `app/v/[token]`).
8. Guardado a medida que avanza (en nuestra API).
9. Celular: inputs ≥ 16 px (evita el zoom de iOS), `inputmode="numeric"` y `enterkeyhint` en el
   monto, alto con `dvh`, botón fijo abajo respetando `env(safe-area-inset-bottom)`, sin enfocar
   automáticamente al cargar (iOS solo abre el teclado dentro de un toque).

**Reglas de la página pública:** la primera pantalla (bienvenida) se arma en el servidor con los
datos ya puestos y se pinta sin animación; las transiciones son solo al cambiar de paso (keyframes
CSS dentro de `prefers-reduced-motion: no-preference`); nunca contenido con `opacity:0` esperando
al JavaScript; al cambiar de paso el foco va al título (`tabindex=-1`) y los errores se anuncian
con `aria-live`; contraste AA (4,5:1); datos solo en nuestra base.

### 4.10 Encuesta: link, guardado y seguridad

- Código del link: 16 bytes aleatorios en base64url (22 caracteres). Un link por visita.
  Vence a los 30 días; vencido ⇒ página amable "Este link venció".
- La página pública muestra **solo** nombre de pila, dirección/barrio, primera foto, precio y el
  teléfono **enmascarado**; nunca datos de otros visitantes ni del propietario.
- Guardado progresivo: `PATCH` por paso con validación Zod estricta por pregunta; `POST` final
  con reserva atómica (`completed_at IS NULL`) ⇒ un doble toque no duplica ni re-notifica.
  Honeypot y límite por token. El texto libre se guarda como texto (nunca HTML).
- Al completar: email al asesor de la visita + coordinadores + admins/dueños
  (`notifyVisitSurveyAnswered`, `idempotent:false` con clave por visita), y queda visible en la
  ficha de la visita, la pestaña de la propiedad y las estadísticas.
- El regalo: si `visit_survey_settings.regalo` está cargado, la pantalla de gracias muestra la
  descarga. **La entrega del regalo por WhatsApp es parte de la infraestructura del lead magnet
  que se arma con Diego (queda afuera)**; el lugar en el código queda preparado.

### 4.11 WhatsApp

- Plantilla propuesta `encuesta_visita_v1`, categoría **UTILITY**, `es_AR`, sin la palabra
  regalo ni vocabulario de venta:
  - Cuerpo: «Hola {{1}}. Registramos tu visita a {{2}} del {{3}}. Para completar la ficha de la
    visita, entrá acá: https://inmodf.com.ar/encuesta/{{4}}» (el link va también en el cuerpo
    porque en WhatsApp de computadora los botones no abren).
  - Botón URL «Completar ficha» → `https://inmodf.com.ar/encuesta/{{1}}`.
- Script `scripts/create-whatsapp-template-encuesta-visita.ts` (estado / `--create`), sincronizar
  cuerpos aprobados, env `WHATSAPP_TEMPLATE_ENCUESTA_VISITA` en Netlify.
- Decisión de envío pura (`decidirEnvioEncuesta`, testeada): envío prendido **o** teléfono en la
  lista de prueba; teléfono usable (`isWhatsappUsable`); no enviada antes (salvo reenvío
  explícito); fail-closed si no se pueden leer los ajustes.
- Se registra en `whatsapp_messages` con `origen='encuesta_visita'`, `lead_id`, `property_id`.
  Respeta `WHATSAPP_TEST_MODE`. Un rechazo de Meta queda en `send_status='fallida'` +
  `send_error` legible **y se ve en la ficha** (lección del incidente del 2026-09-17).

---

## 5. Qué queda afuera

- El regalo (lead magnet) y su entrega por WhatsApp — se arma con Diego. Acá queda el lugar.
- Pantalla de configuración del interruptor y del regalo (por ahora se cargan por SQL/script).
- Recordatorio previo a la visita para la persona (WhatsApp "te esperamos mañana").
- Calendario sincronizado con Google Calendar.
- Reporte al propietario con las opiniones (los datos quedan listos para armarlo).
- Tabla única de personas (camino B descartado).
- Cambios a la visita de **tasación** (`deals.stage`, `visit_data`): es otro concepto y no se toca.

---

## 6. Criterios de aceptación

**Entrega 1 — Agendar y gestionar**
1. Con rol asesor, coordinador, admin y dueño aparece "＋ Nuevo" arriba a la derecha en cualquier
   pantalla, con "Agendar visita" (y "Nueva tasación" para asesor/admin/dueño). Con abogado no aparece.
2. En la ficha de una propiedad captada disponible aparece "Agendar visita"; en una vendida no.
3. Origen "Consulta de portal" en Doblas 248 lista a todos los que consultaron por ella, más
   recientes primero; en Entre Ríos 2333 aparecen también las 39 consultas reparadas.
4. Agendar con una persona de la lista crea la visita con `origin='portal'`, `portal_inquiry_id`,
   `lead_id` (registro de comprador creado o reutilizado por teléfono, sin duplicar) y la persona
   queda en "Visita agendada".
5. Origen "Cartel" pide nombre y teléfono; sin teléfono no deja avanzar.
6. Elegir una persona que ya tiene visita activa avisa y exige confirmar.
7. La hora guardada es la elegida en hora argentina (10:30 en pantalla = 13:30 UTC en la base) y
   el email de confirmación muestra 10:30.
8. Un asesor no puede agendar a nombre de otro (ni desde la pantalla ni llamando a la ruta).
9. En la ficha de la visita: Confirmar, Reprogramar, Cancelar (motivo obligatorio), Se realizó
   (interés), No se realizó (motivo obligatorio). Cada acción aparece en la línea de tiempo con
   fecha, hora y autor, y queda en `property_visit_events`.
10. Una visita creada por el agente o por el link del recorrido queda con origen y `lead_id`, y
    también deja su evento "creada".
11. Un abogado no puede leer visitas (ni pantalla ni base).

**Entrega 2 — Sección Visitas y ficha**
12. `/visits` muestra tarjetas, agenda, "requieren tu acción" y estadísticas del período, con la
    base de cada cifra; un período sin visitas dice "Sin datos".
13. Las cifras coinciden con un conteo manual en la base para el mismo período (verificado con
    `select`).
14. Marcar "Se realizó" desde "Requieren tu acción" la saca de esa lista y suma a "Se realizaron".
15. El asesor ve solo sus visitas y sus números.
16. La pestaña Visitas de la ficha muestra las visitas de esa propiedad y "Qué opinan".
17. El recordatorio "¿se realizó?" llega al asesor una sola vez por visita pasada sin resultado
    (verificado en `cron.job_run_details` → `net._http_response` → `email_report_log`/log de emails).

**Entrega 3 — Encuesta**
18. Al marcar "Se realizó" se crea el link; con el envío apagado la ficha dice "Sin enviar (envío
    apagado)" y "Copiar link" funciona.
19. Con un teléfono de la lista de prueba, la plantilla llega a ese WhatsApp con el link correcto
    (verificado en el teléfono y en `whatsapp_messages`).
20. La encuesta abre en el celular con nombre, foto y dirección de ESA propiedad, opciones
    adaptadas, sin decir cuántas preguntas son, y dice "menos de un minuto".
21. Abandonar en la pregunta 3 deja guardadas las respuestas 1 y 2; reabrir el link retoma ahí.
22. Terminar la encuesta guarda todo, notifica por email al asesor y aparece en la ficha de la
    visita, la pestaña de la propiedad y las estadísticas. Un doble toque no duplica nada.
23. Un link vencido o inventado muestra una página amable y no revela datos.
24. Lighthouse en celular sobre la encuesta: rendimiento ≥ 90, accesibilidad ≥ 95.
25. **Nada superpuesto:** en cada pantalla de la encuesta, a 360, 390 y 430 px de ancho (y con
    el teclado abierto en el monto y el contacto), ningún texto, tarjeta o botón queda encima de
    otro ni cortado. Se verifica con capturas reales de la vista previa, una por pantalla y ancho,
    y con un chequeo automático que compara los rectángulos de los elementos visibles.

---

## 7. Pre-flight de choques

| # | Riesgo | Sev. | Mitigación |
|---|---|---|---|
| 1 | **Migración antes del deploy:** el código nuevo escribe columnas nuevas; sin ellas, agendar falla en producción. | 🔴 | Gate: migración aplicada por script `pg` y verificada con `select` ANTES del merge de cada entrega. |
| 2 | **Productor/consumidor de estados:** 16 archivos leen los estados de visita (inicio, tareas, agente, recordatorio, admin IA, tests). | 🟡 | No se cambian los 5 valores; grep de consumidores en el plan; tests del agente y de `visit-scheduling` corren en cada entrega. |
| 3 | **Endurecer RLS de lectura** puede vaciar pantallas que hoy leen con la sesión (inicio "visitas de hoy", pendientes, admin IA). | 🟡 | Probar cada lector con rol asesor y coordinador en la vista previa; el agente y el link usan service role (no les afecta). |
| 4 | **Trigger que escribe otra tabla** (historial). | 🟡 | AFTER + SECURITY DEFINER; INSERT real desde la app en la vista previa antes de dar por buena la migración (regla de CLAUDE.md). |
| 5 | **Mensajes a clientes reales.** | 🔴 | Envío apagado por defecto (fail-closed), lista de prueba, `WHATSAPP_TEST_MODE`; el QA solo con números de prueba. |
| 6 | **Meta reclasifica la plantilla a MARKETING** (pasó dos veces). | 🟡 | Texto neutro de "ficha de visita"; el script muestra la categoría final; si cae en MARKETING no se activa y se rediseña. |
| 7 | **Página pública con datos personales.** | 🟡 | Token de 128 bits, teléfono enmascarado, nada de terceros, `noindex`, revisión de seguridad aparte. |
| 8 | **CHECK de `whatsapp_messages.origen`**: un valor nuevo sin migración hace fallar el registro en silencio. | 🟡 | Migración de la Entrega 3 + revisión de lectores del Inbox. |
| 9 | **pg_cron del recordatorio:** apunta a una ruta que no existe hasta el deploy. | 🟡 | Se programa DESPUÉS del deploy con `?ping=1`; verificación en 3 capas. |
| 10 | **Frontera servidor→cliente:** el botón "＋ Nuevo" vive en la barra (cliente). | 🟢 | Recibe el rol como texto (patrón de `NavForRole`); ningún ícono cruza como prop. |
| 11 | **Límite de tiempo de Netlify:** el envío de WhatsApp al marcar realizada. | 🟢 | Una sola llamada a Meta (timeout 8 s), sin IA; el estado se guarda antes de enviar y un fallo no revierte la visita. |
| 12 | **Datos reales en QA** (misma base que producción). | 🟡 | Propiedad y personas `[TEST`, teléfonos de prueba, borrado al final. |
| 13 | **Reparación de datos** de Entre Ríos 2333. | 🟡 | Script con informe y `--commit`; requiere OK explícito del dueño. |
| 14 | **Turbopack local** roto por la tilde. | 🟢 | Verificación con tsc/vitest acotados y QA en la vista previa de Netlify. |

---

## 8. Calidad: pruebas, auditoría y rendimiento

**Pruebas (TDD, escritas antes del código):** módulos puros en `lib/visitas/` — catálogo de
origen ↔ CHECK, derivación de origen desde el registro, transiciones de estado y motivos,
deduplicación de personas por teléfono, horario (construir/mostrar, fechas pasadas/futuras,
límites de 60 días), métricas (cada definición de 4.5, bases chicas, sin datos, monedas
distintas), opciones de encuesta por propiedad, decisión de envío, validación de cada paso de la
encuesta. Componentes: ventana de agendar (pasos, errores, rol asesor sin selector), encuesta
(avance, atrás, retomar, teclado). Rutas: permisos por rol (abogado 403, asesor a nombre de otro
403), 409 de duplicado, idempotencia del final de encuesta. Casos borde obligatorios: vacío, nulo,
duplicado, tildes NFD, caracteres especiales, fecha pasada/futura, rol sin permiso, red que falla.

**Auditoría:** cada tarea pasa por un revisor de cumplimiento del spec y uno de calidad de código
(agentes separados del que implementa); cada migración la revisa un agente de base de datos con
las buenas prácticas de Postgres antes de aplicarse; la encuesta pública, el token y el envío de
WhatsApp pasan por revisión de seguridad; al cierre de cada entrega, revisión adversarial de todo
el diff. Cada hallazgo se verifica antes de aplicarlo.

**Rendimiento (presupuestos medidos, no supuestos):**
- `metricas.ts` con 20.000 visitas sintéticas: < 150 ms.
- Rutas `GET /api/visits/resumen`, `/api/visits` e `/interesados` en la vista previa, 30 llamadas
  en caliente: p95 < 1,5 s.
- Consultas principales con `EXPLAIN ANALYZE`: usan los índices nuevos.
- Encuesta pública en Lighthouse celular: rendimiento ≥ 90, LCP < 2,5 s, CLS < 0,1.
- Concurrencia: 20 envíos simultáneos del final de la encuesta con el mismo link ⇒ 1 respuesta,
  1 email.

---

## 9. Entregas y orden de despliegue

1. **Entrega 1 — Agendar y gestionar** (migración 1 + reparación con OK + botón "＋ Nuevo" +
   ventana + ficha de visita con etapas + origen/lead en agente y recorrido + RLS). PR propio,
   QA en vista previa, deploy.
2. **Entrega 2 — Sección Visitas, estadísticas, pestaña de la ficha y recordatorio** (pg_cron
   después del deploy). PR propio.
3. **Entrega 3 — Encuesta estilo Typeform + envío por WhatsApp apagado** (migración 2 +
   plantilla a revisión de Meta con OK del dueño + env var). PR propio.

---

## 10. Aprobación del dueño — 2026-10-10 (todo aprobado)

- [x] El diseño completo de arriba.
- [x] Mover las 39 consultas de Entre Ríos 2333 a la ficha viva ("Hazlo").
- [x] Mandar la plantilla `encuesta_visita_v1` a revisión de Meta (Entrega 3).
- [x] Mantener "El propietario no ve tu nombre" (al propietario solo se le muestran resultados
      agrupados) y la casilla "Avisame si entra una propiedad parecida".
- Pedido adicional: **nada superpuesto en la encuesta** (criterio 25). En la maqueta se sacaron
  la etiqueta y la tarjeta del regalo que iban montadas sobre la foto.

---

## 11. Adenda — Entrega 3 con el regalo por propiedad (2026-10-15)

> **Esta sección MANDA** sobre lo que se le oponga en §3.6, §3.7, §4.1 (bloque "Entrega 3"),
> §4.4 (fila de la ruta pública), §4.9 (punto 9), §4.10, §4.11, §5, §6 y §7. El texto original se
> deja como estaba para que se entienda de dónde se partió. Plan:
> `docs/superpowers/plans/2026-10-15-sistema-de-visitas-entrega-3.md`.

### 11.1 Decisiones del dueño (2026-10-15)

1. **El regalo es POR PROPIEDAD**: "lo que queda para el final es solamente el archivo que le
   entregamos a la persona… asociado a cada propiedad". Reemplaza a `visit_survey_settings.regalo`
   (global) de §4.1.
2. **La encuesta se crea siempre** al marcar "Se realizó" (un link por visita, vence a los 30 días)
   y "Copiar link" funciona siempre. Bienvenida con regalo si la propiedad lo tiene; neutra si no.
3. **Envío automático por WhatsApp** (`encuesta_visita_v1`, UTILITY, cuerpo de §4.11) solo si
   (a) el interruptor general está prendido **y** (b) la propiedad tiene regalo — salvo que el
   ajuste "solo propiedades con regalo" (prendido de fábrica) esté apagado — **o** el teléfono está
   en la lista de prueba. Fail-closed. Plantilla y botón se deciden juntos (lección del
   2026-09-17). El estado (y el error de Meta en castellano) se ve en la ficha de la visita.
4. **Entrega del regalo**, tres caminos: (a) descarga inmediata en la pantalla de gracias; (b) email
   con el link de descarga si dejó email; (c) WhatsApp con el PDF adjunto mediante una SEGUNDA
   plantilla UTILITY `regalo_visita_v1` (encabezado de documento, texto neutro «Hola {{1}}. Acá
   tenés el material de {{2}} que pediste.»), con su propio interruptor **apagado** hasta que Meta
   la apruebe. La encuesta promete "te lo mandamos por WhatsApp" solo cuando ese envío va a ocurrir
   de verdad para ESA persona.
5. **Pantalla de configuración** en `/settings/encuesta` (solo admin y dueño): interruptor de envío,
   "solo propiedades con regalo", interruptor del regalo por WhatsApp, teléfonos de prueba y estado
   de las dos plantillas. Todo por API con permisos; nada de SQL a mano. Reemplaza lo de §3.7 "por
   SQL en esta entrega".
6. Las métricas que la Entrega 2 dejó en "Sin datos — llega con la encuesta" se conectan.
7. Al completar: email al asesor + coordinadores + admins/dueños, y la respuesta en la ficha.
8. Las rutas y tablas viejas del cuestionario (0 filas, nunca funcionaron) se reemplazan.
9. Plantillas: se crean con un script (estado / `--create`) en la tarea de despliegue. El OK de
   `encuesta_visita_v1` ya está dado (§10); el de `regalo_visita_v1` se pide al dueño en ese momento.

### 11.2 El regalo de la propiedad

- **Dónde:** pestaña **Visitas** de la ficha de propiedad (la ve quien ve esa pestaña: nunca el
  abogado), tarjeta "Regalo de la encuesta" ARRIBA de las visitas.
- **Qué se carga:** un PDF (hasta 20 MB), un título (3 a 120 caracteres) y una portada opcional
  (JPG/PNG/WEBP hasta 5 MB). Sin portada, la encuesta muestra la primera foto de la propiedad.
- **Quién:** quien puede gestionar el material de la propiedad (`puedeGestionarMedia`: operaciones,
  el asesor asignado o el que la captó). Se puede reemplazar y quitar.
- **Subida:** URL firmada directa a Storage (init → PUT del navegador → confirmar), igual que fotos
  y planos: el archivo nunca pasa por el servidor de Next. Bucket **privado** `visit-survey-gifts`
  (20 MB, solo `application/pdf`, `image/jpeg`, `image/png`, `image/webp`). El servidor confirma que
  el path es de ESA propiedad (regex exacta, no un `startsWith` sobre texto del cliente) y que el
  objeto existe antes de guardarlo.
- **Descarga:** nunca una URL pública. El servidor genera una URL firmada de 10 minutos solo para
  quien tiene un link de encuesta existente **y ya la completó**. El regalo sigue disponible después
  de los 30 días del link: los 30 días son para RESPONDER; lo ganado no se quita.
- **Tabla nueva** `property_survey_gifts` (una fila por propiedad; ver 11.5).

### 11.3 La encuesta pública (cambios a §3.6 y §4.9)

- Bienvenida: **con regalo** = foto (sin nada montado encima), "Visitaste <dirección>", tarjeta del
  regalo (portada + título), "<Nombre>, este regalo es tuyo." · "Contanos qué te pareció la visita y
  es tuyo al instante. Te lleva menos de un minuto.", botón **Quiero mi regalo**. **Sin regalo** =
  "<Nombre>, ¿qué te pareció <dirección>? Te lleva menos de un minuto.", botón **Empezar**.
- Paso de datos: con regalo, "Confirmá tus datos para recibirlo"; sin regalo, "Último paso:
  confirmá tus datos". Botón final: "Quiero mi regalo" / "Enviar".
- Gracias: con regalo, botón **Descargar <título>** (descarga inmediata) + "También te lo mandamos
  a tu email" (si dejó email) + "y por WhatsApp" (solo si ese envío va a ocurrir). Sin regalo:
  agradecimiento + "Si querés volver a verla o hacer una oferta, respondé el WhatsApp de la visita".
- **§4.9 punto 9 se modifica:** el botón de cada paso va **en el flujo, debajo de la pregunta**
  (como el "OK ✓" de Typeform), no fijo al borde. Un botón fijo queda encima del campo con el
  teclado abierto en iOS, que es justo lo que prohíbe el criterio 25. Se mantienen `dvh`,
  `env(safe-area-inset-bottom)` como relleno inferior, inputs de 16 px y nada de foco automático.
- **"Abierta" la marca el navegador de la persona** (un pedido al montar la página), no el render
  del servidor: el previsualizador de links de WhatsApp pide la página sin ejecutar JavaScript y
  marcaría "Abierta" a todos.
- **El link vale solo si la visita sigue "Realizada".** Si alguien la reabre (se marcó por error),
  la página muestra el mensaje amable de link no disponible; al volver a marcarla "Se realizó" se
  reusa el mismo link.

### 11.4 Envío y ficha de la visita (cambios a §3.7)

- Al marcar **Se realizó** se crea el link SIEMPRE y se decide el envío con
  `decidirEnvioEncuesta` (puro), en este orden: ajustes ilegibles → no; ya respondida → no;
  vencida → no; teléfono no usable → no; teléfono de prueba → sí (saltea interruptor y regalo);
  interruptor apagado → no; "solo con regalo" y la propiedad sin regalo → no; plantilla sin
  configurar o desconocida → no; ya enviada (sin pedir reenvío) → no. Un fallo del envío **nunca**
  revierte la visita.
- Estados visibles: *Sin enviar (<motivo>)* · *Enviada* · *Entregada* · *Leída* · *Abierta* ·
  *Respondida* · *Venció sin respuesta* · *Falló: <motivo de Meta en castellano>*. Entregada/Leída
  salen de `whatsapp_messages.status` (lo mantiene el webhook de estados) por `wa_message_id`; no se
  copian a otra tabla. *Sin enviar (WhatsApp en modo prueba)* cuando `WHATSAPP_TEST_MODE` lo frenó.
- Botones: **Copiar link** (siempre que haya link), **Crear link de la encuesta** (visitas
  realizadas antes de esta entrega), **Reenviar por WhatsApp** (solo si un reenvío pasaría la
  decisión de arriba).
- Línea de tiempo: "Encuesta enviada / abierta / respondida" se arman a partir de la fila de la
  encuesta (no se agregan valores al CHECK de `property_visit_events.kind`).

### 11.5 Modelo de datos (reemplaza el bloque "Entrega 3" de §4.1)

**Migración `20261015000002_encuesta_de_visita.sql`** (el nombre `20261010000002_…` que proponía
§4.1 ya lo usa la Entrega 1). Se aplica por script `pg` con verificación ANTES del merge.

- **Se crean tablas nuevas y se borran las viejas** en vez de ampliar `visit_questionnaires` +
  `visit_questionnaire_tokens`. Justificación: tienen **0 filas** (la migración aborta si encuentra
  alguna); separaban el link de la respuesta (dos filas y un join para algo que es 1 a 1 con la
  visita), tenían `sent_to NOT NULL`, `response_source='advisor'` sin uso y una política de INSERT
  abierta a cualquier usuario logueado. Con UNA fila por visita el guardado progresivo es un UPDATE
  y el final es UN UPDATE condicional (`completed_at IS NULL`): sin upsert ni índice parcial.
- `visit_surveys` (una fila por visita): `visit_id` UNIQUE → `property_visits` ON DELETE CASCADE;
  `token` UNIQUE con CHECK de 22 caracteres base64url; `expires_at`; envío (`send_status` CHECK
  `sin_enviar|enviada|fallida|omitida`, `send_skip_reason` CHECK con el catálogo de motivos,
  `send_error`, `sent_at`, `sent_to`, `wa_message_id`); apertura (`opened_at`, `open_count`);
  `write_count` (límite por token); `last_step`; `completed_at`; respuestas (`liked`,
  `most_liked_tags TEXT[]`, `most_liked_other`, `least_liked_tags TEXT[]`, `least_liked_other`,
  `price_opinion` CHECK, `offer_amount` CHECK > 0, `offer_currency` CHECK `USD|ARS`,
  `offer_declined`, `contact_phone`, `contact_email`, `wants_similar`); avisos
  (`team_notice_status`, `gift_whatsapp_status`, `gift_email_status` con CHECK
  `pendiente|enviando|enviado|fallido|no_corresponde` y su `*_at`, `gift_wa_message_id`,
  `notice_attempts`, `notice_error`, `gift_downloaded_at`); `created_by` → profiles ON DELETE SET
  NULL. Índices: parcial sobre `completed_at` para el barrido de avisos y sobre `wa_message_id`.
  (`started_at` de §4.1 no se crea: nada lo lee; `opened_at` alcanza.)
- `visit_survey_settings` (una fila, `id boolean PK CHECK (id)`): `envio_automatico` (false),
  `solo_con_regalo` (true), `regalo_por_whatsapp` (false), `telefonos_prueba TEXT[]` (máx. 10),
  `updated_at`, `updated_by` → profiles SET NULL.
- `property_survey_gifts` (una fila por propiedad, `property_id` PK → properties ON DELETE
  CASCADE): `title`, `file_path` (CHECK atado al `property_id`), `file_name`, `file_size`
  (≤ 20 MB), `cover_path`, `created_at`, `updated_at`, `updated_by` → profiles SET NULL.
- Bucket privado `visit-survey-gifts` (sin políticas en `storage.objects`: solo el servidor).
- Función `visit_survey_registrar(p_token, p_tipo, p_max)` (SECURITY INVOKER, solo
  `service_role`): suma `write_count` de forma atómica si no llegó al tope y, si `p_tipo='abierta'`,
  marca `opened_at`/`open_count`. Es el límite por token.
- **RLS:** las tres tablas con RLS. Lectura: operaciones, o el asesor de la visita / de la
  propiedad. **Escritura: ninguna política** y se revoca INSERT/UPDATE/DELETE a `anon` y
  `authenticated` (todo lo escribe el servidor con clave de servicio, como `property_visits` desde
  la migración `20261010000003`).
- `whatsapp_messages.origen`: el CHECK suma `'encuesta_visita'` (ningún lector filtra hoy por ese
  campo: verificado con grep; el Inbox muestra la conversación como cualquier otra).

### 11.6 Rutas (completa §4.4)

| Ruta | Qué hace | Permiso |
|---|---|---|
| `POST /api/visits/[id]/estado` (cambia) | Al pasar a realizada, crea el link y decide/manda el envío; devuelve `encuesta`. | igual que hoy |
| `GET /api/visits/[id]` (cambia) | Suma `encuesta` y los eventos de la encuesta a la línea de tiempo. | igual que hoy |
| `GET/POST /api/visits/[id]/encuesta` | Estado; `{accion:'link'}` crea el link; `{accion:'reenviar'}` reenvía. | puede ver la visita; abogado 403 |
| `PATCH /api/public/encuesta/[token]` | `abierta` o una respuesta por paso (Zod estricto por paso). | público (token) |
| `POST /api/public/encuesta/[token]` | Final: contacto + reserva atómica. Devuelve el regalo. | público (token) |
| `POST /api/public/encuesta/[token]/avisos` | Corre los avisos pendientes (equipo, regalo por WhatsApp y por email). | público (token) |
| `GET /api/public/encuesta/[token]/regalo` | 302 a una URL firmada de 10 min (solo encuesta completa). | público (token) |
| `GET/PUT/DELETE /api/properties/[id]/regalo` + `POST …/regalo/subida` | Regalo de la propiedad. | `puedeGestionarMedia`; abogado 403 |
| `GET/PATCH /api/settings/encuesta-visitas` | Ajustes de la encuesta. | `settings.manage` (admin, dueño) |

No hay `GET /api/public/encuesta/[token]`: la página es un componente de servidor que lee los datos
directo (la primera pantalla sale armada del servidor, §4.9). Se borran: `app/questionnaire/**`,
`app/api/public/questionnaire/**`, `app/api/visits/[id]/questionnaire`,
`app/api/visits/[id]/send-questionnaire`, `lib/email/notifications/questionnaire-invite-client.ts`,
`emails/QuestionnaireInviteClientEmail.tsx`. Middleware: `/encuesta/` pasa a ser página pública y
`/questionnaire` deja de serlo.

### 11.7 Guardado, final y avisos (cambios a §4.10)

- Guardado progresivo: `PATCH` por paso; el navegador ESPERA la respuesta antes de avanzar (si
  falla, se queda en el paso con "No pudimos guardar tu respuesta" y el botón para reintentar). Las
  etiquetas se validan contra las opciones de ESA propiedad en el servidor.
- Final: valida que no falte ninguna respuesta (si falta, 409 con el paso), honeypot `empresa`
  (lleno ⇒ respuesta de éxito sin escribir nada) y reserva atómica. Un doble toque devuelve el mismo
  éxito sin duplicar. Límite: 200 escrituras por link (429 después).
- **Avisos en dos tiempos** (la persona no espera a nadie): el final responde enseguida y la pantalla
  de gracias pide `…/avisos` (con `keepalive`). Cada canal se reserva de forma atómica
  (`pendiente → enviando`), se manda y se cierra. Si la persona cierra la página antes, el barrido
  que se suma al cron que ya corre cada hora (`/api/cron/visit-reminders`) toma los pendientes.
  Presupuesto de Netlify (~26 s): un canal empieza solo si pasaron menos de 5 s (equipo), 12 s
  (WhatsApp) o 16 s (email) desde el inicio del pedido, y el email al equipo usa techo de 3 s por
  destinatario. Un email vencido no se reintenta (Resend pudo haberlo mandado: se prefiere perder a
  duplicar); otro fallo vuelve a `pendiente` hasta 3 intentos. Un WhatsApp que falla queda `fallido`
  con el motivo (los rechazos de Meta no se arreglan reintentando).
- El texto libre se guarda como texto (NFC, sin caracteres de control, máx. 280) y se muestra
  siempre como texto.
- Los datos de contacto de la encuesta **no** se copian al registro del comprador
  (`property_leads`) ni disparan alertas de "propiedad parecida": quedan en la encuesta (ver 11.9).

### 11.8 WhatsApp (cambios a §4.11)

- Dos plantillas con el cuerpo en UN solo lugar (`lib/visitas/encuesta/plantillas.ts`), que usan el
  envío y el script de creación: `encuesta_visita_v1` (4 datos + botón URL «Completar ficha» →
  `https://inmodf.com.ar/encuesta/{{1}}`; el link también va en el cuerpo) y `regalo_visita_v1`
  (encabezado DOCUMENTO + 2 datos, sin botón).
- Catálogo `PLANTILLAS_ENCUESTA` / `PLANTILLAS_REGALO`: una plantilla configurada que no está en el
  catálogo **no se manda** (motivo "plantilla desconocida"): sus datos y su botón no se pueden
  adivinar, y Meta rechaza el mensaje entero (incidente 2026-09-17).
- Variables nuevas (las carga el dueño en Netlify): `WHATSAPP_TEMPLATE_ENCUESTA_VISITA`
  (= `encuesta_visita_v1`) y `WHATSAPP_TEMPLATE_REGALO_VISITA` (= `regalo_visita_v1`). Sin ellas no
  se manda nada (fail-closed).
- **Lista de prueba PROPIA** (`visit_survey_settings.telefonos_prueba`), no
  `ai_agent_settings.consulta_test_phones`: aquella significa "mientras tenga algo, SOLO esos
  reciben" (es el freno de la respuesta a consultas, que espera la aprobación de Diego); la nuestra
  significa "estos reciben aunque el envío esté apagado". Compartirla haría que vaciar una para
  activar la otra cambie en silencio el comportamiento de las dos.
- El regalo por WhatsApp sale al teléfono que la persona confirmó en la encuesta, con el PDF por una
  URL firmada de 1 h (Meta lo descarga) y el nombre del archivo. También lo recibe un teléfono de la
  lista de prueba con el interruptor apagado (para poder probarlo sin prenderlo para todos).
- Todo se registra en `whatsapp_messages` con `origen='encuesta_visita'`, `lead_id` y
  `property_id`, y respeta `WHATSAPP_TEST_MODE`.

### 11.9 Qué queda afuera (reemplaza las dos primeras líneas de §5)

- Copiar el email/teléfono de la encuesta al registro del comprador, y la alerta de "entró una
  propiedad parecida" (la casilla se guarda; usarla es otro desarrollo).
- Recordatorio automático a quien no respondió (aparece en "Requieren tu acción" y se reenvía a mano).
- Borrar de Storage los archivos de un regalo cuando se borra la propiedad (quedan huérfanos; costo
  despreciable).
- El reporte al propietario con las opiniones (sigue afuera).

### 11.10 Criterios de aceptación de la Entrega 3 (reemplazan 18–25 y suman 26–31)

18. Al marcar "Se realizó" se crea el link; con el envío apagado la ficha dice "Sin enviar (envío
    apagado)" y "Copiar link" copia `https://inmodf.com.ar/encuesta/<22 caracteres>`.
19. Con un teléfono de la lista de prueba (y el envío apagado), la plantilla llega a ese WhatsApp con
    el link correcto (en el teléfono y en `whatsapp_messages` con `origen='encuesta_visita'`).
20. La encuesta abre en el celular con nombre, foto y dirección de ESA propiedad, opciones adaptadas,
    sin decir cuántas preguntas son, y dice "menos de un minuto"; con regalo muestra su portada y
    título, sin regalo la bienvenida es neutra.
21. Abandonar en la pregunta 3 deja guardadas las 1 y 2; reabrir el link retoma en la 3.
22. Terminar guarda todo, notifica por email al asesor + coordinadores + admins/dueños y aparece en la
    ficha de la visita, la pestaña de la propiedad y las estadísticas. Un doble toque no duplica
    nada (y 20 envíos simultáneos dan 1 respuesta y 1 email).
23. Un link vencido, inventado o de una visita reabierta muestra una página amable y no revela datos.
24. Lighthouse en celular sobre la encuesta: rendimiento ≥ 90, accesibilidad ≥ 95.
25. Nada superpuesto en ninguna pantalla de la encuesta a 360, 390 y 430 px, también con el teclado
    abierto en el monto y en el contacto (capturas reales + chequeo automático de rectángulos).
26. En la pestaña Visitas de la ficha, un admin y el asesor de la propiedad suben un PDF de regalo con
    título (y portada opcional), lo reemplazan y lo quitan; el abogado no ve la pestaña y la ruta le
    responde 403.
27. En una propiedad con regalo, la pantalla de gracias descarga el PDF al instante; pedir la
    descarga sin haber terminado la encuesta no entrega nada.
28. Si la persona dejó email, recibe el email con el link de descarga (verificado en
    `email_notifications_log`, con el modo prueba de email prendido).
29. Con el regalo por WhatsApp prendido y un teléfono de prueba, llega el PDF por WhatsApp
    (`regalo_visita_v1` aprobada); sin aprobar o apagado, la encuesta no promete WhatsApp y no se
    manda nada.
30. `/settings/encuesta` la ven y la cambian solo admin y dueño (coordinador/asesor: 403 en la ruta);
    los cambios persisten y prender el envío pide confirmación en la misma pantalla.
31. Las cifras de la encuesta en `/visits` (tarjeta, embudo de 5 pasos, "Qué opinan", "Encuestas sin
    responder hace más de 48 h") coinciden con un `select` sobre `visit_surveys` del mismo período.

### 11.11 Riesgos nuevos (suman a §7)

| # | Riesgo | Sev. | Mitigación |
|---|---|---|---|
| 15 | Archivo del regalo accesible sin completar la encuesta. | 🔴 | Bucket privado; URL firmada de 10 min solo tras `completed_at`; ninguna URL pública guardada. |
| 16 | Plantilla del regalo (encabezado de documento) rechazada o reclasificada por Meta. | 🟡 | Interruptor propio apagado; el script muestra categoría y estado; sin aprobación el regalo sale igual por descarga y email. |
| 17 | Avisos cortados por el límite de Netlify (varios destinatarios × 8 s). | 🟡 | Avisos fuera del pedido final, límites de inicio por canal, techo de 3 s en el email al equipo, barrido horario. |
| 18 | El previsualizador de WhatsApp marca "Abierta" sin que nadie abra. | 🟢 | "Abierta" la marca el JavaScript de la página, no el servidor. |
| 19 | Borrar las tablas viejas con datos. | 🟢 | La migración aborta si alguna tiene filas. |
| 20 | Migración aplicada antes del merge con código viejo en producción. | 🟢 | Todo es aditivo para el código vivo: las tablas que se borran solo las usan rutas sin consumidores (0 links emitidos). |
