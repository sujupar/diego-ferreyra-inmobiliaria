# Spec Delta

## Purpose

Define las reglas visuales y de comportamiento que cumplen todas las pantallas del módulo
CRM (ficha de contacto, llamadas, tareas, campanita e Inicio), en celular y en escritorio.

## ADDED Requirements

### Requirement: Diseño aprobado antes de programar
Ninguna pantalla del módulo CRM SHALL programarse sin que el dueño haya aprobado su maqueta
en celular y en escritorio.

#### Scenario: Aprobación registrada
- **WHEN** el dueño aprueba la maqueta
- **THEN** la aprobación queda escrita con fecha en el change, junto con capturas de cada pantalla en 390 px y 1280 px

### Requirement: La ficha se reacomoda según el ancho
La ficha de contacto SHALL mostrar tres columnas (persona, actividad, tareas y procesos)
desde 1280 px, dos columnas entre 768 y 1279 px, y una sola columna con pestañas por debajo
de 768 px, sin desplazamiento horizontal en ningún ancho.

#### Scenario: Escritorio
- **WHEN** se abre la ficha a 1280 px de ancho
- **THEN** se ven a la vez los datos de la persona a la izquierda, el cuadro de nota/llamada con la línea de tiempo al centro, y tareas, tasaciones y procesos a la derecha

#### Scenario: Celular
- **WHEN** se abre la ficha a 390 px de ancho
- **THEN** se ve una cabecera fija con nombre, etapa y botón de llamar, y las pestañas Actividad, Datos y Tareas, sin desplazamiento horizontal

#### Scenario: Tablet
- **WHEN** se abre la ficha a 1024 px de ancho
- **THEN** el contenido de la columna derecha aparece debajo de los datos de la persona y la actividad ocupa la otra columna

### Requirement: Registrar una llamada en pocos toques
En celular, registrar el resultado de una llamada SHALL requerir como máximo tres toques
desde la ficha, sin escribir texto obligatorio.

#### Scenario: No atendió
- **WHEN** en la ficha en celular se toca el botón "+", luego "Registrar llamada", luego el resultado "No atendió"
- **THEN** la llamada queda guardada (el resultado elegido guarda directamente o deja un único botón Guardar ya enfocado) y aparece primera en la línea de tiempo

### Requirement: Nada de adorno
Toda sección, botón o indicador visible SHALL tener datos reales o una acción que funciona.
Una sección sin datos no se muestra, salvo que ofrezca la acción de crear el primero.

#### Scenario: Contacto sin archivos
- **WHEN** un contacto no tiene tasaciones ni propiedades vinculadas
- **THEN** la sección Archivos no aparece

#### Scenario: Contacto sin tareas
- **WHEN** un contacto no tiene tareas pendientes
- **THEN** la sección Tareas muestra solo el botón para crear una

### Requirement: Estados de carga, vacío y error
Cada bloque que trae datos SHALL tener estado de carga, de vacío y de error con reintento,
y nunca mostrar un cero cuando el dato no se pudo consultar.

#### Scenario: Falla una consulta
- **WHEN** un bloque no puede traer sus datos
- **THEN** muestra "No se pudo cargar" con un botón Reintentar, y el resto de la pantalla sigue funcionando

### Requirement: Uso táctil
En celular, todo elemento tocable SHALL medir al menos 44 × 44 px y todo campo de texto
SHALL usar letra de 16 px o más.

#### Scenario: Campo de nota en iPhone
- **WHEN** se toca el campo de nota en un iPhone
- **THEN** la pantalla no hace zoom automático

### Requirement: Identidad visual existente
Las pantallas SHALL usar únicamente los colores, tipografía, radios e íconos que la
plataforma ya define, y ningún significado SHALL depender solo del color.

#### Scenario: Resultado de llamada
- **WHEN** se muestra una llamada en la línea de tiempo
- **THEN** su resultado se lee con ícono y texto ("No atendió", "Agendó"…), además del color

#### Scenario: Tarea vencida
- **WHEN** una tarea está vencida
- **THEN** lo dice con texto ("Vencida hace 2 días"), además del color

### Requirement: Anatomía de un evento de la línea de tiempo
Cada evento SHALL mostrar un ícono de su tipo, un título en una línea, quién lo hizo cuando
aplica, y la fecha relativa con la fecha y hora exactas disponibles al tocar o pasar el cursor.

#### Scenario: Llamada registrada ayer
- **WHEN** se mira una llamada registrada ayer a las 10:15
- **THEN** se lee "Llamada 1 · No atendió", el nombre de quien la registró y "ayer", y al tocar la fecha se ve el día y la hora exactos

### Requirement: Campanita
La campanita SHALL vivir en la barra superior en todos los anchos, mostrar la cantidad de
avisos (con "99+" como tope visual) y abrirse como panel en escritorio y como hoja a
pantalla completa en celular.

#### Scenario: Sin avisos
- **WHEN** no hay tareas que avisar
- **THEN** la campanita no muestra número y al abrirla dice que está todo al día

### Requirement: El Inicio empieza por lo que hay que hacer
El primer bloque del Inicio SHALL ser la lista de cosas para hacer ahora de ese rol, y cada
ítem SHALL poder resolverse o abrirse desde ahí.

#### Scenario: Coordinadora en celular
- **WHEN** la coordinadora abre el Inicio en el celular
- **THEN** lo primero que ve, sin desplazarse, es la lista "Para llamar ahora" con un botón de llamar por persona
