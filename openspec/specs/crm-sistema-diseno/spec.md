# crm-sistema-diseno Specification

## Purpose

Define las reglas visuales y de comportamiento que cumplen todas las pantallas del módulo
CRM (ficha de contacto, llamadas, pendientes, campanita e Inicio), en celular y en escritorio.
Describe la maqueta que el dueño aprobó el 2026-11-25 (`maqueta/index.html` y sus capturas).

## Requirements

### Requirement: Diseño aprobado antes de programar
Ninguna pantalla del módulo CRM SHALL programarse sin que el dueño haya aprobado su maqueta
en celular y en escritorio.

#### Scenario: Aprobación registrada
- **WHEN** el dueño aprueba la maqueta
- **THEN** la aprobación queda escrita con fecha en el change, junto con capturas de cada pantalla en 390 px y 1280 px

### Requirement: La ficha se reacomoda según el ancho
La ficha de contacto SHALL acomodarse según el ancho que le queda libre después del menú
lateral, y no según el ancho de la ventana: tres columnas (persona, actividad, tareas y
procesos) con 960 px libres o más, dos columnas entre 640 y 959 px libres, y una sola
columna con pestañas con menos de 640 px libres, sin desplazamiento horizontal en ningún
ancho.

#### Scenario: Escritorio
- **WHEN** se abre la ficha a 1280 px de ancho con el menú lateral abierto
- **THEN** se ven a la vez los datos de la persona a la izquierda, el cuadro de nota/llamada con la línea de tiempo al centro, y tareas, tasaciones y procesos a la derecha

#### Scenario: Celular
- **WHEN** se abre la ficha a 390 px de ancho
- **THEN** se ve una cabecera fija con nombre, etapa, botón de llamar y hace cuánto fue el último contacto (o "Sin contacto todavía"), y las pestañas Actividad, Datos y Tareas, sin desplazamiento horizontal

#### Scenario: Tablet
- **WHEN** se abre la ficha a 1024 px de ancho con el menú lateral abierto
- **THEN** el contenido de la columna derecha aparece debajo de los datos de la persona y la actividad ocupa la otra columna

#### Scenario: 768 px con el menú abierto
- **WHEN** se abre la ficha a 768 px de ancho con el menú lateral abierto
- **THEN** se ve la vista de una columna con cabecera fija y pestañas, y no dos columnas, sin desplazamiento horizontal ni texto cortado

#### Scenario: 768 px con el menú colapsado
- **WHEN** se abre la ficha a 768 px de ancho con el menú lateral colapsado
- **THEN** se ven dos columnas, sin desplazamiento horizontal ni texto cortado

#### Scenario: Tres columnas antes de 1280 px con el menú colapsado
- **WHEN** se abre la ficha a 1100 px de ancho con el menú lateral colapsado
- **THEN** se ven tres columnas, sin desplazamiento horizontal ni texto cortado

#### Scenario: Sin enviar mensajes desde la ficha
- **WHEN** se mira la ficha en cualquier ancho
- **THEN** el email se muestra como texto y no hay ningún botón ni enlace para enviar un email o un WhatsApp

### Requirement: Registrar una llamada en pocos toques
En celular, registrar el resultado de una llamada SHALL requerir como máximo tres toques
desde la ficha, sin escribir texto obligatorio. Los resultados SHALL ser cinco: No atendió,
Atendió y agendó, Atendió · volver a llamar, Atendió · no le interesa y Número equivocado.
El detalle de la cadencia vive en la spec del change `crm-ficha-y-llamadas`.

#### Scenario: No atendió
- **WHEN** en la ficha en celular se toca el botón "+", luego "Registrar llamada", luego el resultado "No atendió"
- **THEN** la llamada queda guardada con ese tercer toque y aparece primera en la línea de tiempo

#### Scenario: Los demás resultados
- **WHEN** se elige un resultado distinto de "No atendió"
- **THEN** queda un único botón "Guardar llamada" y la llamada no se guarda hasta tocarlo

#### Scenario: Volver a llamar
- **WHEN** se elige "Atendió · volver a llamar"
- **THEN** se piden día y hora futuros, con tres atajos ("Hoy 16:00", "Mañana 10:00", "Mañana 16:00"), y sin ellos no se puede guardar

