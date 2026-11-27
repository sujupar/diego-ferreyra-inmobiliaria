# Spec Delta

## Purpose

Define qué eventos de un contacto muestra la línea de tiempo de la ficha además de lo que
carga una persona (notas, llamadas, WhatsApp marcado), de qué dato sale cada uno, cómo se
escribe, en qué orden aparece y qué no se muestra nunca.

## ADDED Requirements

### Requirement: Qué eventos suma la línea de tiempo
La línea de tiempo SHALL sumar a las notas, llamadas y WhatsApp marcados cinco tipos de
evento del sistema: registro en la landing, cambio de etapa, tarea creada o completada,
WhatsApp enviado o recibido y video visto. Cada evento MUST leerse de la tabla donde ya
vive, en el momento de abrir la ficha, sin copias. Emails y consultas de portal MUST NOT
aparecer.

#### Scenario: Un lead del embudo con su historia
- **WHEN** se abre la ficha de una persona que abrió el video de la landing de tasación a las 18:18, se registró a las 18:20, recibió el WhatsApp automático a las 18:21 y fue coordinada al día siguiente a las 10:12
- **THEN** la línea de tiempo muestra, en este orden, el cambio de etapa, el WhatsApp, el registro y el video, cada uno con su ícono

#### Scenario: Una persona cargada a mano
- **WHEN** se abre la ficha de un contacto sin registro en la landing, sin WhatsApp y sin video
- **THEN** la línea de tiempo muestra solo sus notas, llamadas, cambios de etapa y tareas, sin huecos ni avisos de datos faltantes

#### Scenario: Ni emails ni consultas
- **WHEN** se abre cualquier ficha
- **THEN** no aparece ningún evento de email ni de consulta de portal

### Requirement: Registro en la landing
Cada registro completo en una landing vinculado al contacto SHALL mostrarse como "Se
registró · Solicitud de tasación" o "Se registró · Clase gratuita", en el momento del
registro. Si el proceso guarda el anuncio de Meta, el detalle MUST decir "Anuncio de Meta ·
{nombre del anuncio}". Sin anuncio no lleva detalle. El registro no lleva autor.

#### Scenario: Con anuncio
- **WHEN** la persona se registró en la landing de tasación desde el anuncio "AD04 - VID08"
- **THEN** se lee "Se registró · Solicitud de tasación" y debajo "Anuncio de Meta · AD04 - VID08"

#### Scenario: Sin anuncio
- **WHEN** la persona se registró en la landing de la clase sin datos de anuncio
- **THEN** se lee "Se registró · Clase gratuita" sin detalle

#### Scenario: Registro incompleto
- **WHEN** hay un registro reservado que no se completó
- **THEN** no aparece en la línea de tiempo

#### Scenario: No se repite con la apertura del proceso
- **WHEN** el registro creó el proceso en "Solicitud"
- **THEN** aparece una sola vez como "Se registró", y no además como cambio de etapa

### Requirement: Cambios de etapa
Cada cambio de etapa de un proceso del contacto SHALL mostrarse como "Pasó de {etapa} a
{etapa}" con los nombres de etapa de la plataforma; una tasación sin día es Solicitud. La
apertura de un proceso que no nació de un registro MUST mostrarse como "Se abrió un proceso
en {etapa}" en la fecha del proceso. Si se sabe quién hizo el cambio, se muestra su nombre.

#### Scenario: Coordinación
- **WHEN** la coordinación pasa un proceso de Solicitud a Coordinada
- **THEN** se lee "Pasó de Solicitud a Coordinada" con el nombre de quien lo hizo

#### Scenario: Cambio viejo sin autor
- **WHEN** el cambio de etapa ocurrió antes de que se empezara a guardar el autor
- **THEN** el evento se ve sin nombre, solo con la fecha

#### Scenario: Proceso cargado a mano
- **WHEN** un asesor crea un proceso nuevo en Coordinada para un contacto
- **THEN** se lee "Se abrió un proceso en Coordinada"

#### Scenario: Coordinar una solicitud que ya tenía tasación sin día
- **WHEN** la coordinación le pone día a una solicitud cuyo proceso ya figuraba como tasación sin día
- **THEN** se lee "Pasó de Solicitud a Coordinada" con su nombre

#### Scenario: Reprogramar no es un cambio de etapa
- **WHEN** a una tasación coordinada se le cambia el día
- **THEN** no aparece ningún cambio de etapa nuevo

#### Scenario: Proceso cargado de datos viejos
- **WHEN** un proceso se creó en 2025 y su apertura quedó escrita en el historial el día que se cargaron los datos
- **THEN** se lee "Se abrió un proceso", sin etapa ni autor, en la fecha de creación del proceso

#### Scenario: Persona con dos procesos
- **WHEN** el contacto tiene un proceso cerrado y uno abierto
- **THEN** se ven los cambios de etapa de los dos, mezclados por fecha

