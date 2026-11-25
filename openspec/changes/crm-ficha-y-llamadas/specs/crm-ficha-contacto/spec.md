# Spec Delta

## Purpose

Define qué muestra la ficha de un contacto (`/contacts/[id]`), cómo se reacomoda en celular
y en escritorio, y quién puede verla y editarla según su rol.

## ADDED Requirements

### Requirement: Quién puede abrir la ficha
La ficha de un contacto SHALL poder abrirla un coordinador, un admin o un dueño para
cualquier contacto; un asesor solo si el contacto es suyo; y un abogado, o cualquier otro
rol, nunca. Para un asesor, un contacto es suyo si está asignado a él, si lo creó él, o si
ese contacto tiene un proceso o una tasación asignados a él. El permiso MUST decidirse en el
servidor, no en el menú ni en la pantalla.

#### Scenario: Coordinadora abre cualquier contacto
- **WHEN** una coordinadora abre `/contacts/<id>` de un contacto asignado a un asesor
- **THEN** ve la ficha completa de esa persona

#### Scenario: Asesor abre un contacto asignado a él
- **WHEN** un asesor abre la ficha de un contacto cuyo `assigned_to` es su usuario
- **THEN** ve la ficha completa

#### Scenario: Asesor abre un contacto que creó él
- **WHEN** un asesor abre la ficha de un contacto cuyo `created_by` es su usuario y que no tiene `assigned_to`
- **THEN** ve la ficha completa

#### Scenario: Asesor abre el contacto de un proceso suyo
- **WHEN** un asesor abre la ficha de un contacto que entró por el embudo, sin `assigned_to` ni `created_by`, y que tiene un proceso asignado a él
- **THEN** ve la ficha completa

#### Scenario: Asesor abre el contacto de una tasación suya
- **WHEN** un asesor abre la ficha de un contacto sin asesor asignado que tiene una tasación a su nombre
- **THEN** ve la ficha completa

#### Scenario: Asesor intenta abrir un contacto ajeno
- **WHEN** un asesor abre `/contacts/<id>` de un contacto que no tiene asignado, no creó y del que no tiene ningún proceso ni tasación a su nombre
- **THEN** la pantalla dice "No encontramos este contacto", no muestra ningún dato de la persona, y los pedidos de datos de esa ficha responden 404

#### Scenario: Asesor en un contacto que también atiende otro asesor
- **WHEN** un asesor abre la ficha de un contacto que tiene un proceso a su nombre y otro proceso, con su tasación y sus tareas, a nombre de otro asesor
- **THEN** ve la persona y toda la actividad (notas, llamadas y WhatsApp marcado), y en "Procesos", "Tasaciones agendadas", "Archivos" y "Tareas" ve solo lo que está a su nombre; lo del otro asesor no se lista ni se cuenta, y los pedidos por la red tampoco se lo devuelven

#### Scenario: Un proceso sin asesor tampoco se le lista
- **WHEN** un asesor abre la ficha de un contacto que creó él y que tiene una solicitud del embudo sin asesor asignado
- **THEN** la cabecera muestra la etapa "Solicitud", pero "Procesos" no lista esa solicitud ni "Tareas" las tareas de la coordinación sobre ella

#### Scenario: Su propia tarea se ve siempre
- **WHEN** ese asesor tiene una tarea asignada a él ligada a un proceso que no es suyo
- **THEN** esa tarea aparece en "Tareas" y entra en el número del título y de la pestaña

#### Scenario: Ningún enlace de la ficha lleva a una pantalla prohibida
- **WHEN** un asesor toca cualquier proceso, tasación o archivo listado en una ficha que puede abrir
- **THEN** la pantalla de destino abre, sin error de permiso

#### Scenario: Abogado
- **WHEN** un abogado abre `/contacts/<id>` o pide por la red los datos, la actividad o las tareas de un contacto
- **THEN** no ve ningún dato y cada pedido responde 403

#### Scenario: Sin sesión
- **WHEN** alguien sin sesión pide los datos de una ficha
- **THEN** recibe 401 y la pantalla lo manda a iniciar sesión

### Requirement: Editar un contacto respeta el mismo permiso
Los datos de un contacto SHALL poder editarlos solo quienes pueden abrir su ficha, y solo
coordinador, admin y dueño SHALL poder cambiar a quién está asignado. Un campo que no es
del contacto MUST ignorarse.

#### Scenario: Asesor intenta editar un contacto ajeno
- **WHEN** un asesor envía una edición de un contacto que no puede ver
- **THEN** recibe 404 y en la base el contacto no cambió

#### Scenario: Asesor intenta reasignarse un contacto
- **WHEN** un asesor edita un contacto suyo y manda en el pedido otro `assigned_to` o `created_by`
- **THEN** esos dos campos quedan como estaban y el resto de la edición se guarda

#### Scenario: Abogado intenta editar
- **WHEN** un abogado envía una edición de cualquier contacto
- **THEN** recibe 403 y en la base el contacto no cambió

#### Scenario: Asesor edita el contacto desde su proceso, como hoy
- **WHEN** un asesor abre `/pipeline/<id>` de un proceso asignado a él, cuyo contacto no tiene asesor asignado, toca "Editar" en el contacto, cambia el teléfono y guarda
- **THEN** el editor abre con los datos cargados, el cambio se guarda y no aparece ningún error

