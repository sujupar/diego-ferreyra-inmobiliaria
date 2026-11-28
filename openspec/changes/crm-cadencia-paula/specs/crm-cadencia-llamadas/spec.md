# Spec Delta

## ADDED Requirements

### Requirement: Tres no atendidas seguidas piden un WhatsApp
Cuando la llamada "No atendió" que se registra es la tercera o posterior seguida del
proceso, el sistema SHALL crear la tarea "Enviar WhatsApp a {nombre}", de tipo mensaje, en
lugar de otra tarea de llamada, salvo en las excepciones de «Qué regla gana cuando se cruzan
dos». Vence en el momento del registro si fue un día hábil entre las 10:00 y las 14:00 de
Argentina (se manda ya); antes de las 10:00 de un día hábil, ese día a las 10:00; si no, el
día hábil siguiente a las 10:00.

#### Scenario: Tercera no atendida en horario
- **WHEN** después de dos "No atendió" seguidas se registra un miércoles a las 10:20 "Llamada 3 · No atendió"
- **THEN** existe una tarea pendiente "Enviar WhatsApp a María López" de tipo mensaje que vence ese miércoles a las 10:20, y no se creó ninguna tarea "Llamada 4"

#### Scenario: Tercera no atendida fuera de horario
- **WHEN** la tercera "No atendió" seguida se registra un miércoles a las 16:00
- **THEN** la tarea "Enviar WhatsApp" vence el jueves a las 10:00

#### Scenario: Ya hay una tarea de WhatsApp pendiente
- **WHEN** se registra una cuarta "No atendió" seguida y la tarea "Enviar WhatsApp" que creó la cadencia para ese proceso sigue pendiente
- **THEN** no se crea otra tarea y el aviso dice "Ya hay una tarea pendiente de enviarle WhatsApp: no se crea otra."

#### Scenario: La tarea de WhatsApp se completó con el tilde, sin marcar el WhatsApp
- **WHEN** la tarea "Enviar WhatsApp" que creó la cadencia se marcó como hecha con el tilde, nadie tocó "Marcar WhatsApp enviado", y se registra otra "No atendió" seguida
- **THEN** se crea otra tarea "Enviar WhatsApp a {nombre}", y no una tarea de llamada: el tilde solo no termina la secuencia

#### Scenario: Un mensaje agendado a mano no frena la cadencia
- **WHEN** se registra la tercera "No atendió" seguida y el proceso tiene pendiente una tarea de tipo mensaje creada a mano con "+ Tarea"
- **THEN** igual se crea la tarea "Enviar WhatsApp a {nombre}" de la cadencia

## MODIFIED Requirements

### Requirement: Una llamada no atendida agenda la siguiente
Cuando se registra una llamada "No atendió" y es la primera o la segunda no atendida seguida
del proceso, el sistema SHALL crear una tarea de llamada titulada "Llamada N+1 a {nombre}",
asignada a quien registró la llamada y ligada al proceso y al contacto, salvo en las
excepciones de «Qué regla gana cuando se cruzan dos». Es el proceso de la coordinación
(dueño, 2026-11-28): tres llamadas antes del WhatsApp, en su horario de 10 a 14. La Llamada 2
SHALL quedar para ese mismo día a las 13:30 si la Llamada 1 se registró un día hábil antes de
las 12:00 de Argentina; si no, para el día hábil siguiente a las 10:00. La Llamada 3 SHALL
quedar para el día hábil siguiente a las 10:00.

#### Scenario: Primera llamada no atendida
- **WHEN** una coordinadora registra un martes a las 13:00 la primera llamada a María López como "No atendió"
- **THEN** existe una tarea pendiente "Llamada 2 a María López", de tipo llamada, para el miércoles a las 10:00, asignada a esa coordinadora, con el `deal_id` del proceso y el `contact_id` del contacto

#### Scenario: Se ve en la ficha
- **WHEN** se guarda esa llamada
- **THEN** el aviso dice "Se agendó Llamada 2 para mañana 10:00." y la tarea aparece en el bloque Tareas sin recargar

#### Scenario: Asesor registra en su proceso
- **WHEN** un asesor registra "No atendió" en un contacto cuyo proceso activo está asignado a él
- **THEN** la tarea "Llamada 2" queda asignada a ese asesor y la ve en el bloque Tareas de la ficha

#### Scenario: El aviso cuando no es mañana
- **WHEN** se guarda la primera "No atendió" un viernes 27 de noviembre a las 15:00
- **THEN** el aviso dice "Se agendó Llamada 2 para lun 30 nov, 10:00." (día de la semana, día, mes y hora), y no "mañana"

#### Scenario: Primera llamada a la mañana
- **WHEN** la coordinadora registra un martes a las 10:40 la Llamada 1 como "No atendió"
- **THEN** la tarea "Llamada 2" queda para ese martes a las 13:30 y el aviso dice "Se agendó Llamada 2 para hoy 13:30."