#### Scenario: Marcar WhatsApp enviado
- **WHEN** se toca "Marcar WhatsApp enviado"
- **THEN** queda anotado en la línea de tiempo y el texto aclara que la plataforma no envía ningún mensaje

### Requirement: Después de guardar se ve qué pasó
Después de guardar una llamada, la ficha SHALL mostrar un aviso que diga qué tarea se creó
sola y cuál se completó sola, y un aviso breve con la acción "Deshacer".

#### Scenario: Primera llamada sin atender
- **WHEN** se registra "No atendió" en una persona que tenía la tarea "Llamar" pendiente
- **THEN** el aviso dice que se agendó la "Llamada 2" con su día y hora, que la tarea "Llamar" se completó sola, y ofrece "Deshacer"

### Requirement: La etapa nunca cambia sola
Registrar una llamada o marcar un WhatsApp SHALL NOT cambiar la etapa del proceso. La etapa
SHALL cambiar solo cuando la persona toca un botón explícito. El aviso SHALL ofrecer ese
botón solo a quien puede usarlo y solo cuando corresponde a la situación del proceso; cada
caso, con su texto exacto, está en la capacidad `crm-cadencia-llamadas`, requisito "Los
resultados que no agendan ofrecen el paso siguiente".

#### Scenario: Atendió y agendó
- **WHEN** una coordinadora, o el asesor que tiene asignada esa solicitud, guarda una llamada con resultado "Atendió y agendó" en un contacto con una solicitud abierta
- **THEN** la etapa sigue igual y el aviso ofrece el botón "Coordinar tasación"

#### Scenario: Atendió y agendó sin nada para coordinar o sin poder hacerlo
- **WHEN** se guarda "Atendió y agendó" con el proceso activo ya en Coordinada, o lo guarda un asesor sobre una solicitud que no está asignada a él
- **THEN** la etapa sigue igual y el aviso no ofrece "Coordinar tasación"

#### Scenario: No le interesa o número equivocado
- **WHEN** una persona que puede cerrar ese proceso guarda una llamada con resultado "Atendió · no le interesa" o "Número equivocado" en un contacto con un proceso activo
- **THEN** la etapa sigue igual y el aviso ofrece "Marcar proceso como perdido" y "Dejarlo abierto"

#### Scenario: No le interesa sin proceso o sin poder cerrarlo
- **WHEN** se guarda "Atendió · no le interesa" o "Número equivocado" en un contacto sin proceso activo, o lo guarda un asesor y el proceso activo no está asignado a él
- **THEN** la etapa sigue igual y el aviso no ofrece "Marcar proceso como perdido"

### Requirement: Nada de adorno
Toda sección, botón o indicador visible SHALL tener datos reales o una acción que funciona.
Una sección sin datos no se muestra, salvo que ofrezca la acción de crear el primero.

#### Scenario: Contacto sin archivos
- **WHEN** un contacto no tiene tasaciones ni propiedades vinculadas
- **THEN** la sección Archivos no aparece

#### Scenario: Contacto sin tareas
- **WHEN** un contacto no tiene tareas pendientes
- **THEN** la sección Tareas muestra solo el botón para crear una

#### Scenario: Evento que hoy no se puede medir
- **WHEN** la plataforma no puede saber si alguien abrió un email, hizo clic o leyó un WhatsApp
- **THEN** esos eventos no aparecen en la ficha

#### Scenario: Email enviado a la persona
- **WHEN** el inventario de emails del change `crm-linea-de-tiempo` no confirma que ese email se le envía a la persona
- **THEN** el evento "Se le envió el email" no se muestra (en la maqueta ese evento es un ejemplo: que aparezca en la ficha real depende de ese inventario)

### Requirement: Estados de carga, vacío y error
Cada bloque que trae datos SHALL tener estado de carga, de vacío y de error con reintento,
y nunca mostrar un cero cuando el dato no se pudo consultar.

#### Scenario: Falla una consulta
- **WHEN** un bloque no puede traer sus datos
- **THEN** muestra "No se pudo cargar" con un botón Reintentar, y el resto de la pantalla sigue funcionando

