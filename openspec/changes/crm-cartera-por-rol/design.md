# Design

## Context

Motivo y alcance: ver `proposal.md` (con las cuatro respuestas del dueño del 2026-11-26 al
final). Lo aprobado está en `maqueta/` (capturas en `maqueta/capturas/`, lo que se dio por
hecho en `maqueta/pantallas/decisiones.html`) y manda sobre cualquier otro documento. Este
change se construye **después** de que `crm-ficha-y-llamadas` esté en `main` y reusa sus
módulos (D1).

Estado del código y de los datos que condiciona el diseño (verificado en el worktree y con
consultas de solo lectura contra `mncsnastmcjdjxrehdep` el 2026-11-26):

- **`/crm` es un componente de cliente** (`app/(dashboard)/crm/page.tsx`, 696 líneas) que
  pide `/api/auth/me` y después `GET /api/deals` de a 50, ordenado por `created_at`. Muestra
  la tarjeta "Deals", diez tarjetas de etapa (`StagePipeline`), fichas o tabla
  (`DealsList`/`DataTable`) y abre `/pipeline/<id>`. Al asesor le borra en memoria las
  solicitudes y las clases, y aproxima sus totales con lo cargado en pantalla.
- **Los contadores por etapa de hoy van a romperse solos.** `getDeals`
  (`lib/supabase/deals.ts:163`) cuenta las etapas con un `select('stage, scheduled_date')`
  sin paginar: PostgREST corta en 1000 filas sin avisar y hoy hay **984 procesos**. Con 17
  más, los números de las tarjetas empiezan a mentir. La pantalla nueva no usa esa lectura.
- **`GET /api/contacts` deja al asesor casi sin contactos y corta en 200 a todos.** Para el
  asesor filtra solo por `contacts.assigned_to`, que está cargado en **26 de 868** contactos
  (`created_by` en ninguno); la regla de acceso de la ficha (`puedeVerContacto`: asignado,
  creador, proceso o tasación suya) no se aplica a la lista. Y `getContacts` hace
  `.limit(200)` sin avisar: coordinación y dueño ven los 200 más nuevos de 868.
- **El alcance del asesor ya se fuerza en el servidor** (`resolverAlcanceAsignado`,
  `lib/auth/scope.ts`); las rutas leen con service role, así que la RLS no frena nada: el
  permiso va en cada ruta.
- **Volumen real** (2026-11-26): 984 procesos — 493 abiertos (Solicitud 185 = 132 `request`
  + 53 `scheduled` sin día; Coordinada 15; No realizada 7; Realizada 21; Entregada 21;
  Seguimiento 100; Clase gratuita 138; Comprador 6) y 491 cerrados (Captada 19, Descartado
  472). Coinciden con los números de la maqueta. 868 contactos (4 sin ningún proceso), 48
  personas con más de un proceso abierto, 116 procesos de colegas (todos descartados), 113
  procesos sin asesor después de la solicitud. Perfiles activos: 2 coordinadores, 2 asesores,
  2 admin, 1 dueño, 1 abogado.
- **Tareas pendientes: 635.** 516 son `update_contact` **sin fecha** (la tarea de entrada de
  cada lead), 594 están a nombre de coordinadores, 249 procesos tienen más de una, y hay
  tareas pendientes colgadas de procesos ya cerrados (86 en descartados, 12 en captados).
  72 `informe_quincenal`, 10 `complete_imported_property` y 2 `review_property` son de
  propiedades, no de personas.
- **`contact_activities` tiene 0 filas**: la ficha todavía no está en producción. Las
  llamadas de antes nunca se anotaron. Todos los 100 seguimientos tienen `visited_at` (de
  agosto de 2025 a septiembre de 2026), así que todos llevan más de 14 días desde su último
  contacto conocido. Y todas las 185 solicitudes figurarían "sin primer contacto". Ver D3 y
  Open Question 1.
- **No hay motivo de cierre guardado**: `deal_stage_history` tiene `metadata jsonb` y nada
  más; `deals` no tiene columna de motivo. `lost_at` está en 472 de 472 descartados y
  `captured_at` en los 19 captados.
