# Sección Consultas — diseño

Fecha: 2026-10-29 · Tamaño: **grande** (módulo nuevo, toca visitas y teléfonos de clientes) ·
Lienzo de diseño: https://claude.ai/artifact/MQgvu3ZnFcEYQQFnX3ya1T

## 1. Qué se pide y para qué

**Qué:** una sección propia, **Consultas**, en el menú, donde entra toda consulta de un interesado
(portales y landings de propiedades), ordenada de la más nueva a la más vieja, con filtros
(período, portal, propiedad —incluida "sin propiedad identificada"—, estado, asesor, búsqueda),
estadísticas, y desde cada consulta **agendar la visita en dos toques** con la persona y la
propiedad ya cargadas. Tiene que andar perfecto en el celular.

**Para qué:** hoy las consultas están escondidas (Inbox → pestaña Consultas) y no llevan a nada:
**de 640 consultas desde junio, 0 visitas se agendaron desde una consulta** (las 15 visitas de la
base tienen otro origen). Entran ≈160 por mes. La sección existe para que cada consulta se
convierta en visita rápido y para medir cuántas lo hacen.

## 2. Datos reales que condicionan el diseño (medidos el 2026-10-29)

| Dato | Valor |
|---|---|
| Consultas de portales | 640 (jun–oct); últimos 90 días: ZonaProp 357, Argenprop 113, MercadoLibre 6 |
| Sin propiedad identificada (90 d) | 198 de 476 = **42 %** |
| Con teléfono (90 d) | 451 de 476 |
| Personas distintas (90 d) | 381 personas para 444 consultas con teléfono |
| Consultas de landings de propiedades | 25 (`property_leads.source='landing'`) |
| Teléfonos que el normalizador actual NO entiende | 10 de 537 distintos (fijos de 8 dígitos, números de 9) |
| Riesgo detectado | un número sin `+` que no es argentino válido (`4571430985`) hoy se interpreta como **extranjero** en silencio |

## 3. Qué ve el usuario

Diseño completo en el lienzo (7 pantallas). Resumen:

### 3.1 Menú y ubicación
- Entrada nueva **"Consultas"** en el grupo Comercial, entre Inbox y Visitas, para admin, dueño,
  coordinador y asesor. El abogado no la ve (y la ruta lo rechaza).
- En el celular aparece en la barra de abajo.
- La pestaña "Consultas" del Inbox desaparece y `/inbox?tab=consultas` redirige a `/consultas`.
  La tarjeta "Consultas" de la ficha de propiedad sigue, y su enlace lleva a
  `/consultas?propiedad=<id>`.

### 3.2 `/consultas` — pestaña **Bandeja** (por defecto)
- **Tres tarjetas "para atender"** del período: *Sin visita todavía*, *Sin propiedad identificada*,
  *Teléfono a revisar*. Tocar una aplica ese filtro.
- **Filtros** (viven en la dirección, así se puede compartir el link y el botón atrás funciona):
  período (Hoy / 7 días [defecto] / 30 días / Este mes / fechas), portal (Todos / ZonaProp /
  Argenprop / MercadoLibre / Landing, con el conteo de cada uno), propiedad (todas / **⚠ Sin
  propiedad identificada** / cada propiedad con su conteo), estado (Todas / Sin visita / Con visita
  agendada / Visitó), asesor (solo quien puede ver todo; incluye "Sin asesor"), búsqueda por
  nombre, teléfono, email o dirección (tolerante a tildes, reusa `lib/filters/busqueda-texto.ts`).
- **Lista** agrupada por día, la más nueva arriba, de a 25 con "Ver más" y el total. Cada fila:
  nombre, teléfono ya formateado (`+54 9 11 6140-0496`) o el aviso "teléfono a revisar", portal,
  canal (WhatsApp/Mail/Pregunta/Landing), hora, propiedad o "⚠ Sin propiedad identificada · aviso
  <código>", estado y botón **Agendar visita**. Si la misma persona consultó otras veces, una
  etiqueta "N consultas".
- **Detalle** al tocar una fila (panel a la derecha en compu, pantalla completa en celular):
  teléfono con la verificación de WhatsApp y de dónde salió, botones *Abrir WhatsApp* y *Llamar*,
  la propiedad (con enlace al aviso), el mensaje, otras consultas de la misma persona, y
  **Agendar visita**.
- MercadoLibre oculta el contacto: esas filas dicen "MercadoLibre no comparte el contacto" y al
  agendar piden el teléfono (como "persona nueva").

