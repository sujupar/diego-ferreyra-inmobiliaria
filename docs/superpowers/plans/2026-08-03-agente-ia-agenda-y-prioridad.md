# Agente de IA: agenda visitas por WhatsApp y ordena por prioridad

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development.
> **ESTE PLAN NO SE EJECUTA HASTA QUE EL DUEÑO LO APRUEBE.**

**Goal:** que una persona que recibió el recorrido pueda agendar su visita
conversando por WhatsApp, sin que un asesor tenga que estar; y que el equipo vea
primero las conversaciones que más urgen.

---

## Lo que ya está resuelto y este plan aprovecha

- La plantilla `recorrido_acceso_v3` trae un botón de **respuesta rápida**
  ("Quiero agendar una visita"). Al tocarlo entra un mensaje del cliente, lo que
  **abre la ventana de 24hs** y deja la intención registrada. Ese es el disparador
  natural del agente — no hay que inventar ninguno.
- Ya sabemos **quién es** (nombre, teléfono, `lead_number`) y **qué propiedad**
  mira. Al agente no le falta ningún dato: solo tiene que coordinar día y hora.
- Ya existe `property_visits` con estado `pending_confirmation` y el aviso al
  asesor, coordinación y dirección (lo usa hoy la agenda de `/v/[token]`).
- Ya existe el registro completo de mensajes y la ventana de 24hs calculada.

---

## El problema del costo, que es el que define el diseño

Preocupación textual del dueño: *"tiene que tener un sistema que no tenga un
consumo excesivo de tokens y que esté perfectamente distribuido con estrategia"*.

Lo ingenuo —mandarle a un modelo la conversación entera cada vez que llega un
mensaje o cada vez que se refresca la lista— **no escala**: con 300
conversaciones activas y refresco cada 15 segundos son millones de tokens por día
para leer, casi siempre, exactamente lo mismo.

Tres reglas que gobiernan todo el plan:

1. **La IA solo corre cuando hay algo NUEVO que leer.** Un mensaje entrante
   dispara; un refresco de pantalla NUNCA dispara.
2. **La IA nunca lee la conversación completa.** Lee un resumen acumulado (≤400
   caracteres) más los mensajes nuevos desde el último análisis. El resumen se
   reescribe en la misma llamada — se paga una vez, no una por turno.
3. **Lo que se puede calcular sin IA, se calcula sin IA.** Cuánto falta para que
   cierre la ventana es una resta de fechas. Ahí no hay nada que pensar.

---

## Global Constraints

- Prosa al cliente y de UI en **español rioplatense** (voseo).
- Nada se borra: los veredictos de IA se acumulan, no se pisan.
- **La IA NUNCA manda un mensaje sin que su texto quede registrado** en
  `whatsapp_messages` con `sent_by = null` y una marca de que lo generó la IA.
- Una operación pesada de red por request (Netlify corta a los ~26s).
- **Prohibido mandar WhatsApps reales en desarrollo** (`WHATSAPP_TEST_MODE`).
- Commit author `Sujupar <redstyle50@gmail.com>`.

---

### Task 1: Memoria de la conversación (barata)

**Files:** `supabase/migrations/20260803000001_conversation_ai_state.sql`,
`lib/ai/conversation-memory.ts` + tests.

- [ ] Tabla `conversation_ai_state`, una fila por `phone_e164`:
      `summary` (≤400 chars), `last_analyzed_message_id`, `intent`
      (`agendar` | `consulta` | `frio` | `desconocido`), `priority_score` (0-100),
      `priority_reason` (una frase, la que se le muestra al asesor),
      `suggested_next_step`, `tokens_used_total`, `updated_at`.
- [ ] `mensajesNuevosDesde(state, mensajes)` — función pura: devuelve solo lo no
      analizado. **Es la pieza que contiene el costo**; testearla bien.
- [ ] `debeAnalizar(state, mensajes, ahora)` — pura. Devuelve `false` si no hay
      mensajes nuevos, si el último es nuestro, o si ya se analizó hace menos de
      2 minutos (anti-rebote).