#### Scenario: Asesor edita el contacto desde su tasación, como hoy
- **WHEN** un asesor abre `/appraisals/<id>` de una tasación suya y edita el contacto vinculado
- **THEN** el editor abre con los datos cargados y el cambio se guarda

#### Scenario: Editar contacto desde la ficha
- **WHEN** en la ficha se toca "Editar contacto", se cambia el email y se guarda
- **THEN** se abre el editor de contacto de hoy con los datos cargados, y al guardar la cabecera y el bloque Contacto muestran el email nuevo sin recargar la página

### Requirement: La ficha se acomoda al ancho disponible
La ficha SHALL acomodarse según el ancho que le queda libre después del menú lateral, y no
según el ancho de la ventana: tres columnas con 960 px o más, dos columnas entre 640 y
959 px, y una columna con cabecera fija y pestañas con menos de 640 px, sin desplazamiento
horizontal en ningún ancho. (Diferencia a propósito con `crm-sistema-diseno`: ver el
escenario de 768 px con el menú abierto.)

#### Scenario: Escritorio a 1280 px
- **WHEN** se abre la ficha a 1280 px de ancho con el menú lateral abierto
- **THEN** se ven a la vez los datos de la persona a la izquierda, el cuadro "Nota | Registrar llamada" con la actividad al centro, y Tareas, Tasaciones agendadas, Procesos y Archivos a la derecha

#### Scenario: Tablet a 1024 px
- **WHEN** se abre la ficha a 1024 px de ancho con el menú lateral abierto
- **THEN** Tareas, Tasaciones agendadas, Procesos y Archivos aparecen debajo de los datos de la persona y la actividad ocupa la otra columna

#### Scenario: 768 px con el menú abierto
- **WHEN** se abre la ficha a 768 px de ancho con el menú lateral abierto
- **THEN** se ve la vista de una columna con cabecera fija, pestañas y el botón "+", sin desplazamiento horizontal ni texto cortado (la spec `crm-sistema-diseno` pedía dos columnas desde 768 px de ventana, pero la maqueta no tenía el menú lateral de 240 px; esta diferencia necesita el visto bueno del dueño antes de construirse)

#### Scenario: 768 px con el menú colapsado
- **WHEN** se abre la ficha a 768 px de ancho con el menú lateral colapsado
- **THEN** se ven dos columnas, sin desplazamiento horizontal ni texto cortado

#### Scenario: Celular a 390 px
- **WHEN** se abre la ficha a 390 px de ancho
- **THEN** se ve la cabecera fija con el nombre, la etapa, el estado de la última llamada y el botón de llamar, las pestañas "Actividad", "Datos" y "Tareas", y el botón "+", sin desplazamiento horizontal

#### Scenario: Menú lateral colapsado
- **WHEN** se colapsa el menú lateral con la ficha abierta a 1280 px
- **THEN** la ficha sigue en tres columnas y ningún texto queda cortado ni encimado

#### Scenario: Tres columnas antes de 1280 px con el menú colapsado
- **WHEN** se abre la ficha a 1100 px de ancho con el menú lateral colapsado
- **THEN** se ven tres columnas, sin desplazamiento horizontal ni texto cortado (la spec `crm-sistema-diseno` pedía tres columnas recién desde 1280 px de ventana; con el menú colapsado quedan 960 px libres desde unos 1056 px de ventana, y esta diferencia también necesita el visto bueno del dueño)

### Requirement: La cabecera fija del celular no se pierde al desplazar
En celular, la cabecera con el nombre y el botón de llamar SHALL quedar visible mientras se
desplaza la actividad, y el botón "+" SHALL quedar siempre a mano sin tapar el último
elemento de la lista.

#### Scenario: Desplazar una actividad larga
- **WHEN** en celular se desplaza hasta el final una ficha con más de veinte registros
- **THEN** la cabecera sigue arriba, el botón "+" sigue visible por encima de la barra inferior de navegación, y el último registro se lee entero

#### Scenario: Ficha sin ningún registro
- **WHEN** en celular se abre la ficha de un contacto sin actividad
- **THEN** el botón "+" está abajo a la derecha, justo encima de la barra inferior, y no flotando a mitad de pantalla

#### Scenario: Cabecera a 800 px con el menú abierto
- **WHEN** a 800 px de ancho con el menú abierto se desplaza la actividad
- **THEN** la cabecera fija ocupa todo el ancho del contenido y no se ve pasar ningún registro por los costados ni por arriba

### Requirement: La hoja "+" del celular
En celular, el botón "+" SHALL abrir una hoja titulada "Agregar" con las opciones
"Registrar llamada" y "Nota". Dentro de cada una SHALL haber un botón "Volver" que regresa a
ese menú sin perder lo escrito, y al cerrar la hoja y volver a abrirla SHALL mostrarse otra
vez el menú.

#### Scenario: Entrar y volver
- **WHEN** se toca "+", después "Registrar llamada" y después "Volver"
- **THEN** la hoja muestra otra vez "Agregar" con las dos opciones

#### Scenario: Título según la vista
- **WHEN** se entra a "Registrar llamada" o a "Nota"
- **THEN** el título de la hoja pasa a "Registrar llamada" o "Nota"

