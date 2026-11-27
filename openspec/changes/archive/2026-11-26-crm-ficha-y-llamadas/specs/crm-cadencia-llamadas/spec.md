# Spec Delta

## Purpose

Define qué tarea se crea o se cierra sola cada vez que se registra un intento de contacto
(una llamada o un WhatsApp marcado), para que el paso siguiente de cada solicitud quede agendado sin depender de la memoria de nadie.

## ADDED Requirements

### Requirement: Una llamada no atendida agenda la siguiente
Cuando se registra una llamada "No atendió" y es la primera no atendida seguida del proceso,
el sistema SHALL crear una tarea de llamada titulada "Llamada N+1 a {nombre}" para el día
hábil siguiente a las 9:00 de Argentina, asignada a quien registró la llamada y ligada al
proceso y al contacto, salvo en las excepciones de «Qué regla gana cuando se cruzan dos».

#### Scenario: Primera llamada no atendida
- **WHEN** una coordinadora registra un martes la primera llamada a María López como "No atendió"
- **THEN** existe una tarea pendiente "Llamada 2 a María López", de tipo llamada, para el miércoles a las 9:00, asignada a esa coordinadora, con el `deal_id` del proceso y el `contact_id` del contacto

#### Scenario: Se ve en la ficha
- **WHEN** se guarda esa llamada
- **THEN** el aviso dice "Se agendó Llamada 2 para mañana 9:00." y la tarea aparece en el bloque Tareas sin recargar

#### Scenario: Asesor registra en su proceso
- **WHEN** un asesor registra "No atendió" en un contacto cuyo proceso activo está asignado a él
- **THEN** la tarea "Llamada 2" queda asignada a ese asesor y la ve en el bloque Tareas de la ficha

#### Scenario: El aviso cuando no es mañana
- **WHEN** se guarda la primera "No atendió" un viernes 27 de noviembre
- **THEN** el aviso dice "Se agendó Llamada 2 para lun 30 nov, 9:00." (día de la semana, día, mes y hora), y no "mañana"

### Requirement: Dos no atendidas seguidas piden un WhatsApp
Cuando la llamada "No atendió" que se registra es la segunda o posterior seguida del
proceso, el sistema SHALL crear la tarea "Enviar WhatsApp a {nombre}", de tipo mensaje,
para el día hábil siguiente a las 9:00, en lugar de otra tarea de llamada, salvo en las
excepciones de «Qué regla gana cuando se cruzan dos».

#### Scenario: Segunda no atendida
- **WHEN** después de "Llamada 1 · No atendió" se registra "Llamada 2 · No atendió"
- **THEN** existe una tarea pendiente "Enviar WhatsApp a María López" de tipo mensaje para el día hábil siguiente a las 9:00, y no se creó ninguna tarea "Llamada 3"

#### Scenario: Ya hay una tarea de WhatsApp pendiente
- **WHEN** se registra una tercera "No atendió" seguida y la tarea "Enviar WhatsApp" que creó la cadencia para ese proceso sigue pendiente
- **THEN** no se crea otra tarea y el aviso dice "Ya hay una tarea pendiente de enviarle WhatsApp: no se crea otra."

#### Scenario: La tarea de WhatsApp se completó con el tilde, sin marcar el WhatsApp
- **WHEN** la tarea "Enviar WhatsApp" que creó la cadencia se marcó como hecha con el tilde, nadie tocó "Marcar WhatsApp enviado", y se registra otra "No atendió" seguida
- **THEN** se crea otra tarea "Enviar WhatsApp a {nombre}" para el día hábil siguiente a las 9:00, y no una tarea de llamada: el tilde solo no termina la secuencia

#### Scenario: Un mensaje agendado a mano no frena la cadencia
- **WHEN** se registra la segunda "No atendió" seguida y el proceso tiene pendiente una tarea de tipo mensaje creada a mano con "+ Tarea"
- **THEN** igual se crea la tarea "Enviar WhatsApp a {nombre}" de la cadencia

