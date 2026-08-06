# Respuesta instantánea a las consultas de portales

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development.
> **ESTE PLAN NO SE EJECUTA HASTA QUE EL DUEÑO LO APRUEBE.**

**Goal:** que una persona que consulta por una propiedad en un portal reciba un
WhatsApp nuestro **en segundos**, con el material de esa propiedad, y pueda
seguir la conversación con el agente hasta coordinar la visita — sin que un
asesor tenga que estar mirando.

---

## Lo que ya existe y este plan aprovecha

- **La ingesta de consultas ya funciona**: se leen los mails de ZonaProp y
  Argenprop, se parsean y entran a `portal_inquiries` con nombre, teléfono,
  mail, mensaje, código del aviso y —cuando se puede— la propiedad.
- **El agente conversacional ya funciona** (`lib/ai/agent-brain.ts`): entiende,
  contesta con los datos reales de la propiedad, manda fotos y video, y agenda.
  Este plan NO lo reescribe: lo conecta a un origen nuevo.
- **Los videos ya son archivos propios** (`video_file_url`), así que se pueden
  mandar por WhatsApp. Un link de YouTube no.
- **El Inbox ya muestra las conversaciones** con etiquetas, filtros y el botón
  para apagar el agente.

## Lo que dicen los datos de hoy (medido, no estimado)

De **198 consultas** históricas (93 en los últimos 30 días, ~3 por día):

| | consultas | |
|---|---|---|
| Con teléfono | 186 | 94% |
| Con propiedad identificada | 155 | 78% |
| **Con teléfono Y propiedad** | **145** | **73%** ← el sistema las atiende completas |
| Con teléfono pero SIN propiedad | 41 | 21% ← el agujero |
| Sin asesor asignado | 41 | el mismo grupo |

De las 145 que el sistema podría atender hoy:

| Material de la propiedad | consultas |
|---|---|
| Tiene video | 123 (85%) |
| Tiene fotos | 139 (96%) |
| **Tiene plano** | **0** |
| No tiene ni plano ni video | 22 |

**Esto cambia dos cosas del diseño planteado.** Primero: la plantilla "solo
plano" y la de "plano + video" **no se dispararían nunca hoy** — ninguna
propiedad tiene planos cargados. Segundo: el caso real y masivo es **video**.
Se construyen las tres igual (el día que carguen planos tiene que funcionar
solo), pero el orden de trabajo lo marca el video.

---

## Global Constraints

- Prosa al cliente en **español rioplatense** (voseo), cercana. Vale todo lo ya
  aprendido en `lib/ai/agent-brain.ts`: no enumerar, contar; no empujar a
  agendar; interpretar lo que la persona quiere, no lo que dijo.
- **Una consulta que no tiene la propiedad identificada NUNCA recibe un WhatsApp
  automático.** No se le manda un código de aviso a nadie.
- La ingesta de consultas **no puede romperse**: si el envío falla, la consulta
  igual queda registrada y notificada.
- Netlify corta a los ~26s. Nada de encadenar trabajo pesado en un request.
- **Prohibido mandar WhatsApps reales en desarrollo** (`WHATSAPP_TEST_MODE`).
- Commit author `Sujupar <redstyle50@gmail.com>`.

---

## La decisión que define todo: cómo entra el material en el primer mensaje

Una consulta llega por mail. Nosotros **no tenemos ventana de 24hs abierta** con
esa persona: nunca nos escribió. Fuera de ventana, WhatsApp solo deja mandar
**plantillas aprobadas**.

Lo que mucha gente no sabe y acá es la clave: **una plantilla puede llevar el
archivo adjunto en su encabezado.** No hay que esperar a que la persona conteste
para mandarle el plano o el video: van EN el primer mensaje.

Eso define la familia de plantillas:

| Situación de la propiedad | Plantilla | Encabezado |
|---|---|---|
| Tiene plano | `consulta_plano` | DOCUMENT (el plano) |
| Tiene video (y no plano) | `consulta_video` | VIDEO (el archivo) |
| Tiene los dos | `consulta_plano` + el video va después, ya en ventana | DOCUMENT |
| No tiene ninguno | `consulta_simple` | sin encabezado |

**El cuerpo es el mismo en las tres**, y es el que Diego usa:

> Hola {{1}}, ¿cómo estás? Soy del equipo de Diego Ferreyra Inmobiliaria.
>
> Te paso {{2}} de {{3}}, por la consulta que dejaste recién. Si querés te mando
> las fotos también.
>
> Contame, ¿cómo te puedo ayudar?

El ofrecimiento de las fotos es deliberado (decisión del dueño, 2026-08-06): da
una razón concreta para contestar además de la pregunta abierta, y las fotos el
agente ya las sabe mandar. Quien conteste "dale" abre la ventana de 24hs, que es
lo que habilita todo lo demás.

Sin botones, a propósito. La pregunta abierta es la que hace que la persona
conteste, y esa respuesta **abre la ventana de 24hs** — que es lo que habilita
todo lo demás (fotos, video, planos, agendar). Un botón de link no genera nada.

