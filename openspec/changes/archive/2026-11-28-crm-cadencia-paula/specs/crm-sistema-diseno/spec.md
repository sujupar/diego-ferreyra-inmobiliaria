# Spec Delta

## MODIFIED Requirements

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
- **WHEN** la persona se registró fuera de horario, su primera llamada quedó para las 10:00 del día hábil siguiente y esa hora ya pasó
- **THEN** dice "Vencida hace 1 h", contando desde las 10:00 y no desde que se registró, y figura en el grupo Vencidas

#### Scenario: Etapa en una lista
- **WHEN** se muestra un proceso en Coordinada en una fila del CRM o de Contactos
- **THEN** la etapa se ve con un punto gris y el texto "Coordinada", sin fondo azul

#### Scenario: Seguimiento sin movimiento en una fila
- **WHEN** una fila muestra un seguimiento sin movimiento
- **THEN** el tiempo del último contacto va en rojo con un ícono de alerta y el texto "Sin movimiento", no solo en rojo

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
- **THEN** se piden día y hora futuros, con tres atajos ("Hoy 13:30", "Mañana 10:00", "Mañana 13:00", dentro del horario de la coordinación), y sin ellos no se puede guardar

#### Scenario: Marcar WhatsApp enviado
- **WHEN** se toca "Marcar WhatsApp enviado"
- **THEN** queda anotado en la línea de tiempo y el texto aclara que la plataforma no envía ningún mensaje
