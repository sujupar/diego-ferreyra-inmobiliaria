# Spec Delta

## ADDED Requirements

### Requirement: Tres no atendidas seguidas piden un WhatsApp
Cuando la llamada "No atendió" que se registra es la tercera o posterior seguida del
proceso, el sistema SHALL crear la tarea "Enviar WhatsApp a {nombre}", de tipo mensaje, en
lugar de otra tarea de llamada, salvo en las excepciones de «Qué regla gana cuando se cruzan
dos». Vence según «Cuándo vence el WhatsApp».

#### Scenario: Tercera no atendida en horario
- **WHEN** después de dos "No atendió" seguidas se registra un miércoles a las 10:20 "Llamada 3 · No atendió"
- **THEN** existe una tarea pendiente "Enviar WhatsApp a María López" de tipo mensaje que vence ese miércoles a las 10:20, el aviso dice "Se agendó Enviar WhatsApp para ahora." y no se creó ninguna tarea "Llamada 4"

#### Scenario: El WhatsApp se ve para hacer ya
- **WHEN** se crea esa tarea en horario
- **THEN** en la ficha, en Pendientes y en la campanita figura entre las vencidas ("Vencida hace 1 min" o similar): es para hacer en ese momento

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

### Requirement: Cuándo vence el WhatsApp
La tarea "Enviar WhatsApp" de la cadencia SHALL vencer en el momento en que se cargó la
llamada si fue un día hábil de 10:00 a 13:59 de Argentina (se manda ya); antes de las 10:00
de un día hábil, ese día a las 10:00; si no, el día hábil siguiente a las 10:00. Es la misma
regla que el vencimiento de la tarea de entrada de un lead.

#### Scenario: Antes del horario
- **WHEN** la tercera "No atendió" seguida se carga un miércoles a las 8:30
- **THEN** la tarea "Enviar WhatsApp" vence ese miércoles a las 10:00

## MODIFIED Requirements

### Requirement: El WhatsApp marcado termina la secuencia
Marcar "WhatsApp enviado" SHALL NOT crear ninguna tarea, y una llamada "No atendió"
registrada después de ese WhatsApp, dentro de la misma racha, tampoco. Los avisos MUST decir
solo cosas que son verdad en la plataforma de hoy: el bloque «Sin respuesta» del Inicio
todavía no existe (llega con el change `crm-inicio`), así que hasta entonces no se nombra.

#### Scenario: Marcar el WhatsApp
- **WHEN** después de tres "No atendió" se marca "WhatsApp enviado"
- **THEN** no se crea ninguna tarea y el aviso dice "La secuencia termina acá: no se crea ninguna tarea más." y "Si no contesta y querés seguirla, agendá una con «+ Tarea»."

#### Scenario: Intento posterior al WhatsApp
- **WHEN** después de ese WhatsApp marcado se registra otra llamada "No atendió"
- **THEN** la llamada se guarda con su número, no se crea ninguna tarea y el aviso dice "Ya se le mandó WhatsApp: no se crea otra tarea. Si querés seguirla, agendá una con «+ Tarea»."

#### Scenario: WhatsApp marcado sin llamadas previas
- **WHEN** en un proceso sin ninguna llamada se marca "WhatsApp enviado" y después se registra una llamada "No atendió"
- **THEN** la llamada se guarda como "Llamada 1", no se crea ninguna tarea y el aviso dice "Ya se le mandó WhatsApp: no se crea otra tarea. Si querés seguirla, agendá una con «+ Tarea»."

#### Scenario: Atendió, después WhatsApp, después no atendió
- **WHEN** el historial es "Atendió · volver a llamar", WhatsApp marcado, y se registra una "No atendió"
- **THEN** no se crea ninguna tarea, porque el WhatsApp es posterior a la última vez que atendió y sigue dentro de la racha