#### Scenario: Cerrar y reabrir
- **WHEN** se cierra la hoja estando en "Nota" y se vuelve a tocar "+"
- **THEN** la hoja abre en el menú "Agregar"

#### Scenario: Teclado abierto
- **WHEN** en celular se escribe un comentario con el teclado abierto
- **THEN** el botón "Guardar llamada" sigue visible, pegado al pie de la hoja

### Requirement: Cabecera con la persona y su proceso activo
La cabecera SHALL mostrar el nombre, el teléfono como enlace para llamar, el email, y la
etapa del proceso activo. El proceso activo es el proceso más reciente del contacto cuya
etapa no es Captada, Descartado ni Comprador. Un dato que falta no se dibuja. En celular, el
teléfono y el email van además en una tarjeta "Contacto" dentro de la pestaña Datos; en
escritorio esa tarjeta no existe y el email va en la cabecera.

#### Scenario: Tarjeta Contacto en celular
- **WHEN** se abre a 390 px la ficha de un contacto con teléfono y email y se toca la pestaña "Datos"
- **THEN** arriba de Detalles hay una tarjeta "Contacto" con el teléfono y el email, y la cabecera fija muestra el nombre, la etapa y el botón de llamar, sin el email

#### Scenario: Email en la cabecera en escritorio
- **WHEN** se abre la misma ficha a 1280 px
- **THEN** el email se lee en la cabecera y no hay tarjeta "Contacto" en la columna de datos

#### Scenario: Contacto con una solicitud abierta
- **WHEN** se abre la ficha de un contacto cuyo proceso más reciente está en etapa `request`
- **THEN** la cabecera muestra la etiqueta "Solicitud" con ícono y texto

#### Scenario: Contacto con un proceso cerrado y otro abierto
- **WHEN** el contacto tiene un proceso descartado creado ayer y uno en "Coordinada" creado la semana pasada
- **THEN** la cabecera muestra "Coordinada"

#### Scenario: Contacto sin proceso abierto
- **WHEN** todos los procesos del contacto están captados, descartados o son de comprador, o no tiene ninguno
- **THEN** la cabecera no muestra ninguna etiqueta de etapa

#### Scenario: Dos solicitudes abiertas de la misma persona
- **WHEN** la persona mandó dos veces el formulario de tasación y tiene dos solicitudes abiertas
- **THEN** la cabecera muestra "Solicitud" (el proceso activo es la más nueva) y "Procesos" lista las dos, cada una con su enlace y su botón "Coordinar tasación"

#### Scenario: Solicitud abierta y un proceso de clase gratuita más nuevo
- **WHEN** la persona tiene una solicitud abierta y después se anotó a la clase gratuita, que quedó como su proceso más reciente
- **THEN** la cabecera muestra "Clase Gratuita" (el proceso activo es el más reciente), y la solicitud sigue listada en "Procesos" con su botón "Coordinar tasación"

#### Scenario: Llamar desde el celular
- **WHEN** en celular se toca "Llamar · 11 5555-0142"
- **THEN** el teléfono abre el marcador con ese número

#### Scenario: Contacto sin teléfono
- **WHEN** el contacto no tiene teléfono cargado
- **THEN** no aparece el botón de llamar

### Requirement: Estado de la última llamada
La cabecera SHALL decir cuándo fue la última llamada registrada al contacto: "Sin llamar
todavía", "Última llamada: hoy", "Última llamada: ayer" o "Última llamada: hace N días",
contando días de calendario de Argentina. Solo cuentan las llamadas no anuladas, con
cualquier resultado; una nota o un WhatsApp marcado no la mueven.

#### Scenario: Nunca se llamó
- **WHEN** el contacto no tiene ninguna llamada registrada
- **THEN** la cabecera dice "Sin llamar todavía"

#### Scenario: Llamada de hoy
- **WHEN** la última llamada se registró hoy
- **THEN** la cabecera dice "Última llamada: hoy"

#### Scenario: Llamada de hace tres días
- **WHEN** la última llamada fue hace tres días de calendario
- **THEN** la cabecera dice "Última llamada: hace 3 días"

#### Scenario: Una nota no cuenta
- **WHEN** la última llamada fue hace tres días y hoy se guarda una nota o se marca un WhatsApp
- **THEN** la cabecera sigue diciendo "Última llamada: hace 3 días"

#### Scenario: La llamada anulada no cuenta
- **WHEN** se anula la única llamada del contacto
- **THEN** la cabecera vuelve a decir "Sin llamar todavía"

#### Scenario: Cambio de día según Argentina
- **WHEN** una llamada se registró a las 23:30 de Argentina y se mira la ficha a las 00:30 de Argentina del día siguiente
- **THEN** la cabecera dice "Última llamada: ayer"

#### Scenario: La última llamada es de la persona, no del proceso
- **WHEN** a la persona se la llamó ayer por un proceso viejo y hoy entra una solicitud nueva suya, todavía sin llamadas
- **THEN** la cabecera dice "Última llamada: ayer", aunque la próxima llamada sobre la solicitud nueva vaya a ser su "Llamada 1" (el número de intento se cuenta por proceso; la última llamada, por persona)

### Requirement: Alerta solo cuando la solicitud está sin atender
El estado de la última llamada SHALL mostrarse como alerta (ícono de aviso y texto, además
del color) únicamente cuando el proceso activo está en Solicitud y nunca se llamó, o la
última llamada fue hace dos días o más.