### Requirement: Qué regla gana cuando se cruzan dos
Ante una llamada "No atendió", el sistema SHALL mirar estas excepciones en este orden y
quedarse con la primera que se cumpla, sin crear tarea: intento fuera de orden; sin proceso
activo; proceso que no es de quien registra; WhatsApp marcado dentro de la racha; tarea de
WhatsApp de la cadencia ya pendiente. Solo si ninguna se cumple se crea la tarea de llamada
o la de WhatsApp.

#### Scenario: Fuera de orden y además con WhatsApp en la racha
- **WHEN** se carga con la hora corregida una "No atendió" que queda antes de otro intento, en un proceso con un WhatsApp marcado en la racha
- **THEN** no se crea ninguna tarea y el aviso es el de fuera de orden ("Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea.")

#### Scenario: Proceso ajeno y además con WhatsApp en la racha
- **WHEN** un asesor registra "No atendió" sobre un proceso que no es suyo y que ya tiene un WhatsApp marcado en la racha
- **THEN** no se crea ninguna tarea y el aviso es el de proceso ajeno ("Quedó anotada. Este proceso lo lleva otra persona: no se agenda la siguiente ni se cierran las tareas de esa persona.")

#### Scenario: WhatsApp marcado y además tarea de WhatsApp pendiente
- **WHEN** se registra una "No atendió" en una racha con un WhatsApp marcado y con la tarea "Enviar WhatsApp" de la cadencia todavía pendiente
- **THEN** no se crea ninguna tarea y el aviso es "Ya se le mandó WhatsApp: no se crea otra tarea. Si querés seguirla, agendá una con «+ Tarea»."

#### Scenario: Ninguna excepción
- **WHEN** se registra la primera "No atendió" de una solicitud propia, en orden y sin WhatsApp marcado
- **THEN** se crea la tarea "Llamada 2 a {nombre}"

### Requirement: Qué regla gana ante un WhatsApp marcado
Ante un WhatsApp marcado, que nunca crea tarea, el sistema SHALL elegir el aviso y decidir
qué se cierra en este orden: intento fuera de orden (no cierra nada); proceso que no es de
quien registra (cierra solo lo propio); y, si ninguna se cumple, secuencia terminada
(cierra lo que dice «El WhatsApp marcado cierra también su tarea»).

#### Scenario: WhatsApp marcado en orden sobre un proceso propio
- **WHEN** una coordinadora marca "WhatsApp enviado" y es el intento más reciente del proceso
- **THEN** el aviso es el de secuencia terminada ("La secuencia termina acá: no se crea ninguna tarea más.") y se completan las tareas que corresponden

#### Scenario: WhatsApp marcado fuera de orden sobre un proceso ajeno
- **WHEN** un asesor marca "WhatsApp enviado" con la hora corregida, sobre un proceso que no es suyo, y queda antes de otro intento ya registrado
- **THEN** el registro se guarda, no se cierra ninguna tarea (tampoco las propias) y el aviso es el de fuera de orden ("Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea."), no el de proceso ajeno

### Requirement: El WhatsApp marcado termina la secuencia
Marcar "WhatsApp enviado" SHALL NOT crear ninguna tarea, y una llamada "No atendió"
registrada después de ese WhatsApp, dentro de la misma racha, tampoco. Los avisos MUST decir
solo cosas que son verdad en la plataforma de hoy: el bloque «Sin respuesta» del Inicio
todavía no existe (llega con el change `crm-inicio`), así que hasta entonces no se nombra.

#### Scenario: Marcar el WhatsApp
- **WHEN** después de dos "No atendió" se marca "WhatsApp enviado"
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

### Requirement: La racha se cuenta desde la última vez que atendió
La cantidad de "No atendió" seguidas SHALL contarse hacia atrás desde el intento que se
está evaluando hasta la última llamada atendida anterior (cualquier resultado distinto de
"No atendió"), mirando solo los intentos del proceso que ocurrieron hasta ese intento y sin
contar registros anulados. Un WhatsApp marcado antes de esa llamada atendida deja de contar.
La cuenta MUST dar lo mismo al guardar y al reintentar.

#### Scenario: Atendió en el medio
- **WHEN** el historial es "No atendió", "Atendió · volver a llamar", y se registra otra "No atendió"
- **THEN** cuenta como primera no atendida seguida y se crea la tarea "Llamada 4 a {nombre}"