- **`deals.property_type` está vacío en 886 de 984** (los históricos y los del embudo viejo).
- **No hay índice sobre `deals.contact_id`**: lo leen la ficha (`getContact`) y la cartera.
- **`HORARIO_LABORAL` no tiene hora de fin** (`lib/crm/horario-laboral.ts:8`, "nadie la
  confirmó"). "Lo que está trabado" necesita contar horas hábiles (Open Question 3).
- **La barra inferior del celular no es la que dice la maqueta.** `lib/nav/bottom-bar.ts`
  arma la barra con los cuatro primeros de `PREFERENCIA_DE_DESTINOS` que el rol tenga: hoy,
  para coordinación, admin y dueño, Inicio · Pendientes · Inbox · Consultas; para el asesor,
  lo mismo. CRM salió de la barra **a propósito** el 2026-10-29 para meter Consultas
  (CLAUDE.md, "Sección Consultas"). La página de decisiones de la maqueta describe la barra
  de hoy como "Inicio, Pendientes, Contacto y Menú", que no es la real. Ver Open Question 2.
- **Entorno:** nada de IA ni de procesos programados en estas rutas. La vista previa de
  Netlify usa el Supabase de producción. iCloud vacía archivos y cuelga `tsc`/`vitest`
  (CLAUDE.md): las pruebas se corren con configuración acotada o desde una copia local.

## Goals / Non-Goals

**Goals:**
- Que cada rol abra el CRM en la vista de su trabajo, con la fila que dice qué pasó y qué
  sigue, exactamente como la maqueta aprobada.
- Que el CRM, Contactos, la ficha y (más adelante) el Inicio digan lo mismo sobre la misma
  persona: una sola regla de "último contacto", "próximo paso", "vencido" y "trabado", en
  `lib/crm/`.
- Que un asesor nunca reciba por la red un proceso, un contacto ni una tarea ajenos.
- Que la pantalla abra en un solo viaje de datos y que filtrar, buscar, ordenar y cambiar
  de grupo sea instantáneo.

**Non-Goals:**
- Tablero por columnas (Kanban): no se hace (respuesta 1 del dueño).
- Editar procesos desde la lista, acciones masivas nuevas, métricas de negocio.
- El Inicio (`crm-inicio`), la campanita y Pendientes (`crm-tareas-y-campanita`): reusarán
  los módulos de acá, pero no se tocan.
- Arreglar `GET /api/deals` y `GET /api/contacts` (quedan sin consumidor de pantalla; D9).
- Guardar un motivo de cierre (no existe el dato).

## Decisions

### D1. Lo que se reusa de `crm-ficha-y-llamadas` y lo que falta allá

La cartera es la lista de la ficha: tiene que decir lo mismo. Se reusa, sin copiar:

| Pieza | Dónde | Para qué acá |
|---|---|---|
| `contact_activities` (tabla, índice `idx_contact_activities_contacto`) | migración `20261125000001` | último contacto |
| `elegirDealActivo` | `lib/crm/deal-activo.ts` | proceso de una persona en Contactos (D5) |
| `tareasVisiblesEnFicha` (regla (a): la `new_assignment` de un proceso con tasación agendada no se muestra) | `lib/crm/tareas-ficha.ts` | próximo paso |
| `vencimientoDeTarea`, `enArgentina`, `instanteDesdeAR`, `diasDeCalendarioEntre`, `ZONA_AR` | `lib/crm/tareas-ficha.ts`, `lib/crm/horario-laboral.ts` | vencimientos en hora de Argentina |
| `RESULTADO_CORTO` (se exporta) | `lib/crm/actividades.ts:147` | "Llamada · no atendió" |
| `alcanceContactos`, `puedeVerContacto` | `lib/auth/contact-access.ts` | quién ve qué contacto en Contactos |
| `resolverAlcanceAsignado` | `lib/auth/scope.ts` | no se usa: la vista decide el alcance (D6) |
| `leerJson` | `lib/crm/leer-json.ts` | leer respuestas tolerando un 504 en HTML |
| `ChipEtapa` y las piezas de estado de `components/crm/ui/` (tarea 9.1 de ese change) | `components/crm/ui/` | etapa neutra, vacío, error, esqueleto |
| Ficha `/contacts/[id]` (`FichaContacto`) | tarea 9.2 de ese change | destino de cada fila; se le suma "Volver" (D11) |

**Lo que falta en `crm-ficha-y-llamadas` y es requisito previo** (tareas 1.1 y 1.2): la
respuesta 4 del dueño ("la cabecera de la ficha dice «Último contacto» en vez de «Última
llamada»") se aplica **en ese change, con su spec**. Ese trabajo ya está hecho en la rama de la
ficha (commit `3af9e1db`, 2026-11-26): `lib/crm/ultima-llamada.ts` se renombró a
`lib/crm/ultimo-contacto.ts`, que exporta `masReciente(instantes)` (el instante más nuevo,
comparando instantes y no textos), `UltimoContacto { texto, dias, alerta }` y
`ultimoContacto(ultimoEn, ahora, etapaCRM)` (el texto y la alerta de la cabecera), y cuenta como
contacto una llamada, un WhatsApp marcado y una visita (`deals.visited_at`). **Este change
extiende ese módulo, no crea otro:** le suma lo que la fila necesita y la cabecera no (qué fue
el contacto, la fecha de inicio del registro) con nombres que no chocan (D5), y usa la misma
fuente de la visita (`deals.visited_at`, D2). Su spec `crm-ficha-contacto` ya dice "Último
contacto" en los escenarios de la cabecera, y la cabecera de `FichaContacto` también (verificado
el 2026-11-26): este change **no** cambia la ficha por su cuenta (no trae delta de esa spec). El
texto relativo de la lista ("hace 2 h") va en `lib/crm/formato-fecha.ts`, el mismo módulo de
fechas de la ficha (D5, ya en la rama desde la tarea 9.1 de ese change, commit `30acc591`): no
quedan dos formatos de "hace cuánto".

### D2. Base de datos: una función de lectura y un índice

No hay tablas nuevas ni cambia ninguna policy. El último contacto de cada persona sale de
`contact_activities` (que va a crecer con cada llamada) y de las visitas de sus procesos:
traer todas las filas para quedarse con la última por persona no escala, y pasar 900 ids en
la dirección revienta el tamaño del pedido (CLAUDE.md, búsqueda de texto: más de ~10 KB de
dirección da `UND_ERR_HEADERS_OVERFLOW`). Una función llamada por RPC recibe los ids en el
cuerpo y devuelve una fila por persona.

Migración `supabase/migrations/<AAAAMMDD>000001_crm_cartera.sql` (el prefijo se elige al
escribirla mirando el directorio: ya hubo uno duplicado; al 2026-11-26 el último es
`20261125000001`):

```sql
-- crm-cartera-por-rol (design.md D2): último contacto registrado por persona, para la
-- cartera (/crm, /contacts) y la cabecera de la ficha. Solo lectura. Idempotente: la
-- aplica y verifica scripts/apply-crm-cartera-pg.ts, que re-ejecuta el archivo ENTERO
-- (un arreglo posterior se hace también acá).

-- La ficha y la cartera leen los procesos de una persona: sin índice, recorrido completo.
CREATE INDEX IF NOT EXISTS idx_deals_contact_id
  ON public.deals (contact_id) WHERE contact_id IS NOT NULL;

-- CREATE OR REPLACE: volver a correr el archivo no deja un instante sin función. Si algún
-- día cambian las columnas de salida, hace falta DROP antes (CLAUDE.md: "cambiar return type").
CREATE OR REPLACE FUNCTION public.crm_ultimos_contactos(p_contactos uuid[])
RETURNS TABLE (
  contacto_id         uuid,
  actividad_at        timestamptz,   -- última llamada o WhatsApp marcado, sin anuladas
  actividad_tipo      text,          -- 'call' | 'whatsapp_sent'
  actividad_resultado text,          -- call_outcome de esa llamada
  visita_at           timestamptz    -- última visita de tasación de cualquier proceso
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(p_contactos) AS id
  ),
  act AS (
    -- Una nota no es hablar con la persona: solo llamadas y WhatsApp marcados.
    SELECT DISTINCT ON (a.contact_id)
           a.contact_id, a.occurred_at, a.kind, a.call_outcome
      FROM public.contact_activities a
      JOIN ids ON ids.id = a.contact_id
     WHERE a.voided_at IS NULL
       AND a.kind IN ('call', 'whatsapp_sent')
     ORDER BY a.contact_id, a.occurred_at DESC, a.created_at DESC, a.id DESC
  ),
  vis AS (
    -- La misma fuente que la cabecera de la ficha (lib/crm/ultimo-contacto.ts):
    -- deals.visited_at. Si algún día se quiere usar visit_completed_at, se cambia en los
    -- dos lados juntos; si no, la ficha y la lista dirían fechas distintas de la misma persona.
    SELECT d.contact_id, max(d.visited_at) AS visita_at
      FROM public.deals d
      JOIN ids ON ids.id = d.contact_id
     WHERE d.visited_at IS NOT NULL
     GROUP BY d.contact_id
  )
  SELECT ids.id, act.occurred_at, act.kind, act.call_outcome, vis.visita_at
    FROM ids
    LEFT JOIN act ON act.contact_id = ids.id
    LEFT JOIN vis ON vis.contact_id = ids.id
   WHERE act.contact_id IS NOT NULL OR vis.contact_id IS NOT NULL;
$$;

-- Solo el servidor (service role). Con sesión propia nadie la llama: SECURITY INVOKER
-- igual aplicaría la RLS, pero no hay por qué exponerla.
REVOKE ALL ON FUNCTION public.crm_ultimos_contactos(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_ultimos_contactos(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ultimos_contactos(uuid[]) TO service_role;
```

Índices que usa: `idx_contact_activities_contacto (contact_id, occurred_at DESC) WHERE
voided_at IS NULL` (ya existe: sirve al `DISTINCT ON`, el filtro por `kind` va sobre las
filas del índice) e `idx_deals_contact_id` (nuevo). Medido sin el índice nuevo sobre 500
personas: 3 ms de ejecución (los procesos entran en memoria); el índice es para cuando la
tabla crezca y para la ficha.

`scripts/apply-crm-cartera-pg.ts` (patrón `apply-contact-activities-pg.ts`): aplica el
archivo dos veces seguidas y, dentro de una transacción con `ROLLBACK`, verifica (1) que la
función existe con `prosecdef = false`; (2) que `has_function_privilege('anon', …)` y
`('authenticated', …)` dan falso y `('service_role', …)` verdadero; (3) que el índice
existe; (4) con un contacto `[TEST] apply-crm-cartera` y dos procesos `[TEST]` (uno con
`visited_at` hace 10 días), una nota de hoy, una llamada anulada de hoy, una llamada de
ayer y un WhatsApp marcado de hace 2 días: la función devuelve una fila con la llamada de
ayer (`actividad_tipo='call'`) y la visita; (5) un contacto sin nada no devuelve fila; (6)
`EXPLAIN ANALYZE` de una llamada con 900 ids termina en menos de 50 ms. Cuenta solo las filas de
prueba antes y después del `ROLLBACK` y aborta si quedó alguna. `throw` ante la primera
que no cuadre.

### D3. De dónde sale cada dato

| Dato de la fila | Fuente | Regla (módulo de D5) |
|---|---|---|
| Nombre, teléfono | `contacts.full_name`, `contacts.phone` por `deals.contact_id` | sin contacto: nombre "Sin nombre", la fila abre `/pipeline/<id>` |
| Propiedad | `deals.property_type` (+`property_type_other`), `rooms`, `neighborhood` | "PH 4 amb · Colegiales"; con tipo vacío (886 de 984) queda solo el barrio |
| Dirección | `deals.property_address` | — |
| Etapa | `deals.stage` + `scheduled_date` | `etapaCRM` (mismo criterio que `deriveCRMStage`) |
| Origen | `deals.origin` | `clase_gratuita` cuenta como "Embudo" en el filtro; vacío u otro valor no entra en ningún origen (hoy 0 casos) |
| Asesor | `deals.assigned_to` → `profiles.full_name`, `is_active` | columna, "Sin asesor" y "(dado de baja)" (D5). Hoy hay procesos a nombre del dueño (46 de Diego Ferreyra): el filtro "Asesor" ofrece a toda persona con procesos a su nombre |
| Entró al CRM | `deals.created_at` | días de Argentina |
| Cierre | `captured_at` / `lost_at`, si falta `stage_changed_at` | sin motivo (no existe el dato) |
| Último contacto | `crm_ultimos_contactos` (D2) | `contactoRegistrado`: el más nuevo entre `actividad_at` y `visita_at`, con `masReciente` |
| Próximo paso | `tasks` pendientes del proceso + tasación agendada del proceso | `proximoPaso` (D5) |
| Tasación agendada | `deals.scheduled_date` + `scheduled_time` en Coordinada (`stage='scheduled'` con día, mismo criterio que la ficha), con asesor `deals.assigned_to` | sin hora = todo el día; ya pasada = tarea vencida "Cargar el resultado de la tasación" (abajo) |
| Colega | `'colega' = any(deals.tags)` | oculto por defecto |
| Sin primer contacto / sin asesor / sin movimiento | lo anterior + `INICIO_REGISTRO_CONTACTOS` | `lib/crm/cartera.ts` |
| Espera (reloj y hábiles) | `deals.created_at` | `minutosHabilesEntre` (D5) |

**Qué tareas cuentan para el próximo paso:** `status = 'pending'`, ligadas al proceso
(`tasks.deal_id`), de los tipos `update_contact`, `follow_up` y `new_assignment`; nunca
`informe_quincenal`, `review_property`, `rejected_docs` ni `complete_imported_property`
(lista explícita `TIPOS_TAREA_DE_PROCESO`: un tipo nuevo no entra hasta que se lo agregue).
De la vista sale de quién: coordinación y asesor, solo `assigned_to` = la persona de la vista;
dueño, cualquiera. Se aplica la regla (a) de `tareasVisiblesEnFicha` con el mismo criterio de
"tasación agendada" que la ficha (`stage='scheduled'` con día, aunque ya haya pasado). En
Contactos, las del proceso que se muestra y las ligadas solo al contacto (`tasks.contact_id`
sin `deal_id`). Las tareas de un proceso cerrado no cuentan (la fila muestra "Cierre").

**Tareas repetidas de la coordinación.** `createTaskForRole` (`lib/supabase/tasks.ts:99`)
crea una copia por coordinador activo (hoy dos: Paula y la cuenta de prueba "Julian
Coordinador"). Cuando una completa la suya, la otra queda pendiente. En la vista del dueño y en
Contactos del equipo, las copias de una misma tarea de coordinación cuentan como **una**,
con "· coordinación" en lugar de un nombre; y si alguna copia se completó o descartó, ninguna
cuenta. **Copias son solo las de `createTaskForRole`:** asignadas a coordinadores, sin
`source_activity_id`, con el mismo `deal_id`, `type` y `title` y creadas con **60 segundos o
menos** de diferencia entre sí. Es una diferencia entre instantes, no "el mismo minuto" del
reloj: `createTaskForRole` (`lib/supabase/tasks.ts:99-118`) inserta las copias una tras otra en
un bucle, y dos hermanas creadas a las 12:00:59,9 y a las 12:01:00,1 caerían en minutos
distintos si se truncara (hay un test con ese par).
No alcanza con mismo título: la cadencia crea "Llamar a {nombre}" y "Enviar WhatsApp a
{nombre}" una y otra vez en el mismo proceso (`lib/crm/cadencia.ts:150` y `:185`), y una
completada la semana pasada no puede esconder la pendiente de hoy. Para eso se leen también
las tareas de coordinación completadas o descartadas **creadas desde la copia pendiente más
vieja menos 60 segundos** (lectura (d) de D4, en la tanda 2 porque necesita las pendientes de
la tanda 1). No "los últimos 90 días": una copia de la cuenta de prueba que nadie completa
puede tener meses, y su hermana completada quedaría afuera de una ventana fija. Y sin los 60
segundos de margen quedaría afuera la hermana que nació milisegundos antes que la pendiente en
el mismo bucle. Columnas: `deal_id, type, title, assigned_to, status, created_at,
source_activity_id`; respeta el tope y avisa `truncado` como el resto. Contactos del equipo
(`cargarContactos`, D6) hace la misma lectura con el mismo corte. En la vista de una
coordinadora cuenta solo su copia, como pide la spec.

**Primera llamada sin fecha.** La tarea de entrada de cada lead es `update_contact` **sin
fecha** (`lib/funnel/side-effect-handlers.ts:45`, 516 de las 635 pendientes, y la ficha no la
cambia). Sin una regla, toda solicitud nueva diría "Primera llamada · Sin fecha" en gris y
quedaría al final del orden, al revés de la urgencia. Regla (`proximoPaso`): una tarea de
llamada (`update_contact`, o `follow_up` con canal `call`) sin fecha, de una persona sin
ningún contacto registrado, en una solicitud creada desde `INICIO_REGISTRO_CONTACTOS`, toma
como vencimiento el momento del registro si entró en horario laboral, o las 9:00 del día
hábil siguiente si entró fuera (`siguienteDiaHabil`). Con eso se muestra como piden los
escenarios aprobados: "Espera hace 28 min" (entró en horario, la espera se cuenta desde el
registro) o "Vencida hace 1 h" (desde las 9:00), y ordena como cualquier tarea con fecha. Las
solicitudes anteriores al registro siguen "Sin fecha" (no se sabe si se las llamó).

**Tasación que ya pasó.** 13 de las 15 Coordinadas de hoy tienen la fecha vencida (nadie
cargó si se hizo). La fila no puede decir "Nada agendado" (escondería trabajo atrasado): el
próximo paso es "Cargar el resultado de la tasación", vencido desde el día de la tasación, a
nombre del asesor del proceso (cuenta para su vista y para la del dueño; para la coordinación
no es su tarea: en su vista la fila igual dice "Cargar el resultado de la tasación · {asesor}"
con la fecha, sin contar en su grupo "Llamada o mensaje vencido", porque "Nada agendado" sería
falso). Sin hora cargada (3 casos), la tasación es "todo el día": vence recién al día siguiente
y en "Tasaciones de hoy" va después de las que tienen hora.

**Fecha de inicio del registro** (`INICIO_REGISTRO_CONTACTOS`, una constante en
`lib/crm/ultimo-contacto.ts`, Open Question 1): la fecha (en Argentina) en que la ficha de
`crm-ficha-y-llamadas` salió a producción. Con los datos de hoy, sin ella las 185 solicitudes
aparecerían "sin primer contacto" con la más vieja de septiembre de 2025 arriba de todo, y
los 100 seguimientos "sin movimiento": la pantalla afirmaría que nadie llamó a nadie, cuando
lo que pasa es que antes no se anotaba. Reglas: (1) una solicitud cuyo proceso se creó antes
de esa fecha y sin contacto registrado no es "sin primer contacto"; (2) los días de "sin
movimiento" se cuentan desde `max(último contacto, inicio)`; (3) esa fila dice "Sin contacto
registrado". La tarea 1.2 fija el valor con la fecha real del deploy de la ficha: **`'2026-11-26'`** (PR #92, deploy en producción el 2026-11-26 a las 21:04 de Argentina; cierre en el PR #95). Se toma el día entero: lo que entró ese día antes del deploy cuenta como posterior al registro, del lado de avisar de más.

### D4. Cómo se lee: un viaje, filas armadas en el servidor, todo lo demás en memoria

Mismo patrón que Consultas (CLAUDE.md, "Sección Consultas — Entrega 2"): cada pedido a la
plataforma cuesta su piso (sesión + red), así que la pantalla pide lo menos posible.

1. **`page.tsx` es un componente de servidor** que resuelve la sesión, decide la vista (D6) y
   llama a `cargarCartera(...)` (servicio de `lib/supabase/cartera.ts`). El resultado —
   **datos planos**, nunca componentes ni funciones (CLAUDE.md, frontera servidor→cliente) —
   va como prop a `CarteraCRM` (`'use client'`). La pantalla abre con los datos, sin un
   segundo viaje.
2. **El servicio hace dos tandas de lecturas en paralelo**, con columnas explícitas:
   - Tanda 1 (en paralelo): (a) procesos del alcance de la vista con su contacto
     (`deals` + `contacts:contact_id(id, full_name, phone, email, created_at)`, D6);
     (b) tareas pendientes de los tipos de D3 con `deal_id` o `contact_id` no nulos
     (`id, type, title, assigned_to, deal_id, contact_id, due_date, due_time, all_day,
     channel, created_at, source_activity_id`), filtradas por `assigned_to` cuando la vista
     es de una persona;
     (c) perfiles (`id, full_name, role, is_active`).
   - Tanda 2 (en paralelo, porque las dos dependen de la tanda 1):
     `rpc('crm_ultimos_contactos', { p_contactos })` con los contactos de (a); y (d) las tareas
     de coordinación completadas o descartadas con `created_at` mayor o igual al `created_at`
     de la copia pendiente más vieja de (b) **menos 60 segundos** (`deal_id, type, title,
     assigned_to, status, created_at, source_activity_id`, para no mostrar como pendiente una
     copia de una tarea ya hecha, D3). Si (b) no trajo ninguna copia pendiente de coordinación,
     (d) no se lee; si (b) falló, tampoco (las tareas ya van con `'error'`).
   - Cada lectura pagina de a 1000 con `.range()` y orden fijo — procesos y contactos por
     `created_at desc, id` (así, pasado el tope, lo que queda son los más recientes, como dice
     el aviso), tareas por `id` (la API corta en 1000 sin
     avisar), con un tope de 3000 filas por fuente (`TOPE_FILAS`): pasado el tope devuelve
     `truncado: true` y la pantalla lo avisa (spec "Listas largas"); (d) también, con el mismo
     tope y el mismo aviso. Para la RPC se usa
     `rpcPaginado` (`lib/supabase/rpc-paginado.ts`) con orden `contacto_id`. Contactos también
     pagina (868 hoy, cerca de la página de 1000).
   - **Un solo plazo de 15 s para todo el servicio** (una `AbortSignal.timeout(15000)`
     compartida por todas las lecturas y páginas de las dos tandas): con un techo por lectura,
     tres páginas más la RPC podían sumar 32 s y pasar los ~26 s de Netlify. `rpcPaginado` no
     acepta una señal hoy: se le agrega la opción `senal` con su test (tarea 4.1).
   - Con `ver_como`, antes de la tanda 1 se lee el perfil pedido (`id, role, is_active,
     full_name`, un `eq`) para resolver la vista: un viaje más, solo en ese caso.
   - Tipos: `contact_activities` y la función no están en `types/database.types.ts`; se usa
     el mismo patrón que Consultas (`lib/consultas/datos.ts:21`, cliente sin tipar y tipos
     propios del resultado) en lugar de regenerar los tipos.
   - Si falla (a), falla todo: 500 en la ruta, estado de error en la página. Si falla (b), (d)
     o la RPC, se arman las filas igual con `proximo: 'error'` o `ultimoContacto: 'error'` y
     `fuentes` lo dice (spec "Estados…"). Sin (d) una copia ya completada se mostraría como
     pendiente, así que su falla cuenta como falla de las tareas. Nunca se rellena un dato que
     falló con un vacío.
3. **El servidor arma las filas** con `armarFilasCartera` (puro, D5): una `FilaCartera` por
   proceso, con el próximo paso ya elegido para la persona de la vista y el último contacto
   ya resuelto. Se mandan **los dos segmentos** (abiertos y cerrados): así "Cerrados N" y
   los números por etapa respetan los filtros sin otro pedido (spec "Totales con filtros").
4. **El navegador filtra, agrupa, ordena y pagina en memoria** con `lib/crm/cartera.ts`. Lo
   único que vuelve a pedir datos es "Reintentar", "Ver como" y volver a la pestaña después
   de 5 minutos (para que la lista no quede vieja todo el día).

**Cuánto tarda y cuánto pesa.** Medido el 2026-11-26 desde esta Mac (round trip a Supabase
~160–200 ms): la lectura de los 984 procesos con su contacto ejecuta en 2,4 ms en la base;
la de visitas de 500 personas, 3 ms. El tiempo lo pone la red: dos tandas ≈ 2 round trips +
la sesión (validada por firma desde el PR #65; el perfil sí se lee en cada pedido). Estimado en Netlify: **0,4 a
0,8 s** para la vista del dueño; se mide en la vista previa (tarea 9.4) y se anota en el PR.
Peso: el dueño recibe ~984 filas de ~450 bytes ≈ 450 KB sin comprimir (~80 KB comprimido);
la coordinación ~650 filas; un asesor, las suyas. Filtrar 984 filas en memoria tarda menos
de 5 ms (mismo orden que las 3000 consultas de Consultas en menos de 50 ms). Si el peso pasa
de 1 MB se recortan campos de las cerradas (Risks).

**Por qué no paginar en el servidor:** ordenar por "próximo paso" necesita la tarea más
próxima de cada proceso en hora de Argentina, la regla de la espera y la de la tasación; en
SQL sería una segunda copia de las reglas de `lib/crm/` (justo lo que la propuesta prohíbe) y
cada filtro costaría un viaje. Con este volumen, traer el alcance entero es más rápido y más
simple. El día que el tope de 3000 se acerque, se pagina por vista en el servidor detrás de
la misma forma de `FilaCartera`.

### D5. Módulos puros (`lib/crm/`), con su test al lado

Ninguno lee la red, la base ni el reloj: `ahora` llega por parámetro. Las firmas:

```ts
// lib/crm/etapas.ts — una sola definición de las etapas del CRM
export type EtapaCRM = 'solicitud' | 'coordinada' | 'no_realizada' | 'realizada' | 'entregada'
  | 'seguimiento' | 'clase_gratuita' | 'comprador' | 'captada' | 'descartado'
export const NOMBRE_ETAPA: Record<EtapaCRM, string>   // 'No realizada', 'Clase gratuita'…
export const ETAPAS_EMBUDO: readonly EtapaCRM[]        // solicitud … seguimiento
export const ETAPAS_FUERA_DEL_EMBUDO: readonly EtapaCRM[] // clase_gratuita, comprador
export const ETAPAS_CERRADAS_CARTERA: readonly EtapaCRM[] // captada, descartado
export function etapaCRM(d: { stage: string; scheduled_date: string | null }): EtapaCRM
export function estaAbierto(e: EtapaCRM): boolean
```
`etapaCRM` es el `switch` de `deriveCRMStage`; ese archivo y el `switch` duplicado de
`getDeals` (`lib/supabase/deals.ts:179`) pasan a usarlo (D9). **Comprador cuenta como
abierto en la cartera** (la maqueta lo pone en la barra del asesor y en "Fuera del embudo"),
aunque `elegirDealActivo` de la ficha lo trate como cerrado para la cadencia: son dos
preguntas distintas y quedan escritas así en los dos módulos.

```ts
// lib/crm/ultimo-contacto.ts — YA EXISTE (lo crea crm-ficha-y-llamadas): masReciente,
// UltimoContacto { texto, dias, alerta } y ultimoContacto(ultimoEn, ahora, etapaCRM) de la
// cabecera no se tocan. Se le suma, con su test:
export const INICIO_REGISTRO_CONTACTOS: string        // '2026-11-26' (día de Argentina del deploy de la ficha, D3)
export type QueFue = 'llamada' | 'whatsapp' | 'visita'
export interface ContactoRegistrado { at: string; que: QueFue; resultado: ResultadoLlamada | null }
export function contactoRegistrado(r: {
  actividad_at: string | null; actividad_tipo: string | null
  actividad_resultado: string | null; visita_at: string | null
} | null): ContactoRegistrado | null   // elige con masReciente: una sola regla de "el más nuevo"
export function textoQueFue(c: ContactoRegistrado): string   // 'Llamada · no atendió' | 'WhatsApp enviado' | 'Visita de tasación'
export function anteriorAlRegistro(creadoEn: string): boolean
```
La ruta de la ficha y la cartera eligen el instante con la misma `masReciente` sobre las
mismas tres fuentes: la cabecera dice "Último contacto: hace 4 días" y la fila "hace 4 días ·
Visita de tasación" para la misma persona.

```ts
// lib/crm/formato-fecha.ts — YA EXISTE (de crm-ficha-y-llamadas, en la rama desde el commit
// 30acc591): horaCorta, diaCorto, fechaExacta, fechaRelativa(instante, ahora),
// cuandoEs(fecha, hora, ahora), EstadoVencimiento ('vencida'|'hoy'|'proxima'|'sinfecha') y
// textoVencimiento(...). La cartera los USA tal cual y solo suma, con su test:
export function haceCuanto(at: string, ahora: Date): string   // como fechaRelativa, pero desde 7 días siempre 'hace N días' (regla de la fila)
export function duracion(minutos: number): string              // '28 min' | '16 h 20 min' | '2 días 18 h'
```
Si al empezar `textoVencimiento` no cubre algún texto de la spec "Próximo paso" (la espera de la
primera llamada, "Hoy, todo el día", "Sin fecha"), se amplía ahí con su test, sin una segunda
función. `textoVencimiento` tiene que decidir si venció con `vencimientoDeTarea` (una sola
regla). No se crea `textos-tiempo.ts`: con dos módulos de fechas, la ficha y la lista dirían
"hace" de dos maneras.

```ts
// lib/crm/horario-laboral.ts (se amplía)
export const HORARIO_LABORAL = { dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '18:00' } as const
export function minutosHabilesEntre(desde: Date, hasta: Date): number  // en hora de Argentina
```
`fin` se agrega sin tocar `inicio`: la cadencia solo lee `inicio` y no cambia. El valor
espera la Open Question 3.

```ts
// lib/crm/cartera-vista.ts — qué vista corresponde y qué abarca
export type Vista =
  | { tipo: 'coordinacion'; personaId: string }
  | { tipo: 'asesor'; personaId: string }
  | { tipo: 'dueno' }
export type MotivoVista = 'sin_vista' | 'ver_como_prohibido' | 'persona_invalida'
export function vistaPara(
  quien: { id: string; role: string },
  verComo: string | null,
  perfiles: { id: string; role: string; is_active: boolean | null }[],
): { ok: true; vista: Vista; mirando: { id: string; role: string } | null } | { ok: false; motivo: MotivoVista }
export function procesoEnVista(
  d: { etapa: EtapaCRM; origin: string | null; assigned_to: string | null }, v: Vista,
): boolean
```
`vistaPara`: lista **explícita** de roles (coordinador → coordinación; asesor → asesor;
admin y dueño → dueño; cualquier otro → `sin_vista`); `verComo` con un rol que no es admin ni
dueño → `ver_como_prohibido`; `verComo` que no es un perfil activo coordinador o asesor →
`persona_invalida`. `procesoEnVista` es la regla de la spec ("Qué procesos ve la
coordinación", "Vista del asesor") y la usan **las dos puntas**: la consulta de D6 filtra lo
grueso en la base y esta función vuelve a filtrar en el servidor antes de mandar (defensa
doble: si la consulta se ensancha por error, igual no sale nada ajeno).

```ts
// lib/crm/cartera.ts — la fila y la lista
export interface ProximoPaso {
  clase: 'tarea' | 'tasacion'
  titulo: string                 // 'Llamada 2' | 'Primera llamada' | 'Tasación'
  vence: { due_date: string | null; due_time: string | null; all_day: boolean } | null
  quien: { id: string; nombre: string } | null
  espera: { registradoEn: string } | null
  instante: string | null        // para ordenar; null = sin fecha
}
export interface FilaCartera {
  id: string; contactoId: string | null; nombre: string; telefono: string | null
  propiedad: string; direccion: string; etapa: EtapaCRM; abierto: boolean
  origen: string | null; asesor: { id: string; nombre: string } | null
  creadoEn: string; cerradoEn: string | null; colega: boolean
  anteriorAlRegistro: boolean
  ultimoContacto: ContactoRegistrado | null | 'error'
  proximo: ProximoPaso | null | 'error'
  tasacion: { instante: string; asesor: string | null; direccion: string } | null
}
export function armarFilasCartera(e: {
  vista: Vista; procesos: ProcesoLeido[]; tareas: TareaLeida[]
  ultimos: Map<string, ContactoRegistrado> | 'error'; perfiles: Map<string, string>; ahora: Date
}): FilaCartera[]
export function proximoPaso(e: {
  tareas: TareaLeida[]; tasacion: FilaCartera['tasacion']; etapa: EtapaCRM
  hayContactos: boolean; registradoEn: string; nombrePersona: string; ahora: Date
}): ProximoPaso | null   // con `ahora` decide "Tasación" o "Cargar el resultado…"; con `etapa` y
                         // `registradoEn`, la regla de la primera llamada sin fecha (D3)
export function sinPrimerContacto(f: FilaCartera): boolean
export function sinAsesor(f: FilaCartera): boolean
export function sinMovimiento(f: FilaCartera, ahora: Date): boolean   // 14 días, con D3
export const SIN_MOVIMIENTO_DIAS = 14
// Todo texto: `useFiltrosUrl` exige `Record<string, string>`.
export interface FiltrosCartera {
  seg: 'abiertos' | 'cerrados'; etapa: EtapaCRM | ''; origen: 'embudo' | 'referido' | 'historico' | ''
  asesor: string; entro: '' | 'hoy' | 'ayer' | '7' | '15' | '30' | '90' | 'rango'
  desde: string; hasta: string; q: string
  trabado: '' | 'sin-contacto' | 'sin-asesor' | 'sin-movimiento'
  orden: 'proximo' | 'ultimo' | 'nuevos' | 'nombre'; colegas: '' | '1'; ver: string
}
export function filtrarFilas(f: FilaCartera[], filtros: FiltrosCartera, ahora: Date): FilaCartera[]
export function contarPorEtapa(f: FilaCartera[], filtros: FiltrosCartera, ahora: Date): Record<EtapaCRM, number>  // todos los filtros menos etapa y segmento
export function ordenarFilas(f: FilaCartera[], orden: FiltrosCartera['orden']): FilaCartera[]
export type ClaveGrupo = 'sin-contacto' | 'vencidas' | 'tasaciones' | 'resto'
  | 'hoy' | 'proximos' | 'nada' | 'todos' | 'cerrados'
export interface Grupo { clave: ClaveGrupo; filas: FilaCartera[]; urgente: boolean }
export function agrupar(f: FilaCartera[], v: Vista, ahora: Date): Grupo[]
export function textoBusqueda(s: string): string   // sin tildes (NFD y NFC), minúsculas, teléfono solo dígitos
```
Si el servidor marcó `fuentes.ultimoContacto = 'error'`, `agrupar` no arma "Sin primer
contacto" (esas filas van al grupo siguiente que les toque) y `sinMovimiento` da falso; si
marcó `fuentes.tareas = 'error'`, no arma los grupos de vencidas ni "Con próximo paso" (las
tasaciones sí: salen del proceso). Reglas que fijan los tests (spec): orden de grupos y "un proceso en un solo grupo";
"Sin primer contacto" por `creadoEn` ascendente; tasaciones de hoy y mañana solo futuras;
"Próximo paso" = vencidas, con fecha por instante, sin fecha, sin nada, y desempate por el
último contacto más viejo; "Nombre" con `localeCompare('es')` (Ángela antes que Bruno);
`origen` 'embudo' incluye `clase_gratuita`; colegas ocultos salvo `colegas: '1'`; el desempate
final de "Próximo paso" entre filas sin ningún contacto es el más viejo primero (así las
solicitudes anteriores al registro quedan de la más vieja a la más nueva); el título
de la tarea sin " a {nombre}", " con {nombre}", " de {nombre}" (comparando sin tildes) y
"Primera llamada" para una tarea de llamada (`update_contact`, o `follow_up` con canal
`call`) de alguien sin contactos registrados.

```ts
// lib/crm/cartera-trabado.ts
export interface Trabado {
  sinContacto: { filas: FilaCartera[]; base: number }   // base = solicitudes abiertas
  sinAsesor: { filas: FilaCartera[]; base: number }     // base = abiertos en Coordinada, No realizada, Realizada, Entregada o Seguimiento
  sinMovimiento: { filas: FilaCartera[]; base: number } // base = seguimientos abiertos
}
export function calcularTrabado(filas: FilaCartera[], ahora: Date): Trabado | 'error'
export function textoEspera(registradoEn: string, ahora: Date): string // 'Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles'
```
Devuelve `'error'` si alguna fila trae `ultimoContacto: 'error'` (no se cuenta lo que no se
sabe). Se calcula sobre **todos** los abiertos sin colegas, sin filtros. La base de "sin primer
contacto" son las solicitudes que entraron desde `INICIO_REGISTRO_CONTACTOS`, y aparte se
cuentan las anteriores (`anterioresAlRegistro`) para el renglón "Además, M anteriores al
registro de llamadas, sin dato." Cada columna lista hasta 5 nombres: la espera más larga, los
más días sin movimiento, y en "sin asesor" la etapa más avanzada y después el más viejo.

```ts
// lib/crm/contactos-cartera.ts
export interface FilaContacto extends Omit<FilaCartera, 'id' | 'etapa' | 'abierto'> {
  id: string                       // contact id
  proceso: { id: string; etapa: EtapaCRM } | null
  conProcesoAbierto: boolean
  registradoEn: string             // contacts.created_at
}
export function procesoDeContacto<T extends { id: string; stage: string; created_at: string;
  scheduled_date: string | null; assigned_to: string | null }>(
  procesos: T[], quienMira: { id: string; role: string }): T | null
export function contactoVisible(u: { id: string; role: string }, v: VinculosContacto): boolean
export function armarFilasContactos(e: {...}): FilaContacto[]
```
`procesoDeContacto(procesos, quienMira)`: para un asesor, **solo entre los procesos a su
nombre** (si no tiene ninguno —ve al contacto por estar asignado, por haberlo creado o por una
tasación—, `null`, "Sin proceso" en la fila); para los demás, entre todos. Dentro de esos, el
abierto más reciente (incluido Comprador); si no hay, el cerrado más reciente; sin procesos,
`null`. Sin esto, la fila de un asesor traía el proceso más nuevo de otro asesor (48 personas
tienen más de uno abierto), lo mismo que la ficha oculta con `dealsOcultos`
(`app/api/contacts/[id]/tasks/route.ts:36`). `contactoVisible` es `puedeVerContacto`: no se
copia la regla. Los filtros, el orden y la paginación reusan los de `cartera.ts` (las
funciones son genéricas sobre los campos comunes).

```ts
// lib/crm/cartera-url.ts
export const FILTROS_DEFECTO: FiltrosCartera
// No se llama `leerFiltros`: ya existe uno en lib/filters/url-state.ts.
export function leerFiltrosCartera(params: URLSearchParams, permitidos: { asesores: string[]; etapas: EtapaCRM[] }):
  { filtros: FiltrosCartera; rechazados: string[] }
// Cuenta como viejo: `origin`, `from`, `to`, o una etapa cerrada (`descartado`, `captada`)
// sin `seg`, a la que se le suma `seg=cerrados`. `etapa` y `asesor` solos no (se llaman igual
// en la dirección nueva). Traducir dos veces da null (test): la segunda vuelta ya trae `seg`.
export function traducirParametrosViejos(params: URLSearchParams): URLSearchParams | null // null = no había nada viejo
export function enlaceVolver(volver: string | null): { href: string; texto: 'Volver al CRM' | 'Volver a Contactos'; seccion: 'crm' | 'contactos' } | null
```
`enlaceVolver` acepta solo un camino relativo que empieza exactamente con `/crm` o
`/contacts` seguido de nada, `?` o `/` — y en el segundo caso no `/contacts/<algo>` (una
ficha no vuelve a otra ficha) —, sin `//`, sin `\`, sin esquema y sin caracteres de control;
cualquier otra cosa → `null` (spec "Enlace de vuelta manipulado"). Se prueba con
`https://otro.com`, `//otro.com`, `/\otro.com`, `/crm@otro.com`, `/crmx`, `/contacts/123`,
`javascript:`, `%2F%2Fotro.com` y texto con tildes en NFD.

### D6. Rutas y páginas

| Ruta | Quién | Qué hace |
|---|---|---|
| `GET /api/crm/cartera?ver_como=<uuid>` | coordinador, asesor, admin, dueño | Sesión (`requireAuth`); `vistaPara` → 403 (`sin_vista`, `ver_como_prohibido`), 400 (`persona_invalida`, "Esa persona no tiene una vista del CRM."), 400 si `ver_como` no es un uuid. `cargarCartera(vista)` → 200 `{ vista: { tipo, persona: { id, nombre, rol } \| null }, filas, asesores, opcionesVerComo, fuentes: { ultimoContacto, tareas }, truncado, generadoEn }`; 500 con `{ error }` si falla la lectura de procesos. `asesores` solo si la vista tiene columna Asesor; `opcionesVerComo` solo para admin y dueño. |
| `GET /api/crm/contactos` | coordinador, asesor, admin, dueño | Sesión; `alcanceContactos` → 403 si `ninguno`. `cargarContactos(usuario)` → 200 `{ filas, asesores, fuentes, truncado, generadoEn }`. |

Ninguna recibe filtros: los filtros se aplican en memoria (D4). Así no hay parámetro que
pueda ensanchar el alcance: el único es `ver_como`, validado.

**Alcance en la base (lo grueso; `procesoEnVista` lo repite en el servidor):**
- Coordinación: `stage in ('request','scheduled','not_visited','lost')`, después
  `procesoEnVista` deja Solicitud, Coordinada y No realizada abiertos y Descartado sin
  asesor, y saca `clase_gratuita` (por etapa o por origen).
- Asesor: `assigned_to = <persona>`.
- Dueño: todos.
- Tareas: `status = 'pending'` y tipo en `TIPOS_TAREA_DE_PROCESO`; con vista de persona,
  además `assigned_to = <persona>`. Las tareas de un proceso fuera del alcance se descartan
  al armar las filas: nunca salen en la respuesta.
- Contactos (asesor): todos los contactos se leen en el servidor (868, una página), junto
  con sus procesos (`contact_id, assigned_to, stage, scheduled_date, created_at, id, …`) y
  las tasaciones del asesor (`appraisals`: **solo** `contact_id, assigned_to, user_id`, con
  `.or('assigned_to.eq.<id>,user_id.eq.<id>')` y `.not('contact_id','is',null)`; nunca
  `select('*')`, CLAUDE.md "tumbó la base"); `contactoVisible` decide y **solo los visibles** se arman y se mandan, con las
  tareas del asesor.
- Contactos (todas las vistas): `cargarContactos` hace la misma lectura (d) de D4, con el
  mismo corte (copia pendiente de coordinación más vieja menos 60 segundos), el mismo tope y
  el mismo `truncado`, en una segunda tanda después de las tareas pendientes. Sin eso, en
  Contactos del equipo una copia cuya hermana ya se completó aparecería como pendiente.

**Páginas.** `app/(dashboard)/crm/page.tsx` y `app/(dashboard)/contacts/page.tsx` pasan a ser
componentes de servidor: `getUser()`; sin sesión, el middleware ya redirige; abogado →
`redirect('/properties/review')` (hoy lo hace `/crm` en el navegador; en `/contacts` es nuevo:
hoy el abogado veía la pantalla vacía con un 403 de la API); otro rol sin vista → pantalla "No
tenés acceso al CRM" (o "No tenés acceso a Contactos"). Si la dirección trae los parámetros
viejos de `/crm`, la página responde con `redirect` a la dirección traducida
(`traducirParametrosViejos`) antes de cargar nada. Con `ver` en la dirección: si `vistaPara` da `ver_como_prohibido`
(un asesor o una coordinadora con un enlace del dueño), la página **ignora** `ver` y arma la
vista propia, sin leer nada de la otra persona; si da `persona_invalida`, arma la vista propia
y muestra "Esa persona no tiene una vista del CRM." (la ruta, en cambio, responde 403 y 400). Leen `ver` (uuid) de `searchParams`, llaman al mismo
servicio que la ruta y le pasan a `CarteraCRM`/`ContactosLista` el resultado plano, o
`{ error: true }` si falló (la pantalla muestra el error con "Reintentar", que llama a la
ruta). Ruta y página comparten `cargarCartera`: no hay dos lecturas que puedan divergir.

**Permisos, en una línea por rol:** coordinador → su vista, sus tareas, todos los contactos;
asesor → sus procesos, sus tareas, sus contactos (regla de la ficha), 403 con `ver_como`;
admin y dueño → todo, más `ver_como`; abogado, `agent`, `viewer`, otro → 403 / redirección.

### D7. "Ver como"

- `opcionesVerComo` = perfiles activos con rol coordinador o asesor, ordenados por nombre,
  con la etiqueta "Nombre · coordinación" o "Nombre · asesor". No hay dato de género: la
  maqueta escribió "asesora" para Florencia, la plataforma dice "asesor" para todos
  (Diferencias, 1). Las cuentas `@passmail.com` del dueño aparecen: son perfiles activos y él
  las usa justamente para ver cada perspectiva.
- Elegir → `aplicar({ ver: <id> })` del mismo `useFiltrosUrl` (D11) + `GET /api/crm/cartera?ver_como=<id>`
  con versionado de pedidos (`usePedidosVersionados`: si se eligen dos personas seguidas
  gana la última). Mientras llega, esqueleto. Error 400 → se vuelve a "Mi vista" con el
  mensaje de la spec; error 403 no debería verse (el selector solo existe para admin/dueño).
- La vista de otro es **solo lectura de lo que esa persona ve**: los datos y las tareas son
  los de ella (el servidor arma las filas con su `personaId`), sin "Seleccionar" ni "Lo que
  está trabado". Abrir una fila abre la ficha con los permisos de quien mira (el dueño), no
  con los de la persona elegida: no hay suplantación de sesión.
- Cambiar de vista limpia los filtros de etapa, asesor y trabado y vuelve a "Abiertos"
  (maqueta). Búsqueda y origen se conservan.

### D8. Componentes (`components/crm/cartera/`) y su correspondencia con la maqueta

| Componente | Maqueta (`cartera.js` / `cartera.css`) |
|---|---|
| `CarteraCRM` (cliente, estado + URL) | `pintar()` |
| `CabeceraCartera` (título, subtítulo, "Ver como", "Nuevo contacto") | `.cartera-cab`, `SUBTITULOS`, `VER_COMO` |
| `AvisoVerComo` | `.cartera-aviso` |
| `SegmentoAbiertos` | `segmento()` |
| `BarraEtapas` | `barraEtapas()`, `.be` |
| `FiltrosCartera` + `HojaFiltros` + `HojaFechas` + `FichasFiltros` | `.cartera-filtros`, `#cartera-hoja-filtros`, `#cartera-hoja-fechas`, `chipsActivos()` |
| `LoTrabado` | `trabadoHtml()`, `.tr` |
| `GrupoCartera` (cabecera, texto, "Ordenar por", "Seleccionar", pie) | `tarjetaLista()` |
| `CabeceraFilas`, `FilaProceso`, `DatoUltimoContacto`, `DatoProximoPaso`, `DatoAsesor` | `cabeceraFilas()`, `fila()`, `ultimoHtml()`, `proximoHtml()`, `asesorHtml()`, `.fp` |
| `PieCartera` ("Mostrando X de Y", "Cargar 25 más") | `pie()`, `.cartera-total` |
| `EstadosCartera` (cargando, error, vacíos, "Nada urgente") | `estados-lista.js` |
| `ContactosLista` | `listaContactos()` |

Las piezas reusan `ChipEtapa` (variante neutra), los estados vacío/error/esqueleto, la hoja
del celular y los íconos de `components/crm/ui/` del change de la ficha; lo que falte se
agrega ahí, no en `cartera/`. Los componentes no calculan: reciben filas y grupos ya armados
por `lib/crm/cartera.ts`. `FilaProceso` es un `<Link>` con `aria-label="Abrir la ficha de
{nombre}"` y `href` de D11; con "Seleccionar" activo pasa a ser un botón de selección
(mismo comportamiento que `DealsList`). "Seleccionar" reusa `BulkActionsBar` y el
`DELETE /api/deals/[id]` de hoy, con el mismo texto de confirmación.

### D9. Cómo se reemplaza la pantalla sin romper consumidores

Grep del 2026-11-26 (`grep -rn` sobre `app components lib`):

- `app/(dashboard)/crm/_components/*` lo importan `crm/page.tsx`, `crm/page.test.tsx`, los
  propios `DealsList.tsx` y `StagePipeline.tsx` (que se borran) y **`lib/crm/ficha.ts:9`**, que
  importa `CRM_STAGES` y `deriveCRMStage` de `crm-stages.ts` para `etapaDelCRM` (línea ~132,
  usada en la cabecera y en la lista de procesos de la ficha). Sus etiquetas tampoco son las de
  la spec: `crm-stages.ts` dice "No Realizada" y "Clase Gratuita", y `NOMBRE_ETAPA` dice "No
  realizada" y "Clase gratuita". Por eso, **antes de borrar**, `etapaDelCRM` pasa a usar
  `etapaCRM` + `NOMBRE_ETAPA` (test primero, que incluye que la ficha y la lista escriben igual
  cada una de las diez etapas); recién después se borra `crm-stages.ts`.
  `deriveCRMStage`/`getCRMStageInfo`/`CRM_STAGES` aparecen además en **comentarios** de
  `lib/leads/tags.ts:52`, `lib/crm/deal-activo.ts` y `app/globals.css:367` (este último nombra
  a `DealsList` como "molde" de una clase). Se borran `DealsList.tsx`, `StagePipeline.tsx`,
  `format.ts`, `types.ts`, `constants.ts` y `crm-stages.ts`; `etapaCRM` pasa a
  `lib/crm/etapas.ts`; los tres comentarios se actualizan para que no apunten a archivos que
  no existen. La tarea vuelve a correr el grep antes de borrar.
- `GET /api/deals` lo pide solo `crm/page.tsx` (el `POST` lo usa
  `components/pipeline/FormCoordinarTasacion.tsx`, desde `pipeline/new`). Queda sin
  consumidor de pantalla y **no se borra** (lo cubren tests y lo puede pedir un script);
  su `switch` de etapas pasa a `etapaCRM`. El tope de 1000 de sus contadores queda anotado
  en el código.
- `GET /api/contacts` lo pide solo `contacts/page.tsx` (el `POST` lo usan `contacts/new` y
  `ContactEditor`). Igual que el anterior: queda, con un comentario que dice que la lista
  ahora es `/api/crm/contactos` y por qué no se usa más (asesor + tope de 200).
- `/api/users/advisors` lo dejaba de usar el CRM; sigue en otras pantallas (no se toca).
- `/crm` y `/contacts` se enlazan desde `lib/nav/sections.ts`, `lib/nav/bottom-bar.ts` y
  `pipeline/page.tsx` (`redirect('/crm')`): las direcciones no cambian. No hay enlaces con
  parámetros viejos de `/crm`; para no romper un marcador guardado, la página traduce con un
  `redirect` (`traducirParametrosViejos`, D5) solo lo que cambió: `origin`→`origen`,
  `from`/`to`→`entro=rango`, y una etapa cerrada (`descartado`, `captada`) sin `seg` suma
  `seg=cerrados`. `etapa` y `asesor` se llaman igual y no se tocan (si contaran, la página se
  redirigiría a sí misma). El hook no puede hacerlo porque solo maneja sus propias claves.
- **Tests que se reescriben:** `app/(dashboard)/crm/page.test.tsx` (23 pruebas sobre la
  pantalla vieja). Lo que protegían se conserva en otro lugar: "un asesor con `?asesor=`
  igual pide solo lo suyo" y la identidad que falla cerrada → tests de la ruta y de
  `vistaPara` (ahora lo decide el servidor, no `/api/auth/me`); ráfaga, F5, "Limpiar todo",
  versionado y valores inventados en la URL → tests de `CarteraCRM` y de `leerFiltrosCartera`; "no
  ofrecer etapas que el rol no ve" → test de `BarraEtapas` por vista; la tarjeta "Deals" sale
  (la spec la prohíbe). `app/(dashboard)/contacts/page.test.tsx` (13 pruebas): versionado,
  identidad fail-closed (pasa al servidor), "nunca 'Sin contactos' si falló", "Reintentar" y
  "Limpiar todo con el buscador" → tests de `ContactosLista`. Ninguna prueba se borra sin
  que su protección quede escrita en otra (lista en la tarea 6.4).
- `app/(dashboard)/crm/loading.tsx` y `contacts/loading.tsx` pasan a dibujar el esqueleto
  nuevo.
- La ficha (`/contacts/[id]`, de `crm-ficha-y-llamadas`) suma "Volver" (D11); su tarea 11.1
  (el nombre como enlace en cada tarjeta de `/crm`) queda reemplazada por esta pantalla.
- `vitest.crm.config.ts` y `tsconfig.crm.json` suman `app/api/crm/**`, `components/crm/cartera/**`
  y `scripts/apply-crm-cartera-pg.ts` (`lib/crm/**`, `lib/nav` no: se agrega
  `lib/nav/**/*.test.ts`).

### D10. Celular y anchos

- **Un solo árbol, sin elegir por JavaScript** (mismo criterio que la ficha, D6 de ese
  change): la lista decide con *container queries* sobre su propio contenedor. Tabla con
  cabecera de columnas cuando el contenedor mide **44rem o más** (a 1280 con el menú abierto
  quedan ~992 px; a 1024 con el menú, ~736 px: tabla; a 390, tarjeta). La maqueta usaba
  `@media (min-width: 1024px)` sobre la ventana, que con el menú real de 15rem dejaría
  tarjetas a 1024 px aunque entren las columnas.
- En tarjeta: cada dato con su etiqueta ("Último contacto", "Próximo paso", "Asesor") a la
  izquierda (`.fp-etq`), la fila del asesor vacío ("—") oculta. Filtros: buscador a la vista
  y el resto en `HojaFiltros` (botón "Filtros" con la cantidad, sin contar la búsqueda).
  "Lo que está trabado" muestra solo título, número, base y botón.
- 44 px en todo lo tocable y 16 px en los campos, en celular y en toda pantalla táctil
  (`pointer: coarse`), como pide la spec vigente; con mouse desde 768 px, 36 px y 14 px.
- **Barra inferior del celular:** depende de la Open Question 2. Si el dueño confirma la de
  la maqueta, se cambia `PREFERENCIA_DE_DESTINOS` a `['/inicio', '/crm', '/contacts', …]`
  con su test (y vale para todos los roles que tienen esas pantallas); si no, no se toca. La
  tarea 7.4 no empieza sin esa respuesta.

### D11. Dirección, "Volver" y menú

- Claves en la dirección: `seg`, `etapa`, `origen`, `asesor`, `entro`, `desde`, `hasta`, `q`,
  `trabado`, `orden`, `colegas`, `ver`, **todas texto**. Lo que es fijo (etapas, orígenes,
  órdenes) va en `permitidos`, constante de módulo; lo que llega del servidor (asesores, ver)
  se valida en una `normalizar` de módulo que lee la lista vigente de un `ref` (si cambiara
  de identidad, el hook entra en un bucle de pedidos, `use-filtros-url.ts:186-201`); un
  asesor o un `ver` desconocido cae al defecto y se avisa. Se escriben con `useFiltrosUrl({ soloNavegador: true })`
  — `history.replaceState(null, …)`, **con `null`** (CLAUDE.md, Consultas: con el estado de
  Next la lista no se filtraba) — así cambiar un filtro no vuelve a pedir la página. `q` va
  con espera de 250 ms (`components/filters/use-borrador-con-espera.ts` y las tres reglas de
  `lib/filters/borrador-filtro.ts`).
- Cada fila enlaza a `/contacts/<id>?volver=<camino y búsqueda actuales, codificado>`. La
  ficha lee `volver` con `enlaceVolver` (D5) y dibuja "‹ Volver al CRM" o "‹ Volver a
  Contactos"; con `null` no dibuja nada. El enlace vuelve a la dirección guardada, así los
  filtros quedan como estaban (no se usa `router.back()`: si la ficha se abrió en otra
  pestaña, no habría a dónde volver).
- Título de la barra superior y sección marcada en el menú: `lib/nav` hoy decide por el
  camino (`/contacts/...` → "Contactos"). Se suma una función pura
  `seccionDeOrigen(pathname, volver)` en `lib/nav/` (con test) que, en `/contacts/<id>` con
  `volver` válido hacia `/crm`, devuelve "CRM"; el menú lateral, la barra inferior y la
  barra superior la usan. Sin `volver`, todo queda como hoy. `AppSidebar` hoy solo usa
  `usePathname` y su test lo simula así (`AppSidebar.test.tsx:10`): pasa a leer también
  `useSearchParams` y el test se actualiza en la misma tarea.

### D12. Pruebas

- **Módulos puros:** vitest, test primero (`lib/crm/etapas`, `ultimo-contacto`,
  `formato-fecha` ampliado, `horario-laboral` ampliado, `cartera-vista`, `cartera`, `cartera-trabado`,
  `contactos-cartera`, `cartera-url`, `lib/nav/seccion-de-origen`). Casos borde obligatorios
  (CLAUDE.md): listas vacías, nulos, duplicados, tildes en NFD, caracteres de regex en la
  búsqueda (`2*D`, `(`), fechas futuras y pasadas, la medianoche de Argentina (22:00 AR ya es
  mañana en UTC), rol sin permiso, `ver_como` de otro rol, datos con `'error'`.
- **Servicio y rutas:** con la base simulada, como `app/api/deals/`: cada rol, `ver_como` de
  cada tipo, abogado 403, falla de cada fuente (lista → 500; tareas o RPC → 200 con
  `fuentes`), y **la prueba de la red del asesor**: con datos de dos asesores, la respuesta
  del asesor A no contiene ningún id, nombre ni tarea del B (se busca el id del B en el JSON
  serializado).
- **Componentes** (happy-dom + Testing Library, `userEvent` sin reloj simulado; si el worker
  no arranca a los 60 s, se reintenta una vez): `CarteraCRM` (grupos por vista, filtros en
  la dirección, ráfaga, "Cargar 25 más" sin repetir, "Ver como" versionado), `FilaProceso`
  (textos de cada estado, sin botones adentro), `LoTrabado` (error sin números),
  `ContactosLista`, `HojaFiltros` (foco al abrir y al cerrar).
- **Render:** `scripts/cartera.probe.tsx` con `renderToStaticMarkup` de cada vista con datos
  fijos (estructura, textos exactos de la spec, nada con `opacity:0`).
- **Base:** `scripts/apply-crm-cartera-pg.ts` (D2) y la receta `scripts/_qa-cartera-datos.ts`
  (tarea 8.1).
- **Interfaz:** solo en la vista previa de Netlify con el navegador de Claude, a 390 y 1280
  px (y 1024 para el corte de la tabla), comparando contra `maqueta/capturas/`.
- Comandos: `npx vitest run --config vitest.crm.config.ts`, `npx tsc --noEmit -p
  tsconfig.crm.json`, `npx eslint <archivos tocados>`.

## Diferencias con lo aprobado

Cada una es una consecuencia de los datos o del código real; ninguna cambia lo que la maqueta
decide. Se le nombran al dueño al abrir el PR (tarea 1.4).

1. **"Nombre · asesor" para todos.** La maqueta dice "Florencia Ledesma · asesora"; la
   plataforma no guarda el género. Mismo texto en el aviso: "Florencia Ledesma (asesor)".
2. **"Mi vista (admin)"** para el rol admin; la maqueta solo dibujó al dueño.
3. **"Cierre" sin motivo.** La maqueta muestra "Firmó la autorización de venta" debajo; ese
   dato no existe en la base (spec vigente: "Nada de adorno").
4. **Propiedad más corta.** El tipo está vacío en 886 de 984 procesos: la fila dice "Barrio ·
   dirección" o solo la dirección.
5. **Los grupos urgentes también paginan de a 25**, con su número en la cabecera. La maqueta
   los mostraba enteros porque eran dos o tres; con los datos reales podrían ser decenas.
6. **"Sin contacto registrado"** (texto nuevo) para los procesos anteriores a la ficha (el dueño
   aceptó la opción por defecto de la Open Question 1 el 2026-11-26).
7. **Cerrados de la coordinación = descartados sin asesor** (lo que hacía la maqueta), sin
   los de la clase gratuita (respuesta 3 del dueño). Nunca se le preguntó: se le nombra como
   supuesto.
8. **Comprador cuenta como abierto** en la cartera (la maqueta lo pone en la barra del asesor y
   en "Fuera del embudo"). Lo que ve cada pantalla: en la lista, la fila dice "Comprador" con
   su próximo paso; en la ficha, la etapa "Comprador" figura en su bloque de procesos, pero no
   es el "proceso activo" de la cabecera (ahí manda la solicitud o el proceso de venta abierto,
   porque la cadencia de llamadas es de la tasación). No se cambia la ficha: son dos preguntas
   distintas ("¿está abierto?" y "¿a qué proceso le registro la llamada?").
9. **Las tablas se arman por el ancho de la lista, no de la ventana** (D10): a 1024 px con el
   menú abierto se ve tabla.
10. **La barra inferior** queda como hoy (Open Question 2: el dueño eligió no tocarla el
    2026-11-26).
11. **El asesor ve también una Solicitud o una Clase gratuita a su nombre**, y su barra suma
    esa etapa solo si tiene alguna. La maqueta no las dibujaba (no había ejemplos) y el código
    de hoy se las esconde; esconderlas dejaría procesos suyos sin aparecer en ningún lado.
12. **Tasación que ya pasó sin resultado** (texto nuevo, "Cargar el resultado de la
    tasación"): 13 de las 15 Coordinadas de hoy están así; la maqueta solo tenía tasaciones
    futuras.
13. **Tareas repetidas de la coordinación** se muestran una vez con "· coordinación" (D3); la
    maqueta tenía una sola coordinadora.
14. **"antes del registro de llamadas"** debajo de un último contacto viejo, mientras corre el
    plazo de la Open Question 1 (texto nuevo).
15. **53 procesos coordinados sin día figuran como "Solicitud"** (regla de hoy,
    `deriveCRMStage`): no es nuevo, pero la coordinadora los va a ver en su lista.
16. **La ficha y la lista, en las solicitudes anteriores al registro.** La lista dice "Sin
    contacto registrado" en gris (pregunta 1); la cabecera de la ficha de hoy diría "Sin
    contacto todavía" con alerta roja. Para que digan lo mismo, la ficha tiene que usar
    `anteriorAlRegistro` (lo agrega este change al mismo módulo) en su cabecera: es un
    cambio de `crm-ficha-y-llamadas` que se le pide en la tarea 1.2; si no se hace, se le
    nombra al dueño como diferencia. **Resuelta en este change (tarea 1.2(c), 2026-11-26):**
    `armarFicha` (`lib/crm/ficha.ts`) dice "Sin contacto registrado", sin alerta, cuando no
    hay contacto anotado y el proceso activo es anterior al registro; ficha y lista coinciden.

## Risks / Trade-offs

- **[El dueño ve la ficha con su propio permiso desde "Ver como"]** → es lo que pide la spec
  ("solo para revisar"); la ficha de un asesor puede mostrarle al dueño más que lo que ve el
  asesor. Escrito en D7.
- **[Peso de la respuesta]** ~450 KB sin comprimir para el dueño hoy → si pasa de 1 MB
  (medido en la vista previa, tarea 9.4), las cerradas viajan sin `telefono`, `propiedad` ni
  `tasacion`; si pasa el tope de 3000 filas, `truncado` lo dice y se pasa a paginar en el
  servidor detrás de la misma `FilaCartera`.
- **[Una persona con dos procesos abiertos]** (48 hoy) → la fila es del proceso, pero la
  ficha que abre elige su "proceso activo" (el más nuevo): puede mostrar arriba otro proceso
  que el de la fila. Aceptado: la ficha lista todos sus procesos.
- **[Tareas pendientes colgadas de procesos cerrados]** (98 hoy) → los cerrados no muestran
  próximo paso; esas tareas siguen apareciendo en Pendientes como hoy. No se tocan acá.
- **[Lista vieja]** los datos se cargan al abrir → se recargan al volver a la pestaña tras 5
  minutos y con "Reintentar"; una llamada registrada en la ficha se ve al volver (la vuelta
  carga la página de nuevo).
- **[Reloj del navegador]** los textos relativos se calculan con la hora del teléfono → la
  elección del próximo paso la hace el servidor; un reloj corrido solo mueve el texto
  ("hace 2 h" en vez de "hace 3 h"). Aceptado, como en la ficha.
- **[`INICIO_REGISTRO_CONTACTOS` mal puesto]** → si quedara antes del deploy real, vuelven
  los falsos "sin primer contacto"; si quedara muy después, se esconden solicitudes reales.
  La tarea 1.2 lo fija con la fecha del merge de la ficha y la 8.2 lo verifica con datos.
- **[En Contactos, la visita de otro asesor]** el último contacto es de la persona, no del
  proceso → un asesor puede ver "hace N días · Visita de tasación" de una visita hecha en un
  proceso de otro asesor. Solo viaja el instante y el texto "Visita de tasación" (ni el proceso,
  ni la dirección, ni el asesor), y coincide con lo que dice la cabecera de la ficha. Aceptado.
- **[Las visitas de los históricos]** `visited_at` de los importados es la fecha que vino de
  la importación → "Último contacto: hace 6 meses · Visita de tasación" es lo que dicen los
  datos. Aceptado.
- **[La función de la base y el código no salen juntos]** → la función se aplica primero
  (no la usa nadie hasta el deploy) y el código la espera; si el deploy se revierte, la
  función queda sin uso y no molesta.
- **[`GET /api/contacts` y `GET /api/deals` quedan con sus defectos]** sin consumidor de
  pantalla → comentario en el código; si algún día se los vuelve a usar, hay que arreglar
  el alcance del asesor y los topes.

## Migration Plan

1. `crm-ficha-y-llamadas` mergeado y desplegado; anotar la fecha (tarea 1.2).
2. Migración `…_crm_cartera.sql` aplicada en `mncsnastmcjdjxrehdep` con
   `scripts/apply-crm-cartera-pg.ts` (dos corridas) y verificada con `select` (tarea 2.3),
   **antes** de cualquier código que la llame.
3. Código en la rama, PR en borrador para tener la vista previa desde el principio.
4. QA en la vista previa (grupo 9), auditoría doble (grupo 11), merge con
   `gh pr merge --rebase`, humo en producción (grupo 10).
5. Sin variables de entorno nuevas, sin `pg_cron`.
6. **Vuelta atrás:** `git revert` del merge y push; la pantalla vieja vuelve tal cual (sus
   archivos vuelven con el revert). La función y el índice se pueden quedar (no los usa
   nadie); si se quiere sacarlos: `DROP FUNCTION public.crm_ultimos_contactos(uuid[]);
   DROP INDEX public.idx_deals_contact_id;`.

## Open Questions

**Resueltas por el dueño el 2026-11-26 ("Ok a las 4, seguí"): se construye la opción por
defecto de las cuatro** — contar desde la salida de la ficha, no tocar la barra de abajo del
celular, fin del horario laboral a las 18:00, y los procesos sin asesor del sistema anterior
cuentan como trabados. Se le avisó del efecto de los 14 días sobre los 100 seguimientos.

Solo lo que tiene que decidir el dueño; todo lo técnico quedó decidido arriba. Cada pregunta
tiene una opción por defecto, que es la que se construye si no contesta antes de la tarea que
la usa.

1. **¿Qué hacemos con lo que pasó antes del CRM nuevo?** Las llamadas recién se anotan desde
   que sale la ficha. Con los datos de hoy, sin una fecha de corte, el día que sale la lista
   dice que **las 185 solicitudes** están "sin primer contacto" (la más vieja, de septiembre
   de 2025, primera) y que **los 100 seguimientos** están "sin movimiento". **Por defecto:**
   contar solo desde la salida de la ficha — una solicitud de antes sin contactos anotados va
   con el resto y dice "Sin contacto registrado", y los 14 días de "sin movimiento" empiezan a
   contar desde esa fecha. Lo que eso significa en la práctica: (a) "Lo que está trabado"
   cuenta solo las solicitudes nuevas y dice aparte "Además, 185 anteriores al registro de
   llamadas, sin dato"; (b) esas 185 quedan al final de la lista de la coordinación, de la más
   vieja a la más nueva, cada una con "Sin fecha"; (c) **dos semanas después de la salida, los
   100 seguimientos pasan juntos a "sin movimiento"** si nadie anota una llamada en ellos. Al
   elegir los 14 días viste un ejemplo con 61 de 100; con los datos reales son los 100. **La
   otra opción:** contar todo como está desde el primer día. Y si querés, antes de la salida
   se pueden revisar y descartar en tanda las solicitudes viejas que ya no sirven (sería otro
   pedido). (Para quien construye: la usa la tarea 3.2.)
2. **La barra de abajo del celular.** La maqueta la dibuja con Inicio, CRM, Contactos y Menú
   para todos, y decía que hoy es "Inicio, Pendientes, Contacto y Menú". En realidad hoy es
   **Inicio, Pendientes, Inbox y Consultas** (CRM salió en octubre para que entrara
   Consultas). Ponerla como en la maqueta saca de la barra Pendientes, Inbox y Consultas a
   coordinación, asesores y dueño (siguen en el menú). **Por defecto:** no tocar la barra
   hasta que respondas. (Para quien construye: la usa la tarea 7.4.)
3. **¿A qué hora termina el horario laboral?** "Lo que está trabado" dice cuánto espera una
   solicitud "de reloj" y "hábiles" (lunes a viernes desde las 9:00; el sábado no cuenta).
   **Por defecto: hasta las 18:00**, como en la maqueta. (Para quien construye: la usa la
   tarea 3.3.)
4. **Los procesos sin asesor que vinieron del sistema anterior.** Hoy hay **113 procesos**
   que ya pasaron la solicitud y no tienen asesor; la mayoría son importados (Histórico). El
   día que salga, "Procesos sin asesor" va a decir 113 en rojo. **Por defecto:** contarlos
   todos, porque es verdad que nadie los tiene, y que se vayan asignando o cerrando desde la
   lista. **La otra opción:** contar solo los que no son históricos y mostrar los históricos en
   un renglón aparte ("y M del sistema anterior"). (Para quien construye: la usa la tarea 3.7.)