#### Scenario: Solicitud sin llamar
- **WHEN** el proceso activo está en Solicitud y no hay llamadas
- **THEN** "Sin llamar todavía" se muestra como alerta, con ícono de aviso

#### Scenario: Solicitud llamada ayer
- **WHEN** el proceso activo está en Solicitud y la última llamada fue ayer
- **THEN** "Última llamada: ayer" se muestra sin alerta

#### Scenario: Proceso coordinado sin llamadas
- **WHEN** el proceso activo está en Coordinada y no hay llamadas
- **THEN** "Sin llamar todavía" se muestra sin alerta

#### Scenario: Solicitud nueva de alguien llamado ayer por otro proceso
- **WHEN** el proceso activo es una solicitud nueva sin llamadas propias y la última llamada a la persona fue ayer, por un proceso anterior
- **THEN** la cabecera dice "Última llamada: ayer" sin alerta, y no "Sin llamar todavía"; la alerta aparece recién cuando esa última llamada tenga dos días o más

### Requirement: Detalles solo con datos reales
El bloque Detalles SHALL mostrar etapa, origen, campaña, conjunto, anuncio, asesor,
dirección, barrio, tipo de propiedad, ambientes y superficie del proceso activo (o del más
reciente si no hay activo), dibujando solo los que tienen valor. El asesor es la excepción:
si falta, dice "Sin asignar todavía". La excepción para el asesor está en «Detalles
cuando el proceso activo es de otro».

#### Scenario: Lead del embudo con campaña
- **WHEN** el proceso activo tiene origen `embudo`, nombre de campaña, barrio y ambientes
- **THEN** Detalles muestra "Embudo", la campaña, el barrio y los ambientes, y no dibuja renglones vacíos para lo demás

#### Scenario: Renglón de etapa
- **WHEN** el proceso activo está en Solicitud
- **THEN** Detalles muestra "Etapa: Solicitud", con la misma etiqueta que usa el CRM

#### Scenario: Sin asesor
- **WHEN** ni el proceso activo ni el contacto tienen asesor asignado
- **THEN** Detalles muestra "Asesor: Sin asignar todavía"

#### Scenario: Contacto sin procesos
- **WHEN** el contacto no tiene ningún proceso
- **THEN** Detalles muestra solo el origen del contacto, si lo tiene, y el asesor

### Requirement: Detalles cuando el proceso activo es de otro
Cuando el proceso del que salen los Detalles (el activo o, si no hay, el más reciente) no
está a nombre del asesor que mira, Detalles SHALL mostrar de ese proceso solo la etapa, y
solo si está abierto. Sus demás datos, y también la etapa si está cerrado, MUST NOT
mostrarse ni viajar en la respuesta del servidor. Se muestran el origen y el asesor del
contacto, si los tiene.

#### Scenario: Asesor con el proceso activo de otro
- **WHEN** un asesor abre la ficha de un contacto que puede ver por un proceso viejo suyo, y el proceso activo es una solicitud del embudo con campaña y dirección, asignada a otro asesor
- **THEN** Detalles muestra "Etapa: Solicitud" y no muestra la dirección, el barrio, la campaña ni el origen de ese proceso; y la respuesta del servidor tampoco los trae

#### Scenario: Renglón Asesor cuando el proceso activo es de otro
- **WHEN** ese mismo asesor mira el renglón "Asesor"
- **THEN** si el contacto tiene asesor asignado se lee ese nombre, y si no lo tiene el renglón no se dibuja; nunca dice "Sin asignar todavía" ni muestra el nombre de quien lleva el proceso ajeno

#### Scenario: Sin proceso abierto y el último proceso es de otro
- **WHEN** un asesor abre la ficha de un contacto que creó él, que no tiene ningún proceso abierto y cuyo proceso más reciente es uno descartado de otro asesor (o sin asesor), con dirección y campaña
- **THEN** Detalles no muestra el renglón Etapa, ni la dirección, el barrio, la campaña, el origen ni el asesor de ese proceso, y la respuesta del servidor tampoco los trae; se ven solo el origen y el asesor del contacto, si los tiene, y la cabecera no muestra ninguna etiqueta de etapa

#### Scenario: Sin proceso abierto y el último proceso es propio
- **WHEN** un asesor abre la ficha de un contacto sin ningún proceso abierto, cuyo proceso más reciente es uno descartado a su nombre
- **THEN** Detalles muestra "Etapa: Descartado" y los datos de ese proceso que tienen valor

### Requirement: Background editable en el lugar
El bloque Background SHALL mostrar el texto guardado sobre la persona y permitir editarlo
sin salir de la ficha. Sin texto, muestra el botón "Agregar".

#### Scenario: Guardar el background
- **WHEN** se toca "Editar", se cambia el texto y se toca "Guardar"
- **THEN** aparece "Background guardado.", el texto nuevo queda a la vista y en la base `contacts.notes` tiene ese texto

#### Scenario: Cancelar
- **WHEN** se toca "Editar", se cambia el texto y se toca "Cancelar"
- **THEN** vuelve a verse el texto anterior y la base no cambió

#### Scenario: Sin background
- **WHEN** el contacto no tiene texto de background
- **THEN** el bloque muestra solo el botón "Agregar"