#### Scenario: WhatsApp viejo, después atendió
- **WHEN** el historial es "No atendió", "No atendió", WhatsApp marcado, "Atendió · volver a llamar", y se registra otra "No atendió"
- **THEN** se crea una tarea de llamada, porque el WhatsApp es anterior a la última vez que atendió

#### Scenario: Una anulada no cuenta
- **WHEN** el historial tiene una "No atendió" anulada y se registra una "No atendió"
- **THEN** cuenta como primera no atendida seguida

#### Scenario: El número mostrado no es la racha
- **WHEN** la quinta llamada del proceso es la primera no atendida seguida
- **THEN** la tarea creada se titula "Llamada 6 a {nombre}"

### Requirement: Un intento cargado fuera de orden no mueve tareas
Si la llamada o el WhatsApp que se guarda no queda como el intento más reciente de su
proceso (porque se cargó con la hora corregida y ya hay otro intento posterior sin anular),
el sistema SHALL guardarlo y numerarlo, pero SHALL NOT crear ni cerrar ninguna tarea, con
cualquier resultado. El aviso MUST decirlo.

#### Scenario: No atendió cargada después de una atendida
- **WHEN** a las 10:30 se registró "Atendió · volver a llamar" (que creó la tarea "Llamar a María López") y después se carga una "No atendió" con "Hace 1 hora", que ocurrió a las 10:00
- **THEN** la llamada nueva se guarda y se lee "Llamada 1", la otra pasa a "Llamada 2", no se crea ninguna tarea "Llamada 2" ni "Llamada 3", y la tarea "Llamar a María López" sigue pendiente

#### Scenario: El aviso lo explica
- **WHEN** se guarda ese intento fuera de orden
- **THEN** el aviso dice "Quedó anotada antes de otra más nueva: no se agenda ni se cierra ninguna tarea."

#### Scenario: Volver a llamar cargada fuera de orden
- **WHEN** se carga "Atendió · volver a llamar" con día y hora, con "Hace 1 hora", y ya hay un intento registrado hace 30 minutos
- **THEN** la llamada se guarda, no se crea la tarea "Llamar a {nombre}", y el aviso agrega "Si hace falta, agendala con «+ Tarea»."

#### Scenario: Hora corregida que igual queda última
- **WHEN** se carga una "No atendió" con "Hace 30 min" y el intento anterior del proceso es de ayer
- **THEN** la cadencia corre normal y se crea la tarea que corresponde

### Requirement: Volver a llamar agenda en el día y la hora pedidos
Una llamada "Atendió · volver a llamar" SHALL crear la tarea "Llamar a {nombre}", de tipo
llamada, en el día y la hora elegidos en el formulario, asignada a quien registró, aunque
caigan fuera del horario laboral o en fin de semana. Vale también sobre un proceso que no
es de quien registra y sin proceso activo; la única excepción es el intento fuera de orden
(«Un intento cargado fuera de orden no mueve tareas»), que no crea nada.

#### Scenario: Mañana a las 16:00
- **WHEN** se registra "Atendió · volver a llamar" con "Mañana 16:00"
- **THEN** existe una tarea pendiente "Llamar a María López" con esa fecha y `due_time` 16:00, y el aviso lo dice

#### Scenario: Pidió un sábado
- **WHEN** se elige un sábado a las 11:00
- **THEN** la tarea queda para ese sábado a las 11:00, sin moverse al lunes

### Requirement: Los resultados que no agendan ofrecen el paso siguiente
Las llamadas "Atendió y agendó", "Atendió · no le interesa" y "Número equivocado" SHALL NOT
crear ninguna tarea. El aviso SHALL ofrecer el paso siguiente según la etapa del proceso
activo y lo que puede hacer quien registra, con el texto y los botones exactos de cada
escenario, y nunca hacerlo solo. Una solicitud la coordina la coordinación, o el asesor que
la tiene asignada; un proceso lo cierra quien puede avanzarlo y, si es asesor, solo el suyo.

#### Scenario: Agendó con solicitud abierta
- **WHEN** una coordinadora registra "Atendió y agendó" en un contacto con una solicitud abierta
- **THEN** no hay tarea nueva y el aviso dice "Falta coordinar día, hora y asesor de la tasación." con el botón "Coordinar tasación"