### Requirement: Tareas creadas y completadas
Cada tarea del contacto SHALL mostrarse al crearse ("Se creó la tarea «{título}»", con
"Para {nombre}" de detalle) y al completarse ("Se completó la tarea «{título}»"). Las copias
de una misma tarea creadas para cada coordinador (mismo tipo, título y proceso, a 60 segundos
o menos) MUST verse una sola vez, "Para la coordinación". La tarea creada por una llamada no
se repite.

#### Scenario: Tarea creada y completada
- **WHEN** una tarea "Pedir documentación" se creó el lunes para Tomás y él la completó el martes
- **THEN** se ven dos eventos: la creación el lunes con "Para Tomás" y la completada el martes con el nombre de Tomás

#### Scenario: Copias de la coordinación
- **WHEN** al entrar un lead se creó la misma tarea para cada coordinador en el mismo minuto
- **THEN** se ve un solo evento de creación, con "Para la coordinación"

#### Scenario: Mismo título, otra persona
- **WHEN** en el mismo minuto se creó una tarea para un coordinador y otra con el mismo título para un asesor
- **THEN** se ven dos creaciones, una "Para {asesor}"

#### Scenario: Tarea del proceso sin contacto
- **WHEN** una tarea está ligada al proceso de la persona pero no a su contacto
- **THEN** también aparece

#### Scenario: Tarea de una llamada
- **WHEN** una llamada con "Volver a llamar" creó la tarea "Llamar a Marcela"
- **THEN** la creación de esa tarea no aparece como evento aparte

#### Scenario: Tarea descartada
- **WHEN** una tarea se descartó sin completarse
- **THEN** solo se ve su creación

### Requirement: WhatsApp con el número de la persona
La línea de tiempo SHALL mostrar los WhatsApp enviados y recibidos con el teléfono del
contacto, comparado por los últimos 10 dígitos. Si el teléfono es del equipo (un usuario, un
número de copia de las consultas o uno que recibió avisos de consultas), lo comparte otro
contacto o coincide con más de un número completo, MUST NOT mostrarse ningún WhatsApp.

#### Scenario: Recibido
- **WHEN** la persona escribió por WhatsApp "¿Me pueden llamar a la tarde?"
- **THEN** se lee "Escribió por WhatsApp" y debajo el comienzo del mensaje

#### Scenario: Enviado por el equipo
- **WHEN** Paula le mandó un mensaje desde la bandeja de WhatsApp
- **THEN** se lee "Se le envió un WhatsApp" con el nombre de Paula y el comienzo del mensaje

#### Scenario: Enviado sin persona
- **WHEN** la plataforma le mandó una plantilla automática o el asistente le respondió
- **THEN** se lee "Se le envió un WhatsApp automático" o "Le respondió el asistente por WhatsApp", sin nombre de persona

#### Scenario: Plantilla automática
- **WHEN** la plataforma le mandó la plantilla de confirmación de la tasación, aunque esté marcada como escrita por la IA
- **THEN** se lee "Se le envió un WhatsApp automático"

#### Scenario: Notas internas y avisos al equipo
- **WHEN** hay notas internas del agente o avisos de consultas
- **THEN** no aparecen

#### Scenario: No se pudo enviar
- **WHEN** un WhatsApp enviado quedó con error
- **THEN** el título termina en "· no se pudo enviar"

#### Scenario: Teléfono del equipo
- **WHEN** el contacto tiene el mismo teléfono que un usuario de la plataforma
- **THEN** no aparece ningún WhatsApp, tampoco los avisos de consultas con datos de otros interesados

#### Scenario: Número de copia de las consultas
- **WHEN** el contacto tiene el número al que llega la copia de las consultas de portal, aunque no sea de un usuario de la plataforma
- **THEN** no aparece ningún WhatsApp

#### Scenario: Otro país con los mismos 10 dígitos
- **WHEN** hay mensajes con dos números completos distintos que terminan en los mismos 10 dígitos que el contacto
- **THEN** no aparece ningún WhatsApp

#### Scenario: Teléfono compartido
- **WHEN** dos contactos tienen el mismo teléfono
- **THEN** en ninguna de las dos fichas aparece un WhatsApp

### Requirement: Video visto
Cada video de una landing que la persona empezó a reproducir, vinculado a su contacto, SHALL
mostrarse como "Vio el video {de cuál} · {porcentaje} %", con el porcentaje más alto
alcanzado, en la fecha en que abrió la página del video por primera vez. Un video que solo cargó sin reproducirse MUST NOT
aparecer.

#### Scenario: Video de la landing
- **WHEN** la persona reprodujo el video de la landing de tasación hasta el 62 %
- **THEN** se lee "Vio el video de la landing de tasación · 62 %"

#### Scenario: La clase completa
- **WHEN** la persona vio el 12 % de la clase completa
- **THEN** se lee "Vio el video de la clase completa · 12 %"