### Requirement: La actividad muestra notas, llamadas y WhatsApp marcado
La zona de actividad SHALL listar únicamente las notas, las llamadas y las marcas de
"WhatsApp enviado" no anuladas del contacto, de la más nueva a la más vieja, de a 50 con
"Ver más". Otros eventos (cambios de etapa, mensajes del sistema, emails, videos) no
aparecen en este change.

#### Scenario: Orden
- **WHEN** un contacto tiene una nota de ayer y una llamada de hoy
- **THEN** la llamada aparece primera y la nota segunda

#### Scenario: Anatomía de una llamada
- **WHEN** se mira una llamada registrada ayer a las 10:15 por Paula
- **THEN** se lee "Llamada 1 · No atendió" con su ícono, "Paula" y "ayer", y al tocar la fecha se ven el día y la hora exactos

#### Scenario: Contacto sin actividad
- **WHEN** el contacto no tiene notas, llamadas ni WhatsApp marcado
- **THEN** la zona dice "Sin actividad todavía" y no muestra una lista vacía

#### Scenario: Más de 50 registros
- **WHEN** el contacto tiene 60 registros
- **THEN** se ven los 50 más nuevos y un botón "Ver más" que trae los 10 restantes

#### Scenario: Nada que no se mide
- **WHEN** se abre cualquier ficha
- **THEN** no aparece ningún registro del tipo "abrió el email", "hizo clic" o "leyó el WhatsApp"