#### Scenario: Agendó con solicitud sin día
- **WHEN** el proceso activo está en etapa `scheduled` sin día cargado y se registra "Atendió y agendó"
- **THEN** el aviso es el mismo que para una solicitud y el botón convierte ese mismo proceso

#### Scenario: Agendó en un lead de la clase gratuita
- **WHEN** se registra "Atendió y agendó" en un contacto cuyo proceso activo está en Clase gratuita
- **THEN** el aviso dice "Falta coordinar día, hora y asesor de la tasación. Se abre como un proceso nuevo.", el botón abre el formulario con nombre, teléfono y email ya cargados, y el proceso de la clase no cambia de etapa

#### Scenario: Agendó sin proceso activo
- **WHEN** se registra "Atendió y agendó" en un contacto cuyos procesos están todos cerrados
- **THEN** el aviso y el botón son los del caso anterior

#### Scenario: Agendó con el proceso ya coordinado
- **WHEN** una coordinadora, o el asesor que tiene asignado ese proceso, registra "Atendió y agendó" con el proceso activo en Coordinada
- **THEN** el aviso dice "El proceso ya está en Coordinada: no hace falta coordinar de nuevo." con el botón "Abrir el proceso", y no ofrece "Coordinar tasación"

#### Scenario: Agendó un asesor con el proceso coordinado por otro
- **WHEN** un asesor registra "Atendió y agendó" en un contacto suyo cuyo proceso activo está en Coordinada y asignado a otro asesor
- **THEN** el aviso dice lo mismo, sin el botón "Abrir el proceso" ni ningún otro enlace a ese proceso

#### Scenario: Agendó un asesor sobre una solicitud que no es suya
- **WHEN** un asesor registra "Atendió y agendó" en un contacto que creó él, cuya solicitud no está asignada a él
- **THEN** el aviso dice "Falta coordinar día, hora y asesor de la tasación. Pedíselo a la coordinación." y no muestra botones

#### Scenario: Agendó con una solicitud abierta y un proceso de clase más nuevo
- **WHEN** la persona tiene una solicitud abierta y un proceso de clase gratuita más reciente, y una coordinadora registra "Atendió y agendó"
- **THEN** la llamada queda ligada al proceso de la clase (el más reciente es el activo) y el aviso ofrece coordinar como proceso nuevo; la solicitud anterior no se toca y se puede convertir con su botón "Coordinar tasación" del bloque "Procesos"

#### Scenario: Los botones son para quien los ve
- **WHEN** una llamada "Atendió y agendó" la cargó la coordinadora y el aviso lo vuelve a pedir un asesor que no puede coordinar esa solicitud (con "Reintentar")
- **THEN** a ese asesor el aviso no le muestra "Coordinar tasación": lo que se ofrece se calcula con los permisos de quien hace el pedido, no con los de quien cargó la llamada

#### Scenario: No le interesa
- **WHEN** una coordinadora registra "Atendió · no le interesa" con un proceso activo
- **THEN** no hay tarea nueva, el proceso sigue en su etapa y el aviso ofrece "Marcar proceso como perdido" y "Dejarlo abierto"

#### Scenario: Número equivocado
- **WHEN** una coordinadora registra "Número equivocado" con un proceso activo
- **THEN** no hay tarea nueva, el proceso sigue en su etapa y el aviso ofrece las mismas dos opciones

#### Scenario: No le interesa y no puede cerrarlo
- **WHEN** un asesor registra "Atendió · no le interesa" en un contacto suyo cuyo proceso activo no está asignado a él
- **THEN** el aviso dice "El proceso sigue abierto. Si hay que cerrarlo, avisale a la coordinación." y no muestra botones

#### Scenario: No le interesa sin proceso activo
- **WHEN** se registra "Atendió · no le interesa" o "Número equivocado" en un contacto sin proceso activo
- **THEN** el aviso dice "No tiene ningún proceso abierto: no hay nada que cerrar." y no muestra botones

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
- **WHEN** después de dos "No atendió" existe la tarea "Enviar WhatsApp a María López" de la cadencia y se registra "Atendió · volver a llamar"
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