### Requirement: Uso táctil
En celular y en toda pantalla táctil (incluidas las tablets desde 768 px), todo elemento
tocable SHALL medir al menos 44 × 44 px y todo campo de texto SHALL usar letra de 16 px o
más. Con mouse, desde 768 px los controles pueden medir 36 px y los campos usar 14 px.

#### Scenario: Campo de nota en iPhone
- **WHEN** se toca el campo de nota en un iPhone
- **THEN** la pantalla no hace zoom automático

#### Scenario: Tablet táctil
- **WHEN** se abre cualquier pantalla en una tablet táctil de 768 px o más
- **THEN** los botones siguen midiendo 44 px de alto y los campos siguen con letra de 16 px

### Requirement: Identidad visual existente
Las pantallas SHALL usar únicamente los colores, tipografía, radios e íconos que la
plataforma ya define, y ningún significado SHALL depender solo del color. En una lista, la
etapa de un proceso SHALL mostrarse como dato neutro (punto gris y texto, sin fondo de
color): el color en una fila queda para lo vencido (rojo) y lo de hoy (color de la marca),
siempre acompañado de texto e ícono.

#### Scenario: Resultado de llamada
- **WHEN** se muestra una llamada en la línea de tiempo
- **THEN** su resultado se lee con ícono y texto ("No atendió", "Agendó"…), además del color

#### Scenario: Tarea vencida
- **WHEN** una tarea está vencida
- **THEN** lo dice con texto ("Vencida hace 2 días"), además del color

#### Scenario: Primera llamada de un lead que entró en horario hábil
- **WHEN** la tarea es la primera llamada de una persona sin llamadas, y esa tarea venció en el mismo momento en que la persona se registró (entró en horario hábil)
- **THEN** dice "Espera hace 28 min" con ícono de reloj, contando desde que se registró, y figura en el grupo Vencidas

#### Scenario: Primera llamada de un lead que entró fuera de horario
- **WHEN** la persona se registró fuera de horario, su primera llamada quedó para las 9:00 del día hábil siguiente y esa hora ya pasó
- **THEN** dice "Vencida hace 1 h", contando desde las 9:00 y no desde que se registró, y figura en el grupo Vencidas

#### Scenario: Etapa en una lista
- **WHEN** se muestra un proceso en Coordinada en una fila del CRM o de Contactos
- **THEN** la etapa se ve con un punto gris y el texto "Coordinada", sin fondo azul

#### Scenario: Seguimiento sin movimiento en una fila
- **WHEN** una fila muestra un seguimiento sin movimiento
- **THEN** el tiempo del último contacto va en rojo con un ícono de alerta y el texto "Sin movimiento", no solo en rojo

### Requirement: Anatomía de un evento de la línea de tiempo
Cada evento SHALL mostrar un ícono de su tipo, un título corto que puede ocupar hasta dos
renglones antes que cortarse, quién lo hizo cuando aplica, y la fecha relativa. La fecha y
hora exactas SHALL verse al pasar el cursor o al tocar la fecha; en pantallas táctiles, al
tocar cualquier parte del renglón del evento.

#### Scenario: Llamada registrada ayer
- **WHEN** se mira una llamada registrada ayer a las 10:15
- **THEN** se lee "Llamada 1 · No atendió", el nombre de quien la registró y "ayer", y al tocar la fecha se ve el día y la hora exactos

#### Scenario: Título largo
- **WHEN** el título de un evento no entra en un renglón
- **THEN** pasa a un segundo renglón y no se corta con puntos suspensivos

#### Scenario: Toque en el renglón
- **WHEN** en un celular se toca cualquier parte del renglón de un evento
- **THEN** la fecha relativa cambia por el día y la hora exactos

### Requirement: Campanita
La campanita SHALL vivir en la barra superior en todos los anchos, mostrar la cantidad de
avisos (con "99+" como tope visual) y abrirse como panel en escritorio y como hoja a
pantalla completa en celular. El número SHALL contar solo las tareas vencidas o de ahora
de quien mira, agrupadas en "Vencidas" y "Ahora". Las tareas sin fecha nunca avisan.

