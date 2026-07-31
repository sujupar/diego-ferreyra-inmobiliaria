# Etiquetas del embudo + chat con cara de CRM

> **Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development.

**Goal:** que el equipo pueda ver de un vistazo en qué punto está cada persona,
filtrar por eso, y trabajar el chat en una pantalla que se sienta una herramienta
de trabajo y no un WhatsApp Web con otro color.

## Referencia visual

El usuario pasó una captura de un CRM inmobiliario ("Cota · Asesores · WhatsApp").
Lo que pidió tomar de ahí, textual: *"solo los chats a la izquierda y el chat en la
mitad, con ese estilo visual"*, y que el panel de la derecha con los datos del
cliente **aparezca al hacer clic**, no fijo. Elementos concretos de la referencia:

- Avatares circulares con **iniciales**, cada uno de un color distinto derivado del
  nombre.
- **Etiquetas de colores** en cada fila de la lista (`Comprador del exterior`,
  `Caliente`, `Negocia precio`, `Necesita crédito`).
- Contador de no leídos en verde sobre la fila.
- Barra de filtros arriba: por asesor, por etiqueta, "sin responder".
- Franja de alerta dentro del hilo cuando pasó demasiado tiempo sin responder.
- Panel derecho: estado del contacto, métricas de la conversación, datos, y un
  botón para saltar a la ficha.

**No** se copia: la barra de métricas superior del proyecto ni la navegación
lateral (son de otro producto). **No** se imita la estética de WhatsApp.

## Global Constraints

- Prosa de UI en **español rioplatense** (voseo).
- Nada se borra: las etiquetas se quitan, no se destruyen; el historial queda.
- Migraciones **aditivas**; las aplica el orquestador por el pooler.
- El abogado no ve leads ni conversaciones.
- Una operación pesada de red por request (límite de Netlify ~26s).
- Commit author `Sujupar <redstyle50@gmail.com>`.
- Verificación: `tsc` acotado + Vitest + probes `renderToStaticMarkup`
  (Turbopack no levanta local por el acento del path).
- **No mandar WhatsApps reales** (`WHATSAPP_TEST_MODE=false` en `.env.local`).

---

### Task 1: Modelo de etiquetas y estado

**Files:** `supabase/migrations/20260801000001_lead_tags.sql`, `lib/leads/tags.ts`, test.

Dos conceptos distintos, y no hay que mezclarlos:

**ESTADO** — uno solo por persona, avanza con los hechos, se pinta como chip sobrio:

| Estado | Cuándo |
|---|---|
| `nuevo` | se registró y nadie lo contactó |
| `contactado` | el equipo le escribió o lo llamó |
| `visita_agendada` | propuso o se le agendó una visita |
| `visito` | la visita se marcó como realizada |
| `negociando` | hizo una oferta o está discutiendo precio |
| `cerrado` | compró / firmó |
| `perdido` | descartado o sin respuesta tras el seguimiento |

**ETIQUETAS** — varias por persona, las pone el equipo a mano, de colores:

`Caliente` · `Tibio` · `Frío` · `Necesita crédito` · `Comprador del exterior` ·
`Inversor` · `Primera vivienda` · `Negocia precio` · `Permuta` · `Apurado` ·
`Solo mira` · `Ya visitó otras`

- [ ] Migración: tabla `lead_tags` (catálogo: id, nombre, color, orden, activo) +
      `lead_tag_assignments` (lead_id, tag_id, quién, cuándo) +
      `property_leads.pipeline_state` con el enum de arriba y default `nuevo`.
      Sembrar el catálogo con las etiquetas listadas. RLS: operaciones + asesor.
- [ ] `lib/leads/tags.ts`: catálogo tipado, `colorForTag`, `nextStateFor(evento)`
      (función pura), y `initialsAndColor(nombre)` para los avatares.
- [ ] Tests de las funciones puras, incluido que dos nombres distintos que
      empiezan igual no den siempre el mismo color.

---

### Task 2: El estado se mueve solo con los hechos

**Files:** `lib/leads/pipeline-state.ts`, enganches en las rutas existentes, tests.

El estado NO se mantiene a mano: lo mueven los hechos que el sistema ya conoce.