### Requirement: Cuándo un registro no cierra tareas
El cierre de tareas de una llamada o de un WhatsApp marcado SHALL tener dos excepciones: un
intento fuera de orden no completa ninguna tarea, y sobre un proceso que no es de quien
registra se completan solo las tareas asignadas a esa persona.

#### Scenario: Llamada fuera de orden
- **WHEN** se carga con la hora corregida una llamada atendida que queda antes de otro intento, en un proceso con una tarea de llamada pendiente
- **THEN** esa tarea sigue pendiente y el aviso dice que no se cerró ninguna tarea

#### Scenario: Llamada de un asesor sobre un proceso ajeno
- **WHEN** un asesor registra una llamada sobre un proceso que no es suyo, que tiene pendientes la tarea de entrada de la coordinación y una tarea de llamada del propio asesor
- **THEN** se completa solo la tarea del asesor; la de la coordinación sigue pendiente

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
- **THEN** la de la coordinadora se lee "Llamada 2", cuenta como segunda no atendida seguida y crea la tarea "Enviar WhatsApp a {nombre}" asignada a la coordinadora

#### Scenario: Los demás resultados no llevan el texto de "Quedó anotada"
- **WHEN** ese asesor registra sobre el proceso ajeno "Atendió · volver a llamar", "Atendió y agendó", "Atendió · no le interesa" o "Número equivocado"
- **THEN** el aviso es el de ese resultado (la tarea agendada, o lo que se ofrece), sin el texto "Quedó anotada…", sin ningún botón que lleve al proceso, y nombra solo las tareas propias que se hayan cerrado

#### Scenario: La coordinación llama después del "volver a llamar" de un asesor
- **WHEN** ese asesor tiene pendiente la tarea "Llamar a {nombre}" que nació de su "volver a llamar" sobre el proceso ajeno, y la coordinadora registra una llamada sobre ese proceso
- **THEN** la tarea del asesor queda completada, igual que cualquier llamada pendiente de la cadencia, y el aviso de la coordinadora dice "Se completó sola la tarea «Llamar a {nombre}»."; una llamada que el asesor se haya agendado a mano sigue pendiente

#### Scenario: Coordinación y dueños nunca son ajenos
- **WHEN** una coordinadora, un admin o un dueño registra una llamada sobre el proceso de cualquier asesor
- **THEN** la cadencia corre completa, como en el resto de esta spec

### Requirement: El WhatsApp marcado cierra también su tarea
Marcar "WhatsApp enviado" SHALL completar las mismas tareas que una llamada y, además, la
tarea "Enviar WhatsApp" que creó la cadencia para ese proceso. Valen las mismas dos
excepciones de «Cuándo un registro no cierra tareas»: fuera de orden no completa nada, y
sobre un proceso que no es de quien registra se completa solo lo propio.

#### Scenario: Tarea de WhatsApp pendiente
- **WHEN** existe la tarea "Enviar WhatsApp a María López" creada por la cadencia y se marca "WhatsApp enviado"
- **THEN** esa tarea queda completada y el aviso lo dice

#### Scenario: Mensaje agendado a mano
- **WHEN** existe una tarea de tipo mensaje creada a mano sobre ese proceso y se marca "WhatsApp enviado"
- **THEN** esa tarea sigue pendiente

### Requirement: Día hábil siguiente en hora de Argentina
El "día hábil siguiente" SHALL ser el próximo día de lunes a viernes posterior al día en
que se registra el intento, calculado con el calendario de Argentina, sin tener en cuenta
feriados. La hora de la tarea SHALL ser las 9:00 de Argentina.

#### Scenario: Viernes
- **WHEN** se registra una "No atendió" un viernes
- **THEN** la tarea queda para el lunes siguiente a las 9:00

#### Scenario: Sábado o domingo
- **WHEN** se registra una "No atendió" un sábado o un domingo
- **THEN** la tarea queda para el lunes siguiente a las 9:00

#### Scenario: Lunes a jueves
- **WHEN** se registra una "No atendió" un miércoles
- **THEN** la tarea queda para el jueves a las 9:00

#### Scenario: De noche en Argentina
- **WHEN** se registra una "No atendió" un martes a las 22:30 de Argentina, cuando en hora universal ya es miércoles
- **THEN** la tarea queda para el miércoles a las 9:00, no para el jueves

