# Design

## Context

Motivo y alcance: `proposal.md`. Estado verificado (código de `main` en `23d4afa8` y base de
producción, solo lectura, 2026-11-28):

- `/metrics` tiene tres pestañas; la primera es el Tablero (`components/metrics/tablero/`), que
  pide `GET /api/metrics/tablero` y arma todo en `armarTablero` (`lib/metrics/tablero/servidor.ts`).
  Ese armado ya trae, con `cargarDatos`, las **personas** de cada embudo (`armarPersonas`, una
  por persona, sin pruebas ni colegas ni pedidos repetidos) y las filas de `deals` con su
  `created_at`. Es exactamente la población que el Tablero llama "Solicitudes".
- El permiso es `metrics.view`: admin y dueño. La coordinación no ve Métricas.
- `contact_activities`: `contact_id` NOT NULL, `deal_id` opcional, `kind` (`call`,
  `whatsapp_sent`, `note`…), `call_outcome` (`no_atendio`, `agendo`, `volver_a_llamar`,
  `no_interesa`, `numero_equivocado`), `occurred_at` (se puede corregir hasta 7 días atrás),
  `voided_at`. Al 28/11: 4 filas en total, **ninguna llamada**; 1 solicitud de tasación desde
  el inicio de la medición.
- Reusable: `minutosHabilesEntre` (lunes a viernes de 9 a 18, `lib/crm/horario-laboral.ts`),
  `duracion` (`lib/crm/formato-fecha.ts`), `Seccion`/`Cuadro`/`Caja`/`Subtitulo` (`ui.tsx`),
  `num`/`pct` (`components/metrics/panel/formato.ts`), el paginador `todas` del panel.

## Goals / Non-Goals

**Goals:** la misma población que "Solicitudes" del Tablero (que los números cuadren entre sí);
reglas puras y testeadas; una falla de las llamadas no tira el Tablero.

**Non-Goals:** comparar contra otro período (la medición tiene dos días; vuelve a evaluarse con
un mes cerrado), comparar personas, metas, alertas, duración de las llamadas, el embudo de la
clase gratuita (la coordinación no la llama: no está en la cola del Inicio).

## Decisions

### D1. Reglas puras en `lib/crm/metricas-llamadas.ts`

- `INICIO_MEDICION_LLAMADAS = '2026-11-27T00:04:52.000Z'` (26/11 21:04 de Argentina, primera
  respuesta del código de `crm-ficha-y-llamadas` en producción) y `POCOS_CASOS = 20`.
- `intentosDeSolicitud(solicitud, intentos)`: los de `deal_id` igual, o de `contact_id` igual
  con `occurred_at >= creadoEn`; sin anulados; ordenados por `occurred_at` y después
  `created_at`.
- `metricasLlamadas(solicitudes, intentos)` → `{ solicitudes, sinIntento, primeraLlamada,
  primeraASegunda, contactados, agendados, intentosHastaAtender, agendoEnLlamada, resultados }`.
  Los tiempos son `{ n, sinCaso, medianaReloj, promedioReloj, medianaHabiles, promedioHabiles }`
  en minutos (`null` sin casos); los repartos son listas fijas `1, 2, 3, 4 o más`; `resultados`
  trae los cinco en el orden de la spec con su cantidad y el total de llamadas. Atendió =
  `agendo | volver_a_llamar | no_interesa`. Mediana: el del medio, o el promedio de los dos del
  medio.
- No formatea: la pantalla usa `duracion` y `pct`.

### D2. Armado en el servidor del Tablero

En `armarTablero`, después de `cargarDatos`: las solicitudes son las `personas` con
`embudo === 'tasacion'`, `fechas.solicitud` dentro del rango y el `created_at` de su proceso
(`d.deals`) `>= INICIO_MEDICION_LLAMADAS`. Una sola lectura más, paginada con `todas` y orden
fijo: `contact_activities` con `kind in ('call','whatsapp_sent')`, sin anular,
`occurred_at >= INICIO_MEDICION_LLAMADAS`. Se cruza en memoria (el volumen es chico: decenas
por día). Va en un `try/catch` propio: el Tablero devuelve
`llamadas: { ok: true, desde, medicionRecortada, datos } | { ok: false }` y el resto sigue.
`medicionRecortada` es `true` si el rango empieza antes del inicio de la medición.

La lectura corre en paralelo con `cargarExtras` (no suma tiempo al Tablero, que hoy tarda lo que
tardan Meta y las personas). Sin comparación: el período comparado no se calcula para esta
sección.

### D3. Pantalla `SeccionLlamadas`

Sección "2 · Llamadas a las solicitudes" debajo de la campaña de tasación; Campañas, Consultas y
Plata pasan a 3, 4 y 5. Contenido, en orden:

1. Aviso de la medición recortada, si corresponde.
2. Cuatro `Cuadro`: "Primera llamada" (mediana de horas hábiles grande; debajo, promedio y
   reloj; "sobre N"), "Contactados" (% grande, "12 de 30"), "Agendaron en una llamada" (ídem) y
   "Sin ningún intento" (cantidad de N).
3. "De la primera a la segunda llamada": mediana y promedio, reloj y hábiles, sobre N.
4. Dos tablas chicas: "Hasta que atendieron" y "En qué llamada agendaron" (1, 2, 3, 4 o más, con
   cantidad y %), con el promedio de intentos.
5. "Resultados de las llamadas": los cinco, cantidad y %, sobre "N llamadas".

Cada bloque con n < 20 dice "Pocos casos". Sin solicitudes: "No hay solicitudes de tasación en
este período desde que empezó la medición." Con solicitudes y sin llamadas: "Todavía no hay
llamadas registradas para estas N solicitudes." más "Sin ningún intento". Error: "No se pudo
cargar" con el botón de recargar del Tablero. Sin gráficos: números y tablas, como el resto del
Tablero ("Nada de adorno").

## Risks / Trade-offs

- **Pocos datos:** hoy no hay ninguna llamada. La sección va a decir eso hasta que la
  coordinación registre; es el comportamiento correcto, no un error.
- **QA con datos de prueba:** los contactos `[TEST` se excluyen del Tablero a propósito, así que
  en la vista previa la sección con datos no se puede ver con datos de prueba. Se verifica (a)
  con tests de las reglas y de la pantalla con datos armados, (b) con un script que corre las
  reglas sobre filas `[TEST]` reales de la base (cruce de llamadas, anuladas, hora corregida), y
  (c) en la vista previa, el estado real (vacío o con lo que haya), permisos y tiempos.
- **Persona con dos pedidos:** el Tablero cuenta a la persona en su primer pedido; si volvió a
  pedir, las llamadas del pedido nuevo cuentan por el contacto (mismo `contact_id`, después de
  su primera solicitud). Una persona que pidió antes de la medición y volvió a pedir después no
  entra (es "repetida"), igual que en "Solicitudes".
- **Hora corregida:** una llamada cargada con hora anterior al registro de la persona no es de
  esa solicitud (salvo que esté ligada a su proceso).