La mención de "la consulta que dejaste recién" no es decorativa: es lo que
sostiene la clasificación **UTILITY** ante Meta (es una notificación de trámite,
no publicidad). Mismo patrón que `recorrido_acceso_v4`, ya aprobada.

---

## Consultas de portal ≠ registros de landing

Son dos embudos distintos y el sistema tiene que poder distinguirlos **siempre**.
Hoy `whatsapp_messages` no guarda de dónde viene la conversación.

**Origen explícito, no deducido.** Se agrega `whatsapp_messages.origen`
(`'consulta_portal' | 'landing' | 'manual'`) y se propaga desde quien manda.
Deducirlo después —por la plantilla usada, por si hay lead— es exactamente el
tipo de inferencia que ya nos falló con las visitas de la IA.

En el Inbox: un filtro de origen, al lado de los que ya están.

---

## El agujero: las consultas cuya propiedad no conocemos

41 de 198 (21%) tienen teléfono pero no sabemos por qué propiedad preguntan.
Esas personas hoy **no reciben nada automático y no lo van a recibir** — es la
decisión correcta: mandarle "consultaste por COD-2DLPOM" a alguien es peor que
no escribirle.

Pero el costo de eso tiene que **verse**, y hoy no se ve. Por eso:

**Una pantalla nueva, solo para Diego y el dueño**, que muestre el dolor en
plata y en nombres: cuántas consultas se perdieron esta semana por no tener la
propiedad cargada, de qué avisos, con el link al portal para ir a buscarla, y un
botón para vincular ese aviso a una propiedad del sistema en dos clics.

El objetivo de esa pantalla no es informar: es que cargar las propiedades deje
de ser opcional.

---

## Quién se entera, y cuándo

Paula (coordinadora) es la principal. Diego y el dueño también.

- **Consulta atendida por el sistema** → aviso normal (el que ya existe).
- **Consulta que el sistema NO pudo atender** (sin propiedad, sin teléfono, o
  el envío falló) → **aviso inmediato a Paula**, porque ahí hay una persona
  esperando y nadie del otro lado.
- **La persona pide agendar y el agente coordina** → aviso a Paula para que
  llame y confirme.

Sobre el canal: mandarle un WhatsApp a Paula por cada consulta cuesta una
plantilla cada vez. Con ~3 consultas por día es despreciable, pero **el mail ya
existe y llega igual de rápido**. La recomendación es empezar por mail y agregar
WhatsApp solo para el caso urgente (consulta sin atender), que es el que
justifica interrumpir a alguien.

---

## Recorrido vs. material suelto: la decisión que me pediste

Tenemos los datos de la persona (nombre, teléfono, mail) desde la consulta. Se
le podría generar un token de recorrido —como en la landing— y mandarle el link
en vez de los archivos.

**Mi recomendación: NO al principio, y con un motivo concreto.** El link saca a
la persona de WhatsApp y la mete en un navegador; ya vimos que WhatsApp lo abre
en su navegador interno y que ahí las cosas fallan de formas que no controlamos.
El archivo, en cambio, llega y se ve **sin salir del chat**, que es donde después
va a conversar con el agente.

Cuándo SÍ conviene el recorrido: cuando la propiedad tiene **muchas fotos y un
recorrido armado**, y el valor está en verlo todo junto. Ahí el link gana.

La forma de decidirlo sin adivinar: mandar material suelto durante las primeras
semanas, medir **cuántos contestan** y compararlo contra el embudo de landing,
que ya tenemos medido. Es la misma pregunta que ya sabemos responder con datos.

---

# Tareas

### Task 1: Origen de la conversación (la base de todo lo demás)

**Files:** `supabase/migrations/2026XXXX_whatsapp_origen.sql`,
`lib/integrations/whatsapp/core.ts`, `lib/integrations/whatsapp/log.ts` + tests.

- [ ] Migración ADITIVA: `whatsapp_messages.origen TEXT` con CHECK
      (`consulta_portal` | `landing` | `manual`), default `NULL` (las filas
      viejas no se inventan).
- [ ] `logOutbound` y los cuatro `send*` aceptan y propagan `origen`.
- [ ] Backfill CONSERVADOR y documentado: las filas que ya tienen `lead_id` de
      un lead de landing → `landing`. El resto queda en NULL. **No adivinar.**
- [ ] Test: una conversación sin origen no rompe nada de lo que ya anda.

### Task 2: Las tres plantillas, y el elector

**Files:** `scripts/create-whatsapp-template-consulta-*.ts`,
`lib/leads/consulta-template.ts` + tests.

- [ ] Función PURA `elegirPlantilla(property)` → `{ plantilla, header }` según
      la matriz de arriba. Testear las cuatro combinaciones, incluida la de
      "no tiene nada".
- [ ] Los tres scripts de creación, con el mismo cuerpo y distinto encabezado.
      Mandarlas a aprobación temprano: Meta tarda.
- [ ] El texto exacto del cuerpo va en UN solo lugar y las tres lo comparten.
- [ ] Test: una propiedad con plano Y video elige la de plano (el video va
      después, ya en ventana).

### Task 3: El disparador

**Files:** `lib/leads/responder-consulta.ts`, enganche en la ingesta + tests.

