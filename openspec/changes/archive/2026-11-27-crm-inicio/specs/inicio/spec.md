# Spec Delta

## Purpose

Define qué ve cada rol al entrar a la plataforma (el Inicio), de dónde sale cada bloque y
qué se puede resolver desde ahí. La forma visual está en `crm-sistema-diseno` y en la maqueta.

## ADDED Requirements

### Requirement: Un Inicio para cada rol
El Inicio SHALL mostrar bloques según el rol en dos columnas desde 1024 px y en una en el
celular, primero la principal. Coordinación: "Para llamar ahora", "Sin respuesta tras
WhatsApp", "Sin próximo paso"; al costado "Tareas de hoy", "Tasaciones · hoy y mañana" y
"Hoy, hasta las H:MM". Asesor: "Mis tareas…", "Mis procesos…"; al costado "Mis visitas…".
Admin y dueño: "Leads sin primer contacto", "Tiempo medio…" y lo de la coordinación en
"Solo lectura".

#### Scenario: Saludo
- **WHEN** Paula, coordinadora, abre el Inicio un miércoles 25 de noviembre a las 10:40
- **THEN** se lee "Hola, Paula" y "Miércoles 25 de noviembre · 10:40"; el admin y el dueño leen "Inicio · vista del dueño"

#### Scenario: Abogado
- **WHEN** el abogado entra a la plataforma
- **THEN** sigue yendo a la revisión legal, como hoy; si abre el Inicio, ve el de siempre

#### Scenario: Cada bloque por separado
- **WHEN** la lectura de un bloque falla y las demás responden
- **THEN** ese bloque dice "No se pudo cargar" con "Reintentar" y los demás se ven y funcionan; ninguno muestra un vacío o un cero en lugar de un error

### Requirement: Para llamar ahora
"Para llamar ahora" SHALL listar, una vez por persona, las solicitudes abiertas desde el
26/11/2026 sin primer contacto y los procesos de la coordinación con una tarea de llamada
vencida de cualquier coordinadora (también de antes del 26/11). Es una cola única, de la más
vieja a la más nueva por registro, con "Llamar" y "Registrar". "Llamada N" cuenta las
llamadas registradas más uno.

#### Scenario: Fila
- **WHEN** Rubén se registró hace 2 días, ya se lo llamó una vez sin que atienda y su segunda llamada venció hace 1 h
- **THEN** se lee "Rubén Castiglione", "Llamada 2", "Se registró hace 2 días · {propiedad}", "Vencida hace 1 h · Anterior: no atendió, ayer", un botón con el teléfono y "Registrar"

#### Scenario: Lead que espera
- **WHEN** Patricia se registró hace 28 min en horario hábil y nadie la llamó
- **THEN** se lee "Llamada 1" y "Espera hace 28 min"

#### Scenario: Solicitud de antes del registro
- **WHEN** una solicitud se registró el 20/11, nunca se le registró un contacto y no tiene una llamada vencida
- **THEN** no aparece en "Para llamar ahora" (sigue en el CRM, como hoy)

#### Scenario: Llamada de la otra coordinadora
- **WHEN** la llamada vencida de una persona está a nombre de la otra coordinadora
- **THEN** la persona igual aparece en la cola de las dos

#### Scenario: Las dos coordinadoras
- **WHEN** una coordinadora registra la llamada a una persona de la cola
- **THEN** la persona sale de la cola de las dos

#### Scenario: Vacío
- **WHEN** no hay nadie para llamar
- **THEN** se lee "Nadie para llamar ahora" y "Cuando entre una solicitud o venza una llamada, aparece acá."

### Requirement: Registrar abre la ficha con el formulario
"Registrar" SHALL abrir la ficha de la persona con "Registrar llamada" ya abierto: la
pestaña del cuadro en la compu y la hoja en el celular, con el foco en "No atendió".

#### Scenario: Celular
- **WHEN** en el celular se toca "Registrar" en una persona de "Para llamar ahora"
- **THEN** se abre su ficha con la hoja "Registrar llamada" y el foco en "No atendió"

### Requirement: Sin respuesta tras WhatsApp
"Sin respuesta tras WhatsApp" SHALL listar las solicitudes abiertas desde el 26/11 a las que
ya se llamó y se les marcó un WhatsApp en la racha actual, y que no tienen ninguna tarea
pendiente, ni del proceso ni de la persona. Si no hay ninguna, el bloque no se muestra.

#### Scenario: Fila
- **WHEN** a Gustavo se lo llamó dos veces sin que atienda y se le marcó el WhatsApp hace 2 días
- **THEN** se lee "WhatsApp enviado hace 2 días · 2 llamadas sin atender", "Se registró 26 nov · {propiedad}", el teléfono y "Registrar"

#### Scenario: Tiene una tarea
- **WHEN** a esa persona se le agendó una tarea para el viernes
- **THEN** no está en "Sin respuesta tras WhatsApp"