#### Scenario: Segunda no atendida
- **WHEN** después de "Llamada 1 · No atendió" se registra un martes a las 13:30 "Llamada 2 · No atendió"
- **THEN** existe la tarea "Llamada 3 a María López" para el miércoles a las 10:00, y no una de WhatsApp

### Requirement: Día hábil siguiente en hora de Argentina
El "día hábil siguiente" SHALL ser el próximo día de lunes a viernes posterior al día en
que se registra el intento, calculado con el calendario de Argentina, sin tener en cuenta
feriados. La hora de la tarea SHALL ser las 10:00 de Argentina, el inicio del horario de la coordinación
(10 a 14).

#### Scenario: Viernes
- **WHEN** se registra una "No atendió" un viernes
- **THEN** la tarea queda para el lunes siguiente a las 10:00

#### Scenario: Sábado o domingo
- **WHEN** se registra una "No atendió" un sábado o un domingo
- **THEN** la tarea queda para el lunes siguiente a las 10:00

#### Scenario: Lunes a jueves
- **WHEN** se registra una "No atendió" un miércoles
- **THEN** la tarea queda para el jueves a las 10:00

#### Scenario: De noche en Argentina
- **WHEN** se registra una "No atendió" un martes a las 22:30 de Argentina, cuando en hora universal ya es miércoles
- **THEN** la tarea queda para el miércoles a las 10:00, no para el jueves

#### Scenario: Feriado
- **WHEN** el día hábil siguiente es feriado
- **THEN** la tarea queda igual para ese día (los feriados quedan fuera de este change)

### Requirement: Un asesor sobre un proceso que no es suyo no mueve la cola de otros
Cuando un asesor registra sobre un proceso activo que no está asignado a él (es de otro
asesor, o no tiene asesor), el sistema SHALL guardar la llamada o el WhatsApp marcado,
ligado a ese proceso, pero SHALL NOT crear la tarea siguiente de la secuencia ni completar
tareas de otras personas. "Volver a llamar" SHALL crear igual su tarea, a nombre del
asesor. Con "No atendió" o WhatsApp marcado, el aviso MUST decir que el proceso lo lleva
otra persona. Ningún botón del aviso lleva a ese proceso.

#### Scenario: No atendió sobre una solicitud sin asesor
- **WHEN** un asesor registra "No atendió" en un contacto que creó él, cuyo proceso activo es una solicitud del embudo sin asesor, con la tarea de entrada pendiente para cada coordinador
- **THEN** la llamada se guarda como "Llamada 1" con el `deal_id` de esa solicitud, no se crea la tarea "Llamada 2", las tareas de entrada de los coordinadores siguen pendientes, y el aviso dice "Quedó anotada. Este proceso lo lleva otra persona: no se agenda la siguiente ni se cierran las tareas de esa persona."

#### Scenario: No atendió sobre el proceso de otro asesor
- **WHEN** un asesor registra "No atendió" en un contacto que puede ver por un proceso viejo suyo, y el proceso activo está asignado a otro asesor
- **THEN** pasa lo mismo: la llamada queda, no hay tarea nueva y no cambia ninguna tarea del otro asesor ni de la coordinación

#### Scenario: Volver a llamar sobre un proceso ajeno
- **WHEN** ese asesor registra "Atendió · volver a llamar" con el día de hoy y una hora que todavía no pasó
- **THEN** se crea la tarea "Llamar a {nombre}" asignada a él, la ve en el bloque Tareas de su ficha sin recargar, y las tareas de otras personas siguen como estaban; si abre esa tarea desde `/tasks` (que lista las pendientes de hoy o anteriores, no las de mañana), llega a la ficha de la persona y no a la pantalla del proceso ajeno

#### Scenario: Cierra solo lo suyo
- **WHEN** ese asesor tiene pendiente esa tarea "Llamar a {nombre}" y registra otra llamada sobre el mismo proceso ajeno
- **THEN** su tarea queda completada y el aviso lo dice; ninguna otra tarea cambia

#### Scenario: WhatsApp marcado sobre un proceso ajeno
- **WHEN** ese asesor marca "WhatsApp enviado"
- **THEN** el registro queda guardado, la tarea "Enviar WhatsApp" de la coordinación sigue pendiente y el aviso es el mismo de "Quedó anotada…"

#### Scenario: El intento cuenta para quien lleva el proceso
- **WHEN** después de esa "No atendió" del asesor, la coordinadora registra otra "No atendió" sobre el mismo proceso
- **THEN** la de la coordinadora se lee "Llamada 2", cuenta como segunda no atendida seguida y crea la tarea "Llamada 3 a {nombre}" asignada a la coordinadora

#### Scenario: Los demás resultados no llevan el texto de "Quedó anotada"
- **WHEN** ese asesor registra sobre el proceso ajeno "Atendió · volver a llamar", "Atendió y agendó", "Atendió · no le interesa" o "Número equivocado"
- **THEN** el aviso es el de ese resultado (la tarea agendada, o lo que se ofrece), sin el texto "Quedó anotada…", sin ningún botón que lleve al proceso, y nombra solo las tareas propias que se hayan cerrado

