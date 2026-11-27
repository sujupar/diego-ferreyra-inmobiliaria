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
- **WHEN** se abre la ficha de una persona que se registró en la landing de tasación, vio el video, recibió el WhatsApp de confirmación y fue coordinada
- **THEN** la línea de tiempo muestra, de la más nueva a la más vieja, el cambio de etapa, el WhatsApp, el video y el registro, cada uno con su ícono

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
{etapa}" con los nombres de etapa de la plataforma. La apertura de un proceso que no nació
de un registro MUST mostrarse como "Se abrió un proceso en {etapa}". Si se sabe quién hizo el
cambio, se muestra su nombre; si no, no se inventa uno.

#### Scenario: Coordinación
- **WHEN** la coordinación pasa un proceso de Solicitud a Coordinada
- **THEN** se lee "Pasó de Solicitud a Coordinada" con el nombre de quien lo hizo

#### Scenario: Cambio viejo sin autor
- **WHEN** el cambio de etapa ocurrió antes de que se empezara a guardar el autor
- **THEN** el evento se ve sin nombre, solo con la fecha

#### Scenario: Proceso cargado a mano
- **WHEN** un asesor crea un proceso nuevo en Coordinada para un contacto
- **THEN** se lee "Se abrió un proceso en Coordinada"

#### Scenario: Persona con dos procesos
- **WHEN** el contacto tiene un proceso cerrado y uno abierto
- **THEN** se ven los cambios de etapa de los dos, mezclados por fecha

### Requirement: Tareas creadas y completadas
Cada tarea del contacto SHALL mostrarse al crearse ("Se creó la tarea «{título}»", con
"Para {nombre}" de detalle) y al completarse ("Se completó la tarea «{título}»"). Las copias
de una misma tarea creadas para cada coordinador MUST verse una sola vez, "Para la
coordinación". Una tarea creada por una llamada no se repite: ya figura en esa llamada.

#### Scenario: Tarea creada y completada
- **WHEN** una tarea "Pedir documentación" se creó el lunes para Tomás y él la completó el martes
- **THEN** se ven dos eventos: la creación el lunes con "Para Tomás" y la completada el martes con el nombre de Tomás

#### Scenario: Copias de la coordinación
- **WHEN** al entrar un lead se creó la misma tarea para cada coordinador en el mismo minuto
- **THEN** se ve un solo evento de creación, con "Para la coordinación"

#### Scenario: Tarea de una llamada
- **WHEN** una llamada con "Volver a llamar" creó la tarea "Llamar a Marcela"
- **THEN** la creación de esa tarea no aparece como evento aparte

#### Scenario: Tarea descartada
- **WHEN** una tarea se descartó sin completarse
- **THEN** solo se ve su creación

### Requirement: WhatsApp con el número de la persona
La línea de tiempo SHALL mostrar los WhatsApp enviados y recibidos con el teléfono del
contacto, comparado por los últimos 10 dígitos. Si el teléfono es de alguien del equipo o lo
comparte otro contacto, MUST NOT mostrarse ningún WhatsApp. Las plantillas de aviso al
equipo y las notas internas del agente tampoco se muestran.

#### Scenario: Recibido
- **WHEN** la persona escribió por WhatsApp "¿Me pueden llamar a la tarde?"
- **THEN** se lee "Escribió por WhatsApp" y debajo el comienzo del mensaje

#### Scenario: Enviado por el equipo
- **WHEN** Paula le mandó un mensaje desde la bandeja de WhatsApp
- **THEN** se lee "Se le envió un WhatsApp" con el nombre de Paula y el comienzo del mensaje

#### Scenario: Enviado sin persona
- **WHEN** la plataforma le mandó una plantilla automática o el asistente le respondió
- **THEN** se lee "Se le envió un WhatsApp automático" o "Le respondió el asistente por WhatsApp", sin nombre de persona

#### Scenario: No se pudo enviar
- **WHEN** un WhatsApp enviado quedó con error
- **THEN** el título termina en "· no se pudo enviar"

#### Scenario: Teléfono del equipo
- **WHEN** el contacto tiene el mismo teléfono que un usuario de la plataforma
- **THEN** no aparece ningún WhatsApp, tampoco los avisos de consultas con datos de otros interesados

#### Scenario: Teléfono compartido
- **WHEN** dos contactos tienen el mismo teléfono
- **THEN** en ninguna de las dos fichas aparece un WhatsApp

### Requirement: Video visto
Cada video de una landing que la persona empezó a reproducir, vinculado a su contacto, SHALL
mostrarse como "Vio el video {de cuál} · {porcentaje} %", con el porcentaje más alto
alcanzado, en el momento en que lo empezó. Un video que solo cargó sin reproducirse MUST NOT
aparecer.

#### Scenario: Video de la landing
- **WHEN** la persona reprodujo el video de la landing de tasación hasta el 62 %
- **THEN** se lee "Vio el video de la landing de tasación · 62 %"

#### Scenario: Sin reproducir
- **WHEN** la página cargó el video pero la persona nunca le dio play
- **THEN** no aparece ningún evento de video

### Requirement: Orden y páginas de la línea completa
Los eventos del sistema y los registros de las personas SHALL aparecer mezclados en una sola
lista, del más nuevo al más viejo, de a 50 con "Ver más". Dos eventos con la misma fecha
MUST mantener siempre el mismo orden y no repetirse ni perderse entre páginas.

#### Scenario: Mezcla
- **WHEN** hay una llamada de hoy, un WhatsApp de ayer y un registro de anteayer
- **THEN** se ven en ese orden en una sola lista

#### Scenario: Corte de página con empate
- **WHEN** el evento 50 y el 51 tienen la misma fecha
- **THEN** "Ver más" trae el 51 y ninguno se repite

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
- **WHEN** Paula pasa un proceso a Coordinada desde la ficha
- **THEN** el historial de ese cambio guarda a Paula y la línea de tiempo muestra su nombre

#### Scenario: Cambio hecho por el sistema
- **WHEN** un registro en la landing crea un proceso
- **THEN** el cambio queda sin autor y no se muestra ningún nombre

#### Scenario: Tarea completada
- **WHEN** Tomás completa una tarea desde la ficha o la página de tareas
- **THEN** la tarea guarda que la completó Tomás

### Requirement: Nada que no se mide
La línea de tiempo MUST NOT mostrar eventos de lectura ni de apertura ("leyó el WhatsApp",
"abrió el email", "hizo clic"), aunque el dato exista, ni actividad de navegación que no esté
vinculada al contacto.

#### Scenario: WhatsApp leído
- **WHEN** un WhatsApp enviado figura como leído por Meta
- **THEN** la línea de tiempo muestra que se envió y no agrega un evento de lectura