#### Scenario: No se nombra una pantalla que no existe
- **WHEN** se leen todos los avisos de la ficha antes de que exista el Inicio nuevo
- **THEN** ninguno menciona «Sin respuesta» del Inicio

#### Scenario: La solicitud sigue a la vista
- **WHEN** una solicitud termina la secuencia y queda sin ninguna tarea pendiente
- **THEN** el proceso sigue en etapa Solicitud y sigue apareciendo en la columna Solicitud del CRM

### Requirement: Registrar una llamada cierra lo pendiente de ese proceso
Al registrar una llamada, con cualquier resultado, el sistema SHALL completar las tareas
pendientes del proceso (o ligadas solo al contacto) que esa llamada resuelve: las de
"actualizar contacto" sin tasación vinculada, las de llamada de la cadencia, las de llamada
de cualquier coordinador y las de quien registra. Si la llamada fue atendida, SHALL
completar además la tarea "Enviar WhatsApp" de la cadencia, salvo en las dos excepciones
de «Cuándo un registro no cierra tareas».

#### Scenario: Tarea de entrada de todos los coordinadores
- **WHEN** entra un lead que genera una tarea de entrada para cada uno de los dos coordinadores, y uno de ellos registra la primera llamada
- **THEN** las dos tareas de entrada quedan completadas, también la del coordinador que no llamó

#### Scenario: Tarea creada por el agente de tasación
- **WHEN** el proceso tiene pendiente la tarea "Llamar para coordinar tasación: María López" que creó el agente de WhatsApp para cada coordinador, y se registra una llamada
- **THEN** esas tareas quedan completadas y el aviso nombra cada una

#### Scenario: Tarea de "actualizar contacto" ligada a una tasación
- **WHEN** el proceso tiene pendiente la tarea "Actualizar contacto" que se crea cuando el asesor arma una tasación, y se registra una llamada
- **THEN** esa tarea sigue pendiente

#### Scenario: Tarea de la cadencia de otra persona
- **WHEN** la tarea "Llamada 2" la creó la cadencia para la coordinadora A y la llamada la registra la coordinadora B
- **THEN** la tarea de A queda completada y, si corresponde una nueva, queda asignada a B

#### Scenario: Llamada que otra coordinadora se agendó a mano
- **WHEN** la coordinadora A tiene una tarea de llamada creada a mano sobre ese proceso y la coordinadora B registra una llamada
- **THEN** la tarea de A queda completada

#### Scenario: Se avisa qué se cerró
- **WHEN** una llamada completa una tarea
- **THEN** el aviso dice "Se completó sola la tarea «…»." por cada una

#### Scenario: La llamada que un asesor se agendó a mano no se toca
- **WHEN** un asesor tiene una tarea de llamada que creó él a mano sobre ese proceso y la coordinadora registra una llamada
- **THEN** la tarea del asesor sigue pendiente

#### Scenario: Atendió con la tarea de WhatsApp pendiente
- **WHEN** después de tres "No atendió" existe la tarea "Enviar WhatsApp a María López" de la cadencia y se registra "Atendió · volver a llamar"
- **THEN** esa tarea queda completada, el aviso lo dice, y queda pendiente solo la tarea "Llamar a María López"

#### Scenario: No atendió con la tarea de WhatsApp pendiente
- **WHEN** existe esa misma tarea y se registra otra "No atendió"
- **THEN** la tarea "Enviar WhatsApp" sigue pendiente

#### Scenario: Tareas de otro tipo
- **WHEN** el proceso tiene pendientes una tarea de visita y una de documentación y se registra una llamada
- **THEN** esas dos tareas siguen pendientes

#### Scenario: Tareas de otro proceso
- **WHEN** el contacto tiene tareas de llamada pendientes en otro proceso y se registra una llamada en el proceso activo
- **THEN** las tareas del otro proceso siguen pendientes