#### Scenario: Sin avisos
- **WHEN** no hay tareas que avisar
- **THEN** la campanita no muestra número y al abrirla dice que está todo al día

#### Scenario: Tarea de mañana
- **WHEN** se registra un "No atendió" y se crea la "Llamada 2" para el día hábil siguiente
- **THEN** esa tarea no suma al número y aparece en "Lo que viene", con la aclaración de que avisa a su hora

#### Scenario: Completar desde la campanita
- **WHEN** se toca "Completar" en un aviso
- **THEN** la tarea se completa, el número baja en uno y se ofrece "Deshacer"

#### Scenario: Posponer desde la campanita
- **WHEN** se toca "Posponer" en un aviso
- **THEN** se ofrecen "En 1 hora", "Mañana a las 9:00" y "Elegir día y hora", y al elegir una la tarea deja de contar hasta ese momento

### Requirement: Página de pendientes
La página de tareas SHALL llamarse "Pendientes" y agrupar las tareas en Vencidas, Hoy,
Próximas y Sin fecha, con un resumen de cantidades exactas arriba. Sin fecha SHALL venir
plegado, avisar que esas tareas no suenan en la campanita y ofrecer "Poner fecha".

#### Scenario: Cuatro grupos
- **WHEN** la coordinadora abre Pendientes
- **THEN** ve los grupos Vencidas, Hoy y Próximas abiertos, Sin fecha plegado con su cantidad, y el resumen coincide con la suma de los grupos

#### Scenario: Filtro por tipo
- **WHEN** se mira el filtro de tipo
- **THEN** en escritorio cada tipo es un botón con su cantidad; en celular el filtro es un selector que lista solo los nombres de los tipos, sin cantidad; en los dos casos un tipo sin tareas no se muestra

#### Scenario: Filtro por persona
- **WHEN** la coordinadora o el admin eligen "Mías", una persona o "Todo el equipo"
- **THEN** la lista y el resumen muestran solo las tareas de esa selección

#### Scenario: El asesor ve solo lo suyo
- **WHEN** el asesor abre Pendientes
- **THEN** ve solo sus tareas y no tiene el filtro "De quién"; le queda solo el filtro de tipo

#### Scenario: Celular
- **WHEN** se abre Pendientes a 390 px
- **THEN** los filtros son selectores (dos para la coordinadora y el admin, uno para el asesor) y "Posponer" es un botón de ícono de 44 px con nombre para lectores de pantalla

### Requirement: El Inicio empieza por lo que hay que hacer
El primer bloque del Inicio SHALL ser la lista de cosas para hacer ahora de ese rol, y cada
ítem SHALL poder resolverse o abrirse desde ahí. Los bloques que en otro rol tienen botones
de llamar, registrar o completar SHALL decir "Solo lectura" cuando el rol solo los consulta,
y no ofrecer esos botones.

#### Scenario: Coordinadora en celular
- **WHEN** la coordinadora abre el Inicio en el celular
- **THEN** lo primero que ve, sin desplazarse, es la lista "Para llamar ahora" con un botón de llamar por persona

#### Scenario: Registrar desde el Inicio
- **WHEN** la coordinadora toca "Registrar" en una persona de "Para llamar ahora"
- **THEN** se abre la ficha de esa persona con "Registrar llamada" ya abierto

#### Scenario: Sin respuesta tras WhatsApp
- **WHEN** a una persona ya se la llamó sin éxito y se le marcó el WhatsApp como enviado
- **THEN** figura en el bloque "Sin respuesta tras WhatsApp" del Inicio de la coordinadora, sin tarea, para decidir si se insiste o se cierra

#### Scenario: Asesor
- **WHEN** el asesor abre el Inicio
- **THEN** el primer bloque es "Mis tareas vencidas y de hoy", donde cada tarea se completa con un tilde sin salir del Inicio y debajo hay un sub-bloque "Para mañana" cuando tiene tareas para el día siguiente; lo siguen sus procesos que esperan algo de él y sus visitas y tasaciones de hoy

