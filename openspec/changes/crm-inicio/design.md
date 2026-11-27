# Design

## Context

Motivo, alcance y las cuatro recomendaciones aplicadas: `proposal.md`. Lo visual está aprobado
en `../archive/2026-11-25-crm-sistema-diseno/maqueta/` (`pantallas/inicio.*`, capturas
`inicio-{coordinadora,asesor,admin}-{390,1024,1280}.png` y `flujo-inicio-*`) y en las specs
vigentes de `crm-sistema-diseno` ("El Inicio empieza por lo que hay que hacer", "Toda métrica
muestra su base", textos de vencimiento y espera).

Estado verificado (código de `main` y base de producción, solo lectura, 2026-11-27):

- **Hoy** `app/(dashboard)/inicio/page.tsx` muestra cuatro números (`StatTile`) con
  `/api/tasks` (tope de 50), `/api/leads/count`, `/api/properties/revision-legal` y
  `/api/visits`, más el cartel `UnidentifiedBanner` ("N avisos sin propiedad"). Su test del
  cartel falla en `main` desde `c0010c45` (la URL y el texto cambiaron).
- **Datos:** 187 solicitudes abiertas sin ninguna llamada registrada (el registro empezó el
  26/11; `INICIO_REGISTRO_CONTACTOS`); `contact_activities` tiene 2 filas; 9 leads del embudo
  en 7 días; 0 tasaciones hoy y mañana; 0 visitas hoy.
- **Reusable:** `cargarCartera` (filas con `proximo` = "Primera llamada"/"Llamada N" y su
  vencimiento y espera, `ultimoContacto`, `tasacion`, `anteriorAlRegistro`; ~1 s y hasta
  530 KB, que quedan en el servidor), `sinPrimerContacto`, `textoEspera`
  (`cartera-trabado.ts`), `textoVencimiento`, `estadoCadencia` (`lib/crm/cadencia.ts`),
  `minutosHabilesEntre` (9 a 18), `leerAgenda` y las acciones de `components/tareas/`.
- **Falta:** fechas de visita y entrega (`deals.visited_at`, `delivered_at`), la racha de
  WhatsApp y el total de llamadas por proceso, los números del día, la primera llamada por
  lead, y la entrada a la ficha con "Registrar llamada" abierto (`abrirFormulario('llamada')`
  existe en `FichaContacto.tsx`, sin parámetro de entrada).

## Goals / Non-Goals

**Goals:** reusar la cartera (las mismas reglas que el CRM) y no copiarlas; un pedido por
pantalla con cada bloque que falla por separado; la maqueta dentro del layout real.

**Non-Goals:** análisis del negocio (Métricas), personalizar bloques, el Inicio del abogado,
los textos de la ficha que nombran «Sin respuesta» (quedan para un ajuste aparte: hoy no lo
nombran y no mienten).

## Decisions

### D1. Módulo puro `lib/crm/inicio.ts`

Funciones con su test, sobre `FilaCartera` y datos chicos:

- `colaParaLlamar(filas, coordinacion, ahora)`: abiertas, `!anteriorAlRegistro`, y
  `sinPrimerContacto` o `proximo` de clase tarea, título de llamada ("Primera llamada" o
  "Llamada N"), vencido y de alguien de la coordinación. Una fila por persona (contacto),
  orden por `creadoEn` ascendente. Cada ítem: nombre, teléfono, propiedad, "Llamada N",
  "Se registró …", el estado ("Espera hace…" o "Vencida hace…" con `textoVencimiento`) y
  "Anterior: {resultado}, {cuándo}" si el último contacto fue una llamada.
- `sinRespuesta(filas, intentos, ahora)`: solicitudes abiertas desde el registro, con algún
  contacto, sin `proximo` (ninguna tarea pendiente ni tasación) y con WhatsApp en la racha
  (`estadoCadencia`). Texto "WhatsApp enviado hace X · N llamadas sin atender".
- `tasacionesHoyYManana(filas, ahora)`, `leadsSinPrimerContacto(filas, ahora)` (con
  `textoEspera` + "la llama la coordinación").
- `procesosQueEsperan(filas, fechas, ahora)`: del asesor; Coordinada con tasación pasada →
  "Cargar el resultado de la tasación: fue el {día}."; Realizada con `visited_at` de 2 días
  o más → "Entregar la tasación: la visita fue hace N días."; Entregada con `delivered_at`
  de 5 días o más → "Llamar por la respuesta: la tasación se entregó hace N días.". Orden:
  lo que más espera primero.
- `tiempoMedio(leads, ahora)`: cohorte = procesos de solicitud desde el lunes 00:00 de
  Argentina y desde el 26/11; media de reloj y de `minutosHabilesEntre` hasta la primera
  llamada; `n`, `sinLlamar`, `pocos = n < 20`.
- `tareasSinLasDeLaCola(tareas, cola)`, `tareasParaManana(proximas, ahora)`,
  `colapsarCopias(tareas)` (para "Tareas de hoy · coordinación": mismo título, contacto y
  vencimiento).
- `saludo(rol, nombre)`, `fechaDeHoy(ahora)` ("Miércoles 25 de noviembre · 10:40").

### D2. Lecturas `lib/supabase/inicio.ts`

`leerInicio(usuario, ahora)` arma los bloques del rol, cada uno en su `Promise.allSettled`
(`{ ok: true, datos } | { ok: false }`):

- Cartera: `cargarCartera({ quien: usuario, verComo: null })`. La coordinación y el
  dueño/admin ya tienen la vista que necesitan; el asesor, la suya.
- Perfiles activos (roles, para saber quién es de la coordinación).
- `contact_activities` de los procesos de solicitud con contacto (llamadas y WhatsApp sin
  anular) para la racha y el total; y las llamadas de hoy para los números.
- Procesos creados hoy (solicitudes, sin clase ni comprador) para "Solicitudes nuevas".
- Primera llamada de los procesos de la cohorte de la semana.
- `deals.visited_at` y `delivered_at` de los procesos del asesor.
- `property_visits` de hoy del asesor (sin canceladas).
- Tareas: `leerAgenda` (propias; para el dueño, las de la coordinación).

### D3. Ruta `GET /api/inicio`

`requireAuth`; el abogado y los roles sin Inicio reciben 403 (la página los manda a su
pantalla, como hoy). Responde `{ rol, saludo, fecha, bloques }` con cada bloque
`{ ok, datos }`. `force-dynamic`, un solo plazo de 15 s (el de la cartera).

### D4. Ficha con "Registrar llamada" abierto

`app/(dashboard)/contacts/[id]/page.tsx` lee `?registrar=1` en el servidor (como `edit`) y
pasa `abrirLlamada`; `FichaContacto` llama a `abrirFormulario('llamada')` en un efecto
después del montaje (mide el DOM), una sola vez.

### D5. Pantalla (`components/inicio/`)

`Inicio` (cliente) pide `/api/inicio` y dibuja por rol: grilla de una columna en celular y
`1.5fr / 1fr` desde 1024 px, con el `order` de la maqueta. Bloques: `ParaLlamar`,
`SinRespuesta`, `TareasDelDia` (tilde con `completarTarea` y "Deshacer"; escucha
`tareas:cambio`), `Tasaciones`, `NumerosDelDia`, `LeadsSinContacto`, `TiempoMedio`,
`ProcesosQueEsperan`, `VisitasDeHoy`, más `UnidentifiedBanner` arriba (misma condición que
hoy). Cada bloque: carga, error con "Reintentar" (vuelve a pedir todo), vacío de la maqueta.
"Solo lectura" con ícono de ojo y sin botones para el dueño/admin.

### D6. Pruebas

Tests primero en `lib/crm/inicio.test.ts`; `lib/supabase/inicio.test.ts` con la base
simulada; la ruta (roles, permisos: el asesor no recibe nada ajeno); los componentes; la
ficha con `registrar`. Se reescriben `inicio/page.test.tsx` y `page.movil.test.tsx`
(incluye el test roto del cartel).

## Diferencias con lo aprobado

1. "la llama la coordinación" en vez de un nombre (cola única, recomendación 2).
2. Horas hábiles de 9 a 18 (recomendación 4); el pie lo dice.
3. "Mis procesos que esperan algo de mí" usa las reglas de la recomendación 3 (la maqueta
   trae ejemplos escritos a mano).
4. "Mis visitas y tasaciones de hoy" sale de las visitas y las tasaciones reales (la maqueta
   las tomaba de tareas); sin la nota "Además tenés N visitas hoy".
5. `duracion` del código pasa a días desde las 24 h (la maqueta, desde las 48 h).
6. Se conserva el aviso de avisos sin propiedad arriba.

## Risks / Trade-offs

- **Peso:** `cargarCartera` lee toda la cartera (~1 s); se mide en el QA. Si pasa de 2 s,
  separar una lectura propia de la cola.
- **Pocos datos reales:** hoy no hay llamadas registradas; los bloques de llamadas se
  validan con datos `[TEST]`.
- Los avisos de la ficha siguen sin nombrar «Sin respuesta» (Non-Goals).

## Migration Plan

Sin migración.

## Open Questions

Las cuatro recomendaciones de `proposal.md` se aplican mientras el dueño responde.