#### Scenario: Feriado
- **WHEN** el día hábil siguiente es feriado
- **THEN** la tarea queda igual para ese día (los feriados quedan fuera de este change)

### Requirement: Sin proceso activo no hay secuencia
Si el contacto no tiene proceso activo, una llamada "No atendió" SHALL NOT crear ninguna
tarea y el aviso SHALL explicarlo. "Volver a llamar" crea igual su tarea, ligada solo al
contacto (es un pedido explícito de la persona, no un paso de la secuencia), y el cierre de
tareas se aplica a las tareas ligadas solo al contacto. La excepción es el intento fuera de
orden entre los registros sin proceso de ese contacto, que no crea ni cierra nada.

#### Scenario: No atendió sin proceso
- **WHEN** se registra "No atendió" en un contacto cuyos procesos están todos cerrados
- **THEN** la llamada se guarda, no se crea ninguna tarea, y el aviso dice "No tiene un proceso abierto: no se agenda la llamada siguiente."

#### Scenario: Volver a llamar sin proceso
- **WHEN** se registra "Atendió · volver a llamar" con día y hora en un contacto sin proceso activo
- **THEN** se crea la tarea "Llamar a {nombre}" con `contact_id` y sin `deal_id`

### Requirement: Sin proceso activo, un asesor cierra solo sus tareas
Cuando un asesor registra una llamada o un WhatsApp marcado sobre un contacto sin proceso
activo, de las tareas ligadas solo al contacto SHALL completarse únicamente las que están
asignadas a él. Las de la coordinación y las de otros asesores MUST seguir pendientes. Para
un coordinador, un admin o un dueño no cambia nada.

#### Scenario: Asesor llama a una persona sin proceso
- **WHEN** un asesor registra una llamada atendida en un contacto suyo sin proceso activo, que tiene pendientes, ligadas solo al contacto, una tarea de llamada asignada a él y una tarea de la coordinación
- **THEN** se completa solo la tarea del asesor y el aviso la nombra; la de la coordinación sigue pendiente

#### Scenario: Coordinadora llama a una persona sin proceso
- **WHEN** una coordinadora registra esa misma llamada sobre ese contacto
- **THEN** se completan las tareas de entrada y de llamada ligadas solo al contacto, como en el resto de esta spec

### Requirement: Anular un intento deshace lo que provocó
Al anular una llamada o un WhatsApp que es el último intento no anulado de su proceso, el
sistema SHALL descartar la tarea que ese intento creó, si sigue pendiente, y reabrir las
tareas que ese intento completó. Si hay intentos posteriores, SHALL anularse solo el
registro, sin tocar tareas. Anular nunca crea tareas nuevas.

#### Scenario: Deshacer la llamada recién guardada
- **WHEN** se guarda "Llamada 1 · No atendió", que crea "Llamada 2" y completa la tarea de entrada, y se toca "Deshacer"
- **THEN** la llamada desaparece, la tarea "Llamada 2" deja de estar pendiente (queda descartada en la base), la tarea de entrada vuelve a estar pendiente y el aviso se quita

#### Scenario: La tarea creada ya se completó
- **WHEN** se anula una llamada cuya tarea "Llamada 2" ya fue completada por alguien
- **THEN** esa tarea queda completada como estaba

#### Scenario: Anular un intento viejo
- **WHEN** se anula "Llamada 1" cuando ya existe "Llamada 2" sin anular
- **THEN** solo desaparece ese registro, las llamadas se renumeran y ninguna tarea cambia de estado

#### Scenario: Deshacer el WhatsApp
- **WHEN** se toca "Deshacer" después de marcar un WhatsApp que había completado la tarea "Enviar WhatsApp"
- **THEN** el registro desaparece y la tarea "Enviar WhatsApp" vuelve a estar pendiente