#### Scenario: Admin o dueño
- **WHEN** el admin abre el Inicio
- **THEN** el primer bloque es "Leads sin primer contacto", y los bloques de coordinación ("Para llamar ahora", "Sin respuesta tras WhatsApp" y "Tareas de hoy · coordinación") aparecen marcados "Solo lectura"

#### Scenario: Espera de un lead sin primer contacto
- **WHEN** el admin mira un lead en "Leads sin primer contacto"
- **THEN** ve cuánto espera contando desde que la persona se registró, en tiempo de reloj y, si difiere, también en horas hábiles ("Espera hace 16 h 20 min de reloj · 1 h 40 min hábiles"), y quién la tiene que llamar; es una cuenta distinta del vencimiento de su tarea, que en "Para llamar ahora" puede decir "Vencida hace 1 h"

#### Scenario: Bloques de la coordinadora después de las listas de llamadas
- **WHEN** la coordinadora baja en el Inicio
- **THEN** después de "Para llamar ahora" y "Sin respuesta tras WhatsApp" ve "Tareas de hoy" (cada tarea se completa con un tilde y hay un sub-bloque "Para mañana" cuando corresponde), "Tasaciones · hoy y mañana" y los números del día: "Solicitudes nuevas", "Llamadas hechas" y "Agendadas"

### Requirement: Toda métrica muestra su base
Toda métrica de tiempo SHALL mostrar la cantidad de casos sobre la que se calculó y separar
el tiempo de reloj del tiempo en horas hábiles. Con menos de 20 casos SHALL avisar que son
pocos.

#### Scenario: Tiempo medio a la primera llamada
- **WHEN** el admin mira "Tiempo medio a la primera llamada" calculado sobre 3 leads
- **THEN** ve las horas hábiles y las horas de reloj por separado, la cantidad de leads y el aviso "Pocos casos"

### Requirement: Piezas aprobadas que se detallan en otros changes
La maqueta aprobada y sus capturas SHALL ser la referencia de las piezas que esta spec solo
nombra. El detalle de cada una vive en las specs de `crm-ficha-y-llamadas`,
`crm-linea-de-tiempo` y `crm-inicio`, que SHALL respetar lo que muestra la maqueta.

#### Scenario: Filtros de la línea de tiempo
- **WHEN** se mira la línea de tiempo de la ficha
- **THEN** arriba hay cuatro filtros: Todo, Llamadas, Notas y Actividad

#### Scenario: Background
- **WHEN** se mira el bloque "Background" de la ficha
- **THEN** ofrece "Editar" si ya tiene texto y "Agregar" si está vacío

#### Scenario: Corregir la hora de una llamada
- **WHEN** se registra una llamada
- **THEN** se ofrece "¿Fue hace un rato? Corregir la hora"; si no se toca, la llamada queda con la hora del momento

#### Scenario: Un solo formulario de nueva tarea
- **WHEN** se crea una tarea desde la ficha o desde Pendientes
- **THEN** se abre el mismo formulario "Nueva tarea", con los mismos cinco tipos: Llamada, Mensaje, Visita, Documentación y Otro

#### Scenario: Tasaciones agendadas en la ficha
- **WHEN** el contacto tiene una tasación agendada
- **THEN** la columna derecha de la ficha muestra el bloque "Tasaciones agendadas"; si no tiene ninguna, el bloque no aparece

### Requirement: Fila de proceso
Toda lista de procesos o de personas del módulo CRM SHALL usar la misma fila: avatar con
iniciales, nombre con un renglón secundario, un tercer renglón opcional con ícono para la
tasación cercana, y las columnas etapa, último contacto, próximo paso y, si la vista lo pide,
asesor. Toda la fila SHALL ser un único enlace, sin botones adentro (con el modo de
selección activo pasa a ser un único botón que la marca), y leerse como tabla cuando entran
las columnas y como tarjeta cuando no.

#### Scenario: Una sola forma de fila
- **WHEN** se comparan las filas del CRM de la coordinación, del asesor, del dueño y de Contactos
- **THEN** usan la misma pieza, con el mismo orden de datos: persona, etapa (o proceso), último contacto, próximo paso y asesor

#### Scenario: Datos de la fila
- **WHEN** se mira una fila
- **THEN** cada dato tiene un texto principal y uno secundario más chico, y la fila termina en una flecha