- [ ] `nuevo → contactado` cuando sale el primer mensaje del equipo a esa persona
      (`whatsapp_messages` con `direction='out'` y `sent_by` no nulo).
- [ ] `→ visita_agendada` cuando se crea una `property_visits` para ese lead.
- [ ] `→ visito` cuando esa visita pasa a `completed`.
- [ ] **El estado nunca RETROCEDE solo.** Solo una persona puede bajarlo a mano.
      Sin esto, un mensaje nuevo devolvería a "contactado" a alguien que ya visitó.
- [ ] Cada cambio queda registrado (quién/cuándo/por qué), como
      `deal_stage_history`.
- [ ] Tests de la máquina de estados: avance, no retroceso, e idempotencia.

---

### Task 3: API de etiquetas y filtros

**Files:** `app/api/leads/[id]/tags/route.ts`, modificar
`app/api/whatsapp/conversations/route.ts` y `app/api/leads/route.ts`.

- [ ] `POST`/`DELETE` de etiquetas sobre un lead. Solo operaciones y el asesor
      dueño. Devuelve el lead con sus etiquetas.
- [ ] La lista de conversaciones y la de leads devuelven `pipeline_state` y
      `tags[]`, y aceptan filtrar por ambos.
- [ ] Filtro "sin responder": conversaciones cuyo último mensaje es entrante,
      ordenadas por cuánto hace que esperan. **Es el filtro más útil de todos** —
      es la plata que se está enfriando.
- [ ] Sin N+1: las etiquetas de todas las conversaciones se traen en UNA query.

---

### Task 4: La lista de conversaciones

**Files:** `components/inbox/ConversationList.tsx`, `ConversationRow.tsx`, `Avatar.tsx`.

- [ ] Avatar circular con **iniciales** y color derivado del nombre (estable: la
      misma persona siempre del mismo color).
- [ ] Fila: nombre + `#número`, hora, adelanto del último mensaje, **etiquetas de
      colores**, asesor a cargo, y contador de no leídos.
- [ ] La fila muestra de quién fue el último mensaje: si fue del cliente y nadie
      contestó, se marca visualmente (es el estado que importa).
- [ ] Barra de filtros: buscador, asesor, etiqueta, estado, y "sin responder".
- [ ] Sin conversaciones: estado vacío que explique, nunca un blanco.

---

### Task 5: El hilo

**Files:** `components/inbox/ChatThread.tsx`, `MessageBubble.tsx`, `ThreadHeader.tsx`.

- [ ] Separadores de fecha ("29 de julio de 2026") entre días.
- [ ] Burbujas: salientes a un lado, entrantes al otro, con tilde de estado y el
      **fallo en rojo con su motivo** (no se toca: es el motivo de todo esto).
- [ ] Franja de alerta cuando el último mensaje es del cliente y pasó más de X
      tiempo sin respuesta.
- [ ] Cabecera: iniciales, nombre, `#número`, teléfono, asesor, chip de estado y
      etiquetas. A la derecha, la tarjeta de la propiedad, clickeable.
- [ ] **Estética propia, no WhatsApp**: fondo liso (nada de patrón), burbujas con
      el azul de la marca, tipografía del sistema. Que se sienta una herramienta
      de trabajo.

---

### Task 6: El panel del cliente (al hacer clic)

**Files:** `components/inbox/ContactPanel.tsx`

- [ ] Se abre al hacer clic en la cabecera del contacto. **No es fijo** — pedido
      explícito del usuario.
- [ ] Contenido: avatar grande, nombre, chip de estado, etiquetas editables
      (agregar/quitar ahí mismo), teléfono, email, origen (landing/portal/campaña),
      asesor, propiedad consultada y su precio, y las métricas de la conversación
      (primera respuesta, tiempo medio, cuántos mensajes de cada lado).
- [ ] Botón para saltar a la ficha de la propiedad y otro al lead en el CRM.
- [ ] En pantalla chica es una hoja que sube desde abajo, no una columna.

---

## Verificación final

1. `npx vitest run` completo en verde + `tsc` acotado de todo lo tocado.
2. Probes de render de la lista, el hilo y el panel.
3. Prueba contra la base real: etiquetar, filtrar, y confirmar que el estado
   avanza con los hechos y no retrocede solo.
4. Revisión adversarial de la rama.