### 3.3 Agendar desde una consulta
- **Caso normal (persona + propiedad conocidas):** se abre directo en **día y hora**. Arriba, la
  tarjeta con quién (nombre + WhatsApp verificado) y qué propiedad (con "Cambiar"). Días como
  botones (Hoy, Mañana, …, "Otra fecha"), horas como grilla (los `HORARIOS_SUGERIDOS`, "Otra
  hora…"), casilla "Ya la confirmé con la persona" (marcada por defecto), botón final que dice
  "Agendar jueves 30 · 17:00". El origen queda **Portal** (o el de la landing) sin preguntarlo.
  El asesor es el de la propiedad; quien puede ver todo lo puede cambiar.
- **Sin propiedad identificada:** primero "¿Qué propiedad quiere ver?" con lo que sabemos del aviso
  (portal, código, título, enlace), buscador, y primero las propiedades del mismo barrio. Casilla
  **"Recordar que este aviso es <propiedad>"** (marcada): conecta el aviso con la propiedad, pasan
  a ella las otras consultas de ese aviso y las próximas entran solas (reusa la lógica de
  `POST /api/portal-inquiries/identify`). Solo operaciones puede identificar avisos (igual que hoy).
- **Teléfono a revisar:** antes de día y hora, un paso que muestra lo que dejó la persona, por qué
  no sirve, y un campo partido **+54 9 | característica | número** con la vista previa "Así queda
  guardado: +54 9 11 4941-0027" y "Probar: abrir este chat en WhatsApp".
- **Listo:** "Visita agendada · jueves 30 · 17:00", botón **"Confirmarle por WhatsApp"** que abre
  el WhatsApp del asesor con el mensaje escrito (no se manda nada automático), "Ver la visita",
  "Volver a consultas". La fila pasa a "Visita jue 30 · 17:00".

### 3.4 `/consultas` — pestaña **Estadísticas**
Mismo período y filtros que la bandeja. Toda cifra viaja con su base (patrón de
`lib/visitas/metricas.ts`: sin base dice "Sin datos", con base < 20 dice "orientativo").
- Tarjetas: Consultas (y por día), Personas distintas, % con propiedad identificada, Visitas
  agendadas desde consultas, **Consulta → visita** (personas con visita / personas con teléfono
  válido).
- "De la consulta a la visita": Consultas → con WhatsApp válido → visita agendada → visitó; se
  resalta el paso más angosto.
- Por portal: consultas, % del total, visitas agendadas y conversión.
- Por propiedad (tabla, tocar fila = bandeja filtrada): consultas, reparto por portal, visitas,
  conversión, última consulta; la fila "⚠ Sin propiedad identificada" con enlace a identificarlas.
- Consultas por mes; por canal; por asesor.

## 4. Qué pasa por detrás

- **Lectura unificada:** vista `consultas_unificadas` (`security_invoker = true`, así respeta la RLS
  de cada tabla) que une `portal_inquiries` y `property_leads` con `source='landing'` en un mismo
  formato: id, tipo (`portal`/`landing`), número, fecha (`COALESCE(received_at, created_at)`), canal,
  portal, nombre, teléfono, `phone_norm`, email, mensaje, `property_id`, `assigned_to`, código y URL
  del aviso, dirección cruda. Sin columnas nuevas en las tablas de origen.
- **Estado derivado, sin columna nueva:** una consulta está "con visita" si hay una visita no
  cancelada con `portal_inquiry_id` = la consulta, **o** de la misma propiedad y el mismo teléfono
  (canónico). "Visitó" si esa visita está realizada.
- **Rutas nuevas** (finas, con `requireAuth` y el alcance por rol de visitas):
  `GET /api/consultas` (filtros + paginado + total + conteos de las tarjetas),
  `GET /api/consultas/resumen` (estadísticas), `POST /api/consultas/[id]/propiedad` (conectar una
  consulta sin propiedad, opcionalmente "recordar el aviso"; solo operaciones).
- **Agendar:** se reusa `AgendarVisitaDialog` y `POST /api/visits` tal cual (persona `consulta` con
  `telefono` corregido, o `registro` para landings). Se extiende el estado inicial de la ventana para
  arrancar con origen, persona y propiedad puestos y el paso en "cuándo". No se crea una segunda
  forma de crear visitas.
- **Teléfonos — regla del 549**, módulo puro nuevo `lib/consultas/telefono.ts` sobre
  `normalizeWhatsappPhone`:
  - Todo número se interpreta como **argentino** salvo que empiece con `+` y otro código de país.
    Un número sin `+` que no es argentino válido queda **"a revisar"**, nunca se adivina extranjero.
  - Se limpian solos: `+`, espacios, guiones, paréntesis, `54`, `540`, `0` de la característica,
    `15` del número, el `9` faltante. Casos reales: `541161400496`, `5401162653949`,
    `540111556335717`, `1561956411`, `011 15 …`.
  - Resultado: `{ ok, whatsapp: '549…', mostrado: '+54 9 11 6140-0496', corregido }` o
    `{ revisar, motivo }` ("le falta la característica", "tiene 9 números", …).
  - Se prueba con los 537 formatos reales anonimizados (mismo patrón de dígitos, otros números).
  - El teléfono corregido se guarda en la visita y en el comprador (canónico `+549…`); la consulta
    original no se toca (queda como evidencia de lo que mandó el portal).
- **Nada se manda solo:** ni WhatsApp ni email automático nuevo. El email de confirmación de visita
  existente sigue igual (solo si está confirmada, es futura y hay email).

## 5. Qué queda afuera

- Mensajes automáticos al cliente (la respuesta automática a consultas sigue frenada esperando a
  Diego).
- Consultas que entran por WhatsApp directo o por la campaña de tasación (no son de una propiedad).
- Descartar/archivar consultas o marcarlas "contactada" (no hay columna de estado; se agrega si
  hace falta después).
- Número en el menú con las consultas pendientes.
- Arreglar en la base el `phone_norm` de números viejos guardados con "15".

## 6. Criterios de aceptación

1. Admin, dueño, coordinador y asesor ven "Consultas" en el menú (compu y celular); el abogado no la ve y `/consultas` lo saca.
2. La bandeja muestra consultas de portales y de landings, la más nueva arriba, agrupadas por día, de a 25 con "Ver más" y el total correcto.
3. Cada filtro (período, portal, propiedad, estado, asesor, búsqueda) cambia la lista y los conteos, queda en la dirección y sobrevive a recargar la página.
4. El filtro de propiedad tiene "Sin propiedad identificada" y muestra exactamente las consultas con `property_id` nulo del período.
5. El asesor solo ve consultas de sus propiedades (lista, conteos y estadísticas); no ve el filtro de asesor.
6. Desde una consulta con persona y propiedad, "Agendar visita" abre directo en día y hora; con dos toques y el botón final queda una visita con `origin='portal'`, `portal_inquiry_id` = la consulta, y la fila pasa a "Visita <día> · <hora>".
7. Desde una consulta sin propiedad, se elige la propiedad; con "Recordar" marcado, las demás consultas de ese aviso quedan con esa propiedad.
8. Un teléfono que no sirve (8 dígitos) no deja agendar hasta corregirlo; lo corregido se guarda como `+549…` en la visita.
9. Los formatos reales (`541161400496`, `5401162653949`, `540111556335717`, `1561956411`, `011 15 …`) se muestran y guardan como `+54 9 <característica> <número>`; un número sin `+` que no es argentino queda "a revisar".
10. Una consulta de landing se agenda como persona `registro` con su origen.
11. "Confirmarle por WhatsApp" abre `wa.me/549…` con el texto de la visita; no se envía nada automático.
12. En un celular táctil (390×844) todo el recorrido —lista, filtros, detalle, agendar, sin propiedad, teléfono, listo— se hace sin scroll horizontal y con botones de 44 px o más.
13. Estadísticas: los números coinciden con un `select` directo en la base para el mismo período y filtros; cada cifra con base 0 dice "Sin datos".
14. `/inbox?tab=consultas` lleva a `/consultas`; el enlace de la ficha de propiedad lleva a la bandeja filtrada por esa propiedad.

## 7. Riesgos y choques (pre-flight)

- **RLS:** la vista con `security_invoker` hereda la RLS de cada tabla; el asesor de `property_leads`
  ve también las de propiedades asignadas a él — se alinea el alcance en la ruta con el de visitas.
- **Migración antes del deploy:** la vista se crea antes de mergear (aditiva, no rompe nada).
- **Productor/consumidor:** `POST /api/visits` exige `consulta.property_id === propiedadId`, por eso
  conectar la propiedad va ANTES de agendar. `nav/sections.test.ts` fija los menús por rol: se
  actualiza. La pestaña del Inbox se borra: grep de `tab=consultas` y `PortalInquiriesClient`.
- **Teléfonos:** `phone_norm` de la consulta sale del teléfono crudo; para el estado "con visita" se
  compara por el teléfono canónico calculado en el servidor, no solo por `phone_norm`.
- **Volumen:** ≈160/mes; las estadísticas se calculan en el servidor sobre el período (mismo enfoque
  que visitas, probado con 20.000 filas).
- **Mensajes reales:** ninguno nuevo. En el QA, el email de confirmación de visita se evita usando
  visitas [TEST] sin email o el modo prueba.

## 8. Entregas

- **Entrega 1:** menú, bandeja con filtros, detalle, agendar (normal, sin propiedad, teléfono),
  celular, redirecciones. Criterios 1–12 y 14.
- **Entrega 2:** pestaña Estadísticas. Criterio 13.

## 9. Decisiones que tomé yo (revisables)

- Se incluyen las consultas de landings (pediste "todas"); son 25.
- La lista muestra cada consulta (no agrupa por persona) para respetar "por orden de llegada"; marca
  las repetidas.
- Período por defecto: 7 días en la bandeja, 30 en estadísticas.
- "Ya la confirmé" viene marcado por defecto (quien agenda desde la consulta suele haber hablado).
- Sin número en el menú en esta versión.