- [ ] Se dispara cuando entra una consulta CON teléfono Y CON `property_id`.
      Sin las dos cosas, no manda nada y anota el motivo.
- [ ] Idempotente por `portal_inquiries.id`: si la ingesta reprocesa el mismo
      mail, la persona NO recibe dos WhatsApps. Columna
      `portal_inquiries.whatsapp_enviado_at`.
- [ ] Crea o reusa el lead, con `origen='consulta_portal'`, para que el agente
      después encuentre la propiedad por teléfono (mismo camino que ya usa).
- [ ] Best-effort: si el envío falla, la consulta queda igual y se notifica.
- [ ] Test: consulta sin propiedad → no manda, deja motivo. Consulta repetida →
      un solo envío.

### Task 4: Que el agente atienda estas conversaciones

**Files:** `lib/ai/agent-brain.ts`, `lib/ai/scheduling-agent.ts` + tests.

- [ ] El agente ya funciona; lo único que cambia es el CONTEXTO: acá la persona
      no vio un recorrido, vio un aviso en un portal. El prompt tiene que
      saberlo para no dar por sentado lo que no vio.
- [ ] Se le pasa el mensaje que la persona dejó en el portal: es lo primero que
      dijo y dice para qué busca.
- [ ] Test: con origen de consulta, el prompt no menciona el recorrido.

### Task 5: Aviso a Paula cuando el sistema NO pudo

**Files:** `lib/email/notifications/consulta-sin-atender.ts` + tests.

- [ ] Mail inmediato a coordinación + admins cuando una consulta con teléfono
      no se pudo atender: sin propiedad, sin material, o el envío falló.
- [ ] Dice QUÉ falta y qué hacer: "no sabemos por qué propiedad pregunta —
      vinculá el aviso acá", con el link.
- [ ] Test: cada motivo produce su propio texto (no un genérico).

### Task 6: El filtro en el Inbox

**Files:** `app/api/whatsapp/conversations/route.ts`,
`components/inbox/ConversationFilterBar.tsx` + tests.

- [ ] Filtro por origen: Consultas de portal / Landing / Todas.
- [ ] La fila muestra de dónde viene, sin abrir la conversación.
- [ ] Test: el filtro no esconde las conversaciones sin origen (las viejas).

### Task 7: La pantalla del dolor (solo Diego y el dueño)

**Files:** `app/(dashboard)/admin/consultas-perdidas/*`, API + tests.

- [ ] Consultas de los últimos 30 días que NO se pudieron atender, agrupadas
      por aviso, con: cuántas, de qué portal, el link al aviso, y desde cuándo.
- [ ] Botón para vincular ese aviso a una propiedad del sistema (reusa
      `portal_property_map`, no inventa otro mecanismo).
- [ ] Un número grande arriba: "esta semana no pudimos contestarle a N personas
      porque la propiedad no estaba cargada".
- [ ] Test: el gate deja pasar solo a admin/dueño.

---

## Riesgos y lo que hay que confirmar con Diego

1. **Nadie tiene planos cargados.** Dos de las tres plantillas no se usarían.
   ¿Se van a cargar? ¿Quién? Si la respuesta es "no por ahora", la de plano se
   construye igual pero no se manda a aprobación todavía.
2. **RESUELTO en parte (2026-08-06):** hoy se publica A MANO en los portales, por
   eso 41 consultas no matchean. Publicar desde la plataforma linkea el aviso
   solo (`syncPortalPropertyMap` ya lo hace al publicar). PERO: eso sirve para
   MercadoLibre, y **158 de las 198 consultas vienen de ZonaProp**, donde no
   podemos publicar desde el sistema. O sea: publicar desde la plataforma NO
   resuelve la fuente principal. Para ZonaProp el camino es la pantalla de
   vinculación de la Task 7, y es más importante de lo que parecía.
3. **El tono del primer mensaje.** Está escrito arriba con las palabras de
   Diego; conviene que él lo lea antes de mandarlo a aprobación, porque después
   cambiarlo cuesta otra aprobación.
4. **Velocidad real.** Nadie nos avisa cuando llega un mail de consulta: el
   sistema va a mirar la casilla cada tanto. Así que "instantáneo" es en
   realidad "dentro de los próximos N minutos", y N es una decisión: mirar más
   seguido cuesta más (cada revisión es trabajo, corra o no haya nada). Con ~3
   consultas por día, revisar cada 2-3 minutos en horario comercial y más
   espaciado de noche da una respuesta que la persona percibe como inmediata sin
   pagar por revisar la casilla 700 veces al día.

5. **Los planos se van a cargar** (el dueño tiene varios, ~10 min de trabajo),
   pero el diseño NO depende de eso: la plantilla se elige según lo que la
   propiedad tenga. Sin plano y con video, va el video.

## Verificación

Tests de las funciones puras (el elector de plantilla, la idempotencia), y
**una prueba en seco con una consulta real** —de las 41 que no matchean y de las
145 que sí— antes de que esto le escriba a nadie. El banco de pruebas de
`/admin/ai-agent` sirve para la parte conversacional.