### Requirement: Sin próximo paso
"Sin próximo paso" SHALL listar las solicitudes abiertas desde el 26/11 ya contactadas, sin
WhatsApp en la racha actual y sin ninguna tarea pendiente, con "Sin tarea pendiente · último
contacto hace X · N llamadas". Si no hay ninguna, el bloque no se muestra.

#### Scenario: Llamada sin tarea
- **WHEN** a Sofía se la llamó hace 4 días, el número estaba equivocado y nadie le agendó nada
- **THEN** se lee "Sin tarea pendiente · último contacto hace 4 días · 1 llamada"

### Requirement: Tareas de hoy y para mañana
"Tareas de hoy" (y "Mis tareas vencidas y de hoy" del asesor) SHALL listar las tareas
propias vencidas y de hoy, con tilde para completar y "Deshacer", y debajo "Para mañana · N"
con las de mañana y "Ver todos los pendientes". La coordinación no ve acá las llamadas de los
procesos que ya están en "Para llamar ahora". En la coordinación y el dueño, si no hay
ninguna tarea, el bloque no se muestra.

#### Scenario: Completar sin salir
- **WHEN** el asesor toca el tilde de una tarea en el Inicio
- **THEN** la tarea se completa, sale de la lista, se ofrece "Deshacer" y la campanita se actualiza

#### Scenario: Asesor sin tareas
- **WHEN** el asesor no tiene tareas vencidas ni de hoy
- **THEN** se lee "Todo al día" y "No queda nada vencido ni para hoy."

### Requirement: Tasaciones de hoy y mañana y números del día
"Tasaciones · hoy y mañana" SHALL listar las tasaciones coordinadas para hoy y mañana, sin
colegas, con hora, dirección, persona y asesor (vacío, no se muestra). "Hoy, hasta las H:MM" SHALL mostrar
"Solicitudes nuevas" (del embudo de tasación, de hoy), "Llamadas hechas" (llamadas de hoy sin
anular, por la hora en que ocurrieron) y "Agendadas" (de esas, con "Agendó").

#### Scenario: Números
- **WHEN** hoy entraron 3 solicitudes, se registraron 7 llamadas y 2 terminaron en "Agendó"
- **THEN** se lee 3, 7 y 2

### Requirement: Lo del asesor
"Mis visitas y tasaciones de hoy" SHALL listar las visitas no canceladas de hoy del asesor y
sus tasaciones coordinadas para hoy. "Mis procesos que esperan algo de mí" SHALL listar sus
procesos con tasación pasada sin resultado ("Cargar el resultado de la tasación"), visita de
hace 2 días o más sin entregar ("Entregar la tasación") o entregados hace 5 días o más
("Llamar por la respuesta"), con un botón que abre la ficha.

#### Scenario: Visita sin entregar
- **WHEN** Mirta tuvo la visita hace 4 días y su proceso sigue en "Realizada"
- **THEN** se lee "Entregar la tasación: la visita fue hace 4 días."

#### Scenario: Entregada sin respuesta
- **WHEN** a Jorge se le entregó la tasación hace 6 días y su proceso sigue en "Entregada"
- **THEN** se lee "Llamar por la respuesta: la tasación se entregó hace 6 días."

#### Scenario: Solo lo suyo
- **WHEN** un asesor abre el Inicio
- **THEN** no ve procesos, visitas ni tareas de otro asesor, tampoco por la red

### Requirement: Lo del dueño
"Leads sin primer contacto" SHALL listar las solicitudes desde el 26/11 sin primer contacto,
con "Espera hace X de reloj · Y hábiles · la llama la coordinación". "Tiempo medio a la
primera llamada" SHALL promediar, para los leads registrados desde el lunes (y desde el 26/11),
el tiempo hasta su primera llamada en horas de reloj y hábiles (lunes a viernes de 9 a 18),
con la cantidad de leads, "Pocos casos" debajo de 20 y cuántos siguen sin llamar.

#### Scenario: Pocos casos
- **WHEN** desde el lunes 3 leads recibieron su primera llamada y 2 siguen sin llamar
- **THEN** se leen los dos promedios con "3 leads", el aviso "Pocos casos" y "Otros 2 todavía sin llamar no entran en el promedio."

#### Scenario: Sin datos
- **WHEN** ningún lead de la semana recibió todavía su primera llamada
- **THEN** se lee "Todavía sin datos esta semana"

#### Scenario: Solo lectura
- **WHEN** el dueño mira "Para llamar ahora"
- **THEN** el bloque dice "Solo lectura", no tiene botones y muestra el teléfono como texto

### Requirement: Se conserva el aviso de consultas sin propiedad
El Inicio de la coordinación, el admin y el dueño SHALL seguir mostrando arriba el aviso
"N avisos sin propiedad" con "Resolver", como hoy.

#### Scenario: Con avisos
- **WHEN** hay 2 consultas sin propiedad
- **THEN** arriba del Inicio se lee "2 avisos sin propiedad" con "Resolver"