#### Scenario: Sin reproducir
- **WHEN** la página cargó el video pero la persona nunca le dio play
- **THEN** no aparece ningún evento de video

### Requirement: Un asesor no ve lo de los procesos de otro asesor
A un asesor la línea de tiempo MUST NOT mostrarle ni devolverle por la red los cambios de
etapa, el registro ni las tareas de un proceso que no está a su nombre, ni las tareas ligadas
solo al contacto asignadas a otra persona: la misma regla que los bloques "Procesos" y
"Tareas". Lo de la persona (WhatsApp, video, notas y llamadas) SHALL verlo completo.

#### Scenario: Contacto con un proceso de otro asesor
- **WHEN** un asesor abre la ficha de un contacto que tiene un proceso a su nombre y otro, con su registro y sus tareas, a nombre de otro asesor
- **THEN** ve los cambios de etapa, el registro y las tareas de su proceso, los WhatsApp y el video de la persona, y del otro proceso solo una tarea asignada a él mismo (como en el bloque "Tareas"); el pedido por la red tampoco trae lo demás

#### Scenario: La coordinación ve todo
- **WHEN** una coordinadora abre esa misma ficha
- **THEN** ve los eventos de los dos procesos

### Requirement: Orden y páginas de la línea completa
Los eventos del sistema y los registros de las personas SHALL aparecer mezclados en una sola
lista, del más nuevo al más viejo, de a 50 con "Ver más". Dos eventos con la misma fecha
MUST mantener siempre el mismo orden y no repetirse ni perderse entre páginas.

#### Scenario: Mezcla
- **WHEN** hay una llamada de hoy, un WhatsApp de ayer y un registro de anteayer
- **THEN** se ven en ese orden en una sola lista

#### Scenario: Corte de página con empate
- **WHEN** el evento 50 y el 51 tienen la misma fecha, al milisegundo
- **THEN** "Ver más" trae el 51 y ninguno se repite

#### Scenario: Más de cien de una sola fuente
- **WHEN** una persona tiene 120 WhatsApp y nada más
- **THEN** cada "Ver más" trae los 50 siguientes hasta el último, y recién ahí desaparece el botón

### Requirement: Si una fuente falla, el resto se muestra
Si la lectura de un tipo de evento del sistema falla, la línea de tiempo SHALL mostrar el
resto y un aviso "Parte de la historia no se pudo cargar" con "Reintentar". Si fallan las
notas y llamadas, MUST mostrarse "No se pudo cargar" como hoy.

#### Scenario: Falla WhatsApp
- **WHEN** la lectura de WhatsApp falla y las demás responden
- **THEN** se ven las notas, llamadas, etapas, tareas, registro y video, con el aviso y "Reintentar"

### Requirement: Los eventos del sistema no se editan
Los eventos del sistema MUST NOT tener menú "⋯" ni poder editarse, borrarse o anularse
desde la ficha. Cumplen la anatomía de evento de `crm-sistema-diseno`: ícono, título que pasa
a un segundo renglón sin cortarse, detalle, autor si se sabe y fecha relativa que al tocarse
muestra la exacta.

#### Scenario: Sin menú
- **WHEN** se mira un cambio de etapa en la línea de tiempo
- **THEN** no hay menú "⋯", y al tocar el renglón se ve el día y la hora exactos

### Requirement: Se guarda quién cambia una etapa o una tarea
Desde este change, cambiar la etapa de un proceso, crear una tarea y completarla SHALL
guardar quién lo hizo cuando lo hace una persona con sesión. Cuando lo hace el sistema
(landing, agente, procesos programados) MUST quedar sin autor. Lo anterior no se completa.

#### Scenario: Cambio hecho desde la plataforma
- **WHEN** Paula marca un proceso como perdido desde la ficha
- **THEN** el historial de ese cambio guarda a Paula, y la línea de tiempo muestra "Pasó de … a Descartado" con su nombre sin recargar la página

#### Scenario: Cambio hecho por el sistema
- **WHEN** un registro en la landing crea un proceso
- **THEN** el cambio queda sin autor y no se muestra ningún nombre

#### Scenario: Tarea completada
- **WHEN** Tomás completa una tarea desde la ficha o la página de tareas
- **THEN** la tarea guarda que la completó Tomás, y en la ficha aparece "Se completó la tarea …" sin recargar la página

#### Scenario: Nadie firma por otro
- **WHEN** alguien con sesión intenta guardar directamente en la base que otra persona completó una tarea
- **THEN** la tarea queda a nombre de quien tiene la sesión

### Requirement: Nada que no se mide
La línea de tiempo MUST NOT mostrar eventos de lectura ni de apertura ("leyó el WhatsApp",
"abrió el email", "hizo clic"), aunque el dato exista, ni actividad de navegación que no esté
vinculada al contacto.

#### Scenario: WhatsApp leído
- **WHEN** un WhatsApp enviado figura como leído por Meta
- **THEN** la línea de tiempo muestra que se envió y no agrega un evento de lectura