### Requirement: Filtros de la actividad
La actividad SHALL poder filtrarse por "Todo", "Llamadas" (solo llamadas), "Notas" y
"Actividad" (lo que no es llamada ni nota: en este change, las marcas de "WhatsApp
enviado"), igual que en la maqueta aprobada. Un filtro sin resultados MUST mostrar su
mensaje de vacío, con la acción para crear el primero cuando existe.

#### Scenario: Filtrar llamadas
- **WHEN** se toca el filtro "Llamadas" en un contacto con dos llamadas, un WhatsApp marcado y una nota
- **THEN** se ven las dos llamadas, y no el WhatsApp marcado ni la nota

#### Scenario: Filtrar actividad
- **WHEN** se toca el filtro "Actividad" en ese mismo contacto
- **THEN** se ve solo el WhatsApp marcado

#### Scenario: Sin llamadas
- **WHEN** se toca "Llamadas" en un contacto sin llamadas
- **THEN** se lee "Todavía no hay llamadas", "Cuando registres una, aparece acá con su resultado." y un botón "Registrar llamada" que abre el formulario

#### Scenario: Sin notas
- **WHEN** se toca "Notas" en un contacto sin notas
- **THEN** se lee "Todavía no hay notas" y un botón "Escribir una nota" que abre el campo de nota

#### Scenario: Sin actividad de otro tipo
- **WHEN** se toca "Actividad" en un contacto sin WhatsApp marcado
- **THEN** se lee "Sin actividad todavía"

### Requirement: Tareas del contacto en la ficha
El bloque Tareas SHALL listar las tareas pendientes ligadas al contacto o a cualquiera de
sus procesos, con su vencimiento y a quién están asignadas, y permitir crear una nueva y
completar una existente. Sin tareas muestra solo el botón "+ Tarea". Para un asesor, de las
tareas ligadas a un proceso que no está a su nombre se listan solo las que están asignadas
a él (ver «Quién puede abrir la ficha»).

#### Scenario: Contacto con dos tareas pendientes
- **WHEN** el contacto tiene una tarea ligada a él y otra ligada a su proceso
- **THEN** el bloque muestra las dos, el título dice "Tareas · 2" y, en celular, la pestaña "Tareas" muestra el número 2

#### Scenario: Sin tareas
- **WHEN** el contacto no tiene tareas pendientes
- **THEN** el bloque muestra solo la cabecera con "+ Tarea" y la pestaña "Tareas" no muestra número

#### Scenario: Crear una tarea
- **WHEN** se toca "+ Tarea", se completa el formulario y se guarda
- **THEN** la tarea aparece en el bloque sin recargar la página y en la base tiene el `contact_id` de este contacto

#### Scenario: Completar una tarea
- **WHEN** se marca como hecha una tarea del bloque
- **THEN** desaparece del bloque y en la base su estado es `completed`

#### Scenario: Tarea vencida
- **WHEN** una tarea del bloque venció hace dos días
- **THEN** lo dice con texto ("Vencida hace 2 días"), además del color

#### Scenario: La tasación agendada no se repite
- **WHEN** el contacto tiene una tasación agendada y la tarea "nueva asignación" de esa tasación
- **THEN** la tasación aparece en "Tasaciones agendadas" y esa tarea no se lista en Tareas

#### Scenario: El número cuenta lo que se lista
- **WHEN** el contacto tiene una tasación agendada con su tarea "nueva asignación" y además una tarea de llamada pendiente
- **THEN** el bloque lista solo la tarea de llamada, el título dice "Tareas · 1" y, en celular, la pestaña "Tareas" muestra el número 1

### Requirement: Tasaciones agendadas, Procesos y Archivos solo si existen
Los bloques "Tasaciones agendadas", "Procesos" y "Archivos" SHALL aparecer únicamente
cuando el contacto tiene algo que mostrar en cada uno, y cada ítem SHALL llevar a su
pantalla de hoy. Para un asesor, cada bloque muestra solo lo que está a su nombre (ver
«Quién puede abrir la ficha»): si no tiene nada propio en un bloque, ese bloque no aparece.

#### Scenario: Contacto con un proceso
- **WHEN** el contacto tiene un proceso
- **THEN** "Procesos" lo muestra con su etapa y al tocarlo abre `/pipeline/<id>`

#### Scenario: Contacto con tasación coordinada
- **WHEN** el contacto tiene un proceso en Coordinada con día y hora
- **THEN** "Tasaciones agendadas" muestra el día, la hora, la dirección y el asesor, y al tocarla abre `/pipeline/<id>` de ese proceso

#### Scenario: Contacto sin archivos
- **WHEN** el contacto no tiene tasaciones hechas ni propiedades vinculadas
- **THEN** el bloque "Archivos" no aparece

#### Scenario: Contacto con una tasación hecha
- **WHEN** el contacto tiene una tasación vinculada
- **THEN** "Archivos" la muestra y al tocarla abre `/appraisals/<id>`

### Requirement: Cada bloque carga y falla por separado
Los datos de la persona, la actividad y las tareas SHALL cargarse por separado, cada uno
con su estado de carga y de error con "Reintentar". Un bloque que no pudo cargar MUST
decirlo y nunca mostrar un vacío o un cero en su lugar.

#### Scenario: Falla la actividad
- **WHEN** el pedido de la actividad falla y los otros dos responden bien
- **THEN** la zona de actividad dice "No se pudo cargar" con un botón "Reintentar", y la cabecera, los datos y las tareas se ven y funcionan

#### Scenario: Reintentar
- **WHEN** se toca "Reintentar" y el pedido responde bien
- **THEN** el bloque muestra sus datos sin recargar la página

#### Scenario: El servidor tarda de más
- **WHEN** un pedido de la ficha recibe una respuesta que no es JSON
- **THEN** el bloque muestra "No se pudo cargar" con "Reintentar", y no un texto técnico

### Requirement: Uso táctil de la ficha
En celular y en toda pantalla táctil (incluidas las tablets desde 768 px), todo elemento
tocable de la ficha SHALL medir al menos 44 × 44 px y todo campo de texto SHALL usar letra
de 16 px o más, igual que pide la spec `crm-sistema-diseno`. Con mouse, desde 768 px los
controles pueden medir 36 px y los campos usar 14 px.

#### Scenario: Campo de nota en iPhone
- **WHEN** se toca el campo de nota en un iPhone
- **THEN** la pantalla no hace zoom automático

#### Scenario: Filtros y pestañas
- **WHEN** se miden en 390 px las pestañas, los filtros, el botón "+" y los resultados de llamada
- **THEN** cada uno mide 44 px o más de alto

#### Scenario: Tablet táctil
- **WHEN** se abre la ficha en una tablet táctil de 1024 px, donde se ven dos columnas
- **THEN** los filtros, los resultados de llamada, el menú "⋯" y los botones siguen midiendo 44 px de alto y los campos siguen con letra de 16 px

### Requirement: Coordinar la tasación sin duplicar el proceso
Desde la ficha, "Coordinar tasación" SHALL abrir el formulario de coordinación de hoy con
los datos de la persona y de su solicitud ya cargados, y al guardarlo la misma solicitud
SHALL pasar a Coordinada, sin crear un segundo proceso ni un segundo contacto. Una solicitud
la puede convertir un coordinador, un admin o un dueño, y un asesor solo si está asignada a él.

#### Scenario: Formulario precargado
- **WHEN** una coordinadora toca "Coordinar tasación", en el aviso o en el bloque "Procesos", en la ficha de un contacto con una solicitud abierta
- **THEN** se abre el formulario "Coordinar Tasación" con nombre, teléfono, email, dirección, barrio, tipo y ambientes ya completos con lo que se conoce

#### Scenario: La solicitud se convierte
- **WHEN** se completa día, hora y asesor en ese formulario y se guarda
- **THEN** el contacto sigue teniendo un solo proceso, ahora en etapa `scheduled` con ese día, hora y asesor, y se generan el aviso y la tarea al asesor igual que en una coordinación de hoy

#### Scenario: Queda anotado quién coordinó
- **WHEN** una coordinadora convierte una solicitud del embudo, que no tenía cargado quién la creó
- **THEN** el proceso queda con esa coordinadora como quien lo coordinó, el email de aviso la nombra y le llega su confirmación, y el origen del proceso sigue siendo `embudo`

#### Scenario: Proceso que viene de la clase gratuita
- **WHEN** se envía por la red la conversión de un proceso cuyo origen es `clase_gratuita`
- **THEN** responde 409, el proceso no cambia y no sale ningún email; y la ficha de ese contacto ofrece "Coordinar tasación" como proceso nuevo, no como conversión

#### Scenario: Solicitud sin día
- **WHEN** el proceso activo está en etapa `scheduled` sin día cargado y se coordina desde la ficha
- **THEN** ese mismo proceso queda con día, hora y asesor, y no se crea otro

#### Scenario: Se corrige el email en el formulario
- **WHEN** en el formulario precargado se cambia el email o el teléfono de la persona y se guarda
- **THEN** el proceso sigue ligado al mismo contacto, ese contacto queda con el email y el teléfono nuevos, y no se creó ningún contacto nuevo

#### Scenario: El email corregido ya es de otro contacto
- **WHEN** en el formulario precargado se escribe un email o un teléfono que ya tiene otro contacto y se guarda
- **THEN** la tasación queda coordinada sobre el contacto del proceso, el otro contacto no se modifica, y la pantalla avisa "Ya hay otro contacto con ese email o teléfono: revisá si es la misma persona"

#### Scenario: Conversión pedida sin día
- **WHEN** llega por la red la conversión de una solicitud sin el día de la tasación, o con el día mal escrito
- **THEN** responde 400, el proceso sigue en Solicitud y no sale ningún email

#### Scenario: El asesor de la tasación puede abrir la ficha
- **WHEN** se coordina la tasación de un contacto que no tenía asesor asignado
- **THEN** el asesor de la tasación puede abrir la ficha de ese contacto, porque el proceso está a su nombre, y el `assigned_to` del contacto no cambia

#### Scenario: La solicitud ya no está en Solicitud
- **WHEN** se guarda el formulario, con el email de la persona corregido, y el proceso ya había sido movido por otra persona
- **THEN** no se modifica nada, tampoco el email del contacto, y la pantalla avisa "El proceso ya cambió de etapa"

#### Scenario: Asesor intenta convertir una solicitud ajena
- **WHEN** un asesor envía por la red la conversión de una solicitud que no está asignada a él
- **THEN** responde 404, el proceso no cambia y no queda a su nombre

#### Scenario: Quien no puede convertir no ve el botón
- **WHEN** el proceso ya está en Coordinada o en una etapa posterior, o viene de la clase gratuita, o quien mira es un asesor y la solicitud no está asignada a él
- **THEN** la ficha no muestra para ese proceso el botón "Coordinar tasación" que convierte la solicitud, ni en el aviso ni en "Procesos"

#### Scenario: Persona sin solicitud abierta
- **WHEN** se toca "Coordinar tasación" en el aviso de un contacto sin proceso activo, o con el proceso activo en Clase gratuita
- **THEN** el formulario abre con nombre, teléfono y email cargados y la propiedad vacía, y al guardarlo se crea un proceso nuevo ligado a ese mismo contacto, sin crear otro contacto

#### Scenario: Se completa el email que faltaba
- **WHEN** el contacto no tenía email, se toca "Coordinar tasación", se escribe el email en el formulario y se guarda
- **THEN** el proceso nuevo queda ligado a ese mismo contacto y el contacto queda con ese email

#### Scenario: Pedido con proceso y contacto a la vez
- **WHEN** llega por la red un pedido de coordinación que indica a la vez una solicitud a convertir y un contacto
- **THEN** responde 400 y no se crea ni se modifica nada

#### Scenario: Coordinar sin la ficha sigue igual
- **WHEN** se entra a "Coordinar tasación" desde el menú, sin venir de una ficha
- **THEN** el formulario arranca vacío y se comporta exactamente como hoy

### Requirement: Coordinar tasación tiene un lugar fijo en la ficha
"Coordinar tasación" SHALL estar en dos lugares: en el aviso que aparece al guardar una
llamada "Atendió y agendó", y de forma fija en el bloque "Procesos", como botón en cada
solicitud listada que quien mira puede convertir, para que no se pierda al cerrar el aviso,
recargar o abrir la ficha en otro dispositivo. Al guardar el formulario abierto desde la
ficha, la pantalla SHALL volver a esa ficha.

#### Scenario: Cierro el aviso, recargo y sigo pudiendo coordinar
- **WHEN** una coordinadora registra "Atendió y agendó" sobre una solicitud, cierra el aviso con la X, sale de la ficha y vuelve a abrirla más tarde
- **THEN** en "Procesos" esa solicitud muestra el botón "Coordinar tasación", que abre el formulario precargado de esa misma solicitud; no hace falta cargar otra llamada ni entrar por el menú

#### Scenario: Volver a la ficha al guardar
- **WHEN** se guarda el formulario de coordinar que se abrió desde la ficha, con una solicitud o con una persona sin solicitud
- **THEN** la pantalla vuelve a `/contacts/<id>` de esa persona, el proceso coordinado figura en "Tasaciones agendadas", y la cabecera muestra la etapa del proceso activo ("Coordinada" si el coordinado es el más reciente; con dos solicitudes, si se coordinó la más vieja, sigue diciendo "Solicitud")

#### Scenario: Sin solicitud no hay botón fijo
- **WHEN** se abre la ficha de un contacto sin ninguna solicitud abierta (sin procesos, o solo con uno de clase gratuita o ya coordinado)
- **THEN** ningún ítem de "Procesos" muestra "Coordinar tasación"; para esa persona, coordinar es abrir un proceso nuevo, desde el aviso de "Atendió y agendó" o desde el menú, que reutiliza el contacto por su email o su teléfono como hoy

#### Scenario: El botón en celular
- **WHEN** en 390 px se mira una solicitud listada en "Procesos" que quien mira puede convertir
- **THEN** el botón "Coordinar tasación" se ve entero, mide 44 px o más de alto y no tapa el enlace al proceso

### Requirement: Cerrar el proceso lo decide la persona
"Marcar proceso como perdido" SHALL pasar el proceso activo a Descartado solo cuando una
persona con permiso lo toca, y SHALL ofrecer "Deshacer". Deshacer SHALL dejar el proceso
como estaba antes de marcarlo, incluida la fecha en que se lo cuenta como perdido, y solo
vale en los minutos siguientes. Ninguna otra acción de la ficha cambia la etapa de un proceso.

#### Scenario: Marcar como perdido
- **WHEN** se toca "Marcar proceso como perdido" en el aviso posterior a una llamada
- **THEN** aparece "Proceso marcado como perdido." con "Deshacer", en la base el proceso está en etapa `lost`, y la cabecera deja de mostrar esa etapa

#### Scenario: Proceso con tasación agendada
- **WHEN** se marca como perdido un proceso que estaba en Coordinada con día y hora
- **THEN** el aviso agrega " Se quitó la tasación agendada." y el bloque "Tasaciones agendadas" deja de mostrarla

#### Scenario: Deshacer
- **WHEN** se toca "Deshacer" en ese aviso
- **THEN** el proceso vuelve a la etapa en la que estaba, la cabecera la muestra otra vez, y en la base `lost_at` queda vacío, de modo que ese proceso no cuenta como perdido en las métricas

#### Scenario: Deshacer en una solicitud a la que le faltan datos
- **WHEN** se deshace el "perdido" de una solicitud cuyo contacto no tiene email cargado
- **THEN** el proceso vuelve igual a Solicitud, sin pedir que se completen datos

#### Scenario: Deshacer fuera de tiempo
- **WHEN** llega por la red un pedido de deshacer un proceso descartado hace más de diez minutos, o que después de descartado volvió a cambiar de etapa
- **THEN** responde 409 y el proceso queda como estaba

#### Scenario: Descartado desde la pantalla del proceso
- **WHEN** llega por la red, dentro de los diez minutos, un pedido de deshacer un proceso que se descartó con "Descartar" en `/pipeline/<id>` y no desde la ficha
- **THEN** se deshace igual (200): los dos caminos dejan el mismo rastro y no se distinguen

#### Scenario: Falla al marcar
- **WHEN** se toca "Marcar proceso como perdido" y el servidor responde con error
- **THEN** la pantalla avisa que no se pudo, el aviso con los dos botones sigue a la vista y el proceso sigue en su etapa

#### Scenario: Asesor sobre un proceso ajeno
- **WHEN** un asesor pide por la red deshacer o cerrar desde la ficha un proceso que no está asignado a él
- **THEN** no ve el botón en pantalla y el pedido de deshacer responde 404

#### Scenario: Rol viejo sin lugar en la ficha
- **WHEN** un usuario con el rol viejo `agent` pide por la red deshacer el "perdido" de cualquier proceso
- **THEN** responde 404 y el proceso sigue descartado

#### Scenario: Las tareas no se cierran solas
- **WHEN** se marca como perdido un proceso que tiene pendiente la tarea "Llamada 2"
- **THEN** esa tarea sigue pendiente en el bloque Tareas, para completarla a mano

#### Scenario: Dejarlo abierto
- **WHEN** se toca "Dejarlo abierto"
- **THEN** el aviso se cierra y el proceso sigue en su etapa

### Requirement: Cómo se llega a la ficha
El nombre del contacto SHALL ser un enlace a su ficha en la lista de `/contacts`, en cada
tarjeta de `/crm` y en la pantalla del proceso `/pipeline/<id>`. El enlace SHALL dibujarse
solo para quien puede abrir esa ficha, y el resto de cada pantalla SHALL seguir funcionando
como hoy.

#### Scenario: Desde el CRM
- **WHEN** una coordinadora toca el nombre de la persona en una tarjeta de `/crm`
- **THEN** se abre `/contacts/<id>` de esa persona, y tocar el resto de la tarjeta sigue abriendo el proceso como hoy

#### Scenario: Desde el proceso
- **WHEN** una coordinadora toca el nombre del contacto en `/pipeline/<id>`
- **THEN** se abre la ficha de ese contacto

#### Scenario: Desde la lista de contactos
- **WHEN** se toca una persona en `/contacts`
- **THEN** se abre su ficha nueva

#### Scenario: Asesor desde un proceso suyo
- **WHEN** un asesor toca el nombre del contacto en `/crm` o en `/pipeline/<id>` de un proceso asignado a él, cuyo contacto entró por el embudo sin asesor asignado
- **THEN** se abre la ficha completa, y no "No encontramos este contacto"

#### Scenario: Abogado
- **WHEN** un abogado mira una pantalla donde aparece el nombre de un contacto
- **THEN** el nombre es texto simple, sin enlace

#### Scenario: Proceso sin contacto
- **WHEN** un proceso no tiene contacto vinculado
- **THEN** el nombre se muestra como hoy, sin enlace

### Requirement: La ficha no envía nada al cliente
La ficha SHALL NOT ofrecer ninguna acción que envíe un WhatsApp, un email u otro mensaje al
cliente, ni llamar desde la plataforma.

#### Scenario: Acciones disponibles
- **WHEN** se recorren todos los botones de la ficha en celular y en escritorio
- **THEN** las únicas acciones sobre la persona son llamar con el teléfono propio, escribir una nota, registrar una llamada, marcar un WhatsApp como enviado, crear o completar una tarea, editar sus datos, coordinar la tasación y cerrar el proceso