---

### Task 2: El analista (una llamada, salida estructurada)

**Files:** `lib/ai/analyze-conversation.ts` + tests.

- [ ] UNA llamada al modelo por análisis, con el resumen previo + los mensajes
      nuevos. Devuelve JSON: `{ summary, intent, priorityScore, priorityReason,
      suggestedNextStep, wantsToSchedule, proposedSlot? }`.
- [ ] Modelo barato por defecto (el mismo cliente agnóstico `lib/ai/chat-client`
      que ya usa el resto). Techo duro de tokens por llamada.
- [ ] **Nunca lanza:** ante fallo devuelve el estado anterior sin tocar. Una
      conversación sin análisis se ordena por la ventana de 24hs, que no necesita IA.
- [ ] `priorityReason` en una frase, en castellano, entendible por el asesor.
      Es lo que justifica el orden en pantalla; sin explicación, el orden no se usa.

---

### Task 3: El agente que agenda

**Files:** `lib/ai/scheduling-agent.ts`, enganche en el webhook + tests.

- [ ] Se activa SOLO si `wantsToSchedule` y la ventana de 24hs está abierta.
- [ ] Conversa lo mínimo: propone franjas concretas (mañana/tarde de los próximos
      días hábiles) en vez de preguntar abierto. Menos vueltas = menos tokens y
      menos fricción.
- [ ] Confirmado el día y la franja, crea la `property_visits` en
      `pending_confirmation` y avisa al asesor, igual que hoy hace `/v/[token]`.
      **Reusa esa ruta, no la dupliques.**
- [ ] Cierra diciendo que el equipo confirma — nunca promete un horario firme.
- [ ] **Freno de mano:** interruptor por propiedad y global. Si está apagado, el
      agente analiza pero NO manda nada. **Arranca apagado.**
- [ ] Tope de mensajes por conversación (3). Si no cerró, marca para que un
      humano siga y deja de escribir. Un bot insistente quema el número.

---

### Task 4: El orden por prioridad en el Inbox

**Files:** `app/api/whatsapp/conversations/route.ts`,
`components/inbox/ConversationFilterBar.tsx`, `ConversationRow.tsx`.

- [ ] Filtro nuevo **"Orden IA"** (icono de chispa). Ordena por un puntaje que
      combina: cuánto falta para que cierre la ventana (calculado, sin IA) y el
      `priority_score` de la IA.
- [ ] La fila muestra el **motivo** en una línea ("pidió agendar y le quedan 3h
      de ventana"). Sin el porqué, nadie confía en el orden.
- [ ] Filtro separado **"Ventana por cerrar"**, puramente calculado — funciona
      aunque la IA esté apagada o caída.
- [ ] Que se vea qué conversaciones tocó la IA y cuáles no.

---

### Task 5: Que el costo sea visible

**Files:** `app/(dashboard)/admin/ai-usage/page.tsx` o panel en Configuración.

- [ ] Cuántos análisis se corrieron, tokens y costo estimado, por día.
- [ ] Cuántas visitas agendó el agente y cuántas terminaron confirmadas.
- [ ] Sin esto, el gasto de IA es invisible hasta que llega la factura.

---

## Riesgos que quiero que el dueño confirme antes de construir

1. **Un bot hablando con clientes reales** puede sonar mal o equivocarse. Por eso
   arranca apagado, con tope de 3 mensajes y siempre con "el equipo confirma".
2. **El costo depende del volumen de mensajes entrantes**, no del de
   conversaciones. Con las reglas de arriba, una conversación de 10 mensajes
   cuesta ~5 análisis cortos, no 10 lecturas completas.
3. **Meta puede penalizar** un número que la gente bloquea. El tope de mensajes
   y el freno de mano existen por eso.
4. **La IA se puede equivocar al leer la intención.** Por eso el orden muestra el
   motivo: el asesor ve el razonamiento y decide, no obedece.

## Verificación

Tests de las funciones puras (memoria, disparo, orden), probes de render, y
**una prueba en seco del agente** con conversaciones simuladas antes de que toque
un cliente real.