#### Scenario: Fila en el celular
- **WHEN** se mira una fila a 390 px
- **THEN** se ve como tarjeta, con "Último contacto", "Próximo paso" y "Asesor" escritos a la izquierda de cada dato, sin texto cortado

### Requirement: Barra de etapas
La cantidad de procesos por etapa SHALL mostrarse como una barra chica y secundaria: botones
de texto con el nombre de la etapa y su número, sin fondos de color ni tarjetas, agrupados
bajo una base escrita ("Por etapa", "Embudo de tasación", "Fuera del embudo"). La etapa
elegida SHALL marcarse con un borde y `aria-pressed`, no solo con color.

#### Scenario: Ninguna etapa pesa más que otra
- **WHEN** se mira la barra con "Descartado 472" y "Coordinada 15"
- **THEN** las dos tienen el mismo tamaño y el mismo color de texto, y ninguna tiene fondo de color

### Requirement: Filtros con nombre
Todo filtro de una lista del módulo CRM SHALL llevar su nombre arriba y una opción por defecto
que diga qué abarca. Los filtros puestos SHALL verse como fichas que se sacan de a una, más
"Limpiar filtros". En el celular SHALL quedar a la vista solo el buscador y el resto en la hoja
"Filtros". "Ordenar por" SHALL ir en la cabecera de la lista, no entre los filtros. Pendientes
es la excepción: sigue su maqueta aprobada (botones "Tipo" y "De quién", selectores en celular).

#### Scenario: Opción por defecto con nombre
- **WHEN** se mira un filtro sin elegir nada
- **THEN** dice lo que abarca ("Todas las etapas", "Todos los orígenes", "Todos los asesores", "Cualquier fecha") y nunca solo "Todas" o "Todos"

#### Scenario: Botón de filtros en el celular
- **WHEN** hay dos filtros puestos y se mira la lista a 390 px
- **THEN** el botón "Filtros" muestra un 2

#### Scenario: Ficha de un filtro puesto
- **WHEN** está puesto el origen "Referido"
- **THEN** se ve la ficha "Origen: Referido" con una cruz, y tocarla saca solo ese filtro

#### Scenario: Pendientes
- **WHEN** se mira el filtro de tipo de Pendientes en la compu
- **THEN** son botones "Todas N" y uno por tipo con su cantidad, y en el celular dos selectores ("Todos los tipos" y "De quién"), como en la maqueta aprobada de esa pantalla

### Requirement: Selector de vista
Cuando una pantalla puede mostrarse como la ve otra persona, SHALL tener un selector con
nombre ("Ver como") y, mientras se mira la vista de otra persona, un aviso discreto (borde,
sin fondo de color fuerte) con ícono de ojo que diga de quién es la vista y que es solo para
revisar, con el botón "Volver a mi vista".

#### Scenario: Aviso visible
- **WHEN** se elige otra persona en "Ver como"
- **THEN** arriba de la lista aparece el aviso con su nombre y "Volver a mi vista", y sigue ahí (en su lugar, sin quedar fijo en la pantalla) mientras se cambian los filtros o se pasa de abiertos a cerrados

### Requirement: Pie de las listas largas
Una lista que muestra solo una parte SHALL tener "Cargar 25 más" al final y decir al pie
cuántas muestra y de cuántas ("Mostrando 25 de 493 procesos abiertos"). Una lista larga
(la última de una vista, o la única) SHALL NOT llevar el total en su cabecera; un grupo de
arriba SHALL llevar su número en una burbuja, en estilo de alerta si es un grupo urgente,
aunque también pagine. "Sin fecha" de Pendientes es la excepción: sigue su maqueta.

#### Scenario: Grupo urgente con elementos
- **WHEN** "Sin primer contacto" tiene 2 procesos
- **THEN** su cabecera muestra una burbuja de alerta con el 2

#### Scenario: Sin fecha de Pendientes
- **WHEN** se abre "Sin fecha" con 300 tareas
- **THEN** su cabecera dice "Sin fecha · 300" y al pie hay "Mostrar 25 más · quedan 275", como en la maqueta aprobada