#### Scenario: Deshacer que quedó a medias
- **WHEN** al deshacer una llamada el registro queda anulado pero falla la parte de las tareas, y se vuelve a pedir deshacer
- **THEN** la segunda vez se descarta la tarea que esa llamada había creado y se reabren las que había completado, sin duplicar nada de lo que la primera vez sí llegó a hacer

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
- **WHEN** la segunda "No atendió" seguida creó la tarea "Enviar WhatsApp a {nombre}" pero falló el cierre de otra tarea, y se toca "Reintentar"
- **THEN** sigue habiendo una sola tarea "Enviar WhatsApp" creada por esa llamada, el aviso dice "Se agendó Enviar WhatsApp para …" y no dice "Ya hay una tarea pendiente de enviarle WhatsApp: no se crea otra."

#### Scenario: Reintentar dos veces
- **WHEN** se dispara dos veces el reintento de la misma llamada
- **THEN** en la base sigue habiendo una sola tarea creada por esa llamada

#### Scenario: Reintentar un "volver a llamar"
- **WHEN** falla la tarea de una llamada "Atendió · volver a llamar" pedida para el jueves a las 16:00 y se toca "Reintentar"
- **THEN** se crea la tarea "Llamar a {nombre}" para el jueves a las 16:00, sin volver a pedir el día ni la hora

#### Scenario: Reintentar al día siguiente
- **WHEN** falla la tarea de una "No atendió" cargada un martes y el reintento se hace el miércoles
- **THEN** la tarea queda para el miércoles a las 9:00 (el día hábil siguiente al martes) y se ve como vencida

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

### Requirement: Las tareas automáticas se distinguen
Toda tarea creada por la cadencia SHALL quedar marcada en la base con el intento que la
originó, y toda tarea completada por la cadencia SHALL quedar marcada con el intento que la
cerró, para poder distinguirlas de las creadas o completadas a mano.

#### Scenario: Tarea creada por la cadencia
- **WHEN** una "No atendió" crea la tarea "Llamada 2"
- **THEN** en la base esa tarea apunta a la llamada que la originó, y en la ficha se lee debajo de la llamada que la tarea se agendó sola

#### Scenario: Tarea creada a mano
- **WHEN** se crea una tarea con "+ Tarea"
- **THEN** en la base esa tarea no apunta a ningún intento

#### Scenario: Tarea reabierta al deshacer
- **WHEN** se deshace la llamada que había completado una tarea
- **THEN** esa tarea vuelve a estar pendiente y en la base ya no apunta a ningún intento que la haya cerrado, ni tiene fecha de completada

#### Scenario: Tarea cerrada por la cadencia
- **WHEN** una llamada completa la tarea de entrada de otro coordinador
- **THEN** en la base esa tarea apunta a la llamada que la cerró

### Requirement: La cadencia nunca mueve la etapa ni le escribe al cliente
Ningún resultado de llamada ni marca de WhatsApp SHALL cambiar la etapa de un proceso ni
enviar WhatsApp, email u otro mensaje, ni al cliente ni al equipo. La cadencia solo crea y
cierra tareas.

#### Scenario: Secuencia completa
- **WHEN** se registran "No atendió", "No atendió", WhatsApp marcado y "No atendió" sobre una solicitud
- **THEN** el proceso sigue en etapa `request`, el historial de etapas no tiene filas nuevas, y no hay mensajes salientes nuevos de WhatsApp ni emails enviados por estas acciones

#### Scenario: Sin procesos programados
- **WHEN** se registra un intento
- **THEN** las tareas se crean y se cierran en ese mismo guardado, sin depender de ningún proceso que corra más tarde

### Requirement: La cadencia respeta los permisos de la ficha
La cadencia SHALL correr solo cuando el intento lo registra alguien que puede ver el
contacto, y las tareas que crea SHALL quedar siempre asignadas a esa persona.

#### Scenario: Asesor en contacto ajeno
- **WHEN** un asesor envía por la red una llamada para un contacto que no tiene asignado, no creó y del que no tiene ningún proceso ni tasación a su nombre
- **THEN** responde 404, no se guarda la llamada y no se crea ni se cierra ninguna tarea

#### Scenario: Abogado
- **WHEN** un abogado envía por la red una llamada para cualquier contacto
- **THEN** responde 403, y no se crea ni se cierra ninguna tarea

#### Scenario: Reintento de otra persona
- **WHEN** alguien que no puede ver el contacto pide por la red el reintento de la cadencia de una llamada
- **THEN** responde 404 o 403 según su rol y no cambia ninguna tarea