#### Scenario: La coordinación llama después del "volver a llamar" de un asesor
- **WHEN** ese asesor tiene pendiente la tarea "Llamar a {nombre}" que nació de su "volver a llamar" sobre el proceso ajeno, y la coordinadora registra una llamada sobre ese proceso
- **THEN** la tarea del asesor queda completada, igual que cualquier llamada pendiente de la cadencia, y el aviso de la coordinadora dice "Se completó sola la tarea «Llamar a {nombre}»."; una llamada que el asesor se haya agendado a mano sigue pendiente

#### Scenario: Coordinación y dueños nunca son ajenos
- **WHEN** una coordinadora, un admin o un dueño registra una llamada sobre el proceso de cualquier asesor
- **THEN** la cadencia corre completa, como en el resto de esta spec

### Requirement: Si la tarea no se pudo crear, la llamada igual queda
Si la llamada se guarda pero falla la creación o el cierre de tareas, el sistema SHALL
conservar la llamada, avisar en pantalla qué faltó y ofrecer "Reintentar". Reintentar MUST
NOT crear una tarea duplicada, SHALL usar los datos de la llamada original (su resultado, el
día y la hora pedidos, el momento en que se cargó y quién la cargó) y SHALL NOT hacer nada
si esa llamada ya no es el intento más reciente del proceso.

#### Scenario: Falla la creación de la tarea
- **WHEN** se guarda una "No atendió" y la creación de la tarea falla
- **THEN** la llamada aparece en la actividad y el aviso dice que la llamada quedó guardada pero no se pudo agendar la siguiente, con un botón "Reintentar"

#### Scenario: Reintentar funciona
- **WHEN** se toca "Reintentar" y esta vez la tarea se crea
- **THEN** el aviso pasa a decir "Se agendó Llamada 2 para …" y en la base hay una sola tarea creada por esa llamada

#### Scenario: Reintentar la segunda "No atendió"
- **WHEN** la segunda "No atendió" seguida creó la tarea "Llamada 3 a {nombre}" pero falló el cierre de otra tarea, y se toca "Reintentar"
- **THEN** sigue habiendo una sola tarea "Llamada 3" creada por esa llamada y el aviso dice "Se agendó Llamada 3 para …"

#### Scenario: Reintentar dos veces
- **WHEN** se dispara dos veces el reintento de la misma llamada
- **THEN** en la base sigue habiendo una sola tarea creada por esa llamada

#### Scenario: Reintentar un "volver a llamar"
- **WHEN** falla la tarea de una llamada "Atendió · volver a llamar" pedida para el jueves a las 16:00 y se toca "Reintentar"
- **THEN** se crea la tarea "Llamar a {nombre}" para el jueves a las 16:00, sin volver a pedir el día ni la hora

#### Scenario: Reintentar al día siguiente
- **WHEN** falla la tarea de una "No atendió" cargada un martes y el reintento se hace el miércoles
- **THEN** la tarea queda para el miércoles a las 10:00 (el día hábil siguiente al martes) y se ve como vencida

#### Scenario: Reintenta otra persona
- **WHEN** la llamada la cargó la coordinadora A y el reintento lo toca la coordinadora B
- **THEN** la tarea queda asignada a la coordinadora A, y las tareas que se cierran se eligen como si reintentara la coordinadora A

#### Scenario: Reintentar cuando ya hubo otra llamada
- **WHEN** se pide el reintento de una llamada y después de ella ya se registró otro intento en ese proceso
- **THEN** no se crea ni se cierra ninguna tarea, y las tareas que creó el intento posterior siguen pendientes

#### Scenario: Llega tarde la repetición de un guardado que sí agendó
- **WHEN** una "No atendió" creó su tarea "Llamada 2", después se registró otro intento, y recién entonces llega repetido por la red el guardado original
- **THEN** la respuesta trae esa misma tarea como creada y no dice que la llamada quedó fuera de orden; no se crea ni se cierra nada nuevo

#### Scenario: Entre el guardado y el reintento entró otra solicitud
- **WHEN** falla la tarea de una "No atendió" cargada sobre una solicitud, después la persona manda otra solicitud (que pasa a ser su proceso más reciente) y recién entonces se toca "Reintentar"
- **THEN** la tarea "Llamada 2" queda ligada al proceso de la llamada original, no al nuevo, y todo se decide mirando ese proceso

#### Scenario: Reintentar con el identificador de otro contacto
- **WHEN** alguien que puede ver el contacto X pide el reintento usando el identificador de una llamada de otro contacto
- **THEN** responde 404 y no cambia ninguna tarea

## REMOVED Requirements

### Requirement: Dos no atendidas seguidas piden un WhatsApp
**Reason**: La coordinación hace tres llamadas antes del WhatsApp (dueño, 2026-11-28).
**Migration**: Reemplazado por «Tres no atendidas seguidas piden un WhatsApp». Las tareas ya creadas con la regla vieja quedan como están.