#### Scenario: Dos solicitudes abiertas de la misma persona
- **WHEN** la persona mandó dos veces el formulario de tasación, tiene dos solicitudes abiertas, cada una con su tarea de entrada para cada coordinador, y se registra una llamada
- **THEN** la llamada queda ligada a la solicitud más nueva y se completan las tareas de entrada de esa; las de la solicitud anterior siguen pendientes y esa solicitud sigue abierta, listada en "Procesos" para coordinarla o descartarla desde ahí

#### Scenario: El proceso se cierra con tareas de la cadencia pendientes
- **WHEN** un proceso con la tarea "Llamada 2" pendiente se descarta o se capta, desde la ficha o desde la pantalla del proceso
- **THEN** esa tarea sigue pendiente y se sigue viendo en el bloque Tareas de la ficha hasta que alguien la complete a mano; cerrar un proceso no completa ni descarta tareas

### Requirement: Una llamada no atendida agenda la siguiente
Cuando se registra una llamada "No atendió" y es la primera o la segunda no atendida seguida
del proceso, el sistema SHALL crear una tarea de llamada titulada "Llamada N+1 a {nombre}",
asignada a quien registró la llamada y ligada al proceso y al contacto, salvo en las
excepciones de «Qué regla gana cuando se cruzan dos». Es el proceso de la coordinación
(dueño, 2026-11-28): tres llamadas antes del WhatsApp, en su horario de 10 a 14. Se cuenta
por la racha (no por el número de la llamada): la llamada que sigue a la primera no atendida
de la racha SHALL quedar para ese mismo día a las 13:30 si esa no atendida se cargó un día
hábil antes de las 12:00 de Argentina, y si no, para el día hábil siguiente a las 10:00; la
que sigue a la segunda no atendida seguida SHALL quedar para el día hábil siguiente a las
10:00. Se decide con la hora en que se CARGÓ el intento (como toda la cadencia: un reintento
agenda igual que el guardado original), no con la hora corregida.

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

#### Scenario: A las 12:00 justas
- **WHEN** la Llamada 1 "No atendió" se carga un martes a las 12:00
- **THEN** la Llamada 2 queda para el miércoles a las 10:00

#### Scenario: Sábado a la mañana
- **WHEN** la Llamada 1 "No atendió" se carga un sábado a las 10:30
- **THEN** la Llamada 2 queda para el lunes a las 10:00

#### Scenario: Madrugada de un día hábil
- **WHEN** la Llamada 1 "No atendió" se carga un martes a las 7:30
- **THEN** la Llamada 2 queda para ese martes a las 13:30

#### Scenario: Hora corregida
- **WHEN** a las 12:30 se carga una Llamada 1 "No atendió" con la hora corregida a las 11:00
- **THEN** la Llamada 2 queda para el día hábil siguiente a las 10:00 (manda la hora de carga)

#### Scenario: Racha nueva después de atender
- **WHEN** el historial es "No atendió", "No atendió", "Atendió · volver a llamar", y un martes a las 10:40 se registra otra "No atendió"
- **THEN** es la primera no atendida de la racha: se crea "Llamada 5 a {nombre}" para ese martes a las 13:30

#### Scenario: Segunda no atendida
- **WHEN** después de "Llamada 1 · No atendió" se registra un martes a las 13:30 "Llamada 2 · No atendió"
- **THEN** existe la tarea "Llamada 3 a María López" para el miércoles a las 10:00, y no una de WhatsApp

### Requirement: Día hábil siguiente en hora de Argentina
El "día hábil siguiente" SHALL ser el próximo día de lunes a viernes posterior al día en
que se registra el intento, calculado con el calendario de Argentina, sin tener en cuenta
feriados. Cuando una tarea de la cadencia va al día hábil siguiente, SHALL quedar a las 10:00 de
Argentina, el inicio del horario de la coordinación (10 a 14). La Llamada 2 de la misma tarde
y el WhatsApp que vence en el momento siguen sus propias reglas.

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
